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
function clean(v) {
  let s = tidy(v).replaceAll("Isla_v2", "").replaceAll("ISLA_SP", "");
  const bad = ["CALENDAR", "LOCK", "BANS", "METADATA", "NO GENERATED", "do not render", "no readable", "books, pages, signs", "clean text is compositor"];
  for (const b of bad) if (s.toLowerCase().startsWith(b.toLowerCase())) return "";
  return tidy(s);
}
function first(...xs) { for (const x of xs) { const y = clean(x); if (y) return y; } return ""; }
function promptFor(p, pack) {
  const appearance = first(p.appearance_lock, pack.appearance_lock) || "young Black woman, warm medium brown skin, natural coily dark hair in a high puff bun, floral headband, gold hoop earrings, oversized deep teal hoodie, warm painterly editorial style";
  const story = first(p.story_beat, p.storyboard_caption, p.caption) || "Isla pauses with quiet focus";
  const location = first(p.panel_location, p.location_text, p.environment_text);
  const action = first(p.panel_action);
  const pose = first(p.panel_pose_family, p.pose_text, p.pose_marker);
  const screen = tidy(p.panel_screen_state).toLowerCase().includes("no_puzzle") || tidy(p.panel_screen_state).toLowerCase().includes("closed")
    ? "The panel is story-only with no puzzle screen visible."
    : "An open laptop has a large blank dark screen facing the viewer for later puzzle overlay.";
  return `${TRIGGER}, ${[appearance, `Story beat: ${story}.`, location ? `Location: ${location}.` : "", action ? `Action: ${action}.` : "", pose ? `Pose: ${pose}.` : "", screen, "Single coherent real-world illustration, Isla is the clear main subject."].filter(Boolean).join(" ")}`;
}

const dated = path.join(ROOT, "art-prompts", DATE, "prompts.json");
const latest = path.join(ROOT, "art-prompts", "latest", "prompts.json");
const pack = await readJson(dated, await readJson(latest, null));
if (!pack) throw new Error(`Missing art prompt payload for ${DATE}`);
const panels = Array.isArray(pack.panels) ? pack.panels : [];
pack.final_fal_prompt_composer = "clean_story_fields_only_v1";
pack.panels = PANEL_FILES.map((name, i) => {
  const p = panels[i] || {};
  const promptFile = p.prompt_file || `art-prompts/${DATE}/${String(i + 1).padStart(2, "0")}_panel-${String(i + 1).padStart(2, "0")}_prompt.txt`;
  return { ...p, panel_number: i + 1, image_name: p.image_name || name, prompt_file: promptFile, prompt: promptFor(p, pack), final_prompt_composer: "clean_story_fields_only_v1" };
});
await writeJson(dated, pack);
await writeJson(latest, pack);
for (const p of pack.panels) await writeText(path.join(ROOT, p.prompt_file), `${p.prompt}\n`);
console.log(`Clean final fal prompts rebuilt for ${DATE}`);
