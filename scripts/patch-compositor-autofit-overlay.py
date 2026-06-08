#!/usr/bin/env python3
"""Patch compositor so captured puzzle content fills the detected laptop screen.

This keeps the real captured puzzle screenshot but crops/scales it tightly to the
actual puzzle app panel before warping it into the laptop display.
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
    """Trim to the actual puzzle app panel, not the full browser/canvas."""
    import numpy as np

    rgb = img.convert("RGB")
    w, h = rgb.size
    arr = np.asarray(rgb).astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b])
    yy, xx = np.mgrid[0:h, 0:w]

    # Prefer the Trigoku app block: navy UI, white cells/buttons, yellow/blue entries.
    central = (yy > h * 0.04) & (yy < h * 0.94) & (xx > w * 0.04) & (xx < w * 0.96)
    navy_ui = central & (b > r * 1.03) & (b > g * 0.82) & (luma < 115)
    white_cells = central & (luma > 190) & (sat < 82)
    yellow_blue_marks = central & ((b > r * 1.08) | ((r > 150) & (g > 135) & (b < 120))) & (sat > 18)
    informative = navy_ui | white_cells | yellow_blue_marks

    ys, xs = np.where(informative)
    if len(xs) < 150:
        return rgb

    # Use percentile bounds to ignore isolated browser/url/header pixels.
    x0, x1 = int(np.percentile(xs, 1.0)), int(np.percentile(xs, 99.2))
    y0, y1 = int(np.percentile(ys, 1.0)), int(np.percentile(ys, 99.0))

    # Include a modest frame around the puzzle app, but avoid the huge pale browser canvas.
    box_w = x1 - x0 + 1
    box_h = y1 - y0 + 1
    pad_x = max(4, int(box_w * 0.018))
    pad_y = max(4, int(box_h * 0.018))
    x0 = max(0, x0 - pad_x)
    y0 = max(0, y0 - pad_y)
    x1 = min(w, x1 + pad_x)
    y1 = min(h, y1 + pad_y)

    cropped = rgb.crop((x0, y0, x1, y1))
    return cropped


def fit_capture_to_quad(capture: Path, quad: list[tuple[int, int]]) -> Image.Image:
    """Return a real captured puzzle image cropped to fill the detected display."""
    source = crop_to_content(crop_capture_to_game(capture))
    target_aspect = quad_aspect(quad)
    src_w, src_h = source.size
    src_aspect = src_w / max(1, src_h)

    # Fill the screen, accepting a small crop rather than letterboxing.
    if src_aspect > target_aspect:
        new_w = max(1, int(src_h * target_aspect))
        left = max(0, (src_w - new_w) // 2)
        source = source.crop((left, 0, left + new_w, src_h))
    else:
        new_h = max(1, int(src_w / target_aspect))
        top = max(0, (src_h - new_h) // 2)
        source = source.crop((0, top, src_w, top + new_h))

    out_w = 1600
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
        "overlay_fit_mode": "tight_auto_fill_detected_screen_quad_real_capture",
    }
'''
if old_row in text and "overlay_fit_mode" not in text:
    text = text.replace(old_row, new_row, 1)
    changed = True
elif "auto_fill_detected_screen_quad_real_capture" in text:
    text = text.replace("auto_fill_detected_screen_quad_real_capture", "tight_auto_fill_detected_screen_quad_real_capture")
    changed = True

if changed:
    TARGET.write_text(text, encoding="utf-8")
    print("Compositor patched: puzzle overlay tightly auto-fits detected laptop screen space")
else:
    print("Compositor tight autofit patch already present")
