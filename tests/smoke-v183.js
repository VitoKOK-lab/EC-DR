// v183：真的把四套訊息併成一套（前一版只是「多開了一頁」）
//
// 老闆：「你就新增了溝通，為什麼每日工作裡又有溝通，還有找主管，找人資，
//         傳訊息給同事，這不是說好要整合在一起嗎? 找主管，找hr也是一種溝通呀，
//         全部移到溝通去，另外把「溝通」名字改成「傳訊息」，然後有人傳訊給你，
//         「傳訊息」會有小紅點提醒。」
//       「每日工作，如果是 regina 和 hr 傳的會出現一條在每日工作現在的地方，
//         但要回覆，溝通還是要跳回聊天室」
//       「『交辦一件事給同事』，這句話改成『傳訊息』。交辦內容改成『訊息內容』，
//         附圖片的按鍵與訊息內容要同一行，然後訊息這個是多行訊息，平常只顯示一行，
//         多行要自動打開。對接窗口先移除，都不用了。」
//       「員工的『我的出勤』應該和看板放在一起吧。」
//       「看板的部份，先出現，我今天、我的出勤，然後下面還是把全員的都帶進來
//         （所有人預設統一大小，才會整齊，每人預設4行，如果有人太多，不需要文字說明，
//         點擊會自動打開看全部，再點一次就縮回來）」
//       「regina的對話，如果完成要有 完成可以按，沒有看見」
//       「要改成 vito」「管理員就好」
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,scrollHeight:0,clientHeight:0,rows:1,title:"",
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, navBtns=[];
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(id==="nav"){ const n=el(); n.appendChild=(b)=>navBtns.push(b);
      Object.defineProperty(n,"innerHTML",{set(){navBtns.length=0;},get(){return "";}}); return n; }
    if(Object.prototype.hasOwnProperty.call(fields,id)){ const e=el();
      Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},
  createElement:()=>{ const e=el(); e.appendChild=(c)=>{ e.__kids=(e.__kids||[]).concat([c]); }; return e; },
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:390,innerHeight:844,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
let writes=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const T0=FROZEN, OLD=FROZEN.slice(0,8)+"01";

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
function as(w,r){ localStorage.setItem("ecdr_user",w); localStorage.setItem("ecdr_role",r); }
const wait=(ms)=>new Promise(r=>setTimeout(r,ms||10));

// 交辦（主管派的）／同事訊息／找主管說一件事，三種各一筆
const t_=(id,o)=>Object.assign({id,user:"小葵",date:T0,title:"做一件事",report:"",done:false,
  assignedBy:"Regina",ack:false,createdAt:T0+"T09:00:00",msgs:[]},o||{});
const p_=(id,o)=>Object.assign({id,kind:"p2p",user:"小美",from:"小葵",date:T0,title:"同事的話",
  ack:false,reply:"",fromSeen:false,createdAt:T0+"T09:00:00",msgs:[]},o||{});
const m_=(id,o)=>Object.assign({id,kind:"msg",user:"小葵",to:"hr",date:T0,title:"想請假",
  reply:"",replyBy:"",replyAt:"",seen:false,createdAt:T0+"T09:00:00"},o||{});

function reset(tasks){
  VIEW_AS=null; BRAND=""; FOLD_OPEN={}; viewEl.innerHTML=""; modalHTML=""; CAL_YM=null;
  COMM_TAB="open"; COMM_OPEN=""; ASG_TRACK="open"; TEAM_GROUP="all"; TEAM_Q="";
  fields={}; writes=[]; toasts=[]; navBtns=[];
  global.window.DB={ set:async(c,id,o)=>{writes.push(["set",c,id,o]);},
    update:async(c,id,p)=>{writes.push(["update",c,id,p]);}, del:async(c,id)=>{writes.push(["del",c,id]);},
    scheduleSet:async()=>{}, setSettings:async()=>{}, videosWatched:()=>true,
    netState:()=>({online:true,pending:false}) };
  const t={}; (tasks||[]).forEach(x=>t[x.id]=x);
  const raw={ users:[{name:"小葵",role:"editor"},{name:"阿明",role:"editor"},{name:"小美",role:"cs"},
                     {name:"Anna",role:"intl"},{name:"HR小姐",role:"hr"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:t, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
}

// ══════════ ① 每日工作上，訊息類的東西一張都不留 ══════════
// 這是老闆這一輪最主要的抱怨：「為什麼每日工作裡又有溝通」
{ reset([t_("T1",{ack:true}), p_("P1",{user:"小葵",from:"小美"}), m_("M1")]);
  ["editor","cs"].forEach(r=>{ as(r==="cs"?"小美":"小葵", r); reset([t_("T1",{ack:true,user:r==="cs"?"小美":"小葵"}),
      p_("P1",{user:r==="cs"?"小美":"小葵",from:"阿明"}), m_("M1",{user:r==="cs"?"小美":"小葵"})]);
    const w=viewWork();
    ok(`[${r}] **每日工作沒有「找主管／人資說一件事」**`, !w.includes("找主管／人資說一件事"), w.slice(0,120));
    ok(`[${r}] **沒有「傳訊息給同事」那張折疊**`, !w.includes("傳訊息給同事"));
    ok(`[${r}] **沒有「同事來訊」收件匣**`, !w.includes("同事來訊"));
    ok(`[${r}] **沒有交辦卡**（勾選清單整個不在這一頁）`, !/class="asg_p"/.test(w));
    ok(`[${r}] **沒有交辦追蹤**`, !w.includes("交辦追蹤"));
    ok(`[${r}] **沒有「我的出勤」**（搬到看板了）`, !w.includes("我的出勤"));
  }); }

// ══════════ ② 五張全部在「傳訊息」找得到 ══════════
{ reset([t_("T1",{ack:true}), p_("P1",{user:"小葵",from:"小美"}), m_("M1")]);
  as("小葵","editor");
  const c=viewChat();
  ok("**傳訊息上有交辦卡**", /class="asg_p"/.test(c));
  ok("**有交辦追蹤**", c.includes("交辦追蹤"));
  ok("**有草稿夾**", c.includes("我的草稿"));
  ok("**三種訊息排在同一份清單裡**",
     c.includes("做一件事") && c.includes("同事的話") && c.includes("想請假"),
     {交辦:c.includes("做一件事"), 同事:c.includes("同事的話"), 找主管:c.includes("想請假")}); }

// ══════════ ③ 名字改成「傳訊息」 ══════════
{ reset(); as("小葵","editor");
  ok("**分頁叫「傳訊息」，不叫「溝通」**",
     myTabs()[0][0]==="chat" && myTabs()[0][1]==="傳訊息", myTabs()[0]);
  ok("頁面大標題也是「傳訊息」", /<h2>傳訊息<\/h2>/.test(viewChat()),
     (viewChat().match(/<h2>[^<]*<\/h2>/)||[])[0]);
  ok("卡片標題也改了（本來是「交辦一件事給同事」）",
     viewChat().includes(">傳訊息<") && !viewChat().includes("交辦一件事給同事"));
  as("Anna","intl");
  ok("海外還是 Messages", myTabs()[0][1]==="Messages" && /<h2>Messages<\/h2>/.test(viewChat())); }

// ══════════ ④ 有人傳訊給你 → 導覽列小紅點 ══════════
{ reset(); as("小葵","editor"); buildNav();
  ok("沒人找你就沒有紅點", commUnread()===0
     && !navBtns.some(b=>(b.__kids||[]).some(k=>k.className==="navdot")), commUnread());
  reset([p_("P1",{user:"小葵",from:"小美"})]); as("小葵","editor"); buildNav();
  ok("**有人傳訊給你 → 紅點出現，而且寫著 1**", (()=>{
     const chat=navBtns.find(b=>b.dataset.tab==="chat");
     const dot=((chat&&chat.__kids)||[]).find(k=>k.className==="navdot");
     return commUnread()===1 && !!dot && dot.textContent==="1"; })(),
     {數:commUnread(), 鍵:navBtns.map(b=>b.dataset.tab)});
  ok("紅點只掛在「傳訊息」那一顆上", (()=>{
     return navBtns.filter(b=>((b.__kids||[]).some(k=>k.className==="navdot"))).every(b=>b.dataset.tab==="chat"); })());
  reset([p_("P1",{user:"小葵",from:"小美"}), p_("P2",{user:"小葵",from:"阿明"}),
         t_("T1",{user:"小葵",assignedBy:"Regina"})]);
  as("小葵","editor"); buildNav();
  ok("**三則就寫 3**（不是只有一個點，看不出幾則）", (()=>{
     const chat=navBtns.find(b=>b.dataset.tab==="chat");
     const dot=((chat&&chat.__kids)||[]).find(k=>k.className==="navdot");
     return !!dot && dot.textContent==="3"; })(), commUnread());
  ok("這個數字跟「傳訊息」頁最上面那個「等你處理」是同一個", (()=>{
     const c=viewChat(); const m=c.match(/class="fn warn">(\d+)</);
     return !!m && +m[1]===commUnread(); })());
  ok("CSS 裡真的有 .navdot（不然畫不出來）", /\.navdot\{/.test(HTML)); }
// 收到的看完了就不再催
{ reset([p_("P1",{user:"小葵",from:"小美",ack:true,fromSeen:true})]);
  as("小葵","editor");
  ok("按過收到就不再亮紅點", commUnread()===0, commUnread()); }

// ══════════ ⑤ 每日工作只留一條，回覆跳回聊天室 ══════════
{ reset([t_("T1",{ack:true,assignedBy:"Regina"})]); as("小葵","editor");
  const w=viewWork();
  ok("**交辦來的那一條還在每日工作上**", w.includes("做一件事"));
  ok("**寫得出是誰派的**", w.includes("交辦 Regina"), (w.match(/交辦 [^<・]*/)||[])[0]);
  ok("**有一顆「回覆」跳到聊天室**", w.includes("gotoComm('T1')"));
  ok("**留言串不畫在這一頁**（兩邊都畫就是老闆說的重複）", !w.includes("postTaskMsg('T1')"));
  ok("聊天室那一頭才有完整的留言串", viewChat().includes("postTaskMsg('T1')"));
  // 自己排給自己的沒有對象可以講話，維持原本的回報框
  reset([{id:"S1",user:"小葵",date:T0,title:"自己排的",report:"",done:false,ack:true,createdAt:T0+"T09:00:00"}]);
  as("小葵","editor");
  const w2=viewWork();
  ok("自己排的還是回報框，不會冒出回覆鍵", /id="tr_S1"/.test(w2) && !w2.includes("gotoComm('S1')")); }
// gotoComm 真的會跳過去、而且把那一則打開
{ reset([t_("T1",{ack:true})]); as("小葵","editor");
  CUR_TAB="work"; gotoComm("T1");
  ok("**按了會跳到傳訊息那一頁**", CUR_TAB==="chat", CUR_TAB);
  ok("**而且那一則是打開的**", /<details id="comm_T1"[^>]*\sopen>/.test(viewChat()),
     (viewChat().match(/<details id="comm_T1"[^>]*>/)||[])[0]);
  ok("其他則維持收合", COMM_OPEN==="T1"); }
{ reset([t_("T1",{ack:true,done:true,archived:true,archivedAt:T0+"T11:00:00"})]);
  as("小葵","editor"); gotoComm("T1");
  ok("**已收起來的也跳得到**（跳去「已完成」那一頁）", COMM_TAB==="done" && viewChat().includes("做一件事"),
     COMM_TAB); }

// ══════════ ⑥ 清單分成 今日新增／進行中／已完成 ══════════
{ reset([t_("T1",{ack:true}),
         t_("T2",{ack:true,createdAt:OLD+"T09:00:00",date:OLD}),
         t_("T3",{ack:true,done:true,archived:true,archivedAt:T0+"T11:00:00",createdAt:OLD+"T09:00:00",date:OLD})]);
  as("小葵","editor");
  const c=viewChat();
  ok("**三個分頁的名字就是老闆指定的那三個**",
     c.includes(">今日新增<") && c.includes(">進行中<") && c.includes(">已完成<"),
     (c.match(/<span>[^<]*<\/span>/g)||[]).slice(0,4));
  // 只看「我的對話」那一排分頁 —— 交辦追蹤自己也有一排（還沒收／已封存／全部），
  // 拿整頁去比會誤判成沒改到。
  { const bar=(c.match(/<div class="vtabs"[\s\S]*?<\/div>/)||[])[0]||"";
    ok("**沒有舊的「已收起」「全部」**", !bar.includes(">已收起<") && !bar.includes(">全部<"), bar); }
  COMM_TAB="new"; const cn=viewChat();
  ok("今日新增：只有今天建立的", cn.split('class="commrow')[1]!==undefined
     && (cn.match(/id="comm_T1"/g)||[]).length===1 && !cn.includes('id="comm_T2"'),
     {T1:cn.includes('id="comm_T1"'), T2:cn.includes('id="comm_T2"')});
  COMM_TAB="open"; const co=viewChat();
  ok("進行中：沒收起來的都在（含以前建的）",
     co.includes('id="comm_T1"') && co.includes('id="comm_T2"') && !co.includes('id="comm_T3"'));
  COMM_TAB="done"; const cd=viewChat();
  ok("已完成：只有按過 OK 收起來的",
     cd.includes('id="comm_T3"') && !cd.includes('id="comm_T1"')); }

// ══════════ ⑦ 完成鍵要看得見（老闆：「沒有看見」） ══════════
{ reset([t_("T1",{ack:true,done:true,doneAt:T0+"T10:00:00"})]); as("Regina","manager");
  const c=viewChat();
  ok("**對方回報完成 → 那顆鍵是實心的、而且寫「完成」**",
     /class="btn sm commok on"/.test(c) && />完成</.test(c), (c.match(/commok[^>]*/g)||[]));
  ok("**點開之後也有一顆**（不用回頭去那一行的最右邊找）",
     c.includes("完成，收起來") && /archiveTask\('T1',true\)/.test(c));
  ok("CSS 裡有 .commok.on（不然還是淡的）", /\.commok\.on\{/.test(HTML)); }
{ reset([t_("T1",{ack:true,done:false})]); as("Regina","manager");
  const c=viewChat();
  ok("還沒回報完成的維持淡的（那時候它不是重點）",
     /class="btn sm commok"/.test(c) && !/commok on/.test(c) && />OK</.test(c)); }
{ reset([t_("T1",{ack:true,done:true,doneAt:T0+"T10:00:00"})]); as("小葵","editor");
  ok("**收到的人還是沒有那顆鍵**（不能自己把別人派的事收掉）", !/commok/.test(viewChat())); }
// 員工視角是唯讀，但按鍵要畫出來（不然預覽看起來像功能不見了）
{ reset([t_("T1",{ack:true,done:true,doneAt:T0+"T10:00:00"})]);
  as("Regina","manager"); VIEW_AS="Regina";
  const c=viewChat();
  ok("**員工視角看得到那顆鍵，但按不動**", /commok/.test(c) && /commok[^>]*disabled/.test(c),
     (c.match(/commok[^>]*/g)||[]));
  ok("而且真的不會寫入", !/archiveTask\('T1',true\)/.test(c));
  VIEW_AS=null; }

// ══════════ ⑧ 訊息框：多行、跟附圖同一行、沒有對接窗口 ══════════
{ reset(); as("小葵","editor");
  const c=dashAssignTaskCard({title:"傳訊息"});
  ok("**訊息框是多行的 textarea**", /<textarea id="asg_txt"/.test(c),
     (c.match(/<(input|textarea) id="asg_txt"[^>]*/)||[])[0]);
  ok("**平常只有一行**（rows=1）", /<textarea id="asg_txt" rows="1"/.test(c));
  ok("**打到第二行會自己長高**", /oninput="asgGrow\(this\)"/.test(c) && typeof asgGrow==="function");
  ok("**附圖鍵跟訊息框在同一行**", (()=>{
     const box=(c.match(/<div class="asgmsg">[\s\S]*?<\/div>/)||[])[0]||"";
     return box.includes('id="asg_txt"') && box.includes('id="asg_pic_btn"'); })(),
     (c.match(/<div class="asgmsg">[\s\S]*?<\/div>/)||[])[0]);
  ok("CSS 裡有 .asgmsg 這一行的排法", /\.asgmsg\{/.test(HTML) && /\.asgmsg>textarea\{/.test(HTML));
  ok("**標題改成「訊息內容」**", c.includes("訊息內容") && !c.includes("交辦內容"));
  ok("**對接窗口整欄不見了**", !c.includes("asg_contact") && !c.includes("對接窗口"));
  ok("**新增工作那一列的對接窗口也拿掉了**", !viewWork().includes("wp_contact")); }
// 送出去的東西不會因為換成 textarea 就壞掉
(async()=>{
  reset(); as("Regina","manager");
  asgPicked=()=>["小葵"]; fields.asg_txt="這件事下週前處理完";
  await assignTaskSel(); await wait();
  { const w=writes.find(x=>x[0]==="set");
    ok("送得出去，而且內容有存進去", !!w && w[3].title==="這件事下週前處理完", w&&w[3]);
    ok("**contact 存成空字串，不是 undefined**（undefined 會讓 Firestore 整筆丟掉）",
       !!w && w[3].contact==="", w&&w[3].contact); }

  // ══════════ ⑨ 找主管／找人資＝在同一張卡上把他勾起來 ══════════
  reset(); as("小葵","editor");
  { const c=dashAssignTaskCard({title:"傳訊息"});
    ok("**名單上有人資**", c.includes('value="HR小姐"'));
    ok("**名單上有經理人**", c.includes('value="Regina"'));
    ok("**名單上有管理員**（他沒有員工卡，本來永遠選不到）", c.includes('value="管理員"'));
    ok("管理員在畫面上寫的是 Vito", c.includes(">Vito<"), (c.match(/>Vito</g)||[]).length);
    ok("自己還是不在名單上", !c.includes('value="小葵"')); }
  reset(); as("管理員","boss");
  ok("管理員自己的名單上沒有他自己", !dashAssignTaskCard().includes('value="管理員"'));
  reset(); as("小葵","editor");
  asgPicked=()=>["HR小姐"]; fields.asg_txt="我下週三想請假";
  await assignTaskSel(); await wait();
  { const w=writes.find(x=>x[0]==="set");
    ok("**員工發給人資 → 是訊息，不會變成人資的工作**",
       !!w && w[3].kind==="p2p" && !w[3].assignedBy && w[3].user==="HR小姐", w&&w[3]); }
  reset(); as("HR小姐","hr");
  asgPicked=()=>["小葵"]; fields.asg_txt="月底前補交健檢報告";
  await assignTaskSel(); await wait();
  { const w=writes.find(x=>x[0]==="set");
    ok("**人資發給員工 → 是交辦，會進他的每日工作**",
       !!w && !w[3].kind && w[3].assignedBy==="HR小姐", w&&w[3]); }

  // ══════════ ⑩ 管理員顯示成 Vito，資料庫照舊寫「管理員」 ══════════
  ok("dispName 只換顯示", dispName("管理員")==="Vito" && dispName("小葵")==="小葵");
  ok("**識別字串沒有被改掉**（改掉的話幾百筆舊紀錄會變成另一個人的）",
     ADMIN_NAME==="管理員" && /const ADMIN_NAME = "管理員"/.test(APP));
  reset([t_("T1",{assignedBy:"管理員",ack:true})]); as("小葵","editor");
  { const w=viewWork();
    ok("**員工看到的是「交辦 Vito」**", w.includes("交辦 Vito") && !w.includes("交辦 管理員"),
       (w.match(/交辦 [^<・]*/)||[])[0]);
    const c=viewChat();
    ok("聊天室裡的人名也是 Vito", c.includes(">Vito<") && !/pchip[^>]*>管理員</.test(c)); }
  reset(); as("管理員","boss");
  ok("職稱那一欄還是「管理員」（老闆：「管理員就好」）", ROLE_LABEL.boss==="管理員");
  { let shown=""; const _g=document.getElementById;
    document.getElementById=(id)=>{ const e=_g(id);
      if(id==="whoName"){ Object.defineProperty(e,"textContent",{set(v){shown=v;},get(){return shown;}}); }
      return e; };
    applyState(LAST_RAW); document.getElementById=_g;
    ok("**頂列寫的是 Vito**", shown==="Vito", shown); }

  // ══════════ ⑪ 看板：我今天 → 我的出勤 → 大家今天 ══════════
  reset(); as("小葵","editor");
  { const b=viewBoard();
    const i1=b.indexOf("我今天"), i2=b.indexOf("我的出勤"), i3=b.indexOf("大家今天");
    ok("**三段都在**", i1>=0 && i2>=0 && i3>=0, {我今天:i1, 我的出勤:i2, 大家今天:i3});
    ok("**順序就是：我今天 → 我的出勤 → 大家今天**", i1<i2 && i2<i3, {i1,i2,i3});
    const mePart=b.slice(i1,i3);
    ok("「我今天」那一段只有自己", mePart.includes("小葵") && !mePart.includes("阿明"));
    const i4=b.search(/本月成效|月成效/);
    const allPart=b.slice(i3, i4>i3?i4:b.length);
    ok("**「大家今天」把全員都帶進來**", ["小葵","阿明","小美","Anna"].every(n=>allPart.includes(n)),
       ["小葵","阿明","小美","Anna"].filter(n=>!allPart.includes(n)));
    ok("**每一張都套同一個外框（統一大小）**",
       (allPart.match(/class="tdclamp"/g)||[]).length===(allPart.match(/class="card"/g)||[]).length
       && (allPart.match(/class="tdclamp"/g)||[]).length>=4,
       {外框:(allPart.match(/class="tdclamp"/g)||[]).length, 卡片:(allPart.match(/class="card"/g)||[]).length});
    ok("**自己那一張不套**（它就是要完整看到的）",
       !b.slice(i1,i2).includes("tdclamp"), b.slice(i1,i2).slice(0,150)); }
  // ⚠️ 一定要是 height，不能是 max-height —— max-height 只擋高的，矮的還是矮，
  //    排出來一格高一格矮，那就不是「統一大小」了。
  ok("**CSS 用固定 height（不是 max-height）**",
     /\.tdclamp\{[^}]*[^-]height:\d+px/.test(HTML) && !/\.tdclamp\{[^}]*max-height/.test(HTML),
     (HTML.match(/\.tdclamp\{[^}]*\}/)||[])[0]);
  ok("裡面那張卡也撐滿（不然矮的會露出一塊空白）", /\.tdclamp>\.card\{[^}]*height:100%/.test(HTML));
  ok("**點一下展開、再點收回去**", /\.tdclamp\.open\{[^}]*height:auto/.test(HTML)
     && /classList\.toggle\("open"\)/.test(APP));
  ok("**滿出來的才畫漸層，不寫文字說明**（老闆：不需要文字說明）",
     /\.tdclamp\.over::after\{/.test(HTML) && typeof tdClampScan==="function"
     && !/展開全部|看全部|收合/.test((HTML.match(/\.tdclamp[^}]*\}/g)||[]).join("")));
  ok("**展開收合不寫 onclick**（看板「純檢視」那條保證靠它在釘）",
     !/tdToggle/.test(APP) && !viewBoard().includes("onclick"));
  // 主管那一邊也一樣整齊
  reset(); as("Regina","manager");
  { const b=viewBoard();
    const i=b.indexOf("今日成效");
    ok("主管的卡片也套同一個外框", (b.slice(i).match(/class="tdclamp"/g)||[]).length>=4,
       (b.slice(i).match(/class="tdclamp"/g)||[]).length);
    ok("主管沒有「我今天」那一段（他要看的是全隊）", !b.includes("我今天")); }

  // ══════════ ⑫ 舊資料不會不見 ══════════
  reset([m_("M1",{user:"小葵",to:"hr"})]); as("HR小姐","hr");
  ok("**舊的「找主管／人資」人資還是收得到**", viewChat().includes("想請假"));
  ok("**而且還回得了**", viewChat().includes("msgReply('M1')"));
  reset([m_("M1",{user:"小葵",to:"hr",reply:"准了",replyBy:"HR小姐",replyAt:T0+"T10:00:00"})]);
  as("小葵","editor");
  { const c=viewChat();
    ok("**回覆內容看得到**", c.includes("准了"));
    ok("有「知道了」可以清掉紅點", c.includes("msgSeen('M1')")); }
  reset([p_("P1",{user:"小美",from:"小葵",ack:true,reply:"收到，明天處理",replyAt:T0+"T10:00:00"})]);
  as("小葵","editor");
  ok("**舊的同事訊息回覆也看得到**（那些回在 reply 欄位，不是留言串）",
     viewChat().includes("收到，明天處理"));
  ok("**不再產生新的 kind:\"msg\"**（sendMsg 整個移除了）", typeof sendMsg==="undefined");

  // ══════════ ⑬ 管理員＝Vito：員工要找得到他，而且每一處都寫 Vito ══════════
  // 老闆：「管理員就是vito 讓員工也可以發訊息給我 我就是vito管理員」
  { const ROLES=[["小葵","editor"],["小美","cs"],["Anna","intl"],["HR小姐","hr"],["Regina","manager"]];
    let miss=[];
    ROLES.forEach(([u,r])=>{ reset(); as(u,r);
      const c=dashAssignTaskCard();
      if(!c.includes('value="管理員"') || !c.includes(">Vito<")) miss.push(r); });
    ok("**每一種職位都傳得到管理員，而且名字寫 Vito**", !miss.length, miss); }
  // 真的送得到、真的收得到、真的回得了
  { reset(); as("小美","cs");
    asgPicked=()=>["管理員"]; fields.asg_txt="老闆，這個要問你一下";
    await assignTaskSel(); await wait();
    const rec=writes.find(w=>w[0]==="set");
    ok("**員工發給老闆 → 是訊息，不會變成他的工作**",
       !!rec && rec[3].kind==="p2p" && rec[3].user==="管理員" && rec[3].from==="小美", rec&&rec[3]);
    // 把它放進 STATE，換老闆的身分看
    LAST_RAW.tasks[rec[2]]=rec[3]; STATE=decorate(LAST_RAW);
    as("管理員","boss"); COMM_TAB="open";
    const c=viewChat();
    ok("**老闆在「傳訊息」看得到**", c.includes("老闆，這個要問你一下"));
    ok("**而且會亮紅點**", commUnread()>=1, commUnread());
    ok("**有「收到」可以按**", c.includes(`ackTask('${rec[2]}')`));
    ok("**回得了**", c.includes(`postTaskMsg('${rec[2]}')`)); }
  // 畫面上凡是印「人」的地方都要寫 Vito，不能一半 Vito 一半管理員
  { reset([t_("T1",{assignedBy:"管理員",ack:true,user:"小葵",
      msgs:[{at:T0+"T09:10:00",by:"管理員",text:"這個先做"}]})]);
    as("小葵","editor");
    const c=viewChat(), w=viewWork();
    ok("聊天室的留言署名是 Vito", c.includes(">Vito<") && !/tmsg-h"><b[^>]*>管理員</.test(c));
    ok("每日工作那一條寫「交辦 Vito」", w.includes("交辦 Vito") && !w.includes("交辦 管理員")); }
  { reset(); as("管理員","boss");
    LAST_RAW.logs=[{id:"L1",at:T0+"T09:00:00",user:"管理員",role:"boss",action:"改了一件事",target:"x"}];
    STATE=decorate(LAST_RAW); CUR_TAB="log";
    ok("**操作紀錄裡也寫 Vito**", viewLog().includes(">Vito<") && !/誰"><b>管理員</.test(viewLog()),
       (viewLog().match(/data-label="誰"[^<]*<b>[^<]*</)||[])[0]); }

  // ══════════ ⑭ 審片進度：長清單收起來、按鍵不要變成整條黑磚 ══════════
  // 正式資料實測有人待審 20 支 —— 攤開來把「今天要做的事」推到三個螢幕以下，
  // 那正是老闆說的「不可以切壓迫到彼此的區塊」。
  { const mk=(n)=>{ const vs=[]; for(let i=0;i<n;i++) vs.push({id:"W"+i,code:"26W"+i,name:"片"+i,
      rawName:"",videoCopy:"",rawLink:"",cover:"",stage:"已完成",editor:"小葵",claimedBy:"小葵",
      assignedTo:"",scheduledDate:null,publishTime:"",finishedAt:T0+"T10:00:00",publishedLink:"",
      driveFolder:"",productUrl:"",note:"",mainType:"",source:"官方IP",refLink:"",reviewStatus:"",
      locale:"",channel:"",origLang:"",account:"",tags:[],products:[],usageHistory:[],metrics:[]});
    reset(); STATE.videos=vs; LAST_RAW.videos=vs; STATE=decorate(LAST_RAW); as("小葵","editor");
    return workReviewCard("小葵"); };
    const few=mk(3), many=mk(20);
    ok("**少少幾支就直接列出來**（不用點）", !few.includes("revfold") && few.includes("editorMarkReviewed('W0')"));
    ok("**超過 6 支就收起來**", many.includes('class="fold revfold"'));
    ok("**收起來也看得出還欠幾支**", many.includes("（20）"), (many.match(/待審核[^（]*（\d+）/)||[])[0]);
    ok("**清單沒有被截斷**（收起來 ≠ 只留前幾支）",
       (many.match(/editorMarkReviewed/g)||[]).length===20, (many.match(/editorMarkReviewed/g)||[]).length);
    ok("**按鍵縮短了**（「已審過，下一步」在手機上會掉到自己一行，20 支就是 20 塊黑磚）",
       many.includes("✓ 已審過<") && !many.includes("已審過，下一步"));
    ok("按下去會怎樣還是講得出來（在 title 裡）", many.includes("標記通過，開始上傳雲端"));
    ok("**而且不是實心黑**（20 顆實心的比內容還搶眼）", many.includes('class="btn sec sm"'));
    ok("按鍵不換行，會留在右邊", many.includes("white-space:nowrap"));
    ok("折疊本身不長成一張新卡片（卡中有卡）", /details\.revfold\{[^}]*border:none/.test(HTML)); }

  // ══════════ ⑮ 每個身分每一頁都畫得出來 ══════════
  { let bad=null;
    [["管理員","boss"],["Regina","manager"],["HR小姐","hr"],["小葵","editor"],["小美","cs"],["Anna","intl"]]
      .forEach(([w,r])=>{ reset([t_("T1",{ack:true}), p_("P1"), m_("M1")]); as(w,r);
        myTabs().forEach(t=>{ CUR_TAB=t[0]; CAL_YM=null;
          try{ render(); }catch(e){ bad=w+"/"+t[0]+": "+e.message; } }); });
    ok("六種身分、每一個分頁都畫得出來", !bad, bad); }

  console.log(`\nv183（四套併一套・傳訊息・小紅點・看板順序）: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
