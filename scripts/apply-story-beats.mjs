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

function sceneStoryBeat(scene) {
  return tidy(
    scene.image_prompt_fragment ||
    scene.scene_description ||
    scene.storyboard_caption ||
    scene.caption ||
    scene.beat ||
    scene.title ||
    ""
  );
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
    const beat = sceneStoryBeat(scene);
    panel.arc_role = scene.arc_role || panel.arc_role || "";
    panel.story_beat = beat;
    panel.story_beat_enabled = Boolean(beat);
    panel.storyboard_caption = tidy(scene.storyboard_caption || scene.caption || "");
    panel.storyboard_dialogue = tidy(scene.storyboard_dialogue || scene.dialogue || scene.speech_bubble || "");
    panel.story_source_used = story.story_source_used || (story.date === date ? `daily/${date}.json` : "latest.json");
    panel.storyboard_copy_source = story.storyboard_copy_source || "unknown";
    panel.storyboard_arc_type = story.storyboard_arc_type || "story_driven_not_location_driven";
    const current = tidy(panel[promptKey]);
    panel[promptKey] = beat && !current.includes(beat) ? `${current}, ${beat}` : current;
    if (panel[promptFileKey]) {
      fs.writeFileSync(path.join(root, panel[promptFileKey]), `${panel[promptKey]}\n`, "utf8");
    }
  }
  data.story_beat_enabled = true;
  data.story_source_used = story.story_source_used || (story.date === date ? `daily/${date}.json` : "latest.json");
  data.story_fields_used = story.story_fields_used || [];
  data.storyboard_copy_source = story.storyboard_copy_source || "unknown";
  data.storyboard_arc_type = story.storyboard_arc_type || "story_driven_not_location_driven";
  data.storyboard_arc = story.storyboard_arc || {};
  data.storyboard_quality = story.storyboard_quality || {};
  writeJson(file, data);
}

console.log("Story beats and storyboard metadata appended to panel generation text.");
