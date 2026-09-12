// v164：① 主管指派的影片直接進「本日工作」（以前埋在收合的待認領裡，等於沒派）
//        ② 影片庫每一列也有「標急件」鈕（老闆在儀表板那張卡找不到）
//        ③ 可以逐一授權某個人「指派剪輯工作」（users/{name}.canAssign）
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
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,
  // 指派毛片是讀 .afp_vid:checked 拿到勾選的影片。不餵東西進去的話，
  // assignFootage 會在「請勾選至少一支毛片」就提早 return —— 那樣拿掉權限檢查
  // 測試照樣綠（突變 0 紅就是這樣抓到的）。picked 裡放誰＝畫面上勾了誰。
  querySelectorAll:(sel)=> String(sel||"").indexOf(".afp_vid")===0
    ? picked.map(id=>({value:id, checked:true})) : []};
let picked=[];
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
// v188：設定分成五個子頁（基本／成員／平台／分類／維護）——這一支驗的是「成員」那一頁，
// 所以先切過去。（老闆：「管理員的設定太多了，要分類分頁面」）
SET_TAB="members";

const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,260));} }
const RAW="https://drive.google.com/file/d/RAW";
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"片"+id,videoCopy:"腳本",
  rawLink:RAW,lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  claimedAt:"",finishedAt:"",durationMin:0,publishedLink:"",driveFolder:"",reviewStatus:"",
  locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],tags:[],
  products:[],usageHistory:[],metrics:[],deleted:false,source:"官方IP",shotAt:"",shotBy:"",
  urgent:false,urgentAt:"",urgentBy:""},o||{});
let WRITES=[];
function reset(videos, who, role, users){
  WRITES=[]; picked=[]; modalHTML=""; viewEl.innerHTML=""; VIEW_AS=null; BRAND="";
  VID_VIEW="raw"; VID_MODE="list"; POOL_FILTER="all"; POOL_Q=""; VID_Q=""; FOLD_OPEN={};
  for(const k in fields) delete fields[k];
  global.window.DB={ set:async(c,id,o)=>{WRITES.push(["set",c,id,o]);},
    update:async(c,id,p)=>{WRITES.push(["update",c,id,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{},
    videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users: users||[{name:"小葵",role:"editor"},{name:"管理員",role:"boss"},
                     {name:"Regina",role:"manager"},{name:"泓儒",role:"editor"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],
      intlAccounts:[],shopeeAccounts:[],msAccounts:[],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"小葵"); localStorage.setItem("ecdr_role", role||"editor");
}
const D=(n)=>{ const d=new Date(Date.parse(FROZEN+"T00:00:00Z")+n*864e5); return d.toISOString().slice(0,10); };

// ══════════ ① 指派的影片進「本日工作」 ══════════
{ reset([ v_("指派給我",{assignedTo:"小葵"}), v_("沒指派"), v_("指派給別人",{assignedTo:"阿明"}) ], "小葵","editor");
  const mine=myAssignedVids().map(v=>v.id), pool=poolAll().map(v=>v.id);
  ok("指派給我的抓得到", mine.join()==="指派給我", mine);
  ok("**不在待認領池了**（以前兩邊都放＝同一頁出現兩次）", !pool.includes("指派給我"), pool);
  ok("沒指派的還在池子裡", pool.includes("沒指派"), pool);
  ok("指派給別人的兩邊都看不到", !mine.includes("指派給別人") && !pool.includes("指派給別人"));
  ok("兩份加起來＝我看得到的全部，一支都沒漏",
     mine.concat(pool).sort().join()===["指派給我","沒指派"].sort().join(), {mine,pool}); }

// 還沒上傳毛片的不算 —— 派了他也沒東西可剪（跟待認領池同一個標準）
{ reset([ v_("沒毛片",{assignedTo:"小葵", rawLink:"", driveFolder:"", shotAt:""}) ], "小葵","editor");
  ok("還沒上傳毛片的不進本日工作（認領了也沒東西剪）", myAssignedVids().length===0, myAssignedVids()); }
// 已經開始剪的不算「指派待開始」，它走原本的「剪輯中」那條
{ reset([ v_("在剪",{assignedTo:"小葵", claimedBy:"小葵", stage:"剪輯中"}) ], "小葵","editor");
  ok("已經在剪的不重複出現在指派清單", myAssignedVids().length===0, myAssignedVids()); }

// 排序：急件優先、其次上片日
{ reset([ v_("晚",{assignedTo:"小葵",scheduledDate:D(9)}),
          v_("早",{assignedTo:"小葵",scheduledDate:D(1)}),
          v_("急但最晚",{assignedTo:"小葵",scheduledDate:D(30),urgent:true}),
          v_("沒排",{assignedTo:"小葵"}) ], "小葵","editor");
  ok("急件第一、其次照上片日、沒排的最後",
     myAssignedVids().map(v=>v.id).join()==="急但最晚,早,晚,沒排", myAssignedVids().map(v=>v.id)); }

// 畫面：本日工作那張卡
{ reset([ v_("派給我",{assignedTo:"小葵",scheduledDate:D(1)}) ], "小葵","editor");
  const h=viewWork();
  ok("本日工作看得到那一支", h.includes("片派給我"), h.slice(0,60));
  ok("寫著「主管指派給你」", h.includes("主管指派給你"), (h.match(/主管指派給你[^<]*/)||[])[0]);
  ok("給的是認領鍵（認領才開始計時）", /claimVid\('派給我'\)/.test(h));
  ok("不會被畫成已完成的灰色", !/todo done[^"]*"[^>]*>[\s\S]{0,300}片派給我/.test(h)); }

// 急件的指派件：紅的，而且在最前面
{ reset([ v_("普通派給我",{assignedTo:"小葵",scheduledDate:D(1)}),
          v_("急件派給我",{assignedTo:"小葵",scheduledDate:D(9),urgent:true,urgentBy:"管理員"}) ], "小葵","editor");
  const h=viewWork();
  ok("急件那一列是紅的", /class="todo\s*[^"]*urg"/.test(h), (h.match(/class="todo[^"]*"/g)||[]).slice(0,4));
  ok("急件排在普通的前面",
     h.indexOf("片急件派給我") < h.indexOf("片普通派給我"),
     {急:h.indexOf("片急件派給我"), 普:h.indexOf("片普通派給我")}); }

// 手上正在剪的急件，要排在「指派待開始」的前面
{ reset([ v_("指派的",{assignedTo:"小葵"}),
          v_("在剪的急件",{claimedBy:"小葵",editor:"小葵",stage:"剪輯中",urgent:true}) ], "小葵","editor");
  const h=viewWork();
  ok("在剪的急件排最前面", h.indexOf("片在剪的急件") < h.indexOf("片指派的")); }

// 池子空了要講清楚東西去哪了，不然會以為片不見了
{ reset([ v_("派給我",{assignedTo:"小葵"}) ], "小葵","editor");
  const h=viewWork();
  // v182：三種說法（上班計畫／本日工作／Today's Work）統一成「每日工作／My Day」
  ok("待認領空了的提示要指路到每日工作", h.includes("每日工作"), (h.match(/目前沒有可以認領[^<]*/)||[])[0]); }

// ══════════ ② 影片庫每一列也有急件鈕 ══════════
{ reset([ v_("A") ], "管理員","boss");
  const row=vidTableRow(vid("A"));
  ok("影片庫那一列有「標急件」", /toggleUrgent\('A'\)/.test(row), row.slice(-320));
  ok("狀態欄掛 has-act（手機才留得住那一格）", /class="has-act"/.test(row), row.slice(-320)); }
{ reset([ v_("A",{urgent:true,urgentBy:"管理員"}) ], "管理員","boss");
  const row=vidTableRow(vid("A"));
  ok("已經是急件的看得到紅標", row.includes("急件"), row.slice(-320));
  ok("——也給取消鍵", /取消急件/.test(row)); }
{ reset([ v_("A") ], "小葵","editor");
  const row=vidTableRow(vid("A"));
  ok("剪輯在影片庫看不到那顆鈕", !/toggleUrgent/.test(row), row.slice(-260)); }
// 只有「毛片已上傳」那顆、沒有急件鈕時，has-act 照樣要掛（不然手機又看不到）
{ reset([ v_("A",{rawLink:"",driveFolder:"https://drive.google.com/drive/folders/X",shotAt:""}) ], "小葵","editor");
  const row=vidTableRow(vid("A"));
  ok("只有「毛片已上傳」時 has-act 也要掛", /class="has-act"/.test(row) && /markShot/.test(row), row.slice(-300)); }
{ reset([ v_("A",{claimedBy:"小葵",stage:"剪輯中"}) ], "小葵","editor");
  const row=vidTableRow(vid("A"));
  ok("兩顆鈕都沒有時就不要掛 has-act（不然手機卡片被灰標籤灌爆）",
     !/has-act/.test(row), row.slice(-260)); }

// ══════════ ③ 逐一授權「可以指派剪輯工作」 ══════════
const U=(o)=>Object.assign({name:"泓儒",role:"editor"},o||{});
{ reset([], "管理員","boss");
  ok("管理員本來就可以", canAssignWork()===true);
  reset([], "Regina","manager");
  ok("經理人本來就可以", canAssignWork()===true);
  reset([], "泓儒","editor");
  ok("一般剪輯不可以", canAssignWork()===false);
  reset([], "泓儒","editor", [{name:"泓儒",role:"editor",canAssign:true},{name:"管理員",role:"boss"}]);
  ok("**被授權的剪輯可以**", canAssignWork()===true);
  reset([], "小葵","editor", [{name:"泓儒",role:"editor",canAssign:true},{name:"小葵",role:"editor"}]);
  ok("只有被勾到的人可以，不是全部剪輯", canAssignWork()===false); }
{ reset([], "管理員","boss", [{name:"泓儒",role:"editor",canAssign:true},{name:"管理員",role:"boss"}]);
  VIEW_AS="泓儒";
  ok("員工視角（唯讀預覽）底下一律不行", canAssignWork()===false); VIEW_AS=null; }

// 入口：v190 起在**看板**上（跟 Regina 的同一個位置）。
// 老闆回報「鴻儒要分配影片給別人剪輯那個畫面我找不到」—— 本來藏在「每日工作」
// 往下 37% 而且是收起來的折疊；Regina 的同一張卡在看板上，小主管當然去看板找。
{ reset([ v_("F") ], "泓儒","editor", [{name:"泓儒",role:"editor",canAssign:true},{name:"小葵",role:"editor"}]);
  const b=viewBoard();
  ok("**被授權的人在看板上看得到指派卡**", b.includes("指派毛片給員工") && /assignFootage\(\)/.test(b),
     b.slice(0,160));
  ok("裡面選得到別的剪輯", /afp_who/.test(b) && b.includes("小葵"));
  ok("**每日工作上不再有一份**（同一件事不要兩個地方各一份）",
     !/assignFootage\(\)/.test(viewWork())); }
{ reset([ v_("F") ], "小葵","editor");
  ok("沒被授權的人看不到那張卡（看板與每日工作都沒有）",
     !/assignFootage\(\)/.test(viewBoard()) && !/assignFootage\(\)/.test(viewWork())); }

// 真正的擋門在寫入那一支，不是只有畫面不畫
(async()=>{
{ // 先證明「有權限的時候真的寫得進去」—— 不然下面那條可能是因為別的原因沒寫
  reset([ v_("F") ], "Regina","manager");
  fields.afp_who="小葵"; picked=["F"];
  await assignFootage(); await new Promise(r=>setTimeout(r,20));
  ok("（前提）有權限的人按下去真的會寫 videos",
     WRITES.some(x=>x[0]==="update"&&x[1]==="videos"&&x[2]==="F"), WRITES); }
{ reset([ v_("F") ], "小葵","editor");
  fields.afp_who="泓儒"; picked=["F"];
  await assignFootage(); await new Promise(r=>setTimeout(r,20));
  ok("**沒權限的人直接呼叫 assignFootage 也寫不進去**",
     !WRITES.some(x=>x[0]==="update"&&x[1]==="videos"), WRITES); }
{ reset([ v_("F") ], "泓儒","editor", [{name:"泓儒",role:"editor",canAssign:true},{name:"小葵",role:"editor"}]);
  fields.afp_who="小葵"; picked=["F"];
  await assignFootage(); await new Promise(r=>setTimeout(r,20));
  const w=WRITES.find(x=>x[0]==="update"&&x[1]==="videos"&&x[2]==="F");
  ok("被授權的人指派得動", !!w, WRITES);
  ok("指派給對的人", w && w[3].assignedTo==="小葵", w&&w[3]); }

// 設定 → 權限：老闆勾得到（v202 從成員表整合到「權限」那一頁）
{ reset([], "管理員","boss", [{name:"泓儒",role:"editor"},{name:"管理員",role:"boss"},{name:"Regina",role:"manager"}]);
  SET_TAB="perms"; const h=viewSettings(); SET_TAB="basic";
  ok("權限頁有「工作指派」這一欄", h.includes("工作指派"), (h.match(/<th[^>]*>工作指派<\/th>/)||[])[0]);
  ok("剪輯那一列有勾選框", /setMemberPerm\('泓儒','assign',this\.checked\)/.test(h), h.slice(0,200));
  // 管理員本來就不在這張表裡（只列 STAFF_ROLES＋經理人），所以「職位」實際會出現的是經理人
  ok("管理員不在這張表裡（本來就不列他）", !/setMemberPerm\('管理員'/.test(h));
  ok("經理人那一列寫「職位」，不給勾（勾了也沒差）",
     /Regina[\s\S]{0,900}職位/.test(h) && !/setMemberPerm\('Regina','assign'/.test(h),
     (h.match(/Regina[\s\S]{0,900}?<\/tr>/)||[])[0]); }
{ reset([], "管理員","boss", [{name:"泓儒",role:"editor",canAssign:true},{name:"管理員",role:"boss"}]);
  SET_TAB="perms"; const h=viewSettings(); SET_TAB="basic";
  const cell=(h.match(/<input type="checkbox" checked[^>]*setMemberPerm\('泓儒','assign'[^>]*>/)||[])[0];
  ok("舊旗標 canAssign 照樣顯示成勾起來（資料庫不用搬）", !!cell,
     (h.match(/<input type="checkbox"[^>]*setMemberPerm\('泓儒','assign'[^>]*>/)||[])[0]); }
{ reset([], "管理員","boss", [{name:"泓儒",role:"editor",perms:["assign"]},{name:"管理員",role:"boss"}]);
  SET_TAB="perms"; const h=viewSettings(); SET_TAB="basic";
  ok("新的 perms 陣列也顯示成勾起來",
     /<input type="checkbox" checked[^>]*setMemberPerm\('泓儒','assign'/.test(h)); }

{ reset([], "管理員","boss");
  setMemberPerm("泓儒", "assign", true); await new Promise(r=>setTimeout(r,20));
  const w=WRITES.find(x=>x[0]==="update"&&x[1]==="users");
  ok("勾起來會寫 users", !!w, WRITES);
  ok("perms 寫進去了", w && Array.isArray(w[3].perms) && w[3].perms.includes("assign"), w&&w[3]);
  // 舊旗標要一起動：hasPerm 兩邊都看，只清一邊等於沒清（取消了卻還是有）
  ok("舊旗標 canAssign 也跟著設成 true", w && w[3].canAssign===true, w&&w[3]);
  ok("只碰 perms 與那一個舊旗標，別的欄位不動",
     w && Object.keys(w[3]).sort().join()==="canAssign,perms", w&&w[3]); }
{ reset([], "管理員","boss", [{name:"泓儒",role:"editor",canAssign:true},{name:"管理員",role:"boss"}]);
  setMemberPerm("泓儒", "assign", false); await new Promise(r=>setTimeout(r,20));
  const w=WRITES.find(x=>x[0]==="update"&&x[1]==="users");
  ok("取消時舊旗標也要清掉（只清一邊的話他還是有權限）",
     w && w[3].canAssign===false && !(w[3].perms||[]).includes("assign"), w&&w[3]); }
// 路由的欄位白名單：沒列進去的話會被默默丟掉（勾了沒反應、也不會報錯）
{ ok("PUT /api/users 的白名單有放行 canAssign",
     /body\.canAssign!=null\) patch\.canAssign=!!body\.canAssign/.test(APP), "路由沒放行 canAssign");
  ok("白名單也要放行 perms（v202）——忘了加就是「勾了沒反應」",
     /body\.perms!=null\) patch\.perms=/.test(APP), "路由沒放行 perms"); }

// v195（老闆指定）：這個權限現在給的是「派片」那一組事 —— 指派 ＋ 標急件。
// 老闆問「鴻儒怎麼沒有急件的按鈕」，決定有「可指派」的人就能標：
// 派片的人本來就在決定誰先剪什麼，為了插一支隊還要回頭找主管沒有意義。
// ⚠️ 範圍**沒有**因此變大 —— 下面兩條在盯：一般剪輯照舊不能標，
//    而且這個權限依然不含看薪資、改設定、主管看板那些。
{ reset([], "泓儒","editor", [{name:"泓儒",role:"editor",canAssign:true}]);
  ok("被授權的人可以指派", canAssignWork()===true);
  ok("**而且標得了急件**（v195 老闆加的）", canMarkUrgent()===true);
  ok("看得到「標急件」那顆鈕", /toggleUrgent/.test(urgentBtn({id:"A",urgent:false})), urgentBtn({id:"A"}));
  ok("**但看不到主管看板**（權限沒有整包放大）", seesLeadBoard()===false); }
// 沒被授權的一般剪輯照舊不能標 —— 誰都能標的話紅色就沒有意義了
{ reset([], "小葵","editor", [{name:"小葵",role:"editor"}]);
  ok("**一般剪輯還是不能標急件**", canMarkUrgent()===false);
  ok("而且那顆鈕不會畫出來", urgentBtn({id:"A",urgent:false})==="", urgentBtn({id:"A"})); }

console.log(`\nv164（指派的片進本日工作・影片庫的急件鈕・逐一授權指派）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
