// v220 / 飛輪：把選品接到後面的步驟，成效再回到選品
//
// 老闆：「這一頁要怎連到後面的步驟？」→「一、完整飛輪（八步）」（要我把整條做完）
//
// 這一支守的是**接縫**，不是單一畫面：
//   ① 急件商品 → 開新片時自動是急件、上片日預設那天（行銷不用填第二次）
//   ② 選品頁上面那條「急件／缺圖文」篩選，急件還沒排片的數字要對
//   ③ 看板「急件還沒排片」：只列一支片都沒開的；開了就消失
//   ④ 看板「待拍」：排了片、還沒有毛片；毛片上傳了就消失；急件先
//   ⑤ 選品頁「以前選過、成效好、這個月還沒選」→ 一鍵加進這個月（舊的月份不能丟）
//   ⑥ 看板「上片連結」：最近要補的要列出來、一鍵開片
const fs = require("fs"), path = require("path");
const APP = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
let src = APP.replace(/^let /gm, "").replace(/^const /gm, "");
const el = () => ({ value: "", innerHTML: "", textContent: "", className: "", style: {}, checked: false,
  tagName: "DIV", dataset: {}, disabled: false, readOnly: false, isConnected: true, scrollTop: 0, rows: 1,
  classList: { toggle(){}, add(){}, remove(){}, contains(){ return false; } },
  addEventListener(){}, appendChild(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
  getAttribute(){ return null; }, setAttribute(){}, closest(){ return null; }, focus(){}, click(){},
  insertAdjacentHTML(p, h){ this.innerHTML += h; }, getBoundingClientRect(){ return { top:0,left:0,bottom:0,right:0 }; } });
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
let modalHTML = "", fields = {};
// showModal 把確認鍵掛在 getElementById("modalConfirm").onclick 上，要給穩定的同一個節點才按得到
const confirmBtn = el();
async function MODAL_CONFIRM(){ if (typeof confirmBtn.onclick === "function") return await confirmBtn.onclick(); }
global.document = { getElementById: (id) => {
    if (id === "modalConfirm") return confirmBtn;
    if (Object.prototype.hasOwnProperty.call(fields, id)) { const e = el();
      Object.defineProperty(e, "value", { get(){ return fields[id]; }, set(v){ fields[id] = v; } }); return e; }
    const e = el();
    if (id === "modalRoot") Object.defineProperty(e, "innerHTML", { set(v){ modalHTML = v; }, get(){ return modalHTML; } });
    return e; },
  get activeElement(){ return null; }, addEventListener(){}, createElement: () => el(),
  body: { classList: { toggle(){}, add(){}, remove(){} } }, querySelector: () => null, querySelectorAll: () => [] };
global.window = { addEventListener(){}, innerWidth: 1200, innerHeight: 800, scrollY: 0, scrollTo(){}, DB: null,
  location: { reload(){} }, open: () => ({}) };
global.requestAnimationFrame = (f) => f(); global.navigator = { onLine: true };
global.confirm = () => true; global.prompt = () => null;
eval(src);
const FROZEN = new Date(Date.now() + 288e5).toISOString().slice(0, 8) + "15";
todayTW = () => FROZEN; ydayTW = () => FROZEN.slice(0, 8) + "14"; refreshToday();
const YM = FROZEN.slice(0, 7);
const PREV_YM = (() => { const [y, m] = YM.split("-").map(Number); return m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,"0")}`; })();
let TOASTS = []; toast = (m) => { TOASTS.push(String(m || "")); };

let pass = 0, fail = 0;
function ok(n, c, x) { if (c) { pass++; } else { fail++; console.log("FAIL  " + n, x === undefined ? "" : JSON.stringify(x).slice(0, 240)); } }
let W = [];
function reset(users, who, role) {
  modalHTML = ""; fields = {}; VIEW_AS = null; BRAND = ""; CUR_YM = null; CUR_FILTER = null; CUR_TAB = null; W = []; TOASTS = [];
  global.window.DB = { set: async (c,id,o)=>{ W.push(["set",c,id,o]); }, update: async (c,id,p)=>{ W.push(["update",c,id,p]); }, del: async () => {},
    scheduleSet: async () => {}, setSettings: async () => {},
    videosWatched: () => true, netState: () => ({ online: true, pending: false }) };
  const raw = { users: users || [], settings: { dailyTarget: 4, videoTags: [], sources: [], postPlatforms: [],
      intlAccounts: [], shopeeAccounts: [], msAccounts: [], exchangeRates: {}, contacts: [], reviewSince: "2020-01-01" },
    schedule: {}, tasks: {}, shifts: {}, logs: [], deletedVideos: [], videos: [], products: [] };
  LAST_RAW = raw; STATE = decorate(raw);
  localStorage.setItem("ecdr_user", who || "管理員"); localStorage.setItem("ecdr_role", role || "boss");
}
const U = (name, role, extra) => Object.assign({ name, role }, extra || {});
const BASE = "https://www.tzgrotw.tw";
const PD = (o) => Object.assign({ id: "PD1", name: "品", officialUrl: BASE + "/products/a",
  picks: [{ month: YM, by: "小設", at: "" }], fetchStatus: "ok", priceMin: 0, priceMax: 0, listMin: 0, listMax: 0, variants: [] }, o || {});
const VD = (o) => Object.assign({ id: "V1", name: "片", rawName: "", videoCopy: "口播台詞", tags: [],
  stage: "待處理", products: [], metrics: [], usageHistory: [], lib: "", locale: "", channel: "",
  sourceVideoId: "", editor: "", claimedBy: "", assignedTo: "", createdAt: "", productUrl: "", scheduledDate: null, publishedLink: "", shotAt: "", rawLink: "" }, o || {});
function withData(prods, vids, who, role, perms) {
  reset([U(who || "管理員", role || "boss", { perms: perms || [] })], who || "管理員", role || "boss");
  LAST_RAW.products = prods || []; LAST_RAW.videos = vids || []; STATE = decorate(LAST_RAW);
}
const wait = (ms) => new Promise(r => setTimeout(r, ms || 15));
const PURL = BASE + "/products/急件品";

(async () => {
// ══════════ ① 急件商品 → 開新片就是急件 ══════════
{ withData([PD({ id: "U1", name: "急件品", officialUrl: PURL, urgentDate: "2026-10-05" })], [], "小行", "mkt", ["curate", "plan"]);
  modalHTML = ""; curNewVideo("U1");
  ok("**開新片的視窗先講這是急件**", /急件/.test(modalHTML) && /10-05 前/.test(modalHTML), modalHTML.match(/急件[^<]*/)?.[0]);
  ok("**上片日預設就是急件的日期**", /id="sv_date" type="date" value="2026-10-05"/.test(modalHTML), modalHTML.match(/sv_date[^>]*/)?.[0]);
  // 真的按下去存：把必填欄位填好
  fields.sv_lang = ""; fields.sv_name = "急件的片"; fields.sv_link = "https://drive.google.com/drive/folders/X";
  fields.sv_vcopy = "要講什麼"; fields.sv_date = "2026-10-05"; fields.sv_time = "10:00";
  fields.sv_pn0 = "急件品"; fields.sv_pp0 = ""; fields.sv_ps0 = ""; fields.sv_pl0 = PURL;
  await MODAL_CONFIRM(); await wait();
  const w = W.find(x => x[0] === "set" && x[1] === "videos");
  ok("**存進去的片是急件**（欄位跟主管按的那顆一樣：urgent／urgentAt／urgentBy）",
     !!w && w[3].urgent === true && !!w[3].urgentAt && w[3].urgentBy === "小行", w && { urgent: w[3].urgent, by: w[3].urgentBy });
  ok("上片日跟著急件日期", !!w && w[3].scheduledDate === "2026-10-05");
  ok("商品連結有帶（之後「賣過它的片」才對得回來）", !!w && w[3].products?.[0]?.link === PURL, w && w[3].products);
  // 不是急件的品：什麼都不帶
  withData([PD({ id: "N1", name: "普通品", officialUrl: BASE + "/products/n" })], [], "小行", "mkt", ["curate", "plan"]);
  modalHTML = ""; curNewVideo("N1");
  ok("不是急件的品開新片，視窗不提急件、日期空白", !/急件/.test(modalHTML) && /id="sv_date" type="date" value=""/.test(modalHTML));
  fields.sv_lang = ""; fields.sv_name = "普通的片"; fields.sv_link = "https://drive.google.com/drive/folders/Y";
  fields.sv_vcopy = "講"; fields.sv_date = "2026-10-20"; fields.sv_time = "10:00"; fields.sv_pn0 = "";
  await MODAL_CONFIRM(); await wait();
  const w2 = W.find(x => x[0] === "set" && x[1] === "videos");
  ok("**不是急件就不寫 urgent**", !!w2 && !w2[3].urgent, w2 && w2[3].urgent); }

// ══════════ ② 選品頁上面那條 ══════════
{ const P = (id, name, extra) => PD(Object.assign({ id, name, officialUrl: BASE + "/products/" + id }, extra || {}));
  withData([ P("A", "普通"), P("B", "急件沒片", { urgentDate: "2026-10-01" }), P("C", "急件有片", { urgentDate: "2026-10-02" }),
             P("D", "缺圖文", { noasset: true }) ],
           [ VD({ id: "V1", products: [{ name: "急件有片", link: BASE + "/products/C" }] }) ], "小設", "design", ["curate"]);
  const page = viewCurate();
  ok("**篩選條：急件 2・1 個還沒排片**（有片的那個不算）", /急件 2・1 個還沒排片/.test(page), page.match(/急件 \d[^<]*/)?.[0]);
  ok("篩選條：缺圖文 1", /缺圖文 1</.test(page));
  ok("沒篩選時四個品都在", ["普通", "急件沒片", "急件有片", "缺圖文"].every(n => page.includes(n)));
  CUR_FILTER = "urgent"; const pu = viewCurate();
  ok("**按「急件」只剩急件的品**", pu.includes("急件沒片") && pu.includes("急件有片") && !pu.includes(">普通</a>") && !pu.includes(">缺圖文</a>"), pu.match(/>[^<]*<\/a>/g));
  CUR_FILTER = "noasset"; const pn = viewCurate();
  ok("按「缺圖文」只剩缺圖文的品", pn.includes(">缺圖文</a>") && !pn.includes("急件沒片") && !pn.includes(">普通</a>"), pn.match(/>[^<]*<\/a>/g));
  CUR_FILTER = null;
  withData([P("A", "普通")], [], "小設", "design", ["curate"]);
  ok("沒有任何狀態就不畫那條", !/curSetFilter/.test(viewCurate()));
  withData([P("A", "普通")], [], "小設", "design", ["curate"]);
  CUR_FILTER = "urgent";
  ok("篩選到沒東西要講清楚、不是留白", /沒有急件的品/.test(viewCurate()), viewCurate().match(/card muted[^<]*/)?.[0]);
  CUR_FILTER = null; }

// ══════════ ③ 看板：急件還沒排片 ══════════
{ const P = (id, name, extra) => PD(Object.assign({ id, name, officialUrl: BASE + "/products/" + id }, extra || {}));
  withData([ P("B", "急件沒片", { urgentDate: "2026-10-01" }), P("C", "急件有片", { urgentDate: "2026-10-02" }),
             P("L", "過期急件", { urgentDate: FROZEN.slice(0, 8) + "01" }), P("A", "普通") ],
           [ VD({ id: "V1", products: [{ name: "急件有片", link: BASE + "/products/C" }] }) ]);
  const b = viewBoard();
  ok("**管理員看板有「急件還沒排片」**", /急件還沒排片/.test(b));
  ok("列的是一支片都沒開的（有片的不列）", b.includes("急件沒片") && b.includes("過期急件") && !/急件有片/.test(b.split("急件還沒排片")[1].split("</div></div>")[0]));
  ok("**過期的算出來**", /1 個已過日期/.test(b), b.match(/\d 個已過日期/)?.[0]);
  ok("日期早的排前面", b.indexOf("過期急件") < b.indexOf("急件沒片"));
  ok("每一列都有「排片」開商品視窗", /onclick="curOpen\('L'\)"[^>]*>排片</.test(b) && /onclick="curOpen\('B'\)"[^>]*>排片</.test(b));
  withData([ P("C", "急件有片", { urgentDate: "2026-10-02" }) ], [ VD({ id: "V1", products: [{ name: "急件有片", link: BASE + "/products/C" }] }) ]);
  ok("全部都排了就整張卡不畫", !/急件還沒排片/.test(viewBoard()));
  // 只給看得到選品、排得了片的人 —— Regina（經理人）沒勾這兩項就不畫
  withData([ P("B", "急件沒片", { urgentDate: "2026-10-01" }) ], [], "Regina", "manager", ["lead"]);
  ok("經理人沒有選品／排影片權限就不畫這張", !/急件還沒排片/.test(viewBoard()));
  withData([ P("B", "急件沒片", { urgentDate: "2026-10-01" }) ], [], "Regina", "manager", ["lead", "curate", "plan"]);
  ok("勾了就有", /急件還沒排片/.test(viewBoard())); }

// ══════════ ④ 看板：待拍 ══════════
{ withData([], [ VD({ id: "S1", name: "還沒拍的", scheduledDate: "2026-10-20", products: [{ name: "戒指" }] }),
                 VD({ id: "S2", name: "急的還沒拍", scheduledDate: "2026-10-25", urgent: true }),
                 VD({ id: "S3", name: "已上傳毛片", scheduledDate: "2026-10-01", shotAt: "2026-09-10T10:00:00" }),
                 VD({ id: "S4", name: "已認領", claimedBy: "阿剪" }),
                 VD({ id: "S5", name: "大流的成品", lib: "大流" }),
                 VD({ id: "S6", name: "二創殼", channel: "remake", sourceVideoId: "S3" }) ]);
  const b = viewBoard();
  ok("**看板有「待拍」**", /待拍（排了片、還沒有毛片）/.test(b));
  const seg = b.split("待拍（排了片")[1].split("</details>")[0];
  ok("只列還沒有毛片的一創（上傳了、認領了、大流、二創殼都不算）",
     seg.includes("還沒拍的") && seg.includes("急的還沒拍") && !seg.includes("已上傳毛片") && !seg.includes("已認領") && !seg.includes("大流的成品") && !seg.includes("二創殼"));
  ok("**急件排最前面**（就算日期比較晚）", seg.indexOf("急的還沒拍") < seg.indexOf("還沒拍的"));
  ok("文案跟商品都印出來（看完就能去拍）", seg.includes("口播台詞") && seg.includes("🛒 戒指"));
  ok("點片名開得了片", /editVideo\('S1'\)/.test(seg));
  ok("數字對：2 支", /待拍（排了片、還沒有毛片）<span class="n">2<\/span>/.test(b), b.match(/待拍[^<]*<span class="n">\d+/)?.[0]);
  withData([], [ VD({ id: "S3", shotAt: "2026-09-10T10:00:00" }) ]);
  ok("都拍好了就整張卡不畫", !/待拍（排了片/.test(viewBoard())); }

// ══════════ ⑤ 成效回到選品：以前選過、這個月還沒選 ══════════
{ const P = (id, name, extra) => PD(Object.assign({ id, name, officialUrl: BASE + "/products/" + id }, extra || {}));
  withData([ P("R1", "上月紅品", { picks: [{ month: PREV_YM, by: "小設", at: "" }] }),
             P("R2", "上月普通品", { picks: [{ month: PREV_YM, by: "小設", at: "" }] }),
             P("R3", "這個月已選", { picks: [{ month: PREV_YM, by: "小設", at: "" }, { month: YM, by: "小設", at: "" }] }) ],
           [ VD({ id: "V1", stage: "已完成", products: [{ name: "上月紅品", link: BASE + "/products/R1" }], metrics: [{ platform: "IG", account: "a", views: 12000, postId: "p1" }] }),
             VD({ id: "V2", stage: "已完成", products: [{ name: "這個月已選", link: BASE + "/products/R3" }], metrics: [{ platform: "IG", account: "a", views: 99000, postId: "p2" }] }) ],
           "小設", "design", ["curate"]);
  const page = viewCurate();
  ok("**選品頁上面有「以前選過、成效好、這個月還沒選」**", /成效好、這個月還沒選/.test(page));
  const seg = page.split("成效好、這個月還沒選")[1].split("</div></div>")[0];
  ok("列有成效的（上月紅品），沒成效的（上月普通品）跟這個月已選的不列",
     seg.includes("上月紅品") && !seg.includes("上月普通品") && !seg.includes("這個月已選"), seg.slice(0, 200));
  ok("寫出觀看數跟上次選的月份", /觀看 12,000/.test(seg) && seg.includes("上次 " + PREV_YM.replace("-", "/")));
  ok("有「再選這個月」鍵", /onclick="curRepick\('R1'\)"/.test(seg));
  // 真的按下去
  W = []; curRepick("R1"); await wait();
  const w = W.find(x => x[0] === "update" && x[1] === "products" && x[2] === "R1");
  ok("**再選：這個月加進 picks，上個月的還在**", !!w && Array.isArray(w[3].picks) && w[3].picks.length === 2 && w[3].picks[0].month === PREV_YM && w[3].picks[1].month === YM && w[3].picks[1].by === "小設", w && w[3].picks);
  ok("只動 picks 這一格", !!w && Object.keys(w[3]).every(k => ["picks", "updatedAt"].includes(k)), w && Object.keys(w[3]));
  W = []; curRepick("R3"); await wait();
  ok("這個月已經選過的不再寫一次", !W.some(x => x[1] === "products"), W);
  // 沒權限的人按不動（直接呼叫也擋）
  withData([ P("R1", "上月紅品", { picks: [{ month: PREV_YM, by: "小設", at: "" }] }) ], [], "小行", "mkt", ["plan"]);
  W = []; curRepick("R1"); await wait();
  ok("**沒有選品權限的人直接呼叫也擋得住**", !W.some(x => x[1] === "products") && TOASTS.some(t => /權限/.test(t)), W);
  // 看的是別的月份時不畫（那是歷史頁）
  withData([ P("R1", "上月紅品", { picks: [{ month: PREV_YM, by: "小設", at: "" }] }) ],
           [ VD({ id: "V1", stage: "已完成", products: [{ name: "上月紅品", link: BASE + "/products/R1" }], metrics: [{ platform: "IG", account: "a", views: 500, postId: "p1" }] }) ], "小設", "design", ["curate"]);
  CUR_YM = PREV_YM;
  ok("看上個月的清單時不畫這張（它只跟這個月有關）", !/成效好、這個月還沒選/.test(viewCurate()));
  CUR_YM = null; }

// ══════════ ⑥ 看板：上片連結，最近要補的列出來 ══════════
{ const Y = FROZEN.slice(0, 8) + "14";
  withData([], [ VD({ id: "P1", name: "昨天上的沒連結", stage: "已完成", scheduledDate: Y }),
                 VD({ id: "P2", name: "昨天上的有連結", stage: "已完成", scheduledDate: Y, publishedLink: "https://www.facebook.com/x/posts/1" }),
                 VD({ id: "P3", name: "同步對到的", stage: "已完成", scheduledDate: Y, metrics: [{ platform: "FB", account: "a", views: 1, postId: "z", link: "https://www.facebook.com/x/posts/2" }] }) ]);
  const b = viewBoard();
  const seg = (b.split("🔗 上片連結")[1] || "").split("</div>\n  </div>")[0];
  ok("**最近要補的那支列出來、有「補連結」鍵**", seg.includes("昨天上的沒連結") && /editVideo\('P1'\)"[^>]*>補連結</.test(seg), seg.slice(0, 300));
  ok("有連結的、同步對到的不列", !seg.includes("昨天上的有連結") && !seg.includes("同步對到的")); }

// ══════════ goTab：只跳得到自己有的分頁 ══════════
{ withData([], [], "小設", "design", ["curate"]);
  TOASTS = [];
  ok("**設計師跳「影片庫」被擋、講清楚**", goTab("videos") === false && TOASTS.some(t => /權限/.test(t)) && CUR_TAB === null);
  ok("跳自己有的分頁可以", goTab("curate") === true && CUR_TAB === "curate"); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
