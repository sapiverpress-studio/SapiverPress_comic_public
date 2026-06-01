import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function todayLondon() {
  const override = (process.env.DATE_OVERRIDE || "").trim();
  if (override) return override;
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

async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")); } catch { return fallback; }
}

function runPython(args, label) {
  const result = spawnSync("python", args, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) fail(label);
}

async function recentSourceIds(limit = 8) {
  const socialDir = path.join(ROOT, "social");
  const ids = [];
  try {
    const entries = await fs.readdir(socialDir, { withFileTypes: true });
    const dates = entries
      .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const date of dates) {
      if (ids.length >= limit) break;
      const data = await readJson(path.join(socialDir, date, "raw_captures", "today_puzzle_data.json"), null);
      const manifest = await readJson(path.join(socialDir, date, "raw_captures", "capture_manifest.json"), null);
      const id = data?.source_id || manifest?.selected_source?.id || null;
      if (id) ids.push(id);
    }
  } catch {}
  return ids;
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

function orderedSources({ sources, date, recentIds }) {
  const recent = new Set(recentIds.slice(0, 6));
  const start = stableIndex(`${date}-source-diversity-v2`, sources.length);
  const rotated = [...sources.slice(start), ...sources.slice(0, start)];
  const fresh = rotated.filter((source) => !recent.has(source.id));
  const repeated = rotated.filter((source) => recent.has(source.id));
  return [...fresh, ...repeated];
}

async function main() {
  const date = todayLondon();
  const override = (process.env.DATE_OVERRIDE || "").trim();
  const realToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const todayObj = Object.fromEntries(realToday.map((p) => [p.type, p.value]));
  const actualToday = `${todayObj.year}-${todayObj.month}-${todayObj.day}`;
  if (override && override !== actualToday) {
    fail("This capture script only captures today's live puzzle data. Leave DATE_OVERRIDE blank or use today's date for live runs.");
  }

  const registry = JSON.parse(await fs.readFile(path.join(ROOT, "config", "puzzle_sources.json"), "utf8"));
  const sources = (registry.sources || []).filter((s) => !(registry.exclude || []).includes(s.netlify_project));
  if (!sources.length) fail("No standalone puzzle sources configured");

  const recentIds = await recentSourceIds();
  const ordered = orderedSources({ sources, date, recentIds });
  console.log(`Puzzle source diversity: recent=${recentIds.slice(0, 6).join(", ") || "none"}`);
  console.log(`Puzzle source order: ${ordered.map((source) => source.id).join(" > ")}`);

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
      attempts.push({ id: source.id, project: source.netlify_project, downloaded: false, recent_cooldown: recentIds.includes(source.id) });
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
        source_type: source.type,
        source_url_used: result.url,
        fallback_display_url: source.suite_url || source.url,
        mode: data.mode || source.name,
        date,
        source_selection: {
          method: "date_seeded_with_recent_cooldown",
          recent_source_ids: recentIds.slice(0, 8),
          order: ordered.map((item) => item.id),
        },
      };
      await fs.writeFile(dataPath, JSON.stringify(enriched, null, 2) + "\n", "utf8");
      await fs.writeFile(path.join(captureDir, "today_trigoku_data.json"), JSON.stringify(enriched, null, 2) + "\n", "utf8");
      selected = source;
      extractedPath = dataPath;
      attempts.push({ id: source.id, project: source.netlify_project, downloaded: true, extracted: true, url: result.url, recent_cooldown: recentIds.includes(source.id) });
      break;
    }

    attempts.push({ id: source.id, project: source.netlify_project, downloaded: true, extracted: false, url: result.url, recent_cooldown: recentIds.includes(source.id) });
  }

  if (!selected || !extractedPath) {
    const manifest = { date, stage_method: "download_probe_failed", attempts, recent_source_ids: recentIds.slice(0, 8), note: "No standalone source produced a downloadable givens+solution JSON. Browser screenshots are intentionally disabled." };
    await fs.writeFile(path.join(rawDir, "capture_manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
    fail("No standalone source produced downloadable givens+solution JSON. Refusing browser screenshot fallback.");
  }

  runPython(["-m", "pip", "install", "-r", "requirements.txt"], "Python requirements install failed");
  runPython(["scripts/render_trigoku_json_states.py"], "Renderer failed");

  const manifestPath = path.join(captureDir, "capture_manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.selected_source = selected;
  manifest.source_attempts = attempts;
  manifest.recent_source_ids = recentIds.slice(0, 8);
  manifest.source_selection_method = "date_seeded_with_recent_cooldown";
  manifest.stage_method = "standalone_netlify_download_rendered_states";
  manifest.note = "Selected from standalone Netlify puzzle sources with recent-source cooldown. Downloaded real site data and rendered staged board PNGs. No browser gameplay screenshots.";
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await fs.copyFile(manifestPath, path.join(rawDir, "capture_manifest.json"));
  await fs.copyFile(extractedPath, path.join(rawDir, "today_puzzle_data.json"));

  console.log(`Rendered downloadable puzzle source ${selected.id}`);
}

main().catch((error) => fail(error?.stack || error?.message || String(error)));