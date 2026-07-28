// v72：多人同時操作的「後蓋前」問題 —— 排程一天的 slots 原本是「讀出整份 → push → 整份寫回」，
// 兩個人同時排同一天，後寫的會把前一筆蓋掉；刪除又是用索引，別人同時改就會刪到別人的排片。
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
let server={}, calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const T0=new Date(Date.now()+288e5).toISOString().slice(0,10);
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// 會「原子加減」的假 Firestore：arrayAdd/arrayDel/bump 直接動伺服器上的那份，
// 不管客戶端手上的快照是不是舊的 —— 跟真的 arrayUnion/arrayRemove/increment 一樣。
function hookDB(atomic){
  const g=(c,id)=>{ server[c]=server[c]||{}; return (server[c][id]=server[c][id]||{}); };
  const base={
    set:async(c,id,o)=>{ calls.push(["set",c,id]); server[c]=server[c]||{}; server[c][id]=JSON.parse(JSON.stringify(o)); },
    update:async(c,id,p)=>{ calls.push(["update",c,id,p]); Object.assign(g(c,id), JSON.parse(JSON.stringify(p))); },
    del:async(c,id)=>{ calls.push(["del",c,id]); if(server[c]) delete server[c][id]; },
    scheduleSet:async(d,o)=>{ calls.push(["scheduleSet",d,o]); server.schedule=server.schedule||{}; server.schedule[d]=JSON.parse(JSON.stringify(o)); },
    setSettings:async(p)=>{ calls.push(["setSettings",p]); Object.assign(g("meta","settings"), JSON.parse(JSON.stringify(p))); },
  };
  if(atomic) Object.assign(base,{
    arrayAdd:async(c,id,f,v)=>{ calls.push(["arrayAdd",c,id,f]); const d=g(c,id); d[f]=(d[f]||[]).concat([JSON.parse(JSON.stringify(v))]); },
    arrayDel:async(c,id,f,v)=>{ calls.push(["arrayDel",c,id,f]); const d=g(c,id); d[f]=(d[f]||[]).filter(x=>!eq(x,v)); },
    bump:async(c,id,f,n)=>{ calls.push(["bump",c,id,f,n]); const d=g(c,id); d[f]=(+d[f]||0)+n; },
  });
  global.window.DB=base;
}
function reset(atomic){
  server={}; calls=[]; toasts=[]; modalHTML=""; fields={};
  STATE={ users:[{name:"小葵",role:"editor",craft:"orig"},{name:"阿明",role:"editor",craft:"orig"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["舊片"],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:["廠商A"],reviewSince:"2026-07-01"},
    schedule:{}, logs:[], tasks:{}, shifts:{}, deletedVideos:[],
    videos:[{id:"V001",code:"",name:"甲片",rawName:"甲片",stage:"已上片",published:true,locale:"",channel:"",
             publishedLink:"http://p",driveFolder:"http://d",finishedAt:"2026-06-01T00:00:00",
             tags:[],products:[],usageHistory:[],totalUsed:0,metrics:[],scheduledDate:null},
            {id:"V002",code:"",name:"乙片",rawName:"乙片",stage:"待處理",locale:"",channel:"",
             tags:[],products:[],usageHistory:[],metrics:[],scheduledDate:null}] };
  CUR_TAB=null; VIEW_AS=null;
  hookDB(atomic!==false);
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const slotsOn=(d)=>((server.schedule||{})[d]||{}).slots||[];
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

(async()=>{
  // ── ① 兩個人同時排同一天：兩筆都要在（原本後寫的會蓋掉前一筆）──
  reset(); as("小葵","editor");
  // 兩人手上的快照都還是「這天沒有任何排片」
  await route("POST",`/api/schedule/${T0}/slot`,{slot:{videoId:"V001",time:"10:00",by:"小葵"}});
  await route("POST",`/api/schedule/${T0}/slot`,{slot:{videoId:"V002",time:"12:00",by:"阿明"}});
  ok("兩個人同時排同一天，兩筆都在", slotsOn(T0).length===2);
  ok("兩筆各自是自己排的", slotsOn(T0).map(s=>s.videoId).sort().join(",")==="V001,V002");
  ok("用的是原子新增，不是整份覆蓋", calls.some(c=>c[0]==="arrayAdd"&&c[1]==="schedule") && !calls.some(c=>c[0]==="scheduleSet"));

  // ── ② 刪除排片用「整格內容」比對，不是索引 ──
  reset(); as("小葵","editor");
  await route("POST",`/api/schedule/${T0}/slot`,{slot:{videoId:"V001",time:"10:00",by:"小葵"}});
  await route("POST",`/api/schedule/${T0}/slot`,{slot:{videoId:"V002",time:"12:00",by:"阿明"}});
  STATE.schedule={[T0]:{slots:JSON.parse(JSON.stringify(slotsOn(T0)))}};   // 同步回來
  await route("DELETE",`/api/schedule/${T0}/slot/1`,{});                    // 刪第 2 格（乙片）
  ok("刪掉的是指定的那一格", slotsOn(T0).length===1 && slotsOn(T0)[0].videoId==="V001");
  ok("用的是原子刪除", calls.some(c=>c[0]==="arrayDel"&&c[1]==="schedule"));

  // ── ③ 別人先刪了一格，我手上的索引已經位移 → 不會誤刪別人的 ──
  reset(); as("小葵","editor");
  await route("POST",`/api/schedule/${T0}/slot`,{slot:{videoId:"V001",time:"10:00",by:"小葵"}});
  await route("POST",`/api/schedule/${T0}/slot`,{slot:{videoId:"V002",time:"12:00",by:"阿明"}});
  STATE.schedule={[T0]:{slots:JSON.parse(JSON.stringify(slotsOn(T0)))}};   // 我看到 2 格
  server.schedule[T0].slots=[{videoId:"V002",time:"12:00",by:"阿明"}];      // 別人剛把第 1 格刪了
  await route("DELETE",`/api/schedule/${T0}/slot/0`,{});                    // 我按的還是「第 1 格」＝甲片
  ok("別人的排片沒有被誤刪", slotsOn(T0).length===1 && slotsOn(T0)[0].videoId==="V002");

  // ── ④ 已上架鎖定的排片不能刪 ──
  reset(); as("小葵","editor");
  STATE.schedule={[T0]:{slots:[{videoId:"V001",locked:true}]}};
  server.schedule={[T0]:{slots:[{videoId:"V001",locked:true}]}};
  let threw=false;
  try{ await route("DELETE",`/api/schedule/${T0}/slot/0`,{}); }catch(e){ threw=/鎖定/.test(e.message); }
  ok("鎖定的排片刪不掉", threw && slotsOn(T0).length===1);

  // ── ⑤ 重播：排片、使用紀錄、次數都用原子操作 ──
  reset(); as("小葵","editor");
  await route("POST","/api/videos/V001/reuse",{date:T0,time:"16:00",link:"http://new",drive:""});
  ok("重播排進當天", slotsOn(T0).length===1 && slotsOn(T0)[0].reused===true);
  ok("使用紀錄用原子追加", calls.some(c=>c[0]==="arrayAdd"&&c[1]==="videos"&&c[3]==="usageHistory"));
  ok("使用次數用原子累加", calls.some(c=>c[0]==="bump"&&c[1]==="videos"&&c[3]==="totalUsed"&&c[4]===1));
  ok("次數真的加上去了", ((server.videos||{}).V001||{}).totalUsed===1);

  // 兩個人同時重播同一支不同天 → 次數要是 2，不是 1
  reset(); as("小葵","editor");
  await route("POST","/api/videos/V001/reuse",{date:T0,time:"10:00",link:"a",drive:""});
  await route("POST","/api/videos/V001/reuse",{date:"2026-08-01",time:"12:00",link:"b",drive:""});
  ok("同時重播兩次，次數是 2（沒有互相蓋掉）", ((server.videos||{}).V001||{}).totalUsed===2);
  ok("使用紀錄兩筆都在", (((server.videos||{}).V001||{}).usageHistory||[]).length===2);

  // ── ⑥ 舊環境（沒有原子寫入）要能退回舊寫法，不能整個壞掉 ──
  reset(false); as("小葵","editor");
  await route("POST",`/api/schedule/${T0}/slot`,{slot:{videoId:"V001",time:"10:00"}});
  ok("沒有原子寫入時退回整份寫回", slotsOn(T0).length===1 && calls.some(c=>c[0]==="scheduleSet"));
  reset(false); as("小葵","editor");
  await route("POST","/api/videos/V001/reuse",{date:T0,time:"16:00",link:"x",drive:""});
  ok("舊環境的重播照樣可用", (((server.videos||{}).V001||{}).usageHistory||[]).length===1);

  // ── ⑦ 自建工作項目的 ID 要有亂數（同毫秒兩個人建立不會撞號）──
  reset(); as("小葵","editor");
  fields.wp_newtask="做一件事"; fields.wp_contact="";
  await createTask();
  fields.wp_newtask="做另一件事";
  await createTask();
  { const ids=calls.filter(c=>c[0]==="set"&&c[1]==="tasks").map(c=>c[2]);
    ok("兩次自建工作的 ID 不一樣", ids.length===2 && ids[0]!==ids[1]);
    ok("兩筆都寫進去了", Object.keys(server.tasks||{}).length===2); }

  // ── ⑧ 對接窗口新增／刪除也是原子操作 ──
  reset(); as("管理員","boss");
  fields.ct_name="新窗口"; addContact(); await new Promise(r=>setTimeout(r,20));
  ok("新增窗口用原子追加", calls.some(c=>c[0]==="arrayAdd"&&c[3]==="contacts"));
  reset(); as("管理員","boss");
  delContact("廠商A"); await new Promise(r=>setTimeout(r,20));
  ok("刪除窗口用原子刪除", calls.some(c=>c[0]==="arrayDel"&&c[3]==="contacts"));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
