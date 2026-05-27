import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const TRIGOKU_URL = "https://suite.sapiverpress.co.uk/play/trigoku/";

const FILES = [
  "01_fresh_daily_grid.png",
  "02_first_moves.png",
  "03_stuck_moment.png",
  "04_breakthrough.png",
  "05_nearly_complete.png",
  "06_complete_solution.png",
];

function todayLondon() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

function fail(msg) {
  console.error(`CAPTURE FAILED: ${msg}`);
  process.exit(1);
}

async function waitReady(page) {
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  await page.waitForTimeout(1800);
}

async function bodyText(page) {
  return await page.evaluate(() => (document.body?.innerText || "").replace(/\s+/g, " ").trim());
}

async function clickLabel(page, label, required = false) {
  const selectors = [
    `button:has-text('${label}')`,
    `text=/^${label}$/i`,
    `[aria-label='${label}']`,
    `[title='${label}']`,
  ];
  for (const selector of selectors) {
    try {
      const item = page.locator(selector).first();
      if (await item.isVisible({ timeout: 300 })) {
        await item.click({ timeout: 900 });
        await page.waitForTimeout(350);
        console.log(`Clicked ${label}`);
        return true;
      }
    } catch {}
  }
  if (required) fail(`Missing required Trigoku control: ${label}`);
  return false;
}

async function assertControls(page) {
  const txt = await bodyText(page);
  for (const word of ["Hint", "Check", "Reset"]) {
    if (!new RegExp(`\\b${word}\\b`, "i").test(txt)) fail(`Trigoku control missing: ${word}`);
  }
}

async function focusGame(page) {
  await page.evaluate(() => {
    const selectors = ["canvas", "svg", "table", "[role='grid']", "[class*='trigoku']", "[class*='grid']", "[class*='puzzle']", "main"];
    let best = null;
    for (const selector of selectors) {
      for (const node of [...document.querySelectorAll(selector)]) {
        const r = node.getBoundingClientRect();
        const area = r.width * r.height;
        if (r.width < 180 || r.height < 140) continue;
        if (!best || area > best.area) best = { selector, area };
      }
      if (best && selector !== "main") break;
    }
    if (best) document.querySelector(best.selector)?.scrollIntoView({ block: "center", inline: "center" });
    window.scrollBy(0, -70);
  });
  await page.waitForTimeout(650);
}

async function captureGame(page, out) {
  await focusGame(page);
  const clip = await page.evaluate(() => {
    const selectors = ["canvas", "svg", "table", "[role='grid']", "[class*='trigoku']", "[class*='grid']", "[class*='puzzle']", "main"];
    let best = null;
    for (const selector of selectors) {
      for (const node of [...document.querySelectorAll(selector)]) {
        const r = node.getBoundingClientRect();
        const area = r.width * r.height;
        if (r.width < 180 || r.height < 140) continue;
        if (!best || area > best.area) best = { selector, x: r.left, y: r.top, width: r.width, height: r.height, area };
      }
      if (best && selector !== "main") break;
    }
    if (!best) return null;
    const pad = 70;
    const x = Math.max(0, Math.floor(best.x - pad));
    const y = Math.max(0, Math.floor(best.y - pad));
    return {
      selector: best.selector,
      x,
      y,
      width: Math.max(300, Math.min(Math.ceil(best.width + pad * 2), window.innerWidth - x)),
      height: Math.max(280, Math.min(Math.ceil(best.height + pad * 2), window.innerHeight - y)),
    };
  });
  if (clip) {
    await page.screenshot({ path: out, clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height }, type: "png" });
    console.log(`Captured ${clip.selector}: ${path.relative(ROOT, out)}`);
  } else {
    await page.screenshot({ path: out, fullPage: false, type: "png" });
    console.log(`Captured viewport: ${path.relative(ROOT, out)}`);
  }
}

async function hint(page, count) {
  let n = 0;
  for (let i = 0; i < count; i++) {
    if (!(await clickLabel(page, "Hint"))) break;
    n++;
  }
  return n;
}

async function stage(page, number) {
  if (number === 0) {
    await clickLabel(page, "Reset");
    return { action: "reset", hints: 0 };
  }
  const plan = [0, 1, 3, 8, 18, 60];
  const hints = await hint(page, plan[number] || 0);
  if (number >= 2) await clickLabel(page, "Check");
  if (number === 5) {
    await hint(page, 80);
    await clickLabel(page, "Check");
    await clickLabel(page, "Next");
  }
  return { action: "hint_check", hints };
}

async function copyRaw(paths, dir, date) {
  const raw = path.join(ROOT, "social", date, "raw_captures");
  await fs.mkdir(raw, { recursive: true });
  for (const p of paths) if (await exists(p)) await fs.copyFile(p, path.join(raw, path.basename(p)));
  const manifest = path.join(dir, "capture_manifest.json");
  if (await exists(manifest)) await fs.copyFile(manifest, path.join(raw, "capture_manifest.json"));
}

const date = todayLondon();
const override = (process.env.DATE_OVERRIDE || "").trim();
if (override && override !== date) fail("This capture script only captures today's live puzzle. Leave DATE_OVERRIDE blank for the daily Facebook run.");

const dir = path.join(ROOT, "captures", date, "extracted");
const outs = FILES.map((f) => path.join(dir, f));
await fs.mkdir(dir, { recursive: true });

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const res = await page.goto(TRIGOKU_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  if (!res || !res.ok()) fail(`Could not load Trigoku: ${res?.status?.() || "no response"}`);
  await waitReady(page);
  await assertControls(page);

  const log = [];
  for (let i = 0; i < outs.length; i++) {
    const info = await stage(page, i);
    await page.waitForTimeout(700);
    await captureGame(page, outs[i]);
    log.push({ stage: i + 1, file: FILES[i], ...info });
  }

  const finalText = await bodyText(page);
  const manifest = {
    date,
    source_url: TRIGOKU_URL,
    source_mode: "trigoku-fixed-for-staged-comic",
    stage_method: "hint_check_playthrough",
    created_at: new Date().toISOString(),
    viewport: { width: 1280, height: 900 },
    stage_log: log,
    final_signals: {
      solved_or_complete_words: /solved|complete|completed|unlocked|next/i.test(finalText),
      hints_used_text: /hints used/i.test(finalText),
      mistakes_text: /mistakes/i.test(finalText),
    },
    files: FILES,
  };
  await fs.writeFile(path.join(dir, "capture_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await copyRaw(outs, dir, date);
  console.log(`Trigoku staged captures ready: ${path.relative(ROOT, dir)}`);
} catch (err) {
  fail(err?.stack || err?.message || String(err));
} finally {
  if (browser) await browser.close();
}
