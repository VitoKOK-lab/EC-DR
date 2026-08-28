// v153 ⑥⑦：最後兩件清潔工作。
//
// ⑥ vidOpenFn()「這支要開哪一種編輯視窗」已經有共用函式了，但還有五個地方
//    各自抄了一份一模一樣的三元判斷。抄五份的問題不是難看，是**會走鐘**：
//    以後多一種版本（例如再加一個平台）改了共用的那份，那五個地方還是舊的，
//    而且不會有人發現 —— 點下去開錯視窗而已，不會報錯。
//
// ⑦ 實測測試涵蓋率：606 個 function 有 554 個被測試跑過（91%），沒跑到的 52 個
//    裡有 9 個會動資料庫。這裡把其中真的會被員工按到、而且一按就改資料的補上，
//    最主要是 unclaimVid（退回毛片到待剪清單）。
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
let modalHTML="", viewEl=el(), TOASTS=[], CONFIRM=true, ROUTES=[];
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>CONFIRM; global.prompt=()=>null;
eval(src);
toast=(m)=>{ TOASTS.push(String(m)); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const TODAY=D(0);
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"片"+id,videoCopy:"文案",
  rawLink:"http://raw",lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  claimedAt:"",finishedAt:"",durationMin:0,publishedLink:"",driveFolder:"",reviewStatus:"",
  locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],tags:[],
  products:[],usageHistory:[],metrics:[],deleted:false},o||{});
function reset(videos, who, role){
  TOASTS=[]; ROUTES=[]; CONFIRM=true; modalHTML=""; viewEl.innerHTML=""; VIEW_AS=null; BRAND="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"阿哲",role:"editor"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[{locale:"en",name:"tiktok-EN"}],
      shopeeAccounts:["蝦皮店A"],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"小葵"); localStorage.setItem("ecdr_role", role||"editor");
  route=async(method,path,body)=>{ ROUTES.push(method+" "+path); return {}; };   // 攔在最外層，不真的寫
}

// ══════════ ⑥ 開哪一種視窗：只准有一份判斷 ══════════
{ ok("原始碼裡不再有第二份內嵌的三元判斷",
     !APP.includes("(v.channel&&CHANNELS[v.channel])?`openChModal('${v.channel}','${v.id}')`:v.locale?`openIntlModal('${v.id}')`:`editVideo('${v.id}')`"));
  reset([]);
  ok("台灣源片 → 一般編輯視窗", vidOpenFn(v_("A"))==="editVideo('A')");
  ok("海外二創 → 海外視窗", vidOpenFn(v_("B",{locale:"en"}))==="openIntlModal('B')");
  ok("蝦皮二創 → 蝦皮視窗", vidOpenFn(v_("C",{channel:"shopee"}))==="openChModal('shopee','C')");
  ok("同時有 channel 跟 locale 時，channel 優先（跟以前一樣）",
     vidOpenFn(v_("D",{channel:"shopee",locale:"en"}))==="openChModal('shopee','D')");
  ok("認不得的 channel 退回一般視窗（不會壞掉）",
     vidOpenFn(v_("E",{channel:"不存在的平台"}))==="editVideo('E')"); }

// 五個原本抄一份的地方，畫出來的東西要跟共用函式一致
{ reset([ v_("SRC",{stage:"待處理"}),
          v_("SHP",{channel:"shopee",sourceVideoId:"SRC",account:"蝦皮店A",stage:"待處理"}),
          v_("EN",{locale:"en",sourceVideoId:"SRC",account:"tiktok-EN",stage:"待處理"}) ], "小葵","editor");
  CUR_TAB="work"; const h=viewWork();
  ok("待認領清單：蝦皮那支用蝦皮視窗", h.includes("openChModal('shopee','SHP')"));
  ok("待認領清單：英文那支用海外視窗", h.includes("openIntlModal('EN')"));
  ok("待認領清單：源片用一般視窗", h.includes("editVideo('SRC')")); }

// ⚠️ 上面那三條只走到「待認領清單」那一個呼叫點。原本抄了五份，另外兩個 openFn
//    跟一個 openRev 在別的卡片裡 —— 不把那幾張卡也畫出來，這一節就是空轉的
//    （突變測試「把 openFn 改成只會開一般視窗」原本 0 紅，就是這樣抓到的）。
{ const d=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
  // 審片進度卡：被退回的、審過還沒收到的、還在等審的，各一支二創
  reset([ v_("SRC2",{stage:"已上片",driveFolder:"http://d",publishedLink:"http://p"}),
          v_("REJ",{channel:"shopee",sourceVideoId:"SRC2",account:"蝦皮店A",editor:"小葵",
                    stage:"已完成",reviewStatus:"退回",reviewNote:"重剪",finishedAt:d(-1)+"T10:00:00"}),
          v_("APP",{locale:"en",sourceVideoId:"SRC2",account:"tiktok-EN",editor:"小葵",
                    stage:"已完成",reviewStatus:"通過",reviewedAt:d(0)+"T10:00:00",finishedAt:d(0)+"T09:00:00"}),
          v_("WAIT",{editor:"小葵",stage:"已完成",finishedAt:d(0)+"T11:00:00"}) ], "小葵","editor");
  CUR_TAB="work"; const h=viewWork();
  ok("審片進度卡：被退回的蝦皮二創用蝦皮視窗", h.includes("openChModal('shopee','REJ')"), h.length);
  ok("審片進度卡：審過的英文二創用海外視窗", h.includes("openIntlModal('APP')"));
  ok("最近 7 天卡：也用同一套判斷（三種都出現過）",
     h.includes("openChModal('shopee','REJ')") && h.includes("openIntlModal('APP')") && h.includes("editVideo('WAIT')")); }

{ const d=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
  // 流程中控的「待你審片」（openRev）
  reset([ v_("SRC3",{stage:"已上片",driveFolder:"http://d",publishedLink:"http://p"}),
          v_("PR1",{channel:"shopee",sourceVideoId:"SRC3",account:"蝦皮店A",editor:"小葵",
                    stage:"已完成",finishedAt:d(-1)+"T10:00:00"}),
          v_("PR2",{locale:"en",sourceVideoId:"SRC3",account:"tiktok-EN",editor:"小葵",
                    stage:"已完成",finishedAt:d(-1)+"T11:00:00"}) ], "管理員","boss");
  CUR_TAB="flow"; const h=viewFlow();
  ok("待你審片：蝦皮二創用蝦皮視窗", h.includes("openChModal('shopee','PR1')"), h.length);
  ok("待你審片：英文二創用海外視窗", h.includes("openIntlModal('PR2')")); }

// ══════════ ⑦ 補上沒測到的：退回毛片 ══════════
{ reset([ v_("V1",{stage:"剪輯中",claimedBy:"小葵",editor:"小葵",claimedAt:TODAY+"T09:00:00"}) ], "小葵","editor");
  CONFIRM=false; unclaimVid("V1");
  ok("退回毛片：按取消就什麼都不做", ROUTES.length===0, ROUTES);
  CONFIRM=true; unclaimVid("V1");
  ok("退回毛片：確認後才送出", ROUTES.some(r=>r.includes("/unclaim")), ROUTES);
  ok("退回毛片：打到正確的那一支", ROUTES.some(r=>r.includes("/api/videos/V1/unclaim")), ROUTES);
  ok("退回毛片：只送一次（不會重複退）", ROUTES.filter(r=>r.includes("/unclaim")).length===1, ROUTES); }

{ reset([ v_("V1",{stage:"剪輯中",claimedBy:"小葵",editor:"小葵"}) ], "小葵","editor");
  VIEW_AS="阿哲"; ROUTES=[];
  unclaimVid("V1");
  ok("退回毛片：員工視角底下一筆都不准送", ROUTES.length===0, ROUTES);
  VIEW_AS=null; }

// 認領 / 完成 / 作業步驟
{ reset([ v_("V2",{stage:"待處理"}) ], "小葵","editor");
  claimVid("V2");
  ok("認領：送到 /claim", ROUTES.some(r=>r.includes("/api/videos/V2/claim")), ROUTES);
  reset([ v_("V3",{stage:"剪輯中",claimedBy:"小葵",editor:"小葵"}) ], "小葵","editor");
  CONFIRM=false; finishWork("V3");
  ok("完成剪輯：按取消就不送", ROUTES.length===0, ROUTES);
  CONFIRM=true; finishWork("V3");
  ok("完成剪輯：確認後送到 /finish", ROUTES.some(r=>r.includes("/api/videos/V3/finish")), ROUTES); }

{ reset([ v_("V4",{stage:"剪輯中",claimedBy:"小葵",editor:"小葵"}) ], "小葵","editor");
  let upd=null;
  global.window.DB.update=async(c,id,p)=>{ upd={c,id,p}; };
  setWorkStep("V4", 3);
  ok("作業步驟：寫進 videos", upd && upd.c==="videos" && upd.id==="V4", upd);
  ok("作業步驟：只動 workStep 跟 updatedAt", upd && upd.p.workStep===3 && "updatedAt" in upd.p
     && Object.keys(upd.p).length===2, upd&&upd.p);
  VIEW_AS="阿哲"; upd=null; setWorkStep("V4", 4);
  ok("作業步驟：員工視角底下不准寫", upd===null, upd);
  VIEW_AS=null; }

// 記下窗口（順手寫進設定的那條）
{ reset([], "小葵","editor");
  let saved=null;
  // ⚠️ 正式環境寫進去之後 Firestore 會推一次快照回來更新 STATE，
  //    假的替身也要照做，不然「已經有的不重複寫」那條驗不到（第一版就是這樣紅的）。
  global.window.DB.setSettings=async(p)=>{ saved=p; Object.assign(STATE.settings, p); };
  rememberContact("新窗口A");
  ok("記窗口：沒看過的就記起來", saved && (saved.contacts||[]).includes("新窗口A"), saved);
  saved=null; rememberContact("新窗口A");
  ok("記窗口：已經有的不重複寫", saved===null, saved);
  saved=null; rememberContact("   ");
  ok("記窗口：空白不寫", saved===null, saved);
  VIEW_AS="阿哲"; saved=null; rememberContact("視角下的窗口");
  ok("記窗口：員工視角底下不留痕跡", saved===null, saved);
  VIEW_AS=null; }

console.log(`\nv153⑥⑦（合併重複判斷＋補上沒測到的寫入）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
