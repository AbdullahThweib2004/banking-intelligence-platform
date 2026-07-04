"""Image preprocessing and OCR for ID documents."""

from __future__ import annotations

import io
import os
import re
import shutil
from typing import Literal

import cv2
import numpy as np
from PIL import Image

try:
    import pytesseract
except ImportError:  # pragma: no cover
    pytesseract = None  # type: ignore

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    fitz = None  # type: ignore


Language = Literal["en", "ar", "mixed"]

_MOCK_ID_TEXT = """Palestinian ID Card
First Name: Ahmad
Last Name: Khalil
Date of Birth: 1990-05-14
Father Name: Mahmoud
Mother Name: Layla
ID Number: 400123456
"""


def tesseract_available() -> bool:
    return pytesseract is not None and shutil.which("tesseract") is not None


def mock_allowed() -> bool:
    return os.environ.get("OCR_ALLOW_MOCK", "").lower() in ("1", "true", "yes")


def _bytes_to_bgr(data: bytes, filename: str) -> np.ndarray:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        if fitz is None:
            raise RuntimeError("PDF support requires pymupdf (pip install pymupdf).")
        doc = fitz.open(stream=data, filetype="pdf")
        if doc.page_count == 0:
            raise ValueError("PDF has no pages.")
        page = doc.load_page(0)
        pix = page.get_pixmap(dpi=200, alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        doc.close()
    else:
        img = Image.open(io.BytesIO(data)).convert("RGB")

    rgb = np.array(img)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def preprocess_image(bgr: np.ndarray) -> np.ndarray:
    """Grayscale, denoise, deskew — returns a single-channel image ready for OCR."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

    # Denoise while preserving edges.
    denoised = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)

    # Deskew via minimum-area bounding rectangle on foreground pixels.
    _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    coords = np.column_stack(np.where(binary < 128))
    if len(coords) > 100:
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        elif angle > 45:
            angle = angle - 90
        if abs(angle) > 0.5:
            (h, w) = denoised.shape[:2]
            center = (w // 2, h // 2)
            matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
            denoised = cv2.warpAffine(
                denoised,
                matrix,
                (w, h),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REPLICATE,
            )

    # Adaptive threshold for clearer text contrast.
    processed = cv2.adaptiveThreshold(
        denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
    )
    return processed


def detect_language(text: str) -> Language:
    if not text.strip():
        return "en"
    arabic = len(re.findall(r"[\u0600-\u06FF]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    if arabic > 0 and latin > 0:
        return "mixed"
    if arabic > latin:
        return "ar"
    return "en"


def run_ocr(file_bytes: bytes, filename: str) -> tuple[str, Language]:
    if not tesseract_available():
        if mock_allowed():
            # Dev-only path when the tesseract binary is not installed locally.
            return _MOCK_ID_TEXT.strip(), "en"
        raise RuntimeError(
            "tesseract is not installed. Install tesseract-ocr (e.g. "
            "'sudo pacman -S tesseract tesseract-data-eng') or set OCR_ALLOW_MOCK=true for local dev."
        )

    try:
        bgr = _bytes_to_bgr(file_bytes, filename)
        processed = preprocess_image(bgr)
        pil = Image.fromarray(processed)
    except Exception as exc:
        if mock_allowed():
            return _MOCK_ID_TEXT.strip(), "en"
        raise exc

    # English + Arabic where available; fall back to eng.
    try:
        raw_text = pytesseract.image_to_string(pil, lang="eng+ara")
    except pytesseract.TesseractError:
        raw_text = pytesseract.image_to_string(pil, lang="eng")

    raw_text = raw_text.strip()
    if not raw_text and mock_allowed():
        return _MOCK_ID_TEXT.strip(), "en"
    return raw_text, detect_language(raw_text)
