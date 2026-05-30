import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";

const ROOT = process.cwd();
const MODEL = process.env.OPENAI_TEXT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const openai = process.env.OPENAI_API_KEY?.trim() ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() }) : null;
const ARC_KEYS = ["setup", "disruption", "choice", "puzzle_moment", "consequence", "resolution"];
const STORY_FIELDS_USED = [
  "story_note",
  "continuation_note",
  "life_memory_entry",
  "scenes[].scene_description",
  "scenes[].beat",
  "scenes[].caption",
  "scenes[].dialogue",
  "scenes[].speech_bubble",
  "scenes[].storyboard_caption",
  "scenes[].storyboard_dialogue",
  "scenes[].image_prompt_fragment",
  "puzzle_state",
  "variant_recap",
  "uk_calendar_date",
];
const BAD_PHRASES = [
  "quiet moment", "clearer than before", "keep the thread", "small anchor",
  "borrowed quiet", "less noisy", "gentle finish", "quiet satisfaction",
  "one clean look", "no rushing this one", "that gives me a path",
  "stay with it", "a small anchor", "taking a pause", "small ritual",
  "quiet reset", "quiet corner", "quiet thread"
];
const CAUSE = ["because", "so", "then", "when", "after", "before", "if", "but"];
const TURN = ["decides", "chooses", "realises", "refuses", "learns", "notices", "waits", "pauses", "carries"];

function dateString() {
  return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function readJson(rel, fallback = null) {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); }
  catch { return fallback; }
}

async function writeJson(rel, data) {
  const file = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function storyPath(story, date) {
  return story?.date === date ? `daily/${date}.json` : "latest.json";
}

function hasAny(text, words) {
  const lower = clean(text).toLowerCase();
  return words.some((word) => lower.includes(word));
}

function quality(frames, story) {
  const captions = frames.map((frame) => clean(frame.caption));
  const all = captions.join(" ").toLowerCase();
  const generic = BAD_PHRASES.filter((phrase) => all.includes(phrase));
  const causeCount = captions.filter((caption) => hasAny(caption, CAUSE)).length;
  const turnCount = captions.filter((caption) => hasAny(caption, TURN)).length;
  const tooShort = captions.filter((caption) => caption.split(/\s+/).filter(Boolean).length < 10).length;
  const unique = new Set(captions.map((caption) => caption.toLowerCase().replace(/\b(home|train|cafe|library|bookshop|co-working|desk|table|window)\b/g, "").trim())).size;
  const usesPhase2 = Boolean(story.story_note || story.continuation_note || story.life_memory_entry);
  const locationOnly = unique < 5 || (causeCount < 3 && turnCount < 2);
  const pass = usesPhase2 && !locationOnly && generic.length === 0 && tooShort === 0 && causeCount >= 3 && turnCount >= 2;
  return {
    location_sequence_only: locationOnly,
    has_cause_effect: causeCount >= 3,
    has_character_turn: turnCount >= 2,
    uses_phase2_story: usesPhase2,
    quality_gate_passed: pass,
    interchangeable: unique < 5,
    generic_phrase_hits: generic,
    cause_effect_link_count: causeCount,
    character_turn_count: turnCount,
  };
}

function fallbackFrames(story) {
  const life = story.life_memory_entry || {};
  const variant = clean(story.variant_recap?.variant_name || story.product_referenced?.name || "today's puzzle");
  const rule = clean(story.variant_recap?.line || story.variant_recap?.short_rule || "check the constraint before rushing");
  const thread = clean(life.thread_to_continue || "she is learning to carry better decisions into the next thing");
  return [
    { caption: "Isla spots the next errand waiting, but gives the grid one careful look before the day starts pulling.", dialogue: "Start before it gets busy.", image_prompt_fragment: "setup beat, next errand waiting, controlled morning start" },
    { caption: "The journey slips off schedule, and for a second she nearly closes the laptop to chase the clock.", dialogue: "Don't chase it.", image_prompt_fragment: "travel disruption, laptop nearly closing, tension between delay and focus" },
    { caption: "At the cafe table, Isla leaves the errand message unread and chooses three unhurried minutes instead.", dialogue: "Three minutes. Just three.", image_prompt_fragment: "decision moment, unread message waiting, deliberate restraint" },
    { caption: `${variant} will catch a rushed guess, so she checks the constraint before letting the move stand.`, dialogue: rule, image_prompt_fragment: "specific puzzle-rule check, careful deduction, restraint before a move" },
    { caption: "Because she waited, the move holds; the errand feels less like a deadline and more like a next step.", dialogue: "That one holds.", image_prompt_fragment: "consequence of patience, small confirmed breakthrough, tension easing" },
    { caption: `By the final check, Isla carries the decision forward: ${thread}.`, dialogue: "Carry that forward.", image_prompt_fragment: "resolution beat, calm forward motion after pressure" },
  ];
}

function normaliseFrames(raw, story) {
  const source = Array.isArray(raw) && raw.length === 6 ? raw : fallbackFrames(story);
  return source.slice(0, 6).map((frame, index) => ({
    panel_number: index + 1,
    arc_role: ARC_KEYS[index],
    location: clean(frame.location || story.scenes?.[index]?.panel_location || story.scenes?.[index]?.setting || story.selected_setting || ""),
    caption: clean(frame.caption || fallbackFrames(story)[index].caption),
    dialogue: clean(frame.dialogue || frame.speech_bubble || fallbackFrames(story)[index].dialogue),
    image_prompt_fragment: clean(frame.image_prompt_fragment || story.scenes?.[index]?.image_prompt_fragment || fallbackFrames(story)[index].image_prompt_fragment),
  }));
}

function arcFromFrames(frames) {
  return Object.fromEntries(ARC_KEYS.map((key, index) => [key, frames[index]?.caption || ""]));
}

function storyBrief(story, date) {
  return {
    story_source_used: storyPath(story, date),
    story_fields_used: STORY_FIELDS_USED,
    story_source: story.story_source,
    story_note: story.story_note,
    continuation_note: story.continuation_note,
    life_memory_entry: story.life_memory_entry,
    puzzle_state: story.puzzle_state,
    variant_recap: story.variant_recap,
    uk_calendar_date: story.uk_calendar_date,
    selected_setting: story.selected_setting,
    scenes: (story.scenes || []).slice(0, 6).map((scene, index) => ({
      panel: index + 1,
      arc_role: ARC_KEYS[index],
      title: scene.title,
      beat: scene.beat,
      scene_description: scene.scene_description,
      caption: scene.storyboard_caption || scene.caption,
      dialogue: scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble,
      image_prompt_fragment: scene.image_prompt_fragment,
      life_beat: scene.life_beat,
      setting: scene.setting || scene.panel_location,
    })),
  };
}

async function openAiRewrite(story, date, previousQuality) {
  if (!openai) return null;
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.45,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You are sharpening an Isla daily illustrated puzzle diary. Preserve the Claude/Phase 2 story from daily JSON. Story first, locations second. Return JSON only: {arc_title, board_caption, frames:[six], storyboard_arc}. Six frames must be setup, disruption, choice, puzzle_moment, consequence, resolution. These captions are too generic. Rewrite them so each scene has a specific story event, a cause/effect link to the next scene, and a visible character beat for Isla. No atmospheric-only captions. Panel 4 must name the specific puzzle variant from variant_recap.variant_name and use variant_recap.line as the dialogue when possible." },
      { role: "user", content: JSON.stringify({ date, previousQuality, brief: storyBrief(story, date) }) },
    ],
  });
  const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
  return {
    arc_title: clean(parsed.arc_title || "Isla holds the line"),
    board_caption: clean(parsed.board_caption || "A story-driven Isla diary arc built from the daily JSON."),
    frames: normaliseFrames(parsed.frames, story),
    storyboard_arc: parsed.storyboard_arc || null,
    source: "openai",
    model: MODEL,
  };
}

async function main() {
  const date = dateString();
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);

  let frames = normaliseFrames((story.scenes || []).slice(0, 6), story);
  let q = quality(frames, story);
  let source = story.storyboard_copy_source || "existing";
  let model = story.storyboard_copy_model || "existing";
  let title = story.storyboard_arc_title || "Isla's daily page";
  let board = story.storyboard_board_caption || "A six-frame story moment built around Isla's day and today's puzzle.";
  let arc = story.storyboard_arc || arcFromFrames(frames);

  if (!q.quality_gate_passed || source === "fallback") {
    const rewritten = await openAiRewrite(story, date, q);
    if (rewritten) {
      frames = rewritten.frames;
      q = quality(frames, story);
      source = rewritten.source;
      model = rewritten.model;
      title = rewritten.arc_title;
      board = rewritten.board_caption;
      arc = rewritten.storyboard_arc || arcFromFrames(frames);
    }
  }

  if (!q.quality_gate_passed) {
    frames = normaliseFrames(fallbackFrames(story), story);
    q = quality(frames, story);
    source = openai ? "fallback_after_openai_quality_gate" : "fallback_story_driven";
    model = openai ? MODEL : "fallback";
    title = "Isla holds the line";
    board = "A story-driven six-frame arc about Isla refusing to let the rush decide for her.";
    arc = arcFromFrames(frames);
  }

  story.story_source_used = storyPath(story, date);
  story.story_fields_used = STORY_FIELDS_USED;
  story.storyboard_copy_refined = true;
  story.storyboard_copy_source = source;
  story.storyboard_copy_model = model;
  story.storyboard_arc_title = title;
  story.storyboard_board_caption = board;
  story.storyboard_arc_type = "story_driven_not_location_driven";
  story.storyboard_arc = arc;
  story.storyboard_quality = q;
  story.storyboard_locations = frames.map((frame) => frame.location);

  story.scenes = (story.scenes || []).slice(0, 6).map((scene, index) => ({
    ...scene,
    arc_role: ARC_KEYS[index],
    setting: frames[index].location || scene.setting,
    panel_location: frames[index].location || scene.panel_location || scene.setting,
    caption: frames[index].caption,
    dialogue: frames[index].dialogue,
    speech_bubble: frames[index].dialogue,
    storyboard_caption: frames[index].caption,
    storyboard_dialogue: frames[index].dialogue,
    storyboard_panel_text: `${frames[index].dialogue}\n${frames[index].caption}`,
    image_prompt_fragment: frames[index].image_prompt_fragment,
    scene_description: clean(`${frames[index].location}. ${frames[index].caption} ${frames[index].image_prompt_fragment}`).slice(0, 420),
  }));

  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  if (story.image_manifest) {
    story.image_manifest.story_source_used = story.story_source_used;
    story.image_manifest.story_fields_used = story.story_fields_used;
    story.image_manifest.storyboard_copy_source = story.storyboard_copy_source;
    story.image_manifest.storyboard_arc_type = story.storyboard_arc_type;
    story.image_manifest.storyboard_arc = story.storyboard_arc;
    story.image_manifest.storyboard_quality = story.storyboard_quality;
    await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  }

  console.log(`Storyboard quality gate: ${q.quality_gate_passed ? "passed" : "failed"}`);
  console.log(`Storyboard source: ${source}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
