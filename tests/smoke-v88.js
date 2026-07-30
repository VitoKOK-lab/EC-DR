// v88：影片庫多一個分段「有文案・未拍片」——文案寫好了但毛片還沒拍
//      判定：還沒剪完 ＋ 有影片文案（videoCopy）＋ 沒有毛片雲端連結（rawLink）
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
let calls=[], toasts=[];
eval(src);
toast=(m)=>{ toasts.push(String(m)); };

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const H='pbkdf2$1$dGVzdHNhbHR0ZXN0c2E9$dGVzdA==';
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",rawLink:"",
  stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",publishedLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",source:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos){
  calls=[]; toasts=[]; fields={};
  VID_LANG=""; VID_VIEW="script"; VID_TAGS=new Set(); VID_Q="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Anna",role:"intl",craft:"both",pwHash:H,pwAt:"2020-01-01T00:00:00"},
                 {name:"Regina",role:"manager",pwHash:H},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉","珠寶介紹"],sources:["s"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, logs:[], deletedVideos:[], shifts:{}, tasks:{}, videos:(videos||[]).slice() };
  CUR_TAB=null; VIEW_AS=null; WORK_ZONE="shopee"; POOL_FILTER="all"; POOL_Q=""; CAL_PLAT="tw"; CAL_YM=null;
  global.window.DB={ set:async(c,id,o)=>{calls.push(["set",c,id,o]);}, update:async(c,id,p)=>{calls.push(["update",c,id,p]);},
    del:async(c,id)=>{calls.push(["del",c,id]);}, scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
// 分頁那一列裡某個分頁顯示的數字
const tabN=(h,label)=>{ const seg=h.split(label)[1]||""; const m=seg.match(/vtab-n">(\d+)</); return m?+m[1]:null; };
// 清單裡有哪幾支
const listed=(h,ids)=>ids.filter(id=>((h.split('id="vid_list"')[1])||"").includes("'"+id+"'"));
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ 分段判定 ══
reset();
ok("有文案沒毛片 → script", vidSegment(v_("A",{videoCopy:"口播台詞"}))==="script");
ok("有文案也有毛片 → 照舊待剪", vidSegment(v_("B",{videoCopy:"口播台詞",rawLink:"http://d"}))==="rawNoSched");
ok("沒文案沒毛片 → 照舊待剪（不是每支都要先寫文案）", vidSegment(v_("C"))==="rawNoSched");
ok("沒文案有毛片 → 照舊待剪", vidSegment(v_("D",{rawLink:"http://d"}))==="rawNoSched");
ok("有文案沒毛片但排了程 → 還是 script（沒拍就是沒拍）",
   vidSegment(v_("E",{videoCopy:"x",scheduledDate:D(3)}))==="script");
ok("剪完的不會跑進來", vidSegment(v_("F",{videoCopy:"x",stage:"已完成",finishedAt:D(-1)+"T05:00:00",publishedLink:"http://p"}))!=="script");
ok("舊片不會跑進來", vidSegment(v_("G",{videoCopy:"x",tags:["舊片"]}))==="old");
ok("文案只有空白不算有文案", vidSegment(v_("H",{videoCopy:"   "}))==="rawNoSched");
ok("毛片連結只有空白不算有毛片", vidSegment(v_("I",{videoCopy:"x",rawLink:"   "}))==="script");

// ══ 排序：文案階段排在待剪前面 ══
reset();
ok("script 排最前面（0）", vidOrderRank(v_("A",{videoCopy:"x"}))===0);
ok("待剪未排是 1", vidOrderRank(v_("B",{rawLink:"http://d"}))===1);
ok("排序沒有被 ?? 吃掉 0", vidOrderRank(v_("A",{videoCopy:"x"}))!==9);

// ══ 影片庫畫面 ══
const LIB=[
  v_("S1",{videoCopy:"口播一"}),                       // 有文案未拍片
  v_("S2",{videoCopy:"口播二"}),                       // 有文案未拍片
  v_("R1",{rawLink:"http://d"}),                       // 待剪・未排程
  v_("R2",{rawLink:"http://d",scheduledDate:D(3)}),    // 待剪・已排程
  v_("N1",{stage:"已完成",finishedAt:D(-1)+"T05:00:00",publishedLink:"http://p",reviewStatus:"通過"}),
  v_("O1",{tags:["舊片"]}),
];
reset(LIB); as("Regina","manager");
{ const h=viewVideos();
  ok("多了「有文案・未拍片」這個分頁", h.includes("有文案・未拍片"));
  ok("它排在「待剪・未排程」前面",
     h.indexOf("有文案・未拍片")<h.indexOf("待剪・未排程"));
  ok("它排在語言下拉後面（還在分頁列裡）",
     h.indexOf("原本語言")<h.indexOf("有文案・未拍片"));
  ok("數字是 2", tabN(h,"有文案・未拍片")===2);
  ok("待剪・未排程剩 1（S1 S2 被移走了）", tabN(h,"待剪・未排程")===1);
  ok("原本的五個分頁都還在",
     ["待剪・未排程","待剪・已排程","剪完・未排程","剪完・已排程","舊片"].every(x=>h.includes(x))); }
reset(LIB); as("Regina","manager"); VID_VIEW="script";
ok("點進去只列有文案未拍片的", JSON.stringify(listed(viewVideos(),["S1","S2","R1","R2","N1","O1"]))===JSON.stringify(["S1","S2"]));
reset(LIB); as("Regina","manager"); VID_VIEW="rawNoSched";
ok("待剪那頁不再列到它們", JSON.stringify(listed(viewVideos(),["S1","S2","R1","R2"]))===JSON.stringify(["R1"]));

// ══ 沒有這種片的時候 ══
reset([v_("R1",{rawLink:"http://d"})]); as("Regina","manager");
{ const h=viewVideos();
  ok("沒有這種片時分頁還是在（數字 0）", h.includes("有文案・未拍片") && tabN(h,"有文案・未拍片")===0); }
reset([v_("R1",{rawLink:"http://d"})]); as("Regina","manager"); VID_VIEW="script";
ok("空的分頁不會炸", typeof viewVideos()==="string" && viewVideos().length>0);

// ══ 搜尋、標籤在新分頁一樣能用 ══
reset([v_("S1",{videoCopy:"口播一",name:"翡翠開箱",tags:["寵粉"]}),
       v_("S2",{videoCopy:"口播二",name:"珠寶保養",tags:["珠寶介紹"]})]);
as("Regina","manager"); VID_VIEW="script"; VID_Q="翡翠";
ok("新分頁裡搜得到", JSON.stringify(listed(viewVideos(),["S1","S2"]))===JSON.stringify(["S1"]));
// 標籤鈕只列「這一頁實際有的」：待剪那支的標籤不該出現在文案頁
reset([v_("S1",{videoCopy:"口播一",name:"翡翠開箱",tags:["寵粉"]}),
       v_("R1",{rawLink:"http://d",name:"待剪的",tags:["珠寶介紹"]})]);
as("Regina","manager"); VID_VIEW="script";
{ const btns=(viewVideos().split("標籤")[1]||"").split('id="vid_list"')[0];
  ok("新分頁的標籤鈕只列這一頁有的", btns.includes("寵粉") && !btns.includes("珠寶介紹")); }

// ══ 海外剪輯看到英文 ══
reset(LIB); as("Anna","intl");
{ const h=viewVideos();
  ok("海外的分頁名是英文", h.includes("Script · not shot") && !h.includes("有文案・未拍片")); }

// ══ 其他畫面不受影響 ══
// 儀表板數「剪完・未排程」的那個數字：新分段不該把它算走
reset(LIB); as("管理員","boss");
ok("儀表板的「剪完未排程」還是 1（N1）",
   (STATE.videos||[]).filter(v=>!v.locale && !v.channel && vidSegment(v)==="newNoSched").length===1);
reset(LIB); as("小葵","editor");
ok("剪輯的待認領照舊看得到（有文案未拍的還是在池子裡）",
   viewWork().includes("claimVid('S1')") && viewWork().includes("claimVid('R1')"));

// ══ render 不炸 ══
reset(LIB);
[["Regina","manager","videos"],["Anna","intl","videos"],["管理員","boss","videos"],["小葵","editor","videos"]].forEach(([u,r,tab])=>{
  as(u,r); CUR_TAB=tab; VID_VIEW="script";
  try{ render(); ok(`[${r}] ${tab} script`, true); }catch(e){ ok(`[${r}] ${tab} → ${e.message}`, false); } });
reset(LIB);
["script","rawNoSched","rawSched","newNoSched","newSched","old"].forEach(seg=>{
  as("Regina","manager"); CUR_TAB="videos"; VID_VIEW=seg;
  try{ render(); ok(`分頁 ${seg} 渲染正常`, true); }catch(e){ ok(`分頁 ${seg} → ${e.message}`, false); } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
