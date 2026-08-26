// v146：海外拿到跟台灣一模一樣的畫面，只是介面是英文。
//
// 災情：海外同仁點一支「還沒拍的腳本」，跳出來的是一張唯讀卡，上面寫
//   「1. 先看我們的中文成片　2. 用毛片重剪出你的英文版本」
// —— 這支根本還沒拍，沒有中文成片也沒有毛片，整段說明都對不上。
// 而且沒有編輯視窗就沒有存檔資料夾、沒有階段、不能認領，等於海外**不能自己拍自己傳**。
//
// 那張卡是舊模型的產物（海外只做二創）。新流程是一份腳本同時發給兩組人，
// 台灣拍中文版、海外拍英文版，所以海外要的就是同一個視窗。
//
// 三件事：
//   ① openVideoModal 的海外守門拿掉 —— 同一個編輯視窗，介面走 T() 出英文
//   ② 影片庫上面那兩個分頁（台灣／海外）功能一樣，只是裝不同區的片；
//      舊的「挑一支台灣已上片的片來做二創」那一份拿掉（跟上班計畫的建立二創版本卡重複）
//   ③ 預設不再依職位分：大家一進來都落在同一份
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
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(fields[id]!=null) e.value=fields[id];
    if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

const FAM="https://drive.google.com/drive/folders/FAMILY-1";
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"標題"+id,rawName:"（P304）頂級女人拚的從來不是有錢",
  videoCopy:"標題：頂級女人拚的從來不是有錢…",nameEn:"",videoCopyEn:"",rawLink:"",lib:"",stage:"待處理",
  editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",publishedLink:"",driveFolder:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],
  tags:[],products:[],usageHistory:[],metrics:[]},o||{});
let toasts=[], writes=[];
function reset(videos, who, role){
  modalHTML=""; viewEl.innerHTML=""; fields={}; toasts=[]; writes=[];
  global.window.DB={ set:async(c,i,o)=>{writes.push(["set",c,i,o]);}, update:async(c,i,p)=>{writes.push(["update",c,i,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{}, videosWatched:()=>true };
  const raw={ users:[{name:"Kuei",role:"editor"},{name:"Boss",role:"boss"},{name:"Anna",role:"intl"}],
    settings:{dailyTarget:4,videoTags:["NewClip"],sources:["SelfMade"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"tiktok-EN"}],shopeeAccounts:["蝦皮店A"],msAccounts:[],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"Anna"); localStorage.setItem("ecdr_role", role||"intl");
  VIEW_AS=null; BRAND=""; ZONE_VIEW=null; VID_LANG=""; VID_VIEW="raw"; VID_Q=""; VID_TAGS=new Set();
}
toast=(m,e)=>{ toasts.push({m:String(m),err:!!e}); };
let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① 還沒拍的腳本：海外點進去要能自己拍自己傳 ══════════
{ reset([v_("P304")]);
  openVideoModal("P304", true);
  ok("點得開編輯視窗（不是唯讀卡）", modalHTML.includes('id="e_raw"'));
  ok("有階段可以改", modalHTML.includes('id="e_stage"'));
  ok("有存檔資料夾可以填（自己拍完要開資料夾）", modalHTML.includes('id="e_drive"'));
  ok("那一格填得動，不是唯讀", !/id="e_drive"[^>]*\breadonly\b/.test(modalHTML));
  ok("有預排上片日", modalHTML.includes('id="e_date"'));
  ok("有英文片名／英文腳本可以填", modalHTML.includes('id="e_nameEn"') && modalHTML.includes('id="e_vcopyEn"'));
  ok("有刪除鍵（跟台灣一樣）", modalHTML.includes("delVideo("));
  // 那張對不上的舊卡不該再出現在這裡
  ok("沒有再叫人「先看中文成片」", !modalHTML.includes("Watch our finished Chinese version"));
  ok("沒有「缺毛片／缺中文成片」的假警告", !/ask the admin to add it/.test(modalHTML)); }
// 而且整個視窗是英文的
{ reset([v_("P304")]);
  openVideoModal("P304", true);
  // 只掃「看得到的字」：
  //   - 勾選框的 value 是要存進資料庫的標籤原名（一定是中文），畫面上顯示的是它後面
  //     那段 dataLabel 出來的英文 —— 整個 <input type="checkbox"> 拿掉再掃
  //   - onclick／title 這種屬性不是畫面上的字
  //   - 片名、文案是資料，不是介面
  //   - 「文」是翻譯圖示的圖案（文A）
  // ⚠️ 不能連 <input value="…"> 一起拿掉 —— 輸入框的 value 就是使用者看到的字，
  //    海外的「階段」那一格就是這樣漏出中文的（v146 修掉）。
  const clean=modalHTML
    .replace(/<input type="checkbox"[^>]*>/g,"")
    .replace(/ (?:onclick|onchange|oninput|onfocus|title)="[^"]*"/g,"")
    .replace(/（P304）頂級女人拚的從來不是有錢|標題：頂級女人拚的從來不是有錢…|標題P304|文/g,"");
  const zh=[...new Set(clean.match(/[一-鿿]+/g)||[])];
  ok("視窗裡沒有中文介面字（片名／文案除外）", zh.length===0, zh); }
// 反面：階段那一格的 value 就是畫面上的字，不能漏中文（這次真的踩到的那個）
{ reset([v_("P304",{stage:"剪輯中"})]);
  openVideoModal("P304", true);
  ok("階段那一格顯示英文", /id="e_stage" value="In progress"/.test(modalHTML), modalHTML.match(/id="e_stage"[^>]*/)); }
{ reset([v_("P304",{stage:"剪輯中"})], "Kuei","editor");
  openVideoModal("P304", true);
  ok("台灣看到的階段還是中文", /id="e_stage" value="剪輯中"/.test(modalHTML)); }
// 那一格是 disabled 的，不能拿它當存檔來源（不然海外一按儲存就把 stage 寫成英文）
{ reset([v_("P304",{stage:"剪輯中"})]);
  openVideoModal("P304", true);
  fields.e_code="CP304"; fields.e_raw="片名"; fields.e_vcopy="文案"; fields.e_stage="In progress";
  fields.e_src="SelfMade"; fields.e_editor=""; fields.e_date=""; fields.e_drive="";
  fields.e_ref=""; fields.e_note=""; fields.e_url="";
  return saveVideo("P304").then(()=>{
    const p=(writes.find(w=>w[1]==="videos")||[])[3];
    ok("存下去的階段還是中文原值，不是畫面上那個英文", !!p && p.stage==="剪輯中", p&&p.stage);
    fin();
  }); }
function fin(){
// 台灣看到的還是中文
{ reset([v_("P304")], "Kuei","editor");
  openVideoModal("P304", true);
  ok("台灣看到的是中文", modalHTML.includes("原本語言") && modalHTML.includes("刪除這支影片")); }

// ══════════ ② 海外自己開一支新腳本 ══════════
{ reset([]);
  newSimpleVideo();
  ok("海外開得了「新增影片」視窗", modalHTML.includes('id="sv_name"') && modalHTML.includes('id="sv_vcopy"'));
  ok("而且是英文", modalHTML.includes("Raw title") && !modalHTML.includes("原始片名")); }

// ══════════ ③ 影片庫：兩個分頁功能一樣 ══════════
{ reset([v_("S1",{stage:"已上片",published:true,publishedLink:"http://x",driveFolder:FAM}),
         v_("E1",{locale:"en",sourceVideoId:"S1",account:"tiktok-EN"})]);
  const h=viewVideos();
  ok("海外看到的是同一份影片庫", h.includes("Library A"));
  ok("有那四個管線分頁", h.includes('id="vid_tabs"') && h.includes("<span>Not shot</span>"));
  ok("有新增一支／批次新增", h.includes("Add one") && h.includes("Batch add"));
  ok("有清單／圖片切換", h.includes("vidSetMode('grid')"));
  ok("有標籤篩選", h.includes('id="vid_tagfold"'));
  ok("全英文", !/影片庫A|新增一支|批次新增|標籤篩選/.test(h)); }
// 預設落在同一份（不再依職位分）
{ reset([v_("S1")]);
  ok("海外的預設也是台灣那一頁", curZone()==="tw");
  setZoneView("intl"); ok("切得到海外那一頁", curZone()==="intl"); }
{ reset([v_("S1")], "Kuei","editor");
  ok("台灣的預設一樣", curZone()==="tw"); }
// 海外那一頁：二創殼要列得出來（語言看它自己的 locale，不是源片的）
{ reset([v_("S1",{stage:"已上片",published:true,publishedLink:"http://x"}),
         v_("E1",{locale:"en",sourceVideoId:"S1",account:"tiktok-EN"}),
         v_("T1",{locale:"th",sourceVideoId:"S1",account:"tiktok-TH"})]);
  ok("英文版的語言算英文（不是跟著中文源片）", effOrigLang(vid("E1"))==="en");
  ok("泰文版的語言算泰文", effOrigLang(vid("T1"))==="th");
  setZoneView("intl"); VID_LANG="en"; VID_VIEW="raw";
  const h=viewVideos();
  ok("海外那一頁列得到英文版", h.includes("openIntlModal('E1')"), h.slice(0,150));
  ok("選英文的時候泰文版不列", !h.includes("openIntlModal('T1')")); }
// 台灣那一頁沒被改壞：蝦皮殼沒有 locale，照舊算中文
{ reset([v_("S1",{stage:"已上片",published:true,publishedLink:"http://x"}),
         v_("P1",{channel:"shopee",sourceVideoId:"S1",account:"蝦皮店A"})], "Kuei","editor");
  ok("蝦皮殼的語言照舊跟著源片（中文）", effOrigLang(vid("P1"))===effOrigLang(vid("S1")));
  setZoneView("tw"); VID_LANG=""; VID_VIEW="raw";
  ok("蝦皮殼列在台灣那一頁", viewVideos().includes("openChModal('shopee','P1')")); }

// ══════════ ④ 二創殼點進去走它自己的視窗 ══════════
{ reset([v_("S1",{stage:"已上片",published:true,publishedLink:"http://x",driveFolder:FAM}),
         v_("E1",{locale:"en",sourceVideoId:"S1",account:"tiktok-EN"}),
         v_("P1",{channel:"shopee",sourceVideoId:"S1",account:"蝦皮店A"})]);
  ok("英文版 → openIntlModal", vidOpenFn(vid("E1"))==="openIntlModal('E1')");
  ok("蝦皮版 → openChModal", vidOpenFn(vid("P1"))==="openChModal('shopee','P1')");
  ok("源片 → 主編輯視窗", vidOpenFn(vid("S1"))==="editVideo('S1')"); }
// 蝦皮殼不再被擋（v142 已經沒有分區了）
{ reset([v_("S1",{stage:"已上片",published:true,publishedLink:"http://x"}),
         v_("P1",{channel:"shopee",sourceVideoId:"S1",account:"蝦皮店A"})]);
  toasts=[]; openVideoModal("P1", true);
  ok("海外點蝦皮殼不再被擋", modalHTML!=="" && !toasts.some(t=>/Not in your area/.test(t))); }

// ══════════ ⑤ 舊的那份重複清單拿掉了 ══════════
{ const CODE=APP.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n");
  ok("viewVideosIntl 已經拿掉", !/function viewVideosIntl/.test(CODE));
  ok("「挑一支台灣已上片的影片」那份還在上班計畫的建立二創版本卡裡",
     /intlLibRows/.test(CODE)); }
{ reset([v_("S1",{stage:"已上片",published:true,publishedLink:"http://x"})]);
  const w=viewWork();
  ok("海外的上班計畫還是挑得到片做二創", w.includes("Create a version") && w.includes("Pick an old video")); }

// ══════════ ⑥ 舊的分區說明不能再誤導人 ══════════
{ reset([v_("P304")], "Kuei","editor");
  openVideoModal("P304", true);
  ok("不再寫「台灣剪輯不再看到」（v142 就沒有分區了）",
     !modalHTML.includes("台灣剪輯不再看到"));
  ok("改成講清楚只是分開放", modalHTML.includes("大家照樣看得到")); }

// ══════════ ⑦ 全角色 × 全分頁不炸 ══════════
{ reset([v_("S1",{stage:"已上片",published:true,publishedLink:"http://x",driveFolder:FAM}),
         v_("E1",{locale:"en",sourceVideoId:"S1",account:"tiktok-EN"}),
         v_("P1",{channel:"shopee",sourceVideoId:"S1",account:"蝦皮店A"})]);
  ["boss","manager","editor","intl"].forEach(r=>{
    localStorage.setItem("ecdr_role", r);
    localStorage.setItem("ecdr_user", r==="intl"?"Anna":(r==="boss"?"Boss":"Kuei"));
    ["tw","intl"].forEach(z=>{ setZoneView(z);
      ["work","videos","cal"].forEach(tab=>{ CUR_TAB=tab; CAL_PLAT="tw"; CAL_PLAT_FOR=r; CAL_YM=null; WORK_ZONE="shopee";
        try{ render(); ok(`[${r}/${z}] ${tab} 畫得出來`, true); }catch(e){ ok(`[${r}/${z}] ${tab} → ${e.message}`, false); } });
    });
  }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
}
