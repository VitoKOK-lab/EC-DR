// v244：canAssignShown() 只認舊旗標 u.canAssign，沒看 hasPerm("assign")——
// 卡片「看得不看得到」跟「按不按得動」兩道門走的是不同的權限來源，各寫一份、
// 其中一份沒跟著 v207（逐人勾選的權限表）一起更新。
//
// 老闆回報：「巧芸指派某剪輯去剪」結果那支片還是掉進待認領池，等於沒指派。
// 追出來：巧芸在「設定→權限」勾了「assign」之後，canAssignWork()（真正擋
// 寫入的那道門，assignFootage() 用這個）認得出來、理論上按得下去；但
// canAssignShown()（決定「指派毛片給員工」那張卡要不要畫在她的「上班計畫」
// 上）只認 u.canAssign 這個舊欄位，現代的 perms 陣列它完全沒看——卡片根本
// 不會出現在她的畫面上，她只好改用「新增影片」，而那個表單沒有「指定剪輯」
// 這一格，新片自然生出來就是沒人認領的，跟她本來想做的事完全對不上。
//
// 改法：canAssignShown() 改成直接委派給 hasPerm("assign", VIEW_AS ||
// currentUser())——跟 canAssignWork() 看的是同一條權限來源，不會再各吹各的號。
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

const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,10);
todayTW=()=>FROZEN; ydayTW=()=>FROZEN; refreshToday();

function reset(){
  STATE = {
    users:[ {name:"巧芸",role:"editor",perms:["assign"]},
            {name:"舊旗標小美",role:"editor",canAssign:true},
            {name:"小葵",role:"editor",perms:[]},
            {name:"Regina",role:"manager",perms:["assign"]},
            {name:"沒勾的主管",role:"manager",perms:[]} ],
    settings:{ dailyTarget:4, videoTags:[], sources:["srcA"], postPlatforms:[],
      intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[],
  };
  VIEW_AS=null;
}
const as=(name,role)=>{ localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① 用現代權限表勾了「assign」的人，卡片看得到（這是這次要修的） ══════════
{ reset(); as("巧芸","editor");
  ok("**canAssignWork()（真正的寫入門）本來就通**", canAssignWork()===true);
  ok("**canAssignShown()（卡片要不要畫出來）現在也通了**", canAssignShown()===true); }

// ══════════ ② 舊旗標 u.canAssign 的人，照舊看得到（相容，沒有因為改寫法就斷掉） ══════════
{ reset(); as("舊旗標小美","editor");
  ok("**舊旗標 canAssign:true 照舊有效**", canAssignShown()===true && canAssignWork()===true); }

// ══════════ ③ 沒勾任何一種的人，兩道門都是關的、一致 ══════════
{ reset(); as("小葵","editor");
  ok("**沒權限的人兩道門都關著**", canAssignShown()===false && canAssignWork()===false); }

// ══════════ ④ manager 職位：有勾才給，不是職位自動帶（v207 的規矩，兩道門都一致） ══════════
{ reset(); as("Regina","manager");
  ok("**Regina 勾了 assign，兩道門都通**", canAssignShown()===true && canAssignWork()===true); }
{ reset(); as("沒勾的主管","manager");
  ok("**manager 職位但沒勾 assign，兩道門現在都是關的**（舊版 canAssignShown 會因為職位是 manager 就直接放行，跟 canAssignWork 對不起來——這正是這次要收掉的例外）",
     canAssignShown()===false && canAssignWork()===false); }

// ══════════ ⑤ 員工視角預覽：只看被預覽那個人，不是看自己 ══════════
{ reset(); as("管理員","boss"); VIEW_AS="巧芸";
  ok("**預覽巧芸（有勾 assign）時，卡片看得到**", canAssignShown()===true); }
{ reset(); as("管理員","boss"); VIEW_AS="小葵";
  ok("**預覽小葵（沒勾）時，卡片看不到**", canAssignShown()===false); }
{ reset(); as("管理員","boss"); VIEW_AS="查無此人";
  ok("**預覽「名單裡沒有的人」不會借到管理員權限**（v190 那條舊漏洞，這次重寫也不能破）",
     canAssignShown()===false); }
{ VIEW_AS=null; }

// ══════════ ⑥ 管理員本人（ADMIN_NAME）一律通，不用勾 ══════════
{ reset(); as("管理員","boss");
  ok("**管理員本人兩道門都通**（hasPerm 內建的 ADMIN_NAME 例外）",
     canAssignShown()===true && canAssignWork()===true); }

// ══════════ ⑦ 整合測試：巧芸的「上班計畫」真的畫得出「指派毛片給員工」那張卡 ══════════
{ reset(); as("巧芸","editor");
  const h=workAssignFold();
  ok("**巧芸的畫面上真的看得到「指派毛片給員工」卡了**（不是只有函式回傳 true，畫面也要真的有）",
     h.includes("指派毛片給員工") && h.includes('id="afp_who"'), h.slice(0,120)); }
{ reset(); as("小葵","editor");
  ok("沒權限的人這張卡整個不會畫出來", workAssignFold()==="" ); }

console.log(`\nv244（canAssignShown 改認 hasPerm("assign")，跟 canAssignWork 同一條權限來源）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
