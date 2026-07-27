// 四條線（蝦皮／馬來／英文／泰文）行為對等：建立、認領、退回、完成、退回資料庫、改期
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="";
global.document={getElementById:(id)=>{const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
let asked=[]; global.confirm=(m)=>{asked.push(m); return true;}; global.prompt=()=>null;
eval(src);

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
function reset(){
  asked=[];
  STATE={ users:[{name:"小葵",role:"editor"}],
    settings:{ dailyTarget:4, videoTags:["舊片"], sources:["s"], postPlatforms:[],
      intlAccounts:[{locale:"en",name:"acctEN"},{locale:"th",name:"acctTH"}],
      shopeeAccounts:["acctSHP"], msAccounts:["acctMS"],
      intlDailyTarget:3, shopeeDailyTarget:5, msDailyTarget:7, exchangeRates:{} },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    videos:[
      {id:"S1",name:"源片",rawName:"源片",nameEn:"Source EN",stage:"已上片",published:true,tags:["舊片"],
       publishedLink:"http://p",driveFolder:"http://d",finishedAt:"2020-01-01T00:00:00Z",locale:"",channel:"",
       products:[{name:"項鍊",price:"100",salePrice:"80"}],productUrl:"http://u",mainType:"寵粉",source:"老闆自拍",usageHistory:[],metrics:[]},
      {id:"A1",name:"蝦皮殼",rawName:"源片",stage:"待處理",channel:"shopee",sourceVideoId:"S1",account:"acctSHP",scheduledDate:T0,tags:[],products:[],usageHistory:[],metrics:[]},
      {id:"A2",name:"馬來殼",rawName:"源片",stage:"待處理",channel:"ms",sourceVideoId:"S1",account:"acctMS",scheduledDate:T0,tags:[],products:[],usageHistory:[],metrics:[]},
      {id:"A3",name:"英文殼",rawName:"源片",stage:"待處理",locale:"en",sourceVideoId:"S1",account:"acctEN",scheduledDate:T0,tags:[],products:[],usageHistory:[],metrics:[]},
      {id:"A4",name:"泰文殼",rawName:"源片",stage:"待處理",locale:"th",sourceVideoId:"S1",account:"acctTH",scheduledDate:T0,tags:[],products:[],usageHistory:[],metrics:[]},
      {id:"B1",name:"剪輯中的蝦皮殼",rawName:"源片",stage:"剪輯中",channel:"shopee",sourceVideoId:"S1",account:"acctSHP",editor:"小葵",claimedBy:"小葵",claimedAt:T0+"T01:00:00",tags:[],products:[],usageHistory:[],metrics:[]},
    ] };
  localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
}
let calls=[];
function hookDB(){ calls=[]; global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);},
  update:async(c,id,p)=>{calls.push(["update",c,id,p]);}, del:async(c,id)=>{calls.push(["del",c,id]);},
  scheduleSet:async()=>{}, setSettings:async()=>{} }; }

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

reset();
// ── 註冊表：四條線的帳號／目標各自獨立 ──
ok("lineAccounts 四條線各自正確", JSON.stringify([lineAccounts("shopee"),lineAccounts("ms"),lineAccounts("en"),lineAccounts("th")])===JSON.stringify([["acctSHP"],["acctMS"],["acctEN"],["acctTH"]]));
ok("lineTarget 四條線各自正確", [lineTarget("shopee"),lineTarget("ms"),lineTarget("en"),lineTarget("th")].join()==="5,7,3,3");
ok("lineMatch 認得四條線", lineMatch(vid("A1"),"shopee")&&lineMatch(vid("A2"),"ms")&&lineMatch(vid("A3"),"en")&&lineMatch(vid("A4"),"th"));
ok("lineMatch 不會誤判源片", !lineMatch(vid("S1"),"shopee")&&!lineMatch(vid("S1"),"en"));
ok("lineVersionsOfSrc 分線查詢", lineVersionsOfSrc("shopee","S1").length===2 && lineVersionsOfSrc("en","S1").length===1);
ok("lineDayBreak 依線算目標", lineDayBreak("shopee",T0,"acctSHP").target===5 && lineDayBreak("en",T0,"acctEN").target===3);

// ── 建立版本：四條線都寫進正確欄位 ──
for (const [line, call, field] of [
  ["shopee", ()=>createChVersion("shopee","S1","acctSHP2"), "channel"],
  ["ms",     ()=>createChVersion("ms","S1","acctMS2"),      "channel"],
  ["en",     ()=>createLocalVersion("S1","en","acctEN2"),   "locale"],
  ["th",     ()=>createLocalVersion("S1","th","acctTH2"),   "locale"],
]) {
  reset(); hookDB(); call();
  const rec=(calls.find(c=>c[0]==="set"&&c[1]==="videos")||[])[3];
  ok(`建立 ${line} 版本：寫入 ${field}=${line}`, !!rec && rec[field]===line && rec.sourceVideoId==="S1" && rec.stage==="待處理" && rec.assignedTo==="小葵");
  if(line==="en") ok("英文版帶入英文片名草稿", rec && rec.name==="Source EN");
  if(line==="th") ok("泰文版標題留白（自行翻譯）", rec && rec.name==="");
  if(line==="shopee") ok("建立時複製源片商品與連結", rec && rec.products.length===1 && rec.productUrl==="http://u");
}
// 重複帳號擋下
reset(); hookDB(); createChVersion("shopee","S1","acctSHP");
ok("同源片同帳號不重複建立", !calls.some(c=>c[0]==="set"));

// ── 認領／退回／完成：四條線都打到同一組 API ──
for (const [name, call, id] of [
  ["蝦皮", ()=>claimVid("A1"), "A1"], ["馬來", ()=>claimVid("A2"), "A2"],
  ["英文", ()=>claimVid("A3"), "A3"], ["泰文", ()=>claimVid("A4"), "A4"],
]) { reset(); hookDB(); call();
  const u=calls.find(c=>c[0]==="update"&&c[2]===id);
  ok(`${name}認領 → 剪輯中`, !!u && u[3].stage==="剪輯中" && u[3].claimedBy==="小葵"); }

for (const [name, call, id] of [
  ["蝦皮", ()=>chUnclaim("shopee","B1"), "B1"], ["英文", ()=>intlUnclaim("A3"), "A3"],
]) { reset(); hookDB(); call();
  const u=calls.find(c=>c[0]==="update"&&c[2]===id);
  ok(`${name}退回 → 待處理`, !!u && u[3].stage==="待處理" && u[3].claimedBy==="" && asked.length===1); }

for (const [name, call, id] of [
  ["蝦皮", ()=>chFinish("shopee","B1"), "B1"], ["英文", ()=>intlFinish("A3"), "A3"],
]) { reset(); hookDB(); call();
  const u=calls.find(c=>c[0]==="update"&&c[2]===id);
  ok(`${name}完成 → 已完成`, !!u && u[3].stage==="已完成" && asked[0].includes("待審核")); }

// ── 退回資料庫：只放行本線的「待處理」殼 ──
reset(); hookDB(); chDiscard("shopee","A1");
ok("蝦皮殼可退回資料庫（purge）", calls.some(c=>c[0]==="del"&&c[2]==="A1"));
reset(); hookDB(); chDiscard("shopee","B1");
ok("剪輯中的殼不可退回", !calls.some(c=>c[0]==="del") && asked.length===0);
reset(); hookDB(); intlDiscard("A3");
ok("英文殼可退回資料庫", calls.some(c=>c[0]==="del"&&c[2]==="A3"));
reset(); hookDB(); intlDiscard("A1");
ok("intlDiscard 不會誤刪蝦皮殼", !calls.some(c=>c[0]==="del"));
reset(); hookDB(); chDiscard("shopee","A3");
ok("chDiscard 不會誤刪英文殼", !calls.some(c=>c[0]==="del"));
reset(); hookDB(); chDiscard("shopee","S1");
ok("兩者都不會動到源片", !calls.some(c=>c[0]==="del"));

// ── 改期／移出排程 ──
reset(); hookDB(); chReschedule("shopee","A1","2026-08-05",T0);
ok("蝦皮改期寫入新日期", calls.some(c=>c[0]==="update"&&c[2]==="A1"&&c[3].scheduledDate==="2026-08-05"));
reset(); hookDB(); intlReschedule("A3","2026-08-06",T0);
ok("英文改期寫入新日期", calls.some(c=>c[0]==="update"&&c[2]==="A3"&&c[3].scheduledDate==="2026-08-06"));
reset(); hookDB(); chReschedule("shopee","A1",T0,T0);
ok("改成同一天＝不寫入", !calls.length);
reset(); hookDB(); chUnschedule("shopee","A1",T0);
ok("蝦皮移出排程＝清空日期", calls.some(c=>c[0]==="update"&&c[2]==="A1"&&c[3].scheduledDate===null));
reset(); hookDB(); intlUnschedule("A3",T0);
ok("英文移出排程＝清空日期", calls.some(c=>c[0]==="update"&&c[2]==="A3"&&c[3].scheduledDate===null));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
