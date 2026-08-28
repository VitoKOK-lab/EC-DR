// ===================================================================
// EC-DR 精簡版 — 只保留三件事：月排程、新片上架、舊片重覆上架
// 角色：管理員（Vito）＋ 剪輯。已移除：交辦、KPI、日報、稽核、二創、商品庫。
// 資料層走 Firestore（fb.js 提供 window.DB）；商業邏輯都在前端。
// ===================================================================
// 職位。intl＝巴基斯坦團隊（全英文介面，做英/泰版二創）。
// mkt／svc／ship 是後來加的不剪片職位，權限與畫面比照 cs。
// pick＝選品行銷（v138）：從「商品」出發幫商品配一支影片、送老闆審核，畫面與權限比照 cs，
// 額外多一頁「選品配對」——只有這個職位、經理人（Regina）與管理員看得到。
const ROLE_LABEL = {boss:"管理員", manager:"經理人", editor:"剪輯", mkt:"行銷", pick:"選品行銷",
                    svc:"客服", ship:"出貨", cs:"員工", hr:"人資", intl:"巴基斯坦"};
const ROLE_LABEL_EN = {boss:"Admin", manager:"Manager", editor:"Editor", mkt:"Marketing", pick:"Curation Marketing",
                       svc:"Customer service", ship:"Shipping", cs:"Staff", hr:"HR", intl:"Pakistan"};
const roleEn=(r)=>ROLE_LABEL_EN[r]||ROLE_LABEL_EN.editor;
// 篩選下拉是在挑「一群人」，用複數才讀得順（個人徽章仍用上面的單數）
const ROLE_GROUP_EN={boss:"Admins", manager:"Managers", editor:"Editors", mkt:"Marketing", pick:"Curation Marketing",
                     svc:"Customer service", ship:"Shipping", cs:"Staff", hr:"HR", intl:"Pakistan"};
// 會打卡、進團隊看板與出勤的所有職位（不含管理員／經理人）。顯示順序見 ROLE_ORDER。
const STAFF_ROLES=["editor","mkt","pick","svc","ship","cs","hr","intl"];
// 不剪片的職位：不顯示影片數字、不指派毛片、不用選一創／二創分工
const NO_EDIT_ROLES=["mkt","pick","svc","ship","cs","hr"];
// 這個職位的畫面用不用得到影片資料。
// ⚠️ 判斷依據不是「他有沒有影片庫分頁」，也不是「他剪不剪片」，
//    而是逐頁比對過「拿掉影片資料畫出來有沒有變」——
//    「選品行銷」不剪片，但選品配對要從影片庫大流挑片，所以他一定要。
//    以後新增職位或新增卡片，請照同一個方法驗一次（tests/smoke-v139.js 有現成的比對），
//    不要用猜的。
//
// ⚠️⚠️ v152 更正：這裡原本寫「人資看起來像是要用，實測他那兩頁完全沒差」——
//    那句話是錯的，而且 smoke-v139 的比對當時是**空轉**的（樣本影片沒有 editor、
//    完成日也不在當月，有沒有影片資料兩邊都是 0，所以比得出「一樣」）。
//    拿正式資料在真瀏覽器實測：團隊看板的「本月完成」管理員看到 168、
//    人資／行銷／客服／出貨看到 **0**。那不是空白，是**假數字** ——
//    十三個人每天在看一份說「這個月沒人做事」的表。
//    現在分兩邊處理：
//      ① 人資要查剪輯的完成狀況（v152 的新分頁），所以他真的需要影片資料 → 移出這份清單。
//      ② 其他不剪片的職位照舊不下載，但團隊看板上那幾個算不出來的欄位與圖表
//         直接**不顯示**（見 viewTeam 的 needVideos() 判斷），不再假裝是 0。
const NO_VIDEO_ROLES=["mkt","svc","ship","cs"];
function needVideos(role){
  const r=role||currentRole();
  return !NO_VIDEO_ROLES.includes(r);
}
// 這個人需要影片資料、但一支都還沒到 ＝ 還在載入中（不是「沒有影片」）。
// 用來把「找不到影片」跟「還沒載完」分開講，也用來在畫面上提示。
function videosLoading(){
  if(!needVideos()) return false;
  if(!(window.DB && window.DB.videosWatched && window.DB.videosWatched())) return true;
  return !((STATE&&STATE.videosAll)||[]).length;
}
const ROLE_TABS = {
  // 月排程合一：一個「月排程」分頁，裡面用平台選單切換（社群媒體／海外 TikTok／蝦皮／馬來）
  // 「團隊看板」全員都看得到：誰被交辦了什麼、處理到哪、今日與本月成效（純檢視、不能操作）
  boss:    [["dashboard","儀表板"],["flow","流程中控"],["team","團隊看板"],["output","剪輯成效"],["attend","出勤"],["videos","影片庫A"],["videosDF","影片庫大流"],["cal","月排程"],["perf","平台成效"],["match","選品配對"],["log","操作紀錄"],["trash","回收桶"]],
  manager: [["flow","流程中控"],["team","團隊看板"],["videos","影片庫A"],["videosDF","影片庫大流"],["cal","月排程"],["match","選品配對"]],   // 經理人（Regina）：流程中控（備片警示＋指派＋交辦回報）＋影片庫＋月排程＋選品配對；管理員看得到同一頁
  // 台灣剪輯與巴基斯坦剪輯分頁完全相同（只差介面語言）；二創區已整合進「上班計畫」的「建立二創版本」卡
  editor:  [["work","上班計畫"],["team","團隊看板"],["videos","影片庫A"],["videosDF","影片庫大流"],["cal","月排程"]],
  intl:    [["work","Work Plan"],["team","Team Board"],["videos","Library"],["cal","Schedule"]],
  cs:      [["work","本日工作"],["team","團隊看板"]],   // 不剪片的職位：只做交辦工作與每日匯報
  // 人資：團隊看板（交辦狀況＋成效）＋剪輯成效（誰做完幾支、審過沒、檔案在哪）＋出勤（打卡、遲到早退、月報表）
  hr:      [["team","團隊看板"],["output","剪輯成效"],["attend","出勤"]],
};
// 行銷／客服／出貨：畫面與權限比照「員工」
ROLE_TABS.mkt = ROLE_TABS.svc = ROLE_TABS.ship = ROLE_TABS.cs;
// 選品行銷：比照「員工」的交辦工作／團隊看板，額外加一頁「選品配對」
ROLE_TABS.pick = ROLE_TABS.cs.concat([["match","選品配對"]]);
const PUB_TIMES = ["10:00","12:00","16:00"];   // 固定三個上片時間
let STATE = null, CUR_TAB = null, ONLINE = true, LAST_RAW = null, BULK_BUSY = false;
// 本機還有沒送出去的寫入（打卡、交辦…）。這種東西自己看得到、別人看不到，
// 一定要標出來 —— 出過事：員工看到自己打了卡，主管看到他沒打卡。
let PENDING = false;
// fb.js 偵測到「連不連得上 Firestore」與「有沒有東西還沒送出去」時回呼這裡。
// ⚠️ ONLINE 以前宣告成 true 之後**整份程式碼再也沒有人更新它**，
//    所以那條「目前離線」的紅色橫幅永遠不會出現 —— 等於完全沒有離線偵測。
window.__onNet = function(st){
  const on=!!(st&&st.online), pd=!!(st&&st.pending);
  if(on===ONLINE && pd===PENDING) return;
  ONLINE=on; PENDING=pd;
  if(STATE) try{ render(); }catch(e){}
};
let VIEW_AS = null;   // 管理員「員工視角」：暫時以某員工身分檢視（唯讀預覽）
// 台灣時間（UTC+8）的今天／昨天。
// 這兩個值以前是 const，載入時算一次就固定 —— 分頁掛著跨過午夜之後，
// 交辦、新增工作、打卡都會被蓋上「前一天」的日期，然後隔天在自己的頁面上找不到。
// 現在改成每次重繪、每次寫入日期之前都用 refreshToday() 重算，並由午夜守衛主動翻頁。
function todayTW(){ return new Date(Date.now()+288e5).toISOString().slice(0,10); }
function ydayTW(){ return new Date(Date.now()+288e5-864e5).toISOString().slice(0,10); }
let today = todayTW();
let yesterday = ydayTW();
// 重算「今天」；真的跨日了才回 true（呼叫端可以順手重繪）
function refreshToday(){ const t=todayTW(); if(t===today) return false;
  today=t; yesterday=ydayTW(); return true; }
// 午夜守衛：分頁掛著跨過午夜時，主動把畫面翻到新的一天。
// 有彈窗開著或正在打字就先不翻（不打斷手上的編輯），today 維持舊值、下一輪再試 ——
// 期間只要有任何互動觸發 render()，日期還是會被 refreshToday() 補正，寫入不會蓋錯天。
function midnightWatch(){
  if(todayTW()===today) return;                                        // 還沒跨日
  const mr=document.getElementById("modalRoot");
  if(mr && String(mr.innerHTML||"").trim()) return;                    // 彈窗開著
  const ae=document.activeElement;
  if(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName||"")) return;   // 正在打字
  const oldY=yesterday;
  refreshToday();
  if(SHIFT_DATE===oldY) SHIFT_DATE=yesterday;   // 「每日匯報」的預設值沒被手動改過才跟著翻
  buildNav(); render();
}
if(typeof window!=="undefined" && window.addEventListener && typeof setInterval==="function"){
  const h=setInterval(midnightWatch, 30000);
  if(h && typeof h.unref==="function") h.unref();          // Node 測試環境不要卡住行程
  window.addEventListener("visibilitychange", midnightWatch);   // 手機切回前景時立刻補一次（背景計時器會被節流）
  window.addEventListener("focus", midnightWatch);
}

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
// 登入畫面專用：那時候 ecdr_role 還沒寫進 localStorage（海外同事第一次換裝置就會踩到），
// T() 會誤判成中文。改用手上已知的那個人的職位來決定語言。
function roleT(role){ return (zh,en)=> (role==="intl" ? en : zh); }
// 標點也要跟著語言走：中文用全形（）＋，英文用半形 () +
function paren(x){ return T("（"+x+"）"," ("+x+")"); }
function PLUS(){ return T("＋","+"); }
// 「看起來像介面、其實是設定資料」的中文詞（標籤、片源、影片類型）：
// 海外剪輯看到的畫面全是英文，這些混在裡面就很突兀。內建常見的幾個；
// 管理員可以在設定用「中文=English」自己加或改（settings.dataEn）。
// 沒有對照的就照原樣顯示 —— 品牌名、人名不硬翻。
const DATA_EN={
  "新片":"New","舊片":"Old","寵粉":"Fan perks","代理招商":"Agent recruiting","銷售":"Sales",
  "教育":"Education","個人成長":"Personal growth","珠寶介紹":"Jewelry","子女傳承":"Family legacy",
  "行業揭密":"Industry insider","經典語錄":"Quotes","生活分享":"Lifestyle","異國文化":"Culture",
  "行銷活動":"Campaign","流量型":"Reach","帶貨型":"Selling","官方IP":"Official IP",
};
function dataLabel(x){
  const t=String(x==null?"":x).trim();
  if(!t || currentRole()!=="intl") return t;
  const custom=(STATE&&STATE.settings&&STATE.settings.dataEn)||{};
  return custom[t] || DATA_EN[t] || t;
}
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
// 每一家公司有自己的一套編號（v132）。
// code 是「人看的編號」，不是文件 ID（那個是 V+時間戳+亂數，本來就永不重複），
// 所以各家各自從 001 開始不會有任何資料問題。
// 想在編號上一眼看出是哪一家，就在設定裡給那家一個前綴（例如 C、S）——
// 留空就跟原本一模一樣。前綴只留英數與 -，免得跑進正規式裡爆掉。
// 各家的標籤／片源／投放平台完全不一樣（長照的關鍵字跟珠寶毫無關係），
// 所以這幾個設定欄位要跟著帳號走。做法：欄位名加上帳號代號的後綴。
//   第一家 → videoTags / sources / postPlatforms（原本的欄位，既有資料不動）
//   其他家 → videoTags__care / sources__care / postPlatforms__care
// 這樣連 Firestore 的 arrayAdd／arrayDel 都能照用（欄位名本來就是參數）。
function brandField(base){ return BRAND ? (base+"__"+BRAND) : base; }
function brandSetting(base){ const st=(STATE&&STATE.settings)||{}; return st[brandField(base)]; }
function brandCodePrefix(id){
  const b=brandList().find(x=>x.id===String(id===undefined?BRAND:(id||"")));
  return String((b&&b.codePrefix)||"").replace(/[^A-Za-z0-9-]/g,"").slice(0,6);
}
function nextVideoCode(seen){
  const [Y,M,D]=today.split("-");
  const pre=brandCodePrefix()+`${(+Y-1911)}${M}${D}`;
  const re=new RegExp("^"+pre.replace(/[-]/g,"\\$&")+"(\\d{3})$");
  let seq=0;
  const scan=(arr)=>(arr||[]).forEach(v=>{ const m=String((v&&v.code)||"").match(re); if(m) seq=Math.max(seq,+m[1]); });
  // 只掃這一家的（STATE.videos 已經依品牌切過）＋這一家回收桶裡的。
  // 各家獨立計號，所以不需要、也不應該掃到別家去。
  scan(STATE&&STATE.videos); scan(STATE&&STATE.deletedVideos); scan(seen);
  return pre+String(seq+1).padStart(3,"0");
}
// 影片的「完整標準結構」— 對應 SCHEMA.md（schemaVersion 2）。每筆寫入都用這個確保一致。
function newVideoRecord(over){
  const s=STATE.settings||{};
  const rec={ id: newVideoId(), code: nextVideoCode(),
    brand: BRAND,   // 目前在哪一家就建在哪一家（"" ＝第一家，既有資料天生就是）
    name:"", rawName:"", videoCopy:"", tags:[], subTag:"",
    mainType:"",   // 預設不分類（流量型是多數，不特別標）
    source:((brandSetting("sources")||[])[0])||"", stage:"待處理",
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
    refLink:"",   // 參考來源網址：這支的靈感／參考影片是哪來的
    cover:"",     // 封面圖網址（Firebase Storage，上傳時已壓縮）
    usageHistory:[], totalUsed:0,
    // 影片庫：""＝影片庫A（走完整生產流程）、"大流"＝影片庫大流（直接放成品）
    lib:"",
    // 大流的二創：不另外開一筆影片，直接記在原片底下。名字、封面、存檔資料夾都沿用原片
    remakes:[],
    locked:false, published:false, backupDone:false, socialScheduled:false };
  return Object.assign(rec, over||{});
}

// ---------- 選品配對（v138）----------
// `products/{id}` — 選品行銷的商品庫（跟 videos.products[] 的「銷售商品」是兩件事：
// 那是印在影片貼文裡的商品資訊，這裡是「這個商品要配哪支影片賣」的工作追蹤）。
// 刻意不做軟刪除／回收桶：這個集合量小、是工作追蹤用，不像影片庫需要救援機制。
function newProductId(){ return uid("PD"); }
function newProductRecord(over){
  const rec={ id:newProductId(), name:"", sku:"", image:"", officialUrl:"", shoplineLink:"",
    activeVideoId:"",
    createdBy:(typeof currentUser==="function"?(currentUser()||""):""), createdAt:nowIso(), updatedAt:"" };
  return Object.assign(rec, over||{});
}
// `matches/{id}` — 一次「幫某商品挑影片」的配對草案／送審／核准紀錄。
// status：draft（草稿，選品行銷還在編輯）／submitted（已送老闆審核）／
//         approved（老闆核准，寫回 products.activeVideoId＝正式配對）／rejected（老闆退回，可修改後重新送審）。
function newMatchId(){ return uid("MT"); }
function newMatchRecord(over){
  const rec={ id:newMatchId(), productId:"", primaryVideoId:null, backupVideoId:null,
    suggestedCopyEdit:"", suggestedLaunchDate:"",
    status:"draft", createdBy:(typeof currentUser==="function"?(currentUser()||""):""), createdAt:nowIso(),
    submittedBy:"", submittedAt:"", reviewedBy:"", reviewedAt:"", bossNote:"", finalVideoId:"" };
  return Object.assign(rec, over||{});
}
// 一支影片「已完成、可以拿去配對」：已完成或已上片（vidSegment 的 old 片仍算完成，只是要重播）
function matchVidDone(v){ return isPublished(v) || vidIsOld(v); }
// 一支影片「還沒拍、只有腳本」：沿用待認領池同一套判斷標準（vidNotShot）
function matchVidScript(v){ return vidNotShot(v); }
// 一支影片是否還「等待選品中」：沒有任何商品把它訂為正式配對影片（activeVideoId）。
// 刻意不存成影片的欄位——訂了又退、換了商品，欄位很容易跟 products 對不上；
// 用當下的 products 即時算，永遠不會兩邊兜不起來。
function videoAwaitingCuration(v){ return !(STATE.products||[]).some(p=>p.activeVideoId===v.id); }

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
  // 排程裡的每一格都是一次明確的「排片」動作，各自列一列 —— 不能按 videoId 併掉：
  // 大流的二創沿用原片的名字與 id，同一天排原片＋第 2 版的話，併掉就少一列，
  // 月曆上的「已排 N」也會跟看得到的列數對不上。slotIdx 帶出去給搬天／移出用。
  ((STATE.schedule||{})[date]?.slots||[]).forEach((s,i)=>{ if(s.videoId){ seen.add(s.videoId); out.push({videoId:s.videoId, slot:s, slotIdx:i}); } });
  // 海外二創(locale)／蝦皮二創(channel)版本走各自的排程月曆，不計入台灣月排程
  // 排程與剪輯是兩條獨立的線：一個人先把日期排好，其他人再照著剪。
  // 所以「排到這天」的影片一律算進來，不管剪完了沒 —— v99 之前這裡卡了 stage，
  // 導致排了日期但還沒剪完的片在月曆上完全看不到（等於排了也不知道自己排過）。
  // 出片面：影片庫A 與大流一起算。大流的片是成品，排進來就是當天要出的其中一支，
  // 「今天到底出幾支」不該分它從哪個庫來（生產面的數字才要分，見 decorate）。
  allLibVideos().forEach(v=>{ if(isSourceVid(v) && schedLineOf(v)==="tw" && v.scheduledDate===date && !seen.has(v.id)){ seen.add(v.id); out.push({videoId:v.id, fromVideo:true}); } });
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
function daySum(date){
  // 各家可以有自己的每日上片目標；沒設就沿用全公司那個數字
  const b=brandList().find(x=>x.id===BRAND);
  if(b && b.dailyTarget>0) return b.dailyTarget;
  const v=STATE.settings&&STATE.settings.dailyTarget;
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
// 新片＝該做的都做完、也上傳好了，排進上片日等著播出（預排上片日還沒到）
// 舊片＝過了預排上片日（已經播過，可以重播）
// 是否已過預排上片日（→ 已上傳、視為舊片，可重播）
function airedPast(v){ const d=String(v.scheduledDate||"").slice(0,10); return !!d && d < today; }

// ===== 公司／品牌（v131）==============================================
// 同一批剪輯服務好幾家公司。人、出勤、交辦是共用的（一天只上一次班），
// 分開的只有「內容」那一半：影片庫、月排程、待認領、毛片庫存、指派、成效。
//
// 第一家用空字串 "" —— 既有幾百支影片沒有 brand 欄位，天生就屬於它，
// 一筆資料都不用搬。跟 origLang:""＝中文、locale:""＝台灣同一個手法。
const BRAND_DEF={id:"", name:"泰熙爾札娜"};
function brandList(){
  const s=(STATE&&STATE.settings)||{};
  const extra=(Array.isArray(s.brands)?s.brands:[])
    .filter(b=>b && String(b.id||"").trim() && String(b.name||"").trim())
    .map(b=>({id:String(b.id).trim(), name:String(b.name).trim(), dailyTarget:+b.dailyTarget||0,
              codePrefix:String(b.codePrefix||"")}));
  const first={id:"", name:String(s.brandName||"").trim()||BRAND_DEF.name, dailyTarget:0,
    codePrefix:String(s.brandCodePrefix||"")};
  const seen=new Set([""]);
  return [first].concat(extra.filter(b=>!seen.has(b.id) && seen.add(b.id)));
}
function brandIds(){ return brandList().map(b=>b.id); }
function brandOf(v){ return String((v&&v.brand)||""); }

// ── 影片庫大流（v137）──────────────────────────────────────────────
// 兩個影片庫：A＝原本那個（走毛片→剪輯→審片的完整流程），大流＝直接放成品。
// 沿用這個專案一路在用的「空字串＝預設」寫法，既有 610 支影片一筆都不用改。
const DF_LIB="大流";
function isDF(v){ return String((v&&v.lib)||"")===DF_LIB; }
// 大流的片：decorate 把它從 STATE.videos 抽出去了，要看它一律走這裡
function dfVideos(){ return (STATE&&STATE.videosDF)||[]; }
// 兩個庫加在一起 —— 只有「出片面」的東西該用它（月排程、當天已排幾支）。
// ⚠️ 生產面（毛片庫存、待認領、審片、未拍、剪輯 KPI）一律不准用，那是 STATE.videos。
// 快取住是因為 vidxBuild 的快取靠陣列身分比對；每次回傳新陣列會讓索引每次重建。
let ALLLIB=null, ALLLIB_A=null, ALLLIB_D=null;
function allLibVideos(){
  const a=(STATE&&STATE.videos)||[], d=(STATE&&STATE.videosDF)||[];
  if(ALLLIB && ALLLIB_A===a && ALLLIB_D===d) return ALLLIB;
  ALLLIB = d.length ? a.concat(d) : a;    // 沒有大流就直接沿用原陣列，不多配置也不破壞索引快取
  ALLLIB_A=a; ALLLIB_D=d; return ALLLIB;
}
// 誰看得到「影片庫大流」：管理員、經理人、剪輯（海外不做大流）
function seesDF(){ return ["boss","manager","editor"].includes(currentRole()); }
function brandName(id){ const b=brandList().find(x=>x.id===String(id||"")); return b?b.name:String(id||""); }
function brandMulti(){ return brandList().length>1; }        // 只有一家時整組 UI 不出現
// 選過的帳號記在 localStorage。**「有沒有選過」跟「選了哪一家」是兩件事** ——
// 空字串是合法的答案（＝第一家），所以要看 key 在不在，不能看值是不是空的。
let BRAND=(()=>{ try{ return localStorage.getItem("ecdr_brand")||""; }catch(e){ return ""; } })();
function brandPicked(){ try{ return localStorage.getItem("ecdr_brand")!==null; }catch(e){ return true; } }
function setBrand(id){
  const v=brandIds().includes(String(id||"")) ? String(id||"") : "";
  const first=!brandPicked();
  try{ localStorage.setItem("ecdr_brand", v); }catch(e){}
  if(v===BRAND && !first) return;
  BRAND=v;
  // 換家等於換一整份資料：重新切片再重畫（月曆／分頁的暫存狀態也一起歸零）
  CAL_YM=null; INTL_CAL_YM=null; CH_CAL={shopee:{ym:null,acct:""},ms:{ym:null,acct:""}};
  VID_Q=""; POOL_Q=""; POOL_FILTER="all"; VID_TAGS=new Set(); CUR_TAB=null;
  applyState(LAST_RAW);
}
// 齒輪選單裡的「切換影音帳號」：忘掉這次的選擇，回到選擇畫面
function pickBrandAgain(){
  try{ localStorage.removeItem("ecdr_brand"); }catch(e){}
  applyState(LAST_RAW);
}
// 登入後選一次的畫面。只有兩家以上、而且還沒選過的時候才出現 ——
// 大部分的人一輩子只會看到這一次，所以不做成每一頁都佔一條的常駐切換列。
function brandPickHTML(){
  const list=brandList();
  return `<div class="brandpick">
    <div class="bp-t">${T("要處理哪一個影音帳號？","Which account are you working on?")}</div>
    <div class="bp-s">${T("選一次就好，之後每次登入都會直接進到這一個。<br>要換的時候，按右上角齒輪裡的「切換影音帳號」。",
      "Pick once — you'll land here every time from now on.<br>To change it later, use “Switch account” in the gear menu.")}</div>
    <div class="bp-list">${list.map(b=>{
      const n=((STATE&&STATE.videosAll)||[]).filter(v=>brandOf(v)===b.id).length;
      return `<button class="brandb ${BRAND===b.id&&brandPicked()?'on':''}" onclick="setBrand('${esc(jsEsc(b.id))}')">
        <span>${esc(b.name)}</span><span class="n">${T(n+" 支影片", n+" videos")}</span></button>`;
    }).join("")}</div></div>`;
}

// ---------- 寫入路由（操作 Firestore） ----------
// 操作紀錄／回收桶用的反查：跨品牌都要找得到，不然別家的片在紀錄上只剩一串 ID
function vidLocal(id){ return (STATE.videosAll||STATE.videos||[]).find(v=>v.id===id)
  || (STATE.deletedVideosAll||STATE.deletedVideos||[]).find(v=>v.id===id); }
// 操作紀錄（稽核）：記下「誰、何時、做了什麼、對象」
function logTarget(path){ const seg=String(path||"").split("/").filter(Boolean); // api, videos, V190, finish
  if(seg[1]==="videos" && seg[2]){ const v=vidLocal(seg[2]); return v?vidTitle(v):seg[2]; }
  if(seg[1]==="users" && seg[2]) return "成員 "+decodeURIComponent(seg[2]);
  if(seg[1]==="schedule" && seg[2]) return "排程 "+seg[2];
  if(seg[1]==="settings") return "系統設定";
  if(seg[1]==="products" && seg[2]){ const p=(STATE.products||[]).find(x=>x.id===seg[2]); return p?("商品 "+p.name):seg[2]; }
  if(seg[1]==="matches" && seg[2]){ const m=(STATE.matches||[]).find(x=>x.id===seg[2]);
    const p=m&&(STATE.products||[]).find(x=>x.id===m.productId); return p?("配對 "+p.name):seg[2]; }
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
      if(body.craft!=null) rec.craft=body.craft;                  // 舊的一創／二創分工：介面已移除（v115 改用分區），欄位保留不動，之後要回頭還救得到
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
    // 「找不到影片」跟「影片還沒載完」是兩件事，訊息不能一樣 ——
    // 後者講成前者，使用者會以為自己的資料不見了（v138 上線後海外同事就是這樣回報的）。
    if(!v && method!=="DELETE") throw new Error(
      videosLoading() ? T("影片資料還在載入中，請等幾秒再試一次","Videos are still loading — try again in a few seconds")
                      : T("找不到影片","Video not found"));
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
      const ver=Math.max(1, Math.min(99, +body.ver||1));   // 1＝原片；2 以上＝第幾版二創（大流才用得到）
      const slot={videoId:id, publishedLink:link, driveFolder:drive, reused:true, by:user, at:nowIso(), time, ver};
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
  if(head==="products"){
    if(method==="POST" && seg.length===1){
      const inc=Object.assign({}, body.product); delete inc.id;
      if(!String(inc.name||"").trim()) throw new Error("請輸入商品名稱");
      const p=newProductRecord(inc); await window.DB.set("products", p.id, p); return;
    }
    const id=seg[1], p=(STATE.products||[]).find(x=>x.id===id), action=seg[2];
    if(!p) throw new Error("找不到商品");
    if(method==="PUT"){
      const patch=Object.assign({}, body.product); delete patch.id; patch.updatedAt=nowIso();
      await window.DB.update("products", id, patch); return;
    }
    if(method==="DELETE"){ await window.DB.del("products", id); return; }
  }
  if(head==="matches"){
    if(method==="POST" && seg.length===1){
      const inc=Object.assign({}, body.match); delete inc.id;
      if(!inc.productId || !(STATE.products||[]).some(x=>x.id===inc.productId)) throw new Error("請先選擇商品");
      const m=newMatchRecord(inc);
      // 一次「建立並送審」：不用先建立再回頭查新 id 才能送審第二趟
      if(body.submit){
        if(!m.primaryVideoId) throw new Error("請先選擇主選影片");
        m.status="submitted"; m.submittedBy=user; m.submittedAt=nowIso();
      }
      await window.DB.set("matches", m.id, m); return;
    }
    const id=seg[1], m=(STATE.matches||[]).find(x=>x.id===id), action=seg[2];
    if(!m) throw new Error("找不到配對");
    if(!action && method==="PUT"){
      if(!["draft","rejected"].includes(m.status)) throw new Error("已送審或已核准的配對不可直接修改，請先建立新的配對");
      const inc=body.match||{}, patch={status:"draft"};
      ["productId","primaryVideoId","backupVideoId","suggestedCopyEdit","suggestedLaunchDate"].forEach(k=>{
        if(inc[k]!==undefined) patch[k]=inc[k]; });
      await window.DB.update("matches", id, patch); return;
    }
    if(action==="submit" && method==="POST"){
      if(!m.productId || !m.primaryVideoId) throw new Error("請先選擇商品與主選影片");
      await window.DB.update("matches", id, {status:"submitted", submittedBy:user, submittedAt:nowIso()}); return;
    }
    if(action==="approve" && method==="POST"){
      const finalId=body.finalVideoId||m.primaryVideoId;
      if(![m.primaryVideoId, m.backupVideoId].includes(finalId)) throw new Error("核准的影片必須是主選或備選影片");
      await window.DB.update("matches", id, {status:"approved", finalVideoId:finalId,
        reviewedBy:user, reviewedAt:nowIso(), bossNote:body.bossNote||""});
      // 正式配對：寫回商品，1 商品＝1 影片
      await window.DB.update("products", m.productId, {activeVideoId:finalId, updatedAt:nowIso()});
      return;
    }
    if(action==="reject" && method==="POST"){
      await window.DB.update("matches", id, {status:"rejected", reviewedBy:user, reviewedAt:nowIso(),
        bossNote:body.bossNote||""}); return;
    }
    if(method==="DELETE"){
      if(!["draft","rejected"].includes(m.status)) throw new Error("已送審或已核准的配對不可刪除");
      await window.DB.del("matches", id); return;
    }
  }
  throw new Error("不支援的操作");
}
function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

// ── 批次寫入：分批平行 ＋ 誠實回報 ────────────────────────────────
// 以前每個批次迴圈都長這樣：`try{ await update(...); n++; }catch(e){}`，
// 然後只報 n。指派 100 支、掉了 30 支，畫面照樣說「已指派 70 支」——
// 沒有人會發現那 30 支還留在公用池。這跟 v127 的「下班按了沒反應卻不報錯」
// 是同一個病：**吞掉失敗就等於假裝成功**。
// 一次一趟也慢：100 支＝100 趟來回，期間 BULK_BUSY 把整個畫面凍住十幾秒。
// 分批平行的 allSettled 一次解決兩件事 —— 快十倍，而且天生就知道誰失敗。
const BULK_CHUNK=10;   // 一次送 10 筆：夠快，又不會一口氣打爆連線
async function bulkRun(items, fn){
  const list=Array.from(items||[]); const ok=[], bad=[];
  for(let i=0;i<list.length;i+=BULK_CHUNK){
    const part=list.slice(i, i+BULK_CHUNK);
    // fn 同步就丟例外的話，map 會在進 allSettled 之前先炸掉 —— 包一層擋住
    const rs=await Promise.allSettled(part.map(it=>Promise.resolve().then(()=>fn(it))));
    rs.forEach((r,j)=>{ (r.status==="fulfilled"?ok:bad).push(part[j]); });
  }
  return {ok, bad, done:ok.length, failed:bad.length};
}
// toast 只有一格，第二則會蓋掉第一則 —— 成功與失敗要併成同一句講完
function bulkToast(r, okMsg, unit){
  const u=unit||T("筆","");
  if(r && r.failed) toast(okMsg + T("；但有 "+r.failed+" "+u+"沒有寫進去，請檢查網路後再按一次",
                                    "; "+r.failed+" "+u+" failed to save — check your connection and try again"), true);
  else toast(okMsg);
}
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
// 摺疊開合的記錄：toggle 不會冒泡，所以掛在捕獲階段（往下走的時候一樣會經過 document）
try{ document.addEventListener("toggle", (e)=>{
  const d=e&&e.target; if(!d||d.tagName!=="DETAILS") return;
  const k=d.getAttribute&&d.getAttribute("data-fold"); if(k) FOLD_OPEN[k]=!!d.open;
  // 幾千個節點的清單收起來時不放進畫面，打開的那一刻才畫（清單本身照樣完整、不截斷）
  const lz=d.getAttribute&&d.getAttribute("data-lazy");
  if(lz && d.open) try{ lazyFill(lz); }catch(err){}
}, true); }catch(e){}
// data-lazy 的值就是要畫哪一條線的來源清單（shopee／ms／en／th）
function lazyFill(zone){
  if(zone==="en"||zone==="th") intlFilter(); else if(CHANNELS[zone]) chFilter(zone);
}
// 關分頁／重新整理／按上一頁時，如果彈窗裡還有沒存的修改就先問一聲。
// （文案打了一大段還沒存，手滑重整就沒了 —— 這是唯一救得回來的時機）
// 瀏覽器只認「有沒有取消事件」，自訂訊息現在都被忽略，所以文字寫什麼不重要。
if(typeof window!=="undefined" && window.addEventListener){
  window.addEventListener("beforeunload", (e)=>{ if(!MODAL_DIRTY) return;
    e.preventDefault(); e.returnValue=""; return ""; });
}
// 這台電腦上次是誰登入的 —— 記起來，下次只要按「直接登入」，不用在一堆名字裡找自己
let LOGIN_ALL=false;
function lastUserHere(){ return localStorage.getItem("ecdr_last")||""; }
function loginSwitchAccount(){ LOGIN_ALL=true; bootLogin(); }
function bootLogin(){
  const g = document.getElementById("userGrid"); g.innerHTML = "";
  // 這台裝置上次登入過的人：只顯示他一個，按「直接登入」再輸入密碼
  const lastName=lastUserHere();
  const lastU=lastName? ((STATE?.users)||[]).find(x=>x.name===lastName) : null;
  if(lastU && !LOGIN_ALL){
    const wrap=document.createElement("div"); wrap.className="quickLogin";
    const who=document.createElement("div"); who.className="qlName"; who.textContent=lastU.name;
    // 這台裝置認得他是誰了 → 用他的職位決定語言（還沒登入，T() 這時候不可靠）
    const tr=roleT(lastU.role);
    const role=document.createElement("div"); role.className="qlRole";
    role.textContent=tr(ROLE_LABEL[lastU.role||"editor"]||"", "Intl Editor");
    const go=document.createElement("button"); go.className="btn qlGo"; go.textContent=tr("直接登入","Log in");
    go.onclick=()=>loginAs(lastU);
    const sw=document.createElement("button"); sw.className="adminLink qlSwitch"; sw.textContent=tr("不是我，切換帳號","Not me — switch account");
    sw.onclick=loginSwitchAccount;
    wrap.appendChild(who); wrap.appendChild(role); wrap.appendChild(go); wrap.appendChild(sw);
    g.appendChild(wrap); return;
  }
  const all=staffSorted(((STATE?.users)||[]).filter(u=>STAFF_ROLES.concat("manager").includes(u.role||"editor")));   // 一創→兩種→二創，英文名在後
  if(!all.length){ const n=document.createElement("p"); n.className="muted"; n.style.cssText="width:100%;text-align:center"; n.textContent="尚無成員，請按「管理員登入」進入後新增"; g.appendChild(n); return; }
  const mkBtn=(u)=>{ const b=document.createElement("button"); b.className="userBtn";
    b.innerHTML = esc(u.name); b.onclick=()=>loginAs(u); return b; };
  const section=(title, list)=>{ if(!list.length) return;
    const h=document.createElement("div"); h.className="loginGroup"; h.textContent=title; g.appendChild(h);
    list.forEach(u=>g.appendChild(mkBtn(u))); };
  // 分區順序：台灣（剪輯行銷 → 其他）→ 巴基斯坦 → 管理層（Regina 放最下面，靠近「管理員登入」）
  STAFF_GROUPS.forEach(([key,zh,en,roles])=> section(zh, all.filter(u=>roles.includes(u.role||"editor"))));
  section("管理層", all.filter(u=>u.role==="manager"));
}
// 上下班要用公司電腦打卡：一般員工不給手機登入（經理人／人資／管理員不受限，他們要能隨時處理事情）
function pcOnlyOn(){ const s=(STATE&&STATE.settings)||{}; return s.pcOnly!==false; }
// 個別開放手機打卡（v125）：全公司只能用電腦是預設，但總有人本來就不在辦公室
// （外務、跑倉庫、外派），逼他們回公司才能打卡沒有意義。
// 在設定裡逐一勾選，勾到的人不受「只能用電腦」限制 —— 而且他們用手機打卡
// 不再被出勤報表標成異常（不然人資每天都會收到一整排紅字）。
function mobileAllowList(){ const s=(STATE&&STATE.settings)||{};
  return Array.isArray(s.mobileAllow) ? s.mobileAllow.map(x=>String(x||"").trim()).filter(Boolean) : []; }
function mobileAllowed(name){ const n=String(name||"").trim(); return !!n && mobileAllowList().includes(n); }
function blockedOnMobile(role, name){
  return pcOnlyOn() && isMobileUA()
      && !["manager","hr","boss"].includes(role||"editor")
      && !mobileAllowed(name); }
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
  // 這裡還不能用 T()：ecdr_role 要登入成功才寫進去，海外同事第一次在新裝置登入時
  // currentRole() 會退回預設的 editor（＝中文）。手上就有 u.role，直接拿它判斷。
  const tr=roleT(u&&u.role);
  if(blockedOnMobile(u.role, u.name)){
    alert(tr("請用公司電腦登入。\n\n上下班打卡要在公司電腦上進行，手機不能登入。\n（如有特殊需要請找管理員）",
             "Please log in from a company computer.\n\nClock-in and clock-out must be done on a company computer; phones can't log in.\n(Ask the admin if you need an exception.)"));
    return; }
  const pw=prompt(tr("請輸入「"+u.name+"」的密碼（預設 0000）：",
                     "Enter the password for \""+u.name+"\" (default 0000):")); if(pw===null) return;
  if(!await pwCheck(u, String(pw).trim())){ toast(tr("密碼錯誤。預設為 0000，忘記請找主管線上重設",
                     "Wrong password. The default is 0000 — ask your manager to reset it if you forgot."),true); return; }
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
// 寫入逾時：離線的時候 Firestore 的 setDoc **不會拋錯，而是永遠不 resolve**。
// 所以光包 try/catch 什麼都抓不到 —— 一定要自己設一個時限。
// ⚠️ 逾時不代表要放棄：那筆寫入還排在本機佇列裡，網路回來會自己送出去。
//    逾時只是「該告訴使用者現在還沒送到」。
const PUNCH_WAIT=8000;
function writeWithin(p, ms){
  return Promise.race([ Promise.resolve(p).then(()=>true),
    new Promise(r=>setTimeout(()=>r(false), ms||PUNCH_WAIT)) ]);
}
async function clockIn(name){ refreshToday();
  // 員工視角是唯讀預覽。write()／writeAdmin()／dbWrite() 三個入口都擋了，
  // 只有這裡直接呼叫 window.DB.set，繞過了全部三個 —— 實測管理員在預覽底下
  // 叫這個函式會**真的幫員工打一張上班卡**。
  // 目前畫面上不會畫出打卡鈕，所以滑鼠點不到（不是現在的災情），但這是唯一
  // 一條沒有守門的寫入路徑，補起來，不要留給下一個人踩。
  if(dbBlocked()) return false;
  const id=shiftId(name,today);
  try{ const ex=(STATE&&STATE.shifts&&STATE.shifts[id])||null;
    if(ex&&ex.clockIn) return true;   // 已打過上班卡
    const env=punchEnv(); const isNew=!isKnownDevice(name, env.dev);
    const okSent=await writeWithin(window.DB.set("shifts", id, {id, user:name, date:today, clockIn:nowIso(), clockOut:"",
      inDev:env.dev, inDevUA:env.ua, inMobile:env.mobile, inNewDev:isNew, inGeo:null, autoOut:false}));
    rememberDevice(name, env);
    // GPS 是選配：拿到再補寫，拿不到或使用者不給權限都不影響打卡
    grabGeo().then(g=>{ if(g) window.DB.update("shifts", id, {inGeo:g}).catch(()=>{}); });
    if(!okSent) punchStuckWarn();
    return okSent;
  }catch(e){ punchStuckWarn(); return false; }
}
// 上班卡沒送出去時要講的話。
// 不能寫成「請再按一次」—— 那筆寫入已經排在本機佇列，畫面上也已經顯示成打過卡了，
// 再登入一次會因為「已打過上班卡」直接跳過，什麼都不會發生。
function punchStuckWarn(){
  toast(T("上班卡還沒送到伺服器（網路可能不通）。先不要關掉這個分頁，連上網路會自動補送 —— 在那之前主管看不到你已經上班。",
          "Your clock-in hasn't reached the server yet (network may be down). Don't close this tab — it will send itself once you're back online. Until then your manager can't see that you're on shift."), true);
}
function myShift(){ return (STATE&&STATE.shifts&&STATE.shifts[shiftId(currentUser(),today)])||null; }
// 管理員密碼也只存雜湊（v89）。第一次用舊密碼登入成功時當場轉換，你不會察覺。
async function adminPwCheck(input){
  const s=(STATE&&STATE.settings)||{};
  if(String(s.adminPwHash||"").trim()) return pwVerifyHash(input, s.adminPwHash);
  return input===String(s.adminPassword==null?"1234":s.adminPassword);
}
async function ownerLogin(){ if(!STATE){ toast("連線中，請稍候再試",true); return; }
  const pw=prompt("請輸入管理員密碼："); if(pw===null) return;
  const p=String(pw).trim();
  if(!await adminPwCheck(p)){ toast("密碼錯誤",true); return; }
  // 還是舊的明文 → 這一刻已經驗證過了，直接換成雜湊、把明文清掉
  if(!String((STATE.settings&&STATE.settings.adminPwHash)||"").trim()){
    try{ await window.DB.setSettings({adminPwHash: await pwMakeHash(p), adminPassword:""}); }catch(e){}
  }
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
  st.deletedVideosAll=allV.filter(v=>v.deleted);
  st.videosAll=allV.filter(v=>!v.deleted);
  // ── 公司／品牌切片（v131）────────────────────────────────────────
  // 品牌是一個橫跨整個系統的維度：影片庫、月排程、待認領、毛片庫存、指派、
  // 儀表板、成效…… 有 48 個地方在讀 STATE.videos。與其改 48 個地方
  // （改漏一個就是某家的片混進另一家的數字裡），在資料進來的這一刻就切好，
  // 其餘全部自動繼承正確行為。
  // 要跨品牌看的只有三種人：編號產生器（全公司不能撞號）、品牌切換器的計數、
  // 操作紀錄的片名反查 —— 那幾個明確去讀 videosAll／deletedVideosAll。
  STATE=st;                                    // brandOf/brandIds 要讀 settings，先接上
  const bset=new Set(brandIds());
  if(BRAND && !bset.has(BRAND)) BRAND="";      // 品牌被刪掉了就退回預設那家
  st.videos=st.videosAll.filter(v=>brandOf(v)===BRAND);
  st.deletedVideos=st.deletedVideosAll.filter(v=>brandOf(v)===BRAND);
  // ── 影片庫大流（v137）─────────────────────────────────────────────
  // 大流的片是「成果」不是「生產」：它沒經過拍片、沒經過剪片，直接就是成品。
  // 所以生產面的每一個數字都不能算它 —— 毛片庫存、待認領池、審片清單、未拍、
  // 剪輯 KPI。混進去的話「還要不要去拍片」這種判斷會整個失真。
  //
  // 切法刻意跟品牌相反：品牌是把「別家的」濾掉，這裡是把「大流的」**抽出去**，
  // 讓 STATE.videos 只剩影片庫A。理由是生產流程有幾十個地方在讀 STATE.videos，
  // 而要看到大流的只有月排程那少少幾個地方 —— 讓多數自動正確、少數明確加回來，
  // 比反過來安全得多（改漏一個生產流程的地方，數字錯了不會有人發現）。
  st.videosDF=st.videos.filter(isDF);
  st.videos=st.videos.filter(v=>!isDF(v));
  st.deletedVideosDF=st.deletedVideos.filter(isDF);
  st.deletedVideos=st.deletedVideos.filter(v=>!isDF(v));
  const s=st.settings||{}; const win=s.reuseWindowDays||30;
  (st.videos||[]).forEach(v=>{ v.last30dUsed=usedInWindow(v,win); });
  return st;
}
// ── 只在「這一頁真的吃到的資料」變了才重繪（v153 ②）────────────────
//
// 量出來的事實：一次同步，全公司每個人都把整頁重畫一遍 —— 但七成畫出來跟原本一模一樣。
//   管理員 88 組「分頁×集合」裡 64 組無關（73%）　剪輯 40 組裡 28 組（70%）
//   人資   24 組裡 16 組（67%）　　　　　　　　　客服 16 組裡 12 組（75%）
// 具體一點：人資整天待在「出勤」（手機上重繪一次 2628 毫秒），有人存了一支影片
// 就凍結 2.6 秒，然後畫出一模一樣的東西。剪輯在影片庫，同事每打一次卡也重畫一次。
//
// ⚠️⚠️ 這張表**寧可多寫不可少寫**。
//    少寫 ＝ 資料該更新卻沒更新，使用者盯著舊畫面而且不會發現 —— 最糟的那種 bug。
//    多寫 ＝ 多重繪一次，只是浪費，看不出來。
//    所以：① 沒登記在表裡的分頁一律照畫（不是「一律不畫」）。
//         ② users／settings 影響職位、語言、分頁本身，一律照畫，不進這張表。
//         ③ 只登記「人多、或重繪特別貴」而且我逐一量過的那幾頁；
//            冷門的管理頁（設定、操作紀錄、回收桶、選品配對、平台成效）
//            故意不登記 —— 省下來的沒幾毫秒，不值得冒表寫錯的風險。
//
// 這張表的來源是三份東西的**聯集**：正式資料實測、合成資料實測、逐頁讀 code。
// 只用其中一份會漏 —— 正式快照裡根本沒有 products／matches，光看它會以為
// 選品配對不吃那兩個集合；合成資料的影片沒有 metrics，光看它會以為平台成效
// 什麼都不吃。tests/smoke-v154.js 會逐一實測把關，漏寫就變紅。
const GLOBAL_COLLS=["users","settings"];
const TAB_DEPS={
  attend:   ["shifts"],
  team:     ["videos","tasks","shifts"],
  work:     ["videos","tasks"],
  videos:   ["videos"],
  videosDF: ["videos"],
  output:   ["videos"],
  cal:      ["videos","schedule"],
  dashboard:["videos","tasks","schedule"],
  flow:     ["videos","tasks","shifts","schedule"],
};
function tabNeedsRender(tab, changed){
  if(!Array.isArray(changed) || !changed.length) return true;   // 不知道改了什麼 → 照畫
  if(LAST_RENDER_TAB==null) return true;                        // 還沒畫過第一次 → 一定要畫
  if(changed.some(c=>GLOBAL_COLLS.indexOf(c)>=0)) return true;
  const deps=TAB_DEPS[tab];
  if(!deps) return true;                                        // 沒登記的分頁 → 照畫
  return changed.some(c=>deps.indexOf(c)>=0);
}
function applyState(raw, changed){
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
    // 「切換影音帳號」只有真的有兩家以上時才長出來
    { const bb=document.getElementById("brandBtn");
      if(bb){ bb.style.display=brandMulti()?"":"none";
        bb.textContent=(brandMulti()&&brandPicked())?("🎬 "+T("切換影音帳號（目前：","Switch account (now: ")+brandName(BRAND)+(currentRole()==="intl"?")":"）")):("🎬 "+T("切換影音帳號","Switch account")); } }
    { const lb=document.getElementById("logoutBtn"); if(lb) lb.textContent=isIntl?"Log out":"登出"; }
    { const gb=document.getElementById("hgearBtn"); if(gb) gb.title=isIntl?"More settings":"更多設定"; }
    if(!CUR_TAB || !myTabs().some(t=>t[0]===CUR_TAB)) CUR_TAB=myTabs()[0][0];
    // STATE 一定是最新的（上面 decorate 過了），只是「畫不畫」看這一頁吃不吃得到。
    // 跳過重繪不會讓資料變舊 —— 切到別的分頁時 setTab() 會重畫，拿到的是新的 STATE。
    buildNav();
    if(tabNeedsRender(CUR_TAB, changed)) render();
    autoMoveOrigLang();   // 每次載入跑一次；沒東西可搬就立刻結束（見 origAutoMovable）
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
// 注音／拼音選字的時候按 Enter 只是「挑這個字」，不是要送出。
// 那一下的 keydown 照樣會跑進來、event.key 也還是 'Enter' ——
// 沒擋掉的話字還沒選完就被送出，而且直接存檔（回報：格子的文字會被送出而且存檔）。
// isComposing 是標準做法；少數舊瀏覽器不給就退回看 keyCode 229（IME 專用碼）。
function enterKey(e){ return !!e && e.key==="Enter" && !e.isComposing && e.keyCode!==229; }
// ===== 簡體 → 繁體（OpenCC，只在「顯示」時轉換，不動資料庫）=====
let __s2t=null; const __s2tCache=new Map();
function zhTW(s){ s=(s==null?"":String(s)); if(!__s2t||!s) return s; let r=__s2tCache.get(s); if(r===undefined){ try{ r=__s2t(s); }catch(e){ r=s; } __s2tCache.set(s,r); } return r; }
(function loadOpenCC(){
  function init(){ try{ if(window.OpenCC&&OpenCC.Converter){ __s2t=OpenCC.Converter({from:"cn",to:"tw"}); __s2tCache.clear(); if(typeof render==="function") try{ render(); }catch(e){} } }catch(e){} }
  if(window.OpenCC) return init();
  try{ const s=document.createElement("script"); s.src="https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js"; s.async=true; s.onload=init; document.head.appendChild(s); }catch(e){}
})();
// ── 影片索引：影片庫每一列都要問「這支的版本有哪些」，沒有索引就是每一列掃一次全表
// （主管視角 4000 支片實測 4.8 秒，剪輯視角只要 0.13 秒 —— 差在那三次全表掃描）。
// decorate() 每次同步都把 STATE.videos 換成新陣列，拿陣列身分當快取鍵就夠；
// 再比一次長度，是因為測試會就地 push（app.js 本身一律整個換掉，不就地改）。
// ⚠️ 要新增／移除影片請整個換掉 STATE.videos，不要就地 push。
let VIDX=null, VIDX_SRC=null, VIDX_N=-1;
function vidxBuild(){
  // 索引要含大流：vid(id) 是全系統的通用反查，月排程、操作紀錄、二創都靠它。
  // STATE.videos 已經把大流抽走了，所以這裡要自己接回來（見 decorate 的說明）。
  const vs=allLibVideos();
  if(VIDX_SRC===vs && VIDX_N===vs.length) return VIDX;
  const byId=new Map(), bySrc=new Map();
  vs.forEach(v=>{ byId.set(v.id, v);
    if(!v.sourceVideoId) return;
    let a=bySrc.get(v.sourceVideoId); if(!a) bySrc.set(v.sourceVideoId, a=[]); a.push(v); });
  VIDX={byId, bySrc}; VIDX_SRC=vs; VIDX_N=vs.length; return VIDX;
}
function vid(id){ return vidxBuild().byId.get(id); }
// ⚠️ 內部用：回傳的是索引裡的共用陣列。呼叫端一律要再 filter 出自己要的那些
// （filter 會產生新陣列），絕對不能拿去就地 sort，否則索引就被改壞了。
function versionsOfSrc(sourceId){ return vidxBuild().bySrc.get(sourceId)||[]; }
function val(id){ const e=document.getElementById(id); return e?e.value:""; }
// 只標出「寵粉／代理招商」；流量型與未分類不顯示（多數都是流量型，不必特別寫）
function typeTag(t){ if(t!=="寵粉"&&t!=="代理招商") return ""; return `<span class="tag ${t==="寵粉"?"sales":""}">${esc(dataLabel(t))}</span>`; }

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
    <b style="font-size:18px">${T("請先設定你自己的密碼","Set your own password first")}</b>
    <div class="muted" style="font-size:13px;margin-top:6px;line-height:1.8">
      ${T("設定一組只有你知道的密碼之後才能開始使用。<br>系統不會保留你的密碼原文，忘記只能請管理員重設。",
          "Pick a password only you know before you start.<br>We never store your password itself — if you forget it, only the admin can reset it.")}</div>
    <label style="margin-top:14px">${T("新密碼（至少 "+PW_MIN+" 碼）","New password (at least "+PW_MIN+" characters)")}</label>
    <input id="pwg1" type="password" autocomplete="new-password" placeholder="${T("輸入新密碼","Enter a new password")}">
    <label style="margin-top:10px">${T("再輸入一次","Enter it again")}</label>
    <input id="pwg2" type="password" autocomplete="new-password" placeholder="${T("再輸入一次","Enter it again")}" onkeydown="if(enterKey(event))savePwGate()">
    <button class="btn" style="width:100%;margin-top:14px;font-size:16px;padding:12px" onclick="savePwGate()">${T("設定密碼並開始使用","Save and start")}</button>
    <div class="muted" style="font-size:12px;margin-top:10px">${T("忘記密碼時，請管理員到「設定 → 成員」幫你重設。","If you forget it, ask the admin to reset it in Settings → Members.")}</div>
  </div>`;
}
async function savePwGate(){
  const a=(val("pwg1")||"").trim(), b=(val("pwg2")||"").trim();
  const err=pwRuleError(a,b); if(err){ toast(err,true); return; }
  const u=((STATE&&STATE.users)||[]).find(x=>x.name===realUser());
  if(await pwCheck(u, a)){ toast(T("不能沿用原本的密碼","You can't reuse your current password"),true); return; }
  // pw:"" ＝ 把明文清掉；之後只留 pwHash
  const body={pwHash: await pwMakeHash(a), pw:"", pwSet:true};
  // 出勤從這一刻開始算。第二次改密碼不會重設，否則等於把之前的出勤洗掉。
  if(!(u&&u.pwAt)) body.pwAt=nowIso();
  const okDone=await write("PUT","/api/users/"+realUser(),body,T("密碼已設定，開始使用吧","Password saved — you're all set"));
  if(okDone){ applyState(LAST_RAW); }
}
function render(){
  if(!STATE) return;
  refreshToday();   // 分頁掛著跨午夜也不會拿到昨天的日期
  const v = document.getElementById("view");
  if(mustSetPw()){ v.classList.remove("anim"); v.innerHTML=pwGateHTML(); LAST_RENDER_TAB="__pw"; return; }
  // 同一頁重繪（新增/編輯/同步）時保留捲動位置，不跳回頂端；切換分頁則回到頂端
  const same=(LAST_RENDER_TAB===CUR_TAB);
  const sy=same?window.scrollY:0;
  const vsOld=v.querySelector(".vidscroll"); const vst=(same&&vsOld)?vsOld.scrollTop:0;
  // 自己會捲動的區塊（待認領清單…）也要記位置。認領一支之後清單重畫，
  // 沒有這段就會跳回那一塊的最上面，下一支要重新捲下去找。
  const keep=same?keepScrollSnapshot(v):{};
  // 正在打字的那一格（同一頁重繪才接回去；換分頁本來就該重來）
  const foc=same?focusSnapshot(v):null;
  const viewAsBanner = VIEW_AS ? `<div class="card" style="border:1px solid var(--accent);background:var(--espresso);color:#F6ECDA;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
    <b>👁 員工視角：${esc(VIEW_AS)}　<span style="font-weight:400;opacity:.85;font-size:13px">（你是管理員，正在預覽他看到的畫面・唯讀）</span></b>
    <button class="btn sm" style="white-space:nowrap" onclick="exitViewAs()">離開員工視角</button></div>` : "";
  // 兩種狀況要講，而且要一直掛在畫面上（toast 會消失，這種事不能只講一次）：
  //   ① 連不上 —— 你現在做的任何事別人都看不到
  //   ② 連上了但還有東西沒送出去 —— 你看得到、別人看不到
  const banner = !ONLINE
    ? `<div class="card" style="border-color:var(--red)"><b style="color:var(--red)">⚠ ${T("連不上伺服器","Can't reach the server")}</b>
        <div style="font-size:13px;margin-top:4px">${T(
          "你現在做的事（打卡、交辦、回報）只存在這台電腦上，主管跟同事都看不到。先不要關掉這個分頁 —— 網路恢復就會自動補送。一直不行請跟主管說一聲。",
          "Anything you do now (clock-in, tasks, updates) only exists on this computer — nobody else can see it. Don't close this tab; it will send itself once you're back online. Tell your manager if it doesn't clear.")}</div></div>`
    : (PENDING
    ? `<div class="card" style="border-color:var(--gold)"><b style="color:var(--gold-dk)">⏳ ${T("有資料還沒送出去","Some changes haven't been sent yet")}</b>
        <div style="font-size:13px;margin-top:4px">${T(
          "還在送，先不要關掉這個分頁。送完這行字會自己消失。",
          "Still sending — don't close this tab. This message disappears once it's through.")}</div></div>`
    : "");
  // 操作紀錄只有管理員看得到，點進來才去訂閱（其他 21 個人不用白白下載）
  if(CUR_TAB==="log"){ try{ if(window.DB&&window.DB.watchLogs) window.DB.watchLogs(); }catch(e){} }
  // 影片（874 筆）也是按需訂閱：行銷／客服／出貨的每一個分頁，
  // 有影片資料跟沒有影片資料畫出來的東西一模一樣（逐頁比對過），他們是純粹白下載。
  // （人資 v152 移出去了 —— 他有「剪輯成效」要查，真的用得到。）
  // watchVideos 自己有防重，呼叫幾次都只會訂閱一條。
  if(needVideos()){ try{ if(window.DB&&window.DB.watchVideos) window.DB.watchVideos(); }catch(e){} }
  const fn = { dashboard:viewDashboard, flow:viewFlow, team:viewTeam, output:viewOutput, attend:viewAttend, cal:viewCal, work:viewWork, videos:viewVideos, videosDF:viewVideosDF, settings:viewSettings, log:viewLog, trash:viewTrash, perf:viewPerf, match:viewMatch, }[CUR_TAB] || (()=>"");
  v.classList.toggle("anim", !same);   // 只在「切換分頁」時做進場動畫；同頁資料同步重繪不動畫（避免閃動）
  // 有兩家以上、而且這台裝置還沒選過 → 先讓他選一次，選完就再也不問
  if(brandMulti() && !brandPicked()){
    v.classList.remove("anim"); v.innerHTML = brandPickHTML(); LAST_RENDER_TAB="__brand"; return;
  }
  v.innerHTML = viewAsBanner + banner + fn();
  LAST_RENDER_TAB=CUR_TAB;
  const vsNew=v.querySelector(".vidscroll"); if(vsNew && vst) vsNew.scrollTop=vst;
  keepScrollRestore(v, keep);
  focusRestore(v, foc);
  if(same && sy) requestAnimationFrame(()=>window.scrollTo(0,sy));
}
// 帶 class="keepscroll" 且有 id 的區塊，重繪前後把捲動位置接回去
function keepScrollSnapshot(v){
  const m={};
  try{ (v.querySelectorAll(".keepscroll[id]")||[]).forEach(el=>{ if(el.scrollTop) m[el.id]=el.scrollTop; }); }catch(e){}
  return m;
}
function keepScrollRestore(v, m){
  if(!m) return;
  try{ Object.keys(m).forEach(id=>{ const el=v.querySelector('[id="'+id+'"]'); if(el) el.scrollTop=m[id]; }); }catch(e){}
}
// ── 正在打字的那一格，重繪前後要接回去（v153）──────────────────────
// render() 是把整個 #view 的 innerHTML 重寫一遍，所以正在編輯的那個 <input>
// 會被連根換掉 —— 打到一半的字、游標位置、焦點，全部沒了。
//
// 26 個人共用同一份 Firestore，任何人打卡／完成交辦／存影片都會推一次快照，
// 全公司跟著重繪。實測正式資料的 5502 筆操作紀錄：一般時段每 6.7 分鐘一次，
// **最忙的時段每 29 秒一次**；而打一則工作回報要 20–40 秒。
// 所以「打到一半整段不見」是天天在發生 —— 只是這種事員工只會覺得「怪怪的」，
// 回報不出來，所以一直沒被抓到。（真瀏覽器實測：管理員交辦、剪輯工作回報、
// 客服新增工作，三個都是同事一動作就整段清空。）
//
// 程式裡本來就有這道防護，但只裝在跨午夜的 midnightWatch 上（「正在打字就先不翻」），
// 同步觸發的那條路沒裝。這裡照 keepScroll 那組的做法補上。
// 彈窗不受影響 —— render() 不碰 #modalRoot。
function focusSnapshot(v){
  try{
    const ae=document.activeElement;
    if(!ae || !ae.id || !v.contains || !v.contains(ae)) return null;
    if(!/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName||"")) return null;
    const o={id:ae.id, value:ae.value, checked:!!ae.checked};
    // 游標位置只有文字類欄位讀得到（date、checkbox 讀 selectionStart 會丟例外）
    try{ o.s=ae.selectionStart; o.e=ae.selectionEnd; }catch(err){}
    return o;
  }catch(e){ return null; }
}
function focusRestore(v, f){
  if(!f) return;
  try{
    const el=v.querySelector('[id="'+f.id+'"]');   // 跟 keepScrollRestore 同一種找法
    if(!el) return;
    // ⚠️ 手上正在編輯的內容永遠贏過重繪出來的值 —— 那是他還沒送出的東西，
    //    重繪只是「別人做了別的事」，沒有理由蓋掉他打到一半的字。
    if(typeof f.value==="string" && el.value!==f.value) el.value=f.value;
    if(el.type==="checkbox"||el.type==="radio") el.checked=f.checked;
    // preventScroll：focus() 預設會把畫面捲到該元素，那會跟下面接捲動位置的那段打架
    try{ el.focus({preventScroll:true}); }catch(err){ try{ el.focus(); }catch(e2){} }
    if(f.s!=null && el.setSelectionRange){ try{ el.setSelectionRange(f.s, f.e); }catch(err){} }
  }catch(e){}
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
// CAL_PLAT_FOR＝這個預設是為哪個職位套的。職位沒變就不再套，使用者選了什麼就是什麼。
let CAL_PLAT="tw", CAL_PLAT_FOR=null;
// 使用者自己選了就記下「這個職位的預設已經套過了」，之後不再蓋掉他的選擇
function calSetPlat(p){ CAL_PLAT=p; CAL_PLAT_FOR=currentRole(); render(); }
function viewCal(){
  // 依分區：台灣看 中文／蝦皮／馬來西亞，海外看 英文／泰文。
  // 順序按區分組，這樣自動落點（plats[0]）對兩邊都是最常用的那一個。
  const allPlats=[["tw",T("中文","Chinese")],["shopee",T("蝦皮","Shopee")],["ms",T("馬來西亞","Malaysia")],
                  ["sunny","Boss Sunny"],
                  ["en",T("英文","English")],["th",T("泰文","Thai")]];
  const plats=allPlats.filter(([k])=> seesZone(zoneOfPlat(k)));
  // 預設落在哪個平台依「職位」給，海外落在英文。
  // ⚠️ 每個職位只套一次：寫成「每次重繪都套」的話，使用者切到別的平台會被彈回來；
  //    寫成「全域只套一次」的話，換人登入就套不到了（同一個分頁換帳號）。
  // ⚠️ 以前是靠「這個人看得到哪些平台」推出來的 —— v142 之後人人都看得到全部，
  //    那個推法就失效了（海外會落在中文）。預設跟權限是兩件事。
  { const r=currentRole();
    if(CAL_PLAT_FOR!==r){ CAL_PLAT_FOR=r; CAL_PLAT=(r==="intl")?"en":"tw"; } }
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
    // 同一支片同一天可能有兩格（原片＋二創），所以要指名是第幾格，不然永遠動到第一格
  const si = (it.slotIdx==null?-1:it.slotIdx);
  const onChg = reused ? `moveReuse('${it.videoId}','${ds}',this.value,${si})` : `rescheduleVid('${it.videoId}',this.value,'${ds}')`;
    const tm = reused ? (it.slot.time||"") : (v?.publishTime||"");
    // 剪輯・時間・連結併成標題下方一行小字（省空間、避免欄位被擠到逐字換行）
    const sub=[ ed?`${T("剪輯","Editor")} ${esc(ed)}${reused?T('（重播）',' (rerun)'):''}`:'', tm?esc(tm):'',
      upLink?`<a href="${esc(upLink)}" target="_blank">${T("上傳","Upload")}</a>`:'', drive?`<a href="${esc(drive)}" target="_blank">${T("存檔","File")}</a>`:'' ].filter(Boolean).join(' ・ ');
    // 指派給別人的照樣列出來（不然月曆上的「排了幾支」會跟看得到的列數對不上），
    // 但片名不是連結、點不開；改日期與移出排程照舊 —— 排程跟剪輯是兩條獨立的線
    const lk=v&&assignLocked(v);
    const titleTxt=esc(v?vidTitle(v):(it.videoId||""));
    return `<tr${lk?` class="vlock" title="${esc(assignLockTip(v))}"`:''}>
      <td data-label="${T("影片","Video")}">${lk?`<span>${titleTxt}</span>`:`<a href="javascript:void(0)" onclick="${vidOpenFn(v||{id:it.videoId})}">${titleTxt}</a>`}${v?assignLockPill(v):""}${v?missingPill(v):""}${v?typeTag(v.mainType):""}${reused?` <span class="tag" style="background:var(--chip);color:var(--gold-dk)">${T("重播","Rerun")}</span>`:''}${reused?dfVerPill(it.slot):''}
        <div class="muted" style="font-size:12px;margin-top:3px">${sub||'—'}</div></td>
      <td data-label="${T("改上片日","Move to")}"><input type="date" value="${ds}" style="font-size:12px;padding:4px;min-width:128px" onchange="${onChg}"></td>
      <td data-label="${T("操作","Action")}"><button class="btn sec sm" style="white-space:nowrap" onclick="${reused?`unscheduleReuse('${it.videoId}','${ds}',${si})`:`unscheduleVid('${it.videoId}','${ds}')`}" title="${T("只把這支移出這天的排程，影片本身不會刪除","Removes from this day only — the video stays")}">${T("移出排程","Unschedule")}</button></td>
    </tr>`;
  }).join("");
  // 排一支影片到這天：所有影片都能選（排程與剪輯是兩條獨立的線）；當天已排過的不再出現
  const dayCount = list.length; const autoTime = PUB_TIMES[dayCount] || PUB_TIMES[PUB_TIMES.length-1];
  // 時間欄給彈性寬、按鈕不縮 —— 原本兩者都沒設 flex，窄螢幕上 time input 會撐爆把按鈕壓過去
  const timeField = `<div style="flex:1 1 130px;min-width:0"><label style="margin:0 0 2px">${T("上片時間","Time")}</label>
    <input id="od_time" type="time" value="${autoTime}" style="width:100%"></div>`;
  OD_DS=ds;
  const picker = `<div class="card" style="border-color:var(--accent)"><b>${T("排一支影片到這天","Schedule a video on this day")}</b>
    <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">
      <input id="od_q" placeholder="${T("搜尋編號／片名","Search code / title")}" value="${esc(OD_Q)}" oninput="OD_Q=this.value;odFilter()" style="flex:1;min-width:140px">
      <label style="display:inline-flex;align-items:center;gap:5px;margin:0;font-size:12px;white-space:nowrap"
        title="${T("已經排在今天或之後的不列出來；舊片可以重播，所以照樣看得到","Hides videos already placed on today or later; old videos stay — they can be rerun")}">
        <input type="checkbox" id="od_uns" ${OD_UNSCHED?"checked":""} onchange="OD_UNSCHED=this.checked;odFilter()" style="width:auto;margin:0">
        ${T("只看還沒排的","Unscheduled only")}</label>
    </div>
    <div id="od_cats">${odCatTabs(ds)}</div>
    <div id="od_list" style="margin-top:8px">${odSelectHTML(ds)}</div>
    <div class="row" style="gap:8px;margin-top:8px;align-items:flex-end;flex-wrap:nowrap">
      ${timeField}
      <button class="btn" id="od_add" style="flex:0 0 auto;min-height:44px;white-space:nowrap" onclick="odAdd('${ds}')">${T("排入","Add")}</button>
    </div>
    <div id="od_hint" class="muted" style="font-size:12px;margin-top:6px"></div>
    <div id="od_ver" style="display:none">
      <label style="margin:8px 0 2px">${T("要排哪一版","Which version")}</label>
      <select id="od_verSel"></select>
      <div class="muted" style="font-size:12px;margin-top:4px">${T(
        "二創沿用原片的名字，所以排進來會長得一樣 —— 選了版本之後，月排程上會標一個數字分辨。",
        "Remakes reuse the original's name; picking a version tags it with a number on the schedule.")}</div>
    </div>
    <div id="od_reuse" style="display:none">
      <label style="margin:8px 0 2px">${T("存檔位置（雲端備份・自動帶入，同一支都一樣）","File location (auto-filled)")}</label>
      <input id="od_drive" placeholder="${T("這支影片的雲端備份連結","Cloud backup link")}">
      <label style="margin:8px 0 2px">${T("上傳連結（這次發佈的社群網址・每次可能不同，手動貼上）","Upload URL (this rerun's post — paste manually)")}</label>
      <input id="od_link" placeholder="${T("貼上這次重播要發佈的連結（可先排、之後再補）","Paste the post URL (can add later)")}">
    </div>
  </div>`;
  const b = dayBreakdown(ds);
  const summary = `<div class="row" style="gap:8px;margin-bottom:8px">`+
    `<span class="pill ${b.full?'ok':'em'}">${T("已排","Scheduled")} ${b.total}/${b.target}${b.full?'':T(`（還缺 ${b.short}）`,` (need ${b.short})`)}</span></div>`;
  showModal(`${ds}（${currentRole()==="intl"?["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(ds+"T00:00:00").getDay()]:weekdayZh(ds)}）`, `
    <div class="card"><b>${T("當日影片","Videos this day")}</b>
      ${summary}
      <table class="responsive daytbl"><thead><tr><th>${T("影片（剪輯・時間・連結）","Video (editor · time · links)")}</th><th>${T("改上片日","Move to")}</th><th>${T("操作","Action")}</th></tr></thead>
      <tbody>${rows||`<tr><td class="muted">${T("當日尚無影片","Nothing scheduled")}</td></tr>`}</tbody></table>
    </div>
    ${picker}`, null);
  odPickVid();   // 帶出第一支的說明與（舊片才有的）重播欄位
}
// ── 月曆某天的「排一支影片」選單 ──────────────────────────────
// 所有影片都能選：排日期的人跟剪片的人可以分頭做，不必等剪完才排得進去。
let OD_DRIVE={}, OD_Q="", OD_UNSCHED=false, OD_CAT="all", OD_DS="";
// 三類（互斥、涵蓋全部）：舊片＝播過了、已剪好的新片＝剪完但還沒到上片日、還沒剪好的毛片＝待處理／剪輯中
function odCat(v){ return vidIsOld(v) ? "old" : (isPublished(v) ? "done" : "raw"); }
const OD_CATS=[["all","全部","All"],["raw","還沒剪好的毛片","Raw · not cut"],
               ["done","已剪好的新片","New · cut"],["old","舊片","Old"]];
// 分類鈕之前的共同底：排除當天已排過的，再套「只看還沒排的」
function odBase(ds){
  const used=new Set(dayVideoList(ds).map(it=>it.videoId));
  // 大流的片也排得進來（成果面共用同一份月排程）；版本殼走各自的月曆
  let list=allLibVideos().filter(v=>isSourceVid(v) && !used.has(v.id));
  // 「只看還沒排的」＝濾掉已經排在今天或之後的；舊片的排程日在過去，重播不受影響
  if(OD_UNSCHED) list=list.filter(v=>!(v.scheduledDate && String(v.scheduledDate).slice(0,10)>=today));
  return list;
}
function odCandidates(ds){
  const q=String(OD_Q||"").toLowerCase().trim();
  let list=odBase(ds);
  if(OD_CAT!=="all") list=list.filter(v=>odCat(v)===OD_CAT);
  if(q) list=list.filter(v=>[v.name,v.rawName,v.code,v.editor].map(x=>String(x||"").toLowerCase()).join("  ").includes(q));
  // 還沒播過的排前面（那是這次要排的主角），舊片墊後；同群依編號
  return list.sort((a,b)=> (vidIsOld(a)?1:0)-(vidIsOld(b)?1:0)
    || String(vidCode(a)).localeCompare(String(vidCode(b))));
}
// 分類快選：沿用影片庫那排分頁籤的樣式與講法
function odCatTabs(ds){
  const base=odBase(ds), n={all:base.length, old:0, done:0, raw:0};
  base.forEach(v=>{ n[odCat(v)]++; });
  return `<div class="vtabs" style="margin-top:8px">${OD_CATS.map(([k,zh,en])=>
    `<button class="vtab ${OD_CAT===k?'on':''}" onclick="odSetCat('${k}')"><span>${T(zh,en)}</span> <span class="vtab-n">${n[k]}</span></button>`
  ).join("")}</div>`;
}
function odSetCat(k){ OD_CAT=OD_CATS.some(c=>c[0]===k)?k:"all"; odFilter(); }
function odSelectHTML(ds){
  const list=odCandidates(ds);
  // 存檔位置（雲端備份）＝這支影片本來的存檔，重播都一樣 → 切換影片時自動帶入
  OD_DRIVE={}; list.forEach(v=>{ OD_DRIVE[v.id]=v.driveFolder||""; });
  if(!list.length) return `<p class="muted" style="margin:0;font-size:13px">${T("沒有符合的影片。","No matching videos.")}</p>`;
  return `<label style="margin:0 0 2px">${T("選一支影片","Pick a video")}${paren(list.length)}</label>
    <select id="od_vid" onchange="odPickVid()">${list.map(v=>{
      const tail=vidIsOld(v) ? T("・舊片・已用 "+usageList(v).length+" 次"," · old · used "+usageList(v).length+"x")
                             : "・"+stageLabel(v.stage);
      return `<option value="${v.id}">${esc(vidTitle(v))}${esc(tail)}</option>`; }).join("")}</select>`;
}
function odFilter(){
  const c=document.getElementById("od_cats"); if(c) c.innerHTML=odCatTabs(OD_DS);   // 數字會跟著「只看還沒排的」變
  const e=document.getElementById("od_list"); if(e) e.innerHTML=odSelectHTML(OD_DS);
  odPickVid();
}
// 換一支影片時：帶出存檔位置、切換重播專用欄位、把「按下去會發生什麼」寫清楚
function odPickVid(){
  const id=val("od_vid"), v=vid(id), old=!!v && vidIsOld(v);
  // 版本選單只在「大流的片、而且真的做過二創」時出現 —— 沒做過二創就只有原片一個選項，
  // 多一個永遠只能選同一項的下拉只是雜訊
  { const opts=(v&&isDF(v))?dfVerOptions(v):[];
    const box=document.getElementById("od_ver"); const sel=document.getElementById("od_verSel");
    const on=opts.length>1;
    if(box) box.style.display=on?"":"none";
    if(sel && on) sel.innerHTML=opts.map(([n,l])=>`<option value="${n}">${esc(l)}</option>`).join(""); }
  const d=document.getElementById("od_drive"); if(d) d.value=OD_DRIVE[id]||"";
  const box=document.getElementById("od_reuse"); if(box) box.style.display=old?"":"none";
  const btn=document.getElementById("od_add"); if(btn) btn.textContent=old?T("排入重播","Add rerun"):T("排入","Add");
  const hint=document.getElementById("od_hint");
  if(hint) hint.textContent = !v ? ""
    : old ? T("這支已經播過 → 排成「重播」，原本的預排上片日不會被改掉。",
              "Already aired → added as a rerun; its original scheduled date stays.")
          : T("這支還沒播過 → 直接把它的「預排上片日」設成這天（還沒剪完也可以先排）。",
              "Not aired yet → sets its scheduled upload date to this day (fine even if editing is unfinished).");
}
// 排入：舊片＝重播（另存一筆排片紀錄）；其餘＝直接設定它的預排上片日
function odAdd(ds){
  const id=val("od_vid"); if(!id){ toast(T("請先選一支影片","Pick a video first"),true); return; }
  const v=vid(id)||{};
  if(vidIsOld(v)){
    // 大流的二創沿用原片的名字，排進來會長得一樣 —— 帶上版本號才分得出是哪一版
    const ver=(isDF(v) && document.getElementById("od_verSel")) ? (+val("od_verSel")||1) : 1;
    write("POST",`/api/videos/${id}/reuse`,{date:ds,time:val("od_time"),link:(val("od_link")||"").trim(),drive:(val("od_drive")||"").trim(),ver},
      T(ver>1?("已排入第 "+ver+" 版"):"已排入重播","Rerun scheduled")).then(ok=>{ if(ok) openDay(ds); });
  }else{
    write("PUT",`/api/videos/${id}`,{video:{scheduledDate:ds, publishTime:val("od_time")}},
      T("已排到 "+ds,"Scheduled for "+ds)).then(ok=>{ if(ok) openDay(ds); });
  }
}
// 移動「重播」排片到別天（同步更新使用紀錄的日期）
async function moveReuse(id, oldDate, newDate, slotIdx){ if(!newDate||newDate===oldDate) return; if(dbBlocked()) return;
  const day=(STATE.schedule||{})[oldDate]||{slots:[]};
  // slotIdx 指名是哪一格（同一支片同一天可能排了原片＋二創兩格）；沒帶就退回找第一格
  const idx=(slotIdx!=null && slotIdx>=0 && (day.slots||[])[slotIdx] && day.slots[slotIdx].videoId===id)
    ? slotIdx : (day.slots||[]).findIndex(s=>s.videoId===id && s.reused);
  const link=(idx>=0?(day.slots[idx].publishedLink||""):"");
  const ver=(idx>=0?dfVerOf(day.slots[idx]):1);   // 版本號要跟著搬，不然搬完就分不出是哪一版
  try{
    if(idx>=0) await route("DELETE",`/api/schedule/${oldDate}/slot/${idx}`,{});
    await route("POST",`/api/schedule/${newDate}/slot`,{slot:{videoId:id,publishedLink:link,reused:true,by:currentUser(),at:nowIso(),ver}});
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
async function unscheduleReuse(id, ds, slotIdx){ if(dbBlocked()) return;
  const v=vid(id)||{};
  const slots=((STATE.schedule||{})[ds]||{}).slots||[];
  const idx=(slotIdx!=null && slotIdx>=0 && slots[slotIdx] && slots[slotIdx].videoId===id)
    ? slotIdx : slots.findIndex(s=>s.videoId===id && s.reused);
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
// 日期欄位下方的一排小字：接下來 14 天各排了幾支、還缺幾支，點一下直接填進欄位。
// （手機上的日期選擇器是作業系統畫的，沒辦法在它裡面加東西，所以資訊放在欄位下方）
// 14 天速覽：數字一定要跟「這支片實際會排進去的那個月曆」是同一本。
// 以前寫死中文月曆 —— 海外排英文片的時候看到的是別人的數字（v147）。
function nextDaysStrip(fieldId, days, line, acct){
  const k=line||"tw";
  const brk=(ds)=> k==="tw" ? dayBreakdown(ds) : lineDayBreak(k, ds, acct||"");
  const n=days||14, out=[];
  for(let off=0;off<n;off++){
    const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()+off);
    const ds=d.toISOString().slice(0,10);
    const b=brk(ds);
    out.push(`<button type="button" class="dchip${b.full?' full':''}" onclick="pickDate('${fieldId}','${ds}')"
      title="${T(ds+"：已排 "+b.total+" 支／目標 "+b.target+" 支", ds+": "+b.total+" of "+b.target+" scheduled")}">${fmtMD(ds)}
      <b>${b.total}</b><span>/${b.target}</span></button>`);
  }
  return `<div class="muted" style="font-size:12px;margin-top:6px">${T("接下來 14 天各排了幾支（點一下帶入）：","Next 14 days — scheduled / target (tap to fill):")}</div>
    <div class="dstrip">${out.join("")}</div>`;
}
// 編輯視窗裡「這支片會排進哪一本月曆」那一塊。
//
// 中文／馬來西亞拍的源片 → 中文月曆，跟以前一樣，什麼都不用選。
// 英文／泰文拍的源片 → 英文／泰文月曆，而那些月曆是**依帳號**分的，
// 所以要多選一個帳號，不然這支排了日期會兩邊都看不到。
function schedLineLabel(k){
  return k==="tw" ? T("中文月排程","Chinese schedule")
       : k==="en" ? T("英文 TikTok 排程","English TikTok schedule")
       : k==="th" ? T("泰文 TikTok 排程","Thai TikTok schedule")
       : (CHANNELS[k] ? T(CHANNELS[k].label+"排程", CHANNELS[k].labelEn+" schedule") : k);
}
function schedBoxHTML(v, langOverride, acctOverride){
  const lang = langOverride!=null ? langOverride : origLangOf(v);
  const k = INTL_LOCALES.includes(lang) ? lang : (lineOf(v)||"tw");
  const isLine = k!=="tw";
  const accts = isLine ? lineAccounts(k) : [];
  const cur = acctOverride!=null ? acctOverride : String((v&&v.account)||"");
  const acctSel = (isLine && accts.length) ? `
    <label style="margin-top:8px">${T("排到哪個帳號的月曆","Which account's schedule")}</label>
    <select id="e_acct" onchange="renderSchedBox()">
      <option value="">${T("— 請選擇 —","— pick one —")}</option>
      ${accts.map(a=>`<option ${a===cur?'selected':''}>${esc(a)}</option>`).join("")}
    </select>` : "";
  const noAcct = (isLine && !accts.length) ? `<div class="muted" style="font-size:11px;margin-top:6px;color:var(--red)">${T(
      "「"+schedLineLabel(k)+"」還沒有設定帳號，請管理員先到設定頁加。",
      "No account set up for the "+schedLineLabel(k)+" yet — ask the admin to add one.")}</div>` : "";
  const where = `<div class="muted" style="font-size:11px;margin-top:6px">${T(
      "這支會排進「"+schedLineLabel(k)+"」。","This one goes on the "+schedLineLabel(k)+".")}</div>`;
  return where + acctSel + noAcct + nextDaysStrip("e_date", 14, k, isLine?cur:"");
}
function renderSchedBox(){
  const box=document.getElementById("e_schedbox"); if(!box) return;
  const lang=(typeof val==="function" && document.getElementById("e_lang")) ? val("e_lang") : null;
  const acct=document.getElementById("e_acct") ? val("e_acct") : null;
  box.innerHTML=schedBoxHTML(vid(MODAL_VID)||{}, lang, acct);
}
function pickDate(fieldId, ds){
  const e=document.getElementById(fieldId); if(!e) return;
  e.value=ds; MODAL_DIRTY=true;
  if(typeof e.dispatchEvent==="function" && typeof Event==="function"){ try{ e.dispatchEvent(new Event("change",{bubbles:true})); }catch(err){} }
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
// 今天要做的事：今天排的 ＋ **以前排的但還沒做完的**。
// 原本只有「主管交辦的」會延到隔天，自己排的沒做完隔天就消失 —— 那等於幫人忘記，
// 而且看板上也查不到它去哪了。沒做完就一直留在原本的位置，直到打勾為止。
// 排在未來的不算（那些在「之後要做」，到那天才會進來）。
function taskOverdue(t){ return isTask(t) && !t.done && String(t.date||"")<today; }
// 做完的當天還要留著，隔天才收掉。勾完就當場消失會讓人以為東西不見了，也沒辦法反悔。
// 要看 doneAt（哪一天做完的）不是 date（哪一天排的）—— 一件拖了三天的事今天才做完，
// 它的 date 是三天前，只看 date 的話一打勾就從畫面上蒸發。
function taskDoneToday(t){ return !!(t && t.done && String(t.doneAt||"").slice(0,10)===today); }
function myTasks(){ return Object.values((STATE&&STATE.tasks)||{})
  .filter(t=>isTask(t) && t.user===currentUser() && (t.date===today || taskOverdue(t) || taskDoneToday(t)))
  .sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))
             || String(a.createdAt||"").localeCompare(String(b.createdAt||""))); }
// 沒做完的事拖了幾天（今天排的回 0）。畫面上要標出來，不然清單會無聲地越積越長。
function taskLateDays(t){ const d=String((t&&t.date)||""); if(!d || d>=today) return 0; return daysBetween(d, today); }
function taskLatePill(t){ const n=taskLateDays(t); if(!n) return "";
  return ` <span class="pill ${n>=3?'em':'wa'}" style="font-size:10px">${
    n===1?T("昨天沒做完","from yesterday"):T(n+" 天前的", n+"d overdue")}</span>`; }
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
function rememberContact(name){ if(VIEW_AS) return;   // 員工視角是唯讀預覽，連順手記下的窗口都不該寫進去
  const c=String(name||"").trim(); if(!c) return;
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
const TPL_ROLES=[["all","全部"],["editor","剪輯"],["mkt","行銷"],["pick","選品行銷"],["svc","客服"],["ship","出貨"],["cs","員工"],["intl","巴基斯坦"]];
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
// 設定頁：多長一列公司出來（純畫面，按「確認送出設定」才會存）
function addBrandRow(){
  const tb=(document.querySelectorAll(".brd_name")[0]||{}).closest ? document.querySelectorAll(".brd_name")[0].closest("tbody") : null;
  if(!tb){ toast("找不到公司清單",true); return; }
  const tr=document.createElement("tr");
  tr.innerHTML='<td data-label="代號"><input class="brd_id" placeholder="care" style="font-size:13px"></td>'
    +'<td data-label="公司名稱"><input class="brd_name" placeholder="長照機構" style="font-size:13px"></td>'
    +'<td data-label="編號前綴"><input class="brd_pfx" maxlength="6" placeholder="例 C" style="font-size:13px"></td>'
    +'<td data-label="每日上片目標"><input class="brd_target" type="number" min="0" max="99" placeholder="沿用上面的" style="font-size:13px"></td>'
    +'<td data-label=""><button class="btn sec sm" onclick="this.closest(\'tr\').remove()">✕</button></td>';
  tb.appendChild(tr);
}
function presetPending(){
  // 只看「今天」已經帶進來的。myTasks() 現在會把以前沒做完的一起帶著（v130），
  // 拿它來判斷會讓昨天沒做完的那件「填寫今日工作日誌」把今天的按鈕吃掉 ——
  // 每日固定工作是一天一件，昨天那件是昨天的帳。
  const have=new Set(myTasks().filter(t=>t.date===today).map(t=>String(t.title||"").trim()));
  return workPresets().filter(t=>!have.has(t));
}
async function addPresetTask(title){ refreshToday();
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
async function createTask(){ refreshToday(); const isIntl=currentRole()==="intl";
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
async function assignTaskSel(){ refreshToday(); if(dbBlocked()) return; const name=val("asg_who"); const t=val("asg_txt").trim(); const contact=(val("asg_contact")||"").trim();
  if(!name){ toast("請先選擇要指派的員工",true); return; }
  if(!t){ toast("請輸入要指派的工作內容",true); return; }
  const id=uid("T");
  try{ await window.DB.set("tasks", id, {id, user:name, date:today, title:t, contact, report:"", done:false, assignedBy:currentUser(), ack:false, createdAt:nowIso()});
    if(contact) rememberContact(contact);
    const a=document.getElementById('asg_txt'); if(a) a.value=''; const c=document.getElementById('asg_contact'); if(c) c.value=''; toast("已指派給 "+name); }
  catch(e){ toast("指派失敗，請稍後再試",true); } }
// 人資發 HR 通知：可以指定一個人或全體；對方畫面會跳出來，按小小的「收到」即可（不用回報、不算交辦）
async function hrNotify(){ refreshToday(); if(dbBlocked()) return;
  const who=val("hrn_who"); const txt=val("hrn_txt").trim();
  if(!txt){ toast("請輸入通知內容",true); return; }
  const roles=noticeTargetRoles(who);
  const targets = roles ? staffNamesSorted(roles) : (who?[who]:[]);
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
  // 清單不再截斷之後「全選」是真的全選，一次幾百支不該手滑就送出去
  if(ids.length>=20 && !confirm("要把 "+ids.length+" 支毛片一次指派給「"+who+"」嗎？")) return;
  BULK_BUSY=true; let r={done:0,failed:0};
  try{ r=await bulkRun(ids, id=>window.DB.update("videos",id,{assignedTo:who,updatedAt:nowIso()})); }
  finally{ BULK_BUSY=false; applyState(LAST_RAW); }
  logA("指派毛片 "+r.done+" 支"+(r.failed?("（失敗 "+r.failed+" 支）"):""), who);
  await delay(300); bulkToast(r, "已指派 "+r.done+" 支給「"+who+"」（他認領後才開始計時）", "支");
}
// 收回指派給某員工、但他還沒認領（仍待處理）的毛片，回到公用池
// 防呆：只收回台灣毛片；海外/蝦皮二創殼的 assignedTo＝建立者本人，收回會讓它跑進所有人的清單
async function unassignEditor(name){
  if(dbBlocked()) return;
  const list=(STATE.videos||[]).filter(v=>isSourceVid(v) && v.stage==="待處理" && v.assignedTo===name);
  if(!list.length){ toast("「"+name+"」沒有待認領的指派毛片",true); return; }
  if(!confirm("把指派給「"+name+"」但還沒認領的 "+list.length+" 支毛片收回公用池？")) return;
  BULK_BUSY=true; let r={done:0,failed:0};
  try{ r=await bulkRun(list, v=>window.DB.update("videos",v.id,{assignedTo:""})); }
  finally{ BULK_BUSY=false; applyState(LAST_RAW); }
  logA("收回指派毛片 "+r.done+" 支"+(r.failed?("（失敗 "+r.failed+" 支）"):""), name);
  await delay(300); bulkToast(r, "已收回 "+r.done+" 支到公用池", "支");
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
async function sendMsg(){ refreshToday();
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
  // 源片只看存檔連結（那一格填得到），二創殼才連上片連結一起看。
  // ⚠️ 二創殼的存檔位置一律跟源片同一個資料夾、而且是唯讀的，它永遠不會有「自己的」
  //    資料夾 —— 所以這裡要看整個家族有沒有（familyDrive），不能看它自己有沒有
  //    （ownDrive）。看錯的話「已審過」會永遠掛在這張卡上叫，跟之前那顆熄不掉的
  //    「缺上片連結」是同一個病。
  const linksDone=(v)=>!!((isVersion(v)?familyDrive(v):ownDrive(v))
    && (!needPostLink(v) || String(v.publishedLink||"").trim()));
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
    ${/* 順序＝該處理的先來：被退回（要動手）→ 還在等（要追）→ 已審過（做完了，收起來）。
          v128 之前「已審過」排在「待審核」上面，7 支通過的把該追的擠到最下面，
          使用者的說法是「審片還是在最下面」。 */''}
    ${waitingReview.length?`<div style="margin-top:10px"><b class="muted" style="font-size:13px">⏳ ${T("待審核 — Regina 說 OK 後，自己按「已審過」進下一步","In review — once Regina says OK, tap “Approved” to move on")}（${waitingReview.length}）</b>
      ${waitingReview.map(v=>`<div style="margin-top:6px;padding:7px 9px;background:var(--panel2);border-radius:5px;font-size:13px;display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="min-width:0"><a href="javascript:void(0)" onclick="${openFn(v)}">${shpBadge(v)}${esc(vidTitle(v))}</a>${reviewWaitPill(v)} <span class="muted" style="font-size:12px">${T("完成於","done")} ${esc(String(v.finishedAt||"").slice(0,10))}</span></span>
        <button class="btn sm" style="flex:none" onclick="editorMarkReviewed('${v.id}')" title="${T("Regina 審過了 → 標記通過，開始上傳雲端＋補連結","Regina approved it — mark as passed and start the next step")}">✓ ${T("已審過，下一步","Approved — next")}</button></div>`).join("")}</div>`:''}
    ${approvedTodo.length?`<details class="fold" ${foldState("work.approved", false)} style="margin-top:10px"><summary style="color:var(--gold-dk);font-size:13px">✓ ${T("已審過（通過）","Approved")}<span class="n">${approvedTodo.length}</span>${
      // 收起來也要看得出還有幾支要去補連結，不然收合等於忘記
      (()=>{ const n=approvedTodo.filter(v=>!linksDone(v)).length;
        return n?`<span class="pill em" style="font-size:10px;margin-left:6px">${T(n+" 支還缺連結", n+" need links")}</span>`:""; })()
      }</summary><div class="foldbody">
      ${approvedTodo.map(v=>{ const who=reviewByLabel(v, me);
        if(!linksDone(v)) return `<div style="margin-top:6px;padding:9px;background:var(--amberbg);border-radius:5px">
          <a href="javascript:void(0)" onclick="${openFn(v)}"><b>${shpBadge(v)}${esc(vidTitle(v))}</b></a> <span class="pill ok" style="font-size:10px">${T("已審過","Approved")}</span>
          <div class="muted" style="font-size:12px;margin-top:2px">${who}</div></div>`;
        return `<div style="margin-top:6px;padding:9px;background:var(--greenbg);border-radius:5px;display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="min-width:0"><a href="javascript:void(0)" onclick="${openFn(v)}"><b>${shpBadge(v)}${esc(vidTitle(v))}</b></a> <span class="pill ok" style="font-size:10px">${T("已審過","Approved")}</span>
          <span class="muted" style="font-size:12px"> ${who}・${T("連結都補齊了","links all set")}</span></span>
          <button class="btn sec sm" style="flex:none" onclick="ackReviewedVid('${v.id}')" title="${T("收起這則通知","Dismiss this notice")}">${T("知道了","Got it")}</button></div>`; }).join("")}
      </div></details>`:''}
  </div>`:'';
  return rejCard;
}
// 「是誰按下通過的」寫成一句不會被誤讀的話。
// 原本寫「泓儒 已審過・2026-08-03」—— 這份清單本來就只有自己的片，
// 但名字擺在最前面，看的人會以為那一列是泓儒的。名字要包在「由 … 審過」中間。
function reviewByLabel(v, me){
  const by=String((v&&v.reviewedBy)||"");
  const when=(v&&v.reviewedAt)?("・"+esc(String(v.reviewedAt).slice(5,10))):"";
  if(by && by===me) return T("自己標的","self-marked")+when;
  return T("由 ","approved by ")+esc(by||"Regina")+T(" 審過","")+when;
}
// ── 審片狀態：一支片現在到底審了沒（v128）──────────────────────────
// 這支等審等幾天了（剪完那天算第 1 天）。
// 「等 5 天」跟「好像還沒審」是兩回事 —— 前者拿得出去講，後者只能猜。
function reviewWaitDays(v){ const f=String((v&&v.finishedAt)||"").slice(0,10);
  if(!f) return null; return daysBetween(f, today)+1; }
function reviewWaitPill(v){ const d=reviewWaitDays(v); if(d==null) return "";
  const cls=d>=3?"em":(d>=2?"wa":"");
  return ` <span class="pill ${cls}" style="font-size:10px">${T("等 "+d+" 天","waiting "+d+"d")}</span>`; }
// 一支片的審片狀態，寫成人看得懂的一句話。
// 「通過」要寫出是誰按的 —— 剪輯自己按的跟 Regina 按的長得一樣，不寫出來就分不出來。
function reviewStateHTML(v){
  if(!v) return "";
  if(needsReview(v)) return `<span class="pill wa" style="font-size:10px">${T("還沒審","Not reviewed")}</span>${reviewWaitPill(v)}`;
  if(v.reviewStatus==="退回") return `<span class="pill em" style="font-size:10px">${T("退回","Sent back")}</span>`
    + (v.reviewNote?` <span class="muted" style="font-size:11px">${esc(v.reviewNote)}</span>`:"");
  if(v.reviewStatus==="通過")
    return `<span class="pill ok" style="font-size:10px">${T("已審過","Approved")}</span>`
      + `<span class="muted" style="font-size:11px;margin-left:5px">${reviewByLabel(v, currentUser())}</span>`;
  if(v.stage==="已上片" || String(v.publishedLink||"").trim())
    return `<span class="pill ok" style="font-size:10px">${T("已上片","Published")}</span>`;
  return `<span class="muted" style="font-size:11px">${T("不需審核","No review needed")}</span>`;
}
// 最近 7 天剪完的片（預設摺疊）：一眼看得出哪幾支審過了、哪幾支還在等、等多久。
// 上面那張「審片進度」只講今天要處理的事；這一張是給剪輯自己盤點用的 ——
// 「這三支等五天了」拿得出去提醒主管，「好像還沒審」不行。
function workRecent7Card(me){
  const from=new Date(Date.now()+288e5-6*864e5).toISOString().slice(0,10);   // 含今天共 7 天
  const list=(STATE.videos||[]).filter(v=>!v.deleted && (v.editor===me||v.claimedBy===me)
      && String(v.finishedAt||"").slice(0,10)>=from)
    .sort((a,b)=>String(b.finishedAt||"").localeCompare(String(a.finishedAt||"")));
  if(!list.length) return "";
  const nWait=list.filter(needsReview).length;
  const openFn=(v)=>(v.channel&&CHANNELS[v.channel])?`openChModal('${v.channel}','${v.id}')`:v.locale?`openIntlModal('${v.id}')`:`editVideo('${v.id}')`;
  const rows=list.map(v=>`<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--line)">
      <span style="min-width:0;flex:1 1 220px">
        <a href="javascript:void(0)" onclick="${openFn(v)}">${shpBadge(v)}${esc(vidTitle(v))}</a>
        <span class="muted" style="font-size:11px;margin-left:5px">${T("剪完","done")} ${esc(String(v.finishedAt||"").slice(5,10))}</span></span>
      <span style="flex:none">${reviewStateHTML(v)}</span></div>`).join("");
  return `<details class="fold" ${foldState("work.recent7", false)}>
    <summary>${T("最近 7 天剪完的片","Finished in the last 7 days")}<span class="n">${list.length}</span>${
      nWait?`<span class="pill wa" style="font-size:10px;margin-left:6px">${T(nWait+" 支還沒審", nWait+" not reviewed")}</span>`:""}</summary>
    <div class="foldbody">
      <div class="muted" style="font-size:12px;margin-bottom:4px">${T(
        "還沒審的會寫出等了幾天，可以直接拿這個去問主管。「已審過」後面是按下通過的人 —— 自己標的會註明。",
        "Unreviewed ones show how many days they've waited. “Approved” shows who pressed it — self-marked ones are labelled.")}</div>
      ${rows}</div></details>`;
}
// 天數標記：今天＝新，昨天＝2，前天＝3…（越久顏色越警示）
function dayBadge(v){ const b=claimDayBadge(v); const n=(b==="新")?1:(+b); const col=n>=4?'var(--red)':(n>=2?'var(--amber)':'var(--accent)');
  return `<span style="display:inline-flex;min-width:30px;height:30px;padding:0 9px;border-radius:5px;background:${col};color:#fff;font-weight:900;font-size:14px;align-items:center;justify-content:center">${b==="新"?T("新","New"):b}</span>`; }
// 天數是「管理用」的資訊 —— 給管理員／經理人／人資看誰卡住了，剪輯自己的工作頁不顯示
// （盯著自己的天數只會有壓力，對他要做的事沒有幫助）。
// 員工視角（VIEW_AS）＝預覽員工看到的畫面，所以也不顯示。
function canSeeEditDays(){ return !VIEW_AS && ["boss","manager","hr"].includes(currentRole()); }
// 小字版：主管／人資的清單很密，用一行小字標天數，顏色照樣會警示
function daySmall(v){
  if(!v || v.stage!=="剪輯中" || !canSeeEditDays()) return "";
  const b=claimDayBadge(v), n=(b==="新")?1:(+b);
  const col=n>=4?'var(--red)':(n>=2?'var(--amber)':'var(--muted)');
  return ` <span style="font-size:11px;flex:none;color:${col};font-weight:${n>=2?700:400}">${b==="新"?T("今天領","new"):T("第 "+b+" 天","d"+b)}</span>`;
}
// 平台/語言小圖示（蝦/馬/EN/TH）：跟一般影片合併同一份清單顯示，靠這個小圖分辨
function shpBadge(v){ return (v.channel&&CHANNELS[v.channel])
  ? `<span class="pill" style="font-size:10px;background:var(--accent);color:#fff;margin-right:5px" title="${T(CHANNELS[v.channel].verName,CHANNELS[v.channel].verNameEn)}">${T(CHANNELS[v.channel].short,CHANNELS[v.channel].shortEn)}</span>`
  : v.locale ? `<span class="pill" style="font-size:10px;background:var(--accent);color:#fff;margin-right:5px" title="${esc(localeName(v.locale))} version">${localeShort(v.locale)}</span>` : ''; }
// 待認領卡裡會跟著搜尋／快選變動的幾塊，各自抽成函式 —— 打字時只換這幾塊，不整頁重繪
function poolCountLabel(pool, shown){ return (POOL_FILTER==="all"&&!POOL_Q)?String((pool||[]).length):((shown||[]).length+"/"+(pool||[]).length); }
function poolTabsHTML(poolCnt){ return poolCatList().map(([k,l])=>`<button class="vtab ${POOL_FILTER===k?'on':''}" onclick="setPoolFilter('${k}')"><span>${l}</span> <span class="vtab-n">${poolCnt[k]||0}</span></button>`).join(""); }
function poolClearHTML(){ return POOL_Q?`<button class="btn sec sm" style="flex:none" onclick="document.getElementById('pool_q').value='';setPoolQ('')">${T("清除","Clear")}</button>`:""; }
function poolRowsHTML(poolShown, me){
  return (poolShown||[]).map(v=>`<tr>
        <td data-label="${T("影片","Video")}"><a href="javascript:void(0)" onclick="${(v.channel&&CHANNELS[v.channel])?`openChModal('${v.channel}','${v.id}')`:v.locale?`openIntlModal('${v.id}')`:`editVideo('${v.id}')`}">${shpBadge(v)}${esc(vidTitle(v))}</a>${missingPill(v,["raw"])} ${v.assignedTo===me?`<span class="tag" style="background:var(--amberbg);color:var(--accent)">${T("指派給你","Assigned to you")}</span>`:''} <span class="muted" style="font-size:12px">${esc(dataLabel(v.source||""))}</span>${isVersion(v)&&v.createdBy?`<span class="muted" style="font-size:12px"> · ${T("由 "+esc(v.createdBy)+" 建立","added by "+esc(v.createdBy))}</span>`:''}${enSubLine(v)}</td>
        <td data-label="${T("動作","Action")}"><div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm" onclick="claimVid('${v.id}')" title="${T('按一下＝認領並開始剪（變剪輯中、進我的工作、開始計時）','Claim & start (timer begins)')}">${T('認領開始剪','Claim & start')}</button>${poolDiscardBtn(v)}</div></td>
      </tr>`).join("")||`<tr><td colspan="2" class="muted">${POOL_Q?T("找不到符合「"+esc(POOL_Q)+"」的項目","Nothing matches “"+esc(POOL_Q)+"”"):(POOL_FILTER==="all"?T("目前沒有指派給你或可認領的項目","Nothing assigned to you or available to claim"):T("這一類目前沒有可認領的項目（點「全部」看其他）","Nothing to claim in this group — tap All to see the rest"))}</td></tr>`;
}
// 上班計畫：待認領卡（快選列＋搜尋＋清單＋認領/退回鍵）
function workPoolCard(pool, poolShown, poolCnt, me){
  return `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center">
      <b style="font-size:16px">${T("待認領（毛片＋二創版本）","To claim (raw + versions)")}</b>
      <span id="pool_n" class="pill ${poolShown.length?'ok':'wa'}">${poolCountLabel(pool, poolShown)}</span>
    </div>
    <div id="pool_tabs" class="vtabs" style="margin-top:10px">${poolTabsHTML(poolCnt)}</div>
    <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">
      <input id="pool_q" value="${esc(POOL_Q)}" placeholder="${T("找影片（片名、編號、來源…）","Find a video (name, code, source…)")}"
        style="flex:1;min-width:150px" oninput="setPoolQ(this.value)" onkeydown="if(enterKey(event))setPoolQ(this.value)">
      <span id="pool_clear">${poolClearHTML()}</span>
    </div>
    <div id="pool_wrap" class="keepscroll" style="margin-top:8px${poolShown.length>5?';max-height:300px;overflow-y:auto':''}">
    <table class="responsive daytbl"><thead><tr><th>${T("影片","Video")}</th><th style="width:150px">${T("動作","Action")}</th></tr></thead>
    <tbody id="pool_list">${poolRowsHTML(poolShown, me)}</tbody></table>
    </div>
  </div>`;
}
// 折疊區塊：次要的東西收進來，點了才展開
// ── 摺疊的開合狀態要撐得過重繪（v129）──────────────────────────────
// Firestore 一同步就整頁重繪。認領一支毛片之後，「待認領」自己收起來、
// 使用者被丟回頁面上方 —— 要再點開、再捲下去才能認領下一支，一連認領五支就痛苦五次。
// 只記使用者「明確按過」的那幾個；沒碰過的照原本的預設值。
let FOLD_OPEN={};
// 只標一個 data-fold；開合由下面那個委派監聽器記錄。
// 不用 inline 的 ontoggle —— 那要把 key 逃脫兩層，屬性值裡還會冒出 this.open。
// data-fold 放的是標題的雜湊、不是標題本身：標題原文寫進屬性等於把同一段字
// 在 DOM 裡出現兩次，任何「找到標題再往後看」的程式（含測試）都會被前面那個假的絆倒。
function foldKey(s){ let h=0; const t=String(s==null?"":s);
  for(let i=0;i<t.length;i++) h=(h*31 + t.charCodeAt(i))|0;
  return "f"+(h>>>0).toString(36); }
function foldIsOpen(key, defOpen){
  const k=foldKey(key);
  return Object.prototype.hasOwnProperty.call(FOLD_OPEN, k) ? !!FOLD_OPEN[k] : !!defOpen;
}
function foldState(key, defOpen){
  return `data-fold="${foldKey(key)}"${foldIsOpen(key, defOpen)?" open":""}`;
}
// ⚠️ 空的一折絕對不能畫出來 —— 按下去沒東西比沒有這一折還糟：
//    人會以為是壞掉了、或以為自己權限不夠，然後回頭問主管。
//    這裡本來只擋 `!body`（呼叫端回 "" 的那種），可是幾乎所有呼叫端都是
//    多行的樣板字串，湊出來是 "\n      \n      " —— 那是**有值**的，
//    於是照樣畫出一個空盒子。所以要 trim 過再判斷。
//    （v144 把「存檔資料夾」從「上片後」搬到主畫面之後，剪輯與海外看到的
//      「上片後」就一直是這種空盒子 —— 成效表只有老闆／主管看得到。）
function fold(title, count, body, open){
  if(!String(body==null?"":body).trim()) return "";
  return `<details class="fold" ${foldState(title, open)}><summary>${esc(title)}${count!=null?`<span class="n">${count}</span>`:""}</summary>
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
    rows.push(todoRow(assigned?"📌":"•", ttl+taskLatePill(t), sub+note, act, t.done));
  });
  // ③ 手上的影片
  myWork.forEach(v=>{
    const days=(canSeeEditDays() && v.stage==="剪輯中")?dayBadge(v):"";
    rows.push(todoRow("🎬",
      `<a href="javascript:void(0)" onclick="${(v.channel&&CHANNELS[v.channel])?`openChModal('${v.channel}','${v.id}')`:v.locale?`openIntlModal('${v.id}')`:`editVideo('${v.id}')`}">${shpBadge(v)}${esc(vidTitle(v))}</a>${missingPill(v)}${enSubLine(v)}`,
      [v.stage==="剪輯中"?T("剪輯中","In progress"):T("今天完成","Done today"), esc(dataLabel(v.source||""))].filter(Boolean).join("・"),
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
      <input id="wp_newtask" placeholder="${T("新增一件事…","Add a task…")}" style="flex:2;min-width:140px" onkeydown="if(enterKey(event))createTask()">
      <input id="wp_contact" list="wp_contact_dl" placeholder="${T("對接窗口（選填）","Contact (optional)")}" style="flex:1;min-width:110px" onkeydown="if(enterKey(event))createTask()">${contactDatalist('wp_contact_dl')}
      <input id="wp_date" type="date" value="${today}" min="${today}" style="width:auto" title="${T("要哪一天做？預設今天","Which day? Defaults to today")}">
      <button class="btn sm" style="flex:none" onclick="createTask()">${PLUS()} ${T("加入","Add")}</button>
    </div>
    <div class="muted" style="font-size:12px;margin-top:6px">${T("排到未來的日期，那天才會出現在這裡。","Pick a future date and it shows up on that day.")}</div>
  </div>`;
}
// ── 找主管／人資說一件事（折疊成一行；有回覆沒看過才亮紅點）──
function myMsgFold(){
  const list=myMsgs();
  const unseen=list.filter(m=>!msgOpen(m) && !m.seen).length;
  const who=(m)=>m.to==="boss"?T("主管","Manager"):T("人資","HR");
  const rows=list.map(m=>{
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
        onkeydown="if(enterKey(event))sendMsg()">
      <button class="btn sm" style="flex:none" onclick="sendMsg()">${T("送出","Send")}</button>
    </div>${rows?`<div style="margin-top:8px">${rows}</div>`:""}`;
  return fold(T("找主管／人資說一件事","Message HR / manager"), unseen||null, body, false);
}

// ===================================================================
// 同事之間傳訊息（v120）：kind:"p2p"，一次傳給一位同區同事。
// 三步做完才算結束：① 收件人按「收到」 ② 收件人回覆 ③ 發訊人看完回覆按「收到」。
// 任何一步沒做完，它就一直留在「該做那一步的人」畫面上 —— 完成才會消失。
// 用 kind 分流是為了不混進交辦成效：isTask() 只認沒有 kind 的那些。
// ===================================================================
function isP2P(t){ return !!(t && t.kind==="p2p"); }
function allP2P(){ return Object.values((STATE&&STATE.tasks)||{}).filter(isP2P); }
const p2pReplied=(m)=>!!String((m&&m.reply)||"").trim();
// 我收到的：還沒按「收到」，或按了還沒回覆 → 留著
function p2pInbox(){ return allP2P()
  .filter(m=>m.user===currentUser() && (!m.ack || !p2pReplied(m))).sort(msgSort); }
// 我發出的：對方還沒回，或回了我還沒按「收到」→ 留著
function p2pSent(){ return allP2P()
  .filter(m=>m.from===currentUser() && !m.fromSeen).sort(msgSort); }
// 可以傳給誰：同區的同事。管理層走「找主管／人資說一件事」那條，不重複開一條路
// 可以傳給誰：除了自己與管理層之外的同仁。
// ⚠️ v142 之前這裡是寫 `zoneOfUser(u)==="both"` 來排除管理層 —— 那是拿「分區」
//    當「是不是管理層」的代名詞。分區拆掉之後人人都是 both，那一行會把**所有人**
//    都排掉、名單整個變空。要問什麼就直接問什麼：管理層就是看職位。
const MGMT_ROLES=["boss","manager","hr"];
function p2pTargets(){
  return staffSorted((STATE.users||[]).filter(u=>{
    if(!STAFF_ROLES.includes(u.role||"editor")) return false;
    if(u.name===currentUser()) return false;
    if(MGMT_ROLES.includes(u.role)) return false;   // 管理層走「找主管／人資說一件事」那條
    return true;                                     // 其餘同仁都傳得到（不再分區）
  }));
}
async function sendP2P(){ refreshToday();
  if(VIEW_AS){ toast(T("員工視角為唯讀預覽","Read-only preview"),true); return; }
  const to=(val("p2p_to")||"").trim();
  if(!to){ toast(T("請先選擇要傳給誰","Pick who to send it to"),true); return; }
  const t=(val("p2p_txt")||"").trim();
  if(!t){ toast(T("請先寫下你想說的事","Write your message first"),true); return; }
  const id=uid("P");
  try{ await window.DB.set("tasks", id, {id, kind:"p2p", user:to, from:currentUser(), date:today,
        title:t, ack:false, ackAt:"", reply:"", replyAt:"", fromSeen:false, fromSeenAt:"", createdAt:nowIso()});
    const i=document.getElementById("p2p_txt"); if(i) i.value="";
    toast(T("已傳給「"+to+"」，等他按收到","Sent to "+to));
    logA("傳訊息給同事", to+"："+t.slice(0,30));
  }catch(e){ toast(T("送出失敗，請稍後再試","Failed to send, try again"),true); }
}
// ① 收件人按「收到」
function p2pAck(id){ const m=taskById(id)||{};
  dbUpdate("tasks", id, {ack:true, ackAt:nowIso()},
    {action:"收到同事訊息", target:(m.from||"")+"："+String(m.title||"").slice(0,30)}); }
// ② 收件人回覆
function p2pReply(id){
  const v=(val("p2pr_"+id)||"").trim();
  if(v.length<2){ toast(T("請簡單回覆一下","Write a short reply"),true); return; }
  const m=taskById(id)||{};
  dbUpdate("tasks", id, {reply:v, replyAt:nowIso()},
    {action:"回覆同事訊息", target:(m.from||"")+"："+v.slice(0,30)}); }
// ③ 發訊人看完回覆按「收到」→ 這條結束，雙方畫面上收起來
function p2pSeen(id){ const m=taskById(id)||{};
  dbUpdate("tasks", id, {fromSeen:true, fromSeenAt:nowIso()},
    {action:"看過同事回覆", target:(m.user||"")+"："+String(m.title||"").slice(0,30)}); }
// ── 同事來訊（收件匣）：有訊息才出現，沒做完不會消失 ──
function p2pInboxCard(){
  const list=p2pInbox(); if(!list.length) return "";
  const nNew=list.filter(m=>!m.ack).length;
  const rows=list.map(m=>`<div style="margin-top:10px;padding-top:9px;border-top:1px dashed var(--line)">
      <div style="font-size:13.5px"><b>${esc(m.from||"")}</b>
        <span class="muted" style="font-size:11px">${esc(String(m.createdAt||"").slice(5,16).replace("T"," "))}</span></div>
      <div style="font-size:13.5px;margin-top:3px;white-space:pre-wrap">${esc(m.title||"")}</div>
      ${!m.ack
        ? `<div style="margin-top:6px"><button class="btn sm" onclick="p2pAck('${m.id}')">${T("收到","Got it")}</button>
             <span class="muted" style="font-size:12px;margin-left:8px">${T("按了他才知道你看到了","They'll see that you've read it")}</span></div>`
        : `<div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">
             <span class="pill ok" style="font-size:10px;flex:none">${T("已收到","Got it")}</span>
             <input id="p2pr_${m.id}" placeholder="${T("回覆他…","Reply…")}" style="flex:1;min-width:150px"
               onkeydown="if(enterKey(event))p2pReply('${m.id}')">
             <button class="btn sm" style="flex:none" onclick="p2pReply('${m.id}')">${T("回覆","Reply")}</button></div>`}
    </div>`).join("");
  return `<div class="card" style="border-color:var(--gold)">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:16px">📬 ${T("同事來訊","From a colleague")}</b>
      <span class="pill ${nNew?'em':'wa'}">${nNew?T(nNew+" 則待接收", nNew+" to open"):T("待回覆","Reply needed")}</span></div>
    ${rows}</div>`;
}
// ── 傳訊息給同事（折疊）：發訊＋看對方回覆 ──
function p2pFold(){
  const targets=p2pTargets();
  const sent=p2pSent();
  const nBack=sent.filter(p2pReplied).length;          // 對方回了、等我按收到
  const rows=sent.map(m=>{
    const answered=p2pReplied(m);
    return `<div class="todo"><span class="tkind">${answered?"💬":(m.ack?"👀":"📨")}</span>
      <div class="tmain"><div class="ttitle">${esc(m.title||"")}</div>
        <div class="tsub">${T("給","To")} ${esc(m.user||"")}・${esc(String(m.createdAt||"").slice(5,16).replace("T"," "))}
          ${answered
            ? `<div style="margin-top:4px"><b>${esc(m.user||"")}</b> ${T("回覆","replied")}
                 <span class="muted" style="font-size:11px">${esc(String(m.replyAt||"").slice(5,16).replace("T"," "))}</span>：${esc(m.reply)}</div>`
            : `<div style="margin-top:4px" class="muted">${m.ack?T("他已經按收到，等他回覆…","Read — waiting for a reply…"):T("等他按收到…","Waiting for them to open it…")}</div>`}
        </div></div>
      <div class="tact">${answered
        ? `<button class="btn sm" style="padding:4px 12px" onclick="p2pSeen('${m.id}')">${T("收到","Got it")}</button>`
        : ''}</div></div>`;
  }).join("");
  const body = targets.length
    ? `<div class="row" style="gap:6px;flex-wrap:wrap">
        <select id="p2p_to" style="width:auto;min-width:120px"><option value="">${T("傳給誰…","To…")}</option>${targets.map(u=>`<option>${esc(u.name)}</option>`).join("")}</select>
        <input id="p2p_txt" placeholder="${T("想跟同事說的事…","Message a colleague…")}" style="flex:2;min-width:150px"
          onkeydown="if(enterKey(event))sendP2P()">
        <button class="btn sm" style="flex:none" onclick="sendP2P()">${T("送出","Send")}</button>
      </div>${rows?`<div style="margin-top:8px">${rows}</div>`:""}`
    : `<p class="muted" style="font-size:13px;margin:0">${T("目前沒有可以傳訊息的同事。","No colleagues to message yet.")}</p>`;
  return fold(T("傳訊息給同事","Message a colleague"), nBack||null, body, false);
}
// ── 同事之間的訊息（主管／管理員）：工作上的溝通要追蹤得到 ──
function p2pWatchCard(){
  if(!["boss","manager"].includes(currentRole())) return "";
  const list=allP2P().sort(msgSort);
  if(!list.length) return "";
  const open=list.filter(m=>!p2pReplied(m));
  const rows=list.slice(0,30).map(m=>`<div style="padding:8px 0;border-bottom:1px solid var(--line)">
      <div style="font-size:13.5px"><b>${esc(m.from||"")}</b> → <b>${esc(m.user||"")}</b>
        <span class="muted" style="font-size:11px">${esc(String(m.createdAt||"").slice(5,16).replace("T"," "))}</span>
        <span class="pill ${p2pReplied(m)?'ok':(m.ack?'wa':'em')}" style="font-size:10px;margin-left:5px">${
          p2pReplied(m)?T("已回覆","Replied"):(m.ack?T("已收到","Opened"):T("未接收","Unopened"))}</span></div>
      <div style="font-size:13px;margin-top:3px;white-space:pre-wrap">${esc(m.title||"")}</div>
      ${p2pReplied(m)?`<div class="muted" style="font-size:12px;margin-top:3px">${T("回","Re")}：${esc(m.reply)}</div>`:''}
    </div>`).join("");
  return fold(T("同事之間的訊息","Messages between colleagues"), open.length||null,
    `<div>${rows}${list.length>30?`<p class="muted" style="font-size:12px;margin:6px 0 0">${T("只顯示最近 30 則","Showing the latest 30")}</p>`:''}</div>`, false);
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
    ${list.map(m=>`<div style="margin-top:10px;padding-top:9px;border-top:1px dashed var(--line)">
      <div style="font-size:13.5px"><b>${esc(m.user)}</b>
        <span class="muted" style="font-size:11px">${esc(String(m.createdAt||"").slice(5,16).replace("T"," "))}${currentRole()==="boss"?"・"+label(m):""}</span></div>
      <div style="margin-top:3px">${esc(m.title)}</div>
      ${msgOpen(m)
        ? `<div class="row" style="gap:6px;margin-top:6px">
             <input id="mr_${m.id}" placeholder="回覆他…" style="flex:1;min-width:0" onkeydown="if(enterKey(event))msgReply('${m.id}')">
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
// ===================================================================
// 員工顯示順序（所有清單共用）：台灣（剪輯 → 行銷 → 客服 → 出貨 → 員工 → 人資）→ 海外一律排最後；同組內中文名在前、英文名在後
// 職位在台灣區裡的先後：剪輯 → 行銷 →（其餘）客服 → 出貨 → 員工 → 人資
const ROLE_ORDER={editor:0, mkt:1, pick:1.5, svc:2, ship:3, cs:4, manager:5, hr:6};
// 台灣（0）在前、巴基斯坦（1）在後
const regionRank=(role)=> role==="intl" ? 1 : 0;
function staffRank(u){
  const role = u.role||"editor";
  const byRegion = regionRank(role);
  const byRole   = ROLE_ORDER[role]!=null ? ROLE_ORDER[role] : 7;
  const byName   = /^[A-Za-z]/.test(String(u.name||"")) ? 1 : 0;   // 英文名字排後面
  return [byRegion, byRole, byName];
}
function staffSorted(list){
  return (list||[]).slice().sort((a,b)=>{
    const ra=staffRank(a), rb=staffRank(b);
    return (ra[0]-rb[0]) || (ra[1]-rb[1]) || (ra[2]-rb[2])
        || String(a.name).localeCompare(String(b.name),"zh-Hant");
  });
}
// 下拉選單的分組：剪輯 / 其他職位 / 巴基斯坦（順序即顯示順序）
function staffOptGroups(roles){
  const rs = roles || ["editor","intl"];
  const pool = staffSorted((STATE.users||[]).filter(u=>rs.includes(u.role||"editor")));
  const isEd=(u)=>(u.role||"editor")==="editor";
  const groups=[
    ["剪輯",     isEd],
    ["行銷",     u=>u.role==="mkt"],
    ["選品行銷", u=>u.role==="pick"],
    ["客服",     u=>u.role==="svc"],
    ["出貨",     u=>u.role==="ship"],
    ["員工",     u=>u.role==="cs"],
    ["巴基斯坦", u=>u.role==="intl"],
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
// 分區塊：台灣先分兩排（做內容的／其餘），巴基斯坦自成一區排最後。
// 每一區列出屬於它的職位，之後要調哪個職位歸哪一排，改這裡就好。
const STAFF_GROUPS=[
  ["twmake", "台灣・剪輯行銷", "Taiwan · Editing & Marketing", ["editor","mkt","pick"]],
  ["twrest", "台灣・其他",     "Taiwan · Others",              ["svc","ship","cs","hr"]],
  ["pk",     "巴基斯坦",       "Pakistan",                     ["intl"]],
];
function staffByGroup(list){
  const pool = staffSorted(list || (STATE.users||[]).filter(u=>STAFF_ROLES.includes(u.role||"editor")));
  return STAFF_GROUPS.map(([key,zh,en,roles])=>({role:key, key, zh, en, roles,
      people:pool.filter(u=>roles.includes(u.role||"editor"))}))
    .filter(g=>g.people.length);
}
// HR 通知的收件對象代碼 → 職位清單。
// 支援 __all__、每個區塊（__twmake__／__twrest__／__pk__）與每個職位（__editor__…）。
// 認不出來的（例如直接選某個人的名字）回 null，由呼叫端當成單一收件人。
function noticeTargetRoles(who){
  if(who==="__all__") return STAFF_ROLES;
  const g=STAFF_GROUPS.find(([key])=>("__"+key+"__")===who);
  if(g) return g[3];
  const m=/^__(.+)__$/.exec(String(who||""));
  return (m && STAFF_ROLES.includes(m[1])) ? [m[1]] : null;
}
function staffNamesSorted(roles){
  const rs = roles || ["editor","intl"];
  return staffSorted((STATE.users||[]).filter(u=>rs.includes(u.role||"editor"))).map(u=>u.name);
}
// ===================================================================
// 分區：台灣（中文源片＋蝦皮＋馬來西亞）／海外（英文＋泰文，巴基斯坦團隊做）
//
// 這裡有三個很容易混在一起的名詞，務必分清楚 ——
//   isSourceVid(v)  這是「源片」，不是版本殼
//   isVersion(v)    這是「版本殼」（蝦皮／馬來／英文／泰文）
//   zoneOfVideo(v)  這支屬於哪一「區」
// 程式裡原本有十幾處 `!v.locale && !v.channel`，看起來都一樣，其實絕大多數
// 是在問「這是不是源片」而不是「這是哪一區」。把蝦皮／馬來殼誤判成海外，
// 會讓它們從毛片庫存、指派清單、儀表板數字裡整批消失。
// ===================================================================
const ZONE_LABEL={tw:["台灣","Taiwan"], intl:["海外","Overseas"]};
// 這支影片屬於哪一區。三種情況分開看：
//   ① 有 locale（en/th）＝海外做的版本殼
//   ② 有 channel（shopee/ms）＝台灣做的版本殼 —— 版本殼不等於海外
//   ③ 都沒有＝源片，看它「原本是用什麼語言拍的」：泰文／英文＝海外的原創，
//      中文與馬來西亞＝台灣。（用泰文／英文拍的原創確實存在，v119 修正）
function zoneOfVideo(v){
  if(!v) return "tw";
  if(v.locale) return "intl";
  if(v.channel) return "tw";
  return zoneOfOrigLang(origLangOf(v));
}
// 「原本語言」對應到哪一區（源片與待認領池的分類共用這一份）
function zoneOfOrigLang(l){ return (l==="en"||l==="th") ? "intl" : "tw"; }
// 這個人看得到哪幾區。
//
// ⚠️ v142 起一律回傳 "both" —— 台灣與海外**不再互相看不到**。
//    新的做法是：一份腳本同時發給兩組人、兩邊各拍各的語言、毛片放進同一個池子，
//    任何人都挑得到任何一支去剪。語言變成「成品的屬性」，不再是「流程的牆」。
//
//    所以「區」現在只剩兩個用途，都不是權限：
//      ① 影片庫上方的中文／海外分頁 —— 那是**篩選器**，不是牆（curZone/ZONE_VIEW）
//      ② zoneOfVideo() 把一支片歸類到哪一邊 —— 給那個篩選器用的
//    函式留著沒有拿掉，是因為那兩個用途還在，而且哪天要恢復分區也只要改這裡。
function zoneOfUser(name){
  return "both";
}
// 舊版的判斷留在這裡當註解，方便對照：
//   boss/manager/hr → both；intl → intl；其餘 → tw
function myZone(){ return zoneOfUser(currentUser()); }
// 看不看得到「這個人」：管理層（zone 是 both）永遠看得到，其餘只看同區
function seesPerson(name){ const z=zoneOfUser(name); return z==="both" || seesZone(z); }
function seesZone(z){ const m=myZone(); return m==="both" || m===z; }
function seesTW(){ return seesZone("tw"); }
function seesIntl(){ return seesZone("intl"); }
// 平台代碼屬於哪一區（月排程的平台選單、建立版本卡的線別都用它推）
function zoneOfPlat(k){ return (k==="en"||k==="th") ? "intl" : "tw"; }   // sunny 跟蝦皮／馬來同一側
// 「現在看的是哪一區」只有影片庫需要 —— 月排程與建立版本卡選了平台就等於選了區。
// 只有同時看得到兩區的人（管理員／經理人／人資）才會用到這個開關。
// null＝還沒自己選過，依職位給一個合理的預設。
// ⚠️ 這是**預設值**不是牆：海外預設落在海外那一份（他們的畫面是英文的），
//    但按一下就切得到台灣那一份 —— v142 之後兩邊互相看得到。
let ZONE_VIEW=null;
function curZone(){
  if(ZONE_VIEW==="tw"||ZONE_VIEW==="intl") return ZONE_VIEW;
  // v146：不再依職位給不同的預設。海外要看自己語言的片，按上面那個分頁就有；
  // 但「今天有什麼腳本可以拍」在台灣那一份裡，讓他們一進來只看到 14 支不合理。
  return "tw";
}
function setZoneView(z){ ZONE_VIEW=(z==="intl")?"intl":"tw"; VID_TAGS.clear(); VID_Q=""; render(); }
// 源片 vs 版本殼（跟「分區」是兩件事，不要混用）
function isVersion(v){ return !!(v && (v.locale||v.channel)); }
function isSourceVid(v){ return !!v && !v.locale && !v.channel; }
// 已封存：版本殼上片後就完成任務，不用再佔清單版面（資料仍留在資料庫）
function isArchived(v){ return isVersion(v) && (v.stage==="已上片" || (v.stage==="已完成" && String(v.publishedLink||"").trim())); }
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
  ${p2pInboxCard()}
  ${todayListCard(tasks, [], ()=>"", ()=>"")}
  ${fold("之後要做", nFuture, futureTasksBody())}
  ${myMsgFold()}
  ${p2pFold()}
  <div class="card" style="text-align:center">
    <div><button class="btn" style="font-size:16px;padding:14px 34px" onclick="clockOutReport()">下班匯報</button></div>
  </div>`;
}
function viewWork(){
  const me = currentUser();
  if(NO_EDIT_ROLES.includes(currentRole())) return viewWorkCS(me);   // 行銷／客服／出貨／員工：只有交辦工作那一版
  const inProg = myInProgressCount(); const atLimit = false;   // 已取消同時支數上限（2026-07）；只顯示支數
  // 全員畫面一致（只分中/英介面）：台灣毛片＋蝦皮/馬來/EN/TH 版本全部合併同一份清單，小圖（蝦/馬/EN/TH）分辨
  const mine = (STATE.videos||[]).filter(v=>(v.claimedBy===me||v.editor===me) && v.stage==="剪輯中")
    .sort((a,b)=>String(a.claimedAt||"").localeCompare(String(b.claimedAt||"")));
  // 待剪池：指派給我的 ＋ 還沒指派的公用毛片/版本（別人被指派的不顯示）；指派給我的排前面
  // 待剪順序：依預排上片日期 過去→未來（沒填日期的排最後、再依編號）
  // 依分工過濾：一創只看毛片/原創、二創只看各平台語言版本（兩種都做的看全部）
  const pool = poolAll();
  const poolCnt = poolCntOf(pool);
  const poolShown = poolShownOf(pool);
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
      <button class="btn sm" onclick="chFinish('${v.channel}','${v.id}')" title="${T("剪好了→標記完成（進入待審核），畫面留在這頁","Mark done (goes to In review) — you stay on this page")}">${T("完成","Done")} ✔</button>`;
    if(v.locale) return `<button class="btn sec sm" onclick="openIntlModal('${v.id}')">${T("編輯內容","Edit")}</button>
      <button class="btn sm" onclick="intlFinish('${v.id}')" title="${T("剪好了→標記完成（進入待審核），畫面留在這頁","Mark done (goes to In review) — you stay on this page")}">${T("完成","Done")} ✔</button>`;
    // 編輯內容：按「儲存修改」只存、留在原地；要結案再按「完成」→ 標記剪輯完成（畫面一律留在原本那頁）
    return `<button class="btn sec sm" onclick="openVideoModal('${v.id}',true,false)" title="${T("編輯內容（按「儲存修改」只存、留在這頁）","Edit content (Save keeps you here)")}">${T("編輯內容","Edit")}</button>
      <button class="btn sm" onclick="finishWork('${v.id}')" title="${T("剪好了→標記「剪輯完成」（進入待審核），畫面留在這頁","Mark done (goes to In review) — you stay on this page")}">${T("完成","Done")} ✔</button>`; };
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
  <h2>${T("本日工作","Today's Work")}${paren(esc(me))}</h2>
  ${focusBar}
  ${/* 卡片順序＝一天的工作順序：先看「有沒有事情在等我」，再做手上的，
        再去抓新的來剪；少用的一律摺疊放到下面，不佔畫面。 */''}
  ${workIssueCard()}
  ${p2pInboxCard()}
  ${rejCard}
  ${/* 上面那張只講今天要處理的；這一張是最近七天的盤點，預設收起來 */''}
  ${workRecent7Card(me)}

  ${todayListCard(tasks, myWork, workBtn, undoBtn)}

  ${fold(T("待認領","To claim"), pool.length, workPoolCard(pool, poolShown, poolCnt, me), !!POOL_Q||POOL_FILTER!=="all")}
  ${lowStockCard()}

  ${fold(T("建立其他版本","Create a version"), null, createZoneCard())}
  ${fold(T("之後要做","Scheduled later"), nFuture, futureTasksBody())}
  ${myMsgFold()}
  ${p2pFold()}
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
function setPoolFilter(k){ POOL_FILTER=k; poolFilter(); }
// 待認領的搜尋（v86）：影片變多了，快選分類之外還要能直接找
let POOL_Q="";
// 邊打邊篩（比照影片庫）：只重畫待認領那張卡的內容，不整頁重繪 ——
// 整頁重繪會把「待認領」折疊收回去（要再點一次才看得到結果），游標也會跳出搜尋框。
function setPoolQ(v){ POOL_Q=String(v||"").trim(); poolFilter(); }
// 待認領池：指派給我的 ＋ 還沒指派的公用毛片/版本（別人被指派的不顯示）
// 依分工過濾：一創只看毛片/原創、二創只看各平台語言版本（兩種都做的看全部）
// 還沒拍的（只有文案）不放進來：認領了也沒毛片可剪
// 排序：預排上片日期 過去→未來（沒填日期的排最後、再依編號）
function poolAll(){ const me=currentUser();
  const zoneOK=(v)=> seesZone(zoneOfVideo(v));
  return (STATE.videos||[]).filter(v=>zoneOK(v) && v.stage==="待處理" && !vidNotShot(v) && (v.assignedTo===me || !v.assignedTo))
    .sort((a,b)=>{ const ad=a.scheduledDate?String(a.scheduledDate).slice(0,10):"9999"; const bd=b.scheduledDate?String(b.scheduledDate).slice(0,10):"9999";
      return ad.localeCompare(bd) || String(a.id).localeCompare(String(b.id)); });
}
function poolCatList(){ return [["all",T("全部","All")]]
  .concat(seesTW()  ? [["tw",T("中文毛片","Chinese raw")],["shopee",T("蝦皮","Shopee")],["ms",T("馬來西亞","Malaysia")]] : [])
  .concat(seesIntl()? [["en",T("英文","English")],["th",T("泰文","Thai")]] : []); }
// 快選上的數字跟著搜尋一起變 —— 搜「珠寶」時就看得出各類各有幾支符合
function poolCntOf(pool){ const hit=(pool||[]).filter(poolMatch);
  const c={all:hit.length}; hit.forEach(v=>{ const k=poolCat(v); c[k]=(c[k]||0)+1; }); return c; }
function poolShownOf(pool){ return (POOL_FILTER==="all"?(pool||[]):(pool||[]).filter(v=>poolCat(v)===POOL_FILTER)).filter(poolMatch); }
// 只換掉待認領卡裡會變的四塊（數量徽章／快選數字／清除鍵／清單），折疊維持展開、游標留在搜尋框
function poolFilter(){
  const list=document.getElementById("pool_list"); if(!list){ render(); return; }
  const pool=poolAll(), shown=poolShownOf(pool), me=currentUser();
  list.innerHTML=poolRowsHTML(shown, me);
  const n=document.getElementById("pool_n");
  if(n){ n.textContent=poolCountLabel(pool, shown); n.className="pill "+(shown.length?"ok":"wa"); }
  const tabs=document.getElementById("pool_tabs"); if(tabs) tabs.innerHTML=poolTabsHTML(poolCntOf(pool));
  const clr=document.getElementById("pool_clear"); if(clr) clr.innerHTML=poolClearHTML();
  const wrap=document.getElementById("pool_wrap");
  if(wrap){ wrap.style.maxHeight=shown.length>5?"300px":""; wrap.style.overflowY=shown.length>5?"auto":""; }
}
// 比對片名、編號、來源、標籤、平台／語言 —— 剪輯記得哪個字就能找到
function poolMatch(v){
  if(!POOL_Q) return true;
  const q=POOL_Q.toLowerCase();
  return [v.code, v.name, v.rawName, v.nameEn, v.source, v.channel, v.locale,
          Array.isArray(v.tags)?v.tags.join(" "):""]
    .filter(Boolean).join(" ").toLowerCase().includes(q);
}
// 待認領池的快選分類。源片沒有 locale，要看「原本語言」才知道它是中文毛片還是海外原創
function poolCat(v){
  if(v.channel&&CHANNELS[v.channel]) return v.channel;
  if(v.locale) return v.locale;
  const l=origLangOf(v); return zoneOfOrigLang(l)==="intl" ? l : "tw";
}
function createZoneCard(){
  // 全員相同：四個二創排程線合在同一個選單（蝦皮／馬來西亞／英文／泰文），任何人都能新增任一線
  const zones=[["shopee",T("蝦皮","Shopee")],["ms",T("馬來西亞","Malaysia")],["sunny","Boss Sunny"],["en",T("英文 TikTok","English (TikTok)")],["th",T("泰文 TikTok","Thai (TikTok)")]]
    .filter(([k])=>seesZone(zoneOfPlat(k)));
  if(!zones.length) return "";   // 這個人沒有任何一條線可以建（fold 收到空字串就整塊不出現）
  if(!zones.some(z=>z[0]===WORK_ZONE)) WORK_ZONE=zones[0][0];
  const sel=`<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
    <b style="font-size:16px">${T("建立二創版本","Create a version")}</b>
    <select onchange="setWorkZone(this.value)" style="width:auto;min-width:190px">
      ${zones.map(([k,l])=>`<option value="${k}" ${WORK_ZONE===k?'selected':''}>${esc(l)}</option>`).join("")}
    </select>
    </div>`;
  // ⚠️ 這張卡的來源清單是「所有舊片」—— 實測 321 支就是 3110 個 DOM 節點，
  // 佔掉剪輯整頁的 77%。而且每次有人改任何東西、全公司的畫面都要重畫一次，
  // 每次都得把這幾千個節點重排一遍。清單不能截斷（v121：要動手處理的清單一律不截斷），
  // 所以改成收起來 —— 打開的那一刻才畫（見 lazyFill）。要挑片的人才付這個成本。
  const K="work.mkver", open=foldIsOpen(K, false);
  const isIntl=(WORK_ZONE==="en"||WORK_ZONE==="th");
  const pool=isIntl?intlSourcePool():chSourcePool();
  const listId=isIntl?"intl_list":(CHANNELS[WORK_ZONE].pfx+"_list");
  const qId=isIntl?"intl_q":(CHANNELS[WORK_ZONE].pfx+"_q");
  const qVal=isIntl?INTL_Q:CH_Q[WORK_ZONE];
  const onIn=isIntl?"INTL_Q=this.value;intlFilter()"
                   :`CH_Q['${WORK_ZONE}']=this.value;chFilter('${WORK_ZONE}')`;
  const body=`<details class="fold" ${foldState(K,false)} data-lazy="${esc(WORK_ZONE)}" style="margin-top:10px">
      <summary>${T("挑一支舊片來做","Pick an old video")}<span class="n">${pool.length}</span></summary>
      <input id="${qId}" placeholder="🔍 ${T("搜尋片名／編號","Search title / code")}" value="${esc(qVal||"")}" oninput="${onIn}" style="width:100%;max-width:360px;margin:10px 0">
      <div id="${listId}" class="${pool.length>8?'vidscroll':''}">${open?(isIntl?intlLibRows(WORK_ZONE):chLibRows(WORK_ZONE)):""}</div>
    </details>`;
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
  showModal(T("下班匯報","Clock-out report"), body, async ()=>{
    // 沒有真的寫進去就不能把人登出 —— 他會以為自己下班了，隔天才發現沒有紀錄
    if(!await doClockOut()){
      toast(T("下班沒有記錄成功，可能是網路斷了。確認有網路之後再按一次；一直不行請跟主管說一聲。",
              "Clock-out didn't save — you may be offline. Check your connection and press it again."), true);
      return false; }
    closeModal(); toast(T("辛苦了，已下班 ","Great work — clocked out")); setTimeout(showGoodbye,300); return true;
  }, T("確認下班","Confirm clock-out"));
}
// 回傳「有沒有真的寫進資料庫」。
// 以前這裡把所有錯誤吞掉，外面照樣說「辛苦了，已下班」然後把人登出 ——
// 寫失敗的人根本沒有下班紀錄，卻完全不知道。這是「無法下班」最惡劣的一種：它裝作成功。
async function doClockOut(){
  if(!window.DB) return false;
  let id, env;
  try{ refreshToday(); id=shiftId(currentUser(),today); env=punchEnv(); }catch(e){ return false; }
  try{
    if(myShift()) await window.DB.update("shifts",id,{clockOut:nowIso(), outDev:env.dev, outDevUA:env.ua, outMobile:env.mobile, autoOut:false});
    else await window.DB.set("shifts",id,{id,user:currentUser(),date:today,clockIn:nowIso(),clockOut:nowIso(),
      inDev:env.dev,inDevUA:env.ua,inMobile:env.mobile,outDev:env.dev,outDevUA:env.ua,outMobile:env.mobile,autoOut:false});
  }catch(e){ return false; }
  // 以下是加分項：記不記得住裝置、拿不拿得到座標，都不影響「已經下班」這件事
  try{ rememberDevice(currentUser(), env); }catch(e){}
  try{ grabGeo().then(g=>{ if(g) window.DB.update("shifts", id, {outGeo:g}).catch(()=>{}); }); }catch(e){}
  return true;
}
// ===================================================================
// 出勤：班表設定、打卡環境記錄、遲到早退計算、月報表
// 打卡「只記錄不擋」—— 記下裝置、是不是手機、GPS 座標與離公司多遠，
// 報表上標出異常，由人資自己判斷。沒有任何一種網頁打卡擋得住有心作弊。
// ===================================================================
const DEF_WORK={start:"09:00", end:"18:00", grace:10};
// 這台裝置的代碼：同一台裝置幫好幾個人打卡時，報表上看得出來
// localStorage 不是永遠都能用（無痕模式、封鎖第三方儲存、空間滿了都會丟例外）。
// 這裡是打卡的必經之路，寧可拿一個記不住的臨時代碼，也不能讓整個下班流程炸掉。
function deviceId(){
  let d=null;
  try{ d=localStorage.getItem("ecdr_dev"); }catch(e){}
  if(!d){ d=Math.random().toString(36).slice(2,8).toUpperCase();
          try{ localStorage.setItem("ecdr_dev",d); }catch(e){} }
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
          auto:!!sh.autoOut, manual:!!sh.manualBy, manualBy:sh.manualBy||"", manualNote:sh.manualNote||"",
          dev:sh.inDev||"", devUA:sh.inDevUA||"", mobile:!!sh.inMobile,
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
  const wh=workHoursOf(me);
  // 這支是登入時的背景補登，不跳 toast（開機就彈一則系統訊息只會嚇到人）；
  // 但失敗也不能無聲無息 —— 寫進操作紀錄。反正沒補成功的下次登入還會再補一次。
  const r=await bulkRun(open, s=>window.DB.update("shifts", s.id,
    {clockOut:String(s.date)+"T"+wh.end+":00", autoOut:true}));
  if(r.failed) logA("自動補下班失敗 "+r.failed+" 筆", me);
}
// ── 手動補登出勤（v149）──────────────────────────────────────
//
// 為什麼要有這個：打卡是靠員工自己的瀏覽器寫的。網路不通的時候那筆會卡在他那台
// （他自己看得到、伺服器上沒有），真的掉了就沒有人救得回來 —— 在這之前整個系統
// 寫得到出勤的只有三個地方：自己打上班、自己打下班、系統自動補下班。
// 出勤是算薪水的依據，不能有「壞了只能認了」的東西。
//
// 兩個原則：
//   ① 一定要留痕跡。補登過的紀錄永遠標著「人工補登」，寫明是誰補的、為什麼補。
//      出勤資料被人改過而看不出來，比不能改更糟。
//   ② 原因必填。事後要查得出這一筆為什麼長這樣。
function canFixAttend(){ return ["boss","hr"].includes(currentRole()); }
// 時間格式檢查。hhmmToMin 只負責解析、不管範圍（"25:99" 它也算得出數字），
// 而補登的時間是人手動打進去的 —— 要真的擋。
function validHm(t){ const m=String(t||"").match(/^(\d{1,2}):(\d{2})$/);
  return !!m && +m[1]>=0 && +m[1]<=23 && +m[2]>=0 && +m[2]<=59; }
function attManualPill(sh){
  const by=String((sh&&sh.manualBy)||"").trim(); if(!by) return "";
  const note=String((sh&&sh.manualNote)||"").trim();
  const at=String((sh&&sh.manualAt)||"").slice(0,16).replace("T"," ");
  return ` <span class="pill em" style="font-size:10px" title="${esc(by+" 補登"+(at?("／"+at):"")+(note?("："+note):""))}">人工補登</span>`;
}
function attFixBtn(name, date){
  if(!canFixAttend()) return "";
  const has=!!((STATE&&STATE.shifts)||{})[shiftId(name,date)];
  return `<button class="btn sec sm" style="padding:3px 9px;font-size:12px"
    onclick="attFix('${esc(jsEsc(name))}','${esc(date)}')">${has?"修改":"補登"}</button>`;
}
// 補登任一天：個人明細只列得出「已經有紀錄」的日子 —— 整天完全沒紀錄的過去日期
// （正是打卡掉了的那種）在那張表上根本不會出現，所以要有一個指定人＋指定日期的入口。
function attFixAnyCard(){
  if(!canFixAttend()) return "";
  const staff=attStaff();
  return `<div class="card">
    <b style="font-size:15px">補登出勤</b>
    <div class="muted" style="font-size:12px;margin-top:4px">
      打卡沒送出去、忘記打卡、系統當機都用這裡補。補過的會標「人工補登」，並記下是誰補的、為什麼。
    </div>
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">
      <div style="flex:1;min-width:150px"><label style="margin:0">同仁</label>
        <select id="afx_who">${staff.map(u=>`<option>${esc(u.name)}</option>`).join("")}</select></div>
      <div style="flex:1;min-width:150px"><label style="margin:0">日期</label>
        <div class="dateField"><span class="dateIco">🗓</span><input id="afx_date" type="date" value="${esc(today)}" max="${esc(today)}"></div></div>
      <button class="btn sm" onclick="attFixAny()">補登這一天</button>
    </div>
  </div>`;
}
function attFixAny(){
  const who=String(val("afx_who")||"").trim();
  const date=String(val("afx_date")||"").trim();
  if(!who){ toast("請先選同仁",true); return; }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){ toast("請選日期",true); return; }
  attFix(who, date);
}
function attFix(name, date){
  if(!canFixAttend()){ toast("只有管理員與人資可以補登出勤",true); return; }
  if(dbBlocked()) return;
  refreshToday();
  if(String(date)>today){ toast("不能補未來的日期",true); return; }
  const sh=((STATE&&STATE.shifts)||{})[shiftId(name,date)]||null;
  const hm=(x)=>String(x||"").slice(11,16);
  showModal(`補登出勤 — ${name}`, `
    <div class="muted" style="font-size:13px">${esc(date)}（${weekdayZh(date)}）</div>
    <div class="grid cols2" style="margin-top:10px">
      <div><label>上班時間 · 必填</label>
        <input id="af_in" type="time" value="${esc(hm(sh&&sh.clockIn))}"></div>
      <div><label>下班時間（還沒下班就留空）</label>
        <input id="af_out" type="time" value="${esc(hm(sh&&sh.clockOut))}"></div>
    </div>
    <label style="margin-top:10px">為什麼要補 · 必填</label>
    <input id="af_note" value="${esc((sh&&sh.manualNote)||"")}" placeholder="例：網路不通打卡沒送出、忘記打卡、系統當機">
    <div class="muted" style="font-size:11px;margin-top:6px;line-height:1.6">
      補登過的紀錄會永遠標著「人工補登」，並記下是誰補的、什麼時候補的、原因。<br>
      出勤是算薪水的依據 —— 留得住紀錄，之後才查得清楚。
    </div>`, async ()=>{
    const tin=String(val("af_in")||"").trim();
    const tout=String(val("af_out")||"").trim();
    const note=String(val("af_note")||"").trim();
    if(!tin){ toast("請填上班時間",true); return false; }
    if(!validHm(tin)){ toast("上班時間格式不對（要像 09:30）",true); return false; }
    if(tout && !validHm(tout)){ toast("下班時間格式不對（要像 18:00）",true); return false; }
    if(tout && hhmmToMin(tout) < hhmmToMin(tin)){ toast("下班時間不能早於上班時間",true); return false; }
    if(!note){ toast("請填補登原因 —— 出勤是算薪水的依據，一定要查得出為什麼",true); return false; }
    const id=shiftId(name,date);
    const patch={ id, user:name, date,
      clockIn:date+"T"+tin+":00", clockOut: tout?(date+"T"+tout+":00"):"",
      manualBy:currentUser(), manualAt:nowIso(), manualNote:note,
      autoOut:false };
    // 補登是覆蓋既有那一筆的上下班時間，但不要洗掉打卡當下記的裝置／位置等稽核資料
    const keep=sh?{inDev:sh.inDev||"", inDevUA:sh.inDevUA||"", inMobile:!!sh.inMobile,
      inNewDev:!!sh.inNewDev, inGeo:sh.inGeo||null, outGeo:sh.outGeo||null,
      issueNote:sh.issueNote||"", issueAt:sh.issueAt||""}:{};
    const okSent=await writeWithin(window.DB.set("shifts", id, Object.assign({}, keep, patch)));
    if(!okSent){ toast("補登還沒送到伺服器（網路可能不通）。確認網路之後再看一次，沒進去請再補一次。",true); return false; }
    logA("補登出勤", name+" "+date+" "+tin+"–"+(tout||"…")+"（"+note+"）");
    toast("已補登 "+name+" "+date);
    return true;
  }, "確認補登");
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
// 要不要請員工說明出勤異常。預設關 —— 上下班規則還沒定案之前，
// 系統只默默記上下班時間與登入的電子紀錄（裝置／UA／手機與否／GPS），
// 不要拿「遲到早退」去煩員工。規則定好後在設定頁打開即可，歷史紀錄都在。
function attIssueAskOn(){ const s=(STATE&&STATE.settings)||{}; return s.attIssueAsk===true; }
// 工作頁最上面的異常提醒卡（有未說明的異常、且已開啟這個功能才出現）
function workIssueCard(){
  if(!attIssueAskOn()) return "";
  const list=myIssueShifts(); if(!list.length) return "";
  return `<div class="card" style="border-color:var(--red)">
    <b style="font-size:16px;color:var(--red)">⚠ ${T("出勤異常待說明","Attendance to explain")}（${list.length}）</b>
    <div class="muted" style="font-size:12px;margin-top:4px">${T("填一下原因，人資才知道怎麼處理。","Write the reason so HR knows how to handle it.")}</div>
    ${list.map(s=>`<div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--line)">
      <div style="font-size:13.5px;font-weight:600">${esc(String(s.date).slice(5))}（${weekdayZh(s.date)}）・${esc(attIssues(s).join("、"))}</div>
      <div class="muted" style="font-size:12px;margin-top:2px">${T("上班","In")} ${esc(String(s.clockIn||"").slice(11,16)||"—")}　${T("下班","Out")} ${esc(String(s.clockOut||"").slice(11,16)||"—")}</div>
      <div class="row" style="gap:6px;margin-top:6px">
        <input id="isn_${esc(s.id)}" placeholder="${T("原因（例：交通事故、看醫生、主管同意提早離開）","Reason")}" style="flex:1;min-width:0"
          onkeydown="if(enterKey(event))saveIssueNote('${esc(jsEsc(s.id))}')">
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
function attStaff(){ return staffSorted((STATE.users||[]).filter(u=>STAFF_ROLES.includes(u.role||"editor"))); }
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
  if(!u || !STAFF_ROLES.includes(u.role||"")) return "";   // 管理員不打卡
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
    ${attRows(me,ym).length?`<details class="fold" ${foldState("work.attend", false)} style="margin-top:10px"><summary>我這個月的每日紀錄<span class="n">${attRows(me,ym).length}</span></summary>
      <div class="foldbody">${attDetailTable(me, ym)}</div></details>`:""}
  </div>`;
}
// 一個人某個月的每日出勤明細表（個人明細與「我的出勤」共用）
function attDetailTable(name, ym){
  const list=attRows(name, ym);
  const fix=canFixAttend();
  return `<table class="responsive" style="margin-top:8px">
    <thead><tr><th>日期</th><th>上班</th><th>下班</th><th>工時</th><th>狀況</th>${fix?"<th>補登</th>":""}</tr></thead>
    <tbody>${list.map(sh=>{ const a=attendOf(sh); const d=a.geo?officeDist(a.geo):null;
      const f=!a.counted ? "未列入計算"
        : [a.late>0?`遲到 ${a.late} 分`:'', a.early>0?`早退 ${a.early} 分`:'', a.auto?'系統補下班':'',
           (d!=null&&d>500)?`離公司 ${d} 公尺`:''].filter(Boolean).join("・");
      const normal=a.counted&&!f;
      return `<tr><td data-label="日期">${esc(String(sh.date).slice(5))}（${weekdayZh(sh.date)}）</td>
        <td data-label="上班">${esc(String(sh.clockIn||"").slice(11,16))||"—"}</td>
        <td data-label="下班">${esc(String(sh.clockOut||"").slice(11,16))||"—"}</td>
        <td data-label="工時">${minToHm(a.work)}</td>
        <td data-label="狀況" class="${normal?'':'muted'}">${normal?'正常':esc(f)}${attManualPill(sh)}</td>
        ${fix?`<td data-label="補登">${attFixBtn(name, sh.date)}</td>`:""}</tr>`; }).join("")}</tbody></table>`;
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
        ${(()=>{ // 已經開放手機打卡的人不算異常 —— 不然人資每天都會看到一整排紅字
          const n=arrived.filter(r=>r.sh.inMobile && !mobileAllowed(r.u.name)).length;
          return n?`<span class="pill em">用手機打卡 ${n}</span>`:''; })()}
        ${arrived.filter(r=>r.sh.inNewDev).length?`<span class="pill wa">換新裝置 ${arrived.filter(r=>r.sh.inNewDev).length}</span>`:''}
      </span></div>
    ${(()=>{ const ns=staff.filter(u=>!attendStartOf(u.name));
      return ns.length?`<div class="muted" style="font-size:12px;margin-top:6px">尚未起算 ${ns.length} 人（${ns.map(u=>esc(u.name)).join("、")}）—— 他們設好自己的密碼之後才開始計算遲到早退。</div>`:""; })()}
    <table class="responsive" style="margin-top:10px">
      <thead><tr><th>同仁</th><th>上班</th><th>下班</th><th>工時</th><th>狀況</th><th>裝置</th>${canFixAttend()?"<th>補登</th>":""}</tr></thead>
      <tbody>${todayRows.map(({u,sh})=>{ const a=attendOf(sh); const d=a.geo?officeDist(a.geo):null;
        const note=String((sh&&sh.issueNote)||"").trim();
        const hasIssue=attIssues(sh).length>0;
        const flags=[a.late>0?`<span class="pill em" style="font-size:10px">遲到 ${a.late} 分</span>`:'',
                     a.early>0?`<span class="pill wa" style="font-size:10px">早退 ${a.early} 分</span>`:'',
                     a.auto?'<span class="pill" style="font-size:10px">系統補下班</span>':'',
                     a.manual?attManualPill(sh).trim():'',
                     a.newDev?'<span class="pill wa" style="font-size:10px">換了新裝置</span>':'',
                     a.mobile?(mobileAllowed(u.name)
                        ? '<span class="pill" style="font-size:10px">手機（已開放）</span>'
                        : '<span class="pill em" style="font-size:10px">用手機打的</span>'):'',
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
          ${canFixAttend()?`<td data-label="補登">${attFixBtn(u.name, today)}</td>`:""}
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
      <tbody>${issueRows.map(s=>`<tr>
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
  return `<h2>出勤</h2>${myAttendCard()}${attFixAnyCard()}${todayCard}${devChangeCard}${devCard}${issueCard}${monthCard}
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
async function flowAssign(idx, name){ refreshToday();
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
  // 全部列出來，不截斷 —— 這是要動手勾的清單，勾不到的等於不存在，
  // 而且下面寫「未指派 N 支」跟「全選」都要對得上（v120 之前截在 20 筆，數字對不上）
  const afpRows=unassigned.map(v=>`<label style="display:flex;gap:8px;align-items:center;padding:7px 2px;border-bottom:1px solid var(--line);font-weight:400">
      <input type="checkbox" class="afp_vid" value="${v.id}" style="width:auto;margin:0;flex:none"> <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(vidTitle(v))}</span></label>`).join("");
  const stockCard=`<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:16px">🎬 毛片庫存＆指派</b>
      <span class="pill ${rawStockLow(pool.length)?'em':'ok'}">${pool.length} 支毛片・約可剪 ${stockDays} 天</span></div>
    ${!rawStockLow(pool.length)?'':`<div style="margin-top:10px;padding:10px;background:var(--redbg);border-radius:6px;font-size:13.5px;line-height:1.7">
      <b style="color:var(--red)">⚠ 毛片剩 ${pool.length} 支，低於 ${LOW_STOCK} 支了 —— 要去拍片了。</b><br>
      剪輯一天可以剪好幾支，存量不補上來他們就會沒片可剪。</div>`}
    ${pool.length?'':'<p class="muted" style="font-size:13px;margin:8px 0 0">毛片池空了 — 剪輯沒有東西可以剪，請先拍毛片！</p>'}
    ${unassigned.length?`
    <div class="row" style="gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
      <select id="afp_who" style="width:auto;min-width:130px"><option value="">指派給誰…</option>${staff.map(u=>`<option>${esc(u.name)}</option>`).join("")}</select>
      <button class="btn sec sm" type="button" onclick="afpToggleAll(this)">全選</button>
      <button class="btn sm" onclick="assignFootage()">指派勾選的毛片</button></div>
    <div style="margin-top:6px${unassigned.length>6?';max-height:360px;overflow-y:auto':''}">${afpRows}</div>
    <p class="muted" style="font-size:12px;margin:6px 0 0">未指派 ${unassigned.length} 支${unassigned.length>20?'（清單可以往下捲，全都在這裡）':''}</p>`
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
    ${/* 全部列出來：折疊上的數字說有幾支，就要有幾支點得到，不然審不到的那些等於被忘記 */''}
    ${pendingReview.length?pendingReview.map(v=>`<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:8px;align-items:center">
        <div style="min-width:0"><a href="javascript:void(0)" onclick="${openRev(v)}" style="font-weight:600">${esc(vidTitle(v))}</a>${reviewWaitPill(v)}
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
    const isCS=NO_EDIT_ROLES.includes(u.role);   // 不剪片的角色：不顯示影片數字
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
    // 跟員工自己看到的那份一致：今天排的 ＋ 以前排的但還沒做完的（不分是誰排的）
    const tasks=realTasks(allTasks).filter(t=>t.user===name&&(t.date===today||taskOverdue(t)||taskDoneToday(t)))
      .sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))||String(a.createdAt||"").localeCompare(String(b.createdAt||"")));
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
        <input id="fa_${idx}" placeholder="交辦 ${esc(name)} 一件事…" style="flex:1;min-width:0" onkeydown="if(enterKey(event))flowAssign(${idx},'${esc(jsEsc(name))}')">
        <button class="btn sm" style="flex:none" onclick="flowAssign(${idx},'${esc(jsEsc(name))}')">交辦</button></div>`}
    </div>`; }
function viewFlow(){
  const staff=staffSorted((STATE.users||[]).filter(u=>STAFF_ROLES.includes(u.role||"editor")));
  const allTasks=Object.values((STATE&&STATE.tasks)||{});
  const g=scheduleGlance();
  const pool=rawStock();   // 只算真的有毛片的（有腳本沒毛片的還不能剪，不算存量）
  const unassigned=pool.filter(v=>!v.assignedTo).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const doneToday=(STATE.videos||[]).filter(v=>isPublished(v)&&String(v.finishedAt||"").slice(0,10)===today);
  const wipAll=(STATE.videos||[]).filter(v=>v.stage==="剪輯中");
  const daily=Math.max(1,+daySum(today)||4);
  const stockDays=Math.floor(pool.length/daily);
  const okRunway=g.runway>=RUNWAY_TARGET;
  const pct=Math.min(100, Math.round(g.runway/RUNWAY_TARGET*100));

  const runwayCard=flowRunwayCard(g, okRunway, pct);

  const stockCard=flowStockCard(staff.filter(u=>!NO_EDIT_ROLES.includes(u.role)), pool, unassigned, stockDays);   // 毛片只指派給剪輯

  const reviewQueueCard=flowReviewQueueCard();

  let fi=0;
  const staffCards=staffByGroup(staff).map(g=>
    `<h4 style="margin:16px 0 8px;font-size:14px;color:var(--muted);letter-spacing:.06em">${esc(g.zh)}（${g.people.length}）</h4>`
    + g.people.map(u=>flowStaffCard(u, fi++, allTasks)).join("")).join("");

  // ---- 頂部焦點列 ----
  const focus=`<div class="focusbar">
    <div><span class="fn ${okRunway?'':'warn'}">${g.runway}<i>/${RUNWAY_TARGET}</i></span><span class="fl">排程存量(天)</span></div>
    <div><span class="fn ${rawStockLow(pool.length)?'warn':''}">${pool.length}</span><span class="fl">毛片庫存</span></div>
    <div><span class="fn">${wipAll.length}</span><span class="fl">製作中</span></div>
    <div><span class="fn">${doneToday.length}</span><span class="fl">今日完成</span></div>
  </div>`;

  // 「待你審片」擺在毛片庫存的下一個 —— 原本在整頁最後面，滑到那裡的人不多，
  // 結果剪輯剪完的片一直沒人審。預設仍然摺疊（標題上的數字就說得完該不該點開）。
  return `<h2>流程中控 <span class="muted" style="font-size:13px">${today}</span></h2>
  ${focus}${msgInboxCard()}${runwayCard}${stockCard}${reviewQueueCard}
  <h3 style="margin:18px 0 10px">團隊交辦＆回報</h3>
  ${staffCards||'<p class="muted">還沒有成員</p>'}`;
}

// ===== 儀表板：小工具（各卡片共用）=====
const dashHM=iso=>String(iso||"").slice(11,16);                       // ISO → HH:MM
const dashDur=(a,b)=>{ const m=durationMin(a,b); if(m==null) return "—"; const h=Math.floor(m/60), mm=m%60; return (h?h+"h":"")+mm+"m"; };
const dashMin=(m)=> (typeof m==="number")?((Math.floor(m/60)?Math.floor(m/60)+"h":"")+(m%60)+"m"):"—";
// 出勤小藥丸。
// ⚠️ 自己那張卡如果還有沒送出去的打卡，一定要標出來 —— 不標的話它跟「已經送到、
//    全公司都看得到」長得一模一樣，員工就會以為打好了（這正是出過事的那一次）。
//    只標自己的：別人的卡片上那筆一定是從伺服器來的，我這台不可能有他的待送寫入。
function dashPendingMark(s){
  if(!PENDING || !s || String(s.user||"")!==currentUser()) return "";
  return ` <span class="pill em" style="font-size:10px" title="${T("這筆還在你這台電腦上，主管還看不到","Still on your computer — your manager can't see it yet")}">${T("還沒同步","not synced")}</span>`;
}
const dashStatusPill=(s)=> !s||!s.clockIn ? `<span class="pill em">${T("未上班","Off")}</span>`
    : (s.clockOut?`<span class="pill ok">${T("已下班","Clocked out")}</span>${dashPendingMark(s)}`
                 :`<span class="pill wa">${T("上班中","On shift")}</span>${dashPendingMark(s)}`);
// 一支影片一行：片名太長就用「…」截掉，後面的狀態與工時一定看得到，不會被擠到下一行。
// 想看完整片名點進去就有。
const dashVLine=(v,extra)=>`<div style="margin:5px 0;display:flex;gap:6px;align-items:baseline">
  <a href="javascript:void(0)" onclick="${vidOpenFn(v)}"
     style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
     title="${esc(vidTitle(v))}">• ${esc(vidTitle(v))}</a>
  ${extra?`<span style="flex:none;white-space:nowrap">${extra}</span>`:""}</div>`;

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
    const wipHTML=isToday?(e.wip.length? e.wip.map(v=>vline(v,' <span class="pill wa" style="font-size:10px">進行中</span>'+daySmall(v))).join("")
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
  const poolAll=(STATE.videos||[]).filter(v=>isSourceVid(v) && v.stage==="待處理");
  const poolN=poolAll.length;
  const unassignedPool=poolAll.filter(v=>!v.assignedTo).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const assignCount={}; poolAll.forEach(v=>{ if(v.assignedTo) assignCount[v.assignedTo]=(assignCount[v.assignedTo]||0)+1; });
  const noSchedN=(STATE.videos||[]).filter(v=>isSourceVid(v) && vidSegment(v)==="newNoSched").length;
  const wipN=(STATE.videos||[]).filter(v=>isSourceVid(v) && v.stage==="剪輯中").length;
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
        <select id="va_who" style="min-width:140px"><option value="">— 選擇員工 —</option>${staffOptGroups(["editor","intl","cs","manager","hr","mkt","pick","svc","ship"])}</select>
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
        <select id="asg_who"><option value="">— 選擇員工 —</option>${staffOptGroups(["editor","intl","cs","mkt","pick","svc","ship"])}</select></div>
      <div><label>交辦內容</label>
        <input id="asg_txt" placeholder="要交辦的工作內容…" onkeydown="if(enterKey(event))assignTaskSel()"></div>
    </div>
    <div style="margin-top:10px"><label>對接窗口（選填）</label>
      <input id="asg_contact" list="asg_contact_dl" placeholder="選用過的窗口或輸入新的（沒有可留空）" onkeydown="if(enterKey(event))assignTaskSel()">${contactDatalist('asg_contact_dl')}</div>
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
// 團隊看板只列同區的人 —— 卡片上會寫出每個人今天完成的影片標題，
// 不分區的話台灣看得到英文／泰文片名、海外看得到中文毛片名。
// 管理層（管理員／經理人／人資）看全部，也永遠對所有人可見（大家要找得到主管）。
function teamStaff(){
  return staffSorted((STATE.users||[]).filter(u=>STAFF_ROLES.includes(u.role||"editor") && seesPerson(u.name)));
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
// ── 本月成效的圖表（v126）────────────────────────────────────────────
// 原本只有一張七欄的表。表能給精確值，但看不出「誰在哪幾天有產出、誰斷檔、
// 月底有沒有塞車」—— 那是形狀問題，要用圖。表留著，圖加在上面。
//
// 兩張圖各自回答一個問題：
//   熱力圖  這個月每一天、每個人各完成幾支（時間×人的分布）
//   長條圖  這個月誰做了多少（單一量的排序比較）
// 兩張都只列會剪片的人 —— 行銷／客服／出貨不剪片，畫出來整列是空的，
// 看起來像「這個人沒做事」，那是騙人的。他們的交辦完成在下面的表裡。

// 一個月有幾天（ym = "YYYY-MM"）
function ymDays(ym){ const y=+String(ym).slice(0,4), m=+String(ym).slice(5,7); return new Date(y,m,0).getDate(); }
// ym 這個月第 d 天是禮拜幾
function ymDow(ym,d){ return new Date(`${ym}-${String(d).padStart(2,"0")}T00:00:00`).getDay(); }
// 一人一列、一天一格：那天完成上片幾支
function teamHeatData(staff, ym){
  const days=ymDays(ym);
  const idx={}; const rows=staff.map(u=>{ const r={u, cells:new Array(days).fill(0), total:0}; idx[u.name]=r; return r; });
  (STATE.videos||[]).forEach(v=>{
    if(!isPublished(v)) return;
    const f=String(v.finishedAt||"").slice(0,10);
    if(f.slice(0,7)!==ym) return;
    const r=idx[v.editor]; if(!r) return;
    const d=+f.slice(8,10); if(!(d>=1&&d<=days)) return;
    r.cells[d-1]++; r.total++;
  });
  const dayTotals=new Array(days).fill(0);
  rows.forEach(r=>r.cells.forEach((n,i)=>{ dayTotals[i]+=n; }));
  const max=rows.reduce((a,r)=>Math.max(a, ...r.cells), 0);
  // 多的排上面，跟下面的長條圖同一個順序 —— 兩張圖的列對得起來才好互相參照
  rows.sort((a,b)=>b.total-a.total || String(a.u.name).localeCompare(String(b.u.name)));
  return {days, rows, dayTotals, max};
}
// 幾支 → 第幾階顏色（0＝沒有）。五階，最大值撐滿最深的那一階。
function heatLevel(n, max){
  if(!n) return 0;
  if(max<=1) return 5;
  return Math.max(1, Math.min(5, Math.ceil(n/max*5)));
}
function teamHeatCard(staff, ym){
  const list=staff.filter(u=>!noEdit(u));
  if(!list.length) return "";
  const {days, rows, dayTotals, max}=teamHeatData(list, ym);
  const todayD=(today.slice(0,7)===ym)? +today.slice(8,10) : days;   // 這個月的話，今天之後還沒發生
  const dow=T("日,一,二,三,四,五,六","Su,Mo,Tu,We,Th,Fr,Sa").split(",");   // 中文一個字、英文兩個字母
  const head=Array.from({length:days},(_,i)=>{ const d=i+1, w=ymDow(ym,d);
    return `<th class="hm-d${(w===0||w===6)?' wk':''}${d===todayD?' now':''}" title="${ym}-${String(d).padStart(2,"0")}（${dow[w]}）">${d}</th>`; }).join("");
  const body=rows.map(r=>`<tr>
      <th class="hm-n" title="${esc(r.u.name)}">${esc(r.u.name)}</th>
      ${r.cells.map((n,i)=>{ const d=i+1, future=d>todayD;
        if(future) return `<td class="hm-c hm-f"></td>`;
        const lv=heatLevel(n,max);
        const tip=`${r.u.name}・${ym}-${String(d).padStart(2,"0")} ${dow[ymDow(ym,d)]}　`
          + (n? T("完成 "+n+" 支","published "+n) : T("沒有完成上片","nothing published"));
        return `<td class="hm-c l${lv}" title="${esc(tip)}">${n?`<span>${n}</span>`:""}</td>`;
      }).join("")}
      <td class="hm-t">${r.total}</td></tr>`).join("");
  const foot=`<tr><th class="hm-n hm-sum">${T("每日合計","Daily")}</th>
      ${dayTotals.map((n,i)=>`<td class="hm-c hm-sum">${(i+1)<=todayD&&n?n:""}</td>`).join("")}
      <td class="hm-t hm-sum">${dayTotals.reduce((a,b)=>a+b,0)}</td></tr>`;
  return `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap">
      <b style="font-size:15px">${T("每天完成上片","Published per day")}</b>
      <span class="hm-key">${T("少","less")}
        ${[0,1,2,3,4,5].map(l=>`<i class="hm-c l${l}"></i>`).join("")}
        ${T("多","more")}${max?`　<span class="muted">${T("單日最多 "+max+" 支","peak "+max)}</span>`:""}</span>
    </div>
    <div class="muted" style="font-size:12px;margin-top:4px">${T(
      "顏色越深＝那天完成越多，淺灰格＝那天沒有完成上片。","Darker = more finished that day; a pale cell means none.")
      + (today.slice(0,7)===ym ? T("今天之後的日子不畫格子。"," Days after today are left undrawn.") : "")}</div>
    <div class="hm-wrap"><table class="hm">
      <thead><tr><th class="hm-n"></th>${head}<th class="hm-t">${T("合計","Total")}</th></tr></thead>
      <tbody>${body}${foot}</tbody></table></div>
  </div>`;
}
// 本月完成上片排行：單一數量的比較，橫條最好讀（名字長度不影響、直接標數字）
function teamBarCard(months, ym){
  const list=months.filter(x=>!noEdit(x.u)).slice().sort((a,b)=>b.m.count-a.m.count || String(a.u.name).localeCompare(String(b.u.name)));
  if(!list.length) return "";
  const max=Math.max(1, ...list.map(x=>x.m.count));
  return `<div class="card">
    <b style="font-size:15px">${(!ym||ym===today.slice(0,7))
      ? T("本月完成上片","Published this month")
      : T((+ym.slice(0,4))+" 年 "+(+ym.slice(5,7))+" 月完成上片", ym+" published")}</b>
    <div class="muted" style="font-size:12px;margin-top:4px">${T(
      "括號是其中有帶商品的支數。","In brackets: how many carried a product.")}</div>
    <div class="barlist">${list.map(({u,m})=>`
      <div class="bl-row" title="${esc(u.name)}：${T("完成 "+m.count+" 支","published "+m.count)}${m.sales?T("，帶商品 "+m.sales+" 支",", "+m.sales+" with product"):""}">
        <span class="bl-n">${esc(u.name)}</span>
        <span class="bl-track"><span class="bl-bar" style="width:${m.count?Math.max(2,Math.round(m.count/max*100)):0}%"></span></span>
        <span class="bl-v">${m.count}${m.sales?`<i>（${m.sales}）</i>`:""}</span>
      </div>`).join("")}</div>
  </div>`;
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
  // isCS＝**被看的人**不剪片（那幾格對他沒意義）；needVideos()＝**看的人**手上有沒有影片資料。
  // 兩個都要問：行銷／客服／出貨沒下載影片，那幾格會全部算成 0 —— 那不是「他今天沒做」，
  // 是「我算不出來」。算不出來就不要畫（v152）。
  const name=u.name, minLabel=dashMin, hm=dashHM, isCS=noEdit(u)||!needVideos();
  const {s, done, wip, tasks, notices, workMin}=teamDayStat(name, allTasks);
  const att=(s&&s.clockIn)?`${hm(s.clockIn)}–${s.clockOut?hm(s.clockOut):"…"}・${T("工時","Hours")} ${minLabel(workMin)}`:T("今天還沒上線","Not clocked in yet");
  const list=(arr,label,cls)=>arr.length?arr.map(v=>`<div style="font-size:13px;padding:3px 0;display:flex;gap:6px;align-items:flex-start;min-width:0">
      <span class="pill ${cls}" style="font-size:10px;flex:none">${label}</span>
      <span class="linetitle">${esc(vidTitle(v))}</span>${daySmall(v)}</div>`).join(""):"";
  const nDone=tasks.filter(t=>t.done).length;
  return `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:15px">${esc(name)} <span class="muted" style="font-size:11px;font-weight:400">${T(ROLE_LABEL[u.role||"editor"]||"", roleEn(u.role||"editor"))}</span></b>
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
    .sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
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
        ${groups.map(g=>`<option value="__${esc(g.key)}__">全體${esc(g.zh)}（${g.people.length}）</option>`).join("")}
        ${STAFF_ROLES.map(r=>{ const n=staff.filter(u=>(u.role||"editor")===r).length;
            return n?`<option value="__${r}__">全體${esc(ROLE_LABEL[r])}（${n}）</option>`:""; }).join("")}
        ${groups.map(g=>`<optgroup label="${esc(g.zh)}">${g.people.map(u=>`<option value="${esc(u.name)}">${esc(u.name)}</option>`).join("")}</optgroup>`).join("")}</select>
      <input id="hrn_txt" placeholder="要通知大家的事…" style="flex:1;min-width:180px" onkeydown="if(enterKey(event))hrNotify()">
      <button class="btn sm" style="flex:none" onclick="hrNotify()">送出通知</button>
    </div>
    ${rows?`<div style="margin-top:12px"><b style="font-size:13px">我發出的通知</b>${rows}</div>`:''}
  </div>`;
}
const noEdit=(u)=>NO_EDIT_ROLES.includes(u&&u.role);   // 不剪片的角色
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
  const opt=(k,zh,en)=>`<option value="${k}" ${TEAM_GROUP===k?"selected":""}>${T(zh,en)}${paren(k==="all"?all.length:all.filter(u=>(u.role||"editor")===k).length)}</option>`;
  return `<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center;margin:10px 0 4px">
    <select style="width:auto" onchange="teamSetGroup(this.value)">
      ${opt("all","全部","Everyone")}${STAFF_ROLES
        .filter(r=>all.some(u=>(u.role||"editor")===r) || TEAM_GROUP===r)   // 沒有人的職位不列出來（剛開的職位不佔位）
        .map(r=>opt(r, ROLE_LABEL[r], ROLE_GROUP_EN[r])).join("")}</select>
    <input value="${esc(TEAM_Q)}" placeholder="${T("找人…","Find someone…")}" style="flex:1;min-width:110px"
      onchange="teamSetQ(this.value)" onkeydown="if(enterKey(event))teamSetQ(this.value)">
    ${(TEAM_GROUP!=="all"||TEAM_Q)?`<span class="muted" style="font-size:12px">${T("顯示 "+shown.length+" / "+all.length+" 人","Showing "+shown.length+" of "+all.length)}</span>`:""}
  </div>`;
}
// 團隊看板的「月成效」看哪一個月。
// 本來寫死當月 —— 但月底檢討、算獎金、跟上個月比，都需要往前翻。
// 底下的 teamMonthStat／teamHeatCard 本來就吃 ym 參數，所以只要把月份變成可選的。
let TEAM_YM=null;
function teamYM(){
  if(!TEAM_YM) TEAM_YM=today.slice(0,7);
  return TEAM_YM;
}
function teamSetYM(ym){
  if(!/^\d{4}-\d{2}$/.test(String(ym||"")) || ym>today.slice(0,7)) return;
  TEAM_YM=ym;
  // 出勤天數要看打卡紀錄，而打卡常駐只訂閱最近兩個月 —— 往前翻要補讀那一個月
  attEnsureMonth(ym);
  render();
}
// 有資料的月份：從最早那一筆到這個月。
// 不寫死「最近 12 個月」——資料只有三個月的時候不該給九個空月份可選。
//
// ⚠️ 只看交辦與打卡，**不能看 STATE.videos** —— 行銷／客服／出貨／人資根本不下載
//    影片資料（v138 的效能修正），拿影片來算的話他們的月份清單會跟別人不一樣，
//    而且會把那個「不下載也長一樣」的保證打破（smoke-v139 就是在釘這件事）。
//    實務上也不缺：有人上了片，那天一定有打卡與交辦。
function teamMonths(){
  const cur=today.slice(0,7);
  let min=cur;
  const take=(d)=>{ const m=String(d||"").slice(0,7); if(/^\d{4}-\d{2}$/.test(m) && m<min) min=m; };
  Object.values((STATE&&STATE.tasks)||{}).forEach(t=>take(t.date));
  Object.values((STATE&&STATE.shifts)||{}).forEach(x=>take(x.date));
  const out=[]; let [y,m]=min.split("-").map(Number);
  // 給個上限，資料再久也不要生出幾百個選項
  for(let i=0;i<60;i++){
    const ym=`${y}-${String(m).padStart(2,"0")}`;
    out.push(ym);
    if(ym>=cur) break;
    m++; if(m>12){ m=1; y++; }
  }
  return out.reverse();   // 新的在上面（最常看的是最近幾個月）
}
// ⚠️ 這裡刻意用下拉、不用按鍵：團隊看板全公司都看得到，規矩是「除了篩選之外
//    不能操作任何東西」（smoke-v55／v66／v67／v70／v83 都在釘這件事）。
//    換月份是看的方式、不是動資料，所以走跟現有篩選一樣的形式。
function teamMonthPicker(ym){
  const opts=teamMonths();
  if(!opts.includes(ym)) opts.unshift(ym);
  return `<select onchange="teamSetYM(this.value)" style="width:auto;min-width:130px;margin-left:10px;font-size:13px;padding:4px 8px">
    ${opts.map(x=>{ const [y,m]=x.split("-").map(Number);
      return `<option value="${x}" ${x===ym?"selected":""}>${T(y+" 年 "+m+" 月", x)}${x===today.slice(0,7)?T("（本月）"," (current)"):""}</option>`;
    }).join("")}</select>`;
}
function viewTeam(){
  const everyone=teamStaff();
  const staff=teamFilter(everyone);
  const allTasks=Object.values((STATE&&STATE.tasks)||{});
  const ym=teamYM(), minLabel=dashMin;
  const curYM=today.slice(0,7);
  if(!everyone.length) return `<h2>${T("團隊看板","Team Board")}</h2><div class="card muted">${T("還沒有成員","No members yet")}</div>`;
  if(!staff.length) return `<h2>${T("團隊看板","Team Board")}</h2>${teamFilterBar(everyone, staff)}
    <div class="card muted">${T("沒有符合的人","Nobody matches")}</div>`;
  // v152：不下載影片資料的職位（行銷／客服／出貨）算不出剪輯的產量 ——
  // 以前那幾欄跟兩張圖照畫，全部是 0。那不是「還沒有資料」，是**假數字**：
  // 正式資料實測，同一天管理員看到 168、客服看到 0。看到 0 的人只會以為大家沒做事。
  // 算不出來就不要畫。他們真正要看的（出勤、交辦）本來就在同一張表裡。
  const vidOK=needVideos();
  const months=staff.map(u=>({u, m:teamMonthStat(u.name, allTasks, ym)}));
  const dayStats=staff.map(u=>teamDayStat(u.name, allTasks));
  const dayDone=dayStats.reduce((a,d)=>a+d.done.length,0);
  const dayOn=dayStats.filter(d=>d.s&&d.s.clockIn).length;
  const dayTaskAll=dayStats.reduce((a,d)=>a+d.tasks.length,0);
  const dayTaskDone=dayStats.reduce((a,d)=>a+d.tasks.filter(t=>t.done).length,0);
  // 上面那條速覽是「現在的狀況」，不能跟著往前翻的月份跑 —— 永遠算當月
  const monDone=(ym===curYM)
    ? months.reduce((a,x)=>a+x.m.count,0)
    : staff.reduce((a,u)=>a+teamMonthStat(u.name, allTasks, curYM).count, 0);
  const rows=months.map(({u,m})=>`<tr>
    <td data-label="${T("成員","Member")}"><b>${esc(u.name)}</b> <span class="muted" style="font-size:11px">${T(ROLE_LABEL[u.role||"editor"]||"", roleEn(u.role||"editor"))}</span></td>
    ${vidOK?`<td data-label="${T("完成上架","Published")}">${noEdit(u)?"—":m.count}</td>
    <td data-label="${T("剪片速度","Days/clip")}">${noEdit(u)?"—":(m.avgDays!=null?m.avgDays.toFixed(1)+T(" 天"," d"):"—")}</td>
    <td data-label="${T("平均工時","Avg time")}">${noEdit(u)?"—":minLabel(m.avgMin)}</td>
    <td data-label="${T("帶商品","With product")}">${noEdit(u)?"—":m.sales}</td>`:''}
    <td data-label="${T("出勤天數","Days on")}">${m.att}</td>
    <td data-label="${T("交辦完成","Tasks done")}">${m.tAll?`${m.tDone}/${m.tAll}`:"—"}</td></tr>`).join("");
  return `<h2>${T("團隊看板","Team Board")}</h2>
  ${currentRole()==="hr"?msgInboxCard():''}
  ${p2pWatchCard()}
  ${["hr","boss"].includes(currentRole())?teamNoticeCompose(staff):''}
  ${currentRole()==="hr"?myMsgFold():''}
  ${teamFilterBar(everyone, staff)}
  <div class="focusbar">
    <div><span class="fn">${dayOn}<i>/${staff.length}</i></span><span class="fl">${T("今日出勤","On today")}</span></div>
    ${vidOK?`<div><span class="fn">${dayDone}</span><span class="fl">${T("今日完成","Done today")}</span></div>`:''}
    <div><span class="fn ${dayTaskAll&&dayTaskDone<dayTaskAll?'warn':''}">${dayTaskDone}<i>/${dayTaskAll}</i></span><span class="fl">${T("交辦完成","Tasks done")}</span></div>
    ${vidOK?`<div><span class="fn">${monDone}</span><span class="fl">${T("本月完成","Done this month")}</span></div>`:''}
  </div>
  <h3 style="margin:18px 0 10px">${T("今日成效","Today")} <span class="muted" style="font-size:13px;font-weight:400">${today}${T("（"+weekdayZh(today)+"）","")}</span></h3>
  ${staffByGroup(staff).map(g=>`<h4 style="margin:14px 0 8px;font-size:14px;color:var(--muted);letter-spacing:.06em">${T(g.zh,g.en)}${paren(g.people.length)}</h4>
    <div class="teamgrid">${g.people.map(u=>teamDayCard(u, allTasks)).join("")}</div>`).join("")}
  <h3 style="margin:24px 0 10px;display:flex;align-items:center;flex-wrap:wrap">${ym===curYM?T("本月成效","This month"):T("月成效","Monthly")}${teamMonthPicker(ym)}</h3>
  ${vidOK?teamHeatCard(staff, ym):''}
  ${vidOK?teamBarCard(months, ym):''}
  ${(vidOK&&staff.some(noEdit))?`<div class="muted" style="font-size:12px;margin:-4px 0 10px">${T(
    "上面兩張圖只列會剪片的同仁 —— 行銷／客服／出貨不剪片，畫進去整列都是空的，看起來會像沒做事。他們的交辦完成與出勤在下面的表裡。",
    "The two charts above only list people who cut videos. Everyone else's tasks and attendance are in the table below.")}</div>`:''}
  <div class="card">
    <table class="responsive"><thead><tr><th>${T("成員","Member")}</th>${vidOK?`<th>${T("完成上架","Published")}</th><th>${T("剪片速度","Days/clip")}</th><th>${T("平均工時","Avg time")}</th><th>${T("帶商品","With product")}</th>`:''}<th>${T("出勤天數","Days on")}</th><th>${T("交辦完成","Tasks done")}</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>`;
}
// ===================================================================
// 剪輯成效（v152）—— 只有管理員與人資看得到
//
// 要回答的就三件事：這個月每個剪輯做完幾支、審過了沒、**檔案在哪個資料夾**。
// 最後那一項是重點 —— 審過之後要能直接點進去看成片，不用再去問人。
//
// 為什麼不塞進團隊看板：那一頁全公司都看得到，而且是刻意「除了篩選之外不能
// 操作任何東西」（smoke-v55／v66／v67／v70／v83 五支在釘「沒有 <button>、
// 沒有 onclick」）。這一頁的重點正好相反 —— 就是要能點 —— 而且是管理用的，
// 所以獨立一頁、限定管理員與人資。
//
// 這一頁完全不寫資料，純查詢。
// ===================================================================
let OUT_FILTER="all";                 // all｜ok 審過｜wait 還沒審｜back 退回｜nodrive 缺資料夾
function canSeeOutput(){ return ["boss","hr"].includes(currentRole()); }
function setOutFilter(k){ OUT_FILTER=OUT_FILTER===k?"all":k; render(); }
// 一支片的審核狀態（沒有 reviewStatus ＝ 還沒審）
function outState(v){ return v.reviewStatus==="通過" ? "ok" : (v.reviewStatus==="退回" ? "back" : "wait"); }
// 某人某月「做完的片」。用 editor 而不是 claimedBy —— 完成的功勞記在剪輯身上。
// 二創版本也算（那也是他剪的），所以不篩 isSourceVid。
function outVideosOf(name, ym){
  return (STATE.videos||[]).filter(v=>v.editor===name && isPublished(v)
      && String(v.finishedAt||"").slice(0,7)===ym)
    .sort((a,b)=>String(b.finishedAt||"").localeCompare(String(a.finishedAt||"")));
}
function outCounts(list){
  const c={all:(list||[]).length, ok:0, wait:0, back:0, nodrive:0};
  (list||[]).forEach(v=>{ c[outState(v)]++; if(!familyDrive(v)) c.nodrive++; });
  return c;
}
function outApply(list){
  if(OUT_FILTER==="all") return list;
  if(OUT_FILTER==="nodrive") return list.filter(v=>!familyDrive(v));
  return list.filter(v=>outState(v)===OUT_FILTER);
}
const OUT_CATS=[["all","全部","All"],["ok","審過","Approved"],["wait","還沒審","Not reviewed"],
                ["back","退回","Sent back"],["nodrive","缺資料夾","No folder"]];
function outFilterBar(total){
  return `<div class="vtabs" style="margin:10px 0">${OUT_CATS.map(([k,zh,en])=>
    `<button class="vtab ${OUT_FILTER===k?'on':''}" onclick="setOutFilter('${k}')"><span>${T(zh,en)}</span> <span class="vtab-n">${total[k]||0}</span></button>`).join("")}</div>`;
}
// 一支片一列：片名 → 完成日 → 審核狀態 → 資料夾
function outRow(v){
  const st=outState(v);
  const pill = st==="ok"   ? `<span class="pill ok" style="font-size:10px">${T("審過","Approved")}</span>`
             : st==="back" ? `<span class="pill em" style="font-size:10px">${T("退回","Sent back")}</span>`
             :               `<span class="pill wa" style="font-size:10px">${T("還沒審","Not reviewed")}</span>`;
  const d=familyDrive(v);
  // 資料夾連結一律開新分頁，而且 rel 要帶 noopener —— 這是外部網址。
  const drive = d
    ? `<a class="btn sec sm" href="${esc(d)}" target="_blank" rel="noopener noreferrer">📁 ${T("開資料夾","Open folder")}</a>`
    : `<span class="muted" style="font-size:12px">${T("沒有存檔資料夾","No folder yet")}</span>`;
  // 人資不能編輯影片（NO_EDIT_ROLES），所以片名對他就是純文字；管理員點得開。
  const title = currentRole()==="boss"
    ? `<a href="javascript:void(0)" onclick="${vidOpenFn(v)}">${shpBadge(v)}${esc(vidTitle(v))}</a>`
    : `${shpBadge(v)}${esc(vidTitle(v))}`;
  return `<tr>
    <td data-label="${T("影片","Video")}">${title}</td>
    <td data-label="${T("完成","Finished")}"><span class="muted" style="font-size:12px">${esc(String(v.finishedAt||"").slice(5,10))}</span></td>
    <td data-label="${T("審核","Review")}">${pill}</td>
    <td data-label="${T("檔案","Files")}">${drive}</td></tr>`;
}
// list 由呼叫端算好傳進來 —— viewOutput 上面統計總數時已經掃過一次，
// 這裡再掃一次等於每個人掃兩遍（10 個剪輯就是 20 次全表掃描）。這是我 v152 的疏失。
function outPersonCard(u, ym, list){
  const all=list||outVideosOf(u.name, ym);
  const c=outCounts(all);
  const shown=outApply(all);
  const head=`<div class="row" style="justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap">
      <b style="font-size:16px">${esc(u.name)}</b>
      <span class="row" style="gap:6px;flex-wrap:wrap">
        <span class="pill">${T("完成 "+c.all+" 支","done "+c.all)}</span>
        ${c.ok?`<span class="pill ok">${T("審過 "+c.ok,"approved "+c.ok)}</span>`:''}
        ${c.wait?`<span class="pill wa">${T("還沒審 "+c.wait,"waiting "+c.wait)}</span>`:''}
        ${c.back?`<span class="pill em">${T("退回 "+c.back,"sent back "+c.back)}</span>`:''}
        ${c.nodrive?`<span class="pill em">${T("缺資料夾 "+c.nodrive,"no folder "+c.nodrive)}</span>`:''}
      </span></div>`;
  const body = !c.all
    ? `<div class="muted" style="font-size:13px;margin-top:8px">${T("這個月還沒有完成的影片。","Nothing finished this month.")}</div>`
    : !shown.length
    ? `<div class="muted" style="font-size:13px;margin-top:8px">${T("這個月他沒有符合目前篩選的影片。","Nothing matches the current filter.")}</div>`
    // 產量高的人一個月七十幾支 —— 全部攤平的話整頁要捲很久，而且看不出還有誰在下面。
    // 超過 8 列就裝進自己的捲動框，一個人一格，卡片高度就穩定了。
    // ⚠️ keepscroll 只有**帶 id** 才接得回捲動位置（見 render 的 keepScroll）。
    //    沒有 id 的話，背景每同步一次就把人彈回最上面 —— 正在翻七十幾列的時候
    //    這比沒有捲動框還煩。id 用名字的雜湊，重繪前後才會是同一個。
    : `<div${shown.length>8?` id="out_${foldKey(u.name)}" class="keepscroll" style="max-height:340px;overflow-y:auto;margin-top:8px"`:''}>
       <table class="responsive"${shown.length>8?'':' style="margin-top:8px"'}><thead><tr>
        <th>${T("影片","Video")}</th><th>${T("完成","Finished")}</th><th>${T("審核","Review")}</th><th>${T("檔案","Files")}</th>
      </tr></thead><tbody>${shown.map(outRow).join("")}</tbody></table></div>`;
  return `<div class="card">${head}${body}</div>`;
}
function viewOutput(){
  if(!canSeeOutput()) return `<h2>${T("剪輯成效","Editor output")}</h2>
    <div class="card muted">${T("這一頁只有管理員與人資看得到。","This page is for admins and HR only.")}</div>`;
  const ym=teamYM(), curYM=today.slice(0,7);
  // 會剪片的人才列 —— 行銷／客服／出貨不剪片，列進來整張卡都是空的，看起來像沒做事。
  const staff=staffSorted((STATE.users||[]).filter(u=>["editor","intl"].includes(u.role||"editor")));
  if(!staff.length) return `<h2>${T("剪輯成效","Editor output")}</h2>
    <div class="card muted">${T("還沒有剪輯成員","No editors yet")}</div>`;
  if(videosLoading()) return `<h2>${T("剪輯成效","Editor output")}</h2>
    <div class="card muted">${T("影片資料還在載入…","Loading videos…")}</div>`;
  // 一個人只掃一次，統計跟卡片共用同一份清單
  const total={all:0,ok:0,wait:0,back:0,nodrive:0};
  const per=staff.map(u=>({u, list:outVideosOf(u.name, ym)}));
  per.forEach(({list})=>{ const c=outCounts(list); Object.keys(total).forEach(k=>{ total[k]+=c[k]; }); });
  return `<h2 style="display:flex;align-items:center;flex-wrap:wrap">${
      ym===curYM?T("本月剪輯成效","Editor output — this month"):T("剪輯成效","Editor output")
    }${teamMonthPicker(ym)}</h2>
  <div class="muted" style="font-size:12px;margin:0 0 4px">${T(
    "每個人這個月做完幾支、審過了沒。審過的直接按「開資料夾」就看得到成片。",
    "What each person finished this month and whether it passed review. Approved ones open straight into the Drive folder.")}</div>
  ${total.nodrive?`<div class="muted" style="font-size:12px;margin:0 0 4px">${T(
    "「缺資料夾」＝那支片還沒有人填存檔位置，所以點不進去 —— 要回頭請剪輯補。",
    "“No folder” means nobody filled in the storage location yet, so there is nothing to open.")}</div>`:''}
  ${outFilterBar(total)}
  ${per.map(x=>outPersonCard(x.u, ym, x.list)).join("")}`;
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
      <label>${T("影片文案（口播台詞）· 填了片名就必填","Script (spoken lines) · required once a title is filled")}</label>
      <input id="bv${i}" autocomplete="off" placeholder="${T("這支要講什麼","What this clip should say")}">
      <label>${T("毛片雲端連結","Raw footage cloud link")}</label>
      <input id="bl${i}" placeholder="${T("存檔資料夾網址（選填，拍完再補也可以）","Drive folder URL (optional, can be added later)")}">
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
      // 有片名就一定要有文案（同上：只有片名＝空殼，拍片的人接不下去）
      const vcopy=zhTW((val("bv"+i)||"").trim());
      if(!vcopy){ toast(T("第 "+(i+1)+" 支有片名但沒填文案，請補上（或把片名清空跳過這支）",
                          "Clip "+(i+1)+" has a title but no script — fill it in, or clear the title to skip"),true); return false; }
      items.push({name, videoCopy:vcopy, driveFolder:(val("bl"+i)||"").trim(), products:collectProducts("b"+i)}); }
    if(!items.length){ toast(T("請至少輸入一支片名","Enter at least one title"),true); return false; }
    // ID 與編號都由 newVideoRecord 產生（ID 跨裝置不撞號；編號含本批已產生的一起算，避免同批重覆）
    // 編號要先全部算完再寫：nextVideoCode(made) 得看著已產生的那幾支才不會撞號，
    // 這段是同步的，跟寫入無關，所以先跑完再一次批次送出去。
    const made=[];
    for(let i=0;i<items.length;i++){
      made.push(newVideoRecord({code:nextVideoCode(made), name:items[i].name, rawName:items[i].name,
        videoCopy:items[i].videoCopy,
        driveFolder:items[i].driveFolder, products:items[i].products, origLang:bLang,
        tags:(items[i].products||[]).some(p=>p&&p.name)?["寵粉"]:[]}));   // 有銷售商品 → 自動帶「寵粉」
    }
    BULK_BUSY=true; let r={done:0,failed:0};
    try{
      r=await bulkRun(made, rec=>window.DB.set("videos", rec.id, rec));
      if(r.done) logA("批次新增毛片 "+r.done+" 支"+(r.failed?("（失敗 "+r.failed+" 支）"):""), "");
    } finally { BULK_BUSY=false; applyState(LAST_RAW); }
    await delay(300);
    bulkToast(r, T("已新增 "+r.done+" 支毛片", r.done+" clips added"), T("支","clips"));
    return true;
  });
}
function claimVid(id){ write("POST",`/api/videos/${id}/claim`,{},T("已認領，加入我的工作","Claimed — added to your work")); }
// 退回：把已認領的毛片放回共用「待剪毛片」清單，重新給大家選
function unclaimVid(id){ if(!confirm(T("退回這支毛片到待剪清單？大家就能重新認領。","Return this to the shared pool so others can claim it?"))) return; write("POST",`/api/videos/${id}/unclaim`,{},T("已退回待剪毛片清單","Returned to the pool")); }
// 我的剪輯工作：作業中 →（按一下）編輯內容
function setWorkStep(id, step){ dbUpdate("videos", id, {workStep:step, updatedAt:nowIso()}); }
// 完成：剪輯按了才標「剪輯完成」（編輯時的「儲存修改」只存內容、不完成）
function finishWork(id){ const v=vid(id)||{};
  if(!confirm(T("「"+vidTitle(v)+"」剪好了？\n完成後進入「待審核」，等 Regina 審過再上傳雲端＋補連結。","Done cutting \""+vidTitle(v)+"\"?\nIt moves to In review — upload & add links after Regina approves."))) return;
  write("POST","/api/videos/"+id+"/finish",{scheduledDate:v.scheduledDate||null},T("剪輯完成","Done")).then(ok=>{ if(ok) render(); });
}
// 移回剪輯中（重剪）：管理員／經理人把已完成的影片退回該剪輯的今日工作
// 同上：先存再把它移走
function reworkVideo(id){ afterFlush(()=>reworkVideoGo(id)); }
function reworkVideoGo(id){
  const v=vid(id)||{};
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
    <label>${T("存檔資料夾（毛片跟之後所有版本都放這裡）","Drive folder (the raw footage and every later version live here)")}</label>
    <input id="sv_link" placeholder="${T("Google 雲端硬碟資料夾網址（拍完再補也可以）","Google Drive folder URL (can be added after shooting)")}">
    <label>${T("影片文案（影片中 IP 的口播台詞）· 必填","Script (spoken lines in the video) · required")}</label>
    <input id="sv_vcopy" autocomplete="off" placeholder="${T("要講什麼？沒有文案，拍片的人不知道要拍什麼","What should be said? Without it nobody knows what to shoot")}">
    ${productRows("sv", [])}
  `, async ()=>{
    const name=zhTW(val("sv_name").trim());
    if(!name){ toast(T("請輸入原始片名","Enter the raw title"),true); return false; }
    // 文案必填：片名只是代號，文案才說得出要拍什麼。留空的話這支到了拍片那邊等於空殼。
    const vcopy=zhTW(val("sv_vcopy").trim());
    if(!vcopy){ toast(T("請輸入影片文案（口播台詞）——只有片名的話，拍片的人不知道要拍什麼","Enter the script — a title alone doesn’t tell anyone what to shoot"),true); return false; }
    const svProducts=collectProducts("sv");
    const video={name, rawName:name, driveFolder:val("sv_link").trim(), videoCopy:vcopy, products:svProducts,
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
function videoTags(){ const t=brandSetting("videoTags");
  // DEFAULT_TAGS 與下面那組補進來的都是珠寶生意的字。只有第一家該吃到 ——
  // 長照的關鍵字跟珠寶毫無關係，硬塞給它等於每次選標籤都要跳過一半（v132）。
  const src=(Array.isArray(t)&&t.length)?t : (BRAND?["新片","舊片"]:DEFAULT_TAGS);
  const out=[]; src.forEach(x=>{ const r=renameTag(x); if(r&&!out.includes(r)) out.push(r); });
  if(!BRAND) ["寵粉","珠寶介紹","子女傳承","代理招商"].forEach(x=>{ if(!out.includes(x)) out.push(x); });
  return out; }
// 「其他標籤」= 設定的標籤清單，去掉新舊片（新舊由預排上片日自動判斷，僅供排序）
function otherTags(){ const skip=new Set(NEWOLD_TAGS); return videoTags().filter(t=>!skip.has(t)); }
function tagChip(id,t,checked){ return `<label style="display:inline-flex;align-items:center;gap:4px;background:var(--panel2);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:13px">
  <input type="checkbox" class="${id}_tag" value="${esc(t)}" ${checked?"checked":""} style="width:auto;margin:0"> ${esc(dataLabel(t))}</label>`; }
// 標籤：只留可複選的其他標籤（新舊片自動、不設選單）
// 標籤越加越多，全部攤開在手機上佔掉一大塊。預設只露前兩個 ——
// 已經勾起來的一定要露（不然看不出這支選了什麼），其餘收進「更多標籤」。
const TAG_SHOW_MIN=2;
function tagPickerHTML(id, selected){ const sel=new Set(selected||[]);
  const skip=new Set(NEWOLD_TAGS);
  const all=otherTags().slice(); (selected||[]).forEach(t=>{ if(!skip.has(t)&&!all.includes(t)) all.push(t); });
  const head=[], rest=[];
  all.forEach(t=>{ (sel.has(t) || head.length<TAG_SHOW_MIN) ? head.push(t) : rest.push(t); });
  return `<label>${T("標籤（可複選）","Tags (multi-select)")}</label>
    <div id="${id}_box" style="display:flex;flex-wrap:wrap;gap:6px">${head.map(t=>tagChip(id,t,sel.has(t))).join("")}</div>
    ${rest.length?`<details class="fold" style="margin-top:6px"><summary>${T("更多標籤","More tags")}<span class="n">${rest.length}</span></summary>
      <div class="foldbody"><div id="${id}_more" style="display:flex;flex-wrap:wrap;gap:6px">${rest.map(t=>tagChip(id,t,false)).join("")}</div></div></details>`:""}
    <div class="row" style="gap:6px;margin-top:6px"><input id="${id}_new" placeholder="${T("新增標籤…","New tag…")}" style="flex:1"><button type="button" class="btn sm sec" onclick="addTagOpt('${id}')">${PLUS()} ${T("加入","Add")}</button></div>`; }
function collectTags(id){ return Array.from(document.querySelectorAll('.'+id+'_tag:checked')).map(x=>x.value); }
// 有填銷售商品 → 自動勾「寵粉」標籤
function autoPamperTag(prefix){
  let has=false; for(let i=0;i<PRODUCT_MAX;i++){ const e=document.getElementById(prefix+"_pn"+i); if(e&&e.value.trim()){ has=true; break; } }
  if(!has) return;
  const cb=document.querySelector('.'+prefix+'_tag[value="寵粉"]'); if(cb && !cb.checked) cb.checked=true;
}
function addTagOpt(id){ const inp=document.getElementById(id+'_new'); if(!inp) return; const v=(inp.value||'').trim(); if(!v){ return; }
  const box=document.getElementById(id+'_box');
  // 收在「更多標籤」裡的也要算進去，不然同一個標籤會被加兩次
  const more=document.getElementById(id+'_more');
  const has=(el)=>!!el && Array.from(el.querySelectorAll('input')).some(x=>x.value===v);
  if(box && !has(box) && !has(more)){ box.insertAdjacentHTML('beforeend', tagChip(id,v,true)); }
  inp.value=''; }
async function persistNewTags(tags){
  // ⚠️ saveVideo 是先叫這支、後面才走有守衛的寫入。員工視角下影片存不進去，
  //    新標籤卻會偷偷寫進設定裡 —— 唯讀預覽就該完全不留痕跡。
  if(VIEW_AS) return;
  const cur=videoTags(); const add=(tags||[]).filter(t=>t && !cur.includes(t));
  if(!add.length || !window.DB) return;
  try{
    const F=brandField("videoTags");
    if(window.DB.arrayAdd){ for(const t of add) await window.DB.arrayAdd("meta","settings",F,t); }
    else if(window.DB.setSettings){ await window.DB.setSettings({[F]:cur.concat(add)}); }
  }catch(e){} }
// 標籤編輯器（管理員・設定頁）
async function addVideoTagSel(){ if(dbBlocked()) return;
  const t=(val("tag_new")||"").trim(); if(!t){ toast("請輸入標籤名稱",true); return; }
  const cur=videoTags(); if(cur.includes(t)){ toast("已有這個標籤",true); return; }
  try{ const F=brandField("videoTags");
    await dbArrayAdd("meta","settings",F,t,()=>window.DB.setSettings({[F]:cur.concat([t])})); logA("新增標籤",t);
    const e=document.getElementById("tag_new"); if(e) e.value=""; toast("已新增標籤「"+t+"」"); }catch(e){ toast("新增失敗",true); } }
async function delVideoTag(t){ if(dbBlocked()) return;
  if(!confirm("刪除標籤「"+t+"」？（已套用在影片上的不受影響）")) return;
  try{ const F=brandField("videoTags");
    await dbArrayDel("meta","settings",F,t,()=>window.DB.setSettings({[F]:videoTags().filter(x=>x!==t)})); logA("刪除標籤",t); toast("已刪除標籤「"+t+"」"); }catch(e){ toast("刪除失敗",true); } }

// ===================================================================
// 影片庫
// ===================================================================
// 是否剪好（可標新/舊片）：已完成上架，或手選過新/舊片
function isPublished(v){ return !!(v && (v.published===true || ["已完成","已上片"].includes(v.stage))); }
// ── 指派鎖（v124）────────────────────────────────────────────────────
// 主管把某支毛片指派給某位剪輯之後，其他剪輯**照樣看得到**它（數字才對得上、
// 也才知道這支有人在做），但點不開、整列變灰 —— 直到「上片完成」才恢復正常。
// ⚠️ 只管源片。版本殼的 assignedTo 存的是「誰建立的」而不是指派（見 chNewVersion），
// 拿它來鎖會讓剪輯之間互相點不開對方做的蝦皮／馬來版。
// 「上片完成」＝階段走到已上片、或已經貼了上片連結（已完成只是剪完，還沒上片）。
function assignAired(v){ return !!(v && (v.stage==="已上片" || String(v.publishedLink||"").trim())); }
function assignLocked(v){
  if(!v || !isSourceVid(v)) return false;
  const who=String(v.assignedTo||"");
  if(!who || who===currentUser()) return false;
  if(["boss","manager","hr"].includes(currentRole())) return false;   // 主管一律看得到、打得開
  return !assignAired(v);
}
function assignLockTip(v){ const w=String((v&&v.assignedTo)||"");
  return T("已指派給 "+w+"　上片完成前只有他能編輯", "Assigned to "+w+" — locked until it goes live"); }
function assignLockPill(v){ return assignLocked(v)
  ? `<span class="lockpill" title="${esc(assignLockTip(v))}">🔒 ${esc(T(String(v.assignedTo||""),String(v.assignedTo||"")))}</span>` : ""; }
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
// 「還沒拍」的判斷只看毛片雲端連結，分段見下面的 vidSegment
// 有寫文案、但毛片還沒拍（沒有毛片雲端連結）——「待剪」的前一站
// 為什麼用「有沒有毛片雲端連結」判斷：原始片名每一支都有（新增時必填），
// 毛片連結才是「這支真的拍出來了」的訊號；實際資料裡待剪的 58 支有 57 支都填了。
// 毛片放在哪：就是這支的資料夾。
// 「毛片雲端連結」跟「存檔位置」本來就是同一個地方 —— 第一個拍好毛片的人開的那個
// 資料夾，毛片、成片、二創、封面全在裡面。以前拆成兩格只是在讓人把同一條網址貼兩次。
// 舊資料各自填過的 rawLink 照樣認（不回頭改資料），沒有的就看資料夾。
const vidRawLink=(v)=>String(v&&v.rawLink||"").trim() || familyDrive(v);
const vidHasRaw=(v)=>!!vidRawLink(v);
// 還沒拍＝沒有毛片雲端連結。判斷只看這一個欄位：
// 原始片名每一支都有（新增時必填），文案則常常晚一點才補，
// 所以「有沒有文案」不能拿來判斷拍了沒 —— 只填片名就排日期的那些，
// 以前會被當成待剪片，其實根本還沒拍。
// 剪輯認領了也沒東西可剪，所以這些不放進待認領（v89）。
// 只對一創原本適用：二創殼本來就沒有毛片連結（素材來自源片），不能一起排除。
const vidNotShot=(v)=> !isVersion(v) && !vidHasRaw(v);
// ── 毛片存量 ──────────────────────────────────────────────────
// 「有腳本沒毛片」的還不能剪，不算存量 —— 這是老闆判斷「要不要去拍片」的依據，
// 把還沒拍的算進去會讓數字虛胖（157 支裡有 128 支其實是只有腳本），警戒線就永遠不會響。
// 跟待認領池（poolAll 用 !vidNotShot）同一個標準。
const LOW_STOCK=20;                       // 低於這個支數，老闆就該去拍片了
function rawStock(){ return (STATE.videos||[]).filter(v=>isSourceVid(v) && v.stage==="待處理" && vidHasRaw(v)); }
// 「毛片存量不足」只能有一個定義。以前這支沒有人呼叫，兩個用到它的地方各自
// 把 `< LOW_STOCK` 抄了一遍 —— 門檻哪天要改就會改漏一個。
// 已經算好數量的呼叫端可以直接傳進來，不必再掃一次 STATE.videos。
function rawStockLow(n){ return (n==null?rawStock().length:n) < LOW_STOCK; }
// 剪輯也要看得到存量：沒片可剪是他們先發現的，要讓他們叫得動老闆。
// 只在真的不足時才出現 —— 平常不佔畫面。
// ⚠️ v142 之前這裡擋掉海外，理由是「海外不剪台灣毛片」。那個理由已經不成立 ——
//    現在是同一個毛片池，海外也在剪，沒片可剪他們一樣會被卡住，所以要看得到。
function lowStockCard(){
  const n=rawStock().length; if(!rawStockLow(n)) return "";
  const sentToday=allMsgs().some(m=>m.topic==="shoot" && String(m.createdAt||"").slice(0,10)===today);
  return `<div class="card" style="border-color:var(--red)">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:16px">🎬 ${T("毛片快沒了","Raw footage running out")}</b>
      <span class="pill em">${n}/${LOW_STOCK}</span></div>
    <div style="font-size:13.5px;margin-top:8px;line-height:1.7">${T(
      "待剪的毛片只剩 <b>"+n+"</b> 支（低於 "+LOW_STOCK+" 支）。剪完就沒得剪了，早點讓老闆知道要去拍片。",
      "Only <b>"+n+"</b> clips left to cut (below "+LOW_STOCK+"). Let the boss know it's time to shoot.")}</div>
    <div class="row" style="gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">
      ${sentToday
        ? `<span class="pill ok">${T("今天已經提醒過了","Already reminded today")}</span>`
        : `<button class="btn sm" onclick="remindBossShoot()">${T("提醒老闆拍片","Remind the boss to shoot")}</button>`}
      <span class="muted" style="font-size:12px">${T("同一天只會送一次，不會轟炸","Only one reminder a day")}</span></div>
  </div>`;
}
// 一鍵提醒老闆：走既有的「找主管說一件事」那條路（老闆在流程中控的「同仁來訊」看得到並回覆）
async function remindBossShoot(){ refreshToday();
  if(VIEW_AS){ toast(T("員工視角為唯讀預覽","Read-only preview"),true); return; }
  const n=rawStock().length;
  if(allMsgs().some(m=>m.topic==="shoot" && String(m.createdAt||"").slice(0,10)===today)){
    toast(T("今天已經有人提醒過了","Someone already reminded today"),true); return; }
  const id=uid("M");
  const txt=T("毛片剩 "+n+" 支（低於 "+LOW_STOCK+" 支），要拍片了。","Only "+n+" clips left (below "+LOW_STOCK+") — time to shoot.");
  try{ await window.DB.set("tasks", id, {id, kind:"msg", topic:"shoot", user:currentUser(), to:"boss", date:today,
        title:txt, reply:"", replyBy:"", replyAt:"", seen:false, createdAt:nowIso()});
    toast(T("已提醒老闆（毛片剩 "+n+" 支）","Boss notified"));
    logA("提醒老闆拍片", "毛片剩 "+n+" 支");
  }catch(e){ toast(T("送出失敗，請稍後再試","Failed to send, try again"),true); }
}
// 影片庫七分段。兩個獨立的軸交叉出來的：
//   拍了沒（毛片連結）→ 剪了沒（已完成）→ 過期沒；每一段再分 有沒有排上片日。
//   ① 未拍・未排程   還沒拍、也還沒排 → 要補排日期的在這裡
//   ② 未拍・已排程   日期卡好了，等拍片
//   ③ 待剪・未排程   拍好了但還沒排 → 要補排日期的在這裡
//   ④ 待剪・已排程   拍好也排好了，等剪輯認領
//   ⑤ 剪完・未排程   剪完了但沒排 → 要補排日期的在這裡
//   ⑥ 新片完成       剪完＋排好＋還沒到日子
//   ⑦ 舊片           剪完＋排好＋日子過了
function vidSegment(v){
  if(vidIsOld(v)) return "old";                                            // ⑦
  if(!isPublished(v)){
    if(vidNotShot(v)) return v.scheduledDate ? "scriptSched" : "scriptNoSched";   // ①②
    return v.scheduledDate ? "rawSched" : "rawNoSched";                    // ③④
  }
  return v.scheduledDate ? "newSched" : "newNoSched";                      // ⑤⑥
}
const VID_SEGS=["scriptNoSched","scriptSched","rawNoSched","rawSched","newNoSched","newSched","old"];
function vidOrderRank(v){ const i=VID_SEGS.indexOf(vidSegment(v)); return i<0?9:i; }
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
// 同一個視窗裡改過的欄位先存，不然按下「通過」視窗一關就沒了
function reviewVid(id, status){ afterFlush(()=>reviewVidGo(id, status)); }
function reviewVidGo(id, status){
  let note="";
  if(status==="退回"){ note=prompt("退回原因（給剪輯修正）："); if(note===null) return; if(!note.trim()){ toast("請填退回原因",true); return; } }
  const v=vid(id)||{};
  dbUpdate("videos", id, {reviewStatus:status, reviewNote:note.trim(), reviewedBy:currentUser(), reviewedAt:nowIso(), updatedAt:nowIso()},
    {action:"審片"+status, target:vidTitle(v)+(note.trim()?("・"+note.trim()):"")})
    .then(ok=>{ if(ok){ toast(status==="通過"?"已通過 ":"已退回，剪輯會收到 "); closeModal(); } });
}
let VID_VIEW="raw";        // 影片庫分頁（四類，見 VID_GROUPS）
let VID_UNSCHED=false;     // 只看還沒排日期的（矩陣的第二軸抽成開關）
// 影片庫的瀏覽方式：list＝原本的清單、grid＝封面圖平鋪。
// 記在這台裝置上（每個人習慣不同，也不值得為了它多寫一次資料庫）。
let VID_MODE=(typeof localStorage!=="undefined" && localStorage.getItem("ecdr_vidmode")==="grid")?"grid":"list";
let VID_TAGS=new Set();   // 標籤篩選（可複選）
let VID_Q="";   // 搜尋字存全域：資料同步重繪時還原，打到一半不會被清掉
// 一創語言（原本影片的語言）：影片庫用上面的「原本語言」下拉切換
const ORIG_LANGS=[["","中文"],["th","泰文"],["en","英文"],["my","馬來西亞"]];
const ORIG_LANG_KEYS=ORIG_LANGS.map(x=>x[0]);
let VID_LANG="";   // 影片庫目前檢視的一創語言（""＝中文）
function origLangOf(v){ const l=String((v&&v.origLang)||""); return ORIG_LANG_KEYS.includes(l)?l:""; }
// v122：清單每一列不再掛語言徽章。上面的「原本語言」下拉一次只顯示一種語言，
// 選中文就整頁中文、選馬來西亞就整頁馬來 —— 每列再標一次是在重複下拉已經說過的話。
// 語言只在單支影片的詳細視窗裡標示（那裡才是在看「這一支」而不是一整份清單）。
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
function vidOpenFn(v){
  return (v.channel&&CHANNELS[v.channel]) ? `openChModal('${v.channel}','${v.id}')`
       : v.locale ? `openIntlModal('${v.id}')`
       : `editVideo('${v.id}')`;
}
function vidTableRow(v){
  const stageCol={"待處理":"var(--muted)","剪輯中":"var(--accent)","待審核":"var(--amber)","已完成":"var(--green)","已上片":"var(--green)"}[dispStage(v)]||"var(--muted)";
  const tags=videoTagsOf(v);
  const tagHTML=tags.length?tags.map(t=>`<span class="tag" style="font-size:11px">${esc(dataLabel(t))}</span>`).join(" "):'<span class="muted" style="font-size:12px">—</span>';
  const prod=(v.productUrl||"").trim();
  const prodCount=(Array.isArray(v.products)?v.products.filter(p=>p&&p.name):[]).length;
  const prodHTML=prod?`<a href="${esc(prod)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${T("商品頁","Product")}${prodCount?paren(prodCount):""}</a>`
    :(prodCount?`<span class="muted" style="font-size:12px">${T(prodCount+" 項",prodCount+" items")}</span>`:'<span class="muted" style="font-size:12px">—</span>');
  const rev=v.reviewStatus==="通過"?`<span class="pill ok" style="font-size:10px">${T("已審","Reviewed")}</span>`
    :(v.reviewStatus==="退回"?`<span class="pill em" style="font-size:10px">× ${T("退回","Sent back")}</span>`:'');
  const sch=v.scheduledDate?String(v.scheduledDate).slice(0,10):"";
  // 標示：在地化版本標自身語言（EN）；源片的管理指標「翻了幾種語言 🌐N、重播 ↻M」
  // 只給管理員／經理人看 — 剪輯不需要這些資訊，隱藏讓畫面更乾淨
  const isAdminView=["boss","manager"].includes(currentRole());
  const langBadge = v.locale
    ? `<span class="pill" style="font-size:10px;background:var(--accent);color:#fff">${localeShort(v.locale)}</span>`
    : (v.channel&&CHANNELS[v.channel])
      ? `<span class="pill" style="font-size:10px;background:var(--accent);color:#fff">${esc(T(CHANNELS[v.channel].label, CHANNELS[v.channel].labelEn))}</span>`
      : (!isAdminView ? "" : (function(){ const nLang=localizedVersionsOfSrc(v.id).length, nUse=+v.totalUsed||0; let o="";
          if(nLang) o+=`<span class="pill" style="font-size:10px;background:transparent;border:1px solid var(--accent);color:var(--accent)" title="已翻譯 ${nLang} 種語言">🌐 ${nLang}</span>`;
          Object.keys(CHANNELS).forEach(ch=>{ const n=chVersionsOfSrc(ch,v.id).length;
            if(n) o+=` <span class="pill" style="font-size:10px;background:transparent;border:1px solid var(--accent);color:var(--accent)" title="已建立 ${n} 個${CHANNELS[ch].verName}">${CHANNELS[ch].srcBadge} ${n}</span>`; });
          if(nUse) o+=` <span class="pill" style="font-size:10px;background:transparent;border:1px solid var(--line);color:var(--muted)" title="重播 ${nUse} 次">↻ ${nUse}</span>`;
          return o; })());
  // 手機版精簡：沒有內容的欄位標 na（手機隱藏、桌機照舊顯示 —）
  // 指派給別人的照樣列出來（數字才對得上），但整列變灰、點不開
  const lk=assignLocked(v);
  // 二創殼開它自己的視窗（蝦皮／馬來走 openChModal、英／泰走 openIntlModal），
  // 源片才走主編輯視窗 —— 其他清單本來就是這個三元式，影片庫以前漏掉了。
  return `<tr ${lk?`class="vlock" title="${esc(assignLockTip(v))}"`:`onclick="${vidOpenFn(v)}" style="cursor:pointer"`}>
    <td data-label="${T("影片","Video")}" class="cv-name"><span class="vt-line">
      ${coverThumbHTML(v)}<span class="vt-code" title="${T("影片編號","Video code")}">${esc(vidCode(v))}</span>
      <span class="vt-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(vidNameZoned(v))}</span>${assignLockPill(v)}${missingPill(v, vidImplied())}${langBadge}</span>${enSubLine(v)}</td>
    <td data-label="${T("標籤","Tags")}"${tags.length?'':' class="na"'}>${tagHTML}</td>
    <td data-label="${VID_VIEW==="old"?T("上片日期","Aired"):T("預排上片","Scheduled")}"${sch?'':' class="na"'} style="white-space:nowrap">${sch||'<span class="muted">—</span>'}</td>
    <td data-label="${T("商品","Products")}"${(prod||prodCount)?'':' class="na"'}>${prodHTML}</td>
    <td data-label="${T("剪輯","Editor")}"${(v.editor||v.claimedBy)?'':' class="na"'}>${esc(v.editor||v.claimedBy||"")||'<span class="muted">—</span>'}</td>
    <td data-label="${T("狀態","Status")}"><span class="ststack">
      <span class="pill" style="font-size:11px;background:transparent;border:1px solid ${stageCol};color:${stageCol}">${esc(stageLabel(v.stage))}</span>
      ${rev}</span></td>
  </tr>`;
}
// 版本殼的「原本語言」跟著它的源片走（殼自己沒有 origLang）
// 影片庫上面那個語言下拉要看哪一個語言。
//
// 二創殼自己有 locale（英文版／泰文版），要用它自己的 —— 不能跟著源片走。
// 一支從中文源片做出來的英文版，源片的原本語言是「中文」，跟著源片走的話它在
// 海外那一頁會被語言下拉直接濾掉，整頁變空（v146 兩頁共用同一份清單之後才會踩到）。
// 台灣那一頁的蝦皮／馬來殼沒有 locale，照舊跟著源片＝中文，行為沒變。
function effOrigLang(v){ return String((v&&v.locale)||"") || origLangOf(anchorOf(v)); }
// 台灣影片庫的母體：中文源片 ＋ 蝦皮版 ＋ 馬來版（同一區的都列在一起）
function vidAllOfLang(){
  const zone=curZone();   // 台灣／海外分頁＝篩選器（v146 兩邊同一套畫面）
  return (STATE.videos||[]).filter(v=>zoneOfVideo(v)===zone && effOrigLang(v)===VID_LANG);
}
// 搜尋範圍含版本自己的欄位，也含源片的片名與編號 ——
// 這樣打源片的中文片名，找得到它底下的蝦皮版。
function vidMatchQ(v){
  const q=String(VID_Q||'').toLowerCase().trim(); if(!q) return true;
  const a=anchorOf(v);
  return [v.name,v.rawName,v.videoCopy,v.code,v.editor,v.channel,v.account,a.name,a.code]
    .map(x=>String(x||'').toLowerCase()).join("  ").includes(q);
}
function vidVisibleList(){
  let list=vidAllOfLang().filter(v=> vidGroupOf(v)===VID_VIEW).filter(vidMatchQ).filter(vidMatchSched);
  // 標籤看源片的 —— 版本殼自己的 tags 是空的，不這樣做一開標籤篩選版本就全不見
  if(VID_TAGS.size) list=list.filter(v=>videoTagsOf(anchorOf(v)).some(t=>VID_TAGS.has(t)));
  // 排序以源片為主鍵，版本殼緊跟在自己的源片後面（蝦皮在前、馬來在後）。
  // 源片與它的版本落在不同分頁時，版本會在自己那一頁單獨出現，但位置仍照源片算。
  const ORD=["shopee","ms"];
  list.sort((a,b)=>{ const A=anchorOf(a), B=anchorOf(b);
    return vidOrderRank(A)-vidOrderRank(B)
        || vidSortVal(A).localeCompare(vidSortVal(B))
        || String(A.id).localeCompare(String(B.id))
        || (isSourceVid(a)?0:1)-(isSourceVid(b)?0:1)
        || ORD.indexOf(a.channel)-ORD.indexOf(b.channel)
        || String(a.id).localeCompare(String(b.id)); });
  return list;
}
// 圖片模式：一支一張封面卡
function vidCardHTML(v){
  const sch=v.scheduledDate?String(v.scheduledDate).slice(0,10):"";
  const stageCol={"待處理":"var(--muted)","剪輯中":"var(--accent)","待審核":"var(--amber)","已完成":"var(--green)","已上片":"var(--green)"}[dispStage(v)]||"var(--muted)";
  const lk=assignLocked(v);
  return `<div class="vcard${lk?' vlock':''}" ${lk?`title="${esc(assignLockTip(v))}"`:`onclick="${vidOpenFn(v)}" title="${esc(vidTitle(v))}"`}>
    <div class="vcard-img">${coverThumbHTML(v,"vcard-th")}</div>
    <div class="vcard-b">
      <div class="vcard-t">${esc(vidNameZoned(v))}${assignLockPill(v)}${missingPill(v, vidImplied())}</div>
      <div class="vcard-m">
        <span class="pill" style="font-size:10px;background:transparent;border:1px solid ${stageCol};color:${stageCol}">${esc(stageLabel(v.stage))}</span>
        ${sch?`<span class="muted" style="font-size:11px">${esc(sch)}</span>`:''}
        <span class="vt-code" title="${T("影片編號","Video code")}">${esc(vidCode(v))}</span>
      </div>
    </div></div>`;
}
function vidRowsHTML(){
  const list=vidVisibleList();
  if(!list.length) return `<div class="emptyState"><span class="es-mk">✦</span>${T("沒有符合的影片","No matching videos")}</div>`;
  const total=`<p class="muted" style="margin-top:8px;font-size:12px">${T("共","Total")} ${list.length} ${T("支","videos")}</p>`;
  if(VID_MODE==="grid") return `<div class="vgrid">${list.map(vidCardHTML).join("")}</div>${total}`;
  return `<div class="${list.length>8?'vidscroll':''}"><table class="vtable responsive">
    <colgroup><col class="c-vid"><col class="c-tag"><col class="c-sch"><col class="c-prod"><col class="c-ed"><col class="c-st"></colgroup>
    <thead><tr><th>${T("影片","Video")}</th><th>${T("標籤","Tags")}</th><th>${VID_VIEW==="old"?T("上片日期","Aired"):T("預排上片","Scheduled")}</th><th>${T("商品","Products")}</th><th>${T("剪輯師","Editor")}</th><th>${T("狀態","Status")}</th></tr></thead>
    <tbody>${list.map(vidTableRow).join("")}</tbody></table></div>${total}`;
}
function vidSetMode(m){
  VID_MODE=(m==="grid")?"grid":"list";
  try{ localStorage.setItem("ecdr_vidmode", VID_MODE); }catch(e){}
  render();
}
// 分頁只留四個。內部仍然是七段（見 vidSegment），但「排了沒」這一軸抽成一個開關 ——
// 攤平成七顆等於逼使用者用眼睛做二維查表，而且要看完所有沒排日期的片得點三個分頁。
// 開關打開＝一次看完全部還沒排的，補排日期不用跳頁。
const VID_GROUPS=[
  ["script","未拍","Not shot", ["scriptNoSched","scriptSched"]],
  ["raw",   "待剪","To edit",  ["rawNoSched","rawSched"]],
  ["done",  "剪完","Done",     ["newNoSched","newSched"]],
  ["old",   "舊片","Old",      ["old"]],
];
function vidGroupOf(v){ const s=vidSegment(v);
  const g=VID_GROUPS.find(x=>x[3].includes(s)); return g?g[0]:"raw"; }
// 「只看還沒排日期的」：舊片本來就一定有排程日，開關打開時那一頁自然是 0
function vidMatchSched(v){ return !VID_UNSCHED || !v.scheduledDate; }
// 分頁數字跟著搜尋與開關一起變 —— 打「農曆七月」就看得出它落在哪一個分頁
function vidSegCounts(){
  const c={}; VID_GROUPS.forEach(g=>c[g[0]]=0);
  vidAllOfLang().filter(vidMatchQ).filter(vidMatchSched).forEach(v=>{ const g=vidGroupOf(v); if(c[g]!=null) c[g]++; });
  return c;
}
function vidTabsHTML(){
  const c=vidSegCounts();
  return VID_GROUPS.map(([k,zh,en])=>
    `<button class="vtab ${VID_VIEW===k?'on':''}" onclick="vidSetView('${k}')"><span>${T(zh,en)}</span> <span class="vtab-n">${c[k]}</span></button>`
  ).join("");
}
// 標籤鈕：只列出「這個分頁、這次搜尋結果裡實際有的標籤」並標數量 → 按了一定對得上影片
function vidTagBtnsHTML(){
  const viewList=vidAllOfLang().filter(vidMatchQ).filter(vidMatchSched).filter(v=>vidGroupOf(v)===VID_VIEW);
  // 標籤看源片的（版本殼自己沒有標籤）
  const tagCount={}; viewList.forEach(v=>videoTagsOf(anchorOf(v)).forEach(t=>{ tagCount[t]=(tagCount[t]||0)+1; }));
  const order=videoTags();
  const present=Object.keys(tagCount).sort((a,b)=>{ const ia=order.indexOf(a),ib=order.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib) || a.localeCompare(b); });
  return present.length
    ? present.map(t=>`<button class="btn sm ${VID_TAGS.has(t)?'':'sec'}" onclick="vidTagToggle('${esc(jsEsc(t))}',this)">${esc(dataLabel(t))} <span style="opacity:.7">${tagCount[t]}</span></button>`).join("")
      +`<a href="javascript:void(0)" onclick="VID_TAGS.clear();render()" class="muted" style="font-size:12px;margin-left:4px">${T("清除篩選","Clear")}</a>`
    : `<span class="muted" style="font-size:12px">${T("此分頁的影片尚未加標籤","No tags on this tab yet")}</span>`;
}
// 邊打邊篩：只換清單、分段數字、標籤數字三塊，不整頁重繪（游標留在搜尋框）
function vidFilter(){
  const l=document.getElementById('vid_list'); if(!l){ render(); return; }
  l.innerHTML=vidRowsHTML();
  const t=document.getElementById('vid_tabs'); if(t) t.innerHTML=vidTabsHTML();
  const g=document.getElementById('vid_tags'); if(g) g.innerHTML=vidTagBtnsHTML();
}
function vidTagToggle(t, el){ if(VID_TAGS.has(t)){ VID_TAGS.delete(t); el.classList.add('sec'); } else { VID_TAGS.add(t); el.classList.remove('sec'); } vidFilter(); }
function vidSetView(view){ VID_VIEW=view; VID_TAGS.clear(); render(); }
// 開關只換清單與數字，不整頁重繪（跟搜尋同一條路）
function vidSetUnsched(on){ VID_UNSCHED=!!on; vidFilter(); }
function vidSetLang(lang){ VID_LANG=ORIG_LANG_KEYS.includes(lang)?lang:""; VID_TAGS.clear(); render(); }
// 影片庫分兩套：台灣的是完整管線（七段／四分頁），海外的是單純的來源清單。
// 同時看得到兩區的人（管理員／經理人／人資）上面多一排區切換。
function viewVideos(){ return viewVideosLib(); }

// ===================================================================
// 影片庫大流（v137）
// 影片庫A 走的是「寫腳本→排日期→拍毛片→剪→審→上片」那一整條線。
// 大流不是 —— 它放的是**已經做完的成品**（以前沒進過系統的舊片），直接建檔就好。
// 所以這裡只有四個欄位：檔名、封面、存檔連結、文案。沒有毛片、沒有認領、沒有審片。
// ===================================================================
let DF_Q="";
// 存檔連結顯示成一顆短連結，不要把整條網址攤在清單上（一條 Google Drive 網址
// 有 80 幾個字，三支片就把整列擠爆了）
function dfDriveLink(v, label){
  const u=String((v&&v.driveFolder)||"").trim();
  if(!u) return '<span class="muted">—</span>';
  return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(u)}">${esc(label||"存檔")}</a>`;
}
function dfRemakes(v){ return Array.isArray(v&&v.remakes)?v.remakes:[]; }
// ── 版本編號：原片＝1，第 n 次二創＝n+1 ───────────────────────────
// 二創沿用原片的名字，所以月排程上兩支長得一模一樣。加一個數字才分得出
// 「這天出的是原片，那天出的是重剪過的第 2 版」。1 不標（那是原片，標了只是雜訊）。
function dfVerOf(slot){ const n=+((slot&&slot.ver)||1); return (n>=1&&n<=99)?n:1; }
function dfVerPill(slot){
  const n=dfVerOf(slot); if(n<2) return "";
  return ` <span class="tag verpill" title="${T("這是重剪過的第 "+n+" 版（二創）","Re-cut version "+n)}">${n}</span>`;
}
// 這支片可以排的版本：原片 ＋ 已經做過的每一次二創
function dfVerOptions(v){
  const out=[[1, T("原片","Original")]];
  dfRemakes(v).forEach((r,i)=>out.push([i+2, T("第 "+(i+2)+" 版（二創・"+(r.by||"")+"）","Version "+(i+2))]));
  return out;
}
// 大流清單：新的排前面
function dfList(){
  const q=String(DF_Q||"").trim().toLowerCase();
  let list=dfVideos().filter(v=>!isVersion(v));
  if(q) list=list.filter(v=>[v.name,v.rawName,v.code,v.videoCopy].some(x=>String(x||"").toLowerCase().includes(q)));
  return list.slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
}
function dfSetQ(s){ DF_Q=s; const el=document.getElementById("df_rows"); if(el) el.innerHTML=dfRowsHTML(); }
function dfRowsHTML(){
  const list=dfList();
  if(!list.length) return `<p class="muted" style="margin:10px 0 0">${DF_Q?"沒有符合的影片。":"還沒有影片 —— 按上面的「＋ 直接加一支」開始。"}</p>`;
  return list.map(v=>{
    const rm=dfRemakes(v);
    // 二創沿用原片的名字與資料夾，所以清單上永遠只有一列；做過幾次寫在名字旁邊
    const rmPill=rm.length?`<span class="pill wa" title="${esc(rm.map(r=>`${r.by}・${String(r.at||"").slice(0,10)}`).join("\n"))}">${T("二創","Remake")} ×${rm.length}</span>`:"";
    const sch=String(v.scheduledDate||"").slice(0,10);
    const schPill=sch?`<span class="pill ok">${esc(sch.slice(5))} ${T("已排","scheduled")}</span>`:`<span class="muted" style="font-size:12px">${T("還沒排","not scheduled")}</span>`;
    return `<div class="row" style="gap:10px;align-items:center;padding:9px 2px;border-bottom:1px solid var(--line);flex-wrap:wrap">
      ${coverThumbHTML(v,"vthumb")}
      <div style="flex:1;min-width:140px">
        <div style="font-weight:600">${esc(zhTW(v.name||v.rawName||""))}</div>
        <div class="muted" style="font-size:12px;margin-top:2px">${dfDriveLink(v)}${rmPill?" · ":""}${rmPill} · ${schPill}</div>
      </div>
      <button class="btn sec sm" onclick="dfEdit('${v.id}')">${T("編輯","Edit")}</button>
      ${seesDF()?`<button class="btn sm" onclick="dfRemake('${v.id}')">${T("做二創","Remake")}</button>`:""}
    </div>`;
  }).join("");
}
function viewVideosDF(){
  if(!seesDF()) return `<h2>影片庫大流</h2><div class="card"><p class="muted">這個分頁沒有開放給你的職位。</p></div>`;
  const list=dfList(), n=dfVideos().filter(v=>!isVersion(v)).length;
  const nRemake=dfVideos().reduce((a,v)=>a+dfRemakes(v).length,0);
  const nSched=dfVideos().filter(v=>String(v.scheduledDate||"").slice(0,10)>=today).length;
  return `<h2>影片庫大流</h2>
  <div class="card">
    <div class="muted" style="font-size:13px;line-height:1.7">
      這裡放<b>已經做完的成品</b>（以前沒進過系統的舊片），直接建檔就好，不用經過拍毛片跟剪片。<br>
      所以大流的片<b>不會</b>算進毛片庫存、待認領、審片、未拍那些生產面的數字 —— 但它<b>會</b>排進月排程，也算進當天的出片數。
    </div>
    <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center">
      <span class="pill">${n} 支</span>
      <span class="pill ${nSched?'ok':''}">${nSched} 支已排程</span>
      <span class="pill ${nRemake?'wa':''}">二創 ${nRemake} 次</span>
      <span class="spacer" style="flex:1"></span>
      <button class="btn sm" onclick="dfAdd()">${PLUS()} 直接加一支</button>
    </div>
    <div class="row" style="gap:8px;margin-top:10px">
      <input id="df_q" placeholder="搜尋檔名／文案" value="${esc(DF_Q)}" oninput="dfSetQ(this.value)" style="flex:1;min-width:150px">
    </div>
    <div id="df_rows" class="keepscroll" style="margin-top:6px${list.length>12?';max-height:560px;overflow-y:auto':''}">${dfRowsHTML()}</div>
  </div>`;
}
// ── 直接加一支（檔名／封面／存檔連結／文案）──────────────────────
// 封面要上傳到 Firebase Storage、檔名用影片 id，所以新增的時候還沒有 id 可以掛。
// 那一格只在「編輯」時出現（先建檔、再補封面），跟影片庫A 的編輯視窗用同一個元件。
function dfFormHTML(v, id){
  v=v||{};
  return `
    ${id?coverSlotHTML(v, id):""}
    <label>檔名 · 必填</label>
    <input id="df_name" value="${esc(zhTW(v.name||v.rawName||""))}" placeholder="這支影片的名字" onkeydown="if(enterKey(event))document.getElementById('modalConfirm').click()">
    <label style="margin-top:10px">存檔連結（雲端資料夾或檔案）</label>
    <input id="df_drive" value="${esc(v.driveFolder||"")}" placeholder="https://drive.google.com/...">
    <div class="muted" style="font-size:12px;margin-top:4px">貼整條網址就好，清單上只會顯示成一顆「存檔」的連結。</div>
    <label style="margin-top:10px">文案</label>
    <textarea id="df_copy" style="min-height:96px" placeholder="貼文文案／口播稿">${esc(zhTW(v.videoCopy||""))}</textarea>
    ${id?"":'<div class="muted" style="font-size:12px;margin-top:10px">封面在建好之後按「編輯」上傳。</div>'}`;
}
function dfAdd(){
  if(dbBlocked()) return;
  showModal("直接加一支到大流", dfFormHTML(null, ""), async ()=>{
    const name=zhTW(val("df_name").trim());
    if(!name){ toast("請輸入檔名",true); return false; }
    // 直接就是成品：stage 一步到位，不進待處理、不進待認領、不進審片
    const video={ lib:DF_LIB, name, rawName:name,
      videoCopy:zhTW(val("df_copy").trim()), driveFolder:val("df_drive").trim(),
      stage:"已完成", published:true, finishedAt:nowIso(), backupDone:true, socialScheduled:true,
      reviewStatus:"通過", reviewedBy:currentUser(), reviewedAt:nowIso(),   // 成品不需要審，先標好免得跑進審片清單
      tags:["舊片"] };
    return await write("POST","/api/videos",{video},"已加入影片庫大流");
  });
}
function dfEdit(id){
  if(dbBlocked()) return;
  const v=vid(id); if(!v||!isDF(v)){ toast("找不到這支影片",true); return; }
  showModal("編輯（大流）", dfFormHTML(v, id), async ()=>{
    const name=zhTW(val("df_name").trim());
    if(!name){ toast("請輸入檔名",true); return false; }
    // 封面不在這裡送 —— 它是上傳當下就寫進資料庫的（coverChosen），這裡再送一次會蓋掉
    return await write("PUT","/api/videos/"+id,
      {video:{name, rawName:name, videoCopy:zhTW(val("df_copy").trim()),
              driveFolder:val("df_drive").trim()}}, "已更新");
  });
}
// ── 二創：不另開一筆影片，直接記在原片底下 ────────────────────────
// 名字、封面、存檔資料夾全部沿用原片 —— 所以清單上永遠只有一列，
// 資料夾也只需要顯示一個（成品本來就都存在同一個地方）。
function dfRemake(id){
  if(dbBlocked()) return;
  const v=vid(id); if(!v||!isDF(v)){ toast("二創只能選影片庫大流裡面的片",true); return; }
  const rm=dfRemakes(v);
  const hist=rm.length?`<div class="muted" style="font-size:12px;margin-top:8px;line-height:1.8">已經做過 ${rm.length} 次：<br>${
    rm.map((r,i)=>`${i+1}. ${esc(r.by||"")}・${esc(String(r.at||"").slice(0,10))}${r.note?("・"+esc(r.note)):""}`).join("<br>")}</div>`:"";
  showModal("做二創：" + zhTW(v.name||v.rawName||""), `
    <div class="muted" style="font-size:13px;line-height:1.7">
      二創剪好之後存回<b>同一個資料夾</b>，名字也沿用原片 —— 系統不會另外開一筆，
      只會在這支片底下記一次。
    </div>
    <div class="row" style="gap:8px;margin-top:10px;align-items:center">
      <span class="muted" style="font-size:13px">存檔位置</span>${dfDriveLink(v,"開啟資料夾")}
    </div>
    <label style="margin-top:10px">備註（選填）</label>
    <input id="dfr_note" placeholder="這次改了什麼？（選填）">
    ${hist}`, async ()=>{
    const entry={ id:uid("R"), by:currentUser(), at:nowIso(), note:val("dfr_note").trim() };
    const ok=await dbArrayAdd("videos", id, "remakes", entry,
      ()=>window.DB.update("videos", id, {remakes:dfRemakes(vid(id)).concat([entry]), updatedAt:nowIso()}));
    logA("大流二創", vidTitle(v));
    toast("已記下這次二創（第 "+(rm.length+1)+" 次）");
    return ok!==false;
  });
}
function zoneSwitchHTML(){
  if(myZone()!=="both") return "";
  const n=(z)=>(STATE.videos||[]).filter(v=>zoneOfVideo(v)===z).length;
  return `<div class="vtabs" style="margin-bottom:10px">`+
    ["tw","intl"].map(z=>`<button class="vtab ${curZone()===z?'on':''}" onclick="setZoneView('${z}')">`+
      `<span>${T(ZONE_LABEL[z][0],ZONE_LABEL[z][1])}</span> <span class="vtab-n">${n(z)}</span></button>`).join("")+
    `</div>`;
}
// ── 原本語言可能設錯（主管／管理員）──────────────────────────────────
// 分區靠「原本語言」判斷源片，但這個欄位埋在編輯視窗的「進階」裡、預設收起來，
// 舊資料幾乎都沒設 → 泰文／英文拍的原創會一直留在台灣區。
// 判斷語言不能只看標題 —— 腳本都是老闆寫的，泰文片的標題常常還是中文。
// 真正洩漏語言的是「影片文案」（口播稿），所以三個欄位一起看。
const RE_TH=/[฀-๿]/, RE_CJK=/[㐀-鿿぀-ヿ]/, RE_LAT=/[A-Za-z]/;
// 回傳 {lang, sure}：sure＝不必問人就能直接改（誤判機率低到可以忽略）
function origLangGuess(v){
  if(!v) return {lang:"",sure:false};
  const copy=String(v.videoCopy||"");
  const all=String(v.rawName||"")+" "+String(v.name||"")+" "+copy;
  // 泰文字母不可能誤入中文片，只要出現就是泰文 —— 確定
  if(RE_TH.test(all)) return {lang:"th", sure:true};
  // 有英文口播稿、整支片一個中日韓字都沒有 —— 中文片的口播稿一定是中文，所以也確定
  if(copy.trim() && RE_LAT.test(copy) && !RE_CJK.test(all)) return {lang:"en", sure:true};
  // 只有標題是純英文、沒有口播稿佐證 —— 可能只是英文品牌名（「SKII vs Lancome」），要人看過
  if(RE_LAT.test(all) && !RE_CJK.test(all)) return {lang:"en", sure:false};
  return {lang:"", sure:false};
}
function guessOrigLang(v){ return origLangGuess(v).lang; }
// 「確定」的那幾支不必問人，管理員／經理人一進來就自動搬過去。
// 會寫進操作紀錄、也會跳一則說明；搬錯了在影片裡把「原本語言」改回中文就好。
function origAutoMovable(v){ return isSourceVid(v) && origLangOf(v)==="" && origLangGuess(v).sure; }
function origAutoList(){ return (STATE.videos||[]).filter(origAutoMovable); }
let ORIG_AUTO_RAN=false;
async function autoMoveOrigLang(){
  if(ORIG_AUTO_RAN || VIEW_AS || !window.DB) return;
  if(!["boss","manager"].includes(currentRole())) return;
  const list=origAutoList(); if(!list.length) return;
  ORIG_AUTO_RAN=true;   // 先鎖住：寫入會再觸發一次同步，不能讓它自己叫自己
  const plan=list.map(v=>({v, to:origLangGuess(v).lang}));
  BULK_BUSY=true; let r={ok:[],done:0,failed:0};
  try{ r=await bulkRun(plan, p=>window.DB.update("videos", p.v.id, {origLang:p.to, updatedAt:nowIso()})); }
  finally{ BULK_BUSY=false; applyState(LAST_RAW); }
  // ⚠️ 失敗了也**不能**把 ORIG_AUTO_RAN 放開：這支是在 applyState 裡被呼叫的，
  // 而它自己的 finally 又會呼叫 applyState —— 放開鎖就是「失敗→重試→失敗」的無限迴圈。
  // 沒搬成的下次重新整理頁面才會再試一次，失敗數用 toast 講出來就好。
  if(!r.done && !r.failed) return;
  if(!r.done){ await delay(300); bulkToast(r, T("原本語言沒有調整成功","Nothing was moved"), T("支","clips")); return; }
  logA("自動調整原本語言 "+r.done+" 支"+(r.failed?("（失敗 "+r.failed+" 支）"):""),
       r.ok.map(p=>vidTitle(p.v)+"→"+p.to).join("、").slice(0,200));
  await delay(300);
  bulkToast(r, T("已自動把 "+r.done+" 支泰文／英文原創移到海外區（操作紀錄查得到，改回中文就會搬回來）",
                 "Moved "+r.done+" Thai/English originals to the overseas area"), T("支","clips"));
}
// 猜得到、但不夠確定的才留給人確認
function origLangSuspects(){
  return (STATE.videos||[]).filter(v=>isSourceVid(v) && origLangOf(v)==="" && guessOrigLang(v)!=="" && !origLangGuess(v).sure)
    .sort((a,b)=>String(a.code||a.id).localeCompare(String(b.code||b.id)));
}
function origLangFixCard(){
  if(!["boss","manager"].includes(currentRole())) return "";
  const list=origLangSuspects(); if(!list.length) return "";
  const rows=list.map(v=>`<div class="row" style="gap:8px;align-items:center;padding:7px 2px;border-bottom:1px solid var(--line);flex-wrap:nowrap">
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(vidTitle(v))}</span>
      <select id="olf_${v.id}" style="width:auto;flex:none;font-size:13px;padding:5px 7px">
        ${ORIG_LANGS.map(([k,l],i)=>`<option value="${k}" ${guessOrigLang(v)===k?'selected':''}>${T(l,["Chinese","Thai","English","Malaysia"][i])}</option>`).join("")}
      </select></div>`).join("");
  return `<div class="card" style="border-color:var(--gold)">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:16px">🌐 ${T("原本語言可能要調整","Check the original language")}</b>
      <span class="pill em">${list.length}</span></div>
    <div class="muted" style="font-size:13px;margin-top:6px;line-height:1.7">${T(
      "泰文片、以及口播稿是英文的，系統已經自動移到海外區了。<br>剩下這幾支只有標題像英文、沒有口播稿可以佐證（也可能只是英文品牌名），要你看一眼再決定。",
      "Thai videos and ones with an English script have already been moved automatically.<br>These only look English by title with no script to confirm it — take a look before deciding.")}</div>
    <div style="margin-top:8px${list.length>8?';max-height:320px;overflow-y:auto':''}">${rows}</div>
    <div class="row" style="gap:8px;margin-top:10px">
      <button class="btn sm" onclick="saveOrigLangFixes()">${T("儲存","Save")}</button>
      <span class="muted" style="font-size:12px">${T("維持「中文」的那幾支不會被動到","Rows left on Chinese are not touched")}</span></div>
  </div>`;
}
async function saveOrigLangFixes(){
  if(dbBlocked()) return;
  const list=origLangSuspects();
  const changes=list.map(v=>({v, to:val("olf_"+v.id)||""})).filter(x=>x.to && x.to!==origLangOf(x.v));
  if(!changes.length){ toast(T("沒有要調整的（都還是中文）","Nothing to change"),true); return; }
  if(!confirm(T("要調整 "+changes.length+" 支影片的原本語言嗎？\n設成泰文或英文的會移到海外區。",
               "Update the original language of "+changes.length+" videos?"))) return;
  BULK_BUSY=true; let r={ok:[],done:0,failed:0};
  try{ r=await bulkRun(changes, c=>window.DB.update("videos", c.v.id, {origLang:c.to, updatedAt:nowIso()})); }
  finally{ BULK_BUSY=false; applyState(LAST_RAW); }
  logA("調整原本語言 "+r.done+" 支"+(r.failed?("（失敗 "+r.failed+" 支）"):""),
       r.ok.map(c=>vidTitle(c.v)).join("、").slice(0,120));
  await delay(300); bulkToast(r, T("已調整 "+r.done+" 支","Updated "+r.done), T("支","clips"));
}
// 影片庫：上面那兩個分頁（台灣／海外）現在**只是篩選器**，兩邊功能一模一樣 ——
// 未拍／待剪／剪完／舊片、清單／圖片、標籤、新增一支、批次新增全都有。
//
// v146 之前海外那一頁是另一個東西：一份「挑台灣已上片的片來做二創」的清單。
// 那份清單在「上班計畫」的建立二創版本卡裡本來就有一模一樣的一份，所以這裡不是
// 少了功能，是重複的那份被拿掉了。真正少的是：海外沒辦法自己開腳本、自己拍、
// 自己傳 —— 因為他們永遠進不到編輯視窗。
function viewVideosLib(){
  const zone=curZone();
  const allSrc=(STATE.videos||[]).filter(v=>zoneOfVideo(v)===zone);
  const langCount={}; allSrc.forEach(v=>{ const l=effOrigLang(v); langCount[l]=(langCount[l]||0)+1; });
  const langs=ORIG_LANGS.map((x,i)=>[x[0],x[1],["Chinese","Thai","English","Malaysia"][i]]).filter(([k])=>zoneOfOrigLang(k)===zone);
  // 換分頁的時候原本語言要跟著換到這一區有的（海外沒有「中文」這個選項）
  if(!langs.some(([k])=>k===VID_LANG)) VID_LANG=(zone==="intl")?"en":"";
  const langSel=`<div class="row" style="gap:8px;align-items:center;margin-bottom:10px">
    <label style="margin:0">${zone==="intl"?T("語言","Language"):T("原本語言","Original language")}</label>
    <select onchange="vidSetLang(this.value)" style="width:auto;min-width:150px">
      ${langs.map(([k,zh,en])=>`<option value="${k}" ${VID_LANG===k?'selected':''}>${T(zh,en)}${paren(langCount[k]||0)}</option>`).join("")}
    </select></div>`;
  return `<h2>${T("影片庫A","Library A")}</h2>
  ${origLangFixCard()}
  <div class="card">
    ${zoneSwitchHTML()}
    ${langSel}
    <div class="vtabs" id="vid_tabs">${vidTabsHTML()}</div>
    <label style="display:inline-flex;align-items:center;gap:5px;margin:8px 0 0;font-size:12px;white-space:nowrap"
      title="${T("四個分頁都只列還沒填預排上片日的，一次補齊不用跳頁","Shows only videos with no scheduled date — across all four tabs")}">
      <input type="checkbox" id="vid_uns" ${VID_UNSCHED?"checked":""} onchange="vidSetUnsched(this.checked)" style="width:auto;margin:0">
      ${T("只看還沒排日期的","Unscheduled only")}</label>
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px">
      <input id="vid_q" placeholder="${T("搜尋編號／片名／剪輯","Search code / title / editor")}" value="${esc(VID_Q)}" oninput="VID_Q=this.value;vidFilter()" style="flex:1;min-width:150px">
      <div class="vmode" role="group" aria-label="${T("瀏覽方式","View mode")}">
        <button class="vmode-b ${VID_MODE==="list"?"on":""}" onclick="vidSetMode('list')" title="${T("清單","List")}">☰ ${T("清單","List")}</button>
        <button class="vmode-b ${VID_MODE==="grid"?"on":""}" onclick="vidSetMode('grid')" title="${T("圖片","Covers")}">▦ ${T("圖片","Covers")}</button>
      </div>
      <button class="btn sm" onclick="newSimpleVideo()">${PLUS()} ${T("新增一支","Add one")}</button>
      <button class="btn sec sm" onclick="batchNewFootage()">${T("批次新增","Batch add")}</button>
    </div>
    ${/* 標籤預設收起來（手機上 8 顆按鈕會佔掉三行）。已經選了的照樣寫在收合列上，
         不然使用者會忘記自己開著篩選 —— 這是漸進揭露，不是把資訊藏起來。 */''}
    <details class="fold tagfold" id="vid_tagfold" ${foldState("vid.tags", VID_TAGS.size>0)} style="margin-top:10px">
      <summary>${T("標籤篩選","Tags")}${VID_TAGS.size
        ? `<span class="n">${VID_TAGS.size}</span>`
        : `<span class="muted" style="font-weight:400;font-size:12px;margin-left:6px">${T("點開來挑","tap to filter")}</span>`}</summary>
      <div class="foldbody"><div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
        <span id="vid_tags">${vidTagBtnsHTML()}</span>
      </div></div>
    </details>
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
          onchange="logSetQ(this.value)" onkeydown="if(enterKey(event))logSetQ(this.value)">
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
  <div class="card"><b>影片排行${PERF_PLAT?`（${esc(PERF_PLAT)}）`:'（全平台）'}</b> <span class="muted" style="font-size:12px">前 50 名</span> <span class="muted" style="font-size:12px">依觀看排序，點影片看跨平台明細與帶貨</span>
    <div class="${vRank.length>10?'vidscroll':''}" style="margin-top:8px">
    <table class="responsive"><thead><tr><th>#</th><th>影片</th><th>剪輯</th><th>帶貨商品</th><th>觀看</th><th>讚</th></tr></thead>
    <tbody>${vRank.map((r,i)=>`<tr style="cursor:pointer" onclick="${vidOpenFn(r.v)}">
      <td data-label="#">${i+1}</td>
      <td data-label="影片"><a href="javascript:void(0)">${esc(vidTitle(r.v))}</a></td>
      <td data-label="剪輯">${esc(r.v.editor||r.v.claimedBy||"")||'<span class="muted">—</span>'}</td>
      <td data-label="帶貨商品">${prodCell(r.v)}</td>
      <td data-label="觀看"><b>${num(r.views)}</b></td>
      <td data-label="讚">${num(r.likes)}</td></tr>`).join("")||`<tr><td colspan="6" class="muted">尚無資料</td></tr>`}</tbody></table>
    </div>
  </div>
  <div class="card"><b>帶貨商品排行${PERF_PLAT?`（${esc(PERF_PLAT)}）`:''}</b> <span class="muted" style="font-size:12px">前 50 名</span> <span class="muted" style="font-size:12px">依「帶此商品的影片觀看加總」排（觸及，非銷售）</span>
    <div class="${pRank.length>10?'vidscroll':''}" style="margin-top:8px">
    <table class="responsive"><thead><tr><th>#</th><th>商品</th><th>出現影片</th><th>觀看(觸及)</th></tr></thead>
    <tbody>${pRank.map((e,i)=>`<tr><td data-label="#">${i+1}</td><td data-label="商品"><b>${esc(e[0])}</b></td><td data-label="出現影片">${e[1].vids.size} 支</td><td data-label="觀看(觸及)"><b>${num(e[1].views)}</b></td></tr>`).join("")||`<tr><td colspan="4" class="muted">尚無帶貨商品資料</td></tr>`}</tbody></table>
    </div>
  </div>`;
}

// ===================================================================
// 選品配對（v138）—— 選品行銷從「商品」出發，幫商品挑一支影片來賣，送老闆審核；
// 老闆核准其中一支（主選或備選）之後，正式建立「1 商品 → 1 影片」配對。
// 只有「選品行銷」「經理人（Regina）」「管理員」看得到這一頁（見 ROLE_TABS）。
// ===================================================================
function canViewMatch(){ return ["pick","boss","manager"].includes(currentRole()); }
let MATCH_PRODUCT_ID=null, MATCH_PRIMARY_ID=null, MATCH_BACKUP_ID=null, MATCH_EDITING_ID=null;
let MATCH_VTAB="done", MATCH_VQ="", MATCH_VFILTER="awaiting";

function viewMatch(){
  // 導覽已經照角色過濾，這裡是最後一道守門（真正的守門原則見 editVideo 上面的註解）
  if(!canViewMatch()) return `<h2>選品配對</h2><p class="muted">你沒有這一頁的權限。</p>`;
  const isBoss=["boss","manager"].includes(currentRole());
  return `<h2>選品配對工作台</h2>`
    + (isBoss?matchQueueCard():"")
    + matchWorkbenchHTML()
    + matchHistoryCard(isBoss);
}

// 老闆／經理人／管理員：待審核佇列，核准其中一支（主選或備選）或退回
function matchQueueCard(){
  const pending=(STATE.matches||[]).filter(m=>m.status==="submitted");
  const rows=pending.map(m=>{
    const p=(STATE.products||[]).find(x=>x.id===m.productId);
    const pv=vid(m.primaryVideoId), bv=m.backupVideoId?vid(m.backupVideoId):null;
    return `<div class="card" style="background:var(--panel2)">
      <div class="row" style="justify-content:space-between">
        <b>${esc(p?p.name:m.productId)}</b>
        <span class="muted" style="font-size:12px">送審人：${esc(m.submittedBy||m.createdBy||"")}</span>
      </div>
      <p class="muted" style="margin:4px 0;font-size:13px">SKU：${esc((p&&p.sku)||"未填")}　建議上架：${esc(m.suggestedLaunchDate||"未填")}</p>
      <div class="grid cols2">
        <div class="card" style="margin:0"><div class="muted" style="font-size:12px">主選影片</div><b>${pv?esc(vidTitle(pv)):"-"}</b></div>
        <div class="card" style="margin:0"><div class="muted" style="font-size:12px">備選影片</div><b>${bv?esc(vidTitle(bv)):"（無）"}</b></div>
      </div>
      ${m.suggestedCopyEdit?`<p style="margin-top:8px"><b>建議文案修改：</b>${esc(m.suggestedCopyEdit)}</p>`:""}
      <div class="row" style="margin-top:10px">
        <button class="btn sm" onclick="approveMatch('${esc(jsEsc(m.id))}','${esc(jsEsc(m.primaryVideoId))}')">✅ 核准主選</button>
        ${bv?`<button class="btn sm sec" onclick="approveMatch('${esc(jsEsc(m.id))}','${esc(jsEsc(m.backupVideoId))}')">✅ 核准備選</button>`:""}
        <button class="btn sm danger" onclick="rejectMatch('${esc(jsEsc(m.id))}')">↩ 退回</button>
      </div>
    </div>`;
  }).join("");
  return `<div class="card"><b>📥 待你審核（${pending.length}）</b>
    ${rows||`<p class="muted" style="margin-top:8px">目前沒有待審核的配對</p>`}</div>`;
}
async function approveMatch(id, finalVideoId){
  if(!finalVideoId){ toast("尚未選擇影片",true); return; }
  await write("POST",`/api/matches/${id}/approve`,{finalVideoId},"已核准，正式建立商品配對");
}
async function rejectMatch(id){
  const note=prompt("退回原因（會顯示給選品人員）：");
  if(note===null) return;
  await write("POST",`/api/matches/${id}/reject`,{bossNote:note},"已退回");
}

// 三欄工作台：商品資訊 → 選擇影片 → 建立配對並送審
function matchWorkbenchHTML(){
  const products=(STATE.products||[]).slice().sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||"")));
  if(MATCH_PRODUCT_ID && !products.some(x=>x.id===MATCH_PRODUCT_ID)) MATCH_PRODUCT_ID=null;
  const p=MATCH_PRODUCT_ID?products.find(x=>x.id===MATCH_PRODUCT_ID):null;
  return `
  <div class="grid cols3" style="align-items:start">
    <div class="card">
      <b>1️⃣ 商品資訊</b>
      <label>選擇商品</label>
      <select onchange="pickMatchProduct(this.value)">
        <option value="">— 請選擇 —</option>
        ${products.map(x=>`<option value="${esc(x.id)}" ${x.id===MATCH_PRODUCT_ID?"selected":""}>${esc(x.name)}</option>`).join("")}
      </select>
      ${p?matchProductInfoHTML(p):`<p class="muted" style="margin-top:10px">尚未選擇商品</p>`}
      <button class="btn sm sec" style="margin-top:12px;width:100%" onclick="editProductModal()">＋ 新增商品</button>
    </div>
    <div class="card">
      <b>2️⃣ 選擇影片</b>
      ${matchVideoPickerHTML()}
    </div>
    <div class="card">
      <b>3️⃣ 建立配對並送審</b>
      ${matchSummaryHTML(p)}
    </div>
  </div>`;
}
function pickMatchProduct(id){
  MATCH_PRODUCT_ID=id||null; MATCH_PRIMARY_ID=null; MATCH_BACKUP_ID=null; MATCH_EDITING_ID=null; render();
}
function matchProductInfoHTML(p){
  const av=p.activeVideoId?vid(p.activeVideoId):null;
  return `<div class="card" style="background:var(--panel2);margin-top:10px">
    <div class="row">
      ${p.image?`<img src="${esc(p.image)}" style="width:56px;height:56px;object-fit:cover;border-radius:4px">`:""}
      <div><b>${esc(p.name)}</b><div class="muted" style="font-size:12px">SKU：${esc(p.sku||"未填")}</div></div>
    </div>
    <p class="muted" style="margin:10px 0 4px;font-size:13px">官網商品網址</p>
    ${p.officialUrl?`<a href="${esc(p.officialUrl)}" target="_blank">${esc(p.officialUrl)}</a>`
      :`<span class="pill wa">尚未建立官網商品頁，請先新增商品才能往下配影片</span>`}
    ${av?`<p style="margin-top:10px"><span class="pill ok">✅ 已正式配對：${esc(vidTitle(av))}</span></p>`:""}
  </div>`;
}

// 貼商品網址→自動抓名稱／SKU／圖片：純前端用公開 CORS 代理讀網頁 HTML，
// 解析 Open Graph（og:title／og:image）與商品結構化資料（JSON-LD Product 的 sku／mpn／gtin）。
// 抓不到就回傳空字串，不擋流程——欄位本來就可以手動填或修正。
function decodeHtmlEntities(s){
  return String(s==null?"":s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m,e)=>{
    if(e[0]==="#"){ const cp=(e[1].toLowerCase()==="x")?parseInt(e.slice(2),16):parseInt(e.slice(1),10);
      return isNaN(cp)?m:String.fromCodePoint(cp); }
    const map={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "}; return map[e.toLowerCase()]||m;
  });
}
function parseProductMetaHTML(html){
  const s=String(html||"");
  const metaContent=(prop)=>{
    const esc_=prop.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const re1=new RegExp('<meta[^>]+(?:property|name)=["\']'+esc_+'["\'][^>]*content=["\']([^"\']*)["\']',"i");
    const re2=new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']'+esc_+'["\']',"i");
    const m=s.match(re1)||s.match(re2); return m?m[1].trim():"";
  };
  let name=metaContent("og:title");
  if(!name){ const tm=s.match(/<title[^>]*>([^<]*)<\/title>/i); if(tm) name=tm[1].trim(); }
  let image=metaContent("og:image");
  let sku="";
  const ldBlocks=s.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)||[];
  for(const block of ldBlocks){
    const jsonText=block.replace(/^<script[^>]*>/i,"").replace(/<\/script>$/i,"");
    try{
      const data=JSON.parse(jsonText);
      const items=Array.isArray(data)?data:(data["@graph"]||[data]);
      for(const it of items){
        if(!it) continue;
        const types=Array.isArray(it["@type"])?it["@type"]:[it["@type"]];
        if(!types.includes("Product")) continue;
        sku=it.sku||it.mpn||it.gtin13||it.productID||sku;
        if(!name) name=it.name||name;
        if(!image){ const im=it.image; image=Array.isArray(im)?im[0]:((im&&im.url)||im)||image; }
        if(sku) break;
      }
    }catch(e){}
    if(sku) break;
  }
  return { name:decodeHtmlEntities(name), image:decodeHtmlEntities(image), sku:decodeHtmlEntities(sku) };
}
async function fetchProductMeta(url){
  const u=String(url||"").trim();
  if(!/^https?:\/\//i.test(u)) throw new Error("請先輸入正確的網址（需以 http(s):// 開頭）");
  const res=await fetch("https://api.allorigins.win/raw?url="+encodeURIComponent(u));
  if(!res.ok) throw new Error("讀不到這個網址（HTTP "+res.status+"）");
  return parseProductMetaHTML(await res.text());
}
async function autoFillProduct(){
  const url=val("pd_url").trim();
  if(!url){ toast("請先輸入商品網址",true); return; }
  const btn=document.getElementById("pd_fetch");
  if(btn){ btn.disabled=true; btn.textContent="抓取中…"; }
  try{
    const meta=await fetchProductMeta(url);
    if(meta.name) document.getElementById("pd_name").value=meta.name;
    if(meta.image) document.getElementById("pd_img").value=meta.image;
    if(meta.sku) document.getElementById("pd_sku").value=meta.sku;
    MODAL_DIRTY=true;
    toast((meta.name||meta.image||meta.sku)?"已自動帶入，記得確認正不正確":"這個網址抓不到商品資料，請手動填", !(meta.name||meta.image||meta.sku));
  }catch(e){ toast(e.message||"抓取失敗，請手動填",true); }
  finally{ if(btn){ btn.disabled=false; btn.textContent="🔍 自動抓取"; } }
}
function editProductModal(id){
  const p=id?(STATE.products||[]).find(x=>x.id===id):{};
  if(id && !p) return;
  showModal(id?"編輯商品":"新增商品", `
    <label>商品網址</label>
    <div class="row" style="gap:8px;flex-wrap:nowrap">
      <input id="pd_url" style="flex:1;min-width:120px" placeholder="https://…" value="${esc((p&&p.officialUrl)||"")}">
      <button type="button" class="btn sm sec" id="pd_fetch" style="flex:none" onclick="autoFillProduct()">🔍 自動抓取</button>
    </div>
    <label>商品名稱</label><input id="pd_name" value="${esc((p&&p.name)||"")}">
    <label>SKU</label><input id="pd_sku" value="${esc((p&&p.sku)||"")}">
    <label>商品圖片網址</label><input id="pd_img" value="${esc((p&&p.image)||"")}">
  `, async ()=>{
    const name=val("pd_name").trim();
    if(!name){ toast("請輸入商品名稱",true); return false; }
    const product={name, sku:val("pd_sku").trim(), image:val("pd_img").trim(), officialUrl:val("pd_url").trim()};
    return id ? await write("PUT",`/api/products/${id}`,{product},"已更新商品")
              : await write("POST","/api/products",{product},"已新增商品");
  });
}

// 選片：分「已完成影片」／「僅有腳本」兩個分頁，可篩選「等待選品中」與關鍵字
function matchVideoPickerHTML(){
  return `
    <div class="row" style="margin-bottom:8px">
      <button class="btn sm ${MATCH_VTAB==='done'?'':'sec'}" onclick="setMatchVTab('done')">已完成影片</button>
      <button class="btn sm ${MATCH_VTAB==='script'?'':'sec'}" onclick="setMatchVTab('script')">僅有腳本</button>
    </div>
    <input id="mv_q" placeholder="用關鍵字篩選文案／標題" value="${esc(MATCH_VQ)}" oninput="MATCH_VQ=this.value;matchVFilter()">
    <select style="margin-top:6px" onchange="MATCH_VFILTER=this.value;matchVFilter()">
      <option value="awaiting" ${MATCH_VFILTER==='awaiting'?'selected':''}>等待選品中</option>
      <option value="all" ${MATCH_VFILTER==='all'?'selected':''}>全部影片</option>
    </select>
    <div id="mv_list" style="margin-top:10px;max-height:520px;overflow:auto">${matchVideoListHTML()}</div>
    <p class="muted" style="margin-top:8px;font-size:12px">可選擇 2 支影片：1 支主選影片＋1 支備選影片。最後正式配對仍是 1 商品＝1 影片。</p>`;
}
function setMatchVTab(t){ MATCH_VTAB=t; render(); }
function matchVFilter(){ const el=document.getElementById("mv_list"); if(el) el.innerHTML=matchVideoListHTML(); }
const MATCH_VSHOW=40;   // 候選影片一次最多畫幾張（見下面的說明）
function matchVideoListHTML(){
  const q=MATCH_VQ.trim().toLowerCase();
  // 候選片源＝影片庫大流＋影片庫A。大流是現成成品，優先推薦；沒有的話再用關鍵字往庫A裡搜（見 isDF 排序）
  const pool=(STATE.videosDF||[]).concat(STATE.videos||[]);
  const list=pool.filter(v=>{
    if(MATCH_VTAB==="done" && !matchVidDone(v)) return false;
    if(MATCH_VTAB==="script" && !matchVidScript(v)) return false;
    if(MATCH_VFILTER==="awaiting" && !videoAwaitingCuration(v)) return false;
    if(q && !`${v.name||""} ${v.videoCopy||""}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a,b)=>(isDF(b)?1:0)-(isDF(a)?1:0));
  if(!list.length) return `<p class="muted">沒有符合條件的影片</p>`;
  // ⚠️ 這裡以前把**每一支**候選片都畫成一張卡（一張兩顆按鈕）。實測正式資料：
  //    6278 個 DOM 節點、403KB HTML —— 整個選品配對頁 100% 的份量都在這一塊，
  //    手機上光是把它塞進畫面就要 2.4 秒。而外框是 max-height:520px 的捲動區，
  //    同一時間看得到的只有 5 張左右，其餘 750 張是純粹白做的。
  //    照操作紀錄那一頁的慣例改成「只畫前 N 張」＋講清楚還有幾支。
  //    選到的主選／備選一定要在裡面 —— 不然捲不到會以為自己沒選到。
  const picked=list.filter(v=>v.id===MATCH_PRIMARY_ID||v.id===MATCH_BACKUP_ID);
  const rest  =list.filter(v=>v.id!==MATCH_PRIMARY_ID&&v.id!==MATCH_BACKUP_ID);
  const shown =picked.concat(rest.slice(0, Math.max(0, MATCH_VSHOW-picked.length)));
  const more  =list.length-shown.length;
  const moreLine = more
    ? `<p class="muted" style="font-size:12px;margin:8px 0 0">符合的共 <b>${list.length}</b> 支，這裡只列前 ${shown.length} 支 —— 用上面的搜尋或分頁縮小範圍。（已選的一定會列出來）</p>`
    : "";
  return shown.map(v=>{
    const isP=v.id===MATCH_PRIMARY_ID, isB=v.id===MATCH_BACKUP_ID;
    return `<div class="card" style="background:var(--panel2);margin-bottom:8px;${isP?'border-color:var(--accent)':(isB?'border-color:var(--gold)':'')}">
      <div class="row" style="justify-content:space-between">
        <div><b>${esc(vidTitle(v))}</b> <span class="muted" style="font-size:12px">${esc(v.code||v.id)}</span></div>
        ${isP?`<span class="pill ok">主選影片</span>`:isB?`<span class="pill wa">備選影片</span>`:""}
      </div>
      <div class="row" style="margin-top:4px">
        ${isDF(v)?`<span class="tag" style="border-color:var(--gold);color:var(--gold-dk)">大流</span>`:""}
        <span class="tag">${matchVidScript(v)?"僅腳本":"已完成"}</span>
        ${videoAwaitingCuration(v)?`<span class="pill wa">等待選品中</span>`:""}
      </div>
      ${v.videoCopy?`<p class="muted" style="font-size:12px;margin:6px 0">影片文案：${esc(v.videoCopy).slice(0,80)}</p>`:""}
      <div class="row" style="margin-top:6px">
        <button class="btn sm ${isP?'sec':''}" onclick="setMatchVideo('primary','${esc(jsEsc(v.id))}')">${isP?"取消主選":"設為主選"}</button>
        <button class="btn sm ${isB?'sec':''}" onclick="setMatchVideo('backup','${esc(jsEsc(v.id))}')">${isB?"取消備選":"設為備選"}</button>
      </div>
    </div>`;
  }).join("")+moreLine;
}
function setMatchVideo(slot,id){
  if(slot==="primary"){ MATCH_PRIMARY_ID=(MATCH_PRIMARY_ID===id)?null:id; if(MATCH_BACKUP_ID===MATCH_PRIMARY_ID) MATCH_BACKUP_ID=null; }
  else { MATCH_BACKUP_ID=(MATCH_BACKUP_ID===id)?null:id; if(MATCH_PRIMARY_ID===MATCH_BACKUP_ID) MATCH_PRIMARY_ID=null; }
  render();
}

// 建立配對並送審：選好的商品＋主選／備選影片彙整成摘要，按鍵開彈窗填文案建議與上架日期
function matchSummaryHTML(p){
  if(!p) return `<p class="muted">請先選擇商品</p>`;
  const pv=MATCH_PRIMARY_ID?vid(MATCH_PRIMARY_ID):null, bv=MATCH_BACKUP_ID?vid(MATCH_BACKUP_ID):null;
  return `<div class="card" style="background:var(--panel2)">
      <p><b>商品</b>：${esc(p.name)}</p>
      <p><b>主選影片</b>：${pv?esc(vidTitle(pv)):'<span class="muted">尚未選擇</span>'}</p>
      <p><b>備選影片</b>：${bv?esc(vidTitle(bv)):'<span class="muted">（可留空）</span>'}</p>
    </div>
    <button class="btn" style="width:100%;margin-top:12px" onclick="openMatchSubmit()" ${pv?"":"disabled"}>📤 填寫文案建議與上架日期，送老闆審核</button>`;
}
function openMatchSubmit(){
  if(!MATCH_PRODUCT_ID || !MATCH_PRIMARY_ID){ toast("請先選擇商品與主選影片",true); return; }
  // 同一位選品人員對同一個商品，若已有草稿或被退回的配對，直接接續編輯（不會愈開愈多筆）
  const existing=(STATE.matches||[]).find(m=>m.productId===MATCH_PRODUCT_ID && m.createdBy===currentUser()
    && ["draft","rejected"].includes(m.status));
  MATCH_EDITING_ID=existing?existing.id:null;
  showModal("建立配對並送審", `
    ${existing&&existing.status==="rejected"?`<p class="pill em">此配對先前被退回：${esc(existing.bossNote||"（無說明）")}</p>`:""}
    <label>建議文案修改（例如：商品名稱要換掉、片尾 CTA 要換、原文案可直接使用…）</label>
    <textarea id="mm_copy" maxlength="200">${esc((existing&&existing.suggestedCopyEdit)||"")}</textarea>
    <label>建議上架日期</label>
    <input type="date" id="mm_date" value="${esc((existing&&existing.suggestedLaunchDate)||today)}">
  `, submitMatch);
}
async function submitMatch(){
  const match={ productId:MATCH_PRODUCT_ID, primaryVideoId:MATCH_PRIMARY_ID, backupVideoId:MATCH_BACKUP_ID,
    suggestedCopyEdit:val("mm_copy").trim(), suggestedLaunchDate:val("mm_date") };
  let ok;
  if(MATCH_EDITING_ID){
    ok=await write("PUT",`/api/matches/${MATCH_EDITING_ID}`,{match});
    if(ok) ok=await write("POST",`/api/matches/${MATCH_EDITING_ID}/submit`,{},"已送老闆審核");
  } else {
    ok=await write("POST","/api/matches",{match, submit:true},"已送老闆審核");
  }
  if(!ok) return false;
  MATCH_PRIMARY_ID=null; MATCH_BACKUP_ID=null; MATCH_EDITING_ID=null;
  return true;
}

// 配對紀錄：選品行銷看自己送出的，老闆／經理人／管理員看全部
function matchHistoryCard(isBoss){
  const list=(STATE.matches||[]).filter(m=>isBoss||m.createdBy===currentUser())
    .slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  const label={draft:"草稿",submitted:"審核中",approved:"已核准",rejected:"已退回"};
  const cls={draft:"",submitted:"wa",approved:"ok",rejected:"em"};
  const rows=list.map(m=>{
    const p=(STATE.products||[]).find(x=>x.id===m.productId);
    const fv=m.finalVideoId?vid(m.finalVideoId):null;
    return `<tr>
      <td data-label="商品">${esc(p?p.name:m.productId)}</td>
      <td data-label="主選">${(()=>{ const v=vid(m.primaryVideoId); return v?esc(vidTitle(v)):"-"; })()}</td>
      <td data-label="備選">${(()=>{ const v=m.backupVideoId?vid(m.backupVideoId):null; return v?esc(vidTitle(v)):"-"; })()}</td>
      <td data-label="送審人">${esc(m.createdBy||"")}</td>
      <td data-label="狀態">${cls[m.status]?`<span class="pill ${cls[m.status]}">${esc(label[m.status]||m.status)}</span>`:esc(label[m.status]||m.status)}</td>
      <td data-label="最終影片">${fv?esc(vidTitle(fv)):"-"}</td>
    </tr>`;
  }).join("");
  return `<div class="card"><b>📋 ${isBoss?"全部":"我的"}配對紀錄</b>
    <table class="responsive" style="margin-top:8px"><thead><tr><th>商品</th><th>主選</th><th>備選</th><th>送審人</th><th>狀態</th><th>最終影片</th></tr></thead>
    <tbody>${rows||`<tr><td class="muted">尚無紀錄</td></tr>`}</tbody></table></div>`;
}

// 影片內容：預設檢視（不可改）；右上「編輯」才進編輯、右上「×」關閉
// 真正的守門在這裡 —— 灰掉只是外觀，這一行才是「別人打不開」。
// 所有點影片的入口（影片庫、月排程日視窗、待認領池）最後都走這裡。
function editVideo(id){ const v=vid(id);
  if(assignLocked(v)){ toast(assignLockTip(v), true); return; }
  openVideoModal(id, true); }
// 編輯模式離開保護：有改動時，必須按「儲存修改」或「取消編輯」
function cancelVideoEdit(){ MODAL_DIRTY=false; closeModal(); }
function tryExitVideoEdit(){ if(MODAL_DIRTY){ warnUnsaved(); return; } closeModal(); }
// 文案欄平常收成一排（版面才不會被一大塊空白占掉），點下去展開成 6 排好編輯。
// 展開後就不收回去 —— 打到一半突然縮回去比占版面更煩。
function vcopyOpen(){ const t=document.getElementById("e_vcopy");
  if(t && !(t.classList&&t.classList.contains("open"))){ t.rows=6; if(t.classList) t.classList.add("open"); } }
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
// ===================================================================
// 影片封面圖 —— 先在瀏覽器壓縮，再放 Firebase Storage
// 為什麼一定要壓：手機截圖動輒 3–5MB。22 個人各傳幾百張就是好幾 GB，
// 而且每個人翻影片庫都會把縮圖再下載一次（流量是另外算錢的）。
// 壓成長邊 720px 的 JPEG 之後約 60–90KB，縮圖跟原圖肉眼看不出差別，
// 儲存與流量都省 50 倍左右。
// ===================================================================
const COVER_MAX=720;                  // 壓縮後的長邊上限（像素）
const COVER_Q=0.72;                   // JPEG 品質
const COVER_SRC_MAX=12*1024*1024;     // 原始檔上限：再大就是拿錯檔案了（例如把影片檔當圖片選）
function coverUrl(v){ return String((v&&v.cover)||"").trim(); }
function hasCover(v){ return !!coverUrl(v); }

// 把使用者選的圖畫到 canvas 上縮小，輸出成 JPEG blob
function coverCompress(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      const w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
      if(!w||!h){ reject(new Error(T("這個檔案讀不出圖片","Could not read that image"))); return; }
      const k=Math.min(1, COVER_MAX/Math.max(w,h));   // 只縮不放大：本來就小的圖保持原樣
      const cw=Math.max(1,Math.round(w*k)), ch=Math.max(1,Math.round(h*k));
      const cv=document.createElement("canvas"); cv.width=cw; cv.height=ch;
      const cx=cv.getContext("2d");
      cx.fillStyle="#ffffff"; cx.fillRect(0,0,cw,ch);   // 透明底的 PNG 轉 JPEG 會變黑，先鋪白
      cx.drawImage(img,0,0,cw,ch);
      cv.toBlob(b=> b?resolve(b):reject(new Error(T("圖片壓縮失敗，換一張試試","Compression failed — try another image"))),
        "image/jpeg", COVER_Q);
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error(T("這個檔案不是圖片","That file is not an image"))); };
    img.src=url;
  });
}
function coverBusy(on){ const b=document.getElementById("cv_box"); if(b) b.classList.toggle("busy", !!on); }
// Storage 規則沒開的時候錯誤訊息是 storage/unauthorized，講白話一點才知道要去做什麼
function coverErrMsg(e){
  const m=String((e&&(e.code||e.message))||"");
  if(m.includes("unauthorized")||m.includes("403")) return T("沒有上傳權限 —— Firebase 主控台的 Storage 規則還沒設定","No permission — the Firebase Storage rules are not set up yet");
  if(m.includes("quota")||m.includes("retry-limit")) return T("上傳逾時，網路不穩定，請再試一次","Upload timed out — check your connection and retry");
  return (e&&e.message)||T("上傳失敗","Upload failed");
}
function coverPickFile(){ const el=document.getElementById("cv_file"); if(el) el.click(); }
async function coverChosen(input, id){
  const file=input&&input.files&&input.files[0];
  if(input) input.value="";        // 清掉才能「再選同一張」（onchange 只在值有變時才觸發）
  if(!file) return;
  if(VIEW_AS){ toast(T("員工視角為唯讀預覽，離開後才能上傳","Read-only preview — leave it to upload"),true); return; }
  if(!/^image\//.test(String(file.type||""))){ toast(T("請選圖片檔（JPG／PNG）","Pick an image file (JPG / PNG)"),true); return; }
  if(file.size>COVER_SRC_MAX){ toast(T("這個檔案太大了（超過 12MB），確認一下是不是選到影片檔","That file is over 12MB — did you pick a video by mistake?"),true); return; }
  const DB=(typeof window!=="undefined")&&window.DB;
  if(!DB||!DB.uploadCover){ toast(T("連線還沒就緒，稍等一下再上傳","Not connected yet — try again in a moment"),true); return; }
  coverBusy(true);
  try{
    const blob=await coverCompress(file);
    const url=await DB.uploadCover(id, blob);
    // 圖已經在 Storage 了，這裡只是把網址記到這支影片上；不等「儲存修改」是刻意的，
    // 不然使用者傳完圖卻按取消，Storage 會留一張沒人指向的孤兒圖。
    const done=await write("PUT",`/api/videos/${id}`,{video:{cover:url}},T("封面已更新","Cover updated"));
    if(done) coverRefresh(id, url);   // 只換封面那一格，沒存的欄位留著
  }catch(e){ toast(coverErrMsg(e), true); }
  finally{ coverBusy(false); }
}
async function coverRemove(id){
  if(VIEW_AS){ toast(T("員工視角為唯讀預覽","Read-only preview"),true); return; }
  if(!confirm(T("移除這支影片的封面？","Remove this video's cover?"))) return;
  const DB=(typeof window!=="undefined")&&window.DB;
  const done=await write("PUT",`/api/videos/${id}`,{video:{cover:""}},T("已移除封面","Cover removed"));
  // 檔案刪不掉不算失敗（可能早就被蓋掉了）；影片上的 cover 清掉才是真正的「移除」
  if(DB&&DB.deleteCover) { try{ await DB.deleteCover(id); }catch(e){} }
  if(done) coverRefresh(id, "");
}
// 編輯畫面左上角那一格
function coverSlotHTML(v, id){ return `<div class="cv-slot" id="cv_slot">${coverSlotInner(v, id)}</div>`; }
function coverSlotInner(v, id){
  const u=coverUrl(v);
  const inner=u
    ? `<img src="${esc(u)}" alt="${T("影片封面","Cover")}" loading="lazy">`
    : `<span class="cv-empty">${PLUS()}<br><span>${T("加封面","Add cover")}</span></span>`;
  return `<div class="cv-box${u?' has':''}" id="cv_box" onclick="coverPickFile()"
         title="${T("點一下上傳封面（會自動壓縮）","Click to upload a cover (auto-compressed)")}">
      ${inner}<span class="cv-spin"></span></div>
    <input type="file" id="cv_file" accept="image/*" style="display:none" onchange="coverChosen(this,'${esc(jsEsc(id))}')">
    ${u?`<a href="javascript:void(0)" class="cv-rm" onclick="coverRemove('${esc(jsEsc(id))}')">${T("移除","Remove")}</a>`
       :`<span class="cv-hint">${T("選填","Optional")}</span>`}`;
}
// 換封面之後只重畫封面那一格。
// 以前是整個編輯視窗重開 —— 那會把還沒按儲存的欄位（成片連結、文案…）
// 通通換回資料庫裡的舊值，等於使用者剛打的字被吃掉。
// nextCover 直接帶新網址，不必等 Firestore 同步回來。
function coverRefresh(id, nextCover){
  const slot=document.getElementById("cv_slot");
  const v=Object.assign({}, vid(id)||{});
  if(nextCover!==undefined) v.cover=nextCover;
  if(!slot){ openVideoModal(id, true); return; }   // 不在編輯視窗（少見）才退回重開
  slot.innerHTML=coverSlotInner(v, id);
}
// 清單／格子用的小縮圖（沒封面就維持原本的 ▶ 底色方塊）
// 沒寫文案的小橘點。片名只是代號，沒文案等於拍片的人接不下去 ——
// 新增時已經擋住了（v110），這個點是給既有那批沒文案的舊資料用的：
// 邊看邊補，補完就自己不見。二創殼的文案是之後翻譯的，不算。
// 版本殼在清單上要標出是哪個版本。這是顯示層 —— 既有那批 name 空白或沒後綴的
// 舊資料靠它補齊，不回寫資料庫（新建立的會在存檔時就帶上，見 createLineVersion）。
const VER_SUFFIX={shopee:["（蝦皮版）"," (Shopee)"], ms:["（馬來西亞版）"," (Malay)"],
                  en:["（英文版）"," (English)"], th:["（泰文版）"," (Thai)"]};
function verSuffixOf(v){ const p=VER_SUFFIX[lineOf(v)]; return p?T(p[0],p[1]):""; }
function vidNameZoned(v){
  if(isSourceVid(v)) return vidName(v);
  const sfx=verSuffixOf(v);
  const base=stripHash(v.name||"") || vidName(anchorOf(v));
  if(!sfx) return base;
  // 已經帶過後綴的不要疊第二次（比對時把括號與空白拿掉，中英兩版都認得）
  const bare=sfx.replace(/[（）()\s]/g,"");
  return base.replace(/[（）()\s]/g,"").includes(bare) ? base : (base+sfx);
}
// ── 「這支還缺什麼」小燈號 ───────────────────────────────────────
// 依工作流程：寫腳本 → 排日期 → 拍毛片 → 剪 → 上片貼連結。
// 每一支片在流程中的哪一步卡住，就在片名旁邊直接寫出來，不用點進去才知道。
// 只有「該上片了卻還沒貼連結」是紅的（那是真的落後）；其餘是還沒輪到的步驟，用琥珀色。
// 影片庫目前這個分頁／篩選已經表達的事
function vidImplied(){
  const out=[];
  if(VID_VIEW==="script") out.push("raw");    // 「未拍」＝整頁都還沒拍
  if(VID_UNSCHED) out.push("date");           // 勾了「只看還沒排日期的」
  return out;
}
// 「上片連結」只有二創殼追得到 —— 它的編輯視窗有那一格（i_pub／{p}_pub）。
// 台灣源片的編輯視窗**根本沒有這個輸入格**，所以那個欄位對源片永遠是空的
// （實際資料：610 支影片有 0 支填得起來）。拿一個填不了的欄位當缺漏，
// 等於對所有人亮一個永遠熄不掉的紅字 —— 燈號就失去意義了，看到紅色也不會再有人當一回事。
function needPostLink(v){ return isVersion(v); }
function vidMissing(v){
  if(!v) return [];
  const out=[];
  const sch=String(v.scheduledDate||"").slice(0,10);
  const pub=String(v.publishedLink||"").trim();
  if(isVersion(v)){                                   // 版本殼：沒有腳本／毛片這兩步
    // ① 該上片了卻還沒貼連結 —— 排程日到了或過了，這是唯一會轉紅的
    if(sch && sch<=today && !pub) out.push({k:"pub", zh:"缺上片連結", en:"needs post link", late:true});
    if(!sch) out.push({k:"date", zh:"沒排日期", en:"no date"});
    // 存檔位置跟源片同一個資料夾（唯讀），版本殼不會有自己的 —— 所以問「這一家有沒有」，
    // 不是問「它自己有沒有」。問錯就是又一顆永遠熄不掉的燈號。
    if(isPublished(v) && !familyDrive(v)) out.push({k:"drive", zh:"缺存檔連結", en:"needs file link"});
    return out;
  }
  if(isDF(v)){
    // 大流放的是成品：沒有毛片這一步（它本來就不用拍），所以不能標「缺毛片」——
    // 那會變成又一個永遠熄不掉的燈號。它只有兩件事真的可能缺：存檔連結與文案。
    if(!String(v.driveFolder||"").trim()) out.push({k:"drive", zh:"缺存檔連結", en:"needs file link"});
    if(!String(v.videoCopy||"").trim())   out.push({k:"copy",  zh:"缺文案",     en:"needs script"});
    return out;
  }
  if(!String(v.videoCopy||"").trim()) out.push({k:"copy", zh:"缺文案", en:"needs script"});
  if(!vidHasRaw(v))                    out.push({k:"raw",  zh:"缺毛片",  en:"needs footage"});
  if(!sch)                             out.push({k:"date", zh:"沒排日期", en:"no date"});
  if(isPublished(v) && !ownDrive(v))   out.push({k:"drive", zh:"缺存檔連結", en:"needs file link"});
  return out;
}
// 小燈號：只寫最要緊的那一項，其餘掛在 title 裡（手機上點不到 hover，所以主要那項一定用文字寫出來）
// implied＝這個畫面／分頁已經說明過的事，不用在每一列再寫一次。
// 例：人在「未拍」分頁，整頁都是缺毛片，每列再標一次「缺毛片」是廢話（v122）。
function missingPill(v, implied){
  let m=vidMissing(v);
  if(implied && implied.length) m=m.filter(x=>implied.indexOf(x.k)<0);
  if(!m.length) return "";
  const first=m[0], late=!!first.late;
  const all=m.map(x=>T(x.zh,x.en)).join("、");
  const more=m.length>1?`+${m.length-1}`:"";
  return `<span class="misspill${late?' late':''}" title="${esc(all)}">${esc(T(first.zh,first.en))}${more}</span>`;
}
// 舊的「沒文案」小圓點：保留函式名，改成走同一套燈號
function coverThumbHTML(v, cls){
  const u=coverUrl(v);
  return u ? `<img class="${cls||"vthumb"}" src="${esc(u)}" alt="" loading="lazy" decoding="async">`
           : `<span class="${cls||"vthumb"}">▶</span>`;
}

function vidViewModal(v, id, head, tags, prodList, localizedCard, metricsCard, reviewCard, usageCard){
  const row=(l,c)=>`<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)"><div class="muted" style="width:100px;flex:none;font-size:13px">${l}</div><div style="flex:1;min-width:0">${c||'<span class="muted">—</span>'}</div></div>`;
  const body=`
      ${hasCover(v)?`<div class="cv-view"><img src="${esc(coverUrl(v))}" alt="${T("影片封面","Cover")}" loading="lazy"></div>`:''}
      ${row(T("編號","Code"), esc(vidCode(v)))}
      ${row(T("原始片名","Raw title"), esc(zhTW(v.rawName||"")))}
      ${row(T("影片貼文文案","Post caption"), esc(zhTW(v.name||""))+enSubLine(v))}
      ${row(T("影片文案","Script"), (v.videoCopy?esc(zhTW(v.videoCopy)).replace(/\n/g,'<br>'):'')+((currentRole()==="intl"&&!v.locale&&v.videoCopyEn)?`<div class="vt-en">${esc(v.videoCopyEn).replace(/\n/g,'<br>')}</div>`:''))}
      ${row(T("參考來源","Reference"), v.refLink?`<a href="${esc(v.refLink)}" target="_blank" rel="noopener noreferrer">${T("開啟參考來源","Open reference")}</a>`:'')}
      ${row(T("標籤","Tags"), tags.length?tags.map(t=>`<span class="tag">${esc(dataLabel(t))}</span>`).join(" "):'')}
      ${isSourceVid(v)?row(T("原本語言","Original language"), esc(origLangLabel(origLangOf(v)))):''}
      ${row(T("片源","Source"), esc(dataLabel(v.source||"")))}
      ${row(T("階段","Stage"), `<span class="pill ${dispStage(v)==='待審核'?'wa':(v.stage==='已上片'||v.stage==='已完成'?'ok':(v.stage==='剪輯中'?'wa':''))}">${esc(stageLabel(dispStage(v)))}</span>`)}
      ${row(T("剪輯人員","Editor"), esc(v.editor||""))}
      ${row(T("建立者","Created by"), v.createdBy?`${esc(v.createdBy)}${v.createdAt?` <span class="muted" style="font-size:12px">${esc(String(v.createdAt).slice(0,10))}</span>`:''}`:'')}
      ${row(T("商品","Products"), prodList.length?prodList.map(p=>esc(p.name)+(p.price?`（NT$${esc(p.price)}${p.salePrice?T(`／寵粉價 NT$${esc(p.salePrice)}`,` / Fan price NT$${esc(p.salePrice)}`):''}）`:"")).join("、"):'')}
      ${row(T("商品頁網址","Product page"), v.productUrl?`<a href="${esc(v.productUrl)}" target="_blank">${esc(v.productUrl)}</a>`:'')}
      ${row(T("預排上片日","Scheduled"), esc(v.scheduledDate||""))}
      ${row(T("存檔資料夾（毛片・成片・二創・封面都在這）","Drive folder (footage, cuts, remakes, cover)"),
            vidRawLink(v)?`<a href="${esc(vidRawLink(v))}" target="_blank">${T("開啟","Open")}</a>`:'')}
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
  // v146：海外進來的守門拿掉了。
  //
  // 舊的守門把海外導到一張唯讀卡，那張卡假設「一定有台灣拍好的毛片跟成片可以看」——
  // 對還沒拍的腳本整段都是錯的，而且沒有編輯視窗就沒有存檔資料夾、沒有階段、
  // 不能認領，等於海外根本不能自己拍自己傳。
  //
  // 新流程是一份腳本發給兩組人各拍各的語言，所以海外要的就是**同一個視窗**，
  // 只是介面走 T() 出英文。這個視窗本來就整份 T() 過了。
  const s=STATE.settings||{};
  const sources=brandSetting("sources")||["老闆自拍","外部公司"];
  const users=(STATE.users||[]).filter(u=>u.role==="editor").map(u=>u.name);
  const stages=["待處理","剪輯中","已完成","已上片"];
  const tags=videoTagsOf(v);
  const prodList=(Array.isArray(v.products)?v.products.filter(p=>p&&p.name):[]);
  const reviewCard = reviewCardHTML(v);
  const metricsCard=vidMetricsCard(v);
  // 一創剪輯不需要看到二創版本的狀況（減少干擾）；做二創的人與管理層才顯示
  const localizedCard = (seesIntl() ? localizedVersionsCard(v) : "")
                      + (seesTW()   ? (shopeeVersionsCard(v) + msVersionsCard(v)) : "");
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

  // 折疊分組（v111）：四個人輪流做全部的事，所以不能依角色隱藏 —— 依「資料類型」折。
  // 每次都要看的留在上面；其餘收起來，但只要裡面已經有資料就自動展開（不然會以為是空的）。
  const hasProd = prodList.length>0 || !!String(v.productUrl||"").trim();
  // 存檔資料夾從這一折搬到上面（拍毛片的人一進來就要看到，不是上片後才填），
  // 所以這裡不再拿 driveFolder 當「有沒有料」的依據。
  const hasPost = usageList(v).length>0 || (Array.isArray(v.metrics)&&v.metrics.length>0);
  // 「進階」一律收起來（都是選填、少碰的欄位）。裡面有東西時在標題上標個數字
  // 提示，這樣不用打開也知道有料 —— 比自動展開安靜，又不會讓人漏看。
  // 注意 name 不能拿來判斷：存檔時它預設會跟原始片名一樣，等於永遠有值。
  const advFilled = [ String(v.name||"").trim() && String(v.name||"").trim()!==String(v.rawName||"").trim(),
                      String(v.refLink||"").trim(), String(v.note||"").trim() ].filter(Boolean).length;
  const body=`
    <div class="cv-head">
      ${coverSlotHTML(v, id)}
      <div class="cv-head-f">
        <label style="margin-top:0">${T("編號 ／ 原始片名","Code / Raw title")}</label>
        <div class="row" style="gap:8px">
          <input id="e_code" value="${esc(vidCode(v))}" style="flex:none;width:78px;text-align:center" placeholder="${T("編號","Code")}">
          <input id="e_raw" value="${esc(v.rawName||"")}" style="flex:1;min-width:0" placeholder="${T("原始片名","Raw title")}">
        </div>
        ${enFieldHTML("e_nameEn", T("英文片名","English title"), v.nameEn||"", "e_raw")}
      </div>
    </div>
    ${isSourceVid(v)?`<label>${T("原本語言（這支影片是什麼語言拍的）","Original language")}</label>
    <select id="e_lang" onchange="renderSchedBox()">${ORIG_LANGS.map(([k,l],i)=>`<option value="${k}" ${origLangOf(v)===k?'selected':''}>${T(l,["Chinese","Thai","English","Malaysia"][i])}</option>`).join("")}</select>
    <div class="muted" style="font-size:11px;margin:4px 0 0">${T(
      "這只是標「這支是用什麼語言拍的」。設成泰文或英文，它會歸到影片庫上面的「海外」分頁 —— 大家照樣看得到，只是分開放。",
      "This only records what language it was shot in. Thai or English files it under the “Overseas” tab in the library — everyone can still see it, it's just kept separately.")}</div>`:''}
    <label>${T("影片文案（影片中 IP 的口播台詞）","Script (spoken lines)")}</label>
    <textarea id="e_vcopy" class="grow" rows="1" autocomplete="off" onfocus="vcopyOpen()"
      title="${T("點一下展開成 6 排比較好編輯","Click to expand for easier editing")}">${esc(v.videoCopy||"")}</textarea>
    ${enFieldHTML("e_vcopyEn", T("英文腳本","English script"), v.videoCopyEn||"", "e_vcopy", true)}
    ${familyDriveField(v,"e_drive") || ownerDriveField(v,"e_drive")}
    <label>${T("預排上片日期","Scheduled upload date")}</label>
    <div class="dateField"><span class="dateIco">🗓</span><input id="e_date" type="date" value="${esc(v.scheduledDate||"")}"></div>
    <div id="e_schedbox">${schedBoxHTML(v)}</div>
    ${tagPickerHTML("e", v.tags||(v.subTag?[v.subTag]:[]))}
    ${reviewCard}
    ${fold(T("商品與導購","Products & links"), prodList.length||null, `
      ${productRows("e", v.products)}
      <label>${T("商品頁網址","Product page URL")}</label><input id="e_url" value="${esc(v.productUrl||"")}" oninput="renderEditLinks()" placeholder="https://www.tzgrotw.tw/products/...">
      <div id="e_links">${editLinksHTML(v.productUrl)}</div>`, hasProd)}
    ${fold(T("上片後","After publishing"), null, `
      ${metricsCard}
      ${usageCard}`, hasPost)}
    ${localizedCard?fold(T("其他語言版本","Other language versions"), null, localizedCard, false):''}
    ${fold(T("進階","Advanced"), advFilled||null, `
      <label>${T("影片貼文文案（不填則同原始片名）","Post caption (defaults to raw title)")}</label>
      <input id="e_name" value="${esc(v.name||"")}" placeholder="${T("影片貼文文案","Post caption")}">
      <label>${T("參考來源的網址（選填）","Reference link (optional)")}</label>
      <input id="e_ref" type="url" value="${esc(v.refLink||"")}" placeholder="${T("這支的靈感／參考影片是哪來的，貼網址","Where this idea came from — paste a link")}">
      <div class="grid cols2">
        <div><label>${T("片源","Source")}</label><select id="e_src">${sources.map(c=>`<option value="${esc(c)}" ${v.source===c?"selected":""}>${esc(dataLabel(c))}</option>`).join("")}</select></div>
        <div><label>${T("階段","Stage")}</label>
          ${["boss","manager"].includes(currentRole())
            ? `<select id="e_stage">${stages.map(c=>`<option value="${esc(c)}" ${v.stage===c?"selected":""}>${esc(stageLabel(c)||c)}</option>`).join("")}</select>`
            : `<input id="e_stage" value="${esc(stageLabel(v.stage||"待處理")||v.stage||"待處理")}" readonly disabled style="background:var(--panel2)">
               <div class="muted" style="font-size:11px;margin:4px 0 0">${T("剪好了請用工作頁的「完成 ✔」，階段會自動走","Use “Done ✔” on your work page — the stage moves itself")}</div>`}</div>
      </div>
      <label>${T("剪輯人員","Editor")}</label><select id="e_editor"><option value="">—</option>${(v.editor&&!users.includes(v.editor)?[v.editor]:[]).concat(users).map(u=>`<option ${v.editor===u?"selected":""}>${esc(u)}</option>`).join("")}</select>
      <label>${T("備註","Notes")}</label><input id="e_note" value="${esc(v.note||"")}" placeholder="${T("補充說明（選填）","Optional notes")}">`, false)}
    ${((currentRole()==="boss"||currentRole()==="manager") && (isPublished(v) || (v.stage==="剪輯中" && !(v.editor||v.claimedBy))))?`<div class="card" style="border-color:var(--accent)">
      <button class="btn sm" type="button" onclick="reworkVideo('${id}')">移到剪輯的今日工作</button>
      <span class="muted" style="font-size:12px;margin-left:8px">${(v.editor||v.claimedBy)?`退回「${esc(v.editor||v.claimedBy)}」重剪`:"這支無人認領，按下可指定剪輯"}</span>
    </div>`:''}
    ${/* 主管也要退得了片（決策 8：不新增組長職位，改把這顆補給 boss／manager，與上面那顆並存） */
      (v.stage==="剪輯中")?`<div class="card">
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
  MODAL_DIRTY=false; MODAL_SAVE=()=>saveVideo(id); MODAL_VID=id;
  document.getElementById("modalRoot").innerHTML=`<div class="modal" onclick="modalBackdrop(event)"><div class="box" onclick="event.stopPropagation()" oninput="MODAL_DIRTY=true" onchange="MODAL_DIRTY=true">${head}${body}${foot}</div></div>`;
  document.getElementById("vmSave").onclick=async()=>{ const ok=await saveVideo(id); if(!ok) return;
    if(fromWork){ await write("POST",`/api/videos/${id}/finish`,{scheduledDate:val("e_date")||null},"已完成（保留在工作列，下班後消失）"); }
    closeModal(); };
}
async function saveVideo(id){
  const v0=vid(id)||{};   // 毛片連結那一格已經併進資料夾，舊值原封不動留著
  // 銷售商品 與 商品頁網址 須一起填或一起空白（只填一邊 → 擋下不存）
  const products=collectProducts("e"); const productUrl=val("e_url").trim();
  const hasProd=products.some(p=>p&&p.name);
  if(hasProd && !productUrl){ toast(T("有填銷售商品就要一起填『商品頁網址』，否則無法導購","Products need the product page URL too"),true); return false; }
  if(productUrl && !hasProd){ toast(T("有填『商品頁網址』就要至少填一個銷售商品（品名）","A product page URL needs at least one product name"),true); return false; }
  // 英／泰拍的源片排的是英／泰月曆，而那些月曆依帳號分。排了日期卻沒選帳號的話，
  // 這支會兩本月曆都看不到 —— 排了等於沒排，所以擋下來。
  if(document.getElementById("e_acct")){
    const lang=val("e_lang")||"";
    if(INTL_LOCALES.includes(lang) && String(val("e_date")||"").trim() && !String(val("e_acct")||"").trim()){
      toast(T("這支是"+origLangLabel(lang)+"拍的，排程要一起選帳號 —— 不然它不會出現在任何一本月曆上",
              "This one was shot in "+origLangLabel(lang)+" — pick the account too, or it won't show on any schedule"),true);
      return false; }
  }
  const tags=[...new Set(collectTags("e").map(renameTag))];
  if(hasProd && !tags.includes("寵粉")) tags.push("寵粉");   // 有銷售商品 → 自動帶「寵粉」標籤
  await persistNewTags(tags);
  const mainType = tags.some(t=>["代理","招商","代理招商"].includes(t))?"代理招商"
    :((tags.some(t=>String(t).includes("寵粉"))||tags.some(t=>["帶貨","銷售"].includes(t)))?"寵粉":"");  // 無對應標籤＝不分類
  const video={code:val("e_code").trim(), rawName:zhTW(val("e_raw")), name:zhTW(val("e_name").trim()||val("e_raw").trim()), videoCopy:zhTW(val("e_vcopy").trim()), mainType,tags,subTag:tags[0]||"",
    products, productUrl,
    source:val("e_src"),
    // 階段：只有管理員／經理人那一格是真的下拉；其他人看到的是 disabled 的唯讀格
    // （而且顯示的是介面語言的字），讀它會把畫面上的字寫進資料庫。
    stage:["boss","manager"].includes(currentRole())?val("e_stage"):String(v0.stage||"待處理"),
    editor:val("e_editor"),
    scheduledDate:val("e_date")||null,
    driveFolder:val("e_drive"), rawLink:String(v0.rawLink||""),
    // 帳號：只有英／泰源片那一格會出現；沒出現就不要動舊值（二創殼的帳號是建立時定的）
    account:document.getElementById("e_acct") ? val("e_acct").trim() : String(v0.account||""), refLink:val("e_ref").trim(), note:zhTW(val("e_note").trim()),
    // 英文欄位：人工貼回來的，一律照原樣存（不要跑簡繁轉換，那是給中文用的）
    nameEn:val("e_nameEn").trim(), videoCopyEn:val("e_vcopyEn").trim()};
  if(document.getElementById("e_lang")) video.origLang=val("e_lang")||"";   // 一創原本才有這個欄位
  return await write("PUT",`/api/videos/${id}`,{video},T("已更新影片","Video updated"));
}

// ===================================================================
// 海外剪輯（Intl Editor）— 全英文：挑台灣完成片 → 建英文版 → 翻譯重剪 → 上傳
// 英文版＝一筆 locale:"en" 的影片，sourceVideoId 指回台灣源片；沿用認領/完成流程與影片庫。
// ===================================================================
let INTL_Q="";
let INTL_LIB_LOC="";      // 海外影片庫的語言篩選（""＝全部）
let INTL_LOC="en";        // 海外月曆現在看的語言（en/th）
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
  // Boss Sunny（v142）：本來是一家獨立公司，但它只需要自己的一份上片行事曆，
  // 不需要獨立的影片庫／編號／標籤。降級成一條「線」剛好 —— 跟蝦皮、馬來同一套機制。
  sunny: { key:"sunny",  field:"channel", priceKey:"shopee", acctKey:"sunnyAccounts",  targetKey:"sunnyDailyTarget" },
  en:    { key:"en",     field:"locale",  priceKey:"en",     acctKey:"",               targetKey:"intlDailyTarget" },
  th:    { key:"th",     field:"locale",  priceKey:"th",     acctKey:"",               targetKey:"intlDailyTarget" },
};
function lineOf(v){ return String((v&&(v.channel||v.locale))||""); }                 // 這支屬於哪條線（空＝台灣源片）
function lineMatch(v,k){ const L=LINES[k]; return !!L && String((v||{})[L.field]||"")===k; }
// 這支片的**排程**屬於哪一個月曆。
//
// 二創殼看它自己那條線（蝦皮／馬來／Boss Sunny／英文／泰文）。
// 源片看它是用什麼語言拍的 —— 英文／泰文拍的源片排的是英文／泰文月曆，不是中文的。
//
// v147 之前源片一律算中文月曆。那時候海外根本建不了英文源片，所以踩不到；
// v146 打開「海外可以自己拍」之後就會踩到：海外排了日期，中文月曆多算一支英文片，
// 英文月曆卻看不到它 —— 兩邊的數字都是錯的。
function schedLineOf(v){
  const l=lineOf(v); if(l) return l;
  const o=origLangOf(v);
  return INTL_LOCALES.includes(o) ? o : "tw";
}
function lineAccounts(k){ const L=LINES[k]; if(!L) return [];
  if(L.acctKey){ const a=STATE.settings&&STATE.settings[L.acctKey]; return Array.isArray(a)?a.filter(x=>String(x||"").trim()):[]; }
  return intlAccountsFor(k).map(a=>a.name); }
function lineTarget(k){ const L=LINES[k]; if(!L) return 2;
  const v=STATE.settings&&STATE.settings[L.targetKey]; return (v!=null&&v!=="")?(+v||0):2; }
function lineVersionsOfSrc(k, sourceId){ return versionsOfSrc(sourceId).filter(v=>lineMatch(v,k)); }
// 用 schedLineOf 不是 lineMatch：英／泰月曆除了二創殼，還要收「用那個語言拍的源片」。
// 蝦皮／馬來／Boss Sunny 的 schedLineOf 就等於它的 channel，行為完全沒變。
function lineDayList(k, date, acct){ return (STATE.videos||[]).filter(v=>schedLineOf(v)===k && v.account===acct && String(v.scheduledDate||"").slice(0,10)===date); }
function lineDayBreak(k, date, acct){ const total=lineDayList(k,date,acct).length, target=lineTarget(k);
  return {total, target, short:Math.max(0,target-total), full: total>=target}; }
// 來源片池：四條線共用「已完整上傳的中文舊片」，互相排除彼此的衍生版本
function lineSourcePool(){ return (STATE.videos||[]).filter(v=> isSourceVid(v) && isPublished(v) && vidIsOld(v)); }
// 建立版本殼（指派給自己；同源片同帳號不重複）。msg 由各線提供，行為只有這一份
// 建立版本時自動帶的名稱後綴。寫進資料庫的字串不能用 T()：
// 存進去的值不該跟著「現在是誰在看」變。英／泰用英文後綴，那是它們自己畫面的語言。
const VER_SUFFIX_RAW={ shopee:"（蝦皮版）", ms:"（馬來西亞版）",
                       en:" (English version)", th:" (Thai version)" };
// 已經帶過後綴的不再補第二次（重覆建立、或人工改過名字都算）
function withVerSuffix(base, k){
  const sfx=VER_SUFFIX_RAW[k]||""; base=String(base||"").trim();
  if(!sfx || !base) return base;
  const bare=sfx.replace(/[（）()\s]/g,"");
  return base.replace(/[（）()\s]/g,"").includes(bare) ? base : (base+sfx);
}
function createLineVersion(k, sourceId, account, msg){
  const L=LINES[k]; if(!L){ toast(T("未知的平台","Unknown line"),true); return; }
  account=account||"";
  const s=vid(sourceId); if(!s){ toast(msg.notFound,true); return; }
  if(!isPublished(s)){ toast(msg.notPublished,true); return; }
  if(account && (STATE.videos||[]).some(v=>v.sourceVideoId===sourceId && lineMatch(v,k) && v.account===account)){
    toast(msg.dup(account),true); return; }
  // 名稱：海外（英／泰）優先用源片的英文名當底，台灣（蝦皮／馬來）用中文名；再一律補上該線的後綴。
  // 剪輯還是可以自己改，這只是省一次複製貼上，順便讓片名一眼看得出是哪一版。
  const draft=(INTL_LOCALES.includes(k) ? stripHash(s.nameEn||"") : "") || stripHash(s.name||s.rawName||"");
  const rec=newVideoRecord({ [L.field]:k, account, sourceVideoId:sourceId,
    rawName:(s.name||s.rawName||""), name:withVerSuffix(draft,k), videoCopy:"",
    driveFolder:String(s.driveFolder||"").trim(),   // 存檔位置跟源片同一個資料夾（剪好後自己換成自己的檔案連結）
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
// ── 中文欄位底下配一個英文欄位（v141）────────────────────────────────
// 第一格中文、第二格英文，旁邊一顆翻譯圖示：點下去開 Google 翻譯，
// **中文內容已經帶在網址裡**，人只要複製結果貼回第二格，之後想改就自己改。
// 刻意做成半自動：不串翻譯 API，翻出來的東西一定有人看過才會存進去。
// srcId＝旁邊那個中文欄位的 id，按下去的當下才去讀它（使用者可能剛改過還沒存）。
function enFieldHTML(id, label, val0, srcId, big){
  return `<label style="margin-top:10px">${esc(label)}
      <a class="tricon" href="javascript:void(0)" onclick="trOpen('${esc(jsEsc(srcId))}')"
         title="${T("用 Google 翻譯這一格的中文，翻好自己貼回來","Translate the Chinese above with Google Translate, then paste it back")}">文<span>A</span></a>
    </label>
    ${big ? `<textarea id="${esc(id)}" class="grow" rows="1" autocomplete="off" onfocus="this.rows=6"
              placeholder="${T("英文腳本（按上面的翻譯，貼回來後可以自己改）","English script — translate above, paste back, edit freely")}">${esc(val0)}</textarea>`
          : `<input id="${esc(id)}" value="${esc(val0)}"
              placeholder="${T("英文片名（按上面的翻譯，貼回來後可以自己改）","English title — translate above, paste back, edit freely")}">`}`;
}
// 開 Google 翻譯，把那一格當下的中文帶過去
function trOpen(srcId){
  const t=String(val(srcId)||"").trim();
  if(!t){ toast(T("上面那一格還沒有中文可以翻","Nothing to translate yet"),true); return; }
  try{ window.open(gtranslate(t,"en"), "_blank", "noopener"); }
  catch(e){ toast(T("開不了翻譯視窗，請檢查瀏覽器有沒有擋彈出視窗","Couldn't open the translator — check your popup blocker"),true); }
}
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
// 版本殼要跟著哪一支源片一起看（清單排序、標籤、語言都以它為準）。
// 源片被刪掉時退回自己，避免整個清單排序丟例外。
function anchorOf(v){ return isSourceVid(v) ? v : (srcOf(v)||v); }
// 建立版本時會把源片的存檔位置一起帶進來，方便存在同一個資料夾。
// 但那還是「源片的檔案」—— 要等剪輯換成自己剪好的那一支，才算這支自己的存檔連結。
function ownDrive(v){
  const d=String((v&&v.driveFolder)||"").trim(); if(!d) return false;
  if(isSourceVid(v)) return true;
  const s=srcOf(v); return !s || d!==String(s.driveFolder||"").trim();
}
// ── 存檔資料夾：一支片的家族只有一個（v142）──────────────────────
// 第一個拍好毛片的人建的那個資料夾就是唯一的位置，之後這支片衍生出來的
// 中文版、英文版、一創、二創**全部存在裡面**。
//
// 以前每個版本殼都有自己的「存檔連結」欄位，結果大家在每一格填一模一樣的東西
// （實際資料：501 支片配 486 個資料夾，平均一個資料夾放 1.0 支）—— 那些欄位
// 只是在製造重複輸入的機會，順便製造「填不一樣」的機會。
//
// 舊資料不回頭補：既有的片各自的資料夾就留著，新的走新規矩。
function familyDrive(v){
  if(!v) return "";
  const own=String(v.driveFolder||"").trim();
  if(own) return own;                         // 自己有就用自己的（含所有舊資料）
  const s=srcOf(v); return s?String(s.driveFolder||"").trim():"";   // 沒有就沿用源片的
}
// 資料夾這條規矩三個地方都要講（源片那一格、二創那一格、海外看源片的卡片），
// 所以只寫一次 —— 三個地方各寫一份遲早會走鐘。中英文都在，因為海外看的是英文介面。
function driveRuleLine(){
  return T("這支延伸出去的全部影片（中文版／英文版、一創／二創）跟封面，通通放進同一個資料夾。",
           "Everything that comes from this video — Chinese and English versions, first cuts and remakes, and the cover — all go in that same folder.");
}
// 版本殼的存檔欄位改成「唯讀＋說明」：位置由源片決定，不再讓人各填各的
function familyDriveField(v, idAttr){
  const d=familyDrive(v);
  const src=isSourceVid(v);
  if(src) return "";   // 源片自己那一格照舊（那就是「第一個人建的」那一格）
  return `<label>${T("存檔位置","File location")}</label>
    <input id="${esc(idAttr)}" value="${esc(d)}" readonly
      style="background:var(--panel2)" placeholder="${T("由源片決定","Set by the source video")}">
    <div class="muted" style="font-size:11px;margin-top:4px;line-height:1.6">${T(
      "這個資料夾是第一個拍好毛片的人開的，名字就是源片的檔名。",
      "This folder was created by whoever shot the raw footage first, and is named after the source video's file name.")}<br>
      ${driveRuleLine()}${T("你不用自己填。"," Nothing to fill in here.")}</div>`;
}
// 源片那一格：這是「第一個拍好毛片的人」要去 Google 雲端硬碟開資料夾的地方。
// 規矩寫在欄位旁邊，中英文都寫 —— 不然新人只會看到一個空白欄位，不知道要填什麼、
// 更不知道資料夾要取什麼名字。名字一律用這支的檔名，這樣資料夾跟片子對得起來。
function ownerDriveField(v, idAttr){
  if(!isSourceVid(v)) return "";
  const nm=String((v&&(v.rawName||v.name))||"").trim();
  return `<label>${T("存檔資料夾（這支片的所有東西都放這裡）","Drive folder (everything for this video lives here)")}</label>
    <input id="${esc(idAttr)}" value="${esc((v&&v.driveFolder)||"")}"
      placeholder="${T("貼上 Google 雲端硬碟的資料夾網址","Paste the Google Drive folder URL")}">
    <div class="muted" style="font-size:11px;margin-top:4px;line-height:1.6">
      ${T("第一個拍好毛片的人：先到 Google 雲端硬碟開一個新資料夾，名字就用這支的檔名",
          "Whoever shoots the raw footage first: create a new folder in Google Drive, named after this video's file name")}${
      nm?` —— <b>${esc(nm)}</b> <a href="javascript:void(0)" onclick="copyStr('${esc(jsEsc(encodeURIComponent(nm)))}')">${T("複製檔名","copy")}</a>`:""}${T("。","." )}<br>
      ${driveRuleLine()}
    </div>`;
}
// 海外 TikTok 帳號清單（設定維護）：每筆 {locale, name}；每帳號每日目標
function intlAccounts(){ const a=STATE.settings&&STATE.settings.intlAccounts; return Array.isArray(a)?a.filter(x=>x&&x.name):[]; }
function intlAccountsFor(loc){ return intlAccounts().filter(a=>a.locale===loc); }
function intlDailyTarget(){ return lineTarget("en"); }
function localizedVersionsOfSrc(sourceId){ return versionsOfSrc(sourceId).filter(v=>v.locale); }
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
      <td data-label=""><a href="javascript:void(0)" onclick="${vidOpenFn(k)}">${T("開啟","Open")}</a></td></tr>`;
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
  const cards=src.map(v=>{
    const zhTitle=stripHash(v.name||v.rawName)||T("(未命名)","(untitled)");   // 去掉 # 標籤
    const enT=stripHash(v.nameEn);
    // 分開：一支源片可有多支版本；chip 只顯示「語言色點＋狀態」(不寫 US/TH，帳號放 title 提示)
    const kidsAll=localizedVersionsOfSrc(v.id).filter(k=>!loc||k.locale===loc);
    const nArch=kidsAll.filter(isArchived).length;                 // 已上片＝完成任務，封存不再列出
    const kids=kidsAll.filter(k=>!isArchived(k)).sort((a,b)=>INTL_LOCALES.indexOf(a.locale)-INTL_LOCALES.indexOf(b.locale));
    const chips=kids.map(k=>{ const ds=dispStage(k); const done=(k.published||k.stage==='已完成')&&ds!=='待審核';
      return `<span class="pill ${done?'ok':'wa'}" style="cursor:pointer;font-size:11px" onclick="openIntlModal('${k.id}')" title="${esc(localeName(k.locale))}${k.name?(' · '+esc(stripHash(k.name))):''}${k.account?(' · '+esc(k.account)):''}${k.editor?(' · '+esc(k.editor)):''}${k.createdBy?(' · '+T('由 '+esc(k.createdBy)+' 建立','added by '+esc(k.createdBy))):''}">${localeShort(k.locale)} · ${ds==='待審核'?T('待審','in review'):done?T('完成','done'):T('進行中','in progress')}</span>`;
    }).join(" ") + (nArch?`<span class="pill" style="font-size:11px;background:transparent;border:1px solid var(--line);color:var(--muted)" title="${T("已上片、已封存","Published & archived")}">${T("已封存","Archived")} ${nArch}</span>`:'');
    // 動作收成一排：▶ Preview 圖示 ＋ 帳號下拉 ＋ Add(選取後才建立、不跳走)
    const previewBtn=(v.publishedLink||v.driveFolder)?`<button class="btn sec sm ibtn" onclick="openVidPreview('${encodeURIComponent(v.publishedLink||v.driveFolder)}')" title="${T("預覽中文成片","Preview finished Chinese")}">▶</button>`:'';
    // 看內容：唯讀四欄（標題／文案／毛片連結／完成影片連結）—— 海外做自己的語言版本只需要這些
    const briefBtn=`<button class="btn sec sm" style="flex:none" onclick="openSourceForIntl('${v.id}')" title="${T("看標題、文案、毛片與成片連結","Title, copy, raw & finished links")}">${T("看內容","Details")}</button>`;
    const addRow = shownAccts.length
      ? `<div class="row" style="gap:6px;align-items:center;width:100%;flex-wrap:nowrap">
          ${previewBtn}${briefBtn}
          <select id="addacct_${v.id}" style="font-size:13px;padding:7px 8px;flex:1;min-width:0">
            <option value="">${PLUS()} ${T("加版本 — 選帳號","Add version — pick account")}</option>
            ${locs.filter(l=>intlAccountsFor(l).length).map(l=>`<optgroup label="${esc(localeName(l))}">${intlAccountsFor(l).map(a=>`<option value="${accts.indexOf(a)}">${esc(a.name)}</option>`).join("")}</optgroup>`).join("")}
          </select>
          <button class="btn sm" style="flex:none" onclick="createLocalPick('${v.id}')" title="${T("建立這個版本並加入待認領","Create this version and add it to the pool")}">${PLUS()} ${T("加入","Add")}</button>
        </div>`
      : `<div class="row" style="gap:6px;align-items:center;width:100%">${previewBtn}${briefBtn}<span class="muted" style="font-size:12px">${loc?T(`還沒有${localeName(loc)}帳號 — 請管理員到設定新增`,`No ${localeName(loc)} accounts yet — ask the admin to add them in Settings`):T("請管理員先到設定新增帳號","Ask admin to add accounts in Settings")}</span></div>`;
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
// 跟蝦皮／馬來線一樣走 lineDayList，語言也要對得上 —— 英文帳號跟泰文帳號同名時
// 才不會互相灌數（月曆是照語言分頁看的，INTL_LOC 由 calIntlBody 設定）
function intlDayList(date, acct){ acct=acct!=null?acct:intlCurAcct();
  return lineDayList(INTL_LOCALES.includes(INTL_LOC)?INTL_LOC:"en", date, acct); }
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
  INTL_LOC=loc;                                                        // 這一頁的語言：intlDayList／openDayIntl 都靠它
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
    ${list.length?`<table class="responsive daytbl"><thead><tr><th>${T("影片","Video")}</th><th>${T("狀態","Status")}</th><th>${T("剪輯","Editor")}</th><th>${T("上傳連結","Upload")}</th><th>${T("改期","Move to")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`:`<div class="emptyState"><span class="es-mk">✦</span>${T("這天這個帳號還沒有排片。到版本的編輯視窗填「預排上片日期」就會出現在這裡。","Nothing scheduled for this account on this day — set the scheduled upload date in a version's edit window.")}</div>`}
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
    T("已完成（進入待審核）","Done — in review"));
}
async function intlSaveVideo(id){
  const v=vid(id)||{};   // 存檔位置由家族決定，要先把這一筆撈出來
  const video={ name:val("i_name").trim(), videoCopy:val("i_vcopy").trim(),
    driveFolder:familyDrive(v), publishedLink:val("i_pub").trim(), scheduledDate:val("i_date")||null };
  if(document.getElementById("i_acct")) video.account=val("i_acct");
  return await write("PUT",`/api/videos/${id}`,{video},T("已儲存","Saved"));
}
// 源片簡介卡：海外做版本時需要的四樣 —— 標題、文案、毛片連結、完成影片連結。
// openIntlModal（做版本）與 openSourceForIntl（純看內容）共用同一份，
// 這樣海外永遠不會走到台灣版的編輯視窗（那裡有月排程、標籤、商品、階段、刪除）。
function srcBriefCard(s, loc){
  s=s||{};
  const tl=LOCALE_GT[loc]||"en"; const lname=localeName(loc);
  const lnameT=T(({en:"英文",th:"泰文"})[loc]||lname, lname);
  const srcTitle=stripHash(s.nameEn||s.name||s.rawName||"");
  const srcCopy=s.videoCopyEn||s.videoCopy||"";
  // nameEn/videoCopyEn 只是「英文」；非英文語系一律提供翻譯到自己語言的按鈕
  const needTitleTr=(loc!=="en")||!s.nameEn;
  const needScriptTr=!!s.videoCopy && ((loc!=="en")||!s.videoCopyEn);
  const warn=[!vidHasRaw(s)?T('毛片','raw footage'):'', !(s.driveFolder||s.publishedLink)?T('中文成片','finished Chinese version'):''].filter(Boolean).join(T(' 和 ',' & '));
  const trIcon=(text)=>`<a class="tricon" href="${gtranslate(text,tl)}" target="_blank" title="${T("翻譯成"+esc(lnameT),"Translate to "+esc(lname))}">文<span>A</span></a>`;
  return `<div class="card" style="background:var(--panel2)">
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
        ${vidHasRaw(s)?`<a class="btn sm" href="${esc(vidRawLink(s))}" target="_blank">⬇ ${T("下載毛片","Download raw footage")}</a>`:''}
      </div>
      <div class="muted" style="font-size:11px;margin-top:10px;line-height:1.6">🗂 ${
        s.driveFolder?`<a href="${esc(s.driveFolder)}" target="_blank">${T("這一支的資料夾","This video's folder")}</a> · `:''
      }${driveRuleLine()}</div>
      ${warn?`<div style="color:var(--red);font-size:11px;margin-top:10px">⚠ ${T("缺少"+warn+"連結 — 請管理員補上。","No "+warn+" linked — ask the admin to add it.")}</div>`:''}
    </div>
  </div>`;
}
// 海外從清單點源片：只給看，不給編輯（台灣的月排程／標籤／商品／階段都不出現）
function openSourceForIntl(id){
  const s=vid(id)||{};
  const loc=(INTL_LIB_LOC||INTL_LOC||"en");
  const head=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 14px">
      <h3 style="margin:0">${T("影片內容","Video details")} <span class="muted" style="font-size:12px;font-weight:400">${esc(vidCode(s)||"")}</span></h3>
      <button class="btn sec sm" type="button" onclick="closeModal()" title="${T("關閉","Close")}">×</button></div>`;
  MODAL_DIRTY=false; MODAL_SAVE=null;
  document.getElementById("modalRoot").innerHTML=`<div class="modal" onclick="modalBackdrop(event)"><div class="box" onclick="event.stopPropagation()">${head}${srcBriefCard(s, loc)}</div></div>`;
}
function openIntlModal(id){
  const v=vid(id)||{}; const s=srcOf(v)||{};
  const lname=localeName(v.locale);
  const lnameT=T(({en:"英文",th:"泰文"})[v.locale]||lname, lname);   // 顯示用語言名（中文介面給中文）
  // 商品價格即時從源片換算（唯讀，不能改；源片改價這裡自動跟著變）
  const prod=productPriceLine(s.products, v.locale);
  const head=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 14px">
      <h3 style="margin:0">${T(esc(lnameT)+"版本",esc(lname)+" version")} <span class="muted" style="font-size:12px;font-weight:400">${esc(vidCode(s)||"")}</span></h3>
      <button class="btn sec sm" type="button" onclick="closeModal()" title="${T("關閉","Close")}">×</button></div>`;
  const sourceCard=srcBriefCard(s, v.locale);
  const body=`
    ${sourceCard}
    <div style="font-weight:700;font-size:15px;margin:16px 0 2px">${T("你的"+esc(lnameT)+"版本","Your "+esc(lname)+" version")}</div>
    ${v.account?`<label>${T("帳號","Account")}</label><div style="padding:6px 0 2px;font-weight:600">${esc(v.account)} <span class="muted" style="font-weight:400;font-size:12px">· ${esc(localeShort(v.locale))} TikTok</span></div>`:''}
    <label>${T("標題（貼文文案）","Title (post caption)")}</label><input id="i_name" value="${esc(v.name||(v.locale==="en"?stripHash(s.nameEn||""):""))}" placeholder="${T(esc(lnameT)+"標題／貼文",esc(lname)+" title / caption")}">
    <div class="muted" style="font-size:12px;margin:8px 0 0">${T("商品","Products")}: ${prod}${s.productUrl?` · <a href="${esc(s.productUrl)}" target="_blank">🛍 ${T("商品頁","page")}</a>`:''}</div>
    <label>${T("文案（口播台詞）","Script / copy")}</label><textarea id="i_vcopy" style="min-height:80px" placeholder="${T("翻譯／改編的文案","Translated / adapted script")}">${esc(v.videoCopy||"")}</textarea>
    <div class="grid cols2">
      <div>${familyDriveField(v,"i_drive")}</div>
      <div><label>${T("上傳連結（TikTok 貼文）","Upload URL (the TikTok post)")}</label><input id="i_pub" value="${esc(v.publishedLink||"")}" placeholder="https://www.tiktok.com/@.../video/..."></div>
    </div>
    <label>${T("預排上片日期","Scheduled upload date (when it will go live)")}</label>
    <div class="dateField"><span class="dateIco">🗓</span><input id="i_date" type="date" value="${esc(v.scheduledDate||"")}"></div>
`;
  const foot=`<div class="modalFoot">
      <button class="btn sec" type="button" onclick="closeModal()">${T("取消","Cancel")}</button>
      <button class="btn" type="button" onclick="intlSaveVideo('${id}').then(function(ok){if(ok)closeModal();})">${T("儲存","Save")}</button></div>`;
  MODAL_DIRTY=false; MODAL_SAVE=()=>intlSaveVideo(id);
  document.getElementById("modalRoot").innerHTML=`<div class="modal" onclick="modalBackdrop(event)"><div class="box" onclick="event.stopPropagation()" oninput="MODAL_DIRTY=true" onchange="MODAL_DIRTY=true">${head}${body}${reviewCardHTML(v)}${foot}</div></div>`;
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
  sunny:{ label:"Boss Sunny", labelEn:"Boss Sunny", short:"BS", shortEn:"BS", pfx:"bsy", zoneName:"Boss Sunny 區", calName:"Boss Sunny 排程", verName:"Boss Sunny 版本", verNameEn:"Boss Sunny version",
    setName:"Boss Sunny 設定", acctKey:"sunnyAccounts", targetKey:"sunnyDailyTarget", priceKey:"shopee",
    upLabel:"上傳連結（Boss Sunny 貼文）", upPh:"https://...", srcBadge:"☀️", gt:"" },
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
  const v=vid(id)||{};   // 存檔位置由家族決定，要先把這一筆撈出來
  const video={ name:val(p+"_name").trim(), videoCopy:val(p+"_vcopy").trim(),
    driveFolder:familyDrive(v), publishedLink:val(p+"_pub").trim(), scheduledDate:val(p+"_date")||null };
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
  const warn=[!vidHasRaw(s)?T('毛片','raw footage'):'', !(s.driveFolder||s.publishedLink)?T('中文完成片','finished cut'):''].filter(Boolean).join(T('、',' & '));
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
        ${vidHasRaw(s)?`<a class="btn sm" href="${esc(vidRawLink(s))}" target="_blank">⬇ ${T("下載毛片","Download raw footage")}</a>`:''}
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
      <div>${familyDriveField(v,p+"_drive")}</div>
      <div><label>${T(C.upLabel,"Upload URL")}</label><input id="${p}_pub" value="${esc(v.publishedLink||"")}" placeholder="${C.upPh}"></div>
    </div>
    <label>${T("預排上片日期","Scheduled upload date")}</label>
    <div class="dateField"><span class="dateIco">🗓</span><input id="${p}_date" type="date" value="${esc(v.scheduledDate||"")}"></div>
`;
  const foot=`<div class="modalFoot">
      <button class="btn sec" type="button" onclick="closeModal()">${T("取消","Cancel")}</button>
      <button class="btn" type="button" onclick="chSaveVideo('${ch}','${id}').then(function(ok){if(ok)closeModal();})">${T("儲存","Save")}</button></div>`;
  MODAL_DIRTY=false; MODAL_SAVE=()=>chSaveVideo(ch,id);
  document.getElementById("modalRoot").innerHTML=`<div class="modal" onclick="modalBackdrop(event)"><div class="box" onclick="event.stopPropagation()" oninput="MODAL_DIRTY=true" onchange="MODAL_DIRTY=true">${head}${body}${reviewCardHTML(v)}${foot}</div></div>`;
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
  return src.map(v=>{
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
            <option value="">${PLUS()} ${T("加"+C.verName+" — 選帳號","Add "+C.verNameEn+" — pick account")}</option>
            ${accts.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join("")}
          </select>
          <button class="btn sm" style="flex:none" onclick="createChPick('${ch}','${v.id}')">${PLUS()} ${T("加入","Add")}</button>
        </div>`
      : accts.length===1
        ? `<div class="row" style="gap:6px;align-items:center;width:100%">${previewBtn}<button class="btn sm" style="flex:1" onclick="createChVersion('${ch}','${v.id}','${esc(jsEsc(accts[0]))}')">${PLUS()} ${T("加"+C.verName,"Add "+C.verNameEn)}</button></div>`
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
    ${list.length?`<table class="responsive daytbl"><thead><tr><th>${T("影片","Video")}</th><th>${T("狀態","Status")}</th><th>${T("剪輯","Editor")}</th><th>${T("上傳連結","Upload")}</th><th>${T("改期","Move to")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`:`<div class="emptyState"><span class="es-mk">✦</span>${T("這天這個帳號還沒有排片。到版本的編輯視窗填「預排上片日期」就會出現在這裡。","Nothing scheduled for this account on this day — set the scheduled upload date in a version's edit window.")}</div>`}
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
// 匯率／加乘讀取：讀不出合法數字時，**原封不動保留原本存著的那個數字**。
//
// 以前是 parseFloat(val(...)) → 空白或全形字就是 NaN → (rate>0?rate:1) → 悄悄存成 1。
// 後果是海外平台的售價把台幣數字掛上美金符號（10000 元變成 $10,000）—— 看起來很正常的錯，
// 沒有人會發現。改成 1 是最糟的選擇：它既不是使用者的意思，也不是原本的值。
//
// 為什麼不是直接擋下整份設定？因為匯率跟班表、密碼、標籤是同一顆「確認送出設定」，
// 為了一格匯率把管理員剛改好的班表一起退回去，比留著舊匯率更討厭。
// 所以：舊值照留、其他設定照存，然後用紅字明確告訴他哪一格沒吃進去。
const RATE_ROW_LABEL={en:"英文", th:"泰文", ms:"馬來", shopee:"蝦皮"};
function readRates(prev){
  const old=prev||{}; const rates={}; const bad=[];
  ["en","th","ms","shopee"].forEach(loc=>{
    const o=old[loc]||{};
    const keep={rate:(+o.rate>0?+o.rate:1), mult:(+o.mult>0?+o.mult:1)};
    const got={};
    ["rate","mult"].forEach(kind=>{
      if(loc==="shopee" && kind==="rate"){ got.rate=1; return; }   // 蝦皮＝台幣，畫面上沒有匯率欄
      const el=document.getElementById("set_"+kind+"_"+loc);
      if(!el){ got[kind]=keep[kind]; return; }                     // 這一格沒渲染出來就不管它，也不用警告
      const raw=String(el.value==null?"":el.value).trim();
      const n=Number(raw);   // 用 Number 不用 parseFloat："1.2abc" 要被擋掉，不能只取前面那段
      if(raw==="" || !isFinite(n) || n<=0){ got[kind]=keep[kind]; bad.push(RATE_ROW_LABEL[loc]+(kind==="rate"?"匯率":"加乘")); }
      else got[kind]=n;
    });
    rates[loc]={code:DEFAULT_CURRENCY[loc], rate:got.rate, mult:got.mult};
  });
  return {rates, bad,
    warn: bad.length ? ("「"+bad.join("」「")+"」沒有填成大於 0 的數字，那幾格維持原本的設定沒有變動") : ""};
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
  const sunnyAccountStr=(Array.isArray(s.sunnyAccounts)?s.sunnyAccounts:[]).join("\n");
  const sunnyTargetVal=(s.sunnyDailyTarget!=null&&s.sunnyDailyTarget!=="")?s.sunnyDailyTarget:2;
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
  </div>
  <div class="card"><b>Boss Sunny 設定</b>
    <div class="muted" style="font-size:12px;margin-top:4px">Boss Sunny 本來是一家獨立公司，但它需要的只是自己的一份上片行事曆 —— 所以改成跟蝦皮、馬來同一套：挑片重剪、上傳到自己的帳號、有自己的月排程。影片庫與編號跟主帳號共用。</div>
    <label style="margin-top:8px">Boss Sunny 帳號（一行一個）</label>
    <textarea id="set_bsyacct" style="min-height:88px" placeholder="Boss Sunny（@bosssunny）">${esc(sunnyAccountStr)}</textarea>
    <label style="margin-top:12px">Boss Sunny 每日目標（每個帳號每天幾支）</label>
    <div class="row" style="gap:8px"><input type="number" min="0" id="set_bsytarget" value="${sunnyTargetVal}" style="max-width:120px;text-align:center">
      <span class="muted">支／帳號／天 —— Boss Sunny 排程以此判斷「已排滿／缺幾支」。</span></div>
    <div class="modalFoot"><button class="btn" onclick="saveSettings()">確認送出設定</button></div>
  </div>`;
}
// 設定：成員名單（角色、改名、重設密碼、刪除）
function setMembersCard(members, memberRows){
  return `<div class="card"><b>成員（${members.length}）</b>
    <div class="muted" style="font-size:12px;margin-top:4px">權限：<b>管理員</b>＝最高(改設定、成員、回收桶、紀錄)；<b>經理人</b>＝可指派工作/影片、看排程與影片庫；<b>剪輯</b>＝接案剪片（含蝦皮/馬來二創區）；<b>巴基斯坦</b>＝全英文介面，挑台灣已上傳舊片做英/泰版上傳海外 TikTok；<b>行銷／客服／出貨／員工</b>＝只做交辦工作與每日匯報，不碰影片；<b>選品行銷</b>＝比照員工，額外多一頁「選品配對」（幫商品挑影片、送審），只有這個職位、經理人與管理員看得到；<b>人資</b>＝只看團隊看板，不能操作。</div>
    <table class="responsive" style="margin-top:8px"><thead><tr><th>名字</th><th>角色</th><th>區域</th><th>上下班</th><th></th></tr></thead>
    <tbody>${memberRows||`<tr><td class="muted">尚無成員</td></tr>`}</tbody></table>
    <div class="row" style="gap:8px;margin-top:12px"><input id="mb_name" placeholder="新增成員名字" style="flex:1;min-width:130px">
      <select id="mb_role" style="width:auto">${STAFF_ROLES.concat("manager").map(r=>`<option value="${r}">${esc(ROLE_LABEL[r])}</option>`).join("")}</select>
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

    <label style="margin-top:14px">海外同仁看到的英文說法（一行一個，格式「中文=English」）</label>
    <textarea id="set_dataen" rows="6" placeholder="寵粉=Fan perks&#10;吾家=Wu Jia&#10;官方IP=Official IP">${esc(Object.entries(Object.assign({}, DATA_EN, (s.dataEn||{}))).map(([k,v])=>k+"="+v).join("\n"))}</textarea>
    <div class="muted" style="font-size:12px;margin-top:4px">標籤、片源、影片類型這些是你自己設的中文，海外剪輯的畫面全是英文，混在裡面會很突兀。
      上面是內建的對照，可以改也可以加；沒列到的就照原樣顯示（品牌名、人名本來就不該硬翻）。</div>

    ${(()=>{ const list=brandList();
      return `<label style="margin-top:18px">公司／品牌</label>
      <div class="muted" style="font-size:12px;margin:-2px 0 6px">同一批剪輯服務好幾家公司時用。<b>人、出勤、交辦是共用的</b>（一天只上一次班），
        分開的只有影片庫、月排程、待認領、毛片庫存與成效。第一家是原本的資料，只能改名字不能刪。
        代號請用英文或數字（存進資料庫用的，之後不要再改）。</div>
      <table class="responsive"><thead><tr><th>代號</th><th>公司名稱</th><th style="width:120px">編號前綴</th><th style="width:130px">每日上片目標</th><th style="width:70px"></th></tr></thead>
      <tbody>${list.map((b,i)=>`<tr>
        <td data-label="代號">${i===0?'<span class="muted">（原本的）</span>'
          :`<input class="brd_id" value="${esc(b.id)}" placeholder="care" style="font-size:13px">`}</td>
        <td data-label="公司名稱"><input class="brd_name" value="${esc(b.name)}" style="font-size:13px"></td>
        <td data-label="編號前綴"><input class="brd_pfx" value="${esc(b.codePrefix||"")}" maxlength="6"
          placeholder="${i===0?"（不加）":"例 C"}" style="font-size:13px"></td>
        <td data-label="每日上片目標"><input class="brd_target" type="number" min="0" max="99" value="${b.dailyTarget||""}"
          placeholder="沿用上面的" style="font-size:13px"></td>
        <td data-label="">${i===0?'':`<button class="btn sec sm" onclick="this.closest('tr').remove()">✕</button>`}</td></tr>`).join("")}
      </tbody></table>
      <div class="row" style="gap:8px;margin-top:8px">
        <button class="btn sec sm" onclick="addBrandRow()">＋ 新增一家公司</button>
        <span class="muted" style="font-size:12px">刪掉一家不會刪影片 —— 那些片會回到第一家，之後把代號加回來就找得回來。</span>
      </div>`; })()}

    <label style="margin-top:14px">全公司出勤起算日（選填）</label>
    <div class="row" style="gap:8px;align-items:center">
      <input id="set_attstart" type="date" value="${esc(s.attendStart||"")}" style="max-width:180px">
      <span class="muted" style="font-size:12px">留白＝各人從自己設定密碼那天起算。填了就以這一天為準（兩者取比較晚的）。這一天之前的打卡只留著參考，不算遲到早退。</span>
    </div>
    <label style="margin-top:12px;display:flex;align-items:center;gap:8px">
      <input type="checkbox" id="set_pconly" ${s.pcOnly!==false?"checked":""} style="width:auto;margin:0"> 只能用電腦登入（一般員工不給手機登入；經理人／人資／管理員不受限）</label>
    ${(()=>{ const allow=mobileAllowList();
      const list=staffSorted((STATE.users||[]).filter(u=>STAFF_ROLES.includes(u.role||"editor")));
      if(!list.length) return "";
      return `<div style="margin:8px 0 0 24px">
        <div class="muted" style="font-size:12px">上面打開的時候，這裡勾到的人<b>可以</b>用手機打卡（外務、跑倉庫、外派用）。
          他們用手機打的卡不會被出勤報表標成異常，但裝置與 GPS 照常記錄。</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
          ${list.map(u=>`<label style="display:inline-flex;align-items:center;gap:5px;background:var(--panel2);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" class="mba_u" value="${esc(u.name)}" ${allow.includes(u.name)?"checked":""} style="width:auto;margin:0">
            ${esc(u.name)}<span class="muted" style="font-size:11px">${esc(ROLE_LABEL[u.role||"editor"]||"")}</span></label>`).join("")}
        </div></div>`; })()}
    <label style="margin-top:12px;display:flex;align-items:center;gap:8px">
      <input type="checkbox" id="set_attask" ${s.attIssueAsk===true?"checked":""} style="width:auto;margin:0"> 請員工說明出勤異常（遲到／早退／忘打下班）</label>
    <div class="muted" style="font-size:12px;margin-top:4px">預設關著。關著的時候員工的工作頁不會跳出「出勤異常待說明」，
      但上下班時間與登入的電子紀錄（裝置、手機與否、GPS）照常記錄，人資在出勤頁也照常看得到。
      上下班規則定好之後再打開，先前的紀錄不會遺失。</div>
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
    <div class="row" style="gap:8px;margin-top:12px"><input id="ct_name" placeholder="新增對接窗口名稱" style="flex:1;min-width:150px" onkeydown="if(enterKey(event))addContact()">
      <button class="btn" onclick="addContact()">＋ 新增窗口</button></div>
  </div>`;
}
function viewSettings(){
  const s=STATE.settings||{};
  const dailyTargetVal=(s.dailyTarget!=null&&s.dailyTarget!=="")?s.dailyTarget:daySumLegacy(today);
  const platStr=postPlatforms().map(p=>p.name+"="+p.utm).join("\n");
  const members=(STATE.users||[]).filter(u=>STAFF_ROLES.concat("manager").includes(u.role||"editor"));
  const ROLE_PICK=STAFF_ROLES.concat("manager");   // 可以指派的職位（管理員不在清單裡）
  const roleSel=(u)=>`<select onchange="setMemberRole('${esc(jsEsc(u.name))}',this.value)" style="width:auto;padding:4px 8px;font-size:13px">
      ${ROLE_PICK.map(r=>`<option value="${r}" ${(u.role||"editor")===r?"selected":""}>${esc(ROLE_LABEL[r])}</option>`).join("")}</select>`;
  // 剪輯才需要分工；管理員/經理人/人資固定看全部
  // 區域由職位決定（巴基斯坦＝海外，其餘＝台灣，管理層兩區都看），所以是唯讀顯示：
  // 要換區就改職位，只有一個真相來源
  const zoneCell=(u)=>{
    if(NO_EDIT_ROLES.includes(u.role)) return '<span class="muted" style="font-size:12px">不剪片</span>';
    // v142 拆掉分區之後每個人都看得到全部，這一欄改成寫「他是哪一邊的人」——
    // 那還是有意義的（誰在巴基斯坦），只是不再代表看得到什麼。
    return `<span class="muted" style="font-size:12px">${u.role==="intl"?"巴基斯坦":"台灣"}</span>`;
  };
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
    <td data-label="區域">${zoneCell(u)}</td>
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
    <input id="set_pw" type="password" autocomplete="new-password" placeholder="要改才填，留空＝維持原本的密碼">
    <div class="muted" style="font-size:12px;margin-top:4px">系統只留密碼的雜湊、不留原文，所以這裡不會顯示你目前的密碼。忘記的話只能從資料庫改。</div>
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
    <div class="row" style="gap:8px;margin-top:12px"><input id="tag_new" placeholder="新增標籤名稱" style="flex:1;min-width:150px" onkeydown="if(enterKey(event))addVideoTagSel()">
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
  const hit=(STATE.videos||[]).concat(STATE.deletedVideos||[])
    .filter(v=>(Array.isArray(v.tags)?v.tags:[]).includes("每日寵粉"));
  BULK_BUSY=true; let r={done:0,failed:0}; let setErr=false;
  try{
    r=await bulkRun(hit, v=>{ const nt=[...new Set(v.tags.map(t=>t==="每日寵粉"?"寵粉":t))];
      const patch={tags:nt}; if(v.subTag==="每日寵粉") patch.subTag="寵粉";
      return window.DB.update("videos",v.id,patch); });
    const cur=videoTags();
    if(cur.includes("每日寵粉")){
      try{ await window.DB.setSettings({[brandField("videoTags")]:[...new Set(cur.map(t=>t==="每日寵粉"?"寵粉":t))]}); }
      catch(e){ setErr=true; }   // 標籤清單沒改到＝下拉選單裡還會看到舊名字，要講
    }
  } finally { BULK_BUSY=false; applyState(LAST_RAW); }
  logA("整理標籤 每日寵粉→寵粉", r.done+" 支"+(r.failed?("（失敗 "+r.failed+" 支）"):""));
  await delay(300);
  if(setErr) toast("已改 "+r.done+" 支影片，但標籤清單本身沒更新成功，請再按一次",true);
  else bulkToast(r, "完成：已把 "+r.done+" 支影片的「每日寵粉」改成「寵粉」", "支");
}
async function convertExistingToTW(){ if(dbBlocked()) return;
  if(!__s2t){ toast("簡繁轉換尚未就緒（可能網路載入中），請稍候再試",true); return; }
  const vids=(STATE.videos||[]);
  if(!confirm("把現有 "+vids.length+" 支影片的標題與文案的簡體字轉成繁體存回？此動作會直接更新資料。")) return;
  // 先算出真的要改的（沒有簡體字的不必送出去），再一次批次寫
  const jobs=[];
  vids.forEach(v=>{ const patch={};
    ["name","rawName","videoCopy","note"].forEach(k=>{ const o=v[k]||""; const c=zhTW(o); if(c!==o) patch[k]=c; });
    if(Object.keys(patch).length) jobs.push({v, patch}); });
  BULK_BUSY=true; let r={done:0,failed:0};
  try{ r=await bulkRun(jobs, j=>window.DB.update("videos",j.v.id,j.patch)); }
  finally { BULK_BUSY=false; applyState(LAST_RAW); }
  logA("簡體轉繁體 "+r.done+" 支"+(r.failed?("（失敗 "+r.failed+" 支）"):""), "影片庫");
  await delay(300); bulkToast(r, "完成：已把 "+r.done+" 支影片的簡體字轉為繁體", "支");
}
async function saveSettings(){
  const plats=(val("set_plat")||"").split("\n").map(s=>s.trim()).filter(Boolean).map(line=>{
    const i=line.indexOf("="); const name=(i>=0?line.slice(0,i):line).trim(); const utm=(i>=0?line.slice(i+1):line).trim()||name; return {name,utm}; });
  const settings={ dailyTarget:parseInt(val("set_daily"))||0, scheduleHorizonDays:parseInt(val("set_horizon"))||30, shoplineBase:(val("set_shop")||"").trim() };
  let rateWarn="";
  // 管理員密碼：留空＝不改；要改的話存雜湊、把明文清掉（跟員工密碼同一套規則）
  const pw=(val("set_pw")||"").trim();
  if(pw){
    const err=pwRuleError(pw); if(err){ toast("管理員密碼："+err,true); return; }
    settings.adminPwHash=await pwMakeHash(pw); settings.adminPassword="";
  }
  if(document.getElementById("set_wstart")){
    settings.workStart=(val("set_wstart")||DEF_WORK.start);
    settings.workEnd=(val("set_wend")||DEF_WORK.end);
    settings.lateGraceMin=Math.max(0, parseInt(val("set_grace"))||0);
    settings.attendStart=(val("set_attstart")||"").trim();
    // 公司／品牌：第一列是原本那家（只存名字），其餘要有代號才算數
    { const ids=Array.from(document.querySelectorAll(".brd_id"));
      const names=Array.from(document.querySelectorAll(".brd_name"));
      const tgs=Array.from(document.querySelectorAll(".brd_target"));
      const pfx=Array.from(document.querySelectorAll(".brd_pfx"));
      if(names.length){
        settings.brandName=String(names[0].value||"").trim()||"泰熙爾札娜";
        settings.brandCodePrefix=String((pfx[0]&&pfx[0].value)||"").replace(/[^A-Za-z0-9-]/g,"").slice(0,6);
        const out=[], seen=new Set([""]);
        // 第一列沒有代號欄，所以 ids 比 names 少一個 —— 用 names 的索引往回推
        for(let i=1;i<names.length;i++){
          const id=String((ids[i-1]&&ids[i-1].value)||"").trim();
          const nm=String(names[i].value||"").trim();
          if(!id || !nm || seen.has(id)) continue;
          seen.add(id);
          out.push({id, name:nm, dailyTarget:+((tgs[i]&&tgs[i].value)||0)||0,
                    codePrefix:String((pfx[i]&&pfx[i].value)||"").replace(/[^A-Za-z0-9-]/g,"").slice(0,6)});
        }
        settings.brands=out;
      } }
    // 海外英文說法：一行一個「中文=English」；跟內建一樣的就不用另外存
    settings.dataEn=(val("set_dataen")||"").split("\n").reduce((acc,line)=>{
      const i=line.indexOf("="); if(i<0) return acc;
      const zh=line.slice(0,i).trim(), en=line.slice(i+1).trim();
      if(zh && en && DATA_EN[zh]!==en) acc[zh]=en;
      return acc; },{});
    // 每日固定工作：一行一件，「角色=內容」；角色寫錯或沒寫都當作「全部」
    settings.dailyTemplates=(val("set_tpl")||"").split("\n").map(line=>{
      const i=line.indexOf("="); const label=(i>=0?line.slice(0,i):"").trim(); const t=(i>=0?line.slice(i+1):line).trim();
      const hit=TPL_ROLES.find(p=>p[1]===label||p[0]===label);
      return {t, r:hit?hit[0]:"all"}; }).filter(x=>x.t);
    const pcEl=document.getElementById("set_pconly"); settings.pcOnly = pcEl? !!pcEl.checked : true;
    // 個別開放手機打卡：這一區只有出勤設定畫面才有，所以跟 set_pconly 綁在同一個 if 裡
    settings.mobileAllow = Array.from(document.querySelectorAll('.mba_u:checked')).map(x=>String(x.value||"").trim()).filter(Boolean);
    const aiEl=document.getElementById("set_attask"); settings.attIssueAsk = aiEl? !!aiEl.checked : false;
    const la=parseFloat(val("set_olat")), ln=parseFloat(val("set_olng"));
    settings.officeGeo=(isFinite(la)&&isFinite(ln))?{lat:la,lng:ln}:{};
  }
  if(plats.length) settings[brandField("postPlatforms")]=plats;
  // 海外設定：帳號清單（語言=帳號名）＋每帳號每日目標
  if(document.getElementById("set_intlacct")){
    settings.intlAccounts=(val("set_intlacct")||"").split("\n").map(s=>s.trim()).filter(Boolean).map(line=>{
      const i=line.indexOf("="); const loc=(i>=0?line.slice(0,i):"en").trim().toLowerCase(); const name=(i>=0?line.slice(i+1):line).trim();
      return {locale:loc, name}; }).filter(a=>a.name && ["en","th"].includes(a.locale));   // 只收 en/th；馬來帳號請填在「馬來設定」
    settings.intlDailyTarget=parseInt(val("set_intltarget"))||0;
    const rr=readRates((STATE&&STATE.settings||{}).exchangeRates);   // 讀不出來的那幾格保留原本的值，不會靜默變成 1
    settings.exchangeRates=rr.rates; rateWarn=rr.warn;
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
  // Boss Sunny 設定（v142：從一家公司降級成一條上片線）
  if(document.getElementById("set_bsyacct")){
    settings.sunnyAccounts=(val("set_bsyacct")||"").split("\n").map(s=>s.trim()).filter(Boolean);
    settings.sunnyDailyTarget=parseInt(val("set_bsytarget"))||0;
  }
  // 匯率有格子讀不出來的話，成功訊息要換成紅字警告 —— toast 只有一格，
  // 讓 writeAdmin 先跳「已更新設定」再被蓋掉的話，人只會看到後面那一則，
  // 所以乾脆不讓它跳，由我們自己講完整的那一句。
  const okSave=await writeAdmin("PUT","/api/settings",{settings}, rateWarn?"":"已更新設定");
  if(okSave && rateWarn) toast("設定已更新，但"+rateWarn, true);
}

// ===================================================================
// 成員管理（限管理員・併入設定頁）
// ===================================================================
function addMember(){ const name=val("mb_name").trim(); if(!name){ toast("請輸入名字",true); return; }
  const role=val("mb_role")||"editor";
  write("POST","/api/users",{name,role},"已新增成員（"+(ROLE_LABEL[role]||role)+"）"); }
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
function setMemberRole(name, role){ if(!STAFF_ROLES.concat("manager").includes(role)) return;
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
  return withAdmin(async ()=>{   // 回傳 promise：呼叫端（和測試）才等得到它真的做完
    // ⚠️ videosAll 不是 videos：STATE.videos 只有「目前這家公司」的片（v131 的品牌切片），
    // 拿它改名的話，同一個剪輯在另外兩家公司的片會永遠掛在舊名字上、而且沒有人會發現。
    // ⚠️ assignedTo 也要改：漏掉的話那支片會被鎖給一個不存在的人，誰都點不開（v124 的指派鎖）。
    const all=(STATE.videosAll||STATE.videos||[]);
    const jobs=[];
    all.forEach(v=>{ const patch={};
      if(v.editor===oldName) patch.editor=nn;
      if(v.claimedBy===oldName) patch.claimedBy=nn;
      if(v.assignedTo===oldName) patch.assignedTo=nn;
      if(Object.keys(patch).length) jobs.push({v, patch}); });
    BULK_BUSY=true; let r={done:0,failed:0}; let swapped=false, why="";
    try{
      // 順序很重要：先改影片、全部成功了才動 users。
      // 反過來做的話，中途失敗會讓「新名字已存在」，下次再按改名會被同名檢查擋住 —— 修不回來。
      // 先改影片的話，舊帳號原封不動還在，管理員直接再按一次改名就能把剩下的補完。
      r=await bulkRun(jobs, j=>window.DB.update("videos", j.v.id, j.patch));
      if(r.failed){ why="有 "+r.failed+" 筆影片沒改到"; }
      else{
        const u=(STATE.users||[]).find(x=>x.name===oldName)||{name:oldName};
        try{
          await window.DB.set("users", nn, Object.assign({}, u, {name:nn}));
          await window.DB.del("users", oldName);
          swapped=true;
        }catch(e){ why="影片都改好了，但帳號本身沒換過來"; }
      }
    } finally { BULK_BUSY=false; applyState(LAST_RAW); }
    if(!swapped){
      logA("成員改名未完成","「"+oldName+"」→「"+nn+"」（"+why+"）");
      await delay(300);
      toast("改名沒有完成："+why+"，帳號仍然是「"+oldName+"」。請檢查網路後再按一次改名",true);
      return;
    }
    logA("成員改名","「"+oldName+"」→「"+nn+"」");
    await delay(300); toast("已將「"+oldName+"」改名為「"+nn+"」（影片 "+r.done+" 筆同步）");
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
function postPlatforms(){ const p=brandSetting("postPlatforms"); return (Array.isArray(p)&&p.length)?p:DEFAULT_PLATFORMS; }
// 依平台一條導購連結，最短：只用 utm_source（月底靠訂單時間對應商品）
function platformUtm(base, utm){ if(!base) return ""; const sep=base.includes("?")?"&":"?"; return base+sep+"utm_source="+encodeURIComponent(utm||""); }
// 影片編號（無自訂 code 則取 id 數字，如 V001→001）；外顯片名以成品標題名稱為主
function vidCode(v){ return (v&&v.code) || String((v&&v.id)||"").replace(/^V/,""); }
// 清單上顯示的片名：把後面那一長串 #標籤 去掉，只留看得懂是哪一支的部分。
// 標籤是貼文用的，在清單裡只會把每一列撐成兩三行。完整的貼文文案在影片詳情
// 與編輯框裡照樣看得到（那兩處直接讀 v.name，不經過這裡），資料本身也不動。
function vidName(v){
  const raw=zhTW((v&&(v.name||v.rawName))||"");
  return stripHash(raw) || raw || T("(未命名)","(untitled)");   // 整串都是標籤時退回原文，不要變成空的
}
// 純文字場合（確認視窗、toast、操作紀錄）用這個：編號＋片名，一行講完是哪一支。
// 有版面的清單改用 vidName() 把片名放前面、編號用小灰字靠右（見 .vt-code）——
// 編號是系統流水號，每一列都長得差不多，擺在開頭會把真正要看的片名擠掉。
function vidTitle(v){
  const t=vidName(v), c=vidCode(v); return c?(c+" "+t):t;
}
// 已用過的商品名（下拉選用，讓品名一致）
function knownProducts(){ const set=new Set(); (STATE.videos||[]).forEach(v=>{ (v.products||[]).forEach(p=>{ if(p&&p.name) set.add(p.name); }); }); return [...set].sort(); }
// 商品列：最多 4 個，每個 品名(下拉)+單價(手動)
// 商品：以前固定攤開 4 列＝12 格，九成是空的，在手機上佔掉一大段。
// 改成有幾個商品就長幾列，沒有就一列都不長，要填再按「＋ 加商品」。
const PRODUCT_MAX=4;
function productRowHTML(prefix, i, p){
  p=p||{};
  return `<div class="row" style="gap:8px;margin-bottom:6px" id="${prefix}_prow${i}">
      <input id="${prefix}_pn${i}" list="${prefix}_plist" value="${esc(p.name||"")}" oninput="autoPamperTag('${prefix}')" placeholder="${T("商品 "+(i+1)+"（品名）","Product "+(i+1)+" (name)")}" style="flex:2;min-width:130px">
      <input id="${prefix}_pp${i}" type="number" min="0" value="${(p.price!=null&&p.price!=="")?esc(p.price):''}" placeholder="${T("原價","List price")}" style="flex:1;min-width:80px">
      <input id="${prefix}_ps${i}" type="number" min="0" value="${(p.salePrice!=null&&p.salePrice!=="")?esc(p.salePrice):''}" placeholder="${T("售價(寵粉價)","Fan price")}" style="flex:1;min-width:100px">
    </div>`;
}
function productRows(prefix, products){
  const ps=(Array.isArray(products)?products:[]).filter(p=>p&&p.name).slice(0,PRODUCT_MAX);
  return `<label>${T("銷售商品（最多 4 個・選填）","Products (up to 4, optional)")}</label>
    <div id="${prefix}_prows">${ps.map((p,i)=>productRowHTML(prefix,i,p)).join("")}</div>
    <button type="button" class="btn sm sec" id="${prefix}_padd" style="${ps.length>=PRODUCT_MAX?'display:none':''}"
      onclick="addProductRow('${esc(jsEsc(prefix))}')">${PLUS()} ${T("加商品","Add product")}</button>
    <datalist id="${prefix}_plist">${knownProducts().map(n=>`<option value="${esc(n)}">`).join("")}</datalist>`;
}
// 按一下長一列；滿 4 列就把按鈕收起來
function addProductRow(prefix){
  const box=document.getElementById(prefix+"_prows"); if(!box) return;
  let i=0; while(i<PRODUCT_MAX && document.getElementById(prefix+"_prow"+i)) i++;
  if(i>=PRODUCT_MAX) return;
  box.insertAdjacentHTML("beforeend", productRowHTML(prefix,i,null));
  if(i+1>=PRODUCT_MAX){ const b=document.getElementById(prefix+"_padd"); if(b) b.style.display="none"; }
  const f=document.getElementById(prefix+"_pn"+i); if(f&&f.focus) f.focus();
}
function collectProducts(prefix){ const out=[];
  for(let i=0;i<PRODUCT_MAX;i++){ const name=(val(prefix+"_pn"+i)||"").trim(); if(!name) continue;
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
  // 確認鍵：按下去到做完之間先鎖住（避免連點兩次做兩遍），而且**絕不能靜靜失敗** ——
  // 原本 onConfirm 一丟例外，closeModal 就不會跑，畫面完全沒反應，
  // 使用者看到的就是「這顆按鈕點不下去」，然後開始重整、重按、找人問。
  if(onConfirm){ const btn=document.getElementById("modalConfirm");
    btn.onclick=async()=>{
      if(btn.disabled) return;
      btn.disabled=true; const label=btn.textContent; btn.textContent=T("處理中…","Working…");
      try{ const r=await onConfirm(); if(r!==false) closeModal(); }
      catch(e){ toast(T("這個動作沒有完成："+((e&&e.message)||e), "That didn't go through: "+((e&&e.message)||e)), true); }
      finally{ if(btn.isConnected){ btn.disabled=false; btn.textContent=label; } }
    }; }
}
// 改到一半想離開時的提醒（× 鍵與點視窗外都用這一則，講法一致）
function warnUnsaved(){ toast(T("還沒存檔喔 —— 請按「儲存修改」，不要的話按「取消編輯」",
  "Not saved yet — press Save, or Cancel to discard"), true); }
// 點視窗外（背景）即可關閉；但只要動過任何欄位就不關，並且要講出來為什麼沒關 ——
// 原本是靜靜不理，使用者會以為系統當掉，然後直接重整把改的東西丟掉。
function modalBackdrop(e){ if(e.target&&e.target.classList&&e.target.classList.contains("modal")){ if(MODAL_DIRTY){ warnUnsaved(); return; } closeModal(); } }
// 目前開著的編輯視窗要怎麼存。視窗內的動作鍵（審片、移到今日工作…）在關掉視窗之前
// 先用它把還沒存的欄位收起來 —— 不然使用者剛打的字會被靜默丟掉。
let MODAL_SAVE=null;
let MODAL_VID="";   // 目前這個編輯視窗在編哪一支（重畫「排到哪本月曆」那一塊要用）
// 有沒存的東西就先存。存不起來（例如商品與網址沒配對）回 false，呼叫端要停手。
async function modalFlushEdits(){
  if(!MODAL_DIRTY || typeof MODAL_SAVE!=="function") return true;
  const ok=await MODAL_SAVE();
  if(ok===false) return false;
  MODAL_DIRTY=false; return true;
}
// 視窗內的動作鍵共用：沒東西要存就直接做（維持同步），有才先存完再做。
// 存不起來就停手，不然使用者剛打的字會被關掉的視窗帶走。
function afterFlush(fn){
  if(!MODAL_DIRTY || typeof MODAL_SAVE!=="function"){ fn(); return; }
  modalFlushEdits().then(ok=>{ if(ok) fn(); });
}
function closeModal(){ MODAL_DIRTY=false; MODAL_SAVE=null; document.getElementById("modalRoot").innerHTML=""; }

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
  {oc:"odAdd",           title:"排入這一天", text:"把選好的影片排到這一天。還沒播過的＝設定它的預排上片日（沒剪完也可以先排）；舊片＝排成重播。"},
  {oc:"openDay",         title:"打開這一天", text:"查看這天要上的影片、調整上片日，或把別支影片排進來。"},
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
  if(TUT_ON){ if(ban){
    // 橫幅上直接放一顆關閉鍵：這是教學模式裡最好找、也最不會被擋到的出口。
    // 只寫「再按一次教學關閉」不夠 —— 那顆藏在齒輪選單裡，找不到的人就卡住了。
    // 文字寫短一點，關閉鍵才跟它同一行 —— 被擠到第二行的按鈕看起來像另一件事
    ban.innerHTML='<span>教學模式：把游標停在任何按鈕上看說明（點下去不會真的執行）</span>'
      + '<button id="tutOff" onclick="toggleTutorial()">關閉教學</button>';
    ban.classList.remove("hidden"); } }
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
  // ⚠️ 出口一定要放行，而且是「整條路」都要放行。
  // 原本只放行 #tutBtn，但那顆在齒輪選單裡 —— 齒輪自己也是 button，一樣被擋掉，
  // 選單根本打不開，於是教學模式**開了就關不掉**（回報：新手教學按了以後關不掉）。
  // 現在放行：關閉鍵、齒輪、整個齒輪選單、以及底部橫幅上的關閉鍵。
  if(e.target.closest("#tutBtn, #tutOff, #hgearBtn, .hmenu")) return;
  const act=e.target.closest('button,a,input,select,textarea,.vtab,[data-tab],td[onclick]');
  if(!act) return;
  e.preventDefault(); e.stopPropagation();
  tutShowFor(e.target);
}, true);
// 再給一條退路：按 Esc 直接離開教學模式（滑鼠點不到的時候至少鍵盤救得回來）
document.addEventListener("keydown", function(e){ if(TUT_ON && e.key==="Escape") toggleTutorial(); });
