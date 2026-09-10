// v178：三塊資訊架構的第一塊 ——「溝通」把四套訊息合成一套。
//
// 老闆：「我覺的要切兩塊，溝通（雙向都能看到和對話，就是溝通用的，老闆和 HR、
//        主管交辨的才會後需要剛才加的完成和封存）和看版…第三個區塊是「每日工作」」
//        「合成一套，都能雙向，都能傳照片，整合成一樣…差別是 regina hr 指派的
//         問題或工作，會跳到今日的工作交辨（要有小圖 ok）然後如果有多次的雙向
//         對話回覆，點擊再打開就好」
//        「鴻儒變成小主管，但他不用看到儀表版」
//        「(4)c 但是要簡化（每一個被交辨的只顯示 12 個字，點擊再打開）」
//
// 合併前（正式資料 2026-09-09）：交辦 70／同事訊息 3／找主管說 1／HR 通知 0。
// 四套各做一半（同事訊息不能貼圖、只能回一次；HR 通知不能回），所以三套沒人用。
//
// **唯一該有的差別是「誰發的」**：
//   主管／人資／小主管發的 → 交辦，跳進對方每日工作，要按 OK 才收
//   同事之間發的          → 訊息，對方看得到、能一直回，但不變成他的工作
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},select(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, checked=[];
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,
  querySelectorAll:(sel)=>String(sel).indexOf("asg_p")>=0 ? checked.map(v=>({value:v,checked:true})) : []};
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
let calls=[];
const t_=(id,o)=>Object.assign({id,user:"小葵",date:D(0),title:"做一件事",contact:"",report:"",
  done:false,doneAt:"",assignedBy:"Regina",ack:true,createdAt:D(0)+"T09:00:00",groupId:"",msgs:[]},o||{});
const p_=(id,o)=>Object.assign({id,kind:"p2p",user:"小葵",from:"小美",date:D(0),title:"同事講的事",
  ack:false,reply:"",fromSeen:false,createdAt:D(0)+"T09:00:00",msgs:[]},o||{});
function reset(tasks, users){
  COMM_TAB="open"; ASG_TRACK="open"; ASG_SCOPE="mine"; ASG_FROM_DRAFT=""; ASG_PIC=null; ASG_PIC_URL="";
  VIEW_AS=null; BRAND=""; FOLD_OPEN={}; fields={}; checked=[]; calls=[]; viewEl.innerHTML=""; modalHTML="";
  global.window.DB={ set:async(c,i,d)=>calls.push(["set",c,i,d]), update:async(c,i,d)=>calls.push(["update",c,i,d]),
    del:async(c,i)=>calls.push(["del",c,i]), scheduleSet:async()=>{}, setSettings:async()=>{},
    uploadTaskPic:async(a,b)=>{ calls.push(["upload",a,b]); return "https://storage.example/x.jpg"; },
    videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const map={}; (tasks||[]).forEach(t=>{ map[t.id]=t; });
  const raw={ users: users || [{name:"小葵",role:"editor"},{name:"小美",role:"cs"},{name:"泓儒",role:"editor",canAssign:true},
                     {name:"Anna",role:"intl"},{name:"HR",role:"hr"},{name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:map, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
}
const wait=()=>new Promise(r=>setTimeout(r,15));

(async()=>{

// ══════════ ① 每個人都有「溝通」分頁，而且排第一 ══════════
{ [["管理員","boss"],["Regina","manager"],["HR","hr"],["小葵","editor"],["小美","cs"],["Anna","intl"]].forEach(([w,r])=>{
    reset([]); as(w,r);
    const tabs=myTabs();
    ok(`${r} 有「溝通」分頁而且排第一`, tabs[0][0]==="chat", tabs.map(t=>t[0]));
  });
  reset([]); as("Anna","intl");
  ok("海外看到的是英文", myTabs()[0][1]==="Messages", myTabs()[0][1]); }

// ══════════ ② 一套：四種東西都出現在同一個清單 ══════════
{ reset([ t_("T1",{assignedBy:"Regina",user:"小葵",title:"主管交辦的"}),
          p_("P1",{from:"小美",user:"小葵",title:"同事傳的"}),
          Object.assign(t_("M1"),{kind:"msg",user:"小葵",to:"hr",title:"我問人資的",assignedBy:""}),
          Object.assign(t_("N1"),{kind:"notice",user:"小葵",title:"HR通知的",assignedBy:""}),
          t_("S1",{assignedBy:"",user:"小葵",title:"自己排的工作"}) ]);
  as("小葵","editor");
  const h=viewChat();
  ["主管交辦的","同事傳的","我問人資的","HR通知的"].forEach(x=>
    ok(`**${x}** 也在同一個清單裡`, h.includes(x.slice(0,6)), h.slice(0,200)));
  ok("**自己排給自己的工作不算溝通**（那是每日工作的東西）", !h.includes("自己排的工作")); }

// ══════════ ③ 誰發的決定它會不會變成對方的工作 ══════════
// v179 老闆更正：小主管「只能是剪輯部的小主管，只能指派影片」——
// 所以他發出去的**不會**變成對方的工作，那是主管／人資才有的。
{ [["管理員","boss",true],["Regina","manager",true],["HR","hr",true],
   ["泓儒","editor",false],                     // 小主管：只能指派影片，不能派事情
   ["小葵","editor",false],["小美","cs",false],["Anna","intl",false]].forEach(([w,r,want])=>{
    reset([]); as(w,r);
    ok(`${w}（${r}）發出去${want?"會":"不會"}變成對方的工作`, commTracks()===want, commTracks());
  }); }
{ reset([]); as("管理員","boss"); VIEW_AS={name:"小葵",role:"editor"};
  ok("員工視角（唯讀預覽）不會變成交辦", commTracks()===false); VIEW_AS=null; }
// 主管送出 → 交辦（進對方每日工作）
{ reset([]); as("Regina","manager");
  fields.asg_txt="請幫我確認庫存"; fields.asg_contact=""; checked=["小葵"];
  await assignTaskSel(); await wait();
  const c=calls.find(x=>x[0]==="set"&&x[1]==="tasks");
  ok("**主管送出的是交辦**（沒有 kind，isTask 認得）", !!c && !c[3].kind && !!c[3].assignedBy, c&&c[3]);
  ok("而且會進對方的每日工作", !!c && c[3].date===today && c[3].done===false);
  ok("要對方按「收到」", !!c && c[3].ack===false); }
// 同事送出 → 訊息（不進每日工作）
{ reset([]); as("小葵","editor");
  fields.asg_txt="這支片的素材在哪"; fields.asg_contact=""; checked=["小美"];
  await assignTaskSel(); await wait();
  const c=calls.find(x=>x[0]==="set"&&x[1]==="tasks");
  ok("**同事送出的是訊息**（kind:p2p）", !!c && c[3].kind==="p2p", c&&c[3]);
  ok("記得是誰發的", !!c && c[3].from==="小葵" && c[3].user==="小美");
  ok("**不會變成對方的工作**（isTask 認不得 p2p）", !!c && isTask(c[3])===false); }
// 兩種都能多選、都能貼圖、都有留言串
{ reset([]); as("小葵","editor");
  fields.asg_txt="看一下這張"; checked=["小美","泓儒"]; ASG_PIC={fake:1};
  await assignTaskSel(); await wait();
  const sets=calls.filter(x=>x[0]==="set"&&x[1]==="tasks");
  ok("同事訊息也能一次傳給多個人", sets.length===2, sets.length);
  ok("**同事訊息也能貼圖**（以前不行）",
     sets[0][3].msgs && sets[0][3].msgs[0] && /^https:/.test(sets[0][3].msgs[0].pic||""), sets[0][3].msgs);
  ok("圖只上傳一次，兩個人共用同一個網址",
     calls.filter(x=>x[0]==="upload").length===1 && sets[0][3].msgs[0].pic===sets[1][3].msgs[0].pic); }
{ reset([ p_("P1",{msgs:[{at:D(0)+"T10:00:00",by:"小美",text:"第一句"},{at:D(0)+"T10:05:00",by:"小葵",text:"回你了"}]}) ]);
  as("小葵","editor");
  const h=viewChat();
  ok("**同事訊息也有留言串**（以前只能回一次）", h.includes("第一句") && h.includes("回你了"));
  ok("而且還能繼續回", /postTaskMsg\('P1'\)/.test(h)); }

// ══════════ ④ 收合只顯示 12 字，點擊再打開 ══════════
{ const LONG="這是一段很長很長的交辦內容需要被截斷才不會把版面撐爆";
  reset([ t_("T1",{title:LONG,assignedBy:"Regina",user:"小葵"}) ]);
  as("小葵","editor");
  const h=viewChat();
  ok("收合時是 <details>，點了才展開", /<details id="comm_T1" class="commrow/.test(h));
  const snip=(h.match(/class="commtxt"[^>]*>([^<]*)</)||[])[1]||"";
  ok("**收合時只有 12 個字＋…**", snip.length===13 && snip.endsWith("…"), {snip, len:snip.length});
  ok("展開之後看得到全文", h.includes(LONG.slice(0,20)));
  ok("commSnip 就是 12 字這條規矩", COMM_SNIP===12); }
{ reset([ t_("T1",{title:"短的",assignedBy:"Regina",user:"小葵"}) ]);
  as("小葵","editor");
  const snip=(viewChat().match(/class="commtxt"[^>]*>([^<]*)</)||[])[1]||"";
  ok("短的不加「…」", snip==="短的", snip); }
// 團隊看板也是同一條規矩（老闆要的 4c 簡化）
{ const LONG="上架商品問一下怡萍有哪些商品是上個禮拜已經選好品寄回台灣的";
  reset([ t_("T1",{title:LONG,assignedBy:"Regina",user:"小葵"}) ]);
  as("管理員","boss");
  const row=teamTaskRow(taskById("T1"));
  ok("**團隊看板上也是收合的一行**", /<details class="commrow/.test(row), row.slice(0,80));
  const snip=(row.match(/class="commtxt"[^>]*>([^<]*)</)||[])[1]||"";
  ok("看板上也是 12 字", snip.length===13 && snip.endsWith("…"), snip);
  ok("點開看得到全文", row.includes(LONG.slice(0,16)));
  ok("收合時「狀態」還看得到（掃的時候就是要看這個）", /pill (ok|em|wa)/.test(row.split("</summary>")[0])); }

// ══════════ ⑤ 小小的 OK：只有發訊的人看得到、按得動 ══════════
{ reset([ t_("T1",{assignedBy:"Regina",user:"小葵",done:true,doneAt:D(0)+"T10:00:00"}) ]);
  as("Regina","manager");
  const h=viewChat();
  // v183：對方回報完成、正等我按的那一顆改成實心＋寫「完成」——
  // 老闆：「regina的對話，如果完成要有 完成可以按，沒有看見」。
  ok("**派的人看得到那顆鍵**", /class="btn sm commok on"/.test(h) && />完成</.test(h), (h.match(/commok[^>]*/g)||[]));
  ok("點開之後也有一顆（不用回頭去那一行的最右邊找）", /archiveTask\('T1',true\)/.test(h)
     && h.includes("完成，收起來"));
  ok("OK 是小的（有自己的 class，不是整排大按鈕）", HTML.includes(".commok{")); }
{ reset([ t_("T1",{assignedBy:"Regina",user:"小葵",done:true,doneAt:D(0)+"T10:00:00"}) ]);
  as("小葵","editor");
  ok("**收到的人沒有 OK**（不能自己把別人派的事收掉）", !/commok/.test(viewChat())); }
// v183：同事訊息也要收得起來 —— 老闆訂的規矩是「都會留在發訊方，直到發訊方
// 按下「ok」才會封存起來」，那條沒有分交辦還是訊息。
{ reset([ p_("P1",{from:"小葵",user:"小美"}) ]);
  as("小葵","editor");
  ok("**同事訊息，發訊方也有 OK 可以收起來**", /commok/.test(viewChat()));
  ok("但它是淡的（還沒有人回，不是等我處理的狀態）", !/commok on/.test(viewChat())); }
{ reset([ p_("P1",{from:"小葵",user:"小美"}) ]);
  as("小美","cs");
  ok("**收訊方沒有 OK**（那顆是發訊方的）", !/commok/.test(viewChat())); }
// 主管有「萬能鑰匙」（canArchiveTask 對 boss 一律放行），但那是給他清別人留下的爛攤子用的。
// 在自己的溝通清單裡，**別人派給他的**那幾條不該冒出 OK —— 那是對方的事。
{ reset([ t_("T1",{assignedBy:"Regina",user:"管理員",title:"Regina 派給老闆的",done:true,doneAt:D(0)+"T10:00:00"}) ]);
  as("管理員","boss");
  ok("**別人派給我的，我這裡不出現 OK**（就算我是主管）", !/commok/.test(viewChat()),
     (viewChat().match(/commok[^>]*/g)||[])); }
{ reset([ t_("T1",{assignedBy:"管理員",user:"小葵",title:"老闆自己派的",done:true,doneAt:D(0)+"T10:00:00"}) ]);
  as("管理員","boss");
  ok("（對照）自己派出去的就有 OK", /commok/.test(viewChat())); }
// 「還沒按收到」這條規則真正在管的是**同事訊息** ——
// 交辦那種本來就會因為「還沒做完」被算成等我，測不出這條。
{ reset([ p_("P1",{from:"小美",user:"小葵",ack:false}) ]);
  as("小葵","editor");
  ok("**同事傳來、我還沒點開的，算「等我處理」**", commWaitingMe(taskById("P1"))===true); }
{ reset([ p_("P1",{from:"小美",user:"小葵",ack:true}) ]);
  as("小葵","editor");
  ok("點開過就不再催我", commWaitingMe(taskById("P1"))===false); }
{ reset([ t_("T1",{assignedBy:"Regina",user:"小葵",archived:true,archivedAt:D(0)+"T11:00:00"}) ]);
  as("Regina","manager"); COMM_TAB="done";
  const h=viewChat();
  ok("封存的可以重新打開", /archiveTask\('T1',false\)/.test(h));
  ok("封存的列有標出來", /commrow arch/.test(h)); }

// ══════════ ⑥ 排序：等我處理的排最前面 ══════════
// ⚠️ 兩筆的標題要不一樣，不然分不出誰排前面（t_ 的預設標題都是「做一件事」）
// ⚠️ 而且要真的一筆「等我」、一筆「不等我」才分得出排序 ——
//    兩筆都在等我的話會退回時間排序，那條就測不到（第一版就是這樣寫錯的）。
//    A＝我自己傳出去的同事訊息（不用我做事）；B＝派給我、我還沒按收到的。
{ reset([ Object.assign(p_("A"),{from:"小葵",user:"小美",title:"我傳出去的",createdAt:D(0)+"T09:00:00"}),
          t_("B",{assignedBy:"Regina",user:"小葵",ack:false,title:"舊的沒看過",createdAt:D(-9)+"T09:00:00"}) ]);
  as("小葵","editor");
  const h=viewChat();
  ok("（前提）一筆等我、一筆不等我",
     commWaitingMe(taskById("B"))===true && commWaitingMe(taskById("A"))===false,
     {B:commWaitingMe(taskById("B")), A:commWaitingMe(taskById("A"))});
  ok("**等我處理的排在前面**（就算它比較舊）",
     h.indexOf("舊的沒看過")>-1 && h.indexOf("舊的沒看過")<h.indexOf("我傳出去的"),
     {等我:h.indexOf("舊的沒看過"), 不等我:h.indexOf("我傳出去的")});
  ok("等我處理的有紅點", /class="commdot"/.test(h));
  ok("不等我的那筆沒有紅點", (h.match(/class="commdot"/g)||[]).length===1); }
// 兩筆都在等我 → 退回「最後有動靜的排前面」
{ reset([ t_("A",{assignedBy:"Regina",user:"小葵",ack:false,title:"比較新的",createdAt:D(-1)+"T09:00:00"}),
          t_("B",{assignedBy:"Regina",user:"小葵",ack:false,title:"比較舊的",createdAt:D(-9)+"T09:00:00"}) ]);
  as("小葵","editor");
  const h=viewChat();
  ok("都在等我的時候，最後有動靜的排前面",
     h.indexOf("比較新的")<h.indexOf("比較舊的"), {新:h.indexOf("比較新的"), 舊:h.indexOf("比較舊的")}); }
{ reset([ t_("T1",{assignedBy:"Regina",user:"小葵",done:true,doneAt:D(0)+"T10:00:00"}) ]);
  as("Regina","manager");
  ok("對方做完了、等我按 OK → 也算「等我處理」", commWaitingMe(taskById("T1"))===true); }
{ reset([ t_("T1",{assignedBy:"Regina",user:"小葵",done:true,archived:true}) ]);
  as("Regina","manager");
  ok("已經按過 OK 的就不再催我", commWaitingMe(taskById("T1"))===false); }

// ══════════ ⑦ 只看得到跟自己有關的 ══════════
{ reset([ t_("T1",{assignedBy:"Regina",user:"小葵",title:"跟我有關"}),
          t_("T2",{assignedBy:"管理員",user:"小美",title:"別人的事"}) ]);
  as("小葵","editor");
  const h=viewChat();
  ok("看得到派給我的", h.includes("跟我有關"));
  ok("**看不到別人之間的**", !h.includes("別人的事")); }
{ reset([ t_("T2",{assignedBy:"管理員",user:"小美",title:"我派給小美的"}) ]);
  as("管理員","boss");
  ok("我派出去的也看得到", viewChat().includes("我派給小美的")); }

// ══════════ ⑧ 小主管（老闆指定泓儒）══════════
// v179 老闆更正：「他只能是剪輯部的小主管，只能指派影片，看不到主管看板」
{ reset([]); as("泓儒","editor");
  ok("**泓儒是小主管**", isSubLead()===true);
  ok("**小主管能做的就一件事：把毛片指派給剪輯**", canAssignWork()===true);
  ok("**小主管看不到主管版看板**（老闆更正）", seesLeadBoard()===false);
  ok("**小主管發出去的不會變成對方的工作**（指派影片 ≠ 派事情）", commTracks()===false);
  ok("**沒有儀表板那一頁**（老闆指定）", !myTabs().map(t=>t[0]).includes("dashboard"), myTabs().map(t=>t[0]));
  ok("也沒有出勤／設定／操作紀錄",
     !["attend","settings","log","trash"].some(t=>myTabs().map(x=>x[0]).includes(t)), myTabs().map(t=>t[0]));
  ok("他的分頁跟一般剪輯一模一樣（差別只在權限，不在畫面數量）",
     JSON.stringify(myTabs().map(t=>t[0]))===JSON.stringify(["chat","work","board","videos","videosDF","cal"]),
     myTabs().map(t=>t[0])); }
{ reset([]); as("小葵","editor");
  ok("一般剪輯不是小主管", isSubLead()===false && canAssignWork()===false && seesLeadBoard()===false); }
// 「指派影片」這個能力真的還在（不能因為收緊了就把他原本有的也砍掉）
// v190：那張卡搬到看板了（跟 Regina 的同一個位置）
{ reset([]); as("泓儒","editor");
  ok("小主管在看板上還有指派毛片這張卡", /assignFootage\(\)/.test(viewBoard()), viewBoard().slice(0,120)); }
{ reset([]); as("小葵","editor");
  ok("（對照）一般剪輯沒有那張卡", !/assignFootage\(\)/.test(viewBoard()) && !/assignFootage\(\)/.test(viewWork())); }
{ reset([]); as("Regina","manager");
  ok("經理人本來就是主管，不叫小主管", isSubLead()===false);
  ok("但她當然看得到主管版看板", seesLeadBoard()===true); }
{ reset([]); as("管理員","boss"); VIEW_AS={name:"泓儒",role:"editor"};
  ok("員工視角預覽時不給小主管權限（唯讀）", isSubLead()===false && seesLeadBoard()===false); VIEW_AS=null; }

// ══════════ ⑨ 安全 ══════════
{ reset([ t_("T1",{assignedBy:"Regina",user:"小葵",title:'<img src=x onerror=alert(1)>'}) ]);
  as("小葵","editor");
  ok("收合的那一行有跳脫", !/<img src=x/.test(viewChat())); }
{ reset([ t_("T1",{assignedBy:"Regina",user:"小葵",title:"看這個 https://drive.google.com/x"}) ]);
  as("小葵","editor");
  ok("展開後網址是可以點的連結", /<a href="https:\/\/drive\.google\.com\/x"/.test(viewChat())); }

// ══════════ ⑩ 每一頁都畫得出來 ══════════
{ let bad=null;
  [["管理員","boss"],["Regina","manager"],["HR","hr"],["小葵","editor"],["泓儒","editor"],["小美","cs"],["Anna","intl"]].forEach(([w,r])=>{
    reset([ t_("T1",{assignedBy:"Regina",user:w}), p_("P1",{from:"小美",user:w}) ]); as(w,r);
    myTabs().forEach(t=>{ CUR_TAB=t[0]; CAL_YM=null;
      try{ render(); }catch(e){ bad=w+"/"+t[0]+": "+e.message; } });
  });
  ok("七種身分、每一個分頁都畫得出來", !bad, bad); }

console.log(`\nv178（溝通：四套合一・12 字收合・小主管）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
