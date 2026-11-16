// v261（老闆指定）：
// 「二創版本現在只能做蝦皮跟馬來影片的版本，改成不限版本——預防溱姐想要臨時
// 增加什麼版本的二創就可以馬上分派給剪輯師處理，讓系統上也能有資料可以做紀錄」
// ──既有的「二創流程」（openRmkPlan，channel=remake）本來就片名自取、不綁平台、
// 直接指定剪輯，只是入口藏在「選品」「成效排行」兩個頁面；這裡在「建立二創版本」
// 卡加一個「其他／自訂版本」選項，共用同一條寫入路徑，不重做一套。
//
// 「也要讓我知道這是要做二創，可以清楚做分配的動作，以及接收到的人要清楚知道
// 這是要做二創（三創/四創/五創 以此類推）」──shpBadge 本來寫死「二創」兩個字，
// 不管實際上是第幾次都一樣；改成讀 rmkOrdLabel()，系統自己算是第幾創。
const fs = require("fs");
const path = require("path");
const APP_SRC = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
let src = APP_SRC.replace(/^let /gm, "").replace(/^const /gm, "");
const $ = {};
global.document = {
  getElementById: id => $[id] || null,
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener: () => {}, createElement: () => ({ style: {}, classList: { add(){}, remove(){}, contains(){return false} } }),
  body: { classList: { add(){}, remove(){}, contains(){return false} } },
};
global.window = { addEventListener: () => {}, location: { hash: "" }, matchMedia: () => ({ matches: false, addEventListener(){} }) };
let ROLE = "boss";
global.localStorage = { getItem: k => (k === "ecdr_role" ? ROLE : "管理員"), setItem(){}, removeItem(){} };
global.navigator = { userAgent: "node" };
eval(src);
const PERMS_NO_SHIM = permsOf;
permsOf = require("./perm-fixture").withOldRoleDefaults(permsOf);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; } else { fail++; console.log("FAIL  " + n); } };
const D = (n) => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const V = (o) => Object.assign({ id: "X", name: "", rawName: "", videoCopy: "", tags: [], stage: "待處理",
  products: [], metrics: [], usageHistory: [], lib: "", locale: "", channel: "", sourceVideoId: "",
  editor: "", claimedBy: "", assignedTo: "", createdAt: "" }, o);

function mount(vids, who, role) {
  ROLE = role || "boss";
  global.window.DB = { videosWatched: () => true, netState: () => ({ online: true, pending: false }) };
  global.localStorage.getItem = k => (k === "ecdr_role" ? ROLE : (who || "管理員"));
  LAST_RAW = { users: [{ name: "管理員", role: "boss" }, { name: "阿剪", role: "editor" }, { name: "阿二", role: "editor" }],
    settings: { dailyTarget: 4, videoTags: [], sources: [], postPlatforms: [], intlAccounts: [],
                shopeeAccounts: [], msAccounts: [], exchangeRates: {}, contacts: [] },
    schedule: {}, tasks: {}, shifts: {}, logs: [], deletedVideos: [], videos: vids };
  STATE = decorate(LAST_RAW); RMK_Q = ""; RMK_OPEN = false; WORK_ZONE = "shopee"; RMK_MK_Q = "";
}

const 原片 = V({ id: "S1", name: "勞力士把頭的秘密", rawName: "2609091 勞力士把頭", videoCopy: "口播稿",
  stage: "已完成", tags: ["舊片"], scheduledDate: D(40),
  metrics: [{platform:"IG",account:"a",views:50000,comments:10,likes:0,postAt:D(40)+"T00:00:00"}], editor: "老剪" });
const 二創1 = V({ id: "R1", name: "勞力士把頭－二創1", rawName: "2609091 勞力士把頭", channel: "remake",
  sourceVideoId: "S1", assignedTo: "阿剪", createdAt: "2026-09-01T00:00:00" });
const 二創2 = V({ id: "R2", name: "勞力士把頭－三創", rawName: "2609091 勞力士把頭", channel: "remake",
  sourceVideoId: "S1", assignedTo: "阿二", createdAt: "2026-09-05T00:00:00" });

// ══════════ ① rmkOrdLabel：第幾創算得出中文名字 ══════════
mount([原片, 二創1, 二創2]);
ok(rmkOrdLabel(二創1) === "二創", "第 1 支衍生版本叫「二創」");
ok(rmkOrdLabel(二創2) === "三創", "第 2 支衍生版本叫「三創」");
ok(rmkOrdLabelOfN(1) === "二創" && rmkOrdLabelOfN(2) === "三創" && rmkOrdLabelOfN(3) === "四創", "數字版也對得上");
ok(rmkOrdLabelOfN(0) === "", "沒有這一支（0）就是空字串，不是亂編一個名字");
ok(rmkOrdLabel(原片) === "", "原片本身不是衍生版本，不該有二創/三創標籤");
ok(rmkOrdLabelOfN(20) === "第21創", "數字大到中文表沒有的，退回「第N創」而不是空字串");

// ══════════ ② shpBadge：不再寫死「二創」，照實際次數顯示 ══════════
{ const b1 = shpBadge(二創1), b2 = shpBadge(二創2);
  ok(b1.includes(">二創<"), "第一支二創的小圖示寫「二創」");
  ok(b2.includes(">三創<") && !b2.includes(">二創<"), "**第二支（三創）不會也被標成「二創」**");
  ok(b2.includes("第 2 次"), "title 裡講清楚是第幾次（給 hover 看細節）"); }

// ══════════ ③「建立二創版本」卡：只有排得動工作的人看得到「其他／自訂版本」══════════
mount([原片], "管理員", "boss");
{ const card = createZoneCard();
  ok(card.includes("其他／自訂版本"), "管理員（排得動工作）看得到這個新選項"); }
mount([原片], "阿剪", "editor");
{ const card = createZoneCard();
  ok(!card.includes("其他／自訂版本"), "**一般剪輯（排不動工作）不會看到「指派給別人」這個選項**");
  ok(card.includes("建立二創版本"), "但原本蝦皮/馬來那些自己挑來做的選項還在"); }

// ══════════ ④ rmkMkLibRows：挑片之後是「排二創」按鈕，不是自己領 ══════════
mount([原片, 二創1], "管理員", "boss");
{ WORK_ZONE = "remake";
  const rows = rmkMkLibRows();
  ok(rows.includes("勞力士把頭的秘密"), "舊片列得出來");
  ok(rows.includes("openRmkPlan('S1')"), "**按鈕是直接開排二創的指派視窗，不是自己認領**");
  ok(rows.includes("排三創") || rows.includes("三創"), "已經有一支二創了，按鈕上寫的是下一次「三創」，不是重複的「二創」");
  ok(rows.includes("二創") && rows.includes("阿剪"), "舊的那支二創在清單上看得到是誰剪的"); }

// ══════════ ⑤ openRmkPlan 的指派視窗：明講這次排的是第幾創 ══════════
{ let lastModal = "";
  showModal = (title, body) => { lastModal = title + "||" + body; };
  mount([原片], "管理員", "boss");
  openRmkPlan("S1");
  ok(lastModal.includes("這次排的是「二創」"), "**還沒有任何二創時，講清楚這次排的是「二創」**");
  mount([原片, 二創1], "管理員", "boss");
  openRmkPlan("S1");
  ok(lastModal.includes("這次排的是「三創」"), "**已經有一支二創了，講清楚這次是「三創」，不是重複的「二創」**");
  ok(lastModal.includes("（二創）"), "歷史紀錄那一條也標出它當時是第幾創"); }

console.log(`\nv261（二創指派不限版本＋清楚標出第幾創）: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
