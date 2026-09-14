// v210 / A-1：選品清單的地基
//
// 老闆的流程：設計師從官網挑商品 → 一次貼十條網址 → 系統抓回名稱／照片／價格
//             → 按月份列成清單 → 行銷看得到這個品賣過沒。
//
// A-1 只做地基：新職位、兩個權限、網址的規矩、商品只有一列。畫面在 A-2。
//
// ⚠️ 這一支最重要的兩條：
//    ① 設計師的分頁**不准**退回剪輯那一整組（ROLE_TABS 漏寫就會發生，而且畫面上很難發現）
//    ② 同一個商品選兩個月**不准**變成兩列（變兩列，這個品的營收就被拆成兩半，ROAS 從此算不準）
const fs = require("fs"), path = require("path");
const APP = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const FB = fs.readFileSync(path.join(__dirname, "..", "fb.js"), "utf8");
const RULES = fs.readFileSync(path.join(__dirname, "..", "firebase", "firestore.rules"), "utf8");
const FSPY = fs.readFileSync(path.join(__dirname, "..", "tools", "_fs.py"), "utf8");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
let src = APP.replace(/^let /gm, "").replace(/^const /gm, "");
const el = () => ({ value: "", innerHTML: "", textContent: "", className: "", style: {}, checked: false,
  tagName: "DIV", dataset: {}, disabled: false, readOnly: false, isConnected: true, scrollTop: 0, rows: 1,
  classList: { toggle(){}, add(){}, remove(){}, contains(){ return false; } },
  addEventListener(){}, appendChild(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
  getAttribute(){ return null; }, setAttribute(){}, closest(){ return null; }, focus(){}, click(){},
  insertAdjacentHTML(p, h){ this.innerHTML += h; }, getBoundingClientRect(){ return { top:0,left:0,bottom:0,right:0 }; } });
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
let modalHTML = "";
global.document = { getElementById: (id) => { const e = el();
    if (id === "modalRoot") Object.defineProperty(e, "innerHTML", { set(v){ modalHTML = v; }, get(){ return modalHTML; } });
    return e; },
  get activeElement(){ return null; }, addEventListener(){}, createElement: () => el(),
  body: { classList: { toggle(){}, add(){}, remove(){} } }, querySelector: () => null, querySelectorAll: () => [] };
global.window = { addEventListener(){}, innerWidth: 1200, innerHeight: 800, scrollY: 0, scrollTo(){}, DB: null,
  location: { reload(){} }, open: () => ({}) };
global.requestAnimationFrame = (f) => f(); global.navigator = { onLine: true };
global.confirm = () => true; global.prompt = () => null;
eval(src);
const FROZEN = new Date(Date.now() + 288e5).toISOString().slice(0, 8) + "15";
todayTW = () => FROZEN; ydayTW = () => FROZEN.slice(0, 8) + "14"; refreshToday();

let pass = 0, fail = 0;
function ok(n, c, x) { if (c) { pass++; } else { fail++; console.log("FAIL  " + n, x === undefined ? "" : JSON.stringify(x).slice(0, 200)); } }
function reset(users, who, role) {
  modalHTML = ""; VIEW_AS = null; BRAND = ""; SET_TAB = "basic";
  global.window.DB = { set: async () => {}, update: async () => {}, del: async () => {},
    scheduleSet: async () => {}, setSettings: async () => {},
    videosWatched: () => true, netState: () => ({ online: true, pending: false }) };
  const raw = { users: users || [], settings: { dailyTarget: 4, videoTags: [], sources: [], postPlatforms: [],
      intlAccounts: [], shopeeAccounts: [], msAccounts: [], exchangeRates: {}, contacts: [], reviewSince: "2020-01-01" },
    schedule: {}, tasks: {}, shifts: {}, logs: [], deletedVideos: [], videos: [], products: [] };
  LAST_RAW = raw; STATE = decorate(raw);
  localStorage.setItem("ecdr_user", who || "管理員"); localStorage.setItem("ecdr_role", role || "boss");
}
const U = (name, role, extra) => Object.assign({ name, role }, extra || {});

// ══════════ ① 新職位「設計師」 ══════════
ok("職位表上有設計師", ROLE_LABEL.design === "設計師");
ok("英文介面也有（不然海外看到空白）", !!ROLE_LABEL_EN.design && !!ROLE_GROUP_EN.design);
ok("他會打卡、進團隊看板（跟其他同仁一樣）", STAFF_ROLES.includes("design"));
ok("他不剪片", NO_EDIT_ROLES.includes("design"));
ok("**他不下載影片資料**（整包 2.5 MB，他一個影片數字都不看）", NO_VIDEO_ROLES.includes("design"));
ok("needVideos 也說不用", needVideos("design") === false);
// ⚠️ 這一條在守 ROLE_TABS 漏寫：myTabs 找不到職位會退回 ROLE_TABS.editor
{ reset([U("小設", "design")], "小設", "design");
  const tabs = myTabs().map(t => t[0]);
  ok("**設計師只有傳訊息**（沒勾選品之前）", tabs.join() === "chat", tabs);
  ok("**絕對不能拿到剪輯那一整組分頁**",
     !tabs.includes("videos") && !tabs.includes("work") && !tabs.includes("cal") && !tabs.includes("board"), tabs); }
{ reset([U("阿剪", "editor")], "阿剪", "editor");
  ok("（對照）剪輯本來那幾頁沒被動到",
     myTabs().map(t => t[0]).join() === "chat,work,board,videos,cal", myTabs().map(t => t[0])); }
// fb.js 有自己一份清單，兩邊不同步的話設計師照樣會下載 2.5 MB
{ const m = FB.match(/NO_VIDEO_ROLES\s*=\s*\[([^\]]*)\]/);
  const fbList = (m ? m[1] : "").split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  ok("**fb.js 的清單跟 app.js 一致**", fbList.slice().sort().join() === NO_VIDEO_ROLES.slice().sort().join(),
     { fb: fbList, app: NO_VIDEO_ROLES }); }

// ══════════ ② 兩個新權限 ══════════
ok("有「選品」這一項", PERMS.curate && PERMS.curate.label === "選品");
ok("有「排影片」這一項", PERMS.plan && PERMS.plan.label === "排影片");
ok("兩項都寫了它在畫面上的哪裡", !!(PERMS.curate.where && PERMS.plan.where));
ok("兩項都是中文頁（海外剪輯不給）", PERMS.curate.zhOnly === true && PERMS.plan.zhOnly === true);
// v210 / A-2：選品有畫面了，分頁接上去。
// 「排影片」還是沒有自己的分頁 —— 它是選品頁裡的動作，不是一頁。
ok("「選品」有分頁", PERMS.curate.tab === "curate");
ok("「排影片」沒有自己的分頁（它是選品頁裡的動作）", PERMS.plan.tab === undefined);
{ reset([U("小設", "design", { perms: ["curate"] })], "小設", "design");
  ok("勾了「選品」，設計師就多一頁", myTabs().map(t => t[0]).join() === "chat,curate", myTabs().map(t => t[0]));
  ok("分頁名字是權限表上那個名字", (myTabs().find(t => t[0] === "curate") || [])[1] === "選品"); }
{ reset([U("小設", "design")], "小設", "design");
  ok("沒勾就是沒有（職位不給預設，跟 v207 同一條規矩）", !hasPerm("curate") && !hasPerm("plan"));
  reset([U("小設", "design", { perms: ["curate"] })], "小設", "design");
  ok("勾了就有", hasPerm("curate"));
  ok("勾了「選品」不會順便給「排影片」", !hasPerm("plan")); }
{ reset([U("Ali", "intl", { perms: ["curate", "plan"] })], "Ali", "intl");
  ok("海外剪輯就算資料裡有也看不到（中文頁）", !hasPerm("curate") && !hasPerm("plan")); }
// 設定→權限那張表要列得出這兩欄
{ reset([U("管理員", "boss"), U("小設", "design")], "管理員", "boss");
  SET_TAB = "perms"; const h = viewSettings(); SET_TAB = "basic";
  ok("權限表上有「選品」「排影片」兩欄", h.includes("選品") && h.includes("排影片"));
  ok("設計師那一列勾得到", /setMemberPerm\('小設','curate',this\.checked\)/.test(h)); }
// 成員表的職位下拉要選得到設計師，不然新人開不了帳號
{ reset([U("管理員", "boss")], "管理員", "boss");
  SET_TAB = "members"; const m = viewSettings(); SET_TAB = "basic";
  ok("成員頁的職位下拉選得到設計師", /<option value="design"/.test(m)); }

// ══════════ ③ 網址的規矩 ══════════
const BASE = "https://www.tzgrotw.tw";
ok("正規化：砍掉尾斜線", shopUrlNorm(BASE + "/products/abc/") === BASE + "/products/abc");
ok("正規化：砍掉追蹤參數與錨點",
   shopUrlNorm(BASE + "/products/abc?fbclid=xxx&utm_source=ig#top") === BASE + "/products/abc");
ok("正規化：網域轉小寫", shopUrlNorm("https://WWW.TZGROTW.TW/products/abc") === BASE + "/products/abc");
// ⚠️ 路徑不准轉小寫 —— Shopline 的網址帶中文，動了就對不回去
ok("**路徑大小寫不動**", shopUrlNorm(BASE + "/products/AbC") === BASE + "/products/AbC");
ok("中文網址原樣留著", shopUrlNorm(BASE + "/products/歐泊手鏈") === BASE + "/products/歐泊手鏈");
ok("不是網址就回空字串", shopUrlNorm("歐泊手鏈") === "" && shopUrlNorm("") === "");
// 實測：現有 166 支影片貼的網址只有 125 支是商品頁，其餘對不回單一商品
ok("只收商品頁", isShopProductUrl(BASE + "/products/歐泊手鏈") === true);
ok("**分類頁不收**（一個分類幾十個商品，營收算不回去）",
   isShopProductUrl(BASE + "/categories/異象水晶") === false);
ok("活動頁不收", isShopProductUrl(BASE + "/pages/new-page-3") === false);
ok("首頁不收", isShopProductUrl(BASE + "/") === false);
ok("帶參數的商品頁照收（正規化之後就乾淨了）",
   isShopProductUrl(BASE + "/products/歐泊手鏈?utm_source=ig") === true);

// ══════════ ④ 一次貼十條 ══════════
{ const text = [BASE + "/products/a", BASE + "/products/b", BASE + "/products/c"].join("\n");
  ok("一行一個，三條都拆得出來", parseUrlLines(text).length === 3, parseUrlLines(text)); }
{ // 從 Excel 或聊天室複製過來常常夾著逗號、引號、全形括號
  const messy = `  ${BASE}/products/a ,\n"${BASE}/products/b"\n（${BASE}/products/c）`;
  ok("夾著逗號引號括號也拆得出來", parseUrlLines(messy).length === 3, parseUrlLines(messy)); }
{ const dup = [BASE + "/products/a", BASE + "/products/a/", BASE + "/products/a?fbclid=1"].join("\n");
  ok("**同一個商品的三種寫法只算一條**", parseUrlLines(dup).length === 1, parseUrlLines(dup)); }
ok("貼空的不會炸", parseUrlLines("").length === 0 && parseUrlLines(null).length === 0);
ok("整段沒有網址就回空陣列", parseUrlLines("今天選這三個品，麻煩了").length === 0);
{ const mixed = [BASE + "/products/a", BASE + "/categories/x", BASE + "/products/b"].join("\n");
  const list = parseUrlLines(mixed);
  ok("拆的時候不篩，分類頁也拆得出來（要讓畫面列出來告訴他哪一條不行）", list.length === 3);
  ok("能分出哪幾條是商品頁", list.filter(isShopProductUrl).length === 2); }

// ══════════ ⑤ 一個商品永遠只有一列 ══════════
// 這是整條鏈的身分證：變兩列，這個品的營收就被拆成兩半，ROAS 從此算不準
{ const p = { id: "PD1", name: "歐泊手鏈", picks: [
    { month: "2026-09", by: "小設", at: "2026-09-01T10:00:00" },
    { month: "2026-12", by: "小設", at: "2026-12-01T10:00:00" }] };
  ok("同一個商品選了兩個月，還是一列", prodPicks(p).length === 2);
  ok("查得出九月有選", prodPickedIn(p, "2026-09") === true);
  ok("查得出十月沒選", prodPickedIn(p, "2026-10") === false);
  ok("月份由新到舊", prodPickMonths(p).join() === "2026-12,2026-09", prodPickMonths(p));
  ok("同一個月重複記也只算一個月",
     prodPickMonths({ picks: [{ month: "2026-09" }, { month: "2026-09" }] }).join() === "2026-09"); }
ok("沒有 picks 欄位不會炸", prodPicks(null).length === 0 && prodPicks({}).length === 0);
ok("壞資料（沒有月份）直接濾掉", prodPicks({ picks: [{ by: "小設" }, { month: "2026-09" }] }).length === 1);
ok("curMonth 跟 today 同一個基準", curMonth() === String(today).slice(0, 7));

// ══════════ ⑥ 價格是區間不是單一數字 ══════════
// 實測一頁 4 款：售價 990／3,000／3,500，原價 6,000／13,000／15,000
{ const p = { priceMin: 990, priceMax: 3500, listMin: 6000, listMax: 15000 };
  ok("售價印成區間", prodSaleText(p) === "NT$990～NT$3,500", prodSaleText(p));
  ok("原價印成區間", prodListText(p) === "NT$6,000～NT$15,000", prodListText(p)); }
{ const one = { priceMin: 990, priceMax: 990 };
  ok("只有一款就不要印成「990～990」", prodSaleText(one) === "NT$990", prodSaleText(one)); }
ok("沒有價格就不要印 0", prodSaleText({}) === "" && prodSaleText({ priceMin: 0 }) === "");

// ══════════ ⑦ v175 的殘骸清乾淨了 ══════════
ok("**fb.js 不再訂閱 matches**", !/collection\(db,\s*["']matches["']\)/.test(FB));
ok("fb.js 的原始資料也不留 matches 這個欄位", !/raw\.matches/.test(FB));
ok("安全規則不再開放 matches 寫入", !/match \/matches\/\{id\}\s*\{\s*allow/.test(RULES));
ok("備份清單拿掉 matches", !/^\s*"matches"/m.test(FSPY));
ok("程式裡沒有人再讀 STATE.matches", !/STATE\.matches/.test(APP));
// products 要留著：選品清單就是靠它，操作紀錄也靠它查名字
ok("（對照）products 留著", /match \/products\/\{id\}\s*\{\s*allow/.test(RULES) && /^\s*"products"/m.test(FSPY));
ok("（對照）fb.js 照樣訂閱 products", /collection\(db,\s*["']products["']\)/.test(FB));
ok("操作紀錄查得到商品名字", /seg\[1\]==="products"/.test(APP));

// ══════════ ⑦ A-2：選品頁 ══════════
const PD = (o) => Object.assign({ id:"PD1", name:"", officialUrl:BASE+"/products/a",
  picks:[{month:curMonth(), by:"小設", at:"2026-09-01T10:00:00"}],
  fetchStatus:"ok", priceMin:0, priceMax:0, listMin:0, listMax:0, variants:[] }, o||{});
function withProds(prods, who, role, perms){
  reset([U(who||"小設", role||"design", { perms: perms||["curate"] })], who||"小設", role||"design");
  LAST_RAW.products = prods; STATE = decorate(LAST_RAW);
}

// ── 權限 ──
{ reset([U("小明","design")], "小明", "design");
  ok("沒權限 → 看不到內容", /要有「選品」權限/.test(viewCurate())); }
{ withProds([]);
  ok("有權限 → 看得到貼網址的框", /id="cur_paste"/.test(viewCurate()));
  ok("還沒選品時講清楚", /還沒有選品/.test(viewCurate())); }
// 員工視角是唯讀 —— 全站規矩
{ withProds([]); VIEW_AS = "小設";
  ok("**員工視角預覽時不給貼網址**（全站唯讀的規矩）", !/id="cur_paste"/.test(viewCurate()));
  VIEW_AS = null; }

// ── 對帳單：四種情況 ──
{ const p = PD({ id:"PDa", officialUrl:BASE+"/products/舊品", name:"舊品" });
  withProds([p]);
  const r = curClassify([
    BASE+"/products/新品",            // 新的
    BASE+"/products/舊品",            // 這個月已經有了
    BASE+"/categories/異象水晶",      // 不是商品頁
    BASE+"/products/新品/",           // 跟第一條同一個（尾斜線）
  ].join("\n"));
  ok("新的 1 個（尾斜線那條算同一個，不會重複建）", r.add.length === 1, r.add);
  ok("這個月已經有的 1 個", r.dupMonth.length === 1);
  ok("不是商品頁的 1 個", r.bad.length === 1, r.bad); }
// ⚠️ 這一條最重要：以前選過的品，這次要「補掛到這個月」，不是新建一筆。
//    新建就變兩列，這個品的營收會被拆成兩半，ROAS 從此算不準。
{ const p = PD({ id:"PDb", officialUrl:BASE+"/products/老品", name:"老品",
                 picks:[{month:"2026-01", by:"小設", at:"2026-01-05T10:00:00"}] });
  withProds([p]);
  const r = curClassify(BASE+"/products/老品");
  ok("**以前選過的品：補掛，不是新建**", r.dupOther.length === 1 && r.add.length === 0, r);
  ok("而且指到原本那一列", r.dupOther[0].p.id === "PDb"); }

// ── 畫面：按月份分組、價格、狀態 ──
{ const a = PD({ id:"P1", name:"歐泊手鏈", priceMin:990, priceMax:3500, listMin:6000, listMax:15000,
                 variants:["白","黑","白項鍊","黑項鍊"], picks:[{month:"2026-09", by:"小設", at:""}] });
  const b = PD({ id:"P2", name:"八月的品", officialUrl:BASE+"/products/b",
                 picks:[{month:"2026-08", by:"小設", at:""}] });
  withProds([a,b]);
  const h = viewCurate();
  ok("兩個月各一組", /2026 年 9 月/.test(h) && /2026 年 8 月/.test(h));
  ok("新的月份排前面", h.indexOf("2026 年 9 月") < h.indexOf("2026 年 8 月"));
  ok("售價印成區間", /NT\$990～NT\$3,500/.test(h));
  // ⚠️ 刪除線在 CSS 的 .curlist 裡，不在 HTML 上 ——
  //    只檢查一邊的話，另一邊被拿掉時原價會變成看起來像現在的售價
  ok("原價也看得到", /NT\$6,000～NT\$15,000/.test(h));
  ok("**原價要劃掉**（class 有掛、CSS 規則也在）",
     /class="muted curlist"/.test(h) && /\.curlist\{[^}]*line-through/.test(HTML));
  ok("多款會標幾款", /4 款/.test(h)); }
// 同一個商品選兩個月 → 兩個月都看得到，但資料庫只有一列
{ const p = PD({ id:"P9", name:"跨月的品",
                 picks:[{month:"2026-09", by:"小設", at:""},{month:"2026-08", by:"小設", at:""}] });
  withProds([p]);
  const g = curByMonth();
  ok("**兩個月都列得出來**", g.length === 2 && g.every(x=>x.items.length===1), g.map(x=>x.ym));
  ok("**但資料庫只有一列**", prodList().length === 1);
  ok("畫面上會標「選過 2 個月」", /選過 2 個月/.test(viewCurate())); }

// ── 還沒抓資料的狀態 ──
{ withProds([PD({ id:"P3", fetchStatus:"pending", name:"" })]);
  const h = viewCurate();
  ok("有還沒抓的 → 出現同步卡", /1 個商品還沒抓資料/.test(h));
  ok("沒設定代抓網址時講清楚，而且按鍵是關的",
     /還沒設定抓商品資料的網址/.test(h) && /disabled/.test(h));
  ok("沒名稱時退回顯示網址，不是一列空白", /products\//.test(h)); }
{ withProds([PD({ id:"P4", fetchStatus:"pending" })]);
  LAST_RAW.settings.shopProxy = "https://x.workers.dev"; STATE = decorate(LAST_RAW);
  const h = viewCurate();
  ok("設定好之後同步鍵可以按", /onclick="curSync\(\)"/.test(h) && !/disabled[^>]*onclick="curSync/.test(h)); }
{ withProds([PD({ id:"P5", fetchStatus:"failed", fetchError:"這一頁找不到商品資料" })]);
  const h = viewCurate();
  ok("抓不到時說原因（不能只說失敗）", /這一頁找不到商品資料/.test(h));
  ok("而且標出「抓不到」", /抓不到/.test(h));
  ok("而且給得出手動填名稱的路", /自己填名稱/.test(h)); }
{ withProds([PD({ id:"P6", fetchStatus:"ok", name:"好了" })]);
  ok("已經抓好的不算待抓", curPending().length === 0);
  ok("不會出現同步卡", !/還沒抓資料/.test(viewCurate())); }

// ── 月份切換 ＋ 兩種模式（老闆：「需要用月來整理，然後還需要列表形式」）──
{ const a = PD({ id:"M1", name:"九月的品", picks:[{month:"2026-09", by:"小設", at:""}] });
  const b2 = PD({ id:"M2", name:"八月的品", officialUrl:BASE+"/products/b",
                  picks:[{month:"2026-08", by:"小設", at:""}] });
  withProds([a,b2]); CUR_YM = null; CUR_VIEW = "card";
  // ⚠️ 月份是「標籤切換」不是「一路往下捲」—— 一次只看一個月
  ok("預設看最新的那個月", curYM() === "2026-09", curYM());
  let h = viewCurate();
  ok("**一次只列一個月**（不是把所有月份攤成一排）",
     h.includes("九月的品") && !h.includes("八月的品"));
  ok("月份標籤兩個月都列得出來", /curSetYM\('2026-09'\)/.test(h) && /curSetYM\('2026-08'\)/.test(h));
  ok("每個標籤旁邊標幾個品（一眼看得出哪個月在做事）", /9 月<span>1<\/span>/.test(h), h.match(/月<span>\d+<\/span>/g));
  // ⚠️ 不准只寫 /class="curtab on"/ —— 卡片／列表那個切換鈕用的是同一個 class，
  //    月份標籤全部不亮了它照樣是綠的（這一條就是這樣漏掉過一次）。要綁到**那一個月**。
  ok("現在看的那個月要標出來", /curSetYM\('2026-09'\)" class="curtab on"/.test(h), h.match(/class="curtab[^"]*"/g));
  ok("別的月份不要跟著亮", /curSetYM\('2026-08'\)" class="curtab"/.test(h), h.match(/class="curtab[^"]*"/g));
  curSetYM("2026-08"); h = viewCurate();
  ok("切到八月就換八月的", h.includes("八月的品") && !h.includes("九月的品"));
  curSetYM("2026-09");
  // 切到一個沒有資料的月份不能整頁空掉，要退回有資料的
  CUR_YM = "2019-01";
  ok("月份不存在時退回最新的那個月", curYM() === "2026-09", curYM());
  CUR_YM = null; }
{ withProds([PD({ id:"V1", name:"歐泊", priceMin:990, priceMax:3500 })]);
  CUR_VIEW = "card";
  let h = viewCurate();
  ok("卡片模式：是格子牆", /class="curgrid"/.test(h));
  ok("卡片模式沒有列表的表頭", !/curhead/.test(h));
  ok("兩個模式都切得過去", /curSetView\('list'\)/.test(h) && /curSetView\('card'\)/.test(h));
  curSetView("list"); h = viewCurate();
  ok("列表模式：是一列一列的", /class="currow/.test(h) && !/class="curgrid"/.test(h));
  ok("列表有表頭（商品／售價／狀態）", /curhead/.test(h) && h.includes("售價 ／ 原價"));
  ok("**列表模式下貼網址收成一條**（處理一整批時不用一直看到那個大框）",
     /class="card curfold"/.test(h) && /<summary>/.test(h));
  ok("但展開之後還是同一個框", /id="cur_paste"/.test(h));
  ok("列表底下有結算", /共 1 個商品/.test(h));
  curSetView("card");
  ok("切回卡片就沒有折疊那一條", !/curfold/.test(viewCurate())); }
// 官網的圖會換網址、會被刪。掛掉的時候要自己藏起來，不然整面卡片牆都是破圖圖示。
{ withProds([PD({ id:"IM1", name:"有圖的品", image:"https://img.shoplineapp.com/x.jpg" })]);
  CUR_VIEW = "card"; const h = viewCurate();
  ok("圖掛掉要自己藏起來（不然畫面上一排破圖圖示）",
     /<img[^>]*onerror="this\.style\.display='none'"/.test(h), (h.match(/<img[^>]*>/g)||[]).slice(0,2)); }
// 版面：桌機是格子牆，手機一定要收欄 —— 老闆大部份在手機上看。
{ // 把包住某一條規則的 @media 整塊挖出來（大括號配對）；那條規則沒被包住就回空字串。
  const mediaAround = (rule) => {
    const i = HTML.indexOf(rule); if (i < 0) return "";
    const s = HTML.lastIndexOf("@media", i); if (s < 0) return "";
    let depth = 0;
    for (let j = HTML.indexOf("{", s); j < HTML.length; j++) {
      if (HTML[j] === "{") depth++;
      else if (HTML[j] === "}" && --depth === 0) return j > i ? HTML.slice(s, j + 1) : "";
    }
    return "";
  };
  ok("桌機：卡片牆是四欄的格子", /\.curgrid\{display:grid;grid-template-columns:repeat\(4,/.test(HTML));
  ok("**手機上卡片收成兩欄**（四欄在 390px 上每張只剩 80 出頭，圖跟字都看不清）",
     /max-width:\s*640px/.test(mediaAround(".curgrid{grid-template-columns:repeat(2,")));
  ok("**手機上列表不硬擠五欄**（會橫向溢出，整頁要左右拖）",
     /max-width:\s*640px/.test(mediaAround(".currow{grid-template-columns:44px minmax(0,1fr);")) &&
     /\.currow>:nth-child\(3\),\.currow>:nth-child\(4\),\.currow>:nth-child\(5\)\{grid-column:2\}/.test(HTML));
  ok("（前提）桌機的五欄排在手機那一條前面，不然手機會被蓋回去",
     HTML.indexOf(".currow{display:grid;grid-template-columns:44px minmax(0,1fr) 168px") <
     HTML.indexOf(".currow{grid-template-columns:44px minmax(0,1fr);")); }
// 四種狀態在兩個模式裡都要看得出來
{ withProds([PD({ id:"S1", name:"好了", priceMin:100, priceMax:100 }),
             PD({ id:"S2", fetchStatus:"pending", officialUrl:BASE+"/products/等" }),
             PD({ id:"S3", fetchStatus:"failed", fetchError:"找不到商品資料", officialUrl:BASE+"/products/壞" }),
             PD({ id:"S4", name:"跨月", priceMin:50, priceMax:50,
                  picks:[{month:"2026-09",by:"小設",at:""},{month:"2026-08",by:"小設",at:""}] })]);
  ["card","list"].forEach(v=>{
    curSetView(v); const h = viewCurate();
    ok(`${v}：已抓好標得出來`, /pill ok">已抓好|cur-b-ok|cur-r-ok/.test(h) || /已抓好/.test(h));
    ok(`${v}：還沒抓標得出來`, /還沒抓/.test(h));
    ok(`${v}：抓不到標得出來，而且講原因`, /抓不到/.test(h) && /找不到商品資料/.test(h));
    ok(`${v}：選過兩個月標得出來`, /選過 2 個月/.test(h));
    ok(`${v}：抓不到那一筆給「自己填名稱」`, /自己填名稱/.test(h));
  });
  curSetView("card"); }
// ── 這個品推過幾次（v211）──────────────────────────────────────────
// 老闆指著 meta 報告：「貼過幾次都找的出來，可是你的都沒有。」
// 資料是 Shopline 的「貼文銷售」，由 tools/postsale_sync.py 寫進 meta/settings.postsale。
//
// ⚠️ 這一段一定要**把畫面畫出來**驗。第一次我寫成 `"psLine(p)" in APP` ——
//    那也會match到函式定義本身，把呼叫整行刪掉照樣綠，突變測試裡它活了下來。
function withPS(ps, prods){
  withProds(prods || [PD({ id:"PS1", name:"幸運守護｜四葉草手鍊", priceMin:2800, priceMax:2800 })]);
  LAST_RAW.settings.postsale = ps; STATE = decorate(LAST_RAW);
}
const PSDATA = (o) => Object.assign({
  at: FROZEN + "T09:00:00", dataAt: FROZEN.slice(0,8) + "10", rows: 1234, posts: 9,
  items: [{ k: psKey("幸運守護-四葉草手鍊"), p: "幸運守護-四葉草手鍊", n: 9,
            first: "2025-10-31", last: "2026-07-28", c: 917, a: 12, s: 0 }],
}, o || {});
{ withPS(PSDATA()); CUR_VIEW = "card";
  const h = viewCurate();
  // 選品清單上是「幸運守護｜四葉草手鍊」，Shopline 那邊是「幸運守護-四葉草手鍊」
  ok("**分隔符號寫法不同也對得上**（官網 ｜ ／ Shopline -）", /推過 9 次/.test(h), h.slice(0,0));
  ok("最近一次看得到", /2026-07-28/.test(h));
  ok("留言數看得到", /917/.test(h));
  curSetView("list");
  ok("列表模式也標得出來", /推過 9 次/.test(curRowHTML(prodList()[0])));
  curSetView("card"); }
// ⚠️ 查不到就**什麼都不顯示**，不准寫「推過 0 次」——
//    那是在講一件我們其實不知道的事（很可能只是名字對不上）。
{ withPS(PSDATA({ items: [{ k: psKey("完全不相干的商品"), p: "完全不相干的商品", n: 5,
                            first:"", last:"2026-01-01", c: 1, a: 0, s: 0 }] }));
  const h = viewCurate();
  // ⚠️ 比對「推過 N 次」這個形狀，不要只比「推過」兩個字 ——
  //    底下那行說明裡本來就有「『推過幾次』來自 Shopline…」，比兩個字會誤判。
  ok("**對不上就整句不顯示**（不准寫成「推過 0 次」）",
     !/推過 \d+ 次/.test(h), (h.match(/推過[^<]*/g)||[])); }
// 資料有多新一定要看得到 —— 那份 CSV 是人手動匯出的，會默默變舊
{ withPS(PSDATA());
  ok("畫面上看得到資料到哪一天", /資料到 <b>|<b>資料到/.test(viewCurate()) || /資料到/.test(viewCurate()));
  const 舊 = PSDATA({ dataAt: "2020-01-01" });
  ok("**資料舊了要標紅**（默默變舊比沒有資料更糟）", /#C0392B/.test((withPS(舊), viewCurate())));
  ok("而且講得出來要重新匯出", /重新從 Shopline 匯出/.test(viewCurate()));
  withPS(PSDATA());
  ok("（對照）資料新的時候不要亂喊", !/#C0392B/.test(viewCurate())); }
{ withPS(null);
  ok("還沒接上這份資料時明講，不要裝沒事", /還沒接上/.test(viewCurate())); }
// psOf 為了快才建索引。⚠️ 快取的鍵不准用時間戳 —— 內容換掉、時間戳一樣的時候
// （重新整理狀態）索引不會重建，查出來是**上一份的答案**，而畫面上看起來完全正常。
{ const at = FROZEN + "T09:00:00";
  withPS(PSDATA({ at, items:[{ k: psKey("甲商品"), p:"甲商品", n:3, first:"", last:"2026-01-01", c:1, a:0, s:0 }] }));
  const 先 = psOf("甲商品");
  withPS(PSDATA({ at, items:[{ k: psKey("乙商品"), p:"乙商品", n:7, first:"", last:"2026-02-02", c:2, a:0, s:0 }] }));
  ok("（前提）第一份查得到甲", !!(先 && 先.n === 3), 先);
  ok("**換了資料就要查到新的那一份**（時間戳一樣也一樣）",
     psOf("甲商品") === null && !!(psOf("乙商品") && psOf("乙商品").n === 7),
     { 甲: psOf("甲商品"), 乙: psOf("乙商品") }); }

// 沒有那個月的資料時，不要只留一片空白
{ withProds([]); CUR_YM = null;
  ok("完全沒有選品時講清楚", /還沒有選品/.test(viewCurate())); }

// ── 寫入路由 ──
(async () => {
  let W = [];
  function withDB(prods){
    withProds(prods||[]);
    W = [];
    global.window.DB = { set: async (c,id,o)=>{W.push(["set",c,id,o]);},
      update: async (c,id,p)=>{W.push(["update",c,id,p]);},
      del: async (c,id)=>{W.push(["del",c,id]);},
      scheduleSet: async()=>{}, setSettings: async()=>{},
      videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  }
  withDB();
  await route("POST","/api/products",{officialUrl:BASE+"/products/新品"});
  const w = W.find(x=>x[0]==="set" && x[1]==="products");
  ok("建檔會寫 products", !!w, W);
  ok("**一開始就是待抓取**（等按同步）", w && w[3].fetchStatus === "pending", w && w[3].fetchStatus);
  ok("**picks 是陣列，掛在這個月**",
     w && Array.isArray(w[3].picks) && w[3].picks.length===1 && w[3].picks[0].month===curMonth(), w && w[3].picks);
  ok("網址存的是正規化過的", w && w[3].officialUrl === BASE+"/products/新品");
  // ⚠️ 分類頁擋在寫入這一層，不是只擋在畫面上 —— 畫面擋得住手滑，擋不住直接呼叫
  let threw = false;
  try { await route("POST","/api/products",{officialUrl:BASE+"/categories/x"}); } catch(e){ threw = true; }
  ok("**分類頁在寫入那一層就被擋掉**", threw);
  withDB();
  await route("PUT","/api/products/PD1",{name:"改過的", priceMin:990, variants:["A","B"], 亂七八糟:"x"});
  const u = W.find(x=>x[0]==="update");
  ok("改得動名稱與價格", u && u[3].name==="改過的" && u[3].priceMin===990, u && u[3]);
  ok("**白名單外的欄位會被丟掉**", u && u["3"]!==undefined && !("亂七八糟" in u[3]), u && Object.keys(u[3]));
  withDB();
  await route("DELETE","/api/products/PD1",{});
  ok("刪得掉", W.some(x=>x[0]==="del" && x[1]==="products" && x[2]==="PD1"), W);

  // ── 同步：沒設定代抓網址就不要動 ──
  // ⚠️ 光看畫面上按鍵有沒有變灰是不夠的（突變測試抓到的）——
  //    按鍵灰掉擋得住手滑，擋不住直接呼叫，而 curSync 一旦跑起來
  //    就會對每一筆送出 fetch("?url=…")，靜靜失敗，然後把每一筆標成 failed。
  { withDB([PD({ id:"PX", fetchStatus:"pending" })]);
    LAST_RAW.settings.shopProxy = ""; STATE = decorate(LAST_RAW);
    let fetched = 0;
    global.fetch = async () => { fetched++; return { ok:true, json: async()=>({ok:true}) }; };
    let said = "";
    const oldToast = toast; toast = (m)=>{ said = String(m||""); };
    await curSync();
    toast = oldToast;
    ok("**沒設定代抓網址時，按下去不會真的去抓**", fetched === 0, fetched);
    ok("而且會講清楚為什麼", /還沒設定/.test(said), said);
    ok("也不會把商品標成失敗", !W.some(x=>x[0]==="update"), W); }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
