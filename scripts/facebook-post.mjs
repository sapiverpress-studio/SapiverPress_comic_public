import fs from "fs/promises";
import path from "path";

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || "v24.0";
const STATE_PATH = process.env.FB_POST_STATE_PATH || "facebook-posts.json";
const SUITE_URL = process.env.SUITE_URL || "https://suite.sapiverpress.co.uk";
const ETSY_CATALOG_URL = process.env.ETSY_CATALOG_URL || "https://sapiver-press-etsy-search-catalog.netlify.app/";
const STRICT = isTruthy(process.env.FB_POST_STRICT || "");

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

function fillTemplate(template, date) {
  const [yyyy, mm, dd] = date.split("-");
  return template
    .replaceAll("{date}", date)
    .replaceAll("{yyyy}", yyyy)
    .replaceAll("{year}", yyyy)
    .replaceAll("{mm}", mm)
    .replaceAll("{month}", mm)
    .replaceAll("{dd}", dd)
    .replaceAll("{day}", dd);
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

async function findLocalImage(date) {
  const explicit = process.env.COMIC_POST_IMAGE_PATH;
  const candidates = [
    explicit ? fillTemplate(explicit, date) : null,
    `social/${date}.png`,
    `social/${date}.jpg`,
    `comics/${date}.png`,
    `comics/${date}.jpg`,
    `daily/${date}.png`,
    `daily/${date}.jpg`,
    `output/${date}.png`,
    `output/${date}.jpg`,
    `dist/${date}.png`,
    `dist/${date}.jpg`,
    "latest.png",
    "latest.jpg"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function urlExists(url) {
  if (isTruthy(process.env.FB_SKIP_IMAGE_CHECK)) return true;

  try {
    let response = await fetch(url, { method: "HEAD" });
    if (response.ok) return true;
    if ([403, 405].includes(response.status)) {
      response = await fetch(url, { method: "GET", headers: { Range: "bytes=0-32" } });
      return response.ok || response.status === 206;
    }
    return false;
  } catch {
    return false;
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

async function postPhotoUrl({ pageId, token, imageUrl, caption }) {
  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/photos`;
  const body = new URLSearchParams({ url: imageUrl, caption, access_token: token });
  const response = await fetch(endpoint, { method: "POST", body });
  const data = await response.json();
  if (!response.ok) throw new Error(`Facebook photo post failed: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function postPhotoFile({ pageId, token, filePath, caption }) {
  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/photos`;
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append("caption", caption);
  form.append("access_token", token);
  form.append("source", new Blob([buffer], { type: mimeFor(filePath) }), path.basename(filePath));

  const response = await fetch(endpoint, { method: "POST", body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(`Facebook photo upload failed: ${response.status} ${JSON.stringify(data)}`);
  return data;
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

  const caption = buildCaption(story, date);
  const imageTemplate = process.env.COMIC_POST_IMAGE_URL_TEMPLATE || process.env.COMIC_POST_IMAGE_URL || "";
  const imageUrl = imageTemplate ? fillTemplate(imageTemplate, date) : "";
  const localImage = await findLocalImage(date);

  let result;
  let imageSource;

  if (localImage) {
    result = await postPhotoFile({ pageId, token, filePath: localImage, caption });
    imageSource = localImage;
  } else if (imageUrl) {
    if (!(await urlExists(imageUrl))) return skipOrFail(`Image URL is not reachable: ${imageUrl}`);
    result = await postPhotoUrl({ pageId, token, imageUrl, caption });
    imageSource = imageUrl;
  } else {
    return skipOrFail("No comic image found. Set COMIC_POST_IMAGE_URL_TEMPLATE or create social/{date}.png, comics/{date}.png, daily/{date}.png, output/{date}.png, dist/{date}.png, or latest.png.");
  }

  state.posts = state.posts || {};
  state.posts[stateKey] = {
    date,
    posted_at: new Date().toISOString(),
    image_source: imageSource,
    facebook_response: result
  };
  await writeJson(STATE_PATH, state);
  console.log(`Posted Facebook comic for ${date}: ${JSON.stringify(result)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
