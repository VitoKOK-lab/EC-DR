// v192：上線了新版本，開著的分頁要知道
//
// 老闆：「我在手機版本還是看不到」「也沒有看到搜尋欄」
// —— 搜尋欄是更早兩版就上線的東西，他連那個都看不到，代表他手機上那個分頁
//    至少落後三個版本。程式沒問題（390px 下畫面是好的，我實際跑過），
//    是那個分頁一直沒有重新抓過。
//
// 為什麼會這樣：index.html 的 cache-control 只有 600 秒，但**分頁一直開著就
// 不會重新抓**。手機把背景分頁凍起來、桌機整天開著同一個分頁工作，兩種都一樣。
// 27 個人整天開著 —— 每上線一次，等於每個人都要自己想到「關掉重開」。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,open:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
// 假裝這一份是用 app.js?v=AAA 載進來的
const SCRIPT_EL={ getAttribute:()=>"app.js?v=aaaaaaaaaaaa" };
let BODY_KIDS=[], BY_ID={};
global.document={ title:"電商部協作系統", hidden:false,
  getElementById:(id)=>BY_ID[id]||null,
  querySelector:(sel)=>sel.includes("app.js?v=")?SCRIPT_EL:null,
  querySelectorAll:()=>[],
  createElement:()=>{ const e=el(); e.appendChild=(c)=>{ e.__kids=(e.__kids||[]).concat([c]); }; return e; },
  addEventListener:(k,f)=>{ (global.__docEv[k]=global.__docEv[k]||[]).push(f); },
  body:{ classList:{toggle(){},add(){},remove(){}},
         appendChild:(n)=>{ BODY_KIDS.push(n); BY_ID[n.id]=n; } } };
global.__docEv={}; global.__winEv={};
global.window={addEventListener:(k,f)=>{ (global.__winEv[k]=global.__winEv[k]||[]).push(f); },
  innerWidth:390,innerHeight:844,scrollY:0,scrollTo(){},DB:null,location:{reload(){ global.__reloaded=true; }}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
// fetch：由每個測試決定線上回什麼版本
global.__served="aaaaaaaaaaaa"; global.__fetches=[];
global.fetch=async(u,o)=>{ global.__fetches.push({u:String(u), cache:o&&o.cache});
  return { ok:true, text:async()=>`<script src="app.js?v=${global.__served}"></script>` }; };
eval(src);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
const wait=(ms)=>new Promise(r=>setTimeout(r,ms||10));
function reset(){ BODY_KIDS=[]; BY_ID={}; global.__fetches=[]; global.__reloaded=false;
  VER_NEW=""; VER_LAST=0; }
const bar=()=>BODY_KIDS.find(n=>n.id==="verBar");

(async()=>{
// ══════════ ① 讀得到自己是哪一版 ══════════
{ ok("**讀得到自己載入時的版本戳**", VER_NOW==="aaaaaaaaaaaa", VER_NOW); }

// ══════════ ② 線上沒換版 → 什麼都不做 ══════════
{ reset(); global.__served="aaaaaaaaaaaa";
  await verCheck(true); await wait();
  ok("同一版就不吵人", !bar() && VER_NEW==="", {有橫幅:!!bar(), 新版:VER_NEW});
  ok("**而且絕對不會自己重整**", global.__reloaded!==true); }

// ══════════ ③ 線上換版了 → 掛一條可以按的橫幅 ══════════
{ reset(); global.__served="bbbbbbbbbbbb";
  await verCheck(true); await wait();
  const b=bar();
  ok("**發現新版就掛橫幅**", !!b, BODY_KIDS.map(n=>n.id));
  ok("講清楚是怎麼回事", b && b.innerHTML.includes("系統已經更新"), b&&b.innerHTML.slice(0,80));
  ok("**有一顆「重新整理」可以按**", !!(b && (b.__kids||[]).length===1
     && (b.__kids[0].textContent||"").includes("重新整理")), b&&(b.__kids||[]).map(k=>k.textContent));
  ok("**但不會自己重整**（正在打字、正在勾毛片的時候被強制重整，東西會不見）",
     global.__reloaded!==true);
  b.__kids[0].onclick();
  ok("按下去才重整", global.__reloaded===true); }

// ══════════ ④ 只掛一條，不會愈積愈多 ══════════
{ reset(); global.__served="bbbbbbbbbbbb";
  await verCheck(true); await wait();
  await verCheck(true); await wait();
  await verCheck(true); await wait();
  ok("**查再多次也只有一條橫幅**", BODY_KIDS.filter(n=>n.id==="verBar").length===1,
     BODY_KIDS.filter(n=>n.id==="verBar").length);
  ok("**知道有新版之後就不再一直去問**", global.__fetches.length===1, global.__fetches.length); }

// ══════════ ⑤ 不要一直打線上 ══════════
{ reset(); global.__served="aaaaaaaaaaaa";
  await verCheck(true); await wait();
  await verCheck(false); await verCheck(false); await wait();
  ok("**三十分鐘內只查一次**（27 個人整天開著，不能每秒都問）",
     global.__fetches.length===1, global.__fetches.length);
  ok("查的時候明確要求不吃快取（不然問了也是拿到舊的）",
     global.__fetches[0].cache==="no-store", global.__fetches[0]);
  ok("網址帶了破快取參數", /index\.html\?cb=\d+/.test(global.__fetches[0].u), global.__fetches[0].u);
  ok("間隔是三十分鐘", VER_EVERY===30*60*1000, VER_EVERY); }

// ══════════ ⑥ 切回分頁要查（手機把背景分頁凍起來，計時器根本不會跑）══════════
{ reset(); global.__served="cccccccccccc";
  const fns=global.__docEv["visibilitychange"]||[];
  ok("**有掛 visibilitychange**", fns.length>=1, fns.length);
  document.hidden=false; fns.forEach(f=>f()); await wait(30);
  ok("**切回來就發現新版了**", !!bar(), BODY_KIDS.map(n=>n.id)); }
{ reset(); global.__served="dddddddddddd"; document.hidden=true;
  (global.__docEv["visibilitychange"]||[]).forEach(f=>f()); await wait(30);
  ok("切走的時候不查（那時候查也沒人看得到）", global.__fetches.length===0, global.__fetches.length);
  document.hidden=false; }

// ══════════ ⑦ 壞掉也不能把系統弄掛 ══════════
{ reset(); const _f=global.fetch;
  global.fetch=async()=>{ throw new Error("斷線"); };
  let bad=null; try{ await verCheck(true); }catch(e){ bad=e.message; }
  global.fetch=_f;
  ok("**連不上就算了，不會炸**", !bad && !bar(), bad); }
{ reset(); const _f=global.fetch;
  global.fetch=async()=>({ ok:true, text:async()=>"這裡面根本沒有版本戳" });
  await verCheck(true); await wait();
  global.fetch=_f;
  ok("抓到看不懂的東西也不會亂掛橫幅", !bar()); }
{ reset(); const _f=global.fetch;
  global.fetch=async()=>({ ok:false, text:async()=>"" });
  await verCheck(true); await wait();
  global.fetch=_f;
  ok("伺服器回錯誤就跳過", !bar()); }

// ══════════ ⑧ 計時器要 unref（不然整套測試會卡住跑不完）══════════
// 第一版就是這樣：run-all 掛在那裡永遠不結束。瀏覽器裡 setInterval 回的是數字、
// 沒有 unref（等於沒事），node 裡才需要。
{ ok("**setInterval 有 unref**", /verIdle\(setInterval\(/.test(APP), (APP.match(/verIdle\([^)]*\(/g)||[]));
  ok("**setTimeout 也有**", /verIdle\(setTimeout\(/.test(APP));
  ok("unref 本身包了 try（瀏覽器沒有這個方法）", /typeof t\.unref==="function"/.test(APP)); }

// ══════════ ⑨ CSS 在，而且不擋操作 ══════════
{ ok("有橫幅的樣式", /\.verbar\{/.test(HTML), (HTML.match(/\.verbar\{[^}]*\}/)||[])[0]);
  ok("**釘在畫面下面，不是蓋住整頁**", /\.verbar\{[^}]*position:fixed/.test(HTML)
     && /\.verbar\{[^}]*bottom:/.test(HTML));
  ok("桌機上不要拉滿整條", /@media\(min-width:900px\)\{ \.verbar\{/.test(HTML)); }

console.log(`\nv192（有新版就提醒重新整理）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
