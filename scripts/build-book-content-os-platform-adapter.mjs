import fs from "fs/promises";
import fssync from "fs";
import path from "path";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const MATERIAL = "book-content-os";
const OUT = path.join(ROOT, "social", MATERIAL, DATE);
const LATEST = path.join(ROOT, "social", MATERIAL, "latest");
const MANIFEST = path.join(OUT, "manifest.json");
const PLATFORM_OUT = path.join(OUT, "platform_adapted");
const LATEST_PLATFORM_OUT = path.join(LATEST, "platform_adapted");
const CTA_TEXT = "link in bio";

const PLATFORM_RULES = {
  facebook: {
    format: "carousel",
    caption_style: "reader_creator_context_question",
    best_angles: ["story", "question", "opinion", "list"],
    hashtags: ["#BookTok", "#BookReviewers", "#SapiverPress"]
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
    hashtags: ["#BookTok", "#ARCReaders", "#BookReviewers", "#BookContent"]
  },
  youtube_shorts: {
    format: "short_video_upload_copy",
    caption_style: "search_title_description",
    best_angles: ["searchable", "list", "negative"],
    hashtags: ["#Shorts", "#BookTok", "#BookReviewers"]
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
    .replace(/^book[_-]?content[_-]?os[_-]?/i, "")
    .replace(/\bpngs?\b/gi, ""));
}
function pickSubject(manifest) {
  const subjects = Array.isArray(manifest.subjects) ? manifest.subjects.filter(Boolean) : [];
  if (subjects.length) return cleanText(subjects[0], 80);
  const image = manifest.pinterest?.image || manifest.facebook?.images?.[0] || "book notes into content ideas";
  return cleanImageTitle(image).toLowerCase() || "book notes into content ideas";
}
function platformAngle(cluster, platform) {
  const preferred = PLATFORM_RULES[platform].best_angles;
  return preferred.map((key) => [key, cluster.angles[key]]).find(([, value]) => value)?.[0] || "searchable";
}
function buildCluster(manifest) {
  const subject = pickSubject(manifest);
  const sourceCaption = manifest.copy?.caption || "Turn review notes, content ideas, links and deadlines into a tidy posting workflow.";
  const sourceTitle = manifest.copy?.title || "Book Content OS";
  return {
    id: `book-content-os-${DATE}`,
    product: manifest.product || "Book Content OS Lite + Pro",
    base_idea: `A tidy book-content workflow for ${subject}`,
    source_subjects: manifest.subjects || [],
    source_title: sourceTitle,
    source_caption: sourceCaption,
    cta_text: manifest.cta_text || CTA_TEXT,
    angles: {
      list: {
        hook: "5 things to track before your next book post",
        title: "5 Things Book Reviewers Should Track",
        caption: "Track the book, review notes, ARC deadline, useful links and possible post ideas before they get scattered."
      },
      story: {
        hook: "I used to keep book notes everywhere.",
        title: "From Scattered Book Notes To A Tidy Content Workflow",
        caption: "Book thoughts are easy to lose when they live in screenshots, notes apps, bookmarks and half-written captions. A simple system keeps them usable."
      },
      negative: {
        hook: "Stop letting good review notes disappear.",
        title: "Stop Losing Useful Book Review Notes",
        caption: "A good reading thought can become a review line, a BookTok idea, a carousel prompt or a bookshelf entry — but only if you capture it before it vanishes."
      },
      question: {
        hook: "Could you find your last useful book note in 10 seconds?",
        title: "Are Your Book Notes Ready To Use?",
        caption: "If your review notes, links, ARC dates and post ideas are spread across different places, posting becomes harder than it needs to be."
      },
      opinion: {
        hook: "Book creators do not need more clutter. They need a workflow.",
        title: "Book Content Works Better With A System",
        caption: "More ideas do not help much if you cannot find them, sort them, turn them into posts, or reuse them later."
      },
      searchable: {
        hook: "How to turn book notes into content ideas",
        title: "How To Turn Book Notes Into Content Ideas",
        caption: "Keep private notes, review wording, links, ARC details and post ideas in one tidy workflow so useful reading thoughts can become usable content."
      },
      entertaining: {
        hook: "POV: you had the perfect review line and now it is gone.",
        title: "When The Perfect Review Line Disappears",
        caption: "That moment when the idea was brilliant in your head, but now all you have is a screenshot, a vague memory and a deadline."
      }
    }
  };
}
function buildFacebook(cluster) {
  const angleKey = platformAngle(cluster, "facebook");
  const angle = cluster.angles[angleKey];
  return {
    angle: angleKey,
    post_caption: cleanText(`${angle.caption}\n\nThat is the gap Book Content OS is built for: turning reading thoughts, review notes and content ideas into something organised enough to reuse.\n\nDo you currently track your book posts and review notes, or do they end up scattered?\n\n${CTA_TEXT}\n\n${PLATFORM_RULES.facebook.hashtags.join(" ")}`),
    first_comment: cleanText(`${CTA_TEXT}\n\nBook Content OS is a local-first tool/workflow for book notes, reviews, ARC tracking and content planning.`)
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
      description: cleanText(`${angle.caption} Save this if you plan book reviews, ARC notes, BookTok ideas or book-content posts. ${CTA_TEXT}`, 480)
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
    script: cleanText(`${angle.hook}\n\n${angle.caption}\n\nThe point is not to make more content from scratch. It is to stop losing useful reading thoughts and turn them into repeatable post ideas.`),
    slide_order: slides,
    caption: cleanText(`${angle.hook}\n\nTurn book notes into usable content instead of letting them scatter.\n\n${PLATFORM_RULES.tiktok.hashtags.join(" ")}`, 2200),
    pinned_comment: "Want the book-content workflow? Check the profile link."
  };
}
function buildYouTube(cluster) {
  const angleKey = platformAngle(cluster, "youtube_shorts");
  const angle = cluster.angles[angleKey];
  return {
    angle: angleKey,
    title: cleanText(angle.title, 95),
    description: cleanText(`${angle.caption}\n\nBook Content OS helps organise book notes, review wording, ARC details and content ideas.\n\n${CTA_TEXT}\n\n${PLATFORM_RULES.youtube_shorts.hashtags.join(" ")}`, 4500),
    tags: ["BookTok", "book reviewers", "ARC readers", "book content", "Sapiver Press"]
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
  throw new Error(`Cannot build Book Content OS platform adapter: missing ${MANIFEST}. Run the Book Content OS social builder first.`);
}

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const cluster = buildCluster(manifest);
const facebook = buildFacebook(cluster);
const pinterest = buildPinterest(cluster, manifest);
const tiktok = buildTikTok(cluster, manifest);
const youtube = buildYouTube(cluster);
const adapterManifest = {
  type: "book_content_os_platform_adapter_v1",
  date: DATE,
  purpose: "Create platform-native copy packages from the existing daily Book Content OS social pack without changing the live posting scripts.",
  safety: "Additive only. Existing Book Content OS posting workflow behaviour remains unchanged.",
  cta_text: manifest.cta_text || CTA_TEXT,
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

console.log(`Built Book Content OS platform adapter pack for ${DATE}`);
console.log(`Facebook angle: ${facebook.angle}`);
console.log(`TikTok angle: ${tiktok.angle}`);
console.log(`YouTube Shorts angle: ${youtube.angle}`);
console.log(`Pinterest pins: ${pinterest.pins.length}`);
