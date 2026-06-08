import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "preview-site");

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }
async function readJson(p, fb = null) { try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return fb; } }
function esc(v) { return String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function trim(v, n = 360) { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; }

async function copyRecursive(src, dst) {
  if (!(await exists(src))) return;
  const st = await fs.stat(src);
  if (st.isDirectory()) {
    await fs.mkdir(dst, { recursive: true });
    for (const e of await fs.readdir(src)) await copyRecursive(path.join(src, e), path.join(dst, e));
    return;
  }
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
}

async function datedDirs(root) {
  if (!(await exists(root))) return [];
  return (await fs.readdir(root, { withFileTypes: true }))
    .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map(e => e.name)
    .sort()
    .reverse();
}

async function promptMap(date) {
  const pack = await readJson(path.join(ROOT, "art-prompts", date, "prompts.json"), await readJson(path.join(ROOT, "art-prompts", "latest", "prompts.json"), {}));
  const map = new Map();
  for (const p of Array.isArray(pack?.panels) ? pack.panels : []) {
    const n = Number(p.panel_number || 0);
    if (n) map.set(n, trim(p.prompt || ""));
  }
  return map;
}

async function collectRejected(date) {
  const base = path.join(ROOT, "rejected-art", date);
  if (!(await exists(base))) return [];
  const prompts = await promptMap(date);
  const folders = (await fs.readdir(base, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort();
  const items = [];
  for (const folderName of folders) {
    const folder = path.join(base, folderName);
    const report = await readJson(path.join(folder, "rejection-report.json"), null);
    if (!report) continue;
    const panel = Number(report.panel || 0);
    const pp = String(panel).padStart(2, "0");
    const datedImage = `dated_${pp}_panel-${pp}.png`;
    const latestImage = `latest_${pp}_panel-${pp}.png`;
    const rejectedImage = await exists(path.join(folder, datedImage))
      ? `/rejected-art/${date}/${folderName}/${datedImage}`
      : await exists(path.join(folder, latestImage))
        ? `/rejected-art/${date}/${folderName}/${latestImage}`
        : "";
    const compositorAttempt = await exists(path.join(folder, "compositor_attempt.png"))
      ? `/rejected-art/${date}/${folderName}/compositor_attempt.png`
      : "";
    const scene = report.scene || {};
    const row = report.row || {};
    items.push({
      date,
      folderName,
      panel,
      sceneId: report.scene_id || scene.id || "",
      reason: report.reason || "Rejected during compose review",
      screenState: row.panel_screen_state || row.screen_state || "",
      overlayRequired: Boolean(row.screen_state_overlay_allowed ?? false),
      caption: scene.storyboard_caption || scene.caption || scene.beat || "",
      dialogue: scene.storyboard_dialogue || scene.overlay_dialogue || scene.overlay_text || scene.dialogue || scene.speech_bubble || "",
      location: scene.panel_location || scene.setting || "",
      promptSnippet: prompts.get(panel) || "",
      rejectedImage,
      compositorAttempt,
      reportUrl: `/rejected-art/${date}/${folderName}/rejection-report.json`,
    });
  }
  return items.sort((a, b) => a.panel - b.panel);
}

function imageBlock(label, src, missing) {
  return `<div><div class="small" style="margin:0 0 8px">${esc(label)}</div>${src ? `<img src="${esc(src)}" alt="${esc(label)}" style="display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--line);background:#080d1d">` : `<div class="missing">${esc(missing)}</div>`}</div>`;
}

function rejectedSection(date, items) {
  const intro = items.length ? `${items.length} rejected panel(s) need review. These are generated images that failed the overlay-screen check.` : "No rejected panels for the latest date.";
  const cards = items.map(item => `
    <div class="card" style="margin-top:16px">
      <div class="body">
        <h3>Rejected panel ${esc(item.panel)} <span class="small">${esc(item.sceneId)}</span></h3>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:12px 0" class="rejected-preview-pair">
          ${imageBlock("Rejected generated image", item.rejectedImage, "Rejected image missing")}
          ${imageBlock("Compositor attempt", item.compositorAttempt, "No compositor attempt image")}
        </div>
        <p><b>Reason:</b> ${esc(item.reason)}</p>
        <p><b>Screen state:</b> ${esc(item.screenState || "unknown")}</p>
        <p><b>Overlay required:</b> ${esc(item.overlayRequired ? "yes" : "no")}</p>
        ${item.caption ? `<p><b>Caption:</b> ${esc(item.caption)}</p>` : ""}
        ${item.dialogue ? `<p><b>Dialogue:</b> ${esc(item.dialogue)}</p>` : ""}
        ${item.location ? `<p><b>Location:</b> ${esc(item.location)}</p>` : ""}
        ${item.promptSnippet ? `<p><b>Prompt snippet:</b> ${esc(item.promptSnippet)}</p>` : ""}
        <p><a href="${esc(item.reportUrl)}" target="_blank" rel="noopener">Open rejection report</a></p>
      </div>
    </div>`).join("\n");
  return `<section class="box" id="rejectedPanelsReview"><h2>Rejected panels review</h2><p class="note"><b>${esc(date || "No date")}</b> — ${esc(intro)}</p>${cards}</section>`;
}

async function build() {
  await copyRecursive(path.join(ROOT, "rejected-art"), path.join(OUT, "rejected-art"));
  await copyRecursive(path.join(ROOT, "art-prompts"), path.join(OUT, "art-prompts"));
  const allDates = Array.from(new Set([...(await datedDirs(path.join(ROOT, "social"))), ...(await datedDirs(path.join(ROOT, "rejected-art")))]));
  const rejectedData = {};
  for (const date of allDates) rejectedData[date] = await collectRejected(date);
  const latestWithRejects = allDates.find(date => rejectedData[date]?.length) || allDates[0] || "";
  const section = rejectedSection(latestWithRejects, rejectedData[latestWithRejects] || []);
  const indexPath = path.join(OUT, "index.html");
  let html = await fs.readFile(indexPath, "utf8");
  html = html.replace(/<section class="box" id="rejectedPanelsReview">[\s\S]*?<\/section>/, "");
  html = html.replace(/<section class="box"><h2>Story text<\/h2>/, `${section}<section class="box"><h2>Story text</h2>`);
  html = html.replace("</style>", "@media(max-width:850px){.rejected-preview-pair{grid-template-columns:1fr!important}}</style>");
  await fs.writeFile(indexPath, html, "utf8");
  await fs.writeFile(path.join(OUT, "rejected-data.json"), JSON.stringify(rejectedData, null, 2), "utf8");
  console.log(`Rejected panel dashboard addon built for ${latestWithRejects || "no rejected date"}`);
}

build().catch(error => { console.error(error); process.exit(1); });
