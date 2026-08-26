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
    {id:"W1",name:"待審核的片",rawName:"待審核的片",stage:"已完成",editor:"小葵",finishedAt:T0+"T02:00:00Z",reviewStatus:"",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"W4",name:"審過的片",rawName:"審過的片",stage:"已完成",editor:"小葵",finishedAt:T0+"T04:00:00Z",reviewStatus:"通過",driveFolder:"http://d",publishedLink:"http://p",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"P9",name:"蝦皮待審",rawName:"src",stage:"已完成",editor:"小葵",finishedAt:T0+"T05:00:00Z",reviewStatus:"",channel:"shopee",sourceVideoId:"W4",account:"acctSHP",usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// dispStage 邏輯
ok("dispStage：已完成+未審=待審核", dispStage(STATE.videos[0])==="待審核");
ok("dispStage：已完成+通過=已完成", dispStage(STATE.videos[1])==="已完成");

// 影片庫列
localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
VID_LANG=""; VID_VIEW="done"; VID_TAGS=new Set(); VID_Q="";
let h=vidTableRow(STATE.videos[0]);
ok("影片庫列顯示待審核（琥珀）", h.includes("待審核") && h.includes("var(--amber)"));
h=vidTableRow(STATE.videos[1]);
ok("審過的片顯示剪輯完成", h.includes("剪輯完成") && !h.includes("待審核"));

// 我的工作按鈕：待審核琥珀
WORK_ZONE="shopee"; POOL_FILTER="all";
h=viewWork();
ok("我的今日工作：待審核琥珀鍵", h.includes(">待審核</button>") || h.includes("待審核</button>"));
ok("等審列有「已審過」鍵", h.includes("editorMarkReviewed('W1')") && h.includes("已審過，下一步"));

// editorMarkReviewed 寫入通過
{ const calls=[]; global.window.DB={ set:async()=>{}, update:async(c,id,p)=>{calls.push([c,id,p]);}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
  (async()=>{ await editorMarkReviewed("W1");
    const hit=calls.find(([c,id,p])=>c==="videos"&&id==="W1"&&p.reviewStatus==="通過");
    ok("已審過鍵寫入 reviewStatus=通過＋審核人", !!hit && hit[2].reviewedBy==="小葵");

    // 完成確認文案提到待審核
    let msg=""; global.confirm=(m)=>{msg=m; return false;};
    finishWork("W1"); ok("完成確認提到待審核", msg.includes("待審核"));
    global.confirm=()=>true;

    // 檢視視窗階段列
    openVideoModal("W1", false);
    ok("檢視視窗階段=待審核", modalHTML.includes("待審核"));
    // intl 顯示 In review
    // v146：海外進同一個視窗，所以階段名這次真的看得到 —— 而且要是英文
    localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
    openVideoModal("W1", false);
    // ⚠️ 不能寫 !includes("待審核") —— 這支測試影片的片名本來就叫「待審核的片」。
    //    要驗的是「階段那一列」的字，所以連 Stage 標籤一起比。
    ok("intl 檢視視窗階段=In review（英文）",
       /Stage<\/div>[\s\S]{0,200}?In review/.test(modalHTML) && !/Stage<\/div>[\s\S]{0,200}?待審核/.test(modalHTML));

    // Regina 待審清單含蝦皮殼
    localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
    h=viewFlow();
    ok("Regina 待審清單含一創與蝦皮殼", h.includes("待審核的片") && h.includes("蝦皮待審"));

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail?1:0);
  })(); }
