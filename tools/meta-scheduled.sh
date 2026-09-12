#!/bin/bash
# =============================================================================
# 排程跑的平台成效同步（launchd 叫這一支，不要直接叫 meta_sync.py）
#
# 為什麼是「每天叫起來、腳本自己判斷」而不是 launchd 直接排每三天：
# launchd 排每三天的話，只要有一次失敗（權杖過期、網路斷、Meta 改版），
# 就要再等三天才會重試 —— 而且沒人知道它失敗了。
# 每天醒來、看上次成功是幾天前，失敗的隔天就會自己再試一次。
# =============================================================================
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$HOME/EC-DR-Backups/_logs"
LOG="$LOG_DIR/meta-sync.log"
EVERY="${EC_DR_META_EVERY:-3}"
DAYS="${EC_DR_META_DAYS:-30}"

mkdir -p "$LOG_DIR"
{
    echo ""
    echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="
    cd "$REPO" || exit 1
    python3 tools/meta_sync.py --write --every "$EVERY" --days "$DAYS"
    echo "[結束碼 $?]"
} >> "$LOG" 2>&1

# 只保留最後 2000 行，不要讓紀錄檔無限長大
if [ -f "$LOG" ]; then
    tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
