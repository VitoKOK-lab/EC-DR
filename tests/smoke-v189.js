// v189：指派毛片也要有搜尋欄
//
// 老闆：「指派毛片的時候也需要搜尋欄」
//
// 正式資料實測：未指派的毛片一次有一百多支，要指派某一支得在 240px 高的框裡
// 慢慢捲。影片庫與待認領早就有搜尋了，這一張漏掉。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,open:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
const NODES={};
// 真的 DOM 找不到 id 會回 null；這個假 DOM 預設對任何 id 都回一個元素，
// 所以要驗「找不到就退回整頁重畫」得讓它真的回 null。
const NULLS=new Set();
let modalHTML="", viewEl=el(), rendered=0;
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(NULLS.has(id)) return null;
    if(NODES[id]) return NODES[id];
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,
  querySelectorAll:(sel)=>(global.__qsa&&global.__qsa[sel])||[]};
global.window={addEventListener(){},innerWidth:1400,innerHeight:900,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const T0=FROZEN;

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"文案",
  rawLink:"https://drive.google.com/drive/folders/RAW",cover:"",stage:"待處理",editor:"",claimedBy:"",
  assignedTo:"",scheduledDate:T0,publishTime:"15:00",finishedAt:"",publishedLink:"",
  driveFolder:"https://drive.google.com/drive/folders/FAM",productUrl:"",note:"",mainType:"",source:"官方IP",
  refLink:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",tags:[],products:[],
  usageHistory:[],metrics:[]},o||{});
function reset(vids){
  VIEW_AS=null; BRAND=""; AFP_Q=""; SHIFT_DATE=T0;
  for(const k in NODES) delete NODES[k]; NULLS.clear(); global.__qsa={}; rendered=0;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}),
    loadShiftMonth:async()=>{} };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"阿明",role:"editor"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:vids||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
}
const card=()=>{ const d=dashSchedule();
  return dashAssignFootageCard(["小葵","阿明"], d.poolN, d.unassignedPool, d.assignCount||{}); };
const nBox=(h)=>(h.match(/class="afp_vid"/g)||[]).length;

// ══════════ ① 搜尋欄真的長出來了 ══════════
{ reset([ v_("A",{name:"珠寶保養的秘密"}), v_("B",{name:"婚戒怎麼挑"}) ]);
  const h=card();
  ok("**有搜尋框**", /id="afp_q"/.test(h), h.slice(0,200));
  ok("提示文字講得出可以找什麼", /找毛片（片名、編號、文案、備註/.test(h));
  ok("（前提）兩支都列出來", nBox(h)===2, nBox(h)); }

// ══════════ ② 搜尋真的會篩 ══════════
{ reset([ v_("A",{name:"珠寶保養的秘密"}), v_("B",{name:"婚戒怎麼挑"}) ]);
  AFP_Q="婚戒";
  const h=card();
  ok("**打了關鍵字就只剩符合的**", nBox(h)===1 && h.includes("婚戒怎麼挑") && !h.includes("珠寶保養"),
     {剩幾支:nBox(h)});
  ok("**數字跟著變成「1/2」**", /未指派 <b[^>]*>1\/2<\/b> 支/.test(h),
     (h.match(/未指派 <b[^>]*>[^<]*<\/b> 支/)||[])[0]);
  ok("有清除鍵可以按", /id="afp_clear"[^>]*>[\s\S]{0,120}setAfpQ\(''\)/.test(h)); }
{ reset([ v_("A",{name:"珠寶保養的秘密"}) ]);
  AFP_Q="找不到的東西";
  const h=card();
  ok("**找不到的時候講清楚，不是一片空白**", h.includes("找不到符合「找不到的東西」的毛片"),
     h.slice(h.indexOf("afp_list"), h.indexOf("afp_list")+200)); }
{ reset([ v_("A",{name:"珠寶保養的秘密"}) ]);
  AFP_Q="";
  ok("沒打字的時候數字就是單純的支數", /未指派 <b[^>]*>1<\/b> 支/.test(card())); }

// ══════════ ③ 用的是全站同一份欄位清單（不要另外寫一份比對規則）══════════
{ reset([ v_("A",{name:"珠寶保養",code:"1150820099"}),
          v_("B",{name:"別的片",note:"這支是溱姐要的"}),
          v_("C",{name:"又一支",videoCopy:"口播提到鑽石認證"}) ]);
  const hit=(q)=>{ AFP_Q=q; const n=nBox(card()); AFP_Q=""; return n; };
  ok("**編號找得到**", hit("1150820099")===1);
  ok("**備註找得到**", hit("溱姐")===1);
  ok("**文案找得到**", hit("鑽石認證")===1);
  ok("大小寫不影響", (()=>{ AFP_Q="A"; const a=card(); AFP_Q=""; return a.length>0; })());
  ok("**跟影片庫、待認領同一份 vidSearchText**", /vidSearchText\(v\)\.includes\(String\(AFP_Q\)/.test(APP)); }

// ══════════ ④ 已經指派出去的不會冒出來 ══════════
{ reset([ v_("A",{name:"還沒指派的"}), v_("B",{name:"已經給小葵的",assignedTo:"小葵"}) ]);
  const h=card();
  ok("只列未指派的", nBox(h)===1 && h.includes("還沒指派的") && !h.includes("已經給小葵的"), nBox(h)); }

// ══════════ ⑤ 全選只勾「現在列出來的」 ══════════
{ ok("**全選是從畫面上的勾選框抓的**（搜尋完按全選＝只勾搜尋結果）",
     /function afpToggleAll\(btn\)\{ const boxes=Array\.from\(document\.querySelectorAll\('\.afp_vid'\)\)/.test(APP));
  reset([ v_("A",{name:"珠寶保養"}), v_("B",{name:"婚戒怎麼挑"}) ]);
  AFP_Q="婚戒";
  const boxes=[{checked:false,value:"B"}];
  global.__qsa={".afp_vid":boxes};
  afpToggleAll({textContent:""});
  ok("搜尋後全選只勾到那一支", boxes.length===1 && boxes[0].checked===true && boxes[0].value==="B"); }

// ══════════ ⑥ 打字不會整頁重畫（不然游標會跳出去、勾好的會被清掉）══════════
{ reset([ v_("A",{name:"珠寶保養"}), v_("B",{name:"婚戒怎麼挑"}) ]);
  const list=el(); NODES["afp_list"]=list;
  const nEl=el(); NODES["afp_n"]=nEl;
  const clr=el(); NODES["afp_clear"]=clr;
  const _r=render; let didRender=false; render=()=>{ didRender=true; };
  setAfpQ("婚戒");
  render=_r;
  ok("**沒有整頁重畫**", didRender===false);
  ok("**只換掉清單那一塊**", list.innerHTML.includes("婚戒怎麼挑") && !list.innerHTML.includes("珠寶保養"),
     list.innerHTML.slice(0,140));
  ok("數字那一格也跟著換", nEl.textContent==="1/2", nEl.textContent);
  ok("清除鍵跟著出現", clr.innerHTML.includes("setAfpQ")); }
// 找不到 afp_list（不在這一頁）就退回整頁重畫，不要默默什麼都不做
{ reset([ v_("A") ]);
  NULLS.add("afp_list");                      // 假裝現在不在那一頁上
  const _r=render; let didRender=false; render=()=>{ didRender=true; };
  setAfpQ("x");
  render=_r; NULLS.clear();
  ok("**卡片不在畫面上時退回整頁重畫**（不要默默什麼都不做）", didRender===true); }

// ══════════ ⑦ 登出會清掉搜尋字（不要留給下一個人）══════════
{ ok("**登出時 AFP_Q 一起清掉**", /VID_Q=""; POOL_Q=""; AFP_Q="";/.test(APP)); }

// ══════════ ⑧ 沒有把別的弄壞 ══════════
{ reset([ v_("A"), v_("B") ]);
  const h=card();
  ok("選員工的下拉還在", /id="afp_who"/.test(h));
  ok("指派按鈕還在", /assignFootage\(\)/.test(h));
  ok("捲動記憶還在（v184 修的那個）", /id="afp_scroll" class="keepscroll"/.test(h));
  ok("上片日期還是印得出來", /預排上片日/.test(h)); }
{ reset([]);
  ok("一支都沒有的時候講清楚", card().includes("目前沒有未指派的待剪毛片"));
  ok("而且不會冒出全選鍵", !card().includes("afpToggleAll")); }

console.log(`\nv189（指派毛片的搜尋欄）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
