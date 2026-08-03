import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());

const targets = [
  path.join(ROOT, "social", "sapiver-forge", DATE, "copy", "tiktok-caption.txt"),
  path.join(ROOT, "social", "sapiver-forge", DATE, "OPEN-TIKTOK-POSTING-DESK.html")
];

for (const file of targets) {
  const text = await fs.readFile(file, "utf8");
  const updated = text.replace(/#(?:Sapiver\s*Forge|Clear\s*Forge)\b/gi, "#SapiverForge");
  if (updated !== text) {
    await fs.writeFile(file, updated, "utf8");
    console.log(`Updated TikTok hashtag in ${path.relative(ROOT, file)}`);
  }
}
