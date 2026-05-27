#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path


def has_grid_payload(obj) -> bool:
    if not isinstance(obj, dict):
        return False
    givens = obj.get("givens") or obj.get("puzzle") or obj.get("grid") or obj.get("start")
    solution = obj.get("solution") or obj.get("solved") or obj.get("answer") or obj.get("answers")
    return isinstance(givens, list) and isinstance(solution, list)


def find_grid_payload(obj):
    if has_grid_payload(obj):
        return obj
    if isinstance(obj, dict):
        for value in obj.values():
            found = find_grid_payload(value)
            if found is not None:
                return found
    if isinstance(obj, list):
        for value in obj:
            found = find_grid_payload(value)
            if found is not None:
                return found
    return None


def load_json_text(raw: bytes):
    return json.loads(raw.decode("utf-8-sig"))


def extract_from_file(download_path: Path):
    try:
        data = load_json_text(download_path.read_bytes())
        found = find_grid_payload(data)
        if found is not None:
            return found
    except Exception:
        pass

    if zipfile.is_zipfile(download_path):
        with zipfile.ZipFile(download_path, "r") as zf:
            names = zf.namelist()
            preferred = [n for n in names if n.lower().endswith("today_trigoku_data.json")]
            preferred += [n for n in names if n.lower().endswith("today_puzzle_data.json")]
            preferred += [n for n in names if n.lower().endswith(".json")]
            seen = set()
            for name in preferred:
                if name in seen:
                    continue
                seen.add(name)
                try:
                    data = load_json_text(zf.read(name))
                    found = find_grid_payload(data)
                    if found is not None:
                        found = dict(found)
                        found.setdefault("downloaded_json_name", name)
                        return found
                except Exception:
                    continue
    return None


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract_downloaded_puzzle_json.py DOWNLOAD_PATH OUT_JSON")
    download_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    if not download_path.exists():
        raise SystemExit(f"Missing download: {download_path}")
    found = extract_from_file(download_path)
    if found is None:
        raise SystemExit(f"No givens+solution JSON found in {download_path}")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(found, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted puzzle JSON -> {out_path}")


if __name__ == "__main__":
    main()
