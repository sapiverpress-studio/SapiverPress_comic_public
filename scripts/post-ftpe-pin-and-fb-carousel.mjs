import fs from "fs/promises";
import fssync from "fs";
import path from "path";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const MODE = (process.env.FTPE_SOCIAL_POST_MODE || "dry_run").toLowerCase();
const MANIFEST = path.join(ROOT, "social", "ftpe", DATE, "manifest.json");

function abs(rel) { return path.join(ROOT, rel); }
async function read(rel) { return fs.readFile(abs(rel), "utf8"); }
function b64(file) { return fssync.readFileSync(file).toString("base64"); }
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
  const boardId = process.env.PINTEREST_BOARD_ID;
  if (!token || !boardId) throw new Error("Missing PINTEREST_ACCESS_TOKEN or PINTEREST_BOARD_ID");
  const imagePath = abs(manifest.pinterest.image);
  const description = await read(manifest.pinterest.caption);
  return jsonFetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      board_id: boardId,
      title: "First-Time Sudoku Publisher Edition",
      description,
      link: manifest.cta,
      media_source: { source_type: "image_base64", content_type: "image/png", data: b64(imagePath) },
    }),
  });
}

async function uploadFacebookPhoto(pageId, token, relImage) {
  const form = new FormData();
  form.append("published", "false");
  form.append("access_token", token);
  const bytes = fssync.readFileSync(abs(relImage));
  form.append("source", new Blob([bytes], { type: "image/png" }), path.basename(relImage));
  return jsonFetch(`https://graph.facebook.com/v20.0/${pageId}/photos`, { method: "POST", body: form });
}

async function postFacebookCarousel(manifest) {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;
  if (!token || !pageId) throw new Error("Missing FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID");
  const uploaded = [];
  for (const rel of manifest.facebook.images) uploaded.push(await uploadFacebookPhoto(pageId, token, rel));
  const body = new URLSearchParams();
  body.set("message", await read(manifest.facebook.post_caption));
  body.set("access_token", token);
  uploaded.forEach((photo, i) => body.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: photo.id })));
  return jsonFetch(`https://graph.facebook.com/v20.0/${pageId}/feed`, { method: "POST", body });
}

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const out = { date: DATE, mode: MODE, type: manifest.type, cta: manifest.cta };
if (MODE !== "live") {
  out.pinterest = { dry_run: true, image: manifest.pinterest.image, caption: await read(manifest.pinterest.caption) };
  out.facebook = { dry_run: true, images: manifest.facebook.images, caption: await read(manifest.facebook.post_caption) };
} else {
  out.pinterest = await postPinterest(manifest);
  out.facebook = await postFacebookCarousel(manifest);
}
const recordPath = path.join(ROOT, "social", "ftpe", DATE, "post-result.json");
await fs.writeFile(recordPath, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`${MODE === "live" ? "Posted" : "Prepared"} FTPE Pinterest pin and Facebook carousel for ${DATE}`);
