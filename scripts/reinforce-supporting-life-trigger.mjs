import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();

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

function triggerEnabled(trigger) {
  return Boolean(trigger && trigger.enabled && trigger.panel && trigger.sender && trigger.message);
}

function reinforce(story) {
  const trigger = story?.supporting_life_trigger;
  if (!triggerEnabled(trigger)) return { changed: false, reason: "no_enabled_trigger" };
  const panelIndex = Math.max(0, Number(trigger.panel) - 1);
  const effect = clean(trigger.arc_shift || "The notification changes what Isla chooses to do next.");
  const sender = clean(trigger.sender);
  const message = clean(trigger.message);

  story.supporting_cast_policy = story.supporting_cast_policy || {
    isla_only_main_character: true,
    overlay_only: true,
    no_extra_faces: true,
  };
  story.supporting_life_trigger_story_locked = true;
  story.story_note = clean(`${story.story_note || ""} Supporting trigger: ${sender} sends a notification, '${message}'. ${effect}`).slice(0, 700);
  story.continuation_note = clean(`${story.continuation_note || ""} Keep the trigger visible in the story logic: it should affect Isla's decision, not just decorate the image.`).slice(0, 700);

  const scenes = Array.isArray(story.scenes) ? story.scenes : [];
  const scene = scenes[panelIndex];
  if (scene) {
    scene.supporting_life_trigger_here = true;
    scene.supporting_life_trigger = trigger;
    scene.scene_description = clean(`${scene.scene_description || scene.beat || ""} A notification from ${sender} appears: ${message}. Isla has to react to it.`).slice(0, 620);
    scene.image_prompt_fragment = clean(`${scene.image_prompt_fragment || ""}, Isla notices a phone notification, no extra visible person`).slice(0, 520);
  }

  for (let i = 0; i < scenes.length; i += 1) {
    if (i === panelIndex) continue;
    if (i === panelIndex + 1 || i === panelIndex + 2 || i === 5) {
      scenes[i].supporting_life_trigger_effect = effect;
      scenes[i].scene_description = clean(`${scenes[i].scene_description || scenes[i].beat || ""} The earlier notification still affects Isla's choice here.`).slice(0, 620);
    }
  }

  story.life_memory_entry = story.life_memory_entry || { date: story.date };
  story.life_memory_entry.supporting_life_trigger = trigger;
  if (story.image_manifest) {
    story.image_manifest.supporting_life_trigger = trigger;
    story.image_manifest.supporting_cast_policy = story.supporting_cast_policy;
    story.image_manifest.supporting_life_trigger_story_locked = true;
  }
  return { changed: true, reason: `${trigger.type}_panel_${trigger.panel}` };
}

async function main() {
  const date = dateString();
  const story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) {
    console.log("Supporting trigger reinforcement skipped: no story found");
    return;
  }
  const result = reinforce(story);
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  if (story.image_manifest) await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  console.log(`Supporting trigger reinforcement: ${result.changed ? "changed" : "unchanged"} (${result.reason})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
