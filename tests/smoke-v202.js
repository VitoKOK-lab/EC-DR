// v202 逐人權限
//
// 老闆：「這個功能要開權限，現在我的後台都沒有做好，權限還沒有明確可以依照人員新增。」
//       「不是『管理員』是權限，把我其他員工的各式權限都整合給我在後台設定。」
//
// 以前只有三個旗標能逐人開，其他全綁在職位上 —— 想讓 Regina 看「影片成效」，
// 只能把她升成管理員，連設定、成員、回收桶一起給出去。
//
// v207 再走一步（老闆：「不要有人有任何預設的權限，都要可以勾選的。」）：
// **職位一個權限都不給**，全部要在「設定 → 權限」逐人勾。
//
// ⚠️ 這一支最重要的是**第 ① 段**：職位不准偷偷帶回任何預設值。
//    這裡破一個洞，就會有人突然多看到一整頁，而且權限表上完全看不出來。
// ⚠️ 這一支**不准** require tests/perm-fixture.js —— 那個檔就是在把舊的職位預設
//    補回其他測試的假資料上，用在這裡等於把這一整段測掉。
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
    // ⚠️ del 也要記下來 —— 本來是個空殼，於是「刪除成員寫到哪一筆」完全測不到
    del: async (c, id) => { WRITES.push(["del", c, id]); },
    scheduleSet: async () => {}, setSettings: async () => {},
    videosWatched: () => true, netState: () => ({ online: true, pending: false }) };
  const raw = { users: users || [], settings: { dailyTarget: 4, videoTags: [], sources: [], postPlatforms: [],
      intlAccounts: [], shopeeAccounts: [], msAccounts: [], exchangeRates: {}, contacts: [], reviewSince: "2020-01-01" },
    schedule: {}, tasks: {}, shifts: {}, logs: [], deletedVideos: [], videos: [] };
  LAST_RAW = raw; STATE = decorate(raw);
  localStorage.setItem("ecdr_user", who || "管理員"); localStorage.setItem("ecdr_role", role || "boss");
}
const U = (name, role, extra) => Object.assign({ name, role }, extra || {});

// ══════════ ① 職位不給任何預設權限 ══════════
// 老闆：「不要有人有任何預設的權限，都要可以勾選的。」
//
// 這一段就是那句話的全部：每一項權限 × 每一個職位，沒勾就是沒有。
// 勾了才有 —— 而且是同一個人、同一個職位，只差 users.perms 裡多了那個 key。
// 二創不再是一個權限 —— 這條會擋住「哪天有人手滑把它加回來，變成兩套定義」
ok("「二創」不再是獨立權限（它就是影片成效的一部分）", typeof PERMS.remake === "undefined");
const ROLES = ["boss", "manager", "editor", "intl", "hr", "cs", "mkt", "svc", "ship", "pick"];
PERM_KEYS.forEach(key => {
  ROLES.forEach(role => {
    reset([U("阿某", role)], "阿某", role);
    ok(`職位不給預設：${role} 沒被勾就沒有「${PERMS[key].label}」`,
       hasPerm(key) === false, { key, role });
    // 中文頁不給海外剪輯，那是另一條規矩（第 ⑥ 段），這裡就不重複測
    if (role === "intl" && PERMS[key].zhOnly) return;
    reset([U("阿某", role, { perms: [key] })], "阿某", role);
    ok(`勾起來就有：${role} 的「${PERMS[key].label}」`, hasPerm(key) === true, { key, role });
  });
});
// 程式碼層面再釘一次：PERMS 裡不准再出現 roles，ROLE_TABS 裡不准再出現那四頁。
// 沒有這兩條，下一個人「順手」加回去，上面那一整段照樣全綠（因為假資料裡沒有那個職位）。
ok("**PERMS 裡不准再有 roles**（那就是職位預設）",
   PERM_KEYS.every(k => PERMS[k].roles === undefined) &&
   !/roles\s*:/.test((APP.match(/const PERMS = \{[\s\S]*?\n\};/) || [""])[0]));
ok("**權限管得到的分頁不准寫回 ROLE_TABS**（寫回去就是偷偷給一個預設值）",
   (() => { const rt = (APP.match(/const ROLE_TABS = \{[\s\S]*?\n\};/) || [""])[0];
     return PERM_KEYS.filter(k => PERMS[k].tab).every(k => !rt.includes('"' + PERMS[k].tab + '"')); })(),
   (APP.match(/const ROLE_TABS = \{[\s\S]*?\n\};/) || [""])[0].slice(0, 400));
// 那個補丁檔是給「不是在測權限」的煙霧測試用的；用在這裡等於把這一整段測掉
ok("這一支沒有去 require 那個補丁檔（用了就會把「職位不給預設」整段測掉）",
   !/require\(["'][^"']*perm-fixture/.test(fs.readFileSync(__filename, "utf8")));
// 設定不能從權限表發出去 —— 拿到設定的人可以再把權限給別人，那是第二把管理員鑰匙
ok("**設定不在權限表裡**（老闆選的）", !PERM_KEYS.includes("settings") && !/settings:\s*\{/.test(
   (APP.match(/const PERMS = \{[\s\S]*?\n\};/) || [""])[0]));
ok("設定分頁照舊只認 isOwner()", /if\(isOwner\(\)\)\{ t\.push\(\["settings","設定"\]\); \}/.test(APP));

// ══════════ ② 逐人開：職位沒給的，勾了就有 ══════════
// v204 起「影片成效」預設就給經理人與剪輯了，所以這裡改拿「剪輯產出」當例子 ——
// 要測「職位沒給、勾了就有」，例子本身必須是那個職位真的沒有的東西。
{ reset([U("Regina", "manager")], "Regina", "manager");
  ok("（對照）經理人本來看不到剪輯產出", !hasPerm("output"));
  ok("（對照）分頁也沒有", !myTabs().some(t => t[0] === "output"), myTabs().map(t => t[0]));
  reset([U("Regina", "manager", { perms: ["output"] })], "Regina", "manager");
  ok("勾了「剪輯產出」就看得到", hasPerm("output"));
  ok("而且分頁真的長出來", myTabs().some(t => t[0] === "output"), myTabs().map(t => t[0]));
  ok("分頁名字是權限表上那個名字", (myTabs().find(t => t[0] === "output") || [])[1] === PERMS.output.label);
  ok("沒勾的還是沒有", !hasPerm("attend")); }
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
  ok("（對照）管理員自己看得到剪輯產出", hasPerm("output"));
  VIEW_AS = "小葵";
  ok("預覽小葵 → 看不到剪輯產出（不然預覽出來的是假畫面）", !hasPerm("output"));
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
// v207：管理員＝最高權限，而且是比對**名字**不是職位 ——
// 比對職位的話，「把誰改成 boss，誰就變成管理員」。
{ reset([], "管理員", "boss");
  ok("管理員就算還沒載進名單，照樣全部都有（資料載入中的那一瞬間也要能用）",
     PERM_KEYS.every(k => hasPerm(k)), PERM_KEYS.filter(k => !hasPerm(k)));
  reset([U("阿某", "boss")], "阿某", "boss");
  ok("**別人掛 boss 也不會變成管理員**（比對的是名字，不是職位）",
     PERM_KEYS.every(k => !hasPerm(k)), PERM_KEYS.filter(k => hasPerm(k)));
  // ⚠️ 這一條在守「名單裡找不到這個人」那一行：以前它會退回 currentRole()，
  //    而 currentRole() 找不到人時讀的是 localStorage 裡的職位 —— 等於自己說自己是誰。
  //    沒有這一條，把那一行改成「退回職位」照樣全綠（上面那幾條都有指名或在預覽）。
  reset([], "小葵", "editor");
  ok("**自己也還沒載進名單時，一項都沒有**（不准退回職位 —— 那是自己說自己是誰）",
     PERM_KEYS.every(k => !hasPerm(k)), PERM_KEYS.filter(k => hasPerm(k))); }

// ══════════ ⑤ 指名問別人的權限 ══════════
{ reset([U("管理員", "boss"), U("小葵", "editor", { perms: ["output"] })], "管理員", "boss");
  ok("問得到別人有沒有", hasPerm("output", "小葵") && !hasPerm("attend", "小葵"));
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
// 上面兩條都是靠各自那一段的 currentRole()!=="intl" 擋下來的 —— 擋板在 hasPerm 裡也要有一份，
// 不然哪天多一個中文功能、寫的人忘了加那一句，就直接漏出去了。
{ reset([U("Ali", "intl", { perms: PERM_KEYS.slice(), canAssign: true, canFindAssets: true })], "Ali", "intl");
  const zh = PERM_KEYS.filter(k => PERMS[k].zhOnly);
  ok("**hasPerm 自己就擋掉海外剪輯的中文頁**（不是靠各處的 currentRole() 各擋一份）",
     zh.length >= 5 && zh.every(k => !hasPerm(k)), zh.filter(k => hasPerm(k)));
  ok("（對照）不是中文頁的那幾項照樣給他",
     PERM_KEYS.filter(k => !PERMS[k].zhOnly).every(k => hasPerm(k)),
     PERM_KEYS.filter(k => !PERMS[k].zhOnly && !hasPerm(k))); }
{ reset([U("管理員", "boss"), U("Ali", "intl"), U("小葵", "editor")], "管理員", "boss");
  SET_TAB = "perms"; const h = viewSettings(); SET_TAB = "basic";
  ok("權限頁上海外剪輯那一列，中文頁那幾項一律不給勾",
     ["perf", "output", "attend", "df", "lead"].every(k => !h.includes(`setMemberPerm('Ali','${k}'`)),
     ["perf", "output", "attend", "df", "lead"].filter(k => h.includes(`setMemberPerm('Ali','${k}'`)));
  ok("（對照）台灣剪輯那一列勾得到", /setMemberPerm\('小葵','lead'/.test(h)); }

// ══════════ ⑦ 設定 → 權限那一頁 ══════════
{ reset([U("管理員", "boss"), U("Regina", "manager"), U("小葵", "editor"), U("阿包", "editor", { outsourced: true })], "管理員", "boss");
  SET_TAB = "perms"; const h = viewSettings(); SET_TAB = "basic";
  ok("每一項都在表頭上", PERM_KEYS.every(k => h.includes("\n    " + PERMS[k].label + "\n")),
     PERM_KEYS.filter(k => !h.includes("\n    " + PERMS[k].label + "\n")));
  // v208（老闆：「你的權限名要和上面的名字一樣，不然我不知這打勾是給什麼權，
  //       像商品主檔是什麼？？」）：欄名底下要寫它在畫面上的哪裡。
  // ⚠️ 只比對整張卡的話，卡片下面那段說明裡也有同一串字 —— 把表頭那一行刪掉照樣是綠的。
  //    要比對的是 <thead> 裡面。
  const thead = (h.match(/<thead>[\s\S]*?<\/thead>/) || [""])[0];
  ok("**每一欄底下都寫了它在哪裡**（不然勾之前看不出勾的是什麼）",
     thead && PERM_KEYS.every(k => PERMS[k].where && thead.includes(PERMS[k].where)),
     PERM_KEYS.filter(k => !PERMS[k].where || !thead.includes(PERMS[k].where)));
  ok("下面的說明也一項一項寫了位置",
     PERM_KEYS.every(k => h.includes("（" + PERMS[k].where + "）：" + PERMS[k].why)),
     PERM_KEYS.filter(k => !h.includes("（" + PERMS[k].where + "）：" + PERMS[k].why)));
  ok("每個人一列", h.includes("Regina") && h.includes("小葵") && h.includes("阿包"));
  // v207：沒有「職位」那一檔了 —— 每一格都是勾選框（管理員那一列除外，他是最高權限）
  ok("**每一個人、每一項都是勾選框**（老闆：「都要可以勾選的」）",
     ["Regina", "小葵", "阿包"].every(n => PERM_KEYS.every(k =>
       h.includes(`setMemberPerm('${n}','${k}',this.checked)`))),
     ["Regina", "小葵", "阿包"].map(n => PERM_KEYS.filter(k =>
       !h.includes(`setMemberPerm('${n}','${k}',this.checked)`))));
  ok("表上沒有「職位」那一檔了（有的話就是還有預設值）", !h.includes(">職位</span>"));
  // ⚠️ 不能只看 h.includes("最高") —— 卡片下面的說明也寫著「是最高權限」，
  //    那樣把整列拿掉照樣是綠的。要認那顆標籤，而且每一欄都要有一顆。
  ok("管理員自己一列，每一項都標「最高」，而且不給勾",
     (h.match(/>最高</g) || []).length === PERM_KEYS.length && !/setMemberPerm\('管理員'/.test(h),
     (h.match(/>最高</g) || []).length);
  ok("職位沒給的才有勾選框", /setMemberPerm\('小葵','output',this\.checked\)/.test(h));
  ok("「外包」也整合進來了", h.includes(">外包</th>") && /setMemberOutsourced\('阿包'/.test(h));
  ok("每一項都寫出它到底能做什麼", PERM_KEYS.every(k => h.includes(PERMS[k].why)),
     PERM_KEYS.filter(k => !h.includes(PERMS[k].why)));
  ok("有講清楚設定為什麼不在這裡", h.includes("管理員鑰匙"));
  // ⚠️ v208 的重點：權限名不准是自己取的新詞，必須跟畫面上那個字一模一樣。
  //    有分頁的那幾項，分頁名天生就是這個 label（myTabs 用的就是它）——
  //    但**點進去之後的標題**也要同一個字，不然點進去看到另一個名字，一樣認不出來。
  //    「剪輯產出／剪輯成效」「大流量影片／影片庫大流」就是這樣歪掉的。
  { reset([U("小葵", "editor", { perms: PERM_KEYS.slice() })], "小葵", "editor");
    const PAGE = { find: viewAssets, perf: viewPerf, output: viewOutput, attend: viewAttend, df: viewVideosDF };
    Object.keys(PAGE).forEach(k => {
      const h2 = (String(PAGE[k]()).match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || ["", ""])[1];
      ok(`點進去的標題跟權限名同一個字：${PERMS[k].label}`,
         h2.indexOf(PERMS[k].label) >= 0, { k, want: PERMS[k].label, h2: h2.slice(0, 120) });
    });
    // 沒有分頁的那兩個，名字一樣不准亂取。
    // ⚠️ 這裡一定要拿 PERMS[k].label 去比，不能把字寫死 ——
    //    寫死的話「把 label 改回『商品主檔』」照樣是綠的（畫面上那塊還是舊字），
    //    而那正是老闆抱怨的那個病。
    ok("商品那一塊的標題＝權限名（改了權限名就要一起改，不准各叫各的）",
       APP.includes("<b>" + PERMS.prod.label + "</b>"), PERMS.prod.label);
    ok("看板上指派那張卡的標題＝權限名",
       APP.includes('T("🎬 ' + PERMS.assign.label + '給員工"'), PERMS.assign.label); }
  // 手機上勾不到＝這一頁沒用。桌機要 660px 才點得準，手機轉成直列卡片後那個寬度必須讓開，
  // 不然九欄的勾選框整排被推到畫面外（量過：表格 660px、容器只有 334px）。
  // ⚠️ 手機那一段在 index.html 裡比桌機那兩條**早**出現，所以只能靠選擇器權重壓過去 ——
  //    寫成同名的 table.permtable{min-width:0} 會被後面的 660px 蓋掉，而且畫面上看不出來。
  const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  ok("權限表用的是 class 不是行內的 min-width（行內樣式手機上蓋不掉）",
     h.includes('class="responsive permtable"') && h.includes("permwrap") && !/min-width:660px/.test(h));
  ok("**手機上那個 660px 有讓開**（不然九欄的勾選框整排在畫面外）",
     /table\.responsive\.permtable\{min-width:0\}/.test(HTML) &&
     /\.vidscroll\.permwrap\{[^}]*overflow:visible/.test(HTML));
  ok("（前提）桌機的 660px 還在，而且排在手機那一條後面",
     HTML.indexOf("table.permtable{min-width:660px}") > HTML.indexOf("table.responsive.permtable{min-width:0}")); }
// 例子改成 output／attend：v204 之後 perf 是剪輯的職位預設，那格會顯示「職位」不給勾，
// 拿它當「逐人勾起來」的例子測不到東西。
{ reset([U("管理員", "boss"), U("小葵", "editor", { perms: ["output", "lead"] })], "管理員", "boss");
  SET_TAB = "perms"; const h = viewSettings(); SET_TAB = "basic";
  ok("已經開的顯示成勾起來",
     /<input type="checkbox" checked[^>]*setMemberPerm\('小葵','output'/.test(h));
  ok("沒開的不勾", /<input type="checkbox" [^>]*setMemberPerm\('小葵','attend'/.test(h)
     && !/<input type="checkbox" checked[^>]*setMemberPerm\('小葵','attend'/.test(h));
  SET_TAB = "members"; const m = viewSettings(); SET_TAB = "basic";
  ok("成員表上看得到「開了幾項」，但改要去權限頁", m.includes("開了 2 項") && m.includes("setSetTab('perms')")); }

// ══════════ ⑧ 寫入：perms 與舊旗標要一起動 ══════════
(async () => {
  { reset([U("管理員", "boss"), U("小葵", "editor")], "管理員", "boss");
    setMemberPerm("小葵", "perf", true); await new Promise(r => setTimeout(r, 20));
    const w = WRITES.find(x => x[0] === "update" && x[1] === "users");
    ok("勾起來會寫 users", !!w, WRITES);
    ok("perms 寫進去了", w && (w[3].perms || []).includes("perf"), w && w[3]);
    ok("沒有舊旗標的權限就只寫 perms", w && Object.keys(w[3]).join() === "perms", w && w[3]);
    // ⚠️ v209：正式環境的災情 —— 勾中文名字的人，Firestore 回
    //    「No document to update: …/users/%E9%99%B3%E9%8B%92%EF%BC%88…」。
    //    setMemberPerm 把名字 encodeURIComponent 進網址，但 segOf() 從來不解碼，
    //    於是文件 id 變成那串百分號編碼，那個文件當然不存在。
    //    以前測不到是因為假的 DB 照單全收 —— 它不在乎 id 是不是真的有這個人。
    ok("**寫回去的 id 是他的名字，不是網址編碼過的字串**", w && w[2] === "小葵", w && w[2]); }
  // 真名實測：全形括號也會被編碼成 %EF%BC%88 / %EF%BC%89
  { reset([U("管理員", "boss"), U("陳鋒（原李浩）", "editor")], "管理員", "boss");
    setMemberPerm("陳鋒（原李浩）", "df", true); await new Promise(r => setTimeout(r, 20));
    const w = WRITES.find(x => x[0] === "update" && x[1] === "users");
    ok("名字有全形括號也一樣（陳鋒（原李浩）：正式環境就是這一筆爆的）",
       w && w[2] === "陳鋒（原李浩）", w && w[2]); }
  // ⚠️ 中文名字測不出「有沒有編碼」—— 解碼一串沒編碼過的中文，結果還是那串中文。
  //    真正會被網址吃掉的是 / ? # %，用這些才測得到編碼那一半。
  //    「/」尤其致命：沒編碼的話 segOf 會把名字從中間切成兩段，寫到別的地方去。
  { for (const nasty of ["王/小明", "阿#明", "九成九%的人", "問號?先生"]) {
      reset([U("管理員", "boss"), U(nasty, "editor")], "管理員", "boss");
      setMemberPerm(nasty, "perf", true); await new Promise(r => setTimeout(r, 20));
      const w = WRITES.find(x => x[0] === "update" && x[1] === "users");
      ok(`名字裡有網址的特殊字元也寫得對：${nasty}`, w && w[2] === nasty, w && w[2]);
    } }
  // segOf 直接測：壞掉的百分號不能讓整個動作當掉（decodeURIComponent 會丟例外）
  { let threw = false;
    try { segOf("/api/users/100%"); } catch (e) { threw = true; }
    ok("**路徑上有解不開的 % 也不會整個當掉**（解不開就照原樣用）", !threw);
    ok("（前提）解得開的照樣解得開", segOf("/api/users/" + encodeURIComponent("陳鋒（原李浩）"))[1] === "陳鋒（原李浩）",
       segOf("/api/users/" + encodeURIComponent("陳鋒（原李浩）"))[1]); }
  // 其他每一個會寫 users 的動作都走同一條路，一起釘住 ——
  // 這一條沒有的話，下一個人只修 setMemberPerm 就以為修完了。
  { const acts = [
      ["外包",     n => setMemberOutsourced(n, true)],
      ["換職位",   n => setMemberRole(n, "cs")],
      ["變動工時", n => setMemberFlex(n, true)],
      ["上下班",   n => setMemberHours(n, "09:00", null)],
      ["重設密碼", n => resetMemberPw(n)],
      ["刪除",     n => delMember(n)],
    ];
    // 用「陳鋒（原李浩）」測解碼那一半，用「王/小明」測編碼那一半
    for (const [label, run] of acts) {
      for (const who of ["陳鋒（原李浩）", "王/小明"]) {
        reset([U("管理員", "boss"), U(who, "editor")], "管理員", "boss");
        run(who); await new Promise(r => setTimeout(r, 20));
        const w = WRITES.find(x => x[1] === "users");
        ok(`「${label}」寫回去的也是名字本身（${who}）`, w && w[2] === who, w && w[2]);
      }
    } }
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
