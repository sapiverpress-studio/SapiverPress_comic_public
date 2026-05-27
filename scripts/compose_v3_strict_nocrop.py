#!/usr/bin/env python3
"""Strict Isla compositor wrapper.

Uses the existing locked-screen compositor, but stops it from applying a fixed
webpage crop to captures that are already focused on the puzzle area.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

import compose_v3_strict_clean as base


def crop_capture_to_game(path: Path) -> Image.Image:
    img = Image.open(path).convert("RGB")
    canvas = Image.new("RGB", (1200, 820), "#071225")
    img.thumbnail((1140, 760), Image.Resampling.LANCZOS)
    canvas.paste(img, ((1200 - img.width) // 2, (820 - img.height) // 2))
    return canvas


base.crop_capture_to_game = crop_capture_to_game


if __name__ == "__main__":
    base.main()
