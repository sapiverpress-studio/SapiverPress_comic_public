import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const TRIGOKU_URL = "https://suite.sapiverpress.co.uk/play/trigoku/";

const STAGES = [
  { file: "01_fresh_daily_grid.png", label: "fresh_daily_grid", hints: 0, check: false },
  { file: "02_first_moves.png", label: "first_moves", hints: 3, check: false },
  { file: "03_stuck_moment.png", label: "stuck_moment", hints: 8, check: true },
  { file: "04_breakthrough.png", label: "breakthrough", hints: 18, check: true },
  { file: "05_nearly_complete.png", label: "nearly_complete", hints: 45, check: true },
  { file: "06_complete_solution.png", label: "completion_attempt", hints: 140, check: true },
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

async function clickControl(page, label, required = false) {
  const selectors = [
    `button:has-text('${label}')`,
    `text=/^${label}$/i`,
    `[aria-label='${label}']`,
    `[title='${label}']`,
  ];
  for (const selector of selectors) {
    try {
      const item = page.locator(selector).first();
      if (await item.isVisible({ timeout: 250 })) {
        await item.click({ timeout: 900 });
        await page.waitForTimeout(220);
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
    if (!new RegExp(`\\b${word}\\b`, "i").test(txt)) {
      fail(`Trigoku control missing: ${word}`);
    }
  }
}

async function focusGame(page) {
  await page.evaluate(() => {
    const selectors = ["canvas", "svg", "table", "[role='grid']", "[class*='trigoku']", "[class*='grid']", "[class*='puzzle']", "main", "#root", "body"];
    let best = null;
    for (const selector of selectors) {
      for (const node of [...document.querySelectorAll(selector)]) {
        const r = node.getBoundingClientRect();
        const area = r.width * r.height;
        if (r.width < 220 || r.height < 180) continue;
        if (!best || area > best.area) best = { selector, area };
      }
      if (best && !["main", "#root", "body"].includes(selector)) break;
    }
    if (best) document.querySelector(best.selector)?.scrollIntoView({ block: "center", inline: "center" });
    window.scrollBy(0, -70);
  });
  await page.waitForTimeout(500);
}

async function captureViewport(page, out) {
  await focusGame(page);
  await page.screenshot({ path: out, fullPage: false, type: "png" });
  const buf = await fs.readFile(out);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function clickHints(page, targetTotal, state) {
  while (state.hintsClicked < targetTotal) {
    const ok = await clickControl(page, "Hint", false);
    if (!ok) break;
    state.hintsClicked++;
    if (state.hintsClicked % 20 === 0) await page.waitForTimeout(600);
  }
  return state.hintsClicked;
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
const outs = STAGES.map((s) => path.join(dir, s.file));
await fs.mkdir(dir, { recursive: true });

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const res = await page.goto(TRIGOKU_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  if (!res || !res.ok()) fail(`Could not load Trigoku: ${res?.status?.() || "no response"}`);
  await waitReady(page);
  await assertControls(page);

  await clickControl(page, "Reset", false);
  await page.waitForTimeout(600);

  const state = { hintsClicked: 0 };
  const stageLog = [];
  const hashes = [];

  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const beforeHints = state.hintsClicked;
    await clickHints(page, stage.hints, state);
    let checked = false;
    if (stage.check) checked = await clickControl(page, "Check", false);
    await page.waitForTimeout(800);
    const hash = await captureViewport(page, outs[i]);
    hashes.push(hash);
    stageLog.push({
      stage: i + 1,
      file: stage.file,
      label: stage.label,
      target_total_hints: stage.hints,
      hints_clicked_this_stage: state.hintsClicked - beforeHints,
      hints_clicked_total: state.hintsClicked,
      check_clicked: checked,
      screenshot_hash: hash,
    });
  }

  const uniqueHashes = new Set(hashes).size;
  if (uniqueHashes < 4) {
    fail(`Only ${uniqueHashes} distinct screenshots captured. Refusing to create weak staged output.`);
  }

  const finalText = await bodyText(page);
  const manifest = {
    date,
    source_url: TRIGOKU_URL,
    source_mode: "trigoku-fixed-for-staged-comic",
    stage_method: "fixed_hint_check_stages_no_text_completion_guess",
    created_at: new Date().toISOString(),
    viewport: { width: 1280, height: 900 },
    distinct_screenshot_count: uniqueHashes,
    stage_log: stageLog,
    final_page_signals: {
      contains_hints_used_text: /hints used/i.test(finalText),
      contains_mistakes_text: /mistakes/i.test(finalText),
      contains_next_text: /\bnext\b/i.test(finalText),
    },
    note: "Real Trigoku screenshots. Stages are created by fixed real Hint/Check clicks. No fake grids. No text-based completion guessing. No Next click before capture.",
    files: STAGES.map((s) => s.file),
  };
  await fs.writeFile(path.join(dir, "capture_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await copyRaw(outs, dir, date);
  console.log(`Trigoku staged captures ready: ${path.relative(ROOT, dir)}`);
} catch (err) {
  fail(err?.stack || err?.message || String(err));
} finally {
  if (browser) await browser.close();
}
