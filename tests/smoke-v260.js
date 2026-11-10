// v260（老闆指定）：「剪完等審的片，幫我加一個搜尋欄位」——這張卡（workRecent7Card，
// 「上班計畫」裡的「剪完等審的片」摺疊卡）不會過期，還沒審過的一律留著，久了會
// 愈堆愈長，只能用眼睛掃。照抄「待認領」那欄搜尋（poolFilter 那一套）：邊打邊篩，
// 只換清單跟清除鍵，不整頁重繪（不然折疊會被收回去、游標跳出搜尋框）。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,isConnected:true,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, workListEl=el(), workClearEl=el(), workNEl=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(id==="work_list") return workListEl;
    if(id==="work_clear") return workClearEl;
    if(id==="work_n") return workNEl;
    if(Object.prototype.hasOwnProperty.call(fields,id)) return {value:fields[id]};
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const V=(id,name,o)=>Object.assign({id,code:"26"+id,name,rawName:name,videoCopy:"稿",rawLink:"http://raw",
  stage:"已完成",editor:"小葵",claimedBy:"小葵",claimedAt:D(-1)+"T09:00:00",finishedAt:D(0)+"T15:00:00",
  scheduledDate:null,publishedLink:"",driveFolder:"",reviewStatus:"",reviewNote:"",reviewedBy:"",reviewedAt:"",
  locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(){
  modalHTML=""; fields={}; WORK_Q=""; workListEl=el(); workClearEl=el(); workNEl=el();
  STATE={ users:[{name:"小葵",role:"editor"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    videos:[
      V("A","珠寶開箱介紹",{finishedAt:D(0)+"T15:00:00"}),
      V("B","戒指保養秘訣",{finishedAt:D(-1)+"T15:00:00",reviewStatus:"通過",reviewedBy:"Regina",reviewedAt:D(-1)+"T16:00:00"}),
    ] };
  CUR_TAB=null; VIEW_AS=null;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{},
    scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① 卡片裡有搜尋欄位 ══════════
reset(); as("小葵","editor");
{ const c=workRecent7Card("小葵");
  ok("**有搜尋欄位（id=work_q）**", c.includes('id="work_q"'));
  ok("**兩支都列出來**", c.includes("珠寶開箱介紹") && c.includes("戒指保養秘訣")); }

// ══════════ ② 邊打邊篩：只換清單跟清除鍵，不整頁重繪 ══════════
reset(); as("小葵","editor");
workRecent7Card("小葵");   // 先跑一次產生初始清單（跟 render 一樣的順序）
{ setWorkQ("珠寶");
  ok("**篩出符合的那一支**", workListEl.innerHTML.includes("珠寶開箱介紹"));
  ok("**篩掉不符合的那一支**", !workListEl.innerHTML.includes("戒指保養秘訣"));
  ok("**清除鍵冒出來**", workClearEl.innerHTML.includes("清除") || workClearEl.innerHTML.includes("Clear")); }
{ setWorkQ("");
  ok("**清空搜尋字，兩支都回來**", workListEl.innerHTML.includes("珠寶開箱介紹") && workListEl.innerHTML.includes("戒指保養秘訣"));
  ok("**清除鍵消失**", workClearEl.innerHTML===""); }
{ setWorkQ("找不到的關鍵字");
  ok("**搜不到的時候有提示，不是空白一片**", workListEl.innerHTML.includes("找不到符合的片")); }

// ══════════ ③ 搜尋不影響摺疊標題上的總數（跟待認領那種「符合/全部」雙數字不一樣） ══════════
{ setWorkQ("珠寶");
  ok("**折疊標題上的數字還是總數 2，不是篩選後的 1**", workNEl.textContent==="2", workNEl.textContent); }

console.log(`\nv260（剪完等審的片，加搜尋欄位）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
