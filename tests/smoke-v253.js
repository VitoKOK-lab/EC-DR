// v253 修的是「指派鎖的例外名單要認 review 權限」。v255 老闆直接把指派鎖整個
// 取消了（「不鎖了，開放編輯」），所以 v253 原本測的「鎖住時 canSeeReviewButtons
// 的人打得開」已經沒有意義——現在誰都打得開。留一支最小測試確認這件事沒有退步
// （巧芸這種有 review 權限的人，當然還是打得開別人的片）。
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

function reset(){
  STATE = {
    users:[ {name:"巧芸",role:"editor",perms:["review"]}, {name:"陳鋒",role:"editor",perms:[],outsourced:true},
             {name:"小葵",role:"editor",perms:[]} ],
    settings:{ dailyTarget:4, videoTags:["舊片"], sources:["srcA"], postPlatforms:[],
      intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    videos:[ {id:"V1",name:"陳鋒的片",rawName:"陳鋒的片",stage:"待處理",assignedTo:"陳鋒",
      finishedAt:"",publishedLink:"",reviewStatus:"",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]} ],
  };
  modalHTML="";
}
const as=(name,role)=>{ localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

reset(); as("巧芸","editor");
ok("v255：指派鎖取消了，巧芸（有 review 權限）打得開陳鋒的片", assignLocked(vid("V1"))===false);
editVideo("V1");
ok("**真的打得開編輯視窗**", modalHTML.includes('id="e_name"'), modalHTML.slice(0,80));

reset(); as("小葵","editor");
ok("v255：沒有任何權限的人也一樣打得開（老闆指定全部開放）", assignLocked(vid("V1"))===false);

console.log(`\nv253→v255（指派鎖整個取消，review 權限不再是門檻）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
