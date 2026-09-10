#!/bin/bash
# =============================================================================
# 排程備份的外殼 —— 由 macOS 的 launchd 每週呼叫一次。
#
# 為什麼不直接讓 launchd 跑 backup.py：
#   1. 網路暫時不通就整週沒備份 → 這裡retry 3 次，每次間隔 5 分鐘
#   2. 失敗了沒人知道 → 跳 macOS 通知，不是只寫進沒人看的 log
#   3. launchd 的環境變數極少（沒有正常的 PATH）→ 這裡明確設定
#
# 手動測試：bash tools/backup-scheduled.sh
# =============================================================================

set -uo pipefail

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$HOME/EC-DR-Backups/_logs"
LOG="$LOG_DIR/backup.log"
ATTEMPTS="${EC_DR_ATTEMPTS:-3}"
GAP="${EC_DR_RETRY_GAP:-300}"          # 每次重試間隔（秒）
BACKUP_CMD="${EC_DR_BACKUP_CMD:-}"     # 測試用；平常留空走預設
KEEP="${EC_DR_KEEP:-}"                 # 由 LaunchAgent 傳入的保留份數

mkdir -p "$LOG_DIR"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }

notify() {
    # 跳一個 macOS 通知。非 macOS（或沒有 osascript）就安靜跳過。
    command -v osascript >/dev/null 2>&1 || return 0
    osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true
}

log "──────── 排程備份開始 ────────"

for i in $(seq 1 "$ATTEMPTS"); do
    if [ -n "$BACKUP_CMD" ]; then
        OUT=$($BACKUP_CMD 2>&1); RC=$?
    else
        if [ -n "$KEEP" ]; then
            OUT=$(cd "$REPO" && /usr/bin/python3 tools/backup.py --keep "$KEEP" 2>&1); RC=$?
        else
            OUT=$(cd "$REPO" && /usr/bin/python3 tools/backup.py 2>&1); RC=$?
        fi
    fi

    printf '%s\n' "$OUT" >> "$LOG"

    if [ "$RC" -eq 0 ]; then
        SUMMARY=$(printf '%s\n' "$OUT" | grep -E '^   大小：' | head -1 | sed 's/^ *//')
        log "✅ 成功（第 $i 次嘗試）"
        log "──────── 結束 ────────"
        # 成功不打擾，只留 log
        exit 0
    fi

    log "❌ 第 $i 次失敗（結束碼 $RC）"
    [ "$i" -lt "$ATTEMPTS" ] && { log "…等 ${GAP} 秒後重試"; sleep "$GAP"; }
done

log "‼️ 連續 $ATTEMPTS 次都失敗，放棄本次排程"
log "──────── 結束 ────────"
notify "EC-DR 備份失敗" "連續 $ATTEMPTS 次都沒成功。請開終端機執行 python3 tools/backup.py 看錯誤訊息。"
exit 1
