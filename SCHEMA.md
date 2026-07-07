# EC-DR 資料庫結構（Schema）— 唯一真相來源

> 這份文件定義資料庫的「不變地基」。**版面、UI、流程可以隨時改，但欄位結構以此為準。**
> 任何程式寫入都必須符合這裡的定義；新增欄位要先更新這份文件並升版 `schemaVersion`。

- 資料庫：Firebase Firestore（專案 `ec-dr-21416`）
- 目前版本：**schemaVersion = 15**
- 時間格式：日期 `YYYY-MM-DD`；時間戳 ISO 字串（台灣 UTC+8，例 `2026-06-10T09:30:00`）；時段 `HH:MM`

---

## 1. `videos/{id}` — 影片任務（一支毛片 → 剪輯 → 上片）

文件 ID = `V001`、`V002`…（系統遞增產生）。

| 欄位 | 型別 | 中文 | 說明 |
|---|---|---|---|
| `id` | string | 系統編號 | 與文件 ID 相同，`V001`（遞增） |
| `code` | string | 影片編號 | 可自訂的編號；空白則取 `id` 數字（V001→001） |
| `name` | string | 影片貼文文案 | 對外顯示片名以此為主；不填則同 `rawName` |
| `rawName` | string | 原始片名 | 毛片名稱／素材說明 |
| `videoCopy` | string | 影片文案 | 新增影片時輸入 |
| `tags` | string[] | 標籤 | 由 `settings.videoTags` 選；寵粉/代理/流量/帶貨/家庭/理財/投資/教育/個人成長 |
| `subTag` | string | 子標籤 | = `tags[0]`，相容舊資料用 |
| `mainType` | string | 主類別 | `流量型`／`帶貨型`／`寵粉`，由標籤推導，**排程分類用** |
| `source` | string | 片源 | `老闆自拍`／`外部公司`（`settings.sources`） |
| `stage` | string | 階段 | `待處理`→`剪輯中`→`已完成`→`已上片` |
| `editor` | string | 剪輯人員 | 成員名字（對應 `users`） |
| `assignedTo` | string | 指派對象 | 管理員把待剪毛片指派給的成員名字（只分配、不計時；空＝公用待剪池）。員工認領後才開始計時 |
| `claimedBy` | string | 認領人 | 拉下來剪的人 |
| `claimedAt` | string(ISO) | 認領時間 | |
| `finishedAt` | string(ISO) | 完成時間 | 完成上架的時間（排序、KPI 用） |
| `updatedAt` | string(ISO) | 最後更新 | 任何欄位異動時間（影片庫「最後更新日」、排序用） |
| `createdBy` | string | 建立者 | 建立這筆影片/二創殼的成員（2026-07 起新資料自動記；池列/chip/檢視視窗顯示） |
| `createdAt` | string(ISO) | 建立時間 | 同上 |
| `durationMin` | number\|null | 剪輯耗時 | 分鐘（認領→完成） |
| `scheduledDate` | string\|null | 預排上片日期 | `YYYY-MM-DD` |
| `publishTime` | string | 預排上片時間 | `HH:MM`（10:00/12:00/16:00） |
| `platforms` | string[] | 投放平台 | 對應 `settings.postPlatforms[].name` |
| `products` | object[] | 商品（最多 4 個） | 每筆 `{name, price, salePrice}`；`price`＝原價、`salePrice`＝售價（寵粉價，選填），皆手動輸入。只有源片（台灣中文版）可編輯；海外/蝦皮二創版的編輯畫面只唯讀顯示（依 `settings.exchangeRates` 即時換算幣別），不能改 |
| `productUrl` | string | 商品頁網址 | 導購連結基底（+ `?utm_source=平台`） |
| `driveFolder` | string | 存檔位置 | 雲端備份連結（同一支重播都一樣） |
| `publishedLink` | string | 上傳連結 | 社群貼文網址 |
| `socialLink` | string | 社群預排連結 | 排程工具／預約貼文（選填） |
| `note` | string | 備註 | 補充說明（整併自舊 Google 試算表） |
| `usageHistory` | object[] | 重播紀錄 | 每筆 `{date, link, drive, time, by, at}` |
| `totalUsed` | number | 重播次數 | |
| `locked` | boolean | 鎖定 | 完成上架後鎖定 |
| `published` | boolean | 已上架 | 完成確認旗標 |
| `backupDone` | boolean | 已備份 | 完成確認旗標 |
| `socialScheduled` | boolean | 已預排 | 完成確認旗標 |
| `reviewStatus` | string | 審核狀態 | 老闆娘選擇性審核：``／`通過`／`退回`（不擋上架） |
| `reviewNote` | string | 退回原因 | 退回時填，剪輯端會看到 |
| `reviewedBy` | string | 審核人 | |
| `reviewedAt` | string(ISO) | 審核時間 | |
| `deleted` | boolean | 軟刪除 | true＝在回收桶（畫面一律隱藏，僅管理員回收桶可見、可復原） |
| `deletedBy` | string | 刪除者 | 成員名字 |
| `deletedAt` | string(ISO) | 刪除時間 | |
| `metrics` | object[] | 平台成效 | 後端以「影片標題」比對平台貼文後自動填；每筆 `{platform, account, views, likes, comments, shares, at}` |
| `metricsAt` | string(ISO) | 成效更新時間 | 後端最後一次寫入的時間 |
| `locale` | string | 語言別 | `""`＝台灣中文源片（預設）；`"en"`／`"th"`＝英／泰在地化二創版（海外剪輯做）。馬來西亞已改走 `channel:"ms"`（台灣區，schemaVersion 14 起；既有 `locale:"ms"` 資料已遷移） |
| `sourceVideoId` | string | 來源片 | 在地化版本指回台灣源片的 `id`；源片本身為 `""`（同一源片同語言可有多支＝不同帳號/成片） |
| `account` | string | 上傳帳號 | 在地化版本上傳的海外 TikTok 帳號名（取自 `settings.intlAccounts`）；每支＝一個帳號一個成片 |
| `nameEn` | string | 英文片名（源片） | 全庫已批次翻譯填入（2026-07）；海外視角在中文標題下顯示英文小字，新片仍可由管理員/經理人補填 |
| `videoCopyEn` | string | 英文文案（源片） | 有 `videoCopy` 的源片已批次翻譯填入（2026-07）；海外視角在文案下顯示英文翻譯 |
| `channel` | string | 二創平台別 | `""`＝一般（源片本身）；`"shopee"`＝蝦皮二創版（同語言、換平台）；`"ms"`＝馬來西亞二創版（翻馬來文重剪，比照蝦皮流程、價格換 MYR）。跟 `locale` 是平行的兩種衍生方式 |
| `origLang` | string | 一創語言（原本） | 只對一創原本（`locale=""` 且 `channel=""`）有意義：`""`＝中文（預設）、`"th"`泰、`"en"`英、`"my"`馬來。影片庫用「原本語言」選單分庫檢視，每支原本標小圖示 中/TH/EN/MY（schemaVersion 15 起） |

> **平台成效串接（規劃中）**：後端（Supabase 排程）以官方 API 抓 TikTok／IG／FB 各帳號的貼文成效，
> 用「貼文標題＝影片 `name`」比對回本集合，寫入 `metrics`/`metricsAt`。帳號粉絲數另存於未來的
> `channelStats/{yyyy-mm-dd}` 或 `channels` 集合（待實作）。前端只讀 Firestore 顯示。

> **跨語言二創（海外英文版）**：海外剪輯（`users.role="intl"`，全英文介面）在影片庫挑台灣**已完成**源片，
> 建立一筆 `locale:"en"`、`sourceVideoId` 指回源片的**衍生影片**，翻譯重剪後填回 `driveFolder`（英文版存檔）、
> `publishedLink`（上傳連結）、`platforms`（海外 TikTok 帳號），走既有認領/完成流程。源片視窗「各語言版本」卡
> 以 `sourceVideoId` 反查，中英一起看；成效（`metrics`）待後端接入後自動並列。本階段**不做成效追蹤**。

> **蝦皮／馬來二創（台灣區換平台）**：跟海外二創同一套邏輯，差別是**換平台**——不開新角色，掛在既有
> `users.role="editor"`（剪輯）下。挑台灣**已完成**源片，建立一筆 `channel:"shopee"／"ms"`、`sourceVideoId`
> 指回源片、`account`＝平台帳號名的**衍生影片**，走既有認領/完成流程；`scheduledDate` 對應「月排程」hub
> 內對應平台的月曆（依帳號、各自 dailyTarget 判斷已排滿／缺幾支）。
>
> **全員畫面一致（2026-07 起，只分中/英介面）**：editor 與 intl 權限完全相同 —— 待剪池／我的工作把
> 台灣毛片與 蝦/馬/EN/TH 衍生版本合併同一份清單（小圖分辨）；「建立二創版本」四線（蝦皮／馬來西亞／
> 英文／泰文）合在同一個選單、任何人都能新增任一線（英/泰區的帳號下拉只列該語言帳號）。
> 唯一差別是介面語言（intl＝全英文＋中文標題下顯示英文小字）。
> 待剪池的二創殼有「✕ 退回」＝退回資料庫（purge 殼、不動源片）；台灣毛片不適用。
> 「同時 3 支上限」仍為**全域**（不分平台/語言）；今日完成／下班匯報／管理員每日回報也是全線合計。
> 源片視窗以 `sourceVideoId` 反查各平台/語言版本卡。
>
> **建立／刪除追蹤**：所有新影片（含二創殼）記 `createdBy`/`createdAt`，待剪池、版本 chip、檢視視窗都看得到
> 「由誰建立」；軟刪除記 `deletedBy`/`deletedAt`（回收桶可見）、退回/刪除動作寫入 `logs`（含操作者與片名）。

**衍生（不存資料庫，前端即時算）**：`last30dUsed`、`light`（重播熱度）、新／舊片（`scheduledDate` 預排上片日未到＝新片，已過＝舊片，可重播；亦可手選 `tags` 覆寫）。

---

## 2. `schedule/{YYYY-MM-DD}` — 每日排程

| 欄位 | 型別 | 說明 |
|---|---|---|
| `slots` | object[] | 當天排的影片，每筆一個 slot |

**slot 結構**：
```jsonc
{
  "videoId": "V001",      // 對應 videos
  "time": "10:00",         // 上片時段
  "reused": true,          // 是否為舊片重播（新片自動排入則無此旗標）
  "by": "test",            // 排片人（重播時）
  "at": "2026-06-10T...",  // 排入時間
  "publishedLink": "",      // 上傳連結（重播該次）
  "driveFolder": "",        // 存檔位置（重播該次，預設帶影片的）
  "locked": false
}
```
> 某日的影片清單 = `schedule.slots` ∪「`videos` 中 `scheduledDate`=該日且已完成/已上片」（去重）。

---

## 3. `users/{name}` — 成員

| 欄位 | 型別 | 說明 |
|---|---|---|
| `name` | string | 名字（= 文件 ID） |
| `role` | string | `boss`（管理員）／`manager`（經理人）／`editor`（剪輯）／`intl`（海外剪輯・全英文介面） |
| `intlLocale` | string | 海外剪輯綁定語言 | `en`／`th`／`ms`（僅 `role=intl` 用；未設定＝`en`）。帳號綁語言：只做/只看該語言 |
| `isDefault` | boolean | 系統預設旗標 |

> 管理員（Vito）以「🔒 管理員登入」進入，不需建 user 文件。

---

## 3b. `tasks/{id}` — 交辦工作（剪輯以外，每日）

文件 ID = `T<base36 時間戳>`。剪輯在「上班計畫」手動建立；下班匯報依 `done` 顯示已完成／未完成。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | string | 文件 ID |
| `user` | string | 負責剪輯（= users.name） |
| `date` | string | `YYYY-MM-DD`，當天計畫 |
| `title` | string | 工作項目 |
| `report` | string | 回報狀況（進度） |
| `done` | boolean | 完成打勾（false=進行中） |
| `createdAt` | string(ISO) | 建立時間 |

---

## 3d. `logs/{id}` — 操作紀錄（稽核，**管理員看**）

文件 ID = `L<base36 時間戳>`。每個資料異動動作寫一筆；前端只訂閱最近 300 筆（`orderBy at desc, limit 300`）。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | string | 文件 ID |
| `at` | string(ISO) | 時間（台灣 UTC+8） |
| `user` | string | 操作者名字 |
| `role` | string | `boss`／`editor` |
| `action` | string | 動作（例：已新增影片／已刪除影片／指派毛片 N 支／登入…） |
| `target` | string | 對象（影片標題／成員／排程日…） |

---

## 3c. `shifts/{name__date}` — 上下班打卡（**只給管理員看**）

文件 ID = `名字__YYYY-MM-DD`。登入（上班）寫 `clockIn`；按「下班匯報→確認下班」寫 `clockOut`。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | string | `名字__日期` |
| `user` | string | 剪輯名字 |
| `date` | string | `YYYY-MM-DD` |
| `clockIn` | string(ISO) | 上班時間 |
| `clockOut` | string(ISO) | 下班時間（空＝上班中） |

> 單片工時（認領→完成）由 `videos.claimedAt`／`finishedAt`／`durationMin` 衍生，亦只給管理員看（「工時/KPI」頁）。

---

## 4. `meta/settings` — 全域設定（單一文件）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `schemaVersion` | number | 結構版本（目前 9） |
| `dailyTarget` | number | **每日應上片數（單一數字，不分類型）**；月排程以此判斷已排滿／缺幾支。未設定時沿用 `weekdayTargets` 加總 |
| `weekdayTargets` | map | （舊）`{0..6: {流量型, 帶貨型, 寵粉}}` 每星期幾各類型上片數；已被 `dailyTarget` 取代，僅作未設定時的後備加總 |
| `scheduleHorizonDays` | number | 預排天數視窗 |
| `intlAccounts` | object[] | 海外 TikTok 帳號清單，每筆 `{locale, name}`（en/th/ms ＋ 帳號名）；建立在地化版本時挑帳號用 |
| `intlDailyTarget` | number | 海外每日目標（**每個帳號**每天幾支），預設 2；海外月歷（P2）以此判斷已排滿／缺幾支 |
| `shopeeAccounts` | string[] | 蝦皮帳號清單（純名稱，無語言分組）；建立蝦皮版本時挑帳號用 |
| `shopeeDailyTarget` | number | 蝦皮每日目標（**每個帳號**每天幾支），預設 2；蝦皮排程月曆以此判斷已排滿／缺幾支 |
| `msAccounts` | string[] | 馬來帳號清單（純名稱）；建立馬來版本時挑帳號用（台灣區，比照蝦皮） |
| `msDailyTarget` | number | 馬來每日目標（**每個帳號**每天幾支），預設 2；馬來排程月曆用 |
| `exchangeRates` | map | 各平台商品價格換算：`{en/th/ms/shopee:{code,rate,mult}}`；`rate`＝1 台幣可換多少該幣別（蝦皮固定 1＝台幣不換匯）、`mult`＝該平台售價**加乘倍數**（例 1.2＝加價 2 成，預設 1）。各平台編輯畫面即時以源片 `products[].price`／`salePrice` × `rate` × `mult` 顯示（唯讀） |
| `videoTags` | string[] | 影片標籤清單 |
| `postPlatforms` | object[] | 投放平台 `{name, utm}`，UTM 用 `utm_source` 分平台 |
| `shoplineBase` | string | Shopline 網址（導購連結用） |
| `sources` | string[] | 片源清單 |
| `mainTypes` | string[] | 主類別清單 |
| `reuseWindowDays` | number | 重播熱度視窗 |
| `adminPassword` | string | 管理員登入密碼（預設 1234，可於設定自改） |

**已淘汰（保留不再使用，勿依賴）**：`dailyPublishTarget`、`typeTargets`、`fridayTargets`、`editorDailyQuota`、`kpiStartDate`、`languages`、`materialLowThreshold`、`platforms`、`subTags`、`reuseCap`、`offsiteBackupDir`。

---

## 規則
1. **寫入一律走 `app.js` 的 `newVideoRecord()`／route**，確保每筆影片都是完整一致的結構。
2. 讀取時對缺漏欄位以預設值容錯（`v.field || 預設`）。
3. 改欄位前**先改這份文件**並升 `schemaVersion`；UI／版面改動不影響本結構。
