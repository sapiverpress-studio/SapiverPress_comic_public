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

function isGenericPuzzleLine(text) {
  return /^(check the daily rule before trusting it\.?|the daily rule changes the move, so isla checks it before trusting the answer\.?)$/i.test(clean(text));
}

function useful(text) {
  const t = clean(text);
  return t && !isGenericPuzzleLine(t);
}

function getCandidate(story) {
  const scene = story?.scenes?.[PANEL_INDEX] || {};
  const caption = clean(scene.openai_caption || scene.original_caption || scene.caption_before_quality_gate || scene.storyboard_caption_source || "");
  const dialogue = clean(scene.openai_dialogue || scene.original_dialogue || scene.dialogue_before_quality_gate || scene.storyboard_dialogue_source || "");
  if (useful(caption) && useful(dialogue)) return { caption, dialogue, source: "stored_source_fields" };

  const manifestPrompt = story?.image_manifest?.image_prompts?.[PANEL_INDEX] || {};
  const mCaption = clean(manifestPrompt.storyboard_caption || manifestPrompt.caption || "");
  const mDialogue = clean(manifestPrompt.storyboard_dialogue || manifestPrompt.dialogue || "");
  if (useful(mCaption) && useful(mDialogue)) return { caption: mCaption, dialogue: mDialogue, source: "image_manifest_prompt" };

  return null;
}

function applyProtection(story) {
  const scene = story?.scenes?.[PANEL_INDEX];
  if (!scene) return { changed: false, reason: "missing_panel_4" };

  const currentCaption = clean(scene.storyboard_caption || scene.caption || "");
  const currentDialogue = clean(scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || "");
  const overwritten = isGenericPuzzleLine(currentCaption) || isGenericPuzzleLine(currentDialogue);
  if (!overwritten) return { changed: false, reason: "panel_4_not_generic" };

  const candidate = getCandidate(story);
  if (!candidate) {
    story.puzzle_moment_copy_protection = {
      ran: true,
      changed: false,
      reason: "generic_panel_4_but_no_better_source_found",
    };
    return { changed: false, reason: "no_candidate" };
  }

  scene.caption = candidate.caption;
  scene.dialogue = candidate.dialogue;
  scene.speech_bubble = candidate.dialogue;
  scene.storyboard_caption = candidate.caption;
  scene.storyboard_dialogue = candidate.dialogue;
  scene.storyboard_panel_text = `${candidate.dialogue}\n${candidate.caption}`;
  scene.puzzle_moment_copy_preserved = true;
  scene.puzzle_moment_copy_source = candidate.source;

  story.storyboard_arc = story.storyboard_arc || {};
  story.storyboard_arc.puzzle_moment = candidate.caption;
  story.puzzle_moment_copy_protection = {
    ran: true,
    changed: true,
    source: candidate.source,
  };
  story.quality_gate_repair_reasons = Array.from(new Set([...(story.quality_gate_repair_reasons || []), "protected_puzzle_moment_copy"]));
  if (story.storyboard_quality) {
    story.storyboard_quality.quality_gate_repair_reasons = story.quality_gate_repair_reasons;
  }
  return { changed: true, reason: candidate.source };
}

async function main() {
  const date = dateString();
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story?.scenes?.length) {
    console.log("Puzzle moment copy protection skipped: no story scenes");
    return;
  }

  const result = applyProtection(story);
  story.image_manifest = story.image_manifest || {};
  story.image_manifest.puzzle_moment_copy_protection = story.puzzle_moment_copy_protection || { ran: true, changed: false, reason: result.reason };
  story.image_manifest.storyboard_arc = story.storyboard_arc || story.image_manifest.storyboard_arc || {};
  if (story.image_manifest.image_prompts?.[PANEL_INDEX]) {
    story.image_manifest.image_prompts[PANEL_INDEX].caption = story.scenes[PANEL_INDEX].caption;
    story.image_manifest.image_prompts[PANEL_INDEX].dialogue = story.scenes[PANEL_INDEX].dialogue;
    story.image_manifest.image_prompts[PANEL_INDEX].storyboard_caption = story.scenes[PANEL_INDEX].storyboard_caption;
    story.image_manifest.image_prompts[PANEL_INDEX].storyboard_dialogue = story.scenes[PANEL_INDEX].storyboard_dialogue;
  }

  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  console.log(`Puzzle moment copy protection: ${result.changed ? "changed" : "unchanged"} (${result.reason})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
