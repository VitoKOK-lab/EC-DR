// v124：指派鎖 —— 主管把毛片指派給某位剪輯之後，其他剪輯照樣看得到那支片
// （數字才對得上、也才知道有人在做），但整列變灰、點不開，直到「上片完成」才恢復。
//
// 三個關鍵界線，這支測的就是這三條：
//   ① 只鎖源片 —— 版本殼的 assignedTo 是「誰建立的」不是指派，鎖了會讓剪輯互相點不開
//   ② 主管（管理員／經理人／人資）一律不鎖，被指派的本人也不鎖
//   ③ 解鎖點是「上片完成」（已上片／有上片連結），不是「已完成」（那只是剪完）
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, toasts=[];
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(Object.prototype.hasOwnProperty.call(fields,id)) return {value:fields[id]};
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const V=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"片"+id,videoCopy:"稿",
  rawLink:"http://raw",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  publishedLink:"",driveFolder:"",locale:"",channel:"",origLang:"",tags:[],products:[],
  usageHistory:[],metrics:[]},o||{});
function reset(){
  modalHTML=""; fields={}; toasts=[];
  STATE={ users:[{name:"小葵",role:"editor"},{name:"郁莚",role:"editor"},
                 {name:"HR小姐",role:"hr"},{name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:["蝦皮A"],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    videos:[
      V("FREE"),                                                    // 沒指派 → 誰都點得開
      V("MINE",{assignedTo:"小葵"}),                                 // 指派給我 → 點得開
      V("HERS",{assignedTo:"郁莚"}),                                 // 指派給別人 → 鎖
      V("WIP",{assignedTo:"郁莚",stage:"剪輯中",editor:"郁莚"}),       // 還在剪 → 仍然鎖
      V("DONE",{assignedTo:"郁莚",stage:"已完成",editor:"郁莚"}),      // 剪完但沒上片 → 仍然鎖
      V("AIRED",{assignedTo:"郁莚",stage:"已上片",editor:"郁莚",published:true,
                 scheduledDate:T0,publishedLink:"http://post",driveFolder:"http://d"}),  // 上片完成 → 解鎖
      V("LINKED",{assignedTo:"郁莚",stage:"已完成",editor:"郁莚",publishedLink:"http://post"}), // 貼了連結 → 解鎖
      V("SHELL",{assignedTo:"郁莚",channel:"shopee",sourceVideoId:"FREE",account:"蝦皮A"}),      // 版本殼 → 不鎖
    ] };
  CUR_TAB=null; VIEW_AS=null; VID_LANG=""; VID_TAGS=new Set(); VID_Q=""; VID_UNSCHED=false;
  ZONE_VIEW="tw"; VID_MODE="list"; ORIG_AUTO_RAN=true;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{},
    scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══════════ ① 鎖誰、不鎖誰 ══════════
reset(); as("小葵","editor");
ok("沒指派的不鎖", !assignLocked(vid("FREE")));
ok("指派給自己的不鎖", !assignLocked(vid("MINE")));
ok("指派給別人的鎖起來", assignLocked(vid("HERS")));
ok("別人正在剪的仍然鎖", assignLocked(vid("WIP")));
ok("剪完但還沒上片的仍然鎖（已完成≠上片完成）", assignLocked(vid("DONE")));
ok("已上片就解鎖", !assignLocked(vid("AIRED")));
ok("貼了上片連結就解鎖", !assignLocked(vid("LINKED")));
ok("版本殼不鎖（assignedTo 是建立者不是指派）", !assignLocked(vid("SHELL")));

// ══════════ ② 主管一律不鎖 ══════════
for(const [u,r] of [["管理員","boss"],["Regina","manager"],["HR小姐","hr"]]){
  as(u,r);
  ok(`${r} 看得到也打得開別人被指派的`, !assignLocked(vid("HERS")) && !assignLocked(vid("WIP")));
}
as("郁莚","editor");
ok("被指派的本人自己打得開", !assignLocked(vid("HERS")) && !assignLocked(vid("WIP")));

// ══════════ ③ 影片庫：照樣列出來，但那一列是灰的、沒有 onclick ══════════
reset(); as("小葵","editor");
{ const r=vidTableRow(vid("HERS"));
  ok("鎖住的那列標了 vlock", r.includes('class="vlock"'));
  ok("鎖住的那列沒有 onclick", !r.includes("editVideo("));
  ok("鎖住的那列寫出是誰的", r.includes("lockpill") && r.includes("郁莚"));
  const f=vidTableRow(vid("FREE"));
  ok("沒鎖的那列照舊點得開", f.includes(`editVideo('FREE')`) && !f.includes("vlock")); }
{ const c=vidCardHTML(vid("HERS")), f=vidCardHTML(vid("FREE"));
  ok("圖片模式也鎖", c.includes("vlock") && !c.includes("editVideo("));
  ok("圖片模式沒鎖的照舊", f.includes(`editVideo('FREE')`) && !f.includes("vlock")); }
// 這是整個設計的重點：不是藏起來，所以清單張數不變
{ VID_VIEW="raw";
  const n=vidVisibleList().length;
  as("郁莚","editor"); const n2=vidVisibleList().length;
  as("管理員","boss");  const n3=vidVisibleList().length;
  ok("三個人看到的影片支數完全一樣（鎖不是藏）", n===n2 && n2===n3 && n>0); }

// ══════════ ④ 月排程日視窗：列得出來、片名點不開、日期與移出照舊 ══════════
reset(); as("小葵","editor");
STATE.videos.forEach(v=>{ if(isSourceVid(v)) v.scheduledDate=T0; });
CAL_YM=T0.slice(0,7); openDay(T0);
{ const h=modalHTML;
  ok("日視窗列得出鎖住的那支", h.includes("片HERS"));
  ok("鎖住的片名不是連結", !h.includes(`editVideo('HERS')`));
  ok("沒鎖的片名照舊是連結", h.includes(`editVideo('FREE')`));
  ok("鎖住的那列改日期還是能按", /rescheduleVid\('HERS'/.test(h));
  ok("鎖住的那列移出排程還是能按", /unscheduleVid\('HERS'/.test(h)); }

// ══════════ ⑤ 守門在 editVideo，不是只有外觀 ══════════
reset(); as("小葵","editor");
modalHTML=""; editVideo("HERS");
ok("直接呼叫也打不開", modalHTML==="" && toasts.some(t=>t.includes("郁莚")));
modalHTML=""; toasts=[]; editVideo("FREE");
ok("沒鎖的照樣打得開", modalHTML.includes("影片內容"));
as("管理員","boss"); modalHTML=""; editVideo("HERS");
ok("管理員打得開", modalHTML.includes("影片內容"));

// ══════════ ⑥ 待認領池：維持原本的「看不到」（那一頁的意思是「你可以認領的」）══════════
reset(); as("小葵","editor");
{ const ids=poolAll().map(v=>v.id);
  ok("池子看不到指派給別人的", !ids.includes("HERS"));
  ok("池子看得到指派給自己的", ids.includes("MINE"));
  ok("池子看得到沒指派的", ids.includes("FREE")); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
