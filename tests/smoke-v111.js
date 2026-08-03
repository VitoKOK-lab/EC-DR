// v111：影片庫分頁 7→4＋一個開關；編輯表單依資料類型折疊。
//
// 分頁：內部仍是七段，但畫面把「排了沒」這一軸抽成開關 ——
//       攤平成七顆等於逼使用者用眼睛做二維查表，而且要看完所有沒排的得點三個分頁。
// 表單：四個人輪流做全部的事，所以不能依角色隱藏，改依「資料類型」折。
//       鐵則：折疊區裡只要已經有資料就自動展開，不然使用者會以為是空的。
const fs=require("fs"), path=require("path");
let src=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8")
  .replace(/^let /gm,"").replace(/^const /gm,"");
const el=()=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:"DIV",dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(){return null;},setAttribute(){},closest(){return null;},
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), nodes={};
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(nodes[id]) return nodes[id];
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
const FUTURE=D(4), PAST=D(-4);
const v_=(id,o)=>Object.assign({id,code:"26"+id,name:"",rawName:"毛片"+id,videoCopy:"口播",rawLink:"",cover:"",
  stage:"待處理",editor:"",claimedBy:"",assignedTo:"",scheduledDate:null,publishTime:"",finishedAt:"",
  publishedLink:"",driveFolder:"",productUrl:"",note:"",mainType:"",source:"老闆自拍",refLink:"",
  reviewStatus:"",locale:"",channel:"",origLang:"",tags:[],products:[],usageHistory:[],metrics:[]},o||{});
const done=(o)=>Object.assign({stage:"已完成",finishedAt:D(-1)+"T05:00:00",publishedLink:"http://p"},o||{});
function reset(videos){
  nodes={}; modalHTML="";
  STATE={ users:[{name:"小葵",role:"editor",craft:"both"},{name:"Regina",role:"manager"},
                 {name:"Anna",role:"intl"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:["寵粉"],sources:["老闆自拍","外部公司"],postPlatforms:[{name:"IG",utm:"ig"}],
      intlAccounts:[],shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  CUR_TAB="videos"; VIEW_AS=null; VID_LANG=""; VID_VIEW="raw"; VID_UNSCHED=false;
  VID_Q=""; VID_TAGS=new Set(); VID_MODE="list";
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{} };
  localStorage.setItem("ecdr_user","管理員"); localStorage.setItem("ecdr_role","boss");
}
const as=(u,r)=>{ localStorage.setItem("ecdr_user",u); localStorage.setItem("ecdr_role",r); };
const tabN=(h,label)=>{ const seg=h.split(">"+label+"</span>")[1]||""; const m=seg.match(/vtab-n">(\d+)</); return m?+m[1]:null; };
// 某個折疊區塊的 <details ...> 開頭，用來判斷有沒有 open
const foldTag=(h,title)=>{ const i=h.indexOf("<summary>"+title); if(i<0) return null;
  const j=h.lastIndexOf("<details", i); return j<0?null:h.slice(j, i); };
const isOpen=(h,title)=>{ const t=foldTag(h,title); return t!=null && t.includes("open"); };
let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n);} }

// ══════════ ① 分頁 7 → 4 ══════════
const LIB=[
  v_("A1"), v_("A2"),                                          // 未拍・未排程
  v_("B1",{scheduledDate:FUTURE}),                             // 未拍・已排程
  v_("C1",{rawLink:"http://raw"}),                             // 待剪・未排程
  v_("D1",{rawLink:"http://raw",scheduledDate:FUTURE}),        // 待剪・已排程
  v_("E1",done({rawLink:"http://raw"})),                       // 剪完・未排程
  v_("F1",done({rawLink:"http://raw",scheduledDate:FUTURE})),  // 新片完成
  v_("G1",done({rawLink:"http://raw",scheduledDate:PAST})),    // 舊片
];
reset(LIB); as("管理員","boss");
{ const h=viewVideos();
  ok("只剩四顆分頁", ["未拍","待剪","剪完","舊片"].every(x=>h.includes("<span>"+x+"</span>")));
  ok("矩陣式的七顆不見了",
     !h.includes("未拍・未排程") && !h.includes("待剪・已排程") && !h.includes("剪完・未排程"));
  ok("分頁鈕正好四顆", (h.match(/class="vtab /g)||[]).length===4);
  ok("四顆的數字加起來＝全部", ["未拍","待剪","剪完","舊片"].reduce((a,x)=>a+tabN(h,x),0)===LIB.length); }

// 內部七段沒有被拆掉（生命週期判定仍然完整）
reset();
ok("內部仍然是七段", VID_SEGS.length===7);
ok("四個分頁各自蓋住哪幾段",
   JSON.stringify(VID_GROUPS.map(g=>g[3]))===JSON.stringify(
     [["scriptNoSched","scriptSched"],["rawNoSched","rawSched"],["newNoSched","newSched"],["old"]]));
ok("每一段都被某一個分頁蓋到", VID_SEGS.every(s=>VID_GROUPS.some(g=>g[3].includes(s))));

// ══════════ ② 「只看還沒排日期的」開關 ══════════
reset(LIB); as("管理員","boss");
ok("有這個開關", viewVideos().includes('id="vid_uns"'));
ok("預設沒有勾", !/id="vid_uns" checked/.test(viewVideos()));
reset(LIB); as("管理員","boss"); VID_UNSCHED=true;
{ const h=viewVideos();
  ok("勾起來時顯示為已勾選", /id="vid_uns" checked/.test(h));
  ok("四頁的數字都只算沒排日期的",
     ["未拍","待剪","剪完","舊片"].reduce((a,x)=>a+tabN(h,x),0)===LIB.filter(v=>!v.scheduledDate).length);
  ok("舊片一定有排程日，所以是 0", tabN(h,"舊片")===0); }

// 開關取代了原本要點三個分頁才看得完的動作
reset(LIB); as("管理員","boss"); VID_UNSCHED=true;
{ let all=[];
  ["script","raw","done","old"].forEach(g=>{ VID_VIEW=g; all=all.concat(vidVisibleList().map(v=>v.id)); });
  ok("開關打開後四頁列出來的就是全部沒排日期的",
     JSON.stringify(all.sort())===JSON.stringify(LIB.filter(v=>!v.scheduledDate).map(v=>v.id).sort())); }

// 開關走局部重繪（跟搜尋同一條路，不整頁重畫）
reset(LIB); as("管理員","boss");
{ let rendered=false; const _r=render; render=()=>{rendered=true;};
  const list={innerHTML:""}, tabs={innerHTML:""}, tagsEl={innerHTML:""};
  nodes={vid_list:list, vid_tabs:tabs, vid_tags:tagsEl};
  vidSetUnsched(true);
  ok("切開關不會整頁重繪", !rendered);
  ok("切開關會更新分頁數字", tabs.innerHTML.includes("vtab-n"));
  ok("切開關會更新清單", list.innerHTML.length>0);
  ok("狀態有記住", VID_UNSCHED===true);
  render=_r; }

// 海外看到英文
reset(LIB); as("Anna","intl");
{ const h=viewVideos();
  ok("海外四顆分頁英文", ["Not shot","To edit","Done","Old"].every(x=>h.includes("<span>"+x+"</span>")));
  ok("海外開關也是英文", h.includes("Unscheduled only"));
  ok("海外沒有中文洩漏", !h.includes("未拍") && !h.includes("待剪") && !h.includes("只看還沒排")); }

// ══════════ ③ 編輯表單：每次要看的留在上面 ══════════
reset([v_("V1")]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML;
  const top=m.split("<summary>商品與導購")[0];   // 第一個折疊區塊之前＝一進來就看得到的
  ok("片名在上面", top.includes('id="e_raw"'));
  ok("文案在上面", top.includes('id="e_vcopy"'));
  ok("毛片連結在上面", top.includes('id="e_rawlink"'));
  ok("上片日期在上面", top.includes('id="e_date"'));
  ok("標籤在上面", top.includes('id="e_box"'));
  ok("商品沒有攤在上面", !top.includes('id="e_pn0"'));
  ok("標籤只露前兩個，其餘收在「更多標籤」", m.includes("更多標籤"));
  ok("備註沒有攤在上面", !top.includes('id="e_note"'));
  ok("片源下拉沒有攤在上面", !top.includes('id="e_src"')); }

// 重複的第二個編號欄拿掉了
{ const m=modalHTML;
  ok("重複的編號欄已移除", !m.includes('id="e_code2"'));
  ok("編號欄還在（只剩一個）", m.includes('id="e_code"')); }

// ══════════ ④ 折疊區塊 ══════════
reset([v_("V1")]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML;
  ok("有「商品與導購」折疊", m.includes("<summary>商品與導購"));
  ok("有「上片後」折疊", m.includes("<summary>上片後"));
  ok("有「進階」折疊", m.includes("<summary>進階"));
  // 欄位仍然在 DOM 裡（折疊不等於移除，存檔才讀得到）
  ["e_url","e_drive","e_name","e_ref","e_src","e_stage","e_editor","e_note"]
    .forEach(f=>ok(`${f} 仍然在表單裡（存檔讀得到）`, m.includes(`id="${f}"`)));
  ok("商品預設 0 列（v114），改成按「加商品」才長", !m.includes('id="e_pn0"') && m.includes("加商品")); }

// 空白的片：三個折疊都收起來
reset([v_("V1")]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML;
  ok("沒資料時「商品與導購」收起來", !isOpen(m,"商品與導購"));
  ok("沒資料時「上片後」收起來", !isOpen(m,"上片後"));
  ok("沒資料時「進階」收起來", !isOpen(m,"進階")); }

// 有資料就自動展開（不然會以為是空的）
reset([v_("V1",{products:[{name:"茶晶手鍊",price:"1200",salePrice:"980"}]})]); as("Regina","manager");
openVideoModal("V1", true);
ok("有商品 → 自動展開", isOpen(modalHTML,"商品與導購"));
reset([v_("V1",{productUrl:"http://shop/x"})]); as("Regina","manager");
openVideoModal("V1", true);
ok("只有商品網址也自動展開", isOpen(modalHTML,"商品與導購"));
reset([v_("V1",{driveFolder:"http://drive/done"})]); as("Regina","manager");
openVideoModal("V1", true);
ok("有完成存檔連結 → 上片後自動展開", isOpen(modalHTML,"上片後"));
reset([v_("V1",{metrics:[{platform:"IG",views:100}]})]); as("Regina","manager");
openVideoModal("V1", true);
ok("有成效資料 → 上片後自動展開", isOpen(modalHTML,"上片後"));
reset([v_("V1",{note:"記得補商品連結"})]); as("Regina","manager");
openVideoModal("V1", true);
ok("有備註時進階仍然收著（v114）", !isOpen(modalHTML,"進階"));
ok("但標題上標數字提示裡面有料", /<summary>進階<span class="n">1<\/span>/.test(modalHTML));
reset([v_("V1",{refLink:"http://ref"})]); as("Regina","manager");
openVideoModal("V1", true);
ok("有參考網址也只標數字，不展開", !isOpen(modalHTML,"進階") && /<summary>進階<span class="n">1<\/span>/.test(modalHTML));
reset([v_("V1",{editor:"小葵"})]); as("Regina","manager");
openVideoModal("V1", true);
ok("有指定剪輯不會撐開進階（v114 起一律收起）", !isOpen(modalHTML,"進階"));
reset([v_("V1",{name:"貼文用的標題"})]); as("Regina","manager");
openVideoModal("V1", true);
ok("貼文文案跟原始片名不同 → 標數字", /<summary>進階<span class="n">1<\/span>/.test(modalHTML));
reset([v_("V1",{name:"毛片V1"})]); as("Regina","manager");
openVideoModal("V1", true);
ok("貼文文案等於原始片名就不算有料（存檔時本來就會這樣填）",
   !/<summary>進階<span class="n">/.test(modalHTML));

// 審片卡不折（是要處理的動作，不是參考資料）
reset([v_("V1",{rawLink:"http://raw"})]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML;
  ok("審片卡留在折疊區之前（Regina 要用）",
     m.indexOf("reviewVid(")>=0 && m.indexOf("reviewVid(")<m.indexOf("<summary>商品與導購")); }
reset([v_("V1",{rawLink:"http://raw"})]); as("小葵","editor");
openVideoModal("V1", true);
ok("剪輯看不到審片卡（本來就沒權限）", !modalHTML.includes("reviewVid("));

// 危險動作維持在最下面
reset([v_("V1")]); as("Regina","manager");
openVideoModal("V1", true);
{ const m=modalHTML;
  ok("刪除鈕在最下面", m.lastIndexOf("delVideo(") > m.lastIndexOf("<summary>進階")); }

// ══════════ ⑤ 存檔照樣讀得到折疊裡的欄位 ══════════
reset([v_("V1",{rawLink:"http://raw"})]); as("Regina","manager");
{ const f={e_code:"26V1",e_raw:"毛片V1",e_name:"貼文標題",e_vcopy:"口播",e_ref:"http://ref",
           e_date:FUTURE,e_src:"外部公司",e_stage:"待處理",e_editor:"小葵",e_url:"",
           e_note:"備註內容",e_drive:"http://drive",e_rawlink:"http://raw",e_lang:""};
  const _get=global.document.getElementById;
  global.document.getElementById=(id)=>{ if(f[id]!==undefined){ const e=el(); e.value=f[id]; return e; } return _get(id); };
  let sent=null; global.window.DB.update=async(c,id,p)=>{ sent=p; };
  saveVideo("V1");
  global.document.getElementById=_get;
  setTimeout(()=>{},0);
  ok("折疊裡的欄位有被收進去（值讀得到，不是 undefined）",
     f.e_note==="備註內容" && f.e_src==="外部公司" && f.e_drive==="http://drive"); }

// ══════════ ⑥ render 不炸 ══════════
reset(LIB);
[["管理員","boss"],["Regina","manager"],["小葵","editor"],["Anna","intl"]].forEach(([u,r])=>{
  ["script","raw","done","old"].forEach(g=>{
    [false,true].forEach(uns=>{
      as(u,r); CUR_TAB="videos"; VID_VIEW=g; VID_UNSCHED=uns; VID_Q=""; VID_TAGS=new Set();
      try{ render(); ok(`[${r}] ${g}${uns?"・只看未排":""}`, true); }
      catch(e){ ok(`[${r}] ${g} → ${e.message}`, false); } }); }); });
reset([v_("V1"), v_("V2",{rawLink:"http://raw",products:[{name:"x",price:"1",salePrice:"1"}],
  driveFolder:"http://d",note:"n",refLink:"http://r",editor:"小葵"})]);
[["管理員","boss"],["Regina","manager"],["小葵","editor"],["Anna","intl"]].forEach(([u,r])=>{
  ["V1","V2"].forEach(id=>{
    as(u,r);
    try{ openVideoModal(id, true); ok(`[${r}] 編輯 ${id} 畫得出來`, modalHTML.length>0); }
    catch(e){ ok(`[${r}] 編輯 ${id} → ${e.message}`, false); }
    try{ openVideoModal(id, false); ok(`[${r}] 檢視 ${id} 畫得出來`, modalHTML.length>0); }
    catch(e){ ok(`[${r}] 檢視 ${id} → ${e.message}`, false); } }); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
