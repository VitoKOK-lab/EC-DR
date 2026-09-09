# 🛟 備份與災難復原

系統的程式碼在 GitHub、資料在 Firebase Firestore（專案 `ec-dr-21416`），
全部都在雲端。這份文件講怎麼把整套抓回你的 Mac mini，以及出事時怎麼救回來。

---

## 一、平常怎麼做

```bash
cd ~/EC-DR
python3 tools/backup.py
```

備份會放在 `~/EC-DR-Backups/ecdr-年月日-時分秒/`。**不用 npm、不用 Firebase CLI、
不用 service account。**

> **複製指令時整行複製就好。** 這份文件裡的指令區塊刻意不放同行註解——
> macOS 的 zsh 在終端機互動模式下**不把 `#` 當註解**，跟著複製會讓 `#`
> 和後面的字被當成參數傳進去，指令就歪了（例如
> `brew install --cask temurin  # 說明` 會變成去找一個叫 `#` 的套件而失敗）。

> macOS 的 `python3` 由 Xcode 命令列工具提供。第一次執行若跳出「需要安裝命令列工具」
> 的視窗，按下安裝等幾分鐘就好，之後都不必再裝。

### 一份備份裡有什麼

```
ecdr-20260909-1430/
  repo.bundle          程式碼＋完整 git 歷史（514 個 commit，可回滾任一版）
  firestore/           9 個集合的原始資料 ← 還原用這份
  readable/            同樣的資料，轉成好讀的 JSON ← 你要打開來看的話看這份
  covers/              影片封面圖
  MANIFEST.json        筆數、每個檔案的 SHA256、備份時間
```

`firestore/` 保留 Firestore 的原始型別格式（看起來像 `{"integerValue": "3"}`），
醜但**不失真**。轉成好看的格式會分不出整數和小數、字串和時間戳，還原時會把資料寫壞。
所以另外存一份 `readable/` 給人看。

### 備份完會自我回驗

每次備份的最後一步會重讀所有檔案、比對 SHA256、確認 JSON 解析得開、筆數對得上。
對不上就直接報錯——不會留下「看起來有備份、真要用才發現是壞的」檔案。

### 常用參數

備到外接硬碟或雲端同步夾：

```bash
python3 tools/backup.py --to /Volumes/隨身碟
```

改保留份數（預設 30）：

```bash
python3 tools/backup.py --keep 60
```

跳過封面圖（快很多）：

```bash
python3 tools/backup.py --no-covers
```

### 建議節奏

| 頻率 | 做什麼 | 為什麼 |
|---|---|---|
| 每天 | `python3 tools/backup.py` | 本機一份 |
| 每週 | `python3 tools/backup.py --to <外接硬碟或 Drive 同步夾>` | Mac mini 整台掛掉時的第二份 |
| 每月 | 照第四節做一次還原演練 | 沒演練過的還原＝沒有還原能力 |

### 佔多少空間、花多少錢

以目前資料量（10,533 筆、241 張封面）：

- 每份備份約 **32 MB**，但封面圖在多份備份間用硬連結共用，
  30 份實際只佔約 **525 MB**（不共用的話要 960 MB）。
- Firestore 讀取：全量備份一次 **10,533 次讀取**。免費額度每天 50,000 次，
  一天備一次佔 21%，加上團隊日常使用仍在免費範圍。
- 每跑一次會在 Firebase Authentication 多一個匿名帳號（跟每台裝置開網頁一樣）。
  不影響權限，累積多了可到主控台批次清除。

> `logs` 目前 7,382 筆，佔全部讀取量的 70%。等它破兩萬筆再考慮改成
> 只抓新的（增量），現在不需要。

---

## 二、出事了怎麼救

| 狀況 | 怎麼做 | 大約多久 |
|---|---|---|
| **程式碼被改壞** | `git log --oneline` → `git checkout <版本>` → 推上 main | 2 分鐘 |
| **GitHub 整個沒了** | `git clone repo.bundle EC-DR` → 建新 repo → 開 Pages | 15 分鐘 |
| **某個集合被誤刪** | `restore.py --only <集合> --confirm` | 1 分鐘 |
| **整個資料庫被刪光** | `restore.py --confirm` | 3 分鐘（實測 10,533 筆） |
| **Mac mini 掛了** | 在新電腦 clone repo，把備份資料夾拷過去 | 20 分鐘 |

### 還原怎麼跑

| 指令 | 作用 |
|---|---|
| `python3 tools/restore.py` | 先看有哪些備份 |
| `python3 tools/restore.py --from <備份資料夾>` | 試跑，不會寫入任何東西 |
| `python3 tools/restore.py --from <…> --confirm` | 確定了才真的寫 |

試跑會印出一張表，講清楚每個集合會發生什麼：

```
  集合         線上現有    備份有    會覆蓋    會新建    會刪除
  videos          991      990      990        0        0
```

### 五道安全設計

1. **預設試跑** — 不加 `--confirm` 絕對不會寫入。
2. **寫入前先備份現況** — 就算現況是壞的也先存一份，還原錯了還有得救。
3. **可以只還原一個集合** — `--only videos`。多數狀況只有一個集合出問題，
   整包倒回去會把其他集合這段期間的**正常新資料一起蓋掉**。
4. **預設不刪任何東西** — 備份裡沒有、線上有的文件會保留。
   要清掉得明確加 `--prune`。
5. **會驗證備份本身** — 備份檔壞掉時直接拒絕，不會拿壞資料去蓋正式資料庫。

### ⚠️ 還原前一定要先停用系統

還原期間如果同仁還在操作：他們的寫入會跟還原打架，而且 `onSnapshot` 會把
還原到一半的半成品即時同步給所有人。

系統目前**沒有維護模式**，最保險的做法是暫時把寫入權限關掉：

1. 編輯 `firebase/firestore.rules`，把 `signedIn()` 暫時改成 `false`
2. 部署：

   ```bash
   cd ~/EC-DR/firebase && firebase deploy --only firestore:rules
   ```

3. 跑還原
4. 把規則改回來，再部署一次

規則生效大約要一分鐘。小團隊的話，口頭喊「大家先不要動」通常也夠用，
但正式的做法是上面那個。

### ⚠️ 封面圖的還原還沒自動化

封面圖**有備份**（在 `covers/`，不會遺失），但 `restore.py` 不會自動傳回 Storage。

原因：重新上傳會拿到**新的下載網址**（token 會變），所以還得同步改寫每支影片的
`cover` 欄位，是另一段工。

實務上影響不大——最常見的災難是 Firestore 文件被刪、Storage 沒事，
這時還原後的影片記錄裡的封面網址仍然有效。只有 Storage 本身被清空才需要
處理封面，那時再手動從 `covers/` 逐張傳回 Firebase 主控台。

---

## 三、Mac mini 整台掛掉：在新電腦重建

只要你手上有備份資料夾（外接硬碟或 Google Drive 那份）：

先還原程式碼：

```bash
cd ~ && git clone <備份>/repo.bundle EC-DR && cd EC-DR
git checkout main
```

再還原資料（Firestore 還在雲端的話這步不用做）：

```bash
python3 tools/restore.py --from <備份> --confirm
```

`repo.bundle` 是完整的 git repo，**不需要網路、不需要 GitHub** 就能還原程式碼
與全部歷史。

---

## 四、每月演練（很重要）

備份最大的風險不是沒做，是**做了但救不回來**。

**演練絕對不要拿正式資料庫做。** 用 Firestore 模擬器，完全不會碰到線上資料。

### 前置：模擬器需要 Java

模擬器是 Java 程式，macOS 預設沒有裝。沒裝會看到：

```
Error: Process `java -version` has exited with code 1.
The operation couldn't be completed. Unable to locate a Java Runtime.
```

裝一次就好，兩種方式擇一：

有 Homebrew 的話：

```bash
brew install --cask temurin
```

沒有 Homebrew 就到 <https://adoptium.net> 下載 macOS 的 `.pkg`，
點兩下照精靈裝完即可。

裝完確認一下，有印出版本號就成功：

```bash
java -version
```

> **備份本身完全不需要 Java**，也不需要 npm。只有這個演練需要。

### 演練步驟

一次性安裝：

```bash
cd ~/EC-DR && npm install --no-save firebase-tools
```

開模擬器。**要在 `firebase/` 目錄裡跑**，才會讀到你的 `firestore.rules`：

```bash
cd ~/EC-DR/firebase
npx firebase emulators:start --only firestore --project ec-dr-21416
```

看到 `firestore: Firestore Emulator logging to firestore-debug.log` 就是起來了。
**這個視窗不要關**，另開一個終端機視窗跑還原：

```bash
cd ~/EC-DR
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
    python3 tools/restore.py --from ~/EC-DR-Backups/<最新那份> --confirm
```

> 在 repo 根目錄跑模擬器會出現 `Could not find config (firebase.json) so using defaults`，
> 那是因為 `firebase.json` 在 `firebase/` 子目錄裡。用預設值也能演練還原，
> 但不會套用你的安全規則，所以建議照上面 `cd firebase` 再跑。

只要設了 `FIRESTORE_EMULATOR_HOST`，腳本就只會打模擬器。畫面上會標示
「🧪 模擬器模式（不會碰到正式資料庫）」——**沒看到這行就不要按下去**。

演練完 `Ctrl + C` 關掉模擬器，資料是暫時的，不留痕跡。

---

## 五、維護：新增集合時要記得

Firestore 不讓用戶端列出集合清單（那是 admin 專用 API），所以備份的集合清單
只能寫死在 `tools/_fs.py` 的 `COLLECTIONS`。

**日後程式新增集合時，要回來補一行，否則新集合不會被備份。**

備份腳本每次都會掃 `fb.js` 與 `app.js`，發現有集合沒列進清單就會出聲警告：

```
  ⚠️  程式裡有集合沒被列入備份清單：newthing
```

看到這行就去 `tools/_fs.py` 補上。

---

## 六、目前資料規模（2026-09 實測）

| 集合 | 筆數 | 掉了會怎樣 |
|---|---:|---|
| `videos` | 990 | 營運停擺，整個影片庫消失 |
| `logs` | 7,382 | 查不到誰改過什麼，可接受 |
| `tasks` | 1,555 | 工作分派全失，要重建 |
| `shifts` | 541 | 班表重來 |
| `schedule` | 33 | 一個月排程重排 |
| `users` | 27 | 全員無法正常使用 |
| `meta` | 1 | **系統行為全亂**，體積最小但最關鍵 |
| `products` / `matches` | 2 / 2 | 影響小 |
| 封面圖 | 241 張 | 影片庫沒有縮圖，可重傳 |

---

## 七、備份救不了的事

備份解決「資料沒了怎麼救回來」，**不解決「資料被看走」**。

系統目前用匿名登入，而這個 repo 是公開的，代表任何人拿到
`firebase-config.js` 都能讀走全部營運資料。詳見
[`firebase/README.md`](firebase/README.md) 的安全性備註——那需要改成
Google 帳號登入 + 白名單才能解決，跟備份是兩件事。
