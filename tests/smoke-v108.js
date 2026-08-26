// v108：兩件事
//  ① 還沒拍的判斷只看「毛片雲端連結」——只填片名就排日期的，以前會被當成待剪片
//  ② 影片庫搜尋時，分段數字與標籤數字要跟著動（才找得到那支片在哪一頁）
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), nodes={}, missing=new Set();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(nodes[id]) return nodes[id];
    if(missing.has(id)) return null;
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=()=>{};

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",rawLink:"",cover:"",
  stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,publishTime:"",finishedAt:"",
  publishedLink:"",driveFolder:"",productUrl:"",note:"",mainType:"",source:"老闆自拍",refLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos){
  nodes={}; missing=new Set();
  STATE={ users:[{name:"小葵",role:"editor",craft:"both"},{name:"Regina",role:"manager"},
                 {name:"Anna",role:"intl"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉","珠寶介紹","生活分享"],sources:["老闆自拍"],postPlatforms:[],
      intlAccounts:[],shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  CUR_TAB="videos"; VIEW_AS=null; VID_LANG=""; VID_VIEW="script"; VID_Q=""; VID_TAGS=new Set(); VID_MODE="list";
  POOL_FILTER="all"; POOL_Q=""; WORK_ZONE="shopee";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
  localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
// 某個分頁鈕上的數字
const tabN=(h,label)=>{ const seg=h.split(">"+label+"</span>")[1]||""; const m=seg.match(/vtab-n">(\d+)</); return m?+m[1]:null; };
// 清單裡列出了哪幾支
const listed=(h,ids)=>ids.filter(id=>((h.split('id="vid_list"')[1])||"").includes("'"+id+"'"));
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }
// 落在「未拍」的兩段之一
const notShotSeg=(v)=>String(vidSegment(v)).startsWith("script");

// ══════════ ① 沒有毛片連結＝還沒拍 ══════════
reset();
ok("只填片名 → 未拍・未排程", vidSegment(v_("A"))==="scriptNoSched");
ok("只填片名又排了日期 → 未拍・已排程（就是使用者遇到的那支）",
   vidSegment(v_("B",{scheduledDate:D(4)}))==="scriptSched");
ok("有文案沒毛片 → 未拍・未排程", vidSegment(v_("C",{videoCopy:"口播台詞"}))==="scriptNoSched");
ok("毛片連結只有空白 → 未拍・未排程", vidSegment(v_("D",{rawLink:"   "}))==="scriptNoSched");
ok("有毛片連結 → 待剪・未排程", vidSegment(v_("E",{rawLink:"http://raw"}))==="rawNoSched");
ok("有毛片又排了日期 → 待剪・已排程", vidSegment(v_("F",{rawLink:"http://raw",scheduledDate:D(4)}))==="rawSched");
ok("剪完的不受影響", !notShotSeg(v_("G",{stage:"已完成",finishedAt:D(-1)+"T05:00:00",publishedLink:"http://p"})));
ok("舊片不受影響", vidSegment(v_("H",{tags:["舊片"]}))==="old");

// 二創殼本來就沒有毛片連結（素材來自源片），不能被一起判成沒拍
ok("蝦皮殼不算未拍", !notShotSeg(v_("P1",{channel:"shopee",sourceVideoId:"S1"})));
ok("馬來殼不算未拍", !notShotSeg(v_("M1",{channel:"ms",sourceVideoId:"S1"})));
ok("英文殼不算未拍", !notShotSeg(v_("E1",{locale:"en",sourceVideoId:"S1"})));
ok("泰文殼不算未拍", !notShotSeg(v_("T1",{locale:"th",sourceVideoId:"S1"})));

// 待認領：沒拍的不進去，二創殼照進
reset([v_("A"), v_("B",{scheduledDate:D(4)}), v_("E",{rawLink:"http://raw"}),
       v_("P1",{channel:"shopee",sourceVideoId:"E",account:"蝦皮A"})]);
as("小葵","editor");
{ const w=viewWork();
  ok("沒毛片的不進待認領", !w.includes("claimVid('A')") && !w.includes("claimVid('B')"));
  ok("有毛片的照樣可認領", w.includes("claimVid('E')"));
  ok("二創殼照樣可認領", w.includes("claimVid('P1')")); }

// 使用者那支片的完整情境：編號 260807、只填片名、排了 8/7
reset([v_("X",{code:"260807",name:"(未拍)農曆七月茶晶避邪擋煞的串珠",
               rawName:"(未拍)農曆七月茶晶避邪擋煞的串珠",scheduledDate:D(4)})]);
as("管理員","boss");
{ VID_VIEW="raw";
  ok("待剪・已排程那頁不再列到它", listed(viewVideos(),["X"]).length===0);
  VID_VIEW="script";
  ok("未拍那頁列得到它", listed(viewVideos(),["X"]).length===1);
  VID_UNSCHED=true;
  ok("開「只看還沒排的」就不列它（它排過了）", listed(viewVideos(),["X"]).length===0);
  VID_UNSCHED=false; }

// ══════════ ② 分頁名稱 ══════════
reset([v_("A"), v_("E",{rawLink:"http://raw"})]);
as("管理員","boss");
{ const h=viewVideos();
  ok("有「未拍」分頁", h.includes("<span>未拍</span>"));
  ok("不再寫「有文案」（沒文案的也會進來）", !h.includes("有文案・未拍片"));
  ok("四個分頁都在", ["未拍","待剪","剪完","舊片"].every(x=>h.includes("<span>"+x+"</span>"))); }
reset([v_("A")]); as("Anna","intl");
{ const h=viewVideos();
// v146：海外的影片庫跟台灣同一份（只是介面英文）
  ok("海外看到的是英文", h.includes("Library A")
     && ["Not shot","To edit","Done","Old"].every(x=>h.includes("<span>"+x+"</span>")));
  ok("海外沒有中文洩漏", !h.includes("未拍")); }

// ══════════ ③ 搜尋時分段數字要跟著動 ══════════
const LIB=[
  v_("S1",{name:"農曆七月串珠",tags:["寵粉"]}),                                  // 未拍片
  v_("S2",{name:"其他沒拍的",tags:["生活分享"]}),                                 // 未拍片
  v_("R1",{name:"農曆七月毛片",rawLink:"http://raw",tags:["珠寶介紹"]}),           // 待剪・未排程
  v_("R2",{name:"無關的毛片",rawLink:"http://raw"}),                              // 待剪・未排程
  v_("R3",{name:"農曆七月已排",rawLink:"http://raw",scheduledDate:D(4)}),         // 待剪・已排程
  v_("O1",{name:"農曆七月舊片",rawLink:"http://raw",tags:["舊片"]}),              // 舊片
];
reset(LIB); as("管理員","boss");
{ const h=viewVideos();
  ok("沒搜尋時：未拍 2", tabN(h,"未拍")===2);
  ok("沒搜尋時：待剪 3", tabN(h,"待剪")===3);
  ok("沒搜尋時：舊片 1", tabN(h,"舊片")===1); }
reset(LIB); as("管理員","boss"); VID_Q="農曆七月";
{ const h=viewVideos();
  ok("搜尋後：未拍剩 1", tabN(h,"未拍")===1);
  ok("搜尋後：待剪剩 2", tabN(h,"待剪")===2);
  ok("搜尋後：舊片剩 1", tabN(h,"舊片")===1);
  ok("搜尋後：剪完是 0", tabN(h,"剪完")===0); }
reset(LIB); as("管理員","boss"); VID_Q="完全沒有這種片";
{ const h=viewVideos();
  ok("搜不到時每一頁都是 0", ["未拍","待剪","剪完","舊片"].every(x=>tabN(h,x)===0)); }

// 標籤數字也要跟著搜尋走
reset(LIB); as("管理員","boss"); VID_VIEW="script";
{ const tags=(viewVideos().split("標籤")[1]||"").split('id="vid_list"')[0];
  ok("沒搜尋時未拍頁有兩種標籤", tags.includes("寵粉") && tags.includes("生活分享")); }
reset(LIB); as("管理員","boss"); VID_VIEW="script"; VID_Q="農曆七月";
{ const tags=(viewVideos().split("標籤")[1]||"").split('id="vid_list"')[0];
  ok("搜尋後標籤只剩符合的那一種", tags.includes("寵粉") && !tags.includes("生活分享")); }

// ══════════ ④ 打字時就地更新，不整頁重繪 ══════════
reset(LIB); as("管理員","boss");
{ let rendered=false; const _r=render; render=()=>{rendered=true;};
  const list={innerHTML:"__old__"}, tabs={innerHTML:"__old__"}, tagsEl={innerHTML:"__old__"};
  nodes={vid_list:list, vid_tabs:tabs, vid_tags:tagsEl};
  VID_Q="農曆七月"; vidFilter();
  ok("打字不會觸發整頁重繪", !rendered);
  ok("清單就地換掉", list.innerHTML!=="__old__");
  ok("分段數字就地換掉", tabs.innerHTML!=="__old__" && tabs.innerHTML.includes("vtab-n"));
  ok("分段數字反映搜尋結果", tabN(tabs.innerHTML,"未拍")===1);
  ok("標籤數字就地換掉", tagsEl.innerHTML!=="__old__");
  render=_r; }
reset(LIB); as("管理員","boss");
{ let rendered=false; const _r=render; render=()=>{rendered=true;};
  missing.add("vid_list");
  vidFilter();
  ok("找不到清單節點時退回整頁重繪", rendered);
  render=_r; }

// ══════════ ⑤ 搜尋框仍然是邊打邊篩 ══════════
reset(LIB); as("管理員","boss");
{ const h=viewVideos();
  ok("搜尋框用 oninput", /id="vid_q"[^>]*oninput="VID_Q=this\.value;vidFilter\(\)"/.test(h));
  ok("分頁列有 id 才換得動", h.includes('id="vid_tabs"'));
  ok("標籤列有 id 才換得動", h.includes('id="vid_tags"'));
  ok("清單有 id", h.includes('id="vid_list"')); }

// 搜尋＋標籤一起用
reset(LIB); as("管理員","boss"); VID_VIEW="script"; VID_Q="農曆七月"; VID_TAGS=new Set(["寵粉"]);
ok("搜尋＋標籤一起生效", JSON.stringify(listed(viewVideos(),["S1","S2"]))===JSON.stringify(["S1"]));

// ══════════ ⑥ render 不炸 ══════════
reset(LIB);
[["管理員","boss"],["Regina","manager"],["小葵","editor"],["Anna","intl"]].forEach(([u,r])=>{
  ["script","raw","done","old"].forEach(view=>{
    as(u,r); CUR_TAB="videos"; VID_VIEW=view; VID_Q="";
    try{ render(); ok(`[${r}] ${view}`, true); }catch(e){ ok(`[${r}] ${view} → ${e.message}`, false); } }); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
