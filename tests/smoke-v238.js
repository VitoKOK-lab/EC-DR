// v238：月排程清單「原名」那一欄，開頭是「(podcast)」的話換成麥克風圖示＋紅色方塊。
//
// 老闆看了片名截圖說：「現在的片名，有的會出現（podcast)這個部分能不能用成一個
// 紅色的正方形簡化或者是用一個麥克風簡化不要那麼長我不想出現這個（)」，後來選定
// 「用你第一個麥克風圖示，然後在他下面加底色或者+1個正方形框」——麥克風圖示配
// 紅色圓角方塊當底，取代整段「(podcast)」文字，省下來的寬度讓片名本身多顯示幾字。
//
// 這裡只動「原名」這一欄（calRowRaw）——老闆截圖裡太長的正是原始片名，不是貼文
// 文案（calRowName），所以貼文文案那邊沒有比照處理。
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

// ══════════ ① 開頭是「(podcast)」→「原名」欄換成圖示，括號跟英文字都不見了 ══════════
// ⚠️ 只挑 cl-raw 那個 <td>（原名欄）來檢查——貼文欄（cl-t）本來就會原封不動印出
// 「(podcast)」（見④），整段 l 一起找會被貼文欄那份誤判成「沒換成圖示」。
{ reset([v_("V1",{rawName:"(podcast)我的鑑定功力是我先生給我的",scheduledDate:D(3)})]);
  const l=viewCal();
  const rawCell=l.slice(l.indexOf('class="cl-raw"'), l.indexOf('class="cl-raw"')+300);
  ok("**「原名」欄看不到「(podcast)」這幾個字了**（半形括號那個版本）",
     !/\(podcast\)/i.test(rawCell), rawCell);
  ok("**換成麥克風圖示的小方塊（.cl-podcast）**",
     /<span class="cl-podcast"[^>]*>🎙<\/span>/.test(rawCell));
  ok("圖示後面接著剩下的片名（括號拿掉之後的部分）",
     /<span class="cl-podcast"[^>]*>🎙<\/span>我的鑑定功力是我先生給我的/.test(rawCell)); }

// ══════════ ② 老闆訊息裡用的是全形括號「（」，半形「)」——兩種都要認得出來 ══════════
{ reset([v_("V2",{rawName:"（podcast)混合全形半形括號的片名",scheduledDate:D(4)})]);
  const l=viewCal();
  ok("**全形「（」配半形「)」也認得出來，一樣換成圖示**",
     /<span class="cl-podcast"[^>]*>🎙<\/span>混合全形半形括號的片名/.test(l), l.slice(l.indexOf("cl-raw"),l.indexOf("cl-raw")+300)); }

// ══════════ ③ 沒有「(podcast)」的片名照舊，不會被誤判 ══════════
{ reset([v_("V3",{rawName:"這支片名裡完全沒有播客兩個字",scheduledDate:D(5)})]);
  const l=viewCal();
  const rawCell=l.slice(l.indexOf('class="cl-raw"'), l.indexOf('class="cl-raw"')+300);
  ok("**沒有 podcast 標籤的片名，「原名」欄不會多出麥克風方塊**", !/cl-podcast/.test(rawCell), rawCell);
  ok("片名本身原封不動印出來", rawCell.includes("這支片名裡完全沒有播客兩個字")); }

// ══════════ ④ 「貼文文案」那一欄不受影響——這次只動「原名」欄 ══════════
{ reset([v_("V4",{rawName:"(podcast)原名有標籤",name:"(podcast)貼文文案也長這樣",scheduledDate:D(6)})]);
  const l=viewCal();
  const capIdx=l.indexOf("(podcast)貼文文案也長這樣");
  ok("**貼文文案欄（calRowName／cl-t）照樣印出「(podcast)」原始文字，沒有被換成圖示**",
     capIdx>=0, l.match(/<span class="cl-t">[^<]*<\/span>/g)); }

// ══════════ ⑤ CSS：紅色方塊底、麥克風圖示置中，桌機／列印沒有另外動 ══════════
{ ok("**index.html 裡有 .cl-podcast 這顆紅底方塊的樣式**",
     /\.cl-podcast\{[^}]*background:var\(--red\)/.test(HTML), HTML.match(/\.cl-podcast\{[^}]*\}/)); }

console.log(`\nv238（月排程清單原名欄：(podcast) 換成麥克風圖示＋紅色方塊）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
