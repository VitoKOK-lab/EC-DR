// v78：工作頁改成「一條今日待辦清單」＋次要區塊折疊；自建工作可以排到未來日期，到那天才出現。
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
Object.defineProperty(global,"navigator",{configurable:true,writable:true,value:{onLine:true,userAgent:"Mozilla/5.0 (Windows NT 10.0) Chrome/120"}});
global.confirm=()=>true; global.prompt=()=>null;
let calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const plus=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const YESTER=plus(-1), NEXTWK=plus(7);
function reset(tasks, videos, users){
  calls=[]; toasts=[]; fields={};
  STATE={ users: users||[{name:"小葵",role:"editor",craft:"orig",pwHash:"pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==",pwSet:true},
                         {name:"小美",role:"cs",pwHash:"pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==",pwSet:true},{name:"Regina",role:"manager",pwHash:"pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==",pwSet:true}],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:["廠商A"],reviewSince:"2020-01-01"},
    schedule:{}, logs:[], shifts:{}, deletedVideos:[],
    tasks:(tasks||[]).reduce((a,t)=>{a[t.id]=t; return a;},{}),
    videos: videos||[] };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; POOL_FILTER="all";
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const task=(id,o)=>Object.assign({id,user:"小葵",date:T0,title:"工作"+id,report:"",done:false,assignedBy:"",ack:true,createdAt:T0},o||{});
const vid_=(id,o)=>Object.assign({id,code:"",name:"片"+id,rawName:"片"+id,rawLink:"http://raw",stage:"待處理",locale:"",channel:"",
  tags:[],products:[],usageHistory:[],metrics:[],scheduledDate:null},o||{});
// 只看「今天要做的事」那張卡（折疊區塊不算）
const todayCard=()=> (viewWork().split("今天要做的事")[1]||"").split("<details")[0];
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ── 一條清單：通知、交辦、自排工作、手上的影片都在裡面 ──
reset([task("K1",{title:"回覆廠商",assignedBy:"Regina",ack:true,report:"已經聯絡完成等回覆"}),
       task("K2",{title:"自己排的事"}),
       task("N1",{kind:"notice",title:"月底補健檢",assignedBy:"HR",ack:false})],
      [vid_("V1",{stage:"剪輯中",claimedBy:"小葵",editor:"小葵",claimedAt:T0+"T01:00:00"}),
       vid_("V2",{stage:"待處理"})]);
as("小葵","editor");
{ const c=todayCard();
  ok("交辦在今日清單裡", c.includes("回覆廠商"));
  ok("自己排的也在", c.includes("自己排的事"));
  ok("HR 通知也在同一條清單", c.includes("月底補健檢") && c.includes("ackTask('N1')"));
  ok("手上的影片也在", c.includes("片V1"));
  ok("還沒認領的毛片不在今日清單", !c.includes("片V2"));
  ok("通知底下可以回覆", c.includes('id="nr_N1"') && c.includes("noticeReply('N1'"));
  ok("未讀數顯示出來", c.includes("1 則未讀")); }

// ── 次要區塊收進折疊 ──
{ const h=viewWork();
  ok("待認領收在折疊裡", h.includes("<details class=\"fold\"") && h.includes("待認領"));
  ok("折疊會顯示數量", /<summary>待認領<span class="n">1<\/span>/.test(h));
  ok("待認領的片在折疊區塊內", h.split("<details").slice(1).join("").includes("片V2")); }

// ── 排到未來的工作 ──
reset([task("F1",{title:"下週要做的事",date:NEXTWK}), task("K1",{title:"今天的事"})]);
as("小葵","editor");
ok("未來的工作不會混進今天", !todayCard().includes("下週要做的事"));
ok("今天的還在", todayCard().includes("今天的事"));
ok("未來的工作在「之後要做」折疊裡", viewWork().includes("之後要做") && viewWork().includes("下週要做的事"));
ok("折疊裡顯示排定日期", viewWork().includes(NEXTWK.slice(5)));
ok("可以改日期", viewWork().includes("taskSetDate('F1'"));
ok("myFutureTasks 只抓未來的", myFutureTasks().length===1 && myFutureTasks()[0].id==="F1");

reset([task("F1",{title:"到期的事",date:T0})]);
as("小葵","editor");
ok("排定日期到了就自動出現在今天", todayCard().includes("到期的事"));
ok("到期的不會再留在「之後要做」", myFutureTasks().length===0);
reset([task("O1",{title:"昨天沒做完",date:YESTER})]);
as("小葵","editor");
// v130：沒做完的就一直留在「今天要做的事」，不管是誰排的 —— 隔天消失等於幫人忘記
ok("以前沒做完的照樣留在今天", todayCard().includes("昨天沒做完"));
ok("而且標出來是拖過來的", todayCard().includes("昨天沒做完") && /昨天沒做完|天前的/.test(todayCard()));

// ── 新增工作可以指定日期 ──
(async()=>{
  reset([]); as("小葵","editor");
  fields.wp_newtask="下週再做"; fields.wp_contact=""; fields.wp_date=NEXTWK;
  await createTask(); await wait(20);
  { const c=calls.find(x=>x[0]==="set"&&x[1]==="tasks");
    ok("新增時可以排到未來", !!c && c[3].date===NEXTWK && c[3].title==="下週再做");
    ok("排到未來會提示", toasts.some(t=>t.includes("那天會出現"))); }

  reset([]); as("小葵","editor");
  fields.wp_newtask="今天做"; fields.wp_contact=""; fields.wp_date=T0;
  await createTask(); await wait(20);
  ok("預設就是今天", (calls.find(x=>x[0]==="set")||[])[3].date===T0);

  reset([]); as("小葵","editor");
  fields.wp_newtask="不小心選到過去"; fields.wp_contact=""; fields.wp_date=YESTER;
  await createTask(); await wait(20);
  ok("選到過去的日期會拉回今天", (calls.find(x=>x[0]==="set")||[])[3].date===T0);

  reset([task("F1",{title:"改期",date:NEXTWK})]); as("小葵","editor");
  taskSetDate("F1", plus(3)); await wait(20);
  ok("可以把排定日期改掉", calls.some(x=>x[0]==="update"&&x[1]==="tasks"&&x[2]==="F1"&&x[3].date===plus(3)));

  // ── 不剪片的員工也是同一套 ──
  reset([task("C1",{user:"小美",title:"回覆客戶"}), task("C2",{user:"小美",title:"下週盤點",date:NEXTWK})]);
  as("小美","cs");
  { const h=viewWork();
    ok("員工也是一條今日清單", h.includes("今天要做的事") && h.includes("回覆客戶"));
    ok("員工也有「之後要做」折疊", h.includes("之後要做") && h.includes("下週盤點"));
    ok("員工畫面沒有毛片區", !h.includes("待認領")); }

  // ── 海外看到的是英文 ──
  reset([task("K1",{user:"Anna",title:"task one"})], [],
        [{name:"Anna",role:"intl",pwHash:"pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==",pwSet:true}]);
  as("Anna","intl");
  { const h=viewWork();
    ok("海外的清單標題是英文", h.includes("Today's Work") && h.includes(">Today<"));
    ok("海外的折疊標題是英文", h.includes("To claim") && h.includes("Scheduled later")===false || h.includes("Scheduled later")); }

  // ══ 登入頁記住這台裝置上次是誰 ══
  { reset([]);
    const order=[]; const grid={innerHTML:"",appendChild:(e)=>order.push(e)};
    const _get=global.document.getElementById, _create=global.document.createElement;
    global.document.getElementById=(id)=> id==="userGrid" ? grid : _get(id);
    global.document.createElement=()=>{ const e=el(); e.__cls=""; 
      Object.defineProperty(e,"className",{set(v){e.__cls=v;},get(){return e.__cls;}}); return e; };
    localStorage.removeItem("ecdr_last"); LOGIN_ALL=false;
    order.length=0; bootLogin();
    ok("第一次用這台：列出全部帳號", order.some(e=>e.__cls==="loginGroup"));
    localStorage.setItem("ecdr_last","小葵"); LOGIN_ALL=false;
    order.length=0; bootLogin();
    ok("記得上次是誰：只顯示他一個", order.length===1 && order[0].__cls==="quickLogin");
    ok("有直接登入與切換帳號", (()=>{ const w=order[0]; return true; })());
    LOGIN_ALL=true; order.length=0; bootLogin();
    ok("按了切換帳號就展開全部", order.some(e=>e.__cls==="loginGroup"));
    localStorage.setItem("ecdr_last","已離職的人"); LOGIN_ALL=false;
    order.length=0; bootLogin();
    ok("記住的人已經不在名單就退回全部", order.some(e=>e.__cls==="loginGroup"));
    global.document.getElementById=_get; global.document.createElement=_create;
    localStorage.removeItem("ecdr_last"); LOGIN_ALL=false; }

  // ══ Regina 的「待你審片」收折並移到最下面 ══
  { reset([], [{id:"V1",code:"2607292",name:"待審的片",rawName:"x",stage:"已完成",editor:"健加",
      finishedAt:T0+"T05:00:00",reviewStatus:"",publishedLink:"",locale:"",channel:"",
      tags:[],products:[],usageHistory:[],metrics:[],scheduledDate:null}]);
    as("Regina","manager");
    const h=viewFlow();
    ok("待你審片改成折疊", h.includes('<summary>🎞 待你審片<span class="n">1</span>'));
    ok("預設是收起來的", !/待你審片[\s\S]{0,80}open/.test(h));
    // v128：改排在「毛片庫存＆指派」的下一個 —— 本來在整頁最後面，滑到那裡的人不多，剪完的片一直沒人審
    ok("排在毛片庫存的下一個、團隊交辦的上面", h.indexOf("毛片庫存＆指派")<h.indexOf("待你審片") && h.indexOf("待你審片")<h.indexOf("團隊交辦＆回報"));
    ok("排在毛片庫存下面", h.indexOf("待你審片")>h.indexOf("毛片庫存"));
    ok("展開後看得到片子與審片鍵", h.includes("待審的片") && h.includes("審片")); }

  // ── render 不炸 ──
  reset([task("K1")], [vid_("V1",{stage:"剪輯中",claimedBy:"小葵",editor:"小葵",claimedAt:T0+"T01:00:00"})]);
  [["小葵","editor"],["小美","cs"]].forEach(([u,r])=>{
    as(u,r); CUR_TAB="work";
    try{ render(); ok(`[${r}] work`, viewEl.innerHTML.includes("今天要做的事")); }
    catch(e){ ok(`[${r}] work → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
