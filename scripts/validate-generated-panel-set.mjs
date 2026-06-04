import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();

function dateString() {
  const override = process.env.DATE_OVERRIDE || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function exists(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile() && stat.size > 1000;
  } catch {
    return false;
  }
}

const REQUIRED = [
  "01_panel-01.png",
  "02_panel-02.png",
  "03_panel-03.png",
  "04_panel-04.png",
  "05_panel-05.png",
  "06_panel-06.png",
];

async function main() {
  const date = dateString();
  const replacementDir = path.join(ROOT, "art-replacements", date);
  const latestDir = path.join(ROOT, "art-replacements", "latest");
  const missing = [];
  const present = [];

  for (const name of REQUIRED) {
    const dated = path.join(replacementDir, name);
    if (await exists(dated)) present.push(`art-replacements/${date}/${name}`);
    else missing.push(`art-replacements/${date}/${name}`);
  }

  const latestPresent = [];
  for (const name of REQUIRED) {
    if (await exists(path.join(latestDir, name))) latestPresent.push(`art-replacements/latest/${name}`);
  }

  const report = {
    date,
    status: missing.length ? "failed_missing_generated_panels" : "ok_generated_panels_complete",
    required_count: REQUIRED.length,
    present_count: present.length,
    missing_count: missing.length,
    present,
    missing,
    latest_fallback_images_detected: latestPresent,
    rule: "Compositor must only use date-specific generated replacement art. Latest/template fallback art is not allowed for preview publication.",
    checked_at: new Date().toISOString(),
  };

  await fs.mkdir(path.join(ROOT, "art-replacements", date), { recursive: true });
  await fs.writeFile(path.join(ROOT, "art-replacements", date, "generated-panel-validation.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (missing.length) {
    console.error("STRICT PANEL VALIDATION FAILED");
    console.error(`Generated panels present: ${present.length}/${REQUIRED.length}`);
    console.error("Missing date-specific generated panels:");
    for (const item of missing) console.error(`- ${item}`);
    if (latestPresent.length) {
      console.error("Latest fallback images exist, but are deliberately ignored:");
      for (const item of latestPresent) console.error(`- ${item}`);
    }
    console.error("Stopping before compose so mixed original/fallback preview assets cannot be published.");
    process.exit(1);
  }

  console.log(`Generated panel validation passed: ${present.length}/${REQUIRED.length} date-specific replacement panels found for ${date}.`);
}

main().catch((error) => {
  console.error(`Generated panel validation crashed: ${error?.message || error}`);
  process.exit(1);
});
