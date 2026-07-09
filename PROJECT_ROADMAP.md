# Bank of Palestine Intelligence Platform — Project Overview & Roadmap

> **Repository:** `banking-intelligence-platform` (package name: `bop-intelligence-platform`)
> **Version:** `0.0.0` (pre-release / graduation build)
> **Type:** Academic graduation project — an AI-powered banking intelligence platform built for **Bank of Palestine (BoP)** as a realistic branch-operations demo, not a production banking system.
> **Document purpose:** Single source of truth for what this project is, how it is built, what is finished, what is broken, and what comes next.

---

## 1. Project Overview

### What this is

The **Bank of Palestine Intelligence Platform** is a web application that simulates the internal, employee-facing tools of a retail bank branch: credit risk assessment, document/OCR-based account opening, an approvals workflow, an internal policy-grounded AI assistant, audit logging, and user/role administration. It is built as a **React single-page application** backed by **Supabase** (Postgres, Auth, Row Level Security, Realtime, Storage, Edge Functions) and a small **FastAPI microservice** dedicated to OCR and PDF form generation for the account-opening flow.

The codebase originated from a Lovable-generated scaffold (visible in the two "Initial commit" entries and the `lovable-tagger` dev dependency) and was then built out over roughly three weeks of active development (first commit **2026-06-17**, most recent **2026-07-09**) into the current feature set.

### Why it exists / problem it solves

Bank branch staff currently juggle multiple disconnected tools and manual processes for: entering a new credit application, manually reading a customer's national ID to open an account, tracking which loan applications are pending review, and finding the right internal policy answer. This platform consolidates those workflows into one role-aware dashboard: an employee submits a credit assessment and it is AI-scored in seconds; a manager opens a new account by uploading an ID photo instead of retyping it; a risk officer reviews and approves/rejects applications with a full AI-generated explanation attached; and everyone can ask a policy chatbot instead of hunting through a PDF handbook — all while every state-changing action is written to an append-only audit trail.

### Target users

Three internal bank roles (see [§9](#9-user-roles-and-access)):

| Role (DB value) | Everyday name | Primary responsibilities in the app |
|---|---|---|
| `branch_employee` | Branch Employee | Submits credit assessments, uploads documents, opens new accounts, raises objections on finalized applications |
| `branch_manager` | Branch Manager | Everything an employee can do, plus manages user accounts/roles and views modification requests |
| `risk_department` | Risk Department | Approves/rejects credit applications, reviews modification requests, reads the audit log |

### Business/domain context

Retail banking, specifically **branch-level credit risk operations** for Bank of Palestine: personal/car/home/business loan applications, KYC-style ID-based account opening, and internal compliance logging. All business copy, seed data (`BOP-100001`…`BOP-100010` demo customers), and terminology (₪ currency, national ID numbers, loan purposes) are written for this specific institution.

### High-level summary of the platform

- A bilingual (English / Arabic, full RTL support) React dashboard shell shared by every page.
- Three Supabase Edge Functions provide the "smart" backend logic: AI credit scoring, policy semantic search, and privileged user administration.
- A separate FastAPI service handles ID-photo OCR and generated PDF account-opening forms — the only piece of the system that is not Supabase.
- All business data lives in Postgres behind Row Level Security policies keyed to the three roles above.
- A from-scratch, custom "Global Help System" (not a third-party library) lets any user toggle a spotlight/overlay mode and click any UI element to see a plain-language explanation of what it does.

---

## 2. Project Goals

### Main goals
- Demonstrate a realistic, end-to-end AI-augmented banking workflow (assessment → explanation → approval → audit) rather than a toy CRUD demo.
- Show a defensible role-based access control (RBAC) model enforced at both the UI and the database layer (Postgres RLS), not just hidden menu items.
- Make AI decisions **explainable**: every credit score comes with a plain-language summary and ranked contributing factors, and the assistant always cites its source policy section.

### User goals
- An employee should be able to go from "customer wants a loan" to "AI risk score + submitted for approval" in one guided form.
- A manager should be able to open a new account from a photographed ID without manual retyping.
- A risk officer should be able to review a request, understand *why* the AI scored it the way it did, and approve/reject/re-analyze it without leaving the page.
- Any user should be able to get a straight answer to "what does this button/card do?" without external training material, via the built-in Help Mode.

### System goals
- Every credit assessment is AI-scored by default, with a deterministic algorithmic fallback so the feature never fully breaks if the LLM provider is unavailable.
- Every state-changing action on sensitive tables is captured in an append-only audit log automatically (via Postgres triggers, not application code the developer could forget to call).
- The internal assistant must never answer from general world knowledge — only from the bank's own policy documents (loan policy, account-opening policy, customer service guidelines), in whichever language (EN/AR) the question was asked.

### Business/academic goals
- This is explicitly framed (in the project's own QA documentation and SQL migration comments) as a **graduation project**, with an explicit "academic demo" acceptance bar rather than a production banking bar. Migration comments state verbatim: *"For this graduation project the user_metadata pattern is used as requested."* The QA report's overall verdict is **"CONDITIONAL PASS (Academic / Demo Ready)"**, explicitly **not** cleared for an internal bank pilot or production without further work (see [§13](#13-current-known-problems--risks)).

---

## 3. Current Project Status

### Quick Facts

| | |
|---|---|
| **Frontend routes / page components** | 12 pages, 11 of which are routed (`Index.tsx` is an orphaned scaffold page — see [Known Problems](#13-current-known-problems--risks)) |
| **Supabase migrations** | 19 SQL files (`supabase/migrations/`) |
| **Supabase Edge Functions** | 3 (`credit-assessment`, `policy-search`, `admin-users`) |
| **FastAPI endpoints** | 5 business endpoints + `/health` + auto Swagger `/docs` |
| **User roles** | 3 (`branch_employee`, `branch_manager`, `risk_department`) |
| **Database tables (app-owned)** | 10 (see [§10](#10-data-and-database-overview)) |
| **Automated tests** | 9 unit tests (Node's built-in test runner), all passing |
| **E2E / integration tests** | None |
| **Production build** | Passes (`npm run build`) — ~936 KB JS (~275 KB gzip), one bundle, no code-splitting |
| **Lint status (current)** | 6 errors, 15 warnings (`npm run lint`) |
| **CI/CD pipeline** | None found (no `.github/workflows`, no other CI config) |
| **Containerization** | None (no Dockerfile anywhere in the repo) |
| **Dev servers** | Frontend (Vite) on `:8080`, OCR API (FastAPI) on `:8000`, started together via `npm run dev` |
| **Primary AI provider** | OpenRouter (`openai/gpt-4o-mini` for scoring/chat, `openai/text-embedding-3-small` for policy embeddings) |
| **Local/offline AI** | Tesseract OCR (ID text extraction) runs fully locally, no cloud dependency |

### What is already implemented
- Supabase Auth (email/password) with a `profiles` table auto-populated on signup and a route-permission matrix enforced by a `ProtectedRoute` component.
- Dashboard with **globally consistent** (role-independent) live stats via a `SECURITY DEFINER` Postgres function, plus a real recent-activity feed.
- Credit Risk page: customer lookup by account number, AI-first scoring with an algorithmic fallback, persisted explanation snapshot, risk-department approve/reject, and an "Objection / Modification" workflow with its own review pipeline and automatic re-analysis.
- Documents page: a real Supabase-backed document list (upload/view/download/delete) plus a 4-step "Open New Account" wizard that uploads an ID photo to the FastAPI OCR service, auto-fills a form, collects two signatures, and generates a two-copy PDF.
- Approvals page mirroring the credit-risk review queue with the same saved AI explanation.
- Audit Log (risk-department only), User Management (manager only, via a privileged Edge Function), and Modification Requests (manager view / risk review).
- AI Assistant: a bilingual, policy-grounded RAG chatbot with persistent per-user chat history, backed primarily by pgvector semantic search and falling back to an in-browser keyword search engine if the vector store is unreachable.
- A from-scratch **Global Help System**: a floating help button, a full-screen spotlight overlay, and a nested target-registration API that lets any page register section/item/action-level explainable targets, plus first-run onboarding tours per page.
- Full English/Arabic bilingual UI with RTL layout mirroring.

### What is partially implemented
- **Realtime sync** — Supabase Realtime channels are wired on most tables (`approval_requests`, `documents`, `profiles`, `audit_logs`), but reconnect/multi-tab behavior has never been verified under a live multi-user test (QA status: unverified).
- **Dashboard "Core Modules Overview" cards** — the three progress cards (Credit Risk / Documents / AI Assistant) show **hardcoded** numbers ("847/1000", "97.3%", "4.8/5"), not live data.
- **Server-side validation** — the FastAPI account-opening endpoints validate shape (Pydantic) but not the caller's *actual* role (see BUG-001 below); most business-rule validation lives only on the client.
- **Help Mode coverage** — granular, item/action-level help targets exist on Dashboard, Credit Risk, Approvals, Documents, and User Management; Audit Log and Modification Requests only have lighter section-level coverage (added in the most recent session — see [§12](#12-major-work-completed-so-far)).

### What is pending / not started
- Any automated E2E or integration test suite (Playwright/Cypress, pytest+httpx for FastAPI, pgTAP for RLS).
- CI/CD pipeline of any kind.
- JWT-based authorization on the FastAPI service (it currently trusts a client-supplied header — see BUG-001).
- Route-level code splitting / bundle size reduction.
- A formal, standalone `SRS.md` (the current SRS baseline was *reconstructed* by the QA process from code and README content, because no original SRS file exists in the repo).

### What is working well
- The RLS-based data-visibility model (employees see only their own rows; managers/risk see everything) is implemented consistently across every sensitive table and matches the documented permission matrix.
- The credit-scoring **fallback design** is genuinely robust: if the AI edge function fails for any reason, the app transparently falls back to a deterministic, unit-tested math model rather than blocking the user.
- Audit logging is implemented via Postgres triggers (not application code), so it cannot be silently skipped by a UI bug.
- The Global Help System's core targeting algorithm (priority → DOM specificity → smallest bounding box) is now solid and covers deep nested UI (cards inside grids inside sections, individual table rows and action buttons) without the earlier "whole section highlights instead of the child" bug.

### What is currently problematic
- **Critical security gap:** the FastAPI OCR/account-opening service authorizes requests using a client-supplied `X-User-Role` header with no cryptographic binding to the caller's real Supabase session — anyone who can reach the API can claim to be a manager (see BUG-001, [§13](#13-current-known-problems--risks)).
- Role changes made via User Management do not take effect for an already-logged-in user until they sign out and back in, because the RLS role check reads the JWT (`user_metadata.role`), which is only refreshed at login.
- Zero automated UI/E2E test coverage means every regression currently has to be caught manually.

---

## 4. Technology Stack

| Layer | Technology | Why it's used here |
|---|---|---|
| Build tool | **Vite 5** (`@vitejs/plugin-react-swc`) | Fast dev server with instant HMR and SWC-based React compilation; proxies FastAPI routes during local dev. |
| Frontend framework | **React 18** + **TypeScript 5** | Component model + static typing across the whole frontend; strict-enough config to catch most contract errors at build time. |
| Routing | **React Router v6** | Client-side routing with nested/guarded routes (`ProtectedRoute`, role-aware redirects). |
| Styling | **Tailwind CSS** + **shadcn/ui** (Radix UI primitives) | Utility-first styling plus accessible, unstyled Radix primitives (Dialog, DropdownMenu, Select, Tabs, etc.) wrapped in a consistent design system (`src/components/ui`). |
| Data/server state | **TanStack Query** (`@tanstack/react-query`) | Configured at the app root (`QueryClientProvider`); most page-level data fetching in this project actually uses hand-written hooks (`useStats`, `useDocuments`, `useRecentActivity`) directly against the Supabase client with realtime subscriptions, rather than Query's cache — Query is present as infrastructure more than heavily exercised yet. |
| Forms/validation | **react-hook-form** + **zod** + `@hookform/resolvers` | Typed, schema-validated forms (see `Auth.tsx` login schema). |
| Backend-as-a-service | **Supabase** (Postgres, Auth, Row Level Security, Realtime, Storage, Edge Functions) | Provides the database, authentication, authorization enforcement (RLS), file storage, live updates, and serverless compute in one platform — avoids building/hosting a bespoke backend for the core app. |
| Serverless functions | **Supabase Edge Functions** (Deno runtime, TypeScript) | Three functions: `credit-assessment` (AI scoring), `policy-search` (embedding + vector search), `admin-users` (privileged user CRUD using the service-role key, never exposed to the browser). |
| Secondary backend | **FastAPI** (Python) | A dedicated microservice for OCR and PDF generation — capabilities (Tesseract, OpenCV, WeasyPrint) that don't belong in a Deno edge function or the browser. |
| OCR engine | **Tesseract** (via `pytesseract`) + **OpenCV** (`opencv-python-headless`) preprocessing | Fully local, no per-call cost or cloud dependency for reading ID photos. |
| PDF generation | **WeasyPrint** + **Jinja2** HTML templates | Renders the bilingual two-copy account-opening form from `backend/templates/form_en.html` / `form_ar.html`. |
| LLM provider | **OpenRouter** (`openai/gpt-4o-mini` default) | Used by both the credit-assessment edge function (structured JSON scoring) and, per the backend README, as an optional field-extraction fallback for OCR. |
| Embeddings / vector search | **OpenRouter embeddings** (`openai/text-embedding-3-small`, 1536-dim) + **pgvector** Postgres extension | Powers the AI Assistant's primary semantic-search retrieval path (`match_policy_chunks` SQL function, cosine similarity). |
| Vector DB | **pgvector extension on Supabase Postgres** | Chosen so the vector store lives in the same database as everything else — no separate vector DB service to run. |
| Auth | **Supabase Auth** (email/password) | Session/JWT issuance; role is carried in `user_metadata.role` and read by RLS policies via `auth.jwt()`. |
| Notifications/toasts | **Sonner** | Toast notifications across all pages for success/error feedback. |
| Icons | **lucide-react** | Icon set used throughout the UI. |
| Charts | **Recharts** | Available via `src/components/ui/chart.tsx`, not currently driving any live dashboard chart (the module-overview cards are hardcoded, not chart-rendered). |
| E-signature capture | **react-signature-canvas** | Used in the account-opening wizard for customer/employee signatures. |
| State management | React Context (`AuthContext`, `LanguageContext`, `AIChatContext`, `HelpProvider`) + local component state | No Redux/Zustand — deliberately kept to a handful of purpose-built contexts. |
| Linting | **ESLint 9** (flat config) + `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` | Static code quality gate; currently not wired into any CI. |
| Testing | **Node's built-in test runner** (`node --test`) | 9 unit tests covering `roles.ts` and `creditScoring.ts` — no framework dependency needed for what's tested so far. |
| Package manager | **npm** (`package-lock.json` present) — a `bun.lockb` also exists from earlier tooling, but npm scripts are the documented/used path | |
| Deployment tooling | **Supabase CLI** (`supabase/.temp/linked-project.json` shows a linked remote project) | Used to push migrations/functions to the hosted Supabase project. |
| Containerization | **None** | No Dockerfile/docker-compose in the repo; local dev assumes a native Python venv + Node install. |

---

## 5. Languages Used

| Language / format | Where |
|---|---|
| **TypeScript** | Entire frontend (`src/`), all three Supabase Edge Functions (Deno TypeScript) |
| **Python** | FastAPI backend (`backend/`) — routers, services, scripts |
| **SQL / PL/pgSQL** | 19 Supabase migrations, RLS policies, triggers, and `SECURITY DEFINER` functions (`get_platform_stats`, `match_policy_chunks`, `review_loan_modification_request`, `trim_ai_chat_history`, `handle_new_user`) |
| **JavaScript** | Build/tooling config (`postcss.config.js`, `eslint.config.js`) and standalone scripts (`scripts/ingest-policies.mjs`) |
| **HTML** | `index.html` (SPA shell), `backend/templates/form_en.html` / `form_ar.html` (Jinja2 templates rendered to PDF) |
| **CSS** | `src/index.css`, `src/App.css`, plus Tailwind utility classes throughout `.tsx` |
| **JSON** | `package.json`, `components.json`, `tsconfig*.json`, Supabase CLI metadata |
| **Markdown** | `README.md`, all of `/QA`, `src/data/policies/*.md` (the actual bank policy knowledge base ingested by the AI Assistant), this document |
| **Shell** | `scripts/verify-deploy-health.sh` |

No YAML, no C#, and no other languages are present in the repository.

---

## 6. Project Structure

### Folder Purpose

| Path | Contains | Role |
|---|---|---|
| `src/pages/` | One file per route (`Dashboard.tsx`, `CreditRisk.tsx`, `Documents.tsx`, `Approvals.tsx`, `AIAssistant.tsx`, `AuditLog.tsx`, `UserManagement.tsx`, `ModificationRequests.tsx`, `Auth.tsx`, `Unauthorized.tsx`, `NotFound.tsx`, `Index.tsx`) | Top-level screens. Each page composes layout + hooks + UI components; most contain their own Supabase queries and realtime subscriptions rather than delegating to a shared data layer. |
| `src/components/ui/` | ~45 shadcn/ui component wrappers (Button, Card, Dialog, Table, Tabs, Select, DropdownMenu, Sidebar, etc.) | The design-system primitives every page is built from. Generated/customized shadcn components, not hand-rolled. |
| `src/components/layout/` | `DashboardLayout.tsx` | The shared app shell: sidebar navigation, top bar, language toggle, and the mount point for the global Help System (`HelpWidget`, `HelpOverlay`, `HelpExplanationPanel`). |
| `src/components/help/` | `HelpProvider.tsx`, `HelpTarget.tsx`, `HelpOverlay.tsx`, `HelpWidget.tsx`, `HelpExplanationPanel.tsx` | The custom Global Help System — see [§8](#help--assistant-bot-note-there-are-two-distinct-systems). |
| `src/components/onboarding/` | `OnboardingTour.tsx`, `PageOnboardingTour.tsx` | First-visit-per-session guided tours, independent of the Help System but coordinated with it (a tour auto-closes if help mode is turned on). |
| `src/contexts/` | `AuthContext.tsx`, `LanguageContext.tsx`, `AIChatContext.tsx` | App-wide React state: auth/session/role, language/direction, and AI Assistant chat state/history. |
| `src/hooks/` | `useStats.ts`, `useDocuments.ts`, `useRecentActivity.ts`, `useHelpTarget.ts`, `use-mobile.tsx`, `use-toast.ts` | Reusable data-fetching and utility hooks; most own their own Supabase Realtime subscription. |
| `src/lib/` | `roles.ts`, `creditScoring.ts`, `aiCreditAssessment.ts`, `rag.ts`, `assistantPolicy.ts`, `chatHistoryDb.ts`, `modificationReanalysis.ts`, `accountApi.ts`, `helpTargeting.ts`, `onboardingSession.ts`, `utils.ts` | The application's business logic layer — RBAC rules, the credit-scoring algorithm, the AI assessment orchestration, the RAG retrieval engine, the assistant's out-of-scope policy, the FastAPI client wrapper, and the Help System's hit-testing/ranking algorithm. |
| `src/lib/__tests__/` | `qa.test.ts` | The project's entire automated test suite (9 tests, Node's built-in runner). |
| `src/data/policies/` | `loan-policy.md`, `account-opening-policy.md`, `customer-service-guidelines.md` | The actual source-of-truth knowledge base for the AI Assistant — imported directly at build time for the local fallback engine, and the same files are ingested into `policy_chunks` for semantic search. |
| `src/integrations/supabase/` | `client.ts` | The single configured Supabase client instance used everywhere in the frontend. |
| `src/types/` | `index.ts` | Shared app-level types (`User`, `UserProfile`, `AuthState`); re-exports `Role` from `lib/roles.ts`. |
| `src/config/` | `onboardingTours.ts` | Declarative step definitions for each page's onboarding tour. |
| `backend/routers/` | `documents.py`, `accounts.py` | FastAPI route handlers for OCR extraction, form generation, and account submission. |
| `backend/services/` | `ocr.py`, `field_extraction.py`, `field_parser.py`, `llm_extractor.py`, `form_generator.py`, `store.py`, `auth.py` | OCR pipeline, regex + LLM-fallback field parsing, PDF rendering, in-memory document store, and the (currently weak) role-check dependency. |
| `backend/templates/` | `form_en.html`, `form_ar.html` | Jinja2 templates rendered by WeasyPrint into the account-opening PDF. |
| `backend/scripts/` | `verify_extraction.py`, `test_ocr.py`, `test_form_generation.py` | Manual verification scripts (not part of an automated suite) for OCR accuracy and PDF rendering. |
| `backend/test_images/` | Sample ID photos and generated PDFs | Fixtures used by the manual verification scripts above. |
| `supabase/functions/` | `credit-assessment/`, `policy-search/`, `admin-users/` | The three Deno Edge Functions. |
| `supabase/migrations/` | 19 timestamped `.sql` files | The full, applied history of the database schema, RLS policies, triggers, and RPC functions — see [§10](#10-data-and-database-overview). |
| `QA/` | 24 Markdown files | A complete, self-authored QA audit package: reconstructed SRS baseline, test plan/strategy/cases, per-testing-type reports (functional, API, DB, security, performance, regression, automation), bug report, risk register, RTM, role/permission matrix, coverage map, and an executive QA report. |
| `scripts/` | `ingest-policies.mjs`, `verify-deploy-health.sh` | Standalone maintenance scripts: chunk + embed the policy markdown files into `policy_chunks`, and a post-deploy health-check script. |
| `public/` | Logos, favicon, `robots.txt` | Static assets served as-is. |
| `dist/` | Vite production build output | Generated, not source. |
| (root config files) | `vite.config.ts`, `tailwind.config.ts`, `tsconfig*.json`, `components.json`, `eslint.config.js`, `postcss.config.js` | Build/tooling configuration. `vite.config.ts` also defines the dev-only proxy from `/documents/*` and `/accounts/open-new` to the FastAPI service on `:8000`. |

### Architecture Overview (visual)

```
┌───────────────────────────────────────────────────────────────────┐
│                      React SPA (Vite, :8080)                        │
│  Pages → Contexts (Auth/Language/AIChat/Help) → Hooks → lib/*.ts    │
└───────────────┬───────────────────────────────┬─────────────────────┘
                │                               │
                │ supabase-js client            │ fetch() via accountApi.ts
                ▼                               ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│           Supabase             │   │     FastAPI OCR service (:8000)│
│  • Postgres + RLS               │   │  • /documents/extract-id       │
│  • Auth (JWT, user_metadata)    │   │  • /documents/{id}/...         │
│  • Realtime (postgres_changes)  │   │  • /accounts/open-new          │
│  • Storage (documents)          │   │  Tesseract OCR · OpenCV ·      │
│  • Edge Functions (Deno):       │   │  WeasyPrint PDF · optional     │
│    - credit-assessment  ──────┐ │   │  OpenRouter LLM fallback       │
│    - policy-search       ─────┤ │   └───────────────────────────────┘
│    - admin-users               │ │
└──────────────┬─────────────────┘ │
               │                   └────► OpenRouter API (LLM + embeddings)
               ▼
        Postgres tables (RLS-scoped per role) + pgvector policy_chunks
```

---

## 7. Architecture Overview

### Frontend architecture
A single Vite/React SPA. `App.tsx` wires the provider stack (`QueryClientProvider → LanguageProvider → HelpProvider → AuthProvider → AIChatProvider → TooltipProvider → BrowserRouter`) once at the true root, then defines every route. Authenticated routes are wrapped in a local `RequireAuth` component (redirects to `/auth` if not logged in); role-restricted routes are additionally wrapped in `ProtectedRoute` (redirects to `/unauthorized` if the role doesn't match `ROUTE_PERMISSIONS`). Every authenticated page renders inside `DashboardLayout`, which owns the sidebar, top bar, and the three global Help System components — so any page using that layout automatically gets the floating help button "for free."

### Backend architecture
There isn't one monolithic backend — there are two independent backend surfaces:
1. **Supabase** is the backend for everything except OCR: Postgres is the database, RLS policies are the authorization layer (not application code), Auth issues JWTs carrying the user's role, and three Edge Functions handle the logic that must not run in the browser (calling OpenRouter with a secret key, or performing privileged user administration with the service-role key).
2. **FastAPI** is a narrow, separate service that exists only because OCR (Tesseract/OpenCV) and PDF rendering (WeasyPrint) need a real Python process — it holds no business data of its own beyond an in-memory per-document store (`services/store.py`) used only during the account-opening wizard's multi-step flow.

### Database / data flow
Every table has RLS enabled. The general pattern: `branch_employee` sees only rows where they are the creator (`employee_id = auth.uid()` / `user_id = auth.uid()`); `branch_manager` and `risk_department` see everything relevant to their role; only `risk_department` can `UPDATE` an approval's status. Role checks read `auth.jwt() -> 'user_metadata' ->> 'role'` — deliberately avoiding any RLS policy that queries `profiles` from within another table's policy (to sidestep Postgres RLS recursion issues). Dashboard/Credit-Risk/Approvals stat cards bypass this row-level scoping intentionally, via a `SECURITY DEFINER` function (`get_platform_stats()`) that returns only aggregate counts — so every role sees identical top-line numbers even though their row-level visibility differs.

### Authentication flow
1. User signs in via Supabase Auth (email/password) on `/auth`.
2. A Postgres trigger (`handle_new_user`) auto-creates a `profiles` row on signup, defaulting to `branch_employee` if no role was supplied.
3. The user's role is embedded in `user_metadata.role` at token-issue time and is what every RLS policy and the frontend's `ProtectedRoute` check against.
4. **Known limitation:** if a manager changes another user's role via User Management, that change updates `profiles.role` (and, since a recent fix, the Edge Function also updates `user_metadata`) but the *already-issued* JWT for a currently-logged-in user won't reflect it until they sign out/in again.

### API communication flow
- Frontend → Supabase: via the `supabase-js` client (`src/integrations/supabase/client.ts`) for all CRUD, Realtime subscriptions, and `supabase.functions.invoke(...)` calls to the three Edge Functions.
- Frontend → FastAPI: via `src/lib/accountApi.ts`, calling relative paths (`/documents/extract-id`, etc.) that Vite proxies to `http://127.0.0.1:8000` in development. In production this proxy does not exist by default — a real deployment needs its own reverse-proxy/routing for these paths (see [§18](#18-deployment--devops-overview)).

### File / document flow
Documents page: file selected → uploaded to Supabase Storage (or referenced via `accountApi`) → a row inserted into `public.documents` → Realtime pushes the change to any other open tab → RLS scopes delete/update to the owner (managers/risk can delete any row).

### Credit / risk evaluation flow
1. Employee (or manager/risk) fills the "New Assessment" form on Credit Risk, looking up a customer by account number (`bank_customers`, seeded with 10 demo customers, two of which are flagged `loan_restricted`).
2. `buildDerivedFeatures()` computes debt-service ratio, loan-to-income ratio, estimated new payment, and disposable income client-side (deterministic, no network call).
3. `assessCreditRisk()` sends the structured payload to the `credit-assessment` Edge Function, which calls OpenRouter with a strict system prompt demanding a JSON-only response (score, category, confidence, summary, top factors, recommended action).
4. **If the AI call fails for any reason** (missing key, rate limit, truncated response, network error) **and** `VITE_CREDIT_AI_FALLBACK` is not explicitly `"false"`, the frontend transparently falls back to `computeCreditScore()` — a local, additive, unit-tested scoring model with the same output shape (score/category/explanation/top factors), just tagged `result_source: "algorithm"` instead of `"ai"`.
5. The result (whichever source produced it) is saved onto the `approval_requests` row (`risk_score`, `risk_category`, `risk_explanation_summary`, `risk_top_factors`, `recommended_action`, `result_source`, `assessed_at`).
6. Risk department reviews and approves/rejects. If a later-approved *modification request* changes a scoring input, `modificationReanalysis.ts` reruns the same pipeline and logs the before/after in `risk_reanalysis_history`.

### Global help / assistant flow
See [§8](#help--assistant-bot-note-there-are-two-distinct-systems) below — this is intentionally documented separately because the phrase "help bot" is ambiguous in this codebase (there are two unrelated systems that share the word "assistant/bot").

### Dashboard data flow
`useStats.ts` calls `supabase.rpc('get_platform_stats')` first (global, RLS-bypassing aggregates); if that RPC is unavailable it falls back to direct, RLS-scoped `count()` queries per table (which would then differ per role — a documented, accepted limitation of the fallback path only). A Realtime subscription on `approval_requests`/`credit_applications` triggers a refetch on any change so the numbers stay live without polling.

---

## 8. Main Features and Modules

### Help / assistant "bot" — note: there are TWO distinct systems

This is a common point of confusion (including in this project's own request history), so it's called out explicitly:

1. **AI Assistant page** (`/ai-assistant`, `AIAssistant.tsx`) — a real chat interface where the user types a banking question and gets an answer **grounded only in the bank's own policy documents** (`src/data/policies/*.md`), with citations, bilingual detection, persistent per-user chat history (`ai_chat_conversations` / `ai_chat_messages`), and an explicit refusal message for out-of-scope questions (crypto, sports, weather, etc. are hard-coded as out-of-scope signals). This is the "chatbot."
2. **Global Help System / "Help Mode"** (`src/components/help/*`, mounted from `DashboardLayout` on every page) — a UI-explainer overlay, not a chatbot. A floating button toggles "help mode"; while active, hovering highlights the most specific registered UI element under the cursor (a single stat card, not its whole grid; a single button, not its whole card) and clicking opens a side panel with that element's title/description/hint. This is the "help bot" that was recently debugged and fixed (see [§12](#12-major-work-completed-so-far)) — it had no relation to the AI/LLM stack at all; its bugs were pure React/CSS issues (an unrelated onboarding-tour overlay outranking it in z-index, and a render-loop caused by unstable inline props).

| Module | What it does | Key files | Status | Backend/DB dependencies |
|---|---|---|---|---|
| **Dashboard** | Role-independent live stats, recent activity feed, quick actions, module overview | `pages/Dashboard.tsx`, `hooks/useStats.ts`, `hooks/useRecentActivity.ts` | Mostly live; module-overview cards are hardcoded (BUG-003) | `get_platform_stats()` RPC, `approval_requests` |
| **Credit Risk** | New assessment, AI scoring + fallback, stats, applications table, approve/reject, objection/modification dialog | `pages/CreditRisk.tsx`, `lib/creditScoring.ts`, `lib/aiCreditAssessment.ts` | Functionally complete; AI-path UX disclosure and server-side validation are gaps | `credit-assessment` Edge Function, `approval_requests`, `bank_customers`, `loan_modification_requests` |
| **Documents** | Document list (upload/view/download/delete), 4-step "Open New Account" OCR wizard | `pages/Documents.tsx`, `lib/accountApi.ts`, FastAPI `routers/documents.py` + `routers/accounts.py` | Functionally complete; FastAPI role check is insecure (BUG-001) | `documents` table + Storage, FastAPI service |
| **Approvals** | Review queue mirroring Credit Risk's applications with saved AI explanation, approve/reject | `pages/Approvals.tsx` | Complete | `approval_requests` |
| **AI Assistant** | Policy-grounded bilingual RAG chatbot with history | `pages/AIAssistant.tsx`, `lib/rag.ts`, `lib/assistantPolicy.ts`, `contexts/AIChatContext.tsx` | Complete but never live-tested end to end (QA: blocked) | `policy-search` Edge Function, `policy_chunks`, `ai_chat_conversations/messages` |
| **User Management** ("Manager Account" page) | Manager-only CRUD on user accounts/roles/status | `pages/UserManagement.tsx`, `admin-users` Edge Function | Complete; role-desync-on-change is a known bug (BUG-002) | `admin-users` Edge Function, `profiles`, Supabase Auth Admin API |
| **Audit Log** | Risk-department-only, append-only activity log, CSV export | `pages/AuditLog.tsx` | Complete | `audit_logs` (populated automatically by DB triggers) |
| **Modification Requests** | Manager view / risk-department review of objection requests raised from Credit Risk | `pages/ModificationRequests.tsx`, `components/ModificationRequestsPanel.tsx` | Complete | `loan_modification_requests`, `review_loan_modification_request()` RPC |
| **Global Help System** | Cross-page UI-element explainer overlay | `components/help/*`, `hooks/useHelpTarget.ts`, `lib/helpTargeting.ts` | Complete and recently hardened (see §12) | None — pure frontend |
| **Onboarding Tours** | First-visit-per-session guided walkthroughs per page | `components/onboarding/*`, `config/onboardingTours.ts` | Complete | None — pure frontend |
| **Auth** | Login/logout, session handling | `pages/Auth.tsx`, `contexts/AuthContext.tsx` | Complete | Supabase Auth |
| **Unauthorized / NotFound** | Guard fallback pages | `pages/Unauthorized.tsx`, `pages/NotFound.tsx` | Complete | None |
| **Index.tsx** | Default Lovable scaffold placeholder | `pages/Index.tsx` | **Orphaned — not routed anywhere in `App.tsx`** | None |

---

## 9. User Roles and Access

### Route access matrix

| Route | `branch_employee` | `branch_manager` | `risk_department` | Guard mechanism |
|---|:---:|:---:|:---:|---|
| `/dashboard` | ✅ | ✅ | ✅ | `RequireAuth` |
| `/credit-risk` | ✅ | ✅ | ✅ | `RequireAuth` |
| `/documents` | ✅ | ✅ | ✅ | `RequireAuth` |
| `/ai-assistant` | ✅ | ✅ | ✅ | `RequireAuth` |
| `/approvals` | ✅ | ✅ | ✅ | `RequireAuth` (row visibility narrowed by RLS/UI, not route-blocked) |
| `/modification-requests` | ❌ | ✅ | ✅ | `ProtectedRoute` |
| `/user-management` | ❌ | ✅ | ❌ | `ProtectedRoute` |
| `/audit-log` | ❌ | ❌ | ✅ | `ProtectedRoute` |
| `/auth`, `/unauthorized`, `*` | public | public | public | none |

### Action permissions

| Action | Employee | Manager | Risk |
|---|:---:|:---:|:---:|
| Submit new credit assessment | ✅ | ✅ | ✅ |
| Approve / reject credit application | ❌ | ❌ | ✅ |
| Submit objection / modification request | ✅ | ✅ | ✅ |
| Review (approve/reject) a modification request | ❌ | view only | ✅ |
| Open a new account (OCR wizard) | ✅ | ✅ | ❌ |
| View audit log | ❌ | ❌ | ✅ |
| Create / update / delete user accounts | ❌ | ✅ | ❌ |

### Data visibility (Row Level Security)

| Table | Employee sees | Manager sees | Risk sees |
|---|---|---|---|
| `approval_requests` | own rows only | all rows | all rows |
| `documents` | all (branch-wide) | all | all |
| `audit_logs` | none | none | all (append-only) |
| `profiles` | own row only | all rows | own row only |
| `loan_modification_requests` | own requests | all requests | all requests |

### Known gaps in permissions/access handling
- **Role-change propagation:** an admin changing a user's role does not immediately affect that user's already-issued session (JWT). Documented workaround: affected users must sign out/in.
- **FastAPI role enforcement is not real authorization** — it trusts a client-supplied header rather than validating anything cryptographically tied to the Supabase session (see BUG-001 below). This is the single most important access-control gap in the whole system.
- The `/approvals` route itself is intentionally open to all three roles (row-level RLS is what actually restricts what an employee can *do* there); this was flagged during QA review and closed as "by design," not a bug.

---

## 10. Data and Database Overview

### Core tables

| Table | Purpose | Notable columns / constraints |
|---|---|---|
| `profiles` | One row per auth user; source of truth for role/department/status | `role` CHECK constraint limited to the 3 roles; auto-created by `handle_new_user` trigger on signup |
| `approval_requests` | The central loan/credit application table (created outside the tracked migration history — see note below) | Extended over time with account/financial snapshot columns, AI risk-explanation columns (`risk_score`, `risk_category`, `risk_top_factors` JSONB, `risk_derived_features` JSONB, `recommended_action`, `result_source`), and re-analysis tracking columns |
| `bank_customers` | Demo master customer data for account-number lookup | Seeded with 10 fixed demo accounts (`BOP-100001`…`BOP-100010`); 2 flagged `loan_restricted = true` for negative-path testing |
| `loan_modification_requests` | Single-field objection/change requests against a finalized application | `status` CHECK (`pending`/`approved`/`rejected`); reviewed via a `SECURITY DEFINER` RPC, not a raw `UPDATE` |
| `risk_reanalysis_history` | Append-only audit trail of AI re-scoring after an approved modification | old/new score + category, actor, error message if the re-run failed |
| `audit_logs` | Append-only activity log across the whole app | No `UPDATE`/`DELETE` RLS policy exists at all — deletion/editing is denied for every role, including the risk department that can read it |
| `documents` | Uploaded document metadata (Documents page) | `REPLICA IDENTITY FULL` + added to `supabase_realtime` publication so Realtime DELETE payloads carry the row id (fixes multi-tab sync) |
| `policy_chunks` | The AI Assistant's vector knowledge base | `vector(1536)` embedding column (pgvector), bilingual title/content columns, `match_policy_chunks()` cosine-similarity RPC |
| `ai_chat_conversations` / `ai_chat_messages` | Per-user persistent chat history for the AI Assistant | Owner-only RLS on both; a `trim_ai_chat_history()` RPC caps history to the latest 10 conversations per user |

### Important relationships / assumptions
- `loan_modification_requests.application_id` is **not** a foreign key — the reviewing RPC resolves it dynamically against `approval_requests` (and, defensively, a since-unused `credit_applications` table) because the schema evolved iteratively.
- `approval_requests` itself has **no `CREATE TABLE` statement anywhere in `supabase/migrations/`** — every migration that touches it does so via conditional `ALTER TABLE ... IF NOT EXISTS`, guarded by `to_regclass('public.approval_requests') IS NOT NULL`. This confirms the base table was created outside this repo's tracked migration history (most likely directly in the Supabase dashboard, or as part of the original Lovable scaffold) — **a real gap** if anyone needs to stand up a brand-new environment from migrations alone.
- Role checks throughout RLS deliberately avoid subqueries into `profiles` from another table's policy, to prevent Postgres RLS recursion; they read the role from the JWT instead.
- Every table with meaningful write access has RLS **enabled**, and several (`audit_logs`, `risk_reanalysis_history`) are deliberately **append-only** by omitting `UPDATE`/`DELETE` policies entirely rather than trying to write a restrictive one.

---

## 11. Integrations and External Services

| Integration | Used for | Health |
|---|---|---|
| **Supabase** (Postgres, Auth, RLS, Realtime, Storage, Edge Functions) | The entire application backend except OCR | Healthy in design; live multi-user/realtime behavior was never verified in QA (static review only) |
| **OpenRouter** (`credit-assessment` function) | AI credit scoring (`openai/gpt-4o-mini`) | Partial — works when credits/keys are configured; the local `.env` currently has `VITE_CREDIT_AI_FALLBACK=false` specifically so AI failures surface instead of silently falling back, indicating this has been an active pain point during development |
| **OpenRouter** (`policy-search` function) | Query embeddings (`openai/text-embedding-3-small`) for the AI Assistant's semantic search | Healthy when configured; has a working local-keyword fallback if unavailable |
| **OpenRouter** (FastAPI `llm_extractor.py`) | Optional LLM fallback for ID field extraction when regex parsing fills fewer than 4 of 6 fields | Optional by design — logs a startup warning if `OPENROUTER_API_KEY` is missing, degrades to regex-only extraction |
| **Tesseract OCR** | Reading text off uploaded ID photos | Required, no fallback — the backend README states explicitly "there is no mock/placeholder OCR path" |
| **WeasyPrint** | Rendering the account-opening PDF | Required for the "Generate Form" step of the account wizard; needs system libraries (Pango/Cairo) beyond `pip install` |
| **Supabase Edge Functions runtime (Deno)** | Hosts the three edge functions | Healthy; each function is a single, self-contained `index.ts` with no shared framework |

---

## 12. Major Work Completed So Far

1. **Core scaffold & RBAC foundation** — Vite/React/TypeScript/Tailwind/shadcn base, Supabase project linked, `profiles` + role system + route-permission matrix + `ProtectedRoute`/`RequireAuth` guards.
2. **Authentication** — Supabase Auth wired end-to-end, auto-profile-creation trigger, bilingual login form with zod validation.
3. **Dashboard** — global (role-independent) live stats via a `SECURITY DEFINER` RPC with a client-side fallback query path, real recent-activity feed, quick actions.
4. **Credit Risk & AI scoring** — full assessment form with account lookup, `credit-assessment` Edge Function calling OpenRouter, a fully independent and unit-tested algorithmic fallback engine, persisted explanation snapshots, and an approve/reject workflow.
5. **Documents & OCR account opening** — Supabase-backed document CRUD, a separate FastAPI microservice for OCR (Tesseract/OpenCV) and PDF generation (WeasyPrint/Jinja2), a 4-step wizard UI with signature capture.
6. **Approvals & modification workflow** — review queue, objection/modification request pipeline with a `SECURITY DEFINER` review RPC, automatic AI re-analysis on approved modifications with a comparison history table.
7. **AI Assistant (RAG chatbot)** — bilingual, policy-grounded retrieval with a two-tier engine (pgvector semantic search primary, in-browser keyword search fallback), explicit out-of-scope refusal policy, persistent chat history.
8. **Manager & compliance tooling** — User Management (privileged Edge Function CRUD), append-only Audit Log populated automatically by DB triggers, Modification Requests review page.
9. **Bilingual UI** — full English/Arabic support with RTL mirroring across every page.
10. **Global Help System — built, then substantially debugged and hardened in the most recent development session.** Originally the system only supported whole-section targets (hovering any child inside a card group highlighted the entire group). This was refactored to support nested, priority-ranked targets (section < item < action) so individual stat cards, table rows, and buttons are independently selectable, with a `pickBestHelpTarget()` ranking utility (priority → DOM containment → smallest bounding box) and Radix `Slot`-based `asChild` support to avoid wrapper-div layout pollution. Two real, verified bugs were then found and fixed on top of that refactor:
    - An unrelated **onboarding-tour overlay** (`OnboardingTour.tsx`) rendered at a higher z-index than the help widget, physically blocking clicks to it on any page with a first-run tour (Dashboard, Credit Risk, Documents, AI Assistant) — fixed by raising the Help System's z-index above the tour's and making the tour auto-dismiss whenever help mode turns on.
    - A genuine **React infinite-render-loop** on the Credit Risk page specifically: it's the only page that calls the `useHelpTarget` hook directly in its own component body (making the page itself a context consumer), and with the new granular per-target coverage it accumulated enough nested targets with inline (non-memoized) `actions` array props that registering them cascaded into an unbounded re-render loop, reproduced live as a "Maximum update depth exceeded" React crash. Fixed at the root cause by keying the registration effect off a content hash instead of raw prop references, plus memoizing the Help context value.
    - The **User Management ("Manager Account") page** was found to have **zero** registered help targets at all (the widget/overlay worked, but nothing was ever selectable) — fixed by adding full granular coverage matching the other pages; lighter coverage was also added to Audit Log and Modification Requests, which previously had none.
11. **QA process** — a complete, self-authored QA package covering a reconstructed SRS baseline, 96 documented test cases, 9 automated unit tests, and dedicated reports for functional/API/database/integration/non-functional/automation/regression/performance/security testing, plus a bug report, risk register, requirements traceability matrix, role/permission matrix, coverage map, and an executive summary.

---

## 13. Current Known Problems / Risks

### Known Risks table

| ID | Severity | Area | Problem | Status |
|---|---|---|---|---|
| BUG-001 | **Critical** | Security | FastAPI OCR/account-opening endpoints trust a client-supplied `X-User-Role` header with no real verification against the caller's Supabase session — anyone reaching the API can claim any allowed role | **Open** |
| BUG-002 | High | Auth/RBAC | JWT `user_metadata.role` can desync from `profiles.role` after an admin changes a user's role; requires re-login to take effect | **Open** |
| BUG-003 | Medium | Dashboard | "Core Modules Overview" progress cards show hardcoded, fake numbers | **Open** |
| BUG-005 | Medium | QA process | No E2E/integration test framework exists at all | **Open** |
| BUG-008 | Medium | Credit Risk / AI | AI assessment failure UX is unclear to the end user when the fallback flag is disabled; which engine produced a result (`ai` vs `algorithm`) is stored but not prominently surfaced in the UI | Partially mitigated (`VITE_CREDIT_AI_FALLBACK` flag + `max_tokens` cap exist) |
| BUG-004 / BUG-011 | Low | Dashboard / Credit Risk | Debug `console.log`s left in `useStats.ts` and `creditScoring.ts` (visible in production builds) | Open |
| BUG-006 | Low | Code quality | Lint gate currently fails: **6 errors** (`no-explicit-any` ×3 in `CreditRisk.tsx`, `no-empty-object-type` ×2, `no-require-imports` ×1 in `tailwind.config.ts`) — note this is a higher count than the QA report's original snapshot of 3, reflecting code added since that audit | Open |
| BUG-007 | Low | Frontend | `src/pages/Index.tsx` is a leftover scaffold page not referenced by any route | Open |
| BUG-009 | Low | Security | CORS is wildcarded (`Access-Control-Allow-Origin: *`) on both FastAPI and all three Edge Functions | Accepted for demo, not for production |
| BUG-010 | Low | Performance | Single production JS bundle is ~936 KB (~275 KB gzip) — no route-level code splitting | Open |
| BUG-012 | Low | RBAC | `/approvals` route has no `ProtectedRoute` role gate (relies on RLS + UI only) | By design, not a defect |
| — | Medium | Data model | `approval_requests` base table has no `CREATE TABLE` in the tracked migrations — schema cannot be fully reconstructed from `supabase/migrations/` alone | Undocumented gap (identified during this audit) |
| — | Low | Realtime | Multi-tab/reconnect behavior of Supabase Realtime channels has never been verified live | Untested |

### Regarding the specific issues named in earlier project instructions
- **"AI path not working, falls back to algorithm"** — this is a real, designed behavior (not a bug in itself): the credit-assessment pipeline calls OpenRouter first and falls back to a local deterministic algorithm on any failure. What *is* a legitimate gap is that the fallback isn't clearly disclosed in the assessment result UI, and the current local `.env` has the fallback flag turned **off** specifically so AI errors surface loudly during debugging — both are signs this dependency has been actively fragile during development (rate limits/credits on OpenRouter).
- **"Help bot not working on some pages"** — this was real and has now been fixed in the current codebase (see item 10 in [§12](#12-major-work-completed-so-far)); the QA documentation package predates this fix and does not mention it, since it was found and resolved in the most recent development session, not during the original QA audit.

---

## 14. Roadmap

### Roadmap Status table

| Phase | Objective | Status |
|---|---|---|
| Phase 1 — Foundation / Core Setup | Scaffold, Supabase project, RBAC schema, auth, routing, design system | ✅ Completed |
| Phase 2 — Core Features | Dashboard, Credit Risk, Documents/OCR wizard, Approvals, Audit Log, User Management, Modification Requests | ✅ Completed |
| Phase 3 — Data & Business Logic | Credit scoring algorithm + AI integration + fallback, RLS across all tables, platform stats RPC, re-analysis workflow, demo seed data | ✅ Completed |
| Phase 4 — UX / Explainability / Helper Systems | Bilingual EN/AR + RTL, onboarding tours, Global Help System (built + fully debugged), policy-grounded AI Assistant | ✅ Completed (Help System hardening finished most recently) |
| Phase 5 — Testing & QA | SRS reconstruction, test plan/strategy/cases, 9 automated unit tests, full QA documentation package, defect/risk logging | 🟡 In progress — static analysis + unit tests done; E2E/integration testing not started |
| Phase 6 — Optimization / Security / Deployment | Fix BUG-001/BUG-002, CORS hardening, bundle optimization, CI/CD, containerization, rate limiting | 🔴 Pending — not started |
| Phase 7 — Final Release / Handover / Graduation Delivery | Formal SRS.md, resolved critical defects, demo rehearsal, pilot/production readiness sign-off | 🔴 Pending |

### Phase 1: Foundation / Core Setup — ✅ Completed
- **Objectives:** stand up the app skeleton, database, and access control model.
- **Done:** Vite + React + TypeScript + Tailwind + shadcn scaffold (originally Lovable-generated); Supabase project created and linked via CLI; `profiles` table + 3-role RBAC + route-permission matrix; `ProtectedRoute`/`RequireAuth` guards; `DashboardLayout` app shell.
- **Deliverables:** working authenticated shell with role-gated navigation.
- **Dependencies:** Supabase project provisioning.

### Phase 2: Core Features — ✅ Completed
- **Objectives:** build every page/module a bank employee actually needs.
- **Done:** Dashboard, Credit Risk, Documents (+ FastAPI OCR microservice), Approvals, Audit Log, User Management, Modification Requests, Unauthorized/NotFound.
- **Deliverables:** 11 routed pages covering the full described feature set.
- **Dependencies:** Phase 1's auth/RBAC foundation.

### Phase 3: Data & Business Logic — ✅ Completed
- **Objectives:** make the numbers real and explainable.
- **Done:** deterministic + AI-based credit scoring with automatic fallback; RLS on every sensitive table; `get_platform_stats()` for consistent cross-role dashboards; `review_loan_modification_request()` + automatic re-analysis pipeline; realistic seeded demo data.
- **Deliverables:** 19 SQL migrations, 3 Edge Functions, a fully unit-tested scoring engine.
- **Dependencies:** OpenRouter API key/credits for the AI path.

### Phase 4: UX / Explainability / Helper Systems — ✅ Completed
- **Objectives:** make the platform self-explanatory and comfortable in both languages.
- **Done:** full EN/AR + RTL support; per-page first-run onboarding tours; a custom Global Help System with granular, nested, priority-ranked target selection across Dashboard/Credit Risk/Approvals/Documents/User Management (lighter coverage on Audit Log/Modification Requests); a bilingual, citation-backed, policy-grounded AI Assistant with a resilient two-tier retrieval engine.
- **Deliverables:** Help System (`components/help/*`, `lib/helpTargeting.ts`), onboarding tours, RAG assistant.
- **Dependencies:** Phase 2 pages to attach help targets to; OpenRouter for embeddings/semantic search (with a working offline fallback).
- **Note:** this phase's helper-system work was revisited and fixed most recently — two real bugs (an overlay z-index conflict and a render-loop) were found and resolved after the initial build.

### Phase 5: Testing & QA — 🟡 In progress
- **Objectives:** establish a defensible quality baseline for the graduation submission.
- **Done:** reconstructed SRS baseline (34 requirements: 28 functional + 6 non-functional); 96 documented test cases; 9 passing automated unit tests (roles + credit scoring); dedicated reports for functional, API, database, frontend-backend integration, non-functional, automation, regression, performance, and security testing; a 12-item bug report; a 10-item risk register; a full requirements traceability matrix; a role/permission matrix; a coverage map; an executive QA report concluding **"CONDITIONAL PASS (Academic / Demo Ready)."**
- **Remaining:** live/dynamic testing was blocked in the original audit (no deployed credentials, no OpenRouter credits, no running FastAPI server at audit time) — 68 of 96 test cases are still marked Blocked; zero E2E/integration automation exists.
- **Deliverables so far:** the entire `/QA` folder (24 documents).
- **Dependencies:** a live, credentialed Supabase + OpenRouter environment to unblock the remaining manual/dynamic test cases.

### Phase 6: Optimization / Security / Deployment — 🔴 Pending
- **Objectives:** close the gap between "demo-ready" and "pilot-ready."
- **To do:** replace the FastAPI header-trust auth with real Supabase JWT validation (BUG-001, highest priority); sync `user_metadata.role` reliably on role change and/or force re-login (BUG-002); restrict CORS to the actual app origin; add rate limiting to the AI-calling Edge Functions; introduce route-level code splitting to shrink the ~936 KB bundle; wire up a CI pipeline (lint + unit tests + build) on every PR; consider containerizing the FastAPI service for consistent deployment.
- **Deliverables (planned):** hardened FastAPI auth dependency, CI workflow file, reduced bundle size, documented deployment process.
- **Dependencies:** none blocking — this phase is ready to start any time; it is purely a matter of prioritization.

### Phase 7: Final Release / Handover / Graduation Delivery — 🔴 Pending
- **Objectives:** produce the artifacts needed for graduation submission/defense and, beyond that, a real internal pilot.
- **To do:** author a standalone, formal `SRS.md` (the QA team explicitly flagged this as missing and recommended it); resolve or clearly disclose all open Critical/High defects before any external security review; rehearse the demo with the three seeded accounts (`employee@bop.ps`, `manager@bop.ps`, `risk@bop.ps`); produce a short architecture diagram for handover documentation (this document supersedes that need in text form).
- **Deliverables (planned):** `SRS.md`, defect-free (or explicitly-disclosed) demo build, handover package.
- **Dependencies:** completion of Phase 6 for anything beyond the graduation demo itself.

---

## 15. Remaining Work

Before this can be called "pilot-ready" (per the QA team's own release-readiness table):
1. Fix BUG-001 — real JWT-based authorization on the FastAPI service. **Highest priority.**
2. Fix BUG-002 — reliable role-metadata sync (or forced re-authentication) on role change.
3. Add at least a smoke-level E2E test suite (login + one assessment happy path) and a pytest suite for the FastAPI endpoints, including negative/unauthorized cases.
4. Wire up a CI pipeline (lint, unit tests, build) on every push/PR.
5. Wire the Dashboard's "Core Modules Overview" cards to real data or remove them.
6. Resolve the 6 current lint errors.
7. Route or delete `src/pages/Index.tsx`.
8. Restrict CORS on the FastAPI service and all three Edge Functions to the actual deployed origin(s).
9. Add explicit max-file-size validation on document upload (client and server).
10. Reconstruct/backfill a proper `CREATE TABLE` migration for `approval_requests` so a fresh environment can be built from `supabase/migrations/` alone.
11. Author a standalone `SRS.md`.
12. Add the `.env.example` template that `README.md` already instructs new contributors to copy — it does not currently exist in the repo.

## 16. Future Improvements

Beyond the current scope, ideas surfaced during this review and in the project's own QA "Improvements" backlog:
- Route-level code splitting (`manualChunks`) for Credit Risk, Documents, and AI Assistant to cut initial load size.
- Pagination on large tables (credit applications, documents, audit log) — currently everything loads in one query.
- A visible "AI vs. algorithm" badge on every credit assessment result, not just a stored-but-hidden `result_source` field.
- Confirmation dialog before deleting a document.
- A progress indicator across the 4 steps of the account-opening wizard.
- Rate limiting on the `credit-assessment` and `policy-search` Edge Functions to control OpenRouter spend.
- Lighthouse CI budget enforcement (e.g., gzip JS under ~400 KB).
- pgTAP or a local Supabase stack for automated RLS integration testing.
- Load testing under realistic concurrent branch-user counts.
- A formal accessibility (WCAG) pass — not yet audited.
- An external penetration test — explicitly out of scope for the graduation phase.

---

## 17. QA and Testing Status

The project ships with a genuinely comprehensive, **self-authored QA package** in `/QA` (24 Markdown files), produced via static code/migration review plus 9 automated unit tests — there was no live, credentialed environment available at audit time, so all dynamic/manual testing is marked Blocked rather than executed.

| Metric | Value |
|---|---:|
| Requirements documented (functional + non-functional) | 34 |
| Test cases documented | 96 |
| Automated tests executed | 9 |
| Automated tests passing | 9 / 9 |
| Manually/dynamically executed cases | ~28 (22 pass, 2 fail, 4 partial) |
| Blocked cases (no live environment) | 68 |
| Confirmed, reproducible bugs | 12 (1 Critical, 1 High, 3 Medium, 6 Low, 1 by-design) |
| Documented risks | 10 |
| Production build | Passes |
| Lint gate | Fails (6 errors as of this document; 3 at QA-audit time) |

**Overall QA verdict (verbatim from `QA/QA_Report.md`):** *"CONDITIONAL PASS (Academic / Demo Ready)."*

**Release confidence by audience:**

| Audience | Readiness |
|---|---|
| Graduation demo / viva | ✅ Ready, with known-issue disclosure |
| Internal bank pilot | ⚠️ Not ready — requires BUG-001/BUG-002 fixed + an E2E suite |
| Production | ❌ Not ready — requires security hardening, monitoring, and full test automation |

**Testing maturity by type:**

| Type | Status |
|---|---|
| Unit | Executed, 100% pass rate on what's covered (~5% of total business logic) |
| Functional (static) | Reviewed against all 34 requirements |
| API | FastAPI **fails** on authorization (BUG-001); Supabase RLS/Edge Functions pass statically |
| Database | RLS design passes static review; live integrity checks blocked |
| Security | Fails on Broken Access Control (BUG-001); passes (by static review) on injection/XSS classes |
| Performance | Partial — build metrics only, no live load testing |
| Integration / E2E | 0% — no framework exists |
| Regression | Automated regression (unit + build) passes; full manual UI regression not executed |

---

## 18. Deployment / DevOps Overview

### Running locally
```bash
npm install
# create .env with the variables listed below — the README references a
# .env.example template, but no such file currently exists in the repo (a
# real gap: a new contributor has to reverse-engineer the required keys
# from README.md, backend/README.md, and this document)
npm run dev             # starts BOTH the Vite frontend (:8080) and the FastAPI OCR API (:8000)
```
Individual pieces can also be run separately: `npm run dev:web` (frontend only) and `npm run dev:api` (FastAPI only, requires a Python venv with `backend/requirements.txt` installed, plus Tesseract and WeasyPrint's native libraries present on the host — there is no mock OCR path).

### Building
`npm run build` produces a static production bundle in `dist/` via `vite build`. `npm run preview` serves that build locally. There is currently **no build/packaging step for the FastAPI service** beyond its own `uvicorn` invocation — it is not containerized.

### Environment variables

| Variable | Where used | Required |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Frontend Supabase client | Yes |
| `OPENROUTER_API_KEY` | FastAPI (optional LLM fallback) + both AI-calling Edge Functions (`credit-assessment`, `policy-search`) | Recommended (feature degrades gracefully without it) |
| `EMBEDDING_MODEL` | Local `.env` / `policy-search` function default override | Optional |
| `VITE_CREDIT_AI_FALLBACK` | Frontend — toggles whether AI failures fall back to the local algorithm (`false` in the current local `.env`, meaning failures currently surface as errors instead of silently falling back) | Optional, defaults to enabled |
| `SUPABASE_SERVICE_ROLE_KEY` | Local scripts (e.g. `scripts/ingest-policies.mjs`) and the `admin-users` Edge Function (injected automatically by Supabase in the function's own runtime) | Yes, for privileged operations |
| `CREDIT_MODEL`, `CREDIT_MAX_TOKENS` | `credit-assessment` Edge Function secrets (Supabase, not local `.env`) | Optional, has defaults |
| `ID_EXTRACT_MODEL`, `OPENROUTER_HTTP_REFERER` | FastAPI OCR field-extraction fallback | Optional |

Secrets used by Edge Functions are set via `supabase secrets set ...`, not the repo's `.env` — the backend README is explicit that `.env` should never be relied on in deployed builds.

### Docker / containerization
None present. No Dockerfile, docker-compose file, or container registry configuration exists anywhere in the repository for either the frontend or the FastAPI service.

### Production readiness concerns
- No CI/CD pipeline of any kind — lint/test/build are only ever run manually.
- The Vite dev-server proxy that routes `/documents/*` and `/accounts/open-new` to the FastAPI service on `:8000` is **development-only**; a real deployment needs an equivalent reverse-proxy rule (or the frontend needs to call an absolute, publicly reachable FastAPI URL) — this is not yet solved.
- FastAPI's authorization model (BUG-001) must be fixed before the OCR/account-opening endpoints are exposed on any network the bank doesn't fully trust.
- CORS is wildcarded everywhere; acceptable for a local/graduation demo, not for a real deployment.
- No monitoring, alerting, or structured logging pipeline beyond `console.log`/Python `logging` output.

---

## 19. Final Summary

**What this project currently is:** a feature-complete, thoughtfully-architected academic demo of an AI-augmented bank branch platform, covering the full workflow from credit assessment through AI/algorithmic scoring, document-based account opening via a real OCR pipeline, a role-gated approvals process, an append-only compliance audit trail, and a genuinely policy-grounded bilingual assistant — plus a custom-built, now-hardened, cross-page UI help system. The engineering choices throughout (RLS-first authorization, `SECURITY DEFINER` functions for cross-role aggregates, a deterministic fallback for every AI call, trigger-based audit logging) reflect a level of care well beyond a typical CRUD tutorial project.

**How mature it is:** solidly **"demo-ready, not pilot-ready."** The project's own QA process reaches the same conclusion independently: a "CONDITIONAL PASS (Academic / Demo Ready)" verdict, with one Critical and one High-severity defect (both centered on authorization correctness) and zero automated E2E coverage standing between this build and an internal pilot.

**What remains:** primarily security hardening (real FastAPI authorization, role-metadata sync), automated testing beyond unit tests, a handful of UI polish items (hardcoded dashboard cards, orphaned scaffold page, lint cleanup), and formal documentation (a real `SRS.md` to replace the QA team's reconstructed baseline).

**Highest-priority next actions, in order:**
1. Fix BUG-001 (FastAPI's spoofable role header) — this is the one issue that would actually matter if this system were ever exposed beyond a trusted local network.
2. Fix BUG-002 (role-metadata desync) so role changes made in User Management are reliable.
3. Stand up even a minimal E2E smoke suite and a FastAPI pytest suite, and wire both into a CI pipeline, so future changes (like the Help System rework already completed) don't have to be verified entirely by hand.
4. Replace the Dashboard's hardcoded module-overview numbers with real data, and write the standalone `SRS.md` the QA process has been asking for.
