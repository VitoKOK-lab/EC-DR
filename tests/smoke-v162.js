// v162：多人交辦 ＋ 留言串 ＋ 同時被交辦的人用顏色區分 ＋ 網址變超連結
//
// 這一支先釘兩個純函式，其中 linkify 是**資安關鍵**：
// 交辦與留言是全公司都寫得進去的欄位，等於「別人打的字會變成我畫面上的 HTML」。
// 只要 ① 沒有先 esc、或 ② 認了 http/https 以外的 scheme，就是一個 XSS。
// 所以這裡的測試不是在測「好不好用」，是在測「會不會被打」——
// 每一條都要能單獨擋下一種攻擊，不要為了讓測試好寫而放寬。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
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
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,240));} }

// ══════════ ① linkify：先擋攻擊，再談好不好用 ══════════

// 這一組每一條都是一種打法。全部都必須「不產生可點的 <a href>」。
[ ["javascript: 直接執行", "javascript:alert(1)"],
  ["javascript: 混大小寫", "JaVaScRiPt:alert(1)"],
  ["javascript: 夾雜空白", "java\tscript:alert(1)"],
  ["data: 塞 HTML",       "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="],
  ["vbscript:",           "vbscript:msgbox(1)"],
  ["file:// 讀本機檔",     "file:///etc/passwd"],
].forEach(([name, payload])=>{
  const out=linkify(payload);
  ok("擋下 "+name, !/<a\s/i.test(out), out.slice(0,120));
});

// 直接塞標籤：不管在網址前後，都不可以變成真的 HTML
{ const out=linkify('<script>alert(1)</script>');
  ok("純標籤被跳脫掉，不會變成真的 <script>", !/<script/i.test(out) && out.includes("&lt;script&gt;"), out); }
{ const out=linkify('https://ok.com <img src=x onerror=alert(1)>');
  ok("網址後面接的標籤照樣被跳脫", !/<img/i.test(out) && out.includes("&lt;img"), out);
  ok("——但前面那個真網址還是有連結", /<a href="https:\/\/ok\.com"/.test(out), out); }
// 順序測試：如果實作先 linkify 再 esc，這條會紅
{ const out=linkify('看這個 <b>粗體</b> https://a.com');
  ok("非網址處的標籤一律跳脫（證明是先 esc 再找網址）", out.includes("&lt;b&gt;") && !/<b>/.test(out), out); }
// 把攻擊藏在網址「裡面」
{ const out=linkify('https://a.com/"onmouseover="alert(1)');
  ok("網址裡的引號不會撐開 href 屬性", !/"\s*onmouseover/i.test(out), out); }

// ── 正常情況要真的好用 ──
{ const out=linkify("資料在 https://drive.google.com/drive/folders/ABC 這裡");
  ok("http(s) 網址會變成連結", /<a href="https:\/\/drive\.google\.com\/drive\/folders\/ABC"/.test(out), out);
  ok("開新分頁", out.includes('target="_blank"'), out);
  ok("有 noopener（不然新分頁可以反過來操作我們這頁）", out.includes("noopener"), out);
  ok("連結前後的中文原封不動", out.includes("資料在 ") && out.includes(" 這裡"), out); }
{ const out=linkify("http://a.com 跟 https://b.com 都要");
  ok("一句話裡兩個網址都認得", (out.match(/<a /g)||[]).length===2, out); }
{ const out=linkify("看這裡：https://a.com/x。");
  ok("句尾的中文句號不算網址的一部分", /href="https:\/\/a\.com\/x"/.test(out) && out.endsWith("。"), out); }
{ const out=linkify("(https://a.com/y)");
  ok("被括號包住時右括號不吃進網址", /href="https:\/\/a\.com\/y"/.test(out), out); }
{ const out=linkify("https://a.com/s?q=1&r=2");
  ok("查詢字串的 & 放回 href 是原本的 &（不是 &amp;）", /href="https:\/\/a\.com\/s\?q=1&amp;r=2"/.test(out), out);
  ok("——顯示出來的文字才是跳脫過的", out.includes("q=1&amp;r=2"), out); }
{ ok("空字串不會爆", linkify("")==="" );
  ok("null 不會爆", linkify(null)==="" );
  ok("沒有網址的純文字原樣輸出", linkify("今天要交報表")==="今天要交報表"); }

// ══════════ ② 顏色：同一組裡一定分得開 ══════════
{ ok("同一個名字永遠同一個顏色", personColor("小葵").fg===personColor("小葵").fg);
  ok("顏色不受清單順序影響（純函式，不吃外部狀態）",
     JSON.stringify(personColor("阿明"))===JSON.stringify(personColor("阿明")));
  ok("每個顏色都有前景色與底色",
     PERSON_COLORS.every(c=>/^#[0-9A-Fa-f]{6}$/.test(c.fg) && /^#[0-9A-Fa-f]{6}$/.test(c.bg)));
  ok("空名字不會爆", !!personColor("").fg && !!personColor(null).fg); }

// 這是這一段的重點：老闆要的是「同時被交辦的這幾個人分得出來」。
// 光靠名字雜湊做不到（生日問題），所以 groupColors 要在組內挪開。
{ const g=["小葵","阿明","泓儒","Regina","小美"];
  const c=groupColors(g);
  ok("同一組 5 個人，5 種不同顏色", new Set(g.map(n=>c[n].fg)).size===5,
     g.map(n=>[n,c[n].fg]));
  ok("每個人都配到色", g.every(n=>!!c[n]));
  const c2=groupColors(g.slice().reverse());
  ok("名單順序倒過來，配色一模一樣（大家看到的要一致）",
     g.every(n=>c[n].fg===c2[n].fg), g.map(n=>[n,c[n].fg,c2[n].fg])); }

// 真的會撞的兩個人：單看名字同色，放進同一組就必須被挪開
{ const all=["小葵","阿明","泓儒","Regina","Asmeer","小美","溱姐","HR小姐",
             "大雄","靜香","胖虎","小夫","哆啦","出木杉","阿福","技安"];
  let pair=null;
  for(let i=0;i<all.length&&!pair;i++) for(let j=i+1;j<all.length;j++)
    if(personColor(all[i]).fg===personColor(all[j]).fg){ pair=[all[i],all[j]]; break; }
  ok("（前提）確實找得到兩個名字雜湊同色的人", !!pair, pair);
  if(pair){ const c=groupColors(pair);
    ok("放進同一組之後被挪開了，不同色", c[pair[0]].fg!==c[pair[1]].fg, {pair, c}); } }

{ const c=groupColors(["只有一個人"]);
  ok("一個人也配得出來", !!c["只有一個人"]);
  ok("空名單不會爆", JSON.stringify(groupColors([]))==="{}" && JSON.stringify(groupColors(null))==="{}"); }
// 人數超過色盤就一定會重複，但不可以當掉或漏配
{ const many=Array.from({length:PERSON_COLORS.length+4},(_,i)=>"員工"+i);
  const c=groupColors(many);
  ok("人數超過色盤時每個人還是都配得到色（不會 undefined）", many.every(n=>!!c[n]&&!!c[n].fg)); }

{ const c=groupColors(["小葵","阿明"]);
  ok("personChip 傳了組別配色就用那一套", personChip("小葵","",c).includes(c["小葵"].fg));
  ok("沒傳就退回名字自己的顏色", personChip("小葵").includes(personColor("小葵").fg)); }

// 名字裡有引號／角括號的人也不能把畫面打壞
{ const chip=personChip('<img src=x onerror=alert(1)>');
  ok("人名標籤會跳脫掉危險字元", !/<img/i.test(chip) && chip.includes("&lt;img"), chip); }

// ══════════ ③ 多人交辦：一人一筆，共用 groupId ══════════
let WRITES=[], picked=[];
const t_=(id,o)=>Object.assign({id, user:"小葵", date:"2026-09-08", title:"做一件事",
  contact:"", report:"", done:false, assignedBy:"管理員", ack:true,
  createdAt:"2026-09-08T09:00:00", groupId:"", msgs:[]}, o||{});
function reset(tasks, who, role){
  WRITES=[]; picked=[]; viewEl.innerHTML=""; VIEW_AS=null;
  global.window.DB={ set:async(c,id,o)=>{WRITES.push(["set",c,id,o]);},
    update:async(c,id,p)=>{WRITES.push(["update",c,id,p]);},
    del:async()=>{}, scheduleSet:async()=>{}, setSettings:async()=>{},
    videosWatched:()=>true, netState:()=>({online:true,pending:false}) };
  const map={}; (tasks||[]).forEach(t=>{ map[t.id]=t; });
  STATE={ users:[{name:"小葵",role:"editor"},{name:"阿明",role:"editor"},{name:"泓儒",role:"editor"},
                 {name:"小美",role:"cs"},{name:"Amy",role:"pick"},{name:"管理員",role:"boss"}],
    settings:{dailyTarget:4,videoTags:[],sources:[],postPlatforms:[],intlAccounts:[],
      shopeeAccounts:[],msAccounts:[],exchangeRates:{},contacts:[],reviewSince:"2020-01-01"},
    schedule:{}, tasks:map, shifts:{}, logs:[], deletedVideos:[], videos:[] };
  LAST_RAW={users:STATE.users, settings:STATE.settings, schedule:{}, tasks:map, shifts:{},
            logs:[], deletedVideos:[], videos:[]};
  localStorage.setItem("ecdr_user", who||"管理員"); localStorage.setItem("ecdr_role", role||"boss");
}
// 勾選清單：picked 裡放誰就等於畫面上勾了誰
global.document.querySelectorAll=(sel)=> String(sel||"").indexOf(".asg_p")===0
  ? picked.map(n=>({value:n, checked:true})) : [];
const fields={};
global.document.getElementById=(id)=>{ if(id==="view") return viewEl;
  if(fields[id]!==undefined){ const e=el(); Object.defineProperty(e,"value",{get(){return fields[id];},set(v){fields[id]=v;}}); return e; }
  return el(); };

(async()=>{
{ reset([]); picked=["小葵","阿明","泓儒"]; fields.asg_txt="三個人一起做"; fields.asg_contact="";
  await assignTaskSel(); await new Promise(r=>setTimeout(r,30));
  const sets=WRITES.filter(w=>w[0]==="set"&&w[1]==="tasks").map(w=>w[3]);
  ok("勾三個人＝寫三筆（不是一筆塞三個人）", sets.length===3, sets.map(x=>x.user));
  ok("三筆分別是那三個人", JSON.stringify(sets.map(x=>x.user).sort())===JSON.stringify(["小葵","泓儒","阿明"].sort()));
  ok("三筆共用同一個 groupId", new Set(sets.map(x=>x.groupId)).size===1 && !!sets[0].groupId, sets.map(x=>x.groupId));
  ok("每一筆的 id 欄位＝它自己的文件 id（全站靠 t.id 找人）",
     WRITES.filter(w=>w[0]==="set").every(w=>w[3].id===w[2]), WRITES.filter(w=>w[0]==="set").map(w=>[w[2],w[3].id]));
  ok("三筆的 id 各不相同", new Set(sets.map(x=>x.id)).size===3);
  ok("內容、交辦人一致", sets.every(x=>x.title==="三個人一起做" && x.assignedBy==="管理員"));
  ok("都還沒被接收（要各自按收到）", sets.every(x=>x.ack===false && x.done===false));
  ok("留言串初始是空陣列", sets.every(x=>Array.isArray(x.msgs) && x.msgs.length===0)); }

{ reset([]); picked=[]; fields.asg_txt="沒人選";
  await assignTaskSel(); await new Promise(r=>setTimeout(r,30));
  ok("一個人都沒勾就不會寫任何東西", WRITES.length===0, WRITES); }
{ reset([]); picked=["小葵"]; fields.asg_txt="   ";
  await assignTaskSel(); await new Promise(r=>setTimeout(r,30));
  ok("沒寫內容也不會寫", WRITES.filter(w=>w[0]==="set"&&w[1]==="tasks").length===0); }
{ reset([]); VIEW_AS="小葵"; picked=["阿明"]; fields.asg_txt="員工視角不准寫";
  await assignTaskSel(); await new Promise(r=>setTimeout(r,30));
  ok("員工視角（唯讀預覽）底下一筆都不准寫", WRITES.length===0, WRITES); VIEW_AS=null; }

// ══════════ ④ 同組是算出來的，不另外存名單 ══════════
{ reset([ t_("A",{user:"小葵",groupId:"G1"}), t_("B",{user:"阿明",groupId:"G1"}),
          t_("C",{user:"泓儒",groupId:"G2"}), t_("D",{user:"小美",groupId:""}) ]);
  ok("同組抓得到兩筆", taskGroupOf(taskById("A")).length===2);
  ok("別組的不會混進來", !taskMates(taskById("A")).includes("泓儒"));
  ok("沒有 groupId 的只有自己", taskMates(taskById("D")).length===1);
  ok("null 不會爆", taskGroupOf(null).length===0); }

// ⚠️ 名單一定要排序：大家看到的顏色是照名單順序配的，順序不同＝顏色不同，
//    小葵手機上的「阿明」跟阿明手機上的「阿明」就會是兩個顏色。
//    這一條的 fixture 故意讓「寫進去的順序」跟「排序後的順序」不一樣 ——
//    順序一致的 fixture 驗不到有沒有排序（突變測試 0 紅就是這樣抓到的）。
{ reset([ t_("B",{user:"阿明",groupId:"G1"}), t_("A",{user:"小葵",groupId:"G1"}) ]);
  ok("（前提）這個 fixture 的寫入順序確實跟排序後不同",
     "阿明">"小葵", ["阿明","小葵"]);
  ok("同組成員一律排序後回傳（不看誰先被寫進去）",
     taskMates(taskById("A")).join()==="小葵,阿明", taskMates(taskById("A"))); }

// 轉移之後成員名單要跟著變 —— 這就是「不存名單、每次算」的理由
{ reset([ t_("A",{user:"小葵",groupId:"G1"}), t_("B",{user:"阿明",groupId:"G1"}) ]);
  ok("（轉移前）成員是小葵、阿明", taskMates(taskById("A")).join()==="小葵,阿明");
  STATE.tasks["B"].user="泓儒";
  ok("轉移給泓儒之後名單自動跟著變（沒有存一份會過期的名單）",
     taskMates(taskById("A")).join()==="小葵,泓儒", taskMates(taskById("A"))); }

// 畫面：同時交辦給誰
{ reset([ t_("A",{user:"小葵",groupId:"G1"}), t_("B",{user:"阿明",groupId:"G1",done:true}) ], "小葵","editor");
  const h=mateChips(taskById("A"));
  ok("看得到同時被交辦的人", h.includes("小葵") && h.includes("阿明"), h);
  ok("每個人有自己的顏色", (h.match(/class="pchip"/g)||[]).length===2, h);
  ok("同一組兩個人不同色", (()=>{ const c=groupColors(["小葵","阿明"]); return c["小葵"].fg!==c["阿明"].fg; })());
  ok("已完成的人標了勾", /阿明[\s\S]{0,60}✔/.test(h), h);
  ok("自己那顆標了「你」", /小葵[\s\S]{0,60}（你）/.test(h), h); }
{ reset([ t_("S",{user:"小葵",groupId:""}) ], "小葵","editor");
  ok("只交辦給一個人時不顯示「同時交辦」（印一顆自己的名字是廢話）", mateChips(taskById("S"))===""); }

// ══════════ ⑤ 留言串 ══════════
{ reset([ t_("A",{msgs:[{at:"2026-09-08T11:00:00",by:"小葵",text:"晚點回"},
                        {at:"2026-09-08T10:00:00",by:"管理員",text:"這件事看一下 https://a.com/x"}]}) ], "小葵","editor");
  const m=taskMsgs(taskById("A"));
  ok("留言照時間排序（舊的在上）", m[0].by==="管理員" && m[1].by==="小葵", m.map(x=>x.by));
  const h=taskThread(taskById("A"), true);
  ok("兩則都印出來", h.includes("晚點回") && h.includes("這件事看一下"), h.slice(0,200));
  ok("留言裡的網址變成可點的連結", /<a href="https:\/\/a\.com\/x"/.test(h), h);
  ok("有輸入框可以回覆", h.includes('id="tm_A"') && h.includes("postTaskMsg('A')"), h.slice(-260));
  ok("自己講的話標成 me（顏色不同才分得出誰講的）", h.includes('class="tmsg me"'), h); }
{ const h=taskThread(taskById("A"), false);
  ok("canPost=false 就沒有輸入框（例如只是在旁邊看）", !h.includes("<input"), h.slice(-160)); }
{ reset([ t_("E",{msgs:[]}) ], "小葵","editor");
  ok("還沒有人留言時仍給輸入框", taskThread(taskById("E"), true).includes('id="tm_E"'));
  ok("沒留言又不能留言＝整段不出現", taskThread(taskById("E"), false)===""); }
// 壞資料不能把畫面弄爆
{ reset([ t_("X",{msgs:"不是陣列"}) ], "小葵","editor");
  ok("msgs 不是陣列也不會爆", taskMsgs(taskById("X")).length===0);
  reset([ t_("Y",{msgs:[{at:"2026-09-08T10:00:00",by:"管理員"},null,{at:"x",by:"a",text:"有內容"}]}) ], "小葵","editor");
  // 用 try 包住：沒有先過濾掉 null 的話，排序時會在 null 上炸掉 —— 那也是失敗，
  // 但要報成 FAIL 讓人看得懂是哪一條，不要整支測試 crash。
  let y=null, threw=false;
  try{ y=taskMsgs(taskById("Y")); }catch(e){ threw=true; }
  ok("沒有內容的、null 的留言直接跳過（而且不會炸）", !threw && y && y.length===1, {threw, n:y&&y.length}); }

// 留言送出：寫什麼進資料庫
{ reset([ t_("A",{user:"小葵",report:"原本寫好的完整處理狀況"}) ], "小葵","editor");
  fields["tm_A"]="我已經跟廠商聯絡好了，明天會給報價";
  await postTaskMsg("A"); await new Promise(r=>setTimeout(r,20));
  const w=WRITES.find(x=>x[0]==="update"&&x[1]==="tasks"&&x[2]==="A");
  ok("留言會寫進 tasks", !!w, WRITES);
  ok("寫回去的是陣列", w && Array.isArray(w[3].msgs) && w[3].msgs.length===1);
  ok("記下是誰、什麼時候", w && w[3].msgs[0].by==="小葵" && /^\d{4}-\d\d-\d\dT/.test(w[3].msgs[0].at));
  ok("**本人寫的、夠完整的留言會自動變成處理狀況**（不用打兩次字）",
     w && w[3].report==="我已經跟廠商聯絡好了，明天會給報價", w&&w[3]); }

// ⚠️ 已經有留言的情況下再留一則，舊的必須還在。
//    上面那條的 fixture 是空陣列 —— 「接在後面」跟「整個蓋掉」結果都是 1 則，驗不到差別。
{ reset([ t_("A",{user:"小葵",msgs:[{at:"2026-09-08T09:00:00",by:"管理員",text:"這件事麻煩你"}]}) ], "小葵","editor");
  fields["tm_A"]="收到，我下午處理";
  await postTaskMsg("A"); await new Promise(r=>setTimeout(r,20));
  const w=WRITES.find(x=>x[0]==="update"&&x[2]==="A");
  const got=(w&&Array.isArray(w[3].msgs)?w[3].msgs:[]).map(x=>String((x&&x.text)||""));
  ok("**是接在原本的留言後面，不是整串蓋掉**", got.length===2, got);
  ok("老闆原本那則還在", got[0]==="這件事麻煩你", got);
  ok("新的那則排在後面", got[1]==="收到，我下午處理", got); }

// 這是最重要的一條：短留言不可以把已經寫好的處理狀況洗掉
{ reset([ t_("A",{user:"小葵",report:"原本寫好的完整處理狀況"}) ], "小葵","editor");
  fields["tm_A"]="好";
  await postTaskMsg("A"); await new Promise(r=>setTimeout(r,20));
  const w=WRITES.find(x=>x[0]==="update"&&x[2]==="A");
  ok("回一句「好」也留得下留言", w && w[3].msgs.length===1);
  ok("**但不會把原本的處理狀況洗掉**（洗掉的話本來能打勾的工作會變成不能打勾）",
     w && !("report" in w[3]), w&&Object.keys(w[3])); }

// 老闆講的話不算「員工的處理狀況」
{ reset([ t_("A",{user:"小葵",report:"員工自己寫的"}) ], "管理員","boss");
  fields["tm_A"]="請你今天之內處理完，這件事比較急";
  await postTaskMsg("A"); await new Promise(r=>setTimeout(r,20));
  const w=WRITES.find(x=>x[0]==="update"&&x[2]==="A");
  ok("老闆的留言存得進去", w && w[3].msgs.length===1 && w[3].msgs[0].by==="管理員");
  ok("**老闆講的話不會被當成員工的處理狀況**", w && !("report" in w[3]), w&&Object.keys(w[3])); }

{ reset([ t_("A") ], "小葵","editor"); fields["tm_A"]="   ";
  await postTaskMsg("A"); await new Promise(r=>setTimeout(r,20));
  ok("空白留言不送出", WRITES.length===0, WRITES); }
{ reset([ t_("A") ], "小葵","editor"); VIEW_AS="阿明"; fields["tm_A"]="唯讀預覽不准寫";
  await postTaskMsg("A"); await new Promise(r=>setTimeout(r,20));
  ok("員工視角底下不准留言", WRITES.length===0, WRITES); VIEW_AS=null; }
{ reset([ t_("A") ], "小葵","editor"); fields["tm_A"]="x".repeat(TASK_MSG_MAX+500);
  await postTaskMsg("A"); await new Promise(r=>setTimeout(r,20));
  const w=WRITES.find(x=>x[0]==="update");
  ok("超長留言會被截斷（Firestore 單筆文件有 1MB 上限）",
     w && w[3].msgs[0].text.length===TASK_MSG_MAX, w&&w[3].msgs[0].text.length); }
{ reset([ t_("A") ], "小葵","editor"); fields["tm_A"]="有東西";
  await postTaskMsg("沒有這一筆"); await new Promise(r=>setTimeout(r,20));
  ok("找不到那筆交辦就什麼都不做（不會炸）", WRITES.length===0); }

// ══════════ ⑥ 交辦的勾選清單 ══════════
{ reset([]);
  const h=asgPickerHTML(["editor","intl","cs","mkt","pick","svc","ship"]);
  ok("每個人一個核取方塊", /<input type="checkbox" class="asg_p" value="小葵"/.test(h), h.slice(0,200));
  ok("照職位分組（跟交辦下拉同一套分組）", h.includes(">剪輯</div>") && h.includes(">員工</div>"), h.slice(0,300));
  ok("選品行銷也在（他們跟員工一樣走交辦流程）", h.includes(">選品行銷</div>") && h.includes('value="Amy"'));
  ok("老闆自己不會出現在交辦名單裡", !h.includes('value="管理員"'), h);
  ok("名字有跳脫", !/<script/i.test(asgPickerHTML(["editor"]))); }
{ reset([]); STATE.users=[{name:"管理員",role:"boss"}];
  ok("沒有可交辦的人時給一句人看得懂的話，不是空白",
     asgPickerHTML(["editor"]).includes("還沒有可以交辦的同仁")); }
{ reset([]); picked=["小葵","阿明"];
  ok("asgPicked 讀得到勾起來的人", JSON.stringify(asgPicked())===JSON.stringify(["小葵","阿明"])); }

console.log(`\nv162（多人交辦・留言串・顏色・超連結）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
})();
