// v196：找影片 —— Google Drive 素材搜尋（有權限的人才看得到，索引可以重建）
//
// 老闆：「我要新增一個找影片引擎的頁面（要有權限，給權限的人才能讀），
//        然後這個資料庫可以更新」
//        「15 萬筆不要全進，你要先做功課，有意義的檔名或資料夾名，和不知名的
//         大檔影片，要留，有很多是明確和影片腳本無關的不用進去」
//
// ── 做功課的結果（正式 Drive 清單 153,211 筆實測）──────────────────
//   丟掉 116,803 筆（76%）：._ 資源分叉 39,169／純數字檔名 31,218／
//   FreidBuffer.dat 21,436（每個 4KB）／IMG_DSC_VID 15,348／S__ 1,003…
//   留下 26,007 筆：6,604 個資料夾 ＋ 19,163 個名字看得懂的檔案
//   183.5 MB → 4.75 MB JSON（gzip 1.55 MB）
//
// ── 為什麼搜尋單位是資料夾 ──────────────────────────────────────
//   名字看不懂的影片**100% 都住在名字看得懂的資料夾裡**
//   （IMG_1618.MOV 186MB ← …/01待剪毛片區/[中文版] Three…）。
//   所以資料夾當候選卡、檔案掛在它底下當素材摘要。
//
// ⚠️⚠️ 這支測試最重要的一條在 ③：**只放 IMG_*.MOV 的資料夾不可以被丟掉**。
//    第一版就是在這裡寫錯的 —— 「名字搜不到」跟「不是檔案」用了同一組規則，
//    結果毛片資料夾被判成空資料夾整個消失（6,604 → 5,558），
//    正好把老闆交代「要留」的那些全丟了。靠拿正式資料跟 Python 版對數字才抓到。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const RULES=fs.readFileSync(path.join(__dirname,"..","firebase","firestore.rules"),"utf8");
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

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,320));} }

const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();

function setUsers(users, who, role){
  VIEW_AS=null; BRAND=""; viewEl.innerHTML="";
  ASSET_IDX=null; ASSET_GROUPS={}; ASSET_STATE="idle"; ASSET_Q=""; ASSET_HITS=null; ASSET_LOOSE=false; ASSET_BUSY="";
  localStorage.setItem("ecdr_user", who); localStorage.setItem("ecdr_role", role);
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users, settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
}
const U=[{name:"管理員",role:"boss"},{name:"Regina",role:"manager"},
         {name:"泓儒",role:"editor",canFindAssets:true},{name:"小葵",role:"editor"},
         {name:"Anna",role:"intl",canFindAssets:true},{name:"HR小姐",role:"hr"}];
const tabIds=()=>myTabs().map(t=>t[0]);

// ══════════ ① 權限：給權限的人才看得到 ══════════
{ setUsers(U,"管理員","boss");
  ok("老闆看得到", canFindAssets()===true && tabIds().includes("assets"), tabIds());
  ok("**老闆可以重建索引**", canRebuildAssets()===true); }
{ setUsers(U,"Regina","manager");
  ok("經理人看得到", canFindAssets()===true && tabIds().includes("assets"), tabIds());
  ok("但經理人不能重建索引（那是整份換掉）", canRebuildAssets()===false); }
{ setUsers(U,"泓儒","editor");
  ok("**勾了「找影片」的同仁看得到**", canFindAssets()===true && tabIds().includes("assets"), tabIds());
  ok("他也不能重建", canRebuildAssets()===false); }
{ setUsers(U,"小葵","editor");
  ok("**沒勾的同仁看不到（連分頁都沒有）**", canFindAssets()===false && !tabIds().includes("assets"), tabIds());
  ok("硬進去也只看到「沒有權限」", /沒有這一頁的權限/.test(viewAssets()), viewAssets().slice(0,140)); }
{ setUsers(U,"Anna","intl");
  // 這一頁整頁中文，給海外剪輯只會讓中文漏進英文介面（audit-lang 會抓）
  ok("**海外剪輯不給這個分頁**（整頁中文）", !tabIds().includes("assets"), tabIds()); }
{ setUsers(U,"管理員","boss"); VIEW_AS="小葵";
  ok("**員工視角看的是「被預覽的人」有沒有權限，不是自己的**", canFindAssets()===false);
  ok("員工視角底下不能重建", canRebuildAssets()===false);
  VIEW_AS="泓儒";
  ok("預覽有權限的人時看得到", canFindAssets()===true);
  VIEW_AS=null; }
// ⚠️ 這一條是整支測試裡最容易寫假的地方，寫壞過一次所以特別註明：
//    上面那組「預覽小葵 → false」**擋不住權限外洩** —— 就算整段 VIEW_AS 判斷
//    被拿掉，currentRole() 對名單裡的人還是會回 editor，答案剛好也是 false。
//    真正會出事的是**預覽名單裡沒有的人**：currentRole() 這時會退回去用
//    「真正登入者」存在 localStorage 的角色（boss），於是預覽任何陌生名字
//    都借到管理員的權限。v190 的 canAssignShown() 就是這樣漏的。
{ setUsers(U,"管理員","boss"); VIEW_AS="查無此人";
  ok("**預覽「名單裡沒有的人」不可以借到管理員權限**", canFindAssets()===false,
     {role:currentRole(), 結果:canFindAssets()});
  ok("（對照）真的是管理員時本來就有", (VIEW_AS=null, canFindAssets())===true); }
// 而且判斷一定要「只看被預覽者那筆」，不能摻自己的角色
ok("**canFindAssets 的員工視角分支只讀被預覽的那一筆**",
   /if\(VIEW_AS\)\{ const p=\(STATE&&STATE\.users\|\|\[\]\)\.find\(x=>x&&x\.name===VIEW_AS\);/
     .test(APP.replace(/\s+/g," ").replace(/\{ /g,"{").replace(/ \}/g,"}"))
   || /VIEW_AS\)\{[^}]*x\.name===VIEW_AS/.test(APP.replace(/\s+/g," ")),
   (APP.match(/function canFindAssets\(\)[\s\S]{0,240}/)||[])[0]);
// 路由白名單：沒放行的話「設定裡勾了沒反應」而且不會有任何錯誤訊息
ok("PUT /api/users 的白名單有放行 canFindAssets",
   /body\.canFindAssets!=null\) patch\.canFindAssets=!!body\.canFindAssets/.test(APP));
ok("設定→成員那一欄畫得出來", /setMemberFindAssets\('/.test(APP) && /找影片<\/label>/.test(APP));

// ══════════ ② CSV 解析：引號、逗號、換行、BOM ══════════
{ const rows=csvParse('﻿a,b,c\n1,"帶,逗號",3\n4,"帶""引號""",6\n7,"跨\n行",9\n');
  ok("BOM 不會黏在第一個欄位上", rows[0][0]==="a", rows[0]);
  ok("**引號裡的逗號不會被切開**", rows[1][1]==="帶,逗號", rows[1]);
  ok("**跳脫的雙引號還原得回來**", rows[2][1]==='帶"引號"', rows[2]);
  ok("**引號裡的換行不會被當成新的一列**", rows.length===4 && rows[3][1]==="跨\n行", rows.map(r=>r.length));
  ok("最後沒有換行也讀得到最後一列", csvParse("a,b\n1,2").length===2); }

// ══════════ ③ 整理索引：什麼丟、什麼留 ══════════
const HEAD=["檔案/資料夾名稱","類型","路徑那一欄","建檔日期","最後修改日期","檔案ID","大小 (Bytes)","檔案網址"];
const row=(n,mime,p,id,size,c)=>[n,mime,p,c||"2026-01-02 10:00:00","2026-03-04 11:00:00",id,size==null?"":String(size),""];
const MB=1048576;
{ const rows=[HEAD,
    row("根","Folder","", "F0"),
    row("祖母綠特輯","Folder","根","F1"),
    // 只放相機自動命名的毛片 —— 這一種**絕對不能**被當成空資料夾丟掉
    row("IMG_1618.MOV","video/quicktime","根 / 祖母綠特輯","V1",186*MB),
    row("IMG_1619.MOV","video/quicktime","根 / 祖母綠特輯","V2",92*MB),
    // 系統垃圾：不算內容、也不進索引
    row("._IMG_1618.MOV","video/quicktime","根 / 祖母綠特輯","J1",0),
    row(".DS_Store","application/octet-stream","根 / 祖母綠特輯","J2",0),
    row("FreidBuffer.dat","application/octet-stream","根 / 祖母綠特輯","J3",4096),
    // 名字看得懂的檔案：自己也要進索引
    row("20260713這四種珠寶你買過嗎.txt","text/plain","根 / 祖母綠特輯","D1",2000),
  ];
  const b=assetBuildIndex(rows);
  const f=b.folders.find(x=>x.n==="祖母綠特輯");
  ok("（前提）整理得出這個資料夾", !!f, b.folders.map(x=>x.n));
  ok("**只放 IMG_*.MOV 的資料夾不會被丟掉**（老闆：不知名的大檔影片要留）",
     !!f && (f.k.v||0)===2, f&&f.k);
  ok("**最大的影片列得出來，而且是排序過的**",
     !!f && f.b.length===2 && f.b[0].i==="V1" && f.b[0].mb===186, f&&f.b);
  ok("系統垃圾不算資料夾內容（._／.DS_Store／FreidBuffer）",
     !!f && !JSON.stringify(f.b).includes("J1") && (f.k.o||0)===0, f&&f.k);
  ok("垃圾也不會自己進索引", !b.files.some(x=>["J1","J2","J3"].includes(x.i)), b.files.map(x=>x.i));
  ok("**相機自動命名的檔案不必自己佔一列**（它靠資料夾被找到）",
     !b.files.some(x=>x.i==="V1"), b.files.map(x=>x.i));
  ok("**名字看得懂的檔案自己有一列**", b.files.some(x=>x.i==="D1"), b.files.map(x=>x.i));
  ok("那一列掛得回它的資料夾",
     (b.files.find(x=>x.i==="D1")||{}).f===b.folders.indexOf(f)); }

// 同名資料夾：一定要用完整路徑掛，用名字會掛到別人身上（正式資料有 1,111 組）
{ const rows=[HEAD,
    row("A","Folder","","FA"), row("B","Folder","","FB"),
    row("素材","Folder","A","F1"), row("素材","Folder","B","F2"),
    row("甲片.mp4","video/mp4","A / 素材","V1",10*MB),
    row("乙片.mp4","video/mp4","B / 素材","V2",20*MB),
    row("丙片.mp4","video/mp4","B / 素材","V3",30*MB),
  ];
  const b=assetBuildIndex(rows);
  const a1=b.folders.find(x=>x.i==="F1"), a2=b.folders.find(x=>x.i==="F2");
  ok("（前提）兩個同名資料夾都在", !!a1 && !!a2, b.folders.map(x=>x.i));
  ok("**同名資料夾不會互相掛錯**（A/素材 1 支、B/素材 2 支）",
     (a1.k.v||0)===1 && (a2.k.v||0)===2, {A:a1.k, B:a2.k});
  ok("而且掛對了人", a1.b[0].i==="V1" && a2.b[0].i==="V3", {A:a1.b, B:a2.b}); }

// 空資料夾不進索引；重複的 drive_id 只算一次
{ const rows=[HEAD,
    row("空的","Folder","","E1"),
    row("有東西","Folder","","E2"), row("片.mp4","video/mp4","有東西","V1",MB),
    row("片.mp4","video/mp4","有東西","V1",MB),          // 同一個 id 再來一次
  ];
  const b=assetBuildIndex(rows);
  ok("空資料夾不進索引", !b.folders.some(x=>x.i==="E1"), b.folders.map(x=>x.i));
  ok("**同一個 Drive ID 只算一次**", (b.folders.find(x=>x.i==="E2")||{k:{}}).k.v===1, b.folders); }

// 欄位對不上要講清楚，不能默默產出空索引
{ let msg="";
  try{ assetBuildIndex([["亂七八糟","的表頭"],["a","b"]]); }catch(e){ msg=e.message; }
  ok("**欄位對不上會明講**（不是默默給一份空索引）", /少了必要欄位/.test(msg), msg); }

// ══════════ ④ 搜尋 ══════════
function idx(folders, files){
  ASSET_IDX={folders, files:files||[], meta:{}}; ASSET_GROUPS={};
}
const F=(i,n,p,k,b)=>({i,n,p:p||"",c:"2026-01-01",m:"2026-02-01",k:k||{v:1},mb:10,b:b||[]});
{ idx([F("A","祖母綠戒指","根 / 成片"), F("B","招財貓水晶","根 / 成片"), F("C","祖母綠耳環","根 / 毛片")]);
  assetSearch("祖母綠");
  ok("搜得到", ASSET_HITS.length===2, ASSET_HITS.map(h=>h.f.n));
  ok("每一筆都講得出為什麼中", ASSET_HITS.every(h=>(h.why||[]).length), ASSET_HITS.map(h=>h.why));
  assetSearch("");
  ok("沒打字就不搜（不是把全部倒出來）", ASSET_HITS===null); }
{ idx([F("A","祖母綠戒指"), F("B","招財貓水晶")]);
  assetSearch("祖母綠 水晶");
  ok("**兩個詞預設要都中**（不然打越多字結果越多，等於沒用）",
     ASSET_LOOSE===true, {放寬:ASSET_LOOSE, 幾筆:ASSET_HITS.length});
  ok("都中不了才自動放寬，而且放寬後兩筆都出來", ASSET_HITS.length===2, ASSET_HITS.map(h=>h.f.n)); }
{ idx([F("A","祖母綠戒指"), F("B","祖母綠耳環")]);
  assetSearch("祖母綠 戒指");
  ok("**兩個詞都中的那一筆才留下來**", ASSET_LOOSE===false && ASSET_HITS.length===1 && ASSET_HITS[0].f.i==="A",
     {放寬:ASSET_LOOSE, 結果:ASSET_HITS.map(h=>h.f.n)}); }
{ idx([F("A","祖母綠戒指"), F("B","祖母綠耳環")]);
  assetSearch("祖母綠");
  const before=ASSET_HITS.map(h=>h.f.i);
  ASSET_GROUPS={B:{id:"B",by:"Vito"}};
  assetSearch("祖母綠");
  ok("**人工確認過的排到前面**（規格 +60）", ASSET_HITS[0].f.i==="B", {前:before, 後:ASSET_HITS.map(h=>h.f.i)}); }
{ idx([F("A","毛片區","根")], [{i:"X1",n:"20260713這四種珠寶你買過嗎.txt",t:"d",f:-1,c:"2026-07-13",mb:0}]);
  assetSearch("20260713");
  ok("不在索引資料夾底下的檔案也搜得到（會自己當一張卡）",
     ASSET_HITS.some(h=>h.t==="x" && h.x.i==="X1"), ASSET_HITS.map(h=>h.t)); }
{ idx([F("A","祖母綠戒指","根 / abc123XYZ")]);
  assetSearch("ABC123xyz");
  ok("大小寫不影響（路徑也搜得到）", ASSET_HITS.length===1, ASSET_HITS.map(h=>h.why)); }
{ idx([F("A","祖母綠戒指")]);
  assetSearch("完全不存在的東西");
  ok("找不到就是找不到（不亂給）", ASSET_HITS.length===0);
  ok("而且告訴他可以怎麼改", /改用商品名|只打其中/.test(assetResultsHTML()), assetResultsHTML().slice(0,200)); }

// ══════════ ⑤ 畫面 ══════════
{ setUsers(U,"管理員","boss");
  idx([F("A","市價3折拿下祖母綠","根 / 成片",{v:3,i:4,s:1},[{i:"V9",n:"成片.mov",mb:44.2}])]);
  ASSET_STATE="ready";
  assetSearch("祖母綠");
  const h=viewAssets();
  ok("卡片印得出資料夾名", h.includes("市價3折拿下祖母綠"));
  ok("印得出路徑", h.includes("根 / 成片"));
  ok("印得出素材摘要（影片／圖／字幕各幾個）",
     h.includes("影片 3") && h.includes("圖 4") && h.includes("字幕 1"), (h.match(/class="tag"[^>]*>[^<]*/g)||[]).slice(0,6));
  ok("**印得出最大的那幾支影片**", h.includes("成片.mov") && h.includes("44.2"));
  ok("**開得了 Drive 資料夾**", h.includes("drive.google.com/drive/folders/A"), (h.match(/https:\/\/drive[^"]*/g)||[])[0]);
  ok("影片連結指向檔案不是資料夾", h.includes("drive.google.com/file/d/V9"));
  ok("有「確認是這一支的主資料夾」", /assetConfirm\('A'/.test(h));
  ok("印得出 Drive ID（要拿去對的時候用得到）", h.includes("Drive ID"));
  ok("**畫面上寫明不會動到 Drive**", /不會動到 Google Drive/.test(h));
  ASSET_GROUPS={A:{id:"A",by:"Vito",at:"2026-09-10T12:00:00"}};
  assetSearch("祖母綠");
  const h2=viewAssets();
  ok("確認過的會標出來、而且變成「取消確認」",
     h2.includes("已確認") && /assetUnconfirm\('A'/.test(h2) && !/assetConfirm\('A'/.test(h2)); }
{ setUsers(U,"管理員","boss"); ASSET_STATE="empty"; ASSET_IDX=null;
  const h=viewAssets();
  ok("還沒有索引時，管理員看到的是「選 CSV 檔」", /選 CSV 檔/.test(h) && /as_csv/.test(h)); }
{ setUsers(U,"泓儒","editor"); ASSET_STATE="empty"; ASSET_IDX=null;
  const h=viewAssets();
  ok("**一般人看到的是「請管理員匯入」，沒有上傳鈕**",
     /請管理員/.test(h) && !/as_csv/.test(h), h.slice(0,300)); }
{ setUsers(U,"管理員","boss"); ASSET_STATE="error"; ASSET_ERR="Unexpected end of JSON input";
  const h=viewAssets();
  ok("索引壞掉時講得出「多半是上次重建到一半」與怎麼救",
     /重建到一半/.test(h) && /重新匯入 CSV/.test(h), h.slice(0,400)); }

// ══════════ ⑥ 集合要在規則裡（不然上線後讀寫默默失敗）══════════
ok("firestore.rules 有 driveindex", /match \/driveindex\/\{/.test(RULES));
ok("firestore.rules 有 assetgroups", /match \/assetgroups\/\{/.test(RULES));
ok("**索引重建要能刪掉多出來的舊分段**（不然殘留的尾巴會接到新資料後面）",
   /match \/driveindex\/\{id\} \{ allow read, write/.test(RULES));
ok("fb.js 的分段上限有留安全邊界（文件上限 1 MiB）",
   /LIMIT\s*=\s*600000/.test(fs.readFileSync(path.join(__dirname,"..","fb.js"),"utf8")));
ok("**分段是量 UTF-8 位元組不是字數**（中文一個字 3 bytes，用字數會爆掉）",
   /TextEncoder[\s\S]{0,400}enc\.encode\(ch\)\.length/.test(fs.readFileSync(path.join(__dirname,"..","fb.js"),"utf8")));
ok("**meta 最後才寫**（先寫的話別人會載到接不起來的半份）",
   (()=>{ const s=fs.readFileSync(path.join(__dirname,"..","fb.js"),"utf8");
     const f=s.slice(s.indexOf("async saveAssetIndex"));
     return f.indexOf('"driveindex", "c"') < f.indexOf('"driveindex", "meta"'); })());

console.log(`\n${pass} 通過${fail?("，"+fail+" 失敗"):""}`);
process.exit(fail?1:0);
