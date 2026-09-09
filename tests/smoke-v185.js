// v185：審核是必要關卡 ＋ 外包人員看不到別人的東西
//
// 老闆：「等 Regina 審 改成『待審』就好。審核過關，他是必要的，要審完才算完成，
//         才能上架。審過才能算成效（所以他算產出，但不算成效）。」
//       「然後陳鋒（原李浩），這是外包的人員，不要讓他看到公司其他人的看板，和成效。」
//
// 「算產出、不算成效」這一條 v184 就已經是這樣做的（剪輯產出那一頁照列全部並拆成
// 審過／還沒審／退回；月成效與熱圖只算審過的）—— 這裡把它釘成一條明講的規矩，
// 以後有人「順手統一」把兩邊改成一樣，測試會擋下來。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,open:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(Object.prototype.hasOwnProperty.call(fields,id)){ const e=el();
      Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
let TOASTS=[], WRITES=[];
eval(src);
toast=(m,e)=>{ TOASTS.push(String(m)); };
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const T0=FROZEN, YM=T0.slice(0,7);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
function as(w,r){ localStorage.setItem("ecdr_user",w); localStorage.setItem("ecdr_role",r); }
const wait=(ms)=>new Promise(r=>setTimeout(r,ms||10));
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"文案",
  rawLink:"https://drive.google.com/drive/folders/RAW",cover:"",stage:"已完成",editor:"陳鋒",claimedBy:"陳鋒",
  assignedTo:"",scheduledDate:T0,publishTime:"15:00",finishedAt:YM+"-10T18:00:00",publishedLink:"",
  driveFolder:"https://drive.google.com/drive/folders/FAM",productUrl:"",note:"",mainType:"",source:"官方IP",
  refLink:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",tags:[],products:[],
  usageHistory:[],metrics:[]},o||{});
function reset(vids, users){
  VIEW_AS=null; BRAND=""; FOLD_OPEN={}; viewEl.innerHTML=""; modalHTML=""; fields={};
  TEAM_GROUP="all"; TEAM_Q=""; TEAM_YM=null; OUT_WHO=""; OUT_FILTER="all";
  TOASTS=[]; WRITES=[];
  global.window.DB={ set:async(c,id,o)=>{WRITES.push(["set",c,id,o]);},
    update:async(c,id,p)=>{WRITES.push(["update",c,id,p]);}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}),
    loadShiftMonth:async()=>{} };
  const raw={ users: users||[{name:"陳鋒",role:"editor",outsourced:true},
                             {name:"小葵",role:"editor"},{name:"小美",role:"cs"},
                             {name:"Regina",role:"manager"},{name:"HR小姐",role:"hr"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:vids||[] };
  LAST_RAW=raw; STATE=decorate(raw);
}

// ══════════ ① 「等 Regina 審」改成「待審」 ══════════
{ reset([ v_("W1",{editor:"小葵",claimedBy:"小葵"}) ]); as("小葵","editor");
  const c=workReviewCard("小葵");
  ok("**寫的是「待審」**", c.includes(">待審<"), (c.match(/pill wa[^>]*>[^<]*/g)||[]).slice(0,3));
  ok("不再寫落落長的「等 Regina 審」", !c.includes("等 Regina 審"));
  ok("剪輯還是沒有審過鍵（v184 那條沒被弄壞）", !c.includes("editorMarkReviewed('W1')")); }

// ══════════ ② 審完才能上架 ══════════
// 老闆：「審核過關，他是必要的，要審完才算完成，才能上架」
{ const V=(o)=>v_("X1",Object.assign({locale:"en"},o));
  ok("**還沒審 → 不給填上片連結**", publishBlocked(V({reviewStatus:""}), "https://tiktok/x")===true);
  ok("**審過了就可以**", publishBlocked(V({reviewStatus:"通過"}), "https://tiktok/x")===false);
  ok("**被退回的也不行**", publishBlocked(V({reviewStatus:"退回"}), "https://tiktok/x")===true);
  ok("沒要填連結就不關這條的事（只是存個文案）", publishBlocked(V({reviewStatus:""}), "")===false);
  // ⚠️ 這一條要用「被退回、但已經上片」來驗才測得到 —— 用 reviewStatus:"" 的話
  //    needsReview() 本來就會因為有連結而回 false，那道防護是重複的、拿掉也看不出差別。
  ok("**已經上片的舊資料不擋**（那是既成事實，擋了連存檔都存不了）",
     publishBlocked(V({reviewStatus:"退回",publishedLink:"https://tiktok/old"}), "https://tiktok/new")===false);
  ok("審核制度上路前的舊片也不擋", (()=>{
     reset(); LAST_RAW.settings.reviewSince="2099-01-01"; STATE=decorate(LAST_RAW);
     return publishBlocked(V({reviewStatus:""}), "https://tiktok/x")===false; })()); }
// 真的存不進去（不是只有函式回 true）
(async()=>{
  reset([ v_("X1",{locale:"en",editor:"Anna",claimedBy:"Anna",reviewStatus:""}) ]);
  as("Anna","intl");
  fields.i_name="t"; fields.i_vcopy="c"; fields.i_pub="https://tiktok/x"; fields.i_date=T0;
  const r=await intlSaveVideo("X1"); await wait();
  ok("**海外版：還沒審就存不進去**", r===false && !WRITES.some(w=>w[1]==="videos"), WRITES.map(w=>w.slice(0,3)));
  ok("而且有講原因（Anna 是海外剪輯，所以是英文）",
     TOASTS.some(t=>t.includes("Regina has to approve")), TOASTS);
  reset([ v_("X1",{locale:"en",editor:"Anna",claimedBy:"Anna",reviewStatus:"通過"}) ]);
  as("Anna","intl");
  fields.i_name="t"; fields.i_vcopy="c"; fields.i_pub="https://tiktok/x"; fields.i_date=T0;
  await intlSaveVideo("X1"); await wait();
  ok("**審過之後就存得進去**", WRITES.some(w=>w[1]==="videos"), WRITES.map(w=>w.slice(0,3)));

  reset([ v_("Y1",{channel:"shopee",editor:"小葵",claimedBy:"小葵",reviewStatus:""}) ]);
  as("小葵","editor");
  fields.shp_name="t"; fields.shp_vcopy="c"; fields.shp_pub="https://shopee/x"; fields.shp_date=T0;
  const r2=await chSaveVideo("shopee","Y1"); await wait();
  ok("**平台版也一樣擋**", r2===false && !WRITES.some(w=>w[1]==="videos"), WRITES.map(w=>w.slice(0,3)));
  ok("中文介面就講中文", TOASTS.some(t=>t.includes("審過才能上架")), TOASTS);

  // ══════════ ③ 算產出、不算成效 ══════════
  // 老闆：「審過才能算成效（所以他算產出，但不算成效）」
  { reset([ v_("A",{editor:"小葵",reviewStatus:"通過"}),
            v_("B",{editor:"小葵",reviewStatus:""}) ]);      // 剪完了，還在等審
    as("管理員","boss");
    ok("**成效只算審過的**", teamMonthStat("小葵",[],YM).count===1, teamMonthStat("小葵",[],YM).count);
    ok("**熱圖也只算審過的**",
       teamHeatData([{name:"小葵",role:"editor"}],YM).rows[0].total===1);
    ok("**產出那一頁照列兩支**（它的重點就是審到哪）",
       outVideosOf("小葵",YM).length===2, outVideosOf("小葵",YM).length);
    const h=viewOutput();
    ok("**而且拆得出審過幾支、還沒審幾支**", /審過 1/.test(h) && /還沒審 1/.test(h),
       (h.match(/(審過|還沒審|退回) \d+/g)||[])); }

  // ══════════ ④ 外包人員看不到別人的看板與成效 ══════════
  // 老闆：「陳鋒（原李浩），這是外包的人員，不要讓他看到公司其他人的看板，和成效」
  { reset([ v_("A",{editor:"小葵",reviewStatus:"通過"}) ]);
    as("陳鋒","editor");
    ok("認得出他是外包", isOutsourced()===true && isOutsourced("陳鋒")===true);
    ok("一般同仁不是", isOutsourced("小葵")===false);
    const b=viewBoard();
    ok("**看不到「大家今天」**", !b.includes("大家今天"), b.slice(0,120));
    ok("**看不到別人的名字**", !b.includes("小葵") && !b.includes("小美"),
       {小葵:b.includes("小葵"), 小美:b.includes("小美")});
    ok("**看不到月成效／熱圖／逐人統計**",
       !b.includes("本月成效") && !b.includes("每天完成上片") && !b.includes("看圖表與逐人統計"));
    ok("**但自己那一張還在**", b.includes("我今天") && b.includes("陳鋒"));
    ok("**自己的出勤也還在**", b.includes("我的出勤"));
    ok("有講一句為什麼（不要讓他以為壞掉）", b.includes("外包")); }
  { reset([ v_("A",{editor:"小葵",reviewStatus:"通過"}) ]);
    as("小葵","editor");
    const b=viewBoard();
    ok("（對照）一般同仁照樣看得到全員", b.includes("大家今天") && b.includes("陳鋒"));
    ok("（對照）一般同仁照樣看得到月成效", b.includes("本月成效")); }
  { reset([], [{name:"陳鋒",role:"editor",outsourced:true},{name:"Regina",role:"manager"}]);
    as("Regina","manager");
    const b=viewBoard();
    ok("主管照樣看得到外包人員那張卡（他要管他）", b.includes("陳鋒")); }
  // 旗標是可以在設定裡勾的，不是把名字寫死
  { reset(); as("管理員","boss");
    const st=viewSettings();
    ok("**成員管理有「外包」這一欄**", st.includes(">外包</th>") || st.includes("外包</th>"), st.includes("外包"));
    ok("**每個同仁都勾得起來**", /setMemberOutsourced\('陳鋒',this\.checked\)/.test(st));
    ok("陳鋒那一格是勾起來的", /value="陳鋒"|陳鋒/.test(st) && st.includes("checked"));
    ok("管理層那一列不給勾（他們不可能是外包）",
       (st.match(/setMemberOutsourced/g)||[]).length===3, (st.match(/setMemberOutsourced/g)||[]).length);
    // ⚠️ 只看**畫出來的字**，不看註解 —— 註解裡引用了老闆原話，那不是寫死的邏輯。
    const code=APP.split("\n").filter(l=>!/^\s*(\/\/|\*)/.test(l)).join("\n");
    ok("**程式邏輯裡沒有把名字寫死**", !/陳鋒/.test(code) && !/李浩/.test(code),
       (code.match(/.{0,40}(陳鋒|李浩).{0,40}/)||[])[0]); }
  // 寫入真的存得進去（白名單漏了的話會「勾了沒反應」而且完全沒有錯誤訊息）
  { reset(); as("管理員","boss");
    setMemberOutsourced("陳鋒", true);
    await wait(20);
    const w=WRITES.find(x=>x[1]==="users"&&x[2]==="陳鋒");
    ok("**勾了真的寫得進去**（route 的白名單有收這個欄位）",
       !!w && w[3].outsourced===true, w&&w[3]); }

  // ══════════ ⑤ 月排程的倒數提示 ══════════
  // 老闆：「審完才能上架，會在月排程出現提示，他依然能夠先排程，但沒有審在前一天
  //         在月排程會出現提示（還沒剪好，要在二天前提示，還沒審要在一天前）」
  { const D=(n)=>new Date(new Date(T0+"T12:00:00Z").getTime()+n*864e5).toISOString().slice(0,10);
    const cut=(o)=>v_("C1",Object.assign({stage:"剪輯中",finishedAt:""},o));   // 還沒剪好
    const rev=(o)=>v_("R1",Object.assign({stage:"已完成",reviewStatus:""},o));  // 剪好沒審
    ok("**還沒剪好：三天前還不吵**", calWarn(cut({scheduledDate:D(3)}))===null);
    ok("**還沒剪好：兩天前開始提示**", (calWarn(cut({scheduledDate:D(2)}))||{}).zh==="還沒剪好");
    ok("前一天當然也提示", (calWarn(cut({scheduledDate:D(1)}))||{}).zh==="還沒剪好");
    ok("**過期了改成紅字**", (calWarn(cut({scheduledDate:D(-1)}))||{}).late===true);
    ok("**還沒審：兩天前還不吵**（審一支是幾分鐘的事）",
       calWarn(rev({scheduledDate:D(2)}))===null);
    ok("**還沒審：前一天才提示**", (calWarn(rev({scheduledDate:D(1)}))||{}).zh==="還沒審");
    ok("**審過了就不吵了**",
       calWarn(rev({scheduledDate:D(1),reviewStatus:"通過"}))===null);
    ok("已經上片的不吵", calWarn(rev({scheduledDate:D(1),publishedLink:"https://x"}))===null);
    ok("沒排日期的不吵", calWarn(cut({scheduledDate:null}))===null);
    ok("**兩種提前量是分開的，不是同一個數字**", CAL_WARN_CUT===2 && CAL_WARN_REVIEW===1,
       {剪:CAL_WARN_CUT, 審:CAL_WARN_REVIEW}); }
  // 真的畫在月排程上（清單檢視、某一天的視窗、月曆格子三個地方）
  { const D=(n)=>new Date(new Date(T0+"T12:00:00Z").getTime()+n*864e5).toISOString().slice(0,10);
    reset([ v_("R1",{editor:"小葵",claimedBy:"小葵",stage:"已完成",reviewStatus:"",
                     scheduledDate:D(1),name:"明天要上的片"}) ]);
    as("Regina","manager"); CAL_YM=null; CAL_PLAT="tw";
    CAL_MODE="list";
    const li=viewCal();
    ok("**清單檢視看得到提示**", li.includes("還沒審") && li.includes("明天要上的片"),
       (li.match(/pill (wa|em)[^>]*>[^<]*/g)||[]).slice(0,3));
    CAL_MODE="grid";
    const g=viewCal();
    ok("**月曆格子上有角標**（點進去才知道等於沒提醒）", /class="calwarn/.test(g),
       (g.match(/calwarn[^>]*>[^<]*/g)||[]).slice(0,3));
    ok("**而且 CSS 真的有這個樣式**（class 名字對不上＝畫了也看不見）",
       /\.calwarn\{/.test(HTML) && /\.calwarn\.late\{/.test(HTML),
       (HTML.match(/\.calwarn[^{]*\{/g)||[]));
    openDay(D(1));
    ok("**點開那一天也看得到**", modalHTML.includes("還沒審"));
    ok("**但照樣排得動**（提示不是擋）", modalHTML.includes("rescheduleVid")); }
  { const D=(n)=>new Date(new Date(T0+"T12:00:00Z").getTime()+n*864e5).toISOString().slice(0,10);
    reset([ v_("OK1",{editor:"小葵",claimedBy:"小葵",stage:"已完成",reviewStatus:"通過",
                      scheduledDate:D(1),name:"審過的片"}) ]);
    as("Regina","manager"); CAL_YM=null; CAL_MODE="grid";
    ok("（對照）審過的那天不會亮角標", !/class="calwarn/.test(viewCal()));
    CAL_MODE="grid"; }

  // ══════════ ⑥ 沒有把別的弄壞 ══════════
  { let bad=null;
    [["管理員","boss"],["Regina","manager"],["HR小姐","hr"],["小葵","editor"],["陳鋒","editor"],["小美","cs"]]
      .forEach(([w,r])=>{ reset([ v_("A",{editor:"小葵",reviewStatus:"通過"}) ]); as(w,r);
        myTabs().forEach(t=>{ CUR_TAB=t[0]; CAL_YM=null;
          try{ render(); }catch(e){ bad=w+"/"+t[0]+": "+e.message; } }); });
    ok("六種身分、每一個分頁都畫得出來", !bad, bad); }

  console.log(`\nv185（待審・審完才能上架・外包看不到別人）: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
