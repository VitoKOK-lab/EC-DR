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
normal = [post("第03支自己的獨家內容說明喔喔喔", **{"account": "IG %d" % (i % 2)})
          for i in range(8)]
m2, _, _ = M.match_all(normal, OTHER)
ok(len(m2) == 8, "同一支片正常發好幾則（多帳號＋重播）不會被誤殺成罐頭句")

print("— 貼文那邊的門檻要跟著「帳號數」走，不是跟著總則數走 —")
# 一開始貼文這邊沿用影片那邊的「超過 3% 算罐頭」。1,183 則的 3% 是 35，
# 可是 V081 的招呼語只出現十幾次就足以當磁鐵，35 這條線根本攔不到。
# 貼文這邊該問的是「一支片最多可能變成幾則貼文」＝ 帳號數 × 每個帳號發幾次。
# 關鍵形狀：總則數很多（1,200），但招呼語只出現 15 次。
# 用比例算：1200 的 3% ＝ 36，15 < 36 → 攔不到，磁鐵成立。
# 用帳號數算：2 個帳號 × 每個帳號頂多 5 次 ＝ 10，15 > 10 → 攔得到。
CTA2 = "首頁鏈接加入溱姐寵粉社群記得追蹤"
lots = [post("今天寵粉編號%03d的天然寶石限量發售喔喔" % i + (CTA2 if i < 15 else ""),
             **{"account": "FB 粉專" if i % 2 else "IG 溱姐主"}) for i in range(1200)]
vs = [vid("Z1", "獨家內容這一支講的是完全不同的事情喔喔喔" + CTA2, "2026-08-20")]
m3, _, ix3 = M.match_all(lots, vs)
ok(len(m3) == 0,
   "招呼語只出現 15 次也要攔得到（總則數 1,200，用 3% 算門檻是 36，攔不到）")
ok(ix3.dropped_post_boilerplate > 0, "而且要講出來扣掉了幾段")

print("— 只對上一小段，證據不夠 —")
# 招呼語在 V081 的指紋裡只佔 1 段（55 段裡的 1 段），就把 10 則不相干的
# 商品貼文吸了過去。一段＝12 個字，太薄了。
LONG = vid("L9", "這支片自己的獨家內容非常長講了很多東西而且每一句都不一樣喔喔喔喔喔喔", "2026-08-20")
idxL = M.Index([LONG])
# 從它的指紋裡挑一段真的段落，塞進一段完全不相干的商品文案裡 ——
# 這正是招呼語會造成的形狀：只有那一段一樣，前後全都不一樣。
shared = sorted(idxL.entries["L9"]["key"])[0]
r = M.match_post(post("完全不相干的商品文案限量發售" + shared + "留言私訊您詳情"), idxL)
ok(r["videoId"] is None and "證據不夠" in r["why"],
   "指紋很大的片，只對上一段不算數（那正是招呼語的形狀）")
r = M.match_post(post("這支片自己的獨家內容非常長講了很多東西而且每一句都不一樣喔喔喔喔喔喔"), idxL)
ok(r["videoId"] == "L9", "整段都對上的照樣對得回去")

# 短片名：正規化後剛好 13 個字 → 指紋只有 2 段。
# 「一律要對上兩段」對它來說剛好還過得去，但只要再短一個字就只剩 1 段，
# 那時候它能給的全部就是那一段 —— 不能因此永遠對不到。
SHORT_NAME = "招財旺事業平步青雲手串組"      # 12 字 → 指紋 1 段
SHORTV = M.Index([vid("S9", "", name=SHORT_NAME)])
ok(len(SHORTV.entries) == 1, "12 字的短片名進得了索引（剛好一段）")
ok(len(SHORTV.entries["S9"]["key"]) == 1, "它的指紋確實只有一段")
r = M.match_post(post("✨ " + SHORT_NAME + " ｜ 限量發售中"), SHORTV)
ok(r["videoId"] == "S9", "指紋只有一段的短片名，對上它全部就算數（不能被一律要求兩段擋掉）")

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
SYNC_SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "..", "tools", "meta_sync.py"), encoding="utf-8").read()

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

print("— 寫回資料庫：只動該動的欄位（v201）—")
# 快照算得再對，沒寫進去就等於沒有。而寫太多欄位比沒寫更糟 ——
# 這是正式資料，全公司即時同步。
_SENT = []
_realpatch, _realbase = S._fs._patch, S._fs.docs_base
S._fs.docs_base = lambda cfg: "https://x/documents"
S._fs._patch = lambda url, body, tok: _SENT.append((url, body))
S.write_back({}, "tok", [{"videoId": "V1", "metrics": [{"postId": "P1", "views": 9}],
                          "hist": [{"postId": "P1", "d": "2026-09-11", "views": 9, "comments": 1}],
                          "fillLink": ""}], False)
_url, _body = _SENT[-1]
ok("updateMask.fieldPaths=metricsHist" in _url, "快照真的有寫進去（而且是走 updateMask）")
ok(_body["fields"]["metricsHist"]["arrayValue"]["values"][0]["mapValue"]["fields"]["d"]["stringValue"]
   == "2026-09-11", "寫的是算出來的那幾個點")
ok("updateMask.fieldPaths=publishedLink" not in _url, "沒叫它補連結就不要碰 publishedLink")
ok(sorted(_url.split("?")[1].split("&")) == sorted(
   ["updateMask.fieldPaths=metrics", "updateMask.fieldPaths=metricsAt",
    "updateMask.fieldPaths=metricsHist"]), "整份只動這三個欄位，其他一個都不碰")
_SENT[:] = []
S.write_back({}, "tok", [{"videoId": "V2", "metrics": [], "fillLink": ""}], False)
ok("metricsHist" not in _SENT[-1][0], "沒算快照的時候不要送一個空的去蓋掉本來有的")
S._fs._patch, S._fs.docs_base = _realpatch, _realbase

print("— 對到很多則：是磁鐵，還是同一支片重發？（v202）—")
# 原本只看「對到幾則」，超過 8 則就喊誤配。那個數字是照 734 則那次大磁鐵訂的。
# 結果一支寵粉商品片在兩個平台、半年內重發 11 次也被喊成誤配，還擋住寫入。
# 老闆：「這可不該會重覆，如果重覆他就是同一支片，可能重覆發了。」
#
# 磁鐵跟重發的**形狀**不一樣，看形狀比看數量準。
CTA_LONG = "留言藍寶石小編私訊您詳情謝謝大家支持記得追蹤不要錯過喔"
磁鐵們 = ["今天寵粉的是編號%03d的天然寶石數量有限要買要快" % i + CTA_LONG for i in range(20)]
重發們 = ["國民珠寶商泰熙爾汗寵粉啦大牌都用的寶石肯定可以收市價3萬克拉價格今天不用一折留言帝王獲取下單連結"] * 11
微調們 = [x + ("第%d波" % i if i else "") for i, x in enumerate(重發們)]
DROP = set(M.shingles(M.normalize(CTA_LONG)))
ok(M.looks_like_reposts(重發們, DROP)[0], "11 則一模一樣 → 是同一支片重發，不要喊誤配")
ok(M.looks_like_reposts(微調們, DROP)[0], "每次結尾微調一下也還是重發")
ok(not M.looks_like_reposts(磁鐵們, DROP)[0], "20 則不同商品共用一句招呼語 → 是磁鐵，要喊")
# ⚠️ 一定要先扣掉罐頭句再比。招呼語一長，不扣的話磁鐵會被墊到 0.57 —— 反過來被判成重發。
ok(M.looks_like_reposts(磁鐵們)[1] > M.looks_like_reposts(磁鐵們, DROP)[1],
   "不扣罐頭句的話，磁鐵的相似度會被招呼語墊高")
ok(M.looks_like_reposts(磁鐵們)[0] and not M.looks_like_reposts(磁鐵們, DROP)[0],
   "**而且會高到翻面**（不扣＝誤判成重發，扣了才判得對）—— 所以扣罐頭句不是可有可無")
ok(M.looks_like_reposts(重發們, DROP)[1] - M.looks_like_reposts(磁鐵們, DROP)[1] > 0.4,
   "扣完之後兩種形狀中間空得很開，門檻怎麼動都不會翻面")
ok(M.looks_like_reposts([])[0] and M.looks_like_reposts(["短"])[0],
   "一則以下不亂喊（沒有東西可比就不要判它有罪）")
# 接進同步腳本了嗎 —— 只在函式裡做對沒有用
ok("looks_like_reposts" in SYNC_SRC and "reposts" in SYNC_SRC,
   "同步腳本真的有用這條，不是只算則數")
ok("index.boilerplate" in SYNC_SRC, "而且有把罐頭句傳進去")

print("— FB Reels 的播放數在「影片」上，不在「貼文」上（v202）—")
# 老闆看畫面問「fb 怎麼才 5636」。正式資料：FB 290 則裡 288 則是 Reels，
# 觀看合計 5,962（178 則是 0），可是同一批有 85,806 個讚 ——
# 有一則 1,152 個讚只有 148 觀看。那不是成績差，是量錯了東西。
#
# 拿正式帳號一個一個問出來的：貼文物件上根本沒有 views／post_impressions／
# blue_reels_play_count，post_video_views 有但對 Reels 一律回 0；
# 影片物件上才有 fb_reels_total_plays＝709（=636 初次 + 73 重播）。
ok(S.fb_video_id({"permalink": "https://www.facebook.com/reel/1001718832939453/"}) == "1001718832939453",
   "Reels 網址拆得出影片 id")
ok(S.fb_video_id({"permalink": "https://www.facebook.com/Zanagems/videos/2917234645310015/"}) == "2917234645310015",
   "一般影片網址也拆得出來")
ok(S.fb_video_id({"permalink": "https://www.facebook.com/Zanagems/posts/123"}) == "",
   "圖文貼文沒有影片 id（那種本來就沒有播放數）")
ok(S.fb_video_id({"permalink": ""}) == "" and S.fb_video_id(None) == "",
   "沒有網址不會爆掉")
# ⚠️ 順序就是優先序：Reels 的總播放要排在 post_video_views 前面，
#    不然又會拿到那個對 Reels 一律回 0 的舊指標。
ok(S.VIEW_KEYS.index("fb_reels_total_plays") < S.VIEW_KEYS.index("post_video_views"),
   "總播放排在 post_video_views 前面（後者對 Reels 一律回 0）")
ok(S.VIEW_KEYS.index("blue_reels_play_count") < S.VIEW_KEYS.index("post_video_views"),
   "初次播放也排在它前面（總播放要不到時的備援）")
ok("fb_reels_total_plays" in S.FB_VIDEO_METRICS and "blue_reels_play_count" in S.FB_VIDEO_METRICS,
   "要跟影片物件要的指標裡有這兩個")
# 程式碼層級：影片物件那一次呼叫真的有打出去
ok("video_insights" in SYNC_SRC and "fb_video_id(p)" in SYNC_SRC,
   "add_insights 真的會去問影片物件")
# 圖文貼文沒有播放數是正常的，不可以標成「抓不到」——
# 標了會讓它永遠掛在「要查」的名單上，變成熄不掉的紅字（v136 那類病）
ok('not (p["platform"] == "FB" and not vid_id)' in SYNC_SRC,
   "圖文貼文的 0 不算「抓不到」")

print("— 被二創過的原片要一直量下去（v201）—")
# 老闆比的是「二創比原本好還是壞」。原片的數字停在半年前、二創的數字是這個月的，
# 那個比值就不是在比剪輯，是在比誰的數字比較新。
PAR = S.remake_parents([
    {"id": "R1", "channel": "remake", "sourceVideoId": "S1"},
    {"id": "R2", "channel": "remake", "sourceVideoId": "S1"},
    {"id": "R3", "channel": "remake", "sourceVideoId": "S2", "deleted": True},
    {"id": "R4", "channel": "shopee", "sourceVideoId": "S3"},
    {"id": "S1"},
])
ok(PAR == {"S1"}, "被二創過的原片抓得出來（已刪的二創不算、蝦皮版不算）")
_p = {"comments": 0, "at": "2026-09-10T10:00:00"}
ok(S.needs_insights(_p, {"id": "S1"}, "2026-09-10", 5, 5000, 30, (), PAR)[0],
   "被二創過的原片，留言再少也要量（不然基準會停在半年前）")
ok(not S.needs_insights(_p, {"id": "S9"}, "2026-09-10", 5, 5000, 30, (), PAR)[0],
   "沒被二創過的普通舊片就不用多花這次呼叫")

print("— 成效快照：沒有它，「比原本好還是壞」就只能拿累計去比（v201）—")
# Meta 只給「到現在為止的累計」，每次同步都把上一次蓋掉。
# 原片半年前上的累計 10 萬、二創上 30 天 3 萬 → 系統會說「只有原本的 30%」。
# 那句話是假的：沒有人知道原片**它自己前 30 天**拿多少。所以要開始存點。
def hrow(pid, views, post_day, **kw):
    r = {"postId": pid, "views": views, "comments": 5, "postAt": post_day + "T10:00:00"}
    r.update(kw)
    return r

h1 = S.merge_hist(None, [hrow("P1", 1000, "2026-09-01")], "2026-09-04")
ok(h1 == [{"postId": "P1", "d": "2026-09-04", "views": 1000, "comments": 5}], "第一次就記一個點")
h2 = S.merge_hist(h1, [hrow("P1", 2500, "2026-09-01")], "2026-09-07")
ok([h["views"] for h in h2] == [1000, 2500], "三天後再記一個點，舊的留著（這才叫快照）")
h3 = S.merge_hist(h2, [hrow("P1", 2600, "2026-09-01")], "2026-09-07")
ok(h3 == h2, "同一天跑兩次不會記兩個點")

ok(S.merge_hist(None, [hrow("P2", 9, "2026-06-01")], "2026-09-11") == [],
   "上片超過 35 天就不再記 —— 再記也不會拿來比，只是把文件撐大")
ok(S.merge_hist(None, [hrow("P3", 0, "2026-09-01", viewsMissing=True)], "2026-09-04") == [],
   "洞察沒給數字的不記（空的不是 0，v198 那個坑不能再踩一次）")
ok(S.merge_hist(None, [{"views": 5, "postAt": "2026-09-01T10:00:00"}], "2026-09-04") == [],
   "沒有 postId 就不知道是誰的點，不記")

# 不能無限長：一則貼文最多留 HIST_MAX_PER_POST 個點
long_h = None
for i in range(1, 26):
    long_h = S.merge_hist(long_h, [hrow("P4", i * 100, "2026-09-01")],
                          "2026-09-%02d" % i if i <= 30 else "2026-10-01")
ok(len(long_h) == S.HIST_MAX_PER_POST, "一則貼文最多留 %d 個點" % S.HIST_MAX_PER_POST)
ok(long_h[-1]["views"] == 2500, "留下來的是最新的那幾個，不是最舊的")

two = S.merge_hist(None, [hrow("P5", 10, "2026-09-01"), hrow("P6", 20, "2026-09-02")], "2026-09-04")
ok(len(two) == 2, "同一支片有兩則貼文（重播）→ 各記各的")
ok(S.merge_hist(None, [], "2026-09-04") == [], "這次沒抓到東西就不動")

print("— 哪幾則值得花一次呼叫去問成效 —")
# 老闆：「我要的是成效好的，至少 5000 點閱、五個人留言以上。」
# 留言數在貼文清單裡就拿得到（不用另外呼叫），觀看數要問了才知道 ——
# 所以留言數當篩子、觀看數當判定，剛好各司其職。
ok(S.is_hit({"views": 9000, "comments": 8}, 5000, 5), "觀看夠、留言也夠 → 達標")
ok(not S.is_hit({"views": 9000, "comments": 2}, 5000, 5), "觀看夠但沒人留言 → 不算")
ok(not S.is_hit({"views": 300, "comments": 20}, 5000, 5), "留言多但沒人看 → 不算")

print("— 達標之後追蹤 30 天，不是永遠 —")
HITROW = {"views": 9000, "comments": 8, "postAt": "2026-08-20T10:00:00"}
ok(S.tracked_until({"metrics": [HITROW]}, 5000, 5, 30) == "2026-09-19",
   "追蹤到「達標那一則的發文日 ＋ 30 天」為止")
ok(S.tracked_until({"metrics": [{"views": 10, "comments": 0, "postAt": "2026-08-20"}]},
                   5000, 5, 30) == "",
   "沒達標過的片不會進追蹤（那樣等於全部都追）")
ok(S.tracked_until({}, 5000, 5, 30) == "", "還沒有任何成效的片不會爆掉")

print("— 要不要問成效 —")
P_HOT = {"comments": 9, "views": 0}
P_COLD = {"comments": 1, "views": 0}
ok(S.needs_insights(P_HOT, None, "2026-09-11", 5, 5000, 30)[0],
   "留言夠就問（連對到哪支片都還不用知道）")
ok(not S.needs_insights(P_COLD, {"id": "X"}, "2026-09-11", 5, 5000, 30)[0],
   "留言不夠、又不是追蹤中、又不是二創 → 不用花這次呼叫")
ok(S.needs_insights(P_COLD, {"id": "T", "metrics": [HITROW]},
                    "2026-09-11", 5, 5000, 30)[0],
   "追蹤期內的片，留言再少也要問（要看它後續掉多少）")
ok(not S.needs_insights(P_COLD, {"id": "T", "metrics": [HITROW]},
                        "2026-10-30", 5, 5000, 30)[0],
   "過了 30 天就不追了（不是永遠）")
ok(S.needs_insights(P_COLD, {"id": "R", "sourceVideoId": "V001"},
                    "2026-09-11", 5, 5000, 30)[0],
   "二創不管達不達標都要記 —— 剪壞的那幾支如果不記，就永遠看不出是誰剪壞的")
ok(S.needs_insights(P_COLD, {"id": "R", "sourceVideoId": ""},
                    "2026-09-11", 5, 5000, 30)[0] is False,
   "sourceVideoId 是空字串不算二創")

print("— 二創怎麼認出來：同資料夾、不同檔名 —")
# 老闆：「二創是『同一個資料夾的影片』若不同名字，就可能是第二次創作，
#        我們不會同一支影片再次上傳。」
F = "https://drive.google.com/drive/folders/AAA111?usp=share_link"
F_SAME = "https://drive.google.com/drive/folders/AAA111"     # 同一個資料夾，網址參數不同
F2 = "https://drive.google.com/drive/folders/BBB222"
VS2 = [vid("A", "", name="原片", driveFolder=F),
       vid("B", "", name="(可二剪)原片", driveFolder=F_SAME),
       vid("C", "", name="別支片", driveFolder=F2)]
sus = S.remake_suspects(VS2)
ok(sus == {"A", "B"}, "同資料夾、檔名不同 → 兩支都當成二創嫌疑（網址參數不同不影響）")
ok("C" not in sus, "自己一個資料夾的不算")

SAME = [vid("D", "", name="一樣的名字", driveFolder=F),
        vid("E", "", name="一樣的名字", driveFolder=F)]
ok(S.remake_suspects(SAME) == set(), "檔名完全一樣＝同一支片，不是二創")
ok(S.remake_suspects([vid("G", "", name="沒資料夾"), vid("H", "", name="也沒有")]) == set(),
   "沒填資料夾的不會被兜在一起（空字串不是一個資料夾）")
ok(S.remake_suspects([vid("I", "", name="在", driveFolder=F),
                      vid("J", "", name="回收桶", driveFolder=F, deleted=True)]) == set(),
   "回收桶裡的那筆不算（不然會讓還在的那支被誤判成二創）")

ok(S.needs_insights({"comments": 1}, {"id": "A"}, "2026-09-11", 5, 5000, 30, {"A"})[0],
   "二創嫌疑的片，留言再少也要問")
ok(not S.needs_insights({"comments": 1}, {"id": "C"}, "2026-09-11", 5, 5000, 30, {"A"})[0],
   "不是嫌疑的就不用多花這次呼叫")

print("— 疑似誤配要擋得住寫入，不是事後才講 —")
# 2026-09-11：畫面印了「⚠⚠ 對到 9 則，先不要 --write」，
# 但那句話是在寫入流程中間印的 —— 講的時候已經寫進去了。
# 發現問題卻擋不住問題，那個警告等於沒有。
import argparse as _ap
_p = _ap.ArgumentParser()
for a in ("--write", "--force", "--fill-links", "--verbose", "--why"):
    _p.add_argument(a, action="store_true")
_p.add_argument("--every", type=int, default=0)
ok(hasattr(_p.parse_args([]), "force"), "（前提）有 --force 這個開關")
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                        "tools", "meta_sync.py"), encoding="utf-8").read()
i_hog = src.index("if hogs and not args.force:")
i_write = src.index("done, failed = write_back(")
ok(i_hog < i_write, "擋下來的判斷要排在 write_back 前面（不然擋了也來不及）")
ok("return 2" in src[i_hog:i_write], "而且是直接結束，不是印一行然後照寫")

print("— 翻頁撞到上限要大聲講 —")
# 2026-09-11 抓 180 天，粉專回了**剛好 2,000 則** —— 那不是剛好這麼多，
# 是撞到我設的 40 頁上限被截斷了，而畫面上完全看不出來。
# 默默截斷比抓不到更糟：抓不到會報錯，截斷會給你一個看起來正常的數字。
ok(S.PAGE_CAP * 50 >= 20000, "安全上限要夠高（20,000 則以上），不然半年的資料會被截掉")

_pages = []


def fake_call(path, token, params=None, tries=4):
    # 永遠還有下一頁、日期永遠在範圍內 → 只有上限擋得住
    _pages.append(1)
    return {"data": [{"id": str(len(_pages)), "timestamp": "2026-09-01T00:00:00"}],
            "paging": {"cursors": {"after": "c%d" % len(_pages)}}}


_real_call = S._call
S._call = fake_call
try:
    import io as _io
    import contextlib as _ctx
    buf = _io.StringIO()
    _pages[:] = []
    with _ctx.redirect_stdout(buf):
        got = S._paged("x/posts", "tok", {}, "2026-03-15", limit_pages=5)
    ok(len(got) == 5, "撞到上限就停（不會無窮翻下去）")
    ok("安全上限" in buf.getvalue() and "沒有抓到" in buf.getvalue(),
       "而且要大聲講出來 —— 靜靜截斷會讓涵蓋率被低估，然後我們去查一個假問題")

    # 反過來：正常翻完不可以亂喊
    def fake_done(path, token, params=None, tries=4):
        return {"data": [{"id": "1", "timestamp": "2026-01-01T00:00:00"}], "paging": {}}
    S._call = fake_done
    buf2 = _io.StringIO()
    with _ctx.redirect_stdout(buf2):
        S._paged("x/posts", "tok", {}, "2026-03-15", limit_pages=5)
    ok("安全上限" not in buf2.getvalue(), "翻到比範圍還舊就停，這種正常結束不要喊")
finally:
    S._call = _real_call

print("— 排程：每天叫起來，自己決定要不要跑 —")
# 老闆要「每三天更新一次」。不用 launchd 直接排每三天，是因為那樣只要有一次
# 失敗（權杖過期、網路斷），就要再等三天才會重試，而且沒人知道。
# 改成每天醒來，看上次成功是幾天前 —— 失敗的隔天就會自己再試一次。
import json as _json
import tempfile as _tmp
_old_state = S.STATE_FILE
S.STATE_FILE = _tmp.mktemp(suffix=".json")
try:
    ok(S._last_success() == "", "還沒跑過的時候回空字串（不會爆掉）")
    _json.dump({"lastSuccess": "2026-09-11T21:00:00"}, open(S.STATE_FILE, "w"))
    ok(S._last_success() == "2026-09-11", "讀得回上次成功的日期（只取到日，不含時間）")
    S._mark_success({"videos": 73})
    ok(len(S._last_success()) == 10, "記下來的也是日期格式")
    open(S.STATE_FILE, "w").write("這不是 JSON")
    ok(S._last_success() == "", "狀態檔壞掉就當成沒跑過，不要讓整支掛在這裡")
finally:
    S.STATE_FILE = _old_state

print("— 哪一把權杖開得了「成效」那扇門：用試的 —")
# 2026-09-11 的實況：「權杖權限：五項都有 ✓」，但 IG 成效一律回
# 「Bad signature（code=190）」，而同一把權杖抓貼文清單完全正常。
# 那個訊息聽起來像簽章壞掉，實際上是「這把鑰匙開不了這扇門」——
# IG 的洞察要用粉專的權杖。Meta 的錯誤訊息不會告訴你該換哪一把。
CALLED = []


def fake_insights(path, token, metrics, missing):
    CALLED.append(token)
    return {"views": 8800} if token == "PAGE" else {}


_real = S._insights
S._insights = fake_insights
try:
    CALLED[:] = []
    tok, label = S.pick_token({"id": "M1"},
                              [("這個帳號自己的粉專權杖", None),
                               ("粉專權杖", "PAGE"),
                               ("個人權杖", "USER")], ["views"])
    ok(tok == "PAGE" and "粉專" in label, "試出「粉專權杖」要得到成效，就用那一把")
    ok("USER" not in CALLED, "試到能用的就停，不會把每一把都打一次")

    CALLED[:] = []
    tok, label = S.pick_token({"id": "M1"},
                              [("個人權杖", "USER"), ("粉專權杖", "USER")], ["views"])
    ok(tok is None, "全部都要不到就照實回報，不要硬挑一把")
    ok(CALLED == ["USER"], "同一把權杖不會重複試")
finally:
    S._insights = _real

print("— API 版本與已廢除的指標 —")
# 2026-09 查官方文件查到的：Meta 在 2024-08 把 impressions / plays / video_views
# 全部併成 views；views 從 v22.0 才有。而這支原本寫死 v21.0 ——
# 要一個那個版本沒有的指標，又去要兩個已經被廢掉的。
ok(int(S.GRAPH_VER.lstrip("v").split(".")[0]) >= 22,
   "API 版本至少要 v22（views 這個指標從 v22 才有）")
ok(S.IG_METRICS[0] == "views", "IG 以 views 為主（它是 impressions／plays／video_views 的合併後繼者）")
# v202：FB 粉專貼文**沒有** views —— 2026-09-12 拿正式帳號一個一個問過，
# 回 "(#100) The value must be a valid insights metric"。把它留在清單裡不是沒代價：
# _insights 先整批問，有一個無效就整批失敗、退回一個一個問，每則從 1 次變 4 次呼叫。
ok("views" not in S.FB_METRICS and "post_impressions" not in S.FB_METRICS,
   "FB 清單裡不留已經證實無效的指標（留著會讓整批問失敗，呼叫數變 4 倍）")
ok(all(m not in S.FB_VIDEO_METRICS for m in ("post_impressions_unique", "views")),
   "影片那邊同理")
# v202：FB Reels 的總播放插到最前面（見下面那一段）。VIEW_KEYS 是兩個平台共用的
# 一張優先序表，但 fb_reels_* 只有 FB 影片會回、views 只有 IG 會回，互不干擾。
# 這條原本寫死 VIEW_KEYS[0]=="views"，那是拿當時的排序當代理指標；
# 真正的要求是「已經廢掉的舊名稱要排在還活著的後面」。
ok(S.VIEW_KEYS.index("views") < S.VIEW_KEYS.index("post_video_views")
   and S.VIEW_KEYS.index("views") < S.VIEW_KEYS.index("post_impressions"),
   "已經廢掉的舊名稱留在後面當備援，排在 views 後面")

print("— 抓不到觀看數 ≠ 沒人看 —")
# 官方文件：「if insights data you are requesting does not exist or is currently
# unavailable the API will return an empty data set **instead of 0**.」
# 把空的當 0，會讓「抓不到」跟「真的沒人看」在畫面上變成同一件事 ——
# 而我們正是用觀看數當門檻。
ok(not S.is_hit({"views": 0, "comments": 9}, 5000, 5),
   "抓不到觀看數的貼文不會被誤判成達標")
ok(S.is_hit({"views": 9000, "comments": 9}, 5000, 5), "有數字的照樣判達標")

print("— 某個平台整個掛掉要喊出來 —")
# 2026-09-11 踩到的形狀：IG 成效全被擋、FB 還有數字，
# 所以「全部都是 0」的條件不成立，警告沒跳，畫面只顯示「達標 0 則」。
# 那是最糟的失敗形狀 —— 它不像故障，像結論。
def dead_platforms(want):
    by = {}
    for p in want:
        by.setdefault(p["platform"], []).append(int(p.get("views") or 0))
    return sorted(k for k, vs in by.items() if vs and not any(vs))

MIX = [{"platform": "IG", "views": 0}, {"platform": "IG", "views": 0},
       {"platform": "FB", "views": 2020}]
ok(dead_platforms(MIX) == ["IG"], "IG 整個 0、FB 還有數字 → 還是要喊 IG")
ok(dead_platforms([{"platform": "FB", "views": 5}]) == [], "有數字就不喊")
ok(dead_platforms([]) == [], "一則都沒問的時候不要亂喊")

print("— 權杖權限檢查 —")
# 2026-09-11 踩到：IG 的貼文清單抓得到，但成效一律 Bad signature（code=190），
# 於是「達標 0 則」—— 看起來像「沒有成效好的片」，其實是觀看數根本沒抓到。
ok("instagram_manage_insights" in S.NEEDED_SCOPES,
   "IG 成效的權限有列進必要清單（少了它會靜靜地變成「沒有好片」）")
ok("read_insights" in S.NEEDED_SCOPES, "FB 粉專成效的權限也要列")
ok("instagram_basic" in S.NEEDED_SCOPES and "pages_show_list" in S.NEEDED_SCOPES,
   "抓清單要的那兩項也要列（少了會整個抓不到，比較好發現）")

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

# IG 的洞察也要用粉專的權杖 —— 跟粉專貼文同一個坑，我第一次只修了 FB 那一半。
# 實況：「權杖權限：五項都有 ✓」，IG 成效卻一律 Bad signature（code=190）。
acc4, _ = U.map_accounts([], [{"id": "17a", "username": "tzgrotw", "token": "PAGE_TOK"}], PLATS)
ok(acc4[0].get("pageToken") == "PAGE_TOK",
   "IG 帳號也要存下它所屬粉專的權杖（IG 洞察要用粉專那把）")
acc5, _ = U.map_accounts([], [{"id": "17a", "username": "tzgrotw"}], PLATS)
ok("pageToken" not in acc5[0], "沒拿到就不要塞空字串")

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

print("— 二創：原片和它的二創算同一家，再用上片日期分（v201）—")
# 二創沿用原片的腳本與原毛片名，文案幾乎一模一樣。
# 分開索引的話，同一則貼文會同時打中兩支，而且**打中的段數還不一定一樣多** ——
# 原片的「片名」那一格常常整段就是貼文文案，二創的片名則是排片人另取的短名。
# 於是分數高的那一邊直接贏走，贏的跟「這則貼文到底是誰發的」完全沒關係。
def rmk(i, src, date, **kw):
    v = {"id": i, "channel": "remake", "sourceVideoId": src,
         "videoCopy": COPY, "rawName": "原毛片名", "scheduledDate": date}
    v.update(kw)
    return v

SRC = vid("S1", COPY, "2026-04-02", name=COPY)          # 原片：片名那一格就是整段文案
RMK = rmk("R1", "S1", "2026-08-12", name="二創短片名")   # 二創：另取的短名
fam = M.Index([SRC, RMK])
ok(len(fam) == 1 and "S1" in fam.entries, "原片＋二創只佔索引裡的一家（掛在原片底下）")
ok([m["id"] for m in fam.entries["S1"]["members"]] == ["S1", "R1"], "原片排第一，二創接在後面")
ok(fam.entries["S1"]["dates"] == ["2026-04-02", "2026-08-12"], "家族的日期是全部成員的聯集")

r = M.match_post(post(COPY, "2026-08-13T10:00:00"), fam)
ok(r["videoId"] == "R1" and r["familyId"] == "S1", "貼文日期貼著二創的上片日 → 算二創")
r = M.match_post(post(COPY, "2026-04-03T10:00:00"), fam)
ok(r["videoId"] == "S1", "貼文日期貼著原片的上片日 → 算原片")
r = M.match_post(post(COPY, "2026-06-15T10:00:00"), fam)
ok(r["videoId"] == "S1" and "算原片" in r["why"], "兩邊都不近 → 算原片，而且講明白為什麼")

# 分不出來就算原片：寧可少算一筆二創，也不要把成效掛到某個剪輯頭上 ——
# 那個數字最後會變成「這個剪輯適不適任」的證據。
same = M.Index([vid("S2", COPY, "2026-05-10", name=COPY), rmk("R2", "S2", "2026-05-10")])
r = M.match_post(post(COPY, "2026-05-10T10:00:00"), same)
ok(r["videoId"] == "S2" and "分不出來" in r["why"], "同一天上片、分不出來 → 算原片")

# 上片連結是最硬的證據，二創自己的連結要認得出來
lk = M.Index([SRC, rmk("R3", "S1", "2026-08-12", publishedLink="https://ig.com/p/rmk/")])
r = M.match_post(post(COPY, "2026-04-03T10:00:00", permalink="https://ig.com/p/rmk/"), lk)
ok(r["videoId"] == "R3", "二創自己的上片連結對上 → 直接算它（連結贏過日期）")

# 家族內共用的段不是罐頭句：df 一個家族只數一次。
# 一支片被二創了 6 次，它的腳本就會在 7 筆資料裡各出現一次 —— 若照筆數數，
# 那段會被當成罐頭句扣掉，這支片的指紋就沒了，整家的成效全部對不回來。
many = [vid("V%02d" % i, "第%02d支的獨家內容說明第%02d支的獨家內容說明" % (i, i)) for i in range(30)]
base = many + [vid("SX", COPY, "2026-01-01", name=COPY)]
solo = M.Index(base)
withr = M.Index(base + [rmk("RX%d" % i, "SX", "2026-0%d-01" % (i + 2)) for i in range(6)])
ok(M.normalize(COPY)[:M.SHINGLE] not in solo.boilerplate, "沒有二創時，這段不是罐頭句")
ok(M.normalize(COPY)[:M.SHINGLE] not in withr.boilerplate,
   "被二創 6 次之後也還不是 —— 家族只數一次，不會被自己的二創推過門檻")
ok(M.match_post(post(COPY, "2026-05-01T10:00:00"), withr)["videoId"] == "RX3",
   "而且照樣分得出是第幾次二創發的")

# 壞資料不能讓整批比對掛掉
orphan = M.Index([rmk("R8", "不存在的原片", "2026-08-12", name="孤兒二創的片名夠長才進得了索引")])
ok(len(orphan) == 1 and "R8" in orphan.entries, "二創指到一支不存在的原片 → 自己成一家，不會炸")
ok(M.is_remake({"channel": "remake", "sourceVideoId": "S1"}), "認得出二創")
ok(not M.is_remake({"channel": "remake", "sourceVideoId": ""}), "沒有來源片的殼不算二創（那是壞資料）")
ok(not M.is_remake({"channel": "shopee", "sourceVideoId": "S1"}), "蝦皮版不是二創")

print("\n%d / %d 通過" % (len(RAN) - len(FAILED), len(RAN)))
if FAILED:
    sys.exit(1)
