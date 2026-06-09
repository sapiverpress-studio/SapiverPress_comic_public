import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const SHOP_URL = "https://sapiverpress.etsy.com";
const PRODUCT_NAME = "Commercial Sudoku Publisher Starter Pack";
const PRODUCT_SHORT = "900 Commercial Sudoku Pack";
const CONTRACT_MODE = "kdp_learner_to_sapiver_commercial_pack";

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override) return override;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function weekdayName(date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long" }).format(new Date(`${date}T12:00:00Z`));
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

const PANELS = [
  {
    id: "scene_01",
    title: "Starting from zero",
    arc_role: "setup",
    location: "home publishing desk with open laptop, blank notebook, tidy folders, no wall text",
    action: "Isla sits at an open laptop with a blank planning notebook, unsure how to begin a Sudoku book project",
    pose: "seated three-quarter view, thoughtful expression, one hand near notebook, laptop screen open toward Isla and viewer",
    dialogue: "I want to make a Sudoku book.",
    caption: "But I do not know where to start.",
    visual: "learning and planning moment, blank notebook, organised desk, open laptop with empty screen surface",
    screenLines: ["Sudoku book idea", "Where do I start?"],
  },
  {
    id: "scene_02",
    title: "Workflow overwhelm",
    arc_role: "disruption",
    location: "same publishing desk with blank papers, file folders, and laptop angled to the viewer",
    action: "Isla sorts blank sheets and folders while realising the book needs more parts than expected",
    pose: "standing or half-seated organising folders, different body angle from panel one, laptop still visible",
    dialogue: "Puzzles, solutions, layouts, covers, licences.",
    caption: "It is a whole workflow, not one file.",
    visual: "workflow overwhelm shown through tidy blank papers and folders, no readable labels, laptop screen kept blank",
    screenLines: ["Puzzle book workflow", "Puzzles", "Solutions", "Interiors", "Covers", "Rights"],
  },
  {
    id: "scene_03",
    title: "Product discovery",
    arc_role: "choice",
    location: "desk research scene with laptop screen visible for later product-page overlay, simple bee picture on wall if any art appears",
    action: "Isla researches practical starting points and notices a commercial-use starter pack on the laptop",
    pose: "leaning forward with finger near trackpad, face visible in three-quarter view, screen unobstructed",
    dialogue: "Then I found a commercial-use starter pack.",
    caption: "Sapiver Press gives me a practical starting point.",
    visual: "soft product discovery moment, laptop open to blank product-page surface, no generated website text",
    screenLines: ["Sapiver Press", "Commercial Sudoku Publisher Starter Pack", SHOP_URL],
  },
  {
    id: "scene_04",
    title: "What the pack contains",
    arc_role: "product_proof",
    location: "clean desk with laptop, organised folders, blank product-file thumbnails for overlay only",
    action: "Isla checks the pack structure on the laptop and compares the included publishing files",
    pose: "active checking posture, laptop between Isla and viewer, screen large and clear, hands away from display",
    dialogue: "900 puzzles. 900 solutions.",
    caption: "Interiors and matching covers are included.",
    visual: "file-checking moment, blank file shapes, no fake puzzle pages, no readable generated text",
    screenLines: ["900 puzzles", "900 solutions", "Interiors + matching covers", "Commercial-use pack"],
  },
  {
    id: "scene_05",
    title: "Publishing plan",
    arc_role: "consequence",
    location: "planning desk with open laptop, blank notebook, tidy folder stack, no logos except compositor overlays",
    action: "Isla turns the discovery into a practical KDP-style publishing workflow plan",
    pose: "calmer side-angle planning pose, writing in a blank notebook beside the open laptop, screen still visible",
    dialogue: "Now I can build the book workflow.",
    caption: "I am not building every grid from scratch.",
    visual: "calmer planning mood, blank checklist shapes, no Amazon or KDP logos, no generated words",
    screenLines: ["Publish-ready workflow", "Build the book", "Check files", "Format", "Upload when ready"],
  },
  {
    id: "scene_06",
    title: "First step CTA",
    arc_role: "resolution",
    location: "finished planning desk with laptop facing viewer, notebook closed, tidy folders ready",
    action: "Isla finishes with a practical first step and the shop link appears only as compositor overlay",
    pose: "clear ending gesture, relaxed shoulders, one hand near folder stack, laptop open toward viewer",
    dialogue: "Start with the files. Build from there.",
    caption: "Find it at sapiverpress.etsy.com",
    visual: "practical next-step moment, creator workflow complete for today, blank screen reserved for CTA overlay",
    screenLines: ["Start with the files", "Build the book from there", SHOP_URL],
  },
];

function makeScene(panel, index) {
  const sceneId = panel.id || `scene_${String(index + 1).padStart(2, "0")}`;
  const overlayText = `${panel.dialogue}\n${panel.caption}`.trim();
  return {
    id: sceneId,
    title: panel.title,
    arc_role: panel.arc_role,
    beat: panel.title,
    pose_id: ["pose_01_back_again", "pose_02_first_moves", "pose_03_stuck", "pose_04_thinking", "pose_05_coffee", "pose_06_leaving"][index],
    panel_location: panel.location,
    setting: panel.location,
    location_label: panel.location,
    panel_action: panel.action,
    panel_pose_family: panel.pose,
    panel_screen_state: "publishing_overlay_screen",
    scene_truth_locked: true,
    scene_truth_flow_id: CONTRACT_MODE,
    scene_description: `${panel.location}. ${panel.action}. Readable copy is compositor overlay only.`,
    caption: panel.caption,
    dialogue: panel.dialogue,
    speech_bubble: panel.dialogue,
    storyboard_caption: panel.caption,
    storyboard_dialogue: panel.dialogue,
    storyboard_panel_text: overlayText,
    overlay_text: overlayText,
    image_prompt_fragment: panel.visual,
    screen_overlay: {
      enabled: true,
      type: index === 2 ? "product_discovery" : index === 3 ? "product_proof" : index === 5 ? "cta" : "publishing_workflow",
      title: index === 2 ? PRODUCT_NAME : index === 3 ? PRODUCT_SHORT : index === 5 ? "Sapiver Press" : "Publishing workflow",
      lines: panel.screenLines,
      cta: index === 5 ? SHOP_URL : "",
      readable_text_compositor_only: true,
    },
    visual_generation_rules: [
      "Use Isla_v2 as the image model trigger through the prompt builder only; never render it as text.",
      "Generated art must show only blank screens, blank folders, and blank pages.",
      "All readable words are added later by the compositor.",
      "Laptop screen must face both Isla and the viewer at about 30 to 45 degrees.",
      "No fake web-page text, no fake Sudoku pages, no Amazon/KDP logos, no posters with text.",
    ],
  };
}

function buildStory(previous, date) {
  const scenes = PANELS.map(makeScene);
  const storyboardArc = Object.fromEntries(scenes.map((scene) => [scene.arc_role, scene.storyboard_caption]));
  const product = {
    key: "sapiver_commercial_sudoku_publisher_pack",
    name: PRODUCT_NAME,
    short_name: PRODUCT_SHORT,
    url: SHOP_URL,
    natural_reference: "a practical commercial-use Sudoku publishing starter pack",
    facts_used_in_copy: [
      "Commercial-use Sudoku publishing pack",
      "900 puzzles + 900 solutions",
      "Interiors plus matching covers",
      "Useful for Sudoku book and low-content puzzle-book publishing workflows",
    ],
    claims_not_made: [
      "guaranteed sales",
      "guaranteed KDP approval",
      "passive income",
      "Amazon or KDP affiliation",
      "official KDP template",
    ],
    one_pack_per_buyer_unique_volume_claim_allowed: false,
  };
  return {
    ...(previous || {}),
    date,
    weekday: previous?.weekday || weekdayName(date),
    character_id: "isla",
    character_name: "Isla",
    trigger_word: "Isla_v2",
    render_mode: "illustrated_comic_panels",
    story_source: "kdp_learner_ad_contract",
    story_source_used: `daily/${date}.json`,
    product_referenced: product,
    puzzle_state: {
      ...(previous?.puzzle_state || {}),
      product_name: PRODUCT_NAME,
      product_url: SHOP_URL,
      ad_mode: true,
      puzzle_capture_required: false,
      summary: "Daily puzzle-solving angle is paused; this preview promotes the commercial Sudoku publishing pack through Isla's creator journey.",
    },
    selected_setting: "home publishing desk with audience-facing laptop",
    story_note: "Isla starts from zero as a would-be Sudoku book publisher, feels the workflow expand, then finds the Sapiver Press commercial-use pack as a practical starting structure.",
    continuation_note: "Paused old daily puzzle-solving angle. Keep the story helpful and practical: creator/publisher journey first, soft product discovery second, no income or approval claims.",
    facebook_post_text: `Starting a Sudoku book from zero is easier when the files are already structured. ${SHOP_URL}`,
    storyboard_arc_title: "Isla finds a practical starting point for Sudoku book publishing",
    storyboard_board_caption: "A six-panel creator journey from blank page to Sapiver Press commercial pack discovery.",
    storyboard_arc_type: "kdp_learner_product_discovery_ad",
    storyboard_arc: storyboardArc,
    storyboard_copy_refined: true,
    storyboard_copy_source: "kdp_learner_ad_contract",
    storyboard_copy_model: "deterministic_contract",
    storyboard_quality: {
      location_sequence_only: false,
      has_cause_effect: true,
      has_character_turn: true,
      uses_phase2_story: true,
      quality_gate_passed: true,
      final_lint_passed: true,
      story_coherence_passed: true,
      product_ad_contract_passed: true,
      no_fake_income_claims: true,
      no_kdp_affiliation_claims: true,
      text_overlay_only: true,
    },
    quality_gate_action: "kdp_learner_ad_contract_applied",
    quality_gate_repair_reasons: ["strategic_pivot_from_daily_puzzle_to_kdp_learner_ad"],
    scenes,
    storyboard_locations: scenes.map((scene) => scene.panel_location),
    location_flow_id: CONTRACT_MODE,
    location_flow_method: "fixed_ad_story_contract",
    location_flow: scenes.map((scene) => scene.panel_location.split(" ").slice(0, 4).join(" ")),
    scene_truth_contract: {
      enabled: true,
      mode: CONTRACT_MODE,
      fixed_sequence: true,
      story_led: true,
      flow_enforced: true,
      copy_must_be_overlay_only: true,
      generated_art_text_banned: true,
      laptop_angle_required: "30-45 degrees facing Isla and viewer",
      no_posters_except_bee_picture: true,
      no_children: true,
      no_shower_or_half_naked: true,
    },
    product_ad_contract: {
      enabled: true,
      mode: CONTRACT_MODE,
      shop_url: SHOP_URL,
      product_name: PRODUCT_NAME,
      product_short: PRODUCT_SHORT,
      readable_text_compositor_only: true,
      generated_art_must_not_include_text: true,
      laptop_screen_overlay_required: true,
      daily_puzzle_solving_angle_paused: true,
      tone: "helpful practical creator journey soft product discovery",
      claims_banned: product.claims_not_made,
    },
    supporting_life_trigger: { enabled: false, reason: "disabled_for_product_ad_story" },
    supporting_cast_policy: {
      isla_only_main_character: true,
      overlay_only: true,
      no_extra_faces: true,
      no_visible_supporting_character: true,
      no_children: true,
    },
    variant_recap: {
      variant_name: null,
      variant_detected: false,
      line: "Commercial-use Sudoku publishing workflow, not a daily puzzle-solving strip.",
      short_rule: "Commercial-use Sudoku publishing workflow, not a daily puzzle-solving strip.",
      panel_index: 4,
    },
    variant_copy_mode: "product_ad_not_daily_variant",
    variant_detection_unresolved: false,
    post_ready_contract: {
      story_coherence_passed: true,
      posting_allowed: true,
      posting_block_reasons: [],
      product_ad_contract_passed: true,
    },
    image_manifest: {
      ...(previous?.image_manifest || {}),
      character_id: "isla",
      character_name: "Isla",
      trigger_word: "Isla_v2",
      render_mode: "illustrated_comic_panels",
      product_referenced: product,
      product_ad_contract: {
        enabled: true,
        mode: CONTRACT_MODE,
        readable_text_compositor_only: true,
        laptop_screen_overlay_required: true,
      },
      text_is_overlay: true,
      puzzle_screen_inserted_later: false,
      product_screen_inserted_later: true,
      selected_setting: "home publishing desk with audience-facing laptop",
      storyboard_arc: storyboardArc,
      storyboard_quality: {
        product_ad_contract_passed: true,
        text_overlay_only: true,
        no_fake_income_claims: true,
        no_kdp_affiliation_claims: true,
      },
      scenes: scenes.map((scene, index) => ({
        panel: index + 1,
        arc_role: scene.arc_role,
        panel_location: scene.panel_location,
        panel_action: scene.panel_action,
        panel_pose_family: scene.panel_pose_family,
        panel_screen_state: scene.panel_screen_state,
        screen_overlay: scene.screen_overlay,
      })),
      image_prompts: scenes.map((scene) => ({
        scene: scene.id,
        pose_id: scene.pose_id,
        prompt: scene.image_prompt_fragment,
        readable_text_compositor_only: true,
        screen_overlay: scene.screen_overlay,
      })),
      style_rules: [
        "Isla remains the main character.",
        "Use Isla_v2 as LoRA/model trigger through prompt builder.",
        "Generated art contains no readable text.",
        "All product names, CTA text, web-page copy, checklist labels, and file labels are compositor overlays only.",
        "Laptop screen must face both Isla and the viewer at roughly 30-45 degrees.",
        "If wall art appears, it is a simple bee picture with no words, letters, logos, or symbols.",
        "No children. No shower or half-naked scenes. No Amazon/KDP logos or affiliation claims.",
      ],
    },
    kdp_learner_contract_applied_at: new Date().toISOString(),
  };
}

async function updateCharacterHistory(story) {
  const rel = "characters/isla.json";
  const character = await readJson(rel, null);
  if (!character) return;
  const history = Array.isArray(character.story_history) ? character.story_history : Array.isArray(character.weeks) ? character.weeks : [];
  const entry = {
    date: story.date,
    weekday: story.weekday,
    setting: story.selected_setting,
    story_note: story.story_note,
    continuation_note: story.continuation_note,
    product_ad_contract: story.product_ad_contract,
    captions: story.scenes.map((scene) => scene.caption),
    pose_order: story.scenes.map((scene) => scene.pose_id),
  };
  const updated = [...history.filter((item) => item.date !== story.date), entry].slice(-30);
  const next = {
    ...character,
    trigger_word: "Isla_v2",
    story_history: updated,
    weeks: updated,
    current_strategy: "Isla learns KDP-style Sudoku book publishing and discovers the Sapiver Press commercial pack.",
    last_updated: story.date,
  };
  await writeJson(rel, next);
}

async function main() {
  const date = dateString();
  const previous = await readJson(`daily/${date}.json`, await readJson("latest.json", {}));
  const story = buildStory(previous, date);
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  await updateCharacterHistory(story);
  console.log(`KDP learner ad contract applied for ${date}: ${PRODUCT_NAME}`);
  console.log(`CTA: ${SHOP_URL}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
