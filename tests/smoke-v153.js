// v153 ①：打字打到一半，同事一動作就整段消失。
//
// render() 是把整個 #view 的 innerHTML 重寫一遍，正在編輯的那個 <input> 會被連根換掉。
// 26 個人共用同一份 Firestore，任何人打卡／完成交辦／存影片都會推一次快照 → 全員重繪。
//
// 實測（真瀏覽器＋正式資料，修好之前）：
//   管理員 交辦輸入框 asg_txt         打了字 → 同事打卡 → 值變成 ""，游標也跑掉
//   剪輯   工作回報   tr_<taskid>     同上
//   客服   新增工作   wp_newtask      同上
// 頻率（正式的 5502 筆操作紀錄）：一般時段每 6.7 分鐘一次寫入，最忙的時段每 29 秒一次。
// 打一則工作回報要 20–40 秒 —— 所以這是天天在發生的事。
//
// 程式裡本來就有這道防護，但只裝在跨午夜的 midnightWatch（「正在打字就先不翻」），
// 同步那條路沒裝。修法是照 keepScroll 那組現成的做法，補上 focusSnapshot／focusRestore。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");

// ── 這支測試需要一個「摸得到焦點」的假 DOM（一般的假 element 沒有父子關係）──
let ACTIVE=null;
function mkEl(tag, id){
  const e={ tagName:tag, id:id||"", value:"", checked:false, type:"text",
    selectionStart:null, selectionEnd:null, children:[], parent:null,
    style:{}, className:"", dataset:{}, scrollTop:0, disabled:false, readOnly:false,
    classList:{toggle(){},add(){},remove(){},contains(){return false;}},
    focus(opt){ ACTIVE=e; e.__focusOpt=opt; }, blur(){ if(ACTIVE===e) ACTIVE=null; },
    setSelectionRange(s,en){ e.selectionStart=s; e.selectionEnd=en; },
    addEventListener(){}, getAttribute(){return null;}, setAttribute(){}, click(){},
    getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};},
    appendChild(c){ c.parent=e; e.children.push(c); return c; },
    contains(x){ let p=x; while(p){ if(p===e) return true; p=p.parent; } return false; },
    querySelector(sel){ const m=String(sel).match(/^\[id="(.+)"\]$/); if(!m) return null;
      const walk=(n)=>{ for(const c of n.children){ if(c.id===m[1]) return c; const r=walk(c); if(r) return r; } return null; };
      return walk(e); },
    querySelectorAll(){ return []; },
    insertAdjacentHTML(){}, closest(){return null;} };
  return e;
}
const VIEW=mkEl("DIV","view");
const OUTSIDE=mkEl("DIV","outside");
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
global.document={ getElementById:(id)=>{ if(id==="view") return VIEW; return mkEl("DIV",id); },
  get activeElement(){ return ACTIVE; },
  addEventListener(){}, createElement:(t)=>mkEl(String(t).toUpperCase()),
  body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null, querySelectorAll:()=>[] };
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
function fresh(){ VIEW.children.length=0; ACTIVE=null; }
function put(tag,id,value){ const e=mkEl(tag,id); e.value=value==null?"":value; return VIEW.appendChild(e); }

// ══════════ ① 記錄：什麼該記、什麼不該記 ══════════
{ fresh();
  ok("沒有人在打字 → 不記", focusSnapshot(VIEW)===null);

  fresh(); const a=put("INPUT","wp_newtask","打到一半的字"); a.focus();
  const s=focusSnapshot(VIEW);
  ok("有人在打字 → 記下來", !!s && s.id==="wp_newtask" && s.value==="打到一半的字", s);

  fresh(); const b=put("TEXTAREA","tr_abc","回報內容"); b.focus();
  ok("textarea 也要記", (focusSnapshot(VIEW)||{}).id==="tr_abc");

  fresh(); const c=put("SELECT","msg_to","hr"); c.focus();
  ok("下拉也要記", (focusSnapshot(VIEW)||{}).id==="msg_to");

  fresh(); const d=put("BUTTON","some_btn",""); d.focus();
  ok("按鈕不用記（沒有東西會不見）", focusSnapshot(VIEW)===null);

  fresh(); const e=put("INPUT","","沒有 id"); e.focus();
  ok("沒有 id 的欄位記了也找不回來 → 不記", focusSnapshot(VIEW)===null);

  fresh(); const f=mkEl("INPUT","in_modal"); f.value="彈窗裡的"; OUTSIDE.appendChild(f); f.focus();
  ok("不在 #view 裡的（例如彈窗）不歸這裡管", focusSnapshot(VIEW)===null);

  fresh(); const g=put("INPUT","with_caret","1234567890"); g.focus(); g.setSelectionRange(4,7);
  const sg=focusSnapshot(VIEW);
  ok("游標位置也要記", sg.s===4 && sg.e===7, sg); }

// ══════════ ② 接回去：打到一半的字永遠贏過重繪出來的值 ══════════
{ fresh(); const a=put("INPUT","wp_newtask","我打到一半的字"); a.focus(); a.setSelectionRange(3,3);
  const s=focusSnapshot(VIEW);
  // 模擬重繪：整個換掉，新的那顆是空的
  fresh(); const b=put("INPUT","wp_newtask","");
  focusRestore(VIEW, s);
  ok("重繪後：打到一半的字接回來了", b.value==="我打到一半的字", b.value);
  ok("重繪後：游標回到原位", b.selectionStart===3 && b.selectionEnd===3, {s:b.selectionStart,e:b.selectionEnd});
  ok("重繪後：焦點回到那一格", ACTIVE===b);
  ok("focus 有帶 preventScroll（不然畫面會被拉走）",
     b.__focusOpt && b.__focusOpt.preventScroll===true, b.__focusOpt); }

// 送出之後程式自己把欄位清空 → 同步不該把舊內容變回來
{ fresh(); const a=put("INPUT","wp_newtask",""); a.focus();      // 已經被 createTask 清空了
  const s=focusSnapshot(VIEW);
  fresh(); const b=put("INPUT","wp_newtask","");
  focusRestore(VIEW, s);
  ok("送出後已清空的欄位，不會被還原成舊內容", b.value===""); }

// 勾選框
{ fresh(); const a=put("INPUT","cb1",""); a.type="checkbox"; a.checked=true; a.focus();
  const s=focusSnapshot(VIEW);
  fresh(); const b=put("INPUT","cb2",""); b.id="cb1"; b.type="checkbox"; b.checked=false;
  focusRestore(VIEW, s);
  ok("勾選狀態也接得回來", b.checked===true); }

// ══════════ ③ 不能把事情弄壞 ══════════
{ fresh();
  let threw=false; try{ focusRestore(VIEW, null); }catch(e){ threw=true; }
  ok("沒有記錄時什麼都不做，不會爆", !threw && ACTIVE===null);

  fresh(); const a=put("INPUT","gone","字"); a.focus(); const s=focusSnapshot(VIEW);
  fresh();                                              // 重繪後那一格整個消失了（例如工作被別人刪了）
  threw=false; try{ focusRestore(VIEW, s); }catch(e){ threw=true; }
  ok("重繪後欄位不見了也不會爆", !threw);
  ok("欄位不見了就不搶焦點", ACTIVE===null);

  fresh(); const b=put("INPUT","x1",""); const s2=focusSnapshot(VIEW);
  ok("沒有人在打字時，重繪不該亂搶焦點", s2===null);
  focusRestore(VIEW, s2);
  ok("——而且真的沒搶", ACTIVE===null); }

// ══════════ ④ 接到 render 上：同一頁才接，換分頁不接 ══════════
{ const R=String(APP);
  ok("render 有記錄焦點", /const foc=same\?focusSnapshot\(v\):null;/.test(R));
  ok("render 有接回焦點", /focusRestore\(v, foc\);/.test(R));
  ok("只有同一頁重繪才接（換分頁本來就該重來）", /const foc=same\?/.test(R));
  // 順序：一定要在接捲動位置之後，不然 focus 會把畫面拉走再被捲回去，會閃
  const iScroll=R.indexOf("keepScrollRestore(v, keep);");
  const iFocus=R.indexOf("focusRestore(v, foc);");
  const iScrollTo=R.indexOf("requestAnimationFrame(()=>window.scrollTo(0,sy))");
  ok("順序：先接捲動位置，再接焦點，最後才捲回原位",
     iScroll>0 && iFocus>iScroll && iScrollTo>iFocus, {iScroll,iFocus,iScrollTo}); }

console.log(`\nv153①（打字不被洗掉）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
