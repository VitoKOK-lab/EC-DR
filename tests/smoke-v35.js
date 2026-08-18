const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
src = src.replace(/^let /gm, "");
const el = () => ({ value:"", innerHTML:"", textContent:"", className:"", style:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){}, appendChild(){}, querySelector(){return null;}, querySelectorAll(){return [];},
  getAttribute(){return null;}, setAttribute(){}, closest(){return null;}, getBoundingClientRect(){return {top:0,left:0,bottom:0,right:0};} });
const store={};
global.localStorage = { getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };
let modalHTML="", viewEl=el();
global.document = { getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){ Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}}); } return e; },
  addEventListener(){}, createElement:()=>el(), body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null, querySelectorAll:()=>[] };
global.window = { addEventListener(){}, innerWidth:1200, innerHeight:800, scrollY:0, scrollTo(){}, DB:null, location:{reload(){}} };
global.requestAnimationFrame=(f)=>f();
global.navigator = { onLine:true };
global.confirm = ()=>true;
global.prompt = ()=>null;
eval(src);

const T0 = new Date(Date.now()+288e5).toISOString().slice(0,10);
const raw = {
  users:[ {name:"小葵",role:"editor",pwHash:"pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==",craft:"both"}, {name:"Anna",role:"intl",pwHash:"pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==",craft:"both"}, {name:"Regina",role:"manager",pwHash:"pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA=="} ],
  settings:{ dailyTarget:4, videoTags:["舊片"], sources:["老闆自拍"], postPlatforms:[{name:"IG",utm:"ig"}],
    intlAccounts:[{locale:"en",name:"tiktok-EN"},{locale:"th",name:"tiktok-TH"}], intlDailyTarget:2,
    shopeeAccounts:["蝦皮店A"], shopeeDailyTarget:2, msAccounts:["tiktok-Malaysia"], msDailyTarget:2,
    exchangeRates:{en:{code:"USD",rate:0.0313,mult:1},th:{code:"THB",rate:1.038,mult:1},ms:{code:"MYR",rate:0.1275,mult:1},shopee:{code:"TWD",rate:1,mult:1.2}} },
  schedule:{}, tasks:{}, shifts:{}, logs:[],
  videos:[
    {id:"S1",code:"331",name:"黃金一週跌12%",rawName:"黃金一週跌12%",nameEn:"Gold dropped 12%",stage:"已上片",locale:"",channel:"",sourceVideoId:"",
     scheduledDate:"2026-01-01",editor:"小葵",published:true,products:[{name:"金鐲",price:10000}],usageHistory:[],tags:[],metrics:[]},
    {id:"R1",name:"台灣毛片",rawName:"台灣毛片",stage:"待處理",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"V101",name:"EN cut",stage:"待處理",locale:"en",channel:"",sourceVideoId:"S1",account:"tiktok-EN",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"V102",name:"TH cut",stage:"剪輯中",locale:"th",channel:"",sourceVideoId:"S1",account:"tiktok-TH",claimedBy:"小葵",editor:"小葵",claimedAt:T0+"T09:00:00",scheduledDate:T0,usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"V201",name:"蝦皮做一半",stage:"剪輯中",locale:"",channel:"shopee",sourceVideoId:"S1",account:"蝦皮店A",claimedBy:"小葵",editor:"小葵",claimedAt:T0+"T09:10:00",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"V301",name:"",rawName:"黃金一週跌12%",stage:"待處理",locale:"",channel:"ms",sourceVideoId:"S1",account:"tiktok-Malaysia",assignedTo:"小葵",usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};
decorate(raw);

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }
function tryRender(label){ try{ render(); ok(label, viewEl.innerHTML.length>50); }catch(e){ fail++; console.log("FAIL:",label,"THREW:",e.message); } }

// --- 分頁結構 ---
localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
let tabs=myTabs().map(t=>t[0]);
ok("boss: single cal tab, no intlcal/shopeecal/mscal", tabs.includes("cal") && !tabs.includes("intlcal") && !tabs.includes("shopeecal") && !tabs.includes("mscal"));
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
tabs=myTabs().map(t=>t[0]);
ok("editor: cal hub, zones integrated into work (v37)", JSON.stringify(tabs)===JSON.stringify(["work","team","videos","videosDF","cal"]));
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
tabs=myTabs().map(t=>t[0]);
ok("intl: same tab ids as editor (v37)", JSON.stringify(tabs)===JSON.stringify(["work","team","videos","cal"]));

// --- 全角色全分頁渲染 ---
for(const [name,role] of [["管理員","boss"],["Regina","manager"],["小葵","editor"],["Anna","intl"]]){
  localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role);
  VIEW_AS=null; CAL_YM=null; INTL_CAL_YM=null; CH_CAL={shopee:{ym:null,acct:""},ms:{ym:null,acct:""}}; CAL_PLAT="tw";
  for(const [tab] of myTabs()){ CUR_TAB=tab; tryRender(`[${role}] ${tab}`); }
}

// --- 月排程 hub 四平台切換 ---
localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
CUR_TAB="cal";
CAL_PLAT="tw"; CAL_YM=null; render();
ok("hub tw: 台灣月曆＋圖例", viewEl.innerHTML.includes("<h2>月排程</h2>") && viewEl.innerHTML.includes("已排滿") && viewEl.innerHTML.includes("中文"));
CAL_PLAT="en"; INTL_CAL_YM=null; render();
ok("hub en: 英文月曆（帳號選單）", viewEl.innerHTML.includes("tiktok-EN") && viewEl.innerHTML.includes("支／帳號／天"));
CAL_PLAT="shopee"; render();
ok("hub shopee: 蝦皮月曆", viewEl.innerHTML.includes("蝦皮店A") && viewEl.innerHTML.includes("每帳號每天"));
CAL_PLAT="ms"; render();
ok("hub ms: 馬來月曆", viewEl.innerHTML.includes("tiktok-Malaysia"));
ok("hub selector five options", ["中文","泰文","蝦皮","英文","馬來西亞"].every(x=>viewEl.innerHTML.includes(x)));

// --- intl 角色 Schedule 分頁維持英文 ---
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
CUR_TAB="cal"; CAL_PLAT="en"; CAL_YM=null; INTL_CAL_YM=null; INTL_ACCT=""; render();
ok("intl Schedule stays English standalone", viewEl.innerHTML.includes("Schedule") && !viewEl.innerHTML.includes("月排程"));

// --- 上班計畫：台灣剪輯只看得到台灣的線（v115 分區）---
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
let h=viewWork();
ok("待認領不再出現英文版（台灣看不到海外）", !h.includes(`claimVid('V101')`));
ok("待認領也不出現在快選分類裡", !h.includes(`setPoolFilter('en')`));
ok("myWork shows TH in-progress with TH badge", h.includes(">TH</span>") && h.includes("TH cut"));
ok("myWork TH item uses intlFinish/intlUnclaim", h.includes(`intlFinish('V102')`) && h.includes(`intlUnclaim('V102')`));
ok("myWork still shows 蝦 badge + ms todo 馬 badge", h.includes(">蝦</span>") && h.includes(">馬</span>"));
ok("focusbar 製作中 = 2（合併計數、無上限）", h.includes('<span class="fn">2</span>'));

// --- 全域 3 支上限：TH+蝦皮=2 → 第 3 支可領、第 4 支被擋 ---
let calls=[];
global.window.DB={ set:async(c,id,o)=>{calls.push([c,id,o]);}, update:async(c,id,p)=>{calls.push([c,id,p]);}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
(async()=>{
  let threw=false;
  try{ await route("POST","/api/videos/R1/claim",{}); }catch(e){ threw=true; }
  ok("3rd claim allowed (2 in progress)", !threw);
  STATE.videos.find(v=>v.id==="R1").stage="剪輯中"; STATE.videos.find(v=>v.id==="R1").claimedBy="小葵"; STATE.videos.find(v=>v.id==="R1").editor="小葵";
  threw=false;
  try{ await route("POST","/api/videos/V101/claim",{}); }catch(e){ threw=true; }
  ok("4th claim now ALLOWED (cap removed 2026-07)", !threw);

  // --- 海外只建得了英文／泰文版（v115 分區）---
  localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
  WORK_ZONE="en"; const z=createZoneCard();
  ok("海外的建立版本只有英文／泰文", z.includes(">English (TikTok)<") && z.includes(">Thai (TikTok)<"));
  ok("海外看不到蝦皮／馬來西亞", !z.includes(">Shopee<") && !z.includes(">Malaysia<"));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
