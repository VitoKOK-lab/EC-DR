// v137：影片庫大流 —— 兩個庫，一個放生產過程，一個放成品。
//
// 最重要的一條線：**成果 ≠ 生產**。
//   生產面（毛片庫存、待認領池、審片清單、未拍、剪輯 KPI）→ 大流一支都不能算進去。
//     大流的片沒經過拍片也沒經過剪片，混進去的話「還要不要去拍片」這種判斷會整個失真。
//   出片面（月排程、當天已排幾支）→ 大流要一起算。
//     那是「今天到底出幾支」，不管它從哪個庫來。
//
// 切法刻意跟品牌相反：品牌是濾掉別家的，這裡是把大流**抽出** STATE.videos，
// 讓幾十個讀 STATE.videos 的生產流程自動正確，只有月排程那幾個地方明確加回來。
// 這支測試就是在釘住「抽出去了、而且該加回來的地方有加回來」。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,isConnected:true,scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
// showModal 是用 getElementById("modalConfirm").onclick 掛確認鍵的，
// 每次都回新元素的話那個 handler 會掉在地上 —— 這一顆要給穩定的同一個節點
const confirmBtn=el();
async function MODAL_CONFIRM(){ if(typeof confirmBtn.onclick==="function") return await confirmBtn.onclick(); }
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(id==="modalConfirm") return confirmBtn;
    const e=el(); if(fields[id]!=null) e.value=fields[id];
    if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=()=>{};

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const T0=D(0);
let writes=[], toasts=[], errToasts=[];
toast=(m,isErr)=>{ toasts.push(String(m)); if(isErr) errToasts.push(String(m)); };

// A 庫的片（走完整流程）
const a_=(id,o)=>Object.assign({id,code:"A"+id,name:"A片"+id,rawName:"A毛片"+id,videoCopy:"文案",
  rawLink:"http://raw",lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  finishedAt:"",publishedLink:"",driveFolder:"",reviewStatus:"",locale:"",channel:"",origLang:"",
  cover:"",remakes:[],tags:[],products:[],usageHistory:[],metrics:[]},o||{});
// 大流的片（直接放成品）
const d_=(id,o)=>Object.assign({}, a_(id,o), {lib:"大流",code:"D"+id,name:"大流片"+id,rawName:"大流片"+id,
  stage:"已完成",published:true,finishedAt:T0+"T09:00:00",reviewStatus:"通過",reviewedBy:"管理員",
  driveFolder:"http://drive/"+id,rawLink:"",tags:["舊片"]}, o||{});

function reset(videos){
  modalHTML=""; viewEl.innerHTML=""; writes=[]; toasts=[]; errToasts=[]; fields={};
  global.window.DB={ set:async(c,id,o)=>{writes.push(["set",c,id,o]);},
    update:async(c,id,p)=>{writes.push(["update",c,id,p]);},
    del:async(c,id)=>{writes.push(["del",c,id]);},
    // 排程走 dbArrayAdd，沒有 arrayAdd 就退回 scheduleSet —— 這裡要記下來才驗得到 slot
    scheduleSet:async(d,o)=>{writes.push(["sched","schedule",d,o]); (STATE.schedule||(STATE.schedule={}))[d]=o;},
    setSettings:async()=>{} };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"Regina",role:"manager"},
                     {name:"管理員",role:"boss"},{name:"Anna",role:"intl"}],
    settings:{dailyTarget:4,videoTags:["新片","舊片"],sources:["自製"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  CUR_TAB=null; VIEW_AS=null; DF_Q=""; VID_VIEW="raw"; VID_TAGS=new Set(); VID_Q=""; ZONE_VIEW="tw";
  BRAND="";
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }
// 最後一次寫進排程的那一格
function lastSlot(){
  const w=writes.filter(x=>x[0]==="sched"); if(!w.length) return null;
  const slots=(w[w.length-1][3]||{}).slots||[]; return slots[slots.length-1]||null;
}

(async()=>{

// ══════════ ① 切片：大流從 STATE.videos 抽出去 ══════════
{ reset([a_("1"), a_("2"), d_("3"), d_("4"), d_("5")]);
  ok("STATE.videos 只剩影片庫A", (STATE.videos||[]).length===2);
  ok("STATE.videos 裡一支大流都沒有", !(STATE.videos||[]).some(isDF));
  ok("大流的片抽到 STATE.videosDF", (STATE.videosDF||[]).length===3);
  ok("allLibVideos() 兩個庫加起來", allLibVideos().length===5);
  ok("isDF 認 lib 欄位", isDF({lib:"大流"})===true && isDF({lib:""})===false && isDF({})===false);
  ok("沒有 lib 欄位的舊資料＝影片庫A（既有 610 支一筆都不用改）",
     (()=>{ reset([{id:"OLD",name:"舊資料",stage:"待處理",rawLink:"http://r",tags:[],products:[],
                   usageHistory:[],metrics:[],locale:"",channel:""}]);
            return (STATE.videos||[]).length===1 && (STATE.videosDF||[]).length===0; })()); }

// ── vid() 是全系統的通用反查，兩個庫都要找得到 ──
{ reset([a_("1"), d_("9")]);
  ok("vid() 找得到影片庫A 的片", !!vid("1"));
  ok("vid() 也找得到大流的片（月排程、操作紀錄、二創都靠它）", !!vid("9"));
  ok("vid() 拿到的大流片是對的那一支", (vid("9")||{}).lib==="大流"); }

// ══════════ ② 生產面：大流一支都不能算進去 ══════════
// 這一段是整個功能最容易出事的地方 —— 算錯了畫面上看起來很正常，
// 但「還要不要去拍片」「還有多少片可以剪」全部是假的。
{ // 毛片庫存：大流沒有毛片連結、也不是待處理，本來就不該算；但要釘住
  reset([a_("1"),a_("2"),a_("3")].concat([d_("8"),d_("9")].map(v=>Object.assign(v,{stage:"待處理",rawLink:"http://raw"}))));
  as("Regina","manager");
  ok("毛片庫存只算影片庫A（大流就算長得像毛片也不算）", rawStock().length===3); }
{ reset([a_("1",{stage:"待處理",rawLink:"http://raw"})].concat(
        [d_("8",{stage:"待處理",rawLink:"http://raw"})]));
  as("小葵","editor");
  const pool=(typeof poolAll==="function")?poolAll():[];
  ok("待認領池只有影片庫A 的片", pool.every(v=>!isDF(v))); }
{ // 審片：大流建檔時就標成通過，不該出現在待審清單
  reset([a_("1",{stage:"已完成",editor:"小葵",finishedAt:T0+"T10:00:00",reviewStatus:""}),
         d_("8",{reviewStatus:""})]);   // 就算大流的片沒標審核狀態也不能跑進來
  as("Regina","manager");
  const f=viewFlow();
  ok("待審清單看不到大流的片", !f.includes("大流片8"));
  ok("待審清單照樣看得到影片庫A 的片", f.includes("A片1")); }
{ // 未拍：大流沒有毛片連結，但它是成品，不能被算成「還沒拍」
  reset([a_("1",{rawLink:""}), d_("8",{rawLink:""})]);
  const notShot=(STATE.videos||[]).filter(v=>vidNotShot(v));
  ok("未拍只數影片庫A（大流沒毛片連結是正常的，它本來就不用拍）",
     notShot.length===1 && notShot[0].id==="1"); }
{ // 剪輯 KPI：大流不是誰剪的，不能灌進今日完成
  reset([a_("1",{stage:"已完成",published:true,editor:"小葵",finishedAt:T0+"T10:00:00"}),
         d_("8",{editor:"小葵",finishedAt:T0+"T11:00:00"})]);
  const done=(STATE.videos||[]).filter(v=>v.editor==="小葵"&&isPublished(v)&&String(v.finishedAt||"").slice(0,10)===T0);
  ok("今日完成只算影片庫A（大流不是剪出來的，不能灌業績）", done.length===1); }
{ // 影片庫A 的清單不能看到大流的片
  reset([a_("1"), d_("8")]); as("管理員","boss"); VID_VIEW="raw";
  const lib=viewVideos();
  ok("影片庫A 看不到大流的片", !lib.includes("大流片8"));
  ok("影片庫A 標題改成「影片庫A」", lib.includes("影片庫A")); }

// ══════════ ③ 出片面：月排程要看得到大流 ══════════
{ reset([a_("1",{scheduledDate:D(2),stage:"已完成",published:true}),
         d_("8",{scheduledDate:D(2)})]);
  const list=dayVideoList(D(2));
  ok("月排程當天列出兩個庫的片", list.length===2);
  ok("大流的片真的在裡面", list.some(x=>x.videoId==="8"));
  ok("影片庫A 的片也還在", list.some(x=>x.videoId==="1")); }
{ reset([a_("1"), d_("8")]);
  as("Regina","manager");
  const base=(typeof odBase==="function")?odBase(D(3)):[];
  ok("「排一支影片到這天」選得到大流的片", base.some(v=>v.id==="8"));
  ok("也還是選得到影片庫A 的片", base.some(v=>v.id==="1")); }
// 已經排在那天的不重覆列出來
{ reset([d_("8",{scheduledDate:D(2)})]);
  const l=dayVideoList(D(2));
  ok("同一支大流片不會在當天被列兩次", l.filter(x=>x.videoId==="8").length===1); }

// ══════════ ④ 直接加一支：不經毛片與剪片 ══════════
{ reset([]); as("管理員","boss");
  fields.df_name="老片一支"; fields.df_drive="http://drive/x"; fields.df_copy="文案內容";
  dfAdd();
  ok("新增視窗有檔名欄", modalHTML.includes('id="df_name"'));
  ok("新增視窗有存檔連結欄", modalHTML.includes('id="df_drive"'));
  ok("新增視窗有文案欄", modalHTML.includes('id="df_copy"'));
  ok("新增時不出現封面上傳（還沒有 id 可以掛檔案）", !modalHTML.includes('id="cv_file"'));
  ok("新增視窗有說封面要建好之後再上傳", modalHTML.includes("建好之後按「編輯」上傳")); }

// ══════════ ⑤ 存檔連結顯示成短連結，不把整條網址攤在清單上 ══════════
{ reset([d_("8",{driveFolder:"https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"})]);
  const h=dfDriveLink(vid("8"));
  ok("存檔連結是可以點的超連結", h.includes("<a href=") && h.includes("target=\"_blank\""));
  ok("顯示的文字是短的「存檔」，不是整條網址", h.includes(">存檔</a>") && !h.includes(">https://drive"));
  ok("整條網址收在滑鼠提示裡（要複製還是拿得到）", h.includes("title=\"https://drive.google.com"));
  ok("沒填存檔連結就顯示破折號、不長出空連結", dfDriveLink({})==='<span class="muted">—</span>'); }

// ══════════ ⑥ 二創：記在原片底下，不另開一筆 ══════════
{ reset([d_("8"), a_("1")]); as("小葵","editor");
  ok("二創只能選大流的片：挑到影片庫A 的會被擋下來",
     (()=>{ errToasts=[]; dfRemake("1"); return errToasts.some(t=>t.includes("大流")); })());
  ok("擋下來的時候不會寫任何東西進資料庫", writes.length===0); }
{ reset([d_("8")]); as("小葵","editor");
  dfRemake("8");
  ok("二創視窗說清楚不會另外開一筆", modalHTML.includes("不會另外開一筆"));
  ok("二創視窗直接給原片的資料夾（都存在一起）", modalHTML.includes("開啟資料夾"));
  const before=(STATE.videosDF||[]).length;
  await MODAL_CONFIRM();
  ok("做完二創之後，影片庫大流還是同樣的支數（沒有多一筆）", (STATE.videosDF||[]).length===before);
  const w=writes.filter(x=>x[1]==="videos");
  ok("二創是寫在原片那一筆上", w.length>=1 && w[0][2]==="8");
  ok("二創沒有建立新影片（沒有 set videos）", !writes.some(x=>x[0]==="set"&&x[1]==="videos")); }
// 二創次數顯示在同一列上，不是多一列
{ reset([d_("8",{remakes:[{id:"R1",by:"小葵",at:T0+"T10:00:00"},{id:"R2",by:"泓儒",at:T0+"T11:00:00"}]})]);
  as("管理員","boss");
  const rows=dfRowsHTML();
  ok("清單上這支片只有一列", (rows.match(/dfEdit\('8'\)/g)||[]).length===1);
  ok("二創次數標在同一列上", rows.includes("×2"));
  ok("誰做的、哪天做的收在滑鼠提示裡", rows.includes("小葵") && rows.includes("泓儒")); }

// ══════════ ⑥b 版本號：二創沿用原片的名字，月排程上要分得出是哪一版 ══════════
// 原片＝1（不標，標了只是雜訊），第 n 次二創＝n+1。
{ reset([d_("8",{remakes:[{id:"R1",by:"泓儒",at:T0+"T10:00:00"},{id:"R2",by:"小葵",at:T0+"T11:00:00"}]})]);
  const opts=dfVerOptions(vid("8"));
  ok("做過 2 次二創 → 可以排 3 個版本（原片＋2 版）", opts.length===3);
  ok("原片是第 1 版", opts[0][0]===1 && opts[0][1].includes("原片"));
  ok("第一次二創是第 2 版", opts[1][0]===2);
  ok("版本選項寫得出是誰剪的", opts[1][1].includes("泓儒"));
  ok("沒做過二創的片只有原片一個選項", dfVerOptions(d_("9")).length===1); }
{ ok("第 1 版不標數字（那是原片）", dfVerPill({ver:1})==="" && dfVerPill({})==="");
  ok("第 2 版標一個 2", dfVerPill({ver:2}).includes(">2<"));
  ok("第 3 版標一個 3", dfVerPill({ver:3}).includes(">3<"));
  ok("版本號用 verpill 的樣式（跟一般標籤分得開）", dfVerPill({ver:2}).includes("verpill"));
  ok("滑鼠移上去說得出這是重剪過的第幾版", dfVerPill({ver:2}).includes("第 2 版"));
  ok("亂七八糟的值退回 1、不會印出怪東西", dfVerPill({ver:"x"})==="" && dfVerPill({ver:999})===""); }
// 排入時版本號要真的寫進排程
{ reset([d_("8",{remakes:[{id:"R1",by:"泓儒",at:T0+"T10:00:00"}]})]);
  as("Regina","manager");
  fields.od_vid="8"; fields.od_time="16:00"; fields.od_verSel="2";
  await odAdd(D(3));
  await new Promise(r=>setTimeout(r,60));
  const slot=lastSlot();
  ok("排入之後排程裡有這一筆", !!slot);
  ok("排程那一筆帶著版本號 2", !!slot && dfVerOf(slot)===2); }
// 沒選版本（一般影片庫A 的舊片）不能被硬塞版本號
{ reset([a_("1",{stage:"已完成",published:true,tags:["舊片"],scheduledDate:D(-5),finishedAt:T0+"T09:00:00"})]);
  as("Regina","manager");
  fields.od_vid="1"; fields.od_time="16:00"; fields.od_verSel="3";   // 選單根本不會出現，但就算有值也不能吃
  await odAdd(D(3));
  await new Promise(r=>setTimeout(r,60));
  const slot=lastSlot();
  ok("影片庫A 的片一律是第 1 版（不吃版本選單）", !slot || dfVerOf(slot)===1); }
// 當日清單標得出來
{ reset([d_("8")]);
  STATE.schedule[D(2)]={slots:[{videoId:"8",reused:true,by:"泓儒",at:T0+"T10:00:00",time:"16:00",ver:2}]};
  as("Regina","manager"); modalHTML=""; openDay(D(2));
  ok("當日清單標出「2」", /class="tag verpill"[^>]*>2</.test(modalHTML));
  ok("片名照樣是原片的名字（二創本來就沿用）", modalHTML.includes("大流片8")); }
{ reset([d_("8")]);
  STATE.schedule[D(2)]={slots:[{videoId:"8",reused:true,by:"泓儒",at:T0+"T10:00:00",time:"16:00",ver:1}]};
  as("Regina","manager"); modalHTML=""; openDay(D(2));
  ok("原片不標數字", !modalHTML.includes("verpill")); }
// 同一天排原片＋第 2 版：以前會被按 videoId 併成一列（二創沿用原片的 id），
// 併掉的話少一列、月曆上的「已排 N」也跟看得到的列數對不上
{ reset([d_("8")]);
  STATE.schedule[D(2)]={slots:[
    {videoId:"8",reused:true,by:"泓儒",at:T0+"T10:00:00",time:"10:00",ver:1},
    {videoId:"8",reused:true,by:"小葵",at:T0+"T10:05:00",time:"16:00",ver:2}]};
  ok("同一天的兩個版本各自列一列", dayVideoList(D(2)).length===2);
  as("Regina","manager"); modalHTML=""; openDay(D(2));
  ok("畫面上真的兩列", (modalHTML.match(/移出排程/g)||[]).length===2);
  ok("只有第 2 版那一列標數字", (modalHTML.match(/verpill/g)||[]).length===1);
  ok("「已排」的數字跟列數對得上", modalHTML.includes("已排 2/")); }
// 兩格並存的時候，搬天／移出要動到指名的那一格，不能永遠動第一格
{ reset([d_("8")]);
  STATE.schedule[D(2)]={slots:[
    {videoId:"8",reused:true,by:"泓儒",at:T0+"T10:00:00",time:"10:00",ver:1},
    {videoId:"8",reused:true,by:"小葵",at:T0+"T10:05:00",time:"16:00",ver:2}]};
  as("Regina","manager"); modalHTML=""; openDay(D(2));
  ok("每一列都帶著自己的格號", /moveReuse\('8','[^']+',this\.value,0\)/.test(modalHTML)
                          && /moveReuse\('8','[^']+',this\.value,1\)/.test(modalHTML));
  ok("移出排程也帶著格號", /unscheduleReuse\('8','[^']+',0\)/.test(modalHTML)
                       && /unscheduleReuse\('8','[^']+',1\)/.test(modalHTML)); }
{ reset([d_("8")]);
  STATE.schedule[D(2)]={slots:[
    {videoId:"8",reused:true,by:"泓儒",at:T0+"T10:00:00",time:"10:00",ver:1},
    {videoId:"8",reused:true,by:"小葵",at:T0+"T10:05:00",time:"16:00",ver:2}]};
  as("Regina","manager"); writes=[];
  await moveReuse("8", D(2), D(5), 1);     // 指名搬第 2 版
  await new Promise(r=>setTimeout(r,60));
  ok("指名搬第 2 版，搬過去的就是第 2 版", dfVerOf(lastSlot())===2); }
{ reset([d_("8")]);
  STATE.schedule[D(2)]={slots:[
    {videoId:"8",reused:true,by:"泓儒",at:T0+"T10:00:00",time:"10:00",ver:1},
    {videoId:"8",reused:true,by:"小葵",at:T0+"T10:05:00",time:"16:00",ver:2}]};
  as("Regina","manager"); writes=[];
  await moveReuse("8", D(2), D(5), 0);     // 指名搬原片
  await new Promise(r=>setTimeout(r,60));
  ok("指名搬原片，搬過去的就是原片", dfVerOf(lastSlot())===1); }
// 搬到別天版本號要跟著走 —— 漏掉的話搬完就分不出是哪一版了
{ reset([d_("8")]);
  STATE.schedule[D(2)]={slots:[{videoId:"8",reused:true,by:"泓儒",at:T0+"T10:00:00",time:"16:00",ver:3}]};
  as("Regina","manager"); writes=[];
  await moveReuse("8", D(2), D(5));
  await new Promise(r=>setTimeout(r,60));
  const slot=lastSlot();
  ok("搬到別天之後版本號還是 3", !!slot && dfVerOf(slot)===3); }
// 版本選單只在真的做過二創時才出現
{ reset([d_("8",{remakes:[{id:"R1",by:"泓儒",at:T0+"T10:00:00"}]}), d_("9"), a_("1")]);
  as("Regina","manager"); modalHTML=""; openDay(D(3));
  ok("排片選單裡有版本欄位的容器", modalHTML.includes('id="od_ver"'));
  ok("預設是收起來的（沒選到有二創的片就不該出現）", /id="od_ver" style="display:none"/.test(modalHTML)); }

// ══════════ ⑥c 燈號：不能對大流要求它本來就沒有的東西 ══════════
// 大流放的是成品，沒有毛片這一步。標「缺毛片」就是又一個永遠熄不掉的紅字
// （跟 v136 修掉的「缺上片連結」同一類病）。
{ const full=d_("8",{driveFolder:"http://d",videoCopy:"有文案"});
  ok("齊全的大流片完全不長燈號", missingPill(full)==="");
  ok("大流不標「缺毛片」（它本來就不用拍）", !missingPill(d_("9",{rawLink:"",driveFolder:"http://d",videoCopy:"有"})).includes("缺毛片"));
  ok("大流不標「沒排日期」（還沒排是正常的，不是缺漏）", !missingPill(d_("9",{scheduledDate:null,driveFolder:"http://d",videoCopy:"有"})).includes("沒排日期"));
  ok("大流不標「缺上片連結」", !missingPill(d_("9",{driveFolder:"http://d",videoCopy:"有",scheduledDate:D(-3)})).includes("缺上片連結"));
  ok("大流沒填存檔連結要標出來（那是它真的該有的）",
     missingPill(d_("9",{driveFolder:"",videoCopy:"有"})).includes("缺存檔連結"));
  ok("大流沒填文案也要標出來", missingPill(d_("9",{driveFolder:"http://d",videoCopy:""})).includes("缺文案"));
  ok("影片庫A 照樣會標缺毛片（沒有連坐改壞）", missingPill(a_("1",{rawLink:""})).includes("缺毛片")); }

// ══════════ ⑦ 權限：海外看不到大流 ══════════
{ reset([d_("8")]);
  as("管理員","boss");   ok("管理員看得到影片庫大流", myTabs().some(t=>t[0]==="videosDF"));
  as("Regina","manager"); ok("經理人看得到", myTabs().some(t=>t[0]==="videosDF"));
  as("小葵","editor");    ok("剪輯看得到（他們要做二創）", myTabs().some(t=>t[0]==="videosDF"));
  as("Anna","intl");      ok("海外看不到（海外不做大流）", !myTabs().some(t=>t[0]==="videosDF"));
  ok("海外就算硬連進來也只看到說明、不會炸", typeof viewVideosDF()==="string"); }

// ══════════ ⑧ 唯讀防線：員工視角下不能加片也不能做二創 ══════════
{ reset([d_("8")]); as("管理員","boss"); VIEW_AS="小葵";
  writes=[]; dfAdd();    ok("員工視角下不能加片", writes.length===0);
  writes=[]; dfRemake("8"); ok("員工視角下不能做二創", writes.length===0);
  writes=[]; dfEdit("8");   ok("員工視角下不能編輯", writes.length===0);
  VIEW_AS=null; }

// ══════════ ⑨ 品牌切片還是有效（大流也是各家分開的）══════════
{ reset([d_("8"), Object.assign(d_("9"),{brand:"care"})]);
  ok("目前這家只看得到自己的大流片", (STATE.videosDF||[]).length===1 && (STATE.videosDF||[])[0].id==="8"); }

// ══════════ ⑩ 原始碼：生產面不准偷用 allLibVideos ══════════
{ const CODE=APP.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n");
  const uses=(CODE.match(/allLibVideos\(\)/g)||[]).length;
  ok("allLibVideos 只用在少數幾個出片面的地方（現在 "+uses+" 處）", uses<=5);
  ok("decorate 有把大流抽出去", /st\.videosDF=st\.videos\.filter\(isDF\)/.test(CODE));
  ok("抽出去之後 STATE.videos 真的只剩 A", /st\.videos=st\.videos\.filter\(v=>!isDF\(v\)\)/.test(CODE)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
