-- =====================================================================
-- 002 — Atomic order save (RPC)
-- =====================================================================
-- Goal: replace the client-side loop that does INSERT orders, INSERT
-- order_items, INSERT order_payments with one transactional RPC. If the
-- network drops or any insert fails, NOTHING is written — no orphan
-- orders, no missing items.
--
-- Hardening (vs. earlier draft):
--   - Requires an authenticated caller (auth.uid() not null).
--   - Validates p_order is an object with an id; raises 22023 otherwise.
--   - Idempotent: re-calling with an existing id returns silently. Network
--     retries are safe.
--   - search_path = '' with explicit public.* prefixes everywhere.
--   - Anon execute is REVOKED (no temporary grant).
--
-- Run order: 2  (after 001_auth_members.sql, before 003_core_schema.sql
-- which creates the orders/order_items/order_payments tables this RPC
-- writes to).
-- =====================================================================

drop function if exists public.create_order_full(jsonb, jsonb, jsonb);

create or replace function public.create_order_full(
  p_order    jsonb,
  p_items    jsonb,
  p_payments jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_existing uuid;
begin
  -- Auth check: only signed-in users may write orders.
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Input validation.
  if p_order is null or jsonb_typeof(p_order) <> 'object' or (p_order->>'id') is null then
    raise exception 'p_order with id is required' using errcode = '22023';
  end if;
  v_order_id := (p_order->>'id')::uuid;

  -- Idempotency: if same id already exists, treat as success and return it.
  -- This makes network retries safe (cashier double-tap, flaky Wi-Fi, etc.).
  select id into v_existing from public.orders where id = v_order_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Insert the parent order. jsonb_populate_record fills only the columns
  -- present in the JSON; missing columns stay NULL or take their default.
  insert into public.orders
  select * from jsonb_populate_record(null::public.orders, p_order);

  -- Insert items + payments only if arrays are non-empty.
  if p_items is not null and jsonb_array_length(p_items) > 0 then
    insert into public.order_items
    select * from jsonb_populate_recordset(null::public.order_items, p_items);
  end if;

  if p_payments is not null and jsonb_array_length(p_payments) > 0 then
    insert into public.order_payments
    select * from jsonb_populate_recordset(null::public.order_payments, p_payments);
  end if;

  return v_order_id;
end;
$$;

revoke all on function public.create_order_full(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_order_full(jsonb, jsonb, jsonb) to authenticated;


-- =====================================================================
-- VERIFICATION
-- =====================================================================
-- Run after 003_core_schema.sql is applied. Sign in as an owner (or any
-- authenticated user) before running these.
--
-- 1) Happy path:
-- select public.create_order_full(
--   jsonb_build_object(
--     'id', gen_random_uuid(),
--     'code', 'TEST-001',
--     'customer_name', 'Smoke Test',
--     'total_amount', 100000,
--     'final_amount', 100000,
--     'status', 'pending',
--     'created_at', now()
--   ),
--   '[]'::jsonb,
--   '[]'::jsonb
-- );
-- Then: select * from orders where code = 'TEST-001'; -- 1 row
--
-- 2) Idempotency: re-run the same statement with the SAME id — should
--    return the same uuid and not raise.
--
-- 3) Auth check: as anon (sign out, then SQL Editor "RLS off" toggle off):
--    expect ERROR: Authentication required (42501)
--
-- 4) Validation:
-- select public.create_order_full(null, null, null);  -- expect 22023
--
-- Cleanup:  delete from orders where code = 'TEST-001';
