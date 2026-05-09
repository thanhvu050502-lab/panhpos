# Migration 003 — Core Schema Runbook

> ⚠️ **Run on STAGING first.** Verify, then repeat on production.

## Apply order

001 → 002 → 003. 002 references tables created in 003, but only at **runtime**; the function definition compiles fine without them. Either order works for raw SQL apply, but the recommended order is the numeric one.

```bash
psql "$STAGING_URL" -f migrations/001_auth_members.sql
psql "$STAGING_URL" -f migrations/002_create_order_full.sql
psql "$STAGING_URL" -f migrations/003_core_schema.sql
```

Or via the Supabase SQL Editor: paste the file contents, run, repeat.

## Verification queries

```sql
-- 1) Every public table has RLS enabled
select tablename, rowsecurity
  from pg_tables
  where schemaname = 'public'
  order by 1;
-- Expect 12 rows (members + 11 from 003), rowsecurity = true on every row.

-- 2) All required functions exist
select proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and proname in (
      'create_order_full','next_order_code',
      'is_owner','is_manager_or_owner','bootstrap_owner','touch_updated_at'
    )
  order by 1;
-- Expect 6 rows.

-- 3) next_order_code works
select public.next_order_code('ORD', 4);  -- ORD0001
select public.next_order_code('ORD', 4);  -- ORD0002

-- 4) RPC happy path (sign in as an authenticated user first)
select public.create_order_full(
  jsonb_build_object(
    'id', gen_random_uuid(),
    'code', public.next_order_code('ORD', 4),
    'customer_name','Smoke',
    'total_amount', 100000,
    'final_amount', 100000
  ),
  '[]'::jsonb,
  '[]'::jsonb
);
select * from public.orders where customer_name = 'Smoke';

-- Cleanup
delete from public.orders where customer_name = 'Smoke';
```

## Idempotency RPC test

Call `create_order_full` with the **same** uuid twice. Both should return the same uuid, no error. Confirms network retries are safe.

## Auth check

Sign out (or use the anon role). Calling `create_order_full` should raise `42501 Authentication required`.

## RLS sanity (as `staff`)

```sql
-- Sign in as a staff member (auth.uid() resolves to that member's id).
-- These should ALL fail:
delete from public.orders where false;
update public.catalog set price = price where false;

-- These should succeed:
select count(*) from public.orders;
select count(*) from public.catalog;
```

## Seed initial data (optional)

After 003 lands, the app expects at minimum a `settings` row, one or more `payment_methods`, and a few `catalog` rows. The app will write the settings row automatically on first save; payment methods + catalog should be added via the Settings screen, or seeded:

```sql
insert into public.settings (id, data) values (1, '{}'::jsonb)
  on conflict (id) do nothing;

insert into public.payment_methods (name, sort_order) values
  ('Tiền mặt', 0), ('Chuyển khoản', 1)
  on conflict do nothing;
```

## Rollback

If something is wrong with 003 and code hasn't been deployed yet:

```sql
drop table if exists public.audit_log         cascade;
drop table if exists public.order_payments    cascade;
drop table if exists public.order_items       cascade;
drop table if exists public.orders            cascade;
drop table if exists public.appointments      cascade;
drop table if exists public.promotions        cascade;
drop table if exists public.payment_methods   cascade;
drop table if exists public.catalog           cascade;
drop table if exists public.customers         cascade;
drop table if exists public.customer_groups   cascade;
drop table if exists public.settings          cascade;
drop function if exists public.next_order_code(text, int);
drop sequence if exists public.order_code_seq;
drop type if exists public.order_status;
drop type if exists public.appointment_status;
drop type if exists public.promotion_type;
drop type if exists public.catalog_type;
```

This leaves 001 (members) and 002 (create_order_full) intact.

## Production cutover

1. Run 001/002/003 in production.
2. Bootstrap an owner per [001_RUNBOOK.md](001_RUNBOOK.md) Step C.
3. Update Netlify env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the production values.
4. Deploy.
5. Smoke test: log in, create a test order, verify it appears in `select * from orders order by created_at desc limit 1;`.
6. Open the app on a second device with a different staff account → realtime should propagate the order within ~1s.
