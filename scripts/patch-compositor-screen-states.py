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

if "detector_version_2_multi_tone" not in text:
    detector = r'''def detect_screen_quad(panel: Image.Image) -> list[tuple[int, int]] | None:
    """Detect a real blank laptop screen in generated art.

    detector_version_2_multi_tone:
    The earlier detector mostly looked for blue/dark display areas. Generated
    panels can contain neutral black, grey, teal, or warm-shadow screens, so this
    version scores several dark-screen masks and accepts the strongest
    rectangular component rather than requiring a blue cast.
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
        (yy > h * 0.10) & (yy < h * 0.94) &
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
        # Original blue/teal dark display rule.
        (luma > 6) & (luma < 120) & (b > 18) & (b >= r * 0.96) & (b >= g * 0.72) & (sat > 5) & search_area,
        # Neutral matte black/grey laptop screens.
        (luma > 4) & (luma < 135) & (sat < 88) & search_area,
        # Very dark screen glass, even with mild reflections.
        (luma > 2) & (luma < 92) & (sat < 135) & search_area,
        # Warm/dim grey screens in editorial lighting.
        (luma > 18) & (luma < 155) & (sat < 62) & search_area,
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
            min_x, max_x = xs.min(), xs.max()
            min_y, max_y = ys.min(), ys.max()
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
            if centre_y < 0.12 or centre_y > 0.94:
                continue

            screen_size = (box_w / w) * (box_h / h)
            aspect_bonus = 1.15 if 1.20 <= aspect <= 2.90 else 0.92
            size_bonus = 1.30 if 0.025 <= screen_size <= 0.24 else 0.82
            centre_bonus = 0.78 + 0.24 * centre_x + 0.12 * centre_y
            tone_bonus = 1.20 if mask_index in (1, 2) else 1.0
            score = area * fill * aspect_bonus * size_bonus * centre_bonus * tone_bonus

            if score > best_score:
                best_score = float(score)
                best_quad = quad_from_component(xs, ys, 1 / scale, 1 / scale, (full_w, full_h))
                best_meta = {
                    "mask_index": mask_index,
                    "area": int(area),
                    "box": [float(min_x), float(min_y), float(max_x), float(max_y)],
                    "aspect": float(aspect),
                    "fill": float(fill),
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
    print("Compositor multi-tone screen detector already present")

if changed:
    TARGET.write_text(text, encoding="utf-8")
    print("Compositor patched: screen-state rules plus stronger multi-tone generated-screen detection")
else:
    print("No compositor patch changes needed")
