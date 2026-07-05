#!/usr/bin/env python3
"""Test PDF form generation for English and Arabic ID cards."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test_images"
API = "http://127.0.0.1:8000"
HEADERS = {"X-User-Role": "branch_employee"}


def _fonts():
    try:
        lg = ImageFont.truetype("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf", 26)
        sm = ImageFont.truetype("/usr/share/fonts/TTF/DejaVuSans.ttf", 18)
    except OSError:
        lg = ImageFont.load_default()
        sm = lg
    return lg, sm


def make_maria_garcia(path: Path) -> Path:
    lg, sm = _fonts()
    img = Image.new("RGB", (640, 420), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([10, 10, 630, 410], outline="black", width=2)
    d.text((30, 30), "IDENTITY CARD", fill="black", font=sm)
    d.text((30, 80), "MARIA GARCIA", fill="black", font=lg)
    d.text((30, 140), "FIRST NAME: MARIA", fill="black", font=sm)
    d.text((30, 175), "LAST NAME: GARCIA", fill="black", font=sm)
    d.text((30, 220), "Date of Birth: 15 APR 1988", fill="black", font=sm)
    d.text((30, 260), "ID Number: 445566778", fill="black", font=sm)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    return path


def make_arabic_id(path: Path) -> Path:
    lg, sm = _fonts()
    img = Image.new("RGB", (640, 480), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([10, 10, 630, 470], outline="black", width=2)
    lines = [
        "بطاقة الهوية الفلسطينية",
        "الاسم الأول: أحمد",
        "اسم العائلة: خليل",
        "تاريخ الميلاد: 01 JAN 1990",
        "اسم الأب: محمد خليل",
        "اسم الأم: فاطمة علي",
        "رقم الهوية: 123456789",
    ]
    y = 28
    for i, line in enumerate(lines):
        d.text((30, y), line, fill="black", font=lg if i == 0 else sm)
        y += 38 if i == 0 else 34
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    return path


def post_multipart(url: str, file_path: Path) -> dict:
    boundary = "----formtest"
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


def post_json(url: str, payload: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={**HEADERS, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def run_case(name: str, image: Path, expected_lang: str) -> bool:
    print(f"\n=== {name} ===")
    uploaded = post_multipart(f"{API}/documents/extract-id", image)
    doc_id = uploaded["document_id"]

    fields = post_json(f"{API}/documents/{doc_id}/extract-fields", {})
    lang = fields.get("language")
    print(f"extract-fields language={lang} (expected {expected_lang})")

    pdf = post_json(
        f"{API}/documents/{doc_id}/generate-form",
        {
            "first_name": fields.get("first_name") or "TEST",
            "last_name": fields.get("last_name") or "USER",
            "date_of_birth": fields.get("date_of_birth") or "1990-01-01",
            "id_number": fields.get("id_number") or "123456789",
            "father_name": fields.get("father_name") or "",
            "mother_name": fields.get("mother_name") or "",
            "language": lang,
            "return_format": "base64",
        },
    )

    out = OUT / f"form_{name.replace(' ', '_')}.pdf"
    import base64

    out.write_bytes(base64.b64decode(pdf["pdf_base64"]))
    print(f"PDF: {out} ({pdf['size_bytes']} bytes)")

    ok = lang == expected_lang and pdf["size_bytes"] > 5000
    if not ok:
        print("FAIL")
    return ok


def main() -> int:
    maria = make_maria_garcia(OUT / "maria_garcia_id.png")
    arabic = make_arabic_id(OUT / "arabic_labeled_id.png")

    try:
        results = [
            run_case("maria_garcia_en", maria, "en"),
            run_case("arabic_labeled_ar", arabic, "ar"),
        ]
    except urllib.error.URLError as exc:
        print(f"API not reachable: {exc}", file=sys.stderr)
        return 1

    if all(results):
        print("\nAll form generation tests passed.")
        return 0
    print("\nSome tests failed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
