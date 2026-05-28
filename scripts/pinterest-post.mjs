import fs from "fs/promises";

const API = "https://api.pinterest.com/v5";
const OWNER = "sapiverpress-studio";
const REPO = "SapiverPress_comic_public";
const BRANCH = "main";
const SUITE_URL = process.env.SUITE_URL || "https://suite.sapiverpress.co.uk";
const STATE_PATH = process.env.PINTEREST_POST_STATE_PATH || "pinterest-posts.json";
const BOARD_NAME = process.env.PINTEREST_BOARD_NAME || "Sapiver Press Daily Puzzles";
const IMAGE_NAME = process.env.PINTEREST_IMAGE_NAME || "00_start-grid.png";
const FORCE = ["1", "true", "yes", "y", "on"].includes(String(process.env.FORCE_PINTEREST_POST || "").toLowerCase());

function londonDateString() {
  const override = process.env.DATE_OVERRIDE || "";
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

function authHeader() {
  const key = process.env.PINTEREST_ACCESS_TOKEN?.trim();
  if (!key) throw new Error("PINTEREST_ACCESS_TOKEN is not set.");
  return ["Bearer", key].join(" ");
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
  if (!response.ok) throw new Error(`Pinterest API failed ${response.status}: ${JSON.stringify(data)}`);
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

async function getOrCreateBoard() {
  const explicitBoardId = process.env.PINTEREST_BOARD_ID?.trim();
  if (explicitBoardId) return { id: explicitBoardId, name: process.env.PINTEREST_BOARD_NAME || "Configured board" };
  const boards = await listBoards();
  const existing = boards.find((board) => String(board.name || "").trim().toLowerCase() === BOARD_NAME.toLowerCase());
  if (existing?.id) return existing;
  console.log(`Pinterest board not found. Creating board: ${BOARD_NAME}`);
  return pinterestFetch("/boards", {
    method: "POST",
    body: JSON.stringify({ name: BOARD_NAME, description: "Daily Sapiver Press puzzle posts and play-along links." }),
  });
}

function rawGithubImageUrl(date) {
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/social/${date}/${encodeURIComponent(IMAGE_NAME)}?v=${encodeURIComponent(date)}`;
}

async function assertImageReachable(url) {
  const response = await fetch(url, { method: "GET", headers: { "user-agent": "SapiverPressPinterestBot/1.0" } });
  if (!response.ok) throw new Error(`Pinterest image URL is not reachable yet: ${response.status} ${url}`);
}

function titleFor(date) {
  return `Trigoku Daily Lock — ${humanDate(date)}`.slice(0, 100);
}

function descriptionFor(story) {
  const note = story?.story_note || "Isla is back with today's Sapiver Press daily puzzle.";
  return `${note} Play along at ${SUITE_URL}`.replace(/\s+/g, " ").slice(0, 490);
}

async function createPin({ boardId, date, imageUrl, story }) {
  return pinterestFetch("/pins", {
    method: "POST",
    body: JSON.stringify({
      board_id: boardId,
      title: titleFor(date),
      description: descriptionFor(story),
      link: SUITE_URL,
      alt_text: `Sapiver Press daily puzzle image for ${humanDate(date)}.`,
      media_source: { source_type: "image_url", url: imageUrl },
    }),
  });
}

async function main() {
  const date = londonDateString();
  const state = await readJson(STATE_PATH, {});
  if (state[date]?.pin_id && !FORCE) {
    console.log(`Pinterest already posted for ${date}: ${state[date].pin_id}`);
    return;
  }
  const story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  const imageUrl = rawGithubImageUrl(date);
  console.log(`Pinterest image: ${imageUrl}`);
  await assertImageReachable(imageUrl);
  const board = await getOrCreateBoard();
  if (!board?.id) throw new Error(`Pinterest board did not return an id: ${JSON.stringify(board)}`);
  console.log(`Pinterest board: ${board.name || BOARD_NAME} (${board.id})`);
  const pin = await createPin({ boardId: board.id, date, imageUrl, story });
  const pinId = pin.id || pin.pin_id;
  if (!pinId) throw new Error(`Pinterest pin response did not return an id: ${JSON.stringify(pin)}`);
  state[date] = { pin_id: pinId, board_id: board.id, board_name: board.name || BOARD_NAME, image_name: IMAGE_NAME, image_url: imageUrl, link: SUITE_URL, posted_at: new Date().toISOString() };
  await writeJson(STATE_PATH, state);
  console.log(`Pinterest pin posted: ${pinId}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
