// v248（老闆指定）：「現在的存資料夾 和 日期 不用寫必填」——
// 日期已經在 v245 改選填了，這裡把存檔資料夾也改選填。
// 只有片名、沒有連結的片不會卡在「新增」這一步擋下來——它本來就進不了 v246
// 新開的指派清單（vidHasRaw 擋住），之後補上連結就會自動出現在清單裡。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", modalOK=null, viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
let calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };
const _showModal=showModal;
showModal=(title, body, onOk)=>{ modalHTML=String(body||""); modalOK=onOk; };

const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
function reset(){
  calls=[]; toasts=[]; fields={}; modalHTML=""; modalOK=null;
  STATE={ users:[{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  CUR_TAB="videos"; VIEW_AS=null; VID_LANG=""; VID_VIEW="script"; VID_Q=""; VID_TAGS=new Set();
  BULK_BUSY=false;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
  localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
}
const made=()=>calls.filter(c=>c[0]==="set"&&c[1]==="videos").map(c=>c[3]);
let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n,x===undefined?"":JSON.stringify(x).slice(0,200));} }

(async()=>{
// ══════════ ① 存檔資料夾不再標必填 ══════════
{ reset(); newSimpleVideo();
  ok("**「存檔資料夾」不再寫「必填」**", modalHTML.includes("存檔資料夾") && !/存檔資料夾[^<]*必填/.test(modalHTML), modalHTML.slice(0,400)); }

// ══════════ ② 沒填存檔資料夾照樣存得進去，driveFolder 存成空字串 ══════════
{ reset(); newSimpleVideo();
  fields.sv_name="只有名字的片"; fields.sv_vcopy="口播內容"; fields.sv_link=""; fields.sv_date=""; fields.sv_time="15:00"; fields.sv_lang="";
  const r=await modalOK(); await wait(20);
  ok("**沒填存檔資料夾照樣存得進去**", r!==false && made().length===1);
  ok("driveFolder 存成空字串（不是擋下來、也不是塞假連結）", made()[0].driveFolder===""); }

// ══════════ ③ 片名／文案照舊必填，不是連這兩個也鬆開了 ══════════
{ reset(); newSimpleVideo();
  fields.sv_name=""; fields.sv_vcopy=""; fields.sv_link=""; fields.sv_date=""; fields.sv_time="15:00"; fields.sv_lang="";
  const r=await modalOK(); await wait(20);
  ok("沒片名還是擋下來（這次只放寬存檔資料夾跟日期）", r===false && !made().length); }

// ══════════ ④ 上片時間照舊必填 ══════════
{ reset(); newSimpleVideo();
  fields.sv_name="只有名字的片"; fields.sv_vcopy="口播內容"; fields.sv_link=""; fields.sv_date=""; fields.sv_time="";
  const r=await modalOK(); await wait(20);
  ok("上片時間照舊必填（這次沒放寬這格）", r===false && !made().length); }

// ══════════ ⑤ 整合：這種「只有名字」的新片不會混進 v246 的指派清單 ══════════
{ reset(); newSimpleVideo();
  fields.sv_name="只有名字的片"; fields.sv_vcopy="口播內容"; fields.sv_link=""; fields.sv_date=""; fields.sv_time="15:00"; fields.sv_lang="";
  await modalOK(); await wait(20);
  const v=Object.assign({id:"NEW1", stage:"待處理", assignedTo:"", products:[], usageHistory:[], tags:[], metrics:[]}, made()[0]);
  STATE.videos=[v];
  const d=dashSchedule();
  ok("**只有名字、沒連結的新片不會出現在待指派清單**（跟 v246 接得起來）",
     !d.unassignedPool.some(x=>x.id==="NEW1"), d.unassignedPool.map(x=>x.id)); }

console.log(`\nv248（新增影片：存檔資料夾也改回選填，日期已在 v245 改過）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
