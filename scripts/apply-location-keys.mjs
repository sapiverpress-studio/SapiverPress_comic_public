import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const FLOWS = [
  {
    id: "errand_day",
    locations: [
      { setting: "small home kitchen table in warm morning light", location: "home", composition: "desk_right_screen" },
      { setting: "train table by the window", location: "train", composition: "train_right_screen" },
      { setting: "outdoor cafe street table", location: "cafe", composition: "cafe_right_screen" },
      { setting: "co-working desk near a tall window", location: "coworking", composition: "desk_right_screen" },
      { setting: "bookshop cafe corner", location: "bookshop", composition: "cafe_right_screen" },
      { setting: "rainy window nook with plants", location: "rainy_window", composition: "desk_right_screen" },
    ],
  },
  {
    id: "library_day",
    locations: [
      { setting: "small home kitchen table in warm morning light", location: "home", composition: "desk_right_screen" },
      { setting: "public library reading table", location: "public_library", composition: "desk_right_screen" },
      { setting: "library window seat with bookshelves behind", location: "public_library", composition: "desk_right_screen" },
      { setting: "quiet side street bench outside the library", location: "cafe", composition: "cafe_right_screen" },
      { setting: "bookshop cafe corner", location: "bookshop", composition: "cafe_right_screen" },
      { setting: "home sofa corner with lamp and plants", location: "home", composition: "desk_right_screen" },
    ],
  },
  {
    id: "work_day",
    locations: [
      { setting: "small home kitchen table in warm morning light", location: "home", composition: "desk_right_screen" },
      { setting: "co-working lobby table near glass doors", location: "coworking", composition: "desk_right_screen" },
      { setting: "co-working desk near a tall window", location: "coworking", composition: "desk_right_screen" },
      { setting: "office break area table with notice board", location: "coworking", composition: "desk_right_screen" },
      { setting: "train table by the window", location: "train", composition: "train_right_screen" },
      { setting: "rainy window nook with plants", location: "rainy_window", composition: "desk_right_screen" },
    ],
  },
  {
    id: "weekend_bookshop",
    locations: [
      { setting: "rainy window nook with plants", location: "rainy_window", composition: "desk_right_screen" },
      { setting: "bookshop front table by new releases", location: "bookshop", composition: "cafe_right_screen" },
      { setting: "bookshop cafe corner", location: "bookshop", composition: "cafe_right_screen" },
      { setting: "outdoor cafe street table", location: "cafe", composition: "cafe_right_screen" },
      { setting: "small home kitchen table in warm evening light", location: "home", composition: "desk_right_screen" },
      { setting: "home sofa corner with lamp and plants", location: "home", composition: "desk_right_screen" },
    ],
  },
  {
    id: "travel_day",
    locations: [
      { setting: "small kitchen counter with travel mug", location: "home", composition: "desk_right_screen" },
      { setting: "train platform waiting area table", location: "train", composition: "train_right_screen" },
      { setting: "train table by the window", location: "train", composition: "train_right_screen" },
      { setting: "station cafe table near window", location: "cafe", composition: "cafe_right_screen" },
      { setting: "co-working hot desk near tall window", location: "coworking", composition: "desk_right_screen" },
      { setting: "rainy bus-stop window nook feeling with plants nearby", location: "rainy_window", composition: "desk_right_screen" },
    ],
  },
];

function todayString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override) return override;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
async function readJson(relativePath, fallback = null) { try { return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), "utf8")); } catch { return fallback; } }
async function writeJson(relativePath, data) { const out = path.join(ROOT, relativePath); await fs.mkdir(path.dirname(out), { recursive: true }); await fs.writeFile(out, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
function stableIndex(seed, length) { let hash = 2166136261; for (const ch of String(seed || "")) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0) % Math.max(1, length); }
function recentFlowIds(story) { const history = story?.character_history || story?.story_history || []; return history.slice(-5).map((entry) => entry.location_flow_id || entry.life_memory_entry?.location_flow_id).filter(Boolean); }
function chooseFlow(story, date) { const recent = new Set(recentFlowIds(story)); const offset = stableIndex(`${date}-${story?.life_memory_entry?.location || ""}-${story?.variant_recap?.variant_name || ""}`, FLOWS.length); for (let i = 0; i < FLOWS.length; i += 1) { const flow = FLOWS[(offset + i) % FLOWS.length]; if (!recent.has(flow.id)) return flow; } return FLOWS[offset]; }
async function patchStory(relativePath, date) {
  const story = await readJson(relativePath, null);
  if (!story) return { changed: false, flow: null };
  const flow = chooseFlow(story, date);
  story.location_key = flow.locations[0].location;
  story.composition_key = flow.locations[0].composition;
  story.location_key_applied = true;
  story.per_panel_location_keys = true;
  story.location_flow_forced = false;
  story.location_flow_id = flow.id;
  story.location_flow_method = "rotating_daily_flow";
  story.storyboard_locations = flow.locations.map((p) => p.setting);
  story.location_flow = flow.locations.map((p) => p.location);
  story.location_flow_validated = true;

  story.scenes = (story.scenes || []).slice(0, 6).map((scene, index) => {
    const chosen = flow.locations[index] || flow.locations[0];
    return { ...scene, setting: chosen.setting, panel_location: chosen.setting, location_label: chosen.setting, location: chosen.location, composition: chosen.composition, location_key: chosen.location, composition_key: chosen.composition };
  });

  if (story.life_memory_entry) story.life_memory_entry.location_flow_id = flow.id;
  if (story.image_manifest) {
    story.image_manifest.location_key = story.location_key;
    story.image_manifest.composition_key = story.composition_key;
    story.image_manifest.per_panel_location_keys = true;
    story.image_manifest.location_flow_forced = false;
    story.image_manifest.location_flow_id = flow.id;
    story.image_manifest.location_flow_method = story.location_flow_method;
    story.image_manifest.location_flow_validated = true;
    story.image_manifest.storyboard_locations = story.storyboard_locations;
    story.image_manifest.panel_locations = story.scenes.map((scene, index) => ({ panel: index + 1, setting: scene.panel_location || scene.setting, location_key: scene.location, composition_key: scene.composition }));
  }
  await writeJson(relativePath, story);
  return { changed: true, flow };
}

async function main() {
  const date = todayString();
  const daily = await patchStory(`daily/${date}.json`, date);
  const latest = await patchStory("latest.json", date);
  const story = await readJson(`daily/${date}.json`, null);
  if (story?.image_manifest) await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  const flowId = daily.flow?.id || latest.flow?.id || "unknown";
  console.log(`Scene location keys applied: daily=${daily.changed ? "yes" : "no"}, latest=${latest.changed ? "yes" : "no"}`);
  console.log(`Rotating location flow: ${flowId}`);
}
main().catch((error) => { console.error(error); process.exit(1); });