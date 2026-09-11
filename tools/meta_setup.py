#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
建立 Meta 同步的設定檔 —— 你只要貼一次權杖，其他它自己查。

    python3 tools/meta_setup.py

做四件事：
  1. 問你要權杖（貼上去就好，畫面上不會顯示）
  2. 拿權杖去問 Meta：你管理哪些粉專、每個粉專連著哪個 IG
  3. 跟系統「上片平台」那張清單自動對名字（靠 utm 欄位裡的 handle）
  4. 寫成 ~/.ecdr-meta.json（權限設成只有你讀得到）

順便告訴你「清單上有、但 Meta 那邊查不到」的帳號 ——
那通常就是還沒切成專業帳號，或是沒連到你管理的粉專。

⚠️ 設定檔寫在家目錄，不是 repo 裡面。repo 是公開的，權杖進了 git 等於貼在網路上。
"""

import getpass
import json
import os
import stat
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs                                   # noqa: E402
from meta_sync import _call, MetaError, DEFAULT_CONFIG   # noqa: E402


def discover(token):
    """問 Meta：這把權杖管得到哪些粉專、每個粉專連著哪個 IG。"""
    data = _call("me/accounts", token, {
        "fields": "id,name,instagram_business_account{id,username,name}",
        "limit": 100})
    pages, igs = [], []
    for p in (data.get("data") or []):
        pages.append({"id": p.get("id"), "name": p.get("name") or ""})
        ig = p.get("instagram_business_account") or {}
        if ig.get("id"):
            igs.append({"id": ig["id"],
                        "username": ig.get("username") or "",
                        "via": p.get("name") or ""})
    return pages, igs


def system_platforms():
    """讀系統設定裡的「上片平台」清單。讀不到就回空的，不擋流程。"""
    try:
        cfg = _fs.load_config()
        tok = _fs.sign_in(cfg)
        url = "%s/meta/settings" % _fs.docs_base(cfg)
        doc = _fs._get(url, tok)
        pl = _fs.to_plain((doc.get("fields") or {}).get("postPlatforms")) or []
        return [x for x in pl if isinstance(x, dict) and x.get("name")]
    except Exception as e:                                   # noqa: BLE001
        print("  （讀不到系統的平台清單，改用 Meta 那邊的名字：%s）" % e)
        return []


def handle_of(p):
    """從 utm 取出 handle：'ig_tzgems1111' → 'tzgems1111'。"""
    u = str(p.get("utm") or "")
    return u.split("_", 1)[1].lower() if "_" in u else ""


def map_accounts(pages, igs, plats):
    """把 Meta 查到的帳號，對上系統「上片平台」清單裡的名字。

    對法是 utm 欄位裡的 handle（ig_tzgems1111 → tzgems1111），不是用名字去猜 ——
    名字兩邊隨時會被人改，handle 不會。
    回傳 (要寫進設定檔的帳號清單, 清單上有但這次沒查到的名字)。
    """
    by_handle = {handle_of(p): p["name"] for p in plats if handle_of(p)}
    accounts, seen = [], set()
    for ig in igs:
        name = by_handle.get(str(ig.get("username", "")).lower()) \
            or ("IG @%s" % ig.get("username", ""))
        accounts.append({"platform": "IG", "name": name, "igUserId": ig["id"]})
        seen.add(name)
    for pg in pages:
        name = by_handle.get(str(pg.get("name", "")).lower().replace(" ", "")) \
            or ("FB %s" % pg.get("name", ""))
        accounts.append({"platform": "FB", "name": name, "pageId": pg["id"]})
        seen.add(name)
    # LINE 社群沒有這種 API，本來就抓不到，不算「少了」
    missing = [p["name"] for p in plats
               if p["name"] not in seen and "LINE" not in p["name"]]
    return accounts, missing


def main():
    print("EC-DR 平台成效同步 — 設定精靈\n")
    print("請貼上 Meta 的長期存取權杖（EAA... 開頭那一長串）。")
    print("貼上後按 Enter。畫面上不會顯示出來，這是正常的。\n")
    token = getpass.getpass("權杖：").strip()
    if not token:
        print("\n沒有貼到東西，結束。")
        return 2

    print("\n問 Meta 你管理哪些帳號…")
    try:
        pages, igs = discover(token)
    except MetaError as e:
        print("\n查不到：%s" % e)
        print("\n常見原因：權杖過期（要用『延長存取權杖』換 60 天的那一版）、"
              "或是產生權杖時沒有勾 pages_show_list 這個權限。")
        return 2
    if not pages:
        print("\n這把權杖查不到任何粉專。")
        print("請確認產生權杖時勾了 pages_show_list，而且你的 FB 帳號是那些粉專的管理員。")
        return 2

    print("  粉專 %d 個、連著 IG 的 %d 個" % (len(pages), len(igs)))

    print("\n對名字（要跟系統『上片平台』寫得一樣，成效才會合在一起看）…")
    plats = system_platforms()
    accounts, missing = map_accounts(pages, igs, plats)
    for a in accounts:
        src = ("@" + next(i["username"] for i in igs if i["id"] == a["igUserId"])) \
            if a["platform"] == "IG" \
            else next(p["name"] for p in pages if p["id"] == a["pageId"])
        print("  %s  %-24s → %s" % (a["platform"], str(src)[:24], a["name"]))

    # 清單上有、但這次沒查到的 —— 這是最有用的一段訊息
    if missing:
        print("\n⚠ 系統清單上有、但 Meta 這邊查不到的帳號：")
        for m in missing:
            print("    %s" % m)
        print("  這幾個通常是：還沒切成『專業帳號』，或沒有連到你管理的粉專。")
        print("  （LINE 社群沒有這種 API，本來就抓不到，所以不列在這裡。）")

    print("\n要把上面這些寫進 %s 嗎？" % DEFAULT_CONFIG)
    if input("輸入 y 確認：").strip().lower() != "y":
        print("沒有寫入，結束。")
        return 1

    body = {"token": token, "accounts": accounts}
    with open(DEFAULT_CONFIG, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False, indent=2)
    os.chmod(DEFAULT_CONFIG, stat.S_IRUSR | stat.S_IWUSR)    # 只有你讀得到
    print("\n寫好了：%s（權限 600，只有你讀得到）" % DEFAULT_CONFIG)
    print("\n接下來跑這一行，它只會印出清單、不會動資料庫：")
    print("    python3 tools/meta_sync.py")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n取消了。")
        sys.exit(1)
