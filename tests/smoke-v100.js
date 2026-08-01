// v100：點日期的影片選單改成可以「選分類」——
//   全部／還沒剪好的毛片／已剪好的新片／舊片（互斥、加起來等於全部）
//   「只看還沒排的」改成預設關閉，只是一個附加的開關，不再是唯一的篩選方式
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,rows:0,
  classList:{_s:new Set(),toggle(){},add(c){this._s.add(c);},remove(c){this._s.delete(c);},contains(c){return this._s.has(c);}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},dispatchEvent(){},
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, nodes={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(nodes[id]) return nodes[id];
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
let calls=[], toasts=[];
eval(src);
// 這兩個要在 reset() 之前抓：reset() 會把它們設成測試要的值，那樣就驗不到真正的預設了
const DEFAULT_UNSCHED=OD_UNSCHED, DEFAULT_CAT=OD_CAT;
toast=(m,e)=>{ toasts.push(String(m)); };

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==';
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",rawLink:"http://d",cover:"",
  stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,publishTime:"",finishedAt:"",publishedLink:"",
  driveFolder:"",productUrl:"",note:"",mainType:"",source:"老闆自拍",refLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos){
  calls=[]; toasts=[]; fields={}; nodes={}; modalHTML="";
  OD_Q=""; OD_UNSCHED=false; OD_CAT="all"; OD_DS="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Anna",role:"intl",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Regina",role:"manager",pwHash:H},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, logs:[], deletedVideos:[], shifts:{}, tasks:{}, videos:(videos||[]).slice() };
  CUR_TAB=null; VIEW_AS=null; CAL_PLAT="tw"; CAL_YM=null;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, arrayAdd:async()=>{}, arrayDel:async()=>{}, bump:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const TOM=D(1);
// 一份涵蓋三類的資料
const LIB=[
  v_("R1",{stage:"待處理"}),                                                        // 毛片
  v_("R2",{stage:"剪輯中"}),                                                        // 毛片（剪到一半）
  v_("R3",{stage:"待處理",scheduledDate:D(4)}),                                     // 毛片，但已經排在未來
  v_("D1",{stage:"已完成",finishedAt:D(-1)+"T05:00:00"}),                           // 已剪好、還沒排
  v_("D2",{stage:"已完成",finishedAt:D(-1)+"T05:00:00",scheduledDate:D(5)}),        // 已剪好、排在未來 → 還沒播
  v_("O1",{stage:"已完成",finishedAt:D(-20)+"T05:00:00",scheduledDate:D(-9)}),      // 舊片（播過了）
  v_("O2",{stage:"已上片",finishedAt:D(-30)+"T05:00:00",scheduledDate:D(-15)}),     // 舊片
];
const listed=(h,ids)=>ids.filter(id=>h.includes(`value="${id}"`));
// 分類鈕上的數字
const catN=(h,label)=>{ const seg=h.split("<span>"+label+"</span>")[1]||""; const m=seg.match(/vtab-n">(\d+)</); return m?+m[1]:null; };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ 三類怎麼分 ══
reset();
ok("待處理 → 還沒剪好的毛片", odCat(v_("A",{stage:"待處理"}))==="raw");
ok("剪輯中 → 還沒剪好的毛片", odCat(v_("A",{stage:"剪輯中"}))==="raw");
ok("已完成、上片日還沒到 → 已剪好的新片",
   odCat(v_("A",{stage:"已完成",finishedAt:D(-1)+"T05:00:00",scheduledDate:D(5)}))==="done");
ok("已完成、還沒排日期 → 也算已剪好的新片",
   odCat(v_("A",{stage:"已完成",finishedAt:D(-1)+"T05:00:00"}))==="done");
ok("上片日過了 → 舊片",
   odCat(v_("A",{stage:"已完成",finishedAt:D(-20)+"T05:00:00",scheduledDate:D(-9)}))==="old");
ok("手動標「舊片」標籤的也算舊片", odCat(v_("A",{stage:"待處理",tags:["舊片"]}))==="old");
ok("三類互斥、涵蓋全部（每支剛好落在一類）",
   LIB.every(v=>["raw","done","old"].filter(k=>odCat(v)===k).length===1));

// ══ 分類鈕 ══
reset(LIB); as("Regina","manager"); OD_DS=TOM;
{ const h=odCatTabs(TOM);
  ok("四個鈕都在（全部＋三類）",
     ["全部","還沒剪好的毛片","已剪好的新片","舊片"].every(x=>h.includes("<span>"+x+"</span>")));
  ok("全部＝7 支", catN(h,"全部")===7);
  ok("還沒剪好的毛片＝3 支", catN(h,"還沒剪好的毛片")===3);
  ok("已剪好的新片＝2 支", catN(h,"已剪好的新片")===2);
  ok("舊片＝2 支", catN(h,"舊片")===2);
  ok("三類加起來剛好等於全部",
     catN(h,"還沒剪好的毛片")+catN(h,"已剪好的新片")+catN(h,"舊片")===catN(h,"全部"));
  ok("預設是「全部」亮著", /class="vtab on"[^>]*onclick="odSetCat\('all'\)/.test(h));
  ok("每個都點得動", ["all","raw","done","old"].every(k=>h.includes(`odSetCat('${k}')`))); }

// ══ 選了分類就只列那一類 ══
reset(LIB); as("Regina","manager"); OD_DS=TOM;
ok("預設全部都列出來", listed(odSelectHTML(TOM),["R1","R2","R3","D1","D2","O1","O2"]).length===7);
OD_CAT="raw";
ok("只看毛片", JSON.stringify(listed(odSelectHTML(TOM),["R1","R2","R3","D1","D2","O1","O2"]))===JSON.stringify(["R1","R2","R3"]));
OD_CAT="done";
ok("只看已剪好的新片", JSON.stringify(listed(odSelectHTML(TOM),["R1","R2","R3","D1","D2","O1","O2"]))===JSON.stringify(["D1","D2"]));
OD_CAT="old";
ok("只看舊片", JSON.stringify(listed(odSelectHTML(TOM),["R1","R2","R3","D1","D2","O1","O2"]))===JSON.stringify(["O1","O2"]));
OD_CAT="all";
ok("切回全部", listed(odSelectHTML(TOM),["R1","R2","R3","D1","D2","O1","O2"]).length===7);
reset(LIB); as("Regina","manager"); OD_DS=TOM;
odSetCat("done");
ok("odSetCat 換得動", OD_CAT==="done");
odSetCat("亂打");
ok("亂傳參數就回到全部，不會卡在空清單", OD_CAT==="all");
reset([v_("R1",{stage:"待處理"})]); as("Regina","manager"); OD_DS=TOM; OD_CAT="old";
ok("某一類沒有影片時會講一聲，不是空白", odSelectHTML(TOM).includes("沒有符合的影片"));

// ══ 「只看還沒排的」：預設關閉，只是附加開關 ══
ok("「只看還沒排的」預設是關的（開著的話等於逼人只能看一種）", DEFAULT_UNSCHED===false);
ok("分類預設是「全部」", DEFAULT_CAT==="all");
reset(LIB); as("Regina","manager"); OD_DS=TOM;
ok("關著的時候，已經排在未來的照樣看得到", listed(odSelectHTML(TOM),["R3","D2"]).length===2);
OD_UNSCHED=true;
ok("打開才會濾掉已排在未來的", !odSelectHTML(TOM).includes('value="R3"') && !odSelectHTML(TOM).includes('value="D2"'));
ok("打開時舊片照樣在（它的排程日在過去，要能重播）", listed(odSelectHTML(TOM),["O1","O2"]).length===2);
{ const h=odCatTabs(TOM);
  ok("分類鈕的數字會跟著這個開關變（毛片剩 2）", catN(h,"還沒剪好的毛片")===2);
  ok("已剪好的新片剩 1", catN(h,"已剪好的新片")===1);
  ok("全部剩 5", catN(h,"全部")===5); }
// 而且要真的重畫到畫面上：勾了開關之後那一排數字必須跟著換，不能只有清單變
reset(LIB); as("Regina","manager"); OD_DS=TOM;
nodes.od_cats=el(); nodes.od_list=el(); nodes.od_hint=el();
OD_UNSCHED=false; odFilter();
ok("odFilter 會把分類那一排重畫出來", catN(nodes.od_cats.innerHTML,"全部")===7);
OD_UNSCHED=true; odFilter();
ok("勾了「只看還沒排的」，畫面上的分類數字跟著變", catN(nodes.od_cats.innerHTML,"全部")===5);

// ══ 分類與搜尋可以疊在一起 ══
reset([v_("R1",{stage:"待處理",name:"翡翠開箱"}), v_("R2",{stage:"待處理",name:"珠寶保養"}),
       v_("D1",{stage:"已完成",finishedAt:D(-1)+"T05:00:00",name:"翡翠回顧"})]);
as("Regina","manager"); OD_DS=TOM; OD_CAT="raw"; OD_Q="翡翠";
ok("分類＋搜尋一起生效", JSON.stringify(listed(odSelectHTML(TOM),["R1","R2","D1"]))===JSON.stringify(["R1"]));

// ══ 當天已排過的照樣不列（不受分類影響）══
reset([v_("A",{stage:"待處理",scheduledDate:TOM}), v_("B",{stage:"待處理"})]);
as("Regina","manager"); OD_DS=TOM; OD_CAT="raw";
ok("當天已排過的不會又冒出來", !odSelectHTML(TOM).includes('value="A"') && odSelectHTML(TOM).includes('value="B"'));

// ══ 點日視窗整體 ══
reset(LIB); as("Regina","manager");
openDay(TOM);
{ const m=modalHTML;
  ok("點日視窗裡有分類那一排", m.includes('id="od_cats"') && m.includes("odSetCat("));
  ok("分類排在搜尋框下面、選單上面",
     m.indexOf('id="od_q"') < m.indexOf('id="od_cats"') && m.indexOf('id="od_cats"') < m.indexOf('id="od_list"'));
  ok("「只看還沒排的」還在，但沒有預設勾起來",
     m.includes('id="od_uns"') && !/id="od_uns" checked/.test(m)); }

// ══ 海外剪輯看到英文 ══
reset(LIB); as("Anna","intl"); OD_DS=TOM;
{ const h=odCatTabs(TOM);
  ok("海外的分類是英文", ["All","Raw · not cut","New · cut","Old"].every(x=>h.includes("<span>"+x+"</span>")));
  ok("海外沒有中文分類名洩漏", !h.includes("還沒剪好的毛片") && !h.includes("已剪好的新片")); }

// ══ render 不炸 ══
[["Regina","manager"],["管理員","boss"],["Anna","intl"],["小葵","editor"]].forEach(([u,r])=>{
  ["all","raw","done","old"].forEach(k=>{
    reset(LIB); as(u,r); CUR_TAB="cal"; OD_CAT=k;
    try{ render(); openDay(TOM); ok(`[${r}] 點日視窗 ${k}`, true); }
    catch(e){ ok(`[${r}] ${k} → ${e.message}`, false); } }); });
reset([]); as("Regina","manager");
try{ openDay(TOM); ok("一支影片都沒有時分類也畫得出來", modalHTML.includes('id="od_cats"')); }
catch(e){ ok("空資料 → "+e.message, false); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
