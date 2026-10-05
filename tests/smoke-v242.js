// v242：讓有「lead」權限的人（不只 boss／manager）也按得動審片的「通過／退回」。
//
// 老闆：「那讓 HR 也可以幫他審」（陳鋒的片）。
//
// 查過才發現：HR 的權限表裡本來就已經勾了「lead」（看板主管版，含「待你審片」
// 那份清單），清單也看得到、點得進去，但視窗裡沒有「通過／退回」那兩顆鍵——
// reviewCardHTML() 原本寫死只認 currentRole() 是 "boss" 或 "manager"，沒有看
// hasPerm("lead")，所以清單列出來了，手卻伸不進去按。
//
// 改法：加一條 `|| hasPerm("lead")`，不是整個換掉——boss／manager 那條原封
// 不動（不會動到 Regina／管理員現有的用法），只是多開一條路給「有 lead 權限
// 但職位不是 boss/manager」的人，跟 seesLeadBoard() 用同一條權限：
// 誰看得到「待你審片」清單、誰就該按得動，不然清單等於白列。
const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
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
    users:[ {name:"HR",role:"hr",perms:["lead"]}, {name:"麗君",role:"cs",perms:[]},
             {name:"Regina",role:"manager",perms:[]}, {name:"陳鋒",role:"editor",perms:[]} ],
    settings:{ dailyTarget:4, videoTags:["舊片"], sources:["srcA"], postPlatforms:[],
      intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    videos:[ {id:"W1",name:"陳鋒的片",rawName:"陳鋒的片",stage:"已完成",editor:"陳鋒",
      finishedAt:T0+"T02:00:00Z",reviewStatus:"",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]} ],
  };
  modalHTML=""; VIEW_AS=null;
}
const as=(name,role)=>{ localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,200));} }

// ══════════ ① HR 有 lead 權限：看得到「待你審片」清單，也按得動通過／退回 ══════════
{ reset(); as("HR","hr");
  const h=viewFlow();
  ok("**HR 看得到「待你審片」清單**（她本來就有 lead，這部分一直都通）",
     h.includes("待你審片") && h.includes("陳鋒的片"));
  openVideoModal("W1", true);
  ok("**HR 打開陳鋒的片，看得到「通過／退回」兩顆鍵**（這是這次要修的）",
     modalHTML.includes("reviewVid('W1','通過')") && modalHTML.includes("reviewVid('W1','退回')"),
     modalHTML.slice(modalHTML.indexOf("審片"), modalHTML.indexOf("審片")+200)); }

// ══════════ ② 沒有 lead 權限的人（職位不是 boss/manager）還是不給按，沒有大開後門 ══════════
{ reset(); as("麗君","cs");
  openVideoModal("W1", true);
  ok("**沒有 lead 權限的人照舊沒有審核按鈕**（不是誰都能審，只有勾了 lead 的才行）",
     !modalHTML.includes("reviewVid(")); }

// ══════════ ③ Regina（manager 職位）原本就能審，這次的改動沒有動到她 ══════════
{ reset(); as("Regina","manager");
  openVideoModal("W1", true);
  ok("**manager 職位照舊能審**（boss/manager 那條原封不動，沒有因為加了 lead 判斷就壞掉）",
     modalHTML.includes("reviewVid('W1','通過')") && modalHTML.includes("reviewVid('W1','退回')")); }

// ══════════ ④ 影片本人（陳鋒，editor 職位、沒有 lead）開自己的片，沒有審核按鈕 ══════════
{ reset(); as("陳鋒","editor");
  openVideoModal("W1", true);
  ok("**剪輯自己打開自己的片，沒有「通過／退回」**（他只有上班計畫那顆「✓ 審過」，跟這個是兩件事）",
     !modalHTML.includes("reviewVid(")); }

console.log(`\nv242（審片「通過／退回」改認 lead 權限，不只 boss/manager）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
