import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

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

function stableIndex(seed, length) {
  let hash = 2166136261;
  for (const ch of seed) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % Math.max(1, length);
}

function fail(message) {
  console.error(`DAILY PUZZLE DOWNLOAD CAPTURE FAILED: ${message}`);
  process.exit(1);
}

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function tryDownloadFromSource(source, date, captureDir) {
  const urls = [source.url, source.suite_url].filter(Boolean);
  const downloadDir = path.join(captureDir, "downloaded", source.id);
  await fs.mkdir(downloadDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    for (const url of urls) {
      console.log(`Opening ${source.id}: ${url}`);
      try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        if (!response || !response.ok()) {
          console.log(`Skip ${url}: ${response?.status?.() || "no response"}`);
          continue;
        }
        try { await page.waitForLoadState("networkidle", { timeout: 12000 }); } catch {}
        await page.waitForTimeout(1500);

        const selectors = [
          "button:has-text('Download')",
          "a:has-text('Download')",
          "text=/^Download$/i",
          "[aria-label='Download']",
          "[title='Download']",
          "button:has-text('Export')",
          "a:has-text('Export')",
        ];

        for (const selector of selectors) {
          try {
            const item = page.locator(selector).first();
            if (!(await item.isVisible({ timeout: 500 }))) continue;
            const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
            await item.click({ timeout: 1200 });
            const download = await downloadPromise;
            const suggested = download.suggestedFilename() || `${source.id}_${date}_download`;
            const downloadPath = path.join(downloadDir, suggested);
            await download.saveAs(downloadPath);
            console.log(`Downloaded ${downloadPath}`);
            return { source, url, downloadPath };
          } catch {}
        }
      } catch (error) {
        console.log(`Source failed ${source.id} ${url}: ${error?.message || error}`);
      }
    }
  } finally {
    await browser.close();
  }
  return null;
}

async function main() {
  const date = todayLondon();
  const override = (process.env.DATE_OVERRIDE || "").trim();
  if (override && override !== date) {
    fail("This capture script only captures today's live puzzle data. Leave DATE_OVERRIDE blank for the daily Facebook run.");
  }

  const registry = JSON.parse(await fs.readFile(path.join(ROOT, "config", "puzzle_sources.json"), "utf8"));
  const sources = (registry.sources || []).filter((s) => !(registry.exclude || []).includes(s.netlify_project));
  if (!sources.length) fail("No standalone puzzle sources configured");

  const start = stableIndex(date, sources.length);
  const ordered = [...sources.slice(start), ...sources.slice(0, start)];

  const captureDir = path.join(ROOT, "captures", date, "extracted");
  const rawDir = path.join(ROOT, "social", date, "raw_captures");
  await fs.mkdir(captureDir, { recursive: true });
  await fs.mkdir(rawDir, { recursive: true });

  const attempts = [];
  let selected = null;
  let extractedPath = null;

  for (const source of ordered) {
    console.log(`Trying downloadable puzzle source: ${source.id}`);
    const result = await tryDownloadFromSource(source, date, captureDir);
    if (!result) {
      attempts.push({ id: source.id, project: source.netlify_project, downloaded: false });
      continue;
    }

    const dataPath = path.join(captureDir, "today_puzzle_data.json");
    const extract = spawnSync("python", ["scripts/extract_downloaded_puzzle_json.py", result.downloadPath, dataPath], {
      cwd: ROOT,
      stdio: "inherit",
    });

    if (extract.status === 0 && await exists(dataPath)) {
      const data = JSON.parse(await fs.readFile(dataPath, "utf8"));
      const enriched = {
        ...data,
        source_id: source.id,
        source_name: source.name,
        source_project: source.netlify_project,
        source_url_used: result.url,
        fallback_display_url: source.suite_url || source.url,
        mode: data.mode || source.name,
        date,
      };
      await fs.writeFile(dataPath, JSON.stringify(enriched, null, 2) + "\n", "utf8");
      await fs.writeFile(path.join(captureDir, "today_trigoku_data.json"), JSON.stringify(enriched, null, 2) + "\n", "utf8");
      selected = source;
      extractedPath = dataPath;
      attempts.push({ id: source.id, project: source.netlify_project, downloaded: true, extracted: true, url: result.url });
      break;
    }

    attempts.push({ id: source.id, project: source.netlify_project, downloaded: true, extracted: false, url: result.url });
  }

  if (!selected || !extractedPath) {
    const manifest = { date, stage_method: "download_probe_failed", attempts, note: "No standalone source produced a downloadable givens+solution JSON. Browser screenshots are intentionally disabled." };
    await fs.writeFile(path.join(rawDir, "capture_manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
    fail("No standalone source produced downloadable givens+solution JSON. Refusing browser screenshot fallback.");
  }

  const render = spawnSync("python", ["scripts/render_trigoku_json_states.py"], {
    cwd: ROOT,
    env: { ...process.env, DATE_OVERRIDE: date },
    stdio: "inherit",
  });
  if (render.status !== 0) fail("Renderer failed");

  const manifestPath = path.join(captureDir, "capture_manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.selected_source = selected;
  manifest.source_attempts = attempts;
  manifest.stage_method = "standalone_netlify_download_rendered_states";
  manifest.note = "Selected from standalone Netlify puzzle sources. Downloaded real site data and rendered staged board PNGs. No browser gameplay screenshots.";
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await fs.copyFile(manifestPath, path.join(rawDir, "capture_manifest.json"));
  await fs.copyFile(extractedPath, path.join(rawDir, "today_puzzle_data.json"));

  console.log(`Rendered downloadable puzzle source ${selected.id}`);
}

main().catch((error) => fail(error?.stack || error?.message || String(error)));
