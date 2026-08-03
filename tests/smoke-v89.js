// v89：① 管理員密碼也只存雜湊（舊密碼登入成功時當場轉換，設定頁不再顯示原文）
//      ② 有文案未拍片的不進剪輯的待認領
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
global.requestAnimationFrame=(f)=>f();
Object.defineProperty(global,"navigator",{configurable:true,writable:true,
  value:{onLine:true, userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120"}});
global.confirm=()=>true; global.prompt=()=>null; global.alert=()=>{};
let calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==';
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",rawLink:"",
  stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",publishedLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",source:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(opts){
  opts=opts||{};
  calls=[]; toasts=[]; fields={};
  VID_LANG=""; VID_VIEW="rawNoSched"; VID_TAGS=new Set(); VID_Q="";
  POOL_FILTER="all"; POOL_Q="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Regina",role:"manager",pwHash:H},{name:"管理員",role:"boss"}],
    settings: Object.assign({dailyTarget:4,videoTags:[],sources:["s"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00",scheduleHorizonDays:30}, opts.settings||{}),
    schedule:{}, logs:[], deletedVideos:[], shifts:{}, tasks:{}, videos:(opts.videos||[]).slice() };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; CAL_PLAT="tw"; CAL_YM=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{},
    setSettings:async(p)=>{calls.push(["settings",p]); Object.assign(STATE.settings,p);} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const setCall=()=>calls.filter(x=>x[0]==="settings").pop();
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{
  // ══════════ ① 管理員密碼 ══════════
  // 完全沒設過 → 預設 1234
  reset();
  ok("沒設過就是預設 1234", await adminPwCheck("1234"));
  ok("錯的進不去", (await adminPwCheck("9999"))===false);
  // 舊的明文
  reset({settings:{adminPassword:"myoldpw"}});
  ok("舊的明文密碼還驗得過（不然你自己也進不去）", await adminPwCheck("myoldpw"));
  ok("舊的明文密碼錯的進不去", (await adminPwCheck("nope"))===false);
  // 已經是雜湊
  const h=await pwMakeHash("newadmin1");
  reset({settings:{adminPwHash:h, adminPassword:""}});
  ok("有雜湊就比對雜湊", await adminPwCheck("newadmin1"));
  ok("有雜湊時錯的進不去", (await adminPwCheck("1234"))===false);
  reset({settings:{adminPwHash:h, adminPassword:"myoldpw"}});
  ok("有雜湊之後明文欄位不再有用", (await adminPwCheck("myoldpw"))===false);
  reset({settings:{adminPwHash:"   ", adminPassword:"myoldpw"}});
  ok("雜湊只有空白 → 退回比對明文（不會把人鎖在外面）", await adminPwCheck("myoldpw"));

  // 登入時自動轉換
  reset({settings:{adminPassword:"myoldpw"}});
  global.prompt=()=>"myoldpw";
  await ownerLogin(); await wait(80);
  { const c=setCall();
    ok("用舊密碼登入得進去", localStorage.getItem("ecdr_user")==="管理員");
    ok("登入當下就換成雜湊", !!c && /^pbkdf2\$\d+\$/.test(c[1].adminPwHash||""));
    ok("同時把明文清掉", !!c && c[1].adminPassword==="");
    ok("寫進去的雜湊驗得過原本的密碼", !!c && await pwVerifyHash("myoldpw", c[1].adminPwHash));
    ok("設定裡看不到密碼原文", !!c && !JSON.stringify(c[1]).includes("myoldpw")); }
  localStorage.removeItem("ecdr_user");
  // 已經轉換過就不會重複寫
  reset({settings:{adminPwHash:h, adminPassword:""}});
  global.prompt=()=>"newadmin1";
  await ownerLogin(); await wait(80);
  ok("已經是雜湊就不再重寫設定", !setCall() && localStorage.getItem("ecdr_user")==="管理員");
  localStorage.removeItem("ecdr_user");
  // 密碼錯就不會轉換也不會登入
  reset({settings:{adminPassword:"myoldpw"}});
  global.prompt=()=>"wrong";
  await ownerLogin(); await wait(80);
  ok("密碼錯不會登入", localStorage.getItem("ecdr_user")!=="管理員");
  ok("密碼錯不會亂寫設定", !setCall() && toasts.some(t=>t.includes("密碼錯誤")));
  global.prompt=()=>null;

  // 設定頁不再顯示密碼
  reset({settings:{adminPassword:"myoldpw"}}); as("管理員","boss");
  { const st=viewSettings();
    ok("設定頁不會印出管理員密碼", !st.includes("myoldpw"));
    ok("那一格是密碼欄、預設空的", st.includes('id="set_pw" type="password"') && !st.includes('id="set_pw" value'));
    ok("有寫「留空＝不改」", st.includes("留空＝維持原本的密碼"));
    ok("有說明系統不留原文", st.includes("不留原文")); }
  reset({settings:{adminPwHash:h}}); as("管理員","boss");
  ok("設定頁也不會印出雜湊", !viewSettings().includes("pbkdf2$"));

  // 從設定頁改密碼
  const baseFields=()=>{ fields.set_daily="4"; fields.set_horizon="30"; fields.set_shop=""; fields.set_plat="";
    fields.set_wstart="09:00"; fields.set_wend="18:00"; fields.set_grace="10";
    fields.set_attstart=""; fields.set_olat=""; fields.set_olng=""; fields.set_tpl=""; };
  reset({settings:{adminPassword:"myoldpw"}}); as("管理員","boss");
  baseFields(); fields.set_pw="brandnew9";
  await saveSettings(); await wait(80);
  { const c=setCall();
    ok("改密碼存的是雜湊", !!c && /^pbkdf2\$/.test(c[1].adminPwHash||""));
    ok("改密碼會清掉明文", !!c && c[1].adminPassword==="");
    ok("新雜湊驗得過新密碼", !!c && await pwVerifyHash("brandnew9", c[1].adminPwHash));
    ok("舊密碼失效", !!c && (await pwVerifyHash("myoldpw", c[1].adminPwHash))===false); }
  reset({settings:{adminPwHash:h}}); as("管理員","boss");
  baseFields(); fields.set_pw="";
  await saveSettings(); await wait(80);
  { const c=setCall();
    ok("留空＝不動密碼", !!c && c[1].adminPwHash===undefined && c[1].adminPassword===undefined);
    ok("其他設定照樣存得起來", !!c && c[1].dailyTarget===4); }
  reset({settings:{adminPwHash:h}}); as("管理員","boss");
  baseFields(); fields.set_pw="123";
  await saveSettings(); await wait(80);
  ok("管理員密碼也要滿 6 碼", !setCall() && toasts.some(t=>t.includes("至少 6 碼")));
  reset({settings:{adminPwHash:h}}); as("管理員","boss");
  baseFields(); fields.set_pw="000000";
  await saveSettings(); await wait(80);
  ok("管理員密碼不能全是 0", !setCall() && toasts.some(t=>t.includes("全部是 0")));

  // ══════════ ② 有文案未拍片不進待認領 ══════════
  const POOL=[
    v_("S1",{videoCopy:"口播一"}),                    // 有文案、沒毛片 → 不該出現
    v_("S2",{videoCopy:"口播二"}),                    // 同上
    v_("R1",{rawLink:"http://d"}),                    // 有毛片 → 可認領
    v_("R2",{rawLink:"http://d",videoCopy:"口播三"}), // 文案毛片都有 → 可認領
    v_("R3"),                                         // 兩個都沒填 → 也還沒拍，不該出現（v108）
    v_("C1",{channel:"shopee",sourceVideoId:"R1"}),   // 二創殼本來就沒毛片連結 → 照樣可認領
  ];
  reset({videos:POOL}); as("小葵","editor");
  { const w=viewWork();
    ok("有文案沒毛片的不出現在待認領", !w.includes("claimVid('S1')") && !w.includes("claimVid('S2')"));
    ok("有毛片的照樣可以認領", w.includes("claimVid('R1')"));
    ok("文案毛片都有的也可以認領", w.includes("claimVid('R2')"));
    ok("兩個都沒填的也不出現（只填片名＝還沒拍）", !w.includes("claimVid('R3')"));
    ok("二創殼不受影響，照樣可認領", w.includes("claimVid('C1')"));
    ok("待認領的數字扣掉了（3 支：R1 R2 C1）", w.includes('<span class="fn">3</span>')); }
  reset({videos:POOL}); as("小葵","editor");
  ok("指派給我也一樣不出現（沒毛片就是不能剪）", (()=>{
    STATE.videos[0].assignedTo="小葵"; return !viewWork().includes("claimVid('S1')"); })());
  // 拍完之後（補上毛片連結）就會回到待認領
  reset({videos:[v_("S1",{videoCopy:"口播一",rawLink:"http://d"})]}); as("小葵","editor");
  ok("補上毛片連結就回到待認領", viewWork().includes("claimVid('S1')"));
  // 影片庫那邊照舊看得到
  reset({videos:POOL}); as("Regina","manager"); VID_VIEW="scriptNoSched";
  ok("影片庫的「未拍・未排程」照樣列得出來",
     viewVideos().includes("'S1'") && viewVideos().includes("'S2'"));

  // ══ render 不炸 ══
  reset({videos:POOL});
  [["小葵","editor","work"],["Regina","manager","videos"],["Regina","manager","flow"],
   ["管理員","boss","settings"],["管理員","boss","dashboard"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
