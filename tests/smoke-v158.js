// v158：剪輯成效分兩層 —— 先看名單，點某個人才進他這個月的清單。
//
// 為什麼要改：主管與人資每個月的動作是「一個人一個人檢查」。原本十個剪輯的片
// 一次全攤開（實測正式資料 168 列），那是一張總表 —— 要看某個人做了什麼，
// 得先在裡面找到他。介面要照他們真正的動作走：
//   第一層  一個人一列：完成幾支、審過幾支、還沒審幾支、退回、缺資料夾
//   第二層  點下去 → 那個人這個月的清單，**預設停在「審過」**
//           （要檢查的就是審過的成品），每一支都能點進雲端資料夾看檔案
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
let modalHTML="", viewEl=el(), RENDERS=0;
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
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const TODAY=D(0), THISYM=TODAY.slice(0,7);
const FAM="https://drive.google.com/drive/folders/FAM";
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"片"+id,videoCopy:"文案",
  rawLink:"http://raw",lib:"",stage:"已完成",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  claimedAt:D(-2)+"T09:00:00",finishedAt:TODAY+"T18:00:00",durationMin:90,publishedLink:"",
  driveFolder:FAM+"-"+id,reviewStatus:"通過",locale:"",channel:"",origLang:"",account:"",
  sourceVideoId:"",cover:"",remakes:[],tags:[],products:[],usageHistory:[],metrics:[],deleted:false},o||{});
// 小葵：3 審過（1 支沒資料夾）、1 還沒審　阿哲：1 審過、1 退回　阿美：這個月 0 支
const SET=()=>[
  v_("K1",{editor:"小葵"}), v_("K2",{editor:"小葵"}),
  v_("K3",{editor:"小葵", driveFolder:""}),
  v_("K4",{editor:"小葵", reviewStatus:""}),
  v_("Z1",{editor:"阿哲"}), v_("Z2",{editor:"阿哲", reviewStatus:"退回"}),
  v_("M0",{editor:"阿美", finishedAt:D(-60)+"T10:00:00"}),      // 上上個月，本月不算
];
function reset(videos, who, role){
  modalHTML=""; viewEl.innerHTML=""; OUT_FILTER="all"; OUT_WHO=""; TEAM_YM=null; VIEW_AS=null; BRAND="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}),
    loadShiftMonth:async()=>{} };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"阿哲",role:"editor"},{name:"阿美",role:"editor"},
      {name:"管理員",role:"boss"},{name:"HR小姐",role:"hr"},{name:"Regina",role:"manager"},{name:"麗君",role:"cs"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"管理員"); localStorage.setItem("ecdr_role", role||"boss");
  CUR_TAB="output";
}
const nDrive=(h)=>(h.match(/rel="noopener noreferrer"/g)||[]).length;
const nRows =(h)=>(h.match(/data-label="審核"/g)||[]).length;

// ══════════ ① 第一層：一個人一列的名單 ══════════
{ reset(SET(), "管理員","boss");
  const h=viewOutput();
  ok("三個剪輯都在名單上", ["小葵","阿哲","阿美"].every(n=>h.includes(n)));
  ok("每個人都點得進去", (h.match(/onclick="outPick\('/g)||[]).length===3, (h.match(/onclick="outPick\('/g)||[]).length);
  ok("小葵那一列的 onclick 帶的是他的名字", h.includes(`outPick('小葵')`));
  ok("名單上就看得到「審過幾支」", /審過 3/.test(h) && /審過 1/.test(h), h.match(/審過 \d+/g));
  ok("名單上就看得到「還沒審幾支」", /還沒審 1/.test(h));
  ok("名單上就看得到「退回幾支」", /退回 1/.test(h));
  ok("名單上就看得到「缺資料夾幾支」", /缺資料夾 1/.test(h));
  ok("這個月沒產出的人也列出來（看得到誰是 0）", h.includes("阿美"));
  ok("名單這一層不畫任何影片列（那是點進去的事）", nRows(h)===0, nRows(h));
  ok("名單這一層不畫資料夾連結", nDrive(h)===0, nDrive(h));
  ok("名單這一層沒有篩選鈕", !/vtab-n/.test(h));
  ok("上面有總計（六支）", /完成 6 支/.test(h), h.match(/完成 \d+ 支/g)); }

// ══════════ ② 點進去：那個人這個月的清單 ══════════
{ reset(SET(), "管理員","boss");
  outPick("小葵");
  ok("記住現在在看誰", OUT_WHO==="小葵");
  ok("預設停在「審過」—— 要檢查的就是審過的成品", OUT_FILTER==="ok");
  const h=viewOutput();
  ok("標題有他的名字", h.includes("小葵"));
  ok("標題有月份", h.includes(String(+THISYM.slice(5,7))));
  ok("有「回到全部」", /onclick="outBackAll\(\)"/.test(h));
  ok("只列審過的三支", nRows(h)===3, nRows(h));
  ok("還沒審的那支沒被列進來", !h.includes("片K4"));
  ok("不會混到阿哲的片", !h.includes("片Z1") && !h.includes("片Z2"));
  ok("篩選鈕的數字是「他的」不是全部人加起來",
     /全部<\/span> <span class="vtab-n">4</.test(h) && /審過<\/span> <span class="vtab-n">3</.test(h),
     h.match(/vtab-n">\d+</g)); }

// ══════════ ③ 重點：每一支都點得進雲端資料夾 ══════════
{ reset(SET(), "管理員","boss");
  outPick("小葵");
  const h=viewOutput();                       // 預設審過：K1、K2 有資料夾，K3 沒有
  ok("審過而且有資料夾的都給得出連結", nDrive(h)===2, nDrive(h));
  ok("連結是真的資料夾網址", h.includes(FAM+"-K1"));
  ok("開新分頁", /href="[^"]*FAM-K1"[^>]*target="_blank"/.test(h));
  ok("外部連結帶 rel=noopener", /href="[^"]*FAM-K1"[^>]*rel="noopener noreferrer"/.test(h));
  ok("沒有資料夾的那支寫清楚，不是給一個點不開的連結",
     h.includes("沒有存檔資料夾") && !/href="">/.test(h));
  ok("有提醒缺資料夾要回頭請他補", /缺資料夾/.test(h) && /請他補/.test(h)); }

// ══════════ ④ 切篩選：其他狀態一按就看得到 ══════════
{ reset(SET(), "管理員","boss");
  outPick("小葵");
  setOutFilter("wait");
  ok("切到「還沒審」：只剩那一支", nRows(viewOutput())===1);
  ok("切到「還沒審」：就是 K4", viewOutput().includes("片K4"));
  setOutFilter("all");
  ok("切到「全部」：四支都在", nRows(viewOutput())===4, nRows(viewOutput()));
  setOutFilter("nodrive");
  ok("切到「缺資料夾」：只剩沒資料夾的那支", nRows(viewOutput())===1);
  ok("切到「缺資料夾」：一個連結都沒有", nDrive(viewOutput())===0); }

// ══════════ ⑤ 退回名單 ══════════
{ reset(SET(), "管理員","boss");
  outPick("阿哲"); setOutFilter("wait");     // ⚠️ 刻意留在「還沒審」——
  //   先設成 all 的話，outBackAll 有沒有歸零都看不出差別（第一版就是這樣空轉，
  //   突變測試「退回時不歸零」0 紅才發現）。
  ok("退回之前確實停在別的篩選", OUT_FILTER==="wait");
  outBackAll();
  ok("退回之後不再指定任何人", OUT_WHO==="");
  ok("退回之後篩選也歸零（不然下次點進別人會被上次的篩選綁住）", OUT_FILTER==="all");
  const h=viewOutput();
  ok("退回之後看到的是名單", /onclick="outPick\('/.test(h) && nRows(h)===0); }

// ══════════ ⑥ 翻月份 ══════════
{ reset(SET(), "管理員","boss");
  TEAM_YM=D(-60).slice(0,7);
  const h=viewOutput();
  ok("翻到上上個月：還是停在名單", /onclick="outPick\('/.test(h));
  ok("翻到上上個月：總計是 1 支（阿美那支）", /完成 1 支/.test(h), h.match(/完成 \d+ 支/g));
  outPick("阿美"); setOutFilter("all");
  ok("點進阿美：那個月他有一支", nRows(viewOutput())===1, nRows(viewOutput()));
  outPick("小葵"); setOutFilter("all");
  ok("點進小葵：那個月他沒有東西，講清楚不是壞掉",
     viewOutput().includes("這個月還沒有完成的影片"));
  TEAM_YM=null; }

// ══════════ ⑦ 誰看得到（主管＝管理員，這個系統的用語）══════════
{ reset(SET(), "HR小姐","hr");
  outPick("小葵");
  const h=viewOutput();
  ok("人資點得進去", h.includes("小葵") && nRows(h)===3);
  ok("人資點得到雲端資料夾", nDrive(h)===2, nDrive(h));
  ok("人資是唯讀的：點不開影片編輯視窗", !/editVideo\(|openVideoModal\(/.test(h));

  reset(SET(), "管理員","boss");
  outPick("小葵");
  ok("管理員點得開影片本身", /editVideo\(|openIntlModal\(|openChModal\(/.test(viewOutput()));

  reset(SET(), "小葵","editor");
  ok("剪輯看不到這一頁", !myTabs().some(t=>t[0]==="output") && /只有管理員與人資/.test(viewOutput()));
  reset(SET(), "Regina","manager");
  ok("經理人看不到（跟先前的決定一致）", !myTabs().some(t=>t[0]==="output"));
  reset(SET(), "麗君","cs");
  ok("客服看不到", !myTabs().some(t=>t[0]==="output")); }

// ══════════ ⑧ 不會壞掉 ══════════
{ reset(SET(), "管理員","boss");
  OUT_WHO="離職的人";                          // 名單上已經沒有這個人了
  const h=viewOutput();
  ok("指到一個不存在的人時，退回名單而不是空白", /onclick="outPick\('/.test(h)); }

{ reset(SET(), "管理員","boss");
  const listH=viewOutput(); outPick("小葵"); const detailH=viewOutput();
  ok("兩層都不會寫資料庫（純查詢）",
     !/dbUpdate\(|dbSet\(|saveVideo\(|reviewVid\(|delVid\(|clockIn\(/.test(listH+detailH)); }

console.log(`\nv158（剪輯成效改成點進單一員工）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
