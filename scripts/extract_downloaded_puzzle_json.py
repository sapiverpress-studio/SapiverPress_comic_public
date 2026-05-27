#!/usr/bin/env python3
from __future__ import annotations

import ast
import html
import json
import re
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


def try_parse_jsonish(text: str):
    text = html.unescape(text).strip()
    candidates = [text]
    if text.startswith("'") or text.startswith('"'):
        try:
            candidates.append(ast.literal_eval(text))
        except Exception:
            pass
    for candidate in candidates:
        if not isinstance(candidate, str):
            continue
        try:
            data = json.loads(candidate)
            found = find_grid_payload(data)
            if found is not None:
                return found
        except Exception:
            pass
    return None


def extract_balanced_object(text: str, start: int):
    # start should point at { or [
    opener = text[start]
    closer = "}" if opener == "{" else "]"
    depth = 0
    in_string = False
    quote = ""
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                in_string = False
            continue
        if ch in ('"', "'"):
            in_string = True
            quote = ch
            continue
        if ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return None


def extract_from_html(raw: bytes):
    text = raw.decode("utf-8-sig", errors="replace")
    text = html.unescape(text)

    # Common embedded JSON script pattern.
    for match in re.finditer(r'<script[^>]+type=["\']application/json["\'][^>]*>(.*?)</script>', text, re.I | re.S):
        found = try_parse_jsonish(match.group(1))
        if found is not None:
            return found

    # Next/React/Vite style state script payloads.
    for marker in ["givens", "solution", "solved", "answer", "answers", "locks_zero_indexed"]:
        for m in re.finditer(marker, text, re.I):
            window_start = max(0, m.start() - 6000)
            window_end = min(len(text), m.end() + 20000)
            window = text[window_start:window_end]
            starts = [i for i, ch in enumerate(window) if ch in "{["]
            # Prefer starts close to the marker.
            starts = sorted(starts, key=lambda i: abs((window_start + i) - m.start()))[:80]
            for rel in starts:
                blob = extract_balanced_object(window, rel)
                if not blob or len(blob) < 20:
                    continue
                found = try_parse_jsonish(blob)
                if found is not None:
                    found = dict(found)
                    found.setdefault("downloaded_html_marker", marker)
                    return found

    # Attribute encoded data, e.g. data-puzzle='{...}'
    for match in re.finditer(r'data-[a-z0-9_-]+=["\']([^"\']{20,})["\']', text, re.I | re.S):
        found = try_parse_jsonish(match.group(1))
        if found is not None:
            return found

    return None


def extract_from_file(download_path: Path):
    raw = download_path.read_bytes()
    try:
        data = load_json_text(raw)
        found = find_grid_payload(data)
        if found is not None:
            return found
    except Exception:
        pass

    html_found = extract_from_html(raw)
    if html_found is not None:
        return html_found

    if zipfile.is_zipfile(download_path):
        with zipfile.ZipFile(download_path, "r") as zf:
            names = zf.namelist()
            preferred = [n for n in names if n.lower().endswith("today_trigoku_data.json")]
            preferred += [n for n in names if n.lower().endswith("today_puzzle_data.json")]
            preferred += [n for n in names if n.lower().endswith(".json")]
            preferred += [n for n in names if n.lower().endswith((".html", ".htm", ".js"))]
            seen = set()
            for name in preferred:
                if name in seen:
                    continue
                seen.add(name)
                try:
                    member = zf.read(name)
                    try:
                        data = load_json_text(member)
                        found = find_grid_payload(data)
                    except Exception:
                        found = extract_from_html(member)
                    if found is not None:
                        found = dict(found)
                        found.setdefault("downloaded_member_name", name)
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
