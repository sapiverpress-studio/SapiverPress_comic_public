import fs from "fs/promises";
import fssync from "fs";
import path from "path";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const MODE = (process.env.FTPE_PINTEREST_VIDEO_POST_MODE || "live").toLowerCase();
const OUT = path.join(ROOT, "social", "ftpe", DATE);
const MANIFEST = path.join(OUT, "manifest.json");
const RESULT = path.join(OUT, "pinterest_video", "post-result.json");
const CTA = "https://sapiverpress.etsy.com";
const DEFAULT_PINTEREST_BOARD_ID = "1038924276479876865";
const DEFAULT_PINTEREST_BOARD_NAME = "Sapiver Press Comic";
const DEFAULT_IMAGE_PIN_LIMIT = 5;

function absRoot(rel) {
  return path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
}

function absManifest(rel) {
  if (!rel) return rel;
  if (path.isAbsolute(rel)) return rel;
  if (rel.startsWith("social/") || rel.startsWith("assets/")) return path.join(ROOT, rel);
  return path.join(OUT, rel);
}

async function readOptional(rel, fallback = "") {
  if (!rel) return fallback;
  try { return await fs.readFile(absManifest(rel), "utf8"); } catch { return fallback; }
}

async function readJsonOptional(filePath) {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")); } catch { return null; }
}

function isTruthy(value) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function b64(file) { return fssync.readFileSync(file).toString("base64"); }

function pinterestDescription(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 480);
}

function cleanTitle(file) {
  return path.basename(String(file || ""), path.extname(String(file || "")))
    .replace(/^\d+[_-]?/, "")
    .replace(/^FTPE[_-]SET[_-]\d+[_-]\d+[_-]?/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\bpngs?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toPositiveInteger(value, fallback) {
  if (String(value || "").trim().toLowerCase() === "all") return Number.MAX_SAFE_INTEGER;
  const n = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(data).slice(0, 1600)}`);
  return data;
}

function pinterestBoardId() {
  return (process.env.PINTEREST_BOARD_ID || "").trim() || DEFAULT_PINTEREST_BOARD_ID;
}

function uniqueList(values) {
  return [...new Map((values || []).filter(Boolean).map((v) => [String(v).toLowerCase(), v])).values()];
}

function imagePinSources(manifest) {
  const raw = manifest.pinterest_video?.source_images?.length
    ? manifest.pinterest_video.source_images
    : [manifest.pinterest?.image].filter(Boolean);
  const images = uniqueList(raw);
  const limit = Math.min(images.length, toPositiveInteger(process.env.PINTEREST_IMAGE_PIN_LIMIT, DEFAULT_IMAGE_PIN_LIMIT));
  return images.slice(0, limit);
}

function imagePinTitle(baseTitle, relImage, index, total) {
  const imageTitle = cleanTitle(relImage);
  const suffix = imageTitle || `image ${index + 1}`;
  const count = total > 1 ? ` ${index + 1}/${total}` : "";
  const title = `Sapiver Press daily image${count} | ${suffix}`;
  return title.trim().slice(0, 100) || String(baseTitle || "Sapiver Press daily image").trim().slice(0, 100);
}

function existingImagePin(existing, sourceImage) {
  const sourceKey = String(sourceImage || "").toLowerCase();
  return (existing?.image_pins?.pins || []).find((item) => String(item?.source_image || "").toLowerCase() === sourceKey && item?.pin?.id);
}

async function postImageToPinterest({ token, boardId, imagePath, title, description, link }) {
  return jsonFetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      board_id: boardId,
      title: title.trim().slice(0, 100),
      description: pinterestDescription(description),
      link,
      media_source: { source_type: "image_base64", content_type: "image/png", data: b64(imagePath) },
    }),
  });
}

async function uploadVideoToPinterest({ token, boardId, videoPath, title, description, link }) {
  const media = await jsonFetch("https://api.pinterest.com/v5/media", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ media_type: "video" }),
  });

  if (!media.media_id || !media.upload_url) {
    throw new Error(`Pinterest media registration did not return media_id and upload_url: ${JSON.stringify(media).slice(0, 1600)}`);
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(media.upload_parameters || {})) form.append(key, value);
  const bytes = fssync.readFileSync(videoPath);
  form.append("file", new Blob([bytes], { type: "video/mp4" }), path.basename(videoPath));

  const uploadRes = await fetch(media.upload_url, { method: "POST", body: form });
  const uploadText = await uploadRes.text();
  if (!uploadRes.ok) throw new Error(`Pinterest video binary upload failed: ${uploadRes.status} ${uploadRes.statusText}: ${uploadText.slice(0, 1600)}`);

  let lastStatus = null;
  for (let attempt = 1; attempt <= 24; attempt++) {
    await sleep(10000);
    const status = await jsonFetch(`https://api.pinterest.com/v5/media/${media.media_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    lastStatus = status;
    const state = String(status.status || status.upload_status || "").toLowerCase();
    if (["succeeded", "success", "available", "ready"].includes(state)) break;
    if (["failed", "failure", "rejected"].includes(state)) throw new Error(`Pinterest video processing failed: ${JSON.stringify(status).slice(0, 1600)}`);
  }

  const pin = await jsonFetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      board_id: boardId,
      title: title.trim().slice(0, 100),
      description: pinterestDescription(description),
      link,
      media_source: {
        source_type: "video_id",
        media_id: media.media_id,
        cover_image_key_frame_time: 0,
      },
    }),
  });

  return { media, last_status: lastStatus, pin };
}

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
if (!manifest.pinterest_video?.video) throw new Error(`No pinterest_video.video found in ${MANIFEST}`);

const videoPath = absRoot(manifest.pinterest_video.video);
if (!fssync.existsSync(videoPath)) throw new Error(`Pinterest video file not found: ${videoPath}`);

const title = await readOptional(manifest.pinterest_video.title, "KDP Sudoku Starter Pack video");
const caption = pinterestDescription(await readOptional(manifest.pinterest_video.caption, ""));
const firstComment = await readOptional(manifest.pinterest_video.first_comment, "");
const boardId = pinterestBoardId();
const imageSources = imagePinSources(manifest);
const existing = await readJsonOptional(RESULT);
const forceVideo = isTruthy(process.env.FORCE_PINTEREST_VIDEO_POST || "");
const forceImages = isTruthy(process.env.FORCE_PINTEREST_IMAGE_PINS || "");
const skipImages = isTruthy(process.env.SKIP_PINTEREST_IMAGE_PINS || "");
const alreadyPostedVideo = Boolean(existing?.pinterest?.pin?.id || existing?.pinterest?.pin?.board_id);

const out = {
  date: DATE,
  mode: MODE,
  type: "ftpe_pinterest_image_pins_and_video_post_v2",
  cta: manifest.cta || CTA,
  board_id: boardId,
  board_name: DEFAULT_PINTEREST_BOARD_NAME,
  video: manifest.pinterest_video.video,
  source_images: manifest.pinterest_video.source_images || [],
  image_pin_sources: imageSources,
  title,
  caption,
  first_comment: firstComment,
};

if (MODE !== "live") {
  out.dry_run = true;
  out.note = "Prepared Pinterest image pins and video post. Set FTPE_PINTEREST_VIDEO_POST_MODE=live to upload.";
  out.image_pins = {
    dry_run: true,
    skipped: skipImages,
    limit: imageSources.length,
    pins: imageSources.map((sourceImage, index) => ({
      source_image: sourceImage,
      title: imagePinTitle(title, sourceImage, index, imageSources.length),
    })),
  };
} else {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  if (!token) throw new Error("Missing PINTEREST_ACCESS_TOKEN");

  out.dry_run = false;
  out.image_pins = { dry_run: false, skipped: skipImages, limit: imageSources.length, pins: [] };

  if (!skipImages) {
    for (let index = 0; index < imageSources.length; index += 1) {
      const sourceImage = imageSources[index];
      const existingPin = existingImagePin(existing, sourceImage);
      const imagePath = absRoot(sourceImage);
      const pinTitle = imagePinTitle(title, sourceImage, index, imageSources.length);

      if (!fssync.existsSync(imagePath)) throw new Error(`Pinterest image pin source not found: ${imagePath}`);

      if (existingPin && !forceImages) {
        out.image_pins.pins.push({ ...existingPin, skipped: true, reason: "already_posted" });
      } else {
        out.image_pins.pins.push({
          source_image: sourceImage,
          title: pinTitle,
          pin: await postImageToPinterest({
            token,
            boardId,
            imagePath,
            title: pinTitle,
            description: caption,
            link: manifest.cta || CTA,
          }),
        });
      }
    }
  }

  if (alreadyPostedVideo && !forceVideo) {
    out.pinterest = { ...(existing?.pinterest || {}), skipped: true, reason: "already_posted" };
  } else {
    out.pinterest = await uploadVideoToPinterest({
      token,
      boardId,
      videoPath,
      title,
      description: caption,
      link: manifest.cta || CTA,
    });
  }
}

await fs.mkdir(path.dirname(RESULT), { recursive: true });
await fs.writeFile(RESULT, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`${MODE === "live" ? "Posted" : "Prepared"} FTPE Pinterest image pins and video for ${DATE} to ${DEFAULT_PINTEREST_BOARD_NAME}`);
