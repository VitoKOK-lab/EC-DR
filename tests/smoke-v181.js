// v181：分頁重整 —— 名字改成看得懂的、三頁併成「看板」、維護工具收進設定。
//
// 老闆：「那我的標題有需要調整嗎？就是月報表影片庫這些標題…因為有一大部分的人
//        是不用跟剪輯無關的。」→ 我提了方案，他回「好」。
//
// 為什麼：正式資料 27 人裡有 **13 個（48%）跟剪輯完全無關**
//        （客服 8、選品 2、外包客服 2、出貨 1）。
//
// 四件事：
//   ① 名字：影片庫A→影片庫（沒有 B）／影片庫大流→大流量影片（「大流」看不懂）
//           剪輯成效→剪輯產出、平台成效→影片流量（原本兩個都叫「成效」）
//   ② 儀表板＋流程中控＋團隊看板 → 一個「看板」
//   ③ 操作紀錄＋回收桶 → 收進「設定」（老闆 11 個分頁 → 9 個）
//   ④ 選品行銷不再下載整份影片庫（她們不剪片）
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const FB=fs.readFileSync(path.join(__dirname,"..","fb.js"),"utf8");
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
global.window={addEventListener(){},innerWidth:390,innerHeight:844,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
// v188：設定分成五個子頁（基本／成員／平台／分類／維護）——這一支驗的是「維護」那一頁，
// 所以先切過去。（老闆：「管理員的設定太多了，要分類分頁面」）
SET_TAB="maint";

const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
function as(w,r){ localStorage.setItem("ecdr_user",w); localStorage.setItem("ecdr_role",r); }
function reset(){
  VIEW_AS=null; BRAND=""; FOLD_OPEN={}; viewEl.innerHTML=""; modalHTML=""; CAL_YM=null;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"麗君",role:"cs"},{name:"怡萍",role:"pick"},
                     {name:"Anna",role:"intl"},{name:"HR",role:"hr"},{name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
}
const ids=()=>myTabs().map(t=>t[0]);
const labels=()=>myTabs().map(t=>t[1]);

// ══════════ ① 名字：看不懂的都改掉 ══════════
{ reset(); as("管理員","boss");
  const L=labels();
  ok("**「影片庫A」改成「影片庫」**（本來就沒有 B）", L.includes("影片庫") && !L.some(x=>/影片庫A/.test(x)), L);
  ok("**「影片庫大流」改成「大流量影片」**（「大流」外人看不懂）",
     L.includes("大流量影片") && !L.some(x=>/大流$|影片庫大流/.test(x)), L);
  // v181 原本是寫死「不准有任何分頁含『成效』兩個字」—— 那是拿當時剛好取的名字
  // 當代理指標。真正的要求是「兩個不同的東西不能叫同一個名字」（原本兩個都叫「成效」，
  // 沒人分得出哪個是哪個）。v202 老闆把「影片流量」改名成「影片成效」之後，
  // 舊的寫法會誤報 —— 所以改成直接守那個要求。
  ok("**兩個「成效」分開了**：剪輯產出 vs 影片成效",
     L.includes("剪輯產出") && L.includes("影片成效"), L);
  ok("沒有分頁叫做光禿禿的「成效」（那是當初分不出來的元凶）", !L.includes("成效"), L);
  ok("沒有兩個分頁同名", new Set(L).size===L.length, L); }
// ⚠️ 只看**畫出來的字**，不看註解 —— 註解裡的「影片庫A」是內部術語
//    （lib 欄位空字串 vs "大流" 的區分），跟使用者看到的標題是兩回事。
{ reset(); as("管理員","boss");
  ok("**頁面大標題也改了**（不是只改分頁按鈕）",
     !/影片庫A/.test(viewVideos()) && /<h2>影片庫<\/h2>/.test(viewVideos()),
     (viewVideos().match(/<h2>[^<]*<\/h2>/)||[])[0]);
  ok("大流量影片那一頁的標題也對", /<h2>[^<]*大流/.test(viewVideosDF()),
     (viewVideosDF().match(/<h2>[^<]*<\/h2>/)||[])[0]); }

// ══════════ ② 三頁併成一個「看板」 ══════════
{ reset();
  [["管理員","boss"],["Regina","manager"],["HR","hr"],["小葵","editor"],["麗君","cs"],["怡萍","pick"],["Anna","intl"]]
    .forEach(([w,r])=>{ reset(); as(w,r);
      ok(`${r} 有「看板」`, ids().includes("board"), ids());
      ok(`${r} 已經沒有儀表板／流程中控／團隊看板三個分頁`,
         !["dashboard","flow","team"].some(t=>ids().includes(t)), ids());
    }); }
{ reset(); as("管理員","boss");
  // v196：又多了一個「找影片」（9 → 10）。這條在盯的是「不要再回到 11 個那種
  //       什麼都塞進導覽列的狀態」，所以是釘數字，不是釘「永遠不准新增」。
  // v203：「二創」自成一頁（10 → 11）。老闆要的：「我這裡是新的頁面新的表單，
  //       跟原本的大流量不要有關係，未來這邊用的順手了，我會直接把大流量那一整頁
  //       直接刪掉。」所以 11 是**暫時的** —— 大流量那一頁拿掉之後就回到 10。
  //       ⚠️ 下一次有人想再加第 12 個之前，先把大流量收掉。
  ok("**老闆的分頁維持在 11 個以內**（多的是二創，等大流量收掉會回到 10）",
     ids().length<=11 && ids().includes("assets") && ids().includes("remake"),
     {幾個:ids().length, 是:ids()});
  ok("而且「二創」跟「大流量影片」是兩頁（大流量那頁以後要整頁刪掉，二創不能跟著陪葬）",
     ids().includes("remake") && ids().includes("videosDF"), ids());
  ok("順序：溝通 → 看板 → 其他",
     ids()[0]==="chat" && ids()[1]==="board", ids()); }
{ reset(); as("麗君","cs");
  ok("**跟剪輯無關的同仁只有三個分頁**", JSON.stringify(ids())===JSON.stringify(["chat","work","board"]), ids());
  ok("而且三個名字裡都沒有「影片」兩個字",
     labels().every(x=>!/影片/.test(x)), labels()); }
// 看板真的畫得出來，而且分兩層
{ reset(); as("Regina","manager");
  const h=viewBoard();
  ok("主管的看板有新片存量（原本在流程中控）", h.includes("新片存量"));   // v194 改名
  ok("主管的看板有毛片庫存（原本在流程中控）", h.includes("毛片庫存"));
  ok("主管的看板有當日進度（原本在儀表板）", h.includes("工作進度與交辦回報"));
  ok("主管的看板也有下半部（團隊今天在做什麼）", h.includes("團隊今天在做什麼")); }
{ reset(); as("小葵","editor");
  const h=viewBoard();
  ok("**員工的看板沒有主管那一層**",
     !h.includes("新片存量") && !h.includes("毛片庫存") && !h.includes("工作進度與交辦回報"), h.slice(0,200));
  ok("但員工的看板還是有東西（不是空白頁）", h.includes("我今天")); }
{ reset(); as("管理員","boss");
  ok("員工視角預覽也是員工版（預覽要像真的）", (()=>{
    VIEW_AS={name:"小葵",role:"editor"}; const h=viewBoard(); VIEW_AS=null;
    return !h.includes("新片存量"); })()); }

// ══════════ ③ 操作紀錄與回收桶收進設定 —— 但一定要有入口 ══════════
{ reset(); as("管理員","boss");
  ok("導覽列上沒有操作紀錄與回收桶了", !ids().includes("log") && !ids().includes("trash"), ids());
  const h=viewSettings();
  ok("**設定裡有操作紀錄的入口**", /CUR_TAB='log'/.test(h), h.slice(0,200));
  ok("**設定裡有回收桶的入口**", /CUR_TAB='trash'/.test(h));
  ok("兩頁本身還在（不是被刪掉）", /log:viewLog/.test(APP) && /trash:viewTrash/.test(APP)); }
{ reset(); as("管理員","boss");
  let bad=null;
  ["log","trash"].forEach(t=>{ CUR_TAB=t; try{ render(); }catch(e){ bad=t+": "+e.message; } });
  ok("從設定點進去之後那兩頁畫得出來", !bad, bad); }
{ reset(); as("Regina","manager");
  ok("經理人本來就沒有設定頁，也就進不到那兩個工具", !ids().includes("settings"), ids()); }

// ══════════ ④ 選品行銷不再下載整份影片庫 ══════════
{ ok("**選品行銷進了「不用影片」清單**", NO_VIDEO_ROLES.includes("pick"), NO_VIDEO_ROLES);
  ok("needVideos('pick') 是 false", needVideos("pick")===false);
  ok("**fb.js 那一份也同步了**（不然 app 以為不載、fb 照樣訂閱）",
     /const NO_VIDEO_ROLES = \[[^\]]*"pick"[^\]]*\]/.test(FB),
     (FB.match(/const NO_VIDEO_ROLES = \[[^\]]*\]/)||[])[0]);
  ok("會剪片的與管理層絕對沒有被順手關掉",
     ["editor","intl","boss","manager","hr"].every(r=>needVideos(r)===true),
     ["editor","intl","boss","manager","hr"].filter(r=>!needVideos(r))); }
{ reset(); as("怡萍","pick");
  const h=viewBoard();
  ok("選品行銷的看板不再出現剪片速度那幾欄（對她們永遠是「—」）",
     !h.includes("剪片速度") && !h.includes("平均工時"), h.slice(0,200)); }

// ══════════ ⑤ 每個角色每一頁都畫得出來 ══════════
{ let bad=null;
  [["管理員","boss"],["Regina","manager"],["HR","hr"],["小葵","editor"],["麗君","cs"],["怡萍","pick"],["Anna","intl"]]
    .forEach(([w,r])=>{ reset(); as(w,r);
      myTabs().forEach(t=>{ CUR_TAB=t[0]; CAL_YM=null;
        try{ render(); }catch(e){ bad=w+"/"+t[0]+": "+e.message; } }); });
  ok("七種身分、每一個分頁都畫得出來", !bad, bad); }
// TAB_DEPS 要跟導覽列對得起來
{ reset(); as("管理員","boss");
  const all=new Set();
  [["管理員","boss"],["Regina","manager"],["HR","hr"],["小葵","editor"],["麗君","cs"],["Anna","intl"]]
    .forEach(([w,r])=>{ reset(); as(w,r); ids().forEach(t=>all.add(t)); });
  ok("TAB_DEPS 裡不再有已經移除的分頁（留著會讓防空轉檢查一直紅）",
     !["dashboard","flow","team"].some(t=>TAB_DEPS[t]), Object.keys(TAB_DEPS));
  ok("看板與溝通都登記了", !!TAB_DEPS.board && !!TAB_DEPS.chat, Object.keys(TAB_DEPS)); }

console.log(`\nv181（分頁重整：名字・併頁・維護工具）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
