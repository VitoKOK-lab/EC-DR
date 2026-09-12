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

# 第一輪（2026-09-12，8 則）的結論，留著當紀錄：
#   views / post_impressions / blue_reels_play_count  → **這個物件上根本沒有**（8 則全要不到）
#   post_video_views 那一族                            → 要得到，但對 Reels 回接近 0 的垃圾
# 正式資料佐證：FB 290 則裡 288 則是 Reels，其中 178 則觀看是 0，最大只有 2,020，
# 而同一批貼文有 85,806 個讚 —— 有一則 1,152 個讚只有 148 觀看。那不是成績，是壞數字。
#
# 所以第二輪不再猜名字：**叫 Meta 自己把它有的列出來**。
# Reels 的播放數不在「貼文」物件上，要往下找它附掛的**影片物件**
# （attachments.target.id 或 object_id），那裡才有 video_insights。
LEGACY = ["post_video_views", "post_reactions_by_type_total", "post_clicks"]


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
                      {"fields": "id,message,created_time,permalink_url,object_id,"
                                 "attachments{media_type,type,target}"}, since)
        rows = rows[:args.n]
        if not rows:
            print("  這段期間沒有貼文。")
            continue

        # 不再猜名字：叫 Meta 自己把它有的列出來
        works = {}
        for r in rows:
            pid = r.get("id")
            att = ((r.get("attachments") or {}).get("data") or [{}])[0]
            kind = att.get("media_type") or att.get("type") or "?"
            vid_id = ((att.get("target") or {}).get("id")) or r.get("object_id") or ""
            print("\n  %s  %-8s %s" % (str(r.get("created_time"))[:10], kind,
                                       (r.get("message") or "")[:26].replace("\n", " ")))

            # ① 貼文物件：它自己說有哪些（不帶 metric 就是「全部給我」）
            for path, label in [("%s/insights" % pid, "貼文")] + (
                    [("%s/video_insights" % vid_id, "影片")] if vid_id else []):
                try:
                    d = _call(path, tok, {})
                except MetaError as e:
                    print("    %s　要不到：%s" % (label, str(e)[:88]))
                    continue
                vals = _insight_values(d)
                if not vals:
                    print("    %s　回了空的" % label)
                    continue
                show = sorted(vals.items(), key=lambda kv: -kv[1])[:8]
                print("    %s　%s" % (label, "　".join("%s=%s" % (k, "{:,}".format(v)) for k, v in show)))
                for k, v in vals.items():
                    o = works.setdefault(k, {"n": 0, "nz": 0, "max": 0})
                    o["n"] += 1
                    if v > 0:
                        o["nz"] += 1
                    o["max"] = max(o["max"], v)
            if not vid_id:
                print("    （這則沒有附掛影片，所以沒有影片物件可問）")

            # ② 舊的那幾個照樣量一次，好跟上面對照
            got = []
            for m in LEGACY:
                try:
                    vals = _insight_values(_call("%s/insights" % pid, tok, {"metric": m}))
                except MetaError:
                    continue
                if m in vals:
                    got.append("%s=%s" % (m, "{:,}".format(vals[m])))
            if got:
                print("    舊的　%s" % "　".join(got))

        print("\n  ── %s：哪些指標要得到（%d 則裡有幾則回得了數字）──" % (acc["name"], len(rows)))
        if works:
            print("     %-34s %s  %s  %s" % ("指標", "有回", "不是0", "最大值"))
            for m, o in sorted(works.items(), key=lambda kv: (-kv[1]["nz"], -kv[1]["max"])):
                print("     %-34s %2d 則  %2d 則  %s" % (m, o["n"], o["nz"], "{:,}".format(o["max"])))
            print("\n     ⭐ 要找的是「不是 0 的則數多、最大值合理」那一個 ——")
            print("        你的 Reels 有上千個讚，播放數不可能只有兩三百。")
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
