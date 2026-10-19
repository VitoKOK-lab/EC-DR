// v258（老闆回報）：「綠色剪輯完成 是審過了 但是點進去是沒審過的，然後有的是
// 像右邊那張有多一個已審的標籤」——影片庫（vidTableRow／vidCardHTML）的綠色
// 「剪輯完成」只是**階段**顏色（剪完＝已完成，跟已上片共用同一個綠色），
// 不代表審過了；旁邊另外掛一顆獨立的「已審」小標籤，字跟月排程那邊的
// 「審核完成」不是同一套，而且沒過審的列乾脆什麼都不顯示，看起來忽有忽無。
//
// 改法：影片庫也用 v255 那顆 reviewStatusPill()，字跟月排程、當日影片清單
// 一致（審核完成／未審核／退回），而且不跟著上片日過期（影片庫是常駐清單）。
const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
src = src.replace(/^let /gm, "").replace(/^const /gm, "");
const el = () => ({ value:"", innerHTML:"", textContent:"", className:"", style:{}, checked:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){}, appendChild(){}, querySelector(){return null;}, querySelectorAll(){return [];},
  getAttribute(){return null;}, setAttribute(){}, closest(){return null;}, getBoundingClientRect(){return {top:0,left:0,bottom:0,right:0};} });
const store={};
global.localStorage = { getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };
global.document = { getElementById:()=>el(), addEventListener(){}, createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null, querySelectorAll:()=>[] };
global.window = { addEventListener(){}, innerWidth:390, innerHeight:800, scrollY:0, scrollTo(){}, DB:null, location:{reload(){}} };
global.requestAnimationFrame=(f)=>f();
global.navigator = { onLine:true };
global.confirm = ()=>true; global.prompt = ()=>null;
eval(src);

const T0=todayTW();
const future=(d=>{ const t=new Date(d+"T00:00:00"); t.setDate(t.getDate()+3); return t.toISOString().slice(0,10); })(T0);
const past=(d=>{ const t=new Date(d+"T00:00:00"); t.setDate(t.getDate()-3); return t.toISOString().slice(0,10); })(T0);

STATE = { users:[], settings:{dailyTarget:4,videoTags:[],sources:["srcA"],postPlatforms:[],
  intlAccounts:[],shopeeAccounts:[],msAccounts:[],exchangeRates:{}},
  schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };

const V=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"片"+id,stage:"已完成",
  editor:"季欣",claimedBy:"季欣",assignedTo:"",finishedAt:T0,publishedLink:"",driveFolder:"",
  locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① 影片庫列表：綠色「剪輯完成」旁邊一定看得出審過了沒 ══════════
{ const approved=V("A",{reviewStatus:"通過"});
  const r=vidTableRow(approved);
  ok("**真的審過的片，寫「審核完成」**", r.includes("審核完成"), r); }
{ const unreviewed=V("B",{reviewStatus:""});   // 剪完但還沒審
  const r=vidTableRow(unreviewed);
  ok("**剪完但還沒審的片，清楚寫「未審核」（不是什麼都不顯示）**", r.includes("未審核"), r); }
{ const rejected=V("C",{reviewStatus:"退回"});
  const r=vidTableRow(rejected);
  ok("**被退回的片，寫「退回」**", r.includes("退回"), r); }

// ══════════ ② 影片庫不跟著上片日過期（跟月排程表不一樣，這裡是常駐清單）══════════
{ const old=V("D",{reviewStatus:"",scheduledDate:past});
  const r=vidTableRow(old);
  ok("**就算上片日已經過了，影片庫照樣顯示未審核（不會像排程表那樣自動消失）**",
     r.includes("未審核"), r); }

// ══════════ ③ 圖片模式（vidCardHTML）也要看得出來，不是只有列表模式有 ══════════
{ const unreviewed=V("E",{reviewStatus:""});
  const c=vidCardHTML(unreviewed);
  ok("**圖片模式的卡片也顯示「未審核」**", c.includes("未審核"), c); }
{ const approved=V("F",{reviewStatus:"通過"});
  const c=vidCardHTML(approved);
  ok("**圖片模式的卡片也顯示「審核完成」**", c.includes("審核完成"), c); }

// ══════════ ④ 月排程、當日影片清單那邊的「上片日過後自動消失」規矩沒有被動到 ══════════
{ const old=V("G",{reviewStatus:"通過",scheduledDate:past});
  ok("月排程表（有過期規矩）上片日過後照舊消失，沒有被這次改動動到",
     reviewStatusPill(old)==="");
  ok("但同一支片在影片庫（noExpiry）照舊看得到審核完成",
     reviewStatusPill(old,{noExpiry:true}).includes("審核完成")); }

// ══════════ ⑤ 老闆說明：「泓儒主要在分辨哪些快要上片了可是還沒審」——
//    影片庫也要看得到急件（calWarnPill，月排程表本來就有的「還沒審」／
//    「過期還沒審」） ══════════
const tomorrow=(()=>{ const t=new Date(T0+"T00:00:00"); t.setDate(t.getDate()+1); return t.toISOString().slice(0,10); })();
const farFuture=(()=>{ const t=new Date(T0+"T00:00:00"); t.setDate(t.getDate()+10); return t.toISOString().slice(0,10); })();
{ const urgent=V("H",{reviewStatus:"",scheduledDate:tomorrow});
  const r=vidTableRow(urgent);
  ok("**快上片了還沒審，影片庫列表看得到「還沒審」的急件標記**", r.includes("還沒審"), r); }
{ const overdue=V("I",{reviewStatus:"",scheduledDate:past});
  const r=vidTableRow(overdue);
  ok("**已經過了上片日還沒審，寫「過期還沒審」**", r.includes("過期還沒審"), r); }
{ const notUrgent=V("J",{reviewStatus:"",scheduledDate:farFuture});   // 還早，不急
  const r=vidTableRow(notUrgent);
  ok("離上片日還早的，不冒出急件標記（只有「未審核」那顆平常的燈）",
     !r.includes("還沒審</span>") && r.includes("未審核"), r); }
{ const urgent=V("K",{reviewStatus:"",scheduledDate:past});
  const c=vidCardHTML(urgent);
  ok("圖片模式也看得到急件標記", c.includes("過期還沒審"), c); }

console.log(`\nv258（影片庫的審核狀態字跟月排程一致，不會忽有忽無；也看得到快上片還沒審的急件）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
