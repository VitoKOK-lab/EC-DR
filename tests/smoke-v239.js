// v239：影片編輯視窗的「標籤（可複選）」多一個「Podcast」選項，勾了就會在
// 月排程清單「原名」欄冒出麥克風圖示——不用再手動把「(podcast)」打進片名裡。
//
// 老闆說：「我要在編輯影片內容的時候在下面的關鍵字可以有一個Podcast的選項，
// 只要有打勾的都可以出現這個圖案不用另外在檔案名稱輸入這個字」。
//
// v238 原本只認片名裡的「(podcast)」文字；這次加一條路：勾「Podcast」標籤
// 也算數。舊片名裡還留著文字的，照舊認得出來、照樣拿掉——兩條路徑並存。
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

const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,10);
todayTW=()=>FROZEN; ydayTW=()=>FROZEN; refreshToday();
const YM=FROZEN.slice(0,7), Y=+YM.slice(0,4), M=+YM.slice(5,7);
const D=(n)=>YM+"-"+String(n).padStart(2,"0");
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"原始片名"+id,videoCopy:"",nameEn:"",videoCopyEn:"",
  rawLink:"",lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",
  publishedLink:"",driveFolder:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",
  cover:"",remakes:[],publishTime:"",tags:[],products:[],usageHistory:[],metrics:[],note:"",refLink:"",
  productUrl:"",source:"官方IP",deleted:false}, o||{});
function reset(videos, settings){
  VIEW_AS=null; BRAND=""; viewEl.innerHTML=""; modalHTML="";
  CAL_MODE="list"; CAL_PLAT="tw"; CAL_PLAT_FOR=null; CAL_YM=[Y,M-1]; INTL_CAL_YM=[Y,M-1];
  CH_CAL={shopee:{ym:[Y,M-1],acct:""}, ms:{ym:[Y,M-1],acct:""}};
  localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"管理員",role:"boss"}],
    settings:Object.assign({dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"}, settings||{}),
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
}

// ══════════ ① 「Podcast」永遠是可以勾的標籤選項，不管 Firestore 存了什麼 ══════════
{ reset([]);
  ok("**settings.videoTags 是空的（正式資料常見的預設情況），videoTags() 還是有「Podcast」**",
     videoTags().includes("Podcast"), videoTags());
  reset([], {videoTags:["寵粉","珠寶介紹"]});
  ok("**settings.videoTags 已經存了別的標籤，「Podcast」還是會補進去**",
     videoTags().includes("Podcast"), videoTags());
  ok("otherTags() 也看得到「Podcast」（標籤選單用這個，不是 videoTags() 本身）",
     otherTags().includes("Podcast")); }

// ══════════ ② 編輯視窗的標籤選單（tagPickerHTML）印得出「Podcast」這顆勾選框 ══════════
{ reset([]);
  const html=tagPickerHTML("e", []);
  ok("**標籤選單裡有 value=\"Podcast\" 的 checkbox**",
     /class="e_tag" value="Podcast"/.test(html), html.match(/value="Podcast"[^>]*/)); }

// ══════════ ③ 勾了「Podcast」標籤，片名完全沒有「(podcast)」文字，一樣冒出圖示 ══════════
{ reset([v_("V1",{rawName:"這支片名裡完全沒有那段文字",tags:["Podcast"],scheduledDate:D(3)})]);
  const l=viewCal();
  const rawCell=l.slice(l.indexOf('class="cl-raw"'), l.indexOf('class="cl-raw"')+300);
  ok("**只靠標籤（沒有片名文字）也會冒出麥克風圖示**",
     /<span class="cl-podcast"[^>]*>🎙<\/span>/.test(rawCell), rawCell);
  ok("**片名本身一個字都沒被動到**（沒有文字可拿掉，不該把片名切壞）",
     rawCell.includes("這支片名裡完全沒有那段文字")); }

// ══════════ ④ 舊片名：文字路徑照舊有效（沒勾標籤，純靠片名裡的「(podcast)」） ══════════
{ reset([v_("V2",{rawName:"(podcast)舊片名還留著這段文字",tags:[],scheduledDate:D(4)})]);
  const l=viewCal();
  const rawCell=l.slice(l.indexOf('class="cl-raw"'), l.indexOf('class="cl-raw"')+300);
  ok("**沒勾標籤，片名文字路徑照舊有效**",
     /<span class="cl-podcast"[^>]*>🎙<\/span>舊片名還留著這段文字/.test(rawCell), rawCell); }

// ══════════ ⑤ 兩條路都有（片名文字＋標籤都在）：圖示只印一次，文字照樣拿掉 ══════════
{ reset([v_("V3",{rawName:"(podcast)兩條路都有的片名",tags:["Podcast"],scheduledDate:D(5)})]);
  const l=viewCal();
  const rawCell=l.slice(l.indexOf('class="cl-raw"'), l.indexOf('class="cl-raw"')+300);
  const badgeCount=(rawCell.match(/class="cl-podcast"/g)||[]).length;
  ok("**圖示只出現一次**（不會因為兩條路徑都命中就印兩顆）", badgeCount===1, badgeCount);
  ok("片名裡的「(podcast)」文字照樣拿掉", !/\(podcast\)/i.test(rawCell)); }

console.log(`\nv239（影片標籤加「Podcast」選項，勾了清單也會冒圖示）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
