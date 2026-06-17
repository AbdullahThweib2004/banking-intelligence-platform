# banking-intelligence-platform

A React + TypeScript banking intelligence dashboard (credit risk, approvals, documents, audit log) built with Vite, Tailwind/shadcn-ui, and Supabase as the backend.
wowwwww
## Tech stack

- Vite + React 18 + TypeScript
- Tailwind CSS + shadcn-ui (Radix)
- Supabase (auth + Postgres)
- TanStack Query, React Router

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Supabase values
npm run dev
```

## Environment variables

Configured in `.env` (never commit this file — it is gitignored):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

See `.env.example` for the template.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run preview` — preview the production build
- `npm run lint` — run ESLint
