# -*- coding: utf-8 -*-
"""
貼文銷售（「這個品推過幾次」）的離線測試：python3 tests/postsale.py

測 tools/postsale_sync.py，不碰網路、不碰資料庫。

⚠️ 這一支最重要的一條：**商品比對規則在 Python 與 JS 各有一份，兩邊必須一模一樣。**
   不一樣的話，同步寫進去的東西畫面上查不到，而畫面只會顯示「沒有資料」——
   看起來像「這個品沒推過」，而不是像故障。那是最糟的失敗形狀。
"""

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(ROOT, "tools"))
import postsale_sync as P   # noqa: E402

FAILED = []
RAN = []


def ok(cond, name):
    RAN.append(name)
    if cond:
        print("  ok   " + name)
    else:
        print("FAIL  " + name)
        FAILED.append(name)


def row(title, date="2026-06-15", c=0, a=0, s=0, plat="Instagram"):
    return {"活動標題": title, "建立日期": date, "平台": plat,
            "留言數": str(c), "留言加購": str(a), "銷售額NT$": str(s),
            "貼文連結": "", "Meta post ID": ""}


# ── ① 活動標題 → 商品名 ──────────────────────────────────────────────
ok(P.norm_title("2026/08/12 祖母綠貼文") == "祖母綠貼文", "去掉日期前綴")
ok(P.norm_title("橄欖石黑碧璽｜裸石20250728a1fb") == "橄欖石黑碧璽｜裸石", "去掉流水號尾巴")
ok(P.norm_title("招財之石｜金運石吊墜") == "招財之石｜金運石吊墜", "本來就乾淨的不要亂動")
ok(P.norm_title("") == "" and P.norm_title(None) == "", "空的不會爆")

# ── ② 比對身分：放寬到哪裡為止 ──────────────────────────────────────
# 實測：完全一樣只有 41/105，放寬分隔符號之後 59/105。多救回來的都是同一個商品
# 的不同寫法。
ok(P.prod_key("幸運守護｜四葉草手鍊") == P.prod_key("幸運守護-四葉草手鍊"),
   "**全形直線與減號算同一個**（官網與 Shopline 兩邊寫法不同）")
ok(P.prod_key("風信子石|裸石") == P.prod_key("風信子石裸石"), "半形直線也一樣")
ok(P.prod_key("寵粉系列｜18K天然真鑽戒指") == P.prod_key("寵粉系列｜18k天然真鑽戒指"), "大小寫不算")
ok(P.prod_key("消磁聚寶盆| 瑪瑙晶洞") == P.prod_key("消磁聚寶盆-瑪瑙晶洞"), "空白不算")
ok(P.prod_key("黑金超七（星輝骨幹）") == P.prod_key("黑金超七星輝骨幹"), "括號不算")
# ⚠️ 只放寬到這裡。再往下猜就會把不同的商品合成一個 —— 那比對不到更糟。
ok(P.prod_key("925銀誕生石寶寶吊墜") != P.prod_key("18K金誕生石寶寶吊墜"),
   "**925銀 跟 18K金 是不同商品，不准合併**")
ok(P.prod_key("寵粉彩藍寶有錢花戒指") != P.prod_key("彩藍寶有錢花戒指"),
   "**不准為了對上就砍掉前綴**（那會把兩個不同的活動算成一個）")

# ── ③ 彙總 ──────────────────────────────────────────────────────────
items, data_at = P.aggregate([
    row("幸運守護｜四葉草手鍊", "2026-01-05", c=10, a=1),
    row("幸運守護-四葉草手鍊", "2026-06-15", c=20, a=2),   # 同一個商品的另一種寫法
    row("招財之石｜金運石吊墜", "2026-03-01", c=5),
])
ok(len(items) == 2, "兩種寫法合併成一個商品", )
top = items[0]
ok(top["n"] == 2, "**貼過幾次是加起來的**（重複推同一個品，要看得出推過幾次）")
ok(top["c"] == 30 and top["a"] == 3, "留言與加購也是加起來的")
ok(top["last"] == "2026-06-15" and top["first"] == "2026-01-05", "最近一次與第一次都記得住")
ok(data_at == "2026-06-15", "資料到哪一天＝最新那一筆活動")
ok(items[0]["n"] >= items[1]["n"], "照推過幾次排（這張清單就是要回答這個）")

# 顯示名取最長的那個寫法 —— 短的常常是被截掉的
two = P.aggregate([row("幸運守護｜四葉草手鍊", c=1), row("幸運守護-四葉草", c=1)])[0]
ok(len(two) == 2, "「四葉草手鍊」跟「四葉草」不是同一個（沒有被硬合併）")
long_first = P.aggregate([row("幸運守護-四葉草手鍊"), row("幸運守護｜四葉草手鍊")])[0][0]
ok(long_first["p"] in ("幸運守護-四葉草手鍊", "幸運守護｜四葉草手鍊"), "顯示名是完整的寫法")

# 沒有標題的不要變成一筆空商品
ok(P.aggregate([row(""), row("   ")])[0] == [], "沒有標題的不收")

# 清單有上限（這份東西跟著每個人的登入一起下載）
many = [row("商品%d" % i) for i in range(P.MAX_ITEMS + 50)]
ok(len(P.aggregate(many)[0]) == P.MAX_ITEMS, "清單有上限（它會跟著每個人的登入一起下載）")


# ── ④ 兩份比對規則必須一模一樣 ──────────────────────────────────────
# 這一條是整支測試的重點。Python 寫進去、JS 讀出來，規則差一個字就永遠查不到。
APP = open(os.path.join(ROOT, "app.js"), encoding="utf-8").read()
m = re.search(r"function psKey\(s\)\{(.*?)\n\}", APP, re.S)
ok(bool(m), "app.js 裡有 psKey")
js = m.group(1) if m else ""
py = open(os.path.join(ROOT, "tools", "postsale_sync.py"), encoding="utf-8").read()
pym = re.search(r"def prod_key\(s\):(.*?)\n\ndef ", py, re.S)
ok(bool(pym), "postsale_sync.py 裡有 prod_key")
pys = pym.group(1) if pym else ""


# ⚠️ 不要比對「那一行字串長得一不一樣」—— 跳脫寫法本來就不同，比字串只會得到
#    假的紅燈或假的綠燈。**直接把同一批字餵進兩邊，比結果。**
import json
import subprocess

SAMPLES = [
    "幸運守護｜四葉草手鍊", "幸運守護-四葉草手鍊", "風信子石|裸石", "風信子石裸石",
    "寵粉系列｜18K天然真鑽戒指", "寵粉系列｜18k天然真鑽戒指",
    "消磁聚寶盆| 瑪瑙晶洞", "消磁聚寶盆-瑪瑙晶洞",
    "黑金超七（星輝骨幹）", "黑金超七【星輝骨幹】", "黑金超七「星輝骨幹」",
    "925銀誕生石寶寶吊墜", "18K金誕生石寶寶吊墜",
    "橄欖石黑碧璽｜裸石", "三顆一起收藏 💎 寶石套組限量放漏",
    "愛情的味道｜手鍊｜招桃花首選 加強版 粉色寶石",
    "A/B\\C、D，E。F·G・H—I—J_K", "  前後空白  ", "", "只有中文",
]
js_out = subprocess.run(
    ["node", "-e", """
const fs=require("fs");
const APP=fs.readFileSync(process.argv[1],"utf8");
const m=APP.match(/function psKey\\(s\\)\\{[\\s\\S]*?\\n\\}/);
if(!m){ console.error("找不到 psKey"); process.exit(2); }
eval(m[0]);
const inp=JSON.parse(process.argv[2]);
console.log(JSON.stringify(inp.map(psKey)));
""", os.path.join(ROOT, "app.js"), json.dumps(SAMPLES)],
    capture_output=True, text=True)
ok(js_out.returncode == 0, "app.js 的 psKey 抓得出來也跑得動")
same = None
if js_out.returncode == 0:
    same = json.loads(js_out.stdout)
    mine = [P.prod_key(x) for x in SAMPLES]
    bad = [(a, b, c) for a, b, c in zip(SAMPLES, mine, same) if b != c]
    ok(not bad, "**Python 與 JS 的商品比對規則算出來一模一樣**"
                "（差一個字元，畫面上就永遠查不到那個商品）")
    if bad:
        for a, b, c in bad[:5]:
            print("        %r → py=%r js=%r" % (a, b, c))


# ⚠️ 「畫面有沒有接上去」不准用 "psLine(p)" in APP 來測 —— 那也會match到**函式定義本身**，
#    所以把呼叫整行刪掉照樣綠。（突變測試裡它活了下來，這是我自己寫的假綠燈。）
#    畫面的事就要把畫面畫出來驗：見 tests/smoke-v210.js 的「這個品推過幾次」那一段。

# 排程真的有接上去 —— 寫了工具沒人叫它跑，等於沒寫
META = open(os.path.join(ROOT, "tools", "meta-scheduled.sh"), encoding="utf-8").read()
ok("python3 tools/postsale_sync.py --write" in META,
   "排程會自己去抓貼文銷售（老闆不用做任何事）")
ok(META.index("meta_sync.py") < META.index("postsale_sync.py"),
   "排在成效同步後面 —— 它失敗不該影響上面那一段")
# v213：對到的那一則要回填成 publishedLink（人填的那一格），不然它永遠是空的
_call = next((l for l in META.splitlines() if "python3 tools/meta_sync.py" in l), "")
ok("--fill-links" in _call,
   "**排程有開 --fill-links**（同步對到的貼文自動回填上片連結，不用人補）")

print("\n%d / %d 通過" % (len(RAN) - len(FAILED), len(RAN)))
if FAILED:
    sys.exit(1)
