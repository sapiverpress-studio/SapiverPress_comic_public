#!/usr/bin/env python3
"""Patch compositor so captured puzzle content fills the detected laptop screen.

This keeps the real captured puzzle screenshot but crops/scales it to the
screen quad aspect so the overlay uses the available display area instead of
leaving large unused margins.
"""
from __future__ import annotations

import re
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
    """Trim browser/page chrome and empty margins from a real captured puzzle image."""
    import numpy as np

    rgb = img.convert("RGB")
    w, h = rgb.size
    arr = np.asarray(rgb).astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b])

    # Keep the visible puzzle UI: grid lines, white cells, dark app chrome,
    # blue/yellow marks, and button text. Drop flat browser/background margins.
    yy, xx = np.mgrid[0:h, 0:w]
    central = (yy > h * 0.03) & (yy < h * 0.92) & (xx > w * 0.02) & (xx < w * 0.98)
    informative = central & (
        (sat > 12) |
        (luma < 80) |
        (luma > 185) |
        ((b > r * 1.04) & (b > g * 0.92))
    )

    ys, xs = np.where(informative)
    if len(xs) < 100:
        return rgb

    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    pad_x = max(8, int((x1 - x0 + 1) * 0.035))
    pad_y = max(8, int((y1 - y0 + 1) * 0.035))
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

    # High enough for clean warping, but still bounded for Action runtime.
    out_w = 1400
    out_h = max(1, int(out_w / target_aspect))
    return source.resize((out_w, out_h), Image.Resampling.LANCZOS)
'''

if "def fit_capture_to_quad" not in text:
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

# Add useful metadata to the row if the standard screen-state row block exists.
old_row = '''        "screen_state_overlay_allowed": screen_state_overlay_allowed,
    }
'''
new_row = '''        "screen_state_overlay_allowed": screen_state_overlay_allowed,
        "overlay_fit_mode": "auto_fill_detected_screen_quad_real_capture",
    }
'''
if old_row in text and "overlay_fit_mode" not in text:
    text = text.replace(old_row, new_row, 1)
    changed = True

if changed:
    TARGET.write_text(text, encoding="utf-8")
    print("Compositor patched: puzzle overlay auto-fits detected laptop screen space")
else:
    print("Compositor autofit patch already present")
