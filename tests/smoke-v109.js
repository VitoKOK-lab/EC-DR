// v109：影片庫拆成七段，對齊實際的作業流程。
// 兩個獨立的軸交叉：拍了沒（毛片連結）／剪了沒（已完成）／過期沒 × 排了沒（上片日期）
//   ① 未拍・未排程   ← 要補排日期的在這裡
//   ② 未拍・已排程   等拍片
//   ③ 待剪・未排程   ← 要補排日期的在這裡
//   ④ 待剪・已排程   等剪輯認領
//   ⑤ 剪完・未排程   ← 要補排日期的在這裡
//   ⑥ 新片完成       剪完＋排好＋還沒到日子
//   ⑦ 舊片           剪完＋排好＋日子過了
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},
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

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const FUTURE=D(4), PAST=D(-4);
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",rawLink:"",cover:"",
  stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,publishTime:"",finishedAt:"",
  publishedLink:"",driveFolder:"",productUrl:"",note:"",mainType:"",source:"老闆自拍",refLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
// 剪完的：已完成＋有完成時間＋有上片連結
const done=(o)=>Object.assign({stage:"已完成",finishedAt:D(-1)+"T05:00:00",publishedLink:"http://p"},o||{});
function reset(videos){
  STATE={ users:[{name:"小葵",role:"editor",craft:"both"},{name:"Anna",role:"intl"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  CUR_TAB="videos"; VIEW_AS=null; VID_LANG=""; VID_VIEW="scriptNoSched"; VID_Q=""; VID_TAGS=new Set(); VID_MODE="list";
  POOL_FILTER="all"; POOL_Q=""; WORK_ZONE="shopee";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
  localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const tabN=(h,label)=>{ const seg=h.split(">"+label+"</span>")[1]||""; const m=seg.match(/vtab-n">(\d+)</); return m?+m[1]:null; };
const listed=(h,ids)=>ids.filter(id=>((h.split('id="vid_list"')[1])||"").includes("'"+id+"'"));
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ ① 七段各自判定正確 ══
reset();
ok("只有片名＋文案，沒排 → 未拍・未排程",
   vidSegment(v_("A",{videoCopy:"口播"}))==="scriptNoSched");
ok("有文案又排了日期，還沒拍 → 未拍・已排程",
   vidSegment(v_("B",{videoCopy:"口播",scheduledDate:FUTURE}))==="scriptSched");
ok("拍好了但還沒排 → 待剪・未排程",
   vidSegment(v_("C",{rawLink:"http://raw"}))==="rawNoSched");
ok("拍好也排好了 → 待剪・已排程",
   vidSegment(v_("D",{rawLink:"http://raw",scheduledDate:FUTURE}))==="rawSched");
ok("剪完了但沒排 → 剪完・未排程",
   vidSegment(v_("E",done({rawLink:"http://raw"})))==="newNoSched");
ok("剪完＋排在未來 → 新片完成",
   vidSegment(v_("F",done({rawLink:"http://raw",scheduledDate:FUTURE})))==="newSched");
ok("剪完＋排的日子過了 → 舊片",
   vidSegment(v_("G",done({rawLink:"http://raw",scheduledDate:PAST})))==="old");

// 邊界：沒剪完但日子過了，不能算舊片（剪太慢過期的還是待剪）
ok("沒剪完但過期了 → 還是待剪・已排程",
   vidSegment(v_("H",{rawLink:"http://raw",scheduledDate:PAST}))==="rawSched");
ok("沒拍但日子過了 → 還是未拍・已排程",
   vidSegment(v_("I",{scheduledDate:PAST}))==="scriptSched");

// ══ ② 七段互斥、涵蓋全部 ══
reset();
{ const ALL=[v_("A",{videoCopy:"口播"}), v_("B",{videoCopy:"口播",scheduledDate:FUTURE}),
             v_("C",{rawLink:"http://raw"}), v_("D",{rawLink:"http://raw",scheduledDate:FUTURE}),
             v_("E",done({rawLink:"http://raw"})), v_("F",done({rawLink:"http://raw",scheduledDate:FUTURE})),
             v_("G",done({rawLink:"http://raw",scheduledDate:PAST}))];
  const segs=ALL.map(vidSegment);
  ok("每一支都剛好落在一段", segs.every(s=>VID_SEGS.includes(s)));
  ok("七段各一支、不重複", new Set(segs).size===7);
  ok("順序就是流程的順序",
     JSON.stringify(segs)===JSON.stringify(VID_SEGS)); }

// ══ ③ 排序：照流程由前往後 ══
reset();
ok("未拍・未排程排第一（0）", vidOrderRank(v_("A",{videoCopy:"x"}))===0);
ok("未拍・已排程排第二（1）", vidOrderRank(v_("B",{videoCopy:"x",scheduledDate:FUTURE}))===1);
ok("待剪・未排程排第三（2）", vidOrderRank(v_("C",{rawLink:"http://raw"}))===2);
ok("待剪・已排程排第四（3）", vidOrderRank(v_("D",{rawLink:"http://raw",scheduledDate:FUTURE}))===3);
ok("舊片排最後（6）", vidOrderRank(v_("G",done({rawLink:"http://raw",scheduledDate:PAST})))===6);

// ══ ④ 分頁列 ══
const LIB=[
  v_("A1",{videoCopy:"口播"}), v_("A2",{videoCopy:"口播"}),          // 未拍・未排程 2
  v_("B1",{videoCopy:"口播",scheduledDate:FUTURE}),                   // 未拍・已排程 1
  v_("C1",{rawLink:"http://raw"}),                                    // 待剪・未排程 1
  v_("D1",{rawLink:"http://raw",scheduledDate:FUTURE}),               // 待剪・已排程 1
  v_("E1",done({rawLink:"http://raw"})),                              // 剪完・未排程 1
  v_("F1",done({rawLink:"http://raw",scheduledDate:FUTURE})),         // 新片完成 1
  v_("G1",done({rawLink:"http://raw",scheduledDate:PAST})),           // 舊片 1
];
reset(LIB); as("管理員","boss");
{ const h=viewVideos();
  const NAMES=["未拍・未排程","未拍・已排程","待剪・未排程","待剪・已排程","剪完・未排程","新片完成","舊片"];
  ok("七個分頁都在", NAMES.every(x=>h.includes("<span>"+x+"</span>")));
  ok("分頁順序＝流程順序",
     NAMES.map(x=>h.indexOf("<span>"+x+"</span>")).every((v,i,a)=>i===0||(v>0&&v>a[i-1])));
  ok("未拍・未排程 2", tabN(h,"未拍・未排程")===2);
  ok("未拍・已排程 1", tabN(h,"未拍・已排程")===1);
  ok("待剪・未排程 1", tabN(h,"待剪・未排程")===1);
  ok("待剪・已排程 1", tabN(h,"待剪・已排程")===1);
  ok("剪完・未排程 1", tabN(h,"剪完・未排程")===1);
  ok("新片完成 1", tabN(h,"新片完成")===1);
  ok("舊片 1", tabN(h,"舊片")===1);
  ok("加起來等於全部 8 支",
     NAMES.reduce((a,x)=>a+tabN(h,x),0)===LIB.length); }

// 每一頁點進去只列自己那一段
reset(LIB); as("管理員","boss");
[["scriptNoSched",["A1","A2"]],["scriptSched",["B1"]],["rawNoSched",["C1"]],["rawSched",["D1"]],
 ["newNoSched",["E1"]],["newSched",["F1"]],["old",["G1"]]].forEach(([view,want])=>{
  VID_VIEW=view;
  const got=listed(viewVideos(), LIB.map(v=>v.id));
  ok(`${view} 只列 ${want.join("/")}`, JSON.stringify(got)===JSON.stringify(want)); });

// ══ ⑤ 「要補排日期」的三頁：加起來就是所有沒排程的 ══
reset(LIB); as("管理員","boss");
{ const h=viewVideos();
  const noSched=tabN(h,"未拍・未排程")+tabN(h,"待剪・未排程")+tabN(h,"剪完・未排程");
  const actual=LIB.filter(v=>!v.scheduledDate).length;
  ok("三個「未排程」分頁加起來＝所有沒排日期的片", noSched===actual && noSched===4); }

// ══ ⑥ 補上日期、補上毛片連結之後會自己換頁 ══
reset();
{ const v=v_("X",{videoCopy:"口播"});
  ok("起點：未拍・未排程", vidSegment(v)==="scriptNoSched");
  v.scheduledDate=FUTURE;
  ok("補排日期 → 未拍・已排程", vidSegment(v)==="scriptSched");
  v.rawLink="http://raw";
  ok("補毛片連結 → 待剪・已排程", vidSegment(v)==="rawSched");
  Object.assign(v, done({}));
  ok("剪完 → 新片完成", vidSegment(v)==="newSched");
  v.scheduledDate=PAST;
  ok("日子過了 → 舊片", vidSegment(v)==="old"); }
// 沒排日期的那條路徑
reset();
{ const v=v_("Y",{videoCopy:"口播"});
  v.rawLink="http://raw";
  ok("沒排日期直接拍 → 待剪・未排程", vidSegment(v)==="rawNoSched");
  Object.assign(v, done({}));
  ok("沒排日期剪完 → 剪完・未排程", vidSegment(v)==="newNoSched"); }

// ══ ⑦ 待認領：未拍的兩段都不進去 ══
reset([v_("A1",{videoCopy:"口播"}), v_("B1",{videoCopy:"口播",scheduledDate:FUTURE}),
       v_("C1",{rawLink:"http://raw"}), v_("D1",{rawLink:"http://raw",scheduledDate:FUTURE}),
       v_("P1",{channel:"shopee",sourceVideoId:"C1",account:"蝦皮A"})]);
as("小葵","editor");
{ const w=viewWork();
  ok("未拍・未排程不進待認領", !w.includes("claimVid('A1')"));
  ok("未拍・已排程也不進待認領", !w.includes("claimVid('B1')"));
  ok("待剪・未排程進得去", w.includes("claimVid('C1')"));
  ok("待剪・已排程進得去", w.includes("claimVid('D1')"));
  ok("二創殼不受影響", w.includes("claimVid('P1')")); }

// ══ ⑧ 搜尋時七個數字都跟著動 ══
reset(LIB.concat([v_("Z1",{videoCopy:"口播",name:"關鍵字片"})])); as("管理員","boss");
VID_Q="關鍵字";
{ const h=viewVideos();
  ok("搜尋後只有未拍・未排程是 1", tabN(h,"未拍・未排程")===1);
  ok("其餘六頁都是 0",
     ["未拍・已排程","待剪・未排程","待剪・已排程","剪完・未排程","新片完成","舊片"]
       .every(x=>tabN(h,x)===0)); }

// ══ ⑨ 海外看到英文、沒有中文洩漏 ══
reset(LIB); as("Anna","intl");
{ const h=viewVideos();
  ok("海外七個分頁都是英文",
     ["Not shot · unscheduled","Not shot · scheduled","Raw · unscheduled","Raw · scheduled",
      "Done · unscheduled","New","Old"].every(x=>h.includes("<span>"+x+"</span>")));
  ok("海外沒有中文分頁名洩漏", !h.includes("未拍") && !h.includes("待剪") && !h.includes("剪完")); }

// ══ ⑩ render 不炸 ══
reset(LIB);
[["管理員","boss"],["小葵","editor"],["Anna","intl"]].forEach(([u,r])=>{
  VID_SEGS.forEach(view=>{
    as(u,r); CUR_TAB="videos"; VID_VIEW=view; VID_Q=""; VID_TAGS=new Set();
    try{ render(); ok(`[${r}] ${view}`, true); }catch(e){ ok(`[${r}] ${view} → ${e.message}`, false); } }); });
reset([]); as("管理員","boss");
VID_SEGS.forEach(view=>{ VID_VIEW=view;
  try{ viewVideos(); ok(`一支影片都沒有時 ${view} 也畫得出來`, true); }
  catch(e){ ok(`一支影片都沒有時 ${view} → ${e.message}`, false); } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
