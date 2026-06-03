import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const TZ = "Europe/London";

function bool(value) {
  return ["1", "true", "yes", "y"].includes(String(value || "").trim().toLowerCase());
}

function londonParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    hhmm: `${get("hour")}:${get("minute")}`,
  };
}

function parseHm(value, fallback) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

async function readJson(relativePath, fallback = null) {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), "utf8")); } catch { return fallback; }
}

function writeOutput(values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${String(value)}`).join("\n") + "\n";
  if (process.env.GITHUB_OUTPUT) return fs.appendFile(process.env.GITHUB_OUTPUT, lines, "utf8");
  process.stdout.write(lines);
}

const now = londonParts();
const date = process.env.DATE_OVERRIDE && /^\d{4}-\d{2}-\d{2}$/.test(process.env.DATE_OVERRIDE)
  ? process.env.DATE_OVERRIDE
  : now.date;

const start = parseHm(process.env.IMAGE_GENERATION_WINDOW_START, 7 * 60);
const end = parseHm(process.env.IMAGE_GENERATION_WINDOW_END, 8 * 60 + 30);
const inWindow = now.minutes >= start && now.minutes <= end;

const eventName = process.env.GITHUB_EVENT_NAME || "";
const scheduledRun = eventName === "schedule";
const wantsFacebook = bool(process.env.POST_TO_FACEBOOK) || scheduledRun;
const wantsPinterest = bool(process.env.POST_TO_PINTEREST) || scheduledRun;
const postingDue = wantsFacebook || wantsPinterest;
const force = bool(process.env.FORCE_GENERATE_IMAGES);

const facebookPosts = await readJson("facebook-posts.json", { posts: {} });
const pinterestPosts = await readJson("pinterest-posts.json", {});
const facebookPosted = Boolean(facebookPosts?.posts?.[`facebook:${date}`]?.posted_at);
const pinterestPosted = Boolean(pinterestPosts?.[date]?.posted_at);
const alreadyPosted = facebookPosted || pinterestPosted;

const reasons = [];
if (!force && !postingDue) reasons.push("posting_not_due");
if (!force && !inWindow) reasons.push(`outside_posting_window_${now.hhmm}_London`);
if (!force && alreadyPosted) reasons.push("already_posted_for_date");

const generate = force || reasons.length === 0;
const reason = generate ? (force ? "forced" : "posting_due_inside_window_not_already_posted") : reasons.join(",");

console.log(`Image generation guard: generate_images=${generate}`);
console.log(`Image generation guard: date=${date}; london_time=${now.hhmm}; window=${process.env.IMAGE_GENERATION_WINDOW_START || "07:00"}-${process.env.IMAGE_GENERATION_WINDOW_END || "08:30"}; event=${eventName || "unknown"}; posting_due=${postingDue}; facebook_posted=${facebookPosted}; pinterest_posted=${pinterestPosted}; reason=${reason}`);

await writeOutput({
  generate_images: generate ? "true" : "false",
  image_generation_reason: reason,
  image_generation_date: date,
  image_generation_london_time: now.hhmm,
});
