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
global.window = { addEventListener(){}, innerWidth:390, innerHeight:800, scrollY:0, scrollTo(){}, DB:null, location:{reload(){}} };
global.requestAnimationFrame=(f)=>f();
global.navigator = { onLine:true };
global.confirm = ()=>true; global.prompt = ()=>null;
eval(src);

const T0 = new Date(Date.now()+288e5).toISOString().slice(0,10);
const OLD = new Date(Date.now()+288e5-10*864e5).toISOString();
STATE = {
  users:[ {name:"Regina",role:"manager"}, {name:"小葵",role:"editor"} ],
  settings:{ dailyTarget:4, videoTags:["舊片"], sources:["srcA"], postPlatforms:[{name:"IG",utm:"ig"}],
    intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
  schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
  videos:[
    // Regina 剛審過、連結齊 → 亮綠＋知道了
    {id:"A1",name:"審過連結齊",rawName:"審過連結齊",stage:"已完成",editor:"小葵",finishedAt:T0+"T01:00:00Z",reviewStatus:"通過",reviewedBy:"Regina",reviewedAt:T0+"T02:00:00Z",driveFolder:"http://d",publishedLink:"http://p",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    // Regina 審過、缺連結 → 琥珀持續提醒
    {id:"A2",name:"審過缺連結",rawName:"審過缺連結",stage:"已完成",editor:"小葵",finishedAt:T0+"T01:00:00Z",reviewStatus:"通過",reviewedBy:"Regina",reviewedAt:T0+"T02:00:00Z",driveFolder:"",publishedLink:"",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    // 已按知道了 → 不顯示
    {id:"A3",name:"已收起的片",rawName:"已收起的片",stage:"已完成",editor:"小葵",finishedAt:T0+"T01:00:00Z",reviewStatus:"通過",reviewedBy:"Regina",reviewedAt:T0+"T02:00:00Z",reviewAck:true,driveFolder:"http://d",publishedLink:"http://p",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    // 審過超過 7 天、連結齊、沒按知道了 → 自動不顯示
    {id:"A4",name:"很久以前審過",rawName:"很久以前審過",stage:"已完成",editor:"小葵",finishedAt:OLD,reviewStatus:"通過",reviewedBy:"Regina",reviewedAt:OLD,driveFolder:"http://d",publishedLink:"http://p",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
WORK_ZONE="shopee"; POOL_FILTER="all";
let h=viewWork();
// v128：名字改包在「由 … 審過」中間 —— 名字擺最前面會被讀成「這一列是那個人的片」
ok("Regina 審過的片亮出來（不沈下去）", h.includes("審過連結齊") && h.includes("由 Regina 審過"));
ok("連結齊 → 綠底＋知道了鍵", h.includes("ackReviewedVid('A1')") && h.includes("連結都補齊了"));
ok("缺連結 → 持續提醒＋標已審過", h.includes("審過缺連結") && h.includes("由 Regina 審過"));
ok("缺連結的沒有知道了鍵", !h.includes("ackReviewedVid('A2')"));
{ const seg=h.split("審片進度")[1].split("最近 7 天剪完的片")[0];   // v128 起下面多一張七天盤點卡，切在它之前
  ok("按過知道了的不再顯示", !seg.includes("已收起的片"));
  ok("審過超過7天自動收起", !seg.includes("很久以前審過")); }

// ackReviewedVid 寫入
{ const calls=[]; global.window.DB={ set:async()=>{}, update:async(c,id,p)=>{calls.push([c,id,p]);}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
  (async()=>{ await ackReviewedVid("A1");
    ok("知道了寫入 reviewAck", calls.some(([c,id,p])=>c==="videos"&&id==="A1"&&p.reviewAck===true));
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail?1:0); })(); }
