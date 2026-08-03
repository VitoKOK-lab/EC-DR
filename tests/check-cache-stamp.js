#!/usr/bin/env node
// 破快取版本戳檢查：index.html 的 app.js?v=… / fb.js?v=… 必須等於這兩個檔案內容的雜湊。
//
// 為什麼要這個：GitHub Pages 送 Cache-Control: max-age=600，瀏覽器在那 10 分鐘內
// 連問都不會問，直接用快取。網址沒變 → 改了程式使用者也看不到新的。
// 原本的 ?v=1785586175 是寫死的時間戳，沒有人記得改 —— 從 8/1 到 8/3 改了五輪都沒動過，
// 等於完全沒有防快取的作用。改成內容雜湊之後：程式一改、雜湊就變、網址就變，一定重抓。
//
//   node tests/check-cache-stamp.js         檢查（不一致就 exit 1）
//   node tests/check-cache-stamp.js --fix   直接改好 index.html
const fs=require("fs"), path=require("path"), crypto=require("crypto");
const root=path.join(__dirname,"..");
const HTML=path.join(root,"index.html");
const ASSETS=["app.js","fb.js"];

// 兩個檔案一起算一個雜湊：改任何一個都要重抓（fb.js 換了 app.js 也可能要跟著）
function stamp(){
  const h=crypto.createHash("sha256");
  ASSETS.forEach(f=>h.update(fs.readFileSync(path.join(root,f))));
  return h.digest("hex").slice(0,12);
}
const want=stamp();
let html=fs.readFileSync(HTML,"utf8");
const found=ASSETS.map(f=>{
  const m=html.match(new RegExp(f.replace(".","\\.")+"\\?v=([^\"']*)"));
  return {f, v:m?m[1]:null};
});

if(process.argv.includes("--fix")){
  ASSETS.forEach(f=>{
    html=html.replace(new RegExp(f.replace(".","\\.")+"\\?v=[^\"']*"), f+"?v="+want);
  });
  fs.writeFileSync(HTML, html);
  console.log("已更新版本戳 →", want);
  process.exit(0);
}

const bad=found.filter(x=>x.v!==want);
if(!bad.length){ console.log("版本戳一致："+want); process.exit(0); }
console.log("破快取版本戳過期了：");
bad.forEach(x=>console.log(`  ${x.f}?v=${x.v===null?"(找不到)":x.v}  應該是  ${want}`));
console.log("\n改了 app.js／fb.js 就要更新 index.html 的 ?v=，不然使用者的瀏覽器會繼續跑舊的程式。");
console.log("執行：node tests/check-cache-stamp.js --fix");
process.exit(1);
