import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";

const ROOT = process.cwd();
const MODEL = process.env.OPENAI_TEXT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const openai = process.env.OPENAI_API_KEY?.trim() ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() }) : null;
const ARC_KEYS = ["setup", "disruption", "choice", "puzzle_moment", "consequence", "resolution"];
const STORY_FIELDS_USED = ["story_note", "continuation_note", "life_memory_entry", "scenes[].scene_description", "scenes[].beat", "scenes[].caption", "scenes[].dialogue", "scenes[].speech_bubble", "scenes[].storyboard_caption", "scenes[].storyboard_dialogue", "scenes[].image_prompt_fragment", "puzzle_state", "variant_recap", "uk_calendar_date"];
const BAD_PHRASES = ["quiet moment", "clearer than before", "keep the thread", "small anchor", "borrowed quiet", "less noisy", "gentle finish", "quiet satisfaction", "one clean look", "no rushing this one", "that gives me a path", "stay with it", "taking a pause", "small ritual", "quiet reset", "quiet corner", "quiet thread", "necessary boundary marker"];
const CAUSE = ["because", "so", "then", "when", "after", "before", "if", "but"];
const TURN = ["decides", "chooses", "realises", "realizes", "refuses", "learns", "notices", "waits", "carries", "claims", "checks"];

function dateString() {
  return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
async function readJson(rel, fallback = null) { try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fallback; } }
async function writeJson(rel, data) { const file = path.join(ROOT, rel); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
function storyPath(story, date) { return story?.date === date ? `daily/${date}.json` : "latest.json"; }
function hasAny(text, words) { const lower = clean(text).toLowerCase(); return words.some((word) => lower.includes(word)); }
function realVariant(story) { const name = clean(story?.variant_recap?.variant_name || ""); return name && name.toLowerCase() !== "trigoku" ? name : ""; }

function quality(frames, story) {
  const captions = frames.map((frame) => clean(frame.caption));
  const all = captions.join(" ").toLowerCase();
  const generic = BAD_PHRASES.filter((phrase) => all.includes(phrase));
  const causeCount = captions.filter((caption) => hasAny(caption, CAUSE)).length;
  const turnCount = captions.filter((caption) => hasAny(caption, TURN)).length;
  const tooShort = captions.filter((caption) => caption.split(/\s+/).filter(Boolean).length < 8).length;
  const unique = new Set(captions.map((caption) => caption.toLowerCase().replace(/\b(home|train|cafe|library|bookshop|co-working|desk|table|window)\b/g, "").trim())).size;
  const usesPhase2 = Boolean(story.story_note || story.continuation_note || story.life_memory_entry);
  const locationOnly = unique < 5 || (causeCount < 2 && turnCount < 2);
  const pass = usesPhase2 && !locationOnly && generic.length === 0 && tooShort === 0 && causeCount >= 2 && turnCount >= 1;
  return { location_sequence_only: locationOnly, has_cause_effect: causeCount >= 2, has_character_turn: turnCount >= 1, uses_phase2_story: usesPhase2, quality_gate_passed: pass, interchangeable: unique < 5, generic_phrase_hits: generic, cause_effect_link_count: causeCount, character_turn_count: turnCount };
}

function fallbackFrames(story) {
  const variant = realVariant(story);
  const rule = variant ? clean(story.variant_recap?.line || story.variant_recap?.short_rule || "Check the variant rule before trusting it.") : "Check the daily rule before trusting it.";
  const puzzleCaption = variant ? `${variant} changes the move, so Isla checks the rule before trusting it.` : "The daily rule changes the move, so Isla checks it before trusting the answer.";
  return [
    { caption: "Isla sees the errand list waiting, but opens the grid before the day takes over.", dialogue: "Start before it gets busy.", image_prompt_fragment: "setup beat, errand list waiting, laptop opening" },
    { caption: "The journey slips behind schedule, and Isla keeps working instead of chasing the clock.", dialogue: "No use racing that clock.", image_prompt_fragment: "travel disruption, train table, laptop braced" },
    { caption: "At the cafe table, she turns the phone face down and gives herself three minutes.", dialogue: "Three whole minutes, just for this.", image_prompt_fragment: "decision moment, phone ignored, outdoor cafe table" },
    { caption: puzzleCaption, dialogue: rule, image_prompt_fragment: "specific puzzle-rule check, careful deduction, active laptop screen" },
    { caption: "Because she checked it properly, the move holds and the errands feel manageable again.", dialogue: "That one holds.", image_prompt_fragment: "consequence of patience, small confirmed breakthrough" },
    { caption: "She closes the laptop before the inbox gets to decide the rest of the morning.", dialogue: "Leave it there. Move on.", image_prompt_fragment: "resolution beat, closing laptop, rainy window" },
  ];
}

function normaliseFrames(raw, story) {
  const source = Array.isArray(raw) && raw.length === 6 ? raw : fallbackFrames(story);
  const fallback = fallbackFrames(story);
  return source.slice(0, 6).map((frame, index) => ({
    panel_number: index + 1,
    arc_role: ARC_KEYS[index],
    location: clean(story.scenes?.[index]?.panel_location || story.scenes?.[index]?.setting || frame.location || story.selected_setting || ""),
    caption: clean(frame.storyboard_caption || frame.caption || fallback[index].caption),
    dialogue: clean(frame.storyboard_dialogue || frame.dialogue || frame.speech_bubble || fallback[index].dialogue),
    image_prompt_fragment: clean(frame.image_prompt_fragment || story.scenes?.[index]?.image_prompt_fragment || fallback[index].image_prompt_fragment),
  }));
}
function arcFromFrames(frames) { return Object.fromEntries(ARC_KEYS.map((key, index) => [key, frames[index]?.caption || ""])); }
function storyBrief(story, date) { return { story_source_used: storyPath(story, date), story_fields_used: STORY_FIELDS_USED, story_source: story.story_source, story_note: story.story_note, continuation_note: story.continuation_note, life_memory_entry: story.life_memory_entry, puzzle_state: story.puzzle_state, variant_recap: story.variant_recap, uk_calendar_date: story.uk_calendar_date, selected_setting: story.selected_setting, scenes: (story.scenes || []).slice(0, 6).map((scene, index) => ({ panel: index + 1, arc_role: ARC_KEYS[index], title: scene.title, beat: scene.beat, scene_description: scene.scene_description, caption: scene.storyboard_caption || scene.caption, dialogue: scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble, image_prompt_fragment: scene.image_prompt_fragment, life_beat: scene.life_beat, setting: scene.setting || scene.panel_location })) }; }

function repairFrame(frame, index, story, reasons) {
  const out = { ...frame };
  const isPuzzle = index === 3;
  out.caption = clean(out.caption).replace(/\b(\w+)\s+\1\b/gi, "$1");
  out.dialogue = clean(out.dialogue).replace(/\b(\w+)\s+\1\b/gi, "$1");
  if (!isPuzzle && /check (the )?(daily rule|constraint|variant rule)/i.test(out.dialogue)) {
    out.dialogue = index === 1 ? "No use racing that clock." : index === 2 ? "Three minutes. Just this." : "Keep it simple.";
    reasons.push(`moved_puzzle_rule_dialogue_from_panel_${index + 1}`);
  }
  if (isPuzzle) {
    const variant = realVariant(story);
    out.caption = variant ? `${variant} changes the move, so Isla checks the rule before trusting it.` : "The daily rule changes the move, so Isla checks it before trusting the answer.";
    out.dialogue = variant ? clean(story.variant_recap?.line || out.dialogue || "Check the variant rule before trusting it.") : "Check the daily rule before trusting it.";
  }
  if (index === 5 && /boundary marker|necessary boundary|brand|product/i.test(out.caption)) {
    out.caption = "She closes the laptop before the inbox gets to decide the rest of the morning.";
    out.dialogue = "A clean break. Then work.";
    reasons.push("rewrote_resolution_ad_copy");
  }
  return out;
}

async function openAiRewrite(story, date, previousQuality) {
  if (!openai) return null;
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Repair the existing six-panel Isla storyboard in place. Return JSON only: {arc_title, board_caption, frames:[six]}. Do not reorder panels. Do not change locations. Do not put puzzle-rule dialogue outside panel 4. If no real variant is detected, use neutral daily-rule wording only. Avoid ad copy." },
      { role: "user", content: JSON.stringify({ date, previousQuality, brief: storyBrief(story, date) }) },
    ],
  });
  const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
  return { arc_title: clean(parsed.arc_title || "Isla keeps the morning hers"), board_caption: clean(parsed.board_caption || "A repaired Isla diary arc built from the daily JSON."), frames: normaliseFrames(parsed.frames, story), storyboard_arc: parsed.storyboard_arc || null, source: "openai_repaired", model: MODEL };
}

async function main() {
  const date = dateString();
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);
  let frames = normaliseFrames((story.scenes || []).slice(0, 6), story);
  let q = quality(frames, story);
  let source = story.storyboard_copy_source || "existing";
  let model = story.storyboard_copy_model || "existing";
  let title = story.storyboard_arc_title || "Isla keeps the morning hers";
  let board = story.storyboard_board_caption || "A six-frame story moment built around Isla's day and today's puzzle.";
  let arc = story.storyboard_arc || arcFromFrames(frames);
  const reasons = [];
  const openAiAlreadyOk = story.openai_storyboard_status === "ok" || /^openai/.test(source);
  
  if (!q.quality_gate_passed) {
    if (openAiAlreadyOk) {
      frames = frames.map((frame, index) => repairFrame(frame, index, story, reasons));
      q = quality(frames, story);
      source = source.includes("openai") ? "openai_repaired" : "openai_repaired_after_gate";
      model = MODEL;
    } else {
      const rewritten = await openAiRewrite(story, date, q);
      if (rewritten) {
        frames = rewritten.frames.map((frame, index) => repairFrame(frame, index, story, reasons));
        q = quality(frames, story);
        source = rewritten.source;
        model = rewritten.model;
        title = rewritten.arc_title;
        board = rewritten.board_caption;
        arc = rewritten.storyboard_arc || arcFromFrames(frames);
      }
    }
  } else {
    frames = frames.map((frame, index) => repairFrame(frame, index, story, reasons));
    q = quality(frames, story);
  }

  if (!q.quality_gate_passed && !openAiAlreadyOk && !source.startsWith("openai")) {
    frames = normaliseFrames(fallbackFrames(story), story).map((frame, index) => repairFrame(frame, index, story, reasons));
    q = quality(frames, story);
    source = openai ? "fallback_after_openai_quality_gate" : "fallback_story_driven";
    model = openai ? MODEL : "fallback";
    title = "Isla keeps the morning hers";
    board = "A story-driven six-frame arc about Isla refusing to let the rush decide for her.";
    arc = arcFromFrames(frames);
  }

  const action = q.quality_gate_passed ? (reasons.length ? "repaired_in_place" : "passed") : (source.startsWith("openai") ? "repaired_in_place" : "fallback_replaced");
  story.story_source_used = storyPath(story, date);
  story.story_fields_used = STORY_FIELDS_USED;
  story.storyboard_copy_refined = true;
  story.storyboard_copy_source = source;
  story.storyboard_copy_model = model;
  story.storyboard_arc_title = title;
  story.storyboard_board_caption = board;
  story.storyboard_arc_type = "story_driven_not_location_driven";
  story.storyboard_arc = arcFromFrames(frames);
  story.storyboard_quality = { ...q, quality_gate_action: action, quality_gate_repair_reasons: reasons };
  story.quality_gate_action = action;
  story.quality_gate_repair_reasons = reasons;
  story.storyboard_locations = frames.map((frame) => frame.location);
  story.scenes = (story.scenes || []).slice(0, 6).map((scene, index) => ({ ...scene, arc_role: ARC_KEYS[index], setting: scene.setting || frames[index].location, panel_location: scene.panel_location || scene.setting || frames[index].location, caption: frames[index].caption, dialogue: frames[index].dialogue, speech_bubble: frames[index].dialogue, storyboard_caption: frames[index].caption, storyboard_dialogue: frames[index].dialogue, storyboard_panel_text: `${frames[index].dialogue}\n${frames[index].caption}`, image_prompt_fragment: frames[index].image_prompt_fragment, scene_description: clean(`${scene.panel_location || scene.setting || frames[index].location}. ${frames[index].caption} ${frames[index].image_prompt_fragment}`).slice(0, 420) }));
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  if (story.image_manifest) {
    story.image_manifest.story_source_used = story.story_source_used;
    story.image_manifest.story_fields_used = story.story_fields_used;
    story.image_manifest.storyboard_copy_source = story.storyboard_copy_source;
    story.image_manifest.storyboard_arc_type = story.storyboard_arc_type;
    story.image_manifest.storyboard_arc = story.storyboard_arc;
    story.image_manifest.storyboard_quality = story.storyboard_quality;
    story.image_manifest.quality_gate_action = story.quality_gate_action;
    story.image_manifest.quality_gate_repair_reasons = story.quality_gate_repair_reasons;
    await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  }
  console.log(`Storyboard quality gate: ${q.quality_gate_passed ? "passed" : "failed"}`);
  console.log(`Quality gate action: ${action}`);
  console.log(`Storyboard source: ${source}`);
}
main().catch((error) => { console.error(error); process.exit(1); });
