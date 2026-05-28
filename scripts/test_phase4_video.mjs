import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";

const ROOT = process.cwd();
const W = 1080;
const H = 1920;
const IMAGE_NAMES = ["00_start-grid.png", "01_panel-01.png", "02_panel-02.png", "03_panel-03.png", "04_panel-04.png", "05_panel-05.png", "06_panel-06.png", "07_finished-grid.png"];

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
async function mkdir(d) { await fs.mkdir(d, { recursive: true }); }
async function exists(f) { try { await fs.access(f); return true; } catch { return false; } }
async function readJson(f, fallback = null) { try { return JSON.parse(await fs.readFile(f, "utf8")); } catch { return fallback; } }
async function writeJson(f, data) { await mkdir(path.dirname(f)); await fs.writeFile(f, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
async function copyIfExists(src, dst) { try { await mkdir(path.dirname(dst)); await fs.copyFile(src, dst); } catch {} }
async function patchManifest(f, patch) { const current = await readJson(f, {}); await writeJson(f, { ...current, ...patch, generated_at: current.generated_at || new Date().toISOString() }); }

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ out, err }) : reject(new Error(`${cmd} failed ${code}: ${err.slice(-1800)}`)));
  });
}

async function duration(file) {
  try {
    const r = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]);
    const n = Number(r.out.trim());
    return Number.isFinite(n) && n > 0 ? n : 24;
  } catch { return 24; }
}

function concatSafe(p) { return p.replace(/'/g, "'\\''"); }
function filterSafe(p) { return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'"); }

async function concatFile(date, seconds) {
  const file = path.join(ROOT, "social", date, "short-video", "images.txt");
  const lines = [];
  for (const name of IMAGE_NAMES) {
    lines.push(`file '${concatSafe(path.join(ROOT, "social", date, name))}'`);
    lines.push(`duration ${seconds.toFixed(3)}`);
  }
  lines.push(`file '${concatSafe(path.join(ROOT, "social", date, IMAGE_NAMES.at(-1)))}'`);
  await fs.writeFile(file, `${lines.join("\n")}\n`, "utf8");
  return file;
}

async function main() {
  const date = dateString();
  const social = path.join(ROOT, "social", date);
  const dir = path.join(social, "short-video");
  const latest = path.join(ROOT, "social", "latest", "short-video");
  const manifest = path.join(dir, "manifest.json");
  await mkdir(dir);
  await mkdir(latest);

  const missing = [];
  for (const name of IMAGE_NAMES) if (!(await exists(path.join(social, name)))) missing.push(name);
  if (missing.length) throw new Error(`Missing image files: ${missing.join(", ")}`);
  const audio = path.join(dir, "voiceover.mp3");
  if (!(await exists(audio))) throw new Error("Missing voiceover.mp3; MP4 not created");

  const dur = await duration(audio);
  const perImage = Math.max(2.2, dur / IMAGE_NAMES.length);
  const listFile = await concatFile(date, perImage);
  const subFile = path.join(dir, "subtitles.srt");
  const out = path.join(dir, `isla_short_video_${date}.mp4`);
  const baseVf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
  const vf = await exists(subFile) ? `${baseVf},subtitles='${filterSafe(subFile)}'` : baseVf;

  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-i", audio, "-vf", vf, "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out]);
  await copyIfExists(out, path.join(latest, path.basename(out)));
  await patchManifest(manifest, { status: "video_ready", video_file: `social/${date}/short-video/${path.basename(out)}`, audio_file: `social/${date}/short-video/voiceover.mp3`, subtitle_file: `social/${date}/short-video/subtitles.srt`, duration_seconds: dur, images_used: IMAGE_NAMES.map((name) => `social/${date}/${name}`) });
  await copyIfExists(manifest, path.join(latest, "manifest.json"));
  console.log(`Short video written: social/${date}/short-video/${path.basename(out)}`);
}

main().catch(async (error) => {
  const date = (() => { try { return dateString(); } catch { return "unknown-date"; } })();
  const dir = path.join(ROOT, "social", date, "short-video");
  await mkdir(dir);
  await patchManifest(path.join(dir, "manifest.json"), { status: "video_failed", error: error?.message || String(error) });
  console.log(`Short video build failed safely: ${error?.message || error}`);
  process.exit(0);
});
