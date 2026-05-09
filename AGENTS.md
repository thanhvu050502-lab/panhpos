# Project guide for agents and contributors

## Stack
- **Build**: Vite 8 + `@vitejs/plugin-react` (NOT Next.js — ignore any leftover `next.*` files)
- **Runtime**: React 19, TypeScript 5 (strict)
- **Backend**: Supabase (Postgres + Auth + Realtime)
- **Offline**: `idb-keyval` write-queue + `vite-plugin-pwa` service worker
- **Deploy**: Netlify, publishing `dist/`
- **Language**: UI is Vietnamese (`useLang` context); keep new UI strings localized

## Commands
- `npm run dev` — Vite dev server
- `npm run build` — `tsc` typecheck then `vite build` to `dist/`
- `npm run preview` — serve the built bundle
- `npm run lint` — ESLint
- `node smoke-test.mjs` — Playwright smoke (requires `TEST_PASSWORD` env)

## Layout
- `src/` — the actual app (entry: `src/main.tsx`)
- `migrations/` — numbered Supabase SQL migrations, applied in order
- `netlify.toml` — deploy + CSP/security headers
- `dist/` — build output (git-ignored)

## Conventions
- Money-touching code (payments, order totals) must be idempotent — assume the user double-taps and the network drops mid-write.
- Writes that may run offline go through the write-queue; do not call Supabase directly for mutations without queue support.
- Every Supabase table has RLS enabled — new tables need explicit policies or reads silently fail.
