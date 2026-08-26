const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
src = src.replace(/^let /gm, "");
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
// v138：「挑一支舊片來做」的來源清單預設收起來（幾千個 DOM 節點，剪輯每次同步都要重排）。
// 這支測的是清單內容，先把它打開；「預設收起來」那件事由 smoke-v37 負責釘住。
FOLD_OPEN[foldKey("work.mkver")]=true;


STATE = {
  users:[ {name:"小葵",role:"editor",craft:"both"}, {name:"Anna",role:"intl",craft:"both"}, {name:"老闆",role:"boss"} ],
  settings:{ dailyTarget:4, videoTags:["舊片"], sources:["老闆自拍"], postPlatforms:[{name:"IG",utm:"ig"}],
    intlAccounts:[{locale:"th",name:"tiktok-TH"},{locale:"en",name:"tiktok-EN"}],
    shopeeAccounts:["蝦皮店A"], msAccounts:["tiktok-Malaysia"], exchangeRates:{} },
  schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
  videos:[
    {id:"S1",name:"黃金原本",rawName:"黃金原本",nameEn:"Golden original #gold",videoCopy:"黃金文案",videoCopyEn:"Golden copy EN",rawLink:"http://raw",stage:"待處理",locale:"",channel:"",origLang:"",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"S2",name:"已上片源片",rawName:"已上片源片",nameEn:"Published source",stage:"已上片",published:true,tags:["舊片"],publishedLink:"http://x",finishedAt:"2020-01-01T00:00:00Z",locale:"",channel:"",usageHistory:[],products:[],metrics:[]},
    {id:"E1",name:"EN version title",rawName:"已上片源片",stage:"待處理",locale:"en",sourceVideoId:"S2",account:"tiktok-EN",createdBy:"Regina",createdAt:"2026-07-01T00:00:00Z",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"T1",name:"TH version title",rawName:"已上片源片",stage:"待處理",locale:"th",sourceVideoId:"S2",account:"tiktok-TH",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"P1",name:"蝦皮版標題",rawName:"已上片源片",stage:"待處理",channel:"shopee",sourceVideoId:"S2",account:"蝦皮店A",createdBy:"Regina",createdAt:"2026-07-01T00:00:00Z",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"M1",name:"馬來版標題",rawName:"已上片源片",stage:"待處理",channel:"ms",sourceVideoId:"S2",account:"tiktok-Malaysia",usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ── 全員畫面一致：池合併（原本＋蝦/馬/EN/TH）；殼有退回鍵 ──
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
WORK_ZONE="shopee";
let h=viewWork();
// v115 分區：台灣的池只有中文毛片＋蝦皮＋馬來，英文／泰文歸海外
ok("台灣池＝中文＋蝦皮＋馬來", h.includes("黃金原本") && h.includes("蝦皮版標題") && h.includes("馬來版標題"));
// v142 拆掉分區：同一個池子
ok("台灣池也看得到英文／泰文", h.includes("EN version title") && h.includes("TH version title"));
ok("台灣的蝦/馬殼有退回鍵", h.includes(`chDiscard('shopee','P1')`) && h.includes(`chDiscard('ms','M1')`));
ok("editor 原本毛片沒有退回鍵", !h.includes(`intlDiscard('S1')`) && !h.includes(`chDiscard('shopee','S1')`));
ok("台灣的建立版本四條線全在（二創雙向）", [">蝦皮<",">馬來西亞<",">英文 TikTok<",">泰文 TikTok<"].every(x=>h.includes(x)));
ok("editor 池顯示建立者", h.includes("由 Regina 建立"));
ok("editor 不顯示英文小字", !h.includes("vt-en"));
// editor 手上已認領的海外殼仍看得到（安全網：不會消失）
STATE.videos.push({id:"E9",name:"EN claimed",rawName:"已上片源片",stage:"剪輯中",locale:"en",sourceVideoId:"S2",claimedBy:"小葵",claimedAt:"2026-01-01T00:00:00Z",usageHistory:[],tags:[],products:[],metrics:[]});
h=viewWork();
ok("editor 已認領的海外殼仍在我的工作", h.includes("EN claimed"));
STATE.videos = STATE.videos.filter(v=>v.id!=="E9");

// ── 海外剪輯：同一份合併清單（英文介面）；二創區同樣四區 ──
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
WORK_ZONE="shopee";
h=viewWork();
ok("海外池＝英文＋泰文", h.includes("EN version title") && h.includes("TH version title"));
ok("海外池也看得到中文毛片／蝦皮／馬來", h.includes("黃金原本") && h.includes("蝦皮版標題") && h.includes("馬來版標題"));
ok("海外的殼有退回鍵，蝦皮殼也退得了（同一個池）", h.includes(`intlDiscard('E1')`) && h.includes(`chDiscard('shopee','P1')`));
ok("海外的建立版本四條線也全在", ["English (TikTok)","Thai (TikTok)",">Shopee<",">Malaysia<"].every(x=>h.includes(x)));
ok("intl 池顯示建立者(英文)", h.includes("added by Regina"));
// 英文區的帳號下拉只列英文帳號，且 value 是全清單索引
WORK_ZONE="en"; h=viewWork(); let zc=h.split("Create a version").slice(-1)[0];
ok("英文區只列 EN 帳號", zc.includes("tiktok-EN") && !zc.includes("tiktok-TH"));
ok("帳號 option 索引對應全清單", zc.includes('value="1">tiktok-EN'));
WORK_ZONE="th"; h=viewWork(); zc=h.split("Create a version").slice(-1)[0];
ok("泰文區只列 TH 帳號", zc.includes("tiktok-TH") && !zc.includes("tiktok-EN"));
ok("泰文區版本 chip 只列 TH", !zc.includes(`openIntlModal('E1')`) && zc.includes(`openIntlModal('T1')`));

// ── 海外視角：中文標題底下一行英文小字 ──
// v146：海外的影片庫跟台灣同一份，英文小字走共用清單的 vt-en
ZONE_VIEW=null; VID_LANG=""; VID_VIEW="old"; VID_TAGS=new Set(); VID_Q=""; INTL_Q="";
vid("S2").nameEn="Published source #gold";
h=viewVideos();
ok("intl 影片庫中文下有英文小字", h.includes("vt-en") && h.includes("Published source"));
ok("英文小字去掉 hashtag", !h.includes("Published source #gold"));
vid("S2").nameEn="Published source";
// v146：海外進的是同一個檢視視窗，文案優先顯示英文版
openVideoModal("S1", false);
ok("intl 檢視視窗顯示英文文案", modalHTML.includes("Golden copy EN"));
ok("intl 檢視視窗看得到存檔資料夾那一列",
   modalHTML.includes("Drive folder") || modalHTML.includes("footage, cuts, remakes"));
// 中文角色不顯示英文小字
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
h=viewVideos();
ok("editor 影片庫不顯示英文小字", !h.includes("vt-en"));

// ── 月排程：泰/英本來就是分開的平台 ──
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
// CAL_PLAT_FOR 要一起設，代表「這個職位的預設已經套過」——
// 不然 viewCal 會把海外的預設（英文）蓋上來（v142）
CAL_PLAT="th"; CAL_PLAT_FOR="intl"; CAL_YM=null; INTL_CAL_YM=null; INTL_ACCT="";
h=viewCal();
ok("月排程泰文平台只列 TH 帳號", h.includes("tiktok-TH") && !h.includes("tiktok-EN"));
CAL_PLAT="en"; INTL_ACCT="";
h=viewCal();
ok("月排程英文平台只列 EN 帳號", h.includes("tiktok-EN") && !h.includes("tiktok-TH"));

// ── 建立者紀錄 ──
openVideoModal("E1", false);
ok("檢視視窗顯示建立者", modalHTML.includes("Created by") && modalHTML.includes("Regina"));
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
{ const r=newVideoRecord({}); ok("newVideoRecord 蓋 createdBy/createdAt", r.createdBy==="小葵" && !!r.createdAt); }

// ── 全角色 × 全分頁 render 不炸 ──
const tabsOf={boss:["dashboard","videos","cal","perf","log","trash"],editor:["work","videos","cal"],intl:["work","videos","cal"]};
const who={boss:"老闆",editor:"小葵",intl:"Anna"};
Object.keys(tabsOf).forEach(role=>{
  localStorage.setItem("ecdr_user",who[role]); localStorage.setItem("ecdr_role",role);
  tabsOf[role].forEach(tab=>{ CUR_TAB=tab; CAL_PLAT="tw"; CAL_YM=null; WORK_ZONE="shopee";
    try{ render(); ok(`[${role}] ${tab}`, true); }catch(e){ ok(`[${role}] ${tab} → ${e.message}`, false); } });
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
