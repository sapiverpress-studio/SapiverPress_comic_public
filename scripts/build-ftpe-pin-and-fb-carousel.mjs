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

function subjectList(images) {
  return [...new Set(images.map((img) => cleanTitle(img)).filter(Boolean))].slice(0, 8);
}

function subjectText(subjects) {
  if (!subjects.length) return "";
  return `Subjects covered: ${subjects.join("; ")}.`;
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

function videoTitle(subjects = []) {
  const suffix = subjects.length ? ` | ${subjects[0]}` : "";
  return `KDP Sudoku Starter Pack | Mixed FTPE preview${suffix}`.slice(0, 100);
}

function caption(kind, title, subjects = []) {
  const clean = title || "First-Time Sudoku Publisher Edition";
  const subjectsLine = subjectText(subjects);
  const subjectsBlock = subjectsLine ? `${subjectsLine}\n\n` : "";
  if (kind === "pin") {
    return `${PRODUCT_LINE}: ${PRODUCT_POSITIONING}.\n\n${subjectsBlock}Includes ${WORKFLOW_TERMS}.\n\n${SAFETY_LINE}\n\nStart here: ${CTA}\n\nSearch terms: ${keywordLine(8)}\n\n${hashtags(6)}\n`;
  }
  if (kind === "video") {
    return `A mixed-topic five-image video preview from today's FTPE campaign.\n\n${subjectsBlock}${PRODUCT_LINE} is ${PRODUCT_POSITIONING}.\n\n${SAFETY_LINE}\n\nStart here: ${CTA}\n\n${hashtags(6)}\n`;
  }
  return `${clean}\n\nPart of the ${PRODUCT_LINE} campaign. ${PRODUCT_POSITIONING}.\n\n${subjectsBlock}${SAFETY_LINE}\n\nStart here: ${CTA}\n\n${hashtags(5)}\n`;
}

function pinterestFirstComment(subjects = []) {
  const subjectsLine = subjectText(subjects);
  return `More beginner publishing tools from Sapiver Press: ${CTA}\n\n${subjectsLine ? `${subjectsLine}\n\n` : ""}Useful search terms: ${keywordLine(8)}\n\n${hashtags(6)}\n`;
}

function facebookPostCaption(subjects = []) {
  const subjectsLine = subjectText(subjects);
  return `Thinking about trying your first KDP Sudoku paperback?\n\nFTPE is a beginner-friendly Sapiver Press starter pack for learning the first upload process.\n\n${subjectsLine ? `${subjectsLine}\n\n` : ""}It includes:\n• KDP-ready Sudoku interior PDF\n• matching full-spread cover PDF\n• metadata worksheet\n• KDP Previewer checklist\n• beginner guidance for common upload/admin steps\n\n${SAFETY_LINE}\n\nStart here: ${CTA}\n\n${hashtags(6)}\n`;
}

function facebookFirstComment(subjects = []) {
  const subjectsLine = subjectText(subjects);
  return `Direct link: ${CTA}\n\n${subjectsLine ? `${subjectsLine}\n\n` : ""}Useful for: ${keywordLine(8)}.\n\n${hashtags(4)}\n`;
}

function assetGroupKey(file) {
  const r = rel(file);
  const parts = r.split("/");
  const extractedIndex = parts.indexOf("_extracted");
  if (extractedIndex >= 0 && parts[extractedIndex + 1]) {
    return parts.slice(0, extractedIndex + 2).join("/");
  }
  return path.dirname(r).replaceAll("\\", "/");
}

function rotateList(items, offset) {
  if (!items.length) return [];
  const o = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(o), ...items.slice(0, o)];
}

function groupedAssets(images) {
  const uniqueByPath = [...new Map(images.map((p) => [rel(p).toLowerCase(), p])).values()].sort();
  const grouped = new Map();
  for (const img of uniqueByPath) {
    const key = assetGroupKey(img);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(img);
  }
  const groups = [...grouped.entries()]
    .map(([key, files]) => ({ key, files: files.sort() }))
    .filter((group) => group.files.length >= 1)
    .sort((a, b) => a.key.localeCompare(b.key));
  return { uniqueByPath, groups };
}

function pickDailyAssets(images) {
  const { uniqueByPath, groups } = groupedAssets(images);
  if (uniqueByPath.length < 5) throw new Error(`Need at least five FTPE PNG assets in assets/ftpe/social_master, social_sets, or bonus_sets. Found ${uniqueByPath.length}.`);

  const selected = [];
  const used = new Set();
  const rotatedGroups = rotateList(groups, dayIndex());
  const innerOffset = Math.floor(dayIndex() / Math.max(groups.length, 1));

  for (let round = 0; selected.length < 6 && round < 10; round++) {
    for (const group of rotatedGroups) {
      const groupFiles = rotateList(group.files, innerOffset + round);
      const candidate = groupFiles.find((img) => !used.has(rel(img).toLowerCase()));
      if (!candidate) continue;
      selected.push(candidate);
      used.add(rel(candidate).toLowerCase());
      if (selected.length >= 6) break;
    }
  }

  if (selected.length < 6) {
    for (const candidate of rotateList(uniqueByPath, dayIndex() * 7)) {
      if (used.has(rel(candidate).toLowerCase())) continue;
      selected.push(candidate);
      used.add(rel(candidate).toLowerCase());
      if (selected.length >= 6) break;
    }
  }

  const carouselImages = selected.length >= 6 ? selected.slice(1, 6) : selected.slice(0, 5);
  const pinImage = selected[0] || carouselImages[0];
  const subjects = subjectList(carouselImages);
  const selectedGroups = [...new Set(selected.map(assetGroupKey))];

  return {
    assetGroup: "mixed_subjects",
    assetGroups: selectedGroups,
    groupCount: groups.length,
    imageCount: uniqueByPath.length,
    pinImage,
    carouselImages,
    subjects,
  };
}

unzipAssets();
const all = ASSET_ROOTS.flatMap((r) => walk(r)).filter((p) => !p.includes(`${path.sep}_extracted${path.sep}_extracted${path.sep}`));
const picked = pickDailyAssets(all);

await ensureDir(OUT);
const pinImage = picked.pinImage;
const carouselImages = picked.carouselImages;
const subjects = picked.subjects;

const pinDir = path.join(OUT, "pinterest_pin");
const fbDir = path.join(OUT, "facebook_carousel");
const videoDir = path.join(OUT, "pinterest_video");
const pinOut = copyList([pinImage], pinDir)[0];
const fbOut = copyList(carouselImages, fbDir);
const videoOut = buildVideo(carouselImages, videoDir);
const fbCaptionFiles = carouselImages.map((_, i) => `facebook_carousel/${String(i + 1).padStart(2, "0")}_caption.txt`);

await fs.writeFile(path.join(pinDir, "title.txt"), pinTitle(cleanTitle(pinImage)) + "\n", "utf8");
await fs.writeFile(path.join(pinDir, "caption.txt"), caption("pin", cleanTitle(pinImage), subjects), "utf8");
await fs.writeFile(path.join(pinDir, "first-comment.txt"), pinterestFirstComment(subjects), "utf8");
await fs.writeFile(path.join(fbDir, "post-caption.txt"), facebookPostCaption(subjects), "utf8");
await fs.writeFile(path.join(fbDir, "first-comment.txt"), facebookFirstComment(subjects), "utf8");
await fs.writeFile(path.join(videoDir, "title.txt"), videoTitle(subjects) + "\n", "utf8");
await fs.writeFile(path.join(videoDir, "caption.txt"), caption("video", "Pinterest video", subjects), "utf8");
await fs.writeFile(path.join(videoDir, "first-comment.txt"), pinterestFirstComment(subjects), "utf8");
for (let i = 0; i < fbCaptionFiles.length; i++) await fs.writeFile(path.join(OUT, fbCaptionFiles[i]), caption("facebook_image", cleanTitle(carouselImages[i]), subjects), "utf8");

const manifest = {
  type: "ftpe_daily_pin_fb_carousel_and_pinterest_video_v1",
  date: DATE,
  cta: CTA,
  asset_group: picked.assetGroup,
  asset_groups: picked.assetGroups,
  asset_group_count: picked.groupCount,
  asset_group_image_count: picked.imageCount,
  subjects,
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
console.log(`Selected asset mode: ${picked.assetGroup} (${picked.groupCount} groups, ${picked.imageCount} total images)`);
console.log(`Subjects covered: ${subjects.join("; ")}`);
console.log(`Pinterest image: ${pinOut}`);
console.log(`Facebook carousel images: ${fbOut.join(", ")}`);
console.log(`Pinterest video: ${videoOut.video}`);
