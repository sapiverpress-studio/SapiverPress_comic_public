#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "scripts" / "compose_v3_strict_clean.py"

text = TARGET.read_text(encoding="utf-8")
if "screen_state_overlay_allowed" in text:
    print("Compositor screen-state patch already present")
    raise SystemExit(0)

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
TARGET.write_text(text, encoding="utf-8")
print("Compositor patched to obey panel_screen_state")
