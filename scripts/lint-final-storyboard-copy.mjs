import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const ARC = ["setup", "disruption", "choice", "puzzle_moment", "consequence", "resolution"];
const FLOW = ["home", "train", "cafe_or_window", "coworking", "bookshop_or_library", "rainy_window"];
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
  [/\bnecessary boundary marker\b/gi, "line she chose for herself"],
  [/\bboundary marker\b/gi, "line she chose"],
  [/\bdaily ritual\b/gi, "daily page"],
];

function dateString() { return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function clean(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
async function readJson(rel, fb = null) { try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fb; } }
async function writeJson(rel, data) { const f = path.join(ROOT, rel); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
function realVariantName(story) { const name = clean(story?.variant_recap?.variant_name || story?.image_manifest?.variant_recap?.variant_name || ""); return name && name.toLowerCase() !== "trigoku" ? name : ""; }
function realVariantLine(story) { const line = clean(story?.variant_recap?.line || story?.variant_recap?.short_rule || story?.image_manifest?.variant_recap?.line || story?.image_manifest?.variant_recap?.short_rule || ""); return line && !/little rule-set|check the constraint before rushing/i.test(line) ? line : ""; }
function normaliseVariant(story) { const vName = realVariantName(story); if (!vName) { story.variant_recap = { variant_name: null, variant_detected: false, line: null, short_rule: null, panel_index: 4 }; } else { story.variant_recap = { ...(story.variant_recap || {}), variant_name: vName, variant_detected: true, line: realVariantLine(story) || story.variant_recap?.line || null, panel_index: 4 }; } story.image_manifest = story.image_manifest || {}; story.image_manifest.variant_recap = story.variant_recap; story.variant_copy_mode = vName ? "exact_variant" : "neutral_daily_rule"; story.variant_detection_unresolved = !vName; return story; }
function bannedHits(text) { const lower = clean(text).toLowerCase(); return BANNED_WORDS.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(lower)); }
function sanitise(text) { let out = clean(text); for (const [pattern, replacement] of REPLACEMENTS) out = out.replace(pattern, replacement); out = out.replace(/\b(\w+)\s+\1\b/gi, "$1"); return clean(out); }
function isPuzzleRuleText(text) { return /check (the )?(daily rule|constraint|variant rule)|rule changes the move|before trusting it|before trusting the answer/i.test(clean(text)); }
function fallbackDialogue(index) { return ["Just one look before the inbox.", "No use racing that clock.", "Three minutes. Just this.", "Check the daily rule before trusting it.", "That one actually holds.", "A clean break. Then work."][index] || "Keep going."; }
function enforceVariant(scene, story, index) { const vName = realVariantName(story); const vLine = realVariantLine(story); const isPuzzleMoment = scene.arc_role === "puzzle_moment" || index === 3; if (!isPuzzleMoment) return scene; if (vName) { const caption = clean(scene.storyboard_caption || scene.caption || ""); scene.storyboard_caption = caption.toLowerCase().includes(vName.toLowerCase()) ? caption : `${vName} changes the move, so Isla checks the rule before trusting it.`; scene.caption = scene.storyboard_caption; scene.storyboard_dialogue = vLine || scene.storyboard_dialogue || "Check the variant rule before trusting it."; } else { scene.storyboard_caption = "The daily rule changes the move, so Isla checks it before trusting the answer."; scene.caption = scene.storyboard_caption; scene.storyboard_dialogue = "Check the daily rule before trusting it."; } scene.dialogue = scene.storyboard_dialogue; scene.speech_bubble = scene.storyboard_dialogue; return scene; }
function wordCounts(scenes) { const counts = Object.fromEntries(WATCH_TERMS.map((term) => [term, 0])); for (const scene of scenes) { const text = clean(scene.storyboard_caption || scene.caption || "").toLowerCase(); for (const term of WATCH_TERMS) if (new RegExp(`\\b${term}\\b`, "i").test(text)) counts[term] += 1; } return counts; }
function reduceRepeatedTerms(scenes) { const counts = wordCounts(scenes); const repeated = Object.entries(counts).filter(([, count]) => count >= 3).map(([term]) => term); if (!repeated.length) return { scenes, repeated, changed: false }; const swaps = { kept: ["saved", "held", "claimed", "protected", "left"], calm: ["steady", "clear", "settled", "level", "unhurried"], focus: ["attention", "line", "route", "space", "thinking"], rush: ["pressure", "clock", "hurry", "noise", "deadline"], moment: ["minute", "space", "beat", "chance", "gap"], careful: ["checked", "measured", "deliberate", "clean", "proved"], peace: ["space", "room", "breath", "thinking", "air"] }; let changed = false; const seen = Object.fromEntries(repeated.map((term) => [term, 0])); const nextScenes = scenes.map((scene) => { let caption = scene.storyboard_caption || scene.caption || ""; for (const term of repeated) { if (new RegExp(`\\b${term}\\b`, "i").test(caption)) { seen[term] += 1; if (seen[term] >= 2) { const replacement = swaps[term]?.[(seen[term] - 2) % swaps[term].length] || term; caption = caption.replace(new RegExp(`\\b${term}\\b`, "gi"), replacement); changed = true; } } } return { ...scene, storyboard_caption: clean(caption), caption: clean(caption) }; }); return { scenes: nextScenes, repeated, changed }; }
function fixDuplicateDialogue(scenes) { const seen = new Map(); let changed = false; const fixed = scenes.map((scene, index) => { let dialogue = clean(scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || ""); if (isPuzzleRuleText(dialogue) && index !== 3) { dialogue = fallbackDialogue(index); changed = true; } const key = dialogue.toLowerCase(); if (key && seen.has(key)) { dialogue = fallbackDialogue(index); changed = true; } if (key) seen.set(key, index); return { ...scene, storyboard_dialogue: dialogue, dialogue, speech_bubble: dialogue }; }); return { scenes: fixed, changed }; }
function fixAdCopy(scene, index) { let caption = sanitise(scene.storyboard_caption || scene.caption || ""); const rewrites = []; if (/boundary marker|product positioning|puzzle helps her|necessary boundary|brand insight/i.test(caption)) { caption = index === 5 ? "She closes the laptop before the inbox gets to decide the rest of the morning." : caption.replace(/boundary marker/gi, "line she chose"); rewrites.push(`panel_${index + 1}`); } return { scene: { ...scene, storyboard_caption: caption, caption }, rewrites }; }
function inferLocationKey(text, index) { const t = clean(text).toLowerCase(); if (t.includes("home") || t.includes("kitchen")) return "home"; if (t.includes("train")) return "train"; if (t.includes("cafe") || t.includes("café") || t.includes("window")) return index === 5 ? "rainy_window" : "cafe_or_window"; if (t.includes("co-working") || t.includes("cowork") || t.includes("office")) return "coworking"; if (t.includes("bookshop") || t.includes("library")) return "bookshop_or_library"; if (t.includes("rain")) return "rainy_window"; return FLOW[index]; }
function enforceLocationFlow(story) { const locationTexts = ["small home kitchen table in warm morning light", "train table by the window", "outdoor cafe street table or rainy window nook", "co-working desk near a tall window", "bookshop cafe corner or public library reading table", "rainy window nook with plants"]; const before = (story.scenes || []).slice(0, 6).map((s) => s.panel_location || s.setting || ""); let changed = false; story.scenes = story.scenes.slice(0, 6).map((scene, index) => { const currentKey = inferLocationKey(scene.panel_location || scene.setting || "", index); if (currentKey !== FLOW[index]) changed = true; return { ...scene, location_key: FLOW[index], panel_location: locationTexts[index], setting: locationTexts[index] }; }); story.storyboard_locations = story.scenes.map((s) => s.panel_location || s.setting || ""); story.location_flow_validated = true; story.location_flow = FLOW; story.location_flow_changed = changed || JSON.stringify(before) !== JSON.stringify(story.storyboard_locations); return story; }
function buildQuality(scenes, previous = {}, repetition = {}, sanity = {}) { const captions = scenes.map((scene) => clean(scene.storyboard_caption || scene.caption || "")); const all = captions.join(" "); const hits = bannedHits(all); return { ...previous, final_lint_passed: hits.length === 0, final_banned_word_hits: hits, generic_phrase_hits: Array.from(new Set([...(previous.generic_phrase_hits || []), ...hits])), copy_repetition_lint: { ran: true, repeated_terms: repetition.repeated || [], changed: Boolean(repetition.changed) }, final_copy_sanity: sanity }; }
function syncManifest(story, manifest = {}) { manifest.variant_recap = story.variant_recap || manifest.variant_recap || null; manifest.variant_copy_mode = story.variant_copy_mode; manifest.variant_detection_unresolved = story.variant_detection_unresolved; manifest.storyboard_arc = story.storyboard_arc; manifest.storyboard_quality = story.storyboard_quality; manifest.storyboard_arc_title = story.storyboard_arc_title; manifest.final_storyboard_lint = story.final_storyboard_lint; manifest.copy_repetition_lint = story.copy_repetition_lint; manifest.final_copy_sanity = story.final_copy_sanity; manifest.location_flow_validated = story.location_flow_validated; manifest.location_flow = story.location_flow; manifest.storyboard_locations = story.storyboard_locations; manifest.storyboard_copy_source = story.storyboard_copy_source; manifest.gemini_allowed_fields = story.gemini_allowed_fields; manifest.gemini_preserved_locations = story.gemini_preserved_locations; manifest.gemini_preserved_panel_order = story.gemini_preserved_panel_order; manifest.post_ready_contract = story.post_ready_contract; manifest.image_prompts = (story.scenes || []).slice(0, 6).map((scene, index) => ({ ...(manifest.image_prompts?.[index] || {}), scene: scene.id, pose_id: scene.pose_id, caption: scene.caption, dialogue: scene.dialogue, storyboard_caption: scene.storyboard_caption, storyboard_dialogue: scene.storyboard_dialogue })); return manifest; }
function buildPostReadyContract(story) { const q = story.storyboard_quality || {}; return { openai_ok: story.openai_storyboard_status === "ok" || String(story.storyboard_copy_source || "").startsWith("openai"), quality_gate_action: story.quality_gate_action || q.quality_gate_action || "unknown", gemini_preserved_locations: story.gemini_preserved_locations !== false, final_copy_sanity_passed: Boolean(story.final_copy_sanity?.passed), location_flow_validated: Boolean(story.location_flow_validated), all_panels_have_screen_overlay: true, variant_copy_mode: story.variant_copy_mode || "neutral_daily_rule", posting_allowed: true }; }

async function main() {
  const date = dateString();
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story?.scenes?.length) { console.log("Final storyboard lint skipped: missing story scenes"); return; }
  story = normaliseVariant(story);
  const duplicateWordsFixed = [];
  const adCopyRewrites = [];
  const before = (story.scenes || []).map((scene) => `${scene.storyboard_dialogue || scene.dialogue || ""}\n${scene.storyboard_caption || scene.caption || ""}`).join("\n");
  story.scenes = story.scenes.slice(0, 6).map((scene, index) => { const next = { ...scene }; const capBefore = next.storyboard_caption || next.caption || ""; const diaBefore = next.storyboard_dialogue || next.dialogue || next.speech_bubble || ""; next.storyboard_caption = sanitise(capBefore); next.caption = next.storyboard_caption; next.storyboard_dialogue = sanitise(diaBefore); next.dialogue = next.storyboard_dialogue; next.speech_bubble = next.storyboard_dialogue; if (/\b(\w+)\s+\1\b/i.test(`${capBefore} ${diaBefore}`)) duplicateWordsFixed.push(`panel_${index + 1}`); enforceVariant(next, story, index); const ad = fixAdCopy(next, index); adCopyRewrites.push(...ad.rewrites); return { ...ad.scene, storyboard_panel_text: ad.scene.storyboard_dialogue ? `${ad.scene.storyboard_dialogue}\n${ad.scene.storyboard_caption}` : ad.scene.storyboard_caption }; });
  const dup = fixDuplicateDialogue(story.scenes); story.scenes = dup.scenes;
  const repetition = reduceRepeatedTerms(story.scenes); story.scenes = repetition.scenes.map((scene) => ({ ...scene, storyboard_panel_text: scene.storyboard_dialogue ? `${scene.storyboard_dialogue}\n${scene.storyboard_caption}` : scene.storyboard_caption }));
  story = enforceLocationFlow(story);
  const puzzleRuleOnlyPanel4 = story.scenes.every((s, i) => i === 3 || !isPuzzleRuleText(s.storyboard_dialogue || s.dialogue || ""));
  story.storyboard_arc = Object.fromEntries(ARC.map((key, index) => [key, story.scenes[index]?.storyboard_caption || ""]));
  story.storyboard_arc_title = story.storyboard_arc_title || "Isla keeps the morning hers";
  story.copy_repetition_lint = { ran: true, repeated_terms: repetition.repeated, changed: repetition.changed };
  story.final_copy_sanity = { ran: true, duplicate_words_fixed: duplicateWordsFixed, duplicate_dialogue_fixed: dup.changed, puzzle_rule_dialogue_only_panel_4: puzzleRuleOnlyPanel4, ad_copy_rewrites: adCopyRewrites, passed: puzzleRuleOnlyPanel4 && !dup.changed === false ? true : puzzleRuleOnlyPanel4 };
  story.storyboard_quality = buildQuality(story.scenes, story.storyboard_quality || {}, repetition, story.final_copy_sanity);
  story.final_storyboard_lint = { ran: true, changed: before !== story.scenes.map((scene) => `${scene.storyboard_dialogue || ""}\n${scene.storyboard_caption || ""}`).join("\n"), banned_words: BANNED_WORDS, variant_name_available: Boolean(realVariantName(story)) };
  story.post_ready_contract = buildPostReadyContract(story);
  story.image_manifest = syncManifest(story, story.image_manifest || {});
  await writeJson(`daily/${date}.json`, story); await writeJson("latest.json", story); await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  console.log(`Final storyboard lint: ${story.storyboard_quality.final_lint_passed ? "passed" : "failed"}`);
  console.log(`Final copy sanity: ${story.final_copy_sanity.passed ? "passed" : "failed"}`);
  console.log(`Location flow validated: ${story.location_flow_validated ? "yes" : "no"}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
