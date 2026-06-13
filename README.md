# 🎬 IP 短影音排程 × KPI 追蹤儀表板

給 IP 創辦人短影音頻道用的排程／工作追蹤系統。我們把大量影片連結鋪在各大社群，
導流到 **Shopline**；這套系統用來確保工作流暢、讓**老闆**追蹤整體進度、讓**人資**
追蹤每位剪輯的工作量（超前或落後）。

- 後端：Python 3 標準函式庫（**免安裝任何套件**）
- 前端：單一 `public/index.html`（響應式，電腦／手機皆可）
- 儲存：單一 JSON 檔 `data/db.json`，自動備份、損毀自動還原、可離線唯讀

> ☁️ **想要雲端版（給網址、手機隨開隨用、多人即時同步、免顧機器）** → 看 [`firebase/README.md`](firebase/README.md)。
> 功能與畫面相同，資料改放 Firebase Firestore。兩個版本可擇一使用。

## 核心規則

- **每日至少上 4 片**（可在設定調整 `每日應上片數`），分 **流量型** 與 **帶貨型** 兩大類，
  每大類下可再自訂子標籤（如 名人話題／珠寶知識／新品／促銷）。
- **預排一個月**：月排程一眼看出未來 30 天哪幾天還沒排滿（🔴 緊急 ≤3 天、🟡 警告）。
- **每位剪輯每日至少完成 3 片**為 KPI（可調整 `每位剪輯每日配額`）。
- **片源**區分「老闆自拍 / 外部公司」。
- 中文母版完成後，可追多語**二創**（英／泰／馬）進度。
- 影片自動防疲乏：同一支影片 30 天內使用次數達上限不可再排。

## 三種角色

| 角色 | 看得到 | 重點 |
|------|--------|------|
| **老闆 boss** | 老闆總覽、月排程、我的工作台、影片庫、帶貨商品、設定 | 未來一個月排滿率、今日上片數、整體超前/落後、需支援 |
| **人資 hr** | 人員KPI、部門總覽、月排程、影片庫 | 每人今日完成 vs 3、本週/本月累計、超前/落後 |
| **剪輯 editor** | 我的工作台、月排程、影片庫 | 搶單/被指派、完成回報、二創認領、今日 KPI |

> 角色與「管理者密碼」相互獨立：刪改既有資料、改設定仍需管理者密碼（預設 `1234`）。

---

## 一、在 Mac mini 上啟動（最省事）

Mac 內建 Python 3，通常不用另外裝。打開「終端機」：

```bash
cd 你放專案的資料夾/EC-DR
python3 server.py
```

看到 `IP 短影音排程系統已啟動： http://localhost:3000` 就成功了。

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

```bash
brew install cloudflared          # 安裝（需先有 Homebrew）
cloudflared tunnel --url http://localhost:3000
```

它會給你一個公開網址，例如 `https://xxxx-yyyy.trycloudflare.com`，把這個網址給同仁。

> 這種「快速通道」網址每次重啟會變。要固定網址可申請免費 Cloudflare 帳號做 Named Tunnel。

---

## 四、開始使用

1. **建立成員**：第一次進入在登入頁「新增成員名字 → 選角色（老闆／人資／剪輯）→ 新增」。
   建議先建一位老闆。每個人點自己名字進入，系統記住這台電腦的身分（多人可同時登入）。
2. **新增影片任務**（剪輯/老闆）：在「我的工作台」或「影片庫」按「＋ 新增影片任務」，
   填 原片／成品名／主類別＋子標籤／片源／文案狀態。
3. **搶單與完成**（剪輯）：在待處理池「我來剪」→ 完成後按「完成✔」，即計入今日 KPI；
   需要協助時按「求支援」，老闆/人資的總覽會看到。
4. **排程**（老闆/剪輯）：到「月排程」點某天 →「選片排入」，挑已完成的影片排滿當日目標（預設 4 片）；
   按「上架」自動產生發片帳號（如 `20260701g01`）。日格 🟢 已滿、🔴/🟡 未滿。
5. **二創**（剪輯）：中文母版完成後，工作台會出現英／泰／馬待辦可認領。
6. **追蹤**：老闆看「老闆總覽」、人資看「人員KPI」（誰超前誰落後一目了然）。
7. **設定**（需管理者密碼，預設 `1234`）：每日上片數、每人每日配額、預排天數、主類別/子標籤、
   片源、語言、平台、疲乏規則、KPI 累計基準日、異地備份資料夾、管理者密碼都可自己改。

> **輸入方式**：新增都是「表單填完 → 按確認送出」才存。
> **修改/刪除既有資料**與**改設定**需管理者密碼。

---

## 五、備份與救援

- **自動**：每次寫入先寫暫存檔再覆蓋（防寫壞）；保留最近 50 份滾動備份於 `data/backups/`，
  每天另存一份快照於 `data/backups/daily/`。
- **損毀自動還原**：若 `db.json` 壞了，啟動時自動從最近一份完好備份還原。
- **異地第二份（建議）**：在 Mac mini 安裝「Google Drive 桌面版」，到「設定 → 異地備份資料夾」
  填入 Drive 同步資料夾路徑，每天的快照就會自動上傳到 Google Drive。
- **重置/清空**：直接刪除 `data/db.json`（連同 `data/backups/`）後重啟 `server.py`，
  系統會以乾淨的新 schema 重建。

---

## 六、舊資料匯入

`import_sheet.py` 是對應**舊資料模型**的一次性匯入工具，欄位對應尚未更新到 v2 新 schema，
目前**暫不適用**。若日後要把新試算表帶入，請先更新該腳本的欄位比對再使用。
