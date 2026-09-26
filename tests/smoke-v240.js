// v240：「大流量影片」分頁整個拿掉，不管誰都選不到。
//
// 老闆看著「大流量影片」那一頁的截圖說：「把這一頁的標題移除不要讓人家選擇，
// 因為這個頁面已經跟影片成效重複了」。
//
// 這不是改名、也不是刪掉整個功能：
//   ① 導覽列不會再有「大流量影片」這個按鈕，不管誰的權限表怎麼勾。
//   ② 「df」這個權限鍵留著，但改成專管「影片成效 → 影片排行 → 未建檔那幾筆」
//      右邊的「補登到資料庫」按鈕（跟大流是同一批人，但不是建進大流——見
//      app.js 裡 v206 那段老闆原話）。
//   ③ 底層的 viewVideosDF()／STATE.videosDF 資料分類完全沒動——片還在、
//      二創還能做，只是沒有分頁點得進去了（可回頭的改法，不是刪資料）。
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
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,260));} }

function reset(users){
  VIEW_AS=null; BRAND=""; viewEl.innerHTML=""; modalHTML="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:users||[], settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],
      intlAccounts:[],shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };

// ══════════ ① 「大流量影片」分頁從 PERMS 拿掉了，不是換個位置藏起來 ══════════
{ ok("**PERMS.df 沒有 tab 這個鍵了**（沒有 tab，myTabs() 就不會補這個分頁）",
     !PERMS.df.tab, PERMS.df); }

// ══════════ ② 不管給誰勾「df」，導覽列都不會有這個分頁 ══════════
{ reset([
    {name:"管理員",role:"boss"},
    {name:"Regina",role:"manager",perms:["df"]},
    {name:"小葵",role:"editor",perms:["df"]},
  ]);
  as("管理員","boss");
  ok("**管理員（最高權限）也選不到「大流量影片」**", !myTabs().some(t=>t[0]==="videosDF"), myTabs());
  as("Regina","manager");
  ok("**手動把「df」勾給經理人，還是選不到**（分頁已經整個拿掉，不是權限沒開）",
     hasPerm("df") && !myTabs().some(t=>t[0]==="videosDF"), {hasDf:hasPerm("df"), tabs:myTabs()});
  as("小葵","editor");
  ok("**剪輯也一樣**", hasPerm("df") && !myTabs().some(t=>t[0]==="videosDF")); }

// ══════════ ③ 「df」權限鍵沒有整個刪掉——它還管著「補登到資料庫」那顆按鈕 ══════════
{ reset([{name:"小葵",role:"editor",perms:["df"]}]);
  as("小葵","editor");
  ok("**勾了「df」，補登到資料庫的權限函式還是通的**（canAddOldVideo）", canAddOldVideo());
  reset([{name:"小葵",role:"editor",perms:[]}]);
  as("小葵","editor");
  ok("**沒勾「df」，補登到資料庫就不給**", !canAddOldVideo()); }

// ══════════ ④ v208 命名規矩：權限名要跟畫面上看得到的字一模一樣 ══════════
{ ok("**PERMS.df.label 是「補登到資料庫」**（跟按鈕上的字一致，不是分頁名了）",
     PERMS.df.label==="補登到資料庫", PERMS.df.label);
  ok("**app.js 裡「補登到資料庫」那顆按鈕真的存在**（不是叫一個查無此按鈕的名字）",
     new RegExp(">"+PERMS.df.label+"<").test(APP)); }

// ══════════ ⑤ 這是拿掉「選項」，不是拿掉「功能」——底層頁面／資料還在 ══════════
{ reset([]);
  ok("**viewVideosDF() 這個函式還在，沒有被整支刪掉**（可回頭的改法）",
     typeof viewVideosDF==="function");
  ok("**TAB_DEPS 也把這一條拿掉了**（沒有分頁就不用再登記重繪相依，不然量不出來會被判定空轉）",
     !("videosDF" in TAB_DEPS), Object.keys(TAB_DEPS)); }

console.log(`\nv240（「大流量影片」分頁整個拿掉，df 權限改管「補登到資料庫」）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
