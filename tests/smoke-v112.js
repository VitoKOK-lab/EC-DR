// v112：上傳封面不會把還沒存的欄位吃掉。
//
// 災情：在編輯視窗裡先打好「完成影片存檔連結」，還沒按儲存就去上傳封面，
//       回來那一欄變空的。因為 coverChosen 存完封面後呼叫 openVideoModal(id,true)
//       把整個視窗重建 —— 所有欄位都被換回資料庫裡的舊值，剛打的字全沒了。
//       順帶連 MODAL_DIRTY 也被歸零，「還沒存喔」的提醒也跟著失效。
// 修法：只重畫封面那一格（#cv_slot），不動整個視窗。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{_s:new Set(),toggle(c,on){ on?this._s.add(c):this._s.delete(c); },add(c){this._s.add(c);},
             remove(c){this._s.delete(c);},contains(c){return this._s.has(c);}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},click(){},
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", modalWrites=0, viewEl=el(), nodes={}, missing=new Set();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(nodes[id]) return nodes[id];
    if(missing.has(id)) return null;
    const e=el();
    if(id==="modalRoot"){ Object.defineProperty(e,"innerHTML",
      {set(v){ modalHTML=v; modalWrites++; }, get(){return modalHTML;}}); }
    return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
let toasts=[], saved=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };
// canvas 在測試環境不存在，壓縮這一段跳過（不是這支要驗的東西）
coverCompress=async(f)=>({size:1234, type:"image/jpeg"});

const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"",rawName:"毛片"+id,videoCopy:"口播",rawLink:"http://raw",
  cover:"",stage:"剪輯中",editor:"小葵",claimedBy:"小葵",assignedTo:"",scheduledDate:null,publishTime:"",
  finishedAt:"",publishedLink:"",driveFolder:"",productUrl:"",note:"",mainType:"",source:"老闆自拍",
  refLink:"",reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos){
  toasts=[]; saved=[]; nodes={}; missing=new Set(); modalHTML=""; modalWrites=0;
  STATE={ users:[{name:"小葵",role:"editor",craft:"both"},{name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  CUR_TAB="videos"; VIEW_AS=null; VID_LANG=""; VID_VIEW="raw"; VID_UNSCHED=false;
  VID_Q=""; VID_TAGS=new Set(); MODAL_DIRTY=false;
  global.window.DB={
    set:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{},
    update:async(c,id,p)=>{ saved.push([c,id,p]); const v=vid(id); if(v) Object.assign(v,p); },
    uploadCover:async(id,blob)=>"https://storage/cover-"+id+".jpg",
    deleteCover:async()=>{},
  };
  localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
// 假的檔案輸入框（選了一張圖）
const fakeInput=()=>({files:[{type:"image/jpeg", size:500000, name:"cover.jpg"}], value:"x"});
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{
  // ══ ① 封面那一格有自己的 id，才換得動 ══
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  ok("封面格有 id=cv_slot", modalHTML.includes('id="cv_slot"'));
  ok("裡面是上傳按鈕", modalHTML.includes('id="cv_box"') && modalHTML.includes("coverPickFile()"));
  ok("沒封面時顯示「加封面」", modalHTML.includes("加封面"));

  // ══ ② 災情重現：打了字沒存，去傳封面 ══
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  { const before=modalWrites;
    const slot={innerHTML:"__舊的封面格__"};
    nodes={cv_slot:slot};
    MODAL_DIRTY=true;                       // 使用者打了字（成片連結）還沒按儲存
    await coverChosen(fakeInput(), "V1"); await wait(220);

    ok("封面有存進資料庫", saved.some(s=>s[1]==="V1" && s[2].cover));
    ok("整個編輯視窗沒有被重建", modalWrites===before);
    ok("只有封面那一格被換掉", slot.innerHTML!=="__舊的封面格__");
    ok("換上去的是新封面圖", slot.innerHTML.includes("storage/cover-V1.jpg"));
    ok("換完之後有「移除」可以按", slot.innerHTML.includes("coverRemove("));
    ok("「還沒存喔」的提醒沒有被吃掉", MODAL_DIRTY===true); }

  // 真正的災情條件：欄位值是活在 DOM 裡的，只要視窗沒重建就還在
  reset([v_("V1")]); as("Regina","manager");
  { const drive={value:""}, vcopy={value:""};
    nodes={cv_slot:{innerHTML:""}, e_drive:drive, e_vcopy:vcopy};
    openVideoModal("V1", true);
    drive.value="https://drive.google.com/剛剛打的成片連結";   // 使用者打字，還沒存
    vcopy.value="剛改的文案";
    const before=modalWrites;
    await coverChosen(fakeInput(), "V1"); await wait(220);
    ok("成片連結還在（就是回報的那個災情）", drive.value==="https://drive.google.com/剛剛打的成片連結");
    ok("文案也還在", vcopy.value==="剛改的文案");
    ok("視窗沒被重建，所以欄位才活得下來", modalWrites===before); }

  // ══ ③ 移除封面也一樣不能吃欄位 ══
  reset([v_("V1",{cover:"https://storage/old.jpg"})]); as("Regina","manager");
  openVideoModal("V1", true);
  ok("有封面時顯示圖片", modalHTML.includes("https://storage/old.jpg"));
  { const drive={value:"沒存的成片連結"};
    const slot={innerHTML:"__舊__"};
    nodes={cv_slot:slot, e_drive:drive};
    const before=modalWrites;
    await coverRemove("V1"); await wait(220);
    ok("封面已清掉", saved.some(s=>s[1]==="V1" && s[2].cover===""));
    ok("移除封面也不重建視窗", modalWrites===before);
    ok("移除後那一格回到「加封面」", slot.innerHTML.includes("加封面"));
    ok("移除封面也不會吃掉欄位", drive.value==="沒存的成片連結"); }

  // ══ ④ coverRefresh 本身 ══
  reset([v_("V1")]);
  { const slot={innerHTML:""};
    nodes={cv_slot:slot};
    coverRefresh("V1","https://storage/新的.jpg");
    ok("帶新網址進來就直接畫（不必等資料庫同步）", slot.innerHTML.includes("https://storage/新的.jpg"));
    coverRefresh("V1","");
    ok("帶空字串＝回到沒封面", slot.innerHTML.includes("加封面") && !slot.innerHTML.includes("storage")); }
  reset([v_("V1",{cover:"https://storage/db.jpg"})]);
  { const slot={innerHTML:""};
    nodes={cv_slot:slot};
    coverRefresh("V1");
    ok("不帶參數就用資料庫裡的值", slot.innerHTML.includes("https://storage/db.jpg")); }
  // 找不到那一格（例如人不在編輯視窗）→ 退回原本的重開，不會靜默失效
  reset([v_("V1")]); as("Regina","manager");
  { missing.add("cv_slot");
    modalHTML=""; modalWrites=0;
    coverRefresh("V1","https://storage/x.jpg");
    ok("找不到封面格時退回重開視窗", modalWrites>0 && modalHTML.includes('id="cv_slot"')); }

  // ══ ⑤ 防呆沒有被改壞 ══
  reset([v_("V1")]); as("Regina","manager");
  { nodes={cv_slot:{innerHTML:""}};
    await coverChosen({files:[{type:"video/mp4",size:1000,name:"a.mp4"}],value:""}, "V1"); await wait(30);
    ok("選到影片檔會擋下", !saved.length && toasts.some(t=>t.includes("圖片檔"))); }
  reset([v_("V1")]); as("Regina","manager");
  { nodes={cv_slot:{innerHTML:""}};
    await coverChosen({files:[{type:"image/jpeg",size:99*1024*1024,name:"big.jpg"}],value:""}, "V1"); await wait(30);
    ok("檔案太大會擋下", !saved.length && toasts.some(t=>t.includes("太大"))); }
  reset([v_("V1")]); as("Regina","manager");
  { nodes={cv_slot:{innerHTML:""}}; VIEW_AS="小葵";
    await coverChosen(fakeInput(), "V1"); await wait(30);
    ok("員工視角唯讀不給上傳", !saved.length && toasts.some(t=>t.includes("唯讀")));
    VIEW_AS=null; }
  reset([v_("V1")]); as("Regina","manager");
  { nodes={cv_slot:{innerHTML:""}};
    await coverChosen({files:[],value:""}, "V1"); await wait(30);
    ok("沒選檔案就什麼都不做", !saved.length && !toasts.length); }

  // ══ ⑥ 清單縮圖不受影響 ══
  reset([v_("V1",{cover:"https://storage/c.jpg"}), v_("V2")]); as("管理員","boss");
  { const h=viewVideos();
    ok("有封面的列出縮圖", h.includes("https://storage/c.jpg"));
    ok("沒封面的維持 ▶ 方塊", h.includes("▶")); }

  // ══ ⑦ render 不炸 ══
  reset([v_("V1",{cover:"https://storage/c.jpg"}), v_("V2")]);
  [["管理員","boss"],["Regina","manager"],["小葵","editor"]].forEach(([u,r])=>{
    ["V1","V2"].forEach(id=>{
      as(u,r); nodes={};
      try{ openVideoModal(id, true); ok(`[${r}] 編輯 ${id}`, modalHTML.includes('id="cv_slot"')); }
      catch(e){ ok(`[${r}] 編輯 ${id} → ${e.message}`, false); } }); });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
