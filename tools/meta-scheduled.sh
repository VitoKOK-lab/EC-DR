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
# ⚠️ 2026-09-13 從 30 改成 730（兩年）。
# 理由：老闆的 Meta 上有兩年的資料，系統才做不到半年 —— 30 天的窗抓不到
# 那些「系統裡沒建檔、但當年很紅」的舊片，「未在資料庫裡的影片」那張清單
# 就永遠只有最近一個月的東西。
# 成本：一次多抓約 18,000 則貼文清單（分頁很便宜），問成效的則數有封頂
# （對到的 ~500 則 ＋ 未建檔的最多 600 則），不會像 2026-09-13 那次跑到
# 權杖過期。
DAYS="${EC_DR_META_DAYS:-730}"

mkdir -p "$LOG_DIR"
{
    echo ""
    echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="
    cd "$REPO" || exit 1
    # 跑之前自己更新程式 —— 老闆不必再手動 git（見 tools/_pull-main.sh 開頭那段）。
    # ⚠️ 結果要**傳給 meta_sync**，讓「跑的是舊程式」出現在畫面上而不是只在這個檔裡。
    . "$REPO/tools/_pull-main.sh"
    echo "程式：$CODE_STATE　$CODE_NOTE"
    EC_DR_CODE_STATE="$CODE_STATE" EC_DR_CODE_NOTE="$CODE_NOTE" \
        python3 tools/meta_sync.py --write --fill-links --every "$EVERY" --days "$DAYS"
    echo "[結束碼 $?]"
    # 貼文銷售（「這個品推過幾次」）。跟成效同步搭同一班車 —— 它只抓一個 CSV，
    # 很便宜，而且失敗了也不該影響上面那一段（所以放在後面、不看它的結束碼）。
    echo "── 貼文銷售 ──"
    python3 tools/postsale_sync.py --write
    echo "[貼文銷售結束碼 $?]"
    # 廣告花費（老闆選 A：系統自己去跟 Meta 要）。靠 metrics 裡的 postId 對回影片，
    # 所以排在成效同步後面。沒設廣告帳號 ID 會自己說明然後結束，不影響上面。
    echo "── 廣告花費 ──"
    EC_DR_CODE_STATE="$CODE_STATE" EC_DR_CODE_NOTE="$CODE_NOTE" \
        python3 tools/ads_sync.py --write --days 30
    echo "[廣告花費結束碼 $?]"
} >> "$LOG" 2>&1

# 只保留最後 2000 行，不要讓紀錄檔無限長大
if [ -f "$LOG" ]; then
    tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
