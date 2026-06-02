import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const INTENDED = {
  fal_model: "fal-ai/z-image/turbo/lora",
  lora_file: "Isla_v2_1780410778059.safetensors",
  trigger_word: "Isla_v2",
  lora_scale: 1,
  steps: 9,
  width: 1024,
  height: 1024,
};
const LEGACY_TRIGGERS = new Set(["ISLA_SP"]);
const LEGACY_LORA_FILES = new Set(["ISLA_SP_1779957190206.safetensors"]);
const PANEL_FILES = ["01_panel-01.png", "02_panel-02.png", "03_panel-03.png", "04_panel-04.png", "05_panel-05.png", "06_panel-06.png"];

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
async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}
function activeSettings() {
  const envTrigger = process.env.HF_LORA_TRIGGER?.trim() || "";
  const envLoraFile = process.env.HF_LORA_FILE?.trim() || "";
  const falModel = process.env.FAL_MODEL?.trim() || INTENDED.fal_model;
  const triggerWord = envTrigger && !LEGACY_TRIGGERS.has(envTrigger) ? envTrigger : INTENDED.trigger_word;
  const loraFile = envLoraFile && !LEGACY_LORA_FILES.has(envLoraFile) ? envLoraFile : INTENDED.lora_file;
  return {
    fal_model: falModel,
    lora_file: loraFile,
    trigger_word: triggerWord,
    lora_scale: Number(process.env.HF_LORA_SCALE || process.env.FAL_LORA_SCALE || INTENDED.lora_scale),
    steps: Number(process.env.HF_NUM_INFERENCE_STEPS || process.env.FAL_NUM_INFERENCE_STEPS || INTENDED.steps),
    width: Number(process.env.HF_IMAGE_WIDTH || process.env.FAL_IMAGE_WIDTH || INTENDED.width),
    height: Number(process.env.HF_IMAGE_HEIGHT || process.env.FAL_IMAGE_HEIGHT || INTENDED.height),
    normalised_legacy_trigger: envTrigger && LEGACY_TRIGGERS.has(envTrigger) ? envTrigger : "",
    normalised_legacy_lora_file: envLoraFile && LEGACY_LORA_FILES.has(envLoraFile) ? envLoraFile : "",
  };
}
function withFallbackFlags(summary) {
  const generated = Array.isArray(summary.generated_panels) ? summary.generated_panels : [];
  const templateFallback = Array.isArray(summary.fallback_template_panels) ? summary.fallback_template_panels : [];
  const hfFallback = generated.filter((panel) => panel.provider === "hf-fallback");
  return {
    ...summary,
    hf_fallback_art_used: hfFallback.length > 0,
    hf_fallback_panels: hfFallback.map((panel) => ({ panel_number: panel.panel_number, image_name: panel.image_name, model: panel.model, fal_error: panel.fal_error || "" })),
    template_fallback_art_used: templateFallback.length > 0,
    fallback_art_used: hfFallback.length > 0 || templateFallback.length > 0,
    real_generated_art_used: generated.some((panel) => panel.provider === "fal"),
    fallback_template_panel_count: templateFallback.length,
  };
}
async function updateSummary(filePath, settings) {
  const existing = await readJson(filePath, null);
  const generatedPanels = Array.isArray(existing?.generated_panels) ? existing.generated_panels : [];
  const generatedNames = new Set(generatedPanels.map((panel) => panel.image_name));
  const fallbackTemplatePanels = Array.isArray(existing?.fallback_template_panels)
    ? existing.fallback_template_panels
    : PANEL_FILES.filter((name) => !generatedNames.has(name)).map((name) => ({ panel_number: PANEL_FILES.indexOf(name) + 1, image_name: name, reason: "not generated" }));
  const summary = withFallbackFlags({
    ...(existing || {}),
    ...settings,
    lora_url: existing?.lora_url || `https://huggingface.co/sapiverpress/sapiverpress-isla-lora/resolve/main/${encodeURIComponent(settings.lora_file)}`,
    requested_panels: existing?.requested_panels || 6,
    generated_count: existing?.generated_count || generatedPanels.length,
    generated_panels: generatedPanels,
    fallback_template_panels: fallbackTemplatePanels,
    provenance_checked_at: new Date().toISOString(),
  });
  await writeJson(filePath, summary);
  return summary;
}
async function updateManifest(filePath, settings, summary) {
  const data = await readJson(filePath, null);
  if (!data) return;
  data.image_generation_status = {
    ...(data.image_generation_status || {}),
    ran: true,
    generated_count: summary.generated_count,
    requested_panels: summary.requested_panels,
    generated_panels: summary.generated_panels,
    fallback_template_panels: summary.fallback_template_panels,
    all_panels_generated: summary.generated_count === summary.requested_panels,
    fallback_art_used: summary.fallback_art_used,
    template_fallback_art_used: summary.template_fallback_art_used,
    hf_fallback_art_used: summary.hf_fallback_art_used,
    real_generated_art_used: summary.real_generated_art_used,
    fal_model: settings.fal_model,
    lora_file: settings.lora_file,
    trigger_word: settings.trigger_word,
    lora_scale: settings.lora_scale,
    steps: settings.steps,
    width: settings.width,
    height: settings.height,
    checked_at: new Date().toISOString(),
  };
  await writeJson(filePath, data);
}

const date = londonDateString();
const settings = activeSettings();
const summaryPaths = [path.join(ROOT, "art-replacements", date, "generation-summary.json"), path.join(ROOT, "art-replacements", "latest", "generation-summary.json")];
let summary = null;
for (const summaryPath of summaryPaths) {
  if (await exists(summaryPath)) summary = await updateSummary(summaryPath, settings);
}
if (!summary) {
  summary = withFallbackFlags({ date, generated_at: new Date().toISOString(), ...settings, requested_panels: 6, generated_count: 0, generated_panels: [], fallback_template_panels: PANEL_FILES.map((name, i) => ({ panel_number: i + 1, image_name: name, reason: "summary missing" })) });
  await updateSummary(summaryPaths[0], settings);
  await updateSummary(summaryPaths[1], settings);
}
for (const rel of [`image-manifests/${date}.json`, `daily/${date}.json`, "latest.json"]) {
  await updateManifest(path.join(ROOT, rel), settings, summary);
}
console.log(`Generation provenance proof: fal_model=${settings.fal_model}; lora_file=${settings.lora_file}; trigger_word=${settings.trigger_word}; steps=${settings.steps}; lora_scale=${settings.lora_scale}; width=${settings.width}; height=${settings.height}`);
console.log(`Fallback art used: ${summary.fallback_art_used ? "yes" : "no"}; template_fallback=${summary.template_fallback_art_used ? "yes" : "no"}; hf_fallback=${summary.hf_fallback_art_used ? "yes" : "no"}; real_generated_art=${summary.real_generated_art_used ? "yes" : "no"}`);
