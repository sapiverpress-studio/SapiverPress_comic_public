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
      return href.includes("suite.sapiverpress.co.uk/play/") || href.includes("netlify.app");
    })
    .map((item) => item.href)
    .filter((href, index, arr) => arr.indexOf(href) === index)
    .sort();

  if (!candidates.length) {
    console.log("No playable links discovered; falling back to Trigoku.");
    return { url: "https://suite.sapiverpress.co.uk/play/trigoku/", mode: "trigoku-fallback", candidates: [] };
  }

  const index = stableIndex(date, candidates.length);
  const url = candidates[index];
  console.log(`Selected puzzle ${index + 1}/${candidates.length}: ${url}`);
  return { url, mode: "daily-discovered-playable", candidates };
}

async function focusPuzzleArea(page) {
  const target = await page.evaluate(() => {
    const selectors = [
      "canvas",
      "svg",
      "table",
      "[role='grid']",
      "[class*='sudoku']",
      "[class*='grid']",
      "[class*='puzzle']",
      "main",
      "body",
    ];

    let best = null;
    for (const selector of selectors) {
      const nodes = [...document.querySelectorAll(selector)];
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (rect.width < 180 || rect.height < 140) continue;
        if (!best || area > best.area) {
          best = { selector, area, top: rect.top, left: rect.left, width: rect.width, height: rect.height };
        }
      }
      if (best && selector !== "main" && selector !== "body") break;
    }

    if (best) {
      const node = document.querySelector(best.selector);
      if (node) node.scrollIntoView({ block: "center", inline: "center" });
    }
    window.scrollBy(0, -60);
    return best;
  });

  await page.waitForTimeout(700);
  console.log(`Focused puzzle area: ${target ? `${target.selector} ${Math.round(target.width)}x${Math.round(target.height)}` : "none"}`);
  return target;
}

async function captureFocused(page, outputPath) {
  await focusPuzzleArea(page);

  const clip = await page.evaluate(() => {
    const selectors = ["canvas", "svg", "table", "[role='grid']", "[class*='sudoku']", "[class*='grid']", "[class*='puzzle']", "main"];
    let best = null;
    for (const selector of selectors) {
      for (const node of [...document.querySelectorAll(selector)]) {
        const rect = node.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (rect.width < 180 || rect.height < 140) continue;
        if (!best || area > best.area) {
          best = { x: rect.left, y: rect.top, width: rect.width, height: rect.height, area, selector };
        }
      }
      if (best && selector !== "main") break;
    }
    if (!best) return null;

    const pad = 40;
    const x = Math.max(0, Math.floor(best.x - pad));
    const y = Math.max(0, Math.floor(best.y - pad));
    const maxW = window.innerWidth - x;
    const maxH = window.innerHeight - y;
    return {
      x,
      y,
      width: Math.max(240, Math.min(Math.ceil(best.width + pad * 2), maxW)),
      height: Math.max(220, Math.min(Math.ceil(best.height + pad * 2), maxH)),
      selector: best.selector,
    };
  });

  if (clip && clip.width > 0 && clip.height > 0) {
    await page.screenshot({ path: outputPath, clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height }, type: "png" });
    console.log(`Captured focused ${clip.selector}: ${path.relative(ROOT, outputPath)}`);
  } else {
    await page.screenshot({ path: outputPath, fullPage: false, type: "png" });
    console.log(`Captured viewport fallback: ${path.relative(ROOT, outputPath)}`);
  }
}

async function progressPuzzle(page, stage) {
  for (let i = 0; i < stage; i++) {
    const hintSelectors = [
      "button:has-text('Hint')",
      "text=/^Hint$/i",
      "button:has-text('Check')",
    ];

    let clicked = false;
    for (const selector of hintSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 400 })) {
          await button.click({ timeout: 800 });
          clicked = true;
          await page.waitForTimeout(600);
          break;
        }
      } catch {}
    }

    if (!clicked) {
      console.log(`No safe progress button found for stage ${stage}; keeping real current state.`);
      break;
    }
  }
}

async function copyDebugCaptures(capturePaths, captureDir, date) {
  const debugDir = path.join(ROOT, "social", date, "raw_captures");
  await fs.mkdir(debugDir, { recursive: true });
  for (const capturePath of capturePaths) {
    if (await exists(capturePath)) {
      await fs.copyFile(capturePath, path.join(debugDir, path.basename(capturePath)));
    }
  }
  const manifestPath = path.join(captureDir, "capture_manifest.json");
  if (await exists(manifestPath)) {
    await fs.copyFile(manifestPath, path.join(debugDir, "capture_manifest.json"));
  }
  console.log(`Debug captures copied to ${path.relative(ROOT, debugDir)}`);
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
  await copyDebugCaptures(capturePaths, captureDir, date);
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
  await focusPuzzleArea(page);

  for (let stage = 0; stage < capturePaths.length; stage++) {
    if (stage > 0) {
      await progressPuzzle(page, stage);
      await page.waitForTimeout(700);
    }
    await captureFocused(page, capturePaths[stage]);
  }

  const manifest = {
    date,
    source_url: choice.url,
    source_mode: choice.mode,
    playable_candidates: choice.candidates || [],
    created_at: new Date().toISOString(),
    viewport: { width: 1280, height: 900 },
    note: "Real live page screenshots captured by Playwright Chromium from a playable puzzle source. The script focuses the puzzle area before capture and uses app buttons such as Hint/Check when available. No placeholder images or fake puzzle grids are generated.",
    files: EXPECTED_CAPTURE_NAMES,
  };

  await fs.writeFile(
    path.join(captureDir, "capture_manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  await copyDebugCaptures(capturePaths, captureDir, date);
  console.log(`Today’s live puzzle captures ready: ${path.relative(ROOT, captureDir)}`);
} catch (error) {
  fail(error?.stack || error?.message || String(error));
} finally {
  if (browser) {
    await browser.close();
  }
}
