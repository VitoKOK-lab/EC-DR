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

// ══════════ ⑨ 「原本語言可能要調整」清單（v120）══════════
// 分區靠「原本語言」判斷源片，但那個欄位埋在編輯視窗的「進階」裡、預設收起來，
// 舊資料幾乎都沒設 —— 這張卡把可疑的挑出來讓主管一次設定。
function langFixture(){
  reset();
  const v_=(id,name,o)=>Object.assign({id,code:"26"+id,name,rawName:name,videoCopy:"",rawLink:"http://raw",
    stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,publishedLink:"",driveFolder:"",
    locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
  STATE.videos=[
    v_("TH1","หินธรรมชาติจากคัดลัง ราคา 5,000"),                      // 泰文字 → 建議泰文
    v_("EN1","Growing Up Taiwanese and Pakistani | Meet Tahir"),      // 純英文 → 建議英文
    v_("ZH1","05. 男生戴珠寶不娘？中東男人的寶石有多霸氣"),              // 中文 → 不列
    v_("NUM","2609041"),                                              // 只有數字 → 不列（猜不出來就別亂猜）
    v_("SET","Already Thai",{origLang:"th"}),                          // 已經設好了 → 不列
    v_("SHP","Shopee shell",{channel:"shopee",sourceVideoId:"ZH1"}),   // 版本殼 → 不列（只看源片）
  ];
}
langFixture(); as("Regina","manager");
{ const ids=origLangSuspects().map(v=>v.id).sort().join(",");
  ok("挑出泰文與英文標題的源片", ids==="EN1,TH1");
  ok("中文標題不列", !ids.includes("ZH1"));
  ok("只有數字的不亂猜", !ids.includes("NUM"));
  ok("已經設好的不列", !ids.includes("SET"));
  ok("版本殼不列（只看源片）", !ids.includes("SHP"));
  ok("泰文標題建議泰文", guessOrigLang(vid("TH1"))==="th");
  ok("英文標題建議英文", guessOrigLang(vid("EN1"))==="en");
  ok("中文標題不建議", guessOrigLang(vid("ZH1"))===""); }
{ const c=origLangFixCard();
  ok("卡片列出兩支", c.includes("หินธรรมชาติ") && c.includes("Growing Up Taiwanese"));
  ok("每支有自己的下拉", c.includes('id="olf_TH1"') && c.includes('id="olf_EN1"'));
  ok("下拉預選建議的語言", /id="olf_TH1"[\s\S]*?value="th" selected/.test(c));
  ok("有儲存鍵", c.includes("saveOrigLangFixes()"));
  ok("影片庫上看得到這張卡", (ZONE_VIEW="tw", viewVideos().includes("原本語言可能要調整"))); }
for(const [u,r,should] of [["Regina","manager",true],["管理員","boss",true],
                           ["小葵","editor",false],["HR小姐","hr",false]]){
  as(u,r);
  ok(`${r} ${should?"看得到":"看不到"}這張卡`, (origLangFixCard()!=="")===should);
}
// 儲存：只寫真的有改的，中文那些不動
langFixture(); as("Regina","manager");
fields={olf_TH1:"th", olf_EN1:""};        // 第二支被人改回中文 → 不該寫
await saveOrigLangFixes(); await wait();
{ const w=writes.filter(x=>x[0]==="update");
  ok("只寫有改的那一支", w.length===1 && w[0][1]==="videos" && w[0][2]==="TH1" && w[0][3].origLang==="th");
  ok("改回中文的那支沒被寫", !w.some(x=>x[2]==="EN1"));
  ok("順手更新 updatedAt", !!w[0][3].updatedAt); }
langFixture(); as("Regina","manager");
fields={olf_TH1:"", olf_EN1:""};
await saveOrigLangFixes(); await wait();
ok("全部維持中文就不寫任何東西", writes.length===0 && toasts.some(t=>t.includes("沒有要調整")));
// 設好之後就真的換區了
langFixture(); as("Regina","manager");
vid("TH1").origLang="th";
ok("設成泰文之後歸海外", zoneOfVideo(vid("TH1"))==="intl");
ok("設好的那支就從清單消失", !origLangSuspects().map(v=>v.id).includes("TH1"));
as("小葵","editor");
ok("台灣剪輯的池裡也沒有它了", !poolAll().map(v=>v.id).includes("TH1"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
