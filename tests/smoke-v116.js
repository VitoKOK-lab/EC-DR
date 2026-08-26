// v116：影片庫分流。
//
// 台灣庫 ＝ 中文源片 ＋ 蝦皮版 ＋ 馬來版，黏在同一份清單裡（決策 2）
// 海外庫 ＝ 台灣已上片的來源清單 ＋ 他們自己的英文／泰文版本（決策 3）
//
// 這支盯的是三個最容易在合併時壞掉的地方：
//   R2  版本殼跑進「未拍」→ 台灣的拍片管線數字會爆掉
//   R9  一開標籤篩選版本殼全不見（殼自己的 tags 是空的，要跟源片走）
//   R10 源片被刪掉、殼變孤兒 → 排序丟例外整頁白掉
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
let modalHTML="", viewEl=el(), nodes={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(Object.prototype.hasOwnProperty.call(nodes,id)) return nodes[id];
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=()=>{};

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const FUTURE=D(3), PAST=D(-30);
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",
  rawLink:"",cover:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  publishTime:"",finishedAt:"",publishedLink:"",driveFolder:"",productUrl:"",note:"",mainType:"",
  source:"老闆自拍",refLink:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",
  tags:[],products:[],usageHistory:[],metrics:[]},o||{});
const done=(o)=>Object.assign({stage:"已完成",published:true,publishedLink:"http://p",
  finishedAt:"2026-01-01T00:00:00"},o||{});

function reset(videos){
  modalHTML=""; nodes={};
  STATE={ users:[{name:"小葵",role:"editor"},{name:"Anna",role:"intl"},
                 {name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉","舊片"],sources:["老闆自拍"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"acctEN"},{locale:"th",name:"acctTH"}],
      shopeeAccounts:["蝦皮A"],msAccounts:["馬來A"],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  CUR_TAB=null; VIEW_AS=null; VID_LANG=""; VID_VIEW="raw"; VID_UNSCHED=false; VID_Q=""; VID_TAGS=new Set();
  ZONE_VIEW=null;   // v142：null＝還沒自己選過，依職位給預設（設成 "tw" 等於「使用者選了台灣」） INTL_Q=""; INTL_LIB_LOC=""; MODAL_DIRTY=false; MODAL_SAVE=null;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const tabN=(h,label)=>{ const m=h.match(new RegExp("<span>"+label+"</span> <span class=\"vtab-n\">(\\d+)<")); return m?+m[1]:-1; };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// 一支已上片的中文源片，底下掛四種版本殼
const SRC=v_("S1",done({name:"黃金源片",rawName:"黃金源片",rawLink:"http://raw",tags:["寵粉"],
  driveFolder:"http://drive/S1",nameEn:"Golden source",scheduledDate:PAST}));
const MERGED=[ SRC,
  v_("P1",{name:"蝦皮殼",channel:"shopee",sourceVideoId:"S1",account:"蝦皮A"}),
  v_("M1",{name:"馬來殼",channel:"ms",sourceVideoId:"S1",account:"馬來A"}),
  v_("E1",{name:"英文殼",locale:"en",sourceVideoId:"S1",account:"acctEN"}),
  v_("T1",{name:"泰文殼",locale:"th",sourceVideoId:"S1",account:"acctTH"}) ];

// ══════════ ① 台灣庫：源片＋蝦皮／馬來版同一份清單 ══════════
reset(MERGED.map(v=>Object.assign({},v)));
as("小葵","editor");
{ const all=vidAllOfLang().map(v=>v.id).sort();
  ok("台灣庫母體＝源片＋蝦皮＋馬來", JSON.stringify(all)===JSON.stringify(["M1","P1","S1"]));
  ok("台灣庫不含英文／泰文", !all.includes("E1") && !all.includes("T1")); }
{ // 版本殼的「原本語言」跟著源片算，不會被丟進別的語言分頁
  ok("殼的語言跟著源片", effOrigLang(vid("P1"))===effOrigLang(vid("S1")));
  const h=viewVideos();
  ok("語言下拉把殼算進中文", h.includes("中文（3）")); }

// ══════════ ② R2：殼不會跑進「未拍」（那是台灣的拍片管線）══════════
reset(MERGED.map(v=>Object.assign({},v)));
as("管理員","boss");
{ ok("蝦皮殼落在「待剪」不是「未拍」", vidGroupOf(vid("P1"))==="raw");
  ok("馬來殼落在「待剪」", vidGroupOf(vid("M1"))==="raw");
  ok("沒毛片連結的殼也不會是未拍", !vidNotShot(vid("P1")));
  const c=vidSegCounts();
  ok("未拍＝0（源片已上片、殼不算）", c.script===0); }
// 真的沒拍的中文毛片才算未拍
reset([v_("N1",{name:"沒毛片"}), v_("P9",{name:"蝦皮殼",channel:"shopee",sourceVideoId:"N1"})]);
as("管理員","boss");
{ const c=vidSegCounts();
  ok("沒毛片的中文源片＝未拍 1", c.script===1);
  ok("掛在它下面的殼不佔未拍", vidGroupOf(vid("P9"))!=="script"); }

// ══════════ ③ R9：標籤篩選要跟著源片，殼不能被濾掉 ══════════
reset(MERGED.map(v=>Object.assign({},v)));
as("管理員","boss");
// 殼落在「待剪」，源片已上片落在「舊片」—— 分頁是各自的生命週期，標籤才是共用的
VID_VIEW="old"; VID_TAGS=new Set(["寵粉"]);
ok("源片自己在舊片頁", vidVisibleList().map(v=>v.id).includes("S1"));
VID_VIEW="raw";
{ const list=vidVisibleList().map(v=>v.id);
  ok("殼的 tags 是空的，但跟著源片留下來", list.includes("P1") && list.includes("M1")); }
VID_TAGS=new Set(["舊片"]);
ok("換一個源片沒有的標籤：整組都不在", vidVisibleList().length===0);

// ══════════ ④ 搜尋：打源片的中文名要找得到它的蝦皮版 ══════════
reset(MERGED.map(v=>Object.assign({},v)));
as("管理員","boss"); VID_VIEW="raw"; VID_TAGS=new Set();
VID_Q="黃金";
{ const list=vidVisibleList().map(v=>v.id);
  ok("搜源片名帶出它的版本", list.includes("P1") && list.includes("M1"));
  VID_VIEW="old";
  ok("源片自己也搜得到", vidVisibleList().map(v=>v.id).includes("S1"));
  VID_VIEW="raw"; }
VID_Q="蝦皮A";
ok("也搜得到殼自己的帳號", vidVisibleList().map(v=>v.id).includes("P1"));
VID_Q="26P1";
ok("也搜得到殼自己的編號", vidVisibleList().map(v=>v.id).includes("P1"));

// ══════════ ⑤ 排序：殼緊跟在自己的源片後面，蝦皮在馬來前面 ══════════
// 三支都放在同一個分頁（待剪）才看得出黏在一起
reset([ v_("S2",{name:"另一支源片",rawName:"另一支源片",rawLink:"http://raw2"}),
        v_("M2",{name:"馬來殼2",channel:"ms",sourceVideoId:"S2"}),
        v_("S1",{name:"黃金源片",rawName:"黃金源片",rawLink:"http://raw"}),
        v_("P1",{name:"蝦皮殼",channel:"shopee",sourceVideoId:"S1"}),
        v_("M1",{name:"馬來殼",channel:"ms",sourceVideoId:"S1"}) ]);
as("管理員","boss"); VID_VIEW="raw"; VID_TAGS=new Set(); VID_Q="";
{ const order=vidVisibleList().map(v=>v.id).join(",");
  ok("同一支源片的版本黏在一起（源片在最前）",
     /S1,P1,M1/.test(order) && /S2,M2/.test(order));
  ok("兩組沒有交叉", !/S1,.*S2,.*M1/.test(order)); }

// ══════════ ⑥ R10：源片被刪掉的孤兒殼不能把整頁弄白 ══════════
reset([ v_("X1",{name:"孤兒殼",channel:"shopee",sourceVideoId:"NOPE"}) ]);
as("管理員","boss"); VID_VIEW="raw";
try{ const h=viewVideos(); ok("孤兒殼不丟例外", h.includes("孤兒殼")); }
catch(e){ ok("孤兒殼不丟例外 → "+e.message, false); }
ok("孤兒殼的 anchor 退回自己", anchorOf(vid("X1")).id==="X1");

// ══════════ ⑦ 顯示名稱自動補後綴（只動畫面，不動資料）══════════
reset(MERGED.map(v=>Object.assign({},v)));
as("管理員","boss");
ok("蝦皮殼顯示補（蝦皮版）", vidNameZoned(vid("P1")).includes("（蝦皮版）"));
ok("馬來殼顯示補（馬來西亞版）", vidNameZoned(vid("M1")).includes("（馬來西亞版）"));
ok("源片不補後綴", !/（蝦皮版）|（馬來西亞版）/.test(vidNameZoned(vid("S1"))));
ok("資料本身沒有被改", vid("P1").name==="蝦皮殼");
vid("P1").name="蝦皮殼（蝦皮版）";
ok("已經有後綴的不會補第二次", (vidNameZoned(vid("P1")).match(/蝦皮版/g)||[]).length===1);

// ══════════ ⑧ 海外庫：v146 起跟台灣同一份（只是介面英文）══════════
// 舊的「挑一支台灣已上片的片來做二創」那份清單拿掉了 —— 它跟「上班計畫」的
// 建立二創版本卡是一模一樣的一份。海外真正缺的是自己開腳本、自己拍、自己傳。
reset(MERGED.map(v=>Object.assign({},v)));
as("Anna","intl"); ZONE_VIEW=null; VID_LANG=""; VID_Q=""; VID_TAGS=new Set();
VID_VIEW="old";   // 黃金源片是已上片的 → 在「舊片」那一頁
{ const h=viewVideos();
  ok("海外看到的是同一份影片庫（英文）", h.includes("Library A") && h.includes("Add one"));
  ok("海外也有那四個管線分頁", h.includes("<span>Not shot</span>") && h.includes('id="vid_tabs"'));
  ok("預設落在台灣那一頁，列得出台灣的源片", h.includes("黃金源片"));
  ok("源片的英文小字在", h.includes("vt-en") && h.includes("Golden source")); }
// 切到海外那一頁：自己的英文／泰文版本在這裡，而且點得進自己的視窗
setZoneView("intl"); VID_VIEW="raw"; VID_Q="";
{ const h=viewVideos();
  ok("海外那一頁列得到自己的版本", h.includes("openIntlModal('E1')") || h.includes("openIntlModal('T1')")); }
// 原本語言下拉：海外那一頁只有英文／泰文（沒有「中文」這個選項）
{ VID_LANG="en"; const h=viewVideos();
  ok("只看英文時泰文版不列", h.includes("openIntlModal('E1')") && !h.includes("openIntlModal('T1')")); }
{ VID_LANG="th"; const h=viewVideos();
  ok("只看泰文時英文版不列", !h.includes("openIntlModal('E1')") && h.includes("openIntlModal('T1')")); }
setZoneView("tw"); VID_LANG=""; VID_VIEW="old";
// 搜尋
VID_Q="黃金";
ok("海外搜得到源片", viewVideos().includes("黃金源片"));
VID_Q="完全沒有這種片";
ok("搜不到就是空的", !viewVideos().includes("黃金源片"));
VID_Q="";
INTL_Q="";

// 「看內容」只給四樣：標題、文案、毛片連結、完成影片連結
reset(MERGED.map(v=>Object.assign({},v)));
as("Anna","intl");
openSourceForIntl("S1");
{ const m=modalHTML;
  ok("看內容有標題", m.includes("Golden source") || m.includes("黃金源片"));
  ok("看內容有毛片連結", m.includes("http://raw"));
  ok("看內容有完成影片（下載成片＋預覽）",
     m.includes("http://drive/S1") && m.includes("openVidPreview("));
  ok("看內容沒有排程日期", !m.includes('id="e_date"') && !m.includes('class="dstrip"'));
  ok("看內容沒有階段、沒有刪除", !m.includes('id="e_stage"') && !m.includes("delVideo(")); }

// ══════════ ⑨ 兩區都看的人有區切換鈕 ══════════
reset(MERGED.map(v=>Object.assign({},v)));
as("管理員","boss");
{ const h=viewVideos();
  ok("boss 有台灣／海外切換鈕", h.includes(`setZoneView('tw')`) && h.includes(`setZoneView('intl')`));
  ok("預設停在台灣", h.includes("<span>台灣</span>") && h.includes('id="vid_tabs"'));
  ok("切換鈕帶各區的數量（台灣3、海外2）",
     h.includes('<span>台灣</span> <span class="vtab-n">3<') &&
     h.includes('<span>海外</span> <span class="vtab-n">2<')); }
setZoneView("intl");
{ const h=viewVideos();
  ok("boss 切到海外看得到同一份影片庫", h.includes("影片庫A") && h.includes("新增一支"));
  ok("boss 在海外區看的是中文（他不是海外員工）", !h.includes("Library A")); }
setZoneView("tw");
reset(MERGED.map(v=>Object.assign({},v)));
as("小葵","editor");
ok("剪輯也有區切換鈕（v142：那是篩選器不是牆）", !(!viewVideos().includes("setZoneView(")));
as("Anna","intl");
ok("海外員工也有區切換鈕（v142：兩邊互相看得到）", !(!viewVideos().includes("setZoneView(")));

// ══════════ ⑩ render 不炸 ══════════
reset(MERGED.map(v=>Object.assign({},v)));
for(const [u,r] of [["小葵","editor"],["Anna","intl"],["Regina","manager"],["管理員","boss"]]){
  as(u,r); CUR_TAB="videos";
  try{ render(); ok(u+" 的影片庫畫得出來", true); }
  catch(e){ ok(u+" 的影片庫畫得出來 → "+e.message, false); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
