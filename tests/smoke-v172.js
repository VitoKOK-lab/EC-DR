// v172：存檔資料夾「填完當下」就變成超連結；要改到「進階」裡面改。
//
// 老闆截圖：一長串 Google 雲端硬碟網址就這樣躺在輸入框裡。
// v169 已經做過「有網址就顯示成連結」，但那是**下次打開視窗**才會變 ——
// 當下填完的人看到的還是輸入框，所以他以為根本沒生效。
//
// 這一版把規矩講清楚：
//   ① 主畫面那一格只負責「點開它」—— 有網址就只有連結，沒有輸入框。
//   ② 輸入框真正的家在「進階」；空的時候才長在主畫面（拍毛片的人要馬上填得到）。
//   ③ 填完當下（change／blur）立刻變連結，並把輸入框整顆搬進「進階」。
//
// ⚠️ 全畫面只能有一個 id="e_drive" 的 input —— saveVideo 是 val("e_drive")，
//    出現兩個同 id 的話存檔讀到哪一個要看運氣，而且很可能把資料夾洗成空的。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
let src=APP.replace(/^let /gm,"").replace(/^const /gm,"");
const el=(tag)=>({value:"",innerHTML:"",textContent:"",className:"",style:{},checked:false,tagName:tag||"DIV",
  dataset:{},disabled:false,readOnly:false,isConnected:true,scrollTop:0,rows:1,parentNode:null,children:[],
  attrs:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  addEventListener(){},
  appendChild(c){ if(c.parentNode) c.parentNode.children=c.parentNode.children.filter(x=>x!==c);
                  c.parentNode=this; this.children.push(c); return c; },
  querySelector(){return null;},querySelectorAll(){return [];},
  getAttribute(k){return this.attrs[k]==null?null:this.attrs[k];},
  setAttribute(k,v){ this.attrs[k]=String(v); },
  closest(){return null;},focus(){},click(){},
  insertAdjacentHTML(p,h){ this.innerHTML+=h; },
  getBoundingClientRect(){return{top:0,left:0,bottom:0,right:0};}});
const store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
let modalHTML="", viewEl=el(), fields={}, reg={};
// 這一版要驗「輸入框被搬到哪裡」，所以 getElementById 必須每次回同一顆，
// 不能像其他測試那樣每次現做一顆新的（現做的話永遠看不到搬動的結果）。
function node(id){ if(!reg[id]){ reg[id]=el(); reg[id]._id=id; } return reg[id]; }
global.document={getElementById:(id)=>{ if(id==="view") return viewEl;
    if(id==="modalRoot"){ const e=node(id);
      if(!e._wired){ e._wired=1; Object.defineProperty(e,"innerHTML",{set(v){modalHTML=v;},get(){return modalHTML;}}); }
      return e; }
    const e=node(id); if(fields[id]!=null) e.value=fields[id]; return e; },
  get activeElement(){return null;},
  addEventListener(){},createElement:(t)=>el(t),body:{classList:{toggle(){},add(){},remove(){}}},
  querySelector:()=>null,querySelectorAll:()=>[]};
global.window={addEventListener(){},innerWidth:1200,innerHeight:800,scrollY:0,scrollTo(){},DB:null,
  location:{reload(){}}, open:()=>({})};
global.requestAnimationFrame=(f)=>f(); global.navigator={onLine:true};
global.confirm=()=>true; global.prompt=()=>null;
eval(src);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }

const URL1="https://drive.google.com/drive/folders/1OhE1Mv0k5ACNvAMVj5RkUePu9jiIm3QU?usp=sharing";
const URL2="https://drive.google.com/drive/folders/SECOND-ONE";
const v_=(id,o)=>Object.assign({id,code:"C"+id,name:"",rawName:"[帶貨] 看《降世神通》學資產配置",
  videoCopy:"口播",nameEn:"",videoCopyEn:"",rawLink:"",lib:"",stage:"待處理",editor:"",claimedBy:"",
  assignedTo:"",scheduledDate:null,finishedAt:"",publishedLink:"",driveFolder:"",reviewStatus:"",
  locale:"",channel:"",origLang:"",account:"",sourceVideoId:"",cover:"",remakes:[],
  tags:[],products:[],usageHistory:[],metrics:[],note:"",refLink:"",productUrl:"",source:"官方IP",deleted:false}, o||{});
function reset(videos, who, role){
  VIEW_AS=null; BRAND=""; modalHTML=""; fields={}; reg={};
  localStorage.setItem("ecdr_user", who||"小葵"); localStorage.setItem("ecdr_role", role||"editor");
  global.window.DB={ set:async()=>{}, update:async()=>{}, del:async()=>{}, scheduleSet:async()=>{},
    setSettings:async()=>{}, videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const raw={ users:[{name:"小葵",role:"editor"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:["官方IP"],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:{}, shifts:{}, logs:[], deletedVideos:[], videos:videos||[] };
  LAST_RAW=raw; STATE=decorate(raw);
}
const V=(id)=>(STATE.videos||[]).find(x=>x.id===id);

// ══════════ ① 還沒填：輸入框在主畫面，連結那一排先不要出現 ══════════
{ reset([v_("V1")]);
  const main=ownerDriveField(V("V1"), "e_drive");
  const adv=advDriveField(V("V1"), "e_drive");
  ok("空的時候：輸入框在主畫面（拍毛片的人一進來就填得到）", /id="e_drive"[^>]*placeholder=/.test(main), main.slice(0,300));
  ok("空的時候：連結那一排先藏起來", /id="e_drive_view"[^>]*display:none/.test(main));
  ok("空的時候：「去進階改」那句也先藏起來", /id="e_drive_hint"[^>]*display:none/.test(main));
  ok("空的時候：進階裡只有空盒子，沒有第二個輸入框",
     /id="e_drive_advslot"><\/div>/.test(adv.replace(/\s+/g," ")), adv.slice(0,240));
  ok("空的時候：整個視窗只有一個 e_drive 輸入框",
     (main+adv).match(/id="e_drive"/g).length===1); }

// ══════════ ② 已經有網址：主畫面只有連結，輸入框搬到進階 ══════════
{ reset([v_("V1",{driveFolder:URL1})]);
  const main=ownerDriveField(V("V1"), "e_drive");
  const adv=advDriveField(V("V1"), "e_drive");
  ok("**有網址：主畫面沒有輸入框了**", !/id="e_drive"[^>]*placeholder=/.test(main), main.slice(0,400));
  ok("有網址：主畫面是點得開的連結", main.includes(`href="${URL1}"`) && main.includes('id="e_drive_a"'), main.slice(0,400));
  ok("有網址：連結那一排是顯示的（沒有 display:none）", !/id="e_drive_view"[^>]*display:none/.test(main));
  ok("有網址：告訴人家要改去哪裡", main.includes("進階"), (main.match(/要換成別的[^<]*/)||[])[0]);
  ok("**有網址：輸入框在進階裡**", /id="e_drive_advslot"><input id="e_drive"/.test(adv.replace(/\s+/g," ")), adv.slice(0,300));
  ok("有網址：整個視窗還是只有一個 e_drive 輸入框",
     (main+adv).match(/id="e_drive"/g).length===1);
  ok("進階那一格的值就是現在的資料夾", adv.includes(`value="${URL1}"`)); }

// ══════════ ③ 填完當下就變（不用存檔、不用關掉再打開）══════════
{ reset([v_("V1")]);
  // 先把主畫面那一格畫出來，然後模擬「使用者貼上網址 → 離開欄位」
  const slot=document.getElementById("e_drive_advslot");
  const inp=document.getElementById("e_drive");
  const view=document.getElementById("e_drive_view");
  const link=document.getElementById("e_drive_a");
  const hint=document.getElementById("e_drive_hint");
  view.style.display="none"; hint.style.display="none";
  const origin=el(); origin.appendChild(inp);          // 一開始長在主畫面
  inp.value=URL1;
  driveTyped("e_drive");
  ok("**貼上網址：當下就變成連結**", link.getAttribute("href")===URL1 && link.textContent===URL1,
     {href:link.getAttribute("href"), text:link.textContent});
  ok("貼上網址：連結那一排顯示出來", view.style.display==="", view.style.display);
  ok("貼上網址：「去進階改」那句也顯示出來", hint.style.display==="", hint.style.display);
  ok("**貼上網址：輸入框被搬進「進階」**", inp.parentNode===slot);
  ok("搬走是搬不是複製（原本的位置不再有它）", origin.children.indexOf(inp)===-1);
  // 再改一次：從進階改成另一個資料夾，連結要跟著換
  inp.value=URL2; driveTyped("e_drive");
  ok("在進階改成別的資料夾：上面的連結跟著換", link.getAttribute("href")===URL2 && link.textContent===URL2);
  ok("改第二次不會又搬一次（本來就在進階裡）", inp.parentNode===slot && slot.children.length===1, slot.children.length); }

// ══════════ ④ 還沒打完／貼錯：不要搶著變成連結 ══════════
{ reset([v_("V1")]);
  const inp=document.getElementById("e_drive"), view=document.getElementById("e_drive_view");
  const slot=document.getElementById("e_drive_advslot"); const origin=el(); origin.appendChild(inp);
  view.style.display="none";
  inp.value="drive.google.com/drive/folders/ABC";        // 少了 https://
  driveTyped("e_drive");
  ok("沒有 https:// 就不算網址，維持輸入框", view.style.display==="none" && inp.parentNode===origin);
  inp.value="資料夾在阿明那邊，之後補";                    // 根本不是網址
  driveTyped("e_drive");
  ok("隨手打的字也不會變成連結", view.style.display==="none" && inp.parentNode===origin);
  inp.value="";                                          // 清空
  driveTyped("e_drive");
  ok("清空之後也不會留下上一次的連結", view.style.display==="none"); }

// ══════════ ⑤ 安全：只認 http(s)，javascript: 一律不放行 ══════════
{ reset([v_("V1")]);
  ok("javascript: 不算網址", driveIsUrl("javascript:alert(1)")===false);
  ok("data: 不算網址", driveIsUrl("data:text/html,<script>")===false);
  ok("空字串不算網址", driveIsUrl("")===false && driveIsUrl(null)===false);
  ok("https 算", driveIsUrl(URL1)===true);
  ok("http 也算（舊資料有）", driveIsUrl("http://drive.google.com/x")===true);
  const inp=document.getElementById("e_drive"), view=document.getElementById("e_drive_view");
  const origin=el(); origin.appendChild(inp); view.style.display="none";
  inp.value="javascript:alert(document.cookie)";
  driveTyped("e_drive");
  ok("**貼 javascript: 進去不會生出一條可以點的連結**",
     view.style.display==="none" && inp.parentNode===origin); }
{ reset([v_("V1",{driveFolder:'https://x.tw/a" onmouseover="alert(1)'})]);
  const main=ownerDriveField(V("V1"), "e_drive");
  // 引號要被跳脫成 &quot; —— 沒跳脫的話 href="…" 會提早收掉，後面那串就變成
  // 真的 onmouseover 屬性。所以這裡要找的是「有沒有生出未跳脫的引號」，
  // 不是「字串裡有沒有 onmouseover 這幾個字」（跳脫過的文字裡本來就還看得到它）。
  ok("資料庫裡帶引號的網址不會跳出屬性（有跳脫）",
     main.includes("&quot; onmouseover=&quot;") && !/href="[^"]*" onmouseover=/.test(main), main.slice(0,300)); }

// ══════════ ⑥ 沒有改壞既有的東西 ══════════
{ reset([v_("V1",{driveFolder:URL1})]);
  const main=ownerDriveField(V("V1"), "e_drive");
  ok("開資料夾的規矩還在（誰開、叫什麼名字）",
     main.includes("第一個拍好毛片的人") && main.includes("名字就用這支的檔名"));
  ok("「複製檔名」還在", main.includes("複製檔名"));
  ok("「通通放進同一個資料夾」那條規矩還在", main.includes("通通放進同一個資料夾"));
  ok("舊的 inline「編輯」小字已經拿掉（改到進階了）",
     !/drivelink-edit/.test(main) && !/driveEdit\(/.test(APP)); }
// 版本殼那一格（存檔位置由源片決定）不歸這一版管，不可以被順手改掉
{ reset([v_("SRC",{driveFolder:URL1}),
         v_("SHP",{channel:"shopee",sourceVideoId:"SRC",account:"蝦皮店A"})]);
  const fam=familyDriveField(V("SHP"), "e_drive");
  ok("版本殼：還是唯讀、還是說「由源片決定」", fam.includes("readonly") && fam.includes("你不用自己填"));
  ok("版本殼：input 還留在畫面上（拿掉會把資料夾存成空的）", /id="e_drive"/.test(fam));
  ok("版本殼：不會再多一個進階輸入框（那是源片才有的）",
     advDriveField(V("SHP"), "e_drive")===""); }

// ══════════ ⑦ 整個編輯視窗畫出來：只有一個 e_drive，而且進階裡真的有 ══════════
{ reset([v_("V1",{driveFolder:URL1})], "管理員","boss");
  openVideoModal("V1", true);
  const n=(modalHTML.match(/id="e_drive"/g)||[]).length;
  ok("**整個編輯視窗只有一個 e_drive 輸入框**", n===1, n);
  ok("編輯視窗裡有主畫面那條連結", modalHTML.includes('id="e_drive_a"'));
  ok("編輯視窗裡有進階的存放位置", modalHTML.includes('id="e_drive_advslot"'));
  const iAdv=modalHTML.indexOf("進階"), iSlot=modalHTML.indexOf('id="e_drive_advslot"');
  ok("輸入框排在「進階」那一折裡面（不是散在外面）", iAdv>-1 && iSlot>iAdv, {iAdv,iSlot}); }
{ reset([v_("V1")], "管理員","boss");
  openVideoModal("V1", true);
  const n=(modalHTML.match(/id="e_drive"/g)||[]).length;
  ok("空的時候整個視窗也只有一個 e_drive 輸入框", n===1, n);
  const iFold=modalHTML.indexOf("<details"), iInp=modalHTML.indexOf('id="e_drive"');
  ok("空的時候輸入框在主畫面（排在第一折之前，不用展開就填得到）", iInp>-1 && iInp<iFold, {iFold,iInp}); }

console.log(`\nv172（存檔資料夾填完就變連結・改到進階）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
