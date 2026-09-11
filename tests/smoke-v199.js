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
// 所以：類型看 mainType，留言率只當數字擺旁邊。
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

// —— 真實數字（2026-09-11 第一次同步寫進資料庫的那一批）——
const 包頭巾 = { id: "V283", mainType: "", metrics: [{ views: 136419, comments: 9 }] };
const 兔耳歐泊 = { id: "X2", mainType: "寵粉", metrics: [{ views: 33670, comments: 73 }] };
const 招商片 = { id: "X4", mainType: "代理招商", metrics: [{ views: 5574, comments: 11 }] };
const 流量片 = { id: "X5", mainType: "流量型", metrics: [{ views: 16165, comments: 31 }] };

// —— 類型是人標的，不是算的 ——
ok(vidType(兔耳歐泊) === "寵粉", "類型直接讀 mainType");
ok(vidType(包頭巾) === "", "沒標就是沒標，不要幫他猜一個");
ok(typePill(兔耳歐泊).includes("寵粉"), "標籤印得出來");
ok(typePill(包頭巾) === "", "沒標就不要印一個空標籤");
ok(typePill(流量片).includes("流量型"), "流量型也要印（舊的 typeTag 只認寵粉與代理招商，看不到它）");

// —— 留言率只是數字，不是結論 ——
ok(Math.abs(vidCommentRate(兔耳歐泊) - 2.168) < 0.01, "留言率＝每千次觀看的留言數");
ok(vidCommentRate({ metrics: [] }) === 0, "沒有觀看數時回 0，不是除以零");
const 跨帳號 = { metrics: [{ views: 9000, comments: 2 }, { views: 1000, comments: 40 }] };
ok(vidViews(跨帳號) === 10000 && vidComments(跨帳號) === 42, "跨帳號的觀看與留言要加總");
ok(Math.abs(vidCommentRate(跨帳號) - 4.2) < 0.01,
   "留言率用加總後的數字算（分帳號各算會得出 0.2‰ 跟 40‰ 兩個都不對的答案）");

// —— 分母太小就不要秀留言率 ——
ok(!rateShown({ metrics: [{ views: 400, comments: 3 }] }),
   "觀看不到 5,000 不顯示留言率（1 則留言就能把它推到任何一邊）");
ok(rateShown({ metrics: [{ views: 5000, comments: 0 }] }), "到門檻就顯示");
ok(!rateShown({ metrics: [] }), "沒有成效的片沒有留言率可言");

// —— 整頁畫面 ——
const vids = [包頭巾, 兔耳歐泊, 招商片, 流量片];
vids.forEach(v => { v.name = "片" + v.id; v.products = []; v.editor = "泓儒";
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
// 驗卡片要看那顆按鈕，不能只看字串有沒有出現 ——
// 「代理招商」本來就會出現在表格列裡，只檢查字串的話拿掉卡片也照樣通過。
ok(["寵粉", "代理招商", "流量型"].every(k => html.includes("perfSetKind('" + k + "')")),
   "成效頁三種類型都有可以點的卡片");
ok(html.includes("沒標類型"), "沒標的那一堆也要單獨列出來（那是待辦，不是一種類型）");
ok(!html.includes("泛流量") && !html.includes("賣貨型"),
   "不要再出現我自己編的那兩個名字（系統裡沒有這種東西）");
ok(html.includes("<th>類型</th>") && html.includes("<th>留言</th>"), "排行表有類型與留言欄");

PERF_KIND = "寵粉";
html = viewPerf();
ok(html.includes("只看寵粉"), "點了類型卡，標題會講清楚現在只看哪一種");
ok(html.includes("片X2") && !html.includes("片V283"), "只看寵粉的時候，其他類型不在排行裡");
PERF_KIND = "（沒標）";
html = viewPerf();
ok(html.includes("片V283") && !html.includes("片X2"), "「沒標類型」篩得出沒標的那幾支");
PERF_KIND = null;

console.log(`\n${pass} / ${pass + fail} 通過`);
if (fail) process.exit(1);
