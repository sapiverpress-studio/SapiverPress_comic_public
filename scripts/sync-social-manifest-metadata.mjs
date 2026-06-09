import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();

function dateString() {
  return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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

function sceneTruthRows(story, imageManifest) {
  const storyScenes = Array.isArray(story?.scenes) ? story.scenes : [];
  const manifestScenes = Array.isArray(imageManifest?.scenes) ? imageManifest.scenes : [];
  const rows = [];
  const count = Math.max(storyScenes.length, manifestScenes.length, 6);
  for (let index = 0; index < count; index += 1) {
    const s = storyScenes[index] || {};
    const m = manifestScenes[index] || {};
    rows.push({
      panel: index + 1,
      scene_id: s.id || m.scene_id || m.scene || `scene_${String(index + 1).padStart(2, "0")}`,
      arc_role: s.arc_role || m.arc_role || "",
      panel_location: s.panel_location || s.setting || m.panel_location || "",
      panel_action: s.panel_action || m.panel_action || "",
      panel_pose_family: s.panel_pose_family || m.panel_pose_family || "",
      panel_screen_state: s.panel_screen_state || m.panel_screen_state || "",
      scene_truth_flow_id: s.scene_truth_flow_id || m.scene_truth_flow_id || story?.location_flow_id || story?.scene_truth_contract?.mode || "unknown",
      supporting_life_trigger_here: Boolean(s.supporting_life_trigger_here || m.supporting_life_trigger_here),
      storyboard_caption: s.storyboard_caption || s.caption || m.storyboard_caption || "",
      storyboard_dialogue: s.storyboard_dialogue || s.dialogue || s.speech_bubble || m.storyboard_dialogue || "",
    });
  }
  return rows.slice(0, 6);
}

function syncProductAdFields(merged, story, imageManifest) {
  const productAd = story?.product_ad_contract || imageManifest?.product_ad_contract || null;
  const product = story?.product_referenced || imageManifest?.product_referenced || null;
  if (!productAd?.enabled && !story?.puzzle_state?.ad_mode) return merged;

  const productName = product?.name || productAd?.product_name || "Commercial Sudoku Publisher Starter Pack";
  const productUrl = product?.url || productAd?.shop_url || story?.puzzle_state?.product_url || "https://sapiverpress.etsy.com";

  return {
    ...merged,
    puzzle_product: productName,
    puzzle_url: productUrl,
    product_name: productName,
    product_url: productUrl,
    active_campaign_id: story?.active_campaign_id || imageManifest?.active_campaign_id || merged.active_campaign_id || "isla_puzzle_book_publisher",
    active_ad_material_id: story?.active_ad_material_id || imageManifest?.active_ad_material_id || merged.active_ad_material_id || "commercial_sudoku_vol001",
    product_ad_contract: productAd || merged.product_ad_contract,
    product_referenced: product || merged.product_referenced,
    daily_puzzle_solving_angle_paused: true,
  };
}

function mergeMetadata(target, story, imageManifest) {
  let merged = { ...target };
  const keys = [
    "puzzle_moment_copy_snapshot",
    "puzzle_moment_copy_protection",
    "location_or_normalised",
    "storyboard_arc",
    "storyboard_quality",
    "story_coherence_lint",
    "prompt_lint",
    "post_ready_contract",
    "final_copy_sanity",
    "location_flow_validated",
    "location_flow",
    "location_flow_id",
    "location_flow_method",
    "storyboard_locations",
    "variant_recap",
    "variant_copy_mode",
    "variant_detection_unresolved",
    "quality_gate_action",
    "quality_gate_repair_reasons",
    "scene_truth_contract",
    "story_continuity",
    "supporting_life_trigger",
    "supporting_cast_policy",
    "active_campaign_id",
    "campaign_strategy",
    "active_ad_material_id",
    "active_ad_material",
    "product_ad_contract",
    "product_referenced",
  ];
  for (const key of keys) {
    if (story?.[key] !== undefined) merged[key] = story[key];
    else if (imageManifest?.[key] !== undefined) merged[key] = imageManifest[key];
  }

  merged = syncProductAdFields(merged, story, imageManifest);

  merged.scene_truth_rows = sceneTruthRows(story, imageManifest);
  merged.intentional_no_puzzle_panels = merged.scene_truth_rows
    .filter((row) => ["no_puzzle", "closed_device"].includes(row.panel_screen_state))
    .map((row) => row.panel);
  merged.supporting_life_overlay_drawn = merged.scene_truth_rows.some((row) => row.supporting_life_trigger_here);

  if (Array.isArray(merged.scenes)) {
    merged.scenes = merged.scenes.map((scene, index) => ({
      ...scene,
      ...(merged.scene_truth_rows[index] || {}),
    }));
  } else {
    merged.scenes = merged.scene_truth_rows;
  }
  return merged;
}

async function main() {
  const date = dateString();
  const story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  const imageManifest = await readJson(`image-manifests/${date}.json`, null);
  if (!story && !imageManifest) {
    console.log("Social manifest metadata sync skipped: no story/image manifest found");
    return;
  }

  let changed = 0;
  for (const rel of [`social/${date}/manifest.json`, "social/latest/manifest.json"]) {
    const manifest = await readJson(rel, null);
    if (!manifest) continue;
    const next = mergeMetadata(manifest, story, imageManifest);
    await writeJson(rel, next);
    changed += 1;
  }
  console.log(`Social manifest metadata sync: ${changed} manifest(s) updated`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
