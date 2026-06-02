import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();

const FLOW_LIBRARY = [
  {
    id: "home_kitchen_day",
    tags: ["kitchen", "home", "morning", "family", "mum", "tea", "mug"],
    locations: ["home kitchen counter with mug", "small kitchen table", "kitchen window with plants", "home sofa corner", "home desk nook", "home entry table"],
    actions: ["making tea and clearing a small space", "reading a message before opening the day", "starting the grid after the first chore is done", "leaning in to check the puzzle rule properly", "standing to reset with notebook in hand", "closing the laptop and leaving the room tidy"],
    poses: ["standing_home_reset", "seated_message_reaction", "seated_start", "leaning_focus", "standing_pause", "closing_up"],
    screens: ["no_puzzle", "closed_device", "first_moves", "active_puzzle", "progress_pause", "finished_or_closing"]
  },
  {
    id: "bedroom_reset_day",
    tags: ["bedroom", "tired", "late", "sleep", "reset", "slow"],
    locations: ["bedroom chair beside neatly made bed", "bedroom dresser with mug and notebook", "bedroom window seat", "small bedside writing surface", "wardrobe mirror area with tote bag", "bedroom doorway with laptop closing"],
    actions: ["folding yesterday's hoodie and clearing the chair", "checking a message while choosing what to carry", "opening the puzzle after the room is calmer", "leaning forward to test one rule before getting ready", "placing notebook into a tote bag", "closing the laptop before leaving the bedroom"],
    poses: ["standing_tidying", "standing_choosing_bag", "seated_bedroom_start", "leaning_focus", "side_bag_pause", "closing_up"],
    screens: ["no_puzzle", "no_puzzle", "first_moves", "active_puzzle", "progress_pause", "finished_or_closing"]
  },
  {
    id: "hotel_room_followon",
    tags: ["hotel", "room", "away", "yesterday", "overnight", "travel", "trip"],
    locations: ["hotel room desk with overnight bag", "hotel kettle corner", "hotel window table", "hotel lobby side table", "station cafe after checkout", "hotel room doorway with bag packed"],
    actions: ["checking the overnight bag before checkout", "making instant coffee while reading yesterday's note", "opening the grid at the hotel window", "checking the rule before leaving the lobby", "pausing with receipt and room key beside the notebook", "packing the last charger into the bag"],
    poses: ["standing_packing", "standing_kettle_pause", "seated_hotel_start", "leaning_focus", "side_receipt_pause", "closing_up"],
    screens: ["no_puzzle", "no_puzzle", "first_moves", "active_puzzle", "progress_pause", "finished_or_closing"]
  },
  {
    id: "morning_walk_dog_day",
    tags: ["walk", "dog", "park", "outside", "early", "morning"],
    locations: ["home entry table with walking shoes", "early morning pavement or park path", "park bench with tote bag", "home kitchen after the walk", "window desk with raincoat nearby", "front door area with lead and bag put away"],
    actions: ["picking up keys and a dog lead before leaving", "walking before the day gets loud", "sitting briefly on a bench before opening the puzzle", "checking the active rule back at the kitchen table", "writing one note while the coat dries", "putting the bag down and closing the laptop"],
    poses: ["standing_keys_lead", "walking_outside", "seated_bench_start", "leaning_focus", "side_note_taking", "closing_up"],
    screens: ["no_puzzle", "no_puzzle", "first_moves", "active_puzzle", "progress_pause", "finished_or_closing"]
  },
  {
    id: "mailing_errand_day",
    tags: ["mail", "post", "package", "parcel", "errand", "envelope", "shop"],
    locations: ["home table with envelopes and tote bag", "street outside the post office", "post office queue side table", "cafe table after the errand", "shop counter with receipt", "home table with empty tote bag"],
    actions: ["checking envelopes before leaving", "holding the parcel while deciding what can wait", "opening the puzzle after the queue moves", "checking the rule once the errand is done", "holding the receipt beside the notebook", "closing the laptop after the parcel is sent"],
    poses: ["standing_checking_list", "standing_parcel_wait", "seated_queue_start", "leaning_focus", "side_receipt_pause", "closing_up"],
    screens: ["no_puzzle", "no_puzzle", "first_moves", "active_puzzle", "progress_pause", "finished_or_closing"]
  },
  {
    id: "weekend_no_work_day",
    tags: ["weekend", "saturday", "sunday", "no work", "off", "rest", "rave", "tv", "film"],
    locations: ["home kitchen late morning", "sofa with blanket and mug", "living room coffee table", "bookshop cafe corner", "window seat with notebook", "living room evening light with laptop closing"],
    actions: ["starting late without checking work messages", "choosing rest before opening the laptop", "opening the grid on the coffee table", "checking the rule without a deadline attached", "pausing with mug and notebook while the room stays still", "closing the laptop before the evening plan"],
    poses: ["standing_late_morning", "seated_sofa_message", "seated_low_table_start", "leaning_focus", "side_mug_pause", "closing_up"],
    screens: ["no_puzzle", "closed_device", "first_moves", "active_puzzle", "progress_pause", "finished_or_closing"]
  },
  {
    id: "commute_day",
    tags: ["train", "platform", "travel", "commute", "station"],
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
    tags: ["cafe", "errand", "street", "waiter", "coffee"],
    locations: ["home kitchen counter with tote bag", "outdoor street on the way to the cafe", "outdoor cafe street table", "small cafe table by the window", "shop counter or receipt table", "home window nook in evening light"],
    actions: ["checking the list before leaving", "pausing outside while deciding what can wait", "starting the puzzle beside a coffee", "checking the rule before replying to a message", "holding a receipt and notebook after the move holds", "closing the day with the bag set down"],
    poses: ["standing_checking_list", "standing_street_pause", "seated_cafe_start", "leaning_focus", "side_receipt_pause", "closing_up"],
    screens: ["no_puzzle", "no_puzzle", "first_moves", "active_puzzle", "progress_pause", "finished_or_closing"]
  },
  {
    id: "work_pressure_day",
    tags: ["work", "meeting", "deadline", "calendar", "colleague"],
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

function dayInfo(date) {
  const d = new Date(`${date}T12:00:00Z`);
  return { weekday: d.getUTCDay(), isWeekend: d.getUTCDay() === 0 || d.getUTCDay() === 6 };
}

function historyEntries(characterFile, date) {
  const raw = Array.isArray(characterFile?.story_history) ? characterFile.story_history : Array.isArray(characterFile?.weeks) ? characterFile.weeks : [];
  return raw.filter((entry) => entry?.date && entry.date !== date).slice(-10);
}

function compactHistoryText(entries) {
  return clean(entries.slice(-3).map((entry) => [entry.date, entry.story_note, entry.continuation_note, entry.setting, entry.location_flow_id, entry.supporting_life_trigger?.type, entry.life_memory_entry?.tomorrow_setup, entry.tomorrow_setup].filter(Boolean).join(" ")).join(" ")).toLowerCase();
}

function storyText(story, continuityText) {
  return clean([
    story.story_note,
    story.continuation_note,
    story.storyboard_arc_title,
    story.selected_setting,
    story.location_flow_id,
    story.supporting_life_trigger?.type,
    story.supporting_life_trigger?.sender,
    story.life_memory_entry?.tomorrow_setup,
    story.tomorrow_setup,
    continuityText,
    ...(Array.isArray(story.scenes) ? story.scenes.flatMap((scene) => [scene.panel_location, scene.setting, scene.scene_description, scene.caption, scene.storyboard_caption]) : [])
  ].filter(Boolean).join(" ")).toLowerCase();
}

function calendarPreferredFlowIds(story) {
  const values = [
    ...(Array.isArray(story.calendar_preferred_flows) ? story.calendar_preferred_flows : []),
    ...(Array.isArray(story.calendar_context?.preferred_flows) ? story.calendar_context.preferred_flows : []),
  ].filter(Boolean);
  return new Set(values);
}

function chooseFlow(story, date, history) {
  const info = dayInfo(date);
  const continuityText = compactHistoryText(history);
  const text = storyText(story, continuityText);
  const recentFlowIds = new Set(history.slice(-4).map((entry) => entry.location_flow_id || entry.life_memory_entry?.scene_truth_contract?.mode).filter(Boolean));
  const calendarPreferred = calendarPreferredFlowIds(story);
  const scored = FLOW_LIBRARY.map((flow) => {
    let score = 0;
    for (const tag of flow.tags) if (text.includes(tag)) score += 4;
    if (calendarPreferred.has(flow.id)) score += 30;
    if (flow.id === story.location_flow_id) score += 8;
    if (recentFlowIds.has(flow.id)) score -= calendarPreferred.has(flow.id) ? 1 : 4;
    if (info.isWeekend && flow.id === "weekend_no_work_day") score += 6;
    if (info.isWeekend && flow.id === "work_pressure_day" && !text.includes("work")) score -= 8;
    if (text.includes("tomorrow") && (text.includes("hotel") || text.includes("travel")) && flow.id === "commute_day") score += 4;
    if (continuityText.includes("hotel") && flow.id === "hotel_room_followon") score += 7;
    if (continuityText.includes("dog") && flow.id === "morning_walk_dog_day") score += 7;
    return { flow, score, calendarPreferred: calendarPreferred.has(flow.id) };
  }).sort((a, b) => b.score - a.score);
  if (scored[0]?.score > 0) {
    const reason = scored[0].calendarPreferred ? "calendar_preferred_flow" : "continuity_story_keyword_match";
    return { ...scored[0].flow, reason, score: scored[0].score };
  }
  const index = stableIndex(`${date}-${story.supporting_life_trigger?.type || "none"}-${variantName(story)}-${continuityText}`, FLOW_LIBRARY.length);
  return { ...FLOW_LIBRARY[index], reason: "date_seeded_variety", score: 0 };
}

function existingTrigger(story) {
  const trigger = story.supporting_life_trigger || {};
  if (trigger.enabled && trigger.sender && trigger.message && trigger.panel) return trigger;
  return { enabled: false, reason: "no_story_trigger" };
}

function locationBucket(text) {
  const v = clean(text).toLowerCase();
  if (/train carriage|on the train|train interior|rail carriage/.test(v)) return "train";
  if (/platform|station platform|railway platform/.test(v)) return "platform";
  if (/hotel|lobby|checkout|room key/.test(v)) return "hotel";
  if (/library|reading room|borrowed books/.test(v)) return "library";
  if (/bookshop|book shop|book shelves|book spines/.test(v)) return "bookshop";
  if (/cafe|café|coffee|receipt|waiter/.test(v)) return "cafe";
  if (/office|co-working|coworking|meeting|work/.test(v)) return "work";
  if (/bedroom|bedside|wardrobe|dresser/.test(v)) return "bedroom";
  if (/park|walk|dog|pavement|outside/.test(v)) return "outside_walk";
  if (/post office|parcel|envelope|mail/.test(v)) return "mailing";
  if (/home|kitchen|sofa|living room|entry table/.test(v)) return "home";
  return "other";
}

function textMentionsBucket(text) {
  return locationBucket(text);
}

function copyMatchesLocation(scene, panelLocation) {
  const copy = clean([scene.storyboard_caption, scene.caption, scene.storyboard_dialogue, scene.dialogue, scene.speech_bubble].filter(Boolean).join(" "));
  if (!copy) return false;
  const copyBucket = textMentionsBucket(copy);
  if (copyBucket === "other") return true;
  const locBucket = locationBucket(panelLocation);
  if (locBucket === "other") return true;
  if (copyBucket === locBucket) return true;
  if (locBucket === "home" && ["bedroom"].includes(copyBucket)) return true;
  return false;
}

function shouldPreserveCopy(scene, panelLocation) {
  const hasCopy = Boolean(scene.storyboard_caption || scene.caption || scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble);
  return hasCopy && copyMatchesLocation(scene, panelLocation);
}

function fallbackCaption(flow, index, variant) {
  const lines = ["Isla lets the day show her what has to come first.", "The interruption changes the timing, not the whole shape of her morning.", "She waits for the first move that proves itself.", `${variant} changes the move, so Isla checks the rule before trusting it.`, "The checked move holds, and the rest of the day has more room.", "She closes the laptop with one decision carried forward."];
  return lines[index] || flow.actions[index] || "Isla follows the next small decision.";
}
function fallbackDialogue(index, variant) {
  const lines = ["First things first.", "I can answer that properly later.", "Start where it proves itself.", `${variant} first. Then the move.`, "That one holds.", "Leave it there. Move on."];
  return lines[index] || "One thing at a time.";
}
function screenForScene(scene, flow, index) {
  return flow.screens[index] || clean(scene.panel_screen_state) || (index < 2 ? "no_puzzle" : index === 2 ? "first_moves" : index === 3 ? "active_puzzle" : index === 5 ? "finished_or_closing" : "progress_pause");
}
function poseForScene(scene, flow, index) { return flow.poses[index] || clean(scene.panel_pose_family) || ["standing_start", "standing_waiting", "seated_start", "leaning_focus", "side_pause", "closing_up"][index]; }
function locationForScene(scene, flow, index) { return flow.locations[index] || clean(scene.panel_location || scene.setting || scene.location_label) || "specific daily-life location"; }
function actionForScene(scene, flow, index) { return flow.actions[index] || clean(scene.panel_action) || clean(scene.scene_description || scene.beat || "visible daily action"); }

function tomorrowSetupForFlow(flow) {
  const map = {
    hotel_room_followon: "Tomorrow may begin with checkout, station travel, or the return home.",
    commute_day: "Tomorrow may follow from where the commute left her: work, home, or a delayed errand.",
    morning_walk_dog_day: "Tomorrow can reference whether the early walk helped or changed the morning pace.",
    mailing_errand_day: "Tomorrow can pick up the result of the errand or the space it created.",
    weekend_no_work_day: "Tomorrow should avoid unnecessary work pressure unless a real trigger demands it.",
    work_pressure_day: "Tomorrow can show recovery from work pressure or preparation before the next meeting.",
    library_day: "Tomorrow can use the borrowed book, returned note, or reading-room idea.",
    bookshop_weekend_day: "Tomorrow can carry forward the book she chose or the reason she did not buy one.",
    bedroom_reset_day: "Tomorrow can show whether the reset helped her leave on time.",
    home_kitchen_day: "Tomorrow can start from the domestic detail she left prepared today."
  };
  return map[flow.id] || `Tomorrow should follow naturally from ${flow.id}.`;
}

function applyTruth(story, date, history) {
  const variant = variantName(story);
  const flow = chooseFlow(story, date, history);
  const trigger = existingTrigger(story);
  const previous = history.at(-1) || null;
  story.supporting_cast_policy = { ...(story.supporting_cast_policy || {}), isla_only_main_character: true, overlay_only: true, no_extra_faces: true, no_visible_supporting_character: true };
  story.scene_truth_contract = { enabled: true, mode: flow.id, selection_reason: flow.reason, score: flow.score, applied_at: new Date().toISOString(), fixed_sequence: false, story_led: true, continuity_aware: true, caption_location_guard: true, flow_enforced: true };
  story.story_continuity = { previous_day_used: previous ? { date: previous.date, story_note: previous.story_note || "", flow_id: previous.location_flow_id || previous.life_memory_entry?.scene_truth_contract?.mode || "" } : null, tomorrow_setup: tomorrowSetupForFlow(flow), weekend_logic: dayInfo(date).isWeekend ? "weekend: avoid work-led story unless story explicitly requires it" : "weekday" };
  story.continuation_note = clean(`${story.continuation_note || ""} Image truth follows today's continuity-aware story flow (${flow.id}); tomorrow setup: ${story.story_continuity.tomorrow_setup}`).slice(0, 950);
  story.location_flow_id = flow.id;
  story.location_flow_method = `scene_truth_contract_${flow.reason}`;

  const scenes = Array.isArray(story.scenes) ? story.scenes : [];
  while (scenes.length < 6) scenes.push({ id: `scene_${String(scenes.length + 1).padStart(2, "0")}` });
  const normalisedCopyPanels = [];
  story.scenes = scenes.slice(0, 6).map((scene, index) => {
    const panel_location = locationForScene(scene, flow, index);
    const panel_action = actionForScene(scene, flow, index);
    const panel_pose_family = poseForScene(scene, flow, index);
    const panel_screen_state = screenForScene(scene, flow, index);
    const triggerHere = trigger.enabled && Number(trigger.panel) === index + 1;
    const preserveCopy = shouldPreserveCopy(scene, panel_location);
    if (!preserveCopy && (scene.storyboard_caption || scene.caption || scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble)) normalisedCopyPanels.push(index + 1);
    const caption = preserveCopy ? clean(scene.storyboard_caption || scene.caption) : fallbackCaption(flow, index, variant);
    const dialogue = preserveCopy ? (clean(scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble) || fallbackDialogue(index, variant)) : fallbackDialogue(index, variant);
    return { ...scene, panel_location, setting: panel_location, location_label: panel_location, panel_action, panel_pose_family, panel_screen_state, scene_truth_locked: true, scene_truth_flow_id: flow.id, caption, dialogue, speech_bubble: dialogue, storyboard_caption: caption, storyboard_dialogue: dialogue, storyboard_panel_text: `${dialogue}\n${caption}`, scene_description: clean(`${panel_location}. ${panel_action}. ${caption}${triggerHere ? ` Overlay from ${trigger.sender}: ${trigger.message}.` : ""}`).slice(0, 700), image_prompt_fragment: clean(`${panel_action}, ${panel_pose_family}, ${panel_screen_state}${triggerHere ? ", notices phone notification, no extra visible person" : ""}`).slice(0, 520), supporting_life_trigger_here: triggerHere, supporting_life_trigger: triggerHere ? trigger : undefined };
  });

  story.scene_truth_contract.normalised_copy_panels = normalisedCopyPanels;
  story.storyboard_locations = story.scenes.map((scene) => scene.panel_location);
  story.location_flow = story.storyboard_locations.map((location) => location.split(" ").slice(0, 3).join(" "));
  story.storyboard_arc = Object.fromEntries(["setup", "disruption", "choice", "puzzle_moment", "consequence", "resolution"].map((key, i) => [key, story.scenes[i].storyboard_caption]));
  story.storyboard_quality = { ...(story.storyboard_quality || {}), location_sequence_only: false, has_cause_effect: true, has_character_turn: true, uses_phase2_story: true, scene_truth_locked: true, story_led_scene_truth: true, continuity_aware: true, caption_location_guard: true };
  story.life_memory_entry = story.life_memory_entry || { date: story.date };
  story.life_memory_entry.supporting_life_trigger = trigger;
  story.life_memory_entry.scene_truth_contract = story.scene_truth_contract;
  story.life_memory_entry.tomorrow_setup = story.story_continuity.tomorrow_setup;
  story.image_manifest = story.image_manifest || {};
  story.image_manifest.supporting_life_trigger = trigger;
  story.image_manifest.supporting_cast_policy = story.supporting_cast_policy;
  story.image_manifest.scene_truth_contract = story.scene_truth_contract;
  story.image_manifest.story_continuity = story.story_continuity;
  story.image_manifest.storyboard_locations = story.storyboard_locations;
  story.image_manifest.location_flow = story.location_flow;
  story.image_manifest.scenes = story.scenes.map((scene, index) => ({ panel: index + 1, panel_location: scene.panel_location, panel_action: scene.panel_action, panel_pose_family: scene.panel_pose_family, panel_screen_state: scene.panel_screen_state }));
  return { story, flow };
}

async function main() {
  const date = dateString();
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);
  const characterFile = await readJson("characters/isla.json", {});
  const history = historyEntries(characterFile, date);
  const result = applyTruth(story, date, history);
  await writeJson(`daily/${date}.json`, result.story);
  await writeJson("latest.json", result.story);
  await writeJson(`image-manifests/${date}.json`, result.story.image_manifest);
  console.log(`Scene truth contract applied: ${result.flow.id} (${result.flow.reason}, score ${result.flow.score})`);
}
main().catch((error) => { console.error(error); process.exit(1); });
