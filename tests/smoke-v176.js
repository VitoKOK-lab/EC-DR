// v176：把「一張卡塞一整張表」的那幾張改成折疊。
//
// 老闆：「現在整個系統因為都是變更版面超級混亂，盡量能夠整齊排列，文字太多的點開再展開」
//
// 實測（正式資料・手機 390×844）найдено 的三個怪物，成因都一樣 ——
// 手機上 table.responsive 的每一列會變成一張小卡，所以 N 列＝N 張卡塞在一張卡裡：
//   出勤／出勤異常與說明  101 列 → 17326px（20 個螢幕）
//   設定／成員（27）       28 列 →  7851px
//   出勤／今日出勤         26 列 →  7312px
//   出勤／月報表           26 列 →  6120px
//   出勤／個人明細 ×5      各 2100px
//   整個出勤頁 72393px＝**85.8 個螢幕**
//
// 規矩：**上面那排「一眼要看的」留著（藥丸、統計數字），逐筆明細收進折疊**，
//       而且折疊標題上要有筆數 —— 收起來也要知道裡面有幾筆，不然會以為是空的。
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
global.window={addEventListener(){},innerWidth:390,innerHeight:844,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
// v188：設定分成五個子頁（基本／成員／平台／分類／維護）——這一支驗的是「成員」那一頁，
// 所以先切過去。（老闆：「管理員的設定太多了，要分類分頁面」）
SET_TAB="members";

const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const D=(n)=>{ const d=new Date(Date.parse(FROZEN+"T00:00:00Z")+n*864e5); return d.toISOString().slice(0,10); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
function as(w,r){ localStorage.setItem("ecdr_user",w); localStorage.setItem("ecdr_role",r); }

// 一堆人、一堆打卡紀錄 —— 要夠多才看得出「攤開來會有多長」
const NAMES=["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
function reset(days){
  VIEW_AS=null; BRAND=""; FOLD_OPEN={}; viewEl.innerHTML=""; modalHTML="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const shifts={};
  NAMES.forEach(n=>{
    const N=(days===undefined?8:days);
    for(let i=0;i<N;i++){   // ⚠️ 不可以寫 days||8：reset(0) 的 0 是 falsy，會變成 8 筆
      const d=D(-i);
      shifts[n+"__"+d]={id:n+"__"+d, user:n, date:d,
        clockIn:d+"T09:40:00", clockOut:d+"T18:05:00",   // 存的就是台北當地時間；09:40 > 09:00+5 分寬限 → 遲到，製造「異常」
        inDev:"dev-"+n, inUA:"Chrome"};
    }
  });
  // pwAt＝這個人設好自己密碼的日子，從那天起才開始算遲到早退（見 attendStartOf）。
  // 少了它，所有打卡都是「未列入計算」，就永遠生不出「異常」那張卡。
  const raw={ users:NAMES.map(n=>({name:n, role:"editor", pwAt:D(-60)+"T00:00:00"}))
                .concat([{name:"管理員",role:"boss"},{name:"HR",role:"hr"}]),
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00", workEnd:"18:00", lateGraceMin:5},
    schedule:{}, tasks:{}, shifts, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
}
// 折疊標題（含筆數）
const foldTitles=(h)=>(h.match(/<summary>([^<]*)(?:<span class="n">(\d+)<\/span>)?/g)||[])
  .map(s=>s.replace(/<summary>/,"").replace(/<span class="n">/,"｜").replace(/<\/span>/,""));
const hasFold=(h,t)=>new RegExp("<summary>"+t).test(h);
const foldN=(h,t)=>{ const m=h.match(new RegExp("<summary>"+t+"<span class=\"n\">(\\d+)<")); return m?+m[1]:null; };

// ══════════ ① 出勤頁：四個怪物都收起來了 ══════════
{ reset(); as("管理員","boss");
  const h=viewAttend();
  ok("**今日出勤：逐人明細收進折疊**", hasFold(h,"逐人明細"), foldTitles(h).slice(0,6));
  ok("今日出勤的折疊標題上有人數", foldN(h,"逐人明細")===attStaff().length, {有:foldN(h,"逐人明細"), 該有:attStaff().length});
  ok("**出勤異常：逐筆收進折疊**", hasFold(h,"逐筆異常"));
  ok("**月報表：逐人月統計收進折疊**", hasFold(h,"逐人月統計"));
  ok("月報表的折疊標題上有人數", foldN(h,"逐人月統計")===attStaff().length, foldN(h,"逐人月統計"));
  ok("**個人明細：一人一折**", (h.match(/<summary>[^<]*\/\d+ 明細/g)||[]).length===NAMES.length,
     (h.match(/<summary>[^<]*明細/g)||[])); }   // ⚠️「逐人明細」裡也有「明細」，要用「年/月 明細」才分得開；HR 沒打卡紀錄所以沒有他的
// 「一眼要看的」不可以跟著被收起來
{ reset(); as("管理員","boss");
  const h=viewAttend();
  const top=h.split("<summary>逐人明細")[0];
  ok("**今日的『已到／遲到／未打卡』還留在外面**（那是不點開也要看到的）",
     /已到 \d+/.test(top) && /遲到 \d+/.test(top), top.slice(-300));
  ok("『N 筆還沒說明』也還在外面", /筆還沒說明|都說明了/.test(h.split("<summary>逐筆異常")[0]));
  ok("月報表的換月按鈕還在外面（點開才換月會很煩）",
     /attMonthMove\(-1\)/.test(h.split("<summary>逐人月統計")[0])); }
// 收起來 ≠ 資料不見：內容還是整份在 HTML 裡
{ reset(); as("管理員","boss");
  const h=viewAttend();
  ok("**收起來只是收起來，每個人的資料都還在**", NAMES.every(n=>h.includes(">"+n+"<")||h.includes(n)),
     NAMES.filter(n=>!h.includes(n)));
  ok("表格列數沒有變少", (h.match(/<tr>/g)||[]).length>=NAMES.length*2); }
// 預設是收起來的（不然等於沒改）
{ reset(); as("管理員","boss");
  const h=viewAttend();
  const opens=(h.match(/<details class="fold" open/g)||[]).length;
  ok("**預設全部收起來**（這一頁沒有哪一折是非看不可的）", opens===0, opens); }

// ══════════ ② 設定頁：成員名單收起來 ══════════
{ reset(); as("管理員","boss");
  const h=viewSettings();
  ok("**成員名單收進折疊**", hasFold(h,"成員名單"));
  const shown=+((h.match(/成員（(\d+)）/)||[])[1]);
  ok("折疊標題上的人數＝卡片標題上的人數（兩個數字不能對不起來）",
     foldN(h,"成員名單")===shown, {折疊:foldN(h,"成員名單"), 標題:shown});
  ok("卡片標題那個「成員（N）」還在（不點開也知道幾個人）", /成員（\d+）/.test(h));
  ok("**「＋ 新增成員」留在外面**（那是常用的動作，不該藏起來）",
     /addMember\(\)/.test(h) && h.indexOf("addMember()")>h.indexOf("<summary>成員名單"),
     {addMember:h.indexOf("addMember()"), fold:h.indexOf("<summary>成員名單")});
  ok("成員資料都還在", NAMES.every(n=>h.includes(n))); }

// ══════════ ③ 沒有把別的東西弄壞 ══════════
{ reset(); as("管理員","boss");
  let bad=null;
  ["attend","settings","team"].forEach(t=>{ CUR_TAB=t; try{ render(); }catch(e){ bad=t+": "+e.message; } });
  ok("出勤／設定／團隊看板都畫得出來", !bad, bad); }
{ reset(); as("HR","hr");
  let bad=null;
  myTabs().forEach(t=>{ CUR_TAB=t[0]; try{ render(); }catch(e){ bad=t[0]+": "+e.message; } });
  ok("人資的每一頁也都畫得出來（出勤是他天天在看的）", !bad, bad); }
{ reset(0); as("管理員","boss");     // 一筆打卡都沒有
  let bad=null; try{ viewAttend(); }catch(e){ bad=e.message; }
  ok("一筆打卡都沒有的時候不會炸", !bad, bad); }
{ reset(0); as("管理員","boss");
  const h=viewAttend();
  ok("沒資料時不會生出一個空折疊騙人點（fold 本來就會整個不畫）",
     !/<summary>逐筆異常/.test(h), (h.match(/<summary>[^<]*/g)||[]).slice(0,5)); }

console.log(`\nv176（超長的卡改成點開再展開）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
