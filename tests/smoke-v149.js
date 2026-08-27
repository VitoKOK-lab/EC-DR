// v149：出勤可以手動補登。
//
// 為什麼要有：打卡是靠員工自己的瀏覽器寫的，網路不通那筆會卡在他那台
//（他自己看得到、伺服器上沒有），真的掉了就沒有人救得回來 ——
// 在這之前整個系統寫得到出勤的只有三個地方：自己打上班、自己打下班、
// 系統自動補下班。出勤是算薪水的依據，不能有「壞了只能認了」的東西。
//
// 兩個原則：
//   ① 一定要留痕跡 —— 補過的永遠標「人工補登」，寫明誰補的、為什麼。
//      出勤資料被人改過而看不出來，比不能改更糟。
//   ② 原因必填 —— 事後查得出這一筆為什麼長這樣。
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
const confirmBtn=el();   // showModal 用 btn.onclick=… 掛確認鍵，這顆要固定同一個
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(id==="modalConfirm") return confirmBtn;
    if(id==="modalRoot"){ const e=el(); Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}}); return e; }
    const e=el(); if(fields[id]!=null) e.value=fields[id]; return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let toasts=[], errToasts=[], writes=[], logs=[];
toast=(m,e)=>{ toasts.push(String(m)); if(e) errToasts.push(String(m)); };
const realLogA=logA; logA=(a,t)=>{ logs.push([a,t]); };

const D=(n)=>{ const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const sh=(user,date,o)=>Object.assign({id:user+"__"+date, user, date,
  clockIn:date+"T10:19:00", clockOut:"", inDev:"ABC123", inDevUA:"Windows・Chrome", inMobile:false},o||{});
function reset(opt){
  opt=opt||{};
  modalHTML=""; viewEl.innerHTML=""; fields={}; toasts=[]; errToasts=[]; writes=[]; logs=[];
  global.window.DB={ set:(c,id,o)=>{ writes.push(["set",c,id,o]);
      return opt.stuck?new Promise(()=>{}):Promise.resolve(); },
    update:(c,id,p)=>{ writes.push(["update",c,id,p]); return Promise.resolve(); },
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{}, videosWatched:()=>true,
    netState:()=>({online:true,pending:false}) };
  const U=(name,role)=>({name, role, pwSet:true, pwHash:"pbkdf2$1$AA==$AA==", pwAt:"2020-01-01T00:00:00"});
  const raw={ users:[U("茂泉","ship"), U("泓儒","editor"), U("HR","hr"), U("管理員","boss"), U("Regina","manager")],
    settings:{dailyTarget:4,videoTags:["新片"],sources:["自製"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00", workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:opt.shifts||{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", opt.who||"HR");
  localStorage.setItem("ecdr_role", opt.role||"hr");
  VIEW_AS=null; BRAND=""; CUR_TAB="attend"; ATT_YM=null; ONLINE=true; PENDING=false;
}
let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
const lastWrite=()=>{ const w=writes.filter(x=>x[1]==="shifts"); return w.length?w[w.length-1][3]:null; };

(async()=>{

// ══════════ ① 誰可以補 ══════════
{ reset({who:"HR", role:"hr"});      ok("人資可以補", canFixAttend()===true); }
{ reset({who:"管理員", role:"boss"}); ok("管理員可以補", canFixAttend()===true); }
{ reset({who:"Regina", role:"manager"}); ok("經理人不行（他本來就沒有出勤頁）", canFixAttend()===false); }
{ reset({who:"泓儒", role:"editor"}); ok("剪輯不行", canFixAttend()===false); }
{ reset({who:"茂泉", role:"ship"});  ok("員工不能改自己的出勤", canFixAttend()===false); }
// 就算硬叫也要擋
{ reset({who:"茂泉", role:"ship"});
  attFix("茂泉", today);
  ok("員工硬叫 attFix 會被擋下", modalHTML==="" && errToasts.length===1, {m:modalHTML.length, t:toasts}); }
// 員工視角是唯讀
{ reset({who:"HR", role:"hr"}); VIEW_AS="茂泉";
  attFix("茂泉", today);
  ok("員工視角（唯讀預覽）不能補", modalHTML==="", modalHTML.slice(0,60)); }

// ══════════ ② 補一天完全沒有紀錄的 ══════════
{ reset({});
  attFix("茂泉", today);
  ok("視窗打得開", modalHTML.includes('id="af_in"') && modalHTML.includes('id="af_out"'));
  ok("有原因那一格", modalHTML.includes('id="af_note"'));
  ok("有講清楚會留痕跡", /會永遠標著「人工補登」/.test(modalHTML));
  fields.af_in="10:19"; fields.af_out="19:30"; fields.af_note="網路不通，打卡沒送出去";
  await confirmBtn.onclick();
  const p=lastWrite();
  ok("寫進去了", !!p, writes.length);
  ok("文件 id 對", writes.some(w=>w[2]==="茂泉__"+today), writes.map(w=>w[2]));
  ok("上班時間對", p && p.clockIn===today+"T10:19:00", p&&p.clockIn);
  ok("下班時間對", p && p.clockOut===today+"T19:30:00", p&&p.clockOut);
  ok("記下是誰補的", p && p.manualBy==="HR", p&&p.manualBy);
  ok("記下什麼時候補的", p && !!p.manualAt);
  ok("記下原因", p && p.manualNote==="網路不通，打卡沒送出去", p&&p.manualNote);
  ok("不會被當成系統自動補下班", p && p.autoOut===false, p&&p.autoOut);
  ok("有寫進操作紀錄", logs.some(l=>l[0]==="補登出勤"), logs); }

// ══════════ ③ 補既有的一筆：稽核資料不能被洗掉 ══════════
{ const d=D(-2);
  reset({shifts:{[ "茂泉__"+d ]: sh("茂泉",d,{clockOut:d+"T18:00:00", inDev:"XYZ999",
    inDevUA:"Windows・Chrome", inMobile:true, inNewDev:true, inGeo:{lat:25,lng:121},
    issueNote:"塞車", issueAt:d+"T11:00:00"})}});
  attFix("茂泉", d);
  ok("既有的時間會帶出來", modalHTML.includes('value="10:19"') && modalHTML.includes('value="18:00"'), modalHTML.slice(0,200));
  fields.af_in="09:30"; fields.af_out="18:30"; fields.af_note="打卡機當機";
  await confirmBtn.onclick();
  const p=lastWrite();
  ok("時間改掉了", p && p.clockIn===d+"T09:30:00" && p.clockOut===d+"T18:30:00", p&&[p.clockIn,p.clockOut]);
  ok("打卡當下記的裝置沒被洗掉", p && p.inDev==="XYZ999", p&&p.inDev);
  ok("手機／新裝置的標記沒被洗掉", p && p.inMobile===true && p.inNewDev===true, p&&[p.inMobile,p.inNewDev]);
  ok("位置沒被洗掉", p && p.inGeo && p.inGeo.lat===25, p&&p.inGeo);
  ok("本人填的異常說明沒被洗掉", p && p.issueNote==="塞車", p&&p.issueNote); }

// ══════════ ④ 防呆 ══════════
async function blocked(setup, label){
  reset({}); attFix("茂泉", today);
  Object.assign(fields, setup);
  const before=writes.length; errToasts=[];
  const r=await confirmBtn.onclick();
  ok(label+" → 擋住不寫", writes.length===before, {before, after:writes.length});
  ok(label+" → 有紅字", errToasts.length>0, toasts);
  if(errToasts.length) console.log("      「"+errToasts[0]+"」");
}
await blocked({af_in:"", af_out:"18:00", af_note:"忘了打"}, "【防呆】沒填上班時間");
await blocked({af_in:"25:99", af_out:"", af_note:"忘了打"}, "【防呆】上班時間格式亂填");
await blocked({af_in:"10:00", af_out:"09:00", af_note:"忘了打"}, "【防呆】下班早於上班");
await blocked({af_in:"10:00", af_out:"18:00", af_note:""}, "【防呆】沒填原因");
await blocked({af_in:"10:00", af_out:"18:00", af_note:"   "}, "【防呆】原因只有空白");
// 未來的日期不能補
{ reset({});
  attFix("茂泉", D(1));
  ok("【防呆】不能補未來的日期 → 視窗根本不開", modalHTML==="");
  ok("【防呆】不能補未來的日期 → 有紅字", errToasts.length===1, toasts); }
// 只填上班不填下班是可以的（人還在上班）
{ reset({}); attFix("茂泉", today);
  fields.af_in="10:19"; fields.af_out=""; fields.af_note="網路不通";
  await confirmBtn.onclick();
  const p=lastWrite();
  ok("只補上班、下班留空是允許的", !!p && p.clockIn===today+"T10:19:00" && p.clockOut==="", p&&[p.clockIn,p.clockOut]); }
// 送不出去要講話（跟打卡同一套）
{ reset({stuck:true}); attFix("茂泉", today);
  fields.af_in="10:19"; fields.af_out="18:00"; fields.af_note="網路不通";
  await confirmBtn.onclick();
  ok("補登送不出去也要講", errToasts.length===1, toasts);
  // showModal 只有在 onConfirm 回 false 以外才 closeModal，所以「視窗還在」＝我們有回 false
  ok("而且視窗不關掉（讓人知道還沒成功）", modalHTML!=="", modalHTML.length); }

// ══════════ ⑤ 補過的一定要看得出來 ══════════
{ const d=D(-1);
  reset({shifts:{["茂泉__"+d]: sh("茂泉",d,{clockOut:d+"T18:00:00",
    manualBy:"HR", manualAt:d+"T20:00:00", manualNote:"網路不通"})}});
  const pill=attManualPill(STATE.shifts["茂泉__"+d]);
  ok("補過的標「人工補登」", /人工補登/.test(pill), pill);
  ok("滑鼠移上去看得到誰補的", /HR/.test(pill), pill);
  ok("滑鼠移上去看得到原因", /網路不通/.test(pill), pill);
  ok("attendOf 也帶得出來", attendOf(STATE.shifts["茂泉__"+d]).manual===true); }
{ const d=D(-1);
  reset({shifts:{["茂泉__"+d]: sh("茂泉",d,{clockOut:d+"T18:00:00"})}});
  ok("沒補過的不標", attManualPill(STATE.shifts["茂泉__"+d])===""); }
// 明細表上真的看得到
{ const d=D(-1);
  reset({shifts:{["茂泉__"+d]: sh("茂泉",d,{clockOut:d+"T18:00:00",
    manualBy:"HR", manualAt:d+"T20:00:00", manualNote:"網路不通"})}});
  const h=attDetailTable("茂泉", d.slice(0,7));
  ok("個人明細上標得出來", /人工補登/.test(h)); }

// ══════════ ⑥ 入口都在 ══════════
{ reset({});
  const h=viewAttend();
  ok("出勤頁有「補登出勤」那張卡", /補登出勤/.test(h));
  ok("卡上可以選同仁", /id="afx_who"/.test(h));
  ok("卡上可以選日期", /id="afx_date"/.test(h));
  ok("日期不給選未來（max=今天）", h.includes('max="'+today+'"'));
  ok("今日出勤每一列有補登鍵", /attFix\('茂泉','/.test(h)); }
{ reset({});
  const h=viewAttend();
  ok("完全沒紀錄的人也有補登鍵（這正是打卡掉了的那種）", /attFix\('茂泉'/.test(h)); }
// 沒權限的人看不到那些鍵
{ reset({who:"泓儒", role:"editor"});
  ok("沒權限就沒有補登鍵", attFixBtn("茂泉", today)===""); }
// 指定日期那個入口的防呆
{ reset({});
  fields.afx_who=""; fields.afx_date=today;
  attFixAny();
  ok("【防呆】沒選同仁", modalHTML==="" && errToasts.length===1, toasts); }
{ reset({});
  fields.afx_who="茂泉"; fields.afx_date="";
  attFixAny();
  ok("【防呆】沒選日期", modalHTML==="" && errToasts.length===1, toasts); }
{ reset({});
  fields.afx_who="茂泉"; fields.afx_date=D(-3);
  attFixAny();
  ok("選好人跟日期就開得了視窗", modalHTML.includes('id="af_in"')); }

// ══════════ ⑦ 沒把既有的東西弄壞 ══════════
{ reset({shifts:{["茂泉__"+today]: sh("茂泉",today)}});
  ["hr","boss"].forEach(r=>{ localStorage.setItem("ecdr_role", r);
    localStorage.setItem("ecdr_user", r==="hr"?"HR":"管理員");
    CUR_TAB="attend";
    try{ render(); ok(`[${r}] 出勤頁畫得出來`, true); }catch(e){ ok(`[${r}] 出勤頁 → ${e.message}`, false); } }); }
{ reset({who:"茂泉", role:"ship", shifts:{["茂泉__"+today]: sh("茂泉",today)}});
  ["work","team"].forEach(tab=>{ CUR_TAB=tab;
    try{ render(); ok(`[出貨] ${tab} 畫得出來`, true); }catch(e){ ok(`[出貨] ${tab} → ${e.message}`, false); } }); }
// 自己打卡那條路沒被動到
{ const CODE=APP.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n");
  ok("上班打卡還是走 clockIn", /async function clockIn\(name\)/.test(CODE));
  ok("補登不會把自己標成系統自動補下班", /manualBy:currentUser\(\)/.test(CODE) && /autoOut:false/.test(CODE)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
