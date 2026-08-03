// v86：剪輯的「待認領（毛片＋二創版本）」加搜尋 —— 影片變多了，光靠快選分類不夠找
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
let calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==';
const v_=(o)=>Object.assign({id:o.id,code:"",name:"",rawName:"x",rawLink:"http://raw",stage:"待處理",editor:"",claimedBy:"",
  assignedTo:"",locale:"",channel:"",source:"",tags:[],products:[],usageHistory:[],metrics:[],scheduledDate:null},o);
// 一池子各式各樣的待認領項目
const POOL=[
  v_({id:"P1",code:"2609171",name:"每天得罪一個珠寶品牌",source:"老闆自拍"}),
  v_({id:"P2",code:"2609172",name:"翡翠開箱",source:"外部公司",tags:["新片"]}),
  v_({id:"P3",code:"2609173",name:"珠寶保養教學",source:"老闆自拍"}),
  v_({id:"P4",code:"2609174",name:"蝦皮限時優惠",channel:"shopee",source:"外部公司"}),
  v_({id:"P5",code:"2609175",name:"Ruby ring intro",locale:"en",nameEn:"Ruby ring intro"}),
  v_({id:"P6",code:"2609176",name:"馬來版介紹",channel:"ms"}),
];
function reset(pool){
  calls=[]; toasts=[]; fields={};
  POOL_FILTER="all"; POOL_Q="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Anna",role:"intl",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["新片","舊片"],sources:["老闆自拍","外部公司"],postPlatforms:[],
      intlAccounts:[],shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, logs:[], deletedVideos:[], shifts:{}, tasks:{}, videos:(pool||POOL).slice() };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; CAL_PLAT="tw"; CAL_YM=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
// 待認領那張卡的表格裡有哪幾支
const inPool=(h)=>{ const seg=(h.split("待認領（毛片＋二創版本）")[1]||"").split("</table>")[0];
  return POOL.map(v=>v.id).filter(id=>seg.includes("'"+id+"'")); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ 搜尋框存在 ══
reset(); as("小葵","editor");
{ const w=viewWork();
  ok("待認領上面有搜尋框", w.includes('id="pool_q"') && w.includes("setPoolQ("));
  ok("搜尋框在快選分類的下面（先分類再細找）",
     w.indexOf("setPoolFilter(")<w.indexOf('id="pool_q"'));
  ok("搜尋框在清單上面", w.indexOf('id="pool_q"')<w.indexOf("claimVid("));
  ok("沒搜尋時不出現清除鍵", !w.includes(`setPoolQ('')`));
  ok("沒搜尋時全部列出來", inPool(w).length===6); }

// ══ 搜得到 ══
reset(); as("小葵","editor"); setPoolQ("珠寶");
{ const w=viewWork();
  ok("用片名搜（珠寶 → 2 支）", JSON.stringify(inPool(w))===JSON.stringify(["P1","P3"]));
  ok("有搜尋時出現清除鍵", w.includes(`setPoolQ('')`)); }
reset(); as("小葵","editor"); setPoolQ("2609174");
ok("用編號搜", JSON.stringify(inPool(viewWork()))===JSON.stringify(["P4"]));
reset(); as("小葵","editor"); setPoolQ("外部公司");
ok("用來源搜", JSON.stringify(inPool(viewWork()))===JSON.stringify(["P2","P4"]));
reset(); as("小葵","editor"); setPoolQ("新片");
ok("用標籤搜", JSON.stringify(inPool(viewWork()))===JSON.stringify(["P2"]));
reset(); as("小葵","editor"); setPoolQ("shopee");
ok("用平台搜", JSON.stringify(inPool(viewWork()))===JSON.stringify(["P4"]));
reset(); as("小葵","editor"); setPoolQ("ruby RING");
ok("英文不分大小寫", JSON.stringify(inPool(viewWork()))===JSON.stringify(["P5"]));
reset(); as("小葵","editor"); setPoolQ("  珠寶  ");
ok("前後空白會被去掉", inPool(viewWork()).length===2);
reset(); as("小葵","editor"); setPoolQ("完全沒有這種片");
{ const w=viewWork();
  ok("找不到時清單是空的", inPool(w).length===0);
  ok("找不到時寫出搜尋的字", w.includes("找不到符合「完全沒有這種片」的項目"));
  ok("找不到時不會誤說「目前沒有可認領的項目」", !w.includes("目前沒有指派給你或可認領的項目")); }

// ══ 清除 ══
reset(); as("小葵","editor"); setPoolQ("珠寶");
setPoolQ("");
{ const w=viewWork();
  ok("清除之後全部回來", inPool(w).length===6);
  ok("清除之後清除鍵消失", !w.includes(`setPoolQ('')`)); }

// ══ 搜尋跟快選分類疊在一起 ══
reset(); as("小葵","editor"); setPoolFilter("tw"); setPoolQ("珠寶");
ok("分類＋搜尋一起套用", JSON.stringify(inPool(viewWork()))===JSON.stringify(["P1","P3"]));
reset(); as("小葵","editor"); setPoolFilter("shopee"); setPoolQ("珠寶");
ok("分類外的搜不到（蝦皮裡沒有珠寶）", inPool(viewWork()).length===0);
reset(); as("小葵","editor"); setPoolQ("珠寶");
{ const w=viewWork();
  const tabs=(w.split('class="vtabs"')[1]||"").split("</div>")[0];
  ok("快選上的數字跟著搜尋變", tabs.includes('vtab-n">2<'));
  ok("沒符合的分類顯示 0", (tabs.match(/vtab-n">0</g)||[]).length>=3); }
reset(); as("小葵","editor");
{ const tabs=(viewWork().split('class="vtabs"')[1]||"").split("</div>")[0];
  ok("沒搜尋時快選顯示全部數量", tabs.includes('vtab-n">6<')); }

// ══ 右上角那顆數字 ══
reset(); as("小葵","editor");
ok("沒篩沒搜時只顯示總數", viewWork().includes('class="pill ok">6</span>'));
reset(); as("小葵","editor"); setPoolQ("珠寶");
ok("有搜尋時顯示「符合／總數」", viewWork().includes('class="pill ok">2/6</span>'));
reset(); as("小葵","editor"); setPoolQ("找不到");
ok("零筆時那顆變成警示色", viewWork().includes('class="pill wa">0/6</span>'));

// ══ 搜尋不會影響其他地方 ══
reset(); as("小葵","editor"); setPoolQ("珠寶");
{ const w=viewWork();
  ok("上方「待認領」統計仍然是總數", w.includes('<span class="fn">6</span>'));
  ok("折疊標題的數字仍然是總數", w.includes('待認領<span class="n">6</span>')); }
reset(); as("小葵","editor"); calls.length=0; setPoolQ("珠寶");
ok("搜尋不會寫入資料庫", !calls.length);
reset(); as("小葵","editor"); setPoolQ("珠寶");
ok("搜到的還是可以直接認領", viewWork().includes("claimVid('P1')"));

// ══ 海外剪輯看到英文 ══
reset(); as("Anna","intl");
{ const w=viewWork();
  ok("海外的搜尋框是英文", w.includes("Find a video") && !w.includes("找影片"));
  // 只盯這次新增的那幾個介面字串（影片名稱本身是中文資料，不算洩漏；那個 audit-lang 管）
  ok("這次新增的介面字串沒有中文版洩漏",
     ["找影片","清除","找不到符合"].every(zh=>!w.includes(zh))); }
reset(); as("Anna","intl"); setPoolQ("nothing here");
{ const w=viewWork();
  ok("海外的清除鍵是英文", w.includes(">Clear<"));
  ok("海外找不到時的提示是英文", w.includes("Nothing matches")); }

// ══ 沒有待認領項目時 ══
reset([]); as("小葵","editor");
{ const w=viewWork();
  ok("池子空的時候搜尋框還是在（不會消失）", w.includes('id="pool_q"'));
  ok("池子空的時候顯示原本的提示", w.includes("目前沒有指派給你或可認領的項目")); }

// ══ render 不炸 ══
(async()=>{
  reset(); setPoolQ("珠寶");
  [["小葵","editor","work"],["Anna","intl","work"],["管理員","boss","work"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });
  reset(); setPoolQ("");
  [["小葵","editor","work"],["管理員","boss","dashboard"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}（沒搜尋）`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
