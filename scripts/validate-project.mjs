import fs from "fs/promises";
const required = [
  "config/comic-engine.config.json", "scripts/daily-generator.mjs", "scripts/archive-migration.mjs", ".github/workflows/daily-comic.yml",
  "characters/isla.json", "characters/mike.json", "characters/phil.json", "characters/gemma.json", "characters/andy_and_kat.json", "package.json"
];
let ok = true;
for (const f of required) { try { await fs.access(f); console.log(`OK: ${f}`); } catch { console.log(`MISSING: ${f}`); ok = false; } }
if (!ok) process.exit(1);
console.log("Project validation passed.");
