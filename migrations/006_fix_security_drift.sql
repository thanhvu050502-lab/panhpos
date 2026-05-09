-- =====================================================================
-- 006 — Fix security drift between live DB and migrations
-- =====================================================================
-- Diagnosed by comparing the live Supabase schema against migrations
-- 001–005. This migration is purely corrective; it adds nothing new.
--
-- Findings addressed:
--   1. Every public table except `members` carries an `allow_all` policy
--      granting SELECT/INSERT/UPDATE/DELETE to {public} (= anon +
--      authenticated). RLS policies are OR'd, so this overrides every
--      role-aware policy in 003_core_schema. Anyone holding the anon
--      key can read and write the entire database.
--   2. `shifts` and `sync_log` exist live but are not in any migration
--      and are not referenced by any client code (verified — no
--      .from('shifts') or .from('sync_log') call anywhere in src/).
--      They are orphans from earlier exploration.
--   3. `set_updated_at()` exists live but isn't in any migration. Four
--      `trg_<table>_updated` triggers reference it. Both this and the
--      migration-defined `touch_updated_at()` do the same thing, so
--      every UPDATE on those four tables fires updated_at = now() twice.
--   4. `audit_log_insert` only checks `auth.uid() is not null`. The
--      table has an `actor_id` column that any authenticated user can
--      set to anyone else's uuid — audit log spoofing.
--   5. `audit_log_update` / `audit_log_delete` policies allow mutation
--      of audit history. Audit log should be append-only.
--   6. `next_order_code` is granted EXECUTE to `anon` (a temporary
--      grant from 004 marked for removal once 001/auth was live; 001
--      has been live for some time).
--
-- This migration is idempotent — every statement uses IF EXISTS / DROP
-- IF EXISTS / CREATE OR REPLACE so it is safe to re-run.
--
-- Run order: 6
-- =====================================================================


-- 1. Drop the `allow_all` policy on every table that has it -------------
-- These are the 13 tables identified in the live policy dump. `members`
-- never had this policy and is excluded.
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'appointments','audit_log','catalog','customer_groups','customers',
      'order_items','order_payments','orders','payment_methods',
      'promotions','settings','shifts','sync_log'
    ])
  loop
    execute format('drop policy if exists allow_all on public.%I', t);
  end loop;
end $$;


-- 2. Drop orphan tables `shifts` and `sync_log` -------------------------
-- These are not referenced by any client code (grep confirmed: no
-- .from('shifts') or .from('sync_log') in src/). If a future feature
-- needs them, redesign and recreate at that time. CASCADE handles the
-- (now-removed) policies and (none-existing) FKs.
drop table if exists public.shifts cascade;
drop table if exists public.sync_log cascade;


-- 3. Drop redundant `trg_<table>_updated` triggers and the orphan
--    `set_updated_at()` function. The `<table>_touch_updated_at`
--    triggers from 001/003 remain and do exactly the same job.
drop trigger if exists trg_appointments_updated on public.appointments;
drop trigger if exists trg_customers_updated    on public.customers;
drop trigger if exists trg_orders_updated       on public.orders;
drop trigger if exists trg_settings_updated     on public.settings;

drop function if exists public.set_updated_at();


-- 4. Tighten `audit_log_insert` to prevent actor_id spoofing -----------
-- Forces actor_id to be either NULL or the caller's own uuid. Matches
-- the original intent of 003_audit_log.sql (which used a different
-- column name `user_id`).
drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert
  on public.audit_log for insert
  to authenticated
  with check (
    auth.uid() is not null
    and (actor_id is null or actor_id = auth.uid())
  );


-- 5. Make audit_log append-only ----------------------------------------
-- No UPDATE, no DELETE policies = no UPDATE/DELETE possible (RLS default
-- deny). If you ever need to prune old audit rows for storage reasons,
-- write a SECURITY DEFINER function rather than re-opening the door.
drop policy if exists audit_log_update on public.audit_log;
drop policy if exists audit_log_delete on public.audit_log;


-- 6. Revoke `next_order_code` from anon --------------------------------
-- The temporary anon grant in 004 (line 32) was marked for removal once
-- Supabase Auth (001) was live. It has been live for some time.
revoke execute on function public.next_order_code(text, int) from anon;


-- =====================================================================
-- VERIFICATION
-- =====================================================================
-- 1) No allow_all left:
-- select count(*) from pg_policies
--   where schemaname='public' and policyname='allow_all';
-- Expect: 0
--
-- 2) Orphan tables gone:
-- select count(*) from pg_tables
--   where schemaname='public' and tablename in ('shifts','sync_log');
-- Expect: 0
--
-- 3) Orphan function gone, orphan triggers gone:
-- select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='set_updated_at';
-- Expect: 0
-- select count(*) from pg_trigger
--   where tgname like 'trg_%_updated' and not tgisinternal;
-- Expect: 0
--
-- 4) audit_log spoofing fixed (run as a non-owner authenticated user):
-- insert into public.audit_log (action, actor_id)
--   values ('test', '00000000-0000-0000-0000-000000000000');
-- Expect: ERROR — new row violates row-level security policy
--
-- 5) audit_log immutable:
-- update public.audit_log set label = 'tampered' where false;
-- (no rows; should not error)
-- update public.audit_log set label = 'tampered'
--   where id = (select id from public.audit_log limit 1);
-- Expect: 0 rows updated (RLS silently filters) — verify with another
-- select that the row is unchanged.
--
-- 6) next_order_code locked:
-- (Sign out / use the anon key.)
-- select public.next_order_code('ORD', 4);
-- Expect: ERROR — permission denied for function next_order_code
