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

function must(file) {
  if (!fssync.existsSync(file)) throw new Error(`Missing Clearforge bundle file: ${file}`);
}
function run(args) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}
function clean(text, limit = 220) {
  return String(text || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}
async function write(rel, content) {
  const file = path.join(OUT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  return path.relative(ROOT, file).replaceAll("\\", "/");
}
async function textFile(name, content) {
  const file = path.join(OUT, "text", name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, clean(content, 600), "utf8");
  return file;
}
function drawCard({ size, textFilePath, outFile, fontSize = 56 }) {
  const [w, h] = size.split("x").map(Number);
  const boxW = Math.floor(w * 0.84);
  run([
    "-f", "lavfi", "-i", `color=c=#f4efe3:s=${size}:d=1`,
    "-vf", `drawbox=x=${Math.floor(w*0.08)}:y=${Math.floor(h*0.12)}:w=${boxW}:h=${Math.floor(h*0.70)}:color=#ffffff:t=fill,drawtext=fontcolor=#173b35:fontsize=${fontSize}:textfile='${textFilePath.replaceAll("'", "\\'")}':x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=18`,
    "-frames:v", "1", outFile
  ]);
}

must(path.join(SOURCE_ROOT, "manifest.json"));
const bundle = JSON.parse(await fs.readFile(path.join(SOURCE_ROOT, "manifest.json"), "utf8"));
if (bundle.approved?.article !== true) throw new Error("Clearforge article is not approved.");

await fs.mkdir(OUT, { recursive: true });

const pinTitle = await write("copy/pinterest-title.txt", bundle.pinterest?.title || bundle.article?.headline || "Clearforge Daily AI Brief");
const pinCaption = await write("copy/pinterest-caption.txt", bundle.pinterest?.description || bundle.article?.dek || "");
const fbCaption = await write("copy/facebook-post.txt", bundle.facebook?.post || "");
const fbComment = await write("copy/facebook-first-comment.txt", bundle.article?.url ? `Read the full Clearforge brief: ${bundle.article.url}` : "");
const ytTitle = await write("copy/youtube-title.txt", bundle.youtube?.title || bundle.article?.headline || "Clearforge Daily AI Brief");
const ytCaption = await write("copy/youtube-description.txt", bundle.youtube?.description || "");

const quotes = (bundle.quote_card_lines || []).slice(0, 5);
while (quotes.length < 5) quotes.push(bundle.article?.headline || "Clearforge Daily AI Brief");

const fbImages = [];
const videoImages = [];
for (let i = 0; i < 5; i++) {
  const body = i === 0 ? `CLEARFORGE\n\n${bundle.article?.headline || quotes[i]}` : `CLEARFORGE\n\n${quotes[i]}`;
  const tf = await textFile(`card-${i+1}.txt`, body);
  const fbOut = path.join(OUT, "facebook", `card-${i+1}.png`);
  await fs.mkdir(path.dirname(fbOut), { recursive: true });
  drawCard({ size: "1080x1350", textFilePath: tf, outFile: fbOut, fontSize: i === 0 ? 50 : 58 });
  fbImages.push(path.relative(ROOT, fbOut).replaceAll("\\", "/"));

  const vidOut = path.join(OUT, "video", `card-${i+1}.png`);
  await fs.mkdir(path.dirname(vidOut), { recursive: true });
  drawCard({ size: "1080x1920", textFilePath: tf, outFile: vidOut, fontSize: i === 0 ? 52 : 62 });
  videoImages.push(vidOut);
}

const pinText = await textFile("pin.txt", `CLEARFORGE\n\n${bundle.pinterest?.title || bundle.article?.headline || "What matters in AI today"}`);
const pinOut = path.join(OUT, "pinterest", "pin.png");
await fs.mkdir(path.dirname(pinOut), { recursive: true });
drawCard({ size: "1000x1500", textFilePath: pinText, outFile: pinOut, fontSize: 56 });

const concatFile = path.join(OUT, "video", "concat.txt");
await fs.writeFile(concatFile, videoImages.map((file) => `file '${file.replaceAll("'", "'\\''")}'\nduration 6`).join("\n") + `\nfile '${videoImages.at(-1).replaceAll("'", "'\\''")}'\n`, "utf8");
const videoOut = path.join(OUT, "video", "clearforge-short.mp4");
run(["-f", "concat", "-safe", "0", "-i", concatFile, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-movflags", "+faststart", videoOut]);

const manifest = {
  type: "clearforge_social_bundle_v1",
  date: DATE,
  source_repo: "Clearforge",
  article_url: bundle.article?.url || "",
  approved: bundle.approved,
  pinterest: {
    image: path.relative(ROOT, pinOut).replaceAll("\\", "/"),
    title: pinTitle,
    caption: pinCaption
  },
  facebook: {
    images: fbImages,
    post_caption: fbCaption,
    first_comment: fbComment
  },
  youtube: {
    video: path.relative(ROOT, videoOut).replaceAll("\\", "/"),
    title: ytTitle,
    caption: ytCaption
  }
};

await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Built Clearforge social assets for ${DATE}`);
