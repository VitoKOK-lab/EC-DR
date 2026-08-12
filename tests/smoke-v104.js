// v104：待認領的搜尋改成跟影片庫一樣 —— 打字就即時篩出來，
// 不用按 Enter、也不用再點一次「待認領」把折疊打開。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8").replace(/^let /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), nodes={}, missing=new Set();
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(nodes[id]) return nodes[id];
    if(missing.has(id)) return null;        // 模擬「畫面上沒有這個節點」
    const e=el(); if(id==="modalRoot"){Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}});} return e;},
  addEventListener(){},createElement:()=>el(),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,location:{reload(){}}};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);
toast=()=>{};

const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"片"+id,rawName:"毛片"+id,videoCopy:"",rawLink:"http://r",
  stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,publishedLink:"",driveFolder:"",
  productUrl:"",note:"",mainType:"",source:"老闆自拍",refLink:"",reviewStatus:"",
  locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
const POOL=[
  v_("P1",{code:"2609171",name:"珠寶介紹",rawName:"珠寶介紹"}),
  v_("P2",{code:"2609172",name:"戒指開箱",rawName:"戒指開箱",source:"外部公司",tags:["新片"]}),
  v_("P3",{code:"2609173",name:"珠寶保養",rawName:"珠寶保養"}),
  v_("P4",{code:"2609174",name:"蝦皮版",rawName:"蝦皮版",channel:"shopee",account:"acctSHP",source:"外部公司"}),
  v_("P5",{code:"2609175",name:"Ruby Ring",rawName:"Ruby Ring",locale:"en",account:"acctEN"}),
  v_("P6",{code:"2609176",name:"泰版",rawName:"泰版",locale:"th",account:"acctTH"}),
];
function reset(){
  nodes={}; missing=new Set();
  STATE={ users:[{name:"小葵",role:"editor"},{name:"Regina",role:"manager"}],
    settings:{dailyTarget:4,videoTags:["新片"],sources:["老闆自拍","外部公司"],postPlatforms:[],
      intlAccounts:[{locale:"en",name:"acctEN"},{locale:"th",name:"acctTH"}],
      shopeeAccounts:["acctSHP"],msAccounts:["acctMS"],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:POOL.map(v=>Object.assign({},v)) };
  POOL_FILTER="all"; POOL_Q=""; WORK_ZONE="shopee"; VIEW_AS=null; CUR_TAB="work";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
  // 這支測的是搜尋機制，用看得到兩區的 Regina，池才是 fixture 設計的完整 6 支
  localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
}
// 「待認領」那張卡的折疊區段
const poolFold=(h)=>{ const parts=h.split('<details class="fold"');
  return parts.find(p=>p.includes("待認領（毛片＋二創版本）"))||""; };
// 這個折疊展開了沒：只看 <details …> 那個標籤本身有沒有 open 屬性。
// v129 起標籤上多了 data-fold="…"（記住開合用），不能再靠「前 10 個字裡有沒有 open」。
const foldIsOpen=(chunk)=>/(^|\s)open(\s|>|$)/.test(String(chunk).split(">")[0]);
const inPool=(h)=>{ const seg=(h.split("待認領（毛片＋二創版本）")[1]||"").split("</table>")[0];
  return POOL.map(v=>v.id).filter(id=>seg.includes("'"+id+"'")); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══ ① 打字就篩（跟影片庫一樣用 oninput，不必按 Enter）══
reset();
{ const w=viewWork();
  ok("搜尋框用 oninput（邊打邊篩）", /id="pool_q"[^>]*oninput="setPoolQ\(this\.value\)"/.test(w));
  ok("影片庫也是邊打邊篩（行為一致）", viewVideos().includes('id="vid_q"') && /id="vid_q"[^>]*oninput=/.test(viewVideos()));
  ok("按 Enter 也還是有效（習慣按的人不會壞）", w.includes("if(enterKey(event))setPoolQ(this.value)")); }

// ══ ② 搜尋之後折疊要自己打開（不用再點一次「待認領」）══
reset();
ok("沒搜尋時：待認領維持收合（不佔畫面）", !foldIsOpen(poolFold(viewWork())));
reset(); setPoolQ("珠寶");
ok("一搜尋：待認領自動展開", foldIsOpen(poolFold(viewWork())));
ok("搜尋結果就在展開的折疊裡", JSON.stringify(inPool(viewWork()))===JSON.stringify(["P1","P3"]));
reset(); setPoolFilter("shopee");
ok("點快選分類：待認領也自動展開", foldIsOpen(poolFold(viewWork())));
reset(); setPoolQ("珠寶"); setPoolQ("");
ok("清掉搜尋字：折疊回到收合", !foldIsOpen(poolFold(viewWork())));

// ══ ②-b 按 Enter 之後也不能把待認領收掉（要能直接點搜到的片名）══
reset();
{ // 模擬使用者：展開待認領 → 打字 → 按 Enter
  const poolInput=(viewWork().match(/<input id="pool_q"[\s\S]*?>/)||[""])[0];
  const onkey=(poolInput.match(/onkeydown="([^"]*)"/)||[])[1]||"";
  ok("Enter 走的是 setPoolQ（跟打字同一條路）", onkey.includes("setPoolQ(this.value)"));
  setPoolQ("珠寶");                       // ← Enter 觸發的就是這個
  const w=viewWork();
  ok("按 Enter 後待認領仍然展開（沒被縮到最小）", foldIsOpen(poolFold(w)));
  ok("按 Enter 後搜到的片名點得到", w.includes("editVideo('P1')") && w.includes("editVideo('P3')"));
  ok("按 Enter 後搜尋字還在框裡", w.includes(`id="pool_q" value="珠寶"`)); }

// ══ ③ 局部重繪：只換清單，不整頁重畫（折疊不會被收回去、游標留在搜尋框）══
reset();
{ let rendered=false; const _r=render; render=()=>{rendered=true;};
  const list={innerHTML:"__old__"}, n={textContent:"",className:""}, tabs={innerHTML:""},
        clr={innerHTML:""}, wrap={style:{}};
  nodes={pool_list:list, pool_n:n, pool_tabs:tabs, pool_clear:clr, pool_wrap:wrap};
  setPoolQ("珠寶");
  ok("打字不會觸發整頁重繪", !rendered);
  ok("清單被就地換掉", list.innerHTML!=="__old__" && list.innerHTML.includes("'P1'") && list.innerHTML.includes("'P3'"));
  ok("換掉的清單不含不符合的", !list.innerHTML.includes("'P4'"));
  ok("數量徽章跟著更新", n.textContent==="2/6");
  ok("快選數字跟著更新", tabs.innerHTML.includes("珠寶")===false && tabs.innerHTML.includes('vtab-n">2<'));
  ok("清除鍵跟著出現", clr.innerHTML.includes("清除"));
  render=_r; }
reset();
{ let rendered=false; const _r=render; render=()=>{rendered=true;};
  missing.add("pool_list");   // 沒有 pool_list（例如人在別的分頁）→ 退回整頁重繪，不會靜默失效
  setPoolQ("珠寶");
  ok("找不到清單節點時退回整頁重繪", rendered);
  render=_r; }

// ══ ④ 原本的搜尋結果沒有被改壞 ══
reset(); setPoolQ("2609174");
ok("用編號搜", JSON.stringify(inPool(viewWork()))===JSON.stringify(["P4"]));
reset(); setPoolQ("外部公司");
ok("用來源搜", JSON.stringify(inPool(viewWork()))===JSON.stringify(["P2","P4"]));
reset(); setPoolQ("ruby RING");
ok("英文不分大小寫", JSON.stringify(inPool(viewWork()))===JSON.stringify(["P5"]));
reset(); setPoolFilter("tw"); setPoolQ("珠寶");
ok("分類＋搜尋一起套用", JSON.stringify(inPool(viewWork()))===JSON.stringify(["P1","P3"]));
reset(); setPoolQ("完全沒有這種片");
{ const w=viewWork();
  ok("找不到時清單是空的", inPool(w).length===0);
  ok("找不到時寫出搜尋的字", w.includes("找不到符合「完全沒有這種片」的項目")); }

// ══ ⑤ 清單容器有 id，局部重繪才有得換 ══
reset();
{ const w=viewWork();
  ok("清單有 id=pool_list", w.includes('<tbody id="pool_list">'));
  ok("數量徽章有 id=pool_n", w.includes('id="pool_n"'));
  ok("快選列有 id=pool_tabs", w.includes('id="pool_tabs"'));
  ok("清除鍵有 id=pool_clear", w.includes('id="pool_clear"')); }

// ══ ⑥ render 不炸 ══
reset();
try{ render(); ok("上班計畫畫得出來", true); }catch(e){ ok("上班計畫畫得出來 → "+e.message, false); }
reset(); setPoolQ("珠寶");
try{ render(); ok("搜尋狀態下也畫得出來", true); }catch(e){ ok("搜尋狀態下也畫得出來 → "+e.message, false); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
