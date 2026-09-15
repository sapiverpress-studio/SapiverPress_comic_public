import fs from 'node:fs';
import path from 'node:path';

const API_VERSION = process.env.META_GRAPH_API_VERSION || 'v24.0';
const date = String(process.env.EDITION_DATE || '').trim();
const candidate = String(process.env.CANDIDATE_ID || '').trim();
const sourceRoot = path.resolve(process.env.SOURCE_ROOT || 'vendor/sapiver-forge');
const receiptDir = path.resolve(process.env.BRIDGE_RECEIPT_DIR || `social/daily-brief/${date}`);
const token = String(process.env.FB_PAGE_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim();
const igUserId = String(process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '').trim();

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('EDITION_DATE must be YYYY-MM-DD.');
if (!/^[a-f0-9]{64}$/.test(candidate)) throw new Error('CANDIDATE_ID must be a 64-character hex digest.');
if (!token) throw new Error('FB_PAGE_TOKEN is required for Instagram publishing.');
if (!/^\d+$/.test(igUserId)) throw new Error('INSTAGRAM_BUSINESS_ACCOUNT_ID is required.');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const source = (...parts) => path.join(sourceRoot, ...parts);
const manifest = readJson(source('news-intelligence', date, 'manifest.json'));
const release = readJson(source('news-intelligence', date, 'site-release.json'));
if (manifest.date !== date || manifest.candidate_id !== candidate || release.candidate_id !== candidate || manifest.newsletter_ready_for_human_approval !== true) {
  throw new Error('Requested candidate does not match the released Daily Brief edition.');
}

const metadata = readJson(source('reports', 'daily-intelligence', date, 'episode-metadata.json'));
if (!/^[a-z0-9][a-z0-9-]*$/i.test(metadata.slug || '')) throw new Error('Invalid episode slug.');
const caption = String(metadata.short?.description || metadata.episode?.episode_description || metadata.short?.title || 'Sapiver Forge Daily Brief').trim();
const videoUrl = `https://suite.sapiverpress.co.uk/podcast/episodes/${encodeURIComponent(metadata.slug)}-short.mp4`;

fs.mkdirSync(receiptDir, { recursive: true });
const receiptPath = path.join(receiptDir, 'instagram-reel.json');
let receipt = fs.existsSync(receiptPath) ? readJson(receiptPath) : { date, candidate_id: candidate, video_url: videoUrl };
if (receipt.candidate_id && receipt.candidate_id !== candidate) throw new Error('Instagram receipt belongs to a different candidate.');
if (receipt.media_id) {
  console.log(`Instagram already posted; retaining media ID ${receipt.media_id}.`);
  process.exit(0);
}

function save(patch) {
  receipt = { ...receipt, ...patch, date, candidate_id: candidate, video_url: videoUrl, updated_at: new Date().toISOString() };
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(data).slice(0, 1200)}`);
  return data;
}

async function assertPublicVideo() {
  let response = await fetch(videoUrl, { method: 'HEAD', redirect: 'follow' });
  if (!response.ok || Number(response.headers.get('content-length') || 0) === 0) {
    response = await fetch(videoUrl, { headers: { Range: 'bytes=0-0' }, redirect: 'follow' });
  }
  if (!response.ok && response.status !== 206) throw new Error(`Released Short is not publicly reachable for Instagram: HTTP ${response.status}`);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType && !contentType.includes('video') && !contentType.includes('octet-stream')) {
    throw new Error(`Released Short returned unexpected content type: ${contentType}`);
  }
}

await assertPublicVideo();

let containerId = receipt.container_id || '';
if (!containerId) {
  const body = new URLSearchParams({
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: 'true'
  });
  const created = await jsonFetch(`https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(igUserId)}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!created.id) throw new Error('Instagram returned no container ID.');
  containerId = String(created.id);
  save({ status: 'container_created', container_id: containerId, created_at: new Date().toISOString() });
}

let finished = false;
for (let attempt = 1; attempt <= 30; attempt += 1) {
  const status = await jsonFetch(`https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(containerId)}?fields=status_code,status`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  save({ status: 'processing', container_id: containerId, status_code: status.status_code || '', status_text: status.status || '', poll_attempt: attempt });
  if (status.status_code === 'FINISHED') {
    finished = true;
    break;
  }
  if (['ERROR', 'EXPIRED'].includes(status.status_code)) throw new Error(`Instagram container failed: ${status.status || status.status_code}`);
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (!finished) throw new Error('Instagram Reel did not finish processing within 150 seconds.');

save({ status: 'publish_started', container_id: containerId });
const published = await jsonFetch(`https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(igUserId)}/media_publish`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ creation_id: containerId })
});
if (!published.id) throw new Error('Instagram returned no media ID after publish.');
save({ status: 'published', media_id: String(published.id), published_at: new Date().toISOString() });
console.log(`Instagram Reel published: ${published.id}`);
