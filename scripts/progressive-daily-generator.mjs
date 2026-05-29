import fs from "fs/promises";
import path from "path";
import { runLocalDailyGeneration } from "./isla-storyline-engine.mjs";

const ROOT = process.cwd();
const SUITE_URL = "https://suite.sapiverpress.co.uk";
const LIFE_CANON_PATH = "characters/isla_life_canon.json";

const LIFE_BEATS = [
  {
    setting: "gothic window desk with cityscape view",
    reason: "she wants a quiet start before the day gets noisy",
    learned: "Isla protects small morning rituals when she needs steadiness.",
    thread: "quiet morning rituals help her reset",
    captions: ["A clean start.", "First thread.", "Check it twice.", "That opens it.", "Nearly set.", "Leave it tidy."],
    fragments: ["settled focus, fresh start, face visible", "careful first move, hand near journal", "thoughtful pause, checking the route", "small realisation, calm confidence", "quiet satisfaction, relaxed shoulders", "closing the journal, content finish"],
  },
  {
    setting: "quiet public library reading table",
    reason: "the library gives her a borrowed pocket of quiet",
    learned: "Isla uses libraries as reset spaces, not just work spaces.",
    thread: "library visits become her backup calm place",
    captions: ["Borrowed quiet.", "Start small.", "Hold the line.", "There it is.", "Almost clear.", "Back outside."],
    fragments: ["public library calm, gentle concentration", "eyes moving between journal and screen", "patient pause at a shared table", "subtle breakthrough, restrained smile", "checking final notes beside books", "leaving the library table, peaceful"],
  },
  {
    setting: "outdoor cafe street table",
    reason: "she is trying not to rush straight into the next errand",
    learned: "Isla sometimes uses a cafe table as a buffer between obligations.",
    thread: "she is learning to pause before moving on",
    captions: ["Street noise.", "One safe move.", "Wait there.", "Found it.", "Last sip.", "On again."],
    fragments: ["outdoor cafe table, city movement behind her", "small careful note, relaxed street setting", "brief hesitation, coffee nearby", "tiny realisation in daylight", "near finish, cafe cup beside journal", "standing to leave, calm urban mood"],
  },
  {
    setting: "co-working desk near a tall window",
    reason: "she has work waiting, so the puzzle has to fit into a short gap",
    learned: "Isla often fits her puzzle ritual between work blocks.",
    thread: "work days make the puzzle a boundary marker",
    captions: ["Between tasks.", "Quick start.", "No shortcut.", "Clean route.", "Nearly done.", "Back to work."],
    fragments: ["co-working desk, focused between tasks", "short careful puzzle break", "hands still, thinking before moving", "clear route found, restrained smile", "last checks near laptop", "closing journal before work resumes"],
  },
  {
    setting: "train table by the window",
    reason: "she is travelling and using the journey as thinking time",
    learned: "Isla likes journeys because they give her contained thinking time.",
    thread: "train rides become moving pockets of focus",
    captions: ["Window seat.", "Track it slowly.", "Not yet.", "That fits.", "Almost there.", "Next stop."],
    fragments: ["train table by window, travel light", "steady first move during journey", "thoughtful pause with landscape outside", "small solution moment on train", "checking final notes as carriage moves", "packing away before the stop"],
  },
  {
    setting: "small kitchen table in warm morning light",
    reason: "home is still half-asleep and she has a few minutes to herself",
    learned: "Isla values ordinary domestic quiet as much as beautiful public spaces.",
    thread: "home mornings reveal her private routine",
    captions: ["Kitchen quiet.", "Soft start.", "Think slower.", "There now.", "Last checks.", "Day begins."],
    fragments: ["small kitchen table, warm practical light", "writing a small note, focused", "breathing space, thoughtful hesitation", "gentle nod, pattern opens", "last checks beside mug", "finished before the day begins"],
  },
  {
    setting: "bookshop cafe corner",
    reason: "she has come for one thing but stays for the quiet corner",
    learned: "Bookshops pull Isla into longer pauses than she planned.",
    thread: "she is drawn to places with books and warm corners",
    captions: ["Bookshop corner.", "First mark.", "Pause there.", "That was it.", "Nearly home.", "One more page."],
    fragments: ["bookshop cafe corner, cosy shelves", "first useful clue near stacked books", "quiet frown, patient double check", "face brightening with a clean deduction", "near finish, calm concentration", "lingering near books after finishing"],
  },
  {
    setting: "rainy window nook with plants",
    reason: "rain has slowed everything down and she lets it",
    learned: "Isla does not mind slower days when they give her room to notice things.",
    thread: "rainy days bring out her reflective side",
    captions: ["Rain on glass.", "Small move.", "Let it sit.", "Line found.", "Almost done.", "No rush."],
    fragments: ["rainy window nook, plants and soft light", "small careful move, reflective mood", "pen paused while rain falls", "quiet breakthrough, thoughtful smile", "near finish under grey light", "slow satisfied finish by window"],
  },
];

const VARIANT_RULES = {
  classic: { name: "Classic", line: "Classic today — every row, column, and box needs one of each." },
  normal: { name: "Classic", line: "Classic today — rows, columns, boxes. Keep it clean." },
  diagonal: { name: "Diagonal", line: "Diagonal today — the two main diagonals count too." },
  diag: { name: "Diagonal", line: "Diagonal today — the long diagonals matter." },
  anti_king: { name: "Anti-King", line: "Anti-King today — matching numbers cannot touch diagonally." },
  antiking: { name: "Anti-King", line: "Anti-King today — diagonals cannot share a match." },
  anti_queen: { name: "Anti-Queen", line: "Anti-Queen today — matching numbers cannot share a diagonal." },
  knight: { name: "Anti-Knight", line: "Anti-Knight today — knight moves block matching numbers." },
  anti_knight: { name: "Anti-Knight", line: "Anti-Knight today — watch those chess-knight jumps." },
  killer: { name: "Killer", line: "Killer today — cage totals first, then the grid." },
  hyper: { name: "Hyper", line: "Hyper today — those extra boxes count as regions too." },
  thermo: { name: "Thermo", line: "Thermo today — numbers rise along each thermometer." },
  arrow: { name: "Arrow", line: "Arrow today — circles must equal the arrow path." },
};

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

function stableIndex(seed, length) {
  let hash = 2166136261;
  for (const ch of String(seed || "")) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % Math.max(1, length);
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

function defaultLifeCanon() {
  return {
    character: "Isla",
    purpose: "Track Isla as a daily illustrated diary character; the puzzle is a recurring thread, not her whole life.",
    tone: "quiet, observant, warm, understated, true-to-life",
    known_life_details: [
      "She uses puzzles as a small thinking ritual.",
      "She notices light, quiet tables, old buildings, notebooks, mugs, and small transitions between tasks.",
    ],
    active_threads: ["protecting small quiet routines"],
    location_memory: [],
    variant_memory: [],
    life_memory: [],
    last_updated: null,
  };
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
    life_memory_entry: story.life_memory_entry || null,
    variant_recap: story.variant_recap || null,
    pose_order: story.scenes?.map((s) => s.pose_id) || [],
    captions: story.scenes?.map((s) => s.caption) || [],
  };
}

function detectVariant(puzzleState = {}) {
  const text = clean([
    puzzleState.variant,
    puzzleState.variant_name,
    puzzleState.mode,
    puzzleState.source_name,
    puzzleState.source_id,
    puzzleState.summary,
    puzzleState.page_title,
    puzzleState.difficulty_label,
  ].filter(Boolean).join(" ")).toLowerCase();
  const normalised = text.replace(/[^a-z0-9]+/g, "_");
  for (const [key, value] of Object.entries(VARIANT_RULES)) {
    if (normalised.includes(key)) return value;
  }
  return { name: puzzleState.mode || puzzleState.source_name || "Trigoku", line: "Today has its own little rule-set — check the constraint before rushing." };
}

function chooseLifeBeat({ date, attempt, canon }) {
  const used = new Set((canon.location_memory || []).slice(-4).map((entry) => entry.setting));
  const offset = stableIndex(`${date}-${attempt}-${canon.life_memory?.length || 0}`, LIFE_BEATS.length);
  for (let i = 0; i < LIFE_BEATS.length; i += 1) {
    const beat = LIFE_BEATS[(offset + i) % LIFE_BEATS.length];
    if (!used.has(beat.setting)) return beat;
  }
  return LIFE_BEATS[offset % LIFE_BEATS.length];
}

function variantPanelIndex({ date, attempt, canon }) {
  const previous = new Set((canon.variant_memory || []).slice(-3).map((entry) => Number(entry.panel_index)));
  const candidates = [1, 2, 3, 4];
  const offset = stableIndex(`variant-${date}-${attempt}`, candidates.length);
  for (let i = 0; i < candidates.length; i += 1) {
    const panel = candidates[(offset + i) % candidates.length];
    if (!previous.has(panel)) return panel;
  }
  return candidates[offset];
}

function applyLifeProgression({ story, attempt, canon, lifeBeat }) {
  const variant = detectVariant(story.puzzle_state || {});
  const panelIndex = variantPanelIndex({ date: story.date, attempt, canon });
  const captions = lifeBeat.captions;
  const fragments = lifeBeat.fragments;
  const variantLine = variant.line;

  story.same_day_attempt = attempt;
  story.selected_setting = lifeBeat.setting;
  story.life_canon_used = true;
  story.story_note = `Isla spends this entry at the ${lifeBeat.setting} because ${lifeBeat.reason}. The puzzle stays as a light thread inside the day.`;
  story.continuation_note = `Remember: ${lifeBeat.learned} Continue the thread: ${lifeBeat.thread}.`;
  story.facebook_post_text = `A small ${variant.name} moment in Isla's day. ${SUITE_URL}`;
  story.variant_recap = {
    variant_name: variant.name,
    short_rule: variantLine,
    panel_index: panelIndex + 1,
    line: variantLine,
  };

  story.scenes = (story.scenes || []).map((scene, index) => {
    const isVariantPanel = index === panelIndex;
    const fragment = fragments[index] || scene.image_prompt_fragment || "quiet daily-life puzzle moment";
    const caption = isVariantPanel ? variantLine : (captions[index] || scene.caption);
    const sceneLine = isVariantPanel
      ? `${lifeBeat.reason}. Isla notices the ${variant.name} rule in passing: ${variantLine}`
      : `${lifeBeat.reason}. ${fragment}`;
    return {
      ...scene,
      caption,
      speech_bubble: isVariantPanel ? variantLine : clean(scene.speech_bubble || ""),
      dialogue: isVariantPanel ? variantLine : clean(scene.dialogue || scene.speech_bubble || ""),
      image_prompt_fragment: isVariantPanel ? `${fragment}, noticing today's ${variant.name} rule naturally` : fragment,
      setting: lifeBeat.setting,
      scene_description: clean(sceneLine).slice(0, 260),
      life_beat: lifeBeat.learned,
      variant_recap_here: isVariantPanel,
    };
  });

  story.life_memory_entry = {
    date: story.date,
    attempt,
    location: lifeBeat.setting,
    reason_for_location: lifeBeat.reason,
    life_detail_learned: lifeBeat.learned,
    thread_to_continue: lifeBeat.thread,
    puzzle_variant_mentioned: variant.name,
    variant_panel_index: panelIndex + 1,
  };

  if (story.image_manifest) {
    story.image_manifest.selected_setting = lifeBeat.setting;
    story.image_manifest.life_canon_used = true;
    story.image_manifest.variant_recap = story.variant_recap;
    story.image_manifest.image_prompts = story.scenes.map((scene) => ({
      scene: scene.id,
      pose_id: scene.pose_id,
      prompt: scene.full_image_prompt || scene.image_prompt_fragment || "",
    }));
  }

  return story;
}

function updateLifeCanon({ canon, story }) {
  const entry = story.life_memory_entry;
  if (!entry) return canon;
  const next = {
    ...canon,
    known_life_details: Array.from(new Set([...(canon.known_life_details || []), entry.life_detail_learned])).slice(-50),
    active_threads: Array.from(new Set([...(canon.active_threads || []), entry.thread_to_continue])).slice(-20),
    location_memory: [...(canon.location_memory || []), {
      date: entry.date,
      attempt: entry.attempt,
      setting: entry.location,
      reason: entry.reason_for_location,
    }].slice(-60),
    variant_memory: [...(canon.variant_memory || []), {
      date: entry.date,
      attempt: entry.attempt,
      variant_name: entry.puzzle_variant_mentioned,
      panel_index: entry.variant_panel_index,
    }].slice(-60),
    life_memory: [...(canon.life_memory || []), entry].slice(-60),
    last_updated: story.date,
  };
  return next;
}

export async function runProgressiveDailyGeneration() {
  const date = todayString();
  const beforeCharacter = await readJson("characters/isla.json", { story_history: [], weeks: [] });
  const canon = await readJson(LIFE_CANON_PATH, defaultLifeCanon());
  const beforeHistory = Array.isArray(beforeCharacter.story_history) ? beforeCharacter.story_history : [];
  const priorSameDay = beforeHistory.filter((entry) => entry.date === date);
  const nonTodayHistory = beforeHistory.filter((entry) => entry.date !== date);

  await runLocalDailyGeneration();

  let story = await readJson(`daily/${date}.json`, null);
  if (!story) throw new Error(`Missing daily/${date}.json after generation`);

  const attempt = priorSameDay.length + 1;
  const lifeBeat = chooseLifeBeat({ date, attempt, canon });
  story = applyLifeProgression({ story, attempt, canon, lifeBeat });
  const updatedCanon = updateLifeCanon({ canon, story });

  const afterCharacter = await readJson("characters/isla.json", beforeCharacter);
  const updatedHistory = [...nonTodayHistory, ...priorSameDay, makeHistoryEntry(story)].slice(-30);
  const updatedCharacter = {
    ...afterCharacter,
    story_history: updatedHistory,
    weeks: updatedHistory,
    same_day_attempts_kept: true,
    life_canon_file: LIFE_CANON_PATH,
    last_updated: date,
  };

  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest || {});
  await writeJson("characters/isla.json", updatedCharacter);
  await writeJson(LIFE_CANON_PATH, updatedCanon);

  console.log(`Life-canon daily story written for ${date}, same-day attempt ${attempt}`);
  console.log(`Location: ${story.life_memory_entry.location}`);
  console.log(`Variant recap: ${story.variant_recap.variant_name} on panel ${story.variant_recap.panel_index}`);
}
