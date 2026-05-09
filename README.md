# nailpos

Vite + React 19 + TypeScript + Supabase PWA for a nail salon point-of-sale.

## Stack

- **Build**: Vite 8, TypeScript 5
- **UI**: React 19, Tailwind CSS 4
- **Backend**: Supabase (Auth + Postgres + Realtime)
- **PWA**: vite-plugin-pwa (Workbox)
- **Deploy**: Netlify (config in [netlify.toml](netlify.toml))

## Develop

```bash
npm install
npm run dev      # http://localhost:5175
npm run build    # tsc + vite build  -> dist/
npm run preview  # serve dist/ locally
npm run lint
```

## Configure Supabase

Set these env vars (Netlify or local `.env`) before building:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

If env vars are missing, the app shows a setup screen on first launch where the URL + anon key can be entered manually (stored in localStorage). With no Supabase configured at all, the app runs in demo mode (data lives in localStorage only).

## Database setup

Migrations live in [migrations/](migrations/). Apply in numeric order on a fresh Supabase project:

1. [001_auth_members.sql](migrations/001_auth_members.sql) — auth + members table.
2. [002_create_order_full.sql](migrations/002_create_order_full.sql) — atomic order RPC.
3. [003_core_schema.sql](migrations/003_core_schema.sql) — core data tables, RLS, indexes, audit log, order-code sequence.

See [001_RUNBOOK.md](migrations/001_RUNBOOK.md) for the auth bootstrap, then [003_RUNBOOK.md](migrations/003_RUNBOOK.md) for verification queries and a rollback recipe.

## Smoke test

```bash
TEST_PASSWORD=<your-admin-password> node smoke-test.mjs
```

Logs in, navigates every screen, fails if any console error fires. Requires the dev server (or `npm run preview`) to be running.

## Project layout

```
src/
  pages/Index.tsx          single-screen state machine + auth/setup gates
  hooks/
    useAuth.ts             Supabase Auth (or localStorage in demo mode)
    useCache.ts            Realtime cache + atomic order RPC
    useShift.ts            shift open/close + cross-midnight handling
    useAuditLog.ts         local + server-side audit log
    useIdleTimeout.ts      auto-logout on inactivity
  components/
    layout/                Header, BottomNav, FAB
    modals/                Order, Payment, Customer, Appointment, etc.
    dashboard/             Dashboard + Reports
    settings/              Settings panels (incl. account management)
    ui/                    primitives (Button, Modal, Toast, etc.)
  lib/
    supabaseClient.ts      singleton + credential plumbing
    writeQueue.ts          IndexedDB queue for offline writes/RPCs
    passwordCrypto.ts      PBKDF2 (demo-mode passwords only)
    utils.ts               formatters, money parsing, order code generator
migrations/                Postgres SQL + runbooks
public/                    PWA icons + manifest assets
```
