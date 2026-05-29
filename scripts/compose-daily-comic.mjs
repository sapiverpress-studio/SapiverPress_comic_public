import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { chromium } from "playwright";

const OUT = process.env.COMIC_OUTPUT_DIR || "social";
const SITE = process.env.SUITE_URL || "https://suite.sapiverpress.co.uk";
const PUZZLE_URL = process.env.COMIC_PUZZLE_URL || SITE;

// Slot coordinates are based on 1024x1536 template panels.
// They are scaled automatically if a template uses a different size.
const BASE_W = 1024;
const BASE_H = 1536;
const M = 36;
const GAP = 28;

const DEFAULT = {
  screen: { x: 430, y: 390, w: 535, h: 520 },
  speech: { x: 420, y: 76, w: 300, h: 175, size: 38, max: 22 },
  caption: { x: 70, y: 1396, w: 884, h: 95, size: 43, max: 56 }
};

const ISLA = {
  scene_01: { screen: { x: 455, y: 390, w: 520, h: 520 }, speech: { x: 460, y: 98, w: 250, h: 150, size: 38, max: 18 } },
  scene_02: { screen: { x: 470, y: 398, w: 500, h: 505 }, speech: { x: 458, y: 82, w: 300, h: 174, size: 36, max: 20 } },
  scene_03: { screen: { x: 430, y: 390, w: 535, h: 535 }, speech: { x: 420, y: 78, w: 300, h: 178, size: 36, max: 20 } },
  scene_04: { screen: { x: 420, y: 390, w: 545, h: 520 }, speech: { x: 390, y: 92, w: 270, h: 160, size: 39, max: 18 } },
  scene_05: { screen: { x: 430, y: 386, w: 535, h: 520 }, speech: { x: 455, y: 88, w: 260, h: 155, size: 38, max: 18 } },
  scene_06: { screen: { x: 425, y: 395, w: 535, h: 520 }, speech: { x: 450, y: 72, w: 250, h: 165, size: 37, max: 18 } }
};

function mergeSlot(story, scene) {
  const custom = story.character_id === "isla" ? ISLA[scene.id] || {} : {};
  return {
    screen: { ...DEFAULT.screen, ...(custom.screen || {}) },
    speech: { ...DEFAULT.speech, ...(custom.speech || {}) },
    caption: { ...DEFAULT.caption, ...(custom.caption || {}) }
  };
}

function today() {
  if (process.env.DATE_OVERRIDE) return process.env.DATE_OVERRIDE;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function exists(file) {
  try { return (await fs.stat(file)).isFile(); } catch { return false; }
}

function esc(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function wrap(value, max, maxLines) {
  const words = String(value || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const out = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (test.length > max && line) { out.push(line); line = word; } else { line = test; }
    if (out.length >= maxLines) break;
  }
  if (line && out.length < maxLines) out.push(line);
  return out;
}

function scaleBox(box, sx, sy) {
  return {
    x: Math.round(box.x * sx),
    y: Math.round(box.y * sy),
    w: Math.round(box.w * sx),
    h: Math.round(box.h * sy),
    size: Math.round((box.size || 34) * Math.min(sx, sy)),
    max: box.max || 24
  };
}

function textLayer(width, height, scene, slot) {
  const s = slot.speech;
  const c = slot.caption;
  const speechLines = wrap(scene.storyboard_dialogue || scene.dialogue, s.max, 3);
  const captionLines = wrap(scene.storyboard_caption || scene.caption, c.max, 2);
  const speech = speechLines.map((line, i) => `<tspan x="${s.x + s.w / 2}" y="${s.y + 50 + i * s.size * 0.92}">${esc(line)}</tspan>`).join("");
  const caption = captionLines.map((line, i) => `<tspan x="${c.x + c.w / 2}" y="${c.y + 58 + i * c.size * 0.85}">${esc(line)}</tspan>`).join("");
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><text font-family="Georgia, serif" font-style="italic" font-size="${s.size}" fill="#111" text-anchor="middle">${speech}</text><text font-family="Georgia, serif" font-style="italic" font-size="${c.size}" fill="#111" text-anchor="middle">${caption}</text></svg>`);
}

async function fallbackScreen(date) {
  return sharp({ create: { width: 1280, height: 900, channels: 4, background: "#080d18" } })
    .composite([{ input: Buffer.from(`<svg width="1280" height="900" xmlns="http://www.w3.org/2000/svg"><text x="640" y="430" text-anchor="middle" font-family="Arial" font-size="42" fill="#e2e8f0">Puzzle screen pending</text><text x="640" y="492" text-anchor="middle" font-family="Arial" font-size="30" fill="#94a3b8">${esc(SITE)}</text><text x="640" y="548" text-anchor="middle" font-family="Arial" font-size="24" fill="#64748b">${esc(date)}</text></svg>`), left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function capturePuzzle(date) {
  await fs.mkdir(OUT, { recursive: true });
  const p7 = path.join(OUT, `${date}_07_start.png`);
  const p8 = path.join(OUT, `${date}_08_latest.png`);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(PUZZLE_URL, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(2500);
    const first = await page.screenshot({ type: "png" });
    await fs.writeFile(p7, first);
    await page.waitForTimeout(2500);
    const second = await page.screenshot({ type: "png" });
    await fs.writeFile(p8, second);
    return { image: first, p7, p8, ok: true };
  } catch (error) {
    const image = await fallbackScreen(date);
    await fs.writeFile(p7, image);
    await fs.writeFile(p8, image);
    return { image, p7, p8, ok: false, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

async function makePanel(story, scene, puzzleImage, date) {
  const template = path.join("templates", "characters", story.character_id, scene.image_ref);
  if (!(await exists(template))) throw new Error(`Missing template: ${template}`);

  const meta = await sharp(template).metadata();
  const sx = meta.width / BASE_W;
  const sy = meta.height / BASE_H;
  const raw = mergeSlot(story, scene);
  const screen = scaleBox(raw.screen, sx, sy);
  const speech = scaleBox(raw.speech, sx, sy);
  const caption = scaleBox(raw.caption, sx, sy);

  const screenImage = await sharp(puzzleImage)
    .resize(screen.w, screen.h, { fit: "cover", position: "top" })
    .png()
    .toBuffer();

  const panel = await sharp(template)
    .composite([
      { input: screenImage, left: screen.x, top: screen.y },
      { input: textLayer(meta.width, meta.height, scene, { speech, caption }), left: 0, top: 0 }
    ])
    .png()
    .toBuffer();

  const panelPath = path.join(OUT, `${date}_${scene.id}.png`);
  await fs.writeFile(panelPath, panel);
  return { buffer: panel, path: panelPath, width: meta.width, height: meta.height };
}

async function main() {
  const date = today();
  await fs.mkdir(OUT, { recursive: true });
  const daily = path.join("daily", `${date}.json`);
  const story = JSON.parse(await fs.readFile(await exists(daily) ? daily : "latest.json", "utf8"));
  const capture = await capturePuzzle(date);

  const panels = [];
  for (const scene of story.scenes.slice(0, 6)) panels.push(await makePanel(story, scene, capture.image, date));

  const w = panels[0].width;
  const h = panels[0].height;
  const stripW = M * 2 + w * 2 + GAP;
  const stripH = M * 2 + h * 3 + GAP * 2;
  const placements = panels.map((panel, i) => ({ input: panel.buffer, left: M + (i % 2) * (w + GAP), top: M + Math.floor(i / 2) * (h + GAP) }));
  const full = path.join(OUT, `${date}.png`);
  await sharp({ create: { width: stripW, height: stripH, channels: 4, background: "#0b1533" } })
    .composite(placements)
    .png()
    .toFile(full);

  await fs.writeFile(path.join(OUT, `${date}.manifest.json`), JSON.stringify({ date, full, panels: panels.map((p) => p.path), closeup_07: capture.p7, closeup_08: capture.p8, puzzle_url: PUZZLE_URL, capture_ok: capture.ok, capture_error: capture.error || null, compositor: "template-slot-v1" }, null, 2));
  console.log(`Composed ${full}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
