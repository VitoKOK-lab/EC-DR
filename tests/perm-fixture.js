// v207 之前，這些權限是「職位自動帶的」。
//
// 現在職位不帶任何預設 —— 老闆：「不要有人有任何預設的權限，都要可以勾選的。」
// 所有權限一律要在「設定 → 權限」逐人勾起來（管理員本人除外，他是最高權限）。
//
// 底下這幾十支煙霧測試**不是在測權限**：它們要測的是看板、出勤、剪輯成效、
// 分頁長不長得出來……只是當年順手拿「職位」當作「這個人有權限」的捷徑。
// 與其把每一支的假資料都改一遍（改錯一個就是一條假的綠燈），這裡把「以前職位
// 帶什麼」補回那些假資料上，讓每一支繼續專心測它本來要測的東西。
//
// ⚠️ 這一支**只給不是在測權限的測試用**。
//    tests/smoke-v202.js 是權限本身的測試，它絕對不准 require 這個檔 ——
//    用了就等於把「職位不再給預設」這件事測掉了。run-all.js 會擋（見下面的守門）。
const WAS_BY_ROLE = {
  boss:    ["assign", "find", "perf", "output", "attend", "df", "prod", "lead"],
  manager: ["assign", "find", "perf", "df", "prod", "lead"],
  editor:  ["perf", "df"],
  hr:      ["output", "attend", "lead"],
  // intl／cs／mkt／svc／ship／pick 以前就什麼都沒有，不用補
};

// 包住 app.js 裡的 permsOf：原本讀到的 users.perms，再聯集上「以前職位會給的」。
// 用法（放在測試檔 eval(src) 之後一行）：
//   permsOf = require("./perm-fixture").withOldRoleDefaults(permsOf);
function withOldRoleDefaults(orig) {
  return function (u) {
    const own = orig(u);
    const byRole = WAS_BY_ROLE[(u && u.role) || ""] || [];
    return byRole.length ? [...new Set(own.concat(byRole))] : own;
  };
}

module.exports = { WAS_BY_ROLE, withOldRoleDefaults };
