// 一次創作／二次創作分工：各自只看到自己負責的內容；二創上片後封存
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
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
const _t=toast; let toasts=[]; toast=(m)=>{toasts.push(String(m));};

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
let calls=[];
function reset(){
  calls=[]; toasts=[]; fields={}; VIEW_AS=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} };
  STATE={ users:[
      {name:"一創小葵",role:"editor",craft:"orig"},
      {name:"二創阿明",role:"editor",craft:"derived"},
      {name:"全能阿花",role:"editor",craft:"both"},
      {name:"沒設定的",role:"editor"},              // 未設定 → 預設一創
      {name:"Anna",role:"intl"},                    // 海外未設定 → 預設二創
      {name:"Regina",role:"manager"}, {name:"管理員",role:"boss"} ],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:["s"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"acctEN"}],shopeeAccounts:["蝦皮店A"],msAccounts:["馬來A"],
      exchangeRates:{},reviewSince:"2026-07-01"},
    schedule:{}, logs:[], tasks:{}, shifts:{}, deletedVideos:[],
    videos:[
      // 一創：毛片＋已上片可拿來二創的源片
      {id:"R1",name:"待剪毛片",rawName:"待剪毛片",rawLink:"http://raw",stage:"待處理",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
      {id:"S1",name:"已上片源片",rawName:"已上片源片",stage:"已上片",published:true,tags:["舊片"],publishedLink:"http://p",
       driveFolder:"http://d",finishedAt:"2026-07-02T05:00:00",locale:"",channel:"",products:[],usageHistory:[],metrics:[]},
      // 二創：待做的殼
      {id:"P1",name:"蝦皮待剪",rawName:"已上片源片",stage:"待處理",channel:"shopee",sourceVideoId:"S1",account:"蝦皮店A",tags:[],products:[],usageHistory:[],metrics:[]},
      {id:"M1",name:"馬來待剪",rawName:"已上片源片",stage:"待處理",channel:"ms",sourceVideoId:"S1",account:"馬來A",tags:[],products:[],usageHistory:[],metrics:[]},
      {id:"E1",name:"英文待剪",rawName:"已上片源片",stage:"待處理",locale:"en",sourceVideoId:"S1",account:"acctEN",tags:[],products:[],usageHistory:[],metrics:[]},
      // 二創：已上片＝完成任務，應封存
      {id:"P9",name:"蝦皮已上片",rawName:"已上片源片",stage:"已上片",published:true,channel:"shopee",sourceVideoId:"S1",account:"蝦皮店A",
       publishedLink:"http://sp",driveFolder:"http://d",finishedAt:"2026-07-03T05:00:00",tags:[],products:[],usageHistory:[],metrics:[]},
      {id:"E9",name:"英文已上片",rawName:"已上片源片",stage:"已完成",editor:"Anna",channel:"",locale:"en",sourceVideoId:"S1",account:"acctEN",
       publishedLink:"http://tt",driveFolder:"http://d",finishedAt:"2026-07-03T05:00:00",tags:[],products:[],usageHistory:[],metrics:[]},
    ] };
  WORK_ZONE="shopee"; POOL_FILTER="all"; CAL_PLAT="tw"; CAL_YM=null; INTL_CAL_YM=null; INTL_ACCT=""; CH_Q={shopee:"",ms:""}; INTL_Q="";
  CH_CAL={shopee:{ym:null,acct:""},ms:{ym:null,acct:""}};
}
function as(u,r){ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); }
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ── 分工判定 ──
reset();
ok("一創／二創／兩種都認得", craftOf("一創小葵")==="orig" && craftOf("二創阿明")==="derived" && craftOf("全能阿花")==="both");
ok("剪輯未設定 → 預設一次創作", craftOf("沒設定的")==="orig");
ok("海外剪輯未設定 → 預設二次創作", craftOf("Anna")==="derived");
ok("管理層固定看全部", craftOf("Regina")==="both" && craftOf("管理員")==="both");
ok("認得哪支是二創", !isDerived(vid("R1")) && isDerived(vid("P1")) && isDerived(vid("E1")));
ok("已上片的二創＝封存", isArchived(vid("P9")) && isArchived(vid("E9")) && !isArchived(vid("P1")) && !isArchived(vid("S1")));

// ── 一創剪輯：只看得到原創 ──
reset(); as("一創小葵","editor");
let h=viewWork();
ok("一創：待認領只有毛片", h.includes("待剪毛片") && !h.includes("蝦皮待剪") && !h.includes("馬來待剪") && !h.includes("英文待剪"));
ok("一創：沒有「建立二創版本」卡", !h.includes("建立二創版本"));
CAL_PLAT="tw"; let c=viewCal();
ok("一創：月排程只有中文", c.includes(">中文<") && !c.includes(">蝦皮<") && !c.includes(">英文<"));
openVideoModal("S1", false);
ok("一創：影片視窗不顯示二創版本卡", !modalHTML.includes("蝦皮版本") && !modalHTML.includes("各語言版本"));

// ── 二創剪輯：只看得到二創 ──
reset(); as("二創阿明","editor");
h=viewWork();
ok("二創：待認領只有二創殼", h.includes("蝦皮待剪") && h.includes("馬來待剪") && h.includes("英文待剪") && !h.includes("待剪毛片"));
ok("二創：有「建立二創版本」卡", h.includes("建立二創版本"));
CAL_PLAT="tw"; c=viewCal();
ok("二創：月排程沒有中文、自動切到蝦皮", !c.includes(">中文<") && c.includes(">蝦皮<") && CAL_PLAT!=="tw");
openVideoModal("S1", false);
ok("二創：影片視窗顯示二創版本卡", modalHTML.includes("蝦皮版本")||modalHTML.includes("各語言版本"));

// ── 兩種都做：全部看得到（維持舊行為）──
reset(); as("全能阿花","editor");
h=viewWork();
ok("兩種都做：毛片與二創殼都在", h.includes("待剪毛片") && h.includes("蝦皮待剪") && h.includes("英文待剪"));
c=viewCal();
ok("兩種都做：月排程五個平台都在", c.includes(">中文<") && c.includes(">蝦皮<") && c.includes(">英文<") && c.includes(">馬來西亞<"));

// ── 海外剪輯預設就是二創 ──
reset(); as("Anna","intl");
h=viewWork();
ok("海外：只看二創殼", h.includes("英文待剪") && !h.includes("待剪毛片"));

// ── 已上片的二創封存：不再佔清單版面 ──
reset(); as("二創阿明","editor"); WORK_ZONE="shopee";
h=viewWork();
ok("二創區：已上片的不再列出，只顯示已封存數", !h.includes("蝦皮已上片") && h.includes("已封存"));
ok("未完成的二創仍列出", h.includes("蝦皮待剪"));
reset(); as("二創阿明","editor"); WORK_ZONE="en";
h=viewWork();
ok("英文區：已上片的同樣封存", !h.includes("英文已上片") && h.includes("已封存"));

// ── 設定：管理員可指定分工 ──
reset(); as("管理員","boss");
const st=viewSettings();
ok("設定有「負責」欄與三個選項", st.includes("負責") && st.includes("一次創作") && st.includes("二次創作") && st.includes("兩種都做"));
ok("新增成員可一併指定分工", st.includes('id="mb_craft"'));
reset(); as("管理員","boss"); setMemberCraft("一創小葵","derived");
ok("改分工會寫入資料庫", calls.some(c=>c[0]==="update"&&c[1]==="users"&&c[2]==="一創小葵"&&c[3].craft==="derived"));
reset(); as("管理員","boss"); fields={mb_name:"新剪輯",mb_role:"editor",mb_craft:"derived"};
addMember();
ok("新增成員帶分工", calls.some(c=>c[0]==="set"&&c[1]==="users"&&c[3].craft==="derived"));

// ── 安全網：手上已認領的不會因分工而消失 ──
reset(); as("一創小葵","editor");
STATE.videos.push({id:"P5",name:"我正在剪的蝦皮",rawName:"x",stage:"剪輯中",channel:"shopee",sourceVideoId:"S1",
  editor:"一創小葵",claimedBy:"一創小葵",claimedAt:T0+"T01:00:00",tags:[],products:[],usageHistory:[],metrics:[]});
h=viewWork();
ok("已認領的二創仍留在我的工作", h.includes("我正在剪的蝦皮"));

// ── 管理層與人資不受影響 ──
reset(); as("Regina","manager");
ok("Regina 流程中控正常", (()=>{ try{ return viewFlow().includes("流程中控"); }catch(e){ return false; } })());
reset(); as("管理員","boss"); CAL_PLAT="tw";
ok("管理員月排程仍有五個平台", viewCal().includes(">中文<") && viewCal().includes(">蝦皮<"));

// ── 全角色 render 不炸 ──
[["一創小葵","editor","work"],["二創阿明","editor","work"],["Anna","intl","work"],["全能阿花","editor","cal"],
 ["管理員","boss","dashboard"],["Regina","manager","flow"]].forEach(([u,r,tab])=>{
  reset(); as(u,r); CUR_TAB=tab;
  try{ render(); ok(`[${u}] ${tab}`, true); }catch(e){ ok(`[${u}] ${tab} → ${e.message}`, false); } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
