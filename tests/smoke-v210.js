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
// ⚠️ A-1 還沒有畫面。有 tab 就會長出一個點進去空白的分頁。
ok("**A-1 還不給分頁**（畫面在 A-2，先長分頁等於給一頁空白）",
   PERMS.curate.tab === undefined && PERMS.plan.tab === undefined);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
