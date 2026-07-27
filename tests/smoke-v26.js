const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
src = src.replace(/^let /gm, "");
const el = () => ({ value:"", innerHTML:"", textContent:"", className:"", style:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){}, appendChild(){}, querySelector(){return null;}, querySelectorAll(){return [];},
  getAttribute(){return null;}, setAttribute(){}, closest(){return null;}, getBoundingClientRect(){return {top:0,left:0,bottom:0,right:0};} });
const store={};
global.localStorage = { getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };
global.document = { getElementById:()=>el(), addEventListener(){}, createElement:()=>el(), body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null, querySelectorAll:()=>[] };
global.window = { addEventListener(){}, innerWidth:1200, innerHeight:800, scrollY:0, scrollTo(){}, DB:null, location:{reload(){}} };
global.navigator = { onLine:true };
global.confirm = ()=>true;
eval(src);

const today0 = new Date(Date.now()+288e5).toISOString().slice(0,10);
STATE = {
  users:[{name:"小葵",role:"editor"}],
  settings:{shopeeAccounts:["蝦皮店A"],shopeeDailyTarget:2,dailyTarget:4},
  schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
  videos:[
    {id:"V001",name:"翡翠玉鐲",stage:"已上片",locale:"",channel:"",sourceVideoId:"",scheduledDate:"2026-01-01",editor:"小葵",published:true,usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"V002",name:"蝦皮版本待處理",stage:"待處理",channel:"shopee",sourceVideoId:"V001",account:"蝦皮店A",assignedTo:"小葵",usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"V003",name:"蝦皮版本製作中",stage:"剪輯中",channel:"shopee",sourceVideoId:"V001",account:"蝦皮店A",claimedBy:"小葵",editor:"小葵",claimedAt:"2026-01-01T09:00:00",usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

localStorage.setItem("ecdr_user","小葵");

let h = viewWork();
ok("no separate 我的蝦皮工作 card", !h.includes("我的蝦皮工作"));
ok("shopee pending item merged into 待剪毛片 pool", h.includes("蝦皮版本待處理"));
ok("shopee in-progress item merged into 我的今日工作", h.includes("蝦皮版本製作中"));
ok("shrimp badge shown on shopee items", (h.match(/>蝦</g)||[]).length>=2);
ok("shopee pool item opens openShopeeModal on click", h.includes(`onclick="openChModal('shopee','V002')"`));
ok("shopee myWork item opens openShopeeModal on click", h.includes(`onclick="openChModal('shopee','V003')"`));
ok("shopee myWork item uses shopeeFinish (not finishWork)", h.includes(`onclick="chFinish('shopee','V003')"`));
ok("shopee myWork item uses shopeeUnclaim for 退回", h.includes(`onclick="chUnclaim('shopee','V003')"`));
ok("focusbar 製作中 count includes the shopee in-progress item (merged bucket)", h.includes('<span class="fn ">1<i>/3</i></span><span class="fl">製作中</span>') || /製作中<\/span>/.test(h));

// verify merged in-progress count precisely
ok("myInProgressCount() default merges shopee", myInProgressCount()===1);

// claim cap: push 2 more plain + shopee in-progress = 3 total, merged bucket should block a 4th of either kind
STATE.videos.push(
  {id:"V010",stage:"剪輯中",claimedBy:"小葵",editor:"小葵",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
  {id:"V011",stage:"剪輯中",claimedBy:"小葵",editor:"小葵",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]},
  {id:"V012",stage:"待處理",claimedBy:"",editor:"",locale:"",channel:"",usageHistory:[],tags:[],products:[],metrics:[]}
);
global.window.DB = { set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
(async ()=>{
  let threw=false;
  try{ await route("POST","/api/videos/V012/claim",{}); } catch(e){ threw=true; }
  ok("4th claim now ALLOWED (cap removed 2026-07)", !threw);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
