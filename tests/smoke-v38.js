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
ok("intl 新增影片 modal English", modalHTML.includes("Add video") && modalHTML.includes("Original language") && modalHTML.includes("List price") && modalHTML.includes("Fan price") && !modalHTML.includes("原始片名") && !modalHTML.includes("原價"));
batchNewFootage();
ok("intl 批次新增 modal English", modalHTML.includes("Add raw footage") && modalHTML.includes("Clip 1") && modalHTML.includes("shared by all 5") && !modalHTML.includes("第 1 支") && !modalHTML.includes("原本語言"));
ok("intl language options say Malaysia", modalHTML.includes(">Malaysia<"));
openVideoModal("S1", true);
ok("intl 編輯視窗 English (labels+footer)", modalHTML.includes("Raw title") && modalHTML.includes("Save") && modalHTML.includes("Tags (multi-select)") && !modalHTML.includes("原始片名") && !modalHTML.includes("儲存修改"));
ok("intl 剪輯看不到階段下拉（只能用完成鍵）", !modalHTML.includes('<select id="e_stage"') && modalHTML.includes('id="e_stage"'));
openVideoModal("S1", false);
ok("intl 檢視視窗 English rows", modalHTML.includes("Video details") && modalHTML.includes("Post caption") && !modalHTML.includes("影片內容"));
openDay(T0);
ok("intl 點日視窗 English", modalHTML.includes("Videos this day") && modalHTML.includes("Schedule an old video") && !modalHTML.includes("當日影片"));

// --- editor：中文完全不變 ---
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
newSimpleVideo();
ok("editor 新增影片維持中文", modalHTML.includes("新增影片") && modalHTML.includes("原本語言") && modalHTML.includes("原價"));
batchNewFootage();
ok("editor 批次新增維持中文", modalHTML.includes("新增毛片") && modalHTML.includes("第 1 支"));
openVideoModal("S1", true);
ok("editor 編輯視窗維持中文", modalHTML.includes("原始片名") && modalHTML.includes("儲存修改"));
ok("editor 語言選項統一為馬來西亞", modalHTML.includes(">馬來西亞<") && !modalHTML.includes("馬來文"));

// --- 三個下拉名稱一致 ---
VID_LANG=""; VID_VIEW="rawNoSched"; VID_TAGS=new Set();
let h=viewVideos();
ok("影片庫語言選單用 馬來西亞", h.includes("馬來西亞（"));
CAL_PLAT="tw"; CAL_YM=null; CUR_TAB="cal"; h=viewCal();
ok("月排程選單用 馬來西亞", h.includes(">馬來西亞<"));
WORK_ZONE="shopee"; h=viewWork();
ok("建立二創版本選單用 馬來西亞", h.includes(">馬來西亞<"));
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
h=viewVideos(); const a=h.includes("Malaysia (");
CAL_PLAT="tw"; h=viewCal(); const b=h.includes(">Malaysia<");
WORK_ZONE="shopee"; h=viewWork(); const c=h.includes(">Malaysia<");
ok("intl 三處都用 Malaysia（一致）", a && b && c);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
