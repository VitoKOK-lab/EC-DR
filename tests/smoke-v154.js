// v153 ②：只在「這一頁真的吃到的資料」變了才重繪。
//
// 量出來的事實：一次同步，全公司每個人都把整頁重畫一遍，但七成畫出來一模一樣。
//   管理員 88 組「分頁×集合」裡 64 組無關（73%）　剪輯 40 組裡 28 組（70%）
//   人資   24 組裡 16 組（67%）　　　　　　　　　客服 16 組裡 12 組（75%）
// 人資整天待在「出勤」（手機重繪一次 2628 毫秒），有人存了一支影片就凍結 2.6 秒，
// 然後畫出一模一樣的東西。
//
// ⚠️ 這支測試在把關的是「TAB_DEPS 有沒有漏寫」。
//    漏寫 ＝ 該更新的畫面沒更新，使用者盯著舊資料而且不會發現 —— 最糟的那種 bug。
//    多寫 ＝ 只是多重繪一次，沒有害處。所以驗的是**超集**：
//    量到的相依必須全部在表裡，表裡多出來的不算錯。
//
// ⚠️ 而且要防「測試空轉」—— smoke-v139 就踩過：樣本資料太薄，把某個集合清空
//    前後畫面都一樣，於是「比對通過」但其實什麼都沒測到。所以下面每一條相依
//    都會反過來確認「這份樣本真的讓那個集合影響到畫面」，不然就當作測試失效。
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
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,300));} }

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const TODAY=D(0);
// 每個集合都要有「真的會影響畫面」的料。薄樣本會讓比對空轉（見開頭的警告）。
function fixture(){
  const users=[{name:"小葵",role:"editor",pwSet:true},{name:"阿哲",role:"editor",pwSet:true},
    {name:"管理員",role:"boss",pwSet:true},{name:"HR小姐",role:"hr",pwSet:true},
    {name:"Regina",role:"manager",pwSet:true},{name:"麗君",role:"cs",pwSet:true},
    {name:"怡萍",role:"pick",pwSet:true},{name:"Anna",role:"intl",pwSet:true}];
  const videos=[];
  for(let i=0;i<12;i++) videos.push({id:"V"+i, code:"C"+i, rawName:"片"+i, name:"", videoCopy:"文案"+i,
    rawLink:"http://raw"+i, driveFolder:"http://d"+i, publishedLink:i<3?"http://pub"+i:"",
    stage:i<6?"已完成":(i<9?"剪輯中":"待處理"),
    // ⚠️ 今天只排 2 支是刻意的。每日目標是 4 支，加上 schedule 那一格排的 V5
    //    才會「差一支就達標」—— 這樣把 schedule 清掉，scheduleGlance 的 runway
    //    才會變、流程中控的畫面才會不一樣。排滿 4 支的話清不清 schedule 都是達標，
    //    那條相依就量不出來（第一版就是這樣空轉的）。
    editor:i<6?"小葵":"", claimedBy:i>=6&&i<9?"阿哲":"", assignedTo:"", scheduledDate:i<2?TODAY:null,
    claimedAt:D(-2)+"T09:00:00", finishedAt:i<6?(TODAY+"T18:00:00"):"", durationMin:90,
    reviewStatus:i<3?"通過":"", locale:"", channel:"", origLang:"", account:"", sourceVideoId:"",
    lib:"", cover:"", remakes:[], tags:["新片"], products:[], usageHistory:[],
    // 平台成效那一頁只讀 metrics —— 沒有這個，那一頁的比對就是空轉的
    metrics:i<3?[{platform:"TikTok",account:"a",views:1000+i,likes:10,comments:1,shares:0}]:[],
    deleted:false, productUrl:i<2?("https://shop/x"+i):""});
  // 影片庫大流：靠 lib="大流" 分出來（DF_LIB 的值是中文，不是 "df" —— 我第一次寫錯，
  // 是上面那條「防空轉」把它抓出來的）
  videos.push({id:"DF1", code:"D1", rawName:"大流舊片", name:"", videoCopy:"大流文案", lib:"大流",
    rawLink:"", driveFolder:"http://df", publishedLink:"", stage:"已上片", editor:"", claimedBy:"",
    assignedTo:"", scheduledDate:TODAY, claimedAt:"", finishedAt:TODAY+"T10:00:00", durationMin:0,
    reviewStatus:"", locale:"", channel:"", origLang:"", account:"", sourceVideoId:"", cover:"",
    remakes:[], tags:[], products:[], usageHistory:[], metrics:[], deleted:false, productUrl:""});
  // 回收桶讀的是 videos 裡 deleted:true 的那些（不是另一個集合）
  videos.push({id:"DEL1", code:"X1", rawName:"刪掉的片", name:"", videoCopy:"", lib:"", rawLink:"",
    driveFolder:"", publishedLink:"", stage:"待處理", editor:"", claimedBy:"", assignedTo:"",
    scheduledDate:null, claimedAt:"", finishedAt:"", durationMin:0, reviewStatus:"", locale:"",
    channel:"", origLang:"", account:"", sourceVideoId:"", cover:"", remakes:[], tags:[],
    products:[], usageHistory:[], metrics:[], deleted:true, deletedBy:"管理員", deletedAt:TODAY+"T13:00:00", productUrl:""});
  const tasks={}; ["小葵","阿哲","麗君","怡萍"].forEach((u,i)=>{
    tasks["T"+i]={id:"T"+i, user:u, date:TODAY, title:"交辦"+i, done:i%2===0, ack:true,
      assignedBy:"管理員", createdAt:TODAY+"T08:0"+i+":00", report:"回報"+i}; });
  const shifts={}; ["小葵","阿哲","麗君"].forEach((u,i)=>{
    shifts[u+"__"+TODAY]={id:u+"__"+TODAY, user:u, date:TODAY, clockIn:TODAY+"T09:0"+i+":00", clockOut:""}; });
  // ⚠️ 排到「本來就沒有預排日的那一支」（V5）。排到 V0 是白搭 —— V0 自己的
  //    scheduledDate 就是今天，dayVideoList 會把兩邊併起來去重，清掉 schedule
  //    畫面也不會變，那條相依就量不出來（第一版就是這樣空轉的）。
  const schedule={}; schedule[TODAY]={slots:[{videoId:"V5", publishedLink:"http://p", by:"小葵", at:TODAY+"T10:00:00"}]};
  return { users, videos, tasks, shifts, schedule,
    products:[{id:"P1",name:"商品一",price:"1000",url:"https://shop/x0"},{id:"P2",name:"商品二",price:"2000",url:"https://shop/x1"}],
    matches:[{id:"M1",videoId:"V0",productId:"P1",by:"怡萍",at:TODAY+"T11:00:00"}],
    logs:[{id:"L1",at:TODAY+"T12:00:00",user:"管理員",role:"boss",action:"測試",target:"x"}],
    settings:{dailyTarget:4, videoTags:["新片"], sources:["自製"], postPlatforms:[{name:"TikTok",utm:"tt"}],
      intlAccounts:[{locale:"en",name:"tiktok-EN"}], shopeeAccounts:["蝦皮店A"], msAccounts:["馬來A"],
      exchangeRates:{}, contacts:["窗口A"], reviewSince:"2020-01-01", ownerName:"Vito"} };
}
const COLLS=["videos","tasks","shifts","schedule","products","matches","logs"];   // users/settings 是全域，不進表
const VIEWS={dashboard:()=>viewDashboard(), flow:()=>viewFlow(), team:()=>viewTeam(), output:()=>viewOutput(),
  attend:()=>viewAttend(), cal:()=>viewCal(), work:()=>viewWork(), videos:()=>viewVideos(),
  videosDF:()=>viewVideosDF(), perf:()=>viewPerf(), match:()=>viewMatch(), log:()=>viewLog(),
  trash:()=>viewTrash(), settings:()=>viewSettings()};
function setup(raw, who, role){
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}),
    loadShiftMonth:async()=>{}, watchVideos:()=>{}, watchLogs:()=>{} };
  LAST_RAW=raw; STATE=decorate(JSON.parse(JSON.stringify(raw)));
  localStorage.setItem("ecdr_user",who); localStorage.setItem("ecdr_role",role);
  VIEW_AS=null; BRAND=""; TEAM_YM=null; OUT_FILTER="all"; OUT_WHO=""; FOLD_OPEN={}; PERF_PLAT="";
}
const ROLES=[["管理員","boss"],["小葵","editor"],["HR小姐","hr"],["麗君","cs"],
             ["Regina","manager"],["怡萍","pick"],["Anna","intl"]];

// ══════════ ① 實測相依，比對 TAB_DEPS 有沒有漏寫 ══════════
{ const measured={};
  ROLES.forEach(([who,role])=>{
    setup(fixture(), who, role);
    myTabs().map(t=>t[0]).filter(t=>VIEWS[t]).forEach(tab=>{
      setup(fixture(), who, role); CUR_TAB=tab;
      let ref; try{ ref=VIEWS[tab](); }catch(e){ ref="ERR:"+e.message; }
      measured[tab]=measured[tab]||new Set();
      COLLS.forEach(c=>{
        const cut=fixture();
        if(Array.isArray(cut[c])) cut[c]=[]; else if(cut[c]&&typeof cut[c]==="object") cut[c]={};
        setup(cut, who, role); CUR_TAB=tab;
        let h; try{ h=VIEWS[tab](); }catch(e){ h="ERR:"+e.message; }
        if(h!==ref) measured[tab].add(c);
      });
    });
  });
  const missing=[];
  Object.keys(measured).forEach(tab=>{
    const declared=TAB_DEPS[tab];
    if(!declared) return;                    // 沒登記＝一律重繪，本來就安全
    [...measured[tab]].forEach(c=>{ if(declared.indexOf(c)<0) missing.push(tab+" 少寫了 "+c); });
  });
  ok("TAB_DEPS 沒有漏寫任何一條實測到的相依（漏寫＝使用者會看到舊資料）",
     missing.length===0, missing);

  // 防空轉：登記在表裡的每一條，這份樣本都要真的量得出來
  const vacuous=[];
  Object.keys(TAB_DEPS).forEach(tab=>{
    if(!measured[tab]) { vacuous.push(tab+" 這一頁根本沒被測到"); return; }
    TAB_DEPS[tab].forEach(c=>{ if(!measured[tab].has(c)) vacuous.push(tab+"→"+c+" 量不出影響"); });
  });
  ok("樣本夠厚：表裡每一條相依都真的量得出來（不然這支測試是空轉的）",
     vacuous.length===0, vacuous);
  console.log("      實測結果：", Object.keys(measured).sort()
    .map(t=>t+"="+JSON.stringify([...measured[t]].sort())).join(" ")); }

// ══════════ ② tabNeedsRender 的判斷 ══════════
{ LAST_RENDER_TAB="team";
  ok("不知道改了什麼 → 照畫", tabNeedsRender("team", undefined)===true);
  ok("空陣列 → 照畫", tabNeedsRender("team", [])===true);
  ok("沒登記的分頁 → 照畫（保守）", tabNeedsRender("match", ["shifts"])===true);
  ok("users 變了 → 一律照畫（職位／名字會變）", tabNeedsRender("videos", ["users"])===true);
  ok("settings 變了 → 一律照畫（語言／標籤會變）", tabNeedsRender("videos", ["settings"])===true);
  ok("出勤：有人打卡 → 要畫", tabNeedsRender("attend", ["shifts"])===true);
  ok("出勤：有人存影片 → 不用畫", tabNeedsRender("attend", ["videos"])===false);
  ok("出勤：有人改交辦 → 不用畫", tabNeedsRender("attend", ["tasks"])===false);
  ok("影片庫：有人打卡 → 不用畫", tabNeedsRender("videos", ["shifts"])===false);
  ok("影片庫：有人存影片 → 要畫", tabNeedsRender("videos", ["videos"])===true);
  ok("團隊看板：打卡／交辦／影片都要畫",
     ["shifts","tasks","videos"].every(c=>tabNeedsRender("team",[c])===true));
  ok("團隊看板：排程變了 → 不用畫", tabNeedsRender("team", ["schedule"])===false);
  ok("一次變好幾個，只要有一個相關就畫", tabNeedsRender("attend", ["videos","tasks","shifts"])===true);
  ok("一次變好幾個，全都不相關就不畫", tabNeedsRender("attend", ["videos","tasks","schedule"])===false);
  LAST_RENDER_TAB=null;
  ok("還沒畫過第一次 → 一定要畫", tabNeedsRender("attend", ["videos"])===true); }

// ══════════ ③ applyState：跳過重繪，但資料一定要是新的 ══════════
{ const raw=fixture();
  setup(raw, "HR小姐", "hr");
  CUR_TAB="attend"; LAST_RENDER_TAB=null;
  let renders=0; const realRender=render;
  render=function(){ renders++; LAST_RENDER_TAB=CUR_TAB; };   // 只數次數，不真的畫
  applyState(raw, ["videos"]);
  ok("第一次一定會畫", renders===1);
  const before=renders;
  const raw2=fixture(); raw2.videos[0].rawName="被別人改掉的片名";
  applyState(raw2, ["videos"]);
  ok("人資在出勤頁，別人存影片 → 不重繪", renders===before, renders);
  ok("——但 STATE 已經是新的（切分頁就看得到）",
     (STATE.videos||[]).some(v=>v.rawName==="被別人改掉的片名"));
  ok("——LAST_RAW 也是新的", LAST_RAW===raw2);
  // 使用者真正在乎的保證：跳過重繪之後，切到那一頁看到的要是新資料。
  // ⚠️ 一定要在這裡驗，不能等到下面套用 raw3 之後 —— raw3 是全新的 fixture()，
  //    會把改過的片名蓋回去，那時候再驗就驗不到東西（第一版就是這樣紅的）。
  { const save=CUR_TAB; CUR_TAB="output";
    // v158：剪輯成效分兩層了，影片名字要點進那個人才看得到。
    // ⚠️ 這裡直接設 OUT_WHO，不能叫 outPick() —— 這一段的 render 被換成計數器了，
    //    outPick 裡面會呼叫 render，下面那條「有人打卡才重繪」就會多算。
    const saveWho=OUT_WHO, saveF=OUT_FILTER; OUT_WHO="小葵"; OUT_FILTER="all";
    ok("跳過重繪之後切到別的分頁，看到的是新資料不是舊的",
       viewOutput().includes("被別人改掉的片名"), viewOutput().slice(0,200));
    OUT_WHO=saveWho; OUT_FILTER=saveF; CUR_TAB=save; }
  const raw3=fixture(); raw3.shifts["新人__"+TODAY]={id:"新人__"+TODAY,user:"新人",date:TODAY,clockIn:TODAY+"T09:00:00",clockOut:""};
  applyState(raw3, ["shifts"]);
  ok("有人打卡 → 出勤頁要重繪", renders===before+1, renders);
  render=realRender; }

// ══════════ ④ fb.js 那頭：每個訂閱都要報上自己是哪個集合 ══════════
{ const calls=[...FB.matchAll(/\bpush\(([^)]*)\)/g)].map(m=>m[1].trim()).filter(s=>s!=="coll");
  const named=calls.filter(s=>/^["'][a-z]+["']$/.test(s)).map(s=>s.replace(/["']/g,""));
  const bare=calls.filter(s=>s==="");
  ok("fb.js 裡每一個 push 都有講是哪個集合（漏講會退回「照畫」，不會出錯但省不到）",
     bare.length===0, {沒講的:bare.length, 有講的:named});
  const KNOWN=["videos","tasks","shifts","schedule","users","settings","products","matches","logs"];
  ok("報上來的名字都是認得的集合", named.every(n=>KNOWN.indexOf(n)>=0), named.filter(n=>KNOWN.indexOf(n)<0));
  ok("app.js 表裡用到的集合，fb.js 都報得出來",
     Object.keys(TAB_DEPS).every(t=>TAB_DEPS[t].every(c=>named.indexOf(c)>=0)),
     Object.keys(TAB_DEPS).map(t=>TAB_DEPS[t].filter(c=>named.indexOf(c)<0)).flat());
  ok("窗口內併起來的變動是累加不是覆蓋（不然會漏）",
     /dirty\[coll\]\s*=\s*1/.test(FB) && /Object\.keys\(dirty\)/.test(FB));
  ok("送出之後要把累積的清掉", /dirty\s*=\s*Object\.create\(null\);/.test(FB.slice(FB.indexOf("function pushNow"))));
  ok("__onState 收得到第二個參數", /window\.__onState\(raw,\s*changed\)/.test(FB)); }

console.log(`\nv153②（不做白工的重繪）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
