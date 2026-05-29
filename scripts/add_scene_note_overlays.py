#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATE = os.environ.get("DATE_OVERRIDE") or datetime.now(ZoneInfo("Europe/London")).strftime("%Y-%m-%d")
SOCIAL_DIR = ROOT / "social" / DATE
LATEST_DIR = ROOT / "social" / "latest"


def main() -> None:
    """No-op by design.

    The real puzzle screen is still composited by compose_v3_strict_nocrop.py.
    This script previously added extra scene-note/debug cards on top of finished
    panels. Those notes are not publishing output, so this step now records that
    it skipped them and leaves the PNGs untouched.
    """
    SOCIAL_DIR.mkdir(parents=True, exist_ok=True)
    LATEST_DIR.mkdir(parents=True, exist_ok=True)
    summary = {
        "date": DATE,
        "status": "skipped",
        "purpose": "Scene note overlays disabled; final panels are left untouched.",
        "puzzle_compositing": "unchanged",
    }
    out = SOCIAL_DIR / "scene-note-overlays.json"
    out.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    shutil.copy2(out, LATEST_DIR / "scene-note-overlays.json")
    print("Scene note overlays skipped")


if __name__ == "__main__":
    main()
