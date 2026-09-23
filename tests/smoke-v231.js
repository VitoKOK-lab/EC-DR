// v231：月排程清單頁再加兩件事（老闆指定）——
//   ①「剛才那個改日期，這小按鈕在月排程裡面的清單列表中，在名字旁邊也要有一個
//      可以按」：影片庫（v228／PR #229）已經有「改時間」鍵了，清單頁的每一列
//      本來就對應著一支真的影片，搬同一顆 openQuickSchedule 過來，不用挑
//      「有沒有被指派鎖住」（那是影片庫才有的規矩，清單頁沒有這條線）。
//   ②「我希望他預設有一個動態時間，我只切換到這一頁『清單』頁，就要自動跳到
//      今天的日期」：清單不像月曆有格子看得出「現在是哪個月」，之前看到哪個月，
//      切模式照樣停在那個月。切進清單一律跳回今天所在的月份，再捲到今天那列。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
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
// 抓「今天那一列有沒有被捲過去」：真的 DOM 太重，這裡只需要精準攔一個選擇器 ——
// calScrollToday() 固定打 document.querySelector(".callist tr.cl-today")，
// 用內容判斷「清單裡此刻有沒有那一列」，回一個假節點讓 scrollIntoView 記一筆。
let SCROLL_LOG=[];
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:(sel)=>{
    if(sel===".callist tr.cl-today" && /class="cl-today"/.test(viewEl.innerHTML))
      return { scrollIntoView:(opt)=>{ SCROLL_LOG.push(opt); } };
    return null;
  },
  querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,260));} }

// 「今天」凍在月中，這樣「上個月／下個月」都還在同一年，好對照
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const YM=FROZEN.slice(0,7), Y=+YM.slice(0,4), M=+YM.slice(5,7);   // 這個月（1-based）
const D=(n)=>YM+"-"+String(n).padStart(2,"0");
const OTHER_YM=[2020,0];   // 「不是這個月」隨便一個固定月份就好，跑這支測試時真實年份不可能是 2020

const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"原始片名"+id,videoCopy:"",nameEn:"",videoCopyEn:"",
  rawLink:"",lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",
  publishedLink:"",driveFolder:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",
  cover:"",remakes:[],publishTime:"",tags:[],products:[],usageHistory:[],metrics:[],note:"",refLink:"",
  productUrl:"",source:"官方IP",deleted:false}, o||{});
function reset(videos, who, role){
  VIEW_AS=null; BRAND=""; viewEl.innerHTML=""; modalHTML=""; SCROLL_LOG=[];
  // calSetMode 內部呼叫的是完整的 render()（不是直接呼叫 viewCal()），
  // render() 靠 CUR_TAB 決定要畫哪一頁——要看得到真的畫出來的 HTML（含 cl-today
  // 那一列），CUR_TAB 得先停在「cal」，跟使用者站在月排程頁按切換鍵時一樣。
  CUR_TAB="cal"; LAST_RENDER_TAB=null;
  CAL_MODE="grid"; CAL_PLAT="tw"; CAL_PLAT_FOR=null; CAL_YM=OTHER_YM.slice(); INTL_CAL_YM=OTHER_YM.slice();
  CH_CAL={shopee:{ym:OTHER_YM.slice(),acct:""}, ms:{ym:OTHER_YM.slice(),acct:""}};
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

// ══════════ ① 清單裡的片名旁邊有「改時間」鍵 ══════════
{ reset([v_("V1",{name:"甲片",scheduledDate:D(3),publishTime:"10:00"})]);
  calSetMode("list");
  const l=viewCal();
  ok("**清單裡有「改時間」鍵**", /openQuickSchedule\('V1'\)/.test(l), l.slice(l.indexOf("甲片")-50, l.indexOf("甲片")+250));
  ok("那顆鍵印在片名旁邊（同一個 <td> 裡）",
     (()=>{ const i=l.indexOf(">甲片<"); const td=l.slice(l.lastIndexOf("<td>",i), l.indexOf("</td>",i)+5);
            return td.includes("openQuickSchedule('V1')"); })());
  ok("**那顆鍵印表時要藏起來（noprint）**", /class="btn sm sec noprint"[^>]*onclick="event\.stopPropagation\(\);openQuickSchedule/.test(l)); }
// 沒排片的那天（「這天還沒排」）本來就沒有列，自然也沒有這顆鍵——不用特別擋
{ reset([]); calSetMode("list");
  const l=viewCal();
  ok("整個月都沒片時，清單裡完全沒有這顆鍵（沒有片可以改）", !l.includes("openQuickSchedule")); }
// 四個平台都要有（跟片名放在一起用的是同一份 calListBody，不會漏平台）
{ reset([v_("SRC",{name:"源片",scheduledDate:D(3)}),
         v_("SHP",{name:"蝦皮版",channel:"shopee",account:"蝦皮店A",sourceVideoId:"SRC",scheduledDate:D(3)})]);
  CAL_PLAT="shopee"; CAL_PLAT_FOR="boss";
  calSetMode("list");   // 順便也是驗證：切模式跳去今天所在月份之後，蝦皮那支片還找得到
  ok("蝦皮清單也有「改時間」鍵", /openQuickSchedule\('SHP'\)/.test(viewCal())); }

// ══════════ ② 切進清單，自動跳回今天所在的月份 ══════════
{ reset([v_("V1",{name:"甲片",scheduledDate:D(3)})]);
  ok("（前提）CAL_YM 一開始被設成別的月份，不是這個月", CAL_YM[0]!==Y || CAL_YM[1]!==M-1, CAL_YM);
  calSetMode("list");
  ok("**切進清單後，CAL_YM 自動跳回今天所在的年月**", CAL_YM[0]===Y && CAL_YM[1]===M-1, CAL_YM); }
{ // 海外／蝦皮／馬來：各自的月份狀態也要各自跳，不能只認 CAL_YM
  reset([]); CAL_PLAT="en";
  calSetMode("list");
  ok("**海外（en）跳的是 INTL_CAL_YM**", INTL_CAL_YM[0]===Y && INTL_CAL_YM[1]===M-1, INTL_CAL_YM);
  reset([]); CAL_PLAT="shopee";
  calSetMode("list");
  ok("**蝦皮跳的是 CH_CAL.shopee.ym**", CH_CAL.shopee.ym[0]===Y && CH_CAL.shopee.ym[1]===M-1, CH_CAL.shopee.ym); }
// 切回月曆不強制跳月——老闆講的是「切到清單頁」，月曆維持原本停在哪裡就是哪裡
{ reset([v_("V1",{name:"甲片",scheduledDate:D(3)})]);
  calSetMode("list"); CAL_YM=OTHER_YM.slice();      // 清單裡手動翻到別的月份
  calSetMode("grid");
  ok("切回月曆不會被硬拉回今天（那是清單專屬的行為）", CAL_YM[0]===OTHER_YM[0] && CAL_YM[1]===OTHER_YM[1], CAL_YM); }

// ══════════ ③ 切進清單，畫面捲到今天那一列 ══════════
{ reset([v_("V1",{name:"甲片",scheduledDate:D(3)})]);
  calSetMode("list");
  ok("**切進清單會捲到今天那一列**", SCROLL_LOG.length>0, SCROLL_LOG); }
{ reset([]); CAL_MODE="list"; CAL_YM=[Y,M-1];   // 已經停在今天所在的月份
  const l=viewCal();
  ok("（對照）今天這天在清單裡本來就有 cl-today 這個 class", /class="cl-today"/.test(l)); }

// ══════════ ④ 沒有動到「只能看」的規矩：這顆鍵不會寫資料庫 ══════════
{ ok("openQuickSchedule 本身只開視窗，不直接寫資料庫（跟影片庫共用同一支函式，見 tests/smoke-v124.js）",
     /function openQuickSchedule\(id\)\{[\s\S]{0,400}showModal\(/.test(APP)); }

console.log(`\nv231（月排程清單：改時間鍵＋切模式跳今天）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
