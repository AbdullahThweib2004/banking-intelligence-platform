#!/usr/bin/env python3
"""
Pre-merge verification for ID OCR + field extraction.

Runs:
  1. Rotated / angled ID photo (deskew + dual-pass OCR)
  2. Blurry low-quality photo (LLM fallback when regex < 4 fields)
  3. Cards with / without parent names
  4. extraction_source audit (regex should not trigger LLM when >= 4 fields)

Usage:
  npm run dev:api   # in another terminal
  python backend/scripts/verify_extraction.py
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test_images"
API = "http://127.0.0.1:8000"
HEADERS = {"X-User-Role": "branch_employee"}


def _fonts():
    try:
        lg = ImageFont.truetype("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf", 28)
        sm = ImageFont.truetype("/usr/share/fonts/TTF/DejaVuSans.ttf", 20)
    except OSError:
        lg = ImageFont.load_default()
        sm = lg
    return lg, sm


def make_card(
    path: Path,
    *,
    full_name: str | None = None,
    labeled: dict[str, str] | None = None,
    rotate_deg: float = 0,
    blur: bool = False,
) -> Path:
    font_lg, font_sm = _fonts()
    img = Image.new("RGB", (640, 400), "white")
    draw = ImageDraw.Draw(img)
    draw.rectangle([10, 10, 630, 390], outline="black", width=2)

    if labeled:
        y = 30
        for line in labeled.values():
            draw.text((30, y), line, fill="black", font=font_sm)
            y += 36
    else:
        draw.text((30, 30), "IDENTITY CARD", fill="black", font=font_sm)
        draw.text((30, 90), full_name or "", fill="black", font=font_lg)
        draw.text((30, 160), "Date of Birth: 1985-03-22", fill="black", font=font_sm)
        draw.text((30, 200), "ID Number: 987654321", fill="black", font=font_sm)

    if rotate_deg:
        img = img.rotate(rotate_deg, expand=True, fillcolor="white")
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(radius=2.5))

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    return path


def post_multipart(url: str, file_path: Path) -> dict:
    boundary = "----verifyboundary"
    data = file_path.read_bytes()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode()
    body += data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={**HEADERS, "Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def post_extract_fields(doc_id: str) -> dict:
    req = urllib.request.Request(
        f"{API}/documents/{doc_id}/extract-fields",
        headers={**HEADERS, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def run_case(name: str, image: Path) -> dict:
    print(f"\n{'=' * 60}\nCASE: {name}\n{'=' * 60}")
    uploaded = post_multipart(f"{API}/documents/extract-id", image)
    print("raw_text preview:", (uploaded.get("raw_text") or "")[:180].replace("\n", " | "))
    fields = post_extract_fields(uploaded["document_id"])
    filled = sum(
        1
        for k in ("first_name", "last_name", "date_of_birth", "father_name", "mother_name", "id_number")
        if (fields.get(k) or "").strip()
    )
    print(
        f"source={fields.get('extraction_source')} "
        f"llm_attempted={fields.get('llm_fallback_attempted')} "
        f"filled={filled}/6 conf={fields.get('confidence')} "
        f"warnings={fields.get('extraction_warnings')}"
    )
    print(json.dumps({k: fields.get(k) for k in (
        "first_name", "last_name", "date_of_birth", "father_name", "mother_name", "id_number",
        "confidence", "extraction_source", "llm_fallback_attempted", "extraction_warnings",
    )}, indent=2))
    return fields


def main() -> int:
    OUT.mkdir(exist_ok=True)

    cases = [
        ("john_smith (no parents)", make_card(OUT / "john_smith.png", full_name="JOHN A. SMITH")),
        (
            "labeled_id (all 6 fields)",
            make_card(
                OUT / "labeled_id.png",
                labeled={
                    "a": "PALESTINIAN ID",
                    "b": "FIRST NAME: AHMAD",
                    "c": "LAST NAME: KHALIL",
                    "d": "Date of Birth: 01 JAN 1990",
                    "e": "FATHER'S NAME: MOHAMMED KHALIL",
                    "f": "MOTHER'S NAME: FATIMA ALI",
                    "g": "ID Number: 123456789",
                },
            ),
        ),
        ("rotated 12°", make_card(OUT / "rotated_id.png", full_name="JOHN A. SMITH", rotate_deg=12)),
        ("blurry", make_card(OUT / "blurry_id.png", full_name="JOHN A. SMITH", blur=True)),
    ]

    results: list[tuple[str, dict]] = []
    try:
        for name, path in cases:
            results.append((name, run_case(name, path)))
    except urllib.error.URLError as exc:
        print(f"API not reachable at {API}: {exc}", file=sys.stderr)
        print("Start the backend: npm run dev:api", file=sys.stderr)
        return 1

    print(f"\n{'=' * 60}\nextraction_source SUMMARY\n{'=' * 60}")
    print(f"{'Case':<30} {'Source':<12} {'LLM?':<6} {'Filled':<8} {'Conf'}")
    print("-" * 60)
    failures = 0
    for name, fields in results:
        filled = sum(
            1
            for k in ("first_name", "last_name", "date_of_birth", "father_name", "mother_name", "id_number")
            if (fields.get(k) or "").strip()
        )
        source = fields.get("extraction_source", "?")
        llm = "yes" if fields.get("llm_fallback_attempted") else "no"
        conf = fields.get("confidence", 0)
        print(f"{name:<30} {source:<12} {llm:<6} {filled}/6{'':<3} {conf}")

        if name.startswith("john_smith"):
            if fields.get("first_name") != "JOHN" or fields.get("last_name") != "SMITH":
                print("  FAIL: expected JOHN / SMITH")
                failures += 1
            if source != "regex":
                print("  FAIL: expected regex-only (no unnecessary LLM)")
                failures += 1
            if (fields.get("father_name") or "").strip() or (fields.get("mother_name") or "").strip():
                print("  FAIL: parent names should be empty")
                failures += 1

        if name.startswith("labeled_id"):
            if filled < 6:
                print(f"  FAIL: expected 6/6 fields, got {filled}")
                failures += 1
            if source != "regex":
                print("  FAIL: expected regex-only for clean labeled card")
                failures += 1

        if name.startswith("rotated"):
            if not fields.get("first_name") or not fields.get("id_number"):
                print("  FAIL: deskew + OCR should still extract core fields")
                failures += 1

        if name.startswith("blurry"):
            if not fields.get("llm_fallback_attempted"):
                print("  FAIL: expected LLM fallback attempt for blurry image")
                failures += 1
            # With or without API key, we should get either regex+llm or a warning
            if source == "regex" and filled < 4 and not fields.get("extraction_warnings"):
                print("  FAIL: blurry image with low regex fill should warn if LLM unavailable")
                failures += 1

    if failures:
        print(f"\n{failures} verification check(s) failed.")
        return 1

    print("\nAll verification checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
