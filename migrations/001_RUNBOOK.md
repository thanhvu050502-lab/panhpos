# Migration 001 — Auth Migration Runbook

Follow these steps **in order**. Stop and ask if anything looks unexpected.

> ⚠️ **Run on STAGING first.** Verify everything works, then repeat on production.

---

## Step A — Configure Supabase Auth (Dashboard, ~3 min)

1. Open **Supabase Dashboard** → your project → **Authentication** → **Providers**.
2. Make sure **Email** is **enabled**.
3. Open **Authentication** → **Sign In / Up** (or "URL Configuration" depending on dashboard version) → find **Confirm email**:
   - Toggle **OFF** (we use synthetic `username@nailpos.local` emails; no inbox to confirm from).
4. Open **Authentication** → **Sign In / Up** → find **Allow new users to sign up**:
   - Toggle **OFF** (we don't want public signup; only Dashboard-added users).

> If you can't find a setting, search "auth signup" in the dashboard search bar.

---

## Step B — Run the SQL migration (Dashboard, ~1 min)

1. **Take a backup first**: Database → Backups → "Create backup" (free tier: download → keep file safe; Pro: PITR is automatic).
2. Open **SQL Editor** → **New query**.
3. Paste the entire contents of [`migrations/001_auth_members.sql`](001_auth_members.sql).
4. Click **Run**.
5. Run the verification queries at the bottom of the file:
   ```sql
   select count(*) from public.members;
   -- Should return 0 (no members yet)
   select relrowsecurity from pg_class where oid = 'public.members'::regclass;
   -- Should return true
   ```

---

## Step C — Create your owner account (Dashboard + SQL Editor, ~2 min)

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Fill in:
   - Email: `admin@nailpos.local` (synthetic — note the literal `@nailpos.local` suffix)
   - Password: pick a **new strong password** (NOT `Thanhvu05052002` — that one is burned)
   - Auto Confirm User: **YES** (since email confirmation is off, but verify)
3. Click **Create user**.
4. Copy the new user's **UID** (visible in the user list after creation).

5. Go back to **SQL Editor** → New query. Paste:
   ```sql
   -- Replace YOUR-UID-HERE with the UID you copied above
   insert into public.members (id, username, display_name, role)
   values ('YOUR-UID-HERE', 'admin', 'Admin', 'owner');
   ```
6. Run. You should see "Success. 1 row inserted".

   Alternative: log into the app first (after Step D code changes), then run:
   ```sql
   select public.bootstrap_owner('admin', 'Admin');
   ```
   from the SQL Editor. The function uses `auth.uid()` which is set by Supabase Studio when you're signed in to the dashboard, so this only works the FIRST time and only for the dashboard-signed-in user.

---

## Step D — Tell me you're done

Reply something like:
- "done with A, B, C — ready for code changes"
- or paste a screenshot of `select * from members;`

Then I refactor [src/hooks/useAuth.ts](../src/hooks/useAuth.ts) and the login flow to use Supabase Auth. After that:

## Step E — (After code changes) Smoke test

1. `npm run dev`
2. Open app → login screen (no setup screen if env vars are configured)
3. Type `admin` + your new password → click Đăng nhập
4. Should land on dashboard with `session.role = 'owner'`

## Step F — (Later) Adding more staff

For each staff member:
1. Dashboard → Authentication → Users → Add user → email `linh@nailpos.local` (etc.)
2. SQL Editor:
   ```sql
   insert into public.members (id, username, display_name, role)
   values ('THEIR-UID', 'linh', 'Linh', 'staff');
   ```

We'll build an in-app form for this later (audit item 1.2 finishing touches).

---

## Rollback

If anything breaks before code is deployed:
```sql
drop table if exists public.members cascade;
drop function if exists public.is_owner();
drop function if exists public.is_manager_or_owner();
drop function if exists public.bootstrap_owner(text, text);
drop function if exists public.touch_updated_at();
```
And delete the `admin@nailpos.local` user via Dashboard → Authentication → Users.

The app's existing localStorage-based auth still works at this point because the code refactor hasn't happened yet.
