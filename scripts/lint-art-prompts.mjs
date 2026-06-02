import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const COFFEE_RE = /\b(coffee|mug|mugs|cup|cups|latte|espresso)\b/i;
const COFFEE_NEGATIVE = "multiple mugs, repeated coffee cups, extra cups, duplicate mugs, cluttered coffee cups, many mugs, many cups";
const NO_PUZZLE_SCREEN_NEGATIVE = "open laptop, open laptop screen, visible laptop screen, laptop solving, visible puzzle grid, sudoku grid, trigoku grid, puzzle numbers, puzzle on paper, physical puzzle pieces, jigsaw pieces";
const GENERAL_NEGATIVE = "jigsaw pieces, physical puzzle pieces, cardboard puzzle pieces, loose puzzle shapes, collage layout, split panel, multiple frames, storyboard grid, contact sheet, instruction text, caption text, same seated laptop pose in every panel";
const CONTROL_NEGATIVE = "LOCK, TRUTH, BANS, mandatory, panel text, prompt text, readable prop text, machine instruction, labels, arrows, numbered panel, contact sheet, split-screen collage, LOCATION text prefix";

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override && !/^\d{4}-\d{2}-\d{2}$/.test(override)) throw new Error(`DATE_OVERRIDE must be YYYY-MM-DD. Received: ${override}`);
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
async function readJson(file, fallback = null) { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; } }
async function writeJson(file, data) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
async function writeText(file, text) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text, "utf8"); }

function stripScreenDemand(prompt) {
  return clean(prompt)
    .replace(/MANDATORY SCREEN FOR PANEL 4:[^,]+(?:,[^,]+){0,18}/gi, "")
    .replace(/MANDATORY SCREEN:[^,]+(?:,[^,]+){0,18}/gi, "")
    .replace(/open laptop screen visible[^,]*/gi, "")
    .replace(/dark blank rectangular screen area[^,]*/gi, "")
    .replace(/clear four-corner rectangle for puzzle insertion/gi, "")
    .replace(/unobstructed/gi, "")
    .replace(/facing viewer enough for puzzle insertion/gi, "")
    .replace(/no hands covering screen/gi, "")
    .replace(/no reflections hiding screen/gi, "")
    .replace(/,+/g, ",")
    .replace(/^,\s*/, "")
    .replace(/,\s*$/, "");
}

function stripReadableLocationGarbage(prompt) {
  return clean(prompt)
    .replace(/^LOCATION\s+[^,]+,\s*/i, "")
    .replace(/\bLOCATION\s+Big impact\.;\s*Progress over perfection\.;\s*One page at a time\.;\s*Focus\. Solve\. Grow\.;\s*Lead with intention\.;\s*One win at a time\.;\s*Puzzle Therapy;\s*Logic & Pattern;\s*Word Wise;\s*The Focus Habit;\s*Daily Clarity;\s*Small Wins Journal,?\s*/gi, "")
    .replace(/\bLOCATION\s+/gi, "");
}

function stripControlLanguage(prompt) {
  return clean(stripReadableLocationGarbage(prompt))
    .replace(/\b(?:SCENE TRUTH|STORY BEAT|PANEL TRUTH|DIGITAL PUZZLE LOCK|READABLE PROP TEXT PACK|BANS?|LOCKS?|TRUTH):[^.]+[.]?/gi, "")
    .replace(/\b(?:must|mandatory|required|ensure|avoid|ban|do not|no)\b[^,.]*(?:panel|prompt|instruction|label|caption|text|overlay|lock|truth|ban)[^,.]*/gi, "")
    .replace(/\bpanel\s*\d+\b/gi, "")
    .replace(/\bscene_\d+\b/gi, "")
    .replace(/\bprompt\b/gi, "")
    .replace(/\binstruction[s]?\b/gi, "")
    .replace(/,+/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/^,\s*/, "")
    .replace(/,\s*$/, "");
}

function stripNoPuzzleContradictions(prompt) {
  return clean(prompt)
    .replace(/\bdesk scene,?\s*/gi, "")
    .replace(/\bone laptop only open on desk,?\s*/gi, "")
    .replace(/\blaptop screen visible and angled naturally for later digital overlay,?\s*/gi, "")
    .replace(/\bscreen is blank dark matte rectangle,?\s*/gi, "")
    .replace(/\bscreen not obscuring face,?\s*/gi, "")
    .replace(/\bnatural desk perspective,?\s*/gi, "")
    .replace(/\bdo not draw content on the laptop screen,?\s*/gi, "")
    .replace(/\bone laptop only,?\s*/gi, "")
    .replace(/\bactive working pose,?\s*/gi, "")
    .replace(/\bone hand on keyboard or trackpad,?\s*/gi, "")
    .replace(/\beyes on blank screen,?\s*/gi, "")
    .replace(/\bseated calm opening pose,?\s*/gi, "")
    .replace(/\bseated opening laptop,?\s*/gi, "")
    .replace(/\bone hand on laptop lid or table edge,?\s*/gi, "one hand on table edge, ")
    .replace(/\bone hand on lid,?\s*/gi, "")
    .replace(/\bbody angled toward viewer,?\s*/gi, "")
    .replace(/,+/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/^,\s*/, "")
    .replace(/,\s*$/, "");
}

function replaceCoffee(prompt) {
  return clean(prompt)
    .replace(/\bSJ ceramic mug on desk\b/gi, "open notebook on desk")
    .replace(/\bSapiver Press logo allowed on mug,/gi, "Sapiver Press logo allowed on notebook,")
    .replace(/\bon mugs, notebooks/gi, "on notebooks")
    .replace(/\bmug or notebook\b/gi, "notebook")
    .replace(/\bmug and notebook\b/gi, "notebook")
    .replace(/\bholding mug\b/gi, "holding notebook")
    .replace(/\bholding a mug\b/gi, "holding a notebook")
    .replace(/\bmugs\b/gi, "notebooks")
    .replace(/\bmug\b/gi, "notebook")
    .replace(/\bcoffee cups?\b/gi, "notebook")
    .replace(/\bcoffee\b/gi, "notebook")
    .replace(/\bcups\b/gi, "notebooks")
    .replace(/\bcup\b/gi, "notebook")
    .replace(/\blatte\b/gi, "notebook")
    .replace(/\bespresso\b/gi, "notebook");
}

function appendOnce(text, addition) {
  const base = clean(text);
  return base.toLowerCase().includes(addition.toLowerCase()) ? base : clean(`${base}, ${addition}`);
}

function poseInstruction(scene, index) {
  const pose = clean(scene?.panel_pose_family || "");
  if (/standing|walking|packing|waiting|arrival|browsing|choosing/i.test(pose)) return "single full-body or three-quarter standing pose, visible arms and bag or notebook, not a laptop desk pose";
  if (/side|receipt|book|note|consequence/i.test(pose)) return "single side-angle or over-shoulder consequence pose, not a front-on desk shot";
  if (/closing/i.test(pose)) return "single closing or packing gesture, looking away from the screen, clear ending body language";
  if (index === 3) return "single active puzzle-check pose, side angle, one hand clear of the screen";
  return "single coherent illustration, body language visibly different from adjacent panels";
}

function processPanelPrompt(panel, scene, index, coffeeAllowed) {
  const state = clean(scene?.panel_screen_state || panel.panel_screen_state || "active_puzzle");
  const noPuzzle = ["no_puzzle", "closed_device"].includes(state);
  let prompt = stripControlLanguage(clean(panel.prompt || ""));
  let negative = clean(panel.negative_prompt || "");
  const hadCoffee = COFFEE_RE.test(prompt);

  if (!coffeeAllowed && hadCoffee) prompt = replaceCoffee(prompt);
  if (noPuzzle) {
    prompt = stripScreenDemand(stripNoPuzzleContradictions(prompt));
    prompt = appendOnce(prompt, "no open laptop, no visible screen, no puzzle grid, no numbers, device closed or absent");
    prompt = appendOnce(prompt, "not a laptop desk pose");
    negative = appendOnce(negative, NO_PUZZLE_SCREEN_NEGATIVE);
  }
  prompt = appendOnce(prompt, poseInstruction(scene, index));
  prompt = appendOnce(prompt, "one scene only, one continuous illustration, no collage, no split panels, no text labels");
  negative = appendOnce(negative, GENERAL_NEGATIVE);
  negative = appendOnce(negative, COFFEE_NEGATIVE);
  negative = appendOnce(negative, CONTROL_NEGATIVE);

  return {
    ...panel,
    prompt,
    negative_prompt: negative,
    panel_location: clean(scene?.panel_location || panel.panel_location || ""),
    panel_action: clean(scene?.panel_action || panel.panel_action || ""),
    panel_pose_family: clean(scene?.panel_pose_family || panel.panel_pose_family || ""),
    panel_screen_state: state,
    scene_truth_flow_id: scene?.scene_truth_flow_id || "",
    supporting_life_trigger_here: Boolean(scene?.supporting_life_trigger_here),
    coffee_prompt_stripped: Boolean(hadCoffee && !coffeeAllowed),
    control_language_stripped: true,
    no_puzzle_contradictions_stripped: noPuzzle,
    no_puzzle_prompt_guard: noPuzzle,
  };
}

async function main() {
  const date = dateString();
  const story = await readJson(path.join(ROOT, "daily", `${date}.json`), await readJson(path.join(ROOT, "latest.json"), null));
  if (!story) throw new Error(`Missing daily/${date}.json and latest.json`);
  const scenes = Array.isArray(story.scenes) ? story.scenes.slice(0, 6) : [];
  const dirs = [path.join(ROOT, "art-prompts", date), path.join(ROOT, "art-prompts", "latest")];
  let changedFiles = 0;
  const coffeeAllowedPanels = new Set(
    scenes.map((scene, index) => ({ index, text: clean(scene.panel_action || "") })).filter((item) => COFFEE_RE.test(item.text)).slice(0, 2).map((item) => item.index)
  );

  for (const dir of dirs) {
    const promptsPath = path.join(dir, "prompts.json");
    const data = await readJson(promptsPath, null);
    if (!data?.panels?.length) continue;
    const nextPanels = [];
    for (const [index, panel] of data.panels.entries()) {
      const next = processPanelPrompt(panel, scenes[index] || {}, index, coffeeAllowedPanels.has(index));
      if (next.prompt_file) await writeText(path.join(ROOT, next.prompt_file), `${next.prompt}\n`);
      nextPanels.push(next);
    }
    data.panels = nextPanels;
    data.prompt_lint = {
      ran: true,
      coffee_mug_max: 2,
      coffee_allowed_panels: Array.from(coffeeAllowedPanels).map((i) => i + 1),
      no_puzzle_prompt_guards: data.panels.filter((panel) => panel.no_puzzle_prompt_guard).map((panel) => panel.panel_number),
      control_language_stripped: true,
      no_puzzle_contradictions_stripped: true,
      location_prefix_garbage_stripped: true,
      negative_prompt_added: [GENERAL_NEGATIVE, COFFEE_NEGATIVE, CONTROL_NEGATIVE],
      checked_at: new Date().toISOString(),
    };
    await writeJson(promptsPath, data);
    changedFiles += 1;
  }

  story.image_manifest = story.image_manifest || {};
  story.image_manifest.prompt_lint = {
    ran: true,
    coffee_mug_max: 2,
    coffee_allowed_panels: Array.from(coffeeAllowedPanels).map((i) => i + 1),
    changed_prompt_files: changedFiles,
    control_language_stripped: true,
    no_puzzle_contradictions_stripped: true,
    location_prefix_garbage_stripped: true,
    checked_at: new Date().toISOString(),
  };
  await writeJson(path.join(ROOT, "daily", `${date}.json`), story);
  await writeJson(path.join(ROOT, "latest.json"), story);
  await writeJson(path.join(ROOT, "image-manifests", `${date}.json`), story.image_manifest);
  console.log(`Art prompt lint: ${changedFiles} prompt pack(s) updated; coffee allowed panels ${Array.from(coffeeAllowedPanels).map((i) => i + 1).join(", ") || "none"}; control/no-puzzle contradictions stripped`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
