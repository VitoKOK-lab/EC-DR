// v184：兩件事
//
// ① 老闆：「這裡我往下滑看過去的留言，你停約三秒就會跳回最上面? 我無法看。」
//    交辦追蹤那一格自己會捲動，但沒有掛 keepscroll —— 每幾秒一次的資料同步
//    會整頁重畫，捲動位置就歸零。66 則的清單根本翻不到下面去。
//
// ② 老闆：「我需要加一個東西，是寵粉或銷售的我要有地方要提醒他們，
//          輸入商品名稱還有這個商品的官網連結。」
//    正式資料實測：181 支標了寵粉／銷售，其中 **30 支**沒有商品名稱或官網連結
//    —— 那些片觀眾看完不知道去哪買。
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
let modalHTML="", viewEl=el(), boxes={};
global.__toasts=[];
let MODAL="";
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(boxes[id]) return boxes[id];
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;MODAL=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,
  querySelectorAll:(sel)=>(global.__qsa&&global.__qsa[sel])||[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=(m)=>{ global.__toasts.push(String(m)); };
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const T0=FROZEN;

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
function as(w,r){ localStorage.setItem("ecdr_user",w); localStorage.setItem("ecdr_role",r); }
const p_=(id,o)=>Object.assign({id,kind:"p2p",user:"小美",from:"小葵",date:"",title:"同事的話",
  ack:false,reply:"",fromSeen:false,createdAt:"2000-01-01T09:00:00",msgs:[]},o||{});
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"文案",
  rawLink:"https://drive.google.com/drive/folders/RAW",cover:"",stage:"待處理",editor:"",claimedBy:"",
  assignedTo:"",scheduledDate:T0,publishTime:"",finishedAt:"",publishedLink:"",driveFolder:"",
  productUrl:"",note:"",mainType:"",source:"官方IP",refLink:"",reviewStatus:"",locale:"",channel:"",
  origLang:"",account:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(vids, tasks){
  VIEW_AS=null; BRAND=""; FOLD_OPEN={}; viewEl.innerHTML=""; modalHTML=""; ASG_TRACK="open"; ASG_SCOPE="mine";
  boxes={}; global.__qsa={};
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const t={}; (tasks||[]).forEach(x=>t[x.id]=x);
  const raw={ users:[{name:"小葵",role:"editor"},{name:"小美",role:"cs"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:["寵粉","銷售","流量型"],sources:["官方IP"],postPlatforms:[],
      intlAccounts:[],shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:t, shifts:{}, logs:[], deletedVideos:[], videos:vids||[] };
  LAST_RAW=raw; STATE=decorate(raw);
}

// ══════════ ① 捲到一半不會被彈回最上面 ══════════
// 老闆有 66 則交辦，那一格 max-height 520px，會自己捲。
{ const many=[]; for(let i=0;i<20;i++) many.push({id:"K"+i,user:"小葵",date:T0,title:"事情"+i,
    report:"",done:false,assignedBy:"Regina",ack:true,createdAt:T0+"T09:00:00"});
  reset([], many); as("Regina","manager");
  const h=dashAssignTrackCard();
  ok("（前提）真的多到會出現捲動條", h.includes("overflow-y:auto"), h.slice(0,120));
  ok("**交辦追蹤那一格掛了 keepscroll**", /class="keepscroll"[^>]*overflow-y:auto|id="asgtrack_scroll" class="keepscroll"/.test(h),
     (h.match(/<div id="[^"]*"[^>]*keepscroll[^>]*>/)||[])[0]);
  ok("**而且帶 id**（render 是靠 id 對回捲動位置的，沒 id 等於沒掛）",
     /id="asgtrack_scroll"/.test(h)); }
// 真的接得回去：模擬「捲到一半 → 重畫」
{ const many=[]; for(let i=0;i<20;i++) many.push({id:"K"+i,user:"小葵",date:T0,title:"事情"+i,
    report:"",done:false,assignedBy:"Regina",ack:true,createdAt:T0+"T09:00:00"});
  reset([], many); as("Regina","manager");
  const box=el(); box.id="asgtrack_scroll"; box.className="keepscroll"; box.scrollTop=380;
  const fakeView={ querySelectorAll:(sel)=>sel===".keepscroll[id]"?[box]:[],
                   querySelector:(sel)=>sel==='[id="asgtrack_scroll"]'?box:null };
  const snap=keepScrollSnapshot(fakeView);
  ok("重畫前記得住捲到哪裡", snap.asgtrack_scroll===380, snap);
  box.scrollTop=0;                       // 重畫等於整段 HTML 換掉，位置歸零
  keepScrollRestore(fakeView, snap);
  ok("**重畫後接得回去（不會跳回最上面）**", box.scrollTop===380, box.scrollTop); }
// 另外兩格會捲的清單也一起掛上（同一個病，不要只治一處）
{ ok("指派毛片那一格也掛了", /id="afp_scroll" class="keepscroll"/.test(APP));
  ok("原本語言那一格也掛了", /id="origlang_scroll" class="keepscroll"/.test(APP)); }
{ // 防「以後又加一格忘了掛」：會捲的清單一律要有 keepscroll
  const scrolls=(APP.match(/<div[^>]*overflow-y:auto[^>]*>/g)||[])
    .filter(x=>!x.includes("keepscroll"));
  ok("**沒有任何一格會捲的清單漏掛 keepscroll**", scrolls.length===0, scrolls.slice(0,3)); }

// ══════════ ② 寵粉／銷售 → 提醒填商品名稱與官網連結 ══════════
{ ok("兩種標籤就是要導購的片", PRODUCT_TAGS.includes("寵粉") && PRODUCT_TAGS.includes("銷售"), PRODUCT_TAGS);
  ok("沒標的片不管它", needsProduct(v_("V1",{tags:["流量型"]}))===false);
  ok("標了寵粉就要管", needsProduct(v_("V1",{tags:["寵粉"]}))===true);
  ok("標了銷售也要管", needsProduct(v_("V1",{tags:["銷售"]}))===true); }
{ const mk=(o)=>prodMissing(v_("V1",Object.assign({tags:["寵粉"]},o)));
  ok("**兩個都沒填 → 缺商品與連結**", (mk({})||{}).zh==="缺商品與連結", mk({}));
  ok("**只有品名 → 缺官網連結**",
     (mk({products:[{name:"項鍊"}]})||{}).zh==="缺商品官網連結", mk({products:[{name:"項鍊"}]}));
  ok("**只有連結 → 缺商品名稱**",
     (mk({productUrl:"https://x.tw/p/1"})||{}).zh==="缺商品名稱", mk({productUrl:"https://x.tw/p/1"}));
  ok("**兩個都填了就不再叫**",
     mk({products:[{name:"項鍊"}],productUrl:"https://x.tw/p/1"})===null);
  ok("空白的品名不算填（只打空格騙過去）",
     (mk({products:[{name:"   "}],productUrl:"https://x.tw/p/1"})||{}).zh==="缺商品名稱");
  ok("沒標寵粉／銷售的一律不叫", prodMissing(v_("V1",{tags:["流量型"]}))===null); }
// 燈號真的會亮出來，而且不會蓋掉更急的那幾項
{ reset([v_("V1",{tags:["寵粉"]})]);
  const v=STATE.videos[0];
  ok("**清單上的小燈號寫得出來**", missingPill(v).includes("缺"), missingPill(v));
  ok("缺商品也列在裡面", vidMissing(v).some(x=>x.k==="prod"), vidMissing(v).map(x=>x.k)); }
{ reset([v_("V1",{tags:["寵粉"],videoCopy:"",rawLink:""})]);
  const v=STATE.videos[0], m=vidMissing(v);
  ok("**缺文案／缺毛片排在缺商品前面**（那兩個是今天不能開工，商品是上片前補得完）",
     m[0].k!=="prod" && m[m.length-1].k==="prod", m.map(x=>x.k)); }
// 二創版本殼與大流量影片也適用（標籤跟著誰，燈號就跟著誰）
{ ok("版本殼標了也會叫", vidMissing(v_("V1",{tags:["銷售"],locale:"en",publishedLink:"https://x",
     scheduledDate:T0})).some(x=>x.k==="prod")); }

// ══════════ ②-b 月排程與影片庫都看得到這顆燈 ══════════
// 老闆：「如果沒有，在月排程或影片庫，都要有小提醒，讓人看到去補」
{ reset([v_("V1",{tags:["寵粉"],name:"要導購的片",scheduledDate:T0})]);
  as("Regina","manager"); CAL_YM=null; CAL_MODE="list"; CAL_PLAT="tw";
  const h=viewCal();
  ok("（前提）清單檢視真的畫出這一支", h.includes("要導購的片"), h.slice(0,150));
  ok("**月排程的清單檢視看得到「缺商品」**", /缺商品/.test(h),
     (h.match(/misspill[^<]*<\/span>|缺[^<]{0,8}/g)||[]).slice(0,4));
  CAL_MODE="grid";
  reset([v_("V2",{tags:["流量型"],name:"一般的片",scheduledDate:T0})]);
  as("Regina","manager"); CAL_MODE="list"; CAL_YM=null;
  ok("沒標寵粉／銷售的不會平白多一顆燈", !/缺商品/.test(viewCal()));
  CAL_MODE="grid"; }
{ reset([v_("V1",{tags:["銷售"],name:"要導購的片"})]);
  as("Regina","manager");
  VID_VIEW="raw"; VID_Q=""; VID_UNSCHED=false; VID_TAGS=new Set(); VID_LANG=""; ZONE_VIEW="tw";
  const h=viewVideos();
  ok("（前提）影片庫真的畫出這一支", h.includes("要導購的片"), h.slice(0,150));
  ok("**影片庫也看得到**", /缺商品/.test(h), (h.match(/misspill[^>]*>[^<]*/g)||[]).slice(0,4)); }
{ // 兩邊用的是同一顆燈，不是各做一個（兩份標準遲早會不一樣）
  ok("清單檢視用的就是 missingPill", /\$\{r\.v\?missingPill\(r\.v\):""\}/.test(APP)); }

// ══════════ ③ 提醒要在「他勾的當下」就出現 ══════════
{ ok("**標籤勾選會呼叫 prodHintSync**", /onchange="prodHintSync\(/.test(APP));
  ok("有提醒條這個東西", typeof prodHintHTML==="function");
  const on=prodHintHTML("e", true), off=prodHintHTML("e", false);
  ok("**標了就看得到**", !on.includes("display:none"), on.slice(0,80));
  ok("沒標就藏起來", off.includes("display:none"));
  ok("**話講清楚：兩個都要填**", on.includes("商品名稱") && on.includes("商品官網連結"), on);
  ok("CSS 有這一條的樣式", /\.prodhint\{/.test(HTML));
  ok("**不是紅色的**（這是「還要填」不是「你做錯了」）",
     /\.prodhint\{[^}]*--gold/.test(HTML), (HTML.match(/\.prodhint\{[^}]*\}/)||[])[0]); }
// 勾起來 → 提醒現身、商品那一折自動打開
{ const hint=el(); hint.style.display="none"; boxes["e_prodhint"]=hint;
  const foldEl=el(); foldEl.open=false; boxes["e_prodfold"]=foldEl;
  global.__qsa={".e_tag:checked":[{value:"寵粉"}]};
  prodHintSync("e");
  ok("**勾了寵粉 → 提醒當場出現**", hint.style.display==="", hint.style.display);
  ok("**而且把「商品與導購」打開**", foldEl.open===true); }
{ const hint=el(); hint.style.display=""; boxes["e_prodhint"]=hint;
  global.__qsa={".e_tag:checked":[{value:"流量型"}]};
  prodHintSync("e");
  ok("取消勾選就收起來", hint.style.display==="none"); }
{ global.__qsa={}; boxes={};
  let bad=null; try{ prodHintSync("e"); }catch(e){ bad=e.message; }
  ok("畫面上沒有那些元素時不會炸（新增視窗沒有標籤選單）", !bad, bad); }

// ══════════ ⑤ 「預排工作提醒」＝自己記給自己的 ══════════
// 老闆：「這個地方應該是『預排工作提醒』，這是給自己用的」
{ reset([], [{id:"F1",user:"小葵",date:"2099-01-01",title:"下週要做的事",report:"",done:false,
    createdAt:T0+"T09:00:00"}]);
  as("小葵","editor");
  const w=viewWork();
  ok("**輸入的地方叫「預排工作提醒」**", w.includes("預排工作提醒"), (w.match(/預排[^<]*/g)||[]).slice(0,3));
  ok("**而且寫明是給自己用的**", /自己記給自己/.test(w));
  ok("輸入框的字也改了（本來寫「新增一件事」）",
     w.includes("要提醒自己什麼") && !w.includes("新增一件事"));
  ok("**排出去的那些也叫同一個名字**（同一件事不要有兩個名字）",
     w.includes("下週要做的事") && (w.match(/預排工作提醒/g)||[]).length>=2,
     (w.match(/預排工作提醒/g)||[]).length);
  ok("舊名字「之後要做」不再出現", !w.includes("之後要做")); }
{ reset([], [{id:"F1",user:"小美",date:"2099-01-01",title:"下週盤點",report:"",done:false,
    createdAt:T0+"T09:00:00"}]);
  as("小美","cs");
  ok("不剪片的職位也一樣", viewWork().includes("預排工作提醒") && viewWork().includes("下週盤點")); }

// ══════════ ⑥ 員工視角要在最上面（老闆隨時要用）══════════
{ reset(); as("管理員","boss"); SHIFT_DATE=T0;
  const b=viewBoard();
  const iv=b.indexOf("員工視角"), iq=b.indexOf("備片存量"), it=b.indexOf("團隊今天在做什麼");
  ok("（前提）三塊都在", iv>=0 && iq>=0 && it>=0, {員工視角:iv, 備片存量:iq, 團隊:it});
  ok("**員工視角排在主管區的最前面**", iv<iq, {員工視角:iv, 備片存量:iq});
  ok("**而且只有他自己一份**（本來搬過來忘了刪原本那張）",
     (b.match(/員工視角/g)||[]).length===(b.match(/enterViewAs/g)||[]).length
     && (b.match(/enterViewAs/g)||[]).length===1,
     {員工視角:(b.match(/員工視角/g)||[]).length, 進入:(b.match(/enterViewAs/g)||[]).length}); }
{ reset(); as("Regina","manager"); SHIFT_DATE=T0;
  ok("經理人沒有這張卡（那是管理員的工具）", !viewBoard().includes("enterViewAs")); }

// ══════════ ⑦ 新增影片：日期、時間、存檔位置沒填就不給存 ══════════
// 老闆：「在新增影片時，預排日期和時間和儲存位置是必填，沒有寫，不給存檔」
{ reset(); as("管理員","boss");
  MODAL="";
  newSimpleVideo();
  ok("**新增視窗有這三格**",
     /id="sv_link"/.test(MODAL) && /id="sv_date"/.test(MODAL) && /id="sv_time"/.test(MODAL),
     MODAL.slice(0,200));
  ok("**三格都標「必填」**", (MODAL.match(/· 必填/g)||[]).length>=3, (MODAL.match(/· 必填/g)||[]).length);
  ok("時間只給整點選（老闆早就說過不用分）", MODAL.includes(">15:00<") && !MODAL.includes(">15:30<"));
  ok("存檔資料夾的說明不再寫「拍完再補也可以」", !/拍完再補也可以/.test(MODAL)); }
{ reset(); as("管理員","boss");
  MODAL=""; batchNewFootage();
  ok("**批次視窗五支各有日期與時間**",
     [0,1,2,3,4].every(i=>MODAL.includes(`id="bd${i}"`) && MODAL.includes(`id="bt${i}"`)));
  ok("批次的存檔資料夾也改成必填", /填了片名就必填/.test(MODAL)); }

// ══════════ ⑧ 傳訊息可以預排哪一天出現 ══════════
// 老闆：「傳訊息給同事，要能夠選出現的日期，可以預排」
{ reset(); as("小葵","editor");
  const c=dashAssignTaskCard();
  ok("**有「哪一天出現」這一格**", c.includes("哪一天出現") && /id="asg_date"/.test(c));
  ok("預設是今天（＝馬上送出）", c.includes(`id="asg_date" type="date" value="${T0}"`), (c.match(/id="asg_date"[^>]*/)||[])[0]);
  ok("**挑不到過去的日期**", c.includes(`min="${T0}"`)); }
{ // 預排的：收訊方那天之前看不到，發訊方看得到而且標出來
  const LATER="2099-01-01";
  reset([], [Object.assign({}, p_("P9"), {user:"小美", from:"小葵", date:LATER, title:"下週再說"})]);
  as("小美","cs");
  ok("**收訊方在那天之前看不到**", !viewChat().includes("下週再說"), viewChat().slice(0,120));
  ok("而且不會亮紅點", commUnread()===0, commUnread());
  as("小葵","editor");
  const c=viewChat();
  ok("**發訊方看得到（要知道排出去了、也要能反悔）**", c.includes("下週再說"));
  ok("**而且標出「哪天才送出」**", /01\/01 才送出/.test(c), (c.match(/pill wa[^>]*>[^<]*/g)||[]).slice(0,3));
  ok("發訊方這邊也不會被催", commUnread()===0, commUnread()); }
{ // 預排的不會催任何人 —— 對方接收了、回了話也一樣，時候還沒到
  const LATER="2099-01-01";
  reset([], [Object.assign({}, p_("P7"), {user:"小美", from:"小葵", date:LATER,
    title:"預排但對方已經回了", ack:true, reply:"我知道了"})]);
  as("小葵","editor");
  ok("**預排的不會提早開始催人**", commUnread()===0 && commWaitingMe(taskById("P7"))===false,
     {紅點:commUnread(), 等我:commWaitingMe(taskById("P7"))});
  // 對照組：同一筆改成今天，就該催了
  reset([], [Object.assign({}, p_("P7"), {user:"小美", from:"小葵", date:T0,
    title:"今天而且對方回了", ack:true, reply:"我知道了"})]);
  as("小葵","editor");
  ok("（對照）到了那天就會催", commWaitingMe(taskById("P7"))===true); }

{ // 排今天的＝照舊，馬上就看得到
  reset([], [Object.assign({}, p_("P8"), {user:"小美", from:"小葵", date:T0, title:"現在就說"})]);
  as("小美","cs");
  ok("排今天的馬上看得到", viewChat().includes("現在就說"));
  ok("而且照樣亮紅點", commUnread()===1, commUnread()); }

// ══════════ ⑨ 產出的數字以「Regina 審過」為準 ══════════
// 老闆：「這邊的數量需要以 Regina 審片完成後才算」
{ const YM=T0.slice(0,7), FIN=YM+"-10T18:00:00";
  const mk=(id,o)=>v_(id,Object.assign({editor:"小葵",stage:"已完成",finishedAt:FIN},o));
  reset([ mk("A",{reviewStatus:"通過"}), mk("B",{reviewStatus:"通過"}),
          mk("C",{reviewStatus:""}),            // 剪完了，還在等 Regina
          mk("D",{reviewStatus:"退回"}) ]);
  as("Regina","manager");
  ok("審過的算", countsAsDone(STATE.videos[0])===true);
  ok("**還在等審的不算**", countsAsDone(STATE.videos[2])===false);
  ok("**被退回的不算**", countsAsDone(STATE.videos[3])===false);
  const m=teamMonthStat("小葵", [], YM);
  ok("**月成效只算審過的（4 支剪完 → 算 2 支）**", m.count===2, m.count);
  const heat=teamHeatData([{name:"小葵",role:"editor"}], YM);
  ok("**熱圖也一樣**", heat.rows[0].total===2, heat.rows[0].total); }
// ⚠️ 審核制度上路前的舊片不能被誤傷（那些本來就沒有人審過）
{ const OLD="2020-05", FIN=OLD+"-10T18:00:00";
  reset([ v_("A",{editor:"小葵",stage:"已完成",finishedAt:FIN,reviewStatus:""}) ]);
  LAST_RAW.settings.reviewSince="2026-07-27"; STATE=decorate(LAST_RAW);
  as("Regina","manager");
  ok("**制度上路前的舊片照算**（不然六月以前的產出會整片歸零）",
     countsAsDone(STATE.videos[0])===true, {reviewSince:reviewSince()});
  ok("而且是因為它根本不算「待審」", needsReview(STATE.videos[0])===false); }
{ // 「今天完成幾支」故意不套（審片是隔天才按的，套下去每天都是 0）
  reset([ v_("A",{editor:"小葵",stage:"已完成",finishedAt:T0+"T18:00:00",reviewStatus:""}) ]);
  as("小葵","editor");
  const d=teamDayStat("小葵", []);
  ok("**當日的「今日完成」照舊算剪完的**", d.done.length===1, d.done.length); }

// ══════════ ⑩ 審片只有 Regina 可以按 ══════════
// 老闆：「現在審片不行讓剪輯自己按『審過』只有 regina 可以按」
{ reset([ v_("W1",{editor:"小葵",claimedBy:"小葵",stage:"已完成",finishedAt:T0+"T10:00:00",reviewStatus:""}) ]);
  as("小葵","editor");
  const c=workReviewCard("小葵");
  ok("**剪輯這邊沒有審過鍵**", !c.includes("editorMarkReviewed('W1')"), (c.match(/editorMarkReviewed[^)]*\)/g)||[]));
  ok("**改成寫著「待審」**（不要留一顆按不動的鍵）", c.includes(">待審<"));
  as("Regina","manager");
  ok("Regina 才有鍵", workReviewCard("小葵").includes("editorMarkReviewed('W1')"));
  as("管理員","boss");
  ok("管理員也有（他是最後的守門人）", workReviewCard("小葵").includes("editorMarkReviewed('W1')")); }
{ // 就算硬呼叫也要擋 —— 只把鍵藏起來不算防護
  reset([ v_("W1",{editor:"小葵",claimedBy:"小葵",stage:"已完成",finishedAt:T0+"T10:00:00",reviewStatus:""}) ]);
  as("小葵","editor");
  const W=[]; global.window.DB.update=async(c,id,p)=>{W.push([c,id,p]);};
  editorMarkReviewed("W1");
  ok("**剪輯硬呼叫也寫不進去**", W.length===0, W);
  ok("而且有講原因", (global.__toasts||[]).some(t=>t.includes("只有 Regina"))); }

// ══════════ ⑪ 還沒審的一律留著，不再只看七天 ══════════
// 老闆：「目前的待審的片子，記錄七天，改成沒有上限，只要還沒審過的都會出現」
{ const D=(n)=>new Date(new Date(T0+"T12:00:00Z").getTime()+n*864e5).toISOString().slice(0,10);
  reset([ v_("OLD",{editor:"小葵",claimedBy:"小葵",stage:"已完成",
            finishedAt:D(-40)+"T10:00:00",reviewStatus:""}) ]);
  as("小葵","editor");
  ok("**四十天前還沒審的照樣出現**", workRecent7Card("小葵").includes("片OLD"),
     workRecent7Card("小葵").slice(0,120));
  reset([ v_("OLD",{editor:"小葵",claimedBy:"小葵",stage:"已完成",
            finishedAt:D(-40)+"T10:00:00",reviewStatus:"通過",reviewedBy:"Regina",
            reviewedAt:D(-40)+"T11:00:00"}) ]);
  as("小葵","editor");
  ok("審過又超過七天的就不佔位子了", workRecent7Card("小葵")===""); }

// ══════════ ④ 沒有把別的弄壞 ══════════
{ let bad=null;
  [["小葵","editor"],["小美","cs"],["Regina","manager"]].forEach(([w,r])=>{
    reset([v_("V1",{tags:["寵粉"]}), v_("V2",{tags:["流量型"]})]); as(w,r);
    myTabs().forEach(t=>{ CUR_TAB=t[0]; CAL_YM=null;
      try{ render(); }catch(e){ bad=w+"/"+t[0]+": "+e.message; } }); });
  ok("三種身分、每一個分頁都畫得出來", !bad, bad); }
{ reset([v_("V1",{tags:["寵粉"],products:[{name:"項鍊"}],productUrl:"https://x.tw/p/1"})]);
  ok("填好的片不會平白多一顆燈", !missingPill(STATE.videos[0]).includes("商品"),
     missingPill(STATE.videos[0])); }

// ⚠️ 這一段要放在**最檔案最後**：async 一 await 就把控制權交回去，
//    後面任何一個 reset() 都會把 window.DB 換成新的，寫入就攔不到了。
(async()=>{ // 送出時真的把挑的日期帶進去（不是一律寫今天）
  const LATER="2099-01-01";
  reset(); as("小葵","editor");
  const W=[]; global.window.DB.set=async(c,id,o)=>{ if(c==="tasks") W.push(o); };   // logs 那一筆也走同一條，要濾掉
  asgPicked=()=>["小美"]; boxes["asg_txt"]={value:"預排的一句話"}; boxes["asg_date"]={value:LATER};
  await assignTaskSel(); await new Promise(r=>setTimeout(r,20));
  ok("**挑的日期真的存進去了**", W.length===1 && W[0].date===LATER, {筆數:W.length, 日期:W[0]&&W[0].date});
  // 過去的日期要擋（打錯的話對方永遠看不到）
  reset(); as("小葵","editor");
  const W2=[]; global.window.DB.set=async(c,id,o)=>{ if(c==="tasks") W2.push(o); };
  asgPicked=()=>["小美"]; boxes["asg_txt"]={value:"打錯日期"}; boxes["asg_date"]={value:"2000-01-01"};
  await assignTaskSel(); await new Promise(r=>setTimeout(r,20));
  ok("**過去的日期擋下來**", W2.length===0, W2);
  console.log(`\nv184（捲動不彈回・寵粉銷售要有商品連結・預排）: ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
