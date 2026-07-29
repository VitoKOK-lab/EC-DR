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
// v81 起：出勤只從「自己設好密碼」那天（users.pwAt）之後才算遲到早退。
// 這一份測的是判定本身，所以每個人都先給一個很早的起算日；起算日的行為在 smoke-v81 測。
const PWAT="2020-01-01T00:00:00";
function reset(shifts, settings, users){
  calls=[]; toasts=[]; fields={}; ATT_YM=null;
  STATE={ users: (users||[{name:"小葵",role:"editor",craft:"orig",pw:"x",pwSet:true},{name:"阿明",role:"editor",craft:"orig",pw:"x",pwSet:true},
                         {name:"小美",role:"cs",pw:"x",pwSet:true},{name:"HR小姐",role:"hr",pw:"x",pwSet:true},{name:"管理員",role:"boss"}])
                 .map(u=>Object.assign({pwAt:PWAT}, u)),
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

  // ══ v77：不讓手機登入 ══
  reset([]);
  { let alerted=""; const _a=global.alert; global.alert=(m)=>{alerted=String(m);};
    ok("手機不能用員工帳號登入", (()=>{ loginAs({name:"小葵",role:"editor",pw:"x"});
      return alerted.includes("請用公司電腦登入") && localStorage.getItem("ecdr_user")!=="小葵"; })());
    alerted=""; global.prompt=()=>"x";
    ok("經理人不受限（Regina 手機優先）", (()=>{ loginAs({name:"Regina",role:"manager",pw:"x"}); return alerted===""; })());
    alerted=""; reset([], {pcOnly:false});
    ok("關掉設定後手機就能登入", (()=>{ loginAs({name:"小葵",role:"editor",pw:"x"}); return alerted===""; })());
    global.prompt=()=>null; global.alert=_a; }

  // ══ v77：第一次登入強制改密碼 ══
  reset([], {}, [{name:"小葵",role:"editor",pw:"0000"},{name:"阿明",role:"editor",pw:"abcd",pwSet:true},
                 {name:"小美",role:"cs",pw:"abcd",pwSet:false},{name:"Anna",role:"intl",pw:"abcd"}]);
  as("小葵","editor"); ok("還在用 0000 → 要先改密碼", mustSetPw()===true);
  as("阿明","editor"); ok("已經自己設過 → 不用再改", mustSetPw()===false);
  as("小美","cs");     ok("管理員剛重設 → 要再設一次", mustSetPw()===true);
  as("Anna","intl");   ok("改過但沒有 pwSet 記號 → 不打擾他", mustSetPw()===false);
  as("管理員","boss"); ok("管理員登入不受限", mustSetPw()===false);
  as("小葵","editor"); VIEW_AS="小葵"; ok("員工視角不會被擋", mustSetPw()===false); VIEW_AS=null;

  as("小葵","editor"); CUR_TAB="work"; render();
  ok("沒設密碼前只看得到設定密碼的畫面", viewEl.innerHTML.includes("請先設定你自己的密碼") && !viewEl.innerHTML.includes("本日上班計畫"));
  fields.pwg1="1234"; fields.pwg2="1234";
  await savePwGate(); await wait(30);
  ok("設定密碼會寫入並標記已設定",
     calls.some(x=>x[0]==="update"&&x[1]==="users"&&x[2]==="小葵"&&x[3].pw==="1234"&&x[3].pwSet===true));
  calls.length=0; fields.pwg1="0000"; fields.pwg2="0000"; await savePwGate(); await wait(20);
  ok("不能沿用 0000", !calls.length && toasts.some(t=>t.includes("不能沿用預設密碼")));
  calls.length=0; fields.pwg1="12"; fields.pwg2="12"; await savePwGate(); await wait(20);
  ok("至少 4 碼", !calls.length && toasts.some(t=>t.includes("至少 4 碼")));
  calls.length=0; fields.pwg1="1234"; fields.pwg2="5678"; await savePwGate(); await wait(20);
  ok("兩次要一致", !calls.length && toasts.some(t=>t.includes("兩次輸入不一致")));

  // ══ v77：出勤異常要填原因 ══
  reset([sh("小葵",T0,"09:30","18:00")], {workStart:"09:00",workEnd:"18:00",lateGraceMin:10},
        [{name:"小葵",role:"editor",pw:"x",pwSet:true},{name:"HR小姐",role:"hr",pw:"x",pwSet:true}]);
  as("小葵","editor");
  ok("遲到算異常", attIssues(STATE.shifts["小葵__"+T0]).some(x=>x.includes("遲到")));
  ok("工作頁跳出待說明提醒", viewWork().includes("出勤異常待說明") && viewWork().includes("saveIssueNote("));
  fields["isn_小葵__"+T0]="路上car禍改道";
  saveIssueNote("小葵__"+T0); await wait(20);
  ok("填了原因會寫進那天的打卡紀錄",
     calls.some(x=>x[0]==="update"&&x[1]==="shifts"&&x[3].issueNote==="路上car禍改道"&&x[3].issueAt));
  calls.length=0; fields["isn_小葵__"+T0]="x"; saveIssueNote("小葵__"+T0); await wait(20);
  ok("原因太短不給送", !calls.length && toasts.some(t=>t.includes("請簡單說明原因")));

  reset([sh("小葵",T0,"09:00","18:00")], {workStart:"09:00",workEnd:"18:00",lateGraceMin:10},
        [{name:"小葵",role:"editor",pw:"x",pwSet:true}]);
  as("小葵","editor");
  ok("正常出勤不會跳提醒", !viewWork().includes("出勤異常待說明"));
  reset([sh("小葵",T0,"09:30","18:00",{issueNote:"看醫生"})], {workStart:"09:00",workEnd:"18:00",lateGraceMin:10},
        [{name:"小葵",role:"editor",pw:"x",pwSet:true}]);
  as("小葵","editor");
  ok("填過就不再跳", !viewWork().includes("出勤異常待說明"));

  // 人資看得到說明與未說明
  reset([sh("小葵",T0,"09:30","18:00",{issueNote:"看醫生"}), sh("阿明",T0,"09:40","18:00")],
        {workStart:"09:00",workEnd:"18:00",lateGraceMin:10});
  as("HR小姐","hr"); ATT_YM=[+T0.slice(0,4), +T0.slice(5,7)-1];
  { const h2=viewAttend();
    ok("人資看得到本人說明", h2.includes("出勤異常與說明") && h2.includes("看醫生"));
    ok("人資看得到誰還沒說明", h2.includes("尚未說明") && h2.includes("1 筆還沒說明")); }

  // ══ v77：換新裝置提醒 ══
  reset([sh("小葵",T0,"09:00","18:00",{inDev:"NEW1",inDevUA:"Windows・Chrome",inNewDev:true}),
         sh("阿明",T0,"09:00","18:00",{inDev:"OLD1",inDevUA:"Windows・Chrome",inNewDev:false})],
        {workStart:"09:00",workEnd:"18:00"});
  as("HR小姐","hr");
  { const h3=viewAttend();
    ok("換新裝置會提醒人資", h3.includes("今天有人換了新裝置") && h3.includes("小葵"));
    ok("沒換裝置的不會被列", !h3.split("今天有人換了新裝置")[1].split("</div>\n  </div>")[0].includes("阿明"));
    ok("看得到是什麼機器", h3.includes("Windows・Chrome")); }
  reset([sh("小葵",T0,"09:00","18:00",{inDev:"OLD1",inNewDev:false})]);
  as("HR小姐","hr");
  ok("都是舊裝置就不提醒", !viewAttend().includes("今天有人換了新裝置"));
  reset([sh("小葵",T0,"09:00","18:00",{inDev:"D1",inMobile:true})]);
  as("HR小姐","hr");
  ok("用手機打卡會標出來", viewAttend().includes("用手機打的"));

  // 裝置自動記起來、不會重複記
  reset([], {}, [{name:"小葵",role:"editor",pw:"x",pwSet:true,devices:[{id:"OLD1",ua:"Windows・Chrome"}]}]);
  ok("認得已登記的裝置", isKnownDevice("小葵","OLD1")===true && isKnownDevice("小葵","XX")===false);
  await rememberDevice("小葵",{dev:"NEW9",ua:"Mac・Safari",mobile:false}); await wait(20);
  ok("第一次用的裝置會自動記起來",
     calls.some(x=>(x[0]==="arrayAdd"||x[0]==="update")&&x[1]==="users"&&x[2]==="小葵"));
  calls.length=0;
  await rememberDevice("小葵",{dev:"OLD1",ua:"Windows・Chrome",mobile:false}); await wait(20);
  ok("已經記過的不會重複寫", !calls.length);

  // ══ v80：人資自己的出勤也要被記錄，管理員看得到 ══
  reset([sh("HR小姐",T0,"09:35","18:00",{inDev:"HR1"}), sh("小葵",T0,"09:00","18:00",{inDev:"AB12"})],
        {workStart:"09:00",workEnd:"18:00",lateGraceMin:10});
  as("管理員","boss");
  { const h4=viewAttend();
    ok("出勤頁也列人資自己", h4.includes("HR小姐"));
    // v81：人資是變動工時，只記上下班與工時，不判遲到早退
    ok("人資不算遲到（變動工時）", !h4.includes("遲到 25 分") && h4.includes("變動工時"));
    ok("人資的上下班時間照樣看得到", h4.includes("09:35") && h4.includes("18:00")); }
  as("HR小姐","hr");
  ok("人資自己也看得到自己那一列", viewAttend().includes("HR小姐"));

  reset([sh("HR小姐",T0,"09:00","18:00")]);
  as("管理員","boss");
  ok("管理員看得到人資的團隊看板欄位", viewTeam().includes("HR小姐"));
  ok("管理員也能發 HR 通知（考核人資用同一個畫面）", viewTeam().includes("發出 HR 通知"));
  as("HR小姐","hr");
  ok("人資自己也在團隊看板上", viewTeam().includes("HR小姐"));
  as("小葵","editor");
  ok("一般員工也看得到人資（大家互相知道）", viewTeam().includes("HR小姐"));

  reset([]); as("Regina","manager");
  STATE.videos=[{id:"P1",code:"",name:"待剪毛片",rawName:"x",stage:"待處理",locale:"",channel:"",
    tags:[],products:[],usageHistory:[],metrics:[],scheduledDate:null}];
  { const f=viewFlow();
    ok("流程中控可以交辦人資", f.includes("交辦 HR小姐 一件事"));
    ok("毛片不會指派給人資", !f.split('id="afp_who"')[1].split("</select>")[0].includes("HR小姐")); }

  // ── render 不炸 ──
  reset([sh("小葵",T0,"09:00","18:00")]);
  [["HR小姐","hr","attend"],["管理員","boss","attend"],["管理員","boss","settings"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
