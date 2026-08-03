// v70：交辦／通知的名單分成三份（剪輯／員工／海外剪輯）＋ HR 通知可以文字回覆
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
function reset(){
  calls=[]; toasts=[]; modalHTML=""; fields={};
  STATE={ users:[{name:"小葵",role:"editor",craft:"orig"},{name:"阿明",role:"editor",craft:"derived"},
                 {name:"Anna",role:"intl"},{name:"Ben",role:"intl"},
                 {name:"小美",role:"cs"},{name:"阿凱",role:"cs"},
                 {name:"Regina",role:"manager"},{name:"HR小姐",role:"hr"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:["s"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2026-07-01"},
    schedule:{}, logs:[], deletedVideos:[], shifts:{},
    tasks:{
      K1:{id:"K1",user:"小葵",date:T0,title:"回覆廠商",report:"",done:false,assignedBy:"Regina",ack:true,createdAt:T0+"T01:00:00"},
      N1:{id:"N1",kind:"notice",user:"小葵",date:T0,title:"月底前補交健檢報告",report:"",done:false,assignedBy:"HR小姐",ack:false,createdAt:T0+"T02:00:00"},
      N2:{id:"N2",kind:"notice",user:"小美",date:T0,title:"月底前補交健檢報告",report:"我下週一交",done:false,assignedBy:"HR小姐",ack:true,ackAt:T0+"T09:00:00",createdAt:T0+"T02:00:00"},
    },
    videos:[] };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; POOL_FILTER="all"; CAL_PLAT="tw"; CAL_YM=null;
}
function as(u,r){ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); }
function hookDB(){ global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
  del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} }; }
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const order=(html,names)=>names.map(n=>html.indexOf(n));
const ascending=(arr)=>arr.every((v,i)=>i===0 || (v>=0 && v>arr[i-1]));
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ── 分組工具 ──
reset();
{ const g=staffByGroup();
  ok("分成三個區塊（台灣兩排＋巴基斯坦）", g.length===3);
  ok("順序＝台灣剪輯行銷 → 台灣其他 → 巴基斯坦",
     JSON.stringify(g.map(x=>x.zh))===JSON.stringify(["台灣・剪輯行銷","台灣・其他","巴基斯坦"]));
  ok("第一排只有剪輯與行銷", g[0].people.every(u=>["editor","mkt"].includes(u.role)) && g[0].people.length===2);
  ok("第二排是其餘台灣同仁（含人資）", g[1].people.every(u=>["svc","ship","cs","hr"].includes(u.role)) && g[1].people.length===3);
  ok("巴基斯坦區只有巴基斯坦同仁", g[2].people.every(u=>u.role==="intl") && g[2].people.length===2);
  ok("組內照原本的排序（一創在前）", g[0].people[0].name==="小葵"); }

// ── 主管交辦：流程中控分三份清單 ──
reset(); as("Regina","manager");
let f=viewFlow();
ok("流程中控有三個小標", f.includes("台灣・剪輯行銷（2）") && f.includes("台灣・其他（3）") && f.includes("巴基斯坦（2）"));
ok("小標順序：台灣剪輯行銷 → 台灣其他 → 巴基斯坦",
   ascending(order(f,["台灣・剪輯行銷（2）","台灣・其他（3）","巴基斯坦（2）"])));
ok("每個人都在自己的區塊裡", (()=>{
  const seg=(a,b)=>f.slice(f.indexOf(a), b?f.indexOf(b):undefined);
  const s1=seg("台灣・剪輯行銷（2）","台灣・其他（3）"), s2=seg("台灣・其他（3）","巴基斯坦（2）"), s3=seg("巴基斯坦（2）");
  return s1.includes("小葵")&&s1.includes("阿明")&&!s1.includes("小美")
      && s2.includes("小美")&&s2.includes("阿凱")&&!s2.includes("Anna")
      && s3.includes("Anna")&&s3.includes("Ben"); })());
ok("每個人都還是可以交辦", ["小葵","阿明","小美","阿凱","Anna","Ben"].every(n=>f.includes("交辦 "+n+" 一件事")));
ok("交辦輸入框編號不重複", (()=>{ const ids=(f.match(/id="fa_(\d+)"/g)||[]); return new Set(ids).size===ids.length && ids.length===7; })());

// ── 團隊看板：今日成效也分三份 ──
// v119 分區：看板卡片會寫出片名，所以只列同區的人。三組要看得齊，得用看得到兩區的主管
reset(); as("Regina","manager");
let t=viewTeam();
// 小標要用 </h4> 錨定：篩選下拉裡也有「巴基斯坦（2）」這種字串，會跟小標撞在一起
const h4=(zh,n)=>`>${zh}（${n}）</h4>`;
ok("看板有三個小標", [h4("台灣・剪輯行銷",2),h4("台灣・其他",3),h4("巴基斯坦",2)].every(x=>t.includes(x)));
ok("看板小標順序一致", ascending(order(t,[h4("台灣・剪輯行銷",2),h4("台灣・其他",3),h4("巴基斯坦",2)])));
ok("每一組各自一個方框排列", (t.match(/class="teamgrid"/g)||[]).length===3);
{ // 台灣剪輯只看得到台灣那兩組
  as("小葵","editor"); const tw=viewTeam();
  ok("台灣剪輯只有台灣兩組", tw.includes(h4("台灣・剪輯行銷",2)) && tw.includes(h4("台灣・其他",3)) && !tw.includes("巴基斯坦（"));
  as("Regina","manager"); }
ok("看板仍然沒有按鍵", !t.includes("<button") && !t.includes("onclick"));

// ── HR 通知：收件人分清單 ──
reset(); as("HR小姐","hr");
let h=viewTeam();
{ const sel=h.split('id="hrn_who"')[1].split("</select>")[0];
  ok("有全體同仁", sel.includes('value="__all__"'));
  ok("可以只發給全體剪輯／員工／海外", sel.includes('value="__editor__"') && sel.includes('value="__cs__"') && sel.includes('value="__intl__"'));
  ok("個人名單依區塊分三組", sel.includes('label="台灣・剪輯行銷"') && sel.includes('label="台灣・其他"') && sel.includes('label="巴基斯坦"'));
  ok("每一個職位都送得出去", ["__editor__","__cs__","__intl__","__hr__"].every(k=>sel.includes('value="'+k+'"')));
  ok("整區也送得出去", ["__twmake__","__twrest__","__pk__"].every(k=>sel.includes('value="'+k+'"')));
  ok("分組順序：台灣剪輯行銷→台灣其他→巴基斯坦",
     ascending(order(sel,['label="台灣・剪輯行銷"','label="台灣・其他"','label="巴基斯坦"']))); }

// ── HR 看得到回覆 ──
ok("我發出的通知看得到回覆", h.includes("我發出的通知") && h.includes("小美") && h.includes("回覆：") && h.includes("我下週一交"));
ok("看得到誰收到了", h.includes("已收到 1/2"));

// ── 員工端：通知下面可以文字回覆 ──
reset(); as("小葵","editor");
let w=viewWork();
ok("剪輯的通知下面有回覆框", w.includes(`id="nr_N1"`) && w.includes("noticeReply('N1'"));
reset(); as("小美","cs");
let wc=viewWork();
ok("員工的通知下面有回覆框", wc.includes(`id="nr_N2"`) && wc.includes("noticeReply('N2'"));
ok("已回覆的內容會帶回輸入框", wc.includes('value="我下週一交"'));

// ── 回覆會寫進資料庫 ──
reset(); as("小葵","editor"); hookDB(); noticeReply("N1","收到，明天處理");
ok("回覆寫入 tasks.report", calls.some(c=>c[0]==="update"&&c[1]==="tasks"&&c[2]==="N1"&&c[3].report==="收到，明天處理"));
reset(); as("小葵","editor"); hookDB(); VIEW_AS="小葵"; noticeReply("N1","不該寫進去");
ok("員工視角唯讀不會寫入", !calls.length);
VIEW_AS=null;

// ── 團隊看板顯示回覆內容 ──
reset(); as("Regina","manager");
t=viewTeam();
ok("看板的通知列顯示回覆", t.includes("我下週一交") && t.includes("回覆"));

// ── 發給某一組 ──
(async()=>{
  reset(); as("HR小姐","hr"); hookDB();
  fields.hrn_who="__cs__"; fields.hrn_txt="員工專屬通知";
  await hrNotify(); await wait(20);
  let sets=calls.filter(c=>c[0]==="set"&&c[1]==="tasks");
  ok("只發給員工組（2 人）", sets.length===2 && sets.every(c=>["小美","阿凱"].includes(c[3].user)));

  reset(); as("HR小姐","hr"); hookDB();
  fields.hrn_who="__intl__"; fields.hrn_txt="海外專屬通知";
  await hrNotify(); await wait(20);
  sets=calls.filter(c=>c[0]==="set"&&c[1]==="tasks");
  ok("只發給海外組（2 人）", sets.length===2 && sets.every(c=>["Anna","Ben"].includes(c[3].user)));

  reset(); as("HR小姐","hr"); hookDB();
  fields.hrn_who="__editor__"; fields.hrn_txt="剪輯專屬通知";
  await hrNotify(); await wait(20);
  sets=calls.filter(c=>c[0]==="set"&&c[1]==="tasks");
  ok("只發給剪輯組（2 人）", sets.length===2 && sets.every(c=>["小葵","阿明"].includes(c[3].user)));

  reset(); as("HR小姐","hr"); hookDB();
  fields.hrn_who="__all__"; fields.hrn_txt="全體";
  await hrNotify(); await wait(20);
  sets=calls.filter(c=>c[0]==="set"&&c[1]==="tasks");
  ok("全體＝含人資共七個人", sets.length===7);

  // ── render 不炸 ──
  reset(); hookDB();
  [["Regina","manager","flow"],["管理員","boss","flow"],["HR小姐","hr","team"],
   ["小葵","editor","work"],["小美","cs","work"],["Anna","intl","team"]].forEach(([u,r,tab])=>{
    as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
