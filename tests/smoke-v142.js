// v142：拆掉海內外分區、資料夾統一、Boss Sunny 從公司降級成一條上片線。
//
// 新的運作方式：一份腳本同時發給兩組人 → 兩邊各拍各的語言 → 毛片放進**同一個池子**
// → 誰都挑得到誰的去剪 → 剪出來的成品才有語言之分 → 任何一創都可以再二創（雙向）。
//
// 語言從「流程的牆」變成「成品的屬性」。這支測試釘住那道牆真的拆了，
// 而且**沒有把「預設」跟「權限」搞混** —— 海外預設還是落在自己那一份，只是不再被鎖住。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,isConnected:true,scrollTop:0,rows:1,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(fields[id]!=null) e.value=fields[id];
    if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let writes=[], toasts=[], errToasts=[];
toast=(m,isErr)=>{ toasts.push(String(m)); if(isErr) errToasts.push(String(m)); };
const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const T0=D(0), PAST=D(-40);
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"文案",
  nameEn:"",videoCopyEn:"",rawLink:"http://raw/"+id,lib:"",stage:"待處理",editor:"",claimedBy:"",
  assignedTo:"",scheduledDate:null,finishedAt:"",publishedLink:"",driveFolder:"",reviewStatus:"",
  locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],tags:[],products:[],
  usageHistory:[],metrics:[]},o||{});
function reset(videos){
  modalHTML=""; viewEl.innerHTML=""; writes=[]; toasts=[]; errToasts=[]; fields={};
  global.window.DB={ set:async(c,id,o)=>{writes.push(["set",c,id,o]);},
    update:async(c,id,p)=>{writes.push(["update",c,id,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async(p)=>{writes.push(["settings","",""," ",p]);},
    videosWatched:()=>true, watchVideos:()=>true, watchLogs:()=>true };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"Anna",role:"intl"},
                     {name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["新片","舊片"],sources:["自製"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"acctEN"},{locale:"th",name:"acctTH"}],
      shopeeAccounts:["蝦皮A"],msAccounts:["馬來A"],sunnyAccounts:["Sunny A"],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01",workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], products:[], matches:[],
    videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  CUR_TAB=null; VIEW_AS=null; BRAND=""; ZONE_VIEW=null; CAL_PLAT="tw"; CAL_PLAT_FOR=null;
  POOL_FILTER="all"; POOL_Q=""; WORK_ZONE="shopee"; VID_VIEW="raw"; VID_TAGS=new Set(); VID_Q="";
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{

// ══════════ ① 分區的牆拆了 ══════════
{ reset();
  ["小葵","Anna","Regina","管理員"].forEach(n=>ok(n+" 兩邊都看得到", zoneOfUser(n)==="both"));
  as("小葵","editor"); ok("台灣剪輯 seesIntl", seesIntl());
  as("Anna","intl");   ok("海外剪輯 seesTW", seesTW()); }
// 同一個毛片池
{ const pool=[v_("ZH",{rawLink:"http://r1"}), v_("EN",{origLang:"en"}), v_("TH",{origLang:"th"}),
              v_("SHP",{channel:"shopee",account:"蝦皮A",sourceVideoId:"ZH"})];
  reset(pool); as("小葵","editor");
  const tw=poolAll().map(v=>v.id).sort().join(",");
  reset(pool); as("Anna","intl");
  const intl=poolAll().map(v=>v.id).sort().join(",");
  ok("台灣與海外看到的是同一個池", tw===intl && tw.length>0);
  ok("池子裡中文、英文、泰文、蝦皮都在", tw==="EN,SHP,TH,ZH"); }
// 二創雙向
{ reset(); as("小葵","editor");
  const z=createZoneCard();
  ok("台灣建得了英文／泰文（以前不行）", z.includes("英文 TikTok") && z.includes("泰文 TikTok"));
  reset(); as("Anna","intl"); WORK_ZONE="en";
  const z2=createZoneCard();
  ok("海外建得了蝦皮／馬來（以前不行）", z2.includes(">Shopee<") && z2.includes(">Malaysia<")); }

// ══════════ ②「預設」不是「權限」—— 這兩個最容易被搞混 ══════════
{ reset(); as("Anna","intl"); CUR_TAB="cal"; viewCal();
  ok("海外的月排程預設仍然落在英文", CAL_PLAT==="en");
  ok("但五個平台全看得到（預設≠牆）",
     [">Chinese<",">Shopee<",">Malaysia<",">English<",">Thai<"].every(x=>viewCal().includes(x))); }
{ reset(); as("小葵","editor"); CUR_TAB="cal"; viewCal();
  ok("台灣的預設落在中文", CAL_PLAT==="tw"); }
{ reset(); as("Anna","intl"); CUR_TAB="cal"; viewCal();
  calSetPlat("shopee"); viewCal();
  ok("海外自己選了蝦皮之後就不會被彈回英文", CAL_PLAT==="shopee"); }
{ reset(); as("Anna","intl");
  ok("海外的影片庫預設落在海外那一份", curZone()==="intl");
  setZoneView("tw");
  ok("但切得過去台灣那一份", curZone()==="tw"); }
// 中文的編輯視窗還是不丟給海外（那是介面語言的問題，不是分區）
{ reset([v_("S1")]); as("Anna","intl"); modalHTML="";
  openVideoModal("S1", true);
  ok("海外點源片仍然走他自己的簡化視窗（介面語言≠分區）",
     !modalHTML.includes('id="e_vcopy"')); }

// ══════════ ③ 拿分區當「別的東西」的代名詞：這次咬到的那個 bug ══════════
// p2pTargets 以前用 `zoneOfUser(u)==="both"` 來排除管理層 —— 分區拆掉之後
// 人人都是 both，那一行會把**所有人**都排掉、傳訊息的名單整個變空。
{ reset(); as("小葵","editor");
  const t=p2pTargets().map(u=>u.name);
  ok("傳訊息的名單不是空的（這就是那個 bug）", t.length>0);
  ok("名單裡有海外同事（不再分區）", t.includes("Anna"));
  ok("名單裡沒有管理層（他們走另一條路）",
     !t.includes("Regina") && !t.includes("管理員"));
  ok("名單裡沒有自己", !t.includes("小葵")); }
{ const CODE=APP.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n");
  ok("排除管理層是直接看職位，不是靠分區推", /MGMT_ROLES\.includes\(u\.role\)/.test(CODE));
  ok("不再有「z===\"both\" 就排除」那種寫法", !/if\(z==="both"\) return false;/.test(CODE)); }

// ══════════ ④ 存檔資料夾：一支片的家族只有一個 ══════════
{ const fam=[v_("S1",{driveFolder:"http://drive/family"}),
             v_("V1",{channel:"shopee",account:"蝦皮A",sourceVideoId:"S1",driveFolder:""}),
             v_("V2",{locale:"en",account:"acctEN",sourceVideoId:"S1",driveFolder:""})];
  reset(fam);
  ok("源片有自己的資料夾", familyDrive(vid("S1"))==="http://drive/family");
  ok("蝦皮版沿用源片的", familyDrive(vid("V1"))==="http://drive/family");
  ok("英文版也沿用同一個", familyDrive(vid("V2"))==="http://drive/family");
  ok("三個版本指到同一個位置",
     familyDrive(vid("S1"))===familyDrive(vid("V1")) && familyDrive(vid("V1"))===familyDrive(vid("V2"))); }
// 舊資料不回頭補：自己已經有值的就留著
{ reset([v_("S1",{driveFolder:"http://drive/src"}),
         v_("OLD",{channel:"shopee",sourceVideoId:"S1",driveFolder:"http://drive/old-own"})]);
  ok("舊的二創已經有自己的資料夾就留著（不回頭改）", familyDrive(vid("OLD"))==="http://drive/old-own"); }
// 版本殼的欄位變成唯讀，不再讓人各填各的
{ reset([v_("S1",{driveFolder:"http://drive/family"}),
         v_("V1",{channel:"shopee",account:"蝦皮A",sourceVideoId:"S1"})]);
  const f=familyDriveField(vid("V1"),"x_drive");
  ok("版本殼的存檔欄位是唯讀的", f.includes("readonly"));
  ok("而且帶著家族的資料夾", f.includes("http://drive/family"));
  // v144 改了說明的寫法：除了「不用你填」，還一併說清楚資料夾是誰開的、什麼東西要放進去
  ok("有說明為什麼不能填", f.includes("你不用自己填")||f.includes("Nothing to fill in here"));
  ok("有說明資料夾是誰開的", f.includes("第一個拍好毛片的人開的")||f.includes("created by whoever shot the raw footage first"));
  ok("源片那一格照舊（那就是第一個人建的那格）", familyDriveField(vid("S1"),"x")===""); }
// 存檔時真的寫回家族資料夾（不是讀那個唯讀欄位的值）
{ reset([v_("S1",{driveFolder:"http://drive/family"}),
         v_("V1",{channel:"shopee",account:"蝦皮A",sourceVideoId:"S1"})]);
  as("小葵","editor");
  fields.bsy_name=""; fields.shp_name="蝦皮版"; fields.shp_vcopy="文案"; fields.shp_pub=""; fields.shp_date="";
  await chSaveVideo("shopee","V1");
  const w=writes.find(x=>x[1]==="videos");
  ok("蝦皮版存檔寫回家族資料夾", !!w && w[3].driveFolder==="http://drive/family"); }
{ reset([v_("S1",{driveFolder:"http://drive/family"}),
         v_("V2",{locale:"en",account:"acctEN",sourceVideoId:"S1"})]);
  as("Anna","intl");
  fields.i_name="EN"; fields.i_vcopy="script"; fields.i_pub=""; fields.i_date="";
  await intlSaveVideo("V2");
  const w=writes.find(x=>x[1]==="videos");
  ok("英文版存檔也寫回同一個", !!w && w[3].driveFolder==="http://drive/family"); }
// ⚠️ 這兩支存檔函式只收 id，`v` 不在作用域 —— 寫成 familyDrive(v) 會直接炸
{ const CODE=APP;
  ok("intlSaveVideo 有自己把影片撈出來", /async function intlSaveVideo\(id\)\{\s*\n\s*const v=vid\(id\)/.test(CODE));
  ok("chSaveVideo 也是", /async function chSaveVideo\(ch,id\)\{[^\n]*\n\s*const v=vid\(id\)/.test(CODE)); }

// ══════════ ⑤ Boss Sunny：從一家公司降級成一條上片線 ══════════
{ reset();
  ok("Boss Sunny 是一條線", !!LINES.sunny && LINES.sunny.field==="channel");
  ok("有自己的帳號設定", LINES.sunny.acctKey==="sunnyAccounts");
  ok("有自己的每日目標", LINES.sunny.targetKey==="sunnyDailyTarget");
  ok("歸在台灣這一側（不是海外）", zoneOfPlat("sunny")==="tw");
  ok("有畫面用的名稱", !!CHANNELS.sunny && CHANNELS.sunny.label==="Boss Sunny"); }
{ reset(); as("Regina","manager"); CUR_TAB="cal";
  const h=viewCal();
  ok("月排程的平台選單有 Boss Sunny", h.includes(">Boss Sunny<"));
  ok("六個平台在同一頁用切換的",
     [">中文<",">蝦皮<",">馬來西亞<",">Boss Sunny<",">英文<",">泰文<"].every(x=>h.includes(x))); }
{ reset(); as("Regina","manager");
  ok("建立版本卡也選得到 Boss Sunny", createZoneCard().includes(">Boss Sunny<")); }
{ reset(); as("管理員","boss");
  const st=viewSettings();
  ok("設定頁有 Boss Sunny 那一張", st.includes("Boss Sunny 設定"));
  ok("有帳號欄", st.includes('id="set_bsyacct"'));
  ok("有每日目標欄", st.includes('id="set_bsytarget"'));
  ok("說明講清楚它不是獨立公司", st.includes("影片庫與編號跟主帳號共用")); }
{ reset(); as("管理員","boss");
  fields.set_bsyacct="Sunny 官方\nSunny 二號店"; fields.set_bsytarget="3";
  fields.set_shpacct=""; fields.set_msacct="";
  await saveSettings();
  const w=writes.find(x=>x[0]==="settings");
  const p=w&&w[4];
  ok("Boss Sunny 的帳號存得進去", !!p && JSON.stringify(p.sunnyAccounts)===JSON.stringify(["Sunny 官方","Sunny 二號店"]));
  ok("每日目標也存得進去", !!p && p.sunnyDailyTarget===3); }

// ══════════ ⑥ 每個職位的每個分頁都還畫得出來 ══════════
{ const fam=[v_("S1",{driveFolder:"http://d",stage:"已上片",published:true,publishedLink:"http://p",
                      scheduledDate:PAST,finishedAt:PAST+"T10:00:00",tags:["舊片"]}),
             v_("R1"), v_("EN1",{origLang:"en"}),
             v_("V1",{channel:"shopee",account:"蝦皮A",sourceVideoId:"S1"}),
             v_("BS1",{channel:"sunny",account:"Sunny A",sourceVideoId:"S1"})];
  [["小葵","editor"],["Anna","intl"],["Regina","manager"],["管理員","boss"]].forEach(([u,r])=>{
    reset(fam.map(v=>Object.assign({},v))); as(u,r);
    myTabs().forEach(([t])=>{ CUR_TAB=t;
      let okk=true, msg=""; try{ render(); }catch(e){ okk=false; msg=e.message; }
      ok(r+" 的「"+t+"」畫得出來"+(okk?"":" → "+msg), okk); });
  }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
