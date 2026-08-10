// v126：本月成效改用圖表呈現。
//
// 原本只有一張七欄的表。表給得出精確值，但看不出「誰在哪幾天有產出、誰斷檔、
// 月底有沒有塞車」—— 那是形狀問題，要用圖。表留著，圖加在上面。
//   熱力圖  一人一列、一天一格，顏色深淺＝那天完成幾支（序列色階，同一個色相由淺到深）
//   長條圖  本月完成上片排行（單一數量的比較）
// 兩張都只列會剪片的人 —— 行銷／客服／出貨不剪片，畫出來整列是空的，
// 看起來像「這個人沒做事」，那是騙人的。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
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

const YM=today.slice(0,7);
const DD=+today.slice(8,10);
const day=(d)=>`${YM}-${String(d).padStart(2,"0")}`;
let vn=0;
// 一支已上片、指定剪輯與完成日的影片
const V=(who,d,extra)=>Object.assign({id:"P"+(++vn),code:"115"+vn,name:"影片"+vn,rawName:"影片"+vn,
  videoCopy:"稿",rawLink:"http://raw",stage:"已上片",published:true,editor:who,
  claimedAt:day(Math.max(1,d-1))+"T09:00:00",finishedAt:day(d)+"T15:00:00",
  scheduledDate:day(d),publishedLink:"http://post",driveFolder:"http://d",durationMin:90,
  locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},extra||{});
function reset(){
  vn=0; modalHTML=""; fields={};
  STATE={ users:[{name:"小葵",role:"editor"},{name:"郁莚",role:"editor"},{name:"阿哲",role:"editor"},
                 {name:"Anna",role:"intl"},{name:"江瑩",role:"mkt"},{name:"陳鋒",role:"ship"},
                 {name:"HR小姐",role:"hr"},{name:"Regina",role:"manager"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01",
      workStart:"09:00",workEnd:"18:00"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  CUR_TAB=null; VIEW_AS=null; TEAM_GROUP="all"; TEAM_Q=""; ORIG_AUTO_RAN=true;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{},
    scheduleSet:async()=>{}, setSettings:async()=>{} };
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const ed=(n)=>({name:n,role:"editor"});
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══════════ ① 一個月有幾天 ══════════
ok("31 天的月份", ymDays("2026-01")===31 && ymDays("2026-08")===31 && ymDays("2026-12")===31);
ok("30 天的月份", ymDays("2026-04")===30 && ymDays("2026-11")===30);
ok("平年的二月是 28 天", ymDays("2026-02")===28);
ok("閏年的二月是 29 天", ymDays("2024-02")===29 && ymDays("2000-02")===29);
ok("1900 不是閏年", ymDays("1900-02")===28);

// ══════════ ② 顏色階：0 沒有、最大值撐滿最深 ══════════
ok("沒有就是第 0 階", heatLevel(0,5)===0 && heatLevel(0,1)===0);
ok("最大值撐滿最深的一階", heatLevel(5,5)===5 && heatLevel(9,9)===5);
ok("最小的非零值也看得見（至少第 1 階）", heatLevel(1,20)===1);
ok("階數不會超出 1..5", [1,2,3,4,5,6,7,8,9,10].every(n=>{ const l=heatLevel(n,10); return l>=1&&l<=5; }));
ok("越多階越深（單調不下降）", (()=>{ let prev=0; for(let n=1;n<=8;n++){ const l=heatLevel(n,8); if(l<prev) return false; prev=l; } return true; })());
ok("整個月只有 1 支時就給最深（不然那一格幾乎看不見）", heatLevel(1,1)===5);

// ══════════ ③ 熱力圖的資料 ══════════
reset();
STATE.videos=[
  V("小葵",1), V("小葵",1), V("小葵",2),
  V("郁莚",2), V("郁莚",2), V("郁莚",2), V("郁莚",2),
  V("Anna",1),
  V("小葵",1,{stage:"待處理",published:false,finishedAt:""}),          // 還沒完成 → 不算
  V("小葵",1,{finishedAt:"2020-01-05T15:00:00"}),                      // 別的月份 → 不算
  V("查無此人",1),                                                      // 不在名單上 → 不算
];
{ const staff=[ed("小葵"),ed("郁莚"),ed("阿哲"),{name:"Anna",role:"intl"}];
  const h=teamHeatData(staff, YM);
  const by={}; h.rows.forEach(r=>{ by[r.u.name]=r; });
  ok("格子數＝這個月的天數", h.days===ymDays(YM) && by["小葵"].cells.length===h.days);
  ok("完成日落在正確的格子", by["小葵"].cells[0]===2 && by["小葵"].cells[1]===1);
  ok("每個人各算各的", by["郁莚"].cells[1]===4 && by["Anna"].cells[0]===1);
  ok("個人合計對", by["小葵"].total===3 && by["郁莚"].total===4 && by["Anna"].total===1);
  ok("沒完成的不算", by["小葵"].total===3);
  ok("別的月份不算", h.rows.every(r=>r.cells.every((n,i)=>i<2||n===0)));
  ok("名單以外的人不算（不會爆掉也不會亂長一列）", h.rows.length===4 && !by["查無此人"]);
  ok("沒有產出的人照樣有一列（全 0）", by["阿哲"] && by["阿哲"].total===0);
  ok("每日合計對", h.dayTotals[0]===3 && h.dayTotals[1]===5);
  ok("單日最大值對", h.max===4);
  ok("多的排上面（跟長條圖同一個順序）", h.rows.map(r=>r.u.name).join(",")==="郁莚,小葵,Anna,阿哲"); }

// ══════════ ④ 熱力圖畫出來的樣子 ══════════
reset(); as("管理員","boss");
STATE.videos=[ V("小葵",1), V("小葵",1) ];
{ const staff=[ed("小葵"),{name:"江瑩",role:"mkt"},{name:"陳鋒",role:"ship"}];
  const c=teamHeatCard(staff, YM);
  ok("有標題與說明", c.includes("每天完成上片") && c.includes("顏色越深"));
  ok("有色階圖例（少 → 多）", c.includes("hm-key") && c.includes("少") && c.includes("多"));
  ok("列出會剪片的人", c.includes(">小葵</th>"));
  ok("不列不剪片的人（畫出來整列是空的，會像沒做事）", !c.includes("江瑩") && !c.includes("陳鋒"));
  ok("有完成的格子直接把數字標上去", c.includes("<span>2</span>"));
  ok("每一格都有滑過去看得到的說明", (c.match(/class="hm-c[^"]*" title=/g)||[]).length>0);
  ok("空格子的說明寫「沒有完成上片」", c.includes("沒有完成上片"));
  ok("有每日合計那一列", c.includes("每日合計"));
  ok("有個人合計欄", c.includes("hm-t"));
  // 今天之後的日子不畫格子 —— 不然月底一大片空白會被讀成「都沒做」
  const future=(c.match(/hm-f/g)||[]).length;
  ok("今天之後的日子不畫格子", future===Math.max(0, ymDays(YM)-DD));
  ok("今天那一欄有標出來", c.includes("hm-d now"));
  // 完全沒有人剪片時不要硬擠一張空圖
  ok("沒有會剪片的人就整張卡不出現", teamHeatCard([{name:"江瑩",role:"mkt"}], YM)===""); }

// ══════════ ⑤ 長條排行 ══════════
reset(); as("管理員","boss");
{ const allTasks=[];
  STATE.videos=[ V("小葵",1),V("小葵",1),V("小葵",2,{productUrl:"http://p"}),
                 V("郁莚",1),V("郁莚",1),V("郁莚",1),V("郁莚",2),V("郁莚",2) ];
  const staff=[ed("小葵"),ed("郁莚"),ed("阿哲"),{name:"江瑩",role:"mkt"}];
  const months=staff.map(u=>({u, m:teamMonthStat(u.name, allTasks, YM)}));
  const c=teamBarCard(months);
  ok("多的排前面", c.indexOf("郁莚")<c.indexOf("小葵") && c.indexOf("小葵")<c.indexOf("阿哲"));
  ok("最多的那條拉滿", /width:100%/.test(c));
  ok("數字直接標在旁邊（不必再配圖例）", c.includes(">5<") && c.includes(">3"));
  ok("帶商品的支數放在括號裡", c.includes("（1）"));
  ok("零支的人照樣列出來（寬度 0，不是不見）", c.includes("阿哲") && /width:0%/.test(c));
  ok("不列不剪片的人", !c.includes("江瑩"));
  ok("沒有會剪片的人就整張卡不出現", teamBarCard([{u:{name:"江瑩",role:"mkt"},m:{count:0,sales:0}}])===""); }

// ══════════ ⑥ 團隊看板上真的看得到，而且原本那張表還在 ══════════
for(const [u,r] of [["管理員","boss"],["Regina","manager"],["HR小姐","hr"],["小葵","editor"]]){
  reset(); as(u,r);
  STATE.videos=[ V("小葵",1), V("郁莚",1) ];
  const h=viewTeam();
  ok(`[${r}] 看板上有熱力圖`, h.includes("每天完成上片") && h.includes("hm-key"));
  ok(`[${r}] 看板上有排行長條`, h.includes("本月完成上片") && h.includes("barlist"));
  ok(`[${r}] 原本那張精確數字的表還在`, h.includes("完成上架") && h.includes("剪片速度") && h.includes("交辦完成"));
}
reset(); as("管理員","boss");
STATE.videos=[ V("小葵",1) ];
ok("有不剪片的同仁時，會說明為什麼圖上沒有他們", viewTeam().includes("只列會剪片的同仁"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
