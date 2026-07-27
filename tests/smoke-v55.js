// HR 影片審查：兩份清單、看內容、檢查完成即鎖定（防止同一支片反覆送審）
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
let toasts=[]; let calls=[];
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
const _toast=toast; toast=(m,bad)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const M=T0.slice(0,7);
function reset(){
  toasts=[]; calls=[];
  STATE={ users:[{name:"HR小姐",role:"hr"},{name:"小葵",role:"editor"},{name:"Anna",role:"intl"},{name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:["s"],postPlatforms:[],intlAccounts:[],shopeeAccounts:[],msAccounts:[],exchangeRates:{},reviewSince:"2026-07-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    hrchecks:{ D2:{id:"D2",count:1,lastBy:"HR小姐",lastAt:T0+"T20:00:00",title:"已記錄的片",history:[{by:"HR小姐",at:T0+"T20:00:00",stage:"已上片"}]} },
    videos:[
      // 等待審查（剪完未審）
      {id:"P1",name:"待審的片A",rawName:"x",videoCopy:"這是A的口播文案",stage:"已完成",editor:"小葵",finishedAt:T0+"T02:00:00",
       reviewStatus:"",driveFolder:"http://d",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
      {id:"P2",name:"待審的片B",rawName:"x",stage:"已完成",editor:"Anna",finishedAt:T0+"T03:00:00",
       reviewStatus:"",driveFolder:"http://d",locale:"en",tags:[],products:[],usageHistory:[],metrics:[]},
      // 已完成（審過）
      {id:"D1",name:"已審過的片",rawName:"x",stage:"已完成",editor:"小葵",finishedAt:T0+"T04:00:00",
       reviewStatus:"通過",reviewedBy:"Regina",driveFolder:"http://d",publishedLink:"http://p",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
      // 已完成且 HR 記錄過
      {id:"D2",name:"已記錄的片",rawName:"x",stage:"已上片",published:true,editor:"小葵",finishedAt:T0+"T05:00:00",
       reviewStatus:"通過",driveFolder:"http://d",publishedLink:"http://p",
       locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
      // 曾被退回重修（重工提醒）
      {id:"R1",name:"曾被退回的片",rawName:"x",stage:"已完成",editor:"小葵",finishedAt:T0+"T06:00:00",
       reviewStatus:"通過",reviewNote:"字卡有錯",driveFolder:"http://d",publishedLink:"http://p",
       locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
      // 還在剪（兩份清單都不該出現）
      {id:"W1",name:"還在剪的片",rawName:"x",stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:T0+"T01:00:00",
       locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
      // 上個月完成的（測月份篩選）
      {id:"OLD",name:"上個月的片",rawName:"x",stage:"已完成",editor:"小葵",finishedAt:"2026-07-02T05:00:00",
       reviewStatus:"通過",driveFolder:"http://d",publishedLink:"http://p",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
    ] };
  localStorage.setItem("ecdr_user","HR小姐"); localStorage.setItem("ecdr_role","hr");
  HR_TAB="pending"; HR_WHO=""; HR_YM=null;
}
function hookDB(){ global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
  del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} }; }

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

reset();
// ── 人資這個角色到處都設得出來（v56 修：新增成員下拉漏了人資）──
{ localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
  const st=viewSettings();
  ok("新增成員下拉有人資", st.includes('<option value="hr">人資</option>'));
  ok("既有成員角色下拉有人資", st.includes('value="hr" ') || st.includes('value="hr">人資'));
  const d=viewDashboard();
  ok("員工視角可選人資", d.includes("人資"));
  ok("setMemberRole 接受 hr", (()=>{ let ok2=false; const _w=global.window.DB;
    global.window.DB={set:async()=>{},update:async(c,id,p)=>{ if(p.role==="hr") ok2=true; },del:async()=>{},scheduleSet:async()=>{},setSettings:async()=>{}};
    try{ setMemberRole("小葵","hr"); }catch(e){}
    global.window.DB=_w; return ok2; })());
  localStorage.setItem("ecdr_user","HR小姐"); localStorage.setItem("ecdr_role","hr"); }

// ── 分頁與兩份清單 ──
ok("HR 分頁＝影片審查＋儀表板", JSON.stringify(myTabs())===JSON.stringify([["hr","影片審查"],["dashboard","儀表板"]]));
let h=viewHR();
ok("有兩個分頁：等待審查／已完成", h.includes("等待審查") && h.includes("已完成") && h.includes("hrSetTab('pending')") && h.includes("hrSetTab('done')"));
ok("等待審查列出剪完未審的片（2 支）", h.includes("待審的片A") && h.includes("待審的片B"));
ok("等待審查不含已審過/已記錄/還在剪", !h.includes("已審過的片") && !h.includes("已記錄的片") && !h.includes("還在剪的片"));
ok("每列可點開看內容", h.includes("openVideoModal('P1',false)") && h.includes("看內容"));
ok("未鎖定的有『檢查完成』鍵", h.includes("hrCheckVideo('P1')"));
HR_TAB="done"; h=viewHR();
ok("已完成清單列出審過與已上片", h.includes("已審過的片") && h.includes("已記錄的片"));
ok("已完成清單不含待審的片", !h.includes("待審的片A"));
ok("已記錄的顯示✓你已檢查＋可清除", h.includes("✓ 你已檢查") && h.includes("hrClearCheck('D2')") && h.includes("再記一次"));
ok("曾被退回的標重工提醒", h.includes("曾被退回的片") && h.includes("⚠ 重工提醒") && h.includes("曾被退回重修"));
ok("清單顯示已檢查進度", h.includes("已檢查 1/"));
// ── 篩選 ──
reset(); HR_TAB="done"; HR_WHO="小葵"; h=viewHR();
ok("依同仁篩選", h.includes("已審過的片") && !h.includes("待審的片B"));
reset(); HR_TAB="done"; HR_YM=[2026,6]; h=viewHR();   // 2026-07
ok("依月份篩選（只留 7 月）", h.includes("已審過的片") && h.includes("上個月的片"));
reset(); HR_TAB="done"; HR_YM=[2026,7]; h=viewHR();   // 2026-08
ok("換月份後清空", h.includes("這個條件下沒有影片"));
// ── 點開看內容（文案在裡面）──
reset(); openVideoModal("P1", false);
ok("看內容視窗有文案", modalHTML.includes("這是A的口播文案") && modalHTML.includes("影片文案"));
ok("影片視窗不顯示人資欄位（不干擾其他人）", !modalHTML.includes("人資檢查"));
openVideoModal("D2", false);
ok("影片視窗完全沒有人資痕跡", !modalHTML.includes("hrUnlock") && !modalHTML.includes("人資"));
// ── 檢查完成＝寫入並鎖定 ──
reset(); hookDB(); hrCheckVideo("P1");
ok("檢查完成寫進 hrchecks（不動 videos）", calls.some(c=>c[0]==="set"&&c[1]==="hrchecks"&&c[2]==="P1"&&c[3].count===1&&c[3].lastBy==="HR小姐")
   && !calls.some(c=>c[1]==="videos"));
reset(); hookDB(); hrCheckVideo("D2");
ok("再記一次＝次數累加到 2", calls.some(c=>c[0]==="set"&&c[1]==="hrchecks"&&c[2]==="D2"&&c[3].count===2&&c[3].history.length===2));
reset(); hookDB(); hrClearCheck("D2");
ok("可清除自己的紀錄", calls.some(c=>c[0]==="del"&&c[1]==="hrchecks"&&c[2]==="D2"));
// 重工偵測
reset();
ok("檢查過又回到待審查＝重工", (()=>{ STATE.hrchecks.P1={id:"P1",count:1,lastBy:"HR小姐",lastAt:T0}; 
  const f=hrRework(vid("P1")); return f.some(x=>x.includes("檢查過後又出現在待審查")); })());
ok("檢查兩次以上＝重工", (()=>{ STATE.hrchecks.D1={id:"D1",count:3,lastBy:"HR小姐",lastAt:T0};
  return hrRework(vid("D1")).some(x=>x.includes("3 次")); })());
ok("完成後又回剪輯中＝重工", (()=>{ STATE.videos.push({id:"Z1",name:"重剪的片",stage:"剪輯中",editor:"小葵",finishedAt:T0+"T01:00:00",tags:[],products:[],usageHistory:[],metrics:[]});
  return hrRework(vid("Z1")).some(x=>x.includes("完成後又回到剪輯中")); })());
ok("正常的片沒有重工旗標", hrRework(vid("P2")).length===0);
// ── 人資的紀錄完全不影響剪輯流程（HR 已記錄過的 D2 照樣可以動）──
reset(); hookDB(); localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
editorMarkReviewed("P1");
ok("剪輯按已審過不受影響", calls.some(c=>c[0]==="update"&&c[1]==="videos"&&c[2]==="P1"&&c[3].reviewStatus==="通過"));
reset(); hookDB(); localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
reviewVid("D2","通過");
ok("HR 記錄過的片，Regina 照樣能改審核", calls.some(c=>c[0]==="update"&&c[1]==="videos"&&c[2]==="D2"&&c[3].reviewStatus==="通過"));
reset(); hookDB(); localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
reworkVideo("D2");
ok("HR 記錄過的片，照樣能退回重剪", calls.some(c=>c[0]==="update"&&c[1]==="videos"&&c[2]==="D2"));
// ── render 不炸 ──
reset();
[["HR小姐","hr","hr"],["HR小姐","hr","dashboard"],["管理員","boss","dashboard"],["小葵","editor","work"]].forEach(([u,r,tab])=>{
  localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); CUR_TAB=tab; WORK_ZONE="shopee"; CAL_PLAT="tw"; CAL_YM=null;
  try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
