import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || "v24.0";
const STATE_PATH = process.env.FB_POST_STATE_PATH || "facebook-posts.json";
const SUITE_URL = process.env.SUITE_URL || "https://suite.sapiverpress.co.uk";
const ETSY_CATALOG_URL = process.env.ETSY_CATALOG_URL || "https://sapiver-press-etsy-search-catalog.netlify.app/";
const STRICT = isTruthy(process.env.FB_POST_STRICT || "");

const EXPECTED_FILES = [
  "00_start-grid.png",
  "01_panel-01.png",
  "02_panel-02.png",
  "03_panel-03.png",
  "04_panel-04.png",
  "05_panel-05.png",
  "06_panel-06.png",
  "07_finished-grid.png"
];

function isTruthy(value) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function hasEnv(name) {
  return Boolean(process.env[name]?.trim());
}

function logCredentialStatus() {
  const status = {
    FB_PAGE_ID: hasEnv("FB_PAGE_ID"),
    FB_PAGE_TOKEN: hasEnv("FB_PAGE_TOKEN"),
    META_USER_TOKEN: hasEnv("META_USER_TOKEN"),
    FB_GENERIC_ACCESS_TOKEN: hasEnv("FB_GENERIC_ACCESS_TOKEN")
  };
  console.log(`Facebook credential check: ${JSON.stringify(status)}`);
}

function londonDateString() {
  const override = process.env.DATE_OVERRIDE || "";
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
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
    year: "numeric"
  }).format(new Date(`${date}T12:00:00Z`));
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

async function makeFacebookSafeImage(filePath) {
  const originalStat = await fs.stat(filePath);
  const outDir = ".facebook-post-cache";
  await fs.mkdir(outDir, { recursive: true });

  const dirSafe = path.dirname(filePath).replaceAll(/[\\/]/g, "_").replaceAll(/[^A-Za-z0-9_.-]/g, "_");
  const baseName = path.basename(filePath, path.extname(filePath));
  const outPath = path.join(outDir, `${dirSafe}_${baseName}-fb-safe.jpg`);

  try {
    const metadata = await sharp(filePath).metadata();
    await sharp(filePath)
      .rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(outPath);

    const safeStat = await fs.stat(outPath);
    console.log(
      `Prepared Facebook-safe image: ${filePath} (${metadata.width || "?"}x${metadata.height || "?"}, ${originalStat.size} bytes) -> ${outPath} (${safeStat.size} bytes)`
    );
    return outPath;
  } catch (error) {
    console.log(`Could not create Facebook-safe image, using original. Reason: ${error.message}`);
    return filePath;
  }
}

async function getStory(date) {
  const daily = await readJson(`daily/${date}.json`, null);
  if (daily) return daily;
  return readJson("latest.json", null);
}

function buildCaption(story, date) {
  const character = story?.character_name || "today's Sapiver Press character";
  const note = story?.story_note ? `${story.story_note}\n\n` : "";
  const productUrl = story?.product_referenced?.url || SUITE_URL;

  return [
    `Today's Sapiver Press daily puzzle comic — ${character}`,
    `Buy gifts and printables at ${ETSY_CATALOG_URL}`,
    humanDate(date),
    "",
    note.trim(),
    "",
    "Play along:",
    SUITE_URL,
    productUrl && productUrl !== SUITE_URL && productUrl !== ETSY_CATALOG_URL ? `\nFeatured link: ${productUrl}` : ""
  ].filter(Boolean).join("\n");
}

async function derivePageTokenFromUserToken(pageId, userToken, sourceName) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Could not derive Page token from ${sourceName}: ${JSON.stringify(data)}`);
  }
  const page = (data.data || []).find((item) => String(item.id) === String(pageId));
  if (!page?.access_token) {
    throw new Error("FB_PAGE_ID was not found in /me/accounts, or no Page token was returned.");
  }
  return page.access_token;
}

async function getPageToken() {
  const pageId = process.env.FB_PAGE_ID?.trim();
  const pageToken = process.env.FB_PAGE_TOKEN?.trim();
  const userToken = process.env.META_USER_TOKEN?.trim();
  const genericToken = process.env.FB_GENERIC_ACCESS_TOKEN?.trim();

  logCredentialStatus();

  if (!pageId) return { pageId: null, token: null, reason: "FB_PAGE_ID is not set" };

  if (userToken) {
    const token = await derivePageTokenFromUserToken(pageId, userToken, "META_USER_TOKEN");
    return { pageId, token, reason: null };
  }

  if (pageToken) return { pageId, token: pageToken, reason: null };

  if (genericToken) {
    try {
      const token = await derivePageTokenFromUserToken(pageId, genericToken, "FB_GENERIC_ACCESS_TOKEN");
      return { pageId, token, reason: null };
    } catch (error) {
      console.log(`FB_GENERIC_ACCESS_TOKEN did not work as a user token; trying it as a direct Page token. Reason: ${error.message}`);
      return { pageId, token: genericToken, reason: null };
    }
  }

  return { pageId, token: null, reason: "Neither META_USER_TOKEN, FB_PAGE_TOKEN nor FB_GENERIC_ACCESS_TOKEN is set" };
}

async function loadImageSet(date) {
  const archiveDir = path.join("social", date);
  const latestDir = path.join("social", "latest");
  const manifestPath = path.join(archiveDir, "manifest.json");
  const fallbackManifestPath = path.join(latestDir, "manifest.json");

  let manifest = await readJson(manifestPath, null);
  let baseDir = archiveDir;

  if (!manifest) {
    manifest = await readJson(fallbackManifestPath, null);
    baseDir = latestDir;
  }

  const orderedFiles = manifest?.post_order?.length ? manifest.post_order : EXPECTED_FILES;
  const paths = orderedFiles.map((name) => path.join(baseDir, name));
  const missing = [];

  for (const filePath of paths) {
    if (!(await fileExists(filePath))) missing.push(filePath);
  }

  if (missing.length) {
    throw new Error(`Missing expected Facebook image set files: ${missing.join(", ")}`);
  }

  if (paths.length !== 8) {
    throw new Error(`Expected 8 Facebook images, found ${paths.length}`);
  }

  return { manifest: manifest || {}, baseDir, paths, orderedFiles };
}

async function uploadUnpublishedPhoto({ pageId, token, filePath }) {
  const uploadPath = await makeFacebookSafeImage(filePath);
  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/photos`;
  const buffer = await fs.readFile(uploadPath);
  const form = new FormData();
  form.append("access_token", token);
  form.append("published", "false");
  form.append("source", new Blob([buffer], { type: mimeFor(uploadPath) }), path.basename(uploadPath));

  const response = await fetch(endpoint, { method: "POST", body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(`Facebook unpublished photo upload failed: ${response.status} ${JSON.stringify(data)}`);

  const mediaId = data.id || data.post_id;
  if (!mediaId) throw new Error(`Facebook upload did not return a media id: ${JSON.stringify(data)}`);
  return { media_fbid: String(mediaId), response: data, source: filePath, upload_path: uploadPath };
}

async function createMultiImagePost({ pageId, token, caption, uploaded }) {
  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/feed`;
  const body = new URLSearchParams();
  body.set("access_token", token);
  body.set("message", caption);

  uploaded.forEach((item, index) => {
    body.set(`attached_media[${index}]`, JSON.stringify({ media_fbid: item.media_fbid }));
  });

  const response = await fetch(endpoint, { method: "POST", body });
  const data = await response.json();
  if (!response.ok) throw new Error(`Facebook multi-image post failed: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function postImageSet({ pageId, token, imagePaths, caption }) {
  const uploaded = [];
  for (const filePath of imagePaths) {
    console.log(`Uploading Facebook carousel image ${uploaded.length + 1}/8: ${filePath}`);
    uploaded.push(await uploadUnpublishedPhoto({ pageId, token, filePath }));
  }
  const feedResponse = await createMultiImagePost({ pageId, token, caption, uploaded });
  return { feed_response: feedResponse, uploaded };
}

async function skipOrFail(message) {
  if (STRICT) throw new Error(message);
  console.log(`Facebook post skipped: ${message}`);
}

async function main() {
  const date = londonDateString();
  const force = isTruthy(process.env.FORCE_FB_POST || "");
  const state = await readJson(STATE_PATH, { posts: {} });
  const stateKey = `facebook:${date}`;

  if (!force && state.posts?.[stateKey]?.posted_at) {
    console.log(`Facebook post already recorded for ${date}; exiting.`);
    return;
  }

  const story = await getStory(date);
  if (!story) return skipOrFail(`No daily/${date}.json or latest.json found.`);

  const { pageId, token, reason } = await getPageToken();
  if (!pageId || !token) return skipOrFail(reason || "Facebook credentials are incomplete.");

  const { manifest, baseDir, paths, orderedFiles } = await loadImageSet(date);
  const caption = buildCaption(story, date);
  const result = await postImageSet({ pageId, token, imagePaths: paths, caption });

  state.posts = state.posts || {};
  state.posts[stateKey] = {
    date,
    posted_at: new Date().toISOString(),
    image_source: baseDir,
    image_count: paths.length,
    files: orderedFiles,
    manifest_format: manifest.format || "eight_image_daily_set",
    facebook_response: result.feed_response,
    uploaded_media: result.uploaded.map((item) => ({ media_fbid: item.media_fbid, source: item.source }))
  };
  await writeJson(STATE_PATH, state);
  console.log(`Posted Facebook 8-image comic set for ${date}: ${JSON.stringify(result.feed_response)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
