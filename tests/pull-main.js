#!/usr/bin/env node
// tools/_pull-main.sh 的真實測試：node tests/pull-main.js（run-all.js 會一起跑）
//
// 這支**真的開 git 倉庫**來測，不是比對字串。理由：這支腳本會動到老闆 Mac mini 上的
// git，寫錯了會吃掉他沒存的東西。比對字串測不到「它到底有沒有動到檔案」。
//
// 五種狀況，每一種都要對：
//   updated   停在別的分支（老闆那台就是）→ 換回 main、拿到最新的
//   current   本來就是最新 → 什麼都不做
//   dirty     本機有沒存的改動 → **一個字都不准動**，寧可跑舊程式
//   offline   連不上 GitHub → 照樣跑，但要講
//   nogit     根本不是 git 工作區 → 不要炸
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const SH = path.join(REPO_ROOT, "tools", "_pull-main.sh");
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log("FAIL  " + name + (extra === undefined ? "" : "  " + extra)); }
}

const sh = (cmd, cwd) => execFileSync("bash", ["-c", cmd], { cwd, encoding: "utf8", stdio: "pipe" });
const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" });

// 跑 _pull-main.sh，回傳 {state, note, head, file}
function run(repo) {
  const out = sh(`REPO=${JSON.stringify(repo)} . ${JSON.stringify(SH)}; ` +
                 `echo "__S__$CODE_STATE"; echo "__N__$CODE_NOTE"`, repo);
  const state = (out.match(/__S__(.*)/) || [])[1] || "";
  const note = (out.match(/__N__(.*)/) || [])[1] || "";
  return {
    state: state.trim(), note: note.trim(),
    head: git(["rev-parse", "HEAD"], repo).trim(),
    file: fs.existsSync(path.join(repo, "a.txt")) ? fs.readFileSync(path.join(repo, "a.txt"), "utf8") : null,
  };
}

// 做一組「遠端 ＋ 本機」的假倉庫。遠端的 main 比本機多一個 commit。
function makePair() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "pullmain-"));
  const origin = path.join(base, "origin"), work = path.join(base, "work");
  fs.mkdirSync(origin);
  const G = (a, c) => git(["-c", "user.email=t@t", "-c", "user.name=t", ...a], c);
  G(["init", "--quiet", "--initial-branch=main", "."], origin);
  fs.writeFileSync(path.join(origin, "a.txt"), "第一版\n");
  G(["add", "-A"], origin); G(["commit", "--quiet", "-m", "第一版"], origin);
  git(["clone", "--quiet", origin, work], base);
  const first = git(["rev-parse", "HEAD"], work).trim();
  // 遠端往前走一步
  fs.writeFileSync(path.join(origin, "a.txt"), "第二版\n");
  G(["add", "-A"], origin); G(["commit", "--quiet", "-m", "第二版"], origin);
  const second = git(["rev-parse", "HEAD"], origin).trim();
  return { base, origin, work, first, second, G };
}

// ── ① 停在別的分支（老闆的 Mac mini 就是這個狀況）────────────────────────
// 他停在 claude/* 上，而那條分支我會 force-push —— `git pull` 一定是 divergent，
// 這正是 2026-09-13 與 09-14 連踩兩次的坑。
{
  const p = makePair();
  p.G(["checkout", "--quiet", "-b", "claude/被我force-push過的分支"], p.work);
  fs.writeFileSync(path.join(p.work, "a.txt"), "分支上的版本\n");
  p.G(["add", "-A"], p.work); p.G(["commit", "--quiet", "-m", "分支的 commit"], p.work);
  const r = run(p.work);
  ok("**停在別的分支也拿得到最新的 main**（老闆那台就是這個狀況）", r.state === "updated", r.state + " " + r.note);
  ok("而且真的換到 main 上了", git(["rev-parse", "--abbrev-ref", "HEAD"], p.work).trim() === "main");
  ok("檔案內容真的是最新的（不是只有 git 說換了）", r.file === "第二版\n", JSON.stringify(r.file));
  ok("回報的那句話講得出是更新了", /更新/.test(r.note), r.note);
  fs.rmSync(p.base, { recursive: true, force: true });
}

// ── ② 本來就是最新 ──────────────────────────────────────────────────
{
  const p = makePair();
  p.G(["fetch", "--quiet", "origin", "main"], p.work);
  p.G(["reset", "--hard", "--quiet", "origin/main"], p.work);
  const r = run(p.work);
  ok("已經最新就回報 current", r.state === "current", r.state);
  ok("而且 HEAD 沒有動", r.head === p.second);
}

// ── ③ 本機有沒存的改動 → 一個字都不准動 ───────────────────────────────
// 這一條最重要：寧可跑舊程式，也不能吃掉他的東西。
{
  const p = makePair();
  fs.writeFileSync(path.join(p.work, "a.txt"), "我改到一半還沒存的東西\n");
  const r = run(p.work);
  ok("**有沒存的改動就不更新**（寧可跑舊程式，也不能吃掉他的東西）", r.state === "dirty", r.state);
  ok("**而且他改的內容原封不動**", r.file === "我改到一半還沒存的東西\n", JSON.stringify(r.file));
  ok("HEAD 也沒有動", r.head === p.first);
  ok("回報講得出「跑的是舊的」", /舊/.test(r.note), r.note);
  fs.rmSync(p.base, { recursive: true, force: true });
}

// 未追蹤的檔案不算「沒存的改動」—— git 不會動到它，不該因此擋掉更新
{
  const p = makePair();
  fs.writeFileSync(path.join(p.work, "我自己放的筆記.txt"), "隨手放的\n");
  const r = run(p.work);
  ok("未追蹤的檔案不擋更新（git 本來就不會動到它）", r.state === "updated", r.state);
  ok("而且那個檔案還在", fs.existsSync(path.join(p.work, "我自己放的筆記.txt")));
  fs.rmSync(p.base, { recursive: true, force: true });
}

// ── ④ 連不上 GitHub → 照樣跑，但要講 ──────────────────────────────────
{
  const p = makePair();
  p.G(["remote", "set-url", "origin", path.join(p.base, "這個資料夾不存在")], p.work);
  const r = run(p.work);
  ok("連不上就回報 offline（不是安靜地當成正常）", r.state === "offline", r.state);
  ok("而且 HEAD 沒有動，照舊跑得下去", r.head === p.first);
  ok("回報講得出連不上", /連不上/.test(r.note), r.note);
  fs.rmSync(p.base, { recursive: true, force: true });
}

// ── ⑤ 根本不是 git 工作區 → 不要炸 ────────────────────────────────────
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nogit-"));
  const out = sh(`REPO=${JSON.stringify(d)} . ${JSON.stringify(SH)}; echo "__S__$CODE_STATE"`, d);
  ok("不是 git 工作區也不會炸", /__S__nogit/.test(out), out.trim());
  fs.rmSync(d, { recursive: true, force: true });
}

// ── ⑥ 排程外殼真的有接上去（寫了函式沒人呼叫等於沒寫）──────────────────
{
  const META = fs.readFileSync(path.join(REPO_ROOT, "tools", "meta-scheduled.sh"), "utf8");
  const BK = fs.readFileSync(path.join(REPO_ROOT, "tools", "backup-scheduled.sh"), "utf8");
  ok("成效同步排程跑之前會先更新程式", /\.\s+"\$REPO\/tools\/_pull-main\.sh"/.test(META));
  ok("備份排程也一樣", /\.\s+"\$REPO\/tools\/_pull-main\.sh"/.test(BK));
  // ⚠️ 只更新程式不夠 —— 「跑的是舊程式」要傳下去，才看得到。
  ok("**而且把結果傳給同步程式**（只寫在 log 裡等於沒人看得到）",
     /EC_DR_CODE_STATE="\$CODE_STATE"/.test(META) && /EC_DR_CODE_NOTE="\$CODE_NOTE"/.test(META));
  const SYNC = fs.readFileSync(path.join(REPO_ROOT, "tools", "meta_sync.py"), "utf8");
  ok("同步程式把它寫進回報（畫面才看得到）",
     /EC_DR_CODE_STATE/.test(SYNC) && /info\["code"\]\s*=/.test(SYNC));
  // ⚠️ 要比對**真正呼叫的那一行**，不要比對 "meta_sync.py" 五個字 ——
  //    檔頭的說明裡就有那五個字，比對得到但那不是呼叫。
  ok("更新程式的順序在跑同步之前（跑完才更新等於下次才生效）",
     META.indexOf('. "$REPO/tools/_pull-main.sh"') < META.indexOf("python3 tools/meta_sync.py"),
     META.indexOf('. "$REPO/tools/_pull-main.sh"') + " vs " + META.indexOf("python3 tools/meta_sync.py"));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
