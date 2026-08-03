// v107：職位與排序重整。
//  ① 新增行銷／客服／出貨三個不剪片職位（權限比照員工）
//  ② 海外剪輯改叫「巴基斯坦」
//  ③ 台灣與巴基斯坦分開：台灣第一排＝剪輯＋行銷，第二排＝其餘，巴基斯坦排最後
const fs=require("fs"), path=require("path");
// 這支要直接讀 ROLE_LABEL／STAFF_ROLES 這些頂層常數，所以 const 也一起拿掉
// （只會命中頂格的宣告，函式內縮排的 const 不受影響）
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
let calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
function reset(){
  calls=[]; toasts=[]; fields={}; modalHTML="";
  STATE={ users:[
      // 故意打散，看排序有沒有生效
      {name:"Asmeer",role:"intl"},
      {name:"茂泉",role:"ship"},
      {name:"小華",role:"editor",craft:"derived"},
      {name:"HR小姐",role:"hr"},
      {name:"郁莚",role:"editor",craft:"orig"},
      {name:"小美",role:"cs"},
      {name:"阿豪",role:"svc"},
      {name:"小葵",role:"editor",craft:"orig"},
      {name:"阿華",role:"mkt"},
      {name:"阿明",role:"editor",craft:"both"},
      {name:"Regina",role:"manager"},
      {name:"管理員",role:"boss"} ],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:["s"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, logs:[], deletedVideos:[], shifts:{}, tasks:{}, videos:[] };
  CUR_TAB=null; VIEW_AS=null; TEAM_GROUP="all"; TEAM_Q=""; WORK_ZONE="shopee"; POOL_FILTER="all"; POOL_Q="";
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const order=(html,names)=>names.map(n=>html.indexOf(n));
const ascending=(arr)=>arr.every((v,i)=>i===0 || (v>=0 && v>arr[i-1]));
const h4=(zh,n)=>`>${zh}（${n}）</h4>`;
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{
  // ══ ① 新職位存在、名稱正確 ══
  reset();
  ok("行銷職位存在", ROLE_LABEL.mkt==="行銷");
  ok("客服職位存在", ROLE_LABEL.svc==="客服");
  ok("出貨職位存在", ROLE_LABEL.ship==="出貨");
  ok("海外剪輯改叫巴基斯坦", ROLE_LABEL.intl==="巴基斯坦");
  ok("原本的職位沒被動到", ROLE_LABEL.editor==="剪輯" && ROLE_LABEL.cs==="員工" && ROLE_LABEL.hr==="人資");

  // ══ ② 新職位的分頁比照員工 ══
  reset();
  for(const r of ["mkt","svc","ship"]){
    ok(`${ROLE_LABEL[r]}的分頁跟員工一樣`, JSON.stringify(ROLE_TABS[r])===JSON.stringify(ROLE_TABS.cs)); }
  as("阿華","mkt");
  { const tabs=myTabs().map(t=>t[0]);
    ok("行銷只看得到本日工作與團隊看板", JSON.stringify(tabs)===JSON.stringify(["work","team"]));
    ok("行銷看不到影片庫與月排程", !tabs.includes("videos") && !tabs.includes("cal")); }
  as("茂泉","ship");
  ok("出貨也是一樣兩個分頁", JSON.stringify(myTabs().map(t=>t[0]))===JSON.stringify(["work","team"]));

  // ══ ③ 排序：台灣（剪輯→行銷→客服→出貨→員工→人資）→ 巴基斯坦 ══
  reset();
  { const names=staffSorted(STATE.users.filter(u=>STAFF_ROLES.includes(u.role))).map(u=>u.name);
    // v115：一創／二創分工已移除，剪輯內部只依名字排（中文名在前）
    ok("整體順序正確", JSON.stringify(names)===JSON.stringify(
      ["小華","小葵","阿明","郁莚","阿華","阿豪","茂泉","小美","HR小姐","Asmeer"]));
    ok("剪輯排最前面", names.slice(0,4).every(n=>["小葵","郁莚","阿明","小華"].includes(n)));
    ok("行銷緊接在剪輯後面", names[4]==="阿華");
    ok("巴基斯坦排最後", names[names.length-1]==="Asmeer"); }

  // ══ ④ 分區塊：台灣兩排＋巴基斯坦 ══
  reset();
  { const g=staffByGroup();
    ok("分成三個區塊", g.length===3);
    ok("區塊名稱與順序", JSON.stringify(g.map(x=>x.zh))===JSON.stringify(["台灣・剪輯行銷","台灣・其他","巴基斯坦"]));
    ok("第一排＝剪輯＋行銷（5 人）", g[0].people.length===5 && g[0].people.every(u=>["editor","mkt"].includes(u.role)));
    ok("第一排裡剪輯在行銷前面", g[0].people[4].name==="阿華");
    ok("第二排＝客服＋出貨＋員工＋人資（4 人）", g[1].people.length===4 && g[1].people.every(u=>["svc","ship","cs","hr"].includes(u.role)));
    ok("第三排＝巴基斯坦", g[2].people.length===1 && g[2].people[0].name==="Asmeer");
    ok("管理員與經理人不在區塊裡", !g.some(x=>x.people.some(u=>["boss","manager"].includes(u.role)))); }

  // ══ ⑤ 團隊看板／流程中控的小標 ══
  reset(); as("小葵","editor"); CUR_TAB="team";
  { const t=viewTeam();
    ok("看板三個小標都在", [h4("台灣・剪輯行銷",5),h4("台灣・其他",4),h4("巴基斯坦",1)].every(x=>t.includes(x)));
    ok("看板小標順序正確", ascending(order(t,[h4("台灣・剪輯行銷",5),h4("台灣・其他",4),h4("巴基斯坦",1)])));
    ok("篩選下拉列得出新職位", t.includes(">行銷（1）") && t.includes(">客服（1）") && t.includes(">出貨（1）"));
    ok("篩選下拉用巴基斯坦", t.includes(">巴基斯坦（1）") && !t.includes(">海外剪輯（")); }
  reset(); as("Regina","manager"); CUR_TAB="flow";
  { const f=viewFlow();
    ok("流程中控三個小標都在", [h4("台灣・剪輯行銷",5),h4("台灣・其他",4),h4("巴基斯坦",1)].every(x=>f.includes(x)));
    ok("新職位的人也能被交辦", ["阿華","阿豪","茂泉"].every(n=>f.includes("交辦 "+n+" 一件事"))); }

  // 依職位篩選
  reset(); as("小葵","editor"); TEAM_GROUP="ship";
  { const t=viewTeam();
    ok("只看出貨", t.includes("茂泉") && !t.includes("阿華") && !t.includes("Asmeer")); }
  reset(); as("小葵","editor"); TEAM_GROUP="intl";
  ok("只看巴基斯坦", viewTeam().includes("Asmeer") && !viewTeam().includes("茂泉"));

  // ══ ⑥ 新職位＝不剪片 ══
  reset(); as("阿華","mkt");
  { const w=viewWork();
    ok("行銷的工作頁沒有待認領", !w.includes("待認領"));
    ok("行銷的工作頁沒有建立二創版本", !w.includes("建立二創版本"));
    ok("行銷還是有今天要做的事", w.includes("今天要做的事")); }
  reset();
  ok("新職位都算不剪片", ["mkt","svc","ship"].every(r=>NO_EDIT_ROLES.includes(r)));
  ok("剪輯與巴基斯坦不算不剪片", !NO_EDIT_ROLES.includes("editor") && !NO_EDIT_ROLES.includes("intl"));

  // ══ ⑦ 打卡與出勤涵蓋新職位 ══
  reset();
  { const names=attStaff().map(u=>u.name);
    ok("出勤名單含新職位", ["阿華","阿豪","茂泉"].every(n=>names.includes(n)));
    ok("出勤名單不含管理員與經理人", !names.includes("管理員") && !names.includes("Regina")); }
  reset(); as("茂泉","ship");
  await clockIn("茂泉"); await wait(30);
  ok("出貨打得了卡", calls.some(c=>c[0]==="set"&&c[1]==="shifts"&&c[3].user==="茂泉"));

  // ══ ⑧ 設定頁：新增成員選得到新職位 ══
  reset(); as("管理員","boss"); CUR_TAB="settings";
  { const st=viewSettings();
    ok("新增成員下拉有行銷", st.includes('<option value="mkt">行銷</option>'));
    ok("新增成員下拉有客服", st.includes('<option value="svc">客服</option>'));
    ok("新增成員下拉有出貨", st.includes('<option value="ship">出貨</option>'));
    ok("新增成員下拉用巴基斯坦", st.includes('>巴基斯坦</option>') && !st.includes('>海外剪輯</option>'));
    ok("既有成員的職位下拉也換得動", st.includes(`setMemberRole('茂泉',this.value)`));
    ok("不剪片的職位不用選一創二創", (()=>{
      const row=(st.split(">茂泉</b>")[1]||"").slice(0,1600); return row.includes("不剪片"); })()); }
  reset(); as("管理員","boss");
  fields.mb_name="新人"; fields.mb_role="mkt"; fields.mb_craft="orig";
  addMember(); await wait(30);
  ok("新增行銷成員送得出去", calls.some(c=>c[0]==="set"&&c[1]==="users"&&c[3].name==="新人"&&c[3].role==="mkt"));
  reset(); setMemberRole("小美","ship"); await wait(30);
  ok("可以把員工改成出貨", calls.some(c=>c[0]==="update"&&c[1]==="users"&&c[2]==="小美"&&c[3].role==="ship"));
  reset(); setMemberRole("小美","不存在的職位"); await wait(30);
  ok("亂傳職位不會寫進去", !calls.length);

  // ══ ⑨ HR 通知：整區與單一職位都送得出去 ══
  reset(); as("HR小姐","hr"); CUR_TAB="team";
  { const sel=viewTeam().split('id="hrn_who"')[1].split("</select>")[0];
    ok("可以發給整區", ["__twmake__","__twrest__","__pk__"].every(k=>sel.includes('value="'+k+'"')));
    ok("可以發給單一職位", ["__editor__","__mkt__","__svc__","__ship__","__cs__","__intl__"].every(k=>sel.includes('value="'+k+'"')));
    ok("個人名單依區塊分組", sel.includes('label="台灣・剪輯行銷"') && sel.includes('label="巴基斯坦"')); }
  ok("整區代碼解得開", JSON.stringify(noticeTargetRoles("__twmake__"))===JSON.stringify(["editor","mkt"]));
  ok("單一職位代碼解得開", JSON.stringify(noticeTargetRoles("__ship__"))===JSON.stringify(["ship"]));
  ok("全體代碼＝所有職位", JSON.stringify(noticeTargetRoles("__all__"))===JSON.stringify(STAFF_ROLES));
  ok("選到某個人時回 null（當成單一收件人）", noticeTargetRoles("茂泉")===null);
  reset(); as("HR小姐","hr");
  fields.hrn_who="__twmake__"; fields.hrn_txt="第一排的請看一下";
  await hrNotify(); await wait(40);
  { const got=calls.filter(c=>c[0]==="set"&&c[1]==="tasks").map(c=>c[3].user);
    ok("發給第一排＝5 個人", got.length===5);
    ok("收件人正是剪輯與行銷", ["小葵","郁莚","阿明","小華","阿華"].every(n=>got.includes(n)));
    ok("沒有誤發給巴基斯坦", !got.includes("Asmeer")); }

  // ══ ⑩ 登入頁分區 ══
  reset();
  { const rows=[]; const grid={innerHTML:"",appendChild:(e)=>{ if(e.__g) rows.push("#"+e.textContent); else rows.push(e.textContent||e.innerHTML); }};
    const _get=global.document.getElementById, _create=global.document.createElement;
    global.document.getElementById=(id)=> id==="userGrid" ? grid : _get(id);
    global.document.createElement=()=>{ const e=el(); Object.defineProperty(e,"className",{set(v){ e.__g=(v==="loginGroup"); },get(){return "";}}); return e; };
    localStorage.removeItem("ecdr_last"); LOGIN_ALL=true;
    bootLogin();
    global.document.getElementById=_get; global.document.createElement=_create;
    const groups=rows.filter(x=>String(x).startsWith("#")).map(x=>x.slice(1));
    ok("登入頁分區順序", JSON.stringify(groups)===JSON.stringify(["台灣・剪輯行銷","台灣・其他","巴基斯坦","管理層"]));
    const first=rows.slice(rows.indexOf("#台灣・剪輯行銷")+1, rows.indexOf("#台灣・其他"));
    ok("登入頁第一排＝剪輯後面接行銷", JSON.stringify(first)===JSON.stringify(["小華","小葵","阿明","郁莚","阿華"]));
    LOGIN_ALL=false; }

  // ══ ⑪ 每日固定工作範本認得新職位 ══
  reset();
  ok("範本角色清單含新職位", TPL_ROLES.some(p=>p[0]==="mkt") && TPL_ROLES.some(p=>p[0]==="svc") && TPL_ROLES.some(p=>p[0]==="ship"));
  ok("範本角色清單用巴基斯坦", (TPL_ROLES.find(p=>p[0]==="intl")||[])[1]==="巴基斯坦");
  reset(); STATE.settings.dailyTemplates=[{t:"排本週貼文",r:"mkt"},{t:"打卡",r:"all"},{t:"剪片",r:"editor"}];
  as("阿華","mkt");
  ok("行銷看到自己的＋全部的", JSON.stringify(workPresets())===JSON.stringify(["排本週貼文","打卡"]));
  as("小葵","editor");
  ok("剪輯看不到行銷的", JSON.stringify(workPresets())===JSON.stringify(["打卡","剪片"]));

  // ══ ⑫ render 不炸 ══
  reset();
  [["小葵","editor","work"],["阿華","mkt","work"],["阿豪","svc","work"],["茂泉","ship","work"],
   ["Asmeer","intl","work"],["小葵","editor","team"],["Regina","manager","flow"],
   ["HR小姐","hr","team"],["HR小姐","hr","attend"],["管理員","boss","dashboard"],
   ["管理員","boss","settings"],["管理員","boss","attend"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
