#!/usr/bin/env python3
"""Sapiver Press strict Isla compositor.

Uses real extracted puzzle captures, exact locked Isla perspective screen quads,
and clean caption overlays. It refuses to fake puzzle content.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DATE = os.environ.get("DATE_OVERRIDE") or datetime.now(ZoneInfo("Europe/London")).strftime("%Y-%m-%d")
CHARACTER = os.environ.get("COMIC_CHARACTER", "isla").strip().lower() or "isla"
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

EXPECTED_CAPTURE_NAMES = [
    "01_fresh_daily_grid.png",
    "02_first_moves.png",
    "03_stuck_moment.png",
    "04_breakthrough.png",
    "05_nearly_complete.png",
    "06_complete_solution.png",
]

DEFAULT_CAPTIONS = [
    "Yesterday is gone. This is today's lock.",
    "The first certainty is never the finish.",
    "She pauses before guessing.",
    "Column logic opens the middle.",
    "The grid starts to give way.",
    "Tomorrow earns its place.",
]

DEFAULT_IMAGE_REFS = [
    "isla_01_opening_return.png",
    "isla_02_first_move.png",
    "isla_03_stuck_moment.png",
    "isla_04_breakthrough.png",
    "isla_05_finish.png",
    "isla_06_tomorrow_set.png",
]


def fail(message: str) -> None:
    raise SystemExit(f"STRICT COMPOSITOR FAILED: {message}")


def read_story() -> dict:
    daily_path = ROOT / "daily" / f"{DATE}.json"
    story_path = daily_path if daily_path.exists() else ROOT / "latest.json"
    if not story_path.exists():
        fail(f"Missing daily/{DATE}.json and latest.json")
    with story_path.open("r", encoding="utf-8-sig") as f:
        story = json.load(f)
    story["character_id"] = CHARACTER
    story["character_name"] = "Isla"
    return story


def find_template(scene: dict, index: int) -> Path:
    candidates = []
    image_ref = scene.get("image_ref") or ""
    if image_ref.startswith("isla_"):
        candidates.append(image_ref)
    candidates.append(DEFAULT_IMAGE_REFS[index])
    candidates.extend([p.name for p in sorted(TEMPLATE_DIR.glob(f"isla_{index+1:02d}_*.png"))])
    for name in dict.fromkeys(candidates):
        path = TEMPLATE_DIR / name
        if path.exists():
            return path
    fail(f"Missing Isla template for scene {index + 1} in {TEMPLATE_DIR}")


def map_captures() -> list[Path]:
    if not CAPTURE_DIR.exists():
        return []
    expected = [CAPTURE_DIR / name for name in EXPECTED_CAPTURE_NAMES]
    if all(p.exists() for p in expected):
        return expected
    images = sorted(
        p for p in CAPTURE_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
    )
    return images[:6] if len(images) >= 6 else []


def fallback_data_exists() -> bool:
    return (CAPTURE_DIR / "today_trigoku_data.json").exists() or (ROOT / "today_trigoku_data.json").exists()


def run_fallback() -> None:
    script = ROOT / "scripts" / "compose_isla_crisp_grid.py"
    if not script.exists():
        fail("Captures missing and fallback script is not present")
    if not fallback_data_exists():
        fail(
            f"No real captures found in {CAPTURE_DIR}. Refusing to invent puzzle content. "
            "Fallback requires today_trigoku_data.json."
        )
    subprocess.run([sys.executable, str(script)], cwd=str(ROOT), check=True)


def perspective_coeffs(src_quad, dst_quad):
    matrix = []
    vector = []
    for (x, y), (u, v) in zip(dst_quad, src_quad):
        matrix.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        matrix.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        vector.extend([u, v])
    try:
        import numpy as np
        return np.linalg.solve(np.array(matrix, dtype=float), np.array(vector, dtype=float)).tolist()
    except Exception as exc:
        fail(f"Could not compute perspective transform: {exc}")


def crop_capture_to_game(path: Path) -> Image.Image:
    img = Image.open(path).convert("RGB")
    w, h = img.size
    cropped = img.crop((int(0.06 * w), int(0.17 * h), int(0.94 * w), int(0.68 * h)))
    canvas = Image.new("RGB", (1200, 820), "#071225")
    cropped.thumbnail((1120, 740), Image.Resampling.LANCZOS)
    canvas.paste(cropped, ((1200 - cropped.width) // 2, (820 - cropped.height) // 2))
    return canvas


def load_font(size: int, bold: bool = False):
    for name in ["DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", "Arial.ttf"]:
        try:
            return ImageFont.truetype(name, size=size)
        except OSError:
            pass
    return ImageFont.load_default()


def wrap_text(text: str, font, max_width: int) -> list[str]:
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
    lines.append(current)
    return lines[:2]


def caption_for_scene(story: dict, index: int) -> str:
    scenes = story.get("scenes") or []
    if index < len(scenes) and scenes[index].get("caption"):
        return scenes[index]["caption"]
    return DEFAULT_CAPTIONS[index]


def add_caption(panel: Image.Image, caption: str) -> None:
    draw = ImageDraw.Draw(panel, "RGBA")
    font = load_font(34)
    lines = wrap_text(caption, font, panel.width - 180)
    if not lines:
        return
    line_h = 42
    box_h = 44 + line_h * len(lines)
    x0, y0 = 64, panel.height - box_h - 54
    x1, y1 = panel.width - 64, panel.height - 54
    draw.rounded_rectangle((x0, y0, x1, y1), radius=22, fill=(255, 255, 255, 218), outline=(21, 32, 54, 185), width=2)
    y = y0 + 22
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        draw.text(((panel.width - (bbox[2] - bbox[0])) / 2, y), line, font=font, fill=(20, 24, 33, 255))
        y += line_h


def warp_to_quad(screen: Image.Image, template_size: tuple[int, int], quad: list[tuple[int, int]]) -> Image.Image:
    src = [(0, 0), (screen.width, 0), (screen.width, screen.height), (0, screen.height)]
    coeffs = perspective_coeffs(src, quad)
    warped = screen.convert("RGBA").transform(template_size, Image.Transform.PERSPECTIVE, coeffs, Image.Resampling.BICUBIC)
    mask = Image.new("L", screen.size, 255).transform(template_size, Image.Transform.PERSPECTIVE, coeffs, Image.Resampling.BICUBIC)
    warped.putalpha(mask)
    return warped


def compose_panel(story: dict, scene: dict, index: int, capture: Path) -> tuple[Path, dict]:
    scene_id = f"scene_{index + 1:02d}"
    quad = SCREEN_QUADS[scene_id]
    template_path = find_template(scene, index)
    template = Image.open(template_path).convert("RGBA")
    prepared = crop_capture_to_game(capture)
    panel = template.copy()
    panel.alpha_composite(warp_to_quad(prepared, template.size, quad))
    ImageDraw.Draw(panel, "RGBA").line(quad + [quad[0]], fill=(255, 255, 255, 190), width=3)
    add_caption(panel, caption_for_scene(story, index))
    out_path = OUT_DIR / f"{index + 1:02d}_strict_clean.png"
    panel.convert("RGB").save(out_path, quality=95)
    return out_path, {
        "scene": scene_id,
        "template": str(template_path.relative_to(ROOT)),
        "capture": str(capture.relative_to(ROOT)),
        "output": str(out_path.relative_to(ROOT)),
        "screen_quad": quad,
    }


def make_contact_sheet(panel_paths: list[Path], out: Path, thumb_w: int = 520) -> None:
    thumbs = []
    for path in panel_paths:
        img = Image.open(path).convert("RGB")
        ratio = thumb_w / img.width
        thumbs.append(img.resize((thumb_w, int(img.height * ratio)), Image.Resampling.LANCZOS))
    gap = 28
    margin = 36
    sheet = Image.new("RGB", (margin * 2 + thumb_w * 2 + gap, margin * 2 + thumbs[0].height * 3 + gap * 2), "#0b1533")
    for i, thumb in enumerate(thumbs):
        sheet.paste(thumb, (margin + (i % 2) * (thumb_w + gap), margin + (i // 2) * (thumb.height + gap)))
    sheet.save(out, quality=92)


def make_social_strip(panel_paths: list[Path], out: Path) -> None:
    panels = [Image.open(path).convert("RGB") for path in panel_paths]
    target_w = 720
    resized = []
    for img in panels:
        ratio = target_w / img.width
        resized.append(img.resize((target_w, int(img.height * ratio)), Image.Resampling.LANCZOS))
    gap = 28
    margin = 36
    strip = Image.new("RGB", (margin * 2 + target_w * 2 + gap, margin * 2 + resized[0].height * 3 + gap * 2), "#0b1533")
    for i, img in enumerate(resized):
        strip.paste(img, (margin + (i % 2) * (target_w + gap), margin + (i // 2) * (img.height + gap)))
    out.parent.mkdir(parents=True, exist_ok=True)
    strip.save(out)


def write_zip(paths: list[Path], zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in paths:
            zf.write(path, arcname=path.name)


def main() -> None:
    captures = map_captures()
    if not captures:
        run_fallback()
        return
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    story = read_story()
    scenes = (story.get("scenes") or [])[:6]
    while len(scenes) < 6:
        scenes.append({"id": f"scene_{len(scenes)+1:02d}", "caption": DEFAULT_CAPTIONS[len(scenes)]})
    panel_paths = []
    map_rows = []
    for index, scene in enumerate(scenes[:6]):
        panel_path, row = compose_panel(story, scene, index, captures[index])
        panel_paths.append(panel_path)
        map_rows.append(row)
    contact = OUT_DIR / "contact_sheet_strict_clean.jpg"
    make_contact_sheet(panel_paths, contact)
    make_social_strip(panel_paths, SOCIAL_MAIN)
    map_path = OUT_DIR / "strict_clean_map.json"
    payload = {
        "date": DATE,
        "character": CHARACTER,
        "compositor": "compose_v3_strict_clean.py",
        "capture_dir": str(CAPTURE_DIR.relative_to(ROOT)) if CAPTURE_DIR.exists() else str(CAPTURE_DIR),
        "outputs": [str(p.relative_to(ROOT)) for p in panel_paths],
        "contact_sheet": str(contact.relative_to(ROOT)),
        "social_main": str(SOCIAL_MAIN.relative_to(ROOT)),
        "scenes": map_rows,
    }
    map_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    zip_path = OUT_DIR / f"isla_v3_STRICT_CLEAN_{DATE}.zip"
    write_zip(panel_paths + [contact, map_path, SOCIAL_MAIN], zip_path)
    print(f"Strict clean comic written: {SOCIAL_MAIN.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
