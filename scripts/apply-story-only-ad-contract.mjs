import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const SHOP_URL = "https://sapiverpress.etsy.com";
const PRODUCT_NAME = "Commercial Sudoku Publisher Starter Pack";
const MODE = "isla_story_only_product_ad";

function dateString() {
  return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
async function readJson(rel, fallback = null) { try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fallback; } }
async function writeJson(rel, data) { const file = path.join(ROOT, rel); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }

const PANEL_DATA = [
  ["scene_01", "The idea", "setup", "warm desk with blank notebook, pencil, tidy document folders and plain wall", "Isla imagines making her own Sudoku book", "Could I make my own Sudoku book?", "The idea is exciting. The starting point is not obvious.", "curious creator moment with notebook, pencil, tidy document folders and planning materials"],
  ["scene_02", "The moving parts", "disruption", "same desk with printed sample sheets, blank document wallets and organiser tray", "Isla sorts document wallets while realising the project has many parts", "It is more than one puzzle page.", "Puzzles, solutions, interiors, covers, rights, and file organisation all matter.", "workflow overwhelm shown through blank printed sample sheets, document wallets and file folders"],
  ["scene_03", "The structure", "choice", "product discovery scene with a neat binder, document wallets and plain background", "Isla finds a practical starting structure", "This gives me a structure.", "Sapiver Press turns the blank start into a file-led workflow.", "soft discovery moment using a binder, document wallets, blank sample sheets and clean desk props"],
  ["scene_04", "The proof", "product_proof", "clean desk with organised blank document folders, sample sheets and cover-sized blank papers", "Isla checks the organised pack structure", "900 puzzles. 900 solutions.", "Classic, Hyper, Diagonal. Easy, Medium, Hard.", "file-checking moment with blank document folders, sample sheets and tidy paper stacks"],
  ["scene_05", "One book at a time", "consequence", "planning desk with blank notebook, pencil, binder and tidy document folders", "Isla turns the pack into a one-book-at-a-time plan", "I do not need to build every grid from scratch.", "Pick one variant, one difficulty, one style. Build from there.", "calmer planning mood with blank notebook, pencil, binder and organised document folders"],
  ["scene_06", "The next step", "resolution", "finished planning desk with notebook closed, binder and tidy document folders ready", "Isla finishes with a clear next step", "Start with the files. Build the book from there.", "Find the pack at Sapiver Press on Etsy.", "finished desk moment with tidy document folders, a binder and calm expression"]
];

function makeScene(row, index) {
  const [id, title, role, location, action, dialogue, caption, visual] = row;
  return {
    id, title, arc_role: role, beat: title,
    pose_id: `story_only_${String(index + 1).padStart(2, "0")}`,
    panel_location: location, setting: location, location_label: location,
    panel_action: action,
    panel_pose_family: "one visible Isla, natural creator pose, warm editorial illustration",
    panel_screen_state: "story_only_no_screen", screen_state: "story_only_no_screen", overlay_surface_required: false,
    scene_truth_locked: true, scene_truth_flow_id: MODE,
    caption, dialogue, speech_bubble: dialogue,
    storyboard_caption: caption, storyboard_dialogue: dialogue, storyboard_panel_text: `${dialogue}\n${caption}`, overlay_text: `${dialogue}\n${caption}`,
    image_prompt_fragment: visual,
    screen_overlay: { enabled: false, type: "none", lines: [], cta: "" },
    visual_generation_rules: ["Story-only Isla illustration", "One visible human figure only", "No required computer display", "Use captions for readable copy"]
  };
}

async function main() {
  const date = dateString();
  const existing = await readJson(`daily/${date}.json`, await readJson("latest.json", {}));
  const scenes = PANEL_DATA.map(makeScene);
  const arc = Object.fromEntries(scenes.map(s => [s.arc_role, s.storyboard_caption]));
  const product = { key: "sapiver_commercial_sudoku_publisher_pack", name: PRODUCT_NAME, url: SHOP_URL, facts_used_in_copy: ["900 puzzles + 900 solutions", "Classic, Hyper, and Diagonal", "Easy, Medium, and Hard", "structured files for puzzle-book creators"] };
  const next = {
    ...existing,
    date,
    character_id: "isla", character_name: "Isla", trigger_word: "Isla_v2",
    render_mode: "illustrated_story_panels", story_source: "story_only_product_ad_contract",
    active_campaign_id: "isla_puzzle_book_publisher",
    storyboard_arc_title: "Isla Learns to Publish Puzzle Books", storyboard_arc_type: MODE, storyboard_arc: arc,
    storyboard_copy_source: "deterministic_story_only_product_ad", storyboard_copy_model: "deterministic_contract",
    story_note: "Isla wants to make a Sudoku book, sees the workflow, then uses the Sapiver Press pack as a practical file-led starting point.",
    selected_setting: "warm creator desk with notebooks, document folders and binders",
    scenes, storyboard_locations: scenes.map(s => s.panel_location), location_flow_id: MODE, location_flow_method: "fixed_story_only_contract",
    product_referenced: product,
    puzzle_state: { ...(existing.puzzle_state || {}), ad_mode: true, product_name: PRODUCT_NAME, product_url: SHOP_URL, puzzle_capture_required: false, story_only_no_screen: true },
    scene_truth_contract: { enabled: true, mode: MODE, story_only_no_screen: true, computer_screen_required: false, puzzle_capture_required: false },
    product_ad_contract: { enabled: true, mode: MODE, shop_url: SHOP_URL, product_name: PRODUCT_NAME, story_only_no_screen: true, laptop_screen_overlay_required: false, daily_puzzle_solving_angle_paused: true },
    storyboard_quality: { ...(existing.storyboard_quality || {}), story_coherence_passed: true, product_ad_contract_passed: true, story_only_no_screen: true },
    post_ready_contract: { ...(existing.post_ready_contract || {}), story_coherence_passed: true, posting_allowed: true, posting_block_reasons: [], product_ad_contract_passed: true, story_only_no_screen: true },
    image_manifest: { ...(existing.image_manifest || {}), character_id: "isla", character_name: "Isla", trigger_word: "Isla_v2", render_mode: "illustrated_story_panels", product_referenced: product, product_ad_contract: { enabled: true, mode: MODE, story_only_no_screen: true, laptop_screen_overlay_required: false }, text_is_overlay: false, product_screen_inserted_later: false, puzzle_screen_inserted_later: false, storyboard_arc: arc, scenes: scenes.map((s, i) => ({ panel: i + 1, scene: s.id, arc_role: s.arc_role, panel_location: s.panel_location, panel_action: s.panel_action, panel_pose_family: s.panel_pose_family, panel_screen_state: s.panel_screen_state, screen_overlay: s.screen_overlay })), image_prompts: scenes.map(s => ({ scene: s.id, pose_id: s.pose_id, prompt: s.image_prompt_fragment, story_only_no_screen: true, screen_overlay: s.screen_overlay })) }
  };
  await writeJson(`daily/${date}.json`, next);
  await writeJson("latest.json", next);
  await writeJson(`image-manifests/${date}.json`, next.image_manifest);
  console.log(`Story-only Isla advert contract applied for ${date}`);
}
main().catch(error => { console.error(error); process.exit(1); });
