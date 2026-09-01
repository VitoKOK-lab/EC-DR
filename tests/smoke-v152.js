// v152：「剪輯成效」—— 管理員與人資查得到每個剪輯做完什麼、審過沒、檔案在哪。
//
// 起因是兩件事撞在一起：
//   ① 你要一個地方能分人看完成狀況，而且**審過之後直接點進資料夾看成片**。
//   ② 查正式資料時發現：人資／行銷／客服／出貨的團隊看板上，剪輯的產量全部是 0。
//      不是空白 —— 是假數字。同一天管理員看到「本月完成 168」，他們看到 0。
//      原因是那四個職位不下載影片資料（v138 的效能修正），但畫面照畫。
//      而 smoke-v139 當時那段「有沒有影片資料畫出來一樣」的比對是**空轉**的
//      （樣本影片沒有 editor、完成日也不在當月，兩邊都算 0）。
//
// 所以分兩邊處理：
//   人資 → 移出 NO_VIDEO_ROLES（他真的要用），並且給他新分頁。
//   行銷／客服／出貨 → 照舊不下載，但團隊看板上算不出來的欄位與圖表**不畫**。
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
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
// ⚠️ 把「今天」凍在月中（v160）。
//    這支測試的樣本用相對日期（D(-8) 之類），而程式是**按月**分組的 ——
//    真的在月初跑的時候，「8 天前」會掉到上個月，測試就整批變紅。
//    實際發生過：2026-09-01 那天 main 上這幾支全紅，但程式沒有任何問題。
//    所以把 today 凍在 15 號：相對日期不會跨月，測試哪一天跑結果都一樣。
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+String(+FROZEN.slice(8,10)-1).padStart(2,"0");
refreshToday();


const D=(n)=>new Date(new Date(FROZEN+"T12:00:00Z").getTime()+n*864e5).toISOString().slice(0,10);
const THIS=D(0).slice(0,7);
const FAM="https://drive.google.com/drive/folders/FAM-1";
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"片"+id,videoCopy:"文案",
  nameEn:"",videoCopyEn:"",rawLink:"http://raw",lib:"",stage:"已完成",editor:"",claimedBy:"",
  assignedTo:"",scheduledDate:null,claimedAt:D(-2)+"T09:00:00",finishedAt:D(0)+"T18:00:00",
  durationMin:90,publishedLink:"",driveFolder:"",reviewStatus:"",locale:"",channel:"",origLang:"",
  account:"",sourceVideoId:"",cover:"",remakes:[],tags:[],products:[],usageHistory:[],metrics:[]},o||{});
const USERS=[{name:"小葵",role:"editor"},{name:"阿哲",role:"editor"},{name:"管理員",role:"boss"},
             {name:"HR小姐",role:"hr"},{name:"Regina",role:"manager"},{name:"麗君",role:"cs"},
             {name:"Anna",role:"intl"}];
function reset(videos, who, role){
  modalHTML=""; viewEl.innerHTML=""; fields={}; OUT_FILTER="all"; OUT_WHO=""; TEAM_YM=null; VIEW_AS=null; BRAND="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}),
    loadShiftMonth:async()=>{} };
  const raw={ users:USERS.slice(),
    settings:{dailyTarget:4,videoTags:["新片"],sources:["自製"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"tiktok-EN"}],shopeeAccounts:["蝦皮店A"],msAccounts:[],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"管理員"); localStorage.setItem("ecdr_role", role||"boss");
}
// 篩選鈕的文字（全部／審過／還沒審／退回／缺資料夾）與最上面的說明句，
// 跟卡片裡的文字用的是同一批詞 —— 驗卡片內容一定要先把上面那段切掉，
// 不然「只看審過的」會因為篩選鈕上寫著「還沒審」而誤判成沒篩掉。
// v158：點進某個人之後畫面上有兩張卡 —— 上面那張是「回到全部＋篩選鈕」，
// 下面那張才是影片清單。篩選鈕上寫著「還沒審／退回」，所以驗清單內容要從
// **最後一張**卡切起，不然又會被篩選鈕的字誤導（第一版就是這樣紅的）。
const cards=(h)=>{ const i=h.lastIndexOf('<div class="card">'); return i<0?"":h.slice(i); };
// 真正的資料夾連結有幾個（用 rel 數，說明文字裡的「開資料夾」四個字不算）
const nDrive=(h)=>(h.match(/rel="noopener noreferrer"/g)||[]).length;
let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }

// 這個月：小葵 4 支（2 審過有資料夾、1 審過沒資料夾、1 還沒審）、阿哲 2 支（1 退回、1 審過）
const SET=()=>[
  v_("A1",{editor:"小葵", reviewStatus:"通過", driveFolder:FAM}),
  v_("A2",{editor:"小葵", reviewStatus:"通過", driveFolder:FAM+"-2"}),
  v_("A3",{editor:"小葵", reviewStatus:"通過", driveFolder:""}),      // 審過但沒資料夾
  v_("A4",{editor:"小葵", reviewStatus:"",     driveFolder:FAM+"-4"}),// 還沒審
  v_("B1",{editor:"阿哲", reviewStatus:"退回", driveFolder:FAM+"-5"}),
  v_("B2",{editor:"阿哲", reviewStatus:"通過", driveFolder:FAM+"-6"}),
  v_("OLD",{editor:"小葵", reviewStatus:"通過", driveFolder:FAM, finishedAt:D(-60)+"T10:00:00"}), // 上上個月
  v_("WIP",{editor:"小葵", stage:"剪輯中", finishedAt:""}),           // 還沒完成，不該出現
  // 有完成日、階段卻是「剪輯中」的怪紀錄。正式資料現在一筆都沒有（查過），
  // 但「完成」的定義全站是同一條（isPublished），這裡不能自己放寬 ——
  // 放寬的話一支退回重剪的片會同時算進「完成」跟「進行中」，兩邊數字對不起來。
  v_("HALF",{editor:"小葵", stage:"剪輯中", finishedAt:D(0)+"T18:00:00"}),
];

// ══════════ ① 誰看得到這一頁 ══════════
{ reset(SET(), "管理員","boss");
  ok("管理員的分頁有「剪輯成效」", myTabs().some(t=>t[0]==="output"));
  reset(SET(), "HR小姐","hr");
  ok("人資的分頁有「剪輯成效」", myTabs().some(t=>t[0]==="output"));
  reset(SET(), "小葵","editor");
  ok("剪輯看不到這一頁", !myTabs().some(t=>t[0]==="output"));
  reset(SET(), "Regina","manager");
  ok("經理人看不到這一頁（你說只有人資跟管理員）", !myTabs().some(t=>t[0]==="output"));
  reset(SET(), "麗君","cs");
  ok("客服看不到這一頁", !myTabs().some(t=>t[0]==="output"));
  reset(SET(), "Anna","intl");
  ok("海外看不到這一頁", !myTabs().some(t=>t[0]==="output")); }

// 就算有人硬把分頁切過去，畫面本身也要擋（不能只靠分頁列藏起來）
{ reset(SET(), "小葵","editor");
  const h=viewOutput();
  ok("剪輯硬切過去也看不到內容", /只有管理員與人資/.test(h) && !/開資料夾/.test(h), h.slice(0,160));
  reset(SET(), "Regina","manager");
  ok("經理人硬切過去也看不到內容", /只有管理員與人資/.test(viewOutput())); }

// ══════════ ② 分人：每個人這個月做完幾支、審到哪 ══════════
{ reset(SET(), "管理員","boss");
  const h=viewOutput();
  ok("列出小葵", h.includes("小葵"));
  ok("列出阿哲", h.includes("阿哲"));
  ok("不列不剪片的人（客服）", !h.includes("麗君"));
  ok("不列管理層自己", !h.includes("HR小姐") && !h.includes("Regina"));
  // v158：第一層改成「一個人一列」的名單，數字在列上，點下去才進他的清單
  ok("小葵那一列可以點進去", /onclick="outPick\('小葵'\)"/.test(h), h.slice(0,200));
  ok("阿哲那一列可以點進去", /onclick="outPick\('阿哲'\)"/.test(h));
  ok("小葵這個月完成 4 支（上上個月那支不算、還在剪的不算）", /審過 3/.test(h) && /還沒審 1/.test(h), h.match(/完成 \d+ 支/g));
  ok("阿哲：退回 1", /退回 1/.test(h));
  ok("標出缺資料夾的支數", /缺資料夾 1/.test(h));
  ok("總計是六支（兩個人加起來）", /完成 6 支/.test(h), h.match(/完成 \d+ 支/g));
  ok("名單這一層不會列出影片（那是點進去才看的）", !h.includes("片A1") && !h.includes("片B1"));
  ok("還在剪的那支不會被算進去", !h.includes("片WIP"));
  ok("有完成日但階段還是「剪輯中」的，不算完成", !h.includes("片HALF"));
  ok("上上個月那支不會被算進去", !h.includes("片OLD")); }

// 點進某個人 → 他這個月的清單
{ reset(SET(), "管理員","boss");
  outPick("小葵");
  const h=viewOutput();
  ok("點進去之後：看得到他的名字", h.includes("小葵"));
  ok("點進去之後：有「回到全部」可以退出來", /onclick="outBackAll\(\)"/.test(h));
  ok("點進去之後：預設就停在「審過」（主管與人資要檢查的就是這些）", OUT_FILTER==="ok");
  ok("點進去之後：只列他的片，不列別人的", h.includes("片A1") && !h.includes("片B1"));
  outBackAll();
  ok("退出來之後回到名單", OUT_WHO==="" && /onclick="outPick/.test(viewOutput())); }

// ══════════ ③ 重點：審過之後直接點得進資料夾 ══════════
{ reset(SET(), "管理員","boss");
  outPick("小葵"); OUT_FILTER="all";      // 點進小葵，看他全部四支
  const h=viewOutput();
  ok("有「開資料夾」的連結", h.includes("開資料夾"));
  ok("連結指到真的資料夾網址", h.includes(FAM));
  ok("開新分頁", /href="[^"]*FAM-1"[^>]*target="_blank"/.test(h), h.slice(h.indexOf("FAM-1")-120, h.indexOf("FAM-1")+120));
  ok("外部連結有帶 rel=noopener", /href="[^"]*FAM-1"[^>]*rel="noopener noreferrer"/.test(h));
  ok("小葵四支裡有資料夾的三支都給得出連結（缺的那支不給）", nDrive(h)===3, nDrive(h));
  ok("沒有資料夾的那支寫清楚是沒有，不是給一個點不開的連結",
     h.includes("沒有存檔資料夾") && !/href="">/.test(h)); }

// 二創版本沒有自己的資料夾時，要沿用源片那一個（家族只有一個資料夾，v142）
{ reset([ v_("SRC",{editor:"小葵", reviewStatus:"通過", driveFolder:FAM, stage:"已上片"}),
          v_("SHELL",{editor:"小葵", reviewStatus:"通過", driveFolder:"", locale:"en",
                      sourceVideoId:"SRC", account:"tiktok-EN"}) ], "管理員","boss");
  outPick("小葵"); OUT_FILTER="all";
  const h=viewOutput();
  ok("二創版本也列進他的完成量", h.includes("完成 2 支"));
  ok("二創版本沿用源片的資料夾（不會被當成缺資料夾）",
     nDrive(h)===2 && !/缺資料夾 \d+/.test(h), {n:nDrive(h), pill:h.match(/缺資料夾 \d+/g)}); }

// ══════════ ④ 篩選：只看審過的／只看缺資料夾的 ══════════
{ reset(SET(), "管理員","boss");
  ok("名單那一層沒有篩選鈕（那是點進去之後的事）", !/vtab-n/.test(viewOutput()));
  outPick("小葵"); OUT_FILTER="all";
  ok("點進去之後才有篩選鈕", /vtab-n/.test(viewOutput()));
  const h0=viewOutput();
  // v158：篩選鈕的數字改成「這個人的」，不是全部人加起來 —— 點進來就是在看他
  // v159：第一格改叫「完成」不叫「全部」—— 最後多了一格「還在剪」，
  //       那是**另一批**片（這個月認領但沒做完），不含在前面那個數字裡。
  ok("篩選鈕：小葵完成 4", /完成<\/span> <span class="vtab-n">4</.test(h0), h0.match(/vtab-n">\d+</g));
  ok("篩選鈕：小葵還在剪 2（跟完成的 4 支是兩批）",
     /還在剪<\/span> <span class="vtab-n">2</.test(h0), h0.match(/vtab-n">\d+</g));
  ok("篩選鈕：小葵審過 3", /審過<\/span> <span class="vtab-n">3</.test(h0), h0.match(/vtab-n">\d+</g));
  ok("篩選鈕：小葵缺資料夾 1", /缺資料夾<\/span> <span class="vtab-n">1</.test(h0));
  setOutFilter("ok");
  const h1=viewOutput();
  ok("只看審過的：退回那支不見了", !/退回<\/span>/.test(cards(h1)), cards(h1).slice(0,120));
  ok("只看審過的：還沒審那支也不見了", !/還沒審<\/span>/.test(cards(h1)));
  ok("只看審過的：小葵審過的三支都還在", (cards(h1).match(/審過<\/span>/g)||[]).length===3);
  setOutFilter("nodrive");
  const h2=viewOutput();
  ok("只看缺資料夾的：一個資料夾連結都不該有", nDrive(h2)===0, nDrive(h2));
  setOutFilter("nodrive");   // 再按一次＝取消
  ok("同一個篩選再按一次就取消", OUT_FILTER==="all");
  setOutFilter("all"); outBackAll(); }

// ══════════ ⑤ 月份可以往前翻 ══════════
{ reset(SET(), "管理員","boss");
  ok("有月份下拉", /teamSetYM/.test(viewOutput()));
  ok("預設是本月", /本月剪輯成效/.test(viewOutput()));
  const prevYM=D(-60).slice(0,7);
  TEAM_YM=prevYM;
  const h=viewOutput();
  ok("翻到上上個月：標題不再說「本月」", !/本月剪輯成效/.test(h) && /剪輯成效/.test(h));
  ok("翻到上上個月：看到的是那個月的那一支", /完成 1 支/.test(h), h.match(/完成 \d+ 支/g));
  ok("翻月份的時候還是停在名單那一層", /onclick="outPick/.test(h));
  TEAM_YM=null; }

// ══════════ ⑥ 人資是唯讀的：看得到，但不能改 ══════════
{ reset(SET(), "HR小姐","hr");
  outPick("小葵");
  const h=viewOutput();
  ok("人資點得進去，而且看得到資料夾連結", h.includes("小葵") && h.includes("開資料夾"));
  ok("人資點不開影片編輯視窗", !/editVideo\(/.test(h) && !/openVideoModal\(/.test(h));
  reset(SET(), "管理員","boss");
  outPick("小葵");
  ok("管理員點得開影片", /editVideo\(|openIntlModal\(|openChModal\(/.test(viewOutput())); }

// 整頁不寫任何資料
{ reset(SET(), "管理員","boss");
  const listH=viewOutput(); outPick("小葵"); const detailH=viewOutput();
  ok("這一頁不會寫資料庫（兩層都沒有任何寫入的呼叫）",
     !/dbUpdate\(|dbSet\(|saveVideo\(|reviewVid\(|delVid\(/.test(listH+detailH)); }

// ══════════ ⑦ 人資要拿得到影片資料，不然這一頁全是空的 ══════════
{ ok("needVideos('hr')＝要下載", needVideos("hr")===true);
  const FB=fs.readFileSync(path.join(__dirname,"..","fb.js"),"utf8");
  const m=FB.match(/const NO_VIDEO_ROLES\s*=\s*\[([^\]]*)\]/);
  const fbList=m?m[1].split(",").map(s=>s.trim().replace(/["']/g,"")).filter(Boolean):null;
  ok("fb.js 的清單跟 app.js 一致（不然人資照樣不會下載）",
     JSON.stringify(fbList)===JSON.stringify(NO_VIDEO_ROLES), {fbList, app:NO_VIDEO_ROLES});
  ok("人資已經不在不下載的清單裡", NO_VIDEO_ROLES.indexOf("hr")<0);
  ok("行銷／客服／出貨還是不下載",
     ["mkt","svc","ship","cs"].every(r=>NO_VIDEO_ROLES.includes(r))); }

// 影片還在載的時候，不要畫一張「大家都 0 支」的表出來
{ reset(SET(), "HR小姐","hr");
  global.window.DB.videosWatched=()=>false;
  const h=viewOutput();
  ok("影片還沒載完時說「還在載入」，不假裝是 0 支", /還在載入/.test(h) && !/完成 0 支/.test(h), h.slice(0,160));
  global.window.DB.videosWatched=()=>true; }

// ══════════ ⑧ 團隊看板：算不出來的就不要畫成 0 ══════════
{ reset(SET(), "麗君","cs");
  const cs=viewTeam();
  ok("客服的團隊看板：沒有「完成上架」欄", !/完成上架/.test(cs));
  ok("客服的團隊看板：速覽沒有「今日完成」", !/今日完成/.test(cs));
  ok("客服的團隊看板：速覽沒有「本月完成」", !/本月完成/.test(cs));
  ok("客服的團隊看板：沒有熱圖", !/每天完成上片/.test(cs));
  ok("客服的團隊看板：個人卡片上也沒有「今日完成」那一格", !/今日完成/.test(cs));
  ok("客服的團隊看板：出勤與交辦還在", /出勤天數/.test(cs) && /交辦完成/.test(cs));
  ok("客服的團隊看板：不會出現 0 支這種假數字", !/>0<\/div><div class="l">今日完成/.test(cs));

  reset(SET(), "HR小姐","hr");
  const hr=viewTeam();
  ok("人資的團隊看板：看得到「完成上架」", /完成上架/.test(hr));
  ok("人資的團隊看板：看得到熱圖", /每天完成上片/.test(hr));
  ok("人資的團隊看板：數字是真的（小葵 4）", /完成上架">4</.test(hr), hr.match(/完成上架">\d+</g));

  reset(SET(), "管理員","boss");
  const bo=viewTeam();
  ok("管理員的團隊看板：沒有被改掉", /完成上架/.test(bo) && /每天完成上片/.test(bo) && /本月完成/.test(bo)); }

// ══════════ ⑨ 沒有剪輯／沒有影片的時候不要爆掉 ══════════
// ⚠️ 影片一支都沒有的時候 videosLoading() 會回 true（分不出「沒有」跟「還沒載完」，
//    那是它刻意的設計）。所以這裡用「有影片、但這個月沒人完成」來驗空狀態。
{ reset([ v_("OLD2",{editor:"小葵", finishedAt:D(-60)+"T10:00:00"}) ], "管理員","boss");
  const h=viewOutput();
  ok("這個月沒人完成時，名單還是畫得出來（不是空白也不是壞掉）",
     h.includes("剪輯成效") && /onclick="outPick/.test(h), h.slice(0,200));
  outPick("小葵");
  ok("點進沒有產出的人，講清楚是這個月沒有", viewOutput().includes("這個月還沒有完成的影片"));
  outBackAll();
  const raw={ users:[{name:"管理員",role:"boss"}], settings:{reviewSince:"2020-01-01",videoTags:[],sources:[],
    postPlatforms:[],intlAccounts:[],shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[]},
    schedule:{},tasks:{},shifts:{},logs:[],deletedVideos:[],videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
  ok("一個剪輯都沒有時畫得出來", /還沒有剪輯成員/.test(viewOutput())); }

// ══════════ ⑩ 產量高的人不要把整頁撐爆 ══════════
{ const many=[]; for(let i=0;i<30;i++) many.push(v_("M"+i,{editor:"小葵", reviewStatus:"通過", driveFolder:FAM+"-"+i}));
  reset(many.concat([v_("S1",{editor:"阿哲", reviewStatus:"通過", driveFolder:FAM})]), "管理員","boss");
  outPick("小葵"); OUT_FILTER="all";
  const h=viewOutput();
  ok("30 支的人：清單裝進自己的捲動框（不然一頁捲不完，也看不到下面還有誰）",
     /class="keepscroll" style="max-height:340px;overflow-y:auto/.test(h));
  // keepscroll 沒有 id 就接不回捲動位置（見 render 的 keepScroll）——
  // 背景一同步就把正在翻的人彈回最上面。
  ok("捲動框有 id，背景同步不會把人彈回最上面", /id="out_[a-z0-9]+" class="keepscroll"/.test(h),
     (h.match(/id="out_[^"]*"/g)||[]).slice(0,3));
  ok("30 支的人：30 列一列都沒少（是捲動不是截斷）",
     (h.match(/data-label="審核"/g)||[]).length===30, (h.match(/data-label="審核"/g)||[]).length);
  outPick("阿哲"); OUT_FILTER="all";
  ok("只有 1 支的人不用捲動框", !/keepscroll/.test(viewOutput())); }

console.log(`\nv152: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
