const INTENDED_TRIGGER = "Isla_v2";
const INTENDED_LORA_FILE = "Isla_v2_1780410778059.safetensors";
const INTENDED_FAL_MODEL = "fal-ai/z-image/turbo/lora";
const INTENDED_HF_LORA_REPO = "sapiverpress/Isla_v2";
const LEGACY_TRIGGERS = new Set(["ISLA_SP"]);
const LEGACY_LORA_FILES = new Set(["ISLA_SP_1779957190206.safetensors"]);
const LEGACY_HF_LORA_REPOS = new Set(["sapiverpress/sapiverpress-isla-lora"]);

const trigger = process.env.HF_LORA_TRIGGER?.trim() || "";
if (!trigger || LEGACY_TRIGGERS.has(trigger)) process.env.HF_LORA_TRIGGER = INTENDED_TRIGGER;

const loraFile = process.env.HF_LORA_FILE?.trim() || "";
if (!loraFile || LEGACY_LORA_FILES.has(loraFile)) process.env.HF_LORA_FILE = INTENDED_LORA_FILE;

const loraRepo = process.env.HF_LORA_REPO?.trim() || "";
if (!loraRepo || LEGACY_HF_LORA_REPOS.has(loraRepo)) process.env.HF_LORA_REPO = INTENDED_HF_LORA_REPO;

process.env.FAL_MODEL = process.env.FAL_MODEL?.trim() || INTENDED_FAL_MODEL;
process.env.HF_IMAGE_WIDTH = process.env.HF_IMAGE_WIDTH || process.env.FAL_IMAGE_WIDTH || "1024";
process.env.HF_IMAGE_HEIGHT = process.env.HF_IMAGE_HEIGHT || process.env.FAL_IMAGE_HEIGHT || "1024";
process.env.FAL_IMAGE_WIDTH = process.env.FAL_IMAGE_WIDTH || process.env.HF_IMAGE_WIDTH;
process.env.FAL_IMAGE_HEIGHT = process.env.FAL_IMAGE_HEIGHT || process.env.HF_IMAGE_HEIGHT;
process.env.HF_NUM_INFERENCE_STEPS = process.env.HF_NUM_INFERENCE_STEPS || process.env.FAL_NUM_INFERENCE_STEPS || "9";
process.env.FAL_NUM_INFERENCE_STEPS = process.env.FAL_NUM_INFERENCE_STEPS || process.env.HF_NUM_INFERENCE_STEPS;
process.env.HF_LORA_SCALE = process.env.HF_LORA_SCALE || process.env.FAL_LORA_SCALE || "1";
process.env.FAL_LORA_SCALE = process.env.FAL_LORA_SCALE || process.env.HF_LORA_SCALE;

console.log(`Isla TurboLoRA settings: fal_model=${process.env.FAL_MODEL}; hf_lora_repo=${process.env.HF_LORA_REPO}; lora_file=${process.env.HF_LORA_FILE}; trigger_word=${process.env.HF_LORA_TRIGGER}; steps=${process.env.HF_NUM_INFERENCE_STEPS}; lora_scale=${process.env.HF_LORA_SCALE}; width=${process.env.HF_IMAGE_WIDTH}; height=${process.env.HF_IMAGE_HEIGHT}`);
console.log("HF image inference fallback: connected. Hugging Face token is preserved for fallback/preflight.");
await import("./strip-overlay-objects-from-prompts.mjs");
await import("./generate-isla-images.mjs");
await import("./update-isla-generation-provenance.mjs");
