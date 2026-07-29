// v76：打卡與出勤 —— 班表設定（全公司一套＋個人例外）、遲到早退、自動補下班、
// 打卡環境記錄（裝置／是不是手機／GPS）、人資的出勤月報表。
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
global.requestAnimationFrame=(f)=>f();
// Node 22 內建 navigator 是唯讀的，直接賦值會被忽略 → 用 defineProperty 蓋掉
Object.defineProperty(global,"navigator",{configurable:true,writable:true,
  value:{onLine:true, userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"}});
global.confirm=()=>true; global.prompt=()=>null;
let calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const YESTER=new Date(Date.now()+288e5-864e5).toISOString().slice(0,10);
const YM=T0.slice(0,7);
const sh=(user,date,inT,outT,extra)=>Object.assign({id:user+"__"+date,user,date,
  clockIn:inT?date+"T"+inT+":00":"", clockOut:outT?date+"T"+outT+":00":""},extra||{});
function reset(shifts, settings, users){
  calls=[]; toasts=[]; fields={}; ATT_YM=null;
  STATE={ users: users||[{name:"小葵",role:"editor",craft:"orig"},{name:"阿明",role:"editor",craft:"orig"},
                         {name:"小美",role:"cs"},{name:"HR小姐",role:"hr"},{name:"管理員",role:"boss"}],
    settings: Object.assign({dailyTarget:4,videoTags:[],sources:["s"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"}, settings||{}),
    schedule:{}, logs:[], tasks:{}, deletedVideos:[], videos:[],
    shifts: (shifts||[]).reduce((a,s)=>{a[s.id]=s; return a;},{}) };
  CUR_TAB=null; VIEW_AS=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async(p)=>{calls.push(["settings",p]);} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ── 班表：全公司一套，個人可例外 ──
reset([], {workStart:"09:00",workEnd:"18:00",lateGraceMin:10},
  [{name:"小葵",role:"editor"},{name:"阿明",role:"editor",workStart:"13:00",workEnd:"22:00"}]);
ok("沒設定的人用全公司班表", workHoursOf("小葵").start==="09:00" && workHoursOf("小葵").end==="18:00");
ok("設定過的人用自己的", workHoursOf("阿明").start==="13:00" && workHoursOf("阿明").end==="22:00");
ok("看得出誰是個人班表", workHoursOf("阿明").custom===true && workHoursOf("小葵").custom===false);
ok("沒設定就用預設 09:00–18:00", (()=>{ reset([],{}); return workHoursOf("小葵").start==="09:00"; })());

// ── 遲到／早退／工時 ──
reset([], {workStart:"09:00",workEnd:"18:00",lateGraceMin:10});
ok("準時不算遲到", attendOf(sh("小葵",T0,"09:00","18:00")).late===0);
ok("寬限內不算遲到", attendOf(sh("小葵",T0,"09:10","18:00")).late===0);
ok("超過寬限才算遲到（09:25 → 15 分）", attendOf(sh("小葵",T0,"09:25","18:00")).late===15);
ok("提早下班算早退（17:30 → 30 分）", attendOf(sh("小葵",T0,"09:00","17:30")).early===30);
ok("加班不會變成負的早退", attendOf(sh("小葵",T0,"09:00","20:00")).early===0);
ok("工時算得出來", attendOf(sh("小葵",T0,"09:00","18:00")).work===540);
ok("還沒打下班就沒有工時", attendOf(sh("小葵",T0,"09:00","")).work===null);
ok("完全沒打卡", attendOf(null).none===true);

// ── 打卡會記下裝置與是不是手機 ──
reset([]);
(async()=>{
  await clockIn("小葵"); await wait(20);
  const c=calls.find(x=>x[0]==="set"&&x[1]==="shifts");
  ok("上班打卡有寫入", !!c);
  ok("記下裝置代碼", !!(c&&c[3].inDev));
  ok("認得出是手機", c&&c[3].inMobile===true);
  ok("打卡不會因為拿不到 GPS 就失敗", c&&c[3].inGeo===null);

  reset([sh("小葵",T0,"09:00","")]);
  as("小葵","editor");
  await doClockOut(); await wait(20);
  { const u=calls.find(x=>x[0]==="update"&&x[1]==="shifts");
    ok("下班也記下裝置", !!(u && u[3].outDev));
    ok("下班有寫時間", !!(u && u[3].clockOut)); }

  // ── 昨天忘了打下班：登入時自動補 ──
  reset([sh("小葵",YESTER,"09:00","")], {workStart:"09:00",workEnd:"18:00"});
  as("小葵","editor");
  await autoCloseOpenShifts(); await wait(20);
  { const u=calls.find(x=>x[0]==="update"&&x[1]==="shifts");
    ok("自動補上昨天的下班", !!u && u[3].clockOut===YESTER+"T18:00:00");
    ok("補的那筆標記為系統補登", !!u && u[3].autoOut===true); }
  reset([sh("小葵",T0,"09:00","")]);
  as("小葵","editor"); await autoCloseOpenShifts(); await wait(20);
  ok("今天還在上班的不會被自動下班", !calls.some(x=>x[0]==="update"&&x[1]==="shifts"));
  reset([sh("阿明",YESTER,"09:00","")]);
  as("小葵","editor"); await autoCloseOpenShifts(); await wait(20);
  ok("只補自己的，不會動到別人", !calls.some(x=>x[0]==="update"&&x[1]==="shifts"));

  // ── 出勤頁：今日 ──
  reset([sh("小葵",T0,"09:00","18:00",{inDev:"AB12",inMobile:true}),
         sh("阿明",T0,"09:40","",{inDev:"CD34"}),
         sh("小美",T0,"09:00","17:00",{inDev:"AB12"})],
        {workStart:"09:00",workEnd:"18:00",lateGraceMin:10});
  as("HR小姐","hr");
  let h=viewAttend();
  ok("今日出勤列出所有同仁", ["小葵","阿明","小美"].every(n=>h.includes(n)));
  ok("標出遲到（阿明 09:40 → 30 分）", h.includes("遲到 30 分"));
  ok("標出早退（小美 17:00 → 60 分）", h.includes("早退 60 分"));
  ok("還沒下班的顯示上班中", h.includes("上班中"));
  ok("看得到裝置代碼", h.includes("AB12") && h.includes("CD34"));
  ok("同一台裝置幫多人打卡會示警", h.includes("同一台裝置幫多人打卡") && h.includes("小葵、小美"));

  // ── 出勤頁：月報表 ──
  reset([sh("小葵",YM+"-01","09:00","18:00"), sh("小葵",YM+"-02","09:30","18:00"),
         sh("小葵",YM+"-03","09:00","",{autoOut:false})],
        {workStart:"09:00",workEnd:"18:00",lateGraceMin:10});
  as("HR小姐","hr"); ATT_YM=[+YM.slice(0,4), +YM.slice(5,7)-1];
  h=viewAttend();
  ok("月報表算出勤天數（3 天）", h.includes('data-label="出勤天數">3<'));
  ok("月報表算遲到次數（1 次・20 分）", h.includes("1 次・20 分"));
  ok("月報表標出沒打下班", h.includes("1 天未結"));
  ok("有個人明細", h.includes("個人明細"));
  ok("月份可以切換", h.includes("attMonthMove(-1)") && h.includes("attMonthMove(1)"));

  // ── 離公司很遠會標出來 ──
  reset([sh("小葵",T0,"09:00","18:00",{inGeo:{lat:25.10,lng:121.56,acc:30}})],
        {workStart:"09:00",workEnd:"18:00",officeGeo:{lat:25.033964,lng:121.564468}});
  as("HR小姐","hr");
  ok("離公司太遠會標出距離", /離公司 \d+ 公尺/.test(viewAttend()));
  reset([sh("小葵",T0,"09:00","18:00",{inGeo:{lat:25.0340,lng:121.5645,acc:30}})],
        {workStart:"09:00",workEnd:"18:00",officeGeo:{lat:25.033964,lng:121.564468}});
  ok("在公司附近不會被標", !/離公司 \d+ 公尺/.test(viewAttend()));
  reset([sh("小葵",T0,"09:00","18:00",{inGeo:{lat:25.10,lng:121.56}})], {workStart:"09:00"});
  ok("沒設公司座標就不算距離", !/離公司 \d+ 公尺/.test(viewAttend()));

  // ── 分頁與權限 ──
  reset([]); as("HR小姐","hr");
  ok("人資看得到出勤頁", myTabs().some(t=>t[0]==="attend"));
  as("管理員","boss");
  ok("管理員看得到出勤頁", myTabs().some(t=>t[0]==="attend"));
  as("小葵","editor");
  ok("一般剪輯看不到出勤頁", !myTabs().some(t=>t[0]==="attend"));
  as("小美","cs");
  ok("員工也看不到出勤頁", !myTabs().some(t=>t[0]==="attend"));

  // ── 設定頁：班表設定 ──
  reset([], {workStart:"10:00",workEnd:"19:00",lateGraceMin:5,officeGeo:{lat:25.03,lng:121.56}});
  as("管理員","boss");
  { const st=viewSettings();
    ok("設定頁有上下班時間", st.includes("上下班時間") && st.includes('id="set_wstart"') && st.includes('value="10:00"'));
    ok("設定頁有遲到寬限", st.includes('id="set_grace"') && st.includes('value="5"'));
    ok("設定頁有公司座標", st.includes('id="set_olat"') && st.includes('value="25.03"'));
    ok("成員清單可以設個人班表", st.includes("setMemberHours(")); }
  fields.set_wstart="08:30"; fields.set_wend="17:30"; fields.set_grace="15";
  fields.set_olat="25.1"; fields.set_olng="121.5";
  fields.set_daily="4"; fields.set_horizon="30"; fields.set_shop=""; fields.set_pw=""; fields.set_plat="";
  await saveSettings(); await wait(30);
  { const c=calls.find(x=>x[0]==="settings");
    ok("儲存班表設定", !!c && c[1].workStart==="08:30" && c[1].workEnd==="17:30" && c[1].lateGraceMin===15);
    ok("儲存公司座標", !!c && c[1].officeGeo.lat===25.1 && c[1].officeGeo.lng===121.5); }

  reset([], {}); as("管理員","boss");
  setMemberHours("小葵","13:00",null); await wait(20);
  ok("設定個人上班時間", calls.some(x=>x[0]==="update"&&x[1]==="users"&&x[2]==="小葵"&&x[3].workStart==="13:00"));
  reset([], {}); as("管理員","boss");
  setMemberHours("小葵","",""); await wait(20);
  ok("清空＝改回全公司時間", calls.some(x=>x[0]==="update"&&x[1]==="users"&&x[3].workStart===""&&x[3].workEnd===""));

  // ── render 不炸 ──
  reset([sh("小葵",T0,"09:00","18:00")]);
  [["HR小姐","hr","attend"],["管理員","boss","attend"],["管理員","boss","settings"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
