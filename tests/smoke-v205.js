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

console.log(`\n${pass} / ${pass + fail} 通過`);
if (fail) process.exit(1);
