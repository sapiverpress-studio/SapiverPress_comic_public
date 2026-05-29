import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();

function todayString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override) return override;
  return new Intl.DateTimeFormat("sv-SE", {
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
  const out = path.join(ROOT, relativePath);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function locationForSetting(setting = "") {
  const text = setting.toLowerCase();
  if (text.includes("train")) return { location: "train", composition: "train_right_screen" };
  if (text.includes("cafe") || text.includes("café")) return { location: "cafe", composition: "cafe_right_screen" };
  if (text.includes("co-working") || text.includes("coworking") || text.includes("work")) return { location: "coworking", composition: "desk_right_screen" };
  if (text.includes("kitchen") || text.includes("home")) return { location: "home", composition: "desk_right_screen" };
  if (text.includes("bookshop")) return { location: "bookshop", composition: "desk_right_screen" };
  if (text.includes("rain")) return { location: "rainy_window", composition: "desk_right_screen" };
  if (text.includes("public library")) return { location: "public_library", composition: "desk_right_screen" };
  if (text.includes("library")) return { location: "library_study", composition: "desk_right_screen" };
  return { location: "library_study", composition: "desk_right_screen" };
}

async function patchStory(relativePath) {
  const story = await readJson(relativePath, null);
  if (!story) return false;
  const setting = clean(story.selected_setting || story.life_memory_entry?.location || "");
  const mapped = locationForSetting(setting);
  story.location_key = mapped.location;
  story.composition_key = mapped.composition;
  story.location_key_applied = true;
  story.scenes = (story.scenes || []).map((scene) => ({
    ...scene,
    location: scene.location || mapped.location,
    composition: scene.composition || mapped.composition,
  }));
  if (story.image_manifest) {
    story.image_manifest.location_key = mapped.location;
    story.image_manifest.composition_key = mapped.composition;
  }
  await writeJson(relativePath, story);
  return true;
}

async function main() {
  const date = todayString();
  const changedDaily = await patchStory(`daily/${date}.json`);
  const changedLatest = await patchStory("latest.json");
  const story = await readJson(`daily/${date}.json`, null);
  if (story?.image_manifest) await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  console.log(`Location keys applied: daily=${changedDaily ? "yes" : "no"}, latest=${changedLatest ? "yes" : "no"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
