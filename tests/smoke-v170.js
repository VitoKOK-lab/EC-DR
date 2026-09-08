// v170：① 指派的操作集中到儀表板（中控不再重複）② 交辦的時候可以附圖片
//
// 老闆看到成品說「現在的儀表板和中控好像很多重覆?」。我量過兩頁的卡片：
//   真重複：① 指派交辦給員工（一模一樣，是我刻意放兩份的）
//           🎬 指派毛片（儀表板叫「指派毛片給員工」、中控叫「毛片庫存＆指派」）
//   假重複：員工卡 —— 名字一樣但內容不同（儀表板講剪輯產出、中控講交辦回報）
// 老闆選「集中在儀表板」。
//
// ⚠️ 中控那張毛片卡不能整張砍：它同時裝了「存量警示」（中控獨有、老闆要看的）
//    跟「指派操作」（重複的）。只拿掉後者。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,files:null,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
const boxes={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(boxes[id]) return boxes[id];
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,
  querySelectorAll:(sel)=> String(sel||"").indexOf(".asg_p")===0 ? picked.map(n=>({value:n,checked:true})) : []};
let picked=[];
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
let COMPRESSED=0;
coverCompress=async(file)=>{ COMPRESSED++; return {fake:"blob", size:Math.round(file.size/40)}; };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
function as(w,r){ localStorage.setItem("ecdr_user",w); localStorage.setItem("ecdr_role",r); }
let WRITES=[], UPLOADS=[], TOASTS=[];
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"片"+id,videoCopy:"腳本",
  rawLink:"https://drive.google.com/file/d/RAW",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",
  scheduledDate:null,locale:"",channel:"",origLang:"",shotAt:"2026-09-08T10:00:00",shotBy:"x",
  tags:[],products:[],usageHistory:[],metrics:[],deleted:false,driveFolder:"",urgent:false},o||{});
function reset(videos){
  WRITES=[]; UPLOADS=[]; TOASTS=[]; picked=[]; ASG_PIC=null; COMPRESSED=0; VIEW_AS=null; BRAND="";
  for(const k in fields) delete fields[k];
  for(const k in boxes) delete boxes[k];
  global.window.DB={ set:async(c,id,o)=>{WRITES.push(["set",c,id,o]);},
    update:async(c,id,p)=>{WRITES.push(["update",c,id,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{},
    videosWatched:()=>true, netState:()=>({online:true,pending:false}),
    uploadTaskPic:async(a,b,blob)=>{ UPLOADS.push({a,b,blob}); return "https://fs/x/"+a+"/"+b+".jpg"; } };
  const raw={ users:[{name:"Regina",role:"manager"},{name:"管理員",role:"boss"},
                     {name:"小葵",role:"editor"},{name:"泓儒",role:"editor"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
}
toast=(m)=>{ TOASTS.push(String(m)); };
const img=(sz)=>({type:"image/jpeg", size:sz||3*1024*1024, name:"單子.jpg"});
const pickPic=(f)=>{ const inp=el(); inp.files=[f]; return pickAsgPic(inp); };

(async()=>{
// ══════════ ① 集中在儀表板，中控不重複 ══════════
{ reset([v_("P1")]); as("Regina","manager");
  const f=viewFlow(), d=viewDashboard();
  ok("**交辦卡只在儀表板**", d.includes("指派交辦給員工") && !f.includes("指派交辦給員工"));
  ok("**指派毛片也只在儀表板**", d.includes('id="afp_who"') && !f.includes('id="afp_who"'));
  ok("中控沒有殘留的指派按鈕", !f.includes("assignFootage()") && !/class="afp_vid"/.test(f));
  ok("flowAssignCard 整支移除，不留死碼", !/function flowAssignCard/.test(APP)); }

// 中控留下來的東西不能被砍掉
{ reset([v_("P1")]); as("Regina","manager");
  const f=viewFlow();
  ok("中控留著毛片庫存卡", f.includes("毛片庫存"));
  ok("留著存量數字", /支毛片・約可剪/.test(f), (f.match(/支毛片[^<]*/)||[])[0]);
  ok("留著每個人的單人交辦", /flowAssign\(/.test(f) && f.includes("交辦 小葵 一件事"));
  ok("有未指派的就指路到儀表板", /還有 <b>1<\/b> 支沒有指派/.test(f) && f.includes("儀表板"), (f.match(/還有[\s\S]{0,60}/)||[])[0]); }
// 存量不足的警示是中控獨有、也是老闆真正要看的，不能被順手砍掉
{ const many=[]; for(let i=0;i<3;i++) many.push(v_("P"+i,{assignedTo:"小葵"}));
  reset(many); as("Regina","manager");
  const f=viewFlow();
  ok("存量低於門檻時照樣紅字警告", f.includes("要去拍片了"), (f.match(/毛片剩[^<]*/)||[])[0]);
  ok("全部指派完了就不會再叫人去儀表板", !/還有 <b>\d+<\/b> 支沒有指派/.test(f)); }
{ reset([]); as("Regina","manager");
  ok("毛片池空的時候講得出來", viewFlow().includes("毛片池空了")); }

// 兩頁的未指派數字要一致，不然人會以為系統壞了
{ const vs=[]; for(let i=0;i<5;i++) vs.push(v_("Q"+i));
  reset(vs); as("Regina","manager");
  const f=viewFlow(), d=viewDashboard();
  const fm=f.match(/還有 <b>(\d+)<\/b> 支沒有指派/);
  const dm=d.match(/未指派 <b>(\d+)<\/b> 支/);
  const n=(d.match(/class="afp_vid"/g)||[]).length;
  ok("中控／儀表板／實際勾選框三個數字一致",
     !!fm && !!dm && +fm[1]===+dm[1] && +dm[1]===n, {中控:fm&&fm[1], 儀表板:dm&&dm[1], 勾選框:n}); }

// ══════════ ② 交辦的時候可以附圖 ══════════
{ reset([]); as("Regina","manager");
  const d=viewDashboard();
  ok("交辦卡上有附圖鈕", /pickAsgPic\(this\)/.test(d), (d.match(/asg_pic_btn[\s\S]{0,120}/)||[])[0]);
  ok("只收圖片檔", /<input type="file" accept="image\/\*"[^>]*onchange="pickAsgPic/.test(d));
  ok("有放預覽的位置", /id="asg_pic_box"/.test(d)); }

{ reset([]); as("Regina","manager");
  await pickPic(img());
  ok("選了圖會先壓縮", COMPRESSED===1);
  ok("**這時還不會上傳**（交辦 id 還沒產生，Storage 沒地方放）", UPLOADS.length===0, UPLOADS.length);
  ok("圖先留在記憶體裡", !!ASG_PIC); }

{ reset([]); as("Regina","manager");
  await pickPic(img());
  picked=["小葵","泓儒"]; fields.asg_txt="照這張單子做"; fields.asg_contact="";
  await assignTaskSel(); await new Promise(r=>setTimeout(r,30));
  ok("**圖只上傳一次**（不是一人一次）", UPLOADS.length===1, UPLOADS.length);
  const sets=WRITES.filter(x=>x[0]==="set"&&x[1]==="tasks").map(x=>x[3]);
  ok("兩個人都收到", sets.length===2);
  const url="https://fs/x/"+UPLOADS[0].a+"/"+UPLOADS[0].b+".jpg";
  ok("兩筆的第一則留言都帶著同一張圖",
     sets.length===2 && sets.every(s=>s.msgs.length===1 && s.msgs[0].pic===url),
     sets.map(s=>s.msgs));
  ok("那則留言記得是誰附的", sets.every(s=>s.msgs[0].by==="Regina"), sets.map(s=>s.msgs[0].by));
  ok("圖的路徑用 groupId（同一次交辦一個資料夾）", UPLOADS[0].a===sets[0].groupId, {up:UPLOADS[0].a, gid:sets[0].groupId});
  ok("送出之後把圖清掉，下一則交辦不會誤帶", ASG_PIC===null); }

{ reset([]); as("Regina","manager");
  picked=["小葵"]; fields.asg_txt="這則沒有圖"; fields.asg_contact="";
  await assignTaskSel(); await new Promise(r=>setTimeout(r,30));
  const s=WRITES.filter(x=>x[0]==="set"&&x[1]==="tasks").map(x=>x[3])[0];
  ok("沒附圖就不要上傳任何東西", UPLOADS.length===0);
  ok("沒附圖的 msgs 是空陣列（不要塞一則空留言）", s && Array.isArray(s.msgs) && s.msgs.length===0, s&&s.msgs); }

// 圖傳不上去就整筆不要送 —— 送出去了但圖不見，人家看不到你講的那張單子
{ reset([]); as("Regina","manager");
  await pickPic(img());
  global.window.DB.uploadTaskPic=async()=>{ throw new Error("網路斷了"); };
  picked=["小葵"]; fields.asg_txt="照這張單子做"; fields.asg_contact="";
  await assignTaskSel(); await new Promise(r=>setTimeout(r,30));
  ok("**圖傳失敗就整筆不送**（不然人家看不到你說的那張圖）",
     WRITES.filter(x=>x[0]==="set"&&x[1]==="tasks").length===0, WRITES.length); }

// 擋掉不該傳的檔
{ reset([]); as("Regina","manager");
  await pickPic({type:"video/mp4",size:1000,name:"a.mp4"});
  ok("選到影片檔擋下來", !ASG_PIC && TOASTS.some(x=>/圖片檔/.test(x)), TOASTS); }
{ reset([]); as("Regina","manager");
  await pickPic(img(20*1024*1024));
  ok("超過 12MB 擋下來", !ASG_PIC && TOASTS.some(x=>/12MB/.test(x)), TOASTS); }
{ reset([]); as("Regina","manager"); VIEW_AS="小葵";
  await pickPic(img());
  ok("員工視角（唯讀預覽）底下不准選圖", !ASG_PIC && COMPRESSED===0); VIEW_AS=null; }
{ reset([]); as("Regina","manager");
  await pickPic(img());
  ok("（前提）圖在", !!ASG_PIC);
  asgPicClear();
  ok("按「取消」可以把圖丟掉", ASG_PIC===null); }

console.log(`\nv170（指派集中在儀表板・交辦可以附圖）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
