// v130：兩件會讓人默默丟掉東西的事。
//
// ① 注音選字按 Enter 就被送出＋存檔
//    回報：「我用注音輸入正在選字按下 enter，這只是在選擇字而已，但是我的那個格子的
//    文字就會被送出而且存檔」。IME 選字的那一下 keydown，event.key 一樣是 'Enter'，
//    所有 onkeydown="if(event.key==='Enter')…" 都會誤觸發。標準解法是看 event.isComposing。
//
// ② 沒做完的工作隔天就消失
//    回報：「所有員工未完成的工作不能消失，他隔了一天還要存在在原本的地方」。
//    原本只有「主管交辦的」會延到隔天，自己排的沒做完隔天就不見了 —— 等於幫人忘記。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,isConnected:true,scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(Object.prototype.hasOwnProperty.call(fields,id)) return {value:fields[id]};
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const TASK=(id,o)=>Object.assign({id,user:"小葵",date:D(0),title:"一件事",done:false,ack:true,
  report:"",contact:"",createdAt:D(0)+"T09:00:00"},o||{});
function reset(tasks){
  modalHTML=""; fields={}; FOLD_OPEN={};
  STATE={ users:[{name:"小葵",role:"editor"},{name:"江瑩",role:"mkt"},
                 {name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:["蝦皮A"],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00",dailyTemplates:[]},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  (tasks||[]).forEach(t=>{ STATE.tasks[t.id]=t; });
  CUR_TAB="work"; VIEW_AS=null; WORK_ZONE="shopee"; POOL_FILTER="all"; POOL_Q=""; ORIG_AUTO_RAN=true;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{},
    scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══════════ ① 注音選字的 Enter 不算送出 ══════════
ok("正常按 Enter 要算", enterKey({key:"Enter"})===true);
ok("選字中的 Enter 不算（isComposing）", enterKey({key:"Enter", isComposing:true})===false);
ok("舊瀏覽器的 IME 碼 229 也不算", enterKey({key:"Enter", keyCode:229})===false);
ok("其他鍵一律不算", enterKey({key:"a"})===false && enterKey({key:"Escape"})===false);
ok("沒有事件也不會爆", enterKey(null)===false && enterKey(undefined)===false);
// 全站每一個 Enter 送出都要走這個判斷，漏一個就會在那個格子裡重現同樣的問題
{ const raw=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
  const bare=(raw.match(/key\s*===\s*['"]Enter['"]/g)||[]).length;
  const guarded=(raw.match(/enterKey\(event\)/g)||[]).length;
  ok("沒有任何一處還在裸用 key==='Enter'", bare===1);            // 只剩 enterKey 自己那一行
  ok("而且真的有一堆地方在用 enterKey", guarded>=15); }

// ══════════ ② 沒做完的工作不會隔天消失 ══════════
reset([
  TASK("A",{title:"今天自己排的",date:D(0)}),
  TASK("B",{title:"昨天自己排的沒做完",date:D(-1)}),
  TASK("C",{title:"昨天自己排的做完了",date:D(-1),done:true}),
  TASK("D",{title:"三天前主管交辦沒做完",date:D(-3),assignedBy:"Regina"}),
  TASK("E",{title:"明天要做的",date:D(1)}),
  TASK("F",{title:"別人的沒做完",date:D(-1),user:"江瑩"}),
]);
as("小葵","editor");
{ const ids=myTasks().map(t=>t.id).sort().join(",");
  ok("今天排的在", ids.includes("A"));
  ok("昨天沒做完的還在（本來會消失）", ids.includes("B"));
  ok("主管交辦沒做完的照舊在", ids.includes("D"));
  ok("做完了的就不再出現", !ids.includes("C"));
  ok("排在未來的不算今天", !ids.includes("E"));
  ok("別人的不算我的", !ids.includes("F"));
  ok("剛好就是這四件", ids==="A,B,D"||ids==="A,B,D"); }
{ // 舊的排前面（越拖越久的先看到）
  const order=myTasks().map(t=>t.id);
  ok("拖最久的排最前面", order[0]==="D" && order[order.length-1]==="A"); }
{ const h=viewWork();
  ok("上班計畫上真的看得到昨天沒做完的", h.includes("昨天自己排的沒做完"));
  ok("標出「昨天沒做完」", h.includes("昨天沒做完</span>")||/昨天沒做完/.test(h));
  ok("拖三天的標「3 天前的」", h.includes("3 天前的"));
  ok("今天排的不標拖延", taskLatePill(STATE.tasks.A)===""); }
ok("拖延天數算得對", taskLateDays(STATE.tasks.B)===1 && taskLateDays(STATE.tasks.D)===3 && taskLateDays(STATE.tasks.A)===0);
ok("拖 1 天是黃的、3 天以上是紅的", taskLatePill(STATE.tasks.B).includes('pill wa') && taskLatePill(STATE.tasks.D).includes('pill em'));

// 不剪片的職位（行銷／客服／出貨）也一樣
reset([ TASK("B",{title:"昨天沒做完的行銷工作",date:D(-1),user:"江瑩"}) ]);
as("江瑩","mkt");
ok("不剪片的職位也留得住", viewWorkCS("江瑩").includes("昨天沒做完的行銷工作"));

// 主管在流程中控看到的那份要一致，不然兩邊對不起來
reset([ TASK("B",{title:"昨天沒做完的",date:D(-1)}), TASK("C",{title:"昨天做完的",date:D(-1),done:true}) ]);
as("Regina","manager");
{ const h=viewFlow();
  ok("主管也看得到那個人昨天沒做完的", h.includes("昨天沒做完的"));
  ok("做完的就不再列", !h.includes("昨天做完的")); }

// 每日固定工作是一天一件：昨天那件沒做完，不能把今天的按鈕吃掉
reset([ TASK("B",{title:"填寫今日工作日誌",date:D(-1)}) ]);
STATE.settings.dailyTemplates=[{t:"填寫今日工作日誌",r:"all"}];
as("小葵","editor");
ok("昨天沒做完的不算今天已經帶進來了", presetPending().includes("填寫今日工作日誌"));
reset([ TASK("A",{title:"填寫今日工作日誌",date:D(0)}) ]);
STATE.settings.dailyTemplates=[{t:"填寫今日工作日誌",r:"all"}];
as("小葵","editor");
ok("今天帶進來過就不再提示", !presetPending().includes("填寫今日工作日誌"));

// ══════════ ③ 剪輯手上沒剪完的影片，本來就不會隔天消失（釘住它） ══════════
reset([]);
as("小葵","editor");
STATE.videos=[
  {id:"V1",code:"1",name:"三天前認領還在剪",rawName:"三天前認領還在剪",videoCopy:"稿",rawLink:"http://raw",
   stage:"剪輯中",claimedBy:"小葵",editor:"",claimedAt:D(-3)+"T09:00:00",finishedAt:"",scheduledDate:null,
   publishedLink:"",driveFolder:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},
  {id:"V2",code:"2",name:"昨天就完成的",rawName:"昨天就完成的",videoCopy:"稿",rawLink:"http://raw",
   stage:"已上片",published:true,claimedBy:"小葵",editor:"小葵",claimedAt:D(-2)+"T09:00:00",
   finishedAt:D(-1)+"T15:00:00",scheduledDate:D(-1),publishedLink:"http://p",driveFolder:"http://d",
   locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},
];
{ const h=viewWork();
  ok("還在剪的影片不管過幾天都留在原本的地方", h.includes("三天前認領還在剪"));
  ok("已經做完的不會一直卡在今天的清單裡", !h.split("今天要做的事")[1].split("待認領")[0].includes("昨天就完成的")); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
