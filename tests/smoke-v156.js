// v153 ⑤：選品配對的候選影片清單，不要把七百多張卡片一次全畫出來。
//
// 實測正式資料：整個「選品配對」頁 6296 個 DOM 節點、403KB HTML，其中
// **6278 個節點（100%）** 都在「1️⃣ 商品資訊」那一塊的候選影片清單裡 ——
// 每一支候選片一張卡、一張兩顆按鈕，757 支就是 1075 顆按鈕。
// 而那一塊的外框是 max-height:520px 的捲動區，同時看得到的只有 5 張左右。
// 手機上光把它塞進畫面就要 2.4 秒。
//
// 照「操作紀錄」那一頁既有的慣例改成「只畫前 N 張」＋講清楚還有幾支。
// ⚠️ 已經選為主選／備選的一定要在畫面上 —— 不然捲不到就會以為自己沒選到。
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
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const TODAY=D(0);
function reset(n, who, role){
  modalHTML=""; viewEl.innerHTML="";
  MATCH_VQ=""; MATCH_VTAB="done"; MATCH_VFILTER="all"; MATCH_PRIMARY_ID=null; MATCH_BACKUP_ID=null;
  VIEW_AS=null; BRAND="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const videos=[];
  for(let i=0;i<n;i++) videos.push({id:"V"+i, code:"C"+i, name:"候選片"+i, rawName:"候選片"+i,
    videoCopy:"文案"+i, rawLink:"http://r", driveFolder:"http://d", publishedLink:"http://p",
    stage:"已上片", editor:"小葵", claimedBy:"", assignedTo:"", scheduledDate:TODAY, claimedAt:"",
    finishedAt:TODAY+"T10:00:00", durationMin:0, reviewStatus:"通過", locale:"", channel:"",
    origLang:"", account:"", sourceVideoId:"", lib:"", cover:"", remakes:[], tags:[], products:[],
    usageHistory:[], metrics:[], deleted:false, productUrl:""});
  const raw={ users:[{name:"怡萍",role:"pick"},{name:"管理員",role:"boss"},{name:"小葵",role:"editor"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos,
    products:[{id:"P1",name:"商品一",sku:"S1"}], matches:[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"怡萍"); localStorage.setItem("ecdr_role", role||"pick");
}
const nCards=(h)=>(h.match(/setMatchVideo\('primary'/g)||[]).length;

// ══════════ ① 上限 ══════════
{ reset(300);
  const h=matchVideoListHTML();
  ok("300 支候選 → 只畫 40 張卡", nCards(h)===40, nCards(h));
  ok("有講清楚總共幾支", /符合的共 <b>300<\/b> 支/.test(h), h.slice(h.length-260));
  ok("有講只列了幾支", /只列前 40 支/.test(h));
  ok("有告訴人怎麼找到其他的", /搜尋|分頁/.test(h)); }

{ reset(10);
  const h=matchVideoListHTML();
  ok("只有 10 支時全部畫出來", nCards(h)===10, nCards(h));
  ok("沒有超過就不要多那句話", !/只列前/.test(h)); }

{ reset(40);
  ok("剛好 40 支：全畫，不加那句話",
     nCards(matchVideoListHTML())===40 && !/只列前/.test(matchVideoListHTML())); }

{ reset(0);
  ok("一支都沒有時講「沒有符合條件的影片」", /沒有符合條件的影片/.test(matchVideoListHTML())); }

// ══════════ ② 選到的一定要看得見（不然人會以為沒選到）══════════
{ reset(300);
  MATCH_PRIMARY_ID="V250"; MATCH_BACKUP_ID="V299";      // 兩支都在 40 名之外
  const h=matchVideoListHTML();
  ok("選在第 251 支的主選，照樣出現在畫面上", h.includes("候選片250"));
  ok("選在第 300 支的備選，照樣出現在畫面上", h.includes("候選片299"));
  ok("而且標成主選", /主選影片<\/span>/.test(h));
  ok("而且標成備選", /備選影片<\/span>/.test(h));
  ok("總張數還是 40（選到的擠掉後面的，不是多加兩張）", nCards(h)===40, nCards(h));
  ok("兩支選到的排在最前面",
     h.indexOf("候選片250")<h.indexOf("候選片0") && h.indexOf("候選片299")<h.indexOf("候選片0")); }

// ══════════ ③ 搜尋還是照樣能找到後面的 ══════════
{ reset(300);
  MATCH_VQ="候選片287";
  const h=matchVideoListHTML();
  ok("搜尋找得到第 288 支", h.includes("候選片287"));
  ok("搜尋之後只剩符合的", nCards(h)===1, nCards(h));
  ok("搜到的數量少於上限就不加那句話", !/只列前/.test(h));
  MATCH_VQ=""; }

// ══════════ ④ 沒有把畫面弄壞 ══════════
{ reset(300);
  const h=matchVideoListHTML();
  ok("每張卡都還有主選鈕", (h.match(/setMatchVideo\('primary'/g)||[]).length===40);
  ok("每張卡都還有備選鈕", (h.match(/setMatchVideo\('backup'/g)||[]).length===40);
  ok("片名還在", h.includes("候選片0"));
  CUR_TAB="match";
  const full=viewMatch();
  ok("整頁畫得出來", full.includes("商品資訊"));
  ok("整頁的按鈕數大幅下降（原本 757 支就是上千顆）",
     (full.match(/<button/g)||[]).length<200, (full.match(/<button/g)||[]).length); }

console.log(`\nv153⑤（選品配對不要一次畫七百張卡）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
