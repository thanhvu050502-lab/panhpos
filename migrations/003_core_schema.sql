-- =====================================================================
-- 003 — Core schema (POS data tables)
-- =====================================================================
-- Goal: create every table the app needs at runtime, with the right
-- types, constraints, indexes, RLS policies, and triggers — plus the
-- next_order_code sequence/RPC that eliminates cross-device order code
-- collisions.
--
-- Every business table includes a nullable `salon_id uuid` column +
-- index. There is intentionally NO FK to a salons table yet — single
-- salon launch. When multi-tenancy is added later, the migration is
-- additive: create salons table, backfill salon_id, add FK, swap RLS
-- policies to scope by salon_id. No table rewrite.
--
-- Conventions:
--   - PKs: uuid primary key default gen_random_uuid()
--   - Money: numeric(14,2) not null default 0 check (>= 0)
--   - Timestamps: timestamptz with the touch_updated_at() trigger from 001
--   - Status fields: real Postgres enums
--   - RLS enabled on EVERY table; default-deny means missing policies
--     block reads.
--
-- Run order: 3  (after 001_auth_members.sql and 002_create_order_full.sql)
-- =====================================================================

-- 0. Enums ----------------------------------------------------------------
do $$ begin
  create type public.order_status as enum ('pending','paid','cancelled','completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.appointment_status as enum ('scheduled','done','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.promotion_type as enum ('percent','amount');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.catalog_type as enum ('service','product','combo');
exception when duplicate_object then null; end $$;


-- 0.5 Self-heal partial prior runs ---------------------------------------
-- If a previous attempt at this migration (or an older schema) created any
-- of these tables with a different column set, the create-index / unique
-- constraint lines below would fail. Bring every existing table up to the
-- expected column set before re-running. Non-destructive: only adds columns,
-- never drops. If a table doesn't exist, alter is a no-op and the create
-- table block below builds it fresh.

-- customer_groups
alter table if exists public.customer_groups add column if not exists name text;
alter table if exists public.customer_groups add column if not exists salon_id uuid;
alter table if exists public.customer_groups add column if not exists created_at timestamptz not null default now();
alter table if exists public.customer_groups add column if not exists updated_at timestamptz not null default now();

-- customers
alter table if exists public.customers add column if not exists name text;
alter table if exists public.customers add column if not exists phone text;
alter table if exists public.customers add column if not exists group_id uuid;
alter table if exists public.customers add column if not exists notes text;
alter table if exists public.customers add column if not exists salon_id uuid;
alter table if exists public.customers add column if not exists created_at timestamptz not null default now();
alter table if exists public.customers add column if not exists updated_at timestamptz not null default now();

-- catalog
alter table if exists public.catalog add column if not exists name text;
alter table if exists public.catalog add column if not exists price numeric(14,2) not null default 0;
alter table if exists public.catalog add column if not exists type public.catalog_type not null default 'service';
alter table if exists public.catalog add column if not exists unit text;
alter table if exists public.catalog add column if not exists is_active boolean not null default true;
alter table if exists public.catalog add column if not exists variable_price boolean not null default false;
alter table if exists public.catalog add column if not exists combo_items jsonb;
alter table if exists public.catalog add column if not exists sort_order int not null default 0;
alter table if exists public.catalog add column if not exists salon_id uuid;
alter table if exists public.catalog add column if not exists created_at timestamptz not null default now();
alter table if exists public.catalog add column if not exists updated_at timestamptz not null default now();

-- payment_methods
alter table if exists public.payment_methods add column if not exists name text;
alter table if exists public.payment_methods add column if not exists is_active boolean not null default true;
alter table if exists public.payment_methods add column if not exists sort_order int not null default 0;
alter table if exists public.payment_methods add column if not exists salon_id uuid;
alter table if exists public.payment_methods add column if not exists created_at timestamptz not null default now();
alter table if exists public.payment_methods add column if not exists updated_at timestamptz not null default now();

-- promotions
alter table if exists public.promotions add column if not exists name text;
alter table if exists public.promotions add column if not exists type public.promotion_type not null default 'percent';
alter table if exists public.promotions add column if not exists value numeric(14,2) not null default 0;
alter table if exists public.promotions add column if not exists is_active boolean not null default true;
alter table if exists public.promotions add column if not exists salon_id uuid;
alter table if exists public.promotions add column if not exists created_at timestamptz not null default now();
alter table if exists public.promotions add column if not exists updated_at timestamptz not null default now();

-- appointments
alter table if exists public.appointments add column if not exists customer_id uuid;
alter table if exists public.appointments add column if not exists customer_name text;
alter table if exists public.appointments add column if not exists scheduled_at timestamptz;
alter table if exists public.appointments add column if not exists services jsonb not null default '[]'::jsonb;
alter table if exists public.appointments add column if not exists status public.appointment_status not null default 'scheduled';
alter table if exists public.appointments add column if not exists notes text;
alter table if exists public.appointments add column if not exists salon_id uuid;
alter table if exists public.appointments add column if not exists created_at timestamptz not null default now();
alter table if exists public.appointments add column if not exists updated_at timestamptz not null default now();

-- orders
alter table if exists public.orders add column if not exists code text;
alter table if exists public.orders add column if not exists customer_id uuid;
alter table if exists public.orders add column if not exists customer_name text;
alter table if exists public.orders add column if not exists appointment_id uuid;
alter table if exists public.orders add column if not exists total_amount numeric(14,2) not null default 0;
alter table if exists public.orders add column if not exists discount numeric(14,2) not null default 0;
alter table if exists public.orders add column if not exists final_amount numeric(14,2) not null default 0;
alter table if exists public.orders add column if not exists status public.order_status not null default 'pending';
alter table if exists public.orders add column if not exists notes text;
alter table if exists public.orders add column if not exists staff_name text;
alter table if exists public.orders add column if not exists staff_id uuid;
alter table if exists public.orders add column if not exists promotion_id uuid;
alter table if exists public.orders add column if not exists salon_id uuid;
alter table if exists public.orders add column if not exists created_at timestamptz not null default now();
alter table if exists public.orders add column if not exists updated_at timestamptz not null default now();

-- order_items
alter table if exists public.order_items add column if not exists order_id uuid;
alter table if exists public.order_items add column if not exists catalog_id uuid;
alter table if exists public.order_items add column if not exists name text;
alter table if exists public.order_items add column if not exists price numeric(14,2) not null default 0;
alter table if exists public.order_items add column if not exists quantity numeric(10,2) not null default 1;
alter table if exists public.order_items add column if not exists created_at timestamptz not null default now();

-- order_payments
alter table if exists public.order_payments add column if not exists order_id uuid;
alter table if exists public.order_payments add column if not exists payment_method_id uuid;
alter table if exists public.order_payments add column if not exists amount numeric(14,2) not null default 0;
alter table if exists public.order_payments add column if not exists received_at timestamptz not null default now();
alter table if exists public.order_payments add column if not exists created_at timestamptz not null default now();

-- audit_log
alter table if exists public.audit_log add column if not exists action text;
alter table if exists public.audit_log add column if not exists entity text;
alter table if exists public.audit_log add column if not exists entity_id text;
alter table if exists public.audit_log add column if not exists label text;
alter table if exists public.audit_log add column if not exists user_name text;
alter table if exists public.audit_log add column if not exists actor_id uuid;
alter table if exists public.audit_log add column if not exists salon_id uuid;
alter table if exists public.audit_log add column if not exists created_at timestamptz not null default now();


-- 1. Tables ---------------------------------------------------------------

-- 1.1 settings — singleton row.
create table if not exists public.settings (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 1.2 customer_groups
create table if not exists public.customer_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  salon_id    uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (salon_id, name)
);
create index if not exists customer_groups_salon_idx on public.customer_groups(salon_id);

-- 1.3 customers
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  group_id    uuid references public.customer_groups(id) on delete set null,
  notes       text,
  salon_id    uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists customers_phone_idx on public.customers(phone);
create index if not exists customers_group_idx on public.customers(group_id);
create index if not exists customers_salon_idx on public.customers(salon_id);

-- 1.4 catalog (services / products / combos)
create table if not exists public.catalog (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  price           numeric(14,2) not null default 0 check (price >= 0),
  type            public.catalog_type not null default 'service',
  unit            text,
  is_active       boolean not null default true,
  variable_price  boolean not null default false,
  combo_items     jsonb,
  sort_order      int not null default 0,
  salon_id        uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists catalog_active_idx on public.catalog(is_active);
create index if not exists catalog_salon_idx on public.catalog(salon_id);

-- 1.5 payment_methods
create table if not exists public.payment_methods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  salon_id    uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (salon_id, name)
);
create index if not exists payment_methods_salon_idx on public.payment_methods(salon_id);

-- 1.6 promotions
create table if not exists public.promotions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        public.promotion_type not null default 'percent',
  value       numeric(14,2) not null default 0 check (value >= 0),
  is_active   boolean not null default true,
  salon_id    uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists promotions_salon_idx on public.promotions(salon_id);

-- 1.7 appointments
create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references public.customers(id) on delete set null,
  customer_name text,
  scheduled_at  timestamptz not null,
  services      jsonb not null default '[]'::jsonb,
  status        public.appointment_status not null default 'scheduled',
  notes         text,
  salon_id      uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists appointments_scheduled_idx on public.appointments(scheduled_at);
create index if not exists appointments_customer_idx on public.appointments(customer_id);
create index if not exists appointments_salon_idx on public.appointments(salon_id);

-- 1.8 orders
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,
  customer_id     uuid references public.customers(id) on delete set null,
  customer_name   text,
  appointment_id  uuid references public.appointments(id) on delete set null,
  total_amount    numeric(14,2) not null default 0 check (total_amount >= 0),
  discount        numeric(14,2) not null default 0 check (discount >= 0),
  final_amount    numeric(14,2) not null default 0 check (final_amount >= 0),
  status          public.order_status not null default 'pending',
  notes           text,
  staff_name      text,
  staff_id        uuid references public.members(id) on delete set null,
  promotion_id    uuid references public.promotions(id) on delete set null,
  salon_id        uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (salon_id, code)
);
create index if not exists orders_created_idx  on public.orders(created_at desc);
create index if not exists orders_status_idx   on public.orders(status);
create index if not exists orders_customer_idx on public.orders(customer_id);
create index if not exists orders_salon_idx    on public.orders(salon_id);

-- 1.9 order_items
create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  catalog_id  uuid references public.catalog(id) on delete restrict,
  name        text not null,
  price       numeric(14,2) not null check (price >= 0),
  quantity    numeric(10,2) not null check (quantity > 0),
  created_at  timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- 1.10 order_payments
create table if not exists public.order_payments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete cascade,
  payment_method_id  uuid references public.payment_methods(id) on delete restrict,
  amount             numeric(14,2) not null check (amount >= 0),
  received_at        timestamptz not null default now(),
  created_at         timestamptz not null default now()
);
create index if not exists order_payments_order_idx on public.order_payments(order_id);

-- 1.11 audit_log — server-side mirror of the local audit log.
-- Column names match the client payload at src/hooks/useAuditLog.ts.
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  action      text not null,
  entity      text,
  entity_id   text,
  label       text,
  user_name   text,
  actor_id    uuid references public.members(id) on delete set null,
  salon_id    uuid,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);
create index if not exists audit_log_entity_idx  on public.audit_log(entity, entity_id);
create index if not exists audit_log_salon_idx   on public.audit_log(salon_id);


-- 2. Triggers (touch_updated_at — defined in 001) -------------------------
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'settings','customer_groups','customers','catalog','payment_methods',
      'promotions','appointments','orders'
    ])
  loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',
      t, t
    );
  end loop;
end $$;


-- 3. Enable RLS on every table -------------------------------------------
alter table public.settings         enable row level security;
alter table public.customer_groups  enable row level security;
alter table public.customers        enable row level security;
alter table public.catalog          enable row level security;
alter table public.payment_methods  enable row level security;
alter table public.promotions       enable row level security;
alter table public.appointments     enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.order_payments   enable row level security;
alter table public.audit_log        enable row level security;


-- 4. Policies -------------------------------------------------------------
-- Helper macro: every table has the same SELECT policy (any authenticated
-- user can read). Differences are in INSERT/UPDATE/DELETE.
--
-- Admin-curated tables (settings, catalog, customer_groups, payment_methods,
-- promotions): only managers + owners can write.
--
-- Operational tables (customers, appointments, orders, order_items,
-- order_payments, audit_log): any authenticated user can write. Deletes
-- on financial history (orders/items/payments/audit_log) are restricted
-- to managers + owners.

-- 4.1 SELECT (any authenticated)
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'settings','customer_groups','customers','catalog','payment_methods',
      'promotions','appointments','orders','order_items','order_payments','audit_log'
    ])
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (true)',
      t, t
    );
  end loop;
end $$;

-- 4.2 INSERT/UPDATE/DELETE on admin-curated tables — managers + owners
do $$
declare t text;
begin
  for t in
    select unnest(array['settings','customer_groups','catalog','payment_methods','promotions'])
  loop
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated using (public.is_manager_or_owner()) with check (public.is_manager_or_owner())',
      t, t
    );
  end loop;
end $$;

-- 4.3 INSERT/UPDATE on operational tables — any authenticated
do $$
declare t text;
begin
  for t in
    select unnest(array['customers','appointments','orders','order_items','order_payments','audit_log'])
  loop
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (auth.uid() is not null)',
      t, t
    );
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)',
      t, t
    );
  end loop;
end $$;

-- 4.4 DELETE on financial history — managers + owners only
do $$
declare t text;
begin
  for t in
    select unnest(array['orders','order_items','order_payments','audit_log'])
  loop
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using (public.is_manager_or_owner())',
      t, t
    );
  end loop;
end $$;

-- 4.5 DELETE on customers/appointments — any authenticated (mistakes happen)
do $$
declare t text;
begin
  for t in
    select unnest(array['customers','appointments'])
  loop
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using (auth.uid() is not null)',
      t, t
    );
  end loop;
end $$;


-- 5. next_order_code RPC (cross-device-safe order numbering) -------------
-- Replaces the client-side max(existing) + 1 in src/lib/utils.ts which
-- races between devices. Uses a sequence so two simultaneous callers get
-- distinct numbers.
create sequence if not exists public.order_code_seq;

create or replace function public.next_order_code(prefix text, length int)
returns text
language sql
security definer
set search_path = ''
as $$
  select coalesce(prefix, 'ORD')
       || lpad(nextval('public.order_code_seq')::text, greatest(coalesce(length, 4), 1), '0');
$$;

revoke all on function public.next_order_code(text, int) from public, anon;
grant execute on function public.next_order_code(text, int) to authenticated;


-- 6. Realtime publication -------------------------------------------------
-- Make sure the new tables are part of the supabase_realtime publication
-- so the client's realtime channel actually receives changes.
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'settings','customer_groups','customers','catalog','payment_methods',
      'promotions','appointments','orders','order_items','order_payments','audit_log'
    ])
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null; -- already in publication
    when undefined_object then
      null; -- publication doesn't exist (self-hosted Postgres without realtime); ignore
    end;
  end loop;
end $$;


-- =====================================================================
-- VERIFICATION
-- =====================================================================
-- 1) Tables + RLS:
-- select tablename, rowsecurity
--   from pg_tables
--   where schemaname='public'
--   order by 1;
-- Expect 11 rows + members; rowsecurity = true on every row.
--
-- 2) Functions:
-- select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public'
--   and proname in ('create_order_full','next_order_code','is_owner','is_manager_or_owner','bootstrap_owner','touch_updated_at');
-- Expect 6 rows.
--
-- 3) next_order_code:
-- select public.next_order_code('ORD', 4);
-- select public.next_order_code('ORD', 4);
-- Expect 'ORD0001', 'ORD0002'.
--
-- 4) Smoke RPC:
-- select public.create_order_full(
--   jsonb_build_object('id', gen_random_uuid(), 'code', public.next_order_code('ORD',4),
--                      'customer_name','Smoke','total_amount',100000,'final_amount',100000),
--   '[]'::jsonb, '[]'::jsonb);
--
-- Cleanup:
-- delete from public.orders where customer_name = 'Smoke';
