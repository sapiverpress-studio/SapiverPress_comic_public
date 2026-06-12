import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const PLATFORM = (process.env.FTPE_SOCIAL_PLATFORM || "all").toLowerCase();
const POST_MODE = (process.env.FTPE_SOCIAL_POST_MODE || "dry_run").toLowerCase();
const MANIFEST = path.join(ROOT, "social", "ftpe", DATE, "manifest.json");

function allowed(output) {
  return PLATFORM === "all" || output.platform === PLATFORM;
}

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const outputs = (manifest.outputs || []).filter(allowed);
if (!outputs.length) {
  console.log(`No FTPE outputs to post for platform=${PLATFORM}`);
  process.exit(0);
}

for (const output of outputs) {
  const copy = await fs.readFile(path.join(ROOT, output.copy_file), "utf8");
  const postRecord = {
    date: DATE,
    platform: output.platform,
    mode: POST_MODE,
    image: output.image,
    copy_file: output.copy_file,
    title: output.title,
    copy,
  };
  const outPath = path.join(ROOT, "social", "ftpe", DATE, output.platform, `${DATE}_${output.platform}_post-record.json`);
  await fs.writeFile(outPath, `${JSON.stringify(postRecord, null, 2)}\n`, "utf8");

  if (POST_MODE !== "live") {
    console.log(`[DRY RUN] FTPE ${output.platform} post prepared: ${output.image}`);
    continue;
  }

  // Live platform posting is intentionally not enabled here until the exact
  // Facebook/Pinterest/TikTok secrets and target accounts are confirmed.
  // This prevents accidental posts while still producing deterministic daily assets.
  throw new Error(`FTPE live posting for ${output.platform} is not enabled in this script yet. Keep FTPE_SOCIAL_POST_MODE=dry_run or add platform-specific posting code.`);
}
