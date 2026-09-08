// v161：「拍了沒」不再用資料夾去猜，改成一個明確的動作。
//
// 病因（使用者自己講的）：流程改了 —— **寫腳本的人現在會先把資料夾開好**，
// 為的是後面剪輯統一存同一個地方。資料夾從此是「東西要放哪裡」，
// 不再是「東西已經在了」。而 v145 把毛片連結與存檔資料夾併成一格之後，
// 「拍了沒」是看那一格有沒有值 —— 於是還沒開拍的腳本整批被算成已拍，跑到待剪。
//
// 正式資料實測（2026-09-08）：
//   240 支「待處理、非二創」的片
//      32 支 有毛片連結（真的拍了）→ 待剪 ✔
//      51 支 只有資料夾、沒有毛片連結 → 被誤判成待剪 ⚠️（其中 27 支是併欄之後才建的）
//     157 支 兩個都沒有 → 未拍 ✔
//   把資料夾拿掉之後，待認領池 83 → 35 支，48 支回到「未拍」。
//
// 這不是新規矩，是把被資料夾意外破壞掉的舊規矩修回來 ——
// vidNotShot 當初的用意就寫在它上面：「剪輯認領了也沒東西可剪，所以不放進待認領」。
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
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
const FOLDER="https://drive.google.com/drive/folders/ABC";
const RAW="https://drive.google.com/file/d/RAW";
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"片"+id,videoCopy:"腳本",
  rawLink:"",lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  claimedAt:"",finishedAt:"",durationMin:0,publishedLink:"",driveFolder:"",reviewStatus:"",
  locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],tags:[],
  products:[],usageHistory:[],metrics:[],deleted:false,source:"官方IP",shotAt:"",shotBy:""},o||{});
let WRITES=[], LOGS=[];
function reset(videos, who, role){
  WRITES=[]; LOGS=[]; modalHTML=""; viewEl.innerHTML=""; VIEW_AS=null; BRAND="";
  VID_VIEW="raw"; VID_MODE="list"; POOL_FILTER="all"; POOL_Q=""; VID_Q=""; FOLD_OPEN={};
  global.window.DB={ set:async(c,id,p)=>{ if(c==="logs") LOGS.push(p); },
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{},
    update:async(c,id,p)=>{ WRITES.push({c,id,p}); }, videosWatched:()=>true,
    netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"管理員",role:"boss"},{name:"泓儒",role:"editor"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"tiktok-EN"}],shopeeAccounts:["蝦皮店A"],msAccounts:[],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"小葵"); localStorage.setItem("ecdr_role", role||"editor");
}

// ══════════ ① 核心：資料夾不再等於「已拍」 ══════════
{ reset([ v_("空"),
          v_("只有資料夾",{driveFolder:FOLDER}),
          v_("有毛片連結",{rawLink:RAW}),
          v_("按過拍好了",{driveFolder:FOLDER, shotAt:"2026-09-08T10:00:00", shotBy:"泓儒"}),
          v_("有人在剪",{driveFolder:FOLDER, claimedBy:"小葵", stage:"剪輯中"}),
          v_("已上片",{stage:"已上片", published:true, publishedLink:"http://p"}) ]);
  ok("什麼都沒有 → 未拍", vidNotShot(vid("空")));
  ok("**只有資料夾（腳本階段先開好的）→ 還是未拍**", vidNotShot(vid("只有資料夾")));
  ok("有毛片連結（舊資料）→ 已拍", !vidNotShot(vid("有毛片連結")));
  ok("按過「毛片已上傳」→ 已拍", !vidNotShot(vid("按過拍好了")));
  ok("已經有人認領 → 已拍（剪輯不會去認領沒東西剪的片）", !vidNotShot(vid("有人在剪")));
  ok("已上片 → 已拍（都播出去了）", !vidNotShot(vid("已上片"))); }

// 二創殼本來就沒有自己的毛片
{ reset([ v_("SRC",{driveFolder:FOLDER, stage:"已上片", published:true, publishedLink:"http://p"}),
          v_("SHELL",{locale:"en", sourceVideoId:"SRC", account:"tiktok-EN"}) ]);
  ok("二創殼一律算已拍（素材來自源片）", !vidNotShot(vid("SHELL"))); }

// 「有沒有連結可以打開」是另一個問題，沒有被動到
{ reset([ v_("F",{driveFolder:FOLDER}) ]);
  ok("只有資料夾 → 還是打得開（位置沒變）", vidHasRaw(vid("F")) && vidRawLink(vid("F"))===FOLDER);
  ok("——但那不代表拍了", vidNotShot(vid("F")));
  ok("兩件事現在是分開的兩個函式", typeof vidShot==="function" && typeof vidHasRaw==="function"); }

// ══════════ ② 連帶：待認領池、毛片存量、缺毛片燈號 ══════════
{ reset([ v_("腳本",{driveFolder:FOLDER}), v_("拍好",{driveFolder:FOLDER, shotAt:"2026-09-08T10:00:00"}) ]);
  const ids=poolAll().map(v=>v.id);
  ok("待認領池：只有資料夾的不進來（認領了也沒東西剪）", !ids.includes("腳本"), ids);
  ok("待認領池：按過拍好了的才進來", ids.includes("拍好"), ids);
  const st=rawStock().map(v=>v.id);
  ok("毛片存量：只有資料夾的不算（不然老闆會以為存量夠而不去拍）", !st.includes("腳本"), st);
  ok("毛片存量：拍好的才算", st.includes("拍好"), st);
  ok("缺毛片燈號：只有資料夾的照樣亮", vidMissing(vid("腳本")).map(x=>x.k).includes("raw"));
  ok("缺毛片燈號：拍好的不亮", !vidMissing(vid("拍好")).map(x=>x.k).includes("raw")); }

// 影片庫分段：只有資料夾的歸「未拍」
{ reset([ v_("腳本",{driveFolder:FOLDER}), v_("腳本有排",{driveFolder:FOLDER, scheduledDate:FROZEN}),
          v_("拍好",{driveFolder:FOLDER, shotAt:"2026-09-08T10:00:00"}) ]);
  ok("只有資料夾、沒排日期 → 未拍・未排程", vidSegment(vid("腳本"))==="scriptNoSched", vidSegment(vid("腳本")));
  ok("只有資料夾、有排日期 → 未拍・已排程", vidSegment(vid("腳本有排"))==="scriptSched");
  ok("拍好了 → 待剪", vidSegment(vid("拍好"))==="rawNoSched", vidSegment(vid("拍好"))); }

// ══════════ ③ 「毛片已上傳」那顆鈕 ══════════
// ⚠️ 按鈕上的字要盯死：老闆指名要寫「已上傳」不是「拍好了」——
//    對剪輯來說重點是檔案進資料夾了沒，不是攝影機關了沒。
{ reset([ v_("A",{driveFolder:FOLDER}) ]);
  const b=shotBtn(vid("A"));
  ok("未拍的片有「毛片已上傳」鈕", /毛片已上傳/.test(b), b.slice(0,120));
  ok("按鈕不可以再寫「拍好了」", !/拍好了/.test(b), b.slice(0,120));
  ok("按鈕會呼叫 markShot 並帶對 id", /markShot\('A'\)/.test(b));
  ok("按鈕有擋掉冒泡（不然會連編輯視窗一起彈出來）", /event\.stopPropagation\(\)/.test(b));
  ok("按鈕有寫清楚按了會怎樣", /待剪/.test(b)); }

{ reset([ v_("B",{driveFolder:FOLDER, shotAt:"2026-09-08T10:00:00", shotBy:"泓儒"}) ]);
  const b=shotBtn(vid("B"));
  ok("按過的片改成給「還沒上傳」的收回鍵", /還沒上傳/.test(b) && /unmarkShot\('B'\)/.test(b), b.slice(0,140));
  ok("收回鍵也擋掉冒泡", /event\.stopPropagation\(\)/.test(b));
  ok("滑過去看得到是誰標的", /泓儒/.test(b)); }

// 不是靠這顆鈕進來的就不要給收回鍵（免得畫面一堆按鈕）
{ reset([ v_("C",{rawLink:RAW}), v_("D",{claimedBy:"小葵", stage:"剪輯中"}),
          v_("E",{locale:"en", sourceVideoId:"C", account:"tiktok-EN"}) ]);
  ok("有毛片連結的不給收回鍵", shotBtn(vid("C"))==="");
  ok("已經有人在剪的不給收回鍵", shotBtn(vid("D"))==="");
  ok("二創殼完全不出現這顆鈕（它沒有自己的毛片）", shotBtn(vid("E"))===""); }

// ⚠️ 上面那條在正常資料下驗不到 shotBtn 裡的 isVersion 早退 —— 二創殼本來就
//    vidShot=true、shotAt 又是空的，兩條路都會走到 return ""。
//    要驗到它，得餵一個「被誤寫了 shotAt 的二創殼」（髒資料）。
//    突變測試「二創殼也長出那顆鈕」原本 0 紅，就是這樣抓到的。
{ reset([ v_("SRC2",{rawLink:RAW}),
          v_("髒殼",{locale:"en", sourceVideoId:"SRC2", account:"tiktok-EN",
                    shotAt:"2026-09-08T10:00:00", shotBy:"誰"}) ]);
  ok("二創殼就算被誤寫了 shotAt，也不長出收回鍵", shotBtn(vid("髒殼"))==="", shotBtn(vid("髒殼")).slice(0,80)); }

// 寫進去的東西
(async()=>{
{ reset([ v_("A",{driveFolder:FOLDER}) ], "泓儒","editor");
  markShot("A");
  await new Promise(r=>setTimeout(r,10));
  const w=WRITES.find(x=>x.c==="videos" && x.id==="A");
  ok("按下去會寫 videos", !!w, WRITES);
  ok("記下什麼時候", w && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(String(w.p.shotAt||"")), w&&w.p);
  ok("記下是誰按的", w && w.p.shotBy==="泓儒", w&&w.p);
  ok("只動這三個欄位，別的不碰", w && Object.keys(w.p).sort().join(",")==="shotAt,shotBy,updatedAt", w&&Object.keys(w.p));
  // 操作紀錄上的字要跟按鈕一致，不然老闆事後翻紀錄會看到兩套講法
  ok("操作紀錄寫「標記毛片已上傳」", LOGS.some(l=>l.action==="標記毛片已上傳"), LOGS.map(l=>l.action)); }

{ reset([ v_("B",{shotAt:"2026-09-08T10:00:00", shotBy:"泓儒"}) ], "小葵","editor");
  unmarkShot("B");
  await new Promise(r=>setTimeout(r,10));
  const w=WRITES.find(x=>x.c==="videos" && x.id==="B");
  ok("收回時把兩個欄位清掉", w && w.p.shotAt==="" && w.p.shotBy==="", w&&w.p);
  ok("操作紀錄寫「取消「毛片已上傳」」", LOGS.some(l=>l.action==="取消「毛片已上傳」"), LOGS.map(l=>l.action)); }

// 誰都能按 —— 這是事實不是權限
{ for(const [who,role] of [["小葵","editor"],["管理員","boss"],["泓儒","editor"]]){
    reset([ v_("A",{driveFolder:FOLDER}) ], who, role);
    markShot("A");
    await new Promise(r=>setTimeout(r,10));
    ok(role+" 按得到", WRITES.some(x=>x.id==="A"), {who,role,WRITES}); } }

// 但員工視角（唯讀預覽）底下不准寫
{ reset([ v_("A",{driveFolder:FOLDER}) ], "管理員","boss");
  VIEW_AS="小葵";
  markShot("A"); unmarkShot("A");
  await new Promise(r=>setTimeout(r,10));
  ok("員工視角底下一筆都不准寫", WRITES.length===0, WRITES);
  VIEW_AS=null; }

// ══════════ ④ 兩種檢視都要看得到那顆鈕 ══════════
{ reset([ v_("A",{driveFolder:FOLDER}) ], "小葵","editor");
  VID_MODE="list";
  ok("清單檢視有那顆鈕", /markShot\('A'\)/.test(vidTableRow(vid("A"))));
  VID_MODE="grid";
  ok("圖片檢視也有（不然切到圖片就按不到）", /markShot\('A'\)/.test(vidCardHTML(vid("A")))); }

// ══════════ ⑤ 手機上按得到（老闆回報「沒有看到按鈕」就是踩這個）══════════
// 手機版影片庫只留片名那一格，其他 td 全被 CSS 收起來 —— 按鈕在「狀態」那一格，
// 於是桌機看得到、手機整個消失。有按鈕的那一格要掛 has-act 讓 CSS 留下它。
{ reset([ v_("未拍的",{driveFolder:FOLDER}),
          v_("在剪的",{claimedBy:"小葵", stage:"剪輯中"}) ], "小葵","editor");
  const a=vidTableRow(vid("未拍的")), b2=vidTableRow(vid("在剪的"));
  ok("有按鈕的那一列，狀態欄掛 has-act（手機才留得住）", /class="has-act"/.test(a), a.slice(-260));
  ok("沒按鈕的列不掛（不然手機卡片會被灰標籤灌爆）", !/has-act/.test(b2), b2.slice(-200));
  ok("has-act 掛在放按鈕的那一格上", /class="has-act"[^>]*>[\s\S]*markShot/.test(a)); }

{ const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  ok("手機版確實有那條「只留片名」的規則（不然上面這件事就沒意義）",
     /table\.vtable\.responsive td:not\(\.cv-name\)\{display:none\}/.test(HTML));
  ok("CSS 有把 has-act 那一格放行", /table\.vtable\.responsive td\.has-act\{display:flex\}/.test(HTML));
  ok("放行規則要排在隱藏規則後面，不然被蓋掉",
     HTML.indexOf("td.has-act{display:flex}") > HTML.indexOf("td:not(.cv-name){display:none}")); }

// ══════════ ⑥ 不會壞掉 ══════════
{ reset([]);
  ok("空的影片不會爆", shotBtn(null)==="" && shotBtn(undefined)==="");
  ok("vidShot 對空的回 false", vidShot(null)===false);
  let threw=false; try{ vidNotShot({}); }catch(e){ threw=true; }
  ok("欄位全缺的物件不會爆", !threw); }

console.log(`\nv161（拍了沒不再用資料夾猜）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
