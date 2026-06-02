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

function daysBetween(a, b) {
  const da = new Date(`${a}T12:00:00Z`);
  const db = new Date(`${b}T12:00:00Z`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 9999;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
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

async function recentSourceHistory(currentDate, windowDays = 10, limit = 40) {
  const socialDir = path.join(ROOT, "social");
  const rows = [];
  try {
    const entries = await fs.readdir(socialDir, { withFileTypes: true });
    const dates = entries
      .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const date of dates) {
      if (rows.length >= limit) break;
      const ageDays = daysBetween(date, currentDate);
      if (ageDays < 0) continue;
      if (ageDays > Math.max(windowDays, 30)) continue;
      const data = await readJson(path.join(socialDir, date, "raw_captures", "today_puzzle_data.json"), null);
      const manifest = await readJson(path.join(socialDir, date, "raw_captures", "capture_manifest.json"), null);
      const id = data?.source_id || manifest?.selected_source?.id || null;
      const type = data?.source_type || manifest?.selected_source?.type || null;
      const name = data?.source_name || manifest?.selected_source?.name || id;
      if (id) rows.push({ date, source_id: id, source_type: type, source_name: name, age_days: ageDays });
    }
  } catch {}
  return rows;
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

function orderedSources({ sources, date, history, noRepeatWindowDays }) {
  const recentWindow = history.filter((row) => row.age_days <= noRepeatWindowDays);
  const recentIds = new Set(recentWindow.map((row) => row.source_id));
  const lastUsedAge = new Map();
  for (const source of sources) lastUsedAge.set(source.id, 9999);
  for (const row of history) {
    if (!lastUsedAge.has(row.source_id)) continue;
    lastUsedAge.set(row.source_id, Math.min(lastUsedAge.get(row.source_id), row.age_days));
  }

  const start = stableIndex(`${date}-source-diversity-no-repeat-${noRepeatWindowDays}`, sources.length);
  const rotated = [...sources.slice(start), ...sources.slice(0, start)];
  const fresh = rotated.filter((source) => !recentIds.has(source.id));
  const recent = rotated.filter((source) => recentIds.has(source.id));

  if (fresh.length) {
    return {
      ordered: [...fresh, ...recent.sort((a, b) => (lastUsedAge.get(b.id) || 0) - (lastUsedAge.get(a.id) || 0))],
      method: `date_seeded_no_repeat_${noRepeatWindowDays}_days`,
      fallback_used: false,
      blocked_recent_source_ids: [...recentIds],
    };
  }

  const leastRecent = [...recent].sort((a, b) => (lastUsedAge.get(b.id) || 0) - (lastUsedAge.get(a.id) || 0));
  return {
    ordered: leastRecent,
    method: `least_recently_used_after_all_sources_seen_within_${noRepeatWindowDays}_days`,
    fallback_used: true,
    blocked_recent_source_ids: [...recentIds],
  };
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

  const noRepeatWindowDays = Number(registry.selection?.no_repeat_window_days || 10);
  const history = await recentSourceHistory(date, noRepeatWindowDays);
  const selection = orderedSources({ sources, date, history, noRepeatWindowDays });
  const ordered = selection.ordered;
  console.log(`Puzzle source no-repeat window: ${noRepeatWindowDays} days`);
  console.log(`Puzzle source recent history: ${history.slice(0, noRepeatWindowDays).map((row) => `${row.date}:${row.source_id}`).join(", ") || "none"}`);
  console.log(`Puzzle source blocked this window: ${selection.blocked_recent_source_ids.join(", ") || "none"}`);
  console.log(`Puzzle source order: ${ordered.map((source) => source.id).join(" > ")}`);
  if (selection.fallback_used) console.log("Puzzle source no-repeat fallback: all configured sources were recently used; choosing least recently used source first.");

  const captureDir = path.join(ROOT, "captures", date, "extracted");
  const rawDir = path.join(ROOT, "social", date, "raw_captures");
  await fs.mkdir(captureDir, { recursive: true });
  await fs.mkdir(rawDir, { recursive: true });

  const attempts = [];
  let selected = null;
  let extractedPath = null;

  for (const source of ordered) {
    const recentlyUsed = selection.blocked_recent_source_ids.includes(source.id);
    console.log(`Trying downloadable puzzle source: ${source.id}${recentlyUsed ? " (recent fallback candidate)" : ""}`);
    const result = await tryDownloadFromSource(source, date, captureDir);
    if (!result) {
      attempts.push({ id: source.id, project: source.netlify_project, downloaded: false, recent_no_repeat_blocked: recentlyUsed, no_repeat_window_days: noRepeatWindowDays });
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
          method: selection.method,
          no_repeat_window_days: noRepeatWindowDays,
          fallback_used: selection.fallback_used,
          blocked_recent_source_ids: selection.blocked_recent_source_ids,
          recent_source_history: history.slice(0, noRepeatWindowDays),
          order: ordered.map((item) => item.id),
        },
      };
      await fs.writeFile(dataPath, JSON.stringify(enriched, null, 2) + "\n", "utf8");
      await fs.writeFile(path.join(captureDir, "today_trigoku_data.json"), JSON.stringify(enriched, null, 2) + "\n", "utf8");
      selected = source;
      extractedPath = dataPath;
      attempts.push({ id: source.id, project: source.netlify_project, downloaded: true, extracted: true, url: result.url, recent_no_repeat_blocked: recentlyUsed, no_repeat_window_days: noRepeatWindowDays });
      break;
    }

    attempts.push({ id: source.id, project: source.netlify_project, downloaded: true, extracted: false, url: result.url, recent_no_repeat_blocked: recentlyUsed, no_repeat_window_days: noRepeatWindowDays });
  }

  if (!selected || !extractedPath) {
    const manifest = { date, stage_method: "download_probe_failed", source_attempts: attempts, recent_source_history: history, no_repeat_window_days: noRepeatWindowDays, note: "No standalone source produced a downloadable givens+solution JSON. Browser screenshots are intentionally disabled." };
    await fs.writeFile(path.join(rawDir, "capture_manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
    fail("No standalone source produced downloadable givens+solution JSON. Refusing browser screenshot fallback.");
  }

  runPython(["-m", "pip", "install", "-r", "requirements.txt"], "Python requirements install failed");
  runPython(["scripts/render_trigoku_json_states.py"], "Renderer failed");

  const manifestPath = path.join(captureDir, "capture_manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.selected_source = selected;
  manifest.source_attempts = attempts;
  manifest.recent_source_history = history;
  manifest.no_repeat_window_days = noRepeatWindowDays;
  manifest.blocked_recent_source_ids = selection.blocked_recent_source_ids;
  manifest.no_repeat_fallback_used = selection.fallback_used;
  manifest.source_selection_method = selection.method;
  manifest.stage_method = "standalone_netlify_download_rendered_states";
  manifest.note = "Selected from standalone Netlify puzzle sources with ten-day no-repeat rule. Downloaded real site data and rendered staged board PNGs. No browser gameplay screenshots.";
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await fs.copyFile(manifestPath, path.join(rawDir, "capture_manifest.json"));
  await fs.copyFile(extractedPath, path.join(rawDir, "today_puzzle_data.json"));

  console.log(`Rendered downloadable puzzle source ${selected.id}`);
}

main().catch((error) => fail(error?.stack || error?.message || String(error)));