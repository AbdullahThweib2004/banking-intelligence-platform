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
    """Debug: OCR output per preprocessing pass."""
    pass_details: list[dict[str, str | float]]


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
        pix = page.get_pixmap(dpi=300, alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        doc.close()
    else:
        img = Image.open(io.BytesIO(data)).convert("RGB")

    rgb = np.array(img)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def _upscale(gray: np.ndarray, min_side: int = 1500) -> np.ndarray:
    h, w = gray.shape[:2]
    longest = max(h, w)
    if longest >= min_side:
        return gray
    scale = min_side / longest
    return cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)


def deskew_bgr(bgr: np.ndarray) -> tuple[np.ndarray, float]:
    """
    Correct slight rotation from phone photos using min-area rect on text pixels.
    Returns (deskewed_image, angle_degrees_applied).
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    coords = np.column_stack(np.where(thresh > 0))
    if len(coords) < 500:
        return bgr, 0.0

    rect = cv2.minAreaRect(coords)
    angle = float(rect[-1])
    # OpenCV returns angle in [-90, 0); normalize to small skew correction.
    if angle < -45:
        angle = 90 + angle
    elif angle > 45:
        angle = angle - 90

    if abs(angle) < 0.5:
        return bgr, 0.0

    # minAreaRect angle sign is opposite to the rotation needed for correction.
    correction = -angle
    h, w = bgr.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, correction, 1.0)
    rotated = cv2.warpAffine(
        bgr,
        matrix,
        (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return rotated, round(correction, 2)


def preprocess_mild(bgr: np.ndarray) -> np.ndarray:
    """
    Gentle preprocessing for name/date regions — CLAHE contrast only.
    Aggressive binarization often destroys label text like 'Date of Birth'.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    gray = _upscale(gray)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(gray)


def preprocess_binary(bgr: np.ndarray) -> np.ndarray:
    """Stronger binarization — can help digit-only regions but hurts labels."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    gray = _upscale(gray)
    denoised = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
    return cv2.adaptiveThreshold(
        denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
    )


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


def _ocr_image(img: np.ndarray, lang: str) -> tuple[str, float]:
    pil = Image.fromarray(img)
    config = "--psm 6"
    try:
        raw_text = pytesseract.image_to_string(pil, lang=lang, config=config)
        confidence = _mean_tesseract_confidence(pil, lang)
    except pytesseract.TesseractError:
        raw_text = pytesseract.image_to_string(pil, lang="eng", config=config)
        confidence = _mean_tesseract_confidence(pil, "eng")
    return raw_text.strip(), confidence


def _merge_ocr_passes(pass_texts: list[tuple[str, str, float]]) -> str:
    """
    Combine lines from multiple passes — prefer longer/more informative lines
    when the same semantic content appears with OCR variants.
    """
    seen_normalized: set[str] = set()
    merged_lines: list[str] = []

    # Process passes in order of descending confidence.
    for _name, text, _conf in sorted(pass_texts, key=lambda item: item[2], reverse=True):
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            key = re.sub(r"[^a-z0-9]+", "", stripped.lower())
            if key in seen_normalized:
                continue
            # If a shorter line is a prefix of an existing line, skip it.
            if any(key in other or other in key for other in seen_normalized if len(other) > 3):
                continue
            seen_normalized.add(key)
            merged_lines.append(stripped)

    return "\n".join(merged_lines)


def _score_pass(text: str, confidence: float) -> float:
    """Prefer passes that capture alphabetic label text, not just digits."""
    alpha = len(re.findall(r"[A-Za-z]", text))
    digits = len(re.findall(r"\d", text))
    return confidence + alpha * 0.5 + min(digits, 20) * 0.1


def run_ocr(file_bytes: bytes, filename: str) -> OcrResult:
    if not tesseract_available():
        raise RuntimeError(
            "tesseract is not installed. Install it with: "
            "sudo pacman -S tesseract tesseract-data-eng tesseract-data-ara"
        )

    bgr = _bytes_to_bgr(file_bytes, filename)
    bgr, skew_angle = deskew_bgr(bgr)
    if skew_angle:
        logger.info("[OCR] deskew applied: angle=%.2f°", skew_angle)
    lang = "eng+ara"

    mild = preprocess_mild(bgr)
    binary = preprocess_binary(bgr)

    pass_texts: list[tuple[str, str, float]] = []
    for pass_name, img in (("mild_clahe", mild), ("binary_adaptive", binary)):
        text, conf = _ocr_image(img, lang)
        pass_texts.append((pass_name, text, conf))
        logger.info(
            "[OCR PASS %s] confidence=%.1f chars=%d\n--- text ---\n%s\n--- end ---",
            pass_name,
            conf,
            len(text),
            text or "(empty)",
        )

    best_name, best_text, best_conf = max(pass_texts, key=lambda item: _score_pass(item[1], item[2]))
    merged = _merge_ocr_passes(pass_texts)

    # Use merged text when it adds label keywords the best single pass missed.
    label_tokens = ("name", "birth", "father", "mother", "date", "id")
    merged_lower = merged.lower()
    best_lower = best_text.lower()
    if any(tok in merged_lower and tok not in best_lower for tok in label_tokens):
        raw_text = merged
        ocr_confidence = best_conf
        logger.info("[OCR] using merged output from multiple passes")
    else:
        raw_text = best_text
        ocr_confidence = best_conf
        logger.info("[OCR] using best single pass: %s", best_name)

    logger.info(
        "[OCR FINAL] file=%s pass=%s confidence=%.1f chars=%d\n--- raw_text ---\n%s\n--- end ---",
        filename,
        best_name if raw_text == best_text else "merged",
        ocr_confidence,
        len(raw_text),
        raw_text or "(empty)",
    )

    if not raw_text:
        raise ValueError("OCR returned no readable text from the uploaded image.")

    pass_details = [
        {"pass": name, "confidence": conf, "text": text[:500]}
        for name, text, conf in pass_texts
    ]

    return OcrResult(
        raw_text=raw_text,
        language=detect_language(raw_text),
        ocr_confidence=ocr_confidence,
        pass_details=pass_details,
    )
