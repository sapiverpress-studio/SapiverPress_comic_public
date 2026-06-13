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
  "KDP",
  "Amazon KDP",
  "Kindle Direct Publishing",
  "paperback publishing",
  "puzzle book publishing",
  "Sudoku book",
  "Sudoku paperback",
  "KDP starter pack",
  "KDP beginner guide",
  "publish a puzzle book",
  "printable puzzle book",
  "low content books",
  "puzzle book creator",
  "KDP upload files",
  "KDP cover PDF",
  "KDP interior PDF",
  "commercial use Sudoku",
  "Sudoku publishing",
  "beginner publishing",
  "Etsy digital download",
  "printable business tools",
  "puzzle seller resources",
  "self publishing tools",
  "Amazon paperback",
  "KDP Previewer",
  "book interior",
  "full spread cover",
  "book cover template",
  "ISBN",
  "KDP metadata",
  "AI content declaration",
  "Sapiver Press",
];

const HASHTAGS = [
  "#AmazonKDP",
  "#KDPPublishing",
  "#SelfPublishing",
  "#PuzzleBooks",
  "#Sudoku",
  "#SudokuBooks",
  "#PrintableBusiness",
  "#EtsyDigitalDownload",
  "#KDPBeginners",
  "#BookPublishing",
  "#PaperbackPublishing",
  "#PuzzlePublishing",
  "#KDPTools",
  "#SapiverPress",
];

const PRODUCT_LINE = "First-Time Sudoku Publisher Edition from Sapiver Press";
const PRODUCT_POSITIONING = "a £15 beginner-friendly Etsy digital download for people learning how to attempt their first Amazon KDP Sudoku paperback upload";
const WORKFLOW_TERMS = "KDP-ready interior PDF, full-spread cover PDF, KDP metadata worksheet, KDP Previewer checks, ISBN/admin prompts, AI content declaration guidance and beginner publishing checklist";
const SAFETY_LINE = "No guaranteed KDP approval, no guaranteed sales, no guaranteed income, and no Amazon affiliation.";

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
    return `${PRODUCT_LINE}: ${PRODUCT_POSITIONING}.\n\nUse it to understand the first-upload workflow: ${WORKFLOW_TERMS}.\n\n${SAFETY_LINE} This is practical workflow support, not a get-rich-quick product.\n\nShop Sapiver Press: ${CTA}\n\nSearch terms: ${keywordLine(18)}\n\n${hashtags(12)}\n`;
  }
  if (kind === "video") {
    return `A five-image Pinterest video version of today's FTPE carousel. ${PRODUCT_LINE} is ${PRODUCT_POSITIONING}.\n\nCovers KDP upload files, Sudoku paperback publishing, KDP interior PDF, full-spread cover PDF, metadata, KDP Previewer checks and beginner publishing admin.\n\n${SAFETY_LINE}\n\nShop Sapiver Press: ${CTA}\n\n${hashtags(12)}\n`;
  }
  return `${clean}\n\nPart of the ${PRODUCT_LINE} campaign: ${PRODUCT_POSITIONING}. This image connects to the practical first-upload workflow: KDP upload files, book interior PDF, full-spread cover PDF, KDP metadata, KDP Previewer and beginner publishing admin.\n\n${SAFETY_LINE}\n\nShop Sapiver Press: ${CTA}\n\n${hashtags(10)}\n`;
}

function pinterestFirstComment() {
  return `More beginner publishing tools from Sapiver Press: ${CTA}\n\nUseful search terms: KDP beginner guide, Amazon KDP, Sudoku paperback publishing, KDP upload files, KDP interior PDF, KDP cover PDF, full spread cover, KDP metadata, KDP Previewer, AI content declaration, Etsy digital download.\n\n${hashtags(10)}\n`;
}

function facebookPostCaption() {
  return `Thinking about trying your first KDP Sudoku paperback?\n\nThis five-image carousel shows practical angles from ${PRODUCT_LINE}: ${PRODUCT_POSITIONING}. It is built around real KDP upload files and beginner guidance: ${WORKFLOW_TERMS}.\n\n${SAFETY_LINE} It is a guided starter pack for learning the process, not a promise of passive income or Amazon/KDP affiliation.\n\nStart here: ${CTA}\n\nSearch terms: ${keywordLine()}\n\n${hashtags()}\n`;
}

function facebookFirstComment() {
  return `Direct link to the Sapiver Press shop: ${CTA}\n\nSearch-friendly summary: KDP starter pack, Amazon KDP beginner guide, Kindle Direct Publishing, Sudoku paperback publishing, puzzle book publishing, KDP upload files, KDP interior PDF, KDP cover PDF, KDP metadata, KDP Previewer, book cover template, ISBN, AI content declaration, Etsy digital download.\n\n${hashtags()}\n`;
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
for (let i = 0; i < carouselImages.length; i++) await fs.writeFile(path.join(fbDir, `${String(i + 1).padStart(2, "0")}_caption.txt`), caption("fb", cleanTitle(carouselImages[i])), "utf8");

const manifest = {
  type: "ftpe_daily_pin_fb_carousel_and_pinterest_video_v1",
  date: DATE,
  cta: CTA,
  pinterest: {
    image: pinOut,
    title: "pinterest_pin/title.txt",
    caption: "pinterest_pin/caption.txt",
    first_comment: "pinterest_pin/first-comment.txt",
  },
  pinterest_video: {
    video: videoOut.video,
    source_images: videoOut.images,
    title: "pinterest_video/title.txt",
    caption: "pinterest_video/caption.txt",
    first_comment: "pinterest_video/first-comment.txt",
    seconds_per_image: VIDEO_SECONDS_PER_IMAGE,
  },
  facebook: {
    images: fbOut,
    image_captions: fbCaptionFiles,
    post_caption: "facebook_carousel/post-caption.txt",
    first_comment: "facebook_carousel/first-comment.txt",
  },
};
await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
if (exists(LATEST)) await fs.rm(LATEST, { recursive: true, force: true });
await ensureDir(path.dirname(LATEST));
await fs.cp(OUT, LATEST, { recursive: true });
console.log(`Built daily FTPE pin + Facebook carousel + Pinterest video for ${DATE}`);
