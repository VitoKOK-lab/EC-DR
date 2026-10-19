// v254 把指派鎖改成「唯讀可以看，但不能改」。v255 老闆再往前一步，直接說
// 「不鎖了，開放編輯」——因為上片連結常常要別人幫忙補，唯讀也會卡住這件事。
// 這支測試改成確認 v255 的結果：被指派給別人的片，誰都打得開**編輯視窗**
// （不是唯讀），文案、連結都看得到也改得了。
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
    users:[ {name:"小葵",role:"editor",perms:[]}, {name:"郁莚",role:"editor",perms:[]} ],
    settings:{ dailyTarget:4, videoTags:["舊片"], sources:["srcA"], postPlatforms:[],
      intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
    videos:[ {id:"V1", name:"郁莚的片", rawName:"郁莚原始片名", stage:"待處理", assignedTo:"郁莚",
      videoCopy:"這是文案內容", driveFolder:"https://drive.google.com/drive/folders/XYZ",
      finishedAt:"",publishedLink:"",reviewStatus:"",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]} ],
  };
  modalHTML=""; TOASTS=[];
}
const as=(name,role)=>{ localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ v255：沒有權限的人點被指派給別人的片，直接打得開編輯視窗 ══════════
{ reset(); as("小葵","editor");
  editVideo("V1");
  ok("**打得開**", modalHTML.includes("影片內容"), modalHTML.slice(0,80));
  ok("**是編輯模式，不是唯讀（有編輯欄位）**", modalHTML.includes('id="e_name"'));
  ok("**文案欄位看得到、改得了**", modalHTML.includes("這是文案內容")); }

// ══════════ 影片庫清單：不再變灰、不再標 vlock ══════════
{ reset(); as("小葵","editor");
  const row = vidTableRow(vid("V1"));
  ok("**沒有 vlock 了（不再是別人鎖住的樣子）**", !row.includes("vlock"), row);
  ok("**照舊點得開**", row.includes("editVideo("), row); }

console.log(`\nv254→v255（指派鎖整個拿掉，唯讀視窗不再是鎖住片的出路，直接開放編輯）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
