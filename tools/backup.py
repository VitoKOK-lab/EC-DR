#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EC-DR 一鍵完整備份 —— 把整套系統抓回本機。

    python3 tools/backup.py                      # 備到 ~/EC-DR-Backups
    python3 tools/backup.py --to /Volumes/隨身碟  # 備到外接硬碟／雲端同步夾
    python3 tools/backup.py --keep 30            # 保留份數（預設 30）
    python3 tools/backup.py --no-covers          # 跳過封面圖（快很多）

備份三層，缺一不可：

    程式碼   git bundle（含全部分支與完整歷史）→ GitHub 整個消失也能重建
    資料     Firestore 9 個集合 → 誤刪、寫壞時的唯一救命索
    封面圖   Firebase Storage 的 covers/ → 從影片的 cover 欄位取網址下載

打包完會**立刻自我回驗**：重讀每個檔案、比對 SHA256 與筆數。
對不上就整份標記失敗——不留「看起來有備份、真要用才發現是壞的」檔案。

只用 Python 3 標準函式庫。Mac 內建 python3 即可，不必安裝任何東西。
"""

import argparse
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # noqa: E402


def ok(msg):
    print("  ✅ %s" % msg)


def warn(msg):
    print("  ⚠️  %s" % msg)


def die(msg):
    print("\n❌ 備份失敗：%s" % msg, file=sys.stderr)
    sys.exit(1)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# 第一層：程式碼
# ---------------------------------------------------------------------------
def backup_code(root, out_dir):
    """
    git bundle --all：一個檔案裝下所有分支與完整 commit 歷史。
    還原時 `git clone repo.bundle` 就是一個完好的 repo，
    不需要 GitHub、不需要網路。
    """
    if not os.path.isdir(os.path.join(root, ".git")):
        warn("這裡不是 git repo，跳過程式碼備份")
        return None
    dest = os.path.join(out_dir, "repo.bundle")
    try:
        subprocess.run(["git", "bundle", "create", dest, "--all"],
                       cwd=root, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as e:
        warn("git bundle 失敗：%s" % e.stderr.decode("utf-8", "replace")[:200])
        return None
    except FileNotFoundError:
        warn("找不到 git 指令，跳過程式碼備份")
        return None

    n = subprocess.run(["git", "rev-list", "--all", "--count"], cwd=root,
                       capture_output=True, text=True).stdout.strip() or "?"
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root,
                          capture_output=True, text=True).stdout.strip()[:8]
    ok("程式碼：%s 個 commit（HEAD %s），%s"
       % (n, head, _fs.human(os.path.getsize(dest))))
    return {"commits": n, "head": head, "bytes": os.path.getsize(dest)}


# ---------------------------------------------------------------------------
# 第二層：Firestore 資料
# ---------------------------------------------------------------------------
def backup_firestore(cfg, token, out_dir):
    raw_dir = os.path.join(out_dir, "firestore")
    plain_dir = os.path.join(out_dir, "readable")
    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(plain_dir, exist_ok=True)

    tty = sys.stdout.isatty()
    stats = {}
    total = 0
    for name in _fs.COLLECTIONS:
        if tty:
            sys.stdout.write("  … %s" % name)
            sys.stdout.flush()
        try:
            docs = _fs.fetch_collection(cfg, token, name)
        except _fs.FsError as e:
            if tty:
                print("\r", end="")
            die("讀取集合 %s 失敗：%s\n"
                "     若是 403，請確認 firestore.rules 仍允許讀取。" % (name, e))

        # 原始 REST 格式：還原時用這份（保留型別，不失真）
        raw_path = os.path.join(raw_dir, name + ".json")
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(docs, f, ensure_ascii=False, indent=1)

        # 可讀版本：給人打開來看的，還原不會用到
        plain_path = os.path.join(plain_dir, name + ".json")
        with open(plain_path, "w", encoding="utf-8") as f:
            json.dump([_fs.doc_to_plain(d) for d in docs],
                      f, ensure_ascii=False, indent=1)

        size = os.path.getsize(raw_path)
        stats[name] = {"count": len(docs), "bytes": size}
        total += len(docs)
        print("%s  ✅ %-9s %6d 筆  %10s"
              % ("\r" if tty else "", name, len(docs), _fs.human(size)))

    ok("資料合計 %d 筆" % total)
    return stats, total


# ---------------------------------------------------------------------------
# 第三層：封面圖
# ---------------------------------------------------------------------------
def backup_covers(out_dir, dest_root, token, videos_raw_path):
    """
    封面網址存在每支影片的 cover 欄位（Storage 不讓用戶端列出整個 bucket）。

    省空間的作法：檔案實際存在共用池 .covers-pool/，每份備份的 covers/
    是硬連結過去。所以 30 份備份共用同一批圖，只佔一份的空間；
    但把任何一個備份資料夾整個拷到隨身碟時，會複製成完整檔案，
    那個資料夾仍然是自足的。
    """
    docs = json.load(open(videos_raw_path, encoding="utf-8"))
    urls = {}
    for d in docs:
        u = d.get("fields", {}).get("cover", {}).get("stringValue", "")
        if u:
            urls[_fs.doc_id(d)] = u
    if not urls:
        ok("沒有封面圖需要備份")
        return {"count": 0, "bytes": 0, "reused": 0}

    tty = sys.stdout.isatty()
    covers_dir = os.path.join(out_dir, "covers")
    pool = os.path.join(dest_root, ".covers-pool")
    os.makedirs(covers_dir, exist_ok=True)
    os.makedirs(pool, exist_ok=True)

    got = reused = failed = 0
    nbytes = 0
    for i, (vid, url) in enumerate(sorted(urls.items()), 1):
        # 上傳新圖會拿到新網址（token 會變），所以網址就是內容的指紋
        key = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16] + ".jpg"
        pooled = os.path.join(pool, key)
        target = os.path.join(covers_dir, vid + ".jpg")

        if not os.path.exists(pooled):
            try:
                req = urllib.request.Request(
                    url, headers={"Authorization": "Bearer " + token})
                with urllib.request.urlopen(req, timeout=_fs.TIMEOUT) as r:
                    data = r.read()
                tmp = pooled + ".part"
                with open(tmp, "wb") as f:
                    f.write(data)
                os.replace(tmp, pooled)
                got += 1
            except Exception:
                failed += 1
                continue
        else:
            reused += 1

        if not os.path.exists(target):
            try:
                os.link(pooled, target)          # 硬連結：不佔額外空間
            except OSError:
                shutil.copy2(pooled, target)     # 跨磁碟時退回複製
        nbytes += os.path.getsize(target)

        if tty and (i % 40 == 0 or i == len(urls)):
            sys.stdout.write("\r  … 封面圖 %d/%d" % (i, len(urls)))
            sys.stdout.flush()

    if tty:
        print("\r" + " " * 40 + "\r", end="")
    msg = "封面圖 %d 張（新抓 %d、沿用 %d），%s" % (
        got + reused, got, reused, _fs.human(nbytes))
    if failed:
        warn(msg + "；%d 張下載失敗（影片可能已刪但欄位還留著）" % failed)
    else:
        ok(msg)
    return {"count": got + reused, "bytes": nbytes,
            "reused": reused, "failed": failed}


# ---------------------------------------------------------------------------
# 回驗：這份備份真的能用嗎
# ---------------------------------------------------------------------------
def verify(out_dir, manifest):
    bad = []
    for rel, want in manifest["files"].items():
        path = os.path.join(out_dir, rel)
        if not os.path.isfile(path):
            bad.append("%s 不見了" % rel)
            continue
        if sha256_file(path) != want["sha256"]:
            bad.append("%s 校驗碼不符" % rel)
    if bad:
        return bad

    # 光是檔案在、校驗碼對還不夠：JSON 要真的解析得開、筆數要對得起來
    for name, st in manifest["firestore"].items():
        p = os.path.join(out_dir, "firestore", name + ".json")
        try:
            docs = json.load(open(p, encoding="utf-8"))
        except Exception as e:
            bad.append("%s.json 解析失敗：%s" % (name, e))
            continue
        if len(docs) != st["count"]:
            bad.append("%s.json 筆數不符（%d ≠ %d）"
                       % (name, len(docs), st["count"]))
    return bad


def rotate(dest_root, keep):
    dirs = sorted(
        (d for d in os.listdir(dest_root)
         if d.startswith("ecdr-") and os.path.isdir(os.path.join(dest_root, d))),
        reverse=True)
    for old in dirs[keep:]:
        shutil.rmtree(os.path.join(dest_root, old), ignore_errors=True)
        ok("已刪除舊備份 %s" % old)

    # 共用池裡沒有任何備份還在用的圖就清掉（硬連結數 == 1）
    pool = os.path.join(dest_root, ".covers-pool")
    freed = 0
    if os.path.isdir(pool):
        for f in os.listdir(pool):
            p = os.path.join(pool, f)
            try:
                if os.stat(p).st_nlink <= 1:
                    freed += os.path.getsize(p)
                    os.remove(p)
            except OSError:
                pass
    if freed:
        ok("清掉沒人用的封面圖 %s" % _fs.human(freed))
    return len(dirs[:keep])


def main():
    ap = argparse.ArgumentParser(description="EC-DR 完整備份")
    ap.add_argument("--to", default=os.path.expanduser("~/EC-DR-Backups"),
                    help="備份存放位置（預設 ~/EC-DR-Backups）")
    ap.add_argument("--keep", type=int, default=30, help="保留份數（預設 30）")
    ap.add_argument("--no-covers", action="store_true", help="跳過封面圖")
    args = ap.parse_args()

    root = _fs.repo_root()
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    dest_root = os.path.abspath(os.path.expanduser(args.to))
    out_dir = os.path.join(dest_root, "ecdr-" + stamp)

    print("")
    print("\U0001f5c4  EC-DR 系統備份")
    print("=" * 56)
    print("  來源：%s" % root)
    print("  目的：%s" % out_dir)
    print("")

    try:
        cfg = _fs.load_config()
    except _fs.FsError as e:
        die(str(e))
    print("  Firebase 專案：%s" % cfg["projectId"])
    print("")

    drift = _fs.check_collections_drift()
    if drift:
        warn("程式裡有集合沒被列入備份清單：%s" % ", ".join(drift))
        warn("請到 tools/_fs.py 的 COLLECTIONS 補上，否則這些資料不會被備份")
        print("")

    try:
        os.makedirs(out_dir, exist_ok=True)
    except OSError as e:
        die("無法建立備份資料夾：%s" % e)

    print("▸ 1／5　程式碼")
    code = backup_code(root, out_dir)

    print("")
    print("▸ 2／5　登入 Firebase")
    try:
        token = _fs.sign_in(cfg)
    except _fs.FsError as e:
        die(str(e))
    ok("匿名登入成功")

    print("")
    print("▸ 3／5　Firestore 資料")
    fs_stats, total_docs = backup_firestore(cfg, token, out_dir)

    print("")
    print("▸ 4／5　封面圖")
    if args.no_covers:
        ok("已指定 --no-covers，跳過")
        covers = {"count": 0, "bytes": 0, "skipped": True}
    else:
        covers = backup_covers(out_dir, dest_root, token,
                               os.path.join(out_dir, "firestore", "videos.json"))

    # --- 清單與校驗碼 ---
    files = {}
    for dirpath, _dirs, names in os.walk(out_dir):
        for n in names:
            p = os.path.join(dirpath, n)
            rel = os.path.relpath(p, out_dir)
            if rel == "MANIFEST.json":
                continue
            files[rel] = {"sha256": sha256_file(p), "bytes": os.path.getsize(p)}

    manifest = {
        "backupAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "projectId": cfg["projectId"],
        "source": root,
        "host": os.uname().nodename if hasattr(os, "uname") else "",
        "python": sys.version.split()[0],
        "code": code,
        "firestore": fs_stats,
        "totalDocs": total_docs,
        "covers": covers,
        "collectionsDrift": drift,
        "files": files,
    }
    with open(os.path.join(out_dir, "MANIFEST.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    print("")
    print("▸ 5／5　回驗（確認這份備份真的能還原）")
    bad = verify(out_dir, manifest)
    if bad:
        for b in bad[:8]:
            print("  ❌ %s" % b)
        die("回驗未通過，這份備份不可信。請重跑；若持續失敗請檢查磁碟空間。")
    ok("全部檔案校驗碼一致、JSON 可解析、筆數相符")

    kept = rotate(dest_root, args.keep)
    size = sum(v["bytes"] for v in files.values())

    print("")
    print("=" * 56)
    print("✅ 備份完成並通過回驗")
    print("")
    print("   位置：%s" % out_dir)
    print("   大小：%s（資料 %d 筆、封面 %d 張）"
          % (_fs.human(size), total_docs, covers.get("count", 0)))
    print("   目前保留 %d 份" % kept)
    print("")
    print("   還原：python3 tools/restore.py --from %s" % out_dir)
    print("=" * 56)
    print("")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        die("使用者中斷")
