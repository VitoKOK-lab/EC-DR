// v140：v138 把影片改成按需訂閱，結果海外同事回報「輸入資料會不見、看不到」。
//
// 病灶：訂閱的時機。v138 只在 app.js 的 render() 裡呼叫 watchVideos()，
// 那要等畫面先畫完 —— 中間多出一個「畫面已經全部畫出來、影片還在路上」的空窗期。
// 在那幾秒裡：清單是空的（看不到），而且任何動到影片的操作都會走到
// route() 的 `if(!v) throw 找不到影片` —— 使用者看到的是「找不到影片」，
// 自然會理解成「我剛剛輸入的東西不見了」。
//
// 兩個修法，缺一不可：
// ① fb.js 在開機的訂閱區就依職位訂閱影片，跟其他集合並行（不要等畫面）。
// ② 「還沒載完」跟「真的找不到」要講不同的話。
//
// 這支測試釘住的是**時機**，不是「有沒有訂閱」—— v138 的測試只驗了後者，所以沒抓到。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const FB=fs.readFileSync(path.join(__dirname,"..","fb.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let viewEl=el(), nodes={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl; if(!nodes[id]) nodes[id]=el(); return nodes[id]; },
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=()=>{};

const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"文案",
  rawLink:"http://raw",lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  finishedAt:"",publishedLink:"",driveFolder:"",reviewStatus:"",locale:"",channel:"",origLang:"",
  cover:"",remakes:[],tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function setup(role, videos, watched){
  nodes={}; viewEl.innerHTML="";
  const raw={ users:[{name:"Asmeer",role:"intl"},{name:"小葵",role:"editor"},{name:"客服A",role:"cs"},
                     {name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],shopeeAccounts:[],
      msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[], products:[], matches:[] };
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, watchVideos:()=>true, watchLogs:()=>true,
    videosWatched:()=>!!watched };
  LAST_RAW=raw; STATE=decorate(raw);
  const who={intl:"Asmeer", editor:"小葵", cs:"客服A", boss:"管理員"}[role]||"小葵";
  localStorage.setItem("ecdr_user",who); localStorage.setItem("ecdr_role",role);
  VIEW_AS=null; BRAND="";
}
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }
async function errOf(fn){ try{ await fn(); return null; }catch(e){ return e.message; } }

(async()=>{

// ══════════ ① 開機就要開始下載，不能等畫面畫完 ══════════
// 這是災情的根因。v138 只在 render() 裡叫 watchVideos()，等於「畫面先出來、資料後到」。
{ const boot=FB.split("即時訂閱")[1]||"";
  ok("fb.js 開機的訂閱區就會依職位訂閱影片", /needVideosByRole\(\)\)\s*window\.DB\.watchVideos\(\)/.test(boot));
  ok("而且是跟其他集合寫在一起（並行，不是排在後面等）",
     boot.indexOf("watchVideos")>=0 && boot.indexOf("watchVideos") < boot.indexOf('collection(db, "shifts")'));
  ok("fb.js 自己判斷得出職位（不必等 app.js）", /function needVideosByRole\(\)/.test(FB));
  ok("讀不到職位時一律下載（寧可多下載，不能少）",
     /catch \(e\) \{ return true; \}/.test(FB));
  ok("沒登入過的職位也會下載", (()=>{ const m=FB.match(/const NO_VIDEO_ROLES = \[([^\]]*)\]/);
       return !!m && !/\bpick\b|\beditor\b|\bintl\b|\bmanager\b|\bboss\b/.test(m[1]); })()); }
// 兩邊的清單必須一致，不然一邊訂了另一邊以為沒訂
{ const a=(APP.match(/const NO_VIDEO_ROLES=\[([^\]]*)\]/)||[])[1]||"";
  const f=(FB.match(/const NO_VIDEO_ROLES = \[([^\]]*)\]/)||[])[1]||"";
  const norm=(x)=>x.replace(/[\s"']/g,"").split(",").filter(Boolean).sort().join(",");
  ok("app.js 與 fb.js 的「不用影片」清單完全一致（"+norm(a)+"）", !!a && norm(a)===norm(f)); }
// app.js 那一條保留著當保險（換職位登入時補訂）
{ ok("app.js 仍然會在 render 裡補一次（換人登入的保險）",
     /if\(needVideos\(\)\)\{[\s\S]{0,140}watchVideos\(\)/.test(APP)); }

// ══════════ ② 「還沒載完」不能講成「找不到影片」 ══════════
// 講錯的後果就是使用者以為資料不見了。
{ setup("intl", [], false);          // 需要影片、還沒訂閱回來
  ok("海外開機當下＝載入中", videosLoading()===true);
  const msg=await errOf(()=>route("PUT","/api/videos/X1",{video:{name:"改一下"}}));
  ok("這時候動影片，訊息是「還在載入中」不是「找不到」",
     !!msg && /loading|載入中/.test(msg) && !/not found|找不到/.test(msg)); }
{ setup("intl", [v_("V1")], true);   // 影片已經到了
  ok("影片到了就不是載入中", videosLoading()===false);
  const msg=await errOf(()=>route("PUT","/api/videos/沒這支",{video:{name:"x"}}));
  ok("真的找不到才講「找不到影片」", !!msg && /not found|找不到/.test(msg));
  const okmsg=await errOf(()=>route("PUT","/api/videos/V1",{video:{name:"改好了"}}));
  ok("存在的影片照樣改得動（沒有被這道防線擋掉）", okmsg===null); }
{ setup("cs", [], true);
  ok("不需要影片的職位永遠不算載入中（他本來就不會有影片）", videosLoading()===false); }
{ setup("editor", [], false);
  ok("剪輯開機當下也算載入中", videosLoading()===true); }
// 訂閱回來了但真的一支都沒有（全新公司）—— 仍算載入中不會誤導，但不能永遠卡住
{ setup("editor", [], true);
  ok("訂閱回來了卻一支都沒有：算載入中（新公司很少見，寧可講保守的）", videosLoading()===true); }

// ══════════ ③ 海外的畫面在資料到齊之後要正常 ══════════
{ setup("intl", [v_("S1",{stage:"已上片",published:true,publishedLink:"http://p",driveFolder:"http://d",
                          scheduledDate:"2026-01-01",finishedAt:"2026-01-01T10:00:00",tags:["舊片"]}),
                 v_("E1",{locale:"en",sourceVideoId:"S1",account:"acctEN",stage:"待處理"})], true);
  let threw=""; try{ viewWork(); }catch(e){ threw=e.message; }
  ok("海外的上班計畫畫得出來", !threw);
  let t2=""; try{ viewVideos(); }catch(e){ t2=e.message; }
  ok("海外的影片庫畫得出來", !t2); }
{ setup("intl", [], false);
  let threw=""; try{ viewWork(); viewVideos(); viewCal(); viewTeam(); }catch(e){ threw=e.message; }
  ok("影片還沒到的時候，海外每一頁也都畫得出來（不是白畫面）", !threw); }

// ══════════ ④ v138 省下來的東西不能被這次修回去 ══════════
{ setup("cs", [], false);
  ok("不剪片的職位還是不下載", needVideos()===false);
  const boot=FB.split("即時訂閱")[1]||"";
  ok("fb.js 開機仍然沒有無條件訂閱影片",
     !/onSnapshot\(collection\(db, "videos"\)/.test(boot)); }
{ setup("boss", [], false);  ok("管理員要下載", needVideos()===true); }
{ setup("intl", [], false);  ok("海外要下載", needVideos()===true); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
