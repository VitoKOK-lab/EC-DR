# 🎬 剪輯部 · 影音中控台

泰熙爾札娜（TAHIR ZAINAB）剪輯部用的短影音排程／工作追蹤系統：把影片鋪到各社群、
導購到 Shopline，並讓主管即時掌握每日上片數、每位剪輯的工作量與排程缺口。

## 架構

- **前端**：純 HTML/JS，無打包、無 npm。
  - `index.html` — 頁面結構與樣式
  - `app.js` — 畫面渲染、互動、排程／KPI 運算
  - `fb.js` — Firebase 連線、帳號登入、Firestore 即時同步
  - `firebase-config.js` — Firebase 專案設定（可公開）
- **資料**：Firebase Firestore，多裝置即時同步（`onSnapshot`，任一裝置改資料約 1 秒同步給所有人）。
- **登入**：每人一個真正的 Firebase Email/密碼帳號（密碼雲端加密保管、不入庫）。管理員在系統內新增成員時自動建立其帳號。
- **部署**：GitHub Pages，**服務 repo 根目錄**（`main` 分支）。推上 `main` 即上線：
  <https://vitokok-lab.github.io/EC-DR/>

> **單一來源**：網站檔案就放在 repo 根目錄，沒有 `docs/`／`public/` 副本，改一處即可。

## 首次設定 Firebase（只需一次）

詳見 [`firebase/README.md`](firebase/README.md)，重點：

1. 建 Firebase 專案 → 開 **Firestore Database** → 啟用 **Authentication「電子郵件/密碼」登入**。
2. 複製專案的 `firebaseConfig`，貼進根目錄 `firebase-config.js`
   （這些值可公開；安全性由 Firestore 規則控管）。
3. 在 Authentication 建立**管理員帳號**（email = 管理員的 email，需與 `fb.js` 的 `ADMIN_EMAIL`、`firestore.rules` 的 `isAdmin()` 一致 + 自設強密碼）。
4. 部署 Firestore 規則：`cd firebase && firebase deploy --only firestore:rules`。

## 本機預覽

因為用 ES 模組，需用小伺服器（不能直接點兩下開檔）：

```bash
python3 -m http.server 5000
```

瀏覽器開 <http://localhost:5000>（`localhost` 預設在 Firebase 授權網域內，可直接登入）。

## 部署

推送到 `main` 即由 GitHub Pages 自動發布（服務根目錄）。
改了畫面後，記得把 `index.html` 裡 `app.js?v=` 的版號加一以破快取。

## 使用

- 登入頁點自己名字 → 輸入自己的密碼即上班打卡；多人即時同步。
- 「管理員登入」用管理員帳號密碼進入，可管理成員與設定。
- 管理員在「設定 → 剪輯成員」新增成員時，系統自動幫他建立登入帳號並設定初始密碼（成員登入後可自改）。
- 操作說明集中在「新手教學」（把游標停在按鈕／欄位上看提示），不印在畫面上。

## 檔案結構

| 路徑 | 說明 |
|------|------|
| `index.html` | 頁面與樣式 |
| `app.js` | 畫面、互動、排程／KPI 運算 |
| `fb.js` | Firestore 資料層（連線、帳號登入、即時同步） |
| `firebase-config.js` | Firebase 專案設定（可公開） |
| `firebase/firestore.rules` | Firestore 安全規則 |
| `firebase/README.md` | Firebase 專案建立與規則部署說明 |
| `SCHEMA.md` | Firestore 資料結構 |
| `UX-PLAN-v2.md` | UX 規劃（參考） |

## 安全性

- 每人一個真正的 Firebase 帳號;沒帳號的人連資料都讀不到。
- 密碼由 Firebase 雲端加密保管,**不存在資料庫**。
- 只有管理員(固定管理員帳號)能改設定、增刪成員;一般成員只能讀寫營運資料。
- 規則見 [`firebase/firestore.rules`](firebase/firestore.rules)。日後要更嚴(限定真實 Email 網域、依角色再細分、加 App Check 擋機器人)可再升級。
