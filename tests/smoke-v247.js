// v247（老闆指定・臨時功能）：「幫巧芸做一個頁面，把陳鋒所有需要審查審核的影片
// 列出來，讓他可以快速按下審核確認，還要確定他按得下去，因為有的他無法按」。
//
// ⚠️ v185 釘死了一條規矩：誰是外包（陳鋒）不准寫死在程式邏輯裡，要用設定裡的
// 旗標。這個臨時功能也不例外——要審誰的片、到哪天，一律讀 settings.reviewSpotlight
// （{who, until}），app.js 裡完全不出現任何人名。這支測試故意不用真名，
// 確保這條規矩沒有被這次改動繞過去。
//
// 按鈕直接呼叫跟審片視窗一模一樣的 reviewVid()——不是另外寫一套。
const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
const APP = src;
src = src.replace(/^let /gm, "").replace(/^const /gm, "");
const el = () => ({ value:"", innerHTML:"", textContent:"", className:"",
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){}, appendChild(){}, querySelector(){return null;}, querySelectorAll(){return [];},
  getAttribute(){return null;}, setAttribute(){}, closest(){return null;}, getBoundingClientRect(){return {top:0,left:0,bottom:0,right:0};} });
const store={};
global.localStorage = { getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };
let viewEl=el();
global.document = { getElementById:(id)=>{ if(id==="view") return viewEl; return el(); },
  addEventListener(){}, createElement:()=>el(), body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null, querySelectorAll:()=>[] };
global.window = { addEventListener(){}, innerWidth:390, innerHeight:800, scrollY:0, scrollTo(){}, DB:null, location:{reload(){}} };
global.requestAnimationFrame=(f)=>f();
global.navigator = { onLine:true };
global.confirm = ()=>true; global.prompt = ()=>null;
eval(src);

const FROZEN="2026-10-20";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN; refreshToday();

const V0={stage:"已完成", reviewStatus:"", finishedAt:FROZEN+"T10:00:00", publishedLink:"", products:[], usageHistory:[], tags:[], metrics:[]};
function reset(spotlight){
  STATE = {
    users:[ {name:"巧芸",role:"editor",perms:["review"]}, {name:"編輯甲",role:"editor"} ],
    settings:{ dailyTarget:4, videoTags:[], sources:["srcA"], postPlatforms:[], reviewSince:"2020-01-01",
      intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{}, reviewSpotlight:spotlight },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    videos:[ Object.assign({id:"S1", name:"片一", rawName:"片一", editor:"編輯甲"}, V0),
             Object.assign({id:"S2", name:"片二", rawName:"片二", editor:"別人"}, V0) ],
  };
}
const as=(name,role)=>{ localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① 沒設定 settings.reviewSpotlight 就什麼都不顯示 ══════════
{ reset(null); as("巧芸","editor");
  ok("**沒設定就不顯示（不是預設給誰）**", reviewSpotlightCard()==="", reviewSpotlightCard()); }

// ══════════ ② 設定了對象＋沒過期：有 review 權限的人看得到，只列那個人的待審片 ══════════
{ reset({who:"編輯甲", until:"2026-11-20"}); as("巧芸","editor");
  const c=reviewSpotlightCard();
  ok("**看得到卡片**", c.includes("待審影片"), c.slice(0,120));
  ok("**列出來的是指定那個人的片（片一）**", c.includes("片一"));
  ok("**不是指定那個人的片不會混進來（片二）**", !c.includes("片二"));
  ok("**按鈕直接叫 reviewVid（跟審片視窗同一支函式，不是另外寫一套）**",
     c.includes("reviewVid('S1','通過')") && c.includes("reviewVid('S1','退回')")); }

// ══════════ ③ 過期了自動消失（不用等人手動關掉） ══════════
{ reset({who:"編輯甲", until:"2026-10-19"}); as("巧芸","editor");
  ok("**過了 until 那天，卡片自動不見**", reviewSpotlightCard()==="", reviewSpotlightCard()); }
{ reset({who:"編輯甲", until:"2026-10-20"}); as("巧芸","editor");
  ok("（邊界）until 當天還看得到", reviewSpotlightCard().includes("待審影片")); }

// ══════════ ④ 沒有 review／lead 權限、也不是 boss/manager 的人看不到（沒有大開後門） ══════════
{ reset({who:"編輯甲", until:"2026-11-20"}); as("編輯甲","editor");
  ok("**沒有審核權限的人看不到這張卡**（雖然卡片列的是他自己的片）", reviewSpotlightCard()===""); }

// ══════════ ⑤ v185 的規矩沒被繞過：app.js 裡完全不出現任何寫死的人名邏輯 ══════════
{ const code=APP.split("\n").filter(l=>!/^\s*(\/\/|\*)/.test(l)).join("\n");
  ok("**reviewSpotlight 的對象完全來自 settings，程式碼裡沒有把任何名字寫死**",
     /reviewSpotlight\(\)\s*\{\s*return\s*\(STATE&&STATE\.settings&&STATE\.settings\.reviewSpotlight\)/.test(code.replace(/\s+/g," "))); }

// ══════════ ⑥ 真的畫在巧芸的「每日工作」頁上 ══════════
{ reset({who:"編輯甲", until:"2026-11-20"}); as("巧芸","editor");
  const w=viewWork();
  ok("**巧芸打開「每日工作」真的看得到這張卡**", w.includes("待審影片") && w.includes("片一")); }

console.log(`\nv247（巧芸快速審核陳鋒待審片・臨時功能・對象與到期日都來自設定不寫死）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
