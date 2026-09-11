const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
src = src.replace(/^let /gm, "");
const el = () => ({ value:"", innerHTML:"", textContent:"", className:"", style:{},
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
eval(src);

const T0 = new Date(Date.now()+288e5).toISOString().slice(0,10);
STATE = {
  users:[ {name:"Regina",role:"manager"}, {name:"小葵",role:"editor"}, {name:"Anna",role:"intl"} ],
  settings:{ dailyTarget:4, videoTags:["舊片"], sources:["srcA"], postPlatforms:[{name:"IG",utm:"ig"}],
    intlAccounts:[{locale:"en",name:"acctEN"}], shopeeAccounts:["acctSHP"], msAccounts:["acctMS"], exchangeRates:{} },
  schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
  videos:[
    // 小葵：等審 1、通過待補 1（缺存檔連結）、退回 1、已審完成正常 1
    // v136：源片的編輯視窗沒有「上片連結」那一格，所以源片只看存檔連結有沒有補齊；
    //       拿一個填不了的欄位當「還沒補齊」，這張卡會永遠叫、剪輯按了「知道了」才走得掉。
    {id:"W1",name:"等審的片",rawName:"等審的片",stage:"已完成",editor:"小葵",finishedAt:T0+"T02:00:00Z",reviewStatus:"",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"W2",name:"通過待補連結",rawName:"通過待補連結",stage:"已完成",editor:"小葵",finishedAt:T0+"T03:00:00Z",reviewStatus:"通過",driveFolder:"",publishedLink:"",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"W3",name:"被退回的片",rawName:"被退回的片",stage:"剪輯中",editor:"小葵",claimedBy:"小葵",claimedAt:T0+"T01:00:00Z",reviewStatus:"退回",reviewNote:"字卡打錯",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"W4",name:"全部完成的片",rawName:"全部完成的片",stage:"已完成",editor:"小葵",finishedAt:T0+"T04:00:00Z",reviewStatus:"通過",driveFolder:"http://d",publishedLink:"http://p",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    // 源片有存檔連結就算補齊了 —— 沒有上片連結不能再讓它一直掛在卡上叫
    {id:"W5",name:"有存檔沒上片連結",rawName:"有存檔沒上片連結",stage:"已完成",editor:"小葵",finishedAt:T0+"T04:30:00Z",reviewStatus:"通過",driveFolder:"http://d",publishedLink:"",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    // Anna 的英文殼等審（測 shell 分支＋intl 英文）
    {id:"E9",name:"EN done cut",rawName:"src",stage:"已完成",editor:"Anna",finishedAt:T0+"T05:00:00Z",reviewStatus:"",locale:"en",sourceVideoId:"W4",account:"acctEN",usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ── 剪輯的審片進度卡 ──
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
WORK_ZONE="shopee"; POOL_FILTER="all";
let h=viewWork();
ok("審片進度卡出現且計數=3", h.includes("審片進度") && h.includes('">3</span>'));
ok("退回段：紅色＋原因", h.includes("被退回，要修") && h.includes("字卡打錯"));
ok("通過待補段：列出通過但缺連結的片", h.includes("已審過（通過）") && h.includes("通過待補連結"));
// 2026-09-11（老闆指定）：「先幫我復原回去給每一位剪輯，先讓他們可以自己按『已審核』」
// —— v184 那條「只有 Regina 按得動」復原掉了。下面那句說明文字老闆說不需要拿掉，
// 它描述的正好就是復原後的流程（Regina 口頭說 OK，剪輯自己按），所以整句都要在。
ok("待審核段：列出等審的片，說明文字整句都在",
   h.includes("待審核 — Regina 說 OK 後，自己按「已審過」進下一步") && h.includes("等審的片"));
ok("**剪輯這邊有自己按得動的「審過」鍵**",
   h.includes("editorMarkReviewed('W1')") && h.includes("✓ 審過"));
{ const seg=h.split("審片進度")[1].split("剪完等審的片")[0].split("最近 7 天剪完的片")[0];   // v184：還沒審的那張卡標題會變
  ok("已審完成的片不出現在審片卡裡", !seg.includes("全部完成的片"));
  // v136：源片填不了上片連結，所以有存檔連結就算補齊 —— 不能讓它永遠掛在卡上叫
  ok("源片有存檔連結就算補齊，不會再一直掛在審片卡上", !seg.includes("有存檔沒上片連結")); }
ok("別人的片不出現", !h.includes("EN done cut"));

// intl 視角英文
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
h=viewWork();
ok("intl 審片卡英文", h.includes("Review status") && h.includes("In review — once Regina says OK") && h.includes("EN done cut") && !h.includes("審片進度"));

// ── Regina：待審清單＋審核按鈕 ──
localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
h=viewFlow();
ok("流程中控有待審片卡（2 支：W1+E9）", h.includes("待你審片") && h.includes('">2</span>') && h.includes("等審的片") && h.includes("EN done cut"));
ok("待審列出剪輯與完成日", h.includes("小葵・完成") || h.includes("小葵"));
openVideoModal("W1", true);
ok("manager 編輯視窗有審核按鈕", modalHTML.includes("reviewVid('W1','通過')") && modalHTML.includes("reviewVid('W1','退回')"));
openIntlModal("E9");
ok("manager 英文殼視窗也有審核按鈕", modalHTML.includes("reviewVid('E9','通過')"));
// editor 沒有審核按鈕
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
openVideoModal("W1", true);
ok("editor 沒有審核按鈕", !modalHTML.includes("reviewVid("));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
