// v139：員工說「很卡」。實測出來是兩件事疊在一起，兩件都不是新功能造成的。
//
// ① fb.js 掛了六個 onSnapshot，每一個進來都各自 push 一次 → 開機時同一份資料被
//    完整重畫六遍。剪輯（401 支片掛在他名下）一次重畫 0.59 秒，六次就是三秒多的
//    全畫面凍結。而且之後全公司任何人改任何東西，每個人的畫面都要再重畫一次。
// ② 「建立二創版本」那張卡把**所有舊片**當成挑片清單直接畫出來 —— 321 支＝3110 個
//    DOM 節點，佔掉剪輯整頁的 77%。清單不能截斷（v121 的規矩），所以改成收起來，
//    打開的那一刻才畫。
//
// 實測（正式資料 777 支影片，剪輯 泓儒）：一次同步 586ms → 158ms，節點 4692 → 949。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const FB=fs.readFileSync(path.join(__dirname,"..","fb.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
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
  addEventListener(t,fn){ (listeners[t]=listeners[t]||[]).push(fn); },
  createElement:()=>el(), body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null, querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=()=>{};

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const PAST=D(-40);
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"文案",
  rawLink:"http://raw",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  publishedLink:"",driveFolder:"",productUrl:"",note:"",mainType:"",source:"老闆自拍",refLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",account:"",lib:"",remakes:[],
  tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(nOld){
  nodes={}; modalHTML=""; viewEl.innerHTML="";
  const videos=[];
  for(let i=0;i<(nOld==null?60:nOld);i++) videos.push(v_("O"+i,{name:"舊片"+i,stage:"已上片",published:true,
    publishedLink:"http://p",driveFolder:"http://d",scheduledDate:PAST,finishedAt:PAST+"T10:00:00",tags:["舊片"]}));
  STATE={ users:[{name:"小葵",role:"editor"},{name:"Regina",role:"manager"},{name:"Anna",role:"intl"}],
    settings:{dailyTarget:4,videoTags:["新片","舊片"],sources:["老闆自拍"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"acctEN"},{locale:"th",name:"acctTH"}],
      shopeeAccounts:["acctSHP"],msAccounts:["acctMS"],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos };
  FOLD_OPEN={}; WORK_ZONE="shopee"; VIEW_AS=null; CUR_TAB="work"; POOL_FILTER="all"; POOL_Q="";
  CH_Q={shopee:"",ms:""}; INTL_Q="";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
  localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
}
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }
// 把目前分頁的畫面內容拿出來（不走 render 的 DOM 副作用，比較穩定）
function renderHTML(){
  const fn={dashboard:viewDashboard, flow:viewFlow, team:viewTeam, attend:viewAttend, cal:viewCal,
    work:viewWork, videos:viewVideos, videosDF:viewVideosDF, settings:viewSettings,
    log:viewLog, trash:viewTrash, perf:viewPerf}[CUR_TAB];
  return fn?fn():"";
}
const zoneCard=()=>{ const h=viewWork();
  let i=h.indexOf("建立二創版本"); if(i<0) i=h.indexOf("Create a version");   // 海外看到的是英文
  return i<0?"":h.slice(i, h.indexOf("</div>", h.indexOf("</details>", i))); };

// ══════════ ① 來源清單預設收起來 ══════════
reset(60);
{ const c=zoneCard();
  ok("建立二創版本那張卡還在", !!c);
  ok("來源清單包在摺疊裡", c.includes('<details class="fold"'));
  ok("摺疊標成 data-lazy（打開才畫）", /data-lazy="shopee"/.test(c));
  ok("預設是收起來的", !/data-lazy="shopee"[^>]*\bopen\b/.test(c) && !/\bopen\b[^>]*data-lazy="shopee"/.test(c));
  ok("摺疊上寫得出有幾支可以挑（收起來也知道有沒有東西）", /挑一支舊片來做<span class="n">60<\/span>/.test(c));
  ok("收起來的時候清單是空的（這就是省下來的幾千個節點）",
     /<div id="shp_list"[^>]*><\/div>/.test(c));
  ok("搜尋框照樣在（打開就能用）", c.includes('id="shp_q"')); }

// ══════════ ② 打開就要畫得出來，而且是完整的清單（不截斷）══════════
{ reset(60); FOLD_OPEN[foldKey("work.mkver")]=true;
  const c=zoneCard();
  ok("打開之後清單就畫出來了", c.includes("ilib-card"));
  ok("打開之後 60 支一支都不少（清單不准截斷）",
     (c.match(/class="ilib-card"/g)||[]).length===chSourcePool().length);
  ok("打開之後摺疊帶著 open", /\bopen\b[^>]*data-lazy="shopee"|data-lazy="shopee"[^>]*\bopen\b/.test(c)); }
// 大量資料下收起來也不會變慢
{ reset(400);
  const closed=zoneCard();
  ok("400 支舊片、收起來時畫面上還是 0 張卡", (closed.match(/class="ilib-card"/g)||[]).length===0);
  FOLD_OPEN[foldKey("work.mkver")]=true;
  ok("打開之後 400 支全都在", (zoneCard().match(/class="ilib-card"/g)||[]).length===400); }

// ══════════ ③ 打開的那一刻真的會去把清單填上 ══════════
{ reset(60);
  const toggles=(listeners.toggle||[]);
  ok("有掛 toggle 監聽（摺疊開合的入口）", toggles.length>0);
  const fn=toggles[0];
  // 監聽器收到的是「事件」，元素在 e.target —— 不是直接收元素
  const mk=(open,lazy)=>({target:{tagName:"DETAILS", open,
    getAttribute:(k)=>k==="data-fold"?"fk":(k==="data-lazy"?lazy:null)}});
  // 打開有 data-lazy 的 → 清單要被填進去
  nodes.shp_list=el(); nodes.shp_list.innerHTML="";
  fn(mk(true,"shopee"));
  ok("打開時把清單填進去", String(nodes.shp_list.innerHTML).includes("ilib-card"));
  // 收起來不要多做事
  nodes.shp_list.innerHTML="__keep__";
  fn(mk(false,"shopee"));
  ok("收起來的時候不重畫（沒必要）", nodes.shp_list.innerHTML==="__keep__");
  // 沒有 data-lazy 的摺疊完全不受影響
  let threw=false; try{ fn(mk(true,null)); }catch(e){ threw=true; }
  ok("一般的摺疊照舊，不會被這段影響", !threw);
  // 開合狀態照樣要記住（v129 的行為不能被弄壞）
  FOLD_OPEN={}; fn(mk(true,"shopee"));
  ok("開合狀態照樣記得住", FOLD_OPEN.fk===true); }
{ reset(60);
  ok("lazyFill 認得蝦皮", (()=>{ nodes.shp_list=el(); lazyFill("shopee");
       return String(nodes.shp_list.innerHTML).includes("ilib-card"); })());
  ok("lazyFill 認得馬來", (()=>{ WORK_ZONE="ms"; nodes.mys_list=el(); lazyFill("ms");
       return typeof nodes.mys_list.innerHTML==="string"; })());
  ok("lazyFill 收到看不懂的值不會炸", (()=>{ try{ lazyFill("亂七八糟"); return true; }catch(e){ return false; } })()); }

// ══════════ ④ 海外那一側（英文／泰文）同一套 ══════════
{ reset(60); localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
  WORK_ZONE="en";
  const c=zoneCard();
  ok("海外的來源清單也是收起來的", !/data-lazy="en"[^>]*\bopen\b/.test(c));
  ok("海外的清單收起來時也是空的", /<div id="intl_list"[^>]*><\/div>/.test(c));
  FOLD_OPEN[foldKey("work.mkver")]=true;
  ok("海外打開之後也畫得出來", zoneCard().includes("ilib-card")); }

// ══════════ ⑤ fb.js：六個訂閱不能各自重畫一次 ══════════
{ ok("push 有節流，不是直接呼叫 __onState", !/function push\(\)\s*\{\s*if \(window\.__onState\) window\.__onState\(raw\); \}/.test(FB));
  ok("有節流的計時器", /pushTimer/.test(FB));
  ok("同一個窗口內只排一次（後面的直接返回）", /if \(pushTimer\) return;/.test(FB));
  ok("安靜一陣子之後要立刻畫（登入畫面不能多等）", /if \(since >= PUSH_GAP\) \{ pushNow\(\); return; \}/.test(FB));
  ok("六個訂閱都還在（沒有為了效能少訂閱資料）",
     (FB.match(/onSnapshot\(/g)||[]).length>=6); }
// 節流本身的行為：把 fb.js 那段演算法原樣搬過來驗
{ let now=0, calls=0, timer=null, timerAt=0;
  const GAP=150; let last=0;
  const pushNow=()=>{ last=now; timer=null; calls++; };
  const push=()=>{ if(timer) return; const since=now-last;
    if(since>=GAP){ pushNow(); return; } timer=1; timerAt=now+(GAP-since); };
  const tick=(ms)=>{ now+=ms; if(timer && now>=timerAt) pushNow(); };
  // 開機：六個快照幾乎同時到
  now=1000; last=0; for(let i=0;i<6;i++) push();
  ok("開機六個快照 → 只畫一次（第一個立刻畫，其餘併掉）", calls===1);
  tick(200);
  ok("窗口過了之後把後續的補畫一次，總共兩次", calls===2);
  // 批次寫入：一次送 10 筆 → 十個快照連著回來
  calls=0; last=now; for(let i=0;i<10;i++){ push(); tick(5); }
  ok("批次寫入十個快照也收斂（不是十次重畫）", calls<=2);
  // 安靜之後的單一動作要立刻反應，不能被延遲
  calls=0; tick(500); push();
  ok("安靜之後按一下 → 立刻畫，不用等", calls===1); }

// ══════════ ⑥ 不剪片的職位不該下載影片資料 ══════════
// 「掛 400 支還是 1000 支，那也只是文字」—— 對，所以問題不是資料大，
// 而是**根本用不到的人也在下載**。行銷／客服／出貨／人資的每一個分頁，
// 有影片資料跟沒有影片資料畫出來的東西完全一樣（下面逐頁比對）。
// ⚠️ v152：這段比對本來是**空轉**的。樣本影片的 editor 是空字串、完成日是 40 天前，
//    所以團隊看板不管有沒有影片資料都算出 0，比出來當然「一樣」。
//    拿正式資料在真瀏覽器實測才抓到：同一天管理員看到「本月完成 168」、
//    人資／行銷／客服／出貨看到 **0** —— 是假數字，不是空白。
//    所以這裡要先把樣本改成**真的會讓兩邊不一樣**的資料：有剪輯、完成日在當月。
//    改完之後這段才真的在測東西（把 viewTeam 的 needVideos() 判斷拿掉就會變紅）。
{ const needsIt=(role)=>{
    reset(60);
    localStorage.setItem("ecdr_user","某人"); localStorage.setItem("ecdr_role",role);
    STATE.users=STATE.users.concat([{name:"某人",role}]);
    // 讓小葵這個月完成 10 支 —— 團隊看板的「完成上架／熱圖／橫條圖」才有東西可以差
    STATE.videos.slice(0,10).forEach((v,i)=>{ v.editor="小葵"; v.claimedAt=D(-1)+"T09:00:00";
      v.finishedAt=D(0)+"T18:00:00"; v.durationMin=90; });
    const full=JSON.parse(JSON.stringify(STATE.videos));
    let diff=false;
    for(const [tab] of myTabs()){
      CUR_TAB=tab;
      STATE.videos=full; const a=(()=>{ try{ return renderHTML(); }catch(e){ return "ERR"+e.message; } })();
      STATE.videos=[];   const b=(()=>{ try{ return renderHTML(); }catch(e){ return "ERR"+e.message; } })();
      STATE.videos=full;
      if(a!==b) diff=true;
    }
    return diff; };
  // 用 render 之外的入口比對：直接叫該分頁的 view 函式
  ok("行銷的畫面用不到影片資料", needsIt("mkt")===false);
  ok("客服的畫面用不到影片資料", needsIt("cs")===false);
  ok("出貨的畫面用不到影片資料", needsIt("ship")===false);
  // v152：人資要查「剪輯成效」，所以他真的需要影片資料 —— 這條從 false 翻成 true
  ok("人資的畫面需要影片資料（v152：多了「剪輯成效」）", needsIt("hr")===true);
  ok("剪輯的畫面需要影片資料", needsIt("editor")===true);
  ok("經理人的畫面需要影片資料", needsIt("manager")===true);
  ok("管理員的畫面需要影片資料", needsIt("boss")===true); }
// needVideos() 要跟上面的實測結果一致
{ ["mkt","svc","ship","cs"].forEach(r=>ok("needVideos('"+r+"')＝不用下載", needVideos(r)===false));
  ["boss","manager","editor","intl","hr"].forEach(r=>ok("needVideos('"+r+"')＝要下載", needVideos(r)===true)); }
// v152：不下載影片的職位，團隊看板上那幾個算不出來的欄位不准畫出來（不能拿 0 充數）
{ reset(60);
  STATE.videos.slice(0,10).forEach(v=>{ v.editor="小葵"; v.claimedAt=D(-1)+"T09:00:00";
    v.finishedAt=D(0)+"T18:00:00"; v.durationMin=90; });
  const teamAs=(role)=>{ localStorage.setItem("ecdr_user","某人"); localStorage.setItem("ecdr_role",role);
    STATE.users=STATE.users.filter(u=>u.name!=="某人").concat([{name:"某人",role}]);
    CUR_TAB="team"; return viewTeam(); };
  const cs=teamAs("cs"), hr=teamAs("hr"), boss=teamAs("boss");
  ok("客服的團隊看板：沒有「完成上架」這一欄", !/完成上架/.test(cs));
  ok("客服的團隊看板：沒有「本月完成」這個數字", !/本月完成/.test(cs));
  ok("客服的團隊看板：沒有熱圖", !/每天完成上片/.test(cs));
  ok("客服的團隊看板：沒有橫條圖", !/本月完成上片/.test(cs));
  ok("客服的團隊看板：出勤天數與交辦完成還在（他真正要看的）",
     /出勤天數/.test(cs) && /交辦完成/.test(cs));
  ok("人資的團隊看板：看得到「完成上架」", /完成上架/.test(hr));
  ok("人資的團隊看板：看得到熱圖", /每天完成上片/.test(hr));
  ok("管理員的團隊看板：一樣看得到", /完成上架/.test(boss) && /每天完成上片/.test(boss)); }
// ⚠️ 「選品行銷」是這條規則最容易踩到的例外：他**不剪片**（在 NO_EDIT_ROLES 裡），
//    但選品配對要從影片庫大流挑片、也要顯示配對影片的片名（viewMatch 會呼叫 vid()）。
//    所以「不剪片」不等於「不用影片資料」—— 這兩個清單必須分開。
{ ok("選品行銷不剪片", NO_EDIT_ROLES.includes("pick"));
  ok("但選品行銷需要影片資料（選品配對要挑片、要顯示片名）", needVideos("pick")===true);
  ok("兩個清單是分開的，不是同一份", NO_EDIT_ROLES!==NO_VIDEO_ROLES && !NO_VIDEO_ROLES.includes("pick"));
  const APPCODE=APP.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n");
  ok("needVideos 不是拿 NO_EDIT_ROLES 在判斷",
     /NO_VIDEO_ROLES\.includes\(r\)/.test(APPCODE) && !/needVideos[\s\S]{0,120}NO_EDIT_ROLES/.test(APPCODE));
  ok("選品配對真的會讀影片（所以上面那條不是多慮）",
     /function viewMatch\(\)[\s\S]{0,3000}?vid\(/.test(APP)); }
// 開機不再無條件訂閱影片，改成 app.js 依職位呼叫
{ ok("fb.js 開機的即時訂閱裡沒有 videos",
     !/onSnapshot\(collection\(db,\s*"videos"/.test(FB.split("即時訂閱")[1]||""));
  ok("fb.js 有 watchVideos 這個按需入口", /watchVideos\(\)\s*\{/.test(FB));
  ok("watchVideos 有防重（呼叫幾次都只訂一條）", /if \(videosUnsub\) return false;/.test(FB));
  ok("app.js 依職位決定要不要訂閱", /if\(needVideos\(\)\)\{[\s\S]{0,120}watchVideos\(\)/.test(APP)); }

// ══════════ ⑦ 其他畫面沒有被連坐改壞 ══════════
{ reset(60);
  ["work","team","videos","videosDF","cal"].forEach(t=>{ CUR_TAB=t;
    let okk=true; try{ render(); }catch(e){ okk=false; }
    ok("剪輯的「"+t+"」畫得出來", okk); });
  localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
  ["flow","team","videos","videosDF","cal"].forEach(t=>{ CUR_TAB=t;
    let okk=true; try{ render(); }catch(e){ okk=false; }
    ok("經理人的「"+t+"」畫得出來", okk); }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
