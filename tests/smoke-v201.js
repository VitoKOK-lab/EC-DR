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
  LAST_RAW = { users: [{ name: "管理員", role: "boss" }, { name: "阿剪", role: "editor" }, { name: "阿二", role: "editor" },
                       { name: "小主管", role: "editor", canAssign: true }],
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
  ok(perfRankRowsHTML().includes("openRmkPlan('S2')"), "管理員的建議清單上有「排二創」");
  mount([候選], "阿剪", "editor");
  ok(!canPlanRemake(), "剪輯不能排");
  ok(!perfRankRowsHTML().includes("openRmkPlan("), "剪輯看得到建議，但沒有「排二創」那顆鍵");
  ok(perfRankRowsHTML().includes("可二創的片"), "剪輯照樣看得到建議本身"); }

// ══════════ ⑬ 清單上分得出哪一支是二創 ══════════
mount([原片, 二創]);
ok(shpBadge(vid("R1")).includes("二創"), "清單上二創有自己的小標");
ok(shpBadge(vid("S1")) === "", "原片不標");

// ══════════ ⑭ 同齡比較：有快照才算得出來 ══════════
// Meta 只給累計，所以原片（半年前上的）跟二創（上了 30 天）天生不同基準。
// 後端從 v201 開始每次同步存一個點，存滿才換成「第 30 天對第 30 天」。
const MP = (views, postAt, postId) => [{ platform: "IG", account: "IG a", views, comments: 10, likes: 0,
                                         postAt: postAt + "T00:00:00", postId }];
const H = (postId, d, views) => ({ postId, d, views, comments: 1 });
{ const s = V({ id: "S5", name: "原片", metrics: MP(100000, D(200), "ps"),
                metricsHist: [H("ps", D(178), 20000), H("ps", D(169), 25000), H("ps", D(160), 28000)] });
  const k = V({ id: "R5", name: "二創", channel: "remake", sourceVideoId: "S5", scheduledDate: D(40),
                metrics: MP(30000, D(40), "pk"), metricsHist: [H("pk", D(15), 24000), H("pk", D(8), 27500)] });
  mount([s, k]);
  ok(rmkViewsAtAge(vid("S5"), 30) === 25000, "原片第 30 天：取第一個滿 30 天的點（不是最新那個）");
  ok(rmkViewsAtAge(vid("R5"), 30) === 27500, "二創第 30 天也一樣");
  const c = rmkCompare(vid("R5"));
  ok(c.basis === "same" && Math.round(c.r * 100) === 110, "兩邊都有第 30 天 → 同齡比：27,500 ÷ 25,000 ＝ 110%");
  ok(rmkRatio(vid("R5")) < 1, "拿累計比的話反而是 30%（同一支片，兩種算法差很多 —— 這就是為什麼要存快照）");
  ok(rmkBasisNote(c) === "同齡 30 天", "而且要標出來這個比值是怎麼算的");
}
{ // 一支片在兩個帳號各發一次，只拿到其中一則的點 → 不能算（半支片比整支片）
  const s = V({ id: "S6", metrics: MP(100000, D(200), "p1").concat(MP(50000, D(200), "p2")),
                metricsHist: [H("p1", D(169), 25000)] });
  mount([s]);
  ok(rmkViewsAtAge(vid("S6"), 30) === null, "有貼文還沒有第 30 天的點 → 不給數字（半支片比整支片比沒有更糟）");
  const s2 = Object.assign({}, s, { metricsHist: [H("p1", D(169), 25000), H("p2", D(169), 12000)] });
  mount([s2]);
  ok(rmkViewsAtAge(vid("S6"), 30) === 37000, "兩則都有點了才加總");
}
{ mount([原片, 二創]);
  const c = rmkCompare(vid("R1"));
  ok(c.basis === "total" && c.age === 155, "沒有快照 → 退回累計比，而且把原片累積幾天帶出來");
  ok(rmkBasisNote(c) === "原片累積 155 天", "老片的比值旁邊一定寫這句");
  ok(rmkViewsAtAge(V({ metrics: [] }), 30) === null, "沒有貼文不會爆掉");
  ok(rmkViewsAtAge(V({ metrics: MP(5, D(5), "px") }), 30) === null, "才上片 5 天，本來就不該有第 30 天");
}

// ══════════ ⑮ 剪輯二創成效：用中位數，一支爆片不代表穩定 ══════════
ok(rmkMedian([1, 2, 3]) === 2 && rmkMedian([1, 2, 3, 4]) === 2.5, "中位數（單數取中間、雙數取平均）");
ok(rmkMedian([]) === null, "沒有資料就不給中位數");
{ const src = (id, vw) => V({ id, name: "原" + id, metrics: MP(vw, D(100), "s" + id) });
  const rk = (id, s, who, vw, st) => V({ id, name: "二創" + id, channel: "remake", sourceVideoId: s,
    editor: who, stage: st || "已上片", metrics: vw ? MP(vw, D(20), "r" + id) : [] });
  mount([src("A", 10000), src("B", 10000), src("C", 10000), src("D", 10000),
         rk("r1", "A", "阿剪", 5000), rk("r2", "B", "阿剪", 5000), rk("r3", "C", "阿剪", 90000),
         rk("r4", "A", "阿二", 1000), rk("r5", "B", "阿二", 1200), rk("r6", "D", "阿二", 0, "待處理")]);
  const st = rmkEditorStats();
  const 剪 = st.find(o => o.name === "阿剪"), 二 = st.find(o => o.name === "阿二");
  ok(Math.round(剪.med * 100) === 50, "阿剪的中位數是 50%（不是被那支 900% 拉高的平均 333%）");
  ok(Math.round(剪.best * 100) === 900 && Math.round(剪.worst * 100) === 50, "最好、最差都看得到");
  ok(二.n === 2 && 二.pend === 1, "還沒有數字的算「進行中」，不進比值");
  ok(st[0].name === "阿剪", "比值高的排前面");
  ok(剪.age === 100, "他分到的原片平均幾天 —— 分配公不公平要看得到");
  const card = rmkPerfCard();
  ok(card.includes("剪輯二創成效") && card.includes("阿剪"), "成效頁有這張卡");
  ok(card.includes("比值天生偏低"), "沒有同齡數字的時候，把「這個比值不準」直接寫在卡上");
  ok(card.includes("看每一支二創（6）"), "可以展開看每一支");
}
mount([原片]);
ok(rmkPerfCard() === "", "一支二創都沒有的時候，不要長一張空卡出來");

// ══════════ ⑯ 二創也是一次「再用」══════════
// 老闆：「日期（第一次上傳日，多久沒有二次使用，也不能太常用）」。
// 少了這條，一支片被二創三次之後，建議選單上還是寫「用過 1 次、120 天沒用」，
// 於是它會一直排在最前面被推薦去二創第四次。
{ const s = V({ id: "S7", name: "被二創過的片", scheduledDate: D(120), metrics: M(80000, 200, D(120)) });
  const k1 = V({ id: "K1", channel: "remake", sourceVideoId: "S7", scheduledDate: D(60), createdAt: "2026-07-01" });
  const k2 = V({ id: "K2", channel: "remake", sourceVideoId: "S7", scheduledDate: D(5), createdAt: "2026-09-01" });
  mount([s]);
  ok(rmkAired(vid("S7")).length === 1 && rmkRank().find(x => x.v.id === "S7").score > 0,
     "還沒被二創過：用過 1 次，照常推薦");
  mount([s, k1]);
  ok(rmkAired(vid("S7")).length === 2, "二創排過的上片日算一次「用過」");
  mount([s, k1, k2]);
  ok(rmkAired(vid("S7")).length === 3 && rmkUsedK(vid("S7")) === 0.4, "用過三次 → 分數壓到 0.4");
  ok(rmkDaysSince(vid("S7")) === 5, "「多久沒用」看的是最後一次二創，不是原片那次");
  ok(rmkRank().find(x => x.v.id === "S7").score === 0, "5 天前才二創過 → 先別再推薦");
  ok(rmkWhyNot(rmkRank().find(x => x.v.id === "S7")).includes("5 天前"), "而且講清楚為什麼");
  // 還沒到上片日的二創不算 —— 排了不等於出了
  const 未來 = V({ id: "K3", channel: "remake", sourceVideoId: "S7", scheduledDate: D(-10), createdAt: "2026-09-09" });
  mount([s, k1, 未來]);
  ok(rmkAired(vid("S7")).length === 2, "排在未來的二創還沒出，先不算進「用過幾次」");
}

// ══════════ ⑰ 上次二創的成績要寫在建議清單上 ══════════
// 老闆問的四件事之一是「要不要再次剪這一支」。上次剪出來只有兩成，跟上次剪得比原本還好，
// 是兩個完全不同的決定。
{ const s = V({ id: "S8", name: "有二創成績的片", scheduledDate: D(200), metrics: M(100000, 300, D(200)) });
  const k1 = V({ id: "L1", name: "二創1", channel: "remake", sourceVideoId: "S8", scheduledDate: D(150),
                 editor: "阿剪", createdAt: "2026-05-01", metrics: M(20000, 30, D(150)) });
  const k2 = V({ id: "L2", name: "二創2", channel: "remake", sourceVideoId: "S8", scheduledDate: D(100),
                 editor: "阿二", createdAt: "2026-07-01", metrics: [] });
  mount([s, k1, k2], "管理員", "boss");
  ok(Math.round(rmkLastResult(vid("S8")).r * 100) === 20, "取最近一支**有數字**的（最新那支還在剪，不算它 0 分）");
  ok(perfRankRowsHTML().includes('data-label="上次二創"') && perfRankRowsHTML().includes("20%"),
     "寫在影片排行的「上次二創」那一欄");
  // 人跟數字一定要是同一支、同一個人。第一版分開取，畫面上出現「阿二　上次二創 20%」——
  // 那 20% 是阿剪剪的，阿二那支還在剪。同一格裡兩個數字指到不同的人，看的人一定誤會。
  ok(rmkLastEditor(vid("S8")) === "阿剪", "有成績的話，「上次誰剪」也要跟著指到剪出那個成績的人");
  ok(/阿剪<span class="muted"[^>]*>　20%/.test(perfRankRowsHTML()), "畫面上這兩個字連在一起，不會各指各的");
  mount([s, k2], "管理員", "boss");
  ok(rmkLastEditor(vid("S8")) === "阿二" && rmkLastResult(vid("S8")) === null,
     "都還沒有成績 → 顯示最近被指派的那個人，但不給數字");
  // 在真的瀏覽器上看出來的：rmkLastCut 在「從來沒二創過」時會退回**原片自己的剪輯**。
  // 那在原本「上次誰剪」那一欄是對的，但這一欄叫「上次二創」—— 印出來會變成
  // 「昱丞剪過這支的二創」，而他根本沒剪過，旁邊「剪輯」那欄還印著同一個名字。
  { const 沒二創過 = V({ id: "NR", name: "從來沒二創過的片", editor: "昱丞",
                        scheduledDate: D(100), metrics: M(50000, 100, D(100)) });
    mount([沒二創過], "管理員", "boss");
    const h = perfRankRowsHTML();
    ok(h.includes("從來沒二創過的片"), "（對照）這支有排進來");
    ok(/data-label="上次二創" class="pr-e"><span class="muted">—<\/span>/.test(h),
       "從來沒二創過 → 「上次二創」留破折號，不要印原片剪輯的名字");
    ok(h.includes(">昱丞</td>") || /data-label="剪輯">昱丞/.test(h), "「剪輯」那欄照樣是他（那一欄本來就該有名字）"); }
  mount([原片], "管理員", "boss");
  ok(rmkLastResult(vid("S1")) === null, "沒有二創過就沒有這個數字");
  // 這支有二創、但那支還沒有成績 → 人要顯示，數字不能硬擠一個 0% 上去
  ok(!/data-label="上次二創" class="pr-e">[^<]*<span class="muted" style/.test(perfRankRowsHTML()),
     "沒有成績就只顯示人，不要硬擠一個 0% 上去");
}

// ══════════ ⑰b 二創自己一頁，不長在「大流量影片」上（v203）══════════
// 老闆：「我這裡是新的頁面新的表單，跟原本的大流量不要有關係，未來這邊用的順手了，
//        我會直接把大流量那一整頁直接刪掉」「舊的那一個大流量頁面，那邊的資料不是那麼準確」
// 二創長在那一頁上的話，那頁一刪，二創就跟著陪葬。
{ const 候選 = V({ id: "P2", name: "可二創的片", scheduledDate: D(100), metrics: M(50000, 100, D(100)) });
  mount([候選], "管理員", "boss");
  const df = viewVideosDF(), pf = viewPerf();
  ok(!df.includes("二創建議"), "**大流量那一頁不再有二創建議**（那頁以後要整頁刪掉）");
  ok(pf.includes("可二創的片") && pf.includes("依二創建議"), "二創建議併進「影片成效」的影片排行了");
  ok(pf.includes("排二創"), "排二創的鍵就在那張排行上（老闆：只是多了一個『二創』的按鍵）");
  ok(df.includes("影片庫大流"), "大流量那一頁本身沒被動到（老闆：那是核心，不是叫你移除）"); }
// 三塊東西都要真的長在它該長的那一頁上 —— 只測卡片本身回傳什麼是不夠的，
// 那樣把 viewPerf／viewFlow 裡那一行拿掉，測試照樣綠。
{ const s = V({ id: "SS", name: "原片", scheduledDate: D(100), metrics: M(50000, 100, D(100)) });
  const 做完 = V({ id: "KK", name: "做完的二創", channel: "remake", sourceVideoId: "SS", stage: "已上片",
                  published: true, editor: "阿剪", scheduledDate: D(30), metrics: M(20000, 30, D(30)), createdAt: "2026-08-01" });
  const 在做 = V({ id: "KW", name: "在做的二創", channel: "remake", sourceVideoId: "SS",
                  assignedTo: "阿二", scheduledDate: D(-3), createdAt: "2026-08-02" });
  mount([s, 做完, 在做], "管理員", "boss");
  const pf = viewPerf(), fl = viewFlow();
  ok(pf.includes("影片排行") && pf.includes("原片"), "① 建議（影片排行）在影片成效那一頁");
  ok(pf.includes("剪輯二創成效") && pf.includes("阿剪"), "② 剪輯二創成效也在影片成效那一頁");
  ok(fl.includes("進行中的二創") && fl.includes("在做的二創"), "③ 進行中的二創搬到看板（那是生產面，不是成效）");
  ok(!pf.includes("進行中的二創"), "而且不要兩邊都放一份 —— 生產面的事只留在看板"); }
// 「大流量」這件事本身是核心 —— 候選池照樣含大流的片，搬走的只是畫面
{ const 大流片 = V({ id: "DF9", name: "大流的強片", lib: "大流", scheduledDate: D(100), metrics: M(60476, 80, D(100)) });
  mount([大流片], "管理員", "boss");
  ok(viewPerf().includes("大流的強片"), "**大流的片照樣被推薦**（搬的是畫面，不是資料）");
  ok(viewPerf().includes("60,476"), "而且它的觀看也算進影片成效了 —— 以前那一頁根本看不到大流"); }
// 搬家不能改變誰看得到：二創那一頁的範圍（boss／manager／editor）原封不動搬到 perf
{ const 候選 = V({ id: "P3", name: "片", scheduledDate: D(100), metrics: M(50000, 100, D(100)) });
  ["boss", "manager", "editor"].forEach(r => {
    mount([候選], "某人", r);
    ok(hasPerm("perf"), `${r} 看得到影片成效（跟以前看得到二創建議的是同一批人）`);
  });
  mount([候選], "某人", "cs");
  ok(!hasPerm("perf"), "不剪片的職位看不到");
  ok(typeof PERMS.remake === "undefined", "「二創」不再是一個獨立權限（它就是影片成效的一部分）"); }

// ══════════ ⑰c 進行中的二創 ══════════
// 排片人排完就看不到後續了 —— 這張卡是給他看「交出去幾天了、對方收了沒」
{ const s = V({ id: "S9", name: "原片", scheduledDate: D(100), metrics: M(50000, 100, D(100)) });
  const 等收 = V({ id: "W1", name: "等收的二創", channel: "remake", sourceVideoId: "S9",
                  assignedTo: "阿剪", scheduledDate: D(3), createdAt: "2026-08-01" });
  const 剪中 = V({ id: "W2", name: "剪中的二創", channel: "remake", sourceVideoId: "S9", stage: "剪輯中",
                  editor: "阿二", claimedBy: "阿二", claimedAt: D(4) + "T09:00:00", scheduledDate: D(-5), createdAt: "2026-08-02" });
  const 上完 = V({ id: "W3", name: "上完的二創", channel: "remake", sourceVideoId: "S9", stage: "已上片",
                  published: true, editor: "阿三", scheduledDate: D(20), createdAt: "2026-08-03" });
  mount([s, 等收, 剪中, 上完], "管理員", "boss");
  const c = rmkWipCard();
  ok(c.includes("等收的二創") && c.includes("剪中的二創"), "還沒上片的都列出來");
  ok(!c.includes("上完的二創"), "已經上片的不列（那是成效那張卡的事）");
  ok(c.includes("剪 4 天"), "看得到剪了幾天");
  ok(c.includes("上片日到了還沒人按「收到」"), "**上片日到了還沒人按「收到」要喊出來**");
  ok(c.includes("1 支上片日到了"), "而且數得出來是幾支");
  mount([s, 上完], "管理員", "boss");
  ok(rmkWipCard() === "", "全部上完就不要留一張空卡"); }

// ══════════ ⑰d 同一支片發了三次，要分得出來（v203）══════════
// 老闆看影片視窗的成效卡，三列都寫「FB 粉專（Zanagems）」，問「出現三個一樣的
// 平台、帳號，什麼意思」。那是同一支片在同一個粉專發了三次，不是重複資料 ——
// 卡上沒有發文日就分不出來。
//
// ⚠️ 這不只是好看的問題：分不出重發，就會把真的重發當成誤配去刪掉。
//    2026-09-12 我就是這樣刪掉了 7 列真資料。
{ const 三次 = V({ id: "M3", name: "發了三次的片", metrics: [
    { platform: "FB", account: "FB 粉專（Zanagems）", views: 645, likes: 8, comments: 7,
      postAt: "2026-09-12T12:00:00", postId: "p3", link: "https://www.facebook.com/reel/3/" },
    { platform: "FB", account: "FB 粉專（Zanagems）", views: 8014, likes: 105, comments: 47,
      postAt: "2026-09-08T12:00:00", postId: "p2", link: "https://www.facebook.com/reel/2/" },
    { platform: "FB", account: "FB 粉專（Zanagems）", views: 1, likes: 50, comments: 38,
      postAt: "2026-08-10T12:00:00", postId: "p1", link: "" }] });
  mount([三次], "管理員", "boss");
  const c = vidMetricsCard(vid("M3"));
  ok(c.includes("<th>發文日</th>"), "成效卡上有「發文日」這一欄");
  ok(c.includes("2026-09-12") && c.includes("2026-09-08") && c.includes("2026-08-10"),
     "三則的日期都列出來");
  ok(c.indexOf("2026-09-12") < c.indexOf("2026-08-10"), "新的排前面");
  ok(c.includes("同一支片發了 3 次"), "直接寫明這是同一支片發了幾次");
  ok(/<a href="https:\/\/www\.facebook\.com\/reel\/2\/"[^>]*>2026-09-08<\/a>/.test(c),
     "有連結的日期點得開那則貼文（要查是不是同一支片就靠它）");
  ok(c.includes("總觀看 8,660"), "總數照舊（645+8014+1）"); }
{ mount([V({ id: "M1", name: "只發一次", metrics: [
    { platform: "IG", account: "IG a", views: 100, postAt: "2026-09-01T00:00:00", postId: "x" }] })],
    "管理員", "boss");
  ok(!vidMetricsCard(vid("M1")).includes("同一支片發了"), "只發一次就不要多那一句"); }

// ══════════ ⑱ 排二創走「工作指派」權限，不是職位 ══════════
// 老闆：「要新增一個權限『工作指派』（目前是管理員和泓儒能做，以後可能會換人）。」
// 那個權限系統裡本來就有（設定→成員的勾勾，users.canAssign），泓儒早就打勾了。
// 排二創跟指派毛片是同一件事，共用同一個開關 —— 兩份定義遲早會不一致。
{ const 候選 = V({ id: "S3", name: "可二創的片", scheduledDate: D(100), metrics: M(50000, 100, D(100)) });
  mount([候選], "小主管", "editor");
  ok(canAssignWork() && canPlanRemake(), "剪輯身分但有「工作指派」權限 → 排得了二創");
  ok(perfRankRowsHTML().includes("openRmkPlan('S3')"), "他的建議清單上看得到「排二創」");
  mount([候選], "阿剪", "editor");
  ok(!canPlanRemake(), "沒有那個權限的剪輯就不行");
  mount([候選], "管理員", "boss");
  ok(canPlanRemake(), "管理員本來就有");
  ok(/canPlanRemake\(\)\{ return canAssignWork\(\); \}/.test(APP_SRC),
     "而且是直接接到 canAssignWork，不是另外抄一份名單"); }

// ══════════ ⑱b 排二創那個視窗：字要對，三格都要擋 ══════════
// 老闆：「這裡不叫毛片，就是舊片素材。」—— 二創拿到的是已經上過片的成品，
// 不是剛拍回來的毛片，講錯會讓剪輯以為還要等攝影給檔案。
let PLAN_MODAL = null;
{ mount([原片], "管理員", "boss");
  const _sm = showModal;
  showModal = (t, h, cb) => { PLAN_MODAL = { t, h, cb }; };
  openRmkPlan("S1");
  showModal = _sm;
  ok(PLAN_MODAL && PLAN_MODAL.t.includes("排二創"), "視窗開得起來");
  ok(PLAN_MODAL.h.includes("舊片素材"), "講「拿到舊片素材」");
  ok(!PLAN_MODAL.h.includes("拿到毛片"), "不講「拿到毛片」—— 二創拿的是成品，不是毛片");
  ok(PLAN_MODAL.h.includes("原毛片名"), "但原片那一欄照樣叫「原毛片名」（那本來就是毛片的名字）");
}

// ══════════ ⑲ 上片日過了才鎖名字 ══════════
// 老闆：「鎖死，是在影片上架日過後再鎖，以免要修改。」
// 上片前平台上還沒有這支的貼文，沒有東西會對不上 —— 那正是最需要能改的時候。
{ const 原 = V({ id: "S4", name: "原片", rawName: "原毛片名", scheduledDate: D(155), metrics: M(100000, 200, D(155)) });
  const 還沒上 = V({ id: "R4", name: "二創", channel: "remake", sourceVideoId: "S4",
                    scheduledDate: D(-10), createdAt: "2026-09-01" });   // 排在 10 天後
  mount([原, 還沒上]);
  ok(!rmkSelfAired(vid("R4")), "排在未來 → 還沒上片");
  ok(rmkNameLock(vid("R4")) === "", "還沒上片的二創：名字改得動（打錯字還來得及）");
  const 已上 = Object.assign({}, 還沒上, { scheduledDate: D(3) });
  mount([原, 已上]);
  ok(rmkSelfAired(vid("R4")) && rmkNameLock(vid("R4")), "上片日過了 → 鎖起來");
  const 未上原片 = V({ id: "S5b", name: "還沒上的新片", rawName: "raw", scheduledDate: D(-5) });
  const 它的二創 = V({ id: "R5b", channel: "remake", sourceVideoId: "S5b", scheduledDate: D(-3) });
  mount([未上原片, 它的二創]);
  ok(rmkNameLock(vid("S5b")) === "", "原片自己都還沒上片 → 也還不鎖");
  // 已上片但沒排日期的（大流那種）也算出去過
  mount([V({ id: "P8", name: "大流成品", rawName: "raw", stage: "已上片", published: true }),
         V({ id: "R8b", channel: "remake", sourceVideoId: "P8", scheduledDate: D(2) })]);
  ok(rmkNameLock(vid("P8")), "沒排日期但已經上片的（大流成品）照樣鎖"); }

// ══════════ ⑳ 一路退步是題材，有高有低是剪輯 ══════════
// 老闆：「如果已經剪了二創 3 次，每次都退步，那就話題不行了，還是剪輯爛。」
{ const src = V({ id: "T1", name: "題材片", metrics: MP(100000, D(200), "t1") });
  const k = (id, who, vw, at) => V({ id, name: id, channel: "remake", sourceVideoId: "T1",
    editor: who, createdAt: at, metrics: MP(vw, D(60), "p" + id) });
  mount([src, k("a", "阿剪", 60000, "2026-05-01"), k("b", "阿二", 45000, "2026-06-01"), k("c", "阿三", 30000, "2026-07-01")]);
  let t = rmkTrend(vid("T1"));
  ok(t.vals.map(x => Math.round(x * 100)).join("/") === "60/45/30", "三次的比值照順序排出來");
  // ⚠️ 這裡本來寫 includes("題材") —— 是空的：另一句「差在剪輯，不是題材」也含「題材」
  //    兩個字，把判斷改壞了測試照樣綠。要比對只有這一句才有的字。
  ok(t.read.includes("題材到頂"), "一路往下 → 講題材，不是講人");
  ok(!t.read.includes("差在剪輯"), "而且不會同時又說是剪輯的問題");
  ok(rmkVersionsCard(vid("T1")).includes("60% → 45% → 30%"), "原片視窗上直接看得到這條線");
  mount([src, k("a", "阿剪", 70000, "2026-05-01"), k("b", "阿二", 20000, "2026-06-01"), k("c", "阿三", 65000, "2026-07-01")]);
  t = rmkTrend(vid("T1"));
  ok(t.read.includes("差在剪輯"), "同一支片有人 70% 有人 20% → 講剪輯，不是講題材");
  ok(!t.read.includes("題材到頂"), "而且不會同時又說是題材的問題");
  mount([src, k("a", "阿剪", 52000, "2026-05-01"), k("b", "阿二", 48000, "2026-06-01")]);
  ok(rmkTrend(vid("T1")).read === "", "兩支差不多 → 不下判斷（兩三個點撐不起結論）");
  mount([src, k("a", "阿剪", 52000, "2026-05-01")]);
  ok(rmkTrend(vid("T1")) === null, "只有一支根本沒有趨勢可言"); }

// ══════════ ㉑ 搜尋的時候照觀看排，不照二創分數排 ══════════
// 老闆：「他還是要能被排列出來（如果我要找強片為了某個品項銷售）。」
{ const 強片用過多次 = V({ id: "Q1", name: "歐泊大爆片", scheduledDate: D(200),
    metrics: M(200000, 500, D(200)), usageHistory: [{ date: D(150) }, { date: D(100) }, { date: D(50) }] });
  const 弱片很新 = V({ id: "Q2", name: "歐泊小片", scheduledDate: D(100), metrics: M(6000, 20, D(100)) });
  mount([強片用過多次, 弱片很新], "管理員", "boss");
  const r = rmkRank(rmkSearchPool("歐泊"));
  ok(r.length === 2, "兩支都搜得到");
  // v204 老闆改的：用過 4 次不再歸零 —— 還是能用，只是排在後面、旁邊標一個小數字。
  ok(r.find(x => x.v.id === "Q1").score > 0, "強片用過 4 次 → **還是推薦得出來**（不再歸零）");
  RMK_Q = "歐泊";
  const html = perfRankRowsHTML();
  ok(html.indexOf("歐泊大爆片") < html.indexOf("歐泊小片"), "但搜尋時它照樣排在前面（要找的是強片，不是最該二創的片）");
  ok(html.includes(">4<"), "旁邊標一個小數字「4」，讓人自己判斷還要不要再榨這一支");
  ok(!html.includes("已經用過 4 次"), "不再寫「已經用過 4 次」當不推薦的理由（它現在是推薦得出來的）");
  RMK_Q = ""; }

// ══════════ ㉒ 存檔的時候也不准改到原始片名 ══════════
// 畫面上設 readonly 只擋得住手滑，擋不住 devtools、也擋不住一個開了三天的舊分頁。
// 真正要擋的是寫進資料庫那一刻 —— 這個欄位一改，那支片的成效就整批對不回來。
(async () => {
  // 排二創的三格必填：少任何一格，這支片都會卡在沒有人會看的地方
  // （沒日期＝月曆看不到、沒片名＝清單上跟原片一樣、沒指定人＝沒人知道該他剪）
  { let TOASTS = []; const _ts = toast;
    toast = (m) => { TOASTS.push(String(m)); };
    const tryPlan = async (n, d, w) => { TOASTS = [];
      $.rp_name = { value: n }; $.rp_date = { value: d }; $.rp_editor = { value: w };
      await PLAN_MODAL.cb(); return TOASTS.join("|"); };
    ok((await tryPlan("", "2026-10-01", "阿剪")).includes("片名"), "沒取新片名 → 擋下來");
    ok((await tryPlan("新片名", "", "阿剪")).includes("上片日期"), "沒排上片日期 → 擋下來");
    ok((await tryPlan("新片名", "2026-10-01", "")).includes("指定一個剪輯"), "沒指定剪輯 → 擋下來");
    toast = _ts;
    delete $.rp_name; delete $.rp_date; delete $.rp_editor; }

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
