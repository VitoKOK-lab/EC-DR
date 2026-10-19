// v254（老闆指定）：「雖然有鎖定的狀態，我還是需要讓所有員工都可以點進去看，
// 只是他們不能修改而已，因為其他人有可能要協助複製裡面的連結或者是看裡面的
// 文案」——指派鎖原本整支片連打開都打不開，改成打得開＝唯讀檢視（能看、能複製
// 連結跟文案），改不了（沒有編輯欄位、沒有存檔鍵）。
const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
src = src.replace(/^let /gm, "").replace(/^const /gm, "");
const el = () => ({ value:"", innerHTML:"", textContent:"", className:"",
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){}, appendChild(){}, querySelector(){return null;}, querySelectorAll(){return [];},
  getAttribute(){return null;}, setAttribute(){}, closest(){return null;}, getBoundingClientRect(){return {top:0,left:0,bottom:0,right:0};} });
const store={};
global.localStorage = { getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };
let modalHTML="", viewEl=el();
global.document = { getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){ Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}}); } return e; },
  addEventListener(){}, createElement:()=>el(), body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null, querySelectorAll:()=>[] };
global.window = { addEventListener(){}, innerWidth:390, innerHeight:800, scrollY:0, scrollTo(){}, DB:null, location:{reload(){}} };
global.requestAnimationFrame=(f)=>f();
global.navigator = { onLine:true };
global.confirm = ()=>true; global.prompt = ()=>null;
let TOASTS=[];
eval(src);
toast = (m,e) => { TOASTS.push(String(m)); };

function reset(){
  STATE = {
    users:[ {name:"小葵",role:"editor",perms:[]}, {name:"郁莚",role:"editor",perms:[]},
             {name:"Regina",role:"manager",perms:[]} ],
    settings:{ dailyTarget:4, videoTags:["舊片"], sources:["srcA"], postPlatforms:[],
      intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    videos:[ {id:"V1", name:"郁莚的片", rawName:"郁莚原始片名", stage:"待處理", assignedTo:"郁莚",
      videoCopy:"這是文案內容", driveFolder:"https://drive.google.com/drive/folders/XYZ",
      finishedAt:"",publishedLink:"",reviewStatus:"",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]} ],
  };
  modalHTML=""; VIEW_AS=null; TOASTS=[];
}
const as=(name,role)=>{ localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① 沒有權限的人點被鎖的片：打得開，但是唯讀視窗 ══════════
{ reset(); as("小葵","editor");
  editVideo("V1");
  ok("**打得開（不是空白、不是被擋）**", modalHTML.includes("影片內容"), modalHTML.slice(0,80));
  ok("**沒有編輯欄位（唯讀，不是編輯模式）**", !modalHTML.includes('id="e_name"'));
  ok("**文案內容看得到（可以複製）**", modalHTML.includes("這是文案內容"));
  ok("**存檔資料夾連結看得到（可以複製連結）**", modalHTML.includes("drive.google.com/drive/folders/XYZ"));
  ok("**看得到是誰的（不是裝作沒鎖）**", modalHTML.includes("唯讀") || modalHTML.includes("🔒")); }

// ══════════ ② 唯讀視窗裡沒有藏著一條能跳過鎖直接進編輯模式的路 ══════════
{ reset(); as("小葵","editor");
  editVideo("V1");
  ok("**唯讀視窗沒有「編輯」按鈕給沒權限的人**", !modalHTML.includes(">${T(\"編輯\"") , modalHTML.slice(0,400));
  ok("**唯讀視窗沒有一般的「編輯」文字按鈕**", !/>編輯<\/button>/.test(modalHTML), modalHTML); }

// ══════════ ③ 指派對象本人、manager 一樣能直接進編輯模式（沒被這次改動動到）══════════
{ reset(); as("郁莚","editor");
  editVideo("V1");
  ok("本人照舊打得開編輯模式", modalHTML.includes('id="e_name"')); }
{ reset(); as("Regina","manager");
  editVideo("V1");
  ok("manager 照舊打得開編輯模式", modalHTML.includes('id="e_name"')); }

// ══════════ ④ 影片庫清單：鎖住的列整列變灰，但還是點得開（不再是完全擋死）══════════
{ reset(); as("小葵","editor");
  const row = vidTableRow(vid("V1"));
  ok("**列上還是有 editVideo() 的 onclick（打得開）**", row.includes("editVideo("), row);
  ok("列上還是標了 vlock（視覺上變灰，提醒是別人的）", row.includes("vlock")); }

console.log(`\nv254（指派鎖＝唯讀檢視，不是整支片打不開；能看文案能複製連結，不能改）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
