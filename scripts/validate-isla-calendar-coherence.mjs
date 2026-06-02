import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function readJson(rel) {
  return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8"));
}

function clean(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
function pad(n) { return String(n).padStart(2, "0"); }
function dateParts(month, day) {
  const d = new Date(Date.UTC(2025, month - 1, day, 12, 0, 0));
  return { monthDay: `${pad(month)}-${pad(day)}`, weekday: WEEKDAYS[d.getUTCDay()], dayOfYear: Math.floor((Date.UTC(2025, month - 1, day) - Date.UTC(2025, 0, 1)) / 86400000) + 1 };
}
function stableIndex(seed, length) {
  let hash = 2166136261;
  for (const ch of String(seed || "")) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % Math.max(1, length);
}
function pick(list, seed, fallback = "") {
  return Array.isArray(list) && list.length ? list[stableIndex(seed, list.length)] : fallback;
}
function buildDailyAnchor(calendar, month, day) {
  const parts = dateParts(month, day);
  const monthKey = pad(month);
  const monthArc = calendar.daily_anchor_blueprint?.monthly_arcs?.[monthKey] || {};
  const rhythm = calendar.daily_anchor_blueprint?.weekday_rhythm?.[parts.weekday] || {};
  const subCharacter = pick(monthArc.sub_character_bias, `${parts.monthDay}-${parts.weekday}-sub`, rhythm.reminder_sender || "Isla");
  const motif = pick(monthArc.visual_motifs, `${parts.monthDay}-${parts.weekday}-motif`, "notebook");
  return {
    id: `daily_${parts.monthDay}`,
    date: parts.monthDay,
    weekday: parts.weekday,
    type: rhythm.type || "daily_life",
    title: `${monthArc.name || monthKey} — ${rhythm.title_stub || "Daily anchor"}`,
    sub_character: subCharacter,
    reminder_sender: rhythm.reminder_sender || subCharacter || "Calendar",
    reminder_message: rhythm.reminder_message || "Today anchor",
    story_effect: clean(`${monthArc.daily_focus || "making the day specific"}; ${rhythm.story_move || "Isla has a concrete reason for where the puzzle fits."}`),
    visual_motif: motif,
    preferred_flows: rhythm.preferred_flows || [],
  };
}

function allMonthDays() {
  const out = [];
  for (let month = 1; month <= 12; month += 1) {
    const days = new Date(Date.UTC(2025, month, 0)).getUTCDate();
    for (let day = 1; day <= days; day += 1) out.push({ month, day });
  }
  return out;
}

async function main() {
  const calendar = await readJson("config/isla_calendar.json");
  const issues = [];
  if (calendar.rules?.daily_anchor_required_before_story !== true) issues.push("daily_anchor_required_before_story_not_true");
  if (Number(calendar.rules?.daily_anchor_count) !== 365) issues.push("daily_anchor_count_not_365");
  for (const weekday of WEEKDAYS) if (!calendar.daily_anchor_blueprint?.weekday_rhythm?.[weekday]) issues.push(`missing_weekday_rhythm:${weekday}`);
  for (let month = 1; month <= 12; month += 1) if (!calendar.daily_anchor_blueprint?.monthly_arcs?.[pad(month)]) issues.push(`missing_monthly_arc:${pad(month)}`);

  const anchors = allMonthDays().map(({ month, day }) => buildDailyAnchor(calendar, month, day));
  if (anchors.length !== 365) issues.push(`expanded_anchor_count_${anchors.length}`);
  const ids = new Set();
  for (const anchor of anchors) {
    if (ids.has(anchor.id)) issues.push(`duplicate_anchor_id:${anchor.id}`);
    ids.add(anchor.id);
    for (const key of ["date", "weekday", "type", "title", "sub_character", "reminder_sender", "reminder_message", "story_effect", "visual_motif"]) {
      if (!clean(anchor[key])) issues.push(`anchor_missing_${key}:${anchor.id}`);
    }
    if (!Array.isArray(anchor.preferred_flows) || !anchor.preferred_flows.length) issues.push(`anchor_missing_preferred_flows:${anchor.id}`);
  }
  const majorDates = new Set();
  for (const event of calendar.events || []) {
    if (!/^\d{2}-\d{2}$/.test(event.date || "")) issues.push(`bad_major_event_date:${event.id}`);
    if (majorDates.has(event.date)) issues.push(`duplicate_major_event_date:${event.date}`);
    majorDates.add(event.date);
    for (const key of ["id", "anchor_level", "type", "title", "sub_character", "engagement_channel", "reminder_sender", "reminder_message", "day_before_story", "day_of_story", "day_after_story"]) {
      if (!clean(event[key])) issues.push(`major_event_missing_${key}:${event.id}`);
    }
  }
  const subCharacters = calendar.sub_characters || {};
  const usedSubs = new Set([...anchors.map((a) => a.sub_character), ...(calendar.events || []).map((e) => e.sub_character)].filter(Boolean));
  for (const sub of usedSubs) if (!subCharacters[sub] && sub !== "Calendar") issues.push(`undefined_sub_character:${sub}`);

  if (issues.length) {
    console.error(`Isla calendar coherence failed: ${issues.length} issue(s)`);
    for (const issue of issues.slice(0, 80)) console.error(`- ${issue}`);
    process.exit(1);
  }
  console.log(`Isla calendar coherence passed: 365 deterministic daily anchors plus ${(calendar.events || []).length} major anchors.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
