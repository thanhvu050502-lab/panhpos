-- =====================================================================
-- 004 — Server-side order code sequence
-- =====================================================================
-- Goal: replace client-side `generateCode` (which can race when two
-- devices generate codes from a shared cache) with a Postgres sequence.
-- After this migration, the client calls `select next_order_code(...)`
-- right before insert and gets a guaranteed-unique code.
--
-- Run order: 4
-- =====================================================================

create sequence if not exists public.order_seq start with 1;

-- Drop old definitions to allow signature changes.
drop function if exists public.next_order_code(text, int);

create or replace function public.next_order_code(
  prefix text default 'ORD',
  length int default 4
) returns text
language sql
volatile
security definer
set search_path = public
as $$
  select prefix || lpad(nextval('public.order_seq')::text, length, '0');
$$;

revoke all on function public.next_order_code(text, int) from public;
grant execute on function public.next_order_code(text, int) to authenticated;
-- TEMP for pre-auth-migration period — REMOVE after 001 is live:
grant execute on function public.next_order_code(text, int) to anon;


-- =====================================================================
-- BACKFILL the sequence so it doesn't collide with existing codes
-- =====================================================================
-- Run this once, AFTER creating the sequence, to align it with the highest
-- existing order number so codes keep climbing rather than restarting at 1.
do $$
declare
  max_n bigint;
begin
  select coalesce(
    max(nullif(regexp_replace(code, '\D', '', 'g'), '')::bigint),
    0
  ) into max_n
  from public.orders
  where code is not null;

  if max_n > 0 then
    perform setval('public.order_seq', max_n);
  end if;
end $$;


-- =====================================================================
-- VERIFICATION
-- =====================================================================
-- select public.next_order_code('TEST', 4);  -- e.g. 'TEST0042'
-- select public.next_order_code('TEST', 4);  -- e.g. 'TEST0043'
-- select last_value from public.order_seq;
