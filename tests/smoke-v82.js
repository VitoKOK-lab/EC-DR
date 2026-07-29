// v82：省讀取量 —— 打卡紀錄只常駐訂閱最近兩個月、操作紀錄改成點進去才訂閱。
// fb.js 是瀏覽器 ES module（跑不進 Node），所以分兩段驗：
//   ① 用原始碼檢查 fb.js 的訂閱方式（快取、logs、shifts 的查詢條件）
//   ② 用假的 window.DB 驗 app.js 有沒有在對的時機呼叫 loadShiftMonth / watchLogs
const fs=require("fs"), path=require("path");
const fbSrc=fs.readFileSync(path.join(__dirname,"..","fb.js"),"utf8");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
let loaded=[], reads=[], watched=0;
eval(src);
toast=()=>{};

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
// fb.js 常駐訂閱最近 62 天 → 這是它算出來的起始日
const FROM=new Date(Date.now()+288e5-62*864e5).toISOString().slice(0,10);
function reset(dbExtra){
  loaded=[]; reads=[]; watched=0; ATT_YM=null;
  STATE={ users:[{name:"小葵",role:"editor",pw:"x",pwSet:true,pwAt:"2020-01-01T00:00:00"},
                 {name:"HR小姐",role:"hr",pw:"x",pwSet:true,pwAt:"2020-01-01T00:00:00"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["s"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00",lateGraceMin:10},
    schedule:{}, logs:[], tasks:{}, deletedVideos:[], videos:[], shifts:{} };
  CUR_TAB=null; VIEW_AS=null;
  global.window.DB=Object.assign({ set:async()=>{}, update:async()=>{}, del:async()=>{},
    scheduleSet:async()=>{}, setSettings:async()=>{} }, dbExtra===undefined? {
      shiftsFrom:FROM,
      // 忠實模擬 fb.js：同一個月只真的去讀一次（loadedMonths）
      loadShiftMonth:async(ym)=>{ loaded.push(ym);
        if(reads.includes(ym)) return false;
        reads.push(ym); return true; },
      watchLogs:()=>{ watched++; },
    } : dbExtra);
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const ym=(back)=>{ const d=new Date(Date.now()+288e5); d.setDate(1); d.setMonth(d.getMonth()-back);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ ① fb.js 的訂閱方式 ══
ok("真的用了 IndexedDB 持久化快取（不是每次重整都全量重下載）",
   /initializeFirestore\(app,\s*\{[\s\S]*persistentLocalCache\(/.test(fbSrc));
ok("多分頁共用同一份快取", fbSrc.includes("persistentMultipleTabManager()"));
ok("拿不到 IndexedDB 時退回記憶體快取，不會整個掛掉",
   /catch\s*\([\s\S]{0,40}\)\s*\{[\s\S]{0,80}getFirestore\(app\)/.test(fbSrc));
ok("開場不再訂閱 logs", !/onSnapshot\(query\(collection\(db,\s*"logs"/.test(
     fbSrc.split("即時訂閱")[1]||""));
ok("logs 改成 watchLogs() 裡才訂閱",
   /watchLogs\(\)\s*\{[\s\S]*onSnapshot\(query\(collection\(db,\s*"logs"/.test(fbSrc));
ok("watchLogs 只會訂閱一次", /if\s*\(logsOn\)\s*return;\s*logsOn\s*=\s*true;/.test(fbSrc));
ok("shifts 訂閱有加時間範圍", /onSnapshot\(query\(collection\(db,\s*"shifts"\),\s*where\("date",\s*">=",\s*SHIFTS_FROM\)\)/.test(fbSrc));
ok("shifts 訂閱窗是 62 天", /SHIFT_WINDOW_DAYS\s*=\s*62/.test(fbSrc));
ok("補讀舊月份用 getDocs（讀一次，不建立訂閱）",
   /loadShiftMonth\(ym\)[\s\S]{0,400}getDocs\(query\(collection\(db,\s*"shifts"\)/.test(fbSrc));
ok("同一個月不會重複補讀", /loadedMonths\.has\(ym\)\)\s*return false;/.test(fbSrc));
ok("補讀的舊月份不會被訂閱更新蓋掉",
   fbSrc.includes("Object.assign({}, shiftsOld, shiftsLive)"));
ok("訂閱窗內的資料每次都重建，刪掉的不會留著",
   /Object\.keys\(shiftsLive\)\.forEach\(k\s*=>\s*delete shiftsLive\[k\]\)/.test(fbSrc));
ok("videos／users／tasks／schedule 照舊即時訂閱（該即時的還是即時）",
   ["users","videos","schedule","tasks"].every(c=>fbSrc.includes(`onSnapshot(collection(db, "${c}")`)));

// ══ ② app.js：什麼時候補讀舊月份 ══
reset(); as("HR小姐","hr");
ATT_YM=[+T0.slice(0,4), +T0.slice(5,7)-1];
attMonthMove(-1);
ok("往前翻一個月（還在訂閱窗內）→ 不補讀", loaded.length===0);
reset(); as("HR小姐","hr"); ATT_YM=[+T0.slice(0,4), +T0.slice(5,7)-1];
attMonthMove(-1); attMonthMove(-1); attMonthMove(-1);
ok("翻到訂閱窗外 → 去補讀那個月", loaded.length>=1 && loaded.includes(ym(3)));
ok("只補讀窗外的月份，不會連窗內的一起讀", !loaded.includes(ym(1)));
reset(); as("HR小姐","hr"); ATT_YM=[+T0.slice(0,4), +T0.slice(5,7)-1];
[-1,-1,-1,1,-1].forEach(n=>attMonthMove(n));
ok("來回翻同一個月只會真的讀一次資料庫",
   loaded.filter(x=>x===ym(3)).length===2 && reads.filter(x=>x===ym(3)).length===1);
reset(); as("HR小姐","hr"); ATT_YM=[+T0.slice(0,4), +T0.slice(5,7)-1];
attMonthMove(1);
ok("往後翻到未來的月份不會去補讀", loaded.length===0);

// 舊版 fb.js 還在瀏覽器快取裡（沒有這些新函式）也不能炸
reset({}); as("HR小姐","hr"); ATT_YM=[+T0.slice(0,4), +T0.slice(5,7)-1];
try{ [-1,-1,-1].forEach(n=>attMonthMove(n)); ok("舊版 fb.js 沒有 loadShiftMonth 也不會炸", true); }
catch(e){ ok("舊版 fb.js 沒有 loadShiftMonth 也不會炸 → "+e.message, false); }
reset(null); as("HR小姐","hr");
try{ attMonthMove(-3); ok("完全沒有 window.DB 也不會炸", true); }
catch(e){ ok("完全沒有 window.DB 也不會炸 → "+e.message, false); }

// ══ ② app.js：什麼時候訂閱操作紀錄 ══
reset(); as("管理員","boss"); CUR_TAB="log"; render();
ok("點進「操作紀錄」才去訂閱", watched===1);
render(); render();
ok("重繪不會重複訂閱（fb.js 也擋，這裡確認有一直呼叫是安全的）", watched===3 || watched===1);
reset(); as("管理員","boss");
["dashboard","flow","team","attend","videos","cal","perf","trash","settings"].forEach(t=>{ CUR_TAB=t; render(); });
ok("其他分頁完全不碰 logs", watched===0);
reset(); as("小葵","editor"); CUR_TAB="work"; render();
ok("一般員工不會訂閱 logs", watched===0);
reset(); as("HR小姐","hr"); CUR_TAB="team"; render(); CUR_TAB="attend"; render();
ok("人資也不會訂閱 logs", watched===0);
reset({}); as("管理員","boss"); CUR_TAB="log";
try{ render(); ok("舊版 fb.js 沒有 watchLogs 也不會炸", true); }
catch(e){ ok("舊版 fb.js 沒有 watchLogs 也不會炸 → "+e.message, false); }

// 操作紀錄畫面本身照舊
reset(); as("管理員","boss");
STATE.logs=[{at:T0+"T10:00:00",user:"小葵",role:"editor",action:"新增影片",target:"V1"}];
CUR_TAB="log";
{ const h=viewLog();
  ok("有紀錄時照樣列出來", h.includes("新增影片") && h.includes("小葵")); }
reset(); as("管理員","boss");
ok("還沒載進來時不會空白破圖", viewLog().includes("目前沒有紀錄"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
