import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const TRIGGER = process.env.HF_LORA_TRIGGER?.trim() || "Isla_v2";
const PANEL_FILES = ["01_panel-01.png", "02_panel-02.png", "03_panel-03.png", "04_panel-04.png", "05_panel-05.png", "06_panel-06.png"];

const RISKY_OBJECT_PATTERNS = [
  /post\s*-?\s*it(?:\s+note)?/gi,
  /sticky\s+note/gi,
  /speech[_\s-]*bubble/gi,
  /thought[_\s-]*bubble/gi,
  /comic\s+callout/gi,
  /callout\s+box/gi,
  /caption\s+box/gi,
  /note\s+stuck\s+to\s+(?:the\s+)?(?:wall|screen|laptop|desk|window)/gi,
];

async function readJson(file, fallback = null) { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; } }
async function writeJson(file, data) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
async function writeText(file, data) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, data, "utf8"); }
function tidy(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
function stripRiskyVisualObjects(value) {
  let s = tidy(value);
  for (const pattern of RISKY_OBJECT_PATTERNS) s = s.replace(pattern, "");
  return tidy(s.replace(/\s+[,.;:]/g, ",").replace(/,{2,}/g, ","));
}
function clean(v) {
  let s = stripRiskyVisualObjects(v).replaceAll("Isla_v2", "").replaceAll("ISLA_SP", "");
  const badStarts = ["CALENDAR", "LOCK", "BANS", "METADATA", "NO GENERATED", "do not render", "no readable", "books, pages, signs", "clean text is compositor"];
  for (const b of badStarts) if (s.toLowerCase().startsWith(b.toLowerCase())) return "";
  return tidy(s);
}
function first(...xs) { for (const x of xs) { const y = clean(x); if (y) return y; } return ""; }
function promptFor(p, pack) {
  const appearance = first(p.appearance_lock, pack.appearance_lock) || "young Black woman, warm medium brown skin, natural coily dark hair in a high puff bun, floral headband, gold hoop earrings, oversized deep teal hoodie, warm painterly editorial style";
  const story = first(p.story_beat, p.storyboard_caption, p.caption) || "Isla pauses with calm focus";
  const location = first(p.panel_location, p.location_text, p.environment_text);
  const action = first(p.panel_action);
  const pose = first(p.panel_pose_family, p.pose_text, p.pose_marker);
  const screenState = tidy(p.panel_screen_state).toLowerCase();
  const screen = screenState.includes("no_puzzle") || screenState.includes("closed")
    ? "Story-only panel, device closed or absent, focus on Isla and the setting."
    : "Open laptop with a large plain dark blank screen facing the viewer for later puzzle overlay.";
  const cleanSurfaces = "Clean editorial illustration, plain unmarked surfaces, books and notebooks used only as simple colour-block props, background props secondary.";
  return `${TRIGGER}, ${[appearance, `Visual moment: ${story}.`, location ? `Location: ${location}.` : "", action ? `Action: ${action}.` : "", pose ? `Pose: ${pose}.` : "", screen, cleanSurfaces, "Single coherent real-world scene, Isla is the clear main subject."].filter(Boolean).join(" ")}`;
}
function safeNegativePrompt(p, pack) {
  const raw = tidy(p.negative_prompt || pack.locked_negative_prompt || "");
  const cleaned = stripRiskyVisualObjects(raw)
    .replace(/\bspeech\b/gi, "")
    .replace(/\bbubble\b/gi, "")
    .replace(/\bsticky\b/gi, "")
    .replace(/\bpost\b/gi, "")
    .replace(/\bnote\b/gi, "")
    .replace(/,{2,}/g, ",");
  return tidy([cleaned, "text elements, lettering, labels, typography, captions, puzzle grid, numbers, watermark, large logo, low quality, blurry"].filter(Boolean).join(", "));
}
function assertSafeFinalPrompts(pack) {
  const hits = [];
  for (const [index, panel] of (pack.panels || []).entries()) {
    for (const field of ["prompt", "negative_prompt"]) {
      const text = String(panel[field] || "");
      for (const pattern of RISKY_OBJECT_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) hits.push(`panel ${index + 1} ${field}`);
      }
    }
  }
  if (hits.length) {
    throw new Error(`Final Fal prompt contamination guard failed: ${Array.from(new Set(hits)).join(", ")}`);
  }
}

const dated = path.join(ROOT, "art-prompts", DATE, "prompts.json");
const latest = path.join(ROOT, "art-prompts", "latest", "prompts.json");
const pack = await readJson(dated, await readJson(latest, null));
if (!pack) throw new Error(`Missing art prompt payload for ${DATE}`);
const panels = Array.isArray(pack.panels) ? pack.panels : [];
pack.final_fal_prompt_composer = "clean_story_fields_only_v2_no_object_name_contamination";
pack.panels = PANEL_FILES.map((name, i) => {
  const p = panels[i] || {};
  const promptFile = p.prompt_file || `art-prompts/${DATE}/${String(i + 1).padStart(2, "0")}_panel-${String(i + 1).padStart(2, "0")}_prompt.txt`;
  return { ...p, panel_number: i + 1, image_name: p.image_name || name, prompt_file: promptFile, prompt: promptFor(p, pack), negative_prompt: safeNegativePrompt(p, pack), final_prompt_composer: "clean_story_fields_only_v2_no_object_name_contamination" };
});
assertSafeFinalPrompts(pack);
await writeJson(dated, pack);
await writeJson(latest, pack);
for (const p of pack.panels) await writeText(path.join(ROOT, p.prompt_file), `${p.prompt}\n`);
console.log(`Clean final fal prompts rebuilt for ${DATE} without risky object-name contamination`);
