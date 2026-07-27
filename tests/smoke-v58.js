// 員工視角唯讀保護 ＋ 操作紀錄：所有直接寫資料庫的動作都不能在預覽模式下改到資料
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
    const e=el(); if(fields[id]!=null) e.value=fields[id];
    if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>"1";
eval(src);

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
let calls=[], toasts=[];
const _toast=toast; toast=(m)=>{ toasts.push(String(m)); };
function reset(){
  calls=[]; toasts=[]; fields={};
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async(d,o)=>{calls.push(["sched",d,o]);}, setSettings:async(p)=>{calls.push(["settings",p]);} };
  STATE={ users:[{name:"小葵",role:"editor"},{name:"阿明",role:"editor"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:["s"],postPlatforms:[],intlAccounts:[],shopeeAccounts:[],msAccounts:[],
      exchangeRates:{},contacts:["廠商A"],reviewSince:"2026-07-01"},
    schedule:{}, logs:[], deletedVideos:[], hrchecks:{},
    tasks:{ K1:{id:"K1",user:"小葵",date:T0,title:"回覆廠商",report:"已經完成聯絡並回報後續會追蹤",done:false,assignedBy:"Regina",ack:false,createdAt:T0} },
    shifts:{}, videos:[
      {id:"V1",name:"某片",rawName:"某片",stage:"已完成",editor:"小葵",finishedAt:T0+"T05:00:00",reviewStatus:"",
       driveFolder:"http://d",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
      {id:"V2",name:"待剪片",rawName:"待剪片",stage:"待處理",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
    ] };
  localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
  VIEW_AS=null;
}
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ── 員工視角下，所有動作都不能寫入 ──
const ACTIONS=[
  ["收到交辦",      ()=>ackTask("K1")],
  ["交辦打勾完成",  ()=>{ STATE.tasks.K1.ack=true; taskDone("K1",true); }],
  ["交辦填回報",    ()=>taskReport("K1","更新一下進度內容")],
  ["刪除交辦",      ()=>delTask("K1")],
  ["轉移交辦",      ()=>transferTask("K1")],
  ["指派交辦",      ()=>{ fields.asg_who="小葵"; fields.asg_txt="做一件事"; assignTaskSel(); }],
  ["指派毛片",      ()=>{ fields.afp_who="小葵"; assignFootage(); }],
  ["收回指派",      ()=>unassignEditor("小葵")],
  ["審片通過",      ()=>reviewVid("V1","通過")],
  ["改作業步驟",    ()=>setWorkStep("V1",2)],
  ["人資記錄",      ()=>hrCheckVideo("V1")],
  ["人資清紀錄",    ()=>hrClearCheck("V1")],
  ["自建工作項目",  ()=>{ fields.wp_newtask="自己的事"; createTask(); }],
  ["常用項目",      ()=>addPresetTask("影片清單整理")],
  ["新增窗口",      ()=>{ fields.ct_name="新窗口"; addContact(); }],
  ["刪除窗口",      ()=>delContact("廠商A")],
  ["批次新增毛片",  ()=>{ fields.b_names="片一\n片二"; batchNewFootage(); }],
  ["成員改名",      ()=>renameMember("小葵")],
];
let blocked=0;
ACTIONS.forEach(([name,fn])=>{
  reset(); VIEW_AS="小葵"; localStorage.setItem("ecdr_role","editor");
  try{ fn(); }catch(e){}
  const wrote=calls.length>0;
  if(!wrote) blocked++; else console.log("   ✗ 員工視角下仍寫入:", name, JSON.stringify(calls[0]).slice(0,80));
});
ok(`員工視角下 ${ACTIONS.length} 個動作全部被擋`, blocked===ACTIONS.length);

// ── 正常模式下這些動作要能寫入（沒有擋過頭）──
reset(); ackTask("K1");
ok("正常模式：收到交辦有寫入", calls.some(c=>c[0]==="update"&&c[1]==="tasks"));
reset(); STATE.tasks.K1.ack=true; taskDone("K1",true);
ok("正常模式：打勾完成有寫入", calls.some(c=>c[0]==="update"&&c[2]==="K1"&&c[3].done===true));
reset(); reviewVid("V1","通過");
ok("正常模式：審片有寫入", calls.some(c=>c[0]==="update"&&c[1]==="videos"&&c[3].reviewStatus==="通過"));

// ── 操作紀錄：關鍵動作都要留痕跡（紀錄是寫入成功後才補，所以要等一拍）──
const seen=[];
async function logsOf(fn){ reset();
  const _set=global.window.DB.set;
  global.window.DB.set=async(c,id,o)=>{ if(c==="logs") seen.push(o); calls.push(["set",c,id,o]); };
  seen.length=0;
  try{ fn(); }catch(e){}
  await new Promise(r=>setTimeout(r,5));
  return seen.slice(); }
(async()=>{
  const LOGGED=[
    ["審片通過", ()=>reviewVid("V1","通過"), "審片"],
    ["刪除交辦", ()=>delTask("K1"), "刪除交辦"],
    ["收到交辦", ()=>ackTask("K1"), "收到交辦"],
    ["交辦完成", ()=>{ STATE.tasks.K1.ack=true; taskDone("K1",true); }, "交辦工作標記完成"],
    ["人資記錄", ()=>hrCheckVideo("V1"), "人資檢查"],
  ];
  let logged=0;
  for(const [name,fn,kw] of LOGGED){ const ls=await logsOf(fn);
    if(ls.some(l=>String(l.action||"").includes(kw))) logged++;
    else console.log("   ✗ 沒寫操作紀錄:", name); }
  ok(`${LOGGED.length} 個關鍵動作都有寫操作紀錄`, logged===LOGGED.length);

  const ls=await logsOf(()=>reviewVid("V1","通過"));
  const l=ls.find(x=>String(x.action||"").includes("審片"));
  ok("紀錄含操作者與片名", !!l && l.user==="管理員" && String(l.target||"").includes("某片"));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
