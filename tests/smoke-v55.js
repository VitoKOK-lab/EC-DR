// 團隊看板：每個人的「今日成效」與「本月成效」；除了篩選之外不能操作任何東西。人資只有這一頁（v66）
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
    schedule:{}, logs:[], deletedVideos:[],
    // 小葵今天上班 09–18；Anna 今天沒上線
    shifts:{ [T0+"__x"]:null, ["小葵__"+T0]:{id:"小葵__"+T0,user:"小葵",date:T0,clockIn:T0+"T09:00:00",clockOut:T0+"T18:00:00"} },
    tasks:{ K1:{id:"K1",user:"小葵",date:T0,title:"回覆廠商",report:"已聯絡完成，等對方回覆",done:false,assignedBy:"Regina",ack:true,createdAt:T0},
            K2:{id:"K2",user:"小葵",date:T0,title:"整理素材",done:true,createdAt:T0} },
    videos:[
      // 小葵：今天完成兩支（其中一支帶商品）
      {id:"D1",name:"今天完成A",rawName:"x",stage:"已完成",editor:"小葵",claimedAt:T0+"T00:00:00",finishedAt:T0+"T04:00:00",durationMin:90,
       reviewStatus:"通過",publishedLink:"http://p",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
      {id:"D2",name:"今天完成B",rawName:"x",stage:"已上片",published:true,editor:"小葵",claimedAt:T0+"T00:00:00",finishedAt:T0+"T05:00:00",durationMin:150,
       reviewStatus:"通過",publishedLink:"http://p",productUrl:"http://shop",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
      // Anna：今天完成一支
      {id:"E1",name:"海外完成片",rawName:"x",stage:"已完成",editor:"Anna",claimedAt:T0+"T00:00:00",finishedAt:T0+"T03:00:00",durationMin:60,
       reviewStatus:"通過",publishedLink:"http://p",locale:"en",tags:[],products:[],usageHistory:[],metrics:[]},
      // 小葵：還在剪（算進行中，不算完成）
      {id:"W1",name:"還在剪的片",rawName:"x",stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:T0+"T01:00:00",
       locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
      // 上個月完成的（不算本月）
      {id:"OLD",name:"上個月的片",rawName:"x",stage:"已完成",editor:"小葵",claimedAt:"2026-06-30T00:00:00",finishedAt:"2026-06-02T05:00:00",
       reviewStatus:"通過",publishedLink:"http://p",locale:"",channel:"",tags:[],products:[],usageHistory:[],metrics:[]},
    ] };
  delete STATE.shifts[T0+"__x"];
  localStorage.setItem("ecdr_user","HR小姐"); localStorage.setItem("ecdr_role","hr");
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

// ── 分頁：人資只有「員工成效」一頁 ──
ok("HR 分頁＝團隊看板＋出勤", JSON.stringify(myTabs())===JSON.stringify([["team","團隊看板"],["attend","出勤"]]));

localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
let h=viewTeam();   // 一般員工看到的看板（人資多一張發通知卡，另外測）
// v119 分區：看板卡片會寫出每個人今天完成的片名，所以只列同區的人。
// 台灣剪輯看不到 Anna（海外）；要驗「全部的人都列得出來」就得用看得到兩區的主管。
localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
const hAll=viewTeam();
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
// ── 兩塊：今日成效／本月成效 ──
ok("有「今日成效」區", h.includes("今日成效") && h.includes(T0));
ok("有「本月成效」區", h.includes("本月成效") && h.includes(+M.slice(0,4)+" 年 "+(+M.slice(5,7))+" 月"));
ok("主管看得到兩位剪輯", hAll.includes("小葵") && hAll.includes("Anna"));
ok("台灣剪輯看不到海外同事", h.includes("小葵") && !h.includes("Anna"));
ok("人資自己也在名單上（他也要被記錄、由管理員考核）", h.includes("HR小姐"));

// ── 今日成效的數字 ──
ok("小葵今日完成 2 支", (()=>{ const seg=hAll.split("小葵")[1].split("Anna")[0]; return seg.includes(">2</div><div class=\"l\">今日完成"); })());
ok("進行中算得出來（1 支）", h.includes(">1</div><div class=\"l\">進行中"));
ok("交辦完成 1/2", h.includes("1/2</div><div class=\"l\">交辦完成"));
ok("有上班時間與工時", h.includes("09:00–18:00") && h.includes("工時 9h0m"));
ok("沒上線的顯示今天還沒上線", h.includes("今天還沒上線"));
ok("列出今天完成的片名", h.includes("今天完成A") && h.includes("今天完成B"));
ok("海外的片名只有主管看得到", hAll.includes("海外完成片") && !h.includes("海外完成片"));
ok("列出交辦回報內容", h.includes("回覆廠商") && h.includes("已聯絡完成"));
ok("頂部有今日／本月摘要", h.includes("今日出勤") && h.includes("今日完成") && h.includes("本月完成"));

// ── 本月成效表 ──
ok("本月表格欄位齊全", ["完成上架","剪片速度","平均工時","帶商品","出勤天數","交辦完成"].every(k=>h.includes(k)));
ok("本月完成只算這個月（小葵 2 支，不含上個月）", !h.includes("上個月的片"));
ok("平均工時算得出來（小葵 2h0m）", h.includes("2h0m"));
ok("帶商品數算得出來", h.includes('data-label="帶商品">1<'));
ok("出勤天數算得出來", h.includes('data-label="出勤天數">1<'));

// ── 純檢視：一般員工的看板上完全沒有可以按的東西 ──
ok("沒有按鈕", !h.includes("<button"));
ok("沒有 onclick", !h.includes("onclick"));
ok("沒有連結", !h.includes("<a "));
// v85 加了篩選（換個看法而已）：整頁只有那兩個篩選控制項，沒有別的輸入
ok("只有篩選用的下拉與搜尋框", (h.match(/<select|<input/g)||[]).length===2
   && h.includes("teamSetGroup(") && h.includes("teamSetQ("));
ok("沒有任何會改到資料的動作", ["reviewVid(","flowAssign(","delTask(","taskDone(",
   "assignTaskSel(","hrNotify(","ackTask(","editVideo(","noticeReply(","msgReply("].every(f=>!h.includes(f)));
ok("沒有審核／交辦／檢查的動作", !h.includes("reviewVid(") && !h.includes("flowAssign(") && !h.includes("hrCheckVideo"));
// ── 人資的看板多一張「發 HR 通知」卡，其餘一樣是唯讀 ──
localStorage.setItem("ecdr_user","HR小姐"); localStorage.setItem("ecdr_role","hr");
{ const hh=viewTeam();
  ok("人資看板有發通知卡", hh.includes("發出 HR 通知") && hh.includes("hrNotify()") && hh.includes("全體同仁"));
  ok("人資看板仍然不能審核／交辦影片", !hh.includes("reviewVid(") && !hh.includes("flowAssign(") && !hh.includes("delTask(")); }

// ── 人資不寫任何資料：整頁渲染不會呼叫 DB ──
reset(); hookDB(); CUR_TAB="team"; render();
ok("渲染人資頁不會寫入任何資料", calls.length===0);

// ── 剪輯流程完全不受人資影響 ──
reset(); hookDB(); localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
editorMarkReviewed("D1");
ok("剪輯按已審過不受影響", calls.some(c=>c[0]==="update"&&c[1]==="videos"&&c[2]==="D1"&&c[3].reviewStatus==="通過"));
reset(); hookDB(); localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
reviewVid("D2","通過");
ok("Regina 照樣能審核", calls.some(c=>c[0]==="update"&&c[1]==="videos"&&c[2]==="D2"&&c[3].reviewStatus==="通過"));
reset(); hookDB(); localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
reworkVideo("D2");
ok("Regina 照樣能退回重剪", calls.some(c=>c[0]==="update"&&c[1]==="videos"&&c[2]==="D2"));

// ── 沒有剪輯人員時不會炸 ──
reset(); STATE.users=[{name:"管理員",role:"boss"}];
ok("沒有成員時給提示", viewTeam().includes("還沒有成員"));

// ── render 不炸 ──
reset();
[["HR小姐","hr","team"],["管理員","boss","dashboard"],["小葵","editor","work"]].forEach(([u,r,tab])=>{
  localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); CUR_TAB=tab; WORK_ZONE="shopee"; CAL_PLAT="tw"; CAL_YM=null;
  try{ render(); ok(`[${r}] ${tab}`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
