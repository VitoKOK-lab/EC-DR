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
  users:[ {name:"Regina",role:"manager"}, {name:"小葵",role:"editor"}, {name:"Anna",role:"intl"}, {name:"管理員",role:"boss"} ],
  settings:{ dailyTarget:4, videoTags:["舊片"], sources:["srcA"], postPlatforms:[{name:"IG",utm:"ig"}],
    intlAccounts:[{locale:"en",name:"acctEN"}], shopeeAccounts:["acctSHP"], msAccounts:["acctMS"], exchangeRates:{} },
  schedule:{}, tasks:{
    K1:{id:"K1",user:"小葵",date:T0,title:"回覆廠商",contact:"",report:"已聯絡，等回覆",done:false,assignedBy:"Regina",ack:true,createdAt:"a"},
    K2:{id:"K2",user:"小葵",date:T0,title:"寄樣品",contact:"",report:"",done:false,assignedBy:"Regina",ack:false,createdAt:"b"},
  }, shifts:{ ["小葵__"+T0]:{id:"x",user:"小葵",date:T0,clockIn:T0+"T01:00:00Z",clockOut:""} }, logs:[], deletedVideos:[],
  videos:[
    {id:"R1",name:"毛片一",rawName:"毛片一",rawLink:"http://raw1",stage:"待處理",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"R2",name:"毛片二",rawName:"毛片二",rawLink:"http://raw2",stage:"待處理",locale:"",channel:"",assignedTo:"小葵",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"W1",name:"剪很久的片",rawName:"剪很久的片",stage:"剪輯中",locale:"",channel:"",claimedBy:"小葵",editor:"小葵",claimedAt:"2020-01-01T00:00:00Z",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"P1",name:"蝦皮殼",rawName:"src",stage:"待處理",channel:"shopee",scheduledDate:"2026-08-01",usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ---- manager 首頁＝流程中控 ----
localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
const tabs=myTabs().map(t=>t[0]);
ok("manager 分頁＝flow/team/videos/videosDF/cal", JSON.stringify(tabs)===JSON.stringify(["flow","team","videos","videosDF","cal"]));
let h=viewFlow();
ok("備片警報卡（未達60天→紅色警示）", h.includes("備片存量") && h.includes("要拍片了") && h.includes("準備腳本"));
ok("排程存量數字與目標", h.includes(`/${60}`)||h.includes("60"));
ok("毛片庫存卡＋未指派清單", h.includes("毛片庫存") && h.includes("毛片一") && !h.includes(">毛片二<"));
ok("指派毛片控制存在", h.includes("assignFootage()") && h.includes("afp_who"));
{ // v120：清單本來截在 20 筆，下面卻寫「未指派 N 支」—— 數字與看得到的列數對不上，
  // 而且「全選」只勾得到前 20 支。凡是要動手勾的清單就不截斷。
  const many=STATE.videos.slice();
  for(let i=0;i<40;i++) many.push({id:"BULK"+i,code:"26B"+i,name:"大量毛片"+i,rawName:"大量毛片"+i,
    videoCopy:"c",rawLink:"http://raw",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",
    scheduledDate:null,publishedLink:"",driveFolder:"",locale:"",channel:"",origLang:"",
    tags:[],products:[],usageHistory:[],metrics:[]});
  STATE.videos=many;
  const f=viewFlow();
  const n=(f.match(/class="afp_vid"/g)||[]).length;
  const m=f.match(/未指派 (\d+) 支/);
  ok("未指派的數字與清單列數一致", !!m && n===+m[1]);
  ok("超過 20 筆也全部列出來", n>20 && f.includes("大量毛片39"));
  STATE.videos=STATE.videos.filter(v=>!String(v.id).startsWith("BULK")); }
ok("各平台排到哪天 chips", h.includes("蝦皮排到 8/1") && h.includes("英文排到 未排"));
ok("員工卡：小葵上班中＋拖延警示", h.includes("小葵") && h.includes("上班中") && h.includes("拖太久"));
ok("員工卡：交辦清單＋回報＋未讀", h.includes("回覆廠商") && h.includes("已聯絡，等回覆") && h.includes("未讀") && h.includes("（還沒回報）"));
ok("每位員工都有一鍵交辦輸入", h.includes("flowAssign(") && h.includes("交辦 小葵 一件事") && h.includes("交辦 Anna 一件事"));
ok("海外員工標示", h.includes(">海外</span>")||h.includes("海外</span>"));
ok("批次新增毛片 CTA", h.includes("batchNewFootage()"));

// ---- boss 也看得到同一頁 ----
localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
const btabs=myTabs().map(t=>t[0]);
ok("boss 分頁含 flow", btabs.includes("flow") && btabs.includes("dashboard"));
CUR_TAB="flow"; let ex=null; try{ render(); }catch(e){ ex=e; }
ok("boss 開流程中控不炸", !ex && viewEl.innerHTML.includes("流程中控"));

// ---- 全角色 render 掃一次 ----
const tabsOf={boss:["dashboard","flow","videos","cal","perf","log","trash"],manager:["flow","videos","cal"],editor:["work","videos","cal"],intl:["work","videos","cal"]};
const who={boss:"管理員",manager:"Regina",editor:"小葵",intl:"Anna"};
Object.keys(tabsOf).forEach(role=>{
  localStorage.setItem("ecdr_user",who[role]); localStorage.setItem("ecdr_role",role);
  tabsOf[role].forEach(tab=>{ CUR_TAB=tab; CAL_PLAT="tw"; CAL_YM=null; WORK_ZONE="shopee";
    try{ render(); ok(`[${role}] ${tab}`, true); }catch(e){ ok(`[${role}] ${tab} → ${e.message}`, false); } });
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
