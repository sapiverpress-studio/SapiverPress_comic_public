#!/usr/bin/env python3
"""Sapiver Press strict Isla compositor.

Uses real extracted puzzle captures, detected/generated Isla screen corners,
and clean caption overlays. It refuses to fake puzzle content.

Phase 3 adds optional daily replacement artwork:
- art-replacements/YYYY-MM-DD/01_panel-01.png ... 06_panel-06.png
- art-replacements/latest/01_panel-01.png ... 06_panel-06.png

If a replacement panel exists, it is used as the base artwork. If not, the
locked template art is used. The real puzzle captures are still inserted only
when a screen quad is available; puzzle content is never invented.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import zipfile
from zlib import crc32
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

ROOT = Path(__file__).resolve().parents[1]
DATE = os.environ.get("DATE_OVERRIDE") or datetime.now(ZoneInfo("Europe/London")).strftime("%Y-%m-%d")
CHARACTER = os.environ.get("COMIC_CHARACTER", "isla").strip().lower() or "isla"
TEMPLATE_DIR = ROOT / "templates" / "characters" / CHARACTER
REPLACEMENT_DIR = ROOT / "art-replacements" / DATE
LATEST_REPLACEMENT_DIR = ROOT / "art-replacements" / "latest"
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

PANEL_REPLACEMENT_NAMES = [
    "01_panel-01.png",
    "02_panel-02.png",
    "03_panel-03.png",
    "04_panel-04.png",
    "05_panel-05.png",
    "06_panel-06.png",
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


def find_replacement(index: int) -> Path | None:
    name = PANEL_REPLACEMENT_NAMES[index]
    candidates = [
        REPLACEMENT_DIR / name,
        LATEST_REPLACEMENT_DIR / name,
    ]
    for path in candidates:
        if path.exists() and path.is_file():
            return path
    return None


def load_base_art(scene: dict, index: int) -> tuple[Image.Image, Path, str]:
    replacement_path = find_replacement(index)
    if replacement_path:
        img = Image.open(replacement_path).convert("RGBA")
        template_size = Image.open(find_template(scene, index)).size
        if img.size != template_size:
            img = fit_to_size(img, template_size)
        return img, replacement_path, "replacement"

    template_path = find_template(scene, index)
    return Image.open(template_path).convert("RGBA"), template_path, "template"


def fit_to_size(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_w, target_h = size
    source = img.convert("RGBA")
    source_ratio = source.width / source.height
    target_ratio = target_w / target_h
    if source_ratio > target_ratio:
        new_h = target_h
        new_w = int(new_h * source_ratio)
    else:
        new_w = target_w
        new_h = int(new_w / source_ratio)
    resized = source.resize((new_w, new_h), Image.Resampling.LANCZOS)
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


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


def normalise_quad(value) -> list[tuple[int, int]] | None:
    if isinstance(value, dict) and all(k in value for k in ("x", "y", "w", "h")):
        x, y, w, h = (int(round(float(value[k]))) for k in ("x", "y", "w", "h"))
        return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    if isinstance(value, (list, tuple)) and len(value) == 4:
        if all(isinstance(p, (list, tuple)) and len(p) >= 2 for p in value):
            return [(int(round(float(p[0]))), int(round(float(p[1])))) for p in value]
        if all(isinstance(p, (int, float, str)) for p in value):
            x, y, w, h = (int(round(float(p))) for p in value)
            return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    return None


def parse_manual_screen_quad(scene_id: str, image_name: str) -> tuple[list[tuple[int, int]] | None, str]:
    raw = os.environ.get("COMIC_SCREEN_QUAD") or os.environ.get("COMIC_SCREEN_BOX") or ""
    if raw.strip():
        quad = parse_quad_text(raw, scene_id, image_name)
        if quad:
            return quad, "manual_env"

    for path in [
        ROOT / "config" / "screen-corners.json",
        REPLACEMENT_DIR / "screen-corners.json",
        LATEST_REPLACEMENT_DIR / "screen-corners.json",
    ]:
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception:
            continue
        if isinstance(data, dict):
            for key in (scene_id, image_name, scene_id.replace("scene_", ""), "default"):
                if key in data:
                    quad = normalise_quad(data[key])
                    if quad:
                        return quad, f"manual_file:{path.relative_to(ROOT)}"
            quad = normalise_quad(data)
            if quad:
                return quad, f"manual_file:{path.relative_to(ROOT)}"
    return None, ""


def parse_quad_text(raw: str, scene_id: str, image_name: str) -> list[tuple[int, int]] | None:
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            for key in (scene_id, image_name, scene_id.replace("scene_", ""), "default"):
                if key in data:
                    quad = normalise_quad(data[key])
                    if quad:
                        return quad
            quad = normalise_quad(data)
            if quad:
                return quad
        quad = normalise_quad(data)
        if quad:
            return quad
    except Exception:
        pass

    numbers = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", raw)]
    if len(numbers) >= 8:
        return [(int(round(numbers[i])), int(round(numbers[i + 1]))) for i in range(0, 8, 2)]
    if len(numbers) == 4:
        x, y, w, h = (int(round(n)) for n in numbers)
        return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    return None


def connected_components(mask):
    import numpy as np

    height, width = mask.shape
    seen = np.zeros(mask.shape, dtype=bool)
    ys, xs = np.where(mask)
    for start_y, start_x in zip(ys.tolist(), xs.tolist()):
        if seen[start_y, start_x]:
            continue
        stack = [(start_x, start_y)]
        seen[start_y, start_x] = True
        pixels_x = []
        pixels_y = []
        while stack:
            x, y = stack.pop()
            pixels_x.append(x)
            pixels_y.append(y)
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < width and 0 <= ny < height and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((nx, ny))
        yield np.array(pixels_x, dtype=float), np.array(pixels_y, dtype=float)


def quad_from_component(xs, ys, scale_x: float, scale_y: float, full_size: tuple[int, int]) -> list[tuple[int, int]]:
    import numpy as np

    sums = xs + ys
    diffs = xs - ys

    def avg_corner(values, mode):
        threshold = np.percentile(values, 1.0 if mode == "min" else 99.0)
        keep = values <= threshold if mode == "min" else values >= threshold
        return xs[keep].mean() * scale_x, ys[keep].mean() * scale_y

    tl = avg_corner(sums, "min")
    tr = avg_corner(diffs, "max")
    br = avg_corner(sums, "max")
    bl = avg_corner(diffs, "min")
    quad = [tl, tr, br, bl]
    cx = sum(x for x, _ in quad) / 4
    cy = sum(y for _, y in quad) / 4
    width, height = full_size
    expanded = []
    for x, y in quad:
        ex = cx + (x - cx) * 1.035
        ey = cy + (y - cy) * 1.035
        expanded.append((max(0, min(width - 1, int(round(ex)))), max(0, min(height - 1, int(round(ey))))))
    return expanded


def detect_screen_quad(panel: Image.Image) -> list[tuple[int, int]] | None:
    import numpy as np

    full_w, full_h = panel.size
    max_dim = 520
    scale = min(1.0, max_dim / max(full_w, full_h))
    small = panel.convert("RGB")
    if scale < 1.0:
        small = small.resize((int(full_w * scale), int(full_h * scale)), Image.Resampling.BILINEAR)
    arr = np.asarray(small).astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b])
    h, w = luma.shape
    yy, xx = np.mgrid[0:h, 0:w]

    # Target the plain blue/dark laptop screen generated by the static Isla prompt.
    mask = (
        (luma > 8) & (luma < 105) &
        (b > 24) & (b >= r * 1.03) & (b >= g * 0.82) &
        (sat > 8) &
        (yy > h * 0.18) & (yy < h * 0.92) &
        (xx > w * 0.18) & (xx < w * 0.96)
    )

    best_score = 0.0
    best_quad = None
    for xs, ys in connected_components(mask):
        area = len(xs)
        if area < max(120, w * h * 0.0006):
            continue
        min_x, max_x = xs.min(), xs.max()
        min_y, max_y = ys.min(), ys.max()
        box_w = max_x - min_x + 1
        box_h = max_y - min_y + 1
        if box_w < w * 0.08 or box_h < h * 0.045:
            continue
        aspect = box_w / max(1, box_h)
        if not 1.05 <= aspect <= 3.8:
            continue
        fill = area / max(1, box_w * box_h)
        if fill < 0.25:
            continue
        centre_x = (min_x + max_x) / (2 * w)
        centre_y = (min_y + max_y) / (2 * h)
        score = area * (0.75 + 0.35 * centre_x + 0.2 * centre_y + 0.25 * fill)
        if score > best_score:
            best_score = score
            best_quad = quad_from_component(xs, ys, 1 / scale, 1 / scale, (full_w, full_h))

    return best_quad


def resolve_screen_quad(scene_id: str, image_name: str, panel: Image.Image, art_source: str) -> tuple[list[tuple[int, int]] | None, str]:
    manual_quad, manual_mode = parse_manual_screen_quad(scene_id, image_name)
    if manual_quad:
        return manual_quad, manual_mode

    if art_source == "replacement":
        detected = detect_screen_quad(panel)
        if detected:
            return detected, "detected_replacement_screen"
        return None, "overlay_skipped_no_screen_detected"

    return SCREEN_QUADS[scene_id], "template_locked"


def compose_panel(story: dict, scene: dict, index: int, capture: Path) -> tuple[Path, dict]:
    scene_id = f"scene_{index + 1:02d}"
    template, art_path, art_source = load_base_art(scene, index)
    panel = template.copy()
    quad, quad_mode = resolve_screen_quad(scene_id, PANEL_REPLACEMENT_NAMES[index], panel, art_source)

    if quad:
        prepared = crop_capture_to_game(capture)
        panel.alpha_composite(warp_to_quad(prepared, template.size, quad))
        ImageDraw.Draw(panel, "RGBA").line(quad + [quad[0]], fill=(255, 255, 255, 190), width=3)

    add_caption(panel, caption_for_scene(story, index))
    out_path = OUT_DIR / f"{index + 1:02d}_strict_clean.png"
    panel.convert("RGB").save(out_path, quality=95)
    return out_path, {
        "scene": scene_id,
        "art_source": art_source,
        "art_path": str(art_path.relative_to(ROOT)),
        "template": str(art_path.relative_to(ROOT)) if art_source == "template" else "",
        "replacement": str(art_path.relative_to(ROOT)) if art_source == "replacement" else "",
        "capture": str(capture.relative_to(ROOT)),
        "output": str(out_path.relative_to(ROOT)),
        "screen_quad": quad or [],
        "screen_quad_mode": quad_mode,
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
    pnginfo = PngImagePlugin.PngInfo()
    pnginfo.add_text("sapiver_press_generated_at", datetime.now(ZoneInfo("Europe/London")).isoformat())
    pnginfo.add_text("sapiver_press_date", DATE)
    pnginfo.add_text("sapiver_press_character", CHARACTER)
    strip.save(out, pnginfo=pnginfo)


def write_zip(paths: list[Path], zip_path: Path) -> None:
    fixed_dt = (2026, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in sorted(paths, key=lambda p: p.name):
            data = path.read_bytes()
            info = zipfile.ZipInfo(filename=path.name, date_time=fixed_dt)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.CRC = crc32(data) & 0xFFFFFFFF
            info.file_size = len(data)
            zf.writestr(info, data)


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
        "replacement_dir": str(REPLACEMENT_DIR.relative_to(ROOT)),
        "latest_replacement_dir": str(LATEST_REPLACEMENT_DIR.relative_to(ROOT)),
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
