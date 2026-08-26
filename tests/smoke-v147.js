// v147：排程要進對的那一本月曆。
//
// 災情（v146 打開「海外可以自己拍英文源片」之後才會踩到）：
// 海外拍了一支英文源片、排了日期 —— 那支跑進**中文月曆**，英文月曆完全看不到它。
// 中文月曆的「今天排幾支」多算一支英文片，英文月曆少一支，兩邊的數字都是錯的。
//
// 為什麼：中文月曆收「所有源片」不管語言；英／泰月曆只收「有帳號的二創殼」。
// 英文源片沒有 locale 也沒有帳號 → 掉進中文那本、英文那本抓不到。
//
// 修法：一個收口 schedLineOf(v) —— 二創殼看自己那條線，源片看它是用什麼語言拍的。
// 英／泰月曆是依帳號分的，所以英／泰源片要多選一個帳號（編輯視窗多一個下拉），
// 排了日期卻沒選帳號就擋下來（不然排了等於沒排）。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
// 「這一格在不在」是這支測試的重點之一（e_acct 只有英／泰源片才出現），
// 所以沒設過值的欄位一律回 null，不能每個 id 都給一個假的空 input。
// vmSave 是 openVideoModal 自己要掛 onclick 的，一定要存在
const ALWAYS=new Set(["view","modalRoot","e_schedbox","vmSave","e_links","e_prows"]);
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(id==="modalRoot"){ const e=el(); Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}}); return e; }
    if(fields[id]==null && !ALWAYS.has(id)) return null;
    const e=el(); if(fields[id]!=null) e.value=fields[id]; return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

const D=(n)=>{ const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"片"+id,videoCopy:"稿",
  nameEn:"",videoCopyEn:"",rawLink:"",lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",
  scheduledDate:null,finishedAt:"",publishedLink:"",driveFolder:"",reviewStatus:"",locale:"",channel:"",
  origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],tags:[],products:[],usageHistory:[],metrics:[]},o||{});
let toasts=[], errToasts=[], writes=[];
function reset(videos, who, role){
  modalHTML=""; viewEl.innerHTML=""; fields={}; toasts=[]; errToasts=[]; writes=[];
  global.window.DB={ set:async(c,i,o)=>{writes.push(["set",c,i,o]);}, update:async(c,i,p)=>{writes.push(["update",c,i,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{}, videosWatched:()=>true };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"管理員",role:"boss"},{name:"Anna",role:"intl"}],
    settings:{dailyTarget:4, intlDailyTarget:2, videoTags:["新片"],sources:["自製"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"tiktok-EN"},{locale:"en",name:"tiktok-EN2"},{locale:"th",name:"tiktok-TH"}],
      shopeeAccounts:["蝦皮店A"],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"Anna"); localStorage.setItem("ecdr_role", role||"intl");
  VIEW_AS=null; BRAND=""; ZONE_VIEW=null; INTL_LOC="en";
}
toast=(m,e)=>{ toasts.push(String(m)); if(e) errToasts.push(String(m)); };
let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

(async()=>{

// ══════════ ① schedLineOf：誰屬於哪一本 ══════════
{ reset([v_("ZH"), v_("EN",{origLang:"en"}), v_("TH",{origLang:"th"}), v_("MY",{origLang:"my"}),
         v_("SHP",{channel:"shopee"}), v_("MS",{channel:"ms"}), v_("SUN",{channel:"sunny"}),
         v_("ENV",{locale:"en"}), v_("THV",{locale:"th"})]);
  ok("中文拍的源片 → 中文月曆", schedLineOf(vid("ZH"))==="tw");
  ok("英文拍的源片 → 英文月曆", schedLineOf(vid("EN"))==="en");
  ok("泰文拍的源片 → 泰文月曆", schedLineOf(vid("TH"))==="th");
  ok("馬來西亞拍的源片還是中文月曆（沒有馬來語系的月曆）", schedLineOf(vid("MY"))==="tw");
  ok("蝦皮二創殼 → 蝦皮（行為沒變）", schedLineOf(vid("SHP"))==="shopee");
  ok("馬來二創殼 → 馬來（行為沒變）", schedLineOf(vid("MS"))==="ms");
  ok("Boss Sunny 殼 → sunny（行為沒變）", schedLineOf(vid("SUN"))==="sunny");
  ok("英文二創殼 → 英文（行為沒變）", schedLineOf(vid("ENV"))==="en");
  ok("泰文二創殼 → 泰文（行為沒變）", schedLineOf(vid("THV"))==="th"); }

// ══════════ ② 這次的災情：英文源片不能再掉進中文月曆 ══════════
{ const T3=D(3);
  reset([v_("ZH",{scheduledDate:T3}), v_("EN",{origLang:"en",account:"tiktok-EN",scheduledDate:T3})]);
  const tw=dayVideoList(T3).map(x=>x.videoId);
  ok("中文月曆有中文源片", tw.includes("ZH"), tw);
  ok("中文月曆不再多算那支英文片", !tw.includes("EN"), tw);
  const en=lineDayList("en", T3, "tiktok-EN").map(v=>v.id);
  ok("英文月曆看得到那支英文源片", en.includes("EN"), en);
  ok("換一個帳號就看不到（月曆是依帳號分的）",
     !lineDayList("en", T3, "tiktok-EN2").map(v=>v.id).includes("EN")); }
// 二創殼照舊
{ const T3=D(3);
  reset([v_("S1",{stage:"已上片",published:true,publishedLink:"http://x"}),
         v_("ENV",{locale:"en",sourceVideoId:"S1",account:"tiktok-EN",scheduledDate:T3}),
         v_("SHP",{channel:"shopee",sourceVideoId:"S1",account:"蝦皮店A",scheduledDate:T3})]);
  ok("英文二創殼還是在英文月曆", lineDayList("en",T3,"tiktok-EN").map(v=>v.id).includes("ENV"));
  ok("蝦皮二創殼還是在蝦皮月曆", lineDayList("shopee",T3,"蝦皮店A").map(v=>v.id).includes("SHP"));
  ok("二創殼都不在中文月曆（本來就是）",
     !dayVideoList(T3).map(x=>x.videoId).some(id=>["ENV","SHP"].includes(id))); }
// 中文月曆的「今天排幾支」不能被英文片灌水
{ const T3=D(3);
  reset([v_("ZH1",{scheduledDate:T3}), v_("ZH2",{scheduledDate:T3}),
         v_("EN1",{origLang:"en",account:"tiktok-EN",scheduledDate:T3}),
         v_("EN2",{origLang:"en",account:"tiktok-EN",scheduledDate:T3})]);
  ok("中文月曆那天算 2 支（不是 4 支）", dayBreakdown(T3).total===2, dayBreakdown(T3).total);
  ok("英文月曆那天算 2 支", lineDayBreak("en",T3,"tiktok-EN").total===2, lineDayBreak("en",T3,"tiktok-EN").total); }

// ══════════ ③ 編輯視窗：英／泰源片才有帳號下拉 ══════════
{ reset([v_("ZH")], "小葵","editor");
  openVideoModal("ZH", true);
  ok("中文源片沒有帳號下拉（不用選）", !modalHTML.includes('id="e_acct"'));
  ok("有寫清楚會排進哪一本", modalHTML.includes("中文月排程")); }
{ reset([v_("EN",{origLang:"en"})], "小葵","editor");
  openVideoModal("EN", true);
  ok("英文源片有帳號下拉", modalHTML.includes('id="e_acct"'));
  ok("下拉裡只有英文帳號", modalHTML.includes("tiktok-EN") && !modalHTML.includes("tiktok-TH"));
  ok("有寫清楚會排進哪一本", modalHTML.includes("英文 TikTok 排程")); }
{ reset([v_("TH",{origLang:"th"})], "小葵","editor");
  openVideoModal("TH", true);
  ok("泰文源片的下拉裡只有泰文帳號", modalHTML.includes("tiktok-TH") && !modalHTML.includes("tiktok-EN")); }
// 海外看到的是英文
{ reset([v_("EN",{origLang:"en"})]);
  openVideoModal("EN", true);
  ok("海外看到的是英文", modalHTML.includes("English TikTok schedule") && !modalHTML.includes("英文 TikTok 排程"));
  ok("帳號那一格也是英文", modalHTML.includes("Which account's schedule")); }
// 沒設定帳號的線要講清楚，不是靜靜給一個空下拉
{ reset([v_("TH",{origLang:"th"})], "小葵","editor");
  STATE.settings.intlAccounts=[{locale:"en",name:"tiktok-EN"}];
  openVideoModal("TH", true);
  ok("泰文沒帳號時說清楚要找管理員", /還沒有設定帳號/.test(modalHTML));
  ok("而且不給一個空的下拉", !modalHTML.includes('id="e_acct"')); }

// ══════════ ④ 14 天速覽跟著對的那本月曆 ══════════
{ const T1=D(1);
  reset([v_("ZH1",{scheduledDate:T1}), v_("ZH2",{scheduledDate:T1}), v_("ZH3",{scheduledDate:T1}),
         v_("EN1",{origLang:"en",account:"tiktok-EN",scheduledDate:T1}),
         v_("EN9",{origLang:"en"})], "小葵","editor");
  openVideoModal("ZH1", true);
  const twStrip=modalHTML;
  openVideoModal("EN9", true);
  const enStrip=modalHTML;
  // 中文那天 3 支／目標 4；英文那天 1 支／目標 2
  ok("中文源片看到的是中文月曆的數字", />3<\/b><span>\/4</.test(twStrip.replace(/\s+/g,"")) || twStrip.includes("<b>3</b><span>/4"), true);
  ok("英文源片看到的是英文月曆的數字", enStrip.includes("<b>0</b><span>/2") || enStrip.includes("<b>1</b><span>/2"), true);
  ok("兩張速覽真的不一樣（不是同一本）", twStrip!==enStrip); }

// ══════════ ⑤ 防呆：排了日期卻沒選帳號 ══════════
{ reset([v_("EN",{origLang:"en"})]);
  openVideoModal("EN", true);
  fields.e_code="CEN"; fields.e_raw="片EN"; fields.e_vcopy="稿"; fields.e_lang="en";
  fields.e_date=D(2); fields.e_acct="";   // ← 沒選
  fields.e_src="自製"; fields.e_editor=""; fields.e_drive=""; fields.e_ref=""; fields.e_note=""; fields.e_url="";
  const r=await saveVideo("EN");
  ok("擋下來，沒有寫進資料庫", r===false && !writes.length, {r, w:writes.length});
  ok("而且有紅字說原因", errToasts.length===1, toasts);
  if(errToasts.length) console.log("      「"+errToasts[0]+"」"); }
// 選了就存得進去
{ reset([v_("EN",{origLang:"en"})]);
  openVideoModal("EN", true);
  fields.e_code="CEN"; fields.e_raw="片EN"; fields.e_vcopy="稿"; fields.e_lang="en";
  fields.e_date=D(2); fields.e_acct="tiktok-EN";
  fields.e_src="自製"; fields.e_editor=""; fields.e_drive=""; fields.e_ref=""; fields.e_note=""; fields.e_url="";
  await saveVideo("EN");
  const p=(writes.find(w=>w[1]==="videos")||[])[3];
  ok("帳號存進去了", !!p && p.account==="tiktok-EN", p&&p.account);
  ok("日期也存進去了", !!p && p.scheduledDate===D(2), p&&p.scheduledDate); }
// 沒排日期就不用選帳號（還沒決定要哪天出，不該被卡住）
{ reset([v_("EN",{origLang:"en"})]);
  openVideoModal("EN", true);
  fields.e_code="CEN"; fields.e_raw="片EN"; fields.e_vcopy="稿"; fields.e_lang="en";
  fields.e_date=""; fields.e_acct="";
  fields.e_src="自製"; fields.e_editor=""; fields.e_drive=""; fields.e_ref=""; fields.e_note=""; fields.e_url="";
  await saveVideo("EN");
  ok("沒排日期就存得過去", writes.length>0 && !errToasts.length, {w:writes.length, e:errToasts}); }
// 中文源片完全不受這道防呆影響
{ reset([v_("ZH")], "小葵","editor");
  openVideoModal("ZH", true);
  fields.e_code="CZH"; fields.e_raw="片ZH"; fields.e_vcopy="稿"; fields.e_lang="";
  fields.e_date=D(2);
  fields.e_src="自製"; fields.e_editor=""; fields.e_drive=""; fields.e_ref=""; fields.e_note=""; fields.e_url="";
  await saveVideo("ZH");
  ok("中文源片排日期不用選帳號", writes.length>0 && !errToasts.length, {w:writes.length, e:errToasts}); }
// 二創殼的帳號不能被洗掉（它那一格不在畫面上）
{ reset([v_("S1",{stage:"已上片",published:true,publishedLink:"http://x"}),
         v_("ENV",{locale:"en",sourceVideoId:"S1",account:"tiktok-EN2"})], "小葵","editor");
  openVideoModal("ENV", true);
  fields.e_code="CENV"; fields.e_raw="片ENV"; fields.e_vcopy="稿"; fields.e_date="";
  fields.e_src="自製"; fields.e_editor=""; fields.e_drive=""; fields.e_ref=""; fields.e_note=""; fields.e_url="";
  await saveVideo("ENV");
  const p=(writes.find(w=>w[1]==="videos")||[])[3];
  ok("二創殼的帳號原封不動", !!p && p.account==="tiktok-EN2", p&&p.account); }

// ══════════ ⑥ 全角色 × 全分頁不炸 ══════════
{ reset([v_("ZH",{scheduledDate:D(1)}), v_("EN",{origLang:"en",account:"tiktok-EN",scheduledDate:D(1)}),
         v_("S1",{stage:"已上片",published:true,publishedLink:"http://x"}),
         v_("ENV",{locale:"en",sourceVideoId:"S1",account:"tiktok-EN"})]);
  ["boss","manager","editor","intl"].forEach(r=>{
    localStorage.setItem("ecdr_role", r);
    localStorage.setItem("ecdr_user", r==="intl"?"Anna":(r==="boss"?"管理員":"小葵"));
    ["work","videos","cal"].forEach(tab=>{ CUR_TAB=tab; CAL_PLAT_FOR=r; CAL_YM=null; WORK_ZONE="shopee";
      ["tw","en","shopee"].forEach(pl=>{ CAL_PLAT=pl;
        try{ render(); ok(`[${r}] ${tab}/${pl} 畫得出來`, true); }catch(e){ ok(`[${r}] ${tab}/${pl} → ${e.message}`, false); } }); });
  }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
