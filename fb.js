// ===================================================================
// Firebase 資料層 — 連線、匿名登入、Firestore 即時同步
// 只負責「資料進出」；畫面與運算在 app.js。結構見 SCHEMA.md。
// 即時同步：onSnapshot 監聽，任何裝置改資料庫 ~1 秒同步到所有人。
// ===================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
         getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
         query, where, orderBy, limit,
         arrayUnion, arrayRemove, increment }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

// 預設設定（首次啟動且 Firestore 尚無 settings 時寫入）— 對應 SCHEMA.md
const DEFAULT_SETTINGS = {
  schemaVersion: 16,
  adminPassword: "1234",
  mainTypes: ["流量型", "帶貨型", "寵粉"],
  videoTags: ["新片","舊片","每日寵粉","招商","銷售"],
  sources: ["老闆自拍", "外部公司"],
  // 每天上片數（依星期幾 0=日…6=六）：流量／帶貨／寵粉
  weekdayTargets: {
    0:{"流量型":3,"帶貨型":1,"寵粉":0}, 1:{"流量型":3,"帶貨型":1,"寵粉":0}, 2:{"流量型":3,"帶貨型":1,"寵粉":0},
    3:{"流量型":3,"帶貨型":1,"寵粉":0}, 4:{"流量型":3,"帶貨型":1,"寵粉":0}, 5:{"流量型":3,"帶貨型":1,"寵粉":0},
    6:{"流量型":3,"帶貨型":1,"寵粉":0} },
  // 投放平台（顯示名稱 + utm 代號）：導購連結用 utm_source 分帳號
  postPlatforms: [
    { name: "IG 溱姐主（@tzgems1111）",      utm: "ig_tzgems1111" },
    { name: "IG 泰熙爾汗（@tzgems5588）",    utm: "ig_tzgems5588" },
    { name: "IG 英文（@tzgrotwofficial）",  utm: "ig_tzgrotwofficial" },
    { name: "IG 代理（@tzgems666）",         utm: "ig_tzgems666" },
    { name: "IG 官方（@tzgrotw）",           utm: "ig_tzgrotw" },
    { name: "FB 粉專（Zanagems）",           utm: "fb_zanagems" },
    { name: "LINE 社群（珠寶社群）",          utm: "line_group" }
  ],
  scheduleHorizonDays: 30,
  reuseWindowDays: 30,
  shoplineBase: "",
  // 海外二創：TikTok 帳號清單 {locale,name} 與每帳號每日目標
  intlAccounts: [],
  intlDailyTarget: 2,
  // 台灣區換平台二創：蝦皮／馬來西亞 帳號清單（純名稱字串）與每帳號每日目標
  shopeeAccounts: [],
  shopeeDailyTarget: 2,
  msAccounts: [],
  msDailyTarget: 2,
  // 各平台商品價格換算：{key:{code,rate,mult}}；rate＝1 台幣可換多少該幣別（蝦皮固定 1）、mult＝該平台售價加乘倍數
  exchangeRates: { en:{code:"USD",rate:1,mult:1}, th:{code:"THB",rate:1,mult:1}, ms:{code:"MYR",rate:1,mult:1}, shopee:{code:"TWD",rate:1,mult:1} },
  // 審片流程上線日：這天之前完成的舊片不回溯要求審核（避免歷史影片一次全湧進待審清單）
  reviewSince: "2026-07-27",
};

// 尚未填入設定 → 顯示設定指引
if (!firebaseConfig || String(firebaseConfig.apiKey || "").includes("PASTE")) {
  if (window.__needSetup) window.__needSetup();
} else {
  const app = initializeApp(firebaseConfig);
  // 本機快取寫進 IndexedDB：重新整理／隔天重開時先用快取畫面，伺服器只補「有變動」的文件。
  // 這是讀取量的關鍵 —— 用記憶體快取的話，每個人每次重新整理都要把整個資料庫重下載一次
  // （22 個人 × 每天開關幾次 × 上千筆文件，一天就把免費額度 5 萬次讀取燒光）。
  // 即時性不受影響：onSnapshot 照樣連著伺服器，別人一改還是 ~1 秒同步過來。
  // 無痕視窗或瀏覽器不給 IndexedDB 時會丟例外 → 退回記憶體快取，功能一樣只是比較耗讀取。
  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch (e) {
    db = getFirestore(app);
  }
  const auth = getAuth(app);
  const storage = getStorage(app);

  // 本地彙整的原始資料（只訂閱實際用到的集合）
  const raw = { users: [], videos: [], schedule: {}, settings: {}, tasks: {}, shifts: {}, logs: [], products: [], matches: [] };
  // 打卡紀錄會一直長（22 人 × 每個工作天一筆），全部訂閱等於每年多幾千筆要同步。
  // 常駐只訂閱最近 62 天（＝本月＋上個月，薪資報表要用的範圍）；
  // 人資往前翻更早的月份時，再由 loadShiftMonth() 一次性補讀那個月。
  const SHIFT_WINDOW_DAYS = 62;
  const SHIFTS_FROM = new Date(Date.now() + 288e5 - SHIFT_WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
  // 這台裝置上次登入的職位要不要下載影片。
  // 這份清單必須跟 app.js 的 NO_VIDEO_ROLES 一致 —— tests/smoke-v140.js 會比對兩邊。
  // v152：人資移出去了 —— 他要查剪輯的完成狀況（「剪輯成效」分頁），真的用得到影片資料。
  const NO_VIDEO_ROLES = ["mkt", "svc", "ship", "cs"];
  function needVideosByRole() {
    let r = "";
    try { r = localStorage.getItem("ecdr_role") || ""; } catch (e) { return true; }
    return !NO_VIDEO_ROLES.includes(r);   // 沒登入過／看不懂的職位一律下載
  }
  // 操作紀錄只抓最近一個月：at 存的是 "YYYY-MM-DDTHH:MM:SS"，字串比大小就等於比時間
  const LOGS_FROM = new Date(Date.now() + 288e5 - 31 * 864e5).toISOString().slice(0, 10);
  const shiftsLive = {};        // 訂閱窗內（會即時更新）
  const shiftsOld  = {};        // 另外補讀的舊月份（讀一次就好，不會再變）
  const loadedMonths = new Set();
  function mergeShifts() { raw.shifts = Object.assign({}, shiftsOld, shiftsLive); }
  // 直接傳參照即可：app.js 的 decorate() 收到後會立刻深拷貝一份自用，
  // 這裡再拷一次等於每次同步都全量複製兩遍（影片多時手機會有感），故省略。
  // ── 同步節流（v138）────────────────────────────────────────────────
  // 下面掛了六個 onSnapshot，每一個進來都各自 push 一次。開機時六個幾乎同時到，
  // 等於同一份資料被完整重畫六遍 —— 實測剪輯（401 支片在他名下）一次重畫要 0.5 秒，
  // 六次就是三秒多的全畫面凍結，那就是員工說的「很卡」。
  // 批次寫入（bulkRun 一次送 10 筆）也會引發一連串快照，同樣被這裡收斂成一次。
  //
  // 頭一次立刻畫（不然登入畫面會多等），之後同一個窗口內的通通併成最後一次。
  // v153：push 要講清楚「是哪個集合變了」。app.js 拿這個去判斷目前這一頁
  // 吃不吃得到 —— 吃不到就不重繪（實測七成的重繪畫出來一模一樣）。
  // 窗口內併起來的多次變動要**累加**，不能只留最後一個，不然會漏掉。
  const PUSH_GAP = 150;
  let pushTimer = null, lastPush = 0;
  let dirty = Object.create(null);
  function pushNow() {
    lastPush = Date.now(); pushTimer = null;
    const changed = Object.keys(dirty); dirty = Object.create(null);
    if (window.__onState) window.__onState(raw, changed);
  }
  function push(coll) {
    if (coll) dirty[coll] = 1;
    if (pushTimer) return;                       // 這個窗口已經排好了，等它就好
    const since = Date.now() - lastPush;
    if (since >= PUSH_GAP) { pushNow(); return; } // 安靜了一陣子 → 立刻畫
    pushTimer = setTimeout(pushNow, PUSH_GAP - since);
  }

  // ── 連線狀態與「還沒送出去的寫入」 ─────────────────────────────
  //
  // 這一段是補一個很嚴重的洞：Firestore 開了本機快取之後，寫不出去的東西會排隊在
  // 瀏覽器裡，而且**立刻反映在自己的畫面上**。所以會出現「員工看到自己打了卡、
  // 主管看到他沒打卡」——兩邊看的是同一段程式，差別在一邊的資料只存在本機。
  //
  // 更麻煩的是：離線時 setDoc **不會拋錯，而是永遠不 resolve**。所以光靠 try/catch
  // 抓不到任何東西（clockIn 以前就是這樣，錯誤處理形同虛設）。
  //
  // 判斷方式：
  //   fromCache        = 這份快照不是從伺服器來的 → 現在連不上
  //   hasPendingWrites = 本機還有沒送出去的寫入 → 畫面上的東西別人看不到
  // 開機頭幾秒本來就會先給快取，所以「連上過一次之前」不報離線，避免一進來就跳紅字。
  const BOOT_AT = Date.now();
  const BOOT_GRACE = 8000;
  let sawServer = false;
  const net = { online: true, pending: false };
  function netUpdate(meta) {
    if (meta && meta.fromCache === false) sawServer = true;
    const offline = !!(meta && meta.fromCache) && (sawServer || Date.now() - BOOT_AT > BOOT_GRACE);
    const online = !offline;
    const pending = !!(meta && meta.hasPendingWrites);
    if (online === net.online && pending === net.pending) return;
    net.online = online; net.pending = pending;
    if (window.__onNet) { try { window.__onNet({ online, pending }); } catch (e) {} }
  }
  // 瀏覽器自己的離線事件只是輔助：它只知道「有沒有網路」，不知道「連不連得到
  // Firestore」。真正的判斷還是靠上面的 fromCache。
  try {
    window.addEventListener("offline", () => netUpdate({ fromCache: true, hasPendingWrites: net.pending }));
    window.addEventListener("online",  () => { sawServer = false; });
  } catch (e) {}

  // 暴露給 app.js 的寫入介面
  window.DB = {
    // 目前連得上嗎／有沒有東西還沒送出去（app.js 用來顯示警示）
    netState:    () => ({ online: net.online, pending: net.pending }),
    set:         (c, id, o) => setDoc(doc(db, c, id), o),
    update:      (c, id, p) => updateDoc(doc(db, c, id), p),
    del:         (c, id)    => deleteDoc(doc(db, c, id)),
    scheduleSet: (date, o)  => setDoc(doc(db, "schedule", date), o),
    setSettings: (p)        => setDoc(doc(db, "meta", "settings"), p, { merge: true }),
    // 多人同時操作的原子寫入：由伺服器直接加／減陣列元素與數字，
    // 不用「讀出整份 → 改 → 整份寫回」，才不會兩個人同時做時互相蓋掉。
    // 用 setDoc + merge，文件不存在時會自動建立（updateDoc 不會）。
    arrayAdd:    (c, id, field, val) => setDoc(doc(db, c, id), { [field]: arrayUnion(val) },  { merge: true }),
    arrayDel:    (c, id, field, val) => setDoc(doc(db, c, id), { [field]: arrayRemove(val) }, { merge: true }),
    bump:        (c, id, field, n)   => setDoc(doc(db, c, id), { [field]: increment(n) },     { merge: true }),

    // ── 按需載入：這幾件只有部分人要看，不值得每個人每次開系統都下載 ──
    // 影片：777 筆。行銷／客服／出貨／人資的**每一個分頁**畫出來的東西，
    // 有影片資料跟沒有影片資料完全一樣（實測逐頁比對過）—— 他們是純粹白下載。
    // 所以改成「需要的人才訂閱」，由 app.js 依職位呼叫（見 needVideos）。
    // 呼叫幾次都沒關係，已經訂閱了就直接返回。
    watchVideos() {
      if (videosUnsub) return false;
      videosUnsub = onSnapshot(collection(db, "videos"),
        q => { raw.videos = q.docs.map(d => d.data()); push("videos"); });
      return true;
    },
    videosWatched: () => !!videosUnsub,

    // 操作紀錄只有管理員看得到，而且已經 4600 筆、一直在長。
    // 兩個條件**同時**套用：只看最近一個月、而且最多 n 筆。
    // ⚠️ 只用日期不設上限會反過來變慢 —— 這個系統平均一天產生 138 筆操作紀錄，
    //    「最近一個月」＝ 3785 筆／519 KB，比原本的「最近 300 筆／39 KB」多 13 倍。
    //    日期是「不要翻到太舊的」，筆數才是「一次別下載太多」，兩件事都要。
    watchLogs(n) {
      const want = Math.max(1, Math.min(5000, +n || LOGS_DEFAULT));
      if (logsUnsub && want === logsLimit) return false;
      logsLimit = want;
      if (logsUnsub) { try { logsUnsub(); } catch (e) {} }
      logsUnsub = onSnapshot(
        query(collection(db, "logs"), where("at", ">=", LOGS_FROM), orderBy("at", "desc"), limit(want)),
        q => { raw.logs = q.docs.map(d => d.data()); push("logs"); });
      return true;
    },
    logsLimit: () => logsLimit,
    logsFrom: () => LOGS_FROM,

    // ── 影片封面圖（Firebase Storage）──
    // 路徑固定 covers/<影片id>.jpg：一支片一張，重傳就直接蓋掉，不會愈積愈多。
    // cacheControl 設一年＋immutable：每次上傳 getDownloadURL 都會給一組新 token（網址跟著變），
    // 所以舊網址可以放心讓瀏覽器永久快取 —— 22 個人天天翻影片庫也只會下載一次，
    // 這是流量費用的關鍵（不設的話預設只快取 1 小時，等於每天重下載一輪縮圖）。
    coverPath: (id) => "covers/" + String(id) + ".jpg",
    async uploadCover(id, blob) {
      const r = storageRef(storage, "covers/" + String(id) + ".jpg");
      await uploadBytes(r, blob, { contentType: "image/jpeg", cacheControl: "public, max-age=31536000, immutable" });
      return await getDownloadURL(r);
    },
    // 刪不掉不算失敗（可能本來就沒有）：影片那筆的 cover 欄位清掉才是真正的「移除」
    async deleteCover(id) {
      try { await deleteObject(storageRef(storage, "covers/" + String(id) + ".jpg")); return true; }
      catch (e) { return false; }
    },
    // 常駐訂閱的起始日；app.js 用它判斷某個月份要不要另外補讀
    shiftsFrom: SHIFTS_FROM,
    // 補讀某個月的打卡紀錄（只讀一次，不建立訂閱）。回傳有沒有真的去讀。
    async loadShiftMonth(ym) {
      if (!/^\d{4}-\d{2}$/.test(String(ym || "")) || loadedMonths.has(ym)) return false;
      loadedMonths.add(ym);
      const s = await getDocs(query(collection(db, "shifts"),
        where("date", ">=", ym + "-01"), where("date", "<=", ym + "-31")));
      s.docs.forEach(d => { shiftsOld[d.id] = d.data(); });
      mergeShifts(); push("shifts");
      return true;
    },
  };
  const LOGS_DEFAULT = 300;                   // 一次最多抓幾筆操作紀錄（見 watchLogs）
  let logsUnsub = null, logsLimit = LOGS_DEFAULT;
  let videosUnsub = null;                     // 影片按需訂閱（見 watchVideos）

  signInAnonymously(auth).catch(e => { if (window.__authError) window.__authError(e.message); });

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    // 首次：種子 settings；既有：補齊缺漏欄位
    const sref = doc(db, "meta", "settings");
    const snap = await getDoc(sref);
    if (!snap.exists()) { await setDoc(sref, DEFAULT_SETTINGS); }
    else {
      const cur = snap.data() || {}; const patch = {};
      if (!Array.isArray(cur.videoTags) || !cur.videoTags.length) patch.videoTags = DEFAULT_SETTINGS.videoTags;
      if (!cur.weekdayTargets || typeof cur.weekdayTargets !== "object") patch.weekdayTargets = DEFAULT_SETTINGS.weekdayTargets;
      if (!Array.isArray(cur.postPlatforms) || !cur.postPlatforms.length) patch.postPlatforms = DEFAULT_SETTINGS.postPlatforms;
      if (!Array.isArray(cur.shopeeAccounts)) patch.shopeeAccounts = DEFAULT_SETTINGS.shopeeAccounts;
      if (cur.shopeeDailyTarget == null) patch.shopeeDailyTarget = DEFAULT_SETTINGS.shopeeDailyTarget;
      if (!Array.isArray(cur.msAccounts)) patch.msAccounts = DEFAULT_SETTINGS.msAccounts;
      if (cur.msDailyTarget == null) patch.msDailyTarget = DEFAULT_SETTINGS.msDailyTarget;
      if (!cur.exchangeRates || typeof cur.exchangeRates !== "object") patch.exchangeRates = DEFAULT_SETTINGS.exchangeRates;
      else if (!cur.exchangeRates.shopee || cur.exchangeRates.en && cur.exchangeRates.en.mult == null) {
        // v13 升版：既有 exchangeRates 補 mult 與 shopee 欄（保留已填的匯率）
        const up = {}; ["en","th","ms","shopee"].forEach(k => {
          const old = cur.exchangeRates[k] || {};
          up[k] = { code: old.code || DEFAULT_SETTINGS.exchangeRates[k].code, rate: (+old.rate > 0 ? +old.rate : 1), mult: (+old.mult > 0 ? +old.mult : 1) }; });
        patch.exchangeRates = up;
      }
      if (!cur.reviewSince) patch.reviewSince = DEFAULT_SETTINGS.reviewSince;
      // v138：新增 products／matches 兩個集合，兩者都是全新集合、無需回填既有資料，只更新版號
      if (cur.schemaVersion == null || cur.schemaVersion < 16) patch.schemaVersion = 16;
      if (Object.keys(patch).length) await setDoc(sref, patch, { merge: true });
    }

    // 即時訂閱（任一變動即同步到所有人的畫面）
    onSnapshot(sref, d => { raw.settings = d.data() || {}; push("settings"); });
    onSnapshot(collection(db, "users"),    q => { raw.users    = q.docs.map(d => d.data()); push("users"); });
    // 影片：不剪片的職位一筆都不用下載，但**需要的人必須在這裡就開始下載**，
    // 跟其他集合並行。
    // ⚠️ 只靠 app.js 在 render() 裡呼叫 watchVideos() 是不夠的 —— 那要等畫面先畫完，
    //    中間會多出一個「畫面全出來了、影片還在路上」的空窗期。海外同事就是在那幾秒裡
    //    看到空清單、而且做什麼都會「找不到影片」（v138 上線後回報的災情）。
    // 職位存在 localStorage，登入過就有；沒有或看不懂就當作要下載（寧可多下載，不能少）。
    if (needVideosByRole()) window.DB.watchVideos();
    onSnapshot(collection(db, "schedule"), q => { const s = {}; q.docs.forEach(d => s[d.id] = d.data()); raw.schedule = s; push("schedule"); });
    onSnapshot(collection(db, "tasks"),    q => { const s = {}; q.docs.forEach(d => s[d.id] = d.data()); raw.tasks = s; push("tasks"); });
    // 選品配對（v138）：商品庫（選品行銷維護）與配對紀錄，量小，常駐訂閱即可
    onSnapshot(collection(db, "products"), q => { raw.products = q.docs.map(d => d.data()); push("products"); });
    onSnapshot(collection(db, "matches"),  q => { raw.matches  = q.docs.map(d => d.data()); push("matches"); });
    // 打卡紀錄只訂閱最近 62 天；更早的月份由 window.DB.loadShiftMonth() 按需補讀
    // includeMetadataChanges：要拿到 fromCache／hasPendingWrites 才知道「有沒有連上」
    // 與「打卡送出去了沒」。打卡是全公司每天都會寫的東西，拿它當連線狀態的探針最準。
    onSnapshot(query(collection(db, "shifts"), where("date", ">=", SHIFTS_FROM)),
      { includeMetadataChanges: true }, q => {
      Object.keys(shiftsLive).forEach(k => delete shiftsLive[k]);
      q.docs.forEach(d => shiftsLive[d.id] = d.data());
      netUpdate(q.metadata);
      mergeShifts(); push("shifts");
    });
    // 操作紀錄（稽核用）：只有管理員看，改成點進去才訂閱（見 window.DB.watchLogs）
  });
}
