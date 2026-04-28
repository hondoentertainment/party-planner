# Operations guide

This document covers **production** setup beyond local development: database migrations, hosting, monitoring, data safety, and optional web push / email.

## 1. Run database migrations in Supabase (production)

### Option A — Supabase CLI (recommended)

1. Install and log in: `npm i -g supabase` then `supabase login`.
2. From the repo root: `supabase link --project-ref <your-project-ref>`.
3. Apply migrations: `npm run db:push` (runs `supabase db push` using `supabase/migrations/`).
4. Confirm Postgres major version in `supabase/config.toml` (`[db] major_version`) matches your project (**Database → Settings** or `select version();`); adjust if the CLI reports a version mismatch.

### Option B — SQL Editor

1. Open your Supabase project → **SQL Editor**.
2. In order, run the contents of:
   - `supabase/migrations/0001_init.sql` (if you have not already),
   - `supabase/migrations/0004_collaborator_self_delete.sql` (so collaborators can leave an event)
   - `supabase/migrations/0002_notifications.sql` (assignment email trigger — optional),
   - `supabase/migrations/0003_web_push.sql` (web push subscription storage — optional),
   - `supabase/migrations/0005_notification_settings_fallback.sql` (optional notification settings fallback for hosted projects where custom `app.*` GUCs cannot be updated from the CLI).

After either approach, run **`supabase/verify_remote.sql`** in the SQL Editor for a quick read-only checklist (policies, `pg_net`, GUCs, web push table).

If you use **assignment notifications** (`0002`):

- Enable the **pg_net** extension under **Database → Extensions**.
- Configure `app.functions_url` and `app.service_role_key` and deploy the `notify-assignment` Edge Function (see main **README**). If hosted Postgres rejects custom `app.*` overrides, use `0005_notification_settings_fallback.sql` and populate `private.app_settings`; `supabase/verify_remote.sql` accepts either path.

Re-check **Table Editor** and **RLS** if anything failed mid-run; migrations use `if not exists` / `drop policy` patterns where possible.

**Verify `0004` (collaborator self-delete) is applied** — in the SQL editor:

```sql
select policyname
from pg_policies
where schemaname = 'public'
  and tablename = 'event_collaborators'
  and policyname = 'Collaborators can remove own membership';
```

If this returns a row, non-owners can use **Leave event** in the app. If it returns nothing, run `0004_collaborator_self_delete.sql`.

## 2. Custom domain (Vercel)

1. In [Vercel](https://vercel.com) → your project → **Settings → Domains** → add your domain and follow DNS instructions.
2. Set environment variables to match the public URL:
   - In **Vercel** (app): no change to `VITE_*` if you use the same project URL; rebuild after domain change if you hard-code URLs in Edge secrets.
3. In **Supabase** Edge Function secrets, set `APP_URL` to `https://yourdomain.com` (emails and push “open app” links).
4. In **Resend**, add and verify the same domain for `FROM_EMAIL` to avoid deliverability issues.

## 3. Sentry (error monitoring)

1. Create a project in [Sentry](https://sentry.io) for a browser/React app.
2. Add the client DSN to Vercel (and `.env.local` for local): `VITE_SENTRY_DSN=https://...`
3. Redeploy. Errors caught by the root `ErrorBoundary` and `captureException` will appear in Sentry (when DSN is set).

## 4. PWA (install and offline shell)

- Production builds include a service worker (via `vite-plugin-pwa`) and `manifest.webmanifest`. Users on supported browsers can **Install** the app; assets are precached for offline *shell* access. API calls (Supabase) still require the network.
- You can add larger icons (`192x192` / `512x512` PNG) under `public/` and reference them in `vite.config.ts` for broader install prompts.

## 5. Web push (browser notifications)

1. Generate VAPID keys: `npx web-push generate-vapid-keys` (or your preferred tool).
2. **Client:** set `VITE_VAPID_PUBLIC_KEY` in Vercel to the **public** key.
3. **Server:** in Supabase secrets for the Edge function, set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to the same pair. Optional: `VAPID_SUBJECT` as a `mailto:` contact URL for the Web Push protocol (the function has a default if unset).
4. Run `0003_web_push.sql` so `web_push_subscriptions` exists.
5. After deploy, use the in-app **Enable** banner; subscriptions are stored per user.

## 6. Backups and exports

- **Supabase Pro** and team plans include automated backups; confirm under **Project Settings → Database** what retention you have on your plan.
- For a **manual export**, use **Table Editor** → select tables → **Export** as CSV, or use `pg_dump` with the database connection string from the dashboard.
- For **full account portability**, plan periodic exports of `events` / `event_items` (and any other tables you care about) for critical parties.

## 7. E2E tests in CI

- GitHub Actions (`.github/workflows/ci.yml`) runs **`npm run verify`** (lint, build, Playwright on port 4291 by default) after installing browsers.
- Add repository secrets `E2E_EMAIL` and `E2E_PASSWORD` for a dedicated test user in your
  Supabase project so the signed-in tests (dashboard, new event, settings) are not skipped.
- **Local:** add the same two variables to `.env.local` (read by [playwright.config.ts](playwright.config.ts), not by Vite) and run `npm run verify` or `npm run ci` for a full pre-push check.

## 8. Checklist: new environment

- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in Vercel
- [ ] Migrations 0001, 0004, 0002–0003, and 0005 as needed (`npm run db:push` after `supabase link`, or SQL Editor)
- [ ] Run `supabase/verify_remote.sql` in the SQL Editor once migrations and GUCs are in place
- [ ] `VITE_SENTRY_DSN` (optional)
- [ ] `VITE_VAPID_PUBLIC_KEY` (optional, for push)
- [ ] Resend + Edge `notify-assignment` + GUCs (optional, for email)
- [ ] `APP_URL` in Edge matches production URL
- [ ] Custom domain and Resend domain alignment (if using custom email domain)
- [ ] GitHub Actions secrets `E2E_EMAIL` and `E2E_PASSWORD` (optional, so CI runs signed-in E2E)
