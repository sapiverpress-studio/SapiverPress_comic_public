import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const config = JSON.parse(await fs.readFile(path.join(ROOT, "config", "comic-engine.config.json"), "utf8"));
const MODEL = process.env.OPENAI_MODEL || config.model || "gpt-4.1-mini";
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const ISLA_CHARACTER = {
  id: "isla",
  name: "Isla",
  format: "illustrated_comic_panels",
  summary: "Early 30s, calm structured morning solver, laptop, books/plants/window light, green hoodie, floral headband. Isla is the only active daily comic character."
};

function londonDateParts() {
  const override = process.env.DATE_OVERRIDE || "";
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timezone || "Europe/London",
    weekday: "long", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(base);
  const get = (type) => parts.find(p => p.type === type)?.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekdayName: get("weekday") };
}

function weekNumber(date = new Date()) {
  const oneJan = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - oneJan) / 86400000) + oneJan.getUTCDay() + 1) / 7);
}

function productReferenceFor(dateString) {
  const keys = Object.keys(config.products || { suite: { name: "Sapiver Press Suite", url: "https://suite.sapiverpress.co.uk", examples: ["a return visit tomorrow"] } });
  const d = new Date(`${dateString}T12:00:00Z`);
  const key = keys[weekNumber(d) % keys.length];
  const product = config.products[key];
  return { key, name: product.name, url: product.url, natural_reference: product.examples[weekNumber(d) % product.examples.length] };
}

async function readJson(relativePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(relativePath, content) {
  const out = path.join(ROOT, relativePath);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(content, null, 2)}\n`, "utf8");
}

function sceneSkeleton() {
  return [
    { id: "scene_01", title: "Opening Grid", beat: "Isla opens today's real puzzle and takes in the starting pattern" },
    { id: "scene_02", title: "First Moves", beat: "The first safe entries create a foothold" },
    { id: "scene_03", title: "Stuck Moment", beat: "A fair pause before forcing anything" },
    { id: "scene_04", title: "Breakthrough", beat: "One clean deduction changes the board" },
    { id: "scene_05", title: "Nearly There", beat: "The puzzle is mostly filled and the logic is tightening" },
    { id: "scene_06", title: "Finished", beat: "The completed puzzle screen closes the strip" }
  ];
}

function imageRef(sceneId) {
  const names = { scene_01:"opening_return", scene_02:"first_move", scene_03:"stuck_moment", scene_04:"breakthrough", scene_05:"finish", scene_06:"tomorrow_set" };
  const n = sceneId.replace("scene_", "");
  return `isla_${n}_${names[sceneId] || "panel"}.png`;
}

function imageManifest(character, scenes) {
  return {
    character_id: character.id,
    character_name: character.name,
    render_mode: character.format,
    required_character_files: scenes.map(s => `templates/characters/${character.id}/${s.image_ref}`),
    text_is_overlay: true,
    puzzle_screen_inserted_later: true,
    style_rules: [
      "Isla is the only active daily comic character.",
      "Puzzle screen must come from a real captured puzzle page.",
      ...(config.styleRules || [])
    ],
    compositor_rules: [
      "Character art first.", "Puzzle screen composited second.", "Minimal story text overlaid last.",
      "No generated puzzle grids.", "No giant title/header/footer.", "No large URL overlay.",
      "No blurry outline panel.", "Logo only on merch.", "URL only on monitor/browser bar."
    ]
  };
}

function fallbackStory({ date, weekdayName, character, history, productReference }) {
  const skeleton = sceneSkeleton();
  const captions = [
    "Isla opens today's Trigoku with a clean first look.",
    "The first confirmed moves start to shape the board.",
    "She pauses before guessing would spoil the point.",
    "A hint opens the next route through.",
    "The board is nearly complete.",
    "The finished screen earns tomorrow's return."
  ];
  const dialogue = [
    "Back again.",
    "There’s the first foothold.",
    "No guessing.",
    "That opens it up.",
    "Nearly there.",
    "Done. Tomorrow again."
  ];
  const scenes = skeleton.map((scene, index) => ({
    id: scene.id,
    title: scene.title,
    beat: scene.beat,
    dialogue: dialogue[index],
    caption: captions[index],
    image_ref: imageRef(scene.id),
    screen_state: scene.id
  }));
  return { date, weekday: weekdayName, character_id: character.id, character_name: character.name, render_mode: character.format, product_referenced: productReference, story_note: "Local fallback Isla story.", continuation_note: "Uses real staged Trigoku captures.", scenes, image_manifest: imageManifest(character, scenes), history_used_count: history.weeks?.length || 0 };
}

function schema() {
  return { type: "object", additionalProperties: false, properties: {
    story_note: { type: "string" }, continuation_note: { type: "string" },
    scenes: { type: "array", minItems: 6, maxItems: 6, items: { type: "object", additionalProperties: false, properties: {
      id: { type: "string" }, title: { type: "string" }, dialogue: { type: "string" }, caption: { type: "string" }, screen_state: { type: "string" }
    }, required: ["id", "title", "dialogue", "caption", "screen_state"] } }
  }, required: ["story_note", "continuation_note", "scenes"] };
}

async function generateStory({ date, weekdayName, character, history, productReference }) {
  if (!openai) throw new Error("OPENAI_API_KEY unavailable; using fallback story.");
  const skeleton = sceneSkeleton();
  const system = [
    "You write Sapiver Press daily comic overlay text.",
    "Return JSON only.",
    "Isla is the only active character, every day of the week.",
    "Never mention Phil, Mike, Gemma, Dan, Andy, or Kat.",
    "The screen will show real Trigoku captures at start, progress, nearly complete, and completed stages.",
    "Keep each dialogue line short for one speech bubble.",
    "Keep each caption short for one bottom strip.",
    "Do not write masthead text, giant poster copy, URLs, or fake puzzle grids."
  ].join("\n");
  const payload = { date, weekday: weekdayName, character, recent_history: history.weeks?.slice(-6) || [], ongoing_threads: history.ongoing_threads || [], product_to_reference_naturally: productReference, required_scene_skeleton: skeleton };
  const response = await openai.responses.create({
    model: MODEL,
    input: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(payload, null, 2) }],
    text: { format: { type: "json_schema", name: "daily_comic_story", strict: true, schema: schema() } },
    max_output_tokens: 1800
  });
  const generated = JSON.parse(response.output_text);
  const scenes = generated.scenes.slice(0, 6).map((scene, i) => {
    const fb = skeleton[i];
    const id = scene.id || fb.id;
    return { id, title: scene.title || fb.title, beat: fb.beat, dialogue: scene.dialogue || "", caption: scene.caption || "", image_ref: imageRef(id), screen_state: scene.screen_state || id };
  });
  return { date, weekday: weekdayName, character_id: character.id, character_name: character.name, render_mode: character.format, product_referenced: productReference, story_note: generated.story_note, continuation_note: generated.continuation_note, scenes, image_manifest: imageManifest(character, scenes), history_used_count: history.weeks?.length || 0 };
}

async function main() {
  const { date, weekdayName } = londonDateParts();
  const character = ISLA_CHARACTER;
  const productReference = productReferenceFor(date);
  console.log(`Generating local Isla story for ${date} ${weekdayName}`);
  console.log(`Model: ${MODEL}`);
  const history = await readJson("characters/isla.json", { character_id: "isla", name: "Isla", weeks: [], ongoing_threads: [], last_updated: null });
  let story;
  try { story = await generateStory({ date, weekdayName, character, history, productReference }); }
  catch (error) { console.error("OpenAI generation failed. Writing fallback story."); console.error(error); story = fallbackStory({ date, weekdayName, character, history, productReference }); }
  const historyEntry = { date, weekday: weekdayName, product_referenced: productReference, story_note: story.story_note, continuation_note: story.continuation_note || "", scenes: story.scenes.map(s => ({ id: s.id, title: s.title, dialogue: s.dialogue, caption: s.caption })) };
  const previousWeeks = Array.isArray(history.weeks) ? history.weeks.filter(w => w.date !== date).slice(-20) : [];
  const updatedHistory = { ...history, character_id: "isla", name: "Isla", weeks: [...previousWeeks, historyEntry], last_updated: date };
  await writeJson("characters/isla.json", updatedHistory);
  await writeJson(`daily/${date}.json`, story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  await writeJson("latest.json", story);
  console.log(`Done. Locally wrote daily/${date}.json for Isla`);
}

main().catch(error => { console.error(error); process.exit(1); });
