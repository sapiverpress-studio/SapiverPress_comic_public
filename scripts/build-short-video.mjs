import fs from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();

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

async function mkdir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file));
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function copyIfExists(src, dst) {
  if (!(await exists(src))) return;
  await mkdir(path.dirname(dst));
  await fs.copyFile(src, dst);
}

function runFfmpeg(args, label) {
  const result = spawnSync("ffmpeg", ["-y", ...args], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

async function main() {
  const date = dateString();
  const socialDir = path.join(ROOT, "social", date);
  const latestSocialDir = path.join(ROOT, "social", "latest");
  const videoDir = path.join(socialDir, "short-video");
  const latestVideoDir = path.join(latestSocialDir, "short-video");
  const manifestFile = path.join(videoDir, "manifest.json");
  await mkdir(videoDir);

  const narration = await readJson(path.join(videoDir, "narration.json"), await readJson(path.join(latestVideoDir, "narration.json"), null));
  const imageNames = narration?.segments?.map((segment) => segment.image_name).filter(Boolean) || [
    "00_start-grid.png",
    "01_panel-01.png",
    "02_panel-02.png",
    "03_panel-03.png",
    "04_panel-04.png",
    "05_panel-05.png",
    "06_panel-06.png",
    "07_finished-grid.png",
  ];

  const framePaths = [];
  for (const imageName of imageNames) {
    const dated = path.join(socialDir, imageName);
    const latest = path.join(latestSocialDir, imageName);
    if (await exists(dated)) framePaths.push(dated);
    else if (await exists(latest)) framePaths.push(latest);
  }

  if (!framePaths.length) {
    await writeJson(manifestFile, { date, status: "video_failed", error: "No social panel images found" });
    console.log("Short video build skipped: no social panel images found");
    return;
  }

  const concatFile = path.join(videoDir, "frames.txt");
  const lines = [];
  for (const frame of framePaths) {
    lines.push(`file '${frame.replace(/'/g, "'\\''")}'`);
    lines.push("duration 3");
  }
  lines.push(`file '${framePaths[framePaths.length - 1].replace(/'/g, "'\\''")}'`);
  await fs.writeFile(concatFile, `${lines.join("\n")}\n`, "utf8");

  const silentVideo = path.join(videoDir, "silent.mp4");
  const finalVideo = path.join(videoDir, `sapiver_isla_daily_${date}.mp4`);
  const latestVideo = path.join(latestVideoDir, `sapiver_isla_daily_${date}.mp4`);
  const audioPath = path.join(videoDir, "voiceover.mp3");
  const latestAudioPath = path.join(latestVideoDir, "voiceover.mp3");

  runFfmpeg([
    "-f", "concat",
    "-safe", "0",
    "-i", concatFile,
    "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
    "-r", "30",
    "-movflags", "+faststart",
    silentVideo,
  ], "silent video render");

  const audioAvailable = await exists(audioPath);
  const fallbackAudioAvailable = await exists(latestAudioPath);
  const chosenAudio = audioAvailable ? audioPath : fallbackAudioAvailable ? latestAudioPath : "";

  if (chosenAudio) {
    runFfmpeg([
      "-i", silentVideo,
      "-i", chosenAudio,
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      "-movflags", "+faststart",
      finalVideo,
    ], "audio mux");
  } else {
    await fs.copyFile(silentVideo, finalVideo);
  }

  await copyIfExists(finalVideo, latestVideo);
  await copyIfExists(path.join(videoDir, "script.txt"), path.join(latestVideoDir, "script.txt"));
  await copyIfExists(path.join(videoDir, "caption.txt"), path.join(latestVideoDir, "caption.txt"));
  await copyIfExists(path.join(videoDir, "subtitles.srt"), path.join(latestVideoDir, "subtitles.srt"));
  await copyIfExists(path.join(videoDir, "narration.json"), path.join(latestVideoDir, "narration.json"));

  await writeJson(manifestFile, {
    date,
    status: "video_ready",
    video_file: `social/${date}/short-video/sapiver_isla_daily_${date}.mp4`,
    audio_used: Boolean(chosenAudio),
    frame_count: framePaths.length,
    generated_at: new Date().toISOString(),
  });
  await copyIfExists(manifestFile, path.join(latestVideoDir, "manifest.json"));

  console.log(`Short video written: social/${date}/short-video/sapiver_isla_daily_${date}.mp4`);
}

main().catch(async (error) => {
  const date = (() => { try { return dateString(); } catch { return "unknown-date"; } })();
  const videoDir = path.join(ROOT, "social", date, "short-video");
  await mkdir(videoDir);
  await writeJson(path.join(videoDir, "manifest.json"), {
    date,
    status: "video_failed",
    error: error?.message || String(error),
    generated_at: new Date().toISOString(),
  });
  console.log(`Short video build failed safely: ${error?.message || error}`);
  process.exit(0);
});
