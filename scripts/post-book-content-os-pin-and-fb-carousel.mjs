import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const MODE = (process.env.BOOK_CONTENT_OS_SOCIAL_POST_MODE || "dry_run").toLowerCase();
const MANIFEST = path.join(ROOT, "social", "book-content-os", DATE, "manifest.json");
const MANIFEST_DIR = path.dirname(MANIFEST);
const DEFAULT_PINTEREST_BOARD_ID = "1038924276479876865";
const DEFAULT_PINTEREST_BOARD_NAME = "Sapiver Press Comic";

function absRoot(rel) { return path.isAbsolute(rel) ? rel : path.join(ROOT, rel); }
function absManifest(rel) { if (!rel) return rel; if (path.isAbsolute(rel)) return rel; if (rel.startsWith("social/") || rel.startsWith("assets/")) return path.join(ROOT, rel); return path.join(MANIFEST_DIR, rel); }
async function read(rel) { return fs.readFile(absManifest(rel), "utf8"); }
async function readOptional(rel, fallback = "") { if (!rel) return fallback; try { return await read(rel); } catch { return fallback; } }
function b64(file) { return fssync.readFileSync(file).toString("base64"); }
function pinterestBoardId() { return (process.env.PINTEREST_BOARD_ID || "").trim() || DEFAULT_PINTEREST_BOARD_ID; }
function facebookToken() { return (process.env.FB_PAGE_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim(); }
function facebookPageId() { return (process.env.FB_PAGE_ID || process.env.FACEBOOK_PAGE_ID || "").trim(); }
function pinterestDescription(text) { return String(text || "").replace(/\s+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 480); }
function compactError(error) { return String(error?.message || error || "Unknown error").replace(/\s+/g, " ").slice(0, 1600); }
async function safeChannel(channel, fn) { try { return await fn(); } catch (error) { const message = compactError(error); console.warn(`${channel} failed but workflow will continue: ${message}`); return { failed: true, channel, error: message, note: `${channel} live posting failed. Check token permissions/settings for this channel.` }; } }
async function jsonFetch(url, options) { const res = await fetch(url, options); const text = await res.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; } if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(data).slice(0, 1200)}`); return data; }
function ensureAdapterApplied() {
  try {
    execFileSync("node", ["scripts/build-book-content-os-platform-adapter.mjs"], { stdio: "inherit", env: process.env });
    execFileSync("node", ["scripts/apply-platform-adapter-copy.mjs", "book-content-os"], { stdio: "inherit", env: process.env });
  } catch (error) {
    console.warn(`Book Content OS platform adapter failed; using existing copy files. ${compactError(error)}`);
  }
}

async function postPinterest(manifest) {
  const token = (process.env.PINTEREST_ACCESS_TOKEN || "").trim();
  const boardId = pinterestBoardId();
  if (!token) return { skipped: true, reason: "Missing Pinterest access token", expected_secret_names: ["PINTEREST_ACCESS_TOKEN"], note: "Pinterest posting skipped. Add the GitHub secret PINTEREST_ACCESS_TOKEN to enable live Pinterest posting. Other enabled channels can still run.", board_id: boardId, board_name: DEFAULT_PINTEREST_BOARD_NAME };
  const imagePath = absRoot(manifest.pinterest.image);
  const title = (await readOptional(manifest.pinterest.title, "Book Content OS Lite + Pro")).trim().slice(0, 100);
  const description = pinterestDescription(await read(manifest.pinterest.caption));
  return jsonFetch("https://api.pinterest.com/v5/pins", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ board_id: boardId, title, description, media_source: { source_type: "image_base64", content_type: "image/png", data: b64(imagePath) } }) });
}

async function uploadFacebookPhoto(pageId, token, relImage, relCaption) {
  const form = new FormData();
  form.append("published", "false");
  form.append("access_token", token);
  const caption = await readOptional(relCaption, "");
  if (caption.trim()) form.append("caption", caption);
  const bytes = fssync.readFileSync(absRoot(relImage));
  form.append("source", new Blob([bytes], { type: "image/png" }), path.basename(relImage));
  return jsonFetch(`https://graph.facebook.com/v20.0/${pageId}/photos`, { method: "POST", body: form });
}
async function postFacebookFirstComment(token, postId, relComment) { const message = await readOptional(relComment, ""); if (!message.trim() || !postId) return null; const body = new URLSearchParams(); body.set("message", message); body.set("access_token", token); return jsonFetch(`https://graph.facebook.com/v20.0/${postId}/comments`, { method: "POST", body }); }
async function resolveFacebookPageAccessToken(token, pageId) { try { const url = new URL("https://graph.facebook.com/v20.0/me/accounts"); url.searchParams.set("fields", "id,name,access_token"); url.searchParams.set("access_token", token); const accounts = await jsonFetch(url.toString()); const page = (accounts.data || []).find((item) => String(item.id) === String(pageId)); if (page?.access_token) return { token: page.access_token, resolved: true, page_name: page.name || null }; } catch (err) { console.log(`Could not resolve Facebook page token from /me/accounts; using supplied token. ${String(err.message || err).slice(0, 300)}`); } return { token, resolved: false, page_name: null }; }
async function postFacebookCarousel(manifest) {
  const token = facebookToken();
  const pageId = facebookPageId();
  if (!token || !pageId) return { skipped: true, reason: "Missing Facebook token or page ID", expected_secret_names: ["FB_PAGE_TOKEN", "FB_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN", "FACEBOOK_PAGE_ID"], note: "Add/pass Facebook secrets to enable carousel posting." };
  const resolvedPage = await resolveFacebookPageAccessToken(token, pageId);
  const pageToken = resolvedPage.token;
  const uploaded = [];
  const captions = manifest.facebook.image_captions || [];
  for (let i = 0; i < manifest.facebook.images.length; i++) uploaded.push(await uploadFacebookPhoto(pageId, pageToken, manifest.facebook.images[i], captions[i]));
  const body = new URLSearchParams();
  body.set("message", await read(manifest.facebook.post_caption));
  body.set("access_token", pageToken);
  uploaded.forEach((photo, i) => body.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: photo.id })));
  const post = await jsonFetch(`https://graph.facebook.com/v20.0/${pageId}/feed`, { method: "POST", body });
  const firstComment = await postFacebookFirstComment(pageToken, post.id, manifest.facebook.first_comment);
  return { ...post, first_comment: firstComment, used_resolved_page_token: resolvedPage.resolved, page_name: resolvedPage.page_name };
}
async function pinterestVideoRecord(manifest) { if (!manifest.pinterest_video) return null; return { prepared: true, posted: false, note: "Pinterest-ready MP4 generated from the same five images used in the Facebook carousel. Automatic video-pin upload runs in the Pinterest video workflow.", board_id: pinterestBoardId(), board_name: DEFAULT_PINTEREST_BOARD_NAME, video: manifest.pinterest_video.video, source_images: manifest.pinterest_video.source_images || [], title: await readOptional(manifest.pinterest_video.title, "Book Content OS video"), caption: pinterestDescription(await readOptional(manifest.pinterest_video.caption, "")), first_comment: await readOptional(manifest.pinterest_video.first_comment, "") }; }

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
ensureAdapterApplied();
const out = { date: DATE, mode: MODE, type: manifest.type, cta_text: manifest.cta_text || "link in bio", pinterest_board_id: pinterestBoardId(), pinterest_board_name: DEFAULT_PINTEREST_BOARD_NAME };
if (MODE !== "live") {
  out.pinterest = { dry_run: true, image: manifest.pinterest.image, title: await readOptional(manifest.pinterest.title, "Book Content OS Lite + Pro"), caption: pinterestDescription(await read(manifest.pinterest.caption)), first_comment: await readOptional(manifest.pinterest.first_comment, "") };
  out.pinterest_video = await pinterestVideoRecord(manifest);
  out.facebook = { dry_run: true, images: manifest.facebook.images, image_captions: await Promise.all((manifest.facebook.image_captions || []).map((rel) => readOptional(rel, ""))), caption: await read(manifest.facebook.post_caption), first_comment: await readOptional(manifest.facebook.first_comment, "") };
} else {
  out.facebook = await safeChannel("Facebook", () => postFacebookCarousel(manifest));
  out.pinterest = await safeChannel("Pinterest", () => postPinterest(manifest));
  out.pinterest_video = await pinterestVideoRecord(manifest);
}
const recordPath = path.join(ROOT, "social", "book-content-os", DATE, "post-result.json");
await fs.writeFile(recordPath, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`${MODE === "live" ? "Posted, skipped or recorded channel failure for" : "Prepared"} Book Content OS Pinterest pin, Pinterest video asset and Facebook carousel for ${DATE} to ${DEFAULT_PINTEREST_BOARD_NAME}`);
