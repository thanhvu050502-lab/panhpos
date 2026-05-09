# Go-Live Notes

What I changed this session, and what still needs **your** decision/action before launch.

---

## ✅ Done in this session (already in the codebase)

### 1. Killed dead Next.js scaffold
- Deleted `next.config.ts`, `next-env.d.ts`.
- Rewrote `AGENTS.md` to describe the actual Vite + React + Supabase stack (the old text was telling agents to consult Next.js docs — it would have produced wrong code).
- Cleaned `eslint.config.mjs` (no more `eslint-config-next` references; ignores updated to skip `app/` and `.next/`).
- **Still present, you should delete manually** when convenient:
  - `app/` — Next.js scaffold's homepage (imports `next/image`, `next/font` which aren't installed)
  - `.next/` — dev cache from a prior Next.js run (already git-ignored)
  - `index.txt` — 297 KB file, looks like accidental output dump
  - `public/next.svg`, `public/vercel.svg` — scaffold logos
  - `tsconfig.tsbuildinfo` — build cache (already in .gitignore as `*.tsbuildinfo`)

### 2. Payment idempotency [`src/components/modals/PaymentModal.tsx`]
- **Before:** every tap of *Confirm* generated a new `orderId`/payment IDs. A network blip mid-confirm + cashier re-tap could create two parallel orders ⇒ double-charge.
- **After:** order/item/payment IDs are allocated once into a `useRef` and reused across retries. The `create_order_full` RPC is already idempotent on `order.id`, so retrying with the same ID is a no-op server-side.
- For paying a previously-saved pending order, the existing-order payment write now uses `upsert(..., onConflict: 'id', ignoreDuplicates: true)` instead of plain insert, so retries won't duplicate or PK-conflict.
- The IDs reset when split mode toggles or the number of split rows changes (those are genuinely different transactions), and on success.

### 3. Lazy-loaded heavy screens & modals [`src/pages/Index.tsx`]
- `SettingsScreen`, `OrdersScreen`, `AppointmentsScreen`, `CustomersScreen`, `ReportScreen`, and `Modals` are now `React.lazy` with `Suspense`. Dashboard stays eager (it's the landing screen).
- Bundle now splits into chunks: `SettingsScreen` (53 KB), `Modals` (49 KB), `AppointmentsScreen` (16 KB) etc — all deferred until first navigation.
- First-paint gzip dropped from ~171 KB to ~146 KB. Bigger headroom remains in `useCache` chunk (240 KB raw / 65 KB gzip — mostly Supabase client).

### 4. Debounced realtime refetch [`src/hooks/useCache.ts`]
- A single new order fires `INSERT orders` + N `INSERT order_items` + M `INSERT order_payments`, which previously triggered N+M+1 full refetches.
- Now debounced 250 ms — one refetch per logical event.

---

## 🔴 Decisions you need to make (cannot fix autonomously)

### A. Schema vs. client mismatch — **likely a real bug**
The client uses fields that don't exist in `migrations/003_core_schema.sql`:

**`payment_methods` table — missing columns:**
- `type` (`cash` | `bank` | `momo` | `zalopay` | `custom`) — used at PaymentModal.tsx for icon + cash-vs-card UI branching
- `qr_image`, `account_no`, `bank_name`, `account_name` — used at PaymentModal.tsx:182–193 to show the QR/bank panel

**`order_payments` table — missing column:**
- `payment_method_name` — written at PaymentModal.tsx:102,107; read at OrderDetailModal.tsx:166 and reports/CSV at OtherPanels.tsx:551,562,924

**Likely effect:** payment-method icons all fall back to 💳, the bank/QR panel never shows, receipts and CSV exports show "Khác" instead of the method name. The RPC path silently drops unknown keys; the REST path may also strip them.

**Action:** add a migration `005_payment_method_columns.sql` that adds the missing columns, OR remove the unused fields from the client and compute the display name from the method cache by joining on `payment_method_id`. **I did not write this migration because schema changes need your sign-off — flag for you to choose.**

### B. Login lockout is client-side only [`src/hooks/useAuth.ts:18–35`]
- Failed-attempt counter is `localStorage` keyed by username. Clearing storage = bypass.
- In Supabase mode, the actual security backstop is **Supabase Auth's own rate limiting** (configurable in dashboard → Authentication → Rate Limits). The client-side counter is just UI friction.
- **Action before go-live:** confirm the Supabase project has Auth rate limits configured (the defaults are generally sane). If you want defense-in-depth, that's a new RPC + table — not a 30-min job.

### C. RLS — single-salon launch is fine, multi-salon needs work
- All 11 tables have RLS enabled, with `SELECT` open to authenticated users, writes restricted to authenticated, and financial deletes (orders/items/payments/audit_log) restricted to manager+owner. ✅
- **However:** the `salon_id` column exists on every table but no policy filters by it. Single-salon: harmless. Multi-salon: a staff member from salon A can read salon B's orders.
- **Audit log is writeable by any authenticated user** — staff can forge entries or skip them. Consider locking inserts to a server function for true forensic value.
- **Customer/appointment deletes** are also "any authenticated" — consider restricting to manager+owner if accidental deletions worry you (4.5 in `003_core_schema.sql`).
- **`orders.staff_id`** is never populated by the client; only `staff_name` is set. Names can collide; for accurate per-staff reports, populate `staff_id` from the current session.

### D. Error tracking not wired up
- `.env.example` references `VITE_SENTRY_DSN` but no `Sentry.init` exists in the codebase.
- For a POS, you want to know about failed payments / failed sync within minutes.
- **Action:** create a Sentry project (free tier is fine for one salon), add `VITE_SENTRY_DSN` to `.env`, install `@sentry/react`, init at app boot, and wrap the payment-confirm + write-queue catch blocks in explicit `Sentry.captureException`. ~1 hour of work.

### E. Dual order-code sequences
`migrations/003_core_schema.sql` creates `order_code_seq` + `next_order_code(prefix, length)`. `migrations/004_order_seq.sql` creates a *different* `order_seq` and replaces the function. Net effect: 003's sequence becomes orphaned, 004 wins. Harmless but confusing. **Action:** drop `order_code_seq` from 003 (or add a one-liner to 004 to clean it up) before applying to a fresh database.

### F. Smoke test only covers nav + login
[`smoke-test.mjs`] doesn't exercise the money path. Before launch, extend it to:
1. Create order → add item → confirm payment → assert order row exists with correct `final_amount` + 1 payment row.
2. Toggle network offline → create order → toggle online → assert it syncs once and only once.
3. Tap *Confirm* twice in rapid succession → assert exactly one payment row (regression test for the idempotency fix above).

---

## 🟡 Recommended polish (not blockers)

- **Bundle:** `useCache` chunk is 240 KB raw because Supabase client gets bundled with cache logic. If first paint matters more, defer Supabase init until after the login screen renders.
- **CSP:** `netlify.toml:25` allows `script-src 'self' 'unsafe-inline'` to accommodate Vite's bootstrap. A nonce-based CSP would prevent XSS in customer notes from escalating. Future improvement.
- **TypeScript:** `noUnusedLocals` and `noUnusedParameters` are off (`tsconfig.json`); turn on once codebase is clean.
- **README:** worth adding a `## Setup` section: required env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_SENTRY_DSN`), migration order (`001 → 002 → 003 → 003_audit_log → 004`), and how to run `smoke-test.mjs`.
- **`npm audit`:** run it and fix any high/critical findings before launch.

---

## Build & lint status

- `npm run build` — passes, no TS errors, bundle splits as expected
- `npm run lint` — passes
- All changes here are reversible; none touch the database

---

## Suggested next actions, in order

1. **Decide on item A** (missing schema columns) — blocker for payment UX correctness.
2. **Verify Supabase Auth rate limits** in the dashboard (item B).
3. **Wire up Sentry or equivalent** (item D).
4. **Extend smoke test** to cover the money path (item F).
5. **Manually delete** the dead scaffold files listed at the top of section 1.
6. **Deploy to a Netlify staging site** and run the extended smoke test on a tablet (PWA install + offline → online sync flow).

After 1–4 you're in good shape to go live.
