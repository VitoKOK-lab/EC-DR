// v83：員工可以主動發私人訊息給人資或主管，對方一定要回覆
//  ・員工端收成一行折疊，沒有回覆就不亮紅點
//  ・人資／主管端「同仁來訊」卡，沒有訊息時整張卡不出現
//  ・訊息不能混進交辦成效的數字
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
const PWAT="2020-01-01T00:00:00";
const msg=(id,user,to,title,extra)=>Object.assign({id,kind:"msg",user,to,date:T0,title,
  reply:"",replyBy:"",replyAt:"",seen:false,createdAt:T0+"T0"+(id.length%9)+":00:00"},extra||{});
function reset(msgs, tasks){
  calls=[]; toasts=[]; fields={};
  const t={};
  (msgs||[]).forEach(m=>t[m.id]=m);
  Object.assign(t, tasks||{});
  STATE={ users:[{name:"小葵",role:"editor",craft:"orig",pw:"x",pwSet:true,pwAt:PWAT},
                 {name:"小美",role:"cs",pw:"x",pwSet:true,pwAt:PWAT},
                 {name:"Anna",role:"intl",pw:"x",pwSet:true,pwAt:PWAT},
                 {name:"HR小姐",role:"hr",pw:"x",pwSet:true,pwAt:PWAT},
                 {name:"Regina",role:"manager",pw:"x",pwSet:true},
                 {name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:["s"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, logs:[], deletedVideos:[], shifts:{}, videos:[], tasks:t };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; POOL_FILTER="all"; CAL_PLAT="tw"; CAL_YM=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ 分類：訊息不是交辦，也不是通知 ══
reset([msg("M1","小葵","hr","我下週三想請假")]);
ok("訊息認得出來", isMsg(STATE.tasks.M1)===true);
ok("訊息不是一般交辦", isTask(STATE.tasks.M1)===false);
ok("訊息不是 HR 通知", isNotice(STATE.tasks.M1)===false);
ok("一般交辦仍算 isTask", isTask({id:"K",user:"小葵",title:"x"})===true);
ok("HR 通知不算 isTask", isTask({kind:"notice"})===false);

// ══ 訊息不能混進交辦成效 ══
reset([msg("M1","小葵","hr","請假"), msg("M2","小葵","boss","電腦壞了")],
      {K1:{id:"K1",user:"小葵",date:T0,title:"回覆廠商",report:"",done:false,assignedBy:"Regina",ack:true,createdAt:T0+"T01:00:00"}});
as("小葵","editor");
ok("我的交辦清單不含訊息", myTasks().length===1 && myTasks()[0].id==="K1");
ok("未來工作清單不含訊息", myFutureTasks().every(t=>!isMsg(t)));
ok("realTasks 濾掉訊息", realTasks(Object.values(STATE.tasks)).length===1);
{ const t=viewTeam();
  ok("團隊看板的交辦數不含訊息", t.includes("0/1</div><div class=\"l\">交辦完成")); }
as("Regina","manager");
{ const f=viewFlow();
  const card=f.split('<div class="card">').find(p=>p.includes('font-size:15px">小葵'))||"";
  ok("流程中控的交辦數不含訊息", card.includes("交辦 0/1")); }
as("管理員","boss"); SHIFT_DATE=T0;
ok("儀表板的交辦數不含訊息", viewDashboard().includes("0/1</div><div class=\"l\">交辦完成"));

// ══ 誰收得到 ══
reset([msg("M1","小葵","hr","給人資"), msg("M2","小美","boss","給主管")]);
as("HR小姐","hr");   ok("人資只收到給人資的", msgsForMe().map(m=>m.id).join()==="M1");
as("Regina","manager"); ok("經理人只收到給主管的", msgsForMe().map(m=>m.id).join()==="M2");
as("管理員","boss"); ok("管理員兩種都收得到", msgsForMe().length===2);
as("小葵","editor"); ok("一般員工沒有收件匣", msgsForMe().length===0);
as("Anna","intl");   ok("海外剪輯也沒有收件匣", msgsForMe().length===0);
as("小葵","editor"); ok("只看得到自己發的", myMsgs().map(m=>m.id).join()==="M1");
as("小美","cs");     ok("看不到別人發的", myMsgs().map(m=>m.id).join()==="M2");

// ══ 員工端：折疊、沒訊息不亮紅點 ══
reset([]); as("小葵","editor");
// v183：舊的「找主管／人資說一件事」那張卡退休了。
// 老闆：「找主管，找hr也是一種溝通呀，全部移到溝通去…這不是說好要整合在一起嗎?」
// 取代它的不是「換一頁再開一張同樣的卡」，而是**同一張傳訊息卡**裡多了管理層 ——
// 找主管跟傳給任何一個同事，現在是完全一樣的動作。
{ const w=viewWork(), c=viewChat();
  ok("**每日工作上不再有那張卡**",
     !w.includes("找主管／人資說一件事") && !w.includes('id="msg_txt"'));
  ok("**傳訊息那張卡裡選得到人資**", c.includes('value="HR小姐"'));
  ok("**也選得到經理人**", c.includes('value="Regina"'));
  ok("**也選得到管理員**（他沒有員工卡，本來永遠不在名單上）", c.includes('value="管理員"'));
  ok("管理員在畫面上顯示成 Vito", c.includes(">Vito<"));
  ok("**舊的送出鍵整個不見了**（不會再產生新的 kind:\"msg\"）",
     !c.includes("sendMsg()") && typeof sendMsg==="undefined"); }
reset([msg("M1","小葵","hr","請假")]); as("小葵","editor");
{ COMM_TAB="open"; const c=viewChat();
  ok("等回覆中會寫出來", c.includes("等對方回覆中"));
  ok("還沒被回覆可以自己收回", c.includes("msgDel('M1')")); }
reset([msg("M1","小葵","hr","請假",{reply:"准了",replyBy:"HR小姐",replyAt:T0+"T10:00:00",seen:false})]);
as("小葵","editor");
{ COMM_TAB="open"; const c=viewChat();
  ok("有回覆沒看過 → 導覽列亮紅點 1", commUnread()===1, commUnread());
  ok("看得到回覆內容與是誰回的", c.includes("准了") && c.includes("HR小姐"));
  ok("有「知道了」可以清掉紅點", c.includes("msgSeen('M1')"));
  ok("已回覆就不能再收回", !c.includes("msgDel('M1')")); }
reset([msg("M1","小葵","hr","請假",{reply:"准了",replyBy:"HR小姐",replyAt:T0+"T10:00:00",seen:true})]);
as("小葵","editor");
{ COMM_TAB="open"; const c=viewChat();
  ok("看過之後紅點消失", commUnread()===0, commUnread());
  ok("看過之後還是看得到回覆內容", c.includes("准了")); }
reset([msg("M1","小美","boss","電腦壞了")]); as("小美","cs");
{ const c=viewChat();
  ok("不剪片的員工也發得出訊息（同一張卡）", /class="asg_p"/.test(c) && c.includes('value="Regina"'));
  ok("而且看得到自己發過的那一則", c.includes("電腦壞了")); }

// 人資自己也是員工，他也要能發訊息 —— 但只能發給主管，不能發給自己
reset([]); as("HR小姐","hr");
{ const c=viewChat();
  ok("人資也在「傳訊息」發訊息", /class="asg_p"/.test(c));
  ok("**人資的名單上沒有他自己**（自己傳給自己是假的一筆）", !c.includes('value="HR小姐"'));
  ok("人資選得到主管與管理員", c.includes('value="Regina"') && c.includes('value="管理員"'));
  ok("**看板上不再有發訊息的地方**", !viewTeam().includes('id="msg_txt"')); }
reset([msg("M1","HR小姐","boss","我想調整排班")]); as("HR小姐","hr");
COMM_TAB="open";
ok("人資看得到自己發出去的", viewChat().includes("我想調整排班"));
as("管理員","boss"); COMM_TAB="open";
ok("管理員在「傳訊息」收得到人資發的", viewChat().includes("我想調整排班"));

// ══ 人資／主管端：沒訊息整張卡不出現 ══
// v183：收訊的那一頭也搬到「傳訊息」——舊資料照樣回得了，只是不再有第二個地方。
reset([msg("M1","小葵","hr","我下週三想請假")]); as("HR小姐","hr"); COMM_TAB="open";
{ const c=viewChat();
  ok("人資看得到來訊", c.includes("小葵") && c.includes("我下週三想請假"));
  ok("有回覆框", c.includes('id="mr_M1"') && c.includes("msgReply('M1')"));
  ok("**看板上不再有「同仁來訊」**", !viewTeam().includes("同仁來訊")); }
reset([msg("M1","小葵","hr","請假",{reply:"准了",replyBy:"HR小姐",replyAt:T0+"T10:00:00"})]);
as("HR小姐","hr"); COMM_TAB="open";
{ const c=viewChat();
  ok("回覆過就不再顯示輸入框", !c.includes('id="mr_M1"')); }
reset([msg("M1","小美","boss","電腦壞了")]); as("Regina","manager"); COMM_TAB="open";
ok("主管看得到給主管的來訊", viewChat().includes("電腦壞了"));
reset([msg("M1","小葵","hr","給人資的"), msg("M2","小美","boss","給主管的")]);
as("管理員","boss"); COMM_TAB="open";
{ const c=viewChat();
  ok("管理員兩種都看得到", c.includes("給人資的") && c.includes("給主管的")); }
as("小葵","editor"); COMM_TAB="open";
ok("一般員工看不到別人的來訊", !viewChat().includes("給主管的"));
ok("團隊看板仍然沒有按鍵", !viewTeam().includes("<button") && !viewTeam().includes("onclick"));

// ══ 送出／回覆／收回 ══
(async()=>{
  // v183：送出走合併後的那一條（assignTaskSel）。「員工發訊息給人資」現在
  // 產生的是 kind:"p2p"，跟他傳給任何同事一模一樣 —— 這正是「整合在一起」。
  // 舊的 kind:"msg" 不再產生，但已經存在的照樣讀得到、回得了（上面驗過）。
  reset([]); as("小葵","editor");
  asgPicked=()=>["HR小姐"]; fields.asg_txt="我下週三想請假";
  await assignTaskSel(); await wait(20);
  { const c=calls.find(x=>x[0]==="set"&&x[1]==="tasks");
    ok("送出會寫入一筆訊息", !!c && c[3].kind==="p2p" && c[3].from==="小葵" && c[3].user==="HR小姐"
       && c[3].title==="我下週三想請假", c&&c[3]);
    ok("**員工發的不會變成對方的工作**", !!c && !c[3].assignedBy); }
  reset([]); as("Regina","manager");
  asgPicked=()=>["小葵"]; fields.asg_txt="這件事下週前處理完";
  await assignTaskSel(); await wait(20);
  { const c=calls.find(x=>x[0]==="set"&&x[1]==="tasks");
    ok("**主管發的才會變成交辦**", !!c && !c[3].kind && c[3].assignedBy==="Regina", c&&c[3]); }
  reset([]); as("小葵","editor"); asgPicked=()=>["HR小姐"]; fields.asg_txt="   ";
  await assignTaskSel(); await wait(20);
  ok("空白不送出", !calls.length);
  reset([]); as("小葵","editor"); asgPicked=()=>[]; fields.asg_txt="沒選人";
  await assignTaskSel(); await wait(20);
  ok("沒選收件人不送出", !calls.length);

  reset([msg("M1","小葵","hr","請假")]); as("HR小姐","hr");
  fields.mr_M1="可以，記得填假單";
  msgReply("M1"); await wait(20);
  { const c=calls.find(x=>x[0]==="update"&&x[1]==="tasks"&&x[2]==="M1");
    ok("回覆會寫進去", !!c && c[3].reply==="可以，記得填假單" && c[3].replyBy==="HR小姐" && c[3].replyAt);
    ok("回覆後重新標記為未讀，發訊的人才看得到", !!c && c[3].seen===false); }
  reset([msg("M1","小葵","hr","請假")]); as("HR小姐","hr");
  calls.length=0; fields.mr_M1="x"; msgReply("M1"); await wait(20);
  ok("回覆太短不給送", !calls.length && toasts.some(t=>t.includes("請簡單回覆")));

  reset([msg("M1","小葵","hr","請假",{reply:"准了",replyBy:"HR小姐",replyAt:T0+"T10:00:00"})]);
  as("小葵","editor"); msgSeen("M1"); await wait(20);
  ok("按知道了會標記已看過", calls.some(x=>x[0]==="update"&&x[2]==="M1"&&x[3].seen===true));

  reset([msg("M1","小葵","hr","打錯了")]); as("小葵","editor");
  msgDel("M1"); await wait(20);
  ok("還沒被回覆可以收回", calls.some(x=>x[0]==="del"&&x[1]==="tasks"&&x[2]==="M1"));
  reset([msg("M1","小葵","hr","請假",{reply:"准了",replyBy:"HR小姐"})]); as("小葵","editor");
  msgDel("M1"); await wait(20);
  ok("已被回覆就不能收回", !calls.length && toasts.some(t=>t.includes("不能收回")));
  reset([msg("M1","小葵","hr","請假")]); as("小美","cs");
  msgDel("M1"); await wait(20);
  ok("不能收回別人的訊息", !calls.length && toasts.some(t=>t.includes("只能收回自己")));

  // ══ 海外剪輯看到的是英文 ══
  reset([msg("M1","Anna","hr","leave request",{reply:"approved",replyBy:"HR小姐",replyAt:T0+"T10:00:00"})]);
  as("Anna","intl"); COMM_TAB="open";
  { const c=viewChat();
    ok("海外看到的是英文標題", c.includes("<h2>Messages</h2>"));
    ok("海外的按鍵也是英文", c.includes(">Send<") && c.includes(">OK<")); }
  reset([msg("M1","Anna","hr","waiting")]); as("Anna","intl"); COMM_TAB="open";
  ok("海外的等待字樣是英文", viewChat().includes("Waiting for a reply"));

  // ══ render 不炸 ══
  reset([msg("M1","小葵","hr","x"), msg("M2","小美","boss","y")]);
  [["小葵","editor","work"],["小美","cs","work"],["Anna","intl","work"],
   ["小葵","editor","chat"],["HR小姐","hr","chat"],["Regina","manager","chat"],["管理員","boss","chat"],
   ["HR小姐","hr","board"],["Regina","manager","board"],["管理員","boss","board"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
