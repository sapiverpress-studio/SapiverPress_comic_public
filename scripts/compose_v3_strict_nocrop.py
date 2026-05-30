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

from PIL import Image, ImageDraw, PngImagePlugin

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

ARC_KEYS = ["setup", "disruption", "choice", "puzzle_moment", "consequence", "resolution"]


def crop_capture_to_game(path: Path) -> Image.Image:
    """Prepare a focused puzzle close-up for screen insertion and standalone export."""
    img = Image.open(path).convert("RGB")
    canvas = Image.new("RGB", (1200, 820), "#071225")
    img.thumbnail((1140, 760), Image.Resampling.LANCZOS)
    canvas.paste(img, ((1200 - img.width) // 2, (820 - img.height) // 2))
    return canvas


base.crop_capture_to_game = crop_capture_to_game


def wrap_text_lines(text: str, font, max_width: int, max_lines: int) -> list[str]:
    words = str(text or "").replace("\n", " ").split()
    if not words:
        return []
    probe = Image.new("RGB", (10, 10))
    draw = ImageDraw.Draw(probe)
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        test = f"{current} {word}"
        if draw.textbbox((0, 0), test, font=font)[2] <= max_width:
            current = test
        else:
            lines.append(current)
            current = word
            if len(lines) >= max_lines:
                break
    if len(lines) < max_lines:
        lines.append(current)
    return lines[:max_lines]


def scene_text_parts(story: dict, index: int) -> tuple[str, str]:
    scenes = story.get("scenes") or []
    if index < len(scenes):
        scene = scenes[index]
        dialogue = str(scene.get("storyboard_dialogue") or scene.get("dialogue") or scene.get("speech_bubble") or "").strip()
        caption = str(scene.get("storyboard_caption") or scene.get("caption") or "").strip()
        return dialogue, caption or base.DEFAULT_CAPTIONS[index]
    return "", base.DEFAULT_CAPTIONS[index]


def caption_for_scene(story: dict, index: int) -> str:
    dialogue, caption = scene_text_parts(story, index)
    return f"{dialogue}\n{caption}" if dialogue else caption


def add_storyboard_caption(panel: Image.Image, text: str) -> None:
    if "\n" in str(text or ""):
        dialogue, caption = str(text).split("\n", 1)
    else:
        dialogue, caption = "", str(text or "")

    dialogue = dialogue.strip()
    caption = caption.strip()
    if not dialogue and not caption:
        return

    draw = ImageDraw.Draw(panel, "RGBA")
    max_width = panel.width - 170
    dialogue_font = base.load_font(31, bold=True)
    caption_font = base.load_font(29)
    dialogue_lines = wrap_text_lines(dialogue, dialogue_font, max_width, 2) if dialogue else []
    caption_lines = wrap_text_lines(caption, caption_font, max_width, 3) if caption else []

    line_h_dialogue = 39
    line_h_caption = 36
    pad_y = 22
    gap = 10 if dialogue_lines and caption_lines else 0
    box_h = pad_y * 2 + len(dialogue_lines) * line_h_dialogue + gap + len(caption_lines) * line_h_caption
    x0, y0 = 64, panel.height - box_h - 48
    x1, y1 = panel.width - 64, panel.height - 48

    draw.rounded_rectangle((x0, y0, x1, y1), radius=24, fill=(255, 255, 255, 226), outline=(21, 32, 54, 190), width=2)
    y = y0 + pad_y

    if dialogue_lines:
        for line in dialogue_lines:
            bbox = draw.textbbox((0, 0), line, font=dialogue_font)
            draw.text(((panel.width - (bbox[2] - bbox[0])) / 2, y), line, font=dialogue_font, fill=(15, 28, 45, 255))
            y += line_h_dialogue
        y += gap

    for line in caption_lines:
        bbox = draw.textbbox((0, 0), line, font=caption_font)
        draw.text(((panel.width - (bbox[2] - bbox[0])) / 2, y), line, font=caption_font, fill=(34, 36, 43, 255))
        y += line_h_caption


base.caption_for_scene = caption_for_scene
base.add_caption = add_storyboard_caption


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


def default_storyboard_arc(story: dict) -> dict:
    scenes = story.get("scenes") or []
    return {
        key: str((scenes[index] if index < len(scenes) else {}).get("storyboard_caption") or (scenes[index] if index < len(scenes) else {}).get("caption") or "")
        for index, key in enumerate(ARC_KEYS)
    }


def default_storyboard_quality(story: dict) -> dict:
    quality = story.get("storyboard_quality") or {}
    return {
        "location_sequence_only": bool(quality.get("location_sequence_only", False)),
        "has_cause_effect": bool(quality.get("has_cause_effect", False)),
        "has_character_turn": bool(quality.get("has_character_turn", False)),
        "uses_phase2_story": bool(quality.get("uses_phase2_story", bool(story.get("story_note") or story.get("continuation_note") or story.get("life_memory_entry")))),
        "quality_gate_passed": bool(quality.get("quality_gate_passed", False)),
        "interchangeable": bool(quality.get("interchangeable", False)),
        "generic_phrase_hits": quality.get("generic_phrase_hits", []),
        "final_lint_passed": bool(quality.get("final_lint_passed", False)),
        "final_banned_word_hits": quality.get("final_banned_word_hits", []),
        "copy_repetition_lint": quality.get("copy_repetition_lint", {}),
    }


def write_manifest(story: dict, rows: list[dict]) -> dict:
    daily_story_path = ROOT / "daily" / f"{DATE}.json"
    story_source = daily_story_path if daily_story_path.exists() else ROOT / "latest.json"
    storyboard_arc = story.get("storyboard_arc") or default_storyboard_arc(story)
    storyboard_quality = story.get("storyboard_quality") or default_storyboard_quality(story)

    manifest = {
        "date": DATE,
        "character": CHARACTER,
        "format": "eight_image_daily_set_storyboard_text",
        "montage": False,
        "files": EXPORT_FILES,
        "post_order": EXPORT_FILES,
        "archive_dir": str(OUT_DIR.relative_to(ROOT)),
        "latest_dir": str(LATEST_DIR.relative_to(ROOT)),
        "story_source": str(story_source.relative_to(ROOT)) if story_source.exists() else "",
        "story_source_used": story.get("story_source_used") or (str(story_source.relative_to(ROOT)) if story_source.exists() else ""),
        "story_fields_used": story.get("story_fields_used") or [],
        "storyboard_copy_source": story.get("storyboard_copy_source") or "unknown",
        "storyboard_copy_model": story.get("storyboard_copy_model") or "unknown",
        "storyboard_arc_title": story.get("storyboard_arc_title") or "",
        "storyboard_arc_type": story.get("storyboard_arc_type") or "story_driven_not_location_driven",
        "storyboard_arc": storyboard_arc,
        "storyboard_quality": storyboard_quality,
        "openai_storyboard_status": story.get("openai_storyboard_status"),
        "openai_storyboard_model": story.get("openai_storyboard_model"),
        "openai_storyboard_response_shape": story.get("openai_storyboard_response_shape"),
        "openai_storyboard_fallback_reason": story.get("openai_storyboard_fallback_reason"),
        "openai_storyboard_checked_at": story.get("openai_storyboard_checked_at"),
        "variant_recap": story.get("variant_recap") or {},
        "puzzle_product": "Trigoku Daily Lock",
        "puzzle_url": "https://suite.sapiverpress.co.uk",
        "captions": [caption_for_scene(story, i) for i in range(6)],
        "storyboard_locations": story.get("storyboard_locations") or [],
        "scenes": rows,
    }

    manifest_path = OUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def mirror_latest() -> None:
    LATEST_DIR.mkdir(parents=True, exist_ok=True)
    for name in EXPORT_FILES + ["manifest.json"]:
        shutil.copy2(OUT_DIR / name, LATEST_DIR / name)


def compose_panel_with_template_recovery(story: dict, scene: dict, index: int, capture: Path) -> tuple[Path, dict]:
    panel_path, row = base.compose_panel(story, scene, index, capture)
    if row.get("screen_quad_mode") != "overlay_skipped_no_screen_detected" or row.get("art_source") != "replacement":
        return panel_path, row

    replacement_path = ROOT / row.get("art_path", "")
    disabled_path = replacement_path.with_suffix(replacement_path.suffix + ".screenfail")
    print(f"Replacement screen missing for scene_{index + 1:02d}; recomposing from locked template")

    if replacement_path.exists():
        if disabled_path.exists():
            disabled_path.unlink()
        replacement_path.rename(disabled_path)
    try:
        recovered_path, recovered_row = base.compose_panel(story, scene, index, capture)
        recovered_row["recovered_from_missing_replacement_screen"] = True
        recovered_row["failed_replacement"] = str(replacement_path.relative_to(ROOT)) if replacement_path.exists() or disabled_path.exists() else row.get("art_path", "")
        return recovered_path, recovered_row
    finally:
        if disabled_path.exists():
            disabled_path.rename(replacement_path)


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

    save_png(crop_capture_to_game(captures[0]), OUT_DIR / EXPORT_FILES[0])

    rows: list[dict] = []
    intermediate_paths: list[Path] = []
    for index, scene in enumerate(scenes[:6]):
        panel_path, row = compose_panel_with_template_recovery(story, scene, index, captures[index])
        final_path = OUT_DIR / EXPORT_FILES[index + 1]
        shutil.move(str(panel_path), str(final_path))
        row["output"] = str(final_path.relative_to(ROOT))
        row["storyboard_text"] = caption_for_scene(story, index)
        row["arc_role"] = scene.get("arc_role") or (ARC_KEYS[index] if index < len(ARC_KEYS) else "")
        row["storyboard_caption"] = scene.get("storyboard_caption") or scene.get("caption") or ""
        row["storyboard_dialogue"] = scene.get("storyboard_dialogue") or scene.get("dialogue") or scene.get("speech_bubble") or ""
        row["panel_location"] = scene.get("panel_location") or scene.get("setting") or ""
        rows.append(row)
        intermediate_paths.append(panel_path)

    save_png(crop_capture_to_game(captures[5]), OUT_DIR / EXPORT_FILES[7])

    for path in intermediate_paths:
        if path.exists():
            path.unlink()

    manifest = write_manifest(story, rows)
    mirror_latest()

    print(f"Eight-image daily set written: {manifest['archive_dir']}")
    print(f"Latest mirror written: {manifest['latest_dir']}")
    print(f"Storyboard source: {manifest['storyboard_copy_source']}")
    print(f"Storyboard arc type: {manifest['storyboard_arc_type']}")


if __name__ == "__main__":
    main()
