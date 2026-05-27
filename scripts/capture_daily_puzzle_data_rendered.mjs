import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

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
  console.error(`DATA PUZZLE CAPTURE FAILED: ${message}`);
  process.exit(1);
}

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function tryJsonUrl(url) {
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) return null;
    const text = await response.text();
    const data = JSON.parse(text);
    return { url, data };
  } catch {
    return null;
  }
}

function hasGridData(data) {
  if (!data || typeof data !== "object") return false;
  const givens = data.givens || data.puzzle || data.grid || data.start;
  const solution = data.solution || data.solved || data.answer || data.answers;
  return Array.isArray(givens) && Array.isArray(solution);
}

async function findDataForSource(source) {
  const bases = [source.url, source.suite_url].filter(Boolean).map((u) => u.replace(/\/$/, ""));
  const paths = [
    "/today_trigoku_data.json",
    "/today_puzzle_data.json",
    "/puzzle.json",
    "/today.json",
    "/data/today.json",
    "/data/puzzle.json",
    "/data/today_puzzle_data.json",
    "/assets/today_puzzle_data.json",
    "/assets/today_trigoku_data.json",
    "/.netlify/functions/today",
    "/.netlify/functions/today-puzzle",
    "/.netlify/functions/puzzle",
  ];

  for (const base of bases) {
    for (const suffix of paths) {
      const found = await tryJsonUrl(`${base}${suffix}`);
      if (found && hasGridData(found.data)) return found;
    }
  }
  return null;
}

async function main() {
  const date = todayLondon();
  const override = (process.env.DATE_OVERRIDE || "").trim();
  if (override && override !== date) {
    fail("This capture script only captures today's live puzzle data. Leave DATE_OVERRIDE blank for the daily Facebook run.");
  }

  const registryPath = path.join(ROOT, "config", "puzzle_sources.json");
  const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
  const sources = (registry.sources || []).filter((s) => !(registry.exclude || []).includes(s.netlify_project));
  if (!sources.length) fail("No standalone puzzle sources configured");

  const start = stableIndex(date, sources.length);
  const ordered = [...sources.slice(start), ...sources.slice(0, start)];

  const captureDir = path.join(ROOT, "captures", date, "extracted");
  const rawDir = path.join(ROOT, "social", date, "raw_captures");
  await fs.mkdir(captureDir, { recursive: true });
  await fs.mkdir(rawDir, { recursive: true });

  let selected = null;
  let dataResult = null;
  const attempts = [];

  for (const source of ordered) {
    console.log(`Trying puzzle source: ${source.id} (${source.url})`);
    const found = await findDataForSource(source);
    attempts.push({ id: source.id, project: source.netlify_project, found: Boolean(found), url: found?.url || null });
    if (found) {
      selected = source;
      dataResult = found;
      break;
    }
  }

  if (!selected || !dataResult) {
    await fs.writeFile(path.join(rawDir, "capture_manifest.json"), JSON.stringify({ date, stage_method: "data_source_probe_failed", attempts }, null, 2) + "\n", "utf8");
    fail("No standalone source exposed usable givens+solution JSON. Refusing browser screenshot fallback.");
  }

  const data = {
    ...dataResult.data,
    source_id: selected.id,
    source_name: selected.name,
    source_project: selected.netlify_project,
    source_url_used: dataResult.url,
    fallback_display_url: selected.suite_url || selected.url,
    mode: dataResult.data.mode || selected.name,
    date,
  };

  const dataPath = path.join(captureDir, "today_puzzle_data.json");
  const legacyPath = path.join(captureDir, "today_trigoku_data.json");
  await fs.writeFile(dataPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.writeFile(legacyPath, JSON.stringify(data, null, 2) + "\n", "utf8");

  const render = spawnSync("python", ["scripts/render_trigoku_json_states.py"], {
    cwd: ROOT,
    env: { ...process.env, DATE_OVERRIDE: date },
    stdio: "inherit",
  });
  if (render.status !== 0) fail("Renderer failed");

  const manifestPath = path.join(captureDir, "capture_manifest.json");
  let manifest = {};
  if (await exists(manifestPath)) {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  }
  manifest.selected_source = selected;
  manifest.data_url = dataResult.url;
  manifest.source_attempts = attempts;
  manifest.stage_method = "standalone_netlify_json_rendered_states";
  manifest.note = "Selected from standalone Netlify puzzle sources. Rendered staged board PNGs from actual JSON data. No browser gameplay screenshots.";
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await fs.copyFile(manifestPath, path.join(rawDir, "capture_manifest.json"));
  await fs.copyFile(dataPath, path.join(rawDir, "today_puzzle_data.json"));
  console.log(`Rendered puzzle source ${selected.id} from ${dataResult.url}`);
}

main().catch((error) => fail(error?.stack || error?.message || String(error)));
