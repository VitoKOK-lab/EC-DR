#!/bin/bash
# =============================================================================
# 安裝／移除自動備份排程（macOS launchd）
#
#   bash tools/install-schedule.sh              安裝：每天 03:00 備份
#   bash tools/install-schedule.sh --hour 5     改成每天 05:00
#   bash tools/install-schedule.sh --status     看目前狀態與最近紀錄
#   bash tools/install-schedule.sh --uninstall  整個移除
#
# 會裝兩個工作：
#   com.ecdr.backup       每天 03:00 跑備份（失敗會跳通知）
#   com.ecdr.healthcheck  每天 09:00 檢查「備份有沒有默默停掉」
#
# 用 launchd 不用 cron 的原因：Mac 在排程時間睡著的話，
# cron 會直接跳過那一次，launchd 會在喚醒後補跑。
# =============================================================================

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
BK_LABEL="com.ecdr.backup"
HC_LABEL="com.ecdr.healthcheck"
BK_PLIST="$AGENTS/$BK_LABEL.plist"
HC_PLIST="$AGENTS/$HC_LABEL.plist"
LOG_DIR="$HOME/EC-DR-Backups/_logs"

HOUR=3
MINUTE=0
HC_HOUR=9
KEEP=60           # 每天備份保留 60 份 ≈ 兩個月歷史

MODE="install"
while [ $# -gt 0 ]; do
    case "$1" in
        --hour)      HOUR="$2"; shift 2 ;;
        --minute)    MINUTE="$2"; shift 2 ;;
        --keep)      KEEP="$2"; shift 2 ;;
        --uninstall) MODE="uninstall"; shift ;;
        --status)    MODE="status"; shift ;;
        -h|--help)   sed -n '2,16p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *)           echo "不認識的參數：$1"; exit 1 ;;
    esac
done

die() { printf '\n❌ %s\n' "$*" >&2; exit 1; }
ok()  { printf '  ✅ %s\n' "$*"; }

[ "$(uname)" = "Darwin" ] || die "這支腳本只適用於 macOS（launchd）。"

unload_one() {
    # 新版 macOS 用 bootout，舊版用 unload；兩個都試，失敗不算錯
    launchctl bootout "gui/$UID/$1" >/dev/null 2>&1 || true
    launchctl unload "$2" >/dev/null 2>&1 || true
}

load_one() {
    launchctl bootstrap "gui/$UID" "$1" >/dev/null 2>&1 && return 0
    launchctl load "$1" >/dev/null 2>&1 && return 0
    return 1
}

# ---------------------------------------------------------------------------
if [ "$MODE" = "uninstall" ]; then
    echo ""
    echo "移除自動備份排程"
    echo "========================================"
    unload_one "$BK_LABEL" "$BK_PLIST"; rm -f "$BK_PLIST"; ok "已移除每日備份"
    unload_one "$HC_LABEL" "$HC_PLIST"; rm -f "$HC_PLIST"; ok "已移除健康檢查"
    echo ""
    echo "  已經備份好的檔案不會被刪，仍在 $HOME/EC-DR-Backups"
    echo "  之後要備份就手動跑：python3 tools/backup.py"
    echo ""
    exit 0
fi

# ---------------------------------------------------------------------------
if [ "$MODE" = "status" ]; then
    echo ""
    echo "自動備份排程狀態"
    echo "========================================"
    for L in "$BK_LABEL" "$HC_LABEL"; do
        if launchctl list 2>/dev/null | grep -q "$L"; then
            echo "  ✅ $L 已載入"
        else
            echo "  ❌ $L 未載入"
        fi
    done
    echo ""
    echo "最近的備份："
    ls -1dt "$HOME/EC-DR-Backups"/ecdr-* 2>/dev/null | head -5 | sed 's|.*/|    |' \
        || echo "    （還沒有）"
    echo ""
    if [ -f "$LOG_DIR/backup.log" ]; then
        echo "備份紀錄最後 12 行（$LOG_DIR/backup.log）："
        tail -12 "$LOG_DIR/backup.log" | sed 's/^/    /'
    else
        echo "（還沒有排程紀錄，第一次要等到排定時間才會產生）"
    fi
    echo ""
    exit 0
fi

# ---------------------------------------------------------------------------
echo ""
echo "安裝自動備份排程"
echo "========================================"
echo "  專案位置：$REPO"
printf "  備份時間：每天 %02d:%02d\n" "$HOUR" "$MINUTE"
printf "  健康檢查：每天 %02d:00\n" "$HC_HOUR"
echo "  保留份數：$KEEP"
echo ""

[ -f "$REPO/tools/backup.py" ] || die "找不到 $REPO/tools/backup.py。請確認在正確的分支上。"
mkdir -p "$AGENTS" "$LOG_DIR"
chmod +x "$REPO/tools/backup-scheduled.sh" "$REPO/tools/backup-healthcheck.sh" 2>/dev/null || true

cat > "$BK_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$BK_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO/tools/backup-scheduled.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>EC_DR_KEEP</key><string>$KEEP</string>
  </dict>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$HOUR</integer>
    <key>Minute</key><integer>$MINUTE</integer>
  </dict>
  <key>StandardOutPath</key><string>$LOG_DIR/launchd-backup.out</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/launchd-backup.err</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
PLIST

cat > "$HC_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$HC_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO/tools/backup-healthcheck.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$HC_HOUR</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>$LOG_DIR/launchd-health.out</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/launchd-health.err</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
PLIST

for f in "$BK_PLIST" "$HC_PLIST"; do
    plutil -lint "$f" >/dev/null 2>&1 || die "$f 格式有問題"
done
ok "設定檔已寫入並通過格式檢查"

unload_one "$BK_LABEL" "$BK_PLIST"
unload_one "$HC_LABEL" "$HC_PLIST"
load_one "$BK_PLIST" || die "載入備份排程失敗。可能需要到「系統設定 → 隱私權與安全性」允許終端機執行。"
load_one "$HC_PLIST" || die "載入健康檢查失敗。"
ok "兩個排程都已載入"

echo ""
echo "========================================"
echo "✅ 設定完成"
echo ""
printf "   每天 %02d:%02d 自動備份，失敗會跳 macOS 通知\n" "$HOUR" "$MINUTE"
printf "   每天 %02d:00 檢查備份有沒有默默停掉\n" "$HC_HOUR"
echo ""
echo "   看狀態：bash tools/install-schedule.sh --status"
echo "   要移除：bash tools/install-schedule.sh --uninstall"
echo ""
echo "   ⚠️  電腦在排定時間如果是關機的，那次會跳過；"
echo "      如果只是睡著，launchd 會在喚醒後補跑。"
echo "========================================"
echo ""
