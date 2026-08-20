// v85：三個功能
//  ① 操作紀錄可以查（搜尋／挑人／日期範圍／載入更早的）
//  ② 團隊看板可以篩（分組／找人）—— 只是換個看法，不會改到任何資料
//  ③ 每日固定工作範本改成管理員可編輯，工作頁一鍵帶入、當天已有的不重複
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
let calls=[], toasts=[], logWatch=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==';
const lg=(at,user,role,action,target)=>({at,user,role,action,target});
function reset(opts){
  opts=opts||{};
  calls=[]; toasts=[]; logWatch=[]; fields={};
  LOG_Q=""; LOG_WHO=""; LOG_FROM=""; LOG_TO=""; TEAM_GROUP="all"; TEAM_Q="";
  STATE={ users: opts.users||[
      {name:"小葵",role:"editor",craft:"orig",pwHash:H,pwAt:"2020-01-01T00:00:00"},
      {name:"阿明",role:"editor",craft:"orig",pwHash:H,pwAt:"2020-01-01T00:00:00"},
      {name:"小美",role:"cs",pwHash:H,pwAt:"2020-01-01T00:00:00"},
      {name:"阿凱",role:"cs",pwHash:H,pwAt:"2020-01-01T00:00:00"},
      {name:"Anna",role:"intl",pwHash:H,pwAt:"2020-01-01T00:00:00"},
      {name:"HR小姐",role:"hr",pwHash:H,pwAt:"2020-01-01T00:00:00"},
      {name:"Regina",role:"manager",pwHash:H},{name:"管理員",role:"boss"}],
    settings: Object.assign({dailyTarget:4,videoTags:["舊片"],sources:["s"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"}, opts.settings||{}),
    schedule:{}, logs: opts.logs||[], deletedVideos:[], shifts:{}, videos:[], tasks: opts.tasks||{} };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; POOL_FILTER="all"; CAL_PLAT="tw"; CAL_YM=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async(p)=>{calls.push(["settings",p]);},
    watchLogs:(n)=>{ logWatch.push(n); }, logsLimit:()=>300 };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
// 表格資料列數（不算「沒有資料」那一列提示）
const tbody=(h)=>(h.split("<tbody>")[1]||"").split("</tbody>")[0];
const bodyRows=(h)=>tbody(h).split("<tr>").slice(1).filter(r=>!r.includes("colspan")).length;
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══════════ ① 操作紀錄查詢 ══════════
const LOGS=[
  lg(T0+"T10:00:00","小葵","editor","新增影片","2609171 珠寶介紹"),
  lg(T0+"T09:30:00","阿明","editor","刪除影片","2609170 舊片"),
  lg(T0+"T09:00:00","小葵","editor","登入","上班打卡"),
  lg(D(-1)+"T15:00:00","小美","cs","交辦工作標記完成","回覆廠商"),
  lg(D(-3)+"T11:00:00","管理員","boss","修改設定","上下班時間"),
  lg(D(-9)+"T08:00:00","阿明","editor","登入","上班打卡"),
];
reset({logs:LOGS}); as("管理員","boss");
{ const h=viewLog();
  ok("有搜尋框", h.includes('id="lg_q"') && h.includes("logSetQ("));
  ok("有人員下拉", h.includes('id="lg_who"') && h.includes("logSetWho("));
  ok("人員下拉列出出現過的人", ["小葵","阿明","小美","管理員"].every(n=>h.includes(`value="${n}"`)));
  ok("有日期範圍", h.includes('id="lg_from"') && h.includes('id="lg_to"'));
  ok("有「載入更早的」", h.includes("logMore()"));
  ok("沒篩選時全部列出來", bodyRows(h)===LOGS.length && h.includes("共 <b>6</b> 筆"));
  ok("沒篩選時不出現清除鍵", !h.includes("logClear()")); }

// 搜尋
reset({logs:LOGS}); as("管理員","boss"); logSetQ("珠寶");
ok("搜尋對象欄位", bodyRows(viewLog())===1 && viewLog().includes("2609171"));
reset({logs:LOGS}); as("管理員","boss"); logSetQ("刪除");
ok("搜尋動作欄位", bodyRows(viewLog())===1 && viewLog().includes("刪除影片"));
reset({logs:LOGS}); as("管理員","boss"); logSetQ("阿明");
ok("搜尋人名", bodyRows(viewLog())===2);
reset({logs:LOGS}); as("管理員","boss"); logSetQ("剪輯");
ok("搜尋角色名稱也找得到", bodyRows(viewLog())===4);
reset({logs:LOGS}); as("管理員","boss"); logSetQ("完全沒有這種東西");
{ const h=viewLog();
  ok("找不到時給提示", h.includes("沒有符合條件的紀錄"));
  ok("找不到時不會說「目前沒有紀錄」", !h.includes("目前沒有紀錄"));
  ok("找不到時看得到清除鍵", h.includes("logClear()")); }

// 挑人
reset({logs:LOGS}); as("管理員","boss"); logSetWho("小葵");
{ const h=viewLog();
  ok("只看某個人", bodyRows(h)===2 && !tbody(h).includes("阿明"));
  ok("寫出符合幾筆", h.includes("符合 <b>2</b> 筆")); }

// 日期範圍
reset({logs:LOGS}); as("管理員","boss"); logSetFrom(T0);
ok("只看今天以後", bodyRows(viewLog())===3);
reset({logs:LOGS}); as("管理員","boss"); logSetTo(D(-2));
ok("只看某天以前", bodyRows(viewLog())===2);
reset({logs:LOGS}); as("管理員","boss"); logSetFrom(D(-3)); logSetTo(D(-1));
ok("兩邊都設＝區間", bodyRows(viewLog())===2);
reset({logs:LOGS}); as("管理員","boss"); logSetFrom(D(5));
ok("區間內沒東西也不會炸", bodyRows(viewLog())===0 && viewLog().includes("沒有符合條件的紀錄"));

// 條件疊加與清除
reset({logs:LOGS}); as("管理員","boss"); logSetWho("阿明"); logSetFrom(T0);
ok("人＋日期一起篩", bodyRows(viewLog())===1 && viewLog().includes("刪除影片"));
logClear();
ok("清除會恢復全部", bodyRows(viewLog())===LOGS.length && !viewLog().includes("logClear()"));
ok("清除會把四個條件都歸零", LOG_Q==="" && LOG_WHO==="" && LOG_FROM==="" && LOG_TO==="");

// 載入更早的
reset({logs:LOGS}); as("管理員","boss");
logMore();
ok("按載入更早的會用更大的數量重訂", logWatch.length===1 && logWatch[0]===1000);
ok("會告訴使用者正在載入", toasts.some(t=>t.includes("載入更早")));
reset({logs:LOGS}); as("管理員","boss");
global.window.DB.logsLimit=()=>1000;
logMore();
ok("每按一次再多 700 筆", logWatch[0]===1700);
reset({logs:LOGS}); as("管理員","boss"); delete global.window.DB.watchLogs;
try{ logMore(); ok("舊版 fb.js 沒有這個功能也不會炸", true); }
catch(e){ ok("舊版 fb.js 沒有這個功能也不會炸 → "+e.message, false); }

// 太多筆時只畫一部分（畫面不要爆掉）
reset({logs:Array.from({length:900},(_,i)=>lg(T0+"T10:00:00","小葵","editor","動作"+i,"x"))});
as("管理員","boss");
ok("最多只畫 400 列", bodyRows(viewLog())===400);
ok("會說明只顯示一部分", viewLog().includes("只顯示最近 400 筆"));

// ══════════ ② 團隊看板篩選 ══════════
// v119 分區：看板只列同區的人，台灣剪輯的名單裡沒有 Anna（海外）→ 6 人變 5 人
reset(); as("小葵","editor");
{ const t=viewTeam();
  ok("看板有分組下拉", t.includes("teamSetGroup("));
  ok("看板有找人的搜尋框", t.includes("teamSetQ("));
  ok("下拉寫出每一組幾個人", t.includes("全部（5）") && t.includes("剪輯（2）") && t.includes("員工（2）"));
  ok("同區的人預設都看得到", ["小葵","阿明","小美","阿凱","HR小姐"].every(n=>t.includes(n)));
  ok("台灣看不到海外同事", !t.includes("Anna"));
  ok("沒篩選時不顯示「顯示 N / M 人」", !t.includes("顯示 5 / 5 人")); }
reset(); as("Regina","manager");
{ const t=viewTeam();
  ok("主管的名單是兩區合計 6 人", t.includes("全部（6）") && t.includes("Anna")); }
reset(); as("小葵","editor"); teamSetGroup("cs");
{ const t=viewTeam();
  ok("只看員工那一組", t.includes("小美") && t.includes("阿凱") && !t.includes("阿明") && !t.includes("Anna"));
  ok("有篩選時寫出剩幾人", t.includes("顯示 2 / 5 人")); }
reset(); as("小葵","editor"); teamSetGroup("hr");
ok("只看人資", viewTeam().includes("HR小姐") && !viewTeam().includes("小美"));
reset(); as("小葵","editor"); teamSetQ("阿");
ok("找人：阿明與阿凱", viewTeam().includes("阿明") && viewTeam().includes("阿凱") && !viewTeam().includes("小葵</b>"));
reset(); as("小葵","editor"); teamSetGroup("editor"); teamSetQ("阿");
ok("分組＋找人一起用", viewTeam().includes("阿明") && !viewTeam().includes("阿凱"));
reset(); as("小葵","editor"); teamSetQ("沒有這個人");
{ const t=viewTeam();
  ok("找不到人時給提示", t.includes("沒有符合的人"));
  ok("找不到人時篩選列還在（才改得回來）", t.includes("teamSetGroup(")); }
reset({users:[{name:"管理員",role:"boss"}]}); as("管理員","boss");
ok("完全沒有成員時還是原本的提示", viewTeam().includes("還沒有成員") && !viewTeam().includes("沒有符合的人"));
// 篩選只是換個看法，不會動到資料
reset(); as("小葵","editor"); teamSetGroup("cs");
ok("篩選之後看板仍然沒有任何會改資料的動作",
   ["reviewVid(","flowAssign(","delTask(","taskDone(","assignTaskSel(","ackTask("].every(f=>!viewTeam().includes(f)));
reset(); as("小葵","editor"); calls.length=0; teamSetGroup("cs"); teamSetQ("小");
ok("篩選不會寫入資料庫", !calls.length);
// 海外看到的是英文
reset(); as("Anna","intl");
{ const t=viewTeam();
  // v119 分區：下拉只列名單裡真的有人的組，海外看不到剪輯 → 改用他名單上有的組驗
  ok("海外的篩選是英文", t.includes("Everyone") && t.includes("Pakistan") && t.includes("Find someone"));
  ok("海外的篩選沒有中文", !t.includes("找人…")); }

// ══════════ ③ 每日固定工作範本 ══════════
// app.js 裡的 WORK_PRESETS／CS_PRESETS 是 const，eval 之後拿不到，所以直接比內容
const BUILTIN_EDITOR=["剪輯當日影片","調整過往未審核影片／封面","吾家影片／封面製作","影片清單整理","文案內容整理"];
const BUILTIN_CS=["回覆客戶訊息","訂單處理／出貨","退換貨處理","客訴追蹤","商品資訊更新"];
reset(); as("小葵","editor");
ok("沒設定時沿用內建的剪輯範本", JSON.stringify(workPresets())===JSON.stringify(BUILTIN_EDITOR));
as("小美","cs");
ok("沒設定時員工看到員工的範本", JSON.stringify(workPresets())===JSON.stringify(BUILTIN_CS));
as("Anna","intl");
ok("沒設定時海外剪輯沒有固定工作（本來就沒有）", workPresets().length===0);

const TPL=[{t:"剪輯當日影片",r:"editor"},{t:"回覆客戶訊息",r:"cs"},{t:"填寫今日工作日誌",r:"all"},{t:"Check TikTok",r:"intl"}];
reset({settings:{dailyTemplates:TPL}}); as("小葵","editor");
ok("剪輯看到剪輯的＋全部的", JSON.stringify(workPresets())===JSON.stringify(["剪輯當日影片","填寫今日工作日誌"]));
as("小美","cs");
ok("員工看到員工的＋全部的", JSON.stringify(workPresets())===JSON.stringify(["回覆客戶訊息","填寫今日工作日誌"]));
as("Anna","intl");
ok("海外看到海外的＋全部的", JSON.stringify(workPresets())===JSON.stringify(["填寫今日工作日誌","Check TikTok"]));
reset({settings:{dailyTemplates:[]}}); as("小葵","editor");
ok("設成空清單時退回內建的（不會整個不見）", JSON.stringify(workPresets())===JSON.stringify(BUILTIN_EDITOR));
reset({settings:{dailyTemplates:[{t:"  ",r:"all"},{t:"有效的",r:"all"}]}}); as("小葵","editor");
ok("空白的那幾行會被濾掉", JSON.stringify(workPresets())===JSON.stringify(["有效的"]));

// 當天已經有的不重複出現
reset({settings:{dailyTemplates:TPL},
       tasks:{K1:{id:"K1",user:"小葵",date:T0,title:"剪輯當日影片",report:"",done:false,createdAt:T0}}});
as("小葵","editor");
ok("今天已經有的不再出現在固定工作列", JSON.stringify(presetPending())===JSON.stringify(["填寫今日工作日誌"]));
{ const w=viewWork();
  ok("工作頁只顯示還沒帶入的", w.includes("填寫今日工作日誌") && !w.includes("＋ 剪輯當日影片"));
  ok("只剩一件時不顯示「全部帶入」", !w.includes("全部帶入")); }
reset({settings:{dailyTemplates:TPL}}); as("小葵","editor");
{ const w=viewWork();
  ok("有兩件以上才顯示「全部帶入」", w.includes("全部帶入（2）"));
  ok("寫的是「每日固定」", w.includes("每日固定：")); }
reset({settings:{dailyTemplates:TPL},
       tasks:{K1:{id:"K1",user:"小葵",date:T0,title:"剪輯當日影片",createdAt:T0},
              K2:{id:"K2",user:"小葵",date:T0,title:"填寫今日工作日誌",createdAt:T0}}});
as("小葵","editor");
ok("全部帶完之後那一排就消失", !viewWork().includes("每日固定："));
// 別人的、或別天的，不算數
reset({settings:{dailyTemplates:TPL},
       tasks:{K1:{id:"K1",user:"阿明",date:T0,title:"剪輯當日影片",createdAt:T0},
              K2:{id:"K2",user:"小葵",date:D(-1),title:"填寫今日工作日誌",createdAt:T0}}});
as("小葵","editor");
ok("別人做的不算我已經有了", presetPending().includes("剪輯當日影片"));
ok("昨天的不算今天已經有了", presetPending().includes("填寫今日工作日誌"));

(async()=>{
  // 一鍵帶入
  reset({settings:{dailyTemplates:TPL}}); as("小葵","editor");
  await addAllPresets(); await wait(30);
  { const sets=calls.filter(x=>x[0]==="set"&&x[1]==="tasks");
    ok("全部帶入會建立兩筆", sets.length===2);
    ok("帶入的是我自己今天的工作", sets.every(c=>c[3].user==="小葵"&&c[3].date===T0&&c[3].assignedBy===""));
    ok("帶入的內容正確", ["剪輯當日影片","填寫今日工作日誌"].every(t=>sets.some(c=>c[3].title===t)));
    ok("帶入的不用按「收到」", sets.every(c=>c[3].ack===true)); }
  reset({settings:{dailyTemplates:TPL},
         tasks:{K1:{id:"K1",user:"小葵",date:T0,title:"剪輯當日影片",createdAt:T0},
                K2:{id:"K2",user:"小葵",date:T0,title:"填寫今日工作日誌",createdAt:T0}}});
  as("小葵","editor");
  await addAllPresets(); await wait(30);
  ok("都帶完了就不重複建立", !calls.length && toasts.some(t=>t.includes("都已經在清單裡")));
  reset({settings:{dailyTemplates:TPL}}); as("小葵","editor"); VIEW_AS="小葵";
  await addAllPresets(); await wait(30);
  ok("員工視角唯讀不會帶入", !calls.length); VIEW_AS=null;
  reset({settings:{dailyTemplates:TPL}}); as("小葵","editor");
  await addPresetTask("剪輯當日影片"); await wait(20);
  ok("單獨按一件也建立得起來", calls.some(x=>x[0]==="set"&&x[1]==="tasks"&&x[3].title==="剪輯當日影片"));

  // ── 設定頁：編輯範本 ──
  reset({settings:{dailyTemplates:TPL}}); as("管理員","boss");
  { const st=viewSettings();
    ok("設定頁有每日固定工作", st.includes('id="set_tpl"') && st.includes("每日固定工作"));
    ok("用「角色=內容」的格式帶出來", st.includes("剪輯=剪輯當日影片") && st.includes("全部=填寫今日工作日誌"));
    ok("寫明可以填哪些角色", st.includes("全部／剪輯／行銷／選品行銷／客服／出貨／員工／巴基斯坦")); }
  fields.set_tpl="剪輯=剪片\n員工=回訊息\n全部=打卡\n沒寫角色的一行";
  fields.set_wstart="09:00"; fields.set_wend="18:00"; fields.set_grace="10";
  fields.set_attstart=""; fields.set_olat=""; fields.set_olng="";
  fields.set_daily="4"; fields.set_horizon="30"; fields.set_shop=""; fields.set_pw=""; fields.set_plat="";
  await saveSettings(); await wait(30);
  { const c=calls.find(x=>x[0]==="settings");
    const tpl=c&&c[1].dailyTemplates;
    ok("存得起來", Array.isArray(tpl) && tpl.length===4);
    ok("角色對應正確", tpl[0].r==="editor" && tpl[1].r==="cs" && tpl[2].r==="all");
    ok("沒寫角色的當作全部", tpl[3].r==="all" && tpl[3].t==="沒寫角色的一行");
    ok("內容不含角色前綴", tpl[0].t==="剪片"); }
  reset(); as("管理員","boss");
  fields.set_tpl="\n\n   \n剪輯=只有這一行有效\n";
  fields.set_wstart="09:00"; fields.set_wend="18:00"; fields.set_grace="10";
  fields.set_attstart=""; fields.set_olat=""; fields.set_olng="";
  fields.set_daily="4"; fields.set_horizon="30"; fields.set_shop=""; fields.set_pw=""; fields.set_plat="";
  await saveSettings(); await wait(30);
  { const c=calls.find(x=>x[0]==="settings");
    ok("空行會被濾掉", c && c[1].dailyTemplates.length===1 && c[1].dailyTemplates[0].t==="只有這一行有效"); }

  // ── render 不炸 ──
  reset({logs:LOGS, settings:{dailyTemplates:TPL}});
  [["管理員","boss","log"],["管理員","boss","settings"],["管理員","boss","team"],
   ["小葵","editor","work"],["小美","cs","work"],["Anna","intl","work"],
   ["HR小姐","hr","team"],["Regina","manager","flow"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
