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
STATE = {
  users:[ {name:"Kai",role:"editor"}, {name:"Anna",role:"intl"} ],
  settings:{ dailyTarget:4, videoTags:["oldtag"], sources:["srcA"], postPlatforms:[{name:"IG",utm:"ig"}],
    intlAccounts:[{locale:"th",name:"acctTH"},{locale:"en",name:"acctEN"}],
    shopeeAccounts:["acctSHP"], msAccounts:["acctMS"],
    exchangeRates:{en:{code:"USD",rate:0.031,mult:1},th:{code:"THB",rate:1.1,mult:1},ms:{code:"MYR",rate:0.14,mult:1},shopee:{code:"TWD",rate:1,mult:1.2}} },
  schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
  videos:[
    {id:"S2",name:"SRC pub",rawName:"SRC pub",nameEn:"SRC pub EN",videoCopy:"copyZH",videoCopyEn:"copyEN",stage:"已上片",published:true,tags:["舊片"],publishedLink:"http://x",driveFolder:"http://d",rawLink:"http://r",finishedAt:"2020-01-01T00:00:00Z",locale:"",channel:"",products:[{name:"prodA",price:"100",salePrice:"80"}],usageHistory:[],metrics:[]},
    {id:"E1",name:"EN shell",rawName:"SRC pub",stage:"待處理",locale:"en",sourceVideoId:"S2",account:"acctEN",createdBy:"Anna",scheduledDate:T0,usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"T1",name:"TH shell",rawName:"SRC pub",stage:"剪輯中",locale:"th",sourceVideoId:"S2",account:"acctTH",claimedBy:"Anna",editor:"Anna",claimedAt:T0+"T01:00:00Z",scheduledDate:T0,usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"P1",name:"SHP shell",rawName:"SRC pub",stage:"待處理",channel:"shopee",sourceVideoId:"S2",account:"acctSHP",scheduledDate:T0,usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ── 中文剪輯打開英/泰工作 → 中文介面 ──
localStorage.setItem("ecdr_user","Kai"); localStorage.setItem("ecdr_role","editor");
openIntlModal("E1");
ok("editor 開英文版視窗＝中文介面", modalHTML.includes("儲存") && modalHTML.includes("取消") && modalHTML.includes("英文版本") && !modalHTML.includes(">Save<") && !modalHTML.includes("Watch Chinese"));
ok("editor 英文版視窗教學是中文", modalHTML.includes("先看我們的中文成片"));
INTL_ACCT="acctEN"; INTL_CAL_YM=null;
openDayIntl(T0);
ok("editor 開海外日視窗＝中文", modalHTML.includes("移出排程") && !modalHTML.includes(">Unschedule<"));
WORK_ZONE="en"; let h=viewWork();
ok("editor 英文區清單中文字串", h.includes("加版本 — 選帳號") && !h.includes("Add version — pick account"));
h=viewWork(); // dayBadge/shpBadge
ok("editor 蝦/馬徽章維持中文字", h.includes(">蝦</span>"));
openVideoModal("S2", false);
ok("editor 各語言版本卡中文", modalHTML.includes("各語言版本") && modalHTML.includes("上傳連結"));

// ── 海外剪輯 → 全英文 ──
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
openIntlModal("E1");
ok("intl 英文版視窗英文", modalHTML.includes(">Save<") && modalHTML.includes("Watch Chinese") && !modalHTML.includes("儲存"));
openChModal("shopee","P1");
ok("intl 蝦皮視窗價格標籤英文", modalHTML.includes("Fan price") && !modalHTML.includes("寵粉價"));
openVideoModal("S2", false);
ok("intl 各語言版本卡英文", modalHTML.includes("Language versions") && !modalHTML.includes("各語言版本") && !modalHTML.includes("誰剪的"));
ok("intl 原本語言列英文", modalHTML.includes("Original language") && modalHTML.includes(">ZH<") && !modalHTML.includes("中文"));
WORK_ZONE="shopee"; h=viewWork();
ok("intl 蝦/馬徽章用 SP/MY", h.includes(">SP</span>") && !h.includes(">蝦</span>"));
ok("intl 天數徽章 New", h.includes(">New</span>") || !h.includes(">新</span>"));
INTL_ACCT="acctEN"; openDayIntl(T0);
ok("intl 海外日視窗英文", modalHTML.includes("Unschedule") && !modalHTML.includes("移出排程"));

// ── 功能防呆 ──
{ let confirmed=false; const _c=global.confirm; global.confirm=()=>{confirmed=true; return false;};
  try{ chDiscard("shopee","T1"); }catch(e){} 
  ok("chDiscard 擋非蝦皮/非待處理（不進確認）", !confirmed);
  confirmed=false;
  try{ intlDiscard("T1"); }catch(e){}
  ok("intlDiscard 擋剪輯中（不進確認）", !confirmed);
  confirmed=false;
  try{ intlDiscard("E1"); }catch(e){}
  ok("intlDiscard 放行待處理殼（進確認）", confirmed);
  global.confirm=_c; }

// ── 全角色 × 全月曆平台 render 不炸 ──
["editor","intl"].forEach(role=>{
  localStorage.setItem("ecdr_user",role==="intl"?"Anna":"Kai"); localStorage.setItem("ecdr_role",role);
  ["tw","th","shopee","en","ms"].forEach(p=>{ CAL_PLAT=p; CAL_YM=null; INTL_CAL_YM=null; INTL_ACCT="";
    CH_CAL={shopee:{ym:null,acct:""},ms:{ym:null,acct:""}};
    try{ viewCal(); ok(`[${role}] cal:${p}`, true); }catch(e){ ok(`[${role}] cal:${p} → ${e.message}`, false); } });
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
