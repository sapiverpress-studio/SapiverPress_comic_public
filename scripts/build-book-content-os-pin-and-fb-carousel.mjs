import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const OUT = path.join(ROOT, "social", "book-content-os", DATE);
const LATEST = path.join(ROOT, "social", "book-content-os", "latest");
const ROTATION_STATE_PATH = path.join(ROOT, "social", "book-content-os", "rotation-state.json");
const COPY_CSV = path.join(ROOT, "content", "book-content-os-social-posts.csv");
const ASSET_ROOTS = [path.join(ROOT, "assets", "book-content-os", "social_sets")];
const CTA_TEXT = "link in bio";
const VIDEO_SECONDS_PER_IMAGE = 3;
const HASHTAGS = ["#BookReviewers", "#ARCReaders", "#BookTok", "#Bookstagram", "#BookContent", "#SapiverPress"];

function exists(p) { return fssync.existsSync(p); }
async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }
function dayIndex() { return Math.floor(Date.parse(`${DATE}T00:00:00Z`) / 86400000); }
function hashtags(limit = HASHTAGS.length) { return HASHTAGS.slice(0, limit).join(" "); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function keySafe(v) { return String(v || "").trim().toLowerCase(); }
function readTextIfExists(p) { return exists(p) ? fssync.readFileSync(p, "utf8") : ""; }

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i], next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i += 1; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter((r) => r.some((v) => String(v || "").trim())).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])));
}

function normaliseCopy(row) {
  return {
    id: String(row.id || row.title || row.caption || "").trim(),
    title: String(row.title || "Book Content OS Lite + Pro").trim(),
    caption: String(row.caption || "Book Content OS Lite + Pro. link in bio").trim(),
    first_comment: String(row.first_comment || CTA_TEXT).trim(),
    source: "book_content_os_social_posts",
    raw: row,
  };
}
function loadCopyRows() {
  if (!exists(COPY_CSV)) throw new Error(`Missing copy CSV: ${rel(COPY_CSV)}`);
  const rows = parseCsv(readTextIfExists(COPY_CSV)).map(normaliseCopy).filter((x) => x.id && x.caption);
  if (!rows.length) throw new Error(`No usable Book Content OS social rows found in ${rel(COPY_CSV)}`);
  return rows;
}
function readJsonSync(file, fallback) { try { return JSON.parse(fssync.readFileSync(file, "utf8")); } catch { return fallback; } }
function writeJsonSync(file, data) { fssync.mkdirSync(path.dirname(file), { recursive: true }); fssync.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
function loadRotationState() {
  const state = readJsonSync(ROTATION_STATE_PATH, {});
  return { version: "book_content_os_rotation_state_v1", pools: state.pools || {}, history: Array.isArray(state.history) ? state.history.slice(-20) : [] };
}
function chooseFromPool(state, poolName, items, count, keyFn) {
  if (!items.length) return { selected: [], pool: { cycle: 1, used: [], exhausted_this_run: false } };
  const pool = state.pools[poolName] || { cycle: 1, used: [] };
  const validKeys = new Set(items.map(keyFn));
  let used = new Set((pool.used || []).filter((k) => validKeys.has(k)));
  let cycle = Number(pool.cycle || 1);
  let exhausted = false;
  const selected = [];
  const selectedKeys = new Set();
  let guard = 0;
  while (selected.length < count && guard < items.length * 4 + count + 20) {
    guard += 1;
    const candidate = items.find((item) => { const k = keyFn(item); return !used.has(k) && !selectedKeys.has(k); });
    if (!candidate) { cycle += 1; used = new Set(); exhausted = true; if (selectedKeys.size >= validKeys.size) selectedKeys.clear(); continue; }
    const k = keyFn(candidate);
    selected.push(candidate); selectedKeys.add(k); used.add(k);
  }
  state.pools[poolName] = { cycle, pool_size: items.length, used_count: used.size, used: [...used].sort(), exhausted_this_run: exhausted, last_selected: selected.map(keyFn), updated_at: new Date().toISOString() };
  return { selected, pool: state.pools[poolName] };
}
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
function walk(dir, out = []) { if (!exists(dir)) return out; for (const entry of fssync.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full, out); else if (/\.png$/i.test(entry.name)) out.push(full); } return out; }
function cleanTitle(file) { return path.basename(file, path.extname(file)).replace(/^\d+[_-]?/, "").replace(/^BCOS[_-]SET[_-]\d+[_-]?/i, "").replace(/^sapiver[_-]book[_-]content[_-]os[_-]?/i, "").replace(/[_-]+/g, " ").replace(/\bpngs?\b/gi, "").replace(/\s+/g, " ").trim(); }
function copyList(images, dir) { fssync.mkdirSync(dir, { recursive: true }); return images.map((src, i) => { const dst = path.join(dir, `${String(i + 1).padStart(2, "0")}_${path.basename(src)}`); execFileSync("ffmpeg", ["-y", "-i", src, "-map_metadata", "-1", dst], { stdio: "inherit" }); return rel(dst); }); }
function ffmpegEscape(file) { return file.replace(/'/g, "'\\''"); }
function buildVideo(images, dir) {
  fssync.mkdirSync(dir, { recursive: true });
  const copied = copyList(images, dir);
  const copiedAbs = copied.map((p) => path.join(ROOT, p));
  const listPath = path.join(dir, "ffmpeg-input.txt");
  const lines = [];
  for (const img of copiedAbs) { lines.push(`file '${ffmpegEscape(img)}'`); lines.push(`duration ${VIDEO_SECONDS_PER_IMAGE}`); }
  lines.push(`file '${ffmpegEscape(copiedAbs[copiedAbs.length - 1])}'`);
  fssync.writeFileSync(listPath, `${lines.join("\n")}\n`, "utf8");
  const videoPath = path.join(dir, "book_content_os_video.mp4");
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-map_metadata", "-1", "-movflags", "+faststart", videoPath], { stdio: "inherit" });
  return { images: copied, video: rel(videoPath) };
}
function assetGroupKey(file) { const r = rel(file); const parts = r.split("/"); const extractedIndex = parts.indexOf("_extracted"); if (extractedIndex >= 0 && parts[extractedIndex + 1]) return parts.slice(0, extractedIndex + 2).join("/"); return path.dirname(r).replaceAll("\\", "/"); }
function rotateList(items, offset) { if (!items.length) return []; const o = ((offset % items.length) + items.length) % items.length; return [...items.slice(o), ...items.slice(0, o)]; }
function orderedImagePool(images) { const uniqueByPath = [...new Map(images.map((p) => [rel(p).toLowerCase(), p])).values()].sort(); return { uniqueByPath, groups: [...new Set(uniqueByPath.map(assetGroupKey))], ordered: rotateList(uniqueByPath, dayIndex() * 7) }; }
function subjectList(images) { return [...new Set(images.map((img) => cleanTitle(img)).filter(Boolean))].slice(0, 8); }
function pinTitle(copyRow) { return String(copyRow?.title || "Book Content OS Lite + Pro").slice(0, 100); }
function videoTitle(copyRow) { return String(copyRow?.title ? `${copyRow.title} | Book Content OS` : "Book Content OS Lite + Pro").slice(0, 100); }
function caption(copyRow) { return `${copyRow.caption}\n\n${CTA_TEXT}\n\n${hashtags(5)}\n`; }
function firstComment(copyRow) { return `${copyRow.first_comment || CTA_TEXT}\n\n${hashtags(4)}\n`; }

unzipAssets();
const all = ASSET_ROOTS.flatMap((r) => walk(r)).filter((p) => !p.includes(`${path.sep}_extracted${path.sep}_extracted${path.sep}`));
const { uniqueByPath, groups, ordered } = orderedImagePool(all);
if (uniqueByPath.length < 5) throw new Error(`Need at least five Book Content OS PNG assets. Found ${uniqueByPath.length}. Add ZIPs to assets/book-content-os/social_sets or configure the workflow Drive download step.`);
const rotationState = loadRotationState();
const imagePick = chooseFromPool(rotationState, "images", ordered, 6, (img) => rel(img).toLowerCase());
const copyRows = rotateList(loadCopyRows(), dayIndex());
const copyPick = chooseFromPool(rotationState, "copy", copyRows, 1, (x) => keySafe(x.id)).selected[0];
const selected = imagePick.selected;
const carouselImages = selected.length >= 6 ? selected.slice(1, 6) : selected.slice(0, 5);
const pinImage = selected[0] || carouselImages[0];
const subjects = subjectList(carouselImages);
const selectedGroups = [...new Set(selected.map(assetGroupKey))];
rotationState.updated_at = new Date().toISOString();
rotationState.last_run = { date: DATE, images: selected.map((img) => rel(img)), copy: copyPick?.id || null };
rotationState.history.push(rotationState.last_run);
rotationState.history = rotationState.history.slice(-30);
await ensureDir(OUT);
const pinDir = path.join(OUT, "pinterest_pin");
const fbDir = path.join(OUT, "facebook_carousel");
const videoDir = path.join(OUT, "pinterest_video");
const pinOut = copyList([pinImage], pinDir)[0];
const fbOut = copyList(carouselImages, fbDir);
const videoOut = buildVideo(carouselImages, videoDir);
const fbCaptionFiles = carouselImages.map((_, i) => `facebook_carousel/${String(i + 1).padStart(2, "0")}_caption.txt`);
await fs.writeFile(path.join(pinDir, "title.txt"), `${pinTitle(copyPick)}\n`, "utf8");
await fs.writeFile(path.join(pinDir, "caption.txt"), caption(copyPick), "utf8");
await fs.writeFile(path.join(pinDir, "first-comment.txt"), firstComment(copyPick), "utf8");
await fs.writeFile(path.join(fbDir, "post-caption.txt"), caption(copyPick), "utf8");
await fs.writeFile(path.join(fbDir, "first-comment.txt"), firstComment(copyPick), "utf8");
await fs.writeFile(path.join(videoDir, "title.txt"), `${videoTitle(copyPick)}\n`, "utf8");
await fs.writeFile(path.join(videoDir, "caption.txt"), caption(copyPick), "utf8");
await fs.writeFile(path.join(videoDir, "first-comment.txt"), firstComment(copyPick), "utf8");
for (let i = 0; i < fbCaptionFiles.length; i++) await fs.writeFile(path.join(OUT, fbCaptionFiles[i]), caption(copyPick), "utf8");
const manifest = { type: "book_content_os_social_manual_run_v1", date: DATE, cta_text: CTA_TEXT, product: "Book Content OS Lite + Pro", asset_group: "mixed_book_content_os_assets_no_repeat", asset_groups: selectedGroups, asset_group_count: groups.length, asset_group_image_count: uniqueByPath.length, subjects, copy: copyPick, rotation: { state_file: "social/book-content-os/rotation-state.json", pools: rotationState.pools, rule: "No image or copy row is reused until its own pool is exhausted; then that pool loops." }, media_cleaning: { ordinary_metadata_stripped: true, image_method: "ffmpeg re-encode with -map_metadata -1", video_method: "ffmpeg concat/re-encode with -map_metadata -1", limitation: "This removes ordinary metadata; it cannot guarantee removal of invisible AI watermarks embedded in pixels." }, pinterest: { image: pinOut, title: "pinterest_pin/title.txt", caption: "pinterest_pin/caption.txt", first_comment: "pinterest_pin/first-comment.txt" }, pinterest_video: { video: videoOut.video, source_images: videoOut.images, title: "pinterest_video/title.txt", caption: "pinterest_video/caption.txt", first_comment: "pinterest_video/first-comment.txt" }, facebook: { images: fbOut, image_captions: fbCaptionFiles, post_caption: "facebook_carousel/post-caption.txt", first_comment: "facebook_carousel/first-comment.txt" }, notes: ["Separate Book Content OS run; does not use FTPE copy or FTPE rotation state.", "Public social text uses link in bio only and does not print raw URLs.", "Image/video outputs are re-encoded to strip ordinary metadata before posting."] };
await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
await fs.rm(LATEST, { recursive: true, force: true });
await fs.cp(OUT, LATEST, { recursive: true });
writeJsonSync(ROTATION_STATE_PATH, rotationState);
console.log(`Built Book Content OS social post for ${DATE}`);
console.log(`Images selected without early reuse: ${selected.map((img) => rel(img)).join(", ")}`);
console.log(`Copy used: ${copyPick?.id || "none"}`);
console.log("Metadata stripping: PNG and MP4 outputs re-encoded with ffmpeg and -map_metadata -1.");
