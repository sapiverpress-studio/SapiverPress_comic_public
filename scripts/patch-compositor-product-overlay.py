#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "scripts" / "compose_v3_strict_clean.py"
text = TARGET.read_text(encoding="utf-8")
changed = False

helper = r'''

def product_ad_mode(story: dict | None) -> bool:
    story = story or {}
    return bool((story.get("product_ad_contract") or {}).get("enabled") or (story.get("puzzle_state") or {}).get("ad_mode"))


def scene_has_product_overlay(scene: dict | None) -> bool:
    scene = scene or {}
    state = str(scene.get("panel_screen_state") or scene.get("screen_state") or "").lower()
    overlay = scene.get("screen_overlay") or {}
    return bool(overlay.get("enabled") or "publishing" in state or "product" in state or "workflow" in state)


def product_overlay_lines(scene: dict, index: int) -> tuple[str, list[str]]:
    overlay = scene.get("screen_overlay") or {}
    title = str(overlay.get("title") or "Sapiver Press").strip()[:42]
    lines = [str(x).strip() for x in (overlay.get("lines") or []) if str(x).strip()]
    if lines:
        return title, lines[:6]
    fallback = [
        ["Sudoku book idea", "Where do I start?"],
        ["Puzzles", "Solutions", "Interiors", "Covers", "Rights"],
        ["Commercial Sudoku Publisher Starter Pack", "sapiverpress.etsy.com"],
        ["900 puzzles", "900 solutions", "Interiors + matching covers"],
        ["Publish-ready workflow", "Build the book", "Check files", "Format"],
        ["Start with the files", "Build the book from there", "sapiverpress.etsy.com"],
    ]
    return title, fallback[index] if 0 <= index < len(fallback) else ["Publishing workflow"]


def make_product_overlay_card(scene: dict, index: int, size: tuple[int, int] = (1200, 820)) -> Image.Image:
    width, height = size
    img = Image.new("RGB", size, "#f6f2e8")
    draw = ImageDraw.Draw(img, "RGBA")
    title, lines = product_overlay_lines(scene, index)
    draw.rounded_rectangle((38, 34, width - 38, height - 34), radius=36, fill=(255, 255, 255, 242), outline=(31, 42, 62, 255), width=5)
    draw.rounded_rectangle((70, 72, width - 70, 152), radius=22, fill=(232, 238, 246, 255), outline=(70, 83, 110, 210), width=2)
    title_font = load_font(44, bold=True)
    line_font = load_font(38)
    small_font = load_font(30)
    draw.text((96, 91), title, font=title_font, fill=(20, 31, 49, 255))
    y = 196
    for line in lines[:6]:
        if y > height - 130:
            break
        draw.text((110, y), "•", font=line_font, fill=(20, 31, 49, 255))
        draw.text((150, y + 2), line[:58], font=line_font, fill=(20, 31, 49, 255))
        y += 70
    draw.rounded_rectangle((96, height - 116, width - 96, height - 58), radius=20, fill=(19, 32, 52, 235))
    draw.text((124, height - 102), "sapiverpress.etsy.com", font=small_font, fill=(255, 255, 255, 255))
    return img


def prepared_overlay_for_story(story: dict, scene: dict, index: int, capture: Path, quad: list[tuple[int, int]]) -> tuple[Image.Image, dict]:
    if product_ad_mode(story) or scene_has_product_overlay(scene):
        return make_product_overlay_card(scene, index), {"mode": "product_overlay", "capture_used": False, "readable_text_compositor_only": True}
    if "fit_capture_to_quad" in globals():
        return fit_capture_to_quad(capture, quad), {"mode": "real_capture", "capture_used": True}
    return crop_capture_to_game(capture), {"mode": "real_capture", "capture_used": True}
'''

if "def product_ad_mode(story" not in text:
    marker = "def compose_panel(story: dict, scene: dict, index: int, capture: Path) -> tuple[Path, dict]:\n"
    if marker not in text:
        raise SystemExit("compose_panel marker not found")
    text = text.replace(marker, helper + "\n" + marker, 1)
    changed = True

old = "    quad, quad_mode = resolve_screen_quad(scene_id, PANEL_REPLACEMENT_NAMES[index], panel, art_source)\n\n    if quad:\n"
new = "    quad, quad_mode = resolve_screen_quad(scene_id, PANEL_REPLACEMENT_NAMES[index], panel, art_source)\n    overlay_meta = {\"mode\": \"none\", \"capture_used\": False}\n\n    if quad:\n"
if old in text:
    text = text.replace(old, new, 1)
    changed = True

for old_line in ["        prepared = fit_capture_to_quad(capture, quad)\n", "        prepared = crop_capture_to_game(capture)\n"]:
    if old_line in text:
        text = text.replace(old_line, "        prepared, overlay_meta = prepared_overlay_for_story(story, scene, index, capture, quad)\n", 1)
        changed = True

old_capture = '        "capture": str(capture.relative_to(ROOT)),\n'
new_capture = '        "capture": "" if overlay_meta.get("mode") == "product_overlay" else str(capture.relative_to(ROOT)),\n        "product_overlay": overlay_meta,\n        "screen_overlay_mode": overlay_meta.get("mode", "none"),\n'
if old_capture in text:
    text = text.replace(old_capture, new_capture, 1)
    changed = True

if changed:
    TARGET.write_text(text, encoding="utf-8")
    print("Product overlay patch applied to compose_v3_strict_clean.py")
else:
    print("Product overlay patch already present")
