// v144：把「資料夾誰開、叫什麼名字、什麼東西要放進去」這條規矩寫在欄位旁邊。
//
// 之前這條規矩只存在於人的腦袋裡：新人打開編輯視窗只會看到一個空白的
// 「完成影片存檔連結」，不知道要自己去 Google 雲端硬碟開資料夾、
// 更不知道資料夾要取什麼名字。所以：
//   ① 欄位從「上片後」那一折搬到主畫面 —— 拍毛片的人一進來就看得到，
//      不是上片之後才填（順序本來就反了）。
//   ② 旁邊寫清楚：第一個拍好毛片的人去開資料夾，名字用這支的檔名，
//      之後所有延伸的影片（中文／英文、一創／二創）跟封面都放同一個。
//   ③ 中文版跟英文版都要有 —— 海外同仁看的是英文介面。
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
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"標題"+id,rawName:"慈禧太后最愛的兩種寶石",
  videoCopy:"中文口播稿",nameEn:"",videoCopyEn:"",rawLink:"http://raw",lib:"",stage:"待處理",editor:"",
  claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",publishedLink:"",driveFolder:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],
  tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos, who, role){
  modalHTML=""; viewEl.innerHTML=""; fields={};
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"管理員",role:"boss"},{name:"Anna",role:"intl"}],
    settings:{dailyTarget:4,videoTags:["新片"],sources:["自製"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"tiktok-EN"}],shopeeAccounts:["蝦皮店A"],msAccounts:[],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"小葵"); localStorage.setItem("ecdr_role", role||"editor");
  VIEW_AS=null; BRAND="";
}
let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① 中文版：規矩三句話都要在 ══════════
{ reset([v_("V1")]);
  openVideoModal("V1", true);
  ok("寫了「第一個拍好毛片的人」", modalHTML.includes("第一個拍好毛片的人"));
  ok("寫了要去 Google 雲端硬碟開資料夾",
     /Google 雲端硬碟/.test(modalHTML) && /開一個新資料夾/.test(modalHTML));
  ok("寫了名字要用這支的檔名", modalHTML.includes("名字就用這支的檔名"));
  ok("直接把檔名秀出來（不用自己回頭抄）", modalHTML.includes("慈禧太后最愛的兩種寶石"));
  ok("檔名可以一鍵複製", /copyStr\('[^']*'\)/.test(modalHTML) && modalHTML.includes("複製檔名"));
  ok("寫了中文版英文版都放同一個", /中文版／英文版/.test(modalHTML));
  ok("寫了一創二創都放同一個", /一創／二創/.test(modalHTML));
  ok("寫了封面也放同一個", modalHTML.includes("封面")); }

// ══════════ ② 英文版：海外同仁也要看得到同一條規矩 ══════════
// ⚠️ T() 是看職位的，海外＝英文介面。而海外開源片走的是唯讀的來源卡
//    （openSourceForIntl），開自己的二創走 openIntlModal —— 兩條路都要寫到。
{ reset([v_("SRC",{driveFolder:FAM,stage:"已上片",published:true,publishedLink:"http://x"}),
         v_("SHELL",{locale:"en",sourceVideoId:"SRC",account:"tiktok-EN"})], "Anna","intl");
  openIntlModal("SHELL");
  ok("英文（二創視窗）：說了資料夾是誰開的",
     modalHTML.includes("created by whoever shot the raw footage first"));
  ok("英文（二創視窗）：說了名字就是源片檔名",
     modalHTML.includes("named after the source video's file name"));
  ok("英文（二創視窗）：中英兩版都放同一個", modalHTML.includes("Chinese and English versions"));
  ok("英文（二創視窗）：一創二創都放同一個", modalHTML.includes("first cuts and remakes"));
  ok("英文（二創視窗）：封面也放同一個", modalHTML.includes("the cover"));
  ok("英文介面沒有漏中文說明出來", !/第一個拍好毛片的人|通通放進同一個資料夾/.test(modalHTML)); }
// v146：海外點源片進的是同一個編輯視窗 —— 所以源片那一格的英文說明這次真的看得到
{ reset([v_("SRC",{driveFolder:FAM,stage:"已上片",published:true,publishedLink:"http://x",
                   rawLink:"http://raw"})], "Anna","intl");
  openVideoModal("SRC", true);
  ok("英文（源片的編輯視窗）：說了誰要去開資料夾",
     modalHTML.includes("Whoever shoots the raw footage first"));
  ok("英文（源片的編輯視窗）：同一條規矩也寫在這裡",
     modalHTML.includes("Chinese and English versions") && modalHTML.includes("first cuts and remakes"));
  ok("英文（源片的編輯視窗）：那一格填得動（海外要自己拍自己傳）",
     !/id="e_drive"[^>]*\breadonly\b/.test(modalHTML)); }
// 海外看源片的唯讀卡（做二創時從版本視窗裡看到的那張）也還是有這條規矩
{ reset([v_("SRC",{driveFolder:FAM,stage:"已上片",published:true,publishedLink:"http://x",
                   rawLink:"http://raw"})], "Anna","intl");
  openSourceForIntl("SRC");
  ok("英文（看源片的卡片）：同一條規矩也寫在這裡",
     modalHTML.includes("Chinese and English versions") && modalHTML.includes("first cuts and remakes"));
  ok("英文（看源片的卡片）：資料夾點得進去", modalHTML.includes("This video's folder")); }
{ reset([v_("V1")], "小葵","editor");
  openVideoModal("V1", true);
  ok("中文介面沒有漏英文說明出來", !modalHTML.includes("Whoever shoots the raw footage")); }
// 源片那一格的英文版：今天海外點源片會被導到唯讀的來源卡，走不到這個視窗，
// 所以只能直接叫這個 function 來釘。哪天海外也編得了源片，這句要是漏了就會露出中文。
{ reset([v_("V1")], "Anna","intl");
  const h=ownerDriveField(vid("V1"), "e_drive");
  ok("源片那一格的英文說明有寫（誰去開）", h.includes("Whoever shoots the raw footage first"));
  ok("源片那一格的英文說明有寫（名字用檔名）", h.includes("named after this video's file name"));
  ok("源片那一格的英文說明沒有夾中文", !/[一-鿿]/.test(h.replace(/慈禧太后最愛的兩種寶石/g,""))); }
// 中文版的二創視窗（蝦皮）也要有同一條規矩
{ reset([v_("SRC",{driveFolder:FAM,stage:"已上片",published:true,publishedLink:"http://x"}),
         v_("SHP",{channel:"shopee",sourceVideoId:"SRC",account:"蝦皮店A"})], "小葵","editor");
  openChModal("shopee","SHP");
  ok("中文（二創視窗）：說了資料夾是誰開的", modalHTML.includes("第一個拍好毛片的人開的"));
  ok("中文（二創視窗）：規矩那句也在", modalHTML.includes("通通放進同一個資料夾")); }

// ══════════ ③ 位置：拍毛片的人一進來就看得到，不用展開 ══════════
{ reset([v_("V1")]);
  openVideoModal("V1", true);
  ok("存檔資料夾在「上片後」那一折之前（不用展開）",
     modalHTML.indexOf('id="e_drive"') > 0 && modalHTML.indexOf('id="e_drive"') < modalHTML.indexOf("上片後"));
  ok("就排在毛片雲端連結旁邊（同一件事，同一個人做）",
     modalHTML.indexOf('id="e_rawlink"') < modalHTML.indexOf('id="e_drive"')
     && modalHTML.indexOf('id="e_drive"') < modalHTML.indexOf('id="e_date"')); }

// ══════════ ④ 二創殼不該看到這段（他們沒有要開資料夾） ══════════
{ reset([v_("SRC",{driveFolder:FAM,stage:"已上片",published:true,publishedLink:"http://x"}),
         v_("SHELL",{locale:"en",sourceVideoId:"SRC",account:"tiktok-EN"})]);
  openVideoModal("SHELL", true);
  // 二創殼會被「告知」資料夾是誰開的，但不該被「叫去」開一個
  ok("二創殼沒有被叫去開資料夾", !modalHTML.includes("先到 Google 雲端硬碟開一個新資料夾"));
  ok("二創殼有被告知資料夾是誰開的", modalHTML.includes("第一個拍好毛片的人開的"));
  ok("二創殼看到的是唯讀的繼承欄", /id="e_drive"[^>]*\breadonly\b/.test(modalHTML));
  ok("二創殼帶的是源片的資料夾", modalHTML.includes(FAM)); }

(async()=>{
// ══════════ ⑤ 沒把存檔弄壞：欄位搬家之後照樣讀得到 ══════════
{ reset([v_("V1")]);
  openVideoModal("V1", true);
  fields.e_code="C1"; fields.e_raw="慈禧太后最愛的兩種寶石"; fields.e_vcopy="稿";
  fields.e_drive="https://drive.google.com/drive/folders/NEW-1";
  fields.e_src="自製"; fields.e_stage="待處理"; fields.e_editor=""; fields.e_date="";
  fields.e_rawlink="http://raw"; fields.e_ref=""; fields.e_note=""; fields.e_url="";
  let saved=null;
  global.window.DB.update=async(c,id,p)=>{ if(c==="videos") saved=p; };
  await saveVideo("V1");
  ok("資料夾存得進去", !!saved && saved.driveFolder==="https://drive.google.com/drive/folders/NEW-1", saved&&saved.driveFolder);
}

  // ══════════ ⑥ 全角色 × 全分頁不炸 ══════════
  reset([v_("V1"), v_("SRC",{driveFolder:FAM,stage:"已上片",published:true,publishedLink:"http://x"}),
         v_("SHELL",{locale:"en",sourceVideoId:"SRC",account:"tiktok-EN"})]);
  ["boss","manager","editor","intl"].forEach(r=>{
    localStorage.setItem("ecdr_role", r);
    localStorage.setItem("ecdr_user", r==="intl"?"Anna":(r==="boss"?"管理員":"小葵"));
    ["work","videos","cal"].forEach(tab=>{ CUR_TAB=tab; CAL_PLAT="tw"; CAL_PLAT_FOR=r; CAL_YM=null; WORK_ZONE="shopee";
      try{ render(); ok(`[${r}] ${tab} 畫得出來`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });
  });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
