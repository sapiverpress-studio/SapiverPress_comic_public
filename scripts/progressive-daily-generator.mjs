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

function parseDateParts(date) {
  const [year, month, day] = String(date).split("-").map((n) => Number(n));
  return { year, month, day };
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function utcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month, day);
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = utcDate(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return utcDate(year, month, 1 + offset + (nth - 1) * 7);
}

function firstMondayOfMonth(year, month) {
  return nthWeekdayOfMonth(year, month, 1, 1);
}

function lastMondayOfMonth(year, month) {
  const last = utcDate(year, month + 1, 0);
  const offset = (last.getUTCDay() - 1 + 7) % 7;
  return addDays(last, -offset);
}

function significantUkDate(date) {
  const { year } = parseDateParts(date);
  const easter = easterSunday(year);
  const events = [
    { date: `${year}-01-01`, name: "New Year's Day", caption: "Fresh page.", line: "New Year's Day — a clean page suits her.", memory: "New Year makes Isla notice fresh starts without making big declarations.", thread: "fresh starts stay small and practical" },
    { date: `${year}-02-14`, name: "Valentine's Day", caption: "Small kindness.", line: "Valentine's Day — she keeps the kindness small and real.", memory: "Isla notices quiet gestures more than big displays.", thread: "small kindness matters more than spectacle" },
    { date: isoDate(addDays(easter, -47)), name: "Pancake Day", caption: "Before Lent.", line: "Pancake Day — the kitchen feels busier than usual.", memory: "Food-calendar days belong in Isla's domestic background only when they are widely familiar.", thread: "ordinary seasonal rituals can sit behind the puzzle" },
    { date: isoDate(addDays(easter, -21)), name: "Mothering Sunday", caption: "Call later.", line: "Mothering Sunday — she leaves room for a call later.", memory: "Family days make Isla protect a little space around the puzzle.", thread: "family days appear gently, without taking over" },
    { date: isoDate(addDays(easter, -2)), name: "Good Friday", caption: "Slower morning.", line: "Good Friday quiet — the morning is allowed to move slowly.", memory: "Bank-holiday quiet makes Isla slow down rather than rush.", thread: "holiday mornings change the pace of her ritual" },
    { date: isoDate(easter), name: "Easter Sunday", caption: "Easter light.", line: "Easter Sunday — she lets the day start gently.", memory: "Easter makes Isla notice light, quiet, and renewal in a practical way.", thread: "spring holidays soften the tone of the strip" },
    { date: isoDate(addDays(easter, 1)), name: "Easter Monday", caption: "Bank holiday.", line: "Easter Monday — no need to hurry the first move.", memory: "A bank holiday lets Isla stretch the puzzle ritual a little longer.", thread: "free mornings give her more breathing room" },
    { date: isoDate(firstMondayOfMonth(year, 5)), name: "Early May bank holiday", caption: "May morning.", line: "May bank holiday — the day feels borrowed before it starts.", memory: "Bank holidays make Isla feel as if she has borrowed time.", thread: "borrowed time is a recurring comfort" },
    { date: isoDate(lastMondayOfMonth(year, 5)), name: "Spring bank holiday", caption: "Long weekend.", line: "Spring bank holiday — she lets the long weekend stay quiet.", memory: "Long weekends make Isla choose quieter corners.", thread: "long weekends do not have to be loud" },
    { date: isoDate(nthWeekdayOfMonth(year, 6, 0, 3)), name: "Father's Day", caption: "Check in later.", line: "Father's Day — she saves a moment to check in later.", memory: "Family days make Isla notice the small admin of care.", thread: "family check-ins can sit softly inside the diary" },
    { date: isoDate(lastMondayOfMonth(year, 8)), name: "Summer bank holiday", caption: "Late summer.", line: "Summer bank holiday — the quiet table feels like a small luxury.", memory: "Late-summer pauses make Isla more reflective.", thread: "summer endings bring a quieter mood" },
    { date: `${year}-10-31`, name: "Halloween", caption: "Darker windows.", line: "Halloween — the windows feel darker a little earlier.", memory: "Seasonal evenings change the atmosphere around Isla's routine.", thread: "darker evenings shift the mood" },
    { date: `${year}-11-05`, name: "Bonfire Night", caption: "Firework weather.", line: "Bonfire Night — she keeps the puzzle indoors before the noise starts.", memory: "Loud seasonal nights make Isla seek quiet indoor places.", thread: "quiet inside, noise outside" },
    { date: `${year}-11-11`, name: "Remembrance Day", caption: "A quiet minute.", line: "Remembrance Day — she lets the quiet minute stay quiet.", memory: "Remembrance dates make Isla's diary more restrained and respectful.", thread: "some calendar days need restraint" },
    { date: isoDate(nthWeekdayOfMonth(year, 11, 0, 2)), name: "Remembrance Sunday", caption: "Quiet minute.", line: "Remembrance Sunday — she keeps the morning understated.", memory: "Remembrance Sunday brings a more reflective tone.", thread: "some calendar days need restraint" },
    { date: `${year}-12-24`, name: "Christmas Eve", caption: "Before tomorrow.", line: "Christmas Eve — the house is nearly too busy for quiet.", memory: "Christmas Eve makes Isla guard her small quiet spaces.", thread: "festive days put pressure on quiet routines" },
    { date: `${year}-12-25`, name: "Christmas Day", caption: "Christmas quiet.", line: "Christmas Day — even the puzzle has to wait its turn.", memory: "Christmas changes the rhythm of Isla's day without erasing her ritual.", thread: "festive days bend the ritual but do not break it" },
    { date: `${year}-12-26`, name: "Boxing Day", caption: "Boxing Day slow.", line: "Boxing Day — everything moves one step slower.", memory: "Boxing Day makes Isla lean into recovery and quiet.", thread: "post-holiday quiet becomes part of her rhythm" },
    { date: `${year}-12-31`, name: "New Year's Eve", caption: "Last page.", line: "New Year's Eve — she finishes the page before the year turns.", memory: "Year-end makes Isla reflective, but still practical.", thread: "endings are logged quietly, not dramatically" },
  ];
  return events.find((event) => event.date === date) || null;
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
    calendar_memory: [],
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
    uk_calendar_date: story.uk_calendar_date || null,
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

function calendarPanelIndex({ date, attempt, canon, avoidPanel }) {
  const previous = new Set((canon.calendar_memory || []).slice(-3).map((entry) => Number(entry.panel_index)));
  const candidates = [0, 1, 2, 3, 4, 5].filter((panel) => panel !== avoidPanel);
  const offset = stableIndex(`calendar-${date}-${attempt}`, candidates.length);
  for (let i = 0; i < candidates.length; i += 1) {
    const panel = candidates[(offset + i) % candidates.length];
    if (!previous.has(panel)) return panel;
  }
  return candidates[offset] ?? 0;
}

function applyLifeProgression({ story, attempt, canon, lifeBeat }) {
  const variant = detectVariant(story.puzzle_state || {});
  const calendarEvent = significantUkDate(story.date);
  const panelIndex = variantPanelIndex({ date: story.date, attempt, canon });
  const calendarIndex = calendarEvent ? calendarPanelIndex({ date: story.date, attempt, canon, avoidPanel: panelIndex }) : -1;
  const captions = lifeBeat.captions;
  const fragments = lifeBeat.fragments;
  const variantLine = variant.line;

  story.same_day_attempt = attempt;
  story.selected_setting = lifeBeat.setting;
  story.life_canon_used = true;
  story.uk_calendar_date = calendarEvent ? {
    name: calendarEvent.name,
    date: calendarEvent.date,
    line: calendarEvent.line,
    caption: calendarEvent.caption,
    panel_index: calendarIndex + 1,
  } : null;
  story.story_note = `Isla spends this entry at the ${lifeBeat.setting} because ${lifeBeat.reason}. ${calendarEvent ? `${calendarEvent.name} colours the day gently. ` : ""}The puzzle stays as a light thread inside the day.`;
  story.continuation_note = `Remember: ${lifeBeat.learned}${calendarEvent ? ` ${calendarEvent.memory}` : ""} Continue the thread: ${lifeBeat.thread}.`;
  story.facebook_post_text = calendarEvent
    ? `${calendarEvent.name} sits quietly inside Isla's puzzle moment. ${SUITE_URL}`
    : `A small ${variant.name} moment in Isla's day. ${SUITE_URL}`;
  story.variant_recap = {
    variant_name: variant.name,
    short_rule: variantLine,
    panel_index: panelIndex + 1,
    line: variantLine,
  };

  story.scenes = (story.scenes || []).map((scene, index) => {
    const isVariantPanel = index === panelIndex;
    const isCalendarPanel = index === calendarIndex;
    const fragment = fragments[index] || scene.image_prompt_fragment || "quiet daily-life puzzle moment";
    const caption = isVariantPanel ? variantLine : isCalendarPanel ? calendarEvent.caption : (captions[index] || scene.caption);
    const speechLine = isVariantPanel ? variantLine : isCalendarPanel ? calendarEvent.line : clean(scene.speech_bubble || "");
    const sceneLine = isVariantPanel
      ? `${lifeBeat.reason}. Isla notices the ${variant.name} rule in passing: ${variantLine}`
      : isCalendarPanel
        ? `${lifeBeat.reason}. ${calendarEvent.line}`
        : `${lifeBeat.reason}. ${fragment}`;
    return {
      ...scene,
      caption,
      speech_bubble: speechLine,
      dialogue: speechLine || clean(scene.dialogue || scene.speech_bubble || ""),
      image_prompt_fragment: isVariantPanel
        ? `${fragment}, noticing today's ${variant.name} rule naturally`
        : isCalendarPanel
          ? `${fragment}, ${calendarEvent.name} atmosphere, natural diary moment`
          : fragment,
      setting: lifeBeat.setting,
      scene_description: clean(sceneLine).slice(0, 260),
      life_beat: lifeBeat.learned,
      variant_recap_here: isVariantPanel,
      uk_calendar_recap_here: isCalendarPanel,
    };
  });

  story.life_memory_entry = {
    date: story.date,
    attempt,
    location: lifeBeat.setting,
    reason_for_location: lifeBeat.reason,
    life_detail_learned: calendarEvent ? `${lifeBeat.learned} ${calendarEvent.memory}` : lifeBeat.learned,
    thread_to_continue: calendarEvent ? `${lifeBeat.thread}; ${calendarEvent.thread}` : lifeBeat.thread,
    puzzle_variant_mentioned: variant.name,
    variant_panel_index: panelIndex + 1,
    uk_calendar_date: calendarEvent ? calendarEvent.name : null,
    uk_calendar_panel_index: calendarEvent ? calendarIndex + 1 : null,
  };

  if (story.image_manifest) {
    story.image_manifest.selected_setting = lifeBeat.setting;
    story.image_manifest.life_canon_used = true;
    story.image_manifest.variant_recap = story.variant_recap;
    story.image_manifest.uk_calendar_date = story.uk_calendar_date;
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
    calendar_memory: entry.uk_calendar_date ? [...(canon.calendar_memory || []), {
      date: entry.date,
      attempt: entry.attempt,
      name: entry.uk_calendar_date,
      panel_index: entry.uk_calendar_panel_index,
    }].slice(-60) : (canon.calendar_memory || []),
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
  if (story.uk_calendar_date) console.log(`UK calendar date: ${story.uk_calendar_date.name} on panel ${story.uk_calendar_date.panel_index}`);
}
