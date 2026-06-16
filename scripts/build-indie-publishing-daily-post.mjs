import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const ROOT = process.cwd();
const CSV_PATH = "content/indie-publishing-daily-tips.csv";
const OUT_ROOT = "social/indie-publishing-tips";
const BRAND = "Sapiver Press";
const DEFAULT_LINK = "https://sapiverpress.etsy.com";

function londonDateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function dayOfYear(dateString) {
  const d = new Date(`${dateString}T12:00:00Z`);
  const start = new Date(`${d.getUTCFullYear()}-01-01T12:00:00Z`);
  return Math.floor((d - start) / 86400000) + 1;
}

function campaignDay(dateString) {
  const forced = Number.parseInt(process.env.TIP_DAY_OVERRIDE || "", 10);
  if (Number.isFinite(forced) && forced >= 1 && forced <= 365) return forced;
  const day = dayOfYear(dateString);
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
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows
    .filter((r) => r.some((v) => String(v || "").trim()))
    .map((r) => Object.fromEntries(headers.map((h, idx) => [h, r[idx] || ""])));
}

const contexts = {
  "Strategy & Positioning": [
    "This keeps the project focused on a real buyer outcome instead of another half-finished idea.",
    "Clear positioning makes the book easier to design, describe, and sell.",
    "A focused offer saves production time and makes the buyer decision simpler.",
    "This helps you build a catalogue instead of chasing disconnected ideas."
  ],
  "Market Research": [
    "Good research shows what buyers already want, what frustrates them, and where the gap is.",
    "Research is not copying; it is learning the rules of the shelf before you compete on it.",
    "Buyer language is often simpler and stronger than creator language.",
    "Market signals help you avoid building a product nobody is searching for."
  ],
  "Writing & Content": [
    "Useful content keeps the reader moving toward the promised result.",
    "A strong structure makes drafting faster and the final product easier to use.",
    "Clear content reduces confusion, refunds, and support questions later.",
    "The more practical the content, the easier it is to turn into a sellable asset."
  ],
  "Editing & QA": [
    "Quality control protects trust before the buyer ever leaves a review.",
    "Small errors become big problems when they appear on covers, titles, links, or upload files.",
    "A repeatable QA pass catches problems that rushed enthusiasm misses.",
    "Editing is not just polishing; it is risk reduction."
  ],
  "Design & Formatting": [
    "Design should help the buyer understand the offer quickly.",
    "Good formatting makes the book feel professional before the reader judges the content.",
    "A clean layout builds trust and reduces friction.",
    "Readable design usually beats decorative design."
  ],
  "Print & POD Production": [
    "Print files need manufacturing discipline, not guesswork.",
    "Most print problems are easier to prevent than fix after upload.",
    "A proper proofing workflow protects time, money, and buyer trust.",
    "Technical consistency makes future books faster to produce."
  ],
  "Metadata & Discoverability": [
    "Metadata helps the right buyer find and understand the product.",
    "Search visibility depends on clear wording, accurate categories, and buyer-focused copy.",
    "Good metadata turns a finished file into a discoverable product.",
    "If the metadata is vague, the product becomes harder to sell."
  ],
  "KDP & Amazon-Style Publishing": [
    "Platform checks are easier when your files and settings are organised before upload.",
    "KDP-style publishing rewards clean files, accurate metadata, and honest positioning.",
    "A repeatable upload process reduces rejections and avoidable mistakes.",
    "Treat every upload as a controlled production step."
  ],
  "Wide Distribution & ISBNs": [
    "Wider reach adds opportunity, but also more metadata and file-control responsibility.",
    "Distribution choices should match your goals, not just your ambition.",
    "ISBN and retailer records are part of your publishing infrastructure.",
    "Going wide works best after the product files are already proven."
  ],
  "Digital Products & Etsy": [
    "Digital buyers need clarity before and after purchase.",
    "A tidy delivery experience reduces confusion and support messages.",
    "The listing must make the file contents and limits obvious.",
    "Clear buyer instructions are part of the product."
  ],
  "Pricing & Money": [
    "Pricing should protect profit, not just chase sales.",
    "A product is only useful commercially if the numbers make sense.",
    "Revenue looks good; profit keeps the business alive.",
    "Simple pricing decisions become easier when costs and support time are visible."
  ],
  "Launch & Marketing": [
    "Marketing works better when the message shows the outcome, not just the product.",
    "Reusable launch assets keep promotion consistent without draining time.",
    "Each post should make the buyer problem, benefit, or next step clearer.",
    "Good marketing repeats the useful angle in fresh formats."
  ],
  "Reviews, Trust & Audience": [
    "Trust grows when the buyer experience matches the promise.",
    "Reviews often reveal what your listing and product are really communicating.",
    "A clear product creates fewer disappointed buyers and better long-term trust.",
    "Audience building is easier when every post is genuinely useful."
  ],
  "Legal, Rights & Admin": [
    "Rights and admin records protect the business from messy problems later.",
    "A clean evidence trail is easier to build now than reconstruct under pressure.",
    "Legal clarity keeps your product safer, cleaner, and easier to sell.",
    "Good admin is not glamorous, but it protects the catalogue."
  ],
  "Systems & Automation": [
    "Systems turn repeated work into a faster, safer publishing process.",
    "Automation works best after the manual checklist is already clear.",
    "A tidy workflow makes every future product easier to ship.",
    "This protects your time and reduces repeated decision-making."
  ]
};

const ctas = [
  "How would you apply this to your current publishing project?",
  "What would this change in your next book?",
  "Which part of your workflow needs this most?",
  "Have you already got this covered?",
  "What would you fix first?",
  "What is one small action you could take today?",
  "Where does this show up in your own publishing process?",
  "What would this save you time on?"
];

const hashtags = {
  "Strategy & Positioning": "#IndiePublishing #SelfPublishing #PublishingTips #AuthorBusiness #BookStrategy",
  "Market Research": "#MarketResearch #BookMarketing #IndiePublishing #SelfPublishing #PublishingTips",
  "Writing & Content": "#WritingTips #IndiePublishing #SelfPublishing #ContentCreation #PublishingTips",
  "Editing & QA": "#EditingTips #Proofreading #IndiePublishing #SelfPublishing #PublishingWorkflow",
  "Design & Formatting": "#BookDesign #BookFormatting #IndiePublishing #SelfPublishing #PublishingTips",
  "Print & POD Production": "#PrintOnDemand #KDP #IndiePublishing #SelfPublishing #PublishingWorkflow",
  "Metadata & Discoverability": "#BookMetadata #BookSEO #KDP #IndiePublishing #SelfPublishing",
  "KDP & Amazon-Style Publishing": "#KDP #AmazonKDP #SelfPublishing #IndiePublishing #PublishingTips",
  "Wide Distribution & ISBNs": "#ISBN #BookDistribution #IndiePublishing #SelfPublishing #PublishingTips",
  "Digital Products & Etsy": "#EtsySeller #DigitalProducts #IndiePublishing #SelfPublishing #SmallBusiness",
  "Pricing & Money": "#AuthorBusiness #PublishingBusiness #IndiePublishing #SelfPublishing #Pricing",
  "Launch & Marketing": "#BookMarketing #BookLaunch #IndiePublishing #SelfPublishing #ContentMarketing",
  "Reviews, Trust & Audience": "#BookReviews #AuthorPlatform #IndiePublishing #SelfPublishing #AudienceBuilding",
  "Legal, Rights & Admin": "#PublishingAdmin #Copyright #IndiePublishing #SelfPublishing #RightsManagement",
  "Systems & Automation": "#PublishingSystems #Automation #IndiePublishing #SelfPublishing #Workflow"
};

function pick(list, day) {
  return list[(day - 1) % list.length];
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textBlock(lines, x, y, size, fill, weight = 600, lineHeight = 1.25) {
  return lines.map((line, idx) => (
    `<text x="${x}" y="${y + idx * size * lineHeight}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`
  )).join("\n");
}

function cardSvg({ day, theme, tip, context, cta }) {
  const tipLines = wrapText(tip, 29).slice(0, 7);
  const contextLines = wrapText(context, 44).slice(0, 3);
  const ctaLines = wrapText(cta, 38).slice(0, 3);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <rect width="1080" height="1350" fill="#F7F1E4"/>
  <rect x="54" y="54" width="972" height="1242" rx="38" fill="#FFFDF7" stroke="#D9B45F" stroke-width="6"/>
  <rect x="90" y="90" width="900" height="116" rx="24" fill="#0F3D3E"/>
  <text x="120" y="162" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800" fill="#F7F1E4">${escapeXml(BRAND)}</text>
  <text x="120" y="255" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#B4862C">INDIE PUBLISHING TIP ${String(day).padStart(3, "0")}</text>
  <text x="120" y="305" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#0F3D3E">${escapeXml(theme)}</text>
  <g font-family="Arial, Helvetica, sans-serif">
    ${textBlock(tipLines, 120, 430, 58, "#102A2B", 800, 1.16)}
    <line x1="120" y1="860" x2="960" y2="860" stroke="#D9B45F" stroke-width="4"/>
    ${textBlock(contextLines, 120, 935, 36, "#233B3C", 500, 1.28)}
    <rect x="120" y="1105" width="840" height="112" rx="22" fill="#F7F1E4" stroke="#D9B45F" stroke-width="3"/>
    ${textBlock(ctaLines, 150, 1160, 31, "#0F3D3E", 700, 1.24)}
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
  if (!row) throw new Error(`No indie publishing tip row found for day ${day}`);

  const theme = row.theme || "Indie Publishing";
  const tip = row.tip || "";
  const context = pick(contexts[theme] || contexts["Strategy & Positioning"], day);
  const cta = pick(ctas, day);
  const tagLine = hashtags[theme] || "#IndiePublishing #SelfPublishing #PublishingTips";
  const link = process.env.INDIE_TIP_LINK_URL || DEFAULT_LINK;
  const caption = `${tip}\n\n${context}\n\n${cta}\n\n${tagLine}`;

  const outDir = `${OUT_ROOT}/${date}`;
  const imageName = `indie-publishing-tip-${String(day).padStart(3, "0")}.png`;
  const imagePath = `${outDir}/${imageName}`;
  await fs.mkdir(path.join(ROOT, outDir), { recursive: true });

  const svg = cardSvg({ day, theme, tip, context, cta });
  await sharp(Buffer.from(svg)).png().toFile(path.join(ROOT, imagePath));

  const manifest = {
    campaign: "indie-publishing-daily-tips",
    date,
    campaign_day: day,
    archive_dir: outDir,
    files: [imageName],
    post_order: [imageName],
    title: `Indie Publishing Tip ${String(day).padStart(3, "0")}`,
    theme,
    tip,
    context,
    cta,
    caption,
    hashtags: tagLine,
    link_url: link,
    alt_text: `A Sapiver Press branded daily indie publishing tip card. Tip ${day}: ${tip}`.slice(0, 500),
    product_referenced: {
      name: "Sapiver Press Indie Publishing Systems",
      url: link
    },
    post_ready_contract: {
      posting_allowed: true,
      posting_block_reasons: []
    }
  };

  await writeJson(`${outDir}/manifest.json`, manifest);
  await writeJson(`${OUT_ROOT}/latest/manifest.json`, manifest);

  console.log(`Built indie publishing daily tip ${day} for ${date}`);
  console.log(`Image: ${imagePath}`);
  console.log(`Caption:\n${caption}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
