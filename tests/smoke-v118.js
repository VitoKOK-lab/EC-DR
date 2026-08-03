// v118：影片索引（vidxBuild）。
//
// 影片庫每一列都要問「這支源片的版本有哪些」，本來是每一列掃一次全表 ——
// 主管視角 4000 支片要 4.8 秒，剪輯視角同一份資料只要 0.13 秒。改成兩張 Map 之後
// 主管視角回到 0.14 秒。
//
// 這支測的重點不是「快」，是「跟改動前完全等價」，外加兩個索引特有的新風險：
//   ① 快取過期 —— STATE.videos 換了／被 push 了，索引沒跟著更新
//   ② 索引被汙染 —— 呼叫端拿到索引裡的共用陣列，就地 sort 就毀了
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

const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",
  rawLink:"",cover:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  publishTime:"",finishedAt:"",publishedLink:"",driveFolder:"",productUrl:"",note:"",mainType:"",
  source:"老闆自拍",refLink:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",
  tags:[],products:[],usageHistory:[],metrics:[]},o||{});
const done=(o)=>Object.assign({stage:"已完成",published:true,publishedLink:"http://p",
  finishedAt:"2026-01-01T00:00:00"},o||{});

function reset(videos){
  modalHTML="";
  STATE={ users:[{name:"小葵",role:"editor"},{name:"Anna",role:"intl"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"acctEN"},{locale:"th",name:"acctTH"}],
      shopeeAccounts:["蝦皮A"],msAccounts:["馬來A"],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  CUR_TAB=null; VIEW_AS=null; VID_LANG=""; VID_VIEW="raw"; VID_UNSCHED=false; VID_Q=""; VID_TAGS=new Set();
  ZONE_VIEW="tw"; INTL_Q=""; INTL_LIB_LOC="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const ids=(list)=>list.map(v=>v.id).sort().join(",");
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// 一支已上片的源片，底下掛四種版本；外加一支沒有任何版本的源片、一支孤兒殼
const FIX=[
  v_("S1",done({name:"黃金源片",rawLink:"http://raw",tags:["寵粉"]})),
  v_("P1",{name:"蝦皮殼",channel:"shopee",sourceVideoId:"S1",account:"蝦皮A"}),
  v_("M1",{name:"馬來殼",channel:"ms",sourceVideoId:"S1",account:"馬來A"}),
  v_("E1",{name:"英文殼",locale:"en",sourceVideoId:"S1",account:"acctEN"}),
  v_("T1",{name:"泰文殼",locale:"th",sourceVideoId:"S1",account:"acctTH"}),
  v_("S9",done({name:"沒有版本的源片"})),
  v_("X1",{name:"孤兒殼",channel:"shopee",sourceVideoId:"NOPE"}),
];

// ══════════ ① vid() 的行為要跟原本的 .find() 一模一樣 ══════════
reset(FIX.map(v=>Object.assign({},v)));
ok("找得到源片", vid("S1") && vid("S1").name==="黃金源片");
ok("找得到版本殼", vid("E1") && vid("E1").locale==="en");
ok("找不到時回 undefined（跟 .find() 一樣）", vid("沒這支")===undefined);
ok("回傳的是同一個物件、不是複本", vid("S1")===STATE.videos.find(v=>v.id==="S1"));

// ══════════ ② 版本查詢跟改動前等價 ══════════
ok("localizedVersionsOfSrc 只回英／泰", ids(localizedVersionsOfSrc("S1"))==="E1,T1");
ok("lineVersionsOfSrc('shopee') 只回蝦皮", ids(lineVersionsOfSrc("shopee","S1"))==="P1");
ok("lineVersionsOfSrc('ms') 只回馬來", ids(lineVersionsOfSrc("ms","S1"))==="M1");
ok("lineVersionsOfSrc('en') 只回英文", ids(lineVersionsOfSrc("en","S1"))==="E1");
ok("chVersionsOfSrc 是轉呼叫，結果相同",
   ids(chVersionsOfSrc("shopee","S1"))===ids(lineVersionsOfSrc("shopee","S1")));
ok("沒有版本的源片 → 空陣列", localizedVersionsOfSrc("S9").length===0 && lineVersionsOfSrc("shopee","S9").length===0);
ok("查一個根本不存在的 id → 空陣列", localizedVersionsOfSrc("NOPE2").length===0);
// 孤兒殼：源片不在了，anchorOf 要退回自己、不能丟例外
ok("孤兒殼的 anchor 退回自己", anchorOf(vid("X1")).id==="X1");
ok("孤兒殼掛在不存在的源片下，查得到（資料還在，沒被吃掉）", ids(lineVersionsOfSrc("shopee","NOPE"))==="X1");

// ══════════ ③ 索引不會被呼叫端汙染 ══════════
reset(FIX.map(v=>Object.assign({},v)));
{ const a=localizedVersionsOfSrc("S1");
  ok("連續查兩次結果一樣", ids(a)===ids(localizedVersionsOfSrc("S1")));
  a.sort((x,y)=>y.id.localeCompare(x.id));      // 呼叫端就地排序自己拿到的那份
  a.push({id:"髒東西"});                          // 甚至塞東西進去
  ok("外面亂搞之後索引還是乾淨的", ids(localizedVersionsOfSrc("S1"))==="E1,T1");
  ok("蝦皮那條也沒被波及", ids(lineVersionsOfSrc("shopee","S1"))==="P1"); }

// ══════════ ④ 快取失效：資料變了索引要跟著變 ══════════
reset(FIX.map(v=>Object.assign({},v)));
localizedVersionsOfSrc("S1");                    // 先建好索引
STATE.videos.push(v_("E2",{name:"第二支英文殼",locale:"en",sourceVideoId:"S1",account:"acctEN"}));
ok("就地 push 之後立刻看得到新的殼", ids(localizedVersionsOfSrc("S1"))==="E1,E2,T1");
ok("push 進來的也找得到", vid("E2") && vid("E2").name==="第二支英文殼");
// 整個換掉（production 的 decorate() 走這條）
STATE.videos=[ v_("S2",done({name:"換過之後的源片"})), v_("Z1",{name:"新殼",locale:"th",sourceVideoId:"S2"}) ];
ok("整個換掉之後舊的查不到了", vid("S1")===undefined && vid("E1")===undefined);
ok("整個換掉之後新的查得到", ids(localizedVersionsOfSrc("S2"))==="Z1");
// 就地移除
STATE.videos.pop();
ok("就地 pop 之後也跟著少", localizedVersionsOfSrc("S2").length===0);

// ══════════ ⑤ 畫面上的數字沒有變（索引正確性最直接的證據）══════════
reset(FIX.map(v=>Object.assign({},v)));
as("管理員","boss"); VID_VIEW="old";
{ const row=vidTableRow(vid("S1"));
  ok("源片列有「翻了 2 種語言」的徽章", row.includes("🌐 2"));
  ok("源片列有蝦皮 1、馬來 1", row.includes("已建立 1 個蝦皮版本") && row.includes("已建立 1 個馬來版本"));
  const row9=vidTableRow(vid("S9"));
  ok("沒有版本的源片不長徽章", !row9.includes("🌐") && !/已建立/.test(row9)); }
as("小葵","editor");
ok("剪輯視角本來就沒有那些徽章（行為不變）", !vidTableRow(vid("S1")).includes("🌐"));

// ══════════ ⑥ 效能護欄 ══════════
// 2000 支片、主管視角。改成索引之前這裡大約 1.2 秒起跳，之後約 60–80ms。
// 門檻放 1500ms（約 20 倍餘裕）—— CI 機器再慢也不會誤紅，但退回每列掃全表就會被抓到。
{ const PAST=new Date(Date.now()+288e5-30*864e5).toISOString().slice(0,10);
  const big=[];
  for(let i=0;i<1200;i++) big.push(v_("BS"+i,done({name:"源片"+i,rawLink:"http://r",scheduledDate:PAST})));
  for(let i=0;i<800;i++)  big.push(v_("BP"+i,{name:"蝦皮"+i,channel:"shopee",sourceVideoId:"BS"+i,account:"蝦皮A"}));
  reset(big); as("管理員","boss"); VID_VIEW="old"; VID_TAGS=new Set(); VID_Q="";
  const t=Date.now(); const h=viewVideos(); const ms=Date.now()-t;
  ok(`2000 支片的影片庫在 1500ms 內畫完（實際 ${ms}ms）`, ms<1500);
  ok("而且真的有畫出東西", h.length>10000); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
