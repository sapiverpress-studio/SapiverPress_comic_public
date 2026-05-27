#!/usr/bin/env python3
"""Fallback Isla compositor.

Secondary only. Rebuilds a clean puzzle screen from today_trigoku_data.json
when real extracted captures are unavailable. Uses the same locked Isla quads.
"""
from __future__ import annotations

import json
import os
import zipfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DATE = os.environ.get("DATE_OVERRIDE") or datetime.now(ZoneInfo("Europe/London")).strftime("%Y-%m-%d")
CHARACTER = "isla"
TEMPLATE_DIR = ROOT / "templates" / "characters" / CHARACTER
CAPTURE_DIR = ROOT / "captures" / DATE / "extracted"
OUT_DIR = ROOT / "social" / DATE
SOCIAL_MAIN = ROOT / "social" / f"{DATE}.png"

SCREEN_QUADS = {
    "scene_01": [(592, 405), (1018, 421), (982, 756), (571, 724)],
    "scene_02": [(610, 458), (1050, 474), (1026, 760), (588, 744)],
    "scene_03": [(548, 550), (955, 570), (928, 865), (520, 838)],
    "scene_04": [(612, 404), (1052, 414), (1025, 760), (580, 736)],
    "scene_05": [(617, 502), (1036, 520), (1008, 860), (587, 837)],
    "scene_06": [(652, 707), (1071, 721), (1040, 1010), (624, 952)],
}

DEFAULT_IMAGE_REFS = [
    "isla_01_opening_return.png",
    "isla_02_first_move.png",
    "isla_03_stuck_moment.png",
    "isla_04_breakthrough.png",
    "isla_05_finish.png",
    "isla_06_tomorrow_set.png",
]
DEFAULT_CAPTIONS = [
    "Yesterday is gone. This is today's lock.",
    "The first certainty is never the finish.",
    "She pauses before guessing.",
    "Column logic opens the middle.",
    "The grid starts to give way.",
    "Tomorrow earns its place.",
]


def fail(message: str) -> None:
    raise SystemExit(f"FALLBACK COMPOSITOR FAILED: {message}")


def data_path() -> Path:
    for path in [CAPTURE_DIR / "today_trigoku_data.json", ROOT / "today_trigoku_data.json"]:
        if path.exists():
            return path
    fail("today_trigoku_data.json is missing; fallback cannot rebuild puzzle screen")


def read_story() -> dict:
    daily_path = ROOT / "daily" / f"{DATE}.json"
    story_path = daily_path if daily_path.exists() else ROOT / "latest.json"
    if not story_path.exists():
        return {"scenes": []}
    story = json.loads(story_path.read_text(encoding="utf-8-sig"))
    story["character_id"] = CHARACTER
    story["character_name"] = "Isla"
    return story


def load_font(size: int, bold: bool = False):
    for name in ["DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", "Arial.ttf"]:
        try:
            return ImageFont.truetype(name, size=size)
        except OSError:
            pass
    return ImageFont.load_default()


def get_grid_values(data: dict) -> list[list[str]]:
    for key in ["grid", "puzzle", "solution", "values"]:
        value = data.get(key)
        if isinstance(value, list) and len(value) >= 9:
            rows = []
            for row in value[:9]:
                if isinstance(row, list):
                    rows.append([str(x or "") for x in row[:9]])
                elif isinstance(row, str):
                    rows.append([c if c not in ".0" else "" for c in row[:9]])
            if len(rows) == 9:
                return rows
    return [["" for _ in range(9)] for _ in range(9)]


def build_screen(data: dict, scene_index: int) -> Image.Image:
    canvas = Image.new("RGB", (1200, 820), "#071225")
    draw = ImageDraw.Draw(canvas)
    title_font = load_font(42, True)
    num_font = load_font(32, True)
    small_font = load_font(22)
    draw.text((60, 34), f"Sapiver Press Trigoku — {DATE}", font=title_font, fill="#e8f0ff")
    draw.text((60, 92), "Fallback rebuilt from today_trigoku_data.json", font=small_font, fill="#93a4c7")
    rows = get_grid_values(data)
    size = 540
    left = (1200 - size) // 2
    top = 170
    cell = size // 9
    draw.rounded_rectangle((left - 18, top - 18, left + size + 18, top + size + 18), radius=30, fill="#0f1b35", outline="#7aa7ff", width=3)
    for i in range(10):
        width = 4 if i % 3 == 0 else 1
        x = left + i * cell
        y = top + i * cell
        draw.line((x, top, x, top + size), fill="#d8e5ff", width=width)
        draw.line((left, y, left + size, y), fill="#d8e5ff", width=width)
    for r in range(9):
        for c in range(9):
            v = rows[r][c]
            if v:
                bbox = draw.textbbox((0, 0), v, font=num_font)
                x = left + c * cell + (cell - (bbox[2] - bbox[0])) / 2
                y = top + r * cell + (cell - (bbox[3] - bbox[1])) / 2 - 2
                draw.text((x, y), v, font=num_font, fill="#ffffff")
    draw.text((60, 750), f"Scene {scene_index + 1}/6", font=small_font, fill="#93a4c7")
    return canvas


def perspective_coeffs(src_quad, dst_quad):
    import numpy as np
    matrix = []
    vector = []
    for (x, y), (u, v) in zip(dst_quad, src_quad):
        matrix.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        matrix.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        vector.extend([u, v])
    return np.linalg.solve(np.array(matrix, dtype=float), np.array(vector, dtype=float)).tolist()


def warp_to_quad(screen: Image.Image, template_size, quad):
    src = [(0, 0), (screen.width, 0), (screen.width, screen.height), (0, screen.height)]
    coeffs = perspective_coeffs(src, quad)
    warped = screen.convert("RGBA").transform(template_size, Image.Transform.PERSPECTIVE, coeffs, Image.Resampling.BICUBIC)
    mask = Image.new("L", screen.size, 255).transform(template_size, Image.Transform.PERSPECTIVE, coeffs, Image.Resampling.BICUBIC)
    warped.putalpha(mask)
    return warped


def wrap_text(text: str, font, max_width: int) -> list[str]:
    words = str(text or "").split()
    lines, line = [], ""
    probe = Image.new("RGB", (10, 10))
    draw = ImageDraw.Draw(probe)
    for word in words:
        test = f"{line} {word}".strip()
        if line and draw.textbbox((0, 0), test, font=font)[2] > max_width:
            lines.append(line)
            line = word
        else:
            line = test
    if line:
        lines.append(line)
    return lines[:2]


def add_caption(panel: Image.Image, caption: str) -> None:
    draw = ImageDraw.Draw(panel, "RGBA")
    font = load_font(34)
    lines = wrap_text(caption, font, panel.width - 180)
    if not lines:
        return
    h = 44 + 42 * len(lines)
    x0, y0, x1, y1 = 64, panel.height - h - 54, panel.width - 64, panel.height - 54
    draw.rounded_rectangle((x0, y0, x1, y1), radius=22, fill=(255, 255, 255, 218), outline=(21, 32, 54, 185), width=2)
    y = y0 + 22
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        draw.text(((panel.width - (bbox[2] - bbox[0])) / 2, y), line, font=font, fill=(20, 24, 33, 255))
        y += 42


def find_template(index: int) -> Path:
    candidates = [TEMPLATE_DIR / DEFAULT_IMAGE_REFS[index], *sorted(TEMPLATE_DIR.glob(f"isla_{index+1:02d}_*.png"))]
    for path in candidates:
        if path.exists():
            return path
    fail(f"Missing Isla template for scene {index + 1}")


def make_contact_sheet(panel_paths: list[Path], out: Path, thumb_w: int = 520) -> None:
    thumbs = []
    for path in panel_paths:
        img = Image.open(path).convert("RGB")
        ratio = thumb_w / img.width
        thumbs.append(img.resize((thumb_w, int(img.height * ratio)), Image.Resampling.LANCZOS))
    gap, margin = 28, 36
    sheet = Image.new("RGB", (margin * 2 + thumb_w * 2 + gap, margin * 2 + thumbs[0].height * 3 + gap * 2), "#0b1533")
    for i, img in enumerate(thumbs):
        sheet.paste(img, (margin + (i % 2) * (thumb_w + gap), margin + (i // 2) * (img.height + gap)))
    sheet.save(out, quality=92)


def make_social_strip(panel_paths: list[Path], out: Path) -> None:
    panels = [Image.open(path).convert("RGB") for path in panel_paths]
    target_w, gap, margin = 720, 28, 36
    resized = [p.resize((target_w, int(p.height * target_w / p.width)), Image.Resampling.LANCZOS) for p in panels]
    strip = Image.new("RGB", (margin * 2 + target_w * 2 + gap, margin * 2 + resized[0].height * 3 + gap * 2), "#0b1533")
    for i, img in enumerate(resized):
        strip.paste(img, (margin + (i % 2) * (target_w + gap), margin + (i // 2) * (img.height + gap)))
    out.parent.mkdir(parents=True, exist_ok=True)
    strip.save(out)


def main() -> None:
    data = json.loads(data_path().read_text(encoding="utf-8-sig"))
    story = read_story()
    scenes = story.get("scenes") or []
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    panel_paths = []
    map_rows = []
    for i in range(6):
        scene_id = f"scene_{i+1:02d}"
        quad = SCREEN_QUADS[scene_id]
        template = Image.open(find_template(i)).convert("RGBA")
        screen = build_screen(data, i)
        panel = template.copy()
        panel.alpha_composite(warp_to_quad(screen, template.size, quad))
        ImageDraw.Draw(panel, "RGBA").line(quad + [quad[0]], fill=(255, 255, 255, 190), width=3)
        caption = scenes[i].get("caption") if i < len(scenes) and isinstance(scenes[i], dict) else DEFAULT_CAPTIONS[i]
        add_caption(panel, caption or DEFAULT_CAPTIONS[i])
        out = OUT_DIR / f"{i+1:02d}_strict_clean.png"
        panel.convert("RGB").save(out, quality=95)
        panel_paths.append(out)
        map_rows.append({"scene": scene_id, "output": str(out.relative_to(ROOT)), "screen_quad": quad, "fallback": True})
    contact = OUT_DIR / "contact_sheet_strict_clean.jpg"
    make_contact_sheet(panel_paths, contact)
    make_social_strip(panel_paths, SOCIAL_MAIN)
    map_path = OUT_DIR / "strict_clean_map.json"
    map_path.write_text(json.dumps({"date": DATE, "character": CHARACTER, "compositor": "compose_isla_crisp_grid.py", "fallback": True, "scenes": map_rows, "contact_sheet": str(contact.relative_to(ROOT)), "social_main": str(SOCIAL_MAIN.relative_to(ROOT))}, indent=2), encoding="utf-8")
    zip_path = OUT_DIR / f"isla_v3_STRICT_CLEAN_{DATE}.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in panel_paths + [contact, map_path, SOCIAL_MAIN]:
            zf.write(path, arcname=path.name)
    print(f"Fallback Isla comic written: {SOCIAL_MAIN.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
