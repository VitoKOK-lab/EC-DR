// v125：個別開放手機打卡。
//
// 原本是一個全公司的開關（settings.pcOnly）：打開＝一般員工完全不能用手機登入，
// 而登入就是打卡，所以等於不能用手機打卡。外務、跑倉庫、外派的同仁被逼著回公司。
// 這支測新加的「逐一勾選」名單：勾到的人不受限，而且他們用手機打的卡
// 不再被出勤報表標成異常（不然人資每天都會看到一整排紅字）。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, toasts=[], alerts=[], checked={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(Object.prototype.hasOwnProperty.call(fields,id)) return {value:fields[id],checked:!!fields[id]};
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,
  // 儲存設定時要撈出勾了哪幾個人
  querySelectorAll:(sel)=> sel===".mba_u:checked" ? (checked.mba_u||[]).map(v=>({value:v})) : []};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f();
let UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";      // 預設桌機
// Node 22 自己有一個唯讀的 navigator，直接指派會被吃掉（測試會假綠），要用 defineProperty 蓋掉
Object.defineProperty(globalThis, "navigator", {
  configurable:true, value:{ onLine:true, get userAgent(){ return UA; } } });
global.confirm=()=>true; global.prompt=()=>null;
global.alert=(m)=>{ alerts.push(String(m)); };
eval(src);
toast=(m)=>{ toasts.push(String(m)); };
const PHONE="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148";
const PC="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

function reset(allow){
  modalHTML=""; fields={}; toasts=[]; alerts=[]; checked={}; UA=PC;
  STATE={ users:[{name:"江瑩",role:"mkt"},{name:"陳鋒",role:"ship"},
                 {name:"小葵",role:"editor"},{name:"Anna",role:"intl"},
                 {name:"HR小姐",role:"hr"},{name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00",
      pcOnly:true, mobileAllow: allow===undefined?undefined:allow},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  CUR_TAB=null; VIEW_AS=null; ORIG_AUTO_RAN=true;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{},
    scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══════════ ① 沒設名單＝維持原本的行為 ══════════
reset();
ok("沒設名單時清單是空的", mobileAllowList().length===0);
UA=PC;
ok("桌機一律不擋", !blockedOnMobile("mkt","江瑩") && !blockedOnMobile("editor","小葵"));
UA=PHONE;
ok("手機：一般員工照舊被擋", blockedOnMobile("mkt","江瑩") && blockedOnMobile("ship","陳鋒") && blockedOnMobile("editor","小葵"));
ok("手機：主管照舊不受限", !blockedOnMobile("manager","Regina") && !blockedOnMobile("hr","HR小姐") && !blockedOnMobile("boss","管理員"));

// ══════════ ② 勾了名單：只有名單上的人放行 ══════════
reset(["江瑩","陳鋒"]);
UA=PHONE;
ok("江瑩可以用手機", !blockedOnMobile("mkt","江瑩"));
ok("陳鋒可以用手機", !blockedOnMobile("ship","陳鋒"));
ok("沒勾到的還是被擋", blockedOnMobile("editor","小葵") && blockedOnMobile("intl","Anna"));
ok("mobileAllowed 直接查也對", mobileAllowed("江瑩") && mobileAllowed("陳鋒") && !mobileAllowed("小葵"));
ok("空名字不會誤放行", !mobileAllowed("") && !mobileAllowed(null) && !mobileAllowed(undefined));
ok("前後空白照樣認得出來", mobileAllowed(" 江瑩 "));
UA=PC;
ok("放行的人用桌機當然也可以", !blockedOnMobile("mkt","江瑩"));

// ══════════ ③ 全公司開關關掉＝誰都不擋（名單無關） ══════════
reset([]);
STATE.settings.pcOnly=false; UA=PHONE;
ok("關掉「只能用電腦」之後誰都不擋", !blockedOnMobile("editor","小葵") && !blockedOnMobile("mkt","江瑩"));

// ══════════ ④ 登入真的被擋／真的放行 ══════════
reset(["江瑩"]);
UA=PHONE;
(async()=>{
  await loginAs({name:"小葵",role:"editor"});
  ok("沒放行的人在手機上按登入會被擋下來", alerts.some(a=>a.includes("公司電腦")) && localStorage.getItem("ecdr_user")!=="小葵");
  alerts=[];
  await loginAs({name:"江瑩",role:"mkt"});
  ok("放行的人不會看到那則擋下來的訊息", !alerts.some(a=>a.includes("公司電腦")));

  // ══════════ ⑤ 出勤報表：放行的人不再被標成異常 ══════════
  reset(["江瑩"]); as("HR小姐","hr");
  const sh=(n,mob)=>({id:shiftId(n,today),user:n,date:today,clockIn:today+"T09:00:00",inMobile:mob});
  STATE.shifts={};
  // 江瑩已放行、陳鋒沒放行（這一輪只勾了江瑩）—— 兩人都用手機打卡
  [["江瑩",true],["陳鋒",true],["小葵",false]].forEach(([n,mob])=>{ STATE.shifts[shiftId(n,today)]=sh(n,mob); });
  const h=viewAttend();
  ok("紅字只算沒放行的那一個", h.includes("用手機打卡 1") && !h.includes("用手機打卡 2"));
  ok("放行的人標成「手機（已開放）」", h.includes("手機（已開放）"));
  ok("沒放行的人照舊標紅字", h.includes("用手機打的"));

  // ══════════ ⑥ 設定畫面：勾選清單在、勾了的是打勾狀態 ══════════
  reset(["江瑩","陳鋒"]); as("管理員","boss");
  { const s=viewSettings();
    ok("設定裡有每個人的勾選框", s.includes('class="mba_u" value="江瑩"') && s.includes('class="mba_u" value="陳鋒"')
       && s.includes('class="mba_u" value="小葵"'));
    ok("已經放行的預設勾起來", /value="江瑩" checked/.test(s) && /value="陳鋒" checked/.test(s));
    ok("沒放行的沒有勾", /value="小葵"(?! checked)/.test(s));
    ok("管理層不列（他們本來就不受限）", !s.includes('class="mba_u" value="Regina"') && !s.includes('class="mba_u" value="管理員"')); }

  // ══════════ ⑦ 儲存設定：勾到的寫進去、取消勾的移除 ══════════
  reset(["江瑩","陳鋒"]); as("管理員","boss");
  { let saved=null;
    global.window.DB.setSettings=async(o)=>{ saved=o; };
    SET_TAB="attend"; fields={set_pconly:true}; checked={mba_u:["江瑩","陳鋒"]};
    await saveSettings();
    ok("儲存時寫進勾到的兩位", saved && JSON.stringify(saved.mobileAllow)===JSON.stringify(["江瑩","陳鋒"]));
    saved=null; checked={mba_u:["江瑩"]};
    await saveSettings();
    ok("取消勾選就從名單移除", saved && JSON.stringify(saved.mobileAllow)===JSON.stringify(["江瑩"]));
    saved=null; checked={mba_u:[]};
    await saveSettings();
    ok("全部取消＝空名單（不是留著舊的）", saved && Array.isArray(saved.mobileAllow) && saved.mobileAllow.length===0); }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
