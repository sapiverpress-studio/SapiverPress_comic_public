import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const MODE = (process.env.YOUTUBE_POST_MODE || process.env.BOOK_CONTENT_OS_SOCIAL_POST_MODE || "dry_run").toLowerCase();
const OUT = path.join(ROOT, "social", "book-content-os", DATE);
const MANIFEST = path.join(OUT, "manifest.json");
const RESULT = path.join(OUT, "youtube", "post-result.json");

function absRoot(rel) { return path.isAbsolute(rel) ? rel : path.join(ROOT, rel); }
function absManifest(rel) { if (!rel) return rel; if (path.isAbsolute(rel)) return rel; if (rel.startsWith("social/") || rel.startsWith("assets/")) return path.join(ROOT, rel); return path.join(OUT, rel); }
async function readOptional(rel, fallback = "") { if (!rel) return fallback; try { return await fs.readFile(absManifest(rel), "utf8"); } catch { return fallback; } }
async function readJsonOptional(filePath) { try { return JSON.parse(await fs.readFile(filePath, "utf8")); } catch { return null; } }
function isTruthy(value) { return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase()); }
function cleanText(text, limit) { return String(text || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, limit); }
function compactError(error) { return String(error?.message || error || "Unknown error").replace(/\s+/g, " ").slice(0, 3000); }
function buildTitle(rawTitle) { const title = cleanText(rawTitle || "Book Content OS Lite + Pro | Review notes to posts", 95); return title || "Book Content OS Lite + Pro"; }
function buildDescription(rawCaption) { const base = cleanText(rawCaption, 2200); const footer = ["", "Sapiver Press", "link in bio", "", "Local-first browser app. Manual backup/import. Not cloud sync.", "", "#Shorts #BookReviewers #ARCReaders #BookContent #BookTok #SapiverPress"].join("\n"); return cleanText(`${base}\n${footer}`, 4500); }
function requireManifestVideo(manifest) { const relVideo = manifest?.pinterest_video?.video; if (!relVideo) throw new Error(`No pinterest_video.video found in ${MANIFEST}`); const videoPath = absRoot(relVideo); if (!fssync.existsSync(videoPath)) throw new Error(`YouTube video file not found: ${videoPath}`); return { relVideo, videoPath }; }
function missingYouTubeSecrets() { return ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"].filter((name) => !String(process.env[name] || "").trim()); }
async function jsonFetch(url, options = {}) { const res = await fetch(url, options); const text = await res.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; } if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(data).slice(0, 1600)}`); return data; }
async function refreshAccessToken() { const body = new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET, refresh_token: process.env.YOUTUBE_REFRESH_TOKEN, grant_type: "refresh_token" }); const data = await jsonFetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }); if (!data.access_token) throw new Error(`YouTube token refresh did not return access_token: ${JSON.stringify(data).slice(0, 1600)}`); return data.access_token; }
function ensureAdapterApplied() { try { execFileSync("node", ["scripts/build-book-content-os-platform-adapter.mjs"], { stdio: "inherit", env: process.env }); execFileSync("node", ["scripts/apply-platform-adapter-copy.mjs", "book-content-os"], { stdio: "inherit", env: process.env }); } catch (error) { console.warn(`Book Content OS platform adapter failed in YouTube step; using existing copy. ${compactError(error)}`); } }
async function uploadYouTubeVideo({ accessToken, videoPath, title, description }) {
  const bytes = fssync.readFileSync(videoPath);
  const metadata = { snippet: { title, description, tags: ["book reviewers", "ARC readers", "book content", "BookTok", "Sapiver Press"], categoryId: process.env.YOUTUBE_CATEGORY_ID || "27", defaultLanguage: "en-GB" }, status: { privacyStatus: process.env.YOUTUBE_PRIVACY_STATUS || "unlisted", selfDeclaredMadeForKids: false, containsSyntheticMedia: false } };
  const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(bytes.length) }, body: JSON.stringify(metadata) });
  const initText = await initRes.text();
  const uploadUrl = initRes.headers.get("location");
  if (!initRes.ok || !uploadUrl) { let data = {}; try { data = initText ? JSON.parse(initText) : {}; } catch { data = { raw: initText }; } throw new Error(`YouTube resumable upload init failed: ${initRes.status} ${initRes.statusText}: ${JSON.stringify(data).slice(0, 1600)}`); }
  const uploadRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.length) }, body: bytes });
  const uploadText = await uploadRes.text();
  let data = {}; try { data = uploadText ? JSON.parse(uploadText) : {}; } catch { data = { raw: uploadText }; }
  if (!uploadRes.ok) throw new Error(`YouTube video upload failed: ${uploadRes.status} ${uploadRes.statusText}: ${JSON.stringify(data).slice(0, 1600)}`);
  return data;
}

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
ensureAdapterApplied();
const { relVideo, videoPath } = requireManifestVideo(manifest);
const title = buildTitle(await readOptional(manifest.pinterest_video?.title, ""));
const description = buildDescription(await readOptional(manifest.pinterest_video?.caption, ""));
const existing = await readJsonOptional(RESULT);
const alreadyPosted = Boolean(existing?.youtube?.id || existing?.youtube?.video_id);
const force = isTruthy(process.env.FORCE_YOUTUBE_POST || "");
const out = { date: DATE, mode: MODE, type: "book_content_os_youtube_short_upload_v1", cta_text: manifest.cta_text || "link in bio", video: relVideo, title, description, privacy_status: process.env.YOUTUBE_PRIVACY_STATUS || "unlisted" };
if (MODE === "live" && alreadyPosted && !force) { out.skipped = true; out.reason = "already_posted"; out.note = "YouTube upload already has a live result for this date. Set FORCE_YOUTUBE_POST=1 to override."; }
else if (MODE !== "live") { out.dry_run = true; out.note = "Prepared YouTube Shorts upload. Set YOUTUBE_POST_MODE=live and add YouTube OAuth secrets to upload."; }
else {
  const missing = missingYouTubeSecrets();
  if (missing.length) { out.skipped = true; out.missing_secrets = missing; out.note = "YouTube upload skipped because required GitHub secrets are missing."; console.warn(out.note, missing.join(", ")); }
  else {
    out.dry_run = false;
    try { const accessToken = await refreshAccessToken(); out.youtube = await uploadYouTubeVideo({ accessToken, videoPath, title, description }); out.youtube_url = out.youtube?.id ? `https://www.youtube.com/watch?v=${out.youtube.id}` : null; }
    catch (error) { out.failed = true; out.error = compactError(error); out.note = "YouTube upload failed after live mode started. Error captured here instead of disappearing from the committed result."; console.error(out.note, out.error); }
  }
}
await fs.mkdir(path.dirname(RESULT), { recursive: true });
await fs.writeFile(RESULT, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`${out.youtube ? "Posted" : out.skipped ? "Skipped" : out.failed ? "Failed" : "Prepared"} Book Content OS YouTube Short for ${DATE}`);
