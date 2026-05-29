import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const API_KEY = process.env.ISLA_ELEVEN?.trim() || process.env.ELEVENLABS_API_KEY?.trim() || "";
const VOICE_NAME = process.env.ELEVENLABS_VOICE_NAME || "Isla Sterling";
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID?.trim() || process.env.ISLA_ELEVEN_VOICE_ID?.trim() || "qSR2T7SqN7Pcd0YpO3Vd";
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  const base = override ? new Date(`${override}T12:00:00Z`) : new Date();
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(base);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
async function mkdir(dir) { await fs.mkdir(dir, { recursive: true }); }
async function readJson(file, fallback = null) { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; } }
async function writeJson(file, data) { await mkdir(path.dirname(file)); await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }
async function copyIfExists(src, dst) { try { await mkdir(path.dirname(dst)); await fs.copyFile(src, dst); } catch {} }
async function readManifest(file) { return readJson(file, {}); }
async function writeManifest(file, patch) { const current = await readManifest(file); await writeJson(file, { ...current, ...patch, generated_at: current.generated_at || new Date().toISOString() }); }
async function parseJsonResponse(response) { const text = await response.text(); try { return { json: text ? JSON.parse(text) : null, text }; } catch { return { json: null, text }; } }

async function getVoiceId() {
  if (VOICE_ID) return VOICE_ID;
  const response = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": API_KEY } });
  const body = await parseJsonResponse(response);
  if (!response.ok) throw new Error(`ElevenLabs voices failed ${response.status}: ${body.text.slice(0, 600)}`);
  const voices = body.json?.voices || [];
  const match = voices.find((v) => String(v.name || "").trim().toLowerCase() === VOICE_NAME.toLowerCase());
  if (!match?.voice_id) {
    const names = voices.map((v) => v.name).filter(Boolean).join(", ");
    throw new Error(`Voice not found: ${VOICE_NAME}. Available voices: ${names || "none"}`);
  }
  return match.voice_id;
}

async function makeVoice(voiceId, text) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
    }),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`ElevenLabs speech failed ${response.status}: ${bytes.toString("utf8").slice(0, 700)}`);
  if (bytes.length < 1000) throw new Error("ElevenLabs returned an unexpectedly small audio file");
  return bytes;
}

async function main() {
  const date = dateString();
  const dir = path.join(ROOT, "social", date, "short-video");
  const latest = path.join(ROOT, "social", "latest", "short-video");
  const manifestFile = path.join(dir, "manifest.json");
  await mkdir(dir);

  if (!API_KEY) {
    await writeManifest(manifestFile, { status: "voice_failed", voice_name: VOICE_NAME, voice_id: VOICE_ID, error: "ISLA_ELEVEN or ELEVENLABS_API_KEY missing" });
    console.log("Voice generation skipped: API key missing");
    return;
  }

  const narration = await readJson(path.join(dir, "narration.json"), await readJson(path.join(latest, "narration.json"), null));
  if (!narration?.full_text) throw new Error("Missing short-video narration.json/full_text");

  const voiceId = await getVoiceId();
  const audio = await makeVoice(voiceId, narration.full_text);
  const audioPath = path.join(dir, "voiceover.mp3");
  await fs.writeFile(audioPath, audio);
  await copyIfExists(audioPath, path.join(latest, "voiceover.mp3"));
  await writeManifest(manifestFile, { status: "voice_ready", voice_name: VOICE_NAME, voice_id: voiceId, audio_file: `social/${date}/short-video/voiceover.mp3` });
  await copyIfExists(manifestFile, path.join(latest, "manifest.json"));
  console.log(`Voiceover written: social/${date}/short-video/voiceover.mp3`);
}

main().catch(async (error) => {
  const date = (() => { try { return dateString(); } catch { return "unknown-date"; } })();
  const dir = path.join(ROOT, "social", date, "short-video");
  await mkdir(dir);
  await writeManifest(path.join(dir, "manifest.json"), { status: "voice_failed", voice_name: VOICE_NAME, voice_id: VOICE_ID, error: error?.message || String(error) });
  console.log(`Voice generation failed safely: ${error?.message || error}`);
  process.exit(0);
});
