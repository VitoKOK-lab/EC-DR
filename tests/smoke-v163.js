// v163：① 指派毛片照「預排上片日期」排、沒排日期的沉到最後
//        ② 主管可以標「急件」，被指派的人畫面上那一列變紅並排到最前面
//        ③ 新增影片時就能填預排上片日期（以前只能先存再點開編輯視窗補）
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
let MODAL_OK=null;
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
// 攔下 showModal：把 body 存起來、把「按確定」的那支函式留給測試呼叫
showModal=(title, body, onOk)=>{ modalHTML=body; MODAL_OK=onOk; };
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
const RAW="https://drive.google.com/file/d/RAW";
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"片"+id,videoCopy:"腳本",
  rawLink:RAW,lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,
  claimedAt:"",finishedAt:"",durationMin:0,publishedLink:"",driveFolder:"",reviewStatus:"",
  locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],tags:[],
  products:[],usageHistory:[],metrics:[],deleted:false,source:"官方IP",shotAt:"",shotBy:"",
  urgent:false,urgentAt:"",urgentBy:""},o||{});
let WRITES=[];
function reset(videos, who, role){
  WRITES=[]; modalHTML=""; MODAL_OK=null; viewEl.innerHTML=""; VIEW_AS=null; BRAND="";
  VID_VIEW="raw"; VID_MODE="list"; POOL_FILTER="all"; POOL_Q=""; VID_Q=""; FOLD_OPEN={};
  for(const k in fields) delete fields[k];
  global.window.DB={ set:async(c,id,o)=>{WRITES.push(["set",c,id,o]);},
    update:async(c,id,p)=>{WRITES.push(["update",c,id,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{},
    videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"管理員",role:"boss"},
                     {name:"Regina",role:"manager"},{name:"泓儒",role:"editor"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],
      intlAccounts:[],shopeeAccounts:[],msAccounts:[],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user", who||"管理員"); localStorage.setItem("ecdr_role", role||"boss");
}
const D=(n)=>{ const d=new Date(Date.parse(FROZEN+"T00:00:00Z")+n*864e5); return d.toISOString().slice(0,10); };

// ══════════ ① 指派清單照上片日期排 ══════════
{ reset([ v_("沒排"), v_("後天",{scheduledDate:D(2)}), v_("昨天",{scheduledDate:D(-1)}),
          v_("明天",{scheduledDate:D(1)}), v_("也沒排") ]);
  const ids=dashSchedule().unassignedPool.map(v=>v.id);
  ok("先要上片的排前面", ids.slice(0,3).join()==="昨天,明天,後天", ids);
  ok("**沒排日期的沉到最下面**", ids.slice(3).sort().join()==="也沒排,沒排", ids);
  ok("五支都在（沒有人被排序弄不見）", ids.length===5, ids); }

// 沒有排序的話這一組會照 id（≈建檔順序）排 —— fixture 故意讓兩者不一樣
{ reset([ v_("a最早建",{scheduledDate:D(9)}), v_("z最晚建",{scheduledDate:D(1)}) ]);
  const ids=dashSchedule().unassignedPool.map(v=>v.id);
  ok("（前提）id 順序跟日期順序相反", "a最早建"<"z最晚建" );
  ok("排的是日期，不是建檔順序", ids.join()==="z最晚建,a最早建", ids); }

// 指派清單上要看得到日期，不然老闆沒辦法確認順序對不對
{ reset([ v_("A",{scheduledDate:D(1)}), v_("B") ]);
  const d=dashSchedule();
  const h=dashAssignFootageCard(["小葵"], d.poolN, d.unassignedPool, {});
  ok("每一列印出上片日", h.includes(D(1).slice(5)), h.slice(0,900));
  ok("沒排日期的那一列寫「沒排」", h.includes("沒排"), h.slice(0,900)); }
{ reset([ v_("過期",{scheduledDate:D(-3)}) ]);
  const d=dashSchedule();
  const h=dashAssignFootageCard(["小葵"], d.poolN, d.unassignedPool, {});
  ok("已經過期的上片日標紅（不然過期的混在裡面看不出來）", /var\(--red\)/.test(h), h.slice(0,900)); }

// ══════════ ② 急件 ══════════
{ reset([ v_("A") ], "管理員","boss");
  ok("主管標得了急件", canMarkUrgent()===true);
  reset([ v_("A") ], "Regina","manager");
  ok("經理人也可以", canMarkUrgent()===true);
  reset([ v_("A") ], "小葵","editor");
  ok("**剪輯自己不能標**（誰都能標的話大家都標急件，紅色就沒意義了）", canMarkUrgent()===false);
  reset([ v_("A") ], "管理員","boss"); VIEW_AS="小葵";
  ok("員工視角（唯讀預覽）底下也不行", canMarkUrgent()===false); VIEW_AS=null; }

{ reset([ v_("A") ], "管理員","boss");
  toggleUrgent("A");
  const w=WRITES.find(x=>x[0]==="update"&&x[1]==="videos"&&x[2]==="A");
  ok("按下去會寫 videos", !!w, WRITES);
  ok("標成急件", w && w[3].urgent===true, w&&w[3]);
  ok("記下是誰標的、什麼時候", w && w[3].urgentBy==="管理員" && /^\d{4}-\d\d-\d\dT/.test(String(w[3].urgentAt||"")), w&&w[3]); }
{ reset([ v_("A",{urgent:true,urgentBy:"管理員",urgentAt:"2026-09-08T10:00:00"}) ], "管理員","boss");
  toggleUrgent("A");
  const w=WRITES.find(x=>x[0]==="update"&&x[2]==="A");
  ok("再按一次就取消", w && w[3].urgent===false, w&&w[3]);
  ok("取消時把標記的人跟時間清掉", w && w[3].urgentBy==="" && w[3].urgentAt==="", w&&w[3]); }
{ reset([ v_("A") ], "小葵","editor");
  toggleUrgent("A");
  ok("**剪輯自己按了也寫不進去**（按鈕不畫出來只是第一道，真正的擋門在這）",
     !WRITES.some(x=>x[0]==="update"), WRITES); }
{ reset([ v_("A") ], "管理員","boss"); VIEW_AS="小葵";
  toggleUrgent("A");
  ok("員工視角底下一筆都不准寫", WRITES.length===0, WRITES); VIEW_AS=null; }

// 按鈕只給主管看到
{ reset([ v_("A") ], "管理員","boss");
  ok("主管看得到「標急件」鈕", /toggleUrgent\('A'\)/.test(urgentBtn(vid("A"))), urgentBtn(vid("A")));
  reset([ v_("A") ], "小葵","editor");
  ok("剪輯看不到那顆鈕", urgentBtn(vid("A"))===""); }
{ reset([ v_("A",{urgent:true}) ], "管理員","boss");
  ok("已經是急件的給「取消急件」", /取消急件/.test(urgentBtn(vid("A"))), urgentBtn(vid("A")));
  // 按鈕在 <label> 裡面：不擋掉預設行為的話，按它會順便把勾選框打勾
  ok("按鈕擋掉 label 的預設行為（不然會順手勾到那支毛片）",
     /event\.preventDefault\(\)/.test(urgentBtn(vid("A"))), urgentBtn(vid("A")));
  ok("也擋掉冒泡", /event\.stopPropagation\(\)/.test(urgentBtn(vid("A")))); }

// 被指派的人看到的：紅色 ＋ 排最前面
// v164：被指派的片改成進「本日工作」，不在待認領池了 —— 所以這裡分兩組驗。
{ reset([ v_("普通1",{assignedTo:"小葵",scheduledDate:D(1)}),
          v_("急件",{assignedTo:"小葵",scheduledDate:D(9),urgent:true,urgentBy:"管理員"}),
          v_("普通2",{assignedTo:"小葵",scheduledDate:D(2)}) ], "小葵","editor");
  const ids=myAssignedVids().map(v=>v.id);
  ok("**急件排到最前面**（就算它的上片日最晚）", ids[0]==="急件", ids); }
// 待認領池裡（沒指派給任何人的）也一樣
{ reset([ v_("普通1",{scheduledDate:D(1)}),
          v_("急件",{scheduledDate:D(9),urgent:true,urgentBy:"管理員"}),
          v_("普通2",{scheduledDate:D(2)}) ], "小葵","editor");
  const ids=poolAll().map(v=>v.id);
  ok("待認領池的急件也排最前面", ids[0]==="急件", ids);
  const h=poolRowsHTML(poolAll());
  ok("急件那一列掛 urg（整列變紅）", /<tr class="urg">/.test(h), h.slice(0,200));
  ok("只有急件那一列變紅", (h.match(/class="urg"/g)||[]).length===1, h.match(/class="urg"/g));
  ok("看得到「急件」兩個字", h.includes("急件"), h.slice(0,300));
  ok("滑過去知道是誰標的", /管理員[^"]*標為急件/.test(h), h.slice(0,400)); }

// 剪到一半的急件也要是紅的；做完了就不用紅了
{ reset([ v_("W",{claimedBy:"小葵",editor:"小葵",stage:"剪輯中",urgent:true}) ], "小葵","editor");
  const h=todayListCard([], [vid("W")], ()=>"", ()=>"");
  ok("剪輯中的急件那一列是紅的", /class="todo\s*\S*\s*urg"/.test(h)||/todo[^"]*urg/.test(h), h.slice(0,400));
  ok("看得到急件標記", h.includes("急件"), h.slice(0,400)); }
{ reset([ v_("W",{claimedBy:"小葵",editor:"小葵",stage:"已完成",urgent:true}) ], "小葵","editor");
  const h=todayListCard([], [vid("W")], ()=>"", ()=>"");
  ok("**已經做完的就不再紅**（紅色是「快去做」，不是「這支很重要」）",
     !/todo[^"]*\burg\b/.test(h), h.slice(0,400)); }

{ reset([ v_("A") ], "管理員","boss");
  ok("沒標急件就不出現紅標", urgentPill(vid("A"))==="");
  ok("空的不會爆", urgentPill(null)==="" && urgentBtn(null)==="" && isUrgent(null)===false); }

// ══════════ ③ 新增影片就能填上片日期 ══════════
{ reset([], "管理員","boss");
  newSimpleVideo();
  ok("新增視窗有預排上片日期欄", /id="sv_date"[^>]*type="date"/.test(modalHTML)||/type="date"[^>]*id="sv_date"/.test(modalHTML), modalHTML.slice(0,700));
  ok("預設留空（不要幫老闆亂填一個日期）", /id="sv_date" type="date" value=""/.test(modalHTML), modalHTML.slice(0,700));
  // v184（老闆：「預排日期和時間和儲存位置是必填，沒有寫，不給存檔」）
  ok("**也有上片時間欄，而且只選整點**", /id="sv_time"/.test(modalHTML) && modalHTML.includes(">15:00<"), modalHTML.slice(0,900));
  ok("三個欄位都標了必填", (modalHTML.match(/· 必填/g)||[]).length>=3, (modalHTML.match(/· 必填/g)||[]).length); }

(async()=>{
// 操作紀錄是在 dbWrite 的 .then() 裡寫的（非同步），要等一個 tick 才看得到
{ reset([ v_("A") ], "管理員","boss");
  toggleUrgent("A"); await new Promise(r=>setTimeout(r,20));
  ok("標急件有留操作紀錄", WRITES.some(x=>x[0]==="set"&&x[1]==="logs"&&x[3].action==="標為急件"),
     WRITES.filter(x=>x[1]==="logs").map(x=>x[3].action));
  ok("紀錄裡寫得出是哪一支片",
     WRITES.some(x=>x[1]==="logs" && String(x[3].target||"").includes("片A")),
     WRITES.filter(x=>x[1]==="logs").map(x=>x[3].target)); }
{ reset([ v_("A",{urgent:true}) ], "管理員","boss");
  toggleUrgent("A"); await new Promise(r=>setTimeout(r,20));
  ok("取消急件也有紀錄", WRITES.some(x=>x[1]==="logs"&&x[3].action==="取消急件"),
     WRITES.filter(x=>x[1]==="logs").map(x=>x[3].action)); }

{ reset([], "管理員","boss");
  newSimpleVideo();
  fields.sv_name="新片"; fields.sv_vcopy="口播內容";
  fields.sv_link="https://drive.google.com/drive/folders/F"; fields.sv_lang="";
  fields.sv_date=D(3); fields.sv_time="15:00";
  await MODAL_OK();
  const w=WRITES.find(x=>x[0]==="set"&&x[1]==="videos");
  ok("填了日期就存得進去", w && w[3].scheduledDate===D(3), w&&w[3].scheduledDate);
  ok("時間也一起存進去", w && w[3].publishTime==="15:00", w&&w[3].publishTime); }

{ reset([], "管理員","boss");
  newSimpleVideo();
  // v184：日期從「選填」變必填 —— 老闆看到月排程清單一整排「—」之後決定的。
  // 以前這裡驗的是「沒填要存成 null」；現在根本存不進去。
  fields.sv_name="新片"; fields.sv_vcopy="口播內容";
  fields.sv_link="https://drive.google.com/drive/folders/F"; fields.sv_lang="";
  fields.sv_date=""; fields.sv_time="15:00";
  const r=await MODAL_OK();
  const w=WRITES.find(x=>x[0]==="set"&&x[1]==="videos");
  ok("**沒填日期就不給存**", r===false && !w, w&&JSON.stringify(w[3].scheduledDate)); }

{ reset([], "管理員","boss");
  newSimpleVideo();
  fields.sv_name="新片"; fields.sv_vcopy="口播內容";
  fields.sv_link="https://drive.google.com/drive/folders/F"; fields.sv_lang=""; fields.sv_time="15:00";
  fields.sv_date=D(3)+"T00:00:00";
  await MODAL_OK();
  const w=WRITES.find(x=>x[0]==="set"&&x[1]==="videos");
  ok("只取日期那 10 碼", w && w[3].scheduledDate===D(3), w&&w[3].scheduledDate); }

// 新增進來就有日期的，馬上就會照日期排進指派清單
{ reset([ v_("舊的",{scheduledDate:D(5)}), v_("新增就排好的",{scheduledDate:D(1)}) ]);
  ok("新增時填的日期立刻影響指派清單的順序",
     dashSchedule().unassignedPool.map(v=>v.id)[0]==="新增就排好的"); }

// ══════════ ④ 搜尋：網址、商品連結、備註都找得到 ══════════
// 老闆手上常常只有一條雲端連結，要反查「這是哪一支」。
{ const FOLDER="https://drive.google.com/drive/folders/AAAZZZ";
  const REF="https://www.youtube.com/watch?v=REFREF";
  const PROD="https://shopee.tw/product/8888";
  reset([ v_("目標",{driveFolder:FOLDER, refLink:REF, productUrl:PROD,
                     note:"這支要等珊瑚項鍊到貨", rawName:"完全不相干的片名"}),
          v_("別支",{rawName:"另一支"}) ], "管理員","boss");
  const find=(q)=>{ VID_Q=q; const r=(STATE.videos||[]).filter(vidMatchQ).map(v=>v.id); VID_Q=""; return r; };
  ok("用儲存資料夾網址搜得到", find("AAAZZZ").join()==="目標", find("AAAZZZ"));
  ok("用參考網址搜得到", find("REFREF").join()==="目標", find("REFREF"));
  ok("用商品連結搜得到", find("shopee.tw/product/8888").join()==="目標", find("shopee.tw/product/8888"));
  ok("用備註搜得到", find("珊瑚項鍊").join()==="目標", find("珊瑚項鍊"));
  ok("貼一整條網址也搜得到（老闆是整條複製貼上的）", find(FOLDER).join()==="目標", find(FOLDER));
  ok("大小寫沒差", find("aaazzz").join()==="目標", find("aaazzz"));
  ok("搜不到的還是搜不到（不是全部都回傳）", find("不存在的字串").length===0);
  ok("原本就找得到的沒壞：片名照樣搜得到", find("另一支").join()==="別支", find("另一支")); }

// 舊資料的毛片連結（v145 併進資料夾之前的）也要找得到
{ reset([ v_("舊的",{rawLink:"https://drive.google.com/file/d/OLDLINK", driveFolder:""}) ], "管理員","boss");
  VID_Q="OLDLINK"; const r=(STATE.videos||[]).filter(vidMatchQ).map(v=>v.id); VID_Q="";
  ok("舊資料的毛片連結也搜得到", r.join()==="舊的", r); }

// 待認領池的搜尋跟影片庫用同一份欄位清單 —— 兩邊各寫一份就會漂開
{ const FOLDER="https://drive.google.com/drive/folders/POOLFOLDER";
  reset([ v_("池中",{driveFolder:FOLDER, note:"急著要"}) ], "小葵","editor");
  POOL_Q="POOLFOLDER"; const a=poolAll().filter(poolMatch).map(v=>v.id);
  POOL_Q="急著要";     const b=poolAll().filter(poolMatch).map(v=>v.id);
  POOL_Q="";
  ok("待認領池也能用網址搜", a.join()==="池中", a);
  ok("待認領池也能用備註搜", b.join()==="池中", b); }
{ ok("兩邊共用同一支 vidSearchText（不是各寫一份）",
     /function poolMatch[\s\S]{0,200}vidSearchText\(/.test(APP), "poolMatch 沒有用 vidSearchText"); }
{ reset([], "管理員","boss");
  ok("空的影片不會爆", vidSearchText(null)==="" ); }
// 搜得到但沒人知道搜得到＝等於沒有，提示文字要講出來
{ reset([ v_("A",{assignedTo:"小葵"}) ], "小葵","editor");
  const h=workPoolCard(poolAll(), poolAll(), poolCntOf(poolAll()), "小葵");
  ok("待認領的搜尋框提示有寫「網址」", /placeholder="[^"]*網址/.test(h), (h.match(/placeholder="[^"]*"/)||[])[0]); }
{ reset([ v_("A",{rawLink:RAW}) ], "管理員","boss");
  const h=viewVideos();
  ok("影片庫的搜尋框提示也有寫「網址」", /id="vid_q"[^>]*placeholder="[^"]*網址/.test(h),
     (h.match(/id="vid_q"[^>]*placeholder="[^"]*"/)||[])[0]); }

// ══════════ ⑤ 急件的紅色在手機上也要成立 ══════════
// 手機版 `table.responsive tr` 會把每一列刷成 var(--panel)（白底），
// 而它的 specificity（0,1,2）比 `tr.urg`（0,1,1）高 —— 不在手機的區塊裡再寫一次，
// 手機上整列就是白的。實測就是白的，這條是為了不要再犯。
{ const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  // ⚠️ 要錨在行首。寫成 /\s tr\.urg\{/ 的話，手機那條 `table.responsive tr.urg{`
  //    前面剛好有空白，也會被配到 —— 拿掉桌機規則測試照樣綠（突變 0 紅就是這樣抓到的）。
  ok("桌機有 tr.urg 的紅底", /\n\s*tr\.urg\{[^}]*var\(--redbg\)/.test(HTML), "找不到桌機的 tr.urg 紅底");
  ok("**手機版另外寫了一條蓋回來**",
     /table\.responsive tr\.urg\{[^}]*var\(--redbg\)/.test(HTML), "手機版沒有 tr.urg 的紅底");
  ok("（前提）手機版確實有那條會把列刷白的規則",
     /table\.responsive tr\{[^}]*background:var\(--panel\)/.test(HTML));
  ok("手機的紅底要排在刷白那條後面，不然被蓋掉",
     HTML.indexOf("table.responsive tr.urg{") > HTML.indexOf("table.responsive tr{display:block"));
  ok("todo 那一列的急件樣式也在", /\.todo\.urg\{[^}]*var\(--redbg\)/.test(HTML)); }

console.log(`\nv163（指派照上片日排・急件・新增就能排日期・搜尋含網址備註）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
