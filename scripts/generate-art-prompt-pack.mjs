import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const CHARACTER = (process.env.COMIC_CHARACTER || "isla").trim().toLowerCase() || "isla";
const SUITE_URL = process.env.SUITE_URL || "https://suite.sapiverpress.co.uk";
const LORA_TRIGGER = process.env.HF_LORA_TRIGGER || "ISLA_SP";
const LORA_REPO = "sapiverpress/sapiverpress-isla-lora";
const LORA_FILE = "ISLA_SP_1779957190206.safetensors";

const PANEL_FILES = [
  "01_panel-01.png",
  "02_panel-02.png",
  "03_panel-03.png",
  "04_panel-04.png",
  "05_panel-05.png",
  "06_panel-06.png",
];

const TEMPLATE_REFS = [
  "isla_01_opening_return.png",
  "isla_02_first_move.png",
  "isla_03_stuck_moment.png",
  "isla_04_breakthrough.png",
  "isla_05_finish.png",
  "isla_06_tomorrow_set.png",
];

const DEFAULT_PANEL_VARIATIONS = [
  "calm focused expression, looking down toward the open journal, one hand near a pencil, quiet start of the puzzle story",
  "small curious smile, eyes glancing toward the laptop glow, hand resting beside the mug, noticing the first useful clue",
  "thoughtful pause, eyebrows slightly raised, gaze angled to the side, fingertips touching the journal edge, stuck moment before guessing",
  "gentle breakthrough expression, leaning forward slightly, eyes bright, one hand lifted as if an idea has landed",
  "concentrated satisfaction, looking between journal notes and laptop glow, relaxed shoulders, puzzle nearly solved",
  "warm satisfied smile, looking back toward the desk, hands settling the journal closed, calm finished-story moment",
];

function decodeText(value) {
  return Buffer.from(String(value || ""), "base64").toString("utf8");
}

function decodeMap(input = {}) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, decodeText(value)])
  );
}

function londonDateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override && !/^\d{4}-\d{2}-\d{2}$/.test(override)) {
    throw new Error(`DATE_OVERRIDE must be YYYY-MM-DD. Received: ${override}`);
  }
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(base);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function loadLocks() {
  const cfg = await readJson(path.join(ROOT, "config", "phase4_locks.json"), null);
  if (!cfg?.appearance_lock || !cfg?.negative_prompt) {
    throw new Error("Missing config/phase4_locks.json block prompt locks");
  }

  const defaultPanelPoses = Array.isArray(cfg.default_panel_poses) ? cfg.default_panel_poses.map(clean).filter(Boolean) : [];

  return {
    appearanceLock: decodeText(cfg.appearance_lock),
    defaultComposition: clean(cfg.default_composition || "desk_right_screen"),
    defaultLocation: clean(cfg.default_location || "library_study"),
    defaultPanelPoses,
    compositionTemplates: decodeMap(cfg.composition_templates),
    locationBlocks: decodeMap(cfg.location_blocks),
    poseBlocks: decodeMap(cfg.pose_blocks),
    negativePrompt: decodeText(cfg.negative_prompt),
  };
}

async function writeText(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
}

async function writeJson(filePath, data) {
  await writeText(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function panelStoryBeat(scene, index) {
  return clean(
    scene.image_prompt_fragment ||
    scene.scene_description ||
    scene.beat ||
    scene.title ||
    scene.caption ||
    ""
  );
}

function resolveComposition(scene, locks) {
  const key = clean(scene.composition || locks.defaultComposition);
  return {
    key,
    text: locks.compositionTemplates[key] || locks.compositionTemplates[locks.defaultComposition] || "",
  };
}

function resolveLocation(scene, locks) {
  const key = clean(scene.location || locks.defaultLocation);
  return {
    key,
    text: locks.locationBlocks[key] || locks.locationBlocks[locks.defaultLocation] || "",
  };
}

function resolvePose(scene, index, locks) {
  const fallbackKey = locks.defaultPanelPoses[index] || locks.defaultPanelPoses[0] || "";
  const key = clean(scene.pose || fallbackKey);
  return {
    key,
    text: locks.poseBlocks[key] || locks.poseBlocks[fallbackKey] || "",
  };
}

function buildPrompt({ scene, index, locks }) {
  const composition = resolveComposition(scene, locks);
  const location = resolveLocation(scene, locks);
  const pose = resolvePose(scene, index, locks);
  const beat = panelStoryBeat(scene, index);

  return [
    locks.appearanceLock,
    composition.text,
    location.text,
    pose.text,
    beat,
  ].filter(Boolean).join(", ");
}

function replacementReadme(date) {
  return `# Sapiver Press Comic Art Replacement Slots — ${date}\n\nDrop finished generated panel artwork into this folder using these exact names:\n\n${PANEL_FILES.map((name) => `- ${name}`).join("\n")}\n\nRules:\n\n- Use the locked Isla appearance plus the selected composition, location, pose, and optional story beat for all generated panels.\n- Keep the laptop screen clearly visible in the selected composition area for clean puzzle insertion.\n- Do not include puzzle content, captions, speech bubbles, page headers, footers, or large Sapiver Press titles.\n- The compositor will insert the real daily puzzle screenshots and captions.\n- If a file is missing, the compositor falls back to the locked template artwork.\n- Starter and finished grid images are still generated from the real captured puzzle state.\n\nPlay URL: ${SUITE_URL}\n`;
}

async function mirrorFolder(sourceDir, latestDir) {
  await fs.rm(latestDir, { recursive: true, force: true });
  await fs.mkdir(latestDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    await fs.copyFile(path.join(sourceDir, entry.name), path.join(latestDir, entry.name));
  }
}

async function main() {
  const locks = await loadLocks();
  const date = londonDateString();
  const story = await readJson(path.join(ROOT, "daily", `${date}.json`), await readJson(path.join(ROOT, "latest.json"), null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json. Cannot generate art prompt pack.`);

  const scenes = [...(story.scenes || [])].slice(0, 6);
  while (scenes.length < 6) scenes.push({ title: `Panel ${scenes.length + 1}`, caption: "", scene_description: DEFAULT_PANEL_VARIATIONS[scenes.length] });

  const promptDir = path.join(ROOT, "art-prompts", date);
  const latestPromptDir = path.join(ROOT, "art-prompts", "latest");
  const replacementDir = path.join(ROOT, "art-replacements", date);
  const latestReplacementDir = path.join(ROOT, "art-replacements", "latest");

  const panels = [];
  const prompts = [];
  for (let index = 0; index < 6; index += 1) {
    const scene = scenes[index];
    const promptFile = `${String(index + 1).padStart(2, "0")}_panel-${String(index + 1).padStart(2, "0")}_prompt.txt`;
    const composition = resolveComposition(scene, locks);
    const location = resolveLocation(scene, locks);
    const pose = resolvePose(scene, index, locks);
    const storyBeat = panelStoryBeat(scene, index);
    const promptText = buildPrompt({ scene, index, locks });
    await writeText(path.join(promptDir, promptFile), `${promptText}\n`);

    const panel = {
      panel_number: index + 1,
      prompt_file: `art-prompts/${date}/${promptFile}`,
      replacement_file: `art-replacements/${date}/${PANEL_FILES[index]}`,
      output_file: `social/${date}/${PANEL_FILES[index]}`,
      image_name: PANEL_FILES[index],
      fallback_template: `templates/characters/${CHARACTER}/${scene.image_ref || TEMPLATE_REFS[index]}`,
      caption: scene.caption || "",
      scene_id: scene.id || `scene_${String(index + 1).padStart(2, "0")}`,
    };
    panels.push(panel);
    prompts.push({
      panel_number: panel.panel_number,
      scene_id: panel.scene_id,
      image_name: panel.image_name,
      replacement_file: panel.replacement_file,
      prompt_file: panel.prompt_file,
      prompt: promptText,
      negative_prompt: locks.negativePrompt,
      caption: panel.caption,
      appearance_lock: locks.appearanceLock,
      composition_key: composition.key,
      composition_text: composition.text,
      location_key: location.key,
      location_text: location.text,
      pose_key: pose.key,
      pose_text: pose.text,
      story_beat: storyBeat,
    });
  }

  const generatedAt = new Date().toISOString();
  const manifest = {
    date,
    character: CHARACTER,
    format: "daily_art_prompt_pack_v4_block_locked_isla",
    purpose: "Generate six replaceable Isla panel artworks using appearance lock, composition template, location block, pose block, and optional story beat.",
    replacement_dir: `art-replacements/${date}`,
    prompt_dir: `art-prompts/${date}`,
    prompts_json: `art-prompts/${date}/prompts.json`,
    compositor_rule: "If a matching replacement PNG exists, use it. Otherwise use the locked template artwork.",
    appearance_lock: locks.appearanceLock,
    default_composition: locks.defaultComposition,
    default_location: locks.defaultLocation,
    default_panel_poses: locks.defaultPanelPoses,
    locked_negative_prompt: locks.negativePrompt,
    panel_files: PANEL_FILES,
    panels,
    story_source: story.date === date ? `daily/${date}.json` : "latest.json",
    generated_at: generatedAt,
  };

  const promptsPayload = {
    date,
    character: CHARACTER,
    format: "daily_art_prompt_pack_v4_block_locked_isla",
    purpose: "Generate six replaceable Isla panel artworks using appearance lock, composition template, location block, pose block, and optional story beat.",
    lora: { trigger_word: LORA_TRIGGER, repo: LORA_REPO, file: LORA_FILE, base_model: "z_image_turbo" },
    appearance_lock: locks.appearanceLock,
    default_composition: locks.defaultComposition,
    default_location: locks.defaultLocation,
    default_panel_poses: locks.defaultPanelPoses,
    locked_negative_prompt: locks.negativePrompt,
    replacement_dir: `art-replacements/${date}`,
    latest_replacement_dir: "art-replacements/latest",
    prompt_dir: `art-prompts/${date}`,
    panels: prompts,
    generated_at: generatedAt,
  };

  await writeJson(path.join(promptDir, "manifest.json"), manifest);
  await writeJson(path.join(promptDir, "prompts.json"), promptsPayload);
  await writeText(path.join(promptDir, "README.md"), replacementReadme(date));
  await writeText(path.join(replacementDir, "README.md"), replacementReadme(date));

  await mirrorFolder(promptDir, latestPromptDir);
  await fs.rm(latestReplacementDir, { recursive: true, force: true });
  await fs.mkdir(latestReplacementDir, { recursive: true });
  await fs.copyFile(path.join(replacementDir, "README.md"), path.join(latestReplacementDir, "README.md"));

  console.log(`Daily block-locked Isla art prompt pack written: art-prompts/${date}`);
  console.log(`Machine-readable prompts written: art-prompts/${date}/prompts.json`);
  console.log(`Replacement slot folder prepared: art-replacements/${date}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
