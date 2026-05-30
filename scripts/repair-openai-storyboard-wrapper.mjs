import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const KEY = process.env.OPENAI_API_KEY?.trim() || "";
const MODEL = process.env.OPENAI_TEXT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const ARC = ["setup", "disruption", "choice", "puzzle_moment", "consequence", "resolution"];
const PUZZLE_INDEX = 3;

function today() {
  return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function clean(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
async function readJson(rel, fb = null) { try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fb; } }
async function writeJson(rel, data) { const f = path.join(ROOT, rel); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
function parseJsonText(text) { const s = clean(text); try { return JSON.parse(s); } catch {} const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i) || s.match(/(\{[\s\S]*\})/); if (m) return JSON.parse(m[1]); throw new Error("No JSON in model message content"); }
function realVariant(story) { const name = clean(story?.variant_recap?.variant_name || ""); return name && name.toLowerCase() !== "trigoku" ? name : ""; }
function framesFrom(parsed) { return parsed?.frames || parsed?.storyboard?.frames || parsed?.panels || parsed?.scenes || []; }

function shouldRepair(story) {
  const status = story?.openai_storyboard_status;
  const reason = story?.openai_storyboard_fallback_reason || "";
  return status !== "ok" && /choices|chat completion|expected 6|returned 0 frames/i.test(reason);
}

function snapshotPuzzleMoment(story) {
  const scene = story?.scenes?.[PUZZLE_INDEX];
  if (!scene) return { changed: false, reason: "missing_panel_4" };
  const caption = clean(scene.storyboard_caption || scene.caption || "");
  const dialogue = clean(scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || "");
  if (!caption || !dialogue) return { changed: false, reason: "incomplete_panel_4_copy" };
  const snapshot = {
    ran: true,
    source_stage: story.storyboard_copy_source || "unknown",
    caption,
    dialogue,
    image_prompt_fragment: clean(scene.image_prompt_fragment || ""),
    captured_at: new Date().toISOString(),
  };
  scene.openai_caption = caption;
  scene.openai_dialogue = dialogue;
  scene.caption_before_quality_gate = caption;
  scene.dialogue_before_quality_gate = dialogue;
  scene.puzzle_moment_copy_snapshot = snapshot;
  story.puzzle_moment_copy_snapshot = snapshot;
  story.image_manifest = story.image_manifest || {};
  story.image_manifest.puzzle_moment_copy_snapshot = snapshot;
  if (story.image_manifest.image_prompts?.[PUZZLE_INDEX]) {
    story.image_manifest.image_prompts[PUZZLE_INDEX].storyboard_caption_before_quality_gate = caption;
    story.image_manifest.image_prompts[PUZZLE_INDEX].storyboard_dialogue_before_quality_gate = dialogue;
    story.image_manifest.image_prompts[PUZZLE_INDEX].puzzle_moment_copy_snapshot = snapshot;
  }
  return { changed: true, reason: snapshot.source_stage };
}

function brief(story) {
  return {
    date: story.date,
    story_note: story.story_note || "",
    continuation_note: story.continuation_note || "",
    real_variant_name: realVariant(story) || null,
    variant_recap: story.variant_recap || null,
    scenes: (story.scenes || []).slice(0, 6).map((s, i) => ({
      panel_number: i + 1,
      arc_role: s.arc_role || ARC[i],
      location: s.panel_location || s.setting || "",
      caption: s.storyboard_caption || s.caption || "",
      dialogue: s.storyboard_dialogue || s.dialogue || s.speech_bubble || "",
      scene_description: s.scene_description || s.beat || "",
      image_prompt_fragment: s.image_prompt_fragment || ""
    }))
  };
}

async function callOpenAI(story) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return JSON only with {arc_title, board_caption, frames}. frames must be exactly 6 objects with panel_number, location, caption, dialogue, image_prompt_fragment. Preserve story facts. Do not use quiet, gentle, pause, thread, anchor, ritual, borrowed, understated. If real_variant_name is null, do not call Trigoku a variant; say daily rule." },
        { role: "user", content: JSON.stringify({ task: "Repair storyboard copy after a wrapper-parse fallback.", brief: brief(story) }) }
      ]
    })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenAI repair failed ${res.status}: ${text.slice(0, 600)}`);
  const wrapper = JSON.parse(text);
  const message = wrapper?.choices?.[0]?.message?.content || "";
  const parsed = parseJsonText(message);
  const frames = framesFrom(parsed);
  if (!Array.isArray(frames) || frames.length !== 6) throw new Error(`OpenAI repair returned ${Array.isArray(frames) ? frames.length : 0} frames`);
  return { parsed, frames };
}

function apply(story, result) {
  const frames = result.frames;
  story.scenes = (story.scenes || []).slice(0, 6).map((scene, i) => {
    const f = frames[i] || {};
    const caption = clean(f.caption || scene.storyboard_caption || scene.caption || "");
    const dialogue = clean(f.dialogue || scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || "");
    return {
      ...scene,
      panel_location: clean(f.location || scene.panel_location || scene.setting || ""),
      setting: clean(f.location || scene.setting || scene.panel_location || ""),
      caption,
      dialogue,
      speech_bubble: dialogue,
      storyboard_caption: caption,
      storyboard_dialogue: dialogue,
      storyboard_panel_text: dialogue ? `${dialogue}\n${caption}` : caption,
      image_prompt_fragment: clean(f.image_prompt_fragment || scene.image_prompt_fragment || scene.scene_description || "")
    };
  });
  story.storyboard_copy_source = "openai_repair";
  story.storyboard_copy_model = MODEL;
  story.openai_storyboard_status = "ok";
  story.openai_storyboard_model = MODEL;
  story.openai_storyboard_fallback_reason = null;
  story.openai_storyboard_checked_at = new Date().toISOString();
  story.storyboard_arc_title = clean(result.parsed.arc_title || story.storyboard_arc_title || "Isla keeps the day from deciding for her");
  story.storyboard_board_caption = clean(result.parsed.board_caption || story.storyboard_board_caption || "A repaired story-first storyboard.");
  story.storyboard_arc = Object.fromEntries(ARC.map((k, i) => [k, story.scenes[i]?.storyboard_caption || ""]));
  story.storyboard_locations = story.scenes.map((s) => s.panel_location || s.setting || "");
  return story;
}

function syncManifest(story, manifest = {}) {
  manifest.storyboard_copy_source = story.storyboard_copy_source;
  manifest.storyboard_copy_model = story.storyboard_copy_model;
  manifest.openai_storyboard_status = story.openai_storyboard_status;
  manifest.openai_storyboard_model = story.openai_storyboard_model;
  manifest.openai_storyboard_fallback_reason = story.openai_storyboard_fallback_reason;
  manifest.openai_storyboard_checked_at = story.openai_storyboard_checked_at;
  manifest.storyboard_arc_title = story.storyboard_arc_title;
  manifest.storyboard_arc = story.storyboard_arc;
  manifest.storyboard_locations = story.storyboard_locations;
  manifest.puzzle_moment_copy_snapshot = story.puzzle_moment_copy_snapshot || manifest.puzzle_moment_copy_snapshot || null;
  return manifest;
}

async function saveStory(date, story) {
  story.image_manifest = syncManifest(story, story.image_manifest || {});
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest);
}

async function main() {
  const date = today();
  if (!KEY) { console.log("OpenAI wrapper repair skipped: OPENAI_API_KEY missing"); return; }
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story?.scenes?.length) { console.log("OpenAI wrapper repair skipped: no story scenes"); return; }
  if (!shouldRepair(story)) {
    const snap = snapshotPuzzleMoment(story);
    await saveStory(date, story);
    console.log(`OpenAI wrapper repair skipped: status=${story.openai_storyboard_status || "unknown"}`);
    console.log(`Puzzle moment pre-gate snapshot: ${snap.changed ? "saved" : "skipped"} (${snap.reason})`);
    return;
  }
  try {
    const result = await callOpenAI(story);
    story = apply(story, result);
    const snap = snapshotPuzzleMoment(story);
    await saveStory(date, story);
    console.log("OpenAI wrapper repair applied: status=ok");
    console.log(`Puzzle moment pre-gate snapshot: ${snap.changed ? "saved" : "skipped"} (${snap.reason})`);
  } catch (e) {
    story.openai_storyboard_status = "fallback";
    story.openai_storyboard_fallback_reason = `repair failed: ${e?.message || e}`;
    await saveStory(date, story);
    console.log(`OpenAI wrapper repair failed safely: ${e?.message || e}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
