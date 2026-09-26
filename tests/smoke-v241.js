// v241：新增影片時，原始片名不准用括號類符號——純文字就好，備註另外寫。
//
// 老闆：「在新增影片，我要強制檔名不能使用() {}[] 「」，只讓員工使用純文字，
// 任何備註要使用標籤或寫在備註。」
//
// 動機很直接：v238／v239 那一輪就是在補救「(podcast)」這種寫法混進片名，
// 混進去之後畫面上要花好幾輪才能看得下去（月排程清單截斷、字級縮小…）。
// 這次直接在「新增影片」存檔的時候擋下來，比事後在清單上一支一支修簡單。
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
let modalHTML="", viewEl=el(), fields={};
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

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,260));} }

let writes=[], toasts=[];
toast=(m,isErr)=>{ toasts.push({m:String(m),isErr:!!isErr}); };
function reset(){
  writes=[]; toasts=[]; modalHTML=""; fields={}; VIEW_AS=null; BRAND="";
  global.window.DB={ set:async(c,id,o)=>{writes.push(["set",c,id,o]);}, update:async()=>{}, del:async()=>{},
    scheduleSet:async()=>{}, setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
}
// 存檔前把其他必填欄位都填好，才不會被「日期沒填」這種無關的擋下來蓋掉
// 真正要測的那條規則（v184：日期／時間／存檔資料夾必填）。
function fillRequired(name){
  fields={ sv_name:name, sv_vcopy:"要講的台詞", sv_link:"https://drive.google.com/drive/folders/x",
    sv_date:"2026-10-01", sv_time:"10:00" };
}

(async()=>{

// ══════════ ① 純文字片名：照樣存得進去 ══════════
{ reset(); newSimpleVideo(); fillRequired("這是一個正常的片名");
  await MODAL_CONFIRM();
  ok("**純文字片名存檔成功**", writes.some(w=>w[0]==="set"&&w[1]==="videos"), writes);
  ok("沒有跳出跟符號有關的錯誤", !toasts.some(t=>/符號/.test(t.m)), toasts); }

// ══════════ ② 半形括號 ( ) 擋下來 ══════════
{ reset(); newSimpleVideo(); fillRequired("(podcast)我的鑑定功力");
  await MODAL_CONFIRM();
  ok("**存檔被擋下來**（不是靜靜失敗——有錯誤訊息）", writes.length===0 && toasts.some(t=>t.isErr), {writes, toasts});
  ok("**錯誤訊息點名是「(」這個符號**", toasts.some(t=>t.isErr && t.m.includes("(")), toasts); }

// ══════════ ③ 全形括號（）也擋（老闆自己在上一輪訊息裡就同時打過半形全形）══════════
// ⚠️ 兩邊都要用全形——只用一邊全形一邊半形的話，半形那個字元自己就會被舊規則
// 攔下來，測不出「全形括號單獨存在時也被擋」這件事（第一版就是這樣測不出來的）。
{ reset(); newSimpleVideo(); fillRequired("（podcast）舊片名還留著這段文字");
  await MODAL_CONFIRM();
  ok("**全形括號一樣擋下來**", writes.length===0 && toasts.some(t=>t.isErr), {writes, toasts}); }

// ══════════ ④ 逐一驗過老闆列的每一種符號：{}[]「」 ══════════
{ const cases=[
    ["大括號 {}", "片名{備註}"],
    ["方括號 []", "片名[備註]"],
    ["日文引號 「」", "片名「備註」"],
  ];
  for(const [label, name] of cases){
    reset(); newSimpleVideo(); fillRequired(name);
    await MODAL_CONFIRM();
    ok(`**${label} 擋下來**`, writes.length===0 && toasts.some(t=>t.isErr), {label, writes, toasts});
  } }

// ══════════ ⑤ 不在老闆清單裡的正常標點照樣放行（不要矯枉過正）══════════
{ reset(); newSimpleVideo(); fillRequired("片名－有破折號：也有冒號，還有逗號");
  await MODAL_CONFIRM();
  ok("**破折號／冒號／逗號這些不擋**（老闆只點名括號類，不是禁掉所有標點）",
     writes.some(w=>w[0]==="set"&&w[1]==="videos"), writes); }

// ══════════ ⑥ 純文字驗證要在「片名不能空白」之後、其他必填檢查之前都測得到 ══════════
{ reset(); newSimpleVideo(); fillRequired("");
  await MODAL_CONFIRM();
  ok("空片名照舊擋（沒有被新規則蓋掉舊規則）", writes.length===0 && toasts.some(t=>/請輸入原始片名/.test(t.m)), toasts); }

console.log(`\nv241（新增影片：原始片名禁用括號類符號）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);

})();
