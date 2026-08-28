// v150：團隊看板的成效可以往前翻月份。
//
// 本來 viewTeam 把月份寫死成當月（today.slice(0,7)）。月底檢討、算獎金、跟上個月比
// 都需要看前一個月，所以把月份變成可選的 —— 底下的 teamMonthStat／teamHeatCard
// 本來就吃 ym 參數，所以真正要動的只有「誰決定 ym」。
//
// 三件要守住的事：
//   ① 團隊看板全公司都看得到，規矩是「除了篩選之外不能操作任何東西」
//      （smoke-v55／v66／v67／v70／v83 都在釘）。所以月份用**下拉**不用按鍵。
//   ② 上面那條速覽是「現在的狀況」，不能跟著往前翻的月份跑。
//   ③ 月份清單**不能讀 STATE.videos** —— 行銷／客服／出貨／人資根本不下載影片
//      （v138 的效能修正），讀了就會打破「不下載也長一樣」那個保證。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(fields[id]!=null) e.value=fields[id];
    if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

// 月份工具：今天是 today（由 app.js 算出來的台灣日期）
const CUR=today.slice(0,7);
const monthAgo=(n)=>{ const [y,m]=CUR.split("-").map(Number); const d=new Date(y,m-1-n,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const PREV=monthAgo(1), PREV2=monthAgo(2);
const dayIn=(ym,d)=>`${ym}-${String(d).padStart(2,"0")}`;

let renders=0;
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"片"+id,videoCopy:"稿",nameEn:"",videoCopyEn:"",
  rawLink:"",lib:"",stage:"已上片",published:true,publishedLink:"http://x",editor:"泓儒",claimedBy:"泓儒",
  claimedAt:"",finishedAt:"",driveFolder:"http://d",reviewStatus:"",locale:"",channel:"",origLang:"",
  account:"",sourceVideoId:"",cover:"",remakes:[],tags:[],products:[],usageHistory:[],metrics:[],
  scheduledDate:null},o||{});
const sh=(user,date)=>({id:user+"__"+date, user, date, clockIn:date+"T09:00:00", clockOut:date+"T18:00:00"});
const tk=(id,user,date,done)=>({id, user, date, title:"工作"+id, done:!!done, ack:true, report:"好了", createdAt:date+"T09:00:00"});

function reset(opt){
  opt=opt||{};
  modalHTML=""; viewEl.innerHTML=""; fields={}; renders=0; TEAM_YM=null;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}),
    shiftsFrom:CUR+"-01", loadShiftMonth:async(ym)=>{ loaded.push(ym); } };
  const U=(name,role)=>({name, role, pwSet:true, pwHash:"pbkdf2$1$AA==$AA==", pwAt:"2020-01-01T00:00:00"});
  const raw={ users:[U("泓儒","editor"), U("李浩","editor"), U("茂泉","ship"), U("HR","hr"), U("管理員","boss")],
    settings:{dailyTarget:4,videoTags:["新片"],sources:["自製"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:opt.tasks||{}, shifts:opt.shifts||{}, logs:[], deletedVideos:[],
    videos:opt.videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", opt.who||"管理員");
  localStorage.setItem("ecdr_role", opt.role||"boss");
  VIEW_AS=null; BRAND=""; CUR_TAB="team"; TEAM_GROUP="all"; TEAM_Q=""; ATT_YM=null;
  ONLINE=true; PENDING=false;
}
let loaded=[];
let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }

// 上個月 3 支、這個月 1 支
const VIDS=[
  v_("A", {finishedAt: dayIn(PREV,5)+"T10:00:00"}),
  v_("B", {finishedAt: dayIn(PREV,6)+"T10:00:00"}),
  v_("C", {finishedAt: dayIn(PREV,7)+"T10:00:00"}),
  v_("D", {finishedAt: dayIn(CUR,1)+"T10:00:00"}),
];
const SHIFTS={}; [PREV2,PREV,CUR].forEach(ym=>{ SHIFTS["泓儒__"+dayIn(ym,3)]=sh("泓儒",dayIn(ym,3)); });
const TASKS={}; [PREV2,PREV,CUR].forEach((ym,i)=>{ TASKS["T"+i]=tk("T"+i,"泓儒",dayIn(ym,3),true); });

// ══════════ ① 預設還是本月 ══════════
{ reset({videos:VIDS, shifts:SHIFTS, tasks:TASKS});
  ok("預設看的是本月", teamYM()===CUR, teamYM());
  const h=viewTeam();
  ok("標題寫「本月成效」", h.includes("本月成效"));
  ok("橫條圖標題也是「本月完成上片」", h.includes("本月完成上片")); }

// ══════════ ② 換得到月份 ══════════
{ reset({videos:VIDS, shifts:SHIFTS, tasks:TASKS});
  teamSetYM(PREV);
  ok("換到上個月", teamYM()===PREV, teamYM());
  const h=viewTeam();
  ok("標題不再說「本月」", !h.includes("本月成效") && h.includes("月成效"));
  ok("橫條圖標題標出是哪個月", h.includes((+PREV.slice(5,7))+" 月完成上片"), h.slice(0,200));
  ok("熱圖的月份跟著換", h.includes(PREV+"-05")); }
// 數字真的是那個月的
{ reset({videos:VIDS, shifts:SHIFTS, tasks:TASKS});
  ok("本月 泓儒 完成 1 支", teamMonthStat("泓儒", Object.values(TASKS), CUR).count===1);
  ok("上個月 泓儒 完成 3 支", teamMonthStat("泓儒", Object.values(TASKS), PREV).count===3); }

// ══════════ ③ 上面那條速覽永遠是「現在」 ══════════
{ reset({videos:VIDS, shifts:SHIFTS, tasks:TASKS});
  const now=viewTeam();
  teamSetYM(PREV);
  const past=viewTeam();
  const grab=(h)=>{ const m=h.match(/<span class="fn">(\d+)<\/span><span class="fl">(?:本月完成|Done this month)/); return m?+m[1]:null; };
  ok("本月完成那個數字是 1", grab(now)===1, grab(now));
  ok("翻到上個月，速覽上的『本月完成』還是 1（那是現在的狀況）", grab(past)===1, grab(past));
  ok("但下面的成效換成上個月了", past.includes((+PREV.slice(5,7))+" 月完成上片")); }

// ══════════ ④ 守住「純檢視」那條規矩 ══════════
{ reset({videos:VIDS, shifts:SHIFTS, tasks:TASKS, who:"泓儒", role:"editor"});
  const h=viewTeam();
  ok("看板上沒有任何按鍵", !h.includes("<button"), (h.match(/<button[^>]*>/)||[])[0]);
  ok("看板上沒有 onclick", !h.includes("onclick"), (h.match(/onclick="[^"]{0,40}/)||[])[0]);
  ok("月份是用下拉切的", h.includes("teamSetYM(")); }
{ reset({videos:VIDS, shifts:SHIFTS, tasks:TASKS, who:"泓儒", role:"editor"});
  teamSetYM(PREV);
  const h=viewTeam();
  ok("翻到別的月份也還是沒有按鍵", !h.includes("<button") && !h.includes("onclick")); }

// ══════════ ⑤ 不能翻到未來 ══════════
{ reset({videos:VIDS, shifts:SHIFTS, tasks:TASKS});
  const [y,m]=CUR.split("-").map(Number); const d=new Date(y,m,1);
  const next=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  teamSetYM(next);
  ok("未來的月份切不過去", teamYM()===CUR, teamYM());
  ok("月份清單裡也沒有未來", !teamMonths().includes(next), teamMonths().slice(0,3)); }
{ reset({videos:VIDS, shifts:SHIFTS, tasks:TASKS});
  teamSetYM("亂打的"); ok("亂給值切不過去", teamYM()===CUR);
  teamSetYM(""); ok("空字串切不過去", teamYM()===CUR); }

// ══════════ ⑥ 月份清單 ══════════
{ reset({videos:VIDS, shifts:SHIFTS, tasks:TASKS});
  const ms=teamMonths();
  ok("最新的排在最前面", ms[0]===CUR, ms.slice(0,3));
  ok("列得出上個月", ms.includes(PREV), ms);
  ok("列得出上上個月（有打卡與交辦）", ms.includes(PREV2), ms);
  ok("不會多生一堆空月份", ms.length<=4, ms.length); }
// ⚠️ 不能靠影片資料 —— 不下載影片的職位月份清單要一模一樣
{ reset({videos:VIDS, shifts:SHIFTS, tasks:TASKS, who:"管理員", role:"boss"});
  const withVideos=teamMonths().join("|");
  reset({videos:[], shifts:SHIFTS, tasks:TASKS, who:"茂泉", role:"ship"});
  const noVideos=teamMonths().join("|");
  ok("沒有影片資料的職位，月份清單一樣", withVideos===noVideos, {withVideos, noVideos}); }
{ const CODE=APP.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n");
  const fn=CODE.slice(CODE.indexOf("function teamMonths()"), CODE.indexOf("function teamMonthPicker"));
  ok("teamMonths 沒有去讀 STATE.videos", !/STATE\s*&&\s*STATE\.videos|STATE\.videos/.test(fn), fn.slice(0,160)); }

// ══════════ ⑦ 往前翻要去補讀那個月的打卡 ══════════
{ reset({videos:VIDS, shifts:SHIFTS, tasks:TASKS});
  loaded=[];
  teamSetYM(PREV2);
  ok("切到訂閱範圍外的月份會去補讀打卡", loaded.includes(PREV2), loaded); }

// ══════════ ⑧ 沒把既有的東西弄壞 ══════════
{ reset({videos:VIDS, shifts:SHIFTS, tasks:TASKS});
  ["boss","hr","editor","ship"].forEach(r=>{
    localStorage.setItem("ecdr_role", r);
    localStorage.setItem("ecdr_user", r==="hr"?"HR":(r==="boss"?"管理員":(r==="ship"?"茂泉":"泓儒")));
    [CUR, PREV].forEach(ym=>{ TEAM_YM=ym; CUR_TAB="team";
      try{ render(); ok(`[${r}] 團隊看板 ${ym} 畫得出來`, true); }
      catch(e){ ok(`[${r}] 團隊看板 ${ym} → ${e.message}`, false); } });
  }); }
// 篩選還是好的
{ reset({videos:VIDS, shifts:SHIFTS, tasks:TASKS});
  teamSetYM(PREV);
  TEAM_Q="泓儒";
  const h=viewTeam();
  ok("翻到別的月份，搜尋還是有效", h.includes("泓儒") && !h.includes("李浩"), h.slice(0,120));
  TEAM_Q=""; }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
