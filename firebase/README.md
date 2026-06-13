# 🎬 IP 短影音排程 × KPI 儀表板 — Firebase 雲端版

跟 Mac mini 版功能一樣，但**資料放 Firebase 雲端、即時同步**：給同仁一個網址，
手機點開就能用，不用顧機器、不用 Cloudflare。畫面完全沿用，運算（排程預警、KPI 超前/落後）在前端跑。

- 前端：純 HTML/JS（`public/`），無打包、無 npm
- 資料：Firestore（雲端資料庫，即時同步）
- 登入：Firebase 匿名登入（內部小團隊用）

> 想要「資料完全留在自己機器、不碰雲端」→ 用上層資料夾的 Mac mini 版。

---

## 一、建立 Firebase 專案（只需一次，全在網頁點一點）

1. 到 <https://console.firebase.google.com> → **新增專案**（名字隨意，可關閉 Google Analytics）。
2. 左側 **建構 → Firestore Database → 建立資料庫**（位置選離你近的，例如 asia-east1；
   模式先選「正式版」即可，規則我們下面用 `firestore.rules`）。
3. 左側 **建構 → Authentication → 開始使用 → 登入方式 → 匿名 → 啟用**。
4. 左上齒輪 **專案設定 → 你的應用程式 → 網頁應用程式 `</>`**，註冊後會看到一段
   `firebaseConfig = { apiKey: ... }`，**整段複製起來**。

## 二、把設定貼進專案

打開 `public/firebase-config.js`，把剛剛複製的值貼進去（取代所有 `PASTE_...`）。
> 這些值不是機密、可以公開；安全性由 `firestore.rules`（須登入才能讀寫）控管。

## 三、先在本機看一眼（可選）

因為用到 ES 模組，不能直接點兩下開檔，要用小伺服器：

```bash
cd firebase/public
python3 -m http.server 5000
```
瀏覽器開 <http://localhost:5000>。第一次會自動把預設設定寫進 Firestore。
（`localhost` 預設就在 Firebase 的授權網域內，可直接匿名登入。）

## 四、發布成公開網址（取得給同仁的連結）

需要 Node.js。安裝 Firebase CLI 並部署：

```bash
npm install -g firebase-tools
firebase login
cd firebase
# 把 .firebaserc 的 PASTE_YOUR_PROJECT_ID 改成你的專案 ID（在專案設定可看到）
firebase deploy            # 會一併套用 firestore.rules 與 hosting
```

完成後會給你一個網址，例如 `https://你的專案.web.app` —— 這就是給同仁的連結。
（Firebase Hosting 的網域會自動列入授權網域，匿名登入可直接用。）

> 只想更新安全規則：`firebase deploy --only firestore:rules`
> 只想更新網頁：`firebase deploy --only hosting`

## 五、開始使用

1. 開網址 → 登入頁「新增成員名字 → 選角色（老闆／人資／剪輯）→ 新增」，先建一位**老闆**。
2. 點自己名字進入。誰改了資料，所有人畫面**即時更新**。
3. 到「⚙️ 設定」把每日上片數、每人配額、子標籤、片源調成你們的數字
   （需管理者密碼，預設 `1234`，請先改掉）。

---

## 資料結構（Firestore collections）

| 集合 | 文件 | 內容 |
|------|------|------|
| `users` | 文件 id = 名字 | `{name, role(boss/hr/editor)}` |
| `products` | `P001…` | 帶貨商品（name/shoplineLink/keywords/priceRange…） |
| `videos` | `V001…` | 影片任務（原片→成品→上片、mainType/subTag/source/editor/stage/languages…） |
| `schedule` | 文件 id = 日期 | `{slots:[…]}` |
| `meta/settings` | 單一文件 | 全部設定值（KPI 目標、分類、片源、語言、密碼…） |

## 安全性備註

目前規則是「通過匿名登入即可讀寫」，適合內部信任的小團隊。日後要更嚴，可改成：
- 改用 Email 登入，限定你們公司網域；
- 在規則裡依角色限制寫入（例如只有 boss 能改 settings）。
需要時我可以幫你把規則與登入方式升級。
