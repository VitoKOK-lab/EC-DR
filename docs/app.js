// ===================================================================
// EC-DR 精簡版 — 只保留三件事：📅 月排程、🆕 新片上架、♻ 舊片重覆上架
// 角色：管理員（Vito）＋ 剪輯。已移除：交辦、KPI、日報、稽核、二創、商品庫。
// 資料層走 Firestore（fb.js 提供 window.DB）；商業邏輯都在前端。
// ===================================================================
const ROLE_LABEL = {boss:"管理員", editor:"剪輯"};
const ROLE_TABS = {
  boss:   [["cal","📅 月排程"],["videos","🎞 影片庫"],["shifts","🕒 工時/KPI"],["perf","📊 成效"]],
  editor: [["work","📋 上班計畫"],["cal","📅 月排程"],["videos","🎞 影片庫"]],
};
const PUB_TIMES = ["10:00","12:00","16:00"];   // 固定三個上片時間
let STATE = null, CUR_TAB = null, ONLINE = true, LAST_RAW = null, BULK_BUSY = false;
const today = new Date(Date.now()+288e5).toISOString().slice(0,10); // 台灣時間 UTC+8

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
  if(isOwner()){ t.push(["settings","⚙️ 設定"]); t.push(["members","👥 成員管理"]); } return t; }
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
    mainType:(s.mainTypes&&s.mainTypes[0])||"流量型",
    source:(s.sources&&s.sources[0])||"", stage:"待處理",
    editor:"", claimedBy:"", claimedAt:"", finishedAt:"", durationMin:null,
    updatedAt:"", scheduledDate:null, publishTime:"", platforms:[],
    products:[], productUrl:"", note:"",
    reviewStatus:"", reviewNote:"", reviewedBy:"", reviewedAt:"",
    driveFolder:"", publishedLink:"", socialLink:"",
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
function dayScheduledCount(date){ return dayVideoList(date).length; }
// 每天上片目標：依「星期幾」設定 流量／帶貨／寵粉 各幾支（不分平假日）
const TYPE_ORDER=["流量型","帶貨型","寵粉"];
const TYPE_SHORT={"流量型":"流","帶貨型":"帶","寵粉":"寵"};
const WD_ORDER=[1,2,3,4,5,6,0]; const WD_LABEL={0:"日",1:"一",2:"二",3:"三",4:"四",5:"五",6:"六"};
function defaultWeekdayTargets(){ const o={}; for(let d=0;d<7;d++) o[d]={"流量型":3,"帶貨型":1,"寵粉":0}; return o; }
function weekdayTargets(){ const w=STATE.settings&&STATE.settings.weekdayTargets; return (w&&typeof w==="object")?w:defaultWeekdayTargets(); }
function dayTargets(date){ const wd=new Date((date||today)+"T00:00:00").getDay(); const w=weekdayTargets(); const t=w[wd]||w[String(wd)]||{};
  return {"流量型":+t["流量型"]||0,"帶貨型":+t["帶貨型"]||0,"寵粉":+t["寵粉"]||0}; }
function daySum(date){ const t=dayTargets(date); return (t["流量型"]||0)+(t["帶貨型"]||0)+(t["寵粉"]||0); }
// 影片歸類：寵粉 > 帶貨型 > 流量型
function videoTypeOf(v){ if(!v) return "流量型"; const tags=Array.isArray(v.tags)?v.tags:[];
  if(v.mainType==="寵粉"||tags.some(t=>String(t).includes("寵粉"))||String(v.subTag||"").includes("寵粉")) return "寵粉";
  if(v.mainType==="帶貨型"||tags.some(t=>["帶貨","代理","招商","銷售"].includes(t))) return "帶貨型";
  return "流量型"; }
// 某天已排各類型數量、缺口、是否排滿
function dayBreakdown(date){ const list=dayVideoList(date); const cnt={"流量型":0,"帶貨型":0,"寵粉":0};
  list.forEach(it=>{ cnt[videoTypeOf(vid(it.videoId))]++; });
  const tg=dayTargets(date); const deficits={};
  TYPE_ORDER.forEach(k=>{ const d=Math.max(0,(tg[k]||0)-(cnt[k]||0)); if(d>0) deficits[k]=d; });
  const target=daySum(date), total=list.length;
  return {total, target, byType:cnt, deficits, tg, full:Object.keys(deficits).length===0 && total>=target}; }
// 我目前進行中的影片數
function inProgressCount(name){ return (STATE.videos||[]).filter(v=>v.stage==="剪輯中"&&(v.claimedBy===name||v.editor===name)).length; }
function myInProgressCount(){ return inProgressCount(currentUser()); }
// 新片＝剪好還沒上傳（預排上片日尚未到）；舊片＝過了預排上片日（已上傳，可重播）
function videoPubDate(v){ return String(v.scheduledDate||v.finishedAt||"").slice(0,10); }
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
      await window.DB.set("users", name, {name, role, isDefault:false}); return; }
    if(method==="PUT"){ const patch={}; if(body.role!=null) patch.role=body.role;
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
      await window.DB.update("videos",id,{claimedBy:user,claimedAt:nowIso(),editor:v.editor||user,stage:"剪輯中",updatedAt:nowIso()}); return; }
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
    b.onclick = ()=>{ CUR_TAB = id; buildNav(); render(); };
    nav.appendChild(b);
  });
}
function bootLogin(){
  const g = document.getElementById("userGrid"); g.innerHTML = "";
  const editors=((STATE?.users)||[]).filter(u=>(u.role||"editor")==="editor").sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  if(!editors.length){ const n=document.createElement("p"); n.className="muted"; n.style.cssText="width:100%;text-align:center"; n.textContent="尚無剪輯成員，請按「🔒 管理員登入」進入後新增"; g.appendChild(n); return; }
  editors.forEach(u=>{ const b=document.createElement("button"); b.className="userBtn";
    b.innerHTML = esc(u.name)+'<span class="role">點我上班 →</span>'; b.onclick=()=>loginAs(u); g.appendChild(b); });
}
function loginAs(u){ setUser(u.name); localStorage.setItem("ecdr_role", u.role||"editor"); CUR_TAB=null; clockIn(u.name); applyState(LAST_RAW); }
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
// 登出：顯示隨機可愛動畫，三秒後回登入頁
function logout(){ showGoodbye(); }
// 登出：簡單說再見 → 跳回登入頁（無動畫）
function showGoodbye(){
  localStorage.removeItem("ecdr_user"); localStorage.removeItem("ecdr_role");
  CUR_TAB=null; try{ closeModal(); }catch(e){}
  const st=document.getElementById("gstage"); if(st) st.innerHTML=`<span style="font-size:64px">👋</span>`;
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
function vid(id){ return (STATE.videos||[]).find(v=>v.id===id); }
function val(id){ const e=document.getElementById(id); return e?e.value:""; }
function typeTag(t){ const c=t==="帶貨型"?"sales":(t==="流量型"?"traffic":""); return `<span class="tag ${c}">${esc(t||"")}</span>`; }

// ===================================================================
// 畫面路由
// ===================================================================
function render(){
  if(!STATE) return;
  const v = document.getElementById("view");
  const banner = ONLINE ? "" :
    `<div class="card" style="border-color:var(--red)">⚠️ 目前離線，顯示的是最後一次同步的資料（唯讀），連線恢復後會自動更新。</div>`;
  const fn = { cal:viewCal, work:viewWork, videos:viewVideos, perf:viewPerf, shifts:viewShifts, settings:viewSettings, members:viewMembers }[CUR_TAB] || (()=>"");
  v.innerHTML = banner + fn();
}

// ===================================================================
// 📅 月排程（＋ 舊片重覆上架）
// ===================================================================
let CAL_YM = null;
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
    const cls = filled ? "filled" : (within10 ? "bad urgent" : "blank");
    const defTxt=Object.keys(b.deficits).map(k=>(TYPE_SHORT[k]||k)+"缺"+b.deficits[k]);
    cells += `<div class="day ${cls} ${isToday?'today':''}" onclick="openDay('${ds}')">
      ${tmk}<div class="dnum">${d}</div>
      <div class="big">${b.total||"·"}<span style="font-size:14px;color:var(--muted);font-weight:600">${b.target?("/"+b.target):""}</span></div>
      ${filled?`<div class="pmk" style="color:var(--green)">已排滿</div>`:(defTxt.length?`<div class="pmk" style="color:var(--red)">${defTxt.join("・")}</div>`:(within10?`<div class="pmk" style="color:var(--red)">未排</div>`:""))}
    </div>`;
  }
  return `
  <h2>📅 月排程</h2>
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
  const list = dayVideoList(ds);
  const rows = list.map((it)=>{
    const v = vid(it.videoId);
    const reused = it.slot && it.slot.reused;
    const ed = reused ? (it.slot.by||"") : (v?.editor||"");
    const upLink = reused ? (it.slot.publishedLink||"") : (v?.publishedLink||v?.socialLink||"");
    const drive = reused ? (it.slot.driveFolder||v?.driveFolder||"") : (v?.driveFolder||"");
    const onChg = reused ? `moveReuse('${it.videoId}','${ds}',this.value)` : `rescheduleVid('${it.videoId}',this.value,'${ds}')`;
    const tm = reused ? (it.slot.time||"") : (v?.publishTime||"");
    return `<tr>
      <td data-label="影片"><a href="javascript:void(0)" onclick="editVideo('${it.videoId}')">${esc(v?vidTitle(v):(it.videoId||""))}</a> ${v?typeTag(v.mainType):""}${reused?' <span class="tag" style="background:var(--chip);color:var(--gold-dk)">♻ 重播</span>':''}</td>
      <td data-label="剪輯">${reused?'<span class="muted">'+esc(it.slot.by||"")+'（重播）</span>':esc(ed)}</td>
      <td data-label="時間">${tm?esc(tm):'<span class="muted">—</span>'}</td>
      <td data-label="連結">${upLink?`<a href="${esc(upLink)}" target="_blank">上傳</a>`:'<span class="muted">未填</span>'}${drive?` ・<a href="${esc(drive)}" target="_blank" class="muted">存檔</a>`:''}</td>
      <td data-label="改上片日"><input type="date" value="${ds}" style="font-size:12px;padding:4px" onchange="${onChg}"></td>
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
  const reusePicker = `<div class="card" style="border-color:var(--accent)"><b>♻ 排舊片重播到這天</b>
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
      : `<p class="muted" style="margin-top:6px">沒有可排的舊片（當天能排的都排過了，或尚無舊片）。影片需過了預排上片日（成為舊片）才能重播。</p>`}
  </div>`;
  const b = dayBreakdown(ds);
  const summary = `<div class="row" style="gap:8px;margin-bottom:8px">`+
    TYPE_ORDER.filter(k=>(b.tg[k]||0)>0||(b.byType[k]||0)>0).map(k=>{ const ok=(b.byType[k]||0)>=(b.tg[k]||0);
      return `<span class="pill ${ok?'ok':'em'}">${k} ${b.byType[k]||0}/${b.tg[k]||0}</span>`; }).join("")+
    `<span class="pill ${b.total>=b.target?'ok':'em'}">總量 ${b.total}/${b.target}</span></div>`;
  showModal(`📅 ${ds}（${weekdayZh(ds)}）`, `
    <div class="card"><b>當日影片</b>
      ${summary}
      <table class="responsive"><thead><tr><th>影片</th><th>剪輯</th><th>時間</th><th>連結</th><th>改上片日</th></tr></thead>
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

// ===================================================================
// 📋 今日工作（🆕 新片上架）
// ===================================================================
// 排程速覽：連續排滿天數（安全天數）＋未來 14 天缺口
function scheduleGlance(){
  let runway=0;
  for(let off=0;off<=120;off++){ const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()+off); const ds=d.toISOString().slice(0,10);
    if(dayBreakdown(ds).full) runway++; else break; }
  const defs=[];
  for(let off=0;off<14;off++){ const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()+off); const ds=d.toISOString().slice(0,10);
    const b=dayBreakdown(ds); if(!b.full){ const short=Math.max(b.target-b.total, Object.values(b.deficits).reduce((a,n)=>a+n,0)); defs.push({ds,short}); } }
  return {runway, defs, todayTarget:daySum(today)};
}
// ===== 交辦工作（剪輯以外）：tasks/{id} =====
function myTasks(){ return Object.values((STATE&&STATE.tasks)||{})
  .filter(t=>t && t.user===currentUser() && t.date===today)
  .sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||""))); }
async function createTask(){ const t=val("wp_newtask").trim(); if(!t){ toast("請輸入工作項目",true); return; }
  const id="T"+Date.now().toString(36);
  try{ await window.DB.set("tasks", id, {id, user:currentUser(), date:today, title:t, report:"", done:false, createdAt:nowIso()}); }
  catch(e){ toast("新增失敗，請稍後再試",true); } }
function taskReport(id, v){ window.DB.update("tasks", id, {report:v}).catch(()=>{}); }
function taskDone(id, done){
  if(done){ const t=Object.values((STATE&&STATE.tasks)||{}).find(x=>x&&x.id===id);
    if(t && (t.report||'').trim().length<12){ toast("回報狀況需滿 12 字才能打勾完成",true);
      const c=document.getElementById('tc_'+id); if(c) c.checked=false; return; } }
  window.DB.update("tasks", id, {done:!!done}).catch(()=>toast("更新失敗",true)); }
function delTask(id){ if(!confirm("刪除這項交辦工作？")) return; window.DB.del("tasks", id).catch(()=>toast("刪除失敗",true)); }

// 上班計畫：自動帶出製作中影片（標天數）＋ 交辦工作 ＋ 下班匯報
function viewWork(){
  const me = currentUser();
  const inProg = myInProgressCount(); const atLimit = inProg>=3;   // 最多同時 3 支進行中
  const mine = (STATE.videos||[]).filter(v=>(v.claimedBy===me||v.editor===me) && v.stage==="剪輯中")
    .sort((a,b)=>String(a.claimedAt||"").localeCompare(String(b.claimedAt||"")));
  const pool = (STATE.videos||[]).filter(v=>v.stage==="待處理")
    .sort((a,b)=>String(b.updatedAt||b.id).localeCompare(String(a.updatedAt||a.id)));
  const POOL_CAP=40; const poolShown=pool.slice(0,POOL_CAP);
  const work = mine.concat(poolShown);   // 剪輯中在前、毛片待剪在後
  const doneToday = (STATE.videos||[]).filter(v=>v.editor===me && isPublished(v) && String(v.finishedAt||"").slice(0,10)===today);
  const tasks = myTasks();
  const g=scheduleGlance();
  // 天數標記：今天＝新，昨天＝2，前天＝3…（越久顏色越警示）
  const dayBadge=(v)=>{ const b=claimDayBadge(v); const n=(b==="新")?1:(+b); const col=n>=4?'var(--red)':(n>=2?'var(--amber)':'var(--accent)');
    return `<span style="display:inline-flex;min-width:30px;height:30px;padding:0 9px;border-radius:8px;background:${col};color:#fff;font-weight:900;font-size:14px;align-items:center;justify-content:center">${b}</span>`; };
  // 階段按鈕：毛片待剪 →（按）剪輯中 →（按）完成上架
  const stageBtn=(v)=>{ if(v.stage==="剪輯中") return `<button class="btn sm" onclick="finishVid('${v.id}')" title="按一下＝完成上架">剪輯中 ▶</button>`;
    return `<button class="btn sec sm" onclick="claimVid('${v.id}')" ${atLimit?'disabled style="opacity:.5;cursor:not-allowed"':''} title="按一下＝開始剪（變剪輯中）">毛片待剪 ▶</button>`; };
  const rejected = (STATE.videos||[]).filter(v=>v.reviewStatus==="退回" && (v.editor===me||v.claimedBy===me));
  const rejCard = rejected.length?`<div class="card" style="border-color:var(--red)"><b style="color:var(--red)">🔁 老闆娘退回待修（${rejected.length}）</b>
    ${rejected.map(v=>`<div style="margin-top:6px;padding:9px;background:var(--redbg);border-radius:8px">
      <a href="javascript:void(0)" onclick="editVideo('${v.id}')"><b>${esc(vidTitle(v))}</b></a>
      ${v.reviewNote?`<div class="muted" style="font-size:12px;margin-top:2px">退回原因：${esc(v.reviewNote)}</div>`:''}</div>`).join("")}</div>`:'';
  return `
  <h2>📋 本日上班計畫（${esc(me)}）</h2>
  ${rejCard}

  <div class="card">
    <div class="row" style="justify-content:space-between;align-items:center">
      <b style="font-size:16px">✂ 剪輯工作</b>
      <span class="pill ${atLimit?'wa':'ok'}">製作中 ${inProg}/3</span>
    </div>
    <p class="muted" style="font-size:12px;margin:6px 0 0">按「毛片待剪」開始剪（變剪輯中）；剪好按「剪輯中 ▶」＝完成上架。${atLimit?'<span style="color:var(--red)">　已有 3 支製作中，先完成幾支再領</span>':''}</p>
    <table class="responsive" style="margin-top:10px"><thead><tr><th style="width:60px">天數</th><th>影片</th><th style="width:140px">狀態</th></tr></thead>
    <tbody>${work.map(v=>`<tr>
        <td data-label="天數">${v.stage==="剪輯中"?dayBadge(v):'<span class="muted">—</span>'}</td>
        <td data-label="影片"><a href="javascript:void(0)" onclick="editVideo('${v.id}')">${esc(vidTitle(v))}</a> <span class="muted" style="font-size:12px">${esc(v.source||"")}</span></td>
        <td data-label="狀態">${stageBtn(v)}</td>
      </tr>`).join("")||`<tr><td colspan="3" class="muted">目前沒有毛片，去 🎞 影片庫「＋ 新增毛片」建立</td></tr>`}</tbody></table>
    ${pool.length>POOL_CAP?`<p class="muted" style="font-size:12px;margin:8px 0 0">毛片待剪還有 ${pool.length-POOL_CAP} 支未顯示，可到 🎞 影片庫查看。</p>`:''}
  </div>

  <div class="card">
    <b style="font-size:16px">📌 交辦工作（剪輯以外）</b>
    <p class="muted" style="font-size:12px;margin:4px 0 8px">先輸入工作項目，做的時候填回報狀況（需滿 12 字才能打勾完成）；下班會顯示已完成／未完成。</p>
    <table class="responsive"><thead><tr><th>工作項目</th><th>回報狀況</th><th style="width:120px">狀態</th><th style="width:44px"></th></tr></thead>
    <tbody>${tasks.map(t=>{ const can=(t.report||'').trim().length>=12; return `<tr>
        <td data-label="工作項目">${esc(t.title)}</td>
        <td data-label="回報狀況"><input id="tr_${t.id}" value="${esc(t.report||'')}" oninput="var c=document.getElementById('tc_${t.id}');if(c)c.disabled=this.value.trim().length<12" onchange="taskReport('${t.id}',this.value)" placeholder="進度／回報（滿 12 字可打勾）…"></td>
        <td data-label="狀態"><label style="display:inline-flex;align-items:center;gap:6px;font-weight:700;color:${t.done?'var(--green)':'var(--amber)'}">
          <input type="checkbox" id="tc_${t.id}" ${t.done?'checked':''} ${can||t.done?'':'disabled'} onchange="taskDone('${t.id}',this.checked)" style="width:auto;margin:0"> ${t.done?'已完成':'進行中'}</label></td>
        <td data-label=""><button class="btn sec sm" onclick="delTask('${t.id}')">刪</button></td>
      </tr>`;}).join("")||`<tr><td colspan="4" class="muted">尚無交辦工作</td></tr>`}</tbody></table>
    <div class="row" style="gap:8px;margin-top:10px"><input id="wp_newtask" placeholder="新增交辦工作項目…" style="flex:1" onkeydown="if(event.key==='Enter')createTask()"><button class="btn sm" onclick="createTask()">＋ 加入</button></div>
  </div>

  <div class="card" style="text-align:center">
    <span class="pill ok">今日已完成上架 ${doneToday.length} 支</span>
    <span class="pill ${tasks.filter(t=>t.done).length===tasks.length?'ok':'wa'}" style="margin-left:8px">交辦完成 ${tasks.filter(t=>t.done).length}/${tasks.length}</span>
    <div style="margin-top:14px"><button class="btn" style="font-size:16px;padding:14px 34px" onclick="clockOutReport()">🔔 下班匯報</button></div>
  </div>

  <details style="margin-top:2px"><summary style="cursor:pointer;font-weight:700;padding:8px 0;color:var(--muted)">🛠 其他工具（建檔新毛片 / 排舊片）</summary>
    <div class="card" style="margin-top:8px">
      <div class="row" style="justify-content:space-between"><b>＋ 建檔新毛片</b><span class="pill ${pool.length?'ok':'wa'}">待剪庫存 ${pool.length} 支</span></div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button class="btn sm" onclick="batchNewFootage()">批次建檔</button>
        <button class="btn sec sm" onclick="newSimpleVideo()">單筆新增</button>
        <button class="btn sec sm" onclick="CUR_TAB='cal';buildNav();render()">📅 去月排程排舊片（安全 ${g.runway} 天）</button>
      </div>
    </div>
  </details>`
}
// 下班匯報：自動彙整今日完成上架 ＋ 交辦工作狀況；確認後打下班卡並回登入頁
function clockOutReport(){
  const me=currentUser();
  const doneVids=(STATE.videos||[]).filter(v=>v.editor===me && isPublished(v) && String(v.finishedAt||"").slice(0,10)===today);
  const wip=(STATE.videos||[]).filter(v=>(v.claimedBy===me||v.editor===me) && v.stage==="剪輯中");
  const tasks=myTasks();
  const body=`
    <p class="muted" style="margin-top:-6px">這是自動整理的今日成果，確認後打卡下班。</p>
    <div class="card" style="background:var(--panel2)"><b>✅ 今日完成上架（${doneVids.length}）</b>
      ${doneVids.length?doneVids.map(v=>`<div style="margin-top:6px">• ${esc(vidTitle(v))} <span class="pill ok" style="font-size:10px">已完成</span> <span class="muted" style="font-size:12px">剪 ${editDaysLabel(v)} 天</span></div>`).join("")
        :'<p class="muted" style="margin:6px 0 0">今日尚無完成上架</p>'}
      ${wip.length?`<p class="muted" style="font-size:12px;margin:8px 0 0">尚有 ${wip.length} 支製作中（未完成，保留至明天）</p>`:''}
    </div>
    <div class="card" style="background:var(--panel2)"><b>📌 交辦工作（${tasks.filter(t=>t.done).length}/${tasks.length} 完成）</b>
      ${tasks.length?tasks.map(t=>`<div style="margin-top:6px">• ${esc(t.title)} ${t.done?'<span class="pill ok" style="font-size:10px">已完成</span>':'<span class="pill em" style="font-size:10px">未完成</span>'}${t.report?` <span class="muted" style="font-size:12px">— ${esc(t.report)}</span>`:''}</div>`).join("")
        :'<p class="muted" style="margin:6px 0 0">今日無交辦工作</p>'}
    </div>`;
  showModal("🔔 下班匯報", body, async ()=>{ await doClockOut(); closeModal(); toast("辛苦了，已下班 👋"); setTimeout(showGoodbye,300); return true; }, "✅ 確認下班");
}
async function doClockOut(){
  const id=shiftId(currentUser(),today);
  try{ if(myShift()) await window.DB.update("shifts",id,{clockOut:nowIso()});
       else await window.DB.set("shifts",id,{id,user:currentUser(),date:today,clockIn:nowIso(),clockOut:nowIso()}); }catch(e){}
}
// 🕒 工時 / KPI（只給管理員看）
function viewShifts(){
  const editors=(STATE.users||[]).filter(u=>(u.role||"editor")==="editor").map(u=>u.name);
  const shifts=Object.values((STATE&&STATE.shifts)||{});
  const todayShifts=shifts.filter(s=>s.date===today);
  const hm=iso=>String(iso||"").slice(11,16);
  const dur=(a,b)=>{ const m=durationMin(a,b); if(m==null) return "—"; const h=Math.floor(m/60), mm=m%60; return (h?h+"h":"")+mm+"m"; };
  const fin=(STATE.videos||[]).filter(v=>isPublished(v)&&v.finishedAt&&v.editor);
  // 每位剪輯累計 KPI
  const kpi=editors.map(name=>{ const my=fin.filter(v=>v.editor===name);
    const days=my.map(editDays).filter(x=>x!=null); const avgDays=days.length?(days.reduce((a,b)=>a+b,0)/days.length):null;
    const mins=my.map(v=>v.durationMin).filter(x=>typeof x==="number"); const avgMin=mins.length?Math.round(mins.reduce((a,b)=>a+b,0)/mins.length):null;
    const sales=my.filter(v=>(v.productUrl||"").trim()||(Array.isArray(v.products)&&v.products.some(p=>p&&p.name))).length;
    return {name, count:my.length, avgDays, avgMin, sales}; });
  const recent=fin.slice().sort((a,b)=>String(b.finishedAt||"").localeCompare(String(a.finishedAt||""))).slice(0,20);
  return `<h2>🕒 工時 / KPI <span class="muted" style="font-size:13px">僅管理員可見</span></h2>
  <div class="card"><b>📅 今日出勤（${today}）</b>
    <table class="responsive" style="margin-top:8px"><thead><tr><th>剪輯</th><th>上班</th><th>下班</th><th>工時</th></tr></thead>
    <tbody>${editors.map(name=>{ const s=todayShifts.find(x=>x.user===name);
      return `<tr><td data-label="剪輯">${esc(name)}</td>
        <td data-label="上班">${s&&s.clockIn?hm(s.clockIn):'<span class="muted">未上班</span>'}</td>
        <td data-label="下班">${s&&s.clockOut?hm(s.clockOut):(s&&s.clockIn?'<span class="muted">上班中</span>':'—')}</td>
        <td data-label="工時">${s&&s.clockIn?dur(s.clockIn,s.clockOut||nowIso()):'—'}</td></tr>`; }).join("")||'<tr><td colspan="4" class="muted">尚無剪輯成員</td></tr>'}</tbody></table>
  </div>
  <div class="card"><b>📊 剪輯 KPI（累計）</b>
    <p class="muted" style="font-size:12px;margin:4px 0 8px">平均剪片天數＝認領到完成；帶貨支數＝含商品連結的完成片。成效（觀看／互動）請見「成效」儀表板。</p>
    <table class="responsive"><thead><tr><th>剪輯</th><th>完成數</th><th>平均天數</th><th>平均工時</th><th>帶貨支數</th></tr></thead>
    <tbody>${kpi.map(k=>`<tr><td data-label="剪輯">${esc(k.name)}</td>
      <td data-label="完成數">${k.count}</td>
      <td data-label="平均天數">${k.avgDays!=null?k.avgDays.toFixed(1):'—'}</td>
      <td data-label="平均工時">${k.avgMin!=null?(Math.floor(k.avgMin/60)?Math.floor(k.avgMin/60)+"h":"")+(k.avgMin%60)+"m":'—'}</td>
      <td data-label="帶貨支數">${k.sales}</td></tr>`).join("")||'<tr><td colspan="5" class="muted">尚無資料</td></tr>'}</tbody></table>
  </div>
  <div class="card"><b>🎬 近期完成（單片工時）</b>
    <table class="responsive" style="margin-top:8px"><thead><tr><th>影片</th><th>剪輯</th><th>完成日</th><th>剪片天數</th><th>工時</th></tr></thead>
    <tbody>${recent.map(v=>`<tr><td data-label="影片">${esc(vidTitle(v))}</td>
      <td data-label="剪輯">${esc(v.editor||"")}</td>
      <td data-label="完成日">${String(v.finishedAt||"").slice(0,10)}</td>
      <td data-label="剪片天數">${editDaysLabel(v)||'—'}</td>
      <td data-label="工時">${typeof v.durationMin==="number"?((Math.floor(v.durationMin/60)?Math.floor(v.durationMin/60)+"h":"")+(v.durationMin%60)+"m"):'—'}</td></tr>`).join("")||'<tr><td colspan="5" class="muted">尚無完成紀錄</td></tr>'}</tbody></table>
  </div>`;
}
// ① 批次建檔新毛片：一行一支片名，一次建立多支「待剪新片」
function batchNewFootage(){
  showModal("新增毛片（一行一支，可大量一次新增）", `
    <label>毛片片名（一行一支）</label>
    <textarea id="bf_list" style="min-height:170px" placeholder="劉亦菲紅毯珠寶&#10;八大珠寶派系&#10;真假寶石30秒分辨"></textarea>
    <p class="muted" style="font-size:12px;margin-top:6px">建立後狀態為「毛片待剪」，細節到影片庫點進去再補。</p>
  `, async ()=>{
    const lines=val("bf_list").split("\n").map(s=>s.trim()).filter(Boolean);
    if(!lines.length){ toast("請至少輸入一支片名",true); return false; }
    let base=0; (STATE.videos||[]).forEach(it=>{ const m=String(it.id||"").match(/^V(\d+)$/); if(m) base=Math.max(base,+m[1]); });
    let ok=0; BULK_BUSY=true;
    try{
      for(let i=0;i<lines.length;i++){ const id="V"+String(base+i+1).padStart(3,"0");
        const rec=Object.assign(newVideoRecord({name:lines[i], rawName:lines[i]}), {id});
        try{ await window.DB.set("videos", id, rec); ok++; }catch(e){} }
    } finally { BULK_BUSY=false; applyState(LAST_RAW); }
    await delay(300); toast("已新增 "+ok+" 支毛片"); return true;
  });
}
function claimVid(id){ write("POST",`/api/videos/${id}/claim`,{},"已認領，加入我的工作"); }
function claimPicked(){ const id=val("poolPick"); if(!id){ toast("請先從清單選一支影片",true); return; } claimVid(id); }
// 上片時間下拉（固定 10/12/16）
function pubTimeSelect(id, cur){ const c=PUB_TIMES.includes(cur)?cur:"10:00";
  return `<select id="${id}">`+PUB_TIMES.map(t=>`<option ${t===c?"selected":""}>${t}</option>`).join("")+`</select>`; }
function finishGate(p){ const b=document.getElementById("modalConfirm"); if(b){ b.disabled=false; b.style.opacity=""; b.style.cursor=""; } }
function finishVid(id){
  const v = vid(id)||{};
  const def = v.scheduledDate || "";   // 預排日可留空 → 完成後進「新片未排程」
  const defPlat = (Array.isArray(v.platforms)&&v.platforms.length)?v.platforms:postPlatforms().map(p=>p.name); // 預設全部上傳
  showModal("完成上架（預排上片日可留空，之後再排）", `
    <label>成品標題名稱（編號＝原片編號，不填則同原始片名）</label>
    <div class="row" style="gap:8px">
      <input value="${esc(vidCode(v))}" readonly style="flex:none;width:78px;background:var(--panel2);text-align:center" title="影片編號">
      <input id="f_name" value="${esc(v.name||v.rawName||"")}" style="flex:1" placeholder="成品標題名稱">
    </div>
    <label>存檔位置（雲端備份）</label><input id="f_backup" value="${esc(v.driveFolder||"")}" oninput="finishGate('f_')" placeholder="Google Drive 備份連結">
    <label>上傳位置（平台・預設全部，不上傳的取消勾選）</label>
    <div style="display:flex;flex-wrap:wrap;gap:6px" onchange="finishGate('f_');renderFinishLinks()">${platChips("f_plat", defPlat)}</div>
    <div class="grid cols2">
      <div><label>預排上片日期</label><input id="f_date" type="date" value="${esc(def)}" oninput="finishGate('f_')"></div>
      <div><label>預排上片時間</label><input id="f_time" type="time" value="${esc(v.publishTime||"10:00")}"></div>
    </div>
    ${tagPickerHTML("f", v.tags||(v.subTag?[v.subTag]:[]))}
    ${productRows("f", v.products)}
    <label>商品頁網址（導購連結用）</label><input id="f_url" value="${esc(v.productUrl||"")}" oninput="renderFinishLinks()" placeholder="https://www.tzgrotw.tw/products/...">
    <div id="f_links"></div>
    <label>社群預排連結（選填）</label><input id="f_social" value="${esc(v.socialLink||v.publishedLink||"")}" placeholder="排程工具／預約貼文連結">
    <label>備註（選填）</label><input id="f_note" value="${esc(v.note||"")}" placeholder="補充說明">
  `, async ()=>{
    const tags=collectTags("f"); await persistNewTags(tags);
    return await write("POST",`/api/videos/${id}/finish`,
      {name:(val("f_name").trim()||v.rawName||v.name||""), scheduledDate:val("f_date"), publishTime:val("f_time"), tags, subTag:tags[0]||"",
       platforms:collectPlat("f_plat"), products:collectProducts("f"), productUrl:val("f_url").trim(), note:val("f_note").trim(),
       publishedLink:val("f_social"), driveFolder:val("f_backup"), socialLink:val("f_social"),
       published:true, backupDone:true, socialScheduled:true}, "已完成，已加入月行事曆");
  });
  finishGate("f_"); renderFinishLinks();
}
// 完成上架視窗：貼上商品頁網址後，即時產生各平台導購連結可複製
function renderFinishLinks(){
  const box=document.getElementById("f_links"); if(!box) return;
  const url=(val("f_url")||"").trim();
  if(!url){ box.innerHTML=""; return; }
  const sel=collectPlat("f_plat");
  const plats=(sel.length?postPlatforms().filter(p=>sel.includes(p.name)):postPlatforms());
  box.innerHTML=`<div class="card" style="background:var(--panel2);margin-top:8px"><b>🔗 導購連結（複製去發）</b>`+
    plats.map((p,i)=>`<div style="margin-top:6px"><label style="margin:0 0 2px">${esc(p.name)}</label>
      <div class="row" style="gap:8px"><input id="fl_${i}" value="${esc(platformUtm(url,p.utm))}" readonly onclick="this.select()" style="flex:1;min-width:180px"><button class="btn sm" type="button" onclick="copyFromInput('fl_${i}')">複製</button></div></div>`).join("")+`</div>`;
}
// 編輯影片視窗：商品頁網址輸入一次，下方各平台用「按鈕」呈現，按一下＝複製該平台 utm 連結
function editLinksHTML(url){ url=(url||"").trim(); if(!url) return "";
  return `<div class="card" style="background:var(--panel2)"><b>🔗 導購連結（按一下即複製）</b>
    <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
    ${postPlatforms().map(p=>`<button class="btn sm" type="button" onclick="copyStr('${encodeURIComponent(platformUtm(url,p.utm))}')">📋 ${esc(p.name)}</button>`).join("")}
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
    <label>影片文案</label><input id="sv_vcopy" placeholder="影片文案">
    ${productRows("sv", [])}
  `, async ()=>{
    const name=val("sv_name").trim();
    if(!name){ toast("請輸入原始片名",true); return false; }
    const video={name, rawName:name, videoCopy:val("sv_vcopy").trim(), products:collectProducts("sv")};
    return await write("POST","/api/videos",{video},"已新增影片");
  });
}

// ===================================================================
// 影片標籤（可複選＋可新增），預設清單存在 settings.videoTags
// ===================================================================
const DEFAULT_TAGS=["新片","舊片","每日寵粉","招商","銷售"];
const NEWOLD_TAGS=["新片","舊片"];
function videoTags(){ const t=STATE&&STATE.settings&&STATE.settings.videoTags; return (Array.isArray(t)&&t.length)?t:DEFAULT_TAGS; }
// 「其他標籤」= 設定的標籤清單，去掉新舊片（新舊由預排上片日自動判斷，僅供排序）
function otherTags(){ const skip=new Set(NEWOLD_TAGS); return videoTags().filter(t=>!skip.has(t)); }
function tagChip(id,t,checked){ return `<label style="display:inline-flex;align-items:center;gap:4px;background:var(--panel2);padding:4px 10px;border-radius:14px;cursor:pointer;font-size:13px">
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
// 🎞 影片庫
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
  let t=base.map(x=>String(x).trim()).filter(s=>s && s!=="新片" && s!=="舊片");
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
    .then(()=>{ toast(status==="通過"?"已通過 ✔":"已退回，剪輯會收到 🔁"); closeModal(); })
    .catch(()=>toast("操作失敗，請稍後再試",true));
}
let VID_VIEW="raw";       // 影片庫分頁：raw=毛片待剪 / newNoSched=新片未排程 / newSched=新片已排程 / old=舊片 / all=全部
let VID_TAGS=new Set();   // 標籤篩選（可複選）
// 一列 = 一支影片
function vidTableRow(v){
  const stageCol={"待處理":"var(--muted)","剪輯中":"var(--accent)","已完成":"var(--green)","已上片":"var(--green)"}[v.stage]||"var(--muted)";
  const tags=videoTagsOf(v);
  const tagHTML=tags.length?tags.map(t=>`<span class="tag" style="font-size:11px">${esc(t)}</span>`).join(" "):'<span class="muted" style="font-size:12px">—</span>';
  const prod=(v.productUrl||"").trim();
  const prodCount=(Array.isArray(v.products)?v.products.filter(p=>p&&p.name):[]).length;
  const prodHTML=prod?`<a href="${esc(prod)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🔗 商品頁${prodCount?`（${prodCount}）`:""}</a>`
    :(prodCount?`<span class="muted" style="font-size:12px">${prodCount} 項</span>`:'<span class="muted" style="font-size:12px">—</span>');
  const rev=v.reviewStatus==="通過"?'<span class="pill ok" style="font-size:10px">✔ 已審</span>'
    :(v.reviewStatus==="退回"?'<span class="pill em" style="font-size:10px">✘ 退回</span>':'');
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
  let list=all.filter(v=> VID_VIEW==="all"?true:(vidSegment(v)===VID_VIEW));
  if(q) list=list.filter(v=>String(v.name||v.rawName||'').toLowerCase().includes(q)||String(v.code||'').toLowerCase().includes(q)||String(v.editor||'').toLowerCase().includes(q));
  if(VID_TAGS.size) list=list.filter(v=>videoTagsOf(v).some(t=>VID_TAGS.has(t)));
  if(!list.length) return '<p class="muted" style="padding:14px 4px">沒有符合的影片</p>';
  // 待發在前、依最後更新日新到舊
  const rank={"待處理":0,"剪輯中":1,"已完成":2,"已上片":3};
  list.sort((a,b)=> (rank[a.stage]??9)-(rank[b.stage]??9) || String(vidUpdated(b)).localeCompare(String(vidUpdated(a))) || String(b.id).localeCompare(String(a.id)));
  return `<table class="vtable responsive">
    <colgroup><col class="c-vid"><col class="c-tag"><col class="c-upd"><col class="c-sch"><col class="c-prod"><col class="c-ed"><col class="c-st"></colgroup>
    <thead><tr><th>影片</th><th>標籤</th><th>最後更新</th><th>預排上片</th><th>商品</th><th>剪輯師</th><th>狀態</th></tr></thead>
    <tbody>${list.map(vidTableRow).join("")}</tbody></table>
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
  const viewList=all.filter(v=> VID_VIEW==="all"?true:(vidSegment(v)===VID_VIEW));
  const tagCount={}; viewList.forEach(v=>videoTagsOf(v).forEach(t=>{ tagCount[t]=(tagCount[t]||0)+1; }));
  const order=videoTags();
  const present=Object.keys(tagCount).sort((a,b)=>{ const ia=order.indexOf(a),ib=order.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib) || a.localeCompare(b); });
  const tagBtns=present.length
    ? present.map(t=>`<button class="btn sm ${VID_TAGS.has(t)?'':'sec'}" onclick="vidTagToggle('${esc(t)}',this)">${esc(t)} <span style="opacity:.7">${tagCount[t]}</span></button>`).join("")
      +`<a href="javascript:void(0)" onclick="VID_TAGS.clear();render()" class="muted" style="font-size:12px;margin-left:4px">清除篩選</a>`
    : '<span class="muted" style="font-size:12px">此分頁的影片尚未加標籤</span>';
  return `<h2>🎞 影片庫 <span class="muted" style="font-size:13px">點任一列看／改細節</span></h2>
  <div class="card">
    <div class="vtabs">
      ${tab("raw","毛片待剪",seg.raw)}
      ${tab("newNoSched","新片未排程",seg.newNoSched)}
      ${tab("newSched","新片已排程",seg.newSched)}
      ${tab("old","舊片",seg.old)}
      ${tab("all","全部",all.length)}
    </div>
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px">
      <input id="vid_q" placeholder="🔍 搜尋編號／片名／剪輯" oninput="vidFilter()" style="flex:1;min-width:150px">
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
// 影片內容：預設檢視（不可改）；右上「✎ 編輯」才進編輯、右上「✕」關閉
function editVideo(id){ openVideoModal(id, false); }
function openVideoModal(id, edit){
  const v = vid(id)||{};
  const s=STATE.settings||{};
  const sources=s.sources||["老闆自拍","外部公司"];
  const users=(STATE.users||[]).filter(u=>u.role==="editor").map(u=>u.name);
  const stages=["待處理","剪輯中","已完成","已上片"];
  const tags=videoTagsOf(v);
  const prodList=(Array.isArray(v.products)?v.products.filter(p=>p&&p.name):[]);
  const reviewCard = currentRole()==='boss'?`<div class="card" style="background:var(--panel2)"><b>👩‍💼 老闆娘審核</b>
      <div class="row" style="gap:8px;margin-top:6px;align-items:center">
        <button class="btn sm" type="button" onclick="reviewVid('${id}','通過')">✔ 通過</button>
        <button class="btn sm danger" type="button" onclick="reviewVid('${id}','退回')">✘ 退回</button>
        <span class="muted">目前：${v.reviewStatus?(esc(v.reviewStatus)+(v.reviewNote?'（'+esc(v.reviewNote)+'）':'')):'未審'}</span>
      </div></div>`:'';
  const usageCard = id&&usageList(v).length?`<div class="card" style="background:var(--panel2)"><b>♻ 使用紀錄（共 ${usageList(v).length} 次）</b>
      <table class="responsive"><thead><tr><th>上片日期</th><th>連結</th><th>排片人</th></tr></thead><tbody>
      ${usageList(v).map(u=>`<tr><td data-label="上片日期">${esc(u.date)}</td><td data-label="連結">${u.link?`<a href="${esc(u.link)}" target="_blank">開啟</a>`:'<span class="muted">—</span>'}</td><td data-label="排片人">${esc(u.by||"")}</td></tr>`).join("")}
      </tbody></table></div>`:"";
  const head=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 14px">
      <h3 style="margin:0">影片內容</h3>
      <div style="display:flex;gap:6px;align-items:center">
        ${edit?'':`<button class="btn sec sm" type="button" onclick="openVideoModal('${id}',true)">✎ 編輯</button>`}
        <button class="btn sec sm" type="button" onclick="closeModal()" title="關閉">✕</button>
      </div></div>`;

  if(!edit){
    const row=(l,c)=>`<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)"><div class="muted" style="width:100px;flex:none;font-size:13px">${l}</div><div style="flex:1;min-width:0">${c||'<span class="muted">—</span>'}</div></div>`;
    const body=`
      ${row("編號", esc(vidCode(v)))}
      ${row("原始片名", esc(v.rawName||""))}
      ${row("影片貼文文案", esc(v.name||""))}
      ${row("影片文案", v.videoCopy?esc(v.videoCopy).replace(/\n/g,'<br>'):'')}
      ${row("標籤", tags.length?tags.map(t=>`<span class="tag">${esc(t)}</span>`).join(" "):'')}
      ${row("片源", esc(v.source||""))}
      ${row("階段", `<span class="pill ${v.stage==='已上片'||v.stage==='已完成'?'ok':(v.stage==='剪輯中'?'wa':'')}">${esc(v.stage||"")}</span>`)}
      ${row("剪輯人員", esc(v.editor||""))}
      ${row("商品", prodList.length?prodList.map(p=>esc(p.name)+(p.price?`（$${esc(p.price)}）`:"")).join("、"):'')}
      ${row("商品頁網址", v.productUrl?`<a href="${esc(v.productUrl)}" target="_blank">${esc(v.productUrl)}</a>`:'')}
      ${row("預排上片日", esc(v.scheduledDate||""))}
      ${row("雲端備份", v.driveFolder?`<a href="${esc(v.driveFolder)}" target="_blank">開啟</a>`:'')}
      ${row("社群連結", v.socialLink||v.publishedLink?`<a href="${esc(v.socialLink||v.publishedLink)}" target="_blank">開啟</a>`:'')}
      ${row("備註", esc(v.note||""))}
      ${row("審核", v.reviewStatus?esc(v.reviewStatus)+(v.reviewNote?'（'+esc(v.reviewNote)+'）':''):'未審')}
      ${editLinksHTML(v.productUrl)}
      ${reviewCard}
      ${usageCard}`;
    document.getElementById("modalRoot").innerHTML=`<div class="modal"><div class="box">${head}${body}</div></div>`;
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
    <label>影片文案</label><input id="e_vcopy" value="${esc(v.videoCopy||"")}" placeholder="影片文案">
    ${tagPickerHTML("e", v.tags||(v.subTag?[v.subTag]:[]))}
    <div class="grid cols2">
      <div><label>片源</label><select id="e_src">${sources.map(c=>`<option ${v.source===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
      <div><label>階段</label><select id="e_stage">${stages.map(c=>`<option ${v.stage===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
    </div>
    <label>剪輯人員</label><select id="e_editor"><option value="">—</option>${users.map(u=>`<option ${v.editor===u?"selected":""}>${esc(u)}</option>`).join("")}</select>
    ${productRows("e", v.products)}
    <label>商品頁網址（導購連結用・輸入一次即可，下方自動帶各平台參數）</label><input id="e_url" value="${esc(v.productUrl||"")}" oninput="renderEditLinks()" placeholder="https://www.tzgrotw.tw/products/...">
    <label>預排上片日期</label><input id="e_date" type="date" value="${esc(v.scheduledDate||"")}">
    <div id="e_links">${editLinksHTML(v.productUrl)}</div>
    <label>備註</label><input id="e_note" value="${esc(v.note||"")}" placeholder="補充說明（選填）">
    ${reviewCard}
    <div class="card" style="background:var(--panel2)"><b>🔗 連結</b>
      <label>雲端備份連結</label><input id="e_drive" value="${esc(v.driveFolder||"")}" placeholder="Google Drive / 雲端備份">
      <label>社群平台預排連結</label><input id="e_social" value="${esc(v.socialLink||v.publishedLink||"")}" placeholder="排程工具 / 預約貼文連結">
    </div>
    ${usageCard}
    <div class="card" style="border-color:var(--red)">
      <button class="btn danger sm" type="button" onclick="delVideo('${id}')">🗑 刪除這支影片</button>
      <span class="muted" style="font-size:12px;margin-left:8px">需二次確認，刪除後無法復原</span>
    </div>`;
  const foot=`<div class="modalFoot">
      <button class="btn sec" type="button" onclick="openVideoModal('${id}',false)">取消編輯</button>
      <button class="btn" id="vmSave" type="button">💾 儲存修改</button></div>`;
  document.getElementById("modalRoot").innerHTML=`<div class="modal"><div class="box">${head}${body}${foot}</div></div>`;
  document.getElementById("vmSave").onclick=async()=>{ const ok=await saveVideo(id); if(ok) closeModal(); };
}
async function saveVideo(id){
  const tags=collectTags("e"); await persistNewTags(tags);
  const mainType = tags.some(t=>String(t).includes("寵粉"))?"寵粉":(tags.some(t=>["帶貨","代理","招商","銷售"].includes(t))?"帶貨型":"流量型");
  const video={code:val("e_code").trim(), rawName:val("e_raw"), name:val("e_name").trim()||val("e_raw").trim(), videoCopy:val("e_vcopy").trim(), mainType,tags,subTag:tags[0]||"",
    products:collectProducts("e"), productUrl:val("e_url").trim(),
    source:val("e_src"),stage:val("e_stage"),editor:val("e_editor"),
    scheduledDate:val("e_date")||null,
    driveFolder:val("e_drive"), publishedLink:val("e_social"), socialLink:val("e_social"), note:val("e_note").trim()};
  return await write("PUT",`/api/videos/${id}`,{video},"已更新影片");
}

// ===================================================================
// ⚙️ 設定（管理員）
// ===================================================================
function viewSettings(){
  const s=STATE.settings||{};
  const w=weekdayTargets();
  const rows=WD_ORDER.map(d=>{ const t=w[d]||w[String(d)]||{};
    const cell=(k)=>`<input type="number" min="0" id="wt_${d}_${k}" value="${+t[k]||0}" oninput="wtSum(${d})" style="width:62px;text-align:center">`;
    const sum=(+t["流量型"]||0)+(+t["帶貨型"]||0)+(+t["寵粉"]||0);
    return `<tr><td data-label="星期"><b>週${WD_LABEL[d]}</b></td>
      <td data-label="流量片">${cell("流量型")}</td>
      <td data-label="帶貨片">${cell("帶貨型")}</td>
      <td data-label="寵粉片">${cell("寵粉")}</td>
      <td data-label="小計"><b id="wt_sum_${d}">${sum}</b> 支</td></tr>`;
  }).join("");
  const platStr=postPlatforms().map(p=>p.name+"="+p.utm).join("\n");
  return `<h2>⚙️ 設定</h2>
  <div class="card"><b>每天上片數量（依星期幾）</b>
    <table class="responsive" style="margin-top:8px"><thead><tr><th>星期</th><th>流量片</th><th>帶貨片</th><th>寵粉片</th><th>小計</th></tr></thead>
    <tbody>${rows}</tbody></table>
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
  </div>`;
}
function wtSum(d){ const v=(k)=>parseInt(val("wt_"+d+"_"+k))||0; const e=document.getElementById("wt_sum_"+d);
  if(e) e.textContent=v("流量型")+v("帶貨型")+v("寵粉"); }
async function saveSettings(){
  const weekdayTargets={};
  for(let d=0;d<7;d++){ weekdayTargets[d]={
    "流量型":parseInt(val("wt_"+d+"_流量型"))||0,
    "帶貨型":parseInt(val("wt_"+d+"_帶貨型"))||0,
    "寵粉":parseInt(val("wt_"+d+"_寵粉"))||0 }; }
  const plats=(val("set_plat")||"").split("\n").map(s=>s.trim()).filter(Boolean).map(line=>{
    const i=line.indexOf("="); const name=(i>=0?line.slice(0,i):line).trim(); const utm=(i>=0?line.slice(i+1):line).trim()||name; return {name,utm}; });
  const settings={ weekdayTargets, scheduleHorizonDays:parseInt(val("set_horizon"))||30, shoplineBase:(val("set_shop")||"").trim() };
  const pw=(val("set_pw")||"").trim(); if(pw) settings.adminPassword=pw; // 空白則沿用舊密碼
  if(plats.length) settings.postPlatforms=plats;
  await writeAdmin("PUT","/api/settings",{settings},"已更新設定");
}

// ===================================================================
// 👥 成員管理（限管理員）
// ===================================================================
function viewMembers(){
  const users=(STATE.users||[]).filter(u=>(u.role||"editor")==="editor");
  const rows=users.map(u=>`<tr>
    <td data-label="名字"><b>${esc(u.name)}</b></td>
    <td data-label=""><button class="btn sm sec" onclick="renameMember('${esc(u.name)}')">改名</button>
      <button class="btn sm danger" onclick="delMember('${esc(u.name)}')">刪除</button></td>
  </tr>`).join("");
  return `<h2>👥 成員管理 <span class="muted" style="font-size:13px">（限管理員）</span></h2>
  <div class="card"><b>剪輯成員（${users.length}）</b>
    <table class="responsive"><thead><tr><th>名字</th><th></th></tr></thead>
    <tbody>${rows||`<tr><td class="muted">尚無成員</td></tr>`}</tbody></table>
  </div>
  <div class="card"><b>新增剪輯</b>
    <div class="row" style="gap:8px;margin-top:8px"><input id="mb_name" placeholder="名字" style="flex:1;min-width:150px">
      <button class="btn" onclick="addMember()">新增</button></div>
  </div>`;
}
function addMember(){ const name=val("mb_name").trim(); if(!name){ toast("請輸入名字",true); return; }
  write("POST","/api/users",{name,role:"editor"},"已新增剪輯"); }
function delMember(name){ if(!confirm("確定刪除成員「"+name+"」？")) return;
  writeAdmin("DELETE","/api/users/"+name,{},"已刪除成員"); }
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
// 📊 成效：流量連到 meta-dashboard；Shopline 用一條固定導購連結
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
// 投放平台複選（給完成上架／編輯影片用）
function platChips(cls, selected){ const sel=new Set(selected||[]);
  return postPlatforms().map(p=>`<label style="display:inline-flex;align-items:center;gap:4px;background:var(--panel2);padding:4px 10px;border-radius:14px;cursor:pointer;font-size:13px"><input type="checkbox" class="${cls}" value="${esc(p.name)}" ${sel.has(p.name)?"checked":""} style="width:auto;margin:0"> ${esc(p.name)}</label>`).join(""); }
function collectPlat(cls){ return Array.from(document.querySelectorAll('.'+cls)).filter(x=>x.checked).map(x=>x.value); }
// 影片編號（無自訂 code 則取 id 數字，如 V001→001）；外顯片名以成品標題名稱為主
function vidCode(v){ return (v&&v.code) || String((v&&v.id)||"").replace(/^V/,""); }
function vidTitle(v){ const t=(v&&(v.name||v.rawName))||"(未命名)"; const c=vidCode(v); return c?(c+" "+t):t; }
// 已用過的商品名（下拉選用，讓品名一致）
function knownProducts(){ const set=new Set(); (STATE.videos||[]).forEach(v=>{ (v.products||[]).forEach(p=>{ if(p&&p.name) set.add(p.name); }); }); return [...set].sort(); }
// 商品列：最多 3 個，每個 品名(下拉)+單價(手動)
function productRows(prefix, products){
  const ps=Array.isArray(products)?products:[];
  let h=`<label>銷售商品（最多 4 個，品名可下拉、單價手動）</label>`;
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
function viewPerf(){
  return `<h2>📊 成效</h2>
  <div class="card">
    <b>🎬 影音流量</b>
    <div style="margin-top:10px"><a class="btn" href="${META_DASH_URL}" target="_blank">開啟短影音成效儀表板 →</a></div>
  </div>
  <div class="card">
    <b>🛒 Shopline 導購連結</b>
    <p class="muted" style="font-size:13px;margin-top:8px">每支片的導購連結在「🎞 影片庫 → 點影片 → 編輯」裡，依商品頁網址＋平台自動產生、可複製。</p>
  </div>`;
}

// ===================================================================
// 彈窗
// ===================================================================
function showModal(title, inner, onConfirm, confirmLabel){
  const root=document.getElementById("modalRoot");
  const html=`<div class="modal"><div class="box">
    <h3>${esc(title)}</h3>${inner}
    <div class="modalFoot">
      <button class="btn sec" onclick="closeModal()">取消</button>
      ${onConfirm?`<button class="btn" id="modalConfirm">${esc(confirmLabel||"確認送出")}</button>`:""}
    </div></div></div>`;
  root.innerHTML = html;
  if(onConfirm){ document.getElementById("modalConfirm").onclick=async()=>{ const r=await onConfirm(); if(r!==false) closeModal(); }; }
}
function closeModal(){ document.getElementById("modalRoot").innerHTML=""; }
