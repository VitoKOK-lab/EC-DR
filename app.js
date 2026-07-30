// ===================================================================
// EC-DR 精簡版 — 只保留三件事：月排程、新片上架、舊片重覆上架
// 角色：管理員（Vito）＋ 剪輯。已移除：交辦、KPI、日報、稽核、二創、商品庫。
// 資料層走 Firestore（fb.js 提供 window.DB）；商業邏輯都在前端。
// ===================================================================
const ROLE_LABEL = {boss:"管理員", manager:"經理人", editor:"剪輯", intl:"海外剪輯", cs:"員工", hr:"人資"};
const ROLE_TABS = {
  // 月排程合一：一個「月排程」分頁，裡面用平台選單切換（社群媒體／海外 TikTok／蝦皮／馬來）
  // 「團隊看板」全員都看得到：誰被交辦了什麼、處理到哪、今日與本月成效（純檢視、不能操作）
  boss:    [["dashboard","儀表板"],["flow","流程中控"],["team","團隊看板"],["attend","出勤"],["videos","影片庫"],["cal","月排程"],["perf","平台成效"],["log","操作紀錄"],["trash","回收桶"]],
  manager: [["flow","流程中控"],["team","團隊看板"],["videos","影片庫"],["cal","月排程"]],   // 經理人（Regina）：流程中控（備片警示＋指派＋交辦回報）＋影片庫＋月排程；管理員看得到同一頁
  // 不分海內外：所有剪輯（editor＋intl）分頁完全相同；二創區已整合進「上班計畫」的「建立二創版本」卡
  editor:  [["work","上班計畫"],["team","團隊看板"],["videos","影片庫"],["cal","月排程"]],
  intl:    [["work","Work Plan"],["team","Team Board"],["videos","Library"],["cal","Schedule"]],
  cs:      [["work","本日工作"],["team","團隊看板"]],   // 員工（不剪片）：只做交辦工作與每日匯報，沒有一創二創之分
  hr:      [["team","團隊看板"],["attend","出勤"]],   // 人資：團隊看板（交辦狀況＋成效）＋出勤（打卡、遲到早退、月報表）
};
const PUB_TIMES = ["10:00","12:00","16:00"];   // 固定三個上片時間
let STATE = null, CUR_TAB = null, ONLINE = true, LAST_RAW = null, BULK_BUSY = false;
let VIEW_AS = null;   // 管理員「員工視角」：暫時以某員工身分檢視（唯讀預覽）
const today = new Date(Date.now()+288e5).toISOString().slice(0,10); // 台灣時間 UTC+8
const yesterday = new Date(Date.now()+288e5-864e5).toISOString().slice(0,10); // 前一日

function realUser(){ return localStorage.getItem("ecdr_user") || ""; }
function currentUser(){ return VIEW_AS || realUser(); }   // 員工視角啟用時，畫面一律以該員工身分呈現
function setUser(n){ localStorage.setItem("ecdr_user", n); }
function currentRole(){
  const u = (STATE?.users||[]).find(x=>x.name===currentUser());
  return (u && u.role) || localStorage.getItem("ecdr_role") || "editor";
}
function ownerName(){ return (STATE && STATE.settings && STATE.settings.ownerName) || "Vito"; }
// 雙語：海外剪輯(intl)看英文、其他角色看中文（海外員工看到的畫面都要是英文）
function T(zh,en){ return currentRole()==="intl" ? en : zh; }
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
// 文件編號產生器：時間戳（跨裝置不同）＋同一頁的遞增序號（同毫秒連按也不同）＋亂數（跨裝置保險）
let UID_SEQ=0;
function uid(prefix){
  UID_SEQ=(UID_SEQ+1)%1296;
  return prefix + Date.now().toString(36)
       + UID_SEQ.toString(36).padStart(2,"0")
       + Math.floor(Math.random()*46656).toString(36).padStart(3,"0");
}
// 影片文件 ID：一定要「跨裝置不會撞號」。
// 舊版是掃自己這台看到的最大編號 +1 → 兩個人幾乎同時新增會算出同一個 ID，
// 後寫的那筆會整份覆蓋前一筆（Firestore set），先建的影片就這樣無聲消失。
// 也會撞到回收桶裡（已軟刪除、不在 STATE.videos）的舊編號。
// 改成 時間戳(base36) + 亂數，各自產生、永不重複。
function newVideoId(){ return uid("V"); }
// 人看的編號：民國年＋月日（7 碼）＋當日序號（3 碼）。含回收桶一起掃，才不會重覆。
function nextVideoCode(seen){
  const [Y,M,D]=today.split("-");
  const pre=`${(+Y-1911)}${M}${D}`;
  const re=new RegExp("^"+pre+"(\\d{3})$");
  let seq=0;
  const scan=(arr)=>(arr||[]).forEach(v=>{ const m=String((v&&v.code)||"").match(re); if(m) seq=Math.max(seq,+m[1]); });
  scan(STATE&&STATE.videos); scan(STATE&&STATE.deletedVideos); scan(seen);
  return pre+String(seq+1).padStart(3,"0");
}
// 影片的「完整標準結構」— 對應 SCHEMA.md（schemaVersion 2）。每筆寫入都用這個確保一致。
function newVideoRecord(over){
  const s=STATE.settings||{};
  const rec={ id: newVideoId(), code: nextVideoCode(),
    name:"", rawName:"", videoCopy:"", tags:[], subTag:"",
    mainType:"",   // 預設不分類（流量型是多數，不特別標）
    source:(s.sources&&s.sources[0])||"", stage:"待處理",
    editor:"", claimedBy:"", claimedAt:"", finishedAt:"", durationMin:null, assignedTo:"",
    createdBy:(typeof currentUser==="function"?(currentUser()||""):""), createdAt:nowIso(),   // 誰、何時建立（全員權限相同，靠這個追蹤）
    updatedAt:"", scheduledDate:null, publishTime:"", platforms:[],
    products:[], productUrl:"", note:"",
    reviewStatus:"", reviewNote:"", reviewedBy:"", reviewedAt:"",
    metrics:[], metricsAt:"",   // 平台成效（後端以「影片標題」比對後自動填）：每筆 {platform, account, views, likes, comments, shares, at}
    // 跨語言二創：locale=""＝台灣中文源片、"en"＝英文版；sourceVideoId＝英文版指回源片；nameEn/videoCopyEn＝源片選填英文摘要
    // account＝在地化版本上傳的海外帳號名（同源片同語言可有多支、各自帳號/成片）
    locale:"", sourceVideoId:"", nameEn:"", videoCopyEn:"", account:"",
    // 國內二創：channel="shopee"＝蝦皮版本（同語言、不同平台再剪一次）；沿用 sourceVideoId／account（蝦皮帳號名）
    channel:"",
    // 一創語言（原本影片是什麼語言拍的）：""＝中文（預設）、"th"泰、"en"英、"my"馬來
    origLang:"",
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
  // 海外二創(locale)／蝦皮二創(channel)版本走各自的排程月曆，不計入台灣月排程
  (STATE.videos||[]).forEach(v=>{ if(!v.locale && !v.channel && v.scheduledDate===date && ["已完成","已上片"].includes(v.stage) && !seen.has(v.id)){ seen.add(v.id); out.push({videoId:v.id, fromVideo:true}); } });
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
// 進行中支數（顯示用，無上限）；bucket 可另傳做單一平台的顯示計數
function inProgressCount(name, bucket){ bucket=bucket||(x=>true);
  return (STATE.videos||[]).filter(v=>v.stage==="剪輯中"&&(v.claimedBy===name||v.editor===name)&&bucket(v)).length; }
function myInProgressCount(bucket){ return inProgressCount(currentUser(), bucket); }
// 新片＝剪好還沒上傳（預排上片日尚未到）；舊片＝過了預排上片日（已上傳，可重播）
// 是否已過預排上片日（→ 已上傳、視為舊片，可重播）
function airedPast(v){ const d=String(v.scheduledDate||"").slice(0,10); return !!d && d < today; }

// ---------- 寫入路由（操作 Firestore） ----------
function vidLocal(id){ return (STATE.videos||[]).find(v=>v.id===id) || (STATE.deletedVideos||[]).find(v=>v.id===id); }
// 操作紀錄（稽核）：記下「誰、何時、做了什麼、對象」
function logTarget(path){ const seg=String(path||"").split("/").filter(Boolean); // api, videos, V190, finish
  if(seg[1]==="videos" && seg[2]){ const v=vidLocal(seg[2]); return v?vidTitle(v):seg[2]; }
  if(seg[1]==="users" && seg[2]) return "成員 "+decodeURIComponent(seg[2]);
  if(seg[1]==="schedule" && seg[2]) return "排程 "+seg[2];
  if(seg[1]==="settings") return "系統設定";
  return path||""; }
function logA(action, target){
  try{ if(!window.DB) return; const id=uid("L");
    window.DB.set("logs", id, {id, at:nowIso(), user:currentUser()||"(未登入)", role:currentRole()||"",
      action:String(action||"").slice(0,80), target:String(target||"").slice(0,200)}).catch(()=>{});
  }catch(e){}
}
// 多人同時操作的原子寫入包裝：window.DB 有 arrayAdd/arrayDel/bump 就用伺服器端加減，
// 沒有（舊的快取版 fb.js、測試替身）就退回原本的「讀出→改→整份寫回」。
function dbArrayAdd(coll, id, field, val, fallback){
  if(window.DB && window.DB.arrayAdd) return window.DB.arrayAdd(coll, id, field, val);
  return fallback();
}
function dbArrayDel(coll, id, field, val, fallback){
  if(window.DB && window.DB.arrayDel) return window.DB.arrayDel(coll, id, field, val);
  return fallback();
}
function dbBump(coll, id, field, n, fallback){
  if(window.DB && window.DB.bump) return window.DB.bump(coll, id, field, n);
  return fallback();
}
function segOf(path){ return path.split("/").filter(Boolean).slice(1); } // 去掉 'api'
async function route(method, path, body){
  if(!window.DB) throw new Error("尚未連線，請稍候");
  const seg=segOf(path), head=seg[0], user=currentUser();
  if(head==="settings" && method==="PUT"){ await window.DB.setSettings(body.settings||{}); return; }
  if(head==="users"){
    if(method==="POST"){ const name=(body.name||"").trim(), role=body.role||"editor";
      if(!name) throw new Error("請輸入名稱");
      if((STATE.users||[]).some(u=>u.name===name)) throw new Error("名稱已存在");
      const rec={name, role, isDefault:false, pw:"0000", pwSet:false};   // 第一次登入會被要求自己設密碼
      if(body.craft!=null) rec.craft=body.craft;                  // 剪輯分工：一次創作／二次創作／兩種
      if(body.intlLocale!=null) rec.intlLocale=body.intlLocale;   // 海外剪輯：帳號綁定語言（en/th/ms）
      await window.DB.set("users", name, rec); return; }
    if(method==="PUT"){ const patch={}; if(body.role!=null) patch.role=body.role; if(body.pw!=null) patch.pw=String(body.pw);
      if(body.intlLocale!=null) patch.intlLocale=body.intlLocale;
      if(body.pwHash!=null) patch.pwHash=String(body.pwHash);   // 只存雜湊，明文一律寫成 ""
      if(body.pwSet!=null) patch.pwSet=!!body.pwSet;
      if(body.pwAt!=null) patch.pwAt=String(body.pwAt);          // 出勤起算時間（只寫第一次）
      if(body.flexHours!=null) patch.flexHours=!!body.flexHours; // 變動工時：不判遲到早退
      if(body.workStart!=null) patch.workStart=String(body.workStart);
      if(body.workEnd!=null) patch.workEnd=String(body.workEnd);
      await window.DB.update("users", seg[1], patch); return; }
    if(method==="DELETE"){ await window.DB.del("users", seg[1]); return; }
  }
  if(head==="videos"){
    if(method==="POST" && seg.length===1){
      const inc=Object.assign({}, body.video); delete inc.id;
      const v=newVideoRecord(inc); v.updatedAt=nowIso(); await window.DB.set("videos", v.id, v); return;
    }
    const id=seg[1], v=vidLocal(id), action=seg[2];
    if(!v && method!=="DELETE") throw new Error(currentRole()==="intl"?"Video not found":"找不到影片");
    if(action==="claim"){
      // 同時在手上的支數不設上限（2026-07 取消 3 支上限）；「上班計畫」仍顯示進行中支數與天數警示
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
      const slot={videoId:id, publishedLink:link, driveFolder:drive, reused:true, by:user, at:nowIso(), time};
      await dbArrayAdd("schedule", date, "slots", slot, ()=>{
        const day=(STATE.schedule||{})[date]||{slots:[]};
        return window.DB.scheduleSet(date,{slots:(day.slots||[]).concat([slot])}); });
      const use={date, link, drive, time, by:user, at:nowIso()};
      await dbArrayAdd("videos", id, "usageHistory", use, ()=>
        window.DB.update("videos", id, {usageHistory:(v.usageHistory||[]).concat([use])}));
      await dbBump("videos", id, "totalUsed", 1, ()=>
        window.DB.update("videos", id, {totalUsed:(v.totalUsed||0)+1}));
      if(drive && drive!==v.driveFolder) await window.DB.update("videos", id, {driveFolder:drive}); // 同步存檔位置回影片
      return;
    }
    if(action==="restore"){ await window.DB.update("videos",id,{deleted:false,deletedBy:"",deletedAt:""}); return; }
    if(method==="PUT"){ const patch=Object.assign({}, body.video); delete patch.id; patch.updatedAt=nowIso();
      // 從編輯視窗把階段改成「已完成／已上片」時，也要蓋上完成時間。
      // 少了它，這支在「今日完成」「團隊看板」「剪片速度」通通算不到 —— 影片庫看得到，剪輯自己的清單卻沒有。
      const nextStage = patch.stage!==undefined ? patch.stage : v.stage;
      const nextFin   = patch.finishedAt!==undefined ? patch.finishedAt : v.finishedAt;
      if(["已完成","已上片"].includes(nextStage) && !String(nextFin||"").trim()){
        patch.finishedAt=nowIso();
        if(v.claimedAt && patch.durationMin==null && v.durationMin==null) patch.durationMin=durationMin(v.claimedAt, patch.finishedAt);
      }
      await window.DB.update("videos",id,patch); return; }
    if(method==="DELETE"){
      if(action==="purge"){ await window.DB.del("videos",id); return; }                       // 永久刪除（管理員）
      await window.DB.update("videos",id,{deleted:true,deletedBy:user,deletedAt:nowIso()}); return;  // 軟刪除：進回收桶，可復原
    }
  }
  if(head==="schedule"){
    const date=seg[1], sub=seg[2]; const day=(STATE.schedule||{})[date]||{slots:[]}; const slots=(day.slots||[]).slice();
    if(sub==="slot" && method==="POST"){
      const slot=body.slot||{}; const tv=vidLocal(slot.videoId);
      await dbArrayAdd("schedule", date, "slots", slot, ()=>window.DB.scheduleSet(date,{slots:slots.concat([slot])}));
      if(tv && !slot.reused) await window.DB.update("videos", slot.videoId, {scheduledDate:date}); return;
    }
    // 刪除一格：用「整格的內容」比對，不用索引。
    // 用索引的話，別人同時剛好新增／刪除同一天，索引會位移 → 刪到別人的排片。
    if(sub==="slot" && method==="DELETE"){
      const idx=parseInt(seg[3]); if(!(idx>=0 && idx<slots.length)) throw new Error("找不到這一格排片");
      const slot=slots[idx];
      if(slot.locked) throw new Error("此排片已上架鎖定");
      await dbArrayDel("schedule", date, "slots", slot, ()=>{
        const rest=slots.slice(); rest.splice(idx,1); return window.DB.scheduleSet(date,{slots:rest}); });
      return;
    }
  }
  throw new Error("不支援的操作");
}
function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function write(method, path, body, okMsg){
  if(VIEW_AS){ toast("員工視角為唯讀預覽，離開後才能操作",true); return false; }
  try{ await route(method, path, body||{}); await delay(140); logA(okMsg||(method+" "+path), logTarget(path)); if(okMsg) toast(okMsg); return true; }
  catch(e){ toast(e.message, true); return false; }
}
async function withAdmin(fn){ return fn(); }  // 已取消密碼，直接執行
async function writeAdmin(method,path,body,okMsg){
  if(VIEW_AS){ toast("員工視角為唯讀預覽，離開後才能操作",true); return false; }
  try{ await route(method,path,body||{}); await delay(140); logA(okMsg||(method+" "+path), logTarget(path)); if(okMsg)toast(okMsg); closeModal(); return true; }catch(e){ toast(e.message,true); return false; } }
// 員工視角（管理員）：以某員工身分檢視（唯讀），不用切換帳號
function enterViewAs(name){ if(!name){ toast("請選擇員工",true); return; } VIEW_AS=name; CUR_TAB=null; buildNav(); applyState(LAST_RAW); }
function exitViewAs(){ VIEW_AS=null; CUR_TAB=null; buildNav(); applyState(LAST_RAW); }

// ---------- 登入 / 導覽 ----------
function buildNav(){
  const bz=document.getElementById("brandZh"); if(bz) bz.textContent = currentRole()==="intl" ? "E-Commerce Workspace" : "電商部協作系統";   // 海外看英文標題
  const nav = document.getElementById("nav"); nav.innerHTML="";
  myTabs().forEach(([id,label])=>{
    const b = document.createElement("button"); b.textContent = label; b.dataset.tab = id;
    if(id===CUR_TAB) b.classList.add("active");
    // 進月排程一律回到當月（hub 內各平台月曆各自的年月也一起重設）
    b.onclick = ()=>{ if(id==='cal'){ CAL_YM=null; INTL_CAL_YM=null; CH_CAL.shopee.ym=null; CH_CAL.ms.ym=null; } CUR_TAB = id; buildNav(); render(); };
    nav.appendChild(b);
  });
}
// 頂列齒輪選單（收納新手教學／改密碼）：點齒輪開關、點外面自動關閉
function toggleHeaderMenu(e){ if(e) e.stopPropagation();
  const pop=document.getElementById("hmenuPop"), gear=document.getElementById("hgearBtn"); if(!pop) return;
  const open=pop.classList.contains("hidden");
  pop.classList.toggle("hidden", !open); if(gear) gear.classList.toggle("on", open); }
function closeHeaderMenu(){
  const pop=document.getElementById("hmenuPop"), gear=document.getElementById("hgearBtn"); if(!pop) return;
  pop.classList.add("hidden"); if(gear) gear.classList.remove("on"); }
document.addEventListener("click", (e)=>{ if(!e.target.closest(".hmenu")) closeHeaderMenu(); });
// 這台電腦上次是誰登入的 —— 記起來，下次只要按「直接登入」，不用在一堆名字裡找自己
let LOGIN_ALL=false;
function lastUserHere(){ return localStorage.getItem("ecdr_last")||""; }
function loginSwitchAccount(){ LOGIN_ALL=true; bootLogin(); }
function loginQuick(){ const n=lastUserHere();
  const u=((STATE?.users)||[]).find(x=>x.name===n); if(u) loginAs(u); else loginSwitchAccount(); }
function bootLogin(){
  const g = document.getElementById("userGrid"); g.innerHTML = "";
  // 這台裝置上次登入過的人：只顯示他一個，按「直接登入」再輸入密碼
  const lastName=lastUserHere();
  const lastU=lastName? ((STATE?.users)||[]).find(x=>x.name===lastName) : null;
  if(lastU && !LOGIN_ALL){
    const wrap=document.createElement("div"); wrap.className="quickLogin";
    const who=document.createElement("div"); who.className="qlName"; who.textContent=lastU.name;
    const role=document.createElement("div"); role.className="qlRole"; role.textContent=ROLE_LABEL[lastU.role||"editor"]||"";
    const go=document.createElement("button"); go.className="btn qlGo"; go.textContent="直接登入";
    go.onclick=()=>loginAs(lastU);
    const sw=document.createElement("button"); sw.className="adminLink qlSwitch"; sw.textContent="不是我，切換帳號";
    sw.onclick=loginSwitchAccount;
    wrap.appendChild(who); wrap.appendChild(role); wrap.appendChild(go); wrap.appendChild(sw);
    g.appendChild(wrap); return;
  }
  const all=staffSorted(((STATE?.users)||[]).filter(u=>["editor","manager","intl","cs","hr"].includes(u.role||"editor")));   // 一創→兩種→二創，英文名在後
  if(!all.length){ const n=document.createElement("p"); n.className="muted"; n.style.cssText="width:100%;text-align:center"; n.textContent="尚無成員，請按「管理員登入」進入後新增"; g.appendChild(n); return; }
  const mkBtn=(u)=>{ const b=document.createElement("button"); b.className="userBtn";
    b.innerHTML = esc(u.name); b.onclick=()=>loginAs(u); return b; };
  const section=(title, list)=>{ if(!list.length) return;
    const h=document.createElement("div"); h.className="loginGroup"; h.textContent=title; g.appendChild(h);
    list.forEach(u=>g.appendChild(mkBtn(u))); };
  // 分區順序：Taiwan（剪輯）→ 員工 → 海外版 → 人資 → 管理層（Regina 放最下面，靠近「管理員登入」）
  section("Taiwan", all.filter(u=>(u.role||"editor")==="editor"));
  section("員工", all.filter(u=>u.role==="cs"));
  section("海外版", all.filter(u=>u.role==="intl"));
  section("人資", all.filter(u=>u.role==="hr"));
  section("管理層", all.filter(u=>u.role==="manager"));
}
// 上下班要用公司電腦打卡：一般員工不給手機登入（經理人／人資／管理員不受限，他們要能隨時處理事情）
function pcOnlyOn(){ const s=(STATE&&STATE.settings)||{}; return s.pcOnly!==false; }
function blockedOnMobile(role){ return pcOnlyOn() && isMobileUA() && !["manager","hr","boss"].includes(role||"editor"); }
// ---------- 密碼：只存雜湊，不存明文（v84）----------
// PBKDF2-SHA256＋每人一組隨機鹽。算得出來、推不回去 ——
// 就算整個資料庫被讀走，也拿不到任何人的真實密碼。
// 格式：pbkdf2$<次數>$<鹽 base64>$<雜湊 base64>
const PW_ITER=210000;           // 每猜一次都要跑這麼多輪，暴力破解才會慢下來
const PW_MIN=6;                 // 最少 6 碼（舊制是 4 碼，v84 起全員重設）
const pwB64=(buf)=>btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(buf))));
const pwUnb64=(s)=>Uint8Array.from(atob(String(s)), c=>c.charCodeAt(0));
async function pwDerive(pw, salt, iter){
  const key=await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pw)), "PBKDF2", false, ["deriveBits"]);
  return pwB64(await crypto.subtle.deriveBits({name:"PBKDF2", salt, iterations:iter, hash:"SHA-256"}, key, 256));
}
async function pwMakeHash(pw){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  return "pbkdf2$"+PW_ITER+"$"+pwB64(salt)+"$"+await pwDerive(pw, salt, PW_ITER);
}
async function pwVerifyHash(pw, stored){
  const p=String(stored||"").split("$");
  if(p.length!==4 || p[0]!=="pbkdf2" || !(+p[1]>0)) return false;
  try{ return (await pwDerive(pw, pwUnb64(p[2]), +p[1]))===p[3]; }catch(e){ return false; }
}
// 登入時驗證：已經是雜湊就比對雜湊；還沒轉換的舊帳號才比對明文。
// 舊帳號驗證過之後照樣會被「請設定新密碼」擋下來，設完就只剩雜湊。
async function pwCheck(u, input){
  if(u && u.pwHash) return pwVerifyHash(input, u.pwHash);
  return input===String((u&&u.pw)==null?"0000":u.pw);
}
// 新密碼的規定（設定密碼與自行修改共用同一套）
function pwRuleError(a, b){
  if(a.length<PW_MIN) return T("新密碼至少 "+PW_MIN+" 碼","New password needs at least "+PW_MIN+" characters");
  if(/^0+$/.test(a))  return T("不能用全部是 0 的密碼","Can't use all zeros");
  if(b!=null && a!==b) return T("兩次輸入不一致，請重來","Passwords don't match, try again");
  return "";
}
async function loginAs(u){
  if(blockedOnMobile(u.role)){
    alert("請用公司電腦登入。\n\n上下班打卡要在公司電腦上進行，手機不能登入。\n（如有特殊需要請找管理員）");
    return; }
  const pw=prompt("請輸入「"+u.name+"」的密碼（預設 0000）："); if(pw===null) return;
  if(!await pwCheck(u, String(pw).trim())){ toast("密碼錯誤。預設為 0000，忘記請找主管線上重設",true); return; }
  setUser(u.name); localStorage.setItem("ecdr_role", u.role||"editor");
  localStorage.setItem("ecdr_last", u.name);   // 這台裝置下次直接顯示他
  CUR_TAB=null; LOGIN_ALL=false;
  ensurePwAt(u);
  clockIn(u.name); autoCloseOpenShifts(); logA("登入","上班打卡"); applyState(LAST_RAW); }
// 出勤起算點補登：在加這個功能之前就自己改過密碼的人沒有 pwAt，
// 那就以他這次登入當起算點。還在用預設密碼的人不補，等他改密碼那一刻才開始算。
function ensurePwAt(u){
  try{
    if(!u || u.pwAt || !window.DB) return;
    if(u.pwSet===false) return;
    if(!u.pwHash) return;              // 還沒設好自己的密碼 → 等他設完，那一刻才是起算點
    window.DB.update("users", u.name, {pwAt:nowIso()}).catch(()=>{});
  }catch(e){}
}
// 員工自行修改密碼（需先輸入舊密碼）
async function changeMyPw(){
  const me=currentUser(); const u=(STATE.users||[]).find(x=>x.name===me);
  const T=(zh,en)=>currentRole()==="intl"?en:zh;   // 海外剪輯看英文提示
  if(!u){ toast(T("找不到你的帳號","Account not found"),true); return; }
  const old=prompt(T("請輸入目前密碼：","Current password:")); if(old===null) return;
  if(!await pwCheck(u, String(old).trim())){ toast(T("目前密碼錯誤","Wrong current password"),true); return; }
  const n1=prompt(T("請設定新密碼（至少 "+PW_MIN+" 碼）：","New password (at least "+PW_MIN+" characters):")); if(n1===null) return;
  const np=String(n1).trim();
  const n2=prompt(T("請再輸入一次新密碼：","Repeat the new password:")); if(n2===null) return;
  const err=pwRuleError(np, String(n2).trim()); if(err){ toast(err,true); return; }
  const body={pwHash: await pwMakeHash(np), pw:"", pwSet:true};
  if(!u.pwAt) body.pwAt=nowIso();   // 只有第一次設密碼才是出勤起算點
  await write("PUT","/api/users/"+me,body,T("密碼已更新，下次登入請用新密碼","Password updated — use it next login")); }
// 上班打卡：記錄當天第一次登入時間（只給管理員看）
function shiftId(name,date){ return name+"__"+date; }
async function clockIn(name){
  try{ const id=shiftId(name,today); const ex=(STATE&&STATE.shifts&&STATE.shifts[id])||null;
    if(ex&&ex.clockIn) return;   // 已打過上班卡
    const env=punchEnv(); const isNew=!isKnownDevice(name, env.dev);
    await window.DB.set("shifts", id, {id, user:name, date:today, clockIn:nowIso(), clockOut:"",
      inDev:env.dev, inDevUA:env.ua, inMobile:env.mobile, inNewDev:isNew, inGeo:null, autoOut:false});
    rememberDevice(name, env);
    // GPS 是選配：拿到再補寫，拿不到或使用者不給權限都不影響打卡
    grabGeo().then(g=>{ if(g) window.DB.update("shifts", id, {inGeo:g}).catch(()=>{}); });
  }catch(e){}
}
function myShift(){ return (STATE&&STATE.shifts&&STATE.shifts[shiftId(currentUser(),today)])||null; }
function ownerLogin(){ if(!STATE){ toast("連線中，請稍候再試",true); return; }
  const want=String((STATE.settings&&STATE.settings.adminPassword)||"1234");
  const pw=prompt("請輸入管理員密碼："); if(pw===null) return;
  if(String(pw).trim()!==want){ toast("密碼錯誤",true); return; }
  setUser(ADMIN_NAME); localStorage.setItem("ecdr_role","boss"); CUR_TAB=null; logA("管理員登入",""); applyState(LAST_RAW); }
// 登出：跳回登入頁
function logout(){ showGoodbye(); }
// 登出：簡單說再見 → 跳回登入頁（無動畫）
function showGoodbye(){
  const wasIntl=currentRole()==="intl";   // 清除登入資訊前先記住角色，再見畫面才知道用哪個語言
  localStorage.removeItem("ecdr_user"); localStorage.removeItem("ecdr_role");
  try{ const gt=document.querySelector("#goodbye .gtitle"); if(gt) gt.textContent=wasIntl?"Goodbye!":"再見！";
       const gs=document.querySelector("#goodbye .gsub"); if(gs) gs.textContent=wasIntl?"See you tomorrow":"明天見"; }catch(e){}
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
  // 軟刪除：把 deleted 的影片抽到「回收桶」，其餘畫面一律只看到未刪除的
  const allV=st.videos||[];
  st.deletedVideos=allV.filter(v=>v.deleted);
  st.videos=allV.filter(v=>!v.deleted);
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
    const isIntl=currentRole()==="intl";
    document.getElementById("whoRole").textContent="・"+(isIntl?"Intl Editor":(ROLE_LABEL[currentRole()]||""));
    { const pb=document.getElementById("pwBtn"); if(pb){ pb.style.display=(currentRole()!=="boss")?"":"none"; pb.textContent=isIntl?"🔒 Change password":"🔒 改密碼"; } }
    // 海外剪輯：頂列全英文；新手教學內容是中文，對海外剪輯直接隱藏
    { const tb=document.getElementById("tutBtn"); if(tb){ tb.style.display=isIntl?"none":""; } }
    { const lb=document.getElementById("logoutBtn"); if(lb) lb.textContent=isIntl?"Log out":"登出"; }
    { const gb=document.getElementById("hgearBtn"); if(gb) gb.title=isIntl?"More settings":"更多設定"; }
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
// （每頁自動說明卡已於 PR #33 移除，改用頂列「新手教學」hover 模式；此處不再保留死程式）
let LAST_RENDER_TAB=null;
// 還在用預設密碼（或從沒自己設過）→ 進系統前一定要先改，改完才能用
function mustSetPw(){
  if(VIEW_AS || isOwner()) return false;
  const u=((STATE&&STATE.users)||[]).find(x=>x.name===realUser());
  if(!u) return false;
  if(u.pwSet===false) return true;      // 管理員剛重設 → 下次登入要自己再設一次
  return !u.pwHash;                     // 還沒轉成雜湊（舊制的 4 碼或預設 0000）→ 全員重設一次
}
function pwGateHTML(){
  return `<div class="card" style="max-width:460px;margin:40px auto;border-color:var(--gold)">
    <b style="font-size:18px">請先設定你自己的密碼</b>
    <div class="muted" style="font-size:13px;margin-top:6px;line-height:1.8">
      設定一組只有你知道的密碼之後才能開始使用。<br>系統不會保留你的密碼原文，忘記只能請管理員重設。</div>
    <label style="margin-top:14px">新密碼（至少 ${PW_MIN} 碼）</label>
    <input id="pwg1" type="password" autocomplete="new-password" placeholder="輸入新密碼">
    <label style="margin-top:10px">再輸入一次</label>
    <input id="pwg2" type="password" autocomplete="new-password" placeholder="再輸入一次" onkeydown="if(event.key==='Enter')savePwGate()">
    <button class="btn" style="width:100%;margin-top:14px;font-size:16px;padding:12px" onclick="savePwGate()">設定密碼並開始使用</button>
    <div class="muted" style="font-size:12px;margin-top:10px">忘記密碼時，請管理員到「設定 → 成員」幫你重設。</div>
  </div>`;
}
async function savePwGate(){
  const a=(val("pwg1")||"").trim(), b=(val("pwg2")||"").trim();
  const err=pwRuleError(a,b); if(err){ toast(err,true); return; }
  const u=((STATE&&STATE.users)||[]).find(x=>x.name===realUser());
  if(await pwCheck(u, a)){ toast("不能沿用原本的密碼",true); return; }
  // pw:"" ＝ 把明文清掉；之後只留 pwHash
  const body={pwHash: await pwMakeHash(a), pw:"", pwSet:true};
  // 出勤從這一刻開始算。第二次改密碼不會重設，否則等於把之前的出勤洗掉。
  if(!(u&&u.pwAt)) body.pwAt=nowIso();
  const okDone=await write("PUT","/api/users/"+realUser(),body,"密碼已設定，開始使用吧");
  if(okDone){ applyState(LAST_RAW); }
}
function render(){
  if(!STATE) return;
  const v = document.getElementById("view");
  if(mustSetPw()){ v.classList.remove("anim"); v.innerHTML=pwGateHTML(); LAST_RENDER_TAB="__pw"; return; }
  // 同一頁重繪（新增/編輯/同步）時保留捲動位置，不跳回頂端；切換分頁則回到頂端
  const same=(LAST_RENDER_TAB===CUR_TAB);
  const sy=same?window.scrollY:0;
  const vsOld=v.querySelector(".vidscroll"); const vst=(same&&vsOld)?vsOld.scrollTop:0;
  const viewAsBanner = VIEW_AS ? `<div class="card" style="border:1px solid var(--accent);background:var(--espresso);color:#F6ECDA;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
    <b>👁 員工視角：${esc(VIEW_AS)}　<span style="font-weight:400;opacity:.85;font-size:13px">（你是管理員，正在預覽他看到的畫面・唯讀）</span></b>
    <button class="btn sm" style="white-space:nowrap" onclick="exitViewAs()">離開員工視角</button></div>` : "";
  const banner = ONLINE ? "" :
    `<div class="card" style="border-color:var(--red)">目前離線，顯示的是最後一次同步的資料（唯讀），連線恢復後會自動更新。</div>`;
  // 操作紀錄 300 筆只有管理員看得到，點進來才去訂閱（其他 21 個人不用白白下載）
  if(CUR_TAB==="log"){ try{ if(window.DB&&window.DB.watchLogs) window.DB.watchLogs(); }catch(e){} }
  const fn = { dashboard:viewDashboard, flow:viewFlow, team:viewTeam, attend:viewAttend, cal:viewCal, work:viewWork, videos:viewVideos, settings:viewSettings, log:viewLog, trash:viewTrash, perf:viewPerf, }[CUR_TAB] || (()=>"");
  v.classList.toggle("anim", !same);   // 只在「切換分頁」時做進場動畫；同頁資料同步重繪不動畫（避免閃動）
  v.innerHTML = viewAsBanner + banner + fn();
  LAST_RENDER_TAB=CUR_TAB;
  const vsNew=v.querySelector(".vidscroll"); if(vsNew && vst) vsNew.scrollTop=vst;
  if(same && sy) requestAnimationFrame(()=>window.scrollTo(0,sy));
}

// ===================================================================
// 月排程（＋ 舊片重覆上架）
// ===================================================================
let CAL_YM = null;
let SHIFT_DATE = yesterday;   // 管理員「每日匯報」預設看昨天的工作進度
function shiftDateMove(n){ const d=new Date(SHIFT_DATE+"T00:00:00"); d.setDate(d.getDate()+n);
  const nd=new Date(d.getTime()+288e5).toISOString().slice(0,10); if(nd>today) return; SHIFT_DATE=nd; render(); }
function shiftDateSet(v){ if(v){ SHIFT_DATE=(v>today?today:v); render(); } }
// 台灣社群媒體月曆（月排程 hub 的「社群媒體」平台內容）
function calTWBody(){
  if(!CAL_YM){ const t=new Date(); CAL_YM=[t.getFullYear(), t.getMonth()]; }
  const [y,m] = CAL_YM;
  const first = new Date(y,m,1), startDow=first.getDay(), days=new Date(y,m+1,0).getDate();
  const d10=new Date(today+"T00:00:00"); d10.setDate(d10.getDate()+10); const d10s=d10.toISOString().slice(0,10);
  // 剪輯視角：標出「這天有排到我剪的片」的日子（金色 ✦），一眼看到自己的死線
  const me=currentUser(), isEd=currentRole()==="editor";
  const dayIsMine=(ds)=> isEd && dayVideoList(ds).some(it=>{ const v0=vid(it.videoId); return v0 && (v0.editor===me||v0.claimedBy===me||v0.assignedTo===me); });
  let cells = "";
  for(let i=0;i<startDow;i++) cells += `<div class="day out"></div>`;
  for(let d=1;d<=days;d++){
    const ds = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const isToday = ds===today;
    const tmk = isToday?`<span class="todaymk">${T("今天","Today")}</span>`:"";
    const within10 = ds>=today && ds<=d10s;
    const b = dayBreakdown(ds);
    const filled = b.full;
    const empty = (b.total||0)===0;                 // 一支都還沒排
    const cls = filled ? "filled" : (empty ? "empty" : (within10 ? "bad urgent" : "blank"));
    cells += `<div class="day ${cls} ${isToday?'today':''}" onclick="openDay('${ds}')">
      ${tmk}<div class="dnum">${d}</div>
      <div class="big">${b.total||"·"}<span style="font-size:14px;color:var(--muted);font-weight:600">${b.target?("/"+b.target):""}</span></div>
      ${filled?`<div class="pmk" style="color:var(--green)">${T("已排滿","Full")}</div>`:(empty?`<div class="pmk" style="color:${within10?'#F0A89E':'#C9BFB4'}">${T("未排","None")}${within10?T('（近期）',' (soon)'):''}</div>`:`<div class="pmk" style="color:var(--red)">${T("缺","Need ")}${b.short}</div>`)}
      ${dayIsMine(ds)?`<span class="mymk" title="${T("這天有你剪的片","You have work this day")}">✦</span>`:''}
    </div>`;
  }
  return `
  <div class="card">
    <div class="calhead">
      <button class="calnav" onclick="calMove(-1)" title="${T("上月","Previous month")}">‹</button>
      <div class="calmonth">${currentRole()==="intl"?`${MONTHS_EN[m]} ${y}`:`${y} <span>年</span> ${m+1} <span>月</span>`}</div>
      <button class="calnav" onclick="calMove(1)" title="${T("下月","Next month")}">›</button>
    </div>
    <div class="cal">
      ${(currentRole()==="intl"?["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]:["日","一","二","三","四","五","六"]).map(x=>`<div class="dow">${x}</div>`).join("")}
      ${cells}
    </div>
    <div class="callegend">
      <span><i class="lg-g"></i>${T("已排滿","Full")}</span>
      <span><i class="lg-r"></i>${T("待補","Behind")}</span>
      <span><i class="lg-b"></i>${T("未排","None")}</span>
      <span><i class="lg-t"></i>${T("今天","Today")}</span>
      ${isEd?`<span style="color:var(--accent)">✦ ${T("有你剪的片","Your work")}</span>`:''}
    </div>
  </div>`;
}
function calMove(n){ let [y,m]=CAL_YM; m+=n; if(m<0){m=11;y--;} if(m>11){m=0;y++;} CAL_YM=[y,m]; render(); }
// ---- 月排程合一：一個分頁、下面選平台（社群媒體／海外 TikTok／蝦皮／馬來）----
let CAL_PLAT="tw";
function calSetPlat(p){ CAL_PLAT=p; render(); }
function viewCal(){
  // 依分工：一創只看社群媒體（中文）月曆，二創看四個平台/語言月曆
  const allPlats=[["tw",T("中文","Chinese")],["th",T("泰文","Thai")],["shopee",T("蝦皮","Shopee")],["en",T("英文","English")],["ms",T("馬來西亞","Malaysia")]];
  const plats=allPlats.filter(([k])=> k==="tw" ? doesOrig() : doesDerived());
  if(!plats.some(([k])=>k===CAL_PLAT)) CAL_PLAT=(plats[0]||allPlats[0])[0];
  const sel=`<div class="row" style="gap:8px;align-items:center;margin-bottom:14px">
    <label style="margin:0">${T("平台","Platform")}</label>
    <select onchange="calSetPlat(this.value)" style="width:auto;min-width:170px">
      ${plats.map(([k,l])=>`<option value="${k}" ${CAL_PLAT===k?'selected':''}>${esc(l)}</option>`).join("")}
    </select></div>`;
  const body= (CAL_PLAT==="en"||CAL_PLAT==="th") ? calIntlBody(CAL_PLAT) : (CAL_PLAT==="shopee"||CAL_PLAT==="ms") ? calChBody(CAL_PLAT) : calTWBody();
  return `<h2>${T("月排程","Schedule")}</h2>${sel}${body}`;
}

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
    const sub=[ ed?`${T("剪輯","Editor")} ${esc(ed)}${reused?T('（重播）',' (rerun)'):''}`:'', tm?esc(tm):'',
      upLink?`<a href="${esc(upLink)}" target="_blank">${T("上傳","Upload")}</a>`:'', drive?`<a href="${esc(drive)}" target="_blank">${T("存檔","File")}</a>`:'' ].filter(Boolean).join(' ・ ');
    return `<tr>
      <td data-label="${T("影片","Video")}"><a href="javascript:void(0)" onclick="editVideo('${it.videoId}')">${esc(v?vidTitle(v):(it.videoId||""))}</a>${v?typeTag(v.mainType):""}${reused?` <span class="tag" style="background:var(--chip);color:var(--gold-dk)">${T("重播","Rerun")}</span>`:''}
        <div class="muted" style="font-size:12px;margin-top:3px">${sub||'—'}</div></td>
      <td data-label="${T("改上片日","Move to")}"><input type="date" value="${ds}" style="font-size:12px;padding:4px;min-width:128px" onchange="${onChg}"></td>
      <td data-label="${T("操作","Action")}"><button class="btn sec sm" style="white-space:nowrap" onclick="${reused?`unscheduleReuse('${it.videoId}','${ds}')`:`unscheduleVid('${it.videoId}','${ds}')`}" title="${T("只把這支移出這天的排程，影片本身不會刪除","Removes from this day only — the video stays")}">${T("移出排程","Unschedule")}</button></td>
    </tr>`;
  }).join("");
  // 排舊片到這天：當天已排過的不再出現；時段自動帶 10/12/16，超過 3 個可自選時間
  const usedIds = new Set(list.map(it=>it.videoId));
  const doneList=(STATE.videos||[]).filter(v=>!v.locale && !v.channel && ["已完成","已上片"].includes(v.stage) && !usedIds.has(v.id) && vidIsOld(v))  // 過了預排上片日（舊片）才能重播；海外/蝦皮二創版不算
    .sort((a,b)=>String(b.finishedAt||b.scheduledDate||"").localeCompare(String(a.finishedAt||a.scheduledDate||"")));
  const dayCount = list.length; const autoTime = PUB_TIMES[dayCount] || PUB_TIMES[PUB_TIMES.length-1];
  const timeField = `<div style="min-width:120px"><label style="margin:0 0 2px">${T("上片時間","Time")}</label>
    <input id="od_time" type="time" value="${autoTime}"></div>`;
  // 存檔位置（雲端備份）＝這支影片本來的存檔，重播都一樣 → 自動帶入；切換影片時更新
  OD_DRIVE={}; doneList.forEach(v=>{ OD_DRIVE[v.id]=v.driveFolder||""; });
  const firstDrive = doneList.length ? (doneList[0].driveFolder||"") : "";
  const reusePicker = `<div class="card" style="border-color:var(--accent)"><b>${T("排舊片重播到這天","Schedule an old video (rerun) on this day")}</b>
    ${doneList.length? `<div class="row" style="gap:8px;margin-top:8px;align-items:flex-end">
        <div style="flex:1;min-width:150px"><label style="margin:0 0 2px">${T("選一支舊片","Pick an old video")}</label>
          <select id="od_vid" onchange="odPickVid()">${doneList.map(v=>`<option value="${v.id}">${esc(vidTitle(v))}${T("（已用 "+usageList(v).length+" 次）"," (used "+usageList(v).length+"x)")}</option>`).join("")}</select></div>
        ${timeField}
        <button class="btn sm" onclick="odReuse('${ds}')">${T("排入","Add")}</button>
      </div>
      <label style="margin:8px 0 2px">${T("存檔位置（雲端備份・自動帶入，同一支都一樣）","File location (auto-filled)")}</label>
      <input id="od_drive" value="${esc(firstDrive)}" placeholder="${T("這支影片的雲端備份連結","Cloud backup link")}">
      <label style="margin:8px 0 2px">${T("上傳連結（這次發佈的社群網址・每次可能不同，手動貼上）","Upload URL (this rerun's post — paste manually)")}</label>
      <input id="od_link" placeholder="${T("貼上這次重播要發佈的連結（可先排、之後再補）","Paste the post URL (can add later)")}">`
      : `<p class="muted" style="margin-top:6px">${T("目前沒有可排的舊片。","No old videos available.")}</p>`}
  </div>`;
  const b = dayBreakdown(ds);
  const summary = `<div class="row" style="gap:8px;margin-bottom:8px">`+
    `<span class="pill ${b.full?'ok':'em'}">${T("已排","Scheduled")} ${b.total}/${b.target}${b.full?'':T(`（還缺 ${b.short}）`,` (need ${b.short})`)}</span></div>`;
  showModal(`${ds}（${currentRole()==="intl"?["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(ds+"T00:00:00").getDay()]:weekdayZh(ds)}）`, `
    <div class="card"><b>${T("當日影片","Videos this day")}</b>
      ${summary}
      <table class="responsive"><thead><tr><th>${T("影片（剪輯・時間・連結）","Video (editor · time · links)")}</th><th>${T("改上片日","Move to")}</th><th>${T("操作","Action")}</th></tr></thead>
      <tbody>${rows||`<tr><td class="muted">${T("當日尚無影片","Nothing scheduled")}</td></tr>`}</tbody></table>
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
async function moveReuse(id, oldDate, newDate){ if(!newDate||newDate===oldDate) return; if(dbBlocked()) return;
  const day=(STATE.schedule||{})[oldDate]||{slots:[]}; const idx=(day.slots||[]).findIndex(s=>s.videoId===id && s.reused);
  const link=(idx>=0?(day.slots[idx].publishedLink||""):"");
  try{
    if(idx>=0) await route("DELETE",`/api/schedule/${oldDate}/slot/${idx}`,{});
    await route("POST",`/api/schedule/${newDate}/slot`,{slot:{videoId:id,publishedLink:link,reused:true,by:currentUser(),at:nowIso()}});
    const v=vid(id);
    const hits=(v.usageHistory||[]).filter(u=>u&&typeof u==="object"&&u.date===oldDate);
    if(window.DB&&window.DB.arrayDel){
      for(const u of hits){ await window.DB.arrayDel("videos", id, "usageHistory", u);
        await window.DB.arrayAdd("videos", id, "usageHistory", Object.assign({},u,{date:newDate})); }
    }else{
      await window.DB.update("videos", id, {usageHistory:(v.usageHistory||[]).map(u=>
        (u&&typeof u==="object"&&u.date===oldDate)?Object.assign({},u,{date:newDate}):u)});
    }
    logA("重播改期至 "+newDate, vidTitle(vid(id)||{}));
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
async function unscheduleReuse(id, ds){ if(dbBlocked()) return;
  const v=vid(id)||{};
  const slots=((STATE.schedule||{})[ds]||{}).slots||[];
  const idx=slots.findIndex(s=>s.videoId===id && s.reused);
  if(idx<0){ toast("找不到這天的重播排程",true); return; }
  if(!confirm("把「"+vidTitle(v)+"」的重播移出「"+ds+"」？\n\n只移除這天的重播排程，影片不會刪除。")) return;
  try{
    await route("DELETE",`/api/schedule/${ds}/slot/${idx}`,{});
    const hits=(v.usageHistory||[]).filter(u=>u&&typeof u==="object"&&u.date===ds);
    for(const u of hits) await dbArrayDel("videos", id, "usageHistory", u, ()=>Promise.resolve());
    if(!(window.DB&&window.DB.arrayDel)){   // 舊環境：退回整份寫回
      await window.DB.update("videos", id, {usageHistory:(v.usageHistory||[]).filter(u=>!hits.includes(u))}); }
    await dbBump("videos", id, "totalUsed", -Math.max(1,hits.length), ()=>
      window.DB.update("videos", id, {totalUsed:Math.max(0,(v.totalUsed||0)-1)}));
    logA("移出重播排程 "+ds, vidTitle(v));
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
// ===================================================================
// 統一資料寫入包裝：所有直接寫資料庫的動作都走這裡
//   ① 員工視角（VIEW_AS）一律唯讀，避免管理員預覽時誤改到員工的資料
//   ② 自動寫入操作紀錄（誰、何時、做了什麼、對象）
//   ③ 失敗統一提示；回傳 Promise<boolean>
// ===================================================================
function dbBlocked(){ if(VIEW_AS){ toast(T("員工視角為唯讀預覽，離開後才能操作","Read-only preview — leave it first"),true); return true; } return false; }
function dbWrite(op, coll, id, payload, log){
  if(dbBlocked()) return Promise.resolve(false);
  const p = op==="del" ? window.DB.del(coll, id)
          : op==="set" ? window.DB.set(coll, id, payload)
          : window.DB.update(coll, id, payload);
  return p.then(()=>{ if(log) logA(log.action, log.target||""); return true; })
          .catch(()=>{ toast(T("更新失敗，請稍後再試","Update failed — please try again"),true); return false; });
}
function dbSet(coll, id, o, log){ return dbWrite("set", coll, id, o, log); }
function dbUpdate(coll, id, p, log){ return dbWrite("update", coll, id, p, log); }
function dbDel(coll, id, log){ return dbWrite("del", coll, id, null, log); }

// ===== 交辦工作（剪輯以外）：tasks/{id} =====
function taskById(id){ return Object.values((STATE&&STATE.tasks)||{}).find(x=>x&&x.id===id)||null; }
// HR 通知與交辦共用 tasks 集合，用 kind 分流：kind==="notice" 是 HR 通知（只要按「收到」，不用回報、不計交辦成效）
function isNotice(t){ return !!(t && t.kind==="notice"); }
function isMsg(t){ return !!(t && t.kind==="msg"); }        // 員工主動發給人資／主管的訊息
// 一般交辦與自己排的工作＝沒有 kind 的那些。用「正面判斷」而不是逐一排除，
// 以後再多一種 kind 也不會漏掉，混進交辦成效的數字裡。
function isTask(t){ return !!(t && !t.kind); }
function realTasks(list){ return (list||[]).filter(isTask); }
function allNotices(){ return Object.values((STATE&&STATE.tasks)||{}).filter(isNotice); }
function myTasks(){ return Object.values((STATE&&STATE.tasks)||{})
  .filter(t=>isTask(t) && t.user===currentUser() && t.date===today)
  .sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||""))); }
// 我的 HR 通知：今天發的，加上以前發但我還沒按「收到」的（不會漏看）
function myNotices(){ return allNotices()
  .filter(t=>t.user===currentUser() && (t.date===today || !t.ack))
  .sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))); }
function noticesOf(name){ return allNotices()
  .filter(t=>t.user===name && (t.date===today || !t.ack))
  .sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))); }
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
function addContact(){ if(dbBlocked()) return; const v=(val("ct_name")||"").trim(); if(!v){ toast("請輸入窗口名稱",true); return; }
  const cur=settingsContacts(); if(cur.some(x=>String(x).trim()===v)){ toast("已有相同窗口",true); return; }
  dbArrayAdd("meta","settings","contacts",v,()=>window.DB.setSettings({contacts:cur.concat([v])}))
    .then(()=>{ const i=document.getElementById('ct_name'); if(i)i.value=''; toast("已新增窗口「"+v+"」"); }).catch(()=>toast("新增失敗",true)); }
function delContact(name){ if(dbBlocked()) return; if(!confirm("刪除對接窗口「"+name+"」？（不影響已建立的交辦）")) return;
  const cur=settingsContacts().filter(x=>String(x).trim()!==String(name).trim());
  dbArrayDel("meta","settings","contacts",name,()=>window.DB.setSettings({contacts:cur}))
    .then(()=>toast("已刪除")).catch(()=>toast("刪除失敗",true)); }
function renameContact(name){ if(dbBlocked()) return; const input=prompt("修改對接窗口名稱：", name); if(input===null) return; const nn=input.trim();
  if(!nn||nn===name) return; const cur=settingsContacts(); const i=cur.findIndex(x=>String(x).trim()===String(name).trim()); if(i<0) return;
  if(cur.some((x,j)=>j!==i&&String(x).trim()===nn)){ toast("已有相同窗口",true); return; }
  cur[i]=nn;
  (window.DB&&window.DB.arrayDel
    ? window.DB.arrayDel("meta","settings","contacts",name).then(()=>window.DB.arrayAdd("meta","settings","contacts",nn))
    : window.DB.setSettings({contacts:cur})
  ).then(()=>toast("已改為「"+nn+"」")).catch(()=>toast("修改失敗",true)); }
// 常用工作項目：一鍵加入當日工作計畫（HR 每日確認會看到這些）
// ── 每日固定工作範本（v85）──────────────────────────────────────
// 本來寫死在程式裡，改成管理員可以在「設定」自己維護：
//   settings.dailyTemplates = [{t:"標題", r:"editor"|"cs"|"intl"|"all"}]
// 沒設定時沿用下面這兩組預設，行為跟以前一樣。
const WORK_PRESETS=["剪輯當日影片","調整過往未審核影片／封面","吾家影片／封面製作","影片清單整理","文案內容整理"];
const CS_PRESETS=["回覆客戶訊息","訂單處理／出貨","退換貨處理","客訴追蹤","商品資訊更新"];
const TPL_ROLES=[["all","全部"],["editor","剪輯"],["cs","員工"],["intl","海外剪輯"]];
function dailyTemplates(){
  const s=(STATE&&STATE.settings&&STATE.settings.dailyTemplates);
  if(Array.isArray(s) && s.length) return s.filter(x=>x&&String(x.t||"").trim());
  return WORK_PRESETS.map(t=>({t, r:"editor"})).concat(CS_PRESETS.map(t=>({t, r:"cs"})));
}
// 我這個角色的固定工作
function workPresets(){
  const r=currentRole();
  return dailyTemplates().filter(x=>x.r==="all"||x.r===r).map(x=>String(x.t).trim());
}
// 今天已經有的（不管是自己加的還是主管交辦的）就不要重複帶入
function presetPending(){
  const have=new Set(myTasks().map(t=>String(t.title||"").trim()));
  return workPresets().filter(t=>!have.has(t));
}
async function addPresetTask(title){
  if(VIEW_AS){ toast(T("員工視角為唯讀預覽","Read-only preview"),true); return; }
  const id=uid("T");
  try{ await window.DB.set("tasks", id, {id, user:currentUser(), date:today, title, contact:"", report:"", done:false, assignedBy:"", ack:true, createdAt:nowIso()}); }
  catch(e){ toast(T("新增失敗，請稍後再試","Failed to add, try again"),true); }
}
// 一次把今天還沒有的固定工作全部帶進待辦
async function addAllPresets(){
  if(VIEW_AS){ toast(T("員工視角為唯讀預覽","Read-only preview"),true); return; }
  const list=presetPending();
  if(!list.length){ toast(T("今天的固定工作都已經在清單裡了","All daily items are already on your list")); return; }
  BULK_BUSY=true; let n=0;
  try{ for(const t of list){ await addPresetTask(t); n++; } }
  finally{ BULK_BUSY=false; applyState(LAST_RAW); }
  toast(T("已帶入 "+n+" 件固定工作", "Added "+n+" daily items"));
}
async function createTask(){ const isIntl=currentRole()==="intl";
  if(VIEW_AS){ toast(isIntl?"Read-only preview":"員工視角為唯讀預覽",true); return; }
  const t=val("wp_newtask").trim(); if(!t){ toast(isIntl?"Please enter a task":"請輸入工作項目",true); return; }
  const contact=(val("wp_contact")||"").trim();
  const when=(val("wp_date")||"").slice(0,10) || today;      // 可以排到之後的日期，那天才會出現在待辦
  const id=uid("T");
  try{ await window.DB.set("tasks", id, {id, user:currentUser(), date:(when<today?today:when), title:t, contact, report:"", done:false, assignedBy:"", ack:true, createdAt:nowIso()});
    if(contact) rememberContact(contact);
    if(when>today) toast(isIntl?("Scheduled for "+when):("已排到 "+when+"，那天會出現在你的待辦"));
    const inp=document.getElementById('wp_newtask'); if(inp) inp.value=''; const c=document.getElementById('wp_contact'); if(c) c.value=''; }
  catch(e){ toast(isIntl?"Failed to add, please try again":"新增失敗，請稍後再試",true); } }
// 主管交辦給指定員工：自動出現在他的頁面（今天），需按「收到」
async function assignTaskSel(){ if(dbBlocked()) return; const name=val("asg_who"); const t=val("asg_txt").trim(); const contact=(val("asg_contact")||"").trim();
  if(!name){ toast("請先選擇要指派的員工",true); return; }
  if(!t){ toast("請輸入要指派的工作內容",true); return; }
  const id=uid("T");
  try{ await window.DB.set("tasks", id, {id, user:name, date:today, title:t, contact, report:"", done:false, assignedBy:currentUser(), ack:false, createdAt:nowIso()});
    if(contact) rememberContact(contact);
    const a=document.getElementById('asg_txt'); if(a) a.value=''; const c=document.getElementById('asg_contact'); if(c) c.value=''; toast("已指派給 "+name); }
  catch(e){ toast("指派失敗，請稍後再試",true); } }
// 人資發 HR 通知：可以指定一個人或全體；對方畫面會跳出來，按小小的「收到」即可（不用回報、不算交辦）
async function hrNotify(){ if(dbBlocked()) return;
  const who=val("hrn_who"); const txt=val("hrn_txt").trim();
  if(!txt){ toast("請輸入通知內容",true); return; }
  const ALL={"__all__":["editor","intl","cs","hr"], "__editor__":["editor"], "__cs__":["cs"], "__intl__":["intl"], "__hr__":["hr"]};
  const targets = ALL[who] ? staffNamesSorted(ALL[who]) : (who?[who]:[]);
  if(!targets.length){ toast("請先選擇要通知的對象",true); return; }
  try{
    for(const name of targets){
      const id=uid("N");
      await window.DB.set("tasks", id, {id, kind:"notice", user:name, date:today, title:txt, contact:"", report:"",
        done:false, assignedBy:currentUser(), ack:false, createdAt:nowIso()});
    }
    logA("發出 HR 通知（"+targets.length+" 人）", txt);
    const a=document.getElementById("hrn_txt"); if(a) a.value="";
    toast(targets.length>1?("已通知 "+targets.length+" 位同仁"):("已通知 "+targets[0]));
  }catch(e){ toast("發送失敗，請稍後再試",true); }
}
// 人資收回自己發的通知（打錯字或發錯人）
function hrNotifyDel(id){ const t=taskById(id);
  if(!confirm("收回這則通知？\n「"+((t&&t.title)||"")+"」")) return;
  dbDel("tasks", id, {action:"收回 HR 通知", target:(t&&t.title)||id}); }
// 管理員指派毛片給指定員工（只分配、不啟動計時；員工自己認領才開始計時）
function afpToggleAll(btn){ const boxes=Array.from(document.querySelectorAll('.afp_vid'));
  const turnOn=boxes.some(b=>!b.checked); boxes.forEach(b=>b.checked=turnOn); if(btn) btn.textContent=turnOn?"全部取消":"全選"; }
async function assignFootage(){
  if(dbBlocked()) return;
  const who=val("afp_who");
  if(!who){ toast("請先選擇員工",true); return; }
  const ids=Array.from(document.querySelectorAll('.afp_vid:checked')).map(o=>o.value).filter(Boolean);
  if(!ids.length){ toast("請勾選至少一支毛片",true); return; }
  BULK_BUSY=true; let n=0;
  try{ for(const id of ids){ try{ await window.DB.update("videos",id,{assignedTo:who,updatedAt:nowIso()}); n++; }catch(e){} } }
  finally{ BULK_BUSY=false; applyState(LAST_RAW); }
  logA("指派毛片 "+n+" 支", who);
  await delay(300); toast("已指派 "+n+" 支給「"+who+"」（他認領後才開始計時）");
}
// 收回指派給某員工、但他還沒認領（仍待處理）的毛片，回到公用池
// 防呆：只收回台灣毛片；海外/蝦皮二創殼的 assignedTo＝建立者本人，收回會讓它跑進所有人的清單
async function unassignEditor(name){
  if(dbBlocked()) return;
  const list=(STATE.videos||[]).filter(v=>!v.locale && !v.channel && v.stage==="待處理" && v.assignedTo===name);
  if(!list.length){ toast("「"+name+"」沒有待認領的指派毛片",true); return; }
  if(!confirm("把指派給「"+name+"」但還沒認領的 "+list.length+" 支毛片收回公用池？")) return;
  BULK_BUSY=true; let n=0;
  try{ for(const v of list){ try{ await window.DB.update("videos",v.id,{assignedTo:""}); n++; }catch(e){} } }
  finally{ BULK_BUSY=false; applyState(LAST_RAW); }
  logA("收回指派毛片 "+n+" 支", name);
  await delay(300); toast("已收回 "+n+" 支到公用池");
}
function ackTask(id){ const t=taskById(id);
  dbUpdate("tasks", id, {ack:true, ackAt:nowIso()}, {action:isNotice(t)?"收到 HR 通知":"收到交辦工作", target:(t&&t.title)||id}); }
function noticeReply(id, v){ if(VIEW_AS) return; window.DB.update("tasks", id, {report:v}).catch(()=>{}); }

// ── 員工主動發訊息給人資或主管（v83）──────────────────────────────
// 交辦與 HR 通知都是「由上往下」，員工只能在既有的事情上回應。
// 這裡讓員工可以自己起一個頭：選人資或主管，寫一句話，對方一定要回。
// 沒有訊息時畫面上完全不會出現任何東西（收件卡整張不渲染）。
function allMsgs(){ return Object.values((STATE&&STATE.tasks)||{}).filter(isMsg); }
const msgSort=(a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""));
function myMsgs(){ return allMsgs().filter(m=>m.user===currentUser()).sort(msgSort); }
// 誰收得到：人資收 to==="hr"、經理人收 to==="boss"；
// 管理員兩種都收得到（人資由管理員考核，看得到人資的一切）
function msgInboxFor(role){
  return role==="hr" ? ["hr"] : role==="manager" ? ["boss"] : role==="boss" ? ["hr","boss"] : [];
}
function msgsForMe(){
  const want=msgInboxFor(currentRole()); if(!want.length) return [];
  return allMsgs().filter(m=>want.includes(m.to||"boss")).sort(msgSort);
}
const msgOpen=(m)=>!String((m&&m.reply)||"").trim();      // 還沒被回覆
async function sendMsg(){
  if(VIEW_AS){ toast(T("員工視角為唯讀預覽","Read-only preview"),true); return; }
  const to=(val("msg_to")||"hr")==="boss"?"boss":"hr";
  const t=(val("msg_txt")||"").trim();
  if(!t){ toast(T("請先寫下你想說的事","Write your message first"),true); return; }
  const id=uid("M");
  try{ await window.DB.set("tasks", id, {id, kind:"msg", user:currentUser(), to, date:today,
        title:t, reply:"", replyBy:"", replyAt:"", seen:false, createdAt:nowIso()});
    const i=document.getElementById("msg_txt"); if(i) i.value="";
    toast(to==="hr"?T("已送出給人資，等他回覆","Sent to HR"):T("已送出給主管，等他回覆","Sent to your manager"));
    logA("發訊息給"+(to==="hr"?"人資":"主管"), t.slice(0,40));
  }catch(e){ toast(T("送出失敗，請稍後再試","Failed to send, try again"),true); }
}
// 人資／主管回覆
function msgReply(id){
  const v=(val("mr_"+id)||"").trim();
  if(v.length<2){ toast("請簡單回覆一下",true); return; }
  const m=taskById(id);
  dbUpdate("tasks", id, {reply:v, replyBy:currentUser(), replyAt:nowIso(), seen:false},
    {action:"回覆同仁來訊", target:(m&&m.user)||id});
}
// 發訊的人看過回覆了 → 清掉小紅點
function msgSeen(id){ if(VIEW_AS) return;
  dbUpdate("tasks", id, {seen:true}, {action:"已看過回覆", target:id}); }
// 還沒被回覆之前可以自己收回
function msgDel(id){
  const m=taskById(id); if(!m) return;
  if(m.user!==currentUser()){ toast(T("只能收回自己發的訊息","You can only withdraw your own message"),true); return; }
  if(!msgOpen(m)){ toast(T("對方已經回覆了，不能收回","Already answered — can't withdraw"),true); return; }
  if(!confirm(T("收回這則訊息？","Withdraw this message?"))) return;
  dbDel("tasks", id, {action:"收回訊息", target:id});
}
function taskReport(id, v){ if(VIEW_AS) return; window.DB.update("tasks", id, {report:v}).catch(()=>{}); }   // 逐字輸入不記錄、不打擾
function taskDone(id, done){ const isIntl=currentRole()==="intl"; const t2=taskById(id);
  if(done){ const t=Object.values((STATE&&STATE.tasks)||{}).find(x=>x&&x.id===id);
    if(t && t.assignedBy && !t.ack){ toast(isIntl?"Press “Got it” first before marking done":"請先按「收到」再回報完成",true);
      const c=document.getElementById('tc_'+id); if(c) c.checked=false; return; }
    if(t && (t.report||'').trim().length<12){ toast(isIntl?"Write a full progress note before marking done":"請填寫完整處理狀況及後續才能打勾完成",true);
      const c=document.getElementById('tc_'+id); if(c) c.checked=false; return; } }
  dbUpdate("tasks", id, {done:!!done, doneAt: done?nowIso():""}, {action:done?"交辦工作標記完成":"交辦工作改回進行中", target:(t2&&t2.title)||id}); }
function delTask(id){ const isIntl=currentRole()==="intl"; const t=taskById(id);
  if(!confirm(isIntl?"Delete this task?":"刪除這項交辦工作？")) return;
  dbDel("tasks", id, {action:"刪除交辦工作", target:(t&&t.title)||id}); }
// 管理員：把交辦工作轉移給其他員工（原員工會消失，新員工需重新按「收到」）
function transferTask(id){
  const t=Object.values((STATE&&STATE.tasks)||{}).find(x=>x&&x.id===id);
  if(!t){ toast("找不到這項交辦",true); return; }
  // 交辦可指派給台灣剪輯或海外剪輯，轉移對象也一致
  const editors=staffNamesSorted(["editor","intl"]).filter(n=>n!==t.user);
  if(!editors.length){ toast("沒有其他員工可轉移",true); return; }
  const menu=editors.map((n,i)=>`${i+1}. ${n}`).join("\n");
  const ans=prompt("把「"+t.title+"」轉移給哪位員工？輸入編號：\n"+menu); if(ans===null) return;
  const idx=parseInt(String(ans).trim(),10)-1;
  if(isNaN(idx)||idx<0||idx>=editors.length){ toast("編號不正確",true); return; }
  const to=editors[idx];
  dbUpdate("tasks", id, {user:to, ack:false, ackAt:"", done:false, doneAt:""}, {action:"轉移交辦工作給 "+to, target:t.title})
    .then(()=>toast("已轉移給「"+to+"」，等對方按「收到」重新計時"))
    .catch(()=>toast("轉移失敗",true));
}

// 上班計畫：審片進度卡（被退回要修／已審過通過／待審核 三段；剪完 → 審 → 通過才上傳補連結）
function workReviewCard(me){
  const myVids=(STATE.videos||[]).filter(v=>!v.deleted && (v.editor===me||v.claimedBy===me));
  const rejected=myVids.filter(v=>v.reviewStatus==="退回");
  const waitingReview=myVids.filter(needsReview);
  // 已審過（不論 Regina 按的還是剪輯自己按的）都要「亮出來」，不能沈下去：
  // 還缺連結 → 一直提醒到補齊；連結補齊 → 顯示「已審過 ✓」，剪輯按「知道了」才收起（審過 7 天後自動不顯示）
  const d7=new Date(Date.now()+288e5-7*864e5).toISOString().slice(0,10);
  const linksDone=(v)=>!!(String(v.driveFolder||"").trim() && String(v.publishedLink||"").trim());
  const approvedTodo=myVids.filter(v=>v.stage==="已完成" && v.reviewStatus==="通過" && !v.reviewAck
    && (!linksDone(v) || String(v.reviewedAt||"").slice(0,10)>=d7));
  const openFn=(v)=>(v.channel&&CHANNELS[v.channel])?`openChModal('${v.channel}','${v.id}')`:v.locale?`openIntlModal('${v.id}')`:`editVideo('${v.id}')`;
  const nRev=rejected.length+approvedTodo.length+waitingReview.length;
  const rejCard = nRev?`<div class="card" style="border-color:${rejected.length?'var(--red)':(approvedTodo.length?'var(--gold)':'var(--line)')}">
    <div class="row" style="justify-content:space-between;align-items:center">
      <b style="font-size:16px">${T("審片進度（別忘了這些）","Review status (don't forget these)")}</b>
      <span class="pill ${(rejected.length||approvedTodo.length)?'wa':'ok'}">${nRev}</span></div>
    ${rejected.length?`<div style="margin-top:8px"><b style="color:var(--red);font-size:13px">✕ ${T("被退回，要修","Sent back — fix these")}（${rejected.length}）</b>
      ${rejected.map(v=>`<div style="margin-top:6px;padding:9px;background:var(--redbg);border-radius:5px">
        <a href="javascript:void(0)" onclick="${openFn(v)}"><b>${shpBadge(v)}${esc(vidTitle(v))}</b></a>
        ${v.reviewNote?`<div class="muted" style="font-size:12px;margin-top:2px">${T("退回原因","Reason")}：${esc(v.reviewNote)}</div>`:''}</div>`).join("")}</div>`:''}
    ${approvedTodo.length?`<details class="fold" style="margin-top:10px"><summary style="color:var(--gold-dk);font-size:13px">✓ ${T("已審過（通過）","Approved")}<span class="n">${approvedTodo.length}</span>${
      // 收起來也要看得出還有幾支要去補連結，不然收合等於忘記
      (()=>{ const n=approvedTodo.filter(v=>!linksDone(v)).length;
        return n?`<span class="pill em" style="font-size:10px;margin-left:6px">${T(n+" 支還缺連結", n+" need links")}</span>`:""; })()
      }</summary><div class="foldbody">
      ${approvedTodo.map(v=>{ const who=`${esc(v.reviewedBy||"Regina")} ${T("已審過","approved")}${v.reviewedAt?("・"+esc(String(v.reviewedAt).slice(0,10))):''}`;
        if(!linksDone(v)) return `<div style="margin-top:6px;padding:9px;background:var(--amberbg);border-radius:5px">
          <a href="javascript:void(0)" onclick="${openFn(v)}"><b>${shpBadge(v)}${esc(vidTitle(v))}</b></a> <span class="pill ok" style="font-size:10px">${T("已審過","Approved")}</span>
          <div class="muted" style="font-size:12px;margin-top:2px">${who}</div></div>`;
        return `<div style="margin-top:6px;padding:9px;background:var(--greenbg);border-radius:5px;display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="min-width:0"><a href="javascript:void(0)" onclick="${openFn(v)}"><b>${shpBadge(v)}${esc(vidTitle(v))}</b></a> <span class="pill ok" style="font-size:10px">${T("已審過","Approved")}</span>
          <span class="muted" style="font-size:12px"> ${who}・${T("連結都補齊了","links all set")}</span></span>
          <button class="btn sec sm" style="flex:none" onclick="ackReviewedVid('${v.id}')" title="${T("收起這則通知","Dismiss this notice")}">${T("知道了","Got it")}</button></div>`; }).join("")}
      </div></details>`:''}
    ${waitingReview.length?`<div style="margin-top:10px"><b class="muted" style="font-size:13px">⏳ ${T("待審核 — Regina 說 OK 後，自己按「已審過」進下一步","In review — once Regina says OK, tap “Approved” to move on")}（${waitingReview.length}）</b>
      ${waitingReview.map(v=>`<div style="margin-top:6px;padding:7px 9px;background:var(--panel2);border-radius:5px;font-size:13px;display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="min-width:0"><a href="javascript:void(0)" onclick="${openFn(v)}">${shpBadge(v)}${esc(vidTitle(v))}</a> <span class="muted" style="font-size:12px">${T("完成於","done")} ${esc(String(v.finishedAt||"").slice(0,10))}</span></span>
        <button class="btn sm" style="flex:none" onclick="editorMarkReviewed('${v.id}')" title="${T("Regina 審過了 → 標記通過，開始上傳雲端＋補連結","Regina approved it — mark as passed and start the next step")}">✓ ${T("已審過，下一步","Approved — next")}</button></div>`).join("")}</div>`:''}
  </div>`:'';
  return rejCard;
}
// 天數標記：今天＝新，昨天＝2，前天＝3…（越久顏色越警示）
function dayBadge(v){ const b=claimDayBadge(v); const n=(b==="新")?1:(+b); const col=n>=4?'var(--red)':(n>=2?'var(--amber)':'var(--accent)');
  return `<span style="display:inline-flex;min-width:30px;height:30px;padding:0 9px;border-radius:5px;background:${col};color:#fff;font-weight:900;font-size:14px;align-items:center;justify-content:center">${b==="新"?T("新","New"):b}</span>`; }
// 平台/語言小圖示（蝦/馬/EN/TH）：跟一般影片合併同一份清單顯示，靠這個小圖分辨
function shpBadge(v){ return (v.channel&&CHANNELS[v.channel])
  ? `<span class="pill" style="font-size:10px;background:var(--accent);color:#fff;margin-right:5px" title="${T(CHANNELS[v.channel].verName,CHANNELS[v.channel].verNameEn)}">${T(CHANNELS[v.channel].short,CHANNELS[v.channel].shortEn)}</span>`
  : v.locale ? `<span class="pill" style="font-size:10px;background:var(--accent);color:#fff;margin-right:5px" title="${esc(localeName(v.locale))} version">${localeShort(v.locale)}</span>` : ''; }
// 上班計畫：待認領卡（快選列＋清單＋認領/退回鍵）
function workPoolCard(pool, poolShown, poolCats, poolCnt, me, atLimit){
  return `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center">
      <b style="font-size:16px">${T("待認領（毛片＋二創版本）","To claim (raw + versions)")}</b>
      <span class="pill ${poolShown.length?'ok':'wa'}">${(POOL_FILTER==="all"&&!POOL_Q)?pool.length:poolShown.length+"/"+pool.length}</span>
    </div>
    <div class="vtabs" style="margin-top:10px">${poolCats.map(([k,l])=>`<button class="vtab ${POOL_FILTER===k?'on':''}" onclick="setPoolFilter('${k}')">${l} <span class="vtab-n">${poolCnt[k]||0}</span></button>`).join("")}</div>
    <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">
      <input id="pool_q" value="${esc(POOL_Q)}" placeholder="${T("找影片（片名、編號、來源…）","Find a video (name, code, source…)")}"
        style="flex:1;min-width:150px" onchange="setPoolQ(this.value)" onkeydown="if(event.key==='Enter')setPoolQ(this.value)">
      ${POOL_Q?`<button class="btn sec sm" style="flex:none" onclick="setPoolQ('')">${T("清除","Clear")}</button>`:""}
    </div>
    <div style="margin-top:8px${poolShown.length>5?';max-height:300px;overflow-y:auto':''}">
    <table class="responsive"><thead><tr><th>${T("影片","Video")}</th><th style="width:150px">${T("動作","Action")}</th></tr></thead>
    <tbody>${poolShown.map(v=>`<tr>
        <td data-label="${T("影片","Video")}"><a href="javascript:void(0)" onclick="${(v.channel&&CHANNELS[v.channel])?`openChModal('${v.channel}','${v.id}')`:v.locale?`openIntlModal('${v.id}')`:`editVideo('${v.id}')`}">${shpBadge(v)}${esc(vidTitle(v))}</a> ${v.assignedTo===me?`<span class="tag" style="background:var(--amberbg);color:var(--accent)">${T("指派給你","Assigned to you")}</span>`:''} <span class="muted" style="font-size:12px">${esc(v.source||"")}</span>${(v.locale||v.channel)&&v.createdBy?`<span class="muted" style="font-size:12px"> · ${T("由 "+esc(v.createdBy)+" 建立","added by "+esc(v.createdBy))}</span>`:''}${enSubLine(v)}</td>
        <td data-label="${T("動作","Action")}"><div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm" onclick="claimVid('${v.id}')" ${atLimit?'disabled style="opacity:.5;cursor:not-allowed"':''} title="${atLimit?T('你已有 3 支在剪，完成一支才能再領（排隊中）','You already have 3 in progress — finish one first'):T('按一下＝認領並開始剪（變剪輯中、進我的工作、開始計時）','Claim & start (timer begins)')}">${atLimit?T('排隊中','Queued'):T('認領開始剪','Claim & start')}</button>${poolDiscardBtn(v)}</div></td>
      </tr>`).join("")||`<tr><td colspan="2" class="muted">${POOL_Q?T("找不到符合「"+esc(POOL_Q)+"」的項目","Nothing matches “"+esc(POOL_Q)+"”"):(POOL_FILTER==="all"?T("目前沒有指派給你或可認領的項目","Nothing assigned to you or available to claim"):T("這一類目前沒有可認領的項目（點「全部」看其他）","Nothing to claim in this group — tap All to see the rest"))}</td></tr>`}</tbody></table>
    </div>
    ${atLimit?`<p class="muted" style="font-size:12px;margin:6px 0 0"><span style="color:var(--red)">${T("你已有 3 支製作中，先完成幾支再領","You have 3 in progress — finish some before claiming more")}</span></p>`:''}
  </div>`;
}
// 上班計畫：我的今日工作卡（進行中＋今天剛完成；天數標記與各線專屬按鈕）
function workMineCard(myWork, inProg, atLimit, workBtn, undoBtn){
  return `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center">
      <b style="font-size:16px">${T("我的今日工作","My work today")}</b>
      <span class="pill ok">${T("製作中","In progress")} ${inProg}</span>
    </div>
    <table class="responsive" style="margin-top:10px"><thead><tr><th style="width:60px">${T("天數","Days")}</th><th>${T("影片","Video")}</th><th style="width:200px">${T("狀態","Status")}</th></tr></thead>
    <tbody>${myWork.map(v=>`<tr>
        <td data-label="${T("天數","Days")}">${v.stage==="剪輯中"?dayBadge(v):'<span class="muted">—</span>'}</td>
        <td data-label="${T("影片","Video")}"><a href="javascript:void(0)" onclick="${(v.channel&&CHANNELS[v.channel])?`openChModal('${v.channel}','${v.id}')`:v.locale?`openIntlModal('${v.id}')`:`editVideo('${v.id}')`}">${shpBadge(v)}${esc(vidTitle(v))}</a> <span class="muted" style="font-size:12px">${esc(v.source||"")}</span>${enSubLine(v)}</td>
        <td data-label="${T("狀態","Status")}"><div class="row" style="gap:6px">${workBtn(v)}${undoBtn(v)}</div></td>
      </tr>`).join("")||`<tr><td colspan="3" class="muted">${T("目前沒有進行中的影片，從上面「待認領」認領一支開始","Nothing in progress — claim one from the pool above")}</td></tr>`}</tbody></table>
  </div>`;
}
// 折疊區塊：次要的東西收進來，點了才展開
function fold(title, count, body, open){
  if(!body) return "";
  return `<details class="fold" ${open?"open":""}><summary>${esc(title)}${count!=null?`<span class="n">${count}</span>`:""}</summary>
    <div class="foldbody">${body}</div></details>`;
}
// 我排在未來的工作（到那天才會進今日待辦）
function myFutureTasks(){ return Object.values((STATE&&STATE.tasks)||{})
  .filter(t=>isTask(t) && t.user===currentUser() && String(t.date||"")>today)
  .sort((a,b)=>String(a.date).localeCompare(String(b.date))); }
function taskSetDate(id, d){ if(!d) return; const t=taskById(id);
  dbUpdate("tasks", id, {date:String(d).slice(0,10)}, {action:"改工作日期", target:(t&&t.title)||id}); }
// 今日待辦的一列
function todoRow(kind, title, sub, actions, doneCls){
  return `<div class="todo ${doneCls?'done':''}"><span class="tkind">${kind}</span>
    <div class="tmain"><div class="ttitle">${title}</div>${sub?`<div class="tsub">${sub}</div>`:""}</div>
    <div class="tact">${actions||""}</div></div>`;
}
// ── 今天要做的事：把通知、交辦、自己排的工作、手上的影片合成一條清單 ──
function todayListCard(tasks, myWork, workBtn, undoBtn){
  const rows=[];
  // ① HR 通知（只要按收到）
  const notices=myNotices();
  notices.forEach(n=>rows.push(todoRow("📣", esc(n.title),
    `${T("HR 通知","HR notice")}・${esc(String(n.date||"").slice(5))}`
    + `<input id="nr_${n.id}" value="${esc(n.report||'')}" style="margin-top:6px;font-size:13px;padding:6px 10px"
         onchange="noticeReply('${n.id}',this.value)" placeholder="${T("想回覆什麼可以寫在這裡（選填）…","Reply here (optional)…")}">`,
    n.ack? `<span class="pill ok" style="font-size:10px">${T("已收到","Received")} ${String(n.ackAt||"").slice(11,16)}</span>`
         : `<button class="btn sm" style="padding:4px 14px" onclick="ackTask('${n.id}')">${T("收到","Got it")}</button>`,
    n.ack)));
  // ② 交辦與自己排的工作
  tasks.forEach(t=>{
    const assigned=!!t.assignedBy, needAck=assigned&&!t.ack;
    const can=(t.report||'').trim().length>=12;
    const sub=[assigned?T("主管交辦","Assigned"):T("自己排的","Self"),
               t.contact?T("窗口 ","Contact ")+esc(t.contact):""].filter(Boolean).join("・");
    const act = needAck
      ? `<button class="btn sm" style="padding:4px 14px" onclick="ackTask('${t.id}')">${T("收到","Got it")}</button>`
      : `<label style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:${t.done?'var(--green)':'var(--amber)'}">
           <input type="checkbox" id="tc_${t.id}" ${t.done?'checked':''} ${can||t.done?'':'disabled'}
             onchange="taskDone('${t.id}',this.checked)" style="width:auto;margin:0"> ${t.done?T('完成','Done'):T('未完成','Open')}</label>
         ${assigned?'':`<button class="btn sec sm" style="padding:3px 9px" onclick="delTask('${t.id}')">✕</button>`}`;
    const note = needAck ? "" :
      `<input id="tr_${t.id}" value="${esc(t.report||'')}" style="margin-top:6px;font-size:13px;padding:6px 10px"
         oninput="var c=document.getElementById('tc_${t.id}');if(c)c.disabled=this.value.trim().length<12"
         onchange="taskReport('${t.id}',this.value)" placeholder="${T("處理狀況及後續（滿 12 字才能打勾完成）…","Progress note (12+ chars to tick done)…")}">`;
    const ttl=esc(t.title)+((assigned&&currentRole()==="intl")?` <a class="tricon" href="${gtranslate(t.title,'en')}" target="_blank" title="Translate">文<span>A</span></a>`:"");
    rows.push(todoRow(assigned?"📌":"•", ttl, sub+note, act, t.done));
  });
  // ③ 手上的影片
  myWork.forEach(v=>{
    const days=v.stage==="剪輯中"?dayBadge(v):"";
    rows.push(todoRow("🎬",
      `<a href="javascript:void(0)" onclick="${(v.channel&&CHANNELS[v.channel])?`openChModal('${v.channel}','${v.id}')`:v.locale?`openIntlModal('${v.id}')`:`editVideo('${v.id}')`}">${shpBadge(v)}${esc(vidTitle(v))}</a>${enSubLine(v)}`,
      [v.stage==="剪輯中"?T("剪輯中","In progress"):T("今天完成","Done today"), esc(v.source||"")].filter(Boolean).join("・"),
      `${days}${workBtn(v)}${undoBtn(v)}`, v.stage!=="剪輯中"));
  });
  const nOpen=rows.filter(r=>!r.includes("todo done")).length;
  // 每日固定工作：今天還沒帶進來的才顯示；全部帶完了這一排就消失
  const pend=presetPending();
  const presets=!pend.length?"":`<div class="row" style="gap:6px;flex-wrap:wrap;margin:10px 0 6px">
      <span class="muted" style="font-size:12px;align-self:center">${T("每日固定：","Daily:")}</span>
      ${pend.map(p=>`<button class="btn sec sm" style="padding:4px 10px;font-size:12px" onclick="addPresetTask('${esc(jsEsc(p))}')">＋ ${esc(p)}</button>`).join("")}
      ${pend.length>1?`<button class="btn sm" style="padding:4px 10px;font-size:12px" onclick="addAllPresets()">${T("全部帶入","Add all")}（${pend.length}）</button>`:""}</div>`;
  return `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:16px">${T("今天要做的事","Today")}</b>
      ${notices.filter(n=>!n.ack).length?`<span class="pill em">📣 ${T(notices.filter(n=>!n.ack).length+" 則未讀", notices.filter(n=>!n.ack).length+" unread")}</span>`:""}
      <span class="pill ${nOpen?'wa':'ok'}">${nOpen?T("還有 "+nOpen+" 件","„"+nOpen+" left").replace("„","")+"":T("都做完了 ✓","All done ✓")}</span></div>
    <div style="margin-top:6px">${rows.join("")||`<div class="emptyState"><span class="es-mk">✦</span>${T("今天沒有待辦，可以到下面認領工作","Nothing today — claim something below")}</div>`}</div>
    ${presets}
    <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">
      <input id="wp_newtask" placeholder="${T("新增一件事…","Add a task…")}" style="flex:2;min-width:140px" onkeydown="if(event.key==='Enter')createTask()">
      <input id="wp_contact" list="wp_contact_dl" placeholder="${T("對接窗口（選填）","Contact (optional)")}" style="flex:1;min-width:110px" onkeydown="if(event.key==='Enter')createTask()">${contactDatalist('wp_contact_dl')}
      <input id="wp_date" type="date" value="${today}" min="${today}" style="width:auto" title="${T("要哪一天做？預設今天","Which day? Defaults to today")}">
      <button class="btn sm" style="flex:none" onclick="createTask()">＋ ${T("加入","Add")}</button>
    </div>
    <div class="muted" style="font-size:12px;margin-top:6px">${T("排到未來的日期，那天才會出現在這裡。","Pick a future date and it shows up on that day.")}</div>
  </div>`;
}
// ── 找主管／人資說一件事（折疊成一行；有回覆沒看過才亮紅點）──
function myMsgFold(){
  const list=myMsgs();
  const unseen=list.filter(m=>!msgOpen(m) && !m.seen).length;
  const who=(m)=>m.to==="boss"?T("主管","Manager"):T("人資","HR");
  const rows=list.slice(0,12).map(m=>{
    const answered=!msgOpen(m);
    return `<div class="todo ${answered&&m.seen?'done':''}"><span class="tkind">${answered?"💬":"📨"}</span>
      <div class="tmain"><div class="ttitle">${esc(m.title)}</div>
        <div class="tsub">${T("給","To")} ${who(m)}・${esc(String(m.createdAt||"").slice(5,16).replace("T"," "))}
          ${answered?`<div style="margin-top:4px"><b>${esc(m.replyBy||"")}</b> ${T("回覆","replied")}
             <span class="muted" style="font-size:11px">${esc(String(m.replyAt||"").slice(5,16).replace("T"," "))}</span>：${esc(m.reply)}</div>`
                    :`<div style="margin-top:4px" class="muted">${T("等對方回覆中…","Waiting for a reply…")}</div>`}</div></div>
      <div class="tact">${answered
        ? (m.seen?`<span class="pill ok" style="font-size:10px">${T("已回覆","Answered")}</span>`
                 :`<button class="btn sm" style="padding:4px 12px" onclick="msgSeen('${m.id}')">${T("知道了","OK")}</button>`)
        : `<button class="btn sec sm" style="padding:3px 9px" onclick="msgDel('${m.id}')">✕</button>`}</div></div>`;
  }).join("");
  // 人資自己也是員工，但他不能發給自己 → 只留「主管」
  const toSel = currentRole()==="hr"
    ? `<select id="msg_to" style="width:auto"><option value="boss">主管</option></select>`
    : `<select id="msg_to" style="width:auto"><option value="hr">${T("人資","HR")}</option><option value="boss">${T("主管","Manager")}</option></select>`;
  const body=`<div class="row" style="gap:6px;flex-wrap:wrap">
      ${toSel}
      <input id="msg_txt" placeholder="${T("想說的事（請假、反映問題、需要什麼…）","What's on your mind…")}" style="flex:2;min-width:150px"
        onkeydown="if(event.key==='Enter')sendMsg()">
      <button class="btn sm" style="flex:none" onclick="sendMsg()">${T("送出","Send")}</button>
    </div>${rows?`<div style="margin-top:8px">${rows}</div>`:""}`;
  return fold(T("找主管／人資說一件事","Message HR / manager"), unseen||null, body, false);
}
// ── 同仁來訊（人資／主管）：沒有訊息就整張卡都不出現 ──
function msgInboxCard(){
  const list=msgsForMe(); if(!list.length) return "";
  const open=list.filter(msgOpen);
  const label=(m)=>m.to==="boss"?"給主管":"給人資";
  return `<div class="card"${open.length?' style="border-color:var(--gold)"':''}>
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:16px">📨 同仁來訊</b>
      <span class="pill ${open.length?'em':'ok'}">${open.length?open.length+" 則待回覆":"都回覆了"}</span></div>
    ${list.slice(0,20).map(m=>`<div style="margin-top:10px;padding-top:9px;border-top:1px dashed var(--line)">
      <div style="font-size:13.5px"><b>${esc(m.user)}</b>
        <span class="muted" style="font-size:11px">${esc(String(m.createdAt||"").slice(5,16).replace("T"," "))}${currentRole()==="boss"?"・"+label(m):""}</span></div>
      <div style="margin-top:3px">${esc(m.title)}</div>
      ${msgOpen(m)
        ? `<div class="row" style="gap:6px;margin-top:6px">
             <input id="mr_${m.id}" placeholder="回覆他…" style="flex:1;min-width:0" onkeydown="if(event.key==='Enter')msgReply('${m.id}')">
             <button class="btn sm" style="flex:none" onclick="msgReply('${m.id}')">回覆</button></div>`
        : `<div style="margin-top:4px;font-size:13px"><span class="muted">${esc(m.replyBy||"")} 回覆：</span>${esc(m.reply)}
             <span class="muted" style="font-size:11px">${esc(String(m.replyAt||"").slice(5,16).replace("T"," "))}</span></div>`}
    </div>`).join("")}
  </div>`;
}
// ── 之後要做（折疊）──
function futureTasksBody(){
  const list=myFutureTasks(); if(!list.length) return "";
  return list.map(t=>`<div class="todo">
    <span class="tkind">🗓</span>
    <div class="tmain"><div class="ttitle">${esc(t.title)}</div>
      <div class="tsub">${esc(String(t.date).slice(5))}（${weekdayZh(t.date)}）${t.assignedBy?"・"+T("主管交辦","Assigned"):""}</div></div>
    <div class="tact">
      <input type="date" value="${esc(t.date)}" min="${today}" style="width:auto;padding:4px 6px;font-size:12px" onchange="taskSetDate('${t.id}',this.value)">
      ${t.assignedBy?'':`<button class="btn sec sm" style="padding:3px 9px" onclick="delTask('${t.id}')">✕</button>`}
    </div></div>`).join("");
}
// 上班計畫：HR 通知卡 —— 只需要按一顆小小的「收到」，不用回報、不算交辦成效
function workNoticeCard(notices){
  if(!notices.length) return "";
  const nNew=notices.filter(t=>!t.ack).length;
  return `<div class="card" style="border-color:var(--gold)">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:16px">📣 ${T("HR 通知","HR notice")}</b>
      ${nNew?`<span class="pill em" style="font-size:11px">${T(nNew+" 則未讀",nNew+" unread")}</span>`:`<span class="pill ok" style="font-size:11px">${T("都看過了","All read")}</span>`}
    </div>
    <div style="margin-top:8px">${notices.map(t=>`<div style="padding:9px 0;border-bottom:1px solid var(--line)">
      <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:14px;font-weight:600;min-width:0;flex:1">${esc(t.title)}</span>
        ${t.ack?`<span class="pill ok" style="font-size:10px;flex:none">${T("已收到","Received")} ${String(t.ackAt||"").slice(11,16)}</span>`
               :`<button class="btn sm" style="flex:none;padding:4px 14px" onclick="ackTask('${t.id}')">${T("收到","Got it")}</button>`}
      </div>
      <div class="muted" style="font-size:11px;margin-top:2px">${esc(t.assignedBy||"")}・${esc(String(t.date||"").slice(5))} ${String(t.createdAt||"").slice(11,16)}</div>
      <input id="nr_${t.id}" value="${esc(t.report||'')}" style="margin-top:6px;font-size:13px;padding:6px 10px"
        onchange="noticeReply('${t.id}',this.value)" placeholder="${T("想回覆什麼可以寫在這裡（選填）…","Reply here (optional)…")}">
    </div>`).join("")}</div>
  </div>`;
}
// 上班計畫：交辦工作卡（主管交辦需按收到；回報滿 12 字才可打勾完成）
function workTasksCard(tasks){
  return `<div class="card">
    <b style="font-size:16px">${currentRole()==="cs"?"我的今日工作計畫":T("我的今日工作計畫（剪輯以外）","My work plan today (beyond editing)")}</b>
    <div style="margin-top:10px">${tasks.map(t=>{ const can=(t.report||'').trim().length>=12; const assigned=!!t.assignedBy; const needAck=assigned&&!t.ack;
      const head=`<div class="row" style="justify-content:space-between;align-items:center;gap:8px">
          <b style="font-size:14px">${esc(t.title)}${(assigned&&currentRole()==="intl")?` <a class="tricon" href="${gtranslate(t.title,'en')}" target="_blank" title="Translate">文<span>A</span></a>`:''}</b>
          ${assigned?`<span class="pill em" style="font-size:10px;flex:none">${T("主管交辦","Assigned")}</span>`:`<button class="btn sec sm" style="flex:none;padding:4px 10px" onclick="delTask('${t.id}')">${T("刪","✕")}</button>`}
        </div>`;
      const contactLine = t.contact ? `<div style="font-size:12px;margin-top:4px"><span class="muted">${T("對接窗口","Contact")}：</span><b style="color:var(--gold-dk)">${esc(t.contact)}</b></div>` : '';
      if(needAck) return `<div style="border:1px solid var(--gold);background:var(--amberbg);border-radius:6px;padding:12px;margin-bottom:10px">
        ${head}${contactLine}
        <div class="row" style="align-items:center;gap:8px;margin:6px 0 0;flex-wrap:wrap">
          <span class="muted" style="font-size:12px;flex:1;min-width:0">${T("主管交辦・按「收到」開始執行","Assigned · press Got it to start")}</span>
          <button class="btn sm" style="flex:none;padding:4px 14px" onclick="ackTask('${t.id}')">${T("收到","Got it")}</button></div></div>`;
      return `<div style="border:1px solid var(--line);border-radius:6px;padding:12px;margin-bottom:10px">
        ${head}${contactLine}
        ${assigned?`<div class="muted" style="font-size:12px;margin-top:4px">${T("已收到（主管交辦）","Received (assigned)")}</div>`:''}
        <input id="tr_${t.id}" value="${esc(t.report||'')}" style="margin-top:8px" oninput="var c=document.getElementById('tc_${t.id}');if(c)c.disabled=this.value.trim().length<12" onchange="taskReport('${t.id}',this.value)" placeholder="${T("填寫完整處理狀況及後續…","Progress note (at least 12 characters)…")}">
        <label style="display:inline-flex;align-items:center;gap:6px;font-weight:700;margin-top:8px;color:${t.done?'var(--green)':'var(--amber)'}">
          <input type="checkbox" id="tc_${t.id}" ${t.done?'checked':''} ${can||t.done?'':'disabled'} onchange="taskDone('${t.id}',this.checked)" style="width:auto;margin:0"> ${t.done?T('已完成','Done'):T('進行中','In progress')}</label>
      </div>`;}).join("")||`<div class="muted">${T("尚無交辦工作","No tasks yet")}</div>`}</div>
    ${currentRole()==="intl"?"":`<div class="row" style="gap:6px;flex-wrap:wrap;margin:2px 0 8px">
      <span class="muted" style="font-size:12px;align-self:center">常用：</span>
      ${workPresets().map(p=>`<button class="btn sec sm" style="padding:4px 10px;font-size:12px" onclick="addPresetTask('${esc(jsEsc(p))}')">＋ ${esc(p)}</button>`).join("")}</div>`}
    <div class="row" style="gap:8px;margin-top:6px"><input id="wp_newtask" placeholder="${T("自己新增工作項目…","Add your own task…")}" style="flex:2;min-width:150px" onkeydown="if(event.key==='Enter')createTask()"><input id="wp_contact" list="wp_contact_dl" placeholder="${T("對接窗口（選填）","Contact (optional)")}" style="flex:1;min-width:120px" onkeydown="if(event.key==='Enter')createTask()">${contactDatalist('wp_contact_dl')}<button class="btn sm" onclick="createTask()">＋ ${T("加入","Add")}</button></div>
  </div>`;
}
// ===================================================================
// 員工顯示順序（所有清單共用）：一次創作 → 兩種都做 → 二次創作／海外；同組內中文名在前、英文名在後
function staffRank(u){
  const role = u.role||"editor";
  // 一次創作 → 兩種都做 → 二次創作 → 員工（不剪片） → 海外（一律排最後）
  const byCraft = role==="hr" ? 6 : (role==="intl" ? 5 : (role==="cs" ? 4
    : (role==="editor" ? ((u.craft||"orig")==="orig" ? 0 : ((u.craft||"orig")==="both" ? 1 : 2)) : 3)));
  const byName  = /^[A-Za-z]/.test(String(u.name||"")) ? 1 : 0;   // 英文名字排後面
  return [byCraft, 0, byName];
}
function staffSorted(list){
  return (list||[]).slice().sort((a,b)=>{
    const ra=staffRank(a), rb=staffRank(b);
    return (ra[0]-rb[0]) || (ra[1]-rb[1]) || (ra[2]-rb[2]) || String(a.name).localeCompare(String(b.name),"zh-Hant");
  });
}
// 下拉選單的分組：一次創作 / 二次創作 / 海外 / 其他角色（順序即顯示順序）
function staffOptGroups(roles){
  const rs = roles || ["editor","intl"];
  const pool = staffSorted((STATE.users||[]).filter(u=>rs.includes(u.role||"editor")));
  const isEd=(u)=>(u.role||"editor")==="editor";               // 分工只對本地剪輯有意義
  const groups=[
    ["一次創作", u=>isEd(u) && (u.craft||"orig")==="orig"],
    ["二次創作", u=>isEd(u) && (u.craft||"orig")==="derived"],
    ["兩種都做", u=>isEd(u) && (u.craft||"orig")==="both"],
    ["員工",     u=>u.role==="cs"],
    ["海外剪輯", u=>u.role==="intl"],
    ["經理人",   u=>u.role==="manager"],
    ["人資",     u=>u.role==="hr"],
  ];
  const used=new Set();
  return groups.map(([label,test])=>{
    const ppl=pool.filter(u=>!used.has(u.name) && test(u));
    ppl.forEach(u=>used.add(u.name));
    return ppl.length?`<optgroup label="${esc(label)}">${ppl.map(u=>`<option value="${esc(u.name)}">${esc(u.name)}</option>`).join("")}</optgroup>`:'';
  }).join("");
}
// 分清單：剪輯 → 員工（不剪片） → 海外剪輯（海外一律排最後）
const STAFF_GROUPS=[
  ["editor", "剪輯",     "Editors"],
  ["cs",     "員工",     "Staff"],
  ["intl",   "海外剪輯", "Intl editors"],
  ["hr",     "人資",     "HR"],           // 人資自己的出勤與工作也要被記錄（由管理員考核）
];
function staffByGroup(list){
  const pool = staffSorted(list || (STATE.users||[]).filter(u=>["editor","intl","cs","hr"].includes(u.role||"editor")));
  return STAFF_GROUPS.map(([role,zh,en])=>({role, zh, en, people:pool.filter(u=>(u.role||"editor")===role)}))
    .filter(g=>g.people.length);
}
function staffNamesSorted(roles){
  const rs = roles || ["editor","intl"];
  return staffSorted((STATE.users||[]).filter(u=>rs.includes(u.role||"editor"))).map(u=>u.name);
}
// 一次創作／二次創作分工：每位剪輯只看到自己負責的那一種，畫面才不會互相干擾
//   orig    一次創作：台灣毛片、原創影片庫、社群媒體月排程
//   derived 二次創作：蝦皮／馬來西亞／英文／泰文版本（從已完成原創再剪）
//   both    兩種都做（管理員、經理人、人資固定看全部）
// 未設定時：一般剪輯＝一次創作、海外剪輯＝二次創作（他們本來就只做英/泰版）
// ===================================================================
const CRAFT_LABEL={orig:"一次創作",derived:"二次創作",both:"兩種都做"};
function craftOf(name){ const u=(STATE.users||[]).find(x=>x.name===name); if(!u) return "both";
  if(["boss","manager","hr","cs"].includes(u.role)) return "both";
  return u.craft || (u.role==="intl" ? "derived" : "orig"); }
function myCraft(){ if(["boss","manager","hr","cs"].includes(currentRole())) return "both"; return craftOf(currentUser()); }
function doesOrig(){ const c=myCraft(); return c==="orig"||c==="both"; }
function doesDerived(){ const c=myCraft(); return c==="derived"||c==="both"; }
// 這支片屬於哪一種創作
function isDerived(v){ return !!(v && (v.locale||v.channel)); }
// 已封存：二創版本上片後就完成任務，不用再佔清單版面（資料仍留在資料庫）
function isArchived(v){ return isDerived(v) && (v.stage==="已上片" || (v.stage==="已完成" && String(v.publishedLink||"").trim())); }
// 上班計畫：自動帶出製作中影片（標天數）＋ 交辦工作 ＋ 下班匯報
// 不剪片的員工：本日工作只有交辦工作與每日匯報，完全不碰影片
function viewWorkCS(me){
  const tasks=myTasks();
  const nDone=tasks.filter(t=>t.done).length;
  const nAck=tasks.filter(t=>t.assignedBy&&!t.ack).length;
  const nNoReport=tasks.filter(t=>!t.done&&!(t.report||"").trim()).length;
  const nFuture=myFutureTasks().length;
  return `
  <h2>本日工作（${esc(me)}）</h2>
  <div class="focusbar">
    <div><span class="fn ${tasks.length&&nDone<tasks.length?'warn':''}">${nDone}<i>/${tasks.length}</i></span><span class="fl">交辦完成</span></div>
    <div><span class="fn ${nAck?'warn':''}">${nAck}</span><span class="fl">待接收</span></div>
    <div><span class="fn ${nNoReport?'warn':''}">${nNoReport}</span><span class="fl">未回報</span></div>
  </div>
  ${workIssueCard()}
  ${todayListCard(tasks, [], ()=>"", ()=>"")}
  ${fold("之後要做", nFuture, futureTasksBody())}
  ${myMsgFold()}
  <div class="card" style="text-align:center">
    <div><button class="btn" style="font-size:16px;padding:14px 34px" onclick="clockOutReport()">下班匯報</button></div>
  </div>`;
}
function viewWork(){
  const me = currentUser();
  if(currentRole()==="cs") return viewWorkCS(me);
  const inProg = myInProgressCount(); const atLimit = false;   // 已取消同時支數上限（2026-07）；只顯示支數
  // 全員畫面一致（只分中/英介面）：台灣毛片＋蝦皮/馬來/EN/TH 版本全部合併同一份清單，小圖（蝦/馬/EN/TH）分辨
  const mine = (STATE.videos||[]).filter(v=>(v.claimedBy===me||v.editor===me) && v.stage==="剪輯中")
    .sort((a,b)=>String(a.claimedAt||"").localeCompare(String(b.claimedAt||"")));
  // 待剪池：指派給我的 ＋ 還沒指派的公用毛片/版本（別人被指派的不顯示）；指派給我的排前面
  // 待剪順序：依預排上片日期 過去→未來（沒填日期的排最後、再依編號）
  // 依分工過濾：一創只看毛片/原創、二創只看各平台語言版本（兩種都做的看全部）
  const craftOK=(v)=> isDerived(v) ? doesDerived() : doesOrig();
  const pool = (STATE.videos||[]).filter(v=>craftOK(v) && v.stage==="待處理" && (v.assignedTo===me || !v.assignedTo))
    .sort((a,b)=>{ const ad=a.scheduledDate?String(a.scheduledDate).slice(0,10):"9999"; const bd=b.scheduledDate?String(b.scheduledDate).slice(0,10):"9999";
      return ad.localeCompare(bd) || String(a.id).localeCompare(String(b.id)); });
  // 快選：不同平台/語系一鍵過濾（含數量）；超過 5 條時改用捲動視窗（見下方 max-height）
  const poolCats=[["all",T("全部","All")],["tw",T("中文毛片","Chinese raw")],["shopee",T("蝦皮","Shopee")],["ms",T("馬來西亞","Malaysia")],["en",T("英文","English")],["th",T("泰文","Thai")]];
  // 快選上的數字跟著搜尋一起變 —— 搜「珠寶」時就看得出各類各有幾支符合
  const poolHit=pool.filter(poolMatch);
  const poolCnt={all:poolHit.length}; poolHit.forEach(v=>{ const k=poolCat(v); poolCnt[k]=(poolCnt[k]||0)+1; });
  const poolShown=(POOL_FILTER==="all"?pool:pool.filter(v=>poolCat(v)===POOL_FILTER)).filter(poolMatch);
  // 「這支是不是我的」：以剪輯人員為準；剪輯人員沒填時退回看認領人（避免完成後從自己的清單消失）
  const isMine=(v)=> v.editor===me || (!v.editor && v.claimedBy===me);
  const doneToday = (STATE.videos||[]).filter(v=>isMine(v) && isPublished(v) && String(v.finishedAt||"").slice(0,10)===today);
  // 我的剪輯工作 = 進行中(剪輯中) ＋ 今天完成的
  //   完成的用 isPublished（含「已上片」）：上片後階段會變成已上片，只認「已完成」會讓它整支消失。
  //   隔天自然不再出現（靠 finishedAt 是今天）；按過下班也照樣看得到今天做了什麼。
  const myDoneToday = (STATE.videos||[]).filter(v=>isMine(v) && isPublished(v) && v.stage!=="剪輯中" && String(v.finishedAt||"").slice(0,10)===today)
    .sort((a,b)=>String(a.finishedAt||"").localeCompare(String(b.finishedAt||"")));
  const myWork = mine.concat(myDoneToday);
  const tasks = myTasks();
  const g=scheduleGlance();

  // 我的剪輯工作狀態按鈕：我作業中…→（按）編輯內容 ▶（進編輯畫面，存檔＝已完成）；平台/海外二創版走各自專屬編輯視窗/完成流程
  const workBtn=(v)=>{
    if(v.stage==="已完成") return dispStage(v)==="待審核"
      ? `<button class="btn sm" disabled style="opacity:1;background:var(--amber);box-shadow:none">${T("待審核","In review")}</button>`
      : `<button class="btn sm" disabled style="opacity:1;background:var(--green);box-shadow:none">${T("剪輯完成","Done")}</button>`;
    if(v.channel&&CHANNELS[v.channel]) return `<button class="btn sec sm" onclick="openChModal('${v.channel}','${v.id}')">${T("編輯內容","Edit")}</button>
      <button class="btn sm" onclick="chFinish('${v.channel}','${v.id}')" title="${T("剪好了→標記完成並移到影片庫","Mark done and move to the library")}">${T("完成","Done")} ✔</button>`;
    if(v.locale) return `<button class="btn sec sm" onclick="openIntlModal('${v.id}')">${T("編輯內容","Edit")}</button>
      <button class="btn sm" onclick="intlFinish('${v.id}')" title="${T("剪好了→標記完成並移到影片庫","Mark done and move to the library")}">${T("完成","Done")} ✔</button>`;
    // 編輯內容：按「儲存修改」只存、留在原地；要結案再按「完成」→ 標記剪輯完成並移到影片庫
    return `<button class="btn sec sm" onclick="openVideoModal('${v.id}',true,false)" title="${T("編輯內容（按「儲存修改」只存、留在這頁）","Edit content (Save keeps you here)")}">${T("編輯內容","Edit")}</button>
      <button class="btn sm" onclick="finishWork('${v.id}')" title="${T("剪好了→標記「剪輯完成」並移到影片庫","Mark done and move to the library")}">${T("完成","Done")} ✔</button>`; };
  // 退回鍵：把認領的毛片/版本放回待剪清單重選
  const undoBtn=(v)=> v.stage!=="剪輯中" ? '' : (v.channel&&CHANNELS[v.channel])
    ? `<button class="btn sec sm" onclick="chUnclaim('${v.channel}','${v.id}')" title="${T("後悔了？退回待處理清單重選","Return to the to-do pool")}">${T("退回","Return")}</button>`
    : v.locale
      ? `<button class="btn sec sm" onclick="intlUnclaim('${v.id}')" title="${T("後悔了？退回海外待處理清單重選","Return to the to-do pool")}">${T("退回","Return")}</button>`
      : `<button class="btn sec sm" onclick="unclaimVid('${v.id}')" title="${T("後悔了？退回給大家重選","Return to the shared pool")}">${T("退回","Return")}</button>`;
  const rejCard=workReviewCard(me);

  // 今日焦點列：開頁一眼看到自己今天的狀態（缺口才轉紅）
  const nTaskDone=tasks.filter(t=>t.done).length;
  const focusBar=`<div class="focusbar">
    <div><span class="fn">${inProg}</span><span class="fl">${T("製作中","In progress")}</span></div>
    <div><span class="fn">${doneToday.length}</span><span class="fl">${T("今日完成","Done today")}</span></div>
    <div><span class="fn ${tasks.length&&nTaskDone<tasks.length?'warn':''}">${nTaskDone}<i>/${tasks.length}</i></span><span class="fl">${T("交辦完成","Tasks done")}</span></div>
    <div><span class="fn">${pool.length}</span><span class="fl">${T("待認領","To claim")}</span></div>
  </div>`;
  const nFuture=myFutureTasks().length;
  return `
  <h2>${T("本日工作","Today's Work")}（${esc(me)}）</h2>
  ${focusBar}
  ${workIssueCard()}
  ${rejCard}

  ${todayListCard(tasks, myWork, workBtn, undoBtn)}

  ${fold(T("之後要做","Scheduled later"), nFuture, futureTasksBody())}
  ${myMsgFold()}
  ${fold(T("待認領","To claim"), pool.length, workPoolCard(pool, poolShown, poolCats, poolCnt, me, atLimit))}
  ${doesDerived()?fold(T("建立二創版本","Create a version"), null, createZoneCard()):''}
  ${fold(T("今天已完成","Finished today"), doneToday.length, doneToday.length
      ? doneToday.map(v=>`<div class="todo done"><span class="tkind">✓</span><div class="tmain">
          <div class="ttitle">${esc(vidTitle(v))}</div>
          <div class="tsub">${T("完成","Done")} ${esc(String(v.finishedAt||"").slice(11,16))}・${T("剪 ","")}${editDaysLabel(v)||"-"} ${T("天","d")}</div></div></div>`).join("")
      : "")}

  <div class="card" style="text-align:center">
    <div><button class="btn" style="font-size:16px;padding:14px 34px" onclick="clockOutReport()">${T("下班匯報","Clock-out report")}</button></div>
  </div>`
}
// 建立二創版本卡（整合原本的 蝦皮/馬來/海外 三個二創區分頁）：平台下拉切換來源清單
let WORK_ZONE="shopee";
function setWorkZone(z){ WORK_ZONE=z; render(); }
// 待認領快選：all=全部、tw=台灣毛片/原本、shopee/ms=平台殼、en/th=語言殼
let POOL_FILTER="all";
function setPoolFilter(k){ POOL_FILTER=k; render(); }
// 待認領的搜尋（v86）：影片變多了，快選分類之外還要能直接找
let POOL_Q="";
function setPoolQ(v){ POOL_Q=String(v||"").trim(); render(); }
// 比對片名、編號、來源、標籤、平台／語言 —— 剪輯記得哪個字就能找到
function poolMatch(v){
  if(!POOL_Q) return true;
  const q=POOL_Q.toLowerCase();
  return [v.code, v.name, v.rawName, v.nameEn, v.source, v.channel, v.locale,
          Array.isArray(v.tags)?v.tags.join(" "):""]
    .filter(Boolean).join(" ").toLowerCase().includes(q);
}
function poolCat(v){ return (v.channel&&CHANNELS[v.channel])?v.channel:(v.locale||"tw"); }
function createZoneCard(){
  // 全員相同：四個二創排程線合在同一個選單（蝦皮／馬來西亞／英文／泰文），任何人都能新增任一線
  const zones=[["shopee",T("蝦皮","Shopee")],["ms",T("馬來西亞","Malaysia")],["en",T("英文 TikTok","English (TikTok)")],["th",T("泰文 TikTok","Thai (TikTok)")]];
  if(!zones.some(z=>z[0]===WORK_ZONE)) WORK_ZONE=zones[0][0];
  const sel=`<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
    <b style="font-size:16px">${T("建立二創版本","Create a version")}</b>
    <select onchange="setWorkZone(this.value)" style="width:auto;min-width:190px">
      ${zones.map(([k,l])=>`<option value="${k}" ${WORK_ZONE===k?'selected':''}>${esc(l)}</option>`).join("")}
    </select>
    </div>`;
  let body="";
  if(WORK_ZONE==="en"||WORK_ZONE==="th"){
    body=`<input id="intl_q" placeholder="🔍 ${T("搜尋片名／編號","Search title / code")}" oninput="INTL_Q=this.value;intlFilter()" value="${esc(INTL_Q)}" style="width:100%;max-width:360px;margin:10px 0">
      <div id="intl_list" class="${intlSourcePool().length>8?'vidscroll':''}">${intlLibRows(WORK_ZONE)}</div>`;
  } else {
    const C=CHANNELS[WORK_ZONE];
    body=`<input id="${C.pfx}_q" placeholder="🔍 ${T("搜尋片名／編號","Search title / code")}" value="${esc(CH_Q[WORK_ZONE])}" oninput="CH_Q['${WORK_ZONE}']=this.value;chFilter('${WORK_ZONE}')" style="width:100%;max-width:360px;margin:10px 0">
      <div id="${C.pfx}_list" class="${chSourcePool().length>8?'vidscroll':''}">${chLibRows(WORK_ZONE)}</div>`;
  }
  return `<div class="card" style="margin-top:16px">${sel}${body}</div>`;
}
// 下班匯報：自動彙整今日完成上架 ＋ 交辦工作狀況；確認後打下班卡並回登入頁
function clockOutReport(){
  if(VIEW_AS){ toast("員工視角為唯讀預覽，無法代為下班打卡",true); return; }
  const me=currentUser();
  const doneVids=(STATE.videos||[]).filter(v=>v.editor===me && isPublished(v) && String(v.finishedAt||"").slice(0,10)===today);
  const wip=(STATE.videos||[]).filter(v=>(v.claimedBy===me||v.editor===me) && v.stage==="剪輯中");
  const tasks=myTasks();
  const isCS=currentRole()==="cs";
  const body=`
    ${isCS?'':`<div class="card" style="background:var(--panel2)"><b>${T("今日完成上架","Done today")}（${doneVids.length}）</b>
      ${doneVids.length?doneVids.map(v=>`<div style="margin-top:6px">• ${esc(vidTitle(v))} <span class="pill ok" style="font-size:10px">${T("已完成","Done")}</span> <span class="muted" style="font-size:12px">${T("剪 "+editDaysLabel(v)+" 天",editDaysLabel(v)?editDaysLabel(v)+" day(s)":"")}</span></div>`).join("")
        :`<p class="muted" style="margin:6px 0 0">${T("今日尚無完成上架","Nothing finished today")}</p>`}
      ${wip.length?`<p class="muted" style="font-size:12px;margin:8px 0 0">${T("尚有 "+wip.length+" 支製作中（未完成，保留至明天）",wip.length+" still in progress (kept for tomorrow)")}</p>`:''}
    </div>`}
    <div class="card" style="background:var(--panel2)"><b>${T("交辦工作","Tasks")}（${tasks.filter(t=>t.done).length}/${tasks.length}）</b>
      ${tasks.length?tasks.map(t=>`<div style="margin-top:6px">• ${esc(t.title)} ${t.done?`<span class="pill ok" style="font-size:10px">${T("已完成","Done")}</span>`:`<span class="pill em" style="font-size:10px">${T("未完成","Not done")}</span>`}${t.report?` <span class="muted" style="font-size:12px">— ${esc(t.report)}</span>`:''}</div>`).join("")
        :`<p class="muted" style="margin:6px 0 0">${T("今日無交辦工作","No tasks today")}</p>`}
    </div>`;
  showModal(T("下班匯報","Clock-out report"), body, async ()=>{ await doClockOut(); closeModal(); toast(T("辛苦了，已下班 ","Great work — clocked out")); setTimeout(showGoodbye,300); return true; }, T("確認下班","Confirm clock-out"));
}
async function doClockOut(){
  const id=shiftId(currentUser(),today); const env=punchEnv();
  try{ if(myShift()) await window.DB.update("shifts",id,{clockOut:nowIso(), outDev:env.dev, outDevUA:env.ua, outMobile:env.mobile, autoOut:false});
       else await window.DB.set("shifts",id,{id,user:currentUser(),date:today,clockIn:nowIso(),clockOut:nowIso(),
         inDev:env.dev,inDevUA:env.ua,inMobile:env.mobile,outDev:env.dev,outDevUA:env.ua,outMobile:env.mobile,autoOut:false});
    rememberDevice(currentUser(), env);
    grabGeo().then(g=>{ if(g) window.DB.update("shifts", id, {outGeo:g}).catch(()=>{}); });
  }catch(e){}
}
// ===================================================================
// 出勤：班表設定、打卡環境記錄、遲到早退計算、月報表
// 打卡「只記錄不擋」—— 記下裝置、是不是手機、GPS 座標與離公司多遠，
// 報表上標出異常，由人資自己判斷。沒有任何一種網頁打卡擋得住有心作弊。
// ===================================================================
const DEF_WORK={start:"09:00", end:"18:00", grace:10};
// 這台裝置的代碼：同一台裝置幫好幾個人打卡時，報表上看得出來
function deviceId(){
  let d=localStorage.getItem("ecdr_dev");
  if(!d){ d=Math.random().toString(36).slice(2,8).toUpperCase(); localStorage.setItem("ecdr_dev",d); }
  return d;
}
function isMobileUA(){ return /Mobi|Android|iPhone|iPad|iPod/i.test((navigator&&navigator.userAgent)||""); }
// 裝置摘要：作業系統＋瀏覽器。裝置代碼存在瀏覽器裡，清快取就會變；
// 這串摘要不會變，人資對照時看得出「還是同一台 Windows 的 Chrome」還是真的換機器了。
function devUA(){
  const u=(navigator&&navigator.userAgent)||"";
  const os = /Windows/i.test(u)?"Windows" : /Mac OS X|Macintosh/i.test(u)?"Mac" : /iPhone|iPad|iPod/i.test(u)?"iPhone/iPad"
           : /Android/i.test(u)?"Android" : /Linux/i.test(u)?"Linux" : "其他";
  const br = /Edg\//i.test(u)?"Edge" : /OPR\//i.test(u)?"Opera" : /Chrome\//i.test(u)?"Chrome"
           : /Firefox\//i.test(u)?"Firefox" : /Safari\//i.test(u)?"Safari" : "其他";
  return os+"・"+br;
}
// 這台裝置是不是這個人用過的？沒有就是「陌生裝置」
function knownDevices(name){
  const u=((STATE&&STATE.users)||[]).find(x=>x.name===name)||{};
  return Array.isArray(u.devices)?u.devices:[];
}
function isKnownDevice(name, id){ return knownDevices(name).some(d=>d&&d.id===id); }
// 第一次看到的裝置就自動記起來（不用核准；人資在出勤頁會看到「換了新裝置」的提醒）
function rememberDevice(name, env){
  if(!window.DB || isKnownDevice(name, env.dev)) return Promise.resolve(false);
  const rec={id:env.dev, ua:env.ua, mobile:env.mobile, firstAt:nowIso()};
  return dbArrayAdd("users", name, "devices", rec, ()=>{
    const cur=knownDevices(name).concat([rec]);
    return window.DB.update("users", name, {devices:cur});
  }).then(()=>true).catch(()=>false);
}
// 變動工時：沒有固定上下班時間，所以不判遲到早退，只記上下班與工時。
// 人資屬於變動工時（他要配合面試、勞健保、外出辦事），管理員可以在設定裡改。
function isFlexUser(u){ return !!(u && (u.flexHours!=null ? u.flexHours : u.role==="hr")); }
// 全公司一套班表，個人可以有例外
function workHoursOf(name){
  const s=(STATE&&STATE.settings)||{};
  const u=((STATE&&STATE.users)||[]).find(x=>x.name===name)||{};
  return { start: u.workStart || s.workStart || DEF_WORK.start,
           end:   u.workEnd   || s.workEnd   || DEF_WORK.end,
           grace: (s.lateGraceMin!=null? +s.lateGraceMin : DEF_WORK.grace),
           custom: !!(u.workStart||u.workEnd),
           flex: isFlexUser(u) };
}
// 出勤從哪一天開始算：以「他自己設好密碼」那天為準（pwAt）。
// 正式啟用前的打卡留著當參考，但不判遲到早退。
// 管理員另外可以在設定填一個全公司起算日，兩者取比較晚的那一天。
function attendStartOf(name){
  const u=((STATE&&STATE.users)||[]).find(x=>x.name===name)||{};
  const s=(STATE&&STATE.settings)||{};
  const mine=String(u.pwAt||"").slice(0,10), all=String(s.attendStart||"").slice(0,10);
  if(mine&&all) return mine>all?mine:all;
  return mine||all||null;     // 都沒有＝還沒開始算
}
function attendCounted(sh){
  if(!sh||!sh.date) return false;
  const st=attendStartOf(sh.user);
  return !!st && String(sh.date)>=st;
}
function hhmmToMin(t){ const m=String(t||"").match(/^(\d{1,2}):(\d{2})/); return m? (+m[1]*60 + +m[2]) : null; }
function minToHm(m){ if(m==null) return "—"; const s=m<0?"-":""; m=Math.abs(m); return s+(Math.floor(m/60)?Math.floor(m/60)+"h":"")+(m%60)+"m"; }
// 兩點距離（公尺）
function distM(a,b){
  if(!a||!b||a.lat==null||b.lat==null) return null;
  const R=6371000, r=x=>x*Math.PI/180;
  const dLat=r(b.lat-a.lat), dLng=r(b.lng-a.lng);
  const h=Math.sin(dLat/2)**2 + Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLng/2)**2;
  return Math.round(2*R*Math.asin(Math.sqrt(h)));
}
// 取 GPS：拿不到就算了，絕不擋住打卡
function grabGeo(){
  return new Promise(res=>{
    if(!navigator.geolocation) return res(null);
    let done=false; const fin=(v)=>{ if(!done){ done=true; res(v); } };
    setTimeout(()=>fin(null), 6000);
    try{ navigator.geolocation.getCurrentPosition(
      p=>fin({lat:+p.coords.latitude.toFixed(6), lng:+p.coords.longitude.toFixed(6), acc:Math.round(p.coords.accuracy||0)}),
      ()=>fin(null), {enableHighAccuracy:false, timeout:5500, maximumAge:60000}); }catch(e){ fin(null); }
  });
}
// 打卡時記下的環境
function punchEnv(){ return {dev:deviceId(), ua:devUA(), mobile:isMobileUA()}; }
// 一筆班次的出勤判讀
function attendOf(sh){
  if(!sh||!sh.clockIn) return {in:null,out:null,work:null,late:0,early:0,none:true};
  const wh=workHoursOf(sh.user);
  const inMin=hhmmToMin(String(sh.clockIn).slice(11,16));
  const outMin=sh.clockOut? hhmmToMin(String(sh.clockOut).slice(11,16)) : null;
  const sMin=hhmmToMin(wh.start), eMin=hhmmToMin(wh.end);
  // 沒列入計算（正式啟用前）或變動工時 → 只留時間與工時，不判遲到早退
  const judge=attendCounted(sh) && !wh.flex;
  const late=(judge&&inMin!=null&&sMin!=null)? Math.max(0, inMin-sMin-wh.grace) : 0;
  const early=(judge&&outMin!=null&&eMin!=null)? Math.max(0, eMin-outMin) : 0;
  const work=(inMin!=null&&outMin!=null)? Math.max(0,outMin-inMin) : null;
  return {in:sh.clockIn, out:sh.clockOut||"", work, late, early, none:false,
          counted:attendCounted(sh), flex:wh.flex,
          auto:!!sh.autoOut, dev:sh.inDev||"", devUA:sh.inDevUA||"", mobile:!!sh.inMobile,
          newDev:!!sh.inNewDev, geo:sh.inGeo||null};
}
// 打卡地點離公司多遠（沒設公司座標就不算）
function officeDist(geo){
  const o=(STATE&&STATE.settings&&STATE.settings.officeGeo)||null;
  if(!o||o.lat==null||!geo) return null;
  return distM(geo,o);
}
// 昨天以前忘了打下班的，登入時自動補起來（標記為系統補登，報表上看得出來）
async function autoCloseOpenShifts(){
  if(VIEW_AS || !window.DB) return;
  const me=currentUser(); if(!me) return;
  const open=Object.values((STATE&&STATE.shifts)||{})
    .filter(s=>s&&s.user===me&&s.clockIn&&!s.clockOut&&String(s.date||"")<today);
  for(const s of open){
    const wh=workHoursOf(me);
    try{ await window.DB.update("shifts", s.id, {clockOut:String(s.date)+"T"+wh.end+":00", autoOut:true}); }catch(e){}
  }
}
// 出勤異常＝遲到或早退（系統補下班也算，因為當天沒打下班）
function attIssues(sh){
  const a=attendOf(sh); const out=[];
  if(a.none || !a.counted) return out;   // 正式啟用（他設好密碼）之前的紀錄只做參考，不算異常
  if(a.late>0) out.push("遲到 "+a.late+" 分");
  if(a.early>0) out.push("早退 "+a.early+" 分");
  if(a.auto) out.push("忘了打下班（系統補登）");
  return out;
}
function myIssueShifts(){
  const me=currentUser();
  return Object.values((STATE&&STATE.shifts)||{})
    .filter(s=>s&&s.user===me&&attIssues(s).length&&!String(s.issueNote||"").trim())
    .sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,7);
}
// 員工填異常原因 → 直接寫在那天的打卡紀錄上，人資在出勤頁看得到
function saveIssueNote(id){
  const v=(val("isn_"+id)||"").trim();
  if(v.length<2){ toast("請簡單說明原因",true); return; }
  dbUpdate("shifts", id, {issueNote:v, issueAt:nowIso()}, {action:"填寫出勤異常原因", target:id});
}
// 工作頁最上面的異常提醒卡（有未說明的異常才出現）
function workIssueCard(){
  const list=myIssueShifts(); if(!list.length) return "";
  return `<div class="card" style="border-color:var(--red)">
    <b style="font-size:16px;color:var(--red)">⚠ ${T("出勤異常待說明","Attendance to explain")}（${list.length}）</b>
    <div class="muted" style="font-size:12px;margin-top:4px">${T("填一下原因，人資才知道怎麼處理。","Write the reason so HR knows how to handle it.")}</div>
    ${list.map(s=>`<div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--line)">
      <div style="font-size:13.5px;font-weight:600">${esc(String(s.date).slice(5))}（${weekdayZh(s.date)}）・${esc(attIssues(s).join("、"))}</div>
      <div class="muted" style="font-size:12px;margin-top:2px">${T("上班","In")} ${esc(String(s.clockIn||"").slice(11,16)||"—")}　${T("下班","Out")} ${esc(String(s.clockOut||"").slice(11,16)||"—")}</div>
      <div class="row" style="gap:6px;margin-top:6px">
        <input id="isn_${esc(s.id)}" placeholder="${T("原因（例：交通事故、看醫生、主管同意提早離開）","Reason")}" style="flex:1;min-width:0"
          onkeydown="if(event.key==='Enter')saveIssueNote('${esc(jsEsc(s.id))}')">
        <button class="btn sm" style="flex:none" onclick="saveIssueNote('${esc(jsEsc(s.id))}')">${T("送出","Send")}</button>
      </div></div>`).join("")}
  </div>`;
}
// 出勤頁（人資與管理員）：今日狀況 ＋ 月報表
let ATT_YM=null;
function attYM(){ if(!ATT_YM){ const t=new Date(Date.now()+288e5); ATT_YM=[t.getFullYear(), t.getMonth()]; } return ATT_YM; }
function attMonthMove(n){ const [y,m0]=attYM(); let y2=y,m=m0+n; if(m<0){m=11;y2--;} if(m>11){m=0;y2++;} ATT_YM=[y2,m];
  attEnsureMonth(`${y2}-${String(m+1).padStart(2,"0")}`); render(); }
// 打卡紀錄常駐只訂閱最近兩個月（省讀取量）。往前翻到更早的月份時，跟資料庫補讀那一個月。
function attEnsureMonth(ym){
  try{
    const from=(window.DB&&window.DB.shiftsFrom)||"";
    if(!from || !window.DB.loadShiftMonth) return;
    if(ym > from.slice(0,7)) return;        // 整個月都在訂閱範圍內，不用補讀
    window.DB.loadShiftMonth(ym).catch(()=>{});
  }catch(e){}
}
function attStaff(){ return staffSorted((STATE.users||[]).filter(u=>["editor","intl","cs","hr"].includes(u.role||"editor"))); }
// 某人某月的每日出勤
function attRows(name, ym){
  return Object.values((STATE&&STATE.shifts)||{})
    .filter(s=>s&&s.user===name&&String(s.date||"").slice(0,7)===ym)
    .sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
function attSum(name, ym){
  const rows=attRows(name,ym).map(attendOf);
  const mins=rows.map(r=>r.work).filter(x=>typeof x==="number");
  return { days:rows.length, work:mins.reduce((a,b)=>a+b,0),
    late:rows.filter(r=>r.late>0).length, lateMin:rows.reduce((a,r)=>a+r.late,0),
    early:rows.filter(r=>r.early>0).length, auto:rows.filter(r=>r.auto).length,
    noOut:attRows(name,ym).filter(s=>!s.clockOut).length };
}
// 名字後面的班別小字。誰還沒起算在「今日出勤」標題統一講一次，不用每一列都掛。
function shiftTag(name){
  const w=workHoursOf(name);
  if(w.flex) return ' <span class="pill" style="font-size:10px">變動工時</span>';
  if(w.custom) return ' <span class="muted" style="font-size:11px">個人班表 '+esc(w.start)+'–'+esc(w.end)+'</span>';
  return "";
}
// 自己的出勤：人資看得到自己每天幾點上下班、這個月累積多少工時
function myAttendCard(){
  const me=currentUser();
  const u=((STATE&&STATE.users)||[]).find(x=>x.name===me);
  if(!u || !["editor","intl","cs","hr"].includes(u.role||"")) return "";   // 管理員不打卡
  const [y,m]=attYM(); const ym=`${y}-${String(m+1).padStart(2,"0")}`;
  const w=workHoursOf(me), st=attendStartOf(me);
  const a=attendOf((STATE.shifts||{})[shiftId(me,today)]||null);
  const s=attSum(me, ym);
  const cell=(v,l,muted)=>`<div><div class="n ${muted?'muted':''}">${v}</div><div class="l">${l}</div></div>`;
  return `<div class="card" style="border-color:var(--gold)">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:16px">我的出勤 <span class="muted" style="font-size:12px;font-weight:400">${esc(me)}</span></b>
      <span class="muted" style="font-size:12px">${w.flex?"變動工時（不判遲到早退，只記工時）":"正常班 "+esc(w.start)+"–"+esc(w.end)}</span></div>
    <div class="mstat" style="margin-top:10px">
      ${cell(a.in?esc(String(a.in).slice(11,16)):"—","今天上班",!a.in)}
      ${cell(a.out?esc(String(a.out).slice(11,16)):(a.in?"上班中":"—"),"今天下班",!a.out)}
      ${cell(minToHm(a.work),"今天工時",a.work==null)}
      ${cell(minToHm(s.work),`${m+1} 月累計工時`,!s.work)}
    </div>
    <div class="muted" style="font-size:12px;margin-top:8px">
      ${m+1} 月出勤 ${s.days} 天${w.flex?"":`・遲到 ${s.late} 次・早退 ${s.early} 次`}${s.noOut?`・${s.noOut} 天沒打下班`:""}
      ${st?`　<span style="opacity:.75">出勤自 ${esc(st)} 起算</span>`:'　<span style="opacity:.75">還沒開始起算（設定密碼後才開始）</span>'}</div>
    ${attRows(me,ym).length?`<details class="fold" style="margin-top:10px"><summary>我這個月的每日紀錄<span class="n">${attRows(me,ym).length}</span></summary>
      <div class="foldbody">${attDetailTable(me, ym)}</div></details>`:""}
  </div>`;
}
// 一個人某個月的每日出勤明細表（個人明細與「我的出勤」共用）
function attDetailTable(name, ym){
  const list=attRows(name, ym);
  return `<table class="responsive" style="margin-top:8px">
    <thead><tr><th>日期</th><th>上班</th><th>下班</th><th>工時</th><th>狀況</th></tr></thead>
    <tbody>${list.map(sh=>{ const a=attendOf(sh); const d=a.geo?officeDist(a.geo):null;
      const f=!a.counted ? "未列入計算"
        : [a.late>0?`遲到 ${a.late} 分`:'', a.early>0?`早退 ${a.early} 分`:'', a.auto?'系統補下班':'',
           (d!=null&&d>500)?`離公司 ${d} 公尺`:''].filter(Boolean).join("・");
      const normal=a.counted&&!f;
      return `<tr><td data-label="日期">${esc(String(sh.date).slice(5))}（${weekdayZh(sh.date)}）</td>
        <td data-label="上班">${esc(String(sh.clockIn||"").slice(11,16))||"—"}</td>
        <td data-label="下班">${esc(String(sh.clockOut||"").slice(11,16))||"—"}</td>
        <td data-label="工時">${minToHm(a.work)}</td>
        <td data-label="狀況" class="${normal?'':'muted'}">${normal?'正常':esc(f)}</td></tr>`; }).join("")}</tbody></table>`;
}
function viewAttend(){
  const [y,m]=attYM(); const ym=`${y}-${String(m+1).padStart(2,"0")}`;
  const staff=attStaff();
  const s=(STATE&&STATE.settings)||{};
  const wh={start:s.workStart||DEF_WORK.start, end:s.workEnd||DEF_WORK.end, grace:(s.lateGraceMin!=null?+s.lateGraceMin:DEF_WORK.grace)};
  // ── 今日 ──
  const todayRows=staff.map(u=>({u, sh:(STATE.shifts||{})[shiftId(u.name,today)]||null}));
  const arrived=todayRows.filter(r=>r.sh&&r.sh.clockIn);
  const lateToday=arrived.filter(r=>attendOf(r.sh).late>0);
  const notYet=todayRows.filter(r=>!r.sh||!r.sh.clockIn);
  const todayCard=`<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:16px">今日出勤 <span class="muted" style="font-size:12px;font-weight:400">${today}（${weekdayZh(today)}）・正常班 ${esc(wh.start)}–${esc(wh.end)}</span></b>
      <span class="row" style="gap:6px">
        <span class="pill ok">已到 ${arrived.length}</span>
        ${lateToday.length?`<span class="pill em">遲到 ${lateToday.length}</span>`:''}
        ${notYet.length?`<span class="pill wa">未打卡 ${notYet.length}</span>`:''}
        ${arrived.filter(r=>r.sh.inMobile).length?`<span class="pill em">用手機打卡 ${arrived.filter(r=>r.sh.inMobile).length}</span>`:''}
        ${arrived.filter(r=>r.sh.inNewDev).length?`<span class="pill wa">換新裝置 ${arrived.filter(r=>r.sh.inNewDev).length}</span>`:''}
      </span></div>
    ${(()=>{ const ns=staff.filter(u=>!attendStartOf(u.name));
      return ns.length?`<div class="muted" style="font-size:12px;margin-top:6px">尚未起算 ${ns.length} 人（${ns.map(u=>esc(u.name)).join("、")}）—— 他們設好自己的密碼之後才開始計算遲到早退。</div>`:""; })()}
    <table class="responsive" style="margin-top:10px">
      <thead><tr><th>同仁</th><th>上班</th><th>下班</th><th>工時</th><th>狀況</th><th>裝置</th></tr></thead>
      <tbody>${todayRows.map(({u,sh})=>{ const a=attendOf(sh); const d=a.geo?officeDist(a.geo):null;
        const note=String((sh&&sh.issueNote)||"").trim();
        const hasIssue=attIssues(sh).length>0;
        const flags=[a.late>0?`<span class="pill em" style="font-size:10px">遲到 ${a.late} 分</span>`:'',
                     a.early>0?`<span class="pill wa" style="font-size:10px">早退 ${a.early} 分</span>`:'',
                     a.auto?'<span class="pill" style="font-size:10px">系統補下班</span>':'',
                     a.newDev?'<span class="pill wa" style="font-size:10px">換了新裝置</span>':'',
                     a.mobile?'<span class="pill em" style="font-size:10px">用手機打的</span>':'',
                     (d!=null&&d>500)?`<span class="pill em" style="font-size:10px">離公司 ${d} 公尺</span>`:''].filter(Boolean).join(" ")
          + (hasIssue? (note?`<div style="font-size:12px;margin-top:3px"><span class="muted">說明：</span>${esc(note)}</div>`
                            :'<div style="font-size:12px;margin-top:3px;color:var(--red)">尚未說明原因</div>') : '');
        const state = a.none ? '<span class="muted">未打卡</span>'
          : !a.counted ? '<span class="muted">未列入計算</span>'
          : '<span class="pill ok" style="font-size:10px">正常</span>';
        return `<tr>
          <td data-label="同仁"><b>${esc(u.name)}</b>${shiftTag(u.name)}</td>
          <td data-label="上班">${a.in?esc(String(a.in).slice(11,16)):'<span class="muted">—</span>'}</td>
          <td data-label="下班">${a.out?esc(String(a.out).slice(11,16)):(a.in?'<span class="pill wa" style="font-size:10px">上班中</span>':'<span class="muted">—</span>')}</td>
          <td data-label="工時">${minToHm(a.work)}</td>
          <td data-label="狀況">${flags||state}</td>
          <td data-label="裝置">${a.in?`<span class="muted" style="font-size:11px">${esc(a.dev||"—")}${a.devUA?"・"+esc(a.devUA):""}</span>`:'<span class="muted">—</span>'}</td>
        </tr>`; }).join("")}</tbody></table>
  </div>`;
  // ── 同一台裝置幫多人打卡 ──
  const byDev={};
  todayRows.forEach(({u,sh})=>{ const d=sh&&sh.inDev; if(d){ (byDev[d]=byDev[d]||[]).push(u.name); } });
  const shared=Object.entries(byDev).filter(([,ns])=>ns.length>1);
  const devCard=shared.length?`<div class="card" style="border-color:var(--red)">
    <b style="font-size:15px;color:var(--red)">⚠ 同一台裝置幫多人打卡</b>
    ${shared.map(([d,ns])=>`<div style="font-size:13px;margin-top:6px">裝置 <b>${esc(d)}</b>：${ns.map(esc).join("、")}（${ns.length} 人）</div>`).join("")}
  </div>`:"";
  // ── 換了新裝置：人資去關心一下 ──
  const newDevs=todayRows.filter(r=>r.sh&&r.sh.inNewDev);
  const devChangeCard=newDevs.length?`<div class="card" style="border-color:var(--gold)">
    <b style="font-size:15px">🖥 今天有人換了新裝置</b>
    <div class="muted" style="font-size:12px;margin-top:4px">第一次用這台打卡。換電腦、清了瀏覽器資料、或換人操作都會出現，去確認一下就好。</div>
    ${newDevs.map(({u,sh})=>`<div style="font-size:13px;margin-top:6px">
      <b>${esc(u.name)}</b>　<span class="muted">${esc(sh.inDev||"")}・${esc(sh.inDevUA||"")}${sh.inMobile?"・手機":""}</span>
      <span class="muted">（已登記 ${knownDevices(u.name).length} 台）</span></div>`).join("")}
  </div>`:"";
  // ── 異常說明：誰填了、誰還沒填 ──
  const issueRows=Object.values((STATE&&STATE.shifts)||{})
    .filter(s=>s&&String(s.date||"").slice(0,7)===ym&&attIssues(s).length)
    .sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const noNote=issueRows.filter(s=>!String(s.issueNote||"").trim());
  const issueCard=issueRows.length?`<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:16px">出勤異常與說明 <span class="muted" style="font-size:12px;font-weight:400">${y}/${m+1}</span></b>
      <span class="pill ${noNote.length?'em':'ok'}">${noNote.length?`${noNote.length} 筆還沒說明`:"都說明了"}</span></div>
    <table class="responsive" style="margin-top:10px">
      <thead><tr><th>日期</th><th>同仁</th><th>異常</th><th>本人說明</th></tr></thead>
      <tbody>${issueRows.slice(0,60).map(s=>`<tr>
        <td data-label="日期">${esc(String(s.date).slice(5))}（${weekdayZh(s.date)}）</td>
        <td data-label="同仁"><b>${esc(s.user)}</b></td>
        <td data-label="異常">${esc(attIssues(s).join("、"))}</td>
        <td data-label="本人說明">${String(s.issueNote||"").trim()?esc(s.issueNote):'<span class="pill em" style="font-size:10px">尚未說明</span>'}</td>
      </tr>`).join("")}</tbody></table>
  </div>`:"";
  // ── 月報表 ──
  const rows=staff.map(u=>({u, s:attSum(u.name, ym)}));
  const monthCard=`<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:16px">月報表</b>
      <span class="row" style="gap:6px;align-items:center">
        <button class="calnav" style="width:30px;height:30px;font-size:16px" onclick="attMonthMove(-1)">‹</button>
        <b style="font-size:14px">${y} 年 ${m+1} 月</b>
        <button class="calnav" style="width:30px;height:30px;font-size:16px" onclick="attMonthMove(1)">›</button>
      </span></div>
    <table class="responsive" style="margin-top:10px">
      <thead><tr><th>同仁</th><th>出勤天數</th><th>總工時</th><th>遲到</th><th>早退</th><th>沒打下班</th></tr></thead>
      <tbody>${rows.map(({u,s})=>{ const flex=workHoursOf(u.name).flex; return `<tr>
        <td data-label="同仁"><b>${esc(u.name)}</b>${shiftTag(u.name)}</td>
        <td data-label="出勤天數">${s.days}</td>
        <td data-label="總工時">${minToHm(s.work)}</td>
        <td data-label="遲到" class="${!flex&&s.late?'':'muted'}">${flex?'—':(s.late?`${s.late} 次・${s.lateMin} 分`:'0')}</td>
        <td data-label="早退" class="${!flex&&s.early?'':'muted'}">${flex?'—':(s.early||0)}</td>
        <td data-label="沒打下班" class="${s.noOut||s.auto?'':'muted'}">${s.noOut?`${s.noOut} 天未結`:(s.auto?`${s.auto} 天系統補`:'0')}</td>
      </tr>`; }).join("")||'<tr><td colspan="6" class="muted">這個月還沒有打卡紀錄</td></tr>'}</tbody></table>
    <div class="muted" style="font-size:12px;margin-top:8px">遲到＝超過上班時間 ${wh.grace} 分鐘寬限；「系統補」＝當天忘了打下班、隔天由系統以下班時間補登。<br>
      每個人從「自己設定密碼」那天起才開始計算遲到早退，之前的打卡只留著參考。變動工時的人只算工時，遲到早退顯示「—」。</div>
  </div>`;
  // ── 個人明細 ──
  const detail=staff.map(u=>{
    if(!attRows(u.name, ym).length) return "";
    return `<div class="card"><b style="font-size:15px">${esc(u.name)} <span class="muted" style="font-size:12px;font-weight:400">${y}/${m+1} 明細</span></b>${shiftTag(u.name)}
      ${attDetailTable(u.name, ym)}
    </div>`; }).join("");
  return `<h2>出勤</h2>${myAttendCard()}${todayCard}${devChangeCard}${devCard}${issueCard}${monthCard}
    <h3 style="margin:20px 0 10px">個人明細</h3>${detail||'<div class="card muted">這個月還沒有打卡紀錄</div>'}`;
}
// ===================================================================
// 流程中控（Regina 首頁；管理員也看得到）— 手機優先、單欄
// 她的三件事：①盯「排程有沒有排到兩個月後」→ 不夠就去準備腳本拍毛片
//            ②指派毛片給剪輯 ③逐一交辦工作、看每個人的回報
// ===================================================================
const RUNWAY_TARGET=60;   // 目標：排程隨時排滿到 60 天（兩個月）後
function fmtMD(ds){ const p=String(ds||"").split("-"); return p.length===3?`${+p[1]}/${+p[2]}`:ds; }
// 逐一交辦：每位員工卡片上的快速指派（比照 assignTaskSel，只是對象固定）
async function flowAssign(idx, name){
  if(VIEW_AS){ toast("員工視角為唯讀預覽",true); return; }
  const t=val("fa_"+idx).trim(); if(!t){ toast("請輸入要交辦的內容",true); return; }
  const id=uid("T");
  try{ await window.DB.set("tasks", id, {id, user:name, date:today, title:t, contact:"", report:"", done:false, assignedBy:currentUser(), ack:false, createdAt:nowIso()});
    const inp=document.getElementById("fa_"+idx); if(inp) inp.value="";
    toast("已交辦給 "+name+"（等他按「收到」）"); }
  catch(e){ toast("交辦失敗，請稍後再試",true); }
}
// 流程中控①：備片存量警報（連續排滿天數 vs 兩個月目標、缺口、各平台排到哪天）
function flowRunwayCard(g, okRunway, pct){
  // ---- ① 兩個月備片警報 ----
  const gapChips=(g.defs||[]).slice(0,6).map(d=>`<span class="pill em" style="font-size:11px">${fmtMD(d.ds)} 缺${d.short}</span>`).join(" ");
  // 各平台排到哪天（二創殼的最遠預排日）
  const platMax=(pred)=>{ const ds=(STATE.videos||[]).filter(v=>!v.deleted&&pred(v)).map(v=>String(v.scheduledDate||"").slice(0,10)).filter(Boolean).sort().pop(); return ds?fmtMD(ds):"未排"; };
  const platChips=[["蝦皮",v=>v.channel==="shopee"],["馬來",v=>v.channel==="ms"],["英文",v=>v.locale==="en"],["泰文",v=>v.locale==="th"]]
    .map(([l,p])=>`<span class="tag" style="font-size:11px">${l}排到 ${platMax(p)}</span>`).join(" ");
  const runwayCard=`<div class="card" style="border-color:${okRunway?'var(--green)':'var(--red)'}">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:16px">📅 備片存量（目標：排滿到兩個月後）</b>
      <span class="pill ${okRunway?'ok':'em'}">${okRunway?'✓ 安心':'⚠ 要拍片了'}</span></div>
    <div style="font-size:15px;margin-top:10px">社群排程連續排滿 <b style="font-size:22px;color:${okRunway?'var(--green)':'var(--red)'}">${g.runway}</b> 天${okRunway?'':`，距離兩個月還缺 <b style="color:var(--red)">${RUNWAY_TARGET-g.runway}</b> 天`}</div>
    <div class="flowbar" style="margin-top:8px"><i style="width:${pct}%;${okRunway?'':'background:linear-gradient(90deg,#B0473A,#D98A5F)'}"></i></div>
    ${okRunway?'':`<div style="margin-top:10px;padding:10px;background:var(--redbg);border-radius:6px;font-size:13px;line-height:1.7">
      <b style="color:var(--red)">下一步：</b>準備腳本 → 拍毛片 → 「＋新增毛片」進資料庫 → 指派給剪輯開工。</div>`}
    ${gapChips?`<div style="margin-top:10px;font-size:12px" class="muted">近 14 天缺口：</div><div class="row" style="gap:6px;flex-wrap:wrap;margin-top:4px">${gapChips}</div>`:''}
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:12px">${platChips}</div>
    <div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="btn sm" onclick="batchNewFootage()">＋ 批次新增毛片</button>
      <button class="btn sec sm" onclick="CUR_TAB='cal';buildNav();render()">看月排程</button></div>
  </div>`;
  return runwayCard;
}
// 流程中控②：毛片庫存＋指派（勾選未指派毛片、選人一鍵指派）
function flowStockCard(staff, pool, unassigned, stockDays){
  // ---- ② 毛片庫存＋指派 ----
  const afpRows=unassigned.slice(0,20).map(v=>`<label style="display:flex;gap:8px;align-items:center;padding:7px 2px;border-bottom:1px solid var(--line);font-weight:400">
      <input type="checkbox" class="afp_vid" value="${v.id}" style="width:auto;margin:0;flex:none"> <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(vidTitle(v))}</span></label>`).join("");
  const stockCard=`<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:16px">🎬 毛片庫存＆指派</b>
      <span class="pill ${stockDays>=7?'ok':'em'}">${pool.length} 支・約可剪 ${stockDays} 天</span></div>
    ${pool.length?'':'<p class="muted" style="font-size:13px;margin:8px 0 0">毛片池空了 — 剪輯沒有東西可以剪，請先拍毛片！</p>'}
    ${unassigned.length?`
    <div class="row" style="gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
      <select id="afp_who" style="width:auto;min-width:130px"><option value="">指派給誰…</option>${staff.map(u=>`<option>${esc(u.name)}</option>`).join("")}</select>
      <button class="btn sec sm" type="button" onclick="afpToggleAll(this)">全選</button>
      <button class="btn sm" onclick="assignFootage()">指派勾選的毛片</button></div>
    <div style="margin-top:6px${unassigned.length>6?';max-height:260px;overflow-y:auto':''}">${afpRows}</div>
    <p class="muted" style="font-size:12px;margin:6px 0 0">未指派 ${unassigned.length} 支</p>`
    :`<p class="muted" style="font-size:13px;margin:8px 0 0">目前沒有未指派的毛片${pool.length?'（都已指派，等認領）':''}</p>`}
  </div>`;
  return stockCard;
}
// 流程中控③：待你審片（剪輯完成、還沒審的片，含各平台二創殼）
function flowReviewQueueCard(){
  // ---- ③ 待你審片：剪輯完成、還沒審的（審過剪輯才會上傳雲端）----
  const pendingReview=(STATE.videos||[]).filter(v=>!v.deleted && needsReview(v))
    .sort((a,b)=>String(a.finishedAt||"").localeCompare(String(b.finishedAt||"")));
  const openRev=(v)=>(v.channel&&CHANNELS[v.channel])?`openChModal('${v.channel}','${v.id}')`:v.locale?`openIntlModal('${v.id}')`:`editVideo('${v.id}')`;
  const reviewQueueCard=fold("🎞 待你審片", pendingReview.length, `<div>
    ${pendingReview.length?pendingReview.slice(0,20).map(v=>`<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:8px;align-items:center">
        <div style="min-width:0"><a href="javascript:void(0)" onclick="${openRev(v)}" style="font-weight:600">${esc(vidTitle(v))}</a>
          <div class="muted" style="font-size:12px">${esc(v.editor||v.claimedBy||"")}・完成 ${esc(String(v.finishedAt||"").slice(0,10))}</div></div>
        <button class="btn sm" style="flex:none" onclick="${openRev(v)}">審片</button></div>`).join("")
      :'<p class="muted" style="font-size:13px;margin:8px 0 0">目前沒有等審的片 ✓</p>'}
  </div>`);
  return reviewQueueCard;
}
// 流程中控④：單一剪輯卡（上線狀態、進行中/完成、拖延警示、今日交辦與回報、一鍵交辦）
function flowStaffCard(u, idx, allTasks, readOnly){

  // ---- ④ 每位剪輯：狀態＋交辦＋回報 ----

    const name=u.name;
    const sh=(STATE.shifts||{})[shiftId(name,today)];
    const on=sh&&sh.clockIn, off=sh&&sh.clockOut;
    const isCS=(u.role==="cs"||u.role==="hr");   // 不剪片的角色：不顯示影片數字
    const dot=off?`<span class="pill" style="font-size:10px">已下班 ${String(sh.clockOut).slice(11,16)}</span>`
      : on?`<span class="pill ok" style="font-size:10px">上班中</span>`
      : `<span class="pill wa" style="font-size:10px">今天還沒上線</span>`;
    const wip=(STATE.videos||[]).filter(v=>(v.claimedBy===name||v.editor===name)&&v.stage==="剪輯中");
    const done=(STATE.videos||[]).filter(v=>v.editor===name&&isPublished(v)&&String(v.finishedAt||"").slice(0,10)===today);
    const late=wip.filter(v=>{ const b=claimDayBadge(v); return b!=="新"&&+b>=4; });
    const wipRows=wip.slice(0,4).map(v=>{ const b=claimDayBadge(v); const slow=b!=="新"&&+b>=4;
      return `<div style="font-size:13px;padding:3px 0;display:flex;gap:6px;align-items:flex-start;min-width:0">
        <span class="pill ${slow?'em':'wa'}" style="font-size:10px;flex:none">${b==="新"?"新":("第"+b+"天")}</span>
        <span class="linetitle">${esc(vidTitle(v))}</span></div>`; }).join("");
    const tasks=realTasks(allTasks).filter(t=>t.user===name&&t.date===today).sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||"")));
    const taskRows=tasks.map(t=>{
      const st=t.done?'<span class="pill ok" style="font-size:10px">完成</span>'
        :(t.assignedBy&&!t.ack)?'<span class="pill em" style="font-size:10px">未讀</span>'
        :'<span class="pill wa" style="font-size:10px">進行中</span>';
      return `<div style="padding:7px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;gap:6px;align-items:center;justify-content:space-between">
          <span style="font-size:13px;font-weight:600;min-width:0">${esc(t.title)}</span><span style="flex:none">${st}</span></div>
        ${(t.report||'').trim()?`<div class="muted" style="font-size:12px;margin-top:3px">回報：${esc(t.report)}</div>`:(t.done?'':`<div class="muted" style="font-size:12px;margin-top:3px">（還沒回報）</div>`)}
      </div>`; }).join("");
    return `<div class="card">
      <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <b style="font-size:15px">${esc(name)}${(u.role==="intl")?' <span class="muted" style="font-size:11px;font-weight:400">海外</span>':(isCS?` <span class="muted" style="font-size:11px;font-weight:400">${esc(ROLE_LABEL[u.role]||"")}</span>`:'')}</b>${dot}</div>
      <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">
        ${isCS?'':`<span class="pill ${wip.length?'wa':''}" style="font-size:11px">進行中 ${wip.length}</span>
        <span class="pill ${done.length?'ok':''}" style="font-size:11px">今日完成 ${done.length}</span>
        ${late.length?`<span class="pill em" style="font-size:11px">⚠ ${late.length} 支拖太久</span>`:''}`}
        <span class="pill" style="font-size:11px">交辦 ${tasks.filter(t=>t.done).length}/${tasks.length}</span></div>
      ${(wipRows&&!isCS)?`<div style="margin-top:8px">${wipRows}</div>`:''}
      ${taskRows?`<div style="margin-top:8px">${taskRows}</div>`:`<p class="muted" style="font-size:12px;margin:8px 0 0">今天還沒有交辦事項</p>`}
      ${readOnly?'':`<div class="row" style="gap:6px;margin-top:10px">
        <input id="fa_${idx}" placeholder="交辦 ${esc(name)} 一件事…" style="flex:1;min-width:0" onkeydown="if(event.key==='Enter')flowAssign(${idx},'${esc(jsEsc(name))}')">
        <button class="btn sm" style="flex:none" onclick="flowAssign(${idx},'${esc(jsEsc(name))}')">交辦</button></div>`}
    </div>`; }
function viewFlow(){
  const staff=staffSorted((STATE.users||[]).filter(u=>["editor","intl","cs","hr"].includes(u.role||"editor")));
  const allTasks=Object.values((STATE&&STATE.tasks)||{});
  const g=scheduleGlance();
  const pool=(STATE.videos||[]).filter(v=>!v.locale && !v.channel && v.stage==="待處理");
  const unassigned=pool.filter(v=>!v.assignedTo).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const doneToday=(STATE.videos||[]).filter(v=>isPublished(v)&&String(v.finishedAt||"").slice(0,10)===today);
  const wipAll=(STATE.videos||[]).filter(v=>v.stage==="剪輯中");
  const daily=Math.max(1,+daySum(today)||4);
  const stockDays=Math.floor(pool.length/daily);
  const okRunway=g.runway>=RUNWAY_TARGET;
  const pct=Math.min(100, Math.round(g.runway/RUNWAY_TARGET*100));

  const runwayCard=flowRunwayCard(g, okRunway, pct);

  const stockCard=flowStockCard(staff.filter(u=>!["cs","hr"].includes(u.role)), pool, unassigned, stockDays);   // 毛片只指派給剪輯

  const reviewQueueCard=flowReviewQueueCard();

  let fi=0;
  const staffCards=staffByGroup(staff).map(g=>
    `<h4 style="margin:16px 0 8px;font-size:14px;color:var(--muted);letter-spacing:.06em">${esc(g.zh)}（${g.people.length}）</h4>`
    + g.people.map(u=>flowStaffCard(u, fi++, allTasks)).join("")).join("");

  // ---- 頂部焦點列 ----
  const focus=`<div class="focusbar">
    <div><span class="fn ${okRunway?'':'warn'}">${g.runway}<i>/${RUNWAY_TARGET}</i></span><span class="fl">排程存量(天)</span></div>
    <div><span class="fn ${stockDays>=7?'':'warn'}">${pool.length}</span><span class="fl">毛片庫存</span></div>
    <div><span class="fn">${wipAll.length}</span><span class="fl">製作中</span></div>
    <div><span class="fn">${doneToday.length}</span><span class="fl">今日完成</span></div>
  </div>`;

  return `<h2>流程中控 <span class="muted" style="font-size:13px">${today}</span></h2>
  ${focus}${msgInboxCard()}${runwayCard}${stockCard}
  <h3 style="margin:18px 0 10px">團隊交辦＆回報</h3>
  ${staffCards||'<p class="muted">還沒有成員</p>'}
  ${reviewQueueCard}`;
}

// ===== 儀表板：小工具（各卡片共用）=====
const dashHM=iso=>String(iso||"").slice(11,16);                       // ISO → HH:MM
const dashDur=(a,b)=>{ const m=durationMin(a,b); if(m==null) return "—"; const h=Math.floor(m/60), mm=m%60; return (h?h+"h":"")+mm+"m"; };
const dashMin=(m)=> (typeof m==="number")?((Math.floor(m/60)?Math.floor(m/60)+"h":"")+(m%60)+"m"):"—";
const dashStatusPill=(s)=> !s||!s.clockIn ? `<span class="pill em">${T("未上班","Off")}</span>`
    : (s.clockOut?`<span class="pill ok">${T("已下班","Clocked out")}</span>`:`<span class="pill wa">${T("上班中","On shift")}</span>`);
const dashVLine=(v,extra)=>`<div style="margin:5px 0">• <a href="javascript:void(0)" onclick="editVideo('${v.id}')">${esc(vidTitle(v))}</a>${extra||""}</div>`;

// 每位剪輯在「所選日期」的當日明細（各線合併計入，跟該剪輯自己的上班計畫一致）
function dashEditorRows(editors, shifts, allTasks, D, isToday){
  return editors.map(name=>{
    const s=shifts.find(x=>x.user===name && x.date===D);
    const done=(STATE.videos||[]).filter(v=>v.editor===name && isPublished(v) && String(v.finishedAt||"").slice(0,10)===D)
      .sort((a,b)=>String(a.finishedAt||"").localeCompare(String(b.finishedAt||"")));
    const wip=isToday?(STATE.videos||[]).filter(v=>(v.claimedBy===name||v.editor===name) && v.stage==="剪輯中"):[];
    const tasks=realTasks(allTasks).filter(t=>t.user===name && t.date===D);
    // 我交辦給他的：只看「所選日期當天」的交辦 → 昨天的留在昨天的工作日誌，不會跑到今天
    const assignedOpen=realTasks(allTasks).filter(t=>t.user===name && t.assignedBy && t.date===D && !t.done)
      .sort((a,b)=>String(b.createdAt||b.date||"").localeCompare(String(a.createdAt||a.date||"")));
    const assignedDone=realTasks(allTasks).filter(t=>t.user===name && t.assignedBy && t.date===D && t.done)
      .sort((a,b)=>String(b.doneAt||"").localeCompare(String(a.doneAt||"")));
    const sales=done.filter(v=>(v.productUrl||"").trim()||(Array.isArray(v.products)&&v.products.some(p=>p&&p.name))).length;
    const mins=done.map(v=>v.durationMin).filter(x=>typeof x==="number");
    const sumMin=mins.reduce((a,b)=>a+b,0);
    return {name,s,done,wip,tasks,assignedOpen,assignedDone,sales,sumMin};
  });
}
// 儀表板：單一剪輯的當日卡（出勤、完成、進行中、交辦回報、我交辦給他的追蹤）
function dashEditorCard(e, isToday){
  const hm=dashHM, dur=dashDur, minLabel=dashMin, statusPill=dashStatusPill, vline=dashVLine;
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
      ${e.assignedOpen.length?`<div style="margin-top:4px"><span class="pill wa" style="font-size:10px">待辦 ${e.assignedOpen.length}</span></div>${openHTML}`:''}
      ${e.assignedDone.length?`<div style="margin-top:10px"><span class="pill ok" style="font-size:10px">當日完成 ${e.assignedDone.length}</span></div>${doneHTMLa}`:''}
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
}
// 儀表板：累計 KPI（剪片量/速度/工時/寵粉/交辦）＋綜合之星
function dashKpi(editors, fin, allTasks){
  const kpi=editors.map(name=>{ const my=fin.filter(v=>v.editor===name);
    const days=my.map(editDays).filter(x=>x!=null); const avgDays=days.length?(days.reduce((a,b)=>a+b,0)/days.length):null;
    const mins=my.map(v=>v.durationMin).filter(x=>typeof x==="number"); const avgMin=mins.length?Math.round(mins.reduce((a,b)=>a+b,0)/mins.length):null;
    const sales=my.filter(v=>(v.productUrl||"").trim()||(Array.isArray(v.products)&&v.products.some(p=>p&&p.name))).length;
    const aDone=realTasks(allTasks).filter(t=>t.user===name && t.assignedBy && t.done);
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

  return {kpi, okEditors, bestEdit, bestACount, bestATime, starName};
}
// 儀表板：排程健康／毛片庫存＋未來 35 天視覺帶
function dashSchedule(){
  // 防呆：指派毛片只針對台灣毛片，海外(locale)/蝦皮(channel)二創殼不列入計數與可指派清單
  const g=scheduleGlance();
  const poolAll=(STATE.videos||[]).filter(v=>!v.locale && !v.channel && v.stage==="待處理");
  const poolN=poolAll.length;
  const unassignedPool=poolAll.filter(v=>!v.assignedTo).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const assignCount={}; poolAll.forEach(v=>{ if(v.assignedTo) assignCount[v.assignedTo]=(assignCount[v.assignedTo]||0)+1; });
  const noSchedN=(STATE.videos||[]).filter(v=>!v.locale && !v.channel && vidSegment(v)==="newNoSched").length;
  const wipN=(STATE.videos||[]).filter(v=>!v.locale && !v.channel && v.stage==="剪輯中").length;
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

  return {g, poolN, unassignedPool, assignCount, noSchedN, wipN, stripHTML, runwayEnd, gapN};
}
// 儀表板：員工視角卡（管理員專用，以員工身分唯讀預覽）
function dashViewAsCard(){
  return `<div class="card" style="border-color:var(--accent)">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div><b style="font-size:16px">👁 員工視角</b></div>
      <div class="row" style="gap:8px">
        <select id="va_who" style="min-width:140px"><option value="">— 選擇員工 —</option>${staffOptGroups(["editor","intl","cs","manager","hr"])}</select>
        <button class="btn sm" onclick="enterViewAs(document.getElementById('va_who').value)">進入</button>
      </div>
    </div>
  </div>`;
}
// 儀表板①：指派交辦給員工
function dashAssignTaskCard(){
  return `<div class="card" style="border-color:var(--gold)">
    <div class="row" style="align-items:baseline;gap:8px">
      <b style="font-size:16px">① 指派交辦給員工</b>
    </div>
    <div class="grid cols2" style="margin-top:12px">
      <div><label>選擇員工</label>
        <select id="asg_who"><option value="">— 選擇員工 —</option>${staffOptGroups(["editor","intl","cs"])}</select></div>
      <div><label>交辦內容</label>
        <input id="asg_txt" placeholder="要交辦的工作內容…" onkeydown="if(event.key==='Enter')assignTaskSel()"></div>
    </div>
    <div style="margin-top:10px"><label>對接窗口（選填）</label>
      <input id="asg_contact" list="asg_contact_dl" placeholder="選用過的窗口或輸入新的（沒有可留空）" onkeydown="if(event.key==='Enter')assignTaskSel()">${contactDatalist('asg_contact_dl')}</div>
    <button class="btn" style="width:100%;margin-top:10px" onclick="assignTaskSel()">送出交辦</button>
  </div>`;
}
// 儀表板：指派毛片給員工（勾選＋收回未認領）
function dashAssignFootageCard(editors, poolN, unassignedPool, assignCount){
  return `<div class="card" style="border-color:var(--gold)">
    <b style="font-size:16px">🎬 指派毛片給員工</b>
    <div class="muted" style="font-size:12px;margin-top:4px">目前待剪毛片 <b>${poolN}</b> 支（未指派 <b>${unassignedPool.length}</b> 支）</div>
    <div class="grid cols2" style="margin-top:10px">
      <div><label>選擇員工</label>
        <select id="afp_who"><option value="">— 選擇員工 —</option>${editors.map(n=>`<option value="${esc(n)}">${esc(n)}${assignCount[n]?`（已指派 ${assignCount[n]}）`:""}</option>`).join("")}</select></div>
      <div><label>選擇毛片（勾選，可多選）</label>
        ${unassignedPool.length?`<div style="margin-bottom:6px"><button type="button" class="btn sec sm" onclick="afpToggleAll(this)">全選</button></div>`:''}
        <div style="max-height:240px;overflow-y:auto;border:1.5px solid var(--line);border-radius:var(--rs);padding:6px 10px;background:#fff">
        ${unassignedPool.map(v=>`<label style="display:flex;align-items:center;gap:8px;padding:5px 2px;cursor:pointer;border-bottom:1px solid var(--panel2)">
          <input type="checkbox" class="afp_vid" value="${esc(v.id)}" style="width:auto;margin:0;flex:none"> <span>${esc(vidTitle(v))}</span></label>`).join("")||'<span class="muted" style="font-size:13px">目前沒有未指派的待剪毛片</span>'}
        </div></div>
    </div>
    <button class="btn" style="width:100%;margin-top:10px" onclick="assignFootage()">指派給該員工</button>
    ${Object.keys(assignCount).length?`<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px">
      ${editors.filter(n=>assignCount[n]).map(n=>`<div class="row" style="justify-content:space-between;gap:8px;margin:4px 0">
        <span>${esc(n)}：待剪已指派 <b>${assignCount[n]}</b> 支</span>
        <button class="btn sec sm" onclick="unassignEditor('${esc(jsEsc(n))}')">收回未認領</button></div>`).join("")}
    </div>`:''}
  </div>`;
}
// 儀表板②：所選日期的團隊進度摘要（日期切換器＋四個數字）
function dashProgressCard(D, isToday, dayLabel, present, editors, teamDone, teamTasks, teamTasksDone, teamAssignedOpen){
  return `<div class="card">
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
  </div>`;
}
// 儀表板③：未來影片排程（連續排滿天數＋35 天視覺帶）
function dashRunwayCard(g, runwayEnd, stripHTML, gapN, poolN, wipN, noSchedN){
  return `<div class="card">
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
  </div>`;
}
// 儀表板④：員工長期績效（累計）＋綜合之星
function dashKpiCard(kpi, starName, okEditors, bestEdit, bestACount, bestATime){
  const minLabel=dashMin;
  return `<div class="card">
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

// ===================================================================
// 團隊看板（全員都看得到）：大家互相知道彼此今天在做什麼
// 三塊 —— ①今日成效（每人一張卡：出勤、完成、進行中、老闆交辦了什麼＋處理狀況）
//         ②本月成效（一張表）
// 純檢視：沒有按鍵、沒有連結、不寫任何資料。人資只有這一頁。
// ===================================================================
function teamStaff(){
  return staffSorted((STATE.users||[]).filter(u=>["editor","intl","cs","hr"].includes(u.role||"editor")));
}
// 某人「今天」的成效：出勤、今日完成、進行中、交辦完成
function teamDayStat(name, allTasks){
  const s=(STATE.shifts||{})[shiftId(name,today)];
  const done=(STATE.videos||[]).filter(v=>v.editor===name&&isPublished(v)&&String(v.finishedAt||"").slice(0,10)===today);
  const wip=(STATE.videos||[]).filter(v=>(v.claimedBy===name||v.editor===name)&&v.stage==="剪輯中");
  const tasks=realTasks(allTasks).filter(t=>t.user===name&&t.date===today)
    .sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||"")));
  const workMin=(s&&s.clockIn)?durationMin(s.clockIn, s.clockOut||nowIso()):null;
  return {s, done, wip, tasks, notices:noticesOf(name), workMin};
}
// 某人「某個月」的成效：完成量、剪片速度、平均工時、帶商品、出勤天數、交辦完成
function teamMonthStat(name, allTasks, ym){
  const fin=(STATE.videos||[]).filter(v=>v.editor===name&&isPublished(v)&&String(v.finishedAt||"").slice(0,7)===ym);
  const days=fin.map(editDays).filter(x=>x!=null);
  const mins=fin.map(v=>v.durationMin).filter(x=>typeof x==="number");
  const tasks=realTasks(allTasks).filter(t=>t.user===name&&String(t.date||"").slice(0,7)===ym);
  return {
    count: fin.length,
    avgDays: days.length?(days.reduce((a,b)=>a+b,0)/days.length):null,
    avgMin: mins.length?Math.round(mins.reduce((a,b)=>a+b,0)/mins.length):null,
    sales: fin.filter(v=>(v.productUrl||"").trim()||(Array.isArray(v.products)&&v.products.some(p=>p&&p.name))).length,
    att: Object.values(STATE.shifts||{}).filter(s=>s&&s.user===name&&String(s.date||"").slice(0,7)===ym&&s.clockIn).length,
    tDone: tasks.filter(t=>t.done).length,
    tAll: tasks.length,
  };
}
// 一件交辦的顯示：誰交辦的 → 收到沒 → 做完沒 → 處理結果
function teamTaskRow(t){
  const st=t.done?`<span class="pill ok" style="font-size:10px">${T("完成","Done")}</span>`
    :(t.assignedBy&&!t.ack)?`<span class="pill em" style="font-size:10px">${T("還沒接收","Not seen")}</span>`
    :`<span class="pill wa" style="font-size:10px">${T("處理中","In progress")}</span>`;
  const from=t.assignedBy?`<span class="muted" style="font-size:11px">${T("主管交辦","Assigned")}</span>`
    :`<span class="muted" style="font-size:11px">${T("自己安排","self")}</span>`;
  return `<div style="padding:7px 0;border-bottom:1px solid var(--line)">
    <div style="display:flex;gap:6px;align-items:center;justify-content:space-between">
      <span style="font-size:13px;font-weight:600;min-width:0">${esc(t.title)}</span><span style="flex:none">${st}</span></div>
    <div style="margin-top:2px">${from}${t.contact?` <span class="muted" style="font-size:11px">・${T("窗口","contact")} ${esc(t.contact)}</span>`:''}</div>
    ${(t.report||"").trim()?`<div class="muted" style="font-size:12px;margin-top:2px">${T("處理狀況","Update")}：${esc(t.report)}</div>`
      :(t.done?'':`<div class="muted" style="font-size:12px;margin-top:2px">（${T("還沒回報","no update yet")}）</div>`)}
  </div>`;
}
// 今日成效卡（一人一張）：純文字，沒有任何可以按的東西
function teamDayCard(u, allTasks){
  const name=u.name, minLabel=dashMin, hm=dashHM, isCS=noEdit(u);
  const {s, done, wip, tasks, notices, workMin}=teamDayStat(name, allTasks);
  const att=(s&&s.clockIn)?`${hm(s.clockIn)}–${s.clockOut?hm(s.clockOut):"…"}・${T("工時","Hours")} ${minLabel(workMin)}`:T("今天還沒上線","Not clocked in yet");
  const list=(arr,label,cls)=>arr.length?arr.map(v=>`<div style="font-size:13px;padding:3px 0;display:flex;gap:6px;align-items:flex-start;min-width:0">
      <span class="pill ${cls}" style="font-size:10px;flex:none">${label}</span>
      <span class="linetitle">${esc(vidTitle(v))}</span></div>`).join(""):"";
  const nDone=tasks.filter(t=>t.done).length;
  return `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:15px">${esc(name)} <span class="muted" style="font-size:11px;font-weight:400">${T(ROLE_LABEL[u.role||"editor"]||"", u.role==="cs"?"Staff":(u.role==="hr"?"HR":(u.role==="intl"?"Intl":"Editor")))}</span></b>
      ${dashStatusPill(s)}</div>
    <div class="muted" style="font-size:12px;margin-top:2px">${T("上班","Shift")} ${att}</div>
    <div class="mstat">
      ${isCS?'':`<div><div class="n ${done.length?'':'muted'}">${done.length}</div><div class="l">${T("今日完成","Done today")}</div></div>
      <div><div class="n ${wip.length?'':'muted'}">${wip.length}</div><div class="l">${T("進行中","In progress")}</div></div>`}
      <div><div class="n ${tasks.length&&nDone<tasks.length?'warn':''} ${tasks.length?'':'muted'}">${nDone}/${tasks.length}</div><div class="l">${T("交辦完成","Tasks done")}</div></div>
    </div>
    ${isCS?'':list(done,T("完成","Done"),"ok")+list(wip.slice(0,4),T("進行中","In progress"),"wa")}
    ${tasks.map(teamTaskRow).join("")||`<p class="muted" style="font-size:12px;margin:8px 0 0">${T("今天沒有交辦事項","No tasks today")}</p>`}
    ${notices.length?`<div style="margin-top:8px;border-top:1px dashed var(--gold);padding-top:6px">
      ${notices.map(n=>`<div style="font-size:12px;padding:3px 0;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <span class="pill ${n.ack?'ok':'em'}" style="font-size:10px;flex:none">${n.ack?T("已收到","Received"):T("未讀","Unread")}</span>
        <span style="min-width:0">📣 ${esc(n.title)}</span>
        ${(n.report||"").trim()?`<span class="muted" style="width:100%;padding-left:2px">${T("回覆","Reply")}：${esc(n.report)}</span>`:''}</div>`).join("")}
    </div>`:''}
  </div>`;
}
// 人資專用：發 HR 通知（可指定一人或全體）＋看自己發出去的誰收到了
function teamNoticeCompose(staff){
  const groups=staffByGroup(staff);
  const mine=allNotices().filter(t=>t.assignedBy===currentUser())
    .sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,12);
  const sent={};
  mine.forEach(t=>{ const k=(t.title||"")+"__"+String(t.createdAt||"").slice(0,16); (sent[k]=sent[k]||[]).push(t); });
  const rows=Object.values(sent).map(g=>{
    const t=g[0], got=g.filter(x=>x.ack), replies=g.filter(x=>(x.report||"").trim());
    return `<div style="padding:8px 0;border-bottom:1px solid var(--line)">
      <div style="font-size:13.5px;font-weight:600;overflow-wrap:anywhere">${esc(t.title)}</div>
      <div class="row" style="align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px">
        <span class="pill ${got.length===g.length?'ok':'wa'}" style="font-size:10px;flex:none">已收到 ${got.length}/${g.length}</span>
        <button class="btn sec sm" style="flex:none;padding:3px 9px" onclick="hrNotifyDel('${t.id}')" title="收回這則通知">✕</button>
      </div>
      <div class="muted" style="font-size:11px;margin-top:2px">${esc(String(t.date||"").slice(5))} ${String(t.createdAt||"").slice(11,16)}・${g.map(x=>esc(x.user)+(x.ack?"✓":"")).join("、")}</div>
      ${replies.map(x=>`<div style="font-size:12px;margin-top:3px"><b>${esc(x.user)}</b> <span class="muted">回覆：</span>${esc(x.report)}</div>`).join("")}
    </div>`; }).join("");
  return `<div class="card" style="border-color:var(--gold)">
    <b style="font-size:16px">📣 發出 HR 通知</b>
    <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
      <select id="hrn_who" style="width:auto;min-width:150px">
        <option value="__all__">全體同仁</option>
        ${groups.map(g=>`<option value="__${esc(g.role)}__">全體${esc(g.zh)}（${g.people.length}）</option>`).join("")}
        ${groups.map(g=>`<optgroup label="${esc(g.zh)}">${g.people.map(u=>`<option value="${esc(u.name)}">${esc(u.name)}</option>`).join("")}</optgroup>`).join("")}</select>
      <input id="hrn_txt" placeholder="要通知大家的事…" style="flex:1;min-width:180px" onkeydown="if(event.key==='Enter')hrNotify()">
      <button class="btn sm" style="flex:none" onclick="hrNotify()">送出通知</button>
    </div>
    ${rows?`<div style="margin-top:12px"><b style="font-size:13px">我發出的通知</b>${rows}</div>`:''}
  </div>`;
}
const noEdit=(u)=>["cs","hr"].includes(u&&u.role);   // 不剪片的角色
// ── 團隊看板的篩選（v85）：22 個人一次看太長，先縮到自己要看的那一群 ──
// 只是換個看法，不會改到任何資料；看板上依然沒有任何會動到資料的按鍵。
let TEAM_GROUP="all", TEAM_Q="";
function teamSetGroup(v){ TEAM_GROUP=String(v||"all"); render(); }
function teamSetQ(v){ TEAM_Q=String(v||"").trim(); render(); }
function teamFilter(list){
  return (list||[]).filter(u=>{
    if(TEAM_GROUP!=="all" && (u.role||"editor")!==TEAM_GROUP) return false;
    if(TEAM_Q && !String(u.name||"").toLowerCase().includes(TEAM_Q.toLowerCase())) return false;
    return true; });
}
function teamFilterBar(all, shown){
  const opt=(k,zh,en)=>`<option value="${k}" ${TEAM_GROUP===k?"selected":""}>${T(zh,en)}（${k==="all"?all.length:all.filter(u=>(u.role||"editor")===k).length}）</option>`;
  return `<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center;margin:10px 0 4px">
    <select style="width:auto" onchange="teamSetGroup(this.value)">
      ${opt("all","全部","Everyone")}${opt("editor","剪輯","Editors")}${opt("cs","員工","Staff")}${opt("intl","海外剪輯","Intl")}${opt("hr","人資","HR")}</select>
    <input value="${esc(TEAM_Q)}" placeholder="${T("找人…","Find someone…")}" style="flex:1;min-width:110px"
      onchange="teamSetQ(this.value)" onkeydown="if(event.key==='Enter')teamSetQ(this.value)">
    ${(TEAM_GROUP!=="all"||TEAM_Q)?`<span class="muted" style="font-size:12px">${T("顯示 "+shown.length+" / "+all.length+" 人","Showing "+shown.length+" of "+all.length)}</span>`:""}
  </div>`;
}
function viewTeam(){
  const everyone=teamStaff();
  const staff=teamFilter(everyone);
  const allTasks=Object.values((STATE&&STATE.tasks)||{});
  const ym=today.slice(0,7), minLabel=dashMin;
  if(!everyone.length) return `<h2>${T("團隊看板","Team Board")}</h2><div class="card muted">${T("還沒有成員","No members yet")}</div>`;
  if(!staff.length) return `<h2>${T("團隊看板","Team Board")}</h2>${teamFilterBar(everyone, staff)}
    <div class="card muted">${T("沒有符合的人","Nobody matches")}</div>`;
  const months=staff.map(u=>({u, m:teamMonthStat(u.name, allTasks, ym)}));
  const dayStats=staff.map(u=>teamDayStat(u.name, allTasks));
  const dayDone=dayStats.reduce((a,d)=>a+d.done.length,0);
  const dayOn=dayStats.filter(d=>d.s&&d.s.clockIn).length;
  const dayTaskAll=dayStats.reduce((a,d)=>a+d.tasks.length,0);
  const dayTaskDone=dayStats.reduce((a,d)=>a+d.tasks.filter(t=>t.done).length,0);
  const monDone=months.reduce((a,x)=>a+x.m.count,0);
  const rows=months.map(({u,m})=>`<tr>
    <td data-label="${T("成員","Member")}"><b>${esc(u.name)}</b> <span class="muted" style="font-size:11px">${T(ROLE_LABEL[u.role||"editor"]||"", u.role==="cs"?"Staff":(u.role==="hr"?"HR":(u.role==="intl"?"Intl":"Editor")))}</span></td>
    <td data-label="${T("完成上架","Published")}">${noEdit(u)?"—":m.count}</td>
    <td data-label="${T("剪片速度","Days/clip")}">${noEdit(u)?"—":(m.avgDays!=null?m.avgDays.toFixed(1)+T(" 天"," d"):"—")}</td>
    <td data-label="${T("平均工時","Avg time")}">${noEdit(u)?"—":minLabel(m.avgMin)}</td>
    <td data-label="${T("帶商品","With product")}">${noEdit(u)?"—":m.sales}</td>
    <td data-label="${T("出勤天數","Days on")}">${m.att}</td>
    <td data-label="${T("交辦完成","Tasks done")}">${m.tAll?`${m.tDone}/${m.tAll}`:"—"}</td></tr>`).join("");
  return `<h2>${T("團隊看板","Team Board")}</h2>
  ${currentRole()==="hr"?msgInboxCard():''}
  ${["hr","boss"].includes(currentRole())?teamNoticeCompose(staff):''}
  ${currentRole()==="hr"?myMsgFold():''}
  ${teamFilterBar(everyone, staff)}
  <div class="focusbar">
    <div><span class="fn">${dayOn}<i>/${staff.length}</i></span><span class="fl">${T("今日出勤","On today")}</span></div>
    <div><span class="fn">${dayDone}</span><span class="fl">${T("今日完成","Done today")}</span></div>
    <div><span class="fn ${dayTaskAll&&dayTaskDone<dayTaskAll?'warn':''}">${dayTaskDone}<i>/${dayTaskAll}</i></span><span class="fl">${T("交辦完成","Tasks done")}</span></div>
    <div><span class="fn">${monDone}</span><span class="fl">${T("本月完成","Done this month")}</span></div>
  </div>
  <h3 style="margin:18px 0 10px">${T("今日成效","Today")} <span class="muted" style="font-size:13px;font-weight:400">${today}${T("（"+weekdayZh(today)+"）","")}</span></h3>
  ${staffByGroup(staff).map(g=>`<h4 style="margin:14px 0 8px;font-size:14px;color:var(--muted);letter-spacing:.06em">${T(g.zh,g.en)}（${g.people.length}）</h4>
    <div class="teamgrid">${g.people.map(u=>teamDayCard(u, allTasks)).join("")}</div>`).join("")}
  <h3 style="margin:24px 0 10px">${T("本月成效","This month")} <span class="muted" style="font-size:13px;font-weight:400">${T(+ym.slice(0,4)+" 年 "+(+ym.slice(5,7))+" 月", ym)}</span></h3>
  <div class="card">
    <table class="responsive"><thead><tr><th>${T("成員","Member")}</th><th>${T("完成上架","Published")}</th><th>${T("剪片速度","Days/clip")}</th><th>${T("平均工時","Avg time")}</th><th>${T("帶商品","With product")}</th><th>${T("出勤天數","Days on")}</th><th>${T("交辦完成","Tasks done")}</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>`;
}
// 管理員儀表板：今日進度＋排程健康/庫存＋每日匯報＋累計KPI
function viewDashboard(){
  const editors=staffNamesSorted(["editor"]);
  const shifts=Object.values((STATE&&STATE.shifts)||{});
  const allTasks=Object.values((STATE&&STATE.tasks)||{});
  const D=SHIFT_DATE, isToday=(D===today);
  const hm=dashHM, dur=dashDur, minLabel=dashMin;
  const fin=(STATE.videos||[]).filter(v=>isPublished(v)&&v.finishedAt&&v.editor);
  const perEditor=dashEditorRows(editors, shifts, allTasks, D, isToday);
  const present=perEditor.filter(e=>e.s&&e.s.clockIn).length;
  const teamDone=perEditor.reduce((a,e)=>a+e.done.length,0);
  const teamSales=perEditor.reduce((a,e)=>a+e.sales,0);
  const teamTasksDone=perEditor.reduce((a,e)=>a+e.tasks.filter(t=>t.done).length,0);
  const teamTasks=perEditor.reduce((a,e)=>a+e.tasks.length,0);
  const teamAssignedOpen=perEditor.reduce((a,e)=>a+e.assignedOpen.length,0);

  const cards=perEditor.map(e=>dashEditorCard(e,isToday)).join("")||'<div class="card muted">尚無剪輯成員</div>';

  const {kpi, okEditors, bestEdit, bestACount, bestATime, starName}=dashKpi(editors, fin, allTasks);

  const {g, poolN, unassignedPool, assignCount, noSchedN, wipN, stripHTML, runwayEnd, gapN}=dashSchedule();

  const D2=daysBetween(D,today); const dayLabel = D===today?'今天':(D===yesterday?'昨天':(D2+' 天前'));

  return `<h2>儀表板</h2>

  ${currentRole()==="boss"?dashViewAsCard():''}

  <div class="dgrid">
  ${["boss","manager"].includes(currentRole())?dashAssignTaskCard():''}

  ${["boss","manager"].includes(currentRole())?dashAssignFootageCard(editors, poolN, unassignedPool, assignCount):''}

  ${dashProgressCard(D, isToday, dayLabel, present, editors, teamDone, teamTasks, teamTasksDone, teamAssignedOpen)}
  </div>
  <div class="dgrid-ed">${cards}</div>

  ${dashRunwayCard(g, runwayEnd, stripHTML, gapN, poolN, wipN, noSchedN)}

  ${dashKpiCard(kpi, starName, okEditors, bestEdit, bestACount, bestATime)}`;
}
// ① 批次建檔新毛片：一行一支片名，一次建立多支「待剪新片」
function batchNewFootage(){ if(dbBlocked()) return;
  let blocks="";
  for(let i=0;i<5;i++){
    blocks+=`<fieldset style="border:1px solid var(--line);border-radius:6px;padding:10px 12px;margin:0 0 10px">
      <legend style="font-size:13px;color:var(--muted);padding:0 6px">${T("第 "+(i+1)+" 支","Clip "+(i+1))}</legend>
      <label>${T("原始片名（編號自動產生：民國年＋月日＋當日序號）","Raw title (code auto-generated)")}</label>
      <input id="bn${i}" placeholder="${T("毛片片名（留空＝不建立這支）","Raw title (leave empty to skip)")}">
      <label>${T("毛片雲端連結","Raw footage cloud link")}</label>
      <input id="bl${i}" placeholder="${T("毛片原始檔雲端連結（選填）","Cloud link (optional)")}">
      ${productRows("b"+i, [])}
    </fieldset>`;
  }
  showModal(T("新增毛片（一次最多 5 支，可帶商品）","Add raw footage (up to 5, with products)"), `
    <style>.modal .box{max-width:760px}</style>
    <label>${T("原本語言（這批影片是什麼語言拍的，五支共用）","Original language (shared by all 5 clips)")}</label>
    <select id="b_lang" style="margin-bottom:10px">${ORIG_LANGS.map(([k,l],i)=>`<option value="${k}" ${VID_LANG===k?'selected':''}>${T(l,["Chinese","Thai","English","Malaysia"][i])}</option>`).join("")}</select>
    ${blocks}
  `, async ()=>{
    const bLang=val("b_lang")||"";
    const items=[];
    for(let i=0;i<5;i++){ const name=zhTW((val("bn"+i)||"").trim()); if(!name) continue;
      items.push({name, rawLink:(val("bl"+i)||"").trim(), products:collectProducts("b"+i)}); }
    if(!items.length){ toast(T("請至少輸入一支片名","Enter at least one title"),true); return false; }
    // ID 與編號都由 newVideoRecord 產生（ID 跨裝置不撞號；編號含本批已產生的一起算，避免同批重覆）
    let ok=0; BULK_BUSY=true; const made=[];
    try{
      for(let i=0;i<items.length;i++){
        const rec=newVideoRecord({code:nextVideoCode(made), name:items[i].name, rawName:items[i].name,
          rawLink:items[i].rawLink, products:items[i].products, origLang:bLang,
          tags:(items[i].products||[]).some(p=>p&&p.name)?["寵粉"]:[]});   // 有銷售商品 → 自動帶「寵粉」
        made.push(rec);
        try{ await window.DB.set("videos", rec.id, rec); ok++; }catch(e){} }
      if(ok) logA("批次新增毛片 "+ok+" 支", "");
    } finally { BULK_BUSY=false; applyState(LAST_RAW); }
    await delay(300); toast(T("已新增 "+ok+" 支毛片",ok+" clips added")); return true;
  });
}
function claimVid(id){ write("POST",`/api/videos/${id}/claim`,{},T("已認領，加入我的工作","Claimed — added to your work")); }
// 退回：把已認領的毛片放回共用「待剪毛片」清單，重新給大家選
function unclaimVid(id){ if(!confirm(T("退回這支毛片到待剪清單？大家就能重新認領。","Return this to the shared pool so others can claim it?"))) return; write("POST",`/api/videos/${id}/unclaim`,{},T("已退回待剪毛片清單","Returned to the pool")); }
// 我的剪輯工作：作業中 →（按一下）編輯內容
function setWorkStep(id, step){ dbUpdate("videos", id, {workStep:step, updatedAt:nowIso()}); }
// 完成：剪輯按了才標「剪輯完成」並移到影片庫（編輯時的「儲存修改」只存內容、不完成）
function finishWork(id){ const v=vid(id)||{};
  if(!confirm(T("「"+vidTitle(v)+"」剪好了？\n完成後進入「待審核」，等 Regina 審過再上傳雲端＋補連結。","Done cutting \""+vidTitle(v)+"\"?\nIt moves to In review — upload & add links after Regina approves."))) return;
  write("POST","/api/videos/"+id+"/finish",{scheduledDate:v.scheduledDate||null},T("剪輯完成，已移到影片庫","Done — moved to the library")).then(ok=>{ if(ok && myTabs().some(t=>t[0]==="videos")){ CUR_TAB="videos"; buildNav(); render(); } });
}
// 移回剪輯中（重剪）：管理員／經理人把已完成的影片退回該剪輯的今日工作
function reworkVideo(id){ const v=vid(id)||{};
  let who=v.editor||v.claimedBy||"";
  if(!who){   // 沒有指定剪輯（孤兒影片）→ 讓管理員選一位；海外二創版列海外剪輯、其餘列台灣剪輯
    const wantRole=v.locale?"intl":"editor";
    const eds=(STATE.users||[]).filter(u=>(u.role||"editor")===wantRole).map(u=>u.name);
    if(!eds.length){ toast("尚無剪輯成員可指派",true); return; }
    const ans=prompt("這支沒有指定剪輯，要移到哪位的今日工作？輸入編號：\n"+eds.map((n,i)=>(i+1)+". "+n).join("\n"));
    if(ans===null) return; const idx=parseInt(ans)-1;
    if(!(idx>=0 && idx<eds.length)){ toast("輸入無效",true); return; } who=eds[idx];
  }
  if(!confirm("把「"+vidTitle(v)+"」移到「"+who+"」的今日工作（剪輯中）？")) return;
  write("PUT","/api/videos/"+id,{video:{stage:"剪輯中",editor:who,claimedBy:who,published:false,finishedAt:"",backupDone:false,socialScheduled:false,workStep:1}},"已移到「"+who+"」的今日工作（剪輯中）").then(ok=>{ if(ok) closeModal(); });
}
// 編輯影片視窗：商品頁網址輸入一次，下方各平台用「按鈕」呈現，按一下＝複製該平台 utm 連結
function editLinksHTML(url){ url=(url||"").trim(); if(!url) return "";
  return `<div class="card" style="background:var(--panel2)"><b>${T("導購連結","Shopping links")}</b>
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
  showModal(T("新增影片","Add video"), `
    <label>${T("原本語言（這支影片是什麼語言拍的）","Original language (what language was it shot in)")}</label>
    <select id="sv_lang">${ORIG_LANGS.map(([k,l],i)=>`<option value="${k}" ${VID_LANG===k?'selected':''}>${T(l,["Chinese","Thai","English","Malaysia"][i])}</option>`).join("")}</select>
    <label>${T("原始片名","Raw title")}</label><input id="sv_name" placeholder="${T("毛片名稱","Raw footage name")}">
    <label>${T("毛片雲端連結","Raw footage cloud link")}</label><input id="sv_link" placeholder="${T("毛片原始檔雲端連結（選填）","Cloud link (optional)")}">
    <label>${T("影片文案（影片中 IP 的口播台詞）","Script (spoken lines in the video)")}</label><input id="sv_vcopy" autocomplete="off">
    ${productRows("sv", [])}
  `, async ()=>{
    const name=zhTW(val("sv_name").trim());
    if(!name){ toast(T("請輸入原始片名","Enter the raw title"),true); return false; }
    const svProducts=collectProducts("sv");
    const video={name, rawName:name, rawLink:val("sv_link").trim(), videoCopy:zhTW(val("sv_vcopy").trim()), products:svProducts,
      origLang:val("sv_lang")||"",
      tags:svProducts.some(p=>p&&p.name)?["寵粉"]:[]};   // 有銷售商品 → 自動帶「寵粉」標籤
    return await write("POST","/api/videos",{video},T("已新增影片","Video added"));
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
  return `<label>${T("標籤（可複選）","Tags (multi-select)")}</label>
    <div id="${id}_box" style="display:flex;flex-wrap:wrap;gap:6px">${all.map(t=>tagChip(id,t,sel.has(t))).join("")}</div>
    <div class="row" style="gap:6px;margin-top:6px"><input id="${id}_new" placeholder="${T("新增標籤…","New tag…")}" style="flex:1"><button type="button" class="btn sm sec" onclick="addTagOpt('${id}')">＋ ${T("加入","Add")}</button></div>`; }
function collectTags(id){ return Array.from(document.querySelectorAll('.'+id+'_tag:checked')).map(x=>x.value); }
// 有填銷售商品 → 自動勾「寵粉」標籤
function autoPamperTag(prefix){
  let has=false; for(let i=0;i<4;i++){ const e=document.getElementById(prefix+"_pn"+i); if(e&&e.value.trim()){ has=true; break; } }
  if(!has) return;
  const cb=document.querySelector('.'+prefix+'_tag[value="寵粉"]'); if(cb && !cb.checked) cb.checked=true;
}
function addTagOpt(id){ const inp=document.getElementById(id+'_new'); if(!inp) return; const v=(inp.value||'').trim(); if(!v){ return; }
  const box=document.getElementById(id+'_box');
  if(box && !Array.from(box.querySelectorAll('input')).some(x=>x.value===v)){ box.insertAdjacentHTML('beforeend', tagChip(id,v,true)); }
  inp.value=''; }
async function persistNewTags(tags){ const cur=videoTags(); const add=(tags||[]).filter(t=>t && !cur.includes(t));
  if(!add.length || !window.DB) return;
  try{
    if(window.DB.arrayAdd){ for(const t of add) await window.DB.arrayAdd("meta","settings","videoTags",t); }
    else if(window.DB.setSettings){ await window.DB.setSettings({videoTags:cur.concat(add)}); }
  }catch(e){} }
// 標籤編輯器（管理員・設定頁）
async function addVideoTagSel(){ const t=(val("tag_new")||"").trim(); if(!t){ toast("請輸入標籤名稱",true); return; }
  const cur=videoTags(); if(cur.includes(t)){ toast("已有這個標籤",true); return; }
  try{ await dbArrayAdd("meta","settings","videoTags",t,()=>window.DB.setSettings({videoTags:cur.concat([t])})); logA("新增標籤",t);
    const e=document.getElementById("tag_new"); if(e) e.value=""; toast("已新增標籤「"+t+"」"); }catch(e){ toast("新增失敗",true); } }
async function delVideoTag(t){ if(!confirm("刪除標籤「"+t+"」？（已套用在影片上的不受影響）")) return;
  try{ await dbArrayDel("meta","settings","videoTags",t,()=>window.DB.setSettings({videoTags:videoTags().filter(x=>x!==t)})); logA("刪除標籤",t); toast("已刪除標籤「"+t+"」"); }catch(e){ toast("刪除失敗",true); } }

// ===================================================================
// 影片庫
// ===================================================================
// 是否剪好（可標新/舊片）：已完成上架，或手選過新/舊片
function isPublished(v){ return !!(v && (v.published===true || ["已完成","已上片"].includes(v.stage))); }
// 審片流程上線日：這天之前完成的舊片不回溯要求審核（可在 settings.reviewSince 調整）
function reviewSince(){ return String((STATE&&STATE.settings&&STATE.settings.reviewSince)||"2026-07-27").slice(0,10); }
// 是否「待審核」＝三個條件同時成立：①剪輯完成 ②還沒審過 ③還沒有上傳網址（有網址＝早就上片，不用審）
// 再加時間界線：流程上線前完成的舊片一律不算，否則幾百支歷史影片會一次全湧進待審清單
function needsReview(v){
  if(!v || v.stage!=="已完成" || v.reviewStatus) return false;
  if(String(v.publishedLink||"").trim()) return false;
  return String(v.finishedAt||"").slice(0,10) >= reviewSince();
}
// 顯示用階段（流程：待處理→剪輯中→待審核→剪輯完成→已上片）；審過（通過）才顯示剪輯完成
function dispStage(v){ return needsReview(v) ? "待審核" : ((v&&v.stage)||""); }
// 狀態顯示文字：「已完成」對使用者顯示為「剪輯完成」（只代表剪輯工作完成，不代表排程/上片完成；內部值不變）
function stageLabel(s){ if(currentRole()==="intl"){ return ({"待處理":"To do","剪輯中":"In progress","待審核":"In review","已完成":"Done","已上片":"Published"})[s]||s||""; }
  return s==="已完成" ? "剪輯完成" : (s||""); }
// 是否歸為「舊片」：手選舊片、或已過預排上片日（已上傳）
function vidIsOld(v){
  const t=Array.isArray(v.tags)?v.tags:[];
  if(t.includes("舊片")&&!t.includes("新片")) return true;
  if(t.includes("新片")&&!t.includes("舊片")) return false;
  return isPublished(v) && airedPast(v);   // 必須「已完成」＋過了排程日才算舊片（剪太慢過期但沒剪完的不算）
}
// 影片庫五分段（過去→未來）：①未剪未排 ②未剪有排 ③已剪未排 ④已剪有排未過期 ⑤舊片(已剪過期)
function vidSegment(v){
  if(vidIsOld(v)) return "old";                                  // ⑤ 已剪・過排程
  if(!isPublished(v)) return v.scheduledDate ? "rawSched" : "rawNoSched";  // ①未剪未排 ②未剪有排
  return v.scheduledDate ? "newSched" : "newNoSched";            // ③已剪未排 ④已剪有排未過
}
function vidOrderRank(v){ return {rawNoSched:1, rawSched:2, newNoSched:3, newSched:4, old:5}[vidSegment(v)] || 9; }
// 同類排序鍵：有排程用預排上片日；沒排程的排在後面、用編號(上傳先後)
function vidSortVal(v){ return v.scheduledDate ? String(v.scheduledDate).slice(0,10) : ("9999-"+String(v.id)); }
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
// 審片卡（管理員＋Regina 都可審）：一創與蝦皮/馬來/英/泰二創視窗共用
function reviewCardHTML(v){
  if(!v||!v.id||!["boss","manager"].includes(currentRole())) return "";
  return `<div class="card" style="background:var(--panel2)"><b>審片（Regina／管理員）</b>
      <div class="row" style="gap:8px;margin-top:6px;align-items:center;flex-wrap:wrap">
        <button class="btn sm" type="button" onclick="reviewVid('${v.id}','通過')">通過</button>
        <button class="btn sm danger" type="button" onclick="reviewVid('${v.id}','退回')">× 退回</button>
        <span class="muted">目前：${v.reviewStatus?(esc(v.reviewStatus)+(v.reviewNote?'（'+esc(v.reviewNote)+'）':'')):'未審'}</span>
      </div></div>`;
}
// 已審過通知「知道了」：連結都補齊後，剪輯自己收起（reviewAck）；在那之前會一直亮在審片進度卡
function ackReviewedVid(id){ write("PUT",`/api/videos/${id}`,{video:{reviewAck:true}},T("已收起","Got it")).then(ok=>{ if(ok) render(); }); }
// 剪輯自己按「已審過」：Regina 口頭審過後，剪輯在等審清單按這顆 → 進下一步（上傳雲端＋補連結）
function editorMarkReviewed(id){ const v=vid(id)||{};
  if(!confirm(T(`Regina 已經審過「${vidTitle(v)}」了嗎？\n按下後進入下一步：上傳雲端＋補連結。`,
    `Has Regina approved "${vidTitle(v)}"?\nNext step: upload to the cloud & add the links.`))) return;
  write("PUT",`/api/videos/${id}`,{video:{reviewStatus:"通過",reviewedBy:currentUser(),reviewedAt:nowIso()}},
    T("已標記審過 → 快上傳雲端＋補連結","Marked as approved — now upload & add the links")).then(ok=>{ if(ok) render(); });
}
// 老闆娘選擇性審核（不擋上架）：通過／退回(附原因)；退回會在剪輯的今日工作出現
function reviewVid(id, status){
  let note="";
  if(status==="退回"){ note=prompt("退回原因（給剪輯修正）："); if(note===null) return; if(!note.trim()){ toast("請填退回原因",true); return; } }
  const v=vid(id)||{};
  dbUpdate("videos", id, {reviewStatus:status, reviewNote:note.trim(), reviewedBy:currentUser(), reviewedAt:nowIso(), updatedAt:nowIso()},
    {action:"審片"+status, target:vidTitle(v)+(note.trim()?("・"+note.trim()):"")})
    .then(ok=>{ if(ok){ toast(status==="通過"?"已通過 ":"已退回，剪輯會收到 "); closeModal(); } });
}
let VID_VIEW="rawNoSched";   // 影片庫分頁：rawNoSched/rawSched/newNoSched/newSched/old（五類）
let VID_TAGS=new Set();   // 標籤篩選（可複選）
let VID_Q="";   // 搜尋字存全域：資料同步重繪時還原，打到一半不會被清掉
// 一創語言（原本影片的語言）：影片庫用選單切換、每支原本標小圖示分辨
const ORIG_LANGS=[["","中文"],["th","泰文"],["en","英文"],["my","馬來西亞"]];
const ORIG_BADGE={"":"中",th:"TH",en:"EN",my:"MY"};
let VID_LANG="";   // 影片庫目前檢視的一創語言（""＝中文）
function origLangOf(v){ const l=String((v&&v.origLang)||""); return ORIG_BADGE[l]!=null?l:""; }
function origBadge(v){ const l=origLangOf(v);
  return `<span class="pill" style="font-size:10px;background:transparent;border:1px solid var(--gold);color:var(--gold-dk)" title="${T("原本語言","Original language")}: ${esc(origLangLabel(l))}">${l===""?T("中","ZH"):ORIG_BADGE[l]}</span>`; }
// 一創語言的顯示名（依介面語言）："" 中文/Chinese、th 泰文/Thai…
function origLangLabel(l){ const i=ORIG_LANGS.findIndex(x=>x[0]===l);
  return T((ORIG_LANGS[i]||[])[1]||"中文", ["Chinese","Thai","English","Malaysia"][i<0?0:i]); }
// 海外視角：中文標題下加一行小字英文（資料庫已翻好的 nameEn）；中文同仁不顯示
function enSubLine(v){ if(currentRole()!=="intl"||!v||v.locale) return "";
  const en=stripHash(v.nameEn||""); if(!en) return "";
  return `<div class="vt-en">${esc(en)}</div>`; }
// 待剪池的「退回資料庫」：只有從資料庫拉出來的二創版本殼可退（台灣毛片不適用）；purge 殼、絕不動源片
function poolDiscardBtn(v){ if(!v||v.stage!=="待處理") return "";
  const tip=T("退回資料庫（不會刪除任何影片，源片可重選）","Return to the library — nothing is deleted; the source can be picked again");
  if(v.channel&&CHANNELS[v.channel]) return `<button class="btn sec sm" onclick="chDiscard('${v.channel}','${v.id}')" title="${tip}">✕ ${T("退回","Remove")}</button>`;
  if(v.locale) return `<button class="btn sec sm" onclick="intlDiscard('${v.id}')" title="${tip}">✕ ${T("退回","Remove")}</button>`;
  return ""; }
// 一列 = 一支影片
function vidTableRow(v){
  const stageCol={"待處理":"var(--muted)","剪輯中":"var(--accent)","待審核":"var(--amber)","已完成":"var(--green)","已上片":"var(--green)"}[dispStage(v)]||"var(--muted)";
  const tags=videoTagsOf(v);
  const tagHTML=tags.length?tags.map(t=>`<span class="tag" style="font-size:11px">${esc(t)}</span>`).join(" "):'<span class="muted" style="font-size:12px">—</span>';
  const prod=(v.productUrl||"").trim();
  const prodCount=(Array.isArray(v.products)?v.products.filter(p=>p&&p.name):[]).length;
  const prodHTML=prod?`<a href="${esc(prod)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">商品頁${prodCount?`（${prodCount}）`:""}</a>`
    :(prodCount?`<span class="muted" style="font-size:12px">${prodCount} 項</span>`:'<span class="muted" style="font-size:12px">—</span>');
  const rev=v.reviewStatus==="通過"?'<span class="pill ok" style="font-size:10px">已審</span>'
    :(v.reviewStatus==="退回"?'<span class="pill em" style="font-size:10px">× 退回</span>':'');
  const sch=v.scheduledDate?String(v.scheduledDate).slice(0,10):"";
  // 標示：在地化版本標自身語言（EN）；源片的管理指標「翻了幾種語言 🌐N、重播 ↻M」
  // 只給管理員／經理人看 — 剪輯不需要這些資訊，隱藏讓畫面更乾淨
  const isAdminView=["boss","manager"].includes(currentRole());
  const langBadge = v.locale
    ? `<span class="pill" style="font-size:10px;background:var(--accent);color:#fff">${localeShort(v.locale)}</span>`
    : (v.channel&&CHANNELS[v.channel])
      ? `<span class="pill" style="font-size:10px;background:var(--accent);color:#fff">${CHANNELS[v.channel].label}</span>`
      : (!isAdminView ? "" : (function(){ const nLang=localizedVersionsOfSrc(v.id).length, nUse=+v.totalUsed||0; let o="";
          if(nLang) o+=`<span class="pill" style="font-size:10px;background:transparent;border:1px solid var(--accent);color:var(--accent)" title="已翻譯 ${nLang} 種語言">🌐 ${nLang}</span>`;
          Object.keys(CHANNELS).forEach(ch=>{ const n=chVersionsOfSrc(ch,v.id).length;
            if(n) o+=` <span class="pill" style="font-size:10px;background:transparent;border:1px solid var(--accent);color:var(--accent)" title="已建立 ${n} 個${CHANNELS[ch].verName}">${CHANNELS[ch].srcBadge} ${n}</span>`; });
          if(nUse) o+=` <span class="pill" style="font-size:10px;background:transparent;border:1px solid var(--line);color:var(--muted)" title="重播 ${nUse} 次">↻ ${nUse}</span>`;
          return o; })());
  // 手機版精簡：沒有內容的欄位標 na（手機隱藏、桌機照舊顯示 —）
  return `<tr onclick="editVideo('${v.id}')" style="cursor:pointer">
    <td data-label="影片" class="cv-name"><span style="display:flex;align-items:center;gap:8px;min-width:0">
      <span class="vthumb">▶</span>
      <span class="vt-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(vidTitle(v))}</span>${(!v.locale&&!v.channel)?origBadge(v):''}${langBadge}</span>${enSubLine(v)}</td>
    <td data-label="標籤"${tags.length?'':' class="na"'}>${tagHTML}</td>
    <td data-label="${VID_VIEW==="old"?"上片日期":"預排上片"}"${sch?'':' class="na"'} style="white-space:nowrap">${sch||'<span class="muted">—</span>'}</td>
    <td data-label="商品"${(prod||prodCount)?'':' class="na"'}>${prodHTML}</td>
    <td data-label="剪輯師"${(v.editor||v.claimedBy)?'':' class="na"'}>${esc(v.editor||v.claimedBy||"")||'<span class="muted">—</span>'}</td>
    <td data-label="狀態"><span class="ststack">
      <span class="pill" style="font-size:11px;background:transparent;border:1px solid ${stageCol};color:${stageCol}">${esc(stageLabel(v.stage))}</span>
      ${rev}</span></td>
  </tr>`;
}
function vidRowsHTML(){
  const all=(STATE.videos||[]).filter(v=>!v.locale && !v.channel && origLangOf(v)===VID_LANG);   // 只列一創原本（依選單語言），不含二創版
  const q=String(VID_Q||'').toLowerCase().trim();
  let list=all.filter(v=> vidSegment(v)===VID_VIEW);
  if(q) list=list.filter(v=>[v.name,v.rawName,v.videoCopy,v.code,v.editor].map(x=>String(x||'').toLowerCase()).join("  ").includes(q));
  if(VID_TAGS.size) list=list.filter(v=>videoTagsOf(v).some(t=>VID_TAGS.has(t)));
  if(!list.length) return `<div class="emptyState"><span class="es-mk">✦</span>${T("沒有符合的影片","No matching videos")}</div>`;
  // 五分類排序（過去→未來）：①未剪未排 ②未剪有排 ③已剪未排 ④已剪有排未過期 ⑤舊片(已剪過期)
  // 同一類內：有排程依「預排上片日」、沒排程依編號(上傳先後)，都從過去到未來
  list.sort((a,b)=> vidOrderRank(a)-vidOrderRank(b) || vidSortVal(a).localeCompare(vidSortVal(b)) || String(a.id).localeCompare(String(b.id)));
  return `<div class="${list.length>8?'vidscroll':''}"><table class="vtable responsive">
    <colgroup><col class="c-vid"><col class="c-tag"><col class="c-sch"><col class="c-prod"><col class="c-ed"><col class="c-st"></colgroup>
    <thead><tr><th>${T("影片","Video")}</th><th>${T("標籤","Tags")}</th><th>${VID_VIEW==="old"?T("上片日期","Aired"):T("預排上片","Scheduled")}</th><th>${T("商品","Products")}</th><th>${T("剪輯師","Editor")}</th><th>${T("狀態","Status")}</th></tr></thead>
    <tbody>${list.map(vidTableRow).join("")}</tbody></table></div>
    <p class="muted" style="margin-top:8px;font-size:12px">${T("共","Total")} ${list.length} ${T("支","videos")}</p>`;
}
function vidFilter(){ const el=document.getElementById('vid_list'); if(el) el.innerHTML=vidRowsHTML(); }
function vidTagToggle(t, el){ if(VID_TAGS.has(t)){ VID_TAGS.delete(t); el.classList.add('sec'); } else { VID_TAGS.add(t); el.classList.remove('sec'); } vidFilter(); }
function vidSetView(view){ VID_VIEW=view; VID_TAGS.clear(); render(); }
function vidSetLang(lang){ VID_LANG=ORIG_BADGE[lang]!=null?lang:""; VID_TAGS.clear(); render(); }
function viewVideos(){
  const allSrc=(STATE.videos||[]).filter(v=>!v.locale && !v.channel);   // 影片庫：只放一創原本，二創版走各自排程與源片的版本卡
  const langCount={}; allSrc.forEach(v=>{ const l=origLangOf(v); langCount[l]=(langCount[l]||0)+1; });
  const langSel=`<div class="row" style="gap:8px;align-items:center;margin-bottom:10px">
    <label style="margin:0">${T("原本語言","Original language")}</label>
    <select onchange="vidSetLang(this.value)" style="width:auto;min-width:150px">
      ${ORIG_LANGS.map(([k,l],i)=>`<option value="${k}" ${VID_LANG===k?'selected':''}>${T(l,["Chinese","Thai","English","Malaysia"][i])}（${langCount[k]||0}）</option>`).join("")}
    </select></div>`;
  const all=allSrc.filter(v=>origLangOf(v)===VID_LANG);
  const seg={rawNoSched:0,rawSched:0,newNoSched:0,newSched:0,old:0}; all.forEach(v=>{ const s=vidSegment(v); if(seg[s]!=null) seg[s]++; });
  const tab=(k,label,n)=>`<button class="vtab ${VID_VIEW===k?'on':''}" onclick="vidSetView('${k}')">${label} <span class="vtab-n">${n}</span></button>`;
  // 標籤鈕：只列出「本分頁影片實際有的標籤」並標數量 → 按了一定對得上影片
  const viewList=all.filter(v=> vidSegment(v)===VID_VIEW);
  const tagCount={}; viewList.forEach(v=>videoTagsOf(v).forEach(t=>{ tagCount[t]=(tagCount[t]||0)+1; }));
  const order=videoTags();
  const present=Object.keys(tagCount).sort((a,b)=>{ const ia=order.indexOf(a),ib=order.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib) || a.localeCompare(b); });
  const tagBtns=present.length
    ? present.map(t=>`<button class="btn sm ${VID_TAGS.has(t)?'':'sec'}" onclick="vidTagToggle('${esc(jsEsc(t))}',this)">${esc(t)} <span style="opacity:.7">${tagCount[t]}</span></button>`).join("")
      +`<a href="javascript:void(0)" onclick="VID_TAGS.clear();render()" class="muted" style="font-size:12px;margin-left:4px">${T("清除篩選","Clear")}</a>`
    : `<span class="muted" style="font-size:12px">${T("此分頁的影片尚未加標籤","No tags on this tab yet")}</span>`;
  return `<h2>${T("影片庫","Library")}</h2>
  <div class="card">
    ${langSel}
    <div class="vtabs">
      ${tab("rawNoSched",T("待剪・未排程","Raw · unscheduled"),seg.rawNoSched)}
      ${tab("rawSched",T("待剪・已排程","Raw · scheduled"),seg.rawSched)}
      ${tab("newNoSched",T("剪完・未排程","Done · unscheduled"),seg.newNoSched)}
      ${tab("newSched",T("剪完・已排程","Done · scheduled"),seg.newSched)}
      ${tab("old",T("舊片","Old"),seg.old)}
    </div>
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px">
      <input id="vid_q" placeholder="${T("搜尋編號／片名／剪輯","Search code / title / editor")}" value="${esc(VID_Q)}" oninput="VID_Q=this.value;vidFilter()" style="flex:1;min-width:150px">
      <button class="btn sm" onclick="newSimpleVideo()">＋ ${T("新增一支","Add one")}</button>
      <button class="btn sec sm" onclick="batchNewFootage()">${T("批次新增","Batch add")}</button>
    </div>
    <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px">
      <span class="muted" style="font-size:12px">${T("標籤","Tags")}：</span>
      ${tagBtns}
    </div>
    <div id="vid_list" style="margin-top:6px">${vidRowsHTML()}</div>
  </div>`;
}
// 刪除影片：二次確認，無法復原
function delVideo(id){
  const v=vid(id)||{};
  if(!confirm(T("確定要刪除「"+vidTitle(v)+"」？\n\n（會移到「回收桶」並記錄是誰刪的，管理員可復原）","Delete \""+vidTitle(v)+"\"?\n\n(It goes to the recycle bin with your name logged — the admin can restore it.)"))) return;
  write("DELETE","/api/videos/"+id,{},T("已刪除「"+vidTitle(v)+"」（移到回收桶，管理員可復原）","Deleted \""+vidTitle(v)+"\" — moved to the recycle bin; the admin can restore it")).then(ok=>{ if(ok) closeModal(); });
}
// 回收桶（管理員）：復原 / 永久刪除
function restoreVideo(id){ const v=vidLocal(id)||{}; write("POST","/api/videos/"+id+"/restore",{},"已復原「"+vidTitle(v)+"」"); }
function purgeVideo(id){ const v=vidLocal(id)||{};
  if(!confirm("永久刪除「"+vidTitle(v)+"」？此動作無法復原。")) return;
  write("DELETE","/api/videos/"+id+"/purge",{},"已永久刪除「"+vidTitle(v)+"」"); }
// 操作紀錄（管理員）：誰・何時・做了什麼・對象
// ── 操作紀錄的查詢條件（v85）──
let LOG_Q="", LOG_WHO="", LOG_FROM="", LOG_TO="";
function logSetQ(v){ LOG_Q=String(v||"").trim(); render(); }
function logSetWho(v){ LOG_WHO=String(v||""); render(); }
function logSetFrom(v){ LOG_FROM=String(v||"").slice(0,10); render(); }
function logSetTo(v){ LOG_TO=String(v||"").slice(0,10); render(); }
function logClear(){ LOG_Q=""; LOG_WHO=""; LOG_FROM=""; LOG_TO=""; render(); }
function logHasFilter(){ return !!(LOG_Q||LOG_WHO||LOG_FROM||LOG_TO); }
// 再往前多載一些。只有管理員按得到，一次只多讀那幾百筆。
function logMore(){
  const cur=(window.DB&&window.DB.logsLimit)?window.DB.logsLimit():300;
  if(window.DB&&window.DB.watchLogs){ window.DB.watchLogs(cur+700); toast("正在載入更早的紀錄…"); }
}
function logMatch(l){
  const day=String(l.at||"").slice(0,10);
  if(LOG_FROM && day<LOG_FROM) return false;
  if(LOG_TO   && day>LOG_TO)   return false;
  if(LOG_WHO  && l.user!==LOG_WHO) return false;
  if(LOG_Q){ const hay=[l.user,l.action,l.target,ROLE_LABEL[l.role]||l.role].join(" ").toLowerCase();
    if(!hay.includes(LOG_Q.toLowerCase())) return false; }
  return true;
}
function viewLog(){
  const all=((STATE&&STATE.logs)||[]).slice().sort((a,b)=>String(b.at||"").localeCompare(String(a.at||"")));
  const logs=all.filter(logMatch);
  const shown=logs.slice(0,400);
  const who=Array.from(new Set(all.map(l=>l.user).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b)));
  const loaded=(window.DB&&window.DB.logsLimit)?window.DB.logsLimit():300;
  const rows=shown.map(l=>`<tr>
    <td data-label="時間">${esc((l.at||"").replace("T"," "))}</td>
    <td data-label="誰"><b>${esc(l.user||"")}</b> <span class="muted" style="font-size:11px">${esc(ROLE_LABEL[l.role]||l.role||"")}</span></td>
    <td data-label="動作">${esc(l.action||"")}</td>
    <td data-label="對象">${esc(l.target||"")}</td></tr>`).join("");
  const empty = all.length ? "沒有符合條件的紀錄" : "目前沒有紀錄";
  return `<h2>操作紀錄</h2>
    <div class="card">
      <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
        <input id="lg_q" value="${esc(LOG_Q)}" placeholder="搜尋人名、動作、對象…" style="flex:2;min-width:150px"
          onchange="logSetQ(this.value)" onkeydown="if(event.key==='Enter')logSetQ(this.value)">
        <select id="lg_who" style="width:auto" onchange="logSetWho(this.value)">
          <option value="">全部的人</option>
          ${who.map(n=>`<option value="${esc(n)}" ${LOG_WHO===n?"selected":""}>${esc(n)}</option>`).join("")}</select>
        <span class="row" style="gap:6px;flex-wrap:nowrap;align-items:center;flex:1 1 235px;min-width:235px">
          <input id="lg_from" type="date" value="${esc(LOG_FROM)}" style="flex:1;min-width:0" title="從哪一天" onchange="logSetFrom(this.value)">
          <span class="muted" style="flex:none">–</span>
          <input id="lg_to" type="date" value="${esc(LOG_TO)}" style="flex:1;min-width:0" title="到哪一天" onchange="logSetTo(this.value)">
        </span>
        ${logHasFilter()?`<button class="btn sec sm" style="flex:none" onclick="logClear()">清除</button>`:""}
      </div>
      <div class="muted" style="font-size:12px;margin-top:8px">
        ${logHasFilter()?`符合 <b>${logs.length}</b> 筆`:`共 <b>${all.length}</b> 筆`}${logs.length>shown.length?`（只顯示最近 ${shown.length} 筆）`:""}
        ・已載入最近 ${all.length} 筆紀錄
        <button class="btn sec sm" style="padding:2px 9px;font-size:11px;margin-left:6px" onclick="logMore()">載入更早的</button>
      </div>
      <div class="${shown.length>10?'vidscroll':''}" style="margin-top:8px">
      <table class="responsive"><thead><tr><th>時間</th><th>誰</th><th>動作</th><th>對象</th></tr></thead>
      <tbody>${rows||`<tr><td colspan="4" class="muted">${empty}</td></tr>`}</tbody></table>
    </div></div>`;
}
// 回收桶（管理員）：被刪除的影片可復原或永久刪除
function viewTrash(){
  const list=((STATE&&STATE.deletedVideos)||[]).slice().sort((a,b)=>String(b.deletedAt||"").localeCompare(String(a.deletedAt||"")));
  const rows=list.map(v=>`<tr>
    <td data-label="影片"><b>${esc(vidTitle(v))}</b></td>
    <td data-label="刪除者">${esc(v.deletedBy||"")}</td>
    <td data-label="刪除時間">${esc((v.deletedAt||"").replace("T"," "))}</td>
    <td data-label="操作"><div class="row" style="gap:6px">
      <button class="btn sm" onclick="restoreVideo('${esc(jsEsc(v.id))}')">復原</button>
      <button class="btn danger sm" onclick="purgeVideo('${esc(jsEsc(v.id))}')">永久刪除</button></div></td></tr>`).join("");
  return `<h2>回收桶</h2>
    <div class="card"><div class="${list.length>10?'vidscroll':''}">
      <table class="responsive"><thead><tr><th>影片</th><th>刪除者</th><th>刪除時間</th><th>操作</th></tr></thead>
      <tbody>${rows||`<tr><td colspan="4" class="muted">回收桶是空的</td></tr>`}</tbody></table>
    </div></div>`;
}
// ===== 平台成效（管理員／經理人）：平台總覽 → 影片排行(帶貨/剪輯) → 點影片看跨平台；商品排行 =====
let PERF_PLAT=null;   // 選中的平台（null＝全部平台）
function perfSetPlat(p){ PERF_PLAT=(PERF_PLAT===p)?null:p; render(); }
function num(n){ return (+n||0).toLocaleString(); }
function viewPerf(){
  const vids=STATE.videos||[];
  const rows=[]; vids.forEach(v=>{ (Array.isArray(v.metrics)?v.metrics:[]).forEach(m=>rows.push(Object.assign({v},m))); });
  const hasData=rows.length>0;
  // 平台彙總（累計）
  const plats={}; rows.forEach(r=>{ const p=r.platform||"其他"; const o=plats[p]||(plats[p]={views:0,likes:0,vids:new Set()}); o.views+=(+r.views||0); o.likes+=(+r.likes||0); o.vids.add(r.v.id); });
  const platKeys=Object.keys(plats).sort((a,b)=>plats[b].views-plats[a].views);
  // 影片排行（依選中平台，否則全部）
  const inScope=r=> !PERF_PLAT || r.platform===PERF_PLAT;
  const perVid={}; rows.filter(inScope).forEach(r=>{ const o=perVid[r.v.id]||(perVid[r.v.id]={v:r.v,views:0,likes:0}); o.views+=(+r.views||0); o.likes+=(+r.likes||0); });
  const vRank=Object.values(perVid).sort((a,b)=>b.views-a.views).slice(0,50);
  // 商品排行（reach＝帶此商品影片的觀看加總；不是銷售）
  const prod={}; vids.forEach(v=>{ const vv=(Array.isArray(v.metrics)?v.metrics:[]).filter(inScope).reduce((a,m)=>a+(+m.views||0),0);
    (v.products||[]).forEach(p=>{ if(p&&p.name){ const o=prod[p.name]||(prod[p.name]={views:0,vids:new Set()}); o.views+=vv; o.vids.add(v.id); } }); });
  const pRank=Object.entries(prod).sort((a,b)=>b[1].views-a[1].views).slice(0,50);
  const prodCell=(v)=>{ const ps=(v.products||[]).filter(p=>p&&p.name).map(p=>esc(p.name)); return ps.length?ps.join("、"):'<span class="muted">—</span>'; };

  const platCards=platKeys.map(p=>`<button class="card" onclick="perfSetPlat('${esc(jsEsc(p))}')" style="text-align:left;cursor:pointer;border-color:${PERF_PLAT===p?'var(--accent)':'var(--line)'};min-width:150px;flex:1">
      <b>${esc(p)}</b><div style="font-family:var(--serif);font-size:24px;font-weight:900;margin-top:4px">${num(plats[p].views)}</div>
      <div class="muted" style="font-size:12px">觀看累計・讚 ${num(plats[p].likes)}・${plats[p].vids.size} 支</div></button>`).join("");

  return `<h2>平台成效${PERF_PLAT?` <span class="muted" style="font-size:13px">目前只看：${esc(PERF_PLAT)}</span>`:""}</h2>
  ${!hasData?`<div class="card" style="border-color:var(--accent);background:var(--amberbg)">
    <b>尚無平台成效數據</b>
    <div class="muted" style="margin-top:6px;line-height:1.8;color:var(--txt)">等平台接入(Supabase 後端 + TikTok/IG/FB 授權)後，會以<b>影片標題</b>自動比對貼文，把觀看、讚等填進來，這頁就會自動出現各平台總成效、影片排行、商品排行。<br>備註：<b>「本週」</b>總成效需要每週快照(後端一併建)；<b>商品實際「銷售」</b>需另接 Shopline 訂單，這裡顯示的是觀看/觸及。</div>
  </div>`:''}
  ${platKeys.length?`<div class="row" style="gap:10px;margin-bottom:6px">${platCards}</div>`:''}
  <div class="card"><b>影片排行${PERF_PLAT?`（${esc(PERF_PLAT)}）`:'（全平台）'}</b> <span class="muted" style="font-size:12px">依觀看排序，點影片看跨平台明細與帶貨</span>
    <div class="${vRank.length>10?'vidscroll':''}" style="margin-top:8px">
    <table class="responsive"><thead><tr><th>#</th><th>影片</th><th>剪輯</th><th>帶貨商品</th><th>觀看</th><th>讚</th></tr></thead>
    <tbody>${vRank.map((r,i)=>`<tr style="cursor:pointer" onclick="editVideo('${r.v.id}')">
      <td data-label="#">${i+1}</td>
      <td data-label="影片"><a href="javascript:void(0)">${esc(vidTitle(r.v))}</a></td>
      <td data-label="剪輯">${esc(r.v.editor||r.v.claimedBy||"")||'<span class="muted">—</span>'}</td>
      <td data-label="帶貨商品">${prodCell(r.v)}</td>
      <td data-label="觀看"><b>${num(r.views)}</b></td>
      <td data-label="讚">${num(r.likes)}</td></tr>`).join("")||`<tr><td colspan="6" class="muted">尚無資料</td></tr>`}</tbody></table>
    </div>
  </div>
  <div class="card"><b>帶貨商品排行${PERF_PLAT?`（${esc(PERF_PLAT)}）`:''}</b> <span class="muted" style="font-size:12px">依「帶此商品的影片觀看加總」排（觸及，非銷售）</span>
    <div class="${pRank.length>10?'vidscroll':''}" style="margin-top:8px">
    <table class="responsive"><thead><tr><th>#</th><th>商品</th><th>出現影片</th><th>觀看(觸及)</th></tr></thead>
    <tbody>${pRank.map((e,i)=>`<tr><td data-label="#">${i+1}</td><td data-label="商品"><b>${esc(e[0])}</b></td><td data-label="出現影片">${e[1].vids.size} 支</td><td data-label="觀看(觸及)"><b>${num(e[1].views)}</b></td></tr>`).join("")||`<tr><td colspan="4" class="muted">尚無帶貨商品資料</td></tr>`}</tbody></table>
    </div>
  </div>`;
}
// 影片內容：預設檢視（不可改）；右上「編輯」才進編輯、右上「×」關閉
function editVideo(id){ openVideoModal(id, true); }
// 編輯模式離開保護：有改動時，必須按「儲存修改」或「取消編輯」
function cancelVideoEdit(){ MODAL_DIRTY=false; closeModal(); }
function tryExitVideoEdit(){ if(MODAL_DIRTY){ toast(T("已修改，請按「儲存修改」或「取消編輯」","Unsaved changes — press Save or Cancel"),true); return; } closeModal(); }
// 影片視窗：平台成效卡（管理員／經理人可見）
function vidMetricsCard(v){
  const mx=Array.isArray(v.metrics)?v.metrics:[];
  const mTotal=mx.reduce((a,m)=>a+(+m.views||0),0);
  const html = (currentRole()==="boss"||currentRole()==="manager") ? `<div class="card" style="background:var(--panel2)"><div class="row" style="justify-content:space-between;align-items:center">
      <b>平台成效</b>${mx.length?`<span class="pill ok" style="font-size:10px">總觀看 ${mTotal.toLocaleString()}</span>`:''}</div>
    ${mx.length?`<table class="responsive" style="margin-top:8px"><thead><tr><th>平台／帳號</th><th>觀看</th><th>讚</th><th>留言</th><th>分享</th></tr></thead><tbody>
      ${mx.map(m=>`<tr><td data-label="平台／帳號">${esc(m.platform||"")} ${esc(m.account||"")}</td><td data-label="觀看">${(+m.views||0).toLocaleString()}</td><td data-label="讚">${(+m.likes||0).toLocaleString()}</td><td data-label="留言">${(+m.comments||0).toLocaleString()}</td><td data-label="分享">${(+m.shares||0).toLocaleString()}</td></tr>`).join("")}
      </tbody></table><div class="muted" style="font-size:11px;margin-top:4px">更新於 ${esc((v.metricsAt||"").replace("T"," "))}</div>`
      :`<div class="muted" style="font-size:12px;margin-top:6px">尚無成效數據。平台接入後，會以「影片標題」自動比對 TikTok／IG／FB 的貼文，把觀看、讚等填進這裡。</div>`}
  </div>` : "";
  // 跨語言：源片列出各語言版本（中英一起看）；英文版顯示回連源片
  return html;
}
// 影片視窗：檢視模式（唯讀明細＋各語言版本／成效／審片卡）
// 影片視窗：檢視模式（唯讀明細＋各語言版本／成效／審片／使用紀錄）
function vidViewModal(v, id, head, tags, prodList, localizedCard, metricsCard, reviewCard, usageCard){
  const row=(l,c)=>`<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)"><div class="muted" style="width:100px;flex:none;font-size:13px">${l}</div><div style="flex:1;min-width:0">${c||'<span class="muted">—</span>'}</div></div>`;
  const body=`
      ${row(T("編號","Code"), esc(vidCode(v)))}
      ${row(T("原始片名","Raw title"), esc(zhTW(v.rawName||"")))}
      ${row(T("影片貼文文案","Post caption"), esc(zhTW(v.name||""))+enSubLine(v))}
      ${row(T("影片文案","Script"), (v.videoCopy?esc(zhTW(v.videoCopy)).replace(/\n/g,'<br>'):'')+((currentRole()==="intl"&&!v.locale&&v.videoCopyEn)?`<div class="vt-en">${esc(v.videoCopyEn).replace(/\n/g,'<br>')}</div>`:''))}
      ${row(T("標籤","Tags"), tags.length?tags.map(t=>`<span class="tag">${esc(t)}</span>`).join(" "):'')}
      ${(!v.locale&&!v.channel)?row(T("原本語言","Original language"), `${origBadge(v)} ${esc(origLangLabel(origLangOf(v)))}`):''}
      ${row(T("片源","Source"), esc(v.source||""))}
      ${row(T("階段","Stage"), `<span class="pill ${dispStage(v)==='待審核'?'wa':(v.stage==='已上片'||v.stage==='已完成'?'ok':(v.stage==='剪輯中'?'wa':''))}">${esc(stageLabel(dispStage(v)))}</span>`)}
      ${row(T("剪輯人員","Editor"), esc(v.editor||""))}
      ${row(T("建立者","Created by"), v.createdBy?`${esc(v.createdBy)}${v.createdAt?` <span class="muted" style="font-size:12px">${esc(String(v.createdAt).slice(0,10))}</span>`:''}`:'')}
      ${row(T("商品","Products"), prodList.length?prodList.map(p=>esc(p.name)+(p.price?`（NT$${esc(p.price)}${p.salePrice?T(`／寵粉價 NT$${esc(p.salePrice)}`,` / Fan price NT$${esc(p.salePrice)}`):''}）`:"")).join("、"):'')}
      ${row(T("商品頁網址","Product page"), v.productUrl?`<a href="${esc(v.productUrl)}" target="_blank">${esc(v.productUrl)}</a>`:'')}
      ${row(T("預排上片日","Scheduled"), esc(v.scheduledDate||""))}
      ${row(T("毛片雲端連結","Raw footage"), v.rawLink?`<a href="${esc(v.rawLink)}" target="_blank">${T("開啟","Open")}</a>`:'')}
      ${row(T("完成影片存檔連結","Finished file"), v.driveFolder?`<a href="${esc(v.driveFolder)}" target="_blank">${T("開啟","Open")}</a>`:'')}
      ${editLinksHTML(v.productUrl)}
      ${localizedCard}
      ${metricsCard}
      ${reviewCard}
      ${usageCard}`;
    MODAL_DIRTY=false;
    document.getElementById("modalRoot").innerHTML=`<div class="modal" onclick="modalBackdrop(event)"><div class="box" onclick="event.stopPropagation()">${head}${body}</div></div>`;
    return;
}
function openVideoModal(id, edit, fromWork){
  const v = vid(id)||{};
  const s=STATE.settings||{};
  const sources=s.sources||["老闆自拍","外部公司"];
  const users=(STATE.users||[]).filter(u=>u.role==="editor").map(u=>u.name);
  const stages=["待處理","剪輯中","已完成","已上片"];
  const tags=videoTagsOf(v);
  const prodList=(Array.isArray(v.products)?v.products.filter(p=>p&&p.name):[]);
  const reviewCard = reviewCardHTML(v);
  const metricsCard=vidMetricsCard(v);
  // 一創剪輯不需要看到二創版本的狀況（減少干擾）；做二創的人與管理層才顯示
  const localizedCard = doesDerived() ? (localizedVersionsCard(v) + shopeeVersionsCard(v) + msVersionsCard(v)) : "";
  const usageCard = id&&usageList(v).length?`<div class="card" style="background:var(--panel2)"><b>使用紀錄（共 ${usageList(v).length} 次）</b>
      <table class="responsive"><thead><tr><th>上片日期</th><th>連結</th><th>排片人</th></tr></thead><tbody>
      ${usageList(v).map(u=>`<tr><td data-label="上片日期">${esc(u.date)}</td><td data-label="連結">${u.link?`<a href="${esc(u.link)}" target="_blank">開啟</a>`:'<span class="muted">—</span>'}</td><td data-label="排片人">${esc(u.by||"")}</td></tr>`).join("")}
      </tbody></table></div>`:"";
  const head=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 14px">
      <h3 style="margin:0">${T("影片內容","Video details")}</h3>
      <div style="display:flex;gap:6px;align-items:center">
        ${edit?'':`<button class="btn sec sm" type="button" onclick="openVideoModal('${id}',true)">${T("編輯","Edit")}</button>`}
        <button class="btn sec sm" type="button" onclick="${edit?'tryExitVideoEdit()':'closeModal()'}" title="${T("關閉","Close")}">×</button>
      </div></div>`;

  if(!edit){ vidViewModal(v, id, head, tags, prodList, localizedCard, metricsCard, reviewCard, usageCard); return; }

  const body=`
    <label>${T("編號 ／ 原始片名","Code / Raw title")}</label>
    <div class="row" style="gap:8px">
      <input id="e_code" value="${esc(vidCode(v))}" style="flex:none;width:78px;text-align:center" placeholder="${T("編號","Code")}" oninput="var c=document.getElementById('e_code2');if(c)c.value=this.value">
      <input id="e_raw" value="${esc(v.rawName||"")}" style="flex:1" placeholder="${T("原始片名","Raw title")}">
    </div>
    <label>${T("編號 ／ 影片貼文文案（不填則同原始片名）","Code / Post caption (defaults to raw title)")}</label>
    <div class="row" style="gap:8px">
      <input id="e_code2" value="${esc(vidCode(v))}" readonly style="flex:none;width:78px;text-align:center;background:var(--panel2)" title="${T("同原片編號","Same code")}">
      <input id="e_name" value="${esc(v.name||"")}" style="flex:1" placeholder="${T("影片貼文文案","Post caption")}">
    </div>
    <label>${T("毛片雲端連結","Raw footage cloud link")}</label><input id="e_rawlink" value="${esc(v.rawLink||"")}" placeholder="${T("毛片原始檔雲端連結","Cloud link")}">
    <label>${T("影片文案（影片中 IP 的口播台詞）","Script (spoken lines)")}</label><input id="e_vcopy" value="${esc(v.videoCopy||"")}" autocomplete="off">
    ${tagPickerHTML("e", v.tags||(v.subTag?[v.subTag]:[]))}
    <div class="grid cols2">
      <div><label>${T("片源","Source")}</label><select id="e_src">${sources.map(c=>`<option ${v.source===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
      <div><label>${T("階段","Stage")}</label>
        ${["boss","manager"].includes(currentRole())
          ? `<select id="e_stage">${stages.map(c=>`<option value="${esc(c)}" ${v.stage===c?"selected":""}>${esc(stageLabel(c)||c)}</option>`).join("")}</select>`
          : `<input id="e_stage" value="${esc(v.stage||"待處理")}" readonly disabled style="background:var(--panel2)">
             <div class="muted" style="font-size:11px;margin:4px 0 0">${T("剪好了請用工作頁的「完成 ✔」，階段會自動走","Use “Done ✔” on your work page — the stage moves itself")}</div>`}</div>
    </div>
    ${(!v.locale&&!v.channel)?`<label>${T("原本語言（這支影片是什麼語言拍的）","Original language")}</label>
    <select id="e_lang">${ORIG_LANGS.map(([k,l],i)=>`<option value="${k}" ${origLangOf(v)===k?'selected':''}>${T(l,["Chinese","Thai","English","Malaysia"][i])}</option>`).join("")}</select>`:''}
    <label>${T("剪輯人員","Editor")}</label><select id="e_editor"><option value="">—</option>${(v.editor&&!users.includes(v.editor)?[v.editor]:[]).concat(users).map(u=>`<option ${v.editor===u?"selected":""}>${esc(u)}</option>`).join("")}</select>
    ${productRows("e", v.products)}
    <label>${T("商品頁網址","Product page URL")}</label><input id="e_url" value="${esc(v.productUrl||"")}" oninput="renderEditLinks()" placeholder="https://www.tzgrotw.tw/products/...">
    <label>${T("預排上片日期","Scheduled upload date")}</label>
    <div class="dateField"><span class="dateIco">🗓</span><input id="e_date" type="date" value="${esc(v.scheduledDate||"")}"></div>

    <div id="e_links">${editLinksHTML(v.productUrl)}</div>
    <label>${T("備註","Notes")}</label><input id="e_note" value="${esc(v.note||"")}" placeholder="${T("補充說明（選填）","Optional notes")}">
    ${reviewCard}
    <div class="card" style="background:var(--panel2)"><b>${T("完成影片存檔連結","Finished file link")}</b>
      <label>${T("完成影片存檔連結","Finished file link")}</label><input id="e_drive" value="${esc(v.driveFolder||"")}" placeholder="${T("剪輯完成後的成品存檔連結","Cloud link to the finished cut")}">
    </div>
    ${localizedCard}
    ${metricsCard}
    ${usageCard}
    ${((currentRole()==="boss"||currentRole()==="manager") && (isPublished(v) || (v.stage==="剪輯中" && !(v.editor||v.claimedBy))))?`<div class="card" style="border-color:var(--accent)">
      <button class="btn sm" type="button" onclick="reworkVideo('${id}')">移到剪輯的今日工作</button>
      <span class="muted" style="font-size:12px;margin-left:8px">${(v.editor||v.claimedBy)?`退回「${esc(v.editor||v.claimedBy)}」重剪`:"這支無人認領，按下可指定剪輯"}</span>
    </div>`:''}
    ${(v.stage==="剪輯中"&&!["boss","manager"].includes(currentRole()))?`<div class="card">
      <button class="btn sec sm" type="button" onclick="closeModal();unclaimVid('${id}')">${T("退回（放回待剪清單）","Return to the pool")}</button>
      <span class="muted" style="font-size:12px;margin-left:8px">${T("不會刪除影片，只是退回給大家重選","Nothing is deleted — it goes back to the shared pool")}</span>
    </div>`:''}
    <div class="card" style="border-color:var(--red)">
      <button class="btn danger sm" type="button" onclick="delVideo('${id}')">${T("刪除這支影片","Delete this video")}</button>
      <span class="muted" style="font-size:12px;margin-left:8px">${T("需二次確認：移到回收桶（會記錄是誰刪的），管理員可救回","Asks to confirm — goes to the recycle bin (logged with your name); the admin can restore it")}</span>
    </div>`;
  const foot=`<div class="modalFoot">
      <button class="btn sec" type="button" onclick="cancelVideoEdit()">${T("取消編輯","Cancel")}</button>
      <button class="btn" id="vmSave" type="button">${fromWork?T('儲存並完成','Save & finish'):T('儲存修改','Save')}</button></div>`;
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
  if(hasProd && !productUrl){ toast(T("有填銷售商品就要一起填『商品頁網址』，否則無法導購","Products need the product page URL too"),true); return false; }
  if(productUrl && !hasProd){ toast(T("有填『商品頁網址』就要至少填一個銷售商品（品名）","A product page URL needs at least one product name"),true); return false; }
  const tags=[...new Set(collectTags("e").map(renameTag))];
  if(hasProd && !tags.includes("寵粉")) tags.push("寵粉");   // 有銷售商品 → 自動帶「寵粉」標籤
  await persistNewTags(tags);
  const mainType = tags.some(t=>["代理","招商","代理招商"].includes(t))?"代理招商"
    :((tags.some(t=>String(t).includes("寵粉"))||tags.some(t=>["帶貨","銷售"].includes(t)))?"寵粉":"");  // 無對應標籤＝不分類
  const video={code:val("e_code").trim(), rawName:zhTW(val("e_raw")), name:zhTW(val("e_name").trim()||val("e_raw").trim()), videoCopy:zhTW(val("e_vcopy").trim()), mainType,tags,subTag:tags[0]||"",
    products, productUrl,
    source:val("e_src"),stage:val("e_stage"),editor:val("e_editor"),
    scheduledDate:val("e_date")||null,
    driveFolder:val("e_drive"), rawLink:val("e_rawlink").trim(), note:zhTW(val("e_note").trim())};
  if(document.getElementById("e_lang")) video.origLang=val("e_lang")||"";   // 一創原本才有這個欄位
  return await write("PUT",`/api/videos/${id}`,{video},T("已更新影片","Video updated"));
}

// ===================================================================
// 海外剪輯（Intl Editor）— 全英文：挑台灣完成片 → 建英文版 → 翻譯重剪 → 上傳
// 英文版＝一筆 locale:"en" 的影片，sourceVideoId 指回台灣源片；沿用認領/完成流程與影片庫。
// ===================================================================
let INTL_Q="";
// 在地化語言（海外二創）：一種角色、建立時選語言；皆用英文操作介面
// 馬來西亞已移到台灣區（channel:"ms"，比照蝦皮由台灣剪輯做），海外只剩 英/泰
// ===================================================================
// 衍生版本線（四條）：蝦皮／馬來西亞走 channel 欄位，英文／泰文走 locale 欄位。
// 建立／認領／退回／完成／改期／月曆計數 全部共用下面這組 line* 函式 ——
// 改流程只要改一次，四條線同時生效（顯示文字仍各線自訂，由呼叫端傳入）。
// ===================================================================
const LINES={
  shopee:{ key:"shopee", field:"channel", priceKey:"shopee", acctKey:"shopeeAccounts", targetKey:"shopeeDailyTarget" },
  ms:    { key:"ms",     field:"channel", priceKey:"ms",     acctKey:"msAccounts",     targetKey:"msDailyTarget" },
  en:    { key:"en",     field:"locale",  priceKey:"en",     acctKey:"",               targetKey:"intlDailyTarget" },
  th:    { key:"th",     field:"locale",  priceKey:"th",     acctKey:"",               targetKey:"intlDailyTarget" },
};
function lineOf(v){ return String((v&&(v.channel||v.locale))||""); }                 // 這支屬於哪條線（空＝台灣源片）
function lineMatch(v,k){ const L=LINES[k]; return !!L && String((v||{})[L.field]||"")===k; }
function lineAccounts(k){ const L=LINES[k]; if(!L) return [];
  if(L.acctKey){ const a=STATE.settings&&STATE.settings[L.acctKey]; return Array.isArray(a)?a.filter(x=>String(x||"").trim()):[]; }
  return intlAccountsFor(k).map(a=>a.name); }
function lineTarget(k){ const L=LINES[k]; if(!L) return 2;
  const v=STATE.settings&&STATE.settings[L.targetKey]; return (v!=null&&v!=="")?(+v||0):2; }
function lineVersionsOfSrc(k, sourceId){ return (STATE.videos||[]).filter(v=>lineMatch(v,k) && v.sourceVideoId===sourceId); }
function lineDayList(k, date, acct){ return (STATE.videos||[]).filter(v=>lineMatch(v,k) && v.account===acct && String(v.scheduledDate||"").slice(0,10)===date); }
function lineDayBreak(k, date, acct){ const total=lineDayList(k,date,acct).length, target=lineTarget(k);
  return {total, target, short:Math.max(0,target-total), full: total>=target}; }
// 來源片池：四條線共用「已完整上傳的中文舊片」，互相排除彼此的衍生版本
function lineSourcePool(){ return (STATE.videos||[]).filter(v=> !v.locale && !v.channel && isPublished(v) && vidIsOld(v)); }
// 建立版本殼（指派給自己；同源片同帳號不重複）。msg 由各線提供，行為只有這一份
function createLineVersion(k, sourceId, account, msg){
  const L=LINES[k]; if(!L){ toast(T("未知的平台","Unknown line"),true); return; }
  account=account||"";
  const s=vid(sourceId); if(!s){ toast(msg.notFound,true); return; }
  if(!isPublished(s)){ toast(msg.notPublished,true); return; }
  if(account && (STATE.videos||[]).some(v=>v.sourceVideoId===sourceId && lineMatch(v,k) && v.account===account)){
    toast(msg.dup(account),true); return; }
  const rec=newVideoRecord({ [L.field]:k, account, sourceVideoId:sourceId,
    rawName:(s.name||s.rawName||""), name:(msg.draftName?msg.draftName(s):""), videoCopy:"",
    products:(s.products||[]).filter(p=>p&&p.name).map(p=>({name:p.name,price:p.price||"",salePrice:p.salePrice||""})),
    productUrl:s.productUrl||"", mainType:s.mainType||"", source:s.source||"",
    stage:"待處理", assignedTo:currentUser() });
  write("POST","/api/videos",{video:rec},msg.ok(account)).then(ok=>{ if(ok) render(); });   // 留在原頁刷新，不跳走
}
// 退回待處理（放回公用池重選）
function lineUnclaim(id, askMsg, okMsg){ if(!confirm(askMsg)) return; write("POST",`/api/videos/${id}/unclaim`,{},okMsg); }
// 完成：不強制先填上傳連結（先排日期、到日子上傳後再回來補）→ 進入「待審核」
function lineFinish(id, askMsg, okMsg){ const v=vid(id)||{};
  if(!confirm(askMsg)) return;
  write("POST","/api/videos/"+id+"/finish",{name:v.name||null,driveFolder:v.driveFolder||"",publishedLink:v.publishedLink||"",scheduledDate:v.scheduledDate||null},okMsg).then(ok=>{ if(ok) render(); });
}
// 退回資料庫：只移除「還沒開始做」的版本殼，不動源片、不進回收桶
function lineDiscard(k, id, msg){ const v=vid(id)||{};
  if(!(lineMatch(v,k) && v.stage==="待處理")){ toast(msg.notAllowed,true); return; }
  if(!confirm(msg.ask(v))) return;
  write("DELETE","/api/videos/"+id+"/purge",{},msg.ok(v)).then(ok=>{ if(ok) render(); });
}
// 排程調整：只改預排上片日／移出當天，影片本身不動
function lineReschedule(id, nd, okMsg, after){ if(!nd) return; write("PUT",`/api/videos/${id}`,{video:{scheduledDate:nd}},okMsg).then(ok=>{ if(ok&&after) after(); }); }
function lineUnschedule(id, askMsg, okMsg, after){ if(!confirm(askMsg)) return;
  write("PUT",`/api/videos/${id}`,{video:{scheduledDate:null}},okMsg).then(ok=>{ if(ok&&after) after(); }); }
const INTL_LOCALES=["en","th"];
const LOCALE_NAME={en:"English",th:"ไทย (Thai)",ms:"Bahasa (Malay)"};   // ms 保留給顯示/翻譯用
const LOCALE_SHORT={en:"EN",th:"TH",ms:"MS"};
const LOCALE_GT={en:"en",th:"th",ms:"ms"};   // Google 翻譯目標語言
function localeName(l){ return LOCALE_NAME[l]||String(l||"").toUpperCase(); }
function localeShort(l){ return LOCALE_SHORT[l]||String(l||"").toUpperCase(); }
function gtranslate(text, tl){ return "https://translate.google.com/?sl=zh-TW&tl="+(tl||"en")+"&op=translate&text="+encodeURIComponent(String(text||"").slice(0,1800)); }
// 商品原價／售價（寵粉價）換算：海外二創依「源片」商品價格即時換算成對應幣別顯示（唯讀，只有源片能編輯）
// 每個平台（含蝦皮）另有「加乘」倍數：顯示價 = 源片價 × 匯率 × 加乘（蝦皮同幣別，匯率固定 1、只吃加乘）
const DEFAULT_CURRENCY={en:"USD",th:"THB",ms:"MYR",shopee:"TWD"};
const CURRENCY_SYMBOL={USD:"$",THB:"฿",MYR:"RM",TWD:"NT$"};
function exchangeRateOf(key){ if(key==="shopee") return 1;   // 蝦皮＝台幣，不換匯
  const r=STATE.settings&&STATE.settings.exchangeRates&&STATE.settings.exchangeRates[key];
  return (r&&+r.rate>0)?+r.rate:1; }
function priceMultOf(key){ const r=STATE.settings&&STATE.settings.exchangeRates&&STATE.settings.exchangeRates[key];
  return (r&&+r.mult>0)?+r.mult:1; }
function currencyCodeOf(key){ if(key==="shopee") return "TWD";
  const r=STATE.settings&&STATE.settings.exchangeRates&&STATE.settings.exchangeRates[key];
  return (r&&r.code)||DEFAULT_CURRENCY[key]||"TWD"; }
// products＝來源片商品陣列；key＝"shopee"（台幣×加乘）或 en/th/ms（匯率×加乘）
function productPriceLine(products, key){
  const list=(products||[]).filter(p=>p&&p.name); if(!list.length) return '<span class="muted">—</span>';
  const f=exchangeRateOf(key)*priceMultOf(key);
  const sym=CURRENCY_SYMBOL[currencyCodeOf(key)]||"";
  const saleLabel=(currentRole()==="intl"||key==="en"||key==="th")?"Fan price":"寵粉價";   // 海外視角一律英文；台灣區平台給中文同仁看中文
  return list.map(p=>{
    const orig=+p.price||0, sale=+p.salePrice||0;
    // 換算後無條件進位到整數（有小數就往上進，不讓匯率吃掉利潤）
    const priceTxt=orig?` ${sym}${Math.ceil(orig*f).toLocaleString()}`:'';   // 沒填原價就不顯示 0
    const saleTxt=sale?` <span style="color:var(--red)">${saleLabel} ${sym}${Math.ceil(sale*f).toLocaleString()}</span>`:'';
    return `${esc(p.name)}${priceTxt}${saleTxt}`;
  }).join(T('、',', '));
}
function srcOf(v){ return v&&v.sourceVideoId?vid(v.sourceVideoId):null; }
// 海外 TikTok 帳號清單（設定維護）：每筆 {locale, name}；每帳號每日目標
function intlAccounts(){ const a=STATE.settings&&STATE.settings.intlAccounts; return Array.isArray(a)?a.filter(x=>x&&x.name):[]; }
function intlAccountsFor(loc){ return intlAccounts().filter(a=>a.locale===loc); }
function intlDailyTarget(){ return lineTarget("en"); }
function localizedVersionsOfSrc(sourceId){ return (STATE.videos||[]).filter(v=>v.sourceVideoId===sourceId && v.locale); }
// 版本卡（源片視窗用，四條線共用）：列出這支源片在某條線的所有版本；
// 欄位／狀態顏色只有這一份，差異只有「標題、是否顯示語言欄、是否顯示觀看數」
function lineVersionsCard(cfg){
  const {kids, title, hint, cols} = cfg;
  if(!kids.length) return "";
  const rows=kids.map(k=>{
    const st=dispStage(k)==="待審核"?`<span class="pill wa" style="font-size:10px">${T("待審核","In review")}</span>`:(k.published||k.stage==="已完成")?`<span class="pill ok" style="font-size:10px">${T("完成","Done")}</span>`:(k.stage==="剪輯中"?`<span class="pill wa" style="font-size:10px">${T("製作中","In progress")}</span>`:`<span class="pill" style="font-size:10px">${T("待製作","To do")}</span>`);
    const link=k.publishedLink?`<a href="${esc(k.publishedLink)}" target="_blank">${T("上傳連結","Upload link")}</a>`:'<span class="muted">—</span>';
    const doneAt=String(k.finishedAt||"").slice(0,10)||'<span class="muted">—</span>';
    const sched=k.scheduledDate?esc(String(k.scheduledDate).slice(0,10)):'<span class="muted">—</span>';
    const mv=(Array.isArray(k.metrics)?k.metrics:[]).reduce((a,m)=>a+(+m.views||0),0);
    return `<tr>
      ${cols.lang?`<td data-label="${T("語言","Language")}">${esc(localeName(k.locale))}</td>`:''}
      <td data-label="${T("帳號","Account")}">${esc(k.account||"")||'<span class="muted">—</span>'}</td>
      <td data-label="${T("剪輯","Editor")}">${esc(k.editor||k.claimedBy||"")||'<span class="muted">—</span>'}</td>
      <td data-label="${T("狀態","Status")}">${st}</td>
      <td data-label="${T("完成日","Finished")}">${doneAt}</td>
      <td data-label="${T("預排上片","Scheduled")}">${sched}</td>
      <td data-label="${T("上傳連結","Upload")}">${link}</td>
      ${cols.views?`<td data-label="${T("觀看","Views")}">${mv?num(mv):'<span class="muted">—</span>'}</td>`:''}
      <td data-label=""><a href="javascript:void(0)" onclick="editVideo('${k.id}')">${T("開啟","Open")}</a></td></tr>`;
  }).join("");
  return `<div class="card" style="background:var(--panel2)"><b>${title}（${kids.length}）</b> <span class="muted" style="font-size:12px">${hint}</span>
    <table class="responsive" style="margin-top:8px"><thead><tr>${cols.lang?`<th>${T("語言","Language")}</th>`:''}<th>${T("帳號","Account")}</th><th>${T("剪輯","Editor")}</th><th>${T("狀態","Status")}</th><th>${T("完成日","Finished")}</th><th>${T("預排上片","Scheduled")}</th><th>${T("上傳連結","Upload")}</th>${cols.views?"<th>"+T("觀看","Views")+"</th>":''}<th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
// 版本回連源片的小卡（各線共用）
function lineBackToSourceCard(v, label){ const s=srcOf(v);
  return `<div class="card" style="background:var(--panel2)"><b>${label.head}</b>
      <div style="margin-top:6px">${s?`<a href="javascript:void(0)" onclick="editVideo('${s.id}')">${esc(vidTitle(s))}</a>`:`<span class="muted">${T("來源片已不存在","Source video no longer exists")}</span>`} <span class="muted" style="font-size:12px">・${label.tail}</span></div></div>`; }
// 源片視窗的「各語言版本」卡（中／英泰馬一起看）＋在地化版本回連源片
function localizedVersionsCard(v){
  if(!v||!v.id) return "";
  if(v.locale) return lineBackToSourceCard(v, {head:T("來源片（台灣）","Source video (Taiwan)"), tail:esc(localeName(v.locale))});
  const kids=localizedVersionsOfSrc(v.id).slice().sort((a,b)=>INTL_LOCALES.indexOf(a.locale)-INTL_LOCALES.indexOf(b.locale));
  return lineVersionsCard({ kids, title:T("各語言版本","Language versions"),
    hint:T("誰剪的・何時完成・預排何時上片，一起看","editor · finished date · scheduled date, at a glance"),
    cols:{lang:true, views:true} });
}
function stripHash(s){ return String(s||"").split(/[#＃]/)[0].trim(); }
// ---- Library：只列「已上傳的中文舊片」（完整已上傳＝已完成且過了上片日）----
function intlSourcePool(){ return lineSourcePool(); }
// 站內影片預覽播放器：能嵌入就播（Drive 檔案 / YouTube / 直接影片檔），資料夾或受保護貼文則給「開新分頁」
function playableEmbed(url){ url=String(url||"").trim();
  let m=url.match(/drive\.google\.com\/file\/d\/([-\w]+)/); if(m) return {t:'iframe',src:'https://drive.google.com/file/d/'+m[1]+'/preview'};
  if(url.indexOf('drive.google')>=0){ m=url.match(/[?&]id=([-\w]+)/); if(m) return {t:'iframe',src:'https://drive.google.com/file/d/'+m[1]+'/preview'}; }
  m=url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([-\w]{11})/); if(m) return {t:'iframe',src:'https://www.youtube.com/embed/'+m[1]};
  if(/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url)) return {t:'video',src:url};
  return {t:'open',src:url}; }
function openVidPreview(enc){ const url=decodeURIComponent(enc); const e=playableEmbed(url);
  let inner = e.t==='iframe' ? `<iframe src="${esc(e.src)}" allow="autoplay;fullscreen" allowfullscreen style="width:100%;aspect-ratio:16/9;max-height:64vh;border:0;border-radius:8px;background:#000"></iframe>`
    : e.t==='video' ? `<video src="${esc(e.src)}" controls autoplay playsinline style="width:100%;max-height:64vh;border-radius:8px;background:#000"></video>`
    : `<div class="muted" style="padding:26px 16px;text-align:center;line-height:1.7">This link can't play inside the app<br>(it looks like a cloud folder or a protected post).<br><a class="btn sm" style="margin-top:12px" href="${esc(url)}" target="_blank">Open in new tab ↗</a></div>`;
  const w=document.createElement('div'); w.className='modal'; w.style.zIndex='9999';
  w.onclick=function(ev){ if(ev.target===w) w.remove(); };
  w.innerHTML=`<div class="box" style="max-width:860px" onclick="event.stopPropagation()">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b>Preview</b><button class="btn sec sm" onclick="this.closest('.modal').remove()">×</button></div>
    ${inner}
    <div style="margin-top:8px;text-align:right"><a class="muted" href="${esc(url)}" target="_blank" style="font-size:12px">Open original ↗</a></div>
  </div>`;
  document.body.appendChild(w); }
function intlLibRows(loc){
  loc = INTL_LOCALES.includes(loc) ? loc : "";
  const q=String(INTL_Q||'').toLowerCase().trim();
  let src=intlSourcePool();
  if(q) src=src.filter(v=>[v.name,v.rawName,v.nameEn,v.videoCopyEn,v.code].map(x=>String(x||'').toLowerCase()).join("  ").includes(q));
  src.sort((a,b)=>String(b.updatedAt||b.finishedAt||"").localeCompare(String(a.updatedAt||a.finishedAt||"")));
  if(!src.length) return `<div class="emptyState"><span class="es-mk">✦</span>${T("目前沒有可做二創的影片（要是完整已上傳的舊片）。","No uploaded videos available to localize yet — new videos appear here once fully published.")}</div>`;
  const accts=intlAccounts();                                        // 全清單：option 的 value 用這裡的索引（createLocalFromAcct 依此取帳號）
  const locs = loc ? [loc] : INTL_LOCALES;                            // 指定語言時只列該語言的帳號／版本
  const shownAccts = loc ? intlAccountsFor(loc) : accts;
  const cards=src.slice(0,200).map(v=>{
    const zhTitle=stripHash(v.name||v.rawName)||T("(未命名)","(untitled)");   // 去掉 # 標籤
    const enT=stripHash(v.nameEn);
    // 分開：一支源片可有多支版本；chip 只顯示「語言色點＋狀態」(不寫 US/TH，帳號放 title 提示)
    const kidsAll=localizedVersionsOfSrc(v.id).filter(k=>!loc||k.locale===loc);
    const nArch=kidsAll.filter(isArchived).length;                 // 已上片＝完成任務，封存不再列出
    const kids=kidsAll.filter(k=>!isArchived(k)).sort((a,b)=>INTL_LOCALES.indexOf(a.locale)-INTL_LOCALES.indexOf(b.locale));
    const chips=kids.map(k=>{ const ds=dispStage(k); const done=(k.published||k.stage==='已完成')&&ds!=='待審核';
      return `<span class="pill ${done?'ok':'wa'}" style="cursor:pointer;font-size:11px" onclick="openIntlModal('${k.id}')" title="${esc(localeName(k.locale))}${k.account?(' · '+esc(k.account)):''}${k.editor?(' · '+esc(k.editor)):''}${k.createdBy?(' · '+T('由 '+esc(k.createdBy)+' 建立','added by '+esc(k.createdBy))):''}">${localeShort(k.locale)} · ${ds==='待審核'?T('待審','in review'):done?T('完成','done'):T('進行中','in progress')}</span>`;
    }).join(" ") + (nArch?`<span class="pill" style="font-size:11px;background:transparent;border:1px solid var(--line);color:var(--muted)" title="${T("已上片、已封存","Published & archived")}">${T("已封存","Archived")} ${nArch}</span>`:'');
    // 動作收成一排：▶ Preview 圖示 ＋ 帳號下拉 ＋ Add(選取後才建立、不跳走)
    const previewBtn=(v.publishedLink||v.driveFolder)?`<button class="btn sec sm ibtn" onclick="openVidPreview('${encodeURIComponent(v.publishedLink||v.driveFolder)}')" title="${T("預覽中文成片","Preview finished Chinese")}">▶</button>`:'';
    const addRow = shownAccts.length
      ? `<div class="row" style="gap:6px;align-items:center;width:100%;flex-wrap:nowrap">
          ${previewBtn}
          <select id="addacct_${v.id}" style="font-size:13px;padding:7px 8px;flex:1;min-width:0">
            <option value="">＋ ${T("加版本 — 選帳號","Add version — pick account")}</option>
            ${locs.filter(l=>intlAccountsFor(l).length).map(l=>`<optgroup label="${esc(localeName(l))}">${intlAccountsFor(l).map(a=>`<option value="${accts.indexOf(a)}">${esc(a.name)}</option>`).join("")}</optgroup>`).join("")}
          </select>
          <button class="btn sm" style="flex:none" onclick="createLocalPick('${v.id}')" title="${T("建立這個版本並加入待認領","Create this version and add it to the pool")}">＋ ${T("加入","Add")}</button>
        </div>`
      : `<div class="row" style="gap:6px;align-items:center;width:100%">${previewBtn}<span class="muted" style="font-size:12px">${loc?T(`還沒有${localeName(loc)}帳號 — 請管理員到設定新增`,`No ${localeName(loc)} accounts yet — ask the admin to add them in Settings`):T("請管理員先到設定新增帳號","Ask admin to add accounts in Settings")}</span></div>`;
    const prodChips=(v.products||[]).filter(p=>p&&p.name).map(p=>`<span class="tag">${esc(p.name)}</span>`).join(" ");
    return `<div class="ilib-card">
      <div style="min-width:0;flex:1">
        <div class="ilib-zh">${esc(zhTitle)} <span class="ilib-code">${esc(vidCode(v))}</span></div>
        ${enT?`<div class="ilib-en">${esc(enT)}</div>`:''}
        ${prodChips?`<div class="ilib-meta">${prodChips}</div>`:''}
      </div>
      <div class="ilib-actions">
        ${chips?`<div class="verrow">${chips}</div>`:''}
        ${addRow}
      </div>
    </div>`;
  }).join("");
  return cards;
}
function intlFilter(){ const el=document.getElementById('intl_list'); if(el) el.innerHTML=intlLibRows((WORK_ZONE==="en"||WORK_ZONE==="th")?WORK_ZONE:""); }
// ---- 海外月歷（Schedule）：依帳號看每天排幾支、目標＝每帳號 intlDailyTarget（預設 2）----
let INTL_CAL_YM=null; let INTL_ACCT="";
function intlCurAcct(){ const list=intlAccounts(); if(!list.length) return ""; if(!INTL_ACCT || !list.some(a=>a.name===INTL_ACCT)){ INTL_ACCT=list[0].name; } return INTL_ACCT; }
function intlSetAcct(name){ INTL_ACCT=name||""; render(); }
function calMoveIntl(n){ let [y,m]=INTL_CAL_YM; m+=n; if(m<0){m=11;y--;} if(m>11){m=0;y++;} INTL_CAL_YM=[y,m]; render(); }
// 某日某帳號已排的在地化版本（依上傳預排日 scheduledDate；不分階段＝看整體計畫）
function intlDayList(date, acct){ acct=acct!=null?acct:intlCurAcct();
  return (STATE.videos||[]).filter(v=>v.locale && v.account===acct && String(v.scheduledDate||"").slice(0,10)===date); }   // 海外月曆是跨語言看帳號，不套 lineDayList
function intlDayBreak(date, acct){ const total=intlDayList(date,acct).length, target=intlDailyTarget();
  return {total, target, short:Math.max(0,target-total), full: total>=target}; }
const MONTHS_EN=["January","February","March","April","May","June","July","August","September","October","November","December"];
// 月曆內容體（四條線共用）：格子計數／顏色／今日標記／缺片提示邏輯只有這一份，
// 各線只提供「帳號清單、目前帳號、年月狀態、點日期與換月要呼叫誰」
function calLineBody(cfg){
  const {accts, acc, ym, emptyHTML, dayOpen, setAcct, move, targetTip} = cfg;
  if(!accts.length) return emptyHTML;
  const [y,m]=ym;
  const first=new Date(y,m,1), startDow=first.getDay(), days=new Date(y,m+1,0).getDate();
  const d10=new Date(today+"T00:00:00"); d10.setDate(d10.getDate()+10); const d10s=d10.toISOString().slice(0,10);
  let cells="";
  for(let i=0;i<startDow;i++) cells+=`<div class="day out"></div>`;
  for(let d=1;d<=days;d++){
    const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const isToday=ds===today; const tmk=isToday?`<span class="todaymk">${T("今天","Today")}</span>`:"";
    const within10=ds>=today && ds<=d10s;
    const b=cfg.dayBreak(ds,acc); const filled=b.full; const empty=(b.total||0)===0;
    const cls=filled?"filled":(empty?"empty":(within10?"bad urgent":"blank"));
    cells+=`<div class="day ${cls} ${isToday?'today':''}" onclick="${dayOpen(ds)}">
      ${tmk}<div class="dnum">${d}</div>
      <div class="big">${b.total||"·"}<span style="font-size:14px;color:var(--muted);font-weight:600">${b.target?("/"+b.target):""}</span></div>
      ${filled?`<div class="pmk" style="color:var(--green)">${T("已排滿","Full")}</div>`:(empty?`<div class="pmk" style="color:${within10?'#F0A89E':'#C9BFB4'}">${T("未排","None")}${within10?T('（近期）',' (soon)'):''}</div>`:`<div class="pmk" style="color:var(--red)">${T("缺","Need ")}${b.short}</div>`)}
    </div>`;
  }
  const acctSel=`<select onchange="${setAcct}" style="font-size:13px;padding:6px 10px">${accts.map(a=>`<option ${a===acc?'selected':''}>${esc(a)}</option>`).join("")}</select>`;
  return `
  <div class="card">
    <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px"><b>${T("帳號","Account")}</b> ${acctSel} <span class="muted" style="font-size:12px">${targetTip}</span></div>
    <div class="calhead">
      <button class="calnav" onclick="${move(-1)}" title="${T("上月","Previous month")}">‹</button>
      <div class="calmonth">${currentRole()==="intl"?`${MONTHS_EN[m]} ${y}`:`${y} <span>年</span> ${m+1} <span>月</span>`}</div>
      <button class="calnav" onclick="${move(1)}" title="${T("下月","Next month")}">›</button>
    </div>
    <div class="cal">
      ${(currentRole()==="intl"?["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]:["日","一","二","三","四","五","六"]).map(x=>`<div class="dow">${x}</div>`).join("")}
      ${cells}
    </div>
    <div class="callegend"><span><i class="lg-g"></i>${T("已排滿","Full")}</span><span><i class="lg-r"></i>${T("待補","Behind")}</span><span><i class="lg-b"></i>${T("未排","None")}</span><span><i class="lg-t"></i>${T("今天","Today")}</span></div>
  </div>`;
}
// 海外月曆內容體（依語言：en／th 各自的 TikTok 帳號）：月排程 hub 用
function calIntlBody(loc){
  loc=INTL_LOCALES.includes(loc)?loc:"en";
  const accts=intlAccountsFor(loc).map(a=>a.name);
  if(!INTL_ACCT || !accts.includes(INTL_ACCT)) INTL_ACCT=accts[0]||"";   // 目前帳號要屬於這個語言
  if(!INTL_CAL_YM){ const t=new Date(); INTL_CAL_YM=[t.getFullYear(), t.getMonth()]; }
  return calLineBody({ accts, acc:INTL_ACCT, ym:INTL_CAL_YM,
    emptyHTML:`<div class="card"><p class="muted" style="padding:18px 4px">${T("這個語言還沒有 TikTok 帳號。請管理員到「設定 → 海外設定」新增（格式 "+loc+"=帳號名）。","No "+loc.toUpperCase()+" TikTok accounts yet. Ask the admin to add them in Settings → Overseas.")}</p></div>`,
    dayBreak:(ds,acc)=>intlDayBreak(ds,acc),
    dayOpen:(ds)=>`openDayIntl('${ds}')`,
    setAcct:`intlSetAcct(this.value)`,
    move:(n)=>`calMoveIntl(${n})`,
    targetTip:`${intlDailyTarget()} ${T("支／帳號／天","per account / day")}` });
}
function openDayIntl(ds){
  const acc=intlCurAcct(); const b=intlDayBreak(ds,acc); const list=intlDayList(ds,acc);
  const rows=list.map(v=>{ const done=(v.published||v.stage==="已完成"); const s=srcOf(v);
    return `<tr>
      <td data-label="${T("影片","Video")}"><a href="javascript:void(0)" onclick="openIntlModal('${v.id}')">${esc(stripHash(v.name)||(s?stripHash(s.nameEn||s.name||s.rawName):"")||T("(未命名)","(untitled)"))}</a>
        <span class="pill" style="font-size:10px;background:var(--accent);color:#fff;margin-left:5px">${localeShort(v.locale)}</span></td>
      <td data-label="${T("狀態","Status")}"><span class="pill ${done&&dispStage(v)!=='待審核'?'ok':(v.stage==='剪輯中'||dispStage(v)==='待審核'?'wa':'')}" style="font-size:10px">${dispStage(v)==='待審核'?T('待審核','In review'):done?T('已完成','Done'):(v.stage==='剪輯中'?T('製作中','In progress'):T('待處理','To do'))}</span></td>
      <td data-label="${T("剪輯","Editor")}">${esc(v.editor||v.claimedBy||"")||'<span class="muted">—</span>'}</td>
      <td data-label="${T("上傳連結","Upload")}">${v.publishedLink?`<a href="${esc(v.publishedLink)}" target="_blank">${T("開啟","Link")}</a>`:'<span class="muted">—</span>'}</td>
      <td data-label="${T("改期","Move to")}"><input type="date" value="${ds}" style="font-size:12px;padding:4px;min-width:128px" onchange="intlReschedule('${v.id}',this.value,'${ds}')"></td>
      <td data-label="${T("操作","Action")}"><button class="btn sec sm" style="white-space:nowrap" onclick="intlUnschedule('${v.id}','${ds}')" title="${T("只移出這天，影片本身不會刪除","Remove from this day only — the video itself stays")}">${T("移出排程","Unschedule")}</button></td></tr>`;
  }).join("");
  const wd=(currentRole()==="intl"?["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(ds+"T00:00:00").getDay()]:"日一二三四五六"[new Date(ds+"T00:00:00").getDay()]);
  document.getElementById("modalRoot").innerHTML=`<div class="modal" onclick="modalBackdrop(event)"><div class="box" onclick="event.stopPropagation()">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h3 style="margin:0">${esc(ds)} (${wd}) · ${esc(acc)}</h3>
      <button class="btn sec sm" onclick="closeModal()">×</button></div>
    <div class="muted" style="margin-bottom:8px">${T("已排","Scheduled")} ${b.total}/${b.target}${b.short?T(`（缺 ${b.short}）`,` (need ${b.short})`):T('・已排滿',' · Full')}</div>
    ${list.length?`<table class="responsive"><thead><tr><th>${T("影片","Video")}</th><th>${T("狀態","Status")}</th><th>${T("剪輯","Editor")}</th><th>${T("上傳連結","Upload")}</th><th>${T("改期","Move to")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`:`<div class="emptyState"><span class="es-mk">✦</span>${T("這天這個帳號還沒有排片。到版本的編輯視窗填「預排上片日期」就會出現在這裡。","Nothing scheduled for this account on this day — set the scheduled upload date in a version's edit window.")}</div>`}
  </div></div>`;
}
// 海外排程調整（比照中文版月曆）：改上片日／移出這一天 — 只動排程日期，影片本身不動
function intlReschedule(id,nd,ds){ if(nd===ds) return; lineReschedule(id, nd, T("已改期至 ","Moved to ")+nd, ()=>openDayIntl(ds)); }
function intlUnschedule(id,ds){ lineUnschedule(id,
  T("把這支移出 "+ds+"？只是移出這天，影片本身不會刪除。","Remove from "+ds+"? Only the schedule changes — the video itself stays."),
  T("已移出排程","Removed from this day"), ()=>openDayIntl(ds)); }

// ---- 從 Library 的帳號選單建立版本：value = 帳號在 intlAccounts() 的索引 ----
function createLocalFromAcct(sourceId, idx){ const a=intlAccounts()[+idx]; if(!a){ toast(T("請先選擇帳號","Pick an account"),true); return; }
  createLocalVersion(sourceId, a.locale, a.name); }
// ---- 建立在地化版本（衍生影片，指派給自己；語言＋帳號帶入；同源片同語言同帳號不重複）----
function createLocalVersion(sourceId, locale, account){
  locale=locale||"en";
  if(!INTL_LOCALES.includes(locale)){ toast(T("未知的語言","Unknown language"),true); return; }
  createLineVersion(locale, sourceId, account, {
    notFound:T("找不到源片","Source not found"),
    notPublished:T("只有已完成上片的影片可以做二創","Only finished videos can be localized"),
    dup:(a)=>T("「"+a+"」的"+localeName(locale)+"版本已存在",localeName(locale)+" version for “"+a+"” already exists"),
    // 英文版：建立時帶入源片的英文片名（去掉 # 標籤）當標題草稿；泰文由剪輯用 文A 自行翻譯
    draftName:(s)=> locale==="en" ? stripHash(s.nameEn||"") : "",
    ok:(a)=>localeName(locale)+(a?(" · "+a):"")+T(" 版本已加入待處理"," added to the pool") });
}
// 從 Library 的帳號下拉＋按鈕確認建立（避免誤觸馬上跳走）
function createLocalPick(sourceId){ const sel=document.getElementById('addacct_'+sourceId); const idx=sel?sel.value:'';
  if(idx===''){ toast(T("請先選擇帳號","Pick an account first"),true); return; } createLocalFromAcct(sourceId, idx); }
function intlUnclaim(id){ lineUnclaim(id, T("退回這支版本，重新排隊給大家選？","Return this version to the shared pool?"), T("已退回待處理","Returned to the pool")); }
// 退回資料庫：只移除 To do 裡「還沒開始做」的版本殼（無任何內容），源片立即回到 Library 可重選。
// 不動源片、不進回收桶 — 海外版全是二創，絕不能刪到原始檔。
function intlDiscard(id){ const v0=vid(id)||{}; const k=INTL_LOCALES.includes(v0.locale)?v0.locale:"";   // 只放行海外（英/泰）殼
  const title=(v)=>{ const s=srcOf(v); return stripHash(v.name)||stripHash(s?(s.nameEn||s.name||s.rawName):"")||v.rawName||T("這支版本","this version"); };
  lineDiscard(k, id, { notAllowed:T("只有還沒開始的項目可以退回","Only unstarted To-do items can be returned"),
    ask:(v)=>T(`把「${title(v)}」退回資料庫？\n不會刪除任何影片，源片會回到清單可以重選。`,`Return "${title(v)}" to the library?\nNothing is deleted — the original video stays and can be picked again.`),
    ok:(v)=>T(`已退回資料庫：「${title(v)}」（沒有刪除任何影片）`,`Returned to the library: "${title(v)}" — no video was deleted`) }); }

// ---- 在地化版本編輯視窗（全英文；語言隨版本）----
// 完成不強制先填上傳連結：實務上是先排日期、到日子上傳後才有連結，之後再回來補
function intlFinish(id){ const v=vid(id)||{}; const t=v.name||v.rawName||T("這支影片","this video");
  lineFinish(id, T(`「${t}」剪好了？\n完成後進入「待審核」，等 Regina 審過再上傳＋補連結。`,
    `Done cutting "${t}"?\nIt moves to In review — upload & add links after Regina approves.`),
    T("已完成，移到影片庫","Done — moved to the library"));
}
async function intlSaveVideo(id){
  const video={ name:val("i_name").trim(), videoCopy:val("i_vcopy").trim(),
    driveFolder:val("i_drive").trim(), publishedLink:val("i_pub").trim(), scheduledDate:val("i_date")||null };
  if(document.getElementById("i_acct")) video.account=val("i_acct");
  return await write("PUT",`/api/videos/${id}`,{video},T("已儲存","Saved"));
}
function openIntlModal(id){
  const v=vid(id)||{}; const s=srcOf(v)||{};
  const tl=LOCALE_GT[v.locale]||"en"; const lname=localeName(v.locale);
  const lnameT=T(({en:"英文",th:"泰文"})[v.locale]||lname, lname);   // 顯示用語言名（中文介面給中文）
  const srcTitle=stripHash(s.nameEn||s.name||s.rawName||"");
  const srcCopy=s.videoCopyEn||s.videoCopy||"";
  // nameEn/videoCopyEn 只是「英文」；非英文語系(泰/馬)一律提供翻譯到自己語言的按鈕
  const needTitleTr=(v.locale!=="en")||!s.nameEn;
  const needScriptTr=!!s.videoCopy && ((v.locale!=="en")||!s.videoCopyEn);
  // 商品價格即時從源片換算（唯讀，不能改；源片改價這裡自動跟著變）
  const prod=productPriceLine(s.products, v.locale);
  const head=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 14px">
      <h3 style="margin:0">${T(esc(lnameT)+"版本",esc(lname)+" version")} <span class="muted" style="font-size:12px;font-weight:400">${esc(vidCode(s)||"")}</span></h3>
      <button class="btn sec sm" type="button" onclick="closeModal()" title="${T("關閉","Close")}">×</button></div>`;
  const warn=[!s.rawLink?T('毛片','raw footage'):'', !(s.driveFolder||s.publishedLink)?T('中文成片','finished Chinese version'):''].filter(Boolean).join(T(' 和 ',' & '));
  // 翻譯小圖示：放在標題/文案旁邊，點了翻成剪輯自己的語言
  const trIcon=(text)=>`<a class="tricon" href="${gtranslate(text,tl)}" target="_blank" title="${T("翻譯成"+esc(lnameT),"Translate to "+esc(lname))}">文<span>A</span></a>`;
  const sourceCard=`<div class="card" style="background:var(--panel2)">
    <div class="muted" style="font-size:11px;letter-spacing:.12em;text-transform:uppercase">${T("來源・台灣","Source · Taiwan")}</div>
    <div style="font-weight:700;font-size:15px;margin-top:4px">${esc(srcTitle||T("(未命名)","(untitled)"))}${needTitleTr?trIcon(s.name||s.rawName):''}</div>
    ${srcCopy?`<div class="muted" style="font-size:13px;margin-top:8px;white-space:pre-wrap;max-height:110px;overflow:auto;line-height:1.6">${esc(srcCopy)}${needScriptTr?trIcon(s.videoCopy):''}</div>`:''}
    <div class="icallout">
      <div style="font-weight:700;margin-bottom:6px">${T("怎麼做這支"+esc(lnameT)+"版本","How to make this "+esc(lname)+" version")}</div>
      <div style="font-size:13px;line-height:1.75">
        ${T(`<b>1.</b> 先看我們的中文成片 — 學它的節奏跟鉤子。<br><b>2.</b> 用<b>毛片</b>（不是中文成片）重剪出你的${esc(lnameT)}版本，同一套邏輯。`,
            `<b>1.</b> Watch our finished Chinese version — learn its pacing & hooks.<br><b>2.</b> Re-cut your own ${esc(lname)} version <b>from the raw footage</b> (not the Chinese cut), same logic.`)}
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px">
        ${(s.publishedLink||s.driveFolder)?`<button class="btn sec sm" type="button" onclick="openVidPreview('${encodeURIComponent(s.publishedLink||s.driveFolder)}')">▶ ${T("看中文成片","Watch Chinese")}</button>`:''}
        ${s.driveFolder?`<a class="btn sec sm" href="${esc(s.driveFolder)}" target="_blank">⬇ ${T("下載成片","Download original file")}</a>`:''}
        ${s.rawLink?`<a class="btn sm" href="${esc(s.rawLink)}" target="_blank">⬇ ${T("下載毛片","Download raw footage")}</a>`:''}
      </div>
      ${warn?`<div style="color:var(--red);font-size:11px;margin-top:10px">⚠ ${T("缺少"+warn+"連結 — 請管理員補上。","No "+warn+" linked — ask the admin to add it.")}</div>`:''}
    </div>
  </div>`;
  const body=`
    ${sourceCard}
    <div style="font-weight:700;font-size:15px;margin:16px 0 2px">${T("你的"+esc(lnameT)+"版本","Your "+esc(lname)+" version")}</div>
    ${v.account?`<label>${T("帳號","Account")}</label><div style="padding:6px 0 2px;font-weight:600">${esc(v.account)} <span class="muted" style="font-weight:400;font-size:12px">· ${esc(localeShort(v.locale))} TikTok</span></div>`:''}
    <label>${T("標題（貼文文案）","Title (post caption)")}</label><input id="i_name" value="${esc(v.name||(v.locale==="en"?stripHash(s.nameEn||""):""))}" placeholder="${T(esc(lnameT)+"標題／貼文",esc(lname)+" title / caption")}">
    <div class="muted" style="font-size:12px;margin:8px 0 0">${T("商品","Products")}: ${prod}${s.productUrl?` · <a href="${esc(s.productUrl)}" target="_blank">🛍 ${T("商品頁","page")}</a>`:''}</div>
    <label>${T("文案（口播台詞）","Script / copy")}</label><textarea id="i_vcopy" style="min-height:80px" placeholder="${T("翻譯／改編的文案","Translated / adapted script")}">${esc(v.videoCopy||"")}</textarea>
    <div class="grid cols2">
      <div><label>${T("成片檔案連結（你重剪的）","Video file URL (your re-cut)")}</label><input id="i_drive" value="${esc(v.driveFolder||"")}" placeholder="${T("你剪好的"+esc(localeShort(v.locale))+"版雲端連結","Cloud link to your "+esc(localeShort(v.locale))+" cut")}"></div>
      <div><label>${T("上傳連結（TikTok 貼文）","Upload URL (the TikTok post)")}</label><input id="i_pub" value="${esc(v.publishedLink||"")}" placeholder="https://www.tiktok.com/@.../video/..."></div>
    </div>
    <label>${T("預排上片日期","Scheduled upload date (when it will go live)")}</label>
    <div class="dateField"><span class="dateIco">🗓</span><input id="i_date" type="date" value="${esc(v.scheduledDate||"")}"></div>
`;
  const foot=`<div class="modalFoot">
      <button class="btn sec" type="button" onclick="closeModal()">${T("取消","Cancel")}</button>
      <button class="btn" type="button" onclick="intlSaveVideo('${id}').then(function(ok){if(ok)closeModal();})">${T("儲存","Save")}</button></div>`;
  MODAL_DIRTY=false;
  document.getElementById("modalRoot").innerHTML=`<div class="modal" onclick="modalBackdrop(event)"><div class="box" onclick="event.stopPropagation()">${head}${body}${reviewCardHTML(v)}${foot}</div></div>`;
}

// ===================================================================
// 台灣區「換平台二創」通用模組：蝦皮(shopee)＋馬來西亞(ms) 共用同一套流程——
// 同一支已上傳中文舊片，換一個平台重新剪一次上傳。掛在既有「剪輯」角色下
// （不開新角色/新登入；任何國內剪輯登入都看得到，比照海外的帳號＋每日目標模式）
// ===================================================================
const CHANNELS={
  shopee:{ label:"蝦皮", labelEn:"Shopee", short:"蝦", shortEn:"SP", pfx:"shp", zoneName:"影片蝦皮二創區", calName:"蝦皮排程", verName:"蝦皮版本", verNameEn:"Shopee version",
    setName:"蝦皮設定", acctKey:"shopeeAccounts", targetKey:"shopeeDailyTarget", priceKey:"shopee",
    upLabel:"上傳連結（蝦皮貼文）", upPh:"https://shopee.tw/...", srcBadge:"🛍️", gt:"" },
  ms:{ label:"馬來", labelEn:"Malay", short:"馬", shortEn:"MY", pfx:"mys", zoneName:"影片馬來二創區", calName:"馬來排程", verName:"馬來版本", verNameEn:"Malay version",
    setName:"馬來設定", acctKey:"msAccounts", targetKey:"msDailyTarget", priceKey:"ms",
    upLabel:"上傳連結（TikTok 貼文）", upPh:"https://www.tiktok.com/@.../video/...", srcBadge:"🇲🇾", gt:"ms" },   // 馬來版要翻成馬來文 → 文A
};
function chAccounts(ch){ return lineAccounts(ch); }
function chDailyTarget(ch){ return lineTarget(ch); }
// 來源片池：跟海外共用「已完整上傳的中文舊片」定義，互相排除彼此的衍生版本
function chSourcePool(){ return lineSourcePool(); }
function chVersionsOfSrc(ch, sourceId){ return lineVersionsOfSrc(ch, sourceId); }

// ---- 建立版本（衍生影片，指派給自己；帳號帶入；同源片同帳號不重複）----
function createChVersion(ch, sourceId, account){
  const C=CHANNELS[ch]; if(!C){ toast("未知的平台",true); return; }
  createLineVersion(ch, sourceId, account, {
    notFound:"找不到源片",
    notPublished:T("只有已完成上片的影片可以做"+C.verName,"Only fully-published videos can be localized"),
    dup:(a)=>T("「"+a+"」的"+C.verName+"已存在",C.verNameEn+" for "+a+" already exists"),
    ok:(a)=>T((a?("「"+a+"」"):"")+C.verName+"已加入待處理",C.verNameEn+(a?(" ("+a+")"):"")+" added to the pool") });
}
// 從清單的帳號下拉＋按鈕確認建立（避免誤觸馬上跳走）
function createChPick(ch, sourceId){ const sel=document.getElementById(CHANNELS[ch].pfx+'acct_'+sourceId); const acct=sel?sel.value:'';
  if(!acct){ toast(T("請先選擇"+CHANNELS[ch].label+"帳號","Pick a "+CHANNELS[ch].labelEn+" account first"),true); return; } createChVersion(ch, sourceId, acct); }

function chUnclaim(ch,id){ lineUnclaim(id, T("退回這支"+CHANNELS[ch].verName+"，重新排隊給大家選？","Return this "+CHANNELS[ch].verNameEn+" to the shared pool?"), T("已退回待處理","Returned to the pool")); }
// 完成不強制先填上傳連結：先排日期、到日子上傳後再回來補連結
function chFinish(ch,id){ const C=CHANNELS[ch]; const v=vid(id)||{};
  lineFinish(id, T(`「${(v.name||v.rawName||"這支"+C.verName)}」剪好了？\n完成後進入「待審核」，等 Regina 審過再上傳＋補連結。`,
    `Done cutting "${(v.name||v.rawName||"this "+C.verNameEn)}"?\nIt moves to In review — upload & add links after Regina approves.`),
    T("已完成","Done"));
}
// 退回資料庫：只移除「還沒開始做」的版本殼，不動源片、不進回收桶
function chDiscard(ch,id){ const C=CHANNELS[ch];
  const title=(v)=>v.name||v.rawName||T("這支"+C.verName,"this "+C.verNameEn);
  lineDiscard(ch, id, { notAllowed:T("只有還沒開始的項目可以退回","Only unstarted items can be returned"),
    ask:(v)=>T(`把「${title(v)}」退回資料庫？\n不會刪除任何影片，源片會回到清單可以重選。`,`Return "${title(v)}" to the library?\nNothing is deleted — the original stays and can be picked again.`),
    ok:(v)=>T(`已退回資料庫：「${title(v)}」（沒有刪除任何影片）`,`Returned to the library: "${title(v)}" (nothing deleted)`) });
}
async function chSaveVideo(ch,id){ const p=CHANNELS[ch].pfx;
  const video={ name:val(p+"_name").trim(), videoCopy:val(p+"_vcopy").trim(),
    driveFolder:val(p+"_drive").trim(), publishedLink:val(p+"_pub").trim(), scheduledDate:val(p+"_date")||null };
  return await write("PUT",`/api/videos/${id}`,{video},T("已儲存","Saved"));
}
function openChModal(ch,id){
  const C=CHANNELS[ch]; const p=C.pfx;
  const v=vid(id)||{}; const s=srcOf(v)||{};
  // 商品價格即時從源片取得（唯讀，不能改）：蝦皮＝台幣×加乘；馬來＝MYR 匯率×加乘
  const prod=productPriceLine(s.products, C.priceKey);
  // 馬來版要翻成馬來文 → 標題/文案旁給 文A 翻譯小圖示
  const trIcon=(text)=> C.gt?`<a class="tricon" href="${gtranslate(text,C.gt)}" target="_blank" title="${T("翻譯成"+C.label+"文","Translate to "+C.labelEn)}">文<span>A</span></a>`:'';
  const head=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 14px">
      <h3 style="margin:0">${T(C.verName,C.verNameEn)} <span class="muted" style="font-size:12px;font-weight:400">${esc(vidCode(s)||"")}</span></h3>
      <button class="btn sec sm" type="button" onclick="closeModal()" title="${T("關閉","Close")}">×</button></div>`;
  const warn=[!s.rawLink?T('毛片','raw footage'):'', !(s.driveFolder||s.publishedLink)?T('中文完成片','finished cut'):''].filter(Boolean).join(T('、',' & '));
  const sourceCard=`<div class="card" style="background:var(--panel2)">
    <div class="muted" style="font-size:11px;letter-spacing:.12em;text-transform:uppercase">${T("來源 · 中文版","Source · Original")}</div>
    <div style="font-weight:700;font-size:15px;margin-top:4px">${esc(stripHash(s.name||s.rawName||"")||T("(未命名)","(untitled)"))}${trIcon(s.name||s.rawName)}</div>
    ${s.videoCopy?`<div class="muted" style="font-size:13px;margin-top:8px;white-space:pre-wrap;max-height:110px;overflow:auto;line-height:1.6">${esc(s.videoCopy)}${trIcon(s.videoCopy)}</div>`:''}
    <div class="icallout">
      <div style="font-weight:700;margin-bottom:6px">${T("怎麼剪這支"+C.verName,"How to make this "+C.verNameEn)}</div>
      <div style="font-size:13px;line-height:1.75">
        <b>1.</b> ${T("先看過中文完成片，抓一下節奏跟賣點。","Watch the finished original — learn its pacing & hooks.")}<br>
        <b>2.</b> ${T("用<b>毛片</b>（不是中文成片）重新剪成"+C.verName+"，符合"+C.label+"平台的規格。","Re-cut from the <b>raw footage</b> (not the finished cut) to fit "+C.labelEn+".")}
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px">
        ${(s.publishedLink||s.driveFolder)?`<button class="btn sec sm" type="button" onclick="openVidPreview('${encodeURIComponent(s.publishedLink||s.driveFolder)}')">▶ ${T("看中文成片","Watch original")}</button>`:''}
        ${s.driveFolder?`<a class="btn sec sm" href="${esc(s.driveFolder)}" target="_blank">⬇ ${T("下載完成片存檔","Download finished cut")}</a>`:''}
        ${s.rawLink?`<a class="btn sm" href="${esc(s.rawLink)}" target="_blank">⬇ ${T("下載毛片","Download raw footage")}</a>`:''}
      </div>
      ${warn?`<div style="color:var(--red);font-size:11px;margin-top:10px">⚠ ${T("缺"+warn+"連結，請請管理員補上。","No "+warn+" linked — ask the admin to add it.")}</div>`:''}
    </div>
  </div>`;
  const body=`
    ${sourceCard}
    <div style="font-weight:700;font-size:15px;margin:16px 0 2px">${T("你的"+C.verName,"Your "+C.verNameEn)}</div>
    ${v.account?`<label>${T("帳號","Account")}</label><div style="padding:6px 0 2px;font-weight:600">${esc(v.account)}</div>`:''}
    <label>${T("片名／貼文標題","Title (post caption)")}</label><input id="${p}_name" value="${esc(v.name||"")}" placeholder="${T(C.verName+"標題"+(C.gt?`（${C.label}文）`:''),C.verNameEn+" title")}">
    <div class="muted" style="font-size:12px;margin:8px 0 0">${T("商品","Products")}：${prod}${s.productUrl?` · <a href="${esc(s.productUrl)}" target="_blank">🛍 ${T("商品頁","page")}</a>`:''}</div>
    <label>${T("文案","Script / copy")}</label><textarea id="${p}_vcopy" style="min-height:80px" placeholder="${T(C.verName+"文案（可跟中文版不同）","Adapted script")}">${esc(v.videoCopy||"")}</textarea>
    <div class="grid cols2">
      <div><label>${T("影片檔存檔網址（你剪好的檔案）","Video file URL (your re-cut)")}</label><input id="${p}_drive" value="${esc(v.driveFolder||"")}" placeholder="${T("雲端連結","Cloud link")}"></div>
      <div><label>${T(C.upLabel,"Upload URL")}</label><input id="${p}_pub" value="${esc(v.publishedLink||"")}" placeholder="${C.upPh}"></div>
    </div>
    <label>${T("預排上片日期","Scheduled upload date")}</label>
    <div class="dateField"><span class="dateIco">🗓</span><input id="${p}_date" type="date" value="${esc(v.scheduledDate||"")}"></div>
`;
  const foot=`<div class="modalFoot">
      <button class="btn sec" type="button" onclick="closeModal()">${T("取消","Cancel")}</button>
      <button class="btn" type="button" onclick="chSaveVideo('${ch}','${id}').then(function(ok){if(ok)closeModal();})">${T("儲存","Save")}</button></div>`;
  MODAL_DIRTY=false;
  document.getElementById("modalRoot").innerHTML=`<div class="modal" onclick="modalBackdrop(event)"><div class="box" onclick="event.stopPropagation()">${head}${body}${reviewCardHTML(v)}${foot}</div></div>`;
}

// ---- 二創區頁（可製作清單 ＋ 我的工作，合併一頁；比照上班計畫風格）----
let CH_Q={shopee:"",ms:""};   // 搜尋字存全域：資料同步重繪時還原
function chLibRows(ch){
  const C=CHANNELS[ch];
  const q=String(CH_Q[ch]||'').toLowerCase().trim();
  let src=chSourcePool();
  if(q) src=src.filter(v=>[v.name,v.rawName,v.code].map(x=>String(x||'').toLowerCase()).join("  ").includes(q));
  src.sort((a,b)=>String(b.updatedAt||b.finishedAt||"").localeCompare(String(a.updatedAt||a.finishedAt||"")));
  if(!src.length) return `<div class="emptyState"><span class="es-mk">✦</span>${T("目前沒有可製作"+C.verName+"的影片（要是完整已上傳的舊片）。","No videos available yet — they must be fully published.")}</div>`;
  const accts=chAccounts(ch);
  return src.slice(0,200).map(v=>{
    const zhTitle=stripHash(v.name||v.rawName)||"(未命名)";
    const kidsAll=chVersionsOfSrc(ch, v.id);
    const nArch=kidsAll.filter(isArchived).length;                 // 已上片＝完成任務，封存不再列出
    const kids=kidsAll.filter(k=>!isArchived(k));
    const chips=kids.map(k=>{ const ds=dispStage(k); const done=(k.published||k.stage==='已完成')&&ds!=='待審核';
      return `<span class="pill ${done?'ok':'wa'}" style="cursor:pointer;font-size:11px" onclick="openChModal('${ch}','${k.id}')" title="${esc(k.account||'')}${k.editor?(' · '+esc(k.editor)):''}${k.createdBy?(' · '+T('由 '+esc(k.createdBy)+' 建立','added by '+esc(k.createdBy))):''}">${esc(k.account||C.label)} · ${ds==='待審核'?T('待審','in review'):done?T('完成','done'):(k.stage==='剪輯中'?T('製作中','in progress'):T('待處理','to do'))}</span>`;
    }).join(" ") + (nArch?`<span class="pill" style="font-size:11px;background:transparent;border:1px solid var(--line);color:var(--muted)" title="${T("已上片、已封存","Published & archived")}">${T("已封存","Archived")} ${nArch}</span>`:'');
    const previewBtn=(v.publishedLink||v.driveFolder)?`<button class="btn sec sm ibtn" onclick="openVidPreview('${encodeURIComponent(v.publishedLink||v.driveFolder)}')" title="${T("預覽成片","Preview the finished cut")}">▶</button>`:'';
    // 只有一個帳號時不用選，按一下直接加入（少一個步驟）；有多個帳號才需要選單
    const addRow = accts.length>1
      ? `<div class="row" style="gap:6px;align-items:center;width:100%;flex-wrap:nowrap">
          ${previewBtn}
          <select id="${C.pfx}acct_${v.id}" style="font-size:13px;padding:7px 8px;flex:1;min-width:0">
            <option value="">＋ ${T("加"+C.verName+" — 選帳號","Add "+C.verNameEn+" — pick account")}</option>
            ${accts.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join("")}
          </select>
          <button class="btn sm" style="flex:none" onclick="createChPick('${ch}','${v.id}')">＋ ${T("加入","Add")}</button>
        </div>`
      : accts.length===1
        ? `<div class="row" style="gap:6px;align-items:center;width:100%">${previewBtn}<button class="btn sm" style="flex:1" onclick="createChVersion('${ch}','${v.id}','${esc(jsEsc(accts[0]))}')">＋ ${T("加"+C.verName,"Add "+C.verNameEn)}</button></div>`
        : `<div class="row" style="gap:6px;align-items:center;width:100%">${previewBtn}<span class="muted" style="font-size:12px">${T("請管理員先到設定新增"+C.label+"帳號","Ask the admin to add "+C.labelEn+" accounts in Settings")}</span></div>`;
    const prodChips=(v.products||[]).filter(p=>p&&p.name).map(p=>`<span class="tag">${esc(p.name)}</span>`).join(" ");
    return `<div class="ilib-card">
      <div style="min-width:0;flex:1">
        <div class="ilib-zh">${esc(zhTitle)} <span class="ilib-code">${esc(vidCode(v))}</span></div>
        ${prodChips?`<div class="ilib-meta">${prodChips}</div>`:''}
        ${chips?`<div class="ilib-meta">${chips}</div>`:''}
      </div>
      <div class="ilib-actions">
        ${addRow}
      </div>
    </div>`;
  }).join("");
}
function chFilter(ch){ const el=document.getElementById(CHANNELS[ch].pfx+'_list'); if(el) el.innerHTML=chLibRows(ch); }
// ---- 排程（月曆）：依帳號看每天排幾支，目標＝每帳號 chDailyTarget（預設 2）----
let CH_CAL={shopee:{ym:null,acct:""},ms:{ym:null,acct:""}};
function chCurAcct(ch){ const list=chAccounts(ch); if(!list.length) return ""; const st=CH_CAL[ch]; if(!st.acct || !list.includes(st.acct)){ st.acct=list[0]; } return st.acct; }
function chSetAcct(ch,name){ CH_CAL[ch].acct=name||""; render(); }
function calMoveCh(ch,n){ const st=CH_CAL[ch]; let [y,m]=st.ym; m+=n; if(m<0){m=11;y--;} if(m>11){m=0;y++;} st.ym=[y,m]; render(); }
function chDayList(ch, date, acct){ return lineDayList(ch, date, acct!=null?acct:chCurAcct(ch)); }
function chDayBreak(ch, date, acct){ return lineDayBreak(ch, date, acct!=null?acct:chCurAcct(ch)); }
// 平台月曆內容體：月排程 hub 共用
function calChBody(ch){
  const C=CHANNELS[ch]; const accts=chAccounts(ch); const st=CH_CAL[ch];
  if(!st.ym){ const t=new Date(); st.ym=[t.getFullYear(), t.getMonth()]; }
  return calLineBody({ accts, acc:chCurAcct(ch), ym:st.ym,
    emptyHTML:`<div class="card"><p class="muted" style="padding:18px 4px">${T("還沒有"+C.label+"帳號。請管理員到「設定 → "+C.setName+"」新增，之後就能依帳號排程。","No "+C.labelEn+" accounts yet. Ask the admin to add them in Settings.")}</p></div>`,
    dayBreak:(ds,acc)=>chDayBreak(ch,ds,acc),
    dayOpen:(ds)=>`openDayCh('${ch}','${ds}')`,
    setAcct:`chSetAcct('${ch}',this.value)`,
    move:(n)=>`calMoveCh('${ch}',${n})`,
    targetTip:`${T("每帳號每天","per account / day:")} ${chDailyTarget(ch)} ${T("支","")}` });
}
function openDayCh(ch,ds){
  const C=CHANNELS[ch];
  const acc=chCurAcct(ch); const b=chDayBreak(ch,ds,acc); const list=chDayList(ch,ds,acc);
  const rows=list.map(v=>{ const done=(v.published||v.stage==="已完成"); const s=srcOf(v);
    return `<tr>
      <td data-label="${T("影片","Video")}"><a href="javascript:void(0)" onclick="openChModal('${ch}','${v.id}')">${esc(stripHash(v.name)||(s?stripHash(s.name||s.rawName):"")||T("(未命名)","(untitled)"))}</a></td>
      <td data-label="${T("狀態","Status")}"><span class="pill ${done&&dispStage(v)!=='待審核'?'ok':(v.stage==='剪輯中'||dispStage(v)==='待審核'?'wa':'')}" style="font-size:10px">${dispStage(v)==='待審核'?T('待審核','In review'):done?T('已完成','Done'):(v.stage==='剪輯中'?T('製作中','In progress'):T('待處理','To do'))}</span></td>
      <td data-label="${T("剪輯","Editor")}">${esc(v.editor||v.claimedBy||"")||'<span class="muted">—</span>'}</td>
      <td data-label="${T("上傳連結","Upload")}">${v.publishedLink?`<a href="${esc(v.publishedLink)}" target="_blank">${T("開啟","Open")}</a>`:'<span class="muted">—</span>'}</td>
      <td data-label="${T("改期","Move to")}"><input type="date" value="${ds}" style="font-size:12px;padding:4px;min-width:128px" onchange="chReschedule('${ch}','${v.id}',this.value,'${ds}')"></td>
      <td data-label="${T("操作","Action")}"><button class="btn sec sm" style="white-space:nowrap" onclick="chUnschedule('${ch}','${v.id}','${ds}')" title="${T("只移出這天，影片本身不會刪除","Removes from this day only")}">${T("移出排程","Unschedule")}</button></td></tr>`;
  }).join("");
  const wd=(currentRole()==="intl"?["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(ds+"T00:00:00").getDay()]:"日一二三四五六"[new Date(ds+"T00:00:00").getDay()]);
  document.getElementById("modalRoot").innerHTML=`<div class="modal" onclick="modalBackdrop(event)"><div class="box" onclick="event.stopPropagation()">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h3 style="margin:0">${esc(ds)}（${wd}）· ${esc(acc)}</h3>
      <button class="btn sec sm" onclick="closeModal()">×</button></div>
    <div class="muted" style="margin-bottom:8px">${T("已排","Scheduled")} ${b.total}/${b.target}${b.short?T(`（缺 ${b.short}）`,` (need ${b.short})`):T('・已排滿',' · Full')}</div>
    ${list.length?`<table class="responsive"><thead><tr><th>${T("影片","Video")}</th><th>${T("狀態","Status")}</th><th>${T("剪輯","Editor")}</th><th>${T("上傳連結","Upload")}</th><th>${T("改期","Move to")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`:`<div class="emptyState"><span class="es-mk">✦</span>${T("這天這個帳號還沒有排片。到版本的編輯視窗填「預排上片日期」就會出現在這裡。","Nothing scheduled for this account on this day — set the scheduled upload date in a version's edit window.")}</div>`}
  </div></div>`;
}
function chReschedule(ch,id,nd,ds){ if(nd===ds) return; lineReschedule(id, nd, T("已改期至 ","Moved to ")+nd, ()=>openDayCh(ch,ds)); }
function chUnschedule(ch,id,ds){ lineUnschedule(id,
  T("把這支移出 "+ds+"？只是移出這天，影片本身不會刪除。","Remove from "+ds+"? Only the schedule changes — the video stays."),
  T("已移出排程","Removed from schedule"), ()=>openDayCh(ch,ds)); }

// ---- 源片視窗的「○○版本」卡（誰剪的・何時完成・預排何時上片）＋ 版本回連源片 ----
function chVersionsCard(ch,v){
  const C=CHANNELS[ch];
  if(!v||!v.id) return "";
  if(v.channel===ch) return lineBackToSourceCard(v, {head:T("來源片（中文版）","Source video (Chinese)"), tail:T(C.verName,C.verNameEn)});
  if(v.channel) return "";   // 其他平台的衍生版本 → 由該平台的卡處理
  return lineVersionsCard({ kids:chVersionsOfSrc(ch,v.id), title:T(C.verName,C.verNameEn),
    hint:T("誰剪的・何時完成・預排何時上片，一起看","editor · finished date · scheduled date, at a glance"),
    cols:{lang:false, views:false} });
}
function shopeeVersionsCard(v){ return chVersionsCard("shopee",v); }
function msVersionsCard(v){ return chVersionsCard("ms",v); }
function shopeeAccounts(){ return chAccounts("shopee"); }
function msAccounts(){ return chAccounts("ms"); }

// ===================================================================
// 設定（管理員）
// ===================================================================
// 設定：海外（英/泰）TikTok 帳號與每帳號每日目標
function setIntlCard(s){
  const intlAcctStr=(Array.isArray(s.intlAccounts)?s.intlAccounts:[]).map(a=>a.locale+"="+a.name).join("\n");
  const intlTargetVal=(s.intlDailyTarget!=null&&s.intlDailyTarget!=="")?s.intlDailyTarget:2;
  return `<div class="card"><b>海外設定</b>
    <label style="margin-top:8px">海外 TikTok 帳號（一行一個，格式 <code>語言=帳號名</code>，語言用 en／th；馬來西亞已移到台灣區的「馬來設定」）</label>
    <textarea id="set_intlacct" style="min-height:96px" placeholder="en=TikTok US（@zana_us）&#10;th=TikTok TH（@zana_th）">${esc(intlAcctStr)}</textarea>
    <label style="margin-top:12px">海外每日目標（每個帳號每天幾支）</label>
    <div class="row" style="gap:8px"><input type="number" min="0" id="set_intltarget" value="${intlTargetVal}" style="max-width:120px;text-align:center">
      <span class="muted">支／帳號／天 —— 海外月歷以此判斷「已排滿／缺幾支」。</span></div>
    <div class="modalFoot"><button class="btn" onclick="saveSettings()">確認送出設定</button></div>
  </div>`;
}
// 設定：四平台商品價格換算（匯率＋售價加乘倍數）
function setRatesCard(s){
  const rateRow=(loc,label)=>{ const r=(s.exchangeRates&&s.exchangeRates[loc])||{}; const code=r.code||DEFAULT_CURRENCY[loc];
    const rate=(r.rate!=null&&r.rate!=="")?r.rate:1; const mult=(r.mult!=null&&r.mult!=="")?r.mult:1;
    return `<div><label>${label}（${code}）</label>
      <div class="row" style="gap:6px;flex-wrap:nowrap">
        ${loc==="shopee"?'<span class="muted" style="font-size:12px;flex:1">台幣，不換匯</span>':`<input type="number" min="0" step="0.001" id="set_rate_${loc}" value="${esc(rate)}" placeholder="1 台幣＝? ${code}" title="匯率：1 台幣可換多少 ${code}" style="flex:1">`}
        <span class="muted" style="flex:none">×</span>
        <input type="number" min="0" step="0.01" id="set_mult_${loc}" value="${esc(mult)}" placeholder="加乘" title="加乘倍數：該平台售價＝原價×匯率×加乘" style="flex:1">
      </div></div>`; };
  return `<div class="card"><b>商品價格換算（四個平台）</b>
    <div class="muted" style="font-size:12px;margin-top:4px">源片的商品原價／售價（寵粉價）只在台灣影片編輯畫面輸入；各平台編輯畫面依「匯率 × 加乘」即時換算顯示，唯讀不能改。加乘＝該平台的售價倍數（例 1.2＝加價 2 成），1＝不加乘；蝦皮是台幣、只有加乘。</div>
    <div class="grid cols2" style="margin-top:10px">
      ${rateRow("en","英文 匯率×加乘")}
      ${rateRow("th","泰文 匯率×加乘")}
      ${rateRow("ms","馬來 匯率×加乘")}
      ${rateRow("shopee","蝦皮 加乘")}
    </div>
    <div class="modalFoot"><button class="btn" onclick="saveSettings()">確認送出設定</button></div>
  </div>`;
}
// 設定：蝦皮／馬來西亞帳號與每帳號每日目標
function setChannelCards(s){
  const shopeeAccountStr=(Array.isArray(s.shopeeAccounts)?s.shopeeAccounts:[]).join("\n");
  const shopeeTargetVal=(s.shopeeDailyTarget!=null&&s.shopeeDailyTarget!=="")?s.shopeeDailyTarget:2;
  const msAccountStr=(Array.isArray(s.msAccounts)?s.msAccounts:[]).join("\n");
  const msTargetVal=(s.msDailyTarget!=null&&s.msDailyTarget!=="")?s.msDailyTarget:2;
  return `<div class="card"><b>蝦皮設定</b>
    <div class="muted" style="font-size:12px;margin-top:4px">國內二創：挑已上傳的中文舊片，換個平台重新剪一次上傳蝦皮（同語言、不用翻譯），掛在「剪輯」角色下，任何國內剪輯登入都看得到。</div>
    <label style="margin-top:8px">蝦皮帳號（一行一個）</label>
    <textarea id="set_shpacct" style="min-height:88px" placeholder="蝦皮官方旗艦店&#10;蝦皮XX店">${esc(shopeeAccountStr)}</textarea>
    <label style="margin-top:12px">蝦皮每日目標（每個帳號每天幾支）</label>
    <div class="row" style="gap:8px"><input type="number" min="0" id="set_shptarget" value="${shopeeTargetVal}" style="max-width:120px;text-align:center">
      <span class="muted">支／帳號／天 —— 蝦皮排程以此判斷「已排滿／缺幾支」。</span></div>
    <div class="modalFoot"><button class="btn" onclick="saveSettings()">確認送出設定</button></div>
  </div>
  <div class="card"><b>馬來設定</b>
    <div class="muted" style="font-size:12px;margin-top:4px">馬來西亞已移到台灣區（比照蝦皮）：由國內剪輯在「影片馬來二創區」挑片、翻成馬來文重剪上傳；價格依「商品價格換算」的馬來 匯率×加乘換算成 MYR 顯示。</div>
    <label style="margin-top:8px">馬來帳號（一行一個）</label>
    <textarea id="set_msacct" style="min-height:88px" placeholder="tiktok-Malaysia（@zana_my）">${esc(msAccountStr)}</textarea>
    <label style="margin-top:12px">馬來每日目標（每個帳號每天幾支）</label>
    <div class="row" style="gap:8px"><input type="number" min="0" id="set_mstarget" value="${msTargetVal}" style="max-width:120px;text-align:center">
      <span class="muted">支／帳號／天 —— 馬來排程以此判斷「已排滿／缺幾支」。</span></div>
    <div class="modalFoot"><button class="btn" onclick="saveSettings()">確認送出設定</button></div>
  </div>`;
}
// 設定：成員名單（角色、改名、重設密碼、刪除）
function setMembersCard(members, memberRows){
  return `<div class="card"><b>成員（${members.length}）</b>
    <div class="muted" style="font-size:12px;margin-top:4px">權限：<b>管理員</b>＝最高(改設定、成員、回收桶、紀錄)；<b>經理人</b>＝可指派工作/影片、看排程與影片庫；<b>剪輯</b>＝接案剪片（含蝦皮/馬來二創區）；<b>海外剪輯</b>＝全英文介面，挑台灣已上傳舊片做英/泰版上傳海外 TikTok；<b>員工</b>＝只做交辦工作與每日匯報，不碰影片、沒有一創二創之分；<b>人資</b>＝只看團隊看板，不能操作。</div>
    <table class="responsive" style="margin-top:8px"><thead><tr><th>名字</th><th>角色</th><th>負責</th><th>上下班</th><th></th></tr></thead>
    <tbody>${memberRows||`<tr><td class="muted">尚無成員</td></tr>`}</tbody></table>
    <div class="row" style="gap:8px;margin-top:12px"><input id="mb_name" placeholder="新增成員名字" style="flex:1;min-width:130px">
      <select id="mb_role" style="width:auto"><option value="editor">剪輯</option><option value="manager">經理人</option><option value="intl">海外剪輯</option><option value="cs">員工</option><option value="hr">人資</option></select>
      <select id="mb_craft" style="width:auto" title="剪輯才需要分工">${Object.entries(CRAFT_LABEL).map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select>
      <button class="btn" onclick="addMember()">＋ 新增成員</button></div>
  </div>`;
}
// 設定：上下班時間（全公司一套；個人例外在成員清單那裡設）
function setWorkHoursCard(s){
  const o=s.officeGeo||{};
  return `<div class="card"><b>上下班時間</b>
    <div class="muted" style="font-size:12px;margin-top:4px">全公司共用這一組；需要不同時間的同仁，在下面「成員」那一列單獨設定。</div>
    <div class="grid cols3" style="margin-top:10px">
      <div><label>上班時間</label><input id="set_wstart" type="time" value="${esc(s.workStart||DEF_WORK.start)}"></div>
      <div><label>下班時間</label><input id="set_wend" type="time" value="${esc(s.workEnd||DEF_WORK.end)}"></div>
      <div><label>遲到寬限（分鐘）</label><input id="set_grace" type="number" min="0" max="120" value="${s.lateGraceMin!=null?+s.lateGraceMin:DEF_WORK.grace}"></div>
    </div>
    <label style="margin-top:14px">每日固定工作（一行一件，格式「角色=工作內容」）</label>
    <textarea id="set_tpl" rows="6" placeholder="剪輯=剪輯當日影片&#10;員工=回覆客戶訊息&#10;全部=填寫今日工作日誌">${esc(dailyTemplates().map(x=>{
      const r=(TPL_ROLES.find(p=>p[0]===x.r)||TPL_ROLES[0])[1]; return r+"="+String(x.t).trim(); }).join("\n"))}</textarea>
    <div class="muted" style="font-size:12px;margin-top:4px">角色可填：${TPL_ROLES.map(p=>p[1]).join("／")}。沒寫「＝」就當作全部。
      這些會出現在該角色的工作頁上方，按一下就加進今天的待辦；當天已經有同名的就不再出現。</div>

    <label style="margin-top:14px">全公司出勤起算日（選填）</label>
    <div class="row" style="gap:8px;align-items:center">
      <input id="set_attstart" type="date" value="${esc(s.attendStart||"")}" style="max-width:180px">
      <span class="muted" style="font-size:12px">留白＝各人從自己設定密碼那天起算。填了就以這一天為準（兩者取比較晚的）。這一天之前的打卡只留著參考，不算遲到早退。</span>
    </div>
    <label style="margin-top:12px" style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" id="set_pconly" ${s.pcOnly!==false?"checked":""} style="width:auto;margin:0"> 只能用電腦登入（一般員工不給手機登入；經理人／人資／管理員不受限）</label>
    <label style="margin-top:12px">公司座標（選填，用來標出「打卡地點離公司很遠」）</label>
    <div class="grid cols2">
      <div><input id="set_olat" placeholder="緯度 例 25.033964" value="${o.lat!=null?esc(String(o.lat)):""}"></div>
      <div><input id="set_olng" placeholder="經度 例 121.564468" value="${o.lng!=null?esc(String(o.lng)):""}"></div>
    </div>
    <div class="muted" style="font-size:12px;margin-top:6px">打卡一律成功、不會被擋；系統只把裝置、是不是手機、GPS 座標記下來，出勤報表上標出異常讓人資判斷。</div>
  </div>`;
}
// 設定：對接窗口名單
function setContactsCard(contactList, contactRows){
  return `<div class="card"><b>對接窗口名單（${contactList.length}）</b>
    <table class="responsive" style="margin-top:8px"><thead><tr><th>窗口名稱</th><th></th></tr></thead>
    <tbody>${contactRows||`<tr><td class="muted">尚無對接窗口</td></tr>`}</tbody></table>
    <div class="row" style="gap:8px;margin-top:12px"><input id="ct_name" placeholder="新增對接窗口名稱" style="flex:1;min-width:150px" onkeydown="if(event.key==='Enter')addContact()">
      <button class="btn" onclick="addContact()">＋ 新增窗口</button></div>
  </div>`;
}
function viewSettings(){
  const s=STATE.settings||{};
  const dailyTargetVal=(s.dailyTarget!=null&&s.dailyTarget!=="")?s.dailyTarget:daySumLegacy(today);
  const platStr=postPlatforms().map(p=>p.name+"="+p.utm).join("\n");
  const members=(STATE.users||[]).filter(u=>["editor","manager","intl","cs","hr"].includes(u.role||"editor"));
  const roleSel=(u)=>`<select onchange="setMemberRole('${esc(jsEsc(u.name))}',this.value)" style="width:auto;padding:4px 8px;font-size:13px">
      <option value="editor" ${(u.role||"editor")==="editor"?"selected":""}>剪輯</option>
      <option value="manager" ${u.role==="manager"?"selected":""}>經理人</option>
      <option value="intl" ${u.role==="intl"?"selected":""}>海外剪輯</option>
      <option value="cs" ${u.role==="cs"?"selected":""}>員工</option>
      <option value="hr" ${u.role==="hr"?"selected":""}>人資</option></select>`;
  // 剪輯才需要分工；管理員/經理人/人資固定看全部
  const craftSel=(u)=> ["editor","intl"].includes(u.role||"editor")
    ? `<select onchange="setMemberCraft('${esc(jsEsc(u.name))}',this.value)" style="width:auto;padding:4px 8px;font-size:13px">
        ${Object.entries(CRAFT_LABEL).map(([k,l])=>`<option value="${k}" ${craftOf(u.name)===k?"selected":""}>${l}</option>`).join("")}</select>`
    : (u.role==="cs" ? '<span class="muted" style="font-size:12px">不剪片</span>'
                     : '<span class="muted" style="font-size:12px">全部</span>');
  const whSel=(u)=>{ const w=workHoursOf(u.name);
    const flexBox=`<label class="row" style="gap:4px;align-items:center;font-size:11px;white-space:nowrap;margin:0">
      <input type="checkbox" ${w.flex?"checked":""} style="width:auto;margin:0" onchange="setMemberFlex('${esc(jsEsc(u.name))}',this.checked)">變動工時</label>`;
    if(w.flex) return `<span class="row" style="gap:6px;align-items:center;flex-wrap:wrap"><span class="muted" style="font-size:12px">不判遲到早退</span>${flexBox}</span>`;
    return `<span class="row" style="gap:4px;align-items:center;flex-wrap:wrap">
      <input type="time" value="${esc(w.start)}" style="width:auto;padding:4px 6px;font-size:12px" onchange="setMemberHours('${esc(jsEsc(u.name))}',this.value,null)">
      <span class="muted">–</span>
      <input type="time" value="${esc(w.end)}" style="width:auto;padding:4px 6px;font-size:12px" onchange="setMemberHours('${esc(jsEsc(u.name))}',null,this.value)">
      ${w.custom?`<button class="btn sec sm" style="padding:2px 7px;font-size:11px" onclick="setMemberHours('${esc(jsEsc(u.name))}','','')" title="改回全公司時間">↺</button>`:''}
      ${flexBox}
    </span>`; };
  const memberRows=members.map(u=>`<tr>
    <td data-label="名字"><b>${esc(u.name)}</b>${u.pwAt?`<div class="muted" style="font-size:11px">出勤自 ${esc(String(u.pwAt).slice(0,10))} 起算</div>`:'<div class="muted" style="font-size:11px">還沒設密碼・尚未起算</div>'}</td>
    <td data-label="角色">${roleSel(u)}</td>
    <td data-label="負責">${craftSel(u)}</td>
    <td data-label="上下班">${whSel(u)}</td>
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
      <span class="muted">支／天 —— 社群媒體月排程以此判斷「已排滿／缺幾支」，不分影片類型。</span></div>
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
  ${setWorkHoursCard(s)}
  ${setIntlCard(s)}
  ${setRatesCard(s)}
  ${setChannelCards(s)}
  ${setMembersCard(members, memberRows)}
  <div class="card"><b>影片標籤</b>
    <div class="muted" style="font-size:12px;margin-top:4px">新增／編輯影片時可勾選的標籤。刪除標籤不影響已套用在影片上的。</div>
    <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
      ${otherTags().map(t=>`<span class="tag" style="display:inline-flex;align-items:center;gap:6px">${esc(t)} <a href="javascript:void(0)" onclick="delVideoTag('${esc(jsEsc(t))}')" style="color:var(--red);text-decoration:none;font-weight:800">×</a></span>`).join("")||'<span class="muted">尚無自訂標籤</span>'}
    </div>
    <div class="row" style="gap:8px;margin-top:12px"><input id="tag_new" placeholder="新增標籤名稱" style="flex:1;min-width:150px" onkeydown="if(event.key==='Enter')addVideoTagSel()">
      <button class="btn" onclick="addVideoTagSel()">＋ 新增標籤</button></div>
  </div>
  ${setContactsCard(contactList, contactRows)}
  <div class="card"><b>資料維護</b>
    <div class="row" style="gap:8px;margin-top:8px"><span class="muted" style="flex:1">把「現有」影片標題與文案裡的簡體字一次轉成繁體存回資料庫（新增/編輯時本來就會自動轉）。</span>
      <button class="btn sec sm" onclick="convertExistingToTW()" style="white-space:nowrap">現有簡體轉繁體</button></div>
    <div class="row" style="gap:8px;margin-top:10px"><span class="muted" style="flex:1">把所有影片與標籤清單裡的「每日寵粉」標籤改成「寵粉」。</span>
      <button class="btn sec sm" onclick="migratePamperTag()" style="white-space:nowrap">每日寵粉 → 寵粉</button></div>
  </div>`;
}
// 一次性：把現有影片的標題/文案簡體字轉繁體並存回（新存的本來就會自動轉）
// 一次性：把「每日寵粉」標籤改成「寵粉」（影片 tags/subTag ＋ 設定的標籤清單）
async function migratePamperTag(){ if(dbBlocked()) return;
  if(!confirm("把所有影片與標籤清單裡的「每日寵粉」改成「寵粉」？")) return;
  const all=(STATE.videos||[]).concat(STATE.deletedVideos||[]);
  BULK_BUSY=true; let n=0;
  try{
    for(const v of all){ const tags=Array.isArray(v.tags)?v.tags:[];
      if(tags.includes("每日寵粉")){ const nt=[...new Set(tags.map(t=>t==="每日寵粉"?"寵粉":t))];
        const patch={tags:nt}; if(v.subTag==="每日寵粉") patch.subTag="寵粉";
        try{ await window.DB.update("videos",v.id,patch); n++; }catch(e){} } }
    const cur=videoTags(); if(cur.includes("每日寵粉")){ try{ await window.DB.setSettings({videoTags:[...new Set(cur.map(t=>t==="每日寵粉"?"寵粉":t))]}); }catch(e){} }
  } finally { BULK_BUSY=false; applyState(LAST_RAW); }
  logA("整理標籤 每日寵粉→寵粉", n+" 支"); await delay(300); toast("完成：已把 "+n+" 支影片的「每日寵粉」改成「寵粉」");
}
async function convertExistingToTW(){ if(dbBlocked()) return;
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
  logA("簡體轉繁體 "+n+" 支", "影片庫");
  await delay(300); toast("完成：已把 "+n+" 支影片的簡體字轉為繁體");
}
async function saveSettings(){
  const plats=(val("set_plat")||"").split("\n").map(s=>s.trim()).filter(Boolean).map(line=>{
    const i=line.indexOf("="); const name=(i>=0?line.slice(0,i):line).trim(); const utm=(i>=0?line.slice(i+1):line).trim()||name; return {name,utm}; });
  const settings={ dailyTarget:parseInt(val("set_daily"))||0, scheduleHorizonDays:parseInt(val("set_horizon"))||30, shoplineBase:(val("set_shop")||"").trim() };
  const pw=(val("set_pw")||"").trim(); if(pw) settings.adminPassword=pw; // 空白則沿用舊密碼
  if(document.getElementById("set_wstart")){
    settings.workStart=(val("set_wstart")||DEF_WORK.start);
    settings.workEnd=(val("set_wend")||DEF_WORK.end);
    settings.lateGraceMin=Math.max(0, parseInt(val("set_grace"))||0);
    settings.attendStart=(val("set_attstart")||"").trim();
    // 每日固定工作：一行一件，「角色=內容」；角色寫錯或沒寫都當作「全部」
    settings.dailyTemplates=(val("set_tpl")||"").split("\n").map(line=>{
      const i=line.indexOf("="); const label=(i>=0?line.slice(0,i):"").trim(); const t=(i>=0?line.slice(i+1):line).trim();
      const hit=TPL_ROLES.find(p=>p[1]===label||p[0]===label);
      return {t, r:hit?hit[0]:"all"}; }).filter(x=>x.t);
    const pcEl=document.getElementById("set_pconly"); settings.pcOnly = pcEl? !!pcEl.checked : true;
    const la=parseFloat(val("set_olat")), ln=parseFloat(val("set_olng"));
    settings.officeGeo=(isFinite(la)&&isFinite(ln))?{lat:la,lng:ln}:{};
  }
  if(plats.length) settings.postPlatforms=plats;
  // 海外設定：帳號清單（語言=帳號名）＋每帳號每日目標
  if(document.getElementById("set_intlacct")){
    settings.intlAccounts=(val("set_intlacct")||"").split("\n").map(s=>s.trim()).filter(Boolean).map(line=>{
      const i=line.indexOf("="); const loc=(i>=0?line.slice(0,i):"en").trim().toLowerCase(); const name=(i>=0?line.slice(i+1):line).trim();
      return {locale:loc, name}; }).filter(a=>a.name && ["en","th"].includes(a.locale));   // 只收 en/th；馬來帳號請填在「馬來設定」
    settings.intlDailyTarget=parseInt(val("set_intltarget"))||0;
    settings.exchangeRates={};
    ["en","th","ms","shopee"].forEach(loc=>{
      const rate=(loc==="shopee")?1:parseFloat(val("set_rate_"+loc));   // 蝦皮＝台幣，匯率固定 1
      const mult=parseFloat(val("set_mult_"+loc));
      settings.exchangeRates[loc]={code:DEFAULT_CURRENCY[loc], rate:(rate>0?rate:1), mult:(mult>0?mult:1)}; });
  }
  // 蝦皮設定：帳號清單（一行一個）＋每帳號每日目標
  if(document.getElementById("set_shpacct")){
    settings.shopeeAccounts=(val("set_shpacct")||"").split("\n").map(s=>s.trim()).filter(Boolean);
    settings.shopeeDailyTarget=parseInt(val("set_shptarget"))||0;
  }
  // 馬來設定：帳號清單（一行一個）＋每帳號每日目標
  if(document.getElementById("set_msacct")){
    settings.msAccounts=(val("set_msacct")||"").split("\n").map(s=>s.trim()).filter(Boolean);
    settings.msDailyTarget=parseInt(val("set_mstarget"))||0;
  }
  await writeAdmin("PUT","/api/settings",{settings},"已更新設定");
}

// ===================================================================
// 成員管理（限管理員・併入設定頁）
// ===================================================================
function addMember(){ const name=val("mb_name").trim(); if(!name){ toast("請輸入名字",true); return; }
  const role=val("mb_role")||"editor"; const craft=val("mb_craft")||"orig";
  write("POST","/api/users",{name,role,craft},"已新增成員（"+(ROLE_LABEL[role]||role)+(["editor","intl"].includes(role)?("・"+CRAFT_LABEL[craft]):"")+"）"); }
// 指定這位剪輯負責一次創作還是二次創作（決定他看得到哪些工作）
function setMemberCraft(name, craft){ if(!Object.keys(CRAFT_LABEL).includes(craft)) return;
  dbUpdate("users", name, {craft}, {action:"設定分工："+CRAFT_LABEL[craft], target:name})
    .then(ok=>{ if(ok) toast("已設定「"+name+"」負責"+CRAFT_LABEL[craft]); }); }
// 個人班表例外：兩個都清空＝改回全公司時間
function setMemberHours(name, start, end){
  const u=((STATE&&STATE.users)||[]).find(x=>x.name===name)||{};
  const patch={};
  if(start!==null) patch.workStart=String(start||"");
  if(end!==null)   patch.workEnd=String(end||"");
  const ns=patch.workStart!==undefined?patch.workStart:(u.workStart||"");
  const ne=patch.workEnd!==undefined?patch.workEnd:(u.workEnd||"");
  const msg=(ns||ne)?("已設定「"+name+"」的上下班時間 "+(ns||"—")+"–"+(ne||"—")):("「"+name+"」改回全公司時間");
  writeAdmin("PUT","/api/users/"+name, patch, msg);
}
// 變動工時：沒有固定上下班，只記工時，不判遲到早退（人資預設就是）
function setMemberFlex(name, on){
  writeAdmin("PUT","/api/users/"+name,{flexHours:!!on},
    on?("「"+name+"」改為變動工時（只記工時，不判遲到早退）"):("「"+name+"」改回固定班表")); }
function setMemberRole(name, role){ if(!["editor","manager","intl","cs","hr"].includes(role)) return;
  writeAdmin("PUT","/api/users/"+name,{role},"已將「"+name+"」設為"+(ROLE_LABEL[role]||role)); }
function delMember(name){ if(!confirm("確定刪除成員「"+name+"」？")) return;
  writeAdmin("DELETE","/api/users/"+name,{},"已刪除成員"); }
// 主管線上重設員工密碼為 0000，員工再自行修改
function resetMemberPw(name){
  if(!confirm("確定把「"+name+"」的密碼重設為 0000？\n請通知他登入後自行修改。")) return;
  // pwHash 清空 → 他下次登入用 0000 進來，然後一定會被「請設定新密碼」擋住
  writeAdmin("PUT","/api/users/"+name,{pw:"0000",pwHash:"",pwSet:false},"已將「"+name+"」密碼重設為 0000（他下次登入要自己重設）"); }
function renameMember(oldName){ if(dbBlocked()) return;
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
    logA("成員改名","「"+oldName+"」→「"+nn+"」");
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
// 影片編號（無自訂 code 則取 id 數字，如 V001→001）；外顯片名以成品標題名稱為主
function vidCode(v){ return (v&&v.code) || String((v&&v.id)||"").replace(/^V/,""); }
function vidTitle(v){ const t=zhTW((v&&(v.name||v.rawName))||"(未命名)"); const c=vidCode(v); return c?(c+" "+t):t; }
// 已用過的商品名（下拉選用，讓品名一致）
function knownProducts(){ const set=new Set(); (STATE.videos||[]).forEach(v=>{ (v.products||[]).forEach(p=>{ if(p&&p.name) set.add(p.name); }); }); return [...set].sort(); }
// 商品列：最多 4 個，每個 品名(下拉)+單價(手動)
function productRows(prefix, products){
  const ps=Array.isArray(products)?products:[];
  let h=`<label>${T("銷售商品（最多 4 個）","Products (up to 4)")}</label>`;
  for(let i=0;i<4;i++){ const p=ps[i]||{};
    h+=`<div class="row" style="gap:8px;margin-bottom:6px">
      <input id="${prefix}_pn${i}" list="${prefix}_plist" value="${esc(p.name||"")}" oninput="autoPamperTag('${prefix}')" placeholder="${T("商品 "+(i+1)+"（品名）","Product "+(i+1)+" (name)")}" style="flex:2;min-width:130px">
      <input id="${prefix}_pp${i}" type="number" min="0" value="${(p.price!=null&&p.price!=="")?esc(p.price):''}" placeholder="${T("原價","List price")}" style="flex:1;min-width:80px">
      <input id="${prefix}_ps${i}" type="number" min="0" value="${(p.salePrice!=null&&p.salePrice!=="")?esc(p.salePrice):''}" placeholder="${T("售價(寵粉價)","Fan price")}" style="flex:1;min-width:100px">
    </div>`; }
  h+=`<datalist id="${prefix}_plist">${knownProducts().map(n=>`<option value="${esc(n)}">`).join("")}</datalist>`;
  return h;
}
function collectProducts(prefix){ const out=[];
  for(let i=0;i<4;i++){ const name=(val(prefix+"_pn"+i)||"").trim(); if(!name) continue;
    out.push({name, price:parseInt(val(prefix+"_pp"+i))||0, salePrice:parseInt(val(prefix+"_ps"+i))||0}); }
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
      <button class="btn sec" onclick="closeModal()">${T("取消","Cancel")}</button>
      ${onConfirm?`<button class="btn" id="modalConfirm">${esc(confirmLabel||T("確認送出","Submit"))}</button>`:""}
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
  {oc:"unclaimVid",      title:"退回", text:"後悔了或想改選？把這支退回共用的待剪清單，大家可重新認領。"},
  {oc:"batchNewFootage", title:"＋ 新增毛片", text:"一次最多新增 5 支新影片，每支可填原始片名＋最多 4 個商品；其餘細節剪片時再補。"},
  {oc:"newSimpleVideo",  title:"新增影片", text:"建立一支新影片，填原始片名、影片文案與商品。"},
  {oc:"editVideo",       title:"打開影片內容", text:"點影片名稱可看這支片的完整資料；裡面再按「編輯」才能修改。"},
  {oc:"vidSetView",      title:"影片庫分頁", text:"切換影片清單：毛片待剪／新片未排程／新片已排程／舊片。"},
  {oc:"odReuse",         title:"排入（重播舊片）", text:"把選好的舊片排到這一天重播；存檔位置自動帶入，上傳連結可之後再補。"},
  {oc:"openDay",         title:"打開這一天", text:"查看這天要上的影片、調整上片日，或安排舊片重播。"},
  {oc:"clockOutReport",  title:"下班匯報", text:"下班前按這裡，會列出今天完成／未完成的工作並打卡下班。"},
  {oc:"reviewVid",       title:"老闆娘審核", text:"通過或退回這支影片；退回會回到剪輯的今日工作。"},
  {oc:"delVideo",        title:"刪除影片", text:"把這支影片移到「回收桶」（軟刪除）；管理員可在回收桶復原或永久刪除。"},
  {oc:"createTask",      title:"新增工作項目", text:"把今天要做的事加進上班計畫，做完填回報狀況再打勾完成。"},
  {oc:"calMove",         title:"切換月份", text:"看上個月／下個月的排程。"},
  {oc:"copyStr",         title:"複製導購連結", text:"按一下複製這個平台的帶 UTM 導購連結，貼到貼文就能追成效。"},
  {sel:"#nav button",    title:"功能分頁", text:"切換主要畫面：上班計畫、社群媒體月排程、影片庫等。"},
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
  if(TUT_ON){ if(ban){ ban.textContent="教學模式開啟中：把游標停在任何按鈕或欄位上看說明（此模式下點按鈕只會看說明、不會執行）。再按一次「教學」關閉。"; ban.classList.remove("hidden"); } }
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
