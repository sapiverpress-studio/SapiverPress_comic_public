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
function screenSurfaceRequired(panel) {
  const state = tidy(panel.panel_screen_state || panel.screen_state || "").toLowerCase();
  if (!state) return true;
  if (state.includes("no_puzzle") || state.includes("closed") || state.includes("absent")) return false;
  return true;
}
function screenSurfaceInstruction(panel) {
  const state = tidy(panel.panel_screen_state || panel.screen_state || "active_puzzle");
  if (!screenSurfaceRequired(panel)) {
    return "Story-only panel: if a laptop appears, it is closed, turned away, or naturally packed away; no display surface is needed.";
  }
  return [
    "LOCKED COMPOSITION REQUIREMENT: Isla and her real laptop are equal priority subjects in the same believable scene.",
    "The laptop is a physical object connected to its keyboard by a visible hinge, resting naturally on the desk, table, counter, or Isla's lap according to the setting.",
    "The laptop is not floating, not detached from the desk, not a standalone rectangle, not a poster, not a wall screen, and not a graphic frame.",
    "Show the full open laptop body: keyboard base visible, hinge visible, display attached to the base, perspective consistent with the tabletop or lap.",
    "The display faces the viewer at a clear three-quarter front angle.",
    "The display contains a large blank pale screen, soft off-white or light grey, matte, not glowing, not reflective.",
    "The screen must have a clearly visible dark bezel around it so the full screen boundary is obvious.",
    "The blank screen must be unobstructed, fully inside the frame, and large enough for a later digital puzzle overlay.",
    "Hands, cups, books, hair, sleeves, and foreground props must not cross or cover the display.",
    "The screen should take roughly one quarter to one third of the image width while Isla remains clearly visible and expressive.",
    `Panel screen state: ${state}; preserve a contextual real laptop screen surface for the compositor.`
  ].join(" ");
}
function promptFor(p, pack) {
  const appearance = first(p.appearance_lock, pack.appearance_lock) || "young Black woman, warm medium brown skin, natural coily dark hair in a high puff bun, floral headband, gold hoop earrings, oversized deep teal hoodie with absolutely no logo or writing, warm painterly editorial style";
  const story = first(p.story_beat, p.storyboard_caption, p.caption) || "Isla pauses with calm focus";
  const location = first(p.panel_location, p.location_text, p.environment_text);
  const action = first(p.panel_action);
  const pose = first(p.panel_pose_family, p.pose_text, p.pose_marker);
  const screen = screenSurfaceInstruction(p);
  const cleanSurfaces = [
    "Clean editorial illustration with plain unmarked walls and tidy surfaces.",
    "No readable background signs, no wall poster words, no framed text, no fake labels, no invented writing anywhere.",
    "If framed wall art, posters, books, notebooks, mugs, clothing, stickers, or product props appear, they are blank colour-block shapes only with no letters, numbers, logos, marks, slogans, or symbols.",
    "Background props are secondary and visually quiet; all readable text is reserved for later compositor overlay only."
  ].join(" ");
  return `${TRIGGER}, ${[appearance, screen, `Visual moment: ${story}.`, location ? `Location: ${location}.` : "", action ? `Action: ${action}.` : "", pose ? `Pose: ${pose}.` : "", cleanSurfaces, "Single coherent real-world scene, Isla is the clear main subject and the contextual laptop screen is the clear overlay surface."].filter(Boolean).join(" ")}`;
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
  return tidy([cleaned, "text elements, lettering, labels, typography, captions, puzzle grid, numbers, watermark, large logo, low quality, blurry, floating screen, detached screen, standalone rectangle, wall screen, poster frame, cropped laptop, hidden display, tiny laptop, cluttered display, reflective screen, glowing white rectangle, hands covering screen, wall poster writing, framed sign text, wall sign, framed text, clothing text, hoodie logo, shirt logo, book spine text, notebook writing, mug logo, sticker text, fake calendar text, pseudo letters, gibberish letters, random symbols"].filter(Boolean).join(", "));
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
pack.final_fal_prompt_composer = "clean_story_fields_with_pale_laptop_overlay_surface_no_generated_text_v6";
pack.overlay_surface_contract = {
  screen_surface_priority: "equal_to_isla_identity",
  puzzle_panels_require_contextual_open_laptop: true,
  screen_prompt_rule: "Use panel_screen_state to require a real open laptop in scene context unless the scene is explicitly no_puzzle or closed_device. Overlay surfaces should be pale/off-white or light grey with a dark bezel for reliable detector contrast. All poster/merch/logo/copy text is compositor overlay only; generated art must keep surfaces blank and unmarked.",
};
pack.panels = PANEL_FILES.map((name, i) => {
  const p = panels[i] || {};
  const promptFile = p.prompt_file || `art-prompts/${DATE}/${String(i + 1).padStart(2, "0")}_panel-${String(i + 1).padStart(2, "0")}_prompt.txt`;
  const overlaySurfaceRequired = screenSurfaceRequired(p);
  return {
    ...p,
    panel_number: i + 1,
    image_name: p.image_name || name,
    prompt_file: promptFile,
    overlay_surface_required: overlaySurfaceRequired,
    overlay_surface: overlaySurfaceRequired ? "contextual_open_laptop_blank_pale_screen" : "none_story_only",
    screen_surface_priority: overlaySurfaceRequired ? "equal_to_isla_identity" : "not_required",
    prompt: promptFor(p, pack),
    negative_prompt: safeNegativePrompt(p, pack),
    final_prompt_composer: "clean_story_fields_with_pale_laptop_overlay_surface_no_generated_text_v6"
  };
});
assertSafeFinalPrompts(pack);
await writeJson(dated, pack);
await writeJson(latest, pack);
for (const p of pack.panels) await writeText(path.join(ROOT, p.prompt_file), `${p.prompt}\n`);
console.log(`Clean final fal prompts rebuilt for ${DATE}; generated poster/merch/wall/clothing text is banned and pale laptop overlay screen is locked where required`);
