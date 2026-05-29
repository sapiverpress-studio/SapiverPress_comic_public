import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const API_KEY = process.env.OPENAI_API_KEY?.trim() || "";
const MODEL = process.env.OPENAI_TEXT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

const DAY_LOCATIONS = [
  "small home kitchen table in warm morning light",
  "train table by the window",
  "quiet public library reading table",
  "outdoor cafe street table",
  "co-working desk near a tall window",
  "bookshop cafe corner",
  "rainy window nook with plants",
  "gothic window desk with cityscape view",
];

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override) return override;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stableIndex(seed, length) {
  let hash = 2166136261;
  for (const ch of String(seed || "")) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % Math.max(1, length);
}

function dayLocationPlan(story) {
  const seed = `${story?.date || ""}-${story?.same_day_attempt || 1}-${story?.life_memory_entry?.location || story?.selected_setting || ""}`;
  const offset = stableIndex(seed, DAY_LOCATIONS.length);
  const ordered = [];
  for (let i = 0; i < DAY_LOCATIONS.length; i += 1) ordered.push(DAY_LOCATIONS[(offset + i) % DAY_LOCATIONS.length]);
  const anchor = clean(story?.life_memory_entry?.location || story?.selected_setting || ordered[0]);
  const plan = [
    ordered.find((x) => x.includes("home")) || ordered[0],
    ordered.find((x) => x.includes("train")) || ordered[1],
    anchor,
    ordered.find((x) => x.includes("cafe") && !x.includes("bookshop")) || ordered[2],
    ordered.find((x) => x.includes("co-working")) || ordered[3],
    ordered.find((x) => x.includes("bookshop") || x.includes("window")) || ordered[4],
  ];
  return Array.from(new Set(plan.concat(ordered))).slice(0, 6);
}

async function readJson(relativePath, fallback = null) {
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

function frameImageName(index) {
  const n = String(index + 1).padStart(2, "0");
  return `${n}_panel-${n}.png`;
}

function sourceBrief(story) {
  const scenes = Array.isArray(story?.scenes) ? story.scenes.slice(0, 6) : [];
  return {
    date: story?.date,
    same_day_attempt: story?.same_day_attempt || 1,
    selected_setting: story?.selected_setting,
    location_key: story?.location_key,
    suggested_day_locations: dayLocationPlan(story),
    story_note: story?.story_note,
    continuation_note: story?.continuation_note,
    life_memory_entry: story?.life_memory_entry || null,
    variant_recap: story?.variant_recap || null,
    uk_calendar_date: story?.uk_calendar_date || null,
    scenes: scenes.map((scene, index) => ({
      panel: index + 1,
      image_name: frameImageName(index),
      current_caption: scene.caption || "",
      current_dialogue: scene.dialogue || scene.speech_bubble || "",
      scene_description: scene.scene_description || scene.beat || scene.title || "",
      image_prompt_fragment: scene.image_prompt_fragment || "",
      variant_recap_here: Boolean(scene.variant_recap_here),
      uk_calendar_recap_here: Boolean(scene.uk_calendar_recap_here),
      setting: scene.setting || story?.selected_setting || "",
    })),
  };
}

function fallbackStoryboard(story) {
  const locations = dayLocationPlan(story);
  const variant = clean(story?.variant_recap?.variant_name || "today's puzzle");
  const rule = clean(story?.variant_recap?.line || "check the rule before rushing");
  const calendar = clean(story?.uk_calendar_date?.name || "");
  const calendarLine = clean(story?.uk_calendar_date?.line || "");
  const thread = clean(story?.life_memory_entry?.thread_to_continue || "keeping one small routine alive");

  return [
    {
      location: locations[0],
      caption: `Isla starts at home, giving herself one quiet minute before the day begins asking for things.`,
      dialogue: "One clean look first.",
      image_prompt_fragment: "warm morning start, private routine, quiet focus",
    },
    {
      location: locations[1],
      caption: `On the move, the grid becomes a small anchor while the rest of the day keeps shifting.`,
      dialogue: "Keep the thread.",
      image_prompt_fragment: "travel moment, contained thinking time, gentle movement",
    },
    {
      location: locations[2],
      caption: calendar ? `${calendar} changes the pace of the day, but Isla keeps the moment understated.` : `By midday, she has carried the puzzle into another pocket of borrowed quiet.`,
      dialogue: calendarLine || "No rushing this one.",
      image_prompt_fragment: "midday pause, diary atmosphere, life outside the puzzle",
    },
    {
      location: locations[3],
      caption: `${variant} changes the route through the puzzle, so she checks the constraint before trusting a move.`,
      dialogue: rule,
      image_prompt_fragment: "brief puzzle rule realisation, careful deduction, calm expression",
    },
    {
      location: locations[4],
      caption: `Later, one careful idea holds, and the page starts to feel less noisy than the day around it.`,
      dialogue: "That gives me a path.",
      image_prompt_fragment: "late workday pause, small breakthrough, steady concentration",
    },
    {
      location: locations[5],
      caption: `By the final check, the win is not speed; it is leaving the day a little clearer.`,
      dialogue: "Clearer than before.",
      image_prompt_fragment: "end of day reflection, gentle finish, quiet satisfaction",
    },
  ];
}

function parseJsonText(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i) || trimmed.match(/(\{[\s\S]*\})/);
  if (match) return JSON.parse(match[1]);
  throw new Error("OpenAI storyboard response was not valid JSON");
}

async function refineWithOpenAI(story) {
  const brief = sourceBrief(story);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.62,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are the storyboard editor for Sapiver Press's Isla daily illustrated puzzle diary.",
            "Rewrite six panel captions so the six PNGs read as one coherent storyboard, not six isolated captions.",
            "The six frames should cover a small day arc across LOCATIONS, not one static room unless the brief makes that essential.",
            "Each frame must include a location from the suggested_day_locations list or a close natural equivalent.",
            "Each frame needs depth: a narrative caption plus a short natural Isla line.",
            "This is an illustrated diary with a puzzle subplot. Isla's life, locations, errands, pauses, and mood matter.",
            "Use life memory, UK calendar context, and puzzle variant where relevant.",
            "The puzzle rule may appear once, naturally inside the story, not as a dumped instruction card.",
            "Do not write one-word captions. Do not babble. Do not use hashtags, emoji, sales language, or fake drama.",
            "Keep it understated, human, UK-friendly, and suitable as visible panel text.",
            "Return JSON only with: arc_title, board_caption, frames.",
            "frames must contain exactly six objects, each with panel_number, location, caption, dialogue, image_prompt_fragment.",
            "caption: 12-24 words. dialogue: 3-12 words, in Isla's voice. image_prompt_fragment: visual mood only, no text instructions.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Create a coherent six-frame, multi-location storyboard copy pass before captions are rendered into images.",
            brief,
          }),
        },
      ],
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI storyboard refine failed ${response.status}: ${text.slice(0, 900)}`);
  const parsed = parseJsonText(text);
  const frames = Array.isArray(parsed.frames) ? parsed.frames : [];
  if (frames.length !== 6) throw new Error(`OpenAI returned ${frames.length} frames, expected 6`);
  return {
    arc_title: clean(parsed.arc_title || "Isla's daily page"),
    board_caption: clean(parsed.board_caption || "A quiet daily puzzle moment with Isla."),
    frames: frames.map((frame, index) => ({
      panel_number: index + 1,
      location: clean(frame.location || dayLocationPlan(story)[index]),
      caption: clean(frame.caption),
      dialogue: clean(frame.dialogue),
      image_prompt_fragment: clean(frame.image_prompt_fragment),
    })),
    source: "openai",
    model: MODEL,
  };
}

function applyStoryboard(story, storyboard) {
  const fallbackFrames = fallbackStoryboard(story);
  const frames = storyboard?.frames?.length === 6 ? storyboard.frames : fallbackFrames;
  story.storyboard_copy_refined = true;
  story.storyboard_copy_source = storyboard?.source || "fallback";
  story.storyboard_copy_model = storyboard?.model || "fallback";
  story.storyboard_arc_title = storyboard?.arc_title || "Isla's daily page";
  story.storyboard_board_caption = storyboard?.board_caption || "A quiet daily puzzle moment with Isla.";
  story.storyboard_locations = frames.map((frame, index) => clean(frame.location || fallbackFrames[index]?.location || ""));
  story.scenes = (story.scenes || []).slice(0, 6).map((scene, index) => {
    const frame = frames[index] || fallbackFrames[index];
    const dialogue = clean(frame.dialogue || "");
    const caption = clean(frame.caption || scene.caption || "");
    const location = clean(frame.location || fallbackFrames[index]?.location || scene.setting || story.selected_setting || "");
    const visual = clean(frame.image_prompt_fragment || scene.image_prompt_fragment || scene.scene_description || "quiet daily-life puzzle moment");
    return {
      ...scene,
      setting: location,
      panel_location: location,
      caption,
      dialogue,
      speech_bubble: dialogue,
      storyboard_caption: caption,
      storyboard_dialogue: dialogue,
      storyboard_panel_text: dialogue ? `${dialogue}\n${caption}` : caption,
      image_prompt_fragment: visual,
      scene_description: clean(`${location}. ${caption} ${visual}`).slice(0, 340),
    };
  });
  return story;
}

async function main() {
  const date = dateString();
  let story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);

  let storyboard;
  try {
    if (!API_KEY) throw new Error("OPENAI_API_KEY missing");
    storyboard = await refineWithOpenAI(story);
  } catch (error) {
    storyboard = {
      arc_title: "Isla's daily page",
      board_caption: "A quiet six-frame diary moment built around today's puzzle.",
      frames: fallbackStoryboard(story),
      source: "fallback",
      model: "fallback",
      error: error?.message || String(error),
    };
    console.log(`Storyboard copy used fallback: ${storyboard.error}`);
  }

  story = applyStoryboard(story, storyboard);
  await writeJson(`daily/${date}.json`, story);
  await writeJson("latest.json", story);
  if (story.image_manifest) {
    story.image_manifest.storyboard_copy_refined = true;
    story.image_manifest.storyboard_arc_title = story.storyboard_arc_title;
    story.image_manifest.storyboard_locations = story.storyboard_locations;
    story.image_manifest.image_prompts = story.scenes.map((scene) => ({
      scene: scene.id,
      pose_id: scene.pose_id,
      location: scene.panel_location || scene.setting,
      prompt: scene.full_image_prompt || scene.image_prompt_fragment || "",
      caption: scene.caption,
      dialogue: scene.dialogue,
    }));
    await writeJson(`image-manifests/${date}.json`, story.image_manifest);
  }

  console.log(`Storyboard copy refined before image/caption render: ${story.storyboard_copy_source}`);
  console.log(`Storyboard locations: ${story.storyboard_locations.join(" | ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
