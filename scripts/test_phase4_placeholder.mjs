import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const SUITE_URL = process.env.SUITE_URL || "https://suite.sapiverpress.co.uk";
const VOICE_NAME = process.env.ELEVENLABS_VOICE_NAME || "Isla Fletcher";

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
async function readJson(file, fallback = null) { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; } }
async function mkdir(dir) { await fs.mkdir(dir, { recursive: true }); }
async function writeText(file, text) { await mkdir(path.dirname(file)); await fs.writeFile(file, text, "utf8"); }
async function writeJson(file, data) { await writeText(file, `${JSON.stringify(data, null, 2)}\n`); }
function clean(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
function site(v) { return String(v || "").replace(/^https?:\/\//, "").replace(/\/$/, ""); }
function sceneLine(scene, index) { return clean(scene?.caption || scene?.dialogue || scene?.speech_bubble || scene?.title || scene?.beat || scene?.scene_description || `Panel ${index + 1}`); }
function srtTime(s) { const ms = Math.round(Math.max(0, s) * 1000); const hh = Math.floor(ms / 3600000); const mm = Math.floor((ms % 3600000) / 60000); const ss = Math.floor((ms % 60000) / 1000); const xx = ms % 1000; return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")},${String(xx).padStart(3,"0")}`; }
function srt(segments) { return segments.map((x, i) => `${i + 1}\n${srtTime(i * 3)} --> ${srtTime((i + 1) * 3)}\n${x.text}\n`).join("\n"); }
async function copyLatest(src, dst) { await fs.rm(dst, { recursive: true, force: true }); await mkdir(dst); for (const e of await fs.readdir(src, { withFileTypes: true })) if (e.isFile()) await fs.copyFile(path.join(src, e.name), path.join(dst, e.name)); }

async function main() {
  const date = dateString();
  const story = await readJson(path.join(ROOT, "daily", `${date}.json`), await readJson(path.join(ROOT, "latest.json"), null));
  const out = path.join(ROOT, "social", date, "short-video");
  const latest = path.join(ROOT, "social", "latest", "short-video");
  await mkdir(out);
  if (!story) throw new Error("Missing daily story data");
  const scenes = [...(story.scenes || [])].slice(0, 6);
  while (scenes.length < 6) scenes.push({ caption: `Panel ${scenes.length + 1}` });
  const segments = [
    { id: "intro", image_name: "00_start-grid.png", text: "Here’s today’s Sapiver Press puzzle comic." },
    ...scenes.map((scene, i) => ({ id: `panel_${i + 1}`, image_name: `${String(i + 1).padStart(2,"0")}_panel-${String(i + 1).padStart(2,"0")}.png`, text: sceneLine(scene, i) })),
    { id: "cta", image_name: "07_finished-grid.png", text: `Play along at ${site(SUITE_URL)}` },
  ];
  const narration = { date, title: "Sapiver Press Daily Comic", voice_name: VOICE_NAME, segments, full_text: segments.map((x) => x.text).join("\n\n"), generated_at: new Date().toISOString() };
  await writeText(path.join(out, "script.txt"), `${narration.full_text}\n`);
  await writeJson(path.join(out, "narration.json"), narration);
  await writeText(path.join(out, "caption.txt"), `Today’s Sapiver Press puzzle comic.\nPlay along: ${SUITE_URL}\n`);
  await writeText(path.join(out, "subtitles.srt"), srt(segments));
  await writeJson(path.join(out, "manifest.json"), { date, status: "script_ready", voice_name: VOICE_NAME, generated_at: narration.generated_at });
  await copyLatest(out, latest);
  console.log(`Short video script assets written: social/${date}/short-video`);
}
main().catch((error) => { console.log(`Short video script step failed safely: ${error?.message || error}`); process.exit(0); });
