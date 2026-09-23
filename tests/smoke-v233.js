// v233：月排程「清單」模式，手機版再簡化——老闆傳手機截圖，紅筆把整段警示
// 藥丸、改時間鍵都圈掉，寫「原片名XXXXX／短文案XXXXX」：
//
// 「用手機看的時候，我要簡化看清楚，只for手機介面，給我『原片名一條，短文案
//   一條』寫的滿，不要換行，超過一行的就…，其他的資訊不用顯示」
//
// 三件事，而且**只在手機（≤600px）動**，桌機／列印都不改：
//   ① 編號（cl-code）藏起來。
//   ② 原始片名（cl-rawt）跟貼文文案（cl-t，v232 已經做過）一樣單行、超過刪節號。
//   ③ 改時間鍵、警示藥丸（還沒剪好／缺上片連結／缺商品…）通通藏起來。
const fs=require("fs"), path=require("path");
const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,260));} }

// 抓媒體查詢要用大括號配對，CSS 裡有巢狀大括號，正規式硬切會斷在第一個 } 上
function mediaBlocks(css, cond){
  const out=[]; let i=0;
  while((i=css.indexOf(cond, i))>=0){
    let j=css.indexOf("{", i); if(j<0) break;
    let depth=0, k=j;
    for(; k<css.length; k++){ if(css[k]==="{") depth++; else if(css[k]==="}"){ depth--; if(!depth) break; } }
    out.push(css.slice(j, k+1)); i=k+1;
  }
  return out;
}
const mob=mediaBlocks(HTML, "@media(max-width:600px)").join("");
const rest=(()=>{ let r=HTML;
  mediaBlocks(HTML,"@media(max-width:600px)").forEach(b=>{ r=r.replace(b,""); });
  return r; })();

// ══════════ ① 編號在手機上藏起來 ══════════
{ ok("**手機上編號（cl-code）藏起來**", /table\.callist \.cl-code\{display:none\}/.test(mob), mob.match(/table\.callist \.cl-code\{[^}]*\}/));
  ok("桌機／列印沒有動到編號的顯示規則", !/\.cl-code\{[^}]*display:none/.test(rest), rest.match(/\.cl-code\{[^}]*\}/g)); }

// ══════════ ② 原始片名手機上也單行省略號（跟貼文文案一樣） ══════════
{ ok("**手機上原始片名單行省略號**",
     /table\.callist td \.cl-rawt\{[^}]*white-space:nowrap/.test(mob)
     && /table\.callist td \.cl-rawt\{[^}]*text-overflow:ellipsis/.test(mob),
     mob.match(/table\.callist td \.cl-rawt\{[^}]*\}/));
  ok("桌機／列印的原始片名還是可以換行（老闆只要求手機）",
     !/\.cl-rawt\{[^}]*nowrap/.test(rest), rest.match(/\.cl-rawt\{[^}]*\}/g)); }

// ══════════ ③ 改時間鍵、警示藥丸在手機上藏起來 ══════════
{ ok("**手機上「改時間」鍵藏起來**", /table\.callist td button\{display:none\}/.test(mob), mob.match(/table\.callist td button\{[^}]*\}/));
  ok("**手機上警示藥丸（misspill／pill）藏起來**",
     /table\.callist td \.misspill[^{]*\.pill\{display:none\}|table\.callist td \.pill\{display:none\}/.test(mob), mob.match(/table\.callist td[^{]*(?:misspill|pill)[^{]*\{[^}]*\}/g));
  ok("桌機／列印沒有把按鈕藏起來（改時間鍵在那邊照樣要能按）",
     !/table\.callist td button\{display:none\}/.test(rest)); }

console.log(`\nv233（月排程清單：手機再簡化，只留原片名＋短文案）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
