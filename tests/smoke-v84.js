// v84：密碼只存雜湊，不存明文
//  ・PBKDF2-SHA256＋每人一組隨機鹽；同一組密碼兩次算出來也不一樣（鹽不同）
//  ・登入驗證走雜湊；舊制的明文帳號還驗得過，但一定會被「請先設定密碼」擋住
//  ・設密碼／改密碼一律寫 pwHash 並把 pw 清成空字串
//  ・新規則：至少 6 碼、不能全是 0、不能沿用原本的密碼
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
let calls=[], toasts=[], alerts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };
global.alert=(m)=>{ alerts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
function reset(users){
  calls=[]; toasts=[]; alerts=[]; fields={};
  STATE={ users: users||[{name:"小葵",role:"editor",craft:"orig"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["s"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00",pcOnly:false},
    schedule:{}, logs:[], tasks:{}, deletedVideos:[], videos:[], shifts:{} };
  CUR_TAB=null; VIEW_AS=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const pwCall=()=>calls.filter(x=>x[0]==="update"&&x[1]==="users"&&x[3]&&x[3].pwHash!==undefined).pop();
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{
  // ══ 雜湊本身 ══
  const h1=await pwMakeHash("a12345");
  ok("格式是 pbkdf2$次數$鹽$雜湊", /^pbkdf2\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(h1));
  ok("次數夠多（至少 10 萬）", +h1.split("$")[1]>=100000);
  ok("裡面看不到密碼原文", !h1.includes("a12345"));
  const h2=await pwMakeHash("a12345");
  ok("同一組密碼算兩次結果不同（每人一組隨機鹽）", h1!==h2);
  ok("但兩個都驗得過", (await pwVerifyHash("a12345",h1)) && (await pwVerifyHash("a12345",h2)));
  ok("錯的密碼驗不過", (await pwVerifyHash("a12346",h1))===false);
  ok("差一個字也驗不過", (await pwVerifyHash("a1234",h1))===false);
  ok("空密碼驗不過", (await pwVerifyHash("",h1))===false);
  ok("亂七八糟的雜湊不會炸", (await pwVerifyHash("a12345","亂碼"))===false);
  ok("空的雜湊不會炸", (await pwVerifyHash("a12345",""))===false);
  ok("被竄改的雜湊驗不過", (await pwVerifyHash("a12345", h1.slice(0,-4)+"AAAA"))===false);
  { const p=h1.split("$"); const weakened=["pbkdf2","1",p[2],p[3]].join("$");
    ok("把次數竄改成 1 也驗不過", (await pwVerifyHash("a12345", weakened))===false); }
  ok("中文密碼也可以", await pwVerifyHash("我的密碼123", await pwMakeHash("我的密碼123")));

  // ══ 登入驗證 ══
  ok("有雜湊就比對雜湊", await pwCheck({name:"x", pwHash:h1}, "a12345"));
  ok("有雜湊時錯的密碼進不來", (await pwCheck({name:"x", pwHash:h1}, "0000"))===false);
  ok("有雜湊時明文欄位不再有用",
     (await pwCheck({name:"x", pwHash:h1, pw:"0000"}, "0000"))===false);
  ok("舊制明文帳號還驗得過（不然大家進不來）", await pwCheck({name:"x", pw:"2387"}, "2387"));
  ok("完全沒設過的人用 0000", await pwCheck({name:"x"}, "0000"));
  ok("明文清空後 0000 也不通（已經轉成雜湊了）",
     (await pwCheck({name:"x", pw:"", pwHash:h1}, "0000"))===false);

  // ══ 誰要被要求重設 ══
  reset([{name:"甲",role:"editor",pw:"0000"},
         {name:"乙",role:"editor",pw:"2387"},
         {name:"丙",role:"editor",pwHash:h1,pw:""},
         {name:"丁",role:"editor",pwHash:h1,pw:"",pwSet:false},
         {name:"管理員",role:"boss"}]);
  as("甲","editor"); ok("還在用 0000 → 要重設", mustSetPw()===true);
  as("乙","editor"); ok("舊制的 4 碼明文 → 也要重設（v84 全員重設）", mustSetPw()===true);
  as("丙","editor"); ok("已經是雜湊 → 不用重設", mustSetPw()===false);
  as("丁","editor"); ok("管理員剛重設過（pwSet:false）→ 就算有雜湊也要再設一次", mustSetPw()===true);
  as("管理員","boss"); ok("管理員不受限", mustSetPw()===false);

  // ══ 設密碼：寫雜湊、清明文 ══
  reset([{name:"小葵",role:"editor",pw:"0000"},{name:"管理員",role:"boss"}]);
  as("小葵","editor");
  fields.pwg1="a12345"; fields.pwg2="a12345";
  await savePwGate(); await wait(60);
  { const c=pwCall();
    ok("寫入的是雜湊", !!c && /^pbkdf2\$/.test(c[3].pwHash));
    ok("明文被清成空字串", !!c && c[3].pw==="");
    ok("寫進去的雜湊驗得過新密碼", !!c && await pwVerifyHash("a12345", c[3].pwHash));
    ok("寫進去的雜湊驗不過舊密碼", !!c && (await pwVerifyHash("0000", c[3].pwHash))===false);
    ok("資料庫裡完全看不到密碼原文", !!c && !JSON.stringify(c[3]).includes("a12345")); }

  // ══ 新規則 ══
  const bad=async(a,b,expect,name)=>{
    reset([{name:"小葵",role:"editor",pw:"0000"},{name:"管理員",role:"boss"}]);
    as("小葵","editor"); fields.pwg1=a; fields.pwg2=(b==null?a:b);
    await savePwGate(); await wait(60);
    ok(name, !pwCall() && toasts.some(t=>t.includes(expect)));
  };
  await bad("12345", null, "至少 6 碼", "5 碼不給過");
  await bad("0000",  null, "至少 6 碼", "舊的 4 碼 0000 也不給過");
  await bad("000000",null, "全部是 0",  "全部是 0 不給過");
  await bad("a12345","b67890","兩次輸入不一致","兩次要一致");
  reset([{name:"小葵",role:"editor",pw:"0000"},{name:"管理員",role:"boss"}]);
  as("小葵","editor"); fields.pwg1="000000"; fields.pwg2="000000";
  await savePwGate(); await wait(60);
  ok("6 碼但全是 0 → 擋下來", !pwCall());
  reset([{name:"小葵",role:"editor",pw:"0000"},{name:"管理員",role:"boss"}]);
  as("小葵","editor"); fields.pwg1="123456"; fields.pwg2="123456";
  await savePwGate(); await wait(60);
  ok("6 位純數字可以（沒有規定一定要英文）", !!pwCall());
  // 不能沿用原本的密碼
  reset([{name:"小葵",role:"editor",pwHash:await pwMakeHash("a12345"),pw:""},{name:"管理員",role:"boss"}]);
  as("小葵","editor"); fields.pwg1="a12345"; fields.pwg2="a12345";
  await savePwGate(); await wait(80);
  ok("不能沿用原本的密碼", !pwCall() && toasts.some(t=>t.includes("不能沿用原本的密碼")));

  // ══ 自行修改密碼 ══
  reset([{name:"小葵",role:"editor",pwHash:await pwMakeHash("a12345"),pw:"",pwSet:true,pwAt:"2026-01-05T09:00:00"},
         {name:"管理員",role:"boss"}]);
  as("小葵","editor");
  global.prompt=(m)=>String(m).includes("目前")?"a12345":"b67890";
  await changeMyPw(); await wait(80);
  { const c=pwCall();
    ok("改密碼也是寫雜湊", !!c && /^pbkdf2\$/.test(c[3].pwHash) && c[3].pw==="");
    ok("新雜湊驗得過新密碼", !!c && await pwVerifyHash("b67890", c[3].pwHash));
    ok("舊密碼不能用了", !!c && (await pwVerifyHash("a12345", c[3].pwHash))===false); }
  reset([{name:"小葵",role:"editor",pwHash:await pwMakeHash("a12345"),pw:"",pwSet:true},{name:"管理員",role:"boss"}]);
  as("小葵","editor");
  global.prompt=(m)=>String(m).includes("目前")?"錯的":"b67890";
  await changeMyPw(); await wait(80);
  ok("目前密碼打錯就改不了", !pwCall() && toasts.some(t=>t.includes("目前密碼錯誤")));
  reset([{name:"小葵",role:"editor",pwHash:await pwMakeHash("a12345"),pw:"",pwSet:true},{name:"管理員",role:"boss"}]);
  as("小葵","editor");
  global.prompt=(m)=>String(m).includes("目前")?"a12345":"123";
  await changeMyPw(); await wait(80);
  ok("改密碼也要滿 6 碼", !pwCall() && toasts.some(t=>t.includes("至少 6 碼")));
  global.prompt=()=>null;

  // ══ 管理員重設 ══
  reset([{name:"小葵",role:"editor",pwHash:await pwMakeHash("a12345"),pw:"",pwSet:true},{name:"管理員",role:"boss"}]);
  as("管理員","boss");
  resetMemberPw("小葵"); await wait(30);
  { const c=calls.filter(x=>x[0]==="update"&&x[1]==="users"&&x[2]==="小葵").pop();
    ok("重設會把雜湊清掉", !!c && c[3].pwHash==="");
    ok("重設回 0000 並要求他再設一次", !!c && c[3].pw==="0000" && c[3].pwSet===false); }

  // ══ 真的登入一次 ══
  reset([{name:"小葵",role:"editor",pwHash:await pwMakeHash("a12345"),pw:""},{name:"管理員",role:"boss"}]);
  global.prompt=()=>"a12345";
  await loginAs(STATE.users[0]); await wait(60);
  ok("用新密碼登入得進去", localStorage.getItem("ecdr_user")==="小葵");
  localStorage.removeItem("ecdr_user");
  reset([{name:"小葵",role:"editor",pwHash:await pwMakeHash("a12345"),pw:""},{name:"管理員",role:"boss"}]);
  global.prompt=()=>"0000";
  await loginAs(STATE.users[0]); await wait(60);
  ok("用舊的 0000 登不進去", localStorage.getItem("ecdr_user")!=="小葵"
     && toasts.some(t=>t.includes("密碼錯誤")));
  reset([{name:"小葵",role:"editor",pw:"2387"},{name:"管理員",role:"boss"}]);
  global.prompt=()=>"2387";
  await loginAs(STATE.users[0]); await wait(60);
  ok("還沒轉換的舊帳號照樣登得進來", localStorage.getItem("ecdr_user")==="小葵");
  as("小葵","editor");
  ok("但一進來就被擋著要設新密碼", mustSetPw()===true);
  global.prompt=()=>null;

  // ══ 畫面 ══
  reset([{name:"小葵",role:"editor",pw:"0000"},{name:"管理員",role:"boss"}]);
  as("小葵","editor"); CUR_TAB="work"; render();
  ok("被擋住時只看得到設定密碼的畫面", viewEl.innerHTML.includes("請先設定你自己的密碼"));
  ok("寫的是至少 6 碼", viewEl.innerHTML.includes("至少 6 碼"));
  ok("講明系統不留密碼原文", viewEl.innerHTML.includes("不會保留你的密碼原文"));
  ok("不再叫大家用預設的 0000", !viewEl.innerHTML.includes("目前用的是預設密碼"));

  // ══ 管理員畫面不會洩漏員工密碼 ══
  reset([{name:"小葵",role:"editor",pwHash:await pwMakeHash("a12345"),pw:""},{name:"管理員",role:"boss"}]);
  as("管理員","boss");
  { const st=viewSettings();
    ok("設定頁不會印出員工的雜湊", !st.includes("pbkdf2$"));
    ok("設定頁本來就沒有員工密碼欄", !/id="mb_pw"/.test(st)); }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
