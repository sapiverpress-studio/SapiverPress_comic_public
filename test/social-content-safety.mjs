import assert from "node:assert/strict";
import { assertSocialContentUsable, socialContentProblems } from "../scripts/lib/social-content-safety.mjs";

const failedEdition = {
  stories: [{ summary: "Solo-type business applications rose 26. 8-Max, a 2. AI As AI becomes important." }],
  facebook: { post: "Read more at https://payhip. com/b/example" }
};
const problems = socialContentProblems(failedEdition);
assert.ok(problems.some((item) => item.includes("decimal split")));
assert.ok(problems.some((item) => item.includes("dangling model")));
assert.ok(problems.some((item) => item.includes("duplicated text")));
assert.ok(problems.some((item) => item.includes("URL contains whitespace")));
assert.throws(() => assertSocialContentUsable(failedEdition), /pre-publication usability gate/);

assert.doesNotThrow(() => assertSocialContentUsable({
  stories: [{ summary: "Alibaba launched QwenWork for public beta testing." }],
  facebook: { post: "Test one bounded workflow before expanding its use." },
  pinterest: { title: "A practical AI workflow checklist", description: "Define the boundary and human release decision." },
  youtube: { description: "A practical explanation of a verified development." },
  ai_media: { tiktok: { hook: "Would you let an AI release this?", payoff: "Keep a named human release decision.", narration: "Test one bounded task first." } }
}));

console.log("Sapiver Forge social content safety gate passed.");
