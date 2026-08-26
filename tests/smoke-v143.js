// v143：把「存檔位置統一」補完。
//
// v142 只改了海外／蝦皮的二創視窗（i_drive / p_drive），漏了主編輯視窗的 e_drive。
// 而二創殼有四條路真的會開到主編輯視窗：
//   ①「其他語言版本」卡片裡每一列的「開啟」
//   ② 月排程當天的影片清單（排上去的可能就是英文版／蝦皮版的殼）
//   ③ 團隊看板／流程中控的影片行
//   ④ 成效排行榜
// 只要走這四條，員工就又能各填各的資料夾 —— 那條規矩等於沒立。
//
// 補完之後還有第二層要一起改：燈號與提醒。
// 二創殼的資料夾現在是唯讀繼承的，它永遠不會有「自己的」資料夾，
// 所以凡是拿 ownDrive() 問二創殼的地方都會變成熄不掉的燈號
// （跟之前那顆「缺上片連結」是同一個病）。改成問 familyDrive()。
//
// 第三件：欄位改唯讀之後，旁邊那句「剪好後請換成你自己的檔案連結」就變成
// 叫人做一件做不到的事，拿掉。
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
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"標題"+id,rawName:"中文原始片名",videoCopy:"中文口播稿",
  nameEn:"",videoCopyEn:"",rawLink:"http://raw",lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",
  scheduledDate:null,finishedAt:"",publishedLink:"",driveFolder:"",reviewStatus:"",locale:"",channel:"",
  origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos){
  modalHTML=""; viewEl.innerHTML=""; fields={};
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"管理員",role:"boss"},{name:"Anna",role:"intl"}],
    settings:{dailyTarget:4,videoTags:["新片"],sources:["自製"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"tiktok-EN"}],shopeeAccounts:["蝦皮店A"],msAccounts:[],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
  VIEW_AS=null; BRAND="";
}
// 源片（有資料夾）＋一個英文殼＋一個蝦皮殼，兩個殼都沒有自己的資料夾
const SRC =()=>v_("SRC",{stage:"已上片",published:true,publishedLink:"http://x",driveFolder:FAM,
  scheduledDate:"2020-01-01",finishedAt:"2020-01-01T00:00:00Z"});
const ENV =(o)=>v_("ENV",Object.assign({locale:"en",sourceVideoId:"SRC",account:"tiktok-EN"},o||{}));
const SHPV=(o)=>v_("SHPV",Object.assign({channel:"shopee",sourceVideoId:"SRC",account:"蝦皮店A"},o||{}));

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,200));} }

// ══════════ ① 主編輯視窗：二創殼的存檔位置是唯讀的 ══════════
{ reset([SRC(), ENV(), SHPV()]);
  openVideoModal("ENV", true);
  ok("英文殼：主編輯視窗有存檔位置欄", modalHTML.includes('id="e_drive"'));
  ok("英文殼：那一格是唯讀的", /id="e_drive"[^>]*\breadonly\b/.test(modalHTML), modalHTML.match(/<input id="e_drive"[^>]*>/));
  ok("英文殼：帶的是源片的資料夾", modalHTML.includes(FAM));
  ok("英文殼：有寫清楚為什麼不能填", /跟源片同一個資料夾|Same folder as the source/.test(modalHTML)); }
{ reset([SRC(), SHPV()]);
  openVideoModal("SHPV", true);
  ok("蝦皮殼：那一格也是唯讀的", /id="e_drive"[^>]*\breadonly\b/.test(modalHTML));
  ok("蝦皮殼：帶的是源片的資料夾", modalHTML.includes(FAM)); }

// ══════════ ② 源片自己那一格照舊可以填 ══════════
{ reset([SRC()]);
  openVideoModal("SRC", true);
  ok("源片：存檔欄還在", modalHTML.includes('id="e_drive"'));
  ok("源片：可以自己填（不是唯讀）", !/id="e_drive"[^>]*\breadonly\b/.test(modalHTML),
     modalHTML.match(/<input id="e_drive"[^>]*>/));
  ok("源片：標籤還是原本那句", modalHTML.includes("完成影片存檔連結")); }
{ reset([v_("NOFOLDER",{stage:"待處理"})]);
  openVideoModal("NOFOLDER", true);
  ok("源片沒填資料夾也照樣能填", !/id="e_drive"[^>]*\breadonly\b/.test(modalHTML)); }

// ══════════ ③ 二創視窗的說明不能叫人改一個改不了的欄位 ══════════
{ reset([SRC(), ENV({driveFolder:FAM})]);
  localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
  openIntlModal("ENV");
  ok("海外二創視窗：存檔欄唯讀", /id="i_drive"[^>]*\breadonly\b/.test(modalHTML));
  ok("海外二創視窗：沒有叫人換成自己的連結",
     !/換成你自己的檔案連結|replace it with the link/.test(modalHTML)); }
{ reset([SRC(), SHPV({driveFolder:FAM})]);
  openChModal("shopee","SHPV");
  ok("蝦皮二創視窗：存檔欄唯讀", /id="shp_drive"[^>]*\breadonly\b/.test(modalHTML) || /_drive"[^>]*\breadonly\b/.test(modalHTML));
  ok("蝦皮二創視窗：沒有叫人換成自己的連結",
     !/換成你自己的檔案連結|replace it with the link/.test(modalHTML)); }
{ const CODE=APP.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n");
  ok("那段矛盾的說明已經從 code 裡拿掉", !/inheritedDriveHint/.test(CODE)); }

// ══════════ ④ 燈號：二創殼繼承來的資料夾就算數，不能永遠亮 ══════════
{ reset([SRC(), ENV({stage:"已上片",published:true,publishedLink:"http://p",scheduledDate:"2020-01-01"})]);
  const m=vidMissing(vid("ENV")).map(x=>x.k);
  ok("已上片的英文殼：不再亮「缺存檔連結」", !m.includes("drive"), m); }
{ reset([SRC(), SHPV({stage:"已上片",published:true,publishedLink:"http://p",scheduledDate:"2020-01-01"})]);
  const m=vidMissing(vid("SHPV")).map(x=>x.k);
  ok("已上片的蝦皮殼：不再亮「缺存檔連結」", !m.includes("drive"), m); }
// 反面：整家人都沒有資料夾 → 這顆燈還是要亮（不能為了熄燈把防線也拆了）
{ reset([v_("SRC2",{stage:"已上片",published:true,publishedLink:"http://x",driveFolder:""}),
         v_("ENV2",{locale:"en",sourceVideoId:"SRC2",stage:"已上片",published:true,
                    publishedLink:"http://p",scheduledDate:"2020-01-01"})]);
  const m=vidMissing(vid("ENV2")).map(x=>x.k);
  ok("源片也沒資料夾 → 燈號還是要亮", m.includes("drive"), m); }
// 源片自己的規則沒被動到
{ reset([v_("SRC3",{stage:"已上片",published:true,publishedLink:"http://x",driveFolder:"",
                    scheduledDate:"2020-01-01",videoCopy:"稿",rawLink:"http://raw"})]);
  ok("源片沒填資料夾照樣亮燈", vidMissing(vid("SRC3")).map(x=>x.k).includes("drive")); }
{ reset([SRC()]);
  ok("源片填了資料夾就不亮", !vidMissing(vid("SRC")).map(x=>x.k).includes("drive")); }

// ══════════ ⑤ 「審片進度」那張卡也不能永遠叫 ══════════
// linksDone 對二創殼要看 familyDrive；看 ownDrive 的話已審過的片會永遠掛在卡上。
{ reset([SRC(), ENV({stage:"已完成",reviewStatus:"通過",reviewedAt:"2020-01-01",reviewAck:false,
                     claimedBy:"小葵",editor:"小葵",publishedLink:"http://p"})]);
  const h=viewWork();
  ok("補齊連結的英文殼不會一直掛在審片進度卡上", !h.includes("審片進度"), h.slice(0,120)); }
{ reset([SRC(), ENV({stage:"已完成",reviewStatus:"通過",reviewedAt:"2020-01-01",reviewAck:false,
                     claimedBy:"小葵",editor:"小葵",publishedLink:""})]);
  const h=viewWork();
  ok("還沒貼上片連結的就要留在卡上（防線沒被拆）", h.includes("審片進度")); }

// ══════════ ⑥ 沒把別的東西弄壞 ══════════
{ reset([SRC(), ENV(), SHPV()]);
  ["boss","manager","editor","intl"].forEach(r=>{
    localStorage.setItem("ecdr_role", r);
    localStorage.setItem("ecdr_user", r==="intl"?"Anna":(r==="boss"?"管理員":"小葵"));
    ["work","videos","cal"].forEach(tab=>{ CUR_TAB=tab; CAL_PLAT="tw"; CAL_PLAT_FOR=r; CAL_YM=null; WORK_ZONE="shopee";
      try{ render(); ok(`[${r}] ${tab} 畫得出來`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });
  }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
