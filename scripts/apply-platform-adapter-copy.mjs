import fs from "fs/promises";
import fssync from "fs";
import path from "path";

const ROOT = process.cwd();
const MATERIAL = (process.argv[2] || process.env.SOCIAL_MATERIAL || "").trim();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

if (!MATERIAL) throw new Error("Usage: node scripts/apply-platform-adapter-copy.mjs <material>");
if (!["ftpe", "book-content-os"].includes(MATERIAL)) throw new Error(`Unsupported material: ${MATERIAL}`);

const OUT = path.join(ROOT, "social", MATERIAL, DATE);
const ADAPTER = path.join(OUT, "platform_adapted");
const LIVE = {
  facebookCaption: path.join(OUT, "facebook_carousel", "post-caption.txt"),
  facebookFirstComment: path.join(OUT, "facebook_carousel", "first-comment.txt"),
  pinterestTitle: path.join(OUT, "pinterest_pin", "title.txt"),
  pinterestCaption: path.join(OUT, "pinterest_pin", "caption.txt"),
  videoTitle: path.join(OUT, "pinterest_video", "title.txt"),
  videoCaption: path.join(OUT, "pinterest_video", "caption.txt")
};

function exists(file) { return fssync.existsSync(file); }
async function read(file) { return fs.readFile(file, "utf8"); }
async function write(file, text) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text.endsWith("\n") ? text : `${text}\n`, "utf8"); }
async function copyIfExists(src, dst, label, applied) {
  if (!exists(src)) {
    applied.push({ label, source: path.relative(ROOT, src).replaceAll("\\", "/"), target: path.relative(ROOT, dst).replaceAll("\\", "/"), applied: false, reason: "missing_source" });
    return;
  }
  await write(dst, await read(src));
  applied.push({ label, source: path.relative(ROOT, src).replaceAll("\\", "/"), target: path.relative(ROOT, dst).replaceAll("\\", "/"), applied: true });
}

if (!exists(ADAPTER)) throw new Error(`Missing platform adapter folder: ${ADAPTER}`);

const applied = [];
await copyIfExists(path.join(ADAPTER, "facebook", "post-caption.txt"), LIVE.facebookCaption, "facebook_post_caption", applied);
await copyIfExists(path.join(ADAPTER, "facebook", "first-comment.txt"), LIVE.facebookFirstComment, "facebook_first_comment", applied);
await copyIfExists(path.join(ADAPTER, "pinterest", "pin-01-title.txt"), LIVE.pinterestTitle, "pinterest_pin_title", applied);
await copyIfExists(path.join(ADAPTER, "pinterest", "pin-01-description.txt"), LIVE.pinterestCaption, "pinterest_pin_caption", applied);
await copyIfExists(path.join(ADAPTER, "youtube_shorts", "title.txt"), LIVE.videoTitle, "short_video_title", applied);
await copyIfExists(path.join(ADAPTER, "youtube_shorts", "description.txt"), LIVE.videoCaption, "short_video_caption", applied);

const fbCaption = path.join(ADAPTER, "facebook", "post-caption.txt");
if (exists(fbCaption)) {
  const text = await read(fbCaption);
  for (let i = 1; i <= 10; i += 1) {
    const dst = path.join(OUT, "facebook_carousel", `${String(i).padStart(2, "0")}_caption.txt`);
    if (exists(dst)) {
      await write(dst, text);
      applied.push({ label: `facebook_image_caption_${i}`, source: path.relative(ROOT, fbCaption).replaceAll("\\", "/"), target: path.relative(ROOT, dst).replaceAll("\\", "/"), applied: true });
    }
  }
}

const report = { type: "platform_adapter_live_copy_bridge_v1", material: MATERIAL, date: DATE, applied_at: new Date().toISOString(), applied };
await write(path.join(ADAPTER, "applied-live-copy.json"), JSON.stringify(report, null, 2));
console.log(`Applied platform adapter copy for ${MATERIAL} ${DATE}`);
for (const item of applied) console.log(`${item.applied ? "APPLIED" : "SKIPPED"}: ${item.label}`);
