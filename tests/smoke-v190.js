// v190：小主管的「指派毛片」搬到看板
//
// 老闆回報：「鴻儒要分配影片給別人剪輯那個畫面我找不到哪裡可以選擇要指定給誰剪」
//
// 功能一直都在，問題是找不到 —— 正式資料實測，那張卡在「每日工作」往下 37%
// 的地方（整頁 157,497 字元），而且是**收起來的折疊**；Regina 的同一張卡在
// **看板**上，小主管當然去看板找。
//
// 這一版把它搬到看板最上面、預設打開、標題跟 Regina 那一張一字不差。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,open:false,
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
global.window={addEventListener(){},innerWidth:1400,innerHeight:900,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const T0=FROZEN;

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
function as(w,r){ localStorage.setItem("ecdr_user",w); localStorage.setItem("ecdr_role",r); }
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"毛片"+id,rawName:"毛片"+id,videoCopy:"文案",
  rawLink:"https://drive.google.com/drive/folders/RAW",cover:"",stage:"待處理",editor:"",claimedBy:"",
  assignedTo:"",scheduledDate:T0,publishTime:"15:00",finishedAt:"",publishedLink:"",
  driveFolder:"https://drive.google.com/drive/folders/FAM",productUrl:"",note:"",mainType:"",source:"官方IP",
  refLink:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",tags:[],products:[],
  usageHistory:[],metrics:[]},o||{});
function reset(vids, users){
  VIEW_AS=null; BRAND=""; AFP_Q=""; FOLD_OPEN={}; SHIFT_DATE=T0; TEAM_GROUP="all"; TEAM_Q="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}),
    loadShiftMonth:async()=>{} };
  const raw={ users: users||[{name:"泓儒",role:"editor",canAssign:true},
                             {name:"小葵",role:"editor"},{name:"阿明",role:"editor"},
                             {name:"Regina",role:"manager"},{name:"HR小姐",role:"hr"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:vids||[] };
  LAST_RAW=raw; STATE=decorate(raw);
}

// ══════════ ① 小主管在看板上找得到 ══════════
{ reset([ v_("F1"), v_("F2") ]); as("泓儒","editor");
  const b=viewBoard();
  ok("（前提）他是小主管、可以指派", isSubLead()===true && canAssignWork()===true);
  ok("**看板上有指派毛片這張卡**", /assignFootage\(\)/.test(b), b.slice(0,200));
  ok("**排在最上面**（不是滑到一半才看到）", b.indexOf("指派毛片給員工") < 300,
     b.indexOf("指派毛片給員工"));
  ok("**預設是打開的**（上看板就是為了派片，不該再點一下）", (()=>{
     const i=b.indexOf("指派毛片給員工");
     return b.slice(Math.max(0,i-300), i).includes(" open"); })(), b.slice(0,300));
  ok("**選得到要指派給誰**（老闆說「找不到哪裡可以選擇要指定給誰剪」）",
     /id="afp_who"/.test(b) && b.includes("小葵") && b.includes("阿明"),
     (b.match(/<option value="[^"]+">/g)||[]).slice(0,6));
  ok("毛片清單勾得到", /class="afp_vid"/.test(b));
  ok("v189 的搜尋欄也跟著過來了", /id="afp_q"/.test(b)); }

// ══════════ ② 標題跟 Regina 那一張一字不差 ══════════
// 兩個人講的是同一件事，名字不一樣只會讓人以為是兩個功能。
{ reset([ v_("F1") ]); as("泓儒","editor");
  const sub=viewBoard();
  as("Regina","manager");
  const mgr=viewBoard();
  ok("**兩邊的標題一樣**", sub.includes("指派毛片給員工") && mgr.includes("指派毛片給員工"));
  ok("舊的「指派毛片給同事」不再出現", !sub.includes("指派毛片給同事") && !mgr.includes("指派毛片給同事")); }

// ══════════ ③ 每日工作上不再有一份 ══════════
// 同一件事擺兩個地方，遲早變成「我在哪一頁指派過？」
{ reset([ v_("F1") ]); as("泓儒","editor");
  ok("**每日工作上沒有指派卡了**", !/assignFootage\(\)/.test(viewWork()), viewWork().slice(0,120));
  ok("而且整份程式裡只呼叫一次", (APP.match(/\$\{workAssignFold\(\)\}/g)||[]).length===1,
     (APP.match(/\$\{workAssignFold\(\)\}/g)||[]).length); }

// ══════════ ④ 一般同仁的看板照舊是純檢視 ══════════
// ⚠️ 這是這一版最容易弄壞的東西：看板本來一顆按鍵都沒有（v55／v66／v67／v70／v83
//    五支測試在釘）。多了一張會寫資料的卡，只有拿到指派權的人才畫得出來。
{ reset([ v_("F1") ]); as("小葵","editor");
  const b=viewBoard();
  ok("**一般剪輯的看板沒有指派卡**", !/assignFootage\(\)/.test(b));
  ok("**而且照舊一顆按鍵都沒有**", !b.includes("<button"), (b.match(/<button[^>]*>/)||[])[0]);
  ok("**也沒有任何 onclick**", !b.includes("onclick"), (b.match(/onclick="[^"]*"/)||[])[0]); }
{ reset([ v_("F1") ], [{name:"麗君",role:"cs"},{name:"泓儒",role:"editor",canAssign:true}]);
  as("麗君","cs");
  ok("不剪片的同仁也一樣（沒卡、沒按鍵）",
     !/assignFootage\(\)/.test(viewBoard()) && !viewBoard().includes("<button")); }

// ══════════ ⑤ 員工視角預覽不能借到指派權 ══════════
{ reset([ v_("F1") ]); as("管理員","boss"); VIEW_AS="泓儒";
  ok("**預覽小主管的畫面時派不動**", canAssignWork()===false && !/assignFootage\(\)/.test(viewBoard()));
  VIEW_AS=null; }

// ══════════ ⑥ 主管那一邊沒被弄壞 ══════════
{ reset([ v_("F1") ]); as("Regina","manager");
  const b=viewBoard();
  ok("Regina 的指派卡還在", /assignFootage\(\)/.test(b));
  ok("而且她的其他管理卡也還在", b.includes("備片存量") && b.includes("工作進度與交辦回報")); }
{ reset([ v_("F1") ]); as("HR小姐","hr");
  ok("人資不能指派（她不是小主管也沒被授權）", !/assignFootage\(\)/.test(viewBoard())); }

// ══════════ ⑦ 每個身分每一頁都畫得出來 ══════════
{ let bad=null;
  [["泓儒","editor"],["小葵","editor"],["Regina","manager"],["HR小姐","hr"],["管理員","boss"]]
    .forEach(([w,r])=>{ reset([ v_("F1") ]); as(w,r);
      myTabs().forEach(t=>{ CUR_TAB=t[0]; CAL_YM=null;
        try{ render(); }catch(e){ bad=w+"/"+t[0]+": "+e.message; } }); });
  ok("五種身分、每一個分頁都畫得出來", !bad, bad); }

console.log(`\nv190（小主管的指派毛片搬到看板）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
