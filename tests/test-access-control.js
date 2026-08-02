// Test access control for scheduling features
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,rows:0,
  classList:{_s:new Set(),toggle(){},add(c){this._s.add(c);},remove(c){this._s.delete(c);},contains(c){return this._s.has(c);}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},dispatchEvent(){},
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, nodes={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(nodes[id]) return nodes[id];
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
let calls=[], toasts=[];
eval(src);
toast=(m,e)=>{ toasts.push(String(m)); };

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==';
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",rawLink:"http://d",cover:"",
  stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,publishTime:"",finishedAt:"",publishedLink:"",
  driveFolder:"",productUrl:"",note:"",mainType:"",source:"老闆自拍",refLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});

function reset(){
  calls=[]; toasts=[]; fields={}; nodes={}; modalHTML="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Anna",role:"intl",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Regina",role:"manager",pwHash:H},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, logs:[], deletedVideos:[], shifts:{}, tasks:{}, videos:[v_("R1",{stage:"待處理"})] };
  CUR_TAB=null; VIEW_AS=null; CAL_PLAT="tw"; CAL_YM=null;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, arrayAdd:async()=>{}, arrayDel:async()=>{}, bump:async()=>{} };
}

const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const TOM=D(1);
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// Test access control
reset(); as("Regina","manager"); CUR_TAB="cal";
modalHTML=""; openDay(TOM);
ok("Manager can access openDay (modal shows)", modalHTML.includes('id="od_cats"'));

reset(); as("管理員","boss"); CUR_TAB="cal";
modalHTML=""; openDay(TOM);
ok("Boss can access openDay (modal shows)", modalHTML.includes('id="od_cats"'));

reset(); as("Anna","intl"); CUR_TAB="cal";
modalHTML=""; toasts=[]; openDay(TOM);
ok("Intl user cannot access openDay (no modal)", !modalHTML.includes('id="od_cats"'));
ok("Intl user gets error toast", toasts.some(t=>t.includes("只有") || t.includes("Only")));

reset(); as("小葵","editor"); CUR_TAB="cal";
modalHTML=""; toasts=[]; openDay(TOM);
ok("Editor cannot access openDay (no modal)", !modalHTML.includes('id="od_cats"'));
ok("Editor gets error toast", toasts.some(t=>t.includes("只有") || t.includes("Only")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
