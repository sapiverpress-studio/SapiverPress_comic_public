import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const API_KEY = process.env.OPENAI_API_KEY?.trim() || "";
const MODEL = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
const ENABLED = String(process.env.OPENAI_POLISH_IMAGES || "").toLowerCase() === "true";
const CHARACTER = "Isla";

const PANEL_FILES = [
  "01_panel-01.png",
  "02_panel-02.png",
  "03_panel-03.png",
  "04_panel-04.png",
  "05_panel-05.png",
  "06_panel-06.png",
];

const POSTER_QUOTES = [
  "Small steps. Big impact.",
  "Progress over perfection.",
  "One page at a time.",
  "Focus. Solve. Grow.",
  "Lead with intention.",
  "One win at a time.",
  "Puzzle Therapy",
  "Logic & Pattern",
  "Word Wise",
];

const BOOK_TITLES = [
  "Word Wise",
  "Logic & Pattern",
  "Puzzle Therapy",
  "The Focus Habit",
  "Daily Clarity",
  "One Page at a Time",
  "Small Wins Journal",
  "Notes for Better Days",
];

function londonDateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override) return override;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function copyIfExists(src, dst) {
  if (!(await exists(src))) return false;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
  return true;
}

function rotatePack(items, panelNumber, count = 4) {
  const out = [];
  const start = (panelNumber * 3) % items.length;
  for (let i = 0; i < count; i += 1) out.push(items[(start + i) % items.length]);
  return out;
}

function detailPrompt({ story, scene, panelNumber }) {
  const setting = clean(scene?.panel_location || scene?.setting || story?.selected_setting || "daily life scene");
  const action = clean(scene?.panel_action || scene?.scene_description || "specific daily action");
  const pose = clean(scene?.panel_pose_family || "varied pose");
  const screen = clean(scene?.panel_screen_state || "active_puzzle");
  const caption = clean(scene?.storyboard_caption || scene?.caption || scene?.speech_bubble || scene?.dialogue || "");
  const variant = clean(story?.variant_recap?.variant_name || story?.required_puzzle_copy?.variant_name || "today's puzzle");
  const calendar = clean(story?.uk_calendar_date?.name || "");
  const lifeNote = clean(story?.life_memory_entry?.life_detail_learned || story?.story_note || "");
  const posterPack = rotatePack(POSTER_QUOTES, panelNumber, 5).join("; ");
  const bookPack = rotatePack(BOOK_TITLES, panelNumber, 5).join("; ");

  return [
    `Polish this ${CHARACTER} panel by improving only tiny coherent environmental text details and subtle merch/book/poster text.`,
    "Preserve Isla exactly: same face, hair, skin tone, headband, earrings, hoodie, body shape, pose, expression, lighting, style, camera angle, laptop position, and overall painterly editorial feel.",
    "Do not redraw Isla. Do not change her age, features, hairstyle, clothing, hands, body pose, or scene action.",
    "Do not add speech bubbles, page headers, social captions, borders, footers, or large promotional text.",
    "Do not alter the laptop screen area. If the screen state says no_puzzle or closed_device, keep the device blank/closed and do not add any grid.",
    "Only replace garbled background writing on posters, wall signs, notebooks, cards, cushions, book spines, bags, mugs, or merch with short believable readable text.",
    "Restore the high-quality coherent text style: posters, cushions, notebooks, mugs and book spines should have legible phrases where natural, not nonsense scribbles.",
    "Use only a few readable details, not clutter. Leave many surfaces plain.",
    "Subtle Sapiver Press branding is allowed only where natural: tiny SP monogram, Sapiver Press Notes, or small bookplate. No big advert.",
    `Poster/merch quote options: ${posterPack}.`,
    `Book spine/title options: ${bookPack}.`,
    `Panel ${panelNumber} location: ${setting}.`,
    `Panel ${panelNumber} action: ${action}.`,
    `Panel ${panelNumber} pose family: ${pose}.`,
    `Panel ${panelNumber} screen state: ${screen}.`,
    caption ? `Panel caption context: ${caption}.` : "",
    `Puzzle context: ${variant}.`,
    calendar ? `UK calendar context: ${calendar}.` : "",
    lifeNote ? `Isla life context: ${lifeNote}.` : "",
    "Final image should still look like the same original panel, just with coherent background text and subtle branding instead of nonsense marks.",
  ].filter(Boolean).join("\n");
}

async function callOpenAIImageEdit({ imagePath, prompt }) {
  const bytes = await fs.readFile(imagePath);
  const blob = new Blob([bytes], { type: "image/png" });
  const form = new FormData();
  form.append("model", MODEL);
  form.append("image", blob, path.basename(imagePath));
  form.append("prompt", prompt);
  form.append("size", "1024x1536");
  form.append("n", "1");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });

  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }

  if (!response.ok) throw new Error(`OpenAI image edit failed ${response.status}: ${text.slice(0, 900)}`);
  const b64 = body?.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, "base64");
  const url = body?.data?.[0]?.url;
  if (url) {
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) throw new Error(`OpenAI image URL download failed ${imageResponse.status}`);
    return Buffer.from(await imageResponse.arrayBuffer());
  }
  throw new Error("OpenAI image edit returned no b64_json or url image data");
}

async function mirrorLatest(dateDir, latestDir, summary) {
  await fs.mkdir(latestDir, { recursive: true });
  for (const name of PANEL_FILES) await copyIfExists(path.join(dateDir, name), path.join(latestDir, name));
  await writeJson(path.join(latestDir, "openai-polish-summary.json"), summary);
}

async function main() {
  const date = londonDateString();
  const dateDir = path.join(ROOT, "art-replacements", date);
  const latestDir = path.join(ROOT, "art-replacements", "latest");
  const backupDir = path.join(dateDir, "openai-originals");
  const summaryPath = path.join(dateDir, "openai-polish-summary.json");
  const story = await readJson(path.join(ROOT, "daily", `${date}.json`), await readJson(path.join(ROOT, "latest.json"), {}));

  const summary = {
    date,
    enabled: ENABLED,
    model: MODEL,
    status: "not_started",
    purpose: "Polish coherent readable poster/book/merch text while preserving Isla, action, pose, scene truth and screen state.",
    poster_quotes: POSTER_QUOTES,
    book_titles: BOOK_TITLES,
    panels: [],
    generated_at: new Date().toISOString(),
  };

  if (!ENABLED) {
    summary.status = "skipped_disabled";
    await writeJson(summaryPath, summary);
    await mirrorLatest(dateDir, latestDir, summary);
    console.log("OpenAI image polish skipped: OPENAI_POLISH_IMAGES is not true");
    return;
  }

  if (!API_KEY) {
    summary.status = "skipped_missing_openai_key";
    await writeJson(summaryPath, summary);
    await mirrorLatest(dateDir, latestDir, summary);
    console.log("OpenAI image polish skipped: OPENAI_API_KEY missing");
    return;
  }

  await fs.mkdir(backupDir, { recursive: true });

  for (let i = 0; i < PANEL_FILES.length; i += 1) {
    const name = PANEL_FILES[i];
    const imagePath = path.join(dateDir, name);
    const backupPath = path.join(backupDir, name);
    const scene = story?.scenes?.[i] || {};
    const row = { panel_number: i + 1, image_name: name, status: "pending", panel_screen_state: scene.panel_screen_state || "" };

    if (!(await exists(imagePath))) {
      row.status = "missing_source";
      summary.panels.push(row);
      continue;
    }

    try {
      await copyIfExists(imagePath, backupPath);
      const prompt = detailPrompt({ story, scene, panelNumber: i + 1 });
      const polished = await callOpenAIImageEdit({ imagePath, prompt });
      if (!polished || polished.length < 1000) throw new Error("OpenAI returned an unexpectedly small image");
      await fs.writeFile(imagePath, polished);
      row.status = "polished";
      row.backup_file = path.relative(ROOT, backupPath).replaceAll(path.sep, "/");
      row.output_file = path.relative(ROOT, imagePath).replaceAll(path.sep, "/");
      row.prompt_summary = "coherent readable prop text only; preserve Isla, action, pose and screen state";
    } catch (error) {
      row.status = "failed_kept_original";
      row.error = error?.message || String(error);
      if (await exists(backupPath)) await fs.copyFile(backupPath, imagePath);
    }
    summary.panels.push(row);
  }

  const polishedCount = summary.panels.filter((panel) => panel.status === "polished").length;
  summary.status = polishedCount > 0 ? "complete" : "no_panels_polished";
  summary.polished_count = polishedCount;
  await writeJson(summaryPath, summary);
  await mirrorLatest(dateDir, latestDir, summary);
  console.log(`OpenAI image polish complete: ${polishedCount}/${PANEL_FILES.length} panels polished`);
}

main().catch(async (error) => {
  const date = (() => { try { return londonDateString(); } catch { return "unknown-date"; } })();
  const dateDir = path.join(ROOT, "art-replacements", date);
  await writeJson(path.join(dateDir, "openai-polish-summary.json"), {
    date,
    enabled: ENABLED,
    model: MODEL,
    status: "failed_safely",
    error: error?.message || String(error),
    generated_at: new Date().toISOString(),
  });
  console.log(`OpenAI image polish failed safely: ${error?.message || error}`);
  process.exit(0);
});
