// cloudflare/shopline-proxy.mjs 的解析與把關規則。
//
// ⚠️ **這支測試不打網路。** 樣本是 tests/fixtures/shopline-product.html ——
//    從官網真實頁面抽出解析器會讀的那幾段（原樣保留 \" 轉義），4.6 KB。
//    官網哪天改版、那些結構不見了，這支會變紅，而不是等設計師回報「抓不到」。
//
// 樣本那一頁是「自帶光芒｜手鏈｜天然歐泊」，實測值：
//     名稱  自帶光芒｜手鏈｜項鍊｜天然歐泊
//     售價  990 / 3,000 / 3,500        ← 一頁 4 款，所以價格是區間
//     原價  6,000 / 13,000 / 15,000
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import W, { parseProduct, prices, variants, checkUrl, ALLOW_HOST } from "../cloudflare/shopline-proxy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, "..", "cloudflare", "shopline-proxy.mjs"), "utf8");
const HTML = fs.readFileSync(path.join(HERE, "fixtures", "shopline-product.html"), "utf8");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log("FAIL  " + n, x === undefined ? "" : JSON.stringify(x).slice(0, 200)); } };

// ══════════ ① 真實頁面抓得到什麼 ══════════
const d = parseProduct(HTML);
ok("解析得出東西", !!d);
ok("名稱", d && d.name === "自帶光芒｜手鏈｜項鍊｜天然歐泊", d && d.name);
ok("照片是 Shopline 圖床", d && d.image.startsWith("https://img.shoplineapp.com/"), d && d.image);
ok("SKU", d && d.sku === "685e233a558ae8000c15a2bd", d && d.sku);
// ⚠️ 一頁多款 → 價格一定是區間。只取單一數字的話，設計師看到「990」
//    會以為那是全部的價格，但這一頁其實賣到 3,500。
ok("**售價區間的低點**", d && d.priceMin === 990, d && d.priceMin);
ok("**售價區間的高點**", d && d.priceMax === 3500, d && d.priceMax);
ok("原價低點", d && d.listMin === 6000, d && d.listMin);
ok("原價高點", d && d.listMax === 15000, d && d.listMax);
ok("原價比售價高（抓反了看得出來）", d && d.listMin > d.priceMin);
ok("4 款都抓到", d && d.variants.length === 4, d && d.variants);
ok("款式名稱對", d && d.variants[0] === "自帶光芒｜白歐泊", d && d.variants);
ok("欄位名稱不會被當成款式", d && !d.variants.some(v => v === "款式" || v === "手機號碼"), d && d.variants);

// ══════════ ② 抓不到名稱就是失敗，不給半套 ══════════
// 回一筆沒有名稱的商品比報錯更糟：清單上會出現一列空白，設計師不知道為什麼。
ok("空頁面 → 失敗", parseProduct("<html></html>") === null);
ok("分類頁（沒有商品結構）→ 失敗",
   parseProduct("<html><head><title>異象水晶</title></head><body>一堆商品</body></html>") === null);
ok("空字串不會炸", parseProduct("") === null);
ok("壞掉的 JSON-LD 不會炸", parseProduct('<script type="application/ld+json">{壞掉</script>') === null);

// ══════════ ③ 只有 og 標籤也要救得回來 ══════════
// 官網改版最可能先掉的是 JSON-LD。那時候至少要拿得到名稱。
{ const d2 = parseProduct('<html><head><meta property="og:title" content="測試商品名"></head></html>');
  ok("沒有 JSON-LD 時退回 og:title", d2 && d2.name === "測試商品名", d2);
  ok("沒有價格就是 0，不要瞎猜", d2 && d2.priceMin === 0 && d2.listMin === 0); }

// ══════════ ④ 價格的取法 ══════════
{ const esc = '<script>x = "{\\"price_sale\\":{\\"dollars\\":100.0},\\"price\\":{\\"dollars\\":200.0}}";</script>';
  const r = prices(esc);
  ok("讀得懂被轉義的 JSON（頁面裡就是這樣存的）",
     r.sale.join() === "100" && r.list.join() === "200", r); }
{ const r = prices("<html></html>");
  ok("沒有價格時回空清單", r.sale.length === 0 && r.list.length === 0); }
{ const multi = '<script>x = "{\\"price_sale\\":{\\"dollars\\":300.0},\\"price_sale\\":{\\"dollars\\":100.0},\\"price_sale\\":{\\"dollars\\":100.0}}";</script>';
  ok("多款：去重而且由小到大", prices(multi).sale.join() === "100,300", prices(multi).sale); }
ok("款式去重", variants('<script>x="{\\"name_translations\\":{\\"zh-hant\\":\\"A\\"},\\"name_translations\\":{\\"zh-hant\\":\\"A\\"}}"</script>').length === 1);

// ══════════ ⑤ 只准抓自己的官網 ══════════
// ⚠️ 這個專案的原始碼是公開的，這段程式的網址遲早會被看到。
//    沒有這道限制，它就是一個任何人都能拿去抓任何網站的免費跳板。
ok("自己的商品頁：收", checkUrl("https://" + ALLOW_HOST + "/products/歐泊手鏈") === "");
ok("**別人的網站：擋**", checkUrl("https://evil.example.com/x") !== "");
ok("**看起來像但不是的網域：擋**", checkUrl("https://www.tzgrotw.tw.evil.com/products/x") !== "");
ok("http 不收（只收 https）", checkUrl("http://" + ALLOW_HOST + "/products/x") !== "");
ok("分類頁：擋", checkUrl("https://" + ALLOW_HOST + "/categories/異象水晶") !== "");
ok("活動頁：擋", checkUrl("https://" + ALLOW_HOST + "/pages/new-page-3") !== "");
ok("首頁：擋", checkUrl("https://" + ALLOW_HOST + "/") !== "");
ok("商品頁底下再一層：擋", checkUrl("https://" + ALLOW_HOST + "/products/a/b") !== "");
ok("尾斜線照收", checkUrl("https://" + ALLOW_HOST + "/products/歐泊手鏈/") === "");
ok("空的、亂打的不會炸", checkUrl("") !== "" && checkUrl("歐泊手鏈") !== "" && checkUrl(null) !== "");
ok("擋掉的時候要講原因（不能只說失敗）", checkUrl("https://evil.example.com/x").length > 4);

// ══════════ ⑥ 收到請求的行為 ══════════
const call = (url, method) => W.fetch(new Request(url, { method: method || "GET" }));
{ const r = await call("https://w.example/?url=https://evil.example.com/x");
  ok("抓別人的網站 → 400", r.status === 400);
  ok("而且不會真的去抓（先擋再說）", (await r.json()).ok === false); }
{ const r = await call("https://w.example/");
  ok("沒帶網址 → 400", r.status === 400); }
{ const r = await call("https://w.example/?url=https://" + ALLOW_HOST + "/products/x", "POST");
  ok("只收 GET", r.status === 405); }
{ const r = await call("https://w.example/?url=x", "OPTIONS");
  ok("瀏覽器的預檢過得去（不然按下去什麼都不會發生）",
     r.headers.get("Access-Control-Allow-Origin") === "*"); }
{ const r = await call("https://w.example/?url=https://evil.example.com/x");
  ok("錯誤回應也要帶 CORS（不然瀏覽器連錯誤訊息都讀不到）",
     r.headers.get("Access-Control-Allow-Origin") === "*"); }

// ══════════ ⑦ 程式碼層面釘住的幾件事 ══════════
ok("網域白名單寫死在程式裡（不是從請求帶進來的）", /const ALLOW_HOST = "/.test(SRC));
ok("有設快取，同一個網址不會每次都真的去抓", /cacheTtl/.test(SRC));
ok("官網掛掉時回 502 而不是假裝成功", /502/.test(SRC));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
