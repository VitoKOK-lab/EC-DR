// v256（老闆指定）：
// ①「文字太長了，留20個字就好」——「當日影片」清單（openDay）裡的片名，
//    老闆給的例子是一整段很長的貼文文案，整句印出來把一列撐成十幾行。只在
//    這裡（顯示用）截斷成 20 字＋刪節號，vidName() 本身不動（其他清單、
//    搜尋、編輯視窗都還是讀全文），完整內容留在 title 屬性，滑鼠移上去看得到。
// ②「這裡也要有『審核完成』、『未審核』」——月排程表（v255）已經有的
//    reviewStatusPill，這裡（當日影片）也補上同一顆燈。
const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
src = src.replace(/^let /gm, "").replace(/^const /gm, "");
const el = () => ({ value:"", innerHTML:"", textContent:"", className:"", style:{}, checked:false,
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

const T0=todayTW();
const LONG="如果沒有他在身邊為我加油打氣、支持我的每一個決定，我根本無法打造出夢想中的「泰熙爾札娜」。";
const SHORT="富不過三代的原因";

function reset(videos){
  STATE = {
    users:[ {name:"季欣",role:"editor",perms:[]} ],
    settings:{ dailyTarget:4, videoTags:[], sources:["srcA"], postPlatforms:[],
      intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[],
  };
  localStorage.setItem("ecdr_user","季欣"); localStorage.setItem("ecdr_role","editor");
}

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

reset([
  {id:"LONG1", name:LONG, rawName:LONG, stage:"已完成", editor:"季欣", claimedBy:"季欣", assignedTo:"",
    scheduledDate:T0, publishTime:"10:00", finishedAt:T0, publishedLink:"", driveFolder:"", reviewStatus:"通過",
    locale:"", channel:"", usageHistory:[], tags:[], products:[], metrics:[]},
  {id:"SHORT1", name:SHORT, rawName:SHORT, stage:"已完成", editor:"季欣", claimedBy:"季欣", assignedTo:"",
    scheduledDate:T0, publishTime:"11:00", finishedAt:T0, publishedLink:"", driveFolder:"", reviewStatus:"",
    locale:"", channel:"", usageHistory:[], tags:[], products:[], metrics:[]},
]);
CAL_YM=T0.slice(0,7);
modalHTML=""; openDay(T0);
const h=modalHTML;

ok("**長文案被截成 20 字＋刪節號**", h.includes(LONG.slice(0,20)+"…"), h.slice(0,200));
ok("**連結文字本身只有截斷後的 20 字，不是全文**", h.includes(`>${LONG.slice(0,20)}…</a>`) && !h.includes(`>${LONG}</a>`));
ok("**完整文案留在 title 屬性，滑鼠移上去看得到**", h.includes(`title="${LONG}"`));
ok("短片名（沒超過 20 字）原封不動，不會被截", h.includes(`>${SHORT}</a>`), h.slice(0,400));
ok("**審過的那支顯示「審核完成」**", h.includes("審核完成"), h);
ok("**還沒審的那支顯示「未審核」**", h.includes("未審核"), h);

console.log(`\nv256（當日影片清單片名過長截成 20 字，完整內容留在 title 屬性）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
