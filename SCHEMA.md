# EC-DR 資料庫結構（Schema）— 唯一真相來源

> 這份文件定義資料庫的「不變地基」。**版面、UI、流程可以隨時改，但欄位結構以此為準。**
> 任何程式寫入都必須符合這裡的定義；新增欄位要先更新這份文件並升版 `schemaVersion`。

- 資料庫：Firebase Firestore（專案 `ec-dr-21416`）
- 目前版本：**schemaVersion = 15**
- 時間格式：日期 `YYYY-MM-DD`；時間戳 ISO 字串（台灣 UTC+8，例 `2026-06-10T09:30:00`）；時段 `HH:MM`

---

## 1. `videos/{id}` — 影片任務（一支毛片 → 剪輯 → 上片）

文件 ID = `V` + 時間戳(base36) + 3 碼亂數，例 `Vm3x9k2p7q`（**v71 起**）。
舊資料的 `V001`、`V002` 保持不動，兩種格式並存。

> **為什麼不用遞增流水號**：舊版是「掃自己這台看到的最大編號 +1」。兩個人幾乎同時新增，
> 兩邊會算出同一個 ID，後寫的那筆用 `set` 整份覆蓋前一筆 → **先建的影片無聲消失**；
> 也會撞到回收桶裡（已軟刪除、不在同步清單內）的舊編號。改成各自產生、永不重複。

| 欄位 | 型別 | 中文 | 說明 |
|---|---|---|---|
| `id` | string | 系統編號 | 與文件 ID 相同；新資料為 `V`+時間戳+亂數，舊資料為 `V001` |
| `code` | string | 影片編號 | **人看的編號**：民國年＋月日（7 碼）＋當日序號（3 碼），例 `1150728001`。新增時自動產生（含回收桶一起算序號，不會重覆）；舊資料若為空則退回取 `id` 數字（V001→001） |
| `name` | string | 影片貼文文案 | 對外顯示片名以此為主；不填則同 `rawName` |
| `rawName` | string | 原始片名 | 毛片名稱／素材說明 |
| `videoCopy` | string | 影片文案 | 新增影片時輸入 |
| `tags` | string[] | 標籤 | 由 `settings.videoTags` 選；寵粉/代理/流量/帶貨/家庭/理財/投資/教育/個人成長 |
| `subTag` | string | 子標籤 | = `tags[0]`，相容舊資料用 |
| `mainType` | string | 主類別 | `流量型`／`帶貨型`／`寵粉`，由標籤推導，**排程分類用** |
| `source` | string | 片源 | `老闆自拍`／`外部公司`（`settings.sources`） |
| `stage` | string | 階段 | `待處理`→`剪輯中`→`已完成`→`已上片`。畫面上另有虛擬階段「**待審核**」，三個條件同時成立才算：①`stage:已完成` ②`reviewStatus` 空 ③`publishedLink` 空（有上傳網址＝早就上片，不用審），且 `finishedAt` ≥ `settings.reviewSince`（流程上線日，舊片不回溯） |
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
| `reviewStatus` | string | 審核狀態 | Regina／管理員審片：``＝等審／`通過`／`退回`。剪輯完成後等審，通過後剪輯才上傳雲端補連結；剪輯的上班計畫有「審片進度」卡追蹤三種狀態 |
| `reviewNote` | string | 退回原因 | 退回時填，剪輯端會看到 |
| `reviewedBy` | string | 審核人 | |
| `reviewedAt` | string(ISO) | 審核時間 | |
| `reviewAck` | boolean | 已審過通知收起 | 剪輯在審片進度卡按「知道了」收起已審過通知（連結補齊後才能收；審過 7 天自動不顯示） |
| `deleted` | boolean | 軟刪除 | true＝在回收桶（畫面一律隱藏，僅管理員回收桶可見、可復原）。**全員都可刪**（2026-07 起）：任何角色在影片視窗按刪除→進回收桶並記 `deletedBy`；救回／永久刪除只有管理員能做 |
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
> 同時在手上的支數**不設上限**（2026-07 取消原本的全域 3 支上限）；今日完成／下班匯報／管理員每日回報仍為全線合計，拖延警示（剪到第 N 天）照常顯示。
> 源片視窗以 `sourceVideoId` 反查各平台/語言版本卡。
>
> **一次創作／二次創作分工（2026-07 起）**：由 `users.craft` 決定每位剪輯看得到什麼 ——
> 一創只看台灣毛片/原創（待認領池、社群媒體月曆），**看不到二創殼、沒有「建立二創版本」卡、
> 影片視窗不顯示二創版本卡**；二創只看蝦皮/馬來/英/泰版本（四平台月曆＋建立二創版本卡）。
> 安全網：**已認領（剪輯中）的項目不受分工影響**，永遠留在本人的「我的工作」。
>
> **二創封存**：二創版本上片後（`stage="已上片"` 或 `已完成`＋有 `publishedLink`）視為完成任務，
> 不再列在「建立二創版本」的版本 chip 中，改以「已封存 N」摘要顯示；資料仍完整留在資料庫，
> 管理層與人資的清單照常看得到。

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

> **`slots` 一律用原子寫入（v72 起）**：新增用 `arrayUnion`、刪除用 `arrayRemove`（`window.DB.arrayAdd` / `arrayDel`），
> 由伺服器直接加減陣列元素。**不可以再用「讀出整份 → 改 → 整份寫回」** ——
> 兩個人同時排同一天，後寫的會把前一筆整份蓋掉，排片就這樣消失；
> 刪除若用索引，別人同時新增／刪除會讓索引位移，變成刪到別人的排片。
> 同理，`videos.usageHistory` 用 `arrayAdd`／`arrayDel`、`videos.totalUsed` 用 `bump`（`increment`）。

---

## 3. `users/{name}` — 成員

| 欄位 | 型別 | 說明 |
|---|---|---|
| `name` | string | 名字（= 文件 ID） |
| `role` | string | `boss`（管理員）／`manager`（經理人）／`editor`（剪輯）／`intl`（海外剪輯・全英文介面）／`cs`（員工：被交辦工作＋每日匯報，不剪片、沒有一創二創之分）／`hr`（人資：只看團隊看板，純檢視、不能操作） |
| `workStart` / `workEnd` | string | 個人上下班時間（`HH:MM`）。**空＝用全公司那一組**（`settings.workStart/workEnd`） |
| `pw` | string | **舊制的明文密碼**，只剩兩個用途：新成員的預設 `0000`，以及還沒轉換的舊帳號登入。設好新密碼之後一律被寫成 `""`。**任何新程式碼都不要再讀寫這個欄位** |
| `pwHash` | string | **密碼雜湊**，格式 `pbkdf2$<次數>$<鹽 base64>$<雜湊 base64>`（PBKDF2-SHA256、每人一組 16 bytes 隨機鹽、21 萬輪）。算得出來、推不回去 —— 資料庫被讀走也拿不到任何人的真實密碼 |
| `pwSet` | boolean | `false` ＝管理員剛重設過，下次登入一定要再設一次 |
| `pwAt` | string(ISO) | **第一次**設好自己的密碼那一刻＝這個人的**出勤起算時間**。這天之前的打卡只留著參考，不判遲到早退。第二次以後改密碼不會覆蓋它；在這個欄位出現之前就改過密碼的舊帳號，下次登入時由 `ensurePwAt()` 自動補上 |
| `flexHours` | boolean | 變動工時：只記上下班與工時，**不判遲到早退**。未設定時 `role=hr` 視為 `true`、其他人 `false`（管理員可在設定 → 成員逐一調整） |
| `devices` | object[] | 用過的打卡裝置 `{id, ua, mobile, firstAt}`。**第一次用就自動記起來，不需要核准**；換新裝置時出勤頁會提醒人資 |
| `craft` | string | 剪輯分工：`orig`（一次創作：毛片/原創）／`derived`（二次創作：蝦皮·馬來·英·泰版本）／`both`（兩種都做）。未設定時：一般剪輯＝`orig`、海外剪輯＝`derived`；管理員/經理人/人資固定看全部 |
| `intlLocale` | string | 海外剪輯綁定語言 | `en`／`th`／`ms`（僅 `role=intl` 用；未設定＝`en`）。帳號綁語言：只做/只看該語言 |
| `isDefault` | boolean | 系統預設旗標 |

> 管理員（Vito）以「🔒 管理員登入」進入，不需建 user 文件。

---

## 3b. `tasks/{id}` — 交辦工作與 HR 通知（每日）

文件 ID = `T<base36 時間戳>`（交辦）／`N<base36 時間戳>`（HR 通知）。
同一個集合用 `kind` 分流：**沒有 `kind`＝交辦工作**、**`kind:"notice"`＝HR 通知**。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | string | 文件 ID |
| `kind` | string | 空＝交辦工作；`notice`＝HR 通知 |
| `user` | string | 對象（= users.name） |
| `date` | string | `YYYY-MM-DD`，當天計畫 |
| `title` | string | 工作項目／通知內容 |
| `contact` | string | 對接窗口（選填，通知不用） |
| `report` | string | 回報狀況（進度；通知不用） |
| `done` | boolean | 完成打勾（false=進行中；通知恆為 false） |
| `assignedBy` | string | 交辦人／發通知的人（空＝自己建立的） |
| `ack` | boolean | 已按「收到」（自己建立的直接 true） |
| `ackAt` | string(ISO) | 按下收到的時間 |
| `doneAt` | string(ISO) | 打勾完成的時間 |
| `createdAt` | string(ISO) | 建立時間 |

> **主管交辦（v67 更名，原「老闆指派」）**：Regina／管理員在「流程中控」或「儀表板」派工，
> 對方的工作頁會出現，按小小的「**收到**」開始執行，填滿 12 字處理狀況才能打勾完成。
>
> **HR 通知（v67 新增）**：人資在「團隊看板」的發送卡選一位同仁或**全體同仁**送出，
> 寫成 `kind:"notice"` 的文件。對方工作頁最上面出現 📣 通知卡，**只要按小小的「收到」**，
> 不用回報、不能打勾完成、**不計入任何人的交辦成效**（所有統計都先用 `realTasks()` 濾掉通知）。
> 今天發的都看得到；以前發但還沒按收到的會一直留著，不會漏看。
> 人資在看板可以看到每則通知「已收到 x/y」與是誰收了，也可以收回發錯的通知。


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

## 3e. ~~`hrchecks/{videoId}`~~ — 已停用（v64）

人資改成**只看成效、不做任何記錄**，程式已不再讀寫這個集合，也不再訂閱它。
Firestore 裡既有的舊文件留著不影響任何功能，可自行刪除。

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
| `autoOut` | boolean | 這筆下班是系統補登的（當天忘了打，隔天登入時以下班時間補上） |
| `inDev` / `outDev` | string | 打卡裝置代碼（瀏覽器產生並記在該裝置上）。同一台裝置幫多人打卡時，出勤頁會示警 |
| `inMobile` / `outMobile` | boolean | 是不是用手機打的 |
| `inDevUA` / `outDevUA` | string | 裝置摘要，例 `Windows・Chrome`。裝置代碼清快取會變，這串不會，人資對照時看得出是不是同一台機器 |
| `inNewDev` | boolean | 這個人第一次用這台裝置打卡（出勤頁會提醒人資去關心） |
| `issueNote` / `issueAt` | string | 遲到／早退／忘了打下班時，**本人填的原因**與填寫時間 |
| `inGeo` / `outGeo` | object | 打卡當下的座標 `{lat,lng,acc}`；拿不到或使用者不授權就是 `null`，**不影響打卡** |

### `tasks.kind` — 同一個集合裝三種東西

| `kind` | 是什麼 | 誰建立 | 誰要處理 |
|---|---|---|---|
| （沒有這個欄位） | **交辦／自己排的工作** | 主管交辦，或員工自己新增 | 員工按「收到」→ 寫處理狀況（滿 12 字）→ 打勾完成 |
| `"notice"` | **HR 通知** | 人資／管理員 | 員工按「收到」，可以順手文字回覆 |
| `"msg"` | **員工主動發的私人訊息**（v83） | 員工／人資自己 | 收件人（人資或主管）**一定要回覆** |

判斷用 `isTask()`（＝沒有 `kind`）、`isNotice()`、`isMsg()`。
**只算交辦成效的地方一律走 `realTasks()`／`isTask()`**，不要寫 `!isNotice(t)` —— 以後再多一種
`kind` 就會漏掉，混進「交辦完成」的數字裡。

`kind:"msg"` 的欄位：`to`（`"hr"` 或 `"boss"`）、`title`（訊息內容）、
`reply` / `replyBy` / `replyAt`（收件人的回覆）、`seen`（發訊的人看過回覆了沒）。
誰收得到由 `msgInboxFor(role)` 決定：人資收 `to:"hr"`、經理人收 `to:"boss"`、
**管理員兩種都收得到**（人資由管理員考核）。還沒被回覆之前，發訊的人可以自己收回。

> **打卡「只記錄不擋」（v76 起）**：沒有任何一種網頁打卡擋得住有心作弊 ——
> GPS 可以用假定位 App、公司 IP 用手機 4G 就繞過去。所以系統一律讓打卡成功，
> 只把裝置、是不是手機、座標與離公司多遠記下來，在出勤頁標出異常讓人資判斷。
> 要改成「擋」只需要在打卡前加條件，資料結構不用動。

> **什麼時候開始算遲到早退（v81 起）**：`shifts` 一直照實記，但**判定**要通過 `attendCounted()`：
> 那天必須 ≥ `attendStartOf(user)`（＝`users.pwAt` 與 `settings.attendStart` 取較晚者），
> 而且那個人不是變動工時（`users.flexHours`）。不通過就是 `late=0 / early=0`、`attIssues()` 回空陣列，
> 畫面上寫「未列入計算」。**正式啟用前的舊紀錄因此自動不算，不需要去刪資料。**


> 單片工時（認領→完成）由 `videos.claimedAt`／`finishedAt`／`durationMin` 衍生，亦只給管理員看（「工時/KPI」頁）。

---

> **團隊看板（v66 起，全員都看得到）**：分頁「團隊看板」，**純檢視、沒有任何按鍵**，也不會寫入任何資料。
> ①**今日成效**：每人一張卡（出勤時間與工時、今日完成、進行中、交辦完成 x/y；每一件交辦顯示**誰交辦的**、
> 有沒有接收、做完沒、處理狀況）。②**本月成效**：一張表（完成上架、剪片速度、平均工時、帶商品、出勤天數、交辦完成）。
> 全部由 `videos`／`shifts`／`tasks` 即時算出來。**人資（`role:"hr"`）只有這一頁**。
>
> **員工（`role:"cs"`，v66 起；v69 由「客服」更名）**：分頁只有「本日工作」與「團隊看板」。本日工作＝交辦工作卡＋下班匯報，
> 完全沒有毛片／影片／排程，也沒有一創二創之分；常用項目是（回覆客戶訊息、訂單處理／出貨、退換貨處理、客訴追蹤、商品資訊更新）。
> 登入即打上班卡，按「下班匯報」彙整當日工作項目與處理狀況後打下班卡 —— 這就是每日工作匯報。
> Regina 在「流程中控」與「儀表板」可以交辦並看回報；毛片指派清單**不含**這類員工。
>
> **顯示順序（全站一致）**：一次創作 → 兩種都做 → 二次創作 → 員工（不剪片） → **海外一律排最後**；同組內中文名在前、英文名在後。
> 團隊看板的今日成效卡在桌機一排 4 人（1400px 以下 3 人、1040px 以下 2 人、手機單欄）。

---

## 4. `meta/settings` — 全域設定（單一文件）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `schemaVersion` | number | 結構版本（目前 9） |
| `dailyTarget` | number | **每日應上片數（單一數字，不分類型）**；月排程以此判斷已排滿／缺幾支。未設定時沿用 `weekdayTargets` 加總 |
| `weekdayTargets` | map | （舊）`{0..6: {流量型, 帶貨型, 寵粉}}` 每星期幾各類型上片數；已被 `dailyTarget` 取代，僅作未設定時的後備加總 |
| `reviewSince` | string | 審片流程上線日 `YYYY-MM-DD`；這天之前完成的舊片不列入待審核（預設 `2026-07-27`） |
| `workStart` / `workEnd` | string | **全公司**上下班時間 `HH:MM`（預設 09:00 / 18:00）；個人例外放在 `users.workStart/workEnd` |
| `lateGraceMin` | number | 遲到寬限分鐘（預設 10）。超過上班時間 + 寬限才算遲到 |
| `attendStart` | string | **全公司**出勤起算日 `YYYY-MM-DD`（選填）。留白＝各人以自己的 `users.pwAt` 起算；有填則兩者**取比較晚**的那一天 |

| `pcOnly` | boolean | 只能用電腦登入（預設 `true`）。一般員工用手機會被擋在登入頁；經理人／人資／管理員不受限 |
| `officeGeo` | object | 公司座標 `{lat,lng}`（選填）。有填才會在出勤頁標出「打卡地點離公司 N 公尺」 |
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

---

## 8. 開發／測試

- **離線煙霧測試**：`node tests/run-all.js`（語法檢查 ＋ 18 套角色/流程斷言 ＋ 中英介面洩漏掃描）。
  每支 `tests/smoke-*.js` 用假的 `document`／`localStorage` 把 `app.js` eval 進來，直接呼叫 view 函式驗證輸出，
  不需瀏覽器、不連資料庫。改完 `app.js` 一定要跑過再上版。
- **CI**：`.github/workflows/tests.yml` 在每次 push／PR 自動跑同一支腳本。
- **語言洩漏掃描**：`tests/audit-lang.js` 把測試資料全換成英數，掃 intl 視角殘留的中文與中文視角殘留的英文 UI 詞；
  標籤（寵粉／珠寶介紹…）與階段內部值屬設計例外，已列在該檔的 `ALLOW` 清單。

---

## 讀取量與訂閱策略（v82）

Firestore 是**按「讀了幾筆文件」計費**的，不是按流量。這一節寫下每一筆訂閱為什麼長這樣，
改動前請先算一次「22 個人 × 每天開關幾次 × 這一次要讀幾筆」。

| 集合 | 怎麼訂閱 | 為什麼 |
|---|---|---|
| `meta/settings` | 常駐（1 筆） | 每個畫面都要用 |
| `users` | 常駐全量 | 22 筆，很小 |
| `videos` | 常駐全量 | 目前 407 筆，是最大宗。所有角色的畫面都要用，沒辦法只讀一部分 |
| `schedule` | 常駐全量 | 一天一筆，很小 |
| `tasks` | 常駐全量 | 交辦與 HR 通知，要即時 |
| `shifts` | **常駐只訂閱最近 62 天**；更早的月份由 `window.DB.loadShiftMonth(ym)` 補讀一次 | 22 人 × 每個工作天一筆，一年會長到 5,000 筆以上。62 天＝本月＋上個月，薪資報表要的範圍 |
| `logs` | **點進「操作紀錄」才訂閱**（`window.DB.watchLogs()`），最近 300 筆 | 只有管理員看得到，卻要 300 筆。以前是每個人一進系統就白讀 300 筆 |

**本機快取（最關鍵的一項）**：`initializeFirestore(app, {localCache: persistentLocalCache(...)})`
把快取寫進 IndexedDB。重新整理或隔天重開時先用快取畫面，伺服器只補「有變動」的文件。
**不要改回 `getFirestore(app)`** —— 那是記憶體快取，等於每個人每次重新整理都把整個資料庫重下載一次。
即時性不受影響：`onSnapshot` 照樣連著伺服器，別人一改還是 ~1 秒同步過來。
無痕視窗或瀏覽器不給 IndexedDB 時會丟例外，已經 try/catch 退回記憶體快取。

---

## 密碼（v84 起只存雜湊）

```
pbkdf2$210000$<鹽 base64>$<雜湊 base64>
```

PBKDF2-SHA256、每人一組 16 bytes 隨機鹽、21 萬輪。同一組密碼算兩次結果不同（鹽不同），
**系統知道你密碼對不對，但系統自己也不知道你的密碼是什麼**。

| 函式 | 做什麼 |
|---|---|
| `pwMakeHash(pw)` | 產生一組新的雜湊（自帶隨機鹽） |
| `pwVerifyHash(pw, stored)` | 比對；格式壞掉、空字串、被竄改都回 `false`，不會丟例外 |
| `pwCheck(u, input)` | **登入用**。有 `pwHash` 就比對雜湊；沒有（舊帳號）才比對明文 `pw` |
| `pwRuleError(a, b)` | 新密碼的規定：至少 `PW_MIN`（6）碼、不能全是 0、兩次要一致 |

**誰會被要求重設**：`mustSetPw()` ＝ `pwSet===false`（管理員剛重設）**或沒有 `pwHash`**。
v84 上線時沒有人有 `pwHash`，所以**全員下次登入都會被要求設一組 6 碼以上的新密碼**，
設完就只剩雜湊、明文被清成 `""`。舊帳號在設之前還是用原本的密碼登入，不會被鎖在外面。

**改動時注意**
- 不要把 `PW_ITER` 調小，也不要拿掉隨機鹽 —— 那等於讓暴力破解變快、還能一次破所有人。
- 管理員重設密碼（`resetMemberPw`）**一定要同時把 `pwHash` 清成 `""`**，
  否則舊雜湊還在，重設等於沒用。
- 雜湊要靠 `crypto.subtle`，只在 HTTPS 或 localhost 底下才有。GitHub Pages 是 HTTPS，沒問題。

**還沒處理的**：`settings.adminPassword`（管理員自己的登入密碼）**仍然是明文**，
而且會被印在「設定」頁的輸入框裡。要一起改的話，設定頁就不能再顯示原本的密碼
（忘記就只能從資料庫改），這是刻意留下的取捨。
