// v87：剪輯的「已審過（通過）」收成一條折疊 —— 太占版面，點了再打開
//      但收起來的那一行要寫出「還有幾支缺連結」，不然收合等於忘記去補
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
let calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==';
const vd=(o)=>Object.assign({id:o.id,code:"",name:"片"+o.id,rawName:"x",stage:"已完成",editor:"小葵",claimedBy:"小葵",
  claimedAt:D(-3)+"T01:00:00",finishedAt:D(-1)+"T05:00:00",reviewStatus:"",reviewedBy:"",reviewedAt:"",reviewNote:"",
  driveFolder:"",publishedLink:"",assignedTo:"",locale:"",channel:"",source:"",tags:[],products:[],usageHistory:[],metrics:[]},o);
// 已審過、連結還沒補齊（要去做事）
const needLink=(id)=>vd({id,reviewStatus:"通過",reviewedBy:"管理員",reviewedAt:D(-1)});
// 已審過、連結都補齊了（只等按「知道了」）
const allSet=(id)=>vd({id,reviewStatus:"通過",reviewedBy:"Regina",reviewedAt:D(-1),
  driveFolder:"http://d",publishedLink:"http://p"});
function reset(videos){
  calls=[]; toasts=[]; fields={};
  POOL_FILTER="all"; POOL_Q="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Anna",role:"intl",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["s"],postPlatforms:[],intlAccounts:[],shopeeAccounts:[],
      msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",workStart:"09:00",workEnd:"18:00"},
    schedule:{}, logs:[], deletedVideos:[], shifts:{}, tasks:{}, videos:(videos||[]).slice() };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; CAL_PLAT="tw"; CAL_YM=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
// 審片進度卡那一段
const card=(h)=>{ const i=h.indexOf("審片進度"); if(i<0) return ""; return h.slice(i, h.indexOf("</div>", h.lastIndexOf("待審核", i+9000))+6)||h.slice(i); };
// 「已審過」折疊的 summary 那一行
const summary=(h)=>{ const seg=h.split('✓ 已審過（通過）')[1]||""; return seg.split("</summary>")[0]; };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ 收成折疊 ══
reset([needLink("V1"),needLink("V2"),needLink("V3")]); as("小葵","editor");
{ const w=viewWork();
  ok("已審過是折疊的", w.includes('✓ 已審過（通過）') && summary(w)!=="");
  ok("用的是既有的 fold 樣式", (()=>{ const i=w.indexOf('✓ 已審過（通過）');
    return w.lastIndexOf('<details class="fold"', i)>w.lastIndexOf("</details>", i); })());
  ok("預設是收起來的（沒有 open）", (()=>{ const i=w.indexOf('✓ 已審過（通過）');
    const tag=w.slice(w.lastIndexOf("<details", i), i); return !tag.includes(" open"); })());
  ok("折疊那一行寫出總數", summary(w).includes('class="n">3<'));
  ok("片名收在 foldbody 裡，不是攤在外面", (()=>{
    const body=(w.split('✓ 已審過（通過）')[1]||"").split("</details>")[0].split('<div class="foldbody">')[1]||"";
    return body.includes("片V1")&&body.includes("片V2")&&body.includes("片V3"); })());
  ok("點開之後還是可以直接打開影片", w.includes("editVideo('V1')")); }

// ══ 收起來也要看得出還有幾支缺連結 ══
reset([needLink("V1"),needLink("V2"),needLink("V3")]); as("小葵","editor");
ok("三支都缺連結 → 寫「3 支還缺連結」", summary(viewWork()).includes("3 支還缺連結"));
reset([needLink("V1"),allSet("V2"),allSet("V3")]); as("小葵","editor");
{ const s=summary(viewWork());
  ok("只有一支缺 → 寫「1 支還缺連結」", s.includes("1 支還缺連結"));
  ok("總數還是 3", s.includes('class="n">3<')); }
reset([allSet("V1"),allSet("V2")]); as("小葵","editor");
{ const s=summary(viewWork());
  ok("都補齊了就不掛缺連結的提示", !s.includes("還缺連結"));
  ok("總數照樣顯示", s.includes('class="n">2<')); }
reset([allSet("V1")]); as("小葵","editor");
ok("補齊的那些在裡面有「知道了」可按", viewWork().includes("ackReviewedVid('V1')"));

// ══ 其他兩段不受影響 ══
reset([vd({id:"R1",reviewStatus:"退回",reviewNote:"字太小"}), needLink("V1")]); as("小葵","editor");
{ const w=viewWork();
  ok("被退回的那段沒有被折疊（最急，要一直看到）",
     w.includes("被退回，要修") && !((w.split("被退回，要修")[1]||"").split("</div>")[0].includes("<details")));
  ok("被退回的片名直接看得到", w.includes("片R1") && w.includes("字太小"));
  ok("已審過還是折疊的", summary(w)!==""); }
reset([vd({id:"W1",reviewStatus:"",finishedAt:D(-1)+"T05:00:00"}), needLink("V1")]); as("小葵","editor");
{ const w=viewWork();
  ok("待審核那段照舊攤開", w.includes("待審核") && w.includes("片W1"));
  ok("待審核的按鍵還在", w.includes("editorMarkReviewed('W1')")); }

// ══ 卡片右上角的總數不變 ══
reset([vd({id:"R1",reviewStatus:"退回"}), needLink("V1"), needLink("V2"),
       vd({id:"W1",reviewStatus:"",finishedAt:D(-1)+"T05:00:00"})]); as("小葵","editor");
ok("右上角總數＝退回＋已審過＋待審核（4）", viewWork().includes('<span class="pill wa">4</span>'));

// ══ 沒有已審過的時候 ══
reset([vd({id:"R1",reviewStatus:"退回"})]); as("小葵","editor");
{ const w=viewWork();
  ok("沒有已審過時整個折疊不出現", !w.includes("已審過（通過）"));
  ok("卡片本身還在（有退回的）", w.includes("審片進度")); }
reset([]); as("小葵","editor");
ok("三段都空的時候整張卡不出現", !viewWork().includes("審片進度"));

// ══ 海外剪輯看到英文（影片要是 Anna 自己的，不然她看不到）══
const mine=(v)=>Object.assign({}, v, {editor:"Anna", claimedBy:"Anna", locale:"en"});
reset([mine(needLink("V1")),mine(needLink("V2"))]); as("Anna","intl");
{ const w=viewWork();
  ok("海外的折疊標題是英文", w.includes("✓ Approved") && !w.includes("已審過（通過）"));
  const s=w.split("✓ Approved")[1].split("</summary>")[0];
  ok("海外的缺連結提示是英文", s.includes("2 need links") && !s.includes("還缺連結")); }

// ══ render 不炸 ══
reset([vd({id:"R1",reviewStatus:"退回"}), needLink("V1"), allSet("V2"),
       vd({id:"W1",reviewStatus:"",finishedAt:D(-1)+"T05:00:00"})]);
[["小葵","editor","work"],["Anna","intl","work"]].forEach(([u,r,tab])=>{
  as(u,r); CUR_TAB=tab;
  try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
