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
  const shiftsLive = {};        // 訂閱窗內（會即時更新）
  const shiftsOld  = {};        // 另外補讀的舊月份（讀一次就好，不會再變）
  const loadedMonths = new Set();
  function mergeShifts() { raw.shifts = Object.assign({}, shiftsOld, shiftsLive); }
  // 直接傳參照即可：app.js 的 decorate() 收到後會立刻深拷貝一份自用，
  // 這裡再拷一次等於每次同步都全量複製兩遍（影片多時手機會有感），故省略。
  function push() { if (window.__onState) window.__onState(raw); }

  // 暴露給 app.js 的寫入介面
  window.DB = {
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

    // ── 按需載入：這兩件只有少數人偶爾要看，不值得每個人每次開系統都下載 ──
    // 操作紀錄只有管理員看得到，卻是 300 筆。改成他點進「操作紀錄」才訂閱。
    // 要查更早的就用更大的 n 再呼叫一次（舊的訂閱會先關掉，不會變成兩條）。
    watchLogs(n) {
      const want = Math.max(1, Math.min(5000, +n || logsLimit));
      if (logsUnsub && want === logsLimit) return false;
      logsLimit = want;
      if (logsUnsub) { try { logsUnsub(); } catch (e) {} }
      logsUnsub = onSnapshot(query(collection(db, "logs"), orderBy("at", "desc"), limit(want)),
        q => { raw.logs = q.docs.map(d => d.data()); push(); });
      return true;
    },
    logsLimit: () => logsLimit,

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
      mergeShifts(); push();
      return true;
    },
  };
  let logsUnsub = null, logsLimit = 300;

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
    onSnapshot(sref, d => { raw.settings = d.data() || {}; push(); });
    onSnapshot(collection(db, "users"),    q => { raw.users    = q.docs.map(d => d.data()); push(); });
    onSnapshot(collection(db, "videos"),   q => { raw.videos   = q.docs.map(d => d.data()); push(); });
    onSnapshot(collection(db, "schedule"), q => { const s = {}; q.docs.forEach(d => s[d.id] = d.data()); raw.schedule = s; push(); });
    onSnapshot(collection(db, "tasks"),    q => { const s = {}; q.docs.forEach(d => s[d.id] = d.data()); raw.tasks = s; push(); });
    // 選品配對（v138）：商品庫（選品行銷維護）與配對紀錄，量小，常駐訂閱即可
    onSnapshot(collection(db, "products"), q => { raw.products = q.docs.map(d => d.data()); push(); });
    onSnapshot(collection(db, "matches"),  q => { raw.matches  = q.docs.map(d => d.data()); push(); });
    // 打卡紀錄只訂閱最近 62 天；更早的月份由 window.DB.loadShiftMonth() 按需補讀
    onSnapshot(query(collection(db, "shifts"), where("date", ">=", SHIFTS_FROM)), q => {
      Object.keys(shiftsLive).forEach(k => delete shiftsLive[k]);
      q.docs.forEach(d => shiftsLive[d.id] = d.data());
      mergeShifts(); push();
    });
    // 操作紀錄（稽核用）：只有管理員看，改成點進去才訂閱（見 window.DB.watchLogs）
  });
}
