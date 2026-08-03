// v117：建立版本時的「名稱後綴」與「存檔資料夾」。
//
// 決策 4：建立版本自動帶後綴（蝦皮版／馬來西亞版／English version／Thai version）
// 決策 5：存檔位置自動帶入源片的 driveFolder（可再編輯）——「雲端也要同一個」
//
// 兩個容易踩的地雷：
//   ① 寫進資料庫的後綴不能用 T()。存進去的值不該跟著「現在是誰在看」變。
//   ② 帶進來的 driveFolder 還是「源片的檔案」。若把它當成剪輯自己補好的連結，
//      「已審過還缺連結」的提醒會提早消失，那支就再也沒人記得去補。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), toasts=[];
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const DRIVE="http://drive/S1";
let written=[];                                   // 攔下每一筆寫進資料庫的 video
function reset(){
  modalHTML=""; toasts=[]; written=[];
  STATE={ users:[{name:"小葵",role:"editor"},{name:"Anna",role:"intl"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:[],sources:["老闆自拍"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"acctEN"},{locale:"th",name:"acctTH"}],
      shopeeAccounts:["蝦皮A"],msAccounts:["馬來A"],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    videos:[ {id:"S1",name:"黃金一週跌12% #黃金",rawName:"黃金毛片",nameEn:"Gold dropped 12% #gold",
              videoCopy:"口播",stage:"已上片",published:true,publishedLink:"http://p",
              driveFolder:DRIVE,rawLink:"http://raw",productUrl:"http://u",locale:"",channel:"",
              scheduledDate:"2026-01-01",products:[{name:"金條",price:"100",salePrice:"90"}],
              usageHistory:[],tags:[],metrics:[]} ] };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; MODAL_DIRTY=false; MODAL_SAVE=null;
  global.window.DB={ set:async(col,id,rec)=>{ if(col==="videos") written.push(rec); },
    update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const wait=()=>new Promise(r=>setTimeout(r,60));
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{

// ══════════ ① 四條線的名稱後綴與存檔資料夾 ══════════
const CASES=[
  ["shopee", ()=>createChVersion("shopee","S1","蝦皮A"),   "黃金一週跌12%（蝦皮版）"],
  ["ms",     ()=>createChVersion("ms","S1","馬來A"),       "黃金一週跌12%（馬來西亞版）"],
  ["en",     ()=>createLocalVersion("S1","en","acctEN"),   "Gold dropped 12% (English version)"],
  ["th",     ()=>createLocalVersion("S1","th","acctTH"),   "Gold dropped 12% (Thai version)"],
];
for(const [line, call, expect] of CASES){
  reset(); as("小葵","editor"); call(); await wait();
  const rec=written[0];
  ok(`${line}：名稱自動帶後綴`, !!rec && rec.name===expect);
  ok(`${line}：存檔資料夾跟源片同一個`, !!rec && rec.driveFolder===DRIVE);
  ok(`${line}：# 標籤有去掉`, !!rec && !rec.name.includes("#"));
}

// 寫進資料庫的後綴是固定字串，不會因為「現在是誰在看」而變
reset(); as("Anna","intl"); createChVersion("shopee","S1","蝦皮A"); await wait();
ok("海外的人建立蝦皮版，存進去的還是中文後綴", written[0] && written[0].name.includes("（蝦皮版）"));
reset(); as("小葵","editor"); createLocalVersion("S1","en","acctEN"); await wait();
ok("台灣的人建立英文版，存進去的還是英文後綴", written[0] && written[0].name.includes("(English version)"));

// 源片沒有存檔資料夾就是空的，不會亂寫東西進去
reset(); as("小葵","editor"); vid("S1").driveFolder="";
createChVersion("shopee","S1","蝦皮A"); await wait();
ok("源片沒有存檔位置：帶入空字串", written[0] && written[0].driveFolder==="");

// 源片沒有英文名時，海外版本退回用中文名當底稿（總比空白好，剪輯再用 文A 翻）
reset(); as("Anna","intl"); vid("S1").nameEn="";
createLocalVersion("S1","th","acctTH"); await wait();
ok("沒有英文名時退回中文底稿＋後綴", written[0] && written[0].name==="黃金一週跌12% (Thai version)");

// 後綴不會補第二次
ok("已經有後綴的不再補", withVerSuffix("片名（蝦皮版）","shopee")==="片名（蝦皮版）");
ok("空字串不補後綴", withVerSuffix("","shopee")==="");
ok("不認識的線不補", withVerSuffix("片名","nope")==="片名");

// ══════════ ② ownDrive：繼承來的不算「自己的」 ══════════
reset();
STATE.videos.push({id:"P1",name:"蝦皮版",channel:"shopee",sourceVideoId:"S1",driveFolder:DRIVE,
  stage:"已完成",publishedLink:"",products:[],usageHistory:[],tags:[],metrics:[]});
STATE.videos.push({id:"P2",name:"蝦皮版2",channel:"shopee",sourceVideoId:"S1",driveFolder:"http://drive/mine",
  stage:"已完成",publishedLink:"",products:[],usageHistory:[],tags:[],metrics:[]});
STATE.videos.push({id:"P3",name:"蝦皮版3",channel:"shopee",sourceVideoId:"S1",driveFolder:"",
  stage:"已完成",publishedLink:"",products:[],usageHistory:[],tags:[],metrics:[]});
ok("源片自己的存檔就是自己的", ownDrive(vid("S1")));
ok("跟源片一樣＝還是源片的檔案", !ownDrive(vid("P1")));
ok("換成自己的檔案才算自己的", ownDrive(vid("P2")));
ok("空的當然不算", !ownDrive(vid("P3")));
{ // 源片被刪掉的孤兒殼：有連結就算自己的（不然永遠補不完）
  const orphan={id:"X1",channel:"shopee",sourceVideoId:"NOPE",driveFolder:"http://x"};
  STATE.videos.push(orphan);
  ok("孤兒殼有連結就算自己的", ownDrive(vid("X1"))); }

// ══════════ ③ 「已審過還缺連結」不能因為繼承的資料夾提早消失 ══════════
function reviewFixture(drive){
  reset(); as("小葵","editor");
  STATE.videos.push({id:"P1",name:"蝦皮版",channel:"shopee",sourceVideoId:"S1",driveFolder:drive,
    stage:"已完成",published:true,publishedLink:"http://post",editor:"小葵",claimedBy:"小葵",
    reviewStatus:"通過",reviewedBy:"Regina",reviewedAt:new Date(Date.now()+288e5).toISOString().slice(0,10),
    reviewAck:false,products:[],usageHistory:[],tags:[],metrics:[]});
  return viewWork();
}
ok("只有繼承來的資料夾 → 仍然提醒「還缺連結」", reviewFixture(DRIVE).includes("1 支還缺連結"));
ok("換成自己的檔案 → 提醒才消失", !reviewFixture("http://drive/mine").includes("支還缺連結"));
ok("完全沒填 → 一樣提醒", reviewFixture("").includes("1 支還缺連結"));

// ══════════ ④ 編輯視窗的小字：值還是源片帶進來的時候才出現 ══════════
reset(); as("Anna","intl");
STATE.videos.push({id:"E1",name:"EN",locale:"en",sourceVideoId:"S1",account:"acctEN",driveFolder:DRIVE,
  stage:"剪輯中",claimedBy:"Anna",editor:"Anna",publishedLink:"",products:[],usageHistory:[],tags:[],metrics:[]});
openIntlModal("E1");
ok("海外版本：有「自動帶入源片」的提示", modalHTML.includes("Pre-filled with the source"));
vid("E1").driveFolder="http://drive/mine"; modalHTML=""; openIntlModal("E1");
ok("換成自己的之後提示消失", !modalHTML.includes("Pre-filled with the source"));
vid("E1").driveFolder=""; modalHTML=""; openIntlModal("E1");
ok("空的時候也不提示（沒東西可換）", !modalHTML.includes("Pre-filled with the source"));

reset(); as("小葵","editor");
STATE.videos.push({id:"P1",name:"蝦皮版",channel:"shopee",sourceVideoId:"S1",account:"蝦皮A",driveFolder:DRIVE,
  stage:"剪輯中",claimedBy:"小葵",editor:"小葵",publishedLink:"",products:[],usageHistory:[],tags:[],metrics:[]});
openChModal("shopee","P1");
ok("蝦皮版本：有「自動帶入源片」的提示", modalHTML.includes("自動帶入源片的存檔位置"));
vid("P1").driveFolder="http://drive/mine"; modalHTML=""; openChModal("shopee","P1");
ok("蝦皮換成自己的之後提示消失", !modalHTML.includes("自動帶入源片的存檔位置"));
// 源片自己的編輯視窗不該出現這行（它就是源頭）
modalHTML=""; openVideoModal("S1", true);
ok("源片的編輯視窗沒有這行提示", !modalHTML.includes("自動帶入源片的存檔位置"));

// ══════════ ⑤ 收尾兩件（決策 8 ＋ 海外月曆的跨語言灌數）══════════
// 不新增「組長」職位，改把「退回待認領」補給主管 —— 主管本來只有「移到剪輯的今日工作」
function editingFixture(){
  reset();
  STATE.videos.push({id:"W1",name:"剪到一半",rawName:"剪到一半",stage:"剪輯中",locale:"",channel:"",
    editor:"鴻儒",claimedBy:"鴻儒",publishedLink:"",products:[],usageHistory:[],tags:[],metrics:[]});
}
for(const [u,r] of [["小葵","editor"],["Regina","manager"],["管理員","boss"]]){
  editingFixture(); as(u,r); modalHTML=""; openVideoModal("W1", true);
  ok(`${r} 看得到「退回待認領」`, modalHTML.includes("unclaimVid('W1')"));
}
// 無人認領的剪輯中：主管的「移到剪輯的今日工作」與新的「退回」兩顆並存
editingFixture(); vid("W1").editor=""; vid("W1").claimedBy="";
as("管理員","boss"); modalHTML=""; openVideoModal("W1", true);
ok("主管兩顆並存（移到今日工作＋退回）",
   modalHTML.includes("reworkVideo('W1')") && modalHTML.includes("unclaimVid('W1')"));
// 不是「剪輯中」的片沒有這顆（沒人在剪，沒東西可退）
reset(); as("管理員","boss"); modalHTML=""; openVideoModal("S1", true);
ok("已上片的不出現退回鍵", !modalHTML.includes("unclaimVid('S1')"));

// 海外月曆：英文帳號跟泰文帳號同名時，不可以互相灌數
reset(); as("Anna","intl");
STATE.settings.intlAccounts=[{locale:"en",name:"tiktok"},{locale:"th",name:"tiktok"}];
const DAY="2026-09-01";
STATE.videos.push({id:"E1",name:"EN",locale:"en",account:"tiktok",sourceVideoId:"S1",scheduledDate:DAY,
  stage:"待處理",products:[],usageHistory:[],tags:[],metrics:[]});
STATE.videos.push({id:"E2",name:"EN2",locale:"en",account:"tiktok",sourceVideoId:"S1",scheduledDate:DAY,
  stage:"待處理",products:[],usageHistory:[],tags:[],metrics:[]});
STATE.videos.push({id:"T1",name:"TH",locale:"th",account:"tiktok",sourceVideoId:"S1",scheduledDate:DAY,
  stage:"待處理",products:[],usageHistory:[],tags:[],metrics:[]});
CAL_PLAT="en"; CAL_YM=null; INTL_ACCT=""; INTL_CAL_YM=null; viewCal();
ok("英文頁只算英文的（2 支）", intlDayList(DAY,"tiktok").map(v=>v.id).sort().join(",")==="E1,E2");
CAL_PLAT="th"; INTL_ACCT=""; viewCal();
ok("泰文頁只算泰文的（1 支）", intlDayList(DAY,"tiktok").map(v=>v.id).join(",")==="T1");
ok("換頁之後 INTL_LOC 跟著走", INTL_LOC==="th");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
