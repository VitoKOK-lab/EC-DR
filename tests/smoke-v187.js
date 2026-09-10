// v187：警示要「一看就知道」
//
// 老闆：「這個還沒審或是還沒剪好，沒有商品連結，要明顯，一看就知道，這裡要警示」
//
// 原本只在片名後面掛一顆淡底淡字的小藥丸 —— 一個月 98 列滑下來，那顆藥丸跟
// 其他字長得一樣重，等於沒有。月曆格子上也只有一個小數字，跟格子裡本來就有的
// 「3/4」「缺1」混在一起，看不出那是警告。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,open:false,
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
global.window={addEventListener(){},innerWidth:1400,innerHeight:900,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const T0=FROZEN;
const D=(n)=>new Date(new Date(T0+"T12:00:00Z").getTime()+n*864e5).toISOString().slice(0,10);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
function as(w,r){ localStorage.setItem("ecdr_user",w); localStorage.setItem("ecdr_role",r); }
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"文案",
  rawLink:"https://drive.google.com/drive/folders/RAW",cover:"",stage:"已完成",editor:"小葵",claimedBy:"小葵",
  assignedTo:"",scheduledDate:T0,publishTime:"15:00",finishedAt:T0+"T10:00:00",publishedLink:"",
  driveFolder:"https://drive.google.com/drive/folders/FAM",productUrl:"",note:"",mainType:"",source:"官方IP",
  refLink:"",reviewStatus:"通過",locale:"",channel:"",origLang:"",account:"",tags:[],products:[],
  usageHistory:[],metrics:[]},o||{});
function reset(vids){
  VIEW_AS=null; BRAND=""; FOLD_OPEN={}; viewEl.innerHTML=""; modalHTML=""; CAL_YM=null; CAL_PLAT="tw"; CAL_MODE="list";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}),
    loadShiftMonth:async()=>{} };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:vids||[] };
  LAST_RAW=raw; STATE=decorate(raw);
}
// 抓某一支片那一列的 <tr ...>
const rowOf=(h,name)=>{ const i=h.indexOf(name); if(i<0) return "";
  const s=h.lastIndexOf("<tr",i); return h.slice(s, h.indexOf(">",s)+1); };

// ══════════ ① 清單：整列標出來，不是只掛一顆小藥丸 ══════════
{ reset([ v_("A",{name:"還沒審的片",reviewStatus:"",scheduledDate:D(1)}) ]);
  as("Regina","manager");
  const h=viewCal();
  ok("（前提）列得出這一支", h.includes("還沒審的片"));
  ok("**還沒審 → 整列標黃**", /class="[^"]*cl-warn/.test(rowOf(h,"還沒審的片"))
     && !/late/.test(rowOf(h,"還沒審的片")), rowOf(h,"還沒審的片")); }
{ reset([ v_("B",{name:"還沒剪好的片",stage:"剪輯中",finishedAt:"",reviewStatus:"",scheduledDate:D(1)}) ]);
  as("Regina","manager");
  const h=viewCal();
  ok("**還沒剪好 → 也標出來**", /cl-warn/.test(rowOf(h,"還沒剪好的片")), rowOf(h,"還沒剪好的片")); }
{ reset([ v_("C",{name:"過期還沒剪的片",stage:"剪輯中",finishedAt:"",reviewStatus:"",scheduledDate:D(-2)}) ]);
  as("Regina","manager"); CAL_YM=null;
  const h=viewCal();
  ok("**過期的標紅（比黃色更重）**", /cl-warn late/.test(rowOf(h,"過期還沒剪的片")),
     rowOf(h,"過期還沒剪的片")); }
{ reset([ v_("D",{name:"缺商品的片",tags:["寵粉"],scheduledDate:D(1)}) ]);
  as("Regina","manager");
  const h=viewCal();
  ok("**沒有商品連結 → 也整列標出來**", /cl-warn miss/.test(rowOf(h,"缺商品的片")),
     rowOf(h,"缺商品的片")); }
{ reset([ v_("E",{name:"沒問題的片",scheduledDate:D(1)}) ]);
  as("Regina","manager");
  const h=viewCal();
  ok("（對照）沒問題的那一列不標", !/cl-warn/.test(rowOf(h,"沒問題的片")), rowOf(h,"沒問題的片")); }
{ ok("CSS：三種顏色都定義了（紅＝來不及、黃＝還沒審、金＝缺商品）",
     /tr\.cl-warn\{/.test(HTML) && /tr\.cl-warn\.late\{/.test(HTML) && /tr\.cl-warn\.miss\{/.test(HTML),
     (HTML.match(/tr\.cl-warn[^{]*\{/g)||[]));
  ok("**左邊那條帶子用 box-shadow 不用 border**（border 會把三欄的寬度推掉）",
     /tr\.cl-warn>td:first-child\{box-shadow:inset/.test(HTML)); }

// ══════════ ② 月曆格子：一眼看得出哪幾天有問題 ══════════
{ reset([ v_("A",{name:"還沒審的片",reviewStatus:"",scheduledDate:D(1)}) ]);
  as("Regina","manager"); CAL_MODE="grid"; CAL_YM=null;
  const g=viewCal();
  ok("**角標寫得出是警告（⚠ 加數字）**", /class="calwarn[^"]*"[^>]*>⚠ 1</.test(g),
     (g.match(/calwarn[^>]*>[^<]*/g)||[]).slice(0,3));
  ok("**整格描一圈色邊**（角標太小容易被略過）", /class="day [^"]*haswarn/.test(g),
     (g.match(/class="day [^"]*"/g)||[]).filter(x=>x.includes("haswarn")).slice(0,2));
  ok("滑鼠移上去看得到是什麼問題", /title="[^"]*還沒審[^"]*"/.test(g)); }
{ reset([ v_("C",{name:"過期的片",stage:"剪輯中",finishedAt:"",reviewStatus:"",scheduledDate:D(-2)}) ]);
  as("Regina","manager"); CAL_MODE="grid"; CAL_YM=null;
  const g=viewCal();
  ok("**過期那天描紅邊**", /class="day [^"]*haswarn late/.test(g),
     (g.match(/class="day [^"]*"/g)||[]).filter(x=>x.includes("haswarn")).slice(0,2)); }
{ reset([ v_("E",{name:"沒問題的片",scheduledDate:D(1)}) ]);
  as("Regina","manager"); CAL_MODE="grid"; CAL_YM=null;
  const g=viewCal();
  ok("（對照）沒問題的那天不描邊也不掛角標",
     !/haswarn/.test(g) && !/calwarn/.test(g)); }
{ ok("CSS：描邊的樣式在", /\.day\.haswarn\{/.test(HTML) && /\.day\.haswarn\.late\{/.test(HTML));
  // ⚠️ 只數**呼叫**，不要把 `function calDayWarn(ds){` 這個定義也算進去
  ok("**同一天只算一次**（算兩次是白費，一個月三十格）",
     (APP.match(/(?<!function )calDayWarn\(ds\)/g)||[]).length===1,
     (APP.match(/.{0,12}calDayWarn\(ds\)/g)||[])); }

// ══════════ ③ 缺什麼的小藥丸改成實心 ══════════
{ ok("**缺料的藥丸是實心的**（淡底淡字在一整頁文字裡看不出是警告）",
     /\.misspill\{[^}]*background:var\(--gold\)/.test(HTML) && /\.misspill\{[^}]*color:#fff/.test(HTML),
     (HTML.match(/\.misspill\{[^}]*\}/)||[])[0]);
  ok("過期的那種是紅的", /\.misspill\.late\{[^}]*background:var\(--red\)/.test(HTML)); }

// ══════════ ④ 沒有把別的弄壞 ══════════
{ let bad=null;
  [["Regina","manager"],["小葵","editor"]].forEach(([w,r])=>{
    ["grid","list"].forEach(m=>{
      reset([ v_("A",{reviewStatus:"",scheduledDate:D(1)}), v_("B",{scheduledDate:D(2)}) ]);
      as(w,r); CAL_MODE=m; CAL_YM=null;
      try{ viewCal(); }catch(e){ bad=w+"/"+m+": "+e.message; } }); });
  ok("兩種身分、兩種檢視都畫得出來", !bad, bad);
  CAL_MODE="grid"; }

console.log(`\nv187（警示要一看就知道）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
