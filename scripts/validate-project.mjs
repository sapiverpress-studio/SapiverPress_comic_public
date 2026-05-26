import fs from "fs/promises";
import path from "path";

const required = [
  "config/comic-engine.config.json",
  "scripts/daily-generator.mjs",
  "scripts/archive-migration.mjs",
  ".github/workflows/daily-comic.yml",
  "characters/isla.json",
  "characters/mike.json",
  "characters/phil.json",
  "characters/gemma.json",
  "characters/andy_and_kat.json",
  "package.json"
];

let ok = true;

for (const file of required) {
  try {
    await fs.access(file);
    console.log(`OK: ${file}`);
  } catch {
    console.log(`MISSING: ${file}`);
    ok = false;
  }
}

if (!ok) {
  process.exit(1);
}

console.log("Project validation passed.");
