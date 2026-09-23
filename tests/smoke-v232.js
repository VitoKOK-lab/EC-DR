// v232：月排程清單欄寬 70/30，貼文文案一律單行省略號（顯示＋列印都要）。
//
// 老闆看著清單截圖說：「主要是原始片名的部分要占70%，所以這一個格子欄寬要
// 放大讓我看得比較清楚，影片貼文文案了可以30%就好，而且貼文文案不用顯示
// 所有的名稱只要一行簡稱就好，要看完整名稱點進去看就可以。這個修改包含
// 顯示還有列印的時候都需要」
//
// 三件事：
//   ① 編號／原始片名（cl-rw）：貼文文案（cl-cap，新加的一欄）＝ 70：30。
//      這個比例分的是「扣掉日期欄之後剩下的寬度」，不是整張表——不然
//      108px（日期欄）＋ 70%＋ 30% 會把表格撐出容器，多一條不必要的橫捲軸。
//   ② 貼文文案（.cl-t）改成不分螢幕大小、一律單行省略號——v193 原本只有手機切，
//      桌機不切，這次反過來。
//   ③ 印表機那邊（@media print）跟畫面上看到的一樣：欄寬同一個比例、
//      文案一樣單行省略號，不再強制印出整段（原本的 v227 是為了印全文才
//      刻意蓋回 white-space:normal，現在老闆說印表也要跟畫面一致）。
const fs=require("fs"), path=require("path");
const APP=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const HTML=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");

let pass=0, fail=0;
function ok(n,c,x){ if(c){pass++;console.log("PASS:",n);} else {fail++;console.log("FAIL:",n, x===undefined?"":JSON.stringify(x).slice(0,260));} }

// 抓媒體查詢區塊要用大括號配對，不能用正規式硬切（CSS 裡有巢狀大括號）
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
const printCSS=mediaBlocks(HTML, "@media print").join("");
const mobCSS=mediaBlocks(HTML, "@media(max-width:600px)").join("");
const restCSS=(()=>{ let r=HTML;
  mediaBlocks(HTML,"@media print").forEach(b=>{ r=r.replace(b,""); });
  mediaBlocks(HTML,"@media(max-width:600px)").forEach(b=>{ r=r.replace(b,""); });
  return r; })();

// ══════════ ① colgroup 多了一欄給貼文文案，不是共用沒有名字的那個 <col> ══════════
{ ok("**清單表格的 colgroup 有 cl-cap 這一欄**",
     /<colgroup><col class="cl-cw"><col class="cl-rw"><col class="cl-cap"><\/colgroup>/.test(APP), APP.match(/<colgroup>[^<]*(?:<col[^>]*>)+<\/colgroup>/g)); }

// ══════════ ② 畫面上：cl-rw／cl-cap 是「扣掉日期欄之後」70/30，不是整張表的 70/30 ══════════
{ ok("**cl-rw 是扣掉 108px 之後的 70%（用 calc，不是整張表的 70%）**",
     /table\.callist col\.cl-rw\{width:calc\(\(100% - 108px\) \* \.7\)\}/.test(restCSS), restCSS.match(/table\.callist col\.cl-rw\{[^}]*\}/));
  ok("**cl-cap 是扣掉 108px 之後的 30%**",
     /table\.callist col\.cl-cap\{width:calc\(\(100% - 108px\) \* \.3\)\}/.test(restCSS), restCSS.match(/table\.callist col\.cl-cap\{[^}]*\}/));
  ok("日期欄本身沒有被改動（老闆沒提到要改這一欄）", /table\.callist col\.cl-cw\{width:108px\}/.test(restCSS)); }

// ══════════ ③ 印表：欄寬一樣分 70/30（扣掉日期欄後），三欄加起來剛好 100% ══════════
{ const cw=+((printCSS.match(/table\.callist col\.cl-cw\{width:(\d+)%\}/)||[])[1]||0);
  const rw=+((printCSS.match(/table\.callist col\.cl-rw\{width:(\d+)%\}/)||[])[1]||0);
  const cap=+((printCSS.match(/table\.callist col\.cl-cap\{width:(\d+)%\}/)||[])[1]||0);
  ok("**印表三欄的寬度百分比加起來是 100%**（不會超出紙張，也不會留白）",
     cw+rw+cap===100, {cw,rw,cap});
  ok("**印表的原始片名／貼文文案還是接近 70/30**（扣掉日期欄後的比例）",
     Math.abs(rw/(rw+cap)-0.7)<0.02, {rw,cap,ratio:rw/(rw+cap)}); }

// ══════════ ④ 貼文文案不分螢幕大小、也不分螢幕還是印表，一律單行省略號 ══════════
{ ok("**基本規則（沒有 media query）就有單行省略號**",
     /table\.callist td \.cl-t\{[^}]*white-space:nowrap[^}]*text-overflow:ellipsis/.test(restCSS)
     || /table\.callist td \.cl-t\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/.test(restCSS),
     restCSS.match(/table\.callist td \.cl-t\{[^}]*\}/));
  ok("**印表不再強制展開回整段**（原本 v227 蓋回 white-space:normal 的那行已經拿掉）",
     !/table\.callist td \.cl-t\{[^}]*white-space:normal/.test(printCSS), printCSS.match(/table\.callist td \.cl-t\{[^}]*\}/));
  ok("手機那段不用再自己重複寫一次（已經搬到基本規則，media query 裡只剩欄寬跟字級那些）",
     !/table\.callist td \.cl-t\{/.test(mobCSS), mobCSS.match(/table\.callist td \.cl-t\{[^}]*\}/)); }

console.log(`\nv232（月排程清單：70/30 欄寬＋貼文文案單行省略號）: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
