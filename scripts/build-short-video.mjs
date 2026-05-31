import fs from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const DEFAULT_FRAME_SECONDS = 3;
const AUDIO_TAIL_PAD_SECONDS = Number(process.env.SHORT_VIDEO_AUDIO_TAIL_PAD_SECONDS || "1.2");
const SUITE_URL = process.env.SUITE_URL || "https://suite.sapiverpress.co.uk";
const ETSY_URL = process.env.ETSY_URL || "https://sapiverpress.etsy.com?coupon=SAVE20";

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

function humanDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
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

async function writeText(file, text) {
  await mkdir(path.dirname(file));
  await fs.writeFile(file, `${text.trim()}\n`, "utf8");
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

function probeDurationSeconds(file) {
  if (!file) return 0;
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) return 0;
  const value = Number(String(result.stdout || "").trim());
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function durationForFrames(frameCount, audioDuration) {
  if (!frameCount) return DEFAULT_FRAME_SECONDS;
  if (!audioDuration) return DEFAULT_FRAME_SECONDS;
  const requiredTotal = audioDuration + AUDIO_TAIL_PAD_SECONDS;
  const requiredPerFrame = requiredTotal / frameCount;
  return Math.max(DEFAULT_FRAME_SECONDS, Math.ceil(requiredPerFrame * 100) / 100);
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function variantName(story) {
  return clean(story?.required_puzzle_copy?.variant_name || story?.variant_recap?.variant_name || "Trigoku") || "Trigoku";
}

function pickHook(story, narration) {
  const title = clean(story?.storyboard_arc_title || narration?.title || "Isla's daily puzzle break");
  const panel = clean(story?.scenes?.[3]?.storyboard_caption || story?.storyboard_arc?.puzzle_moment || "one careful grid check changes the day");
  if (title && panel) return `${title}: ${panel}`;
  return title || panel || "Isla takes three minutes for today's puzzle.";
}

function buildTikTokPost({ date, story, narration, videoFile }) {
  const hook = pickHook(story, narration).replace(/\.$/, "");
  const puzzle = variantName(story);
  const line = clean(story?.scenes?.[3]?.storyboard_dialogue || story?.required_puzzle_copy?.required_dialogue_panel_4 || "Can you spot the move before Isla does?");
  const hashtags = [
    "#SapiverPress",
    "#IslaDaily",
    "#PuzzleTok",
    "#SudokuTok",
    puzzle.toLowerCase().includes("trigoku") ? "#Trigoku" : "#LogicPuzzle",
    "#DailyPuzzle",
    "#BrainTraining",
    "#CozyGaming",
    "#StudyTok",
    "#BookTok",
    "#FYP",
  ];
  return [
    `${hook}`,
    "",
    `${line}`,
    "",
    `Play along: ${SUITE_URL}`,
    `Printables & gifts: ${ETSY_URL}`,
    "",
    `Video file: ${videoFile}`,
    `Date: ${humanDate(date)}`,
    "",
    hashtags.join(" "),
  ].join("\n");
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
  const story = await readJson(path.join(ROOT, "daily", `${date}.json`), await readJson(path.join(ROOT, "latest.json"), null));
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

  const silentVideo = path.join(videoDir, "silent.mp4");
  const finalVideo = path.join(videoDir, `sapiver_isla_daily_${date}.mp4`);
  const latestVideo = path.join(latestVideoDir, `sapiver_isla_daily_${date}.mp4`);
  const audioPath = path.join(videoDir, "voiceover.mp3");
  const latestAudioPath = path.join(latestVideoDir, "voiceover.mp3");
  const audioAvailable = await exists(audioPath);
  const fallbackAudioAvailable = await exists(latestAudioPath);
  const chosenAudio = audioAvailable ? audioPath : fallbackAudioAvailable ? latestAudioPath : "";
  const audioDurationSeconds = chosenAudio ? probeDurationSeconds(chosenAudio) : 0;
  const frameDurationSeconds = durationForFrames(framePaths.length, audioDurationSeconds);
  const silentDurationSeconds = frameDurationSeconds * framePaths.length;

  const concatFile = path.join(videoDir, "frames.txt");
  const lines = [];
  for (const frame of framePaths) {
    lines.push(`file '${frame.replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${frameDurationSeconds.toFixed(2)}`);
  }
  lines.push(`file '${framePaths[framePaths.length - 1].replace(/'/g, "'\\''")}'`);
  await fs.writeFile(concatFile, `${lines.join("\n")}\n`, "utf8");

  console.log(`Short video timing: frames=${framePaths.length}, frame_duration=${frameDurationSeconds.toFixed(2)}s, silent_duration≈${silentDurationSeconds.toFixed(2)}s, audio_duration=${audioDurationSeconds.toFixed(2)}s`);

  runFfmpeg([
    "-f", "concat",
    "-safe", "0",
    "-i", concatFile,
    "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
    "-r", "30",
    "-movflags", "+faststart",
    silentVideo,
  ], "silent video render");

  if (chosenAudio) {
    runFfmpeg([
      "-i", silentVideo,
      "-i", chosenAudio,
      "-filter:a", `apad=pad_dur=${AUDIO_TAIL_PAD_SECONDS}`,
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

  const videoFile = `sapiver_isla_daily_${date}.mp4`;
  const tiktokPost = buildTikTokPost({ date, story, narration, videoFile });
  await writeText(path.join(videoDir, "tiktok-post.txt"), tiktokPost);
  await writeJson(path.join(videoDir, "tiktok-post.json"), {
    date,
    platform: "tiktok",
    video_file: videoFile,
    post_text: tiktokPost,
    generated_at: new Date().toISOString(),
  });

  await copyIfExists(finalVideo, latestVideo);
  await copyIfExists(path.join(videoDir, "script.txt"), path.join(latestVideoDir, "script.txt"));
  await copyIfExists(path.join(videoDir, "caption.txt"), path.join(latestVideoDir, "caption.txt"));
  await copyIfExists(path.join(videoDir, "subtitles.srt"), path.join(latestVideoDir, "subtitles.srt"));
  await copyIfExists(path.join(videoDir, "narration.json"), path.join(latestVideoDir, "narration.json"));
  await copyIfExists(path.join(videoDir, "tiktok-post.txt"), path.join(latestVideoDir, "tiktok-post.txt"));
  await copyIfExists(path.join(videoDir, "tiktok-post.json"), path.join(latestVideoDir, "tiktok-post.json"));

  await writeJson(manifestFile, {
    date,
    status: "video_ready",
    video_file: `social/${date}/short-video/sapiver_isla_daily_${date}.mp4`,
    tiktok_post_file: `social/${date}/short-video/tiktok-post.txt`,
    audio_used: Boolean(chosenAudio),
    audio_duration_seconds: Number(audioDurationSeconds.toFixed(2)),
    audio_tail_pad_seconds: AUDIO_TAIL_PAD_SECONDS,
    frame_count: framePaths.length,
    frame_duration_seconds: Number(frameDurationSeconds.toFixed(2)),
    estimated_silent_duration_seconds: Number(silentDurationSeconds.toFixed(2)),
    generated_at: new Date().toISOString(),
  });
  await copyIfExists(manifestFile, path.join(latestVideoDir, "manifest.json"));

  console.log(`Short video written: social/${date}/short-video/sapiver_isla_daily_${date}.mp4`);
  console.log("TikTok post written: social/" + date + "/short-video/tiktok-post.txt");
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
