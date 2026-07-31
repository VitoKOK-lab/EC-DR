// v95：影片封面圖 —— 編輯畫面左上角點擊上傳（自動壓縮）、影片庫縮圖、清單／圖片兩種瀏覽模式
const fs=require("fs"), path=require("path");
const css=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const fbjs=fs.readFileSync(path.join(__dirname,"..","fb.js"),"utf8");
const rules=fs.readFileSync(path.join(__dirname,"..","firebase","storage.rules"),"utf8");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,files:null,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  click(){ clicks++; },
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, clicks=0, canvases=[];
const fileEl=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(id==="cv_file") return fileEl;
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},
  createElement:(t)=>{ if(t==="canvas"){ const c={width:0,height:0,
      getContext:()=>({fillStyle:"",fillRect(){},drawImage(w,x,y,dw,dh){ c.drew=[dw,dh]; }}),
      toBlob:(cb,type,q)=>{ c.enc=[type,q]; cb({size:40000,type:type}); }};
      canvases.push(c); return c; } return el(); },
  body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
// 假的圖片解碼：Image 一被設 src 就「載入完成」，尺寸由 IMG_WH 決定
let IMG_WH=[1500,2000], IMG_FAIL=false;
global.URL={createObjectURL:()=>"blob:x", revokeObjectURL(){}};
global.Image=function(){ const o={naturalWidth:0,naturalHeight:0,onload:null,onerror:null};
  Object.defineProperty(o,"src",{set(){ setTimeout(()=>{ if(IMG_FAIL){ o.onerror&&o.onerror(); return; }
    o.naturalWidth=IMG_WH[0]; o.naturalHeight=IMG_WH[1]; o.onload&&o.onload(); },0); }});
  return o; };
let calls=[], toasts=[], uploads=[], deletes=[];
eval(src);
toast=(m,e)=>{ toasts.push(String(m)); };

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==';
const COVER="https://firebasestorage.googleapis.com/v0/b/x/o/covers%2FV1.jpg?alt=media&token=abc";
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",rawLink:"",cover:"",
  stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",publishedLink:"",
  driveFolder:"",productUrl:"",note:"",mainType:"",source:"",refLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos){
  calls=[]; toasts=[]; uploads=[]; deletes=[]; fields={}; modalHTML=""; clicks=0; canvases=[];
  IMG_WH=[1500,2000]; IMG_FAIL=false; fileEl.files=null; fileEl.value="";
  VID_LANG=""; VID_VIEW="rawNoSched"; VID_MODE="list"; VID_TAGS=new Set(); VID_Q=""; POOL_FILTER="all"; POOL_Q="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Anna",role:"intl",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Regina",role:"manager",pwHash:H},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, logs:[], deletedVideos:[], shifts:{}, tasks:{}, videos:(videos||[]).slice() };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; CAL_PLAT="tw"; CAL_YM=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{},
    uploadCover:async(id,blob)=>{ uploads.push([id,blob]); return COVER; },
    deleteCover:async(id)=>{ deletes.push(id); return true; },
    coverPath:(id)=>"covers/"+id+".jpg" };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const vidCall=()=>calls.filter(x=>x[0]==="update"&&x[1]==="videos").pop();
const pickFile=(o)=>({name:"a.jpg",type:"image/jpeg",size:3*1024*1024,...(o||{})});
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ 新影片的欄位 ══
reset([]); as("Regina","manager");
ok("新影片的預設欄位裡有 cover", newVideoRecord({}).cover==="");
ok("hasCover 判定：空的是沒有", hasCover(v_("A"))===false);
ok("hasCover 判定：只有空白也是沒有", hasCover(v_("A",{cover:"   "}))===false);
ok("hasCover 判定：有網址就是有", hasCover(v_("A",{cover:COVER}))===true);

// ══ 編輯畫面：左上角的封面格 ══
reset([v_("V1")]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML;
  ok("編輯畫面有封面格", m.includes('id="cv_box"'));
  ok("有隱藏的檔案選擇欄，只收圖片", m.includes('id="cv_file"') && m.includes('accept="image/*"'));
  ok("點一下就開檔案選擇", m.includes('onclick="coverPickFile()"'));
  ok("沒封面時顯示「加封面」", m.includes("加封面"));
  ok("提示會自動壓縮（不用自己先縮圖）", m.includes("會自動壓縮"));
  ok("在左上角：封面排在編號欄位前面", m.indexOf('id="cv_box"') < m.indexOf('id="e_code"'));
  ok("跟編號/片名同一排（不是自己占一整段）", m.includes('class="cv-head"')
     && m.indexOf('class="cv-head"') < m.indexOf('id="cv_box"')
     && m.indexOf('id="e_name"') < m.indexOf("</div>\n    </div>")+99999);
  ok("沒封面時不會給移除鈕", !m.includes("coverRemove(")); }
reset([v_("V1",{cover:COVER})]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML;
  ok("有封面就把圖畫出來", m.includes(`<img src="${COVER.replace(/&/g,"&amp;")}"`));
  ok("縮圖延後載入（沒捲到就不下載，省流量）", m.includes('loading="lazy"'));
  ok("有封面時才有移除鈕", m.includes("coverRemove('V1')"));
  ok("有封面時不再顯示「加封面」", !m.includes("加封面")); }

// ══ 檢視畫面 ══
reset([v_("V1",{cover:COVER})]); as("Regina","manager");
openVideoModal("V1", false);
ok("檢視畫面也看得到封面", modalHTML.includes('class="cv-view"') && modalHTML.includes(COVER.replace(/&/g,"&amp;")));
reset([v_("V1")]); as("Regina","manager");
openVideoModal("V1", false);
ok("沒封面的檢視畫面不會留一塊空的", !modalHTML.includes('class="cv-view"'));

// ══ 影片庫清單的縮圖 ══
reset([v_("R1",{rawLink:"http://d",cover:COVER}), v_("R2",{rawLink:"http://d"})]);
as("Regina","manager");
{ const h=viewVideos();
  ok("有封面的列顯示縮圖", h.includes(`<img class="vthumb" src="${COVER.replace(/&/g,"&amp;")}"`));
  ok("沒封面的列維持原本的 ▶ 方塊", h.includes('<span class="vthumb">▶</span>'));
  ok("清單縮圖也延後載入", (h.split('class="vthumb"')[1]||"").includes("lazy")); }

// ══ 清單／圖片兩種瀏覽模式 ══
reset([v_("R1",{rawLink:"http://d",cover:COVER})]); as("Regina","manager");
{ const h=viewVideos();
  ok("有瀏覽方式切換鈕", h.includes("vidSetMode('list')") && h.includes("vidSetMode('grid')"));
  ok("預設是清單，清單鈕亮著", h.includes('class="vmode-b on" onclick="vidSetMode(\'list\')'));
  ok("清單模式畫的是表格", h.includes("<table class=\"vtable")); }
reset([v_("R1",{rawLink:"http://d",cover:COVER}), v_("R2",{rawLink:"http://d"})]);
as("Regina","manager"); VID_MODE="grid";
{ const h=viewVideos();
  ok("圖片模式畫的是格子，不是表格", h.includes('class="vgrid"') && !h.includes("<table class=\"vtable"));
  ok("圖片模式每支一張卡", (h.match(/class="vcard"/g)||[]).length===2);
  ok("圖片模式的卡點得進去", h.includes("editVideo('R1')"));
  ok("圖片模式也看得到片名（編號＋片名）", h.includes("26R1 片R1"));
  ok("圖片模式仍顯示總數", h.includes("共") && h.includes("2"));
  ok("圖片模式換成圖片鈕亮著", h.includes('class="vmode-b on" onclick="vidSetMode(\'grid\')')); }
// 篩選條件兩種模式共用
reset([v_("R1",{rawLink:"http://d",name:"翡翠開箱"}), v_("R2",{rawLink:"http://d",name:"珠寶保養"})]);
as("Regina","manager"); VID_Q="翡翠";
ok("清單模式的搜尋有效", vidVisibleList().map(v=>v.id).join()==="R1");
VID_MODE="grid";
ok("圖片模式用同一份篩選結果（搜尋一樣有效）", vidVisibleList().map(v=>v.id).join()==="R1"
   && viewVideos().includes("editVideo('R1')") && !viewVideos().includes("editVideo('R2')"));
reset([v_("R1",{rawLink:"http://d",tags:["寵粉"]}), v_("R2",{rawLink:"http://d"})]);
as("Regina","manager"); VID_MODE="grid"; VID_TAGS=new Set(["寵粉"]);
ok("圖片模式的標籤篩選也有效", vidVisibleList().map(v=>v.id).join()==="R1");
reset([]); as("Regina","manager"); VID_MODE="grid";
ok("圖片模式沒有影片時不會炸", viewVideos().includes("沒有符合的影片"));
// 切換會記在這台裝置上
reset([v_("R1",{rawLink:"http://d"})]); as("Regina","manager");
vidSetMode("grid");
ok("切成圖片模式會記起來", VID_MODE==="grid" && localStorage.getItem("ecdr_vidmode")==="grid");
vidSetMode("list");
ok("切回清單也會記起來", VID_MODE==="list" && localStorage.getItem("ecdr_vidmode")==="list");
vidSetMode("亂打");
ok("亂傳參數就回到清單，不會卡在無效狀態", VID_MODE==="list");

// ══ 上傳：壓縮 → 存 Storage → 寫回影片 ══
(async()=>{
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  fileEl.files=[pickFile()];
  await coverChosen(fileEl, "V1"); await wait(40);
  { const c=canvases[canvases.length-1];
    ok("有壓縮（畫到 canvas 上）", !!c);
    ok("長邊縮到 720（1500×2000 → 540×720）", c && c.width===540 && c.height===720);
    ok("輸出成 JPEG", c && c.enc && c.enc[0]==="image/jpeg");
    ok("品質壓到 1 以下（不是原圖直出）", c && c.enc && c.enc[1]>0 && c.enc[1]<1); }
  ok("有丟上 Storage，路徑帶影片 id", uploads.length===1 && uploads[0][0]==="V1");
  ok("上傳的是壓過的檔（大小有變）", uploads.length===1 && uploads[0][1].size===40000);
  { const c=vidCall();
    ok("網址寫回這支影片的 cover", !!c && c[3].cover===COVER);
    ok("只動 cover，不會順手改到別的欄位", !!c && !("name" in c[3]) && !("stage" in c[3])); }
  ok("有跟使用者說成功了", toasts.some(t=>t.includes("封面已更新")));
  ok("上傳後重開編輯畫面才看得到新圖", modalHTML.includes('id="cv_box"'));

  // 比原圖小的不放大
  reset([v_("V1")]); as("Regina","manager"); IMG_WH=[300,400];
  fileEl.files=[pickFile()];
  await coverChosen(fileEl,"V1"); await wait(40);
  { const c=canvases[canvases.length-1];
    ok("本來就小的圖不會被放大（300×400 維持原樣）", c && c.width===300 && c.height===400); }

  // 橫式的圖也是看長邊
  reset([v_("V1")]); as("Regina","manager"); IMG_WH=[2400,1350];
  fileEl.files=[pickFile()];
  await coverChosen(fileEl,"V1"); await wait(40);
  { const c=canvases[canvases.length-1];
    ok("橫圖看寬邊（2400×1350 → 720×405）", c && c.width===720 && c.height===405); }

  // ══ 擋掉不該傳的東西 ══
  reset([v_("V1")]); as("Regina","manager");
  fileEl.files=[pickFile({type:"video/mp4",name:"a.mp4"})];
  await coverChosen(fileEl,"V1"); await wait(40);
  ok("選到影片檔會擋下來", uploads.length===0 && toasts.some(t=>t.includes("請選圖片檔")));
  reset([v_("V1")]); as("Regina","manager");
  fileEl.files=[pickFile({size:20*1024*1024})];
  await coverChosen(fileEl,"V1"); await wait(40);
  ok("超過 12MB 的檔會擋下來（多半是選錯檔）", uploads.length===0 && toasts.some(t=>t.includes("12MB")));
  reset([v_("V1")]); as("Regina","manager");
  fileEl.files=null;
  await coverChosen(fileEl,"V1"); await wait(40);
  ok("沒選檔案就什麼都不做", uploads.length===0 && toasts.length===0);
  reset([v_("V1")]); as("Regina","manager"); IMG_FAIL=true;
  fileEl.files=[pickFile()];
  await coverChosen(fileEl,"V1"); await wait(40);
  ok("圖片壞掉／讀不出來會講清楚，不會靜靜失敗", uploads.length===0 && toasts.some(t=>t.includes("不是圖片")));
  // 員工視角是唯讀
  reset([v_("V1")]); as("管理員","boss"); VIEW_AS="小葵";
  fileEl.files=[pickFile()];
  await coverChosen(fileEl,"V1"); await wait(40);
  ok("員工視角（唯讀預覽）不能上傳", uploads.length===0 && !vidCall());
  // 連線還沒好
  reset([v_("V1")]); as("Regina","manager"); global.window.DB.uploadCover=null;
  fileEl.files=[pickFile()];
  await coverChosen(fileEl,"V1"); await wait(40);
  ok("連線還沒就緒時提示等一下，不會當掉", toasts.some(t=>t.includes("連線")));
  // Storage 規則沒開 → 講白話
  reset([v_("V1")]); as("Regina","manager");
  global.window.DB.uploadCover=async()=>{ const e=new Error("Firebase Storage: User does not have permission"); e.code="storage/unauthorized"; throw e; };
  fileEl.files=[pickFile()];
  await coverChosen(fileEl,"V1"); await wait(40);
  ok("沒權限時說得出是規則沒設，不是丟英文代碼",
     toasts.some(t=>t.includes("Storage 規則")) && !toasts.some(t=>t==="storage/unauthorized"));

  // ══ 移除封面 ══
  reset([v_("V1",{cover:COVER})]); as("Regina","manager");
  await coverRemove("V1"); await wait(40);
  { const c=vidCall();
    ok("移除會把 cover 清成空字串", !!c && c[3].cover==="");
    ok("同時把 Storage 上的檔刪掉（不留孤兒圖）", deletes.length===1 && deletes[0]==="V1"); }
  reset([v_("V1",{cover:COVER})]); as("Regina","manager");
  global.window.DB.deleteCover=async()=>{ throw new Error("not found"); };
  await coverRemove("V1"); await wait(40);
  ok("檔案刪不掉不影響「移除」本身（欄位還是清掉了）", (vidCall()||{})[3].cover==="");
  reset([v_("V1",{cover:COVER})]); as("管理員","boss"); VIEW_AS="小葵";
  await coverRemove("V1"); await wait(40);
  ok("員工視角不能移除封面", !vidCall() && deletes.length===0);

  // ══ 惡意網址不會變成可執行的東西 ══
  reset([v_("V1",{cover:'" onerror="alert(1)'})]); as("Regina","manager");
  openVideoModal("V1", true);
  ok("封面網址有跳脫，不會被當成屬性", !modalHTML.includes('onerror="alert(1)"'));
  reset([v_("R1",{rawLink:"http://d",cover:'" onerror="alert(1)'})]); as("Regina","manager");
  ok("清單縮圖的網址也有跳脫", !viewVideos().includes('onerror="alert(1)"'));

  // ══ 海外剪輯看到英文 ══
  reset([v_("V1",{locale:"en"})]); as("Anna","intl");
  openVideoModal("V1", true);
  ok("海外的封面格是英文", modalHTML.includes("Add cover") && !modalHTML.includes("加封面"));
  reset([v_("R1",{rawLink:"http://d"})]); as("Anna","intl");
  ok("海外的瀏覽切換是英文", viewVideos().includes("List") && viewVideos().includes("Covers")
     && !viewVideos().includes(">☰ 清單"));

  // ══ fb.js：Storage 介面 ══
  ok("[fb] 有載入 Storage SDK", fbjs.includes("firebase-storage.js") && fbjs.includes("getStorage"));
  ok("[fb] 有 uploadCover / deleteCover", fbjs.includes("uploadCover") && fbjs.includes("deleteCover"));
  ok("[fb] 一支片一張圖（路徑用影片 id，重傳直接蓋掉）", /covers\/"\s*\+\s*String\(id\)\s*\+\s*"\.jpg/.test(fbjs));
  ok("[fb] 縮圖讓瀏覽器長期快取（不然每天重下載一輪，流量是另外算錢的）",
     fbjs.includes("max-age=31536000") && fbjs.includes("immutable"));
  ok("[fb] 存成 JPEG", fbjs.includes('contentType: "image/jpeg"'));

  // ══ Storage 規則 ══
  ok("[rules] 有 storage.rules", rules.includes("service firebase.storage"));
  ok("[rules] 要登入才能讀寫", rules.includes("request.auth != null"));
  ok("[rules] 只收圖片", rules.includes("contentType.matches('image/.*')"));
  ok("[rules] 單張有大小上限（不會被當免費網路硬碟）", rules.includes("2 * 1024 * 1024"));
  ok("[rules] covers 以外的路徑一律不開", /allPaths=\*\*[\s\S]*allow read, write: if false/.test(rules));

  // ══ CSS ══
  ok("[css] 封面格是固定比例的方框", css.includes(".cv-box{") && css.includes("aspect-ratio:3/4"));
  ok("[css] 圖片不會被拉變形", /\.cv-box img\{[^}]*object-fit:cover/.test(css));
  ok("[css] 清單縮圖也不會變形", /img\.vthumb\{[^}]*object-fit:cover/.test(css));
  ok("[css] 圖片模式是自動排版的格子", /\.vgrid\{[^}]*display:grid/.test(css) && css.includes("auto-fill"));
  ok("[css] 卡片標題最多兩行，不會把格子撐爆", /\.vcard-t\{[^}]*line-clamp:2/.test(css));
  ok("[css] 上傳中會擋住重複點擊", /\.cv-box\.busy\{[^}]*pointer-events:none/.test(css));
  ok("[css] 手機上格子會變小張（一排放得下）", /@media \(max-width:640px\)\{[\s\S]*\.vgrid\{grid-template-columns/.test(css));

  // ══ render 不炸 ══
  const LIB=[v_("R1",{rawLink:"http://d",cover:COVER}), v_("R2",{rawLink:"http://d"}),
             v_("O1",{tags:["舊片"],cover:COVER})];
  [["Regina","manager"],["管理員","boss"],["Anna","intl"],["小葵","editor"]].forEach(([u,r])=>{
    ["list","grid"].forEach(mode=>{
      reset(LIB); as(u,r); CUR_TAB="videos"; VID_MODE=mode;
      try{ render(); ok(`[${r}] 影片庫 ${mode}`, true); }catch(e){ ok(`[${r}] ${mode} → ${e.message}`, false); } }); });
  reset(LIB); as("小葵","editor"); CUR_TAB="work";
  try{ render(); ok("[editor] 工作頁", true); }catch(e){ ok("[editor] 工作頁 → "+e.message, false); }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
