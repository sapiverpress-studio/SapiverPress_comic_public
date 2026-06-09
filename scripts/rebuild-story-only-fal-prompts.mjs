import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const TRIGGER = process.env.HF_LORA_TRIGGER?.trim() || "Isla_v2";
const PANEL_FILES = ["01_panel-01.png", "02_panel-02.png", "03_panel-03.png", "04_panel-04.png", "05_panel-05.png", "06_panel-06.png"];

async function readJson(file, fallback = null) { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; } }
async function writeJson(file, data) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
async function writeText(file, data) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, data, "utf8"); }
function tidy(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
function first(...xs) { for (const x of xs) { const y = tidy(x); if (y) return y; } return ""; }

function promptFor(p, pack) {
  const appearance = first(p.appearance_lock, pack.appearance_lock) || "young Black woman, warm medium brown skin, natural coily dark hair in a high puff bun, floral headband, gold hoop earrings, oversized deep teal hoodie with plain unmarked fabric, warm painterly editorial style";
  const story = first(p.story_beat, p.storyboard_caption, p.caption) || "Isla pauses with calm focus";
  const location = first(p.panel_location, p.location_text, p.environment_text) || "warm paper-based home publishing desk";
  const action = first(p.panel_action) || "Isla works with paper planning materials";
  const pose = first(p.panel_pose_family, p.pose_text, p.pose_marker) || "natural creator pose";
  const singlePerson = "One visible human figure only: Isla. Single-person composition with one face, one head, one body, and one coherent pair of hands belonging to Isla.";
  const sceneStyle = "Device-free paper-based creator workspace, blank notebooks, pencils, tidy folders, paper stacks, warm plain background, calm uncluttered composition, no central screen surface.";
  return `${TRIGGER}, ${[appearance, singlePerson, `Visual moment: ${story}.`, `Location: ${location}.`, `Action: ${action}.`, `Pose: ${pose}.`, sceneStyle, "Single coherent real-world scene, Isla is the clear main subject, warm editorial illustration."].join(" ")}`;
}

function negativePrompt(p, pack) {
  const raw = tidy(p.negative_prompt || pack.locked_negative_prompt || "");
  return [raw, "second person, duplicate person, duplicate woman, duplicate Isla, twin, clone, mirror reflection, reflection person, over-the-shoulder second figure, second head, second face, second body, extra hands, extra arms, crowd, another woman, laptop, computer screen, tablet, phone, monitor, device screen, product screen, website screenshot, puzzle capture, sudoku grid, puzzle grid, numbers, text elements, lettering, labels, typography, captions, watermark, logo, fake product page, fake web page, fake book cover, fake puzzle page, wall sign, framed sign, framed text, wall notice, calendar, whiteboard, chart, poster words, gibberish letters, random symbols, book spine text, notebook writing, mug logo, hoodie logo, low quality, blurry"].filter(Boolean).join(", ");
}

const dated = path.join(ROOT, "art-prompts", DATE, "prompts.json");
const latest = path.join(ROOT, "art-prompts", "latest", "prompts.json");
const pack = await readJson(dated, await readJson(latest, null));
if (!pack) throw new Error(`Missing art prompt payload for ${DATE}`);
const panels = Array.isArray(pack.panels) ? pack.panels : [];
pack.final_fal_prompt_composer = "story_only_isla_paper_workspace_v1";
pack.overlay_surface_contract = {
  screen_surface_priority: "not_required",
  puzzle_panels_require_contextual_open_laptop: false,
  screen_prompt_rule: "Story-only adverts do not require laptop, screen, puzzle capture, or product overlay surfaces. Prompts use paper folders, notebooks and creator-workflow props instead.",
};
pack.panels = PANEL_FILES.map((name, i) => {
  const p = panels[i] || {};
  const promptFile = p.prompt_file || `art-prompts/${DATE}/${String(i + 1).padStart(2, "0")}_panel-${String(i + 1).padStart(2, "0")}_prompt.txt`;
  return {
    ...p,
    panel_number: i + 1,
    image_name: p.image_name || name,
    prompt_file: promptFile,
    overlay_surface_required: false,
    overlay_surface: "none_story_only",
    screen_surface_priority: "not_required",
    panel_screen_state: "story_only_no_screen",
    prompt: promptFor(p, pack),
    negative_prompt: negativePrompt(p, pack),
    final_prompt_composer: "story_only_isla_paper_workspace_v1"
  };
});
await writeJson(dated, pack);
await writeJson(latest, pack);
for (const p of pack.panels) await writeText(path.join(ROOT, p.prompt_file), `${p.prompt}\n`);
console.log(`Story-only Fal prompts rebuilt for ${DATE}; screen and puzzle capture requirements removed`);
