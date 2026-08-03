// 員工排序：一創在前、二創次之、海外與英文名在後；HR 唯讀看交辦
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
function reset(){
  STATE={ users:[
      // 故意打散順序，看排序有沒有生效
      {name:"Asmeer",role:"intl"},
      {name:"小華",role:"editor",craft:"derived"},
      {name:"Edward",role:"editor",craft:"orig"},
      {name:"小葵",role:"editor",craft:"orig"},
      {name:"Pakistan Team",role:"intl"},
      {name:"阿明",role:"editor",craft:"both"},
      {name:"Regina",role:"manager"},
      {name:"HR小姐",role:"hr"},
      {name:"管理員",role:"boss"} ],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:["s"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2026-07-01"},
    schedule:{}, logs:[], shifts:{}, deletedVideos:[],
    tasks:{ K1:{id:"K1",user:"小葵",date:T0,title:"回覆廠商",report:"已聯絡完成，等對方回覆",done:false,assignedBy:"Regina",ack:true,createdAt:T0} },
    videos:[] };
  CUR_TAB=null; VIEW_AS=null;
}
function as(u,r){ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); }
function order(html, names){ return names.map(n=>html.indexOf(n)); }
function ascending(arr){ return arr.every((v,i)=>i===0 || (v>=0 && v>arr[i-1])); }
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

reset();
// ── 排序規則本身 ──
const sorted=staffNamesSorted(["editor","intl"]);
ok("順序：一創中文 → 兩種都做 → 二創 → 海外英文",
   JSON.stringify(sorted)===JSON.stringify(["小葵","Edward","阿明","小華","Asmeer","Pakistan Team"]));
ok("一創排最前面", sorted[0]==="小葵" && sorted[1]==="Edward");
ok("同組內中文名在英文名前面", sorted.indexOf("小葵")<sorted.indexOf("Edward"));
ok("海外排最後", sorted.slice(-2).every(n=>["Asmeer","Pakistan Team"].includes(n)));

// ── 登入頁：分區順序 Taiwan → 海外版 → 人資 → 管理層 ──
{ reset();
  const order=[]; const grid={innerHTML:"",appendChild:(el)=>{ if(el.__g) order.push("#"+el.textContent); else order.push(el.textContent||el.innerHTML); }};
  const _get=global.document.getElementById;
  global.document.getElementById=(id)=> id==="userGrid" ? grid : _get(id);
  global.document.createElement=(tag)=>{ const e=el(); Object.defineProperty(e,"className",{set(v){ e.__g=(v==="loginGroup"); },get(){return "";}}); return e; };
  bootLogin();
  global.document.getElementById=_get;
  const groups=order.filter(x=>String(x).startsWith("#")).map(x=>x.slice(1));
  ok("登入頁分區：台灣兩排 → 巴基斯坦 → 管理層",
     JSON.stringify(groups)===JSON.stringify(["台灣・剪輯行銷","台灣・其他","巴基斯坦","管理層"]));
  const tw=order.slice(order.indexOf("#台灣・剪輯行銷")+1, order.indexOf("#台灣・其他"));
  ok("登入頁台灣剪輯區照分工排序", JSON.stringify(tw)===JSON.stringify(["小葵","Edward","阿明","小華"])); }

// ── 流程中控（Regina）──
reset(); as("Regina","manager");
let h=viewFlow();
ok("流程中控員工卡照順序", ascending(order(h,["小葵","Edward","阿明","小華","Asmeer","Pakistan Team"])));

// ── 儀表板的下拉 ──
reset(); as("管理員","boss");
let d=viewDashboard();
ok("指派交辦下拉照順序分組", d.includes('label="一次創作"') && d.includes('label="二次創作"') && d.includes('label="巴基斯坦"'));
{ const seg=d.split('id="asg_who"')[1].split("</select>")[0];
  ok("交辦下拉：一創在二創之前", seg.indexOf("一次創作")<seg.indexOf("二次創作"));
  ok("交辦下拉：巴基斯坦在最後", seg.indexOf("巴基斯坦")>seg.indexOf("二次創作")); }
{ const seg=d.split('id="va_who"')[1].split("</select>")[0];
  ok("員工視角下拉有人資分組（不會誤歸一創）", seg.includes('label="人資"') && seg.split('label="一次創作"')[1].split("</optgroup>")[0].indexOf("HR小姐")<0); }
{ const seg=d.split('id="afp_who"')[1].split("</select>")[0];
  ok("指派毛片下拉照順序", ascending(order(seg,["小葵","Edward","阿明","小華"]))); }

// ── 人資：看得到交辦，但不能操作 ──
reset(); as("HR小姐","hr");
h=viewTeam();
ok("HR 看得到交辦與回報", h.includes("交辦完成") && h.includes("回覆廠商") && h.includes("已聯絡完成"));
ok("HR 沒有交辦輸入框", !h.includes("flowAssign("));
ok("HR 沒有審核按鈕", !h.includes("reviewVid("));
ok("HR 沒有轉移/刪除交辦的操作", !h.includes("transferTask(") && !h.includes("delTask("));
ok("HR 的員工卡也照排序", ascending(order(h.split("今日成效")[1],["小葵","Edward","阿明","小華","Asmeer","Pakistan Team"])));

// ── Regina 仍然可以交辦 ──
reset(); as("Regina","manager");
ok("Regina 有交辦輸入框", viewFlow().includes("flowAssign("));

// ── render 不炸 ──
[["Regina","manager","flow"],["HR小姐","hr","team"],["管理員","boss","dashboard"]].forEach(([u,r,tab])=>{
  reset(); as(u,r); CUR_TAB=tab;
  try{ render(); ok(`[${u}] ${tab}`, true); }catch(e){ ok(`[${u}] ${tab} → ${e.message}`, false); } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
