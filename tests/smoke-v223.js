// v223：老闆一次回報四件事，這一支對應第三件 ——
// 「在『缺上片連結、缺文案、缺商品與連結』這三個提示，點下去時，要能夠自動打開視窗，
//  遊標要自動移到該輸入的位置」。
//
// 其餘三件分別由這些支測試守：
//   「172 支未建檔的怎麼快速補進系統」→ 按鍵改名＋商品欄位：tests/smoke-v205.js
//   「帶貨商品排行點影片名稱跳不過去」→ jsEsc 包錯：tests/smoke-v205.js
//
// 這一支只測「點缺失提示直接跳到欄位」：
//   ① missingPill 只有「缺上片連結／缺文案／缺商品與連結」三種點得動，
//      其餘（缺毛片／沒排日期／缺存檔連結）維持原樣不能點 —— 那幾項沒有
//      單一對應的輸入欄位可以跳，硬點只會跳到不相干的地方。
//   ② 二創殼／海外／蝦皮／馬來（isVersion）一律不能點 —— 它們走別的視窗
//      （openChModal／openIntlModal，欄位 id 不一樣），套用 editVideo 會開錯視窗。
//   ③ 點下去真的會：開視窗、把收起來的那一折打開、游標移過去（focus）、捲過去。
const fs=require("fs"), path=require("path");
const RAW=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=RAW.replace(/^let /gm,"").replace(/^const /gm,"");

// 節點要能跨呼叫保留身分（同一個 id 每次 getElementById 拿到同一個物件），
// jumpToField 才驗得出「真的對那個節點呼叫了 focus()／打開了那個 <details>」——
// 如果每次都回傳新物件，設在上面的東西下一秒就跟丟了，等於測不到任何事。
const NODES={};
let FOCUS_LOG=[], SCROLL_LOG=[];
function makeNode(id){
  return { id, value:"", innerHTML:"", textContent:"", className:"", style:{}, checked:false, open:false,
    tagName:"DIV", dataset:{}, disabled:false, readOnly:false, isConnected:true, scrollTop:0, rows:1,
    classList:{ _s:new Set(), toggle(c){this._s.has(c)?this._s.delete(c):this._s.add(c);}, add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);} },
    addEventListener(){}, appendChild(){}, querySelector(){return null;}, querySelectorAll(){return [];},
    getAttribute(){return null;}, setAttribute(){}, closest(){return null;},
    focus(){ FOCUS_LOG.push(id); }, click(){}, scrollIntoView(){ SCROLL_LOG.push(id); },
    insertAdjacentHTML(p,h){ this.innerHTML+=h; }, getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};} };
}
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="";
global.document={getElementById:(id)=>{
    if(id==="modalRoot"){
      if(!NODES.modalRoot){ const n=makeNode("modalRoot");
        Object.defineProperty(n,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}}); NODES.modalRoot=n; }
      return NODES.modalRoot;
    }
    return NODES[id] || (NODES[id]=makeNode(id)); },
  get activeElement(){return null;}, addEventListener(){}, createElement:()=>makeNode(""),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null, querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;} else {fail++;console.log("FAIL  "+n, x===undefined?"":JSON.stringify(x).slice(0,300));} }
let TOASTS=[]; toast=(m,e)=>{ TOASTS.push(String(m||"")); };

const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const DAY=(off)=>{ const d=new Date(FROZEN+"T00:00:00"); d.setDate(d.getDate()+off); return d.toISOString().slice(0,10); };

const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"片"+id,rawName:"原始"+id,videoCopy:"有文案",nameEn:"",videoCopyEn:"",
  rawLink:"http://raw",lib:"",stage:"已完成",editor:"小葵",claimedBy:"小葵",assignedTo:"",scheduledDate:null,
  finishedAt:FROZEN+"T10:00:00",publishedLink:"",driveFolder:"http://d",reviewStatus:"通過",locale:"",channel:"",
  origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],publishTime:"10:00",tags:[],products:[],
  usageHistory:[],metrics:[],note:"",refLink:"",productUrl:"",source:"官方IP",deleted:false}, o||{});
function reset(videos, who, role){
  VIEW_AS=null; BRAND=""; modalHTML=""; FOLD_OPEN={}; TOASTS=[];
  for(const k in NODES) delete NODES[k];
  FOCUS_LOG=[]; SCROLL_LOG=[];
  localStorage.setItem("ecdr_user", who||"管理員"); localStorage.setItem("ecdr_role", role||"boss");
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"管理員",role:"boss"},{name:"小葵",role:"editor"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
}

// ══════════ ① 哪三種點得動、哪三種點不動 ══════════
{ reset([v_("A",{scheduledDate:DAY(-1)})]);   // 過了上片日、沒貼連結 → 缺上片連結
  const p=missingPill(vid("A"));
  ok("**缺上片連結的藥丸點得動**", /onclick="event\.stopPropagation\(\);jumpToField\('A','pub'\)"/.test(p), p);
  ok("而且游標變手指", /cursor:pointer/.test(p)); }
{ reset([v_("B",{videoCopy:""})]);
  const p=missingPill(vid("B"));
  ok("**缺文案的藥丸點得動**", /jumpToField\('B','copy'\)/.test(p), p); }
{ reset([v_("C",{tags:["寵粉"],products:[],productUrl:"",scheduledDate:DAY(-100)})]);
  const p=missingPill(vid("C"));
  ok("**缺商品與連結的藥丸點得動**", /jumpToField\('C','prod'\)/.test(p), p); }
{ reset([v_("D",{stage:"待處理",rawLink:"",claimedBy:"",editor:"",shotAt:"",scheduledDate:DAY(-100)})]);
  // ⚠️ vidShot() 的第一條規則是「已上片就算拍過」（isPublished(v) 優先於
  //    rawLink／claimedBy 那幾格）—— 預設的 stage:"已完成" 會讓這個 fixture 白測，
  //    所以這裡刻意改成「待處理」，vidShot 才會真的落到「有沒有毛片」那幾格去判斷。
  const p=missingPill(vid("D"));
  ok("缺毛片不是這三個之一，藥丸還在", p.includes("缺毛片"), p);
  ok("**但點不動**（沒有單一輸入欄位可以跳）", !/jumpToField/.test(p), p); }
{ reset([v_("E",{scheduledDate:null})]);
  ok("**沒排日期也點不動**", !/jumpToField/.test(missingPill(vid("E")))); }
{ reset([v_("F",{scheduledDate:DAY(-40),publishedLink:"https://x",driveFolder:""})]);
  // 缺存檔連結要 isPublished 且 !ownDrive；這裡已上片且沒填資料夾
  const p=missingPill(vid("F"));
  if(p.includes("缺存檔連結")) ok("**缺存檔連結也點不動**", !/jumpToField/.test(p), p);
  else ok("（此例未觸發缺存檔連結，略過本項斷言）", true); }

// ══════════ ② 二創殼／海外版本一律不能點 —— 它們走別的視窗 ══════════
{ reset([v_("S",{scheduledDate:DAY(-10)})]);   // 源片
  reset([v_("S",{scheduledDate:DAY(-10)}), v_("R",{scheduledDate:DAY(-1),channel:"shopee",sourceVideoId:"S"})]);
  const p=missingPill(vid("R"));
  ok("**蝦皮版本殼缺上片連結也不能點**（它走 openChModal，不是 editVideo，欄位 id 不一樣）",
     p.includes("缺上片連結") && !/jumpToField/.test(p), p);
  reset([v_("S",{scheduledDate:DAY(-10)}), v_("T",{scheduledDate:DAY(-1),locale:"en",sourceVideoId:"S"})]);
  const p2=missingPill(vid("T"));
  ok("**海外語言版本殼也不能點**（走 openIntlModal）", p2.includes("缺上片連結") && !/jumpToField/.test(p2), p2); }

// ══════════ ③ 點下去真的會開視窗、打開那一折、游標跳過去、捲過去 ══════════
{ reset([v_("A",{scheduledDate:DAY(-1)})]);   // 已上片、缺連結、「上片後」那一折平常是收起來的
  ok("（前提）「上片後」平常收起來（沒有 usageHistory／metrics／還沒到補連結的窗期）", !NODES.e_postfold, "尚未開視窗前不該有節點");
  jumpToField("A","pub");
  ok("**視窗真的開了**（modalHTML 有編輯表單）", /id="e_pub"/.test(modalHTML));
  ok("**「上片後」那一折被強制打開**", NODES.e_postfold && NODES.e_postfold.open===true);
  ok("**游標移到 e_pub**", FOCUS_LOG.includes("e_pub"), FOCUS_LOG);
  ok("**畫面捲過去**", SCROLL_LOG.includes("e_pub"), SCROLL_LOG); }
{ reset([v_("B",{videoCopy:""})]);
  jumpToField("B","copy");
  ok("**文案：視窗開了、游標到 e_vcopy**", /id="e_vcopy"/.test(modalHTML) && FOCUS_LOG.includes("e_vcopy"), FOCUS_LOG);
  ok("**文案欄順手展開**（vcopyOpen：平常收成一排，看不到游標在哪）", NODES.e_vcopy && NODES.e_vcopy.rows===6); }
{ reset([v_("C",{tags:["寵粉"],products:[],productUrl:""})]);
  ok("（前提）「商品與導購」平常收起來", !NODES.e_prodfold);
  jumpToField("C","prod");
  ok("**商品：視窗開了、「商品與導購」被打開、游標到 e_url**",
     /id="e_url"/.test(modalHTML) && NODES.e_prodfold && NODES.e_prodfold.open===true && FOCUS_LOG.includes("e_url"),
     { fold:NODES.e_prodfold&&NODES.e_prodfold.open, focus:FOCUS_LOG }); }
{ // 直接呼叫（不透過畫面上的藥丸）也要擋得住不存在的種類，不能亂跳
  reset([v_("A",{scheduledDate:DAY(-1)})]);
  jumpToField("A","raw");
  ok("**呼叫一個沒有對應欄位的種類，安安靜靜不做事**（不開視窗、不丟例外）", modalHTML==="" && !FOCUS_LOG.length); }

console.log(`\n${pass} / ${pass+fail} 通過`);
if(fail) process.exit(1);
