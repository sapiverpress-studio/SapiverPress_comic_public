import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const CAFE_RE = /\b(cafe|café|coffee shop|bookshop cafe|station cafe)\b/i;
const COFFEE_RE = /\b(coffee|mug|mugs|cup|cups|latte|espresso|sip)\b/i;
const BANNED_RE = /\b(restraint|constraint|quiet|gentle|pause|anchor|ritual|understated)\b/i;

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override && !/^\d{4}-\d{2}-\d{2}$/.test(override)) throw new Error(`DATE_OVERRIDE must be YYYY-MM-DD. Received: ${override}`);
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
async function readJson(rel, fallback = null) { try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fallback; } }
async function writeJson(rel, data) { const file = path.join(ROOT, rel); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }

function fixBannedWords(text) {
  return clean(text)
    .replace(/\bthe restraint\b/gi, "the rule")
    .replace(/\brestraint\b/gi, "rule")
    .replace(/\bconstraint\b/gi, "rule")
    .replace(/\bquiet\b/gi, "steady")
    .replace(/\bgentle\b/gi, "clear")
    .replace(/\bpaused?\b/gi, "stopped")
    .replace(/\bpause\b/gi, "stop")
    .replace(/\banchor\b/gi, "marker")
    .replace(/\britual\b/gi, "habit")
    .replace(/\bunderstated\b/gi, "plain");
}

function removeCoffeeCopy(text) {
  let out = fixBannedWords(text);
  const specific = [
    [/Taking a final sip of her cold notebook, she closes the app, satisfied with her quick deduction\.?/gi, "After one final check, she closes the app, satisfied with the quick deduction."],
    [/Taking a final sip of her cold drink, she closes the app, satisfied with her quick deduction\.?/gi, "After one final check, she closes the app, satisfied with the quick deduction."],
    [/\bfinal sip of (her )?(cold )?(coffee|drink|notebook)\b/gi, "final check of the grid"],
    [/\bsip of (her )?(coffee|drink|notebook)\b/gi, "check of the grid"],
    [/\bcold notebook\b/gi, "grid"],
    [/\bcoffee reset\b/gi, "short reset"],
    [/\bcoffee table\b/gi, "low table"],
    [/\bcoffee cups?\b/gi, "notebook"],
    [/\bcup of coffee\b/gi, "notebook"],
    [/\btravel mug\b/gi, "water bottle"],
    [/\bbreakfast mug\b/gi, "breakfast table detail"],
    [/\bceramic mug\b/gi, "notebook"],
    [/\bholding (a )?mug\b/gi, "holding a notebook"],
    [/\bmug or notebook\b/gi, "notebook"],
    [/\bmug and notebook\b/gi, "notebook"],
    [/\bmugs\b/gi, "notebooks"],
    [/\bmug\b/gi, "notebook"],
    [/\bcups\b/gi, "notebooks"],
    [/\bcup\b/gi, "notebook"],
    [/\bcoffee\b/gi, "notebook"],
    [/\blatte\b/gi, "notebook"],
    [/\bespresso\b/gi, "notebook"],
  ];
  for (const [pattern, replacement] of specific) out = out.replace(pattern, replacement);
  return clean(out).replace(/\bnotebook shop\b/gi, "shop").replace(/\bnotebook table\b/gi, "table");
}

function nonCafeLocation(index, current = "") {
  const fallback = [
    "home entry table with tote bag and keys",
    "street corner on the way to the station",
    "park bench with tote bag beside her",
    "library window table with books nearby",
    "shop counter with receipt and notebook",
    "home window nook in evening light"
  ];
  const keep = clean(current);
  if (keep && !CAFE_RE.test(keep)) return keep;
  return fallback[index] || "specific daily-life location";
}

function actionFor(index, state, variantLine) {
  if (["no_puzzle", "closed_device"].includes(state)) {
    return [
      "packing her bag before leaving, no laptop open, no puzzle visible",
      "checking the time after a calendar reminder, standing with bag, no laptop open",
    ][index] || "daily-life action before any puzzle appears, no laptop open";
  }
  if (state === "first_moves") return "opening the digital grid for the first moves after the reminder changes her timing";
  if (state === "active_puzzle") return `${variantLine || "The daily rule"} at a library window table, checking one proved move before leaving`;
  if (state === "progress_pause") return "checking the result against her note, receipt nearby, no drink props";
  if (state === "finished_or_closing") return "closing the laptop and packing the bag, looking away from the screen";
  return "visible story action with changed timing and no drink props";
}

function poseFor(index, state) {
  if (["no_puzzle", "closed_device"].includes(state)) return index === 0 ? "standing full-body packing pose, hands on bag and keys, not seated at laptop" : "standing or walking timing-check pose, phone/calendar cue visible, not seated at laptop";
  if (state === "first_moves") return "seated bench start, angled body, laptop present only for first moves";
  if (state === "active_puzzle") return "leaning focus at active digital puzzle, side angle, one hand clear of screen";
  if (state === "progress_pause") return "side-angle consequence pose with notebook or receipt, not another head-on laptop shot";
  if (state === "finished_or_closing") return "closing laptop or packing bag, looking away from screen, clear ending gesture";
  return "visibly different pose from adjacent panels";
}

function stripCafes(story) {
  const scenes = Array.isArray(story.scenes) ? story.scenes.slice(0, 6) : [];
  const variantLine = clean(story.variant_recap?.line || story.variant_recap?.short_rule || "The daily rule changes the move, so Isla checks it before trusting the answer.");
  story.scenes = scenes.map((scene, index) => {
    const state = clean(scene.panel_screen_state || (index < 2 ? "no_puzzle" : index === 2 ? "first_moves" : index === 3 ? "active_puzzle" : index === 5 ? "finished_or_closing" : "progress_pause"));
    const location = nonCafeLocation(index, scene.panel_location || scene.setting || scene.location_label || "");
    const next = { ...scene };
    next.panel_location = location;
    next.setting = location;
    next.location_label = location;
    next.panel_screen_state = state;
    next.panel_action = removeCoffeeCopy(CAFE_RE.test(clean(scene.panel_action)) || COFFEE_RE.test(clean(scene.panel_action)) ? actionFor(index, state, variantLine) : (scene.panel_action || actionFor(index, state, variantLine)));
    next.panel_pose_family = poseFor(index, state);
    next.coffee_mug_allowed = false;
    next.allow_coffee = false;
    for (const key of ["caption", "storyboard_caption", "dialogue", "storyboard_dialogue", "speech_bubble", "storyboard_panel_text", "scene_description", "image_prompt_fragment"]) {
      if (next[key] !== undefined) next[key] = removeCoffeeCopy(next[key]);
    }
    if (index === 4 && /sip|notebook, she closes/i.test(next.storyboard_caption || next.caption || "")) {
      next.storyboard_caption = "After one final check, she closes the app, satisfied with the quick deduction.";
      next.caption = next.storyboard_caption;
    }
    next.scene_description = clean(`${next.panel_location}. ${next.panel_action}. ${next.storyboard_caption || next.caption || ""}${next.supporting_life_trigger_here ? " The phone/calendar reminder changes what she does next." : ""}`);
    next.image_prompt_fragment = clean(`${next.panel_action}, ${next.panel_pose_family}, ${next.panel_screen_state}, no drink props, no coffee cups, no mugs`);
    next.storyboard_panel_text = next.storyboard_dialogue ? `${next.storyboard_dialogue}\n${next.storyboard_caption || next.caption || ""}`.trim() : clean(next.storyboard_caption || next.caption || "");
    return next;
  });
}

function improveCalendarTrigger(story) {
  const trigger = story.supporting_life_trigger || {};
  if (trigger.enabled && trigger.type === "calendar_reminder" && /^calendar reminder$/i.test(clean(trigger.message || ""))) {
    trigger.message = "Leave in 10 minutes";
    trigger.arc_shift = "The reminder changes Isla's timing: one proved move, then she has to leave without dragging the mistake forward.";
    story.supporting_life_trigger = trigger;
  }
  for (const scene of story.scenes || []) {
    if (scene.supporting_life_trigger_here) scene.supporting_life_trigger = story.supporting_life_trigger;
  }
}

function hardenStory(story) {
  story.storyboard_arc_title = BANNED_RE.test(clean(story.storyboard_arc_title || "")) ? "Isla keeps the morning moving" : removeCoffeeCopy(story.storyboard_arc_title || "Isla keeps the morning moving");
  story.story_note = removeCoffeeCopy(story.story_note || "");
  story.continuation_note = removeCoffeeCopy(story.continuation_note || "");
  story.facebook_post_text = removeCoffeeCopy(story.facebook_post_text || "");
  stripCafes(story);
  improveCalendarTrigger(story);
  story.location_flow = (story.scenes || []).map((scene) => scene.panel_location.split(" ").slice(0, 3).join(" "));
  story.storyboard_locations = (story.scenes || []).map((scene) => scene.panel_location);
  story.storyboard_arc = Object.fromEntries(["setup", "trigger", "choice", "puzzle_moment", "consequence", "resolution"].map((role, index) => [role, story.scenes?.[index]?.storyboard_caption || story.scenes?.[index]?.caption || ""]));
  story.proof_hardening = { ran: true, removed_cafe_default: true, removed_coffee_default: true, fixed_bad_replacement_phrases: true, checked_at: new Date().toISOString() };
  story.image_manifest = { ...(story.image_manifest || {}), proof_hardening: story.proof_hardening };
  story.image_manifest.scenes = (story.scenes || []).map((scene, index) => ({
    panel: index + 1,
    arc_role: scene.arc_role || "",
    panel_location: scene.panel_location,
    panel_action: scene.panel_action,
    panel_pose_family: scene.panel_pose_family,
    panel_screen_state: scene.panel_screen_state,
    scene_truth_flow_id: scene.scene_truth_flow_id || story.location_flow_id || story.scene_truth_contract?.mode || "unknown",
    supporting_life_trigger_here: Boolean(scene.supporting_life_trigger_here),
    coffee_mug_allowed: false,
  }));
}

async function main() {
  const date = dateString();
  const story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);
  hardenStory(story);
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest || {});
  console.log("Isla proof hardening applied: cafe/coffee defaults removed, no-puzzle panels strengthened, calendar trigger clarified.");
}

main().catch((error) => { console.error(error); process.exit(1); });
