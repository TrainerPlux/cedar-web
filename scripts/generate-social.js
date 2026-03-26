#!/usr/bin/env node
/**
 * generate-social.js — 冷杉 Cedar Social Content Generator
 *
 * 針對所有 Status = Published、Social Status 為空或 Pending 的文章，
 * 呼叫 Claude API 自動生成三種社群內容，寫回 Notion：
 *   - IG/FB/LinkedIn Caption  視覺平台文案（含 hashtag）
 *   - Threads Post            單一概念，2-4句，≤150字
 *   - X Draft                 單句核心觀點 + 連結，≤100字
 *
 * 執行完成後 Social Status 自動設為 "Pending"（等待人工審閱）
 *
 * 環境變數：
 *   NOTION_TOKEN         Notion Integration Token
 *   NOTION_DATABASE_ID   Blog Posts 資料庫 ID
 *   ANTHROPIC_API_KEY    Claude API Key
 */

const { Client } = require('@notionhq/client');
const Anthropic  = require('@anthropic-ai/sdk');

const notion    = new Client({ auth: process.env.NOTION_TOKEN });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProp(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title':        return prop.title.map(t => t.plain_text).join('');
    case 'rich_text':    return prop.rich_text.map(t => t.plain_text).join('');
    case 'select':       return prop.select?.name || '';
    case 'multi_select': return prop.multi_select.map(s => s.name).join(', ');
    case 'date':         return prop.date?.start || '';
    default:             return '';
  }
}

async function getPageText(pageId) {
  const blocks = [];
  let cursor;
  do {
    const r = await notion.blocks.children.list({
      block_id: pageId, start_cursor: cursor, page_size: 100
    });
    blocks.push(...r.results);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);

  return blocks
    .filter(b => ['paragraph','heading_1','heading_2','heading_3','bulleted_list_item','numbered_list_item','quote','callout'].includes(b.type))
    .map(b => {
      const rt = b[b.type]?.rich_text || [];
      return rt.map(t => t.plain_text).join('');
    })
    .filter(Boolean)
    .join('\n');
}

async function generateSocialContent({ title, metaDesc, tags, bodyText, slug }) {
  const articleUrl = `https://cedar.com.tw/insights/${slug}.html`;

  const prompt = `你是冷杉 Cedar 的內容行銷專員。冷杉是一間用 AI 接管傳統中型企業後台職能的公司，目標受眾是面臨接班問題的傳統企業老闆。

以下是一篇剛發佈的部落格文章：

標題：${title}
摘要：${metaDesc}
標籤：${tags}
內文（節錄）：
${bodyText.slice(0, 2000)}

請根據這篇文章，生成三種社群媒體內容。請嚴格按照以下 JSON 格式回傳，不要加任何額外說明：

{
  "ig_fb_linkedin": "（LinkedIn / Facebook / Instagram 的圖文貼文文案。語氣專業但親切，點出文章的核心洞見，讓傳統企業老闆感到有共鳴。結尾附上行動號召和連結。加上 3-5 個相關繁體中文 hashtag。全文約 150-250 字。）",
  "threads": "（Threads 貼文。只聚焦一個核心概念或洞見，用 2-4 句話說清楚，不超過 150 字。語氣輕鬆直接，像在跟朋友說話。結尾可附連結。）",
  "x_draft": "（X 貼文草稿。一句話點出最有衝擊力的核心觀點，加上文章連結。全文不超過 100 字。）"
}

連結請統一使用：${articleUrl}`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  });

  const raw = message.content[0].text.trim();

  // Extract JSON from response (handle possible markdown code blocks)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude did not return valid JSON');

  return JSON.parse(jsonMatch[0]);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('✍️  冷杉 Cedar — Social Content Generator Starting...');

  if (!process.env.NOTION_TOKEN)       throw new Error('Missing env: NOTION_TOKEN');
  if (!process.env.NOTION_DATABASE_ID) throw new Error('Missing env: NOTION_DATABASE_ID');
  if (!process.env.ANTHROPIC_API_KEY)  throw new Error('Missing env: ANTHROPIC_API_KEY');

  // 找出所有 Published 且尚未生成社群內容的文章
  const { results } = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      and: [
        { property: 'Status',        select:    { equals: 'Published' } },
        { property: 'Social Status', select:    { is_empty: true } },
        { property: 'Slug',          rich_text: { is_not_empty: true } },
      ]
    }
  });

  console.log(`Found ${results.length} post(s) needing social content`);
  if (results.length === 0) { console.log('✅ Nothing to do.'); return; }

  for (const page of results) {
    const title    = getProp(page.properties['Title']);
    const slug     = getProp(page.properties['Slug']);
    const metaDesc = getProp(page.properties['Meta Description']);
    const tags     = getProp(page.properties['Tags']);

    console.log(`  → Generating for: ${title}`);

    const bodyText = await getPageText(page.id);
    const social   = await generateSocialContent({ title, metaDesc, tags, bodyText, slug });

    // 寫回 Notion
    await notion.pages.update({
      page_id: page.id,
      properties: {
        'IG/FB/LinkedIn Caption': {
          rich_text: [{ type: 'text', text: { content: social.ig_fb_linkedin } }]
        },
        'Threads Post': {
          rich_text: [{ type: 'text', text: { content: social.threads } }]
        },
        'X Draft': {
          rich_text: [{ type: 'text', text: { content: social.x_draft } }]
        },
        'Social Status': {
          select: { name: 'Pending' }
        }
      }
    });

    console.log(`    ✓ Social content written to Notion, Social Status → Pending`);
  }

  console.log('✅ Done! Review content in Notion, then set Social Status → "Ready to Post"');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
