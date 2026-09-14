#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 Shopline 的「貼文銷售」匯出檔接進系統：這個商品貼過幾次、帶了多少留言與加購。

    python3 tools/postsale_sync.py            # 只看不寫
    python3 tools/postsale_sync.py --write    # 真的寫進資料庫

為什麼要有這一支
---------------
老闆 2026-09-14 指著 meta 報告說：「貼過幾次都找的出來，可是你的都沒有。」
他是對的 —— 我們的「帶貨商品」欄讀的是剪輯手填的 v.products，正式資料上
1,093 支影片只有 170 支有人填，所以整排都是「—」。

meta 報告不靠人填：Shopline 匯出的「貼文銷售」CSV 裡，每一筆活動的「活動標題」
幾乎就是商品名，而且帶著留言數、留言加購、銷售額。這一支把它接進來，
讓選品清單回答得了「這個品賣過嗎、貼過幾次」。

⚠️ 這份 CSV **不是自動產生的**（meta-dashboard 的程式只讀它、不寫它）——
   是人從 Shopline 匯出、再放進那個公開的 repo。所以：
     · 這一支自己去抓那個檔，不用任何人做事
     · 但**資料有多新，取決於誰去匯出** —— 所以一定要把「資料到哪一天」
       一起寫進去，畫面上看得到。默默變舊的資料比沒有資料更糟。

⚠️ 商品名要「放寬」比對。實測：CSV 的商品名跟官網商品頁的名字完全一樣的只有
   41/105；把分隔符號（｜ - _ /）、空白、括號、大小寫拿掉之後是 59/105。
   多救回來的都是同一個商品的不同寫法（「幸運守護-四葉草手鍊」←→
   「幸運守護｜四葉草手鍊」）。**只放寬到這裡為止** —— 再往下猜（去掉「寵粉」
   這種前綴、比相似度）就會把不同材質的兩個商品合成一個，那比對不到更糟。
"""

import argparse
import csv
import io
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # noqa: E402

DEFAULT_URL = ("https://raw.githubusercontent.com/VitoKOK-lab/meta-dashboard"
               "/main/data/postsale_links.csv")
# 清單上限。不是省空間，是這份東西會**跟著每個人的登入一起下載**（存在 meta/settings，
# 前端本來就訂閱那一份）。541 個商品大約 65 KB，還好；真的長到幾千個就要另外開集合。
MAX_ITEMS = 800


def norm_title(t):
    """活動標題 → 商品名。去掉日期前綴與流水號尾巴（跟 meta 報告同一套規則）。"""
    t = (t or "").strip()
    t = re.sub(r"\d{8}[a-z]\d+(fb|ig)?$", "", t, flags=re.I)
    t = re.sub(r"(fb|ig)$", "", t, flags=re.I)
    t = re.sub(r"^\d{4}/\d{2}/\d{2}\s*", "", t)
    return t.strip(" -_|") or (t or "")


def prod_key(s):
    """商品的比對身分。⚠️ 這段規則在 app.js 的 psKey() 有一份一模一樣的 ——
    兩邊算出來的 key 不一樣的話，同步寫進去的東西畫面上就查不到，
    而且畫面只會顯示「沒有資料」，看不出是比對規則不同步。tests/postsale.py 盯著。"""
    s = str(s or "")
    s = re.sub(r"[｜|·・\-－—_/\\、,，.。\s]+", "", s)
    s = re.sub(r"[（）()【】\[\]「」『』]", "", s)
    return s.lower()


def load_csv(url, path):
    if path:
        with open(path, newline="", encoding="utf-8-sig") as f:
            return list(csv.DictReader(f))
    req = urllib.request.Request(url, headers={"User-Agent": "ec-dr-postsale-sync"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(raw)))


def aggregate(rows):
    """一個商品一筆。回傳 (清單, 資料最後一天)。"""
    by = {}
    last_all = ""
    for r in rows:
        name = norm_title(r.get("活動標題"))
        if not name:
            continue
        k = prod_key(name)
        if not k:
            continue
        d = str(r.get("建立日期") or "")[:10]
        g = by.get(k)
        if not g:
            g = by[k] = {"k": k, "p": name, "n": 0, "first": "9999", "last": "",
                         "c": 0, "a": 0, "s": 0}
        g["n"] += 1
        # 顯示名取**最長**的那個寫法 —— 短的那個常常是被截掉的
        if len(name) > len(g["p"]):
            g["p"] = name
        g["c"] += int(r.get("留言數") or 0)
        g["a"] += int(r.get("留言加購") or 0)
        g["s"] += int(r.get("銷售額NT$") or 0)
        if d:
            g["first"] = min(g["first"], d)
            g["last"] = max(g["last"], d)
            last_all = max(last_all, d)
    out = list(by.values())
    for g in out:
        if g["first"] == "9999":
            g["first"] = ""
    # 照「貼過幾次」排 —— 這張清單要回答的就是「這個品我們推過多少次」
    out.sort(key=lambda g: (-g["n"], -g["c"], g["p"]))
    return out[:MAX_ITEMS], last_all


def report(cfg, token, payload):
    """寫進 meta/settings.postsale。⚠️ 一定要用 updateMask 只寫這一格。"""
    url = "%s/meta/settings?updateMask.fieldPaths=postsale" % _fs.docs_base(cfg)

    def val(v):
        if isinstance(v, bool):
            return {"booleanValue": v}
        if isinstance(v, int):
            return {"integerValue": str(v)}
        if isinstance(v, list):
            return {"arrayValue": {"values": [val(x) for x in v]}}
        if isinstance(v, dict):
            return {"mapValue": {"fields": dict((k, val(x)) for k, x in v.items())}}
        return {"stringValue": str(v)}

    _fs._patch(url, {"fields": {"postsale": val(payload)}}, token)


def main():
    ap = argparse.ArgumentParser(description="把 Shopline 貼文銷售匯出檔接進選品清單")
    ap.add_argument("--config", default=os.path.join(os.path.expanduser("~"), ".ecdr-meta.json"))
    ap.add_argument("--url", default=DEFAULT_URL, help="CSV 網址（預設抓公開 repo 上那一份）")
    ap.add_argument("--file", default="", help="改讀本機檔案（不連網）")
    ap.add_argument("--write", action="store_true", help="真的寫進資料庫（預設只看不寫）")
    args = ap.parse_args()

    try:
        rows = load_csv(args.url, args.file)
    except Exception as e:                                      # noqa: BLE001
        print("⚠ 讀不到貼文銷售檔：%s" % e)
        print("   來源：%s" % (args.file or args.url))
        return 1

    items, data_at = aggregate(rows)
    total_n = sum(g["n"] for g in items)
    print("貼文銷售：%d 筆活動 → %d 個商品（資料到 %s）"
          % (len(rows), len(items), data_at or "不明"))
    print("　留言合計 %s、加購合計 %s、銷售額合計 %s"
          % ("{:,}".format(sum(g["c"] for g in items)),
             "{:,}".format(sum(g["a"] for g in items)),
             "{:,}".format(sum(g["s"] for g in items))))
    print("\n貼最多次的前 10 個：")
    for g in items[:10]:
        print("   貼 %2d 次　留言 %6s　加購 %4s　%s　%s"
              % (g["n"], "{:,}".format(g["c"]), "{:,}".format(g["a"]),
                 g["last"], g["p"][:30]))

    # ⚠️ 銷售額幾乎全是 0（實測 1,234 筆只有 22 筆 >0）。這件事要講出來，
    #    不然畫面上出現一堆「銷售 0」，人會以為是這個品賣不掉。
    nz = sum(1 for r in rows if int(r.get("銷售額NT$") or 0) > 0)
    if nz * 20 < len(rows):
        print("\n⚠ 這份檔案的「銷售額」欄位 %d 筆裡只有 %d 筆不是 0 —— "
              "它回答得了「貼過幾次、帶了多少留言」，回答不了「賣了多少錢」。"
              % (len(rows), nz))

    if not args.write:
        print("\n（只看不寫，資料庫沒有動。確認上面的清單是對的，再加 --write）")
        return 0

    cfg = _fs.load_config(args.config) if os.path.exists(args.config) else _fs.load_config()
    token = _fs.sign_in(cfg)
    payload = {"at": _fs.taipei_now(), "dataAt": data_at, "rows": len(rows),
               "posts": total_n, "src": (args.file or args.url), "items": items}
    report(cfg, token, payload)
    print("\n✅ 寫進 meta/settings.postsale（%d 個商品）" % len(items))
    try:
        _fs._patch("%s/logs/PS%s" % (_fs.docs_base(cfg), _fs.taipei_now().replace(":", "").replace("-", "")),
                   {"fields": {
                       "at": {"stringValue": _fs.taipei_now()},
                       "who": {"stringValue": "後台"},
                       "action": {"stringValue": "同步貼文銷售"},
                       "target": {"stringValue": "%d 個商品（資料到 %s）" % (len(items), data_at or "不明")},
                   }}, token)
    except Exception as e:                                      # noqa: BLE001
        print("  ⚠ 操作紀錄寫不進去：%s" % e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
