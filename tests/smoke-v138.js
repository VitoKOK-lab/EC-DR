// v138：選品配對 —— 選品行銷從「商品」出發，幫商品配一支影片，送老闆審核；
// 老闆核准其中一支（主選或備選）之後，正式建立「1 商品 → 1 影片」配對。
//
// 這支測試釘住幾條「壞掉不會有人發現」的路：
// ① 新職位「選品行銷」只讓它、經理人（Regina）、管理員看得到「選品配對」分頁，其他角色一律看不到。
// ② 「建立並送審」是一次寫入（submit:true），不是「先建立、再回頭找剛剛的 id 送審」——
//    後者在這個架構下行不通：write() 不回傳新文件的 id，兩趟寫入就會對不上同一筆。
// ③ 已送審／已核准的配對不能再用 PUT 偷改欄位，只能新建一筆。
// ④ 核准時選的影片一定要是那筆配對的主選或備選，不能亂塞其他影片 id。
// ⑤ 核准後正式配對寫回商品（products.activeVideoId），且「等待選品中」是即時算出來的
//    （沒有任何商品把它訂為正式配對影片），不是存在影片身上的旗標——不會兩邊兜不起來。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,isConnected:true,scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
// showModal 是用 getElementById("modalConfirm").onclick 掛確認鍵的，每次都回新元素的話 handler 會掉在地上
const confirmBtn=el();
async function MODAL_CONFIRM(){ if(typeof confirmBtn.onclick==="function") return await confirmBtn.onclick(); }
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(id==="modalConfirm") return confirmBtn;
    const e=el(); if(fields[id]!=null) e.value=fields[id];
    if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let writes=[], toasts=[], errToasts=[];
toast=(m,isErr)=>{ toasts.push(String(m)); if(isErr) errToasts.push(String(m)); };

// 假的 window.DB：把寫入記下來，並且真的把資料寫回 STATE（模擬 onSnapshot 同步回來），
// 這樣才能連續呼叫（建立→送審→核准）並驗證下一步看到的是上一步寫入後的狀態。
function applyWrite(kind,c,id,data){
  const arr=STATE[c]||(STATE[c]=[]);
  if(kind==="set"){ const i=arr.findIndex(x=>x.id===id); const rec=Object.assign({id},data);
    if(i>=0) arr[i]=rec; else arr.push(rec); }
  else if(kind==="update"){ const i=arr.findIndex(x=>x.id===id); if(i>=0) Object.assign(arr[i],data); }
  else if(kind==="del"){ const i=arr.findIndex(x=>x.id===id); if(i>=0) arr.splice(i,1); }
}
function reset(videos){
  modalHTML=""; viewEl.innerHTML=""; writes=[]; toasts=[]; errToasts=[]; fields={};
  global.window.DB={
    set:async(c,id,o)=>{ writes.push(["set",c,id,o]); applyWrite("set",c,id,o); },
    update:async(c,id,p)=>{ writes.push(["update",c,id,p]); applyWrite("update",c,id,p); },
    del:async(c,id)=>{ writes.push(["del",c,id]); applyWrite("del",c,id); },
    scheduleSet:async()=>{}, setSettings:async()=>{} };
  const raw={ users:[{name:"Amy",role:"pick"}, {name:"Regina",role:"manager"}, {name:"管理員",role:"boss"},
                     {name:"小葵",role:"editor"}, {name:"阿華",role:"mkt"}],
    settings:{dailyTarget:4,videoTags:["新片","舊片"],sources:["自製"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[], products:[], matches:[] };
  LAST_RAW=raw; STATE=decorate(raw);
  CUR_TAB=null; VIEW_AS=null; BRAND="";
  MATCH_PRODUCT_ID=null; MATCH_PRIMARY_ID=null; MATCH_BACKUP_ID=null; MATCH_EDITING_ID=null;
  MATCH_VTAB="done"; MATCH_VQ=""; MATCH_VFILTER="awaiting";
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }
async function throws(fn){ try{ await fn(); return null; }catch(e){ return e.message; } }

// 一支「已完成」的影片（拍過、上片流程算完成）與一支「僅有腳本」的影片
const doneVid=(id,o)=>Object.assign({id,code:id,name:"完成片"+id,rawName:"毛片"+id,videoCopy:"文案"+id,
  rawLink:"http://raw/"+id,stage:"已完成",published:true,editor:"",claimedBy:"",assignedTo:"",
  scheduledDate:null,finishedAt:"2026-06-01T09:00:00",publishedLink:"",driveFolder:"http://drive/"+id,
  reviewStatus:"",locale:"",channel:"",origLang:"",cover:"",remakes:[],tags:[],products:[],
  usageHistory:[],metrics:[]}, o||{});
const scriptVid=(id,o)=>Object.assign({}, doneVid(id,o), {id,code:id,name:"腳本片"+id,rawName:"腳本片"+id,
  rawLink:"",stage:"待處理",published:false,finishedAt:"",driveFolder:""}, o||{});

(async()=>{

// ══════════ ① 新職位「選品行銷」：存在、標籤正確、只有它／經理人／管理員看得到「選品配對」 ══════════
{ reset();
  ok("選品行銷職位存在", ROLE_LABEL.pick==="選品行銷");
  ok("選品行銷是不剪片職位", NO_EDIT_ROLES.includes("pick"));
  ok("選品行銷會打卡／進團隊看板（STAFF_ROLES）", STAFF_ROLES.includes("pick"));
  ok("原本的職位沒被動到", ROLE_LABEL.mkt==="行銷" && ROLE_LABEL.boss==="管理員" && ROLE_LABEL.manager==="經理人"); }
{ reset(); as("Amy","pick");
  const tabs=myTabs().map(t=>t[0]);
  ok("選品行銷分頁＝本日工作／團隊看板／選品配對", JSON.stringify(tabs)===JSON.stringify(["work","team","match"])); }
{ reset(); as("管理員","boss"); ok("管理員看得到選品配對分頁", myTabs().some(t=>t[0]==="match")); }
{ reset(); as("Regina","manager"); ok("經理人（Regina）看得到選品配對分頁", myTabs().some(t=>t[0]==="match")); }
{ reset(); as("小葵","editor"); ok("剪輯看不到選品配對分頁", !myTabs().some(t=>t[0]==="match")); }
{ reset(); as("阿華","mkt"); ok("一般行銷（非選品行銷）看不到選品配對分頁", !myTabs().some(t=>t[0]==="match")); }
// 真正的守門在畫面本身，不只是分頁不出現（見 editVideo 上面同樣的原則）
{ reset(); as("小葵","editor");
  const h=viewMatch();
  ok("就算硬切到這一頁，剪輯看到的是沒有權限，不是真的畫面", h.includes("沒有") && !h.includes("選擇商品")); }

// ══════════ ② 建立商品 ══════════
{ reset(); as("Amy","pick");
  const msg=await throws(()=>route("POST","/api/products",{product:{}}));
  ok("商品名稱空白擋下來", msg==="請輸入商品名稱"); }
{ reset(); as("Amy","pick");
  await route("POST","/api/products",{product:{name:"祖母綠戒指",sku:"EMR-R001"}});
  const p=STATE.products[0];
  ok("商品建立成功", !!p && p.name==="祖母綠戒指" && p.sku==="EMR-R001");
  ok("新商品預設尚未正式配對", p.activeVideoId===""); }

// ══════════ ③ 建立配對：一次「建立並送審」，不用兩趟湊 id ══════════
{ reset(); as("Amy","pick");
  const msg=await throws(()=>route("POST","/api/matches",{match:{}}));
  ok("沒選商品就建立配對會擋下來", msg==="請先選擇商品"); }
{ reset([doneVid("V1"), doneVid("V2")]); as("Amy","pick");
  await route("POST","/api/products",{product:{name:"祖母綠戒指"}});
  const pid=STATE.products[0].id;
  const msg=await throws(()=>route("POST","/api/matches",{match:{productId:pid}, submit:true}));
  ok("一次送審但沒選主選影片會擋下來", msg==="請先選擇主選影片"); }
{ reset([doneVid("V1"), doneVid("V2")]); as("Amy","pick");
  await route("POST","/api/products",{product:{name:"祖母綠戒指"}});
  const pid=STATE.products[0].id;
  await route("POST","/api/matches",{match:{productId:pid,primaryVideoId:"V1",backupVideoId:"V2",
    suggestedCopyEdit:"換片尾CTA",suggestedLaunchDate:"2026-06-01"}, submit:true});
  const m=STATE.matches[0];
  ok("一次寫入就直接是 submitted 狀態（不是先 draft 再等第二趟）", !!m && m.status==="submitted");
  ok("送審人記到自己", m.submittedBy==="Amy" && !!m.submittedAt);
  ok("只有一趟 set 寫入 matches（不是兩趟）", writes.filter(w=>w[1]==="matches").length===1); }

// ══════════ ④ 已送審／已核准的配對不能再用 PUT 偷改 ══════════
{ reset([doneVid("V1"), doneVid("V2")]); as("Amy","pick");
  await route("POST","/api/products",{product:{name:"P"}});
  const pid=STATE.products[0].id;
  await route("POST","/api/matches",{match:{productId:pid,primaryVideoId:"V1"}, submit:true});
  const mid=STATE.matches[0].id;
  const msg=await throws(()=>route("PUT",`/api/matches/${mid}`,{match:{suggestedCopyEdit:"偷改"}}));
  ok("送審中不能用 PUT 改欄位", /已送審或已核准/.test(msg||"")); }
{ reset([doneVid("V1")]); as("Amy","pick");
  await route("POST","/api/products",{product:{name:"P"}});
  const pid=STATE.products[0].id;
  await route("POST","/api/matches",{match:{productId:pid}}); // 草稿，還沒送審
  const mid=STATE.matches[0].id;
  ok("草稿狀態存進去是 draft", STATE.matches[0].status==="draft");
  await route("PUT",`/api/matches/${mid}`,{match:{primaryVideoId:"V1",suggestedCopyEdit:"改一下"}});
  ok("草稿可以用 PUT 改欄位", STATE.matches[0].primaryVideoId==="V1" && STATE.matches[0].suggestedCopyEdit==="改一下");
  const msg=await throws(()=>route("POST",`/api/matches/${mid}/submit`,{}));
  ok("這裡沒問題（有主選影片才送得出去，前面已經補上了）", msg===null); }

// ══════════ ⑤ 核准：只能選主選或備選，核准後正式寫回商品 ══════════
{ reset([doneVid("V1"), doneVid("V2"), doneVid("V3")]); as("Amy","pick");
  await route("POST","/api/products",{product:{name:"祖母綠戒指"}});
  const pid=STATE.products[0].id;
  await route("POST","/api/matches",{match:{productId:pid,primaryVideoId:"V1",backupVideoId:"V2"}, submit:true});
  const mid=STATE.matches[0].id;
  as("Regina","manager");
  const msg=await throws(()=>route("POST",`/api/matches/${mid}/approve`,{finalVideoId:"V3"}));
  ok("核准的影片不是主選也不是備選，擋下來", msg==="核准的影片必須是主選或備選影片");
  await route("POST",`/api/matches/${mid}/approve`,{finalVideoId:"V2"}); // 選備選
  const m=STATE.matches[0];
  ok("核准後狀態變 approved、記下最終影片是備選", m.status==="approved" && m.finalVideoId==="V2");
  ok("核准人記到 Regina", m.reviewedBy==="Regina" && !!m.reviewedAt);
  ok("正式配對：商品的 activeVideoId 指向核准的那支（備選）", STATE.products[0].activeVideoId==="V2"); }

// ══════════ ⑥ 退回：狀態變 rejected，附上原因，選品行銷可以修改後重新送審 ══════════
{ reset([doneVid("V1")]); as("Amy","pick");
  await route("POST","/api/products",{product:{name:"P"}});
  const pid=STATE.products[0].id;
  await route("POST","/api/matches",{match:{productId:pid,primaryVideoId:"V1"}, submit:true});
  const mid=STATE.matches[0].id;
  as("管理員","boss");
  await route("POST",`/api/matches/${mid}/reject`,{bossNote:"文案再修一下"});
  const m=STATE.matches[0];
  ok("退回狀態＋原因", m.status==="rejected" && m.bossNote==="文案再修一下");
  ok("退回的配對可以再用 PUT 修改（不是死路）",
     !(await throws(()=>route("PUT",`/api/matches/${mid}`,{match:{suggestedCopyEdit:"改好了"}})))); }

// ══════════ ⑦ 「等待選品中」是即時算出來的，不是存在影片上的旗標 ══════════
{ reset([doneVid("V1"), doneVid("V2")]); as("Amy","pick");
  ok("還沒有任何商品配對時，兩支都等待選品中",
     videoAwaitingCuration(STATE.videos[0]) && videoAwaitingCuration(STATE.videos[1]));
  await route("POST","/api/products",{product:{name:"P"}});
  const pid=STATE.products[0].id;
  await route("POST","/api/matches",{match:{productId:pid,primaryVideoId:"V1"}, submit:true});
  const mid=STATE.matches[0].id;
  as("Regina","manager");
  await route("POST",`/api/matches/${mid}/approve`,{finalVideoId:"V1"});
  ok("V1 被正式配對後不再等待選品中", !videoAwaitingCuration(vid("V1")));
  ok("V2 沒被配對，還是等待選品中", videoAwaitingCuration(vid("V2"))); }

// ══════════ ⑧ 已完成／僅有腳本 分類沿用既有的 isPublished／vidNotShot 標準，不是另開一套 ══════════
{ reset([doneVid("D1"), scriptVid("S1")]);
  ok("已完成影片：matchVidDone 是、matchVidScript 不是", matchVidDone(vid("D1")) && !matchVidScript(vid("D1")));
  ok("僅有腳本：matchVidScript 是、matchVidDone 不是", matchVidScript(vid("S1")) && !matchVidDone(vid("S1"))); }

// ══════════ ⑨ 畫面渲染：三個看得到的角色都能正常畫出來，不會炸 ══════════
// 直接呼叫 viewMatch()（不走 render()）：跟 smoke-v137 同一個原則——
// render() 會先擋「請先設定密碼」的關卡，測試假使用者沒有 pwHash 一定會卡在那一關，
// 畫面邏辯本身要驗證的是 view 函式，不是密碼關卡。
{ reset([doneVid("V1"), scriptVid("S1")]);
  await route("POST","/api/products",{product:{name:"祖母綠戒指",sku:"EMR-R001"}});
  const pid=STATE.products[0].id;
  await route("POST","/api/matches",{match:{productId:pid,primaryVideoId:"V1"}, submit:true});
  as("Amy","pick");
  let h="", threw=false; try{ h=viewMatch(); }catch(e){ threw=true; console.log(e); }
  ok("選品行銷視角渲染不會炸", !threw);
  ok("選品行銷看得到自己的配對紀錄，看不到別人審核用的待審佇列標題", h.includes("配對紀錄") && !h.includes("待你審核"));
  as("Regina","manager");
  threw=false; try{ h=viewMatch(); }catch(e){ threw=true; console.log(e); }
  ok("經理人視角渲染不會炸", !threw);
  ok("經理人看得到待審核佇列", h.includes("待你審核") && h.includes("祖母綠戒指")); }

// ══════════ ⑩ 選片／選商品的畫面互動：設主選、設備選、切換不會互相打架 ══════════
{ reset([doneVid("V1"), doneVid("V2")]); as("Amy","pick");
  await route("POST","/api/products",{product:{name:"P"}});
  MATCH_PRODUCT_ID=STATE.products[0].id;
  setMatchVideo("primary","V1");
  ok("設為主選", MATCH_PRIMARY_ID==="V1");
  setMatchVideo("backup","V1");
  ok("同一支不能同時是主選又是備選——設備選會把主選讓出來", MATCH_BACKUP_ID==="V1" && MATCH_PRIMARY_ID===null);
  setMatchVideo("primary","V2");
  ok("再設另一支為主選", MATCH_PRIMARY_ID==="V2" && MATCH_BACKUP_ID==="V1"); }

// ══════════ ⑪ 貼商品網址自動抓：解析 og:title／og:image／JSON-LD sku（純字串解析，離線可測） ══════════
{ const html = `<!doctype html><html><head>
    <title>備用標題（沒有 og:title 才會用到）</title>
    <meta property="og:title" content="祖母綠戒指 &amp; 純銀托座">
    <meta property="og:image" content="https://shop.example.com/img/r001.jpg">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"祖母綠戒指","sku":"EMR-R001","image":"https://shop.example.com/img/r001-ld.jpg"}</script>
  </head><body></body></html>`;
  const meta = parseProductMetaHTML(html);
  ok("抓到 og:title（HTML 實體要還原成文字）", meta.name==="祖母綠戒指 & 純銀托座");
  ok("抓到 og:image", meta.image==="https://shop.example.com/img/r001.jpg");
  ok("抓到 JSON-LD 裡的 sku", meta.sku==="EMR-R001"); }
{ const html = `<html><head><title>只有標題的網站</title></head><body></body></html>`;
  const meta = parseProductMetaHTML(html);
  ok("沒有 og:title 時退回 <title>", meta.name==="只有標題的網站");
  ok("抓不到圖片就是空字串，不是 undefined／null", meta.image==="");
  ok("抓不到 sku 就是空字串", meta.sku===""); }
{ const html = `<html><head><script type="application/ld+json">not valid json{{{</script></head></html>`;
  let threw=false, meta=null;
  try{ meta=parseProductMetaHTML(html); }catch(e){ threw=true; }
  ok("JSON-LD 壞掉不會讓整個解析炸掉", !threw && meta && meta.sku===""); }
{ ok("空字串／undefined 輸入不會炸", (()=>{ try{ parseProductMetaHTML(); parseProductMetaHTML(""); return true; }catch(e){ return false; } })()); }

// ══════════ ⑫ 選片優先推薦「影片庫大流」，庫A用搜尋補 ══════════
const dfVid=(id,o)=>Object.assign(doneVid(id,o), {lib:"大流"});
{ reset([dfVid("D1",{name:"大流成品一"}), doneVid("V1",{name:"庫A完成片一"})]);
  ok("大流的片有進到 STATE.videosDF", (STATE.videosDF||[]).some(v=>v.id==="D1"));
  ok("大流的片不會混進 STATE.videos（生產面數字才不會被大流污染）", !(STATE.videos||[]).some(v=>v.id==="D1"));
  MATCH_VTAB="done"; MATCH_VFILTER="all"; MATCH_VQ="";
  const html=matchVideoListHTML();
  ok("選片清單看得到大流的片", html.includes("大流成品一"));
  ok("選片清單也看得到庫A的片（不是只剩大流）", html.includes("庫A完成片一"));
  ok("大流的片排在庫A前面", html.indexOf("大流成品一") < html.indexOf("庫A完成片一"));
  ok("大流的片標了「大流」徽章", html.includes('color:var(--gold-dk)">大流<')); }
{ reset([dfVid("D1",{name:"大流成品一"})]);
  ok("大流的片一樣算「等待選品中」（沒有商品訂它就是等待中）", videoAwaitingCuration(STATE.videosDF[0]));
  await route("POST","/api/products",{product:{name:"P"}});
  const pid=STATE.products[0].id;
  await route("POST","/api/matches",{match:{productId:pid,primaryVideoId:"D1"}, submit:true});
  as("Regina","manager");
  await route("POST",`/api/matches/${STATE.matches[0].id}/approve`,{finalVideoId:"D1"});
  ok("大流的片核准後一樣正式配對、不再等待選品中",
     STATE.products[0].activeVideoId==="D1" && !videoAwaitingCuration(vid("D1"))); }

// ══════════ ⑬ 新職位不能在既有的「職位清單」畫面裡悄悄消失 ══════════
// 教訓：新增 pick 職位那次只顧著加 ROLE_LABEL／ROLE_TABS，app.js 裡另外還有幾處
// 手動列出「哪些職位」的陣列（登入頁分組、儀表板員工視角、指派交辦）沒有跟著補，
// 結果選品行銷的人登入頁按鈕整個不見、管理員也選不到他們做員工視角預覽。
// 這裡把「加一個新職位」的檢查釘死，以後再加職位漏了哪一處，這支測試會紅。
{ reset([]); as("Amy","pick");
  const g = staffOptGroups(STAFF_ROLES.concat("manager"));
  ok("staffOptGroups 有選品行銷的分組標籤", g.includes('label="選品行銷"'));
  ok("選品行銷的人出現在該分組底下", g.includes(">Amy<")); }
{ reset([]); as("Amy","pick"); as("管理員","boss");
  const h = dashViewAsCard();
  ok("儀表板「員工視角」選得到選品行銷（這次回報的原始 bug）", h.includes('label="選品行銷"') && h.includes(">Amy<")); }
{ reset([]); as("Amy","pick");
  const h = dashAssignTaskCard();
  ok("「指派交辦給員工」選得到選品行銷（選品行銷跟員工一樣走交辦流程）", h.includes('label="選品行銷"') && h.includes(">Amy<")); }
{ ok("STAFF_GROUPS（登入頁分組）含 pick，選品行銷的登入按鈕才畫得出來",
     STAFF_GROUPS.some(([,,,roles])=>roles.includes("pick"))); }
{ ok("noticeTargetRoles(\"__twmake__\") 含 pick，HR 發整區通知才發得到選品行銷",
     noticeTargetRoles("__twmake__").includes("pick")); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
