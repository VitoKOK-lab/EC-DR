// v251（老闆指定）：「現在還是要填時間才能送出」——新增影片的「上片時間」是
// v184 那三個必填裡最後一個還在擋的，一起拿掉。必填只剩片名跟文案。
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
// ══════════ ① 上片時間不再標必填 ══════════
{ reset(); newSimpleVideo();
  ok("**「上片時間」不再寫「必填」**", modalHTML.includes("上片時間") && !/上片時間[^<]*必填/.test(modalHTML), modalHTML.slice(0,500)); }

// ══════════ ② 沒填時間照樣存得進去，publishTime 存成空字串 ══════════
{ reset(); newSimpleVideo();
  fields.sv_name="只填片名跟文案"; fields.sv_vcopy="口播內容"; fields.sv_link=""; fields.sv_date=""; fields.sv_time="";
  const r=await modalOK(); await wait(20);
  ok("**沒填時間照樣存得進去**", r!==false && made().length===1);
  ok("publishTime 存成空字串", made()[0].publishTime===""); }

// ══════════ ③ 片名／文案還是唯二必填，不是全部鬆開了 ══════════
{ reset(); newSimpleVideo();
  fields.sv_name=""; fields.sv_vcopy=""; fields.sv_link=""; fields.sv_date=""; fields.sv_time="";
  const r=await modalOK(); await wait(20);
  ok("沒片名還是擋下來", r===false && !made().length); }
{ reset(); newSimpleVideo();
  fields.sv_name="有片名"; fields.sv_vcopy=""; fields.sv_link=""; fields.sv_date=""; fields.sv_time="";
  const r=await modalOK(); await wait(20);
  ok("沒文案還是擋下來", r===false && !made().length); }

// ══════════ ④ 四格全空（只填片名文案）也存得起來 —— 整合驗 v245／v248／v251 三條一起生效 ══════════
{ reset(); newSimpleVideo();
  fields.sv_name="四格都沒填的片"; fields.sv_vcopy="口播內容"; fields.sv_link=""; fields.sv_date=""; fields.sv_time="";
  const r=await modalOK(); await wait(20);
  ok("**只填片名跟文案，其他全空也存得起來**",
     r!==false && made().length===1 && made()[0].driveFolder==="" && made()[0].scheduledDate===null && made()[0].publishTime==="",
     made()[0]); }

console.log(`\nv251（新增影片：上片時間也改選填，必填只剩片名與文案）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
