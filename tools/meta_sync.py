#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 Facebook 粉專／Instagram 帳號上的貼文成效，同步回影片庫。

    python3 tools/meta_sync.py                     只看不寫（預設）
    python3 tools/meta_sync.py --write             真的寫進資料庫
    python3 tools/meta_sync.py --write --fill-links 順便把對到的上片連結補回去
    python3 tools/meta_sync.py --days 90           往回抓 90 天（預設 30）
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
GRAPH_VER = os.environ.get("META_GRAPH_VERSION", "v21.0")
DEFAULT_CONFIG = os.path.expanduser("~/.ecdr-meta.json")

# 想要的欄位；平台不給就跳過那一個，不要整支掛掉。
# Graph API 改版時第一個會壞的就是這裡（指標名稱每一兩版就搬一次家），
# 所以一律「一個一個試、失敗就記下來」，不要一次全要。
IG_METRICS = ["views", "reach", "likes", "comments", "shares", "saved"]
FB_METRICS = ["post_impressions", "post_impressions_unique",
              "post_video_views", "post_reactions_by_type_total"]


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


def fetch_ig(acc, token, since_ts, missing):
    """一個 IG 帳號的貼文＋成效。"""
    rows = _paged("%s/media" % acc["igUserId"], token,
                  {"fields": "id,caption,timestamp,permalink,media_type,"
                             "like_count,comments_count"}, since_ts)
    posts = []
    for r in rows:
        ts = str(r.get("timestamp") or "")
        if ts[:10] < since_ts:
            continue
        ins = _insights("%s/insights" % r["id"], token, IG_METRICS, missing)
        posts.append({
            "platform": "IG", "account": acc["name"],
            "id": r.get("id"), "caption": r.get("caption") or "",
            "at": ts, "permalink": r.get("permalink") or "",
            "views": ins.get("views", ins.get("reach", 0)),
            "likes": r.get("like_count", ins.get("likes", 0)),
            "comments": r.get("comments_count", ins.get("comments", 0)),
            "shares": ins.get("shares", 0),
        })
    return posts


def fetch_fb(acc, token, since_ts, missing):
    """一個 FB 粉專的貼文＋成效（含 Reels，Reels 也在 /posts 裡）。"""
    rows = _paged("%s/posts" % acc["pageId"], token,
                  {"fields": "id,message,created_time,permalink_url,"
                             "shares,comments.summary(true).limit(0)"}, since_ts)
    posts = []
    for r in rows:
        ts = str(r.get("created_time") or "")
        if ts[:10] < since_ts:
            continue
        ins = _insights("%s/insights" % r["id"], token, FB_METRICS, missing)
        posts.append({
            "platform": "FB", "account": acc["name"],
            "id": r.get("id"), "caption": r.get("message") or "",
            "at": ts, "permalink": r.get("permalink_url") or "",
            "views": ins.get("post_video_views", ins.get("post_impressions", 0)),
            "likes": ins.get("post_reactions_by_type_total", 0),
            "comments": (((r.get("comments") or {}).get("summary") or {})
                         .get("total_count", 0)),
            "shares": ((r.get("shares") or {}).get("count", 0)),
        })
    return posts


def fetch_all(cfg, since_ts, verbose=False):
    token = cfg.get("token") or os.environ.get("META_TOKEN", "")
    if not token:
        raise MetaError("沒有 token：請在設定檔寫 token，或設環境變數 META_TOKEN")
    missing, posts = {}, []
    for acc in cfg.get("accounts") or []:
        plat = str(acc.get("platform", "")).upper()
        name = acc.get("name") or "(沒有名字的帳號)"
        try:
            got = fetch_ig(acc, token, since_ts, missing) if plat == "IG" \
                else fetch_fb(acc, token, since_ts, missing)
        except MetaError as e:
            print("  ⚠ %s 抓不到：%s" % (name, e))
            continue
        print("  %s：%d 則" % (name, len(got)))
        posts.extend(got)
    if missing:
        print("\n  ⚠ 這些指標這個版本要不到（成效會少一欄，不影響比對）：")
        for m, why in missing.items():
            print("     %s —— %s" % (m, why))
    if verbose and posts:
        print("\n  第一則長這樣（確認欄位有沒有對）：")
        print("  " + json.dumps(posts[0], ensure_ascii=False)[:400])
    return posts


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
    ap.add_argument("--write", action="store_true", help="真的寫進資料庫（預設只看不寫）")
    ap.add_argument("--fill-links", action="store_true", help="順便把空的上片連結補回去")
    ap.add_argument("--save-posts", default="", help="把平台原始回應存成 JSON")
    ap.add_argument("--from-file", default="", help="用存好的 JSON 重跑比對，不連網")
    ap.add_argument("--videos-file", default="",
                    help="影片庫改讀這份 JSON（備份檔）而不是連資料庫；只能搭配只看不寫")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    import datetime
    since = (datetime.date.today() - datetime.timedelta(days=args.days)).isoformat()
    print("EC-DR 平台成效同步　範圍：%s 起　模式：%s"
          % (since, "寫入" if args.write else "只看不寫（要寫請加 --write）"))

    # 1. 拿貼文
    if args.from_file:
        posts = json.load(open(args.from_file, encoding="utf-8"))
        print("\n用檔案裡的 %d 則貼文（沒有連網）" % len(posts))
    else:
        if not os.path.isfile(args.config):
            print("\n找不到設定檔 %s。\n內容格式見這支檔案開頭的說明。" % args.config)
            return 2
        cfg = json.load(open(args.config, encoding="utf-8"))
        print("\n抓平台貼文：")
        posts = fetch_all(cfg, since, args.verbose)
    if args.save_posts:
        json.dump(posts, open(args.save_posts, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print("  原始回應存到 %s" % args.save_posts)
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
    plan = {}
    for m in matched:
        p, vid = m["post"], m["videoId"]
        row = {"platform": p["platform"], "account": p["account"],
               "views": int(p.get("views") or 0), "likes": int(p.get("likes") or 0),
               "comments": int(p.get("comments") or 0), "shares": int(p.get("shares") or 0),
               "at": _fs.taipei_now(), "postId": str(p.get("id") or ""),
               "postAt": str(p.get("at") or "")[:19], "link": p.get("permalink") or ""}
        e = plan.setdefault(vid, {"videoId": vid, "rows": [], "fillLink": ""})
        e["rows"].append(row)
        if not str(byvid.get(vid, {}).get("publishedLink") or "").strip() and row["link"]:
            e["fillLink"] = e["fillLink"] or row["link"]

    print("\n要更新的影片 %d 支：" % len(plan))
    for vid, e in sorted(plan.items(), key=lambda kv: -sum(r["views"] for r in kv[1]["rows"]))[:40]:
        v = byvid.get(vid, {})
        tot = sum(r["views"] for r in e["rows"])
        print("  %-16s %-30s %d 則・觀看合計 %s%s"
              % (vid, str(v.get("name") or "")[:30], len(e["rows"]), "{:,}".format(tot),
                 "　＋補上片連結" if (args.fill_links and e["fillLink"]) else ""))
    if len(plan) > 40:
        print("  …另外還有 %d 支" % (len(plan) - 40))

    if unmatched:
        print("\n對不上的 %d 則（這些要人看一下）：" % len(unmatched))
        for u in unmatched[:20]:
            p = u["post"]
            print("  %s %s %s｜%s｜%s" % (p["platform"], p["account"], str(p.get("at"))[:10],
                                         u["why"], (p.get("caption") or "")[:30].replace("\n", " ")))
        if len(unmatched) > 20:
            print("  …另外還有 %d 則" % (len(unmatched) - 20))

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
