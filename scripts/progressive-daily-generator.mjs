import fs from "fs/promises";
import path from "path";
import { runLocalDailyGeneration } from "./isla-storyline-engine.mjs";

const ROOT = process.cwd();
const SUITE_URL = "https://suite.sapiverpress.co.uk";

const SETTINGS = [
  "gothic window desk with cityscape view",
  "quiet public library reading table",
  "outdoor cafe street table",
  "co-working desk near a tall window",
  "train table by the window",
  "small kitchen table in warm morning light",
  "bookshop cafe corner",
  "rainy window nook with plants",
];

const CAPTION_SETS = [
  ["A clean start.", "First thread.", "Check it twice.", "That opens it.", "Nearly set.", "Leave it tidy."],
  ["Back at it.", "Small moves.", "Hold that thought.", "There it goes.", "Almost clear.", "Close the page."],
  ["Morning again.", "One safe move.", "No shortcut.", "Found the line.", "Nearly home.", "Tomorrow waits."],
  ["New table today.", "Quiet first step.", "Pause there.", "That was it.", "Last few cells.", "Pack it away."],
  ["Fresh grid.", "Start lightly.", "Think slower.", "Clean route.", "Almost done.", "Same ritual."],
];

const FRAGMENT_SETS = [
  ["settled focus, fresh start, face visible", "careful first move, hand near journal", "thoughtful pause, checking the route", "small realisation, calm confidence", "quiet satisfaction, relaxed shoulders", "closing the journal, content finish"],
  ["returning to the desk, calm morning energy", "leaning toward the laptop, gentle concentration", "pen paused above the page, no guessing", "notebook open, subtle breakthrough", "checking final notes, small smile", "packing up slowly, warm light"],
  ["soft focus, ready for a new attempt", "eyes moving between journal and screen", "slight frown, patient double check", "face brightening with a clean deduction", "satisfied but still careful", "looking away from the desk, finished"],
  ["new setting, steady mood, face unobstructed", "first useful clue, quiet confidence", "hands still, thinking before moving", "gentle nod, the pattern opens", "near finish, calm concentration", "end of session, peaceful expression"],
  ["daily ritual, warm light, composed expression", "writing a small note, focused", "breathing space, thoughtful hesitation", "clear route found, restrained smile", "last checks beside the mug", "finished grid mood, ready to leave"],
];

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function todayString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override) return override;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function readJson(relativePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(relativePath, data) {
  const out = path.join(ROOT, relativePath);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function makeHistoryEntry(story) {
  return {
    date: story.date,
    weekday: story.weekday,
    same_day_attempt: story.same_day_attempt || 1,
    setting: story.selected_setting,
    puzzle_phase: story.puzzle_state?.difficulty_phase || null,
    story_note: story.story_note,
    continuation_note: story.continuation_note || "",
    stuck_moment: story.scenes?.[2]?.image_prompt_fragment || "",
    pose_order: story.scenes?.map((s) => s.pose_id) || [],
    captions: story.scenes?.map((s) => s.caption) || [],
  };
}

function applyAttemptProgression(story, attempt) {
  const setIndex = (attempt - 1) % CAPTION_SETS.length;
  const captions = CAPTION_SETS[setIndex];
  const fragments = FRAGMENT_SETS[setIndex];
  const setting = SETTINGS[setIndex % SETTINGS.length];

  story.same_day_attempt = attempt;
  story.selected_setting = setting;
  story.story_note = `${story.character_name || "Isla"} daily run ${attempt}: a different moment in the same day, keeping the Trigoku subplot light.`;
  story.continuation_note = `Progression run ${attempt}; avoid repeating earlier same-day captions, setting, and image fragments.`;
  story.facebook_post_text = `A different little moment with today's Trigoku lock. ${SUITE_URL}`;

  story.scenes = (story.scenes || []).map((scene, index) => ({
    ...scene,
    caption: captions[index] || scene.caption,
    image_prompt_fragment: fragments[index] || scene.image_prompt_fragment,
    setting,
    scene_description: clean(`${scene.scene_description || scene.beat || ""} Run ${attempt} variation: ${fragments[index] || "fresh visual beat"}.`).slice(0, 260),
  }));

  if (story.image_manifest) {
    story.image_manifest.selected_setting = setting;
    story.image_manifest.image_prompts = story.scenes.map((scene) => ({
      scene: scene.id,
      pose_id: scene.pose_id,
      prompt: scene.full_image_prompt || scene.image_prompt_fragment || "",
    }));
  }

  return story;
}

export async function runProgressiveDailyGeneration() {
  const date = todayString();
  const beforeCharacter = await readJson("characters/isla.json", { story_history: [], weeks: [] });
  const beforeHistory = Array.isArray(beforeCharacter.story_history) ? beforeCharacter.story_history : [];
  const priorSameDay = beforeHistory.filter((entry) => entry.date === date);
  const nonTodayHistory = beforeHistory.filter((entry) => entry.date !== date);

  await runLocalDailyGeneration();

  let story = await readJson(`daily/${date}.json`, null);
  if (!story) throw new Error(`Missing daily/${date}.json after generation`);

  const attempt = priorSameDay.length + 1;
  story = applyAttemptProgression(story, attempt);

  const afterCharacter = await readJson("characters/isla.json", beforeCharacter);
  const updatedHistory = [...nonTodayHistory, ...priorSameDay, makeHistoryEntry(story)].slice(-30);
  const updatedCharacter = {
    ...afterCharacter,
    story_history: updatedHistory,
    weeks: updatedHistory,
    same_day_attempts_kept: true,
    last_updated: date,
  };

  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest || {});
  await writeJson("characters/isla.json", updatedCharacter);

  console.log(`Progressive daily story written for ${date}, same-day attempt ${attempt}`);
}
