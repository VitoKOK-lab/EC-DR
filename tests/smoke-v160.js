// v160：「今天要做的事」裡影片那幾列 —— ① 在「官方IP」旁邊加上日期 ② 依日期排序。
//
// 那個日期是「**這一列什麼時候出現在他頁面上**」，也就是 claimedAt
// （認領或被主管指派的那一刻，從那時起這支才進他的清單）。
// 順序改成新的在上面（原本是舊的在上面）。
//
// ⚠️ 為什麼不是「預排上片日」：查過正式資料 —— 還在剪的 28 支裡只有 1 支填了
//    預排上片日（那個欄位實務上是剪完才填的，已完成的 70%、已上片的 100% 才有）。
//    用它的話剪輯看到的幾乎整片空白。claimedAt 則是 28 支全都有、而且帶時分。
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
let modalHTML="", viewEl=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
// 「今天」凍在月中，這支測試哪一天跑結果都一樣（見 smoke-v159 開頭的說明）
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14";
refreshToday();

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
const D=(n)=>new Date(new Date(FROZEN+"T12:00:00Z").getTime()+n*864e5).toISOString().slice(0,10);
const TODAY=D(0);
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"片"+id,videoCopy:"文案",
  rawLink:"http://raw",lib:"",stage:"剪輯中",editor:"小葵",claimedBy:"小葵",assignedTo:"",
  scheduledDate:null,claimedAt:D(-1)+"T09:00:00",finishedAt:"",durationMin:0,publishedLink:"",
  driveFolder:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",
  cover:"",remakes:[],tags:[],products:[],usageHistory:[],metrics:[],deleted:false,
  source:"官方IP"},o||{});
function reset(videos, who, role){
  modalHTML=""; viewEl.innerHTML=""; VIEW_AS=null; BRAND=""; POOL_FILTER="all"; POOL_Q=""; FOLD_OPEN={};
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"小葵"); localStorage.setItem("ecdr_role", role||"editor");
  CUR_TAB="work";
}
// 「今天要做的事」那張卡裡，影片列的先後（用片名的出現位置比）
const orderOf=(h, names)=>names.map(n=>h.indexOf(">"+n+"<")>=0?h.indexOf(">"+n+"<"):h.indexOf(n));

// ══════════ ① 日期小字接在「官方IP」後面 ══════════
{ reset([ v_("A",{claimedAt:D(-3)+"T14:20:00"}) ]);
  const h=viewWork();
  ok("那一列還是有「剪輯中」", /剪輯中/.test(h));
  ok("那一列還是有片源「官方IP」", /官方IP/.test(h));
  ok("日期接在片源後面，用「・」隔開",
     new RegExp("剪輯中・官方IP・").test(h.replace(/<[^>]*>/g,"")), h.replace(/<[^>]*>/g,"").slice(0,400));
  const md=(+D(-3).slice(5,7))+"/"+(+D(-3).slice(8,10));
  ok("寫的是接手日", h.includes(md+" 接手"), md);
  ok("滑過去看得到完整的時間（含時分）", h.includes(md+" 14:20")); }

// 今天／昨天 用字說出來
{ reset([ v_("T",{claimedAt:TODAY+"T09:00:00"}) ]);
  ok("今天接手的寫「今天接手」", /今天接手/.test(viewWork()));
  reset([ v_("Y",{claimedAt:D(-1)+"T09:00:00"}) ]);
  ok("昨天接手的寫「昨天接手」", /昨天接手/.test(viewWork())); }

// 沒有接手日就不要瞎編一個
{ reset([ v_("N",{claimedAt:""}) ]);
  const h=viewWork();
  ok("沒有接手日時小字不硬擠一個日期出來", !/接手/.test(h));
  ok("小字那一段結尾就是片源，後面沒有多一個「・」",
     !/官方IP・\s*<\/div>/.test(h)); }

// 天數是管理用的資訊，剪輯自己的頁面刻意不顯示（canSeeEditDays 那條規矩）
{ reset([ v_("久",{claimedAt:D(-12)+"T09:00:00"}) ], "小葵","editor");
  const h=viewWork();
  ok("剪輯自己看不到「第幾天」（那是刻意的，別繞過去）",
     !/第 \d+ 天/.test(h) && !/\d+ 天/.test(h.replace(/[^>]*天氣[^<]*/g,"")), h.match(/\d+ 天/g)); }

// ══════════ ② 依接手日排序，新的在上面 ══════════
{ reset([ v_("舊",{claimedAt:D(-10)+"T09:00:00"}), v_("新",{claimedAt:D(0)+"T09:00:00"}),
          v_("中",{claimedAt:D(-4)+"T09:00:00"}),  v_("沒",{claimedAt:""}) ]);
  const h=viewWork();
  const [p新,p中,p舊,p沒]=orderOf(h,["片新","片中","片舊","片沒"]);
  ok("最新接手的排最上面", p新<p中, {p新,p中});
  ok("再來是中間的", p中<p舊, {p中,p舊});
  ok("沒有接手日的排最後", p舊<p沒, {p舊,p沒}); }

// 同一天的看時刻；連時刻都一樣才依編號（順序要穩定，不然每次重繪會跳）
{ reset([ v_("早",{claimedAt:D(-1)+"T09:00:00"}), v_("晚",{claimedAt:D(-1)+"T17:00:00"}) ]);
  ok("同一天內也是晚的在上面", viewWork().indexOf("片晚")<viewWork().indexOf("片早"));
  reset([ v_("B",{claimedAt:D(-1)+"T09:00:00"}), v_("A",{claimedAt:D(-1)+"T09:00:00"}) ]);
  const h=viewWork(), h2=viewWork();
  ok("時刻完全一樣時依編號，順序固定", h.indexOf("片A")<h.indexOf("片B"));
  ok("重畫一次順序一樣", h2.indexOf("片A")<h2.indexOf("片B")); }

// 不再是「先領的在上面」（原本的規則）
{ reset([ v_("先領的",{claimedAt:D(-10)+"T09:00:00"}),
          v_("剛接手的",{claimedAt:D(0)+"T09:00:00"}) ]);
  ok("剛接手的排在先領的前面（順序反過來了）",
     viewWork().indexOf("片剛接手的")<viewWork().indexOf("片先領的")); }

// ══════════ ③ 待剪池的順序沒有被動到 ══════════
{ ok("待剪池還是依預排上片日排（那是它本來的規矩，這次沒有要改）",
     /v\.stage==="待處理"[\s\S]{0,200}scheduledDate[\s\S]{0,120}9999/.test(APP)); }

// ══════════ ④ 今天完成的那幾支：寫完成時刻，不寫接手日 ══════════
{ reset([ v_("完",{stage:"已完成", finishedAt:TODAY+"T14:25:00", claimedAt:D(-5)+"T09:00:00"}) ]);
  const h=viewWork();
  ok("完成的那一列寫「今天完成」", /今天完成/.test(h));
  ok("完成的那一列寫完成時刻", /完成 14:25/.test(h));
  ok("完成的那一列不寫接手日（已經是結果了）", !/接手/.test(h)); }

// ══════════ ⑤ 不會壞掉 ══════════
{ reset([ v_("怪",{claimedAt:"這不是日期"}) ]);
  let threw=false; try{ viewWork(); }catch(e){ threw=true; }
  ok("日期欄位是垃圾字串也不會爆", !threw);
  reset([]);
  threw=false; try{ viewWork(); }catch(e){ threw=true; }
  ok("一支都沒有時也不會爆", !threw);
  ok("workSchedTag 對沒有接手日的回空字串", workSchedTag({stage:"剪輯中"})==="");
  ok("workSchedTag 對完成但沒有完成時刻的回空字串", workSchedTag({stage:"已完成",finishedAt:""})===""); }

console.log(`\nv160（工作清單加日期＋依日期排序）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
