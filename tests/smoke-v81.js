// v81：出勤起算日與變動工時
//  ① 正式啟用前的遲到早退全部不算：每個人從「自己設好密碼」那天（users.pwAt）起才開始計算
//  ② 全公司可以另外設一個起算日（settings.attendStart），兩者取比較晚的那一天
//  ③ 人資是變動工時：只記上下班與工時，不判遲到早退；他自己看得到自己的紀錄
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
Object.defineProperty(global,"navigator",{configurable:true,writable:true,
  value:{onLine:true, userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120"}});
global.confirm=()=>true; global.prompt=()=>null; global.alert=()=>{};
let calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const YM=T0.slice(0,7);
const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);   // 相對今天的日期
const sh=(user,date,inT,outT,extra)=>Object.assign({id:user+"__"+date,user,date,
  clockIn:inT?date+"T"+inT+":00":"", clockOut:outT?date+"T"+outT+":00":""},extra||{});
const WORK={workStart:"09:00",workEnd:"18:00",lateGraceMin:10};
function reset(shifts, settings, users){
  calls=[]; toasts=[]; fields={}; ATT_YM=null;
  STATE={ users: users||[{name:"小葵",role:"editor",craft:"orig",pw:"x",pwSet:true},
                         {name:"HR小姐",role:"hr",pw:"x",pwSet:true},{name:"管理員",role:"boss"}],
    settings: Object.assign({dailyTarget:4,videoTags:[],sources:["s"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"}, settings||WORK),
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
// 設密碼那一筆（rememberDevice 也會 update users，不能用 find 抓第一筆）
const pwCall=()=>calls.filter(x=>x[0]==="update"&&x[1]==="users"&&x[3]&&x[3].pwSet!==undefined).pop();
const late = (u,date,inT,outT)=>attendOf(STATE.shifts[u+"__"+date]||sh(u,date,inT,outT));

// ══ ① 沒設過密碼的人：完全不算 ══
reset([sh("小葵",T0,"10:30","16:00")], WORK,
      [{name:"小葵",role:"editor",pw:"0000"}]);   // 還在用預設密碼、沒有 pwAt
ok("還沒設密碼 → 沒有起算日", attendStartOf("小葵")===null);
ok("還沒設密碼 → 不算遲到", attendOf(STATE.shifts["小葵__"+T0]).late===0);
ok("還沒設密碼 → 不算早退", attendOf(STATE.shifts["小葵__"+T0]).early===0);
ok("還沒設密碼 → 不算異常", attIssues(STATE.shifts["小葵__"+T0]).length===0);
ok("上下班時間照樣留著（做參考）", attendOf(STATE.shifts["小葵__"+T0]).in.includes("10:30"));
ok("工時照樣算得出來", attendOf(STATE.shifts["小葵__"+T0]).work===330);
as("小葵","editor");
ok("工作頁不會跳出待說明", !viewWork().includes("出勤異常待說明"));

// ══ ① 設密碼那天之後才算 ══
const users1=[{name:"小葵",role:"editor",pw:"x",pwSet:true,pwAt:D(-2)+"T14:00:00"},
              {name:"管理員",role:"boss"}];
reset([sh("小葵",D(-5),"10:30","16:00"),    // 設密碼之前 → 不算
       sh("小葵",D(-2),"10:30","16:00"),    // 設密碼當天 → 算
       sh("小葵",D(-1),"10:30","16:00")],   // 之後 → 算
      WORK, users1);
ok("起算日＝設密碼那一天", attendStartOf("小葵")===D(-2));
ok("起算日之前不算遲到", attendOf(STATE.shifts["小葵__"+D(-5)]).late===0);
ok("起算日之前標成「未列入計算」", attDetailTable("小葵",YM).includes("未列入計算"));
ok("起算日當天就開始算", attendOf(STATE.shifts["小葵__"+D(-2)]).late===80);
ok("起算日之後照樣算", attendOf(STATE.shifts["小葵__"+D(-1)]).late===80);
ok("月報表只算起算日之後（2 次）", attSum("小葵",YM).late===2);
ok("出勤天數還是全部（紀錄留著）", attSum("小葵",YM).days===3);
ok("counted 標記正確",
   attendOf(STATE.shifts["小葵__"+D(-5)]).counted===false && attendOf(STATE.shifts["小葵__"+D(-2)]).counted===true);

// 今日出勤那張表：未列入計算的不要顯示「正常」，尚未起算的人在標題統一講一次
reset([sh("小葵",T0,"10:30","16:00")], WORK,
      [{name:"小葵",role:"editor",pw:"0000"},{name:"阿華",role:"editor",pw:"0000"},{name:"管理員",role:"boss"}]);
as("管理員","boss");
{ const h=viewAttend();
  ok("今日出勤：未列入計算不寫「正常」", h.includes("未列入計算"));
  ok("尚未起算的人在標題統一列出", h.includes("尚未起算 2 人") && h.includes("小葵、阿華"));
  ok("不會每一列都掛「尚未起算」", (h.match(/尚未起算/g)||[]).length===1); }
reset([sh("小葵",T0,"09:00","18:00")], WORK,
      [{name:"小葵",role:"editor",pw:"x",pwSet:true,pwAt:"2020-01-01T00:00:00"},{name:"管理員",role:"boss"}]);
as("管理員","boss");
{ const h=viewAttend();
  ok("都起算了就不出現這行提示", !h.includes("尚未起算"));
  ok("正常出勤照樣顯示「正常」", h.includes(">正常<")); }

// ══ ② 全公司起算日：取比較晚的 ══
reset([sh("小葵",D(-2),"10:30","16:00")], Object.assign({attendStart:D(-1)},WORK), users1);
ok("全公司起算日比較晚 → 以全公司為準", attendStartOf("小葵")===D(-1));
ok("個人設密碼較早也不算", attendOf(STATE.shifts["小葵__"+D(-2)]).late===0);
reset([sh("小葵",D(-2),"10:30","16:00")], Object.assign({attendStart:D(-9)},WORK), users1);
ok("個人設密碼比較晚 → 以個人為準", attendStartOf("小葵")===D(-2));
ok("個人起算日到了就算", attendOf(STATE.shifts["小葵__"+D(-2)]).late===80);
reset([], Object.assign({attendStart:D(-3)},WORK), [{name:"阿新",role:"editor",pw:"0000"},{name:"管理員",role:"boss"}]);
ok("沒設密碼但有全公司起算日 → 用全公司的", attendStartOf("阿新")===D(-3));

// ══ ③ 人資：變動工時 ══
reset([sh("HR小姐",T0,"11:20","15:00")], WORK,
      [{name:"HR小姐",role:"hr",pw:"x",pwSet:true,pwAt:"2020-01-01T00:00:00"},{name:"管理員",role:"boss"}]);
ok("人資預設就是變動工時", workHoursOf("HR小姐").flex===true);
ok("變動工時不算遲到", attendOf(STATE.shifts["HR小姐__"+T0]).late===0);
ok("變動工時不算早退", attendOf(STATE.shifts["HR小姐__"+T0]).early===0);
ok("變動工時不算異常", attIssues(STATE.shifts["HR小姐__"+T0]).length===0);
ok("工時照樣記（3h40m）", minToHm(attendOf(STATE.shifts["HR小姐__"+T0]).work)==="3h40m");
as("管理員","boss");
{ const h=viewAttend();
  ok("出勤頁標出變動工時", h.includes("變動工時"));
  ok("月報表的遲到早退顯示「—」", /data-label="遲到"[^>]*>—</.test(h) && /data-label="早退"[^>]*>—</.test(h));
  ok("上下班時間還是看得到", h.includes("11:20") && h.includes("15:00")); }

// 剪輯不是變動工時
reset([sh("小葵",T0,"11:20","15:00")], WORK,
      [{name:"小葵",role:"editor",pw:"x",pwSet:true,pwAt:"2020-01-01T00:00:00"},{name:"管理員",role:"boss"}]);
ok("剪輯不是變動工時", workHoursOf("小葵").flex===false);
ok("剪輯照樣算遲到", attendOf(STATE.shifts["小葵__"+T0]).late===130);
// 管理員可以把任何人改成變動工時、也可以把人資改回固定班
reset([sh("HR小姐",T0,"11:20","15:00")], WORK,
      [{name:"HR小姐",role:"hr",pw:"x",pwSet:true,pwAt:"2020-01-01T00:00:00",flexHours:false},{name:"管理員",role:"boss"}]);
ok("人資也能改回固定班表", workHoursOf("HR小姐").flex===false && attendOf(STATE.shifts["HR小姐__"+T0]).late===130);
reset([sh("小葵",T0,"11:20","15:00")], WORK,
      [{name:"小葵",role:"editor",pw:"x",pwSet:true,pwAt:"2020-01-01T00:00:00",flexHours:true},{name:"管理員",role:"boss"}]);
ok("剪輯也能設成變動工時", attendOf(STATE.shifts["小葵__"+T0]).late===0);

// ══ ③ 人資自己看得到自己的上下班 ══
reset([sh("HR小姐",T0,"11:20","15:00"), sh("HR小姐",D(-1),"09:40","19:00")], WORK,
      [{name:"HR小姐",role:"hr",pw:"x",pwSet:true,pwAt:"2020-01-01T00:00:00"},{name:"管理員",role:"boss"}]);
as("HR小姐","hr");
{ const h=viewAttend();
  ok("出勤頁最上面有「我的出勤」", h.indexOf("我的出勤")>=0 && h.indexOf("我的出勤")<h.indexOf("今日出勤"));
  ok("看得到今天幾點上下班", h.includes(">11:20</div><div class=\"l\">今天上班") && h.includes(">15:00</div><div class=\"l\">今天下班"));
  ok("看得到今天工時", h.includes("今天工時"));
  ok("看得到本月累計工時", h.includes("月累計工時"));
  ok("寫明是變動工時", h.includes("變動工時（不判遲到早退，只記工時）"));
  ok("可以展開自己每一天的紀錄", h.includes("我這個月的每日紀錄") && h.includes("09:40"));
  ok("寫出起算日", h.includes("出勤自 2020-01-01 起算")); }
reset([], WORK, [{name:"HR小姐",role:"hr",pw:"0000"},{name:"管理員",role:"boss"}]);
as("HR小姐","hr");
ok("還沒起算會講清楚", viewAttend().includes("還沒開始起算"));
as("管理員","boss");
ok("管理員自己不打卡，沒有「我的出勤」", !viewAttend().includes("我的出勤"));

// ══ 設定密碼＝寫下起算時間 ══
(async()=>{
  reset([], WORK, [{name:"小葵",role:"editor",pw:"0000"},{name:"管理員",role:"boss"}]);
  as("小葵","editor");
  fields.pwg1="a12345"; fields.pwg2="a12345";
  await savePwGate(); await wait(60);
  { const c=pwCall();
    ok("設定密碼會寫下起算時間", !!c && !!c[3].pwAt && !!c[3].pwHash && c[3].pwSet===true); }

  // 第二次改密碼不會重設起算時間（否則等於把之前的出勤洗掉）
  reset([], WORK, [{name:"小葵",role:"editor",pwHash:"pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==",pwSet:true,pwAt:"2026-01-05T09:00:00"},{name:"管理員",role:"boss"}]);
  as("小葵","editor");
  fields.pwg1="b56789"; fields.pwg2="b56789";
  await savePwGate(); await wait(60);
  { const c=pwCall();
    ok("再改一次密碼不會重設起算時間", !!c && c[3].pwAt===undefined); }

  reset([], WORK, [{name:"小葵",role:"editor",pw:"1234",pwSet:true,pwAt:"2026-01-05T09:00:00"},{name:"管理員",role:"boss"}]);
  as("小葵","editor"); global.prompt=(m)=>String(m).includes("目前")?"1234":"c99999";
  await changeMyPw(); await wait(60);
  { const c=pwCall();
    ok("自行改密碼也不會重設起算時間", !!c && c[3].pwAt===undefined); }
  reset([], WORK, [{name:"小葵",role:"editor",pw:"1234",pwSet:true},{name:"管理員",role:"boss"}]);
  as("小葵","editor");
  await changeMyPw(); await wait(60);
  { const c=pwCall();
    ok("本來就沒有起算時間 → 這次補上", !!c && !!c[3].pwAt); }
  global.prompt=()=>null;

  // ══ 舊帳號自癒：早就改過密碼、但還沒有起算時間 → 這次登入當起算點 ══
  reset([], WORK, [{name:"Asmeer",role:"intl",pwHash:"pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA=="},{name:"小新",role:"editor",pw:"0000"},
                   {name:"小美",role:"cs",pwHash:"pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==",pwSet:false},{name:"管理員",role:"boss"}]);
  ensurePwAt(STATE.users[0]); await wait(20);
  ok("已設好密碼但沒有起算時間 → 登入時補上",
     calls.some(x=>x[0]==="update"&&x[1]==="users"&&x[2]==="Asmeer"&&x[3].pwAt));
  calls.length=0; ensurePwAt(STATE.users[1]); await wait(20);
  ok("還沒設好自己密碼的不補（等他設完）", !calls.length);
  calls.length=0; ensurePwAt(STATE.users[2]); await wait(20);
  ok("被管理員重設過的也不補", !calls.length);
  calls.length=0; ensurePwAt({name:"X",pwHash:"pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==",pwAt:"2026-01-01T00:00:00"}); await wait(20);
  ok("已經有起算時間就不動它", !calls.length);
  calls.length=0; ensurePwAt(null); await wait(20);
  ok("沒有這個人也不會炸", !calls.length);
  // 這一段要真的登入，所以雜湊得是「2387」算出來的真貨
  reset([], WORK, [{name:"Asmeer",role:"intl"},{name:"管理員",role:"boss"}]);
  STATE.users[0].pwHash=await pwMakeHash("2387");
  calls.length=0; global.prompt=()=>"2387";
  await loginAs(STATE.users[0]); await wait(60);
  ok("實際登入就會補上起算時間",
     calls.some(x=>x[0]==="update"&&x[1]==="users"&&x[2]==="Asmeer"&&x[3].pwAt));
  global.prompt=()=>null;

  // ══ 設定頁 ══
  reset([], Object.assign({attendStart:"2026-08-01"},WORK));
  as("管理員","boss");
  { const st=viewSettings();
    ok("設定頁有全公司起算日", st.includes('id="set_attstart"') && st.includes('value="2026-08-01"'));
    ok("成員清單有變動工時的勾選", st.includes("setMemberFlex("));
    ok("成員清單看得到每個人的起算日", st.includes("出勤自") || st.includes("尚未起算"));
    ok("變動工時的人不顯示上下班時間欄", st.includes("不判遲到早退")); }
  fields.set_attstart="2026-08-15";
  fields.set_wstart="09:00"; fields.set_wend="18:00"; fields.set_grace="10";
  fields.set_olat=""; fields.set_olng="";
  fields.set_daily="4"; fields.set_horizon="30"; fields.set_shop=""; fields.set_pw=""; fields.set_plat="";
  await saveSettings(); await wait(30);
  { const c=calls.find(x=>x[0]==="settings");
    ok("儲存全公司起算日", !!c && c[1].attendStart==="2026-08-15"); }

  reset([], WORK); as("管理員","boss");
  setMemberFlex("小葵",true); await wait(20);
  ok("可以把人設成變動工時", calls.some(x=>x[0]==="update"&&x[1]==="users"&&x[2]==="小葵"&&x[3].flexHours===true));
  calls.length=0; setMemberFlex("HR小姐",false); await wait(20);
  ok("可以改回固定班表", calls.some(x=>x[0]==="update"&&x[1]==="users"&&x[2]==="HR小姐"&&x[3].flexHours===false));

  // ══ 預設班表就是 9 點到 6 點 ══
  reset([], {});
  ok("沒設定時預設 09:00–18:00", workHoursOf("小葵").start==="09:00" && workHoursOf("小葵").end==="18:00");
  ok("預設寬限 10 分", workHoursOf("小葵").grace===10);
  as("管理員","boss");
  ok("設定頁預設帶 09:00 / 18:00", viewSettings().includes('id="set_wstart" type="time" value="09:00"')
     && viewSettings().includes('id="set_wend" type="time" value="18:00"'));

  // ── render 不炸 ──
  reset([sh("HR小姐",T0,"09:00","18:00"), sh("小葵",T0,"09:00","18:00")], WORK);
  [["HR小姐","hr","attend"],["管理員","boss","attend"],["管理員","boss","settings"],["小葵","editor","work"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
