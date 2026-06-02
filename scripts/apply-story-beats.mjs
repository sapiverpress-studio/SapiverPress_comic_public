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

const DIGITAL_GRID_LOCK = "DIGITAL PUZZLE LOCK: puzzle means a Sudoku or Trigoku grid on a laptop screen only when panel_screen_state allows it; no physical puzzle props, no jigsaw pieces, no cardboard pieces, no board-game tokens, no loose puzzle shapes on the desk";
const NEGATIVE_JIGSAW = "jigsaw pieces, physical puzzle pieces, cardboard puzzle pieces, board game pieces, loose cardboard puzzle shapes, scattered game tiles, tabletop jigsaw, wooden puzzle pieces, tangram pieces, loose game pieces";
const TEXT_PACK = "READABLE PROP TEXT PACK: use a few coherent readable text details only where natural: Small steps. Big impact.; Progress over perfection.; One page at a time.; Focus. Solve. Grow.; Lead with intention.; One win at a time.; Puzzle Therapy; Logic & Pattern; Word Wise; The Focus Habit; Daily Clarity; Small Wins Journal";

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeJson(file, data) { fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
function tidy(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function sceneStoryBeat(scene) { return tidy(scene.image_prompt_fragment || scene.scene_description || scene.storyboard_caption || scene.caption || scene.beat || scene.title || ""); }
function stripPriorLocks(text) {
  return tidy(text)
    .replace(/PANEL \d LOCATION LOCK:[^,]+(?:,[^,]+){0,18}/gi, "")
    .replace(/ACTION LOCK:[^,]+(?:,[^,]+){0,12}/gi, "")
    .replace(/POSE FAMILY LOCK:[^,]+(?:,[^,]+){0,10}/gi, "")
    .replace(/SCREEN STATE LOCK:[^,]+(?:,[^,]+){0,12}/gi, "")
    .replace(/DIGITAL PUZZLE LOCK:[^,]+(?:,[^,]+){0,12}/gi, "")
    .replace(/READABLE PROP TEXT PACK:[^,]+(?:,[^,]+){0,16}/gi, "")
    .replace(/^,\s*/, "");
}
function cleanStoryBeat(beat) {
  return tidy(beat)
    .replace(/\bpuzzle pieces\b/gi, "grid entries")
    .replace(/\bpieces\b/gi, "numbers")
    .replace(/\bfit into place\b/gi, "resolve cleanly")
    .replace(/\bfall into place\b/gi, "resolve cleanly");
}

function sceneLock(scene, index) {
  const setting = tidy(scene.panel_location || scene.setting || scene.location_label || "daily-life table");
  const pose = tidy(scene.panel_pose_family || "");
  const screen = tidy(scene.panel_screen_state || "");
  const lower = `${setting} ${pose} ${screen}`.toLowerCase();
  if (pose === "standing_packing") return `PANEL ${index + 1} LOCATION LOCK: ${setting}, unmistakable home kitchen or entry area, domestic cupboards or hallway surface, travel mug and rucksack visible, not seated, not office, not train, no active puzzle`;
  if (pose === "standing_waiting") return `PANEL ${index + 1} LOCATION LOCK: ${setting}, unmistakable railway platform, platform edge markings, station signs, platform bench or rail cues, bag over shoulder, not train interior, not office, no active puzzle`;
  if (pose === "seated_train_start") return `PANEL ${index + 1} LOCATION LOCK: ${setting}, unmistakable train interior, train window, seat backs, compact train table, passing view outside, not platform, not generic desk`;
  if (lower.includes("bookshop")) return `PANEL ${index + 1} LOCATION LOCK: ${setting}, visible bookshelves and readable book spines, display table, warm shop lighting, stacks of books nearby, not garden, not generic desk`;
  if (lower.includes("cowork") || lower.includes("office")) return `PANEL ${index + 1} LOCATION LOCK: ${setting}, modern working environment, glass partitions or notice board, office chair, other desks blurred behind, not home kitchen`;
  if (lower.includes("rain") || lower.includes("window nook")) return `PANEL ${index + 1} LOCATION LOCK: ${setting}, rain streaks on glass, wet street or grey light outside, plants on sill, reflective ending scene, not office`;
  return `PANEL ${index + 1} LOCATION LOCK: ${setting}, visually distinct from every other panel, specific environmental props visible, not generic indoor desk`;
}

function actionLock(scene) {
  const action = tidy(scene.panel_action || scene.scene_description || "story action must be visible");
  return `ACTION LOCK: ${action}`;
}

function poseLock(scene) {
  const pose = tidy(scene.panel_pose_family || "varied_pose");
  const rules = {
    standing_packing: "standing full or three-quarter body pose, packing bag or rucksack, hands on travel mug notebook charger or bag, not seated at laptop",
    standing_waiting: "standing or perched waiting pose, bag over shoulder or in hand, looking around platform, not seated at laptop",
    seated_train_start: "seated in train, compact posture, laptop on train table, shoulders angled with train window visible",
    leaning_focus: "forward-leaning concentration, finger near trackpad, active checking posture, different framing from train panel",
    side_pause: "side angle, mug or notebook in hand, bag nearby, relaxed shoulders, not head-on laptop pose",
    closing_up: "closing laptop or packing bag, looking away from screen toward environment, end-of-day leaving pose",
  };
  return `POSE FAMILY LOCK: ${pose}, ${rules[pose] || "visibly different body language from adjacent panels"}`;
}

function screenLock(scene) {
  const state = tidy(scene.panel_screen_state || "active_puzzle");
  const rules = {
    no_puzzle: "no puzzle visible, no laptop puzzle screen, no grid, no numbers, no solving action",
    closed_device: "device closed or mostly closed, no puzzle visible",
    first_moves: "digital Sudoku or Trigoku grid may appear on laptop screen as first move state only",
    active_puzzle: "digital Sudoku or Trigoku grid may appear on laptop screen, active checking moment",
    progress_pause: "digital grid may be present but not dominant, pause or consequence moment",
    finished_or_closing: "finished grid or closing laptop only, no active solving pose",
  };
  return `SCREEN STATE LOCK: ${state}, ${rules[state] || rules.active_puzzle}`;
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
    const locks = [sceneLock(scene, index), actionLock(scene), poseLock(scene), screenLock(scene), DIGITAL_GRID_LOCK, TEXT_PACK];
    panel.arc_role = scene.arc_role || panel.arc_role || "";
    panel.story_beat = beat;
    panel.story_beat_enabled = Boolean(beat);
    panel.storyboard_caption = tidy(scene.storyboard_caption || scene.caption || "");
    panel.storyboard_dialogue = tidy(scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || "");
    panel.panel_location = tidy(scene.panel_location || scene.setting || "");
    panel.panel_action = tidy(scene.panel_action || "");
    panel.panel_pose_family = tidy(scene.panel_pose_family || "");
    panel.panel_screen_state = tidy(scene.panel_screen_state || "");
    panel.story_source_used = story.story_source_used || (story.date === date ? `daily/${date}.json` : "latest.json");
    panel.storyboard_copy_source = story.storyboard_copy_source || "unknown";
    panel.storyboard_arc_type = story.storyboard_arc_type || "story_driven_not_location_driven";
    panel.panel_scene_lock = locks[0];
    panel.panel_pose_lock = locks[2];
    panel.screen_state_lock = locks[3];
    panel.digital_grid_lock = DIGITAL_GRID_LOCK;
    panel.readable_prop_text_pack = TEXT_PACK;
    panel.location_flow_id = story.location_flow_id || "unknown";
    panel.scene_truth_contract = story.scene_truth_contract || {};
    panel.scene_lock_front_loaded = true;
    panel.jigsaw_ban_enabled = true;
    panel.negative_prompt = tidy([panel.negative_prompt || "", NEGATIVE_JIGSAW, "same seated laptop pose in every panel, generic indoor desk, wrong location, train interior when platform requested, platform when train interior requested"].filter(Boolean).join(", "));
    const current = stripPriorLocks(panel[promptKey]);
    const front = locks.filter(Boolean).join(", ");
    const withBeat = beat && !current.includes(beat) ? `${current}, ${beat}` : current;
    panel[promptKey] = tidy(`${front}, ${withBeat}`);
    if (panel[promptFileKey]) fs.writeFileSync(path.join(root, panel[promptFileKey]), `${panel[promptKey]}\n`, "utf8");
  }
  data.story_beat_enabled = true;
  data.scene_lock_front_loaded = true;
  data.jigsaw_ban_enabled = true;
  data.digital_grid_lock = DIGITAL_GRID_LOCK;
  data.readable_prop_text_pack = TEXT_PACK;
  data.scene_truth_contract = story.scene_truth_contract || {};
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

console.log(`Story beats and scene-truth locks appended to panel generation text: ${story.location_flow_id || "unknown"}`);
