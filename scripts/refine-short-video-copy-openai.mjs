import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const API_KEY = process.env.OPENAI_API_KEY?.trim() || "";
const MODEL = process.env.OPENAI_TEXT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const SUITE_URL = process.env.SUITE_URL || "https://suite.sapiverpress.co.uk";

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(base);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function site(value) {
  return String(value || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function srtTime(seconds) {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const hh = Math.floor(ms / 3600000);
  const mm = Math.floor((ms % 3600000) / 60000);
  const ss = Math.floor((ms % 60000) / 1000);
  const xx = ms % 1000;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")},${String(xx).padStart(3, "0")}`;
}

function srt(segments) {
  return segments.map((segment, index) => `${index + 1}\n${srtTime(index * 3)} --> ${srtTime((index + 1) * 3)}\n${segment.text}\n`).join("\n");
}

async function mkdir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeText(file, text) {
  await mkdir(path.dirname(file));
  await fs.writeFile(file, text, "utf8");
}

async function writeJson(file, data) {
  await writeText(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function copyLatest(src, dst) {
  await fs.rm(dst, { recursive: true, force: true });
  await mkdir(dst);
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    if (entry.isFile()) await fs.copyFile(path.join(src, entry.name), path.join(dst, entry.name));
  }
}

function sourceBrief(story, narration) {
  const scenes = Array.isArray(story?.scenes) ? story.scenes.slice(0, 6) : [];
  return {
    date: story?.date || narration?.date,
    setting: story?.selected_setting || story?.life_memory_entry?.location || "",
    story_note: story?.story_note || "",
    continuation_note: story?.continuation_note || "",
    life_memory_entry: story?.life_memory_entry || null,
    variant_recap: story?.variant_recap || null,
    uk_calendar_date: story?.uk_calendar_date || null,
    raw_segments: narration?.segments || [],
    scenes: scenes.map((scene, index) => ({
      panel: index + 1,
      caption: scene.caption || "",
      dialogue: scene.dialogue || scene.speech_bubble || "",
      description: scene.scene_description || scene.beat || scene.title || "",
      image_fragment: scene.image_prompt_fragment || "",
      setting: scene.setting || "",
      variant_here: Boolean(scene.variant_recap_here),
      calendar_here: Boolean(scene.uk_calendar_recap_here),
    })),
  };
}

function fallbackRefine(narration, story) {
  const variant = clean(story?.variant_recap?.variant_name || "today's puzzle");
  const setting = clean(story?.selected_setting || story?.life_memory_entry?.location || "a quiet corner");
  const lifeThread = clean(story?.life_memory_entry?.thread_to_continue || story?.continuation_note || "keeping a small routine alive");
  const rule = clean(story?.variant_recap?.line || "the rule matters before the first move");
  const calendar = clean(story?.uk_calendar_date?.name || "");
  const segments = [
    { id: "intro", image_name: "00_start-grid.png", text: `Today finds Isla in ${setting}, using the grid as a quiet reset.` },
    { id: "panel_1", image_name: "01_panel-01.png", text: "She gives herself one small rule: no rushing the first look." },
    { id: "panel_2", image_name: "02_panel-02.png", text: `The ${variant} twist changes how she reads the empty spaces.` },
    { id: "panel_3", image_name: "03_panel-03.png", text: rule },
    { id: "panel_4", image_name: "04_panel-04.png", text: "A pattern starts to appear, but she checks it before trusting it." },
    { id: "panel_5", image_name: "05_panel-05.png", text: calendar ? `${calendar} sits quietly in the background while the grid settles.` : `The puzzle becomes part of ${lifeThread}.` },
    { id: "panel_6", image_name: "06_panel-06.png", text: "By the end, the point is not speed. It is leaving the page clearer than she found it." },
    { id: "cta", image_name: "07_finished-grid.png", text: `Play along at ${site(SUITE_URL)}` },
  ];
  return { ...narration, segments, full_text: segments.map((segment) => segment.text).join("\n\n"), copy_refined: "fallback", generated_at: new Date().toISOString() };
}

function parseJsonText(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i) || trimmed.match(/(\{[\s\S]*\})/);
  if (match) return JSON.parse(match[1]);
  throw new Error("OpenAI response was not valid JSON");
}

async function refineWithOpenAI(story, narration) {
  const brief = sourceBrief(story, narration);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.55,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are the story editor for Sapiver Press's Isla daily puzzle video.",
            "Turn rough panel captions into a coherent micro-story voiceover.",
            "It must feel like a calm illustrated diary, not random captions and not advertising copy.",
            "Keep it simple, human, understated, and UK-friendly.",
            "Use Isla as the subject. The puzzle is a recurring thread, not the whole personality.",
            "Include at most one brief puzzle rule note if relevant.",
            "Include UK calendar context only if provided, and make it feel natural.",
            "Avoid babble, clichés, fake drama, hashtags, emojis, and repeated phrases.",
            "Return JSON only with: title, caption, segments.",
            "segments must contain exactly 8 objects matching the input image_name order, each with id, image_name, text.",
            "Each text should be 8 to 18 words. Total voiceover should feel like one continuous short story.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Rewrite this into a coherent 8-beat short video script.",
            required_final_cta: `Play along at ${site(SUITE_URL)}`,
            brief,
          }),
        },
      ],
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI copy refine failed ${response.status}: ${text.slice(0, 900)}`);
  const parsed = parseJsonText(text);
  const inputSegments = narration?.segments || [];
  const proposed = Array.isArray(parsed.segments) ? parsed.segments : [];
  if (proposed.length !== inputSegments.length) throw new Error(`OpenAI returned ${proposed.length} segments, expected ${inputSegments.length}`);

  const segments = proposed.map((segment, index) => ({
    id: inputSegments[index]?.id || segment.id || `segment_${index + 1}`,
    image_name: inputSegments[index]?.image_name || segment.image_name,
    text: clean(segment.text || inputSegments[index]?.text || ""),
  }));
  if (segments.some((segment) => !segment.text)) throw new Error("OpenAI returned an empty segment line");

  return {
    ...narration,
    title: clean(parsed.title || narration.title || "Sapiver Press Daily Comic"),
    caption: clean(parsed.caption || `Today’s Sapiver Press puzzle comic. Play along: ${SUITE_URL}`),
    segments,
    full_text: segments.map((segment) => segment.text).join("\n\n"),
    copy_refined: "openai",
    copy_model: MODEL,
    generated_at: new Date().toISOString(),
  };
}

async function main() {
  const date = dateString();
  const dir = path.join(ROOT, "social", date, "short-video");
  const latest = path.join(ROOT, "social", "latest", "short-video");
  const narrationFile = path.join(dir, "narration.json");
  const story = await readJson(path.join(ROOT, "daily", `${date}.json`), await readJson(path.join(ROOT, "latest.json"), null));
  const narration = await readJson(narrationFile, null);
  if (!story || !narration?.segments?.length) {
    console.log("OpenAI copy refine skipped: missing story or narration data");
    return;
  }

  let refined;
  try {
    if (!API_KEY) throw new Error("OPENAI_API_KEY missing");
    refined = await refineWithOpenAI(story, narration);
  } catch (error) {
    refined = fallbackRefine(narration, story);
    refined.copy_refine_error = error?.message || String(error);
    console.log(`OpenAI copy refine used fallback: ${refined.copy_refine_error}`);
  }

  await writeJson(narrationFile, refined);
  await writeText(path.join(dir, "script.txt"), `${refined.full_text}\n`);
  await writeText(path.join(dir, "caption.txt"), `${refined.caption || `Today’s Sapiver Press puzzle comic.\nPlay along: ${SUITE_URL}`}\n`);
  await writeText(path.join(dir, "subtitles.srt"), srt(refined.segments));
  await writeJson(path.join(dir, "manifest.json"), {
    date,
    status: "script_ready",
    voice_name: refined.voice_name || "Isla Sterling",
    copy_refined: refined.copy_refined,
    copy_model: refined.copy_model || "fallback",
    generated_at: refined.generated_at,
  });
  await copyLatest(dir, latest);
  console.log(`Short video copy refined: ${refined.copy_refined}`);
}

main().catch((error) => {
  console.log(`OpenAI copy refine failed safely: ${error?.message || error}`);
  process.exit(0);
});
