// v151：「上片後」按下去沒有東西。
//
// 病因是我自己在 v144 種下的：那一折本來裝著「存檔資料夾」，v144 把欄位搬到
// 主畫面（拍毛片的人一進來就要看到），那一折就只剩下 metricsCard + usageCard。
// 而 metricsCard 只有老闆／主管看得到（剪輯回空字串），usageCard 要有上片紀錄才有。
// 所以對**剪輯與海外**來說，那一折從此永遠是空的 —— 不是「這支還沒資料」，
// 是「這個職位永遠不會有資料」。
//
// fold() 本來就想擋這件事（`if(!body) return ""`，createZoneCard 還特地留了
// 註解說「fold 收到空字串就整塊不出現」），但呼叫端是多行樣板字串，
// 湊出來是 "\n      \n      " —— 有值，於是照樣畫一個空盒子出來。
//
// 修法放在 fold() 這個總開關：body trim 完是空的就整折不出現。
// 一次擋掉所有折疊區，不是只補「上片後」這一處。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,
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
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"標題"+id,rawName:"慈禧太后最愛的兩種寶石",
  videoCopy:"中文口播稿",nameEn:"",videoCopyEn:"",rawLink:"http://raw",lib:"",stage:"待處理",editor:"",
  claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",publishedLink:"",driveFolder:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],
  tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos, who, role){
  modalHTML=""; viewEl.innerHTML=""; fields={};
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"管理員",role:"boss"},{name:"Anna",role:"intl"}],
    settings:{dailyTarget:4,videoTags:["新片"],sources:["自製"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"tiktok-EN"}],shopeeAccounts:["蝦皮店A"],msAccounts:[],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"小葵"); localStorage.setItem("ecdr_role", role||"editor");
  VIEW_AS=null; BRAND="";
}
let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }

// 一折裡面到底裝了什麼（拿標題去找）
function foldBody(html, title){
  const i=html.indexOf(">"+title+"<");
  if(i<0){ const j=html.indexOf(title); if(j<0) return null; }
  const s=html.indexOf('<div class="foldbody">', i<0?0:i);
  if(s<0) return null;
  return html.slice(s+'<div class="foldbody">'.length, html.indexOf("</details>", s));
}
// 畫面上有沒有「按下去沒東西」的盒子
const EMPTY_FOLD=/<div class="foldbody">\s*<\/div>/;
const hasPost=(h)=>/上片後|After publishing/.test(h);

// ══════════ ① fold() 這個總開關本身 ══════════
{ ok("fold：body 是空字串 → 整折不出現", fold("標題", null, "")==="" );
  ok("fold：body 是 null → 整折不出現", fold("標題", null, null)==="" );
  ok("fold：body 只有空白換行 → 整折不出現（這就是空盒子的來源）",
     fold("標題", null, "\n      \n      ")==="", fold("標題", null, "\n      \n      "));
  ok("fold：body 只有空白 → 整折不出現", fold("標題", null, "   ")==="" );
  const real=fold("標題", null, "\n      <div>真的有東西</div>\n    ");
  ok("fold：真的有東西時照樣畫出來", real.includes("真的有東西") && real.includes("<details"));
  ok("fold：有東西時標題還在", real.includes("<summary>標題"));
  ok("fold：有東西時不會被誤判成空盒子", !EMPTY_FOLD.test(real), real); }

// ══════════ ② 剪輯：沒有成效也沒有上片紀錄 → 那一折整個不該出現 ══════════
// ⚠️ 這不是「這支剛好還沒資料」，是剪輯這個職位永遠看不到成效表 —— 對他們來說
//    這一折是**結構上**的空盒子，不能只靠「等有資料再說」帶過。
{ reset([v_("V1")], "小葵", "editor");
  openVideoModal("V1", true);
  ok("剪輯：沒有「上片後」這一折", !hasPost(modalHTML));
  ok("剪輯：整個視窗沒有任何空盒子", !EMPTY_FOLD.test(modalHTML));
  ok("剪輯：其他該有的一折還在（商品與導購）", /商品與導購/.test(modalHTML));
  ok("剪輯：其他該有的一折還在（進階）", /進階/.test(modalHTML));
  ok("剪輯：存檔資料夾還在主畫面（v144 那條規矩沒被弄壞）",
     /e_drive/.test(modalHTML)); }

// ══════════ ③ 海外：一樣不該看到空盒子 ══════════
{ reset([v_("V1")], "Anna", "intl");
  openVideoModal("V1", true);
  ok("海外：沒有「After publishing」這一折", !hasPost(modalHTML));
  ok("海外：整個視窗沒有任何空盒子", !EMPTY_FOLD.test(modalHTML)); }

// ══════════ ④ 老闆：這一折本來就有東西，不能被順手砍掉 ══════════
{ reset([v_("V1")], "管理員", "boss");
  openVideoModal("V1", true);
  ok("老闆：「上片後」還在", hasPost(modalHTML));
  const b=foldBody(modalHTML,"上片後");
  ok("老闆：裡面是平台成效那張卡", !!b && b.includes("平台成效"), b&&b.slice(0,120));
  ok("老闆：沒資料時有寫一句話說明為什麼是空的", !!b && b.includes("尚無成效數據"));
  ok("老闆：整個視窗沒有空盒子", !EMPTY_FOLD.test(modalHTML)); }

// ══════════ ⑤ 一旦真的有料，那一折要自己回來 ══════════
{ reset([v_("V2",{usageHistory:[{date:"2026-08-01",link:"http://x",by:"小葵"}]})], "小葵", "editor");
  openVideoModal("V2", true);
  ok("剪輯＋有上片紀錄：「上片後」回來了", hasPost(modalHTML));
  const b=foldBody(modalHTML,"上片後");
  ok("剪輯＋有上片紀錄：裡面看得到使用紀錄", !!b && b.includes("使用紀錄"));
  ok("剪輯＋有上片紀錄：而且是自動展開的（有料就不該還要再按一次）",
     /上片後<\/summary>/.test(modalHTML.replace(/<span class="n">\d+<\/span>/g,"")) &&
     /<details class="fold" data-fold="[^"]+" open><summary>上片後/.test(modalHTML),
     modalHTML.slice(modalHTML.indexOf("上片後")-90, modalHTML.indexOf("上片後")+12)); }

{ reset([v_("V3",{metrics:[{platform:"TikTok",account:"tw",views:1234,likes:5,comments:1,shares:0}]})], "管理員", "boss");
  openVideoModal("V3", true);
  const b=foldBody(modalHTML,"上片後");
  ok("老闆＋有成效：看得到數字", !!b && b.includes("1,234"));
  ok("老闆＋有成效：自動展開",
     /<details class="fold" data-fold="[^"]+" open><summary>上片後/.test(modalHTML)); }

// ══════════ ⑥ 全站掃描：任何職位、任何分頁都不准有空盒子 ══════════
{ const roles=[["小葵","editor"],["管理員","boss"],["Anna","intl"]];
  const tabs=["work","videos","sched","team"];
  let bad=[];
  roles.forEach(([who,role])=>tabs.forEach(tab=>{
    reset([v_("A"), v_("B",{stage:"已完成",finishedAt:"2026-08-01",editor:who}),
           v_("C",{locale:"en",sourceVideoId:"A",account:"tiktok-EN"})], who, role);
    try{ CUR_TAB=tab; render(); }catch(e){ bad.push(role+"/"+tab+" render 出錯:"+e.message); return; }
    if(EMPTY_FOLD.test(viewEl.innerHTML)) bad.push(role+"/"+tab);
  }));
  ok("所有職位所有分頁都沒有空的折疊區", bad.length===0, bad); }

// ══════════ ⑦ 檢視模式（唯讀）不受影響 ══════════
{ reset([v_("V1")], "小葵", "editor");
  openVideoModal("V1", false);
  ok("唯讀模式：還是看得到影片內容", /影片內容/.test(modalHTML));
  ok("唯讀模式：沒有空盒子", !EMPTY_FOLD.test(modalHTML)); }

console.log(`\nv151: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
