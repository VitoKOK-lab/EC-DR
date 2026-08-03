// v110：新增影片時「文案」必填。
// 片名只是代號，文案才說得出要拍什麼；只有片名的那些到了拍片端等於空殼。
// 從源頭擋住，之後「未拍」的片就一定有文案，不必再另外分辨。
// 注意：只擋「新增」。既有的片（很多沒有文案）照樣編輯得動，否則連補都補不了。
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
// 攔下 showModal，把「確定」的 callback 留起來自己按
const _showModal=showModal;
showModal=(title, body, onOk)=>{ modalHTML=String(body||""); modalOK=onOk; };

const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
function reset(){
  calls=[]; toasts=[]; fields={}; modalHTML=""; modalOK=null;
  STATE={ users:[{name:"小葵",role:"editor",craft:"both"},{name:"管理員",role:"boss"}],
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
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{
  // ══ ① 新增一支：沒文案擋下來 ══
  reset(); newSimpleVideo();
  ok("新增視窗有文案欄位", modalHTML.includes('id="sv_vcopy"'));
  ok("標示為必填", modalHTML.includes("必填"));

  reset(); newSimpleVideo();
  fields.sv_name="農曆七月串珠"; fields.sv_vcopy=""; fields.sv_link=""; fields.sv_lang="";
  { const r=await modalOK(); await wait(20);
    ok("有片名沒文案 → 擋下不存", r===false && !made().length);
    ok("有講原因", toasts.some(t=>t.includes("文案"))); }

  reset(); newSimpleVideo();
  fields.sv_name="農曆七月串珠"; fields.sv_vcopy="   "; fields.sv_link=""; fields.sv_lang="";
  { const r=await modalOK(); await wait(20);
    ok("文案只有空白也擋", r===false && !made().length); }

  reset(); newSimpleVideo();
  fields.sv_name=""; fields.sv_vcopy="有文案但沒片名"; fields.sv_link=""; fields.sv_lang="";
  { const r=await modalOK(); await wait(20);
    ok("沒片名照樣先擋片名", r===false && !made().length && toasts.some(t=>t.includes("片名"))); }

  reset(); newSimpleVideo();
  fields.sv_name="農曆七月串珠"; fields.sv_vcopy="這串珠可以避邪擋煞"; fields.sv_link=""; fields.sv_lang="";
  await modalOK(); await wait(20);
  { const v=made()[0]||{};
    ok("兩個都填才存得進去", made().length===1);
    ok("文案有寫進資料庫", v.videoCopy==="這串珠可以避邪擋煞");
    ok("片名也對", v.name==="農曆七月串珠" && v.rawName==="農曆七月串珠"); }

  // 毛片連結仍然是選填（還沒拍就先開片）
  reset(); newSimpleVideo();
  fields.sv_name="還沒拍的"; fields.sv_vcopy="口播內容"; fields.sv_link=""; fields.sv_lang="";
  await modalOK(); await wait(20);
  ok("毛片連結留空照樣存得起來（還沒拍）", made().length===1 && !made()[0].rawLink);
  ok("存進去之後落在未拍・未排程", vidSegment(made()[0])==="scriptNoSched");

  // ══ ② 批次新增：每一支各自檢查 ══
  reset(); batchNewFootage();
  ok("批次視窗五支都有文案欄位", [0,1,2,3,4].every(i=>modalHTML.includes(`id="bv${i}"`)));
  ok("批次也標示必填", modalHTML.includes("填了片名就必填"));

  reset(); batchNewFootage();
  for(let i=0;i<5;i++){ fields["bn"+i]=""; fields["bv"+i]=""; fields["bl"+i]=""; }
  fields.b_lang="";
  fields.bn0="第一支"; fields.bv0="口播一";
  fields.bn1="第二支"; fields.bv1="";           // ← 有片名沒文案
  { const r=await modalOK(); await wait(30);
    ok("其中一支沒文案 → 整批擋下", r===false && !made().length);
    ok("講清楚是第幾支", toasts.some(t=>t.includes("第 2 支"))); }

  reset(); batchNewFootage();
  for(let i=0;i<5;i++){ fields["bn"+i]=""; fields["bv"+i]=""; fields["bl"+i]=""; }
  fields.b_lang="";
  fields.bn0="第一支"; fields.bv0="口播一";
  fields.bn2="第三支"; fields.bv2="口播三";
  await modalOK(); await wait(40);
  { const m=made();
    ok("只填兩支就只建立兩支", m.length===2);
    ok("文案各自寫對", m.map(v=>v.videoCopy).sort().join(",")==="口播一,口播三");
    ok("沒填片名的那幾支不會被檢查（直接跳過）", !toasts.some(t=>t.includes("沒填文案"))); }

  reset(); batchNewFootage();
  for(let i=0;i<5;i++){ fields["bn"+i]=""; fields["bv"+i]=""; fields["bl"+i]=""; }
  fields.b_lang="";
  { const r=await modalOK(); await wait(20);
    ok("五支全空 → 還是提示至少要一支", r===false && toasts.some(t=>t.includes("至少"))); }

  reset(); batchNewFootage();
  for(let i=0;i<5;i++){ fields["bn"+i]="毛片"+(i+1); fields["bv"+i]="口播"+(i+1); fields["bl"+i]=""; }
  fields.b_lang="";
  await modalOK(); await wait(60);
  { const m=made();
    ok("五支都填 → 五支都建立", m.length===5);
    ok("五支都有文案", m.every(v=>String(v.videoCopy||"").trim()));
    ok("編號不重複", new Set(m.map(v=>v.code)).size===5); }

  // ══ ③ 既有影片的編輯不受影響（不然沒文案的舊片會被鎖死，連補都補不了）══
  reset();
  STATE.videos=[{id:"OLD1",code:"260101",name:"以前建的",rawName:"以前建的",videoCopy:"",rawLink:"http://raw",
    stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,publishTime:"",finishedAt:"",
    publishedLink:"",driveFolder:"",productUrl:"",note:"",mainType:"",source:"老闆自拍",refLink:"",
    reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]}];
  fields.e_code="260101"; fields.e_raw="以前建的"; fields.e_name="以前建的"; fields.e_vcopy="";
  fields.e_ref=""; fields.e_date=""; fields.e_src="老闆自拍"; fields.e_stage="待處理";
  fields.e_editor=""; fields.e_url=""; fields.e_note=""; fields.e_drive=""; fields.e_rawlink="http://raw";
  { const r=await saveVideo("OLD1"); await wait(20);
    ok("舊片文案空白照樣存得動（要能回頭補）", r!==false);
    ok("不會跳文案必填的錯誤", !toasts.some(t=>t.includes("請輸入影片文案"))); }

  // ══ ④ 二創殼不受影響（文案是之後翻譯的，建立時本來就空）══
  reset();
  STATE.videos=[{id:"S1",code:"260102",name:"源片",rawName:"源片",videoCopy:"中文口播",rawLink:"http://raw",
    stage:"已上片",published:true,publishedLink:"http://p",driveFolder:"http://d",
    finishedAt:"2020-01-01T00:00:00",tags:["舊片"],locale:"",channel:"",origLang:"",
    editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,publishTime:"",productUrl:"",note:"",
    mainType:"",source:"老闆自拍",refLink:"",reviewStatus:"",products:[],usageHistory:[],metrics:[]}];
  STATE.settings.shopeeAccounts=["蝦皮A"];
  createChVersion("shopee","S1","蝦皮A"); await wait(30);
  { const shell=made()[0];
    ok("二創殼建得起來", !!shell);
    ok("二創殼的文案是空的，沒被擋", shell && shell.videoCopy===""); }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
