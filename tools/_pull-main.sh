#!/bin/bash
# =============================================================================
# 排程跑之前，先把這台機器的程式更新到 main。
#
# 用法（用 source，不是執行）：
#     . "$REPO/tools/_pull-main.sh"
#     echo "$CODE_STATE $CODE_NOTE"
#
# 為什麼要有這一支
# ---------------
# 2026-09-13 與 2026-09-14 連續兩次：老闆在 Mac mini 上打 `git pull` 失敗
# （divergent branches —— 那台機器停在我會 force-push 的 claude/* 分支上），
# 但他是用 `git pull` 換行接著同步指令，所以**同步照跑，跑的是舊程式**，
# 而畫面上完全看不出來。第二次他才發現：「又來了，你又要我無限一直測了是嗎」。
#
# 他是對的。這台機器不該由人手動 git：
#   **合併進 main 就是老闆的批准**（這個專案裡「合併」＝「部署」），
#   機器自己去拿就好。人要做的事只有一件：在網頁上按合併。
#
# 三條不准破的規矩
# ---------------
#   ① 本機有沒存的改動 → **一個字都不准動**。寧可跑舊程式，也不能吃掉他的東西。
#   ② 拿不到網路 → 照樣跑（舊程式總比不跑好），但要講。
#   ③ 不管結果是什麼，都要**回報得出來** —— 「默默跑了舊程式」正是這支要消滅的
#      失敗形狀：它不像故障，像正常。
#
# 設好這兩個變數給呼叫的人用：
#   CODE_STATE  updated｜current｜dirty｜offline｜diverged｜nogit
#   CODE_NOTE   一句中文，直接可以寫進紀錄或畫面
# =============================================================================

CODE_STATE="nogit"
CODE_NOTE="這個資料夾不是 git 工作區，沒辦法自己更新"

_pm_repo="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

if [ -d "$_pm_repo/.git" ] && command -v git >/dev/null 2>&1; then
    _pm_git() { git -C "$_pm_repo" "$@"; }

    # ① 本機有沒存的改動就完全不碰（未追蹤的檔案不算 —— 那不會被 git 動到）
    if [ -n "$(_pm_git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
        CODE_STATE="dirty"
        CODE_NOTE="這台機器上有還沒存的改動，所以沒有更新程式（跑的是舊的）"
    elif ! _pm_git fetch --quiet origin main 2>/dev/null; then
        # ② 拿不到就照舊跑
        CODE_STATE="offline"
        CODE_NOTE="連不上 GitHub，沒有更新程式（跑的是這台機器上現有的）"
    else
        _pm_before="$(_pm_git rev-parse HEAD 2>/dev/null)"
        _pm_target="$(_pm_git rev-parse origin/main 2>/dev/null)"
        _pm_branch="$(_pm_git rev-parse --abbrev-ref HEAD 2>/dev/null)"

        if [ "$_pm_before" = "$_pm_target" ]; then
            CODE_STATE="current"
            CODE_NOTE="程式已經是最新的"
        else
            # 停在別的分支（老闆那台就是停在 claude/*）→ 換回 main。
            # ⚠️ 用 checkout -B 指到 origin/main，不要 `git pull`：
            #    被 force-push 過的分支 pull 一定會是 divergent，那正是踩過兩次的坑。
            if [ "$_pm_branch" != "main" ]; then
                _pm_git checkout -B main "$_pm_target" --quiet 2>/dev/null
            else
                _pm_git merge --ff-only "$_pm_target" --quiet 2>/dev/null
            fi
            _pm_after="$(_pm_git rev-parse HEAD 2>/dev/null)"
            if [ "$_pm_after" = "$_pm_target" ]; then
                CODE_STATE="updated"
                CODE_NOTE="程式已更新到最新的 main（$(_pm_git log -1 --format=%s 2>/dev/null | cut -c1-40)）"
            else
                # main 上的歷史對不起來 —— 不該發生，但不准安靜地跑下去
                CODE_STATE="diverged"
                CODE_NOTE="程式更新失敗（本機歷史跟 GitHub 對不起來），跑的是舊的"
            fi
        fi
        unset _pm_before _pm_target _pm_branch _pm_after
    fi
    unset -f _pm_git
fi

unset _pm_repo
