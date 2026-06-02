import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();

const FLOW_LIBRARY = [
  {
    id: "home_focus_day",
    tags: ["home", "family", "rain", "slow"],
    locations: ["home kitchen table", "home sofa corner", "window desk at home", "small home office nook", "kitchen counter with mug", "home entry table"],
    actions: ["making tea and clearing a small space", "reading a message before opening the day", "starting the grid after the first chore is done", "leaning in to check the rule properly", "standing to reset with notebook in hand", "closing the laptop and leaving the room tidy"],
    poses: ["standing_home_reset", "seated_message_reaction", "seated_start", "leaning_focus", "standing_pause", "closing_up"],
    screens: ["no_puzzle", "closed_device", "first_moves", "active_puzzle", "progress_pause", "finished_or_closing"]
  },
  {
    id: "commute_day",
    tags: ["train", "platform", "travel", "commute"],
    locations: ["home kitchen or home entry table", "unmistakable railway platform waiting area", "inside a train carriage at a window table", "co-working desk near a tall window", "bookshop cafe corner with shelves and warm table light", "rainy window nook with plants and bag nearby"],
    actions: ["packing travel mug, notebook and charger into a rucksack or tote bag before leaving", "waiting on the platform with bag over shoulder, checking the space around her", "opening the laptop on the train and making the first careful puzzle moves", "leaning forward to check the active puzzle constraint before trusting the move", "pausing beside notebook and mug after the checked move holds", "closing the laptop and packing up at the end of the day"],
    poses: ["standing_packing", "standing_waiting", "seated_train_start", "leaning_focus", "side_pause", "closing_up"],
    screens: ["no_puzzle", "no_puzzle", "first_moves", "active_puzzle", "progress_pause", "finished_or_closing"]
  },
  {
    id: "library_day",
    tags: ["library", "book", "study", "reading"],
    locations: ["home table with library books", "public library entrance table", "library reading desk between bookshelves", "library window seat", "bookshop cafe corner", "home sofa with borrowed books nearby"],
    actions: ["gathering books and notebook before leaving", "checking opening times and deciding where to sit", "opening the laptop beside a stack of books", "checking the puzzle rule with a pencil beside the notebook", "copying one useful thought into the notebook", "closing the laptop and stacking the books to return"],
    poses: ["standing_gathering_books", "standing_arrival", "seated_library_start", "leaning_focus", "side_note_taking", "closing_up"],
    screens: ["no_puzzle", "no_puzzle", "first_moves", "active_puzzle", "progress_pause", "finished_or_closing"]
  },
  {
    id: "cafe_errand_day",
    tags: ["cafe", "errand", "street", "waiter"],
    locations: ["home kitchen counter with tote bag", "outdoor street on the way to the cafe", "outdoor cafe street table", "small cafe table by the window", "shop counter or receipt table", "home window nook in evening light"],
    actions: ["checking the list before leaving", "pausing outside while deciding what can wait", "starting the puzzle beside a coffee", "checking the rule before replying to a message", "holding a receipt and notebook after the move holds", "closing the day with the bag set down"],
    poses: ["standing_checking_list", "standing_street_pause", "seated_cafe_start", "leaning_focus", "side_receipt_pause", "closing_up"],
    screens: ["no_puzzle", "no_puzzle", "first_moves", "active_puzzle", "progress_pause", "finished_or_closing"]
  },
  {
    id: "work_pressure_day",
    tags: ["work", "meeting", "deadline", "calendar"],
    locations: ["home desk before work", "co-working lobby table", "co-working desk near glass partitions", "meeting-room side table", "office break area with mug", "train or home window after work"],
    actions: ["checking the day plan before the first message lands", "arriving with laptop tucked under one arm", "opening the grid before the work question takes over", "using the puzzle rule as a boundary before the meeting", "taking a short notebook pause after the checked move", "packing up after work with the laptop closing"],
    poses: ["standing_day_plan", "standing_arrival", "seated_work_start", "leaning_focus", "side_pause", "closing_up"],
    screens: ["closed_device", "no_puzzle", "first_moves", "active_puzzle", "progress_pause", "finished_or_closing"]
  },
  {
    id: "bookshop_weekend_day",
    tags: ["bookshop", "weekend", "shop", "reading"],
    locations: ["home shelf with tote bag", "bookshop front table by new releases", "bookshop cafe corner", "reading chair near book shelves", "rainy shop window table", "home table with new book and closed laptop"],
    actions: ["choosing what to carry for the morning", "browsing the front table before sitting down", "opening the grid beside a new book", "checking the puzzle rule with book spines behind her", "holding the book while the puzzle waits", "closing the laptop beside the new book"],
    poses: ["standing_choosing_bag", "standing_browsing", "seated_bookshop_start", "leaning_focus", "side_book_pause", "closing_up"],
    screens: ["no_puzzle", "no_puzzle", "first_moves", "active_puzzle", "progress_pause", "finished_or_closing"]
  }
];

function dateString() {
  return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
async function readJson(rel, fallback = null) { try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fallback; } }
async function writeJson(rel, data) { const file = path.join(ROOT, rel); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
function stableIndex(seed, length) { let hash = 2166136261; for (const ch of String(seed || "")) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0) % Math.max(1, length); }
function variantName(story) { return clean(story?.required_puzzle_copy?.variant_name || story?.variant_recap?.variant_name || story?.puzzle_state?.variant_recap?.variant_name || "today's rule") || "today's rule"; }

function storyText(story) {
  return clean([
    story.story_note,
    story.continuation_note,
    story.storyboard_arc_title,
    story.selected_setting,
    story.location_flow_id,
    story.supporting_life_trigger?.type,
    story.supporting_life_trigger?.sender,
    ...(Array.isArray(story.scenes) ? story.scenes.flatMap((scene) => [scene.panel_location, scene.setting, scene.scene_description, scene.caption, scene.storyboard_caption]) : [])
  ].filter(Boolean).join(" ")).toLowerCase();
}

function chooseFlow(story, date) {
  const text = storyText(story);
  const scored = FLOW_LIBRARY.map((flow) => {
    let score = 0;
    for (const tag of flow.tags) if (text.includes(tag)) score += 3;
    if (flow.id === story.location_flow_id) score += 5;
    return { flow, score };
  }).sort((a, b) => b.score - a.score);
  if (scored[0]?.score > 0) return { ...scored[0].flow, reason: "story_keyword_match" };
  const index = stableIndex(`${date}-${story.supporting_life_trigger?.type || "none"}-${variantName(story)}`, FLOW_LIBRARY.length);
  return { ...FLOW_LIBRARY[index], reason: "date_seeded_variety" };
}

function existingTrigger(story) {
  const trigger = story.supporting_life_trigger || {};
  if (trigger.enabled && trigger.sender && trigger.message && trigger.panel) return trigger;
  return { enabled: false, reason: "no_story_trigger" };
}

function shouldPreserveCopy(scene) {
  return Boolean(scene.storyboard_caption || scene.caption || scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble);
}

function fallbackCaption(flow, index, variant) {
  const lines = [
    "Isla lets the day show her what has to come first.",
    "The interruption changes the timing, not the whole shape of her morning.",
    "She waits for the first move that proves itself.",
    `${variant} changes the move, so Isla checks the rule before trusting it.`,
    "The checked move holds, and the rest of the day has more room.",
    "She closes the laptop with one decision carried forward."
  ];
  return lines[index] || flow.actions[index] || "Isla follows the next small decision.";
}

function fallbackDialogue(index, variant) {
  const lines = ["First things first.", "I can answer that properly later.", "Start where it proves itself.", `${variant} first. Then the move.`, "That one holds.", "Leave it there. Move on."];
  return lines[index] || "One thing at a time.";
}

function screenForScene(scene, flow, index) {
  const existing = clean(scene.panel_screen_state);
  if (["no_puzzle", "closed_device", "first_moves", "active_puzzle", "progress_pause", "finished_or_closing"].includes(existing)) return existing;
  return flow.screens[index] || (index < 2 ? "no_puzzle" : index === 2 ? "first_moves" : index === 3 ? "active_puzzle" : index === 5 ? "finished_or_closing" : "progress_pause");
}

function poseForScene(scene, flow, index) {
  return clean(scene.panel_pose_family) || flow.poses[index] || ["standing_start", "standing_waiting", "seated_start", "leaning_focus", "side_pause", "closing_up"][index];
}

function locationForScene(scene, flow, index) {
  return clean(scene.panel_location || scene.setting || scene.location_label) || flow.locations[index] || "specific daily-life location";
}

function actionForScene(scene, flow, index) {
  return clean(scene.panel_action) || flow.actions[index] || clean(scene.scene_description || scene.beat || "visible daily action");
}

function applyTruth(story, date) {
  const variant = variantName(story);
  const flow = chooseFlow(story, date);
  const trigger = existingTrigger(story);
  story.supporting_cast_policy = { ...(story.supporting_cast_policy || {}), isla_only_main_character: true, overlay_only: true, no_extra_faces: true, no_visible_supporting_character: true };
  story.scene_truth_contract = { enabled: true, mode: flow.id, selection_reason: flow.reason, applied_at: new Date().toISOString(), fixed_sequence: false, story_led: true };
  story.continuation_note = clean(`${story.continuation_note || ""} Image truth follows today's story-led flow (${flow.id}); do not reuse the same daily itinerary unless the story requires it.`).slice(0, 800);
  story.location_flow_id = flow.id;
  story.location_flow_method = `scene_truth_contract_${flow.reason}`;

  const scenes = Array.isArray(story.scenes) ? story.scenes : [];
  while (scenes.length < 6) scenes.push({ id: `scene_${String(scenes.length + 1).padStart(2, "0")}` });
  story.scenes = scenes.slice(0, 6).map((scene, index) => {
    const panel_location = locationForScene(scene, flow, index);
    const panel_action = actionForScene(scene, flow, index);
    const panel_pose_family = poseForScene(scene, flow, index);
    const panel_screen_state = screenForScene(scene, flow, index);
    const triggerHere = trigger.enabled && Number(trigger.panel) === index + 1;
    const caption = shouldPreserveCopy(scene) ? clean(scene.storyboard_caption || scene.caption) : fallbackCaption(flow, index, variant);
    const dialogue = clean(scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble) || fallbackDialogue(index, variant);
    return {
      ...scene,
      panel_location,
      setting: panel_location,
      location_label: panel_location,
      panel_action,
      panel_pose_family,
      panel_screen_state,
      scene_truth_locked: true,
      scene_truth_flow_id: flow.id,
      caption,
      dialogue,
      speech_bubble: dialogue,
      storyboard_caption: caption,
      storyboard_dialogue: dialogue,
      storyboard_panel_text: `${dialogue}\n${caption}`,
      scene_description: clean(`${panel_location}. ${panel_action}. ${caption}${triggerHere ? ` Overlay from ${trigger.sender}: ${trigger.message}.` : ""}`).slice(0, 700),
      image_prompt_fragment: clean(`${panel_action}, ${panel_pose_family}, ${panel_screen_state}${triggerHere ? ", notices phone notification, no extra visible person" : ""}`).slice(0, 520),
      supporting_life_trigger_here: triggerHere,
      supporting_life_trigger: triggerHere ? trigger : undefined
    };
  });

  story.storyboard_locations = story.scenes.map((scene) => scene.panel_location);
  story.location_flow = story.storyboard_locations.map((location) => location.split(" ").slice(0, 3).join(" "));
  story.storyboard_arc = Object.fromEntries(["setup", "disruption", "choice", "puzzle_moment", "consequence", "resolution"].map((key, i) => [key, story.scenes[i].storyboard_caption]));
  story.storyboard_quality = { ...(story.storyboard_quality || {}), location_sequence_only: false, has_cause_effect: true, has_character_turn: true, uses_phase2_story: true, scene_truth_locked: true, story_led_scene_truth: true };
  story.life_memory_entry = story.life_memory_entry || { date: story.date };
  story.life_memory_entry.supporting_life_trigger = trigger;
  story.life_memory_entry.scene_truth_contract = story.scene_truth_contract;
  story.image_manifest = story.image_manifest || {};
  story.image_manifest.supporting_life_trigger = trigger;
  story.image_manifest.supporting_cast_policy = story.supporting_cast_policy;
  story.image_manifest.scene_truth_contract = story.scene_truth_contract;
  story.image_manifest.storyboard_locations = story.storyboard_locations;
  story.image_manifest.location_flow = story.location_flow;
  story.image_manifest.scenes = story.scenes.map((scene, index) => ({ panel: index + 1, panel_location: scene.panel_location, panel_action: scene.panel_action, panel_pose_family: scene.panel_pose_family, panel_screen_state: scene.panel_screen_state }));
  return { story, flow };
}

async function main() {
  const date = dateString();
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);
  const result = applyTruth(story, date);
  await writeJson(`daily/${date}.json`, result.story);
  await writeJson("latest.json", result.story);
  await writeJson(`image-manifests/${date}.json`, result.story.image_manifest);
  console.log(`Scene truth contract applied: ${result.flow.id} (${result.flow.reason})`);
}
main().catch((error) => { console.error(error); process.exit(1); });
