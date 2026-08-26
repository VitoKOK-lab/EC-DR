// v141：中文欄位底下配一個英文欄位，旁邊一顆翻譯圖示。
//
// 做法刻意是**半自動**：圖示點下去開 Google 翻譯（中文已經帶在網址裡），
// 人複製結果貼回英文那一格，之後想改就自己改。不串翻譯 API ——
// 翻出來的東西一定有人看過才會存進資料庫。
//
// 兩組：原始片名 → 英文片名（nameEn）、影片文案 → 英文腳本（videoCopyEn）。
// 這兩個欄位資料庫裡本來就有（以前只有海外二創的視窗填得到），這次是把它們
// 搬到主編輯視窗，台灣同仁寫完中文就能順手把英文準備好給海外。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,isConnected:true,scrollTop:0,rows:1,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(fields[id]!=null) e.value=fields[id];
    if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
let opened=[];
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:(u,t,f)=>{ opened.push(u); return {}; }};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let writes=[], toasts=[], errToasts=[];
toast=(m,isErr)=>{ toasts.push(String(m)); if(isErr) errToasts.push(String(m)); };
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"貼文文案"+id,rawName:"中文原始片名",videoCopy:"這是中文口播稿",
  nameEn:"",videoCopyEn:"",rawLink:"http://raw",lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",
  scheduledDate:null,finishedAt:"",publishedLink:"",driveFolder:"",reviewStatus:"",locale:"",channel:"",
  origLang:"",cover:"",remakes:[],tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos){
  modalHTML=""; viewEl.innerHTML=""; writes=[]; toasts=[]; errToasts=[]; fields={}; opened=[];
  global.window.DB={ set:async(c,id,o)=>{writes.push(["set",c,id,o]);},
    update:async(c,id,p)=>{writes.push(["update",c,id,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{}, videosWatched:()=>true };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"管理員",role:"boss"},{name:"Anna",role:"intl"}],
    settings:{dailyTarget:4,videoTags:["新片"],sources:["自製"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[v_("V1")] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
  VIEW_AS=null; BRAND="";
}
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{

// ══════════ ① 兩組欄位都在，而且順序是「中文在上、英文在下」 ══════════
{ reset(); openVideoModal("V1", true);
  ok("有英文片名欄", modalHTML.includes('id="e_nameEn"'));
  ok("有英文腳本欄", modalHTML.includes('id="e_vcopyEn"'));
  ok("英文片名排在原始片名底下", modalHTML.indexOf('id="e_raw"') < modalHTML.indexOf('id="e_nameEn"'));
  ok("英文腳本排在中文文案底下", modalHTML.indexOf('id="e_vcopy"') < modalHTML.indexOf('id="e_vcopyEn"'));
  ok("英文腳本是多行的（腳本很長）", /id="e_vcopyEn"[^>]*>|<textarea id="e_vcopyEn"/.test(modalHTML)
     && modalHTML.includes('<textarea id="e_vcopyEn"'));
  ok("英文片名是單行的", modalHTML.includes('<input id="e_nameEn"')); }

// ══════════ ② 翻譯圖示：點下去要帶著「那一格當下的中文」 ══════════
{ reset(); openVideoModal("V1", true);
  ok("兩組各有一顆翻譯圖示", (modalHTML.match(/class="tricon"/g)||[]).length>=2);
  ok("片名那顆指向原始片名欄", modalHTML.includes(`trOpen('e_raw')`));
  ok("腳本那顆指向中文文案欄", modalHTML.includes(`trOpen('e_vcopy')`));
  ok("圖示有說明（滑鼠移上去知道要幹嘛）", /title="[^"]*翻譯[^"]*"/.test(modalHTML)); }
{ reset();
  fields.e_raw="慈禧太后最愛的兩種寶石";
  trOpen("e_raw");
  ok("點下去真的開了視窗", opened.length===1);
  ok("開的是 Google 翻譯", opened[0].startsWith("https://translate.google.com/"));
  ok("中文已經帶在網址裡（人不用再貼一次過去）",
     opened[0].includes(encodeURIComponent("慈禧太后最愛的兩種寶石")));
  ok("來源語言是中文、目標是英文", opened[0].includes("sl=zh-TW") && opened[0].includes("tl=en")); }
{ reset();
  // 使用者剛改過中文還沒存 → 要帶「現在畫面上的」，不是資料庫裡的舊值
  fields.e_raw="剛剛改的新標題";
  trOpen("e_raw");
  ok("帶的是畫面上當下的字，不是存檔前的舊值", opened[0].includes(encodeURIComponent("剛剛改的新標題"))); }
{ reset(); fields.e_raw="";
  trOpen("e_raw");
  ok("中文是空的就不要開視窗（開了也沒東西翻）", opened.length===0);
  ok("而且要說一聲，不是靜靜沒反應", errToasts.length===1); }
{ reset(); fields.e_raw="   ";
  trOpen("e_raw");
  ok("只有空白也算沒東西", opened.length===0); }

// ══════════ ③ 存得進去，而且原樣存 ══════════
{ reset(); openVideoModal("V1", true);
  fields.e_code="C1"; fields.e_raw="中文原始片名"; fields.e_vcopy="這是中文口播稿";
  fields.e_nameEn="What Empress Dowager Cixi loved"; fields.e_vcopyEn="Line one.\nLine two.";
  fields.e_src="自製"; fields.e_stage="待處理"; fields.e_editor=""; fields.e_date="";
  fields.e_drive=""; fields.e_rawlink="http://raw"; fields.e_ref=""; fields.e_note=""; fields.e_url="";
  await saveVideo("V1");
  const w=writes.find(x=>x[1]==="videos"); const p=w&&w[3];
  ok("英文片名存進去了", !!p && p.nameEn==="What Empress Dowager Cixi loved");
  ok("英文腳本存進去了（換行沒被吃掉）", !!p && p.videoCopyEn==="Line one.\nLine two.");
  ok("中文的照樣存", !!p && p.rawName==="中文原始片名" && p.videoCopy==="這是中文口播稿"); }
{ reset(); openVideoModal("V1", true);
  fields.e_code="C1"; fields.e_raw="片名"; fields.e_vcopy="文案";
  fields.e_nameEn="  Trimmed  "; fields.e_vcopyEn="";
  fields.e_src="自製"; fields.e_stage="待處理"; fields.e_editor=""; fields.e_date="";
  fields.e_drive=""; fields.e_rawlink="http://raw"; fields.e_ref=""; fields.e_note=""; fields.e_url="";
  await saveVideo("V1");
  const p=(writes.find(x=>x[1]==="videos")||[])[3];
  ok("前後空白會清掉", !!p && p.nameEn==="Trimmed");
  ok("留白就是留白（不會亂塞東西）", !!p && p.videoCopyEn===""); }
// 英文不能被簡繁轉換動到 —— 那是給中文用的
{ const CODE=APP.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n");
  ok("英文欄位沒有跑 zhTW（簡繁轉換是給中文的）",
     /nameEn:val\("e_nameEn"\)\.trim\(\)/.test(CODE) && !/zhTW\(val\("e_nameEn"/.test(CODE)); }

// ══════════ ④ 既有的值要帶出來、可以手動改 ══════════
{ reset([v_("V2",{nameEn:"Existing English title", videoCopyEn:"Existing script"})]);
  openVideoModal("V2", true);
  ok("已經填過的英文片名會帶出來", modalHTML.includes("Existing English title"));
  ok("已經填過的英文腳本會帶出來", modalHTML.includes("Existing script"));
  ok("欄位不是唯讀（隨時可以手改）",
     !/id="e_nameEn"[^>]*\breadonly\b/.test(modalHTML) && !/id="e_vcopyEn"[^>]*\breadonly\b/.test(modalHTML)); }

// ══════════ ⑤ 沒有把既有的東西弄壞 ══════════
{ reset(); openVideoModal("V1", true);
  ["e_code","e_raw","e_vcopy","e_rawlink","e_date","e_drive","e_ref","e_name"].forEach(f=>
    ok("原本的「"+f+"」欄位還在", modalHTML.includes('id="'+f+'"'))); }
{ reset([v_("SHP",{channel:"shopee",sourceVideoId:"V1"}), v_("V1")]);
  let threw=""; try{ openVideoModal("SHP", true); }catch(e){ threw=e.message; }
  ok("二創殼的視窗照樣打得開", !threw); }
{ reset(); as_intl();
  function as_intl(){ localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl"); }
  let threw=""; try{ openVideoModal("V1", true); }catch(e){ threw=e.message; }
  ok("海外開這個視窗也不會炸", !threw); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
