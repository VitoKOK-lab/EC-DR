// v99：排程與剪輯脫鉤 ——
//   ① 月曆一律算「排到這天的影片」，不管剪完了沒（之前卡 stage，排了也看不到）
//   ② 點日期的選單開放所有影片，加搜尋與「只看還沒排的」
//   ③ 影片編輯的日期欄下面加一排 14 天速覽（哪天排了幾支），點一下帶入
const fs=require("fs"), path=require("path");
const css=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
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
toast=(m,e)=>{ toasts.push(String(m)); };

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==';
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",rawLink:"http://d",cover:"",
  stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,publishTime:"",finishedAt:"",publishedLink:"",
  driveFolder:"",productUrl:"",note:"",mainType:"",source:"老闆自拍",refLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos, sched){
  calls=[]; toasts=[]; fields={}; nodes={}; modalHTML="";
  OD_Q=""; OD_UNSCHED=true; OD_DS=""; MODAL_DIRTY=false;
  VID_LANG=""; VID_VIEW="rawNoSched"; VID_MODE="list"; VID_TAGS=new Set(); VID_Q="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Anna",role:"intl",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Regina",role:"manager",pwHash:H},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:sched||{}, logs:[], deletedVideos:[], shifts:{}, tasks:{}, videos:(videos||[]).slice() };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; CAL_PLAT="tw"; CAL_YM=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{},
    arrayAdd:async(c,id,f,v)=>{calls.push(["arrayAdd",c,id,f,v]);}, arrayDel:async()=>{}, bump:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const vidCall=()=>calls.filter(x=>x[0]==="update"&&x[1]==="videos").pop();
// 選單裡列出哪幾支
const listed=(h,ids)=>ids.filter(id=>h.includes(`value="${id}"`));
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ ① 月曆一律算「排到這天的」，不管剪完了沒 ══
const TOM=D(1);
reset([ v_("A",{scheduledDate:TOM,stage:"已完成",finishedAt:D(-1)+"T05:00:00"}),   // 剪完了
        v_("B",{scheduledDate:TOM,stage:"待處理"}),                                 // 還沒開始剪
        v_("C",{scheduledDate:TOM,stage:"剪輯中"}) ]);
ok("排到這天的三支都算進來（不管剪完沒）", dayVideoList(TOM).length===3);
ok("待處理的也算", dayVideoList(TOM).some(x=>x.videoId==="B"));
ok("剪輯中的也算", dayVideoList(TOM).some(x=>x.videoId==="C"));
ok("當日數字跟著變（3/4，還缺 1）",
   dayBreakdown(TOM).total===3 && dayBreakdown(TOM).target===4 && dayBreakdown(TOM).short===1);
reset([ v_("A",{scheduledDate:TOM,stage:"待處理"}), v_("X",{scheduledDate:D(2),stage:"待處理"}) ]);
ok("排在別天的不會算進來", dayVideoList(TOM).length===1);
reset([ v_("A",{scheduledDate:TOM,stage:"待處理",locale:"en"}),
        v_("B",{scheduledDate:TOM,stage:"待處理",channel:"shopee"}) ]);
ok("海外／蝦皮二創版照舊不進台灣月曆（各自有月曆）", dayVideoList(TOM).length===0);
// 排程表裡的重播還是照舊
reset([ v_("A",{scheduledDate:D(-9),stage:"已完成",tags:["舊片"]}) ],
      {[TOM]:{slots:[{videoId:"A",time:"10:00",reused:true,by:"Regina"}]}});
ok("重播（排程表裡的）照舊算", dayVideoList(TOM).length===1 && dayVideoList(TOM)[0].slot.reused===true);

// ══ ② 點日期的選單：所有影片都選得到 ══
const LIB=[
  v_("N1",{stage:"待處理"}),                                   // 還沒剪、沒排日期
  v_("N2",{stage:"剪輯中",name:"翡翠開箱"}),                    // 剪輯中、沒排日期
  v_("N3",{stage:"已完成",finishedAt:D(-1)+"T05:00:00"}),       // 剪完、沒排日期
  v_("S1",{stage:"待處理",scheduledDate:D(3)}),                 // 已經排在未來
  v_("O1",{stage:"已完成",finishedAt:D(-20)+"T05:00:00",scheduledDate:D(-9)}),  // 舊片（播過了）
];
reset(LIB); as("Regina","manager"); OD_DS=TOM; OD_UNSCHED=false;
{ const h=odSelectHTML(TOM);
  ok("所有影片都選得到（不再只有剪完的舊片）",
     JSON.stringify(listed(h,["N1","N2","N3","S1","O1"]))===JSON.stringify(["N1","N2","N3","S1","O1"]));
  ok("還沒剪完的也列得出來，並標出階段", h.includes("待處理") && h.includes("剪輯中"));
  ok("舊片標「舊片」跟用過幾次", h.includes("舊片") && h.includes("已用")); }
reset(LIB); as("Regina","manager"); OD_DS=TOM; OD_UNSCHED=true;
{ const h=odSelectHTML(TOM);
  ok("「只看還沒排的」會濾掉已經排在未來的", !h.includes('value="S1"'));
  ok("舊片不受這個篩選影響（它本來就播過了，要能重播）", h.includes('value="O1"'));
  ok("沒排日期的都還在", listed(h,["N1","N2","N3"]).length===3); }
reset(LIB); as("Regina","manager"); OD_DS=TOM; OD_UNSCHED=false; OD_Q="翡翠";
ok("搜尋得到（片名）", JSON.stringify(listed(odSelectHTML(TOM),["N1","N2","N3","S1","O1"]))===JSON.stringify(["N2"]));
OD_Q="26N3";
ok("搜尋得到（編號）", JSON.stringify(listed(odSelectHTML(TOM),["N1","N2","N3"]))===JSON.stringify(["N3"]));
OD_Q="不存在的東西";
ok("搜不到會講一聲，不是空白一片", odSelectHTML(TOM).includes("沒有符合的影片"));
// 當天已排的不再出現在選單裡
reset([ v_("A",{scheduledDate:TOM,stage:"待處理"}), v_("B",{stage:"待處理"}) ]);
as("Regina","manager"); OD_DS=TOM; OD_UNSCHED=false;
ok("當天已經排過的不再出現在選單", !odSelectHTML(TOM).includes('value="A"') && odSelectHTML(TOM).includes('value="B"'));

// ══ ② 排入：舊片＝重播，其他＝設定預排上片日 ══
(async()=>{
  reset(LIB); as("Regina","manager"); OD_DS=TOM;
  fields.od_vid="N1"; fields.od_time="10:00";
  await odAdd(TOM); await wait(220);
  { const c=vidCall();
    ok("還沒播過的 → 直接設它的預排上片日", !!c && c[3].scheduledDate===TOM);
    ok("順便把上片時間存起來", !!c && c[3].publishTime==="10:00");
    ok("不會被當成重播（沒有動到排程表）", !calls.some(x=>x[0]==="arrayAdd"));
    ok("有講排到哪一天", toasts.some(t=>t.includes(TOM))); }
  reset(LIB); as("Regina","manager"); OD_DS=TOM;
  fields.od_vid="O1"; fields.od_time="10:00"; fields.od_link=""; fields.od_drive="";
  await odAdd(TOM); await wait(220);
  ok("舊片 → 走重播（寫進排程表，不改它原本的預排上片日）",
     calls.some(x=>x[0]==="arrayAdd") && !(vidCall()||{})[3]?.scheduledDate);
  reset(LIB); as("Regina","manager"); OD_DS=TOM;
  fields.od_vid=""; toasts=[];
  await odAdd(TOM); await wait(220);
  ok("沒選就按會提醒", toasts.some(t=>t.includes("請先選")) && !vidCall());

  // 選單的說明文字：按下去會發生什麼要講清楚
  reset(LIB); as("Regina","manager"); OD_DS=TOM;
  nodes.od_hint=el(); nodes.od_reuse=el(); nodes.od_add=el(); nodes.od_drive=el();
  fields.od_vid="N1"; odPickVid();
  ok("選還沒播過的：說明是「設成這天」", nodes.od_hint.textContent.includes("預排上片日"));
  ok("選還沒播過的：不出現重播專用欄位", nodes.od_reuse.style.display==="none");
  ok("選還沒播過的：按鈕寫「排入」", nodes.od_add.textContent==="排入");
  fields.od_vid="O1"; odPickVid();
  ok("選舊片：說明是「排成重播」", nodes.od_hint.textContent.includes("重播"));
  ok("選舊片：才出現重播專用欄位", nodes.od_reuse.style.display!=="none");
  ok("選舊片：按鈕寫「排入重播」", nodes.od_add.textContent==="排入重播");
  reset(LIB); nodes.od_hint=el();
  fields.od_vid="不存在";
  ok("選到不存在的不會炸", (function(){ try{ odPickVid(); return nodes.od_hint.textContent===""; }catch(e){ return false; } })());

  // ══ ③ 日期欄下面那排 14 天速覽 ══
  reset([ v_("V1"), v_("A",{scheduledDate:D(1),stage:"待處理"}), v_("B",{scheduledDate:D(1),stage:"剪輯中"}),
          v_("C",{scheduledDate:D(2),stage:"待處理"}), v_("E",{scheduledDate:D(2),stage:"待處理"}),
          v_("F",{scheduledDate:D(2),stage:"待處理"}), v_("G",{scheduledDate:D(2),stage:"待處理"}) ]);
  as("Regina","manager");
  openVideoModal("V1", true);
  { const m=modalHTML;
    ok("日期欄下面有 14 天速覽", m.includes('class="dstrip"'));
    ok("排在日期欄下面（不是上面）", m.indexOf('id="e_date"') < m.indexOf('class="dstrip"'));
    ok("還在標籤上方", m.indexOf('class="dstrip"') < m.indexOf('id="e_box"'));
    ok("剛好 14 天", (m.match(/class="dchip/g)||[]).length===14);
    ok("寫明點一下會帶入", m.includes("點一下帶入"));
    ok("每一顆都點得動", m.includes(`pickDate('e_date','${D(1)}')`));
    const strip=(m.split('class="dstrip"')[1]||"").split("</div>\n")[0];
    ok("明天顯示排了 2 支", strip.includes(`<b>2</b><span>/4</span>`));
    ok("後天排滿 4 支就轉綠", /class="dchip full"[^>]*onclick="pickDate\('e_date','?"?/.test(strip)
       || strip.includes('dchip full'));
    ok("排滿那天的數字是 4", strip.includes(`<b>4</b><span>/4</span>`));
    ok("沒排的那天顯示 0", strip.includes(`<b>0</b><span>/4</span>`)); }
  // 點一下真的會填進欄位
  reset([v_("V1")]); as("Regina","manager");
  nodes.e_date=el(); MODAL_DIRTY=false;
  pickDate("e_date", D(3));
  ok("點了會把日期填進欄位", nodes.e_date.value===D(3));
  ok("點了算是有改動（離開會被提醒沒存檔）", MODAL_DIRTY===true);
  nodes={};
  ok("欄位不在畫面上時不會炸", (function(){ try{ pickDate("e_date",D(3)); return true; }catch(e){ return false; } })());

  // ══ 海外剪輯看到英文 ══
  reset(LIB); as("Anna","intl"); OD_DS=TOM;
  ok("海外的選單標題是英文", odSelectHTML(TOM).includes("Pick a video") && !odSelectHTML(TOM).includes("選一支影片"));
  reset([v_("V1",{locale:"en"})]); as("Anna","intl");
  openVideoModal("V1", true);
  ok("海外的 14 天速覽是英文", modalHTML.includes("Next 14 days") && !modalHTML.includes("接下來 14 天"));

  // ══ CSS ══
  ok("[css] 14 天速覽是橫向捲的一排", /\.dstrip\{[^}]*display:flex/.test(css) && /\.dstrip\{[^}]*overflow-x:auto/.test(css));
  ok("[css] 每一顆不會被壓扁", /\.dchip\{[^}]*flex:none/.test(css));
  ok("[css] 排滿的轉綠、沒排滿的數字是紅的",
     /\.dchip\.full\{[^}]*border-color:var\(--green\)/.test(css) && /\.dchip b\{[^}]*color:var\(--red\)/.test(css));

  // ══ render 不炸 ══
  [["Regina","manager","cal"],["管理員","boss","cal"],["Anna","intl","cal"],["小葵","editor","cal"]].forEach(([u,r,tab])=>{
    reset(LIB); as(u,r); CUR_TAB=tab;
    try{ render(); ok(`[${r}] 月排程`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });
  reset(LIB); as("Regina","manager");
  try{ openDay(TOM); ok("點日期的視窗畫得出來", modalHTML.includes("od_vid")||modalHTML.includes("od_list")); }
  catch(e){ ok("點日期的視窗 → "+e.message, false); }
  reset([]); as("Regina","manager");
  try{ openDay(TOM); ok("一支影片都沒有時也畫得出來", modalHTML.includes("沒有符合的影片")); }
  catch(e){ ok("空資料 → "+e.message, false); }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
