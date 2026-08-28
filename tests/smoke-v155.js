// v153 ③④：兩個小的。
//
// ③ 剪輯成效每個人掃了兩次影片清單（統計一次、畫卡片再一次）。10 個剪輯就是
//    20 次全表掃描，該是 10 次。這是我在 v152 留下的疏失。
//
// ④ clockIn() 沒有擋「員工視角」。write()／writeAdmin()／dbWrite() 三個寫入入口
//    都擋了，只有它直接呼叫 window.DB.set，三個全繞過 —— 實測管理員在唯讀預覽
//    底下叫這個函式會**真的幫員工打一張上班卡**。畫面上不會畫出打卡鈕所以滑鼠
//    點不到（不是現在的災情），但它是唯一沒有守門的寫入路徑。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), TOASTS=[];
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true,userAgent:"test"};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=(m,e)=>{ TOASTS.push(String(m)); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const TODAY=D(0);
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"片"+id,videoCopy:"文案",
  rawLink:"http://raw",lib:"",stage:"已完成",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  claimedAt:D(-2)+"T09:00:00",finishedAt:TODAY+"T18:00:00",durationMin:90,publishedLink:"",
  driveFolder:"http://d",reviewStatus:"通過",locale:"",channel:"",origLang:"",account:"",
  sourceVideoId:"",cover:"",remakes:[],tags:[],products:[],usageHistory:[],metrics:[]},o||{});
let WRITES=[];
function reset(videos, who, role){
  WRITES=[]; TOASTS=[]; modalHTML=""; viewEl.innerHTML="";
  OUT_FILTER="all"; TEAM_YM=null; VIEW_AS=null; BRAND="";
  const rec=(op)=>(...a)=>{ WRITES.push(op+" "+a[0]+" "+a[1]); return Promise.resolve(); };
  global.window.DB={ set:rec("set"), update:rec("update"), del:rec("del"), scheduleSet:rec("scheduleSet"),
    setSettings:rec("setSettings"), videosWatched:()=>true, netState:()=>({online:true,pending:false}),
    loadShiftMonth:async()=>{} };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"阿哲",role:"editor"},{name:"阿美",role:"editor"},
      {name:"管理員",role:"boss"},{name:"HR小姐",role:"hr"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"管理員"); localStorage.setItem("ecdr_role", role||"boss");
}

// ══════════ ③ 剪輯成效：一個人只掃一次 ══════════
{ const vids=[];
  ["小葵","阿哲","阿美"].forEach(who=>{ for(let i=0;i<5;i++) vids.push(v_(who+i,{editor:who})); });
  reset(vids, "管理員","boss");
  // 數 outVideosOf 被叫幾次
  let calls=0; const real=outVideosOf;
  outVideosOf=function(...a){ calls++; return real.apply(this,a); };
  const h=viewOutput();
  outVideosOf=real;
  ok("三個剪輯 → 只掃三次（不是六次）", calls===3, calls);
  // 而且畫出來的東西不能少
  ok("每個人的卡片都還在", ["小葵","阿哲","阿美"].every(n=>h.includes(n)));
  ok("每個人都是 5 支", (h.match(/完成 5 支/g)||[]).length===3, h.match(/完成 \d+ 支/g));
  ok("篩選鈕的總數還是 15", /全部<\/span> <span class="vtab-n">15</.test(h), h.match(/vtab-n">\d+</g));
  ok("列數還是 15 列", (h.match(/data-label="審核"/g)||[]).length===15);
  ok("資料夾連結還是 15 個", (h.match(/rel="noopener noreferrer"/g)||[]).length===15); }

// 傳進來的清單真的被用到（不是傳了還自己重算）
{ reset([v_("A",{editor:"小葵"})], "管理員","boss");
  let calls=0; const real=outVideosOf;
  outVideosOf=function(...a){ calls++; return real.apply(this,a); };
  outPersonCard({name:"小葵",role:"editor"}, TODAY.slice(0,7), [v_("B",{editor:"小葵",rawName:"外面傳進來的"})]);
  outVideosOf=real;
  ok("有傳清單進來就不再自己掃一次", calls===0, calls);
  const h2=outPersonCard({name:"小葵",role:"editor"}, TODAY.slice(0,7), [v_("B",{editor:"小葵",rawName:"外面傳進來的"})]);
  ok("——而且畫的是傳進來的那一份", h2.includes("外面傳進來的"));
  // 沒傳就要自己掃（別的地方可能單獨用這張卡）
  let c2=0; const real2=outVideosOf;
  outVideosOf=function(...a){ c2++; return real2.apply(this,a); };
  outPersonCard({name:"小葵",role:"editor"}, TODAY.slice(0,7));
  outVideosOf=real2;
  ok("沒傳清單時自己掃（單獨用也不會壞）", c2===1, c2); }

// ══════════ ④ 員工視角底下不准打卡 ══════════
{ reset([], "管理員","boss");
  ok("正常情況打得了卡", (()=>{ WRITES=[]; clockIn("小葵"); return true; })());
  // 等非同步寫入送出
}
(async()=>{
  reset([], "管理員","boss");
  await clockIn("小葵");
  const normal=WRITES.filter(w=>w.startsWith("set shifts")).length;
  ok("沒有員工視角時：打卡照寫", normal>0, WRITES);

  reset([], "管理員","boss");
  VIEW_AS="小葵";
  const r=await clockIn("小葵");
  ok("員工視角底下：一筆都不准寫", WRITES.filter(w=>w.startsWith("set shifts")).length===0, WRITES);
  ok("員工視角底下：回傳 false（呼叫端才知道沒成功）", r===false, r);
  ok("員工視角底下：有跟使用者講為什麼", TOASTS.some(t=>/唯讀預覽|Read-only/.test(t)), TOASTS);
  VIEW_AS=null;

  // 三個寫入入口本來就擋著，這裡一起釘住，之後有人拆掉會紅
  { const body=(name)=>{ const L=APP.split("\n");
      const s=L.findIndex(l=>new RegExp("^(async )?function "+name+"\\b").test(l));
      if(s<0) return ""; let e=s+1; while(e<L.length && L[e]!=="}") e++; return L.slice(s,e+1).join("\n"); };
    ok("write() 有擋員工視角", /VIEW_AS/.test(body("write")));
    ok("writeAdmin() 有擋員工視角", /VIEW_AS/.test(body("writeAdmin")));
    ok("dbWrite() 有擋員工視角（走 dbBlocked）", /dbBlocked\(\)/.test(body("dbWrite")));
    ok("dbBlocked() 就是看 VIEW_AS", /VIEW_AS/.test(body("dbBlocked")));
    ok("clockIn() 也擋了（本來是唯一的漏網之魚）", /dbBlocked\(\)/.test(body("clockIn"))); }

  console.log(`\nv153③④（少掃一半＋補上打卡的守門）: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
