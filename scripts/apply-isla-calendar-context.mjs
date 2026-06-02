import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();

function dateString() {
  return process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function readJson(rel, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(rel, data) {
  const file = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function toDayOfYear(monthDay, year) {
  const [month, day] = String(monthDay || "").split("-").map(Number);
  if (!month || !day) return null;
  const base = Date.UTC(year, 0, 1);
  const value = Date.UTC(year, month - 1, day);
  return Math.floor((value - base) / 86400000) + 1;
}

function dateParts(date) {
  const d = new Date(`${date}T12:00:00Z`);
  return {
    year: d.getUTCFullYear(),
    dayOfYear: Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1,
  };
}

function circularDiff(a, b, days = 366) {
  const raw = b - a;
  if (raw > days / 2) return raw - days;
  if (raw < -days / 2) return raw + days;
  return raw;
}

function findCalendarContext(calendar, date) {
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
      if (diff > 0) {
        phase = diff === 1 ? "day_before" : "preparation";
        story = event.day_before_story || event.day_of_story || event.title || "Prepare for upcoming event.";
      } else if (diff < 0) {
        phase = "day_after";
        story = event.day_after_story || event.day_of_story || event.title || "Carry forward the event aftermath.";
      }
      matches.push({ event, diff, phase, story, abs: Math.abs(diff) });
    }
  }
  matches.sort((a, b) => a.abs - b.abs || String(a.event.id).localeCompare(String(b.event.id)));
  return matches[0] || null;
}

function overlayStyle(calendar, event) {
  return event.overlay_style || calendar?.event_types?.[event.type]?.default_overlay_style || (event.type === "appointment" || event.type === "travel" ? "calendar_notification" : "phone_notification");
}

function preferredFlows(calendar, event) {
  return event.preferred_flows || calendar?.event_types?.[event.type]?.preferred_flows || [];
}

function applyContext(story, calendar, context) {
  if (!context) {
    story.calendar_context = { enabled: false, reason: "no_event_window" };
    if (story.image_manifest) story.image_manifest.calendar_context = story.calendar_context;
    return { changed: false, reason: "no_event_window" };
  }

  const { event, phase, diff, story: calendarStory } = context;
  const trigger = {
    enabled: true,
    id: `calendar_${event.id}_${phase}`,
    type: event.type || "calendar_event",
    sender: event.reminder_sender || "Calendar",
    message: event.reminder_message || event.title || "Calendar reminder",
    panel: Number(event.preferred_panel || 2),
    overlay_style: overlayStyle(calendar, event),
    render_layer: "post_art_compositor_overlay",
    no_visible_supporting_character: true,
    arc_shift: calendarStory,
    source: "isla_calendar",
  };

  const preferred = preferredFlows(calendar, event);
  story.calendar_context = {
    enabled: true,
    event_id: event.id,
    event_title: event.title,
    event_type: event.type,
    event_date: event.date,
    phase,
    days_until_event: diff,
    story_effect: calendarStory,
    preferred_flows: preferred,
    overlay: trigger,
  };
  story.supporting_life_trigger = trigger;
  story.supporting_cast_policy = {
    ...(story.supporting_cast_policy || {}),
    isla_only_main_character: true,
    overlay_only: true,
    no_extra_faces: true,
    no_visible_supporting_character: true,
  };
  story.story_note = clean(`${story.story_note || ""} Calendar context: ${calendarStory}`).slice(0, 900);
  story.continuation_note = clean(`${story.continuation_note || ""} Calendar continuity: ${event.title} (${phase}) should influence today's flow and tomorrow setup.`).slice(0, 900);
  story.calendar_preferred_flows = preferred;
  story.life_memory_entry = story.life_memory_entry || { date: story.date };
  story.life_memory_entry.calendar_context = story.calendar_context;
  story.life_memory_entry.supporting_life_trigger = trigger;
  story.life_memory_entry.tomorrow_setup = phase === "day_before" || phase === "preparation" ? (event.day_of_story || calendarStory) : (event.day_after_story || calendarStory);
  if (story.image_manifest) {
    story.image_manifest.calendar_context = story.calendar_context;
    story.image_manifest.supporting_life_trigger = trigger;
    story.image_manifest.supporting_cast_policy = story.supporting_cast_policy;
  }
  return { changed: true, reason: `${event.id}_${phase}` };
}

async function main() {
  const date = dateString();
  const calendar = await readJson("config/isla_calendar.json", null);
  if (!calendar) throw new Error("Missing config/isla_calendar.json");
  const story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);
  const context = findCalendarContext(calendar, date);
  const result = applyContext(story, calendar, context);
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  if (story.image_manifest) await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  console.log(`Isla calendar context: ${result.changed ? "applied" : "skipped"} (${result.reason})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
