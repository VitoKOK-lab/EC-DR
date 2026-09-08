// v168：交辦留言可以傳圖片。
//
// 走的是封面上傳那一套現成管線（瀏覽器先壓縮 → 上傳 Firebase Storage → 網址存進留言）。
// ⚠️ 我一開始跟老闆說「這個專案沒有用 Firebase Storage」是錯的 —— 影片封面一直
//    都在用。老闆問「我的影片都可以上傳封面圖片怎麼都 ok？」才把這件事講清楚。
//
// 這一支釘三件事：① 壓縮／上傳／存進留言的流程 ② 只有圖沒有字的留言不能消失
// ③ pic 這個欄位是別人寫得進資料庫的東西，塞進 <img src> 之前要擋 scheme。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const FB=fs.readFileSync(path.join(__dirname,"..","fb.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,files:null,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
const boxes={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(boxes[id]) return boxes[id];
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
// 壓縮要動到 canvas／Image，測試環境沒有 —— 換成假的，只記下有沒有被呼叫
let COMPRESSED=0;
coverCompress=async(file)=>{ COMPRESSED++; return {fake:"blob", size:Math.round(file.size/40)}; };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
const t_=(id,o)=>Object.assign({id,user:"小葵",date:"2026-09-08",title:"做一件事",contact:"",report:"",
  done:false,assignedBy:"管理員",ack:true,createdAt:"2026-09-08T09:00:00",groupId:"",msgs:[]},o||{});
let WRITES=[], UPLOADS=[], TOASTS=[];
function reset(tasks, who, role){
  WRITES=[]; UPLOADS=[]; TOASTS=[]; COMPRESSED=0; VIEW_AS=null;
  for(const k in fields) delete fields[k];
  for(const k in boxes) delete boxes[k];
  global.window.DB={ set:async()=>{}, update:async(c,id,p)=>{WRITES.push([c,id,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{},
    videosWatched:()=>true, netState:()=>({online:true,pending:false}),
    uploadTaskPic:async(taskId,picId,blob)=>{ UPLOADS.push({taskId,picId,blob});
      return "https://firebasestorage.googleapis.com/v0/b/x/o/taskpix%2F"+taskId+"%2F"+picId+".jpg?alt=media&token=abc"; } };
  const map={}; (tasks||[]).forEach(t=>{ map[t.id]=t; });
  const raw={ users:[{name:"小葵",role:"editor"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:map, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"小葵"); localStorage.setItem("ecdr_role", role||"editor");
}
toast=(m)=>{ TOASTS.push(String(m)); };
const pick=(id, file)=>{ const inp=el(); inp.files=[file]; return pickTaskPic(id, inp); };
const img=(sz)=>({type:"image/jpeg", size:sz||3*1024*1024, name:"a.jpg"});

(async()=>{
// ══════════ ① 傳一張圖 ══════════
{ reset([ t_("A") ], "小葵","editor");
  await pick("A", img());
  ok("有壓縮過才上傳（手機直出 3MB，不壓縮流量會爆）", COMPRESSED===1, COMPRESSED);
  ok("上傳到 Storage", UPLOADS.length===1, UPLOADS.length);
  ok("路徑帶交辦 id", UPLOADS[0] && UPLOADS[0].taskId==="A", UPLOADS[0]);
  ok("**每張圖一個不重複的檔名**（固定路徑會互相蓋掉）",
     UPLOADS[0] && /^P/.test(String(UPLOADS[0].picId)) && String(UPLOADS[0].picId).length>8, UPLOADS[0]&&UPLOADS[0].picId);
  const w=WRITES.find(x=>x[0]==="tasks"&&x[1]==="A");
  ok("網址存進留言", w && w[2].msgs.length===1 && /^https:\/\//.test(w[2].msgs[0].pic||""), w&&w[2].msgs);
  ok("記下是誰、什麼時候", w && w[2].msgs[0].by==="小葵" && /^\d{4}-\d\d-\d\dT/.test(w[2].msgs[0].at)); }

// 兩張圖不會互相蓋掉
{ reset([ t_("A") ], "小葵","editor");
  await pick("A", img()); await pick("A", img());
  ok("傳兩張 → 兩個不同的檔名", UPLOADS.length===2 && UPLOADS[0].picId!==UPLOADS[1].picId,
     UPLOADS.map(u=>u.picId)); }

// 圖跟同時打的字會變成同一則留言
{ reset([ t_("A") ], "小葵","editor");
  fields["tm_A"]="這張是廠商給的報價單";
  await pick("A", img());
  const w=WRITES.find(x=>x[0]==="tasks");
  ok("圖跟字合成同一則", w && w[2].msgs.length===1 && w[2].msgs[0].pic && w[2].msgs[0].text==="這張是廠商給的報價單", w&&w[2].msgs[0]); }

// ══════════ ② 只有圖沒有字的留言不能消失 ══════════
{ reset([ t_("A",{msgs:[{at:"2026-09-08T10:00:00",by:"小葵",text:"",pic:"https://x/a.jpg"}]}) ], "小葵","editor");
  ok("**只有圖、沒有字的留言留得住**（只看 text 的話會整則不見）",
     taskMsgs(taskById("A")).length===1, taskMsgs(taskById("A")));
  const h=taskThread(taskById("A"), true);
  ok("畫得出那張圖", /<img class="tmsg-pic" src="https:\/\/x\/a\.jpg"/.test(h), h.slice(0,300));
  ok("點得開原圖", /<a href="https:\/\/x\/a\.jpg"[^>]*target="_blank"/.test(h));
  ok("有 noopener", /rel="noopener/.test(h)); }
{ reset([ t_("A",{msgs:[{at:"2026-09-08T10:00:00",by:"小葵"}]}) ], "小葵","editor");
  ok("既沒字也沒圖的空留言照樣過濾掉", taskMsgs(taskById("A")).length===0); }

// ══════════ ③ pic 是別人寫得進資料庫的欄位，要擋 ══════════
[["javascript:","javascript:alert(1)"],
 ["data: 內嵌","data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
 ["http（不是 https）","http://evil/a.jpg"],
 ["相對路徑","/x/a.jpg"],
 ["空的","" ]].forEach(([name,u])=>{
  reset([ t_("A",{msgs:[{at:"2026-09-08T10:00:00",by:"小葵",text:"看圖",pic:u}]}) ], "小葵","editor");
  const h=taskThread(taskById("A"), true);
  ok("擋下 "+name, !/<img/.test(h), h.slice(0,200));
});
{ reset([ t_("A",{msgs:[{at:"2026-09-08T10:00:00",by:"小葵",text:"看圖",pic:"https://ok/a.jpg"}]}) ], "小葵","editor");
  ok("https 的才畫得出來", /<img/.test(taskThread(taskById("A"), true))); }
{ ok("picSafe 只認 https", picSafe("https://a/b.jpg")===true && picSafe("http://a/b.jpg")===false
    && picSafe("javascript:alert(1)")===false && picSafe(null)===false); }

// ══════════ ④ 擋掉不該傳的檔 ══════════
{ reset([ t_("A") ], "小葵","editor");
  await pick("A", {type:"video/mp4", size:1000, name:"a.mp4"});
  ok("選到影片檔擋下來", UPLOADS.length===0 && TOASTS.some(x=>/圖片檔/.test(x)), TOASTS); }
{ reset([ t_("A") ], "小葵","editor");
  await pick("A", img(20*1024*1024));
  ok("超過 12MB 擋下來", UPLOADS.length===0 && TOASTS.some(x=>/12MB/.test(x)), TOASTS); }
{ reset([ t_("A") ], "小葵","editor"); VIEW_AS="阿明";
  await pick("A", img());
  ok("員工視角（唯讀預覽）底下不准傳", UPLOADS.length===0 && WRITES.length===0, {UPLOADS,WRITES}); VIEW_AS=null; }
{ reset([ t_("A") ], "小葵","editor");
  global.window.DB.uploadTaskPic=undefined;
  await pick("A", img());
  ok("連線還沒就緒時給人看得懂的話，不是默默失敗",
     UPLOADS.length===0 && TOASTS.some(x=>/連線|Not connected/.test(x)), TOASTS); }
{ reset([ t_("A") ], "小葵","editor");
  global.window.DB.uploadTaskPic=async()=>{ throw new Error("網路斷了"); };
  await pick("A", img());
  ok("上傳失敗不會寫出一則沒有圖的空留言", WRITES.length===0, WRITES); }

// ══════════ ⑤ 貼圖不會把「處理狀況」洗掉 ══════════
{ reset([ t_("A",{user:"小葵",report:"原本寫好的完整處理狀況"}) ], "小葵","editor");
  await pick("A", img());
  const w=WRITES.find(x=>x[0]==="tasks");
  ok("**只貼圖不打字，不會動到處理狀況**", w && !("report" in w[2]), w&&Object.keys(w[2])); }
{ reset([ t_("A",{user:"小葵",report:"舊的"}) ], "小葵","editor");
  fields["tm_A"]="我已經跟廠商聯絡好了，明天給報價";
  await pick("A", img());
  const w=WRITES.find(x=>x[0]==="tasks");
  ok("圖＋夠完整的字 → 那段字照樣變成處理狀況",
     w && w[2].report==="我已經跟廠商聯絡好了，明天給報價", w&&w[2].report); }

// ══════════ ⑥ 畫面上有那顆鈕 ══════════
{ reset([ t_("A") ], "小葵","editor");
  const h=taskThread(taskById("A"), true);
  ok("回覆框旁邊有傳圖鈕", /pickTaskPic\('A',this\)/.test(h), h.slice(-320));
  ok("只收圖片檔", /accept="image\/\*"/.test(h));
  ok("提示有講會自動壓縮", /壓縮|compress/i.test(h)); }
{ reset([ t_("A") ], "小葵","editor");
  ok("不能留言的地方也不給傳圖鈕", !/pickTaskPic/.test(taskThread(taskById("A"), false))); }

// 縮圖還在載的時候不能塌成一個點 —— 使用者會以為圖沒傳成功
{ const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  ok("縮圖有給最小尺寸（沒載完也佔得住位置）",
     /\.tmsg-pic\{[^}]*min-width:\d+px[^}]*min-height:\d+px/.test(HTML), "沒有 min-width/min-height");
  ok("——也有上限，不會撐爆版面", /\.tmsg-pic\{[^}]*max-width:[^}]*max-height:/.test(HTML)); }

// ══════════ ⑦ fb.js 那一端 ══════════
{ ok("fb.js 有 uploadTaskPic", /async uploadTaskPic\(/.test(FB));
  ok("路徑帶交辦 id 與圖片 id（不是固定路徑）",
     /"taskpix\/" \+ String\(taskId\) \+ "\/" \+ String\(picId\) \+ "\.jpg"/.test(FB), "路徑不對");
  ok("有設一年快取（流量費用的關鍵）", /uploadTaskPic[\s\S]{0,400}max-age=31536000/.test(FB));
  ok("沒有動到封面上傳", /async uploadCover\(/.test(FB) && /"covers\/" \+ String\(id\) \+ "\.jpg"/.test(FB)); }

console.log(`\nv168（交辦留言可以傳圖片）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
