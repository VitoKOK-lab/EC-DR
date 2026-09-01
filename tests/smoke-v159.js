// v159：剪輯成效再補兩件 —— ① 顯示時間（不只日期）② 多一格「還在剪」。
//
// ① 為什麼要顯示時刻：實測正式資料，八月完成的 170 支**全部**都有時分，
//    而且 21 點以後完成的有 43 支。只給日期等於把「有人天天做到半夜」這件事
//    藏起來 —— 主管與人資每月檢查時看得到才有意義。晚上 9 點後（或凌晨 6 點前）
//    的時刻另外標顏色。
//
// ② 為什麼要「還在剪」：原本這一頁只列做完的片，所以「有沒有完成」這個問題
//    永遠答「有」—— 沒完成的根本不在名單上。實測正式資料有 28 支還在剪，
//    泓儒一個人 24 支、最久一支 25 天，那正是主管要看到的。
//    沒完成就沒有完成日，所以這一批用**認領日**歸月份。
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
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
// ⚠️ 把「今天」凍在月中（v160）。
//    這支測試的樣本用相對日期（D(-8) 之類），而程式是**按月**分組的 ——
//    真的在月初跑的時候，「8 天前」會掉到上個月，測試就整批變紅。
//    實際發生過：2026-09-01 那天 main 上這幾支全紅，但程式沒有任何問題。
//    所以把 today 凍在 15 號：相對日期不會跨月，測試哪一天跑結果都一樣。
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+String(+FROZEN.slice(8,10)-1).padStart(2,"0");
refreshToday();


let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
const D=(n)=>new Date(new Date(FROZEN+"T12:00:00Z").getTime()+n*864e5).toISOString().slice(0,10);
const TODAY=D(0);
const FAM="https://drive.google.com/drive/folders/FAM";
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"片"+id,videoCopy:"文案",
  rawLink:"http://raw",lib:"",stage:"已完成",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  claimedAt:D(-2)+"T09:00:00",finishedAt:TODAY+"T15:30:00",durationMin:90,publishedLink:"",
  driveFolder:FAM+"-"+id,reviewStatus:"通過",locale:"",channel:"",origLang:"",account:"",
  sourceVideoId:"",cover:"",remakes:[],tags:[],products:[],usageHistory:[],metrics:[],deleted:false},o||{});
// 小葵：2 支做完（一支白天、一支半夜）、3 支還在剪（1 天／9 天／15 天）
// ⚠️ 認領日最多只能往回 14 天 —— today 凍在 15 號，再往回就跨到上個月，
//    而「還在剪」是按認領日分月的，跨月那支就不算這個月了（第一版用 -19 就是這樣紅的）。
//    15 天仍然大於「超過兩週標紅」的門檻，該驗的還是驗得到。
const SET=()=>[
  v_("D1",{editor:"小葵", finishedAt:TODAY+"T15:30:00"}),
  v_("D2",{editor:"小葵", finishedAt:TODAY+"T22:47:00"}),
  v_("W1",{editor:"小葵", stage:"剪輯中", finishedAt:"", claimedAt:TODAY+"T10:00:00"}),
  v_("W2",{editor:"小葵", stage:"剪輯中", finishedAt:"", claimedAt:D(-8)+"T11:20:00"}),
  v_("W3",{editor:"小葵", stage:"剪輯中", finishedAt:"", claimedAt:D(-14)+"T08:05:00", driveFolder:""}),
  v_("Z1",{editor:"阿哲", finishedAt:TODAY+"T09:15:00"}),
];
function reset(videos, who, role){
  modalHTML=""; viewEl.innerHTML=""; OUT_FILTER="all"; OUT_WHO=""; TEAM_YM=null; VIEW_AS=null; BRAND="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}),
    loadShiftMonth:async()=>{} };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"阿哲",role:"editor"},
      {name:"管理員",role:"boss"},{name:"HR小姐",role:"hr"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"管理員"); localStorage.setItem("ecdr_role", role||"boss");
  CUR_TAB="output";
}
const nRows=(h)=>(h.match(/data-label="審核"/g)||[]).length;
const nWip =(h)=>(h.match(/data-label="已經"/g)||[]).length;

// ══════════ ① 顯示時間 ══════════
{ ok("日期＋時刻都畫出來", /15:30/.test(outWhen(TODAY+"T15:30:00")) && /\d\d-\d\d/.test(outWhen(TODAY+"T15:30:00")));
  // ⚠️ 不能用 /:/ 判斷 —— HTML 裡的 style="font-size:12px" 也有冒號（第一版就是這樣紅的）。
  //    要找的是「時:分」那個樣式。
  ok("沒有時刻時只畫日期，不會多出一個假的時間",
     !/\d\d:\d\d/.test(outWhen("2026-08-03")) && /08-03/.test(outWhen("2026-08-03")));
  ok("完全沒有日期時給破折號", /—/.test(outWhen("")) && /—/.test(outWhen(null)));
  ok("晚上 9 點之後標出來", /gold-dk/.test(outWhen(TODAY+"T21:00:00")));
  ok("晚上 10 點多也算", /gold-dk/.test(outWhen(TODAY+"T22:47:00")));
  ok("凌晨也算（做到天亮）", /gold-dk/.test(outWhen(TODAY+"T03:10:00")));
  ok("下午三點半不標", !/gold-dk/.test(outWhen(TODAY+"T15:30:00")));
  ok("晚上 8 點 59 分還不算晚", !/gold-dk/.test(outWhen(TODAY+"T20:59:00")));
  // ⚠️ 這個時刻是「按下完成的時間」，不是工時。查正式資料：八月 21 點後的 43 支
  //    全是同一個人，而且是連發的（23:59:41／43／50／52 四支在 11 秒內）——
  //    那是一次把積著的片按掉，不是剪到半夜。說明文字不能寫成「工作到幾點」，
  //    寫錯會讓主管拿一個假結論去問人。
  ok("標出來的有寫原因（滑過去看得到）", /title="[^"]*9 點/.test(outWhen(TODAY+"T21:00:00")));
  ok("說明講明白這是「按鍵的時間」，不是工時",
     /按「完成」/.test(outWhen(TODAY+"T21:00:00")) && /不代表工時/.test(outWhen(TODAY+"T21:00:00")),
     outWhen(TODAY+"T21:00:00"));
  ok("說明沒有寫成「工作到幾點」這種會被誤讀的話",
     !/工作到|做到/.test(outWhen(TODAY+"T21:00:00"))); }

{ reset(SET(), "管理員","boss");
  outPick("小葵"); setOutFilter("all");
  const h=viewOutput();
  ok("清單上看得到時刻", h.includes("15:30") && h.includes("22:47"));
  ok("半夜完成的那支被標出來", /gold-dk[^>]*>[\s\S]{0,40}22:47/.test(h) || /22:47/.test(h) && /gold-dk/.test(h));
  ok("白天那支沒被標", h.includes("15:30")); }

// ══════════ ② 還在剪 ══════════
{ reset(SET(), "管理員","boss");
  const h=viewOutput();
  ok("名單上多一欄「還在剪」", /還在剪/.test(h));
  ok("小葵有 3 支還在剪", /還在剪 3/.test(h), h.match(/還在剪 \d+/g));
  ok("阿哲沒有還在剪的 → 那一格是破折號", h.includes("阿哲"));
  ok("上面的總計也有還在剪", /還在剪 3/.test(h)); }

{ reset(SET(), "管理員","boss");
  outPick("小葵");
  ok("篩選鈕多一格「還在剪」", /還在剪<\/span> <span class="vtab-n">3</.test(viewOutput()),
     viewOutput().match(/vtab-n">\d+</g));
  ok("第一格改叫「完成」不叫「全部」（因為還在剪的不含在裡面）",
     /完成<\/span> <span class="vtab-n">2</.test(viewOutput()));
  setOutFilter("wip");
  const h=viewOutput();
  ok("切到「還在剪」：三支都在", nWip(h)===3, nWip(h));
  ok("切到「還在剪」：欄位換成認領／已經幾天", /data-label="認領"/.test(h) && /data-label="已經"/.test(h));
  ok("切到「還在剪」：沒有「審核」那一欄（還沒審過怎麼會有狀態）", nRows(h)===0);
  ok("認領時刻看得到", h.includes("10:00") && h.includes("11:20") && h.includes("08:05"));
  ok("已經幾天算得出來", /1 天/.test(h) && /9 天/.test(h) && /15 天/.test(h), h.match(/\d+ 天/g));
  ok("拖最久的排前面", h.indexOf("片W3")<h.indexOf("片W2") && h.indexOf("片W2")<h.indexOf("片W1"));
  ok("拖超過兩週的標紅", /var\(--red\)/.test(h));
  ok("拖一週以上的標金色", /gold-dk/.test(h));
  ok("還在剪的也點得進資料夾（要檢查他做到哪）", (h.match(/rel="noopener noreferrer"/g)||[]).length===2, (h.match(/rel="noopener noreferrer"/g)||[]).length);
  ok("還沒有資料夾的那支講清楚", h.includes("還沒有資料夾")); }

// 還在剪的歸月份是看「認領日」，不是完成日（沒完成就沒有完成日）
{ reset([ v_("OLD",{editor:"小葵", stage:"剪輯中", finishedAt:"", claimedAt:D(-60)+"T09:00:00"}),
          v_("NEW",{editor:"小葵", stage:"剪輯中", finishedAt:"", claimedAt:TODAY+"T09:00:00"}) ], "管理員","boss");
  outPick("小葵"); setOutFilter("wip");
  ok("這個月認領的才算這個月", nWip(viewOutput())===1, nWip(viewOutput()));
  ok("——就是這個月那支", viewOutput().includes("片NEW") && !viewOutput().includes("片OLD"));
  TEAM_YM=D(-60).slice(0,7);
  ok("翻到那個月才看得到上上個月認領的那支", viewOutput().includes("片OLD"));
  TEAM_YM=null; }

// 這張卡自己單獨用的時候（bare=false）也要完整 —— 抬頭要含「還在剪」。
// ⚠️ 沒有這一條的話，outPersonCard 裡算的 c.wip 就沒有人讀，等於死碼，
//    突變測試「明細頁不算還在剪的數量」會 0 紅（第一版就是這樣）。
{ reset(SET(), "管理員","boss");
  const card=outPersonCard({name:"小葵",role:"editor"}, TODAY.slice(0,7));
  ok("單獨用這張卡：抬頭有名字", card.includes("小葵"));
  ok("單獨用這張卡：抬頭有完成數", /完成 2 支/.test(card));
  ok("單獨用這張卡：抬頭也有還在剪", /還在剪 3/.test(card), card.slice(0,400)); }

// 沒有還在剪的人
{ reset(SET(), "管理員","boss");
  outPick("阿哲"); setOutFilter("wip");
  ok("沒有還在剪的片時講清楚，不是空白", viewOutput().includes("沒有還在剪的片")); }

// ══════════ ③ 兩批片不能混在一起算 ══════════
{ reset(SET(), "管理員","boss");
  outPick("小葵"); setOutFilter("all");
  ok("「完成」那格只算做完的兩支", nRows(viewOutput())===2, nRows(viewOutput()));
  ok("上面的總計寫「完成 2 支」", /完成 2 支/.test(viewOutput()));
  ok("上面的總計另外寫「還在剪 3 支」", /還在剪 3 支/.test(viewOutput()));
  setOutFilter("ok");
  ok("「審過」那格也不會混進還在剪的", nRows(viewOutput())===2 && nWip(viewOutput())===0); }

// ══════════ ④ 人資看得到，而且還是唯讀 ══════════
{ reset(SET(), "HR小姐","hr");
  outPick("小葵"); setOutFilter("wip");
  const h=viewOutput();
  ok("人資看得到還在剪的", nWip(h)===3);
  ok("人資點得到那些片的資料夾", (h.match(/rel="noopener noreferrer"/g)||[]).length===2);
  ok("人資還是點不開影片編輯視窗", !/editVideo\(|openVideoModal\(/.test(h)); }

// ══════════ ⑤ 不會壞掉 ══════════
{ reset([ v_("NC",{editor:"小葵", stage:"剪輯中", finishedAt:"", claimedAt:""}) ], "管理員","boss");
  outPick("小葵"); setOutFilter("wip");
  let threw=false; let h=""; try{ h=viewOutput(); }catch(e){ threw=true; }
  ok("沒有認領日的片不會讓畫面爆掉", !threw);
  ok("——而且它不會被算進任何一個月（沒有認領日就歸不了月）", nWip(h)===0, nWip(h));
  ok("outHeldDays 對沒有認領日的回 null", outHeldDays({claimedAt:""})===null); }

console.log(`\nv159（顯示時間＋還在剪）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
