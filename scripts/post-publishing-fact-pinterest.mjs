import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const API_ROOT = "https://api.pinterest.com/v5";
const STATE_PATH = "publishing-fact-pinterest-posts.json";
const DEFAULT_LINK = "https://sapiverpress.etsy.com";
const DEFAULT_BOARD_NAME = "Sapiver Press Publishing Facts";

function enabled(v) {
  return ["1", "true", "yes", "y", "on"].includes(String(v || "").trim().toLowerCase());
}

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function readJson(rel, fallback = null) {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); }
  catch { return fallback; }
}

async function writeJson(rel, data) {
  const file = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readBase64(rel) {
  return fs.readFile(path.join(ROOT, rel), "base64");
}

function authHeader() {
  const token = process.env.PINTEREST_ACCESS_TOKEN || "";
  if (!token) throw new Error("Pinterest post skipped: missing PINTEREST_ACCESS_TOKEN.");
  return `Bearer ${token}`;
}

async function pinterestFetch(route, options = {}) {
  const res = await fetch(`${API_ROOT}${route}`, {
    ...options,
    headers: { Authorization: authHeader(), "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const raw = await res.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; }
  catch { body = { raw: raw.slice(0, 500) }; }
  if (!res.ok) throw new Error(`Pinterest API failed ${res.status}: ${JSON.stringify(body).slice(0, 1000)}`);
  return body;
}

async function listBoards() {
  const boards = [];
  let bookmark = "";
  for (let i = 0; i < 10; i += 1) {
    const qs = new URLSearchParams({ page_size: "100" });
    if (bookmark) qs.set("bookmark", bookmark);
    const data = await pinterestFetch(`/boards?${qs}`);
    boards.push(...(data.items || []));
    bookmark = data.bookmark || "";
    if (!bookmark) break;
  }
  return boards;
}

async function createBoard(name) {
  return pinterestFetch("/boards", { method: "POST", body: JSON.stringify({ name, description: "Daily publishing facts from Sapiver Press." }) });
}

async function resolveBoard() {
  const explicit = String(process.env.PINTEREST_BOARD_ID || "").trim();
  if (explicit) return { id: explicit, name: process.env.PINTEREST_BOARD_NAME || "Configured board" };
  const boardName = String(process.env.PINTEREST_BOARD_NAME || DEFAULT_BOARD_NAME).trim();
  const boards = await listBoards();
  const existing = boards.find((b) => String(b.name || "").trim().toLowerCase() === boardName.toLowerCase());
  if (existing?.id) return existing;
  console.log(`Pinterest board not found by name: ${boardName}. Creating it.`);
  const created = await createBoard(boardName);
  if (!created?.id) throw new Error(`Pinterest board creation did not return an id: ${JSON.stringify(created).slice(0, 1000)}`);
  return created;
}

async function main() {
  const date = dateString();
  const mode = String(process.env.PUBLISHING_FACT_POST_MODE || "live").trim().toLowerCase();
  if (!enabled(process.env.POST_TO_PINTEREST)) {
    console.log("Pinterest post skipped: POST_TO_PINTEREST is not enabled.");
    return;
  }

  const manifestPath = `social/publishing-facts/${date}/manifest.json`;
  const manifest = await readJson(manifestPath, null);
  if (!manifest) throw new Error(`Missing publishing fact manifest: ${manifestPath}`);

  const state = await readJson(STATE_PATH, {});
  if (state?.[date]?.posted_at && !enabled(process.env.PINTEREST_FORCE_REPOST)) {
    console.log(`Pinterest post skipped: already posted for ${date}.`);
    return;
  }

  const imageName = Array.isArray(manifest.files) ? manifest.files[0] : null;
  if (!imageName) throw new Error("Manifest has no image file.");
  const imageRel = `${manifest.archive_dir}/${imageName}`;
  const board = mode === "live" ? await resolveBoard() : { id: "dry_run", name: "Dry run" };
  const payload = {
    board_id: board.id,
    title: String(manifest.title || "Publishing Fact").slice(0, 100),
    description: String(manifest.caption || manifest.fact || "Daily publishing fact from Sapiver Press.").slice(0, 500),
    link: process.env.PINTEREST_LINK_URL || manifest.link_url || DEFAULT_LINK,
    alt_text: String(manifest.alt_text || manifest.fact || "Sapiver Press publishing fact card.").slice(0, 500),
    media_source: { source_type: "image_base64", content_type: "image/png", data: await readBase64(imageRel) }
  };

  if (mode !== "live") {
    console.log("DRY RUN: Pinterest payload prepared but not posted.");
    console.log(JSON.stringify({ ...payload, media_source: { ...payload.media_source, data: "<base64 omitted>" } }, null, 2));
    return;
  }

  const body = await pinterestFetch("/pins", { method: "POST", body: JSON.stringify(payload) });
  state[date] = {
    posted_at: new Date().toISOString(),
    pin_id: body.id || body.pin_id || null,
    image: imageRel,
    title: payload.title,
    link: payload.link,
    board_id: board.id,
    board_name: board.name || process.env.PINTEREST_BOARD_NAME || DEFAULT_BOARD_NAME,
    campaign_day: manifest.campaign_day || null
  };
  await writeJson(STATE_PATH, state);
  console.log(`Pinterest publishing fact created for ${date}: ${state[date].pin_id || "unknown pin id"}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
