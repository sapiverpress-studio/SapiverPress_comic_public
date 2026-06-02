import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const REQUIRED_ARC = ["setup", "trigger", "choice", "puzzle_moment", "consequence", "resolution"];
const CRITICAL_BANNED = ["restraint", "constraint"];
const SOFT_BANNED = ["quiet", "gentle", "pause", "anchor", "ritual", "understated"];
const ALL_BANNED = [...CRITICAL_BANNED, ...SOFT_BANNED];
const COFFEE_RE = /\b(coffee|mug|mugs|cup|cups|latte|espresso)\b/i;
const SEATED_LAPTOP_RE = /\b(seated|sitting|laptop|desk|typing|trackpad|screen)\b/i;
const PUZZLE_RE = /\b(puzzle|grid|Trigoku|Sudoku|rule|move|screen|laptop)\b/i;

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override && !/^\d{4}-\d{2}-\d{2}$/.test(override)) throw new Error(`DATE_OVERRIDE must be YYYY-MM-DD. Received: ${override}`);
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function replaceBanned(text) {
  let out = clean(text);
  const replacements = [
    [/\bthe restraint\b/gi, "the rule"],
    [/\brestraint\b/gi, "rule"],
    [/\bconstraint\b/gi, "rule"],
    [/\bquiet\b/gi, "steady"],
    [/\bgentle\b/gi, "clear"],
    [/\bpaused?\b/gi, "stopped"],
    [/\bpause\b/gi, "stop"],
    [/\banchor\b/gi, "marker"],
    [/\britual\b/gi, "habit"],
    [/\bunderstated\b/gi, "plain"],
    [/\blittle rule-set\b/gi, "daily rule"],
    [/\bcol changes the move\b/gi, "The daily rule changes the move"],
  ];
  for (const [pattern, replacement] of replacements) out = out.replace(pattern, replacement);
  return clean(out);
}

function replaceCoffee(text) {
  let out = clean(text);
  const replacements = [
    [/\bSJ ceramic mug on desk\b/gi, "open notebook on desk"],
    [/\bceramic mug\b/gi, "notebook"],
    [/\btravel mug\b/gi, "water bottle"],
    [/\bbreakfast mug\b/gi, "breakfast table details"],
    [/\bcoffee reset\b/gi, "notebook reset"],
    [/\bcoffee cup(s)?\b/gi, "notebook"],
    [/\bcup of coffee\b/gi, "notebook"],
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
  for (const [pattern, replacement] of replacements) out = out.replace(pattern, replacement);
  return clean(out);
}

function textFields(scene) {
  return [
    "caption", "storyboard_caption", "dialogue", "storyboard_dialogue", "speech_bubble",
    "storyboard_panel_text", "scene_description", "image_prompt_fragment", "panel_action", "panel_location", "setting", "location_label"
  ];
}

function sanitiseScene(scene) {
  const next = { ...scene };
  for (const key of textFields(next)) if (next[key] !== undefined) next[key] = replaceBanned(next[key]);
  if (next.storyboard_dialogue || next.dialogue || next.speech_bubble) {
    const d = clean(next.storyboard_dialogue || next.dialogue || next.speech_bubble);
    next.storyboard_dialogue = d;
    next.dialogue = d;
    next.speech_bubble = d;
  }
  if (next.storyboard_caption || next.caption) {
    const c = clean(next.storyboard_caption || next.caption);
    next.storyboard_caption = c;
    next.caption = c;
  }
  next.storyboard_panel_text = next.storyboard_dialogue ? `${next.storyboard_dialogue}\n${next.storyboard_caption || next.caption || ""}`.trim() : clean(next.storyboard_caption || next.caption || "");
  return next;
}

function candidateVariantValues(story) {
  return [
    story?.required_puzzle_copy?.variant_name,
    story?.variant_recap?.variant_name,
    story?.image_manifest?.variant_recap?.variant_name,
    story?.puzzle_state?.variant_recap?.variant_name,
    story?.puzzle_state?.source_name,
    story?.puzzle_state?.mode,
  ].map(clean).filter(Boolean);
}

function usableVariantName(value) {
  const v = clean(value);
  if (!v || /^(col|row|null|undefined|none|n\/a)$/i.test(v)) return "";
  if (/^trigoku$/i.test(v)) return "";
  if (v.length <= 2) return "";
  return v;
}

function normaliseVariant(story) {
  const name = candidateVariantValues(story).map(usableVariantName).find(Boolean);
  const detected = Boolean(name);
  const line = detected
    ? `${name} changes the move, so Isla checks the rule before trusting it.`
    : "The daily rule changes the move, so Isla checks it before trusting the answer.";
  story.variant_recap = {
    ...(story.variant_recap || {}),
    variant_name: detected ? name : null,
    variant_detected: detected,
    line,
    short_rule: line,
    panel_index: 4,
  };
  story.variant_copy_mode = detected ? "exact_variant" : "neutral_daily_rule";
  story.variant_detection_unresolved = !detected;
  story.image_manifest = story.image_manifest || {};
  story.image_manifest.variant_recap = story.variant_recap;
  return { detected, name, line };
}

function ensureScenes(story) {
  const scenes = Array.isArray(story.scenes) ? story.scenes.slice(0, 6) : [];
  while (scenes.length < 6) scenes.push({ id: `scene_${String(scenes.length + 1).padStart(2, "0")}` });
  return scenes.map((scene, index) => ({ ...scene, id: scene.id || `scene_${String(index + 1).padStart(2, "0")}` }));
}

function defaultCaption(index, variantLine) {
  return [
    "Isla decides what has to come first before the day starts pulling.",
    "The reminder changes the timing, not the whole shape of the morning.",
    "She opens the grid only when the first decision is already made.",
    variantLine,
    "The checked move holds, and the rest of the day has more room.",
    "She closes the laptop with one decision carried into tomorrow."
  ][index];
}

function defaultDialogue(index) {
  return [
    "First things first.",
    "I can answer that properly later.",
    "Start where it proves itself.",
    "Check the daily rule first.",
    "That one holds.",
    "Leave it there. Move on."
  ][index];
}

function isGenericCopy(text) {
  const t = clean(text).toLowerCase();
  return !t || /^(back again|one number at a time|start small|no guessing|not that one|there it is|nearly there|tomorrow then|same time tomorrow|quick start|pause there|think slower|last checks|day begins)$/i.test(t);
}

function ensureStoryArc(story, variantLine) {
  story.scenes = ensureScenes(story).map((raw, index) => {
    const scene = sanitiseScene(raw);
    scene.arc_role = REQUIRED_ARC[index];
    if (!scene.panel_location) scene.panel_location = clean(scene.setting || scene.location_label || "specific daily-life location");
    if (!scene.panel_action) scene.panel_action = clean(scene.scene_description || "visible story action");
    if (!scene.panel_pose_family) scene.panel_pose_family = ["standing_start", "standing_trigger", "seated_start", "leaning_focus", "side_consequence", "closing_up"][index];
    if (!scene.panel_screen_state) scene.panel_screen_state = index < 2 ? "no_puzzle" : index === 2 ? "first_moves" : index === 3 ? "active_puzzle" : index === 5 ? "finished_or_closing" : "progress_pause";

    if (index < 2 && !["no_puzzle", "closed_device"].includes(scene.panel_screen_state)) scene.panel_screen_state = index === 0 ? "no_puzzle" : "closed_device";
    if (["no_puzzle", "closed_device"].includes(scene.panel_screen_state) && PUZZLE_RE.test(scene.panel_action)) {
      scene.panel_action = index === 0 ? "checking the day plan before opening any puzzle" : "responding to the reminder before the laptop opens";
    }

    if (isGenericCopy(scene.storyboard_caption || scene.caption) || ALL_BANNED.some((w) => new RegExp(`\\b${w}\\b`, "i").test(scene.storyboard_caption || scene.caption || ""))) {
      scene.storyboard_caption = defaultCaption(index, variantLine);
      scene.caption = scene.storyboard_caption;
    }
    if (isGenericCopy(scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble)) {
      scene.storyboard_dialogue = defaultDialogue(index);
      scene.dialogue = scene.storyboard_dialogue;
      scene.speech_bubble = scene.storyboard_dialogue;
    }
    if (index === 3) {
      scene.storyboard_caption = variantLine;
      scene.caption = variantLine;
      scene.storyboard_dialogue = scene.storyboard_dialogue || "Check the daily rule first.";
      scene.dialogue = scene.storyboard_dialogue;
      scene.speech_bubble = scene.storyboard_dialogue;
    }
    scene.storyboard_panel_text = scene.storyboard_dialogue ? `${scene.storyboard_dialogue}\n${scene.storyboard_caption}` : scene.storyboard_caption;
    scene.scene_description = clean(`${scene.panel_location}. ${scene.panel_action}. ${scene.storyboard_caption}${scene.supporting_life_trigger_here ? " The phone/calendar reminder is part of the cause, not decoration." : ""}`);
    return scene;
  });
}

function limitCoffee(story) {
  const coffeePanelsBefore = [];
  const coffeePanelsKept = [];
  const coffeePanelsStripped = [];
  const panelsWithExplicitAction = story.scenes
    .map((scene, index) => ({ index, action: clean(scene.panel_action).toLowerCase() }))
    .filter((item) => COFFEE_RE.test(item.action))
    .map((item) => item.index);
  const allowed = new Set(panelsWithExplicitAction.slice(0, 2));

  story.scenes = story.scenes.map((scene, index) => {
    const combined = textFields(scene).map((key) => scene[key]).join(" ");
    if (COFFEE_RE.test(combined)) coffeePanelsBefore.push(index + 1);
    if (allowed.has(index)) {
      coffeePanelsKept.push(index + 1);
      return scene;
    }
    const next = { ...scene };
    let stripped = false;
    for (const key of textFields(next)) {
      if (next[key] !== undefined && COFFEE_RE.test(next[key])) {
        next[key] = replaceCoffee(next[key]);
        stripped = true;
      }
    }
    if (stripped) coffeePanelsStripped.push(index + 1);
    return next;
  });
  return { max_allowed: 2, panels_before: coffeePanelsBefore, panels_kept: coffeePanelsKept, panels_stripped: coffeePanelsStripped };
}

function repairPoseVariety(story) {
  const replacements = [
    "standing full-body start, hands on bag or notebook, not seated at laptop",
    "standing or walking reaction to reminder, phone/calendar cue visible, not seated at laptop",
    "seated opening laptop for first moves, clear different framing",
    "leaning focus at active digital puzzle, side angle, one hand clear of screen",
    "standing or side-angle consequence with notebook or receipt, not another head-on laptop shot",
    "closing laptop or packing bag, looking away from screen, clear ending gesture"
  ];
  let changed = false;
  story.scenes = story.scenes.map((scene, index) => {
    const t = `${scene.panel_pose_family || ""} ${scene.panel_action || ""}`;
    if ((index < 2 || index === 4 || index === 5) && SEATED_LAPTOP_RE.test(t)) {
      changed = true;
      return { ...scene, panel_pose_family: replacements[index] };
    }
    return scene;
  });
  const seatedLaptopPanels = story.scenes
    .map((scene, index) => ({ index: index + 1, text: `${scene.panel_pose_family || ""} ${scene.panel_action || ""}` }))
    .filter((item) => SEATED_LAPTOP_RE.test(item.text))
    .map((item) => item.index);
  return { changed, seated_laptop_like_panels: seatedLaptopPanels, count: seatedLaptopPanels.length, passed: seatedLaptopPanels.length <= 3 };
}

function storyHasCauseEffect(story) {
  const text = story.scenes.map((scene) => `${scene.storyboard_caption || scene.caption || ""} ${scene.storyboard_dialogue || scene.dialogue || ""}`).join(" ");
  return /\b(because|so|after|before|changes|then|holds|therefore|when|until|once)\b/i.test(text);
}

function requiredFieldsMissing(story) {
  const missing = [];
  story.scenes.forEach((scene, index) => {
    for (const key of ["panel_location", "panel_action", "panel_pose_family", "panel_screen_state"]) {
      if (!clean(scene[key])) missing.push(`panel_${index + 1}:${key}`);
    }
  });
  return missing;
}

function bannedHits(story) {
  const text = [story.story_note, story.continuation_note, story.facebook_post_text, ...story.scenes.flatMap((s) => [s.storyboard_caption, s.caption, s.storyboard_dialogue, s.dialogue, s.speech_bubble, s.scene_description, s.image_prompt_fragment])].join(" ");
  return ALL_BANNED.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(text));
}

async function sanitiseCharacterFile() {
  const character = await readJson("characters/isla.json", null);
  if (!character) return false;
  let changed = false;
  const cleanArray = (arr) => (Array.isArray(arr) ? arr.map((item) => replaceBanned(replaceCoffee(item))).filter((item) => item && !COFFEE_RE.test(item)) : arr);
  const nextBrandProps = cleanArray(character.brand_props);
  if (JSON.stringify(nextBrandProps) !== JSON.stringify(character.brand_props)) { character.brand_props = nextBrandProps; changed = true; }
  if (Array.isArray(character.caption_bank)) {
    const next = character.caption_bank.map((item) => replaceBanned(replaceCoffee(item))).filter(Boolean);
    if (JSON.stringify(next) !== JSON.stringify(character.caption_bank)) { character.caption_bank = next; changed = true; }
  }
  if (Array.isArray(character.story_rules)) {
    const next = character.story_rules.map(replaceBanned).map((rule) => rule.replace(/Keep captions short, plain, real, and non-promotional\./i, "Keep captions short, specific, real, and non-promotional.")).filter(Boolean);
    if (JSON.stringify(next) !== JSON.stringify(character.story_rules)) { character.story_rules = next; changed = true; }
  }
  if (changed) await writeJson("characters/isla.json", character);
  return changed;
}

async function main() {
  const date = dateString();
  const story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);

  const variant = normaliseVariant(story);
  ensureStoryArc(story, variant.line);
  const coffee = limitCoffee(story);
  const pose = repairPoseVariety(story);
  story.scenes = story.scenes.map(sanitiseScene);

  const noPuzzlePanels = story.scenes.map((scene, index) => [index + 1, scene.panel_screen_state]).filter(([, state]) => ["no_puzzle", "closed_device"].includes(state)).map(([index]) => index);
  const missing = requiredFieldsMissing(story);
  const hits = bannedHits(story);
  const hasCauseEffect = storyHasCauseEffect(story);
  const puzzleRuleOnlyPanel4 = story.scenes.every((scene, index) => index === 3 || !/daily rule changes|rule changes the move|before trusting/i.test(`${scene.storyboard_caption || scene.caption || ""} ${scene.storyboard_dialogue || scene.dialogue || ""}`));

  const issues = [];
  if (story.scenes.length !== 6) issues.push("scene_count_not_6");
  if (missing.length) issues.push("missing_scene_truth_fields");
  if (noPuzzlePanels.length < 2) issues.push("not_enough_no_puzzle_panels");
  if (!pose.passed) issues.push("too_many_seated_laptop_like_panels");
  if (!hasCauseEffect) issues.push("no_clear_cause_effect");
  if (!puzzleRuleOnlyPanel4) issues.push("puzzle_rule_copy_outside_panel_4");
  if (hits.length) issues.push("banned_words_remaining");

  const passed = issues.length === 0;
  story.storyboard_arc = Object.fromEntries(REQUIRED_ARC.map((role, index) => [role, story.scenes[index]?.storyboard_caption || story.scenes[index]?.caption || ""]));
  story.storyboard_quality = {
    ...(story.storyboard_quality || {}),
    has_cause_effect: hasCauseEffect,
    scene_truth_locked: missing.length === 0,
    final_lint_passed: hits.length === 0,
    not_location_sequence_only: true,
    pose_variety_passed: pose.passed,
    no_puzzle_panel_count: noPuzzlePanels.length,
    story_coherence_passed: passed,
  };
  story.story_coherence_lint = {
    ran: true,
    passed,
    issues,
    missing_scene_truth_fields: missing,
    arc_roles: REQUIRED_ARC,
    no_puzzle_panels: noPuzzlePanels,
    puzzle_rule_only_panel_4: puzzleRuleOnlyPanel4,
    cause_effect_detected: hasCauseEffect,
    banned_word_hits: hits,
    coffee_mug_limiter: coffee,
    pose_variety: pose,
    variant_copy_mode: story.variant_copy_mode,
    checked_at: new Date().toISOString(),
  };
  story.post_ready_contract = {
    ...(story.post_ready_contract || {}),
    story_coherence_passed: passed,
    posting_allowed: passed && story.storyboard_quality.final_lint_passed !== false && story.final_copy_sanity?.passed !== false,
    posting_block_reasons: passed ? [] : issues,
  };
  story.image_manifest = {
    ...(story.image_manifest || {}),
    story_coherence_lint: story.story_coherence_lint,
    storyboard_arc: story.storyboard_arc,
    storyboard_quality: story.storyboard_quality,
    post_ready_contract: story.post_ready_contract,
    variant_recap: story.variant_recap,
    scenes: story.scenes.map((scene, index) => ({
      panel: index + 1,
      arc_role: scene.arc_role,
      panel_location: scene.panel_location,
      panel_action: scene.panel_action,
      panel_pose_family: scene.panel_pose_family,
      panel_screen_state: scene.panel_screen_state,
      scene_truth_flow_id: scene.scene_truth_flow_id || story.location_flow_id || story.scene_truth_contract?.mode || "unknown",
      supporting_life_trigger_here: Boolean(scene.supporting_life_trigger_here),
    })),
  };

  const characterChanged = await sanitiseCharacterFile();
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest);

  console.log(`Story coherence lint: ${passed ? "passed" : "failed"}${issues.length ? ` (${issues.join(", ")})` : ""}`);
  console.log(`Coffee/mug limiter: kept ${coffee.panels_kept.length}, stripped ${coffee.panels_stripped.length}, max ${coffee.max_allowed}`);
  console.log(`Pose variety: ${pose.passed ? "passed" : "failed"} (${pose.count} seated/laptop-like panels)`);
  console.log(`Posting allowed: ${story.post_ready_contract.posting_allowed ? "true" : "false"}`);
  if (characterChanged) console.log("Isla character defaults sanitised: coffee/mug removed from default props/captions.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
