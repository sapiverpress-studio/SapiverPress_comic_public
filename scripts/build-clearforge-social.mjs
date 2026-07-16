import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
const SOURCE_ROOT = process.env.CLEARFORGE_BUNDLE_ROOT || path.join(ROOT, "vendor", "clearforge", "bridge", "clearforge", DATE);
const OUT = path.join(ROOT, "social", "clearforge", DATE);

function must(file) { if (!fssync.existsSync(file)) throw new Error(`Missing required Clearforge file: ${file}`); }
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
if (bundle.approved?.article !== true) throw new Error("Clearforge article is not approved.");
if (bundle.ai_media?.generated !== true) throw new Error("AI media is missing. Run Clearforge 'Generate Clearforge AI Media' before distribution.");

const defaultCaptionCta = "Read the full Clearforge breakdown through the link in our bio. Prefer to listen? Search ‘Clearforge AI Briefing’ on your podcast provider.";
const captionCta = stripDirectLinks(bundle.calls_to_action?.caption || defaultCaptionCta);
const screenLines = bundle.calls_to_action?.screen_lines || [
  "READ THE FULL BREAKDOWN",
  "Link in bio",
  "LISTEN ON THE GO",
  "Search: Clearforge AI Briefing"
];

const images = (bundle.ai_media.story_images || []).map(src);
const narration = src(bundle.ai_media.narration);
if (images.length < 3) throw new Error("Three AI-generated story images are required.");
images.forEach(must); must(narration);
const stories = (bundle.stories || []).slice(0, 3);
if (stories.length < 3) throw new Error("Three story records are required in the Clearforge bundle.");

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });

const pinTitle = await write("copy/pinterest-title.txt", bundle.pinterest?.title || bundle.article?.headline);
const pinCaption = await write("copy/pinterest-caption.txt", bundle.pinterest?.description || bundle.article?.dek);
const fbBase = stripDirectLinks(bundle.facebook?.post || "");
const fbCaption = await write("copy/facebook-post.txt", `${fbBase}\n\n${captionCta}`);
const fbComment = await write("copy/facebook-first-comment.txt", "Full Clearforge breakdown: use the link in our bio. Listen on the go by searching ‘Clearforge AI Briefing’ in your podcast app.");
const ytTitle = await write("copy/youtube-title.txt", bundle.youtube?.title || bundle.article?.headline);
const ytBase = stripDirectLinks(bundle.youtube?.description || "");
const ytCaption = await write("copy/youtube-description.txt", `${ytBase}\n\n${captionCta}`);

const fbImages = [];
for (let i = 0; i < 3; i++) {
  const title = await textFile(`story-${i+1}-title.txt`, wrapText(stories[i].title, 28));
  const source = await textFile(`story-${i+1}-source.txt`, clean(stories[i].source_name || bundle.sources?.[i]?.source_name || "Source", 80));
  const out = path.join(OUT, "facebook", `story-${i+1}.png`); await fs.mkdir(path.dirname(out), { recursive: true });
  renderStill({ input: images[i], out, size: "1080x1350", titleFile: title, sourceFile: source, fontSize: 50 });
  fbImages.push(rel(out));
}

const pinTitleFile = await textFile("pin-title.txt", wrapText(bundle.pinterest?.title || bundle.article?.headline, 25));
const pinSourceFile = await textFile("pin-source.txt", "TODAY IN AI • CLEARFORGE");
const pinOut = path.join(OUT, "pinterest", "pin.png"); await fs.mkdir(path.dirname(pinOut), { recursive: true });
renderStill({ input: images[0], out: pinOut, size: "1000x1500", titleFile: pinTitleFile, sourceFile: pinSourceFile, fontSize: 52 });

const audioDuration = probeDuration(narration);
const introDuration = 2.6;
const outroDuration = 3.4;
const ctaDuration = 5.2;
const storyDuration = Math.max(4.5, (audioDuration - introDuration - outroDuration - ctaDuration) / 3);
const segmentDir = path.join(OUT, "video", "segments"); await fs.mkdir(segmentDir, { recursive: true });
const segments = [];

const hookFile = await textFile("hook.txt", wrapText("Three AI updates that actually matter today", 24));
const hookSource = await textFile("hook-source.txt", "CLEARFORGE • TODAY IN AI");
const intro = path.join(segmentDir, "00-intro.mp4");
renderMotion({ input: images[0], out: intro, duration: introDuration, titleFile: hookFile, sourceFile: hookSource, index: 0 });
segments.push(intro);

for (let i = 0; i < 3; i++) {
  const title = await textFile(`video-story-${i+1}.txt`, wrapText(stories[i].title, 25));
  const source = await textFile(`video-source-${i+1}.txt`, clean(stories[i].source_name || bundle.sources?.[i]?.source_name || "Source", 80));
  const seg = path.join(segmentDir, `0${i+1}-story.mp4`);
  renderMotion({ input: images[i], out: seg, duration: storyDuration, titleFile: title, sourceFile: source, index: i+1 });
  segments.push(seg);
}

const takeawayFile = await textFile("takeaway.txt", wrapText(bundle.media_metadata?.practical_takeaway || "Focus on what changes your workflow, not what creates the most hype.", 27));
const takeawaySource = await textFile("takeaway-source.txt", "PRACTICAL TAKEAWAY");
const outro = path.join(segmentDir, "04-outro.mp4");
renderMotion({ input: images[2], out: outro, duration: outroDuration, titleFile: takeawayFile, sourceFile: takeawaySource, index: 3 });
segments.push(outro);

const ctaTitle = await textFile("cta-title.txt", screenLines.join("\n"));
const ctaSource = await textFile("cta-source.txt", "CLEARFORGE • HUMAN-LED. AI-EMPOWERED.");
const ctaOut = path.join(segmentDir, "05-cta.mp4");
renderCta({ input: images[0], out: ctaOut, duration: ctaDuration, titleFile: ctaTitle, sourceFile: ctaSource });
segments.push(ctaOut);

const concatFile = path.join(OUT, "video", "concat.txt");
await fs.writeFile(concatFile, segments.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n") + "\n", "utf8");
const silentVideo = path.join(OUT, "video", "clearforge-short-silent.mp4");
run(["-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", silentVideo]);
const videoOut = path.join(OUT, "video", "clearforge-short.mp4");
run(["-i", silentVideo, "-i", narration, "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", videoOut]);

const manifest = {
  type: "clearforge_ai_news_video_v3",
  date: DATE,
  source_repo: "Clearforge",
  article_url: bundle.article?.url || "",
  approved: bundle.approved,
  ai_generated_media: true,
  direct_links_in_social_copy: false,
  calls_to_action: {
    spoken: bundle.calls_to_action?.spoken || "",
    screen_lines: screenLines,
    caption: captionCta
  },
  pinterest: { image: rel(pinOut), title: pinTitle, caption: pinCaption },
  facebook: { images: fbImages, post_caption: fbCaption, first_comment: fbComment },
  youtube: { video: rel(videoOut), title: ytTitle, caption: ytCaption, script: bundle.youtube?.script || "", narration_seconds: audioDuration }
};
await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Built AI-led Clearforge news assets for ${DATE} with link-free blog and podcast CTA`);