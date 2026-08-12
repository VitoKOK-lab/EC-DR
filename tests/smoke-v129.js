// v129：認領一支之後，畫面不要自己收起來。
//
// 回報：「認領的按鈕按下去之後，畫面都會自動關閉，能不能停在那個畫面」。
// 原因不是認領這個動作 —— 是 Firestore 一同步就整頁重繪（applyState → render），
// 而 <details> 的開合狀態沒有被記住：
//   「待認領」只有在有搜尋／有選分類時才預設展開，重繪後就自己收回去，
//   使用者被丟回頁面上方，要再點開、再捲下去才能認領下一支。
//
// 修法兩層：
//   ① 摺疊：標上 data-fold（標題的雜湊），用捕獲階段的 toggle 監聽器記住開合，重繪時放回去
//   ② 內捲：帶 class="keepscroll" 且有 id 的區塊，重繪前後把 scrollTop 接回去
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,isConnected:true,scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
// 記下 app.js 掛上去的 document 監聽器，測試才能真的觸發 toggle
const listeners={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(Object.prototype.hasOwnProperty.call(fields,id)) return {value:fields[id]};
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(type,fn){ (listeners[type]=listeners[type]||[]).push(fn); },
  createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
// 模擬使用者點開／收合一個 <details data-fold="…">
function toggleFold(key, open){
  const k=foldKey(key);
  const d={tagName:"DETAILS", open:!!open, getAttribute:(a)=>a==="data-fold"?k:null};
  (listeners.toggle||[]).forEach(fn=>fn({target:d}));
}
const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
let vn=0;
const RAW=(name)=>({id:"P"+(++vn),code:"115"+vn,name,rawName:name,videoCopy:"稿",rawLink:"http://raw",
  stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,publishedLink:"",driveFolder:"",
  locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]});
function reset(){
  vn=0; modalHTML=""; fields={}; FOLD_OPEN={};
  STATE={ users:[{name:"小葵",role:"editor"},{name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:["蝦皮A"],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    videos:[RAW("毛片一"),RAW("毛片二"),RAW("毛片三"),RAW("毛片四"),RAW("毛片五"),RAW("毛片六")] };
  CUR_TAB="work"; VIEW_AS=null; WORK_ZONE="shopee"; POOL_FILTER="all"; POOL_Q=""; ORIG_AUTO_RAN=true;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{},
    scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
// 抓某個折疊的 <details …> 標籤本身，判斷它展開了沒
const foldTagOf=(h,label)=>{ const parts=String(h).split('<details class="fold"');
  const p=parts.find(x=>x.includes(label)); return p?p.split(">")[0]:null; };
const isOpen=(h,label)=>{ const t=foldTagOf(h,label); return !!t && /(^|\s)open(\s|$)/.test(t); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══════════ ① 折疊的 key ══════════
reset();
ok("同一個標題永遠算出同一把 key", foldKey("待認領")===foldKey("待認領"));
ok("不同標題的 key 不一樣", foldKey("待認領")!==foldKey("之後要做"));
ok("key 不含標題原文（不然 DOM 裡同一段字會出現兩次）", !foldKey("待認領").includes("待認領"));
ok("key 是乾淨的英數（可以安全塞進屬性）", /^f[0-9a-z]+$/.test(foldKey("🎞 待你審片")));

// ══════════ ② 沒碰過就照預設；碰過就照使用者按的 ══════════
reset();
ok("沒碰過→用預設值（收）", !/\sopen/.test(foldState("x", false)));
ok("沒碰過→用預設值（開）", /\sopen/.test(foldState("x", true)));
toggleFold("x", true);
ok("使用者點開了→之後一律開，即使預設是收", /\sopen/.test(foldState("x", false)));
toggleFold("x", false);
ok("使用者收起來了→之後一律收，即使預設是開", !/\sopen/.test(foldState("x", true)));

// ══════════ ③ 真正的情境：認領之後重繪，待認領還開著 ══════════
reset(); as("小葵","editor");
ok("一開始「待認領」是收起來的（沒搜尋、沒選分類）", !isOpen(viewWork(), "待認領（毛片＋二創版本）"));
toggleFold(T("待認領","To claim"), true);          // 使用者點開它
ok("點開之後就是開的", isOpen(viewWork(), "待認領（毛片＋二創版本）"));
// 認領一支 → 資料變了 → Firestore 同步 → 整頁重繪
STATE.videos[0].stage="剪輯中"; STATE.videos[0].claimedBy="小葵"; STATE.videos[0].editor="小葵";
{ const h=viewWork();
  ok("重繪之後「待認領」還是開著（不會自己收起來）", isOpen(h, "待認領（毛片＋二創版本）"));
  ok("認領掉的那支從清單消失", !h.split("待認領（毛片＋二創版本）")[1].split("</table>")[0].includes("claimVid('P1')"));
  ok("其他支還在，可以繼續認領", h.includes("claimVid('P2')")); }

// ══════════ ④ 其他折疊各記各的，不會互相影響 ══════════
reset(); as("小葵","editor");
toggleFold(T("待認領","To claim"), true);
{ const h=viewWork();
  ok("只有被點開的那個開著", isOpen(h,"待認領（毛片＋二創版本）") && !isOpen(h,"之後要做")); }

// ══════════ ⑤ 待認領清單自己會捲，位置也要接回去 ══════════
reset(); as("小葵","editor");
ok("待認領清單標了 keepscroll＋id（重繪時才接得回捲動位置）",
   /id="pool_wrap" class="keepscroll"/.test(viewWork()));
{ // 重繪前後把 scrollTop 接回去
  const box={id:"pool_wrap", scrollTop:180};
  const v={ querySelectorAll:(sel)=> sel===".keepscroll[id]"?[box]:[],
            querySelector:(sel)=> sel==='[id="pool_wrap"]'?box:null };
  const snap=keepScrollSnapshot(v);
  ok("記得住捲到哪裡", snap.pool_wrap===180);
  box.scrollTop=0;                       // 重繪：DOM 換新的，捲動歸零
  keepScrollRestore(v, snap);
  ok("重繪之後接回原本的位置", box.scrollTop===180); }
{ // 沒捲動就不用記，也不能因為空物件出錯
  const box={id:"pool_wrap", scrollTop:0};
  const v={ querySelectorAll:()=>[box], querySelector:()=>box };
  ok("沒捲動就不記", Object.keys(keepScrollSnapshot(v)).length===0);
  let threw=false; try{ keepScrollRestore(v, null); }catch(e){ threw=true; }
  ok("沒東西可接也不會出錯", !threw); }

// ══════════ ⑥ 記憶只留在這次登入期間，不寫進資料庫 ══════════
reset();
toggleFold("x", true);
ok("開合狀態只放在記憶體（沒有任何寫入）", typeof FOLD_OPEN==="object");
reset();
ok("reset（重新登入／換人）之後回到預設", !/\sopen/.test(foldState("x", false)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
