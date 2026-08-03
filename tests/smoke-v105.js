// v105：跨午夜不會蓋錯日期。
// 以前 today 是 const，載入時算一次就固定 —— 分頁掛著跨過午夜再交辦，
// 那筆會被蓋上「前一天」，隔天員工在自己頁面上就找不到。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, active=null;
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){ return active; },
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;

// ── 假時鐘：把「現在」釘在指定的台灣時間上 ──
const REAL_NOW=Date.now;
let CLOCK=null;                       // null＝用真實時間
Date.now=()=> CLOCK==null?REAL_NOW():CLOCK;
// 台灣時間字串 → epoch ms（台灣是 UTC+8）
const twAt=(s)=> Date.parse(s+"Z")-288e5;

let calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
function reset(){
  calls=[]; toasts=[]; fields={}; modalHTML=""; active=null;
  STATE={ users:[{name:"小葵",role:"editor",craft:"both"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:[],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  CUR_TAB="flow"; VIEW_AS=null; POOL_FILTER="all"; POOL_Q="";
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
  localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
}
// 把時鐘釘在某個台灣時間，並讓 today 停在「那天之前」的狀態（模擬分頁一直掛著）
function pinAt(ts, staleDay){ CLOCK=twAt(ts); today=staleDay; yesterday=staleDay; }
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{
  // ══ ① refreshToday 會重算 ══
  reset(); pinAt("2026-08-03T00:05:00","2026-08-02");
  ok("跨午夜後 refreshToday 回報有跨日", refreshToday()===true);
  ok("today 被更新成新的一天", today==="2026-08-03");
  ok("yesterday 也跟著更新", yesterday==="2026-08-02");
  ok("同一天內再呼叫回報沒跨日", refreshToday()===false);

  // ══ ② 跨午夜交辦：日期要蓋新的那天（這就是原本的災情）══
  reset(); pinAt("2026-08-03T00:05:00","2026-08-02");
  fields.fa_0="半夜交辦的事";
  await flowAssign(0,"小葵"); await wait(30);
  { const t=(calls.find(c=>c[0]==="set"&&c[1]==="tasks")||[])[3];
    ok("流程中控交辦：蓋的是 08-03 不是 08-02", !!t && t.date==="2026-08-03");
    ok("交辦內容與對象正確", t && t.user==="小葵" && t.title==="半夜交辦的事" && t.assignedBy==="Regina"); }

  reset(); pinAt("2026-08-03T00:05:00","2026-08-02");
  fields.asg_who="小葵"; fields.asg_txt="指派也一樣"; fields.asg_contact="";
  await assignTaskSel(); await wait(30);
  ok("指派工作：也蓋 08-03", ((calls.find(c=>c[0]==="set"&&c[1]==="tasks")||[])[3]||{}).date==="2026-08-03");

  reset(); pinAt("2026-08-03T00:05:00","2026-08-02");
  localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
  fields.wp_newtask="自己排的"; fields.wp_contact=""; fields.wp_date="";
  await createTask(); await wait(30);
  ok("自己新增工作：也蓋 08-03", ((calls.find(c=>c[0]==="set"&&c[1]==="tasks")||[])[3]||{}).date==="2026-08-03");

  reset(); pinAt("2026-08-03T00:05:00","2026-08-02");
  await clockIn("小葵"); await wait(30);
  ok("打卡：也蓋 08-03", ((calls.find(c=>c[0]==="set"&&c[1]==="shifts")||[])[3]||{}).date==="2026-08-03");

  // ══ ③ render 會補正日期 ══
  reset(); pinAt("2026-08-03T00:05:00","2026-08-02");
  render();
  ok("任何重繪都會把 today 補正", today==="2026-08-03");

  // ══ ④ 午夜守衛：會主動翻頁 ══
  reset(); pinAt("2026-08-03T00:05:00","2026-08-02");
  { let rendered=0; const _r=render; render=()=>{rendered++;};
    midnightWatch();
    ok("跨日了就主動重繪一次", rendered===1);
    ok("重繪後 today 是新的一天", today==="2026-08-03");
    render=_r; }

  reset(); CLOCK=twAt("2026-08-03T10:00:00"); today="2026-08-03"; yesterday="2026-08-02";
  { let rendered=0; const _r=render; render=()=>{rendered++;};
    midnightWatch();
    ok("沒跨日就不會亂重繪", rendered===0);
    render=_r; }

  // ══ ⑤ 午夜守衛不打斷手上的事 ══
  reset(); pinAt("2026-08-03T00:05:00","2026-08-02");
  { let rendered=0; const _r=render; render=()=>{rendered++;};
    modalHTML="<div class='modal'>編輯中</div>";
    midnightWatch();
    ok("彈窗開著：先不翻頁", rendered===0);
    ok("彈窗開著時 today 維持舊值（下一輪再翻）", today==="2026-08-02");
    modalHTML="";
    midnightWatch();
    ok("彈窗關掉之後就翻得動", rendered===1 && today==="2026-08-03");
    render=_r; }

  reset(); pinAt("2026-08-03T00:05:00","2026-08-02");
  { let rendered=0; const _r=render; render=()=>{rendered++;};
    active={tagName:"TEXTAREA"};
    midnightWatch();
    ok("正在打字：先不翻頁", rendered===0 && today==="2026-08-02");
    active=null;
    midnightWatch();
    ok("打完字之後就翻得動", rendered===1 && today==="2026-08-03");
    render=_r; }

  // 就算守衛先讓步，寫入時仍然會補正 —— 資料不會蓋錯天
  reset(); pinAt("2026-08-03T00:05:00","2026-08-02");
  modalHTML="<div class='modal'>編輯中</div>";
  midnightWatch();
  fields.fa_0="彈窗開著時交辦";
  await flowAssign(0,"小葵"); await wait(30);
  ok("守衛讓步時，寫入照樣蓋對日期", ((calls.find(c=>c[0]==="set"&&c[1]==="tasks")||[])[3]||{}).date==="2026-08-03");

  // ══ ⑥ 每日匯報的預設日期跟著翻 ══
  reset(); pinAt("2026-08-03T00:05:00","2026-08-02");
  SHIFT_DATE="2026-08-02";                       // 沒被手動改過（等於當時的 yesterday）
  { const _r=render; render=()=>{}; midnightWatch(); render=_r; }
  ok("沒手動改過：每日匯報預設跟著翻到新的昨天", SHIFT_DATE==="2026-08-02" && yesterday==="2026-08-02");

  reset(); pinAt("2026-08-03T00:05:00","2026-08-02");
  SHIFT_DATE="2026-07-20";                       // 使用者自己挑了別天
  { const _r=render; render=()=>{}; midnightWatch(); render=_r; }
  ok("手動挑過日期就不要亂動他", SHIFT_DATE==="2026-07-20");

  // ══ ⑦ today 不再是寫死的常數 ══
  ok("原始碼裡 today 不是 const（否則跨午夜又會壞）",
     !/^const\s+today\s*=/m.test(fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")));

  CLOCK=null;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
