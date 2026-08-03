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
let confirmMsgs=[]; global.confirm=(m)=>{ confirmMsgs.push(m); return true; };
eval(src);

const T0 = new Date(Date.now()+288e5).toISOString().slice(0,10);
STATE = { users:[{name:"Anna",role:"intl"},{name:"小葵",role:"editor"}],
  settings:{ intlAccounts:[{locale:"en",name:"tiktok-EN"},{locale:"th",name:"tiktok-TH"}], shopeeAccounts:["蝦皮店A"], exchangeRates:{} },
  schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[],
  videos:[
    {id:"S1",name:"黃金一週跌12% #黃金",rawName:"黃金一週跌12%",nameEn:"Gold dropped 12% in a week #gold",stage:"已上片",locale:"",channel:"",scheduledDate:"2026-01-01",published:true,editor:"小葵",products:[],usageHistory:[],tags:[],metrics:[]},
    {id:"V1",name:"",stage:"剪輯中",locale:"en",sourceVideoId:"S1",account:"tiktok-EN",claimedBy:"Anna",editor:"Anna",scheduledDate:T0,publishedLink:"",products:[],usageHistory:[],tags:[],metrics:[]},
    {id:"V2",name:"",stage:"剪輯中",locale:"th",sourceVideoId:"S1",account:"tiktok-TH",claimedBy:"Anna",editor:"Anna",products:[],usageHistory:[],tags:[],metrics:[]},
    {id:"V3",name:"",stage:"剪輯中",channel:"shopee",sourceVideoId:"S1",account:"蝦皮店A",claimedBy:"小葵",editor:"小葵",publishedLink:"",products:[],usageHistory:[],tags:[],metrics:[]},
  ] };

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// 1) 完成不再被上傳連結擋下
let calls=[];
global.window.DB={ set:async(c,id,o)=>{calls.push([c,id,o]);}, update:async(c,id,p)=>{calls.push([c,id,p]);}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
localStorage.setItem("ecdr_user","Anna");
(async()=>{
  intlFinish("V1");
  await new Promise(r=>setTimeout(r,250));
  ok("intlFinish works WITHOUT upload URL", calls.some(c=>c[1]==="V1" && c[2].stage==="已完成"));
  ok("intl confirm mentions In review flow", confirmMsgs.some(m=>m.includes("In review")));

  calls=[]; confirmMsgs=[];
  localStorage.setItem("ecdr_user","小葵");
  chFinish("shopee","V3");
  await new Promise(r=>setTimeout(r,250));
  ok("chFinish(shopee) works WITHOUT upload URL", calls.some(c=>c[1]==="V3" && c[2].stage==="已完成"));
  ok("shopee confirm mentions 進入待審核", confirmMsgs.some(m=>m.includes("待審核")));

  // 2) 英文版建立時帶入 nameEn（去 #）
  calls=[];
  localStorage.setItem("ecdr_user","Anna");
  createLocalVersion("S1","en","tiktok-EN-2");
  await new Promise(r=>setTimeout(r,250));
  const created=calls.find(c=>c[0]==="videos" || (c[2]&&c[2].locale==="en"));
  // createLocalVersion uses write POST → DB.set
  ok("EN version created with English draft name (hashtags stripped)", JSON.stringify(calls).includes("Gold dropped 12% in a week") && !JSON.stringify(calls).includes("#gold"));

  calls=[];
  vid("S1").driveFolder="http://drive/S1";
  createLocalVersion("S1","th","tiktok-TH-2");
  await new Promise(r=>setTimeout(r,250));
  const thRec=calls.map(c=>c[2]).find(o=>o&&o.locale==="th");
  // v115：建立版本一律帶語言後綴（海外的底稿用源片英文名，剪輯再用 文A 翻成泰文）
  ok("TH version gets a Thai-version suffix", thRec && thRec.name==="Gold dropped 12% in a week (Thai version)");
  ok("TH version inherits the source folder", thRec && thRec.driveFolder===vid("S1").driveFolder);

  // 3) modal 預填：已存在但沒名字的英文版，Title 預填英文名
  localStorage.setItem("ecdr_user","Anna");
  STATE.videos[1].stage="剪輯中"; STATE.videos[1].name="";
  openIntlModal("V1");
  ok("intl modal prefills English title for empty EN version", modalHTML.includes('value="Gold dropped 12% in a week"'));
  openIntlModal("V2");
  ok("TH modal does NOT prefill English title", !modalHTML.includes('value="Gold dropped 12% in a week"'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
