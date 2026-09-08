// v165：「影片貼文文案」改成可以點開的多行欄位，跟「影片文案（口播台詞）」一樣。
// 以前是單行 <input>，貼文文案本來就是一整段（含換行、標籤），只看得到最前面一小截。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
// 可以被 vcopyOpen 摸到的假 textarea：記錄 rows 與 class
const boxes={};
function fakeBox(id){
  if(!boxes[id]) boxes[id]={rows:1, cls:[], classList:{
    add(c){ boxes[id].cls.push(c); }, remove(){}, toggle(){},
    contains(c){ return boxes[id].cls.indexOf(c)>=0; } }};
  return boxes[id];
}
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(boxes[id]) return boxes[id];
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,300));} }
const RAW="https://drive.google.com/file/d/RAW";
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"片"+id,videoCopy:"腳本",
  rawLink:RAW,lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  claimedAt:"",finishedAt:"",durationMin:0,publishedLink:"",driveFolder:"",reviewStatus:"",
  locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],tags:[],
  products:[],usageHistory:[],metrics:[],deleted:false,source:"官方IP",shotAt:"",shotBy:"",
  urgent:false,urgentAt:"",urgentBy:"",note:"",refLink:"",productUrl:"",nameEn:"",videoCopyEn:""},o||{});
let WRITES=[];
function reset(videos, who, role){
  WRITES=[]; modalHTML=""; viewEl.innerHTML=""; VIEW_AS=null; BRAND="";
  for(const k in fields) delete fields[k];
  for(const k in boxes) delete boxes[k];
  global.window.DB={ set:async(c,id,o)=>{WRITES.push(["set",c,id,o]);},
    update:async(c,id,p)=>{WRITES.push(["update",c,id,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{},
    videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],
      intlAccounts:[],shopeeAccounts:[],msAccounts:[],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"管理員"); localStorage.setItem("ecdr_role", role||"boss");
}
// 編輯視窗的 HTML（進階那一折裡面）
function editHTML(v){ reset([v], "管理員","boss"); modalHTML=""; editVideo(v.id); return modalHTML; }

// ══════════ ① 貼文文案變成可展開的多行欄位 ══════════
{ const h=editHTML(v_("A",{name:"第一行\n第二行\n#標籤"}));
  ok("不再是單行 <input>", !/<input id="e_name"/.test(h), (h.match(/<[a-z]+ id="e_name"[^>]*>/)||[])[0]);
  ok("**改成 textarea**", /<textarea id="e_name"/.test(h), (h.match(/<textarea id="e_name"[^>]*>/)||[])[0]);
  ok("跟口播台詞用同一套（class grow、rows 1）",
     /<textarea id="e_name" class="grow" rows="1"/.test(h), (h.match(/<textarea id="e_name"[^>]*>/)||[])[0]);
  ok("點下去會展開（onfocus 呼叫 vcopyOpen 並帶對 id）",
     /<textarea id="e_name"[^>]*onfocus="vcopyOpen\('e_name'\)"/.test(h), (h.match(/<textarea id="e_name"[^>]*>/)||[])[0]);
  ok("滑過去有提示說可以展開", /<textarea id="e_name"[^>]*title="[^"]*展開/.test(h));
  ok("既有內容放在 textarea 裡面（不是 value 屬性）",
     /<textarea id="e_name"[^>]*>第一行\n第二行\n#標籤<\/textarea>/.test(h), (h.match(/<textarea id="e_name"[\s\S]{0,160}?<\/textarea>/)||[])[0]); }

// 跟口播台詞那一格長得一樣（同一種做法，不要各寫一份）
{ const h=editHTML(v_("A"));
  const cap=(h.match(/<textarea id="e_name"[^>]*>/)||[""])[0];
  const scr=(h.match(/<textarea id="e_vcopy"[^>]*>/)||[""])[0];
  ok("（前提）口播台詞那一格還在", !!scr, scr);
  ok("兩格都是 class=\"grow\" rows=\"1\"",
     /class="grow" rows="1"/.test(cap) && /class="grow" rows="1"/.test(scr), {cap, scr});
  ok("兩格都靠 onfocus 展開", /onfocus="vcopyOpen\(/.test(cap) && /onfocus="vcopyOpen\(/.test(scr)); }

// 內容要跳脫，不然文案裡有 < 或 </textarea> 就把畫面打壞
{ const h=editHTML(v_("A",{name:'</textarea><script>alert(1)</script>'}));
  ok("文案裡的標籤會被跳脫，不會提早關掉 textarea",
     !/<script>/.test(h) && h.includes("&lt;/textarea&gt;"), (h.match(/<textarea id="e_name"[\s\S]{0,120}/)||[])[0]); }

// ══════════ ② vcopyOpen：展開的行為 ══════════
{ reset([]); const b=fakeBox("e_name");
  ok("（前提）一開始是收起來的 1 排", b.rows===1 && !b.classList.contains("open"));
  vcopyOpen("e_name");
  ok("點下去變成 6 排", b.rows===6, b.rows);
  ok("**加上 open class**（CSS 的 overflow:auto 靠它，不然長文字會被裁掉）",
     b.classList.contains("open"), b.cls);
  b.rows=3;                       // 使用者自己拉過高度
  vcopyOpen("e_name");
  ok("已經展開過就不再強制拉回 6 排（不要蓋掉他自己調的高度）", b.rows===3, b.rows); }
{ reset([]); const b=fakeBox("e_vcopy");
  vcopyOpen();
  ok("不帶參數時仍然是口播台詞那一格（舊呼叫方式沒壞）", b.rows===6 && b.classList.contains("open")); }
{ reset([]);
  let threw=false; try{ vcopyOpen("根本沒有這一格"); }catch(e){ threw=true; }
  ok("找不到那一格也不會爆", !threw); }

// ② 英文腳本那格：以前只寫 this.rows=6，不會加 open class → overflow:auto 不生效
{ const h=enFieldHTML("e_vcopyEn","英文腳本","","e_vcopy",true);
  ok("英文腳本改成也走 vcopyOpen", /onfocus="vcopyOpen\('e_vcopyEn'\)"/.test(h), (h.match(/<textarea[^>]*>/)||[])[0]);
  ok("不再是只設 rows 的寫法", !/onfocus="this\.rows=6"/.test(h), h.slice(0,300)); }
{ const h=enFieldHTML("e_nameEn","英文片名","","e_raw",false);
  ok("英文片名（單行的那一格）維持 input，沒被順手改掉", /<input id="e_nameEn"/.test(h), h.slice(0,200)); }

// ══════════ ③ 存檔行為沒被改壞 ══════════
(async()=>{
{ reset([ v_("A",{rawName:"原始片名"}) ], "管理員","boss");
  editVideo("A");
  fields.e_code="CA"; fields.e_raw="原始片名"; fields.e_name="貼文\n第二行";
  fields.e_vcopy="口播"; fields.e_date=""; fields.e_drive=""; fields.e_url="";
  fields.e_ref=""; fields.e_note=""; fields.e_src="官方IP"; fields.e_stage="待處理";
  fields.e_editor=""; fields.e_lang=""; fields.e_nameEn=""; fields.e_vcopyEn="";
  await saveVideo("A"); await new Promise(r=>setTimeout(r,30));
  const w=WRITES.find(x=>x[1]==="videos");
  ok("多行貼文文案存得起來，換行有留住", w && String(w[3].name||"").includes("\n"), w&&JSON.stringify(w[3].name)); }

{ reset([ v_("A",{rawName:"原始片名"}) ], "管理員","boss");
  editVideo("A");
  fields.e_code="CA"; fields.e_raw="原始片名"; fields.e_name="   ";
  fields.e_vcopy="口播"; fields.e_date=""; fields.e_drive=""; fields.e_url="";
  fields.e_ref=""; fields.e_note=""; fields.e_src="官方IP"; fields.e_stage="待處理";
  fields.e_editor=""; fields.e_lang=""; fields.e_nameEn=""; fields.e_vcopyEn="";
  await saveVideo("A"); await new Promise(r=>setTimeout(r,30));
  const w=WRITES.find(x=>x[1]==="videos");
  ok("**留空還是會退回原始片名**（欄位標題就是這樣寫的，不能改壞）",
     w && w[3].name==="原始片名", w&&JSON.stringify(w[3].name)); }

// 多行文案不會把影片庫那一列撐開（HTML 裡換行就是空白，清單仍然一行）
{ reset([ v_("A",{name:"第一行\n第二行"}) ], "管理員","boss");
  const row=vidTableRow(vid("A"));
  ok("清單那一列照樣是單行顯示的結構（nowrap＋ellipsis）",
     /vt-title[^>]*white-space:nowrap/.test(row), (row.match(/class="vt-title"[^>]*>/)||[])[0]); }

console.log(`\nv165（貼文文案改成可展開的多行）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
