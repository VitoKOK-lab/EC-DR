// v252（老闆指定）：「Asmeer 自己新增的內容，台灣的剪輯不需要看到」——
// 海外同事自己原創拍英文/泰文內容時，locale／channel 都是空的（它們是「源片」
// 不是「版本殼」），isSourceVid() 判斷不出語言，所以會混進台灣管理層「指派毛片
// 給員工」的清單、也會墊高「毛片存量」的數字。改成同時用 zoneOfVideo() 擋掉
// 海外語言的源片，跟影片庫原本「源片看原本語言分區」的規矩一致。
const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
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

const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,10);
todayTW=()=>FROZEN; ydayTW=()=>FROZEN; refreshToday();

function reset(vids){
  STATE = {
    users:[ {name:"管理員",role:"boss"}, {name:"小葵",role:"editor"}, {name:"Asmeer",role:"intl"} ],
    settings:{ dailyTarget:4, videoTags:[], sources:["srcA"], postPlatforms:[],
      intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:vids||[],
  };
}
const as=(name,role)=>{ localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① Asmeer 自己原創的英文源片，不進台灣的指派毛片清單 ══════════
{ reset([
    {id:"EN1", name:"English raw by Asmeer", rawName:"English raw by Asmeer", stage:"待處理",
      origLang:"en", locale:"", channel:"", driveFolder:"https://drive.google.com/drive/folders/F",
      rawLink:"https://drive.google.com/drive/folders/RAW", shotAt:"2026-08-01", assignedTo:"",
      products:[], usageHistory:[], tags:[], metrics:[]},
    {id:"TW1", name:"中文毛片", rawName:"中文毛片", stage:"待處理",
      origLang:"", locale:"", channel:"", driveFolder:"https://drive.google.com/drive/folders/F2",
      rawLink:"https://drive.google.com/drive/folders/RAW2", shotAt:"2026-08-01", assignedTo:"",
      products:[], usageHistory:[], tags:[], metrics:[]},
  ]); as("管理員","boss");
  const d=dashSchedule();
  ok("**英文源片不在台灣的待指派清單裡**", !d.unassignedPool.some(v=>v.id==="EN1"), d.unassignedPool.map(v=>v.id));
  ok("**中文毛片照樣在**", d.unassignedPool.some(v=>v.id==="TW1"), d.unassignedPool.map(v=>v.id));
  const card=dashAssignFootageCard(staffNamesSorted(["editor"]), d.poolN, d.unassignedPool, d.assignCount);
  ok("**指派毛片卡的清單裡真的看不到英文片名**", !card.includes("English raw by Asmeer"), card.slice(0,200)); }

// ══════════ ② 泰文源片也一樣擋掉 ══════════
{ reset([
    {id:"TH1", name:"泰文源片", rawName:"泰文源片", stage:"待處理",
      origLang:"th", locale:"", channel:"", driveFolder:"", rawLink:"https://drive.google.com/drive/folders/RAW3",
      shotAt:"2026-08-01", assignedTo:"", products:[], usageHistory:[], tags:[], metrics:[]},
  ]); as("管理員","boss");
  const d=dashSchedule();
  ok("**泰文源片也不在台灣的待指派清單裡**", !d.unassignedPool.some(v=>v.id==="TH1")); }

// ══════════ ③ 海外二創版本殼（locale 有值）本來就不算源片，不受影響（確認沒有動到既有規矩） ══════════
{ reset([
    {id:"VER1", name:"英文版本殼", rawName:"英文版本殼", stage:"待處理", locale:"en", channel:"",
      origLang:"", sourceVideoId:"TW1", driveFolder:"", rawLink:"https://drive.google.com/drive/folders/RAW4",
      shotAt:"2026-08-01", assignedTo:"", products:[], usageHistory:[], tags:[], metrics:[]},
  ]); as("管理員","boss");
  const d=dashSchedule();
  ok("版本殼本來就不算源片，一樣不在清單裡（跟改動前的規矩一致）", !d.unassignedPool.some(v=>v.id==="VER1")); }

// ══════════ ④ 毛片存量（rawStock）也排除海外語言的源片 ══════════
{ reset([
    {id:"EN2", name:"English raw 2", rawName:"English raw 2", stage:"待處理", origLang:"en", locale:"", channel:"",
      driveFolder:"", rawLink:"https://drive.google.com/drive/folders/RAW5", shotAt:"2026-08-01",
      products:[], usageHistory:[], tags:[], metrics:[]},
    {id:"TW2", name:"中文毛片2", rawName:"中文毛片2", stage:"待處理", origLang:"", locale:"", channel:"",
      driveFolder:"", rawLink:"https://drive.google.com/drive/folders/RAW6", shotAt:"2026-08-01",
      products:[], usageHistory:[], tags:[], metrics:[]},
  ]); as("管理員","boss");
  const stock=rawStock();
  ok("**毛片存量只算中文的（1 支），不把英文片墊進去**", stock.length===1 && stock[0].id==="TW2", stock.map(v=>v.id)); }

console.log(`\nv252（指派毛片清單／毛片存量排除海外語言的源片，不要跟台灣中文剪輯混在一起）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
