// v73：剪好的影片出現在影片庫，卻沒出現在「我的今日工作」的已完成清單。
// 三種情況會漏掉：①階段變成「已上片」 ②剪輯人員欄是空的（只有認領人） ③今天按過下班。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=()=>{};

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const YESTER=new Date(Date.now()+288e5-864e5).toISOString().slice(0,10);
const mk=(o)=>Object.assign({id:"V"+(mk.n=(mk.n||0)+1), code:"", rawName:o.name, locale:"", channel:"",
  tags:[], products:[], usageHistory:[], metrics:[], scheduledDate:null}, o);
function setup(videos, shifts){
  STATE={ users:[{name:"小葵",role:"editor",craft:"orig"},{name:"阿明",role:"editor",craft:"orig"}],
    settings:{dailyTarget:4,videoTags:[],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, logs:[], tasks:{}, shifts:shifts||{}, deletedVideos:[], videos:videos };
  localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
  WORK_ZONE="shopee"; POOL_FILTER="all"; VIEW_AS=null;
}
// 只看「我的今日工作」那張卡（不含下面的工作計畫卡）
// 只看「今天要做的事」那張卡（後面的折疊區塊不算）
function myWorkCard(){ const w=viewWork(); return (w.split("今天要做的事")[1]||"").split("<details")[0]; }
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ── 三種原本會漏掉的情況 ──
setup([mk({name:"已上片的片",stage:"已上片",published:true,editor:"小葵",finishedAt:T0+"T05:00:00"})]);
ok("① 階段已上片也要看得到", myWorkCard().includes("已上片的片"));

setup([mk({name:"沒填剪輯的片",stage:"已完成",editor:"",claimedBy:"小葵",finishedAt:T0+"T05:00:00"})]);
ok("② 剪輯人員空、只有認領人也要看得到", myWorkCard().includes("沒填剪輯的片"));

setup([mk({name:"下班後完成的片",stage:"已完成",editor:"小葵",finishedAt:T0+"T05:00:00"})],
      {["小葵__"+T0]:{user:"小葵",date:T0,clockIn:T0+"T01:00:00",clockOut:T0+"T09:00:00"}});
ok("③ 今天按過下班也還看得到", myWorkCard().includes("下班後完成的片"));

// ── 本來就對的不能壞 ──
setup([mk({name:"今天剪完的片",stage:"已完成",editor:"小葵",finishedAt:T0+"T05:00:00"})]);
ok("今天剪完的照樣看得到", myWorkCard().includes("今天剪完的片"));
setup([mk({name:"剪輯中的片",stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:T0+"T01:00:00"})]);
ok("剪輯中的照樣看得到", myWorkCard().includes("剪輯中的片"));

// ── 不該出現的還是不能出現 ──
setup([mk({name:"昨天完成的片",stage:"已完成",editor:"小葵",finishedAt:YESTER+"T05:00:00"})]);
ok("昨天完成的不會殘留到今天", !myWorkCard().includes("昨天完成的片"));
setup([mk({name:"別人的片",stage:"已完成",editor:"阿明",finishedAt:T0+"T05:00:00"})]);
ok("別人完成的不會跑到我這裡", !myWorkCard().includes("別人的片"));
setup([mk({name:"我認領但轉給別人的片",stage:"已完成",editor:"阿明",claimedBy:"小葵",finishedAt:T0+"T05:00:00"})]);
ok("已指定別的剪輯就不算我的", !myWorkCard().includes("我認領但轉給別人的片"));
setup([mk({name:"還沒認領的毛片",stage:"待處理"})]);
ok("待處理的不會混進今日工作", !myWorkCard().includes("還沒認領的毛片"));

// ── 上方的「今日完成」數字要跟清單一致 ──
setup([mk({name:"甲",stage:"已上片",published:true,editor:"小葵",finishedAt:T0+"T05:00:00"}),
       mk({name:"乙",stage:"已完成",editor:"",claimedBy:"小葵",finishedAt:T0+"T06:00:00"}),
       mk({name:"丙",stage:"已完成",editor:"阿明",finishedAt:T0+"T07:00:00"})]);
{ const w=viewWork();
  ok("焦點列的今日完成算 2 支（不含別人的）", w.includes('<span class="fn">2</span><span class="fl">今日完成</span>'));
  ok("清單裡兩支都在", myWorkCard().includes("甲") && myWorkCard().includes("乙")); }

// ── 團隊看板／儀表板本來就用 isPublished，維持一致 ──
setup([mk({name:"已上片的片",stage:"已上片",published:true,editor:"小葵",finishedAt:T0+"T05:00:00"})]);
ok("團隊看板也算得到這支", viewTeam().includes(">1</div><div class=\"l\">今日完成"));

// ── 從編輯視窗把階段改成已完成時，要自動蓋上完成時間 ──
(async()=>{
  const calls=[];
  global.window.DB={ set:async()=>{}, update:async(c,id,p)=>{calls.push([c,id,p]);}, del:async()=>{},
    scheduleSet:async()=>{}, setSettings:async()=>{} };
  setup([mk({name:"手動改成已完成",stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:T0+"T01:00:00",finishedAt:""})]);
  const vid1=STATE.videos[0].id;
  await route("PUT","/api/videos/"+vid1,{video:{stage:"已完成"}});
  const p1=(calls.find(c=>c[1]===vid1)||[])[2]||{};
  ok("改成已完成會自動蓋上完成時間", String(p1.finishedAt||"").slice(0,10)===T0);
  ok("順便算出這支花的工時", typeof p1.durationMin==="number");

  calls.length=0;
  setup([mk({name:"已經有完成時間的",stage:"已完成",editor:"小葵",finishedAt:YESTER+"T05:00:00"})]);
  const vid2=STATE.videos[0].id;
  await route("PUT","/api/videos/"+vid2,{video:{name:"改個名字"}});
  const p2=(calls.find(c=>c[1]===vid2)||[])[2]||{};
  ok("本來就有完成時間的不會被改掉", p2.finishedAt===undefined);

  calls.length=0;
  setup([mk({name:"退回剪輯中",stage:"已完成",editor:"小葵",finishedAt:T0+"T05:00:00"})]);
  const vid3=STATE.videos[0].id;
  await route("PUT","/api/videos/"+vid3,{video:{stage:"剪輯中",finishedAt:""}});
  const p3=(calls.find(c=>c[1]===vid3)||[])[2]||{};
  ok("退回剪輯中不會硬蓋完成時間", !p3.finishedAt);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
