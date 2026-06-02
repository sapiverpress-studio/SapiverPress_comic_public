import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dateString() {
  return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
async function readJson(rel, fallback = null) { try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8")); } catch { return fallback; } }
async function writeJson(rel, data) { const file = path.join(ROOT, rel); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }

function toDayOfYear(monthDay, year) {
  const [month, day] = String(monthDay || "").split("-").map(Number);
  if (!month || !day) return null;
  return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1;
}

function dateParts(date) {
  const d = new Date(`${date}T12:00:00Z`);
  return {
    iso: date,
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: WEEKDAYS[d.getUTCDay()],
    monthDay: `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    dayOfYear: Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1,
  };
}

function circularDiff(a, b, days = 366) {
  const raw = b - a;
  if (raw > days / 2) return raw - days;
  if (raw < -days / 2) return raw + days;
  return raw;
}

function stableIndex(seed, length) {
  let hash = 2166136261;
  for (const ch of String(seed || "")) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % Math.max(1, length);
}
function pick(list, seed, fallback = "") { return Array.isArray(list) && list.length ? list[stableIndex(seed, list.length)] || fallback : fallback; }
function isoToMonthDay(iso) { return String(iso || "").slice(5, 10); }
function inIsoRange(iso, start, end) { return iso >= start && iso <= end; }
function isWorkday(calendar, weekday) { return (calendar.work_life?.working_pattern?.workdays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]).includes(weekday); }

function overlayStyle(calendar, eventOrAnchor) {
  return eventOrAnchor.overlay_style || calendar?.event_types?.[eventOrAnchor.type]?.default_overlay_style || (eventOrAnchor.type === "appointment" || eventOrAnchor.type === "travel" ? "calendar_notification" : "phone_notification");
}
function preferredFlows(calendar, eventOrAnchor) { return eventOrAnchor.preferred_flows || calendar?.event_types?.[eventOrAnchor.type]?.preferred_flows || []; }

function findMajorEventContext(calendar, date) {
  const { year, dayOfYear } = dateParts(date);
  const before = Number(calendar?.rules?.use_event_window_days_before ?? 2);
  const after = Number(calendar?.rules?.use_event_window_days_after ?? 1);
  const matches = [];
  for (const event of calendar.events || []) {
    const eventDay = toDayOfYear(event.date, year);
    if (!eventDay) continue;
    const diff = circularDiff(dayOfYear, eventDay);
    if (diff >= -after && diff <= before) {
      let phase = "day_of";
      let story = event.day_of_story || event.title || "Calendar event today.";
      if (diff > 0) { phase = diff === 1 ? "day_before" : "preparation"; story = event.day_before_story || event.day_of_story || event.title || "Prepare for upcoming event."; }
      else if (diff < 0) { phase = "day_after"; story = event.day_after_story || event.day_of_story || event.title || "Carry forward the event aftermath."; }
      matches.push({ event, diff, phase, story, abs: Math.abs(diff) });
    }
  }
  matches.sort((a, b) => a.abs - b.abs || String(a.event.id).localeCompare(String(b.event.id)));
  return matches[0] || null;
}

function findBankHoliday(calendar, iso) {
  return (calendar.work_life?.public_holidays_2026 || []).find((h) => h.date === iso) || null;
}
function findAnnualLeave(calendar, iso) {
  return (calendar.work_life?.annual_leave?.planned_2026 || []).find((l) => l.date === iso) || null;
}
function findSeasonalBuildup(calendar, iso) {
  const windows = (calendar.work_life?.seasonal_buildups_2026 || []).filter((w) => inIsoRange(iso, w.start, w.end));
  windows.sort((a, b) => String(a.end).localeCompare(String(b.end)) || String(a.id).localeCompare(String(b.id)));
  return windows[0] || null;
}
function recurringWorkMeeting(calendar, parts) {
  const list = calendar.work_life?.recurring_work_anchors?.[parts.weekday] || [];
  return pick(list, `${parts.iso}-work-anchor`, "work meeting with Nora in Teams");
}

function buildWorkLifeAnchor(calendar, date, dailyAnchor) {
  const parts = dateParts(date);
  const bank = findBankHoliday(calendar, date);
  if (bank) return {
    id: `bank_holiday_${parts.monthDay}`,
    date: parts.monthDay,
    iso_date: date,
    anchor_level: "work_life",
    type: "bank_holiday",
    title: bank.title,
    sub_character: "Calendar",
    engagement_channel: "calendar_notification",
    reminder_sender: "Calendar",
    reminder_message: bank.title,
    story_effect: bank.story_hint,
    preferred_panel: 1,
    preferred_flows: preferredFlows(calendar, { type: "bank_holiday" }),
    overlay_style: overlayStyle(calendar, { type: "bank_holiday" }),
    work_status: "bank_holiday_no_work",
    tomorrow_hook: `Tomorrow should remember ${bank.title} changed the shape of the day.`,
    source: "uk_bank_holidays_2026",
  };

  const leave = findAnnualLeave(calendar, date);
  if (leave) return {
    id: `annual_leave_${parts.monthDay}`,
    date: parts.monthDay,
    iso_date: date,
    anchor_level: "work_life",
    type: "annual_leave",
    title: leave.title,
    sub_character: leave.sub_character || "Isla",
    engagement_channel: leave.engagement_channel || "calendar_note",
    reminder_sender: leave.sub_character || "Calendar",
    reminder_message: leave.title,
    story_effect: `Annual leave day: ${leave.reason}. Isla is not at normal work, so the story should use leave, prep, family, travel, or reset context before the puzzle appears.`,
    preferred_panel: 1,
    preferred_flows: preferredFlows(calendar, { type: "annual_leave" }),
    overlay_style: overlayStyle(calendar, { type: "annual_leave" }),
    work_status: "annual_leave_no_work",
    tomorrow_hook: `Tomorrow should carry the effect of ${leave.title}: ${leave.reason}.`,
    source: "isla_annual_leave_2026",
  };

  const seasonal = findSeasonalBuildup(calendar, date);
  if (seasonal) return {
    id: `seasonal_${seasonal.id}_${parts.monthDay}`,
    date: parts.monthDay,
    iso_date: date,
    anchor_level: "seasonal_buildup",
    type: "seasonal_buildup",
    title: seasonal.label,
    sub_character: seasonal.sub_character || dailyAnchor.sub_character || "Isla",
    engagement_channel: seasonal.engagement_channel || "phone_message",
    reminder_sender: seasonal.sub_character || "Calendar",
    reminder_message: seasonal.label,
    story_effect: seasonal.story_hint,
    preferred_panel: 2,
    preferred_flows: preferredFlows(calendar, { type: "seasonal_buildup" }),
    overlay_style: overlayStyle(calendar, { type: "seasonal_buildup" }),
    work_status: isWorkday(calendar, parts.weekday) ? "workday_with_seasonal_pressure" : "weekend_with_seasonal_pressure",
    tomorrow_hook: `Tomorrow should keep ${seasonal.label} in the background if the date is still in range.`,
    source: "isla_seasonal_buildup_2026",
  };

  if (isWorkday(calendar, parts.weekday)) {
    const meeting = recurringWorkMeeting(calendar, parts);
    return {
      id: `work_${parts.monthDay}`,
      date: parts.monthDay,
      iso_date: date,
      anchor_level: "work_life",
      type: "work",
      title: meeting,
      sub_character: /Nora/i.test(meeting) ? "Nora" : /Ravi/i.test(meeting) ? "Ravi" : /Lena/i.test(meeting) ? "Lena" : "Isla",
      engagement_channel: /Teams/i.test(meeting) ? "Teams meeting" : /email/i.test(meeting) ? "email" : "work note",
      reminder_sender: /Nora|Ravi|Lena/i.test(meeting) ? (meeting.match(/Nora|Ravi|Lena/i)?.[0] || "Calendar") : "Calendar",
      reminder_message: meeting,
      story_effect: `Workday anchor: ${meeting}. Isla has normal work between ${calendar.work_life?.working_pattern?.normal_start || "09:00"} and ${calendar.work_life?.working_pattern?.normal_finish || "17:30"}, so the puzzle must fit around work rather than replacing it.`,
      preferred_panel: 2,
      preferred_flows: preferredFlows(calendar, { type: "work" }),
      overlay_style: overlayStyle(calendar, { type: "work" }),
      work_status: "normal_workday",
      tomorrow_hook: `Tomorrow should remember whether Isla handled ${meeting} cleanly or left a loose end.`,
      source: "isla_recurring_work_anchor",
    };
  }

  return null;
}

function buildDailyAnchor(calendar, date) {
  const parts = dateParts(date);
  const monthKey = String(parts.month).padStart(2, "0");
  const month = calendar?.daily_anchor_blueprint?.monthly_arcs?.[monthKey] || {};
  const rhythm = calendar?.daily_anchor_blueprint?.weekday_rhythm?.[parts.weekday] || {};
  const subCharacter = pick(month.sub_character_bias, `${parts.monthDay}-${parts.weekday}-sub`, rhythm.reminder_sender || "Isla");
  const motif = pick(month.visual_motifs, `${parts.monthDay}-${parts.weekday}-motif`, "notebook");
  const dayOrdinal = Math.ceil(parts.day / 7);
  const title = `${month.name || `${MONTH_NAMES[parts.month]} Isla anchor`} — ${rhythm.title_stub || "Daily anchor"} ${dayOrdinal}`;
  const storyMove = clean(`${month.daily_focus || "making the day specific"}; ${rhythm.story_move || "Isla has a concrete reason for where the puzzle fits."}`);
  const preferred = Array.isArray(rhythm.preferred_flows) ? rhythm.preferred_flows : preferredFlows(calendar, rhythm);
  return {
    id: `daily_${parts.monthDay}`,
    date: parts.monthDay,
    iso_date: date,
    anchor_level: "daily",
    type: rhythm.type || "daily_life",
    title,
    month_arc: month.name || "",
    month_theme: month.daily_focus || "",
    weekday: parts.weekday,
    day_of_year: parts.dayOfYear,
    sub_character: subCharacter,
    engagement_channel: subCharacter === "Isla" ? "self_note" : "phone_or_calendar_message",
    reminder_sender: rhythm.reminder_sender || subCharacter || "Calendar",
    reminder_message: rhythm.reminder_message || "Today anchor",
    story_effect: storyMove,
    visual_motif: motif,
    preferred_panel: Number(rhythm.preferred_panel || 2),
    preferred_flows: preferred,
    work_status: isWorkday(calendar, parts.weekday) ? "normal_workday_base" : "weekend_base",
    tomorrow_hook: `Tomorrow should follow from ${rhythm.title_stub || "today's choice"} and the ${month.name || MONTH_NAMES[parts.month]} arc, not restart from a blank template.`,
    source: "isla_365_daily_anchor_blueprint",
  };
}

function majorEventAnchor(calendar, context) {
  if (!context) return null;
  const { event, phase, diff, story } = context;
  return {
    id: `calendar_${event.id}_${phase}`,
    source_event_id: event.id,
    date: event.date,
    anchor_level: event.anchor_level || "major",
    type: event.type || "calendar_event",
    title: event.title,
    phase,
    days_until_event: diff,
    sub_character: event.sub_character || event.reminder_sender || "Calendar",
    engagement_channel: event.engagement_channel || "calendar_notification",
    reminder_sender: event.reminder_sender || "Calendar",
    reminder_message: event.reminder_message || event.title || "Calendar reminder",
    story_effect: story,
    preferred_panel: Number(event.preferred_panel || 2),
    preferred_flows: preferredFlows(calendar, event),
    overlay_style: overlayStyle(calendar, event),
    tomorrow_hook: phase === "day_before" || phase === "preparation" ? (event.day_of_story || story) : (event.day_after_story || story),
  };
}

function choosePrimaryAnchor(dailyAnchor, workLifeAnchor, majorAnchor) {
  const primary = majorAnchor || workLifeAnchor || dailyAnchor;
  const combined = [dailyAnchor?.story_effect, workLifeAnchor?.story_effect, majorAnchor?.story_effect].filter(Boolean).join(" ");
  return { ...primary, daily_anchor_preserved: dailyAnchor, work_life_anchor: workLifeAnchor, major_anchor: majorAnchor, combined_story_effect: combined || primary.story_effect };
}

function buildTrigger(calendar, primaryAnchor) {
  return {
    enabled: true,
    id: primaryAnchor.id,
    type: primaryAnchor.type || "daily_anchor",
    sender: primaryAnchor.reminder_sender || primaryAnchor.sub_character || "Calendar",
    message: primaryAnchor.reminder_message || primaryAnchor.title || "Today anchor",
    panel: Number(primaryAnchor.preferred_panel || 2),
    overlay_style: primaryAnchor.overlay_style || overlayStyle(calendar, primaryAnchor),
    render_layer: "post_art_compositor_overlay",
    no_visible_supporting_character: true,
    sub_character: primaryAnchor.sub_character || "Isla",
    engagement_channel: primaryAnchor.engagement_channel || "self_note",
    arc_shift: primaryAnchor.combined_story_effect || primaryAnchor.story_effect || primaryAnchor.title,
    source: primaryAnchor.source || `isla_calendar_${primaryAnchor.anchor_level || "anchor"}`,
  };
}

function applyContext(story, calendar, date) {
  const dailyAnchor = buildDailyAnchor(calendar, date);
  const workLifeAnchor = buildWorkLifeAnchor(calendar, date, dailyAnchor);
  const majorContext = findMajorEventContext(calendar, date);
  const majorAnchor = majorEventAnchor(calendar, majorContext);
  const primaryAnchor = choosePrimaryAnchor(dailyAnchor, workLifeAnchor, majorAnchor);
  const trigger = buildTrigger(calendar, primaryAnchor);
  const preferred = primaryAnchor.preferred_flows?.length ? primaryAnchor.preferred_flows : workLifeAnchor?.preferred_flows?.length ? workLifeAnchor.preferred_flows : dailyAnchor.preferred_flows || [];

  story.calendar_context = {
    enabled: true,
    mode: "daily_365_working_life_anchor",
    country_context: calendar.work_life?.country_context || "England and Wales, UK",
    daily_anchor: dailyAnchor,
    work_life_anchor: workLifeAnchor,
    major_anchor: majorAnchor,
    primary_anchor: {
      id: primaryAnchor.id,
      anchor_level: primaryAnchor.anchor_level,
      title: primaryAnchor.title,
      type: primaryAnchor.type,
      work_status: primaryAnchor.work_status || dailyAnchor.work_status,
      sub_character: primaryAnchor.sub_character,
      engagement_channel: primaryAnchor.engagement_channel,
      story_effect: primaryAnchor.combined_story_effect || primaryAnchor.story_effect,
      preferred_flows: preferred,
      preferred_panel: primaryAnchor.preferred_panel,
    },
    story_effect: primaryAnchor.combined_story_effect || primaryAnchor.story_effect,
    preferred_flows: preferred,
    overlay: trigger,
  };
  story.supporting_life_trigger = trigger;
  story.supporting_cast_policy = { ...(story.supporting_cast_policy || {}), isla_only_main_character: true, overlay_only: true, no_extra_faces: true, no_visible_supporting_character: true };
  story.story_note = clean(`${story.story_note || ""} Calendar working-life anchor: ${story.calendar_context.story_effect}`).slice(0, 1600);
  story.continuation_note = clean(`${story.continuation_note || ""} Calendar continuity: ${primaryAnchor.title}. Tomorrow setup: ${primaryAnchor.tomorrow_hook || dailyAnchor.tomorrow_hook}`).slice(0, 1600);
  story.calendar_preferred_flows = preferred;
  story.calendar_sub_character = primaryAnchor.sub_character || dailyAnchor.sub_character || "Isla";
  story.calendar_engagement_channel = primaryAnchor.engagement_channel || dailyAnchor.engagement_channel || "self_note";
  story.calendar_work_status = primaryAnchor.work_status || dailyAnchor.work_status;
  if (preferred.length) { story.location_flow_id = preferred[0]; story.location_flow_method = `${primaryAnchor.anchor_level || "calendar"}_flow_hint`; }
  story.life_memory_entry = story.life_memory_entry || { date: story.date || date };
  story.life_memory_entry.calendar_context = story.calendar_context;
  story.life_memory_entry.supporting_life_trigger = trigger;
  story.life_memory_entry.tomorrow_setup = primaryAnchor.tomorrow_hook || dailyAnchor.tomorrow_hook;
  story.life_memory_entry.location_flow_id = preferred[0] || story.location_flow_id || "";
  story.life_memory_entry.sub_character = story.calendar_sub_character;
  story.life_memory_entry.engagement_channel = story.calendar_engagement_channel;
  story.life_memory_entry.work_status = story.calendar_work_status;
  story.image_manifest = story.image_manifest || {};
  story.image_manifest.calendar_context = story.calendar_context;
  story.image_manifest.supporting_life_trigger = trigger;
  story.image_manifest.supporting_cast_policy = story.supporting_cast_policy;
  story.image_manifest.calendar_preferred_flows = preferred;
  story.image_manifest.calendar_sub_character = story.calendar_sub_character;
  story.image_manifest.calendar_engagement_channel = story.calendar_engagement_channel;
  story.image_manifest.calendar_work_status = story.calendar_work_status;
  return { changed: true, reason: primaryAnchor.id };
}

async function main() {
  const date = dateString();
  const calendar = await readJson("config/isla_calendar.json", null);
  if (!calendar) throw new Error("Missing config/isla_calendar.json");
  const story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);
  const result = applyContext(story, calendar, date);
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  if (story.image_manifest) await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  console.log(`Isla calendar context: ${result.changed ? "applied" : "skipped"} (${result.reason})`);
}

main().catch((error) => { console.error(error); process.exit(1); });
