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

async function readJson(rel, fb = null) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8"));
  } catch {
    return fb;
  }
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

function isFailure(scene) {
  const mode = String(scene?.screen_quad_mode || "");
  if (mode === "overlay_skipped_no_screen_detected" || mode === "missing") return true;
  return !hasValidQuad(scene);
}

async function main() {
  const date = dateString();
  const manifestRel = `social/${date}/manifest.json`;
  const latestRel = "social/latest/manifest.json";
  const manifest = await readJson(manifestRel, await readJson(latestRel, null));
  if (!manifest) throw new Error(`Missing ${manifestRel} and ${latestRel}`);

  const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  const failures = scenes.filter(isFailure).map((scene) => ({
    scene: scene.scene,
    output: scene.output,
    screen_quad_mode: scene.screen_quad_mode || "missing",
    panel_location: scene.panel_location || "",
  }));
  const recovered = scenes.filter((scene) => scene.recovered_from_missing_replacement_screen).map((scene) => ({
    scene: scene.scene,
    output: scene.output,
    screen_quad_mode: scene.screen_quad_mode || "",
    failed_replacements: scene.failed_replacements || [],
  }));

  manifest.all_panels_have_screen_overlay = failures.length === 0;
  manifest.screen_overlay_failures = failures;
  manifest.screen_overlay_recoveries = recovered;
  manifest.posting_allowed = failures.length === 0;
  if (manifest.post_ready_contract) {
    manifest.post_ready_contract.all_panels_have_screen_overlay = failures.length === 0;
    manifest.post_ready_contract.posting_allowed = failures.length === 0 && manifest.post_ready_contract.posting_allowed !== false;
  }

  await writeJson(manifestRel, manifest);
  await writeJson(latestRel, manifest);

  if (failures.length) {
    console.error(`Screen overlay validation failed: ${failures.map((f) => `${f.scene}:${f.screen_quad_mode}`).join(", ")}`);
    process.exit(1);
  }
  console.log(`Screen overlay validation passed: all panels have valid screen quads (${recovered.length} recovered from template)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
