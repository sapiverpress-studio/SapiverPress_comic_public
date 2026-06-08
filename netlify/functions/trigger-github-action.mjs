const REPO_OWNER = "sapiverpress-studio";
const REPO_NAME = "SapiverPress_comic_public";

const WORKFLOWS = {
  daily: {
    file: "daily-comic.yml",
    inputs: (date) => ({
      date_override: date || "",
      run_archive: "false",
      polish_images_openai: "true",
      supporting_life_trigger: "auto",
      force_paid_api_run: "true",
    }),
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

function env(name) {
  try {
    if (globalThis.Netlify?.env?.get) return globalThis.Netlify.env.get(name) || "";
  } catch {}
  return process.env[name] || "";
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function cleanDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

async function parseBody(req) {
  const text = await req.text();
  if (!text.trim()) return {};
  return JSON.parse(text);
}

async function dispatchWorkflow({ action, date }) {
  const workflow = WORKFLOWS[action];
  if (!workflow) {
    return json(400, { error: "Unknown action", allowed: Object.keys(WORKFLOWS) });
  }

  const token = env("GITHUB_DISPATCH_TOKEN") || env("COMIC_GITHUB_TOKEN") || env("GITHUB_TOKEN");
  if (!token) {
    return json(500, { error: "Missing GitHub dispatch token in Netlify environment" });
  }

  const payload = { ref: "main", inputs: workflow.inputs(date) };
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflow.file}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "SapiverPressPreviewDashboard/3.0",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text();
    return json(response.status, {
      error: "GitHub workflow dispatch failed",
      action,
      workflow: workflow.file,
      request: { ref: payload.ref, inputs: payload.inputs },
      details: details.slice(0, 1800),
    });
  }

  return json(200, {
    ok: true,
    action,
    workflow: workflow.file,
    date,
    request: { ref: payload.ref, inputs: payload.inputs },
    message: "Workflow triggered with website API switches enabled. Check GitHub Actions, then refresh after it finishes.",
  });
}

export default async function triggerGithubAction(req) {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const expectedKey = env("PREVIEW_ADMIN_KEY");
  const suppliedKey = (req.headers.get("x-preview-admin-key") || "").trim();
  if (!expectedKey || suppliedKey !== expectedKey) {
    return json(401, {
      error: "Preview admin key missing or incorrect",
      hint: "Clear the saved preview key and enter the current Netlify PREVIEW_ADMIN_KEY.",
    });
  }

  let body;
  try {
    body = await parseBody(req);
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const action = String(body.action || "").trim().toLowerCase();
  const date = cleanDate(body.date);
  return dispatchWorkflow({ action, date });
}

export const config = {
  path: "/api/trigger-github-action",
};
