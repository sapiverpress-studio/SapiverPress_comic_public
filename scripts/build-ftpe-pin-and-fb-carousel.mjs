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

const DISCOVERY_KEYWORDS = [
  "KDP",
  "Amazon KDP",
  "Kindle Direct Publishing",
  "paperback publishing",
  "Sudoku book",
  "Sudoku paperback",
  "KDP starter pack",
  "KDP beginner guide",
  "publish a puzzle book",
  "KDP upload files",
  "KDP cover PDF",
  "KDP interior PDF",
  "KDP metadata",
  "KDP Previewer",
  "AI content declaration",
  "Etsy digital download",
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

function exists(p) { return fssync.existsSync(p); }
async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }
function dayIndex() { return Math.floor(Date.parse(`${DATE}T00:00:00Z`) / 86400000); }
function hashtags(limit = HASHTAGS.length) { return HASHTAGS.slice(0, limit).join(" "); }
function keywordLine(limit = DISCOVERY_KEYWORDS.length) { return DISCOVERY_KEYWORDS.slice(0, limit).join(" · "); }

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
    return path.relative(ROOT, dst).replaceAll("\\", "/");
  });
}

function pinTitle(title) {
  const topic = title ? ` | ${title}` : "";
  return `KDP Sudoku Starter Pack${topic}`.slice(0, 100);
}

function caption(kind, title) {
  const clean = title || "First-Time Sudoku Publisher Edition";
  if (kind === "pin") {
    return `First-Time Sudoku Publisher Edition from Sapiver Press: a £15 beginner-friendly KDP Sudoku paperback starter pack for people learning the first upload workflow. Includes practical guidance around KDP upload files, an interior PDF, a full-spread cover PDF, KDP metadata, KDP Previewer checks and beginner publishing admin.\n\nNo guaranteed KDP approval, no guaranteed sales, and no Amazon affiliation — just a clearer way to attempt your first Sudoku paperback.\n\nShop Sapiver Press: ${CTA}\n\nKeywords: ${keywordLine(12)}\n\n${hashtags(10)}\n`;
  }
  return `${clean}\n\nFirst-Time Sudoku Publisher Edition helps beginners approach a first KDP Sudoku paperback upload with less guesswork. Use the guide, worksheet and KDP-ready file set to understand the book interior PDF, full-spread cover PDF, metadata, upload checks and KDP Previewer step.\n\nShop Sapiver Press: ${CTA}\n\n${hashtags(8)}\n`;
}

function pinterestFirstComment() {
  return `More KDP beginner tools from Sapiver Press: ${CTA}\n\nUseful search terms: KDP beginner guide, Sudoku book publishing, KDP interior PDF, KDP cover PDF, paperback publishing, puzzle book publishing, Etsy digital download.\n\n${hashtags(8)}\n`;
}

function facebookPostCaption() {
  return `Thinking about trying your first KDP Sudoku paperback?\n\nThis five-image carousel shows practical angles from the First-Time Sudoku Publisher Edition: a £15 starter pack for beginners who want a clearer route through KDP upload files, book interior PDFs, full-spread cover PDFs, metadata, KDP Previewer checks, ISBN/admin choices and the AI content declaration step.\n\nIt is a practical publishing workflow resource, not a promise of KDP approval, sales, passive income or Amazon affiliation.\n\nStart here: ${CTA}\n\nKeywords: ${keywordLine()}\n\n${hashtags()}\n`;
}

function facebookFirstComment() {
  return `Direct link to the Sapiver Press shop: ${CTA}\n\nSearch-friendly summary: KDP starter pack, Amazon KDP beginner guide, Sudoku paperback publishing, KDP upload files, KDP interior PDF, KDP cover PDF, KDP metadata, KDP Previewer, puzzle book publishing, Etsy digital download.\n\n${hashtags()}\n`;
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
const pinOut = copyList([pinImage], pinDir)[0];
const fbOut = copyList(carouselImages, fbDir);
const fbCaptionFiles = carouselImages.map((_, i) => `facebook_carousel/${String(i + 1).padStart(2, "0")}_caption.txt`);

await fs.writeFile(path.join(pinDir, "title.txt"), pinTitle(cleanTitle(pinImage)) + "\n", "utf8");
await fs.writeFile(path.join(pinDir, "caption.txt"), caption("pin", cleanTitle(pinImage)), "utf8");
await fs.writeFile(path.join(pinDir, "first-comment.txt"), pinterestFirstComment(), "utf8");
await fs.writeFile(path.join(fbDir, "post-caption.txt"), facebookPostCaption(), "utf8");
await fs.writeFile(path.join(fbDir, "first-comment.txt"), facebookFirstComment(), "utf8");
for (let i = 0; i < carouselImages.length; i++) await fs.writeFile(path.join(fbDir, `${String(i + 1).padStart(2, "0")}_caption.txt`), caption("fb", cleanTitle(carouselImages[i])), "utf8");

const manifest = {
  type: "ftpe_daily_pin_and_fb_carousel_v2",
  date: DATE,
  cta: CTA,
  pinterest: {
    image: pinOut,
    title: "pinterest_pin/title.txt",
    caption: "pinterest_pin/caption.txt",
    first_comment: "pinterest_pin/first-comment.txt",
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
console.log(`Built daily FTPE pin + Facebook carousel for ${DATE}`);
