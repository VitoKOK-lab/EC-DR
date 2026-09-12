// v197：上片連結 —— 先補輸入格，燈號才跟著回來
//
// 老闆：「0.補連結警示加上去 要先做」
//
// ── 為什麼這件事要緊 ────────────────────────────────────────────────
// 正式資料實測（2026-09-11）：**410 支已經播出的片，上片連結 100% 是空的**，
// 而且一支都沒被提醒過。那條網址是「我們這支片」對上「平台上那則貼文」的
// **唯一鑰匙** —— 沒有它，Meta 回來的觀看數接不回任何一支片，
// 「哪支流量好、該拿去二創」這個判斷就永遠做不了。
//
// ⚠️⚠️ 這一版最重要的一條規矩，是從 v136 的教訓來的：
//    v136 當初把「缺上片連結」從源片拿掉，理由是「那一格根本沒有地方可以填」——
//    拿填不了的欄位當缺漏，等於亮一個永遠熄不掉的紅字，燈號整組失去意義。
//    **那個判斷是對的。** 所以 v197 的順序是：
//        先補輸入格（e_pub／df_pub）→ 燈號才准回來
//    下面 ① 就是在釘這件事：燈號亮的地方，一定要有格子可以填。
//
// ⚠️ 第二條規矩：只提醒「還補得回來」的。
//    416 支全部標紅的話，月排程從五月紅到現在 —— 那就變成
//    「全部都是第一優先＝沒有第一優先」，跟急件那顆紅燈一樣會被無視。
//    所以只標最近 PUB_LINK_DAYS 天（實測 72 支），更舊的 344 支不標紅、
//    但**要在看板上寫出數字**，不然每天默默有幾支滑出窗期，洞會一直長大
//    而且沒有人看得到（跟 v184「待審七天就消失＝幫人忘記」同一個教訓）。
const fs=require("fs"), path=require("path");
const RAW=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=RAW.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el();
// 編輯視窗的欄位值：測試自己餵，這樣才驗得了「存檔時有沒有把 e_pub 寫進去」
let FIELD={};
global.document={getElementById:(id)=>{
    if(id==="view") return viewEl;
    if(Object.prototype.hasOwnProperty.call(FIELD,id)) return el2(FIELD[id]);
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
function el2(v){ const e=el(); e.value=String(v==null?"":v); return e; }
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,300));} }

const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const DAY=(off)=>{ const d=new Date(FROZEN+"T00:00:00"); d.setDate(d.getDate()+off); return d.toISOString().slice(0,10); };

const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"片"+id,rawName:"原始"+id,videoCopy:"有文案",nameEn:"",videoCopyEn:"",
  rawLink:"http://raw",lib:"",stage:"已完成",editor:"小葵",claimedBy:"小葵",assignedTo:"",scheduledDate:null,
  finishedAt:FROZEN+"T10:00:00",publishedLink:"",driveFolder:"http://d",reviewStatus:"通過",locale:"",channel:"",
  origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],publishTime:"10:00",tags:[],products:[],
  usageHistory:[],metrics:[],note:"",refLink:"",productUrl:"",source:"官方IP",deleted:false}, o||{});
function reset(videos, who, role){
  VIEW_AS=null; BRAND=""; viewEl.innerHTML=""; modalHTML=""; FIELD={}; FOLD_OPEN={};
  localStorage.setItem("ecdr_user", who||"管理員"); localStorage.setItem("ecdr_role", role||"boss");
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"管理員",role:"boss"},{name:"小葵",role:"editor"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
}

// ══════════ ① 最重要的一條：燈號亮的地方一定要有格子可以填 ══════════
// 這一條是從 v136 的教訓來的。順序寫反（先亮燈再補格）＝對 400 多支片亮著
// 一個沒人能處理的紅字，燈號整組從此被無視。
{ reset([v_("A",{scheduledDate:DAY(-1)})]);
  ok("（前提）過了上片日、沒貼連結 → 燈號會亮",
     missingPill(vid("A")).includes("缺上片連結"), missingPill(vid("A")));
  ok("**一般片的編輯視窗真的有那一格**（id=e_pub）", /id="e_pub"/.test(RAW));
  ok("**大流的編輯視窗也有**（id=df_pub）", /id="df_pub"/.test(RAW));
  ok("而且兩格都吃得到既有的值（不是每次打開都空白）",
     /id="e_pub" value="\$\{esc\(v\.publishedLink\|\|""\)\}"/.test(RAW)
     && /id="df_pub" value="\$\{esc\(v\.publishedLink\|\|""\)\}"/.test(RAW)); }

// ② 存檔真的會寫進去（填了沒反應是最難查的那種 bug）
{ reset([v_("A",{scheduledDate:DAY(-1)})]);
  let sent=null;
  global.window.DB.update=async(c,id,p)=>{ if(c==="videos") sent=p; };
  FIELD={ e_pub:"https://www.facebook.com/reel/123", e_name:"片A", e_vcopy:"有文案",
          e_drive:"http://d", e_date:DAY(-1), e_time:"10:00", e_editor:"小葵",
          e_stage:"已完成", e_ref:"", e_note:"", e_nameEn:"", e_vcopyEn:"", e_url:"" };
  return Promise.resolve(saveVideo("A")).then(()=>{
    ok("**編輯視窗按儲存會把上片連結寫進資料庫**",
       sent && sent.publishedLink==="https://www.facebook.com/reel/123", sent&&Object.keys(sent||{}));
    ok("而且沒有順手把別的欄位弄掉", sent && sent.driveFolder==="http://d", sent&&sent.driveFolder);
    rest();
  });
}

function rest(){
// ③ 貼了就熄掉 —— 不可以是「永遠亮著」的那種燈
{ reset([v_("A",{scheduledDate:DAY(-1), publishedLink:"https://www.facebook.com/reel/1"})]);
  ok("**貼了連結就不再標**", !missingPill(vid("A")).includes("缺上片連結"), missingPill(vid("A")));
  ok("只有空白也算沒貼",
     (reset([v_("B",{scheduledDate:DAY(-1), publishedLink:"   "})]), missingPill(vid("B")).includes("缺上片連結"))); }

// ④ 還沒播出不用急
{ reset([v_("A",{scheduledDate:DAY(3)})]);
  ok("還沒到上片日 → 不標", !missingPill(vid("A")).includes("缺上片連結"));
  reset([v_("A",{scheduledDate:null})]);
  ok("根本沒排日期 → 不標（那是「沒排日期」的事）", !missingPill(vid("A")).includes("缺上片連結")); }

// ⑤ 窗期：只提醒補得回來的
{ reset([v_("A",{scheduledDate:DAY(-1)}), v_("B",{scheduledDate:DAY(-PUB_LINK_DAYS+1)}),
         v_("C",{scheduledDate:DAY(-PUB_LINK_DAYS-1)}), v_("D",{scheduledDate:DAY(-90)})]);
  ok("窗期內的標紅（昨天）", missingPill(vid("A")).includes("缺上片連結"));
  ok("窗期邊界上還算數", missingPill(vid("B")).includes("缺上片連結"));
  ok("**超過窗期就不標紅**（不然整個月排程從五月紅到現在）",
     !missingPill(vid("C")).includes("缺上片連結"), missingPill(vid("C")));
  ok("很舊的也不標", !missingPill(vid("D")).includes("缺上片連結"));
  const sp=pubLinkSplit();
  ok("**但是不標不等於不算**：滑出窗期的要數得出來",
     sp.fresh.length===2 && sp.old.length===2, {亮紅:sp.fresh.map(v=>v.id), 存量:sp.old.map(v=>v.id)}); }

// ⑥ 看板上那個數字 —— 不讓滑出窗期的默默消失
{ reset([v_("A",{scheduledDate:DAY(-1)}), v_("C",{scheduledDate:DAY(-60)}), v_("D",{scheduledDate:DAY(-90)})]);
  const h=pubLinkCard();
  ok("**看板上有「上片連結」這張卡**", h.includes("上片連結"), h.slice(0,120));
  ok("寫得出最近要補幾支", h.includes("1 支要補"), (h.match(/最近[^<]*/)||[])[0]);
  ok("**也寫得出更早還欠幾支**（不標紅≠不存在）", h.includes("更早的還有 2 支"), (h.match(/更早的[^<]*/)||[])[0]);
  ok("而且列得出來是哪幾支", h.includes("片C") && h.includes("片D"));
  ok("講得出為什麼要緊（不是只丟一個數字）", /唯一鑰匙/.test(h));
  reset([v_("A",{scheduledDate:DAY(-1), publishedLink:"https://x/1"})]);
  ok("全部補齊了就不要一直叫", pubLinkCard()===""||/都補齊了/.test(pubLinkCard()), pubLinkCard().slice(0,100)); }

// ⑦ 「上片後」那一區要自己打開 —— 收起來的輸入格等於不存在
{ reset([v_("A",{scheduledDate:DAY(-1)})], "小葵", "editor");
  openVideoModal("A", true);
  ok("**該補連結時，「上片後」那一區是打開的**",
     /上片後[\s\S]{0,200}?open/.test(modalHTML) || /<details[^>]*open[^>]*>\s*<summary>[^<]*上片後/.test(modalHTML),
     (modalHTML.match(/<details[^>]*>\s*<summary>[^<]*上片後/)||[])[0]);
  ok("而且裡面看得到輸入格", /id="e_pub"/.test(modalHTML)); }

// ⑧ 版本殼（二創）那條舊路沒有被弄壞
{ reset([v_("S",{scheduledDate:DAY(-1)}),
         v_("P",{channel:"shopee",sourceVideoId:"S",scheduledDate:DAY(-1),driveFolder:""})]);
  ok("二創殼照樣標「缺上片連結」（v136 那條規矩沒破）",
     missingPill(vid("P")).includes("缺上片連結"), missingPill(vid("P")));
  ok("needPostLink 對二創殼與一般片都成立",
     needPostLink(vid("P"))===true && needPostLink(vid("S"))===true,
     {殼:needPostLink(vid("P")), 源片:needPostLink(vid("S"))});
  reset([v_("S",{scheduledDate:DAY(3)})]);
  ok("**還沒播出的一般片，needPostLink 是 false**（那是「還不用」，不是「不用」）",
     needPostLink(vid("S"))===false); }

// ⑨ 上班計畫那張審片卡：連結沒補齊就不要把「已審過」收起來
{ reset([v_("A",{scheduledDate:DAY(-1), reviewStatus:"通過", reviewedAt:DAY(-30)+"T10:00:00"})], "小葵", "editor");
  const h=workReviewCard("小葵");
  ok("**審過很久了但連結還沒補 → 那一列還是要亮出來**",
     h.includes("片A"), h.slice(0,200)); }

console.log(`\n${pass} 通過${fail?("，"+fail+" 失敗"):""}`);
process.exit(fail?1:0);
}
