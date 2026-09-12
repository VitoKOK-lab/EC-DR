#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""問 Meta：FB 粉專的貼文到底有哪些「觀看」指標可以要？

    python3 tools/meta_probe_fb.py            看最近 8 則
    python3 tools/meta_probe_fb.py --n 20     看最近 20 則
    python3 tools/meta_probe_fb.py --days 60  往回 60 天挑

**只讀，不寫資料庫、不改任何東西。**

為什麼要有這一支：
2026-09-12 老闆看畫面問「fb 怎麼才 5636」。查下去 ——
FB 那 290 則貼文有 **86,241 個讚、12,148 則留言，觀看卻只有 5,962**，
其中 180 則的觀看是 0。讚比觀看多 14 倍，那不是成績差，那是數字錯了。

而且讚是從**洞察**（post_reactions_by_type_total）拿到的，拿得到 ——
所以不是權杖問題、也不是洞察整個壞掉，是 **views 這個指標名字對 FB 貼文不合用**：
    views —— (#100) The value must be a valid insights metric
    post_impressions —— (#100) The value must be a valid insights metric

Meta 在 2024-08 把 impressions／plays／video_views 併成 views，
但那是**媒體**（IG media、Reels）的指標；FB 粉專貼文不見得吃同一組。
IG 那邊 139 則全部要得到（270 萬觀看），FB 這邊要不到 —— 兩邊的指標名不一樣。

與其猜一個名字換上去，不如直接問：這支把一串候選指標**一個一個**去問，
印出哪些真的回得了數字。知道答案再去改 meta_sync 的 FB_METRICS／VIEW_KEYS。
"""

import argparse
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from meta_sync import (_call, _insight_values, _paged, MetaError,  # noqa: E402
                       DEFAULT_CONFIG)

# 候選指標。分三群，印的時候分開看比較清楚：
#   新的（2024 併過之後）／舊的（可能還活著）／Reels 專用
CANDIDATES = [
    ("新", ["views", "post_impressions", "post_impressions_unique",
            "post_impressions_organic", "post_impressions_paid"]),
    ("舊", ["post_video_views", "post_video_views_unique",
            "post_video_views_organic", "post_video_views_paid",
            "post_video_complete_views_30s", "post_video_avg_time_watched"]),
    ("Reels", ["blue_reels_play_count", "post_video_social_actions",
               "fb_reels_total_plays", "post_video_view_time"]),
    ("對照組", ["post_reactions_by_type_total", "post_clicks"]),
]


def main():
    ap = argparse.ArgumentParser(description="問 FB 貼文有哪些觀看指標可用（只讀）")
    ap.add_argument("--config", default=DEFAULT_CONFIG)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--n", type=int, default=8)
    args = ap.parse_args()

    if not os.path.isfile(args.config):
        print("找不到設定檔 %s。" % args.config)
        return 2
    cfg = json.load(open(args.config, encoding="utf-8"))
    token = cfg.get("token") or ""
    fbs = [a for a in (cfg.get("accounts") or []) if a.get("platform") == "FB"]
    if not fbs:
        print("設定檔裡沒有 FB 粉專。")
        return 2

    since = (datetime.date.today() - datetime.timedelta(days=args.days)).isoformat()
    for acc in fbs:
        tok = acc.get("pageToken") or token
        print("\n═══ %s ═══" % acc["name"])
        rows = _paged("%s/posts" % acc["pageId"], tok,
                      {"fields": "id,message,created_time,permalink_url,"
                                 "attachments{media_type,type}"}, since)
        rows = rows[:args.n]
        if not rows:
            print("  這段期間沒有貼文。")
            continue

        # 哪些指標在「至少一則」上回得了數字 —— 這才是我們要的答案
        works = {}
        for r in rows:
            pid = r.get("id")
            att = ((r.get("attachments") or {}).get("data") or [{}])[0]
            kind = att.get("media_type") or att.get("type") or "?"
            print("\n  %s  %s  %s" % (str(r.get("created_time"))[:10], kind,
                                      (r.get("message") or "")[:28].replace("\n", " ")))
            for group, mets in CANDIDATES:
                got = []
                for m in mets:
                    try:
                        d = _call("%s/insights" % pid, tok, {"metric": m})
                    except MetaError as e:
                        msg = str(e)
                        got.append("%s ✗%s" % (m, "(空)" if "valid insights" not in msg else ""))
                        continue
                    vals = _insight_values(d)
                    if m in vals:
                        got.append("%s = %s" % (m, "{:,}".format(vals[m])))
                        works.setdefault(m, 0)
                        works[m] += 1
                    else:
                        got.append("%s ✗(回空的)" % m)
                ok_only = [g for g in got if "=" in g]
                print("    %-6s %s" % (group, "　".join(ok_only) if ok_only else "（一個都要不到）"))

        print("\n  ── %s：哪些指標要得到（%d 則裡有幾則回得了數字）──" % (acc["name"], len(rows)))
        if works:
            for m, n in sorted(works.items(), key=lambda kv: -kv[1]):
                print("     %-34s %d / %d 則" % (m, n, len(rows)))
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
