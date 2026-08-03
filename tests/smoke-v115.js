// v115：台灣／海外分區可見性。
//
// 規則：v.locale（en/th）＝海外；其餘（中文源片、shopee、ms）＝台灣。
//       人依職位：role==="intl" → 海外；boss/manager/hr → 兩區都看；其餘 → 台灣。
//
// 三個容易混淆的名詞務必分清楚（這是整次改造的地基）：
//   isSourceVid(v)  這是「源片」，不是版本殼
//   isVersion(v)    這是「版本殼」
//   zoneOfVideo(v)  這支屬於哪一「區」
// 蝦皮／馬來殼是「版本殼」但屬於「台灣區」—— 把它們誤判成海外，會讓它們
// 從毛片庫存、指派清單、儀表板數字裡整批消失。
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
let modalHTML="", viewEl=el(), toasts=[];
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"口播"+id,
  rawLink:"http://raw/"+id,cover:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  publishTime:"",finishedAt:"",publishedLink:"",driveFolder:"",productUrl:"",note:"",mainType:"",
  source:"老闆自拍",refLink:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",
  tags:[],products:[],usageHistory:[],metrics:[]},o||{});
// 已上片的源片（版本的來源池只收這種）
const SRC=v_("S1",{name:"已上片源片",rawName:"已上片源片",stage:"已上片",published:true,tags:["舊片"],
  publishedLink:"http://p",driveFolder:"http://drive/S1",finishedAt:"2020-01-01T00:00:00",nameEn:"Source EN"});
function fixture(){
  return [ v_("R1",{name:"中文毛片"}), SRC,
    v_("P1",{name:"蝦皮殼",channel:"shopee",sourceVideoId:"S1",account:"蝦皮A"}),
    v_("M1",{name:"馬來殼",channel:"ms",sourceVideoId:"S1",account:"馬來A"}),
    v_("E1",{name:"英文殼",locale:"en",sourceVideoId:"S1",account:"acctEN"}),
    v_("T1",{name:"泰文殼",locale:"th",sourceVideoId:"S1",account:"acctTH"}) ];
}
function reset(videos){
  modalHTML=""; toasts=[];
  STATE={ users:[{name:"小葵",role:"editor"},{name:"Anna",role:"intl"},
                 {name:"Regina",role:"manager"},{name:"管理員",role:"boss"},{name:"HR小姐",role:"hr"},
                 {name:"小美",role:"cs"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"acctEN"},{locale:"th",name:"acctTH"}],
      shopeeAccounts:["蝦皮A"],msAccounts:["馬來A"],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||fixture() };
  CUR_TAB=null; VIEW_AS=null; CAL_PLAT="tw"; CAL_YM=null; POOL_FILTER="all"; POOL_Q="";
  WORK_ZONE="shopee"; VID_LANG=""; VID_VIEW="raw"; VID_UNSCHED=false; VID_Q=""; VID_TAGS=new Set();
  ZONE_VIEW="tw"; MODAL_DIRTY=false; MODAL_SAVE=null;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const ids=(list)=>list.map(v=>v.id).sort();
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══════════ ① 三個名詞各司其職 ══════════
reset();
ok("中文毛片＝台灣", zoneOfVideo(vid("R1"))==="tw");
ok("蝦皮殼＝台灣（是版本殼，但不是海外）", zoneOfVideo(vid("P1"))==="tw");
ok("馬來殼＝台灣", zoneOfVideo(vid("M1"))==="tw");
ok("英文殼＝海外", zoneOfVideo(vid("E1"))==="intl");
ok("泰文殼＝海外", zoneOfVideo(vid("T1"))==="intl");
ok("源片判定：只有沒 locale 也沒 channel 的才算",
   isSourceVid(vid("R1")) && isSourceVid(vid("S1")) &&
   !isSourceVid(vid("P1")) && !isSourceVid(vid("E1")));
ok("版本殼判定：蝦皮／馬來／英文／泰文都是",
   ["P1","M1","E1","T1"].every(x=>isVersion(vid(x))) && !isVersion(vid("R1")));
ok("「版本殼」跟「海外」是兩件事", isVersion(vid("P1")) && zoneOfVideo(vid("P1"))==="tw");

// 人的分區
ok("剪輯＝台灣", zoneOfUser("小葵")==="tw");
ok("巴基斯坦＝海外", zoneOfUser("Anna")==="intl");
ok("經理人＝兩區", zoneOfUser("Regina")==="both");
ok("管理員＝兩區", zoneOfUser("管理員")==="both");
ok("人資＝兩區", zoneOfUser("HR小姐")==="both");
ok("不剪片的職位歸台灣", zoneOfUser("小美")==="tw");
as("Regina","manager");
ok("兩區的人 seesZone 兩邊都真", seesTW() && seesIntl());
as("小葵","editor");
ok("台灣人看不到海外", seesTW() && !seesIntl());
as("Anna","intl");
ok("海外人看不到台灣", !seesTW() && seesIntl());

// 平台代碼分區
reset();
ok("平台分區", zoneOfPlat("tw")==="tw" && zoneOfPlat("shopee")==="tw" && zoneOfPlat("ms")==="tw"
   && zoneOfPlat("en")==="intl" && zoneOfPlat("th")==="intl");

// ══════════ ② 待認領池（R6：用 seesZone 不是 ===myZone）══════════
reset(); as("小葵","editor");
ok("台灣池＝中文＋蝦皮＋馬來", JSON.stringify(ids(poolAll()))===JSON.stringify(["M1","P1","R1"]));
reset(); as("Anna","intl");
ok("海外池＝英文＋泰文", JSON.stringify(ids(poolAll()))===JSON.stringify(["E1","T1"]));
reset(); as("Regina","manager");
ok("經理人看得到全部五支", poolAll().length===5);
reset(); as("管理員","boss");
ok("管理員也是全部（both 不能寫成 ===myZone）", poolAll().length===5);
reset(); as("HR小姐","hr");
ok("人資也是全部", poolAll().length===5);

// 快選分類依區
reset(); as("小葵","editor");
{ const ks=poolCatList().map(x=>x[0]);
  ok("台灣快選：全部／中文毛片／蝦皮／馬來", JSON.stringify(ks)===JSON.stringify(["all","tw","shopee","ms"])); }
reset(); as("Anna","intl");
{ const ks=poolCatList().map(x=>x[0]);
  ok("海外快選：全部／英文／泰文", JSON.stringify(ks)===JSON.stringify(["all","en","th"])); }
reset(); as("Regina","manager");
ok("兩區的人六類全有", poolCatList().length===6);

// ══════════ ③ 月排程（R7）══════════
reset(); as("小葵","editor"); CUR_TAB="cal";
{ const h=viewCal();
  ok("台灣月排程有中文／蝦皮／馬來西亞",
     h.includes(">中文<") && h.includes(">蝦皮<") && h.includes(">馬來西亞<"));
  ok("台灣月排程沒有泰文／英文", !h.includes(">泰文<") && !h.includes(">英文<"));
  ok("台灣的 CAL_PLAT 落在 tw", CAL_PLAT==="tw"); }
reset(); as("Anna","intl"); CAL_PLAT="tw"; CUR_TAB="cal";
{ const h=viewCal();
  ok("海外月排程只有英文／泰文", h.includes(">English<") && h.includes(">Thai<"));
  ok("海外看不到中文／蝦皮／馬來西亞",
     !h.includes(">Chinese<") && !h.includes(">Shopee<") && !h.includes(">Malaysia<"));
  ok("海外的 CAL_PLAT 自動落到 en 不是 tw", CAL_PLAT==="en"); }
reset(); as("Regina","manager"); CUR_TAB="cal";
ok("經理人五個平台全在", ["中文","泰文","蝦皮","英文","馬來西亞"].every(x=>viewCal().includes(">"+x+"<")));

// ══════════ ④ 建立版本卡 ══════════
reset(); as("小葵","editor");
{ const z=createZoneCard();
  ok("台灣只建得了蝦皮／馬來", z.includes(">蝦皮<") && z.includes(">馬來西亞<"));
  ok("台灣建不了英文／泰文", !z.includes(">英文 TikTok<") && !z.includes(">泰文 TikTok<")); }
reset(); as("Anna","intl"); WORK_ZONE="en";
{ const z=createZoneCard();
  ok("海外只建得了英文／泰文", z.includes("English (TikTok)") && z.includes("Thai (TikTok)"));
  ok("海外建不了蝦皮／馬來", !z.includes(">Shopee<") && !z.includes(">Malaysia<")); }
reset(); as("Regina","manager");
ok("兩區的人四條線全在", ["蝦皮","馬來西亞","英文 TikTok","泰文 TikTok"].every(x=>createZoneCard().includes(">"+x+"<")));

// ══════════ ⑤ 編輯視窗的版本卡（R4）══════════
reset(); as("小葵","editor");
openVideoModal("S1", false);
{ const m=modalHTML;
  ok("台灣看得到蝦皮版本卡", m.includes("蝦皮版本"));
  ok("台灣看得到馬來版本卡", m.includes("馬來版本"));
  ok("台灣看不到各語言版本（英／泰）", !m.includes("各語言版本")); }
reset(); as("Regina","manager");
openVideoModal("S1", false);
ok("經理人三張版本卡都看得到",
   modalHTML.includes("蝦皮版本") && modalHTML.includes("馬來版本") && modalHTML.includes("各語言版本"));

// ══════════ ⑥ 海外守門（R3：最大的漏口）══════════
reset(); as("Anna","intl");
editVideo("S1");                       // ← 版本卡的「回到源片」走的就是這條
{ const m=modalHTML;
  ok("海外點源片不會進台灣編輯視窗", !m.includes('id="e_date"') && !m.includes('id="e_stage"'));
  ok("海外看不到未來 14 天速覽", !m.includes("dstrip"));
  ok("海外看不到標籤與商品", !m.includes('id="e_box"') && !m.includes('id="e_pn0"'));
  ok("海外看不到刪除鍵", !m.includes("delVideo("));
  ok("海外拿得到做版本要的四樣：標題", m.includes("Source EN"));
  ok("…文案", m.includes("口播S1"));
  ok("…毛片連結", m.includes("http://raw/S1"));
  ok("…完成影片連結", m.includes("http://drive/S1")); }
reset(); as("Anna","intl"); toasts=[];
openVideoModal("P1", true);            // 蝦皮殼不歸海外管
ok("海外點蝦皮殼被擋下", modalHTML==="" && toasts.some(t=>/Not in your area|不在你的區/.test(t)));
reset(); as("小葵","editor");
openVideoModal("S1", true);
ok("台灣點源片照樣進編輯視窗", modalHTML.includes('id="e_date"') && modalHTML.includes('id="e_raw"'));

// ══════════ ⑦ 安全網（R5）：手上正在剪的片不會因為分區而消失 ══════════
reset([ v_("P5",{name:"蝦皮殼給海外剪",channel:"shopee",sourceVideoId:"S1",account:"蝦皮A",
        stage:"剪輯中",editor:"Anna",claimedBy:"Anna",claimedAt:D(-1)+"T01:00:00"}), SRC ]);
as("Anna","intl");
ok("跨區指派的片，本人照樣在工作頁看得到", viewWork().includes("蝦皮殼給海外剪"));
reset([ v_("E5",{name:"英文殼給台灣剪",locale:"en",sourceVideoId:"S1",account:"acctEN",
        stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:D(-1)+"T01:00:00"}), SRC ]);
as("小葵","editor");
ok("反過來也一樣", viewWork().includes("英文殼給台灣剪"));

// ══════════ ⑧ 管理層畫面不受影響（R1：最容易誤傷的地方）══════════
reset(); as("Regina","manager"); CUR_TAB="flow";
{ const f=viewFlow();
  // 毛片庫存只算「源片」，不是「台灣區」—— 蝦皮／馬來殼不能被算進去
  const pool=(STATE.videos||[]).filter(v=>isSourceVid(v) && v.stage==="待處理");
  ok("毛片庫存只算源片＝1 支（蝦皮／馬來殼不算）", pool.length===1 && pool[0].id==="R1");
  ok("流程中控畫得出來", f.length>0); }
reset(); as("管理員","boss"); CUR_TAB="dashboard";
{ const d=viewDashboard();
  ok("儀表板畫得出來", d.length>0); }
reset(); as("管理員","boss");
ok("指派毛片的候選只有源片", dashSchedule().poolN===1);

// ══════════ ⑨ render 不炸 ══════════
reset();
[["小葵","editor"],["Anna","intl"],["Regina","manager"],["管理員","boss"],["HR小姐","hr"]].forEach(([u,r])=>{
  as(u,r);
  myTabs().forEach(([tab])=>{
    CUR_TAB=tab; CAL_PLAT="tw"; CAL_YM=null;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } }); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
