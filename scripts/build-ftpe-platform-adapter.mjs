import fs from "fs/promises";
import fssync from "fs";
import path from "path";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const OUT = path.join(ROOT, "social", "ftpe", DATE);
const LATEST = path.join(ROOT, "social", "ftpe", "latest");
const MANIFEST = path.join(OUT, "manifest.json");
const PLATFORM_OUT = path.join(OUT, "platform_adapted");
const LATEST_PLATFORM_OUT = path.join(LATEST, "platform_adapted");
const CTA = "https://sapiverpress.etsy.com";

const ANGLES = ["list", "story", "negative", "question", "opinion", "searchable", "entertaining"];
const PLATFORM_RULES = {
  facebook: {
    format: "carousel",
    caption_style: "conversational_context_question",
    best_angles: ["story", "question", "opinion", "list"],
    hashtags: ["#SelfPublishing", "#SapiverPress"]
  },
  pinterest: {
    format: "searchable_pin_set",
    caption_style: "keyworded_saveable",
    best_angles: ["searchable", "list", "negative"],
    hashtags: []
  },
  tiktok: {
    format: "manual_slideshow_pack",
    caption_style: "hook_first_comment_prompt",
    best_angles: ["negative", "story", "question", "entertaining"],
    hashtags: ["#SelfPublishing", "#AmazonKDP", "#PuzzleBooks", "#SapiverPress"]
  },
  youtube_shorts: {
    format: "short_video_upload_copy",
    caption_style: "search_title_description",
    best_angles: ["searchable", "list", "negative"],
    hashtags: ["#Shorts", "#SelfPublishing", "#AmazonKDP"]
  }
};

function exists(p) { return fssync.existsSync(p); }
async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }
function cleanText(value, limit = 10000) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}
function absManifest(rel) {
  if (!rel) return rel;
  if (path.isAbsolute(rel)) return rel;
  if (rel.startsWith("social/") || rel.startsWith("assets/")) return path.join(ROOT, rel);
  return path.join(OUT, rel);
}
async function readOptional(rel, fallback = "") {
  if (!rel) return fallback;
  try { return await fs.readFile(absManifest(rel), "utf8"); } catch { return fallback; }
}
function titleCase(value) {
  return cleanText(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}
function cleanImageTitle(file) {
  return titleCase(path.basename(String(file || ""), path.extname(String(file || "")))
    .replace(/^\d+[_-]?/, "")
    .replace(/^FTPE[_-]SET[_-]\d+[_-]\d+[_-]?/i, "")
    .replace(/\bpngs?\b/gi, ""));
}
function pickSubject(manifest) {
  const subjects = Array.isArray(manifest.subjects) ? manifest.subjects.filter(Boolean) : [];
  if (subjects.length) return cleanText(subjects[0], 80);
  const image = manifest.pinterest?.image || manifest.facebook?.images?.[0] || "first KDP sudoku upload";
  return cleanImageTitle(image).toLowerCase() || "first KDP sudoku upload";
}
function stripUrl(text) {
  return cleanText(text).replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
}
function firstSentence(text, fallback) {
  const cleaned = stripUrl(text);
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0];
  return sentence || fallback;
}
function buildCluster(manifest) {
  const subject = pickSubject(manifest);
  const about = manifest.daily_material?.about?.text || "";
  const fact = manifest.daily_material?.fact?.text || "";
  const baseIdea = `A beginner-safe route for ${subject}`;
  return {
    id: `ftpe-${DATE}`,
    product: "First-Time Sudoku Publisher Edition",
    base_idea: baseIdea,
    source_subjects: manifest.subjects || [],
    source_fact: fact || null,
    source_about: about || null,
    angles: {
      list: {
        hook: `5 things to check before ${subject}`,
        title: `5 Checks Before Your First KDP Sudoku Upload`,
        caption: `Use a simple checklist before you upload: files, cover, preview, account setup and licence notes. ${fact ? `Useful context: ${fact}` : ""}`
      },
      story: {
        hook: `Most first uploads feel messy because the route is unclear.`,
        title: `From Messy Upload Folder To Clear First Step`,
        caption: `First-time publishers usually do not need more random files. They need to know what each file is for and what to check next.`
      },
      negative: {
        hook: `Stop uploading before you know what each file is for.`,
        title: `Avoid This Beginner KDP Upload Mistake`,
        caption: `The risky bit is not just buying files. It is reaching the upload stage without knowing what belongs where.`
      },
      question: {
        hook: `Would you know which file goes where?`,
        title: `Could You Explain Your KDP Upload Folder?`,
        caption: `If you opened your download today, could you identify the interior, cover, checklist, guide and licence notes without guessing?`
      },
      opinion: {
        hook: `Beginners do not need a pile of files. They need a route.`,
        title: `A Starter Pack Should Explain The Route`,
        caption: `A useful beginner product should reduce confusion, not just add more assets to organise.`
      },
      searchable: {
        hook: `How to prepare your first KDP sudoku upload`,
        title: `How To Prepare Your First KDP Sudoku Upload`,
        caption: `Start by organising the interior, cover, preview checks, account setup notes and licence guidance before you move into the upload screens.`
      },
      entertaining: {
        hook: `POV: you bought the files but now every folder looks important.`,
        title: `When Your KDP Folder Starts Looking Too Busy`,
        caption: `That moment when the download is there, the files are real, but you still need a simple route through them.`
      }
    }
  };
}
function platformAngle(cluster, platform) {
  const preferred = PLATFORM_RULES[platform].best_angles;
  return preferred.map((key) => [key, cluster.angles[key]]).find(([, value]) => value)?.[0] || "searchable";
}
function buildFacebook(cluster) {
  const angleKey = platformAngle(cluster, "facebook");
  const angle = cluster.angles[angleKey];
  return {
    angle: angleKey,
    post_caption: cleanText(`${angle.caption}\n\nThis is why the Sapiver Press route focuses on organised first steps rather than a loose pile of downloads.\n\nWould a simple upload route help you more than another generic file bundle?\n\n${CTA}\n\n${PLATFORM_RULES.facebook.hashtags.join(" ")}`),
    first_comment: cleanText(`Start here: ${CTA}\n\nDigital download only. No guaranteed KDP approval, sales or income. Not affiliated with Amazon/KDP.`)
  };
}
function buildPinterest(cluster, manifest) {
  const images = [manifest.pinterest?.image, ...(manifest.facebook?.images || [])].filter(Boolean).slice(0, 5);
  const angleKeys = PLATFORM_RULES.pinterest.best_angles;
  const pins = images.map((image, index) => {
    const key = angleKeys[index % angleKeys.length];
    const angle = cluster.angles[key] || cluster.angles.searchable;
    const imageTitle = cleanImageTitle(image);
    return {
      source_image: image,
      angle: key,
      title: cleanText(index === 0 ? angle.title : `${angle.title}: ${imageTitle}`, 100),
      description: cleanText(`${angle.caption} Save this if you are planning a beginner KDP sudoku upload. ${CTA}`, 480)
    };
  });
  return { pins };
}
function buildTikTok(cluster, manifest) {
  const angleKey = platformAngle(cluster, "tiktok");
  const angle = cluster.angles[angleKey];
  const slides = (manifest.facebook?.images || manifest.pinterest_video?.source_images || []).slice(0, 5);
  return {
    angle: angleKey,
    hook: angle.hook,
    script: cleanText(`${angle.hook}\n\n${angle.caption}\n\nThe point is not to post more for the sake of it. The point is to turn one useful idea into platform-ready versions and then track what gets a response.`),
    slide_order: slides,
    caption: cleanText(`${angle.hook}\n\nBeginner publishing works better with a simple route.\n\n${PLATFORM_RULES.tiktok.hashtags.join(" ")}`, 2200),
    pinned_comment: "Want the beginner route? Check Sapiver Press from the profile link."
  };
}
function buildYouTube(cluster) {
  const angleKey = platformAngle(cluster, "youtube_shorts");
  const angle = cluster.angles[angleKey];
  return {
    angle: angleKey,
    title: cleanText(angle.title, 95),
    description: cleanText(`${angle.caption}\n\nSapiver Press: ${CTA}\n\nDigital download only. No guaranteed KDP approval, sales or income. Not affiliated with Amazon/KDP.\n\n${PLATFORM_RULES.youtube_shorts.hashtags.join(" ")}`, 4500),
    tags: ["self publishing", "Amazon KDP", "sudoku books", "puzzle books", "Sapiver Press"]
  };
}
async function writeText(file, content) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, `${cleanText(content)}\n`, "utf8");
}
async function writeJson(file, data) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

if (!exists(MANIFEST)) {
  throw new Error(`Cannot build platform adapter: missing ${MANIFEST}. Run the FTPE daily social builder first.`);
}

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const cluster = buildCluster(manifest);
const facebook = buildFacebook(cluster);
const pinterest = buildPinterest(cluster, manifest);
const tiktok = buildTikTok(cluster, manifest);
const youtube = buildYouTube(cluster);
const adapterManifest = {
  type: "ftpe_platform_adapter_v1",
  date: DATE,
  purpose: "Create platform-native copy packages from the existing daily FTPE social pack without changing the live posting scripts.",
  safety: "Additive only. Existing FTPE posting workflow remains unchanged.",
  cta: manifest.cta || CTA,
  rules: PLATFORM_RULES,
  cluster,
  outputs: {
    facebook: {
      format: PLATFORM_RULES.facebook.format,
      post_caption: "platform_adapted/facebook/post-caption.txt",
      first_comment: "platform_adapted/facebook/first-comment.txt"
    },
    pinterest: {
      format: PLATFORM_RULES.pinterest.format,
      pins: pinterest.pins.map((_, index) => ({
        title: `platform_adapted/pinterest/pin-${String(index + 1).padStart(2, "0")}-title.txt`,
        description: `platform_adapted/pinterest/pin-${String(index + 1).padStart(2, "0")}-description.txt`
      }))
    },
    tiktok: {
      format: PLATFORM_RULES.tiktok.format,
      hook: "platform_adapted/tiktok/hook.txt",
      script: "platform_adapted/tiktok/script.txt",
      caption: "platform_adapted/tiktok/caption.txt",
      pinned_comment: "platform_adapted/tiktok/pinned-comment.txt",
      slide_order: "platform_adapted/tiktok/slide-order.json"
    },
    youtube_shorts: {
      format: PLATFORM_RULES.youtube_shorts.format,
      title: "platform_adapted/youtube_shorts/title.txt",
      description: "platform_adapted/youtube_shorts/description.txt",
      tags: "platform_adapted/youtube_shorts/tags.txt"
    }
  }
};

await fs.rm(PLATFORM_OUT, { recursive: true, force: true });
await ensureDir(PLATFORM_OUT);
await writeJson(path.join(PLATFORM_OUT, "cluster.json"), cluster);
await writeJson(path.join(PLATFORM_OUT, "platform-adapter-manifest.json"), adapterManifest);
await writeText(path.join(PLATFORM_OUT, "facebook", "post-caption.txt"), facebook.post_caption);
await writeText(path.join(PLATFORM_OUT, "facebook", "first-comment.txt"), facebook.first_comment);
for (let index = 0; index < pinterest.pins.length; index += 1) {
  const pin = pinterest.pins[index];
  const n = String(index + 1).padStart(2, "0");
  await writeText(path.join(PLATFORM_OUT, "pinterest", `pin-${n}-title.txt`), pin.title);
  await writeText(path.join(PLATFORM_OUT, "pinterest", `pin-${n}-description.txt`), pin.description);
}
await writeText(path.join(PLATFORM_OUT, "tiktok", "hook.txt"), tiktok.hook);
await writeText(path.join(PLATFORM_OUT, "tiktok", "script.txt"), tiktok.script);
await writeText(path.join(PLATFORM_OUT, "tiktok", "caption.txt"), tiktok.caption);
await writeText(path.join(PLATFORM_OUT, "tiktok", "pinned-comment.txt"), tiktok.pinned_comment);
await writeJson(path.join(PLATFORM_OUT, "tiktok", "slide-order.json"), { images: tiktok.slide_order });
await writeText(path.join(PLATFORM_OUT, "youtube_shorts", "title.txt"), youtube.title);
await writeText(path.join(PLATFORM_OUT, "youtube_shorts", "description.txt"), youtube.description);
await writeText(path.join(PLATFORM_OUT, "youtube_shorts", "tags.txt"), youtube.tags.join(", "));

if (exists(LATEST)) {
  await fs.rm(LATEST_PLATFORM_OUT, { recursive: true, force: true });
  await fs.cp(PLATFORM_OUT, LATEST_PLATFORM_OUT, { recursive: true });
}

console.log(`Built FTPE platform adapter pack for ${DATE}`);
console.log(`Facebook angle: ${facebook.angle}`);
console.log(`TikTok angle: ${tiktok.angle}`);
console.log(`YouTube Shorts angle: ${youtube.angle}`);
console.log(`Pinterest pins: ${pinterest.pins.length}`);
