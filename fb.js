// ===================================================================
// Firebase 資料層（模組）— 連線、匿名登入、Firestore 即時同步
// 這支只負責「資料進出」；畫面與運算在 app.js。
// 讀取最佳化：本機快取(persistent cache) → 重新整理只抓「有變動的」而非整庫重讀。
// ===================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
         getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
         addDoc, query, orderBy, where, limit, getDocs }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// 預設設定（首次啟動且 Firestore 尚無 settings 時寫入）
const DEFAULT_SETTINGS = {
  adminPassword: "1234",
  mainTypes: ["流量型", "帶貨型", "寵粉"],
  videoTags: ["寵粉","代理","流量","帶貨","家庭","理財","投資","教育","個人成長"],
  subTags: { "流量型": ["名人話題","珠寶知識","家庭","理財"], "帶貨型": ["新品","促銷","開箱","寵粉"], "寵粉": ["寵粉日","回饋","社群限定","開箱"] },
  typeTargets: { "流量型": 3, "帶貨型": 1 },        // 平日每日各類型最低
  fridayTargets: { "寵粉": 5 },                      // 週五固定寵粉日
  sources: ["老闆自拍", "外部公司"],
  languages: ["zh"],
  dailyPublishTarget: 4,
  editorDailyQuota: 3,
  scheduleHorizonDays: 30,
  kpiStartDate: new Date().toISOString().slice(0,10),
  platforms: ["ig","fb","youtube","tk","wapp","line","threads"],
  reuseCap: 3,
  reuseWindowDays: 30,
  materialLowThreshold: 5,
};

// 只載入近 N 天的日報／交辦，避免歷史越積越多、每次載入讀爆配額
const HISTORY_DAYS = 150;
const HISTORY_CUTOFF = new Date(Date.now() - HISTORY_DAYS*86400000).toISOString().slice(0,10);

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

  // 本地彙整的原始資料；任一集合變動就推給畫面
  const raw = { users: [], products: [], videos: [], schedule: {}, settings: {}, platforms: [], tasks: [], reports: [], messages: [] };
  function push() { if (window.__onState) window.__onState(JSON.parse(JSON.stringify(raw))); }

  // 暴露給 app.js 的寫入介面
  window.DB = {
    set:         (c, id, o) => setDoc(doc(db, c, id), o),
    update:      (c, id, p) => updateDoc(doc(db, c, id), p),
    del:         (c, id)    => deleteDoc(doc(db, c, id)),
    scheduleSet: (date, o)  => setDoc(doc(db, "schedule", date), o),
    setSettings: (p)        => setDoc(doc(db, "meta", "settings"), p, { merge: true }),
    addAudit:    (entry)    => addDoc(collection(db, "audit"), entry),
    recentAudit: async (n)  => {
      const q = query(collection(db, "audit"), orderBy("ts", "desc"), limit(n || 300));
      const s = await getDocs(q);
      return s.docs.map(d => d.data());
    },
  };

  signInAnonymously(auth).catch(e => { if (window.__authError) window.__authError(e.message); });

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    // 首次：種子 settings
    const sref = doc(db, "meta", "settings");
    const snap = await getDoc(sref);
    if (!snap.exists()) { await setDoc(sref, DEFAULT_SETTINGS); }
    else {
      const cur = snap.data() || {};
      const mt = Array.isArray(cur.mainTypes) ? cur.mainTypes : DEFAULT_SETTINGS.mainTypes;
      if (!mt.includes("寵粉")) {
        const subTags = cur.subTags || {};
        if (!subTags["寵粉"]) subTags["寵粉"] = DEFAULT_SETTINGS.subTags["寵粉"];
        await setDoc(sref, { mainTypes: [...mt, "寵粉"], subTags }, { merge: true });
      }
      if (!Array.isArray(cur.videoTags) || !cur.videoTags.length) {
        await setDoc(sref, { videoTags: DEFAULT_SETTINGS.videoTags }, { merge: true });
      }
    }

    // 即時訂閱（任一變動即同步到所有人的畫面）
    onSnapshot(sref, d => { raw.settings = d.data() || {}; raw.platforms = raw.settings.platforms || []; push(); });
    onSnapshot(collection(db, "users"),    q => { raw.users    = q.docs.map(d => d.data()); push(); });
    onSnapshot(collection(db, "products"), q => { raw.products = q.docs.map(d => d.data()); push(); });
    onSnapshot(collection(db, "videos"),   q => { raw.videos   = q.docs.map(d => d.data()); push(); });
    onSnapshot(collection(db, "schedule"), q => { const s = {}; q.docs.forEach(d => s[d.id] = d.data()); raw.schedule = s; push(); });
    // 日報／交辦只訂閱近 150 天（歷史不重載 → 省讀取）
    onSnapshot(query(collection(db, "reports"),  where("date", ">=", HISTORY_CUTOFF)), q => { raw.reports  = q.docs.map(d => d.data()); push(); });
    onSnapshot(query(collection(db, "messages"), where("at",   ">=", HISTORY_CUTOFF)), q => { raw.messages = q.docs.map(d => d.data()); push(); });
  });
}
