// v180：看板分兩層、員工只看自己那張、每個人看得到自己的出勤。
//
// 老闆的決定（逐條）：
//   ①「員工只看到自己那張＋全隊總數」
//   ②「成效可以（維持全公司都看得到）」
//   ③「出勤讓員工看到自己的 —— 好」
//
// 為什麼要動：正式資料實測（手機 390×844），團隊看板 28 張別人的卡＝19.9 個螢幕。
// 掃別人的交辦內容對自己的工作沒有幫助；他要知道的「今天全隊做得怎樣」在上面
// 那排總數裡就有了。
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
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const D=(n)=>{ const d=new Date(Date.parse(FROZEN+"T00:00:00Z")+n*864e5); return d.toISOString().slice(0,10); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
function as(w,r){ localStorage.setItem("ecdr_user",w); localStorage.setItem("ecdr_role",r); }
const NAMES=[["小葵","editor"],["阿明","editor"],["小美","cs"],["阿凱","ship"],["Anna","intl"]];
function reset(){
  VIEW_AS=null; BRAND=""; FOLD_OPEN={}; viewEl.innerHTML=""; modalHTML=""; TEAM_Q=""; TEAM_ROLE="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const shifts={};
  NAMES.forEach(([n])=>{ for(let i=0;i<6;i++){ const d=D(-i);
    shifts[n+"__"+d]={id:n+"__"+d,user:n,date:d,clockIn:d+"T09:05:00",clockOut:d+"T18:10:00"}; } });
  const raw={ users:NAMES.map(([n,r])=>({name:n,role:r,pwAt:D(-60)+"T00:00:00"}))
                .concat([{name:"Regina",role:"manager"},{name:"HR",role:"hr"},{name:"管理員",role:"boss"}]),
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00",lateGraceMin:5},
    schedule:{}, tasks:{ T1:{id:"T1",user:"阿明",date:D(0),title:"別人的交辦內容",report:"",done:false,
      assignedBy:"Regina",ack:true,createdAt:D(0)+"T09:00:00",msgs:[]} },
    shifts, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
}
// 「今天大家在做什麼」那一段（月成效不算 —— 那一段老闆決定維持公開）
// ⚠️ 標題有中英兩種（我今天／My day、今日成效／Today），海外看的是英文 ——
//    只寫中文的話海外那一條會直接抓不到區段而誤判。
const dayPart=(h)=>{ const i=h.search(/我今天|今日成效|My day|>Today/); if(i<0) return "";
  //    結尾的標記同理：本月成效／This month／月成效／Monthly 四種都要認，
  //    少寫一種就會把整個月成效區塊也算進來（那裡本來就列所有人）。
  const j=h.search(/本月成效|月成效|This month|Monthly/); return h.slice(i, j<0?h.length:j); };

// ══════════ ① 員工只看到自己那張卡 ══════════
{ reset(); as("小葵","editor");
  const h=viewTeam(), d=dayPart(h);
  ok("**員工的今日區塊只有自己**", d.includes("小葵") && !d.includes("阿明") && !d.includes("小美"),
     {自己:d.includes("小葵"), 阿明:d.includes("阿明"), 小美:d.includes("小美")});
  ok("標題寫「我今天」而不是「今日成效」", h.includes("我今天") && !h.includes("今日成效"));
  ok("**只有一格 teamgrid**", (h.match(/class="teamgrid"/g)||[]).length===1,
     (h.match(/class="teamgrid"/g)||[]).length);
  ok("**看不到別人被交辦了什麼**", !d.includes("別人的交辦內容"));
  ok("但全隊總數還看得到（那是他要知道的）",
     h.includes("今日出勤") && h.includes("交辦完成")); }
{ reset(); as("小美","cs");
  const d=dayPart(viewTeam());
  ok("不剪片的職位也一樣，只有自己那張", d.includes("小美") && !d.includes("小葵")); }
{ reset(); as("Anna","intl");
  const d=dayPart(viewTeam());
  ok("海外同仁也一樣", d.includes("Anna") && !d.includes("小葵")); }
// 主管／人資照舊看得到每一個人
{ [["Regina","manager"],["管理員","boss"],["HR","hr"]].forEach(([w,r])=>{
    reset(); as(w,r);
    const d=dayPart(viewTeam());
    ok(`${r} 看得到每一個人`, NAMES.every(([n])=>d.includes(n)), NAMES.filter(([n])=>!d.includes(n)).map(x=>x[0]));
  }); }
{ reset(); as("管理員","boss"); VIEW_AS={name:"小葵",role:"editor"};
  ok("員工視角預覽時也只看到小葵那張（預覽要像真的）",
     !dayPart(viewTeam()).includes("阿明"), dayPart(viewTeam()).includes("阿明"));
  VIEW_AS=null; }

// ══════════ ② 成效維持全公司都看得到（老闆：可以）══════════
{ reset(); as("小葵","editor");
  const h=viewTeam();
  ok("**月成效還是列得出每一個人**（老闆決定維持公開）",
     NAMES.every(([n])=>h.includes(n)), NAMES.filter(([n])=>!h.includes(n)).map(x=>x[0]));
  ok("月成效那幾欄還在", h.includes("出勤天數") && h.includes("交辦完成")); }

// ══════════ ③ 每個人看得到自己的出勤 ══════════
{ reset(); as("小葵","editor");
  const h=viewWork();
  ok("**剪輯的每日工作有「我的出勤」**", h.includes("我的出勤"), h.slice(0,150));
  ok("看得到自己這個月的天數與工時", /出勤 \d+ 天/.test(h) && h.includes("累計工時")); }
{ reset(); as("小美","cs");
  ok("**不剪片的職位也有**", viewWork().includes("我的出勤")); }
{ reset(); as("Anna","intl");
  const h=viewWork();
  ok("**海外同仁也有，而且是英文**", h.includes("My attendance"));
  // ⚠️ 不要用 split("</details>") 去切 —— 每日紀錄那張表本身就包在一層巢狀
  //    <details> 裡，第一個 </details> 會在表格**之前**就把字串切斷，
  //    等於整張表沒被檢查到（第一版就是這樣，把「星期寫死中文」的變異放過去了）。
  //    直接量那兩個產生器的輸出最準。
  const ym=(()=>{ const [y,m]=attYM(); return `${y}-${String(m+1).padStart(2,"0")}`; })();
  ok("海外的「我的出勤」卡沒有漏中文或全形標點",
     !/[　-〿一-鿿＀-￯]/.test(myAttendCard()), (myAttendCard().match(/[一-鿿]+/g)||[]).slice(0,5));
  ok("**海外的每日紀錄表也沒有漏中文**（星期、欄名、狀況都要翻）",
     !/[　-〿一-鿿＀-￯]/.test(attDetailTable("Anna", ym)),
     (attDetailTable("Anna", ym).match(/[一-鿿]+/g)||[]).slice(0,6));
  ok("（前提）那張表真的有資料，不是因為空的才過",
     (attDetailTable("Anna", ym).match(/<tr>/g)||[]).length>0,
     (attDetailTable("Anna", ym).match(/<tr>/g)||[]).length); }
{ reset(); as("小葵","editor");
  const h=viewWork();
  ok("**只有自己的**（別人的名字不會出現在那張卡裡）",
     !((h.split("我的出勤")[1]||"").split("</details>")[0]||"").includes("阿明")); }
// 打卡資料變了，這一頁要跟著重畫
{ ok("TAB_DEPS 的 work 有掛 shifts（不然打完卡不會更新）",
     (TAB_DEPS.work||[]).includes("shifts"), TAB_DEPS.work); }

// ══════════ ④ 沒有把別的弄壞 ══════════
{ let bad=null;
  [["管理員","boss"],["Regina","manager"],["HR","hr"],["小葵","editor"],["小美","cs"],["Anna","intl"]].forEach(([w,r])=>{
    reset(); as(w,r);
    myTabs().forEach(t=>{ CUR_TAB=t[0]; CAL_YM=null;
      try{ render(); }catch(e){ bad=w+"/"+t[0]+": "+e.message; } });
  });
  ok("六種身分、每一個分頁都畫得出來", !bad, bad); }
{ reset(); as("小葵","editor");
  ok("團隊看板對員工仍然是純檢視（沒有按鈕、沒有 onclick）",
     !/<button/.test(dayPart(viewTeam())) && !/onclick/.test(dayPart(viewTeam()))); }

console.log(`\nv180（員工只看自己那張・自己的出勤）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
