// v227：月排程「清單」檢視加「列印本月（A4）」——老闆：「剛才前面的清單，
// 我要加一個功能，匯出表格格式，用 a4 格式列印，一次一個月份」。
//
// 沒有另外做一套匯出檔案：清單本來就是攤成一張表，「存 PDF／印出來」本來就是
// 瀏覽器內建的功能，缺的只是「印出來要長得像一張表，不要把整個系統的畫面
// 一起印出去」。做法拆兩半：
//   ① .print-target：整張清單卡包這一層，@media print 只留它可見——
//      不用去追殺 header／nav／登入畫面／彈窗這些東西，少列一個就會漏。
//   ② .noprint／.printonly：卡片裡再分「平常看得到、印的時候要藏起來」
//      （按鈕、上下月箭頭、帳號下拉選單、「只能看」提示）跟「平常藏起來、
//      印的時候才冒出來」（帳號／平台這行字——平常靠下拉選單傳達，選單
//      一藏，紙上就沒人知道印的是哪個帳號）。
// 「一次一個月」不用另外做：清單本來就只顯示 ym 這一個月。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({}), print(){}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,260));} }

const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const YM=FROZEN.slice(0,7), Y=+YM.slice(0,4), M=+YM.slice(5,7);
const D=(n)=>YM+"-"+String(n).padStart(2,"0");

const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"原始片名"+id,videoCopy:"",nameEn:"",videoCopyEn:"",
  rawLink:"",lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",
  publishedLink:"",driveFolder:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",
  cover:"",remakes:[],publishTime:"",tags:[],products:[],usageHistory:[],metrics:[],note:"",refLink:"",
  productUrl:"",source:"官方IP",deleted:false}, o||{});
function reset(videos, who, role){
  VIEW_AS=null; BRAND=""; viewEl.innerHTML=""; modalHTML="";
  CAL_MODE="grid"; CAL_PLAT="tw"; CAL_PLAT_FOR=null; CAL_YM=[Y,M-1]; INTL_CAL_YM=[Y,M-1];
  CH_CAL={shopee:{ym:[Y,M-1],acct:""}, ms:{ym:[Y,M-1],acct:""}};
  localStorage.setItem("ecdr_user", who||"管理員"); localStorage.setItem("ecdr_role", role||"boss");
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"管理員",role:"boss"},{name:"小葵",role:"editor"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"EN帳號A"}], shopeeAccounts:["蝦皮店A"], msAccounts:["馬來A"],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
}

// ══════════ ① 清單模式才有列印鍵，月曆模式沒有 ══════════
{ reset([v_("V1",{name:"甲片",scheduledDate:D(3)})]);
  const grid=viewCal();
  ok("月曆模式沒有列印鍵（那裡本來就沒有清單可印）", !grid.includes("window.print()"), grid.slice(0,200));
  calSetMode("list");
  const l=viewCal();
  ok("**清單模式有「列印本月（A4）」鍵**", /window\.print\(\)/.test(l) && l.includes("列印本月"), l.slice(0,400)); }

// ══════════ ② 列印鍵、上下月箭頭、帳號選單、提示文字都在 .noprint 裡 ══════════
{ reset([v_("V1",{name:"甲片",scheduledDate:D(3)})]);
  calSetMode("list");
  const l=viewCal();
  const seg=l.slice(l.indexOf('class="card print-target"'));
  ok("**整張卡包了 print-target**（印的時候只留這一塊）", seg.length>0 && l.includes('class="card print-target"'));
  const printBtnSeg=seg.slice(0, seg.indexOf("</button>")+9);
  ok("**列印鍵在 noprint 區塊裡**（紙上按不動，印的時候藏起來）",
     /class="row noprint"[\s\S]*?window\.print\(\)/.test(seg.slice(0,300)), seg.slice(0,300));
  ok("**上月箭頭有 noprint**", /class="calnav noprint"[^>]*onclick="calMove\(-1\)"/.test(seg), (seg.match(/class="calnav[^"]*"[^>]*onclick="calMove\(-1\)"/)||[])[0]);
  ok("**下月箭頭有 noprint**", /class="calnav noprint"[^>]*onclick="calMove\(1\)"/.test(seg));
  ok("**「只能看」提示有 noprint**", /class="muted noprint"/.test(seg)); }

// ══════════ ③ 帳號／平台名稱：平常藏起來（printonly），紙上才要冒出來 ══════════
{ reset([v_("SRC",{name:"源片",scheduledDate:D(3)}),
         v_("EN",{name:"",rawName:"",locale:"en",account:"EN帳號A",sourceVideoId:"SRC",scheduledDate:D(5)})]);
  CAL_MODE="list"; CAL_PLAT="en"; CAL_PLAT_FOR="boss";
  const l=viewCal();
  ok("**海外清單印出帳號名稱（printonly）**", /class="printonly"[^>]*>英文 · EN帳號A</.test(l), l.slice(0,600));
  reset([v_("SRC",{name:"源片",scheduledDate:D(3)}),
         v_("SHP",{name:"蝦皮版",channel:"shopee",account:"蝦皮店A",sourceVideoId:"SRC",scheduledDate:D(3)})]);
  CAL_MODE="list"; CAL_PLAT="shopee"; CAL_PLAT_FOR="boss";
  const l2=viewCal();
  ok("**蝦皮清單印出帳號名稱**", /class="printonly"[^>]*>蝦皮 · 蝦皮店A</.test(l2), l2.slice(0,600));
  reset([v_("V1",{name:"甲片",scheduledDate:D(3)})]);
  CAL_MODE="list"; CAL_PLAT="tw"; CAL_PLAT_FOR="boss";
  const l3=viewCal();
  ok("**中文清單也有平台字樣**", /class="printonly"[^>]*>中文社群媒體</.test(l3), l3.slice(0,600)); }

// ══════════ ④ 平常看畫面時 printonly 那行不會冒出來擋畫面 ══════════
{ ok("**CSS 預設 .printonly 是 display:none**", /\.printonly\{display:none\}/.test(HTML), (HTML.match(/\.printonly\{[^}]*\}/)||[])[0]); }

// ══════════ ⑤ 列印用的 CSS：A4、只留清單那一塊、noprint／printonly 互換 ══════════
{ const mediaPrint=(HTML.match(/@media print\{[\s\S]*?\n  \}/)||[""])[0];
  ok("（前提）真的抓到 @media print 那一段", mediaPrint.length>50, mediaPrint.length);
  ok("**設了 A4**", /@page\{size:A4/.test(mediaPrint), mediaPrint.slice(0,80));
  ok("**先把全部藏起來，只留 print-target**",
     /body \*\{visibility:hidden\}/.test(mediaPrint) && /\.print-target,\.print-target \*\{visibility:visible\}/.test(mediaPrint));
  ok("**print-target 裡的 noprint 蓋掉螢幕上的顯示**", /\.print-target \.noprint\{display:none!important\}/.test(mediaPrint));
  ok("**print-target 裡的 printonly 冒出來**", /\.print-target \.printonly\{display:block!important\}/.test(mediaPrint));
  ok("清單表格印出來有格線（不然只是一堆字擠在一起）", /table\.callist td,table\.callist th\{border:1px solid/.test(mediaPrint)); }

// ══════════ ⑥ 只能看的規矩沒有被破壞：列印鍵不寫資料庫 ══════════
{ ok("app.js 裡的 window.print() 呼叫只有這一種寫法，沒有夾帶別的動作",
     (APP.match(/onclick="window\.print\(\)"/g)||[]).length>=1 &&
     !/window\.print\(\)[^"]*(scheduleSet|dbUpdate|dbDel|reschedule)/.test(APP)); }

console.log(`\nv227（月排程清單列印 A4）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
