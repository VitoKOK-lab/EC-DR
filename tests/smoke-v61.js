// v61（v115 改寫）：原本測「一創／二創分工」，那套已被「台灣／海外分區」取代。
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
// v138：「挑一支舊片來做」的來源清單預設收起來（幾千個 DOM 節點，剪輯每次同步都要重排）。
// 這支測的是清單內容，先把它打開；「預設收起來」那件事由 smoke-v37 負責釘住。
FOLD_OPEN[foldKey("work.mkver")]=true;

const _t=toast; let toasts=[]; toast=(m)=>{toasts.push(String(m));};

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
let calls=[];
function reset(){
  calls=[]; toasts=[]; fields={}; VIEW_AS=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} };
  STATE={ users:[
      {name:"小葵",role:"editor",craft:"orig"},      // craft 欄位刻意留著：證明它沒被動到、也不再被讀
      {name:"阿明",role:"editor",craft:"derived"},
      {name:"Anna",role:"intl"},
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

// ── 判定：源片／版本殼／封存 ──
reset();
ok("認得哪支是版本殼", !isVersion(vid("R1")) && isVersion(vid("P1")) && isVersion(vid("E1")));
ok("認得哪支是源片", isSourceVid(vid("R1")) && isSourceVid(vid("S1")) && !isSourceVid(vid("P1")));
ok("已上片的版本＝封存", isArchived(vid("P9")) && isArchived(vid("E9")) && !isArchived(vid("P1")) && !isArchived(vid("S1")));

// ── craft 已經不再被讀（欄位還在資料庫，但程式不看它了）──
reset();
ok("craft 欄位仍在使用者資料上", STATE.users.find(u=>u.name==="小葵").craft==="orig");
// v142 拆掉分區：zoneOfUser 一律回傳 both（誰都看得到全部）
ok("v142：分區拆掉，每個人都看得到兩邊",
   zoneOfUser("小葵")==="both" && zoneOfUser("阿明")==="both");
ok("craft 相關的函式都不存在了",
   typeof craftOf==="undefined" && typeof doesOrig==="undefined" && typeof doesDerived==="undefined");

// ── 台灣剪輯：中文毛片＋蝦皮＋馬來，看不到英文／泰文 ──
reset(); as("小葵","editor");
let h=viewWork();
ok("台灣：待認領有毛片與蝦皮／馬來", h.includes("待剪毛片") && h.includes("蝦皮待剪") && h.includes("馬來待剪"));
ok("台灣：待認領也看得到英文（同一個池）", h.includes("英文待剪"));
ok("台灣：有「建立其他版本」卡", h.includes("建立其他版本"));
CAL_PLAT="tw"; let c=viewCal();
ok("台灣：月排程中文／蝦皮／英文全在", c.includes(">中文<") && c.includes(">蝦皮<") && c.includes(">英文<"));
openVideoModal("S1", false);
ok("台灣：影片視窗蝦皮版本卡與各語言版本都在（二創雙向）",
   modalHTML.includes("蝦皮版本") && modalHTML.includes("各語言版本"));

// ── 海外：只看英文／泰文 ──
reset(); as("Anna","intl");
h=viewWork();
ok("海外：待認領也看得到中文與蝦皮（同一個池）", h.includes("英文待剪") && h.includes("待剪毛片") && h.includes("蝦皮待剪"));
CAL_PLAT="tw"; c=viewCal();
ok("海外：月排程中文也在，預設仍落到英文", c.includes(">Chinese<") && c.includes(">English<") && CAL_PLAT==="en");

// ── 已上片的版本封存：不再佔清單版面 ──
reset(); as("小葵","editor"); WORK_ZONE="shopee";
h=viewWork();
ok("蝦皮區：已上片的不再列出，只顯示已封存數", !h.includes("蝦皮已上片") && h.includes("已封存"));
ok("未完成的版本仍列出", h.includes("蝦皮待剪"));
reset(); as("Anna","intl"); WORK_ZONE="en";
h=viewWork();
ok("英文區：已上片的同樣封存（海外看到的是英文 Archived）", !h.includes("英文已上片") && h.includes("Archived"));

// ── 設定頁：分工下拉沒了，改成唯讀的「區域」 ──
reset(); as("管理員","boss");
const st=viewSettings();
ok("設定頁有「區域」欄", st.includes("<th>區域</th>"));
ok("分工下拉已移除", !st.includes('id="mb_craft"') && !st.includes("一次創作") && !st.includes("兩種都做"));
// 成員清單那一欄改成寫「他是哪一邊的人」（v142：不再代表看得到什麼）
ok("成員清單寫得出誰在哪一邊", st.includes("台灣") && st.includes("巴基斯坦"));
ok("setMemberCraft 已移除", typeof setMemberCraft==="undefined");
reset(); as("管理員","boss"); fields={mb_name:"新剪輯",mb_role:"editor"};
addMember();
ok("新增成員不再寫 craft", calls.some(c=>c[0]==="set"&&c[1]==="users"&&c[3].name==="新剪輯"&&c[3].craft===undefined));

// ── 安全網：手上已認領的不會因分區而消失 ──
reset(); as("小葵","editor");
STATE.videos.push({id:"E5",name:"我正在剪的英文版",rawName:"x",stage:"剪輯中",locale:"en",sourceVideoId:"S1",
  editor:"小葵",claimedBy:"小葵",claimedAt:T0+"T01:00:00",tags:[],products:[],usageHistory:[],metrics:[]});
h=viewWork();
ok("跨區已認領的仍留在我的工作", h.includes("我正在剪的英文版"));

// ── 管理層與人資不受影響 ──
reset(); as("Regina","manager");
ok("Regina 流程中控正常", (()=>{ try{ return viewFlow().includes("流程中控"); }catch(e){ return false; } })());
reset(); as("管理員","boss"); CAL_PLAT="tw";
ok("管理員月排程仍有五個平台", viewCal().includes(">中文<") && viewCal().includes(">蝦皮<"));

// ── 全角色 render 不炸 ──
[["小葵","editor","work"],["阿明","editor","work"],["Anna","intl","work"],["小葵","editor","cal"],
 ["管理員","boss","dashboard"],["Regina","manager","flow"]].forEach(([u,r,tab])=>{
  reset(); as(u,r); CUR_TAB=tab;
  try{ render(); ok(`[${u}] ${tab}`, true); }catch(e){ ok(`[${u}] ${tab} → ${e.message}`, false); } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
