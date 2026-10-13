// v250（老闆指定）：「月排程 泰國馬來西亞可以拿掉」。
// 範圍確認過：只拿掉「月排程」平台選單裡的「泰文」「馬來西亞」這兩個選項，
// 其他功能（建立二創版本、影片庫、審核、成效……）完全不動，既有的泰文／
// 馬來西亞影片資料也照舊留著，只是月排程這個切換器選不到了。
const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
const APP = src;
src = src.replace(/^let /gm, "").replace(/^const /gm, "");
const el = () => ({ value:"", innerHTML:"", textContent:"", className:"",
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){}, appendChild(){}, querySelector(){return null;}, querySelectorAll(){return [];},
  getAttribute(){return null;}, setAttribute(){}, closest(){return null;}, getBoundingClientRect(){return {top:0,left:0,bottom:0,right:0};} });
const store={};
global.localStorage = { getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };
let viewEl=el();
global.document = { getElementById:(id)=>{ if(id==="view") return viewEl; return el(); },
  addEventListener(){}, createElement:()=>el(), body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null, querySelectorAll:()=>[] };
global.window = { addEventListener(){}, innerWidth:390, innerHeight:800, scrollY:0, scrollTo(){}, DB:null, location:{reload(){}} };
global.requestAnimationFrame=(f)=>f();
global.navigator = { onLine:true };
global.confirm = ()=>true; global.prompt = ()=>null;
eval(src);

function reset(){
  STATE = {
    users:[ {name:"小葵",role:"editor"}, {name:"Regina",role:"manager"}, {name:"Anna",role:"intl"} ],
    settings:{ dailyTarget:4, videoTags:[], sources:["srcA"], postPlatforms:[],
      intlAccounts:[], shopeeAccounts:[], msAccounts:[], exchangeRates:{} },
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[],
  };
  CAL_PLAT="tw"; CAL_PLAT_FOR=null; CAL_YM=null; INTL_CAL_YM=null;
}
const as=(name,role)=>{ localStorage.setItem("ecdr_user",name); localStorage.setItem("ecdr_role",role); };

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① 月排程平台選單不再有泰文／馬來西亞 ══════════
{ reset(); as("小葵","editor"); CUR_TAB="cal";
  const h=viewCal();
  ok("**月排程平台選單沒有「馬來西亞」**", !h.includes(">馬來西亞<"), h.slice(0,300));
  ok("**月排程平台選單沒有「泰文」**", !h.includes(">泰文<"));
  ok("剩下的中文／蝦皮／Boss Sunny／英文還在", [">中文<",">蝦皮<",">Boss Sunny<",">英文<"].every(x=>h.includes(x))); }

// ══════════ ② 硬塞 CAL_PLAT 成已拿掉的平台，會被防呆退回，不會真的切進去 ══════════
{ reset(); as("小葵","editor"); CAL_PLAT="ms"; CUR_TAB="cal";
  viewCal();
  ok("**CAL_PLAT 被退回，不會停在已經拿掉的 ms**", CAL_PLAT!=="ms", CAL_PLAT); }
{ reset(); as("Anna","intl"); CAL_PLAT="th"; CAL_PLAT_FOR="intl"; CUR_TAB="cal";
  viewCal();
  ok("**海外那邊硬塞 th 也一樣被退回**", CAL_PLAT!=="th", CAL_PLAT); }

// ══════════ ③ 範圍只限月排程：建立二創版本、影片庫照舊有泰文／馬來西亞 ══════════
{ reset(); as("小葵","editor");
  const z=createZoneCard();
  ok("**建立二創版本卡沒被動到，馬來西亞／泰文還在**",
     z.includes("馬來西亞") && z.includes("泰文"), z.slice(0,200)); }
{ reset(); as("小葵","editor");
  const h=viewVideos();
  ok("**影片庫的「原本語言」下拉沒被動到，馬來西亞還在**", h.includes("馬來西亞（")); }

console.log(`\nv250（月排程平台選單拿掉泰文／馬來西亞，其他功能不動）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
