import fs from "fs/promises";

const API = "https://api.pinterest.com/v5";
const OWNER = "sapiverpress-studio";
const REPO = "SapiverPress_comic_public";
const BRANCH = "main";
const SUITE_URL = process.env.SUITE_URL || "https://suite.sapiverpress.co.uk";
const STATE_PATH = process.env.PINTEREST_POST_STATE_PATH || "pinterest-posts.json";
const BOARD_NAME = process.env.PINTEREST_BOARD_NAME || "Sapiver Press Comic";
const FORCE = ["1", "true", "yes", "y", "on"].includes(String(process.env.FORCE_PINTEREST_POST || "").toLowerCase());
const REQUIRED_SCOPES = "boards:read boards:write pins:read pins:write";

const EXPECTED_IMAGES = [
  { number: 1, image_name: "00_start-grid.png", label: "Starter grid", alt: "starter grid" },
  { number: 2, image_name: "01_panel-01.png", label: "Isla panel 1", alt: "Isla comic panel 1", sceneIndex: 0 },
  { number: 3, image_name: "02_panel-02.png", label: "Isla panel 2", alt: "Isla comic panel 2", sceneIndex: 1 },
  { number: 4, image_name: "03_panel-03.png", label: "Isla panel 3", alt: "Isla comic panel 3", sceneIndex: 2 },
  { number: 5, image_name: "04_panel-04.png", label: "Isla panel 4", alt: "Isla comic panel 4", sceneIndex: 3 },
  { number: 6, image_name: "05_panel-05.png", label: "Isla panel 5", alt: "Isla comic panel 5", sceneIndex: 4 },
  { number: 7, image_name: "06_panel-06.png", label: "Isla panel 6", alt: "Isla comic panel 6", sceneIndex: 5 },
  { number: 8, image_name: "07_finished-grid.png", label: "Finished grid", alt: "finished grid" },
];

function londonDateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override && !/^\d{4}-\d{2}-\d{2}$/.test(override)) {
    throw new Error(`DATE_OVERRIDE must be YYYY-MM-DD. Received: ${override}`);
  }
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
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
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
  if (explicitBoardId) {
    return { id: explicitBoardId, name: process.env.PINTEREST_BOARD_NAME || "Configured board" };
  }
  const boards = await listBoards();
  const existing = boards.find((board) => String(board.name || "").trim().toLowerCase() === BOARD_NAME.toLowerCase());
  if (!existing?.id) {
    const available = boards.map((board) => board.name).filter(Boolean).join(", ") || "none visible";
    throw new Error(`Pinterest board not found: ${BOARD_NAME}. Set PINTEREST_BOARD_ID or create/rename the board. Visible boards: ${available}`);
  }
  return existing;
}

function rawGithubImageUrl(date, imageName) {
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/social/${date}/${encodeURIComponent(imageName)}?v=${encodeURIComponent(date)}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function assertImageReachable(url) {
  let lastStatus = "not attempted";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, { method: "GET", headers: { "user-agent": "SapiverPressPinterestBot/1.0" } });
    lastStatus = `${response.status} ${response.statusText}`.trim();
    if (response.ok) return;
    if (attempt < 4) await delay(2500);
  }
  throw new Error(`Pinterest image URL is not reachable yet: ${lastStatus} ${url}`);
}

function pinTitle(date, imageSpec) {
  return `${imageSpec.number}/8 — ${imageSpec.label} — ${date}`.slice(0, 100);
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

function descriptionFor(story, imageSpec) {
  const note = story?.story_note || "Isla is back with today's Sapiver Press daily puzzle.";
  const caption = Number.isInteger(imageSpec.sceneIndex) ? story?.scenes?.[imageSpec.sceneIndex]?.caption : "";
  return compactDescription([note, caption]);
}

function altTextFor(date, imageSpec) {
  return `Part ${imageSpec.number} of 8 in the Sapiver Press daily comic set for ${humanDate(date)}: ${imageSpec.alt}.`.slice(0, 490);
}

async function createPin({ boardId, date, imageSpec, imageUrl, story }) {
  return pinterestFetch("/pins", {
    method: "POST",
    body: JSON.stringify({
      board_id: boardId,
      title: pinTitle(date, imageSpec),
      description: descriptionFor(story, imageSpec),
      link: SUITE_URL,
      alt_text: altTextFor(date, imageSpec),
      media_source: { source_type: "image_url", url: imageUrl },
    }),
  });
}

async function readStory(date) {
  const dailyStory = await readJson(`daily/${date}.json`, null);
  if (dailyStory) return dailyStory;
  return readJson("latest.json", null);
}

function normalizeExistingEntry(date, entry) {
  if (!entry) return { pins: [] };
  if (Array.isArray(entry.pins)) {
    return {
      ...entry,
      pins: entry.pins.filter((pin) => pin?.pin_id && pin?.image_name),
    };
  }
  if (entry.pin_id && entry.image_name) {
    const imageSpec = EXPECTED_IMAGES.find((item) => item.image_name === entry.image_name) || EXPECTED_IMAGES[0];
    return {
      ...entry,
      pin_count: 1,
      pins: [
        {
          pin_id: entry.pin_id,
          image_name: entry.image_name,
          image_url: entry.image_url || rawGithubImageUrl(date, entry.image_name),
          title: pinTitle(date, imageSpec),
          posted_at: entry.posted_at || new Date().toISOString(),
        },
      ],
    };
  }
  return { ...entry, pins: [] };
}

function buildStateEntry({ existingEntry, board, pins }) {
  const now = new Date().toISOString();
  return {
    board_id: board.id,
    board_name: board.name || BOARD_NAME,
    link: SUITE_URL,
    posted_at: now,
    pin_count: pins.length,
    pins,
    ...(existingEntry?.legacy_note ? { legacy_note: existingEntry.legacy_note } : {}),
  };
}

async function main() {
  const date = londonDateString();
  const state = await readJson(STATE_PATH, {});
  const existingEntry = normalizeExistingEntry(date, state[date]);
  const existingByImage = new Map(existingEntry.pins.map((pin) => [pin.image_name, pin]));
  const hasCompleteSet = EXPECTED_IMAGES.every((imageSpec) => existingByImage.has(imageSpec.image_name));

  if (hasCompleteSet && !FORCE) {
    console.log(`Pinterest already has 8 recorded pins for ${date}.`);
    return;
  }

  const story = await readStory(date);
  const images = EXPECTED_IMAGES.map((imageSpec) => ({
    ...imageSpec,
    image_url: rawGithubImageUrl(date, imageSpec.image_name),
  }));

  console.log(`Checking ${images.length} Pinterest image URLs for ${date}.`);
  for (const image of images) {
    await assertImageReachable(image.image_url);
  }

  const board = await getBoard();
  if (!board?.id) throw new Error(`Pinterest board did not return an id: ${JSON.stringify(board)}`);
  console.log(`Pinterest board: ${board.name || BOARD_NAME} (${board.id})`);

  const pins = FORCE ? [] : [...existingEntry.pins];
  const imagesToPost = FORCE ? images : images.filter((image) => !existingByImage.has(image.image_name));

  console.log(`Pinterest pins to post for ${date}: ${imagesToPost.length}/${images.length}`);
  for (const image of imagesToPost) {
    console.log(`Posting Pinterest pin ${image.number}/8: ${image.image_name}`);
    const pin = await createPin({ boardId: board.id, date, imageSpec: image, imageUrl: image.image_url, story });
    const pinId = pin.id || pin.pin_id;
    if (!pinId) throw new Error(`Pinterest pin response did not return an id for ${image.image_name}: ${JSON.stringify(pin)}`);
    pins.push({
      pin_id: pinId,
      image_name: image.image_name,
      image_url: image.image_url,
      title: pinTitle(date, image),
      posted_at: new Date().toISOString(),
    });
  }

  const sortedPins = EXPECTED_IMAGES
    .map((imageSpec) => pins.find((pin) => pin.image_name === imageSpec.image_name))
    .filter(Boolean);

  state[date] = buildStateEntry({ existingEntry, board, pins: sortedPins });
  await writeJson(STATE_PATH, state);
  console.log(`Pinterest state updated for ${date}: ${sortedPins.length}/8 pins recorded.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
