# Performance Testing Report

**Date:** 2026-07-06; **rebased 2026-07-13**  
**Environment:** Local build audit (no load generator)

## Build metrics

| Metric | Value (2026-07-06) | Value (2026-07-13) [rebased] | Threshold | Status |
|--------|------:|------:|-----------|--------|
| Vite build time | 3.01s | 3.94s | — | OK |
| Main JS bundle (minified) | 896.69 KB | **957.39 kB** | 500 KB warning | **WARN** BUG-010 — grew further |
| Main JS gzip | 262.59 KB | **281.39 kB** | — | Acceptable, but growing |
| CSS bundle | 79.63 KB | **82.86 KB** | — | OK |
| Modules transformed | 1854 | **1870** | — | — |

**Growth attribution:** the +60.7 kB / +18.8 kB gzip increase traces to the 5 new `loan*.ts` modules, the expanded Global Help System (6 new components), and the new onboarding-tour config — all additive, no dead code identified as the cause.

## Static performance observations

| Area | Finding | Severity |
|------|---------|----------|
| Bundle size | Single large chunk; no dynamic imports for heavy pages | Medium |
| Credit scoring | Synchronous compute; fast for single assessment | OK |
| Dashboard | Multiple hooks fetch in parallel (stats + activity) | OK |
| Realtime | Subscriptions on 2+ tables — monitor connection count | Low |
| OCR pipeline | CPU-heavy (Tesseract); not profiled in this audit | Unknown |
| Edge functions | credit-assessment max_tokens=400 (optimized) | OK |

## Tests not executed

| Test | Reason |
|------|--------|
| Lighthouse audit | No browser automation configured |
| k6 / Artillery load test | Out of scope for static QA phase |
| Supabase query timing | No live DB access |
| OCR latency under load | API server not running |

## Recommendations

1. Add `manualChunks` in Vite for Credit Risk, Documents, AI Assistant routes
2. Paginate approval_requests and documents tables
3. Lazy-load Recharts or heavy chart libraries if added
4. Run Lighthouse CI in future pipeline (target LCP < 2.5s)

## Result

**PARTIAL PASS** — No critical runtime slowness detected in code review; bundle size flagged for improvement.
