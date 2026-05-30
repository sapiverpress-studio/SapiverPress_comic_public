import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const API_KEY = process.env.OPENAI_API_KEY?.trim() || "";
const MODEL = process.env.OPENAI_TEXT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const LOCATIONS = ["small home kitchen table in warm morning light", "train table by the window", "outdoor cafe street table", "co-working desk near a tall window", "bookshop cafe corner", "rainy window nook with plants"];
const ARC = ["setup", "disruption", "choice", "puzzle_moment", "consequence", "resolution"];

function dateString() {
  return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
async function readJson(relativePath, fallback = null) { try { return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), "utf8")); } catch { return fallback; } }
async function writeJson(relativePath, data) { const out = path.join(ROOT, relativePath); await fs.mkdir(path.dirname(out), { recursive: true }); await fs.writeFile(out, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
function realVariant(story) { const name = clean(story?.variant_recap?.variant_name || ""); return name && name.toLowerCase() !== "trigoku" ? name : ""; }
function frameImageName(index) { const n = String(index + 1).padStart(2, "0"); return `${n}_panel-${n}.png`; }
function isGenericPuzzleLine(text) { return /^(check the daily rule before trusting it\.?|the daily rule changes the move, so isla checks it before trusting the answer\.?)$/i.test(clean(text)); }

function requiredPuzzleCopy(story) {
  const variant = realVariant(story);
  const variantLine = clean(story?.variant_recap?.line || story?.variant_recap?.short_rule || "");
  if (variant) {
    return {
      mode: "exact_variant",
      variant_name: variant,
      required_caption_panel_4: `${variant} changes this move, so Isla checks that constraint before she trusts it.`,
      required_dialogue_panel_4: variantLine || `${variant} first. Then the move.`,
    };
  }
  return {
    mode: "standard_trigoku_daily_rule",
    variant_name: "Trigoku",
    required_caption_panel_4: "Trigoku gives the grid its own rule today, so Isla checks the constraint before moving on.",
    required_dialogue_panel_4: "Trigoku first. Check the constraint.",
  };
}

function fallbackStoryboard(story) {
  const required = requiredPuzzleCopy(story);
  return [
    { location: LOCATIONS[0], caption: "Isla sees the errand list waiting, but opens the grid before the day takes over.", dialogue: "Start before it gets busy.", image_prompt_fragment: "setup beat, errand list waiting, laptop opening" },
    { location: LOCATIONS[1], caption: "The journey slips behind schedule, and Isla keeps working instead of chasing the clock.", dialogue: "No use racing that clock.", image_prompt_fragment: "travel disruption, train table, laptop braced" },
    { location: LOCATIONS[2], caption: "At the cafe table, she turns the phone face down and gives herself three minutes.", dialogue: "Three whole minutes, just for this.", image_prompt_fragment: "decision moment, phone ignored, outdoor cafe table" },
    { location: LOCATIONS[3], caption: required.required_caption_panel_4, dialogue: required.required_dialogue_panel_4, image_prompt_fragment: "specific puzzle rule check, active laptop screen, finger near trackpad" },
    { location: LOCATIONS[4], caption: "Because she checked it properly, the move holds and the errands feel manageable again.", dialogue: "That one actually holds.", image_prompt_fragment: "confirmed breakthrough, bookshop cafe, notebook and mug" },
    { location: LOCATIONS[5], caption: "By the final check, Isla closes the laptop before the pressure takes over again.", dialogue: "Leave it there. Move on.", image_prompt_fragment: "resolution beat, closing laptop, rainy window" },
  ];
}

function sourceBrief(story) {
  const fallback = fallbackStoryboard(story);
  const scenes = Array.isArray(story?.scenes) ? story.scenes.slice(0, 6) : [];
  const puzzleCopy = requiredPuzzleCopy(story);
  return {
    date: story?.date,
    story_note: story?.story_note || "",
    continuation_note: story?.continuation_note || "",
    life_memory_entry: story?.life_memory_entry || null,
    real_variant_name: realVariant(story) || null,
    variant_recap: story?.variant_recap || null,
    uk_calendar_date: story?.uk_calendar_date || null,
    required_locations: LOCATIONS,
    required_puzzle_moment_panel: 4,
    required_puzzle_copy: puzzleCopy,
    hard_rules: [
      "Panel 4 is the puzzle_moment.",
      "Panel 4 must use required_puzzle_copy.required_dialogue_panel_4 exactly or near-exactly.",
      "Panel 4 must not use the generic line: Check the daily rule before trusting it.",
      "Panel 4 must not use the generic caption: The daily rule changes the move, so Isla checks it before trusting the answer.",
      "If required_puzzle_copy.mode is exact_variant, name the exact variant on panel 4.",
      "If required_puzzle_copy.mode is standard_trigoku_daily_rule, say Trigoku as the puzzle name, not as a variant.",
    ],
    story_fields_used: ["story_note", "continuation_note", "life_memory_entry", "variant_recap", "required_puzzle_copy", "scenes[].caption", "scenes[].dialogue", "scenes[].scene_description", "scenes[].image_prompt_fragment"],
    scenes: fallback.map((fb, index) => {
      const scene = scenes[index] || {};
      return {
        panel: index + 1,
        image_name: frameImageName(index),
        arc_role: scene.arc_role || ARC[index],
        location: scene.panel_location || scene.setting || fb.location,
        caption: scene.storyboard_caption || scene.caption || fb.caption,
        dialogue: scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || fb.dialogue,
        scene_description: scene.scene_description || scene.beat || scene.title || "",
        image_prompt_fragment: scene.image_prompt_fragment || fb.image_prompt_fragment,
        required_caption: index === 3 ? puzzleCopy.required_caption_panel_4 : undefined,
        required_dialogue: index === 3 ? puzzleCopy.required_dialogue_panel_4 : undefined,
      };
    }),
  };
}

function parseJsonText(text) {
  const trimmed = clean(text);
  try { return JSON.parse(trimmed); } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("no JSON object found in model content");
}

function parseOpenAIResponse(rawText) {
  let wrapper = null;
  try { wrapper = JSON.parse(rawText); } catch {}
  const content = wrapper?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return { parsed: parseJsonText(content), content_preview: content.slice(0, 1200) };
  return { parsed: parseJsonText(rawText), content_preview: rawText.slice(0, 1200) };
}

function findFrames(parsed) {
  const candidates = [parsed?.frames, parsed?.panels, parsed?.scenes, parsed?.storyboard?.frames, parsed?.storyboard?.panels, parsed?.storyboard?.scenes, parsed?.storyboard_copy?.frames, parsed?.board?.frames, parsed?.data?.frames, Array.isArray(parsed) ? parsed : null];
  for (const c of candidates) if (Array.isArray(c) && c.length) return c;
  if (parsed && typeof parsed === "object") {
    const numbered = Object.keys(parsed).sort().filter((k) => /^(frame|panel|scene)[_-]?\d+$/i.test(k)).map((k) => parsed[k]);
    if (numbered.length) return numbered;
  }
  return [];
}

function firstText(obj, keys) {
  for (const key of keys) {
    const value = key.split(".").reduce((cur, part) => cur?.[part], obj);
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

function normaliseFrame(frame, index, story) {
  const fallback = fallbackStoryboard(story)[index] || fallbackStoryboard(story)[0];
  const sourceScene = story?.scenes?.[index] || {};
  const required = requiredPuzzleCopy(story);
  const location = firstText(frame, ["location", "setting", "panel_location", "place", "scene_location"]) || sourceScene.panel_location || sourceScene.setting || fallback.location;
  let caption = firstText(frame, ["caption", "storyboard_caption", "narrative_caption", "copy", "text", "narration", "description.caption"]) || sourceScene.storyboard_caption || sourceScene.caption || fallback.caption;
  let dialogue = firstText(frame, ["dialogue", "storyboard_dialogue", "speech_bubble", "speech", "line", "spoken_line", "quote", "description.dialogue"]) || sourceScene.storyboard_dialogue || sourceScene.dialogue || sourceScene.speech_bubble || fallback.dialogue;
  const fragment = firstText(frame, ["image_prompt_fragment", "visual_prompt", "visual", "scene_description", "image_fragment", "description.visual"]) || sourceScene.image_prompt_fragment || fallback.image_prompt_fragment;
  if (index === 3 && (isGenericPuzzleLine(caption) || isGenericPuzzleLine(dialogue) || !clean(caption) || !clean(dialogue))) {
    caption = required.required_caption_panel_4;
    dialogue = required.required_dialogue_panel_4;
  }
  return { panel_number: index + 1, location: clean(location), caption: clean(caption), dialogue: clean(dialogue), image_prompt_fragment: clean(fragment) };
}

function responseShape(value) {
  if (!value || typeof value !== "object") return typeof value;
  if (Array.isArray(value)) return `array:${value.length}`;
  return Object.fromEntries(Object.keys(value).slice(0, 20).map((k) => [k, Array.isArray(value[k]) ? `array:${value[k].length}` : typeof value[k]]));
}

async function refineWithOpenAI(story) {
  const brief = sourceBrief(story);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return JSON only with {arc_title, board_caption, frames}. frames must be exactly 6 objects. Each frame should include panel_number, location, caption, dialogue, image_prompt_fragment. Use the supplied story facts. Panel 4 is the puzzle_moment and must use brief.required_puzzle_copy.required_dialogue_panel_4 exactly or near-exactly. Panel 4 must not use generic daily-rule fallback copy. If real_variant_name is null, do not invent Anti-Knight or any variant; use Trigoku as the standard puzzle name." },
        { role: "user", content: JSON.stringify({ task: "Create a six-frame story-first Isla storyboard.", brief }) },
      ],
    }),
  });
  const rawText = await response.text();
  if (!response.ok) throw new Error(`OpenAI storyboard refine failed ${response.status}: ${rawText.slice(0, 900)}`);
  let parsed, content_preview;
  try { ({ parsed, content_preview } = parseOpenAIResponse(rawText)); } catch (error) { console.log(`OPENAI_STORYBOARD_RAW_CONTENT_ON_PARSE_FAIL=${rawText.slice(0, 1800)}`); throw error; }
  const rawFrames = findFrames(parsed);
  if (rawFrames.length !== 6) { console.log(`OPENAI_STORYBOARD_RAW_CONTENT_ON_FRAME_FAIL=${content_preview}`); throw new Error(`OpenAI returned ${rawFrames.length} frames, expected 6. Parsed shape: ${JSON.stringify(responseShape(parsed)).slice(0, 900)}`); }
  const frames = rawFrames.map((frame, index) => normaliseFrame(frame, index, story));
  const empties = frames.filter((f) => !f.caption || !f.dialogue);
  if (empties.length) { console.log(`OPENAI_STORYBOARD_RAW_CONTENT_ON_EMPTY_FIELD=${content_preview}`); throw new Error(`Parser repair failed: ${empties.length} frame(s) still missing caption/dialogue after fallback fill`); }
  return { arc_title: clean(parsed.arc_title || parsed.title || parsed.storyboard?.arc_title || "Isla keeps the day from deciding for her"), board_caption: clean(parsed.board_caption || parsed.caption || parsed.storyboard?.board_caption || "A daily puzzle moment with Isla."), frames, source: "openai", model: MODEL, response_shape: responseShape(parsed) };
}

function applyStoryboard(story, storyboard) {
  const fallback = fallbackStoryboard(story);
  const frames = storyboard?.frames?.length === 6 ? storyboard.frames : fallback;
  story.storyboard_copy_refined = true;
  story.storyboard_copy_source = storyboard?.source || "fallback";
  story.storyboard_copy_model = storyboard?.model || "fallback";
  story.storyboard_arc_title = storyboard?.arc_title || "Isla keeps the day from deciding for her";
  story.storyboard_board_caption = storyboard?.board_caption || "A daily puzzle moment with Isla.";
  story.story_source_used = story.date ? `daily/${story.date}.json` : "latest.json";
  story.story_fields_used = sourceBrief(story).story_fields_used;
  story.required_puzzle_copy = requiredPuzzleCopy(story);
  story.storyboard_locations = frames.map((f) => clean(f.location));
  story.openai_storyboard_status = storyboard?.source === "openai" ? "ok" : "fallback";
  story.openai_storyboard_model = MODEL;
  story.openai_storyboard_response_shape = storyboard?.response_shape || null;
  story.openai_storyboard_fallback_reason = storyboard?.error || null;
  story.openai_storyboard_checked_at = new Date().toISOString();
  story.scenes = frames.map((frame, index) => ({ ...(story.scenes?.[index] || {}), setting: frame.location, panel_location: frame.location, caption: frame.caption, dialogue: frame.dialogue, speech_bubble: frame.dialogue, storyboard_caption: frame.caption, storyboard_dialogue: frame.dialogue, storyboard_panel_text: `${frame.dialogue}\n${frame.caption}`, image_prompt_fragment: frame.image_prompt_fragment, scene_description: clean(`${frame.location}. ${frame.caption} ${frame.image_prompt_fragment}`).slice(0, 420) }));
  return story;
}

async function main() {
  const date = dateString();
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);
  let storyboard;
  try {
    if (!API_KEY) throw new Error("OPENAI_API_KEY missing");
    storyboard = await refineWithOpenAI(story);
  } catch (error) {
    storyboard = { arc_title: "Isla keeps the day from deciding for her", board_caption: "A story-first six-frame diary moment built around today's puzzle.", frames: fallbackStoryboard(story), source: "fallback_story_driven", model: "fallback", error: error?.message || String(error) };
    console.log(`Storyboard copy used fallback: ${storyboard.error}`);
  }
  story = applyStoryboard(story, storyboard);
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  if (story.image_manifest) {
    story.image_manifest.storyboard_copy_refined = true;
    story.image_manifest.storyboard_copy_source = story.storyboard_copy_source;
    story.image_manifest.story_source_used = story.story_source_used;
    story.image_manifest.story_fields_used = story.story_fields_used;
    story.image_manifest.storyboard_arc_title = story.storyboard_arc_title;
    story.image_manifest.storyboard_locations = story.storyboard_locations;
    story.image_manifest.required_puzzle_copy = story.required_puzzle_copy;
    story.image_manifest.openai_storyboard_status = story.openai_storyboard_status;
    story.image_manifest.openai_storyboard_model = story.openai_storyboard_model;
    story.image_manifest.openai_storyboard_response_shape = story.openai_storyboard_response_shape;
    story.image_manifest.openai_storyboard_fallback_reason = story.openai_storyboard_fallback_reason;
    story.image_manifest.openai_storyboard_checked_at = story.openai_storyboard_checked_at;
    await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  }
  console.log(`Storyboard copy refined before image/caption render: ${story.storyboard_copy_source}`);
  console.log(`OpenAI storyboard status: ${story.openai_storyboard_status}`);
  if (story.required_puzzle_copy) console.log(`Required panel 4 dialogue: ${story.required_puzzle_copy.required_dialogue_panel_4}`);
  if (story.openai_storyboard_fallback_reason) console.log(`OpenAI storyboard fallback reason: ${story.openai_storyboard_fallback_reason}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
