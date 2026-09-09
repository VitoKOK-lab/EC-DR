// v171：交辦追蹤 —— 回看做完沒，不會隔一天就消失。
//
// 老闆：「老闆交辦的任務要怎麼樣能夠回看，看有沒有完成，不要隔一天就消失，沒有辦法確認」
//
// 查證（正式資料 2026-09-08）：交辦共 70 筆、散在 9 個不同日期，
// 但畫面上一律只看「今天」—— 今天日期的只有 2 筆，另外 68 筆要先知道是哪一天
// 派的、再逐日往回點才找得到。而且 70 筆裡有 34 筆派給非剪輯（客服 19、選品 5、
// 出貨 5、海外 2、人資 1），儀表板的個人卡只列剪輯，那 34 筆連往回點都看不到。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,files:null,
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
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const D=(n)=>{ const d=new Date(Date.parse(FROZEN+"T00:00:00Z")+n*864e5); return d.toISOString().slice(0,10); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,260));} }
function as(w,r){ localStorage.setItem("ecdr_user",w); localStorage.setItem("ecdr_role",r); }
const t_=(id,o)=>Object.assign({id,user:"小葵",date:D(0),title:"做一件事",contact:"",report:"",
  done:false,doneAt:"",assignedBy:"管理員",ack:true,createdAt:D(0)+"T09:00:00",groupId:"",msgs:[]},o||{});
function reset(tasks){
  ASG_TRACK="open"; VIEW_AS=null; BRAND=""; FOLD_OPEN={};
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const map={}; (tasks||[]).forEach(t=>{ map[t.id]=t; });
  const raw={ users:[{name:"小葵",role:"editor"},{name:"小美",role:"cs"},{name:"怡萍",role:"pick"},
                     {name:"茂泉",role:"ship"},{name:"HR",role:"hr"},
                     {name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:map, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
}

// ══════════ ① 舊日期的交辦不會消失 ══════════
{ reset([ t_("舊未完成",{date:D(-30)}),
          t_("舊已完成",{date:D(-20), done:true, doneAt:D(-20)+"T17:00:00"}),
          t_("今天的",{date:D(0)}) ]);
  as("管理員","boss");
  const h=dashAssignTrackCard();
  ok("**30 天前派的、還沒做完的照樣看得到**", h.includes("舊未完成"), h.slice(0,200));
  ok("今天派的也在", h.includes("今天的"));
  ASG_TRACK="done";
  ok("**20 天前完成的，切到「已完成」看得到**", dashAssignTrackCard().includes("舊已完成")); }

// 這是老闆原本的痛點：舊的在既有畫面上真的看不到（證明這張卡在補的是真的洞）
{ reset([ t_("三天前派的",{date:D(-3)}) ]);
  as("管理員","boss");
  const rows=dashEditorRows(["小葵"], [], Object.values(STATE.tasks), today, true);
  ok("（前提）既有的個人卡只看當天，三天前那筆不在裡面",
     rows[0] && rows[0].assignedOpen.length===0 && rows[0].assignedDone.length===0,
     rows[0]&&{open:rows[0].assignedOpen.length, done:rows[0].assignedDone.length});
  ok("新的追蹤卡看得到", dashAssignTrackCard().includes("三天前派的")); }

// ══════════ ② 非剪輯的人也要看得到（原本完全看不到）══════════
{ reset([ t_("客服的",{user:"小美",date:D(-5)}),
          t_("選品的",{user:"怡萍",date:D(-5)}),
          t_("出貨的",{user:"茂泉",date:D(-5)}),
          t_("人資的",{user:"HR",date:D(-5)}) ]);
  as("管理員","boss");
  const h=dashAssignTrackCard();
  ["客服的","選品的","出貨的","人資的"].forEach(x=>
    ok("**"+x+"交辦看得到**（儀表板的個人卡只列剪輯，這些原本連往回點都看不到）", h.includes(x)));
  ok("四個人的名字都印出來", ["小美","怡萍","茂泉","HR"].every(n=>h.includes(n))); }

// ══════════ ③ 三個分類 ══════════
{ reset([ t_("還沒做的甲"), t_("還沒做的乙"),
          t_("已做完的丙",{done:true,doneAt:D(-1)+"T10:00:00"}) ]);
  as("管理員","boss");
  ASG_TRACK="open";
  { const h=dashAssignTrackCard();
    ok("「還沒做完」只列未完成", h.includes("還沒做的甲") && h.includes("還沒做的乙") && !h.includes("已做完的丙")); }
  ASG_TRACK="done";
  { const h=dashAssignTrackCard();
    ok("「已完成」只列完成", h.includes("已做完的丙") && !h.includes("還沒做的甲")); }
  ASG_TRACK="all";
  { const h=dashAssignTrackCard();
    ok("「全部」三筆都在", h.includes("還沒做的甲") && h.includes("還沒做的乙") && h.includes("已做完的丙")); }
  ASG_TRACK="open"; }
{ reset([ t_("a"), t_("b"), t_("c",{done:true,doneAt:D(0)+"T10:00:00"}) ]);
  as("管理員","boss");
  const h=dashAssignTrackCard();
  const n=(s)=>{ const m=h.match(new RegExp(s+"<\\/span> <span class=\"vtab-n\">(\\d+)<")); return m?+m[1]:null; };
  ok("數字：還沒做完 2", n("還沒做完")===2, n("還沒做完"));
  ok("數字：已完成 1", n("已完成")===1, n("已完成"));
  ok("數字：全部 3", n("全部")===3, n("全部")); }

// ══════════ ④ 每一列講得出「做完沒、誰、什麼時候」 ══════════
{ reset([ t_("完成的",{done:true, doneAt:D(-2)+"T17:30:00", report:"已經跟廠商確認完畢了"}) ]);
  as("管理員","boss"); ASG_TRACK="done";
  const h=dashAssignTrackCard();
  ok("寫得出完成時間", /完成 \d\d-\d\d \d\d:\d\d/.test(h), (h.match(/完成 [^<]*/)||[])[0]);
  ok("看得到處理狀況", h.includes("已經跟廠商確認完畢了")); }
{ reset([ t_("沒回報的",{done:false}) ]);
  as("管理員","boss");
  ok("沒回報就明講「還沒回報」", dashAssignTrackCard().includes("還沒回報")); }
{ reset([ t_("沒看的",{ack:false}) ]);
  as("管理員","boss");
  ok("對方還沒按收到 → 標「還沒看」", dashAssignTrackCard().includes("還沒看")); }
{ reset([ t_("拖很久",{date:D(-6)}) ]);
  as("管理員","boss");
  ok("**拖了幾天要講出來**", /拖了 6 天/.test(dashAssignTrackCard()), (dashAssignTrackCard().match(/拖了[^<]*/)||[])[0]); }
{ reset([ t_("做完的舊件",{date:D(-6), done:true, doneAt:D(-5)+"T10:00:00"}) ]);
  as("管理員","boss"); ASG_TRACK="done";
  ok("做完的就不要再喊「拖了幾天」（做完了講天數沒意義）",
     !/拖了 \d+ 天/.test(dashAssignTrackCard())); }

// 未完成的排序：拖最久的要排最前面
{ reset([ t_("昨天",{date:D(-1)}), t_("十天前",{date:D(-10)}), t_("今天",{date:D(0)}) ]);
  as("管理員","boss");
  const h=dashAssignTrackCard();
  ok("拖最久的排最前面", h.indexOf("十天前")<h.indexOf("昨天") && h.indexOf("昨天")<h.indexOf("今天"),
     {十天前:h.indexOf("十天前"), 昨天:h.indexOf("昨天"), 今天:h.indexOf("今天")}); }
// 已完成的排序：最近做完的在最前面
{ reset([ t_("上週完成",{done:true,doneAt:D(-7)+"T10:00:00"}),
          t_("昨天完成",{done:true,doneAt:D(-1)+"T10:00:00"}) ]);
  as("管理員","boss"); ASG_TRACK="done";
  const h=dashAssignTrackCard();
  ok("最近做完的排前面", h.indexOf("昨天完成")<h.indexOf("上週完成")); }

// ══════════ ⑤ 誰看得到什麼 ══════════
{ reset([ t_("老闆派的",{assignedBy:"管理員"}), t_("Regina派的",{assignedBy:"Regina"}),
          t_("自己排的",{assignedBy:""}) ]);
  as("管理員","boss");
  const h=dashAssignTrackCard();
  ok("主管看得到全部人派的（他要的是整間公司的狀況）",
     h.includes("老闆派的") && h.includes("Regina派的"), h.slice(0,300));
  ok("**自己排的工作不算交辦，不要混進來**", !h.includes("自己排的"));
  ok("別人派的會標出來是誰派的", /Regina 派的/.test(h), (h.match(/[^>]*派的/)||[])[0]); }
{ reset([ t_("老闆派的",{assignedBy:"管理員"}), t_("Regina派的",{assignedBy:"Regina"}) ]);
  as("Regina","manager");
  const h=dashAssignTrackCard();
  ok("經理人只看自己派的", h.includes("Regina派的") && !h.includes("老闆派的")); }
{ reset([ t_("A") ]); as("小葵","editor");
  ok("剪輯看不到這張卡", dashAssignTrackCard()===""); }
{ reset([ t_("A") ]); as("小美","cs");
  ok("員工也看不到", dashAssignTrackCard()===""); }

// HR 通知不是交辦，不要混進來
{ reset([ Object.assign(t_("HR通知"),{kind:"notice"}), t_("真的交辦") ]);
  as("管理員","boss");
  const h=dashAssignTrackCard();
  ok("HR 通知不算交辦", !h.includes("HR通知") && h.includes("真的交辦")); }

// ══════════ ⑥ 掛在儀表板上、而且不會爆 ══════════
{ reset([ t_("A",{date:D(-3)}) ]); as("管理員","boss");
  ok("儀表板上有這張卡", viewDashboard().includes("交辦追蹤")); }
{ reset([ t_("A",{date:D(-3)}) ]); as("Regina","manager");
  ok("經理人的儀表板也有", viewDashboard().includes("交辦追蹤")); }
{ reset([]); as("管理員","boss");
  ok("一筆交辦都沒有時不會爆", typeof dashAssignTrackCard()==="string");
  ok("而且會講一句話，不是空白", /沒有東西|交辦追蹤/.test(dashAssignTrackCard())); }
{ reset([ t_("A",{title:"<script>alert(1)</script>", report:"<img src=x onerror=alert(1)>"}) ]);
  as("管理員","boss");
  const h=dashAssignTrackCard();
  ok("交辦內容有跳脫", !/<script>/.test(h) && h.includes("&lt;script&gt;"));
  ok("處理狀況也有跳脫", !/<img src=x/.test(h)); }
{ reset([ t_("A",{title:"看這裡 https://drive.google.com/x"}) ]);
  as("管理員","boss");
  ok("交辦內容裡的網址點得開", /<a href="https:\/\/drive\.google\.com\/x"/.test(dashAssignTrackCard())); }

console.log(`\nv171（交辦追蹤・回看做完沒）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
