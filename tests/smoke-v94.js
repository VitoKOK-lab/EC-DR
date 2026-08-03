// v94：海外剪輯的畫面要「完全」是英文
//  ① 標籤／片源／影片類型這些設定資料，海外看到英文（內建對照＋管理員可改）
//  ② 全形標點（）＋： 不再漏進英文介面
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
let calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdA==$dGVzdA==';
// 客戶實際設定的那 17 個標籤與片源
const TAGS=["新片","舊片","寵粉","代理招商","銷售","教育","個人成長","珠寶介紹","子女傳承",
            "Q&A","行業揭密","經典語錄","生活分享","異國文化","行銷活動","FB","吾家"];
const SOURCES=["官方IP","吾家"];
function reset(extraSettings){
  calls=[]; toasts=[]; fields={}; modalHTML="";
  VID_LANG=""; VID_VIEW="raw"; VID_TAGS=new Set(); VID_Q="";
  POOL_FILTER="all"; POOL_Q=""; TEAM_GROUP="all"; TEAM_Q="";
  STATE={ users:[{name:"Anna",role:"intl",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Kai",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Vito",role:"boss"}],
    settings: Object.assign({dailyTarget:4, videoTags:TAGS.slice(), sources:SOURCES.slice(),
      mainTypes:["流量型","帶貨型","寵粉"], contacts:["Sara"], postPlatforms:[],
      intlAccounts:[{locale:"en",name:"tiktok-EN"},{locale:"th",name:"tiktok-TH"}],
      shopeeAccounts:[], msAccounts:[],
      exchangeRates:{en:{code:"USD",rate:1,mult:1},th:{code:"THB",rate:1,mult:1},ms:{code:"MYR",rate:1,mult:1},shopee:{code:"TWD",rate:1,mult:1}},
      reviewSince:"2020-01-01", workStart:"09:00", workEnd:"18:00", scheduleHorizonDays:30}, extraSettings||{}),
    schedule:{}, logs:[], deletedVideos:[], shifts:{}, tasks:{},
    videos:[{id:"S1",code:"2601",name:"ASCII title",rawName:"ASCII raw",nameEn:"ASCII EN",videoCopy:"copy",videoCopyEn:"copyEN",
      stage:"待處理",editor:"Anna",claimedBy:"Anna",claimedAt:T0+"T01:00:00",finishedAt:"",publishedLink:"",
      driveFolder:"",rawLink:"http://raw",refLink:"",productUrl:"",note:"",mainType:"寵粉",source:"官方IP",
      reviewStatus:"",locale:"en",channel:"",origLang:"",createdBy:"Anna",createdAt:T0,scheduledDate:null,
      tags:["寵粉","珠寶介紹"],products:[],usageHistory:[],metrics:[]},
     // 一創原本（影片庫只列這種）：標籤鈕要靠它才長得出來
     {id:"Z1",code:"2602",name:"ASCII source",rawName:"ASCII raw2",nameEn:"ASCII EN2",videoCopy:"",videoCopyEn:"",
      stage:"待處理",editor:"",claimedBy:"",claimedAt:"",finishedAt:"",publishedLink:"",
      driveFolder:"",rawLink:"http://raw2",refLink:"",productUrl:"",note:"",mainType:"寵粉",source:"官方IP",
      reviewStatus:"",locale:"",channel:"",origLang:"",createdBy:"",createdAt:T0,scheduledDate:null,
      tags:["寵粉","珠寶介紹"],products:[],usageHistory:[],metrics:[]}] };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; CAL_PLAT="tw"; CAL_YM=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{},
    setSettings:async(p)=>{calls.push(["settings",p]);} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
// 一段 HTML 裡還剩哪些中文字／全形標點
// 只看「畫面上看得到的文字」：屬性裡的中文（value="寵粉"）是資料原值，本來就要保留
const cjk=(h)=>[...new Set(String(h||"").replace(/<[^>]+>/g," ").match(/[　-〿一-鿿＀-￯]+/g)||[])];
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ dataLabel 本身 ══
reset(); as("Anna","intl");
ok("內建的標籤翻得出來", dataLabel("寵粉")==="Fan perks" && dataLabel("珠寶介紹")==="Jewelry");
ok("片源也翻得出來", dataLabel("官方IP")==="Official IP");
ok("影片類型也翻得出來", dataLabel("流量型")==="Reach" && dataLabel("帶貨型")==="Selling");
ok("沒有對照的照原樣（品牌名不硬翻）", dataLabel("吾家")==="吾家");
ok("空的就是空的", dataLabel("")==="" && dataLabel(null)==="");
ok("前後空白會去掉", dataLabel("  寵粉  ")==="Fan perks");
as("Kai","editor");
ok("中文角色看到的還是中文", dataLabel("寵粉")==="寵粉" && dataLabel("官方IP")==="官方IP");
as("Vito","boss");
ok("管理員看到的也是中文", dataLabel("珠寶介紹")==="珠寶介紹");
// 管理員自訂
reset({dataEn:{"吾家":"Wu Jia","寵粉":"VIP perks"}}); as("Anna","intl");
ok("管理員自訂的翻譯會生效", dataLabel("吾家")==="Wu Jia");
ok("自訂的可以蓋掉內建的", dataLabel("寵粉")==="VIP perks");
ok("沒自訂的還是用內建", dataLabel("珠寶介紹")==="Jewelry");

// ══ 標點 ══
reset(); as("Anna","intl");
ok("海外用半形括號", paren(3)===" (3)");
ok("海外用半形加號", PLUS()==="+");
as("Kai","editor");
ok("中文用全形括號", paren(3)==="（3）");
ok("中文用全形加號", PLUS()==="＋");

// ══ 整個海外視角掃一遍：不能有任何中文或全形標點 ══
reset(); as("Anna","intl");
{ const screens={
    "影片庫": viewVideos(), "上班計畫": viewWork(), "團隊看板": viewTeam(), "月排程": viewCal() };
  Object.entries(screens).forEach(([k,h])=>ok("海外的"+k+"沒有中文", cjk(h).length===0 || !!console.log("   殘留：",cjk(h).join(" ")))); }
reset(); as("Anna","intl");
modalHTML=""; openVideoModal("S1", false);
ok("海外的影片詳情沒有中文", cjk(modalHTML).length===0 || !!console.log("   殘留：",cjk(modalHTML).join(" ")));
reset(); as("Anna","intl");
modalHTML=""; openVideoModal("S1", true);
// 「吾家」是品牌名，內建沒有硬翻（設定裡填了才會翻）——除它之外不該有中文
ok("海外的影片編輯只剩沒給翻譯的品牌名",
   JSON.stringify(cjk(modalHTML))===JSON.stringify(["吾家"]) || !!console.log("   殘留：",cjk(modalHTML).join(" ")));
reset({dataEn:{"吾家":"Wu Jia"}}); as("Anna","intl");
modalHTML=""; openVideoModal("S1", true);
ok("在設定填了翻譯之後就一個中文都不剩",
   cjk(modalHTML).length===0 || !!console.log("   殘留：",cjk(modalHTML).join(" ")));

// ══ 標籤在畫面上真的變英文了 ══
// v115 分區：海外的影片庫是來源清單，沒有標籤鈕 —— 標籤英譯改在台灣庫上驗
reset(); as("管理員","boss"); ZONE_VIEW="tw";
{ const h=viewVideos();
  ok("台灣庫的標籤鈕用中文原名", h.includes(">寵粉")); }
reset(); as("Anna","intl");
{ const h=viewVideos();
  ok("海外的影片庫是來源清單（英文）", h.includes("Pick a published Taiwan video")); }
reset(); as("Anna","intl");
modalHTML=""; openVideoModal("S1", false);
{ const m=modalHTML;
  ok("影片詳情的標籤是英文", m.includes("Fan perks") && m.includes("Jewelry"));
  ok("影片詳情的片源是英文", m.includes("Official IP")); }
reset(); as("Anna","intl");
modalHTML=""; openVideoModal("S1", true);
{ const m=modalHTML;
  ok("編輯的標籤 chip 是英文", m.includes("Fan perks"));
  ok("編輯的片源下拉是英文", m.includes("Official IP")); }

// ══ 但存進資料庫的還是原本的中文（不能把資料弄髒）══
reset(); as("Anna","intl");
modalHTML=""; openVideoModal("S1", true);
{ const m=modalHTML;
  ok("標籤 chip 的 value 還是中文原值", m.includes('value="寵粉"'));
  ok("片源下拉的 value 還是中文原值", m.includes('value="官方IP"')); }
reset(); as("管理員","boss"); ZONE_VIEW="tw";
{ const h=viewVideos();
  ok("標籤鈕點下去傳的是中文原值", h.includes("vidTagToggle('寵粉'")); }

// ══ 中文角色完全不受影響 ══
reset(); as("Kai","editor");
{ const h=viewVideos();
  ok("中文角色的標籤還是中文", h.includes("寵粉") && !h.includes("Fan perks")); }
reset(); as("Vito","boss");
modalHTML=""; openVideoModal("S1", false);
ok("管理員看到的片源還是中文", modalHTML.includes("官方IP") && !modalHTML.includes("Official IP"));

// ══ 設定頁：可以自己改對照 ══
(async()=>{
  reset(); as("Vito","boss");
  { const st=viewSettings();
    ok("設定頁有翻譯對照表", st.includes('id="set_dataen"'));
    ok("帶出內建的對照", st.includes("寵粉=Fan perks") && st.includes("官方IP=Official IP"));
    ok("說明寫清楚沒列到的照原樣", st.includes("照原樣顯示")); }
  reset({dataEn:{"吾家":"Wu Jia"}}); as("Vito","boss");
  ok("自訂過的也會帶出來", viewSettings().includes("吾家=Wu Jia"));

  const base=()=>{ fields.set_daily="4"; fields.set_horizon="30"; fields.set_shop=""; fields.set_plat="";
    fields.set_wstart="09:00"; fields.set_wend="18:00"; fields.set_grace="10";
    fields.set_attstart=""; fields.set_olat=""; fields.set_olng=""; fields.set_tpl=""; fields.set_pw=""; };
  reset(); as("Vito","boss"); base();
  fields.set_dataen="吾家=Wu Jia\n寵粉=Fan perks\n亂寫的一行";
  await saveSettings(); await wait(40);
  { const c=calls.filter(x=>x[0]==="settings").pop();
    ok("存得起來", !!c && c[1].dataEn && c[1].dataEn["吾家"]==="Wu Jia");
    ok("跟內建一樣的不重複存（省空間）", !!c && c[1].dataEn["寵粉"]===undefined);
    ok("沒有等號的那行會被略過", !!c && Object.keys(c[1].dataEn).length===1); }
  reset(); as("Vito","boss"); base(); fields.set_dataen="";
  await saveSettings(); await wait(40);
  ok("清空就變成沒有自訂", (()=>{ const c=calls.filter(x=>x[0]==="settings").pop();
    return !!c && JSON.stringify(c[1].dataEn)==="{}"; })());

  // ══ render 不炸 ══
  reset();
  [["Anna","intl","videos"],["Anna","intl","work"],["Anna","intl","team"],
   ["Kai","editor","videos"],["Vito","boss","settings"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
