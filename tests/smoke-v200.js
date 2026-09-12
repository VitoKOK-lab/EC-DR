// v200 二創建議選單 ＋ 從商品找影片
//
// 老闆的排法：「綜合排序，流量最重要，第二是留言，日期（第一次上傳日，
// 多久沒有二次使用，也不能太常用）」；「誰剪的」不進排序（那是歸因不是派工）；
// 留言「只跟同類型比」。
// 後來補的需求：「我也需要有搜尋能力，有時候是先有商品，再來找能用的影片。」
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
global.localStorage = { getItem: k => (k === "ecdr_role" ? "boss" : "管理員"), setItem(){}, removeItem(){} };
global.navigator = { userAgent: "node" };
eval(src);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; } else { fail++; console.log("FAIL  " + n); } };
const D = (n) => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const V = (o) => Object.assign({ id: "X", name: "", rawName: "", videoCopy: "", tags: [],
  products: [], metrics: [], usageHistory: [], lib: "", locale: "", channel: "", sourceVideoId: "" }, o);
const M = (views, comments) => [{ platform: "IG", account: "IG a", views, comments, likes: 0 }];

function mount(vids) {
  global.window.DB = { videosWatched: () => true, netState: () => ({ online: true, pending: false }) };
  LAST_RAW = { users: [{ name: "管理員", role: "boss" }],
    settings: { dailyTarget: 4, videoTags: [], sources: [], postPlatforms: [], intlAccounts: [],
                shopeeAccounts: [], msAccounts: [], exchangeRates: {}, contacts: [] },
    schedule: {}, tasks: {}, shifts: {}, logs: [], deletedVideos: [], videos: vids };
  STATE = decorate(LAST_RAW); RMK_Q = ""; RMK_OPEN = false;
}

// ══════════ 冷卻期：剛用過的先別再用 ══════════
// ⚠️ 這一條第一次做出來時把 37 支候選擋掉 36 支 —— 因為那時只抓 30 天的成效，
//    而冷卻期也是 30 天，兩個 30 天互相抵銷，池子必然是空的。補抓半年才有東西可排。
const 剛用過 = V({ id: "A", name: "片A", scheduledDate: D(5), metrics: M(50000, 100) });
const 久沒用 = V({ id: "B", name: "片B", scheduledDate: D(100), metrics: M(50000, 100) });
mount([剛用過, 久沒用]);
let r = rmkRank();
ok(r.find(x => x.v.id === "A").score === 0, "5 天前才用過 → 不推薦");
ok(r.find(x => x.v.id === "B").score > 0, "100 天沒用 → 推薦");
ok(r[0].v.id === "B", "推薦的排在前面");
ok(rmkWhyNot(r.find(x => x.v.id === "A")).includes("5 天前"), "而且講清楚為什麼不推薦");

// ══════════ 用過越多次，越該讓它休息 ══════════
const 用一次 = V({ id: "C", name: "片C", scheduledDate: D(100), metrics: M(50000, 100) });
const 用三次 = V({ id: "D", name: "片D", scheduledDate: D(100), metrics: M(50000, 100),
                usageHistory: [{ date: D(200) }, { date: D(300) }] });
const 用五次 = V({ id: "E", name: "片E", scheduledDate: D(100), metrics: M(50000, 100),
                usageHistory: [{ date: D(200) }, { date: D(300) }, { date: D(400) }, { date: D(500) }] });
mount([用一次, 用三次, 用五次]);
r = rmkRank();
const sc = id => r.find(x => x.v.id === id).score;
ok(sc("C") > sc("D") && sc("D") > 0, "用過 3 次的分數比用過 1 次的低，但還在");
// v204 老闆改的：「用過幾次 不要四個就歸 0，還是能用，只是上面要註明一個小數字，
// 已經用過幾次。」—— 所以 5 次還是排得出來，只是排在後面，次數標在片名旁邊。
ok(sc("E") > 0, "用過 5 次的**還是推薦得出來**（不再歸零）");
ok(sc("D") > sc("E"), "但排在用過 3 次的後面");
ok(rmkUsedBadge(用五次).includes(">5<"), "片名旁邊標出「5」，讓人自己判斷還要不要再用");
ok(rmkUsedBadge(用一次) === "", "用過 1 次不標 —— 多數片都是 1 次，每列都標等於沒標");
ok(rmkUsedBadge(用五次).includes("wa"), "用過 4 次以上的小數字要醒目（提醒這支已經榨很多次了）");

// ══════════ 熱度在「同類型」裡比 ══════════
// 老闆退回過「用留言率分類」：留言是我們引導出來的。所以寵粉片的留言
// 不可以拿去跟流量型比 —— 那會讓寵粉片系統性佔便宜。
const 流量高 = V({ id: "F", name: "片F 純內容", scheduledDate: D(100), metrics: M(130000, 10) });
const 流量低 = V({ id: "G", name: "片G 純內容", scheduledDate: D(100), metrics: M(6000, 5) });
const 寵粉高 = V({ id: "H", name: "片H 寵粉", tags: ["寵粉"], scheduledDate: D(100), metrics: M(20000, 500) });
const 寵粉低 = V({ id: "I", name: "片I 寵粉", tags: ["寵粉"], scheduledDate: D(100), metrics: M(6000, 8) });
mount([流量高, 流量低, 寵粉高, 寵粉低]);
r = rmkRank();
ok(sc("F") === sc("H"), "各類型的第一名分數一樣（各比各的，不會因為留言多寡跨類型壓過對方）");
ok(sc("F") > sc("G") && sc("H") > sc("I"), "同類型裡照樣分得出高下");

// ══════════ 從商品找影片（老闆新加的需求）══════════
const 有商品 = V({ id: "J", name: "片J 隨便什麼名字", scheduledDate: D(100), metrics: M(50000, 100),
                products: [{ name: "兔耳星芒｜歐泊套組" }] });
const 文案有 = V({ id: "K", name: "片K", videoCopy: "今天要講的是歐泊這種寶石", scheduledDate: D(100), metrics: M(9000, 9) });
const 沒成效 = V({ id: "L", name: "片L 歐泊開箱", scheduledDate: D(100) });          // 完全沒有成效數字
const 剛用過歐泊 = V({ id: "N", name: "片N 歐泊", scheduledDate: D(3), metrics: M(50000, 100) });
const 不相干 = V({ id: "Z", name: "片Z 完全不相干", scheduledDate: D(100), metrics: M(50000, 100) });
mount([有商品, 文案有, 沒成效, 剛用過歐泊, 不相干]);
let found = rmkSearchPool("歐泊").map(v => v.id).sort();
ok(found.join() === "J,K,L,N", "商品名、文案、片名都搜得到；不相干的不會出現");
ok(found.includes("L"), "**沒有成效數字的也要搜得到** —— 有商品找片的時候，要的是能用的影片，不是成效好的影片");
ok(found.includes("N"), "冷卻中的也要搜得到（你可能就是要那一支）");
ok(rmkSearchPool("  歐泊  ").length === 4, "前後空白不影響");
ok(rmkSearchPool("").length === 0, "沒打字就不是在搜尋（回空的，走推薦模式）");

RMK_Q = "歐泊";
let html = perfRankRowsHTML();
ok(html.includes("片L") && html.includes("還沒有成效數字"), "搜到沒成效的，要標出來為什麼不推薦");
ok(html.includes("片N") && html.includes("3 天前才用過"), "搜到冷卻中的，也要標出來");
ok(!html.includes("片Z"), "不相干的不會混進搜尋結果");
ok(html.indexOf("片J") < html.indexOf("片L"), "可以二創的排在前面");
ok(html.includes("兔耳星芒"), "帶貨商品要看得到（先有商品找片，這一欄就是重點）");

RMK_Q = "找不到的東西";
ok(perfRankRowsHTML().includes("找不到"), "搜不到要講話，不要給一張空表");

// ══════════ 整張卡（v204：併進「影片成效」的影片排行，不再是獨立的二創建議卡）══════════
RMK_Q = "";
mount([久沒用, 剛用過]);
html = perfRankCard();
ok(html.includes("影片排行") && html.includes("rmk_q"), "卡片有標題也有搜尋框");
ok(html.includes("先有商品"), "搜尋框的提示直接講那個用法");
ok(html.includes("依觀看") && html.includes("依二創建議"), "兩種排法都給得出來（同一張表，換排法而已）");
mount([V({ id: "P", name: "沒成效", scheduledDate: D(100) })]);
ok(perfRankCard().includes("尚無資料"), "整個影片庫都還沒有成效數字時，講「尚無資料」，不要排一張假的榜");

console.log(`\n${pass} / ${pass + fail} 通過`);
if (fail) process.exit(1);
