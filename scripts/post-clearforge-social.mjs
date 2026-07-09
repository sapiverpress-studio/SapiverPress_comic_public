import fs from "fs/promises";
import fssync from "fs";
import path from "path";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
const MODE = (process.env.CLEARFORGE_POST_MODE || "dry_run").toLowerCase();
const OUT = path.join(ROOT, "social", "clearforge", DATE);
const MANIFEST = path.join(OUT, "manifest.json");
const RESULT = path.join(OUT, "post-result.json");
const DEFAULT_PINTEREST_BOARD_NAME = "Sapiver Press Comic";

function abs(rel) { return path.isAbsolute(rel) ? rel : path.join(ROOT, rel); }
async function readRoot(rel) { return fs.readFile(abs(rel), "utf8"); }
function b64(file) { return fssync.readFileSync(abs(file)).toString("base64"); }
function clean(text, limit) { return String(text || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, limit); }
function compactError(error) { return String(error?.message || error || "Unknown error").replace(/\s+/g, " ").slice(0, 2200); }
function truthy(value) { return ["1", "true", "yes", "y", "on"].includes(String(value || "").toLowerCase()); }
async function jsonFetch(url, options = {}) { const res = await fetch(url, options); const text = await res.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; } if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(data).slice(0, 1600)}`); return data; }
async function safe(name, fn) { try { return await fn(); } catch (error) { return { failed: true, channel: name, error: compactError(error) }; } }
async function readExisting() { try { return JSON.parse(await fs.readFile(RESULT, "utf8")); } catch { return {}; } }

function facebookToken() { return String(process.env.FB_PAGE_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim(); }
function facebookPageId() { return String(process.env.FB_PAGE_ID || process.env.FACEBOOK_PAGE_ID || "").trim(); }

async function resolveFacebookPageAccessToken(token, pageId) {
  try {
    const url = new URL("https://graph.facebook.com/v20.0/me/accounts");
    url.searchParams.set("fields", "id,name,access_token");
    url.searchParams.set("access_token", token);
    const accounts = await jsonFetch(url.toString());
    const page = (accounts.data || []).find((item) => String(item.id) === String(pageId));
    if (page?.access_token) return { token: page.access_token, page_name: page.name || null, resolved: true };
  } catch {}
  return { token, page_name: null, resolved: false };
}

async function verifyFacebook() {
  const rawToken = facebookToken();
  const pageId = facebookPageId();
  if (!rawToken || !pageId) return { ok: false, reason: "missing_facebook_secrets" };
  const resolved = await resolveFacebookPageAccessToken(rawToken, pageId);
  const url = new URL(`https://graph.facebook.com/v20.0/${pageId}`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", resolved.token);
  const page = await jsonFetch(url.toString());
  return { ok: true, page_id: page.id, page_name: page.name || resolved.page_name || null, resolved_page_token: resolved.resolved };
}

async function listPinterestBoards(token) {
  const boards = [];
  let bookmark = "";
  do {
    const url = new URL("https://api.pinterest.com/v5/boards");
    url.searchParams.set("page_size", "100");
    if (bookmark) url.searchParams.set("bookmark", bookmark);
    const data = await jsonFetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    boards.push(...(data.items || []));
    bookmark = data.bookmark || "";
  } while (bookmark);
  return boards;
}

async function createPinterestBoard(token, name) {
  return jsonFetch("https://api.pinterest.com/v5/boards", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: "Daily Sapiver Press and Clearforge pins." })
  });
}

async function resolvePinterestBoard(token) {
  const explicitId = String(process.env.PINTEREST_BOARD_ID || "").trim();
  const boardName = String(process.env.PINTEREST_BOARD_NAME || DEFAULT_PINTEREST_BOARD_NAME).trim();

  if (explicitId) {
    const board = await jsonFetch(`https://api.pinterest.com/v5/boards/${explicitId}`, { headers: { Authorization: `Bearer ${token}` } });
    return { id: board.id || explicitId, name: board.name || boardName, source: "board_id" };
  }

  const boards = await listPinterestBoards(token);
  const exact = boards.find((board) => String(board.name || "").trim().toLowerCase() === boardName.toLowerCase());
  if (exact?.id) return { id: exact.id, name: exact.name || boardName, source: "board_name" };

  const created = await createPinterestBoard(token, boardName);
  if (!created?.id) throw new Error(`Pinterest board creation returned no id for ${boardName}`);
  return { id: created.id, name: created.name || boardName, source: "created_board" };
}

async function verifyPinterest() {
  const token = String(process.env.PINTEREST_ACCESS_TOKEN || "").trim();
  if (!token) return { ok: false, reason: "missing_pinterest_access_token" };
  const board = await resolvePinterestBoard(token);
  return { ok: true, board_id: board.id, board_name: board.name, resolved_from: board.source };
}

async function refreshYouTubeAccessToken() {
  const missing = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"].filter((k) => !String(process.env[k] || "").trim());
  if (missing.length) throw new Error(`Missing YouTube secrets: ${missing.join(", ")}`);
  const body = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });
  const data = await jsonFetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!data.access_token) throw new Error("YouTube token refresh returned no access token.");
  return data.access_token;
}

async function verifyYouTube() {
  const accessToken = await refreshYouTubeAccessToken();
  const channel = await jsonFetch("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true", { headers: { Authorization: `Bearer ${accessToken}` } });
  const item = channel.items?.[0];
  return { ok: true, channel_id: item?.id || null, channel_title: item?.snippet?.title || null };
}

async function postPinterest(manifest) {
  if (manifest.approved?.pinterest !== true) return { skipped: true, reason: "pinterest_not_approved" };
  const token = String(process.env.PINTEREST_ACCESS_TOKEN || "").trim();
  if (!token) return { skipped: true, reason: "missing_pinterest_access_token" };
  const board = await resolvePinterestBoard(token);
  const title = clean(await readRoot(manifest.pinterest.title), 100);
  const description = clean(await readRoot(manifest.pinterest.caption), 480);
  const posted = await jsonFetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      board_id: board.id,
      title,
      description,
      link: manifest.article_url || undefined,
      media_source: { source_type: "image_base64", content_type: "image/png", data: b64(manifest.pinterest.image) }
    })
  });
  return { ...posted, board_id: board.id, board_name: board.name, resolved_from: board.source };
}

async function uploadFacebookPhoto(pageId, token, relImage) {
  const form = new FormData();
  form.append("published", "false");
  form.append("access_token", token);
  const bytes = fssync.readFileSync(abs(relImage));
  form.append("source", new Blob([bytes], { type: "image/png" }), path.basename(relImage));
  return jsonFetch(`https://graph.facebook.com/v20.0/${pageId}/photos`, { method: "POST", body: form });
}

async function postFacebook(manifest) {
  if (manifest.approved?.facebook !== true) return { skipped: true, reason: "facebook_not_approved" };
  const rawToken = facebookToken();
  const pageId = facebookPageId();
  if (!rawToken || !pageId) return { skipped: true, reason: "missing_facebook_secrets" };
  const resolved = await resolveFacebookPageAccessToken(rawToken, pageId);
  const uploaded = [];
  for (const image of manifest.facebook.images || []) uploaded.push(await uploadFacebookPhoto(pageId, resolved.token, image));
  const body = new URLSearchParams();
  body.set("message", await readRoot(manifest.facebook.post_caption));
  body.set("access_token", resolved.token);
  uploaded.forEach((photo, i) => body.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: photo.id })));
  const post = await jsonFetch(`https://graph.facebook.com/v20.0/${pageId}/feed`, { method: "POST", body });
  const firstCommentText = clean(await readRoot(manifest.facebook.first_comment), 8000);
  if (firstCommentText && post.id) {
    const commentBody = new URLSearchParams();
    commentBody.set("message", firstCommentText);
    commentBody.set("access_token", resolved.token);
    post.first_comment = await jsonFetch(`https://graph.facebook.com/v20.0/${post.id}/comments`, { method: "POST", body: commentBody });
  }
  return post;
}

async function postYouTube(manifest) {
  if (manifest.approved?.youtube !== true) return { skipped: true, reason: "youtube_not_approved" };
  const accessToken = await refreshYouTubeAccessToken();
  const videoPath = abs(manifest.youtube.video);
  const bytes = fssync.readFileSync(videoPath);
  const title = clean(await readRoot(manifest.youtube.title), 95);
  const description = clean(await readRoot(manifest.youtube.caption), 4500);
  const metadata = {
    snippet: { title, description, tags: ["AI news", "practical AI", "Clearforge"], categoryId: process.env.YOUTUBE_CATEGORY_ID || "27", defaultLanguage: "en-GB" },
    status: { privacyStatus: process.env.YOUTUBE_PRIVACY_STATUS || "public", selfDeclaredMadeForKids: false, containsSyntheticMedia: true }
  };
  const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(bytes.length) },
    body: JSON.stringify(metadata)
  });
  const initText = await initRes.text();
  const uploadUrl = initRes.headers.get("location");
  if (!initRes.ok || !uploadUrl) throw new Error(`YouTube init failed ${initRes.status}: ${initText.slice(0, 1000)}`);
  const uploadRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.length) }, body: bytes });
  const uploadText = await uploadRes.text();
  let data = {}; try { data = uploadText ? JSON.parse(uploadText) : {}; } catch { data = { raw: uploadText }; }
  if (!uploadRes.ok) throw new Error(`YouTube upload failed ${uploadRes.status}: ${uploadText.slice(0, 1200)}`);
  return { ...data, youtube_url: data.id ? `https://www.youtube.com/watch?v=${data.id}` : null };
}

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const existing = await readExisting();
const force = truthy(process.env.FORCE_CLEARFORGE_POST || "");
const result = { date: DATE, mode: MODE, type: manifest.type, existing_result_detected: Boolean(existing?.facebook || existing?.pinterest || existing?.youtube) };

if (MODE === "verify") {
  result.facebook = await safe("facebook", verifyFacebook);
  result.pinterest = await safe("pinterest", verifyPinterest);
  result.youtube = await safe("youtube", verifyYouTube);
} else if (MODE !== "live") {
  result.facebook = { dry_run: true, approved: manifest.approved?.facebook === true };
  result.pinterest = { dry_run: true, approved: manifest.approved?.pinterest === true };
  result.youtube = { dry_run: true, approved: manifest.approved?.youtube === true };
} else {
  const alreadyFacebook = Boolean(existing?.facebook?.id) && !force;
  const alreadyPinterest = Boolean(existing?.pinterest?.id) && !force;
  const alreadyYouTube = Boolean(existing?.youtube?.id || existing?.youtube?.youtube_url) && !force;

  result.facebook = alreadyFacebook ? { skipped: true, reason: "already_posted" } : await safe("facebook", () => postFacebook(manifest));
  result.pinterest = alreadyPinterest ? { skipped: true, reason: "already_posted" } : await safe("pinterest", () => postPinterest(manifest));
  result.youtube = alreadyYouTube ? { skipped: true, reason: "already_posted" } : await safe("youtube", () => postYouTube(manifest));
}

await fs.writeFile(RESULT, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(`${MODE === "live" ? "Processed live" : MODE === "verify" ? "Verified credentials for" : "Prepared dry run for"} Clearforge social posting ${DATE}`);
