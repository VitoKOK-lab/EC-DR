# Firebase 設定 — 電商部協作系統

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
firebase deploy --only firestore:rules,storage
```

`firebase.json` 只設定 Firestore 與 Storage 規則、不含 hosting —— 網站發布是把檔案推到
GitHub 的 `main`，由 GitHub Pages 服務根目錄。

## 三之二、Storage 規則（影片封面圖要用）

影片封面圖放 Firebase Storage。**Storage 剛啟用時的預設規則是「全部禁止」**，
不改的話上傳會失敗（畫面會提示「沒有上傳權限 —— Storage 規則還沒設定」）。

不想裝 CLI 的話，用網頁貼一次也可以：
Firebase 主控台 → **建構 → Storage → 規則** → 把 [`storage.rules`](storage.rules)
**整個檔案內容**貼上去（連同第一行 `rules_version = '2';`）→ **發布**。

規則的重點：要通過匿名登入、**只收圖片**、**單張小於 2MB**、`covers/` 以外的路徑一律不開
（避免被當成免費網路硬碟）。上傳前程式已經壓過（長邊 720px 的 JPEG，約 60–90KB）。

---

## 四、規則測試（改規則前後都要跑）

`firestore.rules` 一改錯，全公司立刻無法操作系統。所以有一組 42 項的規則測試，
涵蓋 app 的每一種實際寫入（含 `arrayUnion`／`increment` 原子寫入與實際查詢），
以及每一種破壞手法。

需要 Java（Firestore 模擬器要用）：

```bash
cd EC-DR                       # repo 根目錄
npm install --no-save @firebase/rules-unit-testing firebase firebase-tools
npx firebase emulators:exec --only firestore --project demo-ecdr \
    "node firebase/rules.test.mjs"
```

裝出來的 `node_modules/` 與 `package*.json` 已在 `.gitignore`，不會進版控——
專案本身仍然是零依賴，只有跑規則測試時才需要這些套件。

**A、B、C 三組任何一項失敗＝新規則會弄壞正在運作的系統，不要部署。**

---

## 安全性備註

### 已處理：資料破壞（2026-09）

規則已從「一條 `/{document=**}` 全開」改成逐集合授權：

- 只開放程式實際使用的 9 個集合，其餘路徑與所有子集合一律拒絕；
- `logs`／`schedule`／`shifts`／`meta` **禁止刪除**（程式從不刪這些，
  合計佔全部資料的 75%）；
- `logs` 額外**禁止修改**，稽核紀錄不可竄改；
- `videos` 只有「已在回收桶裡」（`deleted == true`）的才能永久刪除，
  與程式流程一致。

### ⚠️ 尚未處理：資料外洩

**登入方式仍是匿名登入，而這個 repo 是公開的。** 代表任何人拿到
`firebase-config.js`（就在 repo 根目錄）都能通過 `request.auth != null`，
**讀走全部營運資料**——商品成本售價、每位成員的績效工時、所有操作紀錄。

上面那組規則擋得住「被破壞」，擋不住「被看走」。要真正解決，必須改登入方式：

- 改用 Google 帳號登入，規則限定公司網域或 `users` 白名單；
- 或改用 Email 登入 + 白名單。

兩者都需要同步改寫前端登入流程（`fb.js` 的匿名登入、`app.js` 的選名字進入），
估一到兩天。**在那之前，請把這個資料庫視為公開可讀。**

### 另外：Storage 封面圖

`storage.rules` 目前允許任何匿名登入者刪除 `covers/` 下的圖片。
程式的「移除封面」功能要用到 `deleteObject`，所以不能直接鎖死；
改登入方式時一併收斂即可。影響有限（封面圖可重傳）。

資料結構見上層 [`SCHEMA.md`](../SCHEMA.md)。
