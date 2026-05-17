-- Add is_hidden flag to members; default false to keep existing behavior.
-- When true, the member is filtered out of staff-selector dropdowns
-- (Order modal, Appointment modal, Shift opening) while remaining visible
-- in the Account Management panel for owners to manage.
alter table public.members
  add column if not exists is_hidden boolean not null default false;

create index if not exists members_is_hidden_idx on public.members(is_hidden);
