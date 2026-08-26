// v66：不剪片的「員工」角色（被交辦＋每日匯報）＋ 團隊看板全員可見
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
let calls=[];
eval(src);
const _toast=toast; toast=()=>{};

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
function reset(){
  calls=[]; modalHTML="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"orig"},{name:"Anna",role:"intl"},
                 {name:"小美",role:"cs"},{name:"阿凱",role:"cs"},
                 {name:"Regina",role:"manager"},{name:"HR小姐",role:"hr"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:["s"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:["廠商A"],reviewSince:"2026-07-01"},
    schedule:{}, logs:[], deletedVideos:[],
    shifts:{ ["小美__"+T0]:{id:"小美__"+T0,user:"小美",date:T0,clockIn:T0+"T09:00:00",clockOut:""} },
    tasks:{ C1:{id:"C1",user:"小美",date:T0,title:"回覆客戶訊息",report:"已回覆 12 則，2 則待報價",done:false,assignedBy:"Regina",ack:true,createdAt:T0+"T01:00:00"},
            C2:{id:"C2",user:"小美",date:T0,title:"出貨對單",done:true,report:"全部出完",createdAt:T0+"T02:00:00"},
            C3:{id:"C3",user:"小美",date:T0,title:"新交辦還沒看",done:false,assignedBy:"Regina",ack:false,createdAt:T0+"T03:00:00"},
            E1:{id:"E1",user:"小葵",date:T0,title:"整理素材",done:false,createdAt:T0} },
    videos:[{id:"V1",name:"小葵的片",rawName:"x",stage:"已完成",editor:"小葵",claimedAt:T0+"T00:00:00",finishedAt:T0+"T04:00:00",
             reviewStatus:"通過",publishedLink:"http://p",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
            {id:"P1",name:"待剪毛片",rawName:"x",rawLink:"http://raw",stage:"待處理",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]}] };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; POOL_FILTER="all"; CAL_PLAT="tw"; CAL_YM=null;
}
function as(u,r){ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); }
function hookDB(){ global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
  del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} }; }
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ── 「員工」這個角色到處都設得出來 ──
reset(); as("管理員","boss");
{ const st=viewSettings();
  ok("新增成員下拉有員工", st.includes('<option value="cs">員工</option>'));
  ok("既有成員角色下拉有員工", st.includes('value="cs" ') || st.includes('value="cs">員工'));
  ok("成員清單含員工", st.includes("小美") && st.includes("阿凱"));
  ok("setMemberRole 接受 cs", (()=>{ let hit=false; const _w=global.window.DB;
    global.window.DB={set:async()=>{},update:async(c,id,p)=>{ if(p.role==="cs") hit=true; },del:async()=>{},scheduleSet:async()=>{},setSettings:async()=>{}};
    try{ setMemberRole("小葵","cs"); }catch(e){}
    global.window.DB=_w; return hit; })());
  const d=viewDashboard();
  ok("員工視角下拉有員工分組", d.split('id="va_who"')[1].split("</select>")[0].includes('label="員工"'));
  ok("交辦下拉有員工分組", d.split('id="asg_who"')[1].split("</select>")[0].includes('label="員工"'));
  ok("毛片指派下拉不含員工（員工不剪片）", !d.split('id="afp_who"')[1].split("</select>")[0].includes("小美")); }

// ── 登入頁分區：員工在海外之前、海外排最後 ──
{ reset();
  const order=[]; const grid={innerHTML:"",appendChild:(e)=>{ if(e.__g) order.push("#"+e.textContent); else order.push(e.textContent||e.innerHTML); }};
  const _get=global.document.getElementById, _create=global.document.createElement;
  global.document.getElementById=(id)=> id==="userGrid" ? grid : _get(id);
  global.document.createElement=()=>{ const e=el(); Object.defineProperty(e,"className",{set(v){ e.__g=(v==="loginGroup"); },get(){return "";}}); return e; };
  bootLogin();
  global.document.getElementById=_get; global.document.createElement=_create;
  const groups=order.filter(x=>String(x).startsWith("#")).map(x=>x.slice(1));
  ok("登入頁分區順序 台灣剪輯行銷→台灣其他→巴基斯坦→管理層",
     JSON.stringify(groups)===JSON.stringify(["台灣・剪輯行銷","台灣・其他","巴基斯坦","管理層"])); }

// ── 員工的分頁與畫面 ──
reset(); as("小美","cs");
ok("員工分頁＝本日工作＋團隊看板", JSON.stringify(myTabs())===JSON.stringify([["work","本日工作"],["team","團隊看板"]]));
let w=viewWork();
ok("員工畫面沒有毛片／影片區", !w.includes("待認領") && !w.includes("待剪") && !w.includes("我的剪輯工作") && !w.includes("建立二創"));
ok("員工有今天要做的事清單", w.includes("今天要做的事") && !w.includes("剪輯以外"));
ok("員工的常用項目是客服類的", w.includes("回覆客戶訊息") && w.includes("退換貨處理") && !w.includes("剪輯當日影片"));
ok("員工看得到交辦內容", w.includes("回覆客戶訊息") && w.includes("出貨對單"));
ok("未接收的交辦要先按收到", w.includes("新交辦還沒看") && w.includes("ackTask('C3')"));
ok("員工有下班匯報鍵", w.includes("clockOutReport()"));
ok("焦點列：交辦完成／待接收／未回報", w.includes("交辦完成") && w.includes("待接收") && w.includes("未回報"));

// ── 員工的下班匯報：沒有影片區 ──
reset(); as("小美","cs"); clockOutReport();
ok("員工下班匯報沒有「今日完成上架」", !modalHTML.includes("今日完成上架"));
ok("員工下班匯報有交辦工作彙整", modalHTML.includes("交辦工作") && modalHTML.includes("回覆客戶訊息") && modalHTML.includes("全部出完"));
reset(); as("小葵","editor"); clockOutReport();
ok("剪輯的下班匯報照舊有影片區", modalHTML.includes("今日完成上架"));

// ── 員工可以自建工作項目、回報、打勾 ──
reset(); as("小美","cs"); hookDB();
taskReport("C1","改成新的處理狀況");
ok("員工可以回報", calls.some(c=>c[0]==="update"&&c[1]==="tasks"&&c[2]==="C1"&&c[3].report==="改成新的處理狀況"));
reset(); as("小美","cs"); hookDB(); ackTask("C3");
ok("員工可以按收到", calls.some(c=>c[0]==="update"&&c[1]==="tasks"&&c[2]==="C3"&&c[3].ack===true));

// ── Regina 交辦得到員工，也看得到他的回報 ──
reset(); as("Regina","manager");
let f=viewFlow();
ok("流程中控有員工的卡", f.includes("小美") && f.includes("阿凱"));
const cardOf=(html,name)=>html.split('<div class="card">').find(p=>p.includes('font-size:15px">'+name))||"";
ok("Regina 可以交辦員工", cardOf(f,"小美").includes("flowAssign(") && f.includes("交辦 小美 一件事"));
ok("員工卡不顯示影片數字", (()=>{ const seg=cardOf(f,"小美"); return seg && !seg.includes("今日完成") && !seg.includes('font-size:11px">進行中'); })());
ok("剪輯卡照樣有影片數字", (()=>{ const seg=cardOf(f,"小葵"); return seg.includes("今日完成") && seg.includes("進行中"); })());
ok("毛片指派清單不含員工", !f.split('id="afp_who"')[1].split("</select>")[0].includes("小美"));

// ── 團隊看板：全員都有這一頁 ──
reset();
[["管理員","boss"],["Regina","manager"],["小葵","editor"],["小美","cs"],["HR小姐","hr"]].forEach(([u,r])=>{
  as(u,r); ok(`[${r}] 分頁有團隊看板`, myTabs().some(t=>t[0]==="team")); });
as("Anna","intl");
ok("[intl] 分頁有 Team Board", myTabs().some(t=>t[0]==="team"&&t[1]==="Team Board"));

// ── 團隊看板內容 ──
reset(); as("小葵","editor");
let t=viewTeam();
// v119 分區：看板卡片會寫出片名，所以只列同區的人 —— 台灣看不到 Anna（海外）
ok("看板列出同區的所有人（含不剪片的員工）", ["小葵","小美","阿凱"].every(n=>t.includes(n)));
ok("台灣現在看得到海外同事（v142 不分區）", t.includes("Anna"));
{ as("Regina","manager"); const tAll=viewTeam(); as("小葵","editor");
  ok("主管兩區的人都看得到", ["小葵","Anna","小美","阿凱"].every(n=>tAll.includes(n))); }
ok("看板不列管理層與人資", !t.includes("Regina") || !t.split("今日成效")[1].includes("HR小姐"));
ok("交辦標示為主管交辦（不寫誰）", t.includes("主管交辦") && !t.includes("Regina 交辦"));
ok("看得到處理狀況", t.includes("處理狀況") && t.includes("已回覆 12 則"));
ok("看得到還沒接收的", t.includes("還沒接收"));
ok("看得到自己安排的項目", t.includes("自己安排") && t.includes("出貨對單"));
ok("不剪片的員工那欄影片數字用 — 帶過", t.includes('data-label="完成上架">—<'));
ok("頂部摘要有交辦完成", t.includes("交辦完成"));
ok("純檢視：沒有按鈕", !t.includes("<button"));
ok("純檢視：沒有 onclick", !t.includes("onclick"));
// v85 加了篩選（換個看法而已）：整頁只有那兩個篩選控制項
ok("純檢視：只有篩選用的下拉與搜尋框", (t.match(/<select|<input/g)||[]).length===2
   && t.includes("teamSetGroup(") && t.includes("teamSetQ("));
ok("純檢視：沒有任何會改到資料的動作", ["reviewVid(","flowAssign(","delTask(","taskDone(",
   "assignTaskSel(","hrNotify(","ackTask(","editVideo("].every(f=>!t.includes(f)));

// ── 海外看板全英文 ──
reset(); as("Anna","intl");
let te=viewTeam();
// v119 分區：海外的看板上只剩自己與管理層，交辦都是台灣同事的 → 改用他自己卡片上的英文字驗
ok("海外看板是英文", te.includes("Team Board") && te.includes("Tasks done") && te.includes("No tasks today"));
ok("海外看板沒有中文介面字", !te.includes("今日成效") && !te.includes("交辦完成"));

// ── 人資只有看板，且看得到所有交辦 ──
reset(); as("HR小姐","hr");
ok("人資分頁＝團隊看板＋出勤", myTabs().length===2 && myTabs()[0][0]==="team" && myTabs()[1][0]==="attend");
let th=viewTeam();
ok("人資看得到主管交辦與處理狀況", th.includes("主管交辦") && th.includes("已回覆 12 則"));

// ── 渲染不炸 ──
reset(); hookDB();
[["小美","cs","work"],["小美","cs","team"],["HR小姐","hr","team"],["小葵","editor","team"],
 ["Anna","intl","team"],["Regina","manager","team"],["管理員","boss","team"],["Regina","manager","flow"]].forEach(([u,r,tab])=>{
  as(u,r); CUR_TAB=tab;
  try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });
ok("看板頁不會寫入資料", calls.length===0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
