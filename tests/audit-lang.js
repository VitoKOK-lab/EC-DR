// 語言洩漏掃描：資料全用 ASCII 名稱 → intl 視角輸出裡任何 CJK＝介面漏中文；
// editor 視角則掃「常見英文 UI 詞」＝介面漏英文（資料不含這些詞）
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
  users:[ {name:"Kai",role:"editor"}, {name:"Anna",role:"intl"}, {name:"Sara",role:"cs"} ],
  settings:{ dailyTarget:4, videoTags:["oldtag"], sources:["srcA"], postPlatforms:[{name:"IG",utm:"ig"}],
    intlAccounts:[{locale:"th",name:"acctTH"},{locale:"en",name:"acctEN"}],
    shopeeAccounts:["acctSHP"], msAccounts:["acctMS"], exchangeRates:{en:{code:"USD",rate:0.031,mult:1},th:{code:"THB",rate:1.1,mult:1},ms:{code:"MYR",rate:0.14,mult:1},shopee:{code:"TWD",rate:1,mult:1.2}} },
  schedule:{}, shifts:{ ["Kai__"+T0]:{id:"k",user:"Kai",date:T0,clockIn:T0+"T01:00:00",clockOut:""} },
  tasks:{ K1:{id:"K1",user:"Kai",date:T0,title:"taskA",report:"note",done:false,assignedBy:"Regina",ack:true,createdAt:T0},
          K2:{id:"K2",user:"Sara",date:T0,title:"taskB",report:"",done:false,createdAt:T0} },
  logs:[], deletedVideos:[],
  videos:[
    {id:"S2",name:"SRC pub",rawName:"SRC pub",nameEn:"SRC pub EN",videoCopy:"copyZH",videoCopyEn:"copyEN",stage:"已上片",published:true,tags:["oldtag"],publishedLink:"http://x",driveFolder:"http://d",rawLink:"http://r",finishedAt:"2020-01-01T00:00:00Z",locale:"",channel:"",products:[{name:"prodA",price:"100",salePrice:"80"}],usageHistory:[],metrics:[]},
    {id:"E1",name:"EN shell",rawName:"SRC pub",stage:"待處理",locale:"en",sourceVideoId:"S2",account:"acctEN",createdBy:"Anna",scheduledDate:T0,usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"T1",name:"TH shell",rawName:"SRC pub",stage:"剪輯中",locale:"th",sourceVideoId:"S2",account:"acctTH",claimedBy:"Anna",editor:"Anna",claimedAt:T0+"T01:00:00Z",scheduledDate:T0,usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"P1",name:"SHP shell",rawName:"SRC pub",stage:"待處理",channel:"shopee",sourceVideoId:"S2",account:"acctSHP",scheduledDate:T0,usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};

let issues=[];
// 例外（設計如此，不算洩漏）：標籤是資料庫的業務分類、階段字串只存在 <option value> 內部值
const ALLOW=["寵粉","珠寶介紹","子女傳承","代理招商","銷售","新片","舊片","待處理","剪輯中","已完成","已上片","待審核","流量型","帶貨型"];
function scanCJK(label, html){
  let t=String(html);
  ALLOW.forEach(w=>{ t=t.split(w).join(""); });
  const m=t.match(/[一-鿿]{1,}/g);
  if(m) issues.push(`[intl漏中文] ${label}: ${[...new Set(m)].slice(0,8).join(" / ")}`); }
// editor 視角掃英文 UI 詞（避開資料/固定專名）
const EN_WORDS=/\b(Claim & start|Add version|pick account|Return to the library|Unschedule|Scheduled upload date|Mark .* as done|My Work|To do\b|In progress|Done —|Save\b|Cancel\b|Watch Chinese|Download|untitled|Ask admin|Nothing scheduled|added to To do)\b/g;
function scanEN(label, html){ const m=String(html).replace(/English \(TikTok\)|Thai \(TikTok\)/g,"").match(EN_WORDS);
  if(m) issues.push(`[editor漏英文] ${label}: ${[...new Set(m)].slice(0,8).join(" / ")}`); }

// ---- intl 視角：所有主畫面 + 彈窗 ----
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
WORK_ZONE="shopee"; scanCJK("viewWork", viewWork());
WORK_ZONE="en"; scanCJK("viewWork(zone en)", viewWork());
VID_LANG=""; VID_VIEW="rawNoSched"; VID_TAGS=new Set(); VID_Q="";
scanCJK("viewVideos", viewVideos());
scanCJK("viewTeam", viewTeam());
["tw","th","shopee","en","ms"].forEach(p=>{ CAL_PLAT=p; CAL_YM=null; INTL_CAL_YM=null; INTL_ACCT=""; CH_CAL={shopee:{ym:null,acct:""},ms:{ym:null,acct:""}};
  try{ scanCJK("viewCal:"+p, viewCal()); }catch(e){ issues.push("[炸] viewCal:"+p+" "+e.message); } });
openIntlModal("E1"); scanCJK("openIntlModal", modalHTML);
openChModal("shopee","P1"); scanCJK("openChModal", modalHTML);
openVideoModal("S2",false); scanCJK("openVideoModal view", modalHTML);
openVideoModal("S2",true); scanCJK("openVideoModal edit", modalHTML);
INTL_ACCT="acctEN"; openDayIntl(T0); scanCJK("openDayIntl", modalHTML);
CH_CAL={shopee:{ym:null,acct:"acctSHP"},ms:{ym:null,acct:""}}; openDayCh("shopee",T0); scanCJK("openDayCh", modalHTML);
openDay(T0); scanCJK("openDay(TW)", modalHTML);

// ---- editor 視角：同一批畫面掃英文 ----
localStorage.setItem("ecdr_user","Kai"); localStorage.setItem("ecdr_role","editor");
WORK_ZONE="shopee"; scanEN("viewWork", viewWork());
WORK_ZONE="en"; scanEN("viewWork(zone en)", viewWork());
scanEN("viewVideos", viewVideos());
scanEN("viewTeam", viewTeam());
["tw","th","shopee","en","ms"].forEach(p=>{ CAL_PLAT=p; CAL_YM=null; INTL_CAL_YM=null; INTL_ACCT=""; CH_CAL={shopee:{ym:null,acct:""},ms:{ym:null,acct:""}};
  try{ scanEN("viewCal:"+p, viewCal()); }catch(e){ issues.push("[炸] viewCal:"+p+" "+e.message); } });
openIntlModal("E1"); scanEN("openIntlModal", modalHTML);
openChModal("shopee","P1"); scanEN("openChModal", modalHTML);
INTL_ACCT="acctEN"; openDayIntl(T0); scanEN("openDayIntl", modalHTML);
openDay(T0); scanEN("openDay(TW)", modalHTML);

console.log(issues.length?issues.join("\n"):"(無洩漏)");
console.log("\n總計:",issues.length,"處");
