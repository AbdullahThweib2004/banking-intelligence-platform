#!/usr/bin/env python3
"""Generate two synthetic ID card images and verify OCR outputs differ."""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "backend" / "test_images"
API = "http://127.0.0.1:8000"
HEADERS = {"X-User-Role": "branch_employee"}


def make_id_card(path: Path, full_name: str, dob: str, id_num: str) -> None:
    img = Image.new("RGB", (640, 400), "white")
    draw = ImageDraw.Draw(img)
    try:
        font_lg = ImageFont.truetype("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf", 28)
        font_sm = ImageFont.truetype("/usr/share/fonts/TTF/DejaVuSans.ttf", 20)
    except OSError:
        font_lg = ImageFont.load_default()
        font_sm = font_lg

    draw.rectangle([10, 10, 630, 390], outline="black", width=2)
    draw.text((30, 30), "IDENTITY CARD", fill="black", font=font_sm)
    draw.text((30, 90), full_name, fill="black", font=font_lg)
    draw.text((30, 160), f"Date of Birth: {dob}", fill="black", font=font_sm)
    draw.text((30, 200), f"ID Number: {id_num}", fill="black", font=font_sm)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def post_multipart(url: str, file_path: Path) -> dict:
    boundary = "----testboundary"
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
        headers={
            **HEADERS,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def post_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={**HEADERS, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def run_one(label: str, image: Path) -> dict:
    print(f"\n=== {label} ===")
    uploaded = post_multipart(f"{API}/documents/extract-id", image)
    print("extract-id raw_text:", uploaded.get("raw_text", "")[:200])
    doc_id = uploaded["document_id"]
    fields = post_json(f"{API}/documents/{doc_id}/extract-fields")
    print("extract-fields:", json.dumps(fields, indent=2))
    return fields


def main() -> int:
    img_a = OUT / "john_smith.png"
    img_b = OUT / "sara_omar.png"
    make_id_card(img_a, "JOHN A. SMITH", "1985-03-22", "987654321")
    make_id_card(img_b, "SARA OMAR", "1992-11-08", "123456789")

    try:
        a = run_one("Image A — JOHN A. SMITH", img_a)
        b = run_one("Image B — SARA OMAR", img_b)
    except urllib.error.URLError as exc:
        print(f"API not reachable at {API}: {exc}", file=sys.stderr)
        print("Start the backend: npm run dev:api", file=sys.stderr)
        return 1

    same = (
        a.get("first_name") == b.get("first_name")
        and a.get("last_name") == b.get("last_name")
        and a.get("id_number") == b.get("id_number")
    )
    if same:
        print("\nFAIL: both images returned identical parsed fields — OCR may still be mocked or broken.")
        return 1

    print("\nPASS: parsed fields differ between the two test images.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
