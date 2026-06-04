#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一次性把既有 Google 試算表匯入成系統的起始 data/db.json。

用法（在 Mac mini 上）：
  1. 在 Google 試算表把要匯入的分頁「檔案 → 下載 → 逗號分隔值 (.csv)」。
  2. 執行：
       python3 import_sheet.py --products 寵粉商品庫.csv --videos 原片清單.csv
     （兩個參數都可選，沒有就略過該類。）
  3. 完成後啟動 server.py 即可看到帶入的資料；不正確的再到系統內手動修正。

注意：因試算表欄位命名不一，匯入採「關鍵字比對表頭」的最佳努力方式，
      匯入後會印出摘要，請務必在系統內校對。
      若已有 data/db.json，會先備份成 data/db.json.bak 再覆寫商品/影片區塊。
"""

import argparse
import csv
import json
import os
import re
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "db.json")

# 表頭關鍵字 → 系統欄位
PRODUCT_MAP = {
    "name": ["片名", "商品", "正式名稱", "品名"],
    "nickname": ["簡稱", "暱稱", "代號"],
    "shoplineLink": ["shopline", "連結", "後台", "後臺"],
    "keywords": ["關鍵字", "關鍵詞"],
    "priceRange": ["價錢", "價格", "價位"],
    "backendQty": ["數量", "後台商品數量", "後臺商品數量"],
    "driveFolder": ["雲端", "drive", "影片雲端", "資料夾"],
    "postCopy": ["發布文案", "貼文", "文案"],
    "status": ["進度", "狀態", "上架"],
}
VIDEO_MAP = {
    "name": ["成品", "已剪輯成片", "片名", "原影片", "原片", "標題"],
    "type": ["類型", "分類"],
    "status": ["新舊", "新片", "舊片"],
    "editor": ["剪輯人員", "剪輯", "負責"],
    "voiceCopy": ["口播文案", "口播"],
    "postCopy": ["貼文文案", "貼文"],
    "driveFolder": ["雲端", "drive", "資料夾"],
}


def _find_col(headers, keywords):
    # 依關鍵字優先順序比對（前面的關鍵字優先），再看欄位位置
    for kw in keywords:
        for i, h in enumerate(headers):
            if kw.lower() in (h or "").strip().lower():
                return i
    return None


def _read_csv(path):
    with open(path, "r", encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.reader(fh))
    # 找出表頭列：取第一個有 2 個以上非空欄位的列
    header_idx = 0
    for i, r in enumerate(rows[:10]):
        if sum(1 for c in r if (c or "").strip()) >= 2:
            header_idx = i
            break
    return rows[header_idx], rows[header_idx + 1:]


def import_products(path):
    headers, rows = _read_csv(path)
    cols = {k: _find_col(headers, kws) for k, kws in PRODUCT_MAP.items()}
    out = []
    n = 0
    for r in rows:
        get = lambda k: (r[cols[k]].strip() if cols[k] is not None and cols[k] < len(r) else "")
        name = get("name")
        if not name:
            continue
        n += 1
        out.append({
            "id": "P%03d" % n,
            "name": name,
            "nickname": get("nickname"),
            "shoplineLink": get("shoplineLink"),
            "keywords": [x.strip() for x in re.split(r"[,\s、，]+", get("keywords")) if x.strip()],
            "priceRange": get("priceRange"),
            "backendQty": get("backendQty"),
            "driveFolder": get("driveFolder"),
            "postCopy": get("postCopy"),
            "status": get("status") or "待確認",
            "autoReply": "",
        })
    return out


def import_videos(path):
    headers, rows = _read_csv(path)
    cols = {k: _find_col(headers, kws) for k, kws in VIDEO_MAP.items()}
    out = []
    n = 0
    for r in rows:
        get = lambda k: (r[cols[k]].strip() if cols[k] is not None and cols[k] < len(r) else "")
        name = get("name")
        if not name:
            continue
        n += 1
        status = "舊片" if ("舊" in get("status")) else ("新片" if get("status") else "舊片")
        editor = get("editor")
        out.append({
            "id": "V%03d" % n,
            "name": name,
            "type": get("type") or "每日寵粉",
            "status": status,
            "productId": None,
            "editor": editor,
            "ctr": 0, "completionRate": 0, "firstHit": False,
            "totalUsed": 0, "lastUsedDate": None, "usageHistory": [],
            "coverChanged": False, "titleChanged": False,
            "driveFolder": get("driveFolder"),
            "voiceCopy": get("voiceCopy"), "postCopy": get("postCopy"),
            "languages": {
                "zh": {"status": "完成", "title": name, "editor": editor},
                "en": {"status": "未開始", "title": "", "editor": "", "driveFolder": ""},
                "th": {"status": "未開始", "title": "", "editor": "", "driveFolder": ""},
            },
        })
    return out


def load_or_default():
    if os.path.exists(DB_PATH):
        try:
            with open(DB_PATH, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            pass
    # 借用 server.py 的預設
    sys.path.insert(0, BASE_DIR)
    import server  # noqa
    return server.default_db()


def main():
    ap = argparse.ArgumentParser(description="匯入 Google 試算表 CSV 成起始 db.json")
    ap.add_argument("--products", help="寵粉商品庫 CSV 路徑")
    ap.add_argument("--videos", help="原片/成品清單 CSV 路徑")
    args = ap.parse_args()

    if not args.products and not args.videos:
        ap.print_help()
        return

    os.makedirs(os.path.join(BASE_DIR, "data"), exist_ok=True)
    db = load_or_default()

    if os.path.exists(DB_PATH):
        try:
            import shutil
            shutil.copy2(DB_PATH, DB_PATH + ".bak")
            print("已備份原 db.json → db.json.bak")
        except Exception:
            pass

    summary = []
    if args.products:
        ps = import_products(args.products)
        db["products"] = ps
        summary.append("寵粉商品 %d 筆" % len(ps))
    if args.videos:
        vs = import_videos(args.videos)
        db["videos"] = vs
        summary.append("影片 %d 筆" % len(vs))

    db.setdefault("_meta", {})["source"] = "import"
    with open(DB_PATH, "w", encoding="utf-8") as fh:
        json.dump(db, fh, ensure_ascii=False, indent=2)

    print("✅ 匯入完成：" + "、".join(summary))
    print("→ 寫入 %s" % DB_PATH)
    print("⚠️ 因試算表欄位不一，請啟動系統後到『寵粉商品庫／影片資料庫』校對修正。")


if __name__ == "__main__":
    main()
