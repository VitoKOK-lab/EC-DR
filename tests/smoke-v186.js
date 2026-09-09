// v186：分頁標題掛數字
//
// 老闆：「他們都用桌機」→ 所以不是推播到手機（ntfy 那條作廢），而是分頁標題。
// 系統本身就擋手機登入（blockedOnMobile），全公司整天開著這個分頁工作。
//
// 要補的洞：導覽列那顆紅點要**已經在看這一頁**才看得到。Regina 晚上派一件急事，
// 對方切到別的分頁就完全不知道。標題掛上數字，切回來一眼就看到。
//
// 為什麼先做這個：不用問權限、不裝東西、不經過外部服務、不打斷任何人。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=(cls)=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,open:false,
  __cls:new Set(cls||[]),
  classList:{ add(c){this.__o.__cls.add(c);}, remove(c){this.__o.__cls.delete(c);},
              toggle(c,on){ on?this.__o.__cls.add(c):this.__o.__cls.delete(c); },
              contains(c){ return this.__o.__cls.has(c); } },
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
function mk(cls){ const e=el(cls); e.classList.__o=e; return e; }
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
const NODES={ app:mk(["hidden"]), login:mk([]), view:mk([]), nav:mk([]) };
let modalHTML="";
global.document={ title:"電商部協作系統",
  getElementById:(id)=>{ if(NODES[id]) return NODES[id];
    const e=mk([]); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>mk([]),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1400,innerHeight:900,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const T0=FROZEN;

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
function as(w,r){ localStorage.setItem("ecdr_user",w); localStorage.setItem("ecdr_role",r); }
const p_=(id,o)=>Object.assign({id,kind:"p2p",user:"小葵",from:"Regina",date:T0,title:"急件",
  ack:false,reply:"",fromSeen:false,createdAt:T0+"T21:00:00",msgs:[]},o||{});
function reset(tasks, loggedIn){
  VIEW_AS=null; BRAND=""; COMM_TAB="open";
  NODES.app.__cls=new Set(loggedIn===false?["hidden"]:[]);
  document.title="電商部協作系統";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const t={}; (tasks||[]).forEach(x=>t[x.id]=x);
  const raw={ users:[{name:"小葵",role:"editor"},{name:"Anna",role:"intl"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],shopeeAccounts:[],
      msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:t, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
}

// ══════════ ① 有事情等你 → 標題掛數字 ══════════
{ reset([]); as("小葵","editor"); syncDocTitle();
  ok("沒事的時候就是原本的標題", document.title==="電商部協作系統", document.title);
  reset([ p_("P1") ]); as("小葵","editor"); syncDocTitle();
  ok("**有一件 → (1) 電商部協作系統**", document.title==="(1) 電商部協作系統", document.title);
  reset([ p_("P1"), p_("P2",{title:"另一件",createdAt:T0+"T21:05:00"}) ]);
  as("小葵","editor"); syncDocTitle();
  ok("**兩件就寫 2**", document.title==="(2) 電商部協作系統", document.title);
  reset([ p_("P1",{ack:true,fromSeen:true}) ]); as("小葵","editor"); syncDocTitle();
  ok("處理完就把數字拿掉", document.title==="電商部協作系統", document.title); }

// ══════════ ② 數字跟導覽列那顆紅點是同一個 ══════════
// 兩個地方講不同的數字，人就不知道該信哪一個。
{ reset([ p_("P1"), p_("P2",{title:"另一件",createdAt:T0+"T21:05:00"}) ]);
  as("小葵","editor"); syncDocTitle();
  const n=commUnread();
  ok("**標題的數字＝commUnread()**", document.title==="("+n+") 電商部協作系統" && n===2,
     {標題:document.title, 紅點:n}); }

// ══════════ ③ 海外同仁看英文 ══════════
{ reset([ p_("P1",{user:"Anna"}) ]); as("Anna","intl"); syncDocTitle();
  ok("**海外：(1) E-Commerce Workspace**", document.title==="(1) E-Commerce Workspace", document.title);
  reset([]); as("Anna","intl"); syncDocTitle();
  ok("海外沒事時也是英文", document.title==="E-Commerce Workspace", document.title); }

// ══════════ ④ 沒登入不要掛數字 ══════════
{ reset([ p_("P1") ], false); as("小葵","editor"); syncDocTitle();
  ok("**登入畫面上不掛數字**（那時候還不知道你是誰）",
     document.title==="電商部協作系統", document.title); }
// 登出之後上一個人的數字不能留著
{ reset([ p_("P1") ]); as("小葵","editor"); syncDocTitle();
  ok("（前提）登入時有數字", document.title==="(1) 電商部協作系統");
  NODES.app.classList.add("hidden"); syncDocTitle();
  ok("**登出之後數字要消失**", document.title==="電商部協作系統", document.title); }

// ══════════ ⑤ 資料一同步就會跟著更新 ══════════
// （buildNav 每次 applyState 都會跑，所以掛在那裡；不是只有切分頁才更新）
{ ok("**buildNav 裡有呼叫 syncDocTitle**", /function buildNav\(\)[\s\S]{0,400}?syncDocTitle\(\)/.test(APP));
  ok("登出那條路也有呼叫", /bootLogin\(\);\s*\n\s*syncDocTitle\(\)/.test(APP)); }
{ reset([ p_("P1") ]); as("小葵","editor");
  document.title="電商部協作系統";      // 假裝上一輪的標題
  buildNav();
  ok("**資料進來、buildNav 一跑，標題就對了**", document.title==="(1) 電商部協作系統", document.title); }

// ══════════ ⑥ 員工視角預覽不要污染標題 ══════════
{ reset([ p_("P1",{user:"Regina",from:"小葵"}) ]); as("Regina","manager");
  VIEW_AS="小葵"; syncDocTitle();
  ok("**預覽別人的畫面時不掛數字**（那不是你的事情）",
     document.title==="電商部協作系統", document.title);
  VIEW_AS=null; }

// ══════════ ⑦ 壞掉也不能把畫面弄爆 ══════════
{ const keep=STATE; STATE=null;
  let bad=null; try{ syncDocTitle(); }catch(e){ bad=e.message; }
  ok("沒有資料的時候不會炸", !bad, bad);
  STATE=keep; }

console.log(`\nv186（分頁標題掛數字）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
