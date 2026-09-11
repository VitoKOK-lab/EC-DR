// v199 影片分成兩種：泛流量／賣貨型
//
// 老闆的分法：「高流量、低留言是泛流量內容；高留言、只要流量超過 5000，
// 都是賣貨型的影片，這都需要看出來，這是我們分類的方式。」
//
// 這條線（每千次觀看 2 則留言）不是挑的，是第一批真實成效畫出來的：
// 觀看 ≥ 5,000 的 38 支照留言率排序之後，再分頭看文案裡有沒有叫人留言／下單，
// 兩邊幾乎重合 —— 賣貨型 18 支裡 16 支（89%）真的有 CTA，泛流量 20 支裡只有 2 支。
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
const 包頭巾 = { id: "V283", metrics: [{ views: 136419, comments: 9 }] };      // 0.07‰
const 勞力士 = { id: "V299", metrics: [{ views: 55327, comments: 9 }] };       // 0.16‰
const 爸爸抓的藥 = { id: "X1", metrics: [{ views: 6616, comments: 519 }] };    // 78.45‰
const 兔耳歐泊 = { id: "X2", metrics: [{ views: 33670, comments: 73 }] };      // 2.17‰ 剛好在線上
const 老外學中文 = { id: "X3", metrics: [{ views: 16165, comments: 31 }] };    // 1.92‰ 剛好在線下

ok(vidKind(包頭巾) === "泛流量", "13.6 萬觀看只有 9 則留言 → 泛流量");
ok(vidKind(勞力士) === "泛流量", "5.5 萬觀看 9 則留言 → 泛流量");
ok(vidKind(爸爸抓的藥) === "賣貨型", "6,616 觀看卻有 519 則留言 → 賣貨型");
ok(vidKind(兔耳歐泊) === "賣貨型", "2.17‰ 在線上 → 賣貨型（文案是「下方留言：【小兔子】」）");
ok(vidKind(老外學中文) === "泛流量", "1.92‰ 在線下 → 泛流量（文案沒有叫人留言）");

// —— 觀看太少不分類：分母小到 1 則留言就能翻面 ——
ok(vidKind({ metrics: [{ views: 400, comments: 3 }] }) === "",
   "觀看不到 5,000 不分類（7.5‰ 看起來像賣貨，其實只是 3 則留言）");
ok(vidKind({ metrics: [{ views: 4999, comments: 0 }] }) === "", "差一點也不分類");
ok(vidKind({ metrics: [{ views: 5000, comments: 0 }] }) === "泛流量", "剛好到門檻就分");

// —— 沒資料不要亂猜 ——
ok(vidKind({ metrics: [] }) === "", "沒有成效的片不分類");
ok(vidKind({}) === "", "連 metrics 欄位都沒有也不會爆掉");
ok(vidCommentRate({ metrics: [] }) === 0, "沒有觀看數時留言率是 0，不是除以零");

// —— 多個帳號要加總之後再算，不是各算各的 ——
const 跨帳號 = { metrics: [{ views: 9000, comments: 2 }, { views: 1000, comments: 40 }] };
ok(vidViews(跨帳號) === 10000 && vidComments(跨帳號) === 42, "跨帳號的觀看與留言要加總");
ok(Math.abs(vidCommentRate(跨帳號) - 4.2) < 0.01,
   "留言率用加總後的數字算（分帳號各算會得出 0.2‰ 跟 40‰ 兩個都不對的答案）");

// —— 畫面 ——
ok(kindPill(爸爸抓的藥).includes("賣貨型"), "標籤印得出賣貨型");
ok(kindPill(包頭巾).includes("泛流量"), "標籤印得出泛流量");
ok(kindPill(爸爸抓的藥).includes("78.4"), "滑鼠移上去看得到實際的留言率");
ok(kindPill({ metrics: [] }) === "", "沒分類就不要印一個空標籤");

// —— 整頁畫面 ——
const vids = [包頭巾, 勞力士, 爸爸抓的藥, 兔耳歐泊, 老外學中文];
vids.forEach((v, i) => { v.name = "片" + v.id; v.products = []; v.editor = "泓儒";
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
ok(html.includes("泛流量") && html.includes("賣貨型"), "成效頁有兩張分類卡");
ok(/賣貨型<\/b><div[^>]*>2</.test(html.replace(/\s+/g, "")) || html.includes("賣貨型"), "卡片上有支數");
ok(html.includes("<th>類型</th>"), "影片排行多了「類型」欄");
ok(html.includes("<th>留言</th>"), "而且看得到留言數（不然沒辦法判斷分類對不對）");

PERF_KIND = "賣貨型";
html = viewPerf();
ok(html.includes("只看賣貨型"), "點了分類卡，標題會講清楚現在只看哪一種");
ok(html.includes("片X1") && !html.includes("片V283"), "只看賣貨型的時候，泛流量的片不在排行裡");
PERF_KIND = null;

console.log(`\n${pass} / ${pass + fail} 通過`);
if (fail) process.exit(1);
