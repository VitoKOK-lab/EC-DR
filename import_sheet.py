#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把舊 Google 試算表（任一分頁的 CSV）匯入成 v2 新 schema 的 data/db.json。

v2 重新設計後的資料模型：
  - 影片任務（單表）：原片 → 成品 → 上片；欄位含 mainType（流量型/帶貨型）、
    subTag、source（老闆自拍/外部公司）、editor、scriptStatus、多語二創(中/英/泰/馬)。
  - 帶貨商品庫：name / shoplineLink / keywords / priceRange …

舊試算表欄位命名極不一致（同一概念有多種表頭、常夾雜空欄與星期字樣），
所以本工具用「關鍵字比對表頭」的最佳努力方式，並自動在多列中尋找最像表頭的那一列。

用法（在 Mac mini 上）：
  1. 在 Google 試算表，把要匯入的分頁「檔案 → 下載 → 逗號分隔值 (.csv)」。
     - 影片排程主表（含 預計上片日期/類型/原影片/剪輯人員/已剪輯成片…）→ 當 --videos
     - 商品庫（含 編號/標題/商品連結/關鍵字…）→ 當 --products
  2. 執行（兩參數皆可選）：
       python3 import_sheet.py --videos 排程主表.csv --products 商品庫.csv
       python3 import_sheet.py --videos 排程主表.csv --year 2026   # 指定無年份日期的年份
  3. 匯入會先把舊 data/db.json 備份成 data/db.json.bak，再把商品/影片「附加」進去。
     完成後啟動 server.py，到「影片庫 / 帶貨商品庫」校對修正（匯入為最佳努力）。

注意：本工具只「附加」資料、不覆蓋既有項目；重覆執行會產生重覆資料，請先確認。
"""

import argparse
import csv
import datetime
import os
import re
import sys

import server  # 重用 v2 的資料結構與存檔，確保格式一致

# ---------------------------------------------------------------------------
# 欄位關鍵字比對表（小寫比對；命中其一即視為該欄）
# ---------------------------------------------------------------------------
VIDEO_KEYS = {
    "scheduledDate": ["預計上片日期", "上片日期", "日期"],
    "rawName":       ["原影片", "原片", "影片名稱", "影片標題", "片名", "標題", "內容"],
    "name":          ["已剪輯成片", "成品", "成片"],
    "editor":        ["剪輯人員", "影片剪輯師", "剪輯師", "剪輯", "負責人"],
    "type":          ["類型", "屬性"],
    "product":       ["寵粉商品", "商品"],
    "script":        ["文案"],
    "prodStatus":    ["目前進度", "完成進度", "進度", "備註"],
    "shot":          ["有無拍攝", "已拍"],
    "en":            ["english"],
    "th":            ["thai", "泰"],
    "ms":            ["malay", "馬來", "馬"],
}
PRODUCT_KEYS = {
    "id":       ["編號"],
    "name":     ["標題", "片名", "名稱", "商品名", "商品"],
    "link":     ["商品連結", "連結", "網址", "原片網址", "shopline"],
    "keywords": ["關鍵字"],
    "price":    ["價位", "價錢", "價格", "價"],
    "status":   ["狀態", "進度"],
    "person":   ["出鏡人物", "出鏡"],
}

# 舊「類型」→ 新兩大類的對應（可依需要調整）
TYPE_TO_MAIN = {
    "銷售": "帶貨型", "招商": "帶貨型", "寵粉": "帶貨型", "帶貨": "帶貨型", "新品": "帶貨型",
    "吾家": "流量型", "流量": "流量型", "新片": "流量型", "舊片": "流量型",
}
# 把舊類型保留成子標籤，方便日後篩選
SUBTAG_FROM_TYPE = True


# ---------------------------------------------------------------------------
# 小工具
# ---------------------------------------------------------------------------
def norm(s):
    return re.sub(r"\s+", "", str(s or "")).strip().lower()


def match_col(header_cell, keyset):
    h = norm(header_cell)
    if not h:
        return None
    for field, kws in keyset.items():
        for kw in kws:
            if norm(kw) in h:
                return field
    return None


def find_header_row(rows, keyset):
    """在前 30 列中，找出「命中關鍵字的欄位數」最多的那一列當表頭。"""
    best_idx, best_map, best_hits = -1, {}, 0
    for i, row in enumerate(rows[:30]):
        colmap, used = {}, set()
        for ci, cell in enumerate(row):
            f = match_col(cell, keyset)
            if f and f not in used:
                colmap[f] = ci
                used.add(f)
        # 至少要有「名稱類」欄位才算數
        key_anchor = ("name" in colmap or "rawName" in colmap)
        hits = len(colmap)
        if key_anchor and hits > best_hits:
            best_idx, best_map, best_hits = i, colmap, hits
    return best_idx, best_map


def cell(row, idx):
    if idx is None or idx >= len(row):
        return ""
    return str(row[idx] or "").strip()


def parse_date(s, default_year):
    s = str(s or "").strip()
    if not s:
        return None
    m = re.search(r"(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})", s)          # 2026/6/1
    if m:
        y, mo, d = map(int, m.groups())
    else:
        m = re.search(r"(\d{1,2})月(\d{1,2})日", s)                       # 5月27日
        if m:
            y, mo, d = default_year, int(m.group(1)), int(m.group(2))
        else:
            return None
    try:
        return datetime.date(y, mo, d).isoformat()
    except ValueError:
        return None


def map_main_type(old_type, has_product):
    t = norm(old_type)
    for k, v in TYPE_TO_MAIN.items():
        if norm(k) in t:
            return v
    return "帶貨型" if has_product else "流量型"


def script_status(raw):
    v = norm(raw)
    if not v:
        return "未開始"
    if "完成" in v or "ok" in v:
        return "完成"
    if "處理" in v or "撰寫" in v or "中" in v:
        return "撰寫中"
    return "未開始"


def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as fh:
        return [row for row in csv.reader(fh)]


# ---------------------------------------------------------------------------
# 匯入：商品
# ---------------------------------------------------------------------------
def import_products(db, path):
    rows = read_csv(path)
    hidx, cmap = find_header_row(rows, PRODUCT_KEYS)
    if hidx < 0:
        print("  ⚠️ 商品 CSV 找不到可辨識的表頭，略過。")
        return 0, {}
    print("  表頭在第 %d 列，對應欄位：%s" % (hidx + 1, {k: v for k, v in cmap.items()}))
    added, name_to_id = 0, {}
    for row in rows[hidx + 1:]:
        name = cell(row, cmap.get("name"))
        if not name:
            continue
        kws = cell(row, cmap.get("keywords"))
        product = {
            "id": server.next_id(db["products"], "P"),
            "name": name,
            "nickname": "",
            "shoplineLink": cell(row, cmap.get("link")),
            "keywords": [k.strip() for k in re.split(r"[，,、|]", kws) if k.strip()],
            "priceRange": cell(row, cmap.get("price")),
            "driveFolder": "",
            "postCopy": "",
            "status": cell(row, cmap.get("status")) or "待確認",
            "legacyCode": cell(row, cmap.get("id")),
        }
        db["products"].append(product)
        name_to_id[norm(name)] = product["id"]
        added += 1
    return added, name_to_id


# ---------------------------------------------------------------------------
# 匯入：影片任務
# ---------------------------------------------------------------------------
def import_videos(db, path, default_year, name_to_id):
    rows = read_csv(path)
    hidx, cmap = find_header_row(rows, VIDEO_KEYS)
    if hidx < 0:
        print("  ⚠️ 影片 CSV 找不到可辨識的表頭，略過。")
        return 0
    print("  表頭在第 %d 列，對應欄位：%s" % (hidx + 1, {k: v for k, v in cmap.items()}))
    langs = db.get("settings", {}).get("languages", ["zh"])
    added = 0
    for row in rows[hidx + 1:]:
        raw = cell(row, cmap.get("rawName"))
        name = cell(row, cmap.get("name"))
        if not raw and not name:
            continue
        prod_name = cell(row, cmap.get("product"))
        pid = name_to_id.get(norm(prod_name)) if prod_name else None
        old_type = cell(row, cmap.get("type"))
        has_prod = bool(prod_name)
        main = map_main_type(old_type, has_prod)
        sub = old_type if (SUBTAG_FROM_TYPE and old_type) else ""

        v = server.new_video_record(
            db,
            rawName=raw,
            name=name,
            mainType=main,
            subTag=sub,
            editor=cell(row, cmap.get("editor")),
            scheduledDate=parse_date(cell(row, cmap.get("scheduledDate")), default_year),
            productId=pid,
            scriptStatus=script_status(cell(row, cmap.get("script")) or cell(row, cmap.get("prodStatus"))),
        )
        # 完成狀態：成品有填、或進度顯示完成 → 視為已完成
        prod_done = "完成" in norm(cell(row, cmap.get("prodStatus")))
        if name and (prod_done or cell(row, cmap.get("prodStatus")) == ""):
            v["stage"] = "已完成"
            v["languages"]["zh"]["status"] = "完成"
            v["languages"]["zh"]["editor"] = v.get("editor", "")
        # 多語二創：對應欄位有填內容 → 標記完成
        for lg, key in (("en", "en"), ("th", "th"), ("ms", "ms")):
            if lg in langs and cmap.get(key) is not None:
                txt = cell(row, cmap.get(key))
                if txt:
                    v["languages"].setdefault(lg, {})["status"] = "完成"
        db["videos"].append(v)
        added += 1
    return added


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="把舊試算表 CSV 匯入 v2 新 schema 的 data/db.json")
    ap.add_argument("--videos", help="影片排程主表 CSV")
    ap.add_argument("--products", help="商品庫 CSV")
    ap.add_argument("--year", type=int, default=datetime.date.today().year,
                    help="無年份日期（如 5月27日）預設使用的年份")
    args = ap.parse_args()
    if not args.videos and not args.products:
        ap.error("請至少提供 --videos 或 --products 其中之一")

    server.ensure_dirs()
    db = server.load_db()

    # 先備份既有 db.json
    if os.path.exists(server.DB_PATH):
        bak = server.DB_PATH + ".bak"
        try:
            import shutil
            shutil.copy2(server.DB_PATH, bak)
            print("已備份既有資料：%s" % bak)
        except Exception as e:
            print("[備份警告] %s" % e)

    name_to_id = {}
    # 也把既有商品納入名稱對照（影片可連到已存在的商品）
    for p in db.get("products", []):
        if p.get("name"):
            name_to_id[norm(p["name"])] = p["id"]

    if args.products:
        print("匯入商品：%s" % args.products)
        n, m = import_products(db, args.products)
        name_to_id.update(m)
        print("  → 新增 %d 筆商品" % n)

    if args.videos:
        print("匯入影片：%s" % args.videos)
        n = import_videos(db, args.videos, args.year, name_to_id)
        print("  → 新增 %d 筆影片任務" % n)

    server.save_db(db)
    print("完成。請啟動 server.py 後到「影片庫 / 帶貨商品庫」校對修正。")
    print("（匯入為最佳努力；類型已用對照表轉成 流量型/帶貨型，原類型保留在子標籤。）")


if __name__ == "__main__":
    main()
