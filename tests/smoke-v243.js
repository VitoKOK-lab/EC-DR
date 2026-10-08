// v243：巧芸可以按所有剪輯的影片審核——但她是一般員工，不是主管。
//
// 老闆：「巧芸 可以 按所有剪輯的 影片審核」。
//
// v242 讓 HR 審得動是借用她已經有的「lead」權限（看板主管版）——但 lead 同時
// 還開了備片存量、指派毛片給員工、未來排程、員工視角那一整組跟審片無關的東西。
// 巧芸是一般員工，比照辦理等於多給一堆她不需要的東西，所以另外開一個單獨的
// 「review」（審片）權限，只管審片這一件事，不跟 lead 綁在一起。
//
// 標題也順便改掉：原本寫死「審片（Regina／管理員）」，現在會審片的人不只這兩種
// 身分（HR 靠 lead、巧芸靠 review），繼續寫死這兩個名字反而誤導，改回不點名的
// 「審片」。
const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
const APP = src;
src = src.replace(/^let /gm, "").replace(/^const /gm, "");
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
function reset(){
  STATE = {
    users:[ {name:"巧芸",role:"editor",perms:["review"]}, {name:"麗君",role:"cs",perms:[]},
             {name:"Regina",role:"manager",perms:[]}, {name:"泓儒",role:"editor",perms:[]} ],
    settings:{ dailyTarget:4, videoTags:["舊片"], sources:["srcA"], postPlatforms:[],
      intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    videos:[ {id:"W1",name:"泓儒的片",rawName:"泓儒的片",stage:"已完成",editor:"泓儒",
      finishedAt:T0+"T02:00:00Z",reviewStatus:"",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]} ],
  };
  modalHTML=""; VIEW_AS=null;
}
const as=(name,role)=>{ localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① 權限表裡有「審片」這個獨立的鍵，不是借用 lead ══════════
{ ok("**PERMS.review 存在，label 是「審片」**", PERMS.review && PERMS.review.label==="審片", PERMS.review);
  ok("review 沒有 tab（不是一個獨立分頁，跟 prod/plan 同一類）", !PERMS.review.tab); }

// ══════════ ② 巧芸（editor 職位、只有 review 權限，沒有 lead）打開別人的片，看得到通過／退回 ══════════
{ reset(); as("巧芸","editor");
  ok("**她沒有 lead**（確認這條走的是 review，不是蹭 lead 那條舊路）", !hasPerm("lead"));
  openVideoModal("W1", true);
  ok("**巧芸打開泓儒的片，看得到「通過／退回」**",
     modalHTML.includes("reviewVid('W1','通過')") && modalHTML.includes("reviewVid('W1','退回')")); }

// ══════════ ③ 標題不再寫死「Regina／管理員」——不然巧芸看了會覺得這張卡在叫別人 ══════════
{ reset(); as("巧芸","editor");
  openVideoModal("W1", true);
  ok("**審片卡標題是乾淨的「審片」，沒有寫死特定人名**",
     modalHTML.includes(">審片<") && !modalHTML.includes("Regina／管理員")); }

// ══════════ ④ 只有 review 沒有其他主管權限的人，看不到看板主管版那一整組 ══════════
{ reset(); as("巧芸","editor");
  ok("**巧芸看不到看板主管版**（只給她審片，沒有連備片存量、指派毛片那些一起給）",
     !seesLeadBoard()); }

// ══════════ ⑤ 沒有 review、也不是 boss/manager 的人，照舊沒有審核按鈕（沒有大開後門） ══════════
{ reset(); as("麗君","cs");
  openVideoModal("W1", true);
  ok("**沒有 review 權限的人還是看不到**", !modalHTML.includes("reviewVid(")); }

// ══════════ ⑥ manager 職位（Regina）跟 HR（lead）那兩條舊路都還通，沒有被這次改動動到 ══════════
{ reset(); as("Regina","manager");
  openVideoModal("W1", true);
  ok("**manager 職位照舊能審**（v242 之前就有的路，沒受影響）",
     modalHTML.includes("reviewVid('W1','通過')")); }
{ reset();
  STATE.users.push({name:"HR",role:"hr",perms:["lead"]});
  as("HR","hr");
  openVideoModal("W1", true);
  ok("**HR 靠 lead 審片那條路（v242）照舊通**",
     modalHTML.includes("reviewVid('W1','通過')")); }

console.log(`\nv243（巧芸可以審所有剪輯的片，獨立 review 權限，不蹭 lead）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
