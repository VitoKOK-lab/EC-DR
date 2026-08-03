// v96：影片庫每一列開頭那組編號（2607122）退到最右邊當小灰字，
//      片名往前站到最左邊。重點是「不能多一行」——手機的片名本來就會換行顯示完整，
//      所以編號在手機上是浮動靠右、讓片名文字繞著它排。
const fs=require("fs"), path=require("path");
const css=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
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
const LONG="每天得罪一個珠寶品牌 #首頁連結加入溱姐寵粉社群 #珠寶 #配得感";
const v_=(id,o)=>Object.assign({id,code:"260"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",rawLink:"http://d",cover:"",
  stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",publishedLink:"",
  driveFolder:"",productUrl:"",note:"",mainType:"",source:"",refLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos){
  calls=[]; toasts=[]; fields={}; modalHTML="";
  VID_LANG=""; VID_VIEW="raw"; VID_MODE="list"; VID_TAGS=new Set(); VID_Q=""; POOL_FILTER="all"; POOL_Q="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Anna",role:"intl",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Regina",role:"manager",pwHash:H},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, logs:[], deletedVideos:[], shifts:{}, tasks:{}, videos:(videos||[]).slice() };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; CAL_PLAT="tw"; CAL_YM=null;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
// 影片庫第一列的那一格
const cell=(h)=>((h.split('class="cv-name"')[1]||"").split("</td>")[0]);
// 手機那段 @media 規則
const mobile=(()=>{ const i=css.indexOf("手機的影片列只剩片名"); if(i<0) return "";
  return css.slice(i, css.indexOf(".vt-title{display:inline}", i)+30); })();
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ 拆成兩個函式：片名歸片名、編號歸編號 ══
reset();
ok("vidName 只有片名，沒有編號", vidName(v_("A",{name:"翡翠開箱"}))==="翡翠開箱");
ok("vidName 一樣會去掉後面的 #標籤", vidName(v_("A",{name:LONG}))==="每天得罪一個珠寶品牌");
ok("整串都是標籤時不會變成空的", vidName(v_("A",{name:"#珠寶 #配得感"}))==="#珠寶 #配得感");
ok("片名空的時候退回毛片名", vidName(v_("A",{name:"",rawName:"毛片A"}))==="毛片A");
ok("兩個都空才顯示未命名", vidName(v_("A",{name:"",rawName:""}))==="(未命名)");
ok("vidTitle 維持原樣（編號＋片名），純文字場合還在用",
   vidTitle(v_("A",{code:"2607122",name:"翡翠開箱"}))==="2607122 翡翠開箱");
ok("vidTitle 是用 vidName 組出來的（只有一份去標籤邏輯）",
   vidTitle(v_("A",{code:"2607122",name:LONG}))==="2607122 每天得罪一個珠寶品牌");

// ══ 影片庫清單：片名在前、編號在後 ══
reset([v_("7122",{name:"翡翠開箱"})]); as("Regina","manager");
{ const c=cell(viewVideos());
  ok("片名照樣看得到", c.includes("翡翠開箱"));
  ok("編號照樣看得到", c.includes("2607122"));
  ok("編號不再黏在片名前面（沒有「2607122 翡翠開箱」這一串）", !c.includes("2607122 翡翠開箱"));
  ok("編號有自己的樣式類別，才變得成小灰字", c.includes('class="vt-code"'));
  ok("編號在 HTML 裡排在片名前面（手機要靠 float:right 繞排，浮動元素得先出現）",
     c.indexOf('class="vt-code"') < c.indexOf('class="vt-title"'));
  ok("片名在畫面上仍排在編號左邊（桌機靠 flex 的 order 把編號推到最右）",
     /\.vt-code\{[^}]*order:9/.test(css));
  ok("編號那格不會被壓扁", /\.vt-code\{[^}]*flex:none/.test(css));
  ok("編號靠右對齊", /\.vt-code\{[^}]*margin-left:auto/.test(css));
  ok("編號是小字", /\.vt-code\{[^}]*font-size:11px/.test(css));
  ok("編號是淡灰色", /\.vt-code\{[^}]*color:var\(--muted\)/.test(css));
  ok("滑過去看得到那是什麼", c.includes('title="影片編號"')); }

// ══ 不能多一行：手機的繞排 ══
ok("有手機專用的規則", mobile.length>0);
ok("手機上這一列改成一般區塊（不再是 flex 的一格一格）",
   /td\.cv-name \.vt-line\{display:block\}/.test(mobile));
ok("縮圖靠左浮", /td\.cv-name \.vthumb\{float:left/.test(mobile));
ok("編號靠右浮 —— 這就是「不多一行」的關鍵：片名文字繞著它排",
   /td\.cv-name \.vt-code\{float:right/.test(mobile));
ok("片名變成行內元素，才繞得起來", /td\.cv-name \.vt-title\{display:inline\}/.test(mobile));
ok("手機的片名維持可換行顯示完整（原本就是這樣，沒被改掉）",
   /table\.responsive \.vt-title\{white-space:normal !important/.test(css));
ok("桌機那排的樣式還在（一列一行、編號靠右）", /\.vt-line\{display:flex/.test(css));

// ══ 圖片模式：編號放進本來就有的那一排，不另外占一行 ══
reset([v_("7122",{name:"翡翠開箱"})]); as("Regina","manager"); VID_MODE="grid";
{ const h=viewVideos();
  ok("卡片標題只有片名", h.includes('class="vcard-t">翡翠開箱<'));
  ok("卡片的編號在既有的那一排（跟階段、日期同一排）",
     (h.split('class="vcard-m"')[1]||"").split("</div>")[0].includes("2607122"));
  ok("卡片的編號沒有自己多一行", !/class="vcard-t">[^<]*<\/div>\s*<div[^>]*>2607122/.test(h));
  ok("卡片裡的編號更小一號", /\.vcard-m \.vt-code\{[^}]*font-size:10px/.test(css)); }

// ══ 其他畫面不受影響：純文字場合維持「編號 片名」 ══
reset([v_("7122",{name:"翡翠開箱"})]); as("Regina","manager");
ok("刪除確認視窗還是講得出編號", (function(){ let asked="";
  global.confirm=(m)=>{ asked=m; return false; }; delVideo("7122"); global.confirm=()=>true;
  return asked.includes("2607122 翡翠開箱"); })());
reset([v_("7122",{name:"翡翠開箱",rawLink:"http://d"})]); as("小葵","editor");
ok("待認領清單維持原樣（沒被順手改掉）", viewWork().includes("2607122 翡翠開箱"));

// ══ 海外剪輯 ══
reset([v_("7122",{name:"翡翠開箱"})]); as("Anna","intl");
ok("海外的編號提示是英文", cell(viewVideos()).includes('title="Video code"'));
reset([v_("A",{name:"",rawName:""})]); as("Anna","intl");
ok("海外看到的未命名是英文", vidName(v_("A",{name:"",rawName:""}))==="(untitled)");

// ══ 惡意內容 ══
reset([v_("X",{code:'"><script>alert(1)</script>',name:"片X"})]); as("Regina","manager");
ok("編號有跳脫", !viewVideos().includes("<script>alert(1)"));

// ══ render 不炸 ══
const LIB=[v_("7122",{name:LONG}), v_("7123",{name:"短"}), v_("7124",{tags:["舊片"]})];
[["Regina","manager"],["管理員","boss"],["Anna","intl"],["小葵","editor"]].forEach(([u,r])=>{
  ["list","grid"].forEach(m=>{
    reset(LIB); as(u,r); CUR_TAB="videos"; VID_MODE=m;
    try{ render(); ok(`[${r}] 影片庫 ${m}`, true); }catch(e){ ok(`[${r}] ${m} → ${e.message}`, false); } }); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
