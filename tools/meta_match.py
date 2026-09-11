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
        self.entries = {}      # videoId -> {"sh": set, "dates": [...], "v": video}
        self.skipped = []      # 文案太短／沒有文案，比對不到的那些
        df = {}
        for v in videos or []:
            if v.get("deleted"):
                continue
            vid = v.get("id")
            if not vid:
                continue
            sh = set()
            for t in video_texts(v):
                nt = normalize(t)
                if len(nt) >= MIN_CHARS:
                    sh.update(shingles(nt))
            if not sh:
                self.skipped.append(vid)
                continue
            self.entries[vid] = {"sh": sh, "dates": video_dates(v), "v": v}
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


def match_post(post, index):
    """一則貼文對回一支影片。

    回傳 {"videoId":.., "score":.., "why":..} 或
         {"videoId":None, "why":"...", "candidates":[...]}
    """
    link = str(post.get("permalink") or "").strip()
    if link:
        for vid, e in index.entries.items():
            if str(e["v"].get("publishedLink") or "").strip() == link:
                return {"videoId": vid, "score": 999, "why": "上片連結一模一樣"}

    np_ = normalize(post.get("caption"))
    if len(np_) < MIN_CHARS:
        return {"videoId": None, "why": "這則貼文的文字少於 %d 字，太短不夠指認" % MIN_CHARS, "candidates": []}

    hits = {}
    for s in set(shingles(np_)):
        for vid in index.by_shingle.get(s, ()):
            hits[vid] = hits.get(vid, 0) + 1
    if not hits:
        return {"videoId": None, "why": "文案對不上任何一支", "candidates": []}

    top = max(hits.values())
    best = [vid for vid, h in hits.items() if h == top]
    if len(best) == 1:
        return {"videoId": best[0], "score": top, "why": "文案對上 %d 段（每段 20 字）" % top}

    # 分數並列 —— 同一支腳本重播／二創會這樣。改用上片日期分。
    pdate = str(post.get("at") or "")[:10]
    near = []
    for vid in best:
        ds = [_days_apart(d, pdate) for d in index.entries[vid]["dates"]]
        ds = [d for d in ds if d is not None]
        if ds and min(ds) <= DATE_NEAR_DAYS:
            near.append((min(ds), vid))
    if len(near) == 1:
        return {"videoId": near[0][1], "score": top,
                "why": "文案對上 %d 段（有兩支一樣，用上片日期分開）" % top}

    return {"videoId": None,
            "why": "有 %d 支文案一樣、日期也分不開，要人看一下" % len(best),
            "candidates": sorted(best)}


def match_all(posts, videos):
    """整批比對。回傳 (matched, unmatched, index)。

    matched   ：[{post, videoId, score, why}]
    unmatched ：[{post, why, candidates}]
    """
    index = Index(videos)
    matched, unmatched = [], []
    for p in posts or []:
        r = match_post(p, index)
        if r.get("videoId"):
            matched.append({"post": p, "videoId": r["videoId"],
                            "score": r.get("score"), "why": r["why"]})
        else:
            unmatched.append({"post": p, "why": r["why"],
                              "candidates": r.get("candidates") or []})
    return matched, unmatched, index
