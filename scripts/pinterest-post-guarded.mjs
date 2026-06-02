import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function readJson(rel, fallback = null) {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fallback; }
}

function gateResult(story, manifest) {
  const reasons = [];
  const contract = story?.post_ready_contract || manifest?.post_ready_contract || {};
  const coherence = story?.story_coherence_lint || manifest?.story_coherence_lint || {};
  const quality = story?.storyboard_quality || manifest?.storyboard_quality || {};
  const finalCopy = story?.final_copy_sanity || manifest?.final_copy_sanity || {};
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
  const manifest = await readJson(`social/${date}/manifest.json`, await readJson("social/latest/manifest.json", null));
  const gate = gateResult(story, manifest);
  if (!gate.allowed) {
    console.log(`Pinterest post skipped: posting_allowed=false (${gate.reasons.join(", ")})`);
    return;
  }
  console.log("Pinterest posting gate passed.");
  await import("./pinterest-post.mjs");
}

main().catch((error) => { console.error(error); process.exit(1); });
