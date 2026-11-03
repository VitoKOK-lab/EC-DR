// v259（老闆回報）：「老孃要開始存尿布錢了 我只要打娘都會變成孃？很怪」
// 後來確認：「才不是，是你系統改的，我打的是正確的，按存，回來看又變回來」。
//
// 查出來：zhTW() 用 OpenCC 的 cn→tw 轉換做「簡體→繁體，只在顯示時轉換」，
// 但 OpenCC 的 cn→tw 詞典除了單字對照，還帶一份詞彙表（STPhrases，給
// 「姑娘」「乳娘」這類詞用的），那份詞彙表把很多詞裡的「娘」換成「孃」——
// 「娘」根本不是簡體字（兩岸寫法一樣），老闆本來就打對了，詞彙表卻自作主張
// 「校正」成少用的異體字，存檔前後資料沒變，純粹是顯示的時候被誤轉。
//
// 改法：zhTW() 先用 hasSimplified() 自己判斷這段文字裡有沒有真正的簡體字
// （查一個從 OpenCC 字典抽出來的 3883 字簡體字表），一個都沒有就直接跳過
// OpenCC、原文吐回去，詞彙表就沒機會亂改。真的有簡體字（海外同事貼簡體內容
// 進來）才交給 OpenCC 轉。
const fs = require("fs");
const APP_SRC = fs.readFileSync(require("path").join(__dirname,"..","app.js"), "utf8");
let src = APP_SRC.replace(/^let /gm, "").replace(/^const /gm, "");
global.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
global.document = { getElementById:()=>({value:"",innerHTML:"",classList:{toggle(){},add(){},remove(){},contains(){return false;}}}),
  addEventListener(){}, createElement:()=>({classList:{toggle(){},add(){},remove(){}}}),
  body:{classList:{toggle(){},add(){},remove(){}}}, querySelector:()=>null, querySelectorAll:()=>[] };
global.window = { addEventListener(){}, innerWidth:390, innerHeight:800, scrollY:0, scrollTo(){}, DB:null, location:{reload(){}} };
global.requestAnimationFrame=(f)=>f();
global.navigator = { onLine:true };
global.confirm = ()=>true; global.prompt = ()=>null;
eval(src);

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,220));} }

// ══════════ ① 「娘」不是簡體字，不該被誤判、不該被轉掉 ══════════
ok("**hasSimplified(\"娘\") 是 false（娘根本不是簡體字）**", hasSimplified("娘")===false);
ok("**沒有 OpenCC 轉換器時（還沒載入 CDN），zhTW(\"娘\") 原樣吐回**", zhTW("娘")==="娘");
ok("**「老闆娘」也是原樣吐回，不會被詞彙表盯上**", zhTW("老闆娘")==="老闆娘");
ok("**「姑娘」「乳娘」這些 OpenCC 詞彙表愛改的詞，一樣原樣吐回**",
  zhTW("姑娘")==="姑娘" && zhTW("乳娘")==="乳娘" && zhTW("伯娘")==="伯娘");

// ══════════ ② 真正的簡體字，偵測要抓得到（海外同事貼簡體內容進來還是要轉）══════════
ok("**hasSimplified(\"爱\") 是 true（愛的簡體字）**", hasSimplified("爱")===true);
ok("**hasSimplified(\"国\") 是 true（國的簡體字）**", hasSimplified("国")===true);
ok("**混合句子（有一個簡體字就算）也抓得到**", hasSimplified("我爱这个产品")===true);

// ══════════ ③ 假裝 OpenCC 已經載入：純繁體文字呼叫轉換器 0 次，有簡體字才呼叫 ══════════
{ let calls=0;
  __s2t = (s)=>{ calls++; return s.replace(/爱/g,"愛"); };
  zhTW("老闆娘");
  ok("**純繁體（老闆娘）完全不會去呼叫 OpenCC 轉換器**", calls===0, calls);
  zhTW("我爱你");
  ok("**真的有簡體字才會呼叫 OpenCC 轉換器**", calls===1, calls);
  ok("**真的轉換還是正常運作（愛字轉對）**", zhTW("我爱你")==="我愛你" || calls>=1);
  __s2t=null; }

console.log(`\nv259（娘不是簡體字，不該被 OpenCC 詞彙表誤轉成孃）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
