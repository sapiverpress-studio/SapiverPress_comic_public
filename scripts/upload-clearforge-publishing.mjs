import fs from "node:fs/promises";
import path from "node:path";
import { getStore } from "@netlify/blobs";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE;
const SITE_ID = process.env.NETLIFY_SITE_ID;
const TOKEN = process.env.NETLIFY_AUTH_TOKEN;
if (!DATE || !SITE_ID || !TOKEN) throw new Error("DATE_OVERRIDE, NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN are required.");
const base = path.join(ROOT, "social", "clearforge", DATE);
const store = getStore({ name: "clearforge-publishing", siteID: SITE_ID, token: TOKEN, consistency: "strong" });

const definitions = [
  ["tiktok-video", "TikTok video", "video", "video/clearforge-tiktok.mp4", "video/mp4"],
  ["youtube-video", "YouTube video", "video", "video/clearforge-short.mp4", "video/mp4"],
  ["tiktok-caption", "TikTok caption", "text", "copy/tiktok-caption.txt", "text/plain; charset=utf-8"],
  ["youtube-caption", "YouTube caption", "text", "copy/youtube-description.txt", "text/plain; charset=utf-8"],
  ["facebook-post", "Facebook post", "text", "copy/facebook-post.txt", "text/plain; charset=utf-8"],
  ["facebook-comment", "Facebook first comment", "text", "copy/facebook-first-comment.txt", "text/plain; charset=utf-8"],
  ["pinterest-title", "Pinterest title", "text", "copy/pinterest-title.txt", "text/plain; charset=utf-8"],
  ["pinterest-caption", "Pinterest caption", "text", "copy/pinterest-caption.txt", "text/plain; charset=utf-8"],
  ["facebook-image-1", "Facebook image 1", "image", "facebook/story-1.png", "image/png"],
  ["facebook-image-2", "Facebook image 2", "image", "facebook/story-2.png", "image/png"],
  ["facebook-image-3", "Facebook image 3", "image", "facebook/story-3.png", "image/png"],
  ["pinterest-image", "Pinterest image", "image", "pinterest/pin.png", "image/png"]
];
const assets = [];
for (const [id, label, kind, rel, contentType] of definitions) {
  const file = path.join(base, rel);
  const data = await fs.readFile(file);
  const key = `${DATE}/${id}`;
  await store.set(key, data, { metadata: { contentType, filename: path.basename(file), edition: DATE } });
  const asset = { id, label, kind, key, filename: path.basename(file), contentType };
  if (kind === "text") asset.text = data.toString("utf8").trim();
  assets.push(asset);
}
const manifest = { version: 1, edition: DATE, generated_at: new Date().toISOString(), assets };
await store.setJSON(`${DATE}/manifest.json`, manifest);
await store.setJSON("latest/manifest.json", { ...manifest, edition: DATE });
const current = await store.get("editions/index.json", { type: "json" }) || { editions: [] };
const editions = [DATE, ...(current.editions || []).filter((item) => item !== DATE)].slice(0, 60);
await store.setJSON("editions/index.json", { editions, updated_at: new Date().toISOString() });
console.log(`Uploaded protected Clearforge publishing pack for ${DATE}.`);
