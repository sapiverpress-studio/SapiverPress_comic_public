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

function mergeMetadata(target, story, imageManifest) {
  const merged = { ...target };
  const keys = [
    "puzzle_moment_copy_snapshot",
    "puzzle_moment_copy_protection",
    "location_or_normalised",
    "storyboard_arc",
    "storyboard_quality",
    "final_copy_sanity",
    "location_flow_validated",
    "location_flow",
    "storyboard_locations",
    "variant_recap",
    "variant_copy_mode",
    "variant_detection_unresolved",
    "quality_gate_action",
    "quality_gate_repair_reasons",
  ];
  for (const key of keys) {
    if (story?.[key] !== undefined) merged[key] = story[key];
    else if (imageManifest?.[key] !== undefined) merged[key] = imageManifest[key];
  }
  if (Array.isArray(merged.scenes) && Array.isArray(story?.scenes)) {
    merged.scenes = merged.scenes.map((scene, index) => ({
      ...scene,
      panel_location: story.scenes[index]?.panel_location || scene.panel_location,
      storyboard_caption: story.scenes[index]?.storyboard_caption || scene.storyboard_caption,
      storyboard_dialogue: story.scenes[index]?.storyboard_dialogue || scene.storyboard_dialogue,
    }));
  }
  return merged;
}

async function main() {
  const date = dateString();
  const story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  const imageManifest = await readJson(`image-manifests/${date}.json`, null);
  if (!story && !imageManifest) {
    console.log("Social manifest metadata sync skipped: no story/image manifest found");
    return;
  }

  let changed = 0;
  for (const rel of [`social/${date}/manifest.json`, "social/latest/manifest.json"]) {
    const manifest = await readJson(rel, null);
    if (!manifest) continue;
    const next = mergeMetadata(manifest, story, imageManifest);
    await writeJson(rel, next);
    changed += 1;
  }
  console.log(`Social manifest metadata sync: ${changed} manifest(s) updated`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
