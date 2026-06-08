#!/usr/bin/env python3
"""Apply controlled poster/merch overlays to composed comic panels.

Readable brand/poster/merch copy belongs here, not in image prompts.
This script adds small, tasteful Sapiver Press overlay marks to blank surfaces
where the art generation has provided usable space.
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

ROOT = Path(__file__).resolve().parents[1]
DATE = os.environ.get("DATE_OVERRIDE") or datetime.now(ZoneInfo("Europe/London")).strftime("%Y-%m-%d")
OUT_DIR = ROOT / "social" / DATE
LATEST_DIR = ROOT / "social" / "latest"
CONFIG_PATH = ROOT / "config" / "poster-merch-overlays.json"
PANEL_FILES = [f"{i:02d}_panel-{i:02d}.png" for i in range(1, 7)]


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8-sig"))


def load_font(size: int, bold: bool = False):
    names = ["DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", "Arial.ttf"]
    for name in names:
        try:
            return ImageFont.truetype(name, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def wrap(text: str, font, width: int, max_lines: int) -> list[str]:
    words = str(text or "").split()
    if not words:
        return []
    probe = Image.new("RGB", (10, 10))
    draw = ImageDraw.Draw(probe)
    lines = []
    cur = words[0]
    for word in words[1:]:
        test = f"{cur} {word}"
        if draw.textbbox((0, 0), test, font=font)[2] <= width:
            cur = test
        else:
            lines.append(cur)
            cur = word
            if len(lines) >= max_lines:
                break
    if len(lines) < max_lines:
        lines.append(cur)
    return lines[:max_lines]


def choose_overlay(index: int, config: dict) -> dict:
    quotes = config.get("approved_quotes") or ["A DAILY PUZZLE", "New puzzle every day."]
    ctas = config.get("approved_ctas") or ["Sapiver Press"]
    motifs = config.get("motifs") or ["small sudoku grid icon"]
    surface_cycle = ["mug", "poster", "notebook", "laptop_sticker", "book_cover", "tote_bag"]
    return {
        "surface": surface_cycle[index % len(surface_cycle)],
        "quote": quotes[index % len(quotes)],
        "cta": ctas[index % len(ctas)],
        "motif": motifs[index % len(motifs)],
    }


def overlay_box_for_surface(img: Image.Image, surface: str) -> tuple[int, int, int, int]:
    w, h = img.size
    # These are deliberately small and conservative: brand/merch overlays should
    # be subtle, not cover Isla or the puzzle screen.
    if surface == "mug":
        return (int(w * 0.06), int(h * 0.66), int(w * 0.24), int(h * 0.78))
    if surface == "poster":
        return (int(w * 0.66), int(h * 0.13), int(w * 0.93), int(h * 0.30))
    if surface == "notebook":
        return (int(w * 0.08), int(h * 0.79), int(w * 0.35), int(h * 0.90))
    if surface == "laptop_sticker":
        return (int(w * 0.61), int(h * 0.63), int(w * 0.83), int(h * 0.73))
    if surface == "book_cover":
        return (int(w * 0.73), int(h * 0.70), int(w * 0.94), int(h * 0.86))
    return (int(w * 0.06), int(h * 0.12), int(w * 0.31), int(h * 0.25))


def draw_motif(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    size = min(x1 - x0, y1 - y0)
    if size < 24:
        return
    g = max(3, size // 5)
    left = x0 + 6
    top = y0 + 6
    cell = max(4, (size - 14) // 3)
    for r in range(3):
        for c in range(3):
            draw.rectangle((left + c * cell, top + r * cell, left + (c + 1) * cell - 2, top + (r + 1) * cell - 2), outline=fill, width=2)
    draw.line((x0 + size - g, y0 + 8, x0 + size - 8, y0 + 8), fill=fill, width=2)


def apply_overlay(img: Image.Image, overlay: dict) -> bool:
    draw = ImageDraw.Draw(img, "RGBA")
    x0, y0, x1, y1 = overlay_box_for_surface(img, overlay["surface"])
    if x1 <= x0 or y1 <= y0:
        return False
    box_w = x1 - x0
    box_h = y1 - y0
    radius = max(12, min(box_w, box_h) // 8)
    draw.rounded_rectangle((x0, y0, x1, y1), radius=radius, fill=(250, 252, 255, 224), outline=(24, 34, 52, 180), width=2)
    motif_box = (x0 + 10, y0 + 10, x0 + min(64, box_w // 3), y0 + min(64, box_h - 10))
    draw_motif(draw, motif_box, (21, 38, 62, 220))
    quote_font = load_font(max(18, min(34, box_w // 10)), bold=True)
    cta_font = load_font(max(13, min(22, box_w // 15)), bold=False)
    text_x = x0 + min(78, box_w // 3)
    text_w = max(60, x1 - text_x - 10)
    y = y0 + 12
    quote_lines = wrap(str(overlay.get("quote") or ""), quote_font, text_w, 2)
    for line in quote_lines:
        draw.text((text_x, y), line, font=quote_font, fill=(18, 29, 48, 255))
        y += quote_font.size + 3
    cta = str(overlay.get("cta") or "")
    for line in wrap(cta, cta_font, text_w, 2):
        draw.text((text_x, y + 2), line, font=cta_font, fill=(54, 65, 82, 255))
        y += cta_font.size + 2
    return True


def save_png(img: Image.Image, path: Path) -> None:
    pnginfo = PngImagePlugin.PngInfo()
    pnginfo.add_text("sapiver_press_poster_merch_overlay", "true")
    pnginfo.add_text("sapiver_press_overlay_generated_at", datetime.now(ZoneInfo("Europe/London")).isoformat())
    img.convert("RGB").save(path, pnginfo=pnginfo)


def main() -> None:
    config = load_config()
    manifest_path = OUT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    rows = manifest.get("scenes") or []
    applied = []
    for i, name in enumerate(PANEL_FILES):
        path = OUT_DIR / name
        if not path.exists():
            continue
        # Keep overlay subtle and only on non-puzzle/key product panels. Avoid
        # panel 4/5 by default because they usually carry main puzzle evidence.
        if i in {3, 4}:
            continue
        img = Image.open(path).convert("RGBA")
        overlay = choose_overlay(i, config)
        if apply_overlay(img, overlay):
            save_png(img, path)
            if (LATEST_DIR / name).exists():
                save_png(img, LATEST_DIR / name)
            applied.append({"panel": i + 1, "file": name, **overlay, "mode": "controlled_compositor_overlay"})
            if i < len(rows):
                rows[i]["poster_merch_overlay"] = applied[-1]
    if applied:
        manifest["poster_merch_overlay_contract"] = config.get("version", "poster_merch_overlay_contract_v1")
        manifest["poster_merch_overlays"] = applied
        manifest["scenes"] = rows
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        if (LATEST_DIR / "manifest.json").exists():
            (LATEST_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Poster/merch overlays applied: {len(applied)}")


if __name__ == "__main__":
    main()
