// v167：經理人（Regina）也要能多選交辦。
//
// 災情：老闆截圖問「Regina 怎麼沒有這樣可以多選指派」。
// 查出來的原因不是權限 —— dashAssignTaskCard 的權限本來就寫 ["boss","manager"] ——
// 而是**經理人根本沒有「儀表板」那一頁**（ROLE_TABS.manager 裡沒有 dashboard），
// 所以那張卡她永遠走不到，只能用流程中控每張員工卡裡的單人輸入框，一次派一個人。
//
// 兩件事一起做：① 流程中控最上面也放同一張卡 ② 經理人也給儀表板（排第一）。
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
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }
function as(who, role){ localStorage.setItem("ecdr_user",who); localStorage.setItem("ecdr_role",role); }
function reset(){
  VIEW_AS=null; BRAND=""; viewEl.innerHTML=""; modalHTML="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"Regina",role:"manager"},{name:"管理員",role:"boss"},
                     {name:"小葵",role:"editor"},{name:"泓儒",role:"editor"},{name:"小美",role:"cs"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
}

// ══════════ ① 經理人拿得到儀表板 ══════════
{ reset(); as("Regina","manager");
  const tabs=myTabs().map(t=>t[0]);
  ok("**經理人有儀表板了**", tabs.includes("dashboard"), tabs);
  ok("而且排第一（她的落地頁）", tabs[0]==="dashboard", tabs);
  ok("原本的分頁一個都沒少",
     ["flow","team","videos","videosDF","cal","match"].every(t=>tabs.includes(t)), tabs); }
{ reset(); as("小葵","editor");
  ok("剪輯沒有被順手加到儀表板", !myTabs().map(t=>t[0]).includes("dashboard"), myTabs().map(t=>t[0]));
  reset(); as("小美","cs");
  ok("員工也沒有", !myTabs().map(t=>t[0]).includes("dashboard")); }

// ══════════ ② 儀表板上她看得到什麼、看不到什麼 ══════════
{ reset(); as("Regina","manager");
  const h=viewDashboard();
  ok("看得到多選交辦卡", h.includes("指派交辦給員工") && /class="asg_p"/.test(h), h.slice(0,200));
  ok("勾得到剪輯", /value="小葵"/.test(h) && /value="泓儒"/.test(h));
  ok("**看不到「員工視角」**（那是主管專用的，不要順手給出去）",
     !h.includes("員工視角") && !/enterViewAs\(/.test(h), (h.match(/員工視角[^<]*/)||[])[0]);
  ok("看得到指派毛片（她本來就有這個權限）", /assignFootage\(\)/.test(h)); }
{ reset(); as("管理員","boss");
  const h=viewDashboard();
  ok("主管的儀表板仍然有員工視角（沒被改壞）", h.includes("員工視角") && /enterViewAs\(/.test(h)); }

// ══════════ ③ 流程中控最上面也有同一張卡 ══════════
{ reset(); as("Regina","manager");
  const h=viewFlow();
  ok("流程中控也看得到多選交辦卡", h.includes("指派交辦給員工") && /class="asg_p"/.test(h));
  // 「最上面」＝排在焦點列與其他卡片之前
  const iAsg=h.indexOf("指派交辦給員工");
  ok("**排在焦點列前面**（她整天在用的，不要每次都先捲過存量警示）",
     iAsg>=0 && iAsg < h.indexOf("focusbar"), {iAsg, focus:h.indexOf("focusbar")});
  ok("排在「團隊交辦＆回報」那一段前面", iAsg < h.indexOf("團隊交辦＆回報"));
  ok("排在待審清單前面", h.indexOf("待審") < 0 || iAsg < h.indexOf("待審")); }
{ reset(); as("小葵","editor");
  ok("剪輯根本沒有流程中控那一頁", !myTabs().map(t=>t[0]).includes("flow"));
  ok("——就算硬叫也不給那張卡", flowAssignCard()===""); }
// ⚠️ 這裡要預覽的是**另一個經理人**，不是員工。
//    VIEW_AS 開著的時候 currentRole() 回的是「被預覽那個人」的職位 ——
//    預覽員工的話，上面那道角色檢查就先擋掉了，驗不到 VIEW_AS 這道門
//    （突變測試把 `if(VIEW_AS) return ""` 拿掉是 0 紅，就是這樣抓到的）。
{ reset(); as("管理員","boss"); VIEW_AS="Regina";
  ok("（前提）預覽經理人時角色檢查是過的", ["boss","manager"].includes(currentRole()), currentRole());
  ok("**員工視角（唯讀預覽）底下不給交辦卡**", flowAssignCard()===""); VIEW_AS=null; }
{ reset(); as("Regina","manager"); VIEW_AS="小葵";
  ok("預覽員工時也不給（這道是角色檢查擋的）", flowAssignCard()===""); VIEW_AS=null; }

// 原本每張員工卡的單人交辦沒有被拿掉 —— 有人習慣那樣用
{ reset(); as("Regina","manager");
  const h=viewFlow();
  ok("每張員工卡的單人交辦還在", /flowAssign\(/.test(h) && h.includes("交辦 小葵 一件事")); }

// ══════════ ④ 兩頁都能用，而且是同一張卡（不是各寫一份）══════════
{ reset(); as("Regina","manager");
  const inFlow=viewFlow().includes("指派交辦給員工");
  const inDash=viewDashboard().includes("指派交辦給員工");
  ok("儀表板與流程中控都有（刻意重複，她在哪一頁都按得到）", inFlow && inDash);
  ok("兩邊都是呼叫同一支 dashAssignTaskCard",
     /function flowAssignCard[\s\S]{0,400}dashAssignTaskCard\(\)/.test(APP), "flowAssignCard 沒有共用同一張卡"); }

// ══════════ ⑤ 整頁不會炸 ══════════
{ reset(); as("Regina","manager");
  let bad=null;
  ["dashboard","flow","team","videos","videosDF","cal","match"].forEach(t=>{
    CUR_TAB=t; CAL_YM=null; try{ render(); }catch(e){ bad=t+": "+e.message; } });
  ok("經理人七個分頁都畫得出來", !bad, bad); }

console.log(`\nv167（經理人也能多選交辦・也給儀表板）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
