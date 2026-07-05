"""Render account-opening PDF forms (bank + customer copies) from extracted fields."""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from jinja2 import Environment, FileSystemLoader, select_autoescape

from services.field_extraction import detect_document_language

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
TEMPLATE_BY_LANG = {"en": "form_en.html", "ar": "form_ar.html"}

FormLanguage = Literal["ar", "en"]

_STRINGS: dict[FormLanguage, dict[str, str]] = {
    "en": {
        "title": "Account Opening Form",
        "bank_name": "Bank of Palestine",
        "form_title": "New Account Opening Application",
        "document_id": "Document ID",
        "generated_at": "Generated",
        "intro": "Please find below the customer details extracted from the submitted identification document.",
        "first_name": "First Name",
        "last_name": "Last Name",
        "date_of_birth": "Date of Birth",
        "id_number": "ID Number",
        "father_name": "Father's Name",
        "mother_name": "Mother's Name",
        "declaration": (
            "I confirm that the information above is accurate to the best of my knowledge "
            "and authorize the bank to process this account opening request."
        ),
        "terms_heading": "Terms & Conditions",
        "terms_pending": (
            "[PENDING LEGAL REVIEW — Compliance/legal team must supply approved "
            "terms and conditions text before production use. Do not treat this placeholder as binding.]"
        ),
        "customer_signature": "Customer Signature",
        "employee_signature": "Employee Signature",
        "sign_here": "Sign here",
        "footer": "Bank of Palestine — Internal use. Two copies: bank and customer.",
        "bank_copy": "BANK COPY",
        "customer_copy": "CUSTOMER COPY",
        "bank_watermark": "BANK COPY",
        "customer_watermark": "CUSTOMER COPY",
    },
    "ar": {
        "title": "نموذج فتح حساب",
        "bank_name": "بنك فلسطين",
        "form_title": "طلب فتح حساب جديد",
        "document_id": "رقم المستند",
        "generated_at": "تاريخ الإنشاء",
        "intro": "فيما يلي بيانات العميل المستخرجة من وثيقة الهوية المقدمة.",
        "first_name": "الاسم الأول",
        "last_name": "اسم العائلة",
        "date_of_birth": "تاريخ الميلاد",
        "id_number": "رقم الهوية",
        "father_name": "اسم الأب",
        "mother_name": "اسم الأم",
        "declaration": (
            "أقر بأن المعلومات الواردة أعلاه صحيحة حسب علمي، "
            "وأفوض البنك بمعالجة طلب فتح الحساب."
        ),
        "terms_heading": "الشروط والأحكام",
        "terms_pending": (
            "[قيد المراجعة القانونية — يجب على فريق الامتثال/القانوني تزويد نص "
            "الشروط والأحكام المعتمد قبل الاستخدام في الإنتاج. لا يُعتد بهذا النص المؤقت.]"
        ),
        "customer_signature": "توقيع العميل",
        "employee_signature": "توقيع الموظف",
        "sign_here": "وقّع هنا",
        "footer": "بنك فلسطين — للاستخدام الداخلي. نسختان: البنك والعميل.",
        "bank_copy": "نسخة البنك",
        "customer_copy": "نسخة العميل",
        "bank_watermark": "نسخة البنك",
        "customer_watermark": "نسخة العميل",
    },
}


@dataclass
class FormFields:
    first_name: str
    last_name: str
    date_of_birth: str
    id_number: str
    father_name: str = ""
    mother_name: str = ""


@dataclass
class SignaturePayload:
    customer_signature: str | None = None
    employee_signature: str | None = None

    @property
    def staff_signature(self) -> str | None:
        """Backward-compatible alias."""
        return self.employee_signature


def resolve_form_language(raw_text: str, requested: FormLanguage | None = None) -> FormLanguage:
    if requested in ("ar", "en"):
        return requested
    detected = detect_document_language(raw_text)
    return "ar" if detected == "ar" else "en"


def _salutation_line(lang: FormLanguage, full_name: str) -> str:
    name = full_name or "—"
    if lang == "ar":
        return f"السيد/السيدة {name}،"
    return f"Dear Mr./Ms. {name},"


def _decode_signature_to_data_uri(value: str | None) -> str | None:
    if not value or not value.strip():
        return None
    raw = value.strip()
    if raw.startswith("data:"):
        return raw
    try:
        base64.b64decode(raw, validate=True)
    except Exception:
        logger.warning("[form_generator] invalid signature base64 — treating as empty")
        return None
    return f"data:image/png;base64,{raw}"


def _render_html(
    *,
    document_id: str,
    fields: FormFields,
    lang: FormLanguage,
    signatures: SignaturePayload,
) -> str:
    strings = _STRINGS[lang]
    full_name = f"{fields.first_name} {fields.last_name}".strip()
    template_name = TEMPLATE_BY_LANG[lang]

    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html"]),
    )
    template = env.get_template(template_name)

    copies = [
        {"label": strings["bank_copy"], "watermark": strings["bank_watermark"]},
        {"label": strings["customer_copy"], "watermark": strings["customer_watermark"]},
    ]

    return template.render(
        strings=strings,
        document_id=document_id,
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        salutation_line=_salutation_line(lang, full_name),
        first_name=fields.first_name or "—",
        last_name=fields.last_name or "—",
        date_of_birth=fields.date_of_birth or "—",
        id_number=fields.id_number or "—",
        father_name=fields.father_name.strip(),
        mother_name=fields.mother_name.strip(),
        copies=copies,
        customer_signature_data_uri=_decode_signature_to_data_uri(signatures.customer_signature),
        employee_signature_data_uri=_decode_signature_to_data_uri(signatures.employee_signature),
    )


def generate_account_opening_pdf(
    *,
    document_id: str,
    raw_text: str,
    fields: FormFields,
    language: FormLanguage | None = None,
    signatures: SignaturePayload | None = None,
) -> bytes:
    """Build a two-page PDF (bank copy + customer copy) from extracted fields."""
    try:
        from weasyprint import HTML
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "WeasyPrint is not installed. Run: pip install weasyprint "
            "(and install system deps: pango, cairo — see backend/README.md)."
        ) from exc

    lang = resolve_form_language(raw_text, language)
    sig = signatures or SignaturePayload()
    html = _render_html(document_id=document_id, fields=fields, lang=lang, signatures=sig)

    logger.info(
        "[form_generator] document_id=%s template=%s customer_sig=%s employee_sig=%s",
        document_id,
        TEMPLATE_BY_LANG[lang],
        bool(sig.customer_signature),
        bool(sig.employee_signature),
    )

    return HTML(string=html, base_url=str(TEMPLATES_DIR)).write_pdf()
