// 重構保險：把「所有角色 × 所有分頁 × 主要彈窗」的輸出 HTML 存成基準快照，
// 重構後必須逐字元一致（純整理程式碼＝畫面不該有任何差異）。
//   建立基準：node tests/snapshot.js --save
//   比對：    node tests/snapshot.js
const fs = require("fs");
const path = require("path");
const SNAP = path.join(__dirname, "snapshot.json");

let src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8").replace(/^let /gm, "");
const el = () => ({ value:"", innerHTML:"", textContent:"", className:"", style:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){}, appendChild(){}, querySelector(){return null;}, querySelectorAll(){return [];},
  getAttribute(){return null;}, setAttribute(){}, closest(){return null;}, getBoundingClientRect(){return {top:0,left:0,bottom:0,right:0};} });
const store={};
global.localStorage = { getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };
let modalHTML="", viewEl=el();
global.document = { getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){ Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}}); } return e; },
  addEventListener(){}, createElement:()=>el(), body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null, querySelectorAll:()=>[] };
global.window = { addEventListener(){}, innerWidth:1200, innerHeight:800, scrollY:0, scrollTo(){}, DB:null, location:{reload(){}} };
global.requestAnimationFrame=(f)=>f();
global.navigator = { onLine:true };
global.confirm = ()=>true; global.prompt = ()=>null;
eval(src);

// ── 固定測試資料（含各線各狀態，盡量把畫面每個分支都踩到）──
const D = "2026-07-20";          // 固定日期，快照才不會每天變
const D2 = "2026-06-15";
STATE = {
  users:[ {name:"Regina",role:"manager"}, {name:"小葵",role:"editor"}, {name:"阿明",role:"editor"},
          {name:"Anna",role:"intl"}, {name:"管理員",role:"boss"}, {name:"HR小姐",role:"hr"} ],
  settings:{ dailyTarget:4, videoTags:["新片","舊片","寵粉","珠寶介紹"], sources:["老闆自拍","外部公司"],
    postPlatforms:[{name:"IG 主帳號",utm:"ig_main"},{name:"FB 粉專",utm:"fb"}],
    intlAccounts:[{locale:"en",name:"tiktok-EN"},{locale:"th",name:"tiktok-TH"}],
    shopeeAccounts:["蝦皮店A","蝦皮店B"], msAccounts:["tiktok-MY"],
    intlDailyTarget:2, shopeeDailyTarget:2, msDailyTarget:2, reviewSince:"2026-07-01",
    exchangeRates:{en:{code:"USD",rate:0.031,mult:1},th:{code:"THB",rate:1.1,mult:1},
                   ms:{code:"MYR",rate:0.14,mult:1},shopee:{code:"TWD",rate:1,mult:1.2}},
    contacts:["廠商A"], adminPassword:"1234", reuseWindowDays:30, scheduleHorizonDays:30 },
  schedule:{ [D]:{ slots:[{videoId:"S1",time:"10:00",reused:true,by:"小葵",at:D+"T09:00:00",publishedLink:"http://p1",driveFolder:"http://d1"}] } },
  tasks:{ T1:{id:"T1",user:"小葵",date:D,title:"回覆廠商",contact:"廠商A",report:"已聯絡完成回報中",done:false,assignedBy:"Regina",ack:true,createdAt:D+"T01:00:00"},
          T2:{id:"T2",user:"小葵",date:D,title:"寄樣品",contact:"",report:"",done:false,assignedBy:"Regina",ack:false,createdAt:D+"T02:00:00"},
          T3:{id:"T3",user:"Anna",date:D,title:"Check comments",contact:"",report:"done all",done:true,assignedBy:"",ack:true,createdAt:D+"T03:00:00"},
          T4:{id:"T4",user:"小葵",date:D,title:"影片清單整理",contact:"",report:"清單已重新排序完成",done:true,assignedBy:"",ack:true,createdAt:D+"T04:00:00",hrSeenBy:"HR小姐",hrSeenAt:D+"T18:00:00"} },
  shifts:{ ["小葵__"+D]:{id:"a",user:"小葵",date:D,clockIn:D+"T01:00:00Z",clockOut:""},
           ["阿明__"+D]:{id:"b",user:"阿明",date:D,clockIn:D+"T01:00:00Z",clockOut:D+"T10:00:00Z"} },
  logs:[{id:"L1",at:D+"T05:00:00",user:"小葵",role:"editor",action:"已新增影片",target:"某片"}],
  deletedVideos:[{id:"X1",name:"被刪的片",rawName:"被刪的片",deleted:true,deletedBy:"小葵",deletedAt:D+"T06:00:00",tags:[],products:[],usageHistory:[],metrics:[]}],
  videos:[
    {id:"S1",code:"001",name:"中文源片 #tag",rawName:"中文源片",nameEn:"Chinese source",videoCopy:"口播文案",videoCopyEn:"Script EN",
     stage:"已上片",published:true,publishedLink:"http://pub1",driveFolder:"http://drv1",rawLink:"http://raw1",
     editor:"小葵",claimedBy:"小葵",claimedAt:D2+"T01:00:00",finishedAt:D2+"T05:00:00",scheduledDate:D2,publishTime:"10:00",
     tags:["舊片","寵粉"],mainType:"寵粉",source:"老闆自拍",origLang:"",locale:"",channel:"",totalUsed:2,
     products:[{name:"項鍊",price:"3000",salePrice:"2400"},{name:"手鍊",price:"1500",salePrice:""}],
     productUrl:"http://shop/1",platforms:["IG 主帳號"],reviewStatus:"通過",reviewedBy:"Regina",reviewedAt:D2+"T06:00:00",
     usageHistory:[{date:D,link:"http://p1",drive:"http://d1",time:"10:00",by:"小葵",at:D+"T09:00:00"}],
     metrics:[{platform:"IG",account:"ig_main",views:1200,likes:80,comments:5,shares:3,at:D+"T12:00:00"}],metricsAt:D+"T12:00:00"},
    {id:"S2",code:"002",name:"泰文原本",rawName:"泰文原本",stage:"待處理",origLang:"th",locale:"",channel:"",
     tags:["新片"],source:"外部公司",products:[],usageHistory:[],metrics:[]},
    {id:"R1",name:"未指派毛片",rawName:"未指派毛片",stage:"待處理",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
    {id:"R2",name:"指派給小葵的毛片",rawName:"指派給小葵的毛片",stage:"待處理",assignedTo:"小葵",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
    {id:"W1",name:"小葵剪輯中",rawName:"小葵剪輯中",stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:D2+"T01:00:00",
     locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
    {id:"W2",name:"待審核的片",rawName:"待審核的片",stage:"已完成",editor:"小葵",claimedAt:D+"T01:00:00",finishedAt:D+"T05:00:00",
     driveFolder:"http://drv2",reviewStatus:"",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
    {id:"W3",name:"審過缺連結",rawName:"審過缺連結",stage:"已完成",editor:"小葵",finishedAt:D+"T05:00:00",
     reviewStatus:"通過",reviewedBy:"Regina",reviewedAt:D+"T06:00:00",driveFolder:"",publishedLink:"",
     locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
    {id:"W4",name:"被退回的片",rawName:"被退回的片",stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:D+"T01:00:00",
     reviewStatus:"退回",reviewNote:"字卡打錯",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
    {id:"E1",name:"EN version",rawName:"中文源片",stage:"待處理",locale:"en",sourceVideoId:"S1",account:"tiktok-EN",
     createdBy:"Anna",createdAt:D+"T01:00:00",scheduledDate:D,tags:[],products:[],usageHistory:[],metrics:[]},
    {id:"E2",name:"EN done",rawName:"中文源片",stage:"已完成",locale:"en",sourceVideoId:"S1",account:"tiktok-EN",
     editor:"Anna",claimedBy:"Anna",claimedAt:D+"T01:00:00",finishedAt:D+"T05:00:00",publishedLink:"http://tt1",
     driveFolder:"http://drv3",scheduledDate:D,tags:[],products:[],usageHistory:[],metrics:[]},
    {id:"T1v",name:"TH version",rawName:"中文源片",stage:"剪輯中",locale:"th",sourceVideoId:"S1",account:"tiktok-TH",
     editor:"Anna",claimedBy:"Anna",claimedAt:D+"T01:00:00",scheduledDate:D,tags:[],products:[],usageHistory:[],metrics:[]},
    {id:"P1",name:"蝦皮版",rawName:"中文源片",stage:"待處理",channel:"shopee",sourceVideoId:"S1",account:"蝦皮店A",
     createdBy:"小葵",createdAt:D+"T01:00:00",scheduledDate:D,tags:[],products:[],usageHistory:[],metrics:[]},
    {id:"M1",name:"馬來版",rawName:"中文源片",stage:"剪輯中",channel:"ms",sourceVideoId:"S1",account:"tiktok-MY",
     editor:"小葵",claimedBy:"小葵",claimedAt:D+"T01:00:00",tags:[],products:[],usageHistory:[],metrics:[]},
    {id:"W5",name:"人資已檢查鎖定的片",rawName:"x",stage:"已上片",published:true,editor:"小葵",finishedAt:D+"T05:00:00",
     reviewStatus:"通過",hrCheckedBy:"HR小姐",hrCheckedAt:D+"T20:00:00",driveFolder:"http://d",publishedLink:"http://p",
     locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
  ],
};

// ── 逐一渲染並收集 ──
const out = {};
function snap(key, fn){ try{ out[key] = String(fn()); }catch(e){ out[key] = "THREW: " + e.message; } }
function as(user, role){ localStorage.setItem("ecdr_user", user); localStorage.setItem("ecdr_role", role); }
function resetUI(){ CAL_PLAT="tw"; CAL_YM=[2026,6]; INTL_CAL_YM=[2026,6]; INTL_ACCT="";
  CH_CAL={shopee:{ym:[2026,6],acct:""},ms:{ym:[2026,6],acct:""}}; HR_YM=null; HR_TAB="pending"; HR_WHO="";
  WORK_ZONE="shopee"; POOL_FILTER="all"; VID_LANG=""; VID_VIEW="rawNoSched"; VID_TAGS=new Set();
  VID_Q=""; INTL_Q=""; CH_Q={shopee:"",ms:""}; SHIFT_DATE=D; VIEW_AS=null; }

const ROLES = [["管理員","boss"],["Regina","manager"],["小葵","editor"],["Anna","intl"],["HR小姐","hr"]];
const VIEWS = { dashboard:()=>viewDashboard(), flow:()=>viewFlow(), work:()=>viewWork(), videos:()=>viewVideos(),
                cal:()=>viewCal(), settings:()=>viewSettings(), log:()=>viewLog(), trash:()=>viewTrash(), perf:()=>viewPerf(),
                hr:()=>viewHR() };

for (const [user, role] of ROLES) {
  as(user, role);
  for (const [name, fn] of Object.entries(VIEWS)) { resetUI(); snap(`${role}/${name}`, fn); }
  // 月排程五個平台
  for (const p of ["tw","th","shopee","en","ms"]) { resetUI(); CAL_PLAT=p; snap(`${role}/cal:${p}`, ()=>viewCal()); }
  for (const t of ["pending","done"]) { resetUI(); HR_TAB=t; snap(`${role}/hr:${t}`, ()=>viewHR()); }
  // 二創區四個分頁
  for (const z of ["shopee","ms","en","th"]) { resetUI(); WORK_ZONE=z; snap(`${role}/zone:${z}`, ()=>createZoneCard()); }
  // 待認領六種篩選
  for (const f of ["all","tw","shopee","ms","en","th"]) { resetUI(); POOL_FILTER=f; snap(`${role}/pool:${f}`, ()=>viewWork()); }
  // 影片庫五個分段 × 語言
  for (const v of ["rawNoSched","rawSched","newNoSched","newSched","old"]) { resetUI(); VID_VIEW=v; snap(`${role}/lib:${v}`, ()=>viewVideos()); }
  for (const l of ["","th","en","my"]) { resetUI(); VID_LANG=l; snap(`${role}/lang:${l}`, ()=>viewVideos()); }
  // 彈窗
  const MODALS = { vidView:()=>openVideoModal("S1",false), vidEdit:()=>openVideoModal("S1",true),
                   vidEditWip:()=>openVideoModal("W1",true), intlModal:()=>openIntlModal("E1"),
                   thModal:()=>openIntlModal("T1v"), chShopee:()=>openChModal("shopee","P1"),
                   chMs:()=>openChModal("ms","M1"), day:()=>openDay(D), dayIntl:()=>{ INTL_ACCT="tiktok-EN"; openDayIntl(D); },
                   dayCh:()=>{ CH_CAL.shopee.acct="蝦皮店A"; openDayCh("shopee",D); },
                   newVideo:()=>newSimpleVideo(), batch:()=>batchNewFootage(),
                   hrLocked:()=>openVideoModal("W5",false) };
  for (const [name, open] of Object.entries(MODALS)) { resetUI(); modalHTML=""; try{ open(); }catch(e){ modalHTML="THREW: "+e.message; } out[`${role}/modal:${name}`]=modalHTML; }
}

// ── 存檔或比對 ──
if (process.argv.includes("--save")) {
  fs.writeFileSync(SNAP, JSON.stringify(out, null, 1));
  console.log(`已建立基準快照：${Object.keys(out).length} 個畫面 → ${SNAP}`);
  process.exit(0);
}
if (!fs.existsSync(SNAP)) { console.log("找不到基準快照，請先跑：node tests/snapshot.js --save"); process.exit(1); }
const base = JSON.parse(fs.readFileSync(SNAP, "utf8"));
const keys = [...new Set([...Object.keys(base), ...Object.keys(out)])];
const diffs = keys.filter(k => base[k] !== out[k]);
if (!diffs.length) { console.log(`快照一致：${keys.length} 個畫面完全相同`); process.exit(0); }
console.log(`快照不一致（${diffs.length}/${keys.length}）：`);
diffs.slice(0, 10).forEach(k => {
  const a = base[k] || "(新增)", b = out[k] || "(消失)";
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  console.log(`\n── ${k}（第 ${i} 字起不同）`);
  console.log("  舊：…" + a.slice(Math.max(0, i - 60), i + 90).replace(/\s+/g, " "));
  console.log("  新：…" + b.slice(Math.max(0, i - 60), i + 90).replace(/\s+/g, " "));
});
process.exit(1);
