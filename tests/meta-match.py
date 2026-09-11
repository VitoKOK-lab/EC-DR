# -*- coding: utf-8 -*-
"""
貼文↔影片比對的離線測試：python3 tests/meta-match.py（run-all.js 會一起跑）

這支測的是 tools/meta_match.py，不碰網路、不碰資料庫。
比對錯了的代價是「把 A 片的成效算在 B 片頭上」—— 比沒有資料還糟，
所以這裡每一條都盯著同一件事：**寧可說對不上，不要猜。**
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import meta_match as M   # noqa: E402

FAILED = []
RAN = []


def ok(cond, name):
    RAN.append(name)
    if cond:
        print("  ok   " + name)
    else:
        print("FAIL  " + name)
        FAILED.append(name)


def vid(i, copy, date="", **kw):
    v = {"id": i, "videoCopy": copy, "scheduledDate": date}
    v.update(kw)
    return v


def post(caption, at="2026-08-20T10:00:00", **kw):
    p = {"id": "p1", "caption": caption, "at": at, "permalink": ""}
    p.update(kw)
    return p


# 一段夠長、夠獨特的文案（正規化後 60 字以上，切得出三段）
COPY = ("這個不是顏料它是一整片的寶石宥溱在這邊告訴你打造一條項鍊要經過幾道工序"
        "從選料開璞切割拋光到鑲嵌每一步都不能出錯師傅說這一批的顏色是今年最好的")


print("— 文案正規化 —")
ok(M.normalize("臺灣") == M.normalize("台灣"), "臺／台 視為同一個字（Drive 用台、系統用臺）")
ok(M.normalize("ＡＢＣ１２３") == "abc123", "全形轉半形、英文轉小寫")
ok(M.normalize("招財 ✨#水晶，好運！\n下一行") == "招財水晶好運下一行", "表情符號／標點／空白／換行全部丟掉")
ok(M.normalize(None) == "", "沒有文案不會爆掉")

print("— 切段 —")
ok(M.shingles("短的") == [], "不足 20 字切不出段（太短不夠指認）")
ok(len(M.shingles("字" * 60)) == 41, "60 字重疊著切成 41 段（第 1～41 個字各起一段）")

print("— 太短的文案不參加比對 —")
idx = M.Index([vid("V1", "1"), vid("V2", "請剪輯師自填"), vid("V3", COPY)])
ok(len(idx) == 1 and "V3" in idx.entries, "佔位字「1」與「請剪輯師自填」被擋在外面（正式資料有 48 支是「1」）")
ok(set(idx.skipped) == {"V1", "V2"}, "被擋掉的有記下來，不是默默消失")

print("— 刪掉的影片不參加比對 —")
idx = M.Index([vid("V3", COPY), vid("V9", COPY, deleted=True)])
ok(len(idx) == 1, "回收桶裡的片不會被對上（不然成效會算到已刪的那筆）")

print("— 平台那則跟系統文案的四種常見落差 —")
idx = M.Index([vid("V3", COPY, "2026-08-20")])
ok(M.match_post(post(COPY), idx)["videoId"] == "V3", "一模一樣")
ok(M.match_post(post(COPY + "\n\n#水晶 #招財 ✨首頁連結加入社群"), idx)["videoId"] == "V3", "後面被加 hashtag／表情")
ok(M.match_post(post("✨【限時】\n" + COPY), idx)["videoId"] == "V3", "前面被加開頭語")
ok(M.match_post(post(COPY[:len(COPY) // 2]), idx)["videoId"] == "V3", "貼文只留了前一半（口播稿被剪短）")

print("— 對不上就說對不上 —")
r = M.match_post(post("完全不相干的一段文字拿來測試看看會不會被亂配對到某一支影片上面去"), idx)
ok(r["videoId"] is None, "不相干的貼文不會被硬配給任何一支")
r = M.match_post(post("短"), idx)
ok(r["videoId"] is None and "太短" in r["why"], "文字太短的貼文直接說比對不了（而且說清楚是太短，不是沒有文字）")

print("— 罐頭句（每支片都有的結尾）不能拿來當證據 —")
# 三句不同的罐頭話，各自被不同一群片共用；W0 剛好三句都有。
# 這是真的會發生的形狀 —— 結尾要接社群、接活動、接免責聲明，有的片三句都接。
# 罐頭句沒扣掉的話，W0 會變成「每一則結尾有罐頭話的貼文」的磁鐵：
# 它的分數永遠比別人高一分，於是每一則都被判給它。
CAN_A = "首頁連結加入溱姐寵粉社群記得按追蹤不要錯過"   # W0–W9 共用
CAN_B = "本月限定活動買二送一數量有限送完為止喔喔"     # W0–W5、W10–W14 共用
CAN_C = "圖片僅供參考實際商品以現場為準謝謝大家支持"   # W0、W15–W20 共用
many = []
for i in range(40):
    tail = ""
    if i <= 9:
        tail += CAN_A
    if i <= 5 or 10 <= i <= 14:
        tail += CAN_B
    if i == 0 or 15 <= i <= 20:
        tail += CAN_C
    many.append(vid("W%d" % i, ("第%02d支的獨家內容說明" % i) * 3 + tail, "2026-08-%02d" % (i + 1)))
idx2 = M.Index(many)
ok(M.normalize(CAN_A)[:20] in idx2.boilerplate and M.normalize(CAN_C)[:20] in idx2.boilerplate,
   "三句共用話都被認出來是罐頭句（資料自己算的，不用手維護清單）")
# 整則貼文只有罐頭話、沒有任何一支的獨家內容 → 誰都不可以對上。
# 三句故意用跟 W0 不一樣的順序接 —— 同樣順序的話，兩句接起來的那個接縫
# 只有 W0 有（df=1、不算罐頭），那時候判給 W0 是對的，測不到罐頭句這件事。
r = M.match_post(post(CAN_C + CAN_B + CAN_A), idx2)
ok(r["videoId"] is None, "只有罐頭話的貼文對不上任何一支（不然全部會判給罐頭話最多的 W0）")
# 有獨家內容的照樣對得上
r = M.match_post(post("第07支的獨家內容說明" * 3 + CAN_A), idx2)
ok(r["videoId"] == "W7", "獨家內容還在，照樣對得上正確的那一支")
ok(M.normalize("第00支的獨家內容說明第00支的獨家內容說明")[:20] not in idx2.boilerplate,
   "只有一兩支有的內容不會被當成罐頭句丟掉")

print("— 兩支文案一樣（同腳本重播／中英版）—")
two = [vid("A1", COPY, "2026-06-20"), vid("A2", COPY, "2026-08-20")]
idx3 = M.Index(two)
r = M.match_post(post(COPY, at="2026-08-21T09:00:00"), idx3)
ok(r["videoId"] == "A2", "日期分得開的時候，挑日期對得上的那一支")
r = M.match_post(post(COPY, at="2026-06-19T09:00:00"), idx3)
ok(r["videoId"] == "A1", "同上，反過來也要對")
r = M.match_post(post(COPY, at="2026-12-25T09:00:00"), idx3)
ok(r["videoId"] is None and sorted(r["candidates"]) == ["A1", "A2"],
   "日期也分不開就回報「要人看一下」，並且把兩個候選都講出來")

print("— 重播的片：早幾次上片在 usageHistory 裡 —")
rerun = [vid("R1", COPY, "2026-09-01",
             usageHistory=[{"date": "2026-06-10"}, {"date": "2026-07-15"}]),
         vid("R2", COPY, "2026-12-01")]
idx4 = M.Index(rerun)
ok(M.video_dates(rerun[0]) == ["2026-06-10", "2026-07-15", "2026-09-01"],
   "一支片的上片日期＝scheduledDate ＋ 每一次重播")
r = M.match_post(post(COPY, at="2026-06-11T09:00:00"), idx4)
ok(r["videoId"] == "R1", "六月那一則對得回 R1（只看 scheduledDate 的話這則會分不出來）")

print("— 上片連結一模一樣：直接對上，不必比文案 —")
idx5 = M.Index([vid("L1", COPY, "2026-08-20", publishedLink="https://www.instagram.com/p/ABC/"),
                vid("L2", "完全不同的另一段文案" * 6, "2026-08-20")])
r = M.match_post(post("隨便什麼字都可以反正連結一樣就是它" * 3,
                      permalink="https://www.instagram.com/p/ABC/"), idx5)
ok(r["videoId"] == "L1" and "連結" in r["why"], "連結一樣就是同一則，優先於文案比對")

print("— 整批比對 —")
m, u, ix = M.match_all([post(COPY), post("不相干的文字" * 6)], [vid("V3", COPY, "2026-08-20")])
ok(len(m) == 1 and len(u) == 1, "整批跑完會分成「對上的」與「對不上的」兩疊")
ok(m[0]["videoId"] == "V3" and u[0]["why"], "對不上的那一疊每一筆都有寫原因")

# ---------------------------------------------------------------------------
# 同步腳本裡「把這次抓到的成效併進原本那一份」的規則
# （meta_sync 只 import 標準函式庫與 _fs，離線 import 安全）
# ---------------------------------------------------------------------------
import meta_sync as S   # noqa: E402

print("— 成效併檔 —")
old = [{"platform": "IG", "account": "IG 官方", "views": 100, "postId": "P1"}]
new = [{"platform": "IG", "account": "IG 官方", "views": 350, "postId": "P1"}]
ok(S.merge_metrics(old, new) == new, "同一則貼文再抓一次，是更新那一列，不是多一列")

new2 = [{"platform": "IG", "account": "IG 官方", "views": 80, "postId": "P2"}]
r = S.merge_metrics(old, new2)
ok(len(r) == 2 and r[0]["postId"] == "P1" and r[1]["postId"] == "P2",
   "同一支片在同一個帳號重播＝兩則不同貼文，兩列都要留（用 platform+account 當 key 會被蓋掉）")

old3 = [{"platform": "FB", "account": "FB 粉專", "views": 9}]   # 舊資料沒有 postId
r = S.merge_metrics(old3, [{"platform": "IG", "account": "IG 官方", "views": 5, "postId": "P9"}])
ok(len(r) == 2, "以前人工填的那幾列沒有 postId，也不能被洗掉")

ok(S.merge_metrics(None, new) == new, "本來沒有成效的片不會爆掉")

print("\n%d / %d 通過" % (len(RAN) - len(FAILED), len(RAN)))
if FAILED:
    sys.exit(1)
