// v201 二創流程（第三步）
//
// 老闆：「一樣要有一個人先安排片源的『上片日期』，和新的片名（原始腳本名和原毛片名
//        禁止修改）給指定的剪輯，他們收到（才等同新片有拿到毛片）才開始剪，
//        然後剪完再次上傳後我才能再回到第一步，再次追蹤（這個成效要能看的出來，
//        這是那一個影片的二創，誰剪的，他剪的影片成效如何，要不要再次剪這一支，
//        或是這個剪輯不適任）。」
//
// 二創＝版本殼（channel="remake" ＋ sourceVideoId），跟蝦皮／馬來／英／泰同一個形狀，
// 差別只有兩件：跟原片走同一本月曆、片名由排片人現取。
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
let ROLE = "boss";
global.localStorage = { getItem: k => (k === "ecdr_role" ? ROLE : "管理員"), setItem(){}, removeItem(){} };
global.navigator = { userAgent: "node" };
eval(src);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; } else { fail++; console.log("FAIL  " + n); } };
const D = (n) => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const V = (o) => Object.assign({ id: "X", name: "", rawName: "", videoCopy: "", tags: [], stage: "待處理",
  products: [], metrics: [], usageHistory: [], lib: "", locale: "", channel: "", sourceVideoId: "",
  editor: "", claimedBy: "", assignedTo: "", createdAt: "" }, o);
const M = (views, comments, postAt) => [{ platform: "IG", account: "IG a", views, comments, likes: 0, postAt: (postAt || D(10)) + "T00:00:00" }];

function mount(vids, who, role) {
  ROLE = role || "boss";
  global.window.DB = { videosWatched: () => true, netState: () => ({ online: true, pending: false }) };
  global.localStorage.getItem = k => (k === "ecdr_role" ? ROLE : (who || "管理員"));
  LAST_RAW = { users: [{ name: "管理員", role: "boss" }, { name: "阿剪", role: "editor" }, { name: "阿二", role: "editor" }],
    settings: { dailyTarget: 4, videoTags: [], sources: [], postPlatforms: [], intlAccounts: [],
                shopeeAccounts: [], msAccounts: [], exchangeRates: {}, contacts: [] },
    schedule: {}, tasks: {}, shifts: {}, logs: [], deletedVideos: [], videos: vids };
  STATE = decorate(LAST_RAW); RMK_Q = ""; RMK_OPEN = false;
}

// 一支原片（半年前上片、10 萬觀看）＋ 一支它的二創
const 原片 = V({ id: "S1", name: "眼睫毛的秘密", rawName: "0409 眼睫毛毛片", videoCopy: "口播稿",
                scheduledDate: D(155), metrics: M(107645, 300, D(155)), editor: "老剪" });
const 二創 = V({ id: "R1", name: "眼睫毛－二創1", rawName: "0409 眼睫毛毛片", channel: "remake",
                sourceVideoId: "S1", scheduledDate: D(20), assignedTo: "阿剪", createdAt: "2026-09-01T00:00:00" });

// ══════════ ① 什麼算二創 ══════════
mount([原片, 二創]);
ok(isRemake(二創), "channel=remake ＋ 有來源片 → 是二創");
ok(!isRemake(原片), "原片不是二創");
ok(!isRemake(V({ channel: "remake", sourceVideoId: "" })), "沒有來源片的殼不算二創（那是壞資料，不是二創）");
ok(!isRemake(V({ channel: "shopee", sourceVideoId: "S1" })), "蝦皮版不是二創");

// ══════════ ② 二創是版本殼：不准跑進毛片庫存 ══════════
// 大流那條線最痛的教訓：版本殼被算成毛片，「還要不要去拍片」就整個失真。
ok(isVersion(二創) && !isSourceVid(二創), "二創算版本殼、不算源片");
ok(vidShot(二創), "版本殼天生就算有毛片（不會被當成『還沒拍』擋在外面）");
{ mount([原片, 二創]);
  ok(rawStock().every(v => v.id !== "R1"), "二創不進毛片庫存"); }

// ══════════ ③ 二創跟原片走同一本月曆 ══════════
// 少了這條，lineOf 會回 "remake"，這支就掉進一本不存在的月曆：
// 排片人排了上片日期，卻在月曆上完全看不到 —— 那是第三步的第一個動作。
mount([原片, 二創]);
ok(schedLineOf(二創) === "tw", "二創排進台灣月曆，不是自己開一本 remake 月曆");
ok(dayVideoList(D(20)).some(x => x.videoId === "R1"), "排的那天，月排程看得到這支二創");
ok(!dayVideoList(D(21)).some(x => x.videoId === "R1"), "沒排的那天就看不到");
{ // 壞資料保險：二創指到另一支二創，不能無窮遞迴
  const 壞 = V({ id: "R2", channel: "remake", sourceVideoId: "R1" });
  mount([原片, 二創, 壞]);
  ok(schedLineOf(壞) === "tw", "來源片本身是二創（壞資料）→ 回台灣月曆，不會轉死"); }

// ══════════ ④ 收到才開始剪：指派給誰，誰的工作清單就看得到 ══════════
mount([原片, 二創], "阿剪", "editor");
ok(myAssignedVids().some(v => v.id === "R1"), "指派的剪輯在「每日工作」看得到這支二創");
mount([原片, 二創], "阿二", "editor");
ok(!myAssignedVids().some(v => v.id === "R1"), "沒被指派的人看不到");
mount([原片, 二創], "阿剪", "editor");
ok(!poolAll().some(v => v.id === "R1"), "已經指定了人，就不會同時躺在公用待認領池裡");

// ══════════ ⑤ 第幾次二創、上次誰剪 ══════════
{ const 二創2 = V({ id: "R9", name: "眼睫毛－二創2", channel: "remake", sourceVideoId: "S1",
                   assignedTo: "阿二", createdAt: "2026-09-05T00:00:00" });
  mount([原片, 二創2, 二創]);              // 故意反序放，確認是照建立時間排不是照陣列順序
  ok(remakesOfSrc("S1").map(v => v.id).join(",") === "R1,R9", "二創照建立時間排");
  ok(rmkNoOf(二創) === 1 && rmkNoOf(二創2) === 2, "第幾次二創算得出來");
  ok(rmkLastEditor(原片) === "阿二", "「上次誰剪」＝最後一次二創的人，不是原片的剪輯");
  ok(rmkPlanTarget(二創2).id === "S1", "要二創一支二創 → 掛回原片"); }
mount([原片]);
ok(rmkLastEditor(原片) === "老剪", "還沒有人二創過 → 退回原片的剪輯");

// ══════════ ⑥ 比原片如何：沒有數字不等於零 ══════════
// v200 踩過一次：沒有成效的片拿到 0.5 百分位，變成「中等」被推薦出來。
{ mount([原片, 二創]);
  ok(rmkRatio(二創) === null, "二創還沒有成效 → 不給比值（不是 0，也不是中等）");
  const 有成效 = Object.assign({}, 二創, { metrics: M(30000, 50, D(20)) });
  mount([原片, 有成效]);
  ok(Math.round(rmkRatio(有成效) * 100) === 28, "有數字才算：30,000 ÷ 107,645 ＝ 28%");
  const 無成效原片 = Object.assign({}, 原片, { metrics: [] });
  mount([無成效原片, 有成效]);
  ok(rmkRatio(有成效) === null, "原片沒有數字 → 也不給比值（分母是零就不是比較）"); }

// ══════════ ⑦ 原片年齡一定要講出來 ══════════
// 老闆選的是「照算，也拿來排剪輯」。那就更要把年齡擺在旁邊 ——
// 原片累積 155 天、二創才跑 20 天，比值天生難看，看得到年齡才分得出是誰的問題。
mount([原片, 二創]);
ok(rmkSrcAgeDays(原片) === 155, "原片上片幾天算得出來（看第一則貼文）");
ok(rmkSrcAgeDays(V({})) === null, "沒有成效 → 不瞎猜年齡");
{ const card = rmkVersionsCard(vid("S1"));
  ok(card.includes("155 天"), "二創卡上寫出原片累積了幾天");
  ok(card.includes("比值天生偏低"), "而且直接講白：這樣比對二創不公平"); }
{ const 新原片 = Object.assign({}, 原片, { metrics: M(107645, 300, D(10)) });
  mount([新原片, 二創]);
  ok(!rmkVersionsCard(vid("S1")).includes("比值天生偏低"), "原片才上片 10 天 → 不需要那句警語"); }

// ══════════ ⑧ 原片視窗的二創卡 ══════════
mount([原片, 二創]);
{ const card = rmkVersionsCard(vid("S1"));
  ok(card.includes("二創（1）"), "原片看得到它有幾支二創");
  ok(card.includes("眼睫毛－二創1"), "看得到新片名");
  ok(card.includes("阿剪"), "看得到誰剪的（還沒認領就先顯示指派給誰）");
  ok(card.includes("等他收到"), "狀態寫「等他收到」—— 指派了不等於開始剪");
  ok(rmkVersionsCard(vid("R1")).includes("原片（這支是它的二創）"), "從二創看得回原片");
  ok(rmkVersionsCard(vid("R1")).includes("第 1 次二創"), "而且寫明是第幾次"); }
mount([原片]);
ok(rmkVersionsCard(vid("S1")) === "", "沒有二創就不要長一張空卡出來");

// ══════════ ⑨ 原始腳本名、原毛片名禁止修改 ══════════
// 不只是規矩：成效是拿這些欄位去跟平台貼文比對的，改掉名字＝那支片的成效整批對不回來。
mount([原片, 二創]);
ok(rmkNameLock(vid("S1")), "已經有二創的原片 → 原始片名鎖住");
ok(rmkNameLock(vid("R1")), "二創殼 → 原始片名鎖住（沿用原片）");
mount([V({ id: "P1", name: "一般片" })]);
ok(!rmkNameLock(vid("P1")), "沒有二創的一般片 → 照樣可以改");

// ══════════ ⑩ 二創殼自己不進二創建議池 ══════════
// 不然會出現「建議你二創這支二創」，而它的成效基準是原片，越推越歪。
{ const 有成效二創 = Object.assign({}, 二創, { metrics: M(30000, 50, D(20)), scheduledDate: D(100) });
  mount([原片, 有成效二創]);
  ok(!rmkPool().some(v => v.id === "R1"), "二創殼不會被推薦再二創一次");
  ok(rmkPool().some(v => v.id === "S1"), "原片照樣在候選池裡"); }

// ══════════ ⑪ 候選池要含大流 ══════════
// 正式資料：公司做過的 5 次二創**全部都在大流**，而大流有 11 支合格的片。
// 只讀 STATE.videos 的話一支都推薦不到 —— 而這張卡就掛在大流那一頁上。
{ const 大流片 = V({ id: "DF1", name: "大流的片", lib: "大流", scheduledDate: D(100), metrics: M(60476, 80, D(100)) });
  mount([原片, 大流片]);
  ok((STATE.videosDF || []).some(v => v.id === "DF1"), "大流確實被 decorate 抽出去了");
  ok(rmkPool().some(v => v.id === "DF1"), "大流的片也進二創候選池");
  ok(rmkRank().some(x => x.v.id === "DF1"), "而且排得進建議清單");
  RMK_Q = "大流的片";
  ok(rmkSearchPool("大流的片").some(v => v.id === "DF1"), "搜尋也找得到大流的片");
  RMK_Q = ""; }

// ══════════ ⑫ 誰可以排二創 ══════════
// 老闆選的：管理員＋經理人（跟現在排月排程的是同一批人）。
{ const 候選 = V({ id: "S2", name: "可二創的片", scheduledDate: D(100), metrics: M(50000, 100, D(100)) });
  mount([候選], "管理員", "boss");
  ok(canPlanRemake(), "管理員可以排");
  ok(rmkRowsHTML().includes("openRmkPlan('S2')"), "管理員的建議清單上有「排二創」");
  mount([候選], "阿剪", "editor");
  ok(!canPlanRemake(), "剪輯不能排");
  ok(!rmkRowsHTML().includes("openRmkPlan("), "剪輯看得到建議，但沒有「排二創」那顆鍵");
  ok(rmkRowsHTML().includes("可二創的片"), "剪輯照樣看得到建議本身"); }

// ══════════ ⑬ 清單上分得出哪一支是二創 ══════════
mount([原片, 二創]);
ok(shpBadge(vid("R1")).includes("二創"), "清單上二創有自己的小標");
ok(shpBadge(vid("S1")) === "", "原片不標");

// ══════════ ⑭ 存檔的時候也不准改到原始片名 ══════════
// 畫面上設 readonly 只擋得住手滑，擋不住 devtools、也擋不住一個開了三天的舊分頁。
// 真正要擋的是寫進資料庫那一刻 —— 這個欄位一改，那支片的成效就整批對不回來。
(async () => {
  const 送出 = async (v, rawIn) => {
    const f = { e_code: "001", e_raw: rawIn, e_name: "新標題", e_vcopy: "稿", e_url: "", e_src: "",
                e_stage: "待處理", e_editor: "", e_date: "", e_drive: "", e_ref: "", e_note: "",
                e_nameEn: "", e_vcopyEn: "" };
    Object.keys(f).forEach(k => { $[k] = { value: f[k] }; });
    let sent = null;
    toast = () => {}; logA = () => {}; logEditorChange = () => {}; persistNewTags = async () => {};
    route = async (m, p, b) => { sent = b; return {}; };
    await saveVideo(v);
    Object.keys(f).forEach(k => { delete $[k]; });
    return sent && sent.video;
  };
  mount([原片, 二創]);
  ok((await 送出("R1", "偷改的名字")).rawName === "0409 眼睫毛毛片", "二創殼：存檔照樣回存原片的原始片名");
  ok((await 送出("S1", "偷改的名字")).rawName === "0409 眼睫毛毛片", "有二創的原片：存檔也不准改原始片名");
  mount([V({ id: "P9", name: "一般片", rawName: "原本的" })]);
  ok((await 送出("P9", "改成這個")).rawName === "改成這個", "沒有二創的片：照樣改得動（鎖只鎖該鎖的）");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
