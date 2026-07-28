// v71：新增影片會消失的 bug —— 影片 ID 原本是「掃自己看到的最大編號 +1」，
// 兩個人幾乎同時新增就會算出同一個 ID，後寫的整份覆蓋前一筆（Firestore set），先建的那支無聲消失。
// 也會撞到回收桶裡（軟刪除、不在 STATE.videos）的舊編號。
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
let db={}, toasts=[];
let MODAL_OK=null;
eval(src);
toast=(m)=>{ toasts.push(String(m)); };
// 攔下彈窗：把「確認送出」的動作存起來，測試自己按
showModal=(title, inner, onConfirm)=>{ modalHTML=String(inner); MODAL_OK=onConfirm||null; };
closeModal=()=>{ modalHTML=""; };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
// 假的 Firestore：set 會整份覆蓋（跟真的一樣），才測得出「後蓋前」
function hookDB(){ global.window.DB={
  set:async(c,id,o)=>{ (db[c]=db[c]||{})[id]=JSON.parse(JSON.stringify(o)); },
  update:async(c,id,p)=>{ (db[c]=db[c]||{}); db[c][id]=Object.assign(db[c][id]||{}, p); },
  del:async(c,id)=>{ if(db[c]) delete db[c][id]; },
  scheduleSet:async()=>{}, setSettings:async()=>{} }; }
function reset(videos){
  db={}; toasts=[]; modalHTML=""; fields={};
  STATE={ users:[{name:"小葵",role:"editor",craft:"orig"},{name:"阿明",role:"editor",craft:"orig"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2026-07-01"},
    schedule:{}, logs:[], tasks:{}, shifts:{}, deletedVideos:[], videos: videos||[] };
  CUR_TAB=null; VIEW_AS=null; VID_LANG=""; VID_VIEW="rawNoSched"; VID_TAGS=new Set(); VID_Q="";
  hookDB();
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const mkVid=(id,over)=>Object.assign({id,code:"",name:"片"+id,rawName:"片"+id,stage:"待處理",locale:"",channel:"",
  tags:[],products:[],usageHistory:[],metrics:[],scheduledDate:null},over||{});
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ── ① 兩個人同時新增：兩支都要留著（原本會互相覆蓋）──
(async()=>{
  reset([mkVid("V001"),mkVid("V002")]);
  as("小葵","editor");
  const idA=newVideoRecord({name:"小葵的片"}).id;
  const idB=newVideoRecord({name:"阿明的片"}).id;   // 同一份 STATE，模擬兩台同時算
  ok("同時算出來的 ID 不一樣", idA!==idB);
  ok("ID 不是流水號（不會跟別人撞）", !/^V\d+$/.test(idA));

  reset([mkVid("V001"),mkVid("V002")]);
  as("小葵","editor");
  await route("POST","/api/videos",{video:{name:"小葵的片",rawName:"小葵的片"}});
  await route("POST","/api/videos",{video:{name:"阿明的片",rawName:"阿明的片"}});
  const names=Object.values(db.videos||{}).map(v=>v.name);
  ok("兩個人各新增一支，兩支都在（沒有被蓋掉）",
     Object.keys(db.videos||{}).length===2 && names.includes("小葵的片") && names.includes("阿明的片"));

  // ── ② 不會撞到回收桶裡的編號 ──
  reset([mkVid("V001")]);
  STATE.deletedVideos=[mkVid("V002",{deleted:true,deletedBy:"小葵"})];   // V002 已刪到回收桶
  as("小葵","editor");
  const idC=newVideoRecord({name:"新的片"}).id;
  ok("新影片不會拿到回收桶裡的 ID", idC!=="V002");

  // ── ③ 每一支都有人看得懂的編號 ──
  reset([]);
  as("小葵","editor");
  const r1=newVideoRecord({name:"甲"});
  ok("單支新增會自動產生編號", /^\d{7}001$/.test(r1.code));
  ok("編號是民國年＋月日＋序號", (()=>{ const [Y,M,D]=T0.split("-"); return r1.code.startsWith(`${+Y-1911}${M}${D}`); })());
  reset([mkVid("V001",{code:(()=>{const [Y,M,D]=T0.split("-");return `${+Y-1911}${M}${D}003`;})()})]);
  ok("編號接續今天最大的往下給", newVideoRecord({name:"乙"}).code.endsWith("004"));
  reset([]);
  STATE.deletedVideos=[mkVid("V009",{deleted:true,code:(()=>{const [Y,M,D]=T0.split("-");return `${+Y-1911}${M}${D}005`;})()})];
  ok("編號也會避開回收桶裡用過的", newVideoRecord({name:"丙"}).code.endsWith("006"));

  // ── ④ 批次新增 5 支：ID 與編號都不重覆 ──
  reset([mkVid("V001")]);
  as("小葵","editor");
  batchNewFootage();
  for(let i=0;i<5;i++){ fields["bn"+i]="毛片"+(i+1); fields["bl"+i]=""; }
  fields.b_lang="";
  await MODAL_OK(); await wait(30);
  { const made=Object.values(db.videos||{});
    ok("批次新增 5 支都寫進去了", made.length===5);
    ok("批次的 ID 沒有重覆", new Set(made.map(v=>v.id)).size===5);
    ok("批次的編號沒有重覆", new Set(made.map(v=>v.code)).size===5);
    ok("批次的編號是連號", made.map(v=>+String(v.code).slice(-3)).sort((a,b)=>a-b).join(",")==="1,2,3,4,5"); }

  // ── ⑤ 新增後真的看得到：進「待剪・未排程」分頁 ──
  reset([]);
  as("小葵","editor");
  await route("POST","/api/videos",{video:{name:"剛剛新增的片",rawName:"剛剛新增的片"}});
  STATE.videos=Object.values(db.videos);                       // 模擬 Firestore 同步回來
  ok("新片會落在「待剪・未排程」", vidSegment(STATE.videos[0])==="rawNoSched");
  VID_VIEW="rawNoSched";
  ok("影片庫看得到這支片", viewVideos().includes("剛剛新增的片"));
  ok("上班計畫的待認領也看得到", viewWork().includes("剛剛新增的片"));
  ok("片名前面有編號", vidTitle(STATE.videos[0]).startsWith(STATE.videos[0].code));

  // ── ⑥ 舊資料照舊：既有影片的 ID 不會被動到 ──
  reset([mkVid("V001",{name:"舊片一"}),mkVid("V002",{name:"舊片二"})]);
  ok("既有影片的 ID 保持原樣", STATE.videos.map(v=>v.id).join(",")==="V001,V002");
  ok("舊影片沒有 code 時用 ID 當顯示編號", vidCode(STATE.videos[0])==="001");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
