// ===================================================================
// Firebase 資料層 — 連線、匿名登入、Firestore 即時同步
// 只負責「資料進出」；畫面與運算在 app.js。結構見 SCHEMA.md。
// 即時同步：onSnapshot 監聽，任何裝置改資料庫 ~1 秒同步到所有人。
// ===================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
         getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// 預設設定（首次啟動且 Firestore 尚無 settings 時寫入）— 對應 SCHEMA.md
const DEFAULT_SETTINGS = {
  schemaVersion: 13,
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
  // 蝦皮二創（國內、換平台重剪）：帳號清單（純名稱字串）與每帳號每日目標
  shopeeAccounts: [],
  shopeeDailyTarget: 2,
  // 各平台商品價格換算：{key:{code,rate,mult}}；rate＝1 台幣可換多少該幣別（蝦皮固定 1）、mult＝該平台售價加乘倍數
  exchangeRates: { en:{code:"USD",rate:1,mult:1}, th:{code:"THB",rate:1,mult:1}, ms:{code:"MYR",rate:1,mult:1}, shopee:{code:"TWD",rate:1,mult:1} },
};

// 尚未填入設定 → 顯示設定指引
if (!firebaseConfig || String(firebaseConfig.apiKey || "").includes("PASTE")) {
  if (window.__needSetup) window.__needSetup();
} else {
  const app = initializeApp(firebaseConfig);
  // 本機快取：重新整理／重開時優先用快取，伺服器只傳「有變動」的文件 → 大幅降低讀取數
  // 一般記憶體快取（不持久化到 IndexedDB）→ 每次載入都抓最新，避免舊資料殘留造成不同步
  const db = getFirestore(app);
  const auth = getAuth(app);

  // 本地彙整的原始資料（只訂閱實際用到的集合）
  const raw = { users: [], videos: [], schedule: {}, settings: {}, tasks: {}, shifts: {}, logs: [] };
  function push() { if (window.__onState) window.__onState(JSON.parse(JSON.stringify(raw))); }

  // 暴露給 app.js 的寫入介面
  window.DB = {
    set:         (c, id, o) => setDoc(doc(db, c, id), o),
    update:      (c, id, p) => updateDoc(doc(db, c, id), p),
    del:         (c, id)    => deleteDoc(doc(db, c, id)),
    scheduleSet: (date, o)  => setDoc(doc(db, "schedule", date), o),
    setSettings: (p)        => setDoc(doc(db, "meta", "settings"), p, { merge: true }),
  };

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
      if (!cur.exchangeRates || typeof cur.exchangeRates !== "object") patch.exchangeRates = DEFAULT_SETTINGS.exchangeRates;
      else if (!cur.exchangeRates.shopee || cur.exchangeRates.en && cur.exchangeRates.en.mult == null) {
        // v13 升版：既有 exchangeRates 補 mult 與 shopee 欄（保留已填的匯率）
        const up = {}; ["en","th","ms","shopee"].forEach(k => {
          const old = cur.exchangeRates[k] || {};
          up[k] = { code: old.code || DEFAULT_SETTINGS.exchangeRates[k].code, rate: (+old.rate > 0 ? +old.rate : 1), mult: (+old.mult > 0 ? +old.mult : 1) }; });
        patch.exchangeRates = up;
      }
      if (cur.schemaVersion == null || cur.schemaVersion < 13) patch.schemaVersion = 13;
      if (Object.keys(patch).length) await setDoc(sref, patch, { merge: true });
    }

    // 即時訂閱（任一變動即同步到所有人的畫面）
    onSnapshot(sref, d => { raw.settings = d.data() || {}; push(); });
    onSnapshot(collection(db, "users"),    q => { raw.users    = q.docs.map(d => d.data()); push(); });
    onSnapshot(collection(db, "videos"),   q => { raw.videos   = q.docs.map(d => d.data()); push(); });
    onSnapshot(collection(db, "schedule"), q => { const s = {}; q.docs.forEach(d => s[d.id] = d.data()); raw.schedule = s; push(); });
    onSnapshot(collection(db, "tasks"),    q => { const s = {}; q.docs.forEach(d => s[d.id] = d.data()); raw.tasks = s; push(); });
    onSnapshot(collection(db, "shifts"),   q => { const s = {}; q.docs.forEach(d => s[d.id] = d.data()); raw.shifts = s; push(); });
    // 操作紀錄（稽核用）：只訂閱最近 300 筆，避免無限成長
    onSnapshot(query(collection(db, "logs"), orderBy("at", "desc"), limit(300)), q => { raw.logs = q.docs.map(d => d.data()); push(); });
  });
}
