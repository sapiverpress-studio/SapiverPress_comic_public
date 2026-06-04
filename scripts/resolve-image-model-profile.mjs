import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, "config", "image-model-registry.json");
const PANEL_FILES = ["01_panel-01.png", "02_panel-02.png", "03_panel-03.png", "04_panel-04.png", "05_panel-05.png", "06_panel-06.png"];
const LEGACY_TRIGGERS = ["ISLA_SP"];
const LEGACY_LORA_FILES = ["ISLA_SP_1779957190206.safetensors"];

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
function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function lower(value) { return clean(value).toLowerCase(); }
function activeProfiles(registry) {
  return (registry.profiles || []).filter((profile) => profile.status === "active");
}
function profileById(registry, id) {
  return (registry.profiles || []).find((profile) => profile.profile_id === id);
}
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function sanitizeLegacyText(value) {
  let text = String(value || "");
  for (const term of LEGACY_LORA_FILES) text = text.replace(new RegExp(escapeRegExp(term), "g"), "legacy lora file");
  for (const term of LEGACY_TRIGGERS) text = text.replace(new RegExp(`\\b${escapeRegExp(term)}\\b`, "g"), "legacy trigger text");
  return text;
}
function sanitizeLegacyRefs(value) {
  if (typeof value === "string") return sanitizeLegacyText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeLegacyRefs(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeLegacyRefs(item)]));
  return value;
}
function textForPanel(panel) {
  return lower([
    panel.prompt,
    panel.caption,
    panel.scene_id,
    panel.story_beat,
    panel.location_key,
    panel.location_text,
    panel.environment_text,
    panel.pose_text,
    panel.prop_text,
    panel.screen_requirement,
  ].filter(Boolean).join(" "));
}
function hasAny(text, terms = []) {
  return terms.some((term) => text.includes(lower(term)));
}
function visibleCharacters(panel, registry) {
  const text = textForPanel(panel);
  const found = new Set(["isla"]);
  for (const [key, character] of Object.entries(registry.known_characters || {})) {
    if (key === "isla") continue;
    if (hasAny(text, character.aliases || [])) found.add(key);
  }
  return Array.from(found);
}
function profileMatchesVisibleCast(profile, visible) {
  const keys = new Set(profile.character_keys || []);
  return visible.length === keys.size && visible.every((key) => keys.has(key));
}
function profileHasRequiredContext(profile, text) {
  const requiredAny = profile.required_context_any || [];
  return !requiredAny.length || hasAny(text, requiredAny);
}
function chooseProfile(panel, registry) {
  const text = textForPanel(panel);
  const visible = visibleCharacters(panel, registry);
  const active = activeProfiles(registry);
  const exact = active.find((profile) => profileMatchesVisibleCast(profile, visible) && profileHasRequiredContext(profile, text));
  if (exact) return { profile: exact, visible, reason: "exact_visible_cast_match" };
  const defaultProfile = profileById(registry, registry.default_profile_id) || active[0];
  return { profile: defaultProfile, visible, reason: visible.length > 1 ? "no_active_exact_cast_profile_fallback_to_default" : "default_single_character_profile" };
}
function stripKnownTriggers(value, registry) {
  let text = clean(value);
  const triggers = new Set([...LEGACY_TRIGGERS, ...(registry.profiles || []).map((profile) => profile.trigger_word).filter(Boolean)]);
  for (const trigger of triggers) {
    if (!trigger || trigger.includes("ADD_")) continue;
    text = text.replace(new RegExp(`\\b${trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b,?\\s*`, "g"), "");
  }
  return clean(text).replace(/^,\s*/, "");
}
function prependTrigger(prompt, profile, registry) {
  const base = stripKnownTriggers(sanitizeLegacyText(prompt), registry);
  const trigger = profile.prompt_prefix || profile.trigger_word;
  return base ? `${trigger}, ${base}` : trigger;
}
function modelForPanel(panel, registry) {
  const chosen = chooseProfile(panel, registry);
  return {
    profile_id: chosen.profile.profile_id,
    label: chosen.profile.label,
    selection_reason: chosen.reason,
    visible_character_keys: chosen.visible,
    fal_model: chosen.profile.fal_model,
    hf_lora_repo: chosen.profile.hf_lora_repo,
    lora_file: chosen.profile.lora_file,
    trigger_word: chosen.profile.trigger_word,
    lora_scale: chosen.profile.lora_scale,
    steps: chosen.profile.steps,
    width: chosen.profile.width,
    height: chosen.profile.height,
  };
}
function assertNoLegacy(payload) {
  const text = JSON.stringify(payload);
  const found = [...LEGACY_TRIGGERS, ...LEGACY_LORA_FILES].filter((term) => text.includes(term));
  if (found.length) throw new Error(`Legacy Isla model reference still present in routed prompt payload: ${[...new Set(found)].join(", ")}`);
}

const date = londonDateString();
const registry = await readJson(REGISTRY_PATH, null);
if (!registry) throw new Error("Missing config/image-model-registry.json");
const promptPath = path.join(ROOT, "art-prompts", date, "prompts.json");
const latestPromptPath = path.join(ROOT, "art-prompts", "latest", "prompts.json");
const rawPrompts = await readJson(promptPath, await readJson(latestPromptPath, null));
if (!rawPrompts) throw new Error(`Missing art prompt payload for ${date}`);
const prompts = sanitizeLegacyRefs(rawPrompts);

const panels = (Array.isArray(prompts.panels) ? prompts.panels : []).map((panel, index) => {
  const model = modelForPanel(panel, registry);
  const profile = profileById(registry, model.profile_id);
  return {
    ...panel,
    prompt: prependTrigger(panel.prompt, profile, registry),
    model_profile: model,
  };
});
while (panels.length < PANEL_FILES.length) {
  const panel = { panel_number: panels.length + 1, image_name: PANEL_FILES[panels.length], prompt: "" };
  const model = modelForPanel(panel, registry);
  const profile = profileById(registry, model.profile_id);
  panels.push({ ...panel, prompt: prependTrigger(panel.prompt, profile, registry), model_profile: model });
}

const routed = {
  ...prompts,
  model_registry_version: registry.version,
  model_registry_path: "config/image-model-registry.json",
  model_routing_enabled: true,
  lora: modelForPanel(panels[0], registry),
  panels,
  generated_at: prompts.generated_at || new Date().toISOString(),
  model_routed_at: new Date().toISOString(),
};
assertNoLegacy(routed);
await writeJson(promptPath, routed);
await writeJson(latestPromptPath, routed);
const routeSummary = panels.map((panel) => `${panel.image_name}:${panel.model_profile.profile_id}:${panel.model_profile.trigger_word}`).join(" | ");
console.log(`Image model routing complete: ${routeSummary}`);
