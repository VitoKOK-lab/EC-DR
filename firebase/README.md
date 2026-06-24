# Firebase 設定 — 剪輯部 · 影音中控台

資料放 Firebase Firestore，多裝置即時同步。
**網站本身由 GitHub Pages 服務 repo 根目錄**（見上層 [`README.md`](../README.md)）；
Firebase 這邊負責「資料庫 + 帳號登入 + 安全規則」，不做 Hosting。

**安全模型**：每位成員都有一個真正的 Firebase 帳號，密碼由 Firebase 雲端加密保管（不入庫）。
沒帳號的人連資料都讀不到；只有管理員能改設定、增刪成員。

---

## 一、建立 Firebase 專案（只需一次，全在網頁點一點）

1. 到 <https://console.firebase.google.com> → **新增專案**（名字隨意，可關閉 Google Analytics）。
2. 左側 **建構 → Firestore Database → 建立資料庫**（位置選離你近的，例如 asia-east1；
   模式先選「正式版」即可，規則用下方的 `firestore.rules`）。
3. 左側 **建構 → Authentication → 開始使用 → 登入方式 → 「電子郵件/密碼」→ 啟用**
   （只開「電子郵件/密碼」即可，不要開匿名）。
4. 左上齒輪 **專案設定 → 你的應用程式 → 網頁應用程式 `</>`**，註冊後會看到一段
   `firebaseConfig = { apiKey: … }`，**整段複製起來**。

## 二、把設定貼進專案

打開**根目錄** `firebase-config.js`，把剛剛複製的值貼進去（取代所有 `PASTE_…`）。

> 這些值不是機密、可以公開；安全性由 `firestore.rules`（須登入才能讀寫）控管。

## 三、建立「管理員帳號」（重要，請最先做）

1. **Authentication → Users → 新增使用者**：
   - 電子郵件填 **`admin@ecdr.app`**（這個帳號 = 系統的管理員身分）
   - 密碼自己設一組**只有你知道**的強密碼（這才是真正的鎖）
2. 這個 email 已寫死在兩個地方，**必須一致**：
   - `firestore.rules` 的 `isAdmin()`
   - 根目錄 `fb.js` 的 `ADMIN_EMAIL`
   想換成別的 email，兩處一起改即可。

> ⚠️ 部署規則後請**立刻**建立這個帳號，避免被人搶先用同一個 email 註冊。email 不是祕密，密碼才是。

## 四、部署 Firestore 安全規則

需要 Node.js。安裝 Firebase CLI 後：

```bash
npm install -g firebase-tools
firebase login
cd firebase
# 把 .firebaserc 的 PASTE_YOUR_PROJECT_ID 改成你的專案 ID（在專案設定可看到）
firebase deploy --only firestore:rules
```

`firebase.json` 只設定 Firestore 規則、不含 hosting —— 網站發布是把檔案推到 GitHub 的
`main`，由 GitHub Pages 服務根目錄。

## 五、開始用

1. 開網站 → 「管理員登入」→ 輸入你在步驟三設的管理員密碼。
2. 到 **設定 → 剪輯成員**，新增每位剪輯：系統會幫他**建立一個真正的登入帳號**並要你設一組
   初始密碼（記下來交給他，他登入後可自行修改）。
3. 員工開網站 → 點自己名字 → 輸入密碼即可上班。

---

## 常見問題

- **員工忘記密碼**：管理員到「設定 → 剪輯成員 → 重設密碼」即可（會給一組新初始密碼）。
- **整批機器當機/被鎖**：規則只認得管理員帳號的 email；若連管理員都進不去，可到
  Firebase 後台 Authentication 直接重設該帳號密碼。
- **想更嚴**（例如依角色細分寫入、限定真實 Email 網域、加 App Check 擋機器人）可再升級。

資料結構見上層 [`SCHEMA.md`](../SCHEMA.md)。
