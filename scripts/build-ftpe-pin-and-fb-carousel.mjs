import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const OUT = path.join(ROOT, "social", "ftpe", DATE);
const LATEST = path.join(ROOT, "social", "ftpe", "latest");
const ASSET_ROOTS = [
  path.join(ROOT, "assets", "ftpe", "social_master"),
  path.join(ROOT, "assets", "ftpe", "social_sets"),
  path.join(ROOT, "assets", "ftpe", "bonus_sets"),
];
const CTA = "https://sapiverpress.etsy.com";
const VIDEO_SECONDS_PER_IMAGE = 3;

const DISCOVERY_KEYWORDS = [
  "KDP beginner guide",
  "Amazon KDP",
  "Sudoku paperback publishing",
  "KDP upload files",
  "KDP interior PDF",
  "KDP cover PDF",
  "KDP metadata",
  "KDP Previewer",
  "Etsy digital download",
  "Sapiver Press",
];

const HASHTAGS = [
  "#AmazonKDP",
  "#KDPPublishing",
  "#SelfPublishing",
  "#SudokuBooks",
  "#PuzzleBooks",
  "#SapiverPress",
];

const PRODUCT_LINE = "First-Time Sudoku Publisher Edition from Sapiver Press";
const PRODUCT_POSITIONING = "a beginner-friendly Etsy digital download for people learning how to attempt their first Amazon KDP Sudoku paperback upload";
const WORKFLOW_TERMS = "KDP-ready interior PDF, matching full-spread cover PDF, metadata worksheet, KDP Previewer checks, AI content declaration guidance and beginner checklist";
const SAFETY_LINE = "Digital download only. No guaranteed KDP approval, sales or income. Not affiliated with Amazon/KDP.";

function exists(p) { return fssync.existsSync(p); }
async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }
function dayIndex() { return Math.floor(Date.parse(`${DATE}T00:00:00Z`) / 86400000); }
function hashtags(limit = HASHTAGS.length) { return HASHTAGS.slice(0, limit).join(" "); }
function keywordLine(limit = DISCOVERY_KEYWORDS.length) { return DISCOVERY_KEYWORDS.slice(0, limit).join(" · "); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }

function unzipAssets() {
  for (const root of ASSET_ROOTS) {
    if (!exists(root)) continue;
    const extracted = path.join(root, "_extracted");
    fssync.mkdirSync(extracted, { recursive: true });
    for (const name of fssync.readdirSync(root)) {
      const full = path.join(root, name);
      if (!fssync.statSync(full).isFile()) continue;
      if (name.toLowerCase().endsWith(".zip")) execFileSync("unzip", ["-o", full, "-d", path.join(extracted, path.basename(name, ".zip"))], { stdio: "inherit" });
      if (name.toLowerCase().endsWith(".zip.b64")) {
        const zip = full.replace(/\.b64$/i, "");
        fssync.writeFileSync(zip, Buffer.from(fssync.readFileSync(full, "utf8").replace(/\s+/g, ""), "base64"));
        execFileSync("unzip", ["-o", zip, "-d", path.join(extracted, path.basename(zip, ".zip"))], { stdio: "inherit" });
      }
    }
  }
}

function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const entry of fssync.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.png$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function cleanTitle(file) {
  return path.basename(file, path.extname(file))
    .replace(/^\d+[_-]?/, "")
    .replace(/^FTPE[_-]SET[_-]\d+[_-]\d+[_-]?/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\bpngs?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function copyList(images, dir) {
  fssync.mkdirSync(dir, { recursive: true });
  return images.map((src, i) => {
    const dst = path.join(dir, `${String(i + 1).padStart(2, "0")}_${path.basename(src)}`);
    fssync.copyFileSync(src, dst);
    return rel(dst);
  });
}

function ffmpegEscape(file) {
  return file.replace(/'/g, "'\\''");
}

function buildVideo(images, dir) {
  fssync.mkdirSync(dir, { recursive: true });
  const copied = copyList(images, dir);
  const copiedAbs = copied.map((p) => path.join(ROOT, p));
  const listPath = path.join(dir, "ffmpeg-input.txt");
  const lines = [];
  for (const img of copiedAbs) {
    lines.push(`file '${ffmpegEscape(img)}'`);
    lines.push(`duration ${VIDEO_SECONDS_PER_IMAGE}`);
  }
  lines.push(`file '${ffmpegEscape(copiedAbs[copiedAbs.length - 1])}'`);
  fssync.writeFileSync(listPath, `${lines.join("\n")}\n`, "utf8");

  const videoPath = path.join(dir, "pinterest_video.mp4");
  execFileSync("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
    "-r", "30",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    videoPath,
  ], { stdio: "inherit" });

  return { images: copied, video: rel(videoPath) };
}

function pinTitle(title) {
  const topic = title ? ` | ${title}` : "";
  return `KDP Sudoku Paperback Starter Pack${topic}`.slice(0, 100);
}

function videoTitle() {
  return "KDP Sudoku Starter Pack | 5-image Pinterest video".slice(0, 100);
}

function caption(kind, title) {
  const clean = title || "First-Time Sudoku Publisher Edition";
  if (kind === "pin") {
    return `${PRODUCT_LINE}: ${PRODUCT_POSITIONING}.\n\nIncludes ${WORKFLOW_TERMS}.\n\n${SAFETY_LINE}\n\nStart here: ${CTA}\n\nSearch terms: ${keywordLine(8)}\n\n${hashtags(6)}\n`;
  }
  if (kind === "video") {
    return `A five-image video version of today's FTPE carousel. ${PRODUCT_LINE} is ${PRODUCT_POSITIONING}.\n\n${SAFETY_LINE}\n\nStart here: ${CTA}\n\n${hashtags(6)}\n`;
  }
  return `${clean}\n\nPart of the ${PRODUCT_LINE} campaign. ${PRODUCT_POSITIONING}.\n\n${SAFETY_LINE}\n\nStart here: ${CTA}\n\n${hashtags(5)}\n`;
}

function pinterestFirstComment() {
  return `More beginner publishing tools from Sapiver Press: ${CTA}\n\nUseful search terms: ${keywordLine(8)}\n\n${hashtags(6)}\n`;
}

function facebookPostCaption() {
  return `Thinking about trying your first KDP Sudoku paperback?\n\nFTPE is a beginner-friendly Sapiver Press starter pack for learning the first upload process.\n\nIt includes:\n• KDP-ready Sudoku interior PDF\n• matching full-spread cover PDF\n• metadata worksheet\n• KDP Previewer checklist\n• beginner guidance for common upload/admin steps\n\n${SAFETY_LINE}\n\nStart here: ${CTA}\n\n${hashtags(6)}\n`;
}

function facebookFirstComment() {
  return `Direct link: ${CTA}\n\nUseful for: ${keywordLine(8)}.\n\n${hashtags(4)}\n`;
}

unzipAssets();
const all = ASSET_ROOTS.flatMap((r) => walk(r)).filter((p) => !p.includes(`${path.sep}_extracted${path.sep}_extracted${path.sep}`));
const images = [...new Map(all.map((p) => [path.basename(p).toLowerCase(), p])).values()].sort();
if (images.length < 5) throw new Error(`Need at least five FTPE PNG assets in assets/ftpe/social_master, social_sets, or bonus_sets. Found ${images.length}.`);

await ensureDir(OUT);
const start = dayIndex() % images.length;
const chosen = Array.from({ length: 6 }, (_, i) => images[(start + i) % images.length]);
const pinImage = chosen[0];
const carouselImages = chosen.slice(1, 6);

const pinDir = path.join(OUT, "pinterest_pin");
const fbDir = path.join(OUT, "facebook_carousel");
const videoDir = path.join(OUT, "pinterest_video");
const pinOut = copyList([pinImage], pinDir)[0];
const fbOut = copyList(carouselImages, fbDir);
const videoOut = buildVideo(carouselImages, videoDir);
const fbCaptionFiles = carouselImages.map((_, i) => `facebook_carousel/${String(i + 1).padStart(2, "0")}_caption.txt`);

await fs.writeFile(path.join(pinDir, "title.txt"), pinTitle(cleanTitle(pinImage)) + "\n", "utf8");
await fs.writeFile(path.join(pinDir, "caption.txt"), caption("pin", cleanTitle(pinImage)), "utf8");
await fs.writeFile(path.join(pinDir, "first-comment.txt"), pinterestFirstComment(), "utf8");
await fs.writeFile(path.join(fbDir, "post-caption.txt"), facebookPostCaption(), "utf8");
await fs.writeFile(path.join(fbDir, "first-comment.txt"), facebookFirstComment(), "utf8");
await fs.writeFile(path.join(videoDir, "title.txt"), videoTitle() + "\n", "utf8");
await fs.writeFile(path.join(videoDir, "caption.txt"), caption("video", "Pinterest video"), "utf8");
await fs.writeFile(path.join(videoDir, "first-comment.txt"), pinterestFirstComment(), "utf8");
for (let i = 0; i < fbCaptionFiles.length; i++) await fs.writeFile(path.join(OUT, fbCaptionFiles[i]), caption("facebook_image", cleanTitle(carouselImages[i])), "utf8");

const manifest = {
  type: "ftpe_daily_pin_fb_carousel_and_pinterest_video_v1",
  date: DATE,
  cta: CTA,
  pinterest: { image: pinOut, title: "pinterest_pin/title.txt", caption: "pinterest_pin/caption.txt", first_comment: "pinterest_pin/first-comment.txt" },
  pinterest_video: { video: videoOut.video, source_images: videoOut.images, title: "pinterest_video/title.txt", caption: "pinterest_video/caption.txt", first_comment: "pinterest_video/first-comment.txt" },
  facebook: { images: fbOut, image_captions: fbCaptionFiles, post_caption: "facebook_carousel/post-caption.txt", first_comment: "facebook_carousel/first-comment.txt" },
  notes: [
    "FTPE is a beginner-friendly starter pack, not a guaranteed income product.",
    "Do not imply Amazon/KDP affiliation, guaranteed KDP approval, guaranteed sales, or passive income.",
    "All traffic points to https://sapiverpress.etsy.com.",
  ],
};
await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
await fs.rm(LATEST, { recursive: true, force: true });
await fs.cp(OUT, LATEST, { recursive: true });
console.log(`Built FTPE daily Pinterest pin, Facebook carousel, and Pinterest video for ${DATE}`);
console.log(`Pinterest image: ${pinOut}`);
console.log(`Facebook carousel images: ${fbOut.join(", ")}`);
console.log(`Pinterest video: ${videoOut.video}`);
