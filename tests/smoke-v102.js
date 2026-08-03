// v102：剪輯按「完成 ✔」之後，畫面要留在原本那一頁（從哪裡進去就回哪裡），不會被丟到影片庫。
// 四條線（台灣一創／蝦皮／馬來／英文／泰文）行為一致；編輯視窗存檔也不會換頁。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(id==="nav") return el();
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
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",rawLink:"",
  stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:T0+"T01:00:00",assignedTo:"",scheduledDate:T0,
  publishedLink:"",driveFolder:"",productUrl:"",note:"",mainType:"",source:"老闆自拍",refLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});

function reset(){
  calls=[]; toasts=[]; fields={}; modalHTML="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"acctEN"},{locale:"th",name:"acctTH"}],
      shopeeAccounts:["acctSHP"],msAccounts:["acctMS"],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    videos:[ v_("W1"),
      v_("C1",{channel:"shopee",account:"acctSHP",sourceVideoId:"W1"}),
      v_("M1",{channel:"ms",account:"acctMS",sourceVideoId:"W1"}),
      v_("E1",{locale:"en",account:"acctEN",sourceVideoId:"W1"}),
      v_("H1",{locale:"th",account:"acctTH",sourceVideoId:"W1"}) ] };
  VIEW_AS=null; WORK_ZONE="shopee"; POOL_FILTER="all";
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} };
  localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
}
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{
  // ── 從哪一頁按完成，就留在哪一頁（四條線都一樣）──
  for (const [name, id, call] of [
    ["台灣一創", "W1", ()=>finishWork("W1")],
    ["蝦皮",     "C1", ()=>chFinish("shopee","C1")],
    ["馬來",     "M1", ()=>chFinish("ms","M1")],
    ["英文",     "E1", ()=>intlFinish("E1")],
    ["泰文",     "H1", ()=>intlFinish("H1")],
  ]) {
    reset(); CUR_TAB="work"; call(); await wait(220);
    ok(`${name}按完成：留在上班計畫，不跳影片庫`, CUR_TAB==="work");
    ok(`${name}按完成：真的有寫入完成`, calls.some(c=>c[0]==="update"&&c[2]===id&&c[3].stage==="已完成"));
  }

  // ── 從影片庫按完成，也是留在影片庫（不會被推去別頁）──
  reset(); CUR_TAB="videos"; finishWork("W1"); await wait(220);
  ok("從影片庫按完成：留在影片庫", CUR_TAB==="videos");
  reset(); CUR_TAB="cal"; finishWork("W1"); await wait(220);
  ok("從月排程按完成：留在月排程", CUR_TAB==="cal");

  // ── 編輯視窗存檔也不換頁 ──
  reset(); CUR_TAB="work";
  openVideoModal("W1", true, false);
  ok("編輯視窗的主鍵是「儲存修改」（不是儲存並完成）", modalHTML.includes("儲存修改") && !modalHTML.includes("儲存並完成"));
  fields.e_code="26W1"; fields.e_raw="毛片W1"; fields.e_name="片W1"; fields.e_vcopy=""; fields.e_ref="";
  fields.e_date=T0; fields.e_src="老闆自拍"; fields.e_stage="剪輯中"; fields.e_editor="小葵";
  fields.e_url=""; fields.e_note=""; fields.e_drive=""; fields.e_rawlink="";
  await saveVideo("W1"); await wait(220);
  ok("存檔之後還在上班計畫", CUR_TAB==="work");
  ok("存檔有真的寫進去", calls.some(c=>c[0]==="update"&&c[2]==="W1"));

  // ── 提示文字不能再說「移到影片庫」（會誤導）──
  reset(); CUR_TAB="work";
  { const h=viewWork();
    ok("完成鍵的提示沒有「移到影片庫」", h.includes("完成")&&!h.includes("移到影片庫"));
    ok("完成鍵有講清楚會留在這頁", h.includes("畫面留在這頁")); }
  reset(); CUR_TAB="work"; intlFinish("E1"); await wait(220);
  ok("完成後的提示訊息不說移到影片庫", !toasts.some(t=>t.includes("移到影片庫")));

  // ── 全域掃描：程式裡不該再有把分頁切到影片庫的程式碼 ──
  ok("原始碼裡沒有 CUR_TAB=\"videos\"", !/CUR_TAB\s*=\s*["']videos["']/.test(fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
