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
STATE = {
  users:[ {name:"Regina",role:"manager"}, {name:"小葵",role:"editor"} ],
  settings:{ dailyTarget:4, videoTags:["舊片"], sources:["s"], postPlatforms:[{name:"IG",utm:"ig"}],
    intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{}, reviewSince:"2026-07-01" },
  schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
  videos:[
    // 舊片：流程上線前完成、有存檔連結沒上傳連結 → 不算待審核
    {id:"OLD1",name:"六月完成的舊片",rawName:"x",stage:"已完成",editor:"小葵",claimedAt:"2026-06-10T01:00:00Z",finishedAt:"2026-06-11T02:00:00Z",reviewStatus:"",driveFolder:"http://d",publishedLink:"",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    // 已有上傳網址 → 視為早就審過上片，不算待審核
    {id:"UP1",name:"已上傳的片",rawName:"x",stage:"已完成",editor:"小葵",claimedAt:T0+"T01:00:00Z",finishedAt:T0+"T02:00:00Z",reviewStatus:"",driveFolder:"http://d",publishedLink:"http://p",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    // 上線後完成、沒上傳連結 → 才是真正的待審核
    {id:"NEW1",name:"今天剪完的片",rawName:"x",stage:"已完成",editor:"小葵",claimedAt:T0+"T01:00:00Z",finishedAt:T0+"T03:00:00Z",reviewStatus:"",driveFolder:"http://d",publishedLink:"",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    // 還在剪 → 不算
    {id:"WIP1",name:"還在剪的片",rawName:"x",stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:T0+"T01:00:00Z",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

ok("舊片（上線前完成）不算待審核", !needsReview(STATE.videos[0]) && dispStage(STATE.videos[0])==="已完成");
ok("有上傳網址的不算待審核", !needsReview(STATE.videos[1]));
ok("上線後完成且沒上傳連結＝待審核", needsReview(STATE.videos[2]) && dispStage(STATE.videos[2])==="待審核");
ok("剪輯中不算待審核", !needsReview(STATE.videos[3]));

localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
WORK_ZONE="shopee"; POOL_FILTER="all";
let h=viewWork();
{ const card=h.split("審片進度")[1].split("最近 7 天剪完的片")[0];   // 只看審片進度卡（今日完成的片本來就會留在「我的今日工作」；v128 起下面還有一張七天盤點卡）
  ok("剪輯審片卡只列今天那支", card.includes("今天剪完的片") && !card.includes("六月完成的舊片") && !card.includes("已上傳的片")); }
ok("審片卡計數=1", h.includes("審片進度") && h.split("審片進度")[1].includes('">1</span>'));

localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
h=viewFlow();
ok("Regina 待審清單只列 1 支", h.includes("待你審片") && h.split("待你審片")[1].includes('">1</span>') && h.includes("今天剪完的片"));
ok("Regina 待審不含舊片與已上傳", !h.split("待你審片")[1].split("毛片庫存")[0].includes("六月完成的舊片"));

// 沒設定 reviewSince 時用內建預設（不會把舊片全掃進來）
STATE.settings.reviewSince="";
ok("未設定時有內建上線日", reviewSince()==="2026-07-27" && !needsReview(STATE.videos[0]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
