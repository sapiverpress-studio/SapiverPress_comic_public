import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const ASSET_ROOT = path.join(ROOT, "assets", "book-content-os", "social_sets");
const OUT_ROOT = path.join(ASSET_ROOT, "_decoded_base64");

function walk(dir, out = []) {
  if (!fssync.existsSync(dir)) return out;
  for (const entry of fssync.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(png|jpe?g)\.b64$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function safeName(file) {
  return path.basename(file).replace(/\.b64$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function normaliseEncodedImage(text) {
  const compact = String(text || "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  return compact.padEnd(Math.ceil(compact.length / 4) * 4, "=");
}

await fs.mkdir(OUT_ROOT, { recursive: true });
const files = walk(ASSET_ROOT).filter((file) => !file.includes(`${path.sep}_decoded_base64${path.sep}`));

if (!files.length) {
  console.log("No Book Content OS encoded image assets found.");
  process.exit(0);
}

let decodedCount = 0;
for (let index = 0; index < files.length; index += 1) {
  const source = files[index];
  const base = safeName(source);
  const tempImage = path.join(OUT_ROOT, `${String(index + 1).padStart(2, "0")}_${base}`);
  const pngOut = tempImage.replace(/\.(jpe?g|png)$/i, ".png");
  const raw = normaliseEncodedImage(fssync.readFileSync(source, "utf8"));
  try {
    fssync.writeFileSync(tempImage, Buffer.from(raw, "base64"));
    execFileSync("ffmpeg", ["-y", "-i", tempImage, "-map_metadata", "-1", pngOut], { stdio: "inherit" });
    decodedCount += 1;
    console.log(`Decoded ${path.relative(ROOT, source)} -> ${path.relative(ROOT, pngOut)}`);
  } catch (error) {
    console.warn(`Skipping unreadable Book Content OS image asset: ${path.relative(ROOT, source)}`);
    console.warn(error?.message || error);
    try { fssync.rmSync(tempImage, { force: true }); } catch {}
    try { fssync.rmSync(pngOut, { force: true }); } catch {}
  }
}

if (!decodedCount) {
  throw new Error("No Book Content OS image assets could be decoded.");
}

console.log(`Decoded ${decodedCount} Book Content OS image assets.`);
