// 動作測試：之前只有畫面快照，這些「按下去會發生什麼」沒測過
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, checkedTags=[];
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(fields[id]!=null) e.value=fields[id];
    if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:(sel)=>checkedTags.map(v=>({value:v}))};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>"新名字";
eval(src);
const _toast=toast; let toasts=[]; toast=(m)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
let calls=[];
function reset(){
  calls=[]; toasts=[]; fields={}; checkedTags=[]; VIEW_AS=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async(d,o)=>{calls.push(["sched",d,o]);}, setSettings:async(p)=>{calls.push(["settings",p]);} };
  STATE={ users:[{name:"小葵",role:"editor"},{name:"阿明",role:"editor"}],
    settings:{dailyTarget:4,videoTags:["舊片","寵粉"],sources:["老闆自拍"],postPlatforms:[{name:"IG",utm:"ig"}],
      intlAccounts:[],shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2026-07-01"},
    schedule:{}, logs:[], tasks:{}, shifts:{},
    deletedVideos:[{id:"X1",name:"被刪的片",rawName:"被刪的片",deleted:true,deletedBy:"小葵",deletedAt:T0,tags:[],products:[],usageHistory:[],metrics:[]}],
    videos:[
      {id:"V1",code:"001",name:"某片",rawName:"原始名",videoCopy:"文案",stage:"剪輯中",editor:"小葵",claimedBy:"小葵",
       claimedAt:T0+"T01:00:00",scheduledDate:T0,locale:"",channel:"",tags:["舊片"],source:"老闆自拍",
       products:[{name:"項鍊",price:"100",salePrice:"80"}],productUrl:"http://u",usageHistory:[],metrics:[]},
    ] };
  localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
}
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ── saveVideo：核心存檔 ──
reset();
fields={e_code:"002",e_raw:"改過的原始名",e_name:"改過的片名",e_vcopy:"改過的文案",e_stage:"已完成",
  e_editor:"阿明",e_src:"老闆自拍",e_date:"2026-08-01",e_time:"12:00",e_url:"http://u2",
  e_pn0:"手鍊",e_pp0:"200",e_ps0:"150",e_drive:"http://drv",e_pub:"http://pub",e_note:"備註",e_lang:""};
(async()=>{
  await saveVideo("V1");
  const u=calls.find(c=>c[0]==="update"&&c[1]==="videos"&&c[2]==="V1");
  ok("存影片：寫入資料庫", !!u);
  ok("存影片：片名/文案/階段正確", u && u[3].name==="改過的片名" && u[3].videoCopy==="改過的文案" && u[3].stage==="已完成");
  ok("存影片：商品原價與售價分開存", u && u[3].products[0].price===200 && u[3].products[0].salePrice===150);
  ok("存影片：帶上最後更新時間", u && !!u[3].updatedAt);

  // 商品與商品頁必須成對
  reset(); fields={e_code:"1",e_raw:"a",e_name:"b",e_stage:"待處理",e_pn0:"項鍊",e_url:""};
  await saveVideo("V1");
  ok("防呆：填了商品卻沒商品頁 → 擋下", !calls.length && toasts.some(t=>t.includes("商品")));

  // ── 回收桶：復原／永久刪除（只有管理員）──
  reset(); restoreVideo("X1");
  ok("回收桶復原：清除刪除標記", calls.some(c=>c[0]==="update"&&c[2]==="X1"&&c[3].deleted===false));
  reset(); purgeVideo("X1");
  ok("回收桶永久刪除", calls.some(c=>c[0]==="del"&&c[1]==="videos"&&c[2]==="X1"));

  // ── 成員管理 ──
  reset(); fields={mb_name:"新同事", mb_role:"hr"};
  addMember();
  ok("新增成員：角色寫入正確", calls.some(c=>c[0]==="set"&&c[1]==="users"&&c[2]==="新同事"&&c[3].role==="hr"));
  reset(); delMember("阿明");
  ok("刪除成員", calls.some(c=>c[0]==="del"&&c[1]==="users"&&c[2]==="阿明"));
  reset(); renameMember("小葵"); await new Promise(r=>setTimeout(r,30));
  ok("成員改名：建新刪舊", calls.some(c=>c[0]==="set"&&c[1]==="users"&&c[2]==="新名字") && calls.some(c=>c[0]==="del"&&c[2]==="小葵"));

  // ── 標籤設定 ──
  reset(); fields={tag_new:"新標籤"};
  await addVideoTagSel();
  ok("新增影片標籤", calls.some(c=>c[0]==="settings"&&(c[1].videoTags||[]).includes("新標籤")));
  reset(); await delVideoTag("寵粉");
  ok("刪除影片標籤", calls.some(c=>c[0]==="settings"&&!(c[1].videoTags||[]).includes("寵粉")));

  // ── 改期／移出排程 ──
  reset(); rescheduleVid("V1","2026-08-09",T0);
  ok("改上片日期", calls.some(c=>c[0]==="update"&&c[2]==="V1"&&c[3].scheduledDate==="2026-08-09"));
  reset(); await unscheduleVid("V1", T0);
  ok("移出排程：清空日期、影片保留", calls.some(c=>c[0]==="update"&&c[2]==="V1"&&c[3].scheduledDate===null)
     && !calls.some(c=>c[0]==="del"&&c[1]==="videos"));

  // ── 認領／完成／退回 ──
  reset(); STATE.videos[0].stage="待處理"; STATE.videos[0].claimedBy="";
  await route("POST","/api/videos/V1/claim",{});
  ok("認領：進剪輯中並記認領人", calls.some(c=>c[0]==="update"&&c[3].stage==="剪輯中"&&c[3].claimedBy==="管理員"));
  reset(); await route("POST","/api/videos/V1/unclaim",{});
  ok("退回：回待處理並清空認領", calls.some(c=>c[0]==="update"&&c[3].stage==="待處理"&&c[3].claimedBy===""));
  reset(); await route("POST","/api/videos/V1/finish",{scheduledDate:T0});
  ok("完成：進已完成並記完成時間", calls.some(c=>c[0]==="update"&&c[3].stage==="已完成"&&!!c[3].finishedAt));

  // ── 刪除影片＝軟刪除（進回收桶、記刪除者）──
  reset(); await route("DELETE","/api/videos/V1",{});
  ok("刪除影片：軟刪除進回收桶並記名", calls.some(c=>c[0]==="update"&&c[3].deleted===true&&c[3].deletedBy==="管理員"));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
