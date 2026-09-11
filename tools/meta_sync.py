#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 Facebook 粉專／Instagram 帳號上的貼文成效，同步回影片庫。

    python3 tools/meta_sync.py                     只看不寫（預設）
    python3 tools/meta_sync.py --write             真的寫進資料庫
    python3 tools/meta_sync.py --write --fill-links 順便把對到的上片連結補回去
    python3 tools/meta_sync.py --days 90           往回抓 90 天（預設 30）
    python3 tools/meta_sync.py --min-views 3000    放寬「成效好」的門檻（預設 5000 觀看 / 5 留言）
    python3 tools/meta_sync.py --save-posts x.json 把平台原始回應存起來
    python3 tools/meta_sync.py --from-file x.json  用存起來的回應重跑比對（不連網）

【預設是「只看不寫」】
第一次跑一定要先看清單：哪一則對到哪一支、哪幾則對不上。
確認對了再加 --write。上片連結的補寫再多一道 --fill-links ——
成效是新增欄位，補連結是改人填的欄位，兩件事的份量不一樣。

【設定檔放在 repo 外面】
預設讀 ~/.ecdr-meta.json，裡面有 token 跟帳號清單：

    {
      "token": "EAA...（長期權杖）",
      "accounts": [
        {"platform": "FB", "name": "FB 粉專（Zanagems）",   "pageId":   "數字"},
        {"platform": "IG", "name": "IG 官方（@tzgrotw）",   "igUserId": "數字"}
      ]
    }

放在家目錄不是 repo 裡，是因為 repo 是公開的 —— 權杖進了 git 就等於公開。
name 要跟系統裡「上片平台」那張清單的寫法一樣，成效頁才會合在一起看。

【只抓成效好的，不是全部抓下來】
老闆要的是「成效好的片」：至少 5,000 點閱、5 個人留言。這兩個數字剛好可以
拆成兩段用 ——
  留言數在**貼文清單裡就拿得到**，不用另外呼叫 → 拿它當篩子
  觀看數要問了才知道（一則一次呼叫，很慢）→ 篩剩的才去問
所以順序是：抓清單 → 比對 → 篩 → 才問成效。
第一版對全部 1,183 則都問了一次（二十幾分鐘），再把其中 900 多則丟掉。

達標的片會繼續追蹤 30 天（看它後續掉多少），不是永遠。
另外二創（sourceVideoId 有值的）不管達不達標都記 —— 要比的是
「二創比原片掉了幾成」，二創剪壞的那幾支如果不記，就永遠看不出是誰剪壞的。

【怎麼對回影片】見 tools/meta_match.py，那支有完整說明與測試。
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs                      # noqa: E402
import meta_match               # noqa: E402

GRAPH = "https://graph.facebook.com"
GRAPH_VER = os.environ.get("META_GRAPH_VERSION", "v25.0")
DEFAULT_CONFIG = os.path.expanduser("~/.ecdr-meta.json")

# 想要的欄位；平台不給就跳過那一個，不要整支掛掉。
# Graph API 改版時第一個會壞的就是這裡（指標名稱每一兩版就搬一次家），
# 所以一律「一個一個試、失敗就記下來」，不要一次全要。
#
# 【2026-09 查過官方文件之後改的】
# Meta 在 2024-08 把 impressions / plays / video_views **全部併成 views**：
#     video_views  —— 2025-01-08 起所有版本廢除
#     impressions、plays —— 2025-04-21 起所有版本廢除
#     views 從 **v22.0** 開始才有（媒體與帳號洞察都是）
# 而這支腳本原本寫死 v21.0 —— 要一個那個版本沒有的指標，又去要兩個已經被廢掉的。
# FB 粉專那邊回的「(#100) The value must be a valid insights metric」就是這麼來的，
# 不是偶發。舊名稱留在清單後面當備援：真的碰到老貼文時還抓得到，
# 抓不到也只會被記進 missing，不會讓整支掛掉。
IG_METRICS = ["views", "reach", "likes", "comments", "shares", "saved"]
FB_METRICS = ["views", "post_reactions_by_type_total",
              "post_impressions", "post_video_views"]

# 哪些指標算「觀看數」。順序就是優先序。
VIEW_KEYS = ["views", "post_video_views", "post_impressions", "reach"]


class MetaError(Exception):
    pass


# ---------------------------------------------------------------------------
# Graph API
# ---------------------------------------------------------------------------
def _call(path, token, params=None, tries=4):
    """打一次 Graph API。被限流（#4／#17／#32）就等久一點再試。"""
    p = dict(params or {})
    p["access_token"] = token
    url = "%s/%s/%s?%s" % (GRAPH, GRAPH_VER, path.lstrip("/"),
                           urllib.parse.urlencode(p))
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            try:
                err = json.loads(body).get("error", {})
            except ValueError:
                err = {}
            code = err.get("code")
            # 4/17/32/613 都是「太頻繁」，613 是每小時上限；等一下就好
            if code in (4, 17, 32, 613) and i < tries - 1:
                time.sleep(20 * (i + 1))
                last = err
                continue
            raise MetaError("Graph API %s：%s（code=%s subcode=%s）" % (
                path, err.get("message", body[:200]), code, err.get("error_subcode")))
        except urllib.error.URLError as e:
            last = e
            if i < tries - 1:
                time.sleep(3 * (i + 1))
                continue
            raise MetaError("連不上 Graph API：%s" % e)
    raise MetaError("Graph API 重試都失敗：%s" % last)


def _paged(path, token, params, since_ts, limit_pages=40):
    """一頁一頁翻，翻到比 since_ts 還舊就停。"""
    out = []
    p = dict(params or {})
    p["limit"] = 50
    after = None
    for _ in range(limit_pages):
        if after:
            p["after"] = after
        data = _call(path, token, p)
        rows = data.get("data") or []
        out.extend(rows)
        # 最後一筆已經比我們要的範圍還舊 → 不用再往下翻
        if rows:
            last = rows[-1].get("timestamp") or rows[-1].get("created_time") or ""
            if last and last[:10] < since_ts:
                break
        nxt = ((data.get("paging") or {}).get("cursors") or {}).get("after")
        if not nxt or not rows:
            break
        after = nxt
    return out


def _insights(path, token, metrics, missing):
    """抓成效。整批要不到就一個一個要，把要不到的記進 missing。"""
    vals = {}
    try:
        data = _call(path, token, {"metric": ",".join(metrics)})
    except MetaError:
        data = None
    if data is None:
        for m in metrics:
            try:
                d1 = _call(path, token, {"metric": m})
            except MetaError as e:
                missing.setdefault(m, str(e)[:120])
                continue
            vals.update(_insight_values(d1))
        return vals
    return _insight_values(data)


def _insight_values(data):
    out = {}
    for row in (data.get("data") or []):
        name = row.get("name")
        vs = row.get("values") or []
        if not name or not vs:
            continue
        v = vs[-1].get("value")
        if isinstance(v, dict):          # post_reactions_by_type_total 是 map
            v = sum(int(x or 0) for x in v.values())
        try:
            out[name] = int(v or 0)
        except (TypeError, ValueError):
            pass
    return out


def _tick(n):
    """印一個點表示還活著。

    成效是一則貼文一次 API 呼叫，一個帳號跑下來可能好幾分鐘。
    中間什麼都不印的話，畫面看起來就是當掉了（第一次真的跑就是這樣）。
    """
    sys.stdout.write("." if n % 10 else str(n))
    sys.stdout.flush()


def list_ig(acc, token, since_ts):
    """一個 IG 帳號的貼文清單。**不問成效**——那是另一段，很貴。

    留言數（comments_count）跟讚數在清單裡就拿得到，不用另外呼叫。
    這件事決定了整個流程的形狀：先用留言數篩，篩剩的才去問觀看數。
    """
    rows = _paged("%s/media" % acc["igUserId"], token,
                  {"fields": "id,caption,timestamp,permalink,media_type,"
                             "like_count,comments_count"}, since_ts)
    out = []
    for r in rows:
        ts = str(r.get("timestamp") or "")
        if ts[:10] < since_ts:
            continue
        out.append({
            "platform": "IG", "account": acc["name"],
            "id": r.get("id"), "caption": r.get("caption") or "",
            "at": ts, "permalink": r.get("permalink") or "",
            "views": 0, "shares": 0,
            "likes": int(r.get("like_count") or 0),
            "comments": int(r.get("comments_count") or 0),
        })
    return out


def list_fb(acc, token, since_ts):
    """一個 FB 粉專的貼文清單（含 Reels）。同樣不問成效。

    ⚠️ 粉專的貼文要用**粉專自己的權杖**，不是你個人那一把。
    拿個人權杖去打 /{粉專}/posts 會被擋成
    「Invalid OAuth 2.0 Access Token（code=190 subcode=2069032）」——
    2026-09-11 第一次真的跑就是掛在這裡。粉專權杖在 /me/accounts 的
    access_token 欄位裡，設定精靈會一起存進設定檔。
    """
    rows = _paged("%s/posts" % acc["pageId"], acc.get("pageToken") or token,
                  {"fields": "id,message,created_time,permalink_url,"
                             "shares,comments.summary(true).limit(0)"}, since_ts)
    out = []
    for r in rows:
        ts = str(r.get("created_time") or "")
        if ts[:10] < since_ts:
            continue
        out.append({
            "platform": "FB", "account": acc["name"],
            "id": r.get("id"), "caption": r.get("message") or "",
            "at": ts, "permalink": r.get("permalink_url") or "",
            "views": 0, "likes": 0,
            "comments": int((((r.get("comments") or {}).get("summary") or {})
                             .get("total_count")) or 0),
            "shares": int(((r.get("shares") or {}).get("count")) or 0),
        })
    return out


NEEDED_SCOPES = ["instagram_basic", "instagram_manage_insights",
                 "pages_read_engagement", "pages_show_list", "read_insights"]


def check_token(token):
    """跑之前先問 Meta：這把權杖到底有哪些權限。

    2026-09-11 踩到的：IG 的**貼文清單抓得到**（195 則），但成效一律回
    「Bad signature（code=190）」，於是達標變成 0 則 —— 看起來像「沒有成效好的片」，
    其實是觀看數根本沒抓到。
    清單只要 instagram_basic，成效要 instagram_manage_insights ——
    少勾一個就長這樣，而錯誤訊息完全不會告訴你這件事。
    """
    try:
        data = _call("me/permissions", token)
    except MetaError as e:
        print("  ⚠ 問不到這把權杖的權限：%s" % e)
        return
    got = set(d.get("permission") for d in (data.get("data") or [])
              if d.get("status") == "granted")
    lack = [s for s in NEEDED_SCOPES if s not in got]
    if not lack:
        print("  權杖權限：五項都有 ✓")
        return
    print("  ⚠ 這把權杖少了這些權限，對應的東西會抓不到：")
    for s in lack:
        why = {"instagram_manage_insights": "IG 的觀看數（清單還是抓得到，所以容易誤判成『沒有好片』）",
               "instagram_basic": "IG 的貼文清單",
               "read_insights": "FB 粉專的成效",
               "pages_read_engagement": "FB 粉專的貼文",
               "pages_show_list": "查得到你管理哪些粉專"}.get(s, "")
        print("     %-28s %s" % (s, why))
    print("  → 回圖形 API 測試工具重新產生權杖，五項都勾，再用偵錯工具延長成 60 天，")
    print("    然後重跑 python3 tools/meta_setup.py")


def list_all(cfg, since_ts):
    """把每個帳號的貼文清單抓回來。這一段便宜 —— 一頁 50 則。"""
    token = cfg.get("token") or os.environ.get("META_TOKEN", "")
    if not token:
        raise MetaError("沒有 token：請在設定檔寫 token，或設環境變數 META_TOKEN")
    check_token(token)
    posts = []
    for acc in cfg.get("accounts") or []:
        name = acc.get("name") or "(沒有名字的帳號)"
        try:
            got = (list_ig(acc, token, since_ts)
                   if str(acc.get("platform", "")).upper() == "IG"
                   else list_fb(acc, token, since_ts))
        except MetaError as e:
            print("  ⚠ %s 抓不到：%s" % (name, e))
            continue
        print("  %s　%d 則" % (name, len(got)))
        posts.extend(got)
    return token, posts


def add_insights(posts, cfg, token, verbose=False):
    """只對挑出來的這幾則問成效。**這一段是整支腳本裡最慢的部分。**

    一則貼文一次 API 呼叫。第一版對全部 1,183 則都問了一次（二十幾分鐘），
    然後把其中 900 多則丟掉 —— 那些是商品圖文，影片庫裡本來就沒有。
    改成先比對、先篩，再問成效，呼叫數掉到一兩百次。
    """
    by_page = {}
    for acc in (cfg.get("accounts") or []):
        if acc.get("pageToken"):
            by_page[acc.get("name")] = acc["pageToken"]
    missing = {}
    for i, p in enumerate(posts, 1):
        _tick(i)
        tok = by_page.get(p["account"]) or token
        ins = _insights("%s/insights" % p["id"], tok,
                        IG_METRICS if p["platform"] == "IG" else FB_METRICS, missing)
        # ⚠️ 官方文件：「if insights data you are requesting does not exist or is
        #    currently unavailable the API will return an **empty data set
        #    instead of 0**.」
        #    所以「抓不到」跟「真的沒人看」在回應裡長得一樣 —— 都是沒有那個欄位。
        #    把它當 0 會讓這兩件事在畫面上變成同一件事，而我們正是用觀看數當門檻。
        #    這裡分開記：抓不到就標 viewsMissing，不要假裝它是 0。
        view = next((ins[k] for k in VIEW_KEYS if k in ins), None)
        p["views"] = int(view or 0)
        p["viewsMissing"] = view is None
        if p["platform"] == "IG":
            p["shares"] = ins.get("shares", p.get("shares", 0))
        else:
            p["likes"] = ins.get("post_reactions_by_type_total", p.get("likes", 0))
    print("")
    if missing:
        print("  ⚠ 這些指標這個版本要不到（成效會少一欄，不影響比對）：")
        for m, why in missing.items():
            print("     %s —— %s" % (m, why))
    if verbose and posts:
        print("  第一則長這樣（確認欄位有沒有對）：")
        print("  " + json.dumps(posts[0], ensure_ascii=False)[:400])
    return posts


# ---------------------------------------------------------------------------
# 哪幾則值得去問成效
# ---------------------------------------------------------------------------
def is_hit(post, min_views, min_comments):
    """這一則算不算「成效好」。老闆的定義：至少 5,000 點閱、5 個人留言。"""
    return (int(post.get("views") or 0) >= min_views
            and int(post.get("comments") or 0) >= min_comments)


def tracked_until(v, min_views, min_comments, track_days):
    """這支片追蹤到哪一天為止（沒達標過就回空字串）。

    達標那一則的發文日 ＋ track_days。老闆：「需要繼續追蹤，但也不需要永遠，
    待約三十天就可以，有足夠的數據跟第二次創作比較。」
    不另外存欄位 —— 從已經記下來的 metrics 就推得出來，少一個要同步的狀態。
    """
    best = ""
    for m in (v.get("metrics") or []):
        if not is_hit(m, min_views, min_comments):
            continue
        d = str(m.get("postAt") or "")[:10]
        if d:
            best = max(best, _plus_days(d, track_days))
    return best


def _plus_days(d, n):
    import datetime
    try:
        y, mo, da = int(d[0:4]), int(d[5:7]), int(d[8:10])
        return (datetime.date(y, mo, da) + datetime.timedelta(days=n)).isoformat()
    except Exception:                                          # noqa: BLE001
        return ""


def _folder_key(v):
    """存檔資料夾的 id。網址後面的 ?usp=share_link 之類的參數不算。"""
    import re
    f = str((v or {}).get("driveFolder") or "").strip()
    m = re.search(r"/folders/([A-Za-z0-9_-]+)", f)
    return m.group(1) if m else f


def remake_suspects(videos):
    """可能是二創的片 —— 老闆給的判準：同一個資料夾、檔名不一樣。

        「二創是『同一個資料夾的影片』若不同名字，就可能是第二次創作，
          我們不會同一支影片再次上傳。」

    正式資料量到 34 組同資料夾，其中 28 組檔名不一樣。那 28 組裡有兩種東西：
      真二創：V058（6/19）跟 Vmsik66vf20mnh（8/10），隔兩個月、新文案
              V175 跟 Vmtv7p1dg062ak「(可二剪)溱姐帶你認識權志龍身上的珠寶」
      重複建檔：V002 跟 V036，同一天、名字只差一個空格 —— 那是同一支片建了兩筆

    這裡**刻意用寬的版本**（不去分辨那兩種）。因為這個判斷只決定
    「要不要多花一次 API 呼叫」：多抓幾則的成本是幾秒，
    漏掉的成本是永遠看不到那個剪輯的表現。要分辨真假是第二步排序時的事。
    """
    by_folder = {}
    for v in videos or []:
        if v.get("deleted"):
            continue
        f = _folder_key(v)
        if f:
            by_folder.setdefault(f, []).append(v)
    out = set()
    for group in by_folder.values():
        if len(group) < 2:
            continue
        names = set(str(v.get("name") or "").strip() for v in group)
        if len(names) > 1:                 # 檔名完全一樣＝同一支，不是二創
            out.update(v.get("id") for v in group if v.get("id"))
    return out


def needs_insights(post, video, today, min_comments, min_views, track_days,
                   suspects=()):
    """這一則要不要花一次 API 呼叫去問成效？回傳 (要不要, 為什麼)。

    三種情況要問：
      1. 留言數夠 —— 可能是達標片。留言數在清單裡就有，不用花呼叫就篩得掉。
      2. 這支片還在追蹤期內 —— 已經達標過，要繼續看它後續掉多少。
      3. 這支片是二創 —— **不管它自己達不達標都要記**。
         兩種認法：sourceVideoId 有值（跨語言版／蝦皮版），
         或「同一個資料夾、檔名不一樣」（老闆給的判準，見 remake_suspects）。
         老闆要比的是「二創比原片掉了幾成」；二創剪壞的那幾支如果因為沒達標
         就不記，就永遠看不出是誰剪壞的 —— 而那正是最該看見的事。
    """
    if int(post.get("comments") or 0) >= min_comments:
        return True, "留言夠"
    if not video:
        return False, ""
    if str(video.get("sourceVideoId") or "").strip():
        return True, "二創"
    if video.get("id") in (suspects or ()):
        return True, "同資料夾不同檔名（可能是二創）"
    until = tracked_until(video, min_views, min_comments, track_days)
    if until and today <= until:
        return True, "追蹤中"
    return False, ""


# ---------------------------------------------------------------------------
# 寫回 Firestore
# ---------------------------------------------------------------------------
def _fv(v):
    """一個值包成 Firestore REST 的型別格式。"""
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    return {"stringValue": str(v if v is not None else "")}


def expected_here(v, connected):
    """這支片，預期會出現在我們連上的這幾個帳號上嗎？

    第一次跑完，41 支「已上片卻沒對到」裡有 20 支長這樣：
        Vmtoft5xd02upv  THIS GOAT LOOKED AT ME…   origLang=en  account=tiktok-English…
        Vmtofq7n907udp  แพะตัวนี้มองฉันราวกับว่า…  origLang=th  account=tiktok-Thailand
    十支英文版、十支泰文版，全部發在 TikTok 泰國／英語帳號 ——
    它們**本來就不在**這兩個 Meta 帳號上。算進分母只會讓數字看起來很糟，
    然後我們去查一個根本不存在的問題。
    """
    if str(v.get("locale") or "").strip():          # 英文版／泰文版在地化
        return False
    if str(v.get("channel") or "").strip():         # 蝦皮版／馬來版
        return False
    if str(v.get("origLang") or "").strip() not in ("", "zh"):   # 泰文／英文原創
        return False
    acc = str(v.get("account") or "").strip()       # 指定發在某個帳號（TikTok…）
    return not (acc and acc not in connected)


def coverage(videos, since_ts, until_ts, matched_ids, connected=()):
    """這段期間排了幾支片，分成三堆：對到、還沒上片、已上片卻沒對到。

    這是判斷「比對到底有沒有在運作」唯一有意義的數字。
    看「對上幾則 / 共幾則」會誤導：粉專一個月 989 則貼文，絕大多數是商品圖文，
    本來就不在影片庫裡，那種對不上是對的。真正要擔心的是反過來 ——
    **系統裡排了、平台上也發了，卻沒對到**，那才是比對漏掉了。

    ⚠️ 「排了日期」不等於「發出去了」。第一次跑量到這段期間排了 153 支，
    其中 19 支系統自己標著 published=false（還在待處理、剪輯中，或剪完還沒發）。
    平台上本來就不會有那 19 支的貼文 —— 把它們算進「沒對到」會讓數字看起來
    比實際糟，然後我們會去查一個根本不存在的問題。
    """
    hit, unpub, miss, elsewhere = [], [], [], []
    connected = set(connected or ())
    for v in videos or []:
        if v.get("deleted"):
            continue
        ds = [d for d in meta_match.video_dates(v) if since_ts <= d <= until_ts]
        if not ds:
            continue
        if not expected_here(v, connected):
            elsewhere.append(v)
        elif v.get("id") in matched_ids:
            hit.append(v)
        elif not v.get("published"):
            unpub.append(v)
        else:
            miss.append(v)
    return hit, unpub, miss, elsewhere


PROBE = 6      # 診斷用的段落長度（比正式比對的 20 字短，為了看得到「有點像」）
#          6 字是被資料逼出來的：「旺桃花珠寶套組」整個片名才 7 個字，
#          切 8 字的話它自己一段都切不出來，永遠回報「平台上沒發」—— 那是假的。


def best_near_miss(video, posts, topn=2):
    """這支片最像的幾則貼文是哪些、像多少。純診斷，不影響比對結果。

    正式比對要 20 個字連續一樣才算數，而且文案短於 20 字的片根本不進索引。
    可是「旺桃花珠寶」這種五個字的片名也是真的片 —— 它到底是
    「平台上根本沒發」還是「發了但我門檻設太高」？兩件事的處理方式完全不同，
    用 6 字的段落去看「有多像」就分得出來。
    """
    vw = set()
    for t in meta_match.video_texts(video):
        n = meta_match.normalize(t)
        vw.update(n[i:i + PROBE] for i in range(0, max(0, len(n) - PROBE + 1)))
    if not vw:
        return []
    scored = []
    for p in posts:
        np_ = meta_match.normalize(p.get("caption"))
        if len(np_) < PROBE:
            continue
        pw = set(np_[i:i + PROBE] for i in range(0, len(np_) - PROBE + 1))
        hit = len(vw & pw)
        if hit:
            scored.append((hit, len(vw), p))
    scored.sort(key=lambda x: -x[0])
    return scored[:topn]


def merge_metrics(old, rows):
    """把這次抓到的併進原本的 metrics，同一則貼文只留最新一筆。

    key 用 postId ——「同一支片在同一個帳號重播兩次」是兩則不同的貼文、
    兩份不同的成效，用 平台+帳號 當 key 的話後面那次會把前面那次蓋掉。
    """
    by_key = {}
    order = []
    for m in (old or []):
        k = str((m or {}).get("postId") or "") or \
            "%s|%s" % ((m or {}).get("platform", ""), (m or {}).get("account", ""))
        if k not in by_key:
            order.append(k)
        by_key[k] = dict(m or {})
    for r in rows:
        k = str(r.get("postId") or "")
        if k not in by_key:
            order.append(k)
        by_key[k] = r
    return [by_key[k] for k in order]


def write_back(cfg_fb, token, plan, fill_links):
    """把每一支影片的 metrics 寫回去。只動 metrics／metricsAt（＋選填的上片連結）。"""
    done, failed = 0, 0
    for p in plan:
        fields = {
            "metrics": {"arrayValue": {"values": [
                {"mapValue": {"fields": {k: _fv(v) for k, v in row.items()}}}
                for row in p["metrics"]]}},
            "metricsAt": {"stringValue": _fs.taipei_now()},
        }
        mask = ["metrics", "metricsAt"]
        if fill_links and p.get("fillLink"):
            fields["publishedLink"] = {"stringValue": p["fillLink"]}
            mask.append("publishedLink")
        url = "%s/videos/%s?%s" % (
            _fs.docs_base(cfg_fb), p["videoId"],
            "&".join("updateMask.fieldPaths=" + m for m in mask))
        try:
            _fs._patch(url, {"fields": fields}, token)
            done += 1
        except Exception as e:                                  # noqa: BLE001
            print("  ⚠ %s 寫入失敗：%s" % (p["videoId"], e))
            failed += 1
    return done, failed


def write_log(cfg_fb, token, text, detail):
    """在 logs 留一筆，寫清楚是後台跑的（跟人在網頁上按的分得開）。"""
    import random
    lid = "L%d%03d" % (int(time.time() * 1000), random.randint(0, 999))
    url = "%s/logs/%s" % (_fs.docs_base(cfg_fb), lid)
    body = {"fields": {
        "id": {"stringValue": lid},
        "at": {"stringValue": _fs.taipei_now()},
        "user": {"stringValue": "系統（後台）"},
        "action": {"stringValue": text},
        "detail": {"stringValue": detail[:1500]},
    }}
    _fs._patch(url + "?currentDocument.exists=false", body, token)


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="同步 FB／IG 貼文成效回影片庫")
    ap.add_argument("--config", default=DEFAULT_CONFIG)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--min-views", type=int, default=5000,
                    help="成效好的門檻：觀看數（預設 5000）")
    ap.add_argument("--min-comments", type=int, default=5,
                    help="成效好的門檻：留言數（預設 5）。也是「要不要花一次呼叫去問成效」的篩子")
    ap.add_argument("--track-days", type=int, default=30,
                    help="一支片達標之後，繼續追蹤幾天（預設 30）")
    ap.add_argument("--write", action="store_true", help="真的寫進資料庫（預設只看不寫）")
    ap.add_argument("--fill-links", action="store_true", help="順便把空的上片連結補回去")
    ap.add_argument("--save-posts", default="", help="把平台原始回應存成 JSON")
    ap.add_argument("--from-file", default="", help="用存好的 JSON 重跑比對，不連網")
    ap.add_argument("--videos-file", default="",
                    help="影片庫改讀這份 JSON（備份檔）而不是連資料庫；只能搭配只看不寫")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--explain", default="",
                    help="印出某一支影片對到了哪幾則貼文（警告跳出來時用這個查）")
    ap.add_argument("--why", action="store_true",
                    help="沒對到的那幾支，印出平台上最像的貼文（診斷「是沒發還是我門檻太高」）")
    args = ap.parse_args()

    import datetime
    since = (datetime.date.today() - datetime.timedelta(days=args.days)).isoformat()
    print("EC-DR 平台成效同步　範圍：%s 起　模式：%s"
          % (since, "寫入" if args.write else "只看不寫（要寫請加 --write）"))

    # 1. 拿貼文清單（便宜）—— 這一段還不問成效
    cfg, token = None, None
    if args.from_file:
        posts = json.load(open(args.from_file, encoding="utf-8"))
        print("\n用檔案裡的 %d 則貼文（沒有連網）" % len(posts))
    else:
        if not os.path.isfile(args.config):
            print("\n找不到設定檔 %s。\n內容格式見這支檔案開頭的說明。" % args.config)
            return 2
        cfg = json.load(open(args.config, encoding="utf-8"))
        print("\n抓貼文清單（還不問成效）：")
        token, posts = list_all(cfg, since)
    if not posts:
        print("\n沒有抓到任何貼文，結束。")
        return 1

    # 2. 讀影片庫
    cfg_fb, token = None, None
    if args.videos_file:
        if args.write:
            print("\n--videos-file 是拿備份檔重跑比對用的，不能配 --write。")
            return 2
        raw = json.load(open(args.videos_file, encoding="utf-8"))
        videos = raw.get("videos") if isinstance(raw, dict) else raw
    else:
        cfg_fb = _fs.load_config()
        token = _fs.sign_in(cfg_fb)
        videos = [_fs.doc_to_plain(d) for d in _fs.fetch_collection(cfg_fb, token, "videos")]
    for v in videos:
        v["id"] = v.get("id") or v.get("_id")
    print("\n影片庫 %d 支" % len(videos))

    # 3. 比對
    matched, unmatched, index = meta_match.match_all(posts, videos)
    print("可以參加比對的 %d 支（另外 %d 支沒有文案或太短，只能靠人填上片連結）"
          % (len(index), len(index.skipped)))
    print("\n比對結果：%d 則對上、%d 則對不上" % (len(matched), len(unmatched)))

    byvid = {v["id"]: v for v in videos}

    # 3.5 挑出值得花一次呼叫去問成效的那幾則，然後才問
    import datetime as _dt
    today = (_dt.datetime.utcnow() + _dt.timedelta(hours=8)).date().isoformat()
    suspects = remake_suspects(videos)
    want, why_count = [], {}
    for mm in matched:
        ok, why = needs_insights(mm["post"], byvid.get(mm["videoId"]), today,
                                 args.min_comments, args.min_views, args.track_days,
                                 suspects)
        if ok:
            want.append(mm["post"])
            why_count[why] = why_count.get(why, 0) + 1
    print("\n要問成效的 %d 則（其餘 %d 則不用花呼叫）："
          % (len(want), len(posts) - len(want)))
    for why, n in sorted(why_count.items(), key=lambda kv: -kv[1]):
        print("  %4d 則　%s" % (n, why))
    if want and not args.from_file:
        print("\n問成效（一則一次呼叫，這段最慢）：")
        sys.stdout.write("  ")
        add_insights(want, cfg, token, args.verbose)

    if args.save_posts:
        json.dump(posts, open(args.save_posts, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print("  原始回應存到 %s" % args.save_posts)

    # 某一個平台「整個」都是 0 就要喊 —— 不用等到全部平台都掛。
    # 2026-09-11 踩到的就是這個形狀：IG 的成效全被擋（Bad signature），
    # FB 還有數字，所以「全部都是 0」的條件沒成立，警告沒跳出來，
    # 畫面只顯示「達標 0 則」—— 看起來像「沒有成效好的片」。
    # 那是最糟的失敗形狀：它不像故障，像結論。
    by_plat = {}
    for p in want:
        by_plat.setdefault(p["platform"], []).append(int(p.get("views") or 0))
    nodata = [p for p in want if p.get("viewsMissing")]
    if nodata:
        print("\n⚠ 有 %d 則**抓不到觀看數**（Meta 回空的，不是回 0）。" % len(nodata))
        print("   常見原因：帳號粉絲數不足 100（官方說有些指標就是不給），")
        print("   或那則貼文的類型／年紀不支援。這幾則不會被當成「沒人看」。")

    dead = [k for k, vs in by_plat.items() if vs and not any(vs)]
    if dead:
        print("\n⚠⚠ %s 的成效**一則都沒抓到**（%d 則全是 0）。"
              % ("、".join(dead), sum(len(by_plat[k]) for k in dead)))
        print("   那不是「沒有成效好的片」，是成效根本沒抓到。")
        print("   最可能的原因是權杖少了權限 —— 跑一次不加 --from-file 就會看到檢查結果。")
        print("   **先不要 --write**，寫進去會是一堆 0。")

    hits = [p for p in want if is_hit(p, args.min_views, args.min_comments)]
    hit_vids = set(mm["videoId"] for mm in matched if mm["post"] in hits)
    print("\n達標（觀看 ≥ %s 且留言 ≥ %d）：%d 則、%d 支片"
          % ("{:,}".format(args.min_views), args.min_comments, len(hits), len(hit_vids)))

    wanted_ids = set(id(p) for p in want)
    plan = {}
    for m in matched:
        if id(m["post"]) not in wanted_ids:
            continue
        p, vid = m["post"], m["videoId"]
        row = {"platform": p["platform"], "account": p["account"],
               "views": int(p.get("views") or 0), "likes": int(p.get("likes") or 0),
               "comments": int(p.get("comments") or 0), "shares": int(p.get("shares") or 0),
               "at": _fs.taipei_now(), "postId": str(p.get("id") or ""),
               "viewsMissing": bool(p.get("viewsMissing")),
               "postAt": str(p.get("at") or "")[:19], "link": p.get("permalink") or ""}
        e = plan.setdefault(vid, {"videoId": vid, "rows": [], "fillLink": ""})
        e["rows"].append(row)
        if not str(byvid.get(vid, {}).get("publishedLink") or "").strip() and row["link"]:
            e["fillLink"] = e["fillLink"] or row["link"]

    # ── 一支片對到太多則＝幾乎一定是誤配 ──────────────────────────────
    # 一支片頂多是「每個帳號各發一次、偶爾重播」，連上兩個帳號的話個位數就滿了。
    # 2026-09-11 有一支對到 734 則（磁鐵是小編的固定招呼語），就是這樣被抓到的。
    # 這條線不擋寫入 —— 它只負責讓人一眼看到不對勁，判斷還是人做。
    TOO_MANY = max(8, len(set(p["account"] for p in posts)) * 4)
    hogs = sorted([(len(e["rows"]), vid) for vid, e in plan.items() if len(e["rows"]) > TOO_MANY],
                  reverse=True)
    if hogs:
        print("\n⚠⚠ 這幾支對到的則數多到不合理（超過 %d 則），幾乎一定是誤配：" % TOO_MANY)
        for cnt, vid in hogs[:10]:
            print("     %-16s %-26s 對到 %d 則"
                  % (vid, str(byvid.get(vid, {}).get("name") or "")[:26], cnt))
        print("   多半是某一句「小編招呼語」變成磁鐵。**先不要 --write**，把這段貼給我。")

    if args.explain:
        e = plan.get(args.explain)
        v = byvid.get(args.explain, {})
        print("\n── %s %s 對到的每一則 ──"
              % (args.explain, str(v.get("name") or "")[:34]))
        print("   系統裡這支片的文字：")
        for f in ("name", "rawName", "videoCopy"):
            t = str(v.get(f) or "").replace("\n", " ")
            if t:
                print("     %-9s %s" % (f, t[:80]))
        if not e:
            print("   （這支沒有對到任何一則）")
        for r in (e or {}).get("rows", []):
            print("     %s %s %s｜觀看 %s｜%s"
                  % (r["postAt"][:10], r["platform"], r["account"][:14],
                     "{:,}".format(r["views"]),
                     next((p.get("caption") or "")[:40].replace("\n", " ")
                          for p in posts if str(p.get("id")) == r["postId"])))

    print("\n要更新的影片 %d 支（★＝這次有達標）：" % len(plan))
    for vid, e in sorted(plan.items(), key=lambda kv: -sum(r["views"] for r in kv[1]["rows"]))[:40]:
        v = byvid.get(vid, {})
        tot = sum(r["views"] for r in e["rows"])
        print("  %s %-16s %-30s %d 則・觀看合計 %s%s"
              % ("★" if vid in hit_vids else "　", vid, str(v.get("name") or "")[:30],
                 len(e["rows"]), "{:,}".format(tot),
                 "　＋補上片連結" if (args.fill_links and e["fillLink"]) else ""))
    if len(plan) > 40:
        print("  …另外還有 %d 支" % (len(plan) - 40))

    # ── 真正該看的數字：系統裡排了的片，有幾支沒對到 ──────────────────
    import datetime
    today = (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).date().isoformat()
    connected = set(a.get("account") for a in [] ) | set(
        p["post"]["account"] for p in matched) | set(
        u["post"]["account"] for u in unmatched)
    # ⚠️ 這裡要用「有比對到的片」，不是「有問成效的片」。
    # 改成先篩再問成效之後我一度傳了 plan.keys()，涵蓋率從 110 掉到 57 ——
    # 那是假的下降：沒去問成效不代表沒對到，只代表那則沒達到留言門檻。
    matched_ids = set(mm["videoId"] for mm in matched)
    hit, unpub, miss, elsewhere = coverage(videos, since, today, matched_ids, connected)
    print("\n── 這段期間（%s ~ %s）的涵蓋率 ──" % (since, today))
    print("  系統裡排了 %d 支片" % (len(hit) + len(unpub) + len(miss) + len(elsewhere)))
    print("     發在別的帳號（海外／蝦皮，不該算）　%d 支" % len(elsewhere))
    print("     系統說還沒上片（正常）　　　　　　　%d 支" % len(unpub))
    print("     ── 這兩個帳號應該要有的：%d 支 ──" % (len(hit) + len(miss)))
    print("     對到貼文　　　　　　　　　　　　　　%d 支" % len(hit))
    print("     **已上片、卻沒對到**　　　　　　　　%d 支　← 只有這堆要查" % len(miss))
    if miss:
        print("\n  已上片卻沒對到的（最多列 15 支）：")
        for v in miss[:15]:
            why = "沒有文案也沒有片名可比對" if v.get("id") in index.skipped else "文案比對不到平台上的貼文"
            print("     %-16s %-26s %s｜%s"
                  % (v.get("id"), str(v.get("name") or "")[:26],
                     (meta_match.video_dates(v) or [""])[-1], why))
        if len(miss) > 15:
            print("     …另外還有 %d 支" % (len(miss) - 15))
        if args.why:
            print("\n  ── 這幾支「最像的貼文」是哪一則（診斷用，用 6 字段落看有多像）──")
            for v in miss:
                near = best_near_miss(v, posts)
                print("\n   %s %s" % (v.get("id"), str(v.get("name") or "")[:34]))
                if not near:
                    print("      平台上找不到任何一則跟它沾得上邊 → 這支大概沒發在這兩個帳號")
                for hit, tot, p in near:
                    print("      像 %d/%d 段　%s %s｜%s"
                          % (hit, tot, p["platform"], str(p.get("at"))[:10],
                             (p.get("caption") or "")[:34].replace("\n", " ")))

    if unmatched:
        # 「文案對不上任何一支」絕大多數是商品圖文貼文 —— 影片庫裡本來就沒有，
        # 那種對不上是對的，全部列出來只是把真正要看的那幾則淹掉。
        byreason = {}
        for u in unmatched:
            byreason.setdefault(u["why"].split("，")[0], []).append(u)
        print("\n對不上的 %d 則，分成：" % len(unmatched))
        for why, rows in sorted(byreason.items(), key=lambda kv: -len(kv[1])):
            print("  %4d 則　%s" % (len(rows), why))
        amb = [u for u in unmatched if u.get("candidates")]
        if amb:
            print("\n  其中這 %d 則是「有好幾支長得一樣、分不出是哪一支」，要人決定：" % len(amb))
            for u in amb[:15]:
                p = u["post"]
                print("     %s %s｜候選 %s｜%s"
                      % (p["platform"], str(p.get("at"))[:10], "、".join(u["candidates"]),
                         (p.get("caption") or "")[:26].replace("\n", " ")))
            if len(amb) > 15:
                print("     …另外還有 %d 則" % (len(amb) - 15))

    if not args.write:
        print("\n（只看不寫，資料庫沒有動。確認上面的清單是對的，再加 --write）")
        return 0

    # 4. 寫回去
    final = []
    for vid, e in plan.items():
        final.append({"videoId": vid,
                      "metrics": merge_metrics(byvid.get(vid, {}).get("metrics"), e["rows"]),
                      "fillLink": e["fillLink"]})
    done, failed = write_back(cfg_fb, token, final, args.fill_links)
    print("\n寫入完成：%d 支成功、%d 支失敗" % (done, failed))
    try:
        write_log(cfg_fb, token,
                  "後台同步平台成效 %d 支" % done,
                  "範圍 %s 起；貼文 %d 則、對上 %d、對不上 %d%s"
                  % (since, len(posts), len(matched), len(unmatched),
                     "；同時補了上片連結" if args.fill_links else ""))
    except Exception as e:                                      # noqa: BLE001
        print("  ⚠ 操作紀錄寫不進去：%s" % e)
    return 0 if not failed else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (MetaError, _fs.FsError) as exc:
        print("\n錯誤：%s" % exc)
        sys.exit(2)
