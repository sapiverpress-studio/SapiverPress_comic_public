import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const SIX_PANEL_FILES = [
  "01_panel-01.png",
  "02_panel-02.png",
  "03_panel-03.png",
  "04_panel-04.png",
  "05_panel-05.png",
  "06_panel-06.png",
];

const PRODUCT_AD_REMOVE = [
  "00_start-grid.png",
  "07_finished-grid.png",
];

async function readJson(rel, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(rel, data) {
  const file = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function rmIfExists(rel) {
  try {
    await fs.rm(path.join(ROOT, rel), { force: true });
  } catch {
    // ignore missing files
  }
}

function isProductAd(story, manifest) {
  return Boolean(
    story?.product_ad_contract?.enabled ||
    story?.puzzle_state?.ad_mode ||
    manifest?.product_ad_contract?.enabled ||
    manifest?.active_campaign_id === "isla_puzzle_book_publisher"
  );
}

function trimManifest(manifest, story) {
  const next = {
    ...manifest,
    format: "six_panel_product_ad_story",
    product_ad_output_mode: "six_panel_ad_only",
    files: SIX_PANEL_FILES,
    post_order: SIX_PANEL_FILES,
    puzzle_clips_removed: true,
    puzzle_clip_removal_reason: "Product-ad campaign uses Isla publishing story only; daily start/finished puzzle clips would contradict the advert.",
  };
  next.captions = Array.isArray(next.captions) ? next.captions.slice(0, 6) : next.captions;
  if (story?.product_referenced) next.product_referenced = story.product_referenced;
  if (story?.product_ad_contract) next.product_ad_contract = story.product_ad_contract;
  if (story?.campaign_strategy) next.campaign_strategy = story.campaign_strategy;
  if (story?.active_campaign_id) next.active_campaign_id = story.active_campaign_id;
  if (story?.active_ad_material_id) next.active_ad_material_id = story.active_ad_material_id;
  return next;
}

async function trimFolder(folderRel) {
  for (const name of PRODUCT_AD_REMOVE) {
    await rmIfExists(`${folderRel}/${name}`);
  }
}

async function main() {
  const story = await readJson(`daily/${DATE}.json`, await readJson("latest.json", null));
  const datedManifest = await readJson(`social/${DATE}/manifest.json`, null);
  const latestManifest = await readJson("social/latest/manifest.json", null);
  if (!isProductAd(story, datedManifest || latestManifest)) {
    console.log("Product-ad social trim skipped: not a product-ad story");
    return;
  }

  await trimFolder(`social/${DATE}`);
  await trimFolder("social/latest");

  let changed = 0;
  if (datedManifest) {
    await writeJson(`social/${DATE}/manifest.json`, trimManifest(datedManifest, story));
    changed += 1;
  }
  if (latestManifest) {
    await writeJson("social/latest/manifest.json", trimManifest(latestManifest, story));
    changed += 1;
  }
  console.log(`Product-ad social trim complete: ${changed} manifest(s) updated; puzzle clips removed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
