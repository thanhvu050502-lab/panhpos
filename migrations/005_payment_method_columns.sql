-- =====================================================================
-- 005 — Payment method extensions + payment name denormalization
-- =====================================================================
-- Goal: align the database with what the client already writes and reads.
-- Migrations 003/004 created the bare bones; the app has been using
-- richer fields (cash vs. bank vs. e-wallet, QR images, account details,
-- denormalized method name on the receipt) that never had columns.
--
-- This migration is additive only — no data is destroyed, and the columns
-- are nullable so existing rows survive untouched. Run after 004.
--
-- Safe to apply on a database that already has these columns (every
-- statement uses IF NOT EXISTS).
--
-- Run order: 5
-- =====================================================================

-- 1. payment_methods extensions ------------------------------------------

-- 'cash' | 'bank' | 'momo' | 'zalopay' | 'custom' — drives PaymentModal's
-- icon, the "received / change" cash UI, and whether the QR/bank panel
-- shows. Stored as text (not enum) because adding a new wallet later
-- shouldn't require a migration.
alter table public.payment_methods
  add column if not exists type text not null default 'custom'
    check (type in ('cash','bank','momo','zalopay','custom'));

-- For bank or e-wallet methods: the QR image (data: URL or remote URL)
-- shown to the customer to scan.
alter table public.payment_methods
  add column if not exists qr_image text;

-- Bank account triplet — shown when type='bank' and no QR is uploaded.
alter table public.payment_methods
  add column if not exists bank_name    text;
alter table public.payment_methods
  add column if not exists account_no   text;
alter table public.payment_methods
  add column if not exists account_name text;


-- 2. order_payments — denormalized method name --------------------------
-- The client writes payment_method_name at insert time so receipts and
-- CSV exports keep working even if the source payment_method is later
-- renamed or deleted. Without this column, the client value is silently
-- dropped and reports show "Khác".
alter table public.order_payments
  add column if not exists payment_method_name text;

-- Backfill historical rows from the live payment_methods table where
-- possible. New rows will have the name set by the client at insert time.
update public.order_payments op
   set payment_method_name = pm.name
  from public.payment_methods pm
 where op.payment_method_id = pm.id
   and op.payment_method_name is null;


-- 3. Drop the orphaned sequence from migration 003 ----------------------
-- Migration 004 replaced the function and switched to public.order_seq.
-- public.order_code_seq from 003 is no longer referenced — drop it so a
-- fresh deploy doesn't carry two sequences forever.
drop sequence if exists public.order_code_seq;


-- =====================================================================
-- VERIFICATION
-- =====================================================================
-- 1) New columns visible:
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema='public'
--     and table_name='payment_methods'
--   order by ordinal_position;
-- Expect: id, name, is_active, sort_order, salon_id, created_at,
--         updated_at, type, qr_image, bank_name, account_no, account_name
--
-- 2) Type constraint:
-- update public.payment_methods set type='not_a_real_type' where false;
-- (no rows updated, but expect no error)
-- update public.payment_methods set type='not_a_real_type'
--   where id = (select id from public.payment_methods limit 1);
-- Expect: ERROR — check constraint violation. (Then ROLLBACK.)
--
-- 3) order_payments backfill:
-- select count(*) filter (where payment_method_name is null) as missing,
--        count(*) as total
--   from public.order_payments;
-- Expect: missing = 0 if every order_payment had a valid payment_method_id.
--
-- 4) Orphaned sequence gone:
-- select count(*) from pg_sequences
--   where schemaname='public' and sequencename='order_code_seq';
-- Expect: 0.
