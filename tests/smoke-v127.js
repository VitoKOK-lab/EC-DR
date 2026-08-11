// v127：下班按不下去／按了沒反應。
//
// 回報：下班匯報視窗開著，「確認下班」點不下去，無法下班。查出兩個各自都會造成
// 這個現象的毛病，而且兩個都是「靜靜失敗」——
//
//   ① 版面：確認鍵在會捲動的視窗內容裡。交辦工作一多，它就被推到捲動區下面，
//      在矮一點的視窗上根本不在畫面裡。使用者捲的是整頁、捲了沒反應，
//      看起來就是「這顆按鈕點不下去」。（修法：彈窗底部的按鈕黏在視窗底下）
//   ② 行為：doClockOut 把所有錯誤吞掉，外面照樣說「辛苦了，已下班」然後把人登出。
//      寫失敗的人根本沒有下班紀錄，卻完全不知道 —— 這是最惡劣的一種「無法下班」：
//      它裝作成功。（修法：回傳成功與否；失敗就留在視窗裡並說出原因）
//
// 版面那一項在瀏覽器裡才驗得到（見 PR 說明的實測），這支測行為那一項。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false, isConnected:true,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), toasts=[], confirmBtn=null;
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(id==="modalConfirm"){ if(!confirmBtn) confirmBtn=el(); return confirmBtn; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v; if(!v) confirmBtn=null;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true, userAgent:"Mozilla/5.0 (Macintosh)"};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=(m,err)=>{ toasts.push({m:String(m), err:!!err}); };
let goodbyes=0; showGoodbye=()=>{ goodbyes++; };

const T0=today;
let writes=[], failWrite=false;
function reset(opts){
  opts=opts||{}; modalHTML=""; toasts=[]; writes=[]; goodbyes=0; confirmBtn=null; failWrite=!!opts.fail;
  STATE={ users:[{name:"江瑩",role:"mkt"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{},
    tasks:{ t1:{id:"t1",user:"江瑩",date:T0,title:"提煉商品主圖賣點",assignedBy:"管理員",ack:true,done:false,report:"25 款已完成",createdAt:T0+"T09:00:00"},
            t2:{id:"t2",user:"江瑩",date:T0,title:"製作行銷主圖",assignedBy:"管理員",ack:true,done:false,report:"主圖完成",createdAt:T0+"T09:05:00"} },
    shifts:{ [shiftId("江瑩",T0)]:{id:shiftId("江瑩",T0),user:"江瑩",date:T0,clockIn:T0+"T09:00:00",clockOut:""} },
    logs:[], deletedVideos:[], videos:[] };
  VIEW_AS=null; ORIG_AUTO_RAN=true;
  global.window.DB = opts.noDB ? null : {
    set:async(c,i,r)=>{ if(failWrite&&c==="shifts") throw new Error("offline"); writes.push(["set",c,i,r]); },
    update:async(c,i,p)=>{ if(failWrite&&c==="shifts") throw new Error("offline"); writes.push(["update",c,i,p]); },
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const wait=()=>new Promise(r=>setTimeout(r,40));
// 成功下班之後是 setTimeout(showGoodbye,300)，要等過那 300ms 才看得到登出
const waitBye=()=>new Promise(r=>setTimeout(r,400));
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{

// ══════════ ① doClockOut 誠實回報成功與否 ══════════
reset(); as("江瑩","mkt");
ok("寫得進去就回 true", await doClockOut()===true);
ok("真的寫了下班時間", writes.some(w=>w[1]==="shifts" && w[3] && w[3].clockOut));

reset({fail:true}); as("江瑩","mkt");
ok("寫不進去就回 false（不再假裝成功）", await doClockOut()===false);
ok("寫不進去就沒有下班紀錄", !writes.some(w=>w[1]==="shifts"));

reset({noDB:true}); as("江瑩","mkt");
ok("根本沒連上資料庫也回 false", await doClockOut()===false);

// 記裝置、拿座標都是加分項，壞了不能把「已經下班」翻成失敗
reset(); as("江瑩","mkt");
{ const g=grabGeo; grabGeo=()=>{ throw new Error("no geo"); };
  const okv=await doClockOut(); grabGeo=g;
  ok("拿不到 GPS 照樣算下班成功", okv===true && writes.some(w=>w[1]==="shifts")); }

// ══════════ ② 沒寫成功就不能把人登出 ══════════
reset({fail:true}); as("江瑩","mkt");
clockOutReport();
ok("下班匯報視窗開得起來", modalHTML.includes("下班匯報") && modalHTML.includes("交辦工作"));
await confirmBtn.onclick(); await wait();
ok("寫失敗時不會說「辛苦了」", !toasts.some(t=>t.m.includes("辛苦了")));
ok("寫失敗時會講出來（而且是紅字）", toasts.some(t=>t.err && t.m.includes("沒有記錄成功")));
ok("寫失敗時不把人登出", goodbyes===0);
ok("寫失敗時視窗留著（可以再按一次）", !!confirmBtn && modalHTML.includes("確認下班"));
// 再按一次，這次通得過 → 就真的下班
failWrite=false;
await confirmBtn.onclick(); await wait();
ok("排除問題後再按一次就成功", writes.some(w=>w[1]==="shifts" && w[3] && w[3].clockOut));
ok("成功才說「辛苦了」", toasts.some(t=>t.m.includes("辛苦了")));
await waitBye();
ok("成功才登出", goodbyes===1);

// ══════════ ③ 確認鍵不會靜靜失敗 ══════════
reset(); as("江瑩","mkt");
showModal("測試", "<div></div>", async ()=>{ throw new Error("爆炸了"); }, "送出");
await confirmBtn.onclick(); await wait();
ok("onConfirm 丟例外時會講出來，不是沒反應", toasts.some(t=>t.err && t.m.includes("爆炸了")));
ok("丟例外時視窗留著", !!confirmBtn);
ok("丟例外之後按鈕可以再按（沒有卡在處理中）", confirmBtn.disabled===false);

// 連點兩下只做一次 —— 打卡做兩遍會覆蓋掉時間
reset(); as("江瑩","mkt");
{ let n=0;
  showModal("測試", "<div></div>", async ()=>{ n++; await new Promise(r=>setTimeout(r,30)); return true; }, "送出");
  const b=confirmBtn;
  b.onclick(); b.onclick(); b.onclick();
  await wait(); await wait();
  ok("連點三下只做一次", n===1); }

// ══════════ ④ 有幾件交辦沒做完，照樣可以下班（只是報表上寫出來） ══════════
reset(); as("江瑩","mkt");
clockOutReport();
ok("視窗把未完成的交辦寫出來", modalHTML.includes("未完成") && modalHTML.includes("提煉商品主圖賣點"));
ok("視窗把已經填的處理狀況一起寫出來", modalHTML.includes("25 款已完成"));
ok("交辦沒做完不會擋住下班（確認鍵照樣在）", modalHTML.includes("確認下班"));
await confirmBtn.onclick(); await waitBye();
ok("交辦沒做完照樣下得了班", writes.some(w=>w[1]==="shifts" && w[3] && w[3].clockOut) && goodbyes===1);

// ══════════ ⑤ 裝置代碼拿不到儲存空間也不能炸掉打卡 ══════════
reset(); as("江瑩","mkt");
{ const real=global.localStorage;
  global.localStorage={ getItem:()=>{ throw new Error("blocked"); },
                        setItem:()=>{ throw new Error("blocked"); }, removeItem:()=>{} };
  let threw=false, id=null;
  try{ id=deviceId(); }catch(e){ threw=true; }
  global.localStorage=real;
  ok("localStorage 被鎖住時 deviceId 不丟例外", !threw && typeof id==="string" && id.length>0); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
