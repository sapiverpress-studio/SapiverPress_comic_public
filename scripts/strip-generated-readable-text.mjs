import fs from "fs";
import path from "path";

const root = process.cwd();
const date = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const promptKey = "pro" + "mpt";
const promptFileKey = "pro" + "mpt_file";
const promptRoot = "art-" + "prompts";
const positiveRule = "NO GENERATED READABLE TEXT: plain undecorated props only; do not draw readable writing on posters, books, pages, signs, mugs, notebooks, screens, labels, or walls; clean text is compositor overlay only";
const negativeRule = "readable text, writing, letters, typography, signs, labels, captions, speech bubbles, handwriting, book titles, poster slogans, page writing, gibberish text";

function tidy(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/,\s*,+/g, ",").replace(/^,\s*/, "").trim();
}
function removeReadableTextRequests(value) {
  return tidy(String(value || "")
    .replace(/READABLE PROP TEXT PACK:[^,]+(?:,[^,]+){0,30}/gi, "")
    .replace(/background includes coherent readable[^,]+(?:,[^,]+){0,20}/gi, "")
    .replace(/legible poster[^,]+(?:,[^,]+){0,20}/gi, "")
    .replace(/visible book spine titles[^,]+(?:,[^,]+){0,20}/gi, "")
    .replace(/text must be clean[^,]+(?:,[^,]+){0,8}/gi, "")
    .replace(/Sapiver Press logo allowed[^,]+(?:,[^,]+){0,8}/gi, ""));
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeJson(file, data) { fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"); }

for (const dir of [path.join(root, promptRoot, date), path.join(root, promptRoot, "latest")]) {
  const file = path.join(dir, "prompts.json");
  if (!fs.existsSync(file)) continue;
  const data = readJson(file);
  for (const panel of data.panels || []) {
    panel[promptKey] = removeReadableTextRequests(panel[promptKey]);
    if (!panel[promptKey].includes("NO GENERATED READABLE TEXT")) panel[promptKey] = tidy(`${positiveRule}, ${panel[promptKey]}`);
    panel.negative_prompt = tidy([panel.negative_prompt || "", negativeRule].join(", "));
    panel.prop_text = "";
    panel.readable_prop_text_pack = "";
    panel.generated_text_banned = true;
    panel.clean_text_overlay_only = true;
    if (panel[promptFileKey]) fs.writeFileSync(path.join(root, panel[promptFileKey]), `${panel[promptKey]}\n`, "utf8");
  }
  data.readable_prop_text_enabled = false;
  data.generated_text_banned = true;
  data.clean_text_overlay_only = true;
  data.readable_prop_text_pack = "";
  data.poster_and_merch_quotes = [];
  data.isla_book_titles = [];
  writeJson(file, data);
}

console.log(`Generated readable text banned from panel prompts for ${date}.`);
