# -*- coding: utf-8 -*-
"""
廣告花費對回影片的離線測試：python3 tests/ads.py（run-all.js 會一起跑）

測 tools/ads_sync.py，不碰網路、不碰資料庫。

⚠️ 這支盯的是「錢對到誰頭上」。對錯了比沒有資料更糟：A 片的廣告費算在 B 片頭上，
   ROAS 從此全是假的。所以每一步都是平台給的 id（不猜），分不出來就不給。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(ROOT, "tools"))
import ads_sync as A   # noqa: E402

FAILED, RAN = [], []


def ok(cond, name):
    RAN.append(name)
    print(("  ok   " if cond else "FAIL  ") + name)
    if not cond:
        FAILED.append(name)


AD = lambda i, **c: {"id": i, "name": "廣告" + i, "effective_status": "ACTIVE", "creative": c}   # noqa: E731
INS = lambda i, spend, **k: dict({"ad_id": i, "spend": str(spend), "impressions": "100", "reach": "80",   # noqa: E731
                                 "inline_link_clicks": "7", "actions": []}, **k)
V = lambda i, *pids: {"id": i, "metrics": [{"postId": p, "link": "https://x/" + p} for p in pids]}   # noqa: E731

# ── ① 廣告 → 貼文：只認平台給的 id ──
ok(A.post_ids_of_ad(AD("a", effective_object_story_id="123_456")) == ["123_456"], "FB 廣告推的貼文＝effective_object_story_id")
ok(A.post_ids_of_ad(AD("a", effective_instagram_media_id="1807")) == ["1807"], "IG 廣告推的貼文＝effective_instagram_media_id")
ok(A.post_ids_of_ad(AD("a")) == [], "沒有推貼文的廣告（純圖文）→ 空的，不硬對")
ok(A.post_ids_of_ad({}) == [] and A.post_ids_of_ad(None) == [], "壞資料不會炸")

# ── ② actions 攤平 ──
ok(A.actions_of({"actions": [{"action_type": "purchase", "value": "3"}, {"action_type": "purchase", "value": "2"}]}) == {"purchase": 5.0},
   "同一種 action 會加起來")
ok(A.actions_of({"actions": [{"action_type": "x", "value": "不是數字"}]}) == {}, "值壞掉就略過，不炸")

# ── ③ 貼文 → 影片：同一則貼文只能屬於一支片 ──
by, dup = A.index_videos_by_post([V("V1", "p1", "p2"), V("V2", "p3")])
ok(by == {"p1": "V1", "p2": "V1", "p3": "V2"} and dup == [], "postId 反查影片")
by, dup = A.index_videos_by_post([V("V1", "p1"), V("V2", "p1")])
ok("p1" not in by and dup == ["p1"], "**同一則貼文掛在兩支片上 → 兩支都不給**（不知道算誰的就不算）")

# ── ④ 錢對到誰頭上 ──
by, _ = A.index_videos_by_post([V("V1", "123_456"), V("V2", "1807")])
plan, orphan = A.build_rows(
    [AD("a1", effective_object_story_id="123_456"), AD("a2", effective_instagram_media_id="1807"),
     AD("a3", effective_object_story_id="999_999"), AD("a4")],
    [INS("a1", 1500.5, actions=[{"action_type": "purchase", "value": "2"}]), INS("a2", 800), INS("a3", 300)],
    by, "2026-08-15", "2026-09-14")
ok(set(plan) == {"V1", "V2"}, "**對得到的廣告掛到對的影片上**")
ok(plan["V1"][0]["spend"] == 1500.5 and plan["V1"][0]["adId"] == "a1", "花費跟廣告 id 都在")
ok(plan["V1"][0]["purchases"] == 2, "購買次數從 actions 拿")
ok(plan["V1"][0]["clicks"] == 7, "點擊用 inline_link_clicks（那才是點連結，不是點圖）")
ok(plan["V1"][0]["since"] == "2026-08-15" and plan["V1"][0]["until"] == "2026-09-14", "區間記在每一列上（之後才算得出月報）")
ok([o["adId"] for o in orphan] == ["a3", "a4"], "**對不到的廣告單獨列出來，不硬塞給任何一支片**")
ok(orphan[0]["spend"] == 300 and orphan[0]["posts"] == ["999_999"], "對不到的也記花費跟它推的貼文（人才查得出為什麼）")
ok("V3" not in plan, "沒有花費紀錄的影片不會生出一列 0")

# ── ⑤ 合併：歷史不丟、同一則同區間只留最新 ──
old = [{"adId": "a1", "since": "2026-07-01", "until": "2026-07-31", "spend": 100},
       {"adId": "a1", "since": "2026-08-15", "until": "2026-09-14", "spend": 999}]
new = [{"adId": "a1", "since": "2026-08-15", "until": "2026-09-14", "spend": 1500.5}]
m = A.merge_ads(old, new)
ok(len(m) == 2, "**舊區間的列原封不動留著**（不要弄丟歷史）")
ok([r["spend"] for r in m] == [100, 1500.5], "同一則廣告同一個區間只留最新那一列，而且順序不變")
ok(A.merge_ads(None, new) == new and A.merge_ads([], []) == [], "空的不會炸")

# ── ⑥ 沒 --write 不准寫；權限要查 ads_read ──
SRC = open(os.path.join(ROOT, "tools", "ads_sync.py"), encoding="utf-8").read()
ok(A.ADS_SCOPE == "ads_read", "要的權限是 ads_read")
ok('if not args.write:' in SRC and SRC.index('if not args.write:') < SRC.index('write_back(cfg_fb, fb_token, plan, byvid)'),
   "**預設只看不寫**：寫回去那一行排在 --write 判斷之後")
ok('fb_token = _fs.sign_in(cfg_fb)\n    done, failed = write_back' in SRC,
   "寫之前重新登入（長時間同步會讓 Firebase 權杖過期 —— 2026-09-13 那次 178 支全部 401）")
ok('updateMask.fieldPaths=ads&updateMask.fieldPaths=adsAt' in SRC, "只動 ads／adsAt 兩個欄位，其他一個都不碰")
ok('updateMask.fieldPaths=adsSyncStatus' in SRC, "狀態寫進 meta/settings.adsSyncStatus（畫面那張卡才看得到）")
ok("EC_DR_CODE_STATE" in SRC, "跑的是不是舊程式也會回報")

# ── ⑦ 排程真的有接上 ──
META = open(os.path.join(ROOT, "tools", "meta-scheduled.sh"), encoding="utf-8").read()
_call = next((l for l in META.splitlines() if "python3 tools/ads_sync.py" in l), "")
ok("--write" in _call, "**排程會自己跑廣告同步**（老闆選 A 的理由：不要有人定期動手）")
ok(META.index("python3 tools/meta_sync.py") < META.index("python3 tools/ads_sync.py"),
   "排在成效同步後面 —— 它靠 metrics 裡的 postId 對，成效要先寫進去")

# ── ⑧ 設定精靈：一次貼完 ──
SETUP = open(os.path.join(ROOT, "tools", "meta_setup.py"), encoding="utf-8").read()
ok('"ads_read" in got' in SETUP, "設定精靈會查這把權杖有沒有 ads_read（缺了會拿到空的，而錯誤訊息不會講）")
ok('body["adAccountId"] = ad_account' in SETUP, "廣告帳號 ID 存進同一份設定檔（一次貼完，不用再碰那台機器）")
ok('ad_account.isdigit()' in SETUP, "ID 不像一串數字就不存（貼錯了下一次跑才發現太晚）")

print("\n%d / %d 通過" % (len(RAN) - len(FAILED), len(RAN)))
if FAILED:
    sys.exit(1)
