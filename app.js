// ===================================================================
// EC-DR 精簡版 — 只保留三件事：月排程、新片上架、舊片重覆上架
// 角色：管理員（Vito）＋ 剪輯。已移除：交辦、KPI、日報、稽核、二創、商品庫。
// 資料層走 Firestore（fb.js 提供 window.DB）；商業邏輯都在前端。
// ===================================================================
const ROLE_LABEL = {boss:"管理員", editor:"剪輯"};
const ROLE_TABS = {
  boss:   [["dashboard","儀表板"]],
  editor: [["work","上班計畫"],["cal","月排程"],["videos","影片庫"]],
};
const PUB_TIMES = ["10:00","12:00","16:00"];   // 固定三個上片時間
let STATE = null, CUR_TAB = null, ONLINE = true, LAST_RAW = null, BULK_BUSY = false;
const today = new Date(Date.now()+288e5).toISOString().slice(0,10); // 台灣時間 UTC+8
const yesterday = new Date(Date.now()+288e5-864e5).toISOString().slice(0,10); // 前一日

function currentUser(){ return localStorage.getItem("ecdr_user") || ""; }
function setUser(n){ localStorage.setItem("ecdr_user", n); }
function currentRole(){
  const u = (STATE?.users||[]).find(x=>x.name===currentUser());
  return (u && u.role) || localStorage.getItem("ecdr_role") || "editor";
}
function ownerName(){ return (STATE && STATE.settings && STATE.settings.ownerName) || "Vito"; }
const ADMIN_NAME = "管理員"; // 管理員登入（設定／成員管理）
function isOwner(){ return currentUser()===ADMIN_NAME; }
function myTabs(){ const t=(ROLE_TABS[currentRole()]||ROLE_TABS.editor).slice();
  if(isOwner()){ t.push(["settings","設定"]); } return t; }
function nowIso(){ return new Date(Date.now()+288e5).toISOString().slice(0,19); } // 台灣時間 UTC+8
function weekdayZh(ds){ return "日一二三四五六"[new Date((ds||today)+"T00:00:00").getDay()]; }
function durationMin(a,b){ const s=new Date(a), e=new Date(b||nowIso()); if(isNaN(s)||isNaN(e)||e<s) return null; return Math.round((e-s)/60000); }

function toast(msg, isErr){
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = "toast show" + (isErr?" err":"");
  setTimeout(()=>{ t.className = "toast"; }, 2600);
}

// ---------- ID / 影片預設記錄 ----------
function nextId(arr, prefix){
  let mx=0; (arr||[]).forEach(it=>{ const m=String(it.id||"").match(new RegExp("^"+prefix+"(\\d+)$")); if(m) mx=Math.max(mx,parseInt(m[1])); });
  return prefix+String(mx+1).padStart(3,"0");
}
// 影片的「完整標準結構」— 對應 SCHEMA.md（schemaVersion 2）。每筆寫入都用這個確保一致。
function newVideoRecord(over){
  const s=STATE.settings||{};
  const rec={ id: nextId(STATE.videos,"V"), code:"",
    name:"", rawName:"", videoCopy:"", tags:[], subTag:"",
    mainType:"",   // 預設不分類（流量型是多數，不特別標）
    source:(s.sources&&s.sources[0])||"", stage:"待處理",
    editor:"", claimedBy:"", claimedAt:"", finishedAt:"", durationMin:null, assignedTo:"",
    updatedAt:"", scheduledDate:null, publishTime:"", platforms:[],
    products:[], productUrl:"", note:"",
    reviewStatus:"", reviewNote:"", reviewedBy:"", reviewedAt:"",
    driveFolder:"", publishedLink:"", socialLink:"", rawLink:"",
    usageHistory:[], totalUsed:0,
    locked:false, published:false, backupDone:false, socialScheduled:false };
  return Object.assign(rec, over||{});
}

// ---------- 衍生計算 ----------
function parseDate(s){ s=String(s||"").slice(0,10); const d=new Date(s+"T00:00:00"); return isNaN(d)?null:d; }
function usedInWindow(v, days){
  const cut=new Date(); cut.setDate(cut.getDate()-days); const cutD=new Date(cut.toISOString().slice(0,10)+"T00:00:00"); let c=0;
  (v.usageHistory||[]).forEach(d=>{ const ds=(d&&typeof d==="object")?d.date:d; const dd=parseDate(ds); if(dd && dd>=cutD) c++; });
  return c;
}
function usageList(v){ return ((v&&v.usageHistory)||[]).map(d=> (d&&typeof d==="object")?{date:d.date,link:d.link||"",by:d.by||""}:{date:d,link:"",by:""})
  .filter(x=>x.date).sort((a,b)=>String(a.date).localeCompare(String(b.date))); }
// 某日的影片 = 手動排片(slots) ∪ 已完成且上片日=該日的影片（去重）
function dayVideoList(date){
  const seen=new Set(); const out=[];
  ((STATE.schedule||{})[date]?.slots||[]).forEach(s=>{ if(s.videoId && !seen.has(s.videoId)){ seen.add(s.videoId); out.push({videoId:s.videoId, slot:s}); } });
  (STATE.videos||[]).forEach(v=>{ if(v.scheduledDate===date && ["已完成","已上片"].includes(v.stage) && !seen.has(v.id)){ seen.add(v.id); out.push({videoId:v.id, fromVideo:true}); } });
  return out;
}
// 每天上片目標：依「星期幾」設定 流量／寵粉／代理招商 各幾支（帶貨已併入寵粉，不分平假日）
const TYPE_ORDER=["流量型","寵粉","代理招商"];
const TYPE_SHORT={"流量型":"流","寵粉":"寵","代理招商":"代"};
const WD_ORDER=[1,2,3,4,5,6,0]; const WD_LABEL={0:"日",1:"一",2:"二",3:"三",4:"四",5:"五",6:"六"};
function defaultWeekdayTargets(){ const o={}; for(let d=0;d<7;d++) o[d]={"流量型":3,"寵粉":1,"代理招商":0}; return o; }
function weekdayTargets(){ const w=STATE.settings&&STATE.settings.weekdayTargets; return (w&&typeof w==="object")?w:defaultWeekdayTargets(); }
function dayTargets(date){ const wd=new Date((date||today)+"T00:00:00").getDay(); const w=weekdayTargets(); const t=w[wd]||w[String(wd)]||{};
  return {"流量型":+t["流量型"]||0,"寵粉":(+t["寵粉"]||0)+(+t["帶貨型"]||0),"代理招商":+t["代理招商"]||0}; }   // 舊資料的帶貨型併入寵粉
function daySumLegacy(date){ const t=dayTargets(date); return (t["流量型"]||0)+(t["寵粉"]||0)+(t["代理招商"]||0); }
// 每日應上片數（單一數字，不分類型）；未設定則沿用舊的「星期×類型」加總
function daySum(date){ const v=STATE.settings&&STATE.settings.dailyTarget;
  return (v!=null&&v!=="")?(+v||0):daySumLegacy(date); }
// 某天已排數量、缺口、是否排滿（以「總支數」計，不分類型）
function dayBreakdown(date){ const list=dayVideoList(date);
  const target=daySum(date), total=list.length;
  return {total, target, short:Math.max(0,target-total), full: total>=target}; }
// 我目前進行中的影片數
function inProgressCount(name){ return (STATE.videos||[]).filter(v=>v.stage==="剪輯中"&&(v.claimedBy===name||v.editor===name)).length; }
function myInProgressCount(){ return inProgressCount(currentUser()); }
// 新片＝剪好還沒上傳（預排上片日尚未到）；舊片＝過了預排上片日（已上傳，可重播）
// 是否已過預排上片日（→ 已上傳、視為舊片，可重播）
function airedPast(v){ const d=String(v.scheduledDate||"").slice(0,10); return !!d && d < today; }

// ---------- 寫入路由（操作 Firestore） ----------
function vidLocal(id){ return (STATE.videos||[]).find(v=>v.id===id); }
function segOf(path){ return path.split("/").filter(Boolean).slice(1); } // 去掉 'api'
async function route(method, path, body){
  if(!window.DB) throw new Error("尚未連線，請稍候");
  const seg=segOf(path), head=seg[0], user=currentUser();
  if(head==="settings" && method==="PUT"){ await window.DB.setSettings(body.settings||{}); return; }
  if(head==="users"){
    if(method==="POST"){ const name=(body.name||"").trim(), role=body.role||"editor";
      if(!name) throw new Error("請輸入名稱");
      if((STATE.users||[]).some(u=>u.name===name)) throw new Error("名稱已存在");
      await window.DB.set("users", name, {name, role, isDefault:false, pw:"0000"}); return; }
    if(method==="PUT"){ const patch={}; if(body.role!=null) patch.role=body.role; if(body.pw!=null) patch.pw=String(body.pw);
      await window.DB.update("users", seg[1], patch); return; }
    if(method==="DELETE"){ await window.DB.del("users", seg[1]); return; }
  }
  if(head==="videos"){
    if(method==="POST" && seg.length===1){
      const inc=Object.assign({}, body.video); delete inc.id;
      const v=newVideoRecord(inc); v.updatedAt=nowIso(); await window.DB.set("videos", v.id, v); return;
    }
    const id=seg[1], v=vidLocal(id), action=seg[2];
    if(!v && method!=="DELETE") throw new Error("找不到影片");
    if(action==="claim"){
      if(inProgressCount(user)>=3) throw new Error("你手上已有 3 支進行中，先完成幾支再拉新片");
      await window.DB.update("videos",id,{claimedBy:user,claimedAt:nowIso(),editor:v.editor||user,stage:"剪輯中",workStep:0,updatedAt:nowIso()}); return; }
    if(action==="unclaim"){
      await window.DB.update("videos",id,{stage:"待處理",claimedBy:"",claimedAt:"",editor:"",workStep:0,updatedAt:nowIso()}); return; }
    if(action==="finish"){
      const date=body.scheduledDate||null;   // 預排上片日可留空 → 進「新片未排程」
      const ed=v.editor||v.claimedBy||user;
      const patch={stage:"已完成",finishedAt:nowIso(),editor:ed,locked:true,updatedAt:nowIso(),
        scheduledDate:date, published:true, backupDone:true, socialScheduled:true};
      if(v.claimedAt) patch.durationMin=durationMin(v.claimedAt, patch.finishedAt);
      if(body.driveFolder) patch.driveFolder=body.driveFolder; if(body.name) patch.name=body.name;
      if(body.publishTime) patch.publishTime=body.publishTime;
      if(Array.isArray(body.tags)) patch.tags=body.tags; if(body.subTag!==undefined) patch.subTag=body.subTag;
      if(Array.isArray(body.platforms)) patch.platforms=body.platforms;
      if(Array.isArray(body.products)) patch.products=body.products;
      if(body.productUrl!==undefined) patch.productUrl=body.productUrl;
      if(body.note!==undefined) patch.note=body.note;
      if(body.publishedLink) patch.publishedLink=body.publishedLink; if(body.socialLink) patch.socialLink=body.socialLink;
      await window.DB.update("videos",id,patch); return;
    }
    if(action==="reuse" && method==="POST"){
      const date=body.date; const link=(body.link||"").trim(); const time=body.time||""; const drive=(body.drive||"").trim();
      if(!date) throw new Error("請選擇重播上片日期");
      const day=(STATE.schedule||{})[date]||{slots:[]}; const slots=(day.slots||[]).slice();
      slots.push({videoId:id, publishedLink:link, driveFolder:drive, reused:true, by:user, at:nowIso(), time});
      await window.DB.scheduleSet(date,{slots});
      const uh=(v.usageHistory||[]).concat([{date, link, drive, time, by:user, at:nowIso()}]);
      const patch={totalUsed:(v.totalUsed||0)+1, usageHistory:uh};
      if(drive && drive!==v.driveFolder) patch.driveFolder=drive; // 同步存檔位置回影片（同一支都一樣）
      await window.DB.update("videos", id, patch);
      return;
    }
    if(method==="PUT"){ const patch=Object.assign({}, body.video); delete patch.id; patch.updatedAt=nowIso(); await window.DB.update("videos",id,patch); return; }
    if(method==="DELETE"){ await window.DB.del("videos",id); return; }
  }
  if(head==="schedule"){
    const date=seg[1], sub=seg[2]; const day=(STATE.schedule||{})[date]||{slots:[]}; const slots=(day.slots||[]).slice();
    if(sub==="slot" && method==="POST"){
      const slot=body.slot||{}; const tv=vidLocal(slot.videoId);
      slots.push(slot); await window.DB.scheduleSet(date,{slots});
      if(tv && !slot.reused) await window.DB.update("videos", slot.videoId, {scheduledDate:date}); return;
    }
    if(sub==="slot" && method==="DELETE"){ const idx=parseInt(seg[3]); if(idx<0||idx>=slots.length) throw new Error("索引超出範圍");
      if(slots[idx].locked) throw new Error("此排片已上架鎖定"); slots.splice(idx,1); await window.DB.scheduleSet(date,{slots}); return; }
  }
  throw new Error("不支援的操作");
}
function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function write(method, path, body, okMsg){
  try{ await route(method, path, body||{}); await delay(140); if(okMsg) toast(okMsg); return true; }
  catch(e){ toast(e.message, true); return false; }
}
async function withAdmin(fn){ return fn(); }  // 已取消密碼，直接執行
async function writeAdmin(method,path,body,okMsg){ try{ await route(method,path,body||{}); await delay(140); if(okMsg)toast(okMsg); closeModal(); return true; }catch(e){ toast(e.message,true); return false; } }

// ---------- 登入 / 導覽 ----------
function buildNav(){
  const nav = document.getElementById("nav"); nav.innerHTML="";
  myTabs().forEach(([id,label])=>{
    const b = document.createElement("button"); b.textContent = label; b.dataset.tab = id;
    if(id===CUR_TAB) b.classList.add("active");
    b.onclick = ()=>{ if(id==='cal') CAL_YM=null; CUR_TAB = id; buildNav(); render(); };  // 進月排程一律回到當月
    nav.appendChild(b);
  });
}
function bootLogin(){
  const g = document.getElementById("userGrid"); g.innerHTML = "";
  const editors=((STATE?.users)||[]).filter(u=>(u.role||"editor")==="editor").sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  if(!editors.length){ const n=document.createElement("p"); n.className="muted"; n.style.cssText="width:100%;text-align:center"; n.textContent="尚無剪輯成員，請按「管理員登入」進入後新增"; g.appendChild(n); return; }
  editors.forEach(u=>{ const b=document.createElement("button"); b.className="userBtn";
    b.innerHTML = esc(u.name)+'<span class="role">點我上班 →</span>'; b.onclick=()=>loginAs(u); g.appendChild(b); });
}
function loginAs(u){
  const want=String(u.pw==null?"0000":u.pw);
  const pw=prompt("請輸入「"+u.name+"」的密碼（預設 0000）："); if(pw===null) return;
  if(String(pw).trim()!==want){ toast("密碼錯誤。預設為 0000，忘記請找主管線上重設",true); return; }
  setUser(u.name); localStorage.setItem("ecdr_role", u.role||"editor"); CUR_TAB=null; clockIn(u.name); applyState(LAST_RAW); }
// 員工自行修改密碼（需先輸入舊密碼）
async function changeMyPw(){
  const me=currentUser(); const u=(STATE.users||[]).find(x=>x.name===me);
  if(!u){ toast("找不到你的帳號",true); return; }
  const cur=String(u.pw==null?"0000":u.pw);
  const old=prompt("請輸入目前密碼（預設 0000）："); if(old===null) return;
  if(String(old).trim()!==cur){ toast("目前密碼錯誤",true); return; }
  const n1=prompt("請設定新密碼（至少 4 碼）："); if(n1===null) return;
  const np=String(n1).trim(); if(np.length<4){ toast("新密碼至少 4 碼",true); return; }
  const n2=prompt("請再輸入一次新密碼："); if(n2===null) return;
  if(String(n2).trim()!==np){ toast("兩次輸入不一致，請重來",true); return; }
  await write("PUT","/api/users/"+me,{pw:np},"密碼已更新，下次登入請用新密碼"); }
// 上班打卡：記錄當天第一次登入時間（只給管理員看）
function shiftId(name,date){ return name+"__"+date; }
async function clockIn(name){
  try{ const id=shiftId(name,today); const ex=(STATE&&STATE.shifts&&STATE.shifts[id])||null;
    if(ex&&ex.clockIn) return;   // 已打過上班卡
    await window.DB.set("shifts", id, {id, user:name, date:today, clockIn:nowIso(), clockOut:""});
  }catch(e){}
}
function myShift(){ return (STATE&&STATE.shifts&&STATE.shifts[shiftId(currentUser(),today)])||null; }
function ownerLogin(){ if(!STATE){ toast("連線中，請稍候再試",true); return; }
  const want=String((STATE.settings&&STATE.settings.adminPassword)||"1234");
  const pw=prompt("請輸入管理員密碼："); if(pw===null) return;
  if(String(pw).trim()!==want){ toast("密碼錯誤",true); return; }
  setUser(ADMIN_NAME); localStorage.setItem("ecdr_role","boss"); CUR_TAB=null; applyState(LAST_RAW); }
// 登出：跳回登入頁
function logout(){ showGoodbye(); }
// 登出：簡單說再見 → 跳回登入頁（無動畫）
function showGoodbye(){
  localStorage.removeItem("ecdr_user"); localStorage.removeItem("ecdr_role");
  CUR_TAB=null; try{ closeModal(); }catch(e){}
  const st=document.getElementById("gstage"); if(st) st.innerHTML=`<span style="font-size:64px"></span>`;
  document.getElementById("app")?.classList.add("hidden");
  document.getElementById("login")?.classList.add("hidden");
  document.getElementById("goodbye")?.classList.add("show");
  setTimeout(reLogin, 1200);
}
function reLogin(){ location.reload(); }

// ---------- 狀態套用（Firestore snapshot 進來時呼叫） ----------
function decorate(raw){
  const st=JSON.parse(JSON.stringify(raw));
  const s=st.settings||{}; const win=s.reuseWindowDays||30;
  (st.videos||[]).forEach(v=>{ v.last30dUsed=usedInWindow(v,win); });
  STATE=st; return st;
}
function applyState(raw){
  if(!raw) return;
  if(BULK_BUSY){ LAST_RAW=raw; return; }
  LAST_RAW=raw; decorate(raw);
  const has=(STATE.users||[]).some(u=>u.name===currentUser());
  const isBoss=localStorage.getItem("ecdr_role")==="boss";
  if(currentUser() && (has||isBoss)){
    document.getElementById("login").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("whoName").textContent=currentUser();
    document.getElementById("whoRole").textContent="・"+(ROLE_LABEL[currentRole()]||"");
    { const pb=document.getElementById("pwBtn"); if(pb) pb.style.display=(currentRole()==="editor")?"":"none"; }
    if(!CUR_TAB || !myTabs().some(t=>t[0]===CUR_TAB)) CUR_TAB=myTabs()[0][0];
    buildNav(); render();
  } else {
    document.getElementById("app").classList.add("hidden");
    document.getElementById("login").classList.remove("hidden");
    bootLogin();
  }
}
window.__onState = applyState;
window.__needSetup = function(){ document.getElementById("setup").classList.remove("hidden"); document.getElementById("login").classList.add("hidden"); };
window.__authError = function(msg){ toast("登入失敗："+msg, true); };

// ===== 小工具 =====
const esc = s => String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
// 給字串型 onclick="fn('...')" 用：跳脫反斜線與單引號，避免名稱含 ' 時把 JS 字串截斷
const jsEsc = s => String(s==null?"":s).replace(/\\/g,"\\\\").replace(/'/g,"\\'");
// ===== 簡體 → 繁體（OpenCC，只在「顯示」時轉換，不動資料庫）=====
let __s2t=null; const __s2tCache=new Map();
function zhTW(s){ s=(s==null?"":String(s)); if(!__s2t||!s) return s; let r=__s2tCache.get(s); if(r===undefined){ try{ r=__s2t(s); }catch(e){ r=s; } __s2tCache.set(s,r); } return r; }
(function loadOpenCC(){
  function init(){ try{ if(window.OpenCC&&OpenCC.Converter){ __s2t=OpenCC.Converter({from:"cn",to:"tw"}); __s2tCache.clear(); if(typeof render==="function") try{ render(); }catch(e){} } }catch(e){} }
  if(window.OpenCC) return init();
  try{ const s=document.createElement("script"); s.src="https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js"; s.async=true; s.onload=init; document.head.appendChild(s); }catch(e){}
})();
function vid(id){ return (STATE.videos||[]).find(v=>v.id===id); }
function val(id){ const e=document.getElementById(id); return e?e.value:""; }
// 只標出「寵粉／代理招商」；流量型與未分類不顯示（多數都是流量型，不必特別寫）
function typeTag(t){ if(t!=="寵粉"&&t!=="代理招商") return ""; return `<span class="tag ${t==="寵粉"?"sales":""}">${esc(t)}</span>`; }

// ===================================================================
// 畫面路由
// ===================================================================
// 每頁新手教學：第一次進到某頁自動顯示一張說明卡，按「知道了」後該頁不再出現（記在這台裝置、依使用者）
const PAGE_INTRO = {
  work:{ title:"上班計畫", html:"這是你每天的主畫面。<b>①</b> 上方「待剪毛片」按〈認領開始剪〉把片子拉下來剪（同時最多 3 支，其餘排隊）。<b>②</b> 中間「我的今日工作」剪好按〈完成〉。<b>③</b> 下班前按〈下班匯報〉。" },
  cal:{ title:"月排程", html:"整月的上片排程。<b>綠</b>＝當天已排滿、<b>紅</b>＝還缺幾支、<b>深灰</b>＝還沒排；今天用金框標起來。點任一天可看當天要上的片、或把舊片排進去重播。" },
  videos:{ title:"影片庫", html:"所有影片都在這。上方分頁切換〈毛片待剪／新片未排程／已排程／舊片〉；搜尋框可用片名、原始片名、文案、編號找；〈＋ 新增毛片〉建立新片。" },
  dashboard:{ title:"管理員儀表板", html:"總覽：指派交辦與毛片給員工、看未來排程是否排滿、每位剪輯今日進度與長期績效。" },
  settings:{ title:"設定", html:"設定每日上片目標、投放平台、成員（新增剪輯會自動建立登入帳號），以及資料維護。" },
};
function introKey(tab){ return "ecdr_intro_"+tab+"_"+currentUser(); }
function pageIntroHTML(tab){
  const it=PAGE_INTRO[tab]; if(!it) return "";
  try{ if(localStorage.getItem(introKey(tab))) return ""; }catch(e){}
  return `<div class="card" style="border:1px solid var(--accent);background:var(--amberbg)">
    <div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:nowrap">
      <div><b style="color:var(--accent)">✦ 新手教學 · ${esc(it.title)}</b>
        <div style="margin-top:6px;line-height:1.8">${it.html}</div></div>
      <button class="btn sm" style="white-space:nowrap;flex:none" onclick="dismissIntro('${tab}')">知道了</button>
    </div></div>`;
}
function dismissIntro(tab){ try{ localStorage.setItem(introKey(tab),"1"); }catch(e){} render(); }
function render(){
  if(!STATE) return;
  const v = document.getElementById("view");
  const banner = ONLINE ? "" :
    `<div class="card" style="border-color:var(--red)">目前離線，顯示的是最後一次同步的資料（唯讀），連線恢復後會自動更新。</div>`;
  const fn = { dashboard:viewDashboard, cal:viewCal, work:viewWork, videos:viewVideos, settings:viewSettings }[CUR_TAB] || (()=>"");
  v.innerHTML = banner + pageIntroHTML(CUR_TAB) + fn();
}

// ===================================================================
// 月排程（＋ 舊片重覆上架）
// ===================================================================
let CAL_YM = null;
let SHIFT_DATE = yesterday;   // 管理員「每日匯報」預設看昨天的工作進度
function shiftDateMove(n){ const d=new Date(SHIFT_DATE+"T00:00:00"); d.setDate(d.getDate()+n);
  const nd=new Date(d.getTime()+288e5).toISOString().slice(0,10); if(nd>today) return; SHIFT_DATE=nd; render(); }
function shiftDateSet(v){ if(v){ SHIFT_DATE=(v>today?today:v); render(); } }
function viewCal(){
  if(!CAL_YM){ const t=new Date(); CAL_YM=[t.getFullYear(), t.getMonth()]; }
  const [y,m] = CAL_YM;
  const first = new Date(y,m,1), startDow=first.getDay(), days=new Date(y,m+1,0).getDate();
  const d10=new Date(today+"T00:00:00"); d10.setDate(d10.getDate()+10); const d10s=d10.toISOString().slice(0,10);
  let cells = "";
  for(let i=0;i<startDow;i++) cells += `<div class="day out"></div>`;
  for(let d=1;d<=days;d++){
    const ds = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const isToday = ds===today;
    const tmk = isToday?`<span class="todaymk">今天</span>`:"";
    const within10 = ds>=today && ds<=d10s;
    const b = dayBreakdown(ds);
    const filled = b.full;
    const empty = (b.total||0)===0;                 // 一支都還沒排
    const cls = filled ? "filled" : (empty ? "empty" : (within10 ? "bad urgent" : "blank"));
    cells += `<div class="day ${cls} ${isToday?'today':''}" onclick="openDay('${ds}')">
      ${tmk}<div class="dnum">${d}</div>
      <div class="big">${b.total||"·"}<span style="font-size:14px;color:var(--muted);font-weight:600">${b.target?("/"+b.target):""}</span></div>
      ${filled?`<div class="pmk" style="color:var(--green)">已排滿</div>`:(empty?`<div class="pmk" style="color:${within10?'#F0A89E':'#C9BFB4'}">未排${within10?'（近期）':''}</div>`:`<div class="pmk" style="color:var(--red)">缺${b.short}</div>`)}
    </div>`;
  }
  return `
  <h2>月排程</h2>
  <div class="card">
    <div class="calhead">
      <button class="calnav" onclick="calMove(-1)" title="上月">‹</button>
      <div class="calmonth">${y} <span>年</span> ${m+1} <span>月</span></div>
      <button class="calnav" onclick="calMove(1)" title="下月">›</button>
    </div>
    <div class="cal">
      ${["日","一","二","三","四","五","六"].map(x=>`<div class="dow">${x}</div>`).join("")}
      ${cells}
    </div>
    <div class="callegend">
      <span><i class="lg-g"></i>已排滿</span>
      <span><i class="lg-r"></i>待補</span>
      <span><i class="lg-b"></i>未排</span>
      <span><i class="lg-t"></i>今天</span>
    </div>
  </div>`;
}
function calMove(n){ let [y,m]=CAL_YM; m+=n; if(m<0){m=11;y--;} if(m>11){m=0;y++;} CAL_YM=[y,m]; render(); }

function openDay(ds){
  // 依上片時間排序（早→晚）；沒時間的排最後
  const odTime = it => ((it.slot&&it.slot.reused)?(it.slot.time||""):(vid(it.videoId)?.publishTime||"")) || "99:99";
  const list = dayVideoList(ds).slice().sort((a,b)=> odTime(a).localeCompare(odTime(b)));
  const rows = list.map((it)=>{
    const v = vid(it.videoId);
    const reused = it.slot && it.slot.reused;
    const ed = reused ? (it.slot.by||"") : (v?.editor||"");
    const upLink = reused ? (it.slot.publishedLink||"") : (v?.publishedLink||v?.socialLink||"");
    const drive = reused ? (it.slot.driveFolder||v?.driveFolder||"") : (v?.driveFolder||"");
    const onChg = reused ? `moveReuse('${it.videoId}','${ds}',this.value)` : `rescheduleVid('${it.videoId}',this.value,'${ds}')`;
    const tm = reused ? (it.slot.time||"") : (v?.publishTime||"");
    // 剪輯・時間・連結併成標題下方一行小字（省空間、避免欄位被擠到逐字換行）
    const sub=[ ed?`剪輯 ${esc(ed)}${reused?'（重播）':''}`:'', tm?esc(tm):'',
      upLink?`<a href="${esc(upLink)}" target="_blank">上傳</a>`:'', drive?`<a href="${esc(drive)}" target="_blank">存檔</a>`:'' ].filter(Boolean).join(' ・ ');
    return `<tr>
      <td data-label="影片"><a href="javascript:void(0)" onclick="editVideo('${it.videoId}')">${esc(v?vidTitle(v):(it.videoId||""))}</a>${v?typeTag(v.mainType):""}${reused?' <span class="tag" style="background:var(--chip);color:var(--gold-dk)">重播</span>':''}
        <div class="muted" style="font-size:12px;margin-top:3px">${sub||'—'}</div></td>
      <td data-label="改上片日"><input type="date" value="${ds}" style="font-size:12px;padding:4px;min-width:128px" onchange="${onChg}"></td>
      <td data-label="操作"><button class="btn sec sm" style="white-space:nowrap" onclick="${reused?`unscheduleReuse('${it.videoId}','${ds}')`:`unscheduleVid('${it.videoId}','${ds}')`}" title="只把這支移出這天的排程，影片本身不會刪除，之後可重新再排">移出排程</button></td>
    </tr>`;
  }).join("");
  // 排舊片到這天：當天已排過的不再出現；時段自動帶 10/12/16，超過 3 個可自選時間
  const usedIds = new Set(list.map(it=>it.videoId));
  const doneList=(STATE.videos||[]).filter(v=>["已完成","已上片"].includes(v.stage) && !usedIds.has(v.id) && vidIsOld(v))  // 過了預排上片日（舊片）才能重播
    .sort((a,b)=>String(b.finishedAt||b.scheduledDate||"").localeCompare(String(a.finishedAt||a.scheduledDate||"")));
  const dayCount = list.length; const autoTime = PUB_TIMES[dayCount] || PUB_TIMES[PUB_TIMES.length-1];
  const timeField = `<div style="min-width:120px"><label style="margin:0 0 2px">上片時間</label>
    <input id="od_time" type="time" value="${autoTime}"></div>`;
  // 存檔位置（雲端備份）＝這支影片本來的存檔，重播都一樣 → 自動帶入；切換影片時更新
  OD_DRIVE={}; doneList.forEach(v=>{ OD_DRIVE[v.id]=v.driveFolder||""; });
  const firstDrive = doneList.length ? (doneList[0].driveFolder||"") : "";
  const reusePicker = `<div class="card" style="border-color:var(--accent)"><b>排舊片重播到這天</b>
    ${doneList.length? `<div class="row" style="gap:8px;margin-top:8px;align-items:flex-end">
        <div style="flex:1;min-width:150px"><label style="margin:0 0 2px">選一支舊片</label>
          <select id="od_vid" onchange="odPickVid()">${doneList.map(v=>`<option value="${v.id}">${esc(vidTitle(v))}（已用 ${usageList(v).length} 次）</option>`).join("")}</select></div>
        ${timeField}
        <button class="btn sm" onclick="odReuse('${ds}')">排入</button>
      </div>
      <label style="margin:8px 0 2px">存檔位置（雲端備份・自動帶入，同一支都一樣）</label>
      <input id="od_drive" value="${esc(firstDrive)}" placeholder="這支影片的雲端備份連結">
      <label style="margin:8px 0 2px">上傳連結（這次發佈的社群網址・每次可能不同，手動貼上）</label>
      <input id="od_link" placeholder="貼上這次重播要發佈的連結（可先排、之後再補）">`
      : `<p class="muted" style="margin-top:6px">目前沒有可排的舊片。</p>`}
  </div>`;
  const b = dayBreakdown(ds);
  const summary = `<div class="row" style="gap:8px;margin-bottom:8px">`+
    `<span class="pill ${b.full?'ok':'em'}">已排 ${b.total}/${b.target}${b.full?'':`（還缺 ${b.short}）`}</span></div>`;
  showModal(`${ds}（${weekdayZh(ds)}）`, `
    <div class="card"><b>當日影片</b>
      ${summary}
      <table class="responsive"><thead><tr><th>影片（剪輯・時間・連結）</th><th>改上片日</th><th>操作</th></tr></thead>
      <tbody>${rows||`<tr><td class="muted">當日尚無影片</td></tr>`}</tbody></table>
    </div>
    ${reusePicker}`, null);
}
// 切換要重播的舊片時，自動帶入它的存檔位置（雲端備份）
let OD_DRIVE={};
function odPickVid(){ const e=document.getElementById("od_drive"); if(e) e.value=OD_DRIVE[val("od_vid")]||""; }
// 從月曆某天排一支舊片重播（存檔位置自動帶入、上傳連結手動）
function odReuse(ds){ const id=val("od_vid"); if(!id){ toast("請先選一支舊片",true); return; }
  write("POST",`/api/videos/${id}/reuse`,{date:ds,time:val("od_time"),link:(val("od_link")||"").trim(),drive:(val("od_drive")||"").trim()},"已排入重播").then(ok=>{ if(ok) openDay(ds); }); }
// 移動「重播」排片到別天（同步更新使用紀錄的日期）
async function moveReuse(id, oldDate, newDate){ if(!newDate||newDate===oldDate) return;
  const day=(STATE.schedule||{})[oldDate]||{slots:[]}; const idx=(day.slots||[]).findIndex(s=>s.videoId===id && s.reused);
  const link=(idx>=0?(day.slots[idx].publishedLink||""):"");
  try{
    if(idx>=0) await route("DELETE",`/api/schedule/${oldDate}/slot/${idx}`,{});
    await route("POST",`/api/schedule/${newDate}/slot`,{slot:{videoId:id,publishedLink:link,reused:true,by:currentUser(),at:nowIso()}});
    const v=vid(id); const uh=(v.usageHistory||[]).map(u=> (u&&typeof u==="object" && u.date===oldDate)?Object.assign({},u,{date:newDate}):u);
    await window.DB.update("videos", id, {usageHistory:uh});
    await delay(140); toast("已改重播日至 "+newDate); openDay(newDate);
  }catch(e){ toast(e.message||"改期失敗",true); }
}
// 改上片日期（移動時間，不刪除）
function rescheduleVid(id,newDate,ds){ if(!newDate||newDate===ds) return;
  write("PUT",`/api/videos/${id}`,{video:{scheduledDate:newDate}},"已改上片日至 "+newDate).then(ok=>{ if(ok) openDay(ds); }); }
// 移出排程（新片）：只把這支移出這天，影片本身保留 → 回到「新片未排程」，可重新再排
async function unscheduleVid(id, ds){
  const v=vid(id)||{};
  if(!confirm("把「"+vidTitle(v)+"」移出「"+ds+"」的排程？\n\n只是移出這天，影片本身不會刪除，之後可重新再排。")) return;
  try{
    const slots=((STATE.schedule||{})[ds]||{}).slots||[];
    const idx=slots.findIndex(s=>s.videoId===id && !s.reused);
    if(idx>=0) await route("DELETE",`/api/schedule/${ds}/slot/${idx}`,{});
    await route("PUT",`/api/videos/${id}`,{video:{scheduledDate:null}});
    await delay(140); toast("已移出排程（影片保留，可重新排）"); openDay(ds);
  }catch(e){ toast(e.message||"移出失敗",true); }
}
// 移出排程（舊片重播）：只移除這天的重播，影片保留、使用次數同步退回
async function unscheduleReuse(id, ds){
  const v=vid(id)||{};
  const slots=((STATE.schedule||{})[ds]||{}).slots||[];
  const idx=slots.findIndex(s=>s.videoId===id && s.reused);
  if(idx<0){ toast("找不到這天的重播排程",true); return; }
  if(!confirm("把「"+vidTitle(v)+"」的重播移出「"+ds+"」？\n\n只移除這天的重播排程，影片不會刪除。")) return;
  try{
    await route("DELETE",`/api/schedule/${ds}/slot/${idx}`,{});
    const uh=(v.usageHistory||[]).filter(u=>!(u&&typeof u==="object"&&u.date===ds));
    await window.DB.update("videos", id, {usageHistory:uh, totalUsed:Math.max(0,(v.totalUsed||0)-1)});
    await delay(140); toast("已移出這天的重播（影片保留）"); openDay(ds);
  }catch(e){ toast(e.message||"移出失敗",true); }
}

// ===================================================================
// 今日工作（新片上架）
// ===================================================================
// 排程速覽：連續排滿天數（安全天數）＋未來 14 天缺口
function scheduleGlance(){
  let runway=0;
  for(let off=0;off<=120;off++){ const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()+off); const ds=d.toISOString().slice(0,10);
    if(dayBreakdown(ds).full) runway++; else break; }
  const defs=[];
  for(let off=0;off<14;off++){ const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()+off); const ds=d.toISOString().slice(0,10);
    const b=dayBreakdown(ds); if(!b.full){ defs.push({ds,short:b.short}); } }
  return {runway, defs, todayTarget:daySum(today)};
}
// ===== 交辦工作（剪輯以外）：tasks/{id} =====
function myTasks(){ return Object.values((STATE&&STATE.tasks)||{})
  .filter(t=>t && t.user===currentUser() && t.date===today)
  .sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||""))); }
// 對接窗口：後台名單（settings.contacts）＋ 任務曾用過的窗口，合併去重做成下拉
function settingsContacts(){ const sc=(STATE&&STATE.settings&&STATE.settings.contacts); return Array.isArray(sc)?sc.slice():[]; }
function contactOptions(){ const set=new Set();
  settingsContacts().forEach(c=>{ const v=String(c||"").trim(); if(v) set.add(v); });
  Object.values((STATE&&STATE.tasks)||{}).forEach(t=>{ const c=t&&t.contact&&String(t.contact).trim(); if(c) set.add(c); });
  return Array.from(set).sort((a,b)=>String(a).localeCompare(String(b))); }
function contactDatalist(id){ return `<datalist id="${id}">${contactOptions().map(c=>`<option value="${esc(c)}"></option>`).join("")}</datalist>`; }
// 任務裡輸入的新窗口，自動寫入後台名單，方便日後在設定裡修改／刪除
function rememberContact(name){ const c=String(name||"").trim(); if(!c) return;
  const cur=settingsContacts(); if(cur.some(x=>String(x).trim()===c)) return;
  cur.push(c); try{ window.DB.setSettings({contacts:cur}); }catch(e){} }
// 後台名單管理（限管理員・設定頁）
function addContact(){ const v=(val("ct_name")||"").trim(); if(!v){ toast("請輸入窗口名稱",true); return; }
  const cur=settingsContacts(); if(cur.some(x=>String(x).trim()===v)){ toast("已有相同窗口",true); return; }
  cur.push(v); window.DB.setSettings({contacts:cur}).then(()=>{ const i=document.getElementById('ct_name'); if(i)i.value=''; toast("已新增窗口「"+v+"」"); }).catch(()=>toast("新增失敗",true)); }
function delContact(name){ if(!confirm("刪除對接窗口「"+name+"」？（不影響已建立的交辦）")) return;
  const cur=settingsContacts().filter(x=>String(x).trim()!==String(name).trim());
  window.DB.setSettings({contacts:cur}).then(()=>toast("已刪除")).catch(()=>toast("刪除失敗",true)); }
function renameContact(name){ const input=prompt("修改對接窗口名稱：", name); if(input===null) return; const nn=input.trim();
  if(!nn||nn===name) return; const cur=settingsContacts(); const i=cur.findIndex(x=>String(x).trim()===String(name).trim()); if(i<0) return;
  if(cur.some((x,j)=>j!==i&&String(x).trim()===nn)){ toast("已有相同窗口",true); return; }
  cur[i]=nn; window.DB.setSettings({contacts:cur}).then(()=>toast("已改為「"+nn+"」")).catch(()=>toast("修改失敗",true)); }
async function createTask(){ const t=val("wp_newtask").trim(); if(!t){ toast("請輸入工作項目",true); return; }
  const contact=(val("wp_contact")||"").trim();
  const id="T"+Date.now().toString(36);
  try{ await window.DB.set("tasks", id, {id, user:currentUser(), date:today, title:t, contact, report:"", done:false, assignedBy:"", ack:true, createdAt:nowIso()});
    if(contact) rememberContact(contact);
    const inp=document.getElementById('wp_newtask'); if(inp) inp.value=''; const c=document.getElementById('wp_contact'); if(c) c.value=''; }
  catch(e){ toast("新增失敗，請稍後再試",true); } }
// 老闆指派交辦給指定剪輯：自動出現在他的頁面（今天），需按「收到」
async function assignTaskSel(){ const name=val("asg_who"); const t=val("asg_txt").trim(); const contact=(val("asg_contact")||"").trim();
  if(!name){ toast("請先選擇要指派的員工",true); return; }
  if(!t){ toast("請輸入要指派的工作內容",true); return; }
  const id="T"+Date.now().toString(36)+Math.floor(Math.random()*900).toString(36);
  try{ await window.DB.set("tasks", id, {id, user:name, date:today, title:t, contact, report:"", done:false, assignedBy:currentUser(), ack:false, createdAt:nowIso()});
    if(contact) rememberContact(contact);
    const a=document.getElementById('asg_txt'); if(a) a.value=''; const c=document.getElementById('asg_contact'); if(c) c.value=''; toast("已指派給 "+name); }
  catch(e){ toast("指派失敗，請稍後再試",true); } }
// 管理員指派毛片給指定員工（只分配、不啟動計時；員工自己認領才開始計時）
async function assignFootage(){
  const who=val("afp_who"); const sel=document.getElementById("afp_vids");
  if(!who){ toast("請先選擇員工",true); return; }
  const ids=sel?Array.from(sel.selectedOptions).map(o=>o.value).filter(Boolean):[];
  if(!ids.length){ toast("請選擇至少一支毛片",true); return; }
  BULK_BUSY=true; let n=0;
  try{ for(const id of ids){ try{ await window.DB.update("videos",id,{assignedTo:who,updatedAt:nowIso()}); n++; }catch(e){} } }
  finally{ BULK_BUSY=false; applyState(LAST_RAW); }
  await delay(300); toast("已指派 "+n+" 支給「"+who+"」（他認領後才開始計時）");
}
// 收回指派給某員工、但他還沒認領（仍待處理）的毛片，回到公用池
async function unassignEditor(name){
  const list=(STATE.videos||[]).filter(v=>v.stage==="待處理" && v.assignedTo===name);
  if(!list.length){ toast("「"+name+"」沒有待認領的指派毛片",true); return; }
  if(!confirm("把指派給「"+name+"」但還沒認領的 "+list.length+" 支毛片收回公用池？")) return;
  BULK_BUSY=true; let n=0;
  try{ for(const v of list){ try{ await window.DB.update("videos",v.id,{assignedTo:""}); n++; }catch(e){} } }
  finally{ BULK_BUSY=false; applyState(LAST_RAW); }
  await delay(300); toast("已收回 "+n+" 支到公用池");
}
function ackTask(id){ window.DB.update("tasks", id, {ack:true, ackAt:nowIso()}).catch(()=>toast("更新失敗",true)); }
function taskReport(id, v){ window.DB.update("tasks", id, {report:v}).catch(()=>{}); }
function taskDone(id, done){
  if(done){ const t=Object.values((STATE&&STATE.tasks)||{}).find(x=>x&&x.id===id);
    if(t && t.assignedBy && !t.ack){ toast("請先按「收到」再回報完成",true);
      const c=document.getElementById('tc_'+id); if(c) c.checked=false; return; }
    if(t && (t.report||'').trim().length<12){ toast("請填寫完整處理狀況及後續才能打勾完成",true);
      const c=document.getElementById('tc_'+id); if(c) c.checked=false; return; } }
  window.DB.update("tasks", id, {done:!!done, doneAt: done?nowIso():""}).catch(()=>toast("更新失敗",true)); }
function delTask(id){ if(!confirm("刪除這項交辦工作？")) return; window.DB.del("tasks", id).catch(()=>toast("刪除失敗",true)); }
// 管理員：把交辦工作轉移給其他員工（原員工會消失，新員工需重新按「收到」）
function transferTask(id){
  const t=Object.values((STATE&&STATE.tasks)||{}).find(x=>x&&x.id===id);
  if(!t){ toast("找不到這項交辦",true); return; }
  const editors=(STATE.users||[]).filter(u=>(u.role||"editor")==="editor" && u.name!==t.user).map(u=>u.name);
  if(!editors.length){ toast("沒有其他員工可轉移",true); return; }
  const menu=editors.map((n,i)=>`${i+1}. ${n}`).join("\n");
  const ans=prompt("把「"+t.title+"」轉移給哪位員工？輸入編號：\n"+menu); if(ans===null) return;
  const idx=parseInt(String(ans).trim(),10)-1;
  if(isNaN(idx)||idx<0||idx>=editors.length){ toast("編號不正確",true); return; }
  const to=editors[idx];
  window.DB.update("tasks", id, {user:to, ack:false, ackAt:"", done:false, doneAt:""})
    .then(()=>toast("已轉移給「"+to+"」，等對方按「收到」重新計時"))
    .catch(()=>toast("轉移失敗",true));
}

// 上班計畫：自動帶出製作中影片（標天數）＋ 交辦工作 ＋ 下班匯報
function viewWork(){
  const me = currentUser();
  const inProg = myInProgressCount(); const atLimit = inProg>=3;   // 最多同時 3 支進行中
  const mine = (STATE.videos||[]).filter(v=>(v.claimedBy===me||v.editor===me) && v.stage==="剪輯中")
    .sort((a,b)=>String(a.claimedAt||"").localeCompare(String(b.claimedAt||"")));
  // 待剪池：指派給我的 ＋ 還沒指派的公用毛片（別人被指派的不顯示）；指派給我的排前面
  const pool = (STATE.videos||[]).filter(v=>v.stage==="待處理" && (v.assignedTo===me || !v.assignedTo))
    .sort((a,b)=>{ const am=(a.assignedTo===me?0:1), bm=(b.assignedTo===me?0:1); return am-bm || String(a.id).localeCompare(String(b.id)); });
  const poolShown=pool;   // 全部顯示，超過 5 條時改用捲動視窗（見下方 max-height）
  const doneToday = (STATE.videos||[]).filter(v=>v.editor===me && isPublished(v) && String(v.finishedAt||"").slice(0,10)===today);
  // 我的剪輯工作 = 進行中(剪輯中) ＋ 今天剛完成的（保留在工作列，下班後才消失；隔天也不再出現）
  const clockedOut = !!(myShift() && myShift().clockOut);
  const myDoneToday = clockedOut ? [] : (STATE.videos||[]).filter(v=>v.editor===me && v.stage==="已完成" && String(v.finishedAt||"").slice(0,10)===today)
    .sort((a,b)=>String(a.finishedAt||"").localeCompare(String(b.finishedAt||"")));
  const myWork = mine.concat(myDoneToday);
  const tasks = myTasks();
  const g=scheduleGlance();
  // 天數標記：今天＝新，昨天＝2，前天＝3…（越久顏色越警示）
  const dayBadge=(v)=>{ const b=claimDayBadge(v); const n=(b==="新")?1:(+b); const col=n>=4?'var(--red)':(n>=2?'var(--amber)':'var(--accent)');
    return `<span style="display:inline-flex;min-width:30px;height:30px;padding:0 9px;border-radius:5px;background:${col};color:#fff;font-weight:900;font-size:14px;align-items:center;justify-content:center">${b}</span>`; };
  // 我的剪輯工作狀態按鈕：我作業中…→（按）編輯內容 ▶（進編輯畫面，存檔＝已完成）
  const workBtn=(v)=>{
    if(v.stage==="已完成") return `<button class="btn sm" disabled style="opacity:1;background:var(--green);box-shadow:none">已完成</button>`;
    if(v.workStep===1) return `<button class="btn sm" onclick="openVideoModal('${v.id}',true,true)" title="進入編輯畫面，填好按「儲存並完成」＝已完成">編輯內容 ▶</button>`;
    return `<button class="btn sec sm" onclick="setWorkStep('${v.id}',1)" title="剪好了？按一下進到「編輯內容」填資料">我作業中…</button>`; };
  // 退回鍵：把認領的毛片放回待剪清單重選（一人最多 3 支）
  const undoBtn=(v)=> v.stage==="剪輯中" ? `<button class="btn sec sm" onclick="unclaimVid('${v.id}')" title="後悔了？退回給大家重選">退回</button>` : '';
  const rejected = (STATE.videos||[]).filter(v=>v.reviewStatus==="退回" && (v.editor===me||v.claimedBy===me));
  const rejCard = rejected.length?`<div class="card" style="border-color:var(--red)"><b style="color:var(--red)">老闆娘退回待修（${rejected.length}）</b>
    ${rejected.map(v=>`<div style="margin-top:6px;padding:9px;background:var(--redbg);border-radius:5px">
      <a href="javascript:void(0)" onclick="editVideo('${v.id}')"><b>${esc(vidTitle(v))}</b></a>
      ${v.reviewNote?`<div class="muted" style="font-size:12px;margin-top:2px">退回原因：${esc(v.reviewNote)}</div>`:''}</div>`).join("")}</div>`:'';
  return `
  <h2>本日上班計畫（${esc(me)}）</h2>
  ${rejCard}

  <div class="workgrid">

  <div class="card">
    <div class="row" style="justify-content:space-between;align-items:center">
      <b style="font-size:16px">待剪毛片</b>
      <span class="pill ${pool.length?'ok':'wa'}">待剪 ${pool.length} 支</span>
    </div>
    <div style="margin-top:10px${pool.length>5?';max-height:300px;overflow-y:auto':''}">
    <table class="responsive"><thead><tr><th>影片</th><th style="width:150px">動作</th></tr></thead>
    <tbody>${poolShown.map(v=>`<tr>
        <td data-label="影片"><a href="javascript:void(0)" onclick="editVideo('${v.id}')">${esc(vidTitle(v))}</a> ${v.assignedTo===me?'<span class="tag" style="background:var(--amberbg);color:var(--accent)">指派給你</span>':''} <span class="muted" style="font-size:12px">${esc(v.source||"")}</span></td>
        <td data-label="動作"><button class="btn sm" onclick="claimVid('${v.id}')" ${atLimit?'disabled style="opacity:.5;cursor:not-allowed"':''} title="${atLimit?'你已有 3 支在剪，完成一支才能再領（排隊中）':'按一下＝認領並開始剪（變剪輯中、進我的工作、開始計時）'}">${atLimit?'排隊中':'認領開始剪'}</button></td>
      </tr>`).join("")||`<tr><td colspan="2" class="muted">目前沒有指派給你或可認領的毛片</td></tr>`}</tbody></table>
    </div>
    ${atLimit?'<p class="muted" style="font-size:12px;margin:6px 0 0"><span style="color:var(--red)">你已有 3 支製作中，先完成幾支再領</span></p>':''}
  </div>

  <div class="card">
    <div class="row" style="justify-content:space-between;align-items:center">
      <b style="font-size:16px">我的今日工作</b>
      <span class="pill ${atLimit?'wa':'ok'}">製作中 ${inProg}/3</span>
    </div>
    <table class="responsive" style="margin-top:10px"><thead><tr><th style="width:60px">天數</th><th>影片</th><th style="width:200px">狀態</th></tr></thead>
    <tbody>${myWork.map(v=>`<tr>
        <td data-label="天數">${v.stage==="剪輯中"?dayBadge(v):'<span class="muted">—</span>'}</td>
        <td data-label="影片"><a href="javascript:void(0)" onclick="editVideo('${v.id}')">${esc(vidTitle(v))}</a> <span class="muted" style="font-size:12px">${esc(v.source||"")}</span></td>
        <td data-label="狀態"><div class="row" style="gap:6px">${workBtn(v)}${undoBtn(v)}</div></td>
      </tr>`).join("")||`<tr><td colspan="3" class="muted">目前沒有進行中的影片，從上面「待剪毛片」認領一支開始</td></tr>`}</tbody></table>
  </div>

  <div class="card">
    <b style="font-size:16px">我的今日交辦工作（剪輯以外）</b>
    <div style="margin-top:10px">${tasks.map(t=>{ const can=(t.report||'').trim().length>=12; const assigned=!!t.assignedBy; const needAck=assigned&&!t.ack;
      const head=`<div class="row" style="justify-content:space-between;align-items:center;gap:8px">
          <b style="font-size:14px">${esc(t.title)}</b>
          ${assigned?`<span class="pill em" style="font-size:10px;flex:none">老闆指派</span>`:`<button class="btn sec sm" style="flex:none;padding:4px 10px" onclick="delTask('${t.id}')">刪</button>`}
        </div>`;
      const contactLine = t.contact ? `<div style="font-size:12px;margin-top:4px"><span class="muted">對接窗口：</span><b style="color:var(--gold-dk)">${esc(t.contact)}</b></div>` : '';
      if(needAck) return `<div style="border:1px solid var(--gold);background:var(--amberbg);border-radius:6px;padding:12px;margin-bottom:10px">
        ${head}${contactLine}
        <div class="muted" style="font-size:12px;margin:6px 0 8px">老闆 ${esc(t.assignedBy)} 指派・<b style="color:var(--gold-dk)">按下收到開始執行</b></div>
        <button class="btn sm" style="width:100%" onclick="ackTask('${t.id}')">我收到了</button></div>`;
      return `<div style="border:1px solid var(--line);border-radius:6px;padding:12px;margin-bottom:10px">
        ${head}${contactLine}
        ${assigned?`<div class="muted" style="font-size:12px;margin-top:4px">已收到（老闆 ${esc(t.assignedBy)} 指派）</div>`:''}
        <input id="tr_${t.id}" value="${esc(t.report||'')}" style="margin-top:8px" oninput="var c=document.getElementById('tc_${t.id}');if(c)c.disabled=this.value.trim().length<12" onchange="taskReport('${t.id}',this.value)" placeholder="填寫完整處理狀況及後續…">
        <label style="display:inline-flex;align-items:center;gap:6px;font-weight:700;margin-top:8px;color:${t.done?'var(--green)':'var(--amber)'}">
          <input type="checkbox" id="tc_${t.id}" ${t.done?'checked':''} ${can||t.done?'':'disabled'} onchange="taskDone('${t.id}',this.checked)" style="width:auto;margin:0"> ${t.done?'已完成':'進行中'}</label>
      </div>`;}).join("")||`<div class="muted">尚無交辦工作</div>`}</div>
    <div class="row" style="gap:8px;margin-top:6px"><input id="wp_newtask" placeholder="自己新增工作項目…" style="flex:2;min-width:150px" onkeydown="if(event.key==='Enter')createTask()"><input id="wp_contact" list="wp_contact_dl" placeholder="對接窗口（選填）" style="flex:1;min-width:120px" onkeydown="if(event.key==='Enter')createTask()">${contactDatalist('wp_contact_dl')}<button class="btn sm" onclick="createTask()">＋ 加入</button></div>
  </div>

  <div class="card" style="text-align:center">
    <span class="pill ok">今日已完成上架 ${doneToday.length} 支</span>
    <span class="pill ${tasks.filter(t=>t.done).length===tasks.length?'ok':'wa'}" style="margin-left:8px">交辦完成 ${tasks.filter(t=>t.done).length}/${tasks.length}</span>
    <div style="margin-top:14px"><button class="btn" style="font-size:16px;padding:14px 34px" onclick="clockOutReport()">下班匯報</button></div>
  </div>

  </div>`
}
// 下班匯報：自動彙整今日完成上架 ＋ 交辦工作狀況；確認後打下班卡並回登入頁
function clockOutReport(){
  const me=currentUser();
  const doneVids=(STATE.videos||[]).filter(v=>v.editor===me && isPublished(v) && String(v.finishedAt||"").slice(0,10)===today);
  const wip=(STATE.videos||[]).filter(v=>(v.claimedBy===me||v.editor===me) && v.stage==="剪輯中");
  const tasks=myTasks();
  const body=`
    <div class="card" style="background:var(--panel2)"><b>今日完成上架（${doneVids.length}）</b>
      ${doneVids.length?doneVids.map(v=>`<div style="margin-top:6px">• ${esc(vidTitle(v))} <span class="pill ok" style="font-size:10px">已完成</span> <span class="muted" style="font-size:12px">剪 ${editDaysLabel(v)} 天</span></div>`).join("")
        :'<p class="muted" style="margin:6px 0 0">今日尚無完成上架</p>'}
      ${wip.length?`<p class="muted" style="font-size:12px;margin:8px 0 0">尚有 ${wip.length} 支製作中（未完成，保留至明天）</p>`:''}
    </div>
    <div class="card" style="background:var(--panel2)"><b>交辦工作（${tasks.filter(t=>t.done).length}/${tasks.length} 完成）</b>
      ${tasks.length?tasks.map(t=>`<div style="margin-top:6px">• ${esc(t.title)} ${t.done?'<span class="pill ok" style="font-size:10px">已完成</span>':'<span class="pill em" style="font-size:10px">未完成</span>'}${t.report?` <span class="muted" style="font-size:12px">— ${esc(t.report)}</span>`:''}</div>`).join("")
        :'<p class="muted" style="margin:6px 0 0">今日無交辦工作</p>'}
    </div>`;
  showModal("下班匯報", body, async ()=>{ await doClockOut(); closeModal(); toast("辛苦了，已下班 "); setTimeout(showGoodbye,300); return true; }, "確認下班");
}
async function doClockOut(){
  const id=shiftId(currentUser(),today);
  try{ if(myShift()) await window.DB.update("shifts",id,{clockOut:nowIso()});
       else await window.DB.set("shifts",id,{id,user:currentUser(),date:today,clockIn:nowIso(),clockOut:nowIso()}); }catch(e){}
}
// 管理員儀表板：今日進度＋排程健康/庫存＋每日匯報＋累計KPI
function viewDashboard(){
  const editors=(STATE.users||[]).filter(u=>(u.role||"editor")==="editor").map(u=>u.name);
  const shifts=Object.values((STATE&&STATE.shifts)||{});
  const allTasks=Object.values((STATE&&STATE.tasks)||{});
  const D=SHIFT_DATE, isToday=(D===today);
  const hm=iso=>String(iso||"").slice(11,16);
  const dur=(a,b)=>{ const m=durationMin(a,b); if(m==null) return "—"; const h=Math.floor(m/60), mm=m%60; return (h?h+"h":"")+mm+"m"; };
  const minLabel=(m)=> (typeof m==="number")?((Math.floor(m/60)?Math.floor(m/60)+"h":"")+(m%60)+"m"):"—";
  const fin=(STATE.videos||[]).filter(v=>isPublished(v)&&v.finishedAt&&v.editor);

  // ---- 每位剪輯：所選日期的當日明細 ----
  const perEditor=editors.map(name=>{
    const s=shifts.find(x=>x.user===name && x.date===D);
    const done=(STATE.videos||[]).filter(v=>v.editor===name && isPublished(v) && String(v.finishedAt||"").slice(0,10)===D)
      .sort((a,b)=>String(a.finishedAt||"").localeCompare(String(b.finishedAt||"")));
    const wip=isToday?(STATE.videos||[]).filter(v=>(v.claimedBy===name||v.editor===name) && v.stage==="剪輯中"):[];
    const tasks=allTasks.filter(t=>t.user===name && t.date===D);
    const assignedOpen=allTasks.filter(t=>t.user===name && t.assignedBy && !t.done)
      .sort((a,b)=>String(b.createdAt||b.date||"").localeCompare(String(a.createdAt||a.date||"")));
    const assignedDone=allTasks.filter(t=>t.user===name && t.assignedBy && t.done && t.doneAt && daysBetween(String(t.doneAt).slice(0,10),today)<=7)
      .sort((a,b)=>String(b.doneAt||"").localeCompare(String(a.doneAt||""))).slice(0,6);
    const sales=done.filter(v=>(v.productUrl||"").trim()||(Array.isArray(v.products)&&v.products.some(p=>p&&p.name))).length;
    const mins=done.map(v=>v.durationMin).filter(x=>typeof x==="number");
    const sumMin=mins.reduce((a,b)=>a+b,0);
    return {name,s,done,wip,tasks,assignedOpen,assignedDone,sales,sumMin};
  });
  const present=perEditor.filter(e=>e.s&&e.s.clockIn).length;
  const teamDone=perEditor.reduce((a,e)=>a+e.done.length,0);
  const teamSales=perEditor.reduce((a,e)=>a+e.sales,0);
  const teamTasksDone=perEditor.reduce((a,e)=>a+e.tasks.filter(t=>t.done).length,0);
  const teamTasks=perEditor.reduce((a,e)=>a+e.tasks.length,0);
  const teamAssignedOpen=perEditor.reduce((a,e)=>a+e.assignedOpen.length,0);

  const statusPill=(s)=> !s||!s.clockIn ? '<span class="pill em">未上班</span>'
      : (s.clockOut?'<span class="pill ok">已下班</span>':'<span class="pill wa">上班中</span>');
  const vline=(v,extra)=>`<div style="margin:5px 0">• <a href="javascript:void(0)" onclick="editVideo('${v.id}')">${esc(vidTitle(v))}</a>${extra||""}</div>`;

  const cards=perEditor.map((e,i)=>{
    const att=e.s&&e.s.clockIn? `${hm(e.s.clockIn)}–${e.s.clockOut?hm(e.s.clockOut):'…'}　工時 ${dur(e.s.clockIn,e.s.clockOut||(isToday?nowIso():e.s.clockIn))}` : '—';
    const doneHTML=e.done.length? e.done.map(v=>vline(v,` <span class="pill ok" style="font-size:10px">完成</span> <span class="muted" style="font-size:12px">剪 ${editDaysLabel(v)||'-'} 天・工時 ${minLabel(v.durationMin)}</span>`)).join("")
        : '<div class="muted" style="font-size:13px;margin-top:4px">當日無完成</div>';
    const wipHTML=isToday?(e.wip.length? e.wip.map(v=>vline(v,' <span class="pill wa" style="font-size:10px">進行中</span>')).join("")
        : '<div class="muted" style="font-size:13px;margin-top:4px">目前無進行中</div>'):'';
    const ackPill=(t)=> t.assignedBy ? (t.ack?' <span class="pill ok" style="font-size:10px">已接收</span>':' <span class="pill em" style="font-size:10px">尚未接收</span>') : '';
    const taskHTML=e.tasks.length? e.tasks.map((t,ti)=>`<div style="margin:5px 0"><b style="color:var(--muted)">${ti+1}.</b> ${esc(t.title)}${t.assignedBy?' <span class="muted" style="font-size:11px">[指派]</span>':''}${t.done?'':ackPill(t)} ${t.done?'<span class="pill ok" style="font-size:10px">完成</span>':'<span class="pill em" style="font-size:10px">未完成</span>'}${t.contact?`<div class="muted" style="font-size:12px;margin:1px 0 0 16px">對接窗口：<b style="color:var(--gold-dk)">${esc(t.contact)}</b></div>`:''}${t.report?`<div class="muted" style="font-size:12px;margin:1px 0 0 16px">回報：${esc(t.report)}</div>`:'<div class="muted" style="font-size:12px;margin:1px 0 0 16px">（未填回報）</div>'}</div>`).join("")
        : '<div class="muted" style="font-size:13px;margin-top:4px">當日無交辦工作</div>';
    // 我交辦給他的：跨日期追蹤，知道交給誰、收到沒、花多久、處理結果、下一步、做完沒
    const openHTML=e.assignedOpen.map(t=>{
      const elapsed=t.ackAt?durationMin(t.ackAt,nowIso()):null;
      const timeLine=t.ackAt
        ? `<div style="font-size:12px;margin-top:2px"><span class="muted">已接收 ${hm(t.ackAt)} ·</span> <b style="color:var(--gold-dk)">計時中 ${minLabel(elapsed)}</b></div>`
        : `<div style="font-size:12px;margin-top:2px;color:var(--red);font-weight:700">尚未接收</div>`;
      return `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--gold)">
        <div style="font-weight:600;font-size:13.5px">${esc(t.title)} ${t.ack?'<span class="pill ok" style="font-size:10px">已接收</span>':'<span class="pill em" style="font-size:10px">尚未接收</span>'} <span class="pill em" style="font-size:10px">未完成</span></div>
        <div class="muted" style="font-size:11px;margin-top:2px">交辦日 ${esc((t.date||'').slice(5)||'-')}</div>
        ${t.contact?`<div style="font-size:12px;margin-top:2px"><span class="muted">對接窗口：</span><b style="color:var(--gold-dk)">${esc(t.contact)}</b></div>`:''}
        ${timeLine}
        <div style="font-size:12px;margin-top:3px"><span class="muted">處理結果／下一步：</span>${t.report?esc(t.report):'<span style="color:var(--red);font-weight:600">尚未回報</span>'}</div>
        <div class="row" style="gap:6px;margin-top:6px">
          <button class="btn sec sm" style="padding:4px 10px" onclick="transferTask('${t.id}')">轉移</button>
          <button class="btn danger sm" style="padding:4px 10px" onclick="delTask('${t.id}')">刪除</button>
        </div>
      </div>`;}).join("");
    const doneHTMLa=e.assignedDone.map(t=>{
      const took=durationMin(t.ackAt||t.createdAt,t.doneAt);
      return `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--gold)">
        <div style="font-weight:600;font-size:13.5px">${esc(t.title)} <span class="pill ok" style="font-size:10px">已完成</span></div>
        <div class="muted" style="font-size:11px;margin-top:2px">完成 ${String(t.doneAt||'').slice(5,10)} ${hm(t.doneAt)} · <b style="color:var(--green)">耗時 ${minLabel(took)}</b></div>
        ${t.contact?`<div style="font-size:12px;margin-top:2px"><span class="muted">對接窗口：</span><b style="color:var(--gold-dk)">${esc(t.contact)}</b></div>`:''}
        ${t.report?`<div style="font-size:12px;margin-top:3px"><span class="muted">結果：</span>${esc(t.report)}</div>`:''}
        <div class="row" style="gap:6px;margin-top:6px">
          <button class="btn sec sm" style="padding:4px 10px" onclick="delTask('${t.id}')">刪除</button>
        </div>
      </div>`;}).join("");
    const trackHTML=(e.assignedOpen.length||e.assignedDone.length)?`<div style="margin-top:12px;padding:10px 12px;background:var(--amberbg);border:1px solid var(--gold);border-radius:6px">
      <b style="font-size:13px;color:var(--gold-dk)">我交辦給他的</b>
      ${e.assignedOpen.length?`<div style="margin-top:4px"><span class="pill wa" style="font-size:10px">追蹤中 ${e.assignedOpen.length}</span></div>${openHTML}`:''}
      ${e.assignedDone.length?`<div style="margin-top:10px"><span class="pill ok" style="font-size:10px">近 7 天完成 ${e.assignedDone.length}</span></div>${doneHTMLa}`:''}
    </div>`:'';
    return `<div class="card">
      <div class="row" style="justify-content:space-between;align-items:center;gap:8px">
        <b style="font-size:16px">${esc(e.name)}</b>
        <span>${statusPill(e.s)}</span>
      </div>
      <div class="muted" style="font-size:13px;margin-top:2px">上班 ${att}</div>
      <div class="mstat">
        <div><div class="n ${e.done.length?'':'muted'}">${e.done.length}</div><div class="l">完成上架</div></div>
        <div><div class="n ${e.tasks.length&&e.tasks.filter(t=>t.done).length<e.tasks.length?'warn':''} ${e.tasks.length?'':'muted'}">${e.tasks.filter(t=>t.done).length}/${e.tasks.length}</div><div class="l">交辦完成</div></div>
      </div>
      ${trackHTML}
      <div style="margin-top:12px"><b style="font-size:13px">剪輯進度</b>${doneHTML}</div>
      ${isToday?`<div style="margin-top:10px"><b style="font-size:13px">進行中（未完成）</b>${wipHTML}</div>`:''}
      <div style="margin-top:10px"><b style="font-size:13px">交辦回報</b>${taskHTML}</div>
    </div>`;
  }).join("")||'<div class="card muted">尚無剪輯成員</div>';

  // ---- 累計 KPI ----
  const kpi=editors.map(name=>{ const my=fin.filter(v=>v.editor===name);
    const days=my.map(editDays).filter(x=>x!=null); const avgDays=days.length?(days.reduce((a,b)=>a+b,0)/days.length):null;
    const mins=my.map(v=>v.durationMin).filter(x=>typeof x==="number"); const avgMin=mins.length?Math.round(mins.reduce((a,b)=>a+b,0)/mins.length):null;
    const sales=my.filter(v=>(v.productUrl||"").trim()||(Array.isArray(v.products)&&v.products.some(p=>p&&p.name))).length;
    const aDone=allTasks.filter(t=>t.user===name && t.assignedBy && t.done);
    const aMins=aDone.map(t=>durationMin(t.ackAt||t.createdAt,t.doneAt)).filter(x=>typeof x==="number");
    const aAvg=aMins.length?Math.round(aMins.reduce((a,b)=>a+b,0)/aMins.length):null;
    return {name, count:my.length, avgDays, avgMin, sales, aCount:aDone.length, aAvg}; });
  // 各項最佳（用於標綠）：剪片最快＝平均天數最低、交辦最多、交辦最快
  const okEditors=kpi.length>1;
  const bestEdit=Math.min(Infinity,...kpi.filter(k=>k.avgDays!=null).map(k=>k.avgDays));
  const bestACount=Math.max(0,...kpi.map(k=>k.aCount));
  const bestATime=Math.min(Infinity,...kpi.filter(k=>k.aAvg!=null).map(k=>k.aAvg));
  // 綜合之星：以「產量(剪片完成)」為主，剪片速度次之，交辦完成/速度只當加分
  // 標準化 0~1；若該項只有一人有值(無差異)就不給分，避免「唯一一人」直接拿滿分而蓋過大量剪片
  let starName=null;
  if(okEditors){
    const norm=(v,arr,low)=>{ const xs=arr.filter(x=>x!=null); if(!xs.length) return 0; const mn=Math.min(...xs),mx=Math.max(...xs);
      if(v==null) return 0; if(mx===mn) return 0; return low?(mx-v)/(mx-mn):(v-mn)/(mx-mn); };
    const cC=kpi.map(k=>k.count), cD=kpi.map(k=>k.avgDays), cA=kpi.map(k=>k.aCount), cT=kpi.map(k=>k.aAvg);
    // 權重：剪片完成 3、剪片速度 1.5、交辦完成 1、交辦速度 0.5
    const scored=kpi.map(k=>({name:k.name, s:3*norm(k.count,cC,false)+1.5*norm(k.avgDays,cD,true)+1*norm(k.aCount,cA,false)+0.5*norm(k.aAvg,cT,true), act:(k.count||0)+(k.aCount||0)}))
      .filter(x=>x.act>0).sort((a,b)=>b.s-a.s);
    if(scored.length && scored[0].s>0) starName=scored[0].name;
  }

  // ---- 排程健康/庫存 ----
  const g=scheduleGlance();
  const poolAll=(STATE.videos||[]).filter(v=>v.stage==="待處理");
  const poolN=poolAll.length;
  const unassignedPool=poolAll.filter(v=>!v.assignedTo).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const assignCount={}; poolAll.forEach(v=>{ if(v.assignedTo) assignCount[v.assignedTo]=(assignCount[v.assignedTo]||0)+1; });
  const noSchedN=(STATE.videos||[]).filter(v=>vidSegment(v)==="newNoSched").length;
  const wipN=(STATE.videos||[]).filter(v=>v.stage==="剪輯中").length;
  const runwayCls=g.runway>=7?'ok':(g.runway>=3?'wa':'em');
  // ---- 未來 35 天排程視覺帶 ----
  const STRIP_N=35; const strip=[];
  for(let off=0;off<STRIP_N;off++){ const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()+off); const ds=d.toISOString().slice(0,10);
    const b=dayBreakdown(ds); strip.push({ds,off,total:b.total,target:b.target,st:b.full?'full':(b.total>0?'part':'none')}); }
  const reD=new Date(today+"T00:00:00"); reD.setDate(reD.getDate()+Math.max(g.runway-1,0)); const runwayEnd=reD.toISOString().slice(0,10);
  const gapN=strip.filter(x=>x.st!=='full').length;
  const stripHTML=strip.map(x=>{ const wd="日一二三四五六"[new Date(x.ds+"T00:00:00").getDay()];
    return `<div class="sday sd-${x.st} ${x.off===0?'sd-today':''}" title="${x.ds}（${wd}）已排 ${x.total}/${x.target}" onclick="CUR_TAB='cal';CAL_YM=null;buildNav();render()">
      <span class="sd-wd">${wd}</span><span class="sd-n">${+x.ds.slice(8,10)}</span><span class="sd-c">${x.total}/${x.target}</span></div>`; }).join("");

  const D2=daysBetween(D,today); const dayLabel = D===today?'今天':(D===yesterday?'昨天':(D2+' 天前'));

  return `<h2>儀表板 <span class="muted" style="font-size:13px">僅管理員可見</span></h2>

  <div class="dgrid">
  <div class="card" style="border-color:var(--gold)">
    <div class="row" style="align-items:baseline;gap:8px">
      <b style="font-size:16px">① 指派交辦給員工</b>
    </div>
    <div class="grid cols2" style="margin-top:12px">
      <div><label>選擇員工</label>
        <select id="asg_who"><option value="">— 選擇員工 —</option>${editors.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select></div>
      <div><label>交辦內容</label>
        <input id="asg_txt" placeholder="要交辦的工作內容…" onkeydown="if(event.key==='Enter')assignTaskSel()"></div>
    </div>
    <div style="margin-top:10px"><label>對接窗口（選填）</label>
      <input id="asg_contact" list="asg_contact_dl" placeholder="選用過的窗口或輸入新的（沒有可留空）" onkeydown="if(event.key==='Enter')assignTaskSel()">${contactDatalist('asg_contact_dl')}</div>
    <button class="btn" style="width:100%;margin-top:10px" onclick="assignTaskSel()">送出交辦</button>
  </div>

  <div class="card" style="border-color:var(--gold)">
    <b style="font-size:16px">🎬 指派毛片給員工</b>
    <div class="muted" style="font-size:12px;margin-top:4px">目前待剪毛片 <b>${poolN}</b> 支（未指派 <b>${unassignedPool.length}</b> 支）。指派只是分配，員工自己「認領」才開始計時；同時最多領 3 支，其餘排隊。</div>
    <div class="grid cols2" style="margin-top:10px">
      <div><label>選擇員工</label>
        <select id="afp_who"><option value="">— 選擇員工 —</option>${editors.map(n=>`<option value="${esc(n)}">${esc(n)}${assignCount[n]?`（已指派 ${assignCount[n]}）`:""}</option>`).join("")}</select></div>
      <div><label>選擇毛片（可多選：電腦按住 Ctrl/⌘、手機點多個）</label>
        <select id="afp_vids" multiple size="6">${unassignedPool.map(v=>`<option value="${esc(v.id)}">${esc(vidTitle(v))}</option>`).join("")||'<option disabled>目前沒有未指派的待剪毛片</option>'}</select></div>
    </div>
    <button class="btn" style="width:100%;margin-top:10px" onclick="assignFootage()">指派給該員工</button>
    ${Object.keys(assignCount).length?`<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px">
      ${editors.filter(n=>assignCount[n]).map(n=>`<div class="row" style="justify-content:space-between;gap:8px;margin:4px 0">
        <span>${esc(n)}：待剪已指派 <b>${assignCount[n]}</b> 支</span>
        <button class="btn sec sm" onclick="unassignEditor('${esc(jsEsc(n))}')">收回未認領</button></div>`).join("")}
    </div>`:''}
  </div>

  <div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px">
      <b style="font-size:16px">② 工作進度與交辦回報</b>
      <div class="row" style="gap:6px;align-items:center;flex-wrap:nowrap">
        <button class="btn sec sm" onclick="shiftDateMove(-1)" title="前一天">‹</button>
        <input type="date" max="${today}" value="${D}" onchange="shiftDateSet(this.value)" style="width:auto">
        <button class="btn sec sm" onclick="shiftDateMove(1)" title="後一天" ${D>=today?'disabled style="opacity:.4"':''}>›</button>
      </div>
    </div>
    <div class="muted" style="font-size:13px;margin-top:8px"><b style="color:var(--txt)">${D}（${weekdayZh(D)}）</b> <span class="pill ${isToday?'wa':'ok'}" style="font-size:10px;margin-left:4px">${dayLabel}</span></div>
    <div class="mstat">
      <div><div class="n ${present<editors.length?'warn':''}">${present}/${editors.length}</div><div class="l">出勤人數</div></div>
      <div><div class="n ${teamDone?'':'muted'}">${teamDone}</div><div class="l">完成上架</div></div>
      <div><div class="n ${teamTasks&&teamTasksDone<teamTasks?'warn':''} ${teamTasks?'':'muted'}">${teamTasksDone}/${teamTasks}</div><div class="l">交辦完成</div></div>
      ${teamAssignedOpen?`<div><div class="n warn">${teamAssignedOpen}</div><div class="l">交辦待結</div></div>`:''}
    </div>
  </div>
  </div>
  <div class="dgrid-ed">${cards}</div>

  <div class="card">
    <b style="font-size:16px">③ 未來影片排程</b>
    <div style="display:flex;align-items:baseline;gap:10px;margin-top:12px;flex-wrap:wrap">
      <span style="font-family:var(--serif);font-size:40px;font-weight:700;line-height:1;color:${g.runway>=7?'var(--green)':(g.runway>=3?'var(--gold-dk)':'var(--red)')}">${g.runway}</span>
      <span style="font-size:15px">天完整排程</span>
      <span class="muted" style="font-size:13px">從今天起連續排滿到 <b style="color:var(--txt)">${g.runway>0?runwayEnd+'（'+weekdayZh(runwayEnd)+'）':'—（今天就缺）'}</b></span>
    </div>
    <div class="sstrip" style="margin-top:12px">${stripHTML}</div>
    <div class="row" style="gap:14px;margin-top:4px;font-size:11px">
      <span class="muted"><i class="slg slg-full"></i> 已排滿</span>
      <span class="muted"><i class="slg slg-part"></i> 不足</span>
      <span class="muted"><i class="slg slg-none"></i> 未排（缺片）</span>
    </div>
    <div class="row" style="gap:8px;margin-top:14px;border-top:1px solid var(--line);padding-top:12px">
      <span class="pill ${gapN?'em':'ok'}">未來 35 天缺 ${gapN} 天</span>
      <span class="pill ${poolN?'wa':'ok'}">待剪毛片 ${poolN}</span>
      <span class="pill wa">製作中 ${wipN}</span>
      <span class="pill ${noSchedN?'wa':'ok'}">新片未排程 ${noSchedN}</span>
    </div>
  </div>

  <div class="card">
    <b style="font-size:16px">④ 員工長期績效（累計・全期）</b>
    ${starName?`<div style="margin-top:10px;padding:10px 14px;background:var(--amberbg);border:1px solid var(--gold);border-radius:6px;display:flex;align-items:center;gap:10px">
      <span style="font-size:22px;color:var(--signal)">✦</span>
      <div><div style="font-family:var(--serif);font-size:17px;font-weight:700">綜合表現之星　${esc(starName)}</div>
      <div class="muted" style="font-size:12px">以產量(剪片完成)為主，兼看剪片速度與交辦表現</div></div></div>`:''}
    <div class="muted" style="font-size:12px;margin-top:8px">綠色＝該項表現最佳：剪片最快、交辦完成最多、交辦完成最快</div>
    <table class="responsive" style="margin-top:10px"><thead><tr><th>剪輯</th><th>剪片完成</th><th>剪片速度</th><th>平均工時</th><th>寵粉</th><th>交辦完成</th><th>交辦速度</th></tr></thead>
    <tbody>${kpi.map(k=>`<tr><td data-label="剪輯"><b>${k.name===starName?'<span style="color:var(--signal)">✦</span> ':''}${esc(k.name)}</b></td>
      <td data-label="剪片完成">${k.count}</td>
      <td data-label="剪片速度" class="${okEditors&&k.avgDays!=null&&k.avgDays===bestEdit?'pos':''}">${k.avgDays!=null?k.avgDays.toFixed(1)+' 天':'—'}</td>
      <td data-label="平均工時">${minLabel(k.avgMin)}</td>
      <td data-label="寵粉">${k.sales}</td>
      <td data-label="交辦完成" class="${okEditors&&k.aCount&&k.aCount===bestACount?'pos':''}">${k.aCount}</td>
      <td data-label="交辦速度" class="${okEditors&&k.aAvg!=null&&k.aAvg===bestATime?'pos':''}">${k.aAvg!=null?minLabel(k.aAvg):'—'}</td></tr>`).join("")||'<tr><td colspan="7" class="muted">尚無資料</td></tr>'}</tbody></table>
    <div style="margin-top:14px"><a class="btn sec sm" href="${META_DASH_URL}" target="_blank">開啟短影音外部成效儀表板 →</a></div>
  </div>`;
}
// ① 批次建檔新毛片：一行一支片名，一次建立多支「待剪新片」
function batchNewFootage(){
  let blocks="";
  for(let i=0;i<5;i++){
    blocks+=`<fieldset style="border:1px solid var(--line);border-radius:6px;padding:10px 12px;margin:0 0 10px">
      <legend style="font-size:13px;color:var(--muted);padding:0 6px">第 ${i+1} 支</legend>
      <label>原始片名（編號自動產生：民國年＋月日＋當日序號）</label>
      <input id="bn${i}" placeholder="毛片片名（留空＝不建立這支）">
      <label>毛片雲端連結</label>
      <input id="bl${i}" placeholder="毛片原始檔雲端連結（選填）">
      ${productRows("b"+i, [])}
    </fieldset>`;
  }
  showModal("新增毛片（一次最多 5 支，可帶商品）", `
    <style>.modal .box{max-width:760px}</style>
    ${blocks}
  `, async ()=>{
    const items=[];
    for(let i=0;i<5;i++){ const name=zhTW((val("bn"+i)||"").trim()); if(!name) continue;
      items.push({name, rawLink:(val("bl"+i)||"").trim(), products:collectProducts("b"+i)}); }
    if(!items.length){ toast("請至少輸入一支片名",true); return false; }
    let base=0; (STATE.videos||[]).forEach(it=>{ const m=String(it.id||"").match(/^V(\d+)$/); if(m) base=Math.max(base,+m[1]); });
    // 編號自動產生：民國年＋月日（共 7 碼）＋3 碼當日序號；依現有編號取下一個序號，避免重覆
    const [Y,M,D]=today.split("-"); const codePrefix=`${(+Y-1911)}${M}${D}`;
    let seq=0; (STATE.videos||[]).forEach(v=>{ const m=String(v.code||"").match(new RegExp("^"+codePrefix+"(\\d{3})$")); if(m) seq=Math.max(seq,+m[1]); });
    let ok=0; BULK_BUSY=true;
    try{
      for(let i=0;i<items.length;i++){ const id="V"+String(base+i+1).padStart(3,"0");
        const code=codePrefix+String(seq+i+1).padStart(3,"0");
        const rec=Object.assign(newVideoRecord({code, name:items[i].name, rawName:items[i].name, rawLink:items[i].rawLink, products:items[i].products}), {id});
        try{ await window.DB.set("videos", id, rec); ok++; }catch(e){} }
    } finally { BULK_BUSY=false; applyState(LAST_RAW); }
    await delay(300); toast("已新增 "+ok+" 支毛片"); return true;
  });
}
function claimVid(id){ write("POST",`/api/videos/${id}/claim`,{},"已認領，加入我的工作"); }
// 退回：把已認領的毛片放回共用「待剪毛片」清單，重新給大家選（一人最多 3 支）
function unclaimVid(id){ if(!confirm("退回這支毛片到待剪清單？大家就能重新認領。")) return; write("POST",`/api/videos/${id}/unclaim`,{},"已退回待剪毛片清單"); }
// 我的剪輯工作：作業中 →（按一下）編輯內容
function setWorkStep(id, step){ window.DB.update("videos", id, {workStep:step, updatedAt:nowIso()}).catch(()=>toast("更新失敗",true)); }
// 編輯影片視窗：商品頁網址輸入一次，下方各平台用「按鈕」呈現，按一下＝複製該平台 utm 連結
function editLinksHTML(url){ url=(url||"").trim(); if(!url) return "";
  return `<div class="card" style="background:var(--panel2)"><b>導購連結</b>
    <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
    ${postPlatforms().map(p=>`<button class="btn sm" type="button" onclick="copyStr('${encodeURIComponent(platformUtm(url,p.utm))}')">${esc(p.name)}</button>`).join("")}
    </div></div>`;
}
function renderEditLinks(){ const box=document.getElementById("e_links"); if(box) box.innerHTML=editLinksHTML(val("e_url")); }
// 複製一段文字到剪貼簿（連結直接內嵌、免選取輸入框）
function copyStr(enc){ const t=decodeURIComponent(enc);
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(()=>toast("已複製連結")).catch(()=>fallbackCopy(t)); }
  else fallbackCopy(t); }
function fallbackCopy(t){ try{ const ta=document.createElement("textarea"); ta.value=t; ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); toast("已複製連結"); }catch(e){ toast("複製失敗，請手動",true); } }
// 新增影片：原始片名 ＋ 影片文案 ＋ 商品
function newSimpleVideo(){
  showModal("新增影片", `
    <label>原始片名</label><input id="sv_name" placeholder="毛片名稱">
    <label>毛片雲端連結</label><input id="sv_link" placeholder="毛片原始檔雲端連結（選填）">
    <label>影片文案（影片中 IP 的口播台詞）</label><input id="sv_vcopy" autocomplete="off">
    ${productRows("sv", [])}
  `, async ()=>{
    const name=zhTW(val("sv_name").trim());
    if(!name){ toast("請輸入原始片名",true); return false; }
    const video={name, rawName:name, rawLink:val("sv_link").trim(), videoCopy:zhTW(val("sv_vcopy").trim()), products:collectProducts("sv")};
    return await write("POST","/api/videos",{video},"已新增影片");
  });
}

// ===================================================================
// 影片標籤（可複選＋可新增），預設清單存在 settings.videoTags
// ===================================================================
const DEFAULT_TAGS=["新片","舊片","寵粉","珠寶介紹","子女傳承","代理招商","銷售"];
// 標籤正規化：舊名 → 新名（每日寵粉→寵粉、珠寶→珠寶介紹、招商/代理→代理招商）
const TAG_RENAME={"每日寵粉":"寵粉","珠寶":"珠寶介紹","招商":"代理招商","代理":"代理招商"};
function renameTag(t){ t=String(t||"").trim(); return TAG_RENAME[t]||t; }
const NEWOLD_TAGS=["新片","舊片"];
function videoTags(){ const t=STATE&&STATE.settings&&STATE.settings.videoTags;
  const src=(Array.isArray(t)&&t.length)?t:DEFAULT_TAGS;
  const out=[]; src.forEach(x=>{ const r=renameTag(x); if(r&&!out.includes(r)) out.push(r); });
  ["寵粉","珠寶介紹","子女傳承","代理招商"].forEach(x=>{ if(!out.includes(x)) out.push(x); }); // 確保新標籤一定可選
  return out; }
// 「其他標籤」= 設定的標籤清單，去掉新舊片（新舊由預排上片日自動判斷，僅供排序）
function otherTags(){ const skip=new Set(NEWOLD_TAGS); return videoTags().filter(t=>!skip.has(t)); }
function tagChip(id,t,checked){ return `<label style="display:inline-flex;align-items:center;gap:4px;background:var(--panel2);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:13px">
  <input type="checkbox" class="${id}_tag" value="${esc(t)}" ${checked?"checked":""} style="width:auto;margin:0"> ${esc(t)}</label>`; }
// 標籤：只留可複選的其他標籤（新舊片自動、不設選單）
function tagPickerHTML(id, selected){ const sel=new Set(selected||[]);
  const skip=new Set(NEWOLD_TAGS);
  const all=otherTags().slice(); (selected||[]).forEach(t=>{ if(!skip.has(t)&&!all.includes(t)) all.push(t); });
  return `<label>標籤（可複選）</label>
    <div id="${id}_box" style="display:flex;flex-wrap:wrap;gap:6px">${all.map(t=>tagChip(id,t,sel.has(t))).join("")}</div>
    <div class="row" style="gap:6px;margin-top:6px"><input id="${id}_new" placeholder="新增標籤…" style="flex:1"><button type="button" class="btn sm sec" onclick="addTagOpt('${id}')">＋ 加入</button></div>`; }
function collectTags(id){ return Array.from(document.querySelectorAll('.'+id+'_tag:checked')).map(x=>x.value); }
function addTagOpt(id){ const inp=document.getElementById(id+'_new'); if(!inp) return; const v=(inp.value||'').trim(); if(!v){ return; }
  const box=document.getElementById(id+'_box');
  if(box && !Array.from(box.querySelectorAll('input')).some(x=>x.value===v)){ box.insertAdjacentHTML('beforeend', tagChip(id,v,true)); }
  inp.value=''; }
async function persistNewTags(tags){ const cur=videoTags(); const add=(tags||[]).filter(t=>t && !cur.includes(t));
  if(add.length && window.DB&&window.DB.setSettings){ try{ await window.DB.setSettings({videoTags:cur.concat(add)}); }catch(e){} } }

// ===================================================================
// 影片庫
// ===================================================================
// 是否剪好（可標新/舊片）：已完成上架，或手選過新/舊片
function isPublished(v){ return !!(v && (v.published===true || ["已完成","已上片"].includes(v.stage))); }
// 是否歸為「舊片」：手選舊片、或已過預排上片日（已上傳）
function vidIsOld(v){
  const t=Array.isArray(v.tags)?v.tags:[];
  if(t.includes("舊片")&&!t.includes("新片")) return true;
  if(t.includes("新片")&&!t.includes("舊片")) return false;
  return airedPast(v);
}
// 影片庫分段：raw=毛片待剪 / newNoSched=新片未排程 / newSched=新片已排程 / old=舊片
function vidSegment(v){
  if(vidIsOld(v)) return "old";
  if(!isPublished(v)) return "raw";                  // 待處理／剪輯中
  return v.scheduledDate ? "newSched" : "newNoSched"; // 剪好：有無預排上片日
}
// 影片的顯示標籤（去重）：文案類型 + 其他標籤
// 新/舊片不放進來 → 由上方分頁代表，避免與標籤重覆
function videoTagsOf(v){
  const base=Array.isArray(v.tags)&&v.tags.length?v.tags.slice():(v.subTag?[String(v.subTag)]:[]);
  let t=base.map(x=>renameTag(x)).filter(s=>s && s!=="新片" && s!=="舊片");
  return [...new Set(t)];
}
// 天數差（b - a，以日為單位）
function daysBetween(a,b){ const d1=new Date(String(a).slice(0,10)+"T00:00:00"), d2=new Date(String(b).slice(0,10)+"T00:00:00");
  if(isNaN(d1)||isNaN(d2)) return 0; return Math.round((d2-d1)/86400000); }
// 上班計畫的天數標記：今天拉的＝新，昨天＝2，前天＝3…
function claimDayBadge(v){ const c=String(v.claimedAt||"").slice(0,10); if(!c) return "新"; const d=daysBetween(c,today); return d<=0?"新":String(d+1); }
// 剪輯耗時（天）：認領→完成，當天完成＝「-」，跨 2 天＝2，3 天＝3…（KPI 用）
function editDays(v){ const c=String(v.claimedAt||"").slice(0,10), f=String(v.finishedAt||"").slice(0,10); if(!c||!f) return null; return daysBetween(c,f)+1; }
function editDaysLabel(v){ const d=editDays(v); if(d==null) return ""; return d<=1?"-":String(d); }
// 最後更新日（資料庫任何異動）
function vidUpdated(v){ return String(v.updatedAt||v.finishedAt||v.claimedAt||"").slice(0,10); }
// 老闆娘選擇性審核（不擋上架）：通過／退回(附原因)；退回會在剪輯的今日工作出現
function reviewVid(id, status){
  let note="";
  if(status==="退回"){ note=prompt("退回原因（給剪輯修正）："); if(note===null) return; if(!note.trim()){ toast("請填退回原因",true); return; } }
  window.DB.update("videos", id, {reviewStatus:status, reviewNote:note.trim(), reviewedBy:currentUser(), reviewedAt:nowIso(), updatedAt:nowIso()})
    .then(()=>{ toast(status==="通過"?"已通過 ":"已退回，剪輯會收到 "); closeModal(); })
    .catch(()=>toast("操作失敗，請稍後再試",true));
}
let VID_VIEW="raw";       // 影片庫分頁：raw=毛片待剪 / newNoSched=新片未排程 / newSched=新片已排程 / old=舊片
let VID_TAGS=new Set();   // 標籤篩選（可複選）
// 一列 = 一支影片
function vidTableRow(v){
  const stageCol={"待處理":"var(--muted)","剪輯中":"var(--accent)","已完成":"var(--green)","已上片":"var(--green)"}[v.stage]||"var(--muted)";
  const tags=videoTagsOf(v);
  const tagHTML=tags.length?tags.map(t=>`<span class="tag" style="font-size:11px">${esc(t)}</span>`).join(" "):'<span class="muted" style="font-size:12px">—</span>';
  const prod=(v.productUrl||"").trim();
  const prodCount=(Array.isArray(v.products)?v.products.filter(p=>p&&p.name):[]).length;
  const prodHTML=prod?`<a href="${esc(prod)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">商品頁${prodCount?`（${prodCount}）`:""}</a>`
    :(prodCount?`<span class="muted" style="font-size:12px">${prodCount} 項</span>`:'<span class="muted" style="font-size:12px">—</span>');
  const rev=v.reviewStatus==="通過"?'<span class="pill ok" style="font-size:10px">已審</span>'
    :(v.reviewStatus==="退回"?'<span class="pill em" style="font-size:10px">× 退回</span>':'');
  const upd=vidUpdated(v), sch=v.scheduledDate?String(v.scheduledDate).slice(0,10):"";
  return `<tr onclick="editVideo('${v.id}')" style="cursor:pointer">
    <td data-label="影片" class="cv-name"><span style="display:flex;align-items:center;gap:8px;min-width:0">
      <span class="vthumb">▶</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(vidTitle(v))}</span></span></td>
    <td data-label="標籤">${tagHTML}</td>
    <td data-label="最後更新" class="muted" style="font-size:12px;white-space:nowrap">${upd||"—"}</td>
    <td data-label="預排上片" style="white-space:nowrap">${sch||'<span class="muted">—</span>'}</td>
    <td data-label="商品">${prodHTML}</td>
    <td data-label="剪輯師">${esc(v.editor||v.claimedBy||"")||'<span class="muted">—</span>'}</td>
    <td data-label="狀態"><span class="ststack">
      <span class="pill" style="font-size:11px;background:transparent;border:1px solid ${stageCol};color:${stageCol}">${esc(v.stage||"")}</span>
      ${rev}</span></td>
  </tr>`;
}
function vidRowsHTML(){
  const all=STATE.videos||[];
  const q=(document.getElementById('vid_q')?.value||'').toLowerCase().trim();
  let list=all.filter(v=> vidSegment(v)===VID_VIEW);
  if(q) list=list.filter(v=>[v.name,v.rawName,v.videoCopy,v.code,v.editor].map(x=>String(x||'').toLowerCase()).join("  ").includes(q));
  if(VID_TAGS.size) list=list.filter(v=>videoTagsOf(v).some(t=>VID_TAGS.has(t)));
  if(!list.length) return '<p class="muted" style="padding:14px 4px">沒有符合的影片</p>';
  // 依「建立先後」排序：先建立的（編號小）在前（V001→V002…）
  list.sort((a,b)=> String(a.id).localeCompare(String(b.id)));
  return `<div class="${list.length>8?'vidscroll':''}"><table class="vtable responsive">
    <colgroup><col class="c-vid"><col class="c-tag"><col class="c-upd"><col class="c-sch"><col class="c-prod"><col class="c-ed"><col class="c-st"></colgroup>
    <thead><tr><th>影片</th><th>標籤</th><th>最後更新</th><th>預排上片</th><th>商品</th><th>剪輯師</th><th>狀態</th></tr></thead>
    <tbody>${list.map(vidTableRow).join("")}</tbody></table></div>
    <p class="muted" style="margin-top:8px;font-size:12px">共 ${list.length} 支</p>`;
}
function vidFilter(){ const el=document.getElementById('vid_list'); if(el) el.innerHTML=vidRowsHTML(); }
function vidTagToggle(t, el){ if(VID_TAGS.has(t)){ VID_TAGS.delete(t); el.classList.add('sec'); } else { VID_TAGS.add(t); el.classList.remove('sec'); } vidFilter(); }
function vidSetView(view){ VID_VIEW=view; VID_TAGS.clear(); render(); }
function viewVideos(){
  const all=STATE.videos||[];
  const seg={raw:0,newNoSched:0,newSched:0,old:0}; all.forEach(v=>{ seg[vidSegment(v)]++; });
  const tab=(k,label,n)=>`<button class="vtab ${VID_VIEW===k?'on':''}" onclick="vidSetView('${k}')">${label} <span class="vtab-n">${n}</span></button>`;
  // 標籤鈕：只列出「本分頁影片實際有的標籤」並標數量 → 按了一定對得上影片
  const viewList=all.filter(v=> vidSegment(v)===VID_VIEW);
  const tagCount={}; viewList.forEach(v=>videoTagsOf(v).forEach(t=>{ tagCount[t]=(tagCount[t]||0)+1; }));
  const order=videoTags();
  const present=Object.keys(tagCount).sort((a,b)=>{ const ia=order.indexOf(a),ib=order.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib) || a.localeCompare(b); });
  const tagBtns=present.length
    ? present.map(t=>`<button class="btn sm ${VID_TAGS.has(t)?'':'sec'}" onclick="vidTagToggle('${esc(jsEsc(t))}',this)">${esc(t)} <span style="opacity:.7">${tagCount[t]}</span></button>`).join("")
      +`<a href="javascript:void(0)" onclick="VID_TAGS.clear();render()" class="muted" style="font-size:12px;margin-left:4px">清除篩選</a>`
    : '<span class="muted" style="font-size:12px">此分頁的影片尚未加標籤</span>';
  return `<h2>影片庫</h2>
  <div class="card">
    <div class="vtabs">
      ${tab("raw","毛片待剪",seg.raw)}
      ${tab("newNoSched","新片未排程",seg.newNoSched)}
      ${tab("newSched","新片已排程",seg.newSched)}
      ${tab("old","舊片",seg.old)}
    </div>
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px">
      <input id="vid_q" placeholder="搜尋編號／片名／剪輯" oninput="vidFilter()" style="flex:1;min-width:150px">
      <button class="btn sm" onclick="batchNewFootage()">＋ 新增毛片</button>
    </div>
    <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px">
      <span class="muted" style="font-size:12px">標籤：</span>
      ${tagBtns}
    </div>
    <div id="vid_list" style="margin-top:6px">${vidRowsHTML()}</div>
  </div>`;
}
// 刪除影片：二次確認，無法復原
function delVideo(id){
  const v=vid(id)||{};
  if(!confirm("確定要刪除「"+vidTitle(v)+"」？")) return;
  if(!confirm("再次確認：真的要永久刪除這支影片嗎？刪除後無法復原。")) return;
  write("DELETE","/api/videos/"+id,{},"已刪除影片").then(ok=>{ if(ok) closeModal(); });
}
// 影片內容：預設檢視（不可改）；右上「編輯」才進編輯、右上「×」關閉
function editVideo(id){ openVideoModal(id, true); }
// 編輯模式離開保護：有改動時，必須按「儲存修改」或「取消編輯」
function cancelVideoEdit(){ MODAL_DIRTY=false; closeModal(); }
function tryExitVideoEdit(){ if(MODAL_DIRTY){ toast("已修改，請按「儲存修改」或「取消編輯」",true); return; } closeModal(); }
function openVideoModal(id, edit, fromWork){
  const v = vid(id)||{};
  const s=STATE.settings||{};
  const sources=s.sources||["老闆自拍","外部公司"];
  const users=(STATE.users||[]).filter(u=>u.role==="editor").map(u=>u.name);
  const stages=["待處理","剪輯中","已完成","已上片"];
  const tags=videoTagsOf(v);
  const prodList=(Array.isArray(v.products)?v.products.filter(p=>p&&p.name):[]);
  const reviewCard = currentRole()==='boss'?`<div class="card" style="background:var(--panel2)"><b>‍老闆娘審核</b>
      <div class="row" style="gap:8px;margin-top:6px;align-items:center">
        <button class="btn sm" type="button" onclick="reviewVid('${id}','通過')">通過</button>
        <button class="btn sm danger" type="button" onclick="reviewVid('${id}','退回')">× 退回</button>
        <span class="muted">目前：${v.reviewStatus?(esc(v.reviewStatus)+(v.reviewNote?'（'+esc(v.reviewNote)+'）':'')):'未審'}</span>
      </div></div>`:'';
  const usageCard = id&&usageList(v).length?`<div class="card" style="background:var(--panel2)"><b>使用紀錄（共 ${usageList(v).length} 次）</b>
      <table class="responsive"><thead><tr><th>上片日期</th><th>連結</th><th>排片人</th></tr></thead><tbody>
      ${usageList(v).map(u=>`<tr><td data-label="上片日期">${esc(u.date)}</td><td data-label="連結">${u.link?`<a href="${esc(u.link)}" target="_blank">開啟</a>`:'<span class="muted">—</span>'}</td><td data-label="排片人">${esc(u.by||"")}</td></tr>`).join("")}
      </tbody></table></div>`:"";
  const head=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 14px">
      <h3 style="margin:0">影片內容</h3>
      <div style="display:flex;gap:6px;align-items:center">
        ${edit?'':`<button class="btn sec sm" type="button" onclick="openVideoModal('${id}',true)">編輯</button>`}
        <button class="btn sec sm" type="button" onclick="${edit?'tryExitVideoEdit()':'closeModal()'}" title="關閉">×</button>
      </div></div>`;

  if(!edit){
    const row=(l,c)=>`<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)"><div class="muted" style="width:100px;flex:none;font-size:13px">${l}</div><div style="flex:1;min-width:0">${c||'<span class="muted">—</span>'}</div></div>`;
    const body=`
      ${row("編號", esc(vidCode(v)))}
      ${row("原始片名", esc(zhTW(v.rawName||"")))}
      ${row("影片貼文文案", esc(zhTW(v.name||"")))}
      ${row("影片文案", v.videoCopy?esc(zhTW(v.videoCopy)).replace(/\n/g,'<br>'):'')}
      ${row("標籤", tags.length?tags.map(t=>`<span class="tag">${esc(t)}</span>`).join(" "):'')}
      ${row("片源", esc(v.source||""))}
      ${row("階段", `<span class="pill ${v.stage==='已上片'||v.stage==='已完成'?'ok':(v.stage==='剪輯中'?'wa':'')}">${esc(v.stage||"")}</span>`)}
      ${row("剪輯人員", esc(v.editor||""))}
      ${row("商品", prodList.length?prodList.map(p=>esc(p.name)+(p.price?`（$${esc(p.price)}）`:"")).join("、"):'')}
      ${row("商品頁網址", v.productUrl?`<a href="${esc(v.productUrl)}" target="_blank">${esc(v.productUrl)}</a>`:'')}
      ${row("預排上片日", esc(v.scheduledDate||""))}
      ${row("毛片雲端連結", v.rawLink?`<a href="${esc(v.rawLink)}" target="_blank">開啟</a>`:'')}
      ${row("完成影片存檔連結", v.driveFolder?`<a href="${esc(v.driveFolder)}" target="_blank">開啟</a>`:'')}
      ${editLinksHTML(v.productUrl)}
      ${reviewCard}
      ${usageCard}`;
    MODAL_DIRTY=false;
    document.getElementById("modalRoot").innerHTML=`<div class="modal" onclick="modalBackdrop(event)"><div class="box" onclick="event.stopPropagation()">${head}${body}</div></div>`;
    return;
  }

  const body=`
    <label>編號 ／ 原始片名</label>
    <div class="row" style="gap:8px">
      <input id="e_code" value="${esc(vidCode(v))}" style="flex:none;width:78px;text-align:center" placeholder="編號" oninput="var c=document.getElementById('e_code2');if(c)c.value=this.value">
      <input id="e_raw" value="${esc(v.rawName||"")}" style="flex:1" placeholder="原始片名">
    </div>
    <label>編號 ／ 影片貼文文案（不填則同原始片名）</label>
    <div class="row" style="gap:8px">
      <input id="e_code2" value="${esc(vidCode(v))}" readonly style="flex:none;width:78px;text-align:center;background:var(--panel2)" title="同原片編號">
      <input id="e_name" value="${esc(v.name||"")}" style="flex:1" placeholder="影片貼文文案">
    </div>
    <label>毛片雲端連結</label><input id="e_rawlink" value="${esc(v.rawLink||"")}" placeholder="毛片原始檔雲端連結">
    <label>影片文案（影片中 IP 的口播台詞）</label><input id="e_vcopy" value="${esc(v.videoCopy||"")}" autocomplete="off">
    ${tagPickerHTML("e", v.tags||(v.subTag?[v.subTag]:[]))}
    <div class="grid cols2">
      <div><label>片源</label><select id="e_src">${sources.map(c=>`<option ${v.source===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
      <div><label>階段</label><select id="e_stage">${stages.map(c=>`<option ${v.stage===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
    </div>
    <label>剪輯人員</label><select id="e_editor"><option value="">—</option>${users.map(u=>`<option ${v.editor===u?"selected":""}>${esc(u)}</option>`).join("")}</select>
    ${productRows("e", v.products)}
    <label>商品頁網址</label><input id="e_url" value="${esc(v.productUrl||"")}" oninput="renderEditLinks()" placeholder="https://www.tzgrotw.tw/products/...">
    <label>預排上片日期</label><input id="e_date" type="date" value="${esc(v.scheduledDate||"")}">
    <div id="e_links">${editLinksHTML(v.productUrl)}</div>
    <label>備註</label><input id="e_note" value="${esc(v.note||"")}" placeholder="補充說明（選填）">
    ${reviewCard}
    <div class="card" style="background:var(--panel2)"><b>完成影片存檔連結</b>
      <label>完成影片存檔連結</label><input id="e_drive" value="${esc(v.driveFolder||"")}" placeholder="剪輯完成後的成品存檔連結">
    </div>
    ${usageCard}
    <div class="card" style="border-color:var(--red)">
      <button class="btn danger sm" type="button" onclick="delVideo('${id}')">刪除這支影片</button>
      <span class="muted" style="font-size:12px;margin-left:8px">需二次確認，刪除後無法復原</span>
    </div>`;
  const foot=`<div class="modalFoot">
      <button class="btn sec" type="button" onclick="cancelVideoEdit()">取消編輯</button>
      <button class="btn" id="vmSave" type="button">${fromWork?'儲存並完成':'儲存修改'}</button></div>`;
  MODAL_DIRTY=false;
  document.getElementById("modalRoot").innerHTML=`<div class="modal" onclick="modalBackdrop(event)"><div class="box" onclick="event.stopPropagation()" oninput="MODAL_DIRTY=true" onchange="MODAL_DIRTY=true">${head}${body}${foot}</div></div>`;
  document.getElementById("vmSave").onclick=async()=>{ const ok=await saveVideo(id); if(!ok) return;
    if(fromWork){ await write("POST",`/api/videos/${id}/finish`,{scheduledDate:val("e_date")||null},"已完成（保留在工作列，下班後消失）"); }
    closeModal(); };
}
async function saveVideo(id){
  // 銷售商品 與 商品頁網址 須一起填或一起空白（只填一邊 → 擋下不存）
  const products=collectProducts("e"); const productUrl=val("e_url").trim();
  const hasProd=products.some(p=>p&&p.name);
  if(hasProd && !productUrl){ toast("有填銷售商品就要一起填『商品頁網址』，否則無法導購",true); return false; }
  if(productUrl && !hasProd){ toast("有填『商品頁網址』就要至少填一個銷售商品（品名）",true); return false; }
  const tags=[...new Set(collectTags("e").map(renameTag))]; await persistNewTags(tags);
  const mainType = tags.some(t=>["代理","招商","代理招商"].includes(t))?"代理招商"
    :((tags.some(t=>String(t).includes("寵粉"))||tags.some(t=>["帶貨","銷售"].includes(t)))?"寵粉":"");  // 無對應標籤＝不分類
  const video={code:val("e_code").trim(), rawName:zhTW(val("e_raw")), name:zhTW(val("e_name").trim()||val("e_raw").trim()), videoCopy:zhTW(val("e_vcopy").trim()), mainType,tags,subTag:tags[0]||"",
    products, productUrl,
    source:val("e_src"),stage:val("e_stage"),editor:val("e_editor"),
    scheduledDate:val("e_date")||null,
    driveFolder:val("e_drive"), rawLink:val("e_rawlink").trim(), note:zhTW(val("e_note").trim())};
  return await write("PUT",`/api/videos/${id}`,{video},"已更新影片");
}

// ===================================================================
// 設定（管理員）
// ===================================================================
function viewSettings(){
  const s=STATE.settings||{};
  const dailyTargetVal=(s.dailyTarget!=null&&s.dailyTarget!=="")?s.dailyTarget:daySumLegacy(today);
  const platStr=postPlatforms().map(p=>p.name+"="+p.utm).join("\n");
  const members=(STATE.users||[]).filter(u=>(u.role||"editor")==="editor");
  const memberRows=members.map(u=>`<tr>
    <td data-label="名字"><b>${esc(u.name)}</b></td>
    <td data-label=""><button class="btn sm sec" onclick="renameMember('${esc(jsEsc(u.name))}')">改名</button>
      <button class="btn sm sec" onclick="resetMemberPw('${esc(jsEsc(u.name))}')">重設密碼</button>
      <button class="btn sm danger" onclick="delMember('${esc(jsEsc(u.name))}')">刪除</button></td>
  </tr>`).join("");
  const contactList=contactOptions();
  const contactRows=contactList.map(c=>`<tr>
    <td data-label="窗口名稱"><b>${esc(c)}</b></td>
    <td data-label=""><button class="btn sm sec" onclick="renameContact('${esc(jsEsc(c))}')">改名</button>
      <button class="btn sm danger" onclick="delContact('${esc(jsEsc(c))}')">刪除</button></td>
  </tr>`).join("");
  return `<h2>設定</h2>
  <div class="card"><b>每天上片目標</b>
    <label style="margin-top:6px">每日應上片數</label>
    <div class="row" style="gap:8px"><input type="number" min="0" id="set_daily" value="${dailyTargetVal}" style="max-width:120px;text-align:center">
      <span class="muted">支／天 —— 月排程以此判斷「已排滿／缺幾支」，不分影片類型。</span></div>
  </div>
  <div class="card">
    <label>預排天數視窗</label>
    <input type="number" id="set_horizon" value="${s.scheduleHorizonDays||30}" style="max-width:160px">
    <label style="margin-top:12px">投放平台（顯示名稱=utm代號，一行一個）</label>
    <textarea id="set_plat" style="min-height:88px">${esc(platStr)}</textarea>
    <label style="margin-top:12px">Shopline 網址</label>
    <input id="set_shop" value="${esc(s.shoplineBase||'')}" placeholder="https://你的店.shoplineapp.com">
    <label style="margin-top:12px">管理員密碼（登入用，可自行修改）</label>
    <input id="set_pw" value="${esc(s.adminPassword||'1234')}" placeholder="管理員登入密碼">
    <div class="modalFoot"><button class="btn" onclick="saveSettings()">確認送出設定</button></div>
  </div>
  <div class="card"><b>剪輯成員（${members.length}）</b>
    <table class="responsive" style="margin-top:8px"><thead><tr><th>名字</th><th></th></tr></thead>
    <tbody>${memberRows||`<tr><td class="muted">尚無成員</td></tr>`}</tbody></table>
    <div class="row" style="gap:8px;margin-top:12px"><input id="mb_name" placeholder="新增剪輯名字" style="flex:1;min-width:150px">
      <button class="btn" onclick="addMember()">＋ 新增剪輯</button></div>
  </div>
  <div class="card"><b>對接窗口名單（${contactList.length}）</b>
    <table class="responsive" style="margin-top:8px"><thead><tr><th>窗口名稱</th><th></th></tr></thead>
    <tbody>${contactRows||`<tr><td class="muted">尚無對接窗口</td></tr>`}</tbody></table>
    <div class="row" style="gap:8px;margin-top:12px"><input id="ct_name" placeholder="新增對接窗口名稱" style="flex:1;min-width:150px" onkeydown="if(event.key==='Enter')addContact()">
      <button class="btn" onclick="addContact()">＋ 新增窗口</button></div>
  </div>
  <div class="card"><b>資料維護</b>
    <div class="row" style="gap:8px;margin-top:8px"><span class="muted" style="flex:1">把「現有」影片標題與文案裡的簡體字一次轉成繁體存回資料庫（新增/編輯時本來就會自動轉）。</span>
      <button class="btn sec sm" onclick="convertExistingToTW()" style="white-space:nowrap">現有簡體轉繁體</button></div>
  </div>`;
}
// 一次性：把現有影片的標題/文案簡體字轉繁體並存回（新存的本來就會自動轉）
async function convertExistingToTW(){
  if(!__s2t){ toast("簡繁轉換尚未就緒（可能網路載入中），請稍候再試",true); return; }
  const vids=(STATE.videos||[]);
  if(!confirm("把現有 "+vids.length+" 支影片的標題與文案的簡體字轉成繁體存回？此動作會直接更新資料。")) return;
  BULK_BUSY=true; let n=0;
  try{
    for(const v of vids){ const patch={};
      ["name","rawName","videoCopy","note"].forEach(k=>{ const o=v[k]||""; const c=zhTW(o); if(c!==o) patch[k]=c; });
      if(Object.keys(patch).length){ try{ await window.DB.update("videos",v.id,patch); n++; }catch(e){} }
    }
  } finally { BULK_BUSY=false; applyState(LAST_RAW); }
  await delay(300); toast("完成：已把 "+n+" 支影片的簡體字轉為繁體");
}
async function saveSettings(){
  const plats=(val("set_plat")||"").split("\n").map(s=>s.trim()).filter(Boolean).map(line=>{
    const i=line.indexOf("="); const name=(i>=0?line.slice(0,i):line).trim(); const utm=(i>=0?line.slice(i+1):line).trim()||name; return {name,utm}; });
  const settings={ dailyTarget:parseInt(val("set_daily"))||0, scheduleHorizonDays:parseInt(val("set_horizon"))||30, shoplineBase:(val("set_shop")||"").trim() };
  const pw=(val("set_pw")||"").trim(); if(pw) settings.adminPassword=pw; // 空白則沿用舊密碼
  if(plats.length) settings.postPlatforms=plats;
  await writeAdmin("PUT","/api/settings",{settings},"已更新設定");
}

// ===================================================================
// 成員管理（限管理員・併入設定頁）
// ===================================================================
function addMember(){ const name=val("mb_name").trim(); if(!name){ toast("請輸入名字",true); return; }
  write("POST","/api/users",{name,role:"editor"},"已新增剪輯"); }
function delMember(name){ if(!confirm("確定刪除成員「"+name+"」？")) return;
  writeAdmin("DELETE","/api/users/"+name,{},"已刪除成員"); }
// 主管線上重設員工密碼為 0000，員工再自行修改
function resetMemberPw(name){
  if(!confirm("確定把「"+name+"」的密碼重設為 0000？\n請通知他登入後自行修改。")) return;
  writeAdmin("PUT","/api/users/"+name,{pw:"0000"},"已將「"+name+"」密碼重設為 0000"); }
function renameMember(oldName){
  const input=prompt("將成員「"+oldName+"」改名為：", oldName); if(input===null) return;
  const nn=input.trim(); if(!nn || nn===oldName) return;
  if((STATE.users||[]).some(u=>u.name===nn)){ toast("已有同名成員「"+nn+"」",true); return; }
  withAdmin(async ()=>{
    BULK_BUSY=true; let vc=0;
    try{
      const u=(STATE.users||[]).find(x=>x.name===oldName)||{name:oldName};
      await window.DB.set("users", nn, Object.assign({}, u, {name:nn}));
      for(const v of (STATE.videos||[])){ const patch={}; let t=false;
        if(v.editor===oldName){ patch.editor=nn; t=true; } if(v.claimedBy===oldName){ patch.claimedBy=nn; t=true; }
        if(t){ try{ await window.DB.update("videos", v.id, patch); vc++; }catch(e){} } }
      await window.DB.del("users", oldName);
    } finally { BULK_BUSY=false; applyState(LAST_RAW); }
    await delay(300); toast("已將「"+oldName+"」改名為「"+nn+"」（影片 "+vc+" 筆同步）");
  });
}
// ===================================================================
// 成效：流量連到 meta-dashboard；Shopline 用一條固定導購連結
// ===================================================================
const META_DASH_URL="https://vitokok-lab.github.io/meta-dashboard/index.html";
function shoplineBase(){ return (STATE.settings&&STATE.settings.shoplineBase)||""; }
const DEFAULT_PLATFORMS=[
  {name:"IG 溱姐主（@tzgems1111）", utm:"ig_tzgems1111"},
  {name:"IG 泰熙爾汗（@tzgems5588）", utm:"ig_tzgems5588"},
  {name:"IG 英文（@tzgrotwofficial）", utm:"ig_tzgrotwofficial"},
  {name:"IG 代理（@tzgems666）", utm:"ig_tzgems666"},
  {name:"IG 官方（@tzgrotw）", utm:"ig_tzgrotw"},
  {name:"FB 粉專（Zanagems）", utm:"fb_zanagems"},
  {name:"LINE 社群（珠寶社群）", utm:"line_group"}
];
function postPlatforms(){ const p=STATE.settings&&STATE.settings.postPlatforms; return (Array.isArray(p)&&p.length)?p:DEFAULT_PLATFORMS; }
// 依平台一條導購連結，最短：只用 utm_source（月底靠訂單時間對應商品）
function platformUtm(base, utm){ if(!base) return ""; const sep=base.includes("?")?"&":"?"; return base+sep+"utm_source="+encodeURIComponent(utm||""); }
function copyFromInput(id){ const e=document.getElementById(id); if(!e) return; e.focus(); e.select();
  const t=e.value; if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(()=>toast("已複製連結")).catch(()=>toast("已選取，請手動複製",true)); }
  else { try{ document.execCommand("copy"); toast("已複製連結"); }catch(_){ toast("已選取，請手動複製",true); } } }
// 影片編號（無自訂 code 則取 id 數字，如 V001→001）；外顯片名以成品標題名稱為主
function vidCode(v){ return (v&&v.code) || String((v&&v.id)||"").replace(/^V/,""); }
function vidTitle(v){ const t=zhTW((v&&(v.name||v.rawName))||"(未命名)"); const c=vidCode(v); return c?(c+" "+t):t; }
// 已用過的商品名（下拉選用，讓品名一致）
function knownProducts(){ const set=new Set(); (STATE.videos||[]).forEach(v=>{ (v.products||[]).forEach(p=>{ if(p&&p.name) set.add(p.name); }); }); return [...set].sort(); }
// 商品列：最多 4 個，每個 品名(下拉)+單價(手動)
function productRows(prefix, products){
  const ps=Array.isArray(products)?products:[];
  let h=`<label>銷售商品（最多 4 個）</label>`;
  for(let i=0;i<4;i++){ const p=ps[i]||{};
    h+=`<div class="row" style="gap:8px;margin-bottom:6px">
      <input id="${prefix}_pn${i}" list="${prefix}_plist" value="${esc(p.name||"")}" placeholder="商品 ${i+1}（品名）" style="flex:2;min-width:130px">
      <input id="${prefix}_pp${i}" type="number" min="0" value="${(p.price!=null&&p.price!=="")?esc(p.price):''}" placeholder="單價" style="flex:1;min-width:80px">
    </div>`; }
  h+=`<datalist id="${prefix}_plist">${knownProducts().map(n=>`<option value="${esc(n)}">`).join("")}</datalist>`;
  return h;
}
function collectProducts(prefix){ const out=[];
  for(let i=0;i<4;i++){ const name=(val(prefix+"_pn"+i)||"").trim(); if(!name) continue;
    out.push({name, price:parseInt(val(prefix+"_pp"+i))||0}); }
  return out;
}

// ===================================================================
// 彈窗
// ===================================================================
let MODAL_DIRTY=false;
function showModal(title, inner, onConfirm, confirmLabel){
  const root=document.getElementById("modalRoot");
  MODAL_DIRTY=false;
  // 點視窗外（背景）即可關閉；但只要動過任何欄位就不關，避免誤觸丟資料
  const html=`<div class="modal" onclick="modalBackdrop(event)"><div class="box" onclick="event.stopPropagation()" oninput="MODAL_DIRTY=true" onchange="MODAL_DIRTY=true">
    <h3>${esc(title)}</h3>${inner}
    <div class="modalFoot">
      <button class="btn sec" onclick="closeModal()">取消</button>
      ${onConfirm?`<button class="btn" id="modalConfirm">${esc(confirmLabel||"確認送出")}</button>`:""}
    </div></div></div>`;
  root.innerHTML = html;
  if(onConfirm){ document.getElementById("modalConfirm").onclick=async()=>{ const r=await onConfirm(); if(r!==false) closeModal(); }; }
}
function modalBackdrop(e){ if(e.target&&e.target.classList&&e.target.classList.contains("modal")){ if(MODAL_DIRTY) return; closeModal(); } }
function closeModal(){ MODAL_DIRTY=false; document.getElementById("modalRoot").innerHTML=""; }

// ===================================================================
// 新手教學模式：開啟後，把游標停在任何按鈕／欄位上會出現說明
//   - 桌機：滑鼠停留約 0.3 秒顯示；手機：點一下顯示（此模式下不會執行動作）
//   - 大部分元件用「通用解析」自動取標題/說明，重要按鈕另給完整教學
// ===================================================================
let TUT_ON=false, TUT_TIMER=null, TUT_CUR=null;
const TUT_RULES=[
  {oc:"claimVid",        title:"認領開始剪", text:"從共用的待剪毛片清單把這支拉給自己，狀態變「剪輯中」、進入「我的今日工作」，其他剪輯就看不到、不會重複剪。"},
  {oc:"setWorkStep",     title:"我作業中…", text:"剪好了？按一下進到「編輯內容 ▶」，再進編輯畫面填資料。"},
  {oc:"unclaimVid",      title:"退回", text:"後悔了或想改選？把這支退回共用的待剪清單，大家可重新認領（一人最多 3 支）。"},
  {oc:"batchNewFootage", title:"＋ 新增毛片", text:"一次最多新增 5 支新影片，每支可填原始片名＋最多 4 個商品；其餘細節剪片時再補。"},
  {oc:"newSimpleVideo",  title:"新增影片", text:"建立一支新影片，填原始片名、影片文案與商品。"},
  {oc:"editVideo",       title:"打開影片內容", text:"點影片名稱可看這支片的完整資料；裡面再按「編輯」才能修改。"},
  {oc:"vidSetView",      title:"影片庫分頁", text:"切換影片清單：毛片待剪／新片未排程／新片已排程／舊片。"},
  {oc:"odReuse",         title:"排入（重播舊片）", text:"把選好的舊片排到這一天重播；存檔位置自動帶入，上傳連結可之後再補。"},
  {oc:"openDay",         title:"打開這一天", text:"查看這天要上的影片、調整上片日，或安排舊片重播。"},
  {oc:"clockOutReport",  title:"下班匯報", text:"下班前按這裡，會列出今天完成／未完成的工作並打卡下班。"},
  {oc:"reviewVid",       title:"老闆娘審核", text:"通過或退回這支影片；退回會回到剪輯的今日工作。"},
  {oc:"delVideo",        title:"刪除影片", text:"永久刪除這支影片，需二次確認、無法復原。"},
  {oc:"createTask",      title:"新增工作項目", text:"把今天要做的事加進上班計畫，做完填回報狀況再打勾完成。"},
  {oc:"calMove",         title:"切換月份", text:"看上個月／下個月的排程。"},
  {oc:"copyStr",         title:"複製導購連結", text:"按一下複製這個平台的帶 UTM 導購連結，貼到貼文就能追成效。"},
  {sel:"#nav button",    title:"功能分頁", text:"切換主要畫面：上班計畫、月排程、影片庫等。"},
  {sel:"#vid_q",         title:"搜尋影片", text:"輸入編號、片名或剪輯師名字，即時篩選下面清單。"},
  {sel:"#tutBtn",        title:"新手教學", text:"目前在教學模式：把游標停在任何按鈕或欄位上看說明；再按一次即可關閉。"},
  {sel:'input[type="date"]', title:"改上片日", text:"選日期即更新這支影片的預排上片日。"},
];
function tutMatchEl(target, r){
  if(r.sel){ return target.closest(r.sel); }
  if(r.oc){ let n=target; while(n && n!==document.body){ const oc=(n.getAttribute&&n.getAttribute("onclick"))||""; if(oc.indexOf(r.oc)>=0) return n; n=n.parentElement; } }
  return null;
}
function tutLabelFor(el){
  let p=el.previousElementSibling;
  while(p){ if(p.tagName==="LABEL") return (p.textContent||"").trim(); if(["INPUT","SELECT","TEXTAREA"].includes(p.tagName)) break; p=p.previousElementSibling; }
  const cl=el.closest("label"); if(cl) return (cl.textContent||"").trim();
  const row=el.closest(".row,.grid>div"); if(row){ const pr=row.previousElementSibling; if(pr&&pr.tagName==="LABEL") return (pr.textContent||"").trim();
    const inner=row.querySelector("label"); if(inner) return (inner.textContent||"").trim(); }
  return "";
}
function tutResolve(target){
  for(const r of TUT_RULES){ const m=tutMatchEl(target,r); if(m) return {el:m, title:r.title, text:r.text}; }
  const act=target.closest('button,a[href],a[onclick],.vtab,[data-tab],input,select,textarea,td[onclick]');
  if(!act) return null;
  if(["INPUT","SELECT","TEXTAREA"].includes(act.tagName)){
    const t=tutLabelFor(act)||act.getAttribute("placeholder")||act.getAttribute("title")||"輸入欄位";
    return {el:act, title:"填寫欄位", text:t};
  }
  const ttl=act.getAttribute("title");
  const txt=(act.textContent||"").replace(/\s+/g," ").trim().slice(0,40);
  return {el:act, title:(txt||"按鈕"), text:(ttl||("點這個會執行："+(txt||"動作")))};
}
function toggleTutorial(){
  TUT_ON=!TUT_ON;
  const b=document.getElementById("tutBtn"), ban=document.getElementById("tutBanner");
  document.body.classList.toggle("tut",TUT_ON);
  if(b) b.classList.toggle("on",TUT_ON);
  if(TUT_ON){
    // 按「教學」同時讓各頁新手教學卡重新出現（重看）
    try{ Object.keys(PAGE_INTRO).forEach(t=>localStorage.removeItem(introKey(t))); }catch(e){}
    if(ban){ ban.textContent="教學模式開啟中：各頁上方會再出現「新手教學」說明卡；也可把游標停在任何按鈕或欄位上看說明。再按一次「教學」關閉。"; ban.classList.remove("hidden"); }
    render();
  }
  else { if(ban) ban.classList.add("hidden"); tutHide(); }
}
function tutHide(){ const tip=document.getElementById("tutTip"); if(tip) tip.classList.add("hidden"); if(TUT_CUR){ TUT_CUR.classList.remove("tut-hl"); TUT_CUR=null; } clearTimeout(TUT_TIMER); }
function tutShowFor(target){
  const tip=document.getElementById("tutTip"); if(!tip) return;
  const r=tutResolve(target); if(!r){ tutHide(); return; }
  if(TUT_CUR && TUT_CUR!==r.el) TUT_CUR.classList.remove("tut-hl");
  TUT_CUR=r.el; r.el.classList.add("tut-hl");
  tip.innerHTML="<b>"+esc(r.title)+"</b>"+esc(r.text);
  tip.classList.remove("hidden");
  const rect=r.el.getBoundingClientRect(), tw=tip.offsetWidth, th=tip.offsetHeight;
  let top=rect.bottom+8, left=rect.left;
  if(top+th>window.innerHeight-8) top=Math.max(8, rect.top-th-8);
  if(left+tw>window.innerWidth-8) left=window.innerWidth-tw-8;
  if(left<8) left=8;
  tip.style.top=top+"px"; tip.style.left=left+"px";
}
document.addEventListener("mouseover", function(e){ if(!TUT_ON) return; clearTimeout(TUT_TIMER); const t=e.target; TUT_TIMER=setTimeout(()=>tutShowFor(t),280); });
document.addEventListener("mouseleave", function(){ if(TUT_ON) tutHide(); });
document.addEventListener("click", function(e){ if(!TUT_ON) return;
  if(e.target.closest("#tutBtn")) return;            // 讓「教學」按鈕能關閉
  const act=e.target.closest('button,a,input,select,textarea,.vtab,[data-tab],td[onclick]');
  if(!act) return;
  e.preventDefault(); e.stopPropagation();
  tutShowFor(e.target);
}, true);
