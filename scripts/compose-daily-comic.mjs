import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { chromium } from "playwright";

const OUT = process.env.COMIC_OUTPUT_DIR || "social";
const SITE = process.env.SUITE_URL || "https://suite.sapiverpress.co.uk";
const PUZZLE_URL = process.env.COMIC_PUZZLE_URL || SITE;
const BOX = (process.env.COMIC_SCREEN_BOX || "0.535,0.145,0.355,0.245").split(",").map(Number);
const W = 1400;
const H = 1000;
const GAP = 36;
const M = 44;

function dateKey() {
  if (process.env.DATE_OVERRIDE) return process.env.DATE_OVERRIDE;
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

async function exists(f) {
  try { return (await fs.stat(f)).isFile(); } catch { return false; }
}

function esc(s) {
  return String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function lines(s, max, n) {
  const words = String(s || "").split(/\s+/).filter(Boolean);
  const out = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (test.length > max && line) { out.push(line); line = word; } else { line = test; }
    if (out.length >= n) break;
  }
  if (line && out.length < n) out.push(line);
  return out;
}

function rect() {
  const [x, y, w, h] = BOX;
  return { left: Math.round(x <= 1 ? x * W : x), top: Math.round(y <= 1 ? y * H : y), width: Math.round(w <= 1 ? w * W : w), height: Math.round(h <= 1 ? h * H : h) };
}

function overlaySvg(scene, date) {
  const d = lines(scene.dialogue, 30, 2).map((t, i) => `<tspan x="86" y="${100 + i * 36}">${esc(t)}</tspan>`).join("");
  const c = lines(scene.caption, 58, 2).map((t, i) => `<tspan x="${W / 2}" y="${H - 76 + i * 32}">${esc(t)}</tspan>`).join("");
  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect y="${H - 128}" width="${W}" height="128" fill="rgba(7,12,24,.78)"/><text font-family="Arial" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">${c}</text><rect x="54" y="48" width="540" height="112" rx="28" fill="rgba(255,255,255,.94)"/><text font-family="Arial" font-size="29" font-weight="700" fill="#101827">${d}</text><text x="${W - 30}" y="${H - 24}" font-family="Arial" font-size="21" fill="rgba(255,255,255,.72)" text-anchor="end">${esc(date)} · ${esc(scene.id)}</text></svg>`);
}

async function fallbackScreen(date) {
  return sharp({ create: { width: 1280, height: 900, channels: 4, background: "#080d18" } }).composite([{ input: Buffer.from(`<svg width="1280" height="900" xmlns="http://www.w3.org/2000/svg"><text x="640" y="440" text-anchor="middle" font-family="Arial" font-size="42" fill="#e2e8f0">Puzzle screen pending</text><text x="640" y="500" text-anchor="middle" font-family="Arial" font-size="30" fill="#94a3b8">${esc(SITE)}</text><text x="640" y="555" text-anchor="middle" font-family="Arial" font-size="24" fill="#64748b">${esc(date)}</text></svg>`), left: 0, top: 0 }]).png().toBuffer();
}

async function capture(date) {
  await fs.mkdir(OUT, { recursive: true });
  const p7 = path.join(OUT, `${date}_07_start.png`);
  const p8 = path.join(OUT, `${date}_08_latest.png`);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(PUZZLE_URL, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(2500);
    const a = await page.screenshot({ type: "png" });
    await fs.writeFile(p7, a);
    await page.waitForTimeout(2500);
    const b = await page.screenshot({ type: "png" });
    await fs.writeFile(p8, b);
    return { image: a, p7, p8, ok: true };
  } catch (e) {
    const image = await fallbackScreen(date);
    await fs.writeFile(p7, image);
    await fs.writeFile(p8, image);
    return { image, p7, p8, ok: false, error: e.message };
  } finally { if (browser) await browser.close(); }
}

async function panel(story, scene, screen, date) {
  const src = path.join("templates", "characters", story.character_id, scene.image_ref);
  const base = await (await exists(src) ? sharp(src).resize(W, H, { fit: "cover" }).png().toBuffer() : sharp({ create: { width: W, height: H, channels: 4, background: "#111827" } }).png().toBuffer());
  const r = rect();
  const shot = await sharp(screen).resize(r.width, r.height, { fit: "cover", position: "top" }).png().toBuffer();
  const frame = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect x="${r.left - 12}" y="${r.top - 12}" width="${r.width + 24}" height="${r.height + 24}" rx="22" fill="#030712" stroke="#111827" stroke-width="8"/></svg>`);
  return sharp(base).composite([{ input: frame, left: 0, top: 0 }, { input: shot, left: r.left, top: r.top }, { input: overlaySvg(scene, date), left: 0, top: 0 }]).png().toBuffer();
}

async function main() {
  const date = dateKey();
  await fs.mkdir(OUT, { recursive: true });
  const daily = path.join("daily", `${date}.json`);
  const story = JSON.parse(await fs.readFile(await exists(daily) ? daily : "latest.json", "utf8"));
  const cap = await capture(date);
  const panels = [];
  for (const s of story.scenes.slice(0, 6)) panels.push(await panel(story, s, cap.image, date));
  const stripW = M * 2 + W * 2 + GAP;
  const stripH = M * 2 + H * 3 + GAP * 2;
  const comps = panels.map((input, i) => ({ input, left: M + (i % 2) * (W + GAP), top: M + Math.floor(i / 2) * (H + GAP) }));
  const full = path.join(OUT, `${date}.png`);
  await sharp({ create: { width: stripW, height: stripH, channels: 4, background: "#0b1533" } }).composite(comps).png().toFile(full);
  await fs.writeFile(path.join(OUT, `${date}.manifest.json`), JSON.stringify({ date, full, closeup_07: cap.p7, closeup_08: cap.p8, puzzle_url: PUZZLE_URL, capture_ok: cap.ok, capture_error: cap.error || null, screen_box: BOX }, null, 2));
  console.log(`Composed ${full}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
