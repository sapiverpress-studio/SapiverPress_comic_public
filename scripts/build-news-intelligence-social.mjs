import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const bridgeRoot = path.resolve(process.env.NEWS_BRIDGE_ROOT || "vendor/sapiver-forge/bridge/news-intelligence/latest");
const manifestPath = path.join(bridgeRoot, "manifest.json");
const hashesPath = path.join(bridgeRoot, "file-hashes.json");
const expectedDate = String(process.env.DATE_OVERRIDE || "").trim();

if (!fs.existsSync(manifestPath)) throw new Error(`News intelligence bridge missing: ${manifestPath}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.schema_version !== 1 || manifest.type !== "sapiver_forge_news_intelligence") throw new Error("Unsupported Sapiver Forge news intelligence bridge.");
if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.date || "")) throw new Error("Bridge date is invalid.");
if (expectedDate && manifest.date !== expectedDate) throw new Error(`Bridge is stale: expected ${expectedDate}, found ${manifest.date}.`);
if (manifest.approved_for_automatic_distribution !== false) throw new Error("Current-news bridge approval contract changed unexpectedly.");
if (manifest.newsletter_ready_for_human_approval !== true || Number(manifest.overall_confidence || 0) < 0.78) throw new Error("News bridge is not verification-ready for secondary output.");
if (!Array.isArray(manifest.stories) || !manifest.stories.length) throw new Error("Bridge contains no stories.");

if (fs.existsSync(hashesPath)) {
  const hashes = JSON.parse(fs.readFileSync(hashesPath, "utf8"));
  for (const [name, expected] of Object.entries(hashes)) {
    const file = path.join(bridgeRoot, name);
    if (!fs.existsSync(file)) throw new Error(`Bridge hash file is missing ${name}.`);
    const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    if (actual !== expected) throw new Error(`Bridge integrity check failed for ${name}.`);
  }
}

const out = path.join(ROOT, "social", "news-intelligence", manifest.date);
fs.mkdirSync(out, { recursive: true });
const social = manifest.social || JSON.parse(fs.readFileSync(path.join(bridgeRoot, "social.json"), "utf8"));
const lead = manifest.stories[0];
const xml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
})[character]);

function wrapHeadline(value, max = 27, maxLines = 5) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > max && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (words.join(" ").length > lines.join(" ").length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.…]+$/, "")}…`;
  return lines;
}

const lines = wrapHeadline(lead.headline || social.lead_headline);
const lineSvg = lines.map((line, index) => `<text x="84" y="${420 + index * 92}" font-size="70" font-weight="750" fill="#f5f7f8">${xml(line)}</text>`).join("\n");
const sourceLabel = `${lead.source || "Verified source"} · verification-ready draft`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
<rect width="1080" height="1350" fill="#071827"/>
<rect x="0" y="0" width="18" height="1350" fill="#e2b85b"/>
<text x="84" y="112" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="700" fill="#e2b85b" letter-spacing="4">SAPIVER FORGE</text>
<text x="84" y="170" font-family="Arial,Helvetica,sans-serif" font-size="28" fill="#c9d4dc" letter-spacing="2">DAILY BRIEF · ${xml(manifest.date)}</text>
<line x1="84" y1="238" x2="996" y2="238" stroke="#345069" stroke-width="2"/>
<text x="84" y="330" font-family="Arial,Helvetica,sans-serif" font-size="27" fill="#e2b85b" letter-spacing="3">AI · TECHNOLOGY · BUSINESS</text>
<g font-family="Arial,Helvetica,sans-serif">${lineSvg}</g>
<text x="84" y="1045" font-family="Arial,Helvetica,sans-serif" font-size="26" fill="#c9d4dc">${xml(sourceLabel)}</text>
<line x1="84" y1="1100" x2="996" y2="1100" stroke="#345069" stroke-width="2"/>
<text x="84" y="1174" font-family="Arial,Helvetica,sans-serif" font-size="31" font-weight="700" fill="#f5f7f8">What changed. Why it matters.</text>
<text x="84" y="1227" font-family="Arial,Helvetica,sans-serif" font-size="26" fill="#c9d4dc">Confirmed reporting separated from interpretation.</text>
<text x="84" y="1294" font-family="Arial,Helvetica,sans-serif" font-size="24" fill="#e2b85b">Sapiver Forge Daily Brief</text>
</svg>`;

const imagePath = path.join(out, "daily-brief-card.png");
await sharp(Buffer.from(svg)).png().toFile(imagePath);

const write = (name, content) => fs.writeFileSync(path.join(out, name), String(content || "").trim() + "\n", "utf8");
write("facebook-post.txt", social.facebook_post);
write("pinterest-title.txt", social.pinterest_title);
write("pinterest-caption.txt", social.pinterest_description);
write("tiktok-caption.txt", social.tiktok_caption);
write("spoken-script.txt", social.spoken_script);

const outputManifest = {
  type: "sapiver_forge_news_intelligence_social",
  schema_version: 1,
  date: manifest.date,
  source_candidate_id: manifest.candidate_id,
  source_confidence: manifest.overall_confidence,
  posting_allowed: false,
  human_approval_required: true,
  reason: "Current news is generated as a secondary social package but is not auto-posted without human approval.",
  image: path.relative(ROOT, imagePath).replaceAll("\\", "/"),
  files: {
    facebook: path.relative(ROOT, path.join(out, "facebook-post.txt")).replaceAll("\\", "/"),
    pinterest_title: path.relative(ROOT, path.join(out, "pinterest-title.txt")).replaceAll("\\", "/"),
    pinterest_caption: path.relative(ROOT, path.join(out, "pinterest-caption.txt")).replaceAll("\\", "/"),
    tiktok_caption: path.relative(ROOT, path.join(out, "tiktok-caption.txt")).replaceAll("\\", "/"),
    spoken_script: path.relative(ROOT, path.join(out, "spoken-script.txt")).replaceAll("\\", "/")
  }
};
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(outputManifest, null, 2) + "\n", "utf8");
console.log(`Built secondary Sapiver Forge news social package for ${manifest.date}. Posting remains human-gated.`);
