// v246（老闆指定）：「影片指派時，如果沒有建立雲端連結只有名字，不要出現在指派
// 的區域」——只有片名、毛片連結（存檔資料夾／rawLink）還沒開的片，指派給剪輯
// 也沒東西可剪，不該混進「指派毛片給員工」那張卡的挑片清單。
// v184 之前存檔資料夾不是必填，正式資料裡還留著這種「只有名字」的舊片，
// 混在待指派清單裡讓人以為可以派。
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
    users:[ {name:"管理員",role:"boss"}, {name:"小葵",role:"editor"} ],
    settings:{ dailyTarget:4, videoTags:[], sources:["srcA"], postPlatforms:[],
      intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:vids||[],
  };
}
const as=(name,role)=>{ localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① 只有片名、沒有雲端連結（存檔資料夾／毛片連結都空）的片，不進待指派清單 ══════════
{ reset([
    {id:"NO1", name:"只有名字的片", rawName:"只有名字的片", stage:"待處理", driveFolder:"", rawLink:"", assignedTo:"", products:[], usageHistory:[], tags:[], metrics:[]},
    {id:"OK1", name:"有連結的片",   rawName:"有連結的片",   stage:"待處理", driveFolder:"https://drive.google.com/drive/folders/F", rawLink:"", assignedTo:"", products:[], usageHistory:[], tags:[], metrics:[]},
  ]); as("管理員","boss");
  const d=dashSchedule();
  ok("**沒有雲端連結的片不在待指派清單裡**", !d.unassignedPool.some(v=>v.id==="NO1"), d.unassignedPool.map(v=>v.id));
  ok("**有雲端連結的片照樣在**", d.unassignedPool.some(v=>v.id==="OK1"), d.unassignedPool.map(v=>v.id)); }

// ══════════ ② 舊資料相容：rawLink 有填也算（跟 vidHasRaw 的規矩一致，不用 driveFolder 也行） ══════════
{ reset([
    {id:"RL1", name:"舊資料只填 rawLink", rawName:"舊資料只填 rawLink", stage:"待處理", driveFolder:"", rawLink:"https://drive.google.com/drive/folders/OLD", assignedTo:"", products:[], usageHistory:[], tags:[], metrics:[]},
  ]); as("管理員","boss");
  const d=dashSchedule();
  ok("**舊資料只填 rawLink 也算有連結，照樣在清單裡**", d.unassignedPool.some(v=>v.id==="RL1"), d.unassignedPool.map(v=>v.id)); }

// ══════════ ③ 已經指派出去的，不管有沒有連結都不該在「待指派」清單（跟這次改動無關，確認沒被動到）══════════
{ reset([
    {id:"AS1", name:"已指派的片", rawName:"已指派的片", stage:"待處理", driveFolder:"https://drive.google.com/drive/folders/F", rawLink:"", assignedTo:"小葵", products:[], usageHistory:[], tags:[], metrics:[]},
  ]); as("管理員","boss");
  const d=dashSchedule();
  ok("已指派的片不在待指派清單（原規矩沒被破壞）", !d.unassignedPool.some(v=>v.id==="AS1")); }

// ══════════ ④ 整合測試：指派卡真的印不出那支「只有名字」的片 ══════════
{ reset([
    {id:"NO2", name:"整合測試只有名字", rawName:"整合測試只有名字", stage:"待處理", driveFolder:"", rawLink:"", assignedTo:"", products:[], usageHistory:[], tags:[], metrics:[]},
  ]); as("管理員","boss"); AFP_Q="";
  const d=dashSchedule();
  const card=dashAssignFootageCard(staffNamesSorted(["editor"]), d.poolN, d.unassignedPool, d.assignCount);
  ok("**指派毛片卡的清單裡真的看不到這支片**", !card.includes("整合測試只有名字"), card.slice(0,200)); }

console.log(`\nv246（指派毛片清單過濾掉沒有雲端連結、只有名字的片）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
