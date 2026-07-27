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
global.window = { addEventListener(){}, innerWidth:1200, innerHeight:800, scrollY:0, scrollTo(){}, DB:null, location:{reload(){}} };
global.requestAnimationFrame=(f)=>f();
global.navigator = { onLine:true };
global.confirm = ()=>true; global.prompt = ()=>null;
eval(src);

STATE = {
  users:[ {name:"小葵",role:"editor"}, {name:"Anna",role:"intl"} ],
  settings:{ videoTags:["舊片"], sources:["srcA"], postPlatforms:[{name:"IG",utm:"ig"}],
    intlAccounts:[{locale:"th",name:"acctTH"},{locale:"en",name:"acctEN"}],
    shopeeAccounts:["acctSHP"], msAccounts:["acctMS"], exchangeRates:{} },
  schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
  videos:[
    {id:"R1",name:"中文毛片一",rawName:"中文毛片一",stage:"待處理",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"R2",name:"中文毛片二",rawName:"中文毛片二",stage:"待處理",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"E1",name:"EN shell",rawName:"src",stage:"待處理",locale:"en",sourceVideoId:"S9",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"T1",name:"TH shell",rawName:"src",stage:"待處理",locale:"th",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"P1",name:"SHP shell",rawName:"src",stage:"待處理",channel:"shopee",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"M1",name:"MS shell",rawName:"src",stage:"待處理",channel:"ms",usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

localStorage.setItem("ecdr_user","小葵"); localStorage.setItem("ecdr_role","editor");
POOL_FILTER="all"; WORK_ZONE="shopee";
let h=viewWork();
ok("快選列存在（六類＋計數）", h.includes("setPoolFilter('all')") && h.includes("setPoolFilter('tw')") && h.includes("setPoolFilter('shopee')") && h.includes("setPoolFilter('ms')") && h.includes("setPoolFilter('en')") && h.includes("setPoolFilter('th')"));
ok("全部計數=6", h.includes(`>${T("全部","All")} <span class="vtab-n">6</span>`));
ok("全部顯示所有項目", h.includes("中文毛片一") && h.includes("EN shell") && h.includes("SHP shell"));
POOL_FILTER="tw"; h=viewWork();
ok("篩中文毛片：只剩原本", h.includes("中文毛片一") && h.includes("中文毛片二") && !h.includes("EN shell") && !h.includes("SHP shell") && !h.includes("MS shell"));
ok("篩選時 pill 顯示 2/6", h.includes(">2/6<"));
POOL_FILTER="en"; h=viewWork();
ok("篩英文：只剩 EN 殼", h.includes("EN shell") && !h.includes("中文毛片一") && !h.includes("TH shell"));
POOL_FILTER="shopee"; h=viewWork();
ok("篩蝦皮：只剩蝦皮殼", h.includes("SHP shell") && !h.includes("MS shell") && !h.includes("EN shell"));
// 空類別顯示引導
STATE.videos=STATE.videos.filter(v=>v.channel!=="ms");
POOL_FILTER="ms"; h=viewWork();
ok("空類別顯示引導文字", h.includes("這一類目前沒有可認領的項目"));
// intl 英文標籤
localStorage.setItem("ecdr_user","Anna"); localStorage.setItem("ecdr_role","intl");
POOL_FILTER="all"; h=viewWork();
ok("intl 快選英文標籤", h.includes(">All <span") && h.includes(">Chinese raw <span") && h.includes(">Thai <span"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
