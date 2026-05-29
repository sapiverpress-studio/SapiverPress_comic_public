const current = Number(process.env.HF_NUM_INFERENCE_STEPS || process.env.FAL_NUM_INFERENCE_STEPS || 28);
const safeSteps = Math.max(28, Number.isFinite(current) ? current : 28);
process.env.HF_NUM_INFERENCE_STEPS = String(safeSteps);
process.env.FAL_NUM_INFERENCE_STEPS = String(safeSteps);
console.log(`Image generation inference steps floor applied: ${safeSteps}`);
await import("./generate-isla-images.mjs");
