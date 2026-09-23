// v234～v237：月排程清單，手機版反覆調整過四輪，最後定案「三行、字縮小」。
//
// 第一輪（v234）三行疊（日期時間 → 原名 → 貼文），老闆嫌高。
// 第二輪（v235）改成日期時間一行、原名貼文同一行對半分，老闆說「全錯」。
// 第三輪（v236）改成兩欄並排（左時段、右名稱兩行），先用文字確認過才做，
// 老闆回「對，就這樣」——合併上線。
// 第四輪（v237）上線後老闆看著正式資料裡的真實長片名說：「這樣子不夠好，
// 我也需要看到更完整的名稱，所以你幫我把左邊時間日期的移到上面讓名稱可以
// 完整的更多的空間可以顯示然後字的大小縮小2號」——v236 的左欄時段佔掉將近
// 四分之一寬度，真實片名一截斷就看不出是哪一支。最終改回時段自己一整行、
// 原名／貼文各自一整行接在下面（等於回到 v234 的排法，但這次是為了**騰出
// 寬度**，不是排版好不好看的問題），原名／貼文的字體另外縮小（15px→13px）。
//
// 這裡只測最後定案（v237）的樣子：
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

// ══════════ ② 手機上：日期時間自己一整行在最上面，原名／貼文各自一整行接在下面 ══════════
// v237：這次是為了給名稱騰出「整行寬度」，不是排版好不好看的問題——真實
// 片名比測試資料長很多，左邊留一欄時段會把僅剩的寬度吃掉一大塊。
{ ok("**手機上 table.callist 整個變成區塊排版**", /table\.callist\{display:block\}/.test(mob));
  ok("**表頭（日期・時間／編號原始片名／貼文文案那三個 <th>）手機上藏起來**（有標籤取代了）",
     /table\.callist thead\{display:none\}/.test(mob));
  ok("**每一列（<tr>）是區塊、不是 flex 也不是 grid**（三個 <td> 各自一整行，由上往下疊）",
     /table\.callist tbody tr\{display:block/.test(mob), mob.match(/table\.callist tbody tr\{[^}]*\}/));
  ok("**每一格（<td>）也是區塊**（日期時間、原名、貼文各自佔滿一整行寬度）",
     /table\.callist td\{display:block/.test(mob));
  ok("**手機上有分隔線，看得出一列在哪裡結束**", /table\.callist tbody tr\{[^}]*border-bottom/.test(mob));
  ok("桌機／列印沒有被改成區塊排版（那邊本來的並排三欄還在）",
     !/table\.callist\{display:block\}/.test(rest) && !/table\.callist thead\{display:none\}/.test(rest)); }

// ══════════ ③ 手機上原名／貼文的字縮小（15px → 13px），騰出更多字數 ══════════
{ ok("**手機上原名（.cl-rawt）跟貼文（.cl-t）的字級縮小**",
     /table\.callist td \.cl-rawt,table\.callist td \.cl-t\{font-size:13px\}/.test(mob),
     mob.match(/table\.callist td \.cl-rawt[^{]*\{[^}]*\}/));
  ok("桌機／列印沒有被縮小字級（那邊本來空間就夠）",
     !/\.cl-rawt,table\.callist td \.cl-t\{font-size:13px\}/.test(rest)); }

// ══════════ ④ 警示色帶（還沒剪好／缺上片連結…）畫在整個 <tr> 上 ══════════
{ ok("**手機上警示色帶畫在整個 <tr>，不是只畫在第一格**",
     /table\.callist tbody tr\.cl-warn\{box-shadow:inset/.test(mob), mob.match(/table\.callist tbody tr\.cl-warn\{[^}]*\}/));
  ok("**手機上蓋掉「只畫在第一格」的舊規則**（不然色帶會變成兩條、對不齊）",
     /table\.callist tbody tr\.cl-warn>td:first-child\{box-shadow:none\}/.test(mob));
  ok("桌機／列印還是照舊畫在第一格（三欄並排時，色帶本來就該貼著最左邊那一欄）",
     /table\.callist tbody tr\.cl-warn>td:first-child\{box-shadow:inset/.test(rest)); }

// ══════════ ⑤ 這是純畫面調整：清單本身還是「只能看」，改期照舊要點日期 ══════════
{ reset([v_("V1",{name:"甲片",scheduledDate:D(3),publishTime:"10:00"})]);
  const l=viewCal();
  ok("日期照舊點得開那天的視窗", l.includes(`openDay('${D(3)}')`));
  ok("沒有夾帶任何會寫資料庫的東西", !/reschedule|unschedule|scheduleSet/i.test(l.slice(l.indexOf('class="vtable callist"')))); }

console.log(`\nv234～v237（月排程清單：手機三行＋字縮小，騰出寬度給完整名稱）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
