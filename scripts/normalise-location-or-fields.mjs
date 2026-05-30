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

function firstOption(value) {
  return clean(value).replace(/\s+or\s+.+$/i, "");
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

function normaliseStory(story) {
  if (!story?.scenes?.length) return { changed: false, count: 0 };
  let count = 0;
  for (const scene of story.scenes) {
    for (const key of ["panel_location", "setting", "location_label"]) {
      if (typeof scene[key] === "string" && /\s+or\s+/i.test(scene[key])) {
        scene[key] = firstOption(scene[key]);
        count += 1;
      }
    }
  }
  if (Array.isArray(story.storyboard_locations)) {
    story.storyboard_locations = story.storyboard_locations.map((value) => {
      if (typeof value === "string" && /\s+or\s+/i.test(value)) {
        count += 1;
        return firstOption(value);
      }
      return value;
    });
  }
  story.location_or_normalised = { ran: true, changed: count > 0, fields_changed: count };
  if (story.image_manifest) {
    story.image_manifest.location_or_normalised = story.location_or_normalised;
    story.image_manifest.storyboard_locations = story.storyboard_locations || story.image_manifest.storyboard_locations;
    if (Array.isArray(story.image_manifest.panel_locations)) {
      story.image_manifest.panel_locations = story.image_manifest.panel_locations.map((item) => ({
        ...item,
        setting: typeof item.setting === "string" ? firstOption(item.setting) : item.setting,
      }));
    }
  }
  return { changed: count > 0, count };
}

async function main() {
  const date = dateString();
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) {
    console.log("Location OR normaliser skipped: no story found");
    return;
  }
  const result = normaliseStory(story);
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  if (story.image_manifest) await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  console.log(`Location OR normaliser: ${result.changed ? "changed" : "unchanged"} (${result.count} fields)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
