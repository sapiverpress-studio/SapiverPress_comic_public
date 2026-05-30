import fs from "fs/promises";
import path from "path";

const API = "https://api.pinterest.com/v5";
const OWNER = "sapiverpress-studio";
const REPO = "SapiverPress_comic_public";
const BRANCH = "main";
const SUITE_URL = process.env.SUITE_URL || "https://suite.sapiverpress.co.uk";
const STATE_PATH = process.env.PINTEREST_POST_STATE_PATH || "pinterest-posts.json";
const BOARD_NAME = process.env.PINTEREST_BOARD_NAME || "Sapiver Press Comic";
const FORCE = ["1", "true", "yes", "y", "on"].includes(String(process.env.FORCE_PINTEREST_POST || "").toLowerCase());
const REQUIRED_SCOPES = "boards:read boards:write pins:read pins:write";
const COVER_IMAGE_NAME = process.env.PINTEREST_COVER_IMAGE_NAME || "00_start-grid.png";

function londonDateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override && !/^\d{4}-\d{2}-\d{2}$/.test(override)) throw new Error(`DATE_OVERRIDE must be YYYY-MM-DD. Received: ${override}`);
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function humanDate(date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")); } catch { return fallback; }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function fileExists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

function authHeader() {
  const key = process.env.PINTEREST_ACCESS_TOKEN?.trim();
  if (!key) throw new Error("PINTEREST_ACCESS_TOKEN is not set.");
  return ["Bearer", key].join(" ");
}

function pinterestApiError(status, data) {
  const detail = JSON.stringify(data);
  if (status === 401 || status === 403) {
    return new Error(`Pinterest API failed ${status}. Check PINTEREST_ACCESS_TOKEN and required scopes (${REQUIRED_SCOPES}). Response: ${detail}`);
  }
  return new Error(`Pinterest API failed ${status}: ${detail}`);
}

async function pinterestFetch(route, options = {}) {
  const response = await fetch(`${API}${route}`, {
    ...options,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) throw pinterestApiError(response.status, data);
  return data;
}

async function listBoards() {
  const boards = [];
  let bookmark = "";
  for (let i = 0; i < 10; i += 1) {
    const qs = new URLSearchParams({ page_size: "100" });
    if (bookmark) qs.set("bookmark", bookmark);
    const data = await pinterestFetch(`/boards?${qs.toString()}`);
    boards.push(...(data.items || []));
    bookmark = data.bookmark || "";
    if (!bookmark) break;
  }
  return boards;
}

async function getBoard() {
  const explicitBoardId = process.env.PINTEREST_BOARD_ID?.trim();
  if (explicitBoardId) return { id: explicitBoardId, name: process.env.PINTEREST_BOARD_NAME || "Configured board" };
  const boards = await listBoards();
  const existing = boards.find((board) => String(board.name || "").trim().toLowerCase() === BOARD_NAME.toLowerCase());
  if (!existing?.id) {
    const available = boards.map((board) => board.name).filter(Boolean).join(", ") || "none visible";
    throw new Error(`Pinterest board not found: ${BOARD_NAME}. Set PINTEREST_BOARD_ID or create/rename the board. Visible boards: ${available}`);
  }
  return existing;
}

function rawGithubAssetUrl(repoPath, date) {
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${repoPath.split("/").map(encodeURIComponent).join("/")}?v=${encodeURIComponent(date)}`;
}

function videoFileName(date) {
  return `sapiver_isla_daily_${date}.mp4`;
}

function videoPath(date) {
  return `social/${date}/short-video/${videoFileName(date)}`;
}

function coverImagePath(date) {
  return `social/${date}/${COVER_IMAGE_NAME}`;
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function assertReachable(url, label) {
  let lastStatus = "not attempted";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, { method: "GET", headers: { "user-agent": "SapiverPressPinterestBot/1.0" } });
    lastStatus = `${response.status} ${response.statusText}`.trim();
    if (response.ok) return;
    if (attempt < 4) await delay(2500);
  }
  throw new Error(`Pinterest ${label} URL is not reachable yet: ${lastStatus} ${url}`);
}

async function readStory(date) {
  const dailyStory = await readJson(`daily/${date}.json`, null);
  if (dailyStory) return dailyStory;
  return readJson("latest.json", null);
}

function compactDescription(parts) {
  const cta = `Play along at ${SUITE_URL}`;
  const body = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const full = `${body ? `${body} ` : ""}${cta}`.trim();
  if (full.length <= 490) return full;
  const maxBodyLength = Math.max(0, 489 - cta.length);
  const trimmedBody = body.slice(0, maxBodyLength).replace(/\s+\S*$/, "").trim();
  return `${trimmedBody} ${cta}`.trim().slice(0, 490);
}

function videoTitle(date, story) {
  const title = story?.storyboard_arc_title || story?.arc_title || "Isla daily puzzle comic";
  return `${title} — ${date}`.slice(0, 100);
}

function videoDescription(story) {
  const note = story?.story_note || "Isla is back with today's Sapiver Press daily puzzle.";
  const panel = story?.scenes?.[3]?.caption || story?.storyboard_arc?.puzzle_moment || "Watch today's puzzle moment unfold.";
  return compactDescription([note, panel]);
}

function videoAltText(date) {
  return `Short Sapiver Press daily comic video for ${humanDate(date)}, showing Isla solving today's puzzle from starter grid to finished grid.`.slice(0, 490);
}

async function createPinterestMedia() {
  return pinterestFetch("/media", {
    method: "POST",
    body: JSON.stringify({ media_type: "video" }),
  });
}

async function uploadVideoToPinterest(uploadInfo, localVideoPath) {
  const uploadUrl = uploadInfo.upload_url;
  const mediaId = uploadInfo.media_id || uploadInfo.id;
  const params = uploadInfo.upload_parameters || {};
  if (!uploadUrl || !mediaId) throw new Error(`Pinterest media create did not return upload_url/media_id: ${JSON.stringify(uploadInfo)}`);

  const form = new FormData();
  for (const [key, value] of Object.entries(params)) form.append(key, String(value));
  const bytes = await fs.readFile(localVideoPath);
  form.append("file", new Blob([bytes], { type: "video/mp4" }), path.basename(localVideoPath));

  const response = await fetch(uploadUrl, { method: "POST", body: form });
  const text = await response.text();
  if (!response.ok) throw new Error(`Pinterest media upload failed ${response.status}: ${text.slice(0, 800)}`);
  return mediaId;
}

async function waitForMediaReady(mediaId) {
  let last = null;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    last = await pinterestFetch(`/media/${encodeURIComponent(mediaId)}`);
    const status = String(last.status || last.media_status || "").toLowerCase();
    if (["succeeded", "success", "finished", "ready", "available"].includes(status)) return last;
    if (["failed", "failure", "error"].includes(status)) throw new Error(`Pinterest media processing failed: ${JSON.stringify(last)}`);
    await delay(10000);
  }
  throw new Error(`Pinterest media processing did not finish in time. Last response: ${JSON.stringify(last)}`);
}

async function createVideoPin({ boardId, date, mediaId, coverImageUrl, story }) {
  return pinterestFetch("/pins", {
    method: "POST",
    body: JSON.stringify({
      board_id: boardId,
      title: videoTitle(date, story),
      description: videoDescription(story),
      link: SUITE_URL,
      alt_text: videoAltText(date),
      media_source: {
        source_type: "video_id",
        media_id: mediaId,
        cover_image_url: coverImageUrl,
      },
    }),
  });
}

function normalizeExistingEntry(entry) {
  if (!entry) return {};
  return { ...entry };
}

function hasRecordedVideo(entry) {
  return Boolean(entry?.video_pin_id || entry?.pin_id && entry?.media_type === "video");
}

function buildStateEntry({ existingEntry, board, pin, mediaId, date, videoUrl, coverImageUrl }) {
  const now = new Date().toISOString();
  const pinId = pin.id || pin.pin_id;
  return {
    ...existingEntry,
    board_id: board.id,
    board_name: board.name || BOARD_NAME,
    link: SUITE_URL,
    posted_at: now,
    media_type: "video",
    video_pin_id: pinId,
    pin_id: pinId,
    pinterest_media_id: mediaId,
    video_name: videoFileName(date),
    video_url: videoUrl,
    cover_image_name: COVER_IMAGE_NAME,
    cover_image_url: coverImageUrl,
    title: videoTitle(date, null),
  };
}

async function main() {
  const date = londonDateString();
  const state = await readJson(STATE_PATH, {});
  const existingEntry = normalizeExistingEntry(state[date]);

  if (hasRecordedVideo(existingEntry) && !FORCE) {
    console.log(`Pinterest already has a recorded video pin for ${date}: ${existingEntry.video_pin_id || existingEntry.pin_id}`);
    return;
  }

  const story = await readStory(date);
  const localVideoPath = videoPath(date);
  if (!(await fileExists(localVideoPath))) {
    throw new Error(`Pinterest video file is missing: ${localVideoPath}. Ensure short-video-build ran before pinterest-post.`);
  }

  const videoUrl = rawGithubAssetUrl(videoPath(date), date);
  const coverImageUrl = rawGithubAssetUrl(coverImagePath(date), date);
  console.log(`Checking Pinterest video assets for ${date}.`);
  await assertReachable(videoUrl, "video");
  await assertReachable(coverImageUrl, "cover image");

  const board = await getBoard();
  if (!board?.id) throw new Error(`Pinterest board did not return an id: ${JSON.stringify(board)}`);
  console.log(`Pinterest board: ${board.name || BOARD_NAME} (${board.id})`);

  console.log(`Creating Pinterest video media upload for ${videoFileName(date)}.`);
  const uploadInfo = await createPinterestMedia();
  const mediaId = await uploadVideoToPinterest(uploadInfo, localVideoPath);
  console.log(`Pinterest media uploaded: ${mediaId}. Waiting for processing.`);
  await waitForMediaReady(mediaId);

  console.log(`Posting Pinterest video pin for ${date}.`);
  const pin = await createVideoPin({ boardId: board.id, date, mediaId, coverImageUrl, story });
  const pinId = pin.id || pin.pin_id;
  if (!pinId) throw new Error(`Pinterest video pin response did not return an id: ${JSON.stringify(pin)}`);

  state[date] = buildStateEntry({ existingEntry, board, pin, mediaId, date, videoUrl, coverImageUrl });
  await writeJson(STATE_PATH, state);
  console.log(`Pinterest state updated for ${date}: video pin recorded (${pinId}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
