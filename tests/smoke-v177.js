// v177：預排上片日期旁邊加「幾點」，而且**只選整點**。
//
// 老闆：「我現在預排日期，要有時間，以整點選就好，不用分」
//
// 為什麼不用 <input type="time">：那個一定會出現分鐘，手機上要撥兩個滾輪，
// 而實際上片時間本來就是抓整點（既有的 PUB_TIMES 三個也都是整點）。
// 改成 24 個選項的下拉，一次點到位，也存不進 10:37 這種對不上排程的時間。
//
// ⚠️ 舊資料裡可能已經有 10:30 這種非整點的值 —— **不可以把它洗掉**。
//    下拉要把那個值補進選單並選起來，不然使用者只是打開視窗按存檔，
//    時間就被改成別的了（而且他完全不會發現）。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},select(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, present={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(present[id]===false) return null;                       // 模擬「畫面上沒有這一格」
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:390,innerHeight:844,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
function as(w,r){ localStorage.setItem("ecdr_user",w); localStorage.setItem("ecdr_role",r); }
let calls=[];
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"片"+id,videoCopy:"",nameEn:"",videoCopyEn:"",
  rawLink:"",lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,publishTime:"",
  finishedAt:"",publishedLink:"",driveFolder:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",
  sourceVideoId:"",cover:"",remakes:[],tags:[],products:[],usageHistory:[],metrics:[],note:"",refLink:"",
  productUrl:"",source:"官方IP",deleted:false}, o||{});
function reset(videos){
  VIEW_AS=null; BRAND=""; modalHTML=""; fields={}; present={}; calls=[]; FOLD_OPEN={};
  global.window.DB={ set:async(c,i,d)=>calls.push(["set",c,i,d]), update:async(c,i,d)=>calls.push(["update",c,i,d]),
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{},
    videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
}
const wait=()=>new Promise(r=>setTimeout(r,15));
const opts=(h,id)=>{ const seg=h.split(`id="${id}"`)[1]||""; const end=seg.indexOf("</select>");
  return (seg.slice(0,end<0?400:end).match(/value="([^"]*)"/g)||[]).map(s=>s.slice(7,-1)); };

(async()=>{

// ══════════ ① 只有整點 ══════════
{ reset();
  ok("整點清單是 24 個", HOURS.length===24, HOURS.length);
  ok("從 00:00 到 23:00", HOURS[0]==="00:00" && HOURS[23]==="23:00", [HOURS[0],HOURS[23]]);
  ok("**每一個都是整點，沒有分鐘**", HOURS.every(t=>/^\d{2}:00$/.test(t)), HOURS.filter(t=>!/^\d{2}:00$/.test(t))); }
{ reset();
  const h=hourOptions("");
  const list=(h.match(/value="([^"]*)"/g)||[]).map(s=>s.slice(7,-1)).filter(Boolean);
  ok("選單就是那 24 個整點", JSON.stringify(list)===JSON.stringify(HOURS), list.slice(0,3).concat(list.slice(-2)));
  ok("**有一個「不指定」的空選項**（有些片就是還沒決定幾點）", /value=""/.test(h));
  ok("沒填的時候空選項是選起來的（不會偷偷幫他選 00:00）",
     !/value="00:00" selected/.test(h)); }

// ══════════ ② 編輯視窗：日期旁邊有那一格 ══════════
{ reset([v_("V1",{scheduledDate:"2026-10-01",publishTime:"16:00"})]); as("管理員","boss");
  openVideoModal("V1", true);
  ok("**編輯視窗有「幾點上片」這一格**", modalHTML.includes('id="e_time"'), modalHTML.slice(0,120));
  ok("是下拉不是 time 輸入框（time 一定會有分鐘）",
     /<select id="e_time"/.test(modalHTML) && !/id="e_time"[^>]*type="time"/.test(modalHTML));
  ok("目前的時間有被選起來", /value="16:00" selected/.test(modalHTML));
  const iDate=modalHTML.indexOf('id="e_date"'), iTime=modalHTML.indexOf('id="e_time"');
  ok("排在日期旁邊（不是被丟到別的地方）", iTime>iDate && iTime-iDate<700, {iDate,iTime}); }
{ reset([v_("V1")]); as("管理員","boss");
  openVideoModal("V1", true);
  ok("沒排時間的片，這一格是空的", /id="e_time"/.test(modalHTML) && !/value="\d{2}:00" selected/.test(modalHTML)); }

// ══════════ ③ 存得進去、而且不會洗掉別的 ══════════
{ reset([v_("V1",{scheduledDate:"2026-10-01"})]); as("管理員","boss");
  openVideoModal("V1", true);
  Object.assign(fields,{e_code:"C1",e_raw:"片V1",e_name:"",e_vcopy:"",e_src:"官方IP",e_stage:"待處理",
    e_editor:"",e_date:"2026-10-02",e_time:"14:00",e_drive:"",e_ref:"",e_note:"",e_nameEn:"",e_vcopyEn:"",e_url:""});
  await saveVideo("V1"); await wait();
  const c=calls.find(x=>x[0]==="update" && x[1]==="videos");
  ok("**選好的整點真的寫進資料庫**", !!c && c[3].publishTime==="14:00", c&&c[3]&&c[3].publishTime);
  ok("日期也一起存了", !!c && c[3].scheduledDate==="2026-10-02"); }
// 沒有這一格的視窗（例如二創殼）不可以把舊值洗掉
{ reset([v_("V1",{scheduledDate:"2026-10-01",publishTime:"12:00"})]); as("管理員","boss");
  openVideoModal("V1", true);
  Object.assign(fields,{e_code:"C1",e_raw:"片V1",e_name:"",e_vcopy:"",e_src:"官方IP",e_stage:"待處理",
    e_editor:"",e_date:"2026-10-01",e_drive:"",e_ref:"",e_note:"",e_nameEn:"",e_vcopyEn:"",e_url:""});
  present.e_time=false;                       // 畫面上沒有這一格
  await saveVideo("V1"); await wait();
  const c=calls.find(x=>x[0]==="update" && x[1]==="videos");
  ok("**畫面上沒有那一格時，舊的時間原封不動**", !!c && c[3].publishTime==="12:00", c&&c[3]&&c[3].publishTime); }

// ══════════ ④ 舊資料的非整點值不可以被洗掉 ══════════
{ reset();
  const h=hourOptions("10:30");
  ok("**舊的 10:30 有被補進選單**", h.includes('value="10:30"'), (h.match(/value="10:[0-9]{2}"/g)||[]));
  ok("而且是選起來的（打開就存檔不會被改掉）", /value="10:30" selected/.test(h));
  ok("有標出來這是舊資料", /10:30（舊資料）|10:30 \(legacy\)/.test(h));
  ok("整點還是全部都在", HOURS.every(t=>h.includes(`value="${t}"`))); }
{ reset([v_("V1",{publishTime:"09:45"})]); as("管理員","boss");
  openVideoModal("V1", true);
  ok("編輯視窗打開舊的非整點片，也看得到原本的值", /value="09:45" selected/.test(modalHTML)); }
{ reset();
  const h=hourOptions("10:00");
  ok("本來就是整點的不會被標成舊資料", !/10:00（舊資料）/.test(h));
  ok("也不會重複出現兩次", (h.match(/value="10:00"/g)||[]).length===1); }

// ══════════ ⑤ 月排程當天的視窗也是同一套 ══════════
{ reset([v_("V1",{scheduledDate:"2026-10-01"})]); as("管理員","boss");
  openDay("2026-10-01");
  ok("**當天視窗的「上片時間」也改成整點下拉**",
     /<select id="od_time"/.test(modalHTML), (modalHTML.match(/id="od_time"[^>]*/)||[])[0]);
  ok("不再是 type=time（那個會出現分鐘）", !/id="od_time"[^>]*type="time"/.test(modalHTML));
  // 預設時間是看「這天已經排了幾支」往下帶（PUB_TIMES[dayCount]）——
  // 這支 fixture 那天已經有一支，所以帶的是第二個 12:00，不是 10:00。
  // 要釘的是「帶進來的一定是整點」，不是「一定是某個特定時間」。
  const sel=(modalHTML.match(/value="(\d{2}:\d{2})" selected/)||[])[1];
  ok("預設幫忙帶一個整點", /^\d{2}:00$/.test(String(sel)), sel);
  ok("而且就是 PUB_TIMES 裡的那幾個之一", PUB_TIMES.includes(sel), {sel, PUB_TIMES}); }
{ ok("既有的三個固定上片時間本來就都是整點（沒有跟新規矩打架）",
     PUB_TIMES.every(t=>/^\d{2}:00$/.test(t)), PUB_TIMES); }

// ══════════ ⑥ 沒有把別的弄壞 ══════════
{ reset([v_("V1",{scheduledDate:"2026-10-01",publishTime:"16:00"})]); as("管理員","boss");
  let bad=null;
  ["videos","cal","dashboard","flow"].forEach(t=>{ CUR_TAB=t; CAL_YM=null;
    try{ render(); }catch(e){ bad=t+": "+e.message; } });
  ok("影片庫／月排程／儀表板／中控都畫得出來", !bad, bad); }
{ reset([v_("V1",{scheduledDate:"2026-10-01",publishTime:"16:00"})]); as("管理員","boss");
  CAL_MODE="list"; CUR_TAB="cal"; CAL_PLAT="tw"; CAL_PLAT_FOR="boss"; CAL_YM=[2026,9];
  ok("月排程清單那一欄照樣印得出時間", viewCal().includes("16:00"));
  CAL_MODE="grid"; }

console.log(`\nv177（預排日期加整點時間）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
