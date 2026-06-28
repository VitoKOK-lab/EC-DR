// ===================================================================
// Firebase 資料層 — 連線、Email/密碼登入、Firestore 即時同步
// 只負責「資料進出 + 身分」；畫面與運算在 app.js。結構見 SCHEMA.md。
//
// 安全模型（無後端，純前端 + Firestore 規則）：
//   - 每位成員都有一個「真正的 Firebase 帳號」；密碼由 Firebase 雲端加密保存，
//     不再存進我們的資料庫。前端不再比對明碼。
//   - 管理員用固定的管理員帳號（ADMIN_EMAIL，於 Firebase 後台建立）登入。
//   - 規則：登入畫面需要成員名單 → users 公開可讀；其餘營運資料只有
//     「在白名單 accounts/{uid} 內的成員」或管理員能讀寫；設定只有管理員能改。
//   - 管理員在系統內新增成員時，用「次要 App 實例」建立其 Firebase 帳號
//     （不影響管理員自己的登入狀態），並寫入 users/{name} 與 accounts/{uid}。
// ===================================================================
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
         createUserWithEmailAndPassword, updatePassword }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// 管理員帳號 email（請在 Firebase 後台「Authentication → 新增使用者」建立同一個 email，
// 並把下面這個值同步到 firestore.rules 的 isAdmin()）。email 不是機密，密碼才是。
const ADMIN_EMAIL = "taiwanstore365@gmail.com";

// 預設設定（首次啟動且 Firestore 尚無 settings 時，由管理員登入後寫入）— 對應 SCHEMA.md
// 注意：已不再有 adminPassword／使用者 pw（密碼改由 Firebase Auth 管理）。
const DEFAULT_SETTINGS = {
  schemaVersion: 10,
  mainTypes: ["流量型", "帶貨型", "寵粉"],
  videoTags: ["新片","舊片","每日寵粉","招商","銷售"],
  sources: ["老闆自拍", "外部公司"],
  weekdayTargets: {
    0:{"流量型":3,"帶貨型":1,"寵粉":0}, 1:{"流量型":3,"帶貨型":1,"寵粉":0}, 2:{"流量型":3,"帶貨型":1,"寵粉":0},
    3:{"流量型":3,"帶貨型":1,"寵粉":0}, 4:{"流量型":3,"帶貨型":1,"寵粉":0}, 5:{"流量型":3,"帶貨型":1,"寵粉":0},
    6:{"流量型":3,"帶貨型":1,"寵粉":0} },
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

function randHex(n=8){ const a=new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2,"0")).join(""); }

// 尚未填入設定 → 顯示設定指引
if (!firebaseConfig || String(firebaseConfig.apiKey || "").includes("PASTE")) {
  if (window.__needSetup) window.__needSetup();
} else {
  const app  = initializeApp(firebaseConfig);
  const db   = getFirestore(app);
  const auth = getAuth(app);

  // 本地彙整的原始資料
  const raw = { users: [], videos: [], schedule: {}, settings: {}, tasks: {}, shifts: {} };
  function push() { if (window.__onState) window.__onState(JSON.parse(JSON.stringify(raw))); }

  // 寫入介面（給 app.js）
  window.DB = {
    set:         (c, id, o) => setDoc(doc(db, c, id), o),
    update:      (c, id, p) => updateDoc(doc(db, c, id), p),
    del:         (c, id)    => deleteDoc(doc(db, c, id)),
    scheduleSet: (date, o)  => setDoc(doc(db, "schedule", date), o),
    setSettings: (p)        => setDoc(doc(db, "meta", "settings"), p, { merge: true }),
    accountSet:  (uid, o)   => setDoc(doc(db, "accounts", uid), o),
    accountDel:  (uid)      => deleteDoc(doc(db, "accounts", uid)),
  };

  // 身分介面（給 app.js）
  window.AUTH = {
    ADMIN_EMAIL,
    signInMember: (email, pw) => signInWithEmailAndPassword(auth, email, pw),
    signInAdmin:  (pw)        => signInWithEmailAndPassword(auth, ADMIN_EMAIL, pw),
    signOut:      ()          => signOut(auth),
    changePassword: (np)      => updatePassword(auth.currentUser, np),
    email:        ()          => (auth.currentUser ? auth.currentUser.email : null),
    // 管理員建立一個新成員帳號（用次要 App 實例，不動到管理員自己的登入狀態）
    createAccount: async (pw) => {
      const email = "m" + randHex(8) + "@ecdr.app";
      const sec   = initializeApp(firebaseConfig, "sec_" + randHex(4));
      const sauth = getAuth(sec);
      try {
        const cred = await createUserWithEmailAndPassword(sauth, email, pw);
        return { email, uid: cred.user.uid };
      } finally {
        try { await signOut(sauth); } catch (e) {}
        try { await deleteApp(sec); } catch (e) {}
      }
    },
  };

  // 登入畫面在「尚未登入」時就要顯示成員名單 → users 公開可讀，永遠訂閱
  onSnapshot(collection(db, "users"), q => { raw.users = q.docs.map(d => d.data()); push(); });

  // 營運資料只在登入後訂閱
  let unsubBiz = [];
  function unsubscribeBusiness() {
    unsubBiz.forEach(fn => { try { fn(); } catch (e) {} });
    unsubBiz = [];
    raw.videos = []; raw.schedule = {}; raw.settings = {}; raw.tasks = {}; raw.shifts = {};
    push();
  }
  function subscribeBusiness() {
    if (unsubBiz.length) return;
    unsubBiz.push(
      onSnapshot(doc(db, "meta", "settings"), d => { raw.settings = d.data() || {}; push(); }),
      onSnapshot(collection(db, "videos"),   q => { raw.videos = q.docs.map(d => d.data()); push(); }),
      onSnapshot(collection(db, "schedule"), q => { const s = {}; q.docs.forEach(d => s[d.id] = d.data()); raw.schedule = s; push(); }),
      onSnapshot(collection(db, "tasks"),    q => { const s = {}; q.docs.forEach(d => s[d.id] = d.data()); raw.tasks = s; push(); }),
      onSnapshot(collection(db, "shifts"),   q => { const s = {}; q.docs.forEach(d => s[d.id] = d.data()); raw.shifts = s; push(); }),
    );
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) { unsubscribeBusiness(); if (window.__onAuthState) window.__onAuthState(false, null); return; }
    // 管理員首次登入：種子 settings；既有：補齊缺漏欄位（一般成員無權寫設定，略過）
    if (user.email === ADMIN_EMAIL) {
      try {
        const sref = doc(db, "meta", "settings");
        const snap = await getDoc(sref);
        if (!snap.exists()) { await setDoc(sref, DEFAULT_SETTINGS); }
        else {
          const cur = snap.data() || {}; const patch = {};
          if (!Array.isArray(cur.videoTags) || !cur.videoTags.length) patch.videoTags = DEFAULT_SETTINGS.videoTags;
          if (!cur.weekdayTargets || typeof cur.weekdayTargets !== "object") patch.weekdayTargets = DEFAULT_SETTINGS.weekdayTargets;
          if (!Array.isArray(cur.postPlatforms) || !cur.postPlatforms.length) patch.postPlatforms = DEFAULT_SETTINGS.postPlatforms;
          if (cur.schemaVersion == null || cur.schemaVersion < 10) patch.schemaVersion = 10;
          if (Object.keys(patch).length) await setDoc(sref, patch, { merge: true });
        }
      } catch (e) {}
    }
    subscribeBusiness();
    if (window.__onAuthState) window.__onAuthState(true, user.email);
  });
}
