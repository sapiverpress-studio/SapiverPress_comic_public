import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dated = path.join(ROOT, "art-prompts", DATE, "prompts.json");
const latest = path.join(ROOT, "art-prompts", "latest", "prompts.json");

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}
async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
}
function rx(parts, flags = "gi") {
  return new RegExp(parts.join(""), flags);
}
function tidy(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+[,.;:]/g, ",")
    .replace(/,{2,}/g, ",")
    .replace(/\s+\./g, ".")
    .trim();
}

const overlayObjectPatterns = [
  rx(["cal", "endar"]),
  rx(["wall", "\\s+", "cal", "endar"]),
  rx(["desk", "\\s+", "cal", "endar"]),
  rx(["paper", "\\s+", "cal", "endar"]),
  rx(["monthly", "\\s+", "plan", "ner"]),
  rx(["weekly", "\\s+", "plan", "ner"]),
  rx(["plan", "ner"]),
  rx(["dead", "line", "\\s+", "note"]),
  rx(["rem", "inder", "\\s+", "note"]),
  rx(["sche", "dule"]),
  rx(["to", "[-\\s]?", "do", "\\s+", "list"]),
];

const abstractRewrites = [
  [rx(["checks?", "\\s+", "(?:her\\s+)?", "sche", "dule"]), "prepares for a busy day"],
  [rx(["dead", "line", "\\s+", "note"]), "timing pressure"],
  [rx(["rem", "inder", "\\s+", "note"]), "timing pressure"],
  [rx(["monthly", "\\s+", "plan", "ner"]), "busy month ahead"],
  [rx(["weekly", "\\s+", "plan", "ner"]), "busy week ahead"],
  [rx(["sche", "dule"]), "day plan"],
  [rx(["cal", "endar"]), "timing"],
  [rx(["plan", "ner"]), "planning mood"],
];

function cleanPromptText(value) {
  let s = String(value || "");
  for (const [pattern, replacement] of abstractRewrites) s = s.replace(pattern, replacement);
  for (const pattern of overlayObjectPatterns) s = s.replace(pattern, "");
  s = s.replace(/plain unmarked surfaces/g, "plain unmarked walls and surfaces");
  return tidy(s);
}

function assertClean(pack) {
  const hits = [];
  for (const [i, panel] of (pack.panels || []).entries()) {
    for (const field of ["prompt", "negative_prompt"]) {
      const text = String(panel[field] || "");
      for (const pattern of overlayObjectPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) hits.push(`panel ${i + 1} ${field}`);
      }
    }
  }
  if (hits.length) throw new Error(`Overlay object prompt cleaner failed: ${Array.from(new Set(hits)).join(", ")}`);
}

const pack = await readJson(dated, await readJson(latest, null));
if (!pack) throw new Error(`Missing prompt pack for ${DATE}`);
pack.overlay_object_cleaner = "strip_overlay_objects_from_prompts_v1";
pack.panels = (pack.panels || []).map((panel) => ({
  ...panel,
  prompt: cleanPromptText(panel.prompt),
  negative_prompt: cleanPromptText(panel.negative_prompt),
}));
assertClean(pack);
await writeJson(dated, pack);
await writeJson(latest, pack);
for (const panel of pack.panels) {
  if (panel.prompt_file) await writeText(path.join(ROOT, panel.prompt_file), `${panel.prompt}\n`);
}
console.log(`Overlay-only visual objects stripped from final prompts for ${DATE}`);
