#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
影片剪輯部門排程系統 — 後端伺服器
純 Python 標準函式庫，無第三方依賴。
啟動：  python3 server.py          （預設埠 3000）
        PORT=8080 python3 server.py
資料：  data/db.json （伺服器當權威，前端不能直接改檔）
備份：  data/backups/（滾動備份）、data/backups/daily/（每日快照）
"""

import json
import os
import re
import shutil
import threading
import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

# ---------------------------------------------------------------------------
# 路徑設定
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "db.json")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")
DAILY_DIR = os.path.join(BACKUP_DIR, "daily")
PORT = int(os.environ.get("PORT", "3000"))

_LOCK = threading.RLock()


# ---------------------------------------------------------------------------
# 預設資料（首次啟動或匯入前的種子）
# ---------------------------------------------------------------------------
def default_db():
    return {
        "users": [
            {"name": "冠廷", "isDefault": True},
            {"name": "健加", "isDefault": True},
            {"name": "鴻閔", "isDefault": True},
            {"name": "泓儒", "isDefault": True},
            {"name": "怡如", "isDefault": True},
        ],
        "products": [],
        "materials": [],
        "videos": [],
        "schedule": {},
        "defaultQuotas": {"每日寵粉": 2, "銷售": 1, "招商": 0, "吾家": 1},
        "slotTemplates": [
            {"time": "10:00", "type": "舊片"},
            {"time": "12:00", "type": "每日寵粉"},
            {"time": "17:00", "type": "銷售"},
            {"time": "18:00", "type": "新片"},
        ],
        "platforms": ["ig", "fb", "youtube", "tk", "wapp", "line", "threads"],
        "devices": [],
        "auditLog": [],
        "settings": {
            "adminPassword": "1234",
            "requireDailyNewVideo": True,
            "categories": ["每日寵粉", "銷售", "招商", "吾家"],
            "languages": ["zh", "en", "th"],
            "accountTemplate": "YYYYMMDDg##平台",
            "materialLowThreshold": 5,
            "reuseCap": 3,
            "reuseWindowDays": 30,
            "newVideoScore": 10,
            "firstHitScore": 20,
            "reuseHitScore": 5,
            "promoScore": 15,
            "derivativeScore": 8,
            "offsiteBackupDir": "",
            "backupKeep": 50,
        },
        "_meta": {"source": "default", "createdAt": now_iso()},
    }


# ---------------------------------------------------------------------------
# 小工具
# ---------------------------------------------------------------------------
def now_iso():
    return datetime.datetime.now().isoformat(timespec="seconds")


def today_str():
    return datetime.date.today().isoformat()


def next_id(items, prefix):
    """依現有項目產生下一個遞增 ID，如 P001 / M012 / V034。"""
    mx = 0
    for it in items:
        m = re.match(r"^%s(\d+)$" % re.escape(prefix), str(it.get("id", "")))
        if m:
            mx = max(mx, int(m.group(1)))
    return "%s%03d" % (prefix, mx + 1)


# ---------------------------------------------------------------------------
# 讀寫 + 備份 + 損毀自動還原
# ---------------------------------------------------------------------------
def ensure_dirs():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(BACKUP_DIR, exist_ok=True)
    os.makedirs(DAILY_DIR, exist_ok=True)


def _restore_from_backup():
    """db.json 損毀時，找最近一份可解析的備份還原。回傳 dict 或 None。"""
    if not os.path.isdir(BACKUP_DIR):
        return None
    candidates = []
    for root in (BACKUP_DIR, DAILY_DIR):
        if os.path.isdir(root):
            for f in os.listdir(root):
                if f.endswith(".json"):
                    candidates.append(os.path.join(root, f))
    candidates.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    for path in candidates:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            print("[救援] db.json 損毀，已從備份還原：%s" % path)
            return data
        except Exception:
            continue
    return None


def load_db():
    ensure_dirs()
    if not os.path.exists(DB_PATH):
        db = default_db()
        _write_db_file(db)
        return db
    try:
        with open(DB_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as e:
        print("[警告] db.json 無法解析：%s" % e)
        restored = _restore_from_backup()
        if restored is not None:
            _write_db_file(restored)
            return restored
        print("[警告] 找不到可用備份，改用預設空資料。")
        db = default_db()
        _write_db_file(db)
        return db


def _write_db_file(db):
    """原子寫入：先寫 .tmp 再 rename。"""
    ensure_dirs()
    tmp = DB_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(db, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, DB_PATH)


def _make_backups(db):
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    # 滾動備份
    try:
        shutil.copy2(DB_PATH, os.path.join(BACKUP_DIR, "db-%s.json" % ts))
    except Exception as e:
        print("[備份警告] %s" % e)
    # 每日快照（當天第一次才建立，不覆蓋）
    daily_path = os.path.join(DAILY_DIR, "%s.json" % today_str())
    if not os.path.exists(daily_path):
        try:
            shutil.copy2(DB_PATH, daily_path)
        except Exception as e:
            print("[每日快照警告] %s" % e)
        # 異地第二份（若有設定，例如 Google Drive 同步資料夾）
        offsite = db.get("settings", {}).get("offsiteBackupDir") or ""
        if offsite and os.path.isdir(offsite):
            try:
                shutil.copy2(DB_PATH, os.path.join(offsite, "ecdr-%s.json" % today_str()))
            except Exception as e:
                print("[異地備份警告] %s" % e)
    # 清理滾動備份，只留最近 N 份
    keep = int(db.get("settings", {}).get("backupKeep", 50))
    rolls = sorted(
        [f for f in os.listdir(BACKUP_DIR) if f.startswith("db-") and f.endswith(".json")]
    )
    for f in rolls[:-keep] if keep > 0 else []:
        try:
            os.remove(os.path.join(BACKUP_DIR, f))
        except Exception:
            pass


def save_db(db):
    with _LOCK:
        _write_db_file(db)
        _make_backups(db)


def audit(db, user, device_id, action, target="", detail=None):
    db.setdefault("auditLog", []).append({
        "ts": now_iso(),
        "user": user or "?",
        "deviceId": device_id or "?",
        "action": action,
        "target": target,
        "detail": detail or {},
    })


def touch_device(db, device_id, user):
    if not device_id:
        return
    for d in db.setdefault("devices", []):
        if d.get("deviceId") == device_id:
            d["lastUser"] = user
            d["lastSeen"] = now_iso()
            return
    db["devices"].append({
        "deviceId": device_id, "label": "", "lastUser": user, "lastSeen": now_iso()
    })


def is_admin(db, body):
    return str(body.get("adminPassword", "")) == str(
        db.get("settings", {}).get("adminPassword", "")
    )


# ---------------------------------------------------------------------------
# 衍生計算：30 天內使用次數、燈號、預警、儀表板、績效
# ---------------------------------------------------------------------------
def used_in_window(video, window_days):
    cutoff = datetime.date.today() - datetime.timedelta(days=window_days)
    cnt = 0
    for d in video.get("usageHistory", []):
        try:
            if datetime.date.fromisoformat(d[:10]) >= cutoff:
                cnt += 1
        except Exception:
            pass
    return cnt


def day_is_complete(db, date_str):
    day = db.get("schedule", {}).get(date_str)
    if not day:
        return False
    quotas = day.get("quotas", db.get("defaultQuotas", {}))
    counts = {}
    has_new = False
    for s in day.get("slots", []):
        counts[s.get("type", "")] = counts.get(s.get("type", ""), 0) + 1
        vid = find_by_id(db["videos"], s.get("videoId"))
        if (vid and vid.get("status") == "新片") or s.get("type") == "新片":
            has_new = True
    for cat, need in quotas.items():
        if counts.get(cat, 0) < int(need or 0):
            return False
    if db.get("settings", {}).get("requireDailyNewVideo", True) and not has_new:
        return False
    return True


def compute_warnings(db):
    today = datetime.date.today()
    emergency, warning = [], []
    for offset in range(0, 8):
        d = today + datetime.timedelta(days=offset)
        ds = d.isoformat()
        if day_is_complete(db, ds):
            continue
        if offset <= 3:
            emergency.append(ds)
        else:
            warning.append(ds)
    return {"emergency": emergency, "warning": warning}


def find_by_id(items, _id):
    for it in items:
        if it.get("id") == _id:
            return it
    return None


def compute_scores(db):
    s = db.get("settings", {})
    table = {}
    for u in db.get("users", []):
        table[u["name"]] = {
            "新片數": 0, "首次達標": 0, "舊片二次達標": 0,
            "帶貨片數": 0, "二創數": 0, "總積分": 0,
        }
    for v in db.get("videos", []):
        ed = v.get("editor")
        if ed not in table:
            continue
        row = table[ed]
        if v.get("status") == "新片":
            row["新片數"] += 1
            row["總積分"] += s.get("newVideoScore", 10)
        if v.get("firstHit"):
            row["首次達標"] += 1
            row["總積分"] += s.get("firstHitScore", 20)
        if v.get("type") in ("每日寵粉", "銷售"):
            row["帶貨片數"] += 1
            row["總積分"] += s.get("promoScore", 15)
        # 二創：英/泰由不同剪輯人員完成
        for lang in ("en", "th"):
            lv = v.get("languages", {}).get(lang, {})
            led = lv.get("editor")
            if lv.get("status") == "完成" and led in table:
                table[led]["二創數"] += 1
                table[led]["總積分"] += s.get("derivativeScore", 8)
    return table


def compute_dashboard(db, date_str):
    """大方向進度 + 每人當日工作 + 需要支援清單。"""
    warnings = compute_warnings(db)
    # 每人當日工作（取自稽核紀錄 + 素材/影片狀態）
    per_user = {u["name"]: {"今日動作": [], "完成片": [], "搶單": [], "二創": []}
                for u in db.get("users", [])}
    for log in db.get("auditLog", []):
        if log.get("ts", "")[:10] != date_str:
            continue
        u = log.get("user")
        if u in per_user:
            per_user[u]["今日動作"].append(
                {"ts": log["ts"], "action": log["action"], "target": log["target"]}
            )
    for m in db.get("materials", []):
        if m.get("claimedBy") in per_user and (m.get("claimedAt", "")[:10] == date_str):
            per_user[m["claimedBy"]]["搶單"].append(m.get("name"))
    # 需要支援清單
    help_list = [
        {"materialId": m["id"], "name": m.get("name"), "by": m.get("claimedBy"),
         "note": m.get("helpNote", "")}
        for m in db.get("materials", []) if m.get("needHelp")
    ]
    # 大方向進度
    progress = {
        "待剪素材數": sum(1 for m in db.get("materials", []) if m.get("status") == "待剪"),
        "新片庫數": sum(1 for v in db.get("videos", []) if v.get("status") == "新片"),
        "本週緊急": warnings["emergency"],
        "本週警告": warnings["warning"],
        "二創待辦": sum(
            1 for v in db.get("videos", [])
            for lang in ("en", "th")
            if v.get("languages", {}).get(lang, {}).get("status") in ("未開始", "二創中")
        ),
    }
    return {"date": date_str, "progress": progress, "perUser": per_user,
            "helpList": help_list, "scores": compute_scores(db)}


def public_state(db):
    """回傳給前端的 state：附上每支影片的衍生欄位，隱藏管理者密碼。"""
    out = json.loads(json.dumps(db))  # 深拷貝
    win = db.get("settings", {}).get("reuseWindowDays", 30)
    cap = db.get("settings", {}).get("reuseCap", 3)
    for v in out.get("videos", []):
        u = used_in_window(v, win)
        v["last30dUsed"] = u
        v["light"] = "red" if u >= cap else ("yellow" if u == cap - 1 else "green")
    out.setdefault("settings", {})["adminPassword"] = "***"  # 不外洩
    out["_warnings"] = compute_warnings(db)
    return out


# ---------------------------------------------------------------------------
# HTTP 處理
# ---------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "ECDR/1.0"

    def log_message(self, fmt, *args):
        pass  # 安靜

    # --- 回應工具 ---
    def _send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _err(self, msg, code=400):
        self._send_json({"error": msg}, code)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.end_headers()

    # --- GET ---
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/"):
            return self._api_get(path, parse_qs(parsed.query))
        return self._serve_static(path)

    def _api_get(self, path, qs):
        with _LOCK:
            db = load_db()
            if path == "/api/state":
                return self._send_json(public_state(db))
            if path == "/api/settings":
                s = dict(db.get("settings", {}))
                s["adminPassword"] = "***"
                return self._send_json(s)
            if path == "/api/users":
                return self._send_json(db.get("users", []))
            if path == "/api/dashboard":
                date_str = (qs.get("date", [today_str()])[0])
                return self._send_json(compute_dashboard(db, date_str))
            if path == "/api/export":
                return self._send_json(db)
        return self._err("not found", 404)

    def _serve_static(self, path):
        if path == "/" or path == "":
            path = "/index.html"
        # 防目錄穿越
        safe = os.path.normpath(path).lstrip("/")
        full = os.path.join(PUBLIC_DIR, safe)
        if not full.startswith(PUBLIC_DIR) or not os.path.isfile(full):
            self.send_error(404)
            return
        ctype = "text/html; charset=utf-8"
        if full.endswith(".js"):
            ctype = "application/javascript; charset=utf-8"
        elif full.endswith(".css"):
            ctype = "text/css; charset=utf-8"
        elif full.endswith(".json"):
            ctype = "application/json; charset=utf-8"
        with open(full, "rb") as fh:
            data = fh.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # --- POST / PUT / DELETE ---
    def do_POST(self):
        self._api_write("POST")

    def do_PUT(self):
        self._api_write("PUT")

    def do_DELETE(self):
        self._api_write("DELETE")

    def _api_write(self, method):
        parsed = urlparse(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            return self._err("not found", 404)
        body = self._read_body()
        user = body.get("user", "")
        device_id = body.get("deviceId", "")
        parts = [unquote(p) for p in path.split("/") if p]  # 去空段並解碼；parts[0]=="api"
        with _LOCK:
            db = load_db()
            touch_device(db, device_id, user)
            try:
                result = self._route(method, parts, body, db, user, device_id)
            except PermissionError as e:
                return self._err(str(e) or "需要管理者權限", 403)
            except ValueError as e:
                return self._err(str(e), 400)
            if result is None:
                return self._err("not found", 404)
            save_db(db)
            return self._send_json(result)

    # --- 路由 ---
    def _route(self, method, parts, body, db, user, device_id):
        # parts 例：["api","materials","M001","claim"]
        seg = parts[1:] if len(parts) > 1 else []
        if not seg:
            return None
        head = seg[0]

        # ---- 設定 ----
        if head == "settings" and method == "PUT":
            if not is_admin(db, body):
                raise PermissionError("管理者密碼錯誤")
            incoming = body.get("settings", {})
            # 不允許把密碼設為 ***
            if incoming.get("adminPassword") == "***":
                incoming.pop("adminPassword", None)
            db["settings"].update(incoming)
            audit(db, user, device_id, "settings.update", detail=list(incoming.keys()))
            return {"ok": True, "settings": {**db["settings"], "adminPassword": "***"}}

        # ---- 使用者 ----
        if head == "users":
            if method == "POST":
                name = (body.get("name") or "").strip()
                if not name:
                    raise ValueError("請輸入名稱")
                if any(u["name"] == name for u in db["users"]):
                    raise ValueError("名稱已存在")
                db["users"].append({"name": name, "isDefault": False})
                audit(db, user, device_id, "user.add", name)
                return {"ok": True, "users": db["users"]}
            if method == "DELETE":
                if not is_admin(db, body):
                    raise PermissionError("刪除使用者需管理者密碼")
                name = seg[1] if len(seg) > 1 else body.get("name")
                target = find_user(db, name)
                if not target:
                    return None
                if target.get("isDefault"):
                    raise ValueError("預設成員受保護，不可刪除")
                db["users"] = [u for u in db["users"] if u["name"] != name]
                audit(db, user, device_id, "user.delete", name)
                return {"ok": True, "users": db["users"]}

        # ---- 寵粉商品庫 ----
        if head == "products":
            if method == "POST":
                p = body.get("product", {})
                p["id"] = next_id(db["products"], "P")
                db["products"].append(p)
                audit(db, user, device_id, "product.add", p["id"])
                return {"ok": True, "id": p["id"]}
            if method == "PUT":
                if not is_admin(db, body):
                    raise PermissionError("修改商品需管理者密碼")
                pid = seg[1]
                p = find_by_id(db["products"], pid)
                if not p:
                    return None
                p.update(body.get("product", {}))
                p["id"] = pid
                audit(db, user, device_id, "product.update", pid)
                return {"ok": True}
            if method == "DELETE":
                if not is_admin(db, body):
                    raise PermissionError("刪除商品需管理者密碼")
                pid = seg[1]
                db["products"] = [p for p in db["products"] if p["id"] != pid]
                audit(db, user, device_id, "product.delete", pid)
                return {"ok": True}

        # ---- 素材 ----
        if head == "materials":
            if method == "POST" and len(seg) == 1:
                m = body.get("material", {})
                m["id"] = next_id(db["materials"], "M")
                m.setdefault("status", "待剪")
                m.setdefault("needHelp", False)
                db["materials"].append(m)
                audit(db, user, device_id, "material.add", m["id"])
                return {"ok": True, "id": m["id"]}
            if len(seg) >= 2:
                mid = seg[1]
                m = find_by_id(db["materials"], mid)
                if not m:
                    return None
                action = seg[2] if len(seg) > 2 else None
                if action == "claim" and method == "POST":
                    m["claimedBy"] = user
                    m["claimedAt"] = now_iso()
                    m["assignedBy"] = ""
                    m["status"] = "剪輯中"
                    audit(db, user, device_id, "material.claim", mid)
                    return {"ok": True}
                if action == "assign" and method == "POST":
                    m["claimedBy"] = body.get("assignee")
                    m["claimedAt"] = now_iso()
                    m["assignedBy"] = user
                    m["status"] = "剪輯中"
                    audit(db, user, device_id, "material.assign", mid,
                          {"assignee": body.get("assignee")})
                    return {"ok": True}
                if action == "help" and method == "POST":
                    m["needHelp"] = bool(body.get("needHelp", True))
                    m["helpNote"] = body.get("helpNote", "")
                    audit(db, user, device_id, "material.help", mid,
                          {"needHelp": m["needHelp"]})
                    return {"ok": True}
                if action == "finish" and method == "POST":
                    # 完成剪輯 → 進新片庫並鎖定回報
                    v = {
                        "id": next_id(db["videos"], "V"),
                        "name": body.get("name") or m.get("name"),
                        "type": m.get("type"),
                        "status": "新片",
                        "productId": m.get("productId"),
                        "editor": m.get("claimedBy") or user,
                        "ctr": 0, "completionRate": 0, "firstHit": False,
                        "totalUsed": 0, "lastUsedDate": None, "usageHistory": [],
                        "coverChanged": False, "titleChanged": False,
                        "driveFolder": body.get("driveFolder", ""),
                        "voiceCopy": body.get("voiceCopy", ""),
                        "postCopy": body.get("postCopy", ""),
                        "languages": {
                            "zh": {"status": "完成", "title": body.get("name") or m.get("name"),
                                   "editor": m.get("claimedBy") or user},
                            "en": {"status": "未開始", "title": "", "editor": "", "driveFolder": ""},
                            "th": {"status": "未開始", "title": "", "editor": "", "driveFolder": ""},
                        },
                    }
                    db["videos"].append(v)
                    m["status"] = "已完成"
                    m["finishedVideoId"] = v["id"]
                    m["locked"] = True
                    audit(db, user, device_id, "material.finish", mid, {"videoId": v["id"]})
                    return {"ok": True, "videoId": v["id"]}
                if method == "PUT":
                    if m.get("locked") and not is_admin(db, body):
                        raise PermissionError("此回報已鎖定，需管理者才能修改")
                    if not is_admin(db, body):
                        raise PermissionError("修改既有素材需管理者密碼")
                    m.update(body.get("material", {}))
                    m["id"] = mid
                    audit(db, user, device_id, "material.update", mid)
                    return {"ok": True}

        # ---- 影片 ----
        if head == "videos":
            if method == "POST" and len(seg) == 1:
                v = body.get("video", {})
                v["id"] = next_id(db["videos"], "V")
                v.setdefault("usageHistory", [])
                v.setdefault("totalUsed", 0)
                v.setdefault("languages", {
                    "zh": {"status": "完成", "title": v.get("name", ""),
                           "editor": v.get("editor", "")},
                    "en": {"status": "未開始", "title": "", "editor": "", "driveFolder": ""},
                    "th": {"status": "未開始", "title": "", "editor": "", "driveFolder": ""},
                })
                db["videos"].append(v)
                audit(db, user, device_id, "video.add", v["id"])
                return {"ok": True, "id": v["id"]}
            if len(seg) >= 2:
                vid = seg[1]
                v = find_by_id(db["videos"], vid)
                if not v and method != "DELETE":
                    return None
                action = seg[2] if len(seg) > 2 else None
                if action == "performance" and method == "POST":
                    v["ctr"] = body.get("ctr", v.get("ctr", 0))
                    v["completionRate"] = body.get("completionRate", v.get("completionRate", 0))
                    if "firstHit" in body:
                        v["firstHit"] = bool(body["firstHit"])
                    audit(db, user, device_id, "video.performance", vid)
                    return {"ok": True}
                if action == "lang" and method == "PUT":
                    lang = seg[3]
                    v.setdefault("languages", {}).setdefault(lang, {})
                    v["languages"][lang].update(body.get("lang", {}))
                    audit(db, user, device_id, "video.lang", vid, {"lang": lang})
                    return {"ok": True}
                if method == "PUT":
                    if not is_admin(db, body):
                        raise PermissionError("修改既有影片需管理者密碼")
                    v.update(body.get("video", {}))
                    v["id"] = vid
                    audit(db, user, device_id, "video.update", vid)
                    return {"ok": True}
                if method == "DELETE":
                    if not is_admin(db, body):
                        raise PermissionError("刪除影片需管理者密碼")
                    db["videos"] = [x for x in db["videos"] if x["id"] != vid]
                    audit(db, user, device_id, "video.delete", vid)
                    return {"ok": True}

        # ---- 排程 ----
        if head == "schedule" and len(seg) >= 3:
            date_str = seg[1]
            sub = seg[2]
            day = db["schedule"].setdefault(
                date_str,
                {"quotas": dict(db.get("defaultQuotas", {})), "slots": []},
            )
            if sub == "quota" and method == "POST":
                day["quotas"] = body.get("quotas", day["quotas"])
                audit(db, user, device_id, "schedule.quota", date_str)
                return {"ok": True}
            if sub == "slot" and method == "POST":
                slot = body.get("slot", {})
                self._validate_slot(db, date_str, slot)
                day["slots"].append(slot)
                audit(db, user, device_id, "schedule.slot.add", date_str,
                      {"videoId": slot.get("videoId")})
                return {"ok": True}
            if sub == "slot" and method == "DELETE":
                idx = int(seg[3])
                if 0 <= idx < len(day["slots"]):
                    if day["slots"][idx].get("locked") and not is_admin(db, body):
                        raise PermissionError("此排片已上架鎖定，需管理者才能移除")
                    removed = day["slots"].pop(idx)
                    audit(db, user, device_id, "schedule.slot.del", date_str,
                          {"videoId": removed.get("videoId")})
                    return {"ok": True}
                raise ValueError("索引超出範圍")
            if sub == "publish" and method == "POST":
                idx = int(body.get("slotIndex"))
                if not (0 <= idx < len(day["slots"])):
                    raise ValueError("索引超出範圍")
                slot = day["slots"][idx]
                self._publish_slot(db, date_str, idx, slot)
                audit(db, user, device_id, "schedule.publish", date_str,
                      {"account": slot.get("account")})
                return {"ok": True, "account": slot.get("account")}

        return None

    # --- 排片卡控 ---
    def _validate_slot(self, db, date_str, slot):
        s = db.get("settings", {})
        vid = find_by_id(db["videos"], slot.get("videoId"))
        if vid:
            # 規則1：30 天內使用次數上限
            if used_in_window(vid, s.get("reuseWindowDays", 30)) >= s.get("reuseCap", 3):
                raise ValueError("此影片 30 天內已達使用上限（%d 次），不可再排" % s.get("reuseCap", 3))
            # 規則2：舊片重用須換封面+標題
            if vid.get("status") == "舊片" and not (
                vid.get("coverChanged") and vid.get("titleChanged")
            ):
                raise ValueError("舊片重用前必須先勾選『已換封面』與『已換標題』")

    def _publish_slot(self, db, date_str, idx, slot):
        # 產生發片帳號 YYYYMMDD g## 平台
        yyyymmdd = date_str.replace("-", "")
        gnum = "g%02d" % (idx + 1)
        base = "%s%s" % (yyyymmdd, gnum)
        slot["account"] = base
        slot["accounts"] = {p: base + p for p in slot.get(
            "platforms", db.get("platforms", []))}
        slot["publishedLink"] = "?utm_source=ecdr&utm_campaign=%s" % base
        slot["locked"] = True
        slot["publishedAt"] = now_iso()
        # 累加使用次數
        vid = find_by_id(db["videos"], slot.get("videoId"))
        if vid:
            vid["totalUsed"] = vid.get("totalUsed", 0) + 1
            vid.setdefault("usageHistory", []).append(date_str)
            vid["lastUsedDate"] = date_str
            if vid.get("status") == "新片":
                vid["status"] = "舊片"  # 上架後變舊片


def find_user(db, name):
    for u in db.get("users", []):
        if u.get("name") == name:
            return u
    return None


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------
def main():
    ensure_dirs()
    load_db()  # 確保 db.json 存在 / 損毀時還原
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("影片排程系統已啟動： http://localhost:%d" % PORT)
    print("（區網其他電腦請用本機 IP；遠端請搭配 Cloudflare Tunnel，見 README）")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n伺服器已停止。")


if __name__ == "__main__":
    main()
