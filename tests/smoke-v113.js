// v113：編輯視窗裡的動作鍵不會把沒存的欄位帶走。
//
// 跟 v112（上傳封面）同一個家族：使用者在編輯視窗裡打了字還沒按儲存，
// 這時候按了視窗裡的另一個動作鍵，那個動作把視窗關掉／重建，剛打的字就沒了，
// 而且 closeModal 會把 MODAL_DIRTY 歸零，連「還沒存喔」的提醒都不會跳。
//
// 掃到三處：
//   ① 審片「通過／退回」（reviewVid）—— 審片卡在四個視窗裡都有
//   ② 「移到剪輯的今日工作」（reworkVideo）
//   ③ 海外／蝦皮／馬來的編輯視窗根本沒有 MODAL_DIRTY 追蹤 ——
//      點背景就直接關掉，字全沒，也不會提醒
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{_s:new Set(),toggle(){},add(c){this._s.add(c);},remove(c){this._s.delete(c);},contains(c){return this._s.has(c);}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},click(){},
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>"退回原因";
let calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"",rawName:"毛片"+id,videoCopy:"口播",rawLink:"http://raw",
  cover:"",stage:"已完成",editor:"小葵",claimedBy:"小葵",assignedTo:"",scheduledDate:null,publishTime:"",
  finishedAt:D(-1)+"T05:00:00",publishedLink:"http://p",driveFolder:"",productUrl:"",note:"",mainType:"",
  source:"老闆自拍",refLink:"",reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],
  usageHistory:[],metrics:[]},o||{});
function reset(videos){
  calls=[]; toasts=[]; fields={}; modalHTML="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both"},{name:"Anna",role:"intl"},
                 {name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"acctEN"}],shopeeAccounts:["蝦皮A"],msAccounts:["馬來A"],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  CUR_TAB="videos"; VIEW_AS=null; VID_LANG=""; VID_VIEW="raw"; VID_UNSCHED=false;
  MODAL_DIRTY=false; MODAL_SAVE=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);},
    update:async(c,id,p)=>{calls.push(["update",c,id,p]); const v=vid(id); if(v) Object.assign(v,p);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
  localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
// 把編輯視窗的欄位填好（saveVideo 會讀這些）
function fillEdit(o){
  Object.assign(fields, {e_code:"26V1",e_raw:"毛片V1",e_name:"",e_vcopy:"口播",e_ref:"",
    e_date:"",e_src:"老闆自拍",e_stage:"已完成",e_editor:"小葵",e_url:"",e_note:"",
    e_drive:"",e_rawlink:"http://raw",e_lang:""}, o||{});
}
const upd=(id)=>calls.filter(c=>c[0]==="update"&&c[1]==="videos"&&c[2]===id).map(c=>c[3]);
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{
  // ══ ① 審片：Regina 順手改了備註又按「通過」 ══
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  ok("編輯視窗會登記怎麼存", typeof MODAL_SAVE==="function");
  fillEdit({e_note:"這支要配珠寶介紹的貼文"});
  MODAL_DIRTY=true;                        // 使用者動過欄位
  reviewVid("V1","通過"); await wait(260);
  { const p=upd("V1");
    ok("備註先被存起來", p.some(x=>x.note==="這支要配珠寶介紹的貼文"));
    ok("審片也有寫進去", p.some(x=>x.reviewStatus==="通過"));
    ok("順序是先存再審", p.findIndex(x=>x.note!==undefined) < p.findIndex(x=>x.reviewStatus!==undefined)); }

  // 沒動過欄位就不要多存一筆（保持原本行為）
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true); fillEdit();
  MODAL_DIRTY=false;
  reviewVid("V1","通過"); await wait(260);
  { const p=upd("V1");
    ok("沒動過欄位就只寫審片那一筆", p.length===1 && p[0].reviewStatus==="通過"); }

  // 退回也一樣
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true); fillEdit({e_note:"備註也要留著"});
  MODAL_DIRTY=true;
  reviewVid("V1","退回"); await wait(260);
  { const p=upd("V1");
    ok("退回前也先存", p.some(x=>x.note==="備註也要留著"));
    ok("退回有寫進去", p.some(x=>x.reviewStatus==="退回")); }

  // 存不起來就停手（商品填了卻沒填商品頁網址 → saveVideo 會擋）
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  fillEdit({e_url:""}); fields.e_pn0="茶晶手鍊"; fields.e_pp0="1200"; fields.e_ps0="980";
  MODAL_DIRTY=true;
  reviewVid("V1","通過"); await wait(260);
  { ok("存不起來就不要偷偷審過去", !upd("V1").some(x=>x.reviewStatus==="通過"));
    ok("有告訴使用者為什麼", toasts.some(t=>t.includes("商品頁網址"))); }

  // ══ ② 移到剪輯的今日工作 ══
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true); fillEdit({e_note:"移走之前打的備註"});
  MODAL_DIRTY=true;
  reworkVideo("V1"); await wait(260);
  { const p=upd("V1");
    ok("移走之前先存", p.some(x=>x.note==="移走之前打的備註"));
    ok("真的有移到剪輯中", p.some(x=>x.stage==="剪輯中")); }
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true); fillEdit();
  MODAL_DIRTY=false;
  reworkVideo("V1"); await wait(260);
  ok("沒動過欄位就只寫一筆", upd("V1").length===1);

  // ══ ③ 海外／蝦皮／馬來的編輯視窗也要有「還沒存」保護 ══
  const SRC=v_("S1",{stage:"已上片",published:true,tags:["舊片"],driveFolder:"http://d",
    finishedAt:"2020-01-01T00:00:00",nameEn:"Source EN"});
  reset([SRC, v_("E1",{locale:"en",sourceVideoId:"S1",account:"acctEN",stage:"待處理",
    finishedAt:"",publishedLink:"",rawLink:""})]);
  as("Anna","intl");
  openIntlModal("E1");
  ok("海外視窗有追蹤有沒有動過欄位", modalHTML.includes('oninput="MODAL_DIRTY=true"'));
  ok("海外視窗也登記了怎麼存", typeof MODAL_SAVE==="function");

  reset([SRC, v_("P1",{channel:"shopee",sourceVideoId:"S1",account:"蝦皮A",stage:"待處理",
    finishedAt:"",publishedLink:"",rawLink:""})]);
  as("小葵","editor");
  openChModal("shopee","P1");
  ok("蝦皮視窗有追蹤有沒有動過欄位", modalHTML.includes('oninput="MODAL_DIRTY=true"'));
  ok("蝦皮視窗也登記了怎麼存", typeof MODAL_SAVE==="function");

  // 動過欄位就不能被背景點掉（跟一創視窗一致）
  reset([SRC, v_("E1",{locale:"en",sourceVideoId:"S1",account:"acctEN",stage:"待處理",
    finishedAt:"",publishedLink:"",rawLink:""})]);
  as("Anna","intl");
  openIntlModal("E1");
  MODAL_DIRTY=true; toasts=[];
  { const before=modalHTML;
    modalBackdrop({target:{classList:{contains:(c)=>c==="modal"}}});
    ok("有沒存的東西時點背景不會關掉", modalHTML===before && modalHTML.length>0);
    ok("而且會講出來為什麼沒關", toasts.some(t=>/還沒存|Not saved/.test(t))); }
  MODAL_DIRTY=false;
  modalBackdrop({target:{classList:{contains:(c)=>c==="modal"}}});
  ok("沒動過就點得掉", modalHTML==="");

  // ══ ④ 關掉視窗要把登記清乾淨（不然下一個視窗會用到上一個的存檔方式）══
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  ok("開著時有登記", typeof MODAL_SAVE==="function");
  closeModal();
  ok("關掉就清乾淨", MODAL_SAVE===null);
  ok("關掉也清掉未存旗標", MODAL_DIRTY===false);
  // 檢視視窗（不能編輯）不該留下上一個的登記
  reset([v_("V1")]); as("Regina","manager");
  openVideoModal("V1", true);
  closeModal();
  openVideoModal("V1", false);
  ok("檢視視窗不會沿用上一個的存檔方式", MODAL_SAVE===null);

  // ══ ⑤ modalFlushEdits 本身 ══
  reset([v_("V1")]);
  MODAL_DIRTY=false; MODAL_SAVE=null;
  ok("沒東西要存就直接放行", (await modalFlushEdits())===true);
  MODAL_DIRTY=true; MODAL_SAVE=async()=>false;
  ok("存不起來就回 false", (await modalFlushEdits())===false);
  ok("存不起來時未存旗標要留著", MODAL_DIRTY===true);
  MODAL_DIRTY=true; MODAL_SAVE=async()=>true;
  ok("存好了就回 true", (await modalFlushEdits())===true);
  ok("存好了就把未存旗標清掉", MODAL_DIRTY===false);

  // afterFlush：沒東西要存時保持同步（審片等動作才不會慢半拍）
  reset([v_("V1")]);
  MODAL_DIRTY=false; MODAL_SAVE=null;
  { let ran=false; afterFlush(()=>{ran=true;});
    ok("沒東西要存時同步執行", ran===true); }
  { let ran=false; MODAL_DIRTY=true; MODAL_SAVE=async()=>true;
    afterFlush(()=>{ran=true;});
    ok("有東西要存時先等存完", ran===false);
    await wait(20);
    ok("存完才執行", ran===true); }
  { let ran=false; MODAL_DIRTY=true; MODAL_SAVE=async()=>false;
    afterFlush(()=>{ran=true;}); await wait(20);
    ok("存不起來就不執行", ran===false); }

  // ══ ⑥ render 不炸 ══
  reset([v_("V1")]);
  [["Regina","manager"],["管理員","boss"],["小葵","editor"]].forEach(([u,r])=>{
    as(u,r);
    try{ openVideoModal("V1", true); ok(`[${r}] 編輯視窗畫得出來`, modalHTML.length>0); }
    catch(e){ ok(`[${r}] 編輯視窗 → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
