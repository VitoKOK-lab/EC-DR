// v131：一套系統服務多家公司。
//
// 需求：新增「長照機構」與「Boss Sunny」兩家，帳號內容各自獨立，但剪輯是同一批人
// （其他職位在這兩家沒有工作）。
//
// 做法上最重要的一個決定：**在資料進來的那一刻就依品牌切好**（decorate），
// 而不是去改 48 個讀 STATE.videos 的地方 —— 改漏一個，就是某家的片混進另一家的
// 毛片庫存、月排程或成效裡，而且不會有人發現。
//   STATE.videosAll  全部（只有編號產生器、切換列計數、操作紀錄反查用）
//   STATE.videos     只有目前這家（其餘 48 個地方原封不動，自動拿到對的東西）
//
// 第一家用 "" —— 既有幾百支影片沒有 brand 欄位，天生就屬於它，一筆都不用搬。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  disabled:false,isConnected:true,scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(Object.prototype.hasOwnProperty.call(fields,id)) return {value:fields[id]};
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  get activeElement(){return null;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

const D=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
let vn=0;
const V=(name,brand,o)=>Object.assign({id:"B"+(++vn),code:"26"+vn,name,rawName:name,brand,
  videoCopy:"稿",rawLink:"http://raw",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",
  claimedAt:"",finishedAt:"",scheduledDate:null,publishedLink:"",driveFolder:"",
  reviewStatus:"",reviewedBy:"",reviewedAt:"",deleted:false,
  locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
const BRANDS=[{id:"care",name:"長照機構",dailyTarget:2},{id:"sunny",name:"Boss Sunny",dailyTarget:1}];
function raw(videos, brands){
  return { users:[{name:"小葵",role:"editor"},{name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00",brandName:"泰熙爾札娜",
      brands:(brands===undefined?BRANDS:brands)},
    schedule:{}, tasks:{}, shifts:{}, logs:[], videos:videos||[] };
}
function load(videos, brands){ vn=0; LAST_RAW=raw(videos,brands); decorate(LAST_RAW); }
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }
as("小葵","editor");

// ══════════ ① 公司清單 ══════════
BRAND="";
load([], BRANDS);
{ const l=brandList();
  ok("第一家是原本的資料，代號是空字串", l[0].id==="" && l[0].name==="泰熙爾札娜");
  ok("後面接設定裡加的兩家", l[1].id==="care" && l[1].name==="長照機構" && l[2].id==="sunny");
  ok("brandName 可以改第一家的名字", (load([],BRANDS), STATE.settings.brandName="金曜石", brandList()[0].name==="金曜石"));
  ok("只有一家時不用問要進哪一家", (load([],[]), brandMulti()===false));
  ok("兩家以上才要問", (load([],BRANDS), brandMulti()===true)); }
load([], BRANDS);
ok("沒填代號或名字的那幾筆直接忽略", (()=>{ load([], [{id:"",name:"沒代號"},{id:"x",name:""},{id:"ok",name:"有效"}]);
  return brandList().length===2 && brandList()[1].id==="ok"; })());
ok("代號重複只留第一個", (()=>{ load([], [{id:"a",name:"A1"},{id:"a",name:"A2"}]);
  return brandList().length===2 && brandList()[1].name==="A1"; })());
ok("brandOf 沒有 brand 欄位就是第一家", brandOf({})==="" && brandOf({brand:""})==="" && brandOf({brand:"care"})==="care");
ok("brandName 查得到名字", (load([],BRANDS), brandName("care")==="長照機構" && brandName("")==="泰熙爾札娜"));

// ══════════ ② 切片：目前這家只看得到自己的 ══════════
const VIDS=()=>[ V("札娜一",""), V("札娜二",""), V("札娜三",""),
                 V("長照一","care"), V("長照二","care"),
                 V("Sunny 一","sunny"),
                 V("札娜刪掉的","",{deleted:true}), V("長照刪掉的","care",{deleted:true}) ];
BRAND=""; load(VIDS());
ok("預設看第一家：3 支", STATE.videos.length===3 && STATE.videos.every(v=>brandOf(v)===""));
ok("videosAll 是全部（不含已刪的）", STATE.videosAll.length===6);
ok("回收桶也只看這家的", STATE.deletedVideos.length===1 && STATE.deletedVideos[0].name==="札娜刪掉的");
ok("deletedVideosAll 是全部已刪的", STATE.deletedVideosAll.length===2);
BRAND="care"; load(VIDS());
ok("切到長照：只剩 2 支", STATE.videos.length===2 && STATE.videos.every(v=>brandOf(v)==="care"));
ok("看不到札娜的片", !STATE.videos.some(v=>String(v.name).startsWith("札娜")));
BRAND="sunny"; load(VIDS());
ok("切到 Sunny：1 支", STATE.videos.length===1 && STATE.videos[0].name==="Sunny 一");
// 品牌被刪掉之後不能把人卡在看不到東西的狀態
BRAND="care"; load(VIDS(), []);
ok("設定裡把那家刪掉 → 自動退回第一家", BRAND==="" && STATE.videos.length===3);

// ══════════ ③ 靠切片自動生效的那些（不用改程式碼的地方） ══════════
BRAND=""; load([ V("札娜待剪",""), V("長照待剪","care"), V("Sunny待剪","sunny") ]);
ok("待認領只有這家的", poolAll().length===1 && poolAll()[0].name==="札娜待剪");
BRAND="care"; load([ V("札娜待剪",""), V("長照待剪","care"), V("Sunny待剪","sunny") ]);
ok("換一家，待認領跟著換", poolAll().length===1 && poolAll()[0].name==="長照待剪");
// 毛片庫存：這是「低於 20 支要提醒老闆拍片」的依據，混到別家就會不準
BRAND=""; load([ V("札娜毛片",""), V("長照毛片","care"), V("長照毛片2","care") ]);
ok("毛片庫存只算這家的", rawStock().length===1);
BRAND="care"; load([ V("札娜毛片",""), V("長照毛片","care"), V("長照毛片2","care") ]);
ok("換一家，毛片庫存跟著換", rawStock().length===2);
// 月排程
BRAND=""; load([ V("札娜排明天","",{scheduledDate:D(1)}), V("長照排明天","care",{scheduledDate:D(1)}) ]);
ok("月排程那一天只列這家的", dayVideoList(D(1)).length===1 && vid(dayVideoList(D(1))[0].videoId).name==="札娜排明天");
BRAND="care"; load([ V("札娜排明天","",{scheduledDate:D(1)}), V("長照排明天","care",{scheduledDate:D(1)}) ]);
ok("換一家，月排程跟著換", dayVideoList(D(1)).length===1 && vid(dayVideoList(D(1))[0].videoId).name==="長照排明天");
// 影片庫
BRAND=""; load([ V("札娜的",""), V("長照的","care") ]);
VID_LANG=""; VID_VIEW="raw"; VID_TAGS=new Set(); VID_Q=""; VID_UNSCHED=false; ZONE_VIEW="tw";
ok("影片庫只有這家的", viewVideos().includes("札娜的") && !viewVideos().includes("長照的"));

// ══════════ ④ 編號：每一家自己一套（v132）══════════
// code 是「人看的編號」，不是文件 ID（那個是 V+時間戳+亂數，本來就永不重複），
// 所以各家各自從 001 開始不會有任何資料問題。
{ const [Y,M,DD]=today.split("-"); const pre=`${(+Y-1911)}${M}${DD}`;
  const mk=()=>[ V("札娜一","",{code:pre+"001"}), V("札娜二","",{code:pre+"002"}), V("札娜三","",{code:pre+"003"}),
                 V("長照一","care",{code:pre+"001"}) ];
  BRAND=""; load(mk());
  ok("札娜接自己的：已有 001~003 → 給 004", nextVideoCode()===pre+"004");
  BRAND="care"; load(mk());
  ok("長照只算自己的：已有 001 → 給 002（不會被札娜的 003 影響）", nextVideoCode()===pre+"002");
  BRAND="sunny"; load(mk());
  ok("全新的一家從 001 開始", nextVideoCode()===pre+"001"); }
// 回收桶裡的也要算，不然救回來會撞號
{ const [Y,M,DD]=today.split("-"); const pre=`${(+Y-1911)}${M}${DD}`;
  BRAND="care"; load([ V("長照刪掉的","care",{code:pre+"005",deleted:true}) ]);
  ok("自己家回收桶裡的編號也要避開", nextVideoCode()===pre+"006"); }
// 想在編號上一眼看出是哪一家 → 給那家一個前綴
{ const [Y,M,DD]=today.split("-"); const pre=`${(+Y-1911)}${M}${DD}`;
  const B2=[{id:"care",name:"長照機構",codePrefix:"C"},{id:"sunny",name:"Boss Sunny",codePrefix:"S"}];
  BRAND="care"; load([], B2);
  ok("有前綴就加在前面", nextVideoCode()==="C"+pre+"001");
  BRAND="care"; load([ V("長照","care",{code:"C"+pre+"007"}) ], B2);
  ok("有前綴時照樣接續自己的號", nextVideoCode()==="C"+pre+"008");
  BRAND="sunny"; load([ V("長照","care",{code:"C"+pre+"007"}) ], B2);
  ok("別家的前綴不會被誤認", nextVideoCode()==="S"+pre+"001");
  BRAND="care"; load([], [{id:"care",name:"長照",codePrefix:"C/#$%"}]);
  ok("前綴裡的怪字元會被清掉（不然正規式會爆）", nextVideoCode()==="C"+pre+"001");
  BRAND=""; load([], B2);
  ok("第一家沒設前綴就跟原本一模一樣", nextVideoCode()===pre+"001"); }

// ══════════ ④b 這兩個還是要跨公司 ══════════
// 回收桶／操作紀錄的片名反查：別家的片也要查得到，不然紀錄上只剩一串 ID
BRAND=""; load(VIDS());
{ const other=STATE.videosAll.find(v=>brandOf(v)==="care");
  ok("反查得到別家的片名", !!vidLocal(other.id) && vidLocal(other.id).name==="長照一");
  ok("反查得到別家已刪的片", !!vidLocal(STATE.deletedVideosAll.find(v=>brandOf(v)==="care").id)); }
// 選帳號畫面：列出每一家、標出目前這家、數字要算全部
BRAND="care"; load(VIDS());
{ const pick=brandPickHTML();
  ok("選帳號畫面列出三家", pick.includes("泰熙爾札娜") && pick.includes("長照機構") && pick.includes("Boss Sunny"));
  ok("每家標自己的支數", pick.includes("3 支影片") && pick.includes("2 支影片") && pick.includes("1 支影片"));
  ok("按下去會選那一家", pick.includes("setBrand('care')") && pick.includes("setBrand('sunny')")); }

// ══════════ ⑤ 新影片建在目前這家 ══════════
BRAND="care"; load([]);
ok("新影片自動帶目前的公司", newVideoRecord().brand==="care");
BRAND=""; load([]);
ok("在第一家新增就是空字串（跟既有資料一致）", newVideoRecord().brand==="");

// ══════════ ⑥ 每日上片目標可以各家各自設 ══════════
BRAND=""; load([]);
ok("第一家沿用全公司的數字", daySum(D(0))===4);
BRAND="care"; load([]);
ok("長照用自己的 2", daySum(D(0))===2);
BRAND="sunny"; load([]);
ok("Sunny 用自己的 1", daySum(D(0))===1);
BRAND="care"; load([], [{id:"care",name:"長照機構"}]);
ok("沒設就沿用全公司的數字", daySum(D(0))===4);

// ══════════ ⑦ 人、出勤、交辦不分公司（一天只上一次班）══════════
BRAND="care";
LAST_RAW=raw([]);
LAST_RAW.tasks={ t1:{id:"t1",user:"小葵",date:today,title:"這件事不分公司",done:false,ack:true,report:""} };
LAST_RAW.shifts={ [shiftId("小葵",today)]:{id:shiftId("小葵",today),user:"小葵",date:today,clockIn:today+"T09:00:00",clockOut:""} };
decorate(LAST_RAW);
ok("交辦工作在哪一家都看得到", myTasks().length===1);
ok("打卡紀錄不分公司", !!(STATE.shifts||{})[shiftId("小葵",today)]);
ok("成員名單不分公司", (STATE.users||[]).length===3);
BRAND="";
decorate(LAST_RAW);
ok("換一家，交辦與出勤照樣在", myTasks().length===1 && !!(STATE.shifts||{})[shiftId("小葵",today)]);

// ══════════ ⑧ 登入後選一次，之後不再問 ══════════
// 「有沒有選過」跟「選了哪一家」是兩件事 —— 空字串是合法答案（＝第一家），
// 所以要看 localStorage 的 key 在不在，不能看值是不是空的。
load([], BRANDS);
localStorage.removeItem("ecdr_brand");
ok("沒選過 → 要先問", brandPicked()===false);
setBrand("care");
ok("選了之後就記住", brandPicked()===true && BRAND==="care");
setBrand("");
ok("選第一家（空字串）也算選過", brandPicked()===true && BRAND==="");
pickBrandAgain();
ok("按「切換影音帳號」→ 回到要問的狀態", brandPicked()===false);
localStorage.setItem("ecdr_brand","care"); BRAND="care";
{ const raw_=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
  ok("render 裡有「還沒選就先顯示選擇畫面」", /brandMulti\(\)\s*&&\s*!brandPicked\(\)/.test(raw_));
  ok("不再有常駐的切換列", !/function brandBar\(/.test(raw_));
  ok("齒輪選單有切換影音帳號", fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8").includes("pickBrandAgain()")); }

// ══════════ ⑨ 標籤／片源／投放平台各家分開（v132）══════════
// 長照的關鍵字跟珠寶毫無關係，共用一份等於兩邊都不能用。
// 欄位名加帳號後綴：第一家用原本的欄位（既有資料不動），其他家用 xxx__代號。
BRAND=""; ok("第一家用原本的欄位名", brandField("videoTags")==="videoTags");
BRAND="care"; ok("其他家加後綴", brandField("videoTags")==="videoTags__care" && brandField("sources")==="sources__care");
{ LAST_RAW=raw([], BRANDS);
  LAST_RAW.settings.videoTags=["珠寶介紹","寵粉"];
  LAST_RAW.settings.videoTags__care=["機構日常","衛教"];
  LAST_RAW.settings.sources=["老闆自拍"];
  LAST_RAW.settings.sources__care=["護理師拍的"];
  LAST_RAW.settings.postPlatforms=[{name:"IG 珠寶",utm:"ig1"}];
  LAST_RAW.settings.postPlatforms__care=[{name:"長照 FB",utm:"fb2"}];
  BRAND=""; decorate(LAST_RAW);
  ok("第一家看到自己的標籤", videoTags().includes("珠寶介紹") && !videoTags().includes("機構日常"));
  ok("第一家看到自己的片源", brandSetting("sources")[0]==="老闆自拍");
  ok("第一家看到自己的平台", postPlatforms()[0].name==="IG 珠寶");
  BRAND="care"; decorate(LAST_RAW);
  ok("長照看到自己的標籤", videoTags().includes("機構日常") && !videoTags().includes("珠寶介紹"));
  ok("長照看到自己的片源", brandSetting("sources")[0]==="護理師拍的");
  ok("長照看到自己的平台", postPlatforms()[0].name==="長照 FB");
  BRAND="sunny"; decorate(LAST_RAW);
  ok("完全沒設過的那家退回預設值（不是拿別家的）",
     !videoTags().includes("機構日常") && !videoTags().includes("珠寶介紹")
     && postPlatforms()[0].name!=="長照 FB" && postPlatforms()[0].name!=="IG 珠寶");
  BRAND="care"; decorate(LAST_RAW);
  ok("新影片的預設片源用這家的", newVideoRecord().source==="護理師拍的"); }


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
