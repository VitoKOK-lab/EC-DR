// v186：設定頁的「資料備份」狀態卡
//
// 為什麼要有這張卡：備份跑在 Mac mini 上，狀態原本只看得到兩個地方——
// 終端機指令、還有那台機器上的 macOS 通知。老闆問「我在哪裡看得到？」
// 答案是：都看不到。他不會為了確認備份而去開終端機，人不在那台機器前也收不到通知。
//
// 所以 tools/backup.py 每天把結果回報到 meta/settings.backupStatus，
// 設定頁把它畫出來。這支測試釘住三件事：
//   ① 沒收到回報時要明講「還沒收到」，不能顯示成正常（假的安心比沒有更糟）
//   ② 剛備份完要顯示正常，而且筆數要看得到
//   ③ 超過 3 天沒更新要變成警告 —— 這是整張卡存在的理由
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const FB=fs.readFileSync(path.join(__dirname,"..","fb.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:390,innerHeight:844,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
function as(w,r){ localStorage.setItem("ecdr_user",w); localStorage.setItem("ecdr_role",r); }
function reset(){
  VIEW_AS=null; BRAND=""; FOLD_OPEN={}; viewEl.innerHTML=""; modalHTML=""; CAL_YM=null;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"麗君",role:"cs"},{name:"怡萍",role:"pick"},
                     {name:"Anna",role:"intl"},{name:"HR",role:"hr"},{name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
}

// 產生一個「N 天前」的台灣時間字串，格式跟 backup.py 寫進去的一致
function daysAgo(n){
  const t = new Date(Date.now()+288e5 - n*864e5);
  return t.toISOString().slice(0,19);
}
function withStatus(bs){
  reset(); as("管理員","boss");
  if(bs) STATE.settings.backupStatus = bs;
  return viewSettings();
}

// ══════════ ① 沒有回報 → 明講，不要裝沒事 ══════════
{ const h = withStatus(null);
  ok("**沒收到備份回報時明講「還沒收到」**（不能顯示成正常）",
     /還沒收到任何備份回報/.test(h) && !/資料備份正常/.test(h),
     (h.match(/🛟[^<]*/)||[])[0]);
  ok("沒有回報時不會謊稱正常", !/備份正常/.test(h)); }

// ══════════ ② 剛備份完 → 顯示正常與筆數 ══════════
{ const h = withStatus({at:daysAgo(0), docs:10601, covers:241, sizeMB:"32.6", ok:true});
  ok("**今天備份過 → 顯示「資料備份正常」**", /資料備份正常/.test(h));
  ok("**筆數要看得到**（10601）", /10601/.test(h));
  ok("封面張數也顯示", /241/.test(h));
  ok("今天的顯示「今天」", /（今天）/.test(h));
  ok("正常時不出現紅色警示", !/C0392B/.test(h)); }

{ const h = withStatus({at:daysAgo(1), docs:10601, covers:241});
  ok("昨天備份 → 仍算正常，顯示「昨天」", /資料備份正常/.test(h) && /（昨天）/.test(h)); }

{ const h = withStatus({at:daysAgo(3), docs:10601, covers:241});
  ok("3 天前 → 還在容忍範圍，不誤報", /資料備份正常/.test(h), (h.match(/（[^）]*）/)||[])[0]); }

// ══════════ ③ 停太久 → 一定要變警告（整張卡的存在意義）══════════
{ const h = withStatus({at:daysAgo(5), docs:10601, covers:241});
  ok("**5 天沒更新 → 顯示「可能停了」**", /資料備份可能停了/.test(h));
  ok("**警告要有紅色**（灰字警告等於沒警告）", /C0392B/.test(h));
  ok("要告訴使用者下一步怎麼查", /install-schedule\.sh --status/.test(h));
  ok("不會同時顯示正常", !/資料備份正常/.test(h)); }

{ const h = withStatus({at:daysAgo(90), docs:10601, covers:241});
  ok("90 天沒更新也是警告", /資料備份可能停了/.test(h)); }

// ══════════ ④ 時間字串壞掉 → 當成不正常，不能顯示成正常 ══════════
{ const h = withStatus({at:"這不是時間", docs:10601});
  ok("**時間解析不出來時當成不正常**（不能因為算不出來就說正常）",
     /資料備份可能停了/.test(h) && !/資料備份正常/.test(h)); }

// ══════════ ⑤ 只有老闆看得到設定頁 ══════════
{ reset(); as("Regina","manager");
  ok("經理人沒有設定分頁（所以看不到這張卡）", !myTabs().map(t=>t[0]).includes("settings"));
  reset(); as("管理員","boss");
  ok("管理員有設定分頁", myTabs().map(t=>t[0]).includes("settings")); }

console.log("");
console.log(pass+" passed, "+fail+" failed");
process.exit(fail?1:0);
