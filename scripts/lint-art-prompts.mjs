import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const COFFEE_RE = /\b(coffee|mug|mugs|cup|cups|latte|espresso)\b/i;
const COFFEE_NEGATIVE = "multiple mugs, repeated coffee cups, extra cups, duplicate mugs, cluttered coffee cups, many mugs, many cups";
const NO_PUZZLE_SCREEN_NEGATIVE = "open laptop screen, visible puzzle grid, sudoku grid, trigoku grid, puzzle numbers, puzzle on paper, physical puzzle pieces, jigsaw pieces";
const GENERAL_NEGATIVE = "jigsaw pieces, physical puzzle pieces, cardboard puzzle pieces, loose puzzle shapes, same seated laptop pose in every panel";

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
    .replace(/MANDATORY SCREEN FOR PANEL 4:[^,]+(?:,[^,]+){0,12}/gi, "")
    .replace(/MANDATORY SCREEN:[^,]+(?:,[^,]+){0,12}/gi, "")
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
  if (/standing|walking|packing|waiting|arrival|browsing|choosing/i.test(pose)) return "POSE EMPHASIS: full body or three-quarter standing pose, visible arms and bag/notebook, not seated at laptop";
  if (/side|receipt|book|note|consequence/i.test(pose)) return "POSE EMPHASIS: side angle or over-shoulder consequence pose, not another front-on laptop desk shot";
  if (/closing/i.test(pose)) return "POSE EMPHASIS: closing laptop or packing bag, looking away from the screen, clear ending gesture";
  if (index === 3) return "POSE EMPHASIS: active puzzle check, side angle, one hand clear of the screen";
  return "POSE EMPHASIS: body language visibly different from adjacent panels";
}

function processPanelPrompt(panel, scene, index, coffeeAllowed) {
  const state = clean(scene?.panel_screen_state || panel.panel_screen_state || "active_puzzle");
  const noPuzzle = ["no_puzzle", "closed_device"].includes(state);
  let prompt = clean(panel.prompt || "");
  let negative = clean(panel.negative_prompt || "");
  const hadCoffee = COFFEE_RE.test(prompt);

  if (!coffeeAllowed && hadCoffee) prompt = replaceCoffee(prompt);
  if (noPuzzle) {
    prompt = stripScreenDemand(prompt);
    prompt = appendOnce(prompt, "NO PUZZLE SCREEN: device closed or absent, no visible grid, no laptop solving, no numbers");
    prompt = appendOnce(prompt, "not seated at laptop");
    negative = appendOnce(negative, NO_PUZZLE_SCREEN_NEGATIVE);
  }
  prompt = appendOnce(prompt, poseInstruction(scene, index));
  negative = appendOnce(negative, GENERAL_NEGATIVE);
  negative = appendOnce(negative, COFFEE_NEGATIVE);

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
    data.panels = data.panels.map((panel, index) => {
      const next = processPanelPrompt(panel, scenes[index] || {}, index, coffeeAllowedPanels.has(index));
      if (next.prompt_file) writeText(path.join(ROOT, next.prompt_file), `${next.prompt}\n`);
      return next;
    });
    data.prompt_lint = {
      ran: true,
      coffee_mug_max: 2,
      coffee_allowed_panels: Array.from(coffeeAllowedPanels).map((i) => i + 1),
      no_puzzle_prompt_guards: data.panels.filter((panel) => panel.no_puzzle_prompt_guard).map((panel) => panel.panel_number),
      negative_prompt_added: [GENERAL_NEGATIVE, COFFEE_NEGATIVE],
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
    checked_at: new Date().toISOString(),
  };
  await writeJson(path.join(ROOT, "daily", `${date}.json`), story);
  await writeJson(path.join(ROOT, "latest.json"), story);
  await writeJson(path.join(ROOT, "image-manifests", `${date}.json`), story.image_manifest);
  console.log(`Art prompt lint: ${changedFiles} prompt pack(s) updated; coffee allowed panels ${Array.from(coffeeAllowedPanels).map((i) => i + 1).join(", ") || "none"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
