import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "preview-site");

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]));
}

async function copyRecursive(src, dst) {
  if (!(await exists(src))) return;
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dst, { recursive: true });
    for (const entry of await fs.readdir(src)) {
      await copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
    return;
  }
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
}

async function listDates() {
  const social = path.join(ROOT, "social");
  if (!(await exists(social))) return [];
  const entries = await fs.readdir(social, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

function expectedFiles(manifest, story) {
  const fromManifest = Array.isArray(manifest?.post_order) && manifest.post_order.length
    ? manifest.post_order
    : Array.isArray(manifest?.files) && manifest.files.length
      ? manifest.files
      : [];
  if (fromManifest.length) return fromManifest;
  const sceneCount = Array.isArray(story?.scenes) ? story.scenes.length : 0;
  const panelCount = Math.max(8, sceneCount || 0);
  const files = ["00_start-grid.png"];
  for (let i = 1; i <= panelCount; i += 1) files.push(`${String(i).padStart(2, "0")}_panel-${String(i).padStart(2, "0")}.png`);
  files.push(`${String(panelCount + 1).padStart(2, "0")}_finished-grid.png`);
  return files;
}

function clientScript(dates, latestDate) {
  return [
    "const dates = " + JSON.stringify(dates) + ";",
    "const initialDate = " + JSON.stringify(latestDate) + ";",
    "function pad(n){return String(n).padStart(2,'0')}",
    "function expectedFiles(manifest, story){",
    "  if(Array.isArray(manifest && manifest.post_order) && manifest.post_order.length) return manifest.post_order;",
    "  if(Array.isArray(manifest && manifest.files) && manifest.files.length) return manifest.files;",
    "  const sceneCount = Array.isArray(story && story.scenes) ? story.scenes.length : 0;",
    "  const panelCount = Math.max(8, sceneCount || 0);",
    "  const arr=['00_start-grid.png'];",
    "  for(let i=1;i<=panelCount;i++) arr.push(pad(i)+'_panel-'+pad(i)+'.png');",
    "  arr.push(pad(panelCount+1)+'_finished-grid.png');",
    "  return arr;",
    "}",
    "async function fetchJson(url, fallback){try{const r=await fetch(url,{cache:'no-store'}); if(!r.ok) return fallback; return await r.json()}catch{return fallback}}",
    "async function fetchText(url, fallback){try{const r=await fetch(url,{cache:'no-store'}); if(!r.ok) return fallback; return await r.text()}catch{return fallback}}",
    "function h(text){return String(text==null?'':text).replace(/[&<>\\\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\\\"':'&quot;'}[c]})}",
    "async function loadDate(date){",
    "  document.getElementById('datePill').textContent=date||'No date';",
    "  const manifest=await fetchJson('/social/'+date+'/manifest.json',{});",
    "  const story=await fetchJson('/daily/'+date+'.json',await fetchJson('/latest.json',{}));",
    "  const files=expectedFiles(manifest,story);",
    "  const grid=document.getElementById('assetGrid'); grid.innerHTML='';",
    "  let imageCount=0; document.getElementById('imageCount').textContent='0';",
    "  for(const pair of files.entries()){",
    "    const i=pair[0], name=pair[1];",
    "    const src='/social/'+date+'/'+name;",
    "    const img=new Image();",
    "    const card=document.createElement('div'); card.className='card';",
    "    const title=i===0?'Start puzzle clip':name.includes('finished')?'Finished puzzle clip':'Story PNG '+i;",
    "    card.innerHTML='<div class=\"missing\">Checking '+h(name)+'…</div><div class=\"body\"><h3>'+h(title)+'</h3><div class=\"small\">'+h(name)+'</div></div>';",
    "    img.onload=function(){imageCount++; document.getElementById('imageCount').textContent=String(imageCount); const miss=card.querySelector('.missing'); if(miss) miss.replaceWith(img);};",
    "    img.onerror=function(){const miss=card.querySelector('.missing'); if(miss) miss.textContent='Missing: '+name;};",
    "    img.src=src+'?v='+Date.now();",
    "    grid.appendChild(card);",
    "  }",
    "  const scenes=Array.isArray(story && story.scenes)?story.scenes:[];",
    "  document.getElementById('storyText').innerHTML=scenes.map(function(s,i){",
    "    const dialogue=s.storyboard_dialogue||s.dialogue||s.speech_bubble||'';",
    "    const caption=s.storyboard_caption||s.caption||s.beat||'';",
    "    const loc=s.panel_location||s.setting||'';",
    "    return '<div class=\"scene\"><b>Panel '+(i+1)+': '+h(s.title||s.id||'')+'</b>'+(dialogue?'<div class=\"dialogue\">'+h(dialogue)+'</div>':'')+'<div class=\"caption\">'+h(caption)+'</div><div class=\"loc\">'+h(loc)+'</div></div>';",
    "  }).join('') || '<p class=\"note\">No story scenes found.</p>';",
    "  const videoManifest=await fetchJson('/social/'+date+'/short-video/manifest.json',{});",
    "  document.getElementById('videoStatus').textContent=videoManifest.status||'not built';",
    "  const videoPath=videoManifest.video_file?('/'+videoManifest.video_file):('/social/'+date+'/short-video/sapiver_isla_daily_'+date+'.mp4');",
    "  document.getElementById('videoBlock').innerHTML=videoManifest.status==='video_ready'?'<video class=\"video\" controls src=\"'+h(videoPath)+'?v='+Date.now()+'\"></video><p><a href=\"'+h(videoPath)+'\" download>Download MP4</a></p>':'<p class=\"note\">No video yet. Use Create video after approving the PNGs and text.</p>';",
    "  const script=await fetchText('/social/'+date+'/short-video/script.txt','Video script has not been generated yet.');",
    "  document.getElementById('scriptText').textContent=script;",
    "}",
    "async function callAction(action){",
    "  const key=localStorage.getItem('sapiverPreviewKey') || prompt('Preview admin key');",
    "  if(!key) return;",
    "  localStorage.setItem('sapiverPreviewKey',key);",
    "  const date=document.getElementById('dateSelect').value || initialDate;",
    "  const result=document.getElementById('actionResult'); result.textContent='Sending request…';",
    "  const r=await fetch('/api/trigger-github-action',{method:'POST',headers:{'content-type':'application/json','x-preview-admin-key':key},body:JSON.stringify({action:action,date:date})});",
    "  const data=await r.json().catch(function(){return {}});",
    "  result.textContent=r.ok?'Triggered '+action+'. Check GitHub Actions, then refresh this page after it finishes.':'Failed: '+(data.error||r.statusText);",
    "}",
    "document.getElementById('dateSelect').addEventListener('change',function(e){loadDate(e.target.value)});",
    "document.getElementById('runDailyBtn').addEventListener('click',function(){callAction('daily')});",
    "document.getElementById('buildVideoBtn').addEventListener('click',function(){callAction('video')});",
    "document.getElementById('postFacebookBtn').addEventListener('click',function(){callAction('facebook')});",
    "document.getElementById('postPinterestBtn').addEventListener('click',function(){callAction('pinterest')});",
    "loadDate(initialDate);"
  ].join("\n");
}

async function build() {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });
  await copyRecursive(path.join(ROOT, "social"), path.join(OUT, "social"));
  await copyRecursive(path.join(ROOT, "daily"), path.join(OUT, "daily"));
  await copyRecursive(path.join(ROOT, "latest.json"), path.join(OUT, "latest.json"));

  const dates = await listDates();
  const latestDate = dates[0] || "";
  const latestManifest = latestDate ? await readJson(path.join(ROOT, "social", latestDate, "manifest.json"), {}) : {};
  const latestStory = latestDate ? await readJson(path.join(ROOT, "daily", `${latestDate}.json`), await readJson(path.join(ROOT, "latest.json"), {})) : {};
  const files = expectedFiles(latestManifest, latestStory);
  const videoManifest = latestDate ? await readJson(path.join(ROOT, "social", latestDate, "short-video", "manifest.json"), {}) : {};
  const scriptText = latestDate && await exists(path.join(ROOT, "social", latestDate, "short-video", "script.txt"))
    ? await fs.readFile(path.join(ROOT, "social", latestDate, "short-video", "script.txt"), "utf8")
    : "";
  const options = dates.map((date) => `<option value="${esc(date)}" ${date === latestDate ? "selected" : ""}>${esc(date)}</option>`).join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Sapiver Press Comic Preview</title>
<style>
:root{--bg:#0b1020;--panel:#131b33;--card:#18213d;--line:#2b385f;--text:#f4f7ff;--muted:#aab5d1;--ok:#b8f7ca;--bad:#ffc2c2;--accent:#9cc9ff;}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.45} a{color:var(--accent)}
header{padding:26px 22px;border-bottom:1px solid var(--line);background:linear-gradient(135deg,#101a34,#071122)}
h1{margin:0 0 8px;font-size:clamp(26px,4vw,44px)} .sub{color:var(--muted);max-width:1000px}
.wrap{display:grid;grid-template-columns:280px 1fr;gap:18px;padding:18px;max-width:1500px;margin:0 auto}.side{position:sticky;top:14px;align-self:start;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px}.main{min-width:0}
.status{display:grid;gap:8px;margin:12px 0}.pill{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:#0f1730;border-radius:999px;padding:7px 10px;color:var(--muted);font-size:13px}.pill strong{color:var(--text)}
.controls{display:grid;gap:10px;margin-top:14px}button{border:0;border-radius:12px;padding:11px 13px;font-weight:750;cursor:pointer;background:var(--accent);color:#06101f}button.secondary{background:#243250;color:var(--text);border:1px solid var(--line)}button.danger{background:#ffe1e1;color:#351010}button:disabled{opacity:.45;cursor:not-allowed}.note{font-size:13px;color:var(--muted)}
select,input{width:100%;background:#0d152b;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.card{background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden}.card img{display:block;width:100%;height:auto;background:#080d1d}.card .body{padding:12px}.card h3{margin:0 0 8px;font-size:17px}.missing{padding:70px 14px;text-align:center;color:var(--bad);border-bottom:1px solid var(--line);background:#231428}
section{margin:0 0 18px}.box{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px}.story{display:grid;gap:10px}.scene{border:1px solid var(--line);border-radius:14px;padding:12px;background:#10182f}.scene b{display:block;margin-bottom:4px}.scene .dialogue{color:var(--ok)}.scene .caption{color:var(--text)}.scene .loc{color:var(--muted);font-size:13px;margin-top:6px}.script{white-space:pre-wrap;background:#071024;border:1px solid var(--line);border-radius:14px;padding:14px;color:#e8edff}.video{width:100%;max-width:420px;border-radius:16px;border:1px solid var(--line);background:#000}.small{font-size:12px;color:var(--muted)}
@media(max-width:850px){.wrap{grid-template-columns:1fr}.side{position:relative;top:0}}
</style>
</head>
<body>
<header>
  <h1>Sapiver Press Comic Preview</h1>
  <div class="sub">Review the generated puzzle clips, story PNGs, captions, video script, and final video before any manual posting. Nothing posts automatically from this page.</div>
</header>
<div class="wrap">
  <aside class="side">
    <label class="small" for="dateSelect">Preview date</label>
    <select id="dateSelect">${options}</select>
    <div class="status">
      <span class="pill"><strong id="datePill">${esc(latestDate || "No date")}</strong></span>
      <span class="pill">Images: <strong id="imageCount">0</strong></span>
      <span class="pill">Video: <strong id="videoStatus">${esc(videoManifest?.status || "not built")}</strong></span>
    </div>
    <div class="controls">
      <button id="runDailyBtn" class="secondary">Generate / refresh preview</button>
      <button id="buildVideoBtn">Create video from approved preview</button>
      <button id="postFacebookBtn" class="danger">Post approved PNG to Facebook</button>
      <button id="postPinterestBtn" class="secondary">Post start-grid to Pinterest</button>
    </div>
    <p class="note">Buttons call Netlify Functions. Set <code>PREVIEW_ADMIN_KEY</code> in Netlify and enter it when prompted. GitHub token stays server-side.</p>
    <p id="actionResult" class="note"></p>
  </aside>
  <main class="main">
    <section class="box">
      <h2>Asset order</h2>
      <p class="note">Target flow: start puzzle clip → story PNGs → finished puzzle clip. Current compositor may still output six story panels until the 8-panel generator/compositor upgrade is completed.</p>
      <div id="assetGrid" class="grid"></div>
    </section>
    <section class="box">
      <h2>Story text</h2>
      <div id="storyText" class="story"></div>
    </section>
    <section class="box">
      <h2>Video preview</h2>
      <div id="videoBlock"></div>
      <h3>Script / caption copy</h3>
      <div id="scriptText" class="script">${esc(scriptText || "Video script has not been generated yet.")}</div>
    </section>
  </main>
</div>
<script>
${clientScript(dates, latestDate)}
</script>
</body>
</html>`;

  await fs.writeFile(path.join(OUT, "index.html"), html, "utf8");
  await fs.writeFile(path.join(OUT, "preview-data.json"), JSON.stringify({ dates, latestDate, files, builtAt: new Date().toISOString() }, null, 2), "utf8");
  console.log(`Preview dashboard built for ${latestDate || "no generated date"}`);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
