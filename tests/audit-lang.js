// 語言洩漏掃描：資料全用 ASCII 名稱 → intl 視角輸出裡任何 CJK＝介面漏中文；
// editor 視角則掃「常見英文 UI 詞」＝介面漏英文（資料不含這些詞）
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
  users:[ {name:"Kai",role:"editor"}, {name:"Anna",role:"intl"}, {name:"Omar",role:"intl"}, {name:"Sara",role:"cs"} ],
  settings:{ dailyTarget:4, videoTags:["oldtag"], sources:["srcA"], postPlatforms:[{name:"IG",utm:"ig"}],
    intlAccounts:[{locale:"th",name:"acctTH"},{locale:"en",name:"acctEN"}],
    shopeeAccounts:["acctSHP"], msAccounts:["acctMS"], exchangeRates:{en:{code:"USD",rate:0.031,mult:1},th:{code:"THB",rate:1.1,mult:1},ms:{code:"MYR",rate:0.14,mult:1},shopee:{code:"TWD",rate:1,mult:1.2}} },
  schedule:{}, shifts:{ ["Kai__"+T0]:{id:"k",user:"Kai",date:T0,clockIn:T0+"T01:00:00",clockOut:""} },
  tasks:{ K1:{id:"K1",user:"Kai",date:T0,title:"taskA",report:"note",done:false,assignedBy:"Regina",ack:true,createdAt:T0},
          K2:{id:"K2",user:"Sara",date:T0,title:"taskB",report:"",done:false,createdAt:T0},
          // 同事之間的訊息：三種狀態各一則，收件匣／發訊人／主管三張卡才都畫得出來被掃到
          P1:{id:"P1",kind:"p2p",user:"Anna",from:"Omar",date:T0,title:"msgNew",ack:false,reply:"",fromSeen:false,createdAt:T0+"T01:00:00"},
          P2:{id:"P2",kind:"p2p",user:"Anna",from:"Omar",date:T0,title:"msgOpened",ack:true,ackAt:T0,reply:"",fromSeen:false,createdAt:T0+"T02:00:00"},
          P3:{id:"P3",kind:"p2p",user:"Omar",from:"Anna",date:T0,title:"msgSent",ack:true,ackAt:T0,reply:"replyText",replyAt:T0,fromSeen:false,createdAt:T0+"T03:00:00"},
          P4:{id:"P4",kind:"p2p",user:"Omar",from:"Anna",date:T0,title:"msgWaiting",ack:false,reply:"",fromSeen:false,createdAt:T0+"T04:00:00"},
          P5:{id:"P5",kind:"p2p",user:"Omar",from:"Anna",date:T0,title:"msgRead",ack:true,ackAt:T0,reply:"",fromSeen:false,createdAt:T0+"T05:00:00"} },
  logs:[], deletedVideos:[],
  videos:[
    {id:"S2",name:"SRC pub",rawName:"SRC pub",nameEn:"SRC pub EN",videoCopy:"copyZH",videoCopyEn:"copyEN",stage:"已上片",published:true,tags:["oldtag"],publishedLink:"http://x",driveFolder:"http://d",rawLink:"http://r",finishedAt:"2020-01-01T00:00:00Z",locale:"",channel:"",products:[{name:"prodA",price:"100",salePrice:"80"}],usageHistory:[],metrics:[]},
    {id:"E1",name:"EN shell",rawName:"SRC pub",stage:"待處理",locale:"en",sourceVideoId:"S2",account:"acctEN",createdBy:"Anna",scheduledDate:T0,usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"T1",name:"TH shell",rawName:"SRC pub",stage:"剪輯中",locale:"th",sourceVideoId:"S2",account:"acctTH",claimedBy:"Anna",editor:"Anna",claimedAt:T0+"T01:00:00Z",scheduledDate:T0,usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"P1",name:"SHP shell",rawName:"SRC pub",stage:"待處理",channel:"shopee",sourceVideoId:"S2",account:"acctSHP",scheduledDate:T0,usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};

let issues=[];
// 例外（設計如此，不算洩漏）：標籤是資料庫的業務分類、階段字串只存在 <option value> 內部值
// 「文」是翻譯圖示 文A 的字形（圖示不是介面文字，海外看到的也是同一顆），跟標籤／階段一樣屬於設計例外
const ALLOW=["寵粉","珠寶介紹","子女傳承","代理招商","銷售","新片","舊片","待處理","剪輯中","已完成","已上片","待審核","流量型","帶貨型","文"];
function scanCJK(label, html){
  let t=String(html);
  ALLOW.forEach(w=>{ t=t.split(w).join(""); });
  const m=t.match(/[一-鿿]{1,}/g);
  if(m) issues.push(`[intl漏中文] ${label}: ${[...new Set(m)].slice(0,8).join(" / ")}`); }
// editor 視角掃英文 UI 詞（避開資料/固定專名）
const EN_WORDS=/\b(Claim & start|Add version|pick account|Return to the library|Unschedule|Scheduled upload date|Mark .* as done|My Work|To do\b|In progress|Done —|Save\b|Cancel\b|Watch Chinese|Download|untitled|Ask admin|Nothing scheduled|added to To do)\b/g;
function scanEN(label, html){ const m=String(html).replace(/English \(TikTok\)|Thai \(TikTok\)/g,"").match(EN_WORDS);
  if(m) issues.push(`[editor漏英文] ${label}: ${[...new Set(m)].slice(0,8).join(" / ")}`); }

// ---- intl 視角：所有主畫面 + 彈窗 ----
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
WORK_ZONE="shopee"; scanCJK("viewWork", viewWork());
WORK_ZONE="en"; scanCJK("viewWork(zone en)", viewWork());
VID_LANG=""; VID_VIEW="raw"; VID_TAGS=new Set(); VID_Q="";
scanCJK("viewVideos", viewVideos());
scanCJK("viewTeam", viewTeam());
["tw","th","shopee","en","ms"].forEach(p=>{ CAL_PLAT=p; CAL_YM=null; INTL_CAL_YM=null; INTL_ACCT=""; CH_CAL={shopee:{ym:null,acct:""},ms:{ym:null,acct:""}};
  try{ scanCJK("viewCal:"+p, viewCal()); }catch(e){ issues.push("[炸] viewCal:"+p+" "+e.message); } });
openIntlModal("E1"); scanCJK("openIntlModal", modalHTML);
openChModal("shopee","P1"); scanCJK("openChModal", modalHTML);
openVideoModal("S2",false); scanCJK("openVideoModal view", modalHTML);
openVideoModal("S2",true); scanCJK("openVideoModal edit", modalHTML);
INTL_ACCT="acctEN"; openDayIntl(T0); scanCJK("openDayIntl", modalHTML);
CH_CAL={shopee:{ym:null,acct:"acctSHP"},ms:{ym:null,acct:""}}; openDayCh("shopee",T0); scanCJK("openDayCh", modalHTML);
openDay(T0); scanCJK("openDay(TW)", modalHTML);

// ---- editor 視角：同一批畫面掃英文 ----
localStorage.setItem("ecdr_user","Kai"); localStorage.setItem("ecdr_role","editor");
WORK_ZONE="shopee"; scanEN("viewWork", viewWork());
WORK_ZONE="en"; scanEN("viewWork(zone en)", viewWork());
scanEN("viewVideos", viewVideos());
scanEN("viewTeam", viewTeam());
["tw","th","shopee","en","ms"].forEach(p=>{ CAL_PLAT=p; CAL_YM=null; INTL_CAL_YM=null; INTL_ACCT=""; CH_CAL={shopee:{ym:null,acct:""},ms:{ym:null,acct:""}};
  try{ scanEN("viewCal:"+p, viewCal()); }catch(e){ issues.push("[炸] viewCal:"+p+" "+e.message); } });
openIntlModal("E1"); scanEN("openIntlModal", modalHTML);
openChModal("shopee","P1"); scanEN("openChModal", modalHTML);
INTL_ACCT="acctEN"; openDayIntl(T0); scanEN("openDayIntl", modalHTML);
openDay(T0); scanEN("openDay(TW)", modalHTML);

// ---- 登入流程、密碼設定頁、離線橫幅（intl 視角）----
// 這幾個畫面不在上面那批 view 函式裡，之前掃不到 —— 海外同事每次換裝置都會撞見。
// loginAs / bootLogin 執行時 ecdr_role 還沒寫進 localStorage，
// 所以它們必須靠手上那個人的 role 判斷語言，不能靠 T()。這一段就是在驗那件事。
(async()=>{
  const annaU={name:"Anna", role:"intl"};                       // 沒有 pwHash → pwCheck 走純字串比對，不需要 crypto
  // ① 密碼設定頁：登入成功後才會看到，這時 ecdr_role 已經是 intl
  localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
  scanCJK("pwGateHTML", pwGateHTML());

  // ② 離線橫幅：全員都看得到，海外也是。要先讓 mustSetPw() 為 false 才畫得到主畫面
  const anna=STATE.users.find(u=>u.name==="Anna"); anna.pwHash="pbkdf2$1$x$y";
  ONLINE=false; CUR_TAB="work"; WORK_ZONE="en"; viewEl.innerHTML="";
  try{ render(); scanCJK("render:offline", viewEl.innerHTML); }
  catch(e){ issues.push("[炸] render:offline "+e.message); }
  ONLINE=true; delete anna.pwHash;

  // ③ 登入時的三則提示：ecdr_role 故意清掉，模擬「第一次在這台裝置登入」
  localStorage.removeItem("ecdr_user"); localStorage.removeItem("ecdr_role");
  const said=[]; const _alert=global.alert, _prompt=global.prompt, _toast=toast;
  global.alert=(m)=>said.push(String(m)); toast=(m)=>said.push(String(m));
  // 手機擋登入的那則
  global.navigator={onLine:true, userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"};
  global.prompt=()=>null;
  await loginAs(annaU);
  // 密碼錯誤的那則（換回桌機 UA，prompt 回一個錯的密碼）
  global.navigator={onLine:true, userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64)"};
  global.prompt=(m)=>{ said.push(String(m)); return "definitely-wrong"; };
  await loginAs(annaU);
  scanCJK("loginAs(提示訊息)", said.join("\n"));

  // ④ 快速登入：這台裝置認得他是誰，三顆字要跟著他的職位走
  const grid=[]; const _gid=global.document.getElementById;
  global.document.getElementById=(id)=> id==="userGrid"
    ? { set innerHTML(v){}, get innerHTML(){return "";}, appendChild(n){ grid.push(n); } }
    : _gid(id);
  global.document.createElement=()=>({className:"",textContent:"",onclick:null,
    appendChild(n){ this.textContent+=" "+(n.textContent||""); }});
  localStorage.setItem("ecdr_last","Anna"); LOGIN_ALL=false;
  try{ bootLogin(); scanCJK("bootLogin(快速登入)", grid.map(n=>n.textContent||"").join(" ")); }
  catch(e){ issues.push("[炸] bootLogin "+e.message); }
  global.document.getElementById=_gid; global.alert=_alert; global.prompt=_prompt; toast=_toast;

  console.log(issues.length?issues.join("\n"):"(無洩漏)");
  console.log("\n總計:",issues.length,"處");
})();
