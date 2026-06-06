// ===================================================================
// EC-DR Firebase 版 — 主程式（資料層改接 Firestore，畫面沿用）
// 商業邏輯（排程預警 / KPI 超前落後 / 防疲乏）在前端計算。
// ===================================================================
const ROLE_LABEL = {boss:"管理員", hr:"人資", editor:"剪輯"};
const ROLE_TABS = {
  boss:   [["dash","📊 總覽"],["videos","🎞 影片庫"],["settings","⚙️ 設定"]],
  hr:     [["dash","📊 部門總覽"],["videos","🎞 影片庫"],["audit","🛡 檢核紀錄"]],
  editor: [["work","✂️ 剪輯儀表板"],["cal","📅 月排程"],["videos","🎞 影片庫"]],
};
let STATE = null, DASH = null, CUR_TAB = null, ONLINE = true, LAST_RAW = null;
const today = new Date(Date.now()+288e5).toISOString().slice(0,10); // 台灣時間 UTC+8

function currentUser(){ return localStorage.getItem("ecdr_user") || ""; }
function setUser(n){ localStorage.setItem("ecdr_user", n); }
function currentRole(){
  const u = (STATE?.users||[]).find(x=>x.name===currentUser());
  return (u && u.role) || localStorage.getItem("ecdr_role") || "editor";
}
function ownerName(){ return (STATE && STATE.settings && STATE.settings.ownerName) || "Vito"; }
const ADMIN_NAME = "管理員"; // Vito 與 Regina 共用的管理員身分（不需各自具名）
function myTabs(){ const t=(ROLE_TABS[currentRole()]||ROLE_TABS.editor).slice();
  if(currentRole()==="boss"){ t.push(["members","👥 成員管理"]); t.push(["audit","🛡 稽核紀錄"]); } return t; }
function nowIso(){ return new Date(Date.now()+288e5).toISOString().slice(0,19); } // 台灣時間 UTC+8
function hhmm(iso){ return iso? String(iso).slice(11,16) : ""; }
function weekdayZh(ds){ return "日一二三四五六"[new Date((ds||today)+"T00:00:00").getDay()]; }
function todayLabel(){ return today.slice(5).replace("-","/")+"（週"+weekdayZh(today)+"）"; }
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
function inProgressCount(name){
  let n=(STATE.videos||[]).filter(v=>v.stage==="剪輯中"&&(v.claimedBy===name||v.editor===name)).length;
  SCHED_LANGS.filter(l=>l!=="zh").forEach(l=>{ n+=(STATE.videos||[]).filter(v=>v.languages?.[l]?.status==="二創中"&&v.languages?.[l]?.claimedBy===name).length; });
  return n; }
// 某人「今天拉了幾片」（依領取日，含二創）— 用來限制每人每天最多 3 片
function pulledTodayCount(name){
  let n=(STATE.videos||[]).filter(v=>v.claimedBy===name && String(v.claimedAt||"").slice(0,10)===today).length;
  SCHED_LANGS.filter(l=>l!=="zh").forEach(l=>{ n+=(STATE.videos||[]).filter(v=>v.languages?.[l]?.claimedBy===name && String(v.languages?.[l]?.claimedAt||"").slice(0,10)===today).length; });
  return n; }
function myInProgressCount(){ return inProgressCount(currentUser()); }
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
  if(isPamperedDay(date)) return s.fridayTargets || {"寵粉":5};
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
  const cut=new Date(); cut.setDate(cut.getDate()-days); const cutD=new Date(cut.toISOString().slice(0,10)+"T00:00:00"); let c=0;
  (v.usageHistory||[]).forEach(d=>{ const ds=(d&&typeof d==="object")?d.date:d; const dd=parseDate(ds); if(dd && dd>=cutD) c++; });
  return c;
}
// 使用紀錄正規化：每次重播的 {日期, 連結, 排片人}，新舊格式相容
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
      if(body.pin!=null) patch.pin=String(body.pin);
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
      if(inProgressCount(user)>=1) throw new Error("請先把進行中的影片剪完（含上傳連結），才能再拉新片");
      if(pulledTodayCount(user)>=3) throw new Error("你今天已經拉滿 3 片囉，明天再領");
      await window.DB.update("videos",id,{claimedBy:user,claimedAt:nowIso(),assignedBy:"",editor:v.editor||user,stage:"剪輯中"}); return; }
    if(action==="assign"){ const a=body.assignee;
      if(inProgressCount(a)>=1) throw new Error(a+" 還有進行中的影片，請對方先剪完再指派");
      if(pulledTodayCount(a)>=3) throw new Error(a+" 今天已達 3 片上限");
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
    if(action==="reuse" && method==="POST"){
      const date=body.date; const link=(body.link||"").trim();
      if(!date) throw new Error("請選擇重播上片日期");
      if(!link) throw new Error("請貼上這次的社群連結");
      const day=(STATE.schedule||{})[date]||{slots:[]}; const slots=(day.slots||[]).slice();
      slots.push({videoId:id, publishedLink:link, reused:true, by:user, at:nowIso()});
      await window.DB.scheduleSet(date,{slots});
      const uh=(v.usageHistory||[]).concat([{date, link, by:user, at:nowIso()}]);
      await window.DB.update("videos", id, {totalUsed:(v.totalUsed||0)+1, usageHistory:uh});
      return;
    }
    if(action==="lang" && method==="PUT"){ const lg=seg[3]; const langs=Object.assign({},v.languages); langs[lg]=Object.assign({},langs[lg],body.lang||{}); await window.DB.update("videos",id,{languages:langs}); return; }
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
  // Regina：與 Vito 共用管理員，顯示在登入頁但不標職稱
  const rb=document.createElement("button"); rb.className="userBtn lead"; rb.textContent="Regina"; rb.onclick=reginaLogin; g.appendChild(rb);
  // 管理員（boss/owner）走密碼登入，不出現在成員名單
  const users=((STATE?.users)||[]).filter(u=>(u.role||"editor")!=="boss" && u.name!==ownerName() && u.name!=="Regina");
  if(!users.length){ const n=document.createElement("p"); n.className="muted"; n.style.width="100%"; n.style.textAlign="center"; n.textContent="其他成員尚未建立，請按「🔒 管理員登入」進入後新增"; g.appendChild(n); return; }
  // 排序：剪輯群 → HR 最後
  const rank=u=> ((u.role==="hr")?2:1);
  users.sort((a,b)=> rank(a)-rank(b) || String(a.name).localeCompare(String(b.name)));
  const mkBtn=(u)=>{ const b=document.createElement("button");
    b.className="userBtn"+((u.role==="hr")?" mgr":"");
    b.innerHTML = esc(u.name)+'<span class="role">'+(ROLE_LABEL[u.role]||"剪輯")+'</span>';
    b.onclick=()=>loginAs(u);
    return b; };
  users.forEach((u,i)=>{
    const prev=users[i-1];
    if(prev && (u.role==="hr" && prev.role!=="hr")){
      const sep=document.createElement("div"); sep.className="userSep"; g.appendChild(sep);
    }
    g.appendChild(mkBtn(u));
  });
}
// 成員登入：人資（檢核者）免密碼；剪輯以自己的密碼登入（預設 0000，本人可自改、管理員可查/重設）
function loginAs(u){
  if((u.role||"editor")==="hr"){ setUser(u.name); localStorage.setItem("ecdr_role","hr"); CUR_LANG=null; CUR_TAB=null; applyState(LAST_RAW); return; }
  const expect = u.pin ? String(u.pin) : "0000";
  const pw=prompt(u.name+" 的登入密碼（預設 0000）："); if(pw===null) return;
  if(String(pw)!==expect){ toast("密碼錯誤",true); return; }
  setUser(u.name); localStorage.setItem("ecdr_role",u.role||"editor"); CUR_LANG=null; CUR_TAB=null; applyState(LAST_RAW);
}
// Regina：與 Vito 共用管理員（登入頁顯示、不標職稱），預設密碼 0000
function reginaLogin(){
  const reg=(STATE.users||[]).find(u=>u.name==="Regina");
  const expect = (reg&&reg.pin)? String(reg.pin) : "0000";
  const pw=prompt("Regina 登入密碼（預設 0000）："); if(pw===null) return;
  if(String(pw)!==expect && String(pw)!==String(STATE.settings?.adminPassword||"1234")){ toast("密碼錯誤",true); return; }
  setUser("Regina"); localStorage.setItem("ecdr_role","boss"); CUR_LANG=null; CUR_TAB=null; applyState(LAST_RAW);
}
// 成員修改自己的密碼
function changeMyPin(){
  const me=currentUser(); const u=(STATE.users||[]).find(x=>x.name===me);
  if(!u){ toast("此帳號不需密碼",true); return; }
  if(u.pin){ const cur=prompt("輸入目前的密碼："); if(cur===null) return; if(String(cur)!==String(u.pin)){ toast("目前密碼錯誤",true); return; } }
  const p1=prompt("輸入新密碼："); if(p1===null) return; if(!String(p1).trim()){ toast("密碼不可空白",true); return; }
  const p2=prompt("再輸入一次新密碼確認："); if(p2===null) return;
  if(String(p1)!==String(p2)){ toast("兩次密碼不一致",true); return; }
  window.DB.update("users", me, {pin:String(p1).trim()}).then(()=>toast("密碼已更新")).catch(()=>toast("更新失敗，請稍後再試",true));
}
// 管理員：設定/重設某成員密碼
function setMemberPin(name){
  const u=(STATE.users||[]).find(x=>x.name===name)||{};
  const p=prompt("設定「"+name+"」的登入密碼（交給本人，之後他可自行修改）：", u.pin||""); if(p===null) return;
  if(!String(p).trim()){ toast("密碼不可空白",true); return; }
  writeAdmin("PUT","/api/users/"+name,{pin:String(p).trim()},"已設定 "+name+" 的密碼");
}
// 管理員：把所有成員密碼一次設成同一組（上線時方便發放）
async function setAllPin(){
  const p=prompt("把『所有剪輯／人資成員』的登入密碼統一設為（之後各自可改）："); if(p===null) return;
  if(!String(p).trim()){ toast("密碼不可空白",true); return; }
  await withAdmin(async ()=>{ let c=0;
    for(const u of (STATE.users||[]).filter(x=>(x.role||"editor")==="editor")){ try{ await window.DB.update("users",u.name,{pin:String(p).trim()}); c++; }catch(e){} }
    toast("已設定 "+c+" 位剪輯的密碼"); });
}
// 管理員（owner）以密碼進入；成員管理／稽核只有這條路徑能看到
function ownerLogin(){
  if(!STATE){ toast("連線中，請稍候再試",true); return; }
  const pw=prompt("管理員密碼："); if(pw===null) return;
  if(String(pw)!==String(STATE.settings?.adminPassword||"1234")){ toast("密碼錯誤",true); return; }
  setUser(ADMIN_NAME); localStorage.setItem("ecdr_role","boss"); CUR_LANG=null; CUR_TAB=null; applyState(LAST_RAW);
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
  const isBoss=localStorage.getItem("ecdr_role")==="boss"; // 共用管理員不在成員名單內，靠角色放行
  if(currentUser() && (has||isBoss)){
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
    const msgs=(STATE.messages||[]).filter(m=>m.to===r.name);
    const pendN=msgs.filter(m=>!m.done).length, unreadN=msgs.filter(m=>!m.read && !m.done).length;
    const week = last7Detail(r.name, r.lang, r.todayQuota);
    const weekRows = week.map(w=>`<tr${w.ds===today?' style="font-weight:700"':''}>
        <td style="white-space:nowrap">${w.ds.slice(5)}<span class="muted">(${weekdayZh(w.ds)})</span>${w.ds===today?'·今':''}</td>
        <td style="text-align:center"><span class="${w.met?'pos':'neg'}">${w.n}</span><span class="muted">/${r.todayQuota}</span></td>
        <td style="font-size:11px;line-height:1.35">${w.other?esc(w.other):'<span class="muted">—</span>'}</td>
      </tr>`).join("");
    return `<div class="ucard ${good?'good':'bad'}">
      <div class="uh">
        <span class="nm"><span class="statusdot" style="background:${dotCol}"></span>${esc(r.name)} <span class="muted" style="font-size:11px;font-weight:500">${LMAP[r.lang]||""}</span></span>
        <span style="font-weight:800;color:${r.todayMet?'var(--green)':'var(--muted)'}">今日 ${r.todayDone}/${r.todayQuota}</span>
      </div>
      <div class="progbar"><i style="width:${pct}%;background:${dotCol}"></i></div>
      <div style="font-size:13px;margin:5px 0;display:flex;justify-content:space-between">
        <span class="${good?'pos':'neg'}">${r.diff>0?"超前 +"+r.diff:(r.diff<0?"落後 "+r.diff:"達標")}</span>
        <span class="muted">本月 ${r.totalDone}/${r.expected}・均 ${r.avgMin!=null?minToText(r.avgMin):"-"}</span>
      </div>
      <table class="wk"><thead><tr><th>近7天</th><th style="text-align:center">剪片</th><th>其他工作內容</th></tr></thead>
        <tbody>${weekRows}</tbody></table>
      <div class="row" style="gap:6px;margin-top:8px;align-items:center">
        ${currentRole()==='boss'?`<button class="btn sm sec" onclick="sendTask('${esc(r.name)}')">✉ 交辦／留言</button>`:''}
        ${pendN?`<span class="pill wa">交辦中 ${pendN}${unreadN?'・未讀 '+unreadN:'・已讀'}</span>`:''}
      </div>
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
  const editorsAll=(STATE.users||[]).filter(u=>(u.role||"editor")==="editor");
  const liveRows = editorsAll.map(u=>{ const s=editorStatus(u);
    const dot = s.startAt? (s.met?'var(--green)':'var(--amber)') : '#cbd5e1';
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;background:var(--panel2);border-radius:10px;border-left:4px solid ${dot}">
      <div style="min-width:0">
        <div style="font-weight:700">${esc(s.name)} <span class="muted" style="font-size:11px;font-weight:500">${s.startAt?('🟢 '+hhmm(s.startAt)+' 開工'):'⚪ 未開工'}</span></div>
        <div class="muted" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.current)}</div>
      </div>
      <div style="text-align:right;flex:none">
        <div style="font-weight:800;color:${s.met?'var(--green)':'var(--red)'}">${s.doneToday}/${s.q}</div>
        <div class="muted" style="font-size:11px">今日完成</div>
      </div>
    </div>`; }).join("") || `<p class="muted">尚無剪輯成員</p>`;
  const liveCard = `<div class="card"><b>🟢 今日團隊即時</b>
    <span class="muted" style="font-size:12px">　每人幾點開工・現在在做什麼・完成幾支</span>
    <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">${liveRows}</div></div>`;
  // 全體剪輯效率（近 30 天平均每日完成 ＋ 平均每支剪輯耗時）
  const PDAYS=30;
  const perf=editorsAll.map(u=>{ const langs=(u.lang==="all")?SCHED_LANGS:[u.lang||"zh"];
    let total=0; const durs=[];
    for(let i=0;i<PDAYS;i++){ const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()-i); const ds=d.toISOString().slice(0,10);
      (STATE.videos||[]).forEach(v=>{ if(langs.some(lg=>langFinishedOn(v,lg,u.name,ds))){ total++; const dm=videoDur(v,langs); if(dm>0) durs.push(dm); } });
    }
    return {name:u.name, avgPerDay:+(total/PDAYS).toFixed(2), avgDur:durs.length?Math.round(durs.reduce((a,b)=>a+b,0)/durs.length):0};
  });
  const perfChart=chartCanvas("dash_perf",{type:"bar",data:{labels:perf.map(p=>p.name),datasets:[{label:"平均每日完成",data:perf.map(p=>p.avgPerDay),backgroundColor:"#2563eb"}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}},180);
  const perfPills=perf.map(p=>`<span class="pill" style="margin:2px 4px 2px 0;display:inline-block">${esc(p.name)}　均 ${p.avgDur?minToText(p.avgDur):"-"}/支</span>`).join("");
  const perfCard=`<div class="card"><b>📈 全體剪輯效率（近 ${PDAYS} 天）</b>
    <p class="muted" style="font-size:12px">平均每日完成片數（長條）＋平均每支剪輯耗時（領取→完成）</p>
    ${perf.length?perfChart:'<p class="muted">尚無資料</p>'}
    <div style="margin-top:8px">${perfPills}</div></div>`;
  // ===== ① 昨日工作總覽 =====
  const yd=new Date(today+"T00:00:00"); yd.setDate(yd.getDate()-1); const yds=yd.toISOString().slice(0,10);
  const yRows=computeWorkload(yds).rows;
  const yTotal=yRows.reduce((a,r)=>a+r.todayDone,0);
  const yQuotaSum=yRows.reduce((a,r)=>a+r.todayQuota,0);
  const ydDow=yd.getDay(); const ydWork=ydDow!==0&&ydDow!==6;
  const yMissN=ydWork? yRows.filter(r=>r.todayDone<r.todayQuota).length : 0;
  const yChips=yRows.map(r=>{ const ok=r.todayDone>=r.todayQuota; const col=(!ydWork)?'var(--muted)':(ok?'var(--green)':'var(--red)');
    return `<span class="pill" style="margin:2px 4px 2px 0;display:inline-block;border-color:${col};color:${col}">${esc(r.name)} ${r.todayDone}/${r.todayQuota}${(ydWork&&!ok)?' ⚠':''}</span>`; }).join("")||'<span class="muted">尚無剪輯成員</span>';
  // 昨日大家的其他工作（含交辦）
  const yOther=[]; (STATE.reports||[]).filter(r=>r.date===yds).forEach(r=>otherItems(r).forEach(s=>yOther.push((s.task?"【交辦】":"")+r.user+"："+s.t+(s.m?`（${s.m}分）`:""))));
  const yCard=`<div class="card">
    <div class="row" style="justify-content:space-between;align-items:baseline">
      <b>📅 昨日工作總覽</b><span class="muted" style="font-size:12px">${yds}（${weekdayZh(yds)}）</span></div>
    <div style="display:flex;gap:16px;align-items:baseline;margin:8px 0">
      <div><span style="font-size:34px;font-weight:900">${yTotal}</span><span class="muted"> / ${yQuotaSum} 支完成</span></div>
      ${ydWork?`<span class="pill ${yMissN?'em':'ok'}">${yMissN?('未達標 '+yMissN+' 人'):'全員達標 ✅'}</span>`:`<span class="muted">（假日）</span>`}
    </div>
    <div>${yChips}</div>
    ${yOther.length?`<div class="muted" style="font-size:12px;margin-top:8px;line-height:1.5">🧩 其他工作：${esc(yOther.join("、"))}</div>`:""}
  </div>`;

  // ===== ② 今日進度（精簡一覽）=====
  const stat=(n,l,col)=>`<div style="flex:1;min-width:88px;text-align:center;padding:10px 6px;background:var(--panel2);border-radius:10px">
    <div style="font-size:25px;font-weight:900;color:${col||'var(--txt)'}">${n}</div><div class="muted" style="font-size:12px">${l}</div></div>`;
  const progCard=`<div class="card"><b>📊 今日進度</b>
    <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
      ${stat(runway+' 天','預排天數',safeCol)}
      ${stat(newSrc+' 支','新片庫存',srcCol)}
      ${stat(p.今日已排+'/'+p.每日目標,'今日已上片')}
      ${stat(p.落後人數,'落後人數',p.落後人數?'var(--red)':'var(--green)')}
      ${stat(p.剪輯中,'剪輯中')}
    </div>
    ${(runway<PRETARGET||srcLow)?`<p style="font-size:12px;margin-top:8px;color:var(--red)">⚠ ${runway<PRETARGET?'預排不足 15 天，請往後補排；':''}${srcLow?'片源低於 '+lowTh+' 支，需加拍補片源。':''}</p>`:""}
  </div>`;

  // ===== ③ 交辦事項（快速指派＋狀態）=====
  const allMsgs=STATE.messages||[];
  const pendTotal=allMsgs.filter(m=>!m.done).length;
  const taskRows=yRows.map(r=>{
    const msgs=allMsgs.filter(m=>m.to===r.name);
    const pend=msgs.filter(m=>!m.done).length, unread=msgs.filter(m=>!m.read&&!m.done).length;
    const doneToday=msgs.filter(m=>m.done && String(m.doneAt||"").slice(0,10)===today).length;
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;background:var(--panel2);border-radius:10px">
      <span style="font-weight:700;min-width:0">${esc(r.name)}
        ${pend?`<span class="pill wa" style="margin-left:6px">交辦中 ${pend}${unread?'・未讀 '+unread:''}</span>`:''}
        ${doneToday?`<span class="pill ok" style="margin-left:4px">今日完成 ${doneToday}</span>`:''}</span>
      ${currentRole()==='boss'?`<button class="btn sm" onclick="sendTask('${esc(r.name)}')">✉ 交辦</button>`:''}
    </div>`; }).join("")||'<p class="muted">尚無成員</p>';
  const taskCard=`<div class="card">
    <div class="row" style="justify-content:space-between"><b>✉ 交辦事項</b>
      <span class="pill ${pendTotal?'wa':'ok'}">未完成 ${pendTotal}</span></div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">${taskRows}</div>
    <p class="muted" style="font-size:11px;margin-top:6px">點「✉ 交辦」指派工作；剪輯按已讀→完成並填工時後，會回報到「今日完成」與下方詳細。</p>
  </div>`;

  // ===== 詳細數據（預設收合，畫面保持精簡）=====
  const peopleCard=`<div class="card"><b>👥 每日匯報・近 7 天（每人每天剪幾片＋當天其他工作，綠＝達標、紅＝未達）</b>
    <div class="grid cols3" style="margin-top:10px">${userCards}</div></div>`;
  const detail=`<details style="margin-top:6px">
    <summary style="cursor:pointer;font-weight:700;padding:10px 0">📂 詳細數據（即時團隊・近 7 天・效率・月排程）</summary>
    ${liveCard}
    ${peopleCard}
    ${perfCard}
    ${viewCal()}
  </details>`;

  return `
  <h2>📊 總覽 <span class="muted" style="font-size:13px">${today}（${weekdayZh(today)}）</span></h2>
  ${demoBanner}
  ${yCard}
  ${progCard}
  ${taskCard}
  ${detail}`;
}
// 某人近 7 天明細：每天剪片數＋當日其他（特別）工作內容
function last7Detail(name, lang, q){
  const langs=(lang==="all")?SCHED_LANGS:[lang||"zh"];
  const out=[];
  for(let i=6;i>=0;i--){ const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()-i); const ds=d.toISOString().slice(0,10);
    const n=(STATE.videos||[]).reduce((a,v)=>a+(langs.some(lg=>langFinishedOn(v,lg,name,ds))?1:0),0);
    const rep=(STATE.reports||[]).find(x=>x.user===name && x.date===ds);
    let other=""; const items=otherItems(rep);
    if(items.length){ other=items.map(s=>(s.task?"【交辦】":"")+s.t+(s.m?`（${s.m}分）`:"")).join("、"); }
    else if(rep){ other=(rep.content||"").trim(); }
    out.push({ds, n, other, met: q>0? n>=q : true});
  }
  return out;
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
  // 顯示規則：排滿→綠、10 天內未排→大紅色、其餘未排→灰
  const d10=new Date(today+"T00:00:00"); d10.setDate(d10.getDate()+10); const d10s=d10.toISOString().slice(0,10);
  let cells = "";
  for(let i=0;i<startDow;i++) cells += `<div class="day out"></div>`;
  for(let d=1;d<=days;d++){
    const ds = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const isToday = ds===today;
    const tmk = isToday?`<span class="todaymk">今天</span>`:"";
    const within10 = ds>=today && ds<=d10s;
    if(!isZh){ const cnt=dayLangCount(ds,lang);
      const cls = cnt>0?"filled":(within10?"bad urgent":"blank");
      cells += `<div class="day ${cls} ${isToday?'today':''}" onclick="openDay('${ds}')">${tmk}<div class="dnum">${d}</div>
        <div class="big">${cnt||"·"}</div></div>`;
      continue; }
    const b=dayBreakdown(ds);
    const filled = b.total>=Math.max(1,b.target);
    const cls = filled ? "filled" : (within10 ? "bad urgent" : "blank");
    const km={"流量型":"流","帶貨型":"帶","寵粉":"寵"};
    const defTxt=Object.keys(b.deficits||{}).map(k=>(km[k]||k)+"缺"+b.deficits[k]);
    cells += `<div class="day ${cls} ${isToday?'today':''}" onclick="openDay('${ds}')">
      ${tmk}<div class="dnum">${d}</div>
      <div class="big">${b.total||"·"}<span style="font-size:14px;color:var(--muted);font-weight:600">${b.total?("/"+b.target):""}</span></div>
      ${(!filled && defTxt.length)?`<div class="pmk" style="color:var(--red)">${defTxt.join("・")}</div>`:(filled?`<div class="pmk" style="color:var(--green)">已排滿</div>`:"")}
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
    <p class="muted" style="margin-top:12px;font-size:13px">月排程為<b>唯讀</b>：剪輯按「完成」時自動排入。<b style="color:var(--green)">綠</b>=已排滿、<b style="color:#888">灰</b>=尚未排、<b style="color:var(--red)">大紅色</b>=10 天內還沒排好（要趕快補）。點任一天可<b>改上片日期</b>（不可刪除）。</p>
  </div>`;
}
function calMove(n){ let [y,m]=CAL_YM; m+=n; if(m<0){m=11;y--;} if(m>11){m=0;y++;} CAL_YM=[y,m]; render(); }

function openDay(ds){
  const target = STATE.settings?.dailyPublishTarget||4;
  const lang = curLang(); const isZh=(lang==="zh");
  const list = dayLangList(ds, lang);
  const rows = list.map((it)=>{
    const v = vid(it.videoId);
    const reused = isZh && it.slot && it.slot.reused;
    const ed = isZh ? (v?.editor||"") : (v?.languages?.[lang]?.editor||"");
    const link = reused ? (it.slot.publishedLink||"") : (isZh ? (v?.publishedLink||v?.driveFolder||"") : (v?.languages?.[lang]?.publishedLink||v?.languages?.[lang]?.driveFolder||""));
    const onChg = reused ? `moveReuse('${it.videoId}','${ds}',this.value)`
                         : (isZh?`rescheduleVid('${it.videoId}',this.value,'${ds}')`:`rescheduleLang('${it.videoId}','${lang}',this.value,'${ds}')`);
    return `<tr>
      <td data-label="影片"><a href="javascript:void(0)" onclick="editVideo('${it.videoId}')">${esc(v?(v.name||v.rawName):(it.videoId||""))}</a> ${v?typeTag(v.mainType):""}${reused?' <span class="tag" style="background:#ede9fe;color:#6d28d9">♻ 重播</span>':''}</td>
      <td data-label="剪輯">${reused?'<span class="muted">'+esc(it.slot.by||"")+'（重播）</span>':esc(ed)}</td>
      <td data-label="連結">${link?`<a href="${esc(link)}" target="_blank">開啟</a>`:'<span class="muted">—</span>'}</td>
      <td data-label="改上片日"><input type="date" value="${ds}" style="font-size:12px;padding:4px" onchange="${onChg}"></td>
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
      <table class="responsive"><thead><tr><th>影片</th><th>剪輯</th><th>連結</th><th>改上片日</th></tr></thead>
      <tbody>${rows||`<tr><td class="muted">當日尚無影片</td></tr>`}</tbody></table>
      <p class="muted" style="font-size:12px;margin-top:8px">月排程唯讀：影片由剪輯完成後自動排入。只能改上片日期（移動時間），不能刪除或取消。</p>
    </div>`, null);
}
// 排舊片重播：選一支已完成的舊片，排到未來某天，記錄日期＋連結
function reuseModal(){
  const done=(STATE.videos||[]).filter(v=>["已完成","已上片"].includes(v.stage))
    .sort((a,b)=>String(b.finishedAt||b.scheduledDate||"").localeCompare(String(a.finishedAt||a.scheduledDate||"")));
  if(!done.length){ toast("目前沒有已完成的舊片可重播",true); return; }
  const opts=done.map(v=>`<option value="${v.id}">${esc(v.name||v.rawName||v.id)}（已用 ${usageList(v).length} 次）</option>`).join("");
  const tmr=new Date(today+"T00:00:00"); tmr.setDate(tmr.getDate()+1); const def=tmr.toISOString().slice(0,10);
  showModal("♻ 排舊片重播（重複使用）", `
    <label>選擇舊片</label><select id="ru_vid" onchange="window._ruInfo(this.value)">${opts}</select>
    <div id="ru_info" class="muted" style="font-size:12px;margin:6px 0"></div>
    <label>這次上片日期（可排未來）</label><input id="ru_date" type="date" value="${def}" oninput="ruGate()">
    <label>這次的社群連結</label><input id="ru_link" placeholder="這次貼文／預約連結" oninput="ruGate()">
    <p class="muted">每次重播都會分別記錄日期與連結，並計入使用次數。</p>
  `, async ()=>{
    const id=val("ru_vid"); const date=val("ru_date"); const link=val("ru_link").trim();
    if(!id){ toast("請選擇舊片",true); return false; }
    return await write("POST",`/api/videos/${id}/reuse`,{date,link},"已排入重播並記錄使用");
  });
  window._ruInfo=(id)=>{ const v=vid(id); const box=document.getElementById("ru_info"); if(!box) return;
    const us=usageList(v); box.innerHTML = us.length? ("已用 <b>"+us.length+"</b> 次："+us.map(u=>esc(u.date)+(u.link?`（<a href="${esc(u.link)}" target="_blank">連結</a>）`:"")).join("、")) : "尚無使用紀錄"; };
  window._ruInfo(done[0].id); ruGate();
}
function ruGate(){ const ok=val("ru_date")&&val("ru_link").trim(); const b=document.getElementById("modalConfirm"); if(b){ b.disabled=!ok; b.style.opacity=ok?"":"0.5"; b.style.cursor=ok?"":"not-allowed"; } }
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
function rescheduleLang(id,lang,newDate,ds){ if(!newDate||newDate===ds) return;
  const v=vid(id); const L=Object.assign({}, v?.languages?.[lang]||{}); L.scheduledDate=newDate;
  write("PUT",`/api/videos/${id}/lang/${lang}`,{lang:L},"已改上片日至 "+newDate).then(ok=>{ if(ok) openDay(ds); }); }

// ---- 我的工作台（依語言別） ----
function viewWork(){
  const me = currentUser(); const lang = curLang(); const isZh = (lang==="zh");
  const quota = userQuota(me); const busy = myInProgressCount()>=1; const pulledToday = pulledTodayCount(me); const dayFull = pulledToday>=3; const atLimit = busy||dayFull;
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
  const myRep=(STATE.reports||[]).find(x=>x.user===me && x.date===today)||{};
  const clockBar = myRep.endAt
    ? `<div class="card" style="padding:10px 14px"><span class="muted">📅 ${todayLabel()}　</span><span style="font-weight:700">🔴 已下班 ${hhmm(myRep.endAt)}</span><span class="muted">　開工 ${hhmm(myRep.startAt)}・今日工時 ${myRep.startAt?minToText(durationMin(myRep.startAt,myRep.endAt)):"-"}　辛苦了！</span></div>`
    : myRep.startAt
    ? `<div class="card" style="padding:10px 14px"><span class="muted">📅 ${todayLabel()}　</span><span style="color:var(--green);font-weight:700">🟢 已開工 ${hhmm(myRep.startAt)}</span><span class="muted">　今天加油！</span></div>`
    : `<div class="card" style="text-align:center;border-color:var(--green)"><p class="muted" style="font-size:13px;margin-bottom:8px">📅 ${todayLabel()}</p><button class="btn" onclick="clockIn()">🟢 開工打卡</button><p class="muted" style="font-size:12px;margin-top:6px">上班先打卡，老闆才看得到你今天幾點開始</p></div>`;
  const meU=myUser()||{}; const meLangs=(meU.lang==="all")?SCHED_LANGS:[meU.lang||lang];
  return `
  <h2>✂️ 剪輯個人儀表板（${esc(me)}）　<button class="btn sm sec" onclick="changeMyPin()" style="font-size:12px;vertical-align:middle">🔑 改密碼</button></h2>
  ${switcher}
  ${clockBar}
  ${inboxCard(me)}
  <div class="card">
    <div class="row" style="justify-content:space-between">
      <b>📌 每日主要工作（${LANG_LABEL[lang]||lang}）</b>
      <span class="pill ${myDoneToday>=quota?'ok':'wa'}">今日完成 ${myDoneToday}/${quota}</span>
    </div>
    <div class="progbar"><i style="width:${quota?Math.min(100,myDoneToday/quota*100):100}%"></i></div>
  </div>
  <div class="card">
    <div class="row" style="justify-content:space-between"><b>🎬 我進行中的影片</b>
      <span class="pill ${dayFull?'wa':'ok'}">今日已領 ${pulledToday}/3</span></div>
    ${busy?`<p class="muted" style="margin:4px 0 0;color:var(--red)">⚠ 還有進行中的影片，剪完並填上傳連結後才能再拉新片</p>`:(dayFull?`<p class="muted" style="margin:4px 0 0">今天已拉滿 3 片，明天再領</p>`:"")}
    <table class="responsive"><thead><tr><th>影片</th><th>片源</th><th>負責</th><th></th></tr></thead>
    <tbody>${mine.map(v=>matRow(v,false)).join("")||`<tr><td class="muted">目前沒有進行中的影片，可從下方認領</td></tr>`}</tbody></table>
    ${specialTasksBlock(myRep)}
  </div>
  <div class="card">
    <div class="row" style="justify-content:space-between"><b>${isZh?"未處理片源":"待二創（"+(LANG_LABEL[lang]||lang)+"）"}</b>
      ${isZh?`<button class="btn sm" onclick="newVideo()">＋ 新增片源</button>`:""}</div>
    <table class="responsive"><thead><tr><th>影片</th><th>片源</th><th>負責</th><th></th></tr></thead>
    <tbody>${pool.map(v=>matRow(v,true)).join("")||`<tr><td class="muted">${isZh?"目前沒有未處理片源":"目前沒有待二創的影片（要中文母版先完成）"}</td></tr>`}</tbody></table>
  </div>
  ${isZh?`<div class="card">
    <div class="row" style="justify-content:space-between"><b>♻ 舊片重播（重複使用）</b>
      <button class="btn sm" onclick="reuseModal()">＋ 排舊片進月歷</button></div>
    <p class="muted" style="font-size:12px;margin-top:4px">把已完成的舊片再排到未來某天上片。系統會記錄這支片用過幾次、每次的日期與連結（在影片詳情可查）。</p>
  </div>`:""}
  ${workHoursCard(me, meLangs)}
  ${teamOtherWorkToday()}
  ${myDailyReport(me)}`;
}
// 今天大家的「其他工作」（含已完成的老闆交辦）— 所有人都看得到
function teamOtherWorkToday(){
  const rows=[];
  (STATE.reports||[]).filter(r=>r.date===today).forEach(r=>{
    otherItems(r).forEach(s=>rows.push({user:r.user, t:s.t, m:s.m, task:s.task})); });
  if(!rows.length) return "";
  rows.sort((a,b)=>String(a.user).localeCompare(String(b.user)));
  return `<div class="card">
    <div class="row" style="justify-content:space-between"><b>🧩 今天大家的其他工作</b><span class="muted" style="font-size:12px">所有人都看得到</span></div>
    <table class="responsive"><thead><tr><th>成員</th><th>工作內容</th><th>時間</th></tr></thead>
    <tbody>${rows.map(r=>`<tr>
      <td data-label="成員">${esc(r.user)}</td>
      <td data-label="內容">${r.task?'<span class="tag" style="background:#ede9fe;color:#6d28d9">交辦</span> ':''}${esc(r.t)}</td>
      <td data-label="時間">${r.m?r.m+" 分":'<span class="muted">—</span>'}</td></tr>`).join("")}</tbody></table>
  </div>`;
}
// 今日特別工作：最多 3 項，每項一個時間鈕（每按 +30 分，上限 2 小時，再按歸 0）
function specialTasksBlock(rep){
  let sp=rep&&rep.special; if(!sp||!sp.length){ sp=[{t:(rep&&rep.content)||"",m:0},{t:"",m:0},{t:"",m:0}]; }
  sp=sp.slice(0,3); while(sp.length<3) sp.push({t:"",m:0});
  const rows=sp.map((s,i)=>`<div class="row" style="gap:8px;margin-top:6px;align-items:center">
      <span class="muted" style="width:16px;font-weight:700">${i+1}</span>
      <input id="rp_t${i}" style="flex:1" placeholder="特別／額外工作（沒有可留空）" value="${esc(s.t||"")}">
      <button class="btn sm sec" id="rp_m${i}" data-min="${s.m||0}" onclick="cycleMin(this)" style="white-space:nowrap;min-width:78px">⏱ ${(s.m||0)?((s.m)+" 分"):"0 分"}</button>
    </div>`).join("");
  return `<div style="margin-top:14px;border-top:1px solid var(--line);padding-top:10px">
    <b>📝 今日特別工作</b><span class="muted" style="font-size:12px">　最多 3 項；時間鈕每按 +30 分（上限 2 小時，再按歸 0）</span>
    ${rows}
    <div class="row" style="gap:8px;margin-top:10px">
      <button class="btn sm sec" onclick="saveSpecial(false)">💾 儲存特別工作</button>
      <button class="btn" onclick="saveSpecial(true)">🔴 送出今日匯報下班</button>
    </div>
    <p class="muted" style="font-size:11px;margin-top:4px">剪片數系統自動計入；特別工作時間會算進「其他工時」。「送出下班」＝停止今日計時。</p>
  </div>`;
}
function cycleMin(btn){ let m=(+btn.dataset.min||0); m=(m>=120)?0:m+30; btn.dataset.min=m; btn.textContent="⏱ "+(m?(m+" 分"):"0 分"); }
function collectSpecial(){ const arr=[]; for(let i=0;i<3;i++){ const t=(val("rp_t"+i)||"").trim();
    const b=document.getElementById("rp_m"+i); const m=b?(+b.dataset.min||0):0; arr.push({t,m}); } return arr; }
function specialToContent(arr){ return arr.filter(s=>s.t).map((s,i)=>`${i+1}. ${s.t}${s.m?`（${s.m}分）`:""}`).join("\n"); }
// 某份日報的「其他工作」項目：手寫特別工作(special) + 已完成的老闆交辦(tasks)
function otherItems(r){ if(!r) return [];
  const sp=(Array.isArray(r.special)?r.special:[]).filter(s=>s&&s.t).map(s=>({t:s.t, m:s.m||0, task:false}));
  const tk=(Array.isArray(r.tasks)?r.tasks:[]).filter(s=>s&&s.t).map(s=>({t:s.t, m:s.m||0, task:true}));
  return sp.concat(tk); }
async function saveSpecial(clockOut){ const me=currentUser(); const arr=collectSpecial(); const content=specialToContent(arr);
  const old=(STATE.reports||[]).find(x=>x.user===me && x.date===today)||{};
  const end=clockOut?nowIso():(old.endAt||"");
  const rec={id:me+"__"+today, user:me, date:today, special:arr, tasks:old.tasks||[], content, done:!!content, startAt:old.startAt||"", endAt:end};
  try{ await window.DB.set("reports", rec.id, rec);
    if(clockOut){ const w=old.startAt?("　今日工時 "+minToText(durationMin(old.startAt,end))):""; toast("已送出今日匯報，下班打卡 "+hhmm(end)+"，辛苦了！"+w); }
    else toast("已儲存特別工作");
  }catch(e){ toast("失敗，請稍後再試",true); } }
// ---- 管理員留言／交辦（輕量版）----
function sendTask(name){
  showModal("✉ 交辦／留言給 "+name, `
    <textarea id="tk_text" style="min-height:110px" placeholder="輸入交辦事項或留言…（對方一進儀表板就會看到）"></textarea>
  `, async ()=>{
    const text=val("tk_text").trim(); if(!text){ toast("請輸入內容",true); return false; }
    const id="msg-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    const rec={id, to:name, from:currentUser(), text, at:nowIso(), read:false, readAt:"", done:false, doneAt:""};
    try{ await window.DB.set("messages", id, rec); toast("已送出給 "+name); return true; }
    catch(e){ toast("送出失敗，請稍後再試",true); return false; }
  });
}
async function markMsg(id, kind){ const m=(STATE.messages||[]).find(x=>x.id===id); if(!m) return;
  const patch = (kind==="done")?{done:true, doneAt:nowIso(), read:true, readAt:m.readAt||nowIso()}:{read:true, readAt:nowIso()};
  try{ await window.DB.update("messages", id, patch); }catch(e){ toast("更新失敗，請稍後再試",true); } }
// 完成老闆交辦：自己填工時 → 記入今日「其他工作」(大家都看得到、也上儀表板)
function doneTask(id){
  const m=(STATE.messages||[]).find(x=>x.id===id); if(!m) return;
  showModal("完成交辦：填上花費時間", `
    <div style="white-space:pre-wrap;padding:10px;background:var(--panel2);border-radius:8px">${esc(m.text)}</div>
    <label style="margin-top:10px">這項工作花了多少時間（分鐘）</label>
    <input id="tk_min" type="number" min="0" step="5" value="30" placeholder="分鐘">
    <p class="muted" style="font-size:12px">完成後會記入今天的「其他工作」，工時會算進你的工時分配，主管與同事都看得到。</p>
  `, async ()=>{
    const me=currentUser(); const min=Math.max(0,parseInt(val("tk_min"))||0);
    try{
      await window.DB.update("messages", id, {read:true, readAt:m.readAt||nowIso(), done:true, doneAt:nowIso(), doneBy:me, minutes:min});
      const rid=me+"__"+today; const old=(STATE.reports||[]).find(x=>x.id===rid)||{};
      const tasks=Array.isArray(old.tasks)?old.tasks.slice():[];
      tasks.push({t:m.text, m:min, from:m.from||"管理員", at:nowIso()});
      const rec=Object.assign({}, old, {id:rid, user:me, date:today, tasks, startAt:old.startAt||"", endAt:old.endAt||""});
      await window.DB.set("reports", rid, rec);
      toast("已完成交辦，記入其他工作 "+min+" 分"); return true;
    }catch(e){ toast("更新失敗，請稍後再試",true); return false; }
  });
}
// 剪輯收件匣：未完成的交辦／留言（紅色提醒）
function inboxCard(me){
  const msgs=(STATE.messages||[]).filter(m=>m.to===me && !m.done).sort((a,b)=>String(b.at||"").localeCompare(String(a.at||"")));
  if(!msgs.length) return "";
  return `<div class="card" style="border-color:var(--red);background:var(--redbg)">
    <b>✉ 老闆交辦／留言（${msgs.length}）</b>
    ${msgs.map(m=>`<div style="margin-top:8px;padding:10px;background:var(--panel);border-radius:8px">
       <div style="white-space:pre-wrap">${esc(m.text)}</div>
       <div class="muted" style="font-size:11px;margin-top:4px">${esc(m.from||"管理員")}・${esc((m.at||"").slice(5,16).replace("T"," "))}${m.read?'・已讀':'・<b style="color:var(--red)">未讀</b>'}</div>
       <div class="row" style="gap:6px;margin-top:6px">
         ${!m.read?`<button class="btn sm sec" onclick="markMsg('${m.id}','read')">標示已讀</button>`:''}
         <button class="btn sm" onclick="doneTask('${m.id}')">完成✔（填工時）</button></div>
     </div>`).join("")}</div>`;
}
// 工時分配：剪輯工時（領取→完成）vs 其他工時（特別工作分鐘），以每日 8 小時計
function workHoursCard(me, langs){
  const BASE=480;
  const editMin=(ds)=>(STATE.videos||[]).reduce((a,v)=>a+(langs.some(lg=>langFinishedOn(v,lg,me,ds))?videoDur(v,langs):0),0);
  const otherMin=(ds)=>{ const r=(STATE.reports||[]).find(x=>x.user===me && x.date===ds); return otherItems(r).reduce((a,s)=>a+(s.m||0),0); };
  const eToday=editMin(today), oToday=otherMin(today);
  let eSum=0,oSum=0,dN=0;
  for(let i=0;i<28 && dN<14;i++){ const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()-i); const dow=d.getDay(); if(dow===0||dow===6) continue; dN++;
    const ds=d.toISOString().slice(0,10); eSum+=editMin(ds); oSum+=otherMin(ds); }
  const eAvg=dN?Math.round(eSum/dN):0, oAvg=dN?Math.round(oSum/dN):0;
  const pct=x=>Math.round(x/BASE*100);
  const bar=(e,o)=>{ const ep=Math.min(100,e/BASE*100), op=Math.min(100-ep,o/BASE*100), idle=Math.max(0,100-ep-op);
    return `<div style="display:flex;height:22px;border-radius:6px;overflow:hidden;background:var(--panel2);margin-top:4px">
      <div style="width:${ep}%;background:#2563eb"></div><div style="width:${op}%;background:#d97706"></div><div style="width:${idle}%"></div></div>`; };
  const legend=(e,o)=>`<span class="muted" style="font-size:12px"><span style="color:#2563eb">■</span> 剪輯 ${minToText(e)}（${pct(e)}%）　<span style="color:#d97706">■</span> 其他 ${minToText(o)}（${pct(o)}%）</span>`;
  return `<div class="card"><b>⏱ 我的工時分配</b><span class="muted" style="font-size:12px">　以每日 8 小時計</span>
    <div style="margin-top:10px"><div class="row" style="justify-content:space-between"><span style="font-size:13px"><b>今天</b></span>${legend(eToday,oToday)}</div>${bar(eToday,oToday)}</div>
    <div style="margin-top:12px"><div class="row" style="justify-content:space-between"><span style="font-size:13px"><b>近 ${dN} 個工作日平均</b> <span class="muted">（不含六日）</span></span>${legend(eAvg,oAvg)}</div>${bar(eAvg,oAvg)}</div>
  </div>`;
}
// 上班開工打卡（記 reports.startAt，老闆即時狀態列才看得到「幾點開工」）
async function clockIn(){ const me=currentUser(); const id=me+"__"+today;
  const rep=(STATE.reports||[]).find(x=>x.user===me && x.date===today) || {id,user:me,date:today,content:""};
  if(rep.startAt){ toast("今天已經開工囉 "+hhmm(rep.startAt)); return; }
  const rec=Object.assign({}, rep, {id, user:me, date:today, startAt:nowIso()});
  try{ await window.DB.set("reports", id, rec); toast("開工！今天加油 💪"); }catch(e){ toast("打卡失敗，請稍後再試",true); } }
// 推導某剪輯今日即時狀態：開工時間、正在做什麼、完成數
function editorStatus(u){
  const name=u.name; const langs=(u.lang==="all")?SCHED_LANGS:[u.lang||"zh"];
  const rep=(STATE.reports||[]).find(x=>x.user===name && x.date===today)||{};
  const q=userQuota(name);
  const doneToday=(STATE.videos||[]).reduce((n,v)=>n+(langs.some(lg=>langFinishedOn(v,lg,name,today))?1:0),0);
  const inProg=[];
  (STATE.videos||[]).forEach(v=>{
    if(v.stage==="剪輯中" && (v.claimedBy===name||v.editor===name)) inProg.push(v.name||v.rawName||"(未命名)");
    langs.forEach(lg=>{ if(lg!=="zh" && v.languages?.[lg]?.status==="二創中" && v.languages?.[lg]?.claimedBy===name)
      inProg.push((v.name||v.rawName||"")+"·"+(LANG_LABEL[lg]||lg)); });
  });
  let current;
  if(inProg.length) current="正在剪「"+inProg[0]+"」"+(inProg.length>1?(" 等 "+inProg.length+" 支"):"");
  else if(q>0 && doneToday>=q) current="今日已達標 🎉";
  else if(!rep.startAt) current="尚未開工";
  else current="待命中";
  return {name, lang:u.lang||"zh", startAt:rep.startAt||"", q, doneToday, met:q>0?doneToday>=q:true, current};
}
// 特別工作備註顯示
function reportContentHtml(rep){ if(!rep) return ""; const c=rep.content||((rep.items||[]).filter(Boolean).join("、"));
  return c? `<div style="white-space:pre-wrap">${esc(c)}</div>` : `<span class="muted">無</span>`; }
function claimVid(id){ write("POST",`/api/videos/${id}/claim`,{},"已認領，加入我的工作"); }
function claimLang(id,lang){
  const me=currentUser();
  if(inProgressCount(me)>=1){ toast("請先把進行中的影片做完，才能再拉新的",true); return; }
  if(pulledTodayCount(me)>=3){ toast("你今天已經拉滿 3 片囉，明天再領",true); return; }
  write("PUT",`/api/videos/${id}/lang/${lang}`,{lang:{status:"二創中",editor:me,claimedBy:me,claimedAt:nowIso()}},"已認領 "+(LANG_LABEL[lang]||lang)+" 二創");
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
// 影片庫一列（含狀態標籤）
function videoItemRich(v){ const dot = v.mainType==="帶貨型"?"var(--sales)":"var(--traffic)";
  const stageCol={"待處理":"#94a3b8","剪輯中":"#d97706","已完成":"var(--green)","已上片":"#2563eb"}[v.stage]||"#94a3b8";
  return `<div class="vrow" onclick="editVideo('${v.id}')">
    <span style="display:flex;align-items:center;gap:8px;min-width:0">
      <span class="light" style="background:${dot};flex:none"></span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.name||v.rawName||"(未命名)")}</span></span>
    <span style="display:flex;align-items:center;gap:8px;white-space:nowrap;flex:none">
      <span class="pill" style="font-size:10px;border-color:${stageCol};color:${stageCol}">${esc(v.stage||"")}</span>
      <span class="muted" style="font-size:12px">${esc(v.editor||"")}${v.scheduledDate?(" · "+v.scheduledDate.slice(5)):""}</span></span>
  </div>`; }
// 依搜尋字／狀態篩選後的清單 HTML（限量顯示，避免大量資料卡頓）
function vidRowsHTML(){
  const all=STATE.videos||[];
  const q=(document.getElementById('vid_q')?.value||'').toLowerCase().trim();
  const stage=document.getElementById('vid_stage')?.value||'all';
  let list=all.filter(v=> stage==='all'?true:(v.stage===stage));
  if(q) list=list.filter(v=>String(v.name||v.rawName||'').toLowerCase().includes(q)||String(v.editor||'').toLowerCase().includes(q));
  const rank={"待處理":0,"剪輯中":1,"已完成":2,"已上片":3};
  list.sort((a,b)=>(rank[a.stage]??9)-(rank[b.stage]??9) || String(b.scheduledDate||b.claimedAt||'').localeCompare(String(a.scheduledDate||a.claimedAt||'')));
  const total=list.length, CAP=80, shown=list.slice(0,CAP);
  if(!total) return '<p class="muted">沒有符合的影片</p>';
  return shown.map(videoItemRich).join('') + (total>CAP?`<p class="muted" style="margin-top:8px">顯示前 ${CAP} 筆（共 ${total} 筆）；用上方搜尋縮小範圍。</p>`:`<p class="muted" style="margin-top:8px">共 ${total} 筆</p>`);
}
function vidFilter(){ const el=document.getElementById('vid_list'); if(el) el.innerHTML=vidRowsHTML(); }
function viewVideos(){
  const all=STATE.videos||[];
  const c=st=>all.filter(v=>v.stage===st).length;
  return `<h2>🎞 影片庫 <span class="muted" style="font-size:13px">點標題看細節／改連結</span></h2>
  <div class="card">
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
      <input id="vid_q" placeholder="🔍 搜尋影片名稱／剪輯" oninput="vidFilter()" style="flex:1;min-width:150px">
      <select id="vid_stage" onchange="vidFilter()">
        <option value="all">全部狀態（${all.length}）</option>
        <option value="待處理">待處理（${c("待處理")}）</option>
        <option value="剪輯中">剪輯中（${c("剪輯中")}）</option>
        <option value="已完成">已完成（${c("已完成")}）</option>
        <option value="已上片">已上片（${c("已上片")}）</option>
      </select>
      <button class="btn sm" onclick="newVideo()">＋ 新增片源</button>
    </div>
    <div id="vid_list" style="margin-top:10px">${vidRowsHTML()}</div>
  </div>`;
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
    ${id&&usageList(v).length?`<div class="card" style="background:var(--panel2)"><b>♻ 使用紀錄（共 ${usageList(v).length} 次）</b>
      <table class="responsive"><thead><tr><th>上片日期</th><th>連結</th><th>排片人</th></tr></thead><tbody>
      ${usageList(v).map(u=>`<tr><td data-label="上片日期">${esc(u.date)}</td><td data-label="連結">${u.link?`<a href="${esc(u.link)}" target="_blank">開啟</a>`:'<span class="muted">—</span>'}</td><td data-label="排片人">${esc(u.by||"")}</td></tr>`).join("")}
      </tbody></table></div>`:""}
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
  const ft=s.fridayTargets||{"寵粉":5};
  return `<h2>⚙️ 設定（修改需管理者密碼）</h2>
  <div class="card"><div class="grid cols4">
    <div><label>每日應上片數</label><input type="number" id="set_pub" value="${s.dailyPublishTarget||4}"></div>
    <div><label>每位剪輯每日配額</label><input type="number" id="set_quota" value="${s.editorDailyQuota||3}"></div>
    <div><label>新片片源低庫存門檻</label><input type="number" id="set_low" value="${s.materialLowThreshold||5}"></div>
    <div><label>預排天數視窗</label><input type="number" id="set_horizon" value="${s.scheduleHorizonDays||30}"></div>
  </div>
  <label>平日 每日各類型最低數量（一～四、六、日）</label>
  <div class="grid cols3">${(s.mainTypes||["流量型","帶貨型","寵粉"]).map(mt=>`<div><label style="margin-top:0">${esc(mt)}</label><input type="number" min="0" id="set_tt_${esc(mt)}" value="${tt[mt]||0}"></div>`).join("")}</div>
  <label style="margin-top:10px">週五 特別配置（固定寵粉日）</label>
  <div class="grid cols3">
    <div><label style="margin-top:0">寵粉</label><input type="number" min="0" id="set_ft_寵粉" value="${ft["寵粉"]||5}"></div>
  </div></div>
  <label>KPI 起算日（超前/落後從這天開始算，建議設成正式上線那天）</label>
  <div class="row"><input type="date" id="set_kpistart" value="${esc(s.kpiStartDate||"")}" style="max-width:200px">
    <button class="btn sm sec" onclick="setKpiToday()">設為今天</button></div>
  <p class="muted">應完成只計算「已過完」的工作日（不含今天）。把起算日設成今天，所有人就會從 0/0 達標開始累積。</p></div>
  <details class="card"><summary style="cursor:pointer;font-weight:700">🛠 進階設定（類別／標籤／片源／語言／平台，少用才需要動）</summary>
    <div style="margin-top:10px">
      <div style="margin-bottom:10px"><b>主類別</b>（逗號分隔）
        <input id="set_main" value="${esc((s.mainTypes||[]).join(","))}"></div>
      <div style="margin-bottom:10px"><b>子標籤</b>（每行一個主類別，格式 主類別:標籤1|標籤2）
        <textarea id="set_sub">${esc(subStr)}</textarea></div>
      <div style="margin-bottom:10px"><b>片源</b>（逗號分隔）
        <input id="set_src" value="${esc((s.sources||[]).join(","))}"></div>
      <div style="margin-bottom:10px"><b>語言（二創）</b>（逗號分隔，zh 為母版）
        <input id="set_langs" value="${esc((s.languages||[]).join(","))}"></div>
      <div style="margin-bottom:10px"><b>平台清單</b>
        <input id="set_plat" value="${esc((STATE.platforms||[]).join(","))}"></div>
      <div><b>異地備份資料夾</b>（選填）
        <input id="set_offsite" value="${esc(s.offsiteBackupDir||"")}"></div>
    </div>
  </details>
  <div class="card"><b>🔑 變更管理者密碼</b>
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
  const fridayTargets={"寵粉":parseInt(val("set_ft_寵粉"))||0};
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
    <td data-label="密碼">${u.role==="hr"?'<span class="muted">免密碼（檢核）</span>':`<code style="background:var(--panel2);padding:2px 6px;border-radius:5px">${esc(u.pin||"0000")}</code>${u.pin?'':'<span class="muted" style="font-size:11px"> 預設</span>'} <button class="btn sm sec" onclick="setMemberPin('${esc(u.name)}')">重設</button>`}</td>
    <td data-label=""><button class="btn sm sec" onclick="renameMember('${esc(u.name)}')">改名</button>
      <button class="btn sm danger" onclick="delMember('${esc(u.name)}')">刪除</button></td>
  </tr>`).join("");
  return `<h2>👥 成員管理 <span class="muted" style="font-size:13px">（限管理員）</span></h2>
  <div class="card"><b>現有成員（${users.length}）</b>
    <table class="responsive"><thead><tr><th>名字</th><th>角色／語言</th><th>每日KPI</th><th>密碼</th><th></th></tr></thead>
    <tbody>${rows||`<tr><td class="muted">尚無成員</td></tr>`}</tbody></table>
    <div class="row" style="justify-content:space-between"><p class="muted" style="margin:0">成員以「自己的密碼」登入：先在這裡幫每人「設定密碼」發給本人，之後他可在自己儀表板按「🔑 改密碼」修改。改角色／KPI／密碼／刪除需管理密碼。</p>
      <div class="row" style="gap:6px"><button class="btn sec sm" onclick="setAllPin()">🔑 全部成員設統一密碼</button>
        <button class="btn sec sm" onclick="setAllQuota(3)">全部剪輯 KPI 設為 3</button></div></div>
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
    typeTargets:{"流量型":3,"帶貨型":1}, fridayTargets:{"寵粉":5}}); }catch(e){}
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
// 成員改名：同步更新名下影片／匯報／工作的參照（限管理員）
function renameMember(oldName){
  const input=prompt("將成員「"+oldName+"」改名為：", oldName); if(input===null) return;
  const nn=input.trim(); if(!nn || nn===oldName) return;
  if((STATE.users||[]).some(u=>u.name===nn)){ toast("已有同名成員「"+nn+"」",true); return; }
  withAdmin(async ()=>{
    BULK_BUSY=true; let vc=0,rc=0,tc=0;
    try{
      const u=(STATE.users||[]).find(x=>x.name===oldName)||{name:oldName};
      await window.DB.set("users", nn, Object.assign({}, u, {name:nn}));
      for(const v of (STATE.videos||[])){
        const patch={}; let touched=false;
        if(v.editor===oldName){ patch.editor=nn; touched=true; }
        if(v.claimedBy===oldName){ patch.claimedBy=nn; touched=true; }
        if(v.languages){ const L=JSON.parse(JSON.stringify(v.languages)); let lt=false;
          for(const lg of Object.keys(L)){ if(L[lg]&&L[lg].editor===oldName){ L[lg].editor=nn; lt=true; }
            if(L[lg]&&L[lg].claimedBy===oldName){ L[lg].claimedBy=nn; lt=true; } }
          if(lt){ patch.languages=L; touched=true; } }
        if(touched){ try{ await window.DB.update("videos", v.id, patch); vc++; }catch(e){} }
      }
      for(const r of (STATE.reports||[])){ if(r.user===oldName){ const nid=nn+"__"+r.date;
        try{ await window.DB.set("reports", nid, Object.assign({}, r, {id:nid, user:nn})); await window.DB.del("reports", r.id); rc++; }catch(e){} } }
      for(const t of (STATE.tasks||[])){ if(t.user===oldName && t.id){ try{ await window.DB.update("tasks", t.id, {user:nn}); tc++; }catch(e){} } }
      await window.DB.del("users", oldName);
      try{ await window.DB.addAudit({ts:nowIso(),user:currentUser(),deviceId:deviceId(),action:"成員改名 "+oldName+"→"+nn+"（影片"+vc+"・匯報"+rc+"）"}); }catch(e){}
    } finally { BULK_BUSY=false; applyState(LAST_RAW); }
    await delay(300); toast("已將「"+oldName+"」改名為「"+nn+"」（影片 "+vc+"、匯報 "+rc+" 筆同步）");
  });
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
  const users=[...new Set(AUDIT.map(a=>a.user).filter(Boolean))].sort();
  const initRows=AUDIT.slice(0,250).map(auditRow).join("");
  return `<h2>🛡 檢核紀錄 <span class="muted" style="font-size:13px">最近 ${AUDIT.length} 筆　<a href="javascript:void(0)" onclick="loadAudit()">🔄重新整理</a></span></h2>
  <div class="card"><b>裝置／身分檢查</b>
    <p class="muted">每台裝置（瀏覽器）第一次使用會有固定代碼。若同一台裝置用了不同人的名字去操作，就會在這裡標紅——代表可能有人登了別人的帳號。</p>
    ${sharedHtml}
  </div>
  <div class="card"><b>操作明細</b>
    <div class="row" style="gap:8px;flex-wrap:wrap;margin:10px 0;align-items:center">
      <select id="aud_user" onchange="auditFilter()"><option value="all">全部操作者</option>${users.map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join("")}</select>
      <input type="date" id="aud_date" onchange="auditFilter()" style="max-width:170px">
      <button class="btn sm sec" onclick="clearAuditFilter()">清除</button>
      <span id="aud_count" class="muted" style="font-size:12px">共 ${AUDIT.length} 筆</span>
    </div>
    <table class="responsive"><thead><tr><th>時間</th><th>操作者</th><th>裝置</th><th>動作</th></tr></thead>
    <tbody id="aud_body">${initRows||`<tr><td class="muted">尚無紀錄</td></tr>`}</tbody></table>
  </div>`;
}
function auditRow(a){ return `<tr>
    <td data-label="時間">${esc((a.ts||"").replace("T"," "))}</td>
    <td data-label="操作者"><b>${esc(a.user)}</b></td>
    <td data-label="裝置"><span class="muted">${esc((a.deviceId||"").slice(0,12))}</span></td>
    <td data-label="動作">${esc(humanAction(a))}</td>
  </tr>`; }
function auditFilter(){
  const u=document.getElementById('aud_user')?.value||'all';
  const d=document.getElementById('aud_date')?.value||'';
  const list=(AUDIT||[]).filter(a=>(u==='all'||a.user===u) && (!d||String(a.ts||'').slice(0,10)===d));
  const body=document.getElementById('aud_body');
  if(body) body.innerHTML = list.length? list.slice(0,250).map(auditRow).join('') : '<tr><td class="muted">沒有符合的紀錄</td></tr>';
  const c=document.getElementById('aud_count'); if(c) c.textContent='符合 '+list.length+' 筆'+(list.length>250?'（顯示前 250）':'');
}
function clearAuditFilter(){ const u=document.getElementById('aud_user'); if(u)u.value='all'; const d=document.getElementById('aud_date'); if(d)d.value=''; auditFilter(); }
