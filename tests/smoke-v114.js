// v114：表單再瘦一輪，並把「沒寫文案」標出來。
//  ① 沒寫文案的片在清單上標一個小橘點（既有那批沒文案的舊資料，補完就自己不見）
//  ② 商品從固定 4 列（12 格）改成預設 0 列，要填才按「＋ 加商品」
//  ③ 標籤預設只露前兩個，其餘收進「更多標籤」（已勾的一定露）
//  ④ 「進階」一律收起來，裡面有東西時在標題上標數字提示
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},focus(){},
  insertAdjacentHTML(pos,html){ this.innerHTML+=html; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), nodes={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(nodes[id]) return nodes[id];
    if(/_prow\d+$/.test(id)) return null;   // 沒登記的商品列＝畫面上還沒長出來
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
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"",rawName:"毛片"+id,videoCopy:"口播",rawLink:"http://raw",
  cover:"",stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,publishTime:"",finishedAt:"",
  publishedLink:"",driveFolder:"",productUrl:"",note:"",mainType:"",source:"老闆自拍",refLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
function reset(videos, tags){
  nodes={}; modalHTML="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both"},{name:"Regina",role:"manager"},
                 {name:"Anna",role:"intl"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4, videoTags:tags||["寵粉","珠寶介紹","生活分享","代理招商","異國文化"],
      sources:["老闆自拍"],postPlatforms:[],intlAccounts:[],shopeeAccounts:["蝦皮A"],msAccounts:[],
      exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  CUR_TAB="videos"; VIEW_AS=null; VID_LANG=""; VID_VIEW="raw"; VID_UNSCHED=false;
  VID_Q=""; VID_TAGS=new Set(); VID_MODE="list"; MODAL_DIRTY=false; MODAL_SAVE=null;
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
  localStorage.setItem("ecdr_user","Regina"); localStorage.setItem("ecdr_role","manager");
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const foldTag=(h,title)=>{ const i=h.indexOf("<summary>"+title); if(i<0) return null;
  const j=h.lastIndexOf("<details", i); return j<0?null:h.slice(j, i); };
const isOpen=(h,title)=>{ const t=foldTag(h,title); return t!=null && t.includes("open"); };
// 標籤區塊：從「標籤（可複選）」到「新增標籤…」之間
const tagArea=(h)=>{ const a=h.indexOf("標籤（可複選）"), b=h.indexOf("新增標籤…");
  return (a<0||b<0)?"":h.slice(a,b); };
// 預設露出來的那幾顆（不含「更多標籤」摺疊裡的）
const headTags=(h)=>{ const seg=tagArea(h); const i=seg.indexOf("<details");
  return (i<0?seg:seg.slice(0,i)).match(/value="([^"]+)"/g)||[]; };
const moreTags=(h)=>{ const seg=tagArea(h); const i=seg.indexOf("<details");
  return (i<0?"":seg.slice(i)).match(/value="([^"]+)"/g)||[]; };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══════════ ① 「這支還缺什麼」小燈號（v122 起從「沒文案小圓點」擴成整條流程）══════════
const D2=(n)=>new Date(Date.now()+288e5+n*864e5).toISOString().slice(0,10);
const OKV=(id,o)=>v_(id,Object.assign({videoCopy:"有寫口播",rawLink:"http://raw",scheduledDate:D2(3)},o||{}));
reset([OKV("A",{videoCopy:""}), OKV("B")]); as("管理員","boss");
{ const h=viewVideos();
  ok("沒文案的那支有燈號", h.includes('class="misspill"') && h.includes("缺文案"));
  ok("只有一支被標到", (h.match(/class="misspill/g)||[]).length===1); }
reset([OKV("B")]); as("管理員","boss");
ok("什麼都齊全就完全不出現", !viewVideos().includes("misspill"));
reset([OKV("A",{videoCopy:"   "})]); as("管理員","boss");
ok("文案只有空白也算沒寫", viewVideos().includes("缺文案"));
// 圖片模式也要標
reset([OKV("A",{videoCopy:""})]); as("管理員","boss"); VID_MODE="grid";
ok("圖片模式也標得出來", viewVideos().includes("缺文案"));
// 流程上的每一步都標得出來
reset(); as("管理員","boss");
ok("沒毛片標「缺毛片」", missingPill(OKV("A",{rawLink:""})).includes("缺毛片"));
ok("沒排日期標「沒排日期」", missingPill(OKV("A",{scheduledDate:null})).includes("沒排日期"));
// ── 「缺上片連結」只對二創殼亮（v136）──────────────────────────
// 台灣源片的編輯視窗**沒有**上片連結那一格（只有存檔／毛片／參考來源），
// 所以那個欄位對源片永遠是空的 —— 正式資料 610 支影片有 0 支填得起來。
// 拿填不了的欄位當缺漏，就是對所有人亮一個永遠熄不掉的紅字，燈號會整組失去意義。
ok("源片不再標「缺上片連結」（那一格根本沒有地方可以填）",
   !missingPill(OKV("A",{scheduledDate:D2(-1)})).includes("缺上片連結"));
ok("源片就算過了上片日也不算落後了",
   !missingPill(OKV("A",{scheduledDate:D2(-1)})).includes("late"));
ok("源片其他該標的照標（沒有連坐拿掉別的燈號）",
   missingPill(OKV("A",{scheduledDate:D2(-1),rawLink:""})).includes("缺毛片"));
// 二創殼：沒有腳本／毛片這兩步，但它的編輯視窗有「上傳連結」欄位，所以照追
ok("蝦皮殼不標缺文案", !missingPill(v_("P",{channel:"shopee",videoCopy:"",scheduledDate:D2(3)})).includes("缺文案"));
ok("英文殼不標缺毛片", !missingPill(v_("E",{locale:"en",rawLink:"",scheduledDate:D2(3)})).includes("缺毛片"));
ok("版本殼一樣會追上片連結（它有那一格）",
   missingPill(v_("P2",{channel:"shopee",scheduledDate:D2(-1)})).includes("缺上片連結"));
ok("版本殼該上片沒貼＝紅的",
   missingPill(v_("P3",{channel:"shopee",scheduledDate:D2(-1)})).includes("late"));
ok("版本殼上片日還沒到就不算落後",
   !missingPill(v_("P4",{channel:"shopee",scheduledDate:D2(3)})).includes("late"));
ok("版本殼貼了連結就不再標",
   !missingPill(v_("P5",{channel:"shopee",scheduledDate:D2(-1),publishedLink:"http://p"})).includes("缺上片連結"));
// noCopyDot 已刪：它是 missingPill 上線前的相容外皮，最後一個呼叫端在 v114 就拿掉了，
// 只剩這支測試在幫它續命。留著沒有人叫的 function ＝ 讀 code 的人要多想一次「這是幹嘛的」。
// 缺很多項時：主要那項寫出來，其餘進 title
{ const p=missingPill(v_("M",{videoCopy:"",rawLink:"",scheduledDate:null}));
  ok("缺很多項會標 +N", /\+2/.test(p));
  ok("全部缺的項目都在滑鼠提示裡", p.includes("缺文案") && p.includes("缺毛片") && p.includes("沒排日期")); }
// 海外看到的是英文
reset(); as("Anna","intl");
ok("海外的燈號是英文", missingPill(OKV("A",{videoCopy:""})).includes("needs script"));

// ══════════ ② 商品預設 0 列 ══════════
reset([v_("V1")]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML;
  ok("沒商品時一列都不長", !m.includes('id="e_pn0"'));
  ok("有「加商品」按鈕", m.includes('id="e_padd"') && m.includes("加商品"));
  ok("按鈕預設看得到", !/id="e_padd" style="display:none/.test(m));
  ok("標明是選填", m.includes("選填")); }
reset([v_("V1",{products:[{name:"茶晶手鍊",price:"1200",salePrice:"980"}]})]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML;
  ok("有一個商品就長一列", m.includes('id="e_pn0"') && !m.includes('id="e_pn1"'));
  ok("值有帶進去", m.includes("茶晶手鍊") && m.includes('value="1200"') && m.includes('value="980"')); }
reset([v_("V1",{products:[{name:"A"},{name:"B"},{name:"C"},{name:"D"}]})]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML;
  ok("四個商品就長四列", [0,1,2,3].every(i=>m.includes(`id="e_pn${i}"`)));
  ok("滿了就把按鈕藏起來", /id="e_padd" style="display:none/.test(m)); }
reset([v_("V1",{products:[{name:"A"},{name:"B"},{name:"C"},{name:"D"},{name:"E"}]})]); as("Regina","manager");
openVideoModal("V1", true);
ok("超過四個只留四個（上限）", !modalHTML.includes('id="e_pn4"'));
// 空品名不佔位置
reset([v_("V1",{products:[{name:""},{name:"有名字的"}]})]); as("Regina","manager");
openVideoModal("V1", true);
ok("沒品名的不算一列", modalHTML.includes("有名字的") && !modalHTML.includes('id="e_pn1"'));

// 按「加商品」會長出下一列
reset([v_("V1")]);
{ const rows={innerHTML:"", insertAdjacentHTML(p,h){ this.innerHTML+=h; }};
  const btn={style:{display:""}};
  nodes={e_prows:rows, e_padd:btn};
  addProductRow("e");
  ok("按一下長出第 0 列", rows.innerHTML.includes('id="e_pn0"'));
  ok("按鈕還在（還沒滿）", btn.style.display!=="none");
  // 讓後續查得到已存在的列
  nodes.e_prow0={}; addProductRow("e");
  ok("再按長出第 1 列", rows.innerHTML.includes('id="e_pn1"'));
  nodes.e_prow1={}; addProductRow("e");
  nodes.e_prow2={}; addProductRow("e");
  ok("長到第 3 列", rows.innerHTML.includes('id="e_pn3"'));
  ok("滿四列就把按鈕收起來", btn.style.display==="none");
  nodes.e_prow3={};
  const before=rows.innerHTML; addProductRow("e");
  ok("滿了就不再長", rows.innerHTML===before); }
// 找不到容器不會炸
reset([v_("V1")]);
{ nodes={};
  try{ addProductRow("e"); ok("找不到容器也不會炸", true); }
  catch(e){ ok("找不到容器也不會炸 → "+e.message, false); } }

// ══════════ ③ 標籤預設只露兩個 ══════════
reset([v_("V1")]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML; const N=otherTags().length;
  ok("預設只露兩顆", headTags(m).length===2);
  ok("其餘收進「更多標籤」", m.includes("更多標籤") && moreTags(m).length===N-2);
  ok("摺疊上標了還有幾個", m.includes(`<summary>更多標籤<span class="n">${N-2}</span>`));
  ok("「更多標籤」預設是收起來的", !isOpen(m,"更多標籤"));
  ok("新增標籤的輸入框還在", m.includes('id="e_new"')); }
// 已經勾起來的一定要露出來，不然看不出這支選了什麼
reset([v_("V1",{tags:["異國文化"]})]); as("Regina","manager");
openVideoModal("V1", true);
{ const head=headTags(modalHTML).join(",");
  ok("勾起來的一定露出來", head.includes("異國文化"));
  ok("而且是勾好的", /value="異國文化" checked/.test(modalHTML));
  ok("它不會又出現在「更多標籤」裡", !moreTags(modalHTML).join(",").includes("異國文化")); }
reset([v_("V1",{tags:["寵粉","珠寶介紹","生活分享","異國文化"]})]); as("Regina","manager");
{ openVideoModal("V1", true); const N=otherTags().length;
  ok("勾了四個就露四個", headTags(modalHTML).length===4);
  ok("其餘沒勾的收起來", moreTags(modalHTML).length===N-4); }
// 標籤本來就不多的時候不要多一層摺疊
// videoTags() 會自動補齊幾個內建標籤，所以直接拿 otherTags() 的前兩個當設定
reset([v_("V1")]); as("Regina","manager");
STATE.settings.videoTags=otherTags().slice(0,2);
openVideoModal("V1", true);
ok("只有兩個標籤時不出現「更多標籤」", otherTags().length>2 || !modalHTML.includes("更多標籤"));
// 全部標籤（含收起來的）加起來要完整，不然會漏選項
reset([v_("V1")]); as("Regina","manager");
openVideoModal("V1", true);
ok("露出的＋收起的＝全部標籤", headTags(modalHTML).length+moreTags(modalHTML).length===otherTags().length);

// ══════════ ④ 「進階」一律收起來 ══════════
reset([v_("V1")]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML;
  ok("進階預設收起來", !isOpen(m,"進階"));
  ok("裡面沒東西時不標數字", !/<summary>進階<span class="n">/.test(m)); }
reset([v_("V1",{note:"備註"})]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML;
  ok("有備註也不展開", !isOpen(m,"進階"));
  ok("但標題標 1", /<summary>進階<span class="n">1<\/span>/.test(m)); }
reset([v_("V1",{note:"備註",refLink:"http://ref",name:"不一樣的貼文標題"})]); as("Regina","manager");
openVideoModal("V1", true);
ok("三樣都有就標 3", /<summary>進階<span class="n">3<\/span>/.test(modalHTML));
// name 存檔時預設會等於原始片名，不能拿來當「有料」的依據
reset([v_("V1",{name:"毛片V1"})]); as("Regina","manager");
openVideoModal("V1", true);
ok("貼文文案等於原始片名就不算有料", !/<summary>進階<span class="n">/.test(modalHTML));
// 剪輯人員是認領時自動填的，不是使用者在進階打的
reset([v_("V1",{editor:"小葵"})]); as("Regina","manager");
openVideoModal("V1", true);
ok("有剪輯人員不算有料（是認領時自動填的）", !/<summary>進階<span class="n">/.test(modalHTML));

// ══════════ ⑤ 其他折疊的規則沒被改壞 ══════════
reset([v_("V1",{products:[{name:"茶晶手鍊"}]})]); as("Regina","manager");
openVideoModal("V1", true);
ok("有商品時「商品與導購」照樣自動展開", isOpen(modalHTML,"商品與導購"));
reset([v_("V1",{driveFolder:"http://d"})]); as("Regina","manager");
openVideoModal("V1", true);
ok("有完成存檔連結時「上片後」照樣自動展開", isOpen(modalHTML,"上片後"));

// ══════════ ⑥ 存檔照樣讀得到 ══════════
reset([v_("V1")]);
{ const f={};
  const _get=global.document.getElementById;
  global.document.getElementById=(id)=>{ if(f[id]!==undefined){ const e=el(); e.value=f[id]; return e; } return _get(id); };
  f.e_pn0="茶晶手鍊"; f.e_pp0="1200"; f.e_ps0="980";
  const got=collectProducts("e");
  ok("長出來的商品列收得到", got.length===1 && got[0].name==="茶晶手鍊" && got[0].price===1200 && got[0].salePrice===980);
  f.e_pn1="第二個"; f.e_pp1="500"; f.e_ps1="400";
  ok("兩列也收得到", collectProducts("e").length===2);
  global.document.getElementById=_get; }

// ══════════ ⑦ render 不炸 ══════════
reset([v_("V1",{videoCopy:""}), v_("V2",{products:[{name:"A"},{name:"B"}],tags:["寵粉","異國文化"],note:"n"})]);
[["管理員","boss"],["Regina","manager"],["小葵","editor"],["Anna","intl"]].forEach(([u,r])=>{
  as(u,r);
  ["list","grid"].forEach(mode=>{
    VID_MODE=mode; CUR_TAB="videos";
    try{ render(); ok(`[${r}] 影片庫 ${mode}`, true); }catch(e){ ok(`[${r}] 影片庫 ${mode} → ${e.message}`, false); } });
  ["V1","V2"].forEach(id=>{
    try{ openVideoModal(id, true); ok(`[${r}] 編輯 ${id}`, modalHTML.length>0); }
    catch(e){ ok(`[${r}] 編輯 ${id} → ${e.message}`, false); } }); });
reset(); as("管理員","boss");
try{ newSimpleVideo(); ok("新增影片視窗也畫得出來", true); }catch(e){ ok("新增影片視窗 → "+e.message, false); }
try{ batchNewFootage(); ok("批次新增也畫得出來", true); }catch(e){ ok("批次新增 → "+e.message, false); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
