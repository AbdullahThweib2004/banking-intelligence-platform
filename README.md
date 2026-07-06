# banking-intelligence-platform

A React + TypeScript banking intelligence dashboard (credit risk, approvals, documents, audit log) built with Vite, Tailwind/shadcn-ui, and Supabase as the backend.

## Tech stack

- Vite + React 18 + TypeScript
- Tailwind CSS + shadcn-ui (Radix)
- Supabase (auth + Postgres)
- TanStack Query, React Router

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Supabase values
npm run dev              # starts frontend (8080) + OCR API (8000)
```

## Scripts

- `npm run dev` — start **frontend + OCR API** together (recommended)
- `npm run dev:web` — Vite frontend only (port 8080)
- `npm run dev:api` — FastAPI backend only (port 8000)
- `npm run build` — production build
- `npm run preview` — preview the production build
- `npm run lint` — run ESLint

## Environment variables

Configured in `.env` (never commit this file — it is gitignored):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

See `.env.example` for the template.
- `npm run preview` — preview the production build
- `npm run lint` — run ESLint
