#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Google Drive 盤點工具（唯讀）— 在備份之前，先量清楚要備什麼。

這支程式**只讀不寫**：
  - 不下載任何檔案內容，只取檔案清單與屬性（名稱、大小、修改時間、擁有者）
  - 不新增、不修改、不刪除 Drive 上的任何東西
  - 產出一份報告與一份 JSON 明細，都存在本機

用途：算出指定資料夾底下到底有多少檔案、多大、誰擁有、哪些需要特殊處理，
      再回頭決定備份範圍與硬碟需求。

用法：
    python3 tools/drive_audit.py <資料夾ID或網址>
    python3 tools/drive_audit.py <資料夾ID> --json 明細.json
    python3 tools/drive_audit.py <資料夾ID> --max-depth 3

第一次執行會開瀏覽器要你授權（唯讀權限），之後會記住。
憑證檔預設放在 ~/.ecdr-drive/ ，權限 600，**絕對不要放進 git**。
"""

import os
import sys
import json
import time
import shutil
import argparse
import datetime
import re
from collections import defaultdict, Counter

CONF_DIR = os.path.expanduser("~/.ecdr-drive")
CRED_PATH = os.path.join(CONF_DIR, "credentials.json")
TOKEN_PATH = os.path.join(CONF_DIR, "token.json")
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

GB = 1024 ** 3

SETUP_HELP = """
────────────────────────────────────────────────────────────────
第一次使用要先拿一組 Google API 憑證（一次性，約 10 分鐘）
────────────────────────────────────────────────────────────────
※ Google 在 2025 年把「OAuth 同意畫面」這個選單拿掉了，
   改成「Google 驗證平台」，分成「品牌／目標對象／用戶端」三個分頁。
   下面用的是新版介面，並且直接給網址，不用在選單裡找。

1. 建專案
   開 https://console.cloud.google.com/
   最上面那排的專案選單 →「新增專案」→ 名稱打 ecdr-backup → 建立
   建好之後記得把上面的專案切換成它

2. 啟用 Drive API
   開 https://console.cloud.google.com/apis/library/drive.googleapis.com
   確認上方專案是 ecdr-backup → 按「啟用」

3. 設定驗證平台
   開 https://console.cloud.google.com/auth/overview
   會看到「Google Auth Platform 尚未設定」→ 按「開始使用」
   接著是一頁四段的表單：

     ① 應用程式資訊  應用程式名稱：EC-DR 備份
                     使用者支援電子郵件：選你自己的信箱
     ② 目標對象      ★ 選「外部」★  ← 你要找的「外部」在這一段，
                     不在第一步。個人 Gmail 帳號只有這個選項可選。
     ③ 聯絡資訊      填你自己的信箱
     ④ 完成          勾同意條款 → 建立

4. ★★ 發布到正式版，這一步不能跳過 ★★
   開 https://console.cloud.google.com/auth/audience
   找到「發布狀態：測試中」→ 按「發布應用程式」→ 確認

   為什麼一定要做：狀態停在「測試中」的話，
   **Google 會在 7 天後讓授權失效**，你每個禮拜都得重新授權一次，
   定期備份等於廢掉。發布到「正式版」之後才會長期有效。

   它會問要不要送出驗證 —— 不用送。自己用、100 人以內不需要驗證。

5. 建立憑證
   開 https://console.cloud.google.com/auth/clients
   →「+ 建立用戶端」
   - 應用程式類型選「桌面應用程式」
   - 名稱隨便填 → 建立
   - 建好後在清單裡點它 → 右上角「下載 JSON」

6. 把下載到的 JSON 放到這個位置（檔名要一模一樣）：
       %s

   終端機做法：
       mkdir -p %s
       mv ~/Downloads/client_secret_*.json %s
       chmod 600 %s

7. 再跑一次這支程式，瀏覽器會跳出來要你授權。

   會看到「Google 尚未驗證這個應用程式」的警告 —— 這是正常的，
   因為這是你自己建的私人應用程式，沒有送給 Google 審核。
   點「進階」→「前往 EC-DR 備份（不安全）」→ 選你的帳號 → 允許。
────────────────────────────────────────────────────────────────
""" % (CRED_PATH, CONF_DIR, CRED_PATH, CRED_PATH)

DEPS_HELP = """
缺少 Google API 套件。在終端機執行這一行安裝（只需一次）：

    python3 -m pip install --user --upgrade \\
        google-api-python-client google-auth-httplib2 google-auth-oauthlib

裝完再跑一次這支程式。
"""

# Google 原生檔（雲端文件）：沒有實體檔案，要備份必須匯出成別的格式
NATIVE_EXPORT = {
    "application/vnd.google-apps.document":     ("Google 文件",   ".docx"),
    "application/vnd.google-apps.spreadsheet":  ("Google 試算表", ".xlsx"),
    "application/vnd.google-apps.presentation": ("Google 簡報",   ".pptx"),
    "application/vnd.google-apps.drawing":      ("Google 繪圖",   ".png"),
    "application/vnd.google-apps.form":         ("Google 表單",   "（無法匯出）"),
    "application/vnd.google-apps.script":       ("Apps Script",   "（無法匯出）"),
}
FOLDER_MIME = "application/vnd.google-apps.folder"
SHORTCUT_MIME = "application/vnd.google-apps.shortcut"


def human(n):
    n = float(n or 0)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return "%.0f %s" % (n, unit) if unit == "B" else "%.1f %s" % (n, unit)
        n /= 1024
    return "%.1f TB" % n


def kind_of(mime, name):
    if mime == FOLDER_MIME:
        return "folder"
    if mime == SHORTCUT_MIME:
        return "shortcut"
    if mime in NATIVE_EXPORT:
        return "native"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("audio/"):
        return "audio"
    ext = os.path.splitext(name)[1].lower()
    if ext in (".psd", ".ai", ".prproj", ".aep", ".drp"):
        return "project"
    if ext in (".zip", ".rar", ".7z", ".dmg"):
        return "archive"
    return "other"


KIND_LABEL = {
    "video": "影片", "image": "圖片", "audio": "音檔", "project": "剪輯／設計專案",
    "native": "Google 雲端文件", "shortcut": "捷徑", "archive": "壓縮檔",
    "other": "其他", "folder": "資料夾",
}


def safe_seg(name):
    """
    Drive 的名稱裡可以有 "/"（真的有：「【影片區(2026/08/10)】」），
    但檔案系統路徑不行 —— 直接拿來組路徑會把一層算成三層，
    之後寫到本機留底也會炸開成不存在的目錄。
    這裡一律換成全形斜線，路徑層級才算得對，之後落地也用同一套規則。
    """
    return (name or "").replace("/", "／").replace("\\", "＼").replace("\x00", "")


def parse_folder_id(s):
    """吃資料夾 ID 或整條 Drive 網址都可以。"""
    s = (s or "").strip()
    if "/folders/" in s:
        s = s.split("/folders/", 1)[1]
    for sep in ("?", "/", "#"):
        if sep in s:
            s = s.split(sep, 1)[0]
    return s


def build_service():
    try:
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build
    except ImportError:
        print(DEPS_HELP)
        sys.exit(1)
    except BaseException as e:
        # 套件裝了但載不起來（版本打架、底層的 cryptography 壞掉…）。
        # 這種不是 ImportError，接不住就會噴一整頁看不懂的 traceback。
        print("Google API 套件裝了，但載入失敗：\n    %s: %s" % (type(e).__name__, e))
        print("\n多半是套件版本打架，或 pip 裝到了另一個 Python。先確認裝在同一個：")
        print("    which python3")
        print("    python3 -c \"import sys; print(sys.executable)\"")
        print("\n然後用同一個 Python 重裝：")
        print("    python3 -m pip install --user --upgrade --force-reinstall \\")
        print("        google-api-python-client google-auth-httplib2 "
              "google-auth-oauthlib cryptography")
        sys.exit(1)

    os.makedirs(CONF_DIR, mode=0o700, exist_ok=True)
    creds = None
    if os.path.exists(TOKEN_PATH):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
        except Exception:
            creds = None
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CRED_PATH):
                print(SETUP_HELP)
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(CRED_PATH, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_PATH, "w") as fh:
            fh.write(creds.to_json())
        os.chmod(TOKEN_PATH, 0o600)
    return build("drive", "v3", credentials=creds, cache_discovery=False)


FIELDS = ("nextPageToken, files(id, name, mimeType, size, modifiedTime, "
          "createdTime, owners(emailAddress), trashed, shortcutDetails, "
          "md5Checksum, capabilities(canDownload))")


def list_children(svc, folder_id, retries=5):
    """列出一個資料夾底下的直接子項（自動分頁、自動重試）。"""
    out, token = [], None
    while True:
        for attempt in range(retries):
            try:
                resp = svc.files().list(
                    q="'%s' in parents and trashed = false" % folder_id,
                    fields=FIELDS, pageSize=1000, pageToken=token,
                    supportsAllDrives=True, includeItemsFromAllDrives=True,
                ).execute()
                break
            except Exception as e:
                if attempt == retries - 1:
                    raise
                time.sleep(2 ** attempt)      # 遇到速率限制就退讓重試
        out.extend(resp.get("files", []))
        token = resp.get("nextPageToken")
        if not token:
            return out


def walk(svc, root_id, max_depth, progress_every=200):
    """
    廣度優先走訪整棵樹。
    Drive 允許同一個檔案掛在多個資料夾底下，所以要記已走訪過的，避免無限繞。
    """
    root_meta = svc.files().get(
        fileId=root_id, fields="id, name, mimeType, owners(emailAddress)",
        supportsAllDrives=True).execute()

    files, errors = [], []
    seen_folders = set()
    root_name = safe_seg(root_meta.get("name", "?"))
    queue = [(root_id, root_name, 0, root_name)]
    scanned = 0

    while queue:
        fid, fname, depth, path = queue.pop(0)
        if fid in seen_folders:
            continue
        seen_folders.add(fid)
        if max_depth and depth >= max_depth:
            continue
        try:
            children = list_children(svc, fid)
        except Exception as e:
            errors.append("讀不到資料夾「%s」：%s" % (path, e))
            continue

        for c in children:
            mime = c.get("mimeType", "")
            name = c.get("name", "")
            cpath = path + "/" + safe_seg(name)
            if mime == FOLDER_MIME:
                queue.append((c["id"], name, depth + 1, cpath))
                continue
            owner = ""
            if c.get("owners"):
                owner = c["owners"][0].get("emailAddress", "")
            files.append({
                "id": c["id"], "name": safe_seg(name), "rawName": name,
                "path": cpath, "depth": depth + 1,
                "mimeType": mime, "kind": kind_of(mime, name),
                "size": int(c.get("size") or 0),
                "modifiedTime": c.get("modifiedTime", ""),
                "createdTime": c.get("createdTime", ""),
                "owner": owner,
                "canDownload": bool((c.get("capabilities") or {}).get("canDownload", True)),
                "md5": c.get("md5Checksum", ""),
                "shortcutTarget": (c.get("shortcutDetails") or {}).get("targetId", ""),
                # 第一層分支：用來算「哪個子資料夾佔最多空間」
                "topFolder": cpath.split("/")[1] if cpath.count("/") >= 1 else "(根目錄)",
            })
            scanned += 1
            if scanned % progress_every == 0:
                print("  …已盤點 %d 個檔案，待走訪資料夾 %d 個" % (scanned, len(queue)),
                      file=sys.stderr, flush=True)

    return root_meta, files, errors, len(seen_folders)


# 命名雜訊：相機／手機自動產生的編號，對「怎麼重新分類」沒有參考價值
NOISE = re.compile(r"^(img|dsc|mvi|vid|mov|dji|gopro|screenshot|螢幕|未命名|"
                   r"final|copy|副本|new|test|untitled)[\W_]*\d*$", re.I)


def naming_clues(files):
    """
    原本的資料夾分類爛，重新組織就不能照抄它。
    這裡改從兩個比較可靠的維度找線索：
      1. 檔案自己的年月 —— 時間軸是唯一不會騙人的組織維度
      2. 檔名裡反覆出現的詞 —— 看得出實際上大家怎麼稱呼這些素材，
         那些詞才是之後拿來當關鍵字／分類的候選
    """
    by_month = defaultdict(lambda: [0, 0])
    zh, en = Counter(), Counter()
    for f in files:
        if f["kind"] in ("shortcut", "native"):
            continue
        m = (f.get("modifiedTime") or "")[:7]
        if m:
            by_month[m][0] += 1
            by_month[m][1] += f["size"]
        stem = os.path.splitext(f["name"])[0]
        if NOISE.match(stem.strip()):
            continue
        for w in re.findall(r"[A-Za-z][A-Za-z\-]{2,}", stem):
            if not NOISE.match(w):
                en[w.lower()] += 1
        # 中文用 2~8 字滑窗。窗口太短，「祖母綠證書」這種五字詞會被切成
        # 「祖母綠證」「母綠證書」兩個碎片，兩個次數一樣、誰也壓不掉誰。
        # 上限 8 是折衷：夠長到蓋住實際會用的詞，又不會讓組合數爆掉。
        for run in re.findall(r"[\u4e00-\u9fff]{2,}", stem):
            if len(run) > 24:            # 極長字串多半是整句描述，切了也沒意義
                continue
            for n in range(2, min(len(run), 8) + 1):
                for i in range(len(run) - n + 1):
                    zh[run[i:i + n]] += 1
    return by_month, zh, en


def top_terms(counter, limit, min_count):
    """
    中文用滑窗切詞會產生一堆重疊碎片：「祖母綠」「祖母綠證」「母綠證書」
    全都被數到。只留「最大化」的詞 —— 再延長一個字、次數就會掉下來的那個。
    次數不掉，代表它只是更長詞的一部分，留長的就好。
    """
    items = {w: c for w, c in counter.items() if c >= min_count}
    # 每個詞被「延長一個字」之後的最高次數（左右各延一邊都算）
    longer = {}
    for w2, c2 in items.items():
        for sub in (w2[:-1], w2[1:]):
            if len(sub) >= 2 and c2 > longer.get(sub, 0):
                longer[sub] = c2
    kept = [(w, c) for w, c in items.items() if c > longer.get(w, 0)]
    kept.sort(key=lambda wc: (-wc[1], -len(wc[0])))
    return kept[:limit]


def report(root_meta, files, errors, folder_count, elapsed):
    total_bytes = sum(f["size"] for f in files)
    by_kind = defaultdict(lambda: [0, 0])          # kind -> [數量, 位元組]
    by_owner = defaultdict(lambda: [0, 0])
    by_top = defaultdict(lambda: [0, 0])
    zero_byte, no_download, natives, shortcuts = [], [], 0, 0
    max_depth = 0

    for f in files:
        k = f["kind"]
        by_kind[k][0] += 1
        by_kind[k][1] += f["size"]
        by_owner[f["owner"] or "(不明)"][0] += 1
        by_owner[f["owner"] or "(不明)"][1] += f["size"]
        by_top[f["topFolder"]][0] += 1
        by_top[f["topFolder"]][1] += f["size"]
        max_depth = max(max_depth, f["depth"])
        if k == "native":
            natives += 1
        elif k == "shortcut":
            shortcuts += 1
        elif f["size"] == 0:
            zero_byte.append(f)
        if not f["canDownload"]:
            no_download.append(f)

    P = print
    P("")
    P("=" * 66)
    P("  Google Drive 盤點結果：%s" % root_meta.get("name", "?"))
    P("=" * 66)
    P("  盤點耗時 %.1f 秒　走訪 %d 個資料夾　最深 %d 層" % (elapsed, folder_count, max_depth))
    P("")
    P("  檔案總數　%s 個" % format(len(files), ","))
    P("  佔用空間　%s   ← 這就是本機留底至少需要的容量" % human(total_bytes))
    P("")

    P("─ 依類型 " + "─" * 54)
    for k, (n, b) in sorted(by_kind.items(), key=lambda kv: -kv[1][1]):
        P("  %-16s %7s 個   %10s" % (KIND_LABEL.get(k, k), format(n, ","), human(b)))
    P("")

    P("─ 依擁有者（誰的帳號一停，這些檔案就沒了） " + "─" * 21)
    for o, (n, b) in sorted(by_owner.items(), key=lambda kv: -kv[1][1])[:12]:
        P("  %-34s %6s 個  %10s" % (o[:34], format(n, ","), human(b)))
    P("")

    P("─ 依第一層資料夾（用這個決定要備哪幾個） " + "─" * 23)
    for t, (n, b) in sorted(by_top.items(), key=lambda kv: -kv[1][1])[:25]:
        P("  %-34s %6s 個  %10s" % (t[:34], format(n, ","), human(b)))
    if len(by_top) > 25:
        P("  …另有 %d 個資料夾較小，未列出" % (len(by_top) - 25))
    P("")

    by_month, zh, en = naming_clues(files)
    if by_month:
        P("─ 依年月（重新分類最可靠的維度） " + "─" * 31)
        months = sorted(by_month.items(), reverse=True)
        for m, (n, b) in months[:18]:
            bar = "█" * max(1, int(b / max(1, max(v[1] for v in by_month.values())) * 26))
            P("  %s  %6s 個  %10s  %s" % (m, format(n, ","), human(b), bar))
        if len(months) > 18:
            older = months[18:]
            P("  更早的 %d 個月　%s 個  %s"
              % (len(older), format(sum(v[0] for _, v in older), ","),
                 human(sum(v[1] for _, v in older))))
        P("")

    zt, et = top_terms(zh, 24, 3), top_terms(en, 14, 3)
    if zt or et:
        P("─ 檔名裡反覆出現的詞（關鍵字與分類的候選） " + "─" * 21)
        if zt:
            P("  中文　" + "、".join("%s(%d)" % (w, c) for w, c in zt))
        if et:
            P("  英數　" + "、".join("%s(%d)" % (w, c) for w, c in et))
        P("  ↑ 這些是大家實際在用的講法，拿來當本機資料庫的關鍵字比自己想的準")
        P("")

    P("─ 最大的 15 個檔案 " + "─" * 45)
    for f in sorted(files, key=lambda x: -x["size"])[:15]:
        P("  %10s  %s" % (human(f["size"]), f["path"][-70:]))
    P("")

    P("─ 要注意的東西 " + "─" * 49)
    P("  Google 雲端文件　%d 個 → 不是實體檔案，備份時得匯出成 .docx／.xlsx，"
      "而且匯出的是快照，公式與協作紀錄不會跟著走" % natives)
    P("  捷徑　　　　　　%d 個 → 指向別的地方，要決定跟不跟過去" % shortcuts)
    P("  0 byte 空檔　　 %d 個 → 多半是上傳失敗的殘骸，備了也是空的" % len(zero_byte))
    P("  無法下載　　　　%d 個 → 權限不足，這些備不到" % len(no_download))
    if no_download[:5]:
        for f in no_download[:5]:
            P("      · %s" % f["path"][-64:])
    P("")

    # 本機硬碟
    P("─ 這台機器的硬碟 " + "─" * 47)
    for mount in ("/System/Volumes/Data", "/"):
        try:
            du = shutil.disk_usage(mount)
            P("  %-22s 總共 %s　已用 %s　可用 %s"
              % (mount, human(du.total), human(du.used), human(du.free)))
            if True:
                if du.free < total_bytes:
                    P("      ⚠️  可用空間 %s < Drive 佔用 %s ——「全部複製」放不下"
                        % (human(du.free), human(total_bytes)))
                else:
                    left = du.free - total_bytes
                    P("      全部備完之後大約還剩 %s（%.0f%%）"
                        % (human(left), left / du.total * 100))
            break
        except OSError:
            continue
    ext = [d for d in (os.listdir("/Volumes") if os.path.isdir("/Volumes") else [])
           if not d.startswith(".")]
    P("  外接／其他磁碟區：%s" % ("、".join(ext) if ext else "（無）"))
    P("")

    if errors:
        P("─ 讀取失敗 " + "─" * 53)
        for e in errors[:10]:
            P("  · %s" % e)
        if len(errors) > 10:
            P("  …另有 %d 筆" % (len(errors) - 10))
        P("")
    P("=" * 66)


def main():
    ap = argparse.ArgumentParser(
        description="Google Drive 盤點（唯讀，不下載任何檔案內容）")
    ap.add_argument("folder", help="資料夾 ID，或直接貼 Drive 網址")
    ap.add_argument("--json", default="", help="把檔案明細另存成 JSON")
    ap.add_argument("--max-depth", type=int, default=0,
                    help="最多往下幾層（0＝不限制）")
    args = ap.parse_args()

    folder_id = parse_folder_id(args.folder)
    if not folder_id:
        print("請給資料夾 ID 或網址。")
        sys.exit(1)

    print("連線 Google Drive…", file=sys.stderr)
    svc = build_service()
    print("開始盤點（只讀清單，不會下載任何檔案）…", file=sys.stderr)
    t0 = time.time()
    root_meta, files, errors, folder_count = walk(svc, folder_id, args.max_depth)
    elapsed = time.time() - t0

    report(root_meta, files, errors, folder_count, elapsed)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump({
                "root": root_meta, "scannedAt": datetime.datetime.now().isoformat(),
                "folderCount": folder_count, "files": files, "errors": errors,
            }, fh, ensure_ascii=False, indent=1)
        print("明細已存到 %s（%s）" % (args.json, human(os.path.getsize(args.json))))


if __name__ == "__main__":
    main()
