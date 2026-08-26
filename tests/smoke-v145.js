// v145：「毛片雲端連結」跟「存檔位置」併成同一格。
//
// 這兩格本來就是同一個地方 —— 第一個拍好毛片的人開的那個資料夾，
// 毛片、成片、二創、封面全在裡面。拆成兩格只是在讓人把同一條網址貼兩次，
// 順便製造「兩格填不一樣」的機會。
//
// 併的方式：資料夾（driveFolder）當唯一那一格。
// 舊資料各自填過的 rawLink 照樣認得（不回頭改資料庫），透過 vidRawLink() 讀，
// 而且存檔的時候原封不動留著 —— 欄位從畫面上拿掉，不代表可以把人家的資料洗掉。
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
// showModal 用 btn.onclick=… 掛確認鍵 —— 每次 getElementById 回新物件的話那個 handler 就掉了，
// 所以這顆要固定同一個
const confirmBtn=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(id==="modalConfirm") return confirmBtn;
    if(fields[id]===undefined && /^(e_rawlink|bl\d)$/.test(id)) return null;   // 併掉的欄位真的不在
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
const OLDRAW="https://drive.google.com/file/OLD-RAW";
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"標題"+id,rawName:"中文原始片名",videoCopy:"中文口播稿",
  nameEn:"",videoCopyEn:"",rawLink:"",lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",
  scheduledDate:null,finishedAt:"",publishedLink:"",driveFolder:"",reviewStatus:"",locale:"",channel:"",
  origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],tags:[],products:[],usageHistory:[],metrics:[]},o||{});
let writes=[];
function reset(videos, who, role){
  modalHTML=""; viewEl.innerHTML=""; fields={}; writes=[];
  global.window.DB={ set:async(c,id,o)=>{writes.push(["set",c,id,o]);},
    update:async(c,id,p)=>{writes.push(["update",c,id,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{}, videosWatched:()=>true };
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

(async()=>{

// ══════════ ① 編輯視窗只剩一格 ══════════
{ reset([v_("V1",{driveFolder:FAM})]);
  openVideoModal("V1", true);
  ok("只有存檔資料夾那一格", modalHTML.includes('id="e_drive"'));
  ok("沒有另一格「毛片雲端連結」", !modalHTML.includes('id="e_rawlink"'));
  ok("整個視窗只出現一次資料夾網址（沒有要人貼兩次）",
     (modalHTML.match(new RegExp(FAM.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g"))||[]).length===1,
     (modalHTML.match(new RegExp(FAM.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g"))||[]).length); }

// ══════════ ② 舊資料的 rawLink 不能被洗掉 ══════════
{ reset([v_("OLD",{rawLink:OLDRAW, driveFolder:""})]);
  openVideoModal("OLD", true);
  fields.e_code="COLD"; fields.e_raw="中文原始片名"; fields.e_vcopy="中文口播稿";
  fields.e_drive=FAM; fields.e_src="自製"; fields.e_stage="待處理"; fields.e_editor="";
  fields.e_date=""; fields.e_ref=""; fields.e_note=""; fields.e_url="";
  await saveVideo("OLD");
  const p=(writes.find(w=>w[1]==="videos")||[])[3];
  ok("存進去的資料夾是新填的那個", !!p && p.driveFolder===FAM, p&&p.driveFolder);
  ok("舊的 rawLink 原封不動留著（欄位不見≠資料要洗掉）", !!p && p.rawLink===OLDRAW, p&&p.rawLink); }
{ reset([v_("NEW",{rawLink:"", driveFolder:""})]);
  openVideoModal("NEW", true);
  fields.e_code="CNEW"; fields.e_raw="中文原始片名"; fields.e_vcopy="中文口播稿";
  fields.e_drive=FAM; fields.e_src="自製"; fields.e_stage="待處理"; fields.e_editor="";
  fields.e_date=""; fields.e_ref=""; fields.e_note=""; fields.e_url="";
  await saveVideo("NEW");
  const p=(writes.find(w=>w[1]==="videos")||[])[3];
  ok("本來就沒有 rawLink 的就留白（不會亂塞）", !!p && p.rawLink===""); }

// ══════════ ③ 「有沒有毛片」改看同一個地方 ══════════
{ reset([v_("A",{driveFolder:FAM})]);
  ok("只有資料夾 → 算有毛片", vidHasRaw(vid("A")));
  ok("vidRawLink 指到資料夾", vidRawLink(vid("A"))===FAM); }
{ reset([v_("B",{rawLink:OLDRAW})]);
  ok("舊資料只有 rawLink → 一樣算有毛片", vidHasRaw(vid("B")));
  ok("舊資料優先用自己填的那條", vidRawLink(vid("B"))===OLDRAW); }
{ reset([v_("C")]);
  ok("兩個都沒有 → 就是沒毛片（防線沒被拆）", !vidHasRaw(vid("C")));
  ok("沒毛片就亮「缺毛片」", vidMissing(vid("C")).map(x=>x.k).includes("raw"));
  ok("沒毛片就算「未拍」", vidNotShot(vid("C"))); }
{ reset([v_("D",{driveFolder:FAM})]);
  ok("有資料夾就不算未拍", !vidNotShot(vid("D")));
  ok("有資料夾就不亮「缺毛片」", !vidMissing(vid("D")).map(x=>x.k).includes("raw")); }
// 二創殼繼承源片的資料夾 → 也拿得到毛片
{ reset([v_("SRC",{driveFolder:FAM,stage:"已上片",published:true,publishedLink:"http://x"}),
         v_("SHELL",{locale:"en",sourceVideoId:"SRC",account:"tiktok-EN"})]);
  ok("二創殼拿得到源片資料夾當毛片位置", vidRawLink(vid("SHELL"))===FAM); }

// ══════════ ④ 毛片存量：只有資料夾也要算進去 ══════════
{ reset([v_("S1",{driveFolder:FAM}), v_("S2",{rawLink:OLDRAW}), v_("S3")]);
  const ids=rawStock().map(v=>v.id);
  ok("有資料夾的算庫存", ids.includes("S1"), ids);
  ok("舊的有 rawLink 的也算", ids.includes("S2"), ids);
  ok("兩個都沒有的不算", !ids.includes("S3"), ids); }

// ══════════ ⑤ 海外的「下載毛片」按鈕指到同一個地方 ══════════
{ reset([v_("SRC",{driveFolder:FAM,stage:"已上片",published:true,publishedLink:"http://x"}),
         v_("SHELL",{locale:"en",sourceVideoId:"SRC",account:"tiktok-EN"})], "Anna","intl");
  openIntlModal("SHELL");
  ok("有「下載毛片」按鈕", modalHTML.includes("Download raw footage"));
  ok("按鈕指到資料夾", modalHTML.includes(`href="${FAM}"`));
  ok("沒有再喊「缺毛片連結」", !/No .*raw footage.* linked/.test(modalHTML)); }
{ reset([v_("SRC",{driveFolder:"",rawLink:"",stage:"已上片",published:true,publishedLink:"http://x"}),
         v_("SHELL",{locale:"en",sourceVideoId:"SRC",account:"tiktok-EN"})], "Anna","intl");
  openIntlModal("SHELL");
  ok("真的沒有的時候還是要喊（防線沒被拆）", modalHTML.includes("raw footage")
     && /ask the admin to add it/.test(modalHTML)); }

// ══════════ ⑥ 新增影片：那一格存到資料夾去 ══════════
{ reset([]);
  newSimpleVideo();
  ok("新增視窗的那一格講的是資料夾", /存檔資料夾/.test(modalHTML));
  ok("新增視窗沒有另一格毛片連結", !/毛片雲端連結/.test(modalHTML));
  fields.sv_name="新拍的一支"; fields.sv_vcopy="口播稿"; fields.sv_link=FAM; fields.sv_lang="";
  await confirmBtn.onclick();
  const w=writes.find(x=>x[1]==="videos");
  const p=w&&w[3];
  ok("存到 driveFolder", !!p && p.driveFolder===FAM, p&&{d:p.driveFolder,r:p.rawLink});
  ok("而且立刻就算「有毛片」", !!p && vidHasRaw(p)); }

// ══════════ ⑦ 唯讀檢視也只剩一行 ══════════
{ reset([v_("V1",{driveFolder:FAM})]);
  openVideoModal("V1", false);
  ok("檢視視窗有存檔資料夾那一行", /存檔資料夾/.test(modalHTML));
  ok("檢視視窗沒有另外一行毛片雲端連結", !/毛片雲端連結/.test(modalHTML)); }

// ══════════ ⑧ 全角色 × 全分頁不炸 ══════════
{ reset([v_("V1",{driveFolder:FAM}), v_("V2",{rawLink:OLDRAW}), v_("V3"),
         v_("SRC",{driveFolder:FAM,stage:"已上片",published:true,publishedLink:"http://x"}),
         v_("SHELL",{locale:"en",sourceVideoId:"SRC",account:"tiktok-EN"})]);
  ["boss","manager","editor","intl"].forEach(r=>{
    localStorage.setItem("ecdr_role", r);
    localStorage.setItem("ecdr_user", r==="intl"?"Anna":(r==="boss"?"管理員":"小葵"));
    ["work","videos","cal"].forEach(tab=>{ CUR_TAB=tab; CAL_PLAT="tw"; CAL_PLAT_FOR=r; CAL_YM=null; WORK_ZONE="shopee";
      try{ render(); ok(`[${r}] ${tab} 畫得出來`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });
  }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
