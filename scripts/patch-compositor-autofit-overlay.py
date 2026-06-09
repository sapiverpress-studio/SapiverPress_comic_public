#!/usr/bin/env python3
"""Patch compositor so captured puzzle content fills the detected laptop screen.

This keeps the real captured puzzle screenshot but crops/scales it tightly to the
actual puzzle/app panel before warping it into the laptop display. It is variant
agnostic: Classic, Hyper, Diagonal, Trigoku, Duel, and future puzzle UIs should
all be treated as app/puzzle content rather than a specific product layout.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "scripts" / "compose_v3_strict_clean.py"

text = TARGET.read_text(encoding="utf-8")
changed = False

helper = r'''

def quad_aspect(quad: list[tuple[int, int]]) -> float:
    import math
    top = math.dist(quad[0], quad[1])
    bottom = math.dist(quad[3], quad[2])
    left = math.dist(quad[0], quad[3])
    right = math.dist(quad[1], quad[2])
    width = max(1.0, (top + bottom) / 2.0)
    height = max(1.0, (left + right) / 2.0)
    return width / height


def crop_to_content(img: Image.Image) -> Image.Image:
    """Trim to the puzzle/app panel, not the full browser/canvas.

    Variant agnostic: it finds the dense UI block by combining dark app chrome,
    pale grid/buttons, coloured puzzle marks, and edge/contrast density.
    """
    import numpy as np

    rgb = img.convert("RGB")
    w, h = rgb.size
    arr = np.asarray(rgb).astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b])
    yy, xx = np.mgrid[0:h, 0:w]

    central = (yy > h * 0.04) & (yy < h * 0.95) & (xx > w * 0.035) & (xx < w * 0.97)

    # Generic puzzle/app signals:
    # - dark UI chrome, whether navy/black/charcoal
    # - pale grid cells and buttons
    # - coloured entries/highlights
    # - dense edges from grid lines, buttons, labels, and browser/app frame
    dark_ui = central & (luma > 6) & (luma < 128)
    pale_ui = central & (luma > 180) & (sat < 95)
    colour_marks = central & (sat > 18) & ((b > r * 1.06) | ((r > 140) & (g > 115) & (b < 155)) | ((g > r * 1.04) & (g > b * 0.92)))

    gx = np.abs(np.roll(luma, -1, axis=1) - np.roll(luma, 1, axis=1))
    gy = np.abs(np.roll(luma, -1, axis=0) - np.roll(luma, 1, axis=0))
    edge = central & ((gx + gy) > 42)

    informative = dark_ui | pale_ui | colour_marks | edge

    # Remove flat page/canvas areas by requiring nearby structure. A real puzzle UI
    # has many neighbouring informative pixels; a blank pale browser margin does not.
    dense = informative.copy()
    for _ in range(2):
        neighbours = (
            dense.astype(np.uint8) +
            np.roll(dense, 1, 0).astype(np.uint8) + np.roll(dense, -1, 0).astype(np.uint8) +
            np.roll(dense, 1, 1).astype(np.uint8) + np.roll(dense, -1, 1).astype(np.uint8)
        )
        dense = informative & (neighbours >= 2)

    ys, xs = np.where(dense)
    if len(xs) < 180:
        ys, xs = np.where(informative)
        if len(xs) < 150:
            return rgb

    x0, x1 = int(np.percentile(xs, 0.6)), int(np.percentile(xs, 99.4))
    y0, y1 = int(np.percentile(ys, 0.6)), int(np.percentile(ys, 99.4))

    # If the crop still includes too much blank canvas, tighten around the largest
    # high-contrast centre band. This helps all puzzle variants, not one product.
    box_w = x1 - x0 + 1
    box_h = y1 - y0 + 1
    if box_w > w * 0.88 or box_h > h * 0.88:
        ys2, xs2 = np.where(edge | colour_marks | (dark_ui & pale_ui))
        if len(xs2) >= 120:
            x0, x1 = int(np.percentile(xs2, 1.0)), int(np.percentile(xs2, 99.0))
            y0, y1 = int(np.percentile(ys2, 1.0)), int(np.percentile(ys2, 99.0))
            box_w = x1 - x0 + 1
            box_h = y1 - y0 + 1

    pad_x = max(3, int(box_w * 0.01))
    pad_y = max(3, int(box_h * 0.01))
    x0 = max(0, x0 - pad_x)
    y0 = max(0, y0 - pad_y)
    x1 = min(w, x1 + pad_x)
    y1 = min(h, y1 + pad_y)
    return rgb.crop((x0, y0, x1, y1))


def fit_capture_to_quad(capture: Path, quad: list[tuple[int, int]]) -> Image.Image:
    """Return a real captured puzzle image cropped to fill the detected display."""
    source = crop_to_content(crop_capture_to_game(capture))
    target_aspect = quad_aspect(quad)
    src_w, src_h = source.size
    src_aspect = src_w / max(1, src_h)

    if src_aspect > target_aspect:
        new_w = max(1, int(src_h * target_aspect))
        left = max(0, (src_w - new_w) // 2)
        source = source.crop((left, 0, left + new_w, src_h))
    else:
        new_h = max(1, int(src_w / target_aspect))
        top = max(0, (src_h - new_h) // 2)
        source = source.crop((0, top, src_w, top + new_h))

    out_w = 1800
    out_h = max(1, int(out_w / target_aspect))
    return source.resize((out_w, out_h), Image.Resampling.LANCZOS)
'''

start = text.find("\ndef quad_aspect(")
end = text.find("\ndef warp_to_quad", start if start != -1 else 0)
if start != -1 and end != -1:
    text = text[:start] + helper + text[end:]
    changed = True
elif "def fit_capture_to_quad" not in text:
    marker = "def warp_to_quad(screen: Image.Image, template_size: tuple[int, int], quad: list[tuple[int, int]]) -> Image.Image:\n"
    if marker not in text:
        raise SystemExit("Could not find warp_to_quad marker for autofit helper insertion")
    text = text.replace(marker, helper + "\n" + marker, 1)
    changed = True

old = "prepared = crop_capture_to_game(capture)"
new = "prepared = fit_capture_to_quad(capture, quad)"
if old in text:
    text = text.replace(old, new)
    changed = True

old_row = '''        "screen_state_overlay_allowed": screen_state_overlay_allowed,
    }
'''
new_row = '''        "screen_state_overlay_allowed": screen_state_overlay_allowed,
        "overlay_fit_mode": "variant_agnostic_app_block_fill_detected_screen_quad_real_capture",
    }
'''
if old_row in text and "overlay_fit_mode" not in text:
    text = text.replace(old_row, new_row, 1)
    changed = True
for old_mode in ["dark_app_block_fill_detected_screen_quad_real_capture", "tight_auto_fill_detected_screen_quad_real_capture", "auto_fill_detected_screen_quad_real_capture"]:
    if old_mode in text:
        text = text.replace(old_mode, "variant_agnostic_app_block_fill_detected_screen_quad_real_capture")
        changed = True

if changed:
    TARGET.write_text(text, encoding="utf-8")
    print("Compositor patched: puzzle overlay uses variant-agnostic app/puzzle block crop and fills laptop screen")
else:
    print("Compositor variant-agnostic autofit patch already present")
