import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const CHARACTER = (process.env.COMIC_CHARACTER || "isla").trim().toLowerCase() || "isla";
const SUITE_URL = process.env.SUITE_URL || "https://suite.sapiverpress.co.uk";
const INTENDED_TRIGGER = "Isla_v2";
const INTENDED_LORA_FILE = "Isla_v2_1780410778059.safetensors";
const INTENDED_HF_LORA_REPO = "sapiverpress/Isla_v2";
const INTENDED_FAL_MODEL = "fal-ai/z-image/turbo/lora";
const LEGACY_TRIGGERS = new Set(["ISLA_SP"]);
const LEGACY_LORA_FILES = new Set(["ISLA_SP_1779957190206.safetensors"]);
const LEGACY_HF_LORA_REPOS = new Set(["sapiverpress/sapiverpress-isla-lora"]);
const ENV_LORA_TRIGGER = process.env.HF_LORA_TRIGGER?.trim() || "";
const ENV_LORA_FILE = process.env.HF_LORA_FILE?.trim() || "";
const ENV_LORA_REPO = process.env.HF_LORA_REPO?.trim() || "";
const LORA_TRIGGER = ENV_LORA_TRIGGER && !LEGACY_TRIGGERS.has(ENV_LORA_TRIGGER) ? ENV_LORA_TRIGGER : INTENDED_TRIGGER;
const LORA_REPO = ENV_LORA_REPO && !LEGACY_HF_LORA_REPOS.has(ENV_LORA_REPO) ? ENV_LORA_REPO : INTENDED_HF_LORA_REPO;
const LORA_FILE = ENV_LORA_FILE && !LEGACY_LORA_FILES.has(ENV_LORA_FILE) ? ENV_LORA_FILE : INTENDED_LORA_FILE;
const FAL_MODEL = process.env.FAL_MODEL?.trim() || INTENDED_FAL_MODEL;

const PANEL_FILES = ["01_panel-01.png", "02_panel-02.png", "03_panel-03.png", "04_panel-04.png", "05_panel-05.png", "06_panel-06.png"];
const TEMPLATE_REFS = ["isla_01_opening_return.png", "isla_02_first_move.png", "isla_03_stuck_moment.png", "isla_04_breakthrough.png", "isla_05_finish.png", "isla_06_tomorrow_set.png"];

const LOCATION_MARKERS = {
  home: "VISUALLY OBVIOUS HOME KITCHEN: kitchen table, kettle, domestic morning light, fridge or cupboards, houseplants, home details visible, one drink cup maximum",
  train: "VISUALLY OBVIOUS TRAIN CARRIAGE: train window with passing landscape, seat backs, luggage rack, small train table, carriage wall panels, slight motion blur outside window",
  platform: "VISUALLY OBVIOUS RAILWAY PLATFORM: platform edge markings, station canopy, bench or sign shapes without readable text, bag over shoulder, cool morning air",
  cafe: "VISUALLY OBVIOUS CAFE: small table, street or cafe background, warm daylight, simple cup or plate as minor prop, no poster wall",
  coworking: "VISUALLY OBVIOUS CO-WORKING SPACE: shared workspace, glass partitions, other desks blurred in background, office chair, meeting room window, no readable notice-board text",
  bookshop: "VISUALLY OBVIOUS BOOKSHOP CAFE: shelves as soft background shapes, warm shop lighting, small book stack as minor prop, no readable book-spine titles, no page collage",
  rainy_window: "VISUALLY OBVIOUS RAINY WINDOW NOOK: rain streaks on glass, plants on sill, wet street or city outside, reflective rainy light, window nook seating",
  library: "VISUALLY OBVIOUS PUBLIC LIBRARY: long reading table, library shelving as soft background, reading lamps, quiet study atmosphere, no readable shelf signs",
};

const POSE_MARKERS = [
  "opening moment, front three-quarter view, one hand on bag, notebook, or laptop lid, alert but calm",
  "moving-day or travel posture, shoulders angled, one hand steadying belongings, different framing from panel one",
  "pause moment, leaning back or standing still, hands away from face, thoughtful expression, story consequence visible in posture",
  "active check moment, leaning forward, finger near trackpad if laptop is present, clear concentration, screen unobstructed when required",
  "side-angle reflection, holding mug or notebook naturally, relaxed shoulders, no head-on repeated laptop pose",
  "closing or moving-on gesture, packing bag or closing laptop, looking away from screen toward environment, clear ending gesture",
];

function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function stripLegacyTriggers(value) {
  return clean(value)
    .replace(/\bISLA_SP\b,?\s*/g, "")
    .replace(new RegExp(`\\b${LORA_TRIGGER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b,?\\s*`, "g"), "")
    .replace(/^\s*,\s*/, "")
    .trim();
}
function prependTrigger(value) {
  const text = stripLegacyTriggers(value);
  return text ? `${LORA_TRIGGER}, ${text}` : LORA_TRIGGER;
}
function decodeText(value) { return Buffer.from(String(value || ""), "base64").toString("utf8"); }
function decodeMap(input = {}) { return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, stripLegacyTriggers(decodeText(value))])); }
function londonDateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override && !/^\d{4}-\d{2}-\d{2}$/.test(override)) throw new Error(`DATE_OVERRIDE must be YYYY-MM-DD. Received: ${override}`);
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
async function readJson(filePath, fallback = null) { try { return JSON.parse(await fs.readFile(filePath, "utf8")); } catch { return fallback; } }
async function loadLocks() {
  const cfg = await readJson(path.join(ROOT, "config", "phase4_locks.json"), null);
  if (!cfg?.appearance_lock || !cfg?.negative_prompt) throw new Error("Missing config/phase4_locks.json block prompt locks");
  const defaultPanelPoses = Array.isArray(cfg.default_panel_poses) ? cfg.default_panel_poses.map(clean).filter(Boolean) : [];
  const defaultComposition = clean(cfg.default_composition || "desk_right_screen");
  const defaultLocation = clean(cfg.default_location || "library_study");
  return {
    appearanceLock: stripLegacyTriggers(decodeText(cfg.appearance_lock)),
    defaultComposition,
    defaultLocation,
    defaultPanelPoses,
    compositionTemplates: decodeMap(cfg.composition_templates),
    locationBlocks: decodeMap(cfg.location_blocks),
    poseBlocks: decodeMap(cfg.pose_blocks),
    negativePrompt: stripLegacyTriggers(decodeText(cfg.negative_prompt)),
    staticPromptOnly: defaultComposition === "static_base" && defaultLocation === "static_base",
  };
}
async function writeText(filePath, text) { await fs.mkdir(path.dirname(filePath), { recursive: true }); await fs.writeFile(filePath, text, "utf8"); }
async function writeJson(filePath, data) { await writeText(filePath, `${JSON.stringify(data, null, 2)}\n`); }

function sanitizeStoryText(value) {
  return stripLegacyTriggers(value)
    .replace(/supporting[_ -]?life[_ -]?trigger\s*[:=][^.;,]+[.;,]?/gi, "")
    .replace(/workday anchor\s*[:=][^.;]+[.;]?/gi, "")
    .replace(/calendar(?:_context)?\s*[:=][^.;]+[.;]?/gi, "")
    .replace(/story_effect\s*[:=][^.;]+[.;]?/gi, "")
    .replace(/panel_screen_state\s*[:=][^.;,]+[.;,]?/gi, "")
    .replace(/location_flow_id\s*[:=][^.;,]+[.;,]?/gi, "")
    .replace(/\b(?:LOCK|TRUTH|BANS|PROMPT|METADATA)\b:?/gi, "")
    .replace(/\bIsla_v2\b|\bISLA_SP\b|\bLoRA\b|\btrigger word\b|\bmodel\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^\s*[,.;:-]+\s*/, "")
    .trim();
}
function panelStoryBeat(scene) {
  return sanitizeStoryText(
    scene.storyboard_caption ||
    scene.panel_action ||
    scene.image_prompt_fragment ||
    scene.scene_description ||
    scene.beat ||
    scene.caption ||
    scene.title ||
    ""
  );
}
function resolveComposition(scene, locks) { const key = clean(scene.composition || scene.composition_key || locks.defaultComposition); return { key, text: locks.compositionTemplates[key] || locks.compositionTemplates[locks.defaultComposition] || "" }; }
function resolveLocation(scene, locks) { const key = clean(scene.location || scene.location_key || locks.defaultLocation); return { key, text: locks.locationBlocks[key] || locks.locationBlocks[locks.defaultLocation] || "" }; }
function resolvePose(scene, index, locks) { const fallbackKey = locks.defaultPanelPoses[index] || locks.defaultPanelPoses[0] || ""; const key = clean(scene.pose || scene.pose_key || fallbackKey); return { key, text: locks.poseBlocks[key] || locks.poseBlocks[fallbackKey] || "" }; }
function environmentBlock(scene) {
  const key = clean(scene.location_key || scene.location || "").toLowerCase();
  const setting = clean(scene.panel_location || scene.setting || "").toLowerCase();
  const resolved = key || (setting.includes("platform") ? "platform" : setting.includes("train") ? "train" : setting.includes("cafe") ? "cafe" : setting.includes("co-working") || setting.includes("cowork") ? "coworking" : setting.includes("bookshop") ? "bookshop" : setting.includes("rain") ? "rainy_window" : setting.includes("library") ? "library" : setting.includes("home") || setting.includes("kitchen") ? "home" : "");
  return LOCATION_MARKERS[resolved] || LOCATION_MARKERS.home;
}
function screenBlock(scene, index) {
  const state = clean(scene.panel_screen_state || scene.screen_state || "active_puzzle").toLowerCase();
  if (["no_puzzle", "no-puzzle", "none", "art_only", "art-only", "no_screen", "no-screen", "closed_device"].includes(state)) {
    return "SCREEN STATE: no puzzle screen needed in this panel; no grid, no puzzle numbers, no solving action, story-only visual beat";
  }
  return index === 3
    ? "MANDATORY SCREEN FOR PUZZLE PANEL: large open laptop screen visible, dark blank rectangular screen, unobstructed, facing viewer enough for puzzle insertion, no hands covering screen, do not draw puzzle content"
    : "MANDATORY SCREEN WHEN LAPTOP IS PRESENT: open laptop screen visible, dark blank rectangular screen area, unobstructed, clear four-corner rectangle for compositor insertion, do not draw puzzle content";
}
function antiRepeatBlock() { return "VISUAL VARIETY RULE: do not reuse the same indoor desk composition, location must be visually obvious without captions, Isla body pose must visibly change panel to panel"; }
function storyVisualBlock(scene) {
  const beat = panelStoryBeat(scene);
  if (!beat) return "STORY-FIRST IMAGE RULE: create a visual story moment from Isla's daily narration; show cause and consequence through body language, setting, timing, and objects in use, not through written labels";
  return `STORY-FIRST IMAGE RULE: visualise this narration beat through Isla's body language, setting, timing, and objects in use; do not render it as written text: ${beat}`;
}
function artGuardBlock() {
  return [
    "Isla must be the main visible human subject",
    "same canonical Isla identity in every panel",
    "single coherent real-world scene, not a collage, not a notebook wallpaper, not a grid of diary pages",
    "no readable poster quotes, no readable book spine titles, no signage text, no diary paragraphs, no fake paragraphs, no gibberish writing",
    "do not render internal metadata, supporting life trigger text, calendar anchor text, workday anchor text, pipeline labels, prompt words, or model words",
    "do not render the words Isla_v2, ISLA_SP, LoRA, trigger, model, prompt, or Sapiver Press as visible scene text",
    "background props must stay secondary",
  ].join(", ");
}
function promptParts({ scene, index, locks }) {
  const composition = resolveComposition(scene, locks);
  const location = resolveLocation(scene, locks);
  const pose = resolvePose(scene, index, locks);
  const storyBeat = locks.staticPromptOnly ? "" : panelStoryBeat(scene);
  const env = locks.staticPromptOnly ? "" : environmentBlock(scene);
  const poseMarker = locks.staticPromptOnly ? "" : POSE_MARKERS[index] || POSE_MARKERS[0];
  const screen = locks.staticPromptOnly ? "" : screenBlock(scene, index);
  const repeat = locks.staticPromptOnly ? "" : antiRepeatBlock();
  const storyVisual = locks.staticPromptOnly ? "" : storyVisualBlock(scene);
  const guard = locks.staticPromptOnly ? "" : artGuardBlock();
  const rawPrompt = [locks.appearanceLock, locks.staticPromptOnly ? "" : composition.text, locks.staticPromptOnly ? "" : location.text, env, locks.staticPromptOnly ? "" : pose.text, poseMarker, screen, repeat, storyVisual, guard].filter(Boolean).join(", ");
  const prompt = prependTrigger(rawPrompt);
  return { composition, location, pose, storyBeat, env, poseMarker, screen, storyVisual, prompt };
}
function replacementReadme(date, locks) {
  const modeLine = locks.staticPromptOnly ? "- STATIC EXPERIMENT MODE: every panel uses the same locked Isla prompt only." : "- Use the locked Isla appearance plus the story/narration beat, location, pose/body-language marker, and screen rule.";
  return `# Sapiver Press Comic Art Replacement Slots — ${date}\n\nDrop finished generated panel artwork into this folder using these exact names:\n\n${PANEL_FILES.map((name) => `- ${name}`).join("\n")}\n\nRules:\n\n${modeLine}\n- Prompt builder prepends the active LoRA trigger: ${LORA_TRIGGER}. The trigger must not appear as visible text.\n- Do not include puzzle content, captions, speech bubbles, page headers, footers, poster quotes, book-spine titles, diary paragraphs, or readable metadata.\n- The compositor will insert the real daily puzzle screenshots and captions.\n- Every puzzle panel must contain a clear blank screen area for puzzle insertion.\n- If a file is missing, the compositor falls back to the locked template artwork.\n\nPlay URL: ${SUITE_URL}\n`;
}
async function mirrorFolder(sourceDir, latestDir) { await fs.rm(latestDir, { recursive: true, force: true }); await fs.mkdir(latestDir, { recursive: true }); const entries = await fs.readdir(sourceDir, { withFileTypes: true }); for (const entry of entries) if (entry.isFile()) await fs.copyFile(path.join(sourceDir, entry.name), path.join(latestDir, entry.name)); }

async function main() {
  const locks = await loadLocks();
  const date = londonDateString();
  const story = await readJson(path.join(ROOT, "daily", `${date}.json`), await readJson(path.join(ROOT, "latest.json"), null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json. Cannot generate art prompt pack.`);
  const scenes = [...(story.scenes || [])].slice(0, 6);
  while (scenes.length < 6) scenes.push({ title: `Panel ${scenes.length + 1}`, caption: "", scene_description: "" });
  const promptDir = path.join(ROOT, "art-prompts", date);
  const latestPromptDir = path.join(ROOT, "art-prompts", "latest");
  const replacementDir = path.join(ROOT, "art-replacements", date);
  const latestReplacementDir = path.join(ROOT, "art-replacements", "latest");
  const panels = [];
  const prompts = [];
  const negativeTextGuard = "readable poster quotes, readable book spine titles, signage text, diary paragraphs, fake paragraphs, gibberish writing, notebook wallpaper, page collage background, visible model or trigger text, visible Isla_v2 text, visible ISLA_SP text, visible LoRA text, visible prompt text, supporting life trigger text, workday anchor text, calendar metadata labels";
  for (let index = 0; index < 6; index += 1) {
    const scene = scenes[index];
    const promptFile = `${String(index + 1).padStart(2, "0")}_panel-${String(index + 1).padStart(2, "0")}_prompt.txt`;
    const built = promptParts({ scene, index, locks });
    await writeText(path.join(promptDir, promptFile), `${built.prompt}\n`);
    const panel = { panel_number: index + 1, prompt_file: `art-prompts/${date}/${promptFile}`, replacement_file: `art-replacements/${date}/${PANEL_FILES[index]}`, output_file: `social/${date}/${PANEL_FILES[index]}`, image_name: PANEL_FILES[index], fallback_template: `templates/characters/${CHARACTER}/${scene.image_ref || TEMPLATE_REFS[index]}`, caption: scene.caption || "", scene_id: scene.id || `scene_${String(index + 1).padStart(2, "0")}` };
    panels.push(panel);
    prompts.push({ panel_number: panel.panel_number, scene_id: panel.scene_id, image_name: panel.image_name, replacement_file: panel.replacement_file, prompt_file: panel.prompt_file, prompt: built.prompt, negative_prompt: `${locks.negativePrompt}, repeated identical pose, same indoor desk in every panel, hidden laptop screen, covered laptop screen, unreadable screen area, ${negativeTextGuard}`, caption: panel.caption, appearance_lock: prependTrigger(locks.appearanceLock), composition_key: built.composition.key, composition_text: built.composition.text, location_key: built.location.key, location_text: built.location.text, environment_text: built.env, pose_key: built.pose.key, pose_text: built.pose.text, pose_marker: built.poseMarker, screen_requirement: built.screen, story_beat: built.storyBeat, story_visual_direction: built.storyVisual, prop_text: "disabled_before_fal_generation", static_prompt_only: locks.staticPromptOnly });
  }
  const generatedAt = new Date().toISOString();
  const format = locks.staticPromptOnly ? "daily_art_prompt_pack_v4_static_isla_experiment" : "daily_art_prompt_pack_v6_story_first_no_readable_props";
  const purpose = locks.staticPromptOnly ? "Generate six replaceable Isla panel artworks using one static locked prompt only." : "Generate six replaceable Isla panel artworks from the narration/story beat, with no readable prop text or metadata rendered in the image.";
  const loraProvenance = { trigger_word: LORA_TRIGGER, repo: LORA_REPO, file: LORA_FILE, fal_model: FAL_MODEL, base_model: "z_image_turbo", normalised_legacy_trigger: ENV_LORA_TRIGGER && LEGACY_TRIGGERS.has(ENV_LORA_TRIGGER) ? ENV_LORA_TRIGGER : "", normalised_legacy_lora_file: ENV_LORA_FILE && LEGACY_LORA_FILES.has(ENV_LORA_FILE) ? ENV_LORA_FILE : "", normalised_legacy_lora_repo: ENV_LORA_REPO && LEGACY_HF_LORA_REPOS.has(ENV_LORA_REPO) ? ENV_LORA_REPO : "" };
  const manifest = { date, character: CHARACTER, format, purpose, replacement_dir: `art-replacements/${date}`, prompt_dir: `art-prompts/${date}`, prompts_json: `art-prompts/${date}/prompts.json`, compositor_rule: "If a matching replacement PNG exists, use it. Otherwise use the locked template artwork.", lora: loraProvenance, appearance_lock: prependTrigger(locks.appearanceLock), default_composition: locks.defaultComposition, default_location: locks.defaultLocation, default_panel_poses: locks.defaultPanelPoses, static_prompt_only: locks.staticPromptOnly, locked_negative_prompt: locks.negativePrompt, readable_prop_text_enabled: false, hard_location_markers_enabled: !locks.staticPromptOnly, mandatory_screen_enabled: !locks.staticPromptOnly, story_first_prompting: true, panel_files: PANEL_FILES, panels, story_source: story.date === date ? `daily/${date}.json` : "latest.json", generated_at: generatedAt };
  const promptsPayload = { date, character: CHARACTER, format, purpose, lora: loraProvenance, appearance_lock: prependTrigger(locks.appearanceLock), default_composition: locks.defaultComposition, default_location: locks.defaultLocation, default_panel_poses: locks.defaultPanelPoses, static_prompt_only: locks.staticPromptOnly, locked_negative_prompt: locks.negativePrompt, readable_prop_text_enabled: false, hard_location_markers_enabled: !locks.staticPromptOnly, mandatory_screen_enabled: !locks.staticPromptOnly, story_first_prompting: true, replacement_dir: `art-replacements/${date}`, latest_replacement_dir: "art-replacements/latest", prompt_dir: `art-prompts/${date}`, panels: prompts, generated_at: generatedAt };
  await writeJson(path.join(promptDir, "manifest.json"), manifest); await writeJson(path.join(promptDir, "prompts.json"), promptsPayload); await writeText(path.join(promptDir, "README.md"), replacementReadme(date, locks)); await writeText(path.join(replacementDir, "README.md"), replacementReadme(date, locks)); await mirrorFolder(promptDir, latestPromptDir); await fs.rm(latestReplacementDir, { recursive: true, force: true }); await fs.mkdir(latestReplacementDir, { recursive: true }); await fs.copyFile(path.join(replacementDir, "README.md"), path.join(latestReplacementDir, "README.md"));
  console.log(`Daily Isla art prompt pack written: art-prompts/${date}`); console.log(`Machine-readable prompts written: art-prompts/${date}/prompts.json`); console.log(`LoRA trigger: ${LORA_TRIGGER}`); console.log(`LoRA file: ${LORA_FILE}`); console.log(`fal model: ${FAL_MODEL}`); console.log(`Story-first prompting: ${locks.staticPromptOnly ? "disabled" : "enabled"}`); console.log("Readable prop text before fal generation: disabled");
}
main().catch((error) => { console.error(error); process.exit(1); });
