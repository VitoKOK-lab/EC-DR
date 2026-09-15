#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 Meta 的廣告花費對回影片：這支片投了多少錢、多少人看到、多少人點。

    python3 tools/ads_sync.py            # 只看不寫
    python3 tools/ads_sync.py --write    # 真的寫進資料庫

老闆 2026-09-15 選了「A：系統自己去跟 Meta 要」，理由是不要有任何需要人定期動手的環節。

怎麼對回影片（兩步，每一步都是平台給的 id，不猜）
-----------------------------------------------
  廣告 → 貼文   Meta 每一則廣告的 creative 帶 effective_object_story_id（FB，長得像
                 頁面id_貼文id）或 effective_instagram_media_id（IG）。那就是它推的那則貼文。
  貼文 → 影片   同步每次都把每一則貼文的 postId 寫進 videos[].metrics[]。
                 正式資料 559 列全部有。同一把鑰匙，反過來查就是了。

⚠️ 這支只做「花了多少」。「賺回多少」（ROAS）要等 Shopline 月報表的欄位名稱，
   那是另一支；這裡把 adId 存下來，之後對訂單用得到。

⚠️ 廣告帳號的 ID 跟 ads_read 權限都在 ~/.ecdr-meta.json 裡（跟成效同步同一份），
   用 python3 tools/meta_setup.py 一次設好。權杖不進 repo、不進聊天。
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # noqa: E402
import meta_sync as M  # noqa: E402  只借它的 _call／_paged／_fv／MetaError，不跑它

ADS_SCOPE = "ads_read"
# ⚠️ 欄位名依 Marketing API 文件寫的。老闆給廣告帳號 ID 之後第一次跑會印出第一筆原始回應，
#    對不上就在這裡改 —— 不要猜著寫進資料庫。
AD_FIELDS = "id,name,status,effective_status,adset_id,campaign_id," \
            "creative{effective_object_story_id,effective_instagram_media_id}"
INSIGHT_FIELDS = "ad_id,spend,impressions,reach,clicks,inline_link_clicks,actions"
MAX_ADS = 2000     # 安全上限：一個帳號兩千則廣告已經很多，再多就是分頁壞了


def post_ids_of_ad(ad):
    """一則廣告推的是哪幾則貼文（FB 的 頁面_貼文 id、IG 的 media id）。"""
    c = (ad or {}).get("creative") or {}
    out = []
    for k in ("effective_object_story_id", "effective_instagram_media_id"):
        v = str(c.get(k) or "").strip()
        if v:
            out.append(v)
    return out


def actions_of(row):
    """insights 的 actions 是 [{action_type, value}]，攤成 dict。"""
    d = {}
    for a in (row or {}).get("actions") or []:
        t = str((a or {}).get("action_type") or "")
        if t:
            try:
                d[t] = d.get(t, 0) + float((a or {}).get("value") or 0)
            except (TypeError, ValueError):
                pass
    return d


def index_videos_by_post(videos):
    """postId → videoId。⚠️ 同一則貼文只能屬於一支片；出現兩支就兩支都不給，印出來讓人看。"""
    by, dup = {}, set()
    for v in videos:
        vid = v.get("id") or v.get("_id")
        for m in (v.get("metrics") or []):
            pid = str((m or {}).get("postId") or "").strip()
            if not pid:
                continue
            if pid in by and by[pid] != vid:
                dup.add(pid)
            by.setdefault(pid, vid)
    for pid in dup:
        by.pop(pid, None)
    return by, sorted(dup)


def build_rows(ads, insights, by_post, since, until):
    """把每一則廣告的花費掛到影片上。回傳 (plan{videoId: rows[]}, 對不到的廣告[])."""
    ins_by_ad = {str(r.get("ad_id") or ""): r for r in insights or []}
    plan, orphan = {}, []
    for ad in ads or []:
        aid = str(ad.get("id") or "")
        ins = ins_by_ad.get(aid) or {}
        spend = float(ins.get("spend") or 0)
        pids = post_ids_of_ad(ad)
        hit = [by_post[p] for p in pids if p in by_post]
        if not hit:
            orphan.append({"adId": aid, "name": ad.get("name") or "", "spend": spend, "posts": pids})
            continue
        vid = hit[0]
        act = actions_of(ins)
        row = {"adId": aid, "name": str(ad.get("name") or "")[:80],
               "status": str(ad.get("effective_status") or ad.get("status") or ""),
               "postId": next(p for p in pids if p in by_post),
               "spend": round(spend, 2),
               "impressions": int(float(ins.get("impressions") or 0)),
               "reach": int(float(ins.get("reach") or 0)),
               "clicks": int(float(ins.get("inline_link_clicks") or ins.get("clicks") or 0)),
               "purchases": int(act.get("purchase", act.get("omni_purchase", 0))),
               "since": since, "until": until, "at": _fs.taipei_now()}
        plan.setdefault(vid, []).append(row)
    return plan, orphan


def merge_ads(old, rows):
    """同一則廣告同一個區間只留最新那一列；其他的原封不動留著（不要弄丟歷史）。"""
    key = lambda r: (str(r.get("adId") or ""), str(r.get("since") or ""), str(r.get("until") or ""))  # noqa: E731
    by = {}
    order = []
    for r in (old or []):
        k = key(r)
        if k not in by:
            order.append(k)
        by[k] = dict(r)
    for r in rows:
        k = key(r)
        if k not in by:
            order.append(k)
        by[k] = r
    return [by[k] for k in order]


def fetch(cfg, token, ad_account, since, until, verbose=False):
    acct = "act_%s" % str(ad_account).replace("act_", "")
    ads = M._paged("%s/ads" % acct, token, {"fields": AD_FIELDS, "limit": 200}, "1970-01-01",
                   limit_pages=MAX_ADS // 200 + 1)
    ins = M._paged("%s/insights" % acct, token,
                   {"level": "ad", "fields": INSIGHT_FIELDS, "limit": 500,
                    "time_range": '{"since":"%s","until":"%s"}' % (since, until)},
                   "1970-01-01", limit_pages=MAX_ADS // 500 + 1)
    if verbose:
        import json
        print("  第一則廣告長這樣（確認欄位有沒有對）：")
        print("  " + json.dumps(ads[0] if ads else {}, ensure_ascii=False)[:400])
        print("  第一筆 insights 長這樣：")
        print("  " + json.dumps(ins[0] if ins else {}, ensure_ascii=False)[:400])
    return ads, ins


def write_back(cfg_fb, token, plan, byvid):
    done, failed = 0, 0
    for vid, rows in plan.items():
        merged = merge_ads(byvid.get(vid, {}).get("ads") or [], rows)
        fields = {"ads": {"arrayValue": {"values": [
                      {"mapValue": {"fields": {k: M._fv(v) for k, v in r.items()}}} for r in merged]}},
                  "adsAt": {"stringValue": _fs.taipei_now()}}
        url = "%s/videos/%s?updateMask.fieldPaths=ads&updateMask.fieldPaths=adsAt" % (_fs.docs_base(cfg_fb), vid)
        try:
            _fs._patch(url, {"fields": fields}, token)
            done += 1
        except Exception as e:                                  # noqa: BLE001
            print("  ⚠ %s 寫入失敗：%s" % (vid, e))
            failed += 1
    return done, failed


def report_status(cfg_fb, token, status):
    """寫進 meta/settings.adsSyncStatus —— 跟成效同步同一格式，畫面上那張卡才看得到。"""
    url = "%s/meta/settings?updateMask.fieldPaths=adsSyncStatus" % _fs.docs_base(cfg_fb)
    fields = {k: M._fv(v) for k, v in status.items()}
    _fs._patch(url, {"fields": {"adsSyncStatus": {"mapValue": {"fields": fields}}}}, token)


def main():
    ap = argparse.ArgumentParser(description="把 Meta 廣告花費對回影片")
    ap.add_argument("--config", default=M.DEFAULT_CONFIG)
    ap.add_argument("--days", type=int, default=30, help="抓最近幾天的花費（預設 30）")
    ap.add_argument("--write", action="store_true", help="真的寫進資料庫（預設只看不寫）")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    import json
    import datetime as dt
    try:
        cfg = json.load(open(os.path.expanduser(args.config), encoding="utf-8"))
    except Exception as e:                                      # noqa: BLE001
        print("⚠ 讀不到設定檔 %s：%s" % (args.config, e))
        return 1
    token = cfg.get("token") or os.environ.get("META_TOKEN", "")
    acct = str(cfg.get("adAccountId") or "").strip()
    if not token:
        print("⚠ 設定檔裡沒有權杖。先跑 python3 tools/meta_setup.py")
        return 1
    if not acct:
        print("⚠ 設定檔裡沒有廣告帳號 ID（adAccountId）。跑 python3 tools/meta_setup.py 補上。")
        return 1

    # 權限：少了 ads_read 整支都是空的，而且錯誤訊息不會講
    try:
        got = set(d.get("permission") for d in (M._call("me/permissions", token).get("data") or [])
                  if d.get("status") == "granted")
        if ADS_SCOPE not in got:
            print("⚠ 這把權杖沒有 %s —— 廣告資料一筆都拿不到。" % ADS_SCOPE)
            print("   回圖形 API 測試工具重新產生權杖，多勾 %s，延長成 60 天，再跑 meta_setup.py" % ADS_SCOPE)
            return 1
        print("  權杖有 %s ✓" % ADS_SCOPE)
    except Exception as e:                                      # noqa: BLE001
        print("  ⚠ 問不到權杖的權限：%s（照跑）" % e)

    until = (dt.datetime.utcnow() + dt.timedelta(hours=8)).date()
    since = until - dt.timedelta(days=args.days)
    since_s, until_s = since.isoformat(), until.isoformat()
    print("EC-DR 廣告花費同步　帳號 act_%s　範圍 %s ～ %s　模式：%s"
          % (acct.replace("act_", ""), since_s, until_s, "寫入" if args.write else "只看不寫"))

    try:
        ads, ins = fetch(cfg, token, acct, since_s, until_s, args.verbose)
    except Exception as e:                                      # noqa: BLE001
        print("⚠ 跟 Meta 要廣告資料失敗：%s" % e)
        return 1
    print("  廣告 %d 則、這段期間有花費紀錄的 %d 則" % (len(ads), len(ins)))

    cfg_fb = _fs.load_config()
    fb_token = _fs.sign_in(cfg_fb)
    videos = [_fs.doc_to_plain(d) for d in _fs.fetch_collection(cfg_fb, fb_token, "videos")]
    videos = [v for v in videos if not v.get("deleted")]
    for v in videos:
        v["id"] = v.get("id") or v.get("_id")
    byvid = {v["id"]: v for v in videos}
    by_post, dup = index_videos_by_post(videos)
    if dup:
        print("  ⚠ 這 %d 則貼文同時掛在兩支片上，不知道算誰的，先跳過：%s" % (len(dup), "、".join(dup[:5])))

    plan, orphan = build_rows(ads, ins, by_post, since_s, until_s)
    total = sum(r["spend"] for rows in plan.values() for r in rows)
    print("\n對到影片的廣告：%d 則 → %d 支片，花費合計 NT$%s" % (
        sum(len(r) for r in plan.values()), len(plan), "{:,.0f}".format(total)))
    for vid, rows in sorted(plan.items(), key=lambda kv: -sum(r["spend"] for r in kv[1]))[:12]:
        print("   NT$%8s　%s" % ("{:,.0f}".format(sum(r["spend"] for r in rows)),
                                 str(byvid.get(vid, {}).get("name") or vid)[:36]))
    osp = sum(a["spend"] for a in orphan)
    if orphan:
        print("\n對不到影片的廣告：%d 則，花費 NT$%s（推的貼文不在系統裡，或那支片還沒對到成效）"
              % (len(orphan), "{:,.0f}".format(osp)))
        for a in orphan[:8]:
            print("   NT$%8s　%s　→ %s" % ("{:,.0f}".format(a["spend"]), a["name"][:30], "、".join(a["posts"]) or "沒有推貼文"))

    if not args.write:
        print("\n（只看不寫，資料庫沒有動。確認上面對得對，再加 --write）")
        return 0

    # ⚠️ 寫之前重新登入 —— 長時間的同步會讓 Firebase 權杖過期（2026-09-13 那次 178 支全部 401）
    fb_token = _fs.sign_in(cfg_fb)
    done, failed = write_back(cfg_fb, fb_token, plan, byvid)
    print("\n寫入：%d 支成功、%d 支失敗" % (done, failed))
    status = {"at": _fs.taipei_now(), "ok": failed == 0, "videos": done, "failed": failed,
              "ads": len(ads), "matched": sum(len(r) for r in plan.values()),
              "orphan": len(orphan), "spend": round(total, 2), "orphanSpend": round(osp, 2),
              "days": args.days, "account": "act_%s" % acct.replace("act_", "")}
    code = os.environ.get("EC_DR_CODE_STATE") or ""
    if code:
        status["code"] = code
        status["codeNote"] = os.environ.get("EC_DR_CODE_NOTE") or ""
    try:
        report_status(cfg_fb, fb_token, status)
        _fs._patch("%s/logs/AD%s" % (_fs.docs_base(cfg_fb), _fs.taipei_now().replace(":", "").replace("-", "")),
                   {"fields": {"at": {"stringValue": _fs.taipei_now()}, "who": {"stringValue": "後台"},
                               "action": {"stringValue": "同步廣告花費"},
                               "target": {"stringValue": "%d 支片、NT$%s" % (done, "{:,.0f}".format(total))}}},
                   fb_token)
    except Exception as e:                                      # noqa: BLE001
        print("  ⚠ 狀態／操作紀錄寫不進去：%s" % e)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
