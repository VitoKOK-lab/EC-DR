// v90：影片庫分頁籤在手機上排成兩欄的格子 —— 六個分頁都完整看得到，
//      不用左右滑、不會擠成兩排黏在一起、也不會被切掉。
// 這一份主要驗 CSS 與 HTML 結構（真正的版面用 Chromium 量過，見 PR）。
const fs=require("fs"), path=require("path");
const css=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=()=>{};

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==';
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",rawLink:"http://raw",
  stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",publishedLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",source:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos){
  VID_LANG=""; VID_VIEW="raw"; VID_TAGS=new Set(); VID_Q=""; POOL_FILTER="all"; POOL_Q="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Anna",role:"intl",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Regina",role:"manager",pwHash:H},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["s"],postPlatforms:[],intlAccounts:[],shopeeAccounts:[],
      msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",workStart:"09:00",workEnd:"18:00"},
    schedule:{}, logs:[], deletedVideos:[], shifts:{}, tasks:{}, videos:(videos||[]).slice() };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; CAL_PLAT="tw"; CAL_YM=null;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
// 手機那段 @media 規則
const mobileBlock=(()=>{ const i=css.indexOf("影片庫分頁籤・手機"); if(i<0) return "";
  const j=css.indexOf("@media", i); return j<0?"":css.slice(j, css.indexOf("\n  }", j)+4); })();
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ CSS ══
ok("有手機專用的分頁籤規則", mobileBlock.length>0);
ok("寫在 .vtab.on 這些基礎規則之後（不然會被蓋掉，舊的就是這樣失效的）",
   css.indexOf(".vtab.on .vtab-n") < css.indexOf("影片庫分頁籤・手機"));
ok("手機斷點是 640px", /@media\s*\(max-width:640px\)/.test(mobileBlock));
ok("排成兩欄的格子", /\.vtabs\{[^}]*display:grid/.test(mobileBlock)
   && /grid-template-columns:1fr 1fr/.test(mobileBlock));
ok("名稱靠左、數字靠右", /\.vtab\{[^}]*justify-content:space-between/.test(mobileBlock));
ok("名稱太長會用「…」截掉，不會撐破格子", /text-overflow:ellipsis/.test(mobileBlock));
ok("數字那顆不會被壓扁", /\.vtab-n\{flex:none\}/.test(mobileBlock));
ok("不再用左右滑（那樣第一個分頁會滑出畫面外）",
   !/overflow-x:auto/.test(mobileBlock) && !/flex-wrap:nowrap/.test(mobileBlock));
ok("舊的失效規則已經刪掉", !css.includes("改左右滑一排，不再換行成兩排"));
ok("桌機維持原本的一排", /\.vtabs\{display:flex;flex-wrap:wrap/.test(css));

// ══ HTML 結構：名稱要包在 span 裡，CSS 才截得到 ══
const LIB=[ v_("S1",{videoCopy:"口播"}), v_("R1",{rawLink:"http://d"}),
  v_("Q1",{rawLink:"http://d",scheduledDate:D(3)}),
  v_("N1",{stage:"已完成",finishedAt:D(-1)+"T05:00:00",publishedLink:"http://p"}),
  v_("M1",{stage:"已完成",finishedAt:D(-1)+"T05:00:00",publishedLink:"http://p",scheduledDate:D(3)}),
  v_("O1",{tags:["舊片"]}) ];
reset(LIB); as("Regina","manager");
{ const h=viewVideos();
  ok("影片庫分頁的名稱包在 span 裡", h.includes("<span>未拍</span> <span class=\"vtab-n\">"));
  ok("四個分頁都在", ["未拍","待剪","剪完","舊片"]
     .every(x=>h.includes("<span>"+x+"</span>")));
  ok("每個分頁都各自帶一個數字", (h.match(/<span class="vtab-n">/g)||[]).length>=4);
  ok("選中的還是有 on", h.includes('class="vtab on"')); }
reset(LIB); as("小葵","editor");
{ const w=viewWork();
  ok("待認領的快選也包了 span", w.includes("<span>全部</span> <span class=\"vtab-n\">"));
  ok("待認領四個快選都在（台灣區）", ["全部","中文毛片","蝦皮","馬來西亞"]
     .every(x=>w.includes("<span>"+x+"</span>")));
  // v142 拆掉分區：快選六類全在
  ok("台灣也看得到英文／泰文快選", w.includes("<span>英文</span>") && w.includes("<span>泰文</span>")); }
// v146：海外的影片庫跟台灣同一份（只是介面英文）—— 舊的「來源清單」那一份跟
//      「上班計畫」的建立二創版本卡重複，已經拿掉。
reset(LIB); as("Anna","intl");
{ const h=viewVideos();
  ok("海外也有那四個管線分頁（英文）", h.includes("<span>Not shot</span>") && h.includes('id="vid_tabs"'));
  ok("海外沒有中文分頁名洩漏", !h.includes("<span>未拍</span>")); }

// ══ 點分頁還是有作用 ══
reset(LIB); as("Regina","manager");
ok("每個分頁都點得動", ["script","raw","done","old"]
   .every(k=>viewVideos().includes(`vidSetView('${k}')`)));
vidSetView("old");
ok("點了會換頁", VID_VIEW==="old" && viewVideos().includes('class="vtab on"'));
reset(LIB); as("小葵","editor");
setPoolFilter("shopee");
ok("待認領快選也點得動", POOL_FILTER==="shopee" && viewWork().includes("setPoolFilter('all')"));

// ══ render 不炸 ══
reset(LIB);
[["Regina","manager","videos"],["Anna","intl","videos"],["小葵","editor","work"]].forEach(([u,r,tab])=>{
  as(u,r); CUR_TAB=tab;
  try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
