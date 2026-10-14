// v253（老闆回報）：「巧芸說他現在無法點進去審查」。
//
// 巧芸有 review 權限，照理能審任何人的片，但「指派鎖」（assignLocked——別人
// 認領的片整列變灰、點不開，直到上片完成）的例外名單只寫死 boss/manager/hr
// 三個職位，沒看 hasPerm("review")／hasPerm("lead")。陳鋒的片指派給他自己、
// 巧芸不是指派對象也不是那三個職位，於是整列變灰、點不開——卡在審片這一步
// 之前，連打開編輯視窗都打不開，跟 v242／v243 reviewCardHTML() 修過的是
// 同一種漏洞（能不能做 vs 顯不顯示，兩道門各寫一份）。
//
// 改法：assignLocked() 也認 canSeeReviewButtons()（跟 reviewCardHTML 共用
// 同一條權限來源）——審得動的人，指派鎖也打得開。
const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
const APP = src;
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
let TOASTS=[];
eval(src);
toast = (m,e) => { TOASTS.push(String(m)); };

function reset(){
  STATE = {
    users:[ {name:"巧芸",role:"editor",perms:["review"]}, {name:"陳鋒",role:"editor",perms:[],outsourced:true},
             {name:"小葵",role:"editor",perms:[]}, {name:"Regina",role:"manager",perms:[]} ],
    settings:{ dailyTarget:4, videoTags:["舊片"], sources:["srcA"], postPlatforms:[],
      intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    videos:[ {id:"V1",name:"陳鋒的片",rawName:"陳鋒的片",stage:"待處理",assignedTo:"陳鋒",
      finishedAt:"",publishedLink:"",reviewStatus:"",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]} ],
  };
  modalHTML=""; VIEW_AS=null; TOASTS=[];
}
const as=(name,role)=>{ localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① 巧芸（editor 職位、有 review 權限）打得開指派給陳鋒、還沒上片的片 ══════════
{ reset(); as("巧芸","editor");
  ok("**assignLocked() 對巧芸是 false（審得動，指派鎖打得開）**", assignLocked(vid("V1"))===false);
  editVideo("V1");
  ok("**巧芸按下去真的打得開編輯視窗，不是被擋下來**", modalHTML.includes('id="e_name"') || modalHTML.length>0, modalHTML.slice(0,80));
  ok("**沒有跳出「已指派給...」那個擋下來的 toast**", !TOASTS.some(t=>t.includes("只有他能編輯"))); }

// ══════════ ② 沒有 review 權限的一般剪輯，指派鎖照舊擋住（沒有大開後門） ══════════
{ reset(); as("小葵","editor"); modalHTML="";
  ok("**沒有 review 權限的人，指派鎖照舊鎖著**", assignLocked(vid("V1"))===true);
  editVideo("V1");
  ok("**按下去被擋下來，跳出「已指派給」的提示**", TOASTS.some(t=>t.includes("已指派給")) && modalHTML==="", TOASTS); }

// ══════════ ③ manager 職位（Regina）跟指派對象本人（陳鋒）那兩條舊路都還通 ══════════
{ reset(); as("Regina","manager");
  ok("**manager 職位照舊打得開**", assignLocked(vid("V1"))===false); }
{ reset(); as("陳鋒","editor");
  ok("**指派對象本人照舊打得開自己的片**", assignLocked(vid("V1"))===false); }

// ══════════ ④ 已經上片的片，指派鎖本來就會解除，不受這次改動影響 ══════════
{ reset(); as("小葵","editor");
  vid("V1").stage="已上片";
  ok("已上片之後指派鎖自動解除（舊規矩沒被動到）", assignLocked(vid("V1"))===false); }

console.log(`\nv253（巧芸有 review 權限時，指派鎖也打得開，不會卡在審片前一步）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
