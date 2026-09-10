// v194：「要不要去拍片」只數新片；月排程清單的日期與時間併成一格。
//
// 老闆的話（一）：「雖然我們每天要排四支影片，但關於拍片這一件事情其實是一天一支新的
//   影片，其他三支是已經上過的舊片重新使用，所以要提醒需要拍片指的是一天一支的新影片，
//   依照我昨天上傳的進度應該到 11 月都已經排滿了……並不是每天都要四支新的影片」
// 老闆的話（二）：「日期跟時間不需要佔到兩個格子，他在同一個就可以了，然後時間數字
//   可以小一點，空間要留給文字檔案影片的文字」（→ 欄位的部分釘在 smoke-v173）
//
// 為什麼要改：原本「⚠ 要拍片了」是拿**總支數 vs 每日上片目標（4）**算的，
// 重播與大流全部算進去。正式資料實測（2026-09-10，未來 120 天）：
//   每天實際排 2～5 支、最常見 3 支，目標是 4 → 今天就不滿 → 連續排滿 **0 天**
//   → 那顆燈永遠是紅的，老闆等於沒有這個提示。
// 只數新片之後是 **82 天**（連續排到 11/30），跟老闆說的「到 11 月都排滿了」對得上。
//
// 三條要釘死的規矩：
//   ① 重播格（slot.reused）不算新片 —— 那支早就拍過了。
//   ② 大流的片不算新片 —— 成品直接拿進來，沒經過拍片。
//   ③ 每日新片目標跟每日上片目標是**兩個獨立的數字**，預設 1，不可以跟著上片目標走。
//
// 外加一條回歸：v188 把設定頁拆成分頁之後，saveSettings 讀不到沒畫出來的欄位，
// 站在別的分頁按「確認送出設定」會把每日上片目標寫成 0、Shopline 網址整條清掉。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");

// ── 假 DOM ──────────────────────────────────────────────────────────
// 這一份跟其他 smoke 不一樣的地方：getElementById 會**照著目前畫出來的 HTML** 回答。
// 沒被畫出來的 id 要回 null —— 那正是這次要抓的那個 bug 的成因，
// 一律回一個假元素的話，設定頁分頁的回歸測試就永遠是綠的（等於沒測）。
let PRESENT=null;    // null＝什麼都在（一般測試用）；Set＝只有這些 id 存在
const el=(v)=>({value:v==null?"":String(v),innerHTML:"",textContent:"",className:"",style:{},checked:false,
  tagName:"DIV",dataset:{},disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el();
global.document={getElementById:(id)=>{
    if(id==="view") return viewEl;
    // 只有設定頁的欄位（set_*）跟著 PRESENT 走 —— 要重現的就是「這一頁沒畫這一格」。
    // 其餘（toast、view、modalRoot…）照常回元素，不然測到一半會炸在別的地方，
    // 那就變成在測 DOM 假件，不是在測那個 bug。
    if(PRESENT && /^set_/.test(id) && !PRESENT.has(id)) return null;
    const e=el(PRESENT?PRESENT.get(id):"");
    if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});}
    return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,300));} }

const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const YM=FROZEN.slice(0,7), Y=+YM.slice(0,4), M=+YM.slice(5,7);
const DAY=(off)=>{ const d=new Date(FROZEN+"T00:00:00"); d.setDate(d.getDate()+off); return d.toISOString().slice(0,10); };

const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"片"+id,rawName:"原始"+id,videoCopy:"",nameEn:"",videoCopyEn:"",
  rawLink:"",lib:"",stage:"已完成",editor:"小葵",claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",
  publishedLink:"",driveFolder:"",reviewStatus:"通過",locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",
  cover:"",remakes:[],publishTime:"",tags:[],products:[],usageHistory:[],metrics:[],note:"",refLink:"",
  productUrl:"",source:"官方IP",deleted:false}, o||{});
function reset(videos, schedule, settings, who, role){
  VIEW_AS=null; BRAND=""; viewEl.innerHTML=""; modalHTML=""; PRESENT=null;
  CAL_MODE="grid"; CAL_PLAT="tw"; CAL_YM=[Y,M-1]; SET_TAB="basic";
  localStorage.setItem("ecdr_user", who||"管理員"); localStorage.setItem("ecdr_role", role||"boss");
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"管理員",role:"boss"},{name:"小葵",role:"editor"}],
    settings:Object.assign({dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],
      intlAccounts:[],shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],
      reviewSince:"2020-01-01"}, settings||{}),
    schedule:schedule||{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
}
// 排滿 n 天，每天 k 支新片
const fill=(days,k)=>{ const vs=[]; for(let o=0;o<days;o++) for(let j=0;j<k;j++)
  vs.push(v_("N"+o+"_"+j,{scheduledDate:DAY(o), publishTime:"10:00"})); return vs; };

// ══════════ ① 什麼算新片、什麼不算 ══════════
{ reset([v_("A",{scheduledDate:DAY(0)})]);
  ok("第一次排日期的片＝新片", dayNewList(DAY(0)).length===1, dayNewList(DAY(0)).length); }

{ // 重播：影片本身的上片日在過去，靠排程格 reused 排到今天
  reset([v_("OLD",{scheduledDate:DAY(-30)})],
        {[DAY(0)]:{slots:[{videoId:"OLD", reused:true, by:"Vito", time:"16:00"}]}});
  ok("（前提）重播那一格有排進來", dayVideoList(DAY(0)).length===1);
  ok("**重播不算新片**（那支早就拍過了）", dayNewList(DAY(0)).length===0, dayNewList(DAY(0)).length); }

{ // 大流：成品，沒經過拍片
  reset([v_("DF",{scheduledDate:DAY(0), lib:"大流"})]);
  ok("（前提）大流的片有排進當天的清單", dayVideoList(DAY(0)).length===1, dayVideoList(DAY(0)).length);
  ok("**大流的片不算新片**（沒經過拍片）", dayNewList(DAY(0)).length===0, dayNewList(DAY(0)).length); }

{ // 混在一起：1 新 + 1 重播 + 1 大流 → 只有 1 支新的
  reset([v_("NEW",{scheduledDate:DAY(0)}), v_("OLD",{scheduledDate:DAY(-30)}),
         v_("DF",{scheduledDate:DAY(0), lib:"大流"})],
        {[DAY(0)]:{slots:[{videoId:"OLD", reused:true, by:"Vito"}]}});
  ok("（前提）那天總共三支", dayVideoList(DAY(0)).length===3, dayVideoList(DAY(0)).length);
  ok("**三支裡只有一支要拍**", dayNewList(DAY(0)).length===1,
     dayNewList(DAY(0)).map(x=>x.videoId)); }

// ══════════ ② 每日新片目標：獨立的數字，預設 1 ══════════
{ reset([], {}, {dailyTarget:4});
  ok("**沒設過就是 1**（不是跟著上片目標的 4 走）", dayNewTarget()===1, dayNewTarget()); }
{ reset([], {}, {dailyTarget:4, dailyNewTarget:2});
  ok("設定裡填了就照填的", dayNewTarget()===2, dayNewTarget()); }
{ reset([], {}, {dailyTarget:9, dailyNewTarget:1});
  ok("上片目標改成 9，要拍的還是 1（兩個數字互不影響）", dayNewTarget()===1 && daySum(DAY(0))===9,
     {新:dayNewTarget(), 上:daySum(DAY(0))}); }
{ reset([], {}, {dailyNewTarget:3, brands:[{id:"care",name:"長照機構",dailyTarget:0,dailyNewTarget:1}]});
  BRAND="care";
  ok("各家可以有自己的新片目標", dayNewTarget()===1, dayNewTarget());
  BRAND="";
  ok("切回第一家就用全公司的", dayNewTarget()===3, dayNewTarget()); }

// ══════════ ③ 新片存量：一天一支就夠，不用四支 ══════════
{ // 老闆的情境：每天排 4 支，但只有 1 支是新的、其餘 3 支重播
  const vs=[], slots={};
  for(let o=0;o<70;o++){
    vs.push(v_("N"+o,{scheduledDate:DAY(o)}));
    slots[DAY(o)]={slots:[]};
    for(let j=0;j<3;j++){ const id="R"+o+"_"+j;
      vs.push(v_(id,{scheduledDate:DAY(-60)}));
      slots[DAY(o)].slots.push({videoId:id, reused:true, by:"Vito"}); }
  }
  reset(vs, slots, {dailyTarget:4});
  const g=scheduleGlance();
  ok("（前提）每天真的排滿 4 支", dayBreakdown(DAY(0)).total===4, dayBreakdown(DAY(0)).total);
  ok("（前提）其中只有 1 支是新的", dayNewList(DAY(0)).length===1, dayNewList(DAY(0)).length);
  ok("**新片存量算得出 70 天**（一天一支就算數）", g.newRunway===70, g.newRunway); }

{ // 反過來：排滿 4 支但**全部**是重播 → 一支新的都沒有 → 要拍片
  const vs=[], slots={};
  for(let o=0;o<70;o++){ slots[DAY(o)]={slots:[]};
    for(let j=0;j<4;j++){ const id="R"+o+"_"+j;
      vs.push(v_(id,{scheduledDate:DAY(-60)}));
      slots[DAY(o)].slots.push({videoId:id, reused:true, by:"Vito"}); } }
  reset(vs, slots, {dailyTarget:4});
  const g=scheduleGlance();
  ok("（前提）排程是排滿的", g.runway===70, g.runway);
  ok("**全是重播 → 新片存量 0 天**（舊算法會說「安心」，這才是要抓的那一種）",
     g.newRunway===0, g.newRunway); }

{ // 只排 3 支（正式資料現在就是這樣）：排程不滿，但新片是夠的
  reset(fill(70,3), {}, {dailyTarget:4});
  const g=scheduleGlance();
  ok("（前提）舊算法在第一天就斷掉（目標 4、只排 3）", g.runway===0, g.runway);
  ok("**新片存量照樣算得出 70 天**（老闆說的「到 11 月都排滿了」）", g.newRunway===70, g.newRunway); }

{ // 中間有一天沒有新片 → 斷在那天
  const vs=fill(70,2).filter(v=>v.scheduledDate!==DAY(10));
  reset(vs, {}, {dailyTarget:4});
  ok("中間缺一天就斷在那裡", scheduleGlance().newRunway===10, scheduleGlance().newRunway); }

{ // 兩條數字要並存，不可以互相取代
  reset(fill(70,3), {}, {dailyTarget:4});
  const g=scheduleGlance();
  ok("**兩條並存**：排程存量與新片存量是不同的問題", g.runway!==g.newRunway && "runway" in g && "newRunway" in g,
     {runway:g.runway, newRunway:g.newRunway});
  ok("14 天缺新片的清單也另外一份", Array.isArray(g.newDefs) && g.newDefs.length===0, g.newDefs);
  ok("目標數字帶得出去給畫面用", g.newTarget===1, g.newTarget); }

// ══════════ ④ 畫面：紅綠燈跟著新片走 ══════════
{ reset(fill(70,3), {}, {dailyTarget:4});
  CUR_TAB="board"; const h=viewBoard();
  ok("看板上是「新片存量」這張卡", h.includes("新片存量"), h.slice(0,200));
  ok("**新片夠 → 不用急著拍**", h.includes("不用急著拍") && !h.includes("要拍片了"),
     (h.match(/[^>]{0,12}(不用急著拍|要拍片了)/g)||[]));
  ok("有寫清楚重播不算在裡面", h.includes("舊片重播不用再拍"));
  ok("排程湊不湊得滿另外寫一行，而且說明白那不是拍片的事",
     h.includes("那是排片的事，不用去拍"), (h.match(/另外看排程[^<]*/)||[])[0]);
  ok("**「未來影片排程」那張卡也把新片單獨列出來**（上面那個數字含重播，不能拿來決定要不要拍）",
     h.includes("天有新片") && h.includes("每天至少 1 支新的"), (h.match(/天有新片[\s\S]{0,80}/)||[])[0]);
  // 焦點列在 viewFlow（v181 之後只剩測試在走），一併確認它也改成新片存量
  CUR_TAB="flow"; const f=viewFlow();
  ok("焦點列印的是新片存量（不是排程存量）",
     f.includes("新片存量(天)") && !f.includes("排程存量(天)"), (f.match(/class="fl">[^<]*/g)||[]).slice(0,6)); }

{ // 新片不夠 → 紅字
  reset(fill(10,4), {}, {dailyTarget:4});
  CUR_TAB="board"; const h=viewBoard();
  ok("**新片不夠 → 要拍片了**", h.includes("要拍片了") && !h.includes("不用急著拍"),
     (h.match(/[^>]{0,12}(不用急著拍|要拍片了)/g)||[]));
  ok("而且給下一步（腳本→拍毛片→進資料庫→指派）", h.includes("準備腳本")); }

{ // 排滿但全是重播：畫面一定要說要拍片（這是整個 v194 的重點）
  const vs=[], slots={};
  for(let o=0;o<70;o++){ slots[DAY(o)]={slots:[]};
    for(let j=0;j<4;j++){ const id="R"+o+"_"+j;
      vs.push(v_(id,{scheduledDate:DAY(-60)}));
      slots[DAY(o)].slots.push({videoId:id, reused:true, by:"Vito"}); } }
  reset(vs, slots, {dailyTarget:4});
  CUR_TAB="board"; const h=viewBoard();
  ok("**排程排滿 70 天、但全是重播 → 還是要拍片**", h.includes("要拍片了"),
     (h.match(/[^>]{0,12}(不用急著拍|要拍片了)/g)||[])); }

// ══════════ ⑤ 設定頁：兩個目標分開設 ══════════
{ reset([], {}, {dailyTarget:4});
  CUR_TAB="settings"; SET_TAB="basic"; const h=viewSettings();
  // ⚠️ 不可以直接對整頁 includes：公司列表那一欄也叫「每日要拍幾支新的」，
  //    基本卡整格被拿掉也照樣是綠的（第一版就是這樣，變異測試才抓出來）。
  //    只在「每天上片目標」那張卡裡面找。
  const card=h.slice(h.indexOf("每天上片目標"), h.indexOf("排程與網站"));
  ok("設定頁有「每日要拍幾支新的」", card.includes("每日要拍幾支新的") && card.includes('id="set_dailynew"'),
     (card.match(/每日[^<]*/g)||[]).slice(0,4));
  ok("原本的每日上片目標還在（沒有被換掉）", card.includes("每日應上片數") && card.includes('id="set_daily"'));
  ok("寫清楚只有這個數字決定要不要拍", card.includes("「要不要去拍片」只看這個數字")); }

// ══════════ ⑥ 回歸：站在別的分頁按「確認送出設定」不可以洗掉基本設定 ══════════
// v188 拆分頁之後，val() 對沒畫出來的欄位一律回空字串 ——
// 這一條要是紅的，代表任何人在「平台」頁按一下送出，每日上片目標就變 0、
// Shopline 網址被清空，而且沒有任何人會發現。
function idsIn(html){
  const m=new Map();
  (html.match(/<(input|textarea|select)\b[^>]*>/g)||[]).forEach(tag=>{
    const id=(tag.match(/\bid="([^"]+)"/)||[])[1]; if(!id) return;
    const v=(tag.match(/\bvalue="([^"]*)"/)||[])[1]; m.set(id, v==null?"":v); });
  return m;
}
async function saveFromTab(tab){
  reset([], {}, {dailyTarget:4, dailyNewTarget:1, scheduleHorizonDays:30, shoplineBase:"https://www.tzgrotw.tw/"});
  CUR_TAB="settings"; SET_TAB=tab;
  const html=viewSettings();
  PRESENT=idsIn(html);                       // 只有這一頁畫出來的欄位才存在
  let sent=null;
  global.window.DB.setSettings=async(s)=>{ sent=s; };
  await saveSettings();
  PRESENT=null;
  return sent;
}
(async()=>{
  const fromBasic=await saveFromTab("basic");
  ok("（前提）站在「基本」頁送出，確實會寫這三個欄位",
     fromBasic && fromBasic.dailyTarget===4 && fromBasic.shoplineBase==="https://www.tzgrotw.tw/",
     fromBasic && {t:fromBasic.dailyTarget, s:fromBasic.shoplineBase});
  ok("而且新片目標也一起寫進去", fromBasic && fromBasic.dailyNewTarget===1, fromBasic&&fromBasic.dailyNewTarget);

  const fromPlat=await saveFromTab("plat");
  ok("（前提）「平台」頁真的沒有畫每日上片目標那一格", !idsIn(viewSettings()).has("set_daily"));
  ok("**在「平台」頁送出不會把每日上片目標寫成 0**",
     fromPlat && !("dailyTarget" in fromPlat), fromPlat && fromPlat.dailyTarget);
  ok("**也不會把 Shopline 網址清掉**",
     fromPlat && !("shoplineBase" in fromPlat), fromPlat && fromPlat.shoplineBase);
  ok("**也不會把預排天數重設成 30**",
     fromPlat && !("scheduleHorizonDays" in fromPlat), fromPlat && fromPlat.scheduleHorizonDays);
  ok("新片目標同理", fromPlat && !("dailyNewTarget" in fromPlat), fromPlat && fromPlat.dailyNewTarget);

  const fromMaint=await saveFromTab("maint");
  ok("「維護」頁送出一樣不會洗掉基本設定",
     fromMaint && !("dailyTarget" in fromMaint) && !("shoplineBase" in fromMaint), fromMaint);

  // ══════════ ⑦ CSS：時間縮小、欄寬寫在樣式表（inline 會蓋掉 media query）══════════
  // ⚠️ 不可以只寫 /font-size:1[01]/：手機那條是 10.5px，桌機那條放大到 13px 也會被它餵飽
  //    （變異測試抓到的）。抓**第一條**（桌機基準）的實際數字來比。
  { const base=(HTML.match(/table\.callist \.cl-tm\{([^}]*)\}/)||[])[1]||"";
    const size=parseFloat((base.match(/font-size:([\d.]+)px/)||[])[1]);
    ok("時間是小字（桌機基準就要比內文小）", size>0 && size<=11.5, {base, size});
    const mob=(HTML.match(/@media\(max-width:600px\)[\s\S]{0,1200}?table\.callist \.cl-tm\{([^}]*)\}/)||[])[1]||"";
    const msize=parseFloat((mob.match(/font-size:([\d.]+)px/)||[])[1]);
    ok("手機上再小一點", msize>0 && msize<=size, {mob, msize, size}); }
  ok("手機上欄位還會再縮一點", /@media\(max-width:600px\)[\s\S]{0,900}col\.cl-cw\{width:7\d px?|@media\(max-width:600px\)[\s\S]{0,900}col\.cl-cw\{width:\d+px/.test(HTML));
  ok("**欄寬不可以寫在 <col style> 上**（inline 蓋得過 media query，手機就縮不了）",
     !/<col style="width:\d+px"><col style="width:\d+px"><col>/.test(APP) && APP.includes('<col class="cl-cw">'),
     (APP.match(/<colgroup>[^<]*<col[^>]*>/)||[])[0]);

  console.log(`\n${pass} 通過${fail?("，"+fail+" 失敗"):""}`);
  process.exit(fail?1:0);
})();
