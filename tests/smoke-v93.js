// v93：影片編輯多一欄「參考來源的網址」（在影片文案下面），
//      存好之後在檢視畫面顯示成「參考來源」，點了開新分頁跳過去。
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

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==';
const REF="https://www.tiktok.com/@someone/video/12345";
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"口播台詞",
  rawLink:"http://raw",refLink:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  finishedAt:"",publishedLink:"",driveFolder:"",productUrl:"",note:"",mainType:"",source:"老闆自拍",
  reviewStatus:"",locale:"",channel:"",origLang:"",createdBy:"",createdAt:"",
  tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos){
  calls=[]; toasts=[]; fields={}; modalHTML="";
  VID_LANG=""; VID_VIEW="rawNoSched"; VID_TAGS=new Set(); VID_Q=""; POOL_FILTER="all"; POOL_Q="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Anna",role:"intl",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Regina",role:"manager",pwHash:H},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍","外部公司"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, logs:[], deletedVideos:[], shifts:{}, tasks:{}, videos:(videos||[]).slice() };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; CAL_PLAT="tw"; CAL_YM=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const vidCall=()=>calls.filter(x=>x[0]==="update"&&x[1]==="videos").pop();
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ 編輯畫面：欄位在對的位置 ══
reset([v_("V1")]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML;
  ok("編輯畫面有參考來源網址這一欄", m.includes('id="e_ref"'));
  ok("有標題「參考來源的網址」", m.includes("參考來源的網址"));
  ok("寫明是選填", m.includes("選填"));
  ok("放在影片文案的下面", m.indexOf('id="e_vcopy"') < m.indexOf('id="e_ref"'));
  ok("放在標籤的上面（跟其他連結欄位一區）", m.indexOf('id="e_ref"') < m.indexOf("tagPicker")
     || m.indexOf('id="e_ref"') < m.indexOf('id="e_src"'));
  ok("是網址欄位", m.includes('id="e_ref" type="url"'));
  ok("沒填時是空的", m.includes('id="e_ref" type="url" value=""')); }
reset([v_("V1",{refLink:REF})]); as("Regina","manager");
openVideoModal("V1", true);
ok("填過的會帶回輸入框", modalHTML.includes(`value="${REF}"`));

// ══ 儲存 ══
(async()=>{
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  fields.e_code="26V1"; fields.e_raw="毛片V1"; fields.e_name="片V1"; fields.e_vcopy="口播台詞";
  fields.e_rawlink="http://raw"; fields.e_ref=REF; fields.e_drive=""; fields.e_note="";
  fields.e_src="老闆自拍"; fields.e_stage="待處理"; fields.e_editor=""; fields.e_date="";
  await saveVideo("V1"); await wait(30);
  { const c=vidCall();
    ok("存得起來", !!c && c[3].refLink===REF);
    ok("其他欄位沒被弄壞", !!c && c[3].rawLink==="http://raw" && c[3].videoCopy==="口播台詞"); }
  reset([v_("V1",{refLink:REF})]); as("Regina","manager");
  openVideoModal("V1", true);
  fields.e_code="26V1"; fields.e_raw="毛片V1"; fields.e_name="片V1"; fields.e_vcopy="口播台詞";
  fields.e_rawlink="http://raw"; fields.e_ref="   "; fields.e_drive=""; fields.e_note="";
  fields.e_src="老闆自拍"; fields.e_stage="待處理"; fields.e_editor=""; fields.e_date="";
  await saveVideo("V1"); await wait(30);
  ok("清空就存成空字串（可以拿掉）", (vidCall()||{})[3].refLink==="");
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  fields.e_code="26V1"; fields.e_raw="毛片V1"; fields.e_name="片V1"; fields.e_vcopy="口播台詞";
  fields.e_rawlink="http://raw"; fields.e_ref="  "+REF+"  "; fields.e_drive=""; fields.e_note="";
  fields.e_src="老闆自拍"; fields.e_stage="待處理"; fields.e_editor=""; fields.e_date="";
  await saveVideo("V1"); await wait(30);
  ok("前後空白會被去掉", (vidCall()||{})[3].refLink===REF);

  // ══ 檢視畫面：顯示成可點的「參考來源」══
  reset([v_("V1",{refLink:REF})]); as("Regina","manager");
  openVideoModal("V1", false);
  { const m=modalHTML;
    ok("檢視畫面有「參考來源」這一列", m.includes("參考來源"));
    ok("是連到那個網址的連結", m.includes(`href="${REF}"`));
    ok("點了開新分頁", m.includes('target="_blank"'));
    ok("連結文字是「開啟參考來源」", m.includes("開啟參考來源"));
    ok("加了 noopener（開新分頁的基本安全）", m.includes('rel="noopener noreferrer"'));
    ok("排在文案下面、標籤上面",
       m.indexOf("影片文案") < m.indexOf("參考來源") && m.indexOf("參考來源") < m.indexOf("標籤")); }
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", false);
  { const m=modalHTML;
    // 跟其他選填欄位（毛片連結、商品頁網址）一樣：沒填就顯示「—」，不要自己搞一套
    ok("沒填時那一列還在，但顯示「—」", m.includes("參考來源") && !m.includes("開啟參考來源"));
    ok("沒填時不會產生空連結", !/href="">/.test(m)); }

  // ══ 新影片預設有這個欄位 ══
  reset([]); as("Regina","manager");
  ok("新影片的預設欄位裡有 refLink", newVideoRecord({}).refLink==="");

  // ══ 海外剪輯看到英文 ══
  reset([v_("V1",{refLink:REF,locale:"en"})]); as("Anna","intl");
  openVideoModal("V1", true);
  { const m=modalHTML;
    ok("海外的編輯欄位是英文", m.includes("Reference link") && !m.includes("參考來源的網址")); }
  reset([v_("V1",{refLink:REF,locale:"en"})]); as("Anna","intl");
  openVideoModal("V1", false);
  { const m=modalHTML;
    ok("海外的檢視也是英文", m.includes("Open reference") && !m.includes("開啟參考來源")); }

  // ══ 剪輯也能填（不是只有經理人）══
  reset([v_("V1",{editor:"小葵",claimedBy:"小葵"})]); as("小葵","editor");
  openVideoModal("V1", true);
  ok("剪輯的編輯畫面也有這一欄", modalHTML.includes('id="e_ref"'));

  // ══ 惡意網址不會變成可執行的東西 ══
  reset([v_("V1",{refLink:'" onclick="alert(1)'})]); as("Regina","manager");
  openVideoModal("V1", false);
  ok("網址有跳脫，不會被當成屬性", !modalHTML.includes('onclick="alert(1)"'));

  // ══ render 不炸 ══
  reset([v_("V1",{refLink:REF})]);
  [["Regina","manager","videos"],["管理員","boss","videos"],["小葵","editor","work"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
