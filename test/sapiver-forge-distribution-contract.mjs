import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/sapiver-forge-social.yml", "utf8");
const builder = fs.readFileSync("scripts/build-sapiver-forge-social.mjs", "utf8");
const poster = fs.readFileSync("scripts/post-sapiver-forge-social.mjs", "utf8");

assert.match(workflow, /sapiver_forge_publish/);
assert.match(workflow, /sapiverpress-studio\/SapiverForge\.git/);
assert.doesNotMatch(workflow, /sapiverpress-studio\/Clearforge/i);
assert.match(workflow, /bridge\/sapiver-forge/);
assert.match(workflow, /Recovering a historical approved package from its immutable legacy bridge path/);
assert.match(builder, /social", "sapiver-forge"/);
assert.match(poster, /social", "sapiver-forge"/);
assert.match(builder, /availableStories\.length < 1/);
assert.match(builder, /availableImages\.length < 1/);
assert.doesNotMatch(builder, /Three story records are required|Three AI-generated story images are required/);
assert.doesNotMatch(`${builder}\n${poster}`, /Clear\s*Forge|Clearforge/i);

console.log("Sapiver Forge distribution contract passed.");
