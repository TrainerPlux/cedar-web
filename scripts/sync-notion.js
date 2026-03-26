#!/usr/bin/env node
/**
 * sync-notion.js — 冷杉 Cedar Blog Sync
 *
 * 從 Notion 資料庫抓取 Published 文章，自動生成：
 *   - src/insights/[slug].html   個別文章頁
 *   - src/insights.html          文章列表頁（完整覆蓋）
 *
 * 環境變數：
 *   NOTION_TOKEN         Notion Integration Token (secret_xxx)
 *   NOTION_DATABASE_ID   文章資料庫的 Database ID
 */

const { Client } = require('@notionhq/client');
const fs   = require('fs');
const path = require('path');

const notion      = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

const SRC_DIR      = path.join(__dirname, '..', 'src');
const INSIGHTS_DIR = path.join(SRC_DIR, 'insights');

if (!fs.existsSync(INSIGHTS_DIR)) fs.mkdirSync(INSIGHTS_DIR, { recursive: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function richTextToHtml(rtArr) {
  if (!rtArr || !rtArr.length) return '';
  return rtArr.map(rt => {
    let t = esc(rt.plain_text);
    if (rt.annotations?.bold)          t = `<strong>${t}</strong>`;
    if (rt.annotations?.italic)        t = `<em>${t}</em>`;
    if (rt.annotations?.code)          t = `<code>${t}</code>`;
    if (rt.annotations?.strikethrough) t = `<s>${t}</s>`;
    if (rt.href) t = `<a href="${rt.href}" target="_blank" rel="noopener">${t}</a>`;
    return t;
  }).join('');
}

function getProp(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title':        return prop.title.map(t => t.plain_text).join('');
    case 'rich_text':    return prop.rich_text.map(t => t.plain_text).join('');
    case 'url':          return prop.url || '';
    case 'select':       return prop.select?.name || '';
    case 'multi_select': return prop.multi_select.map(s => s.name);
    case 'date':         return prop.date?.start || '';
    default:             return '';
  }
}

async function getBlocks(pageId) {
  const blocks = [];
  let cursor;
  do {
    const r = await notion.blocks.children.list({
      block_id: pageId, start_cursor: cursor, page_size: 100
    });
    blocks.push(...r.results);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return blocks;
}

async function blocksToHtml(pageId) {
  const blocks = await getBlocks(pageId);
  let html = '', inUl = false, inOl = false;

  for (const b of blocks) {
    if (b.type !== 'bulleted_list_item' && inUl) { html += '</ul>\n'; inUl = false; }
    if (b.type !== 'numbered_list_item' && inOl) { html += '</ol>\n'; inOl = false; }

    switch (b.type) {
      case 'paragraph': {
        const t = richTextToHtml(b.paragraph.rich_text);
        html += t ? `<p>${t}</p>\n` : `<p>&nbsp;</p>\n`;
        break;
      }
      case 'heading_1':
        html += `<h2>${richTextToHtml(b.heading_1.rich_text)}</h2>\n`; break;
      case 'heading_2':
        html += `<h2>${richTextToHtml(b.heading_2.rich_text)}</h2>\n`; break;
      case 'heading_3':
        html += `<h3>${richTextToHtml(b.heading_3.rich_text)}</h3>\n`; break;
      case 'bulleted_list_item':
        if (!inUl) { html += '<ul>\n'; inUl = true; }
        html += `  <li>${richTextToHtml(b.bulleted_list_item.rich_text)}</li>\n`; break;
      case 'numbered_list_item':
        if (!inOl) { html += '<ol>\n'; inOl = true; }
        html += `  <li>${richTextToHtml(b.numbered_list_item.rich_text)}</li>\n`; break;
      case 'quote':
        html += `<blockquote>${richTextToHtml(b.quote.rich_text)}</blockquote>\n`; break;
      case 'divider':
        html += `<hr>\n`; break;
      case 'image': {
        const url = b.image.type === 'external' ? b.image.external.url : b.image.file.url;
        const cap = b.image.caption?.map(t => t.plain_text).join('') || '';
        html += `<figure><img src="${url}" alt="${esc(cap)}" loading="lazy">${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>\n`;
        break;
      }
      case 'code': {
        const code = b.code.rich_text.map(t => t.plain_text).join('');
        html += `<pre><code>${esc(code)}</code></pre>\n`; break;
      }
      case 'callout':
        html += `<div class="post-callout">${richTextToHtml(b.callout.rich_text)}</div>\n`; break;
    }
  }
  if (inUl) html += '</ul>\n';
  if (inOl) html += '</ol>\n';
  return html;
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ─── Nav & Footer partials ─────────────────────────────────────────────────────

function nav(p) {
  return `<nav class="nav">
  <div class="nav__inner">
    <a href="${p}index.html" class="nav__logo">
      <img src="${p}images/logo.png" alt="冷杉 Cedar" class="nav__logo-img">
    </a>
    <ul class="nav__links">
      <li><a href="${p}about.html">關於我們</a></li>
      <li><a href="${p}solution.html">我們的解法</a></li>
      <li><a href="${p}case.html">客戶案例</a></li>
      <li><a href="${p}insights.html" class="active">洞見</a></li>
    </ul>
    <a href="${p}contact.html" class="btn btn-primary nav__cta">立即預約諮詢</a>
    <button class="nav__hamburger" aria-label="選單" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>
<div class="nav__mobile">
  <a href="${p}about.html">關於我們</a>
  <a href="${p}solution.html">我們的解法</a>
  <a href="${p}case.html">客戶案例</a>
  <a href="${p}insights.html">洞見</a>
  <a href="${p}contact.html" class="btn btn-primary">立即預約諮詢</a>
</div>`;
}

function footer(p) {
  return `<footer class="footer">
  <div class="container">
    <div class="footer__grid">
      <div>
        <div class="footer__brand-zh">冷杉</div>
        <span class="footer__brand-en">CEDAR</span>
        <p class="footer__desc">接管傳統中型企業六大後台職能，讓老闆真正能退場。</p>
      </div>
      <div>
        <div class="footer__heading">頁面</div>
        <ul class="footer__links">
          <li><a href="${p}index.html">首頁</a></li>
          <li><a href="${p}about.html">關於我們</a></li>
          <li><a href="${p}solution.html">我們的解法</a></li>
          <li><a href="${p}case.html">客戶案例</a></li>
          <li><a href="${p}insights.html">洞見</a></li>
          <li><a href="${p}contact.html">預約諮詢</a></li>
        </ul>
      </div>
    </div>
    <div class="footer__bottom">
      <span>© 2026 冷杉 Cedar. 保留所有權利。</span>
      <span>cedar.com.tw</span>
    </div>
  </div>
</footer>`;
}

// ─── HTML Generators ──────────────────────────────────────────────────────────

function genPostHtml({ title, slug, metaDesc, ogImage, publishDate, tags, contentHtml }) {
  const ogImg = ogImage || 'https://cedar.com.tw/images/og-image.png';
  const tag0  = Array.isArray(tags) && tags.length ? tags[0] : '';
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}｜冷杉 Cedar</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="https://cedar.com.tw/insights/${slug}.html">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://cedar.com.tw/insights/${slug}.html">
  <meta property="og:title" content="${esc(title)}｜冷杉 Cedar">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:image" content="${ogImg}">
  <meta property="og:locale" content="zh_TW">
  <meta property="og:site_name" content="冷杉 Cedar">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}｜冷杉 Cedar">
  <meta name="twitter:description" content="${esc(metaDesc)}">
  <meta name="twitter:image" content="${ogImg}">
  <link rel="stylesheet" href="../css/style.css">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "url": "https://cedar.com.tw/insights/${slug}.html",
    "headline": "${esc(title)}",
    "description": "${esc(metaDesc)}",
    "datePublished": "${publishDate}",
    "publisher": { "@type": "Organization", "name": "冷杉 Cedar", "url": "https://cedar.com.tw" }
  }
  <\/script>
</head>
<body class="page-top">
${nav('../')}

<section class="page-hero">
  <div class="container">
    <div class="post-hero-meta">
      ${tag0 ? `<span class="insight-card__tag">${esc(tag0)}</span>` : ''}
      <span class="insight-card__date">${fmtDate(publishDate)}</span>
    </div>
    <h1 class="page-hero__title">${esc(title)}</h1>
    <p class="page-hero__sub">${esc(metaDesc)}</p>
  </div>
</section>

<article class="section">
  <div class="container">
    <div class="post-body">
      ${contentHtml}
    </div>
    <div class="post-nav">
      <a href="../insights.html" class="post-nav__back">← 返回所有洞見</a>
    </div>
  </div>
</article>

<section class="cta-section">
  <div class="container">
    <h2 class="fade-in">看完文章，想聊聊你的狀況？</h2>
    <p class="fade-in">15 分鐘免費諮詢，沒有義務，沒有推銷。</p>
    <a href="../contact.html" class="btn btn-primary fade-in" style="font-size:16px;padding:18px 40px;">立即預約諮詢</a>
  </div>
</section>

${footer('../')}
<script src="../js/main.js"><\/script>
</body>
</html>`;
}

const BG_COLORS = ['#1F3864', '#2c4a7c', '#1a3050', '#243d6b', '#34527a', '#1e4060'];

function genInsightsHtml(posts) {
  const cards = posts.map((p, i) => {
    const bg  = p.ogImage
      ? `background-image:url('${p.ogImage}');background-size:cover;background-position:center`
      : `background:${BG_COLORS[i % BG_COLORS.length]}`;
    const tag = Array.isArray(p.tags) && p.tags.length ? p.tags[0] : '';
    return `      <article class="insight-card">
        <a href="insights/${p.slug}.html" class="insight-card__link">
          <div class="insight-card__img-wrap">
            <div class="insight-card__img" style="${bg};"></div>
            <div class="insight-card__overlay"></div>
            <div class="insight-card__body">
              <div class="insight-card__meta">
                ${tag ? `<span class="insight-card__tag">${esc(tag)}</span>` : ''}
                <span class="insight-card__date">${p.publishDate}</span>
              </div>
              <h2 class="insight-card__title">${esc(p.title)}</h2>
              <p class="insight-card__excerpt">${esc(p.metaDesc)}</p>
              <span class="insight-card__cta">閱讀全文 →</span>
            </div>
          </div>
        </a>
      </article>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>洞見：傳統企業老闆的觀點｜冷杉 Cedar</title>
  <meta name="description" content="冷杉洞見——給面臨接班、想退場的傳統企業老闆。家族企業傳承、中小企業後台費用、AI 導入真實效益，從實戰角度分析你真正需要知道的事。">
  <link rel="canonical" href="https://cedar.com.tw/insights.html">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://cedar.com.tw/insights.html">
  <meta property="og:title" content="洞見：傳統企業老闆的觀點｜冷杉 Cedar">
  <meta property="og:description" content="家族企業接班、後台外包費用試算、傳統企業 AI 化——冷杉持續發布給傳統企業老闆的實用觀點。">
  <meta property="og:image" content="https://cedar.com.tw/images/og-image.png">
  <meta property="og:locale" content="zh_TW">
  <meta property="og:site_name" content="冷杉 Cedar">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="洞見：傳統企業老闆的觀點｜冷杉 Cedar">
  <meta name="twitter:description" content="家族企業接班、後台外包費用試算、傳統企業 AI 化——冷杉持續發布給傳統企業老闆的實用觀點。">
  <meta name="twitter:image" content="https://cedar.com.tw/images/og-image.png">
  <link rel="stylesheet" href="css/style.css">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": "https://cedar.com.tw/insights.html",
    "url": "https://cedar.com.tw/insights.html",
    "name": "洞見｜冷杉 Cedar",
    "description": "給面臨接班、想退場的傳統企業老闆的觀點與分析。",
    "publisher": { "@type": "Organization", "name": "冷杉 Cedar", "url": "https://cedar.com.tw" }
  }
  <\/script>
</head>
<body class="page-top">
${nav('./')}

<section class="page-hero">
  <div class="container">
    <h1 class="page-hero__title">洞見</h1>
    <p class="page-hero__sub">給面臨接班、想退場的傳統企業老闆。<br>我們把你真正需要知道的事，說清楚。</p>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="insights-grid fade-in">
${cards}
    </div>
  </div>
</section>

<section class="cta-section">
  <div class="container">
    <h2 class="fade-in">看完文章，想聊聊你的狀況？</h2>
    <p class="fade-in">15 分鐘免費諮詢，沒有義務，沒有推銷。</p>
    <a href="contact.html" class="btn btn-primary fade-in" style="font-size:16px;padding:18px 40px;">立即預約諮詢</a>
  </div>
</section>

${footer('./')}
<script src="js/main.js"><\/script>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌲 冷杉 Cedar — Notion Sync Starting...');
  if (!process.env.NOTION_TOKEN)       throw new Error('Missing env: NOTION_TOKEN');
  if (!process.env.NOTION_DATABASE_ID) throw new Error('Missing env: NOTION_DATABASE_ID');

  const { results } = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: { property: 'Status', select: { equals: 'Published' } },
    sorts: [{ property: 'Publish Date', direction: 'descending' }],
  });

  console.log(`Found ${results.length} published post(s)`);
  const posts = [];

  for (const page of results) {
    const title       = getProp(page.properties['Title']);
    const slug        = getProp(page.properties['Slug']);
    const metaDesc    = getProp(page.properties['Meta Description']);
    const ogImage     = getProp(page.properties['OG Image URL']);
    const publishDate = getProp(page.properties['Publish Date']);
    const tags        = getProp(page.properties['Tags']);

    if (!slug) { console.warn(`⚠ Skipping "${title}" — no Slug set`); continue; }
    console.log(`  → ${title} (${slug})`);

    const contentHtml = await blocksToHtml(page.id);
    const html = genPostHtml({ title, slug, metaDesc, ogImage, publishDate, tags, contentHtml });
    fs.writeFileSync(path.join(INSIGHTS_DIR, `${slug}.html`), html, 'utf8');
    console.log(`    ✓ src/insights/${slug}.html`);

    posts.push({ title, slug, metaDesc, ogImage, publishDate, tags });
  }

  fs.writeFileSync(path.join(SRC_DIR, 'insights.html'), genInsightsHtml(posts), 'utf8');
  console.log(`✓ Regenerated src/insights.html (${posts.length} posts)`);
  console.log('✅ Done!');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
