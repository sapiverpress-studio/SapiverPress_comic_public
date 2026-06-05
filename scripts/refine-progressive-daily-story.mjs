import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const PANEL_FILES = [
  "01_panel-01.png",
  "02_panel-02.png",
  "03_panel-03.png",
  "04_panel-04.png",
  "05_panel-05.png",
  "06_panel-06.png",
];
const PAIRS = [[0, 1], [2, 3], [4, 5]];

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

async function readJson(rel, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(rel, data) {
  const out = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function snippet(scene) {
  return clean(
    scene.storyboard_caption ||
    scene.caption ||
    scene.scene_description ||
    scene.image_prompt_fragment ||
    scene.dialogue ||
    scene.speech_bubble ||
    scene.id ||
    ""
  );
}

function sentence(text) {
  const s = clean(text).replace(/[.;:,]+$/, "");
  return s ? `${s}.` : "";
}

function makeSummary(scenes) {
  const items = scenes.map(snippet).filter(Boolean);
  if (!items.length) return "";
  return clean(items.slice(0, 3).map(sentence).join(" "));
}

export async function refineProgressiveDailyStory() {
  const date = todayString();
  const story = await readJson(`daily/${date}.json`, null);
  if (!story) throw new Error(`Missing daily/${date}.json`);

  const scenes = Array.isArray(story.scenes) ? story.scenes.slice(0, 6) : [];
  if (scenes.length !== 6) {
    throw new Error(`Expected 6 scenes, found ${scenes.length}`);
  }

  const passes = [];

  for (let p = 0; p < PAIRS.length; p += 1) {
    const [start, end] = PAIRS[p];
    const beforeScenes = scenes.slice(0, start);
    const currentScenes = scenes.slice(start, end + 1);
    const afterScenes = scenes.slice(0, end + 1);

    passes.push({
      pass_index: p + 1,
      scene_numbers: [start + 1, end + 1],
      panel_files: [PANEL_FILES[start], PANEL_FILES[end]],
      story_so_far_before: beforeScenes.length ? makeSummary(beforeScenes) : "Story opens here.",
      pass_expansion_brief: makeSummary(currentScenes),
      story_so_far_after: makeSummary(afterScenes),
    });
  }

  story.progressive_story_pipeline = {
    mode: "three_pass_two_scene_pairs",
    description: "Calendar-led six-scene story built as 1-2, then 3-4, then 5-6 with reread summaries between passes.",
    pass_count: passes.length,
    passes,
  };

  story.image_generation_plan = {
    mode: "paired_story_generation",
    total_story_scenes: 6,
    pairs: passes.map((pass) => ({
      pass_index: pass.pass_index,
      scene_numbers: pass.scene_numbers,
      panel_files: pass.panel_files,
    })),
  };

  story.overlay_contract = {
    render_story_text_as_overlay_only: true,
    generated_art_must_not_draw_speech_bubbles: true,
    generated_art_must_not_draw_calendar_or_note_objects: true,
    preferred_overlay_fields: ["storyboard_dialogue", "overlay_dialogue", "overlay_text"],
  };

  story.scenes = scenes.map((scene, index) => {
    const pass = passes[Math.floor(index / 2)];
    const line = clean(
      scene.storyboard_dialogue ||
      scene.dialogue ||
      scene.speech_bubble ||
      ""
    );

    return {
      ...scene,
      story_pass_index: pass.pass_index,
      story_pair_id: `pair_${pass.pass_index}`,
      story_pair_scene_index: (index % 2) + 1,
      story_so_far_before: pass.story_so_far_before,
      pair_expansion_brief: pass.pass_expansion_brief,
      story_so_far_after: pass.story_so_far_after,

      // Text stays available for the preview/compositor overlay layer.
      storyboard_dialogue: line,
      overlay_dialogue: line,
      overlay_text: line,
      overlay_only_text: Boolean(line),
      render_text_as_overlay_only: true,

      // These field names are too likely to contaminate image prompts.
      speech_bubble: "",
      dialogue: "",
    };
  });

  if (story.image_manifest && typeof story.image_manifest === "object") {
    story.image_manifest.progressive_story_pipeline = story.progressive_story_pipeline;
    story.image_manifest.image_generation_plan = story.image_generation_plan;
    story.image_manifest.overlay_contract = story.overlay_contract;
  }

  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  await writeJson(`image-manifests/${date}.json`, story.image_manifest || {});

  console.log(`Progressive 2+2+2 story pipeline refined for ${date}; overlay dialogue separated from art fields.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  refineProgressiveDailyStory().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
