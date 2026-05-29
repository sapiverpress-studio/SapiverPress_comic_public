import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const PHASE = process.argv[2] || "sync";

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

async function readJson(relativePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(relativePath, data) {
  const file = path.join(ROOT, relativePath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function variantCaption(scene = {}, story = {}) {
  const variantName = clean(story?.variant_recap?.variant_name || "");
  if (!scene.variant_recap_here || !variantName) return "";
  const current = clean(scene.storyboard_caption || scene.caption || "");
  if (current && current.toLowerCase().includes(variantName.toLowerCase())) return current;
  return current || `${variantName} changes this move, so Isla checks the rule before trusting it.`;
}

function storyboardCaption(scene = {}, story = {}) {
  if (scene.variant_recap_here) return variantCaption(scene, story) || clean(scene.storyboard_caption || scene.caption || "");
  if (scene.uk_calendar_recap_here) return clean(scene.storyboard_caption || scene.caption || "");
  return clean(scene.storyboard_caption || scene.caption || "");
}

function storyboardDialogue(scene = {}, story = {}) {
  if (scene.variant_recap_here) {
    return clean(story?.variant_recap?.line || scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || "");
  }
  if (scene.uk_calendar_recap_here) {
    return clean(story?.uk_calendar_date?.line || scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || "");
  }
  return clean(scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || "");
}

function syncScenes(story) {
  const scenes = Array.isArray(story?.scenes) ? story.scenes : [];
  story.scenes = scenes.map((scene) => {
    const caption = storyboardCaption(scene, story);
    const dialogue = storyboardDialogue(scene, story);
    return {
      ...scene,
      storyboard_caption: caption,
      storyboard_dialogue: dialogue,
      storyboard_panel_text: dialogue ? `${dialogue}\n${caption}` : caption,
    };
  });
  return story;
}

function syncImageManifest(story, manifest = {}) {
  const scenes = Array.isArray(story?.scenes) ? story.scenes : [];
  const existingPrompts = Array.isArray(manifest.image_prompts) ? manifest.image_prompts : [];
  manifest.story_source_used = story.story_source_used || (story.date ? `daily/${story.date}.json` : manifest.story_source_used || "");
  manifest.story_fields_used = story.story_fields_used || manifest.story_fields_used || [];
  manifest.storyboard_copy_source = story.storyboard_copy_source || manifest.storyboard_copy_source || "pending";
  manifest.storyboard_arc_type = story.storyboard_arc_type || manifest.storyboard_arc_type || "story_driven_not_location_driven";
  manifest.storyboard_arc = story.storyboard_arc || manifest.storyboard_arc || {};
  manifest.storyboard_quality = story.storyboard_quality || manifest.storyboard_quality || {};
  manifest.image_prompts = scenes.map((scene, index) => {
    const existing = existingPrompts[index] || {};
    return {
      ...existing,
      scene: scene.id || existing.scene,
      pose_id: scene.pose_id || existing.pose_id,
      prompt: existing.prompt || scene.full_image_prompt || scene.image_prompt_fragment || "",
      storyboard_caption: storyboardCaption(scene, story),
      storyboard_dialogue: storyboardDialogue(scene, story),
    };
  });
  return manifest;
}

function updateHistoryCaptions(characterFile, story) {
  if (!story?.date) return characterFile;
  const patchEntry = (entry) => entry?.date === story.date
    ? {
        ...entry,
        captions: story.scenes?.map((scene) => storyboardCaption(scene, story)) || entry.captions || [],
      }
    : entry;

  if (Array.isArray(characterFile.story_history)) {
    characterFile.story_history = characterFile.story_history.map(patchEntry);
  }
  if (Array.isArray(characterFile.weeks)) {
    characterFile.weeks = characterFile.weeks.map(patchEntry);
  }
  return characterFile;
}

async function main() {
  const date = dateString();
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);

  story = syncScenes(story);
  story.image_manifest = syncImageManifest(story, story.image_manifest || {});

  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest);

  const character = await readJson("characters/isla.json", null);
  if (character) {
    await writeJson("characters/isla.json", updateHistoryCaptions(character, story));
  }

  console.log(`Storyboard fields synced (${PHASE}) for ${date}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
