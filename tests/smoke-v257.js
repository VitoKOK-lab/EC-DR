// v257：架構掃描（/improve-codebase-architecture）找到的「v255 指派鎖拿掉之後，
// 跟著變成死路的程式碼」——assignLockTip／assignLockPill 兩個函式、每個清單
// 渲染裡的 lk 判斷、.vlock／.lockpill 這兩個 CSS class，全部清掉（assignLocked
// 本身留著，一律回傳 false，呼叫端不用再特別處理它）。
// openQuickSchedule 裡原本借用 assignLockTip 的文字（「只有他能編輯」）在
// 鎖拿掉之後是錯的，改用單純報「指派給誰」的 assignedToTip，沒有指派人時
// 乾脆不顯示那一行。
const fs = require("fs");
const APP_SRC = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
let src = APP_SRC.replace(/^let /gm, "").replace(/^const /gm, "");
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
function reset(videos){
  STATE = {
    users:[ {name:"郁莚",role:"editor",perms:[]}, {name:"小葵",role:"editor",perms:[]} ],
    settings:{ dailyTarget:4, videoTags:[], sources:["srcA"], postPlatforms:[],
      intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[],
  };
  modalHTML="";
  localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
}

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① 死函式真的不見了，呼叫端也不再參照 ══════════
ok("**assignLockTip 已經刪掉**", typeof assignLockTip==="undefined");
ok("**assignLockPill 已經刪掉**", typeof assignLockPill==="undefined");
ok("**assignAired 已經刪掉（只被 assignLocked 用過，沒別的呼叫端）**", typeof assignAired==="undefined");
ok("**assignLocked 還在、一律回傳 false（行為沒變）**", assignLocked({assignedTo:"郁莚"})===false);
ok("**原始碼裡找不到 vlock／lockpill 這兩個 class 了**",
  !/\bvlock\b/.test(APP_SRC) && !/\blockpill\b/.test(APP_SRC));

// ══════════ ② 各清單渲染照舊正常（沒有因為清掉鎖的分支而漏東西）══════════
const V=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"片"+id,stage:"待處理",
  assignedTo:"郁莚",editor:"",claimedBy:"",scheduledDate:null,publishedLink:"",driveFolder:"",
  locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
reset([ V("A") ]);
{ const r=vidTableRow(vid("A"));
  ok("影片庫那一列照舊點得開", r.includes(`editVideo('A')`), r.slice(0,150)); }
{ const c=vidCardHTML(vid("A"));
  ok("圖片模式那張卡照舊點得開", c.includes(`editVideo('A')`), c.slice(0,150)); }
modalHTML=""; editVideo("A");
ok("editVideo 直接開編輯模式（不用先經過唯讀視窗）", modalHTML.includes('id="e_name"'), modalHTML.slice(0,80));

// ══════════ ③ openQuickSchedule 的提示文字改成單純「指派給誰」，不再說謊
//    （鎖已經拿掉了，不該再說「只有他能編輯」）══════════
reset([ V("B") ]);
modalHTML=""; openQuickSchedule("B");
ok("**看得到是指派給誰**", modalHTML.includes("郁莚"), modalHTML.slice(0,200));
ok("**不再講「只有他能編輯」這種已經不成立的話**", !modalHTML.includes("只有他能編輯"), modalHTML.slice(0,200));

reset([ V("C",{assignedTo:""}) ]);   // 沒有指派對象
modalHTML=""; openQuickSchedule("C");
ok("沒有指派對象時，乾脆不顯示那一行（不是顯示『指派給　』的空白）", !modalHTML.includes("指派給"), modalHTML.slice(0,200));

console.log(`\nv257（清掉 v255 之後變成死路的指派鎖程式碼）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
