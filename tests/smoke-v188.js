// v188：設定頁分成五個子頁
//
// 老闆：「管理員的設定太多了，要分類分頁面」
//
// 正式資料實測（改之前）：整頁 83,951 字元、14 個區塊、**221 個輸入欄位**擠在
// 同一頁。光成員名單 27 個人就佔掉一半以上（每人四顆鍵）。要改「每天上片目標」
// 得先滑過蝦皮、馬來、Boss Sunny、27 個人。
//
// 分法是照「什麼時候會用到」，不是照「功能像不像」：
//   基本  每天都可能動的（上片目標、上下班時間、密碼）
//   成員  人事異動才動（最長的一區，自己一頁）
//   平台  接新平台／改匯率才動
//   分類  標籤這種偶爾補一個的
//   維護  出事才用的（操作紀錄、回收桶、一次性轉檔）
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,open:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1400,innerHeight:900,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
function reset(){
  VIEW_AS=null; BRAND=""; FOLD_OPEN={}; SET_TAB="basic";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const users=[];
  for(let i=0;i<27;i++) users.push({name:"員工"+i, role:i<8?"editor":(i<12?"cs":"mkt"), pwAt:"2026-07-01T09:00:00"});
  users.push({name:"Regina",role:"manager"},{name:"HR小姐",role:"hr"});
  const raw={ users,
    settings:{dailyTarget:4,videoTags:["寵粉","銷售"],sources:["官方IP"],
      postPlatforms:[{name:"IG",utm:"ig"}],intlAccounts:[{locale:"en",name:"tiktok-EN"}],
      shopeeAccounts:["蝦皮店A"],msAccounts:[],exchangeRates:{},contacts:["溱姐"],
      reviewSince:"2020-01-01",shoplineBase:"https://x.tw/"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
}
const on=(k)=>{ SET_TAB=k; return viewSettings(); };
const all=()=>["basic","members","plat","tags","maint"].map(on).join("");

// ══════════ ① 五個子頁都在，而且點得到 ══════════
{ reset();
  const h=on("basic");
  ["基本","成員","平台","分類","維護"].forEach(t=>
    ok("有「"+t+"」這一頁", h.includes(">"+t+"<")||h.includes(">"+t+"（"), h.slice(0,300)));
  ["basic","members","plat","tags","maint"].forEach(k=>
    ok("「"+k+"」點得過去", h.includes("setSetTab('"+k+"')")));
  ok("**成員那一頁標題上寫了幾個人**", /成員（29）/.test(h), (h.match(/成員（\d+）/)||[])[0]);
  ok("預設停在「基本」", /vtab on[^>]*onclick="setSetTab\('basic'\)/.test(h)
     || /setSetTab\('basic'\)[^>]*>[\s\S]{0,40}基本/.test(h.split("vtab on")[1]||""), h.slice(0,300)); }

// ══════════ ② 每一樣東西都還在（分頁不是把功能弄丟）══════════
{ reset(); const a=all();
  const MUST=[["每天上片目標","set_daily"],["預排天數視窗","set_horizon"],
              ["Shopline 網址","set_shop"],["管理員密碼","set_pw"],["投放平台","set_plat"],
              ["上下班時間","set_wstart"],["成員名單","addMember"],["影片標籤","tag_new"],
              ["操作紀錄","CUR_TAB='log'"],["回收桶","CUR_TAB='trash'"],
              ["現有簡體轉繁體","convertExistingToTW"],["每日寵粉→寵粉","migratePamperTag"],
              ["海外設定","set_intl"],["對接窗口","addContact"]];
  const miss=MUST.filter(([zh,key])=>!a.includes(key)).map(x=>x[0]);
  ok("**原本有的東西一樣都沒少**", !miss.length, miss); }

// ══════════ ③ 分到對的地方 ══════════
{ reset();
  const basic=on("basic"), members=on("members"), plat=on("plat"), tags=on("tags"), maint=on("maint");
  ok("每天上片目標在「基本」", basic.includes("set_daily") && !members.includes("set_daily"));
  ok("上下班時間在「基本」（每天都可能動）", basic.includes("set_wstart"));
  ok("**成員名單自己一頁**", members.includes("成員名單") && !basic.includes("成員名單"));
  ok("蝦皮／馬來／Boss Sunny 都在「平台」",
     plat.includes("蝦皮") && plat.includes("馬來") && plat.includes("Boss Sunny"));
  ok("匯率換算也在「平台」", plat.includes("商品價格換算"));
  ok("投放平台在「平台」不在「基本」", plat.includes("set_plat") && !basic.includes("set_plat"));
  ok("影片標籤在「分類」", tags.includes("tag_new") && !basic.includes("tag_new"));
  ok("操作紀錄與回收桶在「維護」",
     maint.includes("CUR_TAB='log'") && maint.includes("CUR_TAB='trash'") && !basic.includes("CUR_TAB='log'"));
  ok("一次性轉檔在「維護」", maint.includes("convertExistingToTW") && !basic.includes("convertExistingToTW"));
  ok("**對接窗口收到「維護」**（v183 之後沒有任何地方在用它了）",
     maint.includes("addContact") && !basic.includes("addContact")); }

// ══════════ ④ 第一眼看到的東西要少很多 ══════════
{ reset();
  const basic=on("basic"), a=all();
  const nBasic=(basic.match(/<input|<textarea|<select/g)||[]).length;
  const nAll=(a.match(/<input|<textarea|<select/g)||[]).length;
  ok("（前提）全部加起來還是很多欄位", nAll>150, nAll);
  ok("**進來第一眼的欄位數砍掉七成以上**", nBasic < nAll*0.3, {第一眼:nBasic, 全部:nAll});
  ok("**成員那一頁最長（所以才要自己一頁）**",
     on("members").length > basic.length, {成員:on("members").length, 基本:basic.length}); }

// ══════════ ⑤ 亂填的子頁不會變成空白畫面 ══════════
{ reset(); SET_TAB="不存在的頁";
  const h=viewSettings();
  ok("**亂填會退回「基本」，不是空白頁**", h.includes("set_daily") && h.includes("<h2>設定</h2>"),
     h.slice(0,200));
  // ⚠️ 光看內容抓不到 —— 三元運算的最後一段本來就會落到 basic。
  //    那道防護真正在做的是「把 SET_TAB 導回合法值」，不然**分頁列上一頁都不會亮**，
  //    使用者看到五個灰灰的頁籤，不知道自己在哪一頁。
  ok("**而且分頁列上有一頁是亮的**", (h.match(/vtab on/g)||[]).length===1,
     (h.match(/vtab on/g)||[]).length);
  ok("SET_TAB 被導回合法值", SET_TAB==="basic", SET_TAB); }

// ══════════ ⑥ 每一頁都畫得出來 ══════════
{ let bad=null;
  ["basic","members","plat","tags","maint"].forEach(k=>{
    reset(); SET_TAB=k;
    try{ const h=viewSettings(); if(h.length<80) bad=k+"：畫出來幾乎是空的"; }
    catch(e){ bad=k+"："+e.message; } });
  ok("五頁都畫得出來而且不是空的", !bad, bad); }
// 切換是真的會重畫的
{ reset();
  let rendered=false; const _r=render; render=()=>{ rendered=true; };
  setSetTab("members");
  render=_r;
  ok("**點了子頁會重畫**", rendered===true && SET_TAB==="members", {重畫:rendered, 現在:SET_TAB}); }

console.log(`\nv188（設定分成五個子頁）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
