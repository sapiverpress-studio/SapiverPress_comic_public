#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

ROOT = Path(__file__).resolve().parents[1]
DATE = os.environ.get("DATE_OVERRIDE") or datetime.now(ZoneInfo("Europe/London")).strftime("%Y-%m-%d")
SOCIAL_DIR = ROOT / "social" / DATE
LATEST_DIR = ROOT / "social" / "latest"

PANEL_FILES = [
    "01_panel-01.png",
    "02_panel-02.png",
    "03_panel-03.png",
    "04_panel-04.png",
    "05_panel-05.png",
    "06_panel-06.png",
]

NOTE_LINES = {
    "home": ["SP Notes", "One quiet page", "before the day"],
    "train": ["Travel Note", "Keep the thread", "between stops"],
    "rainy_window": ["Window Note", "Rain outside", "quiet inside"],
    "cafe": ["Cafe Note", "Coffee first", "then the grid"],
    "coworking": ["Desk Note", "One clear move", "back to work"],
    "bookshop": ["Bookshop Note", "One more page", "Sapiver Press"],
    "public_library": ["Library Note", "Borrowed quiet", "small proof"],
    "library_study": ["Library Note", "Old shelves", "new page"],
}


def load_font(size: int, bold: bool = False):
    for name in ["DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", "Arial.ttf"]:
        try:
            return ImageFont.truetype(name, size=size)
        except OSError:
            pass
    return ImageFont.load_default()


def read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return fallback


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pnginfo = PngImagePlugin.PngInfo()
    pnginfo.add_text("sapiver_press_scene_notes", "controlled_overlay")
    pnginfo.add_text("sapiver_press_date", DATE)
    img.convert("RGB").save(path, pnginfo=pnginfo)


def scene_key(scene: dict) -> str:
    return str(scene.get("location_key") or scene.get("location") or "library_study").strip() or "library_study"


def add_note_card(img: Image.Image, lines: list[str]) -> None:
    draw = ImageDraw.Draw(img, "RGBA")
    title_font = load_font(24, bold=True)
    body_font = load_font(22)
    width = 290
    line_h = 30
    height = 34 + line_h * len(lines)
    x1 = img.width - 54
    x0 = x1 - width
    y0 = 62
    y1 = y0 + height

    draw.rounded_rectangle((x0, y0, x1, y1), radius=16, fill=(248, 239, 214, 215), outline=(73, 52, 30, 165), width=2)
    y = y0 + 17
    for i, line in enumerate(lines):
        font = title_font if i == 0 else body_font
        fill = (63, 43, 24, 255) if i == 0 else (78, 58, 39, 248)
        draw.text((x0 + 22, y), line, font=font, fill=fill)
        y += line_h


def main() -> None:
    story = read_json(ROOT / "daily" / f"{DATE}.json", read_json(ROOT / "latest.json", {}))
    scenes = (story.get("scenes") or [])[:6]
    summary = {
        "date": DATE,
        "status": "complete",
        "purpose": "Add controlled readable Sapiver Press scene notes after composition.",
        "files": [],
    }

    for index, name in enumerate(PANEL_FILES):
        path = SOCIAL_DIR / name
        if not path.exists():
            summary["files"].append({"file": name, "status": "missing"})
            continue
        scene = scenes[index] if index < len(scenes) else {}
        key = scene_key(scene)
        lines = NOTE_LINES.get(key, NOTE_LINES["library_study"])
        if scene.get("variant_recap_here"):
            lines = ["Puzzle Note", "Check the rule", "then move"]
        elif index == 5:
            lines = ["SP Notes", "Clearer now", "tomorrow waits"]

        img = Image.open(path).convert("RGBA")
        add_note_card(img, lines)
        save_png(img, path)
        latest_path = LATEST_DIR / name
        latest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, latest_path)
        summary["files"].append({"file": name, "status": "noted", "location_key": key, "lines": lines})

    out = SOCIAL_DIR / "scene-note-overlays.json"
    out.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    shutil.copy2(out, LATEST_DIR / "scene-note-overlays.json")
    print("Scene note overlays applied")


if __name__ == "__main__":
    main()
