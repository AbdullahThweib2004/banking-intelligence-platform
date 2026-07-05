"""Image preprocessing and OCR for ID documents."""

from __future__ import annotations

import io
import logging
import re
import shutil
from dataclasses import dataclass
from typing import Literal

import cv2
import numpy as np
from PIL import Image

try:
    import pytesseract
except ImportError as exc:  # pragma: no cover
    raise RuntimeError(
        "pytesseract is not installed. Run: pip install pytesseract"
    ) from exc

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    fitz = None  # type: ignore

logger = logging.getLogger(__name__)

Language = Literal["en", "ar", "mixed"]


@dataclass
class OcrResult:
    raw_text: str
    language: Language
    """Average Tesseract word confidence (0–100)."""
    ocr_confidence: float


def tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


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

    denoised = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)

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


def _mean_tesseract_confidence(pil: Image.Image, lang: str) -> float:
    data = pytesseract.image_to_data(pil, lang=lang, output_type=pytesseract.Output.DICT)
    scores = [int(c) for c in data.get("conf", []) if str(c).lstrip("-").isdigit() and int(c) > 0]
    if not scores:
        return 0.0
    return round(sum(scores) / len(scores), 1)


def run_ocr(file_bytes: bytes, filename: str) -> OcrResult:
    if not tesseract_available():
        raise RuntimeError(
            "tesseract is not installed. Install it with: "
            "sudo pacman -S tesseract tesseract-data-eng tesseract-data-ara"
        )

    bgr = _bytes_to_bgr(file_bytes, filename)
    processed = preprocess_image(bgr)
    pil = Image.fromarray(processed)

    lang = "eng+ara"
    try:
        raw_text = pytesseract.image_to_string(pil, lang=lang)
        ocr_confidence = _mean_tesseract_confidence(pil, lang)
    except pytesseract.TesseractError:
        lang = "eng"
        raw_text = pytesseract.image_to_string(pil, lang=lang)
        ocr_confidence = _mean_tesseract_confidence(pil, lang)

    raw_text = raw_text.strip()
    logger.info(
        "[OCR DEBUG] file=%s chars=%d confidence=%.1f\n--- raw_text ---\n%s\n--- end ---",
        filename,
        len(raw_text),
        ocr_confidence,
        raw_text or "(empty)",
    )

    if not raw_text:
        raise ValueError("OCR returned no readable text from the uploaded image.")

    return OcrResult(
        raw_text=raw_text,
        language=detect_language(raw_text),
        ocr_confidence=ocr_confidence,
    )
