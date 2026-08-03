// v119：分區規則補上「源片看原本語言」，團隊看板只列同區的人。
//
// v115 當初的假設是「沒有用泰文／英文拍的原創」，所以分區只看 v.locale。
// 實際上有 —— 巴基斯坦同事拍的英文片、泰文片都是「源片」（沒有 locale），
// 於是被判成台灣區，出現在台灣剪輯的待認領池裡，還被歸進「中文毛片」。
//
// 正確的規則：源片要看它「原本是用什麼語言拍的」。
//   locale（en/th）＝海外做的版本殼
//   channel（shopee/ms）＝台灣做的版本殼   ← 版本殼不等於海外
//   都沒有＝源片 → origLang 泰文／英文＝海外，中文／馬來西亞＝台灣
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
let modalHTML="", viewEl=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=()=>{};

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",
  rawLink:"http://raw",cover:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  publishTime:"",finishedAt:"",publishedLink:"",driveFolder:"",productUrl:"",note:"",mainType:"",
  source:"官方IP",refLink:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",
  tags:[],products:[],usageHistory:[],metrics:[]},o||{});

// 六種影片，剛好蓋住規則的每一條分支
function fixture(){
  return [
    v_("ZH", {name:"中文毛片",            origLang:""}),      // 源片・中文    → 台灣
    v_("OLD",{name:"舊資料沒有 origLang 欄位"}),               // 源片・沒欄位  → 台灣
    v_("MY", {name:"Bahasa asal",         origLang:"my"}),     // 源片・馬來西亞 → 台灣
    v_("TH", {name:"หินธรรมชาติจากคัดลัง", origLang:"th"}),     // 源片・泰文    → 海外
    v_("EN", {name:"Growing Up Taiwanese and Pakistani", origLang:"en"}),  // 源片・英文 → 海外
    v_("SHP",{name:"蝦皮版", channel:"shopee", sourceVideoId:"ZH", account:"蝦皮A"}),  // 版本殼 → 台灣
    v_("MS", {name:"馬來版", channel:"ms",     sourceVideoId:"ZH", account:"馬來A"}),  // 版本殼 → 台灣
    v_("VEN",{name:"English version", locale:"en", sourceVideoId:"ZH", account:"acctEN"}), // 版本殼 → 海外
  ];
}
function reset(videos){
  modalHTML="";
  STATE={ users:[{name:"小葵",role:"editor"},{name:"Anna",role:"intl"},
                 {name:"小美",role:"cs"},{name:"HR小姐",role:"hr"},
                 {name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"acctEN"},{locale:"th",name:"acctTH"}],
      shopeeAccounts:["蝦皮A"],msAccounts:["馬來A"],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||fixture() };
  CUR_TAB=null; VIEW_AS=null; POOL_FILTER="all"; POOL_Q=""; WORK_ZONE="shopee";
  VID_LANG=""; VID_VIEW="raw"; VID_TAGS=new Set(); VID_Q=""; VID_UNSCHED=false; ZONE_VIEW="tw";
  TEAM_GROUP="all"; TEAM_Q="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══════════ ① 分區規則的每一條分支 ══════════
reset();
ok("源片・中文 → 台灣", zoneOfVideo(vid("ZH"))==="tw");
ok("源片・舊資料沒有 origLang → 台灣（當成中文）", zoneOfVideo(vid("OLD"))==="tw");
ok("源片・馬來西亞 → 台灣", zoneOfVideo(vid("MY"))==="tw");
ok("源片・泰文 → 海外", zoneOfVideo(vid("TH"))==="intl");
ok("源片・英文 → 海外", zoneOfVideo(vid("EN"))==="intl");
ok("蝦皮版是版本殼，但屬台灣", zoneOfVideo(vid("SHP"))==="tw" && isVersion(vid("SHP")));
ok("馬來版是版本殼，但屬台灣", zoneOfVideo(vid("MS"))==="tw" && isVersion(vid("MS")));
ok("英文版本殼 → 海外", zoneOfVideo(vid("VEN"))==="intl");
ok("空值不炸", zoneOfVideo(null)==="tw" && zoneOfVideo(undefined)==="tw");
ok("認不得的 origLang 當成中文（台灣）", zoneOfVideo({id:"X",origLang:"zz"})==="tw");

// ══════════ ② 待認領池：兩邊各看各的 ══════════
reset(); as("小葵","editor");
{ const p=poolAll().map(v=>v.id).sort().join(",");
  ok("台灣的池＝中文＋舊資料＋馬來原創＋蝦皮版＋馬來版", p==="MS,MY,OLD,SHP,ZH");
  ok("台灣的池沒有泰文／英文原創", !p.includes("TH") && !p.includes("EN")); }
reset(); as("Anna","intl");
{ const p=poolAll().map(v=>v.id).sort().join(",");
  ok("海外的池＝泰文原創＋英文原創＋英文版本殼", p==="EN,TH,VEN");
  ok("海外的池沒有中文毛片、蝦皮、馬來", ["ZH","OLD","MY","SHP","MS"].every(x=>!p.split(",").includes(x))); }
reset(); as("Regina","manager");
ok("主管的池兩區都在（8 支）", poolAll().length===8);

// ══════════ ③ 池的快選分類：泰文原創要歸「泰文」，不能落在「中文毛片」 ══════════
reset();
ok("泰文原創的分類是 th", poolCat(vid("TH"))==="th");
ok("英文原創的分類是 en", poolCat(vid("EN"))==="en");
ok("馬來原創仍算中文毛片（馬來西亞屬台灣）", poolCat(vid("MY"))==="tw");
ok("蝦皮版的分類是 shopee", poolCat(vid("SHP"))==="shopee");
ok("英文版本殼的分類是 en", poolCat(vid("VEN"))==="en");
reset(); as("小葵","editor");
{ const w=viewWork();
  const seg=(w.split("待認領（毛片＋二創版本）")[1]||"").split("</table>")[0];
  ok("台灣的待認領清單裡沒有泰文片", !seg.includes("หินธรรมชาติ"));
  ok("台灣的待認領清單裡沒有那支英文片", !seg.includes("Growing Up Taiwanese"));
  ok("台灣的待認領清單有中文毛片", seg.includes("'ZH'")); }
reset(); as("Anna","intl");
{ const w=viewWork();
  ok("海外的待認領清單有泰文片", w.includes("'TH'"));
  ok("海外的待認領清單沒有中文毛片", !w.includes("'ZH'") && !w.includes("'SHP'")); }

// ══════════ ④ 影片庫 ══════════
reset(); as("小葵","editor");
{ const h=viewVideos();
  ok("台灣影片庫沒有泰文原創", !h.includes("หินธรรมชาติ"));
  ok("台灣影片庫沒有那支英文原創", !h.includes("Growing Up Taiwanese"));
  ok("台灣影片庫有中文毛片與蝦皮版", h.includes("中文毛片") && h.includes("蝦皮版"));
  ok("語言下拉只留中文與馬來西亞", h.includes("中文（") && h.includes("馬來西亞（")
     && !h.includes("泰文（") && !h.includes("英文（")); }
{ // 已經停在泰文庫的人，切回來時要自動退回中文，不會卡在空清單
  VID_LANG="th"; viewVideos();
  ok("VID_LANG 停在泰文會自動退回中文", VID_LANG===""); }

// ══════════ ⑤ 團隊看板只列同區的人 ══════════
reset(); as("小葵","editor");
{ const t=viewTeam();
  ok("台灣剪輯看得到台灣同事", t.includes("小葵") && t.includes("小美"));
  ok("台灣剪輯看不到海外同事", !t.includes("Anna"));
  ok("人資（管理層）對所有人可見", t.includes("HR小姐")); }
reset(); as("Anna","intl");
{ const t=viewTeam();
  ok("海外看得到自己", t.includes("Anna"));
  ok("海外看不到台灣同事", !t.includes("小葵") && !t.includes("小美")); }
for(const [u,r] of [["Regina","manager"],["管理員","boss"],["HR小姐","hr"]]){
  reset(); as(u,r);
  const t=viewTeam();
  ok(r+" 兩區的人都看得到", t.includes("小葵") && t.includes("Anna"));
}
reset();
ok("seesPerson：管理層永遠看得到", (as("小葵","editor"), seesPerson("Regina") && seesPerson("HR小姐")));
ok("seesPerson：台灣看不到海外的人", (as("小葵","editor"), !seesPerson("Anna")));
ok("seesPerson：海外看不到台灣的人", (as("Anna","intl"), !seesPerson("小葵")));

// ══════════ ⑥ 月排程與建立版本不受影響（還是靠平台代碼推）══════════
reset(); as("小葵","editor"); CAL_PLAT="tw"; CAL_YM=null;
{ const c=viewCal();
  ok("台灣月排程只有中文／蝦皮／馬來西亞", c.includes(">中文<") && c.includes(">蝦皮<") && c.includes(">馬來西亞<")
     && !c.includes(">英文<") && !c.includes(">泰文<")); }
reset(); as("Anna","intl"); CAL_PLAT="en"; CAL_YM=null;
{ const c=viewCal();
  ok("海外月排程只有英文／泰文", c.includes(">English<") && c.includes(">Thai<")
     && !c.includes(">Chinese<") && !c.includes(">Shopee<")); }

// ══════════ ⑦ render 不炸 ══════════
reset();
for(const [u,r] of [["小葵","editor"],["Anna","intl"],["小美","cs"],["HR小姐","hr"],["Regina","manager"],["管理員","boss"]]){
  as(u,r); VIEW_AS=null; CAL_YM=null; CAL_PLAT="tw"; VID_LANG=""; ZONE_VIEW="tw";
  for(const [tab] of myTabs()){
    CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab} 畫得出來`, viewEl.innerHTML.length>40); }
    catch(e){ ok(`[${r}] ${tab} 畫得出來 → `+e.message, false); }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
