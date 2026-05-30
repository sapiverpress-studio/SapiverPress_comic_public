import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const API_KEY = process.env.OPENAI_API_KEY?.trim() || "";
const MODEL = process.env.OPENAI_TEXT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const SUITE_URL = process.env.SUITE_URL || "https://suite.sapiverpress.co.uk";

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function site(value) { return String(value || "").replace(/^https?:\/\//, "").replace(/\/$/, ""); }
function variantName(story) { const v = clean(story?.variant_recap?.variant_name || ""); return v && v.toLowerCase() !== "trigoku" ? v : "daily rule"; }
function variantLine(story) { return clean(story?.variant_recap?.line || story?.variant_recap?.short_rule || "Check the daily rule before trusting it."); }
function srtTime(seconds) { const ms = Math.round(Math.max(0, seconds) * 1000); const hh = Math.floor(ms / 3600000); const mm = Math.floor((ms % 3600000) / 60000); const ss = Math.floor((ms % 60000) / 1000); const xx = ms % 1000; return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")},${String(xx).padStart(3, "0")}`; }
function srt(segments) { return segments.map((segment, index) => `${index + 1}\n${srtTime(index * 3)} --> ${srtTime((index + 1) * 3)}\n${segment.text}\n`).join("\n"); }
async function mkdir(dir) { await fs.mkdir(dir, { recursive: true }); }
async function readJson(file, fallback = null) { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; } }
async function writeText(file, text) { await mkdir(path.dirname(file)); await fs.writeFile(file, text, "utf8"); }
async function writeJson(file, data) { await writeText(file, `${JSON.stringify(data, null, 2)}\n`); }
async function copyLatest(src, dst) { await fs.rm(dst, { recursive: true, force: true }); await mkdir(dst); for (const entry of await fs.readdir(src, { withFileTypes: true })) if (entry.isFile()) await fs.copyFile(path.join(src, entry.name), path.join(dst, entry.name)); }

function fallbackSegments(narration, story) {
  const variant = variantName(story);
  const setting = clean(story?.selected_setting || story?.life_memory_entry?.location || "the day");
  const rule = variantLine(story);
  return [
    { id: "intro", image_name: "00_start-grid.png", text: `${variant} today. Isla checks the rule before she starts.` },
    { id: "panel_1", image_name: "01_panel-01.png", text: `She is at ${setting}, already thinking about the next job.` },
    { id: "panel_2", image_name: "02_panel-02.png", text: "Then the day starts tugging at her sleeve again." },
    { id: "panel_3", image_name: "03_panel-03.png", text: "She leaves one message unread. Three minutes will not ruin anything." },
    { id: "panel_4", image_name: "04_panel-04.png", text: rule },
    { id: "panel_5", image_name: "05_panel-05.png", text: "The move holds, which is annoyingly satisfying." },
    { id: "panel_6", image_name: "06_panel-06.png", text: "She shuts the laptop before the rush gets the last word." },
    { id: "cta", image_name: "07_finished-grid.png", text: `Play along at ${site(SUITE_URL)}` },
  ].map((seg, i) => ({ ...seg, ...(narration?.segments?.[i] ? { id: narration.segments[i].id || seg.id, image_name: narration.segments[i].image_name || seg.image_name } : {}) }));
}
function fallbackRefine(narration, story) { const segments = fallbackSegments(narration, story); return { ...narration, title: `${variantName(story)} with Isla`, segments, full_text: segments.map((s) => s.text).join("\n\n"), copy_refined: "fallback", generated_at: new Date().toISOString() }; }

function sourceBrief(story, narration) {
  const scenes = Array.isArray(story?.scenes) ? story.scenes.slice(0, 6) : [];
  return { date: story?.date || narration?.date, story_note: story?.story_note || "", continuation_note: story?.continuation_note || "", life_memory_entry: story?.life_memory_entry || null, variant_name: variantName(story), variant_line: variantLine(story), variant_recap: story?.variant_recap || null, uk_calendar_date: story?.uk_calendar_date || null, raw_segments: narration?.segments || [], scenes: scenes.map((scene, index) => ({ panel: index + 1, caption: scene.storyboard_caption || scene.caption || "", dialogue: scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || "", description: scene.scene_description || scene.beat || scene.title || "", image_fragment: scene.image_prompt_fragment || "", setting: scene.setting || scene.panel_location || "", variant_here: index === 3 || Boolean(scene.variant_recap_here), calendar_here: Boolean(scene.uk_calendar_recap_here) })) };
}
function parseJsonText(text) { const trimmed = clean(text); try { return JSON.parse(trimmed); } catch {} const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fenced) return JSON.parse(fenced[1]); const start = trimmed.indexOf("{"); const end = trimmed.lastIndexOf("}"); if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)); throw new Error("no JSON object found in model content"); }
function parseOpenAIResponse(rawText) { let wrapper = null; try { wrapper = JSON.parse(rawText); } catch {} const content = wrapper?.choices?.[0]?.message?.content; if (typeof content === "string" && content.trim()) return { parsed: parseJsonText(content), content_preview: content.slice(0, 1200) }; return { parsed: parseJsonText(rawText), content_preview: rawText.slice(0, 1200) }; }
function findSegments(parsed) { const candidates = [parsed?.segments, parsed?.script?.segments, parsed?.voiceover?.segments, parsed?.video?.segments, parsed?.data?.segments, parsed?.frames, parsed?.panels, Array.isArray(parsed) ? parsed : null]; for (const c of candidates) if (Array.isArray(c) && c.length) return c; return []; }
function firstText(obj, keys) { for (const key of keys) { const value = key.split(".").reduce((cur, part) => cur?.[part], obj); const text = clean(value); if (text) return text; } return ""; }
function normaliseSegment(segment, index, inputSegments, fallback) { const input = inputSegments[index] || {}; const fb = fallback[index] || {}; return { id: input.id || segment.id || fb.id || `segment_${index + 1}`, image_name: input.image_name || segment.image_name || fb.image_name, text: firstText(segment, ["text", "line", "caption", "narration", "voiceover", "copy", "script_text"]) || clean(input.text) || fb.text }; }
function responseShape(value) { if (!value || typeof value !== "object") return typeof value; if (Array.isArray(value)) return `array:${value.length}`; return Object.fromEntries(Object.keys(value).slice(0, 20).map((k) => [k, Array.isArray(value[k]) ? `array:${value[k].length}` : typeof value[k]])); }

async function refineWithOpenAI(story, narration) {
  const brief = sourceBrief(story, narration);
  const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, temperature: 0.35, response_format: { type: "json_object" }, messages: [
    { role: "system", content: "Return JSON only with {title, caption, segments}. segments must be exactly 8 objects, matching input order, each with id, image_name, text. Write as Isla thinking out loud. Use variant_line for the one puzzle-rule beat. Do not invent a variant if variant_name is daily rule." },
    { role: "user", content: JSON.stringify({ task: "Rewrite this into a coherent 8-beat short video script.", required_final_cta: `Play along at ${site(SUITE_URL)}`, brief }) },
  ] }) });
  const rawText = await response.text();
  if (!response.ok) throw new Error(`OpenAI copy refine failed ${response.status}: ${rawText.slice(0, 900)}`);
  let parsed, content_preview;
  try { ({ parsed, content_preview } = parseOpenAIResponse(rawText)); } catch (error) { console.log(`OPENAI_VIDEO_RAW_CONTENT_ON_PARSE_FAIL=${rawText.slice(0, 1800)}`); throw error; }
  const inputSegments = narration?.segments || [];
  const proposed = findSegments(parsed);
  if (proposed.length !== inputSegments.length) { console.log(`OPENAI_VIDEO_RAW_CONTENT_ON_SEGMENT_FAIL=${content_preview}`); throw new Error(`OpenAI returned ${proposed.length} segments, expected ${inputSegments.length}. Parsed shape: ${JSON.stringify(responseShape(parsed)).slice(0, 900)}`); }
  const fallback = fallbackSegments(narration, story);
  const segments = proposed.map((segment, index) => normaliseSegment(segment, index, inputSegments, fallback));
  const empties = segments.filter((s) => !clean(s.text));
  if (empties.length) { console.log(`OPENAI_VIDEO_RAW_CONTENT_ON_EMPTY_FIELD=${content_preview}`); throw new Error(`Parser repair failed: ${empties.length} empty segment line(s)`); }
  return { ...narration, title: clean(parsed.title || narration.title || `${variantName(story)} with Isla`), caption: clean(parsed.caption || `Today’s ${variantName(story)} comic. Play along: ${SUITE_URL}`), variant_name: variantName(story), variant_line: variantLine(story), segments, full_text: segments.map((segment) => segment.text).join("\n\n"), copy_refined: "openai", copy_model: MODEL, generated_at: new Date().toISOString(), openai_response_shape: responseShape(parsed) };
}

async function main() {
  const date = dateString(); const dir = path.join(ROOT, "social", date, "short-video"); const latest = path.join(ROOT, "social", "latest", "short-video"); const narrationFile = path.join(dir, "narration.json"); const story = await readJson(path.join(ROOT, "daily", `${date}.json`), await readJson(path.join(ROOT, "latest.json"), null)); const narration = await readJson(narrationFile, null);
  if (!story || !narration?.segments?.length) { console.log("OpenAI copy refine skipped: missing story or narration data"); return; }
  let refined;
  try { if (!API_KEY) throw new Error("OPENAI_API_KEY missing"); refined = await refineWithOpenAI(story, narration); } catch (error) { refined = fallbackRefine(narration, story); refined.copy_refine_error = error?.message || String(error); console.log(`OpenAI copy refine used fallback: ${refined.copy_refine_error}`); }
  await writeJson(narrationFile, refined); await writeText(path.join(dir, "script.txt"), `${refined.full_text}\n`); await writeText(path.join(dir, "caption.txt"), `${refined.caption || `Today’s ${variantName(story)} comic.\nPlay along: ${SUITE_URL}`}\n`); await writeText(path.join(dir, "subtitles.srt"), srt(refined.segments)); await writeJson(path.join(dir, "manifest.json"), { date, status: "script_ready", voice_name: refined.voice_name || "Isla Sterling", variant_name: variantName(story), variant_line: variantLine(story), copy_refined: refined.copy_refined, copy_model: refined.copy_model || "fallback", generated_at: refined.generated_at, openai_response_shape: refined.openai_response_shape || null }); await copyLatest(dir, latest); console.log(`Short video copy refined: ${refined.copy_refined}`);
}

main().catch((error) => { console.log(`OpenAI copy refine failed safely: ${error?.message || error}`); process.exit(0); });
