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
{ const w=viewWork();
  ok("工作頁有「找主管／人資說一件事」", w.includes("找主管／人資說一件事"));
  ok("是折疊的，不是一整張卡", w.includes('<details class="fold"') && !w.includes('<details class="fold" open><summary>找主管'));
  ok("可以選人資或主管", w.includes('id="msg_to"') && w.includes('value="hr"') && w.includes('value="boss"'));
  ok("有輸入框與送出鍵", w.includes('id="msg_txt"') && w.includes("sendMsg()"));
  ok("沒訊息時不亮紅點", !w.split("找主管／人資說一件事")[1].slice(0,60).includes('class="n"')); }
reset([msg("M1","小葵","hr","請假")]); as("小葵","editor");
{ const w=viewWork();
  ok("等回覆中會寫出來", w.includes("等對方回覆中"));
  ok("還沒被回覆可以自己收回", w.includes("msgDel('M1')"));
  ok("還在等回覆時不亮紅點", !w.split("找主管／人資說一件事")[1].slice(0,60).includes('class="n"')); }
reset([msg("M1","小葵","hr","請假",{reply:"准了",replyBy:"HR小姐",replyAt:T0+"T10:00:00",seen:false})]);
as("小葵","editor");
{ const w=viewWork();
  ok("有回覆沒看過 → 亮紅點 1", w.split("找主管／人資說一件事")[1].slice(0,60).includes('class="n">1<'));
  ok("看得到回覆內容與是誰回的", w.includes("准了") && w.includes("HR小姐"));
  ok("有「知道了」可以清掉紅點", w.includes("msgSeen('M1')"));
  ok("已回覆就不能再收回", !w.includes("msgDel('M1')")); }
reset([msg("M1","小葵","hr","請假",{reply:"准了",replyBy:"HR小姐",replyAt:T0+"T10:00:00",seen:true})]);
as("小葵","editor");
{ const w=viewWork();
  ok("看過之後紅點消失", !w.split("找主管／人資說一件事")[1].slice(0,60).includes('class="n"'));
  ok("看過之後顯示已回覆", w.includes("已回覆")); }
reset([msg("M1","小美","boss","電腦壞了")]); as("小美","cs");
ok("不剪片的員工也發得出訊息", viewWork().includes("找主管／人資說一件事") && viewWork().includes("sendMsg()"));

// 人資自己也是員工，他也要能發訊息 —— 但只能發給主管，不能發給自己
reset([]); as("HR小姐","hr");
{ const t=viewTeam();
  ok("人資的看板上也有發訊息的地方", t.includes("找主管／人資說一件事") && t.includes("sendMsg()"));
  const sel=t.split('id="msg_to"')[1].split("</select>")[0];
  ok("人資只能發給主管", sel.includes('value="boss"') && !sel.includes('value="hr"')); }
reset([msg("M1","HR小姐","boss","我想調整排班")]); as("HR小姐","hr");
ok("人資看得到自己發出去的", viewTeam().includes("我想調整排班"));
as("管理員","boss");
ok("管理員收得到人資發的", viewFlow().includes("我想調整排班"));
as("小葵","editor");
{ const sel=viewWork().split('id="msg_to"')[1].split("</select>")[0];
  ok("一般員工兩個對象都選得到", sel.includes('value="hr"') && sel.includes('value="boss"')); }

// ══ 人資／主管端：沒訊息整張卡不出現 ══
reset([]); as("HR小姐","hr");
ok("人資沒收到訊息時完全不出現這張卡", !viewTeam().includes("同仁來訊"));
as("Regina","manager");
ok("主管沒收到訊息時也不出現", !viewFlow().includes("同仁來訊"));
reset([msg("M1","小葵","hr","我下週三想請假")]); as("HR小姐","hr");
{ const t=viewTeam();
  ok("人資看得到來訊", t.includes("同仁來訊") && t.includes("小葵") && t.includes("我下週三想請假"));
  ok("標出待回覆", t.includes("1 則待回覆"));
  ok("有回覆框", t.includes('id="mr_M1"') && t.includes("msgReply('M1')")); }
reset([msg("M1","小葵","hr","請假",{reply:"准了",replyBy:"HR小姐",replyAt:T0+"T10:00:00"})]);
as("HR小姐","hr");
{ const t=viewTeam();
  ok("回覆過就不再顯示輸入框", !t.includes('id="mr_M1"'));
  ok("顯示回覆內容", t.includes("准了"));
  ok("全部回覆完顯示都回覆了", t.includes("都回覆了")); }
reset([msg("M1","小美","boss","電腦壞了")]); as("Regina","manager");
ok("主管看得到給主管的來訊", viewFlow().includes("同仁來訊") && viewFlow().includes("電腦壞了"));
reset([msg("M1","小葵","hr","給人資的"), msg("M2","小美","boss","給主管的")]);
as("管理員","boss");
{ const f=viewFlow();
  ok("管理員在流程中控看得到兩種", f.includes("給人資的") && f.includes("給主管的"));
  ok("管理員看得出這則是給誰的", f.includes("給人資") && f.includes("給主管")); }
as("小葵","editor");
ok("一般員工的團隊看板不會看到別人的來訊", !viewTeam().includes("同仁來訊"));
ok("團隊看板仍然沒有按鍵", !viewTeam().includes("<button") && !viewTeam().includes("onclick"));

// ══ 送出／回覆／收回 ══
(async()=>{
  reset([]); as("小葵","editor");
  fields.msg_to="hr"; fields.msg_txt="我下週三想請假";
  await sendMsg(); await wait(20);
  { const c=calls.find(x=>x[0]==="set"&&x[1]==="tasks");
    ok("送出會寫入一筆訊息", !!c && c[3].kind==="msg" && c[3].user==="小葵" && c[3].to==="hr"
       && c[3].title==="我下週三想請假" && c[3].reply==="" && c[3].seen===false);
    ok("送出後清空輸入框", fields.msg_txt===""); }
  reset([]); as("小美","cs"); fields.msg_to="boss"; fields.msg_txt="電腦壞了";
  await sendMsg(); await wait(20);
  ok("選主管就送給主管", calls.some(x=>x[0]==="set"&&x[3].to==="boss"));
  reset([]); as("小葵","editor"); fields.msg_to="hr"; fields.msg_txt="   ";
  await sendMsg(); await wait(20);
  ok("空白不送出", !calls.length && toasts.some(t=>t.includes("請先寫下")));
  reset([]); as("小葵","editor"); VIEW_AS="小葵"; fields.msg_to="hr"; fields.msg_txt="不該送出";
  await sendMsg(); await wait(20);
  ok("員工視角唯讀不會送出", !calls.length); VIEW_AS=null;
  reset([]); as("小葵","editor"); fields.msg_to="亂填"; fields.msg_txt="x";
  await sendMsg(); await wait(20);
  ok("收件人只認得人資與主管", calls.some(x=>x[0]==="set"&&x[3].to==="hr"));

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
  as("Anna","intl");
  { const w=viewWork();
    ok("海外的折疊標題是英文", w.includes("Message HR / manager") && !w.includes("找主管／人資說一件事"));
    ok("海外的按鍵也是英文", w.includes(">Send<") && w.includes(">OK<")); }
  reset([msg("M1","Anna","hr","waiting")]); as("Anna","intl");
  ok("海外的等待字樣是英文", viewWork().includes("Waiting for a reply"));

  // ══ render 不炸 ══
  reset([msg("M1","小葵","hr","x"), msg("M2","小美","boss","y")]);
  [["小葵","editor","work"],["小美","cs","work"],["Anna","intl","work"],
   ["HR小姐","hr","team"],["Regina","manager","flow"],["管理員","boss","flow"],["管理員","boss","dashboard"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
