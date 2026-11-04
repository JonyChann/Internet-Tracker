function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}

const COMMON_CSS = `
  :root {
    --bg: #f7f6f3; --panel: #ffffff; --ink: #1f2430; --muted: #6b7280;
    --line: #e7e4dd; --accent: #d64545; --accent-soft: #fbebeb; --green: #157f52;
    --radius: 14px; --shadow: 0 18px 40px -28px rgba(31, 36, 48, .45);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; }
  .topbar {
    position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 24px;
    padding: 14px 28px; background: rgba(255,255,255,.86); backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }
  .brand { font-weight: 700; letter-spacing: .02em; display: flex; align-items: center; gap: 8px; }
  .brand .mark { color: var(--accent); font-size: 18px; }
  .brand .tag {
    font-size: 10px; font-weight: 700; letter-spacing: .12em; color: var(--muted);
    border: 1px solid var(--line); border-radius: 999px; padding: 2px 7px;
  }
  .topnav { display: flex; gap: 22px; font-size: 14px; color: var(--muted); }
  .topnav a { text-decoration: none; }
  .topnav a:hover { color: var(--ink); }
  .spacer { flex: 1; }
  .cart { font-size: 14px; color: var(--muted); }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 28px 24px 64px; }
  .crumbs { font-size: 13px; color: var(--muted); margin-bottom: 18px; }
  .crumbs a { text-decoration: none; color: var(--muted); }
  .crumbs a:hover { color: var(--ink); }
  .product {
    display: grid; grid-template-columns: minmax(280px, 460px) 1fr; gap: 40px;
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
    padding: 26px; box-shadow: var(--shadow);
  }
  @media (max-width: 780px) { .product { grid-template-columns: 1fr; } }
  .gallery {
    background: linear-gradient(160deg, #fbfaf7, #f2efe9); border: 1px solid var(--line);
    border-radius: 12px; display: flex; align-items: center; justify-content: center; padding: 12px;
  }
  .gallery img { width: 100%; max-width: 420px; display: block; }
  .badges { display: flex; gap: 8px; margin-bottom: 10px; }
  .badge {
    font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px;
    background: #f1efe9; color: var(--muted);
  }
  .badge.hot { background: var(--accent-soft); color: var(--accent); }
  h1 { font-size: 26px; line-height: 1.3; margin: 0 0 8px; letter-spacing: -.01em; }
  .tagline { color: var(--muted); margin: 0 0 18px; }
  .price-row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .price { display: flex; align-items: baseline; gap: 4px; color: var(--accent); }
  .price .currency { font-size: 18px; font-weight: 600; }
  .price .amount { font-size: 40px; font-weight: 700; letter-spacing: -.02em; }
  .price .strike { margin-left: 10px; color: var(--muted); font-size: 14px; text-decoration: line-through; font-weight: 400; }
  .rating { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
  .rating .score { color: #b7791f; font-weight: 700; font-size: 16px; }
  .rating .stars { color: #e0a92e; letter-spacing: 2px; }
  .stock {
    display: flex; align-items: center; gap: 8px; margin: 18px 0; padding: 10px 14px;
    background: #f3f8f4; border: 1px solid #dcece1; border-radius: 10px; font-size: 14px;
  }
  .stock .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); }
  .stock .label { font-weight: 600; color: var(--green); }
  .stock .ship { color: var(--muted); font-size: 13px; margin-left: auto; }
  .stock.out { background: #fdf3f3; border-color: #f4dede; }
  .stock.out .dot { background: var(--accent); }
  .stock.out .label { color: var(--accent); }
  .specs { list-style: none; padding: 0; margin: 0 0 18px; display: grid; gap: 6px; font-size: 14px; color: #444b58; }
  .specs li::before { content: "·"; color: var(--muted); margin-right: 8px; }
  .seller {
    display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--line);
    border-radius: 10px; margin-bottom: 20px;
  }
  .seller .avatar {
    width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center;
    background: #eef1f6; color: #44506b; font-weight: 700; font-size: 13px;
  }
  .seller .name { font-weight: 600; font-size: 14px; }
  .seller .meta { color: var(--muted); font-size: 12px; }
  .actions { display: flex; gap: 10px; }
  button { font: inherit; cursor: pointer; border-radius: 10px; padding: 12px 24px; border: 1px solid transparent; }
  .buy { background: var(--ink); color: #fff; font-weight: 600; }
  .buy:hover { background: #333b4d; }
  .ghost { background: transparent; border-color: var(--line); color: var(--muted); }
  .ghost:hover { color: var(--ink); border-color: #cfcabe; }
  .updated { margin: 16px 0 0; font-size: 12px; color: var(--muted); }
  .notice {
    margin-top: 28px; padding: 20px 22px; border: 1px dashed #d9d4c8; border-radius: var(--radius);
    background: #fbfaf6; font-size: 14px; color: var(--muted);
  }
  .notice h2 { font-size: 15px; margin: 0 0 8px; color: var(--ink); }
  .notice p { margin: 0 0 10px; }
  .notice code {
    display: block; font: 12px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace;
    background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px;
    color: #3d4351; overflow-x: auto; white-space: pre-wrap;
  }
  footer { padding: 28px; text-align: center; color: #9aa0ab; font-size: 12px; }
`;

function priceFor(asin) {
  const seed = hash(asin);
  const base = 699 + (seed % 7) * 100;
  const tick = Math.floor(Date.now() / 12000);
  const wobble = Math.sin(tick * 0.7 + (seed % 31)) * 0.06 + Math.cos(tick * 0.21) * 0.02;
  return (base * (1 + wobble)).toFixed(2);
}

function productSvgSource(asin) {
  const seed = hash(asin);
  const hue = seed % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="420" viewBox="0 0 520 420">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 45% 88%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 40) % 360} 55% 72%)"/>
    </linearGradient>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f3646"/>
      <stop offset="1" stop-color="#171b24"/>
    </linearGradient>
  </defs>
  <rect width="520" height="420" rx="26" fill="url(#g)"/>
  <circle cx="398" cy="86" r="52" fill="rgba(255,255,255,.28)"/>
  <circle cx="96" cy="330" r="38" fill="rgba(255,255,255,.2)"/>
  <path d="M140 196a120 120 0 0 1 240 0v14h-42v-14a78 78 0 0 0-156 0v14h-42z" fill="url(#s)"/>
  <rect x="126" y="196" width="54" height="118" rx="27" fill="#242a36"/>
  <rect x="340" y="196" width="54" height="118" rx="27" fill="#242a36"/>
  <rect x="146" y="214" width="14" height="82" rx="7" fill="hsl(${hue} 80% 76%)"/>
  <rect x="360" y="214" width="14" height="82" rx="7" fill="hsl(${hue} 80% 76%)"/>
  <text x="260" y="372" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" letter-spacing="4" fill="rgba(23,27,36,.62)">AURORA · ${asin}</text>
</svg>`;
  return svg;
}

function productSvg(asin) {
  return `/demo/asset/cover.svg?asin=${encodeURIComponent(asin)}`;
}

export function registerDemoRoutes(router, { port }) {
  router.get('/demo/asset/cover.svg', async ({ res, query }) => {
    let asin = String(query.asin || 'B0DEMO001').trim();
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(asin)) asin = 'B0DEMO001';
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(productSvgSource(asin));
  });

  router.get('/demo', async ({ res }) => {
    const url = `http://127.0.0.1:${port}`;
    const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>示例商店 · Internet Tracker</title><style>${COMMON_CSS}
.hero { max-width: 1080px; margin: 0 auto; padding: 64px 24px 20px; }
.hero h1 { font-size: 40px; max-width: 640px; }
.hero p { color: var(--muted); max-width: 560px; font-size: 16px; }
.cards { max-width: 1080px; margin: 0 auto; padding: 20px 24px 70px; display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.card { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 18px; text-decoration: none; }
.card:hover { border-color: #cfcabe; box-shadow: var(--shadow); }
.card .asin { font: 12px ui-monospace, Menlo, monospace; color: var(--muted); }
.card h3 { margin: 6px 0 4px; font-size: 16px; }
.card p { margin: 0; color: var(--muted); font-size: 13px; }
.hint { margin-top: 22px; font-size: 14px; color: var(--muted); }
.hint a { color: var(--ink); }
</style></head>
<body>
<header class="topbar"><div class="brand"><span class="mark">◆</span> 示例商店 <span class="tag">DEMO</span></div>
<nav class="topnav"><a href="/demo">首页</a><a href="/demo/market?asin=B0DEMO001">商品</a><a href="${url}/#/settings">设置</a></nav>
<div class="spacer"></div><div class="cart">🛒 3</div></header>
<div class="hero">
  <h1>一个安静的、会变动的商品页，<br>用来验证你的抓取模板。</h1>
  <p>Internet Tracker 内置了这个离线演示站点。价格、评分与库存会随时间变化，所以每次刷新都会生成一条新快照 —— 不必担心网络或反爬。</p>
</div>
<div class="cards">
${[1, 2, 3]
  .map(
    (n) => `<a class="card" href="/demo/market?asin=B0DEMO00${n}">
    <div class="asin">ASIN B0DEMO00${n}</div>
    <h3>Aurora 无线降噪耳机</h3>
    <p>点开后可以查看页面结构，并复制 CSS 选择器。</p></a>`,
  )
  .join('')}
</div>
<div class="cards"><p class="hint">打开 <a href="${url}/#/">Internet Tracker</a> 中的「示例 · 商品价格追踪」数据表，点击刷新即可看到抓取结果。</p></div>
<footer>示例商店仅用于本地演示，不会发起任何网络请求。</footer>
</body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  });

  router.get('/demo/market', async ({ res, query }) => {
    let asin = String(query.asin || 'B0DEMO001').trim();
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(asin)) asin = 'B0DEMO001';
    const seed = hash(asin);
    const price = priceFor(asin);
    const original = (Number(price) * 1.22).toFixed(2);
    const score = (4.5 + (seed % 5) / 10).toFixed(1);
    const reviews = 800 + (seed % 900) + (Math.floor(Date.now() / 60000) % 40);
    const stockSeed = (seed + Math.floor(Date.now() / 60000)) % 10;
    const outOfStock = stockSeed === 0;
    const lowStock = stockSeed === 1 || stockSeed === 2;
    const stockLabel = outOfStock ? '暂时缺货' : lowStock ? '仅剩 3 件' : '现货';
    const stockClass = outOfStock ? 'stock out' : 'stock';
    const ship = outOfStock ? '补货中，可订阅到货通知' : '今日下单，预计明日送达';
    const title = `Aurora 无线降噪耳机 · ${asin}`;
    const updated = new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
    const seller = ['SoundLab 官方旗舰店', 'Aurora 声学自营', '北岸数码专营店'][seed % 3];
    const specs = [
      '40mm 生物振膜动圈单元',
      '混合式主动降噪 · 最高 -42dB',
      '单次续航 60 小时（关闭降噪）',
      '蓝牙 5.4 / 双设备连接 / LDAC',
      '重量 248g · 记忆棉耳罩',
    ];

    const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · 示例商店</title>
<meta name="price" content="${price}">
<meta name="asin" content="${escapeHtml(asin)}">
<style>${COMMON_CSS}</style></head>
<body>
<header class="topbar"><div class="brand"><span class="mark">◆</span> 示例商店 <span class="tag">DEMO</span></div>
<nav class="topnav"><a href="/demo">首页</a><a href="/demo/market?asin=B0DEMO001">商品</a><a href="/demo/market?asin=B0DEMO002">配件</a></nav>
<div class="spacer"></div><div class="cart">🛒 3</div></header>
<main class="wrap">
  <div class="crumbs"><a href="/demo">示例商店</a> / <a href="/demo">数码配件</a> / <span>${escapeHtml(title)}</span></div>
  <article class="product">
    <div class="gallery"><img src="${productSvg(asin)}" alt="${escapeHtml(title)}"></div>
    <div class="info">
      <div class="badges"><span class="badge hot">限时特惠</span><span class="badge">官方自营</span><span class="badge">7 天无理由</span></div>
      <h1 class="product-title">${escapeHtml(title)}</h1>
      <p class="tagline">40mm 动圈单元 / 主动降噪 / 60 小时续航 / 双设备连接</p>
      <div class="price-row">
        <div class="price"><span class="currency">¥</span><span class="amount">${Number(price).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span><span class="strike">¥${Number(original).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span></div>
        <div class="rating"><span class="score" data-score="${score}">${score}</span><span class="stars">★★★★★</span><span class="count">${reviews.toLocaleString('zh-CN')} 条评价</span></div>
      </div>
      <div class="${stockClass}"><span class="dot"></span><span class="label">${stockLabel}</span><span class="ship">${ship}</span></div>
      <ul class="specs">${specs.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      <div class="seller"><span class="avatar">SL</span><div><div class="name">${escapeHtml(seller)}</div><div class="meta">粉丝 12.8 万 · 好评率 98%</div></div></div>
      <div class="actions"><button class="buy">立即购买</button><button class="ghost">加入收藏</button></div>
      <p class="updated">页面数据更新于 <span id="updated">${escapeHtml(updated)}</span> · 价格每 12 秒浮动一次</p>
    </div>
  </article>
  <section class="notice">
    <h2>这个页面的抓取模板</h2>
    <p>在 Internet Tracker 的新建列里填入下面的选择器，就能把对应内容变成一列：</p>
    <code>商品名称   .product-title                 (文本)
价格       .price .amount                 (文本 + 正则 [\\d,\\.]+ → 数字)
评分       .rating .score                 (属性 data-score → 数字)
评价数     .rating .count                 (文本 + 正则 [\\d,]+ → 数字)
库存       .stock .label                  (文本)
卖家       .seller .name                 (文本)
规格       .specs li                      (文本 + 勾选“多值”)
商品图     .gallery img                   (图片地址)</code>
  </section>
</main>
<footer>示例商店仅用于本地演示 · Internet Tracker Demo Fixture</footer>
</body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  });
}
