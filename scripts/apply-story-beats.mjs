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

const PANEL_LOCKS = [
  "PANEL 1 LOCATION LOCK: home kitchen table, kettle, breakfast mug, cupboards or fridge visible, domestic morning light, not office, not library",
  "PANEL 2 LOCATION LOCK: train carriage interior, train window, seat backs, luggage rack, compact train table, passing landscape outside, not office, not home",
  "PANEL 3 LOCATION LOCK: outdoor pavement cafe table, street background, shopfronts, cafe awning or railings, daylight outside, phone face down, not indoor desk",
  "PANEL 4 LOCATION LOCK: co-working workspace, glass partitions, meeting room window, office chair, other desks blurred behind, not home kitchen",
  "PANEL 5 LOCATION LOCK: bookshop cafe corner, visible book shelves and book spines, display table, stacks of books, warm shop lighting, not garden",
  "PANEL 6 LOCATION LOCK: rainy window nook, rain streaks on glass, wet street outside, plants on sill, closing laptop ending pose, not office",
];

const POSE_LOCKS = [
  "POSE LOCK: seated opening laptop, one hand on laptop lid, front three-quarter view",
  "POSE LOCK: bracing laptop on train table, glance toward train window, shoulders angled away from normal desk pose",
  "POSE LOCK: phone ignored face down, one hand away from phone, cafe table posture",
  "POSE LOCK: leaning forward for active digital-grid check, finger near trackpad, hands clear of screen",
  "POSE LOCK: holding mug or notebook beside book stack, side angle, relaxed shoulders",
  "POSE LOCK: packing up or closing laptop, looking away from screen toward rainy window",
];

const DIGITAL_GRID_LOCK = "DIGITAL PUZZLE LOCK: puzzle means Sudoku or Trigoku grid on the laptop screen only, no physical puzzle props, no jigsaw pieces, no cardboard pieces, no board-game tokens, no loose puzzle shapes on the desk";
const NEGATIVE_JIGSAW = "jigsaw pieces, physical puzzle pieces, cardboard puzzle pieces, loose game pieces, board game tiles, tangram pieces, scattered puzzle shapes on desk";

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeJson(file, data) { fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
function tidy(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function sceneStoryBeat(scene) { return tidy(scene.image_prompt_fragment || scene.scene_description || scene.storyboard_caption || scene.caption || scene.beat || scene.title || ""); }
function stripPriorLocks(text) { return tidy(text).replace(/PANEL \d LOCATION LOCK:[^,]+(?:,[^,]+){0,8}/gi, "").replace(/POSE LOCK:[^,]+(?:,[^,]+){0,5}/gi, "").replace(/DIGITAL PUZZLE LOCK:[^,]+(?:,[^,]+){0,8}/gi, "").replace(/^,\s*/, ""); }
function cleanStoryBeat(beat) { return tidy(beat).replace(/\bpuzzle pieces\b/gi, "grid entries").replace(/\bpieces\b/gi, "numbers").replace(/\bfit into place\b/gi, "resolve cleanly").replace(/\bfall into place\b/gi, "resolve cleanly"); }

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
    panel.arc_role = scene.arc_role || panel.arc_role || "";
    panel.story_beat = beat;
    panel.story_beat_enabled = Boolean(beat);
    panel.storyboard_caption = tidy(scene.storyboard_caption || scene.caption || "");
    panel.storyboard_dialogue = tidy(scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || "");
    panel.story_source_used = story.story_source_used || (story.date === date ? `daily/${date}.json` : "latest.json");
    panel.storyboard_copy_source = story.storyboard_copy_source || "unknown";
    panel.storyboard_arc_type = story.storyboard_arc_type || "story_driven_not_location_driven";
    panel.panel_scene_lock = PANEL_LOCKS[index] || "";
    panel.panel_pose_lock = POSE_LOCKS[index] || "";
    panel.digital_grid_lock = DIGITAL_GRID_LOCK;
    panel.scene_lock_front_loaded = true;
    panel.jigsaw_ban_enabled = true;
    panel.negative_prompt = tidy([panel.negative_prompt || "", NEGATIVE_JIGSAW].filter(Boolean).join(", "));
    const current = stripPriorLocks(panel[promptKey]);
    const front = [PANEL_LOCKS[index], POSE_LOCKS[index], DIGITAL_GRID_LOCK].filter(Boolean).join(", ");
    const withBeat = beat && !current.includes(beat) ? `${current}, ${beat}` : current;
    panel[promptKey] = tidy(`${front}, ${withBeat}`);
    if (panel[promptFileKey]) fs.writeFileSync(path.join(root, panel[promptFileKey]), `${panel[promptKey]}\n`, "utf8");
  }
  data.story_beat_enabled = true;
  data.scene_lock_front_loaded = true;
  data.jigsaw_ban_enabled = true;
  data.digital_grid_lock = DIGITAL_GRID_LOCK;
  data.story_source_used = story.story_source_used || (story.date === date ? `daily/${date}.json` : "latest.json");
  data.story_fields_used = story.story_fields_used || [];
  data.storyboard_copy_source = story.storyboard_copy_source || "unknown";
  data.storyboard_arc_type = story.storyboard_arc_type || "story_driven_not_location_driven";
  data.storyboard_arc = story.storyboard_arc || {};
  data.storyboard_quality = story.storyboard_quality || {};
  writeJson(file, data);
}

console.log("Story beats, front-loaded scene locks, and digital-grid-only puzzle locks appended to panel generation text.");
