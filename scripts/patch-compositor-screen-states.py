#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "scripts" / "compose_v3_strict_clean.py"

text = TARGET.read_text(encoding="utf-8")
changed = False

if "screen_state_overlay_allowed" not in text:
    old = '''    if quad:
        prepared = crop_capture_to_game(capture)
        panel.alpha_composite(warp_to_quad(prepared, template.size, quad))
        ImageDraw.Draw(panel, "RGBA").line(quad + [quad[0]], fill=(255, 255, 255, 190), width=3)

    add_caption(panel, caption_for_scene(story, index))
'''
    new = '''    screen_state = str(scene.get("panel_screen_state") or "active_puzzle").strip().lower()
    screen_state_overlay_allowed = screen_state not in {"no_puzzle", "closed_device"}
    if quad and screen_state_overlay_allowed:
        prepared = crop_capture_to_game(capture)
        panel.alpha_composite(warp_to_quad(prepared, template.size, quad))
        ImageDraw.Draw(panel, "RGBA").line(quad + [quad[0]], fill=(255, 255, 255, 190), width=3)
    elif not screen_state_overlay_allowed:
        quad = None
        quad_mode = f"overlay_skipped_screen_state_{screen_state}"

    add_caption(panel, caption_for_scene(story, index))
'''
    if old not in text:
        raise SystemExit("Could not find compositor overlay block to patch")
    text = text.replace(old, new)
    old_row = '''        "screen_quad_mode": quad_mode,
    }
'''
    new_row = '''        "screen_quad_mode": quad_mode,
        "panel_screen_state": screen_state,
        "screen_state_overlay_allowed": screen_state_overlay_allowed,
    }
'''
    if old_row not in text:
        raise SystemExit("Could not find compositor row block to patch")
    text = text.replace(old_row, new_row)
    changed = True
else:
    print("Compositor screen-state patch already present")

if "detector_version_3_pale_screen_bezel_keyboard" not in text:
    detector = r'''def detect_screen_quad(panel: Image.Image) -> list[tuple[int, int]] | None:
    """Detect a real blank laptop screen in generated art.

    detector_version_3_pale_screen_bezel_keyboard:
    Supports the new prompt contract: a pale/off-white or light-grey laptop
    screen with a dark bezel and keyboard/base below it. Keeps dark-screen
    fallback detection, but strongly prefers a screen-like rectangle with bezel
    contrast and laptop-base context rather than random dark regions on Isla.
    """
    import numpy as np

    full_w, full_h = panel.size
    max_dim = 620
    scale = min(1.0, max_dim / max(full_w, full_h))
    small = panel.convert("RGB")
    if scale < 1.0:
        small = small.resize((int(full_w * scale), int(full_h * scale)), Image.Resampling.BILINEAR)

    arr = np.asarray(small).astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    mx = np.maximum.reduce([r, g, b])
    mn = np.minimum.reduce([r, g, b])
    sat = mx - mn
    h, w = luma.shape
    yy, xx = np.mgrid[0:h, 0:w]

    search_area = (
        (yy > h * 0.08) & (yy < h * 0.94) &
        (xx > w * 0.04) & (xx < w * 0.98)
    )

    def soften(mask, repeats=2):
        out = mask.copy()
        for _ in range(repeats):
            out = (
                out |
                np.roll(out, 1, 0) | np.roll(out, -1, 0) |
                np.roll(out, 1, 1) | np.roll(out, -1, 1)
            )
            out[0, :] = False
            out[-1, :] = False
            out[:, 0] = False
            out[:, -1] = False
        return out & search_area

    masks = [
        # New preferred target: blank pale screen / off-white display.
        (luma > 150) & (luma < 252) & (sat < 58) & search_area,
        # Soft light grey display.
        (luma > 168) & (luma < 245) & (sat < 74) & search_area,
        # Slightly dim pale screen under warm interior lighting.
        (luma > 132) & (luma < 232) & (sat < 64) & search_area,
        # Original blue/teal dark display rule.
        (luma > 6) & (luma < 120) & (b > 18) & (b >= r * 0.96) & (b >= g * 0.72) & (sat > 5) & search_area,
        # Neutral matte black/grey laptop screens.
        (luma > 4) & (luma < 135) & (sat < 88) & search_area,
        # Very dark screen glass, even with mild reflections.
        (luma > 2) & (luma < 92) & (sat < 135) & search_area,
    ]

    best_score = 0.0
    best_quad = None
    best_meta = None

    for mask_index, raw_mask in enumerate(masks):
        mask = soften(raw_mask, repeats=2)
        for xs, ys in connected_components(mask):
            area = len(xs)
            if area < max(180, w * h * 0.00055):
                continue
            min_x, max_x = int(xs.min()), int(xs.max())
            min_y, max_y = int(ys.min()), int(ys.max())
            box_w = max_x - min_x + 1
            box_h = max_y - min_y + 1
            if box_w < w * 0.085 or box_h < h * 0.045:
                continue
            if box_w > w * 0.88 and box_h > h * 0.70:
                continue
            aspect = box_w / max(1, box_h)
            if not 0.95 <= aspect <= 4.35:
                continue
            fill = area / max(1, box_w * box_h)
            if fill < 0.18:
                continue
            centre_x = (min_x + max_x) / (2 * w)
            centre_y = (min_y + max_y) / (2 * h)
            if centre_y < 0.10 or centre_y > 0.94:
                continue

            # Avoid selecting small bright/dark patches over Isla's face/hair.
            # Good laptop screens usually sit in lower/mid scene space and have
            # keyboard/base tone immediately underneath.
            screen_luma = float(luma[min_y:max_y + 1, min_x:max_x + 1].mean())
            pad = max(3, int(min(box_w, box_h) * 0.035))
            oy0, oy1 = max(0, min_y - pad), min(h - 1, max_y + pad)
            ox0, ox1 = max(0, min_x - pad), min(w - 1, max_x + pad)
            outer = luma[oy0:oy1 + 1, ox0:ox1 + 1]
            bezel_contrast = abs(screen_luma - float(outer.mean())) if outer.size else 0.0

            ky0 = min(h - 1, max_y + 2)
            ky1 = min(h - 1, max_y + max(8, int(box_h * 0.55)))
            kx0, kx1 = max(0, min_x - int(box_w * 0.08)), min(w - 1, max_x + int(box_w * 0.08))
            keyboard_region = luma[ky0:ky1 + 1, kx0:kx1 + 1] if ky1 > ky0 and kx1 > kx0 else None
            keyboard_mean = float(keyboard_region.mean()) if keyboard_region is not None and keyboard_region.size else 255.0
            keyboard_dark = keyboard_mean < screen_luma - 18 if mask_index in (0, 1, 2) else keyboard_mean < 120

            screen_size = (box_w / w) * (box_h / h)
            aspect_bonus = 1.18 if 1.18 <= aspect <= 3.05 else 0.88
            size_bonus = 1.35 if 0.025 <= screen_size <= 0.26 else 0.78
            centre_bonus = 0.82 + 0.18 * centre_x + 0.13 * centre_y
            tone_bonus = 1.42 if mask_index in (0, 1, 2) else 0.95
            keyboard_bonus = 1.34 if keyboard_dark else 0.72
            bezel_bonus = 1.26 if bezel_contrast > 8 else 0.86
            lower_scene_bonus = 1.18 if centre_y > 0.34 else 0.70
            edge_penalty = 0.72 if min_x < w * 0.035 or max_x > w * 0.985 or min_y < h * 0.06 else 1.0

            score = area * fill * aspect_bonus * size_bonus * centre_bonus * tone_bonus * keyboard_bonus * bezel_bonus * lower_scene_bonus * edge_penalty

            if score > best_score:
                best_score = float(score)
                best_quad = quad_from_component(xs, ys, 1 / scale, 1 / scale, (full_w, full_h))
                best_meta = {
                    "detector": "v3_pale_screen_bezel_keyboard",
                    "mask_index": mask_index,
                    "area": int(area),
                    "box": [float(min_x), float(min_y), float(max_x), float(max_y)],
                    "aspect": float(aspect),
                    "fill": float(fill),
                    "screen_luma": screen_luma,
                    "keyboard_mean": keyboard_mean,
                    "keyboard_dark": bool(keyboard_dark),
                    "bezel_contrast": float(bezel_contrast),
                    "score": float(score),
                }

    if best_quad:
        try:
            panel.info["sapiver_screen_detector"] = json.dumps(best_meta or {}, sort_keys=True)
        except Exception:
            pass
    return best_quad
'''

    pattern = r"def detect_screen_quad\(panel: Image\.Image\) -> list\[tuple\[int, int\]\] \| None:\n[\s\S]*?\n\ndef resolve_screen_quad"
    text2, n = re.subn(pattern, detector + "\n\ndef resolve_screen_quad", text, count=1)
    if n != 1:
        raise SystemExit("Could not find detect_screen_quad block to patch")
    text = text2
    changed = True
else:
    print("Compositor pale-screen detector already present")

if changed:
    TARGET.write_text(text, encoding="utf-8")
    print("Compositor patched: screen-state rules plus pale-screen/dark-bezel/keyboard-context detection")
else:
    print("No compositor patch changes needed")
