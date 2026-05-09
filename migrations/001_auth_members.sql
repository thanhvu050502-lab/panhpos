-- =====================================================================
-- 001 — Auth members table
-- =====================================================================
-- Goal: link every Supabase Auth user (auth.users) to a members row that
-- holds nailpos-specific fields (username, display_name, role).
--
-- After this migration, the app uses supabase.auth.signInWithPassword
-- and reads role/display_name from `members` keyed by auth.uid().
--
-- Run order: 1
-- =====================================================================

-- 1. Table -----------------------------------------------------------------
create table if not exists public.members (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text not null,
  role          text not null default 'staff'
                check (role in ('owner', 'manager', 'staff')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Keep updated_at fresh on every UPDATE
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists members_touch_updated_at on public.members;
create trigger members_touch_updated_at
  before update on public.members
  for each row execute function public.touch_updated_at();


-- 2. Enable RLS ------------------------------------------------------------
alter table public.members enable row level security;


-- 3. Policies --------------------------------------------------------------
-- Helper: is the caller an owner?
create or replace function public.is_owner()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.members
    where id = auth.uid() and role = 'owner'
  );
$$;

-- Helper: is the caller a manager or owner?
create or replace function public.is_manager_or_owner()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.members
    where id = auth.uid() and role in ('owner', 'manager')
  );
$$;

-- Read: any authenticated user can read all members
-- (needed for staff selector dropdowns, audit log display, etc.)
drop policy if exists members_read_all on public.members;
create policy members_read_all
  on public.members for select
  to authenticated
  using (true);

-- Insert: only owners can add new members. (App must first create the
-- auth.users row via supabase.auth.admin or signUp; then insert here.)
drop policy if exists members_insert_owner on public.members;
create policy members_insert_owner
  on public.members for insert
  to authenticated
  with check (public.is_owner());

-- Update: a user can update their own display_name. Owners can update
-- anything. (No one can change their own `role` or `id`.)
drop policy if exists members_update_self on public.members;
create policy members_update_self
  on public.members for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.members where id = auth.uid())
  );

drop policy if exists members_update_owner on public.members;
create policy members_update_owner
  on public.members for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- Delete: only owners. Deleting auth.users cascades and removes the row
-- automatically; this policy covers the case of removing the members
-- profile while keeping the auth user (rare, but possible).
drop policy if exists members_delete_owner on public.members;
create policy members_delete_owner
  on public.members for delete
  to authenticated
  using (public.is_owner());


-- 4. Bootstrap helper ------------------------------------------------------
-- After creating the FIRST auth.users row (your owner account) via the
-- Supabase Dashboard (Authentication -> Users -> Add user), run:
--
--   select public.bootstrap_owner('your-username', 'Display Name');
--
-- The function looks up auth.uid() of the caller and creates the matching
-- members row with role='owner'. It only works once — subsequent calls are
-- a no-op so it can't be used to escalate privilege.
create or replace function public.bootstrap_owner(p_username text, p_display_name text)
returns void language plpgsql security definer
set search_path = public as $$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Must be authenticated. Sign in first, then run from SQL Editor as that user.';
  end if;
  -- One-shot: only run if no owner exists yet.
  if exists (select 1 from public.members where role = 'owner') then
    raise exception 'An owner already exists; bootstrap has already been used.';
  end if;
  insert into public.members (id, username, display_name, role)
  values (v_uid, lower(p_username), p_display_name, 'owner');
end $$;


-- =====================================================================
-- VERIFICATION QUERIES (run each, expect non-empty result for the first,
-- "rls = true" for the second)
-- =====================================================================
-- select count(*) from public.members;
-- select relrowsecurity from pg_class where oid = 'public.members'::regclass;
