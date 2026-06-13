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

function exists(p) { return fssync.existsSync(p); }
async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }
function dayIndex() { return Math.floor(Date.parse(`${DATE}T00:00:00Z`) / 86400000); }

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

function caption(kind, title) {
  if (kind === "pin") return `First-Time Sudoku Publisher Edition from Sapiver Press. A practical starter workflow for your first KDP Sudoku paperback upload. Start with the Easy files first and build confidence before publishing.\n\nFind it here: ${CTA}`;
  return `${title}\n\nFirst-Time Sudoku Publisher Edition: beginner-friendly guides, worksheets, upload files and a clear first-upload workflow.\n\nFind it here: ${CTA}`;
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

await fs.writeFile(path.join(pinDir, "caption.txt"), caption("pin", cleanTitle(pinImage)), "utf8");
await fs.writeFile(path.join(pinDir, "first-comment.txt"), CTA + "\n", "utf8");
await fs.writeFile(path.join(fbDir, "post-caption.txt"), `First-Time Sudoku Publisher Edition: five quick reasons this starter pack helps new KDP Sudoku publishers begin with less guesswork.\n\n${CTA}\n`, "utf8");
await fs.writeFile(path.join(fbDir, "first-comment.txt"), `Start with the FTPE starter pack: ${CTA}\n`, "utf8");
for (let i = 0; i < carouselImages.length; i++) await fs.writeFile(path.join(fbDir, `${String(i + 1).padStart(2, "0")}_caption.txt`), caption("fb", cleanTitle(carouselImages[i])), "utf8");

const manifest = { type: "ftpe_daily_pin_and_fb_carousel_v1", date: DATE, cta: CTA, pinterest: { image: pinOut, caption: "pinterest_pin/caption.txt", first_comment: "pinterest_pin/first-comment.txt" }, facebook: { images: fbOut, post_caption: "facebook_carousel/post-caption.txt", first_comment: "facebook_carousel/first-comment.txt" } };
await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
if (exists(LATEST)) await fs.rm(LATEST, { recursive: true, force: true });
await ensureDir(path.dirname(LATEST));
await fs.cp(OUT, LATEST, { recursive: true });
console.log(`Built daily FTPE pin + Facebook carousel for ${DATE}`);
