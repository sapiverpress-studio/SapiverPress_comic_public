import fs from "fs";
import path from "path";

const root = process.cwd();
const override = process.env.DATE_OVERRIDE || "";
const date = override || new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const POSE_LOCKS = [
  "POSE LOCK: seated opening laptop, one hand on laptop lid, front three-quarter view",
  "POSE LOCK: active travel or transition pose, shoulders angled away from normal desk pose",
  "POSE LOCK: phone ignored face down or hand away from distraction, decision moment posture",
  "POSE LOCK: leaning forward for active digital-grid check, finger near trackpad, hands clear of screen",
  "POSE LOCK: holding mug or notebook beside local props, side angle, relaxed shoulders",
  "POSE LOCK: packing up or closing laptop, looking away from screen toward the environment",
];

const DIGITAL_GRID_LOCK = "DIGITAL PUZZLE LOCK: puzzle means Sudoku or Trigoku grid on the laptop screen only, no physical puzzle props, no jigsaw pieces, no cardboard pieces, no board-game tokens, no loose puzzle shapes on the desk";
const NEGATIVE_JIGSAW = "jigsaw pieces, physical puzzle pieces, cardboard puzzle pieces, loose game pieces, board game tiles, tangram pieces, scattered puzzle shapes on desk";

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeJson(file, data) { fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
function tidy(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function sceneStoryBeat(scene) { return tidy(scene.image_prompt_fragment || scene.scene_description || scene.storyboard_caption || scene.caption || scene.beat || scene.title || ""); }
function stripPriorLocks(text) { return tidy(text).replace(/PANEL \d LOCATION LOCK:[^,]+(?:,[^,]+){0,12}/gi, "").replace(/POSE LOCK:[^,]+(?:,[^,]+){0,6}/gi, "").replace(/DIGITAL PUZZLE LOCK:[^,]+(?:,[^,]+){0,8}/gi, "").replace(/^,\s*/, ""); }
function cleanStoryBeat(beat) { return tidy(beat).replace(/\bpuzzle pieces\b/gi, "grid entries").replace(/\bpieces\b/gi, "numbers").replace(/\bfit into place\b/gi, "resolve cleanly").replace(/\bfall into place\b/gi, "resolve cleanly"); }

function sceneLock(scene, index) {
  const setting = tidy(scene.panel_location || scene.setting || scene.location_label || "daily-life table");
  const key = tidy(scene.location_key || scene.location || "").toLowerCase();
  const lower = `${setting} ${key}`.toLowerCase();
  if (lower.includes("train") || lower.includes("platform")) return `PANEL ${index + 1} LOCATION LOCK: ${setting}, unmistakable rail or train environment, train window or platform signs, travel seating, not office, not home, not generic desk`;
  if (lower.includes("bookshop")) return `PANEL ${index + 1} LOCATION LOCK: ${setting}, visible book shelves and book spines, display table, warm shop lighting, stacks of books nearby, not garden, not generic desk`;
  if (lower.includes("library")) return `PANEL ${index + 1} LOCATION LOCK: ${setting}, public library or reading-room environment, tall shelves, reading table, aisle signs or study lamps, not cafe, not home`;
  if (lower.includes("cafe") || lower.includes("café") || lower.includes("street") || lower.includes("bench")) return `PANEL ${index + 1} LOCATION LOCK: ${setting}, clearly public cafe or street setting, shopfronts or outdoor tables, daylight outside, public background detail, not indoor office desk`;
  if (lower.includes("cowork") || lower.includes("office") || lower.includes("work")) return `PANEL ${index + 1} LOCATION LOCK: ${setting}, modern working environment, glass partitions or notice board, office chair, other desks blurred behind, not home kitchen`;
  if (lower.includes("rain") || lower.includes("window nook")) return `PANEL ${index + 1} LOCATION LOCK: ${setting}, rain streaks on glass, wet street or grey light outside, plants on sill, reflective window scene, not office`;
  if (lower.includes("home") || lower.includes("kitchen") || lower.includes("sofa")) return `PANEL ${index + 1} LOCATION LOCK: ${setting}, unmistakable home interior, domestic objects, mug, cupboards sofa or lamp, lived-in private space, not office, not library`;
  return `PANEL ${index + 1} LOCATION LOCK: ${setting}, visually distinct from every other panel, specific environmental props visible, not generic indoor desk`;
}

const story = readJson(path.join(root, "daily", `${date}.json`));
const scenes = Array.isArray(story.scenes) ? story.scenes : [];
const promptKey = "pro" + "mpt";
const promptFileKey = "pro" + "mpt_file";
const promptDir = "art-" + "prompts";

for (const dir of [path.join(root, promptDir, date), path.join(root, promptDir, "latest")]) {
  const file = path.join(dir, "prompts.json");
  if (!fs.existsSync(file)) continue;
  const data = readJson(file);
  for (const [index, panel] of (data.panels || []).entries()) {
    const scene = scenes[index] || {};
    const beat = cleanStoryBeat(sceneStoryBeat(scene));
    const lock = sceneLock(scene, index);
    panel.arc_role = scene.arc_role || panel.arc_role || "";
    panel.story_beat = beat;
    panel.story_beat_enabled = Boolean(beat);
    panel.storyboard_caption = tidy(scene.storyboard_caption || scene.caption || "");
    panel.storyboard_dialogue = tidy(scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || "");
    panel.story_source_used = story.story_source_used || (story.date === date ? `daily/${date}.json` : "latest.json");
    panel.storyboard_copy_source = story.storyboard_copy_source || "unknown";
    panel.storyboard_arc_type = story.storyboard_arc_type || "story_driven_not_location_driven";
    panel.panel_scene_lock = lock;
    panel.panel_pose_lock = POSE_LOCKS[index] || POSE_LOCKS[0];
    panel.digital_grid_lock = DIGITAL_GRID_LOCK;
    panel.location_flow_id = story.location_flow_id || "unknown";
    panel.scene_lock_front_loaded = true;
    panel.jigsaw_ban_enabled = true;
    panel.negative_prompt = tidy([panel.negative_prompt || "", NEGATIVE_JIGSAW, "same location as previous day, repeated six-location itinerary"].filter(Boolean).join(", "));
    const current = stripPriorLocks(panel[promptKey]);
    const front = [lock, POSE_LOCKS[index] || POSE_LOCKS[0], DIGITAL_GRID_LOCK].filter(Boolean).join(", ");
    const withBeat = beat && !current.includes(beat) ? `${current}, ${beat}` : current;
    panel[promptKey] = tidy(`${front}, ${withBeat}`);
    if (panel[promptFileKey]) fs.writeFileSync(path.join(root, panel[promptFileKey]), `${panel[promptKey]}\n`, "utf8");
  }
  data.story_beat_enabled = true;
  data.scene_lock_front_loaded = true;
  data.jigsaw_ban_enabled = true;
  data.digital_grid_lock = DIGITAL_GRID_LOCK;
  data.location_flow_id = story.location_flow_id || "unknown";
  data.location_flow_method = story.location_flow_method || "unknown";
  data.story_source_used = story.story_source_used || (story.date === date ? `daily/${date}.json` : "latest.json");
  data.story_fields_used = story.story_fields_used || [];
  data.storyboard_copy_source = story.storyboard_copy_source || "unknown";
  data.storyboard_arc_type = story.storyboard_arc_type || "story_driven_not_location_driven";
  data.storyboard_arc = story.storyboard_arc || {};
  data.storyboard_quality = story.storyboard_quality || {};
  writeJson(file, data);
}

console.log(`Story beats and rotated-location scene locks appended to panel generation text: ${story.location_flow_id || "unknown"}`);
