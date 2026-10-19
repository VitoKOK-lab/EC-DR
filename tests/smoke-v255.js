// v255（老闆指定）：
// ①「月報表中加上圖示『審核完成』、『未審核』，在上片日過後自動消失」
//    —— 月排程「整個月共 N 支」那張清單表（calListBody）本來沒有審核狀態，
//    加一顆 reviewStatusPill：通過→審核完成、還在等審→未審核；排定的上片日
//    一過就不再出現（舊片不用再提醒）。
// ②「不鎖了，開放編輯，讓所有剪輯可以進去改，因為需要寫上『上片連結』」
//    —— 指派鎖整個拿掉（assignLocked 一律 false），上片前後需要別人幫忙
//    補連結，鎖住（連 v254 的唯讀）反而擋事。
const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
src = src.replace(/^let /gm, "").replace(/^const /gm, "");
const el = () => ({ value:"", innerHTML:"", textContent:"", className:"",
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
const past=(d=>{ const t=new Date(d+"T00:00:00"); t.setDate(t.getDate()-3); return t.toISOString().slice(0,10); })(T0);
const future=(d=>{ const t=new Date(d+"T00:00:00"); t.setDate(t.getDate()+3); return t.toISOString().slice(0,10); })(T0);

function reset(){
  STATE = {
    users:[ {name:"小葵",role:"editor",perms:[]}, {name:"郁莚",role:"editor",perms:[]} ],
    settings:{ dailyTarget:4, videoTags:[], sources:["srcA"], postPlatforms:[],
      intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[],
  };
}
const as=(name,role)=>{ localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role); };
const V=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"片"+id,videoCopy:"稿",
  stage:"已完成",editor:"郁莚",claimedBy:"郁莚",assignedTo:"郁莚",finishedAt:T0,
  publishedLink:"",driveFolder:"",locale:"",channel:"",origLang:"",tags:[],products:[],
  usageHistory:[],metrics:[]},o||{});

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① 審核狀態燈號 ══════════
reset();
{ const v=V("A",{reviewStatus:"通過", scheduledDate:future});
  ok("**審過、上片日還沒到 → 顯示「審核完成」**", reviewStatusPill(v).includes("審核完成"), reviewStatusPill(v)); }
{ const v=V("B",{reviewStatus:"", scheduledDate:future});   // 還沒審、上片日未到
  ok("**還沒審、上片日還沒到 → 顯示「未審核」**", reviewStatusPill(v).includes("未審核"), reviewStatusPill(v)); }
{ const v=V("C",{reviewStatus:"通過", scheduledDate:past});   // 上片日已過
  ok("**上片日已經過了 → 這顆燈自動消失（審過的也一樣）**", reviewStatusPill(v)==="", reviewStatusPill(v)); }
{ const v=V("D",{reviewStatus:"", scheduledDate:past});
  ok("**上片日已經過了 → 未審核也自動消失**", reviewStatusPill(v)==="", reviewStatusPill(v)); }
{ const v=V("E",{reviewStatus:"", scheduledDate:null, finishedAt:"2020-01-01"});   // reviewSince 之前的舊片
  ok("reviewSince 之前的舊片不算「未審核」（沒有被老規矩回溯處罰）", reviewStatusPill(v)==="", reviewStatusPill(v)); }

// ══════════ ② 指派鎖整個拿掉 ══════════
reset(); as("小葵","editor");
STATE.videos=[ V("HERS",{assignedTo:"郁莚"}) ];
ok("**assignLocked 一律 false**", assignLocked(vid("HERS"))===false);
modalHTML=""; editVideo("HERS");
ok("**誰都打得開編輯視窗（不是唯讀，也不是被擋）**", modalHTML.includes('id="e_name"'), modalHTML.slice(0,80));

console.log(`\nv255（月報表加審核燈號＋上片日後自動消失；指派鎖整個取消，開放所有剪輯編輯）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
