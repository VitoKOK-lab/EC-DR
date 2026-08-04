// v121：畫面上的數字，跟真的列得出來的東西必須一致。
//
// 這類 bug 已經咬過兩次：
//   ① 「未指派 157 支」但清單只畫 20 列（slice(0,20)），連「全選」都只勾得到 20 支
//   ② 海外／蝦皮的「挑來源做版本」清單卡在 200，而舊片已經 274 支 ——
//      第 201 支之後的片，海外同事根本挑不到，畫面上一點提示都沒有
//
// 規則：**要動手處理的清單一律不截斷**。真的要有上限（排行榜、操作紀錄），
// 就一定要在畫面上寫出來，不能默默砍掉。
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
let modalHTML="", viewEl=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=()=>{};

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const T0=D(0), PAST=D(-40);
// 每一種清單都放「超過原本上限」的數量，截斷才抓得到
const N=250;
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"文案",
  rawLink:"http://raw",cover:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  publishTime:"",finishedAt:"",publishedLink:"",driveFolder:"",productUrl:"",note:"",mainType:"",
  source:"老闆自拍",refLink:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",
  tags:[],products:[],usageHistory:[],metrics:[]},o||{});

function reset(){
  modalHTML=""; viewEl.innerHTML="";
  const videos=[], tasks={}, shifts={};
  for(let i=0;i<N;i++){
    // 未指派的毛片（毛片庫存＆指派）
    videos.push(v_("R"+i,{name:"待剪毛片"+i}));
    // 已上片的舊片＝海外／蝦皮挑來源的池子
    videos.push(v_("O"+i,{name:"舊片"+i,stage:"已上片",published:true,publishedLink:"http://p",
      driveFolder:"http://d",scheduledDate:PAST,finishedAt:PAST+"T10:00:00"}));
    // 待審的片（待你審片）
    videos.push(v_("F"+i,{name:"待審"+i,stage:"已完成",editor:"小葵",finishedAt:T0+"T10:00:00"}));
    // 員工發給人資／主管的訊息（同仁來訊）
    tasks["M"+i]={id:"M"+i,kind:"msg",user:"小葵",to:"hr",date:T0,title:"訊息"+i,
      reply:"",replyBy:"",replyAt:"",seen:false,createdAt:T0+"T09:"+String(i%60).padStart(2,"0")+":00"};
    // 人資發出去的通知（自己發過的）
    tasks["N"+i]={id:"N"+i,kind:"notice",user:"小葵",date:T0,title:"通知"+i,ack:false,
      assignedBy:"HR小姐",createdAt:T0+"T09:"+String(i%60).padStart(2,"0")+":00"};
    // 出勤異常（沒打下班卡＝異常）
    // 出勤異常卡只看「當月」，所以日期一律落在這個月（遲到＋沒打下班卡＝異常）
    const d=T0.slice(0,8)+String((i%28)+1).padStart(2,"0");
    shifts["員工"+i+"__"+d]={id:"員工"+i+"__"+d,user:"小葵",date:d,clockIn:d+"T11:30:00",clockOut:""};
  }
  STATE={ users:[{name:"小葵",role:"editor",pwAt:"2020-01-01T00:00:00"},{name:"Anna",role:"intl"},
                 {name:"HR小姐",role:"hr"},{name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["老闆自拍"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"acctEN"}],shopeeAccounts:["蝦皮A"],msAccounts:["馬來A"],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01",workStart:"09:00",workEnd:"18:00",attIssueAsk:true},
    schedule:{}, tasks, shifts, logs:[], deletedVideos:[], videos };
  CUR_TAB=null; VIEW_AS=null; CAL_PLAT="tw"; CAL_YM=null; INTL_CAL_YM=null; INTL_ACCT="acctEN";
  CH_CAL={shopee:{ym:null,acct:"蝦皮A"},ms:{ym:null,acct:""}};
  VID_LANG=""; VID_VIEW="raw"; VID_TAGS=new Set(); VID_Q=""; ZONE_VIEW="tw";
  WORK_ZONE="shopee"; POOL_FILTER="all"; POOL_Q=""; TEAM_GROUP="all"; TEAM_Q="";
  INTL_Q=""; INTL_LIB_LOC="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const count=(h,re)=>(String(h).match(re)||[]).length;
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══════════ ① 毛片庫存＆指派：數字說幾支，就要有幾個勾選框 ══════════
reset(); as("Regina","manager");
{ const f=viewFlow();
  const m=f.match(/未指派 (\d+) 支/);
  const boxes=count(f,/class="afp_vid"/g);
  ok("未指派的數字抓得到", !!m);
  ok(`未指派 ${m&&m[1]} 支 → 清單就有 ${boxes} 個勾選框`, !!m && boxes===+m[1]);
  ok("而且真的超過原本 20 的上限", boxes>20); }

// ══════════ ② 待你審片：折疊上的數字說幾支，就要有幾個審片鍵 ══════════
{ const f=viewFlow();
  const seg=f.split("待你審片")[1]||"";
  const n=(seg.match(/<span class="n">(\d+)<\/span>/)||[])[1];
  const btns=count(seg.split("</details>")[0],/>審片</g);
  ok("待審的數字抓得到", !!n);
  ok(`待審 ${n} 支 → 就有 ${btns} 顆審片鍵`, !!n && btns===+n);
  ok("而且真的超過原本 20 的上限", btns>20); }

// ══════════ ③ 同仁來訊（人資／主管）：說 N 則待回覆，就要有 N 個回覆框 ══════════
reset(); as("HR小姐","hr");
{ const t=viewTeam();
  const m=t.match(/(\d+) 則待回覆/);
  const boxes=count(t,/id="mr_M\d+"/g);
  ok("待回覆的數字抓得到", !!m);
  ok(`${m&&m[1]} 則待回覆 → 就有 ${boxes} 個回覆框`, !!m && boxes===+m[1]);
  ok("而且真的超過原本 20 的上限", boxes>20); }

// ══════════ ④ 出勤異常：說 N 筆還沒說明，就要有 N 列 ══════════
reset(); as("HR小姐","hr");
{ const a=viewAttend();
  const m=a.match(/(\d+) 筆還沒說明/);
  // 人資這張卡是唯讀的（填說明在員工自己的畫面），所以數「尚未說明」那顆標籤
  const rows=count(a,/尚未說明/g);
  ok("還沒說明的數字抓得到", !!m);
  ok(`${m&&m[1]} 筆還沒說明 → 清單就列出 ${rows} 筆`, !!m && rows===+m[1]);
  ok("而且真的超過原本 60 的上限", rows>60); }

// ══════════ ⑤ 找主管／人資說一件事：自己發過的都要看得到 ══════════
reset(); as("小葵","editor");
{ const w=viewWork();
  const mine=myMsgs().length;
  const rows=count(w,/msgDel\('M\d+'\)|msgSeen\('M\d+'\)/g);
  ok(`自己發過 ${mine} 則 → 畫面上就有 ${rows} 則`, rows===mine);
  ok("而且真的超過原本 12 的上限", rows>12); }

// ══════════ ⑥ 挑來源做版本：舊片有幾支就要挑得到幾支 ══════════
// 這個上限（200）現在就在咬人 —— 你的舊片已經 274 支
reset(); as("Anna","intl");
{ const pool=intlSourcePool().length;
  const cards=count(intlLibRows(""),/class="ilib-card"/g);
  ok(`海外的來源清單：來源池 ${pool} 支 → 列出 ${cards} 支`, cards===pool);
  ok("而且真的超過原本 200 的上限", cards>200); }
reset(); as("小葵","editor");
{ const pool=chSourcePool().length;
  const cards=count(chLibRows("shopee"),/class="ilib-card"/g);
  ok(`蝦皮的來源清單：來源池 ${pool} 支 → 列出 ${cards} 支`, cards===pool);
  ok("而且真的超過原本 200 的上限", pool>200); }

// ══════════ ⑦ 真的要有上限的，一定要寫出來 ══════════
reset(); as("管理員","boss");
{ // 操作紀錄：400 筆上限，本來就有寫
  const logs=[]; for(let i=0;i<500;i++) logs.push({id:"L"+i,at:T0+"T09:00:00",user:"小葵",role:"editor",action:"動作"+i,target:"x"});
  STATE.logs=logs;
  ok("操作紀錄超過上限時有講", viewLog().includes("只顯示最近 400 筆")); }
{ // 排行榜：前 50 名，標題要寫
  const p=viewPerf();
  ok("影片排行有寫「前 50 名」", p.includes("影片排行") && p.includes("前 50 名")); }
{ // 同事之間的訊息（主管看）：30 則上限，本來就有寫
  reset(); as("Regina","manager");
  for(let i=0;i<40;i++) STATE.tasks["PP"+i]={id:"PP"+i,kind:"p2p",user:"小葵",from:"Anna",date:T0,
    title:"訊息"+i,ack:true,reply:"好",fromSeen:false,createdAt:T0+"T09:00:00"};
  ok("同事之間的訊息超過上限時有講", p2pWatchCard().includes("只顯示最近 30 則")); }

// ══════════ ⑧ 大量資料下每個畫面都畫得出來（沒有上限之後不能變成畫不動）══════════
reset();
for(const [u,r] of [["小葵","editor"],["Anna","intl"],["HR小姐","hr"],["Regina","manager"],["管理員","boss"]]){
  as(u,r); VIEW_AS=null; CAL_YM=null; CAL_PLAT="tw"; VID_LANG=""; ZONE_VIEW="tw";
  for(const [tab] of myTabs()){
    CUR_TAB=tab;
    const t=Date.now();
    try{ render();
      const ms=Date.now()-t;
      ok(`[${r}] ${tab} 在 ${N*3} 支影片下畫得出來（${ms}ms）`, viewEl.innerHTML.length>40 && ms<3000);
    }catch(e){ ok(`[${r}] ${tab} 畫得出來 → `+e.message, false); }
  }
}

// ══════════ ⑨ 毛片存量：只算真的有毛片的，低於 20 支就要提醒（v121）══════════
// 「有腳本沒毛片」的還不能剪，算進去會讓數字虛胖 —— 老闆截圖上的「157 支」其實
// 有 128 支只有腳本，警戒線因此永遠不會響。
function stockFixture(nWithRaw, nScriptOnly){
  reset(); STATE.videos=[]; STATE.tasks={};
  for(let i=0;i<nWithRaw;i++) STATE.videos.push(v_("RAW"+i,{name:"有毛片"+i,rawLink:"http://raw"}));
  for(let i=0;i<nScriptOnly;i++) STATE.videos.push(v_("SCR"+i,{name:"只有腳本"+i,rawLink:"",videoCopy:"腳本"}));
}
stockFixture(5, 100); as("Regina","manager");
ok("只有腳本的不算毛片存量", rawStock().length===5);
ok("低於 20 支＝存量不足", rawStockLow()===true);
{ const f=viewFlow();
  ok("流程中控寫的是真的毛片數（5 不是 105）", f.includes("5 支毛片"));
  ok("不足時跳紅字提醒老闆去拍片", f.includes("要去拍片了")); }
stockFixture(25, 100); as("Regina","manager");
ok("25 支＝存量足夠", rawStockLow()===false);
ok("足夠時不跳提醒", !viewFlow().includes("要去拍片了"));

// 剪輯也看得到，而且有一顆「提醒老闆拍片」
stockFixture(5, 100); as("小葵","editor");
{ const w=viewWork();
  ok("剪輯看得到毛片快沒了", w.includes("毛片快沒了") && w.includes("5/20"));
  ok("有「提醒老闆拍片」鍵", w.includes("remindBossShoot()")); }
stockFixture(25, 100); as("小葵","editor");
ok("存量夠的時候這張卡不出現（不佔畫面）", !viewWork().includes("毛片快沒了"));
stockFixture(5, 0); as("Anna","intl");
ok("海外不剪台灣毛片，不給他們看這張", lowStockCard()==="");

// 送出提醒：同一天只送一次
stockFixture(5, 0); as("小葵","editor");
{ let wrote=[]; // 只收 tasks —— logA 也走 DB.set，會把操作紀錄一起塞進來
  window.DB.set=async(c,id,rec)=>{ if(c==="tasks"){ wrote.push(rec); STATE.tasks[id]=rec; } };
  remindBossShoot().then(()=>new Promise(r=>setTimeout(r,30))).then(()=>{
    ok("提醒寫進資料庫、收件人是老闆", wrote.length===1 && wrote[0].to==="boss" && wrote[0].topic==="shoot");
    ok("訊息帶了目前剩幾支", wrote[0].title.includes("5 支"));
    const w=viewWork();
    ok("送過之後改顯示「今天已經提醒過了」", w.includes("今天已經提醒過了") && !w.includes("remindBossShoot()"));
    // 老闆在流程中控的「同仁來訊」看得到
    as("管理員","boss");
    ok("老闆看得到這則提醒", viewFlow().includes("要拍片了"));

    // ══════════ ⑩ 上班計畫的卡片順序＝一天的工作順序 ══════════
    reset(); as("小葵","editor");
    { const w2=viewWork();
      // 用各張卡獨有的標記定位（「待認領」在頂部焦點列也出現過一次，不能直接用字串找）
      const at=(t)=>w2.indexOf(t);
      const claimAt=at('id="pool_q"');            // 待認領那張卡的搜尋框
      ok("今天要做的事在待認領前面", at("今天要做的事")>=0 && at("今天要做的事")<claimAt);
      ok("待認領在「建立其他版本」前面", claimAt<at("建立其他版本"));
      ok("少用的（找主管說一件事）排在後面", at("找主管／人資說一件事")>claimAt);
      ok("傳訊息給同事也排在後面", at("傳訊息給同事")>claimAt); }

    // ══════════ ⑪ 「缺什麼」燈號：影片出現在哪，燈號就跟到哪（v122）══════════
    // 一個小燈號直接寫出這支卡在流程的哪一步，不用點進去才知道。
    reset();
    const DD=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
    STATE.videos=[
      v_("LATE",{name:"該上片了",rawLink:"http://raw",videoCopy:"有",scheduledDate:DD(-2),publishedLink:""}),
      v_("NOCOPY",{name:"沒文案",rawLink:"http://raw",videoCopy:"",scheduledDate:DD(3)}),
      v_("MINE",{name:"我在剪的",rawLink:"http://raw",videoCopy:"有",scheduledDate:null,
                 stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:T0+"T09:00:00"}),
    ];
    as("小葵","editor");
    { const w=viewWork();
      ok("上班計畫的「今天要做的事」看得到燈號", w.includes("我在剪的") && w.includes("沒排日期"));
      ok("待認領池也看得到燈號", w.includes("沒文案") && w.includes("缺文案")); }
    { VID_VIEW="raw"; VID_LANG=""; VID_TAGS=new Set(); VID_Q=""; ZONE_VIEW="tw";
      const lib=viewVideos();
      ok("影片庫看得到燈號", lib.includes("misspill"));
      ok("該上片沒貼連結的是紅的", lib.includes("misspill late") && lib.includes("缺上片連結")); }
    as("Regina","manager");
    { modalHTML=""; openDay(DD(-2));
      ok("月排程的日期視窗也看得到燈號", modalHTML.includes("缺上片連結")); }
    // 齊全的片完全不長燈號（不製造雜訊）
    reset(); STATE.videos=[v_("FULL",{name:"什麼都齊",rawLink:"http://raw",videoCopy:"有",
      scheduledDate:DD(-2),publishedLink:"http://p",driveFolder:"http://d",stage:"已上片",published:true})];
    as("小葵","editor"); VID_VIEW="old";
    ok("齊全的片不長燈號", !viewVideos().includes("misspill"));

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail?1:0);
  });
}

