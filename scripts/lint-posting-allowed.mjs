import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override && !/^\d{4}-\d{2}-\d{2}$/.test(override)) throw new Error(`DATE_OVERRIDE must be YYYY-MM-DD. Received: ${override}`);
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function readJson(rel, fallback = null) {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fallback; }
}

async function writeJson(rel, data) {
  const file = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function postReady(story, socialManifest) {
  const reasons = [];
  const contract = story?.post_ready_contract || socialManifest?.post_ready_contract || {};
  const coherence = story?.story_coherence_lint || socialManifest?.story_coherence_lint || {};
  const quality = story?.storyboard_quality || socialManifest?.storyboard_quality || {};
  const finalCopy = story?.final_copy_sanity || socialManifest?.final_copy_sanity || {};

  if (contract.posting_allowed === false) reasons.push(...(contract.posting_block_reasons || ["post_ready_contract_blocked"]));
  if (coherence.ran && coherence.passed === false) reasons.push(...(coherence.issues || ["story_coherence_failed"]));
  if (quality.final_lint_passed === false) reasons.push("final_copy_lint_failed");
  if (quality.story_coherence_passed === false) reasons.push("storyboard_quality_coherence_failed");
  if (finalCopy.ran && finalCopy.passed === false) reasons.push("final_copy_sanity_failed");
  if (!Array.isArray(story?.scenes) || story.scenes.length !== 6) reasons.push("story_scenes_missing_or_not_6");

  return { allowed: reasons.length === 0, reasons: Array.from(new Set(reasons)) };
}

async function main() {
  const date = dateString();
  const story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  const socialManifest = await readJson(`social/${date}/manifest.json`, await readJson("social/latest/manifest.json", null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);

  const result = postReady(story, socialManifest);
  const stamp = { ran: true, posting_allowed: result.allowed, posting_block_reasons: result.reasons, checked_at: new Date().toISOString() };
  story.post_ready_contract = { ...(story.post_ready_contract || {}), ...stamp };
  story.image_manifest = { ...(story.image_manifest || {}), post_ready_contract: story.post_ready_contract };
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  for (const rel of [`social/${date}/manifest.json`, "social/latest/manifest.json"]) {
    const manifest = await readJson(rel, null);
    if (!manifest) continue;
    manifest.post_ready_contract = story.post_ready_contract;
    await writeJson(rel, manifest);
  }
  console.log(`Posting guard: ${result.allowed ? "allowed" : "blocked"}${result.reasons.length ? ` (${result.reasons.join(", ")})` : ""}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
