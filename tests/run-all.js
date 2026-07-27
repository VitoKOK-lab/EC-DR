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
try {
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

// 介面語言洩漏掃描：輸出「(無洩漏)」才算過
try {
  const out = execFileSync(process.execPath, [path.join(dir, "audit-lang.js")], { encoding: "utf8" });
  if (/總計:\s*0\s*處/.test(out)) console.log("PASS  audit-lang.js（中英介面無洩漏）");
  else { console.log("FAIL  audit-lang.js\n" + out); failed.push("audit-lang.js"); }
} catch (e) {
  console.log("FAIL  audit-lang.js（執行失敗）"); failed.push("audit-lang.js");
}

console.log(`\n${suites.length + 2 - failed.length} / ${suites.length + 2} 通過`);
if (failed.length) { console.log("失敗：" + failed.join(", ")); process.exit(1); }
