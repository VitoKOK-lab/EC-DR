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

STATE = { users:[{name:"小葵",role:"editor"}], settings:{exchangeRates:{en:{code:"USD",rate:0.032},th:{code:"THB",rate:1.15},ms:{code:"MYR",rate:0.14}}}, schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// --- productRows / collectProducts ---
const rowsHtml = productRows("e", [{name:"玉鐲",price:1000,salePrice:800}]);
ok("productRows shows 原價 placeholder", rowsHtml.includes('placeholder="原價"'));
ok("productRows shows 售價(寵粉價) placeholder", rowsHtml.includes('placeholder="售價(寵粉價)"'));
ok("productRows has separate salePrice input id", rowsHtml.includes('id="e_ps0"'));
ok("productRows prefills origPrice value", rowsHtml.includes('value="1000"'));
ok("productRows prefills salePrice value", rowsHtml.includes('value="800"'));

global.document.getElementById = (id)=>{ const map={e_pn0:"玉鐲",e_pp0:"1000",e_ps0:"800",e_pn1:"",e_pp1:"",e_ps1:"",e_pn2:"",e_pp2:"",e_ps2:"",e_pn3:"",e_pp3:"",e_ps3:""};
  const e=el(); if(id in map) e.value=map[id]; return e; };
const collected = collectProducts("e");
ok("collectProducts returns origPrice+salePrice", collected.length===1 && collected[0].price===1000 && collected[0].salePrice===800);

// --- currency conversion ---
ok("exchangeRateOf returns configured rate", exchangeRateOf("en")===0.032);
ok("currencyCodeOf returns code", currencyCodeOf("th")==="THB");

STATE.settings.exchangeRates = {};
ok("exchangeRateOf defaults to 1 when totally unset", exchangeRateOf("en")===1);
ok("currencyCodeOf falls back to DEFAULT_CURRENCY when unset", currencyCodeOf("en")==="USD");

const products=[{name:"玉鐲",price:1000,salePrice:800},{name:"耳環",price:500}];
let line = productPriceLine(products, "");
ok("productPriceLine TWD (shopee) shows NT$ no conversion", line.includes("NT$1,000") && line.includes("NT$500"));
ok("productPriceLine shows 寵粉價 highlight when salePrice set", line.includes("寵粉價 NT$800"));

STATE.settings.exchangeRates = {en:{code:"USD",rate:0.032}};
line = productPriceLine(products, "en");
ok("productPriceLine converts to USD with configured rate", line.includes("$32") && line.includes("Fan price $26"));

ok("productPriceLine handles empty products", productPriceLine([], "en").includes("—"));

// --- openIntlModal / openChModal read live source, not frozen copy ---
STATE.videos = [
  {id:"S1", name:"翡翠玉鐲", rawName:"翡翠玉鐲", stage:"已完成", locale:"", channel:"", products:[{name:"玉鐲",price:2000,salePrice:1500}], usageHistory:[], tags:[], metrics:[]},
  {id:"V1", name:"", stage:"待處理", locale:"en", sourceVideoId:"S1", account:"TikTok US", products:[{name:"玉鐲",price:999,salePrice:999}], usageHistory:[], tags:[], metrics:[]},
];
let modalHTML="";
global.document.getElementById = (id)=>{ const e=el(); if(id==="modalRoot"){ Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}}); } return e; };
STATE.settings.exchangeRates = {};
openIntlModal("V1");
ok("openIntlModal shows LIVE source price (2000), not stale frozen copy (999)", modalHTML.includes("2,000") && !modalHTML.includes("999"));

STATE.videos.push({id:"V2", name:"", stage:"待處理", channel:"shopee", sourceVideoId:"S1", account:"蝦皮店A", products:[{name:"玉鐲",price:999,salePrice:999}], usageHistory:[], tags:[], metrics:[]});
openChModal("shopee","V2");
ok("openChModal(shopee) shows LIVE source price (2000) in TWD, not stale copy", modalHTML.includes("NT$2,000") && !modalHTML.includes("999"));

const settingsHtml = viewSettings();
ok("settings shows exchange rate inputs", settingsHtml.includes('id="set_rate_en"') && settingsHtml.includes('id="set_rate_th"') && settingsHtml.includes('id="set_rate_ms"'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
