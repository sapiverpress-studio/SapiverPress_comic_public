import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const ROOT = process.cwd();
const HF_TOKEN = process.env.HF_TOKEN?.trim() || "";
const FAL_KEY = process.env.FAL_KEY?.trim() || "";
const HF_PREFLIGHT_REPO = process.env.HF_LORA_REPO?.trim() || "sapiverpress/sapiverpress-isla-lora";
const LORA_FILE = process.env.HF_LORA_FILE?.trim() || "Isla_v2_1780410778059.safetensors";
const LORA_URL = process.env.HF_LORA_URL?.trim() || `https://huggingface.co/${HF_PREFLIGHT_REPO}/resolve/main/${encodeURIComponent(LORA_FILE)}`;
const TRIGGER = process.env.HF_LORA_TRIGGER?.trim() || "ISLA_SP";
const FAL_MODEL = process.env.FAL_MODEL?.trim() || "fal-ai/z-image/turbo/lora";
const HF_FALLBACK_MODEL = process.env.HF_FALLBACK_MODEL?.trim() || "stabilityai/stable-diffusion-xl-base-1.0";
const WIDTH = Number(process.env.HF_IMAGE_WIDTH || process.env.FAL_IMAGE_WIDTH || 1024);
const HEIGHT = Number(process.env.HF_IMAGE_HEIGHT || process.env.FAL_IMAGE_HEIGHT || 1024);
const STEPS = Number(process.env.HF_NUM_INFERENCE_STEPS || process.env.FAL_NUM_INFERENCE_STEPS || 28);
const GUIDANCE = Number(process.env.HF_GUIDANCE_SCALE || process.env.FAL_GUIDANCE_SCALE || 3.5);
const LORA_SCALE = Number(process.env.HF_LORA_SCALE || process.env.FAL_LORA_SCALE || 1.0);
const FAL_TIMEOUT_MS = Number(process.env.FAL_TIMEOUT_MS || 180000);
const HF_TIMEOUT_MS = Number(process.env.HF_TIMEOUT_MS || 120000);

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

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function fetchErrorDetails(error) {
  const cause = error?.cause || {};
  return {
    message: error?.message || String(error),
    name: error?.name || "Error",
    cause_message: cause?.message || "",
    cause_code: cause?.code || "",
    cause_errno: cause?.errno || "",
    cause_syscall: cause?.syscall || "",
    cause_hostname: cause?.hostname || cause?.host || "",
    cause_address: cause?.address || "",
    cause_port: cause?.port || "",
  };
}

async function fetchWithDiagnostics(url, options = {}, timeoutMs = 120000) {
  const started = Date.now();
  const timeout = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: timeout.signal });
    return response;
  } catch (error) {
    const details = fetchErrorDetails(error);
    const hostname = new URL(url).hostname;
    throw new Error(`Network fetch failed for ${hostname} after ${Date.now() - started}ms: ${JSON.stringify(details)}`);
  } finally {
    timeout.clear();
  }
}

function loraDescriptor() {
  return {
    path: LORA_URL,
    scale: LORA_SCALE,
  };
}

function falInput(prompt, negativePrompt) {
  return {
    prompt,
    image_size: { width: WIDTH, height: HEIGHT },
    num_inference_steps: STEPS,
    guidance_scale: GUIDANCE,
    num_images: 1,
    enable_safety_checker: true,
    output_format: "png",
    loras: [loraDescriptor()],
    negative_prompt: negativePrompt,
  };
}

function hfFallbackBody(prompt, negativePrompt) {
  return {
    inputs: prompt,
    parameters: {
      width: WIDTH,
      height: HEIGHT,
      num_inference_steps: Math.min(STEPS, 30),
      guidance_scale: Math.max(GUIDANCE, 7.0),
      negative_prompt: negativePrompt,
    },
    options: { wait_for_model: true, use_cache: false },
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try { return { json: text ? JSON.parse(text) : null, text }; } catch { return { json: null, text }; }
}

async function preflightHf(summary) {
  if (!HF_TOKEN) {
    summary.preflight.hf_token = { ok: false, reason: "HF_TOKEN missing" };
    return;
  }
  try {
    const response = await fetchWithDiagnostics("https://huggingface.co/api/whoami-v2", {
      method: "GET",
      headers: { Authorization: `Bearer ${HF_TOKEN}` },
    }, 30000);
    const body = await parseJsonResponse(response);
    summary.preflight.hf_token = {
      ok: response.ok,
      status: response.status,
      status_text: response.statusText,
      name: body.json?.name || body.json?.auth?.accessToken?.displayName || "",
      error: response.ok ? "" : body.text.slice(0, 600),
    };
    console.log(`HF token preflight: ${response.status} ${response.statusText}`);
  } catch (error) {
    summary.preflight.hf_token = { ok: false, error: error.message };
    console.log(`HF token preflight failed: ${error.message}`);
  }

  try {
    const modelResponse = await fetchWithDiagnostics(`https://huggingface.co/api/models/${encodeURIComponent(HF_PREFLIGHT_REPO).replace(/%2F/g, "/")}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${HF_TOKEN}` },
    }, 30000);
    const body = await parseJsonResponse(modelResponse);
    summary.preflight.hf_lora_repo = {
      ok: modelResponse.ok,
      status: modelResponse.status,
      status_text: modelResponse.statusText,
      id: body.json?.id || "",
      private: Boolean(body.json?.private),
      error: modelResponse.ok ? "" : body.text.slice(0, 600),
    };
    console.log(`HF LoRA repo preflight: ${modelResponse.status} ${modelResponse.statusText}`);
  } catch (error) {
    summary.preflight.hf_lora_repo = { ok: false, error: error.message };
    console.log(`HF LoRA repo preflight failed: ${error.message}`);
  }
}

async function requestFalImage(prompt, negativePrompt) {
  if (!FAL_KEY) throw new Error("FAL_KEY missing; cannot call fal-ai/z-image/turbo/lora directly.");
  const url = `https://fal.run/${FAL_MODEL}`;
  const response = await fetchWithDiagnostics(url, {
    method: "POST",
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(falInput(prompt, negativePrompt)),
  }, FAL_TIMEOUT_MS);

  const body = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`fal ${FAL_MODEL} failed ${response.status} ${response.statusText}: ${body.text.slice(0, 1000)}`);
  }

  const imageUrl = body.json?.images?.[0]?.url;
  if (!imageUrl) throw new Error(`fal ${FAL_MODEL} returned no image URL: ${body.text.slice(0, 1000)}`);

  const imageResponse = await fetchWithDiagnostics(imageUrl, { method: "GET" }, FAL_TIMEOUT_MS);
  const imageType = imageResponse.headers.get("content-type") || "";
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  if (!imageResponse.ok) throw new Error(`fal image download failed ${imageResponse.status}: ${bytes.toString("utf8").slice(0, 500)}`);
  if (!imageType.startsWith("image/") && bytes.length < 1000) throw new Error(`fal image download was not a usable image. Content-Type: ${imageType || "unknown"}`);
  return { bytes, model: FAL_MODEL, provider: "fal", remote_url: imageUrl };
}

async function requestHfFallbackImage(prompt, negativePrompt) {
  if (!HF_TOKEN) throw new Error("HF_TOKEN missing; cannot call Hugging Face fallback.");
  const url = `https://api-inference.huggingface.co/models/${encodeURIComponent(HF_FALLBACK_MODEL).replace(/%2F/g, "/")}`;
  const response = await fetchWithDiagnostics(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "image/png,image/jpeg,application/json",
    },
    body: JSON.stringify(hfFallbackBody(prompt, negativePrompt)),
  }, HF_TIMEOUT_MS);

  const contentType = response.headers.get("content-type") || "";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`HF fallback ${HF_FALLBACK_MODEL} failed ${response.status} ${response.statusText}: ${bytes.toString("utf8").slice(0, 1000)}`);
  if (contentType.includes("application/json")) throw new Error(`HF fallback ${HF_FALLBACK_MODEL} returned JSON instead of image: ${bytes.toString("utf8").slice(0, 1000)}`);
  if (!contentType.startsWith("image/") && bytes.length < 1000) throw new Error(`HF fallback ${HF_FALLBACK_MODEL} did not return a usable image. Content-Type: ${contentType || "unknown"}`);
  return { bytes, model: HF_FALLBACK_MODEL, provider: "hf-fallback", remote_url: "" };
}

async function generateImage(prompt, negativePrompt) {
  try {
    return await requestFalImage(prompt, negativePrompt);
  } catch (falError) {
    console.log(`fal.ai generation failed for this panel; trying HF SDXL fallback. ${falError.message}`);
    const hfResult = await requestHfFallbackImage(prompt, negativePrompt);
    hfResult.fal_error = falError.message;
    return hfResult;
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
    route: FAL_KEY ? "fal-ai-z-image-turbo-lora-first" : "hf-fallback-only",
    fal_model: FAL_MODEL,
    hf_fallback_model: HF_FALLBACK_MODEL,
    lora_file: LORA_FILE,
    lora_url: LORA_URL,
    lora_url_mode: process.env.HF_LORA_URL ? "env_override" : "hf_repo_default",
    lora_auth: "not_sent_public_repo",
    trigger_word: TRIGGER,
    requested_panels: 6,
    generated_count: 0,
    generated_panels: [],
    fallback_template_panels: [],
    errors: [],
    preflight: {},
  };

  await preflightHf(summary);

  if (!promptPack) {
    const reason = "prompt pack missing";
    summary.errors.push(reason);
    summary.fallback_template_panels = PANEL_FILES.map((name, i) => ({ panel_number: i + 1, image_name: name, reason }));
    await writeSummary(datedDir, latestDir, summary);
    console.log("Prompt pack missing. Image generation skipped; compositor will use fallback template art.");
    console.log("Image generation: 0/6 panels generated successfully");
    console.log("Panels using generated art: []");
    console.log(`Panels using fallback template: ${PANEL_FILES.join(", ")}`);
    return;
  }

  if (!FAL_KEY && !HF_TOKEN) {
    const reason = "FAL_KEY and HF_TOKEN both missing";
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
      summary.generated_panels.push({
        panel_number: panel.panel_number,
        image_name: panel.image_name,
        provider: result.provider,
        model: result.model,
        output: `art-replacements/${date}/${panel.image_name}`,
        remote_url: result.remote_url || "",
        fal_error: result.fal_error || "",
      });
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
