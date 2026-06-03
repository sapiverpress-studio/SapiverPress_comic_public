import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VARIANTS = ["kropki-sudoku", "hyper-sudoku", "anti-king-sudoku", "anti-knight-sudoku", "non-consecutive-sudoku", "odd-even-sudoku", "sudoku-x", "arrow-sudoku", "german-whispers-sudoku", "killer-sudoku", "little-killer-sudoku", "renban-sudoku", "sandwich-sudoku", "thermo-sudoku", "xv-sudoku", "trigoku"];

function dateLondon() {
  if (process.env.DATE_OVERRIDE) return process.env.DATE_OVERRIDE;
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const v = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

function indexFor(seed, n) {
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % Math.max(1, n);
}

function variantForDate(date) {
  const forced = (process.env.COMIC_PUZZLE_URL || "").trim();
  if (forced) {
    const slug = new URL(forced).pathname.split("/").filter(Boolean).at(-1) || "forced";
    return { slug, playUrl: forced.endsWith("/") ? forced : `${forced}/` };
  }
  const slug = VARIANTS[indexFor(date, VARIANTS.length)];
  return { slug, playUrl: `https://suite.sapiverpress.co.uk/play/${slug}/` };
}

async function readRenderedSuiteExport(exportUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  try {
    const response = await page.goto(exportUrl.toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
    if (!response || !response.ok()) throw new Error(`Suite export HTTP ${response?.status?.() || "no response"}`);
    await page.waitForFunction(() => {
      const text = document.body?.innerText || "";
      return text.includes('"export_status"') && text.includes('"solution"') && text.includes('"givens"');
    }, { timeout: 20000 });
    await page.waitForTimeout(300);
    const raw = await page.locator("body").innerText({ timeout: 5000 });
    return JSON.parse(raw);
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function main() {
  const date = dateLondon();
  const variant = variantForDate(date);
  const exportUrl = new URL(variant.playUrl);
  exportUrl.searchParams.set("sapiver_export", "1");
  console.log(`Suite export source: ${exportUrl}`);

  const data = await readRenderedSuiteExport(exportUrl);
  if (!String(data.export_status || "").startsWith("ok_solution_found")) throw new Error(`Bad Suite export status: ${data.export_status || "blank"}`);
  if (!Array.isArray(data.givens) || data.givens.length !== 81) throw new Error(`Bad givens length: ${data.givens?.length || 0}`);
  if (!Array.isArray(data.solution) || data.solution.length !== 81) throw new Error(`Bad solution length: ${data.solution?.length || 0}`);

  const captureDir = path.join(ROOT, "captures", date, "extracted");
  const rawDir = path.join(ROOT, "social", date, "raw_captures");
  await fs.rm(captureDir, { recursive: true, force: true });
  await fs.rm(rawDir, { recursive: true, force: true });
  await fs.mkdir(captureDir, { recursive: true });
  await fs.mkdir(rawDir, { recursive: true });

  const payload = {
    ...data,
    date,
    source_id: variant.slug,
    source_name: data.title || variant.slug,
    source_type: "suite_v9_export",
    source_url_used: exportUrl.toString(),
    fallback_display_url: variant.playUrl,
    mode: data.title || variant.slug,
    week: data.week_key || null,
    today: date,
  };
  await fs.writeFile(path.join(captureDir, "today_puzzle_data.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(captureDir, "today_trigoku_data.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  for (const args of [["-m", "pip", "install", "-r", "requirements.txt"], ["scripts/render_trigoku_json_states.py"]]) {
    const r = spawnSync("python", args, { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) throw new Error(`Python command failed: ${args.join(" ")}`);
  }

  const manifestPath = path.join(captureDir, "capture_manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.stage_method = "suite_v9_export_rendered_states";
  manifest.source_export_url = exportUrl.toString();
  manifest.selected_source = { id: variant.slug, url: variant.playUrl };
  manifest.note = "Rendered from live Suite SAPIVER_FINAL_EXPORT_V9 export. No compositor or model-generation changes.";
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.copyFile(manifestPath, path.join(rawDir, "capture_manifest.json"));
  await fs.copyFile(path.join(captureDir, "today_puzzle_data.json"), path.join(rawDir, "today_puzzle_data.json"));
  console.log(`Suite V9 capture ready: ${variant.slug}`);
  console.log(`Export status: ${data.export_status}; solution=${data.solution.length}; givens=${data.givens.length}`);
}

main().catch((err) => { console.error(`SUITE EXPORT CAPTURE FAILED: ${err?.message || err}`); process.exit(1); });
