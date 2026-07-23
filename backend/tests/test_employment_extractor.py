"""
Unit tests for the pure (no-network) parts of services/employment_extractor.py.

Run with:  cd backend && .venv/bin/python -m unittest tests/test_employment_extractor.py -v

The LLM-calling path itself (extract_employment_fields) requires a live
OPENROUTER_API_KEY and network access, so it isn't unit tested here — the
same limitation applies to the pre-existing ID extractor. Only the
deterministic normalization logic (_parse_salary) is covered, using stdlib
unittest to match this backend's existing lack of a pytest dependency.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.employment_extractor import (  # noqa: E402
    _parse_currency,
    _parse_employment_status,
    _parse_salary,
)


class TestParseSalary(unittest.TestCase):
    def test_accepts_plain_number(self):
        self.assertEqual(_parse_salary(3200), 3200.0)
        self.assertEqual(_parse_salary(3200.5), 3200.5)

    def test_strips_thousands_separators_and_currency_text(self):
        self.assertEqual(_parse_salary("3,200"), 3200.0)
        self.assertEqual(_parse_salary("3200.50 NIS"), 3200.5)
        self.assertEqual(_parse_salary("$4,500"), 4500.0)

    def test_returns_none_for_unusable_input(self):
        self.assertIsNone(_parse_salary(""))
        self.assertIsNone(_parse_salary(None))
        self.assertIsNone(_parse_salary("not a number"))

    def test_rejects_booleans_even_though_they_are_ints_in_python(self):
        # bool is a subclass of int in Python — True/False must not silently
        # become 1.0/0.0 if the LLM ever returns a boolean by mistake.
        self.assertIsNone(_parse_salary(True))
        self.assertIsNone(_parse_salary(False))

    def test_zero_is_a_valid_salary_not_a_missing_value(self):
        self.assertEqual(_parse_salary(0), 0.0)


class TestParseCurrency(unittest.TestCase):
    def test_accepts_supported_currencies_case_insensitively(self):
        self.assertEqual(_parse_currency("ILS"), "ILS")
        self.assertEqual(_parse_currency("usd"), "USD")
        self.assertEqual(_parse_currency(" Jod "), "JOD")

    def test_rejects_unsupported_or_missing_currency_rather_than_guessing(self):
        self.assertEqual(_parse_currency("GBP"), "")
        self.assertEqual(_parse_currency(""), "")
        self.assertEqual(_parse_currency(None), "")
        self.assertEqual(_parse_currency("dollars"), "")  # model must say USD, not prose


class TestParseEmploymentStatus(unittest.TestCase):
    def test_accepts_known_statuses_case_insensitively(self):
        self.assertEqual(_parse_employment_status("Employed"), "employed")
        self.assertEqual(_parse_employment_status("SELF-EMPLOYED"), "self-employed")
        self.assertEqual(_parse_employment_status("business"), "business")

    def test_rejects_hallucinated_or_missing_status(self):
        self.assertEqual(_parse_employment_status("retired"), "")
        self.assertEqual(_parse_employment_status(""), "")
        self.assertEqual(_parse_employment_status(None), "")


if __name__ == "__main__":
    unittest.main()
