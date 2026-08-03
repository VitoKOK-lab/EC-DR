// v98：影片文案改成點下去展開成 6 排（順便能存換行）；預排上片日期移到標籤上方；
//      改到一半要離開時一定會被提醒（× 鍵、點視窗外、關分頁都算）。
const fs=require("fs"), path=require("path");
const css=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,rows:0,
  classList:{_s:new Set(),toggle(){},add(c){this._s.add(c);},remove(c){this._s.delete(c);},contains(c){return this._s.has(c);}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, nodes={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(nodes[id]) return nodes[id];
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
let unloadHandler=null, unloadAtLoad=null;
global.window={addEventListener(ev,fn){ if(ev==="beforeunload"){ unloadHandler=fn; unloadAtLoad=fn; } },
  innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
let calls=[], toasts=[];
eval(src);
toast=(m,e)=>{ toasts.push(String(m)); };

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==';
const LINES="第一行\n第二行\n第三行";
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",rawLink:"http://d",cover:"",
  stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",publishedLink:"",
  driveFolder:"",productUrl:"",note:"",mainType:"",source:"老闆自拍",refLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos){
  calls=[]; toasts=[]; fields={}; nodes={}; modalHTML=""; unloadHandler=null;
  VID_LANG=""; VID_VIEW="raw"; VID_MODE="list"; VID_TAGS=new Set(); VID_Q=""; POOL_FILTER="all"; POOL_Q="";
  MODAL_DIRTY=false;
  STATE={ users:[{name:"小葵",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Anna",role:"intl",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Regina",role:"manager",pwHash:H},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
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

// ══ 影片文案：改成可以展開的文字框 ══
reset([v_("V1")]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML;
  ok("文案欄變成文字框（不是單行輸入框了）", /<textarea id="e_vcopy"/.test(m));
  ok("平常收成一排，不占版面", /<textarea id="e_vcopy"[^>]*rows="1"/.test(m));
  ok("點下去會展開", m.includes('onfocus="vcopyOpen()"'));
  ok("有提示說點了會展開", m.includes("展開成 6 排"));
  ok("原本的 id 沒變（存檔那邊照樣讀得到）", m.includes('id="e_vcopy"')); }
// 已有內容會帶進去（textarea 是放在標籤中間，不是 value 屬性）
reset([v_("V1",{videoCopy:"口播台詞"})]); as("Regina","manager");
openVideoModal("V1", true);
ok("填過的文案會帶回來", /<textarea id="e_vcopy"[^>]*>口播台詞<\/textarea>/.test(modalHTML));
reset([v_("V1",{videoCopy:'<script>alert(1)</script>'})]); as("Regina","manager");
openVideoModal("V1", true);
ok("文案有跳脫，不會被當成程式執行", !modalHTML.includes("<script>alert(1)"));

// 點下去 → 6 排
reset([v_("V1")]); as("Regina","manager");
nodes.e_vcopy=el();
vcopyOpen();
ok("點一下就變成 6 排", nodes.e_vcopy.rows===6);
ok("展開後有記號（不會再被重設）", nodes.e_vcopy.classList.contains("open"));
nodes.e_vcopy.rows=6; vcopyOpen();
ok("再點也不會亂跳", nodes.e_vcopy.rows===6);
reset(); nodes={};
ok("欄位不在畫面上時不會炸", (function(){ try{ vcopyOpen(); return true; }catch(e){ return false; } })());

// ══ 換行存得起來（原本是單行 input，貼多行會被壓扁）══
(async()=>{
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  fields.e_code="26V1"; fields.e_raw="毛片V1"; fields.e_name="片V1"; fields.e_vcopy=LINES;
  fields.e_rawlink="http://d"; fields.e_ref=""; fields.e_drive=""; fields.e_note="";
  fields.e_src="老闆自拍"; fields.e_stage="待處理"; fields.e_editor=""; fields.e_date="";
  await saveVideo("V1"); await wait(30);
  ok("多行文案存得起來，換行沒被吃掉", (vidCall()||{})[3].videoCopy===LINES);

  // ══ 預排上片日期移到標籤上方 ══
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  { const m=modalHTML;
    ok("日期欄還在", m.includes('id="e_date"'));
    ok("在標籤上方", m.indexOf('id="e_date"') < m.indexOf('id="e_box"'));
    ok("在毛片連結下面（都是每次要看的基本欄位）", m.indexOf('id="e_rawlink"') < m.indexOf('id="e_date"'));
    ok("參考來源已收進「進階」折疊（v111）", m.indexOf('id="e_date"') < m.indexOf('id="e_ref"'));
    ok("不再夾在商品頁網址後面", m.indexOf('id="e_url"') > m.indexOf('id="e_date"'));
    ok("整份只出現一次（沒有複製兩份）", (m.match(/id="e_date"/g)||[]).length===1);
    ok("日期的日曆小圖示還在", m.includes('class="dateIco"')); }
  reset([v_("V1",{scheduledDate:D(3)})]); as("Regina","manager");
  openVideoModal("V1", true);
  ok("已排的日期會帶回來", modalHTML.includes(`id="e_date" type="date" value="${D(3)}"`));
  // 存檔照舊
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  fields.e_code="26V1"; fields.e_raw="毛片V1"; fields.e_name="片V1"; fields.e_vcopy="";
  fields.e_rawlink="http://d"; fields.e_ref=""; fields.e_drive=""; fields.e_note="";
  fields.e_src="老闆自拍"; fields.e_stage="待處理"; fields.e_editor=""; fields.e_date=D(5);
  await saveVideo("V1"); await wait(30);
  ok("日期換位置之後照樣存得起來", (vidCall()||{})[3].scheduledDate===D(5));

  // ══ 沒存就想離開 → 一定會被提醒 ══
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  MODAL_DIRTY=true; toasts=[];
  tryExitVideoEdit();
  ok("按 × 會提醒還沒存檔", toasts.some(t=>t.includes("還沒存檔")));
  ok("按 × 不會把視窗關掉（東西還在）", modalHTML.includes('id="e_vcopy"'));
  // 點視窗外
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  MODAL_DIRTY=true; toasts=[];
  const backdrop={target:{classList:{contains:(c)=>c==="modal"}}};
  modalBackdrop(backdrop);
  ok("點視窗外也會提醒（原本是靜靜不理，會讓人以為當掉）", toasts.some(t=>t.includes("還沒存檔")));
  ok("點視窗外一樣不會關掉", modalHTML.includes('id="e_vcopy"'));
  ok("兩個地方講的是同一句（不會一個有提示一個沒有）",
     (function(){ MODAL_DIRTY=true; toasts=[]; tryExitVideoEdit(); const a=toasts[0];
       MODAL_DIRTY=true; toasts=[]; modalBackdrop(backdrop); return a===toasts[0]; })());
  // 沒改過就直接關
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  MODAL_DIRTY=false; toasts=[];
  modalBackdrop(backdrop);
  ok("沒動過任何欄位就直接關，不會囉嗦", modalHTML==="" && !toasts.length);
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  MODAL_DIRTY=true; toasts=[];
  cancelVideoEdit();
  ok("按「取消編輯」是明確要丟掉，直接關不再問", modalHTML==="");

  // ══ 關分頁／重新整理也要問 ══
  unloadHandler=unloadAtLoad;
  ok("有註冊離開頁面的攔截", typeof unloadHandler==="function");
  { let prevented=false, ret;
    const ev={preventDefault(){ prevented=true; }, returnValue:undefined};
    MODAL_DIRTY=true; ret=unloadHandler(ev);
    ok("有沒存的修改時，關分頁會跳瀏覽器確認", prevented===true && ev.returnValue==="" && ret==="");
    prevented=false; const ev2={preventDefault(){ prevented=true; }, returnValue:undefined};
    MODAL_DIRTY=false; unloadHandler(ev2);
    ok("沒有未存修改就不要煩人", prevented===false && ev2.returnValue===undefined); }

  // ══ 海外剪輯看到英文 ══
  reset([v_("V1",{locale:"en"})]); as("Anna","intl");
  openVideoModal("V1", true);
  ok("海外的展開提示是英文", modalHTML.includes("Click to expand") && !modalHTML.includes("展開成 6 排"));
  reset([v_("V1")]); as("Anna","intl");
  MODAL_DIRTY=true; toasts=[]; warnUnsaved();
  ok("海外的未存檔提醒是英文", toasts.some(t=>t.includes("Not saved yet")) && !toasts.some(t=>t.includes("還沒存檔")));

  // ══ CSS ══
  ok("[css] 收合時跟一般輸入框一樣高（要蓋掉 textarea 的 min-height:60px）",
     /textarea\.grow\{[^}]*min-height:0/.test(css));
  ok("[css] 收合時不出現捲軸", /textarea\.grow\{[^}]*overflow:hidden/.test(css));
  ok("[css] 展開後才給捲軸", /textarea\.grow\.open\{[^}]*overflow:auto/.test(css));
  ok("[css] 收合時跟隔壁輸入框一樣高、展開後行距放寬好讀",
     /textarea\.grow\{[^}]*line-height:1\.2/.test(css) && /textarea\.grow\.open\{[^}]*line-height:1\.6/.test(css));
  ok("[css] 還是可以自己拉大", /textarea\.grow\{[^}]*resize:vertical/.test(css));

  // ══ render 不炸 ══
  const LIB=[v_("V1",{videoCopy:LINES,scheduledDate:D(3)}), v_("V2")];
  [["Regina","manager"],["管理員","boss"],["Anna","intl"],["小葵","editor"]].forEach(([u,r])=>{
    reset(LIB); as(u,r); CUR_TAB="videos";
    try{ render(); openVideoModal("V1",true); openVideoModal("V1",false); ok(`[${r}] 影片庫＋彈窗`, true); }
    catch(e){ ok(`[${r}] → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
