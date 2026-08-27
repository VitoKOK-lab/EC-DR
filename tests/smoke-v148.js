// v148：打卡送不出去的時候，要有人講話。
//
// 災情：出貨的同仁說自己在上班，主管看到他沒打卡。查正式資料 —— 伺服器上今天
// 完全沒有他的打卡與登入紀錄，但他自己的畫面顯示「上班中・工時 8m」還在跳。
//
// 原因是三層同時失效，他不可能察覺：
//   ① Firestore 開了本機快取，寫不出去的東西會排隊在瀏覽器裡，而且**立刻顯示在
//      自己畫面上**。所以「員工看得到、主管看不到」。
//   ② clockIn 把錯誤整個吞掉（catch(e){}）。而且離線時 setDoc **不會拋錯，是永遠
//      不 resolve** —— 光包 try/catch 連觸發的機會都沒有，一定要自己設時限。
//      （下班打卡早就修過這個問題，上班打卡漏掉了。）
//   ③ 那條「目前離線」的紅色橫幅永遠不會出現：ONLINE 宣告成 true 之後，整份
//      程式碼再也沒有任何地方更新它。等於這個 App 完全沒有離線偵測。
//
// 這支測試把三層都釘住。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const FB =fs.readFileSync(path.join(__dirname,"..","fb.js"),"utf8");
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

let toasts=[], errToasts=[], writes=[], renders=0;
toast=(m,e)=>{ toasts.push(String(m)); if(e) errToasts.push(String(m)); };
const realRender=render;
render=function(){ renders++; return realRender.apply(this,arguments); };

function reset(opt){
  opt=opt||{};
  modalHTML=""; viewEl.innerHTML=""; fields={}; toasts=[]; errToasts=[]; writes=[]; renders=0;
  ONLINE=true; PENDING=false;
  global.window.DB={
    // 送得出去 / 送不出去（送不出去＝永遠不 resolve，就跟真的離線一樣）
    set:(c,id,o)=>{ writes.push(["set",c,id,o]);
      return opt.stuck ? new Promise(()=>{}) : (opt.reject ? Promise.reject(new Error("permission-denied")) : Promise.resolve()); },
    update:(c,id,p)=>{ writes.push(["update",c,id,p]); return opt.stuck?new Promise(()=>{}):Promise.resolve(); },
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{}, videosWatched:()=>true,
    netState:()=>({online:!opt.stuck, pending:!!opt.stuck}) };
  // pwSet/pwHash 要給：沒有的話 render() 會停在「請先設定你的密碼」那一頁，
  // 根本走不到有橫幅的主畫面
  const U=(name,role)=>({name, role, pwSet:true, pwHash:"pbkdf2$1$AA==$AA==", pwAt:"2020-01-01T00:00:00"});
  const raw={ users:[U("茂泉","ship"), U("Regina","manager"), U("Anna","intl")],
    settings:{dailyTarget:4,videoTags:["新片"],sources:["自製"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",pcOnly:true},
    schedule:{}, tasks:{}, shifts:opt.shifts||{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", opt.who||"茂泉");
  localStorage.setItem("ecdr_role", opt.role||"ship");
  VIEW_AS=null; BRAND=""; CUR_TAB="work";
}
const sh=(user,date,o)=>Object.assign({id:user+"__"+date, user, date, clockIn:date+"T10:19:00", clockOut:""},o||{});
let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

(async()=>{

// ══════════ ① 送不出去的時候要講話 ══════════
{ reset({stuck:true});
  const t0=Date.now();
  const okSent=await clockIn("茂泉");
  const took=Date.now()-t0;
  ok("送不出去時 clockIn 回 false（不再靜靜結束）", okSent===false, okSent);
  ok("不會卡住不放（有時限）", took<12000, took+"ms");
  ok("有紅字告訴員工", errToasts.length===1, toasts);
  if(errToasts.length) console.log("      「"+errToasts[0].slice(0,60)+"…」");
  ok("紅字要說「主管看不到你」", /主管看不到你已經上班|manager can't see/.test(errToasts[0]||""));
  ok("紅字不能叫人「再按一次」（那筆已經排在本機，再登入會直接跳過）",
     !/再按一次|press it again|try again/.test(errToasts[0]||"")); }
// 真的拋錯（例如權限被拒）也要講
{ reset({reject:true});
  const okSent=await clockIn("茂泉");
  ok("寫入被拒也回 false", okSent===false);
  ok("寫入被拒也有紅字", errToasts.length===1, toasts); }
// 正常送出去就安靜（不能每天上班都跳一則警告）
{ reset({});
  const okSent=await clockIn("茂泉");
  ok("正常打卡回 true", okSent===true);
  ok("正常打卡不吵人", errToasts.length===0, toasts);
  ok("而且真的寫了打卡", writes.some(w=>w[1]==="shifts"&&w[3]&&w[3].clockIn)); }
// 已經打過就不重打（本來的行為）
{ reset({shifts:{["茂泉__"+today]: sh("茂泉",today)}});
  const okSent=await clockIn("茂泉");
  ok("已經打過卡就不重寫", okSent===true && !writes.length, writes.length); }

// ══════════ ② 離線偵測真的接起來了 ══════════
{ reset({});
  ok("預設是連線", ONLINE===true);
  ok("有對外的回呼給 fb.js 用", typeof window.__onNet==="function"); }
{ reset({});
  window.__onNet({online:false, pending:false});
  ok("收到離線通知就會改狀態", ONLINE===false);
  ok("而且會重畫（不然橫幅不會出現）", renders>0, renders);
  const h=viewWork ? render()||viewEl.innerHTML : viewEl.innerHTML;
  ok("畫面上出現連不上的紅字", /連不上伺服器/.test(viewEl.innerHTML), viewEl.innerHTML.slice(0,120));
  ok("而且說清楚後果（別人看不到）", /主管跟同事都看不到/.test(viewEl.innerHTML)); }
{ reset({});
  window.__onNet({online:true, pending:true});
  render();
  ok("連上了但還有東西沒送出去 → 也要講", /有資料還沒送出去/.test(viewEl.innerHTML));
  ok("而且叫人先別關分頁", /不要關掉這個分頁|don't close this tab/i.test(viewEl.innerHTML)); }
{ reset({});
  window.__onNet({online:true, pending:false});
  render();
  ok("一切正常就不要有橫幅", !/連不上伺服器|有資料還沒送出去/.test(viewEl.innerHTML)); }
// 狀態沒變就不要一直重畫（每秒重畫整頁會把畫面卡死）
{ reset({});
  window.__onNet({online:true, pending:false});
  const n0=renders;
  window.__onNet({online:true, pending:false});
  window.__onNet({online:true, pending:false});
  ok("狀態沒變不重畫", renders===n0, {n0, now:renders}); }

// ══════════ ③ 還沒同步的打卡要標出來 ══════════
{ reset({shifts:{["茂泉__"+today]: sh("茂泉",today)}});
  PENDING=true;
  const pill=dashStatusPill(STATE.shifts["茂泉__"+today]);
  ok("自己那筆標「還沒同步」", /還沒同步/.test(pill), pill);
  ok("而且還是看得出在上班中", /上班中/.test(pill)); }
{ reset({shifts:{["茂泉__"+today]: sh("茂泉",today)}});
  PENDING=false;
  ok("送出去了就不標", !/還沒同步/.test(dashStatusPill(STATE.shifts["茂泉__"+today]))); }
// 別人的卡不能亂標（我這台不可能有別人的待送寫入）
{ reset({who:"Regina", role:"manager", shifts:{["茂泉__"+today]: sh("茂泉",today)}});
  PENDING=true;
  ok("主管看別人的卡不會被標成未同步",
     !/還沒同步/.test(dashStatusPill(STATE.shifts["茂泉__"+today]))); }
{ reset({who:"茂泉", role:"ship", shifts:{["茂泉__"+today]: sh("茂泉",today,{clockOut:today+"T18:00:00"})}});
  PENDING=true;
  ok("下班那筆沒送出去也要標", /還沒同步/.test(dashStatusPill(STATE.shifts["茂泉__"+today]))); }
// 海外看到的是英文
{ reset({who:"Anna", role:"intl", shifts:{["Anna__"+today]: sh("Anna",today)}});
  PENDING=true;
  const pill=dashStatusPill(STATE.shifts["Anna__"+today]);
  ok("英文介面標 not synced", /not synced/.test(pill) && !/還沒同步/.test(pill), pill); }
{ reset({who:"Anna", role:"intl"});
  window.__onNet({online:false, pending:false}); render();
  ok("英文介面的離線橫幅也是英文",
     /Can't reach the server/.test(viewEl.innerHTML) && !/連不上伺服器/.test(viewEl.innerHTML)); }

// ══════════ ④ fb.js 的偵測演算法：把它原樣搬過來跑 ══════════
// fb.js 是 ES module（頂層有 import），沒辦法整份 eval，所以只把連線偵測那一段
// 抽出來實際執行 —— 掃字串只能證明「有寫」，不能證明「算得對」。
// 這個做法跟 smoke-v139 驗 fb.js 節流演算法是同一套。
{
  const m=FB.match(/const BOOT_AT = Date\.now\(\);[\s\S]*?\n  \}\n(?=  \/\/ 瀏覽器自己的離線事件)/);
  ok("抽得到 fb.js 的連線偵測那一段", !!m);
  if(m){
    let seen=[];
    const sandbox={ window:{ __onNet:(st)=>seen.push(st) }, Date };
    const fn=new Function("window","Date","NOW", m[0]+"\n; return { netUpdate, get sawServer(){return sawServer;}, net };");
    // 情境 A：開機頭幾秒先給快取 —— 不可以馬上喊離線（不然每個人一進來都跳紅字）
    { seen=[]; const api=fn(sandbox.window, {now:()=>Date.now()}, 0);
      api.netUpdate({fromCache:true, hasPendingWrites:false});
      ok("開機頭幾秒的快取快照不報離線", api.net.online===true, api.net); }
    // 情境 B：連上伺服器之後再掉線 → 要報離線
    { seen=[]; const api=fn(sandbox.window, {now:()=>Date.now()}, 0);
      api.netUpdate({fromCache:false, hasPendingWrites:false});
      ok("連上伺服器 → online", api.net.online===true);
      api.netUpdate({fromCache:true, hasPendingWrites:false});
      ok("連上過之後再掉線 → 報離線", api.net.online===false, api.net);
      ok("而且有通知 app.js", seen.some(x=>x.online===false), seen); }
    // 情境 C：有東西沒送出去 → pending
    { seen=[]; const api=fn(sandbox.window, {now:()=>Date.now()}, 0);
      api.netUpdate({fromCache:false, hasPendingWrites:false});
      api.netUpdate({fromCache:false, hasPendingWrites:true});
      ok("有待送寫入 → pending=true", api.net.pending===true, api.net);
      ok("而且還是 online（連得上、只是還沒送完）", api.net.online===true); }
    // 情境 D：狀態沒變就不要一直吵 app.js（每次快照都重畫會把畫面卡死）
    { seen=[]; const api=fn(sandbox.window, {now:()=>Date.now()}, 0);
      api.netUpdate({fromCache:false, hasPendingWrites:false});
      const n0=seen.length;
      api.netUpdate({fromCache:false, hasPendingWrites:false});
      api.netUpdate({fromCache:false, hasPendingWrites:false});
      ok("狀態沒變不重複通知", seen.length===n0, {n0, now:seen.length}); }
    // 情境 E：送出去之後要自己恢復
    { seen=[]; const api=fn(sandbox.window, {now:()=>Date.now()}, 0);
      api.netUpdate({fromCache:false, hasPendingWrites:true});
      api.netUpdate({fromCache:false, hasPendingWrites:false});
      ok("送完之後 pending 自己歸零", api.net.pending===false); }
  }
}
{ const CODE=FB.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n");
  ok("打卡那條訂閱有帶 includeMetadataChanges（不然拿不到 fromCache）",
     /shifts[\s\S]{0,200}includeMetadataChanges/.test(CODE));
  ok("有把狀態回呼給 app.js", /window\.__onNet/.test(CODE));
  ok("有對外提供 netState()", /netState/.test(CODE));
  ok("fromCache 拿來判斷連不連得上", /fromCache/.test(CODE));
  ok("hasPendingWrites 拿來判斷送出去了沒", /hasPendingWrites/.test(CODE));
  ok("開機頭幾秒不報離線（本來就會先給快取）", /BOOT_GRACE|sawServer/.test(CODE)); }

// ══════════ ⑤ 沒把既有的東西弄壞 ══════════
{ reset({});
  ["work","cal"].forEach(tab=>{ CUR_TAB=tab;
    try{ render(); ok(`[出貨] ${tab} 畫得出來`, true); }catch(e){ ok(`[出貨] ${tab} → ${e.message}`, false); } }); }
{ reset({who:"Regina", role:"manager"});
  ["work","team","cal"].forEach(tab=>{ CUR_TAB=tab;
    try{ render(); ok(`[經理人] ${tab} 畫得出來`, true); }catch(e){ ok(`[經理人] ${tab} → ${e.message}`, false); } }); }
// 下班打卡本來就有的防護沒被動到
{ const CODE=APP.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n");
  ok("下班打卡照樣會回報失敗", /下班沒有記錄成功|Clock-out didn't save/.test(CODE));
  ok("上班打卡不再是空的 catch", !/grabGeo[\s\S]{0,200}\}catch\(e\)\{\}\n\}/.test(CODE)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
