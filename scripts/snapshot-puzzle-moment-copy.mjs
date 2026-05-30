import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const PANEL_INDEX = 3;

function dateString() {
  return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function readJson(rel, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(rel, data) {
  const file = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function hasCopy(scene) {
  return Boolean(clean(scene?.storyboard_caption || scene?.caption || "") && clean(scene?.storyboard_dialogue || scene?.dialogue || scene?.speech_bubble || ""));
}

async function main() {
  const date = dateString();
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story?.scenes?.[PANEL_INDEX]) {
    console.log("Puzzle moment snapshot skipped: no panel 4 scene");
    return;
  }

  const scene = story.scenes[PANEL_INDEX];
  if (!hasCopy(scene)) {
    console.log("Puzzle moment snapshot skipped: panel 4 copy incomplete");
    return;
  }

  const snapshot = {
    ran: true,
    source_stage: story.storyboard_copy_source || "unknown",
    caption: clean(scene.storyboard_caption || scene.caption || ""),
    dialogue: clean(scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || ""),
    image_prompt_fragment: clean(scene.image_prompt_fragment || ""),
    captured_at: new Date().toISOString(),
  };

  scene.openai_caption = snapshot.caption;
  scene.openai_dialogue = snapshot.dialogue;
  scene.caption_before_quality_gate = snapshot.caption;
  scene.dialogue_before_quality_gate = snapshot.dialogue;
  scene.puzzle_moment_copy_snapshot = snapshot;

  story.puzzle_moment_copy_snapshot = snapshot;
  story.image_manifest = story.image_manifest || {};
  story.image_manifest.puzzle_moment_copy_snapshot = snapshot;
  if (story.image_manifest.image_prompts?.[PANEL_INDEX]) {
    story.image_manifest.image_prompts[PANEL_INDEX].storyboard_caption_before_quality_gate = snapshot.caption;
    story.image_manifest.image_prompts[PANEL_INDEX].storyboard_dialogue_before_quality_gate = snapshot.dialogue;
    story.image_manifest.image_prompts[PANEL_INDEX].puzzle_moment_copy_snapshot = snapshot;
  }

  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  console.log(`Puzzle moment copy snapshot saved from ${snapshot.source_stage}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
