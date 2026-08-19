# 🎬 電商部協作系統

泰熙爾札娜（TAHIR ZAINAB）電商部用的短影音排程／工作追蹤系統：把影片鋪到各社群、
導購到 Shopline，並讓主管即時掌握每日上片數、每位剪輯的工作量與排程缺口。

## 架構

- **前端**：純 HTML/JS，無打包、無 npm。
  - `index.html` — 頁面結構與樣式
  - `app.js` — 畫面渲染、互動、排程／KPI 運算
  - `fb.js` — Firebase 連線、匿名登入、Firestore 即時同步
  - `firebase-config.js` — Firebase 專案設定（可公開）
- **資料**：Firebase Firestore，多裝置即時同步（`onSnapshot`，任一裝置改資料約 1 秒同步給所有人）。
- **登入**：Firebase 匿名登入（內部小團隊）。
- **部署**：GitHub Pages，**服務 repo 根目錄**（`main` 分支）。推上 `main` 即上線：
  <https://vitokok-lab.github.io/EC-DR/>

> **單一來源**：網站檔案就放在 repo 根目錄，沒有 `docs/`／`public/` 副本，改一處即可。

## 首次設定 Firebase（只需一次）

詳見 [`firebase/README.md`](firebase/README.md)，重點：

1. 建 Firebase 專案 → 開 **Firestore Database** → 啟用 **Authentication 匿名登入**。
2. 複製專案的 `firebaseConfig`，貼進根目錄 `firebase-config.js`
   （這些值可公開；安全性由 Firestore 規則控管）。
3. 部署 Firestore 規則：`cd firebase && firebase deploy --only firestore:rules`。

## 本機預覽

因為用 ES 模組，需用小伺服器（不能直接點兩下開檔）：

```bash
python3 -m http.server 5000
```

瀏覽器開 <http://localhost:5000>（`localhost` 預設在 Firebase 授權網域內，可直接匿名登入）。

## 部署

推送到 `main` 即由 GitHub Pages 自動發布（服務根目錄）。

**破快取版本戳**：GitHub Pages 送 `Cache-Control: max-age=600` —— 在那 10 分鐘內瀏覽器
連問都不會問，直接用快取。所以 `index.html` 的 `app.js?v=…` 一定要跟著程式一起變，
不然改了使用者也看不到。

版本戳現在是 **`app.js` ＋ `fb.js` 的內容雜湊**，改了程式就自己不一樣，不用記版號：

```bash
node tests/check-cache-stamp.js --fix   # 更新 index.html 的 ?v=
```

`node tests/run-all.js` 會檢查它是不是最新的，忘了更新就會紅（CI 也會擋）。

> 之前是寫死的時間戳 `?v=1785586175`，從 8/1 到 8/3 改了五輪都沒人動過它 ——
> 等於完全沒有防快取的作用，使用者得等 10 分鐘或手動強制重新整理才看得到新版。

## 使用

- 登入頁點自己名字 → 輸入密碼（預設 `0000`）即上班打卡；多人即時同步。
- 「管理員登入」（預設密碼 `1234`，請先改掉）可管理成員與設定。
- 操作說明集中在「新手教學」（把游標停在按鈕／欄位上看提示），不印在畫面上。
- **🎯 選品配對**（限「選品行銷」「經理人（Regina）」「管理員」看得到）：選品人員從商品出發，
  幫商品挑 1 支主選＋1 支備選影片、填建議文案修改與建議上架日期，送審核；核准其中一支後，
  系統正式建立「1 商品 → 1 影片」配對。要開放給某位成員，在「設定 → 成員」把他的職位改成
  「選品行銷」。

## 檔案結構

| 路徑 | 說明 |
|------|------|
| `index.html` | 頁面與樣式 |
| `app.js` | 畫面、互動、排程／KPI 運算 |
| `fb.js` | Firestore 資料層（連線、匿名登入、即時同步） |
| `firebase-config.js` | Firebase 專案設定（可公開） |
| `firebase/firestore.rules` | Firestore 安全規則 |
| `firebase/README.md` | Firebase 專案建立與規則部署說明 |
| `SCHEMA.md` | Firestore 資料結構 |
| `UX-PLAN-v2.md` | UX 規劃（參考） |

## 安全性

目前 Firestore 規則為「通過匿名登入即可讀寫」，適合內部信任的小團隊。
日後要更嚴（限定 Email 網域、依角色限制寫入）可再升級。
