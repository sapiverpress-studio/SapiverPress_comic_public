import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const ROOT = process.cwd();
const CSV_PATH = "content/publishing-facts-daily-posts.csv";
const OUT_ROOT = "social/publishing-facts";
const BRAND = "Sapiver Press";
const DEFAULT_LINK = "https://sapiverpress.etsy.com";

function londonDateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function campaignDay(dateString) {
  const forced = Number.parseInt(process.env.FACT_DAY_OVERRIDE || "", 10);
  if (Number.isFinite(forced) && forced >= 1 && forced <= 365) return forced;
  const d = new Date(`${dateString}T12:00:00Z`);
  const start = new Date(`${d.getUTCFullYear()}-01-01T12:00:00Z`);
  const day = Math.floor((d - start) / 86400000) + 1;
  return ((day - 1) % 365) + 1;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i += 1; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter((r) => r.some((v) => String(v || "").trim())).map((r) => Object.fromEntries(headers.map((h, idx) => [h, r[idx] || ""])));
}

function escapeXml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function textBlock(lines, x, y, size, fill, weight = 600, lineHeight = 1.25) {
  return lines.map((line, idx) => `<text x="${x}" y="${y + idx * size * lineHeight}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`).join("\n");
}

function cardSvg({ day, theme, fact, context, cta }) {
  const factLines = wrapText(fact, 31).slice(0, 8);
  const contextLines = wrapText(context, 44).slice(0, 3);
  const ctaLines = wrapText(cta, 38).slice(0, 2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <rect width="1080" height="1350" fill="#F7F1E4"/>
  <rect x="54" y="54" width="972" height="1242" rx="38" fill="#FFFDF7" stroke="#D9B45F" stroke-width="6"/>
  <rect x="90" y="90" width="900" height="116" rx="24" fill="#0F3D3E"/>
  <text x="120" y="162" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800" fill="#F7F1E4">${escapeXml(BRAND)}</text>
  <text x="120" y="255" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#B4862C">PUBLISHING FACT ${String(day).padStart(3, "0")}</text>
  <text x="120" y="305" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#0F3D3E">${escapeXml(theme)}</text>
  <g font-family="Arial, Helvetica, sans-serif">
    ${textBlock(factLines, 120, 430, 54, "#102A2B", 800, 1.15)}
    <line x1="120" y1="900" x2="960" y2="900" stroke="#D9B45F" stroke-width="4"/>
    ${textBlock(contextLines, 120, 975, 35, "#233B3C", 500, 1.28)}
    <rect x="120" y="1135" width="840" height="92" rx="22" fill="#F7F1E4" stroke="#D9B45F" stroke-width="3"/>
    ${textBlock(ctaLines, 150, 1192, 31, "#0F3D3E", 700, 1.22)}
    <text x="120" y="1260" font-size="26" font-weight="700" fill="#0F3D3E">sapiverpress.etsy.com</text>
  </g>
</svg>`;
}

async function writeJson(rel, data) {
  const file = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const date = londonDateString();
  const day = campaignDay(date);
  const csv = await fs.readFile(path.join(ROOT, CSV_PATH), "utf8");
  const rows = parseCsv(csv);
  const row = rows.find((r) => Number(r.day) === day);
  if (!row) throw new Error(`No publishing fact row found for day ${day}`);

  const theme = row.theme || "Publishing Facts";
  const fact = row.fact || "";
  const context = "Publishing history is full of details that explain how books, rights, readers and products really work.";
  const ctas = [
    "Did you know this one?",
    "Which publishing fact surprised you most?",
    "Would you turn this into a post or product idea?",
    "What should more indie publishers know?"
  ];
  const cta = ctas[(day - 1) % ctas.length];
  const hashtags = "#PublishingFacts #IndiePublishing #BookHistory #SelfPublishing #SapiverPress";
  const link = process.env.PUBLISHING_FACT_LINK_URL || DEFAULT_LINK;
  const caption = `${fact}\n\n${context}\n\n${cta}\n\n${hashtags}`;

  const outDir = `${OUT_ROOT}/${date}`;
  const imageName = `publishing-fact-${String(day).padStart(3, "0")}.png`;
  const imagePath = `${outDir}/${imageName}`;
  await fs.mkdir(path.join(ROOT, outDir), { recursive: true });

  const svg = cardSvg({ day, theme, fact, context, cta });
  await sharp(Buffer.from(svg)).png().toFile(path.join(ROOT, imagePath));

  const manifest = {
    campaign: "publishing-facts-daily-posts",
    date,
    campaign_day: day,
    archive_dir: outDir,
    files: [imageName],
    post_order: [imageName],
    title: `Publishing Fact ${String(day).padStart(3, "0")}`,
    theme,
    fact,
    context,
    cta,
    caption,
    hashtags,
    link_url: link,
    alt_text: `A Sapiver Press branded daily publishing fact card. Fact ${day}: ${fact}`.slice(0, 500),
    product_referenced: { name: "Sapiver Press Publishing Systems", url: link },
    post_ready_contract: { posting_allowed: true, posting_block_reasons: [] }
  };

  await writeJson(`${outDir}/manifest.json`, manifest);
  await writeJson(`${OUT_ROOT}/latest/manifest.json`, manifest);
  console.log(`Built publishing fact ${day} for ${date}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
