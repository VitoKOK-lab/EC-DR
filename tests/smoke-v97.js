// v97：剪片天數是「管理用」資訊 —— 剪輯自己的工作頁不再顯示，
//      改成只有管理員／經理人／人資看得到（團隊看板、儀表板、流程中控）。
const fs=require("fs"), path=require("path");
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
eval(src);
toast=()=>{};

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==';
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",rawLink:"http://d",cover:"",
  stage:"待處理",editor:"",claimedBy:"",claimedAt:"",assignedTo:"",scheduledDate:null,finishedAt:"",publishedLink:"",
  driveFolder:"",productUrl:"",note:"",mainType:"",source:"",refLink:"",durationMin:null,
  reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
// 小葵手上的三支：今天領的、昨天領的、五天前領的
const WIP=[
  v_("N1",{stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:D(0)+"T09:00:00"}),
  v_("N2",{stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:D(-1)+"T09:00:00"}),
  v_("N5",{stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:D(-5)+"T09:00:00"}),
];
function reset(videos){
  fields={}; modalHTML="";
  VID_LANG=""; VID_VIEW="raw"; VID_MODE="list"; VID_TAGS=new Set(); VID_Q=""; POOL_FILTER="all"; POOL_Q="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Anna",role:"intl",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Regina",role:"manager",pwHash:H},{name:"小美",role:"hr",pwHash:H},
                 {name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, logs:[], deletedVideos:[], shifts:{}, tasks:{}, videos:(videos||WIP).slice() };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; CAL_PLAT="tw"; CAL_YM=null; SHIFT_DATE=D(0);
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
// 那顆大的彩色天數方塊（工作頁用的）
const bigBadge=(h)=>/border-radius:5px;background:var\((--red|--amber|--accent)\);color:#fff;font-weight:900/.test(h);
// 小字版天數
const hasDay=(h)=>/第 \d+ 天|今天領/.test(h);
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ 天數怎麼算（沒動，先確認基準沒被弄壞）══
reset();
ok("今天領的是「新」", claimDayBadge(WIP[0])==="新");
ok("昨天領的是 2", claimDayBadge(WIP[1])==="2");
ok("五天前領的是 6", claimDayBadge(WIP[2])==="6");

// ══ 誰看得到 ══
reset(); as("小葵","editor");   ok("剪輯看不到", canSeeEditDays()===false);
reset(); as("Anna","intl");     ok("海外剪輯看不到", canSeeEditDays()===false);
reset(); as("管理員","boss");    ok("管理員看得到", canSeeEditDays()===true);
reset(); as("Regina","manager");ok("經理人看得到", canSeeEditDays()===true);
reset(); as("小美","hr");        ok("人資看得到", canSeeEditDays()===true);
// 員工視角：currentRole() 本來就會解析成被預覽員工的角色，所以看剪輯＝看不到
reset(); as("管理員","boss"); VIEW_AS="小葵";
ok("員工視角看剪輯 → 跟剪輯自己看到的一樣（沒有天數）", canSeeEditDays()===false);
// 但被預覽的人若已從名單移除，currentRole() 會退回登入者自己的角色（boss）——
// 那樣預覽出來的畫面就跟員工實際看到的不一樣了，所以 canSeeEditDays 另外擋一次 VIEW_AS
reset(); as("管理員","boss"); VIEW_AS="已離職的人";
ok("預覽已不在名單上的人，也還是照員工的規格顯示（不會露出管理資訊）", canSeeEditDays()===false);

// ══ 剪輯自己的工作頁：天數方塊不見了 ══
reset(); as("小葵","editor"); CUR_TAB="work";
{ const w=viewWork();
  ok("剪輯的工作頁沒有那顆天數方塊", !bigBadge(w));
  ok("剪輯的工作頁也沒有小字天數", !hasDay(w));
  ok("三支影片本身還在（只是不標天數）",
     w.includes("editVideo('N1')")&&w.includes("editVideo('N2')")&&w.includes("editVideo('N5')"));
  ok("三顆按鈕都還在（編輯內容／完成／退回）",
     w.includes("編輯內容") && w.includes("unclaimVid('N1')") && w.includes("finishWork('N1')")); }
reset(); as("Anna","intl"); CUR_TAB="work";
ok("海外剪輯的工作頁也沒有天數", !bigBadge(viewWork()) && !/d\d+|New<\/span>/.test(viewWork().split("tact")[1]||""));

// ══ 主管與人資看得到 ══
reset(); as("管理員","boss"); CUR_TAB="team";
{ const t=viewTeam();
  ok("[管理員] 團隊看板標了天數", hasDay(t));
  ok("[管理員] 今天領的標「今天領」", t.includes("今天領"));
  ok("[管理員] 第 2 天標得出來", t.includes("第 2 天"));
  ok("[管理員] 第 6 天標得出來", t.includes("第 6 天")); }
reset(); as("Regina","manager"); CUR_TAB="team";
ok("[經理人] 團隊看板標了天數", hasDay(viewTeam()));
reset(); as("小美","hr"); CUR_TAB="team";
ok("[人資] 團隊看板標了天數", hasDay(viewTeam()));
reset(); as("小葵","editor"); CUR_TAB="team";
ok("[剪輯] 團隊看板看得到，但不標天數（剪輯也有這個分頁）", !hasDay(viewTeam()));
reset(); as("Anna","intl"); CUR_TAB="team";
ok("[海外剪輯] 團隊看板也不標天數", !hasDay(viewTeam()));
reset(); as("管理員","boss"); CUR_TAB="dashboard";
ok("[管理員] 儀表板的進行中也標了天數", hasDay(viewDashboard()));
reset(); as("Regina","manager"); CUR_TAB="flow";
ok("[經理人] 流程中控本來就有天數（沒被改掉）", /第\d+天|>新</.test(viewFlow()));

// ══ 顏色警示還在 ══
reset(); as("管理員","boss"); CUR_TAB="team";
{ const t=viewTeam();
  ok("第 6 天是紅色（卡住了）", /color:var\(--red\);font-weight:700">第 6 天/.test(t));
  ok("第 2 天是琥珀色（開始拖了）", /color:var\(--amber\);font-weight:700">第 2 天/.test(t));
  ok("今天領的是淡的（正常，不用警示）", /color:var\(--muted\);font-weight:400">今天領/.test(t)); }

// ══ 只標「剪輯中」的 ══
reset([v_("F1",{stage:"已完成",editor:"小葵",claimedBy:"小葵",claimedAt:D(-3)+"T09:00:00",
  finishedAt:D(0)+"T15:00:00",publishedLink:"http://p"})]);
as("管理員","boss");
ok("已完成的不標天數（那是完成天數，另外一欄）", daySmall(STATE.videos[0])==="");
reset(); as("管理員","boss");
ok("沒帶影片進來就回空字串，不會噴錯", daySmall(null)==="" && daySmall(undefined)==="");

// ══ 海外主管看到英文 ══
reset(); as("Anna","intl");
ok("intl 角色本來就看不到天數，所以不用擔心中文外洩", daySmall(WIP[1])==="");

// ══ render 不炸 ══
[["管理員","boss","dashboard"],["管理員","boss","team"],["Regina","manager","flow"],
 ["Regina","manager","team"],["小美","hr","team"],["小葵","editor","work"],
 ["小葵","editor","team"],["Anna","intl","work"]].forEach(([u,r,tab])=>{
  reset(); as(u,r); CUR_TAB=tab;
  try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
