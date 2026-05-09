# Supabase Migrations

SQL files in this folder are run **manually** in the Supabase SQL Editor.
Run them in numeric order. Each file is idempotent where possible (uses
`if not exists` / `or replace`) so re-running is safe.

## How to run

1. Open Supabase Dashboard → SQL Editor → New query
2. Paste the contents of the next un-applied migration
3. Click **Run**
4. Verify with the "verification queries" at the bottom of each file

## Order

| # | File | Purpose | Status |
|---|------|---------|--------|
| 001 | `001_auth_members.sql` | Create `members` table linking Supabase Auth users to roles + RLS | pending |

## Notes
- These files assume **Supabase Auth (email + password)** is enabled in your project.
- Always run on a **staging** project first.
- Take a manual backup before running on production (Database → Backups → Create backup).
