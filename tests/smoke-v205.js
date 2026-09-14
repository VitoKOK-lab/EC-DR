// v205 商品身分：點商品看「哪些影片賣過它」
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
// v207：職位不再帶任何預設權限（老闆：「不要有人有任何預設的權限，都要可以勾選的」）。
// 這一支不是在測權限，把以前職位會給的補回假資料上 —— 見 tests/perm-fixture.js 的說明。
permsOf = require("./perm-fixture").withOldRoleDefaults(permsOf);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; } else { fail++; console.log("FAIL  " + n); } };
const D = (n) => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const V = (o) => Object.assign({ id: "X", name: "", rawName: "", videoCopy: "", tags: [], stage: "待處理",
  products: [], metrics: [], usageHistory: [], lib: "", locale: "", channel: "", sourceVideoId: "",
  editor: "", claimedBy: "", assignedTo: "", createdAt: "" }, o);
const M = (views, comments, postAt) => [{ platform: "IG", account: "IG a", views, comments, likes: 0, postAt: (postAt || D(10)) + "T00:00:00" }];

function mount(vids, who, role, prods, unfiled) {
  ROLE = role || "boss";
  global.window.DB = { videosWatched: () => true, netState: () => ({ online: true, pending: false }) };
  global.localStorage.getItem = k => (k === "ecdr_role" ? ROLE : (who || "管理員"));
  LAST_RAW = { users: [{ name: "管理員", role: "boss" }, { name: "阿剪", role: "editor" }, { name: "阿二", role: "editor" },
                       { name: "小主管", role: "editor", canAssign: true },
                       // v207：職位不給預設了，要測「經理人動得了主檔」就得真的把那一格勾給她
                       { name: "Regina", role: "manager", perms: ["prod", "perf"] }],
    settings: { dailyTarget: 4, videoTags: [], sources: [], postPlatforms: [], intlAccounts: [],
                shopeeAccounts: [], msAccounts: [], exchangeRates: {}, contacts: [],
                unfiledPosts: unfiled || null },
    schedule: {}, tasks: {}, shifts: {}, logs: [], deletedVideos: [], videos: vids,
    products: prods || [], matches: [] };
  STATE = decorate(LAST_RAW); RMK_Q = ""; RMK_OPEN = false;
}


// 老闆：「這裡以商品為主的排序，我希望有連結，點商品，我要能看到有什麼影片賣過這個
//        商品（用相同官網連結為主）。」
//
// ⚠️ 我一開始回他「217 個商品要有人去填連結」—— **那是錯的**，我沒查就下結論。
//    他回：「這個名字應該和官網名一樣」。查了才發現影片上早就有 productUrl，
//    158 支填了，長成 https://www.tzgrotw.tw/products/<商品名>。他是對的。
//    正式資料實測：100 支是「只有一個商品＋商品頁網址」（不用比名字就認得出來），
//    多商品裡名字對得上的再 6 支 —— 106 支不用任何人填就連得上。

const U = "https://www.tzgrotw.tw/products/";

// ══════════ ① 網址裡拆商品名 ══════════
ok(prodPageName(U + "自帶光芒｜手鏈｜天然歐泊") === "自帶光芒｜手鏈｜天然歐泊", "商品頁網址拆得出商品名");
ok(prodPageName(U + "12%E6%98%9F%E5%BA%A7") === "12星座", "網址編碼過的也拆得出來");
ok(prodPageName(U + "天然鉍晶體/") === "天然鉍晶體", "結尾的斜線不算名字的一部分");
ok(prodPageName(U + "天然鉍晶體?utm=fb#buy") === "天然鉍晶體", "查詢字串與 # 片段也不算");
ok(prodPageName("https://www.tzgrotw.tw/categories/異象水晶") === "", "**分類頁不是商品頁**（40 支填的是分類頁）");
ok(prodPageName("") === "" && prodPageName(null) === "", "沒有網址不會爆掉");

// ══════════ ② 連結怎麼找 ══════════
{ const 一個商品 = V({ id: "P1", name: "片", productUrl: U + "天然鉍晶體",
                      products: [{ name: "橄欖石黑碧璽｜裸石" }] });
  ok(prodLink(一個商品.products[0], 一個商品) === U + "天然鉍晶體",
     "**只有一個商品 → 那個網址就是它的，不用比名字**（正式資料 100 支走這條）");
  ok(prodKey(一個商品.products[0], 一個商品).startsWith("u:"), "有連結就用連結當身分"); }
{ const 多商品對上 = V({ id: "P2", name: "片", productUrl: U + "黑金超七｜吊墜",
                        products: [{ name: "黑金超七｜吊墜" }, { name: "別的商品" }] });
  ok(prodLink(多商品對上.products[0], 多商品對上) === U + "黑金超七｜吊墜", "多商品時，名字一模一樣的那個才算");
  ok(prodLink(多商品對上.products[1], 多商品對上) === "", "**名字對不上的不給連結**（比錯比不比更糟）"); }
{ const 分類頁 = V({ id: "P3", name: "片", productUrl: "https://www.tzgrotw.tw/categories/異象水晶",
                    products: [{ name: "某商品" }] });
  ok(prodLink(分類頁.products[0], 分類頁) === "", "分類頁不能當商品連結");
  ok(prodKey(分類頁.products[0], 分類頁) === "n:某商品", "沒有連結就退回用名字當身分"); }
{ const 自己填的 = V({ id: "P4", name: "片", productUrl: U + "別的東西",
                      products: [{ name: "某商品", link: U + "人填的" }] });
  ok(prodLink(自己填的.products[0], 自己填的) === U + "人填的", "**商品自己填的 link 最優先**（人明確講的贏推論）"); }

// ══════════ ③ 同一個連結 → 合併成一列；不同名字也合得起來 ══════════
{ const a = V({ id: "A", name: "片A", productUrl: U + "彩虹黑曜岩手串",
                products: [{ name: "能量盾牌｜彩虹黑曜岩手串" }],
                metrics: M(50000, 100), scheduledDate: D(40) });
  const b = V({ id: "B", name: "片B", productUrl: U + "彩虹黑曜岩手串/",
                products: [{ name: "寵粉彩虹黑曜岩手串" }],
                metrics: M(30000, 60), scheduledDate: D(30) });
  mount([a, b], "管理員", "boss");
  ok(prodKey(vid("A").products[0], vid("A")) === prodKey(vid("B").products[0], vid("B")),
     "**名字寫法不同、但官網連結同一個 → 算同一個商品**（老闆要的『用相同官網連結為主』）");
  const h = viewPerf();
  ok(h.includes("能量盾牌｜彩虹黑曜岩手串") && h.includes("也寫成：寵粉彩虹黑曜岩手串"),
     "排行上合成一列，另一個寫法標在旁邊");
  ok(h.includes("openProdVids("), "商品那一列點得開");
  ok(h.includes("官網 ↗"), "而且直接給得出官網連結"); }

// ══════════ ④ 不同材質的不同商品，不准合併 ══════════
{ const a = V({ id: "C", name: "片C", products: [{ name: "925銀誕生石寶寶吊墜" }],
                metrics: M(9000, 20), scheduledDate: D(40) });
  const b = V({ id: "D", name: "片D", products: [{ name: "18K金誕生石寶寶吊墜" }],
                metrics: M(9000, 20), scheduledDate: D(40) });
  mount([a, b], "管理員", "boss");
  ok(prodKey(vid("C").products[0], vid("C")) !== prodKey(vid("D").products[0], vid("D")),
     "**925銀 vs 18K金 是不同材質的不同商品，沒有連結就不准靠名字猜著合併**"); }

// ══════════ ⑤ 點開之後看得到什麼 ══════════
{ const a = V({ id: "E", name: "賣過它的片一", productUrl: U + "四葉草手鍊", editor: "阿剪",
                products: [{ name: "幸運守護｜四葉草手鍊", salePrice: 2800 }],
                metrics: M(88680, 333, D(20)), scheduledDate: D(20) });
  const b = V({ id: "F", name: "賣過它的片二", productUrl: U + "四葉草手鍊", editor: "阿二",
                products: [{ name: "四葉草手鍊（寵粉）", salePrice: 2500 }],
                metrics: M(12000, 40, D(60)), scheduledDate: D(60) });
  const c = V({ id: "G", name: "不相干的片", products: [{ name: "別的" }],
                metrics: M(5000, 10), scheduledDate: D(50) });
  mount([a, b, c], "管理員", "boss");
  let SHOWN = null; showModal = (t, inner) => { SHOWN = { t, inner }; };
  openProdVids(prodKey(vid("E").products[0], vid("E")));
  ok(SHOWN, "點得開");
  ok(SHOWN.t === "幸運守護｜四葉草手鍊", "標題是商品名");
  ok(SHOWN.inner.includes("賣過它的片一") && SHOWN.inner.includes("賣過它的片二"),
     "**兩支影片都列出來**（這就是老闆要的：有什麼影片賣過這個商品）");
  ok(!SHOWN.inner.includes("不相干的片"), "不相干的不會混進來");
  ok(SHOWN.inner.indexOf("賣過它的片一") < SHOWN.inner.indexOf("賣過它的片二"), "觀看高的排前面");
  ok(SHOWN.inner.includes("阿剪") && SHOWN.inner.includes("阿二"), "看得到是誰剪的");
  ok(SHOWN.inner.includes("2,800"), "看得到當時的售價");
  ok(SHOWN.inner.includes("100,680"), "觀看合計算出來（88,680 + 12,000）");
  ok(SHOWN.inner.includes("四葉草手鍊") && SHOWN.inner.includes("↗"), "官網連結點得出去");
  // 網址上的中文被編碼成 %E5%80%AB… 一長串，貼在畫面上沒有人看得懂
  ok(prettyUrl(U + "%E5%80%AB%E6%95%A6%E8%97%8D") === U + "倫敦藍", "顯示時把中文解碼回來");
  ok(prettyUrl("https://x/%zz") === "https://x/%zz", "壞掉的編碼不會爆掉，照原樣顯示");
  ok(SHOWN.inner.includes("<b>2</b> 種商品名") && SHOWN.inner.includes("四葉草手鍊（寵粉）"),
     "另一種寫法也講出來");
  ok(SHOWN.inner.includes("貼錯網址"),
     "**而且要講：如果它們不是同一個東西，就是有人貼錯網址** —— 我們分不出來，不要猜");
  // 沒有連結的商品，要講清楚為什麼沒有、去哪裡補
  openProdVids(prodKey(vid("G").products[0], vid("G")));
  ok(SHOWN.inner.includes("找不到官網連結") && SHOWN.inner.includes("商品與導購"),
     "沒有連結時，講清楚去哪裡補"); }
{ // 正式資料上 90 個連結裡有 1 個是貼錯的：同一個網址掛了 3 個不相干的商品名，
  // 其中一個叫「十十十十」，那支影片連片名都是空的。合併規則沒錯，錯的是資料 ——
  // 所以不要為了這 1 個去放棄規則，把名字全列出來讓人自己去修就好。
  const mk=(id,name)=>V({ id, name:"片"+id, productUrl: U+"寶石套組",
                          products:[{name}], metrics: M(1000,5), scheduledDate: D(40) });
  mount([mk("X1","三顆一起收藏 寶石套組"), mk("X2","T97祖母綠垂吊式耳環"), mk("X3","十十十十")], "管理員", "boss");
  let S3=null; showModal=(t,inner)=>{S3={t,inner};};
  openProdVids(prodKey(vid("X1").products[0], vid("X1")));
  ok(S3.inner.includes("<b>3</b> 種商品名"), "三個名字都列出來，不會只看到第一個");
  ok(S3.inner.includes("十十十十") && S3.inner.includes("T97祖母綠垂吊式耳環"),
     "**壞資料要看得見**（藏起來的話沒有人會去修它）"); }
{ // 大流的片一樣會帶貨 —— 只看 STATE.videos 的話那張清單會少一半
  const df = V({ id: "H", name: "大流的帶貨片", lib: "大流", productUrl: U + "只有大流賣過",
                 products: [{ name: "只有大流賣過" }], metrics: M(60000, 80), scheduledDate: D(40) });
  mount([df], "管理員", "boss");
  let SHOWN2 = null; showModal = (t, inner) => { SHOWN2 = { t, inner }; };
  openProdVids(prodKey(df.products[0], df));
  ok(SHOWN2 && SHOWN2.inner.includes("大流的帶貨片"), "**大流的片也要列出來**（它一樣會帶貨）"); }

const APP = APP_SRC;   // 原始碼層級的斷言用未經改寫的版本
// ══════════ ⑥ 填的連結存得住 ══════════
ok(/id="\$\{prefix\}_pl\$\{i\}"/.test(APP), "商品編輯列上有「官網連結」這一格");
ok(/link:\(val\(prefix\+"_pl"\+i\)\|\|""\)\.trim\(\)/.test(APP), "存檔時會把它收進去");
ok((APP.match(/salePrice:p\.salePrice\|\|"",link:p\.link\|\|""/g) || []).length === 2,
   "**兩處『只留這幾個欄位』的白名單都放行 link**（漏一處，填了就被丟掉）");

{ // 網址上的中文被編碼成 %E5%80%AB… 一長串，貼在畫面上沒有人看得懂
  const enc = V({ id: "N1", name: "片", productUrl: U + "%E5%80%AB%E6%95%A6%E8%97%8D",
                  products: [{ name: "倫敦藍" }], metrics: M(1000, 5), scheduledDate: D(40) });
  mount([enc], "管理員", "boss");
  let S4 = null; showModal = (t, inner) => { S4 = { t, inner }; };
  openProdVids(prodKey(enc.products[0], enc));
  ok(S4.inner.includes(">" + U + "倫敦藍 ↗<"), "**畫面上看到的是中文**");
  ok(S4.inner.includes('href="' + U + "%E5%80%AB%E6%95%A6%E8%97%8D" + '"'),
     "但 href 用原樣（解碼過的不一定連得過去）"); }

// ═══════════════════════════════════════════════════════════════════
// 商品主檔（v206）
// ═══════════════════════════════════════════════════════════════════
// 老闆：「很有可能官網會變更…若是以後官網的連結失去了，可能官網的商品下架了，
//        但是已經建檔的排序名單我還是希望能夠找得到、能夠在上面，只是可以註明
//        已下架，讓我可以再次新增商品再次販售，然後可以保持是同一個連貫的紀錄。」
//
// 他戳到 v205 的弱點：把**連結當身分證**，而連結會變。
// ⚠️ products 這個集合早就存在（選品配對 v138 建的，v175 把工作台拿掉、集合留著），
//    所以是接上去，不是另開一個。

const PD = (o) => Object.assign({ id: "PD1", name: "", sku: "", officialUrl: "", shoplineLink: "",
  image: "", aliases: [], oldUrls: [], status: "on", offAt: "", createdAt: "", updatedAt: "" }, o);

// ══════════ ① 建了檔，身分就是編號，不再是連結 ══════════
{ const v0 = V({ id: "V1", name: "片", productUrl: U + "四葉草手鍊",
                 products: [{ name: "幸運守護｜四葉草手鍊" }], metrics: M(9000, 20), scheduledDate: D(40) });
  mount([v0], "管理員", "boss", [PD({ id: "PDa", name: "幸運守護｜四葉草手鍊", officialUrl: U + "四葉草手鍊" })]);
  ok(prodKey(vid("V1").products[0], vid("V1")) === "m:PDa", "**建了檔就用編號當身分**，不再是連結");
  ok(prodMasterOf(vid("V1").products[0], vid("V1")).id === "PDa", "認得回主檔那一筆"); }

// ══════════ ② 官網換網址 → 舊連結留著，紀錄接得起來 ══════════
{ const 舊片 = V({ id: "O1", name: "去年賣它的片", productUrl: U + "舊網址",
                  products: [{ name: "某商品" }], metrics: M(50000, 100, D(200)), scheduledDate: D(200) });
  const 新片 = V({ id: "N2", name: "今年賣它的片", productUrl: U + "新網址",
                  products: [{ name: "某商品（改版）" }], metrics: M(20000, 40, D(10)), scheduledDate: D(10) });
  // 主檔：現用是新網址，舊網址收在 oldUrls；現用名字是新的，舊名字收在 aliases
  const m = PD({ id: "PDb", name: "某商品（改版）", officialUrl: U + "新網址",
                 aliases: ["某商品"], oldUrls: [U + "舊網址"] });
  mount([舊片, 新片], "管理員", "boss", [m]);
  ok(prodKey(vid("O1").products[0], vid("O1")) === "m:PDb", "**換網址之前的那支片，照樣認得回來**");
  ok(prodKey(vid("N2").products[0], vid("N2")) === "m:PDb", "換網址之後的那支也是");
  ok(prodKey(vid("O1").products[0], vid("O1")) === prodKey(vid("N2").products[0], vid("N2")),
     "**兩段歷史接成一段**（老闆要的「連貫的紀錄」）");
  let S = null; showModal = (t, inner) => { S = { t, inner }; };
  openProdVids("m:PDb");
  ok(S.inner.includes("去年賣它的片") && S.inner.includes("今年賣它的片"),
     "點開看得到換網址前後的所有影片");
  ok(S.inner.includes("70,000"), "觀看合計跨越換網址前後（50,000 + 20,000）"); }

// ══════════ ③ 下架了，排行上照樣找得到 ══════════
{ const v1 = V({ id: "F1", name: "賣下架品的片", productUrl: U + "停售的東西",
                 products: [{ name: "停售的東西" }], metrics: M(77000, 150), scheduledDate: D(40) });
  const m = PD({ id: "PDc", name: "停售的東西", officialUrl: U + "停售的東西",
                 status: "off", offAt: "2026-09-01T00:00:00" });
  mount([v1], "管理員", "boss", [m]);
  ok(prodIsOff(prodById("PDc")), "狀態是已下架");
  const h = viewPerf();
  ok(h.includes("停售的東西"), "**已下架的商品照樣排在帶貨商品排行上**（老闆指定）");
  ok(h.includes("已下架"), "而且標出來");
  ok(h.includes("77,000"), "它的觀看數照樣算");
  let S = null; showModal = (t, inner) => { S = { t, inner }; };
  openProdVids("m:PDc");
  ok(S.inner.includes("已下架"), "點開也看得到狀態");
  ok(S.inner.includes("賣下架品的片"), "賣過它的影片一支都沒少"); }

// ══════════ ④ 沒建檔的照舊（不要因為主檔空的就整個壞掉）══════════
{ const v2 = V({ id: "U1", name: "片", productUrl: U + "還沒建檔的",
                 products: [{ name: "還沒建檔的" }], metrics: M(9000, 20), scheduledDate: D(40) });
  mount([v2], "管理員", "boss", []);
  ok(prodKey(vid("U1").products[0], vid("U1")).startsWith("u:"), "主檔沒有這一筆 → 退回用連結");
  ok(prodMasterOf(vid("U1").products[0], vid("U1")) === null, "而且講清楚是沒有，不要回一個假的");
  let S = null; showModal = (t, inner) => { S = { t, inner }; };
  openProdVids(prodKey(vid("U1").products[0], vid("U1")));
  ok(S.inner.includes("還沒建檔"), "點開時說明還沒建檔");
  ok(S.inner.includes("建檔"), "而且給得出建檔的入口"); }

// ══════════ ⑤ 誰能動主檔 ══════════
{ const v3 = V({ id: "R1", name: "片", products: [{ name: "某商品" }], metrics: M(9000, 20), scheduledDate: D(40) });
  const m = PD({ id: "PDd", name: "某商品" });
  let S = null; showModal = (t, inner) => { S = { t, inner }; };
  mount([v3], "管理員", "boss", [m]);
  openProdVids("m:PDd");
  ok(S.inner.includes("改商品資料"), "老闆看得到管理區");
  mount([v3], "Regina", "manager", [m]);
  openProdVids("m:PDd");
  ok(S.inner.includes("改商品資料"), "經理人也看得到");
  mount([v3], "阿剪", "editor", [m]);
  openProdVids("m:PDd");
  ok(!S.inner.includes("改商品資料"),
     "**剪輯看得到排行，但動不了主檔**（看得到卻按不動最讓人火大，所以整塊藏起來）");
  ok(S.inner.includes("賣過它"), "但他照樣看得到哪些影片賣過它");
  mount([v3], "管理員", "boss", [m]);
  VIEW_AS = "阿剪";
  openProdVids("m:PDd");
  ok(!S.inner.includes("改商品資料"), "員工視角預覽時也不給（全站唯讀的規矩）");
  VIEW_AS = null; }

// ══════════ ⑥ 改名／換網址：舊的一定要留著 ══════════
{ const m = PD({ id: "PDe", name: "舊名字", officialUrl: U + "舊網址", aliases: [], oldUrls: [] });
  const v4 = V({ id: "S1", name: "片", products: [{ name: "舊名字" }], metrics: M(9000, 20), scheduledDate: D(40) });
  mount([v4], "管理員", "boss", [m]);
  const WROTE = [];
  closeModal = () => {}; toast = () => {};   // 假 DOM 沒有 modalRoot／toast 節點；收尾不是這一段要測的
  dbUpdate = (coll, id, patch) => { WROTE.push({ coll, id, patch }); return Promise.resolve(true); };
  $.pd_name = { value: "新名字" }; $.pd_sku = { value: "" }; $.pd_url = { value: U + "新網址" };
  prodSave("PDe");
  const w = WROTE[0];
  ok(w && w.coll === "products" && w.id === "PDe", "寫到主檔那一筆");
  ok(w.patch.name === "新名字" && w.patch.officialUrl === U + "新網址", "換成新的");
  ok(w.patch.aliases.indexOf("舊名字") >= 0,
     "**舊名字留成別名**（丟掉的話，用舊寫法建檔的影片下一秒就對不回來）");
  ok(w.patch.oldUrls.indexOf(U + "舊網址") >= 0, "**舊網址留成舊連結**（同上）"); }

// ══════════ ⑦ 合併：兩筆變一筆，名字與網址全收過來 ══════════
{ const a = PD({ id: "PDf", name: "留下的", officialUrl: U + "留下的網址", aliases: ["留下的別名"] });
  const b = PD({ id: "PDg", name: "併掉的", officialUrl: U + "併掉的網址", aliases: ["併掉的別名"],
                 oldUrls: [U + "併掉的舊網址"] });
  const v5 = V({ id: "T1", name: "片", products: [{ name: "留下的" }], metrics: M(9000, 20), scheduledDate: D(40) });
  mount([v5], "管理員", "boss", [a, b]);
  const WROTE = [], DELED = [];
  closeModal = () => {}; toast = () => {};
  dbUpdate = (coll, id, patch) => { WROTE.push({ coll, id, patch }); return Promise.resolve(true); };
  dbDel = (coll, id) => { DELED.push({ coll, id }); return Promise.resolve(true); };
  global.confirm = () => true;
  $.pd_merge = { value: "PDg" };
  prodMerge("PDf");
  const w = WROTE[0];
  ok(w && w.id === "PDf", "寫到「留下的」那一筆");
  ["併掉的", "併掉的別名"].forEach(n =>
    ok(w.patch.aliases.indexOf(n) >= 0, `「${n}」收進別名`));
  [U + "併掉的網址", U + "併掉的舊網址"].forEach(u =>
    ok(w.patch.oldUrls.indexOf(u) >= 0, `「${prettyUrl(u)}」收進舊連結`));
  ok(w.patch.aliases.indexOf("留下的") < 0, "自己的現用名字不會變成自己的別名");
  return_check: {
    ok(DELED.length === 0, "（同步階段還沒刪，刪是在寫成功之後）");
  } }

// ══════════ ⑧ 建檔會把用過的所有寫法收成別名 ══════════
{ const v6 = V({ id: "W1", name: "片一", productUrl: U + "同一個東西",
                 products: [{ name: "寫法甲" }], metrics: M(9000, 20), scheduledDate: D(40) });
  const v7 = V({ id: "W2", name: "片二", productUrl: U + "同一個東西",
                 products: [{ name: "寫法乙" }], metrics: M(5000, 10), scheduledDate: D(40) });
  const v8 = V({ id: "W3", name: "大流也賣過", lib: "大流", productUrl: U + "同一個東西",
                 products: [{ name: "寫法丙" }], metrics: M(3000, 8), scheduledDate: D(40) });
  mount([v6, v7, v8], "管理員", "boss", []);
  const WROTE = [];
  closeModal = () => {}; toast = () => {};
  dbWrite = (op, coll, id, payload) => { WROTE.push({ op, coll, id, payload }); return Promise.resolve(true); };
  $.pd_new_name = { value: "寫法甲" }; $.pd_new_sku = { value: "A1" }; $.pd_new_url = { value: U + "同一個東西" };
  prodCreate(prodKey(vid("W1").products[0], vid("W1")));
  const w = WROTE[0];
  ok(w && w.op === "set" && w.coll === "products", "建檔是新增一筆主檔");
  ok(w.payload.name === "寫法甲" && w.payload.sku === "A1", "名稱與貨號存下來");
  ok(w.payload.status === "on", "預設是在售");
  ok(w.payload.aliases.indexOf("寫法乙") >= 0, "其他寫法收成別名");
  ok(w.payload.aliases.indexOf("寫法丙") >= 0,
     "**大流那邊用的寫法也要收**（漏了，那支片之後就認不回來）");
  ok(w.payload.aliases.indexOf("寫法甲") < 0, "現用名字不會重複收成自己的別名"); }

// ══════════ ⑨ 集合本來就有，不要另開一個 ══════════
ok(/products/.test(fs.readFileSync(__dirname + "/../firebase/firestore.rules", "utf8")),
   "firestore.rules 已經涵蓋 products（v138 就有了）");
ok(/"products"/.test(fs.readFileSync(__dirname + "/../tools/_fs.py", "utf8")),
   "備份清單也涵蓋（沒列到就是靜悄悄地不備份）");

// ══════════ ⑩ FB＋IG 是一支片兩則貼文，不是兩支片（v206）══════════
// 老闆：「fb 和 ig 幾乎是同時同一支影片上兩邊，不能算成 2 支影片。」
// 他說得對，而且系統本來就沒有算成兩支 —— 排行上是一列。
// 會誤會是因為平台卡片上「FB 152 支／IG 107 支」擺在一起很像可以相加，
// 但其中 91 支是同一批片，不重複只有 168 支。
{ const 兩邊都發 = V({ id: "B1", name: "兩邊都發的片", scheduledDate: D(30), metrics: [
    { platform: "FB", account: "FB a", views: 60000, likes: 100, comments: 30, postAt: D(30) + "T10:00:00" },
    { platform: "IG", account: "IG a", views: 40000, likes: 80, comments: 20, postAt: D(30) + "T10:00:00" }] });
  const 只有FB = V({ id: "B2", name: "只發 FB 的片", scheduledDate: D(30), metrics: [
    { platform: "FB", account: "FB a", views: 5000, likes: 10, comments: 6, postAt: D(30) + "T10:00:00" }] });
  mount([兩邊都發, 只有FB], "管理員", "boss");
  const h = viewPerf();
  ok((h.match(/兩邊都發的片/g) || []).length === 1,
     "**同一支片在排行上只出現一列**，不會因為發了兩個平台就變兩列");
  ok(h.includes("100,000"), "它的觀看是兩邊相加（兩邊的觀看是不同的人看的）");
  ok(h.includes("不重複合計 <b>2</b> 支"),
     "**把不重複的支數明講出來**（FB 2 支 ＋ IG 1 支，但只有 2 支不同的影片）");
  ok(h.includes("支發過"), "平台卡上寫「N 支發過」，不是光一個「N 支」");
  ok(rmkAired(vid("B1")).length === 1, "而且「用過幾次」也只算一次（同一天的兩個平台）"); }
{ // 只有一個平台的時候不用講這句（沒有東西會重複，講了是雜訊）
  const 只有一個平台 = V({ id: "B3", name: "片", scheduledDate: D(30), metrics: [
    { platform: "FB", account: "FB a", views: 5000, likes: 10, comments: 6, postAt: D(30) + "T10:00:00" }] });
  mount([只有一個平台], "管理員", "boss");
  ok(!viewPerf().includes("不重複合計"), "只有一個平台時不出現這句"); }

// ═══════════════════════════════════════════════════════════════════
// 未在資料庫裡的影片（v206）
// ═══════════════════════════════════════════════════════════════════
// 老闆：「這個系統是新的，才做不到半年，可是我們 meta 裡面的資料有 2 年，
//        所以你找到很多的是『系統裡面沒有建檔的』…你只是給成效清單，然後標注
//        『未建檔』這樣會比較簡單嗎？我們選中的再自己手動去找輸入，然後就歸進到舊片。」
//
// ⚠️ 我原本提議「自動建 1,300 支」，他否決了 ——「因為這是因為我們人為的問題」。
//    他是對的：自動生 1,300 支等於把人為的疏漏變成一千三百筆系統垃圾，沒人會回頭清。
//    所以這張卡**只列出來**，建不建是人的決定。

const UF = (items) => ({ at: "2026-09-13T06:20:00", days: 730, items });
const UITEM = (o) => Object.assign({ cap: "某則貼文的文案", n: 1, views: 9000, comments: 20,
  first: "2025-01-01", last: "2025-01-01", link: "https://www.facebook.com/reel/1/", plats: "FB" }, o);

// ⚠️ v207 老闆：「我不是要這樣，我要原本的成效排行…你的排行都是依照 meta 來的資料，
//    只是說『有的你找的到系統中』，有的沒有，沒有的只要右邊加一個『新增進系統』，
//    但排序和排行放在一起。」
//    他是對的 —— 另外開一張卡等於把同一件事拆成兩個榜，人要自己在腦裡合併。
{ const 高 = V({ id: "H1", name: "系統裡的高觀看片", metrics: M(500000, 900), scheduledDate: D(40) });
  const 低 = V({ id: "L1", name: "系統裡的低觀看片", metrics: M(1000, 5), scheduledDate: D(40) });
  mount([高, 低], "管理員", "boss", [], UF([
    UITEM({ cap: "未建檔但觀看很高的舊片", views: 300000, comments: 1880, n: 6,
            first: "2025-03-11", last: "2025-06-02" })]));
  const h = viewPerf();
  ok(!h.includes("未在資料庫裡的影片（"), "**那張獨立的卡不見了**（同一件事不要拆成兩個榜）");
  ok(h.includes("系統裡的高觀看片") && h.includes("未建檔但觀看很高的舊片") && h.includes("系統裡的低觀看片"),
     "三列都在同一張排行上");
  ok(h.indexOf("系統裡的高觀看片") < h.indexOf("未建檔但觀看很高的舊片"),
     "**照觀看排在一起**：50 萬 > 30 萬");
  ok(h.indexOf("未建檔但觀看很高的舊片") < h.indexOf("系統裡的低觀看片"),
     "而且 30 萬 > 1,000 —— 未建檔的不會被丟到最後面");
  ok(h.includes("未建檔"), "未建檔的那一列標出來");
  // v211 老闆把這顆鍵改名：「你的『建案進系統』名字改『新增進系統』」。
  // 舊名字不准留在畫面上 —— 兩個名字同時存在，員工會以為是兩顆不同的鍵。
  ok(h.includes("新增進系統") && !h.includes("建案進系統"),
     "**右邊那顆鍵是「新增進系統」**（老闆的用字），而且舊名字不留在畫面上");
  ok(h.includes("unfiledAdd("), "而且按得下去");
  ok(h.includes("發過 6 次"), "重發幾次也看得到");
  ok(h.includes("1,880"), "留言數在"); }

{ // 未建檔的沒有類型／剪輯／帶貨／二創 —— 系統裡根本沒有那一筆，不要編一個出來
  const v = V({ id: "K1", name: "片", metrics: M(1000, 5), scheduledDate: D(40) });
  mount([v], "管理員", "boss", [], UF([UITEM({ cap: "未建檔的", views: 9000, comments: 30 })]));
  const h = viewPerf();
  const row = h.slice(h.indexOf("未建檔的"), h.indexOf("未建檔的") + 1400);
  ok(/data-label="類型"[^>]*><span class="muted">—/.test(row), "類型是破折號");
  ok(/data-label="剪輯"><span class="muted">—/.test(row), "剪輯是破折號");
  ok(/data-label="帶貨商品"><span class="muted">—/.test(row), "帶貨商品是破折號");
  ok(/data-label="上次二創"[^>]*><span class="muted">—/.test(row), "上次二創是破折號");
  ok(!row.includes("排二創"), "**未建檔的不能排二創**（系統裡沒有那一筆，排不了）"); }

{ // 沒問過觀看數的（--no-unfiled-views 或 --from-file）→ 顯示破折號，不是 0
  const v = V({ id: "K2", name: "片", metrics: M(1000, 5), scheduledDate: D(40) });
  mount([v], "管理員", "boss", [], UF([UITEM({ cap: "沒問過觀看數的", views: 0, comments: 30 })]));
  const h = viewPerf();
  const row = h.slice(h.indexOf("沒問過觀看數的"), h.indexOf("沒問過觀看數的") + 1400);
  ok(!/data-label="觀看"[^>]*><b>0<\/b>/.test(row),
     "**觀看不准印成 0** —— 那會讓人以為這支片沒人看，正好相反");
  ok(/data-label="觀看"[^>]*><span class="muted"/.test(row), "顯示破折號"); }

{ // 沒跑過同步就沒有未建檔的列 —— 排行照舊
  const v = V({ id: "K3", name: "片", metrics: M(9000, 20), scheduledDate: D(40) });
  mount([v], "管理員", "boss", [], null);
  const h = viewPerf();
  ok(h.includes("片") && !h.includes("未建檔"), "沒有清單時排行上一列未建檔的都沒有");
  mount([v], "管理員", "boss", [], UF([]));
  ok(!viewPerf().includes("未建檔"), "清單是空的也一樣（全部建完了就該消失）"); }

{ // 權限：不碰影片的職位看得到排行，但沒有「新增進系統」
  const v = V({ id: "K4", name: "片", metrics: M(1000, 5), scheduledDate: D(40) });
  const u = UF([UITEM({ cap: "未建檔的", views: 9000, comments: 30 })]);
  mount([v], "阿剪", "editor", [], u);
  ok(viewPerf().includes("未建檔的"), "剪輯看得到未建檔的列");
  mount([v], "管理員", "boss", [], u);
  VIEW_AS = "阿剪";
  // ⚠️ 不能只比對「新增進系統」四個字 —— 卡片的說明文字裡也有那四個字，
  //    比對整頁的話，按鈕明明沒長出來也會被判成有。要比對**按鈕本身**。
  ok(!viewPerf().includes("unfiledAdd("),
     "員工視角預覽時沒有「新增進系統」那顆鍵（全站唯讀的規矩）");
  VIEW_AS = null; }

{ // 依二創建議那個排法：未建檔的不列（系統裡沒有那一筆，排不了二創）
  const v = V({ id: "K5", name: "有成效的片", metrics: M(50000, 100, D(40)), scheduledDate: D(40) });
  mount([v], "管理員", "boss", [], UF([UITEM({ cap: "未建檔的", views: 900000, comments: 30 })]));
  PERF_SORT = "remake";
  const h = viewPerf();
  PERF_SORT = "views";
  ok(!h.includes("未建檔的"),
     "**「依二創建議」不列未建檔的** —— 它們排不了二創，列進去只會佔位置"); }

// ══════════ ⑩ FB＋IG 是一支片兩則貼文，不是兩支片（v206）══════════
// 老闆：「fb 和 ig 幾乎是同時同一支影片上兩邊，不能算成 2 支影片。」
// 他說得對，而且系統本來就沒有算成兩支 —— 排行上是一列。
// 會誤會是因為平台卡片上「FB 152 支／IG 107 支」擺在一起很像可以相加，
// 但其中 91 支是同一批片，不重複只有 168 支。
{ const 兩邊都發 = V({ id: "B1", name: "兩邊都發的片", scheduledDate: D(30), metrics: [
    { platform: "FB", account: "FB a", views: 60000, likes: 100, comments: 30, postAt: D(30) + "T10:00:00" },
    { platform: "IG", account: "IG a", views: 40000, likes: 80, comments: 20, postAt: D(30) + "T10:00:00" }] });
  const 只有FB = V({ id: "B2", name: "只發 FB 的片", scheduledDate: D(30), metrics: [
    { platform: "FB", account: "FB a", views: 5000, likes: 10, comments: 6, postAt: D(30) + "T10:00:00" }] });
  mount([兩邊都發, 只有FB], "管理員", "boss");
  const h = viewPerf();
  ok((h.match(/兩邊都發的片/g) || []).length === 1,
     "**同一支片在排行上只出現一列**，不會因為發了兩個平台就變兩列");
  ok(h.includes("100,000"), "它的觀看是兩邊相加（兩邊的觀看是不同的人看的）");
  ok(h.includes("不重複合計 <b>2</b> 支"),
     "**把不重複的支數明講出來**（FB 2 支 ＋ IG 1 支，但只有 2 支不同的影片）");
  ok(h.includes("支發過"), "平台卡上寫「N 支發過」，不是光一個「N 支」");
  ok(rmkAired(vid("B1")).length === 1, "而且「用過幾次」也只算一次（同一天的兩個平台）"); }
{ // 只有一個平台的時候不用講這句（沒有東西會重複，講了是雜訊）
  const 只有一個平台 = V({ id: "B3", name: "片", scheduledDate: D(30), metrics: [
    { platform: "FB", account: "FB a", views: 5000, likes: 10, comments: 6, postAt: D(30) + "T10:00:00" }] });
  mount([只有一個平台], "管理員", "boss");
  ok(!viewPerf().includes("不重複合計"), "只有一個平台時不出現這句"); }

{ // 按「建檔」→ 補進**正式影片庫**，不是大流
  // ⚠️ 老闆：「不要建到大流，我們不是說好『等這裡做好，大流量影片庫要刪掉』。」
  //    他是對的 —— 建進一個準備拆掉的庫，等於製造下一次搬家。
  const v = V({ id: "Z4", name: "片", metrics: M(5000, 10), scheduledDate: D(40) });
  mount([v], "管理員", "boss", [], UF([
    UITEM({ cap: "這一段就是貼文的原文", link: "https://www.facebook.com/reel/9876/",
            first: "2025-03-11", last: "2025-06-02" })]));
  let SHOWN = null; showModal = (t, inner) => { SHOWN = { t, inner }; };
  unfiledAdd(0);
  ok(SHOWN && SHOWN.t === "把這支舊片補進影片庫", "**不是「直接加一支到大流」**");
  ok(!SHOWN.inner.includes("大流"), "整個視窗裡不該再提到大流");
  ok(SHOWN.inner.includes("這一段就是貼文的原文"),
     "**文案自動帶進去**（而且是跟平台一模一樣的那份，下次同步就對得回來）");
  ok(SHOWN.inner.includes("https://www.facebook.com/reel/9876/"), "上片連結也帶進去");
  ok(/id="uf_date" type="date" value="2025-03-11"/.test(SHOWN.inner),
     "**上片日期預設帶第一則貼文的日期**，不是今天");
  ok(/id="uf_name" placeholder/.test(SHOWN.inner) && !/id="uf_name" value=/.test(SHOWN.inner),
     "**檔名故意留空** —— 代填一個猜的名字，人會按過去就存檔，留下一支找不到原檔的片");
  ok(/id="uf_drive" placeholder/.test(SHOWN.inner) && !/id="uf_drive" value=/.test(SHOWN.inner),
     "雲端資料夾也留空（那要人自己去 Drive 找回毛片）"); }

{ // 建出來的是「已上片的舊片」，不會跑進待認領、毛片庫存或待審
  // ⚠️ 擋住生產面的不是 lib，是 stage：poolAll() 與 rawStock() 都要求
  //    stage==="待處理"，needsReview() 要求沒有 reviewStatus。
  const src = APP.slice(APP.indexOf("function unfiledAdd("), APP.indexOf("function unfiledAdd(") + 3000);
  ok(!/lib:\s*DF_LIB/.test(src) && !/lib:\s*"大流"/.test(src), "**沒有把 lib 設成大流**");
  ok(/tags:\["舊片"\]/.test(src), "帶「舊片」標籤");
  ok(/stage:"已完成", published:true/.test(src), "一步到位（不進待處理 → 不進待認領、不進毛片庫存）");
  ok(/reviewStatus:"通過"/.test(src), "審核也先標好（成品不需要審，免得跑進審片清單）");
  ok(/finishedAt:when2/.test(src),
     "**完成日用貼文那天，不是今天** —— 用 nowIso() 的話兩年前的舊片會跑進「今日完成」");
  ok(/scheduledDate:when2/.test(src), "上片日也用那天（「多久沒用」才算得出來）");
  // 生產面的三個池子確實只看 stage
  ok(/function poolAll\(\)[\s\S]{0,300}stage==="待處理"/.test(APP), "待認領池只收「待處理」");
  ok(/function rawStock\(\)[\s\S]{0,200}stage==="待處理"/.test(APP), "毛片庫存也只收「待處理」");
  ok(/function doneToday|doneToday=\(STATE\.videos\|\|\[\]\)\.filter\(v=>isPublished\(v\)&&String\(v\.finishedAt\|\|""\)\.slice\(0,10\)===today\)/.test(APP),
     "「今日完成」是比對 finishedAt===today（所以完成日不能填今天）"); }

// 同步端：清單是 meta_sync 寫進 meta/settings.unfiledPosts 的
{ const SY = fs.readFileSync(__dirname + "/../tools/meta_sync.py", "utf8");
  ok(/def unfiled_groups\(/.test(SY), "同步端會把對不到的貼文依文案分組");
  ok(/if u\.get\("candidates"\):\s*\n\s*continue/.test(SY),
     "**「分不出是哪一支」的不算未建檔**（那是比對問題，不是沒建檔）");
  // ⚠️ 這兩條本來只檢查「常數有沒有宣告」，突變測試證明那是**空的斷言** ——
  //    把 out[:UNFILED_MAX] 改成 out、把門檻那行拿掉，常數還在，測試照樣綠。
  //    真正要測的是「有沒有被用」，所以搬到 tests/meta-match.py 直接呼叫
  //    unfiled_groups() 驗行為。這裡只留「常數還在、而且是那個數字」。
  // ⚠️ v206：門檻從觀看數改成**留言數**。對不上的貼文從來沒被問過成效，
  //    views 全是 0，用觀看當門檻的話清單永遠是空的（正式資料驗證出來的）。
  ok(/UNFILED_MIN_COMMENTS = 5/.test(SY), "門檻是留言 5 則（跟達標條件的另一半同一條線）");
  ok(!/UNFILED_MIN_VIEWS/.test(SY), "**不要再用觀看數當門檻** —— 那些貼文的 views 是 0");
  ok(/UNFILED_MAX = 200/.test(SY), "上限是 200 —— 人一次看不完兩百筆以上");
  ok(/updateMask\.fieldPaths=unfiledPosts/.test(SY),
     "**用 updateMask 只寫這一格**（整份覆寫會把系統設定洗掉）");
  // v207：權杖改名成 fb_token / meta_token（以前兩個都叫 token，
  //       Firebase 的那個會被傳進 Meta 的函式）
  ok(/report_unfiled\(cfg_fb, fb_token, unfiled, args\.days\)/.test(SY),
     "真的有接到同步流程上（不然寫了函式沒人呼叫）");
  ok(/write_back\(cfg_fb, fb_token,/.test(SY) && /add_insights\(want, cfg, meta_token,/.test(SY),
     "**兩個權杖分開了**：寫資料庫用 fb_token、問 Meta 用 meta_token");
  ok(!/add_insights\([^)]*\bfb_token\b/.test(SY),
     "Firebase 的權杖不准傳進 Meta 的函式"); }

// ══════════ 排行上看不到的那幾支：注明缺上片連結（v211）══════════
//
// 老闆看著排行說「我覺得你找出來的好像太少」。一部分原因是：已經上片、但一個成效
// 數字都沒有的片**在排行上根本不出現**。不出現比排在最後面更糟 —— 排在最後面看得出
// 「它成效差」，不出現看起來像「沒這支片」。
//
// 正式資料：這兩年標已上片的 319 支，上片連結只有 1 支有填。
// 老闆：「這個就注明缺上片連結就好」。
{ const 有數字 = V({ id: "N1", name: "有成效的片", metrics: M(50000, 10), scheduledDate: D(20) });
  const 沒數字缺連結 = V({ id: "N2", name: "上片了卻沒數字的片", scheduledDate: D(20), publishedLink: "" });
  const 沒數字有連結 = V({ id: "N3", name: "有連結但還沒對到的片", scheduledDate: D(20),
                          publishedLink: "https://www.facebook.com/reel/1/" });
  const 還沒上片 = V({ id: "N4", name: "還沒播的片", scheduledDate: D(-5) });
  mount([有數字, 沒數字缺連結, 沒數字有連結, 還沒上片], "管理員", "boss");
  ok(perfNoData().map(v => v.id).sort().join() === "N2,N3",
     "**已上片卻一個成效數字都沒有**的才算（有數字的、還沒播的都不算）");
  const h = viewPerf();
  ok(/另外有 <b>2<\/b> 支已經上片的影片/.test(h), "排行底下講得出有幾支看不到");
  ok(/其中 <b>1<\/b> 支<b>缺上片連結<\/b>/.test(h), "**而且講得出其中幾支是缺上片連結**");
  ok(/看板 → 🔗 上片連結/.test(h), "還要指去補的地方（講了問題不講去哪修等於沒講）");
  // ⚠️ 這段是**註記**不是警報：全部都有數字的時候要整段消失，不要留一句「0 支」。
  mount([有數字], "管理員", "boss");
  ok(perfNoData().length === 0 && !/另外有 <b>/.test(viewPerf()),
     "全部都有數字時整段消失（不要留一句沒有意義的「0 支」）");
  // 缺連結是 0 的時候只講總數，不要硬寫「其中 0 支缺上片連結」
  mount([有數字, 沒數字有連結], "管理員", "boss");
  const h2 = viewPerf();
  ok(/另外有 <b>1<\/b> 支/.test(h2) && !/缺上片連結/.test(h2),
     "沒有人缺連結時就不提缺連結那句"); }

console.log(`\n${pass} / ${pass + fail} 通過`);
if (fail) process.exit(1);
