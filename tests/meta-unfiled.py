# -*- coding: utf-8 -*-
"""
「未建檔」那張清單的離線測試：python3 tests/meta-unfiled.py（run-all.js 會一起跑）

測的是 tools/meta_sync.py 的 unfiled_groups / unfiled_rank，不碰網路、不碰資料庫。

⚠️ 這張清單存在的意義是「平台上很紅、但系統裡沒有這支片」。
   老闆 2026-09-14：「我們要的是他的成效好就可以上去，反正我們會手動建新檔。」
   所以這裡每一條都盯著同一件事：**成效好的片不准被擋在清單外面。**

   v211 之前的順序是「照留言排 → 砍成 200 筆 → 才去問觀看數」。
   正式資料上那 200 筆的最低留言數是 87 —— 也就是說留言 87 以下的片，
   不管有多紅，一律看不到。這幾條測的就是那個順序不准再顛倒回去。
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import meta_sync as S   # noqa: E402

FAILED = []
RAN = []


def ok(cond, name):
    RAN.append(name)
    if cond:
        print("  ok   " + name)
    else:
        print("FAIL  " + name)
        FAILED.append(name)


def post(cap, views=0, comments=0, at="2026-05-01T10:00:00", pid=None, plat="FB"):
    post.seq = getattr(post, "seq", 0) + 1
    return {"platform": plat, "account": "A", "id": pid or ("P%d" % post.seq),
            "caption": cap, "at": at, "permalink": "https://x/%d" % post.seq,
            "views": views, "comments": comments, "likes": 0, "shares": 0}


def un(p):
    return {"post": p, "candidates": None}


LONG = "這是一段夠長的文案，長到足以參加比對與分組"


# ── ① 排名次：照成效，不是照留言 ──────────────────────────────────────
# 老闆那句話的整條規則就是這一段。
紅 = {"cap": "很紅但沒人留言", "views": 900000, "comments": 80, "n": 1}
吵 = {"cap": "留言很多但沒人看", "views": 3000, "comments": 4589, "n": 1}
r = S.unfiled_rank([吵, 紅])
ok(r[0] is 紅,
   "**90 萬觀看排在 4,589 則留言前面**（老闆：成效好就可以上去）")

# 沒問到觀看數的不能插隊到有數字的前面 —— 但也不能整個消失
未問 = {"cap": "這一組預算用完沒問到", "views": 0, "comments": 9999, "n": 1}
r = S.unfiled_rank([未問, 紅, 吵])
ok(r[0] is 紅 and r[1] is 吵 and r[2] is 未問,
   "沒問到觀看數的排在有數字的後面（不知道成效 ≠ 成效差，但不能插隊）")
ok(未問 in r, "而且不會被丟掉 —— 畫面上顯示「—」，人還是看得到這一列")

# 觀看一樣的時候才輪到留言
a = {"cap": "a", "views": 5000, "comments": 10, "n": 1}
b = {"cap": "b", "views": 5000, "comments": 99, "n": 1}
ok(S.unfiled_rank([a, b])[0] is b, "觀看一樣才比留言")

# 截斷發生在排名次之後
many = [{"cap": str(i), "views": i, "comments": 1, "n": 1} for i in range(1, S.UNFILED_MAX + 50)]
r = S.unfiled_rank(many)
ok(len(r) == S.UNFILED_MAX, "清單有上限（人一次看不完）")
ok(r[0]["views"] == S.UNFILED_MAX + 49, "**留下來的是觀看最高的那幾筆**，不是最先進來的")


# ── ② 候選：先撈得夠寬，才有東西可以問 ────────────────────────────────
ok(S.UNFILED_CAND > S.UNFILED_MAX,
   "**候選要比清單寬**（先問一批、再挑；候選跟清單一樣寬就等於沒有挑）")

rows = [un(post(LONG + str(i), comments=i)) for i in range(1, 40)]
g = S.unfiled_groups(rows)
ok(all(x["comments"] >= S.UNFILED_MIN_COMMENTS for x in g),
   "留言太少的不進候選（留言是免費的，拿來決定先問誰）")
ok(g[0]["comments"] == 39, "候選照留言排 —— 留言多的先問（此時還沒有觀看數可以排）")


# ── ③ 文案太短的片不准整組消失 ────────────────────────────────────────
# v211 之前這裡直接 continue：一支「文案五個字、五十萬觀看」的 Reel
# 在清單上**完全不存在** —— 不是排在後面，是看不到。
短 = S.unfiled_groups([un(post("好美", comments=300, pid="S1"))])
ok(len(短) == 1, "**文案很短但很多人留言的片留得住**（Reel 常常只有幾個字）")
ok(短[0]["cap"] == "好美", "而且文案原樣留著，人看得出是哪一則")

# 但短文案不准互相黏成一組 —— 沒有文案可以當 key，黏起來就是把不同的片算成同一支
兩則短 = S.unfiled_groups([un(post("好美", comments=300, pid="S1")),
                           un(post("好看", comments=200, pid="S2"))])
ok(len(兩則短) == 2, "兩則不同的短文案是兩支片，不准黏成一組")

# 長文案照樣要分組（同一支片重發七八次，不分組人挑不下去）
同一支 = S.unfiled_groups([un(post(LONG, comments=100)) for _ in range(6)])
ok(len(同一支) == 1 and 同一支[0]["n"] == 6,
   "同一支片重發 6 次還是一組（不然一支片在清單上出現六次）")


# ── ④ 分不出是哪一支的，不算「沒建檔」 ───────────────────────────────
amb = [{"post": post(LONG, comments=500), "candidates": ["V1", "V2"]}]
ok(S.unfiled_groups(amb) == [],
   "「有好幾支長得一樣、分不出是哪一支」不進這張清單（那是比對問題，不是沒建檔）")


# ── ⑤ 問觀看數的預算 ────────────────────────────────────────────────
ok(S.UNFILED_ASK_DEFAULT >= S.UNFILED_MAX,
   "問觀看的預算至少要蓋得住整張清單，不然清單上一堆「—」")

print("\n%d / %d 通過" % (len(RAN) - len(FAILED), len(RAN)))
if FAILED:
    sys.exit(1)
