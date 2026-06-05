// ===================================================================
// EC-DR Firebase 版 — 主程式（資料層改接 Firestore，畫面沿用）
// 商業邏輯（排程預警 / KPI 超前落後 / 防疲乏）在前端計算。
// ===================================================================
const ROLE_LABEL = {boss:"管理員", hr:"人資", editor:"剪輯"};
const ROLE_TABS = {
  boss:   [["dash","📊 總覽"],["cal","📅 月排程"],["work","✂️ 我的工作台"],["videos","🎞 影片庫"],["prod","💎 帶貨商品"],["settings","⚙️ 設定"]],
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
function ownerName(){ return (STATE && STATE.settings && STATE.settings.ownerName) || "Vito"; }
function myTabs(){ const t=(ROLE_TABS[currentRole()]||ROLE_TABS.editor).slice();
  if(currentUser()===ownerName()){ t.push(["members","👥 成員管理"]); t.push(["audit","🛡 稽核紀錄"]); } return t; }
function nowIso(){ return new Date().toISOString().slice(0,19); }
function deviceId(){ let id=localStorage.getItem("ecdr_device");
  if(!id){ id="dev-"+Math.random().toString(36).slice(2,8)+Date.now().toString(36); localStorage.setItem("ecdr_device",id); }
  return id; }

// ---------- 語言別（多語分軌排程） ----------
const SCHED_LANGS = ["zh","en","th"];
let CUR_LANG = null;
function myUser(){ return (STATE&&STATE.users||[]).find(x=>x.name===currentUser()); }
function myLang(){ const u=myUser();
  if(!u) return (localStorage.getItem("ecdr_role")==="boss")?"all":"zh";
  if(u.role!=="editor") return "all";          // 管理員/人資看全部
  return u.lang||"zh"; }
function canAllLang(){ return myLang()==="all"; }
function curLang(){ if(!CUR_LANG){ const l=myLang(); CUR_LANG=(l==="all")?"zh":l; } return CUR_LANG; }
function setLang(l){ CUR_LANG=l; render(); }
// 角色標籤 ↔ {role, lang}
function roleInfo(label){ const s=String(label||"").trim().toLowerCase();
  if(/管理員|老闆|boss|ceo|顧問|consultant/.test(s)) return {role:"boss",lang:"all"};
  if(/人資|hr/.test(s)) return {role:"hr",lang:"all"};
  if(/英語|英文|english|^en$/.test(s)) return {role:"editor",lang:"en"};
  if(/泰語|泰文|thai|^th$/.test(s)) return {role:"editor",lang:"th"};
  if(/全語言|all/.test(s)) return {role:"editor",lang:"all"};
  return {role:"editor",lang:"zh"}; }
function memberLabel(u){ if(u.role==="boss") return "管理員"; if(u.role==="hr") return "人資";
  return ({zh:"中文剪輯",en:"英語剪輯",th:"泰語剪輯",all:"全語言剪輯"})[u.lang||"zh"]; }
// 我目前進行中的影片數（跨語言）
function myInProgressCount(){ const me=currentUser();
  let n=(STATE.videos||[]).filter(v=>v.stage==="剪輯中"&&(v.claimedBy===me||v.editor===me)).length;
  SCHED_LANGS.filter(l=>l!=="zh").forEach(l=>{ n+=(STATE.videos||[]).filter(v=>v.languages?.[l]?.status==="二創中"&&v.languages?.[l]?.claimedBy===me).length; });
  return n; }
// 某語言「在某日上片」的影片
function dayLangList(date,lang){
  if(lang==="zh") return dayVideoList(date);
  return (STATE.videos||[]).filter(v=>v.languages?.[lang]?.status==="完成" && v.languages?.[lang]?.scheduledDate===date)
    .map(v=>({videoId:v.id, fromVideo:true, lang}));
}
function dayLangCount(date,lang){ return dayLangList(date,lang).length; }
// 某語言、某人、某日是否完成一支
function langFinishedOn(v,lg,name,date){
  if(lg==="zh") return v.editor===name && ["已完成","已上片"].includes(v.stage) && String(v.finishedAt||"").slice(0,10)===date;
  const L=v.languages?.[lg]; return !!(L && L.editor===name && L.status==="完成" && String(L.finishedAt||"").slice(0,10)===date); }
function langFinishedInRange(v,lg,name,s,e){
  if(lg==="zh"){ if(!(v.editor===name && ["已完成","已上片"].includes(v.stage))) return false; const fd=parseDate(v.finishedAt); return !!(fd&&fd>=s&&fd<=e); }
  const L=v.languages?.[lg]; if(!(L&&L.editor===name&&L.status==="完成")) return false; const fd=parseDate(L.finishedAt); return !!(fd&&fd>=s&&fd<=e); }

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
// 某日的影片 = 手動排片(slots) ∪ 已完成且上片日=該日的影片（去重）
function dayVideoList(date){
  const seen=new Set(); const out=[];
  ((STATE.schedule||{})[date]?.slots||[]).forEach(s=>{ if(s.videoId && !seen.has(s.videoId)){ seen.add(s.videoId); out.push({videoId:s.videoId, slot:s}); } });
  (STATE.videos||[]).forEach(v=>{ if(v.scheduledDate===date && ["已完成","已上片"].includes(v.stage) && !seen.has(v.id)){ seen.add(v.id); out.push({videoId:v.id, fromVideo:true}); } });
  return out;
}
function dayScheduledCount(date){ return dayVideoList(date).length; }
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
// 每位成員可有自己的每日 KPI 支數；沒設就用全域預設
function userQuota(name){ const u=(STATE.users||[]).find(x=>x.name===name);
  if(u && u.dailyQuota!=null && u.dailyQuota!=="") return Number(u.dailyQuota)||0;  // 0 視為有效（無 KPI）
  return STATE.settings?.editorDailyQuota||3; }
function finishedOn(v,date){ return ["已完成","已上片"].includes(v.stage) && String(v.finishedAt||"").slice(0,10)===date; }
function finishedInRange(v,start,end){ if(!["已完成","已上片"].includes(v.stage)) return false; const fd=parseDate(v.finishedAt); return !!(fd && fd>=start && fd<=end); }
// 績效以「月」為單位累積、每月自動重置（從當月 1 號到今天的工作日 × 配額為應達量）
function computeWorkload(date){
  const s=STATE.settings||{}; const tod=parseDate(date)||new Date();
  const wkStart=new Date(tod); wkStart.setDate(tod.getDate()-((tod.getDay()+6)%7));
  const moStart=new Date(tod.getFullYear(),tod.getMonth(),1);
  const editors=(STATE.users||[]).filter(u=>(u.role||"editor")==="editor");
  const rows=editors.map(u=>{
    const name=u.name; const q=userQuota(name);
    const langs=(u.lang==="all")?SCHED_LANGS:[u.lang||"zh"];
    const cnt=(pred)=> (STATE.videos||[]).reduce((n,v)=> n + (langs.some(lg=>pred(v,lg,name))?1:0), 0);
    const todayDone=cnt((v,lg,nm)=>langFinishedOn(v,lg,nm,date));
    const weekDone =cnt((v,lg,nm)=>langFinishedInRange(v,lg,nm,wkStart,tod));
    const monthDone=cnt((v,lg,nm)=>langFinishedInRange(v,lg,nm,moStart,tod));
    const expected=workdaysBetween(moStart,tod)*q; const diff=monthDone-expected;
    return {name, lang:u.lang||"zh", todayDone, todayQuota:q, todayMet:todayDone>=q, weekDone, monthDone,
      totalDone:monthDone, expected, diff, status: diff>0?"超前":(diff<0?"落後":"達標"),
      inProgress: 0};
  }).sort((a,b)=>b.diff-a.diff);
  return {date, quota:(s.editorDailyQuota||3), monthStart:moStart.toISOString().slice(0,10), rows};
}
function computeDashboard(date){
  const w=computeWarnings(); const s=STATE.settings||{}; const target=s.dailyPublishTarget||4;
  const horizon=s.scheduleHorizonDays||30; const t=new Date(today+"T00:00:00");
  let full=0, runway=0, broke=false; const filled=[];
  for(let o=0;o<horizon;o++){ const d=new Date(t); d.setDate(d.getDate()+o); const ds=d.toISOString().slice(0,10);
    if(dayIsComplete(ds)){ full++; filled.push(ds); if(!broke) runway++; } else { broke=true; } }
  const fill=horizon?Math.round(full*100/horizon):0;
  const todayPub=(STATE.videos||[]).filter(v=>v.stage==="已上片" && String(v.scheduledDate||"").slice(0,10)===date).length;
  const help=(STATE.videos||[]).filter(v=>v.needHelp).map(v=>({videoId:v.id, name:v.name||v.rawName, by:v.claimedBy||v.editor, note:v.helpNote||""}));
  const wl=computeWorkload(date); const lagging=wl.rows.filter(r=>r.diff<0).length;
  const langs=(s.languages||[]).filter(l=>l!=="zh");
  const deriv=(STATE.videos||[]).filter(v=>v.languages?.zh?.status==="完成").reduce((acc,v)=>acc+langs.filter(l=>["未開始","二創中"].includes(v.languages?.[l]?.status)).length,0);
  return {date, progress:{
    "排滿率":fill,"排滿天數":full,"安全天數":runway,"已排滿日期":filled,"視窗天數":horizon,
    "今日已排":dayScheduledCount(date),"今日已上片":todayPub,"每日目標":target,
    "待處理任務":(STATE.videos||[]).filter(v=>v.stage==="待處理").length,"剪輯中":(STATE.videos||[]).filter(v=>v.stage==="剪輯中").length,
    "落後人數":lagging,"二創待辦":deriv,"本週緊急":w.emergency,"本週警告":w.warning},
    helpList:help, workload:wl};
}
function loadDash(){ DASH=computeDashboard(today); render(); }

// ---------- 寫入：路由（對應後端 _route），改用 window.DB 操作 Firestore ----------
function vidLocal(id){ return (STATE.videos||[]).find(v=>v.id===id); }
function prodLocal(id){ return (STATE.products||[]).find(p=>p.id===id); }
function segOf(path){ return path.split("/").filter(Boolean).slice(1); } // 去掉 'api'
// 對外的 route：執行寫入後寫一筆稽核紀錄（誰／哪台裝置／做了什麼）
async function route(method, path, body){
  const res = await _route(method, path, body);
  try{ if(window.DB && window.DB.addAudit){
    await window.DB.addAudit({ ts: nowIso(), user: currentUser()||"?", deviceId: deviceId(), action: method+" "+path });
  } }catch(e){ /* 稽核失敗不影響主動作 */ }
  return res;
}
async function _route(method, path, body){
  if(!window.DB) throw new Error("尚未連線，請稍候");
  const seg=segOf(path), head=seg[0], user=currentUser();
  if(head==="settings" && method==="PUT"){ await window.DB.setSettings(body.settings||{}); return; }
  if(head==="users"){
    if(method==="POST"){ const name=(body.name||"").trim(), role=body.role||"editor";
      if(!name) throw new Error("請輸入名稱");
      if((STATE.users||[]).some(u=>u.name===name)) throw new Error("名稱已存在");
      const doc={name, role, lang:body.lang||"all", isDefault:false}; if(body.dailyQuota!=null) doc.dailyQuota=Number(body.dailyQuota)||0;
      await window.DB.set("users", name, doc); return; }
    if(method==="PUT"){ const patch={}; if(body.role!=null) patch.role=body.role; if(body.lang!=null) patch.lang=body.lang;
      if(body.dailyQuota!=null) patch.dailyQuota=Number(body.dailyQuota)||0;
      await window.DB.update("users", seg[1], patch); return; }
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
    if(action==="claim"){
      const inprog=(STATE.videos||[]).filter(x=>x.stage==="剪輯中" && (x.claimedBy===user||x.editor===user)).length;
      if(inprog>=3) throw new Error("你進行中的影片已達 3 片上限，請先完成其中一片再認領");
      await window.DB.update("videos",id,{claimedBy:user,claimedAt:nowIso(),assignedBy:"",editor:v.editor||user,stage:"剪輯中"}); return; }
    if(action==="assign"){ const a=body.assignee;
      const inprog=(STATE.videos||[]).filter(x=>x.stage==="剪輯中" && (x.claimedBy===a||x.editor===a)).length;
      if(inprog>=3) throw new Error(a+" 進行中的影片已達 3 片上限");
      await window.DB.update("videos",id,{claimedBy:a,editor:a,claimedAt:nowIso(),assignedBy:user,stage:"剪輯中"}); return; }
    if(action==="help"){ await window.DB.update("videos",id,{needHelp:!!body.needHelp, helpNote:body.helpNote||""}); return; }
    if(action==="finish"){
      const date=body.scheduledDate; if(!date) throw new Error("請選擇上片日期");
      if(!(body.published && body.backupDone && body.socialScheduled)) throw new Error("需確認：已上架、已上傳雲端備份、社群平台已預排");
      const ed=v.editor||v.claimedBy||user; const langs=Object.assign({},v.languages); langs.zh=Object.assign({},langs.zh,{status:"完成",editor:ed});
      const patch={stage:"已完成",finishedAt:nowIso(),needHelp:false,editor:ed,languages:langs,locked:true,
        scheduledDate:date, published:true, backupDone:true, socialScheduled:true};
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
    b.onclick = ()=>{ CUR_TAB = id; buildNav(); render(); if(id==="dash"||id==="workload") loadDash(); if(id==="audit"){ AUDIT=null; loadAudit(); } };
    nav.appendChild(b);
  });
}
function bootLogin(){
  const g = document.getElementById("userGrid"); g.innerHTML = "";
  const users=(STATE?.users)||[];
  if(!users.length){ g.innerHTML = '<p class="muted">尚無成員，請按下方「🔒 管理員登入」進入後新增</p>'; }
  users.forEach(u=>{ const b=document.createElement("button"); b.className="userBtn";
    b.innerHTML = esc(u.name)+'<span class="role">'+(ROLE_LABEL[u.role]||"剪輯")+'</span>';
    b.onclick=()=>{ setUser(u.name); localStorage.setItem("ecdr_role",u.role||"editor"); CUR_LANG=null; CUR_TAB=null; applyState(LAST_RAW); };
    g.appendChild(b); });
}
// 管理員（owner）以密碼進入；成員管理／稽核只有這條路徑能看到
function ownerLogin(){
  if(!STATE){ toast("連線中，請稍候再試",true); return; }
  const pw=prompt("管理員密碼："); if(pw===null) return;
  if(String(pw)!==String(STATE.settings?.adminPassword||"1234")){ toast("密碼錯誤",true); return; }
  setUser(ownerName()); localStorage.setItem("ecdr_role","boss"); CUR_LANG=null; CUR_TAB=null; applyState(LAST_RAW);
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
    videos:viewVideos, prod:viewProd, settings:viewSettings, members:viewMembers, audit:viewAudit
  }[CUR_TAB] || (()=>"");
  v.innerHTML = banner + fn();
}

// ---- 總覽 ----
function viewDash(){
  if(!DASH){ loadDash(); return `<h2>📊 總覽</h2><p class="muted">載入中…</p>`; }
  const p = DASH.progress, wl = DASH.workload||{rows:[]}, help = DASH.helpList||[];
  const runway = p.安全天數||0;
  const filled = (p.已排滿日期||[]);
  const ahead = (wl.rows||[]).filter(r=>r.diff>0);
  const behind = (wl.rows||[]).filter(r=>r.diff<0);
  const userCards = (wl.rows||[]).map(r=>{
    const cls = r.diff>0?"pos":(r.diff<0?"neg":"");
    return `<div class="stat">
      <div class="l">${esc(r.name)}　<span class="${r.todayMet?'pos':'neg'}">今日 ${r.todayDone}/${r.todayQuota}</span></div>
      <div>本月完成 ${r.totalDone} ／ 應達 ${r.expected}</div>
      <div class="${cls}" style="font-size:13px">${r.diff>0?"超前 +"+r.diff:(r.diff<0?"落後 "+r.diff:"達標")}</div>
    </div>`;
  }).join("") || `<p class="muted">尚無剪輯成員</p>`;
  return `
  <h2>📊 總覽 <span class="muted" style="font-size:13px">${today}</span></h2>

  <div class="card" style="border-color:${runway>=3?'var(--green)':'var(--red)'}">
    <div class="row" style="gap:28px;align-items:flex-end">
      <div><div class="n" style="font-size:34px;color:${runway>=3?'var(--green)':'var(--red)'}">${runway}</div>
        <div class="l">安全天數（從今天起連續已排滿的天數）</div></div>
      <div style="flex:1">
        <div class="l">已完成／預排的日期</div>
        <div style="margin-top:6px">${filled.length?filled.slice(0,14).map(d=>`<span class="tag" style="margin:2px">${d.slice(5)}</span>`).join(""):`<span class="muted">尚無已排滿的日期</span>`}</div>
      </div>
    </div>
    ${runway<3?`<p class="pill em" style="display:inline-block;margin-top:10px">⚠ 安全天數不足 3 天，請盡快補排！</p>`:`<p class="pill ok" style="display:inline-block;margin-top:10px">✅ 排程安全</p>`}
  </div>

  <div class="card">
    <b>🏃 進度提示</b>
    <div class="grid cols2" style="margin-top:8px">
      <div><div class="l pos">超前的人</div>${ahead.length?ahead.map(r=>`<div class="pos">${esc(r.name)}　+${r.diff}</div>`).join(""):`<div class="muted">—</div>`}</div>
      <div><div class="l neg">落後的人</div>${behind.length?behind.map(r=>`<div class="neg">${esc(r.name)}　${r.diff}</div>`).join(""):`<div class="muted">大家都跟上了 👍</div>`}</div>
    </div>
    <p class="muted" style="margin-top:8px">績效以「月」為單位累積、每月 1 號自動重置。</p>
  </div>

  <div class="grid cols4">
    <div class="stat"><div class="n">${p.今日已排}/${p.每日目標}</div><div class="l">今日已排片</div></div>
    <div class="stat"><div class="n">${p.排滿率}%</div><div class="l">未來${p.視窗天數}天排滿率</div>
      <div class="progbar"><i style="width:${p.排滿率}%"></i></div></div>
    <div class="stat"><div class="n">${p.待處理任務}</div><div class="l">未處理片源</div></div>
    <div class="stat"><div class="n">${p.剪輯中}</div><div class="l">剪輯中</div></div>
  </div>

  <div class="card" style="margin-top:16px">
    <b>🆘 目前需要支援</b>
    ${help.length?help.map(h=>`<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0">
        <span>${esc(h.name||"")} <span class="muted">(${esc(h.by||"")})</span></span>
        <span class="muted">${esc(h.note||"")}</span></div>`).join(""):`<p class="muted">目前沒有人需要支援 👍</p>`}
  </div>
  <div class="card"><b>👥 每位剪輯本月 KPI（每日應完成 ${wl.quota||3} 片）</b>
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
    <p class="muted">KPI：每位剪輯每日應完成 ${wl.quota||3} 片。績效以「月」為單位累積，每月 1 號（${wl.monthStart||""}）自動重置，以工作日（週一~週五）計算應達量。</p>
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
  const lang = curLang(); const isZh=(lang==="zh");
  let cells = "";
  for(let i=0;i<startDow;i++) cells += `<div></div>`;
  for(let d=1;d<=days;d++){
    const ds = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const cnt = dayLangCount(ds, lang);
    let cls = isZh ? (cnt>=target ? "full" : (w.emergency.includes(ds)?"em":(w.warning.includes(ds)?"wa":"")))
                   : (cnt>0 ? "full" : "");
    cells += `<div class="day ${cls}" onclick="openDay('${ds}')">
      <div class="dnum">${d}</div>
      <div class="mini">${cnt?(isZh?`已排 ${cnt}/${target}`:`${cnt} 片`):`<span class="muted">未排</span>`}</div>
    </div>`;
  }
  const switcher = canAllLang()
    ? `<div class="row" style="gap:6px"><span class="muted">語言：</span>${SCHED_LANGS.map(l=>`<button class="btn sm ${l===lang?'':'sec'}" onclick="setLang('${l}')">${LANG_LABEL[l]||l}</button>`).join("")}</div>`
    : `<span class="muted">語言：<b>${LANG_LABEL[lang]||lang}</b></span>`;
  return `
  <h2>📅 月排程（${LANG_LABEL[lang]||lang}）</h2>
  ${switcher}
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
    <p class="muted" style="margin-top:10px">${isZh?`🟢 已排滿(≥${target})　🔴 緊急(≤3天未滿)　🟡 警告(未來一個月內未滿)`:`🟢 當日有${LANG_LABEL[lang]||lang}影片`}　點任一天查看</p>
  </div>`;
}
function calMove(n){ let [y,m]=CAL_YM; m+=n; if(m<0){m=11;y--;} if(m>11){m=0;y++;} CAL_YM=[y,m]; render(); }

function openDay(ds){
  const target = STATE.settings?.dailyPublishTarget||4;
  const lang = curLang(); const isZh=(lang==="zh");
  const list = dayLangList(ds, lang);
  const rows = list.map((it,i)=>{
    const v = vid(it.videoId); const s=it.slot;
    const ed = isZh ? (v?.editor||"") : (v?.languages?.[lang]?.editor||"");
    const statusCell = it.fromVideo
      ? `<span class="pill ok">已完成上片</span>`
      : (s&&s.locked?`<span class="pill ok">已上架 ${esc(s.account||"")}</span>`:`<button class="btn sm" onclick="publishSlot('${ds}',${i})">上架</button>`);
    const removeCell = it.fromVideo
      ? (isZh?`<button class="btn sm danger" onclick="unscheduleVid('${it.videoId}','${ds}')">移出此日</button>`
             :`<button class="btn sm danger" onclick="unscheduleLang('${it.videoId}','${lang}','${ds}')">移出此日</button>`)
      : (s&&s.locked?"":`<button class="btn sm danger" onclick="delSlot('${ds}',${i})">移除</button>`);
    return `<tr>
      <td data-label="#">${i+1}</td>
      <td data-label="影片"><a href="javascript:void(0)" onclick="editVideo('${it.videoId}')">${esc(v?(v.name||v.rawName):(it.videoId||""))}</a> ${v?typeTag(v.mainType):""}</td>
      <td data-label="剪輯">${esc(ed)}</td>
      <td data-label="狀態">${statusCell}</td>
      <td data-label="">${removeCell}</td>
    </tr>`;
  }).join("");
  const cnt = list.length;
  showModal(`📅 ${ds}（${LANG_LABEL[lang]||lang}）`, `
    <div class="card"><b>當日影片</b>
      <table class="responsive"><thead><tr><th>#</th><th>影片</th><th>剪輯</th><th>狀態</th><th></th></tr></thead>
      <tbody>${rows||`<tr><td class="muted">當日尚無影片</td></tr>`}</tbody></table>
      ${isZh?(cnt<target?`<p class="pill wa" style="display:inline-block;margin-top:8px">尚缺 ${target-cnt} 片才達每日目標</p>`:`<p class="pill ok" style="display:inline-block;margin-top:8px">✅ 已達每日目標</p>`):""}
    </div>
    ${isZh?`<div class="card"><b>手動排入（重播舊片）</b>
      <button class="btn" onclick="pickVideo('${ds}')">＋ 選片排入</button></div>`:`<p class="muted">${LANG_LABEL[lang]||lang}影片由該語言剪輯「完成」時選定上片日期，會自動出現在這裡。</p>`}`, null);
}
function unscheduleLang(id,lang,ds){ if(!confirm("把這支影片移出"+(LANG_LABEL[lang]||lang)+"此日？")) return;
  const v=vid(id); const L=Object.assign({}, v?.languages?.[lang]||{}); L.scheduledDate=null;
  write("PUT",`/api/videos/${id}/lang/${lang}`,{lang:L},"已移出此日").then(ok=>{ if(ok) openDay(ds); }); }
function delSlot(ds,i){ write("DELETE",`/api/schedule/${ds}/slot/${i}`,{},"已移除").then(()=>openDay(ds)); }
function unscheduleVid(id,ds){ if(!confirm("把這支影片移出此日（清除上片日期）？")) return;
  write("PUT",`/api/videos/${id}`,{video:{scheduledDate:null}},"已移出此日").then(ok=>{ if(ok) openDay(ds); }); }
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

// ---- 我的工作台（依語言別） ----
function viewWork(){
  const me = currentUser(); const lang = curLang(); const isZh = (lang==="zh");
  const quota = userQuota(me); const atLimit = myInProgressCount()>=3;
  // 今日完成（依語言）
  const myDoneToday = (STATE.videos||[]).filter(v=>langFinishedOn(v,lang,me,today)).length;
  // 進行中 / 待處理（依語言）
  let mine, pool;
  if(isZh){
    mine = (STATE.videos||[]).filter(v=>(v.claimedBy===me||v.editor===me) && v.stage==="剪輯中");
    pool = (STATE.videos||[]).filter(v=>v.stage==="待處理");
  }else{
    mine = (STATE.videos||[]).filter(v=>v.languages?.[lang]?.status==="二創中" && v.languages?.[lang]?.claimedBy===me);
    pool = (STATE.videos||[]).filter(v=>v.languages?.zh?.status==="完成" &&
            (!v.languages?.[lang] || !v.languages?.[lang]?.status || v.languages?.[lang]?.status==="未開始"));
  }
  const owner = v => isZh ? (v.claimedBy||"") : (v.languages?.[lang]?.claimedBy||"");
  const matRow = (v,inPool)=>`<tr>
      <td data-label="影片"><a href="javascript:void(0)" onclick="editVideo('${v.id}')">${esc(v.name||v.rawName||"(未命名)")}</a> ${typeTag(v.mainType)}</td>
      <td data-label="片源"><span class="muted">${esc(v.source||"")}</span></td>
      <td data-label="負責">${esc(owner(v))}</td>
      <td data-label="">${inPool
        ? `<button class="btn sm" onclick="${isZh?`claimVid('${v.id}')`:`claimLang('${v.id}','${lang}')`}" ${atLimit?"disabled style=\"opacity:.5\"":""}>我來做</button>`
        : `<button class="btn sm" onclick="${isZh?`finishVid('${v.id}')`:`finishLang('${v.id}','${lang}')`}">完成✔</button>
           ${isZh?`<button class="btn sm sec" onclick="helpVid('${v.id}',${!v.needHelp})">${v.needHelp?"取消支援":"求支援"}</button>`:""}`}
      </td></tr>`;
  const switcher = canAllLang()
    ? `<div class="row" style="gap:6px;margin-bottom:10px"><span class="muted">語言：</span>${SCHED_LANGS.map(l=>`<button class="btn sm ${l===lang?'':'sec'}" onclick="setLang('${l}')">${LANG_LABEL[l]||l}</button>`).join("")}</div>`
    : `<p class="muted" style="margin-bottom:8px">你的語言：<b>${LANG_LABEL[lang]||lang}</b>（只處理此語言）</p>`;
  return `
  <h2>✂️ 我的工作台（${esc(me)}）</h2>
  ${switcher}
  <div class="card">
    <div class="row" style="justify-content:space-between">
      <b>今日 KPI（${LANG_LABEL[lang]||lang}）</b>
      <span class="pill ${myDoneToday>=quota?'ok':'wa'}">今日完成 ${myDoneToday}/${quota}</span>
    </div>
    <div class="progbar"><i style="width:${quota?Math.min(100,myDoneToday/quota*100):100}%"></i></div>
  </div>
  <div class="card">
    <div class="row" style="justify-content:space-between"><b>我進行中的影片（${myInProgressCount()}/3）</b>
      ${atLimit?`<span class="pill wa">已達 3 片上限，先完成再認領</span>`:""}</div>
    <table class="responsive"><thead><tr><th>影片</th><th>片源</th><th>負責</th><th></th></tr></thead>
    <tbody>${mine.map(v=>matRow(v,false)).join("")||`<tr><td class="muted">目前沒有進行中的影片，可從下方認領</td></tr>`}</tbody></table>
  </div>
  <div class="card">
    <div class="row" style="justify-content:space-between"><b>${isZh?"未處理片源":"待二創（"+(LANG_LABEL[lang]||lang)+"）"}</b>
      ${isZh?`<button class="btn sm" onclick="newVideo()">＋ 新增片源</button>`:""}</div>
    <table class="responsive"><thead><tr><th>影片</th><th>片源</th><th>負責</th><th></th></tr></thead>
    <tbody>${pool.map(v=>matRow(v,true)).join("")||`<tr><td class="muted">${isZh?"目前沒有未處理片源":"目前沒有待二創的影片（要中文母版先完成）"}</td></tr>`}</tbody></table>
  </div>`;
}
function claimVid(id){ write("POST",`/api/videos/${id}/claim`,{},"已認領，加入我的工作"); }
function claimLang(id,lang){
  if(myInProgressCount()>=3){ toast("你進行中的影片已達 3 片上限",true); return; }
  write("PUT",`/api/videos/${id}/lang/${lang}`,{lang:{status:"二創中",editor:currentUser(),claimedBy:currentUser()}},"已認領 "+(LANG_LABEL[lang]||lang)+" 二創");
}
function finishLang(id,lang){
  const v=vid(id)||{}; const L=v.languages?.[lang]||{}; const def=L.scheduledDate||today;
  showModal("完成"+(LANG_LABEL[lang]||lang)+"二創：填上片資訊", `
    <label>${LANG_LABEL[lang]||lang}雲端備份連結（可空）</label><input id="fl_drive" value="${esc(L.driveFolder||"")}">
    <label>上片日期（會顯示在${LANG_LABEL[lang]||lang}行事曆）</label><input id="fl_date" type="date" value="${esc(def)}">
    <div class="card" style="background:var(--panel2);margin-top:10px">
      <label style="color:var(--txt)"><input type="checkbox" id="fl_pub" style="width:auto"> 已上架</label>
      <label style="color:var(--txt)"><input type="checkbox" id="fl_backup" style="width:auto"> 已上傳雲端備份</label>
      <label style="color:var(--txt)"><input type="checkbox" id="fl_social" style="width:auto"> 社群平台已預排</label>
    </div>
    <p class="muted">三項都勾選並選好上片日期，才能標記完成。</p>
  `, async ()=>{
    const date=val("fl_date");
    const pub=document.getElementById("fl_pub").checked, bk=document.getElementById("fl_backup").checked, so=document.getElementById("fl_social").checked;
    if(!date){ toast("請選擇上片日期",true); return false; }
    if(!(pub&&bk&&so)){ toast("三項條件都要勾選才算完成",true); return false; }
    return await write("PUT",`/api/videos/${id}/lang/${lang}`,
      {lang:{status:"完成", finishedAt:nowIso(), scheduledDate:date, editor:currentUser(),
             claimedBy:currentUser(), driveFolder:val("fl_drive")}}, "已完成，已加入"+(LANG_LABEL[lang]||lang)+"行事曆");
  });
}
function finishVid(id){
  const v = vid(id)||{};
  const def = v.scheduledDate || today;
  showModal("完成影片：填上片資訊", `
    <label>成品名稱</label><input id="f_name" value="${esc(v.name||v.rawName||"")}">
    <label>上片日期（會顯示在月行事曆）</label><input id="f_date" type="date" value="${esc(def)}">
    <label>雲端備份連結（可空）</label><input id="f_drive" value="${esc(v.driveFolder||"")}">
    <div class="card" style="background:var(--panel2);margin-top:10px">
      <label style="color:var(--txt)"><input type="checkbox" id="f_pub" style="width:auto"> 已上架</label>
      <label style="color:var(--txt)"><input type="checkbox" id="f_backup" style="width:auto"> 已上傳雲端備份</label>
      <label style="color:var(--txt)"><input type="checkbox" id="f_social" style="width:auto"> 社群平台已預排</label>
    </div>
    <p class="muted">三項都勾選並選好上片日期，才能標記完成。</p>
  `, async ()=>{
    const date=val("f_date");
    const pub=document.getElementById("f_pub").checked,
          bk=document.getElementById("f_backup").checked,
          so=document.getElementById("f_social").checked;
    if(!date){ toast("請選擇上片日期",true); return false; }
    if(!(pub&&bk&&so)){ toast("三項條件都要勾選才算完成",true); return false; }
    return await write("POST",`/api/videos/${id}/finish`,
      {name:val("f_name")||undefined, scheduledDate:date, driveFolder:val("f_drive"),
       published:true, backupDone:true, socialScheduled:true}, "已完成，已加入月行事曆");
  });
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
    <td data-label="影片"><a href="javascript:void(0)" onclick="editVideo('${v.id}')">${esc(v.name||v.rawName||"(未命名)")}</a></td>
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
    <label>中文上片日期</label><input id="e_date" type="date" value="${esc(v.scheduledDate||"")}">
    <div class="card" style="background:var(--panel2)"><b>🔗 連結</b>
      <label>雲端備份連結</label><input id="e_drive" value="${esc(v.driveFolder||"")}" placeholder="Google Drive / 雲端備份">
      <label>上架／發布連結</label><input id="e_pub" value="${esc(v.publishedLink||"")}" placeholder="社群貼文 / 上架網址">
    </div>
    <div class="card" style="background:var(--panel2)"><b>🌐 多語版本（連結＋上片日期）</b>
      ${nonZh().map(l=>{ const L=v.languages?.[l]||{}; return `
        <div class="grid cols2" style="align-items:end">
          <div><label>${LANG_LABEL[l]||l} 連結　<span class="muted">(${esc(L.status||"未開始")}${L.editor?(" · "+esc(L.editor)):""})</span></label>
            <input id="e_l_drive_${l}" value="${esc(L.driveFolder||"")}"></div>
          <div><label>${LANG_LABEL[l]||l} 上片日期</label><input id="e_l_date_${l}" type="date" value="${esc(L.scheduledDate||"")}"></div>
        </div>`; }).join("")}
    </div>
    <div class="grid cols2">
      <div><label>CTR (%)</label><input type="number" step="0.1" id="e_ctr" value="${v.ctr||0}"></div>
      <div><label>完播率 (%)</label><input type="number" step="0.1" id="e_comp" value="${v.completionRate||0}"></div>
    </div>
    ${id?`<p class="muted">完成時間：${esc(v.finishedAt||"-")}</p>`:""}
  `, async ()=>{
    const langsPatch=Object.assign({}, v.languages||{});
    nonZh().forEach(l=>{ const cur=Object.assign({}, langsPatch[l]||{});
      cur.driveFolder=val("e_l_drive_"+l); const d=val("e_l_date_"+l); cur.scheduledDate=d||null;
      langsPatch[l]=cur; });
    const video={rawName:val("e_raw"),name:val("e_name"),mainType:val("e_main"),subTag:val("e_sub"),
      source:val("e_src"),stage:val("e_stage"),editor:val("e_editor"),scriptStatus:val("e_script"),
      scheduledDate:val("e_date")||null,ctr:parseFloat(val("e_ctr"))||0,completionRate:parseFloat(val("e_comp"))||0,
      driveFolder:val("e_drive"), publishedLink:val("e_pub"), languages:langsPatch};
    const ok=await write("PUT",`/api/videos/${id}`,{video},"已更新影片");
    if(ok) closeModal(); return ok;
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
  <div class="card"><b>異地備份資料夾</b>（選填）
    <input id="set_offsite" value="${esc(s.offsiteBackupDir||"")}"></div>
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

// ===================================================================
// 成員管理（只有 owner，預設 Vito 看得到此頁）
// ===================================================================
function roleCode(s){ s=String(s||"").trim().toLowerCase();
  const m={"老闆":"boss","管理員":"boss","boss":"boss","ceo":"boss","顧問":"boss","consultant":"boss",
           "人資":"hr","hr":"hr","剪輯":"editor","editor":"editor"};
  return m[s]||m[String(s)]||"editor"; }
const ROLE_TOKENS=[["boss","管理員"],["hr","人資"],["editor:zh","中文剪輯"],["editor:en","英語剪輯"],["editor:th","泰語剪輯"],["editor:all","全語言剪輯"]];
function userToken(u){ return u.role==="boss"?"boss":(u.role==="hr"?"hr":("editor:"+(u.lang||"zh"))); }
function viewMembers(){
  const users=STATE.users||[];
  const defQ=STATE.settings?.editorDailyQuota||3;
  const rows=users.map(u=>`<tr>
    <td data-label="名字"><b>${esc(u.name)}</b></td>
    <td data-label="角色">
      <select onchange="changeRole('${esc(u.name)}',this.value)">
        ${ROLE_TOKENS.map(([tk,lb])=>`<option value="${tk}" ${userToken(u)===tk?"selected":""}>${lb}</option>`).join("")}
      </select></td>
    <td data-label="每日KPI"><input type="number" min="0" style="width:70px" value="${u.dailyQuota||defQ}" onchange="changeQuota('${esc(u.name)}',this.value)"> 片</td>
    <td data-label=""><button class="btn sm danger" onclick="delMember('${esc(u.name)}')">刪除</button></td>
  </tr>`).join("");
  return `<h2>👥 成員管理 <span class="muted" style="font-size:13px">（限管理員）</span></h2>
  <div class="card"><b>現有成員（${users.length}）</b>
    <table class="responsive"><thead><tr><th>名字</th><th>角色／語言</th><th>每日KPI</th><th></th></tr></thead>
    <tbody>${rows||`<tr><td class="muted">尚無成員</td></tr>`}</tbody></table>
    <p class="muted">語言剪輯只看自己語言的行事曆；全語言剪輯可看全部。「每日KPI」每人可不同。改角色／KPI／刪除需管理者密碼。</p>
  </div>
  <div class="card"><b>新增單一成員</b>
    <div class="grid cols4">
      <div><label>名字</label><input id="mb_name"></div>
      <div><label>角色／語言</label><select id="mb_role">${ROLE_TOKENS.map(([tk,lb])=>`<option value="${tk}" ${tk==="editor:zh"?"selected":""}>${lb}</option>`).join("")}</select></div>
      <div><label>每日KPI支數</label><input id="mb_quota" type="number" min="0" value="${defQ}"></div>
      <div style="display:flex;align-items:flex-end"><button class="btn" onclick="addMember()">新增</button></div>
    </div>
  </div>
  <div class="card"><b>批次新增</b>（每行一位，格式 <code>名字,角色,每日KPI</code>；KPI 可省略，省略就用預設 ${defQ}）
    <textarea id="mb_bulk" style="min-height:185px">Regina,管理員
Vito,管理員
Benny,人資
健加,中文剪輯,3
鴻閔,中文剪輯,3
芋頭,中文剪輯,3
怡如,中文剪輯,3
艾斯姆,英語剪輯,0
玲玲,泰語剪輯,0
test,全語言剪輯,0</textarea>
    <div class="modalFoot"><button class="btn" onclick="bulkAdd()">批次建立</button></div>
    <p class="muted">已存在的名字會自動略過，可重複按。</p>
  </div>
  <div class="card"><b>匯入舊 Excel 工作</b>
    <p class="muted">把之前 Google 試算表的影片工作（共 ${ (window.LEGACY_SEED||[]).length } 筆）一次匯入影片庫。已完成的會帶上片日期、顯示在月行事曆。</p>
    <button class="btn" onclick="importLegacy()">📥 匯入舊工作（${ (window.LEGACY_SEED||[]).length } 筆）</button>
  </div>`;
}
async function importLegacy(){
  const seed=window.LEGACY_SEED||[];
  if(!seed.length){ toast("找不到匯入資料",true); return; }
  if(!confirm("將匯入 "+seed.length+" 筆舊工作到影片庫，確定？")) return;
  let ok=0, fail=0;
  for(const r of seed){
    try{ await route("POST","/api/videos",{video:r}); ok++; }
    catch(e){ fail++; }
  }
  await delay(400); toast("匯入完成：成功 "+ok+" 筆"+(fail?("，失敗 "+fail):"")+"。請到影片庫／月排程查看");
}
function tokenToRL(tk){ const [role,lang]=String(tk||"editor:zh").split(":"); return {role, lang: role==="editor"?(lang||"zh"):"all"}; }
async function addMember(){ const name=val("mb_name").trim(); const rl=tokenToRL(val("mb_role")); const dailyQuota=parseInt(val("mb_quota"))||0;
  if(!name){ toast("請輸入名字",true); return; }
  await write("POST","/api/users",{name,role:rl.role,lang:rl.lang,dailyQuota},"已新增成員"); }
function changeRole(name,token){ const rl=tokenToRL(token); writeAdmin("PUT","/api/users/"+name,{role:rl.role,lang:rl.lang},"已更新角色／語言"); }
function changeQuota(name,q){ writeAdmin("PUT","/api/users/"+name,{dailyQuota:parseInt(q)||0},"已更新每日 KPI"); }
function delMember(name){ if(!confirm("確定刪除成員「"+name+"」？")) return;
  writeAdmin("DELETE","/api/users/"+name,{},"已刪除成員"); }
async function bulkAdd(){
  const lines=val("mb_bulk").split("\n").map(l=>l.trim()).filter(Boolean);
  let ok=0, skip=0;
  for(const line of lines){ const parts=line.split(/[,，]/); const name=(parts[0]||"").trim();
    if(!name) continue;
    const ri=roleInfo(parts[1]); const q=parseInt((parts[2]||"").trim())||0;
    try{ await route("POST","/api/users",{name, role:ri.role, lang:ri.lang, dailyQuota:q}); ok++; }
    catch(e){ skip++; } }
  await delay(250); toast("批次完成：新增 "+ok+" 位，略過 "+skip+" 位");
}

// ===================================================================
// 稽核紀錄（只有 owner 看得到）：誰、哪台裝置、做了什麼
// ===================================================================
let AUDIT=null;
async function loadAudit(){ try{ AUDIT = (window.DB&&window.DB.recentAudit)? await window.DB.recentAudit(300) : []; }catch(e){ AUDIT=[]; } render(); }
function humanAction(a){
  const m=(a.action||""); const seg=m.split(" ")[1]||""; const p=seg.split("/").filter(Boolean).slice(1);
  const id=p[1]||""; const act=p[2]||"";
  if(p[0]==="videos"){ if(m.startsWith("POST /api/videos ")||(p.length===1&&m.startsWith("POST"))) return "新增影片";
    if(act==="claim") return "認領影片 "+id; if(act==="assign") return "指派影片 "+id;
    if(act==="finish") return "完成影片 "+id; if(act==="help") return "求支援 "+id;
    if(act==="lang") return "更新二創 "+id; if(m.startsWith("PUT")) return "編輯影片 "+id;
    if(m.startsWith("DELETE")) return "刪除影片 "+id; return "影片 "+id; }
  if(p[0]==="schedule"){ if(act==="publish") return "上架 "+(p[1]||""); if(act==="slot"&&m.startsWith("POST")) return "排入影片 "+(p[1]||"");
    if(act==="slot"&&m.startsWith("DELETE")) return "移除排片 "+(p[1]||""); return "排程 "+(p[1]||""); }
  if(p[0]==="products"){ if(m.startsWith("POST")) return "新增商品"; if(m.startsWith("PUT")) return "編輯商品 "+id; if(m.startsWith("DELETE")) return "刪除商品 "+id; }
  if(p[0]==="users"){ if(m.startsWith("POST")) return "新增成員"; if(m.startsWith("PUT")) return "改成員角色 "+id; if(m.startsWith("DELETE")) return "刪除成員 "+id; }
  if(p[0]==="settings") return "變更設定";
  return m;
}
function viewAudit(){
  if(!AUDIT){ loadAudit(); return `<h2>🛡 稽核紀錄</h2><p class="muted">載入中…</p>`; }
  // 同一裝置用過哪些名字（>1 即標記）
  const byDev={}; AUDIT.forEach(a=>{ (byDev[a.deviceId]=byDev[a.deviceId]||new Set()).add(a.user); });
  const shared=Object.entries(byDev).filter(([d,s])=>s.size>1);
  const sharedHtml = shared.length
    ? shared.map(([d,s])=>`<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0">
        <span class="neg">⚠ 同一台裝置出現多個身分</span>
        <span>${[...s].map(esc).join("、")} <span class="muted">(${esc((d||"").slice(0,12))}…)</span></span></div>`).join("")
    : `<p class="pill ok">✅ 沒有發現同一裝置跨身分操作</p>`;
  const rows=AUDIT.slice(0,250).map(a=>`<tr>
    <td data-label="時間">${esc((a.ts||"").replace("T"," "))}</td>
    <td data-label="操作者"><b>${esc(a.user)}</b></td>
    <td data-label="裝置"><span class="muted">${esc((a.deviceId||"").slice(0,12))}</span></td>
    <td data-label="動作">${esc(humanAction(a))}</td>
  </tr>`).join("");
  return `<h2>🛡 稽核紀錄 <span class="muted" style="font-size:13px">最近 ${AUDIT.length} 筆　<a href="javascript:void(0)" onclick="loadAudit()">🔄重新整理</a></span></h2>
  <div class="card"><b>裝置／身分檢查</b>
    <p class="muted">每台裝置（瀏覽器）第一次使用會有固定代碼。若同一台裝置用了不同人的名字去操作，就會在這裡標紅——代表可能有人登了別人的帳號。</p>
    ${sharedHtml}
  </div>
  <div class="card"><b>操作明細</b>
    <table class="responsive"><thead><tr><th>時間</th><th>操作者</th><th>裝置</th><th>動作</th></tr></thead>
    <tbody>${rows||`<tr><td class="muted">尚無紀錄</td></tr>`}</tbody></table>
  </div>`;
}
