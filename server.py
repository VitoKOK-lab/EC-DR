#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IP 短影音排程 × KPI 追蹤系統 — 後端伺服器
純 Python 標準函式庫，無第三方依賴。
啟動：  python3 server.py          （預設埠 3000）
        PORT=8080 python3 server.py
資料：  data/db.json （伺服器當權威，前端不能直接改檔）
備份：  data/backups/（滾動備份）、data/backups/daily/（每日快照）

設計重點：
- 兩大類影片：流量型 / 帶貨型（下可再分子標籤）。
- 片源：老闆自拍 / 外部公司。中文母版完成後可追多語二創（英/泰/馬）。
- KPI：每日應上片 dailyPublishTarget（預設 4）；每位剪輯每日應完成 editorDailyQuota（預設 3）。
- 角色：老闆 boss / 人資 hr / 剪輯 editor。
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

ROLES = ("boss", "hr", "editor")  # 老闆 / 人資 / 剪輯


# ---------------------------------------------------------------------------
# 預設資料（首次啟動的乾淨種子；不含任何範例影片/商品/排程）
# ---------------------------------------------------------------------------
def default_db():
    return {
        "users": [],            # 登入頁新增成員時必填 role（boss/hr/editor）
        "products": [],         # 帶貨商品庫（Shopline）
        "videos": [],           # 影片任務（原片 → 成品 → 上片）
        "schedule": {},         # 依日期；slots 參照 videoId
        "platforms": ["ig", "fb", "youtube", "tk", "wapp", "line", "threads"],
        "devices": [],
        "auditLog": [],
        "settings": {
            "adminPassword": "1234",
            "mainTypes": ["流量型", "帶貨型"],
            "subTags": {
                "流量型": ["名人話題", "珠寶知識", "家庭", "理財"],
                "帶貨型": ["新品", "促銷", "開箱"],
            },
            "sources": ["老闆自拍", "外部公司"],
            "languages": ["zh", "en", "th", "ms"],   # 中 / 英 / 泰 / 馬
            "dailyPublishTarget": 4,                 # 每日應上片數
            "editorDailyQuota": 3,                   # 每位剪輯每日應完成片數
            "scheduleHorizonDays": 30,               # 應提前排滿的天數（預排一個月）
            "kpiStartDate": today_str(),             # 超前/落後累計的計算基準日
            "reuseCap": 3,
            "reuseWindowDays": 30,
            "materialLowThreshold": 5,
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
    """依現有項目產生下一個遞增 ID，如 P001 / V034。"""
    mx = 0
    for it in items:
        m = re.match(r"^%s(\d+)$" % re.escape(prefix), str(it.get("id", "")))
        if m:
            mx = max(mx, int(m.group(1)))
    return "%s%03d" % (prefix, mx + 1)


def parse_date(s):
    try:
        return datetime.date.fromisoformat(str(s)[:10])
    except Exception:
        return None


def workdays_between(start, end):
    """含 start、含 end 的工作日數（週一~週五）。end < start 回傳 0。"""
    if not start or not end or end < start:
        return 0
    days = 0
    cur = start
    while cur <= end:
        if cur.weekday() < 5:  # 0=週一 ... 4=週五
            days += 1
        cur += datetime.timedelta(days=1)
    return days


def new_video_record(db, **over):
    """建立一筆乾淨的影片任務，套用預設語言結構。"""
    langs = db.get("settings", {}).get("languages", ["zh"])
    languages = {}
    for lg in langs:
        if lg == "zh":
            languages[lg] = {"status": "完成", "editor": ""}
        else:
            languages[lg] = {"status": "未開始", "editor": "", "driveFolder": ""}
    rec = {
        "id": next_id(db["videos"], "V"),
        "scheduledDate": None,
        "rawName": "",
        "name": "",
        "mainType": (db.get("settings", {}).get("mainTypes") or ["流量型"])[0],
        "subTag": "",
        "source": (db.get("settings", {}).get("sources") or [""])[0],
        "productId": None,
        "editor": "",
        "stage": "待處理",          # 待處理 / 剪輯中 / 已完成 / 已上片
        "claimedBy": "", "claimedAt": "", "assignedBy": "",
        "needHelp": False, "helpNote": "",
        "scriptStatus": "未開始",   # 未開始 / 撰寫中 / 完成
        "languages": languages,
        "finishedAt": "",
        "usageHistory": [], "totalUsed": 0,
        "ctr": 0, "completionRate": 0,
        "driveFolder": "", "voiceCopy": "", "postCopy": "",
        "locked": False,
    }
    rec.update(over)
    return rec


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


def find_by_id(items, _id):
    for it in items:
        if it.get("id") == _id:
            return it
    return None


def find_user(db, name):
    for u in db.get("users", []):
        if u.get("name") == name:
            return u
    return None


def editor_names(db):
    return [u["name"] for u in db.get("users", []) if u.get("role", "editor") == "editor"]


# ---------------------------------------------------------------------------
# 衍生計算：重用次數、排程達標、預警、工作量、儀表板
# ---------------------------------------------------------------------------
def used_in_window(video, window_days):
    cutoff = datetime.date.today() - datetime.timedelta(days=window_days)
    cnt = 0
    for d in video.get("usageHistory", []):
        dd = parse_date(d)
        if dd and dd >= cutoff:
            cnt += 1
    return cnt


def day_scheduled_count(db, date_str):
    day = db.get("schedule", {}).get(date_str)
    if not day:
        return 0
    return len(day.get("slots", []))


def day_is_complete(db, date_str):
    target = int(db.get("settings", {}).get("dailyPublishTarget", 4))
    return day_scheduled_count(db, date_str) >= target


def compute_warnings(db):
    """未來 scheduleHorizonDays 天內，哪幾天尚未排滿（達 dailyPublishTarget）。
    ≤3 天=緊急；其餘=警告。"""
    today = datetime.date.today()
    horizon = int(db.get("settings", {}).get("scheduleHorizonDays", 30))
    emergency, warning = [], []
    for offset in range(0, horizon + 1):
        d = today + datetime.timedelta(days=offset)
        ds = d.isoformat()
        if day_is_complete(db, ds):
            continue
        if offset <= 3:
            emergency.append(ds)
        else:
            warning.append(ds)
    return {"emergency": emergency, "warning": warning, "horizon": horizon}


def _finished_on(v, date_str):
    return (v.get("stage") in ("已完成", "已上片")) and (str(v.get("finishedAt", ""))[:10] == date_str)


def _finished_in_range(v, start, end):
    """v 的 finishedAt 是否落在 [start, end]（date 物件）。"""
    if v.get("stage") not in ("已完成", "已上片"):
        return False
    fd = parse_date(v.get("finishedAt", ""))
    return bool(fd and start <= fd <= end)


def compute_workload(db, date_str):
    """人資視角：每位剪輯的完成量 vs KPI、本週/本月累計、超前/落後。"""
    s = db.get("settings", {})
    quota = int(s.get("editorDailyQuota", 3))
    today = parse_date(date_str) or datetime.date.today()
    week_start = today - datetime.timedelta(days=today.weekday())  # 本週一
    month_start = today.replace(day=1)
    kpi_start = parse_date(s.get("kpiStartDate")) or month_start

    rows = []
    for name in editor_names(db):
        mine = [v for v in db.get("videos", []) if (v.get("editor") == name or v.get("claimedBy") == name)]
        today_done = sum(1 for v in mine if _finished_on(v, date_str))
        week_done = sum(1 for v in mine if _finished_in_range(v, week_start, today))
        month_done = sum(1 for v in mine if _finished_in_range(v, month_start, today))
        total_done = sum(1 for v in mine if _finished_in_range(v, kpi_start, today))
        # 應完成累計＝自基準日起的工作日數 × 每日配額
        expected = workdays_between(kpi_start, today) * quota
        diff = total_done - expected      # 正=超前、負=落後
        inprogress = sum(1 for v in mine if v.get("stage") == "剪輯中")
        rows.append({
            "name": name,
            "todayDone": today_done,
            "todayQuota": quota,
            "todayMet": today_done >= quota,
            "weekDone": week_done,
            "monthDone": month_done,
            "totalDone": total_done,
            "expected": expected,
            "diff": diff,
            "status": "超前" if diff > 0 else ("落後" if diff < 0 else "達標"),
            "inProgress": inprogress,
        })
    rows.sort(key=lambda r: r["diff"], reverse=True)
    return {
        "date": date_str, "quota": quota,
        "weekStart": week_start.isoformat(), "monthStart": month_start.isoformat(),
        "kpiStart": kpi_start.isoformat(), "rows": rows,
    }


def compute_dashboard(db, date_str):
    """老闆視角：未來一個月排程達標、今日上片 vs 目標、需支援、各剪輯完成數。"""
    warnings = compute_warnings(db)
    s = db.get("settings", {})
    target = int(s.get("dailyPublishTarget", 4))
    horizon = int(s.get("scheduleHorizonDays", 30))
    today = datetime.date.today()

    # 未來 horizon 天排滿率
    full_days = 0
    for offset in range(0, horizon):
        ds = (today + datetime.timedelta(days=offset)).isoformat()
        if day_is_complete(db, ds):
            full_days += 1
    fill_rate = round(full_days * 100.0 / horizon) if horizon else 0

    today_pub = sum(1 for v in db.get("videos", []) if v.get("stage") == "已上片"
                    and str(v.get("scheduledDate", ""))[:10] == date_str)
    today_scheduled = day_scheduled_count(db, date_str)

    help_list = [
        {"videoId": v["id"], "name": v.get("name") or v.get("rawName"),
         "by": v.get("claimedBy") or v.get("editor"), "note": v.get("helpNote", "")}
        for v in db.get("videos", []) if v.get("needHelp")
    ]

    # 各剪輯今日完成數
    wl = compute_workload(db, date_str)
    lagging = sum(1 for r in wl["rows"] if r["diff"] < 0)

    langs = [lg for lg in s.get("languages", []) if lg != "zh"]
    deriv_todo = sum(
        1 for v in db.get("videos", [])
        for lg in langs
        if v.get("languages", {}).get(lg, {}).get("status") in ("未開始", "二創中")
        and v.get("languages", {}).get("zh", {}).get("status") == "完成"
    )

    progress = {
        "排滿率": fill_rate,
        "排滿天數": full_days,
        "視窗天數": horizon,
        "今日已排": today_scheduled,
        "今日已上片": today_pub,
        "每日目標": target,
        "待處理任務": sum(1 for v in db.get("videos", []) if v.get("stage") == "待處理"),
        "剪輯中": sum(1 for v in db.get("videos", []) if v.get("stage") == "剪輯中"),
        "落後人數": lagging,
        "二創待辦": deriv_todo,
        "本週緊急": warnings["emergency"],
        "本週警告": warnings["warning"],
    }
    return {"date": date_str, "progress": progress, "helpList": help_list,
            "workload": wl}


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
    server_version = "ECDR/2.0"

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
            if path == "/api/workload":
                date_str = (qs.get("date", [today_str()])[0])
                return self._send_json(compute_workload(db, date_str))
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
        # parts 例：["api","videos","V001","claim"]
        seg = parts[1:] if len(parts) > 1 else []
        if not seg:
            return None
        head = seg[0]

        # ---- 設定 ----
        if head == "settings" and method == "PUT":
            if not is_admin(db, body):
                raise PermissionError("管理者密碼錯誤")
            incoming = body.get("settings", {})
            if incoming.get("adminPassword") == "***":
                incoming.pop("adminPassword", None)
            db["settings"].update(incoming)
            # platforms 存頂層
            if "platforms" in incoming:
                db["platforms"] = incoming.pop("platforms")
            audit(db, user, device_id, "settings.update", detail=list(incoming.keys()))
            return {"ok": True, "settings": {**db["settings"], "adminPassword": "***"}}

        # ---- 使用者 ----
        if head == "users":
            if method == "POST":
                name = (body.get("name") or "").strip()
                role = (body.get("role") or "editor").strip()
                if not name:
                    raise ValueError("請輸入名稱")
                if role not in ROLES:
                    raise ValueError("角色不正確（boss/hr/editor）")
                if any(u["name"] == name for u in db["users"]):
                    raise ValueError("名稱已存在")
                db["users"].append({"name": name, "role": role, "isDefault": False})
                audit(db, user, device_id, "user.add", name, {"role": role})
                return {"ok": True, "users": db["users"]}
            if method == "PUT":
                if not is_admin(db, body):
                    raise PermissionError("修改成員需管理者密碼")
                name = seg[1] if len(seg) > 1 else body.get("name")
                target = find_user(db, name)
                if not target:
                    return None
                if body.get("role") in ROLES:
                    target["role"] = body["role"]
                audit(db, user, device_id, "user.update", name, {"role": target.get("role")})
                return {"ok": True, "users": db["users"]}
            if method == "DELETE":
                if not is_admin(db, body):
                    raise PermissionError("刪除使用者需管理者密碼")
                name = seg[1] if len(seg) > 1 else body.get("name")
                target = find_user(db, name)
                if not target:
                    return None
                db["users"] = [u for u in db["users"] if u["name"] != name]
                audit(db, user, device_id, "user.delete", name)
                return {"ok": True, "users": db["users"]}

        # ---- 帶貨商品庫 ----
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

        # ---- 影片任務 ----
        if head == "videos":
            if method == "POST" and len(seg) == 1:
                incoming = body.get("video", {})
                v = new_video_record(db, **{k: incoming[k] for k in incoming if k != "id"})
                # 中文母版剪輯人員預設帶入
                if v.get("editor"):
                    v["languages"].setdefault("zh", {})["editor"] = v["editor"]
                db["videos"].append(v)
                audit(db, user, device_id, "video.add", v["id"])
                return {"ok": True, "id": v["id"]}
            if len(seg) >= 2:
                vid = seg[1]
                v = find_by_id(db["videos"], vid)
                if not v and method != "DELETE":
                    return None
                action = seg[2] if len(seg) > 2 else None

                if action == "claim" and method == "POST":
                    v["claimedBy"] = user
                    v["claimedAt"] = now_iso()
                    v["assignedBy"] = ""
                    if not v.get("editor"):
                        v["editor"] = user
                    v["stage"] = "剪輯中"
                    audit(db, user, device_id, "video.claim", vid)
                    return {"ok": True}
                if action == "assign" and method == "POST":
                    assignee = body.get("assignee")
                    v["claimedBy"] = assignee
                    v["editor"] = assignee
                    v["claimedAt"] = now_iso()
                    v["assignedBy"] = user
                    v["stage"] = "剪輯中"
                    audit(db, user, device_id, "video.assign", vid, {"assignee": assignee})
                    return {"ok": True}
                if action == "help" and method == "POST":
                    v["needHelp"] = bool(body.get("needHelp", True))
                    v["helpNote"] = body.get("helpNote", "")
                    audit(db, user, device_id, "video.help", vid, {"needHelp": v["needHelp"]})
                    return {"ok": True}
                if action == "finish" and method == "POST":
                    v["stage"] = "已完成"
                    v["finishedAt"] = now_iso()
                    v["needHelp"] = False
                    if not v.get("editor"):
                        v["editor"] = v.get("claimedBy") or user
                    v.setdefault("languages", {}).setdefault("zh", {})
                    v["languages"]["zh"]["status"] = "完成"
                    v["languages"]["zh"]["editor"] = v.get("editor") or user
                    if body.get("driveFolder"):
                        v["driveFolder"] = body["driveFolder"]
                    if body.get("name"):
                        v["name"] = body["name"]
                    v["locked"] = True
                    audit(db, user, device_id, "video.finish", vid)
                    return {"ok": True}
                if action == "performance" and method == "POST":
                    v["ctr"] = body.get("ctr", v.get("ctr", 0))
                    v["completionRate"] = body.get("completionRate", v.get("completionRate", 0))
                    audit(db, user, device_id, "video.performance", vid)
                    return {"ok": True}
                if action == "lang" and method == "PUT":
                    lang = seg[3]
                    v.setdefault("languages", {}).setdefault(lang, {})
                    v["languages"][lang].update(body.get("lang", {}))
                    audit(db, user, device_id, "video.lang", vid, {"lang": lang})
                    return {"ok": True}
                if method == "PUT":
                    if v.get("locked") and not is_admin(db, body):
                        raise PermissionError("此影片已鎖定，需管理者才能修改")
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
            day = db["schedule"].setdefault(date_str, {"slots": []})
            if sub == "slot" and method == "POST":
                slot = body.get("slot", {})
                self._validate_slot(db, date_str, slot)
                day["slots"].append(slot)
                # 影片掛上排程日期
                v = find_by_id(db["videos"], slot.get("videoId"))
                if v:
                    v["scheduledDate"] = date_str
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
            # 30 天內使用次數上限（避免疲乏）
            if used_in_window(vid, s.get("reuseWindowDays", 30)) >= s.get("reuseCap", 3):
                raise ValueError("此影片 30 天內已達使用上限（%d 次），不可再排" % s.get("reuseCap", 3))

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
        # 累加使用次數、標記已上片
        vid = find_by_id(db["videos"], slot.get("videoId"))
        if vid:
            vid["totalUsed"] = vid.get("totalUsed", 0) + 1
            vid.setdefault("usageHistory", []).append(date_str)
            vid["stage"] = "已上片"
            vid["scheduledDate"] = date_str


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------
def main():
    ensure_dirs()
    load_db()  # 確保 db.json 存在 / 損毀時還原
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("IP 短影音排程系統已啟動： http://localhost:%d" % PORT)
    print("（區網其他電腦請用本機 IP；遠端請搭配 Cloudflare Tunnel，見 README）")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n伺服器已停止。")


if __name__ == "__main__":
    main()
