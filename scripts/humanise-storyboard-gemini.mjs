import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const KEY = process.env.GEMINI_API_KEY?.trim() || "";
const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
const ARC = ["setup", "disruption", "choice", "puzzle_moment", "consequence", "resolution"];

function today() {
  return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}
function clean(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
async function readJson(rel, fb = null) { try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fb; } }
async function writeJson(rel, data) { const f = path.join(ROOT, rel); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
function parseJson(text) { const s = clean(text); try { return JSON.parse(s); } catch {} const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (m) return JSON.parse(m[1]); return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)); }
function replyText(data) { return clean(data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || ""); }
function variantName(story) { return clean(story?.variant_recap?.variant_name || story?.product_referenced?.name || ""); }
function variantLine(story) { return clean(story?.variant_recap?.line || story?.variant_recap?.short_rule || ""); }

async function gemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.slice(0, 400)}`);
  return parseJson(replyText(JSON.parse(body)));
}

function brief(story) {
  return {
    instruction: "Humanise these six comic panel captions. Keep the same events, order, settings, and puzzle facts. Return JSON only: {frames:[{panel,caption,dialogue}]}. Captions 10-18 words. Dialogue should sound spoken. Do not add new puzzle facts. Preserve the exact variant line on the variant panel.",
    variant_name: variantName(story),
    variant_line: variantLine(story),
    story_note: story.story_note || "",
    continuation_note: story.continuation_note || "",
    frames: (story.scenes || []).slice(0, 6).map((s, i) => ({
      panel: i + 1,
      arc_role: s.arc_role || ARC[i],
      setting: s.panel_location || s.setting || "",
      caption: s.storyboard_caption || s.caption || "",
      dialogue: s.storyboard_dialogue || s.dialogue || s.speech_bubble || "",
      variant_here: Boolean(s.variant_recap_here),
      calendar_here: Boolean(s.uk_calendar_recap_here)
    }))
  };
}

function apply(story, result) {
  const frames = Array.isArray(result?.frames) ? result.frames : [];
  if (frames.length !== 6) throw new Error(`Expected 6 frames, got ${frames.length}`);
  const vName = variantName(story).toLowerCase();
  const vLine = variantLine(story);
  story.scenes = (story.scenes || []).slice(0, 6).map((scene, i) => {
    let caption = clean(frames[i]?.caption || scene.storyboard_caption || scene.caption || "");
    let dialogue = clean(frames[i]?.dialogue || scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || "");
    if (scene.variant_recap_here) {
      if (vLine) dialogue = vLine;
      const oldCaption = clean(scene.storyboard_caption || scene.caption || "");
      if (vName && !caption.toLowerCase().includes(vName) && oldCaption.toLowerCase().includes(vName)) caption = oldCaption;
    }
    if (scene.uk_calendar_recap_here && story.uk_calendar_date?.line) dialogue = clean(story.uk_calendar_date.line || dialogue);
    return { ...scene, caption, dialogue, speech_bubble: dialogue, storyboard_caption: caption, storyboard_dialogue: dialogue, storyboard_panel_text: dialogue ? `${dialogue}\n${caption}` : caption };
  });
  story.gemini_storyboard_humanised = true;
  story.gemini_storyboard_model = MODEL;
  story.storyboard_copy_source = `${story.storyboard_copy_source || "storyboard"}+gemini`;
  story.storyboard_arc = Object.fromEntries(ARC.map((k, i) => [k, story.scenes[i]?.storyboard_caption || ""]));
  return story;
}

function syncManifest(story, manifest = {}) {
  manifest.gemini_storyboard_humanised = true;
  manifest.gemini_storyboard_model = MODEL;
  manifest.storyboard_copy_source = story.storyboard_copy_source;
  manifest.storyboard_arc = story.storyboard_arc;
  manifest.image_prompts = (story.scenes || []).slice(0, 6).map((s, i) => ({ ...(manifest.image_prompts?.[i] || {}), scene: s.id, pose_id: s.pose_id, caption: s.caption, dialogue: s.dialogue, storyboard_caption: s.storyboard_caption, storyboard_dialogue: s.storyboard_dialogue }));
  return manifest;
}

async function main() {
  const date = today();
  if (!KEY) { console.log("Gemini storyboard humanise skipped: GEMINI_API_KEY missing"); return; }
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story?.scenes?.length) { console.log("Gemini storyboard humanise skipped: no scenes"); return; }
  try {
    const result = await gemini(JSON.stringify(brief(story)));
    story = apply(story, result);
    story.image_manifest = syncManifest(story, story.image_manifest || {});
    await writeJson(`daily/${date}.json`, story);
    await writeJson("latest.json", story);
    await writeJson(`image-manifests/${date}.json`, story.image_manifest);
    console.log(`Gemini storyboard humanised with ${MODEL}`);
  } catch (e) {
    console.log(`Gemini storyboard humanise skipped safely: ${e?.message || e}`);
  }
}

main().catch((e) => { console.log(`Gemini storyboard humanise failed safely: ${e?.message || e}`); process.exit(0); });
