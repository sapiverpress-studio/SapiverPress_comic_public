import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();

const COMMUTER_TRUTH = [
  ["home kitchen or home entry table", "packing travel mug, notebook and charger into a rucksack or tote bag before leaving", "standing_packing", "no_puzzle", "Isla packs the travel mug before the morning starts rushing her.", "Mug first. Then the train."],
  ["unmistakable railway platform waiting area", "waiting on the platform with bag over shoulder, checking the space around her", "standing_waiting", "no_puzzle", "On the platform, a family note changes the order of the morning.", "I will reply properly."],
  ["inside a train carriage at a window table", "opening the laptop on the train and making the first careful puzzle moves", "seated_train_start", "first_moves", "Once seated, she opens the grid and checks the first safe move.", "Start where it proves itself."],
  ["co-working desk near a tall window", "leaning forward to check the active puzzle constraint before trusting the move", "leaning_focus", "active_puzzle", "VARIANT changes the move, so Isla checks the rule before trusting it.", "VARIANT first. Then the move."],
  ["bookshop cafe corner with shelves and warm table light", "pausing beside notebook and mug after the checked move holds", "side_pause", "progress_pause", "The checked move holds, and the rest of the journey feels less scattered.", "That one actually holds."],
  ["rainy window nook with plants and bag nearby", "closing the laptop and packing up at the end of the day", "closing_up", "finished_or_closing", "She closes the laptop with the day back in her own order.", "Leave it there. Move on."]
];

function dateString() {
  return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
async function readJson(rel, fallback = null) { try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fallback; } }
async function writeJson(rel, data) { const file = path.join(ROOT, rel); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
function variantName(story) { return clean(story?.required_puzzle_copy?.variant_name || story?.variant_recap?.variant_name || story?.puzzle_state?.variant_recap?.variant_name || "Anti-Knight") || "Anti-Knight"; }

function defaultTrigger(story) {
  const existing = story.supporting_life_trigger || {};
  if (existing.enabled && existing.sender && existing.message && existing.panel) return existing;
  return {
    enabled: true,
    id: "family_platform_check_in",
    type: "family_text",
    sender: "Family",
    message: "Check-in note",
    panel: 2,
    overlay_style: "phone_notification",
    render_layer: "post_art_compositor_overlay",
    no_visible_supporting_character: true,
    arc_shift: "The note changes Isla's morning: she waits, replies later, and keeps the first puzzle moment for the train."
  };
}

function applyTruth(story) {
  const variant = variantName(story);
  const trigger = defaultTrigger(story);
  story.supporting_life_trigger = trigger;
  story.supporting_cast_policy = { isla_only_main_character: true, overlay_only: true, no_extra_faces: true, no_visible_supporting_character: true };
  story.scene_truth_contract = { enabled: true, mode: "commuter_home_platform_train", applied_at: new Date().toISOString() };
  story.story_note = `Isla's morning now has a concrete movement sequence: home packing, platform waiting, train puzzle start, rule check, consequence, closing up.`;
  story.continuation_note = "The images must follow action truth, not six similar laptop poses.";
  story.location_flow_id = "commuter_truth_home_platform_train";
  story.location_flow_method = "scene_truth_contract";
  story.location_flow = ["home", "platform", "train", "coworking", "bookshop", "rainy_window"];
  story.storyboard_locations = COMMUTER_TRUTH.map((row) => row[0]);

  const scenes = Array.isArray(story.scenes) ? story.scenes : [];
  while (scenes.length < 6) scenes.push({ id: `scene_${String(scenes.length + 1).padStart(2, "0")}` });
  story.scenes = scenes.slice(0, 6).map((scene, index) => {
    const [panel_location, panel_action, panel_pose_family, panel_screen_state, capRaw, diaRaw] = COMMUTER_TRUTH[index];
    const caption = capRaw.replaceAll("VARIANT", variant);
    const dialogue = diaRaw.replaceAll("VARIANT", variant);
    const triggerHere = trigger.enabled && Number(trigger.panel) === index + 1;
    return {
      ...scene,
      panel_location,
      setting: panel_location,
      location_label: panel_location,
      panel_action,
      panel_pose_family,
      panel_screen_state,
      scene_truth_locked: true,
      caption,
      dialogue,
      speech_bubble: dialogue,
      storyboard_caption: caption,
      storyboard_dialogue: dialogue,
      storyboard_panel_text: `${dialogue}\n${caption}`,
      scene_description: `${panel_location}. ${panel_action}. ${caption}${triggerHere ? ` Overlay from ${trigger.sender}: ${trigger.message}.` : ""}`,
      image_prompt_fragment: `${panel_action}, ${panel_pose_family}, ${panel_screen_state}${triggerHere ? ", notices phone notification, no extra visible person" : ""}`,
      supporting_life_trigger_here: triggerHere,
      supporting_life_trigger: triggerHere ? trigger : undefined
    };
  });
  story.storyboard_arc = Object.fromEntries(["setup", "disruption", "choice", "puzzle_moment", "consequence", "resolution"].map((key, i) => [key, story.scenes[i].storyboard_caption]));
  story.storyboard_quality = { ...(story.storyboard_quality || {}), location_sequence_only: false, has_cause_effect: true, has_character_turn: true, uses_phase2_story: true, scene_truth_locked: true };
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
  return story;
}

async function main() {
  const date = dateString();
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);
  story = applyTruth(story);
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  console.log("Scene truth contract applied: home packing, platform waiting, train first puzzle, rule check, consequence, closing up");
}
main().catch((error) => { console.error(error); process.exit(1); });
