import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const ARC = ["setup", "disruption", "choice", "puzzle_moment", "consequence", "resolution"];
const BANNED_WORDS = ["quiet", "gentle", "pause", "thread", "anchor", "ritual", "borrowed", "understated"];
const WATCH_TERMS = ["kept", "calm", "focus", "rush", "moment", "careful", "peace"];
const REPLACEMENTS = [
  [/\bquiet, reflective minutes\b/gi, "three minutes she actually keeps"],
  [/\bquiet minutes\b/gi, "three minutes"],
  [/\bquiet\b/gi, "steady"],
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
  [/\bTrigoku penalizes any rushed guesses, so she carefully checks the shape boundaries near the tall window\./gi, "The daily rule changes the move, so Isla checks it before trusting the answer."],
  [/\bTrigoku penalizes\b/gi, "The daily rule changes"],
  [/\bToday has its own little rule-set\s*—\s*check the constraint before rushing\.?/gi, "Check the daily rule before trusting it."],
  [/\bkept journey\b/gi, "journey"],
  [/\bkept bookshop\b/gi, "bookshop corner"],
  [/\bkept moment\b/gi, "minute"],
  [/\bminutes of peace\b/gi, "minutes to think"],
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
function normaliseVariant(story) {
  const vName = realVariantName(story);
  if (!vName) {
    story.variant_recap = { variant_name: null, variant_detected: false, line: null, short_rule: null, panel_index: story?.variant_recap?.panel_index || 4 };
    story.image_manifest = story.image_manifest || {};
    story.image_manifest.variant_recap = story.variant_recap;
  } else {
    story.variant_recap = { ...(story.variant_recap || {}), variant_name: vName, variant_detected: true, line: realVariantLine(story) || story.variant_recap?.line || null };
    story.image_manifest = story.image_manifest || {};
    story.image_manifest.variant_recap = story.variant_recap;
  }
  return story;
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
    scene.storyboard_caption = caption.toLowerCase().includes(vName.toLowerCase()) ? caption : `${vName} changes the move, so Isla checks the rule before trusting it.`;
    scene.caption = scene.storyboard_caption;
    if (vLine) scene.storyboard_dialogue = vLine;
  } else {
    scene.storyboard_caption = "The daily rule changes the move, so Isla checks it before trusting the answer.";
    scene.caption = scene.storyboard_caption;
    scene.storyboard_dialogue = "Check the daily rule before trusting it.";
  }
  scene.dialogue = scene.storyboard_dialogue;
  scene.speech_bubble = scene.storyboard_dialogue;
  return scene;
}
function wordCounts(scenes) {
  const counts = Object.fromEntries(WATCH_TERMS.map((term) => [term, 0]));
  for (const scene of scenes) {
    const text = clean(scene.storyboard_caption || scene.caption || "").toLowerCase();
    for (const term of WATCH_TERMS) if (new RegExp(`\\b${term}\\b`, "i").test(text)) counts[term] += 1;
  }
  return counts;
}
function reduceRepeatedTerms(scenes) {
  const counts = wordCounts(scenes);
  const repeated = Object.entries(counts).filter(([, count]) => count >= 3).map(([term]) => term);
  if (!repeated.length) return { scenes, repeated, changed: false };
  const swaps = {
    kept: ["saved", "held", "claimed", "protected", "left"],
    calm: ["steady", "clear", "settled", "level", "unhurried"],
    focus: ["attention", "line", "route", "space", "thinking"],
    rush: ["pressure", "clock", "hurry", "noise", "deadline"],
    moment: ["minute", "space", "beat", "chance", "gap"],
    careful: ["checked", "measured", "deliberate", "clean", "proved"],
    peace: ["space", "room", "breath", "thinking", "air"],
  };
  let changed = false;
  const seen = Object.fromEntries(repeated.map((term) => [term, 0]));
  const nextScenes = scenes.map((scene) => {
    let caption = scene.storyboard_caption || scene.caption || "";
    for (const term of repeated) {
      if (new RegExp(`\\b${term}\\b`, "i").test(caption)) {
        seen[term] += 1;
        if (seen[term] >= 2) {
          const replacement = swaps[term]?.[(seen[term] - 2) % swaps[term].length] || term;
          caption = caption.replace(new RegExp(`\\b${term}\\b`, "gi"), replacement);
          changed = true;
        }
      }
    }
    return { ...scene, storyboard_caption: clean(caption), caption: clean(caption) };
  });
  return { scenes: nextScenes, repeated, changed };
}
function buildQuality(scenes, previous = {}, repetition = {}) {
  const captions = scenes.map((scene) => clean(scene.storyboard_caption || scene.caption || ""));
  const all = captions.join(" ");
  const hits = bannedHits(all);
  return { ...previous, final_lint_passed: hits.length === 0, final_banned_word_hits: hits, generic_phrase_hits: Array.from(new Set([...(previous.generic_phrase_hits || []), ...hits])), copy_repetition_lint: { ran: true, repeated_terms: repetition.repeated || [], changed: Boolean(repetition.changed) } };
}
function syncManifest(story, manifest = {}) {
  manifest.variant_recap = story.variant_recap || manifest.variant_recap || null;
  manifest.storyboard_arc = story.storyboard_arc;
  manifest.storyboard_quality = story.storyboard_quality;
  manifest.storyboard_arc_title = story.storyboard_arc_title;
  manifest.final_storyboard_lint = story.final_storyboard_lint;
  manifest.copy_repetition_lint = story.copy_repetition_lint;
  manifest.storyboard_copy_source = story.storyboard_copy_source;
  manifest.image_prompts = (story.scenes || []).slice(0, 6).map((scene, index) => ({ ...(manifest.image_prompts?.[index] || {}), scene: scene.id, pose_id: scene.pose_id, caption: scene.caption, dialogue: scene.dialogue, storyboard_caption: scene.storyboard_caption, storyboard_dialogue: scene.storyboard_dialogue }));
  return manifest;
}

async function main() {
  const date = dateString();
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story?.scenes?.length) { console.log("Final storyboard lint skipped: missing story scenes"); return; }
  story = normaliseVariant(story);
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
  const repetition = reduceRepeatedTerms(story.scenes);
  story.scenes = repetition.scenes.map((scene) => ({ ...scene, storyboard_panel_text: scene.storyboard_dialogue ? `${scene.storyboard_dialogue}\n${scene.storyboard_caption}` : scene.storyboard_caption }));
  story.storyboard_arc = Object.fromEntries(ARC.map((key, index) => [key, story.scenes[index]?.storyboard_caption || ""]));
  story.storyboard_arc_title = story.storyboard_arc_title || "Isla keeps the day from deciding for her";
  story.copy_repetition_lint = { ran: true, repeated_terms: repetition.repeated, changed: repetition.changed };
  story.storyboard_quality = buildQuality(story.scenes, story.storyboard_quality || {}, repetition);
  story.final_storyboard_lint = { ran: true, changed: before !== story.scenes.map((scene) => `${scene.storyboard_dialogue || ""}\n${scene.storyboard_caption || ""}`).join("\n"), banned_words: BANNED_WORDS, variant_name_available: Boolean(realVariantName(story)) };
  story.image_manifest = syncManifest(story, story.image_manifest || {});
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  console.log(`Final storyboard lint: ${story.storyboard_quality.final_lint_passed ? "passed" : "failed"}`);
  console.log(`Repeated terms: ${repetition.repeated.length ? repetition.repeated.join(", ") : "none"}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
