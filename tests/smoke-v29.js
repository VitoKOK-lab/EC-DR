const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
src = src.replace(/^let /gm, "");
const el = () => ({ value:"", innerHTML:"", textContent:"", className:"", style:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){}, appendChild(){}, querySelector(){return null;}, querySelectorAll(){return [];},
  getAttribute(){return null;}, setAttribute(){}, closest(){return null;}, getBoundingClientRect(){return {top:0,left:0,bottom:0,right:0};} });
const store={};
global.localStorage = { getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };
let modalHTML="";
global.document = { getElementById:(id)=>{ const e=el(); if(id==="modalRoot"){ Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}}); } return e; },
  addEventListener(){}, createElement:()=>el(), body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null, querySelectorAll:()=>[] };
global.window = { addEventListener(){}, innerWidth:1200, innerHeight:800, scrollY:0, scrollTo(){}, DB:null, location:{reload(){}} };
global.navigator = { onLine:true };
eval(src);
STATE = { users:[{name:"小葵",role:"editor"},{name:"Anna",role:"intl"}],
  settings:{exchangeRates:{en:{code:"USD",rate:0.032}},shopeeAccounts:["蝦皮店A"]}, schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
  videos:[
    {id:"S1",name:"黃金一週跌12%",rawName:"黃金一週跌12%",videoCopy:"稿",stage:"已完成",locale:"",channel:"",productUrl:"https://x",products:[{name:"111",price:10000,salePrice:2333}],usageHistory:[],tags:[],metrics:[]},
    {id:"V1",name:"",stage:"待處理",channel:"shopee",sourceVideoId:"S1",account:"蝦皮店A",products:[],usageHistory:[],tags:[],metrics:[]},
    {id:"V2",name:"",stage:"待處理",locale:"en",sourceVideoId:"S1",account:"TikTok US",products:[],usageHistory:[],tags:[],metrics:[]},
  ] };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }
function orderOK(html, a, b){ const ia=html.indexOf(a), ib=html.indexOf(b); return ia>=0 && ib>=0 && ia<ib; }

localStorage.setItem("ecdr_user","小葵");
openChModal("shopee","V1");
ok("shopee: price line removed from source card (appears once)", (modalHTML.match(/商品：/g)||[]).length===1);
ok("shopee: order = 片名 → 商品價格 → 文案", orderOK(modalHTML,'id="shp_name"','商品：') && orderOK(modalHTML,'商品：','id="shp_vcopy"'));
ok("shopee: price + 寵粉價 + 商品頁 link all present", modalHTML.includes("NT$10,000") && modalHTML.includes("寵粉價 NT$2,333") && modalHTML.includes("🛍 商品頁"));

localStorage.setItem("ecdr_user","Anna");
openIntlModal("V2");
ok("intl: price line removed from source card (appears once)", (modalHTML.match(/Products:/g)||[]).length===1);
ok("intl: order = Title → Products → Script", orderOK(modalHTML,'id="i_name"','Products:') && orderOK(modalHTML,'Products:','id="i_vcopy"'));
ok("intl: converted price + Fan price shown", modalHTML.includes("$320") && modalHTML.includes("Fan price $75"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
