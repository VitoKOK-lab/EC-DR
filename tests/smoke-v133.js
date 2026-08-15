// v133：新手教學按了以後關不掉。
//
// 教學模式會攔截整頁的點擊（那是刻意的 —— 教學模式下點按鈕只該看說明、不該真的執行），
// 但攔截清單只放行 #tutBtn 一顆。問題是那顆在**齒輪選單裡**，而齒輪自己也是 button，
// 一樣被攔掉 → 選單根本打不開 → 那顆放行的按鈕永遠點不到 → 開了就關不掉。
//
// 教訓：出口不能只放行「最後那一顆」，要放行**整條抵達它的路**。
// 這支測三條退路都在，而且該擋的還是有擋。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,isConnected:true,scrollTop:0,
  classList:{_s:new Set(),toggle(c,on){ if(on===undefined) on=!this._s.has(c); on?this._s.add(c):this._s.delete(c); },
    add(c){this._s.add(c);},remove(c){this._s.delete(c);},contains(c){return this._s.has(c);}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), nodes={};
const listeners={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(!nodes[id]) nodes[id]=el(); return nodes[id]; },
  get activeElement(){return null;},
  addEventListener(t,fn){ (listeners[t]=listeners[t]||[]).push(fn); },
  createElement:()=>el(), body:el(),
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══════════ ① 開關本身 ══════════
ok("一開始是關的", TUT_ON===false);
toggleTutorial();
ok("按一下開起來", TUT_ON===true && document.body.classList.contains("tut"));
toggleTutorial();
ok("再按一下關掉", TUT_ON===false && !document.body.classList.contains("tut"));

// ══════════ ② 出口要放行「整條路」，不是只放行最後那一顆 ══════════
// 這是這次的病灶：只放行 #tutBtn，但它在齒輪選單裡，齒輪被擋 → 永遠點不到。
{ const m=APP.match(/if\(e\.target\.closest\("([^"]+)"\)\) return;\s*\n\s*const act=e\.target\.closest\('button/);
  ok("攔截器裡有一條放行清單", !!m);
  const allow=m?m[1]:"";
  ok("放行關閉鍵本身", allow.includes("#tutBtn"));
  ok("放行齒輪（不然選單打不開，關閉鍵就永遠點不到）", allow.includes("#hgearBtn"));
  ok("放行整個齒輪選單", allow.includes(".hmenu"));
  ok("放行橫幅上的關閉鍵", allow.includes("#tutOff")); }

// ══════════ ③ 三條退路都要在 ══════════
ok("退路一：橫幅上有看得見的「關閉教學」鍵", (()=>{
  toggleTutorial();
  const ban=document.getElementById("tutBanner");
  const html=String(ban.innerHTML||"");
  const has=html.includes('id="tutOff"') && html.includes("關閉教學") && html.includes("toggleTutorial()");
  toggleTutorial();
  return has; })());
ok("關掉之後橫幅收起來", (()=>{ toggleTutorial(); toggleTutorial();
  return document.getElementById("tutBanner").classList.contains("hidden"); })());
ok("退路二：齒輪選單裡的新手教學還在", HTML.includes('id="tutBtn"') && HTML.includes("toggleTutorial()"));
ok("退路三：Esc 有接上", /keydown[\s\S]{0,120}Escape[\s\S]{0,60}toggleTutorial\(\)/.test(APP));
// Esc 真的關得掉；沒開教學時按 Esc 不該有任何動作
{ toggleTutorial();
  const esc=(listeners.keydown||[])[0];
  ok("Esc 監聽器掛上去了", typeof esc==="function");
  if(esc){ esc({key:"Escape"}); ok("按 Esc 就關掉", TUT_ON===false); }
  if(esc){ esc({key:"Escape"}); ok("沒開教學時按 Esc 不會反而開起來", TUT_ON===false); }
  if(esc){ toggleTutorial(); esc({key:"a"}); ok("按別的鍵不會關掉", TUT_ON===true); toggleTutorial(); } }

// ══════════ ④ 該擋的還是要擋（不能為了好關就整個不攔） ══════════
ok("攔截器還在（教學模式下點按鈕只看說明、不執行）",
   /e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*\n?\s*tutShowFor/.test(APP));
ok("沒開教學時完全不攔（if(!TUT_ON) return）",
   /document\.addEventListener\("click", function\(e\)\{ if\(!TUT_ON\) return;/.test(APP));
ok("攔的是會動作的元素，不是整頁", /closest\('button,a,input,select,textarea/.test(APP));

// ══════════ ⑤ 樣式：關閉鍵要看得到 ══════════
ok("橫幅的關閉鍵有樣式（不會變成一坨看不見的字）", HTML.includes("#tutOff{"));
ok("橫幅排成一列放得下按鈕", /#tutBanner\{display:flex/.test(HTML));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
