import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const CHARACTER = (process.env.COMIC_CHARACTER || "isla").trim().toLowerCase() || "isla";
const SUITE_URL = process.env.SUITE_URL || "https://suite.sapiverpress.co.uk";
const LORA_TRIGGER = process.env.HF_LORA_TRIGGER || "ISLA_SP";
const LORA_REPO = process.env.HF_LORA_REPO || "sapiverpress/sapiverpress-isla-lora";
const LORA_FILE = process.env.HF_LORA_FILE || "ISLA_SP_1779957190206.safetensors";

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

function characterLock() {
  return [
    `LORA TRIGGER: ${LORA_TRIGGER}. Use this exact trigger word for Isla.`,
    `CANONICAL CHARACTER: ${LORA_TRIGGER}, Isla, young Black woman, warm medium brown skin, light freckles on nose and cheeks, natural coily dark hair in a high voluminous puff bun, wide floral teal/rust/orange headband worn across forehead, medium gold hoop earrings, oversized deep teal hoodie.`,
    "Keep Isla recognisable across all six images. Vary pose, camera angle, expression, and activity naturally; do not repeat the same composition.",
  ].join("\n");
}

function screenLock() {
  return [
    "DEVICE RULE: include one laptop, tablet, or monitor with a clear blank/dark screen area facing Isla naturally, not audience-facing unless the perspective makes sense.",
    "Do not draw puzzle grids, Sudoku/Trigoku numbers, captions, speech bubbles, page headers, footers, or big Sapiver Press titles into the artwork. The real puzzle screenshot and captions are added later by the compositor.",
    "Sapiver Press branding is allowed only as subtle merch or a tiny environmental detail, never as a poster/header/title.",
  ].join("\n");
}

function outputLock(fileName) {
  return [
    `OUTPUT FILE: ${fileName}`,
    "Recommended format: PNG, square or landscape comic-panel illustration, 1024px minimum, clean screen area visible for compositor replacement.",
    "No baked-in text except tiny incidental environment detail.",
  ].join("\n");
}

function buildPrompt({ story, scene, index }) {
  const setting = clean(scene.setting || story.selected_setting || "modern cosy workspace");
  const sceneDescription = clean(scene.scene_description || scene.beat || scene.title || "quiet daily puzzle moment");
  const promptFragment = clean(scene.image_prompt_fragment || "natural focused moment");
  const viewRule = clean(scene.view_rule || "natural varied camera angle, Isla's face clearly visible");
  const caption = clean(scene.caption || "");

  return [
    `${LORA_TRIGGER}, Sapiver Press daily comic art, panel ${index + 1} of 6`,
    "",
    `SAPIVER PRESS DAILY COMIC ART PROMPT — ${story.date || "unknown date"} — PANEL ${index + 1}/6`,
    "",
    characterLock(),
    "",
    `SETTING: ${setting}`,
    `SCENE: ${sceneDescription}`,
    `MOOD/ACTION: ${promptFragment}`,
    `CAMERA/VIEW: ${viewRule}`,
    caption ? `STORY CAPTION FOR CONTEXT ONLY, DO NOT RENDER AS TEXT: ${caption}` : "",
    "STYLE: warm painterly editorial illustration, cinematic amber palette, detailed but readable, premium lifestyle comic panel, natural depth, coherent environment, no duplicated pose.",
    "",
    screenLock(),
    "",
    outputLock(PANEL_FILES[index]),
  ].filter(Boolean).join("\n");
}

function negativePrompt() {
  return [
    "text, words, captions, speech bubble, comic dialogue, page number, footer, header, watermark, large logo, brand title, puzzle grid, sudoku numbers, trigoku numbers, distorted hands, duplicated character, child, low quality, blurry, extra limbs, laptop facing away from user illogically",
  ].join(", ");
}

function replacementReadme(date) {
  return `# Sapiver Press Comic Art Replacement Slots — ${date}\n\nDrop finished generated panel artwork into this folder using these exact names:\n\n${PANEL_FILES.map((name) => `- ${name}`).join("\n")}\n\nRules:\n\n- Keep screens blank/dark and clearly visible.\n- Do not include puzzle content, captions, speech bubbles, page headers, footers, or large Sapiver Press titles.\n- The compositor will insert the real daily puzzle screenshots and captions.\n- If a file is missing, the compositor falls back to the locked template artwork.\n- Starter and finished grid images are still generated from the real captured puzzle state.\n\nPlay URL: ${SUITE_URL}\n`;
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
  const date = londonDateString();
  const story = await readJson(path.join(ROOT, "daily", `${date}.json`), await readJson(path.join(ROOT, "latest.json"), null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json. Cannot generate art prompt pack.`);

  const scenes = [...(story.scenes || [])].slice(0, 6);
  while (scenes.length < 6) scenes.push({ title: `Panel ${scenes.length + 1}`, caption: "", scene_description: "Daily puzzle moment" });

  const promptDir = path.join(ROOT, "art-prompts", date);
  const latestPromptDir = path.join(ROOT, "art-prompts", "latest");
  const replacementDir = path.join(ROOT, "art-replacements", date);
  const latestReplacementDir = path.join(ROOT, "art-replacements", "latest");

  const panels = [];
  const prompts = [];
  for (let index = 0; index < 6; index += 1) {
    const scene = scenes[index];
    const promptFile = `${String(index + 1).padStart(2, "0")}_panel-${String(index + 1).padStart(2, "0")}_prompt.txt`;
    const promptText = buildPrompt({ story, scene, index });
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
      negative_prompt: negativePrompt(),
      caption: panel.caption,
    });
  }

  const manifest = {
    date,
    character: CHARACTER,
    format: "daily_art_prompt_pack_v1",
    purpose: "Generate six replaceable Isla panel artworks while preserving the real puzzle screenshot compositor.",
    replacement_dir: `art-replacements/${date}`,
    prompt_dir: `art-prompts/${date}`,
    prompts_json: `art-prompts/${date}/prompts.json`,
    compositor_rule: "If a matching replacement PNG exists, use it. Otherwise use the locked template artwork.",
    panel_files: PANEL_FILES,
    panels,
    story_source: story.date === date ? `daily/${date}.json` : "latest.json",
    generated_at: new Date().toISOString(),
  };

  const promptsPayload = {
    date,
    character: CHARACTER,
    format: "daily_art_prompts_json_v1",
    lora: {
      trigger_word: LORA_TRIGGER,
      repo: LORA_REPO,
      file: LORA_FILE,
      base_model: "z_image_turbo",
    },
    replacement_dir: `art-replacements/${date}`,
    latest_replacement_dir: "art-replacements/latest",
    prompt_dir: `art-prompts/${date}`,
    panels: prompts,
    generated_at: manifest.generated_at,
  };

  await writeJson(path.join(promptDir, "manifest.json"), manifest);
  await writeJson(path.join(promptDir, "prompts.json"), promptsPayload);
  await writeText(path.join(promptDir, "README.md"), replacementReadme(date));
  await writeText(path.join(replacementDir, "README.md"), replacementReadme(date));

  await mirrorFolder(promptDir, latestPromptDir);
  await fs.rm(latestReplacementDir, { recursive: true, force: true });
  await fs.mkdir(latestReplacementDir, { recursive: true });
  await fs.copyFile(path.join(replacementDir, "README.md"), path.join(latestReplacementDir, "README.md"));

  console.log(`Daily art prompt pack written: art-prompts/${date}`);
  console.log(`Machine-readable prompts written: art-prompts/${date}/prompts.json`);
  console.log(`Replacement slot folder prepared: art-replacements/${date}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
