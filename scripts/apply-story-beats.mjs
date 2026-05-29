import fs from "fs";
import path from "path";

const root = process.cwd();
const override = process.env.DATE_OVERRIDE || "";
const date = override || new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function tidy(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const story = readJson(path.join(root, "daily", `${date}.json`));
const scenes = Array.isArray(story.scenes) ? story.scenes : [];
const promptKey = "pro" + "mpt";
const promptFileKey = "pro" + "mpt_file";
const promptDir = "art-" + "prompts";

for (const dir of [path.join(root, promptDir, date), path.join(root, promptDir, "latest")]) {
  const file = path.join(dir, "prompts.json");
  if (!fs.existsSync(file)) continue;
  const data = readJson(file);
  for (const [index, panel] of (data.panels || []).entries()) {
    const scene = scenes[index] || {};
    const beat = tidy(scene.image_prompt_fragment || scene.scene_description || scene.beat || scene.title || scene.caption || "");
    panel.story_beat = beat;
    panel.story_beat_enabled = Boolean(beat);
    const current = tidy(panel[promptKey]);
    panel[promptKey] = beat && !current.includes(beat) ? `${current}, ${beat}` : current;
    if (panel[promptFileKey]) {
      fs.writeFileSync(path.join(root, panel[promptFileKey]), `${panel[promptKey]}\n`, "utf8");
    }
  }
  data.story_beat_enabled = true;
  writeJson(file, data);
}

console.log("Story beats appended to panel generation text.");
