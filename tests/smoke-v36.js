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

const T0 = new Date(Date.now()+288e5).toISOString().slice(0,10);
const raw = {
  users:[ {name:"小葵",role:"editor"}, {name:"Anna",role:"intl"}, {name:"Regina",role:"manager"} ],
  settings:{ dailyTarget:4, videoTags:["舊片"], sources:["老闆自拍"], postPlatforms:[{name:"IG",utm:"ig"}],
    intlAccounts:[{locale:"en",name:"tiktok-EN"}], intlDailyTarget:2,
    shopeeAccounts:["蝦皮店A"], shopeeDailyTarget:2, msAccounts:["tiktok-Malaysia"], msDailyTarget:2,
    exchangeRates:{en:{code:"USD",rate:0.0313,mult:1},th:{code:"THB",rate:1.038,mult:1},ms:{code:"MYR",rate:0.1275,mult:1},shopee:{code:"TWD",rate:1,mult:1.2}} },
  schedule:{}, tasks:{}, shifts:{}, logs:[],
  videos:[
    {id:"S1",name:"中文原本",rawName:"中文原本",stage:"已上片",locale:"",channel:"",origLang:"",scheduledDate:"2026-01-01",editor:"小葵",published:true,usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"S2",name:"Thai original clip",rawName:"Thai original clip",rawLink:"http://raw",stage:"待處理",locale:"",channel:"",origLang:"th",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"S3",name:"English original",rawName:"English original",rawLink:"http://raw",stage:"待處理",locale:"",channel:"",origLang:"en",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"S4",name:"Malay original",rawName:"Malay original",stage:"已完成",locale:"",channel:"",origLang:"my",finishedAt:"2026-01-01T09:00:00",scheduledDate:"2026-01-02",published:true,editor:"小葵",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"OLD1",name:"舊欄位無 origLang",rawName:"舊欄位無 origLang",rawLink:"http://raw",stage:"待處理",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"V201",name:"蝦皮版",stage:"待處理",locale:"",channel:"shopee",sourceVideoId:"S1",account:"蝦皮店A",assignedTo:"小葵",usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};
decorate(raw);

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }
function tryRender(label){ try{ render(); ok(label, viewEl.innerHTML.length>50); }catch(e){ fail++; console.log("FAIL:",label,"THREW:",e.message); } }

// --- 不分海內外：intl 分頁＝editor ---
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
const edTabs=JSON.stringify(myTabs());
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
ok("intl tab ids identical to editor (labels English)", JSON.stringify(myTabs().map(t=>t[0]))===JSON.stringify(JSON.parse(edTabs).map(t=>t[0])));

// --- 全角色全分頁渲染（intl 現在跑中文頁） ---
for(const [name,role] of [["管理員","boss"],["Regina","manager"],["小葵","editor"],["Anna","intl"]]){
  localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role);
  VIEW_AS=null; CAL_YM=null; INTL_CAL_YM=null; CH_CAL={shopee:{ym:null,acct:""},ms:{ym:null,acct:""}}; CAL_PLAT="tw"; VID_LANG="";
  for(const [tab] of myTabs()){ CUR_TAB=tab; tryRender(`[${role}] ${tab}`); }
}

// --- 影片庫語言選單＋過濾 ---
localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
VID_LANG=""; VID_VIEW="raw"; VID_TAGS=new Set();
ZONE_VIEW="tw"; let h=viewVideos();
// v115 分區：台灣庫把蝦皮／馬來版併進來，版本殼的語言跟著源片算 → 中文從 2 變 3
// v119：用泰文／英文拍的原創屬於海外，語言選單只留台灣區的中文與馬來西亞
ok("語言選單存在且有計數", h.includes("原本語言") && h.includes("中文（3）") && h.includes("馬來西亞（1）"));
ok("台灣的語言選單沒有泰文／英文（那是海外的）", !h.includes("泰文（") && !h.includes("英文（"));
ok("中文庫只列中文原本（含舊資料無欄位者）", h.includes("舊欄位無 origLang") && !h.includes("Thai original clip"));
ok("台灣庫完全看不到泰文原創", !h.includes("Thai original clip"));
{ // 泰文原創歸海外：走海外的待認領池（海外的「影片庫」是台灣已上片的來源挑選清單，不是全庫）
  ok("泰文原創屬於海外區", zoneOfVideo(vid("S2"))==="intl" && zoneOfVideo(vid("S3"))==="intl");
  ok("中文與馬來原創屬於台灣區", zoneOfVideo(vid("S1"))==="tw" && zoneOfVideo(vid("S4"))==="tw" && zoneOfVideo(vid("OLD1"))==="tw");
  localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
  const pool=poolAll().map(v=>v.id);
  ok("海外的待認領池有泰文／英文原創", pool.includes("S2") && pool.includes("S3"));
  ok("海外的待認領池沒有中文毛片與蝦皮版", !pool.includes("OLD1") && !pool.includes("V201"));
  ok("泰文原創在池裡歸「泰文」那一類", poolCat(vid("S2"))==="th" && poolCat(vid("S3"))==="en");
  localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
  const twPool=poolAll().map(v=>v.id);
  ok("台灣的待認領池看不到泰文／英文原創", !twPool.includes("S2") && !twPool.includes("S3"));
  localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss"); }
VID_LANG="my"; VID_VIEW="old"; h=viewVideos();
ok("馬來庫舊片分頁列出馬來原本", h.includes("Malay original"));

// --- 原本語言小圖示 ---
VID_LANG=""; VID_VIEW="old";
let r=vidTableRow(STATE.videos.find(v=>v.id==="S1"));
ok("中文原本標「中」", r.includes(">中</span>"));
r=vidTableRow(STATE.videos.find(v=>v.id==="S2"));
ok("泰文原本標「TH」", r.includes(">TH</span>"));
r=vidTableRow(STATE.videos.find(v=>v.id==="S4"));
ok("馬來原本標「MY」", r.includes(">MY</span>"));
r=vidTableRow(STATE.videos.find(v=>v.id==="V201"));
ok("二創版不標原本語言（標平台徽章）", !r.includes(">中</span>") && r.includes(">蝦皮<"));

// --- 新增/編輯視窗語言欄位 ---
openVideoModal("S2", true);
ok("編輯視窗有原本語言選單且預選泰文", modalHTML.includes('id="e_lang"') && /value="th" selected/.test(modalHTML));
openVideoModal("S2", false);
ok("檢視模式顯示原本語言", modalHTML.includes("原本語言") && modalHTML.includes(">TH</span>"));
newSimpleVideo();
ok("新增影片有 sv_lang 選單", modalHTML.includes('id="sv_lang"'));
batchNewFootage();
ok("批次新增有共用 b_lang 選單", modalHTML.includes('id="b_lang"'));

// --- 月排程 hub 改下拉 ---
CUR_TAB="cal"; CAL_PLAT="tw"; CAL_YM=null; render();
ok("月排程平台用下拉選單", viewEl.innerHTML.includes('onchange="calSetPlat(this.value)"') && viewEl.innerHTML.includes("<option"));
CAL_PLAT="shopee"; render();
ok("下拉切蝦皮正常", viewEl.innerHTML.includes("蝦皮店A"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
