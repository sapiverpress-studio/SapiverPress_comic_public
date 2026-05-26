import fs from "fs/promises";
import { Octokit } from "@octokit/rest";

const config = JSON.parse(await fs.readFile(new URL("../config/comic-engine.config.json", import.meta.url), "utf8"));

const OWNER = config.owner;
const PUBLIC_REPO = config.publicRepo;
const PRIVATE_REPO = config.privateRepo;
const RETENTION_DAYS = config.retentionDays || 28;
const CHARACTERS = ["isla", "mike", "phil", "gemma", "andy_and_kat"];

const githubToken = process.env.COMIC_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
if (!githubToken) {
  throw new Error("Missing COMIC_GITHUB_TOKEN or GITHUB_TOKEN.");
}

const octokit = new Octokit({ auth: githubToken });

function isOlderThanRetention(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const ageDays = (new Date() - date) / 86400000;
  return ageDays > RETENTION_DAYS;
}

async function readJson(repo, path) {
  try {
    const response = await octokit.repos.getContent({ owner: OWNER, repo, path });
    const content = Buffer.from(response.data.content, "base64").toString("utf8");

    return {
      data: JSON.parse(content),
      sha: response.data.sha
    };
  } catch {
    return null;
  }
}

async function writeJson(repo, path, content, message) {
  let sha;

  try {
    const existing = await octokit.repos.getContent({ owner: OWNER, repo, path });
    sha = existing.data.sha;
  } catch {}

  await octokit.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo,
    path,
    message,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
    ...(sha ? { sha } : {})
  });
}

async function deleteFile(repo, path, sha, message) {
  await octokit.repos.deleteFile({
    owner: OWNER,
    repo,
    path,
    message,
    sha
  });
}

async function migrateCharacter(characterId) {
  const publicFile = await readJson(PUBLIC_REPO, `characters/${characterId}.json`);
  if (!publicFile) {
    console.log(`${characterId}: no public history yet`);
    return;
  }

  const publicHistory = publicFile.data;
  const weeks = publicHistory.weeks || [];

  const oldWeeks = weeks.filter(w => isOlderThanRetention(w.date));
  const recentWeeks = weeks.filter(w => !isOlderThanRetention(w.date));

  if (!oldWeeks.length) {
    console.log(`${characterId}: nothing to migrate`);
    return;
  }

  const privateFile = await readJson(PRIVATE_REPO, `characters/${characterId}.json`);
  const privateHistory = privateFile?.data || {
    character_id: characterId,
    weeks: []
  };

  const mergedPrivateHistory = {
    ...privateHistory,
    character_id: characterId,
    weeks: [...(privateHistory.weeks || []), ...oldWeeks],
    last_migrated: new Date().toISOString().slice(0, 10)
  };

  const trimmedPublicHistory = {
    ...publicHistory,
    weeks: recentWeeks,
    last_migrated: new Date().toISOString().slice(0, 10)
  };

  await writeJson(PRIVATE_REPO, `characters/${characterId}.json`, mergedPrivateHistory, `Archive ${characterId} history`);
  await writeJson(PUBLIC_REPO, `characters/${characterId}.json`, trimmedPublicHistory, `Trim ${characterId} public history`);

  console.log(`${characterId}: migrated ${oldWeeks.length} entries`);
}

async function migrateFolder(folder) {
  let files;

  try {
    const response = await octokit.repos.getContent({
      owner: OWNER,
      repo: PUBLIC_REPO,
      path: folder
    });

    files = Array.isArray(response.data) ? response.data : [];
  } catch {
    console.log(`${folder}: no folder yet`);
    return;
  }

  for (const file of files) {
    const date = file.name.replace(".json", "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!isOlderThanRetention(date)) continue;

    const content = await readJson(PUBLIC_REPO, `${folder}/${file.name}`);
    if (!content) continue;

    await writeJson(PRIVATE_REPO, `${folder}/${file.name}`, content.data, `Archive ${folder}/${file.name}`);
    await deleteFile(PUBLIC_REPO, `${folder}/${file.name}`, content.sha, `Remove archived ${folder}/${file.name}`);

    console.log(`migrated ${folder}/${file.name}`);
  }
}

async function main() {
  console.log(`Archive migration. Public retention: ${RETENTION_DAYS} days`);

  for (const characterId of CHARACTERS) {
    await migrateCharacter(characterId);
  }

  await migrateFolder("daily");
  await migrateFolder("image-manifests");

  console.log("Archive migration complete.");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
