const BROKEN_DECIMAL_BOUNDARY = /\b\d+\.\s+(?=\d+(?:[A-Za-z-]|\s+(?:million|billion|trillion|percent|%)))/i;
const BROKEN_URL = /https?:\/\/[^\s]+\.\s+[^\s]+/i;
const DUPLICATED_BOUNDARY = /\b([A-Z][A-Za-z]{1,20})\s+As\s+\1\b/i;
const DANGLING_MODEL_FRAGMENT = /(?:^|[.!?]\s+)[A-Za-z0-9.-]+,\s+(?:an?\s+)?\d+\.(?:\s|$)/i;

export function socialContentProblems(bundle) {
  const fields = [
    ["story summary", ...(bundle.stories || []).map((story) => story?.summary)],
    ["Facebook post", bundle.facebook?.post],
    ["Pinterest title", bundle.pinterest?.title],
    ["Pinterest description", bundle.pinterest?.description],
    ["YouTube description", bundle.youtube?.description],
    ["TikTok hook", bundle.ai_media?.tiktok?.hook],
    ["TikTok payoff", bundle.ai_media?.tiktok?.payoff],
    ["TikTok narration", bundle.ai_media?.tiktok?.narration]
  ];
  const problems = [];
  for (const [label, ...values] of fields) {
    for (const value of values) {
      const text = String(value || "").trim();
      if (!text) continue;
      if (BROKEN_URL.test(text)) problems.push(`${label}: URL contains whitespace after the domain dot`);
      if (BROKEN_DECIMAL_BOUNDARY.test(text)) problems.push(`${label}: likely decimal split across sentence boundaries`);
      if (DANGLING_MODEL_FRAGMENT.test(text)) problems.push(`${label}: dangling model or numeric fragment`);
      if (DUPLICATED_BOUNDARY.test(text)) problems.push(`${label}: duplicated text at an extraction boundary`);
    }
  }
  return [...new Set(problems)];
}

export function assertSocialContentUsable(bundle) {
  const problems = socialContentProblems(bundle);
  if (problems.length) {
    throw new Error(`Sapiver Forge social content failed the pre-publication usability gate:\n- ${problems.join("\n- ")}`);
  }
}
