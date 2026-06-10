# EC-DR 資料庫結構（Schema）— 唯一真相來源

> 這份文件定義資料庫的「不變地基」。**版面、UI、流程可以隨時改，但欄位結構以此為準。**
> 任何程式寫入都必須符合這裡的定義；新增欄位要先更新這份文件並升版 `schemaVersion`。

- 資料庫：Firebase Firestore（專案 `ec-dr-21416`）
- 目前版本：**schemaVersion = 1**
- 時間格式：日期 `YYYY-MM-DD`；時間戳 ISO 字串（台灣 UTC+8，例 `2026-06-10T09:30:00`）；時段 `HH:MM`

---

## 1. `videos/{id}` — 影片任務（一支毛片 → 剪輯 → 上片）

文件 ID = `V001`、`V002`…（系統遞增產生）。

| 欄位 | 型別 | 中文 | 說明 |
|---|---|---|---|
| `id` | string | 編號 | 與文件 ID 相同，`V001` |
| `name` | string | 成品名稱 | 影片標題 |
| `rawName` | string | 原片／內容 | 毛片素材、主題、重點說明 |
| `tags` | string[] | 標籤 | 由 `settings.videoTags` 選；寵粉/代理/流量/帶貨/家庭/理財/投資/教育/個人成長 |
| `subTag` | string | 子標籤 | = `tags[0]`，相容舊資料用 |
| `mainType` | string | 主類別 | `流量型`／`帶貨型`／`寵粉`，由標籤推導，**排程分類用** |
| `source` | string | 片源 | `老闆自拍`／`外部公司`（`settings.sources`） |
| `stage` | string | 階段 | `待處理`→`剪輯中`→`已完成`→`已上片` |
| `editor` | string | 剪輯人員 | 成員名字（對應 `users`） |
| `claimedBy` | string | 認領人 | 拉下來剪的人 |
| `claimedAt` | string(ISO) | 認領時間 | |
| `finishedAt` | string(ISO) | 完成時間 | 完成上架的時間（排序、KPI 用） |
| `durationMin` | number\|null | 剪輯耗時 | 分鐘（認領→完成） |
| `scheduledDate` | string\|null | 上片日期 | `YYYY-MM-DD` |
| `publishTime` | string | 上片時間 | `HH:MM`（10:00/12:00/16:00） |
| `platforms` | string[] | 投放平台 | 對應 `settings.postPlatforms[].name` |
| `product` | string | 商品品名 | 這支在賣的商品 |
| `price` | number | 單價 | |
| `productUrl` | string | 商品頁網址 | 導購連結基底（+ `?utm_source=平台`） |
| `driveFolder` | string | 存檔位置 | 雲端備份連結（同一支重播都一樣） |
| `publishedLink` | string | 上傳連結 | 社群貼文網址 |
| `socialLink` | string | 社群預排連結 | 排程工具／預約貼文（選填） |
| `usageHistory` | object[] | 重播紀錄 | 每筆 `{date, link, drive, time, by, at}` |
| `totalUsed` | number | 重播次數 | |
| `locked` | boolean | 鎖定 | 完成上架後鎖定 |
| `published` | boolean | 已上架 | 完成確認旗標 |
| `backupDone` | boolean | 已備份 | 完成確認旗標 |
| `socialScheduled` | boolean | 已預排 | 完成確認旗標 |

**衍生（不存資料庫，前端即時算）**：`last30dUsed`、`light`（重播熱度）、`isNewVideo`（上片 45 天內為新片）。

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
| `role` | string | `boss`（管理員）／`editor`（剪輯） |
| `isDefault` | boolean | 系統預設旗標 |

> 管理員（Vito）以「🔒 管理員登入」進入，不需建 user 文件。

---

## 4. `meta/settings` — 全域設定（單一文件）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `schemaVersion` | number | 結構版本（目前 1） |
| `weekdayTargets` | map | `{0..6: {流量型, 帶貨型, 寵粉}}`，每星期幾各類型上片數（0=日…6=六） |
| `scheduleHorizonDays` | number | 預排天數視窗 |
| `videoTags` | string[] | 影片標籤清單 |
| `postPlatforms` | object[] | 投放平台 `{name, utm}`，UTM 用 `utm_source` 分平台 |
| `shoplineBase` | string | Shopline 網址（導購連結用） |
| `sources` | string[] | 片源清單 |
| `mainTypes` | string[] | 主類別清單 |
| `subTags` | map | 各主類別的子標籤 |
| `reuseWindowDays` / `reuseCap` | number | 重播熱度視窗／上限 |

**已淘汰（保留不再使用，勿依賴）**：`dailyPublishTarget`、`typeTargets`、`fridayTargets`、`editorDailyQuota`、`kpiStartDate`、`languages`、`materialLowThreshold`、`platforms`、`adminPassword`、`offsiteBackupDir`。

---

## 規則
1. **寫入一律走 `app.js` 的 `newVideoRecord()`／route**，確保每筆影片都是完整一致的結構。
2. 讀取時對缺漏欄位以預設值容錯（`v.field || 預設`）。
3. 改欄位前**先改這份文件**並升 `schemaVersion`；UI／版面改動不影響本結構。
