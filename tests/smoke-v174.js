// v174：交辦變成「全公司都能派」，追蹤留在發訊方直到按 OK；另加「草稿」。
//
// 老闆的話（原文）：
//   「每一個人都要有員工卡，他們才能接收任務（我覺的應該有吧?不然他們平日怎麼互動?）
//     交辨追縱，就是看誰發出去的（包含員工）對方有回或是沒有回，都會留在發訊方，
//     直到發訊方按下「ok」才會封存起來，不然可以一直互動，互傳。
//     然後我要加一個草稿，可以先預寫訊息，讓自己可以先記錄，然後還沒有決定要發給誰
//     （包含可以用照片的訊息），等發送出去才會離開草稿。」
//
// 三件事：
//   ① 交辦卡不再是主管專用 —— 員工的「上班計畫／本日工作」上也有同一張
//   ② 封存的條件是**發訊的人按 OK**，不是「對方打勾完成」
//   ③ 草稿：只有自己看得到、沒有收件人；送出去成功了才會離開草稿
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,files:null,
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
const d_=(id,o)=>Object.assign({id,kind:"draft",by:"小葵",user:"",text:"草稿內容"+id,pic:"",contact:"",
  createdAt:D(0)+"T09:00:00",updatedAt:D(0)+"T09:00:00"},o||{});
let calls=[];
function reset(tasks){
  ASG_TRACK="open"; ASG_SCOPE="mine"; ASG_FROM_DRAFT=""; ASG_PIC=null; ASG_PIC_URL="";
  VIEW_AS=null; BRAND=""; FOLD_OPEN={}; fields={}; checked=[]; calls=[]; modalHTML="";
  global.window.DB={
    set:async(c,i,d)=>{calls.push(["set",c,i,d]);}, update:async(c,i,d)=>{calls.push(["update",c,i,d]);},
    del:async(c,i)=>{calls.push(["del",c,i]);}, scheduleSet:async()=>{}, setSettings:async()=>{},
    uploadTaskPic:async(a,b,blob)=>{ calls.push(["upload",a,b]); return "https://storage.example/"+a+".jpg"; },
    videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const map={}; (tasks||[]).forEach(t=>{ map[t.id]=t; });
  const raw={ users:[{name:"小葵",role:"editor"},{name:"小美",role:"cs"},{name:"怡萍",role:"pick"},
                     {name:"Anna",role:"intl"},{name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:map, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
}
const wait=()=>new Promise(r=>setTimeout(r,15));

(async()=>{

// ══════════ ① 每個人都派得動（交辦卡不再是主管專用）══════════
{ reset([]); as("小葵","editor");
  const tabs=myTabs().map(t=>t[0]);
  ok("（前提）剪輯沒有儀表板那一頁", !tabs.includes("dashboard"), tabs);
  // v183：交辦卡跟交辦追蹤搬到「傳訊息」了（老闆：「為什麼每日工作裡又有溝通…
  // 全部移到溝通去」）。「每個人都派得動」這件事沒變，只是換了一頁。
  const c=viewChat();
  ok("**剪輯在「傳訊息」上有這張卡**", /class="asg_p"/.test(c) && c.includes("傳訊息"), c.slice(0,160));
  ok("剪輯也看得到交辦追蹤", c.includes("交辦追蹤"));
  ok("**每日工作上沒有了**", !/class="asg_p"/.test(viewWork()) && !viewWork().includes("交辦追蹤")); }
{ reset([]); as("小美","cs");
  const c=viewChat();
  ok("**客服在「傳訊息」上也有這張卡**", /class="asg_p"/.test(c));
  ok("客服也看得到交辦追蹤", c.includes("交辦追蹤"));
  ok("**客服的每日工作上也沒有了**", !/class="asg_p"/.test(viewWork())); }
{ reset([]); as("管理員","boss");
  ok("主管的儀表板照舊有那張卡（沒有被搬走）", /class="asg_p"/.test(viewDashboard())); }
// 自己不會出現在自己的名單上
{ reset([]); as("小葵","editor");
  const h=dashAssignTaskCard();
  ok("**自己不在名單上**（自己派給自己是假的一筆）", !/value="小葵"/.test(h), (h.match(/value="[^"]+"/g)||[]));
  ok("同事都在名單上", /value="小美"/.test(h) && /value="怡萍"/.test(h)); }
{ reset([]); as("小美","cs");
  ok("換一個人看，換那個人不在名單上", !/value="小美"/.test(dashAssignTaskCard()) && /value="小葵"/.test(dashAssignTaskCard())); }
// 員工視角是唯讀預覽，不該給他派東西的入口
{ reset([]); as("管理員","boss"); VIEW_AS={name:"小葵",role:"editor"};
  ok("員工視角不畫追蹤卡", dashAssignTrackCard()===""); VIEW_AS=null; }

// ══════════ ② 海外同仁看到的是英文（這張卡以前只在儀表板，海外走不到）══════════
{ reset([]); as("Anna","intl");
  const h=viewChat();
  ok("海外也有這張卡", /class="asg_p"/.test(h));
  const card=h.slice(h.indexOf("asg_txt")-1400, h.indexOf("asg_txt")+900);
  // 同事的名字本來就是中文（那是資料，不是介面），先拿掉再看有沒有漏中文。
  // 介面本身的全面檢查另有 audit-lang.js（那支的員工名字都是 ASCII）。
  const names=(STATE.users||[]).map(u=>u.name);
  const uiOnly=names.reduce((s,n)=>s.split(n).join(""), card);
  ok("**海外的交辦卡沒有漏中文**", !/[一-鿿]/.test(uiOnly), (uiOnly.match(/[一-鿿]+/g)||[]).slice(0,6)); }
{ reset([]); as("Anna","intl");
  const g=staffRoleGroups(["editor","cs","pick","intl"]);
  ok("分組標題是英文（以前寫死中文，會直接漏出去）",
     g.every(x=>!/[一-鿿]/.test(x.label)), g.map(x=>x.label)); }
{ reset([]); as("小葵","editor");
  const g=staffRoleGroups(["editor","cs","pick"]);
  ok("中文介面還是中文（沒有反過來漏英文）", g.some(x=>x.label==="剪輯"), g.map(x=>x.label)); }

// ══════════ ③ 按 OK 才封存 ══════════
{ reset([ t_("T1",{assignedBy:"小葵",user:"小美",done:true,doneAt:D(-1)+"T10:00:00"}) ]);
  as("小葵","editor");
  archiveTask("T1", true); await wait();
  const c=calls.find(x=>x[0]==="update" && x[1]==="tasks");
  ok("按 OK 會寫 archived=true", !!c && c[3].archived===true, c&&c[3]);
  ok("而且記下是誰、什麼時候收的", !!c && c[3].archivedBy==="小葵" && /^\d{4}-\d{2}-\d{2}T/.test(String(c[3].archivedAt||"")), c&&c[3]);
  ok("**只寫封存那幾個欄位，不會順手把 done 改掉**",
     !!c && !("done" in c[3]) && !("report" in c[3]) && !("title" in c[3]), c&&Object.keys(c[3])); }
{ reset([ t_("T1",{assignedBy:"小葵",archived:true,archivedAt:D(-1)+"T10:00:00",archivedBy:"小葵"}) ]);
  as("小葵","editor");
  archiveTask("T1", false); await wait();
  const c=calls.find(x=>x[0]==="update" && x[1]==="tasks");
  ok("重新打開會把 archived 清掉", !!c && c[3].archived===false && c[3].archivedAt==="", c&&c[3]); }
{ reset([ t_("T1",{assignedBy:"Regina",user:"小葵"}) ]);
  as("小葵","editor");
  archiveTask("T1", true); await wait();
  ok("**被交辦的人按不動別人派的 OK（擋在寫入之前）**",
     !calls.some(x=>x[0]==="update"), calls.map(x=>x[0])); }
// 分類的依據是「我收了沒」，不是「他做完沒」—— 這是整個 v174 的核心
{ reset([ t_("T1",{assignedBy:"小葵",user:"小美",done:true,doneAt:D(-1)+"T10:00:00"}),
          t_("T2",{assignedBy:"小葵",user:"小美",done:false}) ]);
  as("小葵","editor"); ASG_TRACK="open";
  const h=dashAssignTrackCard();
  const n=(s)=>{ const m=h.match(new RegExp(s+"<\\/span> <span class=\"vtab-n\">(\\d+)<")); return m?+m[1]:null; };
  ok("**對方打勾完成了，還是算「還沒收」**（我沒按 OK）", n("還沒收")===2, n("還沒收"));
  ok("已封存是 0（我一個都還沒按）", n("已封存")===0, n("已封存")); }
// 封存之後就不再算「拖了幾天」
{ reset([ t_("T1",{assignedBy:"管理員",date:D(-9),archived:true,archivedAt:D(-1)+"T10:00:00"}) ]);
  as("管理員","boss"); ASG_TRACK="arch";
  ok("封存的不再喊「拖了幾天」（已經結案了，講天數沒意義）",
     !/拖了 \d+ 天/.test(dashAssignTrackCard()), (dashAssignTrackCard().match(/拖了[^<]*/)||[])[0]); }
{ reset([ t_("T1",{assignedBy:"管理員",date:D(-9)}) ]);
  as("管理員","boss"); ASG_TRACK="open";
  ok("（對照）沒封存的還是會喊拖了幾天", /拖了 9 天/.test(dashAssignTrackCard())); }

// ══════════ ④ 草稿 ══════════
{ reset([]); as("小葵","editor");
  fields.asg_txt="等一下要跟大家講的事"; fields.asg_contact="";
  await saveDraft(); await wait();
  const c=calls.find(x=>x[0]==="set" && x[1]==="tasks");
  ok("存得起來", !!c, calls.map(x=>x[0]));
  ok("**草稿是 kind:\"draft\"**（用 kind 分流，不會混進交辦成效）", !!c && c[3].kind==="draft", c&&c[3]);
  ok("**草稿沒有收件人**（還沒決定要發給誰）", !!c && c[3].user==="", c&&c[3]);
  ok("記下是誰的草稿", !!c && c[3].by==="小葵");
  ok("內容存進去了", !!c && c[3].text==="等一下要跟大家講的事");
  ok("存完把輸入框清掉", fields.asg_txt===""); }
{ reset([]); as("小葵","editor");
  fields.asg_txt="   ";
  await saveDraft(); await wait();
  ok("**沒字也沒圖就不要存空草稿**", !calls.some(x=>x[0]==="set"), calls.map(x=>x[0])); }
// 只有圖沒有字，也要存得起來
{ reset([]); as("小葵","editor");
  fields.asg_txt=""; ASG_PIC={fake:"blob"};
  await saveDraft(); await wait();
  const c=calls.find(x=>x[0]==="set" && x[1]==="tasks");
  ok("只貼一張圖、不打字也存得起來", !!c, calls.map(x=>x[0]));
  ok("圖有先上傳、網址存進草稿", !!c && /^https:\/\//.test(String(c[3].pic||"")), c&&c[3].pic); }
// 草稿是私人的：別人看不到
{ reset([ d_("D1",{by:"小葵"}), d_("D2",{by:"小美"}) ]);
  as("小葵","editor");
  const mine=myDrafts().map(x=>x.id);
  ok("**只看得到自己的草稿**", mine.length===1 && mine[0]==="D1", mine); }
{ reset([ d_("D1",{by:"小葵"}) ]);
  as("小葵","editor");
  ok("草稿不算交辦（isTask 認不得它）", isTask(taskById("D1"))===false);
  ok("草稿不會出現在任何人的待辦",
     myTasks().length===0 && realTasks(Object.values(STATE.tasks)).length===0);
  ok("草稿不會被算成「我派出去的」", myAssignedOut().length===0); }
{ reset([ d_("D1",{by:"小葵",text:"先記著的事"}) ]);
  as("小葵","editor");
  // v183：草稿夾從追蹤卡裡挪到「傳訊息」頁的最下面 —— 兩個都在同一頁上的話，
  // asg_draft_* 那些 id 會有兩份，點編輯會抓到上面那一份。
  const h=viewChat();
  ok("在「傳訊息」看得到自己的草稿", h.includes("先記著的事") && h.includes("我的草稿"));
  ok("草稿夾只有一份（id 不會重複）", (h.match(/我的草稿/g)||[]).length===1,
     (h.match(/我的草稿/g)||[]).length); }
{ reset([ d_("D1",{by:"小美"}) ]);
  as("小葵","editor");
  ok("別人的草稿不會出現在我的畫面上", !viewChat().includes("草稿內容D1")); }
// 載入草稿：這時候還沒送出去，草稿要留著
{ reset([ d_("D1",{by:"小葵",text:"帶上去的內容",pic:"https://storage.example/a.jpg"}) ]);
  as("小葵","editor");
  fields.asg_txt=""; fields.asg_contact="";
  loadDraft("D1");
  ok("**載入草稿不會刪掉它**（還沒送出去）", !calls.some(x=>x[0]==="del"), calls.map(x=>x[0]));
  ok("內容帶回輸入框", fields.asg_txt==="帶上去的內容", fields.asg_txt);
  ok("圖也帶回來了（用原本的網址，不會再傳一次）", ASG_PIC_URL==="https://storage.example/a.jpg" && ASG_PIC===null);
  ok("記住是從哪一則草稿帶上來的", ASG_FROM_DRAFT==="D1"); }
{ reset([ d_("D1",{by:"小美"}) ]);
  as("小葵","editor");
  loadDraft("D1");
  ok("**載不動別人的草稿**", ASG_FROM_DRAFT==="", ASG_FROM_DRAFT); }
// 送出去才離開草稿
{ reset([ d_("D1",{by:"小葵",text:"要發的內容",pic:"https://storage.example/a.jpg"}) ]);
  as("小葵","editor");
  loadDraft("D1");
  fields.asg_txt="要發的內容"; fields.asg_contact=""; checked=["小美"];
  await assignTaskSel(); await wait();
  const sets=calls.filter(x=>x[0]==="set" && x[1]==="tasks");
  ok("交辦真的送出去了", sets.length===1 && sets[0][3].user==="小美", sets.map(x=>x[3]&&x[3].user));
  ok("**送出去之後草稿才被刪掉**", calls.some(x=>x[0]==="del" && x[2]==="D1"), calls.map(x=>x[0]+":"+(x[2]||"")));
  ok("草稿裡那張圖直接沿用，不會再上傳一次", !calls.some(x=>x[0]==="upload"), calls.map(x=>x[0]));
  ok("圖有跟著送出去（收件人看得到）",
     sets[0][3].msgs && sets[0][3].msgs[0] && sets[0][3].msgs[0].pic==="https://storage.example/a.jpg", sets[0][3].msgs);
  ok("送完之後就不再綁著那則草稿", ASG_FROM_DRAFT===""); }
{ reset([ d_("D1",{by:"小葵",text:"要發的內容"}) ]);
  as("小葵","editor");
  loadDraft("D1");
  fields.asg_txt="要發的內容"; checked=[];        // 一個人都沒勾
  await assignTaskSel(); await wait();
  ok("**沒勾人就送不出去，草稿當然也不能刪**",
     !calls.some(x=>x[0]==="del"), calls.map(x=>x[0]));
  ok("而且還綁著那則草稿（回去改一改再送）", ASG_FROM_DRAFT==="D1"); }
// 改草稿：同一則更新，不會變成兩則
{ reset([ d_("D1",{by:"小葵",text:"舊內容",createdAt:D(-2)+"T09:00:00"}) ]);
  as("小葵","editor");
  loadDraft("D1");
  fields.asg_txt="改過的內容";
  await saveDraft(); await wait();
  const c=calls.find(x=>x[0]==="set" && x[1]==="tasks");
  ok("**改草稿是覆蓋同一則，不是再存一則**", !!c && c[2]==="D1", c&&c[2]);
  ok("內容換成新的", !!c && c[3].text==="改過的內容");
  ok("建立時間保留原本的（不要每改一次就跳到最前面）", !!c && c[3].createdAt===D(-2)+"T09:00:00", c&&c[3].createdAt); }
// 刪草稿
{ reset([ d_("D1",{by:"小美"}) ]);
  as("小葵","editor");
  delDraft("D1"); await wait();
  ok("**刪不動別人的草稿**", !calls.some(x=>x[0]==="del"), calls.map(x=>x[0])); }

// ══════════ ⑤ 安全：草稿的圖也只吃 https ══════════
{ reset([ d_("D1",{by:"小葵",pic:"javascript:alert(1)"}) ]);
  as("小葵","editor");
  const h=dashAssignTrackCard();
  ok("**草稿裡的 javascript: 不會變成 <img src>**", !h.includes("javascript:alert"), (h.match(/src="[^"]*"/g)||[])); }
{ reset([ d_("D1",{by:"小葵",text:'看這個 <img src=x onerror=alert(1)>'}) ]);
  as("小葵","editor");
  ok("草稿內容有跳脫，不會塞進標籤", !/<img src=x/.test(viewChat())); }
{ reset([ d_("D1",{by:"小葵",text:"參考這個 https://drive.google.com/drive/folders/ABC"}) ]);
  as("小葵","editor");
  ok("草稿裡的網址一樣會變成可以點的連結",
     /<a href="https:\/\/drive\.google\.com\/drive\/folders\/ABC"/.test(viewChat())); }
{ reset([]); as("小葵","editor");
  ok("草稿有上限，不會被無限灌爆", typeof DRAFT_MAX==="number" && DRAFT_MAX>0 && DRAFT_MAX<=200, DRAFT_MAX); }

// ══════════ ⑥ 每一頁都畫得出來 ══════════
{ let bad=null;
  [["管理員","boss"],["Regina","manager"],["小葵","editor"],["小美","cs"],["怡萍","pick"],["Anna","intl"]].forEach(([w,r])=>{
    reset([ t_("T1",{assignedBy:w}), d_("D1",{by:w}) ]); as(w,r);
    myTabs().forEach(t=>{ CUR_TAB=t[0]; CAL_YM=null;
      try{ render(); }catch(e){ bad=w+"/"+t[0]+": "+e.message; } });
  });
  ok("六種身分、每一個分頁都畫得出來", !bad, bad); }

console.log(`\nv174（全公司都能交辦・按 OK 才封存・草稿）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
