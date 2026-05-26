import fs from "fs/promises";
import { Octokit } from "@octokit/rest";
import OpenAI from "openai";

const config = JSON.parse(await fs.readFile(new URL("../config/comic-engine.config.json", import.meta.url), "utf8"));
const OWNER = config.owner;
const PUBLIC_REPO = config.publicRepo;
const MODEL = process.env.OPENAI_MODEL || config.model || "gpt-4.1-mini";
const githubToken = process.env.COMIC_GITHUB_TOKEN || process.env.GITHUB_TOKEN;

if (!githubToken) throw new Error("Missing COMIC_GITHUB_TOKEN or GITHUB_TOKEN.");
if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY.");

const octokit = new Octokit({ auth: githubToken });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function londonDateParts() {
  const override = process.env.DATE_OVERRIDE || "";
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timezone || "Europe/London",
    weekday: "long", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(base);
  const get = (type) => parts.find(p => p.type === type)?.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekdayName: get("weekday"), weekdayIndex: base.getUTCDay() };
}

function weekNumber(date = new Date()) {
  const oneJan = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - oneJan) / 86400000) + oneJan.getUTCDay() + 1) / 7);
}

function productReferenceFor(dateString) {
  const keys = Object.keys(config.products);
  const d = new Date(`${dateString}T12:00:00Z`);
  const index = weekNumber(d) % keys.length;
  const key = keys[index];
  const product = config.products[key];
  return { key, name: product.name, url: product.url, natural_reference: product.examples[weekNumber(d) % product.examples.length] };
}

async function readJson(repo, path, fallback) {
  try {
    const response = await octokit.repos.getContent({ owner: OWNER, repo, path });
    return { data: JSON.parse(Buffer.from(response.data.content, "base64").toString("utf8")), sha: response.data.sha };
  } catch {
    return { data: fallback, sha: null };
  }
}

async function writeJson(repo, path, content, message) {
  let sha;
  try {
    const existing = await octokit.repos.getContent({ owner: OWNER, repo, path });
    sha = existing.data.sha;
  } catch {}
  await octokit.repos.createOrUpdateFileContents({
    owner: OWNER, repo, path, message,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
    ...(sha ? { sha } : {})
  });
}

function sceneSkeleton(characterId) {
  if (characterId === "andy_and_kat") {
    return [
      { id: "scene_01", title: "Friday Check-In", beat: "Kat asks whether Andy has done it yet" },
      { id: "scene_02", title: "Still On It", beat: "Andy claims he is technically solving" },
      { id: "scene_03", title: "The Excuse", beat: "Andy gives a reason the score should not count" },
      { id: "scene_04", title: "Receipts", beat: "Kat produces dry evidence" },
      { id: "scene_05", title: "Running Score", beat: "The scoreboard is updated" },
      { id: "scene_06", title: "Same Time Next Friday", beat: "They both pretend they are not invested" }
    ];
  }
  return [
    { id: "scene_01", title: "Back Again", beat: "Return after yesterday, new daily puzzle, same habit" },
    { id: "scene_02", title: "Different Start", beat: "The first move shows today's puzzle is different" },
    { id: "scene_03", title: "The Pushback", beat: "A fair stuck moment, no guessing" },
    { id: "scene_04", title: "The Column", beat: "The logical breakthrough" },
    { id: "scene_05", title: "The Follow-Through", beat: "The grid begins to open" },
    { id: "scene_06", title: "Worth Returning For", beat: "Completion or honest latest progress, return tomorrow" }
  ];
}

function imageRef(characterId, sceneId) {
  const names = { scene_01:"opening_return", scene_02:"first_move", scene_03:"stuck_moment", scene_04:"breakthrough", scene_05:"finish", scene_06:"tomorrow_set" };
  const n = sceneId.replace("scene_", "");
  return `${characterId}_${n}_${names[sceneId] || "panel"}.png`;
}

function imageManifest(character, scenes) {
  return {
    character_id: character.id,
    character_name: character.name,
    render_mode: character.format,
    required_character_files: scenes.map(s => `templates/characters/${character.id}/${s.image_ref}`),
    text_is_overlay: true,
    puzzle_screen_inserted_later: true,
    style_rules: config.styleRules,
    compositor_rules: [
      "Character art first.", "Puzzle screen composited second.", "Minimal story text overlaid last.",
      "No generated puzzle grids.", "No giant title/header/footer.", "No large URL overlay.",
      "No blurry outline panel.", "Logo only on merch.", "URL only on monitor/browser bar."
    ]
  };
}

function fallbackStory({ date, weekdayName, character, history, productReference }) {
  const skeleton = sceneSkeleton(character.id);
  const scenes = skeleton.map(scene => ({
    id: scene.id, title: scene.title, beat: scene.beat,
    dialogue: character.id === "andy_and_kat" ? "That still counts." : "Back again.",
    caption: character.id === "andy_and_kat" ? "The score was never going to be simple." : "A new day meant a new lock.",
    image_ref: imageRef(character.id, scene.id), screen_state: scene.id
  }));
  return { date, weekday: weekdayName, character_id: character.id, character_name: character.name, render_mode: character.format, product_referenced: productReference, story_note: "Fallback story produced because the OpenAI call failed.", scenes, image_manifest: imageManifest(character, scenes), history_used_count: history.weeks?.length || 0 };
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
  const skeleton = sceneSkeleton(character.id);
  const system = [
    "You write Sapiver Press daily comic overlay text.",
    "Return JSON only.",
    "Continue from recent history; do not repeat the same fixed template text.",
    "Keep each dialogue line short for one speech bubble.",
    "Keep each caption short for one bottom strip.",
    "Do not write masthead text, giant poster copy, URLs, or fake puzzle grids.",
    "The real puzzle screen will be composited later."
  ].join("\n");
  const payload = { date, weekday: weekdayName, character, recent_history: history.weeks?.slice(-6) || [], ongoing_threads: history.ongoing_threads || [], product_to_reference_naturally: productReference, required_scene_skeleton: skeleton, style_rules: config.styleRules };
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
    return { id, title: scene.title || fb.title, beat: fb.beat, dialogue: scene.dialogue || "", caption: scene.caption || "", image_ref: imageRef(character.id, id), screen_state: scene.screen_state || id };
  });
  return { date, weekday: weekdayName, character_id: character.id, character_name: character.name, render_mode: character.format, product_referenced: productReference, story_note: generated.story_note, continuation_note: generated.continuation_note, scenes, image_manifest: imageManifest(character, scenes), history_used_count: history.weeks?.length || 0 };
}

async function main() {
  const { date, weekdayName, weekdayIndex } = londonDateParts();
  const character = config.weekdayCharacters[String(weekdayIndex)];
  if (!character) { console.log(`No weekday comic scheduled for ${weekdayName}.`); return; }
  const productReference = productReferenceFor(date);
  console.log(`Generating V3 story for ${date} ${weekdayName}: ${character.name}`);
  console.log(`Model: ${MODEL}`);
  const historyResult = await readJson(PUBLIC_REPO, `characters/${character.id}.json`, { character_id: character.id, name: character.name, weeks: [], ongoing_threads: [], last_updated: null });
  const history = historyResult.data;
  let story;
  try { story = await generateStory({ date, weekdayName, character, history, productReference }); }
  catch (error) { console.error("OpenAI generation failed. Writing fallback story."); console.error(error); story = fallbackStory({ date, weekdayName, character, history, productReference }); }
  const historyEntry = { date, weekday: weekdayName, product_referenced: productReference, story_note: story.story_note, continuation_note: story.continuation_note || "", scenes: story.scenes.map(s => ({ id: s.id, title: s.title, dialogue: s.dialogue, caption: s.caption })) };
  const updatedHistory = { ...history, character_id: character.id, name: character.name, weeks: [...(history.weeks || []), historyEntry], last_updated: date };
  await writeJson(PUBLIC_REPO, `characters/${character.id}.json`, updatedHistory, `Update ${character.id} history - ${date}`);
  await writeJson(PUBLIC_REPO, `daily/${date}.json`, story, `Daily comic story - ${date}`);
  await writeJson(PUBLIC_REPO, `image-manifests/${date}.json`, story.image_manifest, `Image manifest - ${date}`);
  await writeJson(PUBLIC_REPO, "latest.json", story, `Latest daily comic story - ${date}`);
  console.log(`Done. Wrote daily/${date}.json`);
}
main().catch(error => { console.error(error); process.exit(1); });
