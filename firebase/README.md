# Firebase 設定 — 剪輯部 · 影音中控台

資料放 Firebase Firestore，多裝置即時同步。
**網站本身由 GitHub Pages 服務 repo 根目錄**（見上層 [`README.md`](../README.md)）；
Firebase 這邊只負責「資料庫 + 匿名登入 + 安全規則」，不做 Hosting。

---

## 一、建立 Firebase 專案（只需一次，全在網頁點一點）

1. 到 <https://console.firebase.google.com> → **新增專案**（名字隨意，可關閉 Google Analytics）。
2. 左側 **建構 → Firestore Database → 建立資料庫**（位置選離你近的，例如 asia-east1；
   模式先選「正式版」即可，規則用下方的 `firestore.rules`）。
3. 左側 **建構 → Authentication → 開始使用 → 登入方式 → 匿名 → 啟用**。
4. 左上齒輪 **專案設定 → 你的應用程式 → 網頁應用程式 `</>`**，註冊後會看到一段
   `firebaseConfig = { apiKey: … }`，**整段複製起來**。

## 二、把設定貼進專案

打開**根目錄** `firebase-config.js`，把剛剛複製的值貼進去（取代所有 `PASTE_…`）。

> 這些值不是機密、可以公開；安全性由 `firestore.rules`（須登入才能讀寫）控管。

## 三、部署 Firestore 安全規則

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

---

## 安全性備註

目前規則是「通過匿名登入即可讀寫」，適合內部信任的小團隊。日後要更嚴，可改成：

- 改用 Email 登入，限定你們公司網域；
- 在規則裡依角色限制寫入（例如只有管理員能改 `meta/settings`）。

資料結構見上層 [`SCHEMA.md`](../SCHEMA.md)。
