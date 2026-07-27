// HR 每月工作計畫與每日工作確認
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
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const [Y,M]=[+T0.slice(0,4), +T0.slice(5,7)];
const D=(d)=>`${Y}-${String(M).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
const d1=D(1), d2=D(2), d3=D(3);
let calls=[];
function reset(){
  calls=[];
  STATE={ users:[{name:"HR小姐",role:"hr"},{name:"小葵",role:"editor"},{name:"Anna",role:"intl"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:["s"],postPlatforms:[],intlAccounts:[],shopeeAccounts:[],msAccounts:[],exchangeRates:{},reviewSince:"2026-07-01"},
    schedule:{}, logs:[], deletedVideos:[],
    tasks:{
      // d1：兩筆，一筆已看過 → 部分已看
      K1:{id:"K1",user:"小葵",date:d1,title:"剪輯當日影片",report:"完成三支影片剪輯",done:true,assignedBy:"",ack:true,createdAt:d1+"T01:00:00",hrSeenBy:"HR小姐",hrSeenAt:d1+"T18:00:00"},
      K2:{id:"K2",user:"小葵",date:d1,title:"文案內容整理",report:"整理完十篇文案內容",done:false,assignedBy:"Regina",ack:true,createdAt:d1+"T02:00:00"},
      // d2：一筆全看過＋已按本日確認
      K3:{id:"K3",user:"小葵",date:d2,title:"影片清單整理",report:"清單已重新排序完成",done:true,assignedBy:"",ack:true,createdAt:d2+"T01:00:00",hrSeenBy:"HR小姐",hrSeenAt:d2+"T18:00:00"},
      // d3：完全沒看
      K4:{id:"K4",user:"小葵",date:d3,title:"吾家影片／封面製作",report:"",done:false,assignedBy:"",ack:true,createdAt:d3+"T01:00:00"},
    },
    shifts:{ [ "小葵__"+d1 ]:{id:"a",user:"小葵",date:d1,clockIn:d1+"T01:00:00",clockOut:d1+"T10:00:00"},
             [ "小葵__"+d2 ]:{id:"b",user:"小葵",date:d2,clockIn:d2+"T01:00:00",clockOut:d2+"T10:00:00",hrConfirmedBy:"HR小姐",hrConfirmedAt:d2+"T19:00:00"} },
    videos:[
      {id:"V1",name:"完成且已審過的片",rawName:"x",stage:"已完成",editor:"小葵",claimedAt:d1+"T02:00:00",finishedAt:d1+"T05:00:00",
       reviewStatus:"通過",reviewedBy:"Regina",driveFolder:"http://d",publishedLink:"http://p",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
      {id:"V2",name:"完成但待審核的片",rawName:"x",stage:"已完成",editor:"小葵",claimedAt:d1+"T03:00:00",finishedAt:d1+"T06:00:00",
       reviewStatus:"",driveFolder:"http://d",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
      {id:"V3",name:"被退回的片",rawName:"x",stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:d1+"T04:00:00",
       reviewStatus:"退回",reviewNote:"字卡有錯",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
      {id:"V9",name:"別人的片",rawName:"x",stage:"已完成",editor:"Anna",finishedAt:d1+"T05:00:00",locale:"en",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
    ] };
  localStorage.setItem("ecdr_user","HR小姐"); localStorage.setItem("ecdr_role","hr");
  HR_YM=[Y,M-1];
}
function hookDB(){ global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
  del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} }; }

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

reset();
// ── 角色與分頁 ──
ok("HR 分頁＝工作確認＋儀表板", JSON.stringify(myTabs().map(t=>t[0]))===JSON.stringify(["hr","dashboard"]));
{ localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
  ok("設定的角色下拉有人資", viewSettings().includes(">人資</option>"));
  localStorage.setItem("ecdr_user","HR小姐"); localStorage.setItem("ecdr_role","hr"); }
// ── 狀態判定 ──
ok("d1 有看過一筆 → 部分已看", hrDayStatus("小葵",d1)==="part");
ok("d2 已按本日確認 → 已全數確認", hrDayStatus("小葵",d2)==="all");
ok("d3 完全沒看 → 未查看", hrDayStatus("小葵",d3)==="unseen");
ok("沒有任何工作的日子 → none", hrDayStatus("小葵",D(28))==="none");
ok("HR 名單只列剪輯與海外剪輯", JSON.stringify(hrStaff())===JSON.stringify(["小葵","Anna"]));
// ── 月曆頁 ──
let h=viewHR();
ok("月曆頁列出每位同仁", h.includes("小葵") && h.includes("Anna"));
ok("月曆頁有 31 個日期格可點", (h.match(/openHRDay\(/g)||[]).length >= 31);
ok("月曆頁顯示本月已確認天數", h.includes("本月已確認"));
ok("月曆頁提醒待確認天數", h.includes("待確認"));
ok("月份可切換", h.includes("hrMonthMove(-1)") && h.includes("hrMonthMove(1)"));
// ── 當日明細：系統紀錄 ──
openHRDay("小葵",d1);
ok("明細有系統紀錄區（自動）", modalHTML.includes("系統紀錄（自動，非同仁填寫）"));
ok("系統紀錄含上下班時間", modalHTML.includes("上班 01:00") && modalHTML.includes("下班 10:00"));
ok("列出當日完成影片（2 支）", modalHTML.includes("當日完成影片（2）") && modalHTML.includes("完成且已審過的片") && modalHTML.includes("完成但待審核的片"));
ok("影片標出審片狀態", modalHTML.includes("已審過") && modalHTML.includes("待審核"));
ok("影片標出存檔/上傳連結有無", modalHTML.includes("存檔✓") && modalHTML.includes("上傳✓"));
ok("列出當日認領（3 支）", modalHTML.includes("當日認領（3）"));
ok("列出被退回待修＋原因", modalHTML.includes("被退回待修（1）") && modalHTML.includes("字卡有錯"));
ok("不會混到別人的片", !modalHTML.includes("別人的片"));
// ── 當日明細：自填項目與兩層確認 ──
ok("列出自填工作項目（2 筆）", modalHTML.includes("同仁自填的工作項目（2）") && modalHTML.includes("剪輯當日影片") && modalHTML.includes("文案內容整理"));
ok("顯示回報內容", modalHTML.includes("完成三支影片剪輯"));
ok("已看過的項目顯示是誰看的", modalHTML.includes("HR小姐 已看過"));
ok("未看過的項目有『已看過』鍵", modalHTML.includes("hrSeeItem('K2',true"));
ok("已看過的項目可取消", modalHTML.includes("hrSeeItem('K1',false"));
ok("尚有未看 → 本日確認鍵停用", modalHTML.includes("請先逐筆按「已看過」") && modalHTML.includes("disabled"));
// 全部看過後可確認
reset(); STATE.tasks.K2.hrSeenBy="HR小姐"; STATE.tasks.K2.hrSeenAt=d1+"T19:00:00";
openHRDay("小葵",d1);
ok("全部看過 → 可按本日全數確認", modalHTML.includes("本日工作已全數確認") && !modalHTML.includes("請先逐筆按"));
// 已確認的日子顯示確認人與取消鍵
reset(); openHRDay("小葵",d2);
ok("已確認日顯示確認人＋可取消", modalHTML.includes("✓ 本日已全數確認") && modalHTML.includes("HR小姐") && modalHTML.includes("hrConfirmDay('小葵','"+d2+"',false)"));
// ── 寫入行為 ──
reset(); hookDB(); hrSeeItem("K2",true,"小葵",d1);
ok("按已看過 → 寫入 hrSeenBy/At", calls.some(c=>c[0]==="update"&&c[1]==="tasks"&&c[2]==="K2"&&c[3].hrSeenBy==="HR小姐"&&!!c[3].hrSeenAt));
reset(); hookDB(); hrSeeItem("K1",false,"小葵",d1);
ok("取消已看過 → 清空欄位", calls.some(c=>c[0]==="update"&&c[2]==="K1"&&c[3].hrSeenBy===""&&c[3].hrSeenAt===""));
reset(); hookDB(); hrConfirmDay("小葵",d1,true);
ok("本日確認 → 寫入 shifts（已有打卡用 update）", calls.some(c=>c[0]==="update"&&c[1]==="shifts"&&c[2]==="小葵__"+d1&&c[3].hrConfirmedBy==="HR小姐"));
reset(); hookDB(); hrConfirmDay("小葵",d3,true);
ok("沒打卡的日子也能確認（建立 shifts 文件）", calls.some(c=>c[0]==="set"&&c[1]==="shifts"&&c[2]==="小葵__"+d3&&c[3].hrConfirmedBy==="HR小姐"&&c[3].clockIn===""));
reset(); hookDB(); hrConfirmDay("小葵",d2,false);
ok("取消本日確認 → 清空欄位", calls.some(c=>c[0]==="update"&&c[2]==="小葵__"+d2&&c[3].hrConfirmedAt===""));

// ── 同仁端：常用項目快速新增 ──
reset(); localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
WORK_ZONE="shopee"; POOL_FILTER="all";
h=viewWork();
ok("工作卡改名為今日工作計畫", h.includes("我的今日工作計畫（剪輯以外）"));
ok("有五個常用項目快速新增", (h.match(/addPresetTask\(/g)||[]).length===5 && h.includes("addPresetTask('剪輯當日影片')") && h.includes("addPresetTask('文案內容整理')"));
hookDB(); addPresetTask("影片清單整理");
setTimeout(()=>{
  ok("按常用項目 → 建立當日工作項目", calls.some(c=>c[0]==="set"&&c[1]==="tasks"&&c[3].title==="影片清單整理"&&c[3].user==="小葵"&&c[3].date===T0));
  // HR 看不到指派功能
  reset(); localStorage.setItem("ecdr_user","HR小姐"); localStorage.setItem("ecdr_role","hr");
  const d=viewDashboard();
  ok("HR 儀表板看得到 KPI", d.includes("員工長期績效"));
  ok("HR 儀表板沒有指派交辦/毛片", !d.includes("① 指派交辦給員工") && !d.includes("指派毛片給員工"));
  localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
  ok("Regina 儀表板仍有指派功能", viewDashboard().includes("① 指派交辦給員工"));
  // 全角色 render 不炸
  const tabsOf={hr:["hr","dashboard"],boss:["dashboard","flow","videos","cal","perf","log","trash"],editor:["work","videos","cal"]};
  const who={hr:"HR小姐",boss:"管理員",editor:"小葵"};
  Object.keys(tabsOf).forEach(role=>{ localStorage.setItem("ecdr_user",who[role]); localStorage.setItem("ecdr_role",role);
    tabsOf[role].forEach(tab=>{ CUR_TAB=tab; CAL_PLAT="tw"; CAL_YM=null; WORK_ZONE="shopee";
      try{ render(); ok(`[${role}] ${tab}`, true); }catch(e){ ok(`[${role}] ${tab} → ${e.message}`, false); } }); });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
},10);
