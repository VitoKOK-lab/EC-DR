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
STATE = {
  users:[ {name:"小葵",role:"editor"}, {name:"Anna",role:"intl"} ],
  settings:{ videoTags:["舊片"], sources:["s"], postPlatforms:[{name:"IG",utm:"ig"}], intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
  schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
  videos:[ {id:"V1",name:"某片",rawName:"某片",stage:"待處理",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]} ],
};
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
openVideoModal("V1", true);
ok("editor 有刪除卡（中文）", modalHTML.includes("刪除這支影片") && modalHTML.includes("管理員可救回"));
// v146：海外進同一個編輯視窗，刪除鍵也一樣有（會進回收桶、有紀錄、管理員救得回）
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
openVideoModal("V1", true);
ok("intl 有刪除鍵（英文）", modalHTML.includes("Delete this video") && !modalHTML.includes("刪除這支影片"));
{ let msg=""; global.confirm=(m)=>{msg=m; return false;};
  delVideo("V1"); ok("intl 刪除確認英文＋提可救回", msg.includes("recycle bin") && msg.includes("restore"));
  localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
  delVideo("V1"); ok("editor 刪除確認提記錄誰刪的", msg.includes("記錄是誰刪的"));
  global.confirm=()=>true; }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
