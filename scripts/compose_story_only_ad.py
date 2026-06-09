#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import zipfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

ROOT = Path(__file__).resolve().parents[1]
DATE = os.environ.get("DATE_OVERRIDE") or datetime.now(ZoneInfo("Europe/London")).strftime("%Y-%m-%d")
OUT_DIR = ROOT / "social" / DATE
LATEST_DIR = ROOT / "social" / "latest"
REPLACEMENT_DIR = ROOT / "art-replacements" / DATE
LATEST_REPLACEMENT_DIR = ROOT / "art-replacements" / "latest"
PANEL_NAMES = [f"{i:02d}_panel-{i:02d}.png" for i in range(1, 7)]


def read_json(path: Path, fallback=None):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return fallback


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_font(size: int, bold: bool = False):
    for name in ["DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", "Arial.ttf"]:
        try:
            return ImageFont.truetype(name, size=size)
        except OSError:
            pass
    return ImageFont.load_default()


def wrap_text(text: str, font, max_width: int, max_lines: int) -> list[str]:
    words = str(text or "").replace("\n", " ").split()
    if not words:
        return []
    probe = Image.new("RGB", (10, 10))
    draw = ImageDraw.Draw(probe)
    lines = []
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


def fit_square(img: Image.Image, size: int = 1280) -> Image.Image:
    source = img.convert("RGB")
    ratio = max(size / source.width, size / source.height)
    resized = source.resize((int(source.width * ratio), int(source.height * ratio)), Image.Resampling.LANCZOS)
    left = (resized.width - size) // 2
    top = (resized.height - size) // 2
    return resized.crop((left, top, left + size, top + size)).convert("RGBA")


def caption_parts(story: dict, index: int) -> tuple[str, str]:
    scenes = story.get("scenes") or []
    if index < len(scenes):
        scene = scenes[index]
        return str(scene.get("storyboard_dialogue") or scene.get("dialogue") or "").strip(), str(scene.get("storyboard_caption") or scene.get("caption") or "").strip()
    return "", ""


def add_caption(panel: Image.Image, dialogue: str, caption: str) -> None:
    draw = ImageDraw.Draw(panel, "RGBA")
    max_width = panel.width - 150
    dialogue_font = load_font(34, True)
    caption_font = load_font(31, False)
    d_lines = wrap_text(dialogue, dialogue_font, max_width, 2) if dialogue else []
    c_lines = wrap_text(caption, caption_font, max_width, 3) if caption else []
    if not d_lines and not c_lines:
        return
    pad_y = 24
    gap = 10 if d_lines and c_lines else 0
    box_h = pad_y * 2 + len(d_lines) * 42 + gap + len(c_lines) * 38
    x0, y0 = 58, panel.height - box_h - 42
    x1, y1 = panel.width - 58, panel.height - 42
    draw.rounded_rectangle((x0, y0, x1, y1), radius=24, fill=(255, 255, 255, 232), outline=(21, 32, 54, 170), width=2)
    y = y0 + pad_y
    for line in d_lines:
        bbox = draw.textbbox((0, 0), line, font=dialogue_font)
        draw.text(((panel.width - (bbox[2] - bbox[0])) / 2, y), line, font=dialogue_font, fill=(15, 28, 45, 255))
        y += 42
    if d_lines and c_lines:
        y += gap
    for line in c_lines:
        bbox = draw.textbbox((0, 0), line, font=caption_font)
        draw.text(((panel.width - (bbox[2] - bbox[0])) / 2, y), line, font=caption_font, fill=(34, 36, 43, 255))
        y += 38


def panel_source(index: int) -> Path:
    name = PANEL_NAMES[index]
    for folder in [REPLACEMENT_DIR, LATEST_REPLACEMENT_DIR]:
        path = folder / name
        if path.exists():
            return path
    raise SystemExit(f"STORY ONLY COMPOSE FAILED: missing generated panel {name}")


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pnginfo = PngImagePlugin.PngInfo()
    pnginfo.add_text("sapiver_press_generated_at", datetime.now(ZoneInfo("Europe/London")).isoformat())
    pnginfo.add_text("sapiver_press_date", DATE)
    pnginfo.add_text("sapiver_press_mode", "story_only_product_ad")
    img.convert("RGB").save(path, pnginfo=pnginfo)


def clear_old() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    LATEST_DIR.mkdir(parents=True, exist_ok=True)
    for folder in [OUT_DIR, LATEST_DIR]:
        for name in ["00_start-grid.png", "07_finished-grid.png", "manifest.json", f"isla_v3_daily_set_{DATE}.zip", f"isla_story_only_product_ad_{DATE}.zip"] + PANEL_NAMES:
            p = folder / name
            if p.exists():
                p.unlink()


def write_zip(paths: list[Path], zip_path: Path) -> None:
    fixed = (2026, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in paths:
            info = zipfile.ZipInfo(path.name, fixed)
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, path.read_bytes())


def main() -> None:
    story = read_json(ROOT / "daily" / f"{DATE}.json", read_json(ROOT / "latest.json", {}))
    if not (story.get("product_ad_contract") or {}).get("story_only_no_screen"):
        raise SystemExit("STORY ONLY COMPOSE FAILED: story is not marked story_only_no_screen")
    clear_old()
    rows = []
    paths = []
    for index, name in enumerate(PANEL_NAMES):
        src = panel_source(index)
        img = fit_square(Image.open(src), 1280)
        dialogue, caption = caption_parts(story, index)
        add_caption(img, dialogue, caption)
        out = OUT_DIR / name
        save_png(img, out)
        paths.append(out)
        scene = (story.get("scenes") or [{}] * 6)[index]
        rows.append({
            "panel": index + 1,
            "scene": scene.get("id") or f"scene_{index + 1:02d}",
            "art_source": "replacement",
            "replacement": str(src.relative_to(ROOT)),
            "output": str(out.relative_to(ROOT)),
            "panel_screen_state": "story_only_no_screen",
            "screen_quad_mode": "not_required_story_only",
            "screen_quad": [],
            "storyboard_dialogue": dialogue,
            "storyboard_caption": caption,
            "arc_role": scene.get("arc_role") or "",
            "panel_location": scene.get("panel_location") or "",
            "panel_action": scene.get("panel_action") or "",
            "panel_pose_family": scene.get("panel_pose_family") or "",
        })
    manifest = {
        "date": DATE,
        "character": "isla",
        "format": "six_panel_product_ad_story",
        "product_ad_output_mode": "story_only_no_screen",
        "files": PANEL_NAMES,
        "post_order": PANEL_NAMES,
        "archive_dir": str(OUT_DIR.relative_to(ROOT)),
        "latest_dir": str(LATEST_DIR.relative_to(ROOT)),
        "storyboard_arc_title": story.get("storyboard_arc_title"),
        "storyboard_arc_type": story.get("storyboard_arc_type"),
        "product_referenced": story.get("product_referenced"),
        "product_ad_contract": story.get("product_ad_contract"),
        "post_ready_contract": story.get("post_ready_contract", {}),
        "puzzle_product": story.get("product_referenced", {}).get("name") or "Commercial Sudoku Publisher Starter Pack",
        "puzzle_url": story.get("product_referenced", {}).get("url") or "https://sapiverpress.etsy.com",
        "scenes": rows,
        "captions": [f"{r['storyboard_dialogue']}\n{r['storyboard_caption']}".strip() for r in rows],
        "puzzle_clips_removed": True,
    }
    manifest_path = OUT_DIR / "manifest.json"
    write_json(manifest_path, manifest)
    zip_path = OUT_DIR / f"isla_story_only_product_ad_{DATE}.zip"
    write_zip(paths + [manifest_path], zip_path)
    for p in paths + [manifest_path, zip_path]:
        shutil.copy2(p, LATEST_DIR / p.name)
    print(f"Story-only product advert written: {OUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
