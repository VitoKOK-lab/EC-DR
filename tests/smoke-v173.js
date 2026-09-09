// v173：月排程加一個「清單」檢視 —— 整個月攤成一張表（日期／時間／影片貼文文案）。
//
// 老闆的話：「月排程新增一個檢視模式，就是類似 excel 那樣表單，以月為單位，
//            左邊是日期 幾點 影片名稱（只能看，要修改還是用一樣的方式，
//            點日期，一次修改一個日期中的所有片的那個視窗。」
//            「然後在這裡模式，不要出現編號，顯示『影片貼文文案』」
//
// 為什麼要有：月曆一格只放得下一個數字 —— 看得到「這天排了幾支」，
// 看不到「排了哪幾支」。想核對整個月排了什麼，只能一天一天點開，三十天點三十次。
//
// 三條要釘死的規矩：
//   ① 只能看：清單裡不可以有任何會寫資料庫的東西（改期、移出排程、勾選…）。
//   ② 要改就點日期 → 開原本那個「一次改一天」的視窗（openDay／openDayCh／openDayIntl）。
//   ③ 不印編號，印影片貼文文案。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,
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
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,260));} }

// 時間凍在月中，這樣「上個月／下個月」都還在同一年，月曆格數也是滿的
const FROZEN=new Date(Date.now()+288e5).toISOString().slice(0,8)+"15";
todayTW=()=>FROZEN; ydayTW=()=>FROZEN.slice(0,8)+"14"; refreshToday();
const YM=FROZEN.slice(0,7), Y=+YM.slice(0,4), M=+YM.slice(5,7);
const D=(n)=>YM+"-"+String(n).padStart(2,"0");

const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"原始片名"+id,videoCopy:"",nameEn:"",videoCopyEn:"",
  rawLink:"",lib:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,finishedAt:"",
  publishedLink:"",driveFolder:"",reviewStatus:"",locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",
  cover:"",remakes:[],publishTime:"",tags:[],products:[],usageHistory:[],metrics:[],note:"",refLink:"",
  productUrl:"",source:"官方IP",deleted:false}, o||{});
function reset(videos, schedule, who, role){
  VIEW_AS=null; BRAND=""; viewEl.innerHTML=""; modalHTML="";
  CAL_MODE="grid"; CAL_PLAT="tw"; CAL_PLAT_FOR=null; CAL_YM=[Y,M-1]; INTL_CAL_YM=[Y,M-1];
  CH_CAL={shopee:{ym:[Y,M-1],acct:""}, ms:{ym:[Y,M-1],acct:""}};
  localStorage.setItem("ecdr_user", who||"管理員"); localStorage.setItem("ecdr_role", role||"boss");
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"管理員",role:"boss"},{name:"小葵",role:"editor"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"EN帳號A"}], shopeeAccounts:["蝦皮店A"], msAccounts:["馬來A"],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:schedule||{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
}

// ══════════ ① 兩個模式切得過去，預設還是月曆 ══════════
{ reset([]);
  ok("預設是月曆（沒有把大家熟的畫面換掉）", CAL_MODE==="grid");
  const h=viewCal();
  ok("月排程上面有「月曆／清單」兩個切換", h.includes("calSetMode('grid')") && h.includes("calSetMode('list')"), h.slice(0,600));
  ok("月曆模式畫的是月曆（有星期列）", h.includes('class="cal"') && h.includes(">日<"));
  ok("月曆模式不會同時畫清單", !h.includes("callist"));
  calSetMode("list");
  const l=viewCal();
  ok("切到清單：畫的是表格", l.includes('class="vtable callist"'), l.slice(0,400));
  ok("切到清單：月曆就不畫了（不要兩個疊在一起）", !/<div class="cal">/.test(l));
  ok("三個欄位：日期／時間／影片貼文文案",
     l.includes(">日期<") && l.includes(">時間<") && l.includes(">影片貼文文案<"), (l.match(/<th>[^<]*<\/th>/g)||[]));
  calSetMode("grid"); ok("切得回月曆", CAL_MODE==="grid" && viewCal().includes('class="cal"')); }

// ══════════ ② 印的是貼文文案，不是編號 ══════════
{ reset([v_("V1",{name:"這才是頂級男人的樣子 #珠寶 #傳承", rawName:"（P323）麥特戴蒙的家庭鐵律",
                  scheduledDate:D(3), publishTime:"12:00", code:"777"})]);
  calSetMode("list");
  const l=viewCal();
  ok("**印的是影片貼文文案**", l.includes("這才是頂級男人的樣子"), l.slice(l.indexOf("callist"), l.indexOf("callist")+900));
  ok("**沒有印編號**", !/>777[ <]/.test(l) && !l.includes("777 這才是"), (l.match(/777[^<]{0,20}/g)||[]));
  ok("貼文後面那一串 #標籤 不要塞進清單（會把每一列撐成三行）", !l.includes("#珠寶"));
  ok("時間印出來了", l.includes("12:00"));
  ok("日期印出來了", l.includes(`${M}/3`)); }
// 沒填貼文文案 → 退回原始片名，不可以變成空白列
{ reset([v_("V2",{name:"", rawName:"編號32 生完老五 加斯坦奶爸餵奶戴娃上崗", scheduledDate:D(4)})]);
  calSetMode("list");
  ok("沒填貼文文案就退回原始片名（不會變空白）", viewCal().includes("生完老五")); }

// ══════════ ③ 只能看：清單裡不可以有任何會寫資料庫的東西 ══════════
{ reset([v_("V1",{name:"甲片",scheduledDate:D(3),publishTime:"10:00"}),
         v_("V2",{name:"乙片",scheduledDate:D(3),publishTime:"16:00"})]);
  calSetMode("list");
  const l=viewCal();
  const seg=l.slice(l.indexOf('class="vtable callist"'));
  ok("**清單裡沒有改期的日期框**", !/<input/.test(seg), (seg.match(/<input[^>]*>/g)||[])[0]);
  ok("**清單裡沒有「移出排程」**", !seg.includes("移出排程") && !/Unschedule/.test(seg));
  ok("清單裡沒有任何會寫資料庫的呼叫",
     !/reschedule|unschedule|scheduleSet|dbUpdate|dbDel/i.test(seg), (seg.match(/on\w+="[^"]{0,60}/g)||[]).slice(0,6));
  ok("清單裡沒有勾選盒", !/type="checkbox"/.test(seg)); }

// ══════════ ④ 要改 → 點日期 → 開原本那個「一次改一天」的視窗 ══════════
{ reset([v_("V1",{name:"甲片",scheduledDate:D(3),publishTime:"10:00"}),
         v_("V2",{name:"乙片",scheduledDate:D(3),publishTime:"16:00"})]);
  calSetMode("list");
  const l=viewCal();
  ok("**日期是可以點的，點下去開那天的視窗**", l.includes(`openDay('${D(3)}')`), l.slice(0,300));
  ok("每一天都點得到（不是只有有排片的那幾天）", l.includes(`openDay('${D(1)}')`) && l.includes(`openDay('${D(28)}')`));
  ok("畫面上有寫「要改請點日期」", l.includes("點左邊的日期"), (l.match(/只能看[^<]*/)||[])[0]);
  // 同一天兩支：日期只印一次（像 Excel 合併儲存格），但兩支都要在
  const seg=l.slice(l.indexOf(`openDay('${D(3)}')`), l.indexOf(`openDay('${D(4)}')`));
  ok("同一天有兩支就兩列", seg.includes("甲片") && seg.includes("乙片"));
  ok("同一天的日期只印一次（第二列留白）", (seg.match(new RegExp(`openDay\\('${D(3)}'\\)`,"g"))||[]).length===1);
  ok("早的排前面（10:00 在 16:00 之前）", seg.indexOf("10:00")<seg.indexOf("16:00")); }
// 真的會走到那個視窗（不是只有字串長得像）
{ reset([v_("V1",{name:"甲片",scheduledDate:D(3)})]);
  openDay(D(3));
  ok("openDay 開得起來，而且就是「一次改一天」那個視窗", modalHTML.includes("甲片") && /改期|移出排程/.test(modalHTML),
     modalHTML.slice(0,200)); }

// ══════════ ⑤ 整個月都在：沒排片的日子也要有一列（缺口要看得見）══════════
{ reset([v_("V1",{name:"甲片",scheduledDate:D(3)})]);
  calSetMode("list");
  const l=viewCal();
  const days=new Date(Y,M,0).getDate();
  ok("整個月每一天都有一列", (l.match(/openDay\('/g)||[]).length===days, {有:(l.match(/openDay\('/g)||[]).length, 該有:days});
  ok("沒排的那天寫「這天還沒排」", l.includes("（這天還沒排）"));
  ok("月底最後一天也在（不會少一天）", l.includes(`openDay('${D(days)}')`));
  ok("上個月／下個月切得動", l.includes("calMove(-1)") && l.includes("calMove(1)"));
  ok("整個月共幾支有寫出來", /整個月共 <b>1<\/b>/.test(l), (l.match(/整個月共[^。]*/)||[])[0]); }
// 今天那一列要標出來
{ reset([]);
  calSetMode("list");
  ok("今天那一列有標記", viewCal().includes("cl-today") && viewCal().includes(">今天<")); }

// ══════════ ⑥ 四個平台都有清單，而且各自點到自己的視窗 ══════════
{ reset([v_("SRC",{name:"源片",scheduledDate:D(3)}),
         v_("SHP",{name:"蝦皮版",channel:"shopee",account:"蝦皮店A",sourceVideoId:"SRC",scheduledDate:D(3),publishTime:"11:00"})]);
  calSetMode("list"); CAL_PLAT="shopee"; CAL_PLAT_FOR="boss";
  const l=viewCal();
  ok("蝦皮也有清單", l.includes('class="vtable callist"'));
  ok("蝦皮的日期點到蝦皮那天的視窗", l.includes(`openDayCh('shopee','${D(3)}')`), l.slice(0,300));
  ok("蝦皮清單印得出片名", l.includes("蝦皮版")); }
{ reset([v_("SRC",{name:"源片",scheduledDate:D(3)}),
         // 版本殼自己「兩個名字都空」才會去拿源片的 —— 有自己的名字就用自己的，
         // 所以這裡 name 跟 rawName 都要清掉，不然測不到那條退路
         v_("EN",{name:"",rawName:"",locale:"en",account:"EN帳號A",sourceVideoId:"SRC",scheduledDate:D(5)})]);
  calSetMode("list"); CAL_PLAT="en"; CAL_PLAT_FOR="boss";
  const l=viewCal();
  ok("海外也有清單", l.includes('class="vtable callist"'));
  ok("海外的日期點到海外那天的視窗", l.includes(`openDayIntl('${D(5)}')`), l.slice(0,300));
  ok("版本殼自己沒填文案時，用源片的名字（不要印成「(未命名)」）",
     l.includes("源片") && !l.includes("(未命名)"), l.slice(l.indexOf(D(5))-80, l.indexOf(D(5))+260)); }

// ══════════ ⑦ 換模式、換平台、換月份都不會炸 ══════════
{ reset([v_("V1",{name:"甲片",scheduledDate:D(3)})]);
  let bad=null;
  ["grid","list"].forEach(mode=>{ calSetMode(mode);
    ["tw","shopee","ms","en","th","sunny"].forEach(p=>{ CAL_PLAT=p; CAL_PLAT_FOR="boss";
      try{ viewCal(); }catch(e){ bad=mode+"/"+p+": "+e.message; } }); });
  ok("六個平台 × 兩個模式都畫得出來", !bad, bad); }
{ reset([]); CAL_MODE="list"; CAL_YM=null;               // 沒初始化年月也要活著（換模式時最容易踩到）
  let bad=null; try{ viewCal(); }catch(e){ bad=e.message; }
  ok("年月還沒初始化就切清單，不會炸在 null 上", !bad, bad);
  ok("而且會自己補上年月", Array.isArray(CAL_YM)); }
{ reset([v_("V1",{name:"甲片",scheduledDate:D(3)})]);
  CAL_MODE="list"; CUR_TAB="cal";
  let bad=null; try{ render(); }catch(e){ bad=e.message; }
  ok("整頁 render 也不會炸", !bad, bad); }

// ══════════ ⑧ 版面：這張表不可以套 .responsive（會被拆成一張張卡）══════════
{ ok("樣式表裡有 callist", /table\.callist\{/.test(HTML));
  ok("**清單那張表沒有掛 .responsive**", !/callist[^"]*responsive|responsive[^"]*callist/.test(APP),
     (APP.match(/class="vtable [^"]*"/g)||[]).filter(s=>s.includes("callist")));
  ok("文案那一欄可以換行（不然長文案會被切掉）", /table\.callist td\{[^}]*white-space:normal/.test(HTML));
  ok("窄螢幕橫向捲得動", APP.includes('<div style="overflow-x:auto">')); }

console.log(`\nv173（月排程清單檢視）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
