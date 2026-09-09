// ===========================================================================
// Firestore 安全規則測試 —— 42 項
//
// 為什麼獨立於 tests/run-all.js：那組煙霧測試刻意零依賴，CI 直接 node 就能跑。
// 規則測試需要 Firestore 模擬器（Java）與 npm 套件，性質不同，分開放。
//
// 跑法：
//   npm install --no-save firebase-tools @firebase/rules-unit-testing firebase
//   npx firebase emulators:exec --only firestore --project demo-ecdr \\
//       "node firebase/rules.test.mjs"
//
// 改規則前後都要跑。A 組任何一項失敗＝規則會弄壞正在運作的系統。
// ===========================================================================

import fs from 'fs';
import { initializeTestEnvironment, assertFails, assertSucceeds }
  from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, collection, getDocs,
         query, where, orderBy, limit,
         arrayUnion, arrayRemove, increment } from 'firebase/firestore';

const RULES_PATH = new URL('./firestore.rules', import.meta.url).pathname;
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [host, port] = HOST.split(':');

const env = await initializeTestEnvironment({
  projectId: 'demo-ecdr',
  firestore: { rules: fs.readFileSync(RULES_PATH, 'utf8'), host, port: Number(port) }
});

// 匿名登入的使用者 —— 既是系統裡的每一位同仁，也是網路上的任何一個陌生人。
// 這兩者在目前的登入機制下，規則完全分辨不出來（要分辨得等改成 Google 登入）。
const anon  = env.authenticatedContext('anon-uid-123').firestore();
const guest = env.unauthenticatedContext().firestore();

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const d = ctx.firestore();
    await setDoc(doc(d,'videos','V-live'),    { id:'V-live', name:'正常影片', stage:'已完成', totalUsed:2, usageHistory:[] });
    await setDoc(doc(d,'videos','V-trashed'), { id:'V-trashed', name:'回收桶影片', deleted:true });
    await setDoc(doc(d,'videos','V-old'),     { id:'V-old', name:'沒有 deleted 欄位的舊資料' });
    await setDoc(doc(d,'logs','L-1'),         { id:'L-1', at:'2026-09-01T00:00:00', action:'測試', user:'冠廷' });
    await setDoc(doc(d,'meta','settings'),    { schemaVersion:16, adminPwHash:'x', contacts:['A'], videoTags:['寵粉'] });
    await setDoc(doc(d,'schedule','2026-09-09'), { slots:[] });
    await setDoc(doc(d,'shifts','S-1'),       { id:'S-1', user:'健加', date:'2026-09-01', clockIn:'09:00' });
    await setDoc(doc(d,'users','冠廷'),        { name:'冠廷', role:'editor' });
    await setDoc(doc(d,'tasks','T-1'),        { id:'T-1', title:'交辦' });
    await setDoc(doc(d,'products','P-1'),     { id:'P-1', name:'商品' });
    await setDoc(doc(d,'matches','M-1'),      { id:'M-1', productId:'P-1' });
  });
}
await seed();

let pass = 0, fail = 0; const results = [];
async function check(group, label, shouldPass, fn) {
  try {
    await (shouldPass ? assertSucceeds(fn()) : assertFails(fn()));
    pass++; results.push([group, label, shouldPass, '\u2705']);
  } catch (e) {
    fail++; results.push([group, label, shouldPass, '\u274c ' + String(e.message).slice(0,70)]);
  }
}

// ═══ A. app 的正常操作 —— 全部必須成功，否則系統會壞掉 ═══
const A = 'A・系統正常操作（必須全部允許）';
await check(A,'讀取影片庫', true, ()=> getDocs(collection(anon,'videos')));
await check(A,'新增影片', true, ()=> setDoc(doc(anon,'videos','V-new'), {id:'V-new', name:'新片'}));
await check(A,'修改影片', true, ()=> updateDoc(doc(anon,'videos','V-live'), {stage:'已上片'}));
await check(A,'軟刪除影片進回收桶', true, ()=> updateDoc(doc(anon,'videos','V-live'), {deleted:true, deletedBy:'冠廷'}));
await check(A,'從回收桶永久刪除', true, ()=> deleteDoc(doc(anon,'videos','V-trashed')));
await check(A,'還原回收桶影片', true, ()=> updateDoc(doc(anon,'videos','V-old'), {deleted:false}));
await check(A,'寫入操作紀錄', true, ()=> setDoc(doc(anon,'logs','L-new'), {id:'L-new', action:'新增影片'}));
await check(A,'讀取操作紀錄', true, ()=> getDocs(collection(anon,'logs')));
await check(A,'更新系統設定(merge)', true, ()=> setDoc(doc(anon,'meta','settings'), {videoTags:['寵粉']}, {merge:true}));
await check(A,'覆寫某天排程', true, ()=> setDoc(doc(anon,'schedule','2026-09-09'), {slots:[{t:'10:00'}]}));
await check(A,'新增排程日', true, ()=> setDoc(doc(anon,'schedule','2026-09-10'), {slots:[]}));
await check(A,'打卡上班', true, ()=> setDoc(doc(anon,'shifts','S-2'), {id:'S-2', user:'鴻閔', clockIn:'09:05'}));
await check(A,'補打卡下班', true, ()=> updateDoc(doc(anon,'shifts','S-1'), {clockOut:'18:00'}));
await check(A,'新增成員', true, ()=> setDoc(doc(anon,'users','怡如'), {name:'怡如'}));
await check(A,'刪除成員(改名用)', true, ()=> deleteDoc(doc(anon,'users','冠廷')));
await check(A,'刪除交辦', true, ()=> deleteDoc(doc(anon,'tasks','T-1')));
await check(A,'刪除商品', true, ()=> deleteDoc(doc(anon,'products','P-1')));
await check(A,'刪除配對', true, ()=> deleteDoc(doc(anon,'matches','M-1')));

// ═══ B. 原子寫入 —— app 用來避免多人同時操作互相覆蓋 ═══
const Bx = 'B・原子寫入（必須全部允許）';
await check(Bx,'meta arrayUnion 加聯絡人', true, ()=>
  setDoc(doc(anon,'meta','settings'), {contacts: arrayUnion('B')}, {merge:true}));
await check(Bx,'meta arrayRemove 移除標籤', true, ()=>
  setDoc(doc(anon,'meta','settings'), {videoTags: arrayRemove('寵粉')}, {merge:true}));
await check(Bx,'影片 increment 累加重播次數', true, ()=>
  setDoc(doc(anon,'videos','V-old'), {totalUsed: increment(1)}, {merge:true}));
await check(Bx,'影片 arrayUnion 加重播紀錄', true, ()=>
  setDoc(doc(anon,'videos','V-old'), {usageHistory: arrayUnion({date:'2026-09-09'})}, {merge:true}));
await check(Bx,'排程 arrayUnion 加時段', true, ()=>
  setDoc(doc(anon,'schedule','2026-09-09'), {slots: arrayUnion({t:'12:00'})}, {merge:true}));

// ═══ C. 實際查詢 —— 規則若有條件會讓整個查詢失敗 ═══
const Cx = 'C・實際查詢（必須全部允許）';
await check(Cx,'logs：where at>= + orderBy + limit', true, ()=>
  getDocs(query(collection(anon,'logs'), where('at','>=','2026-08-01'), orderBy('at','desc'), limit(50))));
await check(Cx,'shifts：where date>=', true, ()=>
  getDocs(query(collection(anon,'shifts'), where('date','>=','2026-08-01'))));
await check(Cx,'全量讀 videos（備份腳本會用）', true, ()=> getDocs(collection(anon,'videos')));
await check(Cx,'全量讀 tasks', true, ()=> getDocs(collection(anon,'tasks')));

// ═══ D. 破壞行為 —— 全部必須被擋下 ═══
const D = 'D・破壞行為（必須全部拒絕）';
await check(D,'直接永久刪除未進回收桶的影片', false, ()=> deleteDoc(doc(anon,'videos','V-new')));
await check(D,'刪除沒有 deleted 欄位的舊影片', false, ()=> deleteDoc(doc(anon,'videos','V-old')));
await check(D,'竄改操作紀錄', false, ()=> updateDoc(doc(anon,'logs','L-1'), {user:'別人'}));
await check(D,'覆寫操作紀錄湮滅證據', false, ()=> setDoc(doc(anon,'logs','L-1'), {action:'湮滅'}));
await check(D,'刪除操作紀錄', false, ()=> deleteDoc(doc(anon,'logs','L-1')));
await check(D,'刪除系統設定', false, ()=> deleteDoc(doc(anon,'meta','settings')));
await check(D,'刪除排程', false, ()=> deleteDoc(doc(anon,'schedule','2026-09-09')));
await check(D,'刪除出勤打卡紀錄', false, ()=> deleteDoc(doc(anon,'shifts','S-1')));

// ═══ E. 未授權路徑 —— 全部必須被擋下 ═══
const E = 'E・未授權路徑（必須全部拒絕）';
await check(E,'寫入未定義的集合', false, ()=> setDoc(doc(anon,'evil','x'), {junk:'塞垃圾'}));
await check(E,'讀取未定義的集合', false, ()=> getDocs(collection(anon,'evil')));
await check(E,'寫入子集合', false, ()=> setDoc(doc(anon,'videos','V-new','sub','y'), {a:1}));
await check(E,'把資料庫當免費檔案空間', false, ()=> setDoc(doc(anon,'warez','big'), {blob:'x'.repeat(1000)}));

// ═══ F. 完全未登入 —— 全部必須被擋下 ═══
const F = 'F・未登入（必須全部拒絕）';
await check(F,'未登入讀影片', false, ()=> getDocs(collection(guest,'videos')));
await check(F,'未登入寫影片', false, ()=> setDoc(doc(guest,'videos','V-x'), {a:1}));
await check(F,'未登入寫設定', false, ()=> setDoc(doc(guest,'meta','settings'), {a:1}));

// ═══ 輸出 ═══
let cur = '';
for (const [g, label, shouldPass, status] of results) {
  if (g !== cur) { console.log('\n' + g); console.log('─'.repeat(58)); cur = g; }
  console.log(`  ${status.startsWith('\u2705') ? '\u2705' : status}  ${shouldPass ? '應允許' : '應拒絕'}  ${label}`);
}
console.log('\n' + '═'.repeat(58));
console.log(`通過 ${pass} / ${pass + fail}${fail ? `　❌ 失敗 ${fail}` : '　全部通過'}`);
await env.cleanup();
process.exit(fail ? 1 : 0);
