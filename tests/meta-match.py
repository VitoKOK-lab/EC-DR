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
ok(M.normalize("招財 ✨#水晶，好運！\n下一行") == "招財水晶好運下1行", "表情符號／標點／空白／換行全部丟掉")
ok(M.normalize(None) == "", "沒有文案不會爆掉")

# 寫的時候會換、意思一樣的字要折成同一個 —— 都是真實案例裡一個字就整段對不上的
ok(M.normalize("妳一定要知道的5種") == M.normalize("你一定要知道的五種"),
   "你／妳、阿拉伯數字／中文數字 折成同一個（真實案例：V088）")
ok(M.normalize("他們要的是什麼") == M.normalize("她們要的是什麼"),
   "他／她 折成同一個（真實案例：V035）")
ok(M.normalize("十五") != M.normalize("15"),
   "十百千萬刻意不折 ——「十五」折成「105」是錯的，寧可不折")

print("— 切段 —")
ok(M.shingles("短的") == [], "不足一段的長度切不出段（太短不夠指認）")
ok(len(M.shingles("字" * 60)) == 60 - M.SHINGLE + 1,
   "60 字重疊著切，切得出 60-段長+1 段（每個字各起一段）")

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
ok(M.normalize(CAN_A)[:M.SHINGLE] in idx2.boilerplate
   and M.normalize(CAN_C)[:M.SHINGLE] in idx2.boilerplate,
   "三句共用話都被認出來是罐頭句（資料自己算的，不用手維護清單）")
# 整則貼文只有罐頭話、沒有任何一支的獨家內容 → 誰都不可以對上。
# 三句故意用跟 W0 不一樣的順序接 —— 同樣順序的話，兩句接起來的那個接縫
# 只有 W0 有（df=1、不算罐頭），那時候判給 W0 是對的，測不到罐頭句這件事。
r = M.match_post(post(CAN_C + CAN_B + CAN_A), idx2)
ok(r["videoId"] is None, "只有罐頭話的貼文對不上任何一支（不然全部會判給罐頭話最多的 W0）")
# 有獨家內容的照樣對得上
r = M.match_post(post("第07支的獨家內容說明" * 3 + CAN_A), idx2)
ok(r["videoId"] == "W7", "獨家內容還在，照樣對得上正確的那一支")
ok(M.normalize("第00支的獨家內容說明第00支的獨家內容說明")[:M.SHINGLE] not in idx2.boilerplate,
   "只有一兩支有的內容不會被當成罐頭句丟掉")

print("— 貼文那邊的罐頭句（小編招呼語）也要扣掉 —")
# 2026-09-11 真的跑出來的災難：一支片對到 734 則貼文。
# 磁鐵是片尾那句「留言『藍寶石』．小編私訊您詳情」——
# 它在幾百則商品貼文裡都有，但影片庫裡只有這一支片有，
# 所以用影片算的 df 是 1，一點都不像罐頭句，扣不掉。
CTA = "留言藍寶石小編私訊您詳情謝謝"
MAGNET = vid("MAG", "當藍寶石和緬因貓相遇的獨家故事" + CTA, "2026-08-20")
OTHER = [vid("OK%d" % i, "第%02d支自己的獨家內容說明喔喔喔" % i, "2026-08-%02d" % (i + 1))
         for i in range(6)]
# 幾百則商品貼文，每一則都帶著那句招呼語，但內容跟這支片無關
shop = [post("今天寵粉的是編號%03d的天然寶石數量有限要買要快" % i + CTA,
             at="2026-08-%02dT10:00:00" % (i % 28 + 1)) for i in range(300)]
own = [post("當藍寶石和緬因貓相遇的獨家故事" + CTA)]   # 這支片自己真正的那一則

m, u, ix = M.match_all(shop + own, [MAGNET] + OTHER)
hits = [x for x in m if x["videoId"] == "MAG"]
ok(len(hits) == 1, "招呼語不再是磁鐵：那 300 則商品貼文不會全部被判給這一支（實際對到 %d 則）" % len(hits))
ok(hits and hits[0]["post"]["caption"].startswith("當藍寶石"),
   "但它自己真正的那一則還是對得上（扣罐頭句不能把整支片的指紋扣光）")
ok(ix.dropped_post_boilerplate > 0, "有回報扣掉了幾段貼文罐頭句，不是默默做掉")

# 反過來：一支片正常發在幾個帳號、偶爾重播，不可以被當成罐頭扣掉
normal = [post("第03支自己的獨家內容說明喔喔喔") for _ in range(8)]
m2, _, _ = M.match_all(normal, OTHER)
ok(len(m2) == 8, "同一支片正常發好幾則（多帳號＋重播）不會被誤殺成罐頭句")

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

print("— 涵蓋率（排了的片有幾支沒對到）—")
# 真正要擔心的不是「989 則貼文只對上 238 則」（大多是商品圖文，本來就不在影片庫），
# 而是反過來：系統裡排了、平台上也發了，卻沒對到。
VS = [vid("H1", COPY, "2026-08-20", published=True),   # 期間內，有對到
      vid("M1", COPY, "2026-08-25", published=True),   # 已上片卻沒對到 ← 要抓這種
      vid("U1", COPY, "2026-08-26"),                   # 排了但還沒上片 → 沒對到是正常的
      vid("O1", COPY, "2026-05-01", published=True),   # 期間外，不算
      vid("N0", COPY, "", published=True),             # 沒排過，不算
      vid("D1", COPY, "2026-08-21", published=True, deleted=True)]   # 回收桶，不算
hit, unpub, miss, elsew = S.coverage(VS, "2026-08-12", "2026-09-11", {"H1"}, {"FB 粉專"})
ok([v["id"] for v in hit] == ["H1"] and [v["id"] for v in miss] == ["M1"],
   "只算「這段期間排過的片」，期間外／沒排過／回收桶裡的都不算進分母")
ok([v["id"] for v in unpub] == ["U1"],
   "「排了日期但還沒發出去」要另外分一堆 —— 平台上本來就沒有它，"
   "算進「沒對到」會害我們去查一個不存在的問題（正式資料 153 支裡有 19 支是這種）")

print("— 發在別的帳號的片，不該算進這兩個帳號的分母 —")
# 41 支「已上片卻沒對到」裡有 20 支是這種：十支英文版、十支泰文版，
# 全部發在 TikTok 泰國／英語帳號，本來就不在這兩個 Meta 帳號上。
CONN = {"FB 粉專（Zanagems）", "IG 溱姐主（@tzgems1111）"}
ok(S.expected_here({"account": "IG 溱姐主（@tzgems1111）"}, CONN), "指名發在我們連上的帳號 → 算")
ok(S.expected_here({}, CONN), "沒指定帳號的一般台灣片 → 算")
ok(not S.expected_here({"account": "tiktok-Thailand"}, CONN), "指名發在 TikTok 泰國 → 不算")
ok(not S.expected_here({"origLang": "en"}, CONN), "英文原創 → 不算（走海外帳號）")
ok(not S.expected_here({"origLang": "th"}, CONN), "泰文原創 → 不算")
ok(not S.expected_here({"locale": "en"}, CONN), "英文在地化版 → 不算")
ok(not S.expected_here({"channel": "shopee"}, CONN), "蝦皮版 → 不算")
ok(S.expected_here({"origLang": "zh"}, CONN) and S.expected_here({"origLang": ""}, CONN),
   "中文原創（含沒填的舊資料）→ 算")

mixed = [vid("T1", COPY, "2026-08-20", published=True, account="tiktok-Thailand"),
         vid("T2", COPY, "2026-08-20", published=True)]
h3, u3, m3, e3 = S.coverage(mixed, "2026-08-12", "2026-09-11", set(), CONN)
ok([v["id"] for v in e3] == ["T1"] and [v["id"] for v in m3] == ["T2"],
   "發在別的帳號的獨立一堆，不會混進「已上片卻沒對到」")

# 重播的片：早幾次在 usageHistory，只看 scheduledDate 會把它算成期間外
rp = [vid("P1", COPY, "2026-12-01", published=True, usageHistory=[{"date": "2026-08-30"}])]
h2, u2, m2, e2 = S.coverage(rp, "2026-08-12", "2026-09-11", set(), {"FB 粉專"})
ok([v["id"] for v in m2] == ["P1"], "八月重播過的片算在這段期間內（日期要看 usageHistory）")

print("— 診斷：最像的貼文是哪一則 —")
# 「旺桃花珠寶」這種五個字的片名進不了正式索引（要 20 字）。
# 但它是「平台上根本沒發」還是「發了、只是我門檻設太高」？兩件事處理方式完全不同。
SHORT = vid("S1", "", name="旺桃花珠寶套組")
PS = [{"platform": "IG", "account": "a", "at": "2026-08-22T10:00:00",
       "caption": "✨ 旺桃花珠寶套組｜願你遇見剛剛好的人 ✨ 粉晶與草莓晶的組合"},
      {"platform": "IG", "account": "a", "at": "2026-08-23T10:00:00",
       "caption": "完全不相干的一段文字沒有任何重疊的地方喔喔喔"},
      # 只沾到一半（少了「旺」字）—— 要排在完全命中的那則後面
      {"platform": "IG", "account": "a", "at": "2026-08-24T10:00:00",
       "caption": "今天的桃花珠寶套組開箱來囉大家快來看看"}]
near = S.best_near_miss(SHORT, PS)
ok(near and near[0][2]["caption"].startswith("✨ 旺桃花珠寶"),
   "短片名也找得回「最像的那一則」（→ 是門檻太高，不是沒發）")
ok(len(near) == 2 and near[0][0] > near[1][0],
   "最像的排第一（沾到一半的那則要排後面）")
ok(all("完全不相干" not in x[2]["caption"] for x in near), "完全沾不上邊的貼文不要列出來湊數")
ok(S.best_near_miss(vid("E1", "", name=""), PS) == [],
   "片名文案全空的片沒有東西可比，回空的、不要爆掉")
far = S.best_near_miss(vid("F1", "", name="完全沒有發過的一支影片標題"), PS)
ok(far == [], "平台上真的沒發過的，回空的 —— 這時候才是「沒發」")

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

# 問的時候只列同一種平台 —— 拿粉專去對 IG 帳號是不可能的，那些選項只是雜訊
MISS = ["IG 泰熙爾汗（@tzgems5588）", "IG 英文（@tzgrotwofficial）",
        "IG 代理（@tzgems666）", "IG 官方（@tzgrotw）", "FB 粉專（Zanagems）"]
ok(U.naming_choices({"platform": "FB"}, MISS) == ["FB 粉專（Zanagems）"],
   "問粉專的時候只列粉專（第一版把 4 個 IG 也列出來，老闆看不懂在問什麼）")
ok(U.naming_choices({"platform": "IG"}, MISS) == MISS[:4], "問 IG 的時候只列 IG")
ok(U.naming_choices({"platform": "FB"}, MISS[:4]) == MISS[:4],
   "篩完一個都不剩就還是全部列出來（總比什麼都不給選好）")

extra = U.map_accounts([], [{"id": "17z", "username": "newone"}], PLATS)[0]
ok(extra[0]["name"] == "IG @newone", "清單上還沒有的新帳號照樣寫得進去，不會被丟掉")

print("\n%d / %d 通過" % (len(RAN) - len(FAILED), len(RAN)))
if FAILED:
    sys.exit(1)
