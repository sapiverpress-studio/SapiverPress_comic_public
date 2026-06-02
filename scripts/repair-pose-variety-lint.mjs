import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override && !/^\d{4}-\d{2}-\d{2}$/.test(override)) throw new Error(`DATE_OVERRIDE must be YYYY-MM-DD. Received: ${override}`);
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function clean(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
async function readJson(rel, fallback = null) { try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fallback; } }
async function writeJson(rel, data) { const file = path.join(ROOT, rel); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }

function isActualSeatedLaptopPose(scene) {
  const text = clean(`${scene.panel_pose_family || ""} ${scene.panel_action || ""} ${scene.scene_description || ""}`).toLowerCase();
  if (!text) return false;
  if (/\b(not seated|not another|not a seated|standing|walking|full[- ]body|packing|closing laptop|looking away from screen|side[- ]angle|over[- ]shoulder|waiting pose|hands on bag)\b/i.test(text)) return false;
  if (/\b(seated|sitting|typing|trackpad|head-on laptop|front-on laptop|desk shot)\b/i.test(text)) return true;
  if (/\blaptop\b/i.test(text) && /\b(screen|desk|typing|trackpad|solving)\b/i.test(text)) return true;
  return false;
}

function recompute(story) {
  const scenes = Array.isArray(story.scenes) ? story.scenes : [];
  const seated = scenes.map((scene, index) => ({ scene, index: index + 1 })).filter(({ scene }) => isActualSeatedLaptopPose(scene)).map(({ index }) => index);
  const passed = seated.length <= 3;
  const lint = story.story_coherence_lint || {};
  const issues = Array.isArray(lint.issues) ? lint.issues.slice() : [];
  const nextIssues = passed ? issues.filter((i) => i !== "too_many_seated_laptop_like_panels") : Array.from(new Set([...issues, "too_many_seated_laptop_like_panels"]));
  const overallPassed = nextIssues.length === 0;
  story.story_coherence_lint = {
    ...lint,
    passed: overallPassed,
    issues: nextIssues,
    pose_variety: {
      ...(lint.pose_variety || {}),
      repaired_negation_aware: true,
      seated_laptop_like_panels: seated,
      count: seated.length,
      passed,
    },
    checked_at: new Date().toISOString(),
  };
  story.storyboard_quality = {
    ...(story.storyboard_quality || {}),
    pose_variety_passed: passed,
    story_coherence_passed: overallPassed,
  };
  story.post_ready_contract = {
    ...(story.post_ready_contract || {}),
    story_coherence_passed: overallPassed,
    posting_allowed: overallPassed && story.storyboard_quality?.final_lint_passed !== false && story.final_copy_sanity?.passed !== false,
    posting_block_reasons: overallPassed ? [] : nextIssues,
  };
  story.image_manifest = {
    ...(story.image_manifest || {}),
    story_coherence_lint: story.story_coherence_lint,
    storyboard_quality: story.storyboard_quality,
    post_ready_contract: story.post_ready_contract,
  };
  return { passed, seated, overallPassed, nextIssues };
}

async function main() {
  const date = dateString();
  const story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);
  const result = recompute(story);
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest || {});
  console.log(`Pose variety lint repaired: ${result.passed ? "passed" : "failed"} (${result.seated.length} actual seated/laptop-like panels; issues=${result.nextIssues.join(",") || "none"})`);
}

main().catch((error) => { console.error(error); process.exit(1); });
