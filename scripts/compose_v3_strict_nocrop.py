#!/usr/bin/env python3
"""Phase 1 Isla compositor wrapper.

Exports the daily comic as eight neutral PNG files instead of one montage:
- starter grid close-up
- six individual comic panels
- finished grid close-up

The same ordered set is written to both social/YYYY-MM-DD/ and social/latest/.
"""
from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import Image, PngImagePlugin

import compose_v3_strict_clean as base

ROOT = base.ROOT
DATE = base.DATE
CHARACTER = base.CHARACTER
OUT_DIR = base.OUT_DIR
LATEST_DIR = ROOT / "social" / "latest"

EXPORT_FILES = [
    "00_start-grid.png",
    "01_panel-01.png",
    "02_panel-02.png",
    "03_panel-03.png",
    "04_panel-04.png",
    "05_panel-05.png",
    "06_panel-06.png",
    "07_finished-grid.png",
]


def crop_capture_to_game(path: Path) -> Image.Image:
    """Prepare a focused puzzle close-up for screen insertion and standalone export."""
    img = Image.open(path).convert("RGB")
    canvas = Image.new("RGB", (1200, 820), "#071225")
    img.thumbnail((1140, 760), Image.Resampling.LANCZOS)
    canvas.paste(img, ((1200 - img.width) // 2, (820 - img.height) // 2))
    return canvas


base.crop_capture_to_game = crop_capture_to_game


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pnginfo = PngImagePlugin.PngInfo()
    pnginfo.add_text("sapiver_press_generated_at", datetime.now(ZoneInfo("Europe/London")).isoformat())
    pnginfo.add_text("sapiver_press_date", DATE)
    pnginfo.add_text("sapiver_press_character", CHARACTER)
    img.convert("RGB").save(path, pnginfo=pnginfo)


def clear_old_outputs() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    LATEST_DIR.mkdir(parents=True, exist_ok=True)

    # Remove old top-level montage for this date: social/YYYY-MM-DD.png
    old_montage = ROOT / "social" / f"{DATE}.png"
    if old_montage.exists():
        old_montage.unlink()

    old_names = set(EXPORT_FILES) | {
        "manifest.json",
        "strict_clean_map.json",
        "contact_sheet_strict_clean.jpg",
        f"isla_v3_STRICT_CLEAN_{DATE}.zip",
        f"isla_v3_daily_set_{DATE}.zip",
    }
    old_names.update(f"{i:02d}_strict_clean.png" for i in range(1, 7))

    for folder in (OUT_DIR, LATEST_DIR):
        for name in old_names:
            target = folder / name
            if target.exists():
                target.unlink()


def write_manifest(story: dict, rows: list[dict]) -> dict:
    daily_story_path = ROOT / "daily" / f"{DATE}.json"
    story_source = daily_story_path if daily_story_path.exists() else ROOT / "latest.json"

    manifest = {
        "date": DATE,
        "character": CHARACTER,
        "format": "eight_image_daily_set",
        "montage": False,
        "files": EXPORT_FILES,
        "post_order": EXPORT_FILES,
        "archive_dir": str(OUT_DIR.relative_to(ROOT)),
        "latest_dir": str(LATEST_DIR.relative_to(ROOT)),
        "story_source": str(story_source.relative_to(ROOT)) if story_source.exists() else "",
        "puzzle_product": "Trigoku Daily Lock",
        "puzzle_url": "https://suite.sapiverpress.co.uk",
        "captions": [base.caption_for_scene(story, i) for i in range(6)],
        "scenes": rows,
    }

    manifest_path = OUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def mirror_latest() -> None:
    LATEST_DIR.mkdir(parents=True, exist_ok=True)
    for name in EXPORT_FILES + ["manifest.json"]:
        shutil.copy2(OUT_DIR / name, LATEST_DIR / name)


def main() -> None:
    captures = base.map_captures()
    if not captures:
        base.run_fallback()
        return

    clear_old_outputs()

    story = base.read_story()
    scenes = (story.get("scenes") or [])[:6]
    while len(scenes) < 6:
        scenes.append({"id": f"scene_{len(scenes)+1:02d}", "caption": base.DEFAULT_CAPTIONS[len(scenes)]})

    # 00: close-up of the untouched starter grid.
    save_png(crop_capture_to_game(captures[0]), OUT_DIR / EXPORT_FILES[0])

    rows: list[dict] = []
    intermediate_paths: list[Path] = []
    for index, scene in enumerate(scenes[:6]):
        panel_path, row = base.compose_panel(story, scene, index, captures[index])
        final_path = OUT_DIR / EXPORT_FILES[index + 1]
        shutil.move(str(panel_path), str(final_path))
        row["output"] = str(final_path.relative_to(ROOT))
        rows.append(row)
        intermediate_paths.append(panel_path)

    # 07: close-up of the completed/solution grid.
    save_png(crop_capture_to_game(captures[5]), OUT_DIR / EXPORT_FILES[7])

    # Remove any leftover strict-clean intermediates if present.
    for path in intermediate_paths:
        if path.exists():
            path.unlink()

    manifest = write_manifest(story, rows)
    mirror_latest()

    print(f"Eight-image daily set written: {manifest['archive_dir']}")
    print(f"Latest mirror written: {manifest['latest_dir']}")


if __name__ == "__main__":
    main()
