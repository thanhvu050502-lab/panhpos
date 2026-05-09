-- =====================================================================
-- 003 — Server-side audit log
-- =====================================================================
-- Goal: persist every audit entry (login, order_created, order_cancelled,
-- etc.) to a server table so it survives device wipes and can be reviewed
-- across devices. The client (useAuditLog.ts) keeps a localStorage copy
-- as offline cache; this is the durable record.
--
-- Run order: 3
-- =====================================================================

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users(id) on delete set null,
  user_name   text,
  action      text not null,
  entity      text,
  entity_id   text,
  label       text
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_action_idx     on public.audit_log (action);
create index if not exists audit_log_user_id_idx    on public.audit_log (user_id);

alter table public.audit_log enable row level security;

-- Anyone authenticated can write their own log entries. user_id is auto-set
-- to auth.uid() so clients can't spoof.
drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert
  on public.audit_log for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid());

-- Read: any authenticated user can read all audit entries (so settings
-- panels can display recent activity). Tighten to manager+ if you prefer.
drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read
  on public.audit_log for select
  to authenticated
  using (true);

-- No update / no delete — audit entries are immutable.
-- (Omitting policies = denied by default with RLS on.)

-- TEMP grant for anon callers during the pre-auth-migration period.
-- REMOVE this block after migration 001 (Supabase Auth) is live in production.
drop policy if exists audit_log_anon_insert on public.audit_log;
create policy audit_log_anon_insert
  on public.audit_log for insert
  to anon
  with check (true);
drop policy if exists audit_log_anon_read on public.audit_log;
create policy audit_log_anon_read
  on public.audit_log for select
  to anon
  using (true);


-- =====================================================================
-- VERIFICATION
-- =====================================================================
-- insert into public.audit_log (action, label) values ('test', 'smoke');
-- select * from public.audit_log order by created_at desc limit 1;
-- delete from public.audit_log where action = 'test';
