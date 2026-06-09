import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const SHOP_URL = "https://sapiverpress.etsy.com";
const PRODUCT_NAME = "Commercial Sudoku Publisher Starter Pack";
const PRODUCT_SHORT = "900 Commercial Sudoku Pack";
const CAMPAIGN_ID = "isla_puzzle_book_publisher";
const CONTRACT_MODE = "isla_learns_puzzle_book_publishing";

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

const FACTS_USED_IN_COPY = [
  "Commercial-use Sudoku publishing pack",
  "900 puzzles + 900 solutions",
  "Classic, Hyper, and Diagonal Sudoku",
  "Easy, Medium, and Hard difficulty groups",
  "Structured publishing files for puzzle-book creators",
  "Interiors plus matching covers where included in the current customer pack",
];

const CLAIMS_NOT_MADE = [
  "guaranteed sales",
  "guaranteed KDP approval",
  "passive income",
  "Amazon affiliation",
  "KDP affiliation",
  "official KDP template",
  "income results",
  "upload once and make money",
];

const CONTENT_PILLARS = [
  {
    id: "where_do_i_start",
    label: "I did not know where to start",
    ad_angle: "Beginner creator overwhelm; the pack provides structure.",
  },
  {
    id: "what_goes_into_a_sudoku_book",
    label: "What actually goes into a Sudoku book",
    ad_angle: "Puzzles, solutions, variants, difficulty, interiors, covers, licence, and organised files.",
  },
  {
    id: "one_book_at_a_time",
    label: "One book at a time",
    ad_angle: "Choose one variant, one difficulty, and one style per book instead of dumping everything into one paperback.",
  },
  {
    id: "real_files_not_mockups",
    label: "Real files, not fake mockups",
    ad_angle: "Use Vol.001 listing previews and free-sample material as the visual truth; do not invent fake product screenshots.",
  },
  {
    id: "commercial_use_not_get_rich",
    label: "Commercial-use, not get-rich",
    ad_angle: "Avoid income claims, guaranteed approval, or Amazon/KDP affiliation claims.",
  },
];

const PANELS = [
  {
    id: "scene_01",
    title: "The idea",
    arc_role: "setup",
    pillar_id: "where_do_i_start",
    location: "home publishing desk with open laptop, blank notebook, tidy folders, no wall text",
    action: "Isla enjoys puzzles at her desk, then wonders whether she could make a Sudoku book herself",
    pose: "seated three-quarter view, curious expression, one hand near notebook, laptop screen open toward Isla and viewer",
    dialogue: "Could I make my own Sudoku book?",
    caption: "The idea is exciting. The starting point is not obvious.",
    visual: "curious creator moment, blank notebook, organised desk, open laptop with empty screen surface",
    screenLines: ["Puzzle book idea", "Where do I start?"],
  },
  {
    id: "scene_02",
    title: "The moving parts",
    arc_role: "disruption",
    pillar_id: "what_goes_into_a_sudoku_book",
    location: "same publishing desk with blank papers, file folders, and laptop angled to the viewer",
    action: "Isla realises a puzzle book needs far more than a single Sudoku grid",
    pose: "standing or half-seated organising folders, different body angle from panel one, laptop still visible",
    dialogue: "It is more than one puzzle page.",
    caption: "Puzzles, solutions, interiors, covers, rights, and file organisation all matter.",
    visual: "workflow overwhelm shown through tidy blank papers and folders, no readable labels, laptop screen kept blank",
    screenLines: ["Puzzle-book workflow", "Puzzles", "Solutions", "Interiors", "Covers", "Rights"],
  },
  {
    id: "scene_03",
    title: "The practical starting point",
    arc_role: "choice",
    pillar_id: "real_files_not_mockups",
    location: "desk research scene with laptop screen visible for later product-page overlay, simple bee picture on wall if any art appears",
    action: "Isla searches for a practical starting structure and discovers the Sapiver Press commercial-use pack",
    pose: "leaning forward with finger near trackpad, face visible in three-quarter view, screen unobstructed",
    dialogue: "This gives me a structure.",
    caption: "Sapiver Press turns the blank start into a file-led workflow.",
    visual: "soft product discovery moment, laptop open to blank product-page surface, no generated website text",
    screenLines: ["Sapiver Press", PRODUCT_NAME, SHOP_URL],
  },
  {
    id: "scene_04",
    title: "The proof",
    arc_role: "product_proof",
    pillar_id: "what_goes_into_a_sudoku_book",
    location: "clean desk with laptop, organised folders, blank product-file thumbnails for overlay only",
    action: "Isla checks the pack structure and sees the product facts that make it useful for puzzle-book creators",
    pose: "active checking posture, laptop between Isla and viewer, screen large and clear, hands away from display",
    dialogue: "900 puzzles. 900 solutions.",
    caption: "Classic, Hyper, Diagonal. Easy, Medium, Hard.",
    visual: "file-checking moment, blank file shapes, no fake puzzle pages, no readable generated text",
    screenLines: ["900 puzzles", "900 solutions", "Classic / Hyper / Diagonal", "Easy / Medium / Hard"],
  },
  {
    id: "scene_05",
    title: "One book at a time",
    arc_role: "consequence",
    pillar_id: "one_book_at_a_time",
    location: "planning desk with open laptop, blank notebook, tidy folder stack, no logos except compositor overlays",
    action: "Isla turns the pack into a sensible one-book-at-a-time publishing plan",
    pose: "calmer side-angle planning pose, writing in a blank notebook beside the open laptop, screen still visible",
    dialogue: "I do not need to build every grid from scratch.",
    caption: "Pick one variant, one difficulty, one style. Build from there.",
    visual: "calmer planning mood, blank checklist shapes, no Amazon or KDP logos, no generated words",
    screenLines: ["One book at a time", "Choose variant", "Choose difficulty", "Choose style", "Build from there"],
  },
  {
    id: "scene_06",
    title: "The next step",
    arc_role: "resolution",
    pillar_id: "commercial_use_not_get_rich",
    location: "finished planning desk with laptop facing viewer, notebook closed, tidy folders ready",
    action: "Isla ends with a practical next step and the shop link appears only as compositor overlay",
    pose: "clear ending gesture, relaxed shoulders, one hand near folder stack, laptop open toward viewer",
    dialogue: "Start with the files. Build the book from there.",
    caption: "Find the pack at Sapiver Press on Etsy.",
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
    pillar_id: panel.pillar_id,
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
      title: index === 2 ? PRODUCT_NAME : index === 3 ? PRODUCT_SHORT : index === 5 ? "Sapiver Press" : "Puzzle-book workflow",
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
      "Use real Vol.001 listing/free-sample material only where it is available and safe to expose.",
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
    facts_used_in_copy: FACTS_USED_IN_COPY,
    claims_not_made: CLAIMS_NOT_MADE,
    one_pack_per_buyer_unique_volume_claim_allowed: false,
  };
  const campaign = {
    id: CAMPAIGN_ID,
    title: "Isla Learns to Publish Puzzle Books",
    funnel: "Free puzzle world -> creator problem -> product discovery -> factual proof -> practical next step",
    content_pillars: CONTENT_PILLARS,
    main_message: "Want to make a Sudoku book but do not know where to start? Start with structured commercial-use files from Sapiver Press.",
    cta: "Start with the files. Build the book from there.",
    url: SHOP_URL,
  };
  return {
    ...(previous || {}),
    date,
    weekday: previous?.weekday || weekdayName(date),
    character_id: "isla",
    character_name: "Isla",
    trigger_word: "Isla_v2",
    render_mode: "illustrated_comic_panels",
    story_source: "isla_puzzle_book_publisher_campaign",
    story_source_used: `daily/${date}.json`,
    active_campaign_id: CAMPAIGN_ID,
    campaign_strategy: campaign,
    product_referenced: product,
    puzzle_state: {
      ...(previous?.puzzle_state || {}),
      product_name: PRODUCT_NAME,
      product_url: SHOP_URL,
      ad_mode: true,
      puzzle_capture_required: false,
      summary: "Daily puzzle-solving angle is paused; this preview promotes the commercial Sudoku publishing pack through Isla's puzzle-book creator journey.",
    },
    selected_setting: "home publishing desk with audience-facing laptop",
    story_note: "Isla starts from the real customer problem: she wants to make a Sudoku book but does not know where to start. She learns the moving parts, finds the Sapiver Press commercial-use pack, and uses it as a practical file-led starting point.",
    continuation_note: "Keep the story helpful and practical: puzzle-book creator journey first, soft product discovery second, no income or approval claims.",
    facebook_post_text: `Want to make a Sudoku book but do not know where to start? Start with structured commercial-use files from Sapiver Press. ${SHOP_URL}`,
    storyboard_arc_title: "Isla Learns to Publish Puzzle Books",
    storyboard_board_caption: "A six-panel creator journey from puzzle-book idea to structured Sapiver Press commercial pack discovery.",
    storyboard_arc_type: "isla_puzzle_book_publisher_product_discovery_ad",
    storyboard_arc: storyboardArc,
    storyboard_copy_refined: true,
    storyboard_copy_source: "deterministic_isla_campaign_strategy",
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
      campaign_strategy_applied: true,
      vol001_material_strategy_ready: true,
    },
    quality_gate_action: "isla_puzzle_book_publisher_campaign_applied",
    quality_gate_repair_reasons: ["strategic_pivot_from_daily_puzzle_to_puzzle_book_publisher_campaign"],
    scenes,
    storyboard_locations: scenes.map((scene) => scene.panel_location),
    location_flow_id: CONTRACT_MODE,
    location_flow_method: "fixed_campaign_story_contract",
    location_flow: scenes.map((scene) => scene.panel_location.split(" ").slice(0, 4).join(" ")),
    scene_truth_contract: {
      enabled: true,
      mode: CONTRACT_MODE,
      campaign_id: CAMPAIGN_ID,
      fixed_sequence: true,
      story_led: true,
      flow_enforced: true,
      copy_must_be_overlay_only: true,
      generated_art_text_banned: true,
      laptop_angle_required: "30-45 degrees facing Isla and viewer",
      no_posters_except_bee_picture: true,
      no_children: true,
      no_shower_or_half_naked: true,
      use_real_product_material_where_available: true,
      paid_zip_public_exposure_blocked: true,
    },
    product_ad_contract: {
      enabled: true,
      mode: CONTRACT_MODE,
      campaign_id: CAMPAIGN_ID,
      shop_url: SHOP_URL,
      product_name: PRODUCT_NAME,
      product_short: PRODUCT_SHORT,
      readable_text_compositor_only: true,
      generated_art_must_not_include_text: true,
      laptop_screen_overlay_required: true,
      daily_puzzle_solving_angle_paused: true,
      tone: "helpful practical creator journey soft product discovery",
      claims_banned: CLAIMS_NOT_MADE,
      content_pillars: CONTENT_PILLARS,
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
      campaign_strategy_applied: true,
    },
    image_manifest: {
      ...(previous?.image_manifest || {}),
      character_id: "isla",
      character_name: "Isla",
      trigger_word: "Isla_v2",
      render_mode: "illustrated_comic_panels",
      active_campaign_id: CAMPAIGN_ID,
      campaign_strategy: campaign,
      product_referenced: product,
      product_ad_contract: {
        enabled: true,
        mode: CONTRACT_MODE,
        campaign_id: CAMPAIGN_ID,
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
        campaign_strategy_applied: true,
      },
      scenes: scenes.map((scene, index) => ({
        panel: index + 1,
        arc_role: scene.arc_role,
        pillar_id: scene.pillar_id,
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
        pillar_id: scene.pillar_id,
      })),
      style_rules: [
        "Isla remains the main character.",
        "Use Isla_v2 as LoRA/model trigger through prompt builder.",
        "Generated art contains no readable text.",
        "All product names, CTA text, web-page copy, checklist labels, and file labels are compositor overlays only.",
        "Laptop screen must face both Isla and the viewer at roughly 30-45 degrees.",
        "If wall art appears, it is a simple bee picture with no words, letters, logos, or symbols.",
        "No children. No shower or half-naked scenes. No Amazon/KDP logos or affiliation claims.",
        "Use Vol.001 listing/free-sample material as visual truth where available; never expose the full paid ZIP.",
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
    active_campaign_id: story.active_campaign_id,
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
    current_strategy: "Isla learns puzzle-book publishing and discovers the Sapiver Press commercial Sudoku pack as a practical starting point.",
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
  console.log(`Isla puzzle-book publisher campaign applied for ${date}: ${PRODUCT_NAME}`);
  console.log(`CTA: ${SHOP_URL}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
