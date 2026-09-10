#!/usr/bin/env node
// =============================================================================
// 集合清單一致性檢查
//
// 「程式用到的集合」必須同時出現在另外兩個地方，少一個都會出事：
//
//   ① firebase/firestore.rules  沒列到 → 上線後那個集合的讀寫**默默失敗**，
//                                畫面只顯示「更新失敗，請稍後再試」，很難查
//   ② tools/_fs.py COLLECTIONS  沒列到 → 那個集合**不會被備份**，
//                                而且是靜悄悄地不備份，出事才發現沒有
//
// Firestore 的 listCollectionIds 只給 admin 憑證用（用戶端會拿到 403），
// 所以那兩份清單只能人工維護。這支測試就是那個「人工」的保險。
//
// 新增集合時的正確做法：
//   1. 程式裡照常用 collection(db, "新名字")
//   2. firebase/firestore.rules 加一段 match /新名字/{id} { … }
//   3. tools/_fs.py 的 COLLECTIONS 加一行
//   4. 跑 node tests/run-all.js 確認變綠
// =============================================================================

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
let fails = 0;
const ok = (m) => console.log("PASS: " + m);
const bad = (m) => { console.log("FAIL: " + m); fails++; };

function read(rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

// --- ① 程式實際用到哪些集合 ------------------------------------------------
function collectionsUsedInCode() {
  const found = new Set();
  for (const f of ["fb.js", "app.js"]) {
    const src = read(f);
    if (!src) continue;
    const pats = [
      /collection\(\s*db\s*,\s*["']([a-zA-Z][a-zA-Z0-9_]*)["']/g,
      /doc\(\s*db\s*,\s*["']([a-zA-Z][a-zA-Z0-9_]*)["']/g,
      /\bDB\.(?:set|update|del)\(\s*["']([a-zA-Z][a-zA-Z0-9_]*)["']/g,
      /\bdb(?:Write|Update|Del|ArrayAdd|ArrayDel)\(\s*["'](?:set|update|del)["']\s*,\s*["']([a-zA-Z][a-zA-Z0-9_]*)["']/g,
      /\bdb(?:Update|Del|ArrayAdd|ArrayDel)\(\s*["']([a-zA-Z][a-zA-Z0-9_]*)["']/g,
    ];
    for (const re of pats) {
      let m;
      while ((m = re.exec(src))) found.add(m[1]);
    }
  }
  return found;
}

// --- ② 安全規則涵蓋哪些集合 ------------------------------------------------
function collectionsInRules() {
  const src = read("firebase/firestore.rules");
  if (src === null) return null;
  const found = new Set();
  const re = /match\s+\/([a-zA-Z][a-zA-Z0-9_]*)\/\{/g;
  let m;
  while ((m = re.exec(src))) found.add(m[1]);
  return found;
}

// 規則裡是否還留著「什麼都放行」的萬用字元
function rulesHaveOpenWildcard() {
  const src = read("firebase/firestore.rules");
  if (src === null) return false;
  // 抓 match /{document=**} 那一段的內容，看它是不是 allow … if false
  const m = src.match(/match\s+\/\{[a-zA-Z]+=\*\*\}\s*\{([^}]*)\}/);
  if (!m) return false;
  return !/allow[^;]*:\s*if\s+false\s*;/.test(m[1]);
}

// --- ③ 備份清單涵蓋哪些集合 ------------------------------------------------
function collectionsInBackup() {
  const src = read("tools/_fs.py");
  if (src === null) return null;
  const block = src.match(/COLLECTIONS\s*=\s*\[([\s\S]*?)\]/);
  if (!block) return new Set();
  const found = new Set();
  const re = /["']([a-zA-Z][a-zA-Z0-9_]*)["']/g;
  let m;
  while ((m = re.exec(block[1]))) found.add(m[1]);
  return found;
}

// --- 比對 -------------------------------------------------------------------
const used = collectionsUsedInCode();
const rules = collectionsInRules();
const backup = collectionsInBackup();

if (used.size === 0) {
  bad("在 fb.js／app.js 裡找不到任何集合名稱 —— 這支檢查大概已經失效，請修它");
} else {
  ok(`程式用到 ${used.size} 個集合：${[...used].sort().join(", ")}`);
}

if (rules === null) {
  bad("找不到 firebase/firestore.rules");
} else if (rulesHaveOpenWildcard()) {
  // 規則還是全開的話，逐集合比對沒有意義（什麼都會過），直接說清楚
  ok("firestore.rules 仍是萬用字元全開，略過逐集合比對");
} else {
  const missing = [...used].filter((c) => !rules.has(c)).sort();
  if (missing.length) {
    bad(
      `這些集合程式有用、但 firestore.rules 沒有授權：${missing.join(", ")}\n` +
      "        → 上線後對它們的讀寫會默默失敗（畫面只顯示「更新失敗」）。\n" +
      "        → 請在 firebase/firestore.rules 補上 match /<名稱>/{id} { … }"
    );
  } else {
    ok(`firestore.rules 涵蓋了全部 ${used.size} 個集合`);
  }
}

if (backup === null) {
  bad("找不到 tools/_fs.py");
} else {
  const missing = [...used].filter((c) => !backup.has(c)).sort();
  if (missing.length) {
    bad(
      `這些集合程式有用、但備份清單沒有列到：${missing.join(", ")}\n` +
      "        → 它們不會被備份，而且是靜悄悄地不備份。\n" +
      "        → 請在 tools/_fs.py 的 COLLECTIONS 補上"
    );
  } else {
    ok(`備份清單涵蓋了全部 ${used.size} 個集合`);
  }
}

// 反向檢查：清單列了但程式早就不用了 —— 不算錯，只是提醒別留垃圾
if (backup && used.size) {
  const stale = [...backup].filter((c) => !used.has(c)).sort();
  if (stale.length) {
    console.log(`NOTE: 備份清單有但程式沒用到：${stale.join(", ")}（可能是舊資料，備份無妨）`);
  }
}

console.log("");
console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
