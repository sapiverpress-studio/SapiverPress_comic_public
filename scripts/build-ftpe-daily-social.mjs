import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const DATE = process.env.DATE_OVERRIDE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const OUT = path.join(ROOT, "social", "ftpe", DATE);
const LATEST = path.join(ROOT, "social", "ftpe", "latest");
const CONFIG_PATH = path.join(ROOT, "config", "ftpe-social-campaign.json");
const ASSET_DIR = path.join(ROOT, "assets", "ftpe", "social_master");
const ZIP_PATH = path.join(ASSET_DIR, "FTPE_social_master_assets.zip");
const ZIP_B64_PATH = path.join(ASSET_DIR, "FTPE_social_master_assets.zip.b64");
const PLATFORM = (process.env.FTPE_SOCIAL_PLATFORM || "all").toLowerCase();

function exists(p) { return fssync.existsSync(p); }
async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }
async function readJson(p) { return JSON.parse(await fs.readFile(p, "utf8")); }

function pickItem(config) {
  const rotation = Array.isArray(config.daily_rotation) ? config.daily_rotation : [];
  if (!rotation.length) throw new Error("No FTPE daily_rotation items in config/ftpe-social-campaign.json");
  const dayIndex = Math.floor(Date.parse(`${DATE}T00:00:00Z`) / 86400000);
  return rotation[dayIndex % rotation.length];
}

function decodeAssetsIfNeeded() {
  if (exists(path.join(ASSET_DIR, "manifest.json"))) return;
  if (exists(ZIP_PATH)) {
    execFileSync("unzip", ["-o", ZIP_PATH, "-d", ASSET_DIR], { stdio: "inherit" });
    return;
  }
  if (exists(ZIP_B64_PATH)) {
    const raw = fssync.readFileSync(ZIP_B64_PATH, "utf8").replace(/\s+/g, "");
    fssync.writeFileSync(ZIP_PATH, Buffer.from(raw, "base64"));
    execFileSync("unzip", ["-o", ZIP_PATH, "-d", ASSET_DIR], { stdio: "inherit" });
    return;
  }
  throw new Error(`Missing FTPE social master assets. Add ${ZIP_PATH} or ${ZIP_B64_PATH}`);
}

function postCopy(item, config, platform) {
  const hashtags = (config.hashtags || []).slice(0, 8).join(" ");
  const cta = item.id === "commercial_900_next_step" ? config.upgrade_cta : config.main_cta;
  const base = `${item.headline}\n\n${item.description}\n\n${item.cta}: ${cta}\n\n${hashtags}`;
  if (platform === "tiktok") {
    return `${item.headline}\n\n${item.description}\n\n${config.main_cta}\n\n${hashtags}`;
  }
  return base;
}

async function copyForPlatform(item, config, platform) {
  if (PLATFORM !== "all" && PLATFORM !== platform) return null;
  if (Array.isArray(item.platforms) && !item.platforms.includes(platform)) return null;
  const src = path.join(ASSET_DIR, item.asset);
  if (!exists(src)) throw new Error(`Missing FTPE source asset: ${src}`);
  const dir = path.join(OUT, platform);
  await ensureDir(dir);
  const ext = path.extname(item.asset) || ".png";
  const imageName = `${DATE}_${item.id}_${platform}${ext}`;
  const dst = path.join(dir, imageName);
  await fs.copyFile(src, dst);
  const copy = postCopy(item, config, platform);
  await fs.writeFile(path.join(dir, `${DATE}_${item.id}_${platform}.txt`), copy, "utf8");
  return {
    platform,
    image: path.relative(ROOT, dst),
    copy_file: path.relative(ROOT, path.join(dir, `${DATE}_${item.id}_${platform}.txt`)),
    title: item.pin_title,
    headline: item.headline,
    description: item.description,
    cta: item.cta,
  };
}

async function mirrorLatest() {
  if (exists(LATEST)) await fs.rm(LATEST, { recursive: true, force: true });
  await ensureDir(path.dirname(LATEST));
  await fs.cp(OUT, LATEST, { recursive: true });
}

const config = await readJson(CONFIG_PATH);
decodeAssetsIfNeeded();
await ensureDir(OUT);
const item = pickItem(config);
const outputs = [];
for (const platform of ["pinterest", "facebook", "tiktok"]) {
  const result = await copyForPlatform(item, config, platform);
  if (result) outputs.push(result);
}
const manifest = {
  date: DATE,
  product: config.product,
  campaign_version: config.version,
  selected_rotation_id: item.id,
  selected_asset: item.asset,
  main_cta: config.main_cta,
  upgrade_cta: config.upgrade_cta,
  source_rule: "Real supplied FTPE advertising asset only. No fake KDP screenshots, income screenshots, or invented book mockups.",
  outputs,
};
await fs.writeFile(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await mirrorLatest();
console.log(`FTPE daily social assets built for ${DATE}: ${outputs.map(o => o.platform).join(", ")}`);
