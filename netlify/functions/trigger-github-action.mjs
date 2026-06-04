const REPO_OWNER = "sapiverpress-studio";
const REPO_NAME = "SapiverPress_comic_public";

const WORKFLOWS = {
  daily: {
    file: "daily-comic.yml",
    inputs: (date) => ({ date_override: date || "", force_paid_api_run: "true", supporting_life_trigger: "auto" }),
  },
  video: {
    file: "manual-video.yml",
    inputs: (date) => ({ date_override: date || "", generate_voiceover: "true" }),
  },
  facebook: {
    file: "manual-social-post.yml",
    inputs: (date) => ({ date_override: date || "", platform: "facebook", force_post: "false" }),
  },
  pinterest: {
    file: "manual-social-post.yml",
    inputs: (date) => ({ date_override: date || "", platform: "pinterest", force_post: "false" }),
  },
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

function cleanDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "POST only" });
  }

  const expectedKey = process.env.PREVIEW_ADMIN_KEY || "";
  const suppliedKey = event.headers["x-preview-admin-key"] || event.headers["X-Preview-Admin-Key"] || "";
  if (!expectedKey || suppliedKey !== expectedKey) {
    return json(401, { error: "Preview admin key missing or incorrect" });
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN || process.env.COMIC_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
  if (!token) {
    return json(500, { error: "Missing GitHub dispatch token in Netlify environment" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const action = String(body.action || "").trim().toLowerCase();
  const workflow = WORKFLOWS[action];
  if (!workflow) {
    return json(400, { error: "Unknown action", allowed: Object.keys(WORKFLOWS) });
  }

  const date = cleanDate(body.date);
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflow.file}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "SapiverPressPreviewDashboard/1.0",
    },
    body: JSON.stringify({ ref: "main", inputs: workflow.inputs(date) }),
  });

  if (!response.ok) {
    const text = await response.text();
    return json(response.status, { error: "GitHub workflow dispatch failed", details: text.slice(0, 1200) });
  }

  return json(200, {
    ok: true,
    action,
    workflow: workflow.file,
    date,
    message: "Workflow triggered. Refresh after the GitHub Action finishes.",
  });
}
