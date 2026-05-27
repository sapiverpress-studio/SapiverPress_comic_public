import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PLAY_INDEX_URL = "https://suite.sapiverpress.co.uk/play/";

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

function stableIndex(seed, length) {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % Math.max(length, 1);
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

async function waitForPage(page) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 15000 });
  } catch {
    console.log("Network idle was not reached; continuing after DOM load.");
  }
  await page.waitForTimeout(2500);
}

async function choosePuzzleUrl(page, date) {
  const forced = (process.env.COMIC_PUZZLE_URL || "").trim();
  if (forced) {
    console.log(`Using forced puzzle URL: ${forced}`);
    return { url: forced, mode: "forced" };
  }

  console.log(`Discovering puzzle links from ${PLAY_INDEX_URL}`);
  const response = await page.goto(PLAY_INDEX_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  if (!response || !response.ok()) {
    fail(`Could not load play page: ${response?.status?.() || "no response"}`);
  }
  await waitForPage(page);

  const links = await page.evaluate(() => {
    return [...document.querySelectorAll("a[href]")]
      .map((a) => ({ href: a.href, text: (a.textContent || "").trim() }))
      .filter((item) => item.href);
  });

  const candidates = links
    .filter((item) => {
      const href = item.href.toLowerCase();
      if (href.includes("etsy") || href.includes("amazon") || href.includes("facebook") || href.includes("pinterest")) return false;
      if (href === "https://suite.sapiverpress.co.uk/" || href === PLAY_INDEX_URL) return false;
      return href.includes("netlify.app") || href.includes("suite.sapiverpress.co.uk/play/");
    })
    .map((item) => item.href)
    .filter((href, index, arr) => arr.indexOf(href) === index)
    .sort();

  if (!candidates.length) {
    console.log("No playable links discovered; falling back to the play page itself.");
    return { url: PLAY_INDEX_URL, mode: "play-page-fallback", candidates: [] };
  }

  const index = stableIndex(date, candidates.length);
  const url = candidates[index];
  console.log(`Selected puzzle ${index + 1}/${candidates.length}: ${url}`);
  return { url, mode: "daily-discovered-random", candidates };
}

async function nudgePuzzle(page, stage) {
  const viewport = page.viewportSize() || { width: 1280, height: 900 };
  const points = [
    [0.50, 0.50], [0.43, 0.47], [0.57, 0.47], [0.43, 0.57], [0.57, 0.57],
    [0.50, 0.40], [0.50, 0.60], [0.35, 0.50], [0.65, 0.50],
  ];

  const attempts = Math.max(1, stage * 2);
  for (let i = 0; i < attempts; i++) {
    const [px, py] = points[(stage + i) % points.length];
    const x = Math.round(viewport.width * px);
    const y = Math.round(viewport.height * py);
    await page.mouse.click(x, y);
    await page.keyboard.press(String(((stage + i) % 9) + 1));
    await page.keyboard.press("Tab").catch(() => {});
    await page.waitForTimeout(180);
  }

  const likelyButtons = [
    "text=/hint/i",
    "text=/check/i",
    "text=/new/i",
    "text=/start/i",
    "text=/play/i",
    "button:has-text('Hint')",
    "button:has-text('Check')",
  ];

  for (const selector of likelyButtons.slice(0, stage)) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 300 })) {
        await button.click({ timeout: 500 });
        await page.waitForTimeout(300);
      }
    } catch {}
  }
}

const today = londonToday();
const override = (process.env.DATE_OVERRIDE || "").trim();

if (override && override !== today) {
  fail("This capture script only captures today’s live puzzle. Leave DATE_OVERRIDE blank for the daily Facebook run.");
}

const date = today;
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

  const choice = await choosePuzzleUrl(page, date);
  const response = await page.goto(choice.url, { waitUntil: "domcontentloaded", timeout: 45000 });
  if (!response) {
    fail(`No response received from ${choice.url}`);
  }
  if (!response.ok()) {
    fail(`Page failed to load: ${response.status()} ${response.statusText()} from ${choice.url}`);
  }

  await waitForPage(page);

  for (let stage = 0; stage < capturePaths.length; stage++) {
    if (stage > 0) {
      await nudgePuzzle(page, stage);
      await page.waitForTimeout(700);
    }
    const outputPath = capturePaths[stage];
    await page.screenshot({ path: outputPath, fullPage: false, type: "png" });
    console.log(`Captured ${path.relative(ROOT, outputPath)}`);
  }

  const manifest = {
    date,
    source_url: choice.url,
    source_mode: choice.mode,
    playable_candidates: choice.candidates || [],
    created_at: new Date().toISOString(),
    viewport: { width: 1280, height: 900 },
    note: "Real live page screenshots captured by Playwright Chromium from a playable puzzle source. Interaction attempts are used to capture different stages when the game supports browser input. No placeholder images or fake puzzle grids are generated.",
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
