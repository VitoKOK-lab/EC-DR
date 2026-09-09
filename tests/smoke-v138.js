// v138（v175 改寫）：「選品行銷」這個職位本身。
//
// 這支測試原本釘的是「選品配對工作台」整套流程（建商品、送審、核准、退回…）。
// v175 把那整套拿掉了（老闆要重新設計），所以那些段落跟著刪掉 ——
// 測一個不存在的功能只會讓下一個人以為它還在。
//
// **留下來的是跟工作台無關、而且真的出過事的那一段**：
// 新增 pick 這個職位那次只顧著加 ROLE_LABEL／ROLE_TABS，app.js 裡另外還有幾處
// 手動列出「哪些職位」的陣列（登入頁分組、儀表板員工視角、指派交辦名單）沒跟著補，
// 結果選品行銷的人登入頁按鈕整個不見、管理員也選不到他們做員工視角預覽。
// 這條路跟工作台在不在完全無關，以後再加職位漏了哪一處，這支測試一樣會紅。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,isConnected:true,scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
// showModal 是用 getElementById("modalConfirm").onclick 掛確認鍵的，每次都回新元素的話 handler 會掉在地上
const confirmBtn=el();
async function MODAL_CONFIRM(){ if(typeof confirmBtn.onclick==="function") return await confirmBtn.onclick(); }
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(id==="modalConfirm") return confirmBtn;
    const e=el(); if(fields[id]!=null) e.value=fields[id];
    if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let writes=[], toasts=[], errToasts=[];
toast=(m,isErr)=>{ toasts.push(String(m)); if(isErr) errToasts.push(String(m)); };

// 假的 window.DB：把寫入記下來，並且真的把資料寫回 STATE（模擬 onSnapshot 同步回來），
// 這樣才能連續呼叫（建立→送審→核准）並驗證下一步看到的是上一步寫入後的狀態。
function applyWrite(kind,c,id,data){
  const arr=STATE[c]||(STATE[c]=[]);
  if(kind==="set"){ const i=arr.findIndex(x=>x.id===id); const rec=Object.assign({id},data);
    if(i>=0) arr[i]=rec; else arr.push(rec); }
  else if(kind==="update"){ const i=arr.findIndex(x=>x.id===id); if(i>=0) Object.assign(arr[i],data); }
  else if(kind==="del"){ const i=arr.findIndex(x=>x.id===id); if(i>=0) arr.splice(i,1); }
}
function reset(videos){
  modalHTML=""; viewEl.innerHTML=""; writes=[]; toasts=[]; errToasts=[]; fields={};
  global.window.DB={
    set:async(c,id,o)=>{ writes.push(["set",c,id,o]); applyWrite("set",c,id,o); },
    update:async(c,id,p)=>{ writes.push(["update",c,id,p]); applyWrite("update",c,id,p); },
    del:async(c,id)=>{ writes.push(["del",c,id]); applyWrite("del",c,id); },
    scheduleSet:async()=>{}, setSettings:async()=>{} };
  const raw={ users:[{name:"Amy",role:"pick"}, {name:"Regina",role:"manager"}, {name:"管理員",role:"boss"},
                     {name:"小葵",role:"editor"}, {name:"阿華",role:"mkt"}],
    settings:{dailyTarget:4,videoTags:["新片","舊片"],sources:["自製"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[], products:[], matches:[] };
  LAST_RAW=raw; STATE=decorate(raw);
  CUR_TAB=null; VIEW_AS=null; BRAND="";
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,200));} }
async function throws(fn){ try{ await fn(); return null; }catch(e){ return e.message; } }

// 一支「已完成」的影片（拍過、上片流程算完成）與一支「僅有腳本」的影片
const doneVid=(id,o)=>Object.assign({id,code:id,name:"完成片"+id,rawName:"毛片"+id,videoCopy:"文案"+id,
  rawLink:"http://raw/"+id,stage:"已完成",published:true,editor:"",claimedBy:"",assignedTo:"",
  scheduledDate:null,finishedAt:"2026-06-01T09:00:00",publishedLink:"",driveFolder:"http://drive/"+id,
  reviewStatus:"",locale:"",channel:"",origLang:"",cover:"",remakes:[],tags:[],products:[],
  usageHistory:[],metrics:[]}, o||{});
const scriptVid=(id,o)=>Object.assign({}, doneVid(id,o), {id,code:id,name:"腳本片"+id,rawName:"腳本片"+id,
  rawLink:"",stage:"待處理",published:false,finishedAt:"",driveFolder:""}, o||{});

(async()=>{

// ══════════ ① 職位本身還在、標籤正確 ══════════
{ reset();
  ok("選品行銷職位存在", ROLE_LABEL.pick==="選品行銷");
  ok("選品行銷是不剪片職位", NO_EDIT_ROLES.includes("pick"));
  ok("選品行銷會打卡／進團隊看板（STAFF_ROLES）", STAFF_ROLES.includes("pick"));
  ok("原本的職位沒被動到", ROLE_LABEL.mkt==="行銷" && ROLE_LABEL.boss==="管理員" && ROLE_LABEL.manager==="經理人"); }
{ reset(); as("Amy","pick");
  const tabs=myTabs().map(t=>t[0]);
  // v175：工作台拿掉之後，選品行銷的畫面就跟其他不剪片的職位一樣
  // v178：最前面多了「溝通」
  ok("選品行銷分頁＝溝通／本日工作／團隊看板", JSON.stringify(tabs)===JSON.stringify(["chat","work","team"]), tabs); }
{ reset(); ok("**選品配對那一頁真的沒有了**（不是只有藏起來）",
    !["boss","manager","pick","editor","cs"].some(r=>{ as("X",r); return myTabs().some(t=>t[0]==="match"); })); }
// 只看真正的程式碼，不看註解 —— 移除的說明裡本來就會提到那些名字
{ const CODE=APP.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n");
  ok("工作台的程式碼也整個移除了，不留死碼",
     !/function viewMatch\(/.test(CODE) && !/function matchWorkbenchHTML\(/.test(CODE)
     && !/function submitMatch\(/.test(CODE) && !/newMatchRecord\s*\(/.test(CODE),
     (CODE.match(/function (viewMatch|matchWorkbenchHTML|submitMatch)\(/g)||[]));
  ok("路由表裡也沒有 match 了", !/match:viewMatch/.test(CODE));
  ok("products／matches 的 API 路由也拿掉了",
     !/head==="products"/.test(CODE) && !/head==="matches"/.test(CODE)); }


// ══════════ ⑬ 新職位不能在既有的「職位清單」畫面裡悄悄消失 ══════════
// 教訓：新增 pick 職位那次只顧著加 ROLE_LABEL／ROLE_TABS，app.js 裡另外還有幾處
// 手動列出「哪些職位」的陣列（登入頁分組、儀表板員工視角、指派交辦）沒有跟著補，
// 結果選品行銷的人登入頁按鈕整個不見、管理員也選不到他們做員工視角預覽。
// 這裡把「加一個新職位」的檢查釘死，以後再加職位漏了哪一處，這支測試會紅。
{ reset([]); as("Amy","pick");
  const g = staffOptGroups(STAFF_ROLES.concat("manager"));
  ok("staffOptGroups 有選品行銷的分組標籤", g.includes('label="選品行銷"'));
  ok("選品行銷的人出現在該分組底下", g.includes(">Amy<")); }
{ reset([]); as("Amy","pick"); as("管理員","boss");
  const h = dashViewAsCard();
  ok("儀表板「員工視角」選得到選品行銷（這次回報的原始 bug）", h.includes('label="選品行銷"') && h.includes(">Amy<")); }
// v174：交辦卡的名單會把「自己」拿掉（自己派給自己是假的一筆），
// 所以這裡要用**別人**的身分來看，才問得到「選品行銷勾不勾得到」這件事。
{ reset([]); as("管理員","boss");
  const h = dashAssignTaskCard();
  // v162：交辦對象改成勾選清單。要求不變 —— 選品行銷必須勾得到。
  ok("「指派交辦給員工」勾得到選品行銷（選品行銷跟員工一樣走交辦流程）",
     h.includes(">選品行銷</div>") && /<input type="checkbox" class="asg_p" value="Amy"/.test(h), h.slice(0,300)); }
{ reset([]); as("Amy","pick");
  ok("自己不會出現在自己的交辦名單上（自己派給自己是假的一筆）",
     !/<input type="checkbox" class="asg_p" value="Amy"/.test(dashAssignTaskCard())); }
{ ok("STAFF_GROUPS（登入頁分組）含 pick，選品行銷的登入按鈕才畫得出來",
     STAFF_GROUPS.some(([,,,roles])=>roles.includes("pick"))); }
{ ok("noticeTargetRoles(\"__twmake__\") 含 pick，HR 發整區通知才發得到選品行銷",
     noticeTargetRoles("__twmake__").includes("pick")); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
