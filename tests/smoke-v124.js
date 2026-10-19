// v124 原本的指派鎖（鎖住、唯讀、改時間後門…）在 v255 被老闆直接取消了：
// 「不鎖了，開放編輯，讓所有剪輯可以進去改，因為需要寫上『上片連結』」。
// assignLocked() 現在一律回傳 false，這支測試改成只確認這件事、不再測鎖的細節
// （鎖的細節測試留在 v255 那支）。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, toasts=[];
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(Object.prototype.hasOwnProperty.call(fields,id)) return {value:fields[id]};
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const V=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"片"+id,videoCopy:"稿",
  rawLink:"http://raw",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  publishedLink:"",driveFolder:"",locale:"",channel:"",origLang:"",tags:[],products:[],
  usageHistory:[],metrics:[]},o||{});
function reset(){
  modalHTML=""; fields={}; toasts=[];
  STATE={ users:[{name:"小葵",role:"editor"},{name:"郁莚",role:"editor"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:["蝦皮A"],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    videos:[ V("FREE"), V("HERS",{assignedTo:"郁莚"}) ] };
  CUR_TAB=null; VIEW_AS=null; VID_LANG=""; VID_TAGS=new Set(); VID_Q=""; VID_UNSCHED=false;
  ZONE_VIEW="tw"; VID_MODE="list"; ORIG_AUTO_RAN=true;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{},
    scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

reset(); as("小葵","editor");
ok("v255：指派給別人的片不再鎖（老闆取消了指派鎖）", assignLocked(vid("HERS"))===false);
{ const r=vidTableRow(vid("HERS"));
  ok("影片庫那一列照舊點得開（editVideo）", r.includes(`editVideo('HERS')`)); }
modalHTML=""; editVideo("HERS");
ok("直接打得開編輯視窗（不是唯讀，e_name 欄位在）", modalHTML.includes('id="e_name"'), modalHTML.slice(0,80));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
