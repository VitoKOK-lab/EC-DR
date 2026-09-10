// v193：手機上的月排程清單，片名一行就好
//
// 老闆：「在手機版面，名字留一排就好了，要畫面精簡然後讓我看得到還沒剪好，
//         還沒有審查或者是缺影片這些才是重點」
//
// 正式資料實測（390px、九月 98 支）：
//   改之前 整頁 9,697px（11.5 個螢幕）、平均每列 95px、最高一列 601px、
//          一行就結束的只有 6 列
//   改之後 整頁 4,161px（4.9 個螢幕）、平均每列 39px、最高一列 85px、
//          一行就結束的有 84 列
// 真正要看的「還沒剪好／還沒審／缺商品」本來被埋在三到五行文案後面。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,open:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;}, addEventListener(){},createElement:()=>el(),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:390,innerHeight:844,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const T0=FROZEN;
const D=(n)=>new Date(new Date(T0+"T12:00:00Z").getTime()+n*864e5).toISOString().slice(0,10);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }
const LONG="慈禧太后最愛的2種寶石有什麼魔力？限量寵粉市價1折拿下，錯過就要再等一年了喔喔喔";
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"文案",
  rawLink:"https://drive.google.com/drive/folders/RAW",cover:"",stage:"已完成",editor:"小葵",claimedBy:"小葵",
  assignedTo:"",scheduledDate:T0,publishTime:"15:00",finishedAt:T0+"T10:00:00",publishedLink:"",
  driveFolder:"https://drive.google.com/drive/folders/FAM",productUrl:"",note:"",mainType:"",source:"官方IP",
  refLink:"",reviewStatus:"通過",locale:"",channel:"",origLang:"",account:"",tags:[],products:[],
  usageHistory:[],metrics:[]},o||{});
function reset(vids){
  VIEW_AS=null; BRAND=""; CAL_YM=null; CAL_PLAT="tw"; CAL_MODE="list";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}),
    loadShiftMonth:async()=>{} };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:vids||[] };
  LAST_RAW=raw; STATE=decorate(raw);
  localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
}
// 抓某一支片那一格 <td> 的內容
const cellOf=(h,name)=>{ const i=h.indexOf(name); if(i<0) return "";
  const s=h.lastIndexOf("<td>",i); return h.slice(s, h.indexOf("</td>",s)+5); };

// ══════════ ① 片名包了一層，手機才切得成一行 ══════════
{ reset([ v_("A",{name:LONG}) ]);
  const h=viewCal();
  ok("（前提）列得出這一支", h.includes(LONG.slice(0,12)));
  const td=cellOf(h,LONG.slice(0,12));
  ok("**片名包在 .cl-t 裡**", /<span class="cl-t">/.test(td), td.slice(0,120));
  ok("**點得開看全文**（切成一行不是把資料藏掉）", /onclick="[^"]*"/.test(td));
  ok("完整片名還是在 HTML 裡（不是被截斷才送出去）", td.includes(LONG)); }

// ══════════ ② 警示標籤在 .cl-t 外面 —— 才會掉到自己一行 ══════════
// 包在裡面的話會跟著被 nowrap 切掉，那就等於看不到了，正好跟老闆要的相反。
{ reset([ v_("A",{name:LONG,reviewStatus:"",scheduledDate:D(1)}) ]);
  const h=viewCal();
  const td=cellOf(h,LONG.slice(0,12));
  const close=td.indexOf("</span>");
  ok("**「還沒審」在 .cl-t 收掉之後才出現**", td.indexOf("還沒審")>close,
     {cl_t結束:close, 還沒審:td.indexOf("還沒審")});
  ok("（前提）真的有這個標籤", td.includes("還沒審")); }
{ reset([ v_("B",{name:LONG,tags:["寵粉"]}) ]);
  const td=cellOf(viewCal(),LONG.slice(0,12));
  const close=td.indexOf("</span>");
  ok("**「缺商品」也在外面**", td.indexOf("缺商品")>close, {cl_t結束:close, 缺商品:td.indexOf("缺商品")}); }

// ══════════ ③ CSS：只切手機，桌機不動 ══════════
// ⚠️ 抓媒體查詢區塊要用大括號配對，不能用正規式硬切 —— CSS 裡面還有巢狀的
//    大括號，正規式會在第一個 } 就斷掉，抓到半截，然後「桌機有沒有這條」就驗錯了。
function mediaBlocks(css, cond){
  const out=[]; let i=0;
  while((i=css.indexOf(cond, i))>=0){
    let j=css.indexOf("{", i); if(j<0) break;
    let depth=0, k=j;
    for(; k<css.length; k++){ if(css[k]==="{") depth++; else if(css[k]==="}"){ depth--; if(!depth) break; } }
    out.push(css.slice(j, k+1)); i=k+1;
  }
  return out;
}
{ const mob=mediaBlocks(HTML, "@media(max-width:600px)").join("");
  const rest=HTML.split("").length && (function(){ let r=HTML; mediaBlocks(HTML,"@media(max-width:600px)").forEach(b=>{ r=r.replace(b,""); }); return r; })();
  ok("**手機上片名一行（nowrap ＋ 省略號）**",
     /table\.callist td \.cl-t\{[^}]*white-space:nowrap/.test(mob)
     && /table\.callist td \.cl-t\{[^}]*text-overflow:ellipsis/.test(mob),
     (mob.match(/table\.callist td \.cl-t\{[^}]*\}/)||[])[0]);
  ok("**要 display:block 標籤才會掉到下一行**",
     /table\.callist td \.cl-t\{[^}]*display:block/.test(mob));
  ok("（前提）真的抓到手機那一段", mob.includes("table.callist td .cl-t"), mob.length);
  ok("**桌機不切**（那邊寬度夠，切了反而看不出是哪一支）",
     !/\.cl-t\{[^}]*nowrap/.test(rest), (rest.match(/\.cl-t\{[^}]*\}/g)||[])); }

// ══════════ ④ 沒有把 v187 的整列警示弄壞 ══════════
{ reset([ v_("A",{name:"還沒審的片",reviewStatus:"",scheduledDate:D(1)}) ]);
  const h=viewCal();
  ok("整列還是會標色", /class="[^"]*cl-warn/.test(h), h.slice(h.indexOf("還沒審的片")-300,h.indexOf("還沒審的片")));
  reset([ v_("C",{name:"過期沒剪的片",stage:"剪輯中",finishedAt:"",reviewStatus:"",scheduledDate:D(-2)}) ]);
  ok("過期的還是紅的", /cl-warn late/.test(viewCal())); }

// ══════════ ⑤ 沒有把別的檢視弄壞 ══════════
{ reset([ v_("A",{name:LONG}) ]);
  CAL_MODE="grid"; CAL_YM=null;
  let bad=null; try{ viewCal(); }catch(e){ bad=e.message; }
  ok("月曆檢視照樣畫得出來", !bad, bad);
  CAL_MODE="list"; }
{ reset([ v_("A",{name:LONG}) ]);
  openDay(T0);
  ok("點開某一天的視窗不受影響（那裡本來就沒有 .cl-t）",
     modalHTML.includes(LONG.slice(0,12)) && !modalHTML.includes('class="cl-t"')); }

console.log(`\nv193（手機上片名一行）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
