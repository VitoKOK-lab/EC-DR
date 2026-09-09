#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EC-DR 還原 —— 把備份寫回 Firestore。

    python3 tools/restore.py                          # 列出可用備份
    python3 tools/restore.py --from <備份資料夾>        # 試跑，不寫入任何東西
    python3 tools/restore.py --from <…> --only videos  # 只還原影片庫
    python3 tools/restore.py --from <…> --confirm      # 真的寫入

安全設計（這支腳本會改動正式資料，刻意做得難按錯）：

  1. 預設試跑         不加 --confirm 只印出「會寫幾筆、會蓋掉哪些」，不動資料。
  2. 寫入前先備份     即使現況是壞的也先抓一份存起來 —— 還原錯了還有得救。
  3. 可以只還原一個   多數狀況只有一個集合出問題，整包倒回去會把其他集合
                      這段期間的正常新資料一起蓋掉。
  4. 預設不刪東西     備份裡沒有、但線上有的文件會**保留**。要清掉得加 --prune。
  5. 會擋住有人在用   還原期間別人的寫入會跟還原打架，而且 onSnapshot 會把
                      還原中的半成品同步給所有人。腳本會要你確認已停用系統。

演練（強烈建議先做過一次，沒演練過的還原腳本等於沒有還原能力）：

    npx firebase emulators:start --only firestore --project ec-dr-21416
    FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \\
        python3 tools/restore.py --from <備份> --confirm

    加了那個環境變數就只會打模擬器，完全不會碰到正式資料庫。
"""

import argparse
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # noqa: E402

BATCH = 400          # Firestore batchWrite 上限 500，留點餘裕


def ok(m):
    print("  ✅ %s" % m)


def warn(m):
    print("  ⚠️  %s" % m)


def die(m):
    print("\n❌ 還原中止：%s" % m, file=sys.stderr)
    sys.exit(1)


def list_backups(root):
    if not os.path.isdir(root):
        return []
    out = []
    for d in sorted(os.listdir(root), reverse=True):
        p = os.path.join(root, d)
        mf = os.path.join(p, "MANIFEST.json")
        if d.startswith("ecdr-") and os.path.isfile(mf):
            try:
                out.append((p, json.load(open(mf, encoding="utf-8"))))
            except Exception:
                pass
    return out


def show_list(root):
    items = list_backups(root)
    if not items:
        die("在 %s 找不到任何備份。請先執行 tools/backup.py。" % root)
    print("")
    print("可用的備份（新→舊）：")
    print("")
    for i, (p, m) in enumerate(items, 1):
        print("  [%2d]  %s   %6d 筆   封面 %3d 張   %s"
              % (i, m.get("backupAt", "?"), m.get("totalDocs", 0),
                 (m.get("covers") or {}).get("count", 0), os.path.basename(p)))
    print("")
    print("還原：python3 tools/restore.py --from %s" % items[0][0])
    print("")
    return items


def verify_backup(path):
    """還原前先確認這份備份本身沒壞——拿壞備份去蓋正式資料是最糟的結果。"""
    mf = os.path.join(path, "MANIFEST.json")
    if not os.path.isfile(mf):
        die("%s 裡沒有 MANIFEST.json，不是有效的備份資料夾" % path)
    m = json.load(open(mf, encoding="utf-8"))
    import hashlib

    bad = []
    for rel, want in m.get("files", {}).items():
        p = os.path.join(path, rel)
        if not os.path.isfile(p):
            bad.append("%s 不見了" % rel)
            continue
        h = hashlib.sha256()
        with open(p, "rb") as f:
            for c in iter(lambda: f.read(1 << 20), b""):
                h.update(c)
        if h.hexdigest() != want["sha256"]:
            bad.append("%s 校驗碼不符" % rel)
    if bad:
        for b in bad[:8]:
            print("  ❌ %s" % b)
        die("這份備份已損毀，請改用其他備份。")
    ok("備份完整性驗證通過（%d 個檔案）" % len(m.get("files", {})))
    return m


def load_docs(path, name):
    p = os.path.join(path, "firestore", name + ".json")
    if not os.path.isfile(p):
        return None
    return json.load(open(p, encoding="utf-8"))


def write_batch(cfg, token, writes):
    url = _fs.docs_base(cfg) + ":commit"
    _fs._post(url, {"writes": writes}, token)


def restore_collection(cfg, token, name, docs, live_ids, prune, dry):
    """回傳 (寫入筆數, 覆蓋筆數, 新建筆數, 刪除筆數)。"""
    base = _fs.doc_path(cfg)      # 寫入用資源路徑，不能用含主機的網址
    backup_ids = set()
    writes = []
    overwrite = create = 0

    for d in docs:
        did = _fs.doc_id(d)
        backup_ids.add(did)
        if did in live_ids:
            overwrite += 1
        else:
            create += 1
        writes.append({"update": {
            "name": "%s/%s/%s" % (base, name, did),
            "fields": d.get("fields", {}),
        }})

    deletes = []
    if prune:
        for did in sorted(live_ids - backup_ids):
            deletes.append({"delete": "%s/%s/%s" % (base, name, did)})

    if dry:
        return len(writes), overwrite, create, len(deletes)

    all_ops = writes + deletes
    done = 0
    for i in range(0, len(all_ops), BATCH):
        chunk = all_ops[i:i + BATCH]
        try:
            write_batch(cfg, token, chunk)
        except _fs.FsError as e:
            die("寫入 %s 時失敗（已完成 %d／%d）：%s\n"
                "     資料庫目前處於還原到一半的狀態，請重跑同一份備份。"
                % (name, done, len(all_ops), e))
        done += len(chunk)
        sys.stdout.write("\r  … %s %d/%d" % (name, done, len(all_ops)))
        sys.stdout.flush()
    if all_ops:
        sys.stdout.write("\r" + " " * 46 + "\r")
    return len(writes), overwrite, create, len(deletes)


def main():
    ap = argparse.ArgumentParser(description="EC-DR 資料還原")
    ap.add_argument("--from", dest="src", help="要還原的備份資料夾")
    ap.add_argument("--dir", default=os.path.expanduser("~/EC-DR-Backups"),
                    help="備份存放位置（用來列出清單）")
    ap.add_argument("--only", action="append", metavar="集合",
                    help="只還原指定集合，可重複給")
    ap.add_argument("--prune", action="store_true",
                    help="刪除備份裡沒有、但線上有的文件（預設不刪）")
    ap.add_argument("--confirm", action="store_true",
                    help="真的寫入。不加就只是試跑")
    ap.add_argument("--skip-safety-backup", action="store_true",
                    help="跳過還原前的現況備份（不建議）")
    args = ap.parse_args()

    emu = _fs.emulator_host()

    print("")
    print("♻️  EC-DR 資料還原")
    print("=" * 56)

    if not args.src:
        show_list(args.dir)
        return

    src = os.path.abspath(os.path.expanduser(args.src))
    cfg = _fs.load_config()

    if emu:
        print("  \U0001f9ea 模擬器模式：%s（不會碰到正式資料庫）" % emu)
    else:
        print("  ⚠️  正式環境：Firebase 專案 %s" % cfg["projectId"])
    print("  來源備份：%s" % src)
    print("")

    print("▸ 1／4　驗證備份")
    m = verify_backup(src)
    print("     備份時間 %s，共 %d 筆"
          % (m.get("backupAt", "?"), m.get("totalDocs", 0)))
    if m.get("projectId") and m["projectId"] != cfg["projectId"]:
        warn("這份備份來自專案 %s，目前設定是 %s —— 確定要跨專案還原嗎？"
             % (m["projectId"], cfg["projectId"]))

    targets = args.only or _fs.COLLECTIONS
    unknown = [t for t in targets if t not in _fs.COLLECTIONS]
    if unknown:
        die("不認識的集合：%s" % ", ".join(unknown))

    print("")
    print("▸ 2／4　連線並比對現況")
    token = _fs.sign_in(cfg)
    live = {}
    for name in targets:
        try:
            live[name] = {_fs.doc_id(d)
                          for d in _fs.fetch_collection(cfg, token, name)}
        except _fs.FsError as e:
            die("讀取線上的 %s 失敗：%s" % (name, e))
    ok("已讀取線上現況")

    plan = []
    for name in targets:
        docs = load_docs(src, name)
        if docs is None:
            warn("備份裡沒有 %s，跳過" % name)
            continue
        n, ovr, new, dele = restore_collection(
            cfg, token, name, docs, live[name], args.prune, dry=True)
        plan.append((name, n, ovr, new, dele, len(live[name])))

    print("")
    print("▸ 3／4　還原計畫")
    print("")
    print("  %-10s %8s %8s %8s %8s %8s"
          % ("集合", "線上現有", "備份有", "會覆蓋", "會新建", "會刪除"))
    print("  " + "-" * 56)
    tw = td = 0
    for name, n, ovr, new, dele, cur in plan:
        print("  %-10s %8d %8d %8d %8d %8d"
              % (name, cur, n, ovr, new, dele))
        tw += n
        td += dele
    print("  " + "-" * 56)
    print("  %-10s %8s %8d %8s %8s %8d" % ("合計", "", tw, "", "", td))
    print("")
    if not args.prune:
        print("  備份裡沒有、線上有的文件會**保留不動**（要清掉請加 --prune）")

    if not args.confirm:
        print("")
        print("=" * 56)
        print("這是試跑，沒有寫入任何資料。")
        print("")
        print("確定要還原就加上 --confirm：")
        print("  python3 tools/restore.py --from %s%s --confirm"
              % (src, "".join(" --only " + t for t in (args.only or []))))
        print("=" * 56)
        print("")
        return

    # --- 真的要寫了 ---
    print("")
    print("▸ 4／4　寫入")
    if not emu:
        print("")
        print("  ⚠️  還原期間如果同仁還在操作系統：")
        print("     ・他們的寫入會跟還原打架，結果無法預期")
        print("     ・onSnapshot 會把還原到一半的狀態同步給所有人")
        print("")
        print("     請先確認所有人都已停止使用（最保險是暫時把")
        print("     firestore.rules 的寫入關掉，還原完再開回來）。")
        print("")
        if sys.stdin.isatty():
            a = input("  已停用系統、確定要寫入正式資料庫？輸入 yes 繼續：")
            if a.strip().lower() != "yes":
                die("使用者取消")
        else:
            warn("非互動模式，跳過確認提問")

    if not args.skip_safety_backup and not emu:
        print("")
        print("  先備份現況（還原錯了才有得救）…")
        import subprocess
        r = subprocess.run(
            [sys.executable, os.path.join(_fs.repo_root(), "tools", "backup.py"),
             "--to", args.dir, "--no-covers"],
            capture_output=True, text=True)
        if r.returncode != 0:
            die("現況備份失敗，為安全起見中止還原。\n%s" % r.stderr[-500:])
        ok("現況已備份")

    print("")
    stamp = datetime.datetime.now().isoformat(timespec="seconds")
    for name, *_ in plan:
        docs = load_docs(src, name)
        n, ovr, new, dele = restore_collection(
            cfg, token, name, docs, live[name], args.prune, dry=False)
        ok("%-10s 寫入 %d 筆%s" % (name, n, ("、刪除 %d 筆" % dele) if dele else ""))

    print("")
    print("=" * 56)
    print("✅ 還原完成（%s）" % stamp)
    print("")
    print("   請立刻打開系統確認：影片庫筆數、今天的排程、成員名單、系統設定。")
    if not emu:
        print("   若剛才有暫時關閉 firestore.rules 的寫入，記得開回來。")
    print("=" * 56)
    print("")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        die("使用者中斷")
