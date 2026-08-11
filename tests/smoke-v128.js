// v128：審片看得見。
//
// 回報：「我沒有看到 Regina 有沒有審，剪輯也不知道審好了嗎」。
// 原本的設計是「Regina 口頭說 OK，剪輯自己按已審過」—— 流程沒壞，但兩邊都看不見對方：
//   剪輯的上班計畫只講今天要處理的事，看不出這一週剪的片哪幾支還卡著、卡多久
//   Regina 的「待你審片」排在流程中控整頁的最後面，而且沒寫等了幾天
//
// 這支測兩件事：
//   ① 剪輯的上班計畫多一張「最近 7 天剪完的片」摺疊卡，每支寫出審片狀態與等待天數
//   ② Regina 的「待你審片」移到「毛片庫存＆指派」的下一個，每列標出等了幾天
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,isConnected:true,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
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

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);   // D(0)=今天、D(-3)=三天前
const V=(id,name,o)=>Object.assign({id,code:"26"+id,name,rawName:name,videoCopy:"稿",rawLink:"http://raw",
  stage:"已完成",editor:"小葵",claimedBy:"小葵",claimedAt:D(-1)+"T09:00:00",finishedAt:D(0)+"T15:00:00",
  scheduledDate:null,publishedLink:"",driveFolder:"",reviewStatus:"",reviewNote:"",reviewedBy:"",reviewedAt:"",
  locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(){
  modalHTML=""; fields={};
  STATE={ users:[{name:"小葵",role:"editor"},{name:"郁莚",role:"editor"},
                 {name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:["蝦皮A"],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; POOL_FILTER="all"; POOL_Q=""; ORIG_AUTO_RAN=true;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{},
    scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══════════ ① 等了幾天 ══════════
reset(); as("小葵","editor");
ok("今天剪完＝等 1 天", reviewWaitDays(V("x","x",{finishedAt:D(0)+"T15:00:00"}))===1);
ok("三天前剪完＝等 4 天", reviewWaitDays(V("x","x",{finishedAt:D(-3)+"T15:00:00"}))===4);
ok("沒有完成時間就不算", reviewWaitDays(V("x","x",{finishedAt:""}))===null);
ok("等 1 天不上色", reviewWaitPill(V("x","x",{finishedAt:D(0)+"T15:00:00"})).includes('class="pill "'));
ok("等 2 天轉黃", reviewWaitPill(V("x","x",{finishedAt:D(-1)+"T15:00:00"})).includes('class="pill wa"'));
ok("等 3 天以上轉紅", reviewWaitPill(V("x","x",{finishedAt:D(-2)+"T15:00:00"})).includes('class="pill em"')
   && reviewWaitPill(V("x","x",{finishedAt:D(-6)+"T15:00:00"})).includes('class="pill em"'));

// ══════════ ② 一支片的審片狀態寫成人話 ══════════
reset(); as("小葵","editor");
ok("還沒審：寫出來而且標等幾天", (()=>{ const s=reviewStateHTML(V("x","x",{finishedAt:D(-2)+"T15:00:00"}));
  return s.includes("還沒審") && s.includes("等 3 天"); })());
ok("退回：寫出原因", (()=>{ const s=reviewStateHTML(V("x","x",{reviewStatus:"退回",reviewNote:"字卡打錯"}));
  return s.includes("退回") && s.includes("字卡打錯"); })());
ok("Regina 審過：寫出是誰按的", (()=>{ const s=reviewStateHTML(V("x","x",{reviewStatus:"通過",reviewedBy:"Regina",reviewedAt:D(0)+"T16:00:00"}));
  return s.includes("已審過") && s.includes("Regina") && !s.includes("自己標的"); })());
// 這一條是整組的重點：剪輯自己按的跟 Regina 按的資料長得一樣，不寫出來就分不出來
ok("自己標的：註明「自己標的」", (()=>{ const s=reviewStateHTML(V("x","x",{reviewStatus:"通過",reviewedBy:"小葵",reviewedAt:D(0)+"T16:00:00"}));
  return s.includes("已審過") && s.includes("自己標的"); })());
ok("已上片：不再問審不審", reviewStateHTML(V("x","x",{stage:"已上片",published:true,publishedLink:"http://p"})).includes("已上片"));

// ══════════ ③ 剪輯：最近 7 天剪完的片 ══════════
reset(); as("小葵","editor");
STATE.videos=[
  V("A","等三天還沒審",{finishedAt:D(-2)+"T15:00:00"}),
  V("B","Regina 審過的",{finishedAt:D(-1)+"T15:00:00",reviewStatus:"通過",reviewedBy:"Regina",reviewedAt:D(-1)+"T16:00:00"}),
  V("C","自己標過的",{finishedAt:D(-1)+"T15:00:00",reviewStatus:"通過",reviewedBy:"小葵",reviewedAt:D(-1)+"T16:00:00"}),
  V("D","被退回的",{finishedAt:D(-3)+"T15:00:00",reviewStatus:"退回",reviewNote:"字卡打錯"}),
  V("E","八天前剪完的",{finishedAt:D(-8)+"T15:00:00"}),
  V("F","別人剪的",{finishedAt:D(0)+"T15:00:00",editor:"郁莚",claimedBy:"郁莚"}),
  V("G","還在剪的",{stage:"剪輯中",finishedAt:""}),
];
{ const c=workRecent7Card("小葵");
  ok("列出七天內剪完的", c.includes("等三天還沒審") && c.includes("Regina 審過的") && c.includes("被退回的"));
  ok("八天前的不列（就是七天）", !c.includes("八天前剪完的"));
  ok("別人剪的不列", !c.includes("別人剪的"));
  ok("還沒剪完的不列（還沒到審片這一步）", !c.includes("還在剪的"));
  ok("summary 的數字＝真的列出來的支數", c.includes('<span class="n">4</span>'));
  ok("summary 標出還有幾支沒審", c.includes("1 支還沒審"));
  ok("預設是收起來的", !/^<details class="fold" open/.test(c) && !c.includes("<details class=\"fold\" open"));
  ok("看得出誰審的、誰是自己標的", c.includes("Regina") && c.includes("自己標的"));
  ok("看得出等了幾天", c.includes("等 3 天"));
  ok("點得進影片", c.includes("editVideo('A')"));
  ok("新的排在上面", c.indexOf("Regina 審過的")<c.indexOf("等三天還沒審")); }
// 七天內什麼都沒剪完 → 整張卡不出現（不要硬擠一張空的）
reset(); as("小葵","editor");
STATE.videos=[ V("Z","很久以前的",{finishedAt:D(-30)+"T15:00:00"}) ];
ok("七天內沒東西就整張卡不出現", workRecent7Card("小葵")==="");

// ══════════ ④ 真的掛在上班計畫上，而且在審片進度卡的下面 ══════════
reset(); as("小葵","editor");
STATE.videos=[ V("A","等審的片",{finishedAt:D(-2)+"T15:00:00"}) ];
{ const h=viewWork();
  ok("上班計畫看得到這張卡", h.includes("最近 7 天剪完的片"));
  ok("排在「審片進度」的下面", h.indexOf("審片進度")<h.indexOf("最近 7 天剪完的片"));
  ok("排在「今天要做的事」的上面", h.indexOf("最近 7 天剪完的片")<h.indexOf("今天要做的事")); }
// 不剪片的職位沒有這張卡（他們沒有影片）
reset(); as("小葵","editor");
STATE.users.push({name:"江瑩",role:"mkt"});
as("江瑩","mkt");
ok("不剪片的職位看不到（本來就沒有影片）", !viewWorkCS("江瑩").includes("最近 7 天剪完的片"));

// ══════════ ⑤ Regina：待你審片往上移、標出等幾天 ══════════
reset(); as("Regina","manager");
STATE.videos=[
  V("A","等三天的",{finishedAt:D(-2)+"T15:00:00"}),
  V("B","今天剛剪完的",{finishedAt:D(0)+"T15:00:00"}),
];
{ const h=viewFlow();
  ok("排在「毛片庫存＆指派」的下一個", h.indexOf("毛片庫存＆指派")<h.indexOf("待你審片"));
  ok("排在「團隊交辦＆回報」的上面（本來在整頁最後面）", h.indexOf("待你審片")<h.indexOf("團隊交辦＆回報"));
  ok("還是摺疊的", h.includes('<summary>🎞 待你審片<span class="n">2</span>'));
  ok("預設收起來", !/待你審片[\s\S]{0,80}open/.test(h));
  ok("每列標出等了幾天", h.includes("等 3 天") && h.includes("等 1 天"));
  ok("等太久的標紅", /等 3 天/.test(h) && h.includes('class="pill em"')); }
// 管理員看到的是同一頁
reset(); as("管理員","boss");
STATE.videos=[ V("A","等審的",{finishedAt:D(-2)+"T15:00:00"}) ];
{ const h=viewFlow();
  ok("管理員也看得到，位置一樣", h.indexOf("毛片庫存＆指派")<h.indexOf("待你審片")
     && h.indexOf("待你審片")<h.indexOf("團隊交辦＆回報")); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
