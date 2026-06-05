// ===================================================================
// EC-DR Firebase 版 — 主程式（資料層改接 Firestore，畫面沿用）
// 商業邏輯（排程預警 / KPI 超前落後 / 防疲乏）在前端計算。
// ===================================================================
const ROLE_LABEL = {boss:"管理員", hr:"人資", editor:"剪輯"};
const ROLE_TABS = {
  boss:   [["dash","📊 總覽"],["workload","👥 人員KPI"],["work","✂️ 我的工作台"],["videos","🎞 影片庫"],["settings","⚙️ 設定"]],
  hr:     [["workload","👥 人員KPI"],["dash","📊 部門總覽"]],
  editor: [["work","✂️ 我的工作台"],["mine","📊 我的儀表板"],["workload","👥 人員KPI"],["cal","📅 月排程"],["videos","🎞 影片庫"]],
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
// 領取→完成 耗時（含跨天）
function durationMin(a,b){ const s=new Date(a), e=new Date(b||nowIso()); if(isNaN(s)||isNaN(e)||e<s) return null; return Math.round((e-s)/60000); }
function durationText(a,b){ const m=durationMin(a,b); return minToText(m); }
function minToText(m){ if(m==null) return "-";
  const d=Math.floor(m/1440), h=Math.floor((m%1440)/60), mi=m%60;
  return (d?d+"天":"")+(h?h+"時":"")+mi+"分"; }

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
// 每日類型配額與寵粉(週五六)規則
function isPamperedDay(date){ return new Date(date+"T00:00:00").getDay()===5; } // 週五
// 當日各類型最低數量：平日 流量3/帶貨1；週五 流量2/寵粉3
function dayTargets(date){
  const s=STATE.settings||{};
  if(isPamperedDay(date)) return s.fridayTargets || {"流量型":2,"寵粉":3};
  return s.typeTargets || {"流量型":3,"帶貨型":1};
}
function daySum(date){ const t=dayTargets(date); return Object.values(t).reduce((a,b)=>a+(b||0),0); }
function dayBreakdown(date){
  const list=dayLangList(date,"zh"); const cnt={"流量型":0,"帶貨型":0,"寵粉":0};
  list.forEach(it=>{ const v=vid(it.videoId); if(!v) return;
    const isP=v.mainType==="寵粉"||String(v.subTag||"").includes("寵粉")||v.pampered;
    if(isP) cnt["寵粉"]++; else if(v.mainType==="流量型") cnt["流量型"]++; else cnt["帶貨型"]++; });
  const tg=dayTargets(date); const deficits={};
  Object.keys(tg).forEach(k=>{ const d=Math.max(0,(tg[k]||0)-(cnt[k]||0)); if(d>0) deficits[k]=d; });
  const target=daySum(date); const total=list.length;
  const needPampered=(tg["寵粉"]||0)>cnt["寵粉"];
  const full = Object.keys(deficits).length===0 && total>=target;
  return {total, target, byType:cnt, deficits, pampered:cnt["寵粉"], needPampered, full, targets:tg};
}
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
function dayIsComplete(date){ return dayScheduledCount(date) >= daySum(date); }
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
  // 起算日：本月 1 號與「KPI 起算日」取較晚者（避免上線前的日子被算）
  const ks=parseDate(s.kpiStartDate);
  const periodStart=(ks && ks>moStart)?ks:moStart;
  // 應完成只算「已過完」的工作日（不含今天），上線當天大家=0/0 達標
  const yesterday=new Date(tod); yesterday.setDate(tod.getDate()-1);
  const editors=(STATE.users||[]).filter(u=>(u.role||"editor")==="editor");
  const rows=editors.map(u=>{
    const name=u.name; const q=userQuota(name);
    const langs=(u.lang==="all")?SCHED_LANGS:[u.lang||"zh"];
    const cnt=(pred)=> (STATE.videos||[]).reduce((n,v)=> n + (langs.some(lg=>pred(v,lg,name))?1:0), 0);
    const todayDone=cnt((v,lg,nm)=>langFinishedOn(v,lg,nm,date));
    const weekDone =cnt((v,lg,nm)=>langFinishedInRange(v,lg,nm,wkStart,tod));
    const monthDone=cnt((v,lg,nm)=>langFinishedInRange(v,lg,nm,periodStart,tod));      // 含今天(顯示用)
    const doneYday =cnt((v,lg,nm)=>langFinishedInRange(v,lg,nm,periodStart,yesterday)); // 到前一日(達標判斷)
    // 平均工時（本期已完成且有計時者）
    const durs=[];
    (STATE.videos||[]).forEach(v=>langs.forEach(lg=>{ if(langFinishedInRange(v,lg,name,periodStart,tod)){
      const dm = lg==="zh"? v.durationMin : v.languages?.[lg]?.durationMin;
      if(dm!=null && dm>=0) durs.push(dm); } }));
    const avgMin = durs.length? Math.round(durs.reduce((a,b)=>a+b,0)/durs.length) : null;
    const maxMin = durs.length? Math.max(...durs) : null;
    // 達標/超前/落後：算到「前一日」的累積 vs 應達（今天先不算）
    const expected=workdaysBetween(periodStart,yesterday)*q; const diff=doneYday-expected;
    // 近 7 天每日完成數（舊→新）
    const last7=[]; for(let i=6;i>=0;i--){ const d=new Date(tod); d.setDate(tod.getDate()-i); const ds=d.toISOString().slice(0,10);
      last7.push({date:ds, n:(STATE.videos||[]).reduce((a,v)=>a+(langs.some(lg=>langFinishedOn(v,lg,name,ds))?1:0),0)}); }
    const last7Sum=last7.reduce((a,b)=>a+b.n,0);
    return {name, lang:u.lang||"zh", todayDone, todayQuota:q, todayMet:todayDone>=q, weekDone, monthDone, doneYday,
      totalDone:doneYday, expected, diff, status: diff>0?"超前":(diff<0?"落後":"達標"),
      avgMin, maxMin, timedCount:durs.length, last7, last7Sum, inProgress: 0};
  }).sort((a,b)=>b.diff-a.diff);
  return {date, quota:(s.editorDailyQuota||3), periodStart:periodStart.toISOString().slice(0,10),
          monthStart:periodStart.toISOString().slice(0,10), rows};
}
function computeDashboard(date){
  const w=computeWarnings(); const s=STATE.settings||{}; const target=daySum(date);
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
      if(v.claimedAt) patch.durationMin=durationMin(v.claimedAt, patch.finishedAt);
      if(body.driveFolder) patch.driveFolder=body.driveFolder; if(body.name) patch.name=body.name;
      if(body.publishedLink) patch.publishedLink=body.publishedLink; if(body.socialLink) patch.socialLink=body.socialLink;
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
let BULK_BUSY=false;
function applyState(raw){
  if(!raw) return;
  if(BULK_BUSY){ LAST_RAW=raw; return; }   // 批次寫入期間暫停重繪，避免卡頓
  LAST_RAW=raw; decorate(raw); DASH=computeDashboard(today);
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
let CHARTS={}, PENDING_CHARTS=[];
function chartCanvas(id, config, height){ PENDING_CHARTS.push({id,config}); return `<div style="position:relative;height:${height||160}px"><canvas id="${id}"></canvas></div>`; }
function renderCharts(){
  if(!window.Chart) return;
  Object.values(CHARTS).forEach(c=>{ try{c.destroy();}catch(e){} }); CHARTS={};
  PENDING_CHARTS.forEach(s=>{ const el=document.getElementById(s.id); if(el){ try{ s.config.options=Object.assign({responsive:true,maintainAspectRatio:false},s.config.options||{}); CHARTS[s.id]=new window.Chart(el,s.config); }catch(e){} } });
}
function render(){
  if(!STATE) return;
  const v = document.getElementById("view");
  const banner = ONLINE ? "" :
    `<div class="card" style="border-color:var(--red)">⚠️ 目前離線，顯示的是最後一次同步的資料（唯讀），連線恢復後會自動更新。</div>`;
  PENDING_CHARTS=[];
  const fn = {
    dash:viewDash, workload:viewWorkload, cal:viewCal, work:viewWork,
    videos:viewVideos, prod:viewProd, settings:viewSettings, members:viewMembers, audit:viewAudit, mine:viewMine
  }[CUR_TAB] || (()=>"");
  v.innerHTML = banner + fn();
  renderCharts();
}

// ---- 總覽 ----
function viewDash(){
  if(!DASH){ loadDash(); return `<h2>📊 總覽</h2><p class="muted">載入中…</p>`; }
  const p = DASH.progress, wl = DASH.workload||{rows:[]}, help = DASH.helpList||[];
  const runway = p.安全天數||0;
  const filled = (p.已排滿日期||[]);
  const ahead = (wl.rows||[]).filter(r=>r.diff>0);
  const behind = (wl.rows||[]).filter(r=>r.diff<0);
  const LMAP={zh:"中文",en:"英語",th:"泰語",all:"全語言"};
  const userCards = (wl.rows||[]).map(r=>{
    const good = r.diff>=0;
    const pct = r.expected>0? Math.min(100,Math.round(r.totalDone/r.expected*100)) : 100;
    const dotCol = good?"var(--green)":"var(--red)";
    const rep=(STATE.reports||[]).find(x=>x.user===r.name && x.date===today);
    const repHtml = `<div style="margin-top:8px;padding:8px;background:var(--panel2);border-radius:6px;font-size:12px">
        <b>📝 今日特別工作</b>　${reportContentHtml(rep)}
      </div>`;
    return `<div class="ucard ${good?'good':'bad'}">
      <div class="uh">
        <span class="nm"><span class="statusdot" style="background:${dotCol}"></span>${esc(r.name)} <span class="muted" style="font-size:11px;font-weight:500">${LMAP[r.lang]||""}</span></span>
        <span style="font-weight:800;color:${r.todayMet?'var(--green)':'var(--muted)'}">今日 ${r.todayDone}/${r.todayQuota}</span>
      </div>
      ${sparkBars(r.last7, r.todayQuota)}
      <div class="progbar"><i style="width:${pct}%;background:${dotCol}"></i></div>
      <div style="font-size:13px;margin-top:5px;display:flex;justify-content:space-between">
        <span class="${good?'pos':'neg'}">${r.diff>0?"超前 +"+r.diff:(r.diff<0?"落後 "+r.diff:"達標")}</span>
        <span class="muted">本月 ${r.totalDone}/${r.expected}・均 ${r.avgMin!=null?minToText(r.avgMin):"-"}</span>
      </div>
      ${repHtml}
    </div>`;
  }).join("") || `<p class="muted">尚無剪輯成員</p>`;
  const demoCount=(STATE.videos||[]).filter(v=>v.demo).length;
  const demoBanner = demoCount? `<div class="card" style="border-color:var(--amber);background:var(--amberbg)">
    <b style="color:var(--amber)">🧪 目前含示範資料 ${demoCount} 筆</b>
    <span class="muted"> — 報表上的落後／缺口是「示範資料」造成的，不是真實狀況。正式使用前到「成員管理 → 清空所有影片」即可移除。</span></div>`:"";
  const PRETARGET=15; // 預排目標：連續排滿要達 15 天以上
  const safeCol = runway>=PRETARGET?'var(--green)':(runway>=7?'var(--amber)':'var(--red)');
  const newSrc=(STATE.videos||[]).filter(v=>v.stage==="待處理").length;
  const lowTh=STATE.settings?.materialLowThreshold||5;
  const srcLow=newSrc<lowTh; const srcCol=srcLow?'var(--red)':'var(--green)';
  return `
  <h2>📊 總覽 <span class="muted" style="font-size:13px">${today}</span></h2>
  ${demoBanner}

  <div class="grid cols2">
    <div class="card" style="text-align:center;border-color:${safeCol}">
      <div style="font-size:60px;font-weight:900;line-height:1;color:${safeCol}">${runway}<span style="font-size:22px;font-weight:700"> 天</span></div>
      <div class="l" style="font-size:15px;margin-top:4px">預排天數　<span class="muted">（從今天起連續排滿）</span></div>
      ${runway<PRETARGET?`<p class="pill ${runway<7?'em':'wa'}" style="display:inline-block;margin-top:8px">⚠ 未達 15 天，請往後補排到 15 天以上</p>`:`<p class="pill ok" style="display:inline-block;margin-top:8px">✅ 已預排 15 天以上</p>`}
    </div>
    <div class="card" style="text-align:center;border-color:${srcLow?srcCol:'var(--line)'};${srcLow?'background:var(--redbg)':''}">
      <div style="font-size:60px;font-weight:900;line-height:1;color:${srcCol}">${newSrc}<span style="font-size:22px;font-weight:700"> 支</span></div>
      <div class="l" style="font-size:15px;margin-top:4px">新片片源庫存　<span class="muted">（待剪）</span></div>
      ${srcLow?`<p class="pill em" style="display:inline-block;margin-top:8px">⚠ 低於 ${lowTh} 支，需趕快加拍補片源！</p>`:`<p class="pill ok" style="display:inline-block;margin-top:8px">✅ 片源充足（門檻 ${lowTh}）</p>`}
    </div>
  </div>

  <div class="card"><b>👥 每日匯報（每人完成片數＋特別工作，綠＝達標/超前、紅＝落後）</b>
    <div class="grid cols3" style="margin-top:10px">${userCards}</div>
    <p class="muted" style="font-size:11px;margin-top:8px">長條＝近 7 天每日完成支數，達當日 KPI 為綠色。剪片數由「影片完成」自動計入；下方為本人補充的特別工作。績效以「月」累積、每月 1 號重置。</p>
  </div>

  <div class="grid cols3">
    <div class="stat"><div class="n">${p.今日已排}/${p.每日目標}</div><div class="l">今日已上片</div></div>
    <div class="stat"><div class="n" style="color:${p.落後人數?'var(--red)':'var(--green)'}">${p.落後人數}</div><div class="l">落後人數</div></div>
    <div class="stat"><div class="n">${p.剪輯中}</div><div class="l">剪輯中</div></div>
  </div>
  ${viewCal()}`;
}
// 近 7 天迷你長條圖
function sparkBars(last7, q){ if(!last7||!last7.length) return "";
  const maxN=Math.max(q||1, ...last7.map(d=>d.n), 1);
  return `<div style="display:flex;gap:3px;align-items:flex-end;height:46px;margin:8px 0">`+
    last7.map(d=>{ const h=Math.round(d.n/maxN*36)+2;
      // 達當日 KPI=綠；有做但未達=紅；完全沒做=淺灰
      const col = (q>0 && d.n>=q)?"var(--green)":(d.n>0?"var(--red)":"#dfe3ea");
      return `<div title="${d.date}：完成 ${d.n} 支${q?(d.n>=q?'（達標）':'（未達 '+q+'）'):''}" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center">
        <div style="font-size:9px;color:var(--muted)">${d.n||""}</div>
        <div style="width:100%;height:${h}px;background:${col};border-radius:3px"></div>
        <div style="font-size:9px;color:var(--muted);margin-top:2px">${d.date.slice(8)}</div></div>`; }).join("")
    +`</div>`; }

// ---- 人員KPI（HR 每日檢核）----
let WL_DATE=null;
function wlMove(n){ const d=new Date((WL_DATE||today)+"T00:00:00Z"); d.setUTCDate(d.getUTCDate()+n); WL_DATE=d.toISOString().slice(0,10); render(); }
function videoDur(v, langs){ if(v.durationMin!=null) return v.durationMin; for(const lg of langs){ const dm=v.languages?.[lg]?.durationMin; if(dm!=null) return dm; } return 0; }
function viewWorkload(){
  const date = WL_DATE||today; const isToday=(date===today);
  const q0 = STATE.settings?.editorDailyQuota||3;
  const editors=(STATE.users||[]).filter(u=>(u.role||"editor")==="editor");
  const wl=computeWorkload(date); const byName={}; wl.rows.forEach(r=>byName[r.name]=r);
  const LMAP={zh:"中文",en:"英語",th:"泰語",all:"全語言"};
  // 先算好每人當日資料，未達標的排前面
  const data=editors.map(u=>{
    const name=u.name; const q=userQuota(name); const langs=(u.lang==="all")?SCHED_LANGS:[u.lang||"zh"];
    const vids=(STATE.videos||[]).filter(v=> langs.some(lg=>langFinishedOn(v,lg,name,date)));
    const vmin=vids.reduce((a,v)=>a+videoDur(v,langs),0);
    const tasks=(STATE.tasks||[]).filter(t=>t.user===name && t.date===date);
    const tmin=tasks.reduce((a,t)=>a+(t.minutes||0),0);
    const met = q>0 ? vids.length>=q : true;
    return {u,name,q,vids,vmin,tasks,tmin,met,r:byName[name]||{diff:0,totalDone:0,expected:0}};
  }).sort((a,b)=> (a.met?1:0)-(b.met?1:0));
  const kpiEds=data.filter(d=>d.q>0); const metCnt=kpiEds.filter(d=>d.met).length;
  const cards = data.map(({u,name,q,vids,vmin,tasks,tmin,met,r})=>{
    const rep=(STATE.reports||[]).find(x=>x.user===name && x.date===date);
    const repHtml = `<div style="margin-top:6px;padding:8px;background:var(--panel2);border-radius:6px;font-size:13px">
        <b>📝 特別工作</b>　${reportContentHtml(rep)}</div>`;
    return `<div class="ucard ${met?'good':'bad'}">
      <div class="uh"><span class="nm"><span class="statusdot" style="background:${met?'var(--green)':'var(--red)'}"></span>${esc(name)} <span class="muted" style="font-size:11px;font-weight:500">${LMAP[u.lang||"zh"]}</span></span>
        <span style="font-weight:800;color:${met?'var(--green)':'var(--red)'}">剪片 ${vids.length}/${q} ${met?'✓':'✗'}</span></div>
      <div style="margin-top:6px;font-size:13px"><b>當日剪片清單</b>${vids.length?"："+vids.map(v=>esc(v.name||v.rawName)).join("、"):'<span class="muted"> 無</span>'}</div>
      ${repHtml}
      <div style="margin-top:6px;font-size:12px;display:flex;justify-content:space-between">
        <span class="muted">剪片工時 <b>${minToText(vmin)}</b></span>
        <span class="muted">到前一日累積 ${r.totalDone}/${r.expected}（<span class="${r.diff>=0?'pos':'neg'}">${r.diff>0?"超前+"+r.diff:(r.diff<0?"落後"+r.diff:"達標")}</span>）</span>
      </div>
    </div>`;
  }).join("") || `<p class="muted">尚無剪輯成員</p>`;
  return `<h2>👥 人員KPI <span class="muted" style="font-size:13px">全員每日成效一覽</span></h2>
  <div class="card">
    <div class="row" style="justify-content:space-between">
      <div class="row" style="gap:8px"><button class="btn sm sec" onclick="wlMove(-1)">← 前一天</button>
        <b style="min-width:120px;text-align:center">${date}${isToday?"（今天）":""}</b>
        <button class="btn sm sec" onclick="wlMove(1)">後一天 →</button></div>
      ${isToday?"":`<button class="btn sm sec" onclick="WL_DATE=null;render()">回今天</button>`}
    </div>
    <div class="row" style="gap:10px;margin:8px 0"><span class="pill ${metCnt===kpiEds.length?'ok':'em'}" style="font-size:14px">當日達標 ${metCnt}/${kpiEds.length} 人</span>
      <span class="muted" style="font-size:12px">每位剪輯每日最少 ${q0} 片（綠＝達標、紅＝未達，未達者排前面）。其他交辦工作由本人於工作台填寫；「到前一日累積」不含今天。</span></div>
    <div class="grid cols2" style="margin-top:6px">${cards}</div>
  </div>`;
}

// ---- 我的儀表板（個人，只看自己）----
function viewMine(){
  const me=currentUser();
  const wl=computeWorkload(today); const r=wl.rows.find(x=>x.name===me)||{todayDone:0,todayQuota:userQuota(me),monthDone:0,expected:0,diff:0,avgMin:null};
  const mineAll=(STATE.videos||[]).filter(v=>v.editor===me||SCHED_LANGS.some(l=>v.languages?.[l]?.editor===me));
  const done=mineAll.filter(v=>["已完成","已上片"].includes(v.stage)||SCHED_LANGS.some(l=>v.languages?.[l]?.editor===me&&v.languages?.[l]?.status==="完成"));
  const last30=[]; for(let i=29;i>=0;i--){ const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()-i); const ds=d.toISOString().slice(0,10);
    last30.push({ds, n:(STATE.videos||[]).reduce((a,v)=>a+(SCHED_LANGS.some(l=>langFinishedOn(v,l,me,ds))?1:0),0)}); }
  const typeCount={}; done.forEach(v=>{ typeCount[v.mainType]=(typeCount[v.mainType]||0)+1; });
  const ctrs=done.map(v=>v.ctr).filter(x=>x>0), comps=done.map(v=>v.completionRate).filter(x=>x>0);
  const avgCtr=ctrs.length?(ctrs.reduce((a,b)=>a+b,0)/ctrs.length).toFixed(1):"-";
  const avgComp=comps.length?Math.round(comps.reduce((a,b)=>a+b,0)/comps.length):"-";
  const c1=chartCanvas("m_daily",{type:"bar",data:{labels:last30.map(d=>d.ds.slice(5)),datasets:[{label:"完成",data:last30.map(d=>d.n),backgroundColor:"#2563eb"}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}},170);
  const tk=Object.keys(typeCount);
  const c2=chartCanvas("m_type",{type:"doughnut",data:{labels:tk,datasets:[{data:tk.map(k=>typeCount[k]),backgroundColor:["#0284c7","#d97706","#16a34a","#9333ea"]}]}},170);
  const recent=done.slice().sort((a,b)=>String(b.finishedAt||b.scheduledDate||"").localeCompare(String(a.finishedAt||a.scheduledDate||""))).slice(0,20);
  const rows=recent.map(v=>`<tr>
     <td data-label="影片"><a href="javascript:void(0)" onclick="editVideo('${v.id}')">${esc(v.name||v.rawName)}</a></td>
     <td data-label="類別">${typeTag(v.mainType)}</td>
     <td data-label="上片日">${esc(v.scheduledDate||"-")}</td>
     <td data-label="CTR">${v.ctr||0}%</td><td data-label="完播">${v.completionRate||0}%</td>
     <td data-label="工時">${v.durationMin!=null?minToText(v.durationMin):"-"}</td></tr>`).join("");
  const good=r.diff>=0;
  return `
  <h2>📊 我的儀表板（${esc(me)}）</h2>
  <div class="grid cols4">
    <div class="stat"><div class="n ${r.todayDone>=r.todayQuota?'pos':'neg'}">${r.todayDone}/${r.todayQuota}</div><div class="l">今日完成／KPI</div></div>
    <div class="stat"><div class="n">${r.monthDone}<span class="muted" style="font-size:13px">/${r.expected}</span></div><div class="l">本月完成／應達</div></div>
    <div class="stat"><div class="n ${good?'pos':'neg'}">${r.diff>0?'超前 +'+r.diff:(r.diff<0?'落後 '+r.diff:'達標')}</div><div class="l">進度</div></div>
    <div class="stat"><div class="n">${r.avgMin!=null?minToText(r.avgMin):'-'}</div><div class="l">平均工時</div></div>
  </div>
  <div class="grid cols2">
    <div class="card"><b>📈 我近 30 天每日完成</b>${c1}</div>
    <div class="card"><b>🍩 我的影片類型分布</b>${tk.length?c2:'<p class="muted">尚無資料</p>'}</div>
  </div>
  <div class="grid cols3">
    <div class="stat"><div class="n">${avgCtr}%</div><div class="l">平均 CTR</div></div>
    <div class="stat"><div class="n">${avgComp}${avgComp==="-"?"":"%"}</div><div class="l">平均完播率</div></div>
    <div class="stat"><div class="n">${done.length}</div><div class="l">累計完成影片</div></div>
  </div>
  ${myDailyReport(me)}
  <div class="card"><b>🎬 我的影片（近 20 筆）</b>
    <table class="responsive"><thead><tr><th>影片</th><th>類別</th><th>上片日</th><th>CTR</th><th>完播</th><th>工時</th></tr></thead>
    <tbody>${rows||`<tr><td class="muted">尚無完成的影片</td></tr>`}</tbody></table></div>`;
}
// 個人每日工作日報總表（近 14 天）
function myDailyReport(me){
  const meU=(STATE.users||[]).find(u=>u.name===me)||{}; const langs=(meU.lang==="all")?SCHED_LANGS:[meU.lang||"zh"]; const q=userQuota(me);
  const rows=[];
  for(let i=0;i<14;i++){ const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()-i); const dstr=d.toISOString().slice(0,10);
    const vlist=(STATE.videos||[]).filter(v=>langs.some(lg=>langFinishedOn(v,lg,me,dstr)));
    const vmin=vlist.reduce((a,v)=>a+videoDur(v,langs),0);
    const rep=(STATE.reports||[]).find(x=>x.user===me && x.date===dstr);
    const met=q>0?vlist.length>=q:true;
    rows.push(`<tr>
      <td data-label="日期">${dstr.slice(5)}${dstr===today?" (今天)":""}</td>
      <td data-label="完成"><span class="${met?'pos':'neg'}">${vlist.length}/${q}</span></td>
      <td data-label="剪片工時">${minToText(vmin)}</td>
      <td data-label="特別工作">${(rep&&(rep.content||"").trim())?`<span style="white-space:pre-wrap">${esc(rep.content)}</span>`:'<span class="muted">—</span>'}</td>
      <td data-label="達標">${met?'<span class="pos">✓</span>':'<span class="neg">✗</span>'}</td></tr>`);
  }
  return `<div class="card"><b>📋 我的每日工作日報（近 14 天）</b>
    <p class="muted" style="font-size:12px">每天最少 ${q} 片；完成片數系統自動計入，特別工作為選填。</p>
    <table class="responsive"><thead><tr><th>日期</th><th>完成片數</th><th>剪片工時</th><th>特別工作</th><th>達標</th></tr></thead>
    <tbody>${rows.join("")}</tbody></table></div>`;
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
  const tCol={"流量型":"var(--traffic)","帶貨型":"var(--sales)"};
  let cells = "";
  for(let i=0;i<startDow;i++) cells += `<div class="day out"></div>`;
  for(let d=1;d<=days;d++){
    const ds = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const isToday = ds===today;
    const tmk = isToday?`<span class="todaymk">今天</span>`:"";
    if(!isZh){ const cnt=dayLangCount(ds,lang);
      cells += `<div class="day ${cnt>0?'full':'none'} ${isToday?'today':''}" onclick="openDay('${ds}')">${tmk}<div class="dnum">${d}</div>
        <div class="big">${cnt||"·"}</div></div>`;
      continue; }
    const b=dayBreakdown(ds);
    const cls = b.total===0 ? "bad" : (b.full ? "full" : (b.total>=b.target ? "warn" : "bad"));
    // 類型色條：流量(藍)/帶貨(橙)/寵粉(紫)
    const segs=[]; const tcnt=b.byType;
    if(tcnt["流量型"]) segs.push(`<div class="seg" style="flex:${tcnt["流量型"]};background:var(--traffic)" title="流量 ${tcnt['流量型']}"></div>`);
    if(tcnt["帶貨型"]) segs.push(`<div class="seg" style="flex:${tcnt["帶貨型"]};background:var(--sales)" title="帶貨 ${tcnt['帶貨型']}"></div>`);
    if(tcnt["寵粉"]) segs.push(`<div class="seg" style="flex:${tcnt["寵粉"]};background:var(--pamper)" title="寵粉 ${tcnt['寵粉']}"></div>`);
    const km={"流量型":"流","帶貨型":"帶","寵粉":"寵"};
    const defTxt=Object.keys(b.deficits).map(k=>(km[k]||k)+"缺"+b.deficits[k]);
    cells += `<div class="day ${cls} ${isToday?'today':''}" onclick="openDay('${ds}')">
      ${tmk}<div class="dnum">${d}</div>
      <div class="big">${b.total}<span style="font-size:13px;color:var(--muted);font-weight:600">/${b.target}</span></div>
      ${defTxt.length?`<div class="pmk" style="color:var(--red)">${defTxt.join("・")}</div>`:(isPamperedDay(ds)&&!b.needPampered?`<div class="pmk" style="color:var(--pamper)">寵粉✓</div>`:"")}
      <div class="tbar">${segs.join("")||'<div class="seg" style="flex:1;background:var(--line)"></div>'}</div>
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
    <p class="muted" style="margin-top:12px;font-size:13px">${isZh?`大數字＝當日上片數／目標 ${target}。<b style="color:var(--green)">綠</b>=完整、<b style="color:var(--amber)">橙</b>=量夠但類型或寵粉缺、<b style="color:var(--red)">紅</b>=量不足。底部色條：<span style="color:var(--traffic)">■</span>流量 <span style="color:var(--sales)">■</span>帶貨 <span style="color:var(--pamper)">■</span>寵粉。`:`綠＝當日有${LANG_LABEL[lang]||lang}影片`}　點任一天查看明細</p>
  </div>`;
}
function calMove(n){ let [y,m]=CAL_YM; m+=n; if(m<0){m=11;y--;} if(m>11){m=0;y++;} CAL_YM=[y,m]; render(); }

function openDay(ds){
  const target = STATE.settings?.dailyPublishTarget||4;
  const lang = curLang(); const isZh=(lang==="zh");
  const list = dayLangList(ds, lang);
  const rows = list.map((it)=>{
    const v = vid(it.videoId);
    const ed = isZh ? (v?.editor||"") : (v?.languages?.[lang]?.editor||"");
    const link = isZh ? (v?.publishedLink||v?.driveFolder||"") : (v?.languages?.[lang]?.publishedLink||v?.languages?.[lang]?.driveFolder||"");
    return `<tr>
      <td data-label="影片"><a href="javascript:void(0)" onclick="editVideo('${it.videoId}')">${esc(v?(v.name||v.rawName):(it.videoId||""))}</a> ${v?typeTag(v.mainType):""}</td>
      <td data-label="剪輯">${esc(ed)}</td>
      <td data-label="連結">${link?`<a href="${esc(link)}" target="_blank">開啟</a>`:'<span class="muted">—</span>'}</td>
      <td data-label="">${isZh?`<button class="btn sm danger" onclick="unscheduleVid('${it.videoId}','${ds}')">移出此日</button>`
                              :`<button class="btn sm danger" onclick="unscheduleLang('${it.videoId}','${lang}','${ds}')">移出此日</button>`}</td>
    </tr>`;
  }).join("");
  const cnt = list.length;
  let summary="";
  if(isZh){ const b=dayBreakdown(ds); const tg=b.targets;
    summary = `<div class="row" style="gap:8px;margin-bottom:8px">`+
      Object.keys(tg).map(k=>{ const have=b.byType[k]||0; const ok=have>=tg[k];
        return `<span class="pill ${ok?'ok':'em'}">${k} ${have}/${tg[k]}</span>`; }).join("")+
      `<span class="pill ${cnt>=b.target?'ok':'em'}">總量 ${cnt}/${b.target}</span></div>`;
  }
  showModal(`📅 ${ds}（${LANG_LABEL[lang]||lang}）`, `
    <div class="card"><b>當日影片</b>
      ${summary}
      <table class="responsive"><thead><tr><th>影片</th><th>剪輯</th><th>連結</th><th></th></tr></thead>
      <tbody>${rows||`<tr><td class="muted">當日尚無影片</td></tr>`}</tbody></table>
      <p class="muted" style="font-size:12px;margin-top:8px">影片由剪輯在「我的工作台」完成（貼連結＋選上片日期）後自動排到此日。如要改日期，可在影片編輯框調整，或按「移出此日」清除。</p>
    </div>`, null);
}
function unscheduleLang(id,lang,ds){ if(!confirm("把這支影片移出"+(LANG_LABEL[lang]||lang)+"此日？")) return;
  const v=vid(id); const L=Object.assign({}, v?.languages?.[lang]||{}); L.scheduledDate=null;
  write("PUT",`/api/videos/${id}/lang/${lang}`,{lang:L},"已移出此日").then(ok=>{ if(ok) openDay(ds); }); }
function unscheduleVid(id,ds){ if(!confirm("把這支影片移出此日（清除上片日期）？")) return;
  write("PUT",`/api/videos/${id}`,{video:{scheduledDate:null}},"已移出此日").then(ok=>{ if(ok) openDay(ds); }); }

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
  const claimAtOf = v => isZh ? v.claimedAt : (v.languages?.[lang]?.claimedAt);
  const matRow = (v,inPool)=>`<tr>
      <td data-label="影片"><a href="javascript:void(0)" onclick="editVideo('${v.id}')">${esc(v.name||v.rawName||"(未命名)")}</a> ${typeTag(v.mainType)}</td>
      <td data-label="片源"><span class="muted">${esc(v.source||"")}</span></td>
      <td data-label="負責">${esc(owner(v))}${(!inPool&&claimAtOf(v))?` <span class="muted">·已 ${durationText(claimAtOf(v))}</span>`:""}</td>
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
  </div>
  ${taskCard(me)}`;
}
// 今日特別工作備註（選填）；剪片數由「影片完成」自動計入
function taskCard(me){
  const rep=(STATE.reports||[]).find(x=>x.user===me && x.date===today)||{};
  const doneT=(STATE.videos||[]).filter(v=>v.editor===me && ["已完成","已上片"].includes(v.stage) && (v.finishedAt||"").slice(0,10)===today).length;
  return `<div class="card"><b>📝 今日特別工作備註（選填）</b>
    <p class="muted" style="font-size:12px;margin-top:4px">今天已完成剪輯 <b>${doneT}</b> 支（系統自動計入工作量，不用手動填）。下面只在有「特別／額外工作」時補充，沒有可留空。</p>
    <textarea id="rp_content" style="min-height:110px" placeholder="例：製作 7 張粉專圖片、協助拍攝、開會討論…（沒有可留空）">${esc(rep.content||"")}</textarea>
    <div class="modalFoot"><button class="btn" onclick="finishReport()">儲存</button></div>
  </div>`;
}
async function finishReport(){ const me=currentUser(); const content=val("rp_content").trim();
  const rec={id:me+"__"+today, user:me, date:today, content, done:!!content};
  try{ await window.DB.set("reports", rec.id, rec); toast("已儲存"); }catch(e){ toast("失敗，請稍後再試",true); } }
// 特別工作備註顯示
function reportContentHtml(rep){ if(!rep) return ""; const c=rep.content||((rep.items||[]).filter(Boolean).join("、"));
  return c? `<div style="white-space:pre-wrap">${esc(c)}</div>` : `<span class="muted">無</span>`; }
function claimVid(id){ write("POST",`/api/videos/${id}/claim`,{},"已認領，加入我的工作"); }
function claimLang(id,lang){
  if(myInProgressCount()>=3){ toast("你進行中的影片已達 3 片上限",true); return; }
  write("PUT",`/api/videos/${id}/lang/${lang}`,{lang:{status:"二創中",editor:currentUser(),claimedBy:currentUser(),claimedAt:nowIso()}},"已認領 "+(LANG_LABEL[lang]||lang)+" 二創");
}
function finishGate(p){ const ok=val(p+"date")&&val(p+"backup").trim()&&val(p+"social").trim();
  const b=document.getElementById("modalConfirm"); if(b){ b.disabled=!ok; b.style.opacity=ok?"":"0.5"; b.style.cursor=ok?"":"not-allowed"; } }
function finishLang(id,lang){
  const v=vid(id)||{}; const L=v.languages?.[lang]||{}; const def=L.scheduledDate||today; const lb=LANG_LABEL[lang]||lang;
  showModal("完成"+lb+"二創：填上片資訊", `
    <label>上片日期（會顯示在${lb}行事曆）</label><input id="fl_date" type="date" value="${esc(def)}" oninput="finishGate('fl_')">
    <label>雲端備份連結</label><input id="fl_backup" value="${esc(L.driveFolder||"")}" oninput="finishGate('fl_')" placeholder="Google Drive 備份">
    <label>社群平台預排連結</label><input id="fl_social" value="${esc(L.socialLink||L.publishedLink||"")}" oninput="finishGate('fl_')" placeholder="排程工具／預約貼文連結">
    <p class="muted">日期與兩個連結都填好，才能按「確認送出」。</p>
  `, async ()=>{
    const fin=nowIso(); const cAt=L.claimedAt||null;
    return await write("PUT",`/api/videos/${id}/lang/${lang}`,
      {lang:{status:"完成", finishedAt:fin, scheduledDate:val("fl_date"), editor:currentUser(),
             claimedBy:currentUser(), claimedAt:cAt, durationMin:(cAt?durationMin(cAt,fin):null),
             publishedLink:val("fl_social"), driveFolder:val("fl_backup"), socialLink:val("fl_social")}},
      "已完成，已加入"+lb+"行事曆");
  });
  finishGate("fl_");
}
function finishVid(id){
  const v = vid(id)||{};
  const def = v.scheduledDate || today;
  showModal("完成影片：填上片資訊", `
    <label>成品名稱</label><input id="f_name" value="${esc(v.name||v.rawName||"")}">
    <label>上片日期（會顯示在月行事曆）</label><input id="f_date" type="date" value="${esc(def)}" oninput="finishGate('f_')">
    <label>雲端備份連結</label><input id="f_backup" value="${esc(v.driveFolder||"")}" oninput="finishGate('f_')" placeholder="Google Drive 備份">
    <label>社群平台預排連結</label><input id="f_social" value="${esc(v.socialLink||v.publishedLink||"")}" oninput="finishGate('f_')" placeholder="排程工具／預約貼文連結">
    <p class="muted">日期與兩個連結都填好，才能按「確認送出」。</p>
  `, async ()=>{
    return await write("POST",`/api/videos/${id}/finish`,
      {name:val("f_name")||undefined, scheduledDate:val("f_date"),
       publishedLink:val("f_social"), driveFolder:val("f_backup"), socialLink:val("f_social"),
       published:true, backupDone:true, socialScheduled:true}, "已完成，已加入月行事曆");
  });
  finishGate("f_");
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
  const mains=s.mainTypes||["流量型","帶貨型","寵粉"];
  const sources=s.sources||["老闆自拍","外部公司"];
  const subOptions = (mt)=> (s.subTags?.[mt]||[]).map(t=>`<option value="${esc(t)}">`).join("");
  const prodOptions = (STATE.products||[]).map(p=>`<option value="${esc(p.name)}">`).join("");
  showModal("新增影片任務", `
    <label>原片（素材／主題）</label><input id="m_raw" placeholder="例：劉亦菲珠寶比較">
    <label>成品名稱（可後補）</label><input id="m_name">
    <div class="grid cols2">
      <div><label>主類別</label><select id="m_main" onchange="window._subOpts(this.value)">${mains.map(c=>`<option>${esc(c)}</option>`).join("")}</select></div>
      <div><label>子標籤</label><input id="m_sub" list="m_sub_list" placeholder="輸入或選擇"><datalist id="m_sub_list">${subOptions(mains[0])}</datalist></div>
    </div>
    <div class="grid cols2">
      <div><label>片源</label><select id="m_src">${sources.map(c=>`<option>${esc(c)}</option>`).join("")}</select></div>
      <div><label>預計上片日期（可空）</label><input id="m_date" type="date"></div>
    </div>
    <label>對應帶貨商品（帶貨型用，可空）</label><input id="m_prod" list="m_prod_list" placeholder="輸入或選擇商品名稱"><datalist id="m_prod_list">${prodOptions}</datalist>
  `, async ()=>{
    const video={rawName:val("m_raw").trim(), name:val("m_name").trim(),
      mainType:val("m_main"), subTag:val("m_sub").trim(), source:val("m_src"),
      scheduledDate:val("m_date")||null, productId:val("m_prod").trim()||null};
    if(!video.rawName && !video.name){ toast("請輸入原片或成品名稱",true); return false; }
    return await write("POST","/api/videos",{video},"已新增影片任務");
  });
  window._subOpts = (mt)=>{ const dl=document.getElementById("m_sub_list"); if(dl) dl.innerHTML=subOptions(mt); };
}

// ---- 影片庫（精簡：只列標題，點進去看細節）----
function videoItem(v){ const dot = v.mainType==="帶貨型"?"var(--sales)":"var(--traffic)";
  return `<div class="vrow" onclick="editVideo('${v.id}')">
    <span style="display:flex;align-items:center;gap:8px;min-width:0">
      <span class="light" style="background:${dot};flex:none"></span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.name||v.rawName||"(未命名)")}</span></span>
    <span class="muted" style="font-size:12px;white-space:nowrap">${esc(v.editor||"")}${v.scheduledDate?(" · "+v.scheduledDate.slice(5)):""}</span>
  </div>`; }
function videoList(list){ return list.length? list.map(videoItem).join("") : `<p class="muted">無</p>`; }
function viewVideos(){
  const all=STATE.videos||[];
  const fresh=all.filter(v=>["待處理","剪輯中"].includes(v.stage));
  const old=all.filter(v=>["已完成","已上片"].includes(v.stage))
    .sort((a,b)=>String(b.scheduledDate||"").localeCompare(String(a.scheduledDate||"")));
  return `<h2>🎞 影片庫 <span class="muted" style="font-size:13px">點標題看細節／改連結</span></h2>
  <div class="card"><div class="row" style="justify-content:space-between"><b>🆕 新片（未剪／製作中）${fresh.length}</b>
    <button class="btn sm" onclick="newVideo()">＋ 新增片源</button></div>
    <div style="margin-top:6px">${videoList(fresh)}</div></div>
  <div class="card"><b>📁 舊片（已完成）${old.length}</b>
    <div style="margin-top:6px">${videoList(old)}</div></div>`;
}
function editVideo(id){
  const v = vid(id)||{};
  const s=STATE.settings||{};
  const mains=s.mainTypes||["流量型","帶貨型","寵粉"];
  const sources=s.sources||["老闆自拍","外部公司"];
  const users=(STATE.users||[]).filter(u=>u.role==="editor").map(u=>u.name);
  const stages=["待處理","剪輯中","已完成","已上片"];
  const subOptions = (mt)=> (s.subTags?.[mt]||[]).map(t=>`<option value="${esc(t)}">`).join("");
  const prodOptions = (STATE.products||[]).map(p=>`<option value="${esc(p.name)}">`).join("");
  showModal("編輯影片",`
    <label>原片</label><input id="e_raw" value="${esc(v.rawName||"")}">
    <label>成品名稱</label><input id="e_name" value="${esc(v.name||"")}">
    <div class="grid cols2">
      <div><label>主類別</label><select id="e_main" onchange="window._subOpts2(this.value)">${mains.map(c=>`<option ${v.mainType===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
      <div><label>子標籤</label><input id="e_sub" list="e_sub_list" value="${esc(v.subTag||"")}" placeholder="輸入或選擇"><datalist id="e_sub_list">${subOptions(v.mainType||mains[0])}</datalist></div>
    </div>
    <div class="grid cols2">
      <div><label>片源</label><select id="e_src">${sources.map(c=>`<option ${v.source===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
      <div><label>階段</label><select id="e_stage">${stages.map(c=>`<option ${v.stage===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
    </div>
    <label>剪輯人員</label><select id="e_editor"><option value="">—</option>${users.map(u=>`<option ${v.editor===u?"selected":""}>${esc(u)}</option>`).join("")}</select>
    <label>上片日期</label><input id="e_date" type="date" value="${esc(v.scheduledDate||"")}">
    <label>對應帶貨商品（帶貨型用，可空）</label><input id="e_prod" list="e_prod_list" value="${esc(v.productId||"")}" placeholder="輸入或選擇商品名稱"><datalist id="e_prod_list">${prodOptions}</datalist>
    <div class="card" style="background:var(--panel2)"><b>🔗 連結</b>
      <label>雲端備份連結</label><input id="e_drive" value="${esc(v.driveFolder||"")}" placeholder="Google Drive / 雲端備份">
      <label>社群平台預排連結</label><input id="e_social" value="${esc(v.socialLink||v.publishedLink||"")}" placeholder="排程工具 / 預約貼文連結">
    </div>
    <div class="grid cols2">
      <div><label>CTR (%)</label><input type="number" step="0.1" id="e_ctr" value="${v.ctr||0}"></div>
      <div><label>完播率 (%)</label><input type="number" step="0.1" id="e_comp" value="${v.completionRate||0}"></div>
    </div>
    ${id?`<div class="card" style="background:var(--panel2)"><b>⏱ 工時</b>
      <p class="muted" style="margin:6px 0">領取 ${esc(v.claimedAt||"-")}　完成 ${esc(v.finishedAt||"-")}　耗時 <b>${v.claimedAt&&v.finishedAt?durationText(v.claimedAt,v.finishedAt):(v.durationMin!=null?minToText(v.durationMin):"-")}</b></p>
    </div>`:""}
  `, async ()=>{
    const video={rawName:val("e_raw"),name:val("e_name"),mainType:val("e_main"),subTag:val("e_sub").trim(),
      source:val("e_src"),stage:val("e_stage"),editor:val("e_editor"),
      scheduledDate:val("e_date")||null,ctr:parseFloat(val("e_ctr"))||0,completionRate:parseFloat(val("e_comp"))||0,
      productId:val("e_prod").trim()||null,
      driveFolder:val("e_drive"), publishedLink:val("e_social"), socialLink:val("e_social")};
    const ok=await write("PUT",`/api/videos/${id}`,{video},"已更新影片");
    if(ok) closeModal(); return ok;
  });
  window._subOpts2 = (mt)=>{ const dl=document.getElementById("e_sub_list"); if(dl) dl.innerHTML=subOptions(mt); };
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
function setKpiToday(){ writeAdmin("PUT","/api/settings",{settings:{kpiStartDate:today}},"已把 KPI 起算日設為今天"); }
function viewSettings(){
  const s=STATE.settings||{};
  const subStr = Object.entries(s.subTags||{}).map(([k,arr])=>`${k}:${(arr||[]).join("|")}`).join("\n");
  const tt=s.typeTargets||{"流量型":3,"帶貨型":1};
  const ft=s.fridayTargets||{"流量型":2,"寵粉":3};
  return `<h2>⚙️ 設定（修改需管理者密碼）</h2>
  <div class="card"><div class="grid cols4">
    <div><label>每日應上片數</label><input type="number" id="set_pub" value="${s.dailyPublishTarget||4}"></div>
    <div><label>每位剪輯每日配額</label><input type="number" id="set_quota" value="${s.editorDailyQuota||3}"></div>
    <div><label>新片片源低庫存門檻</label><input type="number" id="set_low" value="${s.materialLowThreshold||5}"></div>
    <div><label>預排天數視窗</label><input type="number" id="set_horizon" value="${s.scheduleHorizonDays||30}"></div>
  </div>
  <label>平日 每日各類型最低數量（一～四、六、日）</label>
  <div class="grid cols3">${(s.mainTypes||["流量型","帶貨型","寵粉"]).map(mt=>`<div><label style="margin-top:0">${esc(mt)}</label><input type="number" min="0" id="set_tt_${esc(mt)}" value="${tt[mt]||0}"></div>`).join("")}</div>
  <label style="margin-top:10px">週五 特別配置</label>
  <div class="grid cols3">
    <div><label style="margin-top:0">流量型</label><input type="number" min="0" id="set_ft_流量型" value="${ft["流量型"]||0}"></div>
    <div><label style="margin-top:0">寵粉</label><input type="number" min="0" id="set_ft_寵粉" value="${ft["寵粉"]||0}"></div>
  </div></div>
  <label>KPI 起算日（超前/落後從這天開始算，建議設成正式上線那天）</label>
  <div class="row"><input type="date" id="set_kpistart" value="${esc(s.kpiStartDate||"")}" style="max-width:200px">
    <button class="btn sm sec" onclick="setKpiToday()">設為今天</button></div>
  <p class="muted">應完成只計算「已過完」的工作日（不含今天）。把起算日設成今天，所有人就會從 0/0 達標開始累積。</p></div>
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
  const mainTypes=val("set_main").split(",").map(x=>x.trim()).filter(Boolean);
  const typeTargets={}; mainTypes.forEach(mt=>{ const e=document.getElementById("set_tt_"+mt); if(e) typeTargets[mt]=parseInt(e.value)||0; });
  const fridayTargets={"流量型":parseInt(val("set_ft_流量型"))||0,"寵粉":parseInt(val("set_ft_寵粉"))||0};
  const settings={
    fridayTargets,
    dailyPublishTarget:parseInt(val("set_pub"))||4,
    editorDailyQuota:parseInt(val("set_quota"))||3,
    scheduleHorizonDays:parseInt(val("set_horizon"))||30,
    materialLowThreshold:parseInt(val("set_low"))||5,
    kpiStartDate:val("set_kpistart")||undefined,
    mainTypes, typeTargets,
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
    <div class="row" style="justify-content:space-between"><p class="muted" style="margin:0">語言剪輯只看自己語言的行事曆；「每日KPI」每人可不同。改角色／KPI／刪除需管理密碼。</p>
      <button class="btn sec sm" onclick="setAllQuota(3)">全部剪輯 KPI 設為 3</button></div>
  </div>
  <div class="card"><b>新增單一成員</b>
    <div class="grid cols4">
      <div><label>名字</label><input id="mb_name"></div>
      <div><label>角色／語言</label><select id="mb_role">${ROLE_TOKENS.map(([tk,lb])=>`<option value="${tk}" ${tk==="editor:zh"?"selected":""}>${lb}</option>`).join("")}</select></div>
      <div><label>每日KPI支數</label><input id="mb_quota" type="number" min="0" value="${defQ}"></div>
      <div style="display:flex;align-items:flex-end"><button class="btn" onclick="addMember()">新增</button></div>
    </div>
  </div>
  <div class="card"><b>匯入舊 Excel 工作</b>
    <p class="muted">把之前 Google 試算表的影片工作（共 ${ (window.LEGACY_SEED||[]).length } 筆，皆含 Drive 備份連結）一次匯入影片庫。已完成的會帶上片日期、顯示在月行事曆。</p>
    <button class="btn" onclick="importLegacy()">📥 匯入舊工作（${ (window.LEGACY_SEED||[]).length } 筆）</button>
  </div>
  <div class="card" style="border-color:var(--red)"><b>⚠️ 危險區</b>
    <p class="muted">載入模擬資料供展示（前後各約兩個月、每日≥4片、各人表現不均、週五六含寵粉，約 500+ 筆，可能要 1 分鐘）；或清空所有影片與排程。皆不影響成員與設定。</p>
    <div class="row">
      <button class="btn sec" onclick="loadDemoData()">🧪 載入模擬資料</button>
      <button class="btn danger" onclick="clearAllVideos()">🗑 清空所有影片</button>
    </div>
  </div>`;
}
async function clearAllVideos(){
  if(!confirm("確定清空『所有影片與排程』？此動作無法復原！")) return;
  await withAdmin(async ()=>{
    const vids=(STATE.videos||[]).slice(); const dates=Object.keys(STATE.schedule||{});
    let n=0; BULK_BUSY=true;
    try{
      for(const v of vids){ try{ await window.DB.del("videos", v.id); n++; }catch(e){} }
      for(const d of dates){ try{ await window.DB.del("schedule", d); }catch(e){} }
      try{ await window.DB.addAudit({ts:nowIso(),user:currentUser(),deviceId:deviceId(),action:"清空所有影片("+n+")"}); }catch(e){}
    } finally { BULK_BUSY=false; applyState(LAST_RAW); }
    await delay(300); toast("已清空 "+n+" 支影片與排程");
  });
}
// 批次建立影片：本地遞增 ID（避免連續寫入時 nextId 撞號），直接寫 Firestore
async function bulkCreateVideos(list){
  let base=0; (STATE.videos||[]).forEach(it=>{ const m=String(it.id||"").match(/^V(\d+)$/); if(m) base=Math.max(base,+m[1]); });
  let ok=0; BULK_BUSY=true;
  try{
    for(let i=0;i<list.length;i++){
      const id="V"+String(base+i+1).padStart(3,"0");
      const rec=Object.assign(newVideoRecord(list[i]), {id});
      if(rec.editor) rec.languages.zh.editor=rec.editor;
      try{ await window.DB.set("videos", id, rec); ok++; }catch(e){}
    }
    try{ if(window.DB&&window.DB.addAudit) await window.DB.addAudit({ts:nowIso(),user:currentUser(),deviceId:deviceId(),action:"批次建立影片("+ok+")"}); }catch(e){}
  } finally { BULK_BUSY=false; applyState(LAST_RAW); }
  return ok;
}
async function importLegacy(){
  const seed=window.LEGACY_SEED||[];
  if(!seed.length){ toast("找不到匯入資料",true); return; }
  if(!confirm("將匯入 "+seed.length+" 筆舊工作到影片庫，確定？")) return;
  const list=seed.map(r0=>{ const r=Object.assign({}, r0); delete r.enDrive; delete r.thDrive; return r; });
  const ok=await bulkCreateVideos(list);
  await delay(400); toast("匯入完成：成功 "+ok+" 筆。請到影片庫／月排程查看");
}
// 完整模擬資料：前後各約兩個月、每日≥4片、含片名/剪輯/成效、週五六寵粉、各人不均
const DEMO_TRAFFIC=["劉亦菲紅毯1.2億珠寶竟是假的","八大珠寶派系你是哪一派","有錢人的保值密碼","真假寶石30秒分辨","婚戒避坑指南","名人最愛的冷門寶石","女人的底氣從哪來","黃金跟你的原始階層有關","為什麼貴婦都戴這款","珠寶商不告訴你的秘密","古董珠寶的真實價值","這顆鑽石為何值千萬","明星同款的平價替代","寶石顏色的等級秘密","收藏級翡翠長這樣"];
const DEMO_SALES=["寵粉金運球開箱","本月新品鑽石項鍊","限時促銷紅寶石戒","母親節必買套組","招財貔貅手鍊","結婚對戒推薦","送禮自用兩相宜","週年慶下殺三折","新品試戴實拍","熱銷耳環補貨到"];
const DEMO_PAMPER=["寵粉日五行法寶","寵粉專屬金運球","寵粉社群限定款","寵粉週末驚喜價","寵粉回饋開箱"];
async function loadDemoData(){
  const editors=(STATE.users||[]).filter(u=>(u.role||"editor")==="editor" && (u.lang==="zh"||u.lang==="all"||!u.lang));
  const allEd=(STATE.users||[]).filter(u=>(u.role||"editor")==="editor");
  const eds = editors.length?editors:allEd;
  if(!eds.length){ toast("請先建立至少一位剪輯成員再載入模擬資料",true); return; }
  if(!confirm("載入完整模擬資料？前後各約兩個月、每日≥4片，約 500+ 筆，可能要 1 分鐘。")) return;
  const T=new Date(today+"T00:00:00");
  // 把 KPI 起算日設為本月初，模擬才看得到累積落後（否則被設成今天會全是 0/0）
  try{ await window.DB.setSettings({kpiStartDate: new Date(T.getFullYear(),T.getMonth(),1).toISOString().slice(0,10),
    typeTargets:{"流量型":3,"帶貨型":1}, fridayTargets:{"流量型":2,"寵粉":3}}); }catch(e){}
  const dOff=n=>{ const x=new Date(T); x.setDate(T.getDate()+n); return x; };
  const ds=x=>x.toISOString().slice(0,10);
  const at=(x,h)=>{ const y=new Date(x); y.setHours(h,Math.floor(Math.random()*60),0,0); return y.toISOString().slice(0,19); };
  const srcs=STATE.settings?.sources||["老闆自拍","外部公司"];
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  // 依活躍度分配：排序讓有 KPI 的剪輯在前（第1位最活躍≈接近達標，最後一位長期落後）
  const base = eds.slice().sort((a,b)=> (userQuota(b.name)>0?1:0)-(userQuota(a.name)>0?1:0));
  // 活躍度權重：第1位接近達標、之後遞減，最後一位長期落後（每天總量固定＝目標，不會塞爆某人）
  const actW=base.map((u,i)=>[0.46,0.26,0.16,0.08,0.03,0.01][i] ?? 0.01);
  const actTot=actW.reduce((a,b)=>a+b,0);
  const pickEditor=()=>{ let r=Math.random()*actTot; for(let i=0;i<base.length;i++){ r-=actW[i]; if(r<=0) return base[i].name; } return base[base.length-1].name; };
  let seq=0;
  const mkVideo=(d, kind, editor)=>{ seq++;
    let mainType, subTag, name;
    if(kind==="pamper"){ mainType="帶貨型"; subTag="寵粉"; name=pick(DEMO_PAMPER); }
    else if(kind==="sales"){ mainType="帶貨型"; subTag=pick(["新品","促銷","開箱"]); name=pick(DEMO_SALES); }
    else { mainType="流量型"; subTag=pick(["名人話題","珠寶知識","家庭","理財"]); name=pick(DEMO_TRAFFIC); }
    const past = d < T;
    return {demo:true, rawName:name, name:name+"（"+ds(d).slice(5)+"）", mainType, subTag, pampered:kind==="pamper",
      source:pick(srcs), editor:editor||"", stage:"已完成", scheduledDate:ds(d),
      claimedAt:(past&&editor)?at(d,8):"",
      finishedAt:at(d, 9+Math.floor(Math.random()*9)),
      durationMin:20+Math.floor(Math.random()*1200),
      ctr:+(2+Math.random()*10).toFixed(1), completionRate:30+Math.floor(Math.random()*55),
      driveFolder:"https://drive.google.com/demo/"+seq, publishedLink:"https://ig.example/p/"+seq, socialLink:"https://buffer.example/"+seq};
  };
  const recs=[];
  // 平日 流量3/帶貨1；週五 流量2/寵粉3（依當日類型目標產生）
  const dayKinds=(d)=>{ const tg=dayTargets(d.toISOString().slice(0,10)); const k=[];
    for(let i=0;i<(tg["流量型"]||0);i++) k.push("traffic");
    for(let i=0;i<(tg["帶貨型"]||0);i++) k.push("sales");
    for(let i=0;i<(tg["寵粉"]||0);i++) k.push("pamper");
    return k; };
  const genDay=(d)=>{ dayKinds(d).forEach(k=> recs.push(mkVideo(d,k,pickEditor()))); };
  // 過去兩個月＋今天：每天就 target 片（歷史）
  for(let n=-60;n<=0;n++) genDay(dOff(n));
  // 未來：往後排（多數天有排，少數留缺口待補）— 安全天數自然形成
  for(let n=1;n<=60;n++){ if(Math.random()<0.7) genDay(dOff(n)); }
  // 工作台池：待處理(刻意<5觸發片源警示) + 剪輯中
  for(let k=0;k<3;k++){ seq++; recs.push({demo:true, rawName:pick(DEMO_TRAFFIC), name:pick(DEMO_TRAFFIC)+" 待剪#"+seq, mainType:"流量型", source:pick(srcs), stage:"待處理"}); }
  base.slice(0,3).forEach(u=>{ seq++; recs.push({demo:true, rawName:pick(DEMO_SALES), name:pick(DEMO_SALES)+" 製作中#"+seq, mainType:"帶貨型", source:pick(srcs), editor:u.name, claimedBy:u.name, stage:"剪輯中", claimedAt:at(dOff(0),8)}); });
  // 特別工作備註（示範）：剪片數自動計入，這裡只是少數天有「特別／額外工作」才補充
  const reportRecs=[];
  const NOTES=["製作 7 張粉專圖片（AI 文字自行修正）","與外部公司對接 2 支新片需求","協助拍攝寵粉商品圖","設計本週縮圖","開會討論下週腳本","回覆客戶私訊、整理素材"];
  base.forEach(u=>{ for(let n=-14;n<=0;n++){ if(Math.random()<0.35){ const d=dOff(n); const dstr=ds(d);
    const note=pick(NOTES);
    reportRecs.push({demo:true, id:u.name+"__"+dstr, user:u.name, date:dstr, content:note, done:true}); } } });
  BULK_BUSY=true;
  for(const rr of reportRecs){ try{ await window.DB.set("reports", rr.id, rr); }catch(e){} }
  BULK_BUSY=false;
  const ok=await bulkCreateVideos(recs);
  await delay(500); toast("已載入完整模擬資料 "+ok+" 筆，請看總覽／月排程／我的儀表板");
}
function tokenToRL(tk){ const [role,lang]=String(tk||"editor:zh").split(":"); return {role, lang: role==="editor"?(lang||"zh"):"all"}; }
async function addMember(){ const name=val("mb_name").trim(); const rl=tokenToRL(val("mb_role")); const dailyQuota=parseInt(val("mb_quota"))||0;
  if(!name){ toast("請輸入名字",true); return; }
  await write("POST","/api/users",{name,role:rl.role,lang:rl.lang,dailyQuota},"已新增成員"); }
function changeRole(name,token){ const rl=tokenToRL(token); writeAdmin("PUT","/api/users/"+name,{role:rl.role,lang:rl.lang},"已更新角色／語言"); }
function changeQuota(name,q){ writeAdmin("PUT","/api/users/"+name,{dailyQuota:parseInt(q)||0},"已更新每日 KPI"); }
function setAllQuota(n){ if(!confirm("將『所有剪輯』的每日KPI都設為 "+n+"？")) return;
  withAdmin(async()=>{ const eds=(STATE.users||[]).filter(u=>(u.role||"editor")==="editor"); let c=0; BULK_BUSY=true;
    try{ for(const u of eds){ try{ await window.DB.update("users",u.name,{dailyQuota:n}); c++; }catch(e){} } }
    finally{ BULK_BUSY=false; applyState(LAST_RAW); }
    await delay(300); toast("已將 "+c+" 位剪輯的每日KPI設為 "+n); }); }
function delMember(name){ if(!confirm("確定刪除成員「"+name+"」？")) return;
  writeAdmin("DELETE","/api/users/"+name,{},"已刪除成員"); }

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
