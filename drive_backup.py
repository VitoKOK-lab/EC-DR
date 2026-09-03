#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Google Drive 檔案庫／備份 — 掃描、索引、關鍵字搜尋、異動偵測、本地留底。
純 Python 標準函式庫，無第三方依賴。

設計重點
--------
1. 索引存 data/drive_index.json，**刻意不放進 db.json**：
   db.json 每次寫入都會整檔重寫並複製一份備份，數萬筆檔案索引塞進去
   會把排程系統本身拖慢。兩者各自獨立鎖、獨立寫。

2. 異動偵測用 (檔案大小, 修改時間)，不算雜湊。影片動輒數 GB，
   每次掃描重算雜湊不切實際。這和 rsync 的預設判準相同，
   足以抓到「重新輸出覆蓋」「改完存檔」這類實際會發生的情況。

3. 掃描只呼叫 os.stat()，不讀檔案內容。所以 Google Drive 桌面版
   在「串流」模式下未下載的檔案不會因為掃描而被觸發下載；
   只有真的要複製留底時才會下載。

4. 複製一律先寫 .part 再 os.replace()，中途斷掉不會留下半截的假檔案。
"""

import os
import json
import shutil
import fnmatch
import threading
import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
INDEX_PATH = os.path.join(DATA_DIR, "drive_index.json")

_ILOCK = threading.RLock()      # 索引檔的鎖（與 server.py 的 db 鎖無關）
_RUN_LOCK = threading.Lock()    # 同時間只允許一個掃描／備份工作

GB = 1024 ** 3

# 一律跳過的雜訊：系統檔、Drive 下載暫存、垃圾桶
DEFAULT_EXCLUDES = [
    ".DS_Store", "._*", ".Trash", ".Trashes", "#recycle",
    "desktop.ini", "Icon\r", "*.tmp.drivedownload", "*.crdownload",
    ".git", "node_modules", "*.part",
]

EXT_KIND = {}
for _ext, _kind in [
    ("mp4 mov avi mkv m4v wmv flv webm mpg mpeg m2ts mts", "video"),
    ("jpg jpeg png gif webp heic heif tif tiff bmp svg", "image"),
    ("psd ai indd sketch fig xd", "design"),
    ("prproj aep drp veg fcpbundle camproj kdenlive", "project"),
    ("mp3 wav aac m4a flac aif aiff ogg", "audio"),
    ("pdf doc docx xls xlsx ppt pptx txt md csv rtf pages numbers key", "doc"),
    ("zip rar 7z tar gz dmg", "archive"),
]:
    for _e in _ext.split():
        EXT_KIND[_e] = _kind

KIND_LABEL = {
    "video": "影片", "image": "圖片", "design": "設計檔", "project": "剪輯專案",
    "audio": "音檔", "doc": "文件", "archive": "壓縮檔", "other": "其他",
}


# ---------------------------------------------------------------------------
# 小工具
# ---------------------------------------------------------------------------
def now_iso():
    return datetime.datetime.now().isoformat(timespec="seconds")


def _kind_of(name):
    ext = os.path.splitext(name)[1].lower().lstrip(".")
    return EXT_KIND.get(ext, "other")


def _safe_label(label):
    """把來源標籤變成安全的資料夾名稱（不含路徑分隔符）。"""
    out = "".join(c for c in str(label or "") if c not in "/\\:\0").strip()
    return out or "drive"


def _is_excluded(name, patterns):
    return any(fnmatch.fnmatch(name, p) for p in patterns)


def _is_placeholder(st):
    """
    判斷是不是 Google Drive 串流模式下「還沒下載到本機」的佔位檔。
    佔位檔 stat 會回報真實大小，但實際佔用的磁碟區塊接近 0。
    st_blocks 在非 POSIX 平台不存在，取不到就當作已下載。
    """
    blocks = getattr(st, "st_blocks", None)
    if blocks is None or st.st_size <= 0:
        return False
    return (blocks * 512) < (st.st_size * 0.5)


def human_size(n):
    n = float(n or 0)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return ("%.0f %s" % (n, unit)) if unit == "B" else ("%.1f %s" % (n, unit))
        n /= 1024
    return "%.1f TB" % n


# ---------------------------------------------------------------------------
# 索引讀寫
# ---------------------------------------------------------------------------
def empty_index():
    return {"files": {}, "runs": [], "lastRun": None, "version": 1}


def load_index():
    with _ILOCK:
        if not os.path.exists(INDEX_PATH):
            return empty_index()
        try:
            with open(INDEX_PATH, "r", encoding="utf-8") as fh:
                idx = json.load(fh)
            idx.setdefault("files", {})
            idx.setdefault("runs", [])
            idx.setdefault("lastRun", None)
            return idx
        except Exception as e:
            print("[檔案庫警告] 索引損毀，改用空索引重建：%s" % e)
            return empty_index()


def save_index(idx):
    with _ILOCK:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = INDEX_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(idx, fh, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, INDEX_PATH)


# ---------------------------------------------------------------------------
# 設定
# ---------------------------------------------------------------------------
def get_config(settings):
    """從 db.json 的 settings 取出檔案庫設定，補上預設值。"""
    s = settings or {}
    roots = []
    for r in (s.get("driveRoots") or []):
        path = (r.get("path") or "").strip()
        if not path:
            continue
        roots.append({
            "label": _safe_label(r.get("label") or os.path.basename(path.rstrip("/")) or "drive"),
            "path": os.path.expanduser(path),
        })
    excludes = s.get("driveExcludes")
    if not isinstance(excludes, list) or not excludes:
        excludes = list(DEFAULT_EXCLUDES)
    return {
        "roots": roots,
        "backupDir": os.path.expanduser((s.get("driveBackupDir") or "").strip()),
        "quotaGB": float(s.get("driveQuotaGB") or 0),
        "freeMarginGB": float(s.get("driveFreeMarginGB") or 20),
        "autoEnabled": bool(s.get("driveAutoEnabled")),
        "scanTime": (s.get("driveScanTime") or "03:00").strip(),
        "excludes": excludes,
        "copyEnabled": bool(s.get("driveCopyEnabled", True)),
    }


# ---------------------------------------------------------------------------
# 進度回報（給前端輪詢）
# ---------------------------------------------------------------------------
_PROGRESS = {"running": False, "phase": "idle", "message": "尚未執行", "done": 0,
             "total": 0, "bytesDone": 0, "bytesTotal": 0, "startedAt": None,
             "currentFile": ""}


def progress():
    with _ILOCK:
        return dict(_PROGRESS)


def _set_progress(**kw):
    with _ILOCK:
        _PROGRESS.update(kw)


# ---------------------------------------------------------------------------
# 掃描：走訪來源資料夾，比對索引，標出新增／異動／消失
# ---------------------------------------------------------------------------
def scan(config, idx, scan_id):
    """
    走訪所有來源，更新 idx["files"]。回傳本次掃描摘要。
    只做 os.stat，不讀內容、不複製。
    """
    files = idx["files"]
    seen = set()
    excludes = config["excludes"]
    counts = {"new": 0, "modified": 0, "unchanged": 0, "missing": 0,
              "placeholder": 0, "scanned": 0, "bytes": 0}
    errors = []

    for root in config["roots"]:
        base = root["path"]
        label = root["label"]
        if not os.path.isdir(base):
            errors.append("來源資料夾不存在或無法讀取：%s" % base)
            continue
        for dirpath, dirnames, filenames in os.walk(base, onerror=lambda e: errors.append(str(e))):
            dirnames[:] = [d for d in dirnames if not _is_excluded(d, excludes)]
            for fn in filenames:
                if _is_excluded(fn, excludes):
                    continue
                full = os.path.join(dirpath, fn)
                try:
                    st = os.stat(full)
                except OSError as e:
                    errors.append("%s：%s" % (full, e))
                    continue
                if not os.path.isfile(full):
                    continue
                rel = os.path.relpath(full, base).replace(os.sep, "/")
                key = "%s/%s" % (label, rel)
                seen.add(key)
                counts["scanned"] += 1
                counts["bytes"] += st.st_size
                ph = _is_placeholder(st)
                if ph:
                    counts["placeholder"] += 1

                rec = files.get(key)
                if rec is None:
                    files[key] = {
                        "key": key, "root": label, "rel": rel, "name": fn,
                        "dir": os.path.dirname(rel), "abs": full,
                        "size": st.st_size, "mtime": st.st_mtime,
                        "kind": _kind_of(fn), "placeholder": ph,
                        "firstSeen": now_iso(), "changedAt": now_iso(),
                        "missing": False, "missingSince": "",
                        "backup": None, "tags": [], "videoId": "", "productId": "",
                        "note": "", "lastEvent": {"kind": "new", "scanId": scan_id},
                    }
                    counts["new"] += 1
                else:
                    changed = (rec.get("size") != st.st_size
                               or abs(float(rec.get("mtime") or 0) - st.st_mtime) > 1.0)
                    rec["abs"] = full
                    rec["name"] = fn
                    rec["dir"] = os.path.dirname(rel)
                    rec["kind"] = _kind_of(fn)
                    rec["placeholder"] = ph
                    if rec.get("missing"):
                        # 之前不見了，現在又出現（可能從垃圾桶還原、或重新同步下來）
                        rec["missing"] = False
                        rec["missingSince"] = ""
                        changed = True
                    if changed:
                        rec["size"] = st.st_size
                        rec["mtime"] = st.st_mtime
                        rec["changedAt"] = now_iso()
                        rec["lastEvent"] = {"kind": "modified", "scanId": scan_id}
                        counts["modified"] += 1
                    else:
                        counts["unchanged"] += 1

    # 索引裡有、但這次沒掃到 → Drive 上被刪或被搬走
    if config["roots"]:
        active_labels = {r["label"] for r in config["roots"]
                         if os.path.isdir(r["path"])}
        for key, rec in files.items():
            if key in seen or rec.get("missing"):
                continue
            if rec.get("root") not in active_labels:
                continue  # 該來源這次沒掃（資料夾不在），不能斷定檔案消失
            rec["missing"] = True
            rec["missingSince"] = now_iso()
            rec["lastEvent"] = {"kind": "missing", "scanId": scan_id}
            counts["missing"] += 1

    counts["errors"] = errors[:50]
    # 第一次建索引：全部都是「新發現」，不代表 Drive 上真的多了這麼多新檔
    counts["firstBuild"] = (counts["scanned"] > 0
                            and counts["new"] == counts["scanned"]
                            and counts["modified"] == 0)
    return counts


# ---------------------------------------------------------------------------
# 備份狀態判定
# ---------------------------------------------------------------------------
def backup_status(rec):
    """
    never   從沒備份過
    stale   備份過，但來源之後又改了（備份是舊版）
    ok      備份與來源一致
    rescued 來源已消失，但本地還留著一份（最有價值的狀態）
    """
    b = rec.get("backup")
    if not b:
        return "rescued_none" if rec.get("missing") else "never"
    same = (b.get("size") == rec.get("size")
            and abs(float(b.get("mtime") or 0) - float(rec.get("mtime") or 0)) <= 1.0)
    if rec.get("missing"):
        return "rescued"
    return "ok" if same else "stale"


STATUS_LABEL = {
    "never": "未備份", "stale": "有新版待備份", "ok": "已備份",
    "rescued": "來源已刪，本地留底", "rescued_none": "來源已刪且無備份",
}


# ---------------------------------------------------------------------------
# 複製留底
# ---------------------------------------------------------------------------
_USAGE_CACHE = {"dir": None, "bytes": 0, "at": 0.0}
_USAGE_TTL = 120.0  # 秒


def _dest_usage(dest_dir, force=False):
    """
    實際走訪留底資料夾算出已用容量（只 stat，不讀內容）。
    前端每幾秒就會輪詢一次狀態，而留底資料夾可能有數萬個檔案，
    所以結果快取 120 秒；備份跑完會強制重算。
    """
    if not dest_dir or not os.path.isdir(dest_dir):
        return 0
    import time
    now = time.time()
    if (not force and _USAGE_CACHE["dir"] == dest_dir
            and (now - _USAGE_CACHE["at"]) < _USAGE_TTL):
        return _USAGE_CACHE["bytes"]
    total = 0
    for dirpath, _dirnames, filenames in os.walk(dest_dir):
        for fn in filenames:
            try:
                total += os.stat(os.path.join(dirpath, fn)).st_size
            except OSError:
                pass
    _USAGE_CACHE.update({"dir": dest_dir, "bytes": total, "at": now})
    return total


def copy_pending(config, idx, scan_id):
    """
    把需要備份的檔案複製到本地留底資料夾。
    優先順序：最近變動的先備（新成品先保住）。
    撞到容量上限或磁碟空間不足就停下並告警，**絕不自動刪除任何東西**。
    """
    dest = config["backupDir"]
    result = {"copied": 0, "copiedBytes": 0, "failed": 0, "skipped": 0,
              "stoppedByQuota": False, "stoppedByDisk": False,
              "pendingLeft": 0, "pendingLeftBytes": 0, "errors": []}
    if not dest:
        result["errors"].append("尚未設定「本地留底資料夾」，這次只做掃描與索引，沒有複製任何檔案。")
        return result
    try:
        os.makedirs(dest, exist_ok=True)
    except OSError as e:
        result["errors"].append("無法建立留底資料夾 %s：%s" % (dest, e))
        return result

    pending = [r for r in idx["files"].values()
               if not r.get("missing") and backup_status(r) in ("never", "stale")]
    pending.sort(key=lambda r: float(r.get("mtime") or 0), reverse=True)

    used = _dest_usage(dest, force=True)
    quota_bytes = config["quotaGB"] * GB if config["quotaGB"] > 0 else 0
    margin_bytes = config["freeMarginGB"] * GB

    total_bytes = sum(int(r.get("size") or 0) for r in pending)
    _set_progress(phase="copy", total=len(pending), done=0,
                  bytesTotal=total_bytes, bytesDone=0,
                  message="開始複製留底，共 %d 個檔案（%s）" % (len(pending), human_size(total_bytes)))

    for i, rec in enumerate(pending):
        size = int(rec.get("size") or 0)

        if quota_bytes and (used + size) > quota_bytes:
            result["stoppedByQuota"] = True
            break
        try:
            free = shutil.disk_usage(dest).free
        except OSError:
            free = None
        if free is not None and (free - size) < margin_bytes:
            result["stoppedByDisk"] = True
            break

        src = rec.get("abs") or ""
        dst = os.path.join(dest, rec["root"], *rec["rel"].split("/"))
        _set_progress(done=i, bytesDone=result["copiedBytes"],
                      currentFile=rec.get("name", ""),
                      message="複製中：%s" % rec.get("name", ""))
        try:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            tmp = dst + ".part"
            # 串流模式未下載的檔案，copy2 這一步才會真的觸發下載
            shutil.copy2(src, tmp)
            os.replace(tmp, dst)
            st = os.stat(dst)
            rec["backup"] = {"at": now_iso(), "size": st.st_size,
                             "mtime": float(rec.get("mtime") or st.st_mtime),
                             "path": dst}
            result["copied"] += 1
            result["copiedBytes"] += size
            used += size
        except Exception as e:
            result["failed"] += 1
            if len(result["errors"]) < 50:
                result["errors"].append("%s：%s" % (rec.get("rel", src), e))
            try:
                if os.path.exists(dst + ".part"):
                    os.remove(dst + ".part")
            except OSError:
                pass

    left = [r for r in idx["files"].values()
            if not r.get("missing") and backup_status(r) in ("never", "stale")]
    result["pendingLeft"] = len(left)
    result["pendingLeftBytes"] = sum(int(r.get("size") or 0) for r in left)
    result["usedBytes"] = used
    import time
    _USAGE_CACHE.update({"dir": dest, "bytes": used, "at": time.time()})
    return result


# ---------------------------------------------------------------------------
# 一次完整工作：掃描（＋複製）
# ---------------------------------------------------------------------------
def run_job(config, do_copy, trigger="manual", user=""):
    if not _RUN_LOCK.acquire(blocking=False):
        return {"ok": False, "error": "已有一個掃描／備份正在進行中，請等它跑完。"}
    scan_id = now_iso()
    started = datetime.datetime.now()
    try:
        _set_progress(running=True, phase="scan", startedAt=scan_id, done=0, total=0,
                      bytesDone=0, bytesTotal=0, currentFile="",
                      message="掃描來源資料夾中…")
        idx = load_index()
        if not config["roots"]:
            _set_progress(running=False, phase="idle",
                          message="尚未設定 Google Drive 同步資料夾，無法掃描。")
            return {"ok": False, "error": "尚未設定 Google Drive 同步資料夾。請到「設定」填入路徑。"}

        counts = scan(config, idx, scan_id)
        copy_result = None
        if do_copy and config["copyEnabled"]:
            copy_result = copy_pending(config, idx, scan_id)

        elapsed = (datetime.datetime.now() - started).total_seconds()
        run = {
            "scanId": scan_id, "trigger": trigger, "user": user,
            "finishedAt": now_iso(), "elapsedSec": round(elapsed, 1),
            "scan": counts, "copy": copy_result,
        }
        idx["lastRun"] = run
        idx["runs"] = ([run] + idx.get("runs", []))[:30]
        save_index(idx)

        msg = "完成：掃描 %d 個檔案（新增 %d、異動 %d、消失 %d）" % (
            counts["scanned"], counts["new"], counts["modified"], counts["missing"])
        if copy_result:
            msg += "；複製 %d 個（%s）" % (copy_result["copied"], human_size(copy_result["copiedBytes"]))
            if copy_result["stoppedByQuota"]:
                msg += "；⚠️ 已達容量上限而停止，還有 %d 個未備份" % copy_result["pendingLeft"]
            if copy_result["stoppedByDisk"]:
                msg += "；⚠️ 磁碟空間不足而停止，還有 %d 個未備份" % copy_result["pendingLeft"]
        _set_progress(running=False, phase="idle", message=msg, currentFile="")
        return {"ok": True, "run": run}
    except Exception as e:
        _set_progress(running=False, phase="idle", message="執行失敗：%s" % e)
        return {"ok": False, "error": str(e)}
    finally:
        _RUN_LOCK.release()


def run_job_async(config, do_copy, trigger="manual", user=""):
    if _PROGRESS.get("running"):
        return {"ok": False, "error": "已有一個掃描／備份正在進行中，請等它跑完。"}
    t = threading.Thread(target=run_job, args=(config, do_copy, trigger, user), daemon=True)
    t.start()
    return {"ok": True, "started": True,
            "message": "已在背景開始%s，可以離開這頁，進度會自己更新。" % ("備份" if do_copy else "掃描")}


# ---------------------------------------------------------------------------
# 搜尋
# ---------------------------------------------------------------------------
def _lk(lookup, _id, field):
    """對照表的值是 {"name": 顯示名, "search": 可搜文字}。"""
    entry = lookup.get(_id or "")
    if not entry:
        return ""
    return entry.get(field, "") if isinstance(entry, dict) else str(entry)


def _haystack(rec, vlookup, plookup):
    """
    搜尋比對範圍：路徑、檔名、標籤、備註，
    再加上關聯的 EC-DR 影片與商品的可搜文字（含商品關鍵字）。
    所以搜「幸運鑰匙」也找得到檔名只寫「泰文版」的那支片。
    """
    parts = [rec.get("rel", ""), rec.get("name", ""), rec.get("root", ""),
             " ".join(rec.get("tags") or []), rec.get("note", ""),
             _lk(vlookup, rec.get("videoId"), "search"),
             _lk(plookup, rec.get("productId"), "search")]
    return " ".join(p for p in parts if p).lower()


def search(idx, params, vlookup=None, plookup=None):
    """
    多關鍵字 AND：以空白切開，每個關鍵字都要出現在
    檔名／路徑／標籤／備註／關聯影片名／關聯商品名 任一處。
    """
    vlookup = vlookup or {}
    plookup = plookup or {}
    q = (params.get("q") or "").strip().lower()
    tokens = [t for t in q.split() if t]
    kind = params.get("kind") or ""
    status = params.get("status") or ""
    event = params.get("event") or ""
    video_id = params.get("videoId") or ""
    product_id = params.get("productId") or ""
    days = int(params.get("days") or 0)
    limit = max(1, min(int(params.get("limit") or 100), 500))
    offset = max(0, int(params.get("offset") or 0))
    sort = params.get("sort") or "mtime"

    # days 一律用「檔案本身的修改時間」判斷，不是「我們第一次掃到它的時間」。
    # 否則第一次建索引會把幾萬個陳年老檔全部標成「最近新增」，清單就沒用了。
    cutoff_ts = None
    if days > 0:
        cutoff_ts = (datetime.datetime.now() - datetime.timedelta(days=days)).timestamp()
    latest_scan = (idx.get("lastRun") or {}).get("scanId")

    hits = []
    for rec in idx["files"].values():
        if kind and rec.get("kind") != kind:
            continue
        st = backup_status(rec)
        if status and st != status:
            continue
        if event:
            ev = rec.get("lastEvent") or {}
            if event == "latest":
                if not latest_scan or ev.get("scanId") != latest_scan:
                    continue
            elif ev.get("kind") != event:
                continue
        if video_id and rec.get("videoId") != video_id:
            continue
        if product_id and rec.get("productId") != product_id:
            continue
        if cutoff_ts and float(rec.get("mtime") or 0) < cutoff_ts:
            continue
        if tokens:
            hay = _haystack(rec, vlookup, plookup)
            if not all(t in hay for t in tokens):
                continue
        hits.append(rec)

    if sort == "size":
        hits.sort(key=lambda r: int(r.get("size") or 0), reverse=True)
    elif sort == "name":
        hits.sort(key=lambda r: r.get("name", "").lower())
    else:
        hits.sort(key=lambda r: float(r.get("mtime") or 0), reverse=True)

    page = hits[offset:offset + limit]
    return {
        "total": len(hits),
        "offset": offset,
        "limit": limit,
        "totalBytes": sum(int(r.get("size") or 0) for r in hits),
        "items": [_public_rec(r, vlookup, plookup) for r in page],
    }


def _public_rec(rec, vlookup, plookup):
    st = backup_status(rec)
    return {
        "key": rec.get("key"), "name": rec.get("name"), "rel": rec.get("rel"),
        "dir": rec.get("dir"), "root": rec.get("root"), "abs": rec.get("abs"),
        "size": rec.get("size"), "sizeText": human_size(rec.get("size")),
        "mtime": rec.get("mtime"),
        "mtimeText": datetime.datetime.fromtimestamp(
            float(rec.get("mtime") or 0)).strftime("%Y-%m-%d %H:%M") if rec.get("mtime") else "",
        "kind": rec.get("kind"), "kindLabel": KIND_LABEL.get(rec.get("kind"), "其他"),
        "placeholder": rec.get("placeholder", False),
        "missing": rec.get("missing", False),
        "missingSince": rec.get("missingSince", ""),
        "firstSeen": rec.get("firstSeen", ""), "changedAt": rec.get("changedAt", ""),
        "backupStatus": st, "backupStatusLabel": STATUS_LABEL.get(st, st),
        "backupAt": (rec.get("backup") or {}).get("at", ""),
        "tags": rec.get("tags") or [], "note": rec.get("note", ""),
        "videoId": rec.get("videoId", ""), "productId": rec.get("productId", ""),
        "videoName": _lk(vlookup, rec.get("videoId"), "name"),
        "productName": _lk(plookup, rec.get("productId"), "name"),
        "lastEvent": rec.get("lastEvent") or {},
    }


# ---------------------------------------------------------------------------
# 統計總覽
# ---------------------------------------------------------------------------
def stats(idx, config):
    files = idx["files"]
    out = {
        "totalFiles": 0, "totalBytes": 0,
        "byStatus": {"never": 0, "stale": 0, "ok": 0, "rescued": 0, "rescued_none": 0},
        "byKind": {}, "pendingBytes": 0, "placeholders": 0,
        "missing": 0, "newLatest": 0, "modifiedLatest": 0, "recent7": 0,
    }
    latest_scan = (idx.get("lastRun") or {}).get("scanId")
    cutoff7 = (datetime.datetime.now() - datetime.timedelta(days=7)).timestamp()
    for rec in files.values():
        out["totalFiles"] += 1
        size = int(rec.get("size") or 0)
        out["totalBytes"] += size
        st = backup_status(rec)
        out["byStatus"][st] = out["byStatus"].get(st, 0) + 1
        if st in ("never", "stale") and not rec.get("missing"):
            out["pendingBytes"] += size
        k = rec.get("kind", "other")
        out["byKind"][k] = out["byKind"].get(k, 0) + 1
        if rec.get("placeholder"):
            out["placeholders"] += 1
        if rec.get("missing"):
            out["missing"] += 1
        elif float(rec.get("mtime") or 0) >= cutoff7:
            out["recent7"] += 1
        ev = rec.get("lastEvent") or {}
        if latest_scan and ev.get("scanId") == latest_scan:
            if ev.get("kind") == "new":
                out["newLatest"] += 1
            elif ev.get("kind") == "modified":
                out["modifiedLatest"] += 1

    dest = config["backupDir"]
    used = _dest_usage(dest) if dest else 0
    quota_bytes = config["quotaGB"] * GB if config["quotaGB"] > 0 else 0
    out["backupUsedBytes"] = used
    out["backupUsedText"] = human_size(used)
    out["quotaBytes"] = quota_bytes
    out["quotaText"] = human_size(quota_bytes) if quota_bytes else "未設上限"
    out["quotaPct"] = round(used / quota_bytes * 100, 1) if quota_bytes else 0
    out["pendingText"] = human_size(out["pendingBytes"])
    out["totalText"] = human_size(out["totalBytes"])
    try:
        if dest and os.path.isdir(dest):
            du = shutil.disk_usage(dest)
            out["diskFreeBytes"] = du.free
            out["diskFreeText"] = human_size(du.free)
    except OSError:
        pass
    return out


# ---------------------------------------------------------------------------
# 單一檔案的人工註記（標籤、關聯 EC-DR 影片／商品、備註）
# ---------------------------------------------------------------------------
def update_meta(key, patch):
    with _ILOCK:
        idx = load_index()
        rec = idx["files"].get(key)
        if not rec:
            return None
        if "tags" in patch:
            tags = patch["tags"]
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.replace("，", ",").split(",")]
            rec["tags"] = [t for t in (tags or []) if t][:20]
        for f in ("videoId", "productId", "note"):
            if f in patch:
                rec[f] = str(patch[f] or "")[:500]
        save_index(idx)
        return rec


def all_tags(idx):
    counter = {}
    for rec in idx["files"].values():
        for t in rec.get("tags") or []:
            counter[t] = counter.get(t, 0) + 1
    return sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))


# ---------------------------------------------------------------------------
# 排程：每天固定時間自動跑一次
# ---------------------------------------------------------------------------
def start_scheduler(get_settings):
    """
    背景執行緒，每 60 秒檢查一次：
    今天還沒跑過，而且已經過了設定的時間 → 自動執行一次完整備份。
    """
    def loop():
        while True:
            try:
                cfg = get_config(get_settings())
                if cfg["autoEnabled"] and cfg["roots"]:
                    hh, _, mm = cfg["scanTime"].partition(":")
                    try:
                        target = datetime.time(int(hh), int(mm or 0))
                    except ValueError:
                        target = datetime.time(3, 0)
                    now = datetime.datetime.now()
                    idx = load_index()
                    last = (idx.get("lastRun") or {}).get("scanId", "")
                    ran_today = last[:10] == now.date().isoformat()
                    if not ran_today and now.time() >= target and not _PROGRESS.get("running"):
                        print("[檔案庫] 每日自動備份啟動（%s）" % now.isoformat(timespec="seconds"))
                        run_job(cfg, do_copy=True, trigger="auto", user="排程")
            except Exception as e:
                print("[檔案庫排程警告] %s" % e)
            _sleep(60)

    t = threading.Thread(target=loop, daemon=True)
    t.start()
    return t


def _sleep(sec):
    ev = threading.Event()
    ev.wait(sec)
