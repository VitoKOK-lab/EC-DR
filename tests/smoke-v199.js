// v199 影片類型：用人標的 mainType，不要用留言率猜
//
// 我第一版是**算**出來的：每千次觀看 2 則留言以上算「賣貨型」。
// 老闆一句話打穿：「有時候大流量也可能很多人留言，我們真的要留言
// 也會引導觀眾留言。」—— 留言多是因為我們叫他們留言，那個數字量的不是
// 觀眾的反應，是我們自己下的決定。
// 我當時還拿「留言率高的片 89% 文案有 CTA」當驗證，那是循環論證。
//
// 系統裡早就有 mainType（剪輯選標籤自動帶出來的）。拿它跟我算的交叉比對：
// 人標「寵粉」的 10 支我全部算成賣貨型，打架 0 支 —— 我那個算法在有人標的
// 地方沒加任何價值，只在沒人標的 23 支上瞎猜。
//
// 但 mainType 這個欄位本身也是壞的：71 支「流量型」全是 createdAt 空的原始匯入資料，
// 其中 28 支還掛著「寵粉」標籤；而現在的建檔規則**根本產生不出「流量型」**
//（只認寵粉／帶貨／銷售 → 寵粉，代理／招商 → 代理招商，其他一律空白）。
// 所以 694 支是空的。
//
// 改成每次現算，三種互斥且窮盡：不是帶貨、不是招商，就是內容（流量型）。
// 標籤沒填的時候看文案裡有沒有叫人留言／下單 —— **這一條跟被退回的那個
// 留言率規則差在**：它讀的是我們自己寫了什麼（意圖），不是觀眾做了什麼（反應）。
// 用反應倒推意圖是循環論證，用我們寫的字判斷我們的意圖不是。
const fs = require("fs");
const path = require("path");
let src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8")
  .replace(/^let /gm, "").replace(/^const /gm, "");

const $ = {};
global.document = {
  getElementById: id => $[id] || null,
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener: () => {}, createElement: () => ({ style: {}, classList: { add(){}, remove(){}, contains(){return false} } }),
  body: { classList: { add(){}, remove(){}, contains(){return false} } },
};
global.window = { addEventListener: () => {}, location: { hash: "" }, matchMedia: () => ({ matches: false, addEventListener(){} }) };
global.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
global.navigator = { userAgent: "node" };
eval(src);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; } else { fail++; console.log("FAIL  " + n); } };

const V = (o) => Object.assign({ id: "X", name: "", rawName: "", videoCopy: "", tags: [], metrics: [] }, o);

// —— 三種互斥且窮盡，不會有「沒標」——
ok(vidType(V({ tags: ["寵粉"] })) === "寵粉", "標籤有寵粉 → 寵粉");
ok(vidType(V({ tags: ["帶貨"] })) === "寵粉", "帶貨也算");
ok(vidType(V({ tags: ["招商"] })) === "代理招商", "招商 → 代理招商");
ok(vidType(V({ tags: ["個人成長"] })) === "流量型", "內容標籤 → 流量型");
ok(vidType(V({ tags: [] })) === "流量型", "完全沒標籤也要給一個答案（三種窮盡）");
ok(vidType(V({ tags: ["招商", "寵粉"] })) === "代理招商", "兩種都有時，招商優先（它更明確）");

// —— 現算，不信資料庫裡那個矛盾的舊值 ——
ok(vidType(V({ mainType: "流量型", tags: ["寵粉"] })) === "寵粉",
   "存著「流量型」卻掛寵粉標籤的舊資料（正式資料有 28 支）→ 以標籤為準");
ok(vidType(V({ mainType: "", tags: ["寵粉"] })) === "寵粉", "存空值也不影響");

// —— 標籤沒填時看文案：讀我們寫了什麼，不是讀觀眾做了什麼 ——
ok(vidType(V({ name: "20260402鑽石不是最貴的寶石(留言：【寶石】我把完整的" })) === "寵粉",
   "片名寫著「留言：【寶石】」→ 寵粉（正式資料這支 405 則留言全場最高，卻因為沒標籤被判成流量型）");
ok(vidType(V({ videoCopy: "這次關鍵字「我要」獲取下單連結" })) === "寵粉", "「關鍵字」也算");
ok(vidType(V({ name: "中東女性包頭巾文化 #首頁連結加入溱姐寵粉社群 #珠寶" })) === "流量型",
   "⚠️「#首頁連結加入溱姐寵粉社群」只是社群導流，不是叫人留言 —— 不可以誤判成寵粉");
ok(vidType(V({ name: "成功男人 都寵妻嗎 #首頁連結加入溱姐寵粉社群" })) === "流量型",
   "同上（這支 74,688 觀看、39 則留言，是純內容）");

// —— 清單上不標流量型（多數的那一種標了等於沒標）——
ok(typeTagOf(V({ tags: ["寵粉"] })).includes("寵粉"), "清單上會標寵粉");
ok(typeTagOf(V({ tags: [] })) === "", "清單上不標流量型");
ok(typePill(V({ tags: [] })).includes("流量型"), "但成效頁三種都標（那一頁就是在看分類）");

// —— 留言率只是數字 ——
const 跨帳號 = V({ metrics: [{ views: 9000, comments: 2 }, { views: 1000, comments: 40 }] });
ok(vidViews(跨帳號) === 10000 && vidComments(跨帳號) === 42, "跨帳號的觀看與留言要加總");
ok(Math.abs(vidCommentRate(跨帳號) - 4.2) < 0.01,
   "留言率用加總後的數字算（分帳號各算會得出 0.2‰ 跟 40‰ 兩個都不對的答案）");
ok(!rateShown(V({ metrics: [{ views: 400, comments: 3 }] })),
   "觀看不到 5,000 不顯示留言率（1 則留言就能把它推到任何一邊）");
ok(vidCommentRate(V({})) === 0, "沒有觀看數時回 0，不是除以零");

// —— 整頁畫面 ——
const vids = [
  V({ id: "A", name: "片A 中東女性包頭巾文化", metrics: [{ views: 136419, comments: 9 }] }),
  V({ id: "B", name: "片B 兔耳歐泊套組", tags: ["寵粉"], metrics: [{ views: 33670, comments: 73 }] }),
  V({ id: "C", name: "片C 招商", tags: ["招商"], metrics: [{ views: 5574, comments: 11 }] }),
];
vids.forEach(v => { v.products = []; v.editor = "泓儒";
  v.metrics.forEach(m => { m.platform = "IG"; m.account = "IG 溱姐主"; m.likes = 10; }); });
global.window.DB = { videosWatched: () => true, netState: () => ({ online: true, pending: false }) };
localStorage.getItem = k => (k === "ecdr_role" ? "boss" : "管理員");
LAST_RAW = { users: [{ name: "管理員", role: "boss" }],
  settings: { dailyTarget: 4, videoTags: [], sources: [], postPlatforms: [], intlAccounts: [],
              shopeeAccounts: [], msAccounts: [], exchangeRates: {}, contacts: [] },
  schedule: {}, tasks: {}, shifts: {}, logs: [], deletedVideos: [], videos: vids };
STATE = decorate(LAST_RAW);
PERF_PLAT = null; PERF_KIND = null;
let html = viewPerf();
ok(["寵粉", "代理招商", "流量型"].every(k => html.includes("perfSetKind('" + k + "')")),
   "成效頁三種類型都有可以點的卡片");
ok(!html.includes("沒標類型"), "不會再有「沒標類型」（三種窮盡了）");
ok(!html.includes("泛流量") && !html.includes("賣貨型"), "也不會再有我自己編的那兩個名字");

PERF_KIND = "寵粉";
html = viewPerf();
ok(html.includes("只看寵粉"), "點了類型卡，標題會講清楚現在只看哪一種");
ok(html.includes("片B") && !html.includes("片A"), "只看寵粉的時候，流量型的片不在排行裡");
PERF_KIND = null;

console.log(`\n${pass} / ${pass + fail} 通過`);
if (fail) process.exit(1);
