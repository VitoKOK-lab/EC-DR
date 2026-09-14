#!/usr/bin/env node
// 一次跑完所有離線煙霧測試：node tests/run-all.js
// 每一支 smoke-*.js 都用假的 document/localStorage eval 進 app.js，驗證各角色畫面與流程邏輯。
// 另外跑 audit-lang.js（中英介面洩漏掃描，0 處才算過）。
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const dir = __dirname;
const suites = fs.readdirSync(dir).filter(f => /^smoke-.*\.js$/.test(f)).sort();

// 語法檢查（放最前面，壞掉就不用往下跑了）
let failed = [];
// 獨立檢查跑了幾支 —— 每一個 try 開頭自己加一，加新檢查不會忘記（見檔案末尾）
let extras = 0;
try {
  extras++;
  execFileSync(process.execPath, ["--check", path.join(dir, "..", "app.js")], { stdio: "pipe" });
  console.log("PASS  node --check app.js");
} catch (e) {
  console.log("FAIL  node --check app.js\n" + String(e.stdout || "") + String(e.stderr || ""));
  failed.push("node --check");
}

for (const f of suites) {
  try {
    execFileSync(process.execPath, [path.join(dir, f)], { stdio: "pipe" });
    console.log("PASS  " + f);
  } catch (e) {
    const out = String(e.stdout || "") + String(e.stderr || "");
    console.log("FAIL  " + f);
    out.split("\n").filter(l => l.startsWith("FAIL")).forEach(l => console.log("        " + l));
    failed.push(f);
  }
}

// 集合清單一致性：程式用到的集合，安全規則與備份清單都要涵蓋到
try {
  extras++;
  execFileSync(process.execPath, [path.join(dir, "audit-collections.js")], { stdio: "pipe" });
  console.log("PASS  audit-collections.js（集合在規則與備份清單都有涵蓋）");
} catch (e) {
  const out = String(e.stdout || "") + String(e.stderr || "");
  console.log("FAIL  audit-collections.js");
  out.split("\n").filter(l => l.startsWith("FAIL") || l.startsWith("        →")).forEach(l => console.log("        " + l));
  failed.push("audit-collections.js");
}

// 貼文↔影片比對（v198）：平台成效要靠它對回影片，對錯了比沒資料還糟。
// 這支是 Python，因為同步腳本跟備份一樣跑在 Mac mini 上、共用 tools/_fs.py。
// ubuntu-latest 與 macOS 都內建 python3；找不到就是環境壞了，要紅、不能靜靜跳過。
try {
  extras++;
  execFileSync("python3", [path.join(dir, "meta-match.py")], { stdio: "pipe" });
  console.log("PASS  meta-match.py（貼文對回影片的比對規則）");
} catch (e) {
  const out = String(e.stdout || "") + String(e.stderr || "");
  console.log("FAIL  meta-match.py");
  out.split("\n").filter(l => l.startsWith("FAIL")).forEach(l => console.log("        " + l));
  failed.push("meta-match.py");
}

// 「未建檔」那張清單的排名次規則（v211）。老闆：「我們要的是他的成效好就可以上去。」
// 以前是照留言排、先砍成 200 筆、才去問觀看數 —— 成效好但留言少的片在還沒有人
// 知道它多紅之前就被砍掉了。這支盯著那個順序不准再顛倒回去。
try {
  extras++;
  execFileSync("python3", [path.join(dir, "meta-unfiled.py")], { stdio: "pipe" });
  console.log("PASS  meta-unfiled.py（未建檔清單照成效排名次）");
} catch (e) {
  const out = String(e.stdout || "") + String(e.stderr || "");
  console.log("FAIL  meta-unfiled.py");
  out.split("\n").filter(l => l.startsWith("FAIL")).forEach(l => console.log("        " + l));
  failed.push("meta-unfiled.py");
}

// 排程跑之前自己更新程式（v211）。這支會動到 Mac mini 上的 git，
// 寫錯了會吃掉老闆沒存的東西 —— 所以它**真的開 git 倉庫**來測，不是比對字串。
try {
  extras++;
  execFileSync(process.execPath, [path.join(dir, "pull-main.js")], { stdio: "pipe" });
  console.log("PASS  pull-main.js（排程跑之前自己更新程式）");
} catch (e) {
  const out = String(e.stdout || "") + String(e.stderr || "");
  console.log("FAIL  pull-main.js");
  out.split("\n").filter(l => l.startsWith("FAIL")).forEach(l => console.log("        " + l));
  failed.push("pull-main.js");
}

// Shopline 商品頁的解析與把關（Cloudflare 那段程式）。
// 樣本是真實頁面抽出來的片段，**不打網路** —— 官網改版時這支會變紅，
// 而不是等設計師回報「抓不到」。
try {
  extras++;
  execFileSync(process.execPath, [path.join(dir, "shopline-parse.mjs")], { stdio: "pipe" });
  console.log("PASS  shopline-parse.mjs（商品頁解析與只准抓自己官網）");
} catch (e) {
  const out = String(e.stdout || "") + String(e.stderr || "");
  console.log("FAIL  shopline-parse.mjs");
  out.split("\n").filter(l => l.startsWith("FAIL")).forEach(l => console.log("        " + l));
  failed.push("shopline-parse.mjs");
}

// 介面語言洩漏掃描：輸出「(無洩漏)」才算過
try {
  extras++;
  const out = execFileSync(process.execPath, [path.join(dir, "audit-lang.js")], { encoding: "utf8" });
  if (/總計:\s*0\s*處/.test(out)) console.log("PASS  audit-lang.js（中英介面無洩漏）");
  else { console.log("FAIL  audit-lang.js\n" + out); failed.push("audit-lang.js"); }
} catch (e) {
  console.log("FAIL  audit-lang.js（執行失敗）"); failed.push("audit-lang.js");
}

// 破快取版本戳：改了 app.js／fb.js 就一定要換 index.html 的 ?v=，
// 不然使用者的瀏覽器會繼續跑舊的程式（GitHub Pages 是 max-age=600）
try {
  extras++;
  execFileSync(process.execPath, [path.join(dir, "check-cache-stamp.js")], { stdio: "pipe" });
  console.log("PASS  check-cache-stamp.js（破快取版本戳是最新的）");
} catch (e) {
  console.log("FAIL  check-cache-stamp.js\n" + String(e.stdout || "") + String(e.stderr || ""));
  failed.push("check-cache-stamp.js");
}

// suites 之外的獨立檢查。
// ⚠️ 這個數字以前是寫死的，加了檢查沒人記得改 —— 2026-09-14 發現它停在 5，
//    但實際上已經有 7 支（shopline-parse 加進來的時候就沒跟著加）。
//    總數少報不會讓測試變紅（失敗照樣擋得住），但**老闆看的就是那個數字**，
//    「149 / 149 全綠」裡少算兩支等於少講兩句話。
//    改成用實際跑過的支數算 —— 以後再加檢查也不會漏。
console.log(`\n${suites.length + extras - failed.length} / ${suites.length + extras} 通過`);
if (failed.length) { console.log("失敗：" + failed.join(", ")); process.exit(1); }
