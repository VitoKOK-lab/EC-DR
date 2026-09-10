#!/bin/bash
# =============================================================================
# 備份健康檢查 —— 每天跑一次，只做一件事：確認備份沒有默默停掉。
#
# 為什麼需要這個：自動備份最常見的死法不是「備份壞掉」，
# 是「它某天停了、沒人發現」。等真的要用時才知道最後一份是三個月前的。
#
# 排程本身失敗會跳通知（見 backup-scheduled.sh），但如果整個排程根本沒被觸發
# （電腦關機太久、LaunchAgent 被移除、專案資料夾被搬走），那就不會有任何聲音。
# 這支獨立的檢查就是補這個洞：只看「最新一份備份幾天前」，超過就叫你。
#
# 手動測試：bash tools/backup-healthcheck.sh
# =============================================================================

set -uo pipefail

export PATH="/usr/bin:/bin:/usr/sbin:/sbin"

BACKUP_DIR="${EC_DR_BACKUP_DIR:-$HOME/EC-DR-Backups}"
MAX_AGE_DAYS="${EC_DR_MAX_AGE_DAYS:-3}"   # 每日備份 → 超過 3 天就是漏了好幾次
LOG="$BACKUP_DIR/_logs/healthcheck.log"

mkdir -p "$(dirname "$LOG")"
log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }

notify() {
    command -v osascript >/dev/null 2>&1 || return 0
    osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true
}

NEWEST=$(ls -1d "$BACKUP_DIR"/ecdr-* 2>/dev/null | sort | tail -1)

if [ -z "$NEWEST" ]; then
    log "‼️ $BACKUP_DIR 裡一份備份都沒有"
    notify "EC-DR 沒有任何備份" "備份資料夾是空的。請執行 python3 tools/backup.py。"
    exit 1
fi

# 用資料夾名稱裡的日期算年齡，不看檔案時間（複製搬移會讓檔案時間失真）
#
# date 的語法 macOS(BSD) 與 Linux(GNU) 不同，兩種都試。
# 算不出來時「不發警報」—— 每天誤報會讓人學會忽略通知，比沒有檢查更糟。
epoch_of_day() {
    date -j -f "%Y-%m-%d" "$1" +%s 2>/dev/null && return 0   # macOS / BSD
    date -d "$1" +%s 2>/dev/null && return 0                 # Linux / GNU
    return 1
}

NAME=$(basename "$NEWEST")
if ! printf '%s' "$NAME" | grep -qE '^ecdr-[0-9]{8}-[0-9]{6}$'; then
    log "⚠️ 看不懂資料夾名稱 $NAME，跳過本次檢查（不發警報）"
    exit 0
fi

YMD="${NAME:5:4}-${NAME:9:2}-${NAME:11:2}"
if ! THEN=$(epoch_of_day "$YMD"); then
    log "⚠️ 無法解析日期 $YMD，跳過本次檢查（不發警報）"
    exit 0
fi
AGE_DAYS=$(( ( $(date +%s) - THEN ) / 86400 ))

if [ "$AGE_DAYS" -gt "$MAX_AGE_DAYS" ]; then
    log "‼️ 最新備份是 ${AGE_DAYS} 天前（$(basename "$NEWEST")），超過 ${MAX_AGE_DAYS} 天門檻"
    notify "EC-DR 備份已經 ${AGE_DAYS} 天沒更新" \
           "自動備份可能停了。請執行 python3 tools/backup.py，並檢查排程是否還在。"
    exit 1
fi

log "✅ 最新備份 ${AGE_DAYS} 天前（$(basename "$NEWEST")），正常"
exit 0
