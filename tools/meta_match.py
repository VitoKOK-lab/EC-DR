# -*- coding: utf-8 -*-
"""
把平台上的一則貼文，對回系統裡的一支影片。

【為什麼不是用「影片標題」比對】
newVideoRecord 裡 metrics 那行的原始註解寫「後端以影片標題比對後自動填」——
那個做法行不通。影片標題是內部檔名（「0819 黃鐵礦帶財」），
平台貼文上根本不會出現這串字。實際會同時存在於兩邊的只有**文案**：
系統的 videoCopy ＝ 貼文文案／口播稿，平台那則的 caption／message 就是它。

【正式資料量到的事（2026-09-11）】
  - 已上片 416 支，publishedLink 有填的：0 支 → 現在沒有任何現成的對照鍵。
  - 8 月起文案幾乎都有填（8 月 107/108、9 月 51/53），6–7 月只有一半。
  - 文案正規化後取前 24 字，709 支裡只有 14 組撞號、涉及 74 支；
    其中 48 支的文案是佔位字「1」（另有「請剪輯師自填」），扣掉之後
    真正撞號的是 13 組 26 支 —— 都是同一支腳本重播／二創，用日期分得開。
  → 文案比對可行；佔位字要靠最短長度擋掉。

【比對方式：切段，不是整段比】
平台那則的文字跟系統的文案不會一模一樣，常見差異有三種：
  後面被加東西（#hashtag、表情符號、「首頁連結加入社群」）、
  前面被加東西（開頭一顆表情符號、【限時】），
  中間被剪短（口播稿 264 字 → 貼文只留前兩段）。
整段比對三種都會掛掉。所以把文案切成 20 字一段，看平台那則裡出現了幾段 ——
前後加東西不影響，中間被剪短也還剩好幾段對得上。

【罐頭句要先丟掉】
每支片結尾都有的那幾句（「首頁連結加入溱姐社群」之類）會讓每一則都「對得上」。
所以先算每一段在幾支影片裡出現過，超過 DF_MAX_RATIO 的就不採計 ——
這條規則是資料自己算出來的，不需要手工維護一份罐頭句清單。

【對不上就是對不上】
分數並列、又沒辦法用日期分開的時候，回報「要人看一下」，不猜。
猜錯的代價是把 A 片的成效算在 B 片頭上，那比沒有資料更糟。
"""

import math
import unicodedata

SHINGLE = 12          # 切段長度（字）—— 為什麼是 12 見下方
STRIDE = 1            # 每個字都切一段（＝完全重疊）—— 見下方說明
MIN_CHARS = 12        # 文案正規化後短於這個字數就不參加比對（擋佔位字「1」那類）

# 【20 字為什麼太長】
# 第一次真的跑完，41 支「已上片卻沒對到」。查下去發現有一整類是這樣：
#     系統片名：不跟你要錢的女人 他們要的是什麼      （15 字）
#     平台貼文：不跟你要錢的女人 她們要的是什麼？…   （他／她 一字之差）
# 片名本來就短 —— 13～15 字是常態，20 字的門檻等於把一整類片排除在外。
# 拿正式資料量各種長度（每支片的三個欄位各造五種變形的假貼文）：
#     20 字：可比對 784 支、罐頭句 0 段、11,090 則模擬貼文配錯 0
#     14 字：可比對 877 支、罐頭句 6 段、配錯 0
#     12 字：可比對 906 支、罐頭句 10 段、配錯 0
#     10 字：可比對 920 支、罐頭句 14 段、配錯 0
# 12 是這樣選的：可比對數量增加最多的那一段（784→906）、配錯還是 0，
# 而且到這個長度「首頁連結加入溱姐寵粉社群」才終於被算成罐頭句 ——
# 20 字時罐頭句抓到 0 段，不是沒有罐頭句，是切太長所以每一段都獨一無二。
# 再往下到 10 只多 14 支，收穫遞減，而段落越短誤配的風險只會越高。
DF_MAX_RATIO = 0.03   # 出現在超過這個比例的影片裡＝罐頭句，不採計
DF_MIN_COUNT = 5      # 但至少要 5 支共用才算罐頭 —— 見下方說明
POST_PER_ACCOUNT = 5  # 一支片在一個帳號上頂多發幾次（首播＋重播）
POST_DF_FLOOR = 8     # 帳號數再少，下限也不低於這個
MIN_HITS = 2          # 至少要對上這麼多段才算數（指紋只有一兩段的片除外）

# 【貼文那邊的門檻不可以用比例算】
# 一開始貼文這邊沿用影片那邊的「超過 3% 就算罐頭」。1,183 則貼文的 3% 是 35 ——
# 可是一句招呼語只要出現十幾次就足以當磁鐵了，35 這條線根本攔不到。
# 實際踩到的：V081 的片名尾巴是「#首頁鏈接加入溱姐寵粉社群」（是「鏈接」，
# 別的片都寫「連結」），這個變體在兩邊都稀有，於是它把 10 則完全不相干的
# 商品貼文吸了過來（「買一堆廉價耳飾…」「當小貓咪遇上寶石…」）。
#
# 貼文這邊該問的不是「佔幾成」，而是「**一支片最多可能變成幾則貼文**」：
# 連上幾個帳號 × 每個帳號頂多發幾次。超過那個數還在共用的，
# 就不是同一支片發很多次，是招呼語。所以門檻跟著帳號數走，不是跟著總則數走。
DATE_NEAR_DAYS = 3    # 並列時，上片日期離貼文日期幾天內算「對得上」

# 為什麼罐頭句還要有一個「至少 5 支」的下限：
# 只看比例的話，影片一少（測試、或某一家品牌只有幾支片）門檻就會低到 1，
# 於是「兩支文案一樣」的那一組會被整組判成罐頭句、指紋被清空、誰都對不上。
# 但兩三支共用的文案正是**重播與中英版**，那是要靠日期去分辨的對象，不是雜訊。
# 真正的罐頭句（「首頁連結加入社群」）是幾十支共用的，5 支這條線分得很開。


# 寫的時候會換、意思一樣的字。兩邊折成同一個，才不會因為一個字就整段對不上。
#   他／她：「不跟你要錢的女人**他**們要的是什麼」vs 貼文的「**她**們」—— 真實案例
#   你／妳：「**妳**一定要知道的5種綠色寶石」vs 貼文的「**你**一定要知道的五種」
#   數字　：同一句話標題寫「5 種」、貼文寫「五種」
# 十百千萬刻意不折：「十五」折成「105」是錯的，寧可不折。
FOLD = str.maketrans({
    "妳": "你", "祢": "你",
    "她": "他", "牠": "他", "祂": "他",
    "〇": "0", "一": "1", "二": "2", "三": "3", "四": "4",
    "五": "5", "六": "6", "七": "7", "八": "8", "九": "9",
})


def normalize(text):
    """文案正規化：全形→半形、臺→台、你妳他她與中文數字折同一個、只留文字與數字。

    表情符號、標點、換行、#、空白全部丟掉 —— 這些是兩邊最容易不一樣的東西。
    臺／台 是量到的實際落差（Drive 用「台」、系統用「臺」）。
    """
    t = unicodedata.normalize("NFKC", str(text or ""))
    t = t.replace("臺", "台").translate(FOLD)
    return "".join(ch for ch in t if ch.isalnum()).lower()


def shingles(norm_text):
    """從每一個字開始各切一段 20 字。不足 20 字就一段都切不出來。

    【為什麼要重疊著切，不是每 20 字切一刀】
    一開始是每 20 字切一刀（不重疊）。那樣「罐頭句」根本抓不到 ——
    同一句「首頁連結加入社群」接在不同長度的內容後面，落在的位置就不一樣，
    切出來的段自然也不一樣，於是每一段都只出現過一次，永遠不會被認成罐頭。
    （拿正式資料跑出來的罐頭句數量是 0，就是這個原因。）
    重疊著切就跟位置無關了：只要兩支片有 20 個字連續一樣，就一定切得出同一段。
    代價是段數變多（264 字的文案 245 段），用反查表之後不影響速度。
    """
    return [norm_text[i:i + SHINGLE]
            for i in range(0, len(norm_text) - SHINGLE + 1, STRIDE)]


def video_texts(v):
    """這支片有可能出現在平台貼文上的文字。

    ⚠️ 不是只有 videoCopy。2026-09-11 第一次拿真實貼文跑，193 則只對上 20 則，
    查下去發現對不上的那些**大部分都在系統裡**，只是整段文案被打在「片名」那一格：
        片名：「當爸爸容易嗎？人家說當了爸爸就會變成超人，其實我們只是學會了…」
        文案：（空的）
    只看 videoCopy 就等於看不到這一大半。三個欄位都要看。

    三段各自切各自的，不要接成一串再切 —— 接起來會生出「片名結尾＋文案開頭」
    這種現實中不存在的接縫，那是假指紋。
    """
    return [v.get("videoCopy"), v.get("name"), v.get("rawName")]


REMAKE_CH = "remake"      # 二創殼：同語言同平台，原片再剪一次（見 SCHEMA「二創流程」）
FAMILY_NEAR_DAYS = 7      # 家族內歸戶：貼文日期離某一支的上片日期幾天內算它的


def is_remake(v):
    """這支是不是二創殼。"""
    v = v or {}
    return str(v.get("channel") or "") == REMAKE_CH and bool(str(v.get("sourceVideoId") or ""))


def family_root(v):
    """這支屬於哪一個家族 —— 二創算在原片底下，其餘就是自己。

    ⚠️ 為什麼要有家族這件事：二創沿用原片的腳本與原毛片名，文案幾乎一模一樣。
    分開索引的話，同一則貼文會同時打中原片和二創，而且**打中的段數還不一定一樣多**
    （原片的「片名」那一格常常整段就是貼文文案，二創的片名則是排片人另取的短名），
    於是分數高的那一邊直接贏走 —— 贏的那一邊跟貼文是誰發的完全沒有關係。
    正確的做法是：先認出是「哪一支片的家族」，再用**上片日期**決定是家族裡的哪一支。
    """
    v = v or {}
    return str(v.get("sourceVideoId") or "") if is_remake(v) else str(v.get("id") or "")


def video_dates(v):
    """這支片已知的所有上片日期：scheduledDate ＋ 每一次重播（usageHistory）。

    重播的片只有最後一次會留在 scheduledDate，前幾次都在 usageHistory 裡。
    只看 scheduledDate 的話，一支片重播五次就有四次對不上日期。
    """
    out = []
    d = str(v.get("scheduledDate") or "")[:10]
    if d:
        out.append(d)
    for u in (v.get("usageHistory") or []):
        d = str((u or {}).get("date") or "")[:10]
        if d:
            out.append(d)
    return sorted(set(out))


class Index(object):
    """把影片清單整理成可以比對的樣子（罐頭句在這裡算掉）。"""

    def __init__(self, videos):
        # 索引的單位是**家族**（原片＋它的每一支二創），不是單支影片。
        # rootId -> {"sh": set, "dates": [...], "v": 原片, "members": [{"id","dates","v"}]}
        self.entries = {}
        self.skipped = []      # 文案太短／沒有文案，比對不到的那些
        alive = [v for v in (videos or []) if v and not v.get("deleted") and v.get("id")]
        ids = set(str(v.get("id")) for v in alive)
        fams = {}
        for v in alive:
            root = family_root(v)
            if root not in ids:
                root = str(v.get("id"))   # 二創指到一支不存在／已刪的原片 → 自己成一家
            fams.setdefault(root, []).append(v)
        df = {}
        for root, members in fams.items():
            # 原片排第一，二創照建立時間接在後面
            members = sorted(members, key=lambda m: (0 if str(m.get("id")) == root else 1,
                                                     str(m.get("createdAt") or ""), str(m.get("id"))))
            sh = set()
            for m in members:
                for t in video_texts(m):
                    nt = normalize(t)
                    if len(nt) >= MIN_CHARS:
                        sh.update(shingles(nt))
            if not sh:
                self.skipped.extend(str(m.get("id")) for m in members)
                continue
            dates = sorted(set(d for m in members for d in video_dates(m)))
            self.entries[root] = {
                "sh": sh, "dates": dates, "v": members[0],
                "members": [{"id": str(m.get("id")), "dates": video_dates(m), "v": m} for m in members],
            }
            # df 一個家族只數一次 —— 家族內共用的段（二創沿用原片的腳本）不是罐頭句，
            # 數兩次會把它往「罐頭」的門檻推，扣掉之後那支片就少了指紋。
            for s in sh:
                df[s] = df.get(s, 0) + 1
        n = len(self.entries)
        cap = max(DF_MIN_COUNT, int(math.floor(n * DF_MAX_RATIO)))
        self.boilerplate = set(s for s, c in df.items() if c > cap)
        # 罐頭句扣掉之後還剩下什麼，才是這支片真正的指紋。
        # 反查表（段落 → 有哪幾支片有這一段）：比對時只要拿貼文自己的段去查表，
        # 不必每一則都把 642 支片掃一遍。
        self.by_shingle = {}
        for vid, e in self.entries.items():
            e["key"] = e["sh"] - self.boilerplate
            for s in e["key"]:
                self.by_shingle.setdefault(s, []).append(vid)

    def __len__(self):
        return len(self.entries)

    def drop_post_boilerplate(self, posts):
        """貼文那邊的罐頭句也要扣掉。回傳扣掉了幾段。

        ⚠️ 這是 2026-09-11 真的跑出來的災難：有一支片對到了 **734 則**貼文。
            Vmtuvv2iz055a0「當藍寶石和緬因貓相遇💙 留言「藍寶石」．小編私訊您詳情」
        磁鐵是結尾那句招呼語。它在**幾百則商品貼文**裡都有，但在影片庫裡
        只有這一支片有 —— 所以用影片算出來的 df 是 1，一點都不像罐頭句，
        扣不掉。於是每一則帶著那句話的商品貼文都被判給了它。

        教訓：罐頭句有兩種。一種是影片那邊共用的（片尾社群連結），
        一種是**貼文那邊共用、影片那邊只有一支有**的（小編的固定招呼語）。
        只算一邊就會漏掉另一邊，而漏掉的那一邊正好最會製造假配對。
        """
        n = len(posts or [])
        if not n:
            return 0
        df = {}
        for p in posts:
            np_ = normalize((p or {}).get("caption"))
            for s in set(shingles(np_)):
                if s in self.by_shingle:      # 只數我們索引裡真的有的段
                    df[s] = df.get(s, 0) + 1
        accounts = len(set(str((p or {}).get("account") or "") for p in posts))
        cap = max(POST_DF_FLOOR, accounts * POST_PER_ACCOUNT)
        extra = set(s for s, c in df.items() if c > cap)
        if not extra:
            return 0
        # 反查表就是比對時唯一讀的東西 —— 從這裡拿掉就等於扣掉了。
        # （不要再去同步 entries 裡的 key：那份建完索引就沒人看，
        #   留著只會變成第二份「真相」，哪天兩邊不一致就很難查。）
        self.boilerplate |= extra
        for s in extra:
            self.by_shingle.pop(s, None)
        return len(extra)


def _days_apart(a, b):
    """兩個 YYYY-MM-DD 差幾天；任一個空的就回 None。"""
    if not a or not b:
        return None
    try:
        from datetime import date
        pa = date(int(a[0:4]), int(a[5:7]), int(a[8:10]))
        pb = date(int(b[0:4]), int(b[5:7]), int(b[8:10]))
        return abs((pa - pb).days)
    except Exception:
        return None


def attribute(post, entry):
    """家族內歸戶：這則貼文算原片的，還是算它某一支二創的。

    靠的是**上片日期**，不是文案 —— 二創沿用原片的腳本，文案幾乎一模一樣，
    用文字永遠分不出來。而第三步的流程本來就規定「先排上片日期」，那就拿它來分：
    排在 9/18 上片的二創，9/18 前後那則貼文就是它的。

    分不出來就算**原片**。寧可少算一筆二創，也不要把不確定的成效掛到某個剪輯頭上 ——
    那個數字最後會變成「這個剪輯適不適任」的證據。
    回傳 (videoId, 說明)。
    """
    members = entry.get("members") or []
    root = str(entry["v"].get("id") or "")
    if len(members) <= 1:
        return root, ""
    pdate = str(post.get("at") or "")[:10]
    cands = []
    for m in members:
        ds = [d for d in (_days_apart(x, pdate) for x in m["dates"])
              if d is not None and d <= FAMILY_NEAR_DAYS]
        if ds:
            cands.append((min(ds), m["id"]))
    if not cands:
        return root, "家族裡沒有一支的上片日期對得上，算原片"
    lo = min(c[0] for c in cands)
    win = [c[1] for c in cands if c[0] == lo]
    if len(win) > 1:
        return root, "有 %d 支的上片日期一樣近，分不出來，算原片" % len(win)
    if win[0] != root:
        return win[0], "上片日期差 %d 天 → 算這一支二創" % lo
    return root, "上片日期最接近原片"


def _pick(index, root, post, score, why):
    """家族對上了，再決定是家族裡的哪一支。"""
    vid, mwhy = attribute(post, index.entries[root])
    return {"videoId": vid, "familyId": root, "score": score,
            "why": why + ("（%s）" % mwhy if mwhy else "")}


def match_post(post, index):
    """一則貼文對回一支影片。

    回傳 {"videoId":.., "familyId":.., "score":.., "why":..} 或
         {"videoId":None, "why":"...", "candidates":[...]}
    """
    link = str(post.get("permalink") or "").strip()
    if link:
        for root, e in index.entries.items():
            for m in e["members"]:
                if str(m["v"].get("publishedLink") or "").strip() == link:
                    return {"videoId": m["id"], "familyId": root, "score": 999,
                            "why": "上片連結一模一樣"}

    np_ = normalize(post.get("caption"))
    if len(np_) < MIN_CHARS:
        return {"videoId": None, "why": "這則貼文的文字少於 %d 字，太短不夠指認" % MIN_CHARS, "candidates": []}

    hits = {}
    for s in set(shingles(np_)):
        for vid in index.by_shingle.get(s, ()):
            hits[vid] = hits.get(vid, 0) + 1
    if not hits:
        return {"videoId": None, "why": "文案對不上任何一支", "candidates": []}

    # 只對上一段（12 個字）的，證據太薄 —— 那正是招呼語的形狀。
    # 但指紋本來就只有一兩段的短片名沒有更多可以給，那種就以它全部為準。
    hits = {vid: h for vid, h in hits.items()
            if h >= min(MIN_HITS, len(index.entries[vid]["key"]))}
    if not hits:
        return {"videoId": None, "why": "只對上一小段，證據不夠（多半是招呼語）",
                "candidates": []}

    top = max(hits.values())
    best = [vid for vid, h in hits.items() if h == top]
    if len(best) == 1:
        return _pick(index, best[0], post, top, "文案對上 %d 段（每段 20 字）" % top)

    # 分數並列 —— 兩支不同的片用了同一段腳本會這樣（同一支片的二創已經併成一家了）。
    # 改用上片日期分。
    pdate = str(post.get("at") or "")[:10]
    near = []
    for vid in best:
        ds = [_days_apart(d, pdate) for d in index.entries[vid]["dates"]]
        ds = [d for d in ds if d is not None]
        if ds and min(ds) <= DATE_NEAR_DAYS:
            near.append((min(ds), vid))
    if len(near) == 1:
        return _pick(index, near[0][1], post, top,
                     "文案對上 %d 段（有兩支一樣，用上片日期分開）" % top)

    return {"videoId": None,
            "why": "有 %d 支文案一樣、日期也分不開，要人看一下" % len(best),
            "candidates": sorted(best)}


def match_all(posts, videos):
    """整批比對。回傳 (matched, unmatched, index)。

    matched   ：[{post, videoId, score, why}]
    unmatched ：[{post, why, candidates}]
    """
    index = Index(videos)
    index.dropped_post_boilerplate = index.drop_post_boilerplate(posts)
    matched, unmatched = [], []
    for p in posts or []:
        r = match_post(p, index)
        if r.get("videoId"):
            matched.append({"post": p, "videoId": r["videoId"],
                            "familyId": r.get("familyId") or r["videoId"],
                            "score": r.get("score"), "why": r["why"]})
        else:
            unmatched.append({"post": p, "why": r["why"],
                              "candidates": r.get("candidates") or []})
    return matched, unmatched, index
