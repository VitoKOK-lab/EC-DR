#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""問 Meta：IG 貼文的「觀看」指標，到底有沒有一個跟 App 上顯示的數字對得起來？

    python3 tools/meta_probe_ig.py                       看最近 8 則
    python3 tools/meta_probe_ig.py --n 20                看最近 20 則
    python3 tools/meta_probe_ig.py --media-id 18120140290926241   只問這一則

**只讀，不寫資料庫、不改任何東西。**

為什麼要有這一支：
2026-09-22 老闆截圖，(P264)勞力士把頭的秘密 那支 Reels，IG App 上顯示
**191.7 萬**觀看，系統裡記的卻是 **79,773**（差了快 24 倍，而且不是慢慢
追上——這 10 天系統裡的數字是 60,342 → 79,773，穩定小幅成長，不是卡住）。

現有 tools/meta_sync.py 的 IG_METRICS 只要三個跟觀看有關的名字：
views／reach，都要得到了，但兩個都遠遠小於 App 顯示的數字。

查官方文件（developers.facebook.com/docs/instagram-platform/reference/
instagram-media/insights），IG 媒體洞察其實列了不只 views 一個：
    views              這則 IG 媒體在 Instagram 上被播放的總次數
    reach              至少看過一次的不重複帳號數
    facebook_views     這則 IG 媒體在 Facebook 上被播放的總次數（有跨貼的話）
    crossposted_views  跨 Instagram／Facebook 加總的播放次數
    total_views        全平台加總看過的次數（文件註記：僅 Facebook 登入那條路才有）
    ig_reels_avg_watch_time／ig_reels_video_view_total_time   看的時長，不是次數

跟 FB 粉專那次一樣的道理（見 tools/meta_probe_fb.py）：與其猜一個名字換上去，
不如把候選名單整批問一次，印出哪些真的要得到、要到的數字多大 —— 特別去看
crossposted_views／total_views 這兩個有沒有比 views 大很多、比較接近 App
上的數字。知道答案才回去改 meta_sync.py 的 IG_METRICS／VIEW_KEYS。
"""

import argparse
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from meta_sync import _call, _insight_values, _paged, MetaError, DEFAULT_CONFIG  # noqa: E402

# 官方文件列出來的候選 —— 不只 meta_sync.py 現在在問的 views／reach 兩個。
CANDIDATES = ["views", "reach", "facebook_views", "crossposted_views",
              "total_views", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"]


def probe_one(acc_name, media_id, tok, caption=""):
    print("\n  %s　%s" % (media_id, caption[:30].replace("\n", " ")))

    # ① 不帶 metric＝「你有什麼就全部給我」——這條線不會被某個無效名字拖垮整批
    try:
        d = _call("%s/insights" % media_id, tok, {})
        vals = _insight_values(d)
        if vals:
            show = sorted(vals.items(), key=lambda kv: -kv[1])
            print("    全部給我　%s" % "　".join("%s=%s" % (k, "{:,}".format(v)) for k, v in show))
        else:
            print("    全部給我　回了空的")
    except MetaError as e:
        print("    全部給我　要不到：%s" % str(e)[:100])
        vals = {}

    # ② 候選名單逐個問——「全部給我」不見得會給到 crossposted_views／total_views
    #    這種比較新、可能要另外指名才給的欄位。
    got = {}
    for m in CANDIDATES:
        try:
            v = _insight_values(_call("%s/insights" % media_id, tok, {"metric": m}))
        except MetaError as e:
            print("    %-26s 要不到：%s" % (m, str(e)[:80]))
            continue
        if m in v:
            got[m] = v[m]
            print("    %-26s %s" % (m, "{:,}".format(v[m])))
        else:
            print("    %-26s 回了，但沒有這個值" % m)
    return got


def main():
    ap = argparse.ArgumentParser(description="問 IG 貼文有哪些觀看指標可用、哪個接近 App 顯示的數字（只讀）")
    ap.add_argument("--config", default=DEFAULT_CONFIG)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--n", type=int, default=8)
    ap.add_argument("--media-id", default="", help="只問這一則（不用去翻清單）")
    args = ap.parse_args()

    if not os.path.isfile(args.config):
        print("找不到設定檔 %s。" % args.config)
        return 2
    cfg = json.load(open(args.config, encoding="utf-8"))
    token = cfg.get("token") or ""
    igs = [a for a in (cfg.get("accounts") or []) if a.get("platform") == "IG"]
    if not igs:
        print("設定檔裡沒有 IG 帳號。")
        return 2

    all_results = {}   # metric -> {n, nz, max}

    if args.media_id:
        # 只測這一則：帳號清單裡的權杖一把一把試，哪一把要得到就用哪一把
        # （跟 meta_sync.py 的 pick_token 同一個道理，成效要粉專的權杖）。
        print("═══ 只測 media_id=%s ═══" % args.media_id)
        for acc in igs:
            tok = acc.get("pageToken") or token
            print("\n  試「%s」的權杖……" % acc["name"])
            got = probe_one(acc["name"], args.media_id, tok)
            for k, v in got.items():
                o = all_results.setdefault(k, {"n": 0, "nz": 0, "max": 0})
                o["n"] += 1
                if v > 0:
                    o["nz"] += 1
                o["max"] = max(o["max"], v)
    else:
        since = (datetime.date.today() - datetime.timedelta(days=args.days)).isoformat()
        for acc in igs:
            tok = acc.get("pageToken") or token
            print("\n═══ %s ═══" % acc["name"])
            rows = _paged("%s/media" % acc["igUserId"], tok,
                          {"fields": "id,caption,timestamp,media_type"}, since)
            rows = [r for r in rows if str(r.get("timestamp") or "")[:10] >= since][:args.n]
            if not rows:
                print("  這段期間沒有貼文。")
                continue
            for r in rows:
                got = probe_one(acc["name"], r.get("id"), tok, r.get("caption") or "")
                for k, v in got.items():
                    o = all_results.setdefault(k, {"n": 0, "nz": 0, "max": 0})
                    o["n"] += 1
                    if v > 0:
                        o["nz"] += 1
                    o["max"] = max(o["max"], v)

    print("\n  ── 哪些指標要得到（幾則裡有幾則回得了數字、最大值多少）──")
    if all_results:
        print("     %-26s %s  %s  %s" % ("指標", "有回", "不是0", "最大值"))
        for m, o in sorted(all_results.items(), key=lambda kv: -kv[1]["max"]):
            print("     %-26s %2d 則  %2d 則  %s" % (m, o["n"], o["nz"], "{:,}".format(o["max"])))
        print("\n     ⭐ 要找的是最大值比 views 明顯大很多、又接近 App 上顯示數字的那一個 ——")
        print("        crossposted_views／total_views 如果要得到，通常比單純 views 更完整。")
    else:
        print("     一個都要不到 —— 那就不是指標名字的問題，回報給我看。")
    print("\n（只讀，資料庫一個字都沒動。）")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n取消了。")
        sys.exit(1)
