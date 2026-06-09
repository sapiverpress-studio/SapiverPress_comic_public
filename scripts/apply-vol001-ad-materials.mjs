import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const MATERIAL_REL = "config/ad-materials/commercial-sudoku-vol001.json";

function todayLondon() {
  const override = process.env.DATE_OVERRIDE || "";
  if (override) return override;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function readJson(rel, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(rel, data) {
  const file = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function compactMaterial(material) {
  return {
    id: material.id,
    status: material.status,
    product_line: material.product_line,
    volume: material.volume,
    listing: material.listing,
    core_facts_allowed_in_ads: material.core_facts_allowed_in_ads,
    copy_positioning: material.copy_positioning,
    drive_evidence: material.drive_evidence,
    ad_safe_source_materials: material.ad_safe_source_materials,
    do_not_upload_to_public_repo: material.do_not_upload_to_public_repo,
    visual_use_rules: material.visual_use_rules,
  };
}

function applyMaterial(story, material) {
  const safeMaterial = compactMaterial(material);
  const next = {
    ...story,
    active_ad_material_id: material.id,
    active_ad_material: safeMaterial,
    product_referenced: {
      ...(story.product_referenced || {}),
      volume: material.volume,
      etsy_listing_id: material.listing?.etsy_listing_id,
      ad_material_id: material.id,
      ad_safe_source_materials: material.ad_safe_source_materials,
      public_repo_material_policy: "listing previews/free samples only; never full paid ZIP",
    },
    product_ad_contract: {
      ...(story.product_ad_contract || {}),
      volume: material.volume,
      etsy_listing_id: material.listing?.etsy_listing_id,
      ad_material_manifest: MATERIAL_REL,
      use_real_vol001_material_where_available: true,
      do_not_upload_paid_zip_to_public_repo: true,
    },
    storyboard_quality: {
      ...(story.storyboard_quality || {}),
      vol001_material_manifest_attached: true,
      paid_zip_exposure_blocked: true,
    },
    image_manifest: {
      ...(story.image_manifest || {}),
      active_ad_material_id: material.id,
      active_ad_material: safeMaterial,
      product_referenced: {
        ...(story.image_manifest?.product_referenced || story.product_referenced || {}),
        volume: material.volume,
        etsy_listing_id: material.listing?.etsy_listing_id,
        ad_material_id: material.id,
      },
      style_rules: [
        ...new Set([
          ...((story.image_manifest && Array.isArray(story.image_manifest.style_rules)) ? story.image_manifest.style_rules : []),
          "Use Vol.001 real listing/free-sample material as the advertising truth where available.",
          "Do not expose, upload, screenshot, or recreate the full paid Vol.001 delivery ZIP in the public repo.",
          "Use compositor overlays for readable product text and CTA copy.",
        ]),
      ],
    },
  };

  next.scenes = (next.scenes || []).map((scene, index) => ({
    ...scene,
    active_ad_material_id: material.id,
    product_volume: material.volume,
    ad_material_visual_truth: "Vol.001 listing previews/free sample only",
    screen_overlay: {
      ...(scene.screen_overlay || {}),
      source_material_id: material.id,
      source_volume: material.volume,
      etsy_listing_id: material.listing?.etsy_listing_id,
    },
    visual_generation_rules: [
      ...new Set([
        ...((Array.isArray(scene.visual_generation_rules)) ? scene.visual_generation_rules : []),
        "Use Vol.001 as product reference, but keep the paid ZIP and full customer pack out of generated/public assets.",
      ]),
    ],
  }));

  next.image_manifest = {
    ...next.image_manifest,
    scenes: (next.image_manifest?.scenes || []).map((scene) => ({
      ...scene,
      active_ad_material_id: material.id,
      product_volume: material.volume,
    })),
    image_prompts: (next.image_manifest?.image_prompts || []).map((prompt) => ({
      ...prompt,
      active_ad_material_id: material.id,
      product_volume: material.volume,
      ad_material_visual_truth: "Vol.001 listing previews/free sample only",
    })),
  };

  return next;
}

async function main() {
  const date = todayLondon();
  const material = await readJson(MATERIAL_REL, null);
  if (!material) throw new Error(`Missing ad material manifest: ${MATERIAL_REL}`);

  const story = await readJson(`daily/${date}.json`, await readJson("latest.json", null));
  if (!story) throw new Error(`No story found for ${date}`);

  const next = applyMaterial(story, material);
  await writeJson(`daily/${date}.json`, next);
  await writeJson("latest.json", next);
  await writeJson(`image-manifests/${date}.json`, next.image_manifest);

  console.log(`Vol.001 ad material wired into ${date}: ${material.id}`);
  console.log("Public repo policy: listing previews/free samples only; paid ZIP blocked.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
