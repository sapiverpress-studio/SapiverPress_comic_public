#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DATE = os.environ.get("DATE_OVERRIDE") or datetime.now(ZoneInfo("Europe/London")).strftime("%Y-%m-%d")
CAPTURE_DIR = ROOT / "captures" / DATE / "extracted"
SOCIAL_RAW_DIR = ROOT / "social" / DATE / "raw_captures"
DATA_PATH = CAPTURE_DIR / "today_trigoku_data.json"

OUTPUTS = [
    "01_fresh_daily_grid.png",
    "02_first_moves.png",
    "03_stuck_moment.png",
    "04_breakthrough.png",
    "05_nearly_complete.png",
    "06_complete_solution.png",
]

STAGE_LABELS = [
    "Fresh grid",
    "First moves",
    "Stuck moment",
    "Breakthrough",
    "Nearly complete",
    "Complete solution",
]


def fail(message: str) -> None:
    raise SystemExit(f"TRIGOKU JSON RENDER FAILED: {message}")


def load_font(size: int, bold: bool = False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
        "Arial.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    return ImageFont.load_default()


def normalize_grid(value, name: str) -> list[list[int]]:
    if not isinstance(value, list) or len(value) != 9:
        fail(f"{name} must be a 9x9 list")
    grid = []
    for row in value:
        if not isinstance(row, list) or len(row) != 9:
            fail(f"{name} must be a 9x9 list")
        grid.append([int(x or 0) for x in row])
    return grid


def find_solution(data: dict) -> list[list[int]]:
    for key in ["solution", "solved", "answer", "answers", "grid_solution"]:
        if key in data:
            return normalize_grid(data[key], key)
    fail("today_trigoku_data.json has givens but no solution/answer grid")


def load_data() -> dict:
    if not DATA_PATH.exists():
        fail(f"Missing {DATA_PATH.relative_to(ROOT)}")
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    givens = normalize_grid(data.get("givens"), "givens")
    solution = find_solution(data)
    locks = data.get("locks_zero_indexed") or data.get("locks") or []
    lock_set = set()
    for item in locks:
        if isinstance(item, list) and len(item) >= 2:
            lock_set.add((int(item[0]), int(item[1])))
    data["givens"] = givens
    data["solution"] = solution
    data["lock_set"] = lock_set
    return data


def draw_lock(draw: ImageDraw.ImageDraw, x: float, y: float, s: float) -> None:
    body_w = s * 0.40
    body_h = s * 0.30
    bx = x + (s - body_w) / 2
    by = y + s * 0.50
    colour = (34, 45, 64)
    draw.rounded_rectangle((bx, by, bx + body_w, by + body_h), radius=int(s * 0.06), fill=colour, outline=(12, 18, 29), width=max(2, int(s * 0.025)))
    draw.arc((x + s * 0.33, y + s * 0.25, x + s * 0.67, y + s * 0.65), 180, 360, fill=colour, width=max(4, int(s * 0.045)))


def blanks_from_givens(givens: list[list[int]]) -> list[tuple[int, int]]:
    # Stable order: centre/logic-looking cells first, then normal row order.
    coords = [(r, c) for r in range(9) for c in range(9) if givens[r][c] == 0]
    return sorted(coords, key=lambda rc: (abs(rc[0] - 4) + abs(rc[1] - 4), rc[0], rc[1]))


def added_for_stage(stage_index: int, blanks: list[tuple[int, int]]) -> set[tuple[int, int]]:
    if not blanks:
        return set()
    counts = [0, max(1, int(len(blanks) * 0.12)), max(2, int(len(blanks) * 0.30)), max(3, int(len(blanks) * 0.52)), max(4, int(len(blanks) * 0.78)), len(blanks)]
    return set(blanks[:counts[stage_index]])


def recent_for_stage(stage_index: int, blanks: list[tuple[int, int]]) -> set[tuple[int, int]]:
    if stage_index == 0:
        return set()
    previous = added_for_stage(stage_index - 1, blanks)
    current = added_for_stage(stage_index, blanks)
    return current - previous


def draw_screen(data: dict, stage_index: int) -> Image.Image:
    givens = data["givens"]
    solution = data["solution"]
    locks = data["lock_set"]
    blanks = blanks_from_givens(givens)
    added = added_for_stage(stage_index, blanks)
    recent = recent_for_stage(stage_index, blanks)

    W, H = 1800, 1125
    img = Image.new("RGB", (W, H), (8, 22, 50))
    draw = ImageDraw.Draw(img)

    week = str(data.get("week") or "")
    today = str(data.get("today") or data.get("date") or DATE)
    mode = str(data.get("mode") or "Trigoku Daily Lock")

    draw.rounded_rectangle((38, 32, W - 38, 118), radius=24, fill=(237, 241, 247))
    draw.text((76, 75), "suite.sapiverpress.co.uk/play/trigoku/", font=load_font(42, True), fill=(32, 37, 46), anchor="lm")

    draw.rounded_rectangle((38, 145, W - 38, 262), radius=24, fill=(11, 32, 73))
    draw.text((76, 190), "TRIGOKU · DAILY LOCK", font=load_font(58, True), fill=(250, 250, 255), anchor="lm")
    subtitle = " · ".join([x for x in [week, today, mode, STAGE_LABELS[stage_index]] if x])
    draw.text((76, 235), subtitle[:95], font=load_font(28, True), fill=(255, 231, 150), anchor="lm")

    grid_size = 760
    grid_x = 110
    grid_y = 318
    cell = grid_size / 9
    panel_x = grid_x + grid_size + 85
    panel_y = grid_y

    draw.rounded_rectangle((grid_x - 28, grid_y - 28, grid_x + grid_size + 28, grid_y + grid_size + 28), radius=28, fill=(246, 241, 229), outline=(205, 196, 176), width=4)

    for r in range(9):
        for c in range(9):
            x1 = grid_x + c * cell
            y1 = grid_y + r * cell
            x2 = grid_x + (c + 1) * cell
            y2 = grid_y + (r + 1) * cell
            bg = (255, 255, 255) if (r + c) % 2 else (245, 248, 252)
            if (r, c) in recent:
                bg = (255, 238, 153)
            elif stage_index in (3, 4) and (r, c) in added:
                bg = (231, 242, 255)
            draw.rectangle((x1, y1, x2, y2), fill=bg, outline=(178, 186, 200), width=2)

            value = None
            colour = (17, 24, 39)
            if givens[r][c]:
                value = givens[r][c]
                colour = (15, 23, 42)
            elif stage_index == 5 or (r, c) in added:
                value = solution[r][c]
                colour = (22, 91, 185)
            if value:
                draw.text((x1 + cell / 2, y1 + cell / 2), str(value), font=load_font(52, True), fill=colour, anchor="mm")
            elif (r, c) in locks:
                draw_lock(draw, x1, y1, cell)

    for i in range(10):
        width = 8 if i % 3 == 0 else 2
        colour = (15, 23, 42) if i % 3 == 0 else (148, 158, 176)
        x = grid_x + i * cell
        y = grid_y + i * cell
        draw.line((x, grid_y, x, grid_y + grid_size), fill=colour, width=width)
        draw.line((grid_x, y, grid_x + grid_size, y), fill=colour, width=width)

    buttons = ["Hint", "Check", "Prev", "Next", "Reset", "Share"]
    for i, label in enumerate(buttons):
        x = panel_x + (i % 2) * 210
        y = panel_y + 38 + (i // 2) * 105
        draw.rounded_rectangle((x, y, x + 180, y + 70), radius=24, fill=(220, 231, 246), outline=(190, 205, 225), width=3)
        draw.text((x + 90, y + 35), label, font=load_font(34, True), fill=(32, 47, 70), anchor="mm")

    filled = len(added) if stage_index < 5 else len(blanks)
    side = [
        ("Stage", STAGE_LABELS[stage_index]),
        ("Filled", f"{filled}/{len(blanks)} blanks"),
        ("Status", "Complete" if stage_index == 5 else "Playable"),
        ("Source", "Downloaded JSON"),
    ]
    info_y = panel_y + 392
    for i, (label, value) in enumerate(side):
        y = info_y + i * 100
        draw.rounded_rectangle((panel_x, y, panel_x + 430, y + 72), radius=22, fill=(222, 235, 252), outline=(190, 205, 225), width=3)
        draw.text((panel_x + 24, y + 36), label, font=load_font(30, True), fill=(34, 48, 68), anchor="lm")
        draw.text((panel_x + 406, y + 36), value[:22], font=load_font(27, False), fill=(25, 38, 58), anchor="rm")

    return img


def main() -> None:
    data = load_data()
    CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
    SOCIAL_RAW_DIR.mkdir(parents=True, exist_ok=True)

    files = []
    for index, name in enumerate(OUTPUTS):
        img = draw_screen(data, index)
        out = CAPTURE_DIR / name
        img.save(out)
        shutil.copy2(out, SOCIAL_RAW_DIR / name)
        files.append(name)

    shutil.copy2(DATA_PATH, SOCIAL_RAW_DIR / "today_trigoku_data.json")
    manifest = {
        "date": DATE,
        "source_url": data.get("source_url_used") or data.get("fallback_display_url") or "https://suite.sapiverpress.co.uk/play/trigoku/",
        "json_date": data.get("date"),
        "week": data.get("week"),
        "today": data.get("today"),
        "mode": data.get("mode"),
        "stage_method": "json_rendered_from_downloaded_trigoku_data",
        "note": "Puzzle shots rendered from actual downloaded Trigoku JSON: givens, solution, and locks. No browser gameplay screenshots, no fake grid, no Hint/Check guessing.",
        "files": files,
    }
    (CAPTURE_DIR / "capture_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    shutil.copy2(CAPTURE_DIR / "capture_manifest.json", SOCIAL_RAW_DIR / "capture_manifest.json")
    print("Rendered Trigoku JSON staged captures:")
    for name in files:
        print(f" - {CAPTURE_DIR / name}")


if __name__ == "__main__":
    main()
