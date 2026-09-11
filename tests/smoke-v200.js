// v200 二創建議：哪幾支片值得再剪一次
//
// 老闆的排法：「綜合排序，流量最重要，第二是留言，日期（第一次上傳日，
// 多久沒有二次使用，也不能太常用）」。「誰剪的」不進排序 —— 那是歸因，不是派工。
// 留言他選了「只跟同類型比」：寵粉片的留言是叫來的，拿去跟流量型比會佔便宜。
const fs = require("fs");
const path = require("path");
let src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8")
  .replace(/^let /gm, "").replace(/^const /gm, "");
const $ = {};
global.document = {
  getElementById: id => $[id] || null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener: () => {}, createElement: () => ({ style: {}, classList: { add(){}, remove(){}, contains(){return false} } }),
  body: { classList: { add(){}, remove(){}, contains(){return false} } },
};
global.window = { addEventListener: () => {}, location: { hash: "" }, matchMedia: () => ({ matches: false, addEventListener(){} }) };
global.localStorage = { getItem: k => (k === "ecdr_role" ? "boss" : "管理員"), setItem(){}, removeItem(){} };
global.navigator = { userAgent: "node" };
eval(src);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; } else { fail++; console.log("FAIL  " + n); } };

// 今天固定住，不然跨日測試會飄。（變數不能叫 T —— app.js 裡 T() 是中英切換）
const TODAY = todayTW();
const ago = d => { const x = new Date(TODAY + "T00:00:00"); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };
const V = (o) => Object.assign({ id: "X", name: "片", rawName: "", videoCopy: "", tags: [],
  metrics: [], usageHistory: [], products: [], lib: "" }, o);
const M = (views, comments) => [{ platform: "IG", account: "a", views, comments, likes: 0 }];

function boot(vids) {
  global.window.DB = { videosWatched: () => true, netState: () => ({ online: true, pending: false }) };
  LAST_RAW = { users: [{ name: "管理員", role: "boss" }],
    settings: { dailyTarget: 4, videoTags: [], sources: [], postPlatforms: [], intlAccounts: [],
                shopeeAccounts: [], msAccounts: [], exchangeRates: {}, contacts: [] },
    schedule: {}, tasks: {}, shifts: {}, logs: [], deletedVideos: [], videos: vids };
  STATE = decorate(LAST_RAW); RMK_OPEN = false;
}

// ══ 冷卻期：剛用過的先別再用 ══
// ⚠️ 這一條第一次做出來時，37 支候選有 36 支被它排除 —— 因為那時只抓了 30 天
//    的成效，而冷卻期也是 30 天，兩個 30 天互相抵銷。補抓半年之後才有東西可排。
boot([V({ id: "A", scheduledDate: ago(100), metrics: M(50000, 50) }),
      V({ id: "B", scheduledDate: ago(5), metrics: M(90000, 90) })]);
let r = rmkRank();
const byId = id => r.find(x => x.v.id === id);
ok(byId("B").score === 0, "5 天前才用過 → 不推薦（就算它觀看更高）");
ok(byId("A").score > 0, "100 天沒用的推薦");
ok(rmkWhyNot(byId("B")).includes("5 天前"), "而且要講出來為什麼不推薦");

// ══ 隔越久分數越高 ══
boot([V({ id: "C", scheduledDate: ago(35), metrics: M(10000, 10) }),
      V({ id: "D", scheduledDate: ago(70), metrics: M(10000, 10) }),
      V({ id: "E", scheduledDate: ago(120), metrics: M(10000, 10) })]);
r = rmkRank();
ok(r[0].v.id === "E" && r[2].v.id === "C", "成效一樣時，隔越久的排越前面");

// ══ 用過越多次越該讓它休息 ══
boot([V({ id: "F", scheduledDate: ago(100), metrics: M(10000, 10) }),
      V({ id: "G", scheduledDate: ago(100), metrics: M(10000, 10),
          usageHistory: [{ date: ago(200) }, { date: ago(300) }] })]);
r = rmkRank();
ok(byId("F").score > byId("G").score, "用過 1 次的排在用過 3 次的前面");
boot([V({ id: "H", scheduledDate: ago(100), metrics: M(99999, 999),
          usageHistory: [{ date: ago(150) }, { date: ago(200) }, { date: ago(250) }] })]);
ok(rmkRank()[0].score === 0, "用過 4 次就不推薦了（再高的成效也一樣）");
ok(rmkWhyNot(rmkRank()[0]).includes("4 次"), "並且說明是因為用太多次");

// ══ 熱度在同類型裡比 —— 老闆選的那條 ══
// 寵粉片的留言是「留言【寶石】」叫來的；流量型沒叫人留言。
// 混在一起比，流量型會因為「我們沒叫人留言」被系統性扣分。
boot([
  V({ id: "S1", tags: ["寵粉"], scheduledDate: ago(100), metrics: M(20000, 500) }),
  V({ id: "S2", tags: ["寵粉"], scheduledDate: ago(100), metrics: M(10000, 300) }),
  V({ id: "L1", name: "純內容", scheduledDate: ago(100), metrics: M(120000, 9) }),
  V({ id: "L2", name: "純內容二", scheduledDate: ago(100), metrics: M(20000, 4) }),
]);
r = rmkRank();
ok(byId("L1").heat > byId("L2").heat, "流量型裡面，觀看高的熱度高");
ok(byId("S1").heat > byId("S2").heat, "寵粉裡面也一樣");
ok(Math.abs(byId("L1").heat - byId("S1").heat) < 0.001,
   "各自類型的第一名熱度相同 —— 留言是跟同類型比的，不是拿 9 則去跟 500 則比");
ok(byId("L1").score > 0 && byId("L1").v.id === "L1", "12 萬觀看只有 9 則留言的純內容片照樣推薦得出來");

// 觀看 0.7、留言 0.3 —— 老闆：「流量最重要，第二是留言」。
// 要測得到這個比重，兩支片的觀看與留言必須**方向相反**，
// 不然誰重誰輕都排出一樣的順序（第一版就是這樣，測了等於沒測）。
boot([V({ id: "W1", name: "高觀看低留言", scheduledDate: ago(100), metrics: M(120000, 5) }),
      V({ id: "W2", name: "低觀看高留言", scheduledDate: ago(100), metrics: M(20000, 200) })]);
r = rmkRank();
ok(r[0].v.id === "W1",
   "12 萬觀看但只有 5 則留言，排在 2 萬觀看 200 則留言的前面（流量最重要）");

// ══ 沒有成效、沒排過、太冷門的不進候選 ══
boot([V({ id: "N1", scheduledDate: ago(100) }),
      V({ id: "N2", scheduledDate: ago(100), metrics: M(400, 3) }),
      V({ id: "N3", metrics: M(50000, 50) }),
      V({ id: "Y1", scheduledDate: ago(100), metrics: M(50000, 50) })]);
ok(rmkPool().length === 1 && rmkPool()[0].id === "Y1", "沒成效／觀看不到 5,000／沒排過上片日的都不進候選");

// ══ 同分不會因為排序順序而分高下 ══
ok(rmkPct([10, 20, 20, 30], 20) === 0.5, "百分位：一樣的算半分（兩支同分不會一前一後）");
ok(rmkPct([], 5) === 0, "空的不會除以零");

// ══ 畫面 ══
boot([V({ id: "P1", name: "推薦的片", scheduledDate: ago(100), metrics: M(50000, 50), editor: "泓儒" }),
      V({ id: "P2", name: "剛用過的片", scheduledDate: ago(3), metrics: M(90000, 90), editor: "健加" })]);
let html = viewVideosDF();
ok(html.includes("二創建議"), "大流量影片那一頁看得到「二創建議」");
ok(html.includes("推薦的片"), "推薦的片在表上");
ok(!html.split("現在先不推薦的")[0].includes("剛用過的片"), "剛用過的片不在推薦表裡");
ok(html.includes("3 天前才用過"), "但在「為什麼不推薦」那一段講得出原因");
ok(html.includes("<th>上次誰剪</th>"), "看得到上次誰剪的（那是歸因用的，不影響排序）");
ok(html.includes("多久沒用"), "看得到隔多久沒用");

boot([]);
ok(viewVideosDF().indexOf("二創建議") === -1, "完全沒有成效資料時，不要擺一張空卡在那裡");

console.log(`\n${pass} / ${pass + fail} 通過`);
if (fail) process.exit(1);
