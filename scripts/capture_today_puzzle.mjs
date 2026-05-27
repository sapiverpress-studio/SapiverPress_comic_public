import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const EXPECTED_CAPTURE_NAMES = [
  "01_fresh_daily_grid.png",
  "02_first_moves.png",
  "03_stuck_moment.png",
  "04_breakthrough.png",
  "05_nearly_complete.png",
  "06_complete_solution.png",
];

function londonToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(`CAPTURE FAILED: ${message}`);
  process.exit(1);
}

const today = londonToday();
const override = (process.env.DATE_OVERRIDE || "").trim();

if (override && override !== today) {
  fail("This capture script only captures today’s live puzzle. Leave DATE_OVERRIDE blank for the daily Facebook run.");
}

const date = today;
const sourceUrl = (process.env.COMIC_PUZZLE_URL || "https://suite.sapiverpress.co.uk").trim();
const captureDir = path.join(ROOT, "captures", date, "extracted");
const capturePaths = EXPECTED_CAPTURE_NAMES.map((name) => path.join(captureDir, name));

await fs.mkdir(captureDir, { recursive: true });

if ((await Promise.all(capturePaths.map(exists))).every(Boolean)) {
  console.log(`Capture files already exist for ${date}: ${path.relative(ROOT, captureDir)}`);
  process.exit(0);
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

  const response = await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  if (!response) {
    fail(`No response received from ${sourceUrl}`);
  }
  if (!response.ok()) {
    fail(`Page failed to load: ${response.status()} ${response.statusText()} from ${sourceUrl}`);
  }

  try {
    await page.waitForLoadState("networkidle", { timeout: 15000 });
  } catch {
    console.log("Network idle was not reached; continuing after DOM load.");
  }

  await page.waitForTimeout(2500);

  for (const outputPath of capturePaths) {
    await page.screenshot({ path: outputPath, fullPage: false, type: "png" });
    console.log(`Captured ${path.relative(ROOT, outputPath)}`);
    await page.waitForTimeout(250);
  }

  const manifest = {
    date,
    source_url: sourceUrl,
    created_at: new Date().toISOString(),
    viewport: { width: 1280, height: 900 },
    note: "Real live page screenshots captured by Playwright Chromium. These are not placeholders or generated fake puzzle grids.",
    files: EXPECTED_CAPTURE_NAMES,
  };

  await fs.writeFile(
    path.join(captureDir, "capture_manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  console.log(`Today’s live puzzle captures ready: ${path.relative(ROOT, captureDir)}`);
} catch (error) {
  fail(error?.stack || error?.message || String(error));
} finally {
  if (browser) {
    await browser.close();
  }
}
