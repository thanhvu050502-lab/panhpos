-- =====================================================================
-- 008 — Cancel reasons (master data) + structured cancel fields on orders
-- =====================================================================
-- Goal: replace the free-text "Lý do hủy" string that today is concatenated
-- into orders.notes with a structured reference to a managed list.
--
-- This unlocks analytics ("tỷ lệ hủy theo lý do") and keeps the cancel
-- workflow auditable. The free-text path stays usable as a fallback note
-- via orders.cancel_note for the cases where none of the preset reasons
-- fits.
--
-- Run order: 8
-- =====================================================================

create table if not exists public.cancel_reasons (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists cancel_reasons_sort_idx on public.cancel_reasons (sort_order, created_at);

alter table public.cancel_reasons enable row level security;

drop policy if exists cancel_reasons_read on public.cancel_reasons;
create policy cancel_reasons_read
  on public.cancel_reasons for select
  to authenticated
  using (true);

drop policy if exists cancel_reasons_write on public.cancel_reasons;
create policy cancel_reasons_write
  on public.cancel_reasons for all
  to authenticated
  using (true)
  with check (true);

-- Anon access during the pre-auth migration window (mirrors 003).
drop policy if exists cancel_reasons_anon_read on public.cancel_reasons;
create policy cancel_reasons_anon_read
  on public.cancel_reasons for select
  to anon
  using (true);
drop policy if exists cancel_reasons_anon_write on public.cancel_reasons;
create policy cancel_reasons_anon_write
  on public.cancel_reasons for all
  to anon
  using (true)
  with check (true);

-- ---------------------------------------------------------------------
-- Extend orders with structured cancel fields
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists cancel_reason_id uuid references public.cancel_reasons(id) on delete set null,
  add column if not exists cancel_note text,
  add column if not exists cancelled_at timestamptz;

create index if not exists orders_cancel_reason_idx on public.orders (cancel_reason_id) where cancel_reason_id is not null;

-- ---------------------------------------------------------------------
-- Seed common reasons. Skipped if the table already has rows.
-- ---------------------------------------------------------------------
insert into public.cancel_reasons (label, sort_order)
select * from (values
  ('Khách đổi ý', 10),
  ('Khách không đến', 20),
  ('Nhân viên bận', 30),
  ('Hết vật tư', 40),
  ('Sai dịch vụ', 50),
  ('Khiếu nại chất lượng', 60),
  ('Khác', 99)
) as v(label, sort_order)
where not exists (select 1 from public.cancel_reasons);


-- =====================================================================
-- VERIFICATION
-- =====================================================================
-- select label, sort_order from public.cancel_reasons order by sort_order;
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'orders'
--     and column_name in ('cancel_reason_id', 'cancel_note', 'cancelled_at');
