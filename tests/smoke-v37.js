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
global.confirm = ()=>true; global.prompt = ()=>null;
eval(src);

const T0 = new Date(Date.now()+288e5).toISOString().slice(0,10);
const raw = {
  users:[ {name:"小葵",role:"editor",craft:"both"}, {name:"Anna",role:"intl",craft:"both"}, {name:"Regina",role:"manager"} ],
  settings:{ dailyTarget:4, videoTags:["舊片"], sources:["老闆自拍"], postPlatforms:[{name:"IG",utm:"ig"}],
    intlAccounts:[{locale:"en",name:"tiktok-EN"},{locale:"th",name:"tiktok-TH"}], intlDailyTarget:2,
    shopeeAccounts:["蝦皮店A"], shopeeDailyTarget:2, msAccounts:["tiktok-Malaysia"], msDailyTarget:2,
    exchangeRates:{en:{code:"USD",rate:0.0313,mult:1},th:{code:"THB",rate:1.038,mult:1},ms:{code:"MYR",rate:0.1275,mult:1},shopee:{code:"TWD",rate:1,mult:1.2}} },
  schedule:{}, tasks:{ T1:{id:"T1",user:"Anna",date:T0,title:"翻譯文案",assignedBy:"Vito",ack:false,report:"",done:false,createdAt:"a"} }, shifts:{}, logs:[],
  videos:[
    {id:"S1",name:"黃金原本",rawName:"黃金原本",nameEn:"Gold original",stage:"已上片",locale:"",channel:"",origLang:"",scheduledDate:"2026-01-01",editor:"小葵",published:true,products:[],usageHistory:[],tags:[],metrics:[]},
    {id:"R1",name:"台灣毛片",rawName:"台灣毛片",stage:"待處理",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"V101",name:"EN cut",stage:"剪輯中",locale:"en",channel:"",sourceVideoId:"S1",account:"tiktok-EN",claimedBy:"Anna",editor:"Anna",claimedAt:T0+"T09:00:00",scheduledDate:T0,usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"V201",name:"蝦皮版",stage:"剪輯中",locale:"",channel:"shopee",sourceVideoId:"S1",account:"蝦皮店A",claimedBy:"小葵",editor:"小葵",claimedAt:T0+"T09:10:00",usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};
decorate(raw);

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }
function tryRender(label){ try{ render(); ok(label, viewEl.innerHTML.length>50); }catch(e){ fail++; console.log("FAIL:",label,"THREW:",e.message); } }

// --- 分頁：二創區併入上班計畫 ---
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
let tabs=myTabs().map(t=>t[0]);
ok("editor tabs = work/team/videos/cal", JSON.stringify(tabs)===JSON.stringify(["work","team","videos","cal"]));
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
tabs=myTabs().map(t=>t[0]);
ok("intl tabs identical ids", JSON.stringify(tabs)===JSON.stringify(["work","team","videos","cal"]));
ok("intl tab labels English", JSON.stringify(myTabs().map(t=>t[1]))===JSON.stringify(["Work Plan","Team Board","Library","Schedule"]));

// --- 全角色渲染 ---
for(const [name,role] of [["管理員","boss"],["Regina","manager"],["小葵","editor"],["Anna","intl"]]){
  localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role);
  VIEW_AS=null; CAL_YM=null; INTL_CAL_YM=null; CH_CAL={shopee:{ym:null,acct:""},ms:{ym:null,acct:""}}; CAL_PLAT="tw"; VID_LANG=""; WORK_ZONE="shopee";
  for(const [tab] of myTabs()){ CUR_TAB=tab; tryRender(`[${role}] ${tab}`); }
}

// --- 上班計畫的建立二創版本卡（三個 zone 切換） ---
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
WORK_ZONE="shopee"; let h=viewWork();
ok("editor work has 建立二創版本 card (shopee list)", h.includes("建立二創版本") && h.includes("蝦皮店A"));
WORK_ZONE="ms"; h=viewWork();
ok("zone switch → 馬來 list", h.includes("tiktok-Malaysia"));
WORK_ZONE="en"; h=viewWork();
ok("zone switch → 英文 list (EN 帳號)", h.includes("tiktok-EN") && !h.includes("tiktok-TH"));
WORK_ZONE="th"; h=viewWork();
ok("zone switch → 泰文 list (TH 帳號)", h.includes("tiktok-TH") && !h.includes("tiktok-EN"));

// --- intl 全英文 spot checks ---
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
WORK_ZONE="shopee"; h=viewWork();
ok("intl work: English headings, no Chinese UI labels", h.includes("Today's Work") && h.includes("To claim (raw + versions)") && h.includes("Create a version") && !h.includes("上班計畫") && !h.includes("認領開始剪") && !h.includes("建立二創版本"));
ok("intl work: task card English + translate icon", h.includes("Got it") && h.includes("文<span>A</span>"));
h=viewVideos();
ok("intl library English (chrome)", h.includes("Library") && h.includes("Original language") && h.includes("Chinese (") && !h.includes("影片庫") && !h.includes("原本語言"));
CAL_PLAT="tw"; CAL_YM=null; h=viewCal();
ok("intl schedule English (hub + tw body)", h.includes("Schedule") && h.includes("Platform") && h.includes("Full") && h.includes("Sun") && !h.includes("月排程") && !h.includes("已排滿"));
CAL_PLAT="shopee"; h=viewCal();
ok("intl shopee calendar English", h.includes("Account") && !h.includes("帳號"));
openChModal("shopee","V201");
ok("intl shopee modal English", modalHTML.includes("Shopee version") && modalHTML.includes("Your Shopee version") && !modalHTML.includes("你的蝦皮版本"));

// --- editor 仍是中文 ---
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
h=viewWork();
ok("editor work stays Chinese", h.includes("本日工作") && h.includes("認領開始剪"));
h=viewVideos();
ok("editor library stays Chinese", h.includes("影片庫") && h.includes("原本語言"));

// --- 月排程五平台下拉＋英/泰拆分 ---
localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
CUR_TAB="cal"; CAL_PLAT="tw"; CAL_YM=null; render();
ok("hub has 5 options 中文/泰文/蝦皮/英文/馬來西亞", ["中文","泰文","蝦皮","英文","馬來西亞"].every(x=>viewEl.innerHTML.includes(x)));
CAL_PLAT="th"; render();
ok("th platform → TH account only", viewEl.innerHTML.includes("tiktok-TH") && !viewEl.innerHTML.includes("tiktok-EN"));
CAL_PLAT="en"; render();
ok("en platform → EN account only", viewEl.innerHTML.includes("tiktok-EN") && !viewEl.innerHTML.includes("tiktok-TH"));

// --- 編輯視窗：剪輯＝退回、管理員＝刪除 ---
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
openVideoModal("V201", true);   // 剪輯中 → 退回
ok("editor edit modal: 退回＋刪除並存（全員可刪，進回收桶）", modalHTML.includes("退回（放回待剪清單）") && modalHTML.includes("刪除這支影片"));
openVideoModal("R1", true);   // 待處理 → 沒有退回也沒有刪除
ok("editor edit modal (pool item): 有刪除卡（管理員可救回）", modalHTML.includes("刪除這支影片") && modalHTML.includes("管理員可救回"));
localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
openVideoModal("R1", true);
ok("boss edit modal keeps 刪除這支影片", modalHTML.includes("刪除這支影片"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
