# -*- coding: utf-8 -*-
"""
Firestore REST 共用工具 —— backup.py 與 restore.py 都用這支。

只用 Python 3 標準函式庫：不需要 npm、不需要 Firebase CLI、
不需要 service account。這跟專案本身「無打包無 npm」的作風一致。

為什麼不用 Admin SDK：那需要一把 service account 私鑰，
放在 Mac mini 上等於多一個要保管的祕密。這裡改用跟網頁前端
完全一樣的匿名登入，權限也完全一樣（受 firestore.rules 控管），
沒有任何額外授權。
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

# ---------------------------------------------------------------------------
# 集合清單
#
# ⚠️ 維護點：Firestore 的 listCollectionIds 只給 admin 憑證用（用戶端會拿到
#    403），所以這份清單只能寫死。新增集合時要記得回來補一行，
#    否則新集合不會被備份。
#
#    check_collections_drift() 會去掃 fb.js／app.js，發現有集合沒列進來就出聲。
# ---------------------------------------------------------------------------
COLLECTIONS = [
    "videos",    # 影片任務主檔
    "logs",      # 操作稽核紀錄
    "users",     # 成員與權限
    "schedule",  # 上片排程（文件 id = 日期）
    "tasks",     # 交辦事項
    "products",  # 商品庫
    "matches",   # 商品配片
    "shifts",    # 出勤打卡
    "meta",      # 系統設定（meta/settings）
    "assetgroups",  # 人工確認的影片素材包（v196）
]

# 程式有用、但**刻意不備份**的集合。一定要寫理由 ——
# 這份清單存在的意義是「不備份是個決定，不是漏掉的」。
# audit-collections.js 會讀這裡，所以漏列還是會被抓出來，只是抓成「你要不要
# 給個理由」而不是「你忘了」。
NO_BACKUP = {
    # Google Drive 匯出的 CSV 重建出來的整份唯讀快照（4.8 MB／9 份大文件）。
    # 備份它等於每天複製一份一模一樣的東西，而真正的來源是 Drive 本身 ——
    # 重跑一次匯入就整份回來。人工確認的結果在 assetgroups，那個沒有來源可以
    # 重建，所以那個一定要備份。
    "driveindex": "Drive CSV 重建得回來，來源是 Google Drive 本身",
}

TIMEOUT = 90
RETRIES = 4


class FsError(Exception):
    pass


def repo_root():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_config():
    """從 firebase-config.js 讀設定，不寫死在程式裡（換專案時不用改這裡）。"""
    path = os.path.join(repo_root(), "firebase-config.js")
    if not os.path.isfile(path):
        raise FsError("找不到 firebase-config.js（預期在 %s）" % path)
    src = open(path, encoding="utf-8").read()

    def pick(key):
        m = re.search(r'%s\s*:\s*["\']([^"\']+)["\']' % key, src)
        return m.group(1) if m else ""

    cfg = {k: pick(k) for k in ("apiKey", "projectId", "storageBucket")}
    if not cfg["apiKey"] or not cfg["projectId"]:
        raise FsError("firebase-config.js 裡讀不到 apiKey 或 projectId")
    return cfg


def check_collections_drift():
    """
    掃 fb.js／app.js 找出程式有用、但 COLLECTIONS 沒列到的集合名稱。
    回傳漏掉的清單（正常情況是空的）。
    這是唯一能自動察覺「新增了集合卻忘了加進備份」的機制。
    """
    found = set()
    for name in ("fb.js", "app.js"):
        p = os.path.join(repo_root(), name)
        if not os.path.isfile(p):
            continue
        src = open(p, encoding="utf-8").read()
        for pat in (r'collection\(\s*db\s*,\s*["\']([a-zA-Z]+)["\']',
                    r'doc\(\s*db\s*,\s*["\']([a-zA-Z]+)["\']',
                    r'DB\.(?:set|update|del)\(\s*["\']([a-zA-Z]+)["\']'):
            found.update(re.findall(pat, src))
    # 這些是 fb.js 裡的區域變數或函式名誤判，不是集合
    found -= {"update", "del", "set"}
    # NO_BACKUP 的是「決定不備份」，不是「忘了加」，所以不用出聲（理由寫在上面）
    return sorted(found - set(COLLECTIONS) - set(NO_BACKUP))


def _post(url, body, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, json.dumps(body).encode("utf-8"), headers)
    return _open(req)


def _patch(url, body, token):
    """
    PATCH 一份文件。搭配網址上的 updateMask.fieldPaths 只改指定欄位，
    其他欄位一個都不碰 —— meta/settings 裝的是整個系統的設定，
    整份覆寫會把使用者的設定洗掉。
    """
    headers = {"Content-Type": "application/json",
               "Authorization": "Bearer " + token}
    req = urllib.request.Request(url, json.dumps(body).encode("utf-8"),
                                 headers, method="PATCH")
    return _open(req)


def _get(url, token):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    return _open(req)


def _open(req):
    """帶重試的請求：網路不穩時不要整包備份失敗。"""
    last = None
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            detail = e.read()[:300].decode("utf-8", "replace")
            # 4xx 是我們自己的問題（權限、路徑錯），重試沒有意義
            if 400 <= e.code < 500 and e.code != 429:
                raise FsError("HTTP %s：%s" % (e.code, detail))
            last = FsError("HTTP %s：%s" % (e.code, detail))
        except Exception as e:                      # 連線中斷、逾時
            last = FsError(str(e))
        time.sleep(2 ** attempt)
    raise last


def emulator_host():
    """
    設了 FIRESTORE_EMULATOR_HOST（例如 127.0.0.1:8080）就改打模擬器。

    這是災難演練的關鍵：還原腳本會真的寫入資料庫，拿正式環境演練
    風險太高，但**沒演練過的還原腳本等於沒有還原能力**。
    有了這個開關就能對模擬器完整跑一次，確認救得回來。
    """
    return os.environ.get("FIRESTORE_EMULATOR_HOST", "").strip()


def sign_in(cfg):
    """
    匿名登入，取得 idToken。做的事跟使用者開網頁時完全一樣。

    注意：每跑一次會在 Firebase Authentication 多一個匿名帳號。
    這跟每台裝置開網頁各產生一個是同一回事，不影響權限，
    但長期會累積；Firebase 主控台可批次清除。
    """
    if emulator_host():
        return "owner"          # 模擬器認這個字串為管理員，不需要真的登入
    url = ("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=%s"
           % cfg["apiKey"])
    data = _post(url, {"returnSecureToken": True})
    if "idToken" not in data:
        raise FsError("匿名登入失敗，請確認 Firebase 的『匿名登入』仍是啟用狀態")
    return data["idToken"]


def api_root(cfg):
    host = emulator_host()
    if host:
        return "http://%s/v1/projects/%s/databases/(default)" % (host, cfg["projectId"])
    return ("https://firestore.googleapis.com/v1/projects/%s/databases/(default)"
            % cfg["projectId"])


def docs_base(cfg):
    """可直接請求的完整網址（含主機）——讀取用。"""
    return api_root(cfg) + "/documents"


def doc_path(cfg):
    """
    資源路徑，不含主機。

    ⚠️ 寫入時 name 欄位只吃這種格式：
           projects/<專案>/databases/(default)/documents/videos/V001
       給完整 http 網址會被拒（lacks "projects" at index 0）。
       讀取用 docs_base()，寫入用 doc_path()，兩者不能混用。
    """
    return "projects/%s/databases/(default)/documents" % cfg["projectId"]


def fetch_collection(cfg, token, name, page_size=300, progress=None):
    """
    讀出一個集合的全部文件，保留 Firestore REST 的原始型別格式。

    ⚠️ 刻意不轉成「好看的」JSON：REST 的 {"integerValue": "3"} 這種寫法
    帶著型別資訊，轉掉之後還原時分不出整數與浮點數、字串與時間戳，
    會把資料寫壞。人要看的版本另外輸出（見 backup.py 的 readable/）。
    """
    out = []
    page_token = None
    while True:
        url = "%s/%s?pageSize=%d" % (docs_base(cfg), name, page_size)
        if page_token:
            url += "&pageToken=" + page_token
        data = _get(url, token)
        out.extend(data.get("documents", []))
        if progress:
            progress(len(out))
        page_token = data.get("nextPageToken")
        if not page_token:
            return out


def taipei_now():
    """台灣時間（UTC+8）的 ISO 字串，格式與前端 app.js 的 nowIso() 一致。"""
    import datetime
    t = datetime.datetime.utcnow() + datetime.timedelta(hours=8)
    return t.isoformat(timespec="seconds")


def report_backup_status(cfg, token, status):
    """
    把備份結果回報到 meta/settings 的 backupStatus 欄位。

    為什麼寫在 meta/settings 裡而不是另開一份文件：前端只訂閱了
    meta/settings 這一份（見 fb.js），寫在這裡系統就自動收得到，
    不必動同步層。

    ⚠️ 一定要用 updateMask 只寫 backupStatus 這一個欄位。
       meta/settings 裝的是整個系統的設定，整份覆寫會把設定洗掉。
    """
    url = ("%s/meta/settings?updateMask.fieldPaths=backupStatus"
           % docs_base(cfg))
    fields = {}
    for k, v in status.items():
        if isinstance(v, bool):
            fields[k] = {"booleanValue": v}
        elif isinstance(v, int):
            fields[k] = {"integerValue": str(v)}
        else:
            fields[k] = {"stringValue": str(v)}
    _patch(url, {"fields": {"backupStatus": {"mapValue": {"fields": fields}}}},
           token)


def doc_id(doc):
    """從 REST 的 name（完整路徑）取出文件 id。"""
    return doc.get("name", "").rsplit("/", 1)[-1]


# --- 型別轉換：只給人看，不用於還原 ----------------------------------------
def to_plain(value):
    """把 Firestore REST 的型別包裝拆掉，變成一般 JSON。會遺失型別資訊。"""
    if not isinstance(value, dict):
        return value
    if "nullValue" in value:
        return None
    for k in ("stringValue", "booleanValue", "timestampValue",
              "bytesValue", "referenceValue", "geoPointValue"):
        if k in value:
            return value[k]
    if "integerValue" in value:
        try:
            return int(value["integerValue"])
        except (TypeError, ValueError):
            return value["integerValue"]
    if "doubleValue" in value:
        return value["doubleValue"]
    if "arrayValue" in value:
        return [to_plain(v) for v in value["arrayValue"].get("values", [])]
    if "mapValue" in value:
        return {k: to_plain(v)
                for k, v in value["mapValue"].get("fields", {}).items()}
    return value


def doc_to_plain(doc):
    d = {k: to_plain(v) for k, v in doc.get("fields", {}).items()}
    d["_id"] = doc_id(doc)
    return d


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return "%.1f %s" % (n, unit) if unit != "B" else "%d B" % n
        n /= 1024.0


def eprint(*a):
    print(*a, file=sys.stderr)
