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
STATE = {
  users:[ {name:"小葵",role:"editor",craft:"both"}, {name:"Anna",role:"intl",craft:"both"} ],
  settings:{ dailyTarget:4, videoTags:["舊片"], sources:["老闆自拍"], postPlatforms:[{name:"IG",utm:"ig"}],
    intlAccounts:[{locale:"en",name:"tiktok-EN"}], shopeeAccounts:["蝦皮店A"], msAccounts:["tiktok-Malaysia"],
    exchangeRates:{} },
  schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
  videos:[
    {id:"S1",name:"黃金原本",rawName:"黃金原本",stage:"待處理",locale:"",channel:"",origLang:"",usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }
function noCJK(s){ return !/[一-鿿]/.test(s.replace(/黃金原本|小葵|蝦皮店A|文<span>A<\/span>/g,"")); }   // 資料本身的中文除外

// --- intl：新增/批次/編輯 彈窗全英文 ---
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
newSimpleVideo();
// v114 起商品預設 0 列，原價／售價的 placeholder 要按「加商品」才長出來
ok("intl 新增影片 modal English", modalHTML.includes("Add video") && modalHTML.includes("Original language") && modalHTML.includes("Add product") && !modalHTML.includes("原始片名") && !modalHTML.includes("加商品"));
batchNewFootage();
ok("intl 批次新增 modal English", modalHTML.includes("Add raw footage") && modalHTML.includes("Clip 1") && modalHTML.includes("shared by all 5") && !modalHTML.includes("第 1 支") && !modalHTML.includes("原本語言"));
ok("intl language options say Malaysia", modalHTML.includes(">Malaysia<"));
// v115 分區：海外點源片只跳出唯讀的來源簡介，不再進台灣的編輯視窗
openVideoModal("S1", true);
ok("intl 點源片＝唯讀來源卡（英文）", modalHTML.includes("Source · Taiwan") && modalHTML.includes("Video details"));
ok("intl 看不到台灣的編輯欄位", !modalHTML.includes('id="e_stage"') && !modalHTML.includes('id="e_date"') && !modalHTML.includes('id="e_raw"'));
ok("intl 看不到刪除鍵", !modalHTML.includes("delVideo("));
ok("intl 來源卡沒有中文洩漏", !modalHTML.includes("影片內容") && !modalHTML.includes("來源・台灣"));
// v121：日期視窗全員都進得去了，所以這裡改成真的驗它的語言（本來只是在驗被擋掉的 toast）
INTL_ACCT="acctEN"; INTL_CAL_YM=null; modalHTML=""; openDayIntl(T0);
ok("intl 點日視窗 English", modalHTML.includes("Scheduled") && !modalHTML.includes("已排"));

// --- editor：中文完全不變 ---
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
newSimpleVideo();
ok("editor 新增影片維持中文", modalHTML.includes("新增影片") && modalHTML.includes("原本語言") && modalHTML.includes("加商品"));
batchNewFootage();
ok("editor 批次新增維持中文", modalHTML.includes("新增毛片") && modalHTML.includes("第 1 支"));
openVideoModal("S1", true);
ok("editor 編輯視窗維持中文", modalHTML.includes("原始片名") && modalHTML.includes("儲存修改"));
ok("editor 語言選項統一為馬來西亞", modalHTML.includes(">馬來西亞<") && !modalHTML.includes("馬來文"));

// --- 三個下拉名稱一致 ---
VID_LANG=""; VID_VIEW="raw"; VID_TAGS=new Set();
let h=viewVideos();
ok("影片庫語言選單用 馬來西亞", h.includes("馬來西亞（"));
CAL_PLAT="tw"; CAL_YM=null; CUR_TAB="cal"; h=viewCal();
ok("月排程選單用 馬來西亞", h.includes(">馬來西亞<"));
WORK_ZONE="shopee"; h=viewWork();
ok("建立二創版本選單用 馬來西亞", h.includes(">馬來西亞<"));
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
// v115 分區：馬來西亞歸台灣，海外的影片庫是來源清單，整頁都不該出現這個字
h=viewVideos();
ok("intl 影片庫沒有馬來西亞（歸台灣）", !h.includes("Malaysia"));
CAL_PLAT="tw"; h=viewCal();
ok("intl 月排程現在也有馬來西亞（v142 不分區）", h.includes(">Malaysia<"));
WORK_ZONE="en"; h=viewWork();
ok("intl 建立版本現在也有馬來西亞（二創雙向）", h.includes(">Malaysia<"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
