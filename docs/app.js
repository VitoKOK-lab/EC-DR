// ===================================================================
// EC-DR Firebase 版 — 主程式（資料層改接 Firestore，畫面沿用）
// 商業邏輯（排程預警 / KPI 超前落後 / 防疲乏）在前端計算。
// ===================================================================
const ROLE_LABEL = {boss:"老闆", hr:"人資", editor:"剪輯"};
const ROLE_TABS = {
  boss:   [["dash","📊 老闆總覽"],["cal","📅 月排程"],["work","✂️ 我的工作台"],["videos","🎞 影片庫"],["prod","💎 帶貨商品"],["settings","⚙️ 設定"]],
  hr:     [["workload","👥 人員工作量"],["dash","📊 部門總覽"],["cal","📅 月排程"],["videos","🎞 影片庫"]],
  editor: [["work","✂️ 我的工作台"],["cal","📅 月排程"],["videos","🎞 影片庫"]],
};
let STATE = null, DASH = null, CUR_TAB = null, ONLINE = true, LAST_RAW = null;
const today = new Date().toISOString().slice(0,10);

function currentUser(){ return localStorage.getItem("ecdr_user") || ""; }
function setUser(n){ localStorage.setItem("ecdr_user", n); }
function currentRole(){
  const u = (STATE?.users||[]).find(x=>x.name===currentUser());
  return (u && u.role) || localStorage.getItem("ecdr_role") || "editor";
}
function myTabs(){ return ROLE_TABS[currentRole()] || ROLE_TABS.editor; }
function nowIso(){ return new Date().toISOString().slice(0,19); }

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
function newVideoRecord(over){
  const s=STATE.settings||{}; const langs=s.languages||["zh"]; const languages={};
  langs.forEach(lg=> languages[lg]= lg==="zh"?{status:"完成",editor:""}:{status:"未開始",editor:"",driveFolder:""});
  const rec={ id: nextId(STATE.videos,"V"), scheduledDate:null, rawName:"", name:"",
    mainType:(s.mainTypes&&s.mainTypes[0])||"流量型", subTag:"", source:(s.sources&&s.sources[0])||"",
    productId:null, editor:"", stage:"待處理", claimedBy:"",claimedAt:"",assignedBy:"",
    needHelp:false, helpNote:"", scriptStatus:"未開始", languages,
    finishedAt:"", usageHistory:[], totalUsed:0, ctr:0, completionRate:0,
    driveFolder:"", voiceCopy:"", postCopy:"", locked:false };
  return Object.assign(rec, over||{});
}

// ---------- 衍生計算（對應後端 server.py） ----------
function parseDate(s){ s=String(s||"").slice(0,10); const d=new Date(s+"T00:00:00"); return isNaN(d)?null:d; }
function usedInWindow(v, days){
  const cut=new Date(); cut.setDate(cut.getDate()-days); let c=0;
  (v.usageHistory||[]).forEach(d=>{ const dd=parseDate(d); if(dd && dd>=new Date(cut.toISOString().slice(0,10)+"T00:00:00")) c++; });
  return c;
}
function dayScheduledCount(date){ return ((STATE.schedule||{})[date]?.slots||[]).length; }
function dayIsComplete(date){ return dayScheduledCount(date) >= (STATE.settings?.dailyPublishTarget||4); }
function computeWarnings(){
  const horizon=STATE.settings?.scheduleHorizonDays||30; const t=new Date(today+"T00:00:00");
  const em=[], wa=[];
  for(let o=0;o<=horizon;o++){ const d=new Date(t); d.setDate(d.getDate()+o); const ds=d.toISOString().slice(0,10);
    if(dayIsComplete(ds)) continue; (o<=3?em:wa).push(ds); }
  return {emergency:em, warning:wa, horizon};
}
function workdaysBetween(start,end){ if(!start||!end||end<start) return 0; let n=0; const c=new Date(start);
  while(c<=end){ const w=c.getDay(); if(w>=1&&w<=5) n++; c.setDate(c.getDate()+1);} return n; }
function editorNames(){ return (STATE.users||[]).filter(u=>(u.role||"editor")==="editor").map(u=>u.name); }
function finishedOn(v,date){ return ["已完成","已上片"].includes(v.stage) && String(v.finishedAt||"").slice(0,10)===date; }
function finishedInRange(v,start,end){ if(!["已完成","已上片"].includes(v.stage)) return false; const fd=parseDate(v.finishedAt); return !!(fd && fd>=start && fd<=end); }
function computeWorkload(date){
  const s=STATE.settings||{}; const quota=s.editorDailyQuota||3; const tod=parseDate(date)||new Date();
  const wkStart=new Date(tod); wkStart.setDate(tod.getDate()-((tod.getDay()+6)%7));
  const moStart=new Date(tod.getFullYear(),tod.getMonth(),1);
  const kpiStart=parseDate(s.kpiStartDate)||moStart;
  const rows=editorNames().map(name=>{
    const mine=(STATE.videos||[]).filter(v=>v.editor===name||v.claimedBy===name);
    const todayDone=mine.filter(v=>finishedOn(v,date)).length;
    const weekDone=mine.filter(v=>finishedInRange(v,wkStart,tod)).length;
    const monthDone=mine.filter(v=>finishedInRange(v,moStart,tod)).length;
    const totalDone=mine.filter(v=>finishedInRange(v,kpiStart,tod)).length;
    const expected=workdaysBetween(kpiStart,tod)*quota; const diff=totalDone-expected;
    return {name, todayDone, todayQuota:quota, todayMet:todayDone>=quota, weekDone, monthDone,
      totalDone, expected, diff, status: diff>0?"超前":(diff<0?"落後":"達標"),
      inProgress: mine.filter(v=>v.stage==="剪輯中").length};
  }).sort((a,b)=>b.diff-a.diff);
  return {date, quota, kpiStart:kpiStart.toISOString().slice(0,10), rows};
}
function computeDashboard(date){
  const w=computeWarnings(); const s=STATE.settings||{}; const target=s.dailyPublishTarget||4;
  const horizon=s.scheduleHorizonDays||30; const t=new Date(today+"T00:00:00");
  let full=0; for(let o=0;o<horizon;o++){ const d=new Date(t); d.setDate(d.getDate()+o); if(dayIsComplete(d.toISOString().slice(0,10))) full++; }
  const fill=horizon?Math.round(full*100/horizon):0;
  const todayPub=(STATE.videos||[]).filter(v=>v.stage==="已上片" && String(v.scheduledDate||"").slice(0,10)===date).length;
  const help=(STATE.videos||[]).filter(v=>v.needHelp).map(v=>({videoId:v.id, name:v.name||v.rawName, by:v.claimedBy||v.editor, note:v.helpNote||""}));
  const wl=computeWorkload(date); const lagging=wl.rows.filter(r=>r.diff<0).length;
  const langs=(s.languages||[]).filter(l=>l!=="zh");
  const deriv=(STATE.videos||[]).filter(v=>v.languages?.zh?.status==="完成").reduce((acc,v)=>acc+langs.filter(l=>["未開始","二創中"].includes(v.languages?.[l]?.status)).length,0);
  return {date, progress:{
    "排滿率":fill,"排滿天數":full,"視窗天數":horizon,"今日已排":dayScheduledCount(date),"今日已上片":todayPub,"每日目標":target,
    "待處理任務":(STATE.videos||[]).filter(v=>v.stage==="待處理").length,"剪輯中":(STATE.videos||[]).filter(v=>v.stage==="剪輯中").length,
    "落後人數":lagging,"二創待辦":deriv,"本週緊急":w.emergency,"本週警告":w.warning},
    helpList:help, workload:wl};
}
function loadDash(){ DASH=computeDashboard(today); render(); }

// ---------- 寫入：路由（對應後端 _route），改用 window.DB 操作 Firestore ----------
function vidLocal(id){ return (STATE.videos||[]).find(v=>v.id===id); }
function prodLocal(id){ return (STATE.products||[]).find(p=>p.id===id); }
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
    if(method==="PUT"){ await window.DB.update("users", seg[1], {role:body.role}); return; }
    if(method==="DELETE"){ await window.DB.del("users", seg[1]); return; }
  }
  if(head==="products"){
    if(method==="POST"){ const p=Object.assign({}, body.product); p.id=nextId(STATE.products,"P"); await window.DB.set("products",p.id,p); return; }
    if(method==="PUT"){ await window.DB.update("products", seg[1], body.product||{}); return; }
    if(method==="DELETE"){ await window.DB.del("products", seg[1]); return; }
  }
  if(head==="videos"){
    if(method==="POST" && seg.length===1){
      const inc=Object.assign({}, body.video); delete inc.id;
      const v=newVideoRecord(inc); if(v.editor) v.languages.zh.editor=v.editor;
      await window.DB.set("videos", v.id, v); return;
    }
    const id=seg[1], v=vidLocal(id), action=seg[2];
    if(!v && method!=="DELETE") throw new Error("找不到影片");
    if(action==="claim"){ await window.DB.update("videos",id,{claimedBy:user,claimedAt:nowIso(),assignedBy:"",editor:v.editor||user,stage:"剪輯中"}); return; }
    if(action==="assign"){ const a=body.assignee; await window.DB.update("videos",id,{claimedBy:a,editor:a,claimedAt:nowIso(),assignedBy:user,stage:"剪輯中"}); return; }
    if(action==="help"){ await window.DB.update("videos",id,{needHelp:!!body.needHelp, helpNote:body.helpNote||""}); return; }
    if(action==="finish"){
      const ed=v.editor||v.claimedBy||user; const langs=Object.assign({},v.languages); langs.zh=Object.assign({},langs.zh,{status:"完成",editor:ed});
      const patch={stage:"已完成",finishedAt:nowIso(),needHelp:false,editor:ed,languages:langs,locked:true};
      if(body.driveFolder) patch.driveFolder=body.driveFolder; if(body.name) patch.name=body.name;
      await window.DB.update("videos",id,patch); return;
    }
    if(action==="performance"){ await window.DB.update("videos",id,{ctr:body.ctr??v.ctr, completionRate:body.completionRate??v.completionRate}); return; }
    if(action==="lang" && method==="PUT"){ const lg=seg[3]; const langs=Object.assign({},v.languages); langs[lg]=Object.assign({},langs[lg],body.lang||{}); await window.DB.update("videos",id,{languages:langs}); return; }
    if(method==="PUT"){ const patch=Object.assign({}, body.video); delete patch.id; await window.DB.update("videos",id,patch); return; }
    if(method==="DELETE"){ await window.DB.del("videos",id); return; }
  }
  if(head==="schedule"){
    const date=seg[1], sub=seg[2]; const day=(STATE.schedule||{})[date]||{slots:[]}; const slots=(day.slots||[]).slice();
    if(sub==="slot" && method==="POST"){
      const slot=body.slot||{}; const tv=vidLocal(slot.videoId);
      if(tv){ const cap=STATE.settings?.reuseCap||3; if(usedInWindow(tv, STATE.settings?.reuseWindowDays||30)>=cap) throw new Error("此影片 30 天內已達使用上限（"+cap+" 次）"); }
      slots.push(slot); await window.DB.scheduleSet(date,{slots});
      if(tv) await window.DB.update("videos", slot.videoId, {scheduledDate:date}); return;
    }
    if(sub==="slot" && method==="DELETE"){ const idx=parseInt(seg[3]); if(idx<0||idx>=slots.length) throw new Error("索引超出範圍");
      if(slots[idx].locked) throw new Error("此排片已上架鎖定"); slots.splice(idx,1); await window.DB.scheduleSet(date,{slots}); return; }
    if(sub==="publish" && method==="POST"){ const idx=parseInt(body.slotIndex); if(idx<0||idx>=slots.length) throw new Error("索引超出範圍");
      const slot=Object.assign({}, slots[idx]); const base=date.replace(/-/g,"")+"g"+String(idx+1).padStart(2,"0");
      slot.account=base; slot.accounts={}; (slot.platforms||STATE.platforms||[]).forEach(p=>slot.accounts[p]=base+p);
      slot.publishedLink="?utm_source=ecdr&utm_campaign="+base; slot.locked=true; slot.publishedAt=nowIso();
      slots[idx]=slot; await window.DB.scheduleSet(date,{slots});
      const tv=vidLocal(slot.videoId); if(tv){ const uh=(tv.usageHistory||[]).concat([date]);
        await window.DB.update("videos", slot.videoId, {totalUsed:(tv.totalUsed||0)+1, usageHistory:uh, stage:"已上片", scheduledDate:date}); }
      return;
    }
  }
  throw new Error("不支援的操作");
}
function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function write(method, path, body, okMsg){
  try{ await route(method, path, body||{}); await delay(140); if(okMsg) toast(okMsg);
       if(CUR_TAB==="dash"||CUR_TAB==="workload") loadDash(); return true; }
  catch(e){ toast(e.message, true); return false; }
}
async function withAdmin(fn){ const pw=prompt("請輸入管理者密碼："); if(pw===null) return;
  if(String(pw)!==String(STATE.settings?.adminPassword||"1234")){ toast("管理者密碼錯誤",true); return; } return fn(pw); }
async function writeAdmin(method,path,body,okMsg){ return withAdmin(async()=>{ try{ await route(method,path,body||{}); await delay(140); if(okMsg)toast(okMsg); closeModal(); return true; }catch(e){ toast(e.message,true); return false; } }); }
async function writeAdminPw(method,path,body,okMsg){ try{ await route(method,path,body||{}); await delay(140); if(okMsg)toast(okMsg); closeModal(); return true; }catch(e){ toast(e.message,true); return false; } }

// ---------- 登入 / 導覽 ----------
function buildNav(){
  const nav = document.getElementById("nav"); nav.innerHTML="";
  myTabs().forEach(([id,label])=>{
    const b = document.createElement("button"); b.textContent = label; b.dataset.tab = id;
    if(id===CUR_TAB) b.classList.add("active");
    b.onclick = ()=>{ CUR_TAB = id; buildNav(); render(); if(id==="dash"||id==="workload") loadDash(); };
    nav.appendChild(b);
  });
}
function bootLogin(){
  const g = document.getElementById("userGrid"); g.innerHTML = "";
  const users=(STATE?.users)||[];
  if(!users.length){ g.innerHTML = '<p class="muted">尚無成員，請於下方新增第一位（建議先建一位老闆）</p>'; }
  users.forEach(u=>{ const b=document.createElement("button"); b.className="userBtn";
    b.innerHTML = esc(u.name)+'<span class="role">'+(ROLE_LABEL[u.role]||"剪輯")+'</span>';
    b.onclick=()=>{ setUser(u.name); localStorage.setItem("ecdr_role",u.role||"editor"); applyState(LAST_RAW); };
    g.appendChild(b); });
}
async function addUser(){
  const name=document.getElementById("newUserName").value.trim(); const role=document.getElementById("newUserRole").value;
  if(!name) return;
  try{ await route("POST","/api/users",{name,role}); document.getElementById("newUserName").value=""; toast("已新增成員"); }
  catch(e){ toast(e.message,true); }
}
function logout(){ localStorage.removeItem("ecdr_user"); location.reload(); }

// ---------- 狀態套用（Firestore snapshot 進來時呼叫） ----------
function decorate(raw){
  const st=JSON.parse(JSON.stringify(raw));
  const s=st.settings||{}; const win=s.reuseWindowDays||30, cap=s.reuseCap||3;
  (st.videos||[]).forEach(v=>{ const u=usedInWindow(v,win); v.last30dUsed=u; v.light=u>=cap?"red":(u===cap-1?"yellow":"green"); });
  st.platforms = s.platforms || st.platforms || [];
  STATE=st; STATE._warnings=computeWarnings(); return st;
}
function applyState(raw){
  if(!raw) return; LAST_RAW=raw; decorate(raw); DASH=computeDashboard(today);
  const has=(STATE.users||[]).some(u=>u.name===currentUser());
  if(currentUser() && has){
    document.getElementById("login").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("whoName").textContent=currentUser();
    document.getElementById("whoRole").textContent="・"+(ROLE_LABEL[currentRole()]||"");
    if(!CUR_TAB) CUR_TAB=myTabs()[0][0];
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


// ===== 以下畫面函式沿用 Mac mini 版 =====
const esc = s => String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function vid(id){ return (STATE.videos||[]).find(v=>v.id===id); }
function prod(id){ return (STATE.products||[]).find(p=>p.id===id); }
function val(id){ const e=document.getElementById(id); return e?e.value:""; }
function lightDot(l){ return `<span class="light ${l||'green'}"></span>`; }
function typeTag(t){ const c=t==="帶貨型"?"sales":(t==="流量型"?"traffic":""); return `<span class="tag ${c}">${esc(t||"")}</span>`; }
function nonZh(){ return (STATE.settings?.languages||["zh"]).filter(l=>l!=="zh"); }
const LANG_LABEL={zh:"中",en:"英",th:"泰",ms:"馬"};

// ===================================================================
// 畫面路由
// ===================================================================
function render(){
  if(!STATE) return;
  const v = document.getElementById("view");
  const banner = ONLINE ? "" :
    `<div class="card" style="border-color:var(--red)">⚠️ 目前離線，顯示的是最後一次同步的資料（唯讀），連線恢復後會自動更新。</div>`;
  const fn = {
    dash:viewDash, workload:viewWorkload, cal:viewCal, work:viewWork,
    videos:viewVideos, prod:viewProd, settings:viewSettings
  }[CUR_TAB] || (()=>"");
  v.innerHTML = banner + fn();
}

// ---- 老闆／部門 總覽 ----
function viewDash(){
  if(!DASH){ loadDash(); return `<h2>📊 總覽</h2><p class="muted">載入中…</p>`; }
  const p = DASH.progress, wl = DASH.workload||{rows:[]}, help = DASH.helpList||[];
  const userCards = (wl.rows||[]).map(r=>{
    const cls = r.diff>0?"pos":(r.diff<0?"neg":"");
    return `<div class="stat">
      <div class="l">${esc(r.name)}　<span class="${r.todayMet?'pos':'neg'}">今日 ${r.todayDone}/${r.todayQuota}</span></div>
      <div>累計 ${r.totalDone} ／ 應達 ${r.expected}</div>
      <div class="${cls}" style="font-size:13px">${r.diff>0?"超前 +"+r.diff:(r.diff<0?"落後 "+r.diff:"達標")}</div>
    </div>`;
  }).join("") || `<p class="muted">尚無剪輯成員</p>`;
  return `
  <h2>📊 總覽 <span class="muted" style="font-size:13px">${today}</span></h2>
  <div class="grid cols4">
    <div class="stat"><div class="n">${p.排滿率}%</div><div class="l">未來${p.視窗天數}天排滿率</div>
      <div class="progbar"><i style="width:${p.排滿率}%"></i></div></div>
    <div class="stat"><div class="n">${p.今日已排}/${p.每日目標}</div><div class="l">今日已排片</div></div>
    <div class="stat"><div class="n" style="color:${p.落後人數?'var(--red)':'var(--green)'}">${p.落後人數}</div><div class="l">落後人數</div></div>
    <div class="stat"><div class="n">${p.二創待辦}</div><div class="l">多語二創待辦</div></div>
  </div>
  <div class="grid cols4" style="margin-top:12px">
    <div class="stat"><div class="n" style="color:var(--red)">${p.本週緊急.length}</div><div class="l">緊急待排(≤3天)</div></div>
    <div class="stat"><div class="n" style="color:var(--yellow)">${p.本週警告.length}</div><div class="l">警告待排</div></div>
    <div class="stat"><div class="n">${p.待處理任務}</div><div class="l">待處理素材</div></div>
    <div class="stat"><div class="n">${p.剪輯中}</div><div class="l">剪輯中</div></div>
  </div>
  <div class="card" style="margin-top:16px">
    <b>🆘 目前需要支援</b>
    ${help.length?help.map(h=>`<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0">
        <span>${esc(h.name||"")} <span class="muted">(${esc(h.by||"")})</span></span>
        <span class="muted">${esc(h.note||"")}</span></div>`).join(""):`<p class="muted">目前沒有人需要支援 👍</p>`}
  </div>
  <div class="card"><b>👥 每位剪輯 KPI（每日應完成 ${wl.quota||3} 片）</b>
    <div class="grid cols3" style="margin-top:10px">${userCards}</div>
  </div>`;
}

// ---- 人員工作量（人資） ----
function viewWorkload(){
  if(!DASH){ loadDash(); return `<h2>👥 人員工作量</h2><p class="muted">載入中…</p>`; }
  const wl = DASH.workload||{rows:[]};
  const rows = (wl.rows||[]).map(r=>`<tr>
    <td data-label="剪輯師"><b>${esc(r.name)}</b>${r.inProgress?` <span class="muted">(剪輯中 ${r.inProgress})</span>`:""}</td>
    <td data-label="今日"><span class="${r.todayMet?'pos':'neg'}">${r.todayDone}/${r.todayQuota}</span></td>
    <td data-label="本週">${r.weekDone}</td>
    <td data-label="本月">${r.monthDone}</td>
    <td data-label="累計完成">${r.totalDone}</td>
    <td data-label="應達">${r.expected}</td>
    <td data-label="超前/落後"><span class="${r.diff>0?'pos':(r.diff<0?'neg':'')}">${r.diff>0?"超前 +"+r.diff:(r.diff<0?"落後 "+r.diff:"達標")}</span></td>
  </tr>`).join("") || `<tr><td class="muted">尚無剪輯成員</td></tr>`;
  return `<h2>👥 人員工作量 <span class="muted" style="font-size:13px">${today}</span></h2>
  <div class="card">
    <p class="muted">KPI：每位剪輯每日應完成 ${wl.quota||3} 片。累計自 ${wl.kpiStart||""} 起，以工作日（週一~週五）計算應達量。</p>
    <table class="responsive"><thead><tr>
      <th>剪輯師</th><th>今日</th><th>本週</th><th>本月</th><th>累計完成</th><th>應達</th><th>超前/落後</th>
    </tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

// ---- 月排程 ----
let CAL_YM = null;
function viewCal(){
  if(!CAL_YM){ const t=new Date(); CAL_YM=[t.getFullYear(), t.getMonth()]; }
  const [y,m] = CAL_YM;
  const first = new Date(y,m,1), startDow=first.getDay(), days=new Date(y,m+1,0).getDate();
  const w = STATE._warnings||{emergency:[],warning:[]};
  const target = STATE.settings?.dailyPublishTarget||4;
  let cells = "";
  for(let i=0;i<startDow;i++) cells += `<div></div>`;
  for(let d=1;d<=days;d++){
    const ds = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const cnt = ((STATE.schedule||{})[ds]?.slots||[]).length;
    let cls = cnt>=target ? "full" : (w.emergency.includes(ds)?"em":(w.warning.includes(ds)?"wa":""));
    cells += `<div class="day ${cls}" onclick="openDay('${ds}')">
      <div class="dnum">${d}</div>
      <div class="mini">${cnt?`已排 ${cnt}/${target}`:`<span class="muted">未排</span>`}</div>
    </div>`;
  }
  return `
  <h2>📅 月排程 <span class="muted" style="font-size:13px">每日目標 ${target} 片</span></h2>
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
    <p class="muted" style="margin-top:10px">🟢 已排滿(≥${target})　🔴 緊急(≤3天未滿)　🟡 警告(未來一個月內未滿)　點任一天進入排程</p>
  </div>`;
}
function calMove(n){ let [y,m]=CAL_YM; m+=n; if(m<0){m=11;y--;} if(m>11){m=0;y++;} CAL_YM=[y,m]; render(); }

function openDay(ds){
  const day = (STATE.schedule||{})[ds] || {slots:[]};
  const target = STATE.settings?.dailyPublishTarget||4;
  const slotRows = (day.slots||[]).map((s,i)=>{
    const v = vid(s.videoId);
    return `<tr>
      <td data-label="#">${i+1}</td>
      <td data-label="影片">${esc(v?(v.name||v.rawName):(s.videoId||""))} ${v?typeTag(v.mainType):""}</td>
      <td data-label="剪輯">${esc(v?.editor||"")}</td>
      <td data-label="狀態">${s.locked?`<span class="pill ok">已上架 ${esc(s.account||"")}</span>`:`<button class="btn sm" onclick="publishSlot('${ds}',${i})">上架</button>`}</td>
      <td data-label="">${s.locked?"":`<button class="btn sm danger" onclick="delSlot('${ds}',${i})">移除</button>`}</td>
    </tr>`;
  }).join("");
  const cnt = (day.slots||[]).length;
  showModal(`📅 ${ds} 排程（${cnt}/${target}）`, `
    <div class="card"><b>已排影片</b>
      <table class="responsive"><thead><tr><th>#</th><th>影片</th><th>剪輯</th><th>狀態</th><th></th></tr></thead>
      <tbody>${slotRows||`<tr><td class="muted">尚未排片</td></tr>`}</tbody></table>
      ${cnt<target?`<p class="pill wa" style="display:inline-block;margin-top:8px">尚缺 ${target-cnt} 片才達每日目標</p>`:`<p class="pill ok" style="display:inline-block;margin-top:8px">✅ 已達每日目標</p>`}
    </div>
    <div class="card"><b>排入影片</b>
      <p class="muted">從影片庫挑選（依成效排序、含使用次數燈號）</p>
      <button class="btn" onclick="pickVideo('${ds}')">＋ 選片排入</button>
    </div>`, null);
}
function delSlot(ds,i){ write("DELETE",`/api/schedule/${ds}/slot/${i}`,{},"已移除").then(()=>openDay(ds)); }
async function publishSlot(ds,i){
  if(await write("POST",`/api/schedule/${ds}/publish`,{slotIndex:i},"已上架，已產生發片帳號")) openDay(ds);
}
function pickVideo(ds){
  const cap = STATE.settings?.reuseCap||3;
  let list = (STATE.videos||[]).filter(v=>["已完成","已上片"].includes(v.stage)).slice();
  list.sort((a,b)=>(b.ctr||0)-(a.ctr||0) || (b.completionRate||0)-(a.completionRate||0));
  const rows = list.map(v=>{
    const disabled = v.light==="red";
    return `<tr>
      <td data-label="">${lightDot(v.light)}</td>
      <td data-label="影片">${esc(v.name||v.rawName)} ${typeTag(v.mainType)} ${v.subTag?`<span class="tag">${esc(v.subTag)}</span>`:""}</td>
      <td data-label="成效">CTR ${v.ctr||0}% / 完播 ${v.completionRate||0}%</td>
      <td data-label="使用">總 ${v.totalUsed||0}｜30天 ${v.last30dUsed||0}</td>
      <td data-label="">${disabled?`<span class="pill em">已達上限</span>`:`<button class="btn sm" onclick="addSlot('${ds}','${v.id}')">排入 ✅</button>`}</td>
    </tr>`;
  }).join("");
  showModal(`選片排入 ${ds}`, `
    <p class="muted">🟢 可用(<${cap}次)　🟡 剩1次　🔴 已達上限不可選。只列出已完成的影片。</p>
    <table class="responsive"><thead><tr><th></th><th>影片</th><th>成效</th><th>使用次數</th><th></th></tr></thead>
    <tbody>${rows||`<tr><td class="muted">尚無已完成影片，請先到工作台完成影片</td></tr>`}</tbody></table>`, null);
}
async function addSlot(ds,videoId){
  const v = vid(videoId);
  const slot = {videoId, mainType:v?.mainType, productId:v?.productId||null,
                platforms:(STATE.platforms||[]), languages:(STATE.settings?.languages||["zh"])};
  if(await write("POST",`/api/schedule/${ds}/slot`,{slot},"已排入")) openDay(ds);
}

// ---- 我的工作台 ----
function viewWork(){
  const me = currentUser();
  const mine = (STATE.videos||[]).filter(v=>v.claimedBy===me && v.stage==="剪輯中");
  const pool = (STATE.videos||[]).filter(v=>v.stage==="待處理");
  const langs = nonZh();
  const langTasks = (STATE.videos||[]).filter(v=>v.languages?.zh?.status==="完成" &&
      langs.some(l=>["未開始","二創中"].includes(v.languages?.[l]?.status)));
  // 今日 KPI
  const myDoneToday = (STATE.videos||[]).filter(v=>(v.editor===me||v.claimedBy===me) &&
      ["已完成","已上片"].includes(v.stage) && (v.finishedAt||"").slice(0,10)===today).length;
  const quota = STATE.settings?.editorDailyQuota||3;
  const matRow = (v,inPool)=>`<tr>
      <td data-label="影片">${esc(v.name||v.rawName||"(未命名)")} ${typeTag(v.mainType)}${v.subTag?` <span class="tag">${esc(v.subTag)}</span>`:""}</td>
      <td data-label="片源"><span class="muted">${esc(v.source||"")}</span></td>
      <td data-label="負責">${esc(v.claimedBy||"")}${v.needHelp?' <span class="pill em">需支援</span>':""}</td>
      <td data-label="">${inPool
        ? `<button class="btn sm" onclick="claimVid('${v.id}')">我來剪 ✋</button>`
        : `<button class="btn sm" onclick="finishVid('${v.id}')">完成✔</button>
           <button class="btn sm sec" onclick="helpVid('${v.id}',${!v.needHelp})">${v.needHelp?"取消支援":"求支援"}</button>`}
      </td></tr>`;
  return `
  <h2>✂️ 我的工作台（${esc(me)}）</h2>
  <div class="card">
    <div class="row" style="justify-content:space-between">
      <b>今日 KPI</b>
      <span class="pill ${myDoneToday>=quota?'ok':'wa'}">今日完成 ${myDoneToday}/${quota}</span>
    </div>
    <div class="progbar"><i style="width:${Math.min(100,myDoneToday/quota*100)}%"></i></div>
  </div>
  <div class="card">
    <div class="row" style="justify-content:space-between"><b>我進行中的影片</b></div>
    <table class="responsive"><thead><tr><th>影片</th><th>片源</th><th>負責</th><th></th></tr></thead>
    <tbody>${mine.map(v=>matRow(v,false)).join("")||`<tr><td class="muted">沒有進行中的工作，去下方搶單吧</td></tr>`}</tbody></table>
  </div>
  <div class="card">
    <div class="row" style="justify-content:space-between"><b>待處理影片池（可搶單）</b>
      <button class="btn sm" onclick="newVideo()">＋ 新增影片任務</button></div>
    <table class="responsive"><thead><tr><th>影片</th><th>片源</th><th>負責</th><th></th></tr></thead>
    <tbody>${pool.map(v=>matRow(v,true)).join("")||`<tr><td class="muted">沒有待處理影片</td></tr>`}</tbody></table>
  </div>
  <div class="card">
    <b>多語二創待辦（中文母版完成後）</b>
    <table class="responsive"><thead><tr><th>影片</th>${langs.map(l=>`<th>${LANG_LABEL[l]||l}</th>`).join("")}<th></th></tr></thead>
    <tbody>${langTasks.map(v=>`<tr>
      <td data-label="影片">${esc(v.name||v.rawName)}</td>
      ${langs.map(l=>`<td data-label="${LANG_LABEL[l]||l}">${esc(v.languages?.[l]?.status||"未開始")}</td>`).join("")}
      <td data-label="">${langs.map(l=>`<button class="btn sm sec" onclick="langTask('${v.id}','${l}')">認領${LANG_LABEL[l]||l}</button>`).join(" ")}</td>
    </tr>`).join("")||`<tr><td class="muted">沒有待二創的影片</td></tr>`}</tbody></table>
  </div>`;
}
function claimVid(id){ write("POST",`/api/videos/${id}/claim`,{},"已認領，加入我的工作"); }
function finishVid(id){
  const v = vid(id);
  const name = prompt("完成的影片名稱（成品名，可留原名）：", v?.name||v?.rawName||"");
  if(name===null) return;
  const driveFolder = prompt("雲端資料夾連結（可空）：")||"";
  write("POST",`/api/videos/${id}/finish`,{name:name||undefined,driveFolder},"已完成，計入今日 KPI");
}
function helpVid(id,need){
  let note="";
  if(need){ note = prompt("需要什麼支援？簡短說明："); if(note===null) return; }
  write("POST",`/api/videos/${id}/help`,{needHelp:need,helpNote:note}, need?"已標記需要支援":"已取消");
}
function langTask(id,lang){
  write("PUT",`/api/videos/${id}/lang/${lang}`,{lang:{status:"二創中",editor:currentUser()}},"已認領二創任務");
}
function newVideo(){
  const s=STATE.settings||{};
  const mains=s.mainTypes||["流量型","帶貨型"];
  const sources=s.sources||["老闆自拍","外部公司"];
  const subOptions = (mt)=> (s.subTags?.[mt]||[]).map(t=>`<option>${esc(t)}</option>`).join("");
  showModal("新增影片任務", `
    <label>原片（素材／主題）</label><input id="m_raw" placeholder="例：劉亦菲珠寶比較">
    <label>成品名稱（可後補）</label><input id="m_name">
    <div class="grid cols2">
      <div><label>主類別</label><select id="m_main" onchange="document.getElementById('m_sub').innerHTML=window._subOpts(this.value)">${mains.map(c=>`<option>${esc(c)}</option>`).join("")}</select></div>
      <div><label>子標籤</label><select id="m_sub">${subOptions(mains[0])}</select></div>
    </div>
    <div class="grid cols2">
      <div><label>片源</label><select id="m_src">${sources.map(c=>`<option>${esc(c)}</option>`).join("")}</select></div>
      <div><label>預計上片日期（可空）</label><input id="m_date" type="date"></div>
    </div>
    <label>對應帶貨商品（帶貨型用，可空）</label><select id="m_prod"><option value="">— 無 —</option>${(STATE.products||[]).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>
    <label>文案狀態</label><select id="m_script"><option>未開始</option><option>撰寫中</option><option>完成</option></select>
  `, async ()=>{
    const video={rawName:val("m_raw").trim(), name:val("m_name").trim(),
      mainType:val("m_main"), subTag:val("m_sub"), source:val("m_src"),
      scheduledDate:val("m_date")||null, productId:val("m_prod")||null,
      scriptStatus:val("m_script")};
    if(!video.rawName && !video.name){ toast("請輸入原片或成品名稱",true); return false; }
    return await write("POST","/api/videos",{video},"已新增影片任務");
  });
  window._subOpts = subOptions;
}

// ---- 影片庫 ----
function viewVideos(){
  const langs = nonZh();
  const rows=(STATE.videos||[]).map(v=>`<tr>
    <td data-label="">${lightDot(v.light)}</td>
    <td data-label="影片">${esc(v.name||v.rawName||"(未命名)")}</td>
    <td data-label="類別">${typeTag(v.mainType)}${v.subTag?` <span class="tag">${esc(v.subTag)}</span>`:""}</td>
    <td data-label="片源"><span class="muted">${esc(v.source||"")}</span></td>
    <td data-label="階段"><span class="tag">${esc(v.stage||"")}</span></td>
    <td data-label="剪輯">${esc(v.editor||"")}</td>
    <td data-label="文案">${esc(v.scriptStatus||"")}</td>
    <td data-label="二創">${langs.map(l=>`${LANG_LABEL[l]||l}:${esc(v.languages?.[l]?.status||"-")}`).join(" ")}</td>
    <td data-label=""><button class="btn sm sec" onclick="editVideo('${v.id}')">編輯</button></td>
  </tr>`).join("");
  return `<h2>🎞 影片庫</h2>
  <div class="card"><div class="row" style="justify-content:flex-end"><button class="btn sm" onclick="newVideo()">＋ 新增影片任務</button></div>
  <table class="responsive"><thead><tr><th></th><th>影片</th><th>類別</th><th>片源</th><th>階段</th><th>剪輯</th><th>文案</th><th>二創</th><th></th></tr></thead>
  <tbody>${rows||`<tr><td class="muted">尚無影片</td></tr>`}</tbody></table></div>`;
}
function editVideo(id){
  const v = vid(id)||{};
  const s=STATE.settings||{};
  const mains=s.mainTypes||["流量型","帶貨型"];
  const sources=s.sources||["老闆自拍","外部公司"];
  const users=(STATE.users||[]).filter(u=>u.role==="editor").map(u=>u.name);
  const stages=["待處理","剪輯中","已完成","已上片"];
  const subOptions = (mt,cur)=> (s.subTags?.[mt]||[]).map(t=>`<option ${cur===t?"selected":""}>${esc(t)}</option>`).join("");
  showModal("編輯影片",`
    <label>原片</label><input id="e_raw" value="${esc(v.rawName||"")}">
    <label>成品名稱</label><input id="e_name" value="${esc(v.name||"")}">
    <div class="grid cols2">
      <div><label>主類別</label><select id="e_main" onchange="document.getElementById('e_sub').innerHTML=window._subOpts2(this.value)">${mains.map(c=>`<option ${v.mainType===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
      <div><label>子標籤</label><select id="e_sub">${subOptions(v.mainType||mains[0], v.subTag)}</select></div>
    </div>
    <div class="grid cols2">
      <div><label>片源</label><select id="e_src">${sources.map(c=>`<option ${v.source===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
      <div><label>階段</label><select id="e_stage">${stages.map(c=>`<option ${v.stage===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
    </div>
    <div class="grid cols2">
      <div><label>剪輯人員</label><select id="e_editor"><option value="">—</option>${users.map(u=>`<option ${v.editor===u?"selected":""}>${esc(u)}</option>`).join("")}</select></div>
      <div><label>文案狀態</label><select id="e_script">${["未開始","撰寫中","完成"].map(c=>`<option ${v.scriptStatus===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
    </div>
    <label>預計上片日期</label><input id="e_date" type="date" value="${esc(v.scheduledDate||"")}">
    <div class="grid cols2">
      <div><label>CTR (%)</label><input type="number" step="0.1" id="e_ctr" value="${v.ctr||0}"></div>
      <div><label>完播率 (%)</label><input type="number" step="0.1" id="e_comp" value="${v.completionRate||0}"></div>
    </div>
    <label>雲端資料夾</label><input id="e_drive" value="${esc(v.driveFolder||"")}">
    ${id?`<p class="muted">使用次數：總 ${v.totalUsed||0}／30天內 ${v.last30dUsed||0}　完成時間：${esc(v.finishedAt||"-")}</p>`:""}
  `, async ()=>{
    const video={rawName:val("e_raw"),name:val("e_name"),mainType:val("e_main"),subTag:val("e_sub"),
      source:val("e_src"),stage:val("e_stage"),editor:val("e_editor"),scriptStatus:val("e_script"),
      scheduledDate:val("e_date")||null,ctr:parseFloat(val("e_ctr"))||0,completionRate:parseFloat(val("e_comp"))||0,
      driveFolder:val("e_drive")};
    return await writeAdmin("PUT",`/api/videos/${id}`,{video},"已更新影片");
  });
  window._subOpts2 = (mt)=>subOptions(mt,"");
}

// ---- 帶貨商品庫 ----
function viewProd(){
  const rows=(STATE.products||[]).map(p=>`<tr>
    <td data-label="編號">${esc(p.id)}</td>
    <td data-label="商品">${esc(p.name)} ${p.nickname?`<span class="muted">(${esc(p.nickname)})</span>`:""}</td>
    <td data-label="價格">${esc(p.priceRange||"")}</td>
    <td data-label="狀態"><span class="tag">${esc(p.status||"")}</span></td>
    <td data-label="連結">${p.shoplineLink?`<a href="${esc(p.shoplineLink)}" target="_blank">SHOPLINE</a>`:""}</td>
    <td data-label="">${`<button class="btn sm sec" onclick="editProd('${p.id}')">編輯</button>`}</td>
  </tr>`).join("");
  return `<h2>💎 帶貨商品庫</h2>
  <div class="card"><div class="row" style="justify-content:flex-end"><button class="btn sm" onclick="editProd()">＋ 新增商品</button></div>
  <table class="responsive"><thead><tr><th>編號</th><th>商品</th><th>價格</th><th>狀態</th><th>連結</th><th></th></tr></thead>
  <tbody>${rows||`<tr><td class="muted">尚無商品</td></tr>`}</tbody></table></div>`;
}
function editProd(id){
  const p = id?prod(id):{};
  showModal(id?"編輯商品":"新增商品",`
    <label>商品名稱</label><input id="p_name" value="${esc(p.name||"")}">
    <label>內部簡稱</label><input id="p_nick" value="${esc(p.nickname||"")}">
    <label>SHOPLINE 連結</label><input id="p_link" value="${esc(p.shoplineLink||"")}">
    <label>關鍵字（逗號分隔）</label><input id="p_kw" value="${esc((p.keywords||[]).join(","))}">
    <label>價錢範圍</label><input id="p_price" value="${esc(p.priceRange||"")}">
    <label>雲端資料夾</label><input id="p_drive" value="${esc(p.driveFolder||"")}">
    <label>發布文案</label><textarea id="p_copy">${esc(p.postCopy||"")}</textarea>
    <label>狀態</label><select id="p_status"><option ${p.status==="可上架"?"selected":""}>可上架</option><option ${p.status==="待確認"?"selected":""}>待確認</option></select>
  `, async ()=>{
    const product={name:val("p_name"),nickname:val("p_nick"),shoplineLink:val("p_link"),
      keywords:val("p_kw").split(",").map(x=>x.trim()).filter(Boolean),
      priceRange:val("p_price"),driveFolder:val("p_drive"),postCopy:val("p_copy"),status:val("p_status")};
    if(!product.name){ toast("請輸入商品名稱",true); return false; }
    if(id) return await writeAdmin("PUT",`/api/products/${id}`,{product},"已更新商品");
    return await write("POST","/api/products",{product},"已新增商品");
  });
}

// ---- 設定（管理者） ----
function viewSettings(){
  const s=STATE.settings||{};
  const subStr = Object.entries(s.subTags||{}).map(([k,arr])=>`${k}:${(arr||[]).join("|")}`).join("\n");
  return `<h2>⚙️ 設定（修改需管理者密碼）</h2>
  <div class="card"><div class="grid cols3">
    <div><label>每日應上片數</label><input type="number" id="set_pub" value="${s.dailyPublishTarget||4}"></div>
    <div><label>每位剪輯每日配額</label><input type="number" id="set_quota" value="${s.editorDailyQuota||3}"></div>
    <div><label>預排天數（一個月）</label><input type="number" id="set_horizon" value="${s.scheduleHorizonDays||30}"></div>
  </div>
  <label>KPI 累計基準日</label><input type="date" id="set_kpistart" value="${esc(s.kpiStartDate||"")}"></div>
  <div class="card"><b>主類別</b>（逗號分隔）
    <input id="set_main" value="${esc((s.mainTypes||[]).join(","))}"></div>
  <div class="card"><b>子標籤</b>（每行一個主類別，格式 主類別:標籤1|標籤2）
    <textarea id="set_sub">${esc(subStr)}</textarea></div>
  <div class="card"><b>片源</b>（逗號分隔）
    <input id="set_src" value="${esc((s.sources||[]).join(","))}"></div>
  <div class="card"><b>語言（二創）</b>（逗號分隔，zh 為母版）
    <input id="set_langs" value="${esc((s.languages||[]).join(","))}"></div>
  <div class="card"><b>平台清單</b>
    <input id="set_plat" value="${esc((STATE.platforms||[]).join(","))}"></div>
  <div class="card"><div class="grid cols3">
    <div><label>30天使用上限</label><input type="number" id="set_cap" value="${s.reuseCap||3}"></div>
    <div><label>疲乏視窗(天)</label><input type="number" id="set_win" value="${s.reuseWindowDays||30}"></div>
    <div><label>異地備份資料夾</label><input id="set_offsite" value="${esc(s.offsiteBackupDir||"")}"></div>
  </div></div>
  <div class="card"><b>變更管理者密碼</b>
    <input id="set_pw" type="text" placeholder="留空則不變更"></div>
  <div class="modalFoot"><button class="btn" onclick="saveSettings()">確認送出設定（需密碼）</button></div>`;
}
async function saveSettings(){
  const subTags={};
  val("set_sub").split("\n").forEach(line=>{
    const i=line.indexOf(":"); if(i<0) return;
    const k=line.slice(0,i).trim(); const arr=line.slice(i+1).split("|").map(x=>x.trim()).filter(Boolean);
    if(k) subTags[k]=arr;
  });
  const settings={
    dailyPublishTarget:parseInt(val("set_pub"))||4,
    editorDailyQuota:parseInt(val("set_quota"))||3,
    scheduleHorizonDays:parseInt(val("set_horizon"))||30,
    kpiStartDate:val("set_kpistart")||undefined,
    mainTypes:val("set_main").split(",").map(x=>x.trim()).filter(Boolean),
    subTags,
    sources:val("set_src").split(",").map(x=>x.trim()).filter(Boolean),
    languages:val("set_langs").split(",").map(x=>x.trim()).filter(Boolean),
    platforms:val("set_plat").split(",").map(x=>x.trim()).filter(Boolean),
    reuseCap:parseInt(val("set_cap"))||3, reuseWindowDays:parseInt(val("set_win"))||30,
    offsiteBackupDir:val("set_offsite")
  };
  const pw=val("set_pw"); if(pw) settings.adminPassword=pw;
  withAdmin(async (adminPassword)=>{
    await writeAdminPw("PUT","/api/settings",{settings,adminPassword},"已更新設定");
  });
}

// ===================================================================
// 管理者寫入輔助
// ===================================================================

// ===================================================================
// 彈窗 / 小工具
// ===================================================================
function showModal(title, inner, onConfirm){
  const root=document.getElementById("modalRoot");
  root.innerHTML=`<div class="modal"><div class="box">
    <h3>${esc(title)}</h3>${inner}
    <div class="modalFoot">
      <button class="btn sec" onclick="closeModal()">取消</button>
      ${onConfirm?`<button class="btn" id="modalConfirm">確認送出</button>`:""}
    </div></div></div>`;
  if(onConfirm){ document.getElementById("modalConfirm").onclick=async()=>{ const r=await onConfirm(); if(r!==false) closeModal(); }; }
}
function closeModal(){ document.getElementById("modalRoot").innerHTML=""; }
