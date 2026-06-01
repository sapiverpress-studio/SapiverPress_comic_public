import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const SUITE_URL = "https://suite.sapiverpress.co.uk";
export const TRIGOKU_URL = "https://suite.sapiverpress.co.uk/play/trigoku/";

const ALLOWED_POSES = [
  "pose_01_back_again",
  "pose_02_first_moves",
  "pose_03_stuck",
  "pose_04_thinking",
  "pose_05_coffee",
  "pose_06_leaving",
];

const FALLBACK_CAPTIONS = [
  "Back again.",
  "One number at a time.",
  "Not that one.",
  "There it is.",
  "Nearly there.",
  "Tomorrow, then.",
];

const STUCK_FOCI = [
  "a corner that refuses to settle",
  "a row with two tempting options",
  "a diagonal that needs one more check",
  "a centre cluster that looks louder than it is",
  "a near-complete section that still needs proof",
  "a false shortcut she decides not to take",
];

export const ISLA_CHARACTER = {
  id: "isla",
  name: "Isla",
  posts: "daily",
  trigger_word: "ISLA_SP",
  format: "illustrated_comic_panels",
  summary:
    "Isla is the only active Sapiver Press daily comic character. She returns every day for the Trigoku Daily Lock without turning the puzzle into a hard advert.",
  locked_visual_traits: [
    "Young Black woman",
    "Warm medium brown skin",
    "Light freckles on nose and cheeks",
    "Natural coily dark hair in a high voluminous puff bun",
    "Wide floral headband in teal, rust orange, cream, and dusty blue, worn across forehead",
    "Medium gold hoop earrings",
    "Oversized deep teal hoodie",
  ],
  settings: [
    "gothic window desk with cityscape view",
    "quiet public library reading table",
    "outdoor cafe street table",
    "co-working desk near a tall window",
    "train table by the window",
    "small kitchen table in warm morning light",
    "bookshop cafe corner",
    "rainy window nook with plants",
  ],
  brand_props: [
    "SJ ceramic mug on desk",
    "open journal",
    "dark hardcover books",
    "vintage desk lamp amber glow",
    "gothic window cityscape view",
    "ivy bookshelf",
  ],
  caption_bank: FALLBACK_CAPTIONS,
};

export function londonDateParts(config = {}) {
  const override = process.env.DATE_OVERRIDE || "";
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timezone || "Europe/London",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(base);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekdayName: get("weekday") };
}

function stableIndex(seed, length) {
  let hash = 2166136261;
  for (const ch of String(seed || "")) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % Math.max(1, length);
}

function sceneSkeleton() {
  return [
    { id: "scene_01", title: "Back Again", pose_id: "pose_01_back_again", beat: "Isla arrives / opens the grid; calm, returning." },
    { id: "scene_02", title: "First Moves", pose_id: "pose_02_first_moves", beat: "First moves; early engagement." },
    { id: "scene_03", title: "Resistance", pose_id: "pose_03_stuck", beat: "A moment of resistance or hesitation, varied each day." },
    { id: "scene_04", title: "Thinking It Through", pose_id: "pose_04_thinking", beat: "Thinking through it; a shift in approach." },
    { id: "scene_05", title: "Almost There", pose_id: "pose_05_coffee", beat: "Near completion or a short reset moment." },
    { id: "scene_06", title: "Looking Ahead", pose_id: "pose_06_leaving", beat: "Wrapping up and looking ahead." },
  ];
}

function imageRef(sceneId) {
  const names = { scene_01: "opening_return", scene_02: "first_move", scene_03: "stuck_moment", scene_04: "breakthrough", scene_05: "finish", scene_06: "tomorrow_set" };
  const n = sceneId.replace("scene_", "");
  return `isla_${n}_${names[sceneId] || "panel"}.png`;
}

async function readJson(relativePath, fallback) {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), "utf8")); } catch { return fallback; }
}

async function writeJson(relativePath, content) {
  const out = path.join(ROOT, relativePath);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(content, null, 2)}\n`, "utf8");
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function productReference() {
  return { key: "trigoku_daily_lock", name: "Trigoku Daily Lock", url: SUITE_URL, natural_reference: "today's Trigoku lock" };
}

function inferPuzzlePhase(date) {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay();
  if (day === 1 || day === 2) return "early-week";
  if (day === 3 || day === 4) return "mid-week";
  return "late-week";
}

async function fetchWithTimeout(url, ms = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "SapiverPressComicBot/phase2" } });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text: text.slice(0, 5000) };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPuzzleState(date) {
  const fallback = { product_name: "Trigoku Daily Lock", product_url: SUITE_URL, play_url: TRIGOKU_URL, date, difficulty_phase: inferPuzzlePhase(date), fetch_status: "inferred_from_date", summary: "Live Trigoku page data was not available before capture; using date-based early/mid/late week difficulty." };
  const localCandidates = [path.join(ROOT, "captures", date, "extracted", "today_trigoku_data.json"), path.join(ROOT, "captures", date, "extracted", "today_puzzle_data.json"), path.join(ROOT, "today_trigoku_data.json")];
  for (const candidate of localCandidates) {
    try {
      const data = JSON.parse(await fs.readFile(candidate, "utf8"));
      return { ...fallback, ...data, fetch_status: "local_capture_json", mode: data.mode || data.source_name || "Trigoku", source_id: data.source_id || "trigoku", source_name: data.source_name || data.mode || "Trigoku", source_url_used: data.source_url_used || data.fallback_display_url || null, summary: `Local capture data found: ${data.mode || data.source_name || "Trigoku"}.`, variant_recap: data.variant_recap || null };
    } catch {}
  }
  for (const url of [TRIGOKU_URL, "https://sapiverpress-trigoku.netlify.app/"]) {
    try {
      const result = await fetchWithTimeout(url);
      if (!result.ok) continue;
      const title = result.text.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.replace(/\s+/g, " ").trim();
      const difficulty = result.text.match(/difficulty["':\s-]+([A-Za-z0-9 _-]{3,30})/i)?.[1]?.trim();
      return { ...fallback, fetch_status: "live_page_reachable", source_url: url, page_title: title || null, difficulty_label: difficulty || null, summary: `Live Trigoku page reachable${title ? `: ${title}` : ""}.` };
    } catch {}
  }
  return fallback;
}

function pickSetting(date, characterFile) {
  const settings = Array.isArray(characterFile.settings) && characterFile.settings.length ? characterFile.settings : ISLA_CHARACTER.settings;
  return settings[stableIndex(date, settings.length)];
}

function viewRule(index) { return index === 0 || index === 3 ? "front-facing or three-quarter view, Isla's face clearly visible" : "natural varied camera angle, not a repeated pose"; }

function buildFullImagePrompt(fragment, setting, index) {
  const cleanFragment = String(fragment || "settling into today's puzzle with calm focus").replace(/\s+/g, " ").trim();
  return [`ISLA_SP ${cleanFragment}`, "young Black woman warm medium brown skin light freckles on nose and cheeks", "natural coily dark hair high voluminous puff bun", "wide floral teal rust orange headband worn across forehead", "medium gold hoop earrings", "oversized deep teal hoodie", viewRule(index), setting, "warm golden hour light", "SJ ceramic mug on desk", "open journal", "dark hardcover books", "vintage desk lamp amber glow", "gothic window cityscape view", "ivy bookshelf", "warm painterly editorial illustration style", "cinematic warm amber palette", "detailed textures"].join(", ");
}

function extractJson(text) {
  const cleaned = String(text || "").replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error("Claude response did not contain valid JSON.");
}

function storylineSchemaDescription() {
  return { story_note: "short summary of today's arc", continuation_note: "how today differs from the last few days", facebook_post_text: `2 sentences max, Isla's voice, must end with ${SUITE_URL}`, beats: [{ scene_description: "2 sentences max", pose_id: ALLOWED_POSES[0], caption: "short understated caption", speech_bubble: "optional short thought", image_prompt_fragment: "emotion/action only" }] };
}

async function readSupportingTriggerConfig() {
  return readJson("config/supporting_life_triggers.json", { cadence: { default_use_rate_percent: 0 }, policy: {}, triggers: [] });
}

function recentSupportingTypes(history) {
  return history.slice(-6).map((entry) => entry.supporting_life_trigger?.type || entry.life_memory_entry?.supporting_life_trigger?.type).filter(Boolean);
}

function chooseSupportingLifeTrigger({ date, storyHistory, puzzleState, setting, config }) {
  if (process.env.SUPPORTING_LIFE_TRIGGER === "off") return { enabled: false, reason: "disabled" };
  const triggers = Array.isArray(config.triggers) ? config.triggers : [];
  if (!triggers.length) return { enabled: false, reason: "no_triggers_configured" };
  const force = process.env.SUPPORTING_LIFE_TRIGGER === "force";
  const rate = Number(config.cadence?.default_use_rate_percent ?? 60);
  const useToday = force || stableIndex(`${date}-supporting-life`, 100) < Math.max(0, Math.min(100, rate));
  if (!useToday) return { enabled: false, reason: "cadence_skip" };
  const recent = new Set(recentSupportingTypes(storyHistory));
  const seed = `${date}-${puzzleState?.source_id || puzzleState?.mode || "puzzle"}-${setting}`;
  const offset = stableIndex(seed, triggers.length);
  let selected = triggers[offset];
  for (let i = 0; i < triggers.length; i += 1) {
    const candidate = triggers[(offset + i) % triggers.length];
    if (!recent.has(candidate.type)) { selected = candidate; break; }
  }
  return { enabled: true, overlay_style: selected.overlay_style || (selected.type === "calendar_reminder" ? "calendar_notification" : "phone_notification"), ...selected };
}

async function callClaude({ date, weekdayName, characterFile, storyHistory, puzzleState, setting, supportingLifeTrigger }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY unavailable; using fallback story.");
  const recentSeven = storyHistory.slice(-7);
  const recentThree = storyHistory.slice(-3);
  const system = [
    "You write the Sapiver Press daily Isla comic storyline.",
    "Return JSON only. No markdown.",
    "Isla is the only main character and she posts every day.",
    "Supporting people may only appear as messages, notifications, receipts, or timing cues unless explicitly stated otherwise.",
    "If supporting_life_trigger.enabled is true, it must alter the actual story arc and must not be decorative.",
    "Do not create visible extra characters from the supporting trigger.",
    "The notification text itself will be drawn later by the compositor, so do not ask the image model to render readable phone text.",
    "The product is Trigoku Daily Lock at suite.sapiverpress.co.uk.",
    "Do not write promotional ad copy.",
    "Do not invent puzzle grids or puzzle data; the real puzzle screen is composited later.",
    "Avoid repeating the same arc, stuck-moment type, or emotional rhythm from the previous 3 history entries.",
    "Use the required six beats in order, but vary the moment of resistance and daily texture.",
    "The puzzle has a daily variant or source. Use variant_recap.variant_name and variant_recap.line in the puzzle_moment beat when provided.",
    "Captions must be specific to this day's arc. No caption should be interchangeable with a caption from a different strip.",
    "Dialogue must sound like something Isla would say out loud — short, direct, in her own voice.",
    "Banned words and phrases: quiet, understated, gentle, borrowed, anchor, ritual. If you use them, the output will be rejected.",
    "Captions: 10-18 words maximum. One clause. Show the moment, do not summarise it.",
  ].join("\n");
  const payload = { date, weekday: weekdayName, required_output_shape: storylineSchemaDescription(), allowed_pose_ids: ALLOWED_POSES, required_beat_order: sceneSkeleton().map((s) => ({ pose_id: s.pose_id, beat: s.beat })), locked_visual_traits: characterFile.locked_visual_traits || ISLA_CHARACTER.locked_visual_traits, caption_bank: characterFile.caption_bank || FALLBACK_CAPTIONS, selected_setting: setting, puzzle_state: puzzleState, variant_recap: puzzleState?.variant_recap || null, supporting_life_trigger: supportingLifeTrigger, last_7_story_history: recentSeven, last_3_story_history_to_avoid_repeating: recentThree, hard_rules: ["Each scene_description must be 2 sentences max.", "Each caption must be short, specific, real, and not promotional.", "If supporting_life_trigger.enabled is true, at least 3 of the 6 beats must show cause/effect from the trigger.", "At least two panels must imply front-facing or three-quarter face visibility through image_prompt_fragment.", `facebook_post_text must end exactly with ${SUITE_URL}`] };
  const response = await fetch(ANTHROPIC_URL, { method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 2200, temperature: 0.9, system, messages: [{ role: "user", content: JSON.stringify(payload, null, 2) }] }) });
  const data = await response.json();
  if (!response.ok) throw new Error(`Claude storyline failed: ${response.status} ${JSON.stringify(data)}`);
  const text = (data.content || []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
  return extractJson(text);
}

function shortCaption(value, fallback) {
  const text = String(value || fallback || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  if (text.length <= 60) return text;
  return text.slice(0, 57).trimEnd() + "...";
}

function normaliseStory({ generated, date, weekdayName, characterFile, storyHistory, puzzleState, setting, source, supportingLifeTrigger, supportingPolicy }) {
  const skeleton = sceneSkeleton();
  const rawBeats = Array.isArray(generated?.beats) ? generated.beats : Array.isArray(generated?.scenes) ? generated.scenes : [];
  const captions = characterFile.caption_bank || FALLBACK_CAPTIONS;
  const scenes = skeleton.map((skel, index) => {
    const raw = rawBeats[index] || {};
    const pose = ALLOWED_POSES.includes(raw.pose_id) ? raw.pose_id : skel.pose_id;
    const triggerHere = Boolean(supportingLifeTrigger?.enabled && Number(supportingLifeTrigger.panel) === index + 1);
    const fragment = `${raw.image_prompt_fragment || fallbackFragment(index, date)}${triggerHere ? ", Isla notices a phone notification, no extra visible person" : ""}`;
    return { id: skel.id, title: skel.title, beat: skel.beat, pose_id: pose, scene_description: String(raw.scene_description || skel.beat).slice(0, 320), caption: shortCaption(raw.caption, captions[index] || FALLBACK_CAPTIONS[index]), speech_bubble: String(raw.speech_bubble || "").replace(/\s+/g, " ").trim().slice(0, 90), dialogue: String(raw.speech_bubble || "").replace(/\s+/g, " ").trim().slice(0, 90), image_prompt_fragment: fragment, full_image_prompt: buildFullImagePrompt(fragment, setting, index), setting, view_rule: viewRule(index), image_ref: imageRef(skel.id), screen_state: skel.id, supporting_life_trigger_here: triggerHere, supporting_life_trigger: triggerHere ? supportingLifeTrigger : undefined };
  });
  let facebookPostText = String(generated?.facebook_post_text || "").replace(/\s+/g, " ").trim();
  if (!facebookPostText) facebookPostText = `Back again for today's Trigoku lock. ${SUITE_URL}`;
  if (!facebookPostText.endsWith(SUITE_URL)) facebookPostText = `${facebookPostText.replace(SUITE_URL, "").trim()} ${SUITE_URL}`.trim();
  const story = { date, weekday: weekdayName, character_id: "isla", character_name: "Isla", trigger_word: "ISLA_SP", render_mode: "illustrated_comic_panels", product_referenced: productReference(), puzzle_state: puzzleState, selected_setting: setting, story_source: source, supporting_life_trigger: supportingLifeTrigger || { enabled: false }, supporting_cast_policy: supportingPolicy || {}, story_note: String(generated?.story_note || `Isla returns to the ${puzzleState.difficulty_phase} Trigoku lock.`).slice(0, 520), continuation_note: String(generated?.continuation_note || "Fallback rhythm used; future Claude runs should vary from recent history.").slice(0, 520), facebook_post_text: facebookPostText, scenes, history_used_count: storyHistory.length };
  story.image_manifest = imageManifest(characterFile, story);
  return story;
}

function fallbackFragment(index, date) {
  const focus = STUCK_FOCI[stableIndex(`${date}-${index}`, STUCK_FOCI.length)];
  return ["opening the daily grid calmly, returning to her familiar puzzle ritual", "leaning closer with pencil near open journal, making the first careful moves", `pausing over ${focus}, thoughtful but not frustrated`, "thinking through a clean deduction, small shift in expression as the route opens", "taking a quiet coffee reset beside the nearly complete grid", "packing up calmly after the finished grid, small satisfied smile"][index];
}

function fallbackGenerated(date) {
  const focus = STUCK_FOCI[stableIndex(date, STUCK_FOCI.length)];
  return { story_note: `Isla returns to the daily Trigoku lock and works through ${focus}.`, continuation_note: `Fallback story varied by date seed: ${focus}.`, facebook_post_text: `Back again for today's Trigoku lock. ${SUITE_URL}`, beats: sceneSkeleton().map((scene, index) => ({ scene_description: scene.beat, pose_id: scene.pose_id, caption: FALLBACK_CAPTIONS[index], speech_bubble: index === 2 ? "No guessing." : "", image_prompt_fragment: fallbackFragment(index, date) })) };
}

function imageManifest(characterFile, story) {
  return { character_id: "isla", character_name: "Isla", trigger_word: "ISLA_SP", render_mode: "illustrated_comic_panels", required_character_files: story.scenes.map((s) => `templates/characters/isla/${s.image_ref}`), text_is_overlay: true, puzzle_screen_inserted_later: true, supporting_life_trigger: story.supporting_life_trigger, supporting_cast_policy: story.supporting_cast_policy, puzzle_product: "Trigoku Daily Lock", puzzle_url: SUITE_URL, selected_setting: story.selected_setting, image_prompts: story.scenes.map((s) => ({ scene: s.id, pose_id: s.pose_id, prompt: s.full_image_prompt })), style_rules: ["Isla is the only active daily comic character.", "Use ISLA_SP trigger word in every image prompt.", "Young Black woman, warm medium brown skin, light freckles on nose and cheeks.", "Natural coily dark hair in high voluminous puff bun.", "Wide floral headband in teal, rust orange, cream, and dusty blue, worn across forehead.", "Medium gold hoop earrings.", "Oversized deep teal hoodie.", "At least 2 of the 6 panels must be front-facing or three-quarter view showing Isla's face clearly.", "Puzzle screen must come from a real captured puzzle page.", "Supporting people are message or timing overlays unless explicitly approved.", ...(Array.isArray(characterFile.style_rules) ? characterFile.style_rules : [])], compositor_rules: ["Character art first.", "Puzzle screen composited second.", "Supporting-life notification overlay third.", "Caption bar text overlaid last.", "No generated puzzle grids.", "No giant title/header/footer.", "No large URL overlay.", "Logo only on merch.", "URL only on monitor/browser bar."] };
}

function makeHistoryEntry(story) {
  return { date: story.date, weekday: story.weekday, setting: story.selected_setting, puzzle_phase: story.puzzle_state?.difficulty_phase || null, story_note: story.story_note, continuation_note: story.continuation_note || "", supporting_life_trigger: story.supporting_life_trigger || { enabled: false }, stuck_moment: story.scenes?.[2]?.image_prompt_fragment || "", pose_order: story.scenes?.map((s) => s.pose_id) || [], captions: story.scenes?.map((s) => s.storyboard_caption || s.caption) || [] };
}

function buildCharacterFile(previous, storyHistory) {
  return { character_id: "isla", name: "Isla", posts: "daily", only_character: true, product: { name: "Trigoku Daily Lock", url: SUITE_URL, play_url: TRIGOKU_URL }, trigger_word: "ISLA_SP", visual_identity: { age_read: "young adult", skin: "warm medium brown skin", freckles: "light freckles on nose and cheeks", hair: "natural coily dark hair in high voluminous puff bun", headband: "wide floral headband — teal, rust orange, cream, dusty blue — worn across forehead", earrings: "medium gold hoop earrings", clothing: "oversized deep teal hoodie" }, locked_visual_traits: ISLA_CHARACTER.locked_visual_traits, poses: sceneSkeleton().map((scene) => ({ pose_id: scene.pose_id, title: scene.title, purpose: scene.beat })), settings: ISLA_CHARACTER.settings, brand_props: ISLA_CHARACTER.brand_props, caption_bank: ["Back again.", "One number at a time.", "Start small.", "No guessing.", "Not that one.", "There it is.", "Nearly there.", "Coffee helps.", "That opens it.", "Tomorrow, then.", "A clean finish.", "Same time tomorrow."], story_rules: ["Isla posts every day, not only Tuesdays.", "Isla is the only character.", "Supporting people should normally be messages, notifications, receipts, or calendar reminders, not visible generated people.", "The story is about Isla living her life with a Trigoku Daily Lock subplot; the puzzle is not the main character.", "Keep captions short, understated, real, and non-promotional.", "Avoid repeating the same arc, same stuck moment, or same visual rhythm across recent days.", "At least two panels must be front-facing or three-quarter view showing Isla's face clearly.", "Never invent puzzle content; real puzzle captures are composited later."], story_history: storyHistory.slice(-30), weeks: storyHistory.slice(-30), ongoing_threads: Array.isArray(previous.ongoing_threads) ? previous.ongoing_threads : [], last_updated: storyHistory.at(-1)?.date || previous.last_updated || null };
}

export async function runLocalDailyGeneration() {
  const config = await readJson("config/comic-engine.config.json", { timezone: "Europe/London" });
  const triggerConfig = await readSupportingTriggerConfig();
  const { date, weekdayName } = londonDateParts(config);
  const existingCharacter = await readJson("characters/isla.json", { character_id: "isla", name: "Isla", story_history: [], weeks: [] });
  const previousHistory = Array.isArray(existingCharacter.story_history) ? existingCharacter.story_history : Array.isArray(existingCharacter.weeks) ? existingCharacter.weeks.map((entry) => ({ date: entry.date, weekday: entry.weekday, story_note: entry.story_note, continuation_note: entry.continuation_note || "", supporting_life_trigger: entry.supporting_life_trigger || { enabled: false }, stuck_moment: entry.scenes?.[2]?.caption || entry.scenes?.[2]?.dialogue || "", pose_order: entry.scenes?.map((scene) => scene.id) || [], captions: entry.scenes?.map((scene) => scene.storyboard_caption || scene.caption) || [] })) : [];
  const withoutToday = previousHistory.filter((entry) => entry.date !== date);
  const characterFile = buildCharacterFile(existingCharacter, withoutToday);
  const setting = pickSetting(date, characterFile);
  const puzzleState = await fetchPuzzleState(date);
  const supportingLifeTrigger = chooseSupportingLifeTrigger({ date, storyHistory: withoutToday, puzzleState, setting, config: triggerConfig });
  console.log(`Generating Phase 2 Isla storyline for ${date} ${weekdayName}`);
  console.log(`Claude model: ${ANTHROPIC_MODEL}`);
  console.log(`Puzzle state: ${puzzleState.fetch_status} (${puzzleState.difficulty_phase})`);
  console.log(`Supporting life trigger: ${supportingLifeTrigger.enabled ? `${supportingLifeTrigger.type} panel ${supportingLifeTrigger.panel}` : supportingLifeTrigger.reason}`);
  let generated;
  let source = "claude";
  try { generated = await callClaude({ date, weekdayName, characterFile, storyHistory: withoutToday, puzzleState, setting, supportingLifeTrigger }); } catch (error) { console.error("Claude storyline generation failed. Writing varied local fallback story."); console.error(error?.message || error); generated = fallbackGenerated(date); source = "fallback"; }
  const story = normaliseStory({ generated, date, weekdayName, characterFile, storyHistory: withoutToday, puzzleState, setting, source, supportingLifeTrigger, supportingPolicy: triggerConfig.policy || {} });
  const updatedHistory = [...withoutToday, makeHistoryEntry(story)].slice(-30);
  const updatedCharacter = buildCharacterFile(existingCharacter, updatedHistory);
  await writeJson("characters/isla.json", updatedCharacter);
  await writeJson(`daily/${date}.json`, story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  await writeJson("latest.json", story);
  console.log(`Done. Wrote Phase 2 Isla storyline to daily/${date}.json`);
}
