// v106：出勤異常說明先關掉。
// 上下班規則還沒定案，不要拿「遲到早退」去煩員工 —— 但打卡時間與登入的電子紀錄
// （裝置／UA／手機與否／GPS）照常記錄，人資的出勤頁照常看得到，規則定好再開。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, boxes={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(boxes[id]!==undefined){ const e=el(); e.checked=boxes[id]; return e; }
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f();
Object.defineProperty(global,"navigator",{configurable:true,writable:true,
  value:{onLine:true,userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148"}});
global.confirm=()=>true; global.prompt=()=>null;
let calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==';
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
// 昨天遲到 35 分、又忘了打下班（系統補）→ 標準的「出勤異常」
const badShift=(user,d)=>({id:user+"__"+d, user, date:d, clockIn:d+"T09:35:00", clockOut:d+"T18:00:00",
  autoOut:true, issueNote:"", inDev:"dev-1", inDevUA:"iPhone", inMobile:true, inNewDev:false, inGeo:null});

function reset(settings){
  calls=[]; toasts=[]; fields={}; boxes={}; modalHTML="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"小美",role:"cs",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"HR小姐",role:"hr",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"管理員",role:"boss"}],
    settings:Object.assign({dailyTarget:4,videoTags:[],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00",lateGraceMin:10,pcOnly:false}, settings||{}),
    schedule:{}, tasks:{}, logs:[], deletedVideos:[], videos:[],
    shifts:{ [badShift("小葵",D(-1)).id]:badShift("小葵",D(-1)),
             [badShift("小美",D(-1)).id]:badShift("小美",D(-1)) } };
  CUR_TAB="work"; VIEW_AS=null; POOL_FILTER="all"; POOL_Q=""; WORK_ZONE="shopee"; ATT_YM=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async(p)=>{calls.push(["settings",p]);},
    arrayAdd:async()=>{}, arrayDel:async()=>{}, bump:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{
  // ══ ① 預設：員工畫面看不到「出勤異常待說明」══
  reset(); as("小葵","editor");
  ok("資料本身確實算異常（測資有效）", attIssues(STATE.shifts["小葵__"+D(-1)]).length>0);
  ok("預設是關著的", attIssueAskOn()===false);
  ok("剪輯的工作頁沒有出勤異常卡", !viewWork().includes("出勤異常待說明"));
  ok("workIssueCard 直接回空字串", workIssueCard()==="");
  as("小美","cs");
  ok("員工（不剪片）的工作頁也沒有", !viewWork().includes("出勤異常待說明"));

  // 舊資料沒有這個欄位時也要當成關著（不能因為 undefined 就跑出來）
  reset({attIssueAsk:undefined}); as("小葵","editor");
  ok("設定裡沒這個欄位＝關著", !viewWork().includes("出勤異常待說明"));
  reset({attIssueAsk:false}); as("小葵","editor");
  ok("明確設 false 也是關著", !viewWork().includes("出勤異常待說明"));

  // ══ ② 打開之後要回得來（規則定好再開）══
  reset({attIssueAsk:true}); as("小葵","editor");
  { const w=viewWork();
    ok("打開後員工看得到異常卡", w.includes("出勤異常待說明"));
    ok("卡片裡列得出那天的異常", w.includes("遲到") && w.includes("saveIssueNote(")); }

  // ══ ③ 關著也照常記錄：打卡時間＋登入的電子紀錄 ══
  reset(); as("小葵","editor");
  await clockIn("小葵"); await wait(30);
  { const s=(calls.find(c=>c[0]==="set"&&c[1]==="shifts")||[])[3]||{};
    ok("照常寫入上班時間", !!s.clockIn && s.date===today && s.user==="小葵");
    ok("照常記錄裝置代碼", !!s.inDev);
    ok("照常記錄瀏覽器 UA", !!s.inDevUA);
    ok("照常記錄是不是手機", s.inMobile===true);
    ok("照常記錄是不是沒看過的裝置", typeof s.inNewDev==="boolean");
    ok("GPS 欄位留著（拿得到再補寫）", "inGeo" in s); }

  // ══ ④ 人資／管理員的出勤頁不受影響 ══
  reset(); as("HR小姐","hr"); CUR_TAB="attend";
  { const a=viewAttend();
    ok("人資的出勤頁照常算遲到", a.includes("遲到"));
    ok("人資照常看得到異常與說明區", a.includes("出勤異常與說明")); }
  reset(); as("管理員","boss"); CUR_TAB="attend";
  ok("管理員的出勤頁也照常", viewAttend().includes("遲到"));

  // ══ ⑤ 設定頁：開關存得起來 ══
  reset(); as("管理員","boss");
  { const st=viewSettings();
    ok("設定頁有這個開關", st.includes('id="set_attask"'));
    ok("預設沒有勾起來", !/id="set_attask" checked/.test(st));
    ok("有說明關著時仍然會記錄", st.includes("照常記錄")); }
  reset({attIssueAsk:true}); as("管理員","boss");
  ok("開著時設定頁是勾起來的", /id="set_attask" checked/.test(viewSettings()));

  reset(); as("管理員","boss");
  fields.set_wstart="09:00"; fields.set_wend="18:00"; fields.set_grace="10";
  fields.set_attstart=""; fields.set_olat=""; fields.set_olng=""; fields.set_tpl=""; fields.set_dataen="";
  fields.set_daily="4"; fields.set_horizon="30"; fields.set_shop=""; fields.set_pw=""; fields.set_plat="";
  boxes.set_pconly=false; boxes.set_attask=true;
  await saveSettings(); await wait(30);
  ok("勾起來存得進去", ((calls.find(c=>c[0]==="settings")||[])[1]||{}).attIssueAsk===true);
  reset({attIssueAsk:true}); as("管理員","boss");
  fields.set_wstart="09:00"; fields.set_wend="18:00"; fields.set_grace="10";
  fields.set_attstart=""; fields.set_olat=""; fields.set_olng=""; fields.set_tpl=""; fields.set_dataen="";
  fields.set_daily="4"; fields.set_horizon="30"; fields.set_shop=""; fields.set_pw=""; fields.set_plat="";
  boxes.set_pconly=false; boxes.set_attask=false;
  await saveSettings(); await wait(30);
  ok("取消勾選也存得進去", ((calls.find(c=>c[0]==="settings")||[])[1]||{}).attIssueAsk===false);

  // ══ ⑥ render 不炸 ══
  reset();
  [["小葵","editor","work"],["小美","cs","work"],["HR小姐","hr","attend"],["管理員","boss","settings"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
