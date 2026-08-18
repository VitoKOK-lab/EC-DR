// v135：四條「壞掉不會有人發現」的關鍵路徑，以前一條測試都沒有。
//
// ① 匯率／加乘存檔：欄位空白或打成全形 → parseFloat 給 NaN → 靜默存成 1。
//    後果是海外售價把台幣數字掛上美金符號（10000 元變成 $10,000），看起來很正常的錯。
// ② dbBlocked：員工視角唯讀的唯一一道防線，22 個寫入口全靠它。
//    重點不只是「它現在會擋」，而是「以後新加的寫入動作不准繞過它」。
// ③ pwRuleError：密碼規則。失效了不會有任何徵兆，直到有人把密碼設成 0。
// ④ logA：操作紀錄。出事的時候才知道沒在寫，那時已經來不及了。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let fields={}, missing=new Set(), modalHTML="", viewEl=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(missing.has(id)) return null;
    const e=el(); if(fields[id]!=null) e.value=fields[id];
    if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>"1";
eval(src);

let toasts=[], errToasts=[], writes=[];
toast=(m,isErr)=>{ toasts.push(String(m)); if(isErr) errToasts.push(String(m)); };
function reset(){
  toasts=[]; errToasts=[]; writes=[]; fields={}; missing=new Set();
  global.window.DB={ set:async(c,id,o)=>{writes.push(["set",c,id,o]);}, update:async(c,id,p)=>{writes.push(["update",c,id,p]);},
    del:async(c,id)=>{writes.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async(p)=>{writes.push(["settings","","",p]);} };
  STATE={ users:[{name:"小葵",role:"editor"}],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2026-07-01"},
    schedule:{}, logs:[], deletedVideos:[], tasks:{}, shifts:{}, videos:[] };
  localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
  VIEW_AS=null;
}
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// 把四格匯率欄位一次填好
function setRates(o){ fields.set_rate_en="0.031"; fields.set_rate_th="1.038"; fields.set_rate_ms="0.127";
  fields.set_mult_en="1.2"; fields.set_mult_th="1"; fields.set_mult_ms="2"; fields.set_mult_shopee="1.5";
  Object.assign(fields, o||{}); }

(async()=>{

// ══════════ ① 匯率／加乘：讀不出來就保留舊值，絕不靜默變成 1 ══════════
// 「悄悄改成 1」是最糟的答案：既不是使用者的意思，也不是原本的值，而且錯得很像對的
// （海外售價把台幣數字掛上美金符號，10000 元變成 $10,000）。
const OLD={en:{code:"USD",rate:0.0313,mult:1.2}, th:{code:"THB",rate:1.038,mult:1},
           ms:{code:"MYR",rate:0.1275,mult:2}, shopee:{code:"TWD",rate:1,mult:1.5}};
{ reset(); setRates();
  const r=readRates(OLD);
  ok("填得好好的就沒有警告", r.warn==="");
  ok("填得好好的就吃使用者填的值", r.rates.en.rate===0.031 && r.rates.en.mult===1.2); }
{ reset(); setRates({set_rate_en:""});
  const r=readRates(OLD);
  ok("匯率留空＝有警告", !!r.warn);
  ok("警告講得出是哪一格（英文匯率）", r.warn.includes("英文匯率"));
  ok("留空那一格保留原本的 0.0313，不是變成 1", r.rates.en.rate===0.0313);
  ok("同一列的加乘沒問題就照樣更新", r.rates.en.mult===1.2);
  ok("別的語言完全不受影響", r.rates.th.rate===1.038); }
{ reset(); setRates({set_mult_shopee:""});
  const r=readRates(OLD);
  ok("蝦皮加乘留空＝有警告", r.warn.includes("蝦皮加乘"));
  ok("蝦皮加乘保留原本的 1.5", r.rates.shopee.mult===1.5); }
{ reset(); setRates({set_rate_th:"０.５"});   // 全形數字
  ok("全形數字＝有警告（以前會變成 NaN 再靜默存成 1）", readRates(OLD).warn.includes("泰文匯率"));
  ok("全形數字那一格保留舊值", readRates(OLD).rates.th.rate===1.038); }
{ reset(); setRates({set_mult_ms:"1.2abc"});
  const r=readRates(OLD);
  ok("數字後面接文字＝有警告（parseFloat 只會取 1.2，Number 才擋得掉）", r.warn.includes("馬來加乘"));
  ok("不能把 1.2abc 當成 1.2 吃下去", r.rates.ms.mult===2); }
{ reset(); setRates({set_rate_ms:"0"});
  ok("匯率填 0＝有警告（0 會讓所有售價變成 0）", readRates(OLD).warn.includes("馬來匯率"));
  ok("填 0 也是保留舊值", readRates(OLD).rates.ms.rate===0.1275); }
{ reset(); setRates({set_mult_en:"-1"});
  ok("加乘填負數＝有警告", readRates(OLD).warn.includes("英文加乘")); }
{ reset(); setRates({set_rate_en:" 0.031 "});
  ok("前後有空白還是收（使用者複製貼上很常這樣）", readRates(OLD).warn===""); }
{ reset(); missing=new Set(["set_rate_en","set_mult_en","set_rate_th","set_mult_th",
                            "set_rate_ms","set_mult_ms","set_mult_shopee"]);
  const r=readRates(OLD);
  ok("這一區沒渲染出來就不要亂警告（別的設定畫面照樣存得了）", r.warn==="");
  ok("沒渲染出來時原本的匯率原封不動", r.rates.en.rate===0.0313 && r.rates.ms.mult===2); }
{ reset(); setRates(); missing=new Set(["set_rate_shopee"]);
  ok("蝦皮沒有匯率欄是正常的，不算錯", readRates(OLD).warn===""); }
{ reset(); setRates({set_rate_en:""});
  const r=readRates(undefined);
  ok("連舊值都沒有時才退回 1（第一次設定）", r.rates.en.rate===1);
  ok("退回 1 也要照樣警告", r.warn.includes("英文匯率")); }

// 存檔流程：其他設定照存、匯率那一格保留、紅字講清楚
{ reset(); STATE.settings.exchangeRates=OLD; setRates({set_rate_en:""});
  fields.set_daily="6";
  await saveSettings();
  const s=(writes.find(w=>w[0]==="settings")||[])[3];
  ok("匯率有一格讀不出來：其他設定照樣存得進去", !!s && s.dailyTarget===6);
  ok("匯率有一格讀不出來：那一格存的是舊值不是 1", !!s && s.exchangeRates.en.rate===0.0313);
  ok("匯率有一格讀不出來：跳紅字", errToasts.length===1 && errToasts[0].includes("英文匯率"));
  ok("紅字要說「設定已更新」，不然人會以為整份沒存到", errToasts[0].includes("已更新"));
  ok("不要同時跳「已更新設定」再被蓋掉（toast 只有一格）",
     !toasts.some(t=>t==="已更新設定")); }
{ reset(); STATE.settings.exchangeRates=OLD; setRates();
  await saveSettings();
  const s=(writes.find(w=>w[0]==="settings")||[])[3];
  ok("填對就存得進去", !!s);
  ok("存進去的是使用者填的值，不是 1", !!s && s.exchangeRates && s.exchangeRates.en.rate===0.031);
  ok("加乘也是使用者填的值", !!s && s.exchangeRates.en.mult===1.2);
  ok("蝦皮匯率固定 1、只吃加乘", !!s && s.exchangeRates.shopee.rate===1 && s.exchangeRates.shopee.mult===1.5);
  ok("沒問題就是原本那句「已更新設定」，不是紅字", errToasts.length===0); }

// ══════════ ② dbBlocked：唯讀防線 ══════════
{ reset();
  ok("沒在員工視角＝不擋", dbBlocked()===false);
  ok("沒在員工視角＝不跳訊息", toasts.length===0); }
{ reset(); VIEW_AS="小葵";
  ok("員工視角＝擋下來", dbBlocked()===true);
  ok("員工視角＝要講原因，而且是紅字", errToasts.length===1 && errToasts[0].includes("唯讀"));
  VIEW_AS=null; }
// 真正重要的是：以後新加的寫入動作不准繞過這道防線。
// 掃原始碼，把「會寫資料庫的 function」抓出來，每一個都要有守衛。
{ const lines=APP.split("\n");
  const starts=[];
  lines.forEach((l,i)=>{ const m=l.match(/^(?:async )?function ([A-Za-z_$][\w$]*)\s*\(/); if(m) starts.push([i,m[1]]); });
  const bodyOf=(k)=>lines.slice(starts[k][0], k+1<starts.length?starts[k+1][0]:lines.length).join("\n");
  // 這些是「防線本身」或包裝層，它們就是負責擋的人，不必再自己擋一次
  const GUARDS=new Set(["dbBlocked","dbUpdate","dbSet","dbDel","write","writeAdmin","logA","bulkRun",
    "dbArrayAdd","dbArrayDel","dbBump","route","withAdmin"]);
  // 這些是刻意不受員工視角限制的：打卡與登入是「本人在操作」，不是管理員在預覽
  const EXEMPT=new Set(["clockIn","doClockOut","autoCloseOpenShifts","rememberDevice","grabGeo",
    "loginAs","ownerLogin","ensurePwAt","setPw","changePw","firstPw","noticeReply","bootLogin","autoMoveOrigLang"]);
  const naked=[];
  starts.forEach(([ln,name],k)=>{
    if(GUARDS.has(name)||EXEMPT.has(name)) return;
    const body=bodyOf(k);
    if(!/window\.DB\.(set|update|del|setSettings)\s*\(/.test(body)) return;
    if(/dbBlocked\(\)/.test(body) || /VIEW_AS/.test(body)) return;
    naked.push(name+"（第 "+(ln+1)+" 行）");
  });
  ok("每個會寫資料庫的動作都有唯讀防線"+(naked.length?("：漏了 "+naked.join("、")):""), naked.length===0); }

// ══════════ ③ pwRuleError：密碼規則 ══════════
{ reset();
  ok("太短擋下來", pwRuleError("1")!=="");
  ok("太短的訊息講得出最少幾碼", pwRuleError("1").includes(String(PW_MIN)));
  ok("剛好 PW_MIN 碼放行", pwRuleError("1".repeat(PW_MIN))==="");
  ok("全部是 0 擋下來（0000 是預設密碼）", pwRuleError("0".repeat(PW_MIN))!=="");
  ok("含 0 但不全是 0 放行", pwRuleError("0".repeat(PW_MIN-1)+"1")==="");
  ok("兩次不一致擋下來", pwRuleError("12345678","12345679")!=="");
  ok("兩次一致放行", pwRuleError("12345678","12345678")==="");
  ok("只傳一個參數＝不檢查一致性（管理員密碼那一格就是這樣用）",
     pwRuleError("12345678")==="");
  ok("空字串擋下來", pwRuleError("")!==""); }
// 規則要真的接在改密碼的路上，不是寫好放著沒人叫
{ ok("改密碼有呼叫 pwRuleError", (APP.match(/pwRuleError\(/g)||[]).length>=3); }

// ══════════ ④ logA：操作紀錄 ══════════
{ reset(); logA("做了一件事","某某影片");
  const r=(writes.find(w=>w[1]==="logs")||[])[3];
  ok("真的寫進 logs", !!r);
  ok("記下是誰做的", !!r && r.user==="管理員");
  ok("記下他的身分", !!r && r.role==="boss");
  ok("記下做了什麼", !!r && r.action==="做了一件事");
  ok("記下對誰做的", !!r && r.target==="某某影片");
  ok("有時間戳", !!r && /^\d{4}-\d{2}-\d{2}T/.test(String(r.at||""))); }
{ reset(); logA("愛".repeat(200), "恨".repeat(500));
  const r=(writes.find(w=>w[1]==="logs")||[])[3];
  ok("動作太長會截掉（不然一筆爛紀錄撐爆整個集合）", !!r && r.action.length===80);
  ok("對象太長也會截掉", !!r && r.target.length===200); }
{ reset(); global.window.DB=null;
  let threw=false; try{ logA("沒有資料庫也不能炸","x"); }catch(e){ threw=true; }
  ok("沒有連上資料庫時不會炸掉呼叫它的人", !threw); }
{ reset(); global.window.DB={ set:()=>Promise.reject(new Error("寫不進去")) };
  let threw=false; try{ logA("寫紀錄失敗也不能炸","x"); }catch(e){ threw=true; }
  await new Promise(r=>setTimeout(r,5));
  ok("寫紀錄失敗不會連累主要動作（紀錄是附加的，不該擋住正事）", !threw); }
{ reset(); localStorage.removeItem("ecdr_user");
  logA("沒登入也記得起來","x");
  const r=(writes.find(w=>w[1]==="logs")||[])[3];
  ok("沒登入時也留得下紀錄", !!r && !!r.user);
  localStorage.setItem("ecdr_user","管理員"); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
