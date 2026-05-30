import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const ARC = ["setup", "disruption", "choice", "puzzle_moment", "consequence", "resolution"];
const BANNED_WORDS = ["quiet", "gentle", "pause", "thread", "anchor", "ritual", "borrowed", "understated"];
const REPLACEMENTS = [
  [/\bquiet, reflective minutes\b/gi, "three minutes she actually keeps"],
  [/\bquiet minutes\b/gi, "kept minutes"],
  [/\bquiet\b/gi, "kept"],
  [/\bgentle rhythm\b/gi, "steadier pace"],
  [/\bgentle\b/gi, "steady"],
  [/\bpatient pause\b/gi, "waiting it out"],
  [/\bpause\b/gi, "breath"],
  [/\bthread\b/gi, "line"],
  [/\banchor\b/gi, "marker"],
  [/\britual\b/gi, "habit"],
  [/\bborrowed\b/gi, "kept"],
  [/\bunderstated\b/gi, "plain"],
  [/\bTrigoku constraint\b/gi, "daily constraint"],
  [/\bthe Trigoku grid\b/gi, "the grid"],
];

function dateString() {
  return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function clean(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
async function readJson(rel, fb = null) { try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fb; } }
async function writeJson(rel, data) { const f = path.join(ROOT, rel); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }

function realVariantName(story) {
  const name = clean(story?.variant_recap?.variant_name || story?.image_manifest?.variant_recap?.variant_name || "");
  return name && name.toLowerCase() !== "trigoku" ? name : "";
}

function realVariantLine(story) {
  const line = clean(story?.variant_recap?.line || story?.variant_recap?.short_rule || story?.image_manifest?.variant_recap?.line || story?.image_manifest?.variant_recap?.short_rule || "");
  return line && !/little rule-set|check the constraint before rushing/i.test(line) ? line : "";
}

function bannedHits(text) {
  const lower = clean(text).toLowerCase();
  return BANNED_WORDS.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(lower));
}

function sanitise(text) {
  let out = clean(text);
  for (const [pattern, replacement] of REPLACEMENTS) out = out.replace(pattern, replacement);
  return clean(out);
}

function enforceVariant(scene, story, index) {
  const vName = realVariantName(story);
  const vLine = realVariantLine(story);
  const isPuzzleMoment = scene.arc_role === "puzzle_moment" || index === 3;
  if (!isPuzzleMoment) return scene;

  if (vName) {
    const caption = clean(scene.storyboard_caption || scene.caption || "");
    const hasName = caption.toLowerCase().includes(vName.toLowerCase());
    scene.storyboard_caption = hasName ? caption : `${vName} changes the move, so Isla checks the rule before trusting it.`;
    scene.caption = scene.storyboard_caption;
  } else {
    scene.storyboard_caption = sanitise(scene.storyboard_caption || scene.caption || "").replace(/\bTrigoku constraint\b/gi, "daily constraint");
    scene.caption = scene.storyboard_caption;
  }

  if (vLine) {
    scene.storyboard_dialogue = vLine;
    scene.dialogue = vLine;
    scene.speech_bubble = vLine;
  }
  return scene;
}

function buildQuality(scenes, previous = {}) {
  const captions = scenes.map((scene) => clean(scene.storyboard_caption || scene.caption || ""));
  const all = captions.join(" ");
  const hits = bannedHits(all);
  return {
    ...previous,
    final_lint_passed: hits.length === 0,
    final_banned_word_hits: hits,
    generic_phrase_hits: Array.from(new Set([...(previous.generic_phrase_hits || []), ...hits])),
  };
}

function syncManifest(story, manifest = {}) {
  manifest.storyboard_arc = story.storyboard_arc;
  manifest.storyboard_quality = story.storyboard_quality;
  manifest.storyboard_arc_title = story.storyboard_arc_title;
  manifest.final_storyboard_lint = story.final_storyboard_lint;
  manifest.storyboard_copy_source = story.storyboard_copy_source;
  manifest.image_prompts = (story.scenes || []).slice(0, 6).map((scene, index) => ({
    ...(manifest.image_prompts?.[index] || {}),
    scene: scene.id,
    pose_id: scene.pose_id,
    caption: scene.caption,
    dialogue: scene.dialogue,
    storyboard_caption: scene.storyboard_caption,
    storyboard_dialogue: scene.storyboard_dialogue,
  }));
  return manifest;
}

async function main() {
  const date = dateString();
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story?.scenes?.length) { console.log("Final storyboard lint skipped: missing story scenes"); return; }

  const before = (story.scenes || []).map((scene) => `${scene.storyboard_dialogue || scene.dialogue || ""}\n${scene.storyboard_caption || scene.caption || ""}`).join("\n");
  story.scenes = story.scenes.slice(0, 6).map((scene, index) => {
    const next = { ...scene };
    next.storyboard_caption = sanitise(next.storyboard_caption || next.caption || "");
    next.caption = next.storyboard_caption;
    next.storyboard_dialogue = sanitise(next.storyboard_dialogue || next.dialogue || next.speech_bubble || "");
    next.dialogue = next.storyboard_dialogue;
    next.speech_bubble = next.storyboard_dialogue;
    enforceVariant(next, story, index);
    next.storyboard_panel_text = next.storyboard_dialogue ? `${next.storyboard_dialogue}\n${next.storyboard_caption}` : next.storyboard_caption;
    return next;
  });

  story.storyboard_arc = Object.fromEntries(ARC.map((key, index) => [key, story.scenes[index]?.storyboard_caption || ""]));
  story.storyboard_arc_title = story.storyboard_arc_title || "Isla keeps the day from deciding for her";
  story.storyboard_quality = buildQuality(story.scenes, story.storyboard_quality || {});
  story.final_storyboard_lint = {
    ran: true,
    changed: before !== story.scenes.map((scene) => `${scene.storyboard_dialogue || ""}\n${scene.storyboard_caption || ""}`).join("\n"),
    banned_words: BANNED_WORDS,
    variant_name_available: Boolean(realVariantName(story)),
  };
  story.image_manifest = syncManifest(story, story.image_manifest || {});

  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  console.log(`Final storyboard lint: ${story.storyboard_quality.final_lint_passed ? "passed" : "failed"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
