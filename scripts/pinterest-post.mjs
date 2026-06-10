import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const API_ROOT = "https://api.pinterest.com/v5";
const STATE_PATH = "pinterest-posts.json";
const DEFAULT_LINK = "https://sapiverpress.etsy.com";
const DEFAULT_BOARD_NAME = "Sapiver Press Comic";

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function enabled(v) { return ["1", "true", "yes", "y", "on"].includes(String(v || "").trim().toLowerCase()); }
async function readJson(rel, fallback = null) { try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fallback; } }
async function writeJson(rel, data) { const file = path.join(ROOT, rel); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
async function readBase64(rel) { return fs.readFile(path.join(ROOT, rel), "base64"); }

function authHeader() {
  const token = process.env.PINTEREST_ACCESS_TOKEN || "";
  if (!token) throw new Error("Pinterest post skipped: missing PINTEREST_ACCESS_TOKEN.");
  return `Bearer ${token}`;
}
async function pinterestFetch(route, options = {}) {
  const res = await fetch(`${API_ROOT}${route}`, {
    ...options,
    headers: { Authorization: authHeader(), "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const raw = await res.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw: raw.slice(0, 500) }; }
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
  return pinterestFetch("/boards", {
    method: "POST",
    body: JSON.stringify({ name, description: "Daily Sapiver Press Isla advert pins." }),
  });
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

function selectImage(manifest, date) {
  const files = Array.isArray(manifest?.post_order) ? manifest.post_order : Array.isArray(manifest?.files) ? manifest.files : [];
  const dayIndex = new Date(`${date}T12:00:00Z`).getUTCDay();
  const rotation = ["01_panel-01.png", "02_panel-02.png", "03_panel-03.png", "04_panel-04.png", "05_panel-05.png", "06_panel-06.png"];
  const chosen = rotation[dayIndex % rotation.length];
  const name = files.includes(chosen) ? chosen : files.find((f) => /panel.*\.png$/i.test(f)) || files[0];
  if (!name) throw new Error("No image file found in social manifest");
  return `${manifest.archive_dir || `social/${date}`}/${name}`;
}
function titleFor(manifest, date) {
  const captions = Array.isArray(manifest?.captions) ? manifest.captions : [];
  const dayIndex = new Date(`${date}T12:00:00Z`).getUTCDay();
  const line = String(captions[dayIndex % Math.max(1, captions.length)] || manifest?.storyboard_arc_title || "Isla Learns to Publish Puzzle Books").split("\n")[0].trim();
  return (line || "Isla Learns to Publish Puzzle Books").slice(0, 100);
}
function descriptionFor(manifest) {
  const product = manifest?.product_referenced?.name || manifest?.product_name || manifest?.puzzle_product || "Commercial Sudoku Publisher Starter Pack";
  const base = `Isla learns how Sudoku books are built: puzzles, solutions, interiors, covers and a practical one-book-at-a-time workflow. ${product} from Sapiver Press. Start with the files. Build the book from there.`;
  return base.slice(0, 500);
}
function altTextFor(manifest) {
  const title = manifest?.storyboard_arc_title || "Isla Learns to Publish Puzzle Books";
  return `${title}: illustrated story panel showing Isla planning a Sudoku book publishing workflow with document folders, a binder and notebook.`.slice(0, 500);
}

async function main() {
  const date = dateString();
  const shouldPost = enabled(process.env.POST_TO_PINTEREST) || process.env.GITHUB_EVENT_NAME === "schedule";
  if (!shouldPost) {
    console.log("Pinterest post skipped: POST_TO_PINTEREST is not enabled.");
    return;
  }

  const state = await readJson(STATE_PATH, {});
  if (state?.[date]?.posted_at && !enabled(process.env.PINTEREST_FORCE_REPOST)) {
    console.log(`Pinterest post skipped: already posted for ${date}.`);
    return;
  }

  const manifest = await readJson(`social/${date}/manifest.json`, await readJson("social/latest/manifest.json", null));
  if (!manifest) throw new Error(`Missing social manifest for ${date}`);
  if (manifest?.post_ready_contract?.posting_allowed === false && !enabled(process.env.PINTEREST_FORCE_POST)) {
    throw new Error(`Pinterest post blocked by post_ready_contract: ${(manifest.post_ready_contract.posting_block_reasons || []).join(", ")}`);
  }

  const board = await resolveBoard();
  const imageRel = selectImage(manifest, date);
  const payload = {
    board_id: board.id,
    title: titleFor(manifest, date),
    description: descriptionFor(manifest),
    link: process.env.PINTEREST_LINK_URL || manifest?.product_referenced?.url || manifest?.puzzle_url || DEFAULT_LINK,
    alt_text: altTextFor(manifest),
    media_source: { source_type: "image_base64", content_type: "image/png", data: await readBase64(imageRel) },
  };

  const body = await pinterestFetch("/pins", { method: "POST", body: JSON.stringify(payload) });
  state[date] = { posted_at: new Date().toISOString(), pin_id: body.id || body.pin_id || null, image: imageRel, title: payload.title, link: payload.link, board_id: board.id, board_name: board.name || process.env.PINTEREST_BOARD_NAME || DEFAULT_BOARD_NAME };
  await writeJson(STATE_PATH, state);
  console.log(`Pinterest image pin created for ${date}: ${state[date].pin_id || "unknown pin id"}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
