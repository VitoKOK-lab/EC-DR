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
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

STATE = { users:[{name:"小葵",role:"editor"},{name:"Anna",role:"intl"},{name:"管理員",role:"boss"}],
  settings:{ exchangeRates:{ en:{code:"USD",rate:0.0313,mult:1.2}, th:{code:"THB",rate:1.038,mult:1}, ms:{code:"MYR",rate:0.1275,mult:2}, shopee:{code:"TWD",rate:1,mult:1.5} }, shopeeAccounts:["蝦皮店A"], intlAccounts:[{locale:"en",name:"TikTok US"}] },
  schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
  videos:[
    {id:"S1",name:"金鐲",rawName:"金鐲",stage:"已完成",locale:"",channel:"",products:[{name:"鐲",price:10000,salePrice:2333}],productUrl:"https://x",usageHistory:[],tags:[],metrics:[]},
    {id:"V1",name:"",stage:"待處理",channel:"shopee",sourceVideoId:"S1",account:"蝦皮店A",products:[],usageHistory:[],tags:[],metrics:[]},
    {id:"V2",name:"",stage:"待處理",locale:"en",sourceVideoId:"S1",account:"TikTok US",products:[],usageHistory:[],tags:[],metrics:[]},
  ] };

// 換算數學：en 10000*0.0313*1.2=375.6→376；蝦皮 10000*1*1.5=15000；寵粉 2333*1.5=3499.5→3500
let line = productPriceLine(STATE.videos[0].products, "en");
ok("en: price × rate × mult (10000→$376)", line.includes("$376"));
line = productPriceLine(STATE.videos[0].products, "shopee");
ok("shopee: price × mult only (10000→NT$15,000)", line.includes("NT$15,000"));
ok("shopee: fan price × mult (2333→NT$3,500)", line.includes("寵粉價 NT$3,500"));
line = productPriceLine(STATE.videos[0].products, "th");
ok("th: mult=1 → pure rate (10000→฿10,380)", line.includes("฿10,380"));

// 蝦皮匯率固定 1，即使資料被亂改也不吃 rate
STATE.settings.exchangeRates.shopee.rate=99;
line = productPriceLine(STATE.videos[0].products, "shopee");
ok("shopee rate hard-locked to 1 (still NT$15,000)", line.includes("NT$15,000"));
STATE.settings.exchangeRates.shopee.rate=1;

// modal 整合
let modalHTML="";
global.document.getElementById = (id)=>{ const e=el(); if(id==="modalRoot"){ Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}}); } return e; };
localStorage.setItem("ecdr_user","小葵");
openChModal("shopee","V1");
ok("shopee modal uses mult (NT$15,000)", modalHTML.includes("NT$15,000"));
localStorage.setItem("ecdr_user","Anna");
openIntlModal("V2");
ok("intl modal uses mult ($376)", modalHTML.includes("$376"));

// 設定頁：每列 匯率+加乘、蝦皮只有加乘
localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
const sh=viewSettings();
ok("settings has rate+mult inputs for en", sh.includes('id="set_rate_en"') && sh.includes('id="set_mult_en"'));
ok("settings shopee row: mult only, no rate input", sh.includes('id="set_mult_shopee"') && !sh.includes('id="set_rate_shopee"'));
ok("settings prefills today's rate 0.0313", sh.includes('value="0.0313"'));

// saveSettings 解析
const fieldMap={ set_daily:"4",set_horizon:"30",set_plat:"",set_shop:"",set_pw:"",set_intlacct:"",set_intltarget:"2",
  set_rate_en:"0.0313",set_mult_en:"1.2",set_rate_th:"1.038",set_mult_th:"1",set_rate_ms:"0.1275",set_mult_ms:"2",set_mult_shopee:"1.5",
  set_shpacct:"",set_shptarget:"2" };
global.document.getElementById=(id)=>{ const e=el(); if(id in fieldMap) e.value=fieldMap[id]; return e; };
let captured=null; global.window.DB={ setSettings:async(p)=>{captured=p;} };
saveSettings().then(()=>{
  ok("saveSettings: en rate+mult", captured.exchangeRates.en.rate===0.0313 && captured.exchangeRates.en.mult===1.2);
  ok("saveSettings: shopee rate forced 1, mult 1.5", captured.exchangeRates.shopee.rate===1 && captured.exchangeRates.shopee.mult===1.5);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
});
