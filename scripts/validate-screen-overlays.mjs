import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const ALLOWED_NO_OVERLAY_STATES = new Set(["no_puzzle", "closed_device", "story_only_no_screen"]);

function dateString() {
  return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function readJson(rel, fb = null) {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fb; }
}

async function writeJson(rel, data) {
  const f = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function hasValidQuad(scene) {
  return Array.isArray(scene?.screen_quad)
    && scene.screen_quad.length === 4
    && scene.screen_quad.every((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])));
}

function panelScreenState(scene) {
  return String(scene?.panel_screen_state || scene?.screen_state || "").trim().toLowerCase();
}

function panelNumber(scene, fallbackIndex = null) {
  const raw = scene?.panel || scene?.panel_number || scene?.scene || scene?.id || "";
  const match = String(raw).match(/(\d+)/);
  if (match) return Number(match[1]);
  return fallbackIndex == null ? null : fallbackIndex + 1;
}

function isNoOverlayState(scene) {
  return ALLOWED_NO_OVERLAY_STATES.has(panelScreenState(scene));
}

function isIntentionalNoOverlay(scene) {
  const mode = String(scene?.screen_quad_mode || "");
  const state = panelScreenState(scene);
  if (!ALLOWED_NO_OVERLAY_STATES.has(state)) return false;
  return mode === `overlay_skipped_screen_state_${state}` || mode === "overlay_skipped_intentional_no_puzzle" || mode === "not_required_story_only" || mode === "missing" || !hasValidQuad(scene);
}

function isRequiredPuzzlePanel(scene) {
  return !isNoOverlayState(scene);
}

function isFailure(scene) {
  if (!isRequiredPuzzlePanel(scene)) return false;
  const mode = String(scene?.screen_quad_mode || "");
  if (mode === "overlay_skipped_no_screen_detected" || mode === "missing") return true;
  return !hasValidQuad(scene);
}

function sceneRow(scene, index) {
  return {
    panel: panelNumber(scene, index),
    scene: scene.scene || scene.id || "",
    output: scene.output,
    screen_quad_mode: scene.screen_quad_mode || "missing",
    panel_screen_state: panelScreenState(scene),
    panel_location: scene.panel_location || "",
    has_valid_screen_quad: hasValidQuad(scene),
  };
}

async function main() {
  const date = dateString();
  const manifestRel = `social/${date}/manifest.json`;
  const latestRel = "social/latest/manifest.json";
  const manifest = await readJson(manifestRel, await readJson(latestRel, null));
  if (!manifest) throw new Error(`Missing ${manifestRel} and ${latestRel}`);

  const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  const requiredPuzzlePanels = scenes.map(sceneRow).filter((row, idx) => isRequiredPuzzlePanel(scenes[idx]));
  const requiredPuzzlePanelsWithOverlay = scenes.map(sceneRow).filter((row, idx) => isRequiredPuzzlePanel(scenes[idx]) && hasValidQuad(scenes[idx]));
  const failures = scenes.map(sceneRow).filter((row, idx) => isFailure(scenes[idx]));
  const intentionalNoOverlay = scenes.map(sceneRow).filter((row, idx) => isIntentionalNoOverlay(scenes[idx]));
  const recovered = scenes.filter((scene) => scene.recovered_from_missing_replacement_screen).map((scene, idx) => ({
    ...sceneRow(scene, idx),
    failed_replacements: scene.failed_replacements || [],
  }));

  const overlayStatus = {
    passed: failures.length === 0,
    required_puzzle_panel_count: requiredPuzzlePanels.length,
    required_puzzle_panels: requiredPuzzlePanels,
    required_puzzle_panels_with_overlay: requiredPuzzlePanelsWithOverlay,
    intentional_no_puzzle_panel_count: intentionalNoOverlay.length,
    intentional_no_puzzle_panels: intentionalNoOverlay,
    failures,
    recoveries: recovered,
    story_only_no_screen: intentionalNoOverlay.some((row) => row.panel_screen_state === "story_only_no_screen"),
    checked_at: new Date().toISOString(),
  };

  manifest.required_puzzle_panels = requiredPuzzlePanels;
  manifest.required_puzzle_panels_with_overlay = requiredPuzzlePanelsWithOverlay;
  manifest.all_required_puzzle_panels_have_screen_overlay = failures.length === 0;
  manifest.all_required_panels_have_screen_overlay = failures.length === 0;
  manifest.all_panels_have_screen_overlay = intentionalNoOverlay.length === 0 && failures.length === 0;
  manifest.intentional_no_puzzle_panels = intentionalNoOverlay;
  manifest.screen_overlay_failures = failures;
  manifest.screen_overlay_recoveries = recovered;
  manifest.screen_overlay_validation = overlayStatus;
  manifest.posting_allowed = failures.length === 0;
  if (manifest.post_ready_contract) {
    manifest.post_ready_contract.required_puzzle_panels = requiredPuzzlePanels;
    manifest.post_ready_contract.required_puzzle_panel_count = requiredPuzzlePanels.length;
    manifest.post_ready_contract.required_puzzle_panels_with_overlay = requiredPuzzlePanelsWithOverlay;
    manifest.post_ready_contract.all_required_puzzle_panels_have_screen_overlay = failures.length === 0;
    manifest.post_ready_contract.all_required_panels_have_screen_overlay = failures.length === 0;
    manifest.post_ready_contract.all_panels_have_screen_overlay = intentionalNoOverlay.length === 0 && failures.length === 0;
    manifest.post_ready_contract.intentional_no_puzzle_panels = intentionalNoOverlay;
    manifest.post_ready_contract.screen_overlay_validation = overlayStatus;
    manifest.post_ready_contract.posting_allowed = failures.length === 0 && manifest.post_ready_contract.posting_allowed !== false;
  }

  await writeJson(manifestRel, manifest);
  await writeJson(latestRel, manifest);

  if (failures.length) {
    console.error(`Screen overlay validation failed: required puzzle panels missing overlay: ${failures.map((f) => `${f.scene || f.panel}:${f.screen_quad_mode}`).join(", ")}`);
    process.exit(1);
  }
  console.log(`Screen overlay validation passed: ${requiredPuzzlePanelsWithOverlay.length}/${requiredPuzzlePanels.length} required puzzle panels overlaid, ${intentionalNoOverlay.length} intentional no-screen/story panels, ${recovered.length} recovered from template`);
}

main().catch((error) => { console.error(error); process.exit(1); });
