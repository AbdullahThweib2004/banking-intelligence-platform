# Test Summary

**Date:** 2026-07-06; **rebased 2026-07-13** — see `QA_Summary_After_Rebase.md` for the full executive summary

| Metric | Value (2026-07-06) | Value (2026-07-13) [rebased] |
|--------|------:|------:|
| Requirements mapped | 34 | **44** |
| Test cases defined | 96 | **122** |
| Executed (automated) | 9 | **37** |
| Passed | 22 (+ 9 automated) | 22 baseline + **26 new** (+ 37 automated) — see `Test_Cases.md` for the split into unit/container/inspection evidence |
| Failed | 2 | 2 (unchanged, both pre-existing/unrelated) |
| Blocked | 68 | **74** |
| Not yet verified (user action required) | 0 | **1** (TC-CR-21, live schema-cache re-confirmation) |
| Partial | 4 | 1 (3 reclassified into more precise evidence categories) |

**Automated run:** `npm test` → **9/9 PASS** (baseline) → **[rebased] 37/37 PASS, 8 suites**

**Build:** `npm run build` → **PASS** → **[rebased] PASS, bundle 957.39 kB / 281.39 kB gzip (was 896.69 KB / 262.59 KB)**

**Lint:** `npm run lint` → **FAIL** (3 errors) → **[rebased] FAIL (6 errors, 15 warnings — 3 new since Jul 7, see BUG-013)**

**Recommendation:** Conditional pass for graduation demo; fix BUG-001 before security review. **[Rebased]** Also re-confirm BUG-014 (schema-cache fix) live before demoing the credit-risk flow — see `Known_Issues.md` and `QA_Summary_After_Rebase.md`.
