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
eval(src);
const today0 = new Date(Date.now()+288e5).toISOString().slice(0,10);
STATE = {
  users:[{name:"小葵",role:"editor"}],
  settings:{shopeeAccounts:["蝦皮店A"],shopeeDailyTarget:2,dailyTarget:4},
  schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
  videos:[
    {id:"V001",name:"翡翠玉鐲",stage:"已上片",locale:"",channel:"",sourceVideoId:"",scheduledDate:"2026-01-01",editor:"小葵",published:true,usageHistory:[],tags:[],products:[],metrics:[]},
    {id:"V003",name:"蝦皮版本已完成",stage:"已完成",channel:"shopee",sourceVideoId:"V001",account:"蝦皮店A",editor:"小葵",finishedAt:today0+"T09:00:00",scheduledDate:today0,published:true,usageHistory:[],tags:[],products:[],metrics:[]},
  ],
};
localStorage.setItem("ecdr_user","小葵");
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

CAL_YM=null;
ok("Taiwan calendar still excludes shopee (dayVideoList)", !dayVideoList(today0).some(x=>x.videoId==="V003"));
VID_VIEW="old";
ok("Taiwan 影片庫 still excludes shopee child", !vidRowsHTML().includes(">V003<"));
WORK_ZONE="shopee"; let h = createZoneCard();
ok("蝦皮二創區卡可渲染（來源清單）", h.includes("建立二創版本") && h.includes(">蝦皮<"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
