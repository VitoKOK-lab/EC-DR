// v120：同事之間傳訊息（kind:"p2p"）。
//
// 原本站內只有「上對下」（交辦、HR 通知）與「下對上」（找主管／人資說一件事），
// 員工彼此傳不了訊息。這支測新加的那條路。
//
// 三步做完才算結束：
//   ① 收件人按「收到」 ② 收件人回覆 ③ 發訊人看完回覆按「收到」
// 任何一步沒做完，它就一直留在「該做那一步的人」畫面上 —— 完成才會消失。
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
let modalHTML="", viewEl=el(), fields={}, toasts=[];
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(Object.prototype.hasOwnProperty.call(fields,id)) return {value:fields[id]};
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
let writes=[];
function reset(){
  modalHTML=""; fields={}; toasts=[]; writes=[];
  STATE={ users:[{name:"小葵",role:"editor"},{name:"郁莚",role:"editor"},{name:"小美",role:"cs"},
                 {name:"Anna",role:"intl"},{name:"Asmeer",role:"intl"},
                 {name:"HR小姐",role:"hr"},{name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; POOL_FILTER="all"; POOL_Q="";
  TEAM_GROUP="all"; TEAM_Q="";
  global.window.DB={
    set:async(c,id,rec)=>{ writes.push(["set",c,id,rec]); if(c==="tasks") STATE.tasks[id]=rec; },
    update:async(c,id,p)=>{ writes.push(["update",c,id,p]); if(c==="tasks") Object.assign(STATE.tasks[id],p); },
    del:async(c,id)=>{ writes.push(["del",c,id]); if(c==="tasks") delete STATE.tasks[id]; },
    scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const wait=()=>new Promise(r=>setTimeout(r,40));
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{

// ══════════ ① 可以傳給誰：同區的同事 ══════════
reset(); as("小葵","editor");
{ const t=p2pTargets().map(u=>u.name);
  ok("台灣員工看得到台灣同事", t.includes("郁莚") && t.includes("小美"));
  ok("看不到自己", !t.includes("小葵"));
  ok("看不到海外同事", !t.includes("Anna") && !t.includes("Asmeer"));
  ok("看不到管理層（他們走「找主管／人資說一件事」）",
     !t.includes("Regina") && !t.includes("管理員") && !t.includes("HR小姐")); }
reset(); as("Anna","intl");
{ const t=p2pTargets().map(u=>u.name);
  ok("海外員工只看得到海外同事", t.includes("Asmeer") && !t.includes("小葵") && !t.includes("小美")); }
reset(); as("Regina","manager");
ok("主管兩區的人都傳得到", (()=>{ const t=p2pTargets().map(u=>u.name);
  return t.includes("小葵") && t.includes("Anna"); })());

// ══════════ ② 送出 ══════════
reset(); as("小葵","editor");
fields={p2p_to:"", p2p_txt:"明天的毛片我先剪哪一支？"};
await sendP2P(); await wait();
ok("沒選收件人不會送出", writes.length===0 && toasts.some(t=>t.includes("選擇要傳給誰")));
fields={p2p_to:"郁莚", p2p_txt:""};
await sendP2P(); await wait();
ok("沒寫內容不會送出", writes.length===0 && toasts.some(t=>t.includes("寫下你想說的事")));
fields={p2p_to:"郁莚", p2p_txt:"明天的毛片我先剪哪一支？"};
await sendP2P(); await wait();
{ const rec=(writes.find(w=>w[0]==="set")||[])[3]||{};
  ok("送出寫進 tasks", writes.some(w=>w[0]==="set" && w[1]==="tasks"));
  ok("kind 是 p2p（不會混進交辦成效）", rec.kind==="p2p" && !isTask(rec));
  ok("user＝收件人、from＝發訊人", rec.user==="郁莚" && rec.from==="小葵");
  ok("三個確認旗標都是未完成", rec.ack===false && rec.reply==="" && rec.fromSeen===false);
  ok("內容有存進去", rec.title==="明天的毛片我先剪哪一支？"); }
const MID=Object.keys(STATE.tasks)[0];

// ══════════ ③ 三步流程：每一步沒做完就不會消失 ══════════
// 第 0 步：收件人有一則待接收
as("郁莚","editor");
ok("收件人看得到這則", p2pInbox().map(m=>m.id).includes(MID));
{ const w=viewWork();
  ok("收件匣卡片出現", w.includes("同事來訊") && w.includes("明天的毛片我先剪哪一支？"));
  ok("有「收到」按鈕", w.includes(`p2pAck('${MID}')`));
  ok("還沒按收到就沒有回覆框", !w.includes(`p2pr_${MID}`)); }
as("小葵","editor");
{ const w=viewWork();
  ok("發訊人看得到自己發出去的", w.includes("傳訊息給同事") && w.includes("等他按收到"));
  ok("對方還沒回，發訊人沒有「收到」鍵", !w.includes(`p2pSeen('${MID}')`)); }

// 第 ① 步：收件人按「收到」
as("郁莚","editor"); p2pAck(MID); await wait();
ok("按了收到會寫進資料庫", STATE.tasks[MID].ack===true && !!STATE.tasks[MID].ackAt);
ok("按了收到還沒回覆 → 仍留在收件匣", p2pInbox().map(m=>m.id).includes(MID));
{ const w=viewWork();
  ok("按了收到之後出現回覆框", w.includes(`p2pr_${MID}`) && w.includes(`p2pReply('${MID}')`)); }
as("小葵","editor");
ok("發訊人看得到對方已經接收", viewWork().includes("他已經按收到"));

// 第 ② 步：收件人回覆
as("郁莚","editor"); fields={["p2pr_"+MID]:"你"};
p2pReply(MID); await wait();
ok("回覆太短擋下來", !STATE.tasks[MID].reply && toasts.some(t=>t.includes("簡單回覆")));
fields={["p2pr_"+MID]:"先剪 P271 那支，客戶在等"};
p2pReply(MID); await wait();
ok("回覆寫進資料庫", STATE.tasks[MID].reply==="先剪 P271 那支，客戶在等" && !!STATE.tasks[MID].replyAt);
ok("回覆完就從收件匣消失", !p2pInbox().map(m=>m.id).includes(MID));
ok("收件匣空了整張卡不出現", p2pInboxCard()==="");

// 第 ③ 步：發訊人看完回覆按「收到」
as("小葵","editor");
ok("發訊人這邊還在（還沒按收到）", p2pSent().map(m=>m.id).includes(MID));
{ const w=viewWork();
  ok("看得到對方的回覆內容", w.includes("先剪 P271 那支，客戶在等"));
  ok("出現「收到」鍵", w.includes(`p2pSeen('${MID}')`)); }
p2pSeen(MID); await wait();
ok("按了收到寫進資料庫", STATE.tasks[MID].fromSeen===true && !!STATE.tasks[MID].fromSeenAt);
ok("三步做完就從發訊人畫面消失", !p2pSent().map(m=>m.id).includes(MID));
as("郁莚","editor");
ok("收件人那邊也已經消失", !p2pInbox().map(m=>m.id).includes(MID));

// ══════════ ④ 沒做完就不會被時間沖掉（跨天也還在）══════════
reset(); as("郁莚","editor");
STATE.tasks.OLD={id:"OLD",kind:"p2p",user:"郁莚",from:"小葵",date:"2020-01-01",
  title:"很久以前的訊息",ack:false,reply:"",fromSeen:false,createdAt:"2020-01-01T09:00:00"};
ok("很久以前沒接收的訊息還在", p2pInbox().map(m=>m.id).includes("OLD"));
STATE.tasks.OLD.ack=true;
ok("接收了但沒回覆，還是在", p2pInbox().map(m=>m.id).includes("OLD"));
STATE.tasks.OLD.reply="知道了";
ok("回覆之後才從收件匣離開", !p2pInbox().map(m=>m.id).includes("OLD"));
as("小葵","editor");
ok("發訊人那邊還在，等他按收到", p2pSent().map(m=>m.id).includes("OLD"));

// ══════════ ⑤ 不會污染交辦成效 ══════════
reset(); as("郁莚","editor");
STATE.tasks.P1={id:"P1",kind:"p2p",user:"郁莚",from:"小葵",date:T0,title:"訊息",ack:false,reply:"",fromSeen:false,createdAt:T0+"T09:00:00"};
STATE.tasks.K1={id:"K1",user:"郁莚",date:T0,title:"真的交辦",report:"",done:false,assignedBy:"Regina",ack:true,createdAt:T0+"T09:00:00"};
ok("交辦清單只有真的交辦", myTasks().map(t=>t.id).join(",")==="K1");
ok("p2p 不算交辦", !isTask(STATE.tasks.P1) && isTask(STATE.tasks.K1));
ok("p2p 也不是 HR 通知、不是給主管的訊息", !isNotice(STATE.tasks.P1) && !isMsg(STATE.tasks.P1));

// ══════════ ⑥ 主管與管理員看得到，其他人看不到 ══════════
reset();
STATE.tasks.P1={id:"P1",kind:"p2p",user:"郁莚",from:"小葵",date:T0,title:"兩個人的對話",ack:true,reply:"好",fromSeen:false,createdAt:T0+"T09:00:00"};
for(const [u,r,should] of [["Regina","manager",true],["管理員","boss",true],
                           ["HR小姐","hr",false],["小美","cs",false]]){
  as(u,r);
  const seen=p2pWatchCard().includes("兩個人的對話");
  ok(`${r} ${should?"看得到":"看不到"}同事之間的訊息`, seen===should);
}
as("Regina","manager");
ok("主管的看板上有這張卡", viewTeam().includes("同事之間的訊息"));
{ const c=p2pWatchCard();
  ok("寫得出誰發給誰", c.includes("小葵") && c.includes("郁莚"));
  ok("寫得出狀態", c.includes("已回覆")); }

// ══════════ ⑦ 唯讀預覽不能代發 ══════════
reset(); as("管理員","boss"); VIEW_AS="小葵";
fields={p2p_to:"郁莚", p2p_txt:"代發的訊息"};
await sendP2P(); await wait();
ok("員工視角（唯讀）不能代發訊息", writes.length===0);
VIEW_AS=null;

// ══════════ ⑧ render 不炸 ══════════
reset();
STATE.tasks.P1={id:"P1",kind:"p2p",user:"郁莚",from:"小葵",date:T0,title:"訊息",ack:false,reply:"",fromSeen:false,createdAt:T0+"T09:00:00"};
for(const [u,r] of [["小葵","editor"],["郁莚","editor"],["小美","cs"],["Anna","intl"],
                    ["HR小姐","hr"],["Regina","manager"],["管理員","boss"]]){
  as(u,r); VIEW_AS=null; CAL_YM=null; CAL_PLAT="tw"; VID_LANG=""; ZONE_VIEW="tw";
  for(const [tab] of myTabs()){
    CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab} 畫得出來`, viewEl.innerHTML.length>40); }
    catch(e){ ok(`[${r}] ${tab} 畫得出來 → `+e.message, false); }
  }
}

// ══════════ ⑨ 原本語言：確定的自動搬、不確定的才問人（v120／v123）══════════
// 分區靠「原本語言」判斷源片，舊資料幾乎都沒設 —— 泰文／英文拍的原創會一直留在台灣區。
// v123：判斷不再只看標題（腳本是老闆用中文寫的，標題常常也是中文），
//       改成標題＋原始片名＋口播稿一起看，並分成「確定」與「不確定」兩種處理。
function langFixture(){
  reset();
  ORIG_AUTO_RAN=false;
  const v_=(id,name,o)=>Object.assign({id,code:"26"+id,name,rawName:name,videoCopy:"",rawLink:"http://raw",
    stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,publishedLink:"",driveFolder:"",
    locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
  STATE.videos=[
    v_("TH1","หินธรรมชาติจากคัดลัง ราคา 5,000"),                      // 泰文字 → 確定泰文
    v_("TH2","泰國師傅示範：這種石頭不要買",{videoCopy:"วันนี้ผมจะสอน"}),   // 標題中文、口播稿泰文 → 一樣確定
    v_("ENC","Meet Tahir",{videoCopy:"Today I want to show you three stones"}), // 英文口播稿 → 確定英文
    v_("EN1","Growing Up Taiwanese and Pakistani | Meet Tahir"),      // 只有標題像英文、沒稿 → 要人看
    v_("ZH1","05. 男生戴珠寶不娘？中東男人的寶石有多霸氣"),              // 中文 → 不列
    v_("NUM","2609041"),                                              // 只有數字 → 不列（猜不出來就別亂猜）
    v_("SET","Already Thai",{origLang:"th"}),                          // 已經設好了 → 不列
    v_("SHP","Shopee shell",{channel:"shopee",sourceVideoId:"ZH1"}),   // 版本殼 → 不列（只看源片）
  ];
}
langFixture(); as("Regina","manager");
{ const g=(id)=>origLangGuess(vid(id));
  ok("泰文字＝確定泰文", g("TH1").lang==="th" && g("TH1").sure);
  ok("標題中文但口播稿是泰文＝一樣確定", g("TH2").lang==="th" && g("TH2").sure);
  ok("英文口播稿＝確定英文", g("ENC").lang==="en" && g("ENC").sure);
  ok("只有標題像英文＝猜得到但不確定", g("EN1").lang==="en" && !g("EN1").sure);
  ok("中文標題不猜", g("ZH1").lang==="");
  ok("只有數字的不亂猜", g("NUM").lang===""); }
{ const auto=origAutoList().map(v=>v.id).sort().join(",");
  ok("自動搬的只收確定的那三支", auto==="ENC,TH1,TH2");
  ok("不確定的不自動搬", !auto.includes("EN1"));
  ok("已經設好的不自動搬", !auto.includes("SET"));
  ok("版本殼不自動搬（只看源片）", !auto.includes("SHP")); }
{ const ids=origLangSuspects().map(v=>v.id).sort().join(",");
  ok("卡片只留不確定的", ids==="EN1");
  ok("確定的不再問人（已自動搬）", !ids.includes("TH1") && !ids.includes("ENC")); }
{ const c=origLangFixCard();
  ok("卡片列出那一支", c.includes("Growing Up Taiwanese"));
  ok("有自己的下拉且預選建議", /id="olf_EN1"[\s\S]*?value="en" selected/.test(c));
  ok("有儲存鍵", c.includes("saveOrigLangFixes()"));
  ok("影片庫上看得到這張卡", (ZONE_VIEW="tw", viewVideos().includes("原本語言可能要調整"))); }
for(const [u,r,should] of [["Regina","manager",true],["管理員","boss",true],
                           ["小葵","editor",false],["HR小姐","hr",false]]){
  as(u,r);
  ok(`${r} ${should?"看得到":"看不到"}這張卡`, (origLangFixCard()!=="")===should);
}
// 自動搬：確定的三支直接寫，其餘一律不碰
langFixture(); as("Regina","manager");
await autoMoveOrigLang(); await wait();
{ const w=writes.filter(x=>x[0]==="update"&&x[1]==="videos");
  const m={}; w.forEach(x=>{ m[x[2]]=x[3].origLang; });
  ok("自動搬了三支", w.length===3);
  ok("泰文字的設成 th", m.TH1==="th");
  ok("口播稿是泰文的也設成 th", m.TH2==="th");
  ok("英文口播稿的設成 en", m.ENC==="en");
  ok("不確定的沒被自動改", !("EN1" in m));
  ok("順手更新 updatedAt", w.every(x=>!!x[3].updatedAt));
  ok("有寫進操作紀錄", writes.some(x=>x[1]==="logs" && String(x[3]&&x[3].action||"").includes("自動調整原本語言")));
  ok("有跟人說搬了幾支", toasts.some(t=>t.includes("已自動把 3 支"))); }
// 同一次載入只跑一次（寫入會再觸發一次同步，不能讓它自己叫自己）
{ const before=writes.length; await autoMoveOrigLang(); await wait();
  ok("第二次呼叫不重複寫", writes.length===before); }
// 沒有可搬的就完全不動作
langFixture(); as("Regina","manager");
STATE.videos.forEach(v=>{ if(origAutoMovable(v)) v.origLang=origLangGuess(v).lang; });
await autoMoveOrigLang(); await wait();
ok("都搬完了就不再寫任何東西", writes.length===0);
// 剪輯不會觸發自動搬（只有管理員／經理人跑）
langFixture(); as("小葵","editor");
await autoMoveOrigLang(); await wait();
ok("剪輯不觸發自動搬", writes.length===0);
// 儲存：只寫真的有改的，中文那些不動
langFixture(); as("Regina","manager");
fields={olf_EN1:"en"};
await saveOrigLangFixes(); await wait();
{ const w=writes.filter(x=>x[0]==="update");
  ok("只寫有改的那一支", w.length===1 && w[0][1]==="videos" && w[0][2]==="EN1" && w[0][3].origLang==="en");
  ok("順手更新 updatedAt", !!w[0][3].updatedAt); }
langFixture(); as("Regina","manager");
fields={olf_EN1:""};                       // 被人改回中文 → 不該寫
await saveOrigLangFixes(); await wait();
ok("全部維持中文就不寫任何東西", writes.length===0 && toasts.some(t=>t.includes("沒有要調整")));
// 設好之後就真的換區了
langFixture(); as("Regina","manager");
vid("TH1").origLang="th";
ok("設成泰文之後歸海外", zoneOfVideo(vid("TH1"))==="intl");
ok("設好的那支就不再是待搬的", !origAutoList().map(v=>v.id).includes("TH1"));
as("小葵","editor");
ok("台灣剪輯的池裡也沒有它了", !poolAll().map(v=>v.id).includes("TH1"));

// ══════════ ⑩ 月排程的日期視窗全員都進得去、也改得動（v121）══════════
// 原本 canSchedule() 只放行經理人與管理員，連日期格子的 onclick 都不給剪輯 ——
// 但剪輯在影片庫本來就改得到「預排上片日期」，在月曆擋住只是讓他們連
// 「那天排了什麼」都看不到，擋不住任何東西。
function calFixture(){
  reset();
  const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
  const TOM=D(1);
  STATE.settings.intlAccounts=[{locale:"en",name:"acctEN"}];
  STATE.settings.shopeeAccounts=["蝦皮A"];
  STATE.videos=[
    {id:"ZH",code:"26ZH",name:"中文毛片",rawName:"中文毛片",videoCopy:"",rawLink:"http://raw",
     stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:TOM,publishTime:"10:00",
     publishedLink:"",driveFolder:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},
    {id:"SHP",code:"26SHP",name:"蝦皮版",rawName:"蝦皮版",channel:"shopee",sourceVideoId:"ZH",account:"蝦皮A",
     stage:"待處理",scheduledDate:TOM,publishedLink:"",driveFolder:"",locale:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},
    {id:"EN",code:"26EN",name:"英文版",rawName:"英文版",locale:"en",sourceVideoId:"ZH",account:"acctEN",
     stage:"待處理",scheduledDate:TOM,publishedLink:"",driveFolder:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},
  ];
  CAL_PLAT="tw"; CAL_YM=null; INTL_CAL_YM=null; INTL_ACCT="acctEN";
  CH_CAL={shopee:{ym:null,acct:"蝦皮A"},ms:{ym:null,acct:""}};
  return TOM;
}
{ const TOM=calFixture();
  for(const [u,r] of [["小葵","editor"],["Regina","manager"],["管理員","boss"]]){
    as(u,r); modalHTML=""; toasts.length=0;
    openDay(TOM);
    ok(`${r} 打得開中文月曆的日期視窗`, modalHTML.includes("中文毛片"));
    ok(`${r} 沒被擋掉`, !toasts.some(t=>t.includes("只有")));
    ok(`${r} 改得了上片日`, modalHTML.includes("rescheduleVid('ZH'"));
    ok(`${r} 移得出排程`, modalHTML.includes("unscheduleVid('ZH'"));
    ok(`${r} 排得進新的片`, modalHTML.includes(`odAdd('${TOM}')`));
  }
  // 蝦皮／馬來那條線
  as("小葵","editor"); modalHTML=""; openDayCh("shopee",TOM);
  ok("剪輯打得開蝦皮的日期視窗", modalHTML.includes("蝦皮版"));
  ok("剪輯改得了蝦皮版的日期", modalHTML.includes("chReschedule('shopee','SHP'"));
  // 海外那條線
  as("Anna","intl"); modalHTML=""; openDayIntl(TOM);
  ok("海外剪輯打得開自己的日期視窗", modalHTML.includes("英文版"));
  ok("海外剪輯改得了自己的日期", modalHTML.includes("intlReschedule('EN'"));
  // 月曆格子本身要點得下去
  as("小葵","editor"); CAL_PLAT="tw"; CAL_YM=null;
  { const c=viewCal();
    ok("剪輯的月曆格子有 onclick", c.includes("openDay('"));
    ok("沒有鎖住（locked）的格子", !c.includes("locked")); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
