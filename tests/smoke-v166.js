// v166：改「剪輯人員」＝派工，要留下操作紀錄。
//
// 為什麼：老闆以為派工是走儀表板那張「指派毛片」卡，實際上不是 ——
// 正式資料（2026-09-08）：那張卡兩個月只用過 2 次（都是 Regina），
// 但用「改剪輯人員」派工的有一千多次：
//   昱丞 948 次、泓儒 72 次、Regina 55 次、巧芸 10 次、王森輝 9 次、季欣 4 次
// 這條路誰都能走，而且**完全不留紀錄**，老闆事後查不到誰派給誰。
//
// 決定（老闆選的）：不擋任何人（擋了會卡住四五個人每天在做的事），只補紀錄。
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
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
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
let WRITES=[], LOGS=[];
function reset(videos, who, role){
  WRITES=[]; LOGS=[]; modalHTML=""; viewEl.innerHTML=""; VIEW_AS=null; BRAND="";
  for(const k in fields) delete fields[k];
  global.window.DB={ set:async(c,id,o)=>{ WRITES.push(["set",c,id,o]); if(c==="logs") LOGS.push(o); },
    update:async(c,id,p)=>{WRITES.push(["update",c,id,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{},
    videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"泓儒",role:"editor"},
                     {name:"昱丞",role:"editor"},{name:"陳鋒",role:"editor"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],
      intlAccounts:[],shopeeAccounts:[],msAccounts:[],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"泓儒"); localStorage.setItem("ecdr_role", role||"editor");
}
// 走完整的存檔流程（跟真的按「儲存修改」一樣）
async function save(id, editorVal){
  editVideo(id);
  const v=vid(id)||{};
  fields.e_code=String(v.code||""); fields.e_raw=String(v.rawName||""); fields.e_name="";
  fields.e_vcopy=String(v.videoCopy||""); fields.e_date=""; fields.e_drive=""; fields.e_url="";
  fields.e_ref=""; fields.e_note=""; fields.e_src="官方IP"; fields.e_stage=String(v.stage||"待處理");
  fields.e_lang=""; fields.e_nameEn=""; fields.e_vcopyEn="";
  fields.e_editor=editorVal;
  const r=await saveVideo(id);
  await new Promise(x=>setTimeout(x,30));
  return r;
}
const acts=()=>LOGS.map(l=>String(l.action||""));

(async()=>{
// ══════════ ① 換人就留紀錄 ══════════
{ reset([ v_("A",{editor:""}) ], "泓儒","editor");
  await save("A","陳鋒");
  ok("影片有存起來", WRITES.some(x=>x[1]==="videos"&&x[2]==="A"), WRITES.map(x=>x[1]));
  ok("**留下「指派剪輯給 陳鋒」的紀錄**", acts().includes("指派剪輯給 陳鋒"), acts());
  const l=LOGS.find(x=>/指派剪輯給/.test(String(x.action||"")));
  ok("紀錄裡有寫是哪一支片", l && String(l.target||"").includes("片A"), l&&l.target);
  ok("紀錄裡有寫是誰做的", l && l.user==="泓儒", l&&l.user); }

{ reset([ v_("A",{editor:"陳鋒"}) ], "昱丞","editor");
  await save("A","王森輝");
  ok("**換人時前後都寫出來**", acts().some(a=>a==="改派剪輯：陳鋒 → 王森輝"), acts()); }

{ reset([ v_("A",{editor:"陳鋒"}) ], "昱丞","editor");
  await save("A","");
  ok("清空＝取消指定", acts().includes("取消指定剪輯"), acts()); }

// 派給自己跟派給別人要分得出來 —— 老闆要看的是「誰把工作丟給誰」
{ reset([ v_("A",{editor:""}) ], "泓儒","editor");
  await save("A","泓儒");
  ok("指定自己剪，紀錄寫得出來", acts().includes("指定自己剪"), acts());
  ok("——而且不會被誤記成「指派給別人」", !acts().some(a=>/指派剪輯給/.test(a)), acts()); }
{ reset([ v_("A",{editor:"陳鋒"}) ], "泓儒","editor");
  await save("A","泓儒");
  ok("從別人手上改成自己剪，原本是誰也要寫出來",
     acts().includes("改成自己剪（原本 陳鋒）"), acts()); }

// ══════════ ② 沒換人就不要洗版 ══════════
{ reset([ v_("A",{editor:"陳鋒"}) ], "昱丞","editor");
  await save("A","陳鋒");
  ok("**只是存檔、沒動到剪輯人員 → 不留派工紀錄**",
     !acts().some(a=>/指派剪輯|改派剪輯|取消指定剪輯|指定自己剪|改成自己剪/.test(a)), acts());
  ok("——但「已更新影片」那筆照舊有", acts().some(a=>/已更新影片/.test(a)), acts()); }
{ reset([ v_("A",{editor:""}) ], "昱丞","editor");
  await save("A","");
  ok("本來就沒人、也沒改 → 不留紀錄",
     !acts().some(a=>/指派剪輯|取消指定剪輯/.test(a)), acts()); }
// 空白與空字串是同一件事，不要因為多打一個空格就記一筆
{ reset([ v_("A",{editor:"陳鋒"}) ], "昱丞","editor");
  await save("A","  陳鋒  ");
  ok("前後空白不算換人", !acts().some(a=>/改派剪輯/.test(a)), acts()); }

// ══════════ ③ 存檔失敗就不要記 ══════════
{ reset([ v_("A",{editor:""}) ], "泓儒","editor");
  global.window.DB.update=async()=>{ throw new Error("網路斷了"); };
  await save("A","陳鋒");
  ok("**寫不進去就不要留派工紀錄**（不然紀錄跟資料對不起來）",
     !acts().some(a=>/指派剪輯給/.test(a)), acts()); }

// ══════════ ④ 這條路照舊不擋任何人（老闆選的 C）══════════
{ reset([ v_("A",{editor:""}) ], "小葵","editor");
  await save("A","陳鋒");
  ok("一般剪輯照樣改得動剪輯人員（沒有被擋）",
     WRITES.some(x=>x[1]==="videos"), WRITES.map(x=>x[1]));
  ok("——而且一樣有留紀錄", acts().includes("指派剪輯給 陳鋒"), acts()); }
{ reset([ v_("A",{editor:""}) ], "泓儒","editor");
  const h=(editVideo("A"), modalHTML);
  ok("剪輯人員那一格是可以選的下拉，沒有被改成唯讀",
     /<select id="e_editor"/.test(h) && !/id="e_editor"[^>]*disabled/.test(h),
     (h.match(/<select id="e_editor"[^>]*>/)||[])[0]); }

// ══════════ ⑤ 員工視角底下什麼都不准寫 ══════════
{ reset([ v_("A",{editor:""}) ], "管理員","boss");
  VIEW_AS="泓儒";
  await save("A","陳鋒");
  ok("員工視角（唯讀預覽）底下一筆都不准寫", WRITES.length===0, WRITES);
  VIEW_AS=null; }

console.log(`\nv166（改剪輯人員＝派工，要留紀錄）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
