import fs from "fs/promises";
import fssync from "fs";
import path from "path";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const MODE = (process.env.FTPE_SOCIAL_POST_MODE || "dry_run").toLowerCase();
const MANIFEST = path.join(ROOT, "social", "ftpe", DATE, "manifest.json");
const MANIFEST_DIR = path.dirname(MANIFEST);
const DEFAULT_PINTEREST_BOARD_ID = "1038924276479876865";
const DEFAULT_PINTEREST_BOARD_NAME = "Sapiver Press Comic";

function absRoot(rel) {
  return path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
}

function absManifest(rel) {
  if (!rel) return rel;
  if (path.isAbsolute(rel)) return rel;
  if (rel.startsWith("social/") || rel.startsWith("assets/")) return path.join(ROOT, rel);
  return path.join(MANIFEST_DIR, rel);
}

async function read(rel) { return fs.readFile(absManifest(rel), "utf8"); }
async function readOptional(rel, fallback = "") {
  if (!rel) return fallback;
  try { return await read(rel); } catch { return fallback; }
}
function b64(file) { return fssync.readFileSync(file).toString("base64"); }
function pinterestBoardId() { return (process.env.PINTEREST_BOARD_ID || "").trim() || DEFAULT_PINTEREST_BOARD_ID; }
function pinterestDescription(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 480);
}
async function jsonFetch(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(data).slice(0, 1200)}`);
  return data;
}

async function postPinterest(manifest) {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  const boardId = pinterestBoardId();
  if (!token) throw new Error("Missing PINTEREST_ACCESS_TOKEN");
  const imagePath = absRoot(manifest.pinterest.image);
  const title = (await readOptional(manifest.pinterest.title, "First-Time Sudoku Publisher Edition")).trim().slice(0, 100);
  const description = pinterestDescription(await read(manifest.pinterest.caption));
  return jsonFetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      board_id: boardId,
      title,
      description,
      link: manifest.cta,
      media_source: { source_type: "image_base64", content_type: "image/png", data: b64(imagePath) },
    }),
  });
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

async function postFacebookFirstComment(token, postId, relComment) {
  const message = await readOptional(relComment, "");
  if (!message.trim() || !postId) return null;
  const body = new URLSearchParams();
  body.set("message", message);
  body.set("access_token", token);
  return jsonFetch(`https://graph.facebook.com/v20.0/${postId}/comments`, { method: "POST", body });
}

async function postFacebookCarousel(manifest) {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;
  if (!token || !pageId) {
    return {
      skipped: true,
      reason: "Missing FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID",
      note: "Pinterest side can still run. Add Facebook secrets to enable carousel posting.",
    };
  }
  const uploaded = [];
  const captions = manifest.facebook.image_captions || [];
  for (let i = 0; i < manifest.facebook.images.length; i++) uploaded.push(await uploadFacebookPhoto(pageId, token, manifest.facebook.images[i], captions[i]));
  const body = new URLSearchParams();
  body.set("message", await read(manifest.facebook.post_caption));
  body.set("access_token", token);
  uploaded.forEach((photo, i) => body.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: photo.id })));
  const post = await jsonFetch(`https://graph.facebook.com/v20.0/${pageId}/feed`, { method: "POST", body });
  const firstComment = await postFacebookFirstComment(token, post.id, manifest.facebook.first_comment);
  return { ...post, first_comment: firstComment };
}

async function pinterestVideoRecord(manifest) {
  if (!manifest.pinterest_video) return null;
  return {
    prepared: true,
    posted: false,
    note: "Pinterest-ready MP4 generated from the same five images used in the Facebook carousel. Automatic video-pin upload runs in the delayed Pinterest video workflow.",
    board_id: pinterestBoardId(),
    board_name: DEFAULT_PINTEREST_BOARD_NAME,
    video: manifest.pinterest_video.video,
    source_images: manifest.pinterest_video.source_images || [],
    title: await readOptional(manifest.pinterest_video.title, "KDP Sudoku Starter Pack video"),
    caption: pinterestDescription(await readOptional(manifest.pinterest_video.caption, "")),
    first_comment: await readOptional(manifest.pinterest_video.first_comment, ""),
  };
}

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const out = { date: DATE, mode: MODE, type: manifest.type, cta: manifest.cta, pinterest_board_id: pinterestBoardId(), pinterest_board_name: DEFAULT_PINTEREST_BOARD_NAME };
if (MODE !== "live") {
  out.pinterest = {
    dry_run: true,
    image: manifest.pinterest.image,
    title: await readOptional(manifest.pinterest.title, "First-Time Sudoku Publisher Edition"),
    caption: pinterestDescription(await read(manifest.pinterest.caption)),
    first_comment: await readOptional(manifest.pinterest.first_comment, ""),
  };
  out.pinterest_video = await pinterestVideoRecord(manifest);
  out.facebook = {
    dry_run: true,
    images: manifest.facebook.images,
    image_captions: await Promise.all((manifest.facebook.image_captions || []).map((rel) => readOptional(rel, ""))),
    caption: await read(manifest.facebook.post_caption),
    first_comment: await readOptional(manifest.facebook.first_comment, ""),
  };
} else {
  out.pinterest = await postPinterest(manifest);
  out.pinterest_video = await pinterestVideoRecord(manifest);
  out.facebook = await postFacebookCarousel(manifest);
}
const recordPath = path.join(ROOT, "social", "ftpe", DATE, "post-result.json");
await fs.writeFile(recordPath, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`${MODE === "live" ? "Posted" : "Prepared"} FTPE Pinterest pin, Pinterest video asset and Facebook carousel for ${DATE} to ${DEFAULT_PINTEREST_BOARD_NAME}`);
