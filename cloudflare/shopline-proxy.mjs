// =============================================================================
// 選品清單：去官網把商品資料抓回來
//
// 這段程式跑在 Cloudflare（免費），不是跑在瀏覽器裡。原因只有一個：
// 官網沒有開 CORS（實測：回應裡沒有 Access-Control-Allow-Origin，
// /products.json 只是回同一頁 HTML，/api/... 全部轉走），
// 所以瀏覽器發出去的請求一定被擋 —— 跟是不是手動按的無關。
//
// 它做的事：收一個商品網址 → 去抓那一頁 → 解析 → 回傳乾淨的 JSON。
// 沒人按就完全不動，不需要排程、不需要輪詢。
//
// 部署方式見 docs/選品清單-Cloudflare-部署.md
//
// ⚠️ 只准抓 ALLOW_HOST 這一個網域。這個專案的原始碼是公開的，
//    這段程式的網址遲早會被看到 —— 沒有這道限制，它就是一個
//    任何人都能拿去抓任何網站的免費跳板。
// =============================================================================

export const ALLOW_HOST = "www.tzgrotw.tw";

// --- 解析：這是全專案唯一一份商品頁解析規則 -----------------------------------
// tests/shopline-parse.mjs 用 tests/fixtures/shopline-product.html（從真實頁面
// 抽出來的片段）驗這幾個函式，不打網路。官網改版時測試會變紅，
// 而不是等設計師回報「抓不到」。

export function jsonldProduct(html) {
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of String(html || "").matchAll(re)) {
    let d;
    try { d = JSON.parse(m[1].trim()); } catch (e) { continue; }
    if (d && d["@type"] === "Product") return d;
  }
  return null;
}

function metaContent(html, prop) {
  const re = new RegExp('<meta[^>]+property=["\']' + prop + '["\'][^>]*content=["\']([^"\']*)', "i");
  const m = String(html || "").match(re);
  return m ? m[1].trim() : "";
}

// 售價與原價。
// ⚠️ 一頁會有很多款：實測「自帶光芒｜手鏈｜天然歐泊」那一頁有 4 款，
//    售價 990／3,000／3,500、原價 6,000／13,000／15,000。
//    所以價格一定是**區間**，不是單一數字。JSON-LD 只給得出其中一個，
//    要拿全部就得讀頁面內嵌的那包 JSON（它被 \" 轉義過，先還原）。
export function prices(html) {
  const u = String(html || "").replace(/\\"/g, '"').replace(/\\\//g, "/");
  const grab = (key) => {
    const re = new RegExp('"' + key + '"\\s*:\\s*\\{[^}]*?"dollars"\\s*:\\s*([0-9.]+)', "g");
    const out = new Set();
    for (const m of u.matchAll(re)) {
      const v = parseFloat(m[1]);
      if (isFinite(v)) out.add(v);
    }
    return [...out].sort((a, b) => a - b);
  };
  return { sale: grab("price_sale"), list: grab("price") };
}

// 款式名稱。「款式」「手機號碼」那些是欄位名稱不是款式 ——
// 混進來設計師會以為多了兩款。
const NOT_A_VARIANT = new Set(["款式", "手機號碼", "顏色", "尺寸", "規格"]);
export function variants(html) {
  const u = String(html || "").replace(/\\"/g, '"');
  const re = /"name_translations"\s*:\s*\{\s*"zh-hant"\s*:\s*"([^"]{1,60})"/g;
  const out = [];
  for (const m of u.matchAll(re)) {
    const n = m[1].trim();
    if (n && !NOT_A_VARIANT.has(n) && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 20);
}

// 一頁 HTML → 要寫進選品清單的欄位。
// 抓不到名稱就回 null ＝ 失敗。回一筆沒有名稱的商品比報錯更糟：
// 清單上會出現一列空白，而設計師不知道為什麼。
export function parseProduct(html) {
  const ld = jsonldProduct(html) || {};
  const name = String(ld.name || "").trim() || metaContent(html, "og:title");
  if (!name) return null;

  let img = ld.image;
  if (Array.isArray(img)) img = img[0];
  img = String(img || "").trim() || metaContent(html, "og:image");

  const { sale, list } = prices(html);
  // JSON-LD 的 offers.price 當備援：頁面格式哪天變了，至少還有一個價格
  if (!sale.length) {
    const p = parseFloat((ld.offers || {}).price);
    if (isFinite(p) && p) sale.push(p);
  }
  return {
    name,
    image: img,
    sku: String(ld.sku || "").trim(),
    priceMin: sale.length ? sale[0] : 0,
    priceMax: sale.length ? sale[sale.length - 1] : 0,
    listMin: list.length ? list[0] : 0,
    listMax: list.length ? list[list.length - 1] : 0,
    variants: variants(html),
  };
}

// --- 收到請求要做的事 --------------------------------------------------------

// 只收「這個網域的單一商品頁」。分類頁、活動頁、首頁都對不回單一商品，
// 讓它們進來只會在後面的營收歸戶出現「賣了八萬但不知道是哪個商品」。
export function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || "")); } catch (e) { return "網址看不懂"; }
  if (u.protocol !== "https:") return "只收 https 的網址";
  if (u.hostname !== ALLOW_HOST) return "只能抓 " + ALLOW_HOST + " 的商品頁";
  if (!/^\/products\/[^/]+\/?$/.test(u.pathname)) return "這不是單一商品頁（分類頁、活動頁都對不回商品）";
  return "";
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};
const json = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200,
  headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
});

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "GET") return json({ ok: false, error: "只收 GET" }, 405);

    const target = new URL(request.url).searchParams.get("url") || "";
    const bad = checkUrl(target);
    if (bad) return json({ ok: false, error: bad }, 400);

    let html;
    try {
      const r = await fetch(target, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EC-DR selection list)" },
        cf: { cacheTtl: 300, cacheEverything: true },   // 同一個網址五分鐘內只真的抓一次
      });
      if (!r.ok) return json({ ok: false, error: "官網回了 HTTP " + r.status }, 502);
      html = await r.text();
    } catch (e) {
      return json({ ok: false, error: "連不上官網：" + String(e).slice(0, 120) }, 502);
    }

    const data = parseProduct(html);
    if (!data) {
      return json({ ok: false, error: "這一頁找不到商品資料（確認是單一商品頁，而且商品還在架上）" }, 422);
    }
    return json({ ok: true, url: target, ...data });
  },
};
