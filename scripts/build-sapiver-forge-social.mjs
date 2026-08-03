import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { assertSocialContentUsable } from "./lib/social-content-safety.mjs";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
const SOURCE_ROOT = process.env.SAPIVER_FORGE_BUNDLE_ROOT || path.join(ROOT, "vendor", "sapiver-forge", "bridge", "sapiver-forge", DATE);
const OUT = path.join(ROOT, "social", "sapiver-forge", DATE);
const ISLA_HOOK = path.join(ROOT, "assets", "sapiver-forge", "isla-hook.mp4");
const USE_ISLA_HOOK = fssync.existsSync(ISLA_HOOK);
const DISCLOSURE = "Produced with AI assistance and released with human approval by Sapiver Forge.";
const TIKTOK_END_PAD_SECONDS = 0.35;

function must(file) { if (!fssync.existsSync(file)) throw new Error(`Missing required Sapiver Forge file: ${file}`); }
function run(args) { execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" }); }
function probeDuration(file) {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" }).trim());
}
function clean(text, limit = 800) { return String(text || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit); }
function stripDirectLinks(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function wrapText(text, maxChars) {
  const words = clean(text, 1400).split(" ").filter(Boolean);
  const lines = []; let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) line = next;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}
async function write(rel, content) {
  const file = path.join(OUT, rel); await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, String(content || "").trim() + "\n", "utf8");
  return path.relative(ROOT, file).replaceAll("\\", "/");
}
async function textFile(name, content) {
  const file = path.join(OUT, "text", name); await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, String(content || "").replace(/\r/g, "").trim(), "utf8"); return file;
}
function src(rel) { return path.isAbsolute(rel) ? rel : path.join(SOURCE_ROOT, rel); }
function rel(file) { return path.relative(ROOT, file).replaceAll("\\", "/"); }
function esc(file) { return file.replaceAll("'", "\\'"); }
function htmlEsc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function renderStill({ input, out, size, titleFile, sourceFile, fontSize = 54 }) {
  const [w, h] = size.split("x").map(Number);
  const vf = [
    `scale=${w}:${h}:force_original_aspect_ratio=increase`,
    `crop=${w}:${h}`,
    `drawbox=x=0:y=${Math.floor(h*0.58)}:w=${w}:h=${Math.floor(h*0.42)}:color=black@0.58:t=fill`,
    `drawtext=fontcolor=#E9C46A:fontsize=30:textfile='${esc(sourceFile)}':x=70:y=${Math.floor(h*0.62)}`,
    `drawtext=fontcolor=white:fontsize=${fontSize}:textfile='${esc(titleFile)}':x=70:y=${Math.floor(h*0.69)}:line_spacing=18`
  ].join(",");
  run(["-i", input, "-vf", vf, "-frames:v", "1", out]);
}

function renderMotion({ input, out, duration, titleFile, sourceFile, index }) {
  const frames = Math.max(1, Math.round(duration * 30));
  const vf = [
    "scale=1200:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    `zoompan=z='min(zoom+0.0007,1.07)':d=1:s=1080x1920:fps=30`,
    "drawbox=x=0:y=1180:w=1080:h=740:color=black@0.56:t=fill",
    `drawtext=fontcolor=#E9C46A:fontsize=34:text='${String(index).padStart(2,"0")} / 03':x=70:y=105`,
    `drawtext=fontcolor=#E9C46A:fontsize=30:textfile='${esc(sourceFile)}':x=70:y=1240`,
    `drawtext=fontcolor=white:fontsize=56:textfile='${esc(titleFile)}':x=70:y=1345:line_spacing=22`,
    "fade=t=in:st=0:d=0.35",
    `fade=t=out:st=${Math.max(0.2, duration-0.35).toFixed(2)}:d=0.35`,
    "format=yuv420p"
  ].join(",");
  run(["-loop", "1", "-i", input, "-t", duration.toFixed(3), "-vf", vf, "-frames:v", String(frames), "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
}

function renderTikTokPhase({ input, out, duration, titleFile, labelFile, zoomStep = 0.0014 }) {
  const frames = Math.max(1, Math.round(duration * 30));
  const vf = [
    "scale=1200:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    `zoompan=z='min(zoom+${zoomStep},1.11)':d=1:s=1080x1920:fps=30`,
    "drawbox=x=0:y=1130:w=1080:h=790:color=black@0.62:t=fill",
    `drawtext=fontcolor=#E9C46A:fontsize=28:textfile='${esc(labelFile)}':x=58:y=1190`,
    `drawtext=fontcolor=white:fontsize=60:textfile='${esc(titleFile)}':x=58:y=1300:line_spacing=20`,
    "fade=t=in:st=0:d=0.12",
    `fade=t=out:st=${Math.max(0.12, duration-0.12).toFixed(2)}:d=0.12`,
    "format=yuv420p"
  ].join(",");
  run(["-loop", "1", "-i", input, "-t", duration.toFixed(3), "-vf", vf, "-frames:v", String(frames), "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
}

function renderIslaHook({ input, out, duration, titleFile, labelFile, start = 0 }) {
  const frames = Math.max(1, Math.round(duration * 30));
  const vf = [
    "scale=-2:1920",
    "crop=1080:1920:(iw-1080)/2:0",
    "drawbox=x=0:y=1130:w=1080:h=790:color=black@0.62:t=fill",
    `drawtext=fontcolor=#E9C46A:fontsize=28:textfile='${esc(labelFile)}':x=58:y=1190`,
    `drawtext=fontcolor=white:fontsize=60:textfile='${esc(titleFile)}':x=58:y=1300:line_spacing=20`,
    "fade=t=in:st=0:d=0.12",
    `fade=t=out:st=${Math.max(0.12, duration-0.12).toFixed(2)}:d=0.12`,
    "format=yuv420p"
  ].join(",");
  run(["-ss", start.toFixed(3), "-i", input, "-t", duration.toFixed(3), "-an", "-vf", vf, "-frames:v", String(frames), "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
}

function renderCta({ input, out, duration, titleFile, sourceFile }) {
  const frames = Math.max(1, Math.round(duration * 30));
  const vf = [
    "scale=1200:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    "boxblur=8:2",
    "drawbox=x=0:y=0:w=1080:h=1920:color=#061525@0.78:t=fill",
    `drawtext=fontcolor=#E9C46A:fontsize=38:textfile='${esc(sourceFile)}':x=(w-text_w)/2:y=540`,
    `drawtext=fontcolor=white:fontsize=58:textfile='${esc(titleFile)}':x=(w-text_w)/2:y=690:line_spacing=30`,
    "fade=t=in:st=0:d=0.3",
    `fade=t=out:st=${Math.max(0.2, duration-0.3).toFixed(2)}:d=0.3`,
    "format=yuv420p"
  ].join(",");
  run(["-loop", "1", "-i", input, "-t", duration.toFixed(3), "-vf", vf, "-frames:v", String(frames), "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
}

must(path.join(SOURCE_ROOT, "manifest.json"));
const bundle = JSON.parse(await fs.readFile(path.join(SOURCE_ROOT, "manifest.json"), "utf8"));
if (bundle.approved?.article !== true) throw new Error("Sapiver Forge article is not approved.");
if (bundle.ai_media?.generated !== true) throw new Error("AI media is missing. Run Sapiver Forge 'Generate Sapiver Forge AI Media' before distribution.");
assertSocialContentUsable(bundle);

const defaultCaptionCta = "Read the full Sapiver Forge breakdown through the link in our bio. Prefer to listen? Search ‘Sapiver Forge AI Briefing’ on your podcast provider.";
const captionCta = stripDirectLinks(bundle.calls_to_action?.caption || defaultCaptionCta);
const screenLines = bundle.calls_to_action?.screen_lines || [
  "READ THE FULL BREAKDOWN",
  "Link in bio",
  "LISTEN ON THE GO",
  "Search: Sapiver Forge AI Briefing"
];

const availableImages = (bundle.ai_media.story_images || []).map(src).filter((file) => fssync.existsSync(file));
const narration = src(bundle.ai_media.narration);
if (availableImages.length < 1) throw new Error("At least one verified-story image is required.");
must(narration);
const availableStories = (bundle.stories || []).slice(0, 3);
if (availableStories.length < 1) throw new Error("At least one verified story record is required in the Sapiver Forge bundle.");
const images = Array.from({ length: 3 }, (_, index) => availableImages[index % availableImages.length]);
const stories = Array.from({ length: 3 }, (_, index) => availableStories[index % availableStories.length]);

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });

const pinTitle = await write("copy/pinterest-title.txt", bundle.pinterest?.title || bundle.article?.headline);
const pinCaption = await write("copy/pinterest-caption.txt", `${bundle.pinterest?.description || bundle.article?.dek}\n\n${DISCLOSURE}`);
const fbBase = stripDirectLinks(bundle.facebook?.post || "");
const fbCaption = await write("copy/facebook-post.txt", `${fbBase}\n\n${captionCta}\n\n${DISCLOSURE}`);
const fbComment = await write("copy/facebook-first-comment.txt", "Full Sapiver Forge breakdown: use the link in our bio. Listen on the go by searching ‘Sapiver Forge AI Briefing’ in your podcast app.");
const ytTitle = await write("copy/youtube-title.txt", bundle.youtube?.title || bundle.article?.headline);
const ytBase = stripDirectLinks(bundle.youtube?.description || "");
const ytCaption = await write("copy/youtube-description.txt", `${ytBase}\n\n${captionCta}\n\n${DISCLOSURE}`);
const tiktokHookCopy = clean(bundle.ai_media?.tiktok?.hook || "", 220);
const tiktokQuestionCopy = clean(bundle.ai_media?.tiktok?.response_prompt || "", 220);
const tiktokPayoffCopy = clean(bundle.ai_media?.tiktok?.payoff || "", 620)
  .replace(/[^.!?]*\?\s*$/u, "")
  .trim();
const tiktokCaptionText = [
  tiktokHookCopy,
  tiktokPayoffCopy,
  "Before you send AI-assisted work, check what changed, what supports it and who approved the final version.",
  tiktokQuestionCopy,
  "Use the Sapiver Forge AI Output Release Gate through the link in our bio.",
  DISCLOSURE,
  "#AIForFreelancers #ClientWork #AIChecklist #SapiverForge"
].filter(Boolean).join("\n\n");
const tiktokCaption = await write("copy/tiktok-caption.txt", tiktokCaptionText);

const fbImages = [];
for (let i = 0; i < 3; i++) {
  const title = await textFile(`story-${i+1}-title.txt`, wrapText(stories[i].title, 28));
  const source = await textFile(`story-${i+1}-source.txt`, clean(stories[i].source_name || bundle.sources?.[i]?.source_name || "Source", 80));
  const out = path.join(OUT, "facebook", `story-${i+1}.png`); await fs.mkdir(path.dirname(out), { recursive: true });
  renderStill({ input: images[i], out, size: "1080x1350", titleFile: title, sourceFile: source, fontSize: 50 });
  fbImages.push(rel(out));
}

const pinTitleFile = await textFile("pin-title.txt", wrapText(bundle.pinterest?.title || bundle.article?.headline, 25));
const pinSourceFile = await textFile("pin-source.txt", "TODAY IN AI • SAPIVER FORGE");
const pinOut = path.join(OUT, "pinterest", "pin.png"); await fs.mkdir(path.dirname(pinOut), { recursive: true });
renderStill({ input: images[0], out: pinOut, size: "1000x1500", titleFile: pinTitleFile, sourceFile: pinSourceFile, fontSize: 52 });

const audioDuration = probeDuration(narration);
const primaryStoryIndex = Math.min(2, Math.max(0, Number(bundle.media_metadata?.main_story_index) || 0));
// Use the complete approved Isla action clip for the longer briefing. The
// narration still begins immediately, so this replaces the opening visuals
// rather than adding a silent pre-roll.
const introDuration = USE_ISLA_HOOK ? Math.min(2.0, probeDuration(ISLA_HOOK)) : 2.0;
const outroDuration = 2.5;
const ctaDuration = 2.5;
const storyDuration = Math.max(4.5, audioDuration - introDuration - outroDuration - ctaDuration);
const segmentDir = path.join(OUT, "video", "segments"); await fs.mkdir(segmentDir, { recursive: true });
const segments = [];

const primaryHook = clean(bundle.ai_media?.tiktok?.hook || bundle.media_metadata?.hook || bundle.article?.headline, 180);
if (/three ai updates|today in ai|latest ai news|ai updates? that (?:actually )?matter/i.test(primaryHook)) {
  throw new Error("Primary video hook repeats the failed generic AI-update format.");
}
const hookFile = await textFile("hook.txt", wrapText(primaryHook, 24));
const hookSource = await textFile("hook-source.txt", "SAPIVER FORGE • AI CLIENT-WORK CHECK");
const intro = path.join(segmentDir, "00-intro.mp4");
if (USE_ISLA_HOOK) {
  renderIslaHook({ input: ISLA_HOOK, out: intro, duration: introDuration, titleFile: hookFile, labelFile: hookSource });
} else {
  renderMotion({ input: images[0], out: intro, duration: introDuration, titleFile: hookFile, sourceFile: hookSource, index: 0 });
}
segments.push(intro);

const primaryStory = stories[primaryStoryIndex];
const primaryTitle = await textFile("video-story.txt", wrapText(primaryStory.title, 25));
const primarySource = await textFile("video-source.txt", clean(primaryStory.source_name || bundle.sources?.[primaryStoryIndex]?.source_name || "Source", 80));
if (USE_ISLA_HOOK && storyDuration >= 9) {
  const cutawayDuration = Math.min(1.5, probeDuration(ISLA_HOOK) - 5.5);
  const imageDuration = (storyDuration - (cutawayDuration * 2)) / 3;
  for (let index = 0; index < 3; index += 1) {
    const primarySegment = path.join(segmentDir, `01-story-${index + 1}.mp4`);
    renderMotion({ input: images[primaryStoryIndex], out: primarySegment, duration: imageDuration, titleFile: primaryTitle, sourceFile: primarySource, index: 1 });
    segments.push(primarySegment);
    if (index < 2) {
      const cutaway = path.join(segmentDir, `01-isla-cutaway-${index + 1}.mp4`);
      renderIslaHook({
        input: ISLA_HOOK,
        out: cutaway,
        duration: cutawayDuration,
        titleFile: primaryTitle,
        labelFile: primarySource,
        start: index === 0 ? 3.0 : 5.5
      });
      segments.push(cutaway);
    }
  }
} else {
  const primarySegment = path.join(segmentDir, "01-story.mp4");
  renderMotion({ input: images[primaryStoryIndex], out: primarySegment, duration: storyDuration, titleFile: primaryTitle, sourceFile: primarySource, index: 1 });
  segments.push(primarySegment);
}

const takeawayFile = await textFile("takeaway.txt", wrapText(bundle.media_metadata?.practical_takeaway || "Focus on what changes your workflow, not what creates the most hype.", 27));
const takeawaySource = await textFile("takeaway-source.txt", "PRACTICAL TAKEAWAY");
const outro = path.join(segmentDir, "04-outro.mp4");
renderMotion({ input: images[2], out: outro, duration: outroDuration, titleFile: takeawayFile, sourceFile: takeawaySource, index: 3 });
segments.push(outro);

const ctaTitle = await textFile("cta-title.txt", screenLines.join("\n"));
const ctaSource = await textFile("cta-source.txt", "SAPIVER FORGE • HUMAN-LED. AI-EMPOWERED.");
const ctaOut = path.join(segmentDir, "05-cta.mp4");
renderCta({ input: images[0], out: ctaOut, duration: ctaDuration, titleFile: ctaTitle, sourceFile: ctaSource });
segments.push(ctaOut);

const concatFile = path.join(OUT, "video", "concat.txt");
await fs.writeFile(concatFile, segments.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n") + "\n", "utf8");
const silentVideo = path.join(OUT, "video", "sapiver-forge-short-silent.mp4");
run(["-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", silentVideo]);
const videoOut = path.join(OUT, "video", "sapiver-forge-youtube-short.mp4");
run(["-i", silentVideo, "-i", narration, "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", videoOut]);

const tiktok = bundle.ai_media?.tiktok;
const tiktokNarration = bundle.ai_media?.tiktok_narration ? src(bundle.ai_media.tiktok_narration) : "";
if (!tiktok || !tiktokNarration) throw new Error("TikTok-specific narration and scene metadata are required.");
must(tiktokNarration);
const tiktokAudioDuration = probeDuration(tiktokNarration);
if (!Number.isFinite(tiktokAudioDuration) || tiktokAudioDuration <= 0) {
  throw new Error(`TikTok narration has an invalid duration: ${tiktokAudioDuration}`);
}
const tiktokStoryIndex = Math.min(2, Math.max(0, Number(tiktok.story_index) || 0));
const responseDuration = Math.min(3.8, Math.max(2.5, tiktokAudioDuration * 0.24));
// TikTok viewers currently decide within roughly three seconds. Keep Isla as
// the visual anchor, but move to the story imagery after two seconds.
const hookDuration = USE_ISLA_HOOK ? 2.0 : Math.min(3.4, Math.max(2.2, tiktokAudioDuration * 0.2));
// The rendered narration is the timing authority. Keep the visuals slightly
// longer than the audio so codec rounding cannot clip the final spoken word.
const payoffDuration = Math.max(3.5, tiktokAudioDuration + TIKTOK_END_PAD_SECONDS - hookDuration - responseDuration);
const tiktokSegmentDir = path.join(OUT, "video", "tiktok-segments");
await fs.mkdir(tiktokSegmentDir, { recursive: true });
const tiktokLabel = await textFile("tiktok-label.txt", "SAPIVER FORGE • AI CLIENT-WORK CHECK");
const visualPayoff = clean(tiktok.payoff, 700).replace(/[^.!?]*\?\s*$/u, "").trim();
const payoffSentences = visualPayoff.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) || [];
const payoffSplit = Math.max(1, Math.ceil(payoffSentences.length / 2));
const payoffFirst = payoffSentences.slice(0, payoffSplit).join(" ") || clean(tiktok.payoff, 330);
const payoffSecond = payoffSentences.slice(payoffSplit).join(" ") || payoffFirst;
const tiktokPhaseData = [
  { name: "01-hook", duration: hookDuration, text: tiktok.hook, zoomStep: 0.0018 },
  { name: "02-payoff-a", duration: USE_ISLA_HOOK ? (payoffDuration - 1.4) / 2 : payoffDuration, text: payoffFirst, zoomStep: 0.0012 },
  ...(USE_ISLA_HOOK ? [{ name: "02-isla-cutaway", duration: 1.4, text: "AI still needs a clear human check.", zoomStep: 0 }] : []),
  ...(USE_ISLA_HOOK ? [{ name: "02-payoff-b", duration: (payoffDuration - 1.4) / 2, text: payoffSecond, zoomStep: 0.0012 }] : []),
  { name: "03-response", duration: responseDuration, text: tiktok.response_prompt, zoomStep: 0.0021 }
];
const tiktokSegments = [];
for (const phase of tiktokPhaseData) {
  const titleFile = await textFile(`${phase.name}.txt`, wrapText(phase.text, 24));
  const phaseOut = path.join(tiktokSegmentDir, `${phase.name}.mp4`);
  if (USE_ISLA_HOOK && (phase.name === "01-hook" || phase.name === "02-isla-cutaway")) {
    renderIslaHook({
      input: ISLA_HOOK,
      out: phaseOut,
      duration: phase.duration,
      titleFile,
      labelFile: tiktokLabel,
      start: phase.name === "01-hook" ? 0 : 3.5
    });
  } else {
    renderTikTokPhase({
      input: images[tiktokStoryIndex],
      out: phaseOut,
      duration: phase.duration,
      titleFile,
      labelFile: tiktokLabel,
      zoomStep: phase.zoomStep
    });
  }
  tiktokSegments.push(phaseOut);
}
const tiktokConcat = path.join(OUT, "video", "tiktok-concat.txt");
await fs.writeFile(tiktokConcat, tiktokSegments.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n") + "\n", "utf8");
const tiktokSilent = path.join(OUT, "video", "sapiver-forge-tiktok-silent.mp4");
run(["-f", "concat", "-safe", "0", "-i", tiktokConcat, "-c", "copy", tiktokSilent]);
const tiktokVideoOut = path.join(OUT, "video", "UPLOAD-THIS-TO-TIKTOK.mp4");
run([
  "-i", tiktokSilent,
  "-i", tiktokNarration,
  "-c:v", "copy",
  "-c:a", "aac",
  "-b:a", "160k",
  "-af", `apad=pad_dur=${TIKTOK_END_PAD_SECONDS}`,
  "-shortest",
  "-movflags", "+faststart",
  tiktokVideoOut
]);

const postingDeskHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sapiver Forge TikTok Posting Desk — ${htmlEsc(DATE)}</title>
<style>
:root{color-scheme:dark;--navy:#071827;--panel:#10283a;--gold:#e9c46a;--text:#f5f7f8;--muted:#b8c5cf}
*{box-sizing:border-box}body{margin:0;background:var(--navy);color:var(--text);font:16px/1.5 system-ui,sans-serif}
main{max-width:720px;margin:auto;padding:20px}h1{font-size:1.55rem;margin:.2rem 0}p{color:var(--muted)}
.card{background:var(--panel);border:1px solid #29465b;border-radius:16px;padding:16px;margin:16px 0}
video{display:block;width:100%;max-height:70vh;background:#000;border-radius:12px}
textarea{width:100%;min-height:180px;padding:12px;border-radius:10px;border:1px solid #49677a;background:#071827;color:var(--text);font:inherit}
.actions{display:grid;gap:10px;margin-top:12px}.button,button{display:block;width:100%;border:0;border-radius:10px;padding:13px 16px;background:var(--gold);color:#17202a;font-weight:800;text-align:center;text-decoration:none;cursor:pointer}
.secondary{background:#dce7ed}small{color:var(--muted)}
</style>
</head>
<body><main>
<h1>Sapiver Forge TikTok Posting Desk</h1>
<p>${htmlEsc(DATE)} · Approved social package</p>
<section class="card">
<video controls playsinline preload="metadata" src="video/UPLOAD-THIS-TO-TIKTOK.mp4"></video>
<div class="actions"><a class="button" href="video/UPLOAD-THIS-TO-TIKTOK.mp4" download>Download TikTok video</a></div>
</section>
<section class="card">
<h2>Caption</h2>
<textarea id="caption" readonly>${htmlEsc(tiktokCaptionText)}</textarea>
<div class="actions">
<button id="copy-caption" type="button">Copy caption</button>
<a class="button secondary" href="copy/tiktok-caption.txt" download>Download caption</a>
</div>
<p id="copy-status" role="status" aria-live="polite"></p>
</section>
<p><small>${htmlEsc(DISCLOSURE)}</small></p>
</main>
<script>
const button=document.getElementById("copy-caption");
const caption=document.getElementById("caption");
const status=document.getElementById("copy-status");
button.addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(caption.value);status.textContent="Caption copied.";}
  catch{caption.focus();caption.select();status.textContent="Caption selected — choose Copy.";}
});
</script>
</body>
</html>`;
await write("OPEN-TIKTOK-POSTING-DESK.html", postingDeskHtml);

const manifest = {
  type: "sapiver-forge_ai_news_video_v4",
  date: DATE,
  source_repo: "Sapiver Forge",
  article_url: bundle.article?.url || "",
  approved: bundle.approved,
  ai_generated_media: true,
  disclosure: DISCLOSURE,
  direct_links_in_social_copy: false,
  calls_to_action: {
    spoken: bundle.calls_to_action?.spoken || "",
    screen_lines: screenLines,
    caption: captionCta
  },
  pinterest: { image: rel(pinOut), title: pinTitle, caption: pinCaption },
  facebook: { images: fbImages, post_caption: fbCaption, first_comment: fbComment },
  youtube: { video: rel(videoOut), title: ytTitle, caption: ytCaption, script: bundle.youtube?.script || "", narration_seconds: audioDuration, isla_hook: USE_ISLA_HOOK },
  tiktok: {
    video: rel(tiktokVideoOut),
    caption: tiktokCaption,
    script: tiktok.narration_text,
    hook: tiktok.hook,
    story_index: tiktokStoryIndex,
    narration_seconds: tiktokAudioDuration,
    end_pad_seconds: TIKTOK_END_PAD_SECONDS,
    video_seconds: probeDuration(tiktokVideoOut),
    format: tiktok.format,
    isla_hook: USE_ISLA_HOOK,
    isla_hook_mode: USE_ISLA_HOOK ? "opening-and-mid-video-cutaway" : "control"
  }
};
await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
await fs.writeFile(path.join(ROOT, "social", "sapiver-forge", "latest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Built AI-led Sapiver Forge news assets for ${DATE} with public TikTok and YouTube publishing pack`);
