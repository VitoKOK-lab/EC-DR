// v234～v236：月排程清單，手機版反覆調整過三輪，最後定案「兩欄」。
//
// 第一輪（v234）老闆看了並排的窄欄位說：「不對，我看了不是這樣，不是左右，
// 幫我用上下二排，先原片名、下排貼文文案（在前面寫小字　原名：　下面寫
// 貼文：）」——改成每一列上下疊成三行（日期時間 → 原名 → 貼文）。
//
// 第二輪（v235）老闆看了三行疊起來說：「不要這樣，這樣就變很高，原名、
// 貼文，要在同一行就好」——改成日期時間自己一行、原名跟貼文同一行對半分。
//
// 第三輪（v236）老闆看了同一行對半分的成果說「全錯」，改口要：「兩欄，
// 只要兩欄，第一欄時段，第二欄名稱；名稱中第一行原片名、換行貼文文案」。
// 這次先用文字畫表格請老闆確認過一次（「對，就這樣」）才動手：
//
//   ┌──────────┬──────────────────────┐
//   │ 時段      │ 名稱                  │
//   ├──────────┼──────────────────────┤
//   │ 9/23（三）│ 原名：(BOSS)當女兒...  │
//   │  09:00   │ 貼文：(BOSS)當女兒...  │
//   └──────────┴──────────────────────┘
//
// 左欄時段（跟桌機一樣窄），右欄「名稱」內部自己分兩行：原名在上、貼文在下。
// 用 CSS Grid 做：<tr> 兩欄格線，日期那格橫跨兩個格線列（不管右邊一行還是
// 兩行，日期都貼齊左邊整塊，不會被切成上下兩截）。
//
// 這裡只測最後定案（v236）的樣子：
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
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,260));} }

function mediaBlocks(css, cond){
  const out=[]; let i=0;
  while((i=css.indexOf(cond, i))>=0){
    let j=css.indexOf("{", i); if(j<0) break;
    let depth=0, k=j;
    for(; k<css.length; k++){ if(css[k]==="{") depth++; else if(css[k]==="}"){ depth--; if(!depth) break; } }
    out.push(css.slice(j, k+1)); i=k+1;
  }
  return out;
}
const mob=mediaBlocks(HTML, "@media(max-width:600px)").join("");
const rest=(()=>{ let r=HTML; mediaBlocks(HTML,"@media(max-width:600px)").forEach(b=>{ r=r.replace(b,""); }); return r; })();

const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,10);
todayTW=()=>FROZEN; ydayTW=()=>FROZEN; refreshToday();
const YM=FROZEN.slice(0,7), Y=+YM.slice(0,4), M=+YM.slice(5,7);
const D=(n)=>YM+"-"+String(n).padStart(2,"0");
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"原始片名"+id,videoCopy:"",nameEn:"",videoCopyEn:"",
  rawLink:"",lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",
  publishedLink:"",driveFolder:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",
  cover:"",remakes:[],publishTime:"",tags:[],products:[],usageHistory:[],metrics:[],note:"",refLink:"",
  productUrl:"",source:"官方IP",deleted:false}, o||{});
function reset(videos){
  VIEW_AS=null; BRAND=""; viewEl.innerHTML=""; modalHTML="";
  CAL_MODE="list"; CAL_PLAT="tw"; CAL_PLAT_FOR=null; CAL_YM=[Y,M-1]; INTL_CAL_YM=[Y,M-1];
  CH_CAL={shopee:{ym:[Y,M-1],acct:""}, ms:{ym:[Y,M-1],acct:""}};
  localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
}

// ══════════ ① 每一列有「原名：」「貼文：」這兩個小標籤，桌機平常藏起來 ══════════
{ reset([v_("V1",{name:"貼文文案在這",rawName:"原始片名在這",scheduledDate:D(3)})]);
  const l=viewCal();
  ok("**清單裡有「原名：」標籤，緊接在原始片名前面**",
     /<td class="cl-raw"><span class="cl-lbl">原名：<\/span>/.test(l));
  ok("**清單裡有「貼文：」標籤，緊接在貼文文案前面**",
     /<td><span class="cl-lbl">貼文：<\/span><span class="cl-t">/.test(l));
  ok("**桌機／列印平常看不到這兩個標籤**（.cl-lbl 預設 display:none）",
     /^\s*\.cl-lbl\{display:none\}/m.test(rest), rest.match(/\.cl-lbl\{[^}]*\}/g)); }

// ══════════ ② 手機上：兩欄並排（左時段、右名稱），不是三行疊、也不是擠成一行 ══════════
{ ok("**手機上 table.callist 整個變成區塊排版**", /table\.callist\{display:block\}/.test(mob));
  ok("**表頭（日期・時間／編號原始片名／貼文文案那三個 <th>）手機上藏起來**（有標籤取代了）",
     /table\.callist thead\{display:none\}/.test(mob));
  ok("**每一列（<tr>）改用 CSS Grid，兩欄格線**",
     /table\.callist tbody tr\{display:grid;grid-template-columns:[^;]+;grid-template-rows:auto auto/.test(mob),
     mob.match(/table\.callist tbody tr\{[^}]*\}/));
  ok("**日期時間那一格放進第一欄、橫跨兩個格線列**（右邊不管一行還是兩行，日期都貼齊整塊，不會被切一半）",
     /table\.callist td\.cl-when\{grid-column:1;grid-row:1\/3/.test(mob), mob.match(/table\.callist td\.cl-when\{[^}]*\}/));
  ok("**其餘格子（原名、貼文）預設丟進第二欄**（瀏覽器自動排成上下兩行，不用手動指定第幾行）",
     /table\.callist td\{[^}]*grid-column:2/.test(mob), mob.match(/table\.callist td\{[^}]*\}/));
  ok("**有 min-width:0**（grid 子項目預設也不會縮到比內容窄，省略號一樣要靠這個才裁得動）",
     /table\.callist td\{[^}]*min-width:0/.test(mob));
  ok("**手機上有分隔線，看得出一列在哪裡結束**", /table\.callist tbody tr\{[^}]*border-bottom/.test(mob));
  ok("桌機／列印沒有被改成區塊／Grid 排版（那邊本來的並排三欄還在）",
     !/table\.callist\{display:block\}/.test(rest) && !/table\.callist thead\{display:none\}/.test(rest)
     && !/table\.callist tbody tr\{display:grid/.test(rest)); }

// ══════════ ③ 警示色帶（還沒剪好／缺上片連結…）畫在整個 <tr> 上 ══════════
{ ok("**手機上警示色帶畫在整個 <tr>，不是只畫在第一格**",
     /table\.callist tbody tr\.cl-warn\{box-shadow:inset/.test(mob), mob.match(/table\.callist tbody tr\.cl-warn\{[^}]*\}/));
  ok("**手機上蓋掉「只畫在第一格」的舊規則**（不然色帶會變成兩條、對不齊）",
     /table\.callist tbody tr\.cl-warn>td:first-child\{box-shadow:none\}/.test(mob));
  ok("桌機／列印還是照舊畫在第一格（三欄並排時，色帶本來就該貼著最左邊那一欄）",
     /table\.callist tbody tr\.cl-warn>td:first-child\{box-shadow:inset/.test(rest)); }

// ══════════ ④ 這是純畫面調整：清單本身還是「只能看」，改期照舊要點日期 ══════════
{ reset([v_("V1",{name:"甲片",scheduledDate:D(3),publishTime:"10:00"})]);
  const l=viewCal();
  ok("日期照舊點得開那天的視窗", l.includes(`openDay('${D(3)}')`));
  ok("沒有夾帶任何會寫資料庫的東西", !/reschedule|unschedule|scheduleSet/i.test(l.slice(l.indexOf('class="vtable callist"')))); }

console.log(`\nv234～v236（月排程清單：手機兩欄——左時段、右名稱兩行）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
