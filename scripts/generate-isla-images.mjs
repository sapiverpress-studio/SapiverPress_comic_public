import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const ROOT = process.cwd();
const TOKEN = process.env.HF_TOKEN?.trim() || "";
const LORA_REPO = process.env.HF_LORA_REPO?.trim() || "sapiverpress/sapiverpress-isla-lora";
const LORA_FILE = process.env.HF_LORA_FILE?.trim() || "ISLA_SP_1779957190206.safetensors";
const TRIGGER = process.env.HF_LORA_TRIGGER?.trim() || "ISLA_SP";
const PRIMARY_MODEL = process.env.HF_PRIMARY_MODEL?.trim() || "black-forest-labs/FLUX.1-dev";
const FALLBACK_MODEL = process.env.HF_FALLBACK_MODEL?.trim() || "stabilityai/stable-diffusion-xl-base-1.0";
const WIDTH = Number(process.env.HF_IMAGE_WIDTH || 1024);
const HEIGHT = Number(process.env.HF_IMAGE_HEIGHT || 1024);
const STEPS = Number(process.env.HF_NUM_INFERENCE_STEPS || 28);
const GUIDANCE = Number(process.env.HF_GUIDANCE_SCALE || 7.5);
const LORA_SCALE = Number(process.env.HF_LORA_SCALE || 1.0);

const PANEL_FILES = [
  "01_panel-01.png",
  "02_panel-02.png",
  "03_panel-03.png",
  "04_panel-04.png",
  "05_panel-05.png",
  "06_panel-06.png",
];

function londonDateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override && !/^\d{4}-\d{2}-\d{2}$/.test(override)) throw new Error(`DATE_OVERRIDE must be YYYY-MM-DD. Received: ${override}`);
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")); } catch { return fallback; }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function ensureTrigger(prompt) {
  const text = String(prompt || "").trim();
  if (!text) return TRIGGER;
  return text.includes(TRIGGER) ? text : `${TRIGGER}, ${text}`;
}

function modelUrl(model) {
  return `https://api-inference.huggingface.co/models/${encodeURIComponent(model).replace(/%2F/g, "/")}`;
}

function primaryBody(prompt, negativePrompt) {
  return {
    inputs: prompt,
    parameters: {
      lora_weights: LORA_REPO,
      lora_filename: LORA_FILE,
      lora_scale: LORA_SCALE,
      width: WIDTH,
      height: HEIGHT,
      num_inference_steps: STEPS,
      guidance_scale: GUIDANCE,
      negative_prompt: negativePrompt,
    },
    options: { wait_for_model: true, use_cache: false },
  };
}

function fallbackBody(prompt, negativePrompt) {
  return {
    inputs: prompt,
    parameters: {
      width: WIDTH,
      height: HEIGHT,
      num_inference_steps: Math.min(STEPS, 30),
      guidance_scale: GUIDANCE,
      negative_prompt: negativePrompt,
    },
    options: { wait_for_model: true, use_cache: false },
  };
}

async function requestImage(model, body) {
  const response = await fetch(modelUrl(model), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "image/png,image/jpeg,application/json",
    },
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`${model} failed ${response.status}: ${bytes.toString("utf8").slice(0, 600)}`);
  if (contentType.includes("application/json")) throw new Error(`${model} returned JSON instead of image: ${bytes.toString("utf8").slice(0, 600)}`);
  if (!contentType.startsWith("image/") && bytes.length < 1000) throw new Error(`${model} did not return a usable image. Content-Type: ${contentType || "unknown"}`);
  return { bytes, model };
}

async function generateImage(prompt, negativePrompt) {
  try {
    return await requestImage(PRIMARY_MODEL, primaryBody(prompt, negativePrompt));
  } catch (error) {
    console.log(`Primary model failed for this panel; trying fallback. ${error.message}`);
    return requestImage(FALLBACK_MODEL, fallbackBody(prompt, negativePrompt));
  }
}

async function savePng(bytes, target) {
  await ensureDir(path.dirname(target));
  const png = await sharp(bytes).resize(WIDTH, HEIGHT, { fit: "cover" }).png().toBuffer();
  if (png.length < 1000) throw new Error(`Generated PNG too small for ${target}`);
  await fs.writeFile(target, png);
}

async function clearPanelImages(dirPath) {
  await ensureDir(dirPath);
  for (const name of PANEL_FILES) {
    try { await fs.unlink(path.join(dirPath, name)); } catch {}
  }
}

function normalisePanels(promptPack) {
  const panels = Array.isArray(promptPack?.panels) ? promptPack.panels : [];
  return PANEL_FILES.map((imageName, index) => {
    const panel = panels[index] || {};
    return {
      panel_number: index + 1,
      image_name: imageName,
      prompt: ensureTrigger(panel.prompt),
      negative_prompt: panel.negative_prompt || "text, captions, speech bubbles, puzzle grid, numbers, watermark, large logo, low quality, blurry",
    };
  });
}

async function writeSummary(dirA, dirB, summary) {
  await writeJson(path.join(dirA, "generation-summary.json"), summary);
  await writeJson(path.join(dirB, "generation-summary.json"), summary);
}

async function main() {
  const date = londonDateString();
  const promptPack = await readJson(path.join(ROOT, "art-prompts", "latest", "prompts.json"), await readJson(path.join(ROOT, "art-prompts", date, "prompts.json"), null));
  const datedDir = path.join(ROOT, "art-replacements", date);
  const latestDir = path.join(ROOT, "art-replacements", "latest");
  await ensureDir(datedDir);
  await ensureDir(latestDir);

  const summary = {
    date,
    generated_at: new Date().toISOString(),
    primary_model: PRIMARY_MODEL,
    fallback_model: FALLBACK_MODEL,
    lora_repo: LORA_REPO,
    lora_file: LORA_FILE,
    trigger_word: TRIGGER,
    requested_panels: 6,
    generated_count: 0,
    generated_panels: [],
    fallback_template_panels: [],
    errors: [],
  };

  if (!TOKEN || !promptPack) {
    const reason = !TOKEN ? "HF_TOKEN missing" : "prompt pack missing";
    summary.errors.push(reason);
    summary.fallback_template_panels = PANEL_FILES.map((name, i) => ({ panel_number: i + 1, image_name: name, reason }));
    await writeSummary(datedDir, latestDir, summary);
    console.log(`${reason}. Image generation skipped; compositor will use fallback template art.`);
    console.log("Image generation: 0/6 panels generated successfully");
    console.log("Panels using generated art: []");
    console.log(`Panels using fallback template: ${PANEL_FILES.join(", ")}`);
    return;
  }

  await clearPanelImages(datedDir);
  await clearPanelImages(latestDir);

  for (const panel of normalisePanels(promptPack)) {
    try {
      console.log(`Generating Isla panel ${panel.panel_number}/6: ${panel.image_name}`);
      const result = await generateImage(panel.prompt, panel.negative_prompt);
      const datedOutput = path.join(datedDir, panel.image_name);
      const latestOutput = path.join(latestDir, panel.image_name);
      await savePng(result.bytes, datedOutput);
      await fs.copyFile(datedOutput, latestOutput);
      summary.generated_count += 1;
      summary.generated_panels.push({ panel_number: panel.panel_number, image_name: panel.image_name, model: result.model, output: `art-replacements/${date}/${panel.image_name}` });
    } catch (error) {
      const message = error?.message || String(error);
      summary.errors.push({ panel_number: panel.panel_number, image_name: panel.image_name, error: message });
      console.log(`Panel ${panel.panel_number}/6 failed; compositor will use fallback template. ${message}`);
    }
  }

  const generatedNames = new Set(summary.generated_panels.map((panel) => panel.image_name));
  summary.fallback_template_panels = PANEL_FILES
    .filter((name) => !generatedNames.has(name))
    .map((name) => ({ panel_number: PANEL_FILES.indexOf(name) + 1, image_name: name, reason: "not generated" }));

  await writeSummary(datedDir, latestDir, summary);
  console.log(`Image generation: ${summary.generated_count}/6 panels generated successfully`);
  console.log(`Panels using generated art: ${summary.generated_panels.length ? summary.generated_panels.map((p) => p.image_name).join(", ") : "[]"}`);
  console.log(`Panels using fallback template: ${summary.fallback_template_panels.length ? summary.fallback_template_panels.map((p) => p.image_name).join(", ") : "[]"}`);
}

main().catch((error) => {
  console.log(`Image generation recovered from unexpected error: ${error?.message || error}`);
  console.log("Image generation: 0/6 panels generated successfully");
  console.log(`Panels using generated art: []`);
  console.log(`Panels using fallback template: ${PANEL_FILES.join(", ")}`);
  process.exit(0);
});
