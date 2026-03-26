#!/usr/bin/env node
/**
 * post-social.js — 冷杉 Cedar Social Publisher
 *
 * 找出所有 Social Status = "Ready to Post" 的文章，
 * 發佈到 LinkedIn、Facebook、Instagram、Threads，
 * 完成後將 Social Status 更新為 "Posted"。
 *
 * 支援「圖文輪播」（Carousel Images 欄位有圖片 URL 時自動使用）；
 * 否則退回純文字貼文（LinkedIn / Threads / FB）或單圖貼文。
 *
 * 環境變數（在 GitHub Secrets 設定）：
 *   NOTION_TOKEN              Notion Integration Token
 *   NOTION_DATABASE_ID        Blog Posts 資料庫 ID
 *
 *   LINKEDIN_ACCESS_TOKEN     LinkedIn OAuth Access Token
 *   LINKEDIN_AUTHOR_URN       格式：urn:li:person:XXXXXX 或 urn:li:organization:XXXXXX
 *
 *   META_PAGE_ID              Facebook Page ID
 *   META_PAGE_ACCESS_TOKEN    Facebook Page Access Token
 *   META_IG_USER_ID           Instagram Business Account User ID
 *
 *   THREADS_USER_ID           Threads 帳號 User ID
 *   THREADS_ACCESS_TOKEN      Threads API Access Token
 */

const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProp(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title':      return prop.title.map(t => t.plain_text).join('');
    case 'rich_text':  return prop.rich_text.map(t => t.plain_text).join('');
    case 'select':     return prop.select?.name || '';
    default:           return '';
  }
}

function parseImageUrls(text) {
  if (!text || !text.trim()) return [];
  return text.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(`API Error ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// ─── LinkedIn ─────────────────────────────────────────────────────────────────

async function postLinkedIn({ caption, imageUrls }) {
  const token  = process.env.LINKEDIN_ACCESS_TOKEN;
  const author = process.env.LINKEDIN_AUTHOR_URN;
  if (!token || !author) throw new Error('Missing LinkedIn credentials');

  const shareMediaCategory = imageUrls.length > 0 ? 'IMAGE' : 'NONE';

  // Upload images if provided (LinkedIn requires registering images first)
  const media = [];
  for (const imgUrl of imageUrls.slice(0, 9)) {
    // Register upload
    const reg = await apiFetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: author,
          serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }]
        }
      })
    });

    const uploadUrl  = reg.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const assetUrn   = reg.value.asset;

    // Download image and re-upload to LinkedIn
    const imgRes  = await fetch(imgUrl);
    const imgBlob = await imgRes.arrayBuffer();

    await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
      body: imgBlob
    });

    media.push({ status: 'READY', description: { text: '' }, media: assetUrn, title: { text: '' } });
    await sleep(500);
  }

  const body = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: caption },
        shareMediaCategory,
        ...(media.length > 0 ? { media } : {})
      }
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
  };

  const result = await apiFetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0'
    },
    body: JSON.stringify(body)
  });

  console.log('    ✓ LinkedIn posted:', result.id);
  return result.id;
}

// ─── Facebook ─────────────────────────────────────────────────────────────────

async function postFacebook({ caption, imageUrls }) {
  const pageId    = process.env.META_PAGE_ID;
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (!pageId || !pageToken) throw new Error('Missing Facebook credentials');

  if (imageUrls.length === 0) {
    // 純文字貼文
    const r = await apiFetch(
      `https://graph.facebook.com/v19.0/${pageId}/feed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: caption, access_token: pageToken })
      }
    );
    console.log('    ✓ Facebook text post:', r.id);
    return r.id;
  }

  if (imageUrls.length === 1) {
    // 單圖
    const r = await apiFetch(
      `https://graph.facebook.com/v19.0/${pageId}/photos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imageUrls[0], caption, access_token: pageToken, published: true })
      }
    );
    console.log('    ✓ Facebook photo post:', r.id);
    return r.id;
  }

  // 多圖輪播：先上傳每張圖（unpublished），再合併
  const photoIds = [];
  for (const imgUrl of imageUrls.slice(0, 10)) {
    const r = await apiFetch(
      `https://graph.facebook.com/v19.0/${pageId}/photos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imgUrl, access_token: pageToken, published: false })
      }
    );
    photoIds.push({ media_fbid: r.id });
    await sleep(300);
  }

  const r = await apiFetch(
    `https://graph.facebook.com/v19.0/${pageId}/feed`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: caption, attached_media: photoIds, access_token: pageToken })
    }
  );
  console.log('    ✓ Facebook carousel post:', r.id);
  return r.id;
}

// ─── Instagram ────────────────────────────────────────────────────────────────

async function postInstagram({ caption, imageUrls }) {
  const igUserId  = process.env.META_IG_USER_ID;
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (!igUserId || !pageToken) throw new Error('Missing Instagram credentials');

  const images = imageUrls.slice(0, 10);

  if (images.length === 0) {
    console.warn('    ⚠ Instagram skipped — no images provided (IG requires at least 1 image)');
    return null;
  }

  if (images.length === 1) {
    // 單圖貼文
    const container = await apiFetch(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: images[0], caption, access_token: pageToken })
      }
    );
    await sleep(3000); // IG 需要等待媒體處理
    const publish = await apiFetch(
      `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: container.id, access_token: pageToken })
      }
    );
    console.log('    ✓ Instagram single photo posted:', publish.id);
    return publish.id;
  }

  // 輪播貼文：建立每張圖的子容器
  const childIds = [];
  for (const imgUrl of images) {
    const child = await apiFetch(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imgUrl, is_carousel_item: true, access_token: pageToken })
      }
    );
    childIds.push(child.id);
    await sleep(500);
  }

  // 建立輪播容器
  const carousel = await apiFetch(
    `https://graph.facebook.com/v19.0/${igUserId}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: 'CAROUSEL', caption, children: childIds.join(','), access_token: pageToken })
    }
  );

  await sleep(5000); // 等待 IG 處理輪播

  const publish = await apiFetch(
    `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: carousel.id, access_token: pageToken })
    }
  );
  console.log('    ✓ Instagram carousel posted:', publish.id);
  return publish.id;
}

// ─── Threads ──────────────────────────────────────────────────────────────────

async function postThreads({ caption, imageUrls }) {
  const userId      = process.env.THREADS_USER_ID;
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  if (!userId || !accessToken) throw new Error('Missing Threads credentials');

  const images = imageUrls.slice(0, 10);

  if (images.length === 0) {
    // 純文字
    const container = await apiFetch(
      `https://graph.threads.net/v1.0/${userId}/threads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_type: 'TEXT', text: caption, access_token: accessToken })
      }
    );
    await sleep(2000);
    const publish = await apiFetch(
      `https://graph.threads.net/v1.0/${userId}/threads_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: container.id, access_token: accessToken })
      }
    );
    console.log('    ✓ Threads text post:', publish.id);
    return publish.id;
  }

  if (images.length === 1) {
    const container = await apiFetch(
      `https://graph.threads.net/v1.0/${userId}/threads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_type: 'IMAGE', image_url: images[0], text: caption, access_token: accessToken })
      }
    );
    await sleep(2000);
    const publish = await apiFetch(
      `https://graph.threads.net/v1.0/${userId}/threads_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: container.id, access_token: accessToken })
      }
    );
    console.log('    ✓ Threads image post:', publish.id);
    return publish.id;
  }

  // Threads 輪播
  const childIds = [];
  for (const imgUrl of images) {
    const child = await apiFetch(
      `https://graph.threads.net/v1.0/${userId}/threads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_type: 'IMAGE', image_url: imgUrl, is_carousel_item: true, access_token: accessToken })
      }
    );
    childIds.push(child.id);
    await sleep(500);
  }

  const carousel = await apiFetch(
    `https://graph.threads.net/v1.0/${userId}/threads`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: 'CAROUSEL', text: caption, children: childIds.join(','), access_token: accessToken })
    }
  );
  await sleep(3000);
  const publish = await apiFetch(
    `https://graph.threads.net/v1.0/${userId}/threads_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: carousel.id, access_token: accessToken })
    }
  );
  console.log('    ✓ Threads carousel post:', publish.id);
  return publish.id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 冷杉 Cedar — Social Publisher Starting...');

  if (!process.env.NOTION_TOKEN)       throw new Error('Missing env: NOTION_TOKEN');
  if (!process.env.NOTION_DATABASE_ID) throw new Error('Missing env: NOTION_DATABASE_ID');

  const { results } = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      property: 'Social Status',
      select: { equals: 'Ready to Post' }
    }
  });

  console.log(`Found ${results.length} post(s) ready to publish`);
  if (results.length === 0) { console.log('✅ Nothing to post.'); return; }

  for (const page of results) {
    const title     = getProp(page.properties['Title']);
    const caption   = getProp(page.properties['IG/FB/LinkedIn Caption']);
    const threads   = getProp(page.properties['Threads Post']);
    const imgText   = getProp(page.properties['Carousel Images']);
    const imageUrls = parseImageUrls(imgText);

    console.log(`\n  📤 Posting: ${title} (${imageUrls.length} image(s))`);

    const errors = [];

    try { await postLinkedIn({ caption, imageUrls }); }
    catch (e) { errors.push(`LinkedIn: ${e.message}`); console.error('    ✗ LinkedIn failed:', e.message); }

    try { await postFacebook({ caption, imageUrls }); }
    catch (e) { errors.push(`Facebook: ${e.message}`); console.error('    ✗ Facebook failed:', e.message); }

    try { await postInstagram({ caption, imageUrls }); }
    catch (e) { errors.push(`Instagram: ${e.message}`); console.error('    ✗ Instagram failed:', e.message); }

    try { await postThreads({ caption: threads || caption, imageUrls }); }
    catch (e) { errors.push(`Threads: ${e.message}`); console.error('    ✗ Threads failed:', e.message); }

    // 更新 Notion Social Status
    const newStatus = errors.length === 0 ? 'Posted' : 'Ready to Post';
    await notion.pages.update({
      page_id: page.id,
      properties: {
        'Social Status': { select: { name: newStatus } }
      }
    });

    if (errors.length === 0) {
      console.log(`    ✓ Social Status → Posted`);
    } else {
      console.warn(`    ⚠ ${errors.length} platform(s) failed. Social Status kept as "Ready to Post".`);
      console.warn('    Errors:', errors.join(' | '));
    }
  }

  console.log('\n✅ Social publishing complete!');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
