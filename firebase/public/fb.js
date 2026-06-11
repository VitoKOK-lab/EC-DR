// ===================================================================
// Firebase 資料層 — 連線、匿名登入、Firestore 即時同步
// 只負責「資料進出」；畫面與運算在 app.js。結構見 SCHEMA.md。
// 讀取最佳化：本機快取(persistent cache) → 重新整理只抓「有變動的」。
// ===================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
         getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// 預設設定（首次啟動且 Firestore 尚無 settings 時寫入）— 對應 SCHEMA.md
const DEFAULT_SETTINGS = {
  schemaVersion: 2,
  adminPassword: "1234",
  mainTypes: ["流量型", "帶貨型", "寵粉"],
  videoTags: ["寵粉","代理","流量","帶貨","家庭","理財","投資","教育","個人成長"],
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
};

// 尚未填入設定 → 顯示設定指引
if (!firebaseConfig || String(firebaseConfig.apiKey || "").includes("PASTE")) {
  if (window.__needSetup) window.__needSetup();
} else {
  const app = initializeApp(firebaseConfig);
  // 本機快取：重新整理／重開時優先用快取，伺服器只傳「有變動」的文件 → 大幅降低讀取數
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    db = getFirestore(app); // 萬一瀏覽器不支援 IndexedDB，退回一般模式
  }
  const auth = getAuth(app);

  // 本地彙整的原始資料（只訂閱實際用到的集合）
  const raw = { users: [], videos: [], schedule: {}, settings: {} };
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
      if (cur.schemaVersion == null) patch.schemaVersion = 2;
      if (Object.keys(patch).length) await setDoc(sref, patch, { merge: true });
    }

    // 即時訂閱（任一變動即同步到所有人的畫面）
    onSnapshot(sref, d => { raw.settings = d.data() || {}; push(); });
    onSnapshot(collection(db, "users"),    q => { raw.users    = q.docs.map(d => d.data()); push(); });
    onSnapshot(collection(db, "videos"),   q => { raw.videos   = q.docs.map(d => d.data()); push(); });
    onSnapshot(collection(db, "schedule"), q => { const s = {}; q.docs.forEach(d => s[d.id] = d.data()); raw.schedule = s; push(); });
  });
}
