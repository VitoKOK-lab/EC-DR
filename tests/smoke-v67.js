// v67：HR 通知（人資發、員工按小小的「收到」）＋「老闆指派」改成「主管交辦」
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
let calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const YESTER=new Date(Date.now()+288e5-864e5).toISOString().slice(0,10);
function reset(){
  calls=[]; toasts=[]; modalHTML=""; fields={};
  STATE={ users:[{name:"小葵",role:"editor",craft:"orig"},{name:"阿明",role:"editor",craft:"orig"},
                 {name:"Anna",role:"intl"},{name:"小美",role:"cs"},
                 {name:"Regina",role:"manager"},{name:"HR小姐",role:"hr"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:["s"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2026-07-01"},
    schedule:{}, logs:[], deletedVideos:[], shifts:{},
    tasks:{
      // 主管交辦（一般交辦）
      K1:{id:"K1",user:"小葵",date:T0,title:"回覆廠商",report:"",done:false,assignedBy:"Regina",ack:false,createdAt:T0+"T01:00:00"},
      // HR 通知：今天發的（未讀）
      N1:{id:"N1",kind:"notice",user:"小葵",date:T0,title:"月底前補交健檢報告",report:"",done:false,assignedBy:"HR小姐",ack:false,createdAt:T0+"T02:00:00"},
      // HR 通知：今天發的（已收到）
      N2:{id:"N2",kind:"notice",user:"小葵",date:T0,title:"下週三教育訓練",report:"",done:false,assignedBy:"HR小姐",ack:true,ackAt:T0+"T09:30:00",createdAt:T0+"T03:00:00"},
      // HR 通知：昨天發的，還沒按收到 → 今天還要看得到
      N3:{id:"N3",kind:"notice",user:"小葵",date:YESTER,title:"昨天沒看到的通知",report:"",done:false,assignedBy:"HR小姐",ack:false,createdAt:YESTER+"T05:00:00"},
      // HR 通知：昨天發的，已收到 → 不再出現
      N4:{id:"N4",kind:"notice",user:"小葵",date:YESTER,title:"昨天已收到的通知",report:"",done:false,assignedBy:"HR小姐",ack:true,ackAt:YESTER+"T06:00:00",createdAt:YESTER+"T04:00:00"},
      // 不剪片員工的通知
      N5:{id:"N5",kind:"notice",user:"小美",date:T0,title:"排休表記得填",report:"",done:false,assignedBy:"HR小姐",ack:false,createdAt:T0+"T02:00:00"},
    },
    videos:[] };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; POOL_FILTER="all"; CAL_PLAT="tw"; CAL_YM=null;
}
function as(u,r){ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); }
function hookDB(){ global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
  del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} }; }
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ── 通知與交辦分流 ──
reset(); as("小葵","editor");
ok("交辦清單不含 HR 通知", myTasks().every(t=>t.kind!=="notice") && myTasks().length===1);
ok("通知清單只有通知", myNotices().every(t=>t.kind==="notice"));
ok("今天的通知看得到", myNotices().some(t=>t.id==="N1") && myNotices().some(t=>t.id==="N2"));
ok("昨天沒按收到的還會出現", myNotices().some(t=>t.id==="N3"));
ok("昨天已收到的不再出現", !myNotices().some(t=>t.id==="N4"));
ok("別人的通知看不到", !myNotices().some(t=>t.id==="N5"));

// ── 員工端畫面：HR 通知卡＋小小的收到鍵 ──
let w=viewWork();
ok("工作頁有 HR 通知卡", w.includes("HR 通知") && w.includes("月底前補交健檢報告"));
ok("未讀的有小小的『收到』鍵", w.includes(`onclick="ackTask('N1')"`) && w.includes(">收到<"));
ok("已收到的顯示時間、沒有按鍵", w.includes("已收到") && !w.includes(`ackTask('N2')`));
ok("有未讀數提示", w.includes("2 則未讀"));
ok("通知不會混進交辦卡", (()=>{ const seg=w.split("我的今日工作計畫")[1]||""; return !seg.includes("月底前補交健檢報告"); })());

// ── 主管交辦：名稱改了、收到也是小按鈕 ──
ok("交辦標籤是「主管交辦」", w.includes("主管交辦") && !w.includes("老闆指派"));
ok("交辦的收到也是小按鍵", w.includes(`onclick="ackTask('K1')"`) && !w.includes('style="width:100%" onclick="ackTask('));
ok("提示文字不寫交辦人名字", w.includes("主管交辦") && !w.includes("Regina 交辦"));

// ── 不剪片的員工也收得到通知 ──
reset(); as("小美","cs");
let wc=viewWork();
ok("員工工作頁有 HR 通知", wc.includes("HR 通知") && wc.includes("排休表記得填") && wc.includes(`ackTask('N5')`));

// ── 按收到 ──
reset(); as("小葵","editor"); hookDB(); ackTask("N1");
ok("按收到寫入 ack", calls.some(c=>c[0]==="update"&&c[1]==="tasks"&&c[2]==="N1"&&c[3].ack===true&&c[3].ackAt));

// ── 人資發通知 ──
reset(); as("HR小姐","hr"); hookDB();
fields.hrn_who="小葵"; fields.hrn_txt="記得繳交勞健保資料";
(async()=>{
  await hrNotify(); await wait(20);
  ok("發給單一同仁：寫出一筆通知", calls.filter(c=>c[0]==="set"&&c[1]==="tasks").length===1
     && calls.some(c=>c[3].kind==="notice"&&c[3].user==="小葵"&&c[3].title==="記得繳交勞健保資料"&&c[3].assignedBy==="HR小姐"&&c[3].ack===false));
  ok("送出後清空輸入框", fields.hrn_txt==="");

  reset(); as("HR小姐","hr"); hookDB();
  fields.hrn_who="__all__"; fields.hrn_txt="全體注意";
  await hrNotify(); await wait(20);
  const sets=calls.filter(c=>c[0]==="set"&&c[1]==="tasks");
  ok("發給全體：每位同仁各一筆（4 人）", sets.length===4
     && ["小葵","阿明","Anna","小美"].every(n=>sets.some(c=>c[3].user===n)));
  ok("全體通知不含管理層與人資", !sets.some(c=>["Regina","HR小姐","管理員"].includes(c[3].user)));

  reset(); as("HR小姐","hr"); hookDB();
  fields.hrn_who="小葵"; fields.hrn_txt="   ";
  await hrNotify(); await wait(20);
  ok("沒填內容不會送出", !calls.length && toasts.some(t=>t.includes("請輸入通知內容")));

  // ── 人資看板：發通知卡＋誰收到了 ──
  reset(); as("HR小姐","hr");
  let t=viewTeam();
  ok("看板有發通知卡", t.includes("發出 HR 通知") && t.includes("全體同仁") && t.includes("hrNotify()"));
  ok("看得到自己發出去的通知", t.includes("我發出的通知") && t.includes("月底前補交健檢報告"));
  ok("看得到誰收到了", t.includes("已收到 0/1") || t.includes("已收到 1/1"));
  ok("可以收回通知", t.includes("hrNotifyDel("));

  // ── 團隊看板：每個人的通知狀態（所有人都看得到）──
  reset(); as("小葵","editor");
  t=viewTeam();
  ok("看板顯示通知未讀狀態", t.includes("未讀") && t.includes("月底前補交健檢報告"));
  ok("看板顯示已收到的通知", t.includes("已收到") && t.includes("下週三教育訓練"));
  ok("一般員工的看板還是沒有按鍵", !t.includes("<button") && !t.includes("onclick"));

  // ── 通知不影響交辦成效 ──
  reset(); as("小葵","editor");
  t=viewTeam();
  ok("交辦完成只算交辦（1 件，不含 4 則通知）", t.includes("0/1</div><div class=\"l\">交辦完成"));
  reset(); as("Regina","manager");
  const f=viewFlow();
  const card=f.split('<div class="card">').find(p=>p.includes('font-size:15px">小葵'))||"";
  ok("流程中控的交辦數不含通知", card.includes("交辦 0/1"));
  reset(); as("管理員","boss"); SHIFT_DATE=T0;   // 儀表板預設看昨天，測今天的數字
  const d=viewDashboard();
  ok("儀表板的交辦數不含通知", d.includes("0/1</div><div class=\"l\">交辦完成"));

  // ── 人資收回通知 ──
  reset(); as("HR小姐","hr"); hookDB(); hrNotifyDel("N1");
  await wait(20);
  ok("收回通知＝刪掉那筆", calls.some(c=>c[0]==="del"&&c[1]==="tasks"&&c[2]==="N1"));

  // ── 海外看到的是英文 ──
  reset(); as("Anna","intl");
  STATE.tasks.NA={id:"NA",kind:"notice",user:"Anna",date:T0,title:"notice for Anna",report:"",done:false,assignedBy:"HR小姐",ack:false,createdAt:T0+"T02:00:00"};
  const we=viewWork();
  ok("海外的通知卡是英文", we.includes("HR notice") && we.includes("Got it") && we.includes("unread"));

  // ── render 不炸 ──
  reset(); hookDB();
  [["小葵","editor","work"],["小美","cs","work"],["HR小姐","hr","team"],["Regina","manager","flow"],["管理員","boss","dashboard"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
