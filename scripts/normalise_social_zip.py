#!/usr/bin/env python3
from __future__ import annotations

import os
import zipfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATE = os.environ.get("DATE_OVERRIDE") or datetime.now(ZoneInfo("Europe/London")).strftime("%Y-%m-%d")
OUT_DIR = ROOT / "social" / DATE
SOCIAL_MAIN = ROOT / "social" / f"{DATE}.png"
ZIP_PATH = OUT_DIR / f"isla_v3_STRICT_CLEAN_{DATE}.zip"

FIXED_DT = (2026, 1, 1, 0, 0, 0)


def fail(message: str) -> None:
    raise SystemExit(f"NORMALISE SOCIAL ZIP FAILED: {message}")


def required_paths() -> list[Path]:
    paths = [
        OUT_DIR / "01_strict_clean.png",
        OUT_DIR / "02_strict_clean.png",
        OUT_DIR / "03_strict_clean.png",
        OUT_DIR / "04_strict_clean.png",
        OUT_DIR / "05_strict_clean.png",
        OUT_DIR / "06_strict_clean.png",
        OUT_DIR / "contact_sheet_strict_clean.jpg",
        OUT_DIR / "strict_clean_map.json",
        SOCIAL_MAIN,
    ]
    missing = [str(p.relative_to(ROOT)) for p in paths if not p.exists()]
    if missing:
        fail("Missing expected composed outputs: " + ", ".join(missing))
    return paths


def build_zip(paths: list[Path]) -> bytes:
    from io import BytesIO

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in sorted(paths, key=lambda p: p.name):
            data = path.read_bytes()
            info = zipfile.ZipInfo(filename=path.name, date_time=FIXED_DT)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            zf.writestr(info, data)
    return buffer.getvalue()


def main() -> None:
    paths = required_paths()
    data = build_zip(paths)
    if ZIP_PATH.exists() and ZIP_PATH.read_bytes() == data:
        print(f"Stable social zip unchanged: {ZIP_PATH.relative_to(ROOT)}")
        return
    ZIP_PATH.parent.mkdir(parents=True, exist_ok=True)
    ZIP_PATH.write_bytes(data)
    print(f"Stable social zip written: {ZIP_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
