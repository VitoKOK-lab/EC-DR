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

print("— 文案打在「片名」那一格也要對得到 —")
# 2026-09-11 拿真實貼文跑，193 則只對上 20 則。查下去：對不上的大多**在系統裡**，
# 只是整段文案被打在片名那一格，videoCopy 是空的。只看 videoCopy 就看不到那一大半。
idxN = M.Index([vid("N1", "", name=COPY), vid("N2", COPY[:30] + "完全不同的另一段內容拿來墊長度用的文字")])
ok(M.match_post(post(COPY), idxN)["videoId"] == "N1", "文案在片名裡，照樣對得回這一支")
ok(M.match_post(post("✨" + COPY + " #珠寶"), idxN)["videoId"] == "N1", "片名那一格也吃得下前後加料")
idxR = M.Index([vid("R9", "", rawName=COPY)])
ok(M.match_post(post(COPY), idxR)["videoId"] == "R9", "原始檔名（rawName）也算一份")
# 三個欄位要各切各的。接成一串再切，會生出「片名的結尾＋文案的開頭」這一段 ——
# 那段字在現實中從來沒有出現過（平台上不會有人把片名接著文案一起貼），是假指紋。
# 造法：片名、文案各剛好 20 字（各切得出一段），貼文只拿「片名後半＋文案前半」。
# 接成一串的話這 20 字正好是接縫那一段，會對上；各切各的就對不上。
NM, CP = "甲" * 10 + "乙" * 10, "丙" * 10 + "丁" * 10
j = M.Index([vid("J1", CP, name=NM)])
ok(M.match_post(post(NM), j)["videoId"] == "J1", "片名整段貼出來對得上（確認這支片真的有進索引）")
# 兩個方向的接縫都要檢查 —— 誰接誰只是 video_texts 裡的排列順序，
# 只測一個方向的話，把順序對調就測不到了。
ok(M.match_post(post("乙" * 10 + "丙" * 10), j)["videoId"] is None
   and M.match_post(post("丁" * 10 + "甲" * 10), j)["videoId"] is None,
   "片名接文案的那個「接縫」不算指紋（那是假的，平台上不會出現）")

print("— 太短的文案不參加比對 —")
idx = M.Index([vid("V1", "1", name="1"), vid("V2", "請剪輯師自填", name="請剪輯師自填"), vid("V3", COPY)])
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

# ---------------------------------------------------------------------------
# 設定精靈：把 Meta 查到的帳號對上系統「上片平台」清單的名字
# ---------------------------------------------------------------------------
import meta_setup as U   # noqa: E402

print("— 帳號對名字 —")
PLATS = [{"name": "IG 溱姐主（@tzgems1111）", "utm": "ig_tzgems1111"},
         {"name": "IG 官方（@tzgrotw）", "utm": "ig_tzgrotw"},
         {"name": "IG 英文（@tzgrotwofficial）", "utm": "ig_tzgrotwofficial"},
         {"name": "FB 粉專（Zanagems）", "utm": "fb_zanagems"},
         {"name": "LINE 社群（珠寶社群）", "utm": "line_group"}]
ok(U.handle_of({"utm": "ig_tzgems1111"}) == "tzgems1111", "utm 裡取得出 handle")
ok(U.handle_of({"utm": ""}) == "" and U.handle_of({}) == "", "沒有 utm 不會爆掉")

# 粉專在 FB 上的顯示名稱可能帶空白，utm 裡的 handle 沒有 —— 要對得上
pages = [{"id": "100", "name": "Zana Gems"}]
igs = [{"id": "17a", "username": "TzGems1111"}, {"id": "17b", "username": "tzgrotw"}]
acc, miss = U.map_accounts(pages, igs, PLATS)
ok([a["name"] for a in acc] == ["IG 溱姐主（@tzgems1111）", "IG 官方（@tzgrotw）",
                                 "FB 粉專（Zanagems）"],
   "IG 與粉專都對回系統原本的名字（大小寫不同也對得上）")
ok(acc[0]["igUserId"] == "17a" and acc[2]["pageId"] == "100", "id 有帶著（IG 與 FB 欄位名不同）")
ok(miss == ["IG 英文（@tzgrotwofficial）"],
   "清單上有、Meta 查不到的帳號要點出來（那通常是還沒切專業帳號）")
ok(not [m for m in miss if "LINE" in m], "LINE 社群沒有 API，不算「少了」，不要拿去煩他")

acc2, _ = U.map_accounts([{"id": "100", "name": "Zana Gems", "token": "PAGE_TOK"}], [], PLATS)
ok(acc2[0].get("pageToken") == "PAGE_TOK",
   "粉專自己的權杖要存下來（粉專貼文用個人權杖會被擋成 code=190）")
acc3, _ = U.map_accounts([{"id": "100", "name": "Zana Gems"}], [], PLATS)
ok("pageToken" not in acc3[0], "Meta 沒給粉專權杖時不要硬塞一個空字串進去")

# 這一條守的是「有沒有跟 Meta 要粉專權杖」。要不到的後果是 FB 那半邊整個抓不到，
# 而那件事要真的連上 Meta 才會發現 —— 所以在這裡用字串守住，便宜但擋得住。
ok("access_token" in U.ACCOUNTS_FIELDS, "跟 /me/accounts 要欄位時有把粉專權杖要進來")
ok("instagram_business_account" in U.ACCOUNTS_FIELDS, "也要把粉專連著的 IG 要進來")

renamed = [{"platform": "FB", "name": "FB 泰熙爾 札娜寶石學院", "pageId": "1"}]
ok([a["name"] for a in U.needs_naming(renamed, PLATS)] == ["FB 泰熙爾 札娜寶石學院"],
   "粉專改過名字、對不回系統清單的，要抓出來問人（不能猜）")
ok(U.needs_naming([{"name": "IG 官方（@tzgrotw）"}], PLATS) == [],
   "對得上的就不要多問")

extra = U.map_accounts([], [{"id": "17z", "username": "newone"}], PLATS)[0]
ok(extra[0]["name"] == "IG @newone", "清單上還沒有的新帳號照樣寫得進去，不會被丟掉")

print("\n%d / %d 通過" % (len(RAN) - len(FAILED), len(RAN)))
if FAILED:
    sys.exit(1)
