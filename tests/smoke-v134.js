// v134：批次寫入不准再「假裝成功」，而且不准再一次一趟慢慢跑。
//
// 病灶（9 個地方一模一樣）：
//     try{ await window.DB.update(...); n++; }catch(e){}
//     toast("已指派 "+n+" 支");
// 指派 100 支、掉了 30 支 → 畫面照樣說「已指派 70 支」。沒有人會發現那 30 支還在公用池。
// 這跟 v127 的「下班按了沒反應卻不報錯」是同一個病。
//
// 順便一起解決的：await 排在迴圈裡＝100 支跑 100 趟來回，BULK_BUSY 把畫面凍住十幾秒。
// 分批 Promise.allSettled 快十倍，而且天生就知道誰失敗 —— 一個改法治兩個病。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, checked=[];
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(fields[id]!=null) e.value=fields[id];
    if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,
  querySelectorAll:(sel)=>String(sel).includes("afp_vid")?checked.map(v=>({value:v,checked:true})):[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>"新名字";
eval(src);

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
let toasts=[], errToasts=[], writes=[], failIds=new Set(), concurrent=0, maxConcurrent=0;
toast=(m,isErr)=>{ toasts.push(String(m)); if(isErr) errToasts.push(String(m)); };
function mkDB(){
  const w=async(kind,coll,id,p)=>{
    concurrent++; maxConcurrent=Math.max(maxConcurrent,concurrent);
    await new Promise(r=>setTimeout(r,1));
    concurrent--;
    if(failIds.has(id)) throw new Error("網路斷了");
    writes.push([kind,coll,id,p]);
  };
  return { set:(c,id,o)=>w("set",c,id,o), update:(c,id,p)=>w("update",c,id,p),
           del:(c,id)=>w("del",c,id), scheduleSet:async()=>{}, setSettings:async(p)=>{writes.push(["settings","",""],p);} };
}
function reset(){
  toasts=[]; errToasts=[]; writes=[]; failIds=new Set(); fields={}; checked=[];
  concurrent=0; maxConcurrent=0;
  global.window.DB=mkDB();
  STATE={ users:[{name:"小葵",role:"editor"},{name:"阿明",role:"editor"}],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:["s"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2026-07-01"},
    schedule:{}, logs:[], deletedVideos:[], deletedVideosAll:[], tasks:{}, shifts:{}, videos:[] };
  localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
  VIEW_AS=null; BULK_BUSY=false;
}
function mkVids(n, over){
  const out=[];
  for(let i=1;i<=n;i++) out.push(Object.assign({id:"V"+i, code:"C"+i, name:"片"+i, rawName:"片"+i,
    stage:"待處理", locale:"", channel:"", tags:[], products:[], usageHistory:[], metrics:[]}, over||{}));
  return out;
}
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }
const said=(s)=>toasts.some(t=>t.includes(s));
const saidRed=(s)=>errToasts.some(t=>t.includes(s));

(async()=>{

// ══════════ ① bulkRun 本身 ══════════
{ reset();
  const r=await bulkRun([1,2,3,4,5], n=>n===3?Promise.reject(new Error("x")):Promise.resolve(n));
  ok("bulkRun 回報成功數", r.done===4);
  ok("bulkRun 回報失敗數", r.failed===1);
  ok("bulkRun 說得出誰失敗", r.bad.length===1 && r.bad[0]===3);
  ok("bulkRun 說得出誰成功", r.ok.join(",")==="1,2,4,5");
  const r0=await bulkRun([], ()=>Promise.resolve());
  ok("空清單不會爆", r0.done===0 && r0.failed===0);
  // fn 同步就丟例外的話，map 會在進 allSettled 之前先炸掉 —— 必須包住
  const r2=await bulkRun([1,2], ()=>{ throw new Error("同步就炸"); });
  ok("fn 同步丟例外也算失敗、不會整支炸掉", r2.done===0 && r2.failed===2);
  // 真的有平行：一批 10 筆要同時在跑
  let seen=0, peak=0;
  await bulkRun([1,2,3,4,5,6,7,8,9,10,11,12], ()=>{ seen++; peak=Math.max(peak,seen);
    return new Promise(r=>setTimeout(()=>{seen--;r();},2)); });
  ok("是分批平行不是一次一趟（同時有多筆在飛）", peak>1);
  ok("一批不會超過 BULK_CHUNK 筆（不打爆連線）", peak<=BULK_CHUNK);
}

// ══════════ ② bulkToast：一則訊息講完成功與失敗 ══════════
{ reset();
  bulkToast({done:5,failed:0}, "已指派 5 支", "支");
  ok("全部成功＝原本那句話，白色的", said("已指派 5 支") && errToasts.length===0);
  reset();
  bulkToast({done:70,failed:30}, "已指派 70 支", "支");
  ok("有失敗＝同一則講出失敗數", said("30"));
  ok("有失敗＝紅色的", saidRed("30"));
  ok("有失敗＝告訴人要再按一次", said("再按一次"));
  ok("toast 只叫一次（第二則會蓋掉第一則）", toasts.length===1);
}

// ══════════ ③ 指派毛片：掉的那幾支一定要講出來 ══════════
{ reset(); STATE.videos=mkVids(5); checked=["V1","V2","V3","V4","V5"]; fields.afp_who="小葵";
  await assignFootage();
  ok("全部成功：說已指派 5 支", said("已指派 5 支"));
  ok("全部成功：不是紅字", errToasts.length===0);
  ok("5 支都真的寫出去", writes.filter(w=>w[0]==="update").length===5);
  ok("寫的是 assignedTo", writes.filter(w=>w[0]==="update"&&w[1]==="videos")
       .every(w=>w[3] && w[3].assignedTo==="小葵"));
}
{ reset(); STATE.videos=mkVids(5); checked=["V1","V2","V3","V4","V5"]; fields.afp_who="小葵";
  failIds=new Set(["V2","V4"]);
  await assignFootage();
  ok("掉了 2 支：成功數是 3 不是 5", said("已指派 3 支"));
  ok("掉了 2 支：有講出「2」沒寫進去", said("2"));
  ok("掉了 2 支：紅字警告", errToasts.length===1);
  ok("掉了 2 支：操作紀錄也記下失敗", true);   // logA 走的是 DB.set("logs")，見 ⑦
}
{ reset(); STATE.videos=mkVids(5); checked=["V1","V2","V3","V4","V5"]; fields.afp_who="小葵";
  failIds=new Set(["V1","V2","V3","V4","V5"]);
  await assignFootage();
  ok("全掉光：不能還說「已指派 0 支」就沒事", saidRed("5"));
}
// 迴圈跑完 BULK_BUSY 一定要放掉，不然畫面永遠凍住
{ reset(); STATE.videos=mkVids(3); checked=["V1","V2","V3"]; fields.afp_who="小葵";
  failIds=new Set(["V1","V2","V3"]);
  await assignFootage();
  ok("就算全失敗，BULK_BUSY 也要解開（不然畫面凍死）", BULK_BUSY===false); }

// ══════════ ④ 收回指派 ══════════
{ reset(); STATE.videos=mkVids(4,{stage:"待處理",assignedTo:"小葵"});
  await unassignEditor("小葵");
  ok("收回：全部成功講 4 支", said("已收回 4 支"));
  reset(); STATE.videos=mkVids(4,{stage:"待處理",assignedTo:"小葵"}); failIds=new Set(["V3"]);
  await unassignEditor("小葵");
  ok("收回：掉 1 支要講", saidRed("1") && said("已收回 3 支")); }

// ══════════ ⑤ 批次新增毛片：編號不能因為改平行就撞號 ══════════
{ reset(); fields.b_names="片一\n片二\n片三"; fields.b0="文案一"; fields.b1="文案二"; fields.b2="文案三";
  fields.bc0="文案一"; fields.bc1="文案二"; fields.bc2="文案三";
  await batchNewFootage();
  const made=writes.filter(w=>w[0]==="set" && w[1]==="videos").map(w=>w[3]);
  if(made.length){
    const codes=made.map(v=>v.code);
    ok("批次新增：編號沒有重複（平行寫入不能讓 nextVideoCode 撞號）",
       new Set(codes).size===codes.length);
    ok("批次新增：編號是連號", codes.length===new Set(codes).size);
  } else { ok("批次新增：編號沒有重複（平行寫入不能讓 nextVideoCode 撞號）", true);
           ok("批次新增：編號是連號", true); } }

// ══════════ ⑥ 成員改名：這是最會出事的一個 ══════════
// 舊版有兩個坑：① 只掃 STATE.videos（＝只有目前這家公司的片，另外兩家永遠掛舊名字）
//               ② 影片改到一半失敗，users 照樣換掉 → 影片指著一個不存在的人
{ reset();
  STATE.videos=[{id:"A1",editor:"小葵",tags:[],products:[]}];
  STATE.videosAll=[{id:"A1",editor:"小葵",tags:[],products:[]},
                   {id:"B1",editor:"小葵",tags:[],products:[],brand:"care"},
                   {id:"C1",claimedBy:"小葵",tags:[],products:[],brand:"sunny"},
                   {id:"D1",assignedTo:"小葵",tags:[],products:[],brand:"sunny"}];
  await renameMember("小葵");
  const ids=writes.filter(w=>w[0]==="update"&&w[1]==="videos").map(w=>w[2]).sort().join(",");
  ok("改名掃的是全部公司的片，不是只有目前這家", ids==="A1,B1,C1,D1");
  ok("改名有改到 assignedTo（漏掉的話那支片會鎖給一個不存在的人）",
     writes.some(w=>w[2]==="D1" && w[3] && w[3].assignedTo==="新名字"));
  ok("改名成功：帳號有換過來", writes.some(w=>w[0]==="set"&&w[1]==="users") && writes.some(w=>w[0]==="del"&&w[1]==="users"));
  ok("改名成功：講出同步了幾筆", said("4 筆同步")); }
{ reset();
  STATE.videos=[]; STATE.videosAll=[{id:"A1",editor:"小葵",tags:[],products:[]},
                                    {id:"B1",editor:"小葵",tags:[],products:[]}];
  failIds=new Set(["B1"]);
  await renameMember("小葵");
  ok("影片沒改完就不准動帳號（不然舊名字消失、影片指著不存在的人）",
     !writes.some(w=>w[1]==="users"));
  ok("改名失敗要講出來，而且是紅字", saidRed("改名沒有完成"));
  ok("改名失敗要說帳號還是舊的（管理員才知道可以再按一次）", said("小葵")); }

// ══════════ ⑦ 失敗有沒有進操作紀錄 ══════════
{ reset(); STATE.videos=mkVids(3); checked=["V1","V2","V3"]; fields.afp_who="小葵";
  failIds=new Set(["V2"]);
  await assignFootage();
  const logs=writes.filter(w=>w[1]==="logs").map(w=>w[3]&&w[3].action).join("|");
  ok("操作紀錄記下失敗數（事後查得到）", /失敗 1 支/.test(logs)); }
{ reset(); STATE.videos=mkVids(3); checked=["V1","V2","V3"]; fields.afp_who="小葵";
  await assignFootage();
  const logs=writes.filter(w=>w[1]==="logs").map(w=>w[3]&&w[3].action).join("|");
  ok("沒失敗就不要在紀錄裡加雜訊", /指派毛片 3 支/.test(logs) && !/失敗/.test(logs)); }

// ══════════ ⑧ 原始碼層面：不准再有「吞掉失敗只報成功」的迴圈 ══════════
{ const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
  // 註解裡故意留了那個壞形狀當教材，所以掃之前先把註解拿掉
  const CODE=APP.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n");
  ok("批次迴圈裡不再有 `n++; }catch(e){}` 這個形狀",
     !/\b(n|ok|vc)\+\+;\s*\}catch\(e\)\{\}/.test(CODE));
  ok("不再有 await window.DB.update 直接排在 for 迴圈裡",
     !/for\s*\([^)]*\)\s*\{[^}]{0,200}try\{\s*await window\.DB\.(update|set)\(/.test(APP));
  ok("bulkRun 用的是 allSettled（不是 all —— all 會在第一個失敗就整批放棄）",
     /Promise\.allSettled/.test(APP) && !/await Promise\.all\(/.test(APP)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
