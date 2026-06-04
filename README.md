# 🎬 影片剪輯部門排程系統

給珠寶電商影片團隊用的排程／工作追蹤系統。員工用**電腦版**操作（排程、剪輯搶單），
老闆用**手機版**看部門儀表板追蹤進度。資料存在你自己的 **Mac mini**，不需要任何雲端帳號。

- 後端：Python 3 標準函式庫（**免安裝任何套件**）
- 前端：單一 `public/index.html`（響應式，電腦／手機皆可）
- 儲存：單一 JSON 檔 `data/db.json`，自動備份、損毀自動還原、可離線唯讀

---

## 一、在 Mac mini 上啟動（最省事）

Mac 內建 Python 3，通常不用另外裝。打開「終端機」：

```bash
cd 你放專案的資料夾/EC-DR
python3 server.py
```

看到 `影片排程系統已啟動： http://localhost:3000` 就成功了。

- **這台 Mac mini 本機**：瀏覽器開 `http://localhost:3000`（**完全不需要網路**）。
- **同辦公室其他電腦（同一個 Wi-Fi）**：先查 Mac mini 的內部 IP
  （系統設定 → 網路，或終端機 `ipconfig getifaddr en0`），
  其他電腦瀏覽器開 `http://那個IP:3000`，例如 `http://192.168.1.50:3000`。

換埠號：`PORT=8080 python3 server.py`

---

## 二、讓它 24 小時自動常駐（開機自動跑）

用 macOS 的 launchd。建立檔案 `~/Library/LaunchAgents/com.ecdr.server.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.ecdr.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>/Users/你的帳號/EC-DR/server.py</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/你的帳號/EC-DR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/你的帳號/EC-DR/server.log</string>
  <key>StandardErrorPath</key><string>/Users/你的帳號/EC-DR/server.log</string>
</dict></plist>
```

載入（之後開機就會自動跑、當掉也會自動重啟）：

```bash
launchctl load ~/Library/LaunchAgents/com.ecdr.server.plist
```

停止：`launchctl unload ~/Library/LaunchAgents/com.ecdr.server.plist`

---

## 三、讓同仁從外面（遠端）也能連 — Cloudflare Tunnel（免費）

GitHub Pages 只能放靜態網頁、不能存資料，所以用 Mac mini 對外。
Cloudflare Tunnel 不用動路由器、不用固定 IP。

```bash
brew install cloudflared          # 安裝（需先有 Homebrew）
cloudflared tunnel --url http://localhost:3000
```

它會給你一個公開網址，例如 `https://xxxx-yyyy.trycloudflare.com`，
把這個網址給同仁，他們從家裡／外面打開就能用。

> 這種「快速通道」網址每次重啟會變。要固定網址可申請免費 Cloudflare 帳號做
> Named Tunnel（之後需要再協助設定）。

---

## 四、匯入既有 Google 試算表資料（一次性）

1. 在 Google 試算表，把「寵粉商品庫」「原片/成品清單」分頁分別
   **檔案 → 下載 → 逗號分隔值 (.csv)**。
2. 在 EC-DR 資料夾執行：

```bash
python3 import_sheet.py --products 寵粉商品庫.csv --videos 原片清單.csv
```

3. 完成後啟動 `server.py`，到系統的「寵粉商品庫／影片資料庫」**校對修正**
   （因試算表欄位不一致，匯入是最佳努力）。匯入會先把舊 `db.json` 備份成 `db.json.bak`。

---

## 五、使用說明（系統內）

- **進入系統**：選自己的名字（預設五位：冠廷／健加／鴻閔／泓儒／怡如，可新增；只有管理者能刪）。
  右上角會顯示你的名字，並記住這台電腦。**多人可同時登入**。
- **預警中心**：未來一週排程狀態。🔴 緊急＝距今 ≤3 天未排滿；🟡 警告＝4–7 天未排滿。
- **月排程**：點某天 → 設各類別目標數量 → 依時段選片。系統會擋下：同片 30 天內超過 3 次、
  舊片沒換封面標題、每天少了新片。
- **素材工作台**：自己「搶單」或被指派；完成後進新片庫並**鎖定**（不能再偷改）；
  可標「需要支援」。中文片完成後會出現英文／泰文**二創**待辦可認領。
- **部門儀表板**（手機友善）：老闆與全部門看大方向進度、每人今日工作、誰需要支援。
- **影片資料庫／寵粉商品庫／績效報表**：管理影片與商品、看每位剪輯師積分。
- **設定**（需管理者密碼，預設 `1234`）：影片類型、平台、語言、時段、發片帳號樣板、規則參數都可自己改。

> **輸入方式**：所有新增都是「表單填完 → 按確認送出」才存，不會邊打邊存（比較不會出錯）。
> **修改既有資料**初期只有管理者（密碼）能改，等用順了再開放。

---

## 六、備份與救援

- **自動**：每次寫入都先寫暫存檔再覆蓋（防寫壞）；保留最近 50 份滾動備份於 `data/backups/`，
  每天另存一份快照於 `data/backups/daily/`。
- **損毀自動還原**：若 `db.json` 壞了，啟動時自動從最近一份完好備份還原。
- **異地第二份（建議）**：在 Mac mini 安裝「Google Drive 桌面版」，
  到系統「設定 → 異地備份資料夾」填入 Drive 同步資料夾路徑
  （如 `/Users/你的帳號/Library/CloudStorage/GoogleDrive-你的信箱/我的雲端硬碟/EC-DR備份`），
  每天的快照就會自動上傳到 Google Drive。Mac mini 壞掉時 Drive 上還有一份。
- **手動**：之後會提供匯出／匯入整庫 JSON 的按鈕作為人工救援。

---

## 七、修改管理者密碼

進「設定」頁，在「變更管理者密碼」填新密碼，按「確認送出設定」（需先輸入目前密碼）。
預設密碼是 `1234`，建議上線前先改掉。
