// v182：版面收尾 —— 老闆看了截圖之後點名要修的七件事。
//
// 老闆：「選擇員工不要一直開在那裡占這麼大畫面，點開再展開。然後你說的問題全修。」
// 我自己在截圖裡看出來的六項＋他點名的一項：
//   ① 選擇員工改成折疊（27 個人攤開就是大半個螢幕，而通常只勾一兩個）
//   ② 勾選清單被 max-height 切在一排中間 —— 看起來像壞掉
//   ③ 員工的看板還留著主管的「全部（25）」下拉與「找人…」搜尋框
//   ④ OK 按鈕做成全黑實心，在一行裡比人名和內容都重（老闆要的是「小圖 ok」）
//   ⑤ 「我的對話」一行塞五個東西，390px 下內容只剩幾個字
//   ⑥ 每日工作每一件事都攤開一個回報框，四件事就佔掉大半螢幕
//   ⑦ 分頁寫「每日工作」，進去大標題寫「本日工作」
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), nodes={}, checked=[];
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(nodes[id]) return nodes[id];
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
function reset(tasks){
  VIEW_AS=null; BRAND=""; FOLD_OPEN={}; viewEl.innerHTML=""; modalHTML=""; nodes={}; checked=[];
  COMM_TAB="open"; ASG_FROM_DRAFT=""; ASG_PIC=null; ASG_PIC_URL=""; TEAM_Q=""; TEAM_ROLE="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const map={}; (tasks||[]).forEach(t=>{ map[t.id]=t; });
  const shifts={};
  ["小葵","小美"].forEach(n=>{ for(let i=0;i<4;i++){ const d=D(-i);
    shifts[n+"__"+d]={id:n+"__"+d,user:n,date:d,clockIn:d+"T09:05:00",clockOut:d+"T18:00:00"}; } });
  const raw={ users:[{name:"小葵",role:"editor"},{name:"小美",role:"cs"},{name:"阿凱",role:"ship"},
                     {name:"Anna",role:"intl"},{name:"HR",role:"hr"},{name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:map, shifts, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
}
const t_=(id,o)=>Object.assign({id,user:"小美",date:D(0),title:"做一件事",contact:"",report:"",
  done:false,doneAt:"",assignedBy:"",ack:true,createdAt:D(0)+"T09:00:00",groupId:"",msgs:[]},o||{});

// ══════════ ① 選擇員工：點開再展開 ══════════
{ reset(); as("管理員","boss");
  const h=dashAssignTaskCard();
  ok("**員工清單收在折疊裡**", /<details class="fold asgfold"/.test(h), h.slice(0,300));
  ok("預設是收起來的（不然等於沒改）", !/<details class="fold asgfold"[^>]*open/.test(h));
  ok("收合時標題寫「選擇員工…」", h.includes("選擇員工…"));
  ok("**清單本身還在**（只是收起來，不是拿掉）", /class="asg_p"/.test(h));
  ok("「全選」跟著收進去，不佔外面的位子",
     h.indexOf("asgToggleAll") > h.indexOf('class="fold asgfold"'),
     {全選:h.indexOf("asgToggleAll"), 折疊:h.indexOf('class="fold asgfold"')}); }
// 勾了誰要寫在收合的標題上 —— 不然點開之前完全看不出勾了什麼
{ reset(); as("管理員","boss");
  const who=el(); nodes.asg_who=who; nodes.asg_go=el();
  checked=["小美","阿凱"]; asgCount();
  ok("**收合時標題寫出勾了誰**", who.textContent.includes("小美") && who.textContent.includes("阿凱"), who.textContent);
  ok("也寫出幾個人", /2 人/.test(who.textContent), who.textContent);
  ok("送出鍵也會寫幾個人", /2 人/.test(nodes.asg_go.textContent), nodes.asg_go.textContent);
  checked=[]; asgCount();
  ok("取消勾選就回到「選擇員工…」", who.textContent.includes("選擇員工"), who.textContent); }
{ reset(); as("管理員","boss");
  const who=el(); nodes.asg_who=who; nodes.asg_go=el();
  checked=["甲","乙","丙","丁","戊","己"]; asgCount();
  ok("勾很多人時只列前四個＋「等」，不要把標題撐爆",
     /甲、乙、丙、丁/.test(who.textContent) && /等/.test(who.textContent) && !/戊/.test(who.textContent),
     who.textContent); }
// ② 清單不再被切在一排中間
{ ok("**勾選盒不再限高**（原本 max-height:260px 會切在一排中間）",
     /\.asgbox\{[^}]*max-height:none/.test(HTML),
     (HTML.match(/\.asgbox\{[^}]*\}/)||[])[0]); }

// ══════════ ③ 員工的看板沒有主管的篩選工具 ══════════
{ reset(); as("小葵","editor");
  const h=viewTeam();
  ok("**員工看不到「全部（N）」分組下拉**", !h.includes("teamSetGroup("), (h.match(/teamSet\w+\(/g)||[]));
  ok("**員工看不到「找人…」搜尋框**", !h.includes("teamSetQ("));
  ok("但「看哪一個月」還在（那是他自己要切的）", h.includes("teamSetYM(")); }
{ reset(); as("Regina","manager");
  const h=viewTeam();
  ok("（對照）主管照樣有那兩個工具", h.includes("teamSetGroup(") && h.includes("teamSetQ(")); }

// ══════════ ④ OK 按鈕改小改淡 ══════════
{ ok("**OK 不再是實心深色按鈕**（原本是整行最重的元素）",
     /\.commok\{[^}]*background:transparent/.test(HTML), (HTML.match(/\.commok\{[^}]*\}/)||[])[0]);
  ok("滑過去才變深（讓人知道按得下去）", /\.commok:hover\{[^}]*background:var\(--accent\)/.test(HTML));
  ok("字級比內文小", /\.commok\{[^}]*font-size:11px/.test(HTML)); }

// ══════════ ⑤ 一行塞五個東西：手機上讓位 ══════════
{ ok("**手機上狀態藥丸讓位給內容**", /\.commhead>\.pill\{display:none\}/.test(HTML.replace(/\s+/g,"")),
     (HTML.match(/\.commhead>\.pill\{[^}]*\}/)||[])[0]);
  ok("狀態改用左邊色帶表示（資訊沒有消失）",
     /\.commrow\.st-new\{/.test(HTML) && /\.commrow\.st-doing\{/.test(HTML) && /\.commrow\.st-done\{/.test(HTML)); }
{ reset([ t_("T1",{assignedBy:"Regina",user:"小葵",ack:false}) ]); as("小葵","editor");
  ok("還沒看的那一條掛 st-new", /commrow[^"]*st-new/.test(viewChat()), (viewChat().match(/class="commrow[^"]*"/g)||[])[0]); }
{ reset([ t_("T1",{assignedBy:"Regina",user:"小葵",ack:true,done:true,doneAt:D(0)+"T10:00:00"}) ]); as("小葵","editor");
  ok("回報完成的掛 st-done", /commrow[^"]*st-done/.test(viewChat())); }
{ reset([ t_("T1",{assignedBy:"Regina",user:"小葵",ack:true}) ]); as("小葵","editor");
  ok("進行中的掛 st-doing", /commrow[^"]*st-doing/.test(viewChat())); }
{ reset([ t_("P1",{id:"P1",kind:"p2p",from:"小美",user:"小葵"}) ]); as("小葵","editor");
  ok("同事訊息不掛狀態色帶（本來就不用追蹤完成）",
     !/commrow[^"]*st-/.test(viewChat()), (viewChat().match(/class="commrow[^"]*"/g)||[])[0]); }

// ══════════ ⑥ 每日工作：回報框點開再寫 ══════════
{ reset([ t_("K1",{title:"自己排的一件事",report:""}) ]); as("小美","cs");
  const h=viewWork();
  ok("**回報框收在折疊裡**", /<details class="fold repfold"/.test(h), (h.match(/<details[^>]*repfold[^>]*>/)||[])[0]);
  ok("沒寫過的預設收起來", !/<details class="fold repfold" open/.test(h));
  ok("收合時寫「寫處理狀況…」", h.includes("寫處理狀況…"));
  ok("輸入框本身還在（只是收起來）", /id="tr_K1"/.test(h)); }
{ reset([ t_("K1",{title:"寫過的",report:"已經跟廠商確認完畢了，等他回覆"}) ]); as("小美","cs");
  const h=viewWork();
  ok("**已經寫過的預設展開**（收起來會讓人以為自己沒寫）",
     /<details class="fold repfold" open/.test(h), (h.match(/<details[^>]*repfold[^>]*>/)||[])[0]);
  ok("收合的標題上也看得到前幾個字", h.includes("已經跟廠商確認完畢")); }
{ ok("樣式用 details.repfold 才蓋得過 details.fold（不然折疊反而更佔位子）",
     /details\.repfold\{/.test(HTML) && /details\.repfold>summary\{/.test(HTML),
     (HTML.match(/details\.repfold[^{]*\{/g)||[])); }
// 交辦來的那種還是留言串，不要被順手改成回報框
{ reset([ t_("A1",{title:"主管派的",assignedBy:"Regina",user:"小美",ack:true}) ]); as("小美","cs");
  const h=viewWork();
  ok("主管交辦的還是用留言串（要跟老闆來回）", /postTaskMsg\('A1'\)/.test(h));
  ok("不會同時冒出回報框", !/id="tr_A1"/.test(h)); }

// ══════════ ⑦ 標題一致 ══════════
{ reset(); as("小美","cs");
  const h=viewWork();
  ok("**大標題跟分頁名一致（每日工作）**", /<h2>每日工作（/.test(h), (h.match(/<h2>[^<]*</)||[])[0]);
  ok("不再寫「本日工作」", !h.includes("本日工作"));
  ok("分頁名也是「每日工作」", myTabs().some(t=>t[1]==="每日工作"), myTabs().map(t=>t[1])); }
{ reset(); as("Anna","intl");
  // ⚠️ 剪輯／海外走的是另一個 view（viewWork），括號也是 paren() 產的半形，
  //    跟不剪片那一版的全形括號不同 —— 兩版都要改到，只改一版就會像現在這樣
  //    分頁寫「每日工作」、進去卻寫「Today's Work」。
  ok("海外的大標題是英文而且跟分頁一致", /<h2>My Day/.test(viewWork()), (viewWork().match(/<h2>[^<]*</)||[])[0]);
  ok("海外的分頁名也是 My Day", myTabs().some(t=>t[1]==="My Day"), myTabs().map(t=>t[1])); }
{ reset(); as("小葵","editor");
  ok("剪輯那一版的大標題也改了", /<h2>每日工作/.test(viewWork()) && !viewWork().includes("本日工作"),
     (viewWork().match(/<h2>[^<]*</)||[])[0]); }

// ══════════ ⑧ 沒有把別的弄壞 ══════════
{ let bad=null;
  [["管理員","boss"],["Regina","manager"],["HR","hr"],["小葵","editor"],["小美","cs"],["Anna","intl"]].forEach(([w,r])=>{
    reset([ t_("K1"), t_("A1",{assignedBy:"Regina",user:w}) ]); as(w,r);
    myTabs().forEach(t=>{ CUR_TAB=t[0]; CAL_YM=null;
      try{ render(); }catch(e){ bad=w+"/"+t[0]+": "+e.message; } });
  });
  ok("六種身分、每一個分頁都畫得出來", !bad, bad); }

console.log(`\nv182（版面收尾：折疊・讓位・小按鈕）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
