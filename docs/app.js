// ===================================================================
// EC-DR 精簡版 — 只保留三件事：📅 月排程、🆕 新片上架、♻ 舊片重覆上架
// 角色：管理員（Vito）＋ 剪輯。已移除：交辦、KPI、日報、稽核、二創、商品庫。
// 資料層走 Firestore（fb.js 提供 window.DB）；商業邏輯都在前端。
// ===================================================================
const ROLE_LABEL = {boss:"管理員", editor:"剪輯"};
const ROLE_TABS = {
  boss:   [["cal","📅 月排程"],["videos","🎞 影片庫"],["perf","📊 成效"]],
  editor: [["work","📋 今日工作"],["cal","📅 月排程"],["videos","🎞 影片庫"],["perf","📊 成效"]],
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
    name:"", rawName:"", tags:[], subTag:"",
    mainType:(s.mainTypes&&s.mainTypes[0])||"流量型",
    source:(s.sources&&s.sources[0])||"", stage:"待處理",
    editor:"", claimedBy:"", claimedAt:"", finishedAt:"", durationMin:null,
    scheduledDate:null, publishTime:"", platforms:[],
    products:[], productUrl:"",
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
// 「新片」為自動狀態：上片 45 天內算新片，超過自動移除（即成為可重播的舊片）
const NEW_DAYS=45;
function videoPubDate(v){ return String(v.finishedAt||v.scheduledDate||"").slice(0,10); }
function isNewVideo(v){ if(!v||!["已完成","已上片"].includes(v.stage)) return false;
  const d=videoPubDate(v); if(!d) return false;
  const diff=(new Date(today+"T00:00:00")-new Date(d+"T00:00:00"))/86400000;
  return diff>=0 && diff<=NEW_DAYS; }
// 手選「新片」若已過上片 45 天 → 顯示歸為舊片（沒上片日則維持手選）
function pastNewWindow(v){ const d=videoPubDate(v); if(!d) return false; return (new Date(today+"T00:00:00")-new Date(d+"T00:00:00"))/86400000 > NEW_DAYS; }

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
      const v=newVideoRecord(inc); await window.DB.set("videos", v.id, v); return;
    }
    const id=seg[1], v=vidLocal(id), action=seg[2];
    if(!v && method!=="DELETE") throw new Error("找不到影片");
    if(action==="claim"){
      if(inProgressCount(user)>=3) throw new Error("你手上已有 3 支進行中，先完成幾支再拉新片");
      await window.DB.update("videos",id,{claimedBy:user,claimedAt:nowIso(),editor:v.editor||user,stage:"剪輯中"}); return; }
    if(action==="finish"){
      const date=body.scheduledDate; if(!date) throw new Error("請選擇上片日期");
      if(!(body.published && body.backupDone && body.socialScheduled)) throw new Error("需確認：已上架、已上傳雲端備份、社群平台已預排");
      const ed=v.editor||v.claimedBy||user;
      const patch={stage:"已完成",finishedAt:nowIso(),editor:ed,locked:true,
        scheduledDate:date, published:true, backupDone:true, socialScheduled:true};
      if(v.claimedAt) patch.durationMin=durationMin(v.claimedAt, patch.finishedAt);
      if(body.driveFolder) patch.driveFolder=body.driveFolder; if(body.name) patch.name=body.name;
      if(body.publishTime) patch.publishTime=body.publishTime;
      if(Array.isArray(body.tags)) patch.tags=body.tags; if(body.subTag!==undefined) patch.subTag=body.subTag;
      if(Array.isArray(body.platforms)) patch.platforms=body.platforms;
      if(Array.isArray(body.products)) patch.products=body.products;
      if(body.productUrl!==undefined) patch.productUrl=body.productUrl;
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
    if(method==="PUT"){ const patch=Object.assign({}, body.video); delete patch.id; await window.DB.update("videos",id,patch); return; }
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
    b.innerHTML = esc(u.name)+'<span class="role">剪輯</span>'; b.onclick=()=>loginAs(u); g.appendChild(b); });
}
function loginAs(u){ setUser(u.name); localStorage.setItem("ecdr_role", u.role||"editor"); CUR_TAB=null; applyState(LAST_RAW); }
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
  const fn = { cal:viewCal, work:viewWork, videos:viewVideos, perf:viewPerf, settings:viewSettings, members:viewMembers }[CUR_TAB] || (()=>"");
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
    <div class="row" style="justify-content:space-between">
      <button class="btn sm sec" onclick="calMove(-1)">← 上月</button>
      <b>${y} 年 ${m+1} 月</b>
      <button class="btn sm sec" onclick="calMove(1)">下月 →</button>
    </div>
    <div class="cal" style="margin-top:12px">
      ${["日","一","二","三","四","五","六"].map(x=>`<div class="dow">${x}</div>`).join("")}
      ${cells}
    </div>
    <p class="muted" style="margin-top:10px;font-size:12px"><span style="color:var(--green)">●</span> 已排滿　<span style="color:#888">●</span> 未排　<span style="color:var(--red)">●</span> 待補</p>
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
      <td data-label="影片"><a href="javascript:void(0)" onclick="editVideo('${it.videoId}')">${esc(v?vidTitle(v):(it.videoId||""))}</a> ${v?typeTag(v.mainType):""}${reused?' <span class="tag" style="background:#ede9fe;color:#6d28d9">♻ 重播</span>':''}</td>
      <td data-label="剪輯">${reused?'<span class="muted">'+esc(it.slot.by||"")+'（重播）</span>':esc(ed)}</td>
      <td data-label="時間">${tm?esc(tm):'<span class="muted">—</span>'}</td>
      <td data-label="連結">${upLink?`<a href="${esc(upLink)}" target="_blank">上傳</a>`:'<span class="muted">未填</span>'}${drive?` ・<a href="${esc(drive)}" target="_blank" class="muted">存檔</a>`:''}</td>
      <td data-label="改上片日"><input type="date" value="${ds}" style="font-size:12px;padding:4px" onchange="${onChg}"></td>
    </tr>`;
  }).join("");
  // 排舊片到這天：當天已排過的不再出現；時段自動帶 10/12/16，超過 3 個可自選時間
  const usedIds = new Set(list.map(it=>it.videoId));
  const doneList=(STATE.videos||[]).filter(v=>["已完成","已上片"].includes(v.stage) && !usedIds.has(v.id) && !isNewVideo(v))  // 新片(45天內)不可重播
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
      : `<p class="muted" style="margin-top:6px">沒有可排的舊片（當天能排的都排過了，或尚無已完成舊片）。新片需滿 45 天才能重播。</p>`}
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
// 今日工作＝每天上班的三步驟例行作業
function viewWork(){
  const me = currentUser();
  const inProg = myInProgressCount(); const atLimit = inProg>=3;   // 最多同時 3 支進行中
  const mine = (STATE.videos||[]).filter(v=>(v.claimedBy===me||v.editor===me) && v.stage==="剪輯中");
  const pool = (STATE.videos||[]).filter(v=>v.stage==="待處理");
  const poolOpts = pool.map(v=>`<option value="${v.id}">${esc(vidTitle(v))}${v.source?(" ・"+esc(v.source)):""}</option>`).join("");
  const myDoneToday = (STATE.videos||[]).filter(v=>v.editor===me && ["已完成","已上片"].includes(v.stage) && String(v.finishedAt||"").slice(0,10)===today).length;
  const matRow = (v)=>`<tr>
      <td data-label="影片"><a href="javascript:void(0)" onclick="editVideo('${v.id}')">${esc(vidTitle(v))}</a> ${typeTag(v.mainType)}</td>
      <td data-label="片源"><span class="muted">${esc(v.source||"")}</span></td>
      <td data-label=""><button class="btn sm" onclick="finishVid('${v.id}')">完成上架✔</button></td>
    </tr>`;
  const g=scheduleGlance(); const SAFE=15;
  const runCol=g.runway>=SAFE?'var(--green)':(g.runway>=7?'var(--amber)':'var(--red)');
  const numBadge=(n,col)=>`<span style="flex:none;width:54px;height:54px;border-radius:50%;background:${col};color:#fff;font-size:30px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow)">${n}</span>`;
  return `
  <h2>📋 今日工作（${esc(me)}）</h2>

  <div class="card" style="border-left:5px solid var(--accent)">
    <div class="row" style="gap:14px;align-items:center">
      ${numBadge(1,'var(--accent)')}
      <div style="flex:1;min-width:0"><div class="row" style="justify-content:space-between"><b style="font-size:17px">建檔新毛片</b>
        <span class="pill ${pool.length?'ok':'wa'}">待剪庫存 ${pool.length} 支</span></div></div>
    </div>
    <div class="row" style="gap:8px;margin-top:10px">
      <button class="btn" onclick="batchNewFootage()">＋ 批次建檔今天的新毛片</button>
      <button class="btn sec sm" onclick="newSimpleVideo()">單筆新增</button>
    </div>
  </div>

  <div class="card" style="border-left:5px solid var(--accent)">
    <div class="row" style="gap:14px;align-items:center">
      ${numBadge(2,'var(--accent)')}
      <div style="flex:1;min-width:0"><div class="row" style="justify-content:space-between"><b style="font-size:17px">用舊片排滿時段</b>
        <span class="pill" style="border:1px solid ${runCol};color:${runCol};background:none">排程安全 ${g.runway} 天</span></div></div>
    </div>
    <div class="row" style="gap:8px;margin-top:10px">
      <button class="btn" onclick="CUR_TAB='cal';buildNav();render()">📅 去月排程排舊片</button>
    </div>
  </div>

  <div class="card" style="border-left:5px solid var(--green)">
    <div class="row" style="gap:14px;align-items:center">
      ${numBadge(3,'var(--green)')}
      <div style="flex:1;min-width:0"><div class="row" style="justify-content:space-between"><b style="font-size:17px">下拉新毛片開始剪</b>
        <span style="display:flex;gap:6px">
          <span class="pill ok">✔ 今日 ${myDoneToday}</span>
          <span class="pill ${atLimit?'wa':'ok'}">進行中 ${inProg}/3</span></span></div></div>
    </div>
    ${pool.length
      ? `<div class="row" style="gap:8px;margin-top:10px">
           <select id="poolPick" style="flex:1;min-width:160px">${poolOpts}</select>
           <button class="btn" onclick="claimPicked()" ${atLimit?`disabled style="opacity:.5;cursor:not-allowed"`:""}>⬇ 拉下來開始剪</button>
         </div>`
      : ``}
    ${atLimit?`<p class="muted" style="margin:6px 0 0;color:var(--red)">⚠ 已有 3 支進行中</p>`:""}
    <table class="responsive" style="margin-top:12px"><thead><tr><th>我進行中的影片</th><th>片源</th><th></th></tr></thead>
    <tbody>${mine.map(matRow).join("")||`<tr><td class="muted">—</td></tr>`}</tbody></table>
  </div>`;
}
// ① 批次建檔新毛片：一行一支片名，一次建立多支「待剪新片」
function batchNewFootage(){
  showModal("批次建檔新毛片", `
    <label>原始片名（一行一支）</label>
    <textarea id="bf_list" style="min-height:150px" placeholder="劉亦菲紅毯珠寶&#10;八大珠寶派系&#10;真假寶石30秒分辨"></textarea>
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
    await delay(300); toast("已建檔 "+ok+" 支新毛片，可到步驟③開始剪"); return true;
  });
}
function claimVid(id){ write("POST",`/api/videos/${id}/claim`,{},"已認領，加入我的工作"); }
function claimPicked(){ const id=val("poolPick"); if(!id){ toast("請先從清單選一支影片",true); return; } claimVid(id); }
// 上片時間下拉（固定 10/12/16）
function pubTimeSelect(id, cur){ const c=PUB_TIMES.includes(cur)?cur:"10:00";
  return `<select id="${id}">`+PUB_TIMES.map(t=>`<option ${t===c?"selected":""}>${t}</option>`).join("")+`</select>`; }
function finishGate(p){ const platOk=document.querySelectorAll('.'+p+'plat:checked').length>0;
  const ok=val(p+"date")&&val(p+"backup").trim()&&platOk;
  const b=document.getElementById("modalConfirm"); if(b){ b.disabled=!ok; b.style.opacity=ok?"":"0.5"; b.style.cursor=ok?"":"not-allowed"; } }
function finishVid(id){
  const v = vid(id)||{};
  const def = v.scheduledDate || today;
  const defPlat = (Array.isArray(v.platforms)&&v.platforms.length)?v.platforms:postPlatforms().map(p=>p.name); // 預設全部上傳
  showModal("完成上架：填上片資訊", `
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
  `, async ()=>{
    const tags=collectTags("f"); await persistNewTags(tags);
    return await write("POST",`/api/videos/${id}/finish`,
      {name:(val("f_name").trim()||v.rawName||v.name||""), scheduledDate:val("f_date"), publishTime:val("f_time"), tags, subTag:tags[0]||"",
       platforms:collectPlat("f_plat"), products:collectProducts("f"), productUrl:val("f_url").trim(),
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
// 剪輯端輕量新增：填原始片名，建立一支待剪新片（成品標題預設同原始片名）
function newSimpleVideo(){
  showModal("新增待剪新片", `
    <label>原始片名</label><input id="sv_name" placeholder="毛片名稱">
    ${productRows("sv", [])}
  `, async ()=>{
    const name=val("sv_name").trim();
    if(!name){ toast("請輸入原始片名",true); return false; }
    const video={name, rawName:name, products:collectProducts("sv")};
    return await write("POST","/api/videos",{video},"已新增待剪新片");
  });
}

// ===================================================================
// 影片標籤（可複選＋可新增），預設清單存在 settings.videoTags
// ===================================================================
const DEFAULT_TAGS=["新片","舊片","每日寵粉","招商","銷售"];
function videoTags(){ const t=STATE&&STATE.settings&&STATE.settings.videoTags; return (Array.isArray(t)&&t.length)?t:DEFAULT_TAGS; }
function tagChip(id,t,checked){ return `<label style="display:inline-flex;align-items:center;gap:4px;background:var(--panel2);padding:4px 10px;border-radius:14px;cursor:pointer;font-size:13px">
  <input type="checkbox" class="${id}_tag" value="${esc(t)}" ${checked?"checked":""} style="width:auto;margin:0"> ${esc(t)}</label>`; }
function tagPickerHTML(id, selected){ const sel=new Set(selected||[]);
  const all=videoTags().slice(); (selected||[]).forEach(t=>{ if(!all.includes(t)) all.push(t); });
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
function videoItemRich(v){ const dot = v.mainType==="帶貨型"?"var(--sales)":"var(--traffic)";
  const stageCol={"待處理":"#94a3b8","剪輯中":"#d97706","已完成":"var(--green)","已上片":"#2563eb"}[v.stage]||"#94a3b8";
  return `<div class="vrow" onclick="editVideo('${v.id}')">
    <span style="display:flex;align-items:center;gap:8px;min-width:0">
      <span class="light" style="background:${dot};flex:none"></span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(vidTitle(v))}</span></span>
    <span style="display:flex;align-items:center;gap:8px;white-space:nowrap;flex:none">
      <span class="pill" style="font-size:10px;border-color:${stageCol};color:${stageCol}">${esc(v.stage||"")}</span>
      <span class="muted" style="font-size:12px">${esc(v.editor||"")}${v.scheduledDate?(" · "+v.scheduledDate.slice(5)):""}</span></span>
  </div>`; }
let VID_TAGS=new Set();   // 影片庫的標籤篩選（可複選）
function vidRowsHTML(){
  const all=STATE.videos||[];
  const q=(document.getElementById('vid_q')?.value||'').toLowerCase().trim();
  const stage=document.getElementById('vid_stage')?.value||'all';
  let list=all.filter(v=> stage==='all'?true:(v.stage===stage));
  if(q) list=list.filter(v=>String(v.name||v.rawName||'').toLowerCase().includes(q)||String(v.editor||'').toLowerCase().includes(q));
  const total=list.length;
  if(!total) return '<p class="muted">沒有符合的影片</p>';
  const rank={"待處理":0,"剪輯中":1,"已完成":2,"已上片":3};
  const tagsOf=(v)=>{ const arr=[];
    const t=Array.isArray(v.tags)&&v.tags.length?v.tags:(v.subTag?[v.subTag]:[]);
    t.forEach(x=>{ let sx=String(x).trim(); if(!sx) return;
      if(sx==="新片" && pastNewWindow(v)) sx="舊片";
      if(!arr.includes(sx)) arr.push(sx); });
    if(!arr.length) arr.push("（未分類）"); return arr; };
  const groups={};
  list.forEach(v=>{ tagsOf(v).forEach(k=>{ k=String(k).trim()||"（未分類）"; (groups[k]=groups[k]||[]).push(v); }); });
  const tord=(n)=>n==="新片"?0:(n==="舊片"?1:(n.startsWith("（")?9:5));
  let names=Object.keys(groups).sort((a,b)=> tord(a)-tord(b) || String(a).localeCompare(String(b)));
  if(VID_TAGS.size) names=names.filter(n=>VID_TAGS.has(n));
  if(!names.length) return '<p class="muted">沒有符合所選標籤的影片</p>';
  const shownIds=new Set(); names.forEach(n=>groups[n].forEach(v=>shownIds.add(v.id)));
  return names.map(n=>{
    const vs=groups[n].sort((a,b)=>(rank[a.stage]??9)-(rank[b.stage]??9) || String(b.scheduledDate||b.claimedAt||'').localeCompare(String(a.scheduledDate||a.claimedAt||'')));
    return `<details class="vgrp" ${q?'open':''} style="border:1px solid var(--line);border-radius:8px;margin-bottom:8px;padding:4px 10px">
      <summary style="cursor:pointer;font-weight:700;padding:8px 0">🏷 ${esc(n)} <span class="muted" style="font-weight:500;font-size:12px">（${vs.length}）</span></summary>
      <div style="padding-bottom:4px">${vs.map(videoItemRich).join('')}</div>
    </details>`;
  }).join('') + `<p class="muted" style="margin-top:6px;font-size:12px">共 ${VID_TAGS.size?shownIds.size:total} 筆・${names.length} 個標籤</p>`;
}
function vidFilter(){ const el=document.getElementById('vid_list'); if(el) el.innerHTML=vidRowsHTML(); }
function vidTagToggle(t, el){ if(VID_TAGS.has(t)){ VID_TAGS.delete(t); el.classList.add('sec'); } else { VID_TAGS.add(t); el.classList.remove('sec'); } vidFilter(); }
function vidTagClear(){ VID_TAGS.clear(); render(); }
function viewVideos(){
  const all=STATE.videos||[];
  const c=st=>all.filter(v=>v.stage===st).length;
  return `<h2>🎞 影片庫 <span class="muted" style="font-size:13px">依標籤分類・點影片看／改細節</span></h2>
  <div class="card">
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
      <input id="vid_q" placeholder="🔍 搜尋影片名稱／剪輯" oninput="vidFilter()" style="flex:1;min-width:150px">
      <select id="vid_stage" onchange="vidFilter()">
        <option value="all">全部影片（${all.length}）</option>
        <option value="待處理">待處理（${c("待處理")}）</option>
        <option value="剪輯中">剪輯中（${c("剪輯中")}）</option>
        <option value="已完成">已完成（${c("已完成")}）</option>
        <option value="已上片">已上片（${c("已上片")}）</option>
      </select>
      <button class="btn sm" onclick="newSimpleVideo()">＋ 新增影片</button>
    </div>
    <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px">
      <span class="muted" style="font-size:12px">標籤：</span>
      ${videoTags().map(t=>`<button class="btn sm ${VID_TAGS.has(t)?'':'sec'}" onclick="vidTagToggle('${esc(t)}',this)">${esc(t)}</button>`).join("")}
      <a href="javascript:void(0)" onclick="vidTagClear()" class="muted" style="font-size:12px;margin-left:4px">清除篩選</a>
    </div>
    <div id="vid_list" style="margin-top:10px">${vidRowsHTML()}</div>
  </div>`;
}
function editVideo(id){
  const v = vid(id)||{};
  const s=STATE.settings||{};
  const sources=s.sources||["老闆自拍","外部公司"];
  const users=(STATE.users||[]).filter(u=>u.role==="editor").map(u=>u.name);
  const stages=["待處理","剪輯中","已完成","已上片"];
  showModal("編輯影片",`
    <label>編號 ／ 原始片名</label>
    <div class="row" style="gap:8px">
      <input id="e_code" value="${esc(vidCode(v))}" style="flex:none;width:78px;text-align:center" placeholder="編號" oninput="var c=document.getElementById('e_code2');if(c)c.value=this.value">
      <input id="e_raw" value="${esc(v.rawName||"")}" style="flex:1" placeholder="原始片名">
    </div>
    <label>編號 ／ 成品標題名稱（不填則同原始片名）</label>
    <div class="row" style="gap:8px">
      <input id="e_code2" value="${esc(vidCode(v))}" readonly style="flex:none;width:78px;text-align:center;background:var(--panel2)" title="同原片編號">
      <input id="e_name" value="${esc(v.name||"")}" style="flex:1" placeholder="成品標題名稱">
    </div>
    ${tagPickerHTML("e", v.tags||(v.subTag?[v.subTag]:[]))}
    <div class="grid cols2">
      <div><label>片源</label><select id="e_src">${sources.map(c=>`<option ${v.source===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
      <div><label>階段</label><select id="e_stage">${stages.map(c=>`<option ${v.stage===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
    </div>
    <label>剪輯人員</label><select id="e_editor"><option value="">—</option>${users.map(u=>`<option ${v.editor===u?"selected":""}>${esc(u)}</option>`).join("")}</select>
    <label>投放平台（可複選）</label><div style="display:flex;flex-wrap:wrap;gap:6px">${platChips("e_plat", v.platforms)}</div>
    ${productRows("e", v.products)}
    <label>商品頁網址（導購連結用）</label><input id="e_url" value="${esc(v.productUrl||"")}" placeholder="https://www.tzgrotw.tw/products/...">
    <label>預排上片日期</label><input id="e_date" type="date" value="${esc(v.scheduledDate||"")}">
    ${v.productUrl?`<div class="card" style="background:var(--panel2)"><b>🔗 導購連結（依平台，可複製）</b>
      ${(((Array.isArray(v.platforms)&&v.platforms.length)?postPlatforms().filter(p=>v.platforms.includes(p.name)):postPlatforms())).map((p,i)=>`<div style="margin-top:6px"><label style="margin:0 0 2px">${esc(p.name)}</label>
        <div class="row" style="gap:8px"><input id="ev_link_${i}" value="${esc(platformUtm(v.productUrl,p.utm))}" readonly onclick="this.select()" style="flex:1;min-width:180px"><button class="btn sm" type="button" onclick="copyFromInput('ev_link_${i}')">複製</button></div></div>`).join("")}
    </div>`:''}
    <div class="card" style="background:var(--panel2)"><b>🔗 連結</b>
      <label>雲端備份連結</label><input id="e_drive" value="${esc(v.driveFolder||"")}" placeholder="Google Drive / 雲端備份">
      <label>社群平台預排連結</label><input id="e_social" value="${esc(v.socialLink||v.publishedLink||"")}" placeholder="排程工具 / 預約貼文連結">
    </div>
    ${id&&usageList(v).length?`<div class="card" style="background:var(--panel2)"><b>♻ 使用紀錄（共 ${usageList(v).length} 次）</b>
      <table class="responsive"><thead><tr><th>上片日期</th><th>連結</th><th>排片人</th></tr></thead><tbody>
      ${usageList(v).map(u=>`<tr><td data-label="上片日期">${esc(u.date)}</td><td data-label="連結">${u.link?`<a href="${esc(u.link)}" target="_blank">開啟</a>`:'<span class="muted">—</span>'}</td><td data-label="排片人">${esc(u.by||"")}</td></tr>`).join("")}
      </tbody></table></div>`:""}
  `, async ()=>{
    const tags=collectTags("e"); await persistNewTags(tags);
    const mainType = tags.some(t=>String(t).includes("寵粉"))?"寵粉":(tags.some(t=>["帶貨","代理","招商","銷售"].includes(t))?"帶貨型":"流量型");
    const video={code:val("e_code").trim(), rawName:val("e_raw"), name:val("e_name").trim()||val("e_raw").trim(), mainType,tags,subTag:tags[0]||"",
      platforms:collectPlat("e_plat"), products:collectProducts("e"), productUrl:val("e_url").trim(),
      source:val("e_src"),stage:val("e_stage"),editor:val("e_editor"),
      scheduledDate:val("e_date")||null,
      driveFolder:val("e_drive"), publishedLink:val("e_social"), socialLink:val("e_social")};
    const ok=await write("PUT",`/api/videos/${id}`,{video},"已更新影片");
    if(ok) closeModal();
    return ok;
  });
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
