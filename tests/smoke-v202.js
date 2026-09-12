// v202 逐人權限
//
// 老闆：「這個功能要開權限，現在我的後台都沒有做好，權限還沒有明確可以依照人員新增。」
//       「不是『管理員』是權限，把我其他員工的各式權限都整合給我在後台設定。」
//
// 以前只有三個旗標能逐人開，其他全綁在職位上 —— 想讓 Regina 看「影片成效」，
// 只能把她升成管理員，連設定、成員、回收桶一起給出去。
//
// ⚠️ 這一支最重要的是**第 ① 段**：職位預設值必須跟改這套之前一模一樣。
//    這裡錯一個字，就會有人突然多看到或少看到一整頁，而且不會有任何錯誤訊息。
const fs = require("fs"), path = require("path");
const APP = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
let src = APP.replace(/^let /gm, "").replace(/^const /gm, "");
const el = () => ({ value: "", innerHTML: "", textContent: "", className: "", style: {}, checked: false,
  tagName: "DIV", dataset: {}, disabled: false, readOnly: false, isConnected: true, scrollTop: 0, rows: 1,
  classList: { toggle(){}, add(){}, remove(){}, contains(){ return false; } },
  addEventListener(){}, appendChild(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
  getAttribute(){ return null; }, setAttribute(){}, closest(){ return null; }, focus(){}, click(){},
  insertAdjacentHTML(p, h){ this.innerHTML += h; }, getBoundingClientRect(){ return { top:0, left:0, bottom:0, right:0 }; } });
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
let modalHTML = "", viewEl = el();
global.document = { getElementById: (id) => { if (id === "view") return viewEl;
    const e = el(); if (id === "modalRoot") { Object.defineProperty(e, "innerHTML", { set(v){ modalHTML = v; }, get(){ return modalHTML; } }); } return e; },
  get activeElement(){ return null; }, addEventListener(){}, createElement: () => el(),
  body: { classList: { toggle(){}, add(){}, remove(){} } }, querySelector: () => null, querySelectorAll: () => [] };
global.window = { addEventListener(){}, innerWidth: 1200, innerHeight: 800, scrollY: 0, scrollTo(){}, DB: null,
  location: { reload(){} }, open: () => ({}) };
global.requestAnimationFrame = (f) => f(); global.navigator = { onLine: true };
global.confirm = () => true; global.prompt = () => null;
eval(src);
const FROZEN = new Date(Date.now() + 288e5).toISOString().slice(0, 8) + "15";
todayTW = () => FROZEN; ydayTW = () => FROZEN.slice(0, 8) + "14"; refreshToday();

let pass = 0, fail = 0;
function ok(n, c, x) { if (c) { pass++; } else { fail++; console.log("FAIL  " + n, x === undefined ? "" : JSON.stringify(x).slice(0, 220)); } }
let WRITES = [];
function reset(users, who, role) {
  WRITES = []; modalHTML = ""; VIEW_AS = null; BRAND = ""; SET_TAB = "basic";
  global.window.DB = { set: async (c, id, o) => { WRITES.push(["set", c, id, o]); },
    update: async (c, id, p) => { WRITES.push(["update", c, id, p]); },
    del: async () => {}, scheduleSet: async () => {}, setSettings: async () => {},
    videosWatched: () => true, netState: () => ({ online: true, pending: false }) };
  const raw = { users: users || [], settings: { dailyTarget: 4, videoTags: [], sources: [], postPlatforms: [],
      intlAccounts: [], shopeeAccounts: [], msAccounts: [], exchangeRates: {}, contacts: [], reviewSince: "2020-01-01" },
    schedule: {}, tasks: {}, shifts: {}, logs: [], deletedVideos: [], videos: [] };
  LAST_RAW = raw; STATE = decorate(raw);
  localStorage.setItem("ecdr_user", who || "管理員"); localStorage.setItem("ecdr_role", role || "boss");
}
const U = (name, role, extra) => Object.assign({ name, role }, extra || {});

// ══════════ ① 職位預設值：必須跟改這套之前一模一樣 ══════════
// 改之前的原始定義（抄自 v201 的程式碼，這是這一段存在的全部意義）：
//   seesDF        ["boss","manager","editor"]
//   canSeeOutput  ["boss","hr"]
//   canAssignWork ["boss","manager"] ＋ canAssign 旗標
//   canFindAssets ["boss","manager"] ＋ canFindAssets 旗標
//   seesLeadBoard ["boss","manager","hr"]
//   perf 分頁      只有 boss（ROLE_TABS）
//   remake        v203 新增，跟 df 一樣（搬家不能改變誰看得到）
//   output/attend  boss ＋ hr（ROLE_TABS）
const WAS = {
  df:     ["boss", "manager", "editor"],
  // v203：二創自成一頁。預設值刻意跟 df 一樣 —— 二創建議本來就掛在大流量那一頁上，
  // 搬出來自成一頁的時候，誰看得到不能變，不然會有人今天有、明天沒有。
  remake: ["boss", "manager", "editor"],
  output: ["boss", "hr"],
  attend: ["boss", "hr"],
  assign: ["boss", "manager"],
  find:   ["boss", "manager"],
  lead:   ["boss", "manager", "hr"],
  perf:   ["boss"],
};
const ROLES = ["boss", "manager", "editor", "intl", "hr", "cs", "mkt", "svc", "ship", "pick"];
Object.keys(WAS).forEach(key => {
  ROLES.forEach(role => {
    reset([U("阿某", role)], "阿某", role);
    const want = WAS[key].includes(role);
    ok(`職位預設沒變：${role} 的「${PERMS[key].label}」＝${want ? "有" : "沒有"}`,
       hasPerm(key) === want, { key, role, got: hasPerm(key) });
  });
});
ok("PERMS 的每一項都在上面那張表裡，沒有多也沒有少（新增一項就要回來補預設值）",
   PERM_KEYS.slice().sort().join() === Object.keys(WAS).sort().join(), PERM_KEYS);
// 設定不能從權限表發出去 —— 拿到設定的人可以再把權限給別人，那是第二把管理員鑰匙
ok("**設定不在權限表裡**（老闆選的）", !PERM_KEYS.includes("settings") && !/settings:\s*\{/.test(
   (APP.match(/const PERMS = \{[\s\S]*?\n\};/) || [""])[0]));
ok("設定分頁照舊只認 isOwner()", /if\(isOwner\(\)\)\{ t\.push\(\["settings","設定"\]\); \}/.test(APP));

// ══════════ ② 逐人開：職位沒給的，勾了就有 ══════════
{ reset([U("Regina", "manager")], "Regina", "manager");
  ok("（對照）經理人本來看不到影片成效", !hasPerm("perf"));
  ok("（對照）分頁也沒有", !myTabs().some(t => t[0] === "perf"), myTabs().map(t => t[0]));
  reset([U("Regina", "manager", { perms: ["perf"] })], "Regina", "manager");
  ok("勾了「影片成效」就看得到", hasPerm("perf"));
  ok("而且分頁真的長出來", myTabs().some(t => t[0] === "perf"), myTabs().map(t => t[0]));
  ok("分頁名字是權限表上那個名字", (myTabs().find(t => t[0] === "perf") || [])[1] === PERMS.perf.label);
  ok("沒勾的還是沒有", !hasPerm("output")); }
{ reset([U("小葵", "editor", { perms: ["assign"] })], "小葵", "editor");
  ok("一般剪輯被開了「工作指派」→ 排得了二創", canAssignWork() && canPlanRemake());
  ok("也標得了急件（跟指派共用同一個開關）", canMarkUrgent()); }

// ══════════ ③ 舊旗標照樣算數（資料庫不用搬） ══════════
{ reset([U("泓儒", "editor", { canAssign: true })], "泓儒", "editor");
  ok("舊的 canAssign 旗標照樣有效", hasPerm("assign") && canAssignWork());
  reset([U("阿某", "editor", { canFindAssets: true })], "阿某", "editor");
  ok("舊的 canFindAssets 旗標照樣有效", hasPerm("find") && canFindAssets());
  ok("而且「找影片」分頁照樣長得出來", myTabs().some(t => t[0] === "assets")); }

// ══════════ ④ 員工視角：看被預覽那個人的權限，不是看自己的 ══════════
{ reset([U("管理員", "boss"), U("小葵", "editor")], "管理員", "boss");
  ok("（對照）管理員自己看得到影片成效", hasPerm("perf"));
  VIEW_AS = "小葵";
  ok("預覽小葵 → 看不到影片成效（不然預覽出來的是假畫面）", !hasPerm("perf"));
  VIEW_AS = null; }
// ⚠️ 要預覽一個**真的有**指派權限的人才測得到「預覽是唯讀」——
//    預覽一個本來就沒權限的人，把 !VIEW_AS 拿掉照樣是 false，那條斷言是空的。
{ reset([U("管理員", "boss"), U("泓儒", "editor", { canAssign: true })], "管理員", "boss");
  ok("（對照）泓儒本人指派得動", hasPerm("assign", "泓儒"));
  VIEW_AS = "泓儒";
  ok("看得到他的權限（畫面要跟他看到的一樣）", hasPerm("assign"));
  ok("**但預覽是唯讀：按不下去**", !canAssignWork());
  ok("排二創也按不下去", !canPlanRemake());
  VIEW_AS = null; }
{ reset([U("管理員", "boss"), U("小葵", "editor")], "管理員", "boss");
  VIEW_AS = "不在名單上的人";
  ok("**預覽名單上沒有的人 → 一項權限都沒有**", PERM_KEYS.every(k => !hasPerm(k)),
     PERM_KEYS.filter(k => hasPerm(k)));
  VIEW_AS = null; }
// ⚠️ 這一條在守 smoke-v196 那個坑：currentRole() 找不到人時會退回 localStorage 裡
//    **管理員自己**的職位，所以預覽一個不存在的名字會借到管理員權限。
{ reset([U("管理員", "boss")], "管理員", "boss");
  ok("沒在預覽、自己也還沒載進名單時，照舊用職位判斷（資料載入中的那一瞬間）",
     hasPerm("perf")); }

// ══════════ ⑤ 指名問別人的權限 ══════════
{ reset([U("管理員", "boss"), U("小葵", "editor", { perms: ["output"] })], "管理員", "boss");
  ok("問得到別人有沒有", hasPerm("output", "小葵") && !hasPerm("perf", "小葵"));
  ok("名單上沒有的人 → 沒有權限（不會退回問的人自己的職位）",
     PERM_KEYS.every(k => !hasPerm(k, "查無此人")), PERM_KEYS.filter(k => hasPerm(k, "查無此人"))); }

// ══════════ ⑥ 海外剪輯不會被補上中文分頁 ══════════
// 這幾頁整頁是中文的，給了就是中文漏進英文介面（audit-lang 會抓）
{ reset([U("Ali", "intl", { perms: ["perf", "output", "attend", "df"] })], "Ali", "intl");
  const tabs = myTabs().map(t => t[0]);
  ok("海外剪輯就算被勾了也不會多出中文分頁",
     !tabs.includes("perf") && !tabs.includes("output") && !tabs.includes("attend") && !tabs.includes("videosDF"), tabs);
  ok("也不會多出「找影片」", !tabs.includes("assets"), tabs); }
// 主管看板沒有自己的分頁，所以上面那條蓋不到它 —— 第一版就是這樣漏掉的：
// 權限頁上海外剪輯那一列的「主管看板」是可以勾的，勾下去就是中文漏進英文介面。
{ reset([U("Ali", "intl", { perms: ["lead"] })], "Ali", "intl");
  ok("**海外剪輯就算資料裡有 lead，也看不到主管看板**", !seesLeadBoard()); }
{ reset([U("管理員", "boss"), U("Ali", "intl"), U("小葵", "editor")], "管理員", "boss");
  SET_TAB = "perms"; const h = viewSettings(); SET_TAB = "basic";
  ok("權限頁上海外剪輯那一列，中文頁那幾項一律不給勾",
     ["perf", "output", "attend", "df", "lead"].every(k => !h.includes(`setMemberPerm('Ali','${k}'`)),
     ["perf", "output", "attend", "df", "lead"].filter(k => h.includes(`setMemberPerm('Ali','${k}'`)));
  ok("（對照）台灣剪輯那一列勾得到", /setMemberPerm\('小葵','lead'/.test(h)); }

// ══════════ ⑦ 設定 → 權限那一頁 ══════════
{ reset([U("管理員", "boss"), U("Regina", "manager"), U("小葵", "editor"), U("阿包", "editor", { outsourced: true })], "管理員", "boss");
  SET_TAB = "perms"; const h = viewSettings(); SET_TAB = "basic";
  ok("七項全部都在表頭上", PERM_KEYS.every(k => h.includes(">" + PERMS[k].label + "</th>")),
     PERM_KEYS.filter(k => !h.includes(">" + PERMS[k].label + "</th>")));
  ok("每個人一列", h.includes("Regina") && h.includes("小葵") && h.includes("阿包"));
  ok("職位本來就有的顯示「職位」，不給勾",
     /Regina[\s\S]{0,900}職位/.test(h) && !/setMemberPerm\('Regina','df'/.test(h));
  ok("職位沒給的才有勾選框", /setMemberPerm\('小葵','perf',this\.checked\)/.test(h));
  ok("「外包」也整合進來了", h.includes(">外包</th>") && /setMemberOutsourced\('阿包'/.test(h));
  ok("每一項都寫出它到底能做什麼", PERM_KEYS.every(k => h.includes(PERMS[k].why)),
     PERM_KEYS.filter(k => !h.includes(PERMS[k].why)));
  ok("有講清楚設定為什麼不在這裡", h.includes("管理員鑰匙")); }
{ reset([U("管理員", "boss"), U("小葵", "editor", { perms: ["perf", "output"] })], "管理員", "boss");
  SET_TAB = "perms"; const h = viewSettings(); SET_TAB = "basic";
  ok("已經開的顯示成勾起來",
     /<input type="checkbox" checked[^>]*setMemberPerm\('小葵','perf'/.test(h));
  ok("沒開的不勾", /<input type="checkbox" [^>]*setMemberPerm\('小葵','attend'/.test(h)
     && !/<input type="checkbox" checked[^>]*setMemberPerm\('小葵','attend'/.test(h));
  SET_TAB = "members"; const m = viewSettings(); SET_TAB = "basic";
  ok("成員表上看得到「額外幾項」，但改要去權限頁", m.includes("額外 2 項") && m.includes("setSetTab('perms')")); }

// ══════════ ⑧ 寫入：perms 與舊旗標要一起動 ══════════
(async () => {
  { reset([U("管理員", "boss"), U("小葵", "editor")], "管理員", "boss");
    setMemberPerm("小葵", "perf", true); await new Promise(r => setTimeout(r, 20));
    const w = WRITES.find(x => x[0] === "update" && x[1] === "users");
    ok("勾起來會寫 users", !!w, WRITES);
    ok("perms 寫進去了", w && (w[3].perms || []).includes("perf"), w && w[3]);
    ok("沒有舊旗標的權限就只寫 perms", w && Object.keys(w[3]).join() === "perms", w && w[3]); }
  { reset([U("管理員", "boss"), U("小葵", "editor", { canAssign: true, perms: ["assign"] })], "管理員", "boss");
    setMemberPerm("小葵", "assign", false); await new Promise(r => setTimeout(r, 20));
    const w = WRITES.find(x => x[0] === "update" && x[1] === "users");
    // hasPerm 兩邊都看，只清一邊等於沒清 —— 取消了他還是有權限
    ok("**取消時舊旗標也要一起清掉**", w && w[3].canAssign === false, w && w[3]);
    ok("perms 裡也拿掉了", w && !(w[3].perms || []).includes("assign"), w && w[3]); }
  { reset([U("管理員", "boss"), U("小葵", "editor", { perms: ["perf", "output"] })], "管理員", "boss");
    setMemberPerm("小葵", "perf", false); await new Promise(r => setTimeout(r, 20));
    const w = WRITES.find(x => x[0] === "update" && x[1] === "users");
    ok("取消一項不會動到別項", w && (w[3].perms || []).join() === "output", w && w[3]); }
  { reset([U("管理員", "boss"), U("小葵", "editor", { perms: ["不認得的舊值", "perf"] })], "管理員", "boss");
    setMemberPerm("小葵", "output", true); await new Promise(r => setTimeout(r, 20));
    const w = WRITES.find(x => x[0] === "update" && x[1] === "users");
    ok("順手把不認得的舊值濾掉", w && (w[3].perms || []).sort().join() === "output,perf", w && w[3]); }
  { reset([U("管理員", "boss")], "管理員", "boss");
    setMemberPerm("查無此人", "perf", true); await new Promise(r => setTimeout(r, 20));
    ok("名單上沒有的人不寫（不要憑空生一筆出來）",
       !WRITES.some(x => x[1] === "users"), WRITES);
    setMemberPerm("管理員", "不認得的權限", true); await new Promise(r => setTimeout(r, 20));
    ok("不認得的權限也不寫", !WRITES.some(x => x[1] === "users"), WRITES); }
  // 白名單漏了就是「勾了沒反應」，而且完全沒有錯誤訊息
  ok("PUT /api/users 的白名單有放行 perms", /body\.perms!=null\) patch\.perms=/.test(APP));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
