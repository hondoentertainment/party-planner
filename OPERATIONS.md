# Operations guide

This document covers **production** setup beyond local development: database migrations, hosting, monitoring, data safety, and optional web push / email.

## 0a. Standing operator checklist (recurring ops items)

These are the recurring operator items most likely to drift if no one is watching.
Re-check them on every release that touches migrations, edge functions, or branding.

| Item | When | How |
|------|------|-----|
| Run `supabase/verify_remote.sql` against production | After every migration batch (e.g. `0017`–`0019`) | Supabase → SQL Editor → paste the file → confirm every row is `OK` (or intentional `MISSING`). |
| Reminder + wrap-up cron healthy | Weekly while enabled | Run [`supabase/sql/check_reminder_cron.sql`](supabase/sql/check_reminder_cron.sql) — verify both jobs scheduled, no failed invocations in the last 24h. If you're holding off on the cron, document the deliberate "off" state (no action needed). |
| Sentry alerts firing on new issues + spikes | Quarterly verification | Sentry → Alerts → confirm rules exist for **new issue**, **regression**, and **volume spike** scoped to `environment:production` and `app:party-planner`. Re-test after each major release by triggering a synthetic error. |
| Sentry release tracking | Per deploy | `VITE_APP_RELEASE` is set automatically (Vite uses git SHA on Vercel/CI). Confirm Sentry → Releases shows the most recent commit. |
| Resend secret + sender domain still verified | Quarterly | `node scripts/check-resend-secret.mjs` (must exit 0); Resend dashboard → Domains. |
| Backup / recovery drill | Annual | Fill in §6 RTO / RPO / restore-path / owner / last-exercised. At minimum: `pg_dump` to local once a year and verify it restores into a scratch project. |
| Custom domain / Resend domain alignment | After any DNS change | If `APP_URL` or `VITE_PUBLIC_SITE_URL` changes, update Supabase Edge secrets and the Resend sender domain. Re-run the smoke workflow. |
| `SMOKE_URL` / `SMOKE_PATHS` repo variables current | After re-deploying or changing routes | `gh variable list` — `SMOKE_URL` should match the current public origin; the **Smoke** workflow runs automatically on Vercel `deployment_status` (production) and surfaces 4xx/5xx within minutes. |
| Regenerate the social card after a brand refresh | After tweaking gradients / wordmark | `npm run og:image` writes `public/og-image.png` (1200×630). Used by `/s/<token>` link previews via `middleware.ts`. |
| Migration order matches the directory listing | On every release that adds SQL | `supabase/migrations/` are applied lexically; never rename or re-number a shipped file. |
| Rate-limit + cover photo checks post-deploy | After `0020`–`0023` + first cover upload | `supabase/verify_remote.sql` rows 18–19 = rate limits OK; row 20 = `0023` OK. Upload a JPEG in **Edit event** and confirm URL is `…/storage/v1/object/public/event-covers/<event_id>/…`. |
| `/healthz` reachable on every deploy | Per deploy (auto via Smoke) | `curl -fsS https://<host>/healthz` should return `200 ok` with `Content-Type: text/plain`. Wired into `Smoke` workflow's default path list and into `vercel.json` (`Cache-Control: no-store`). External uptime monitors should target this path, not `/`. |
| CodeQL alerts triaged | On every push to `main` and weekly cron | GitHub → **Security → Code scanning**. Treat new `error`-severity alerts as merge blockers; `warning`-severity alerts get fixed during the next refactor of that file. Workflow file: [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml). |
| Dependabot PRs reviewed weekly | Mondays after 09:00 UTC | Grouped patch/minor PRs (eslint, types, tailwind, dnd-kit, sentry, workbox) should auto-merge after CI; major bumps (Vite, React, Supabase, Tailwind majors) land individually for manual review. Config: [`.github/dependabot.yml`](.github/dependabot.yml). |
| `npm audit` advisories | Per CI run | The CI workflow runs `npm audit --omit=dev --audit-level=high` non-blocking; review the job log when Dependabot lands a security PR. Strict-mode (fail on advisory) is opt-in only — flip `continue-on-error: false` in `.github/workflows/ci.yml` if you want to enforce it. |
| Production `VITE_SECURITY_CONTACT` set | Per deploy | If the env is unset, `dist/.well-known/security.txt` ships an RFC 2606 `.invalid` placeholder (`security-not-configured@invalid`) and the build prints a warning. Set a real `mailto:` or HTTPS endpoint on Vercel + GitHub Actions secrets before pushing to a custom domain. |

> **Future work tracked here, not in code:**
>
> - ~~Per-event dynamic OG image (`@vercel/og` route + CSP update). The static
>   1200×630 brand asset shipped at `public/og-image.png` is the safe interim.~~
>   **Shipped:** `/api/og?token=<token>` renders a per-event OG card with the
>   event's name, date, theme, cover emoji, gradient, and optional wide cover
>   photo when `cover_image_url` is set. Static
>   `public/og-image.png` is the fallback for unknown / revoked tokens.
> - ~~Switching `src/lib/database.types.ts` over to a checked-in
>   `database.types.gen.ts` to remove a class of drift bugs.~~ **Done:** schema
>   snapshot is `src/lib/database.types.gen.ts`; `database.types.ts` re-exports
>   it (refresh with `npm run db:types` and diff before commit).

## 0. v2 deploy checklist (run this once after pulling the UX redesign)

The latest set of changes ships several new flows that aren't live until you run the items below. Everything is idempotent. Skip any row marked **(optional)** if you don't want that flow.

| # | Step | Command (PowerShell-safe) |
|---|------|---------------------------|
| 1 | Apply migrations through the latest in `supabase/migrations/` (includes `0023_event_cover_photos.sql` for cover photos + Storage) | `npm run db:push` |
| 2 | Verify schema landed | Open Supabase → SQL Editor → paste `supabase/verify_remote.sql` |
| 3 | Deploy all notification Edge Functions | Includes **`notify-bug-report`** (maintainer email on new `bug_reports` rows when pg_net + `app.functions_url` are configured). Example: `npx supabase functions deploy notify-assignment notify-share notify-invite notify-wrap-up notify-event-reminder notify-bug-report` then `npx supabase functions deploy notify-unsubscribe notify-rsvp-recovery --no-verify-jwt`. Or use the `functions:deploy:*` npm scripts. |
| 4 | Set cron + unsubscribe secrets | `supabase secrets set REMINDER_CRON_SECRET="…" UNSUBSCRIBE_TOKEN_SECRET="…"` (64 hex chars each; e.g. `openssl rand -hex 32` or your preferred CSPRNG) |
| 5 | Set Resend + sender + public app URL | `supabase secrets set RESEND_API_KEY="re_…"`. Confirm `FROM_EMAIL` and `APP_URL` match production (§10). Without `RESEND_API_KEY`, `notify-*` functions **do not send mail**. **Verify:** `node scripts/check-resend-secret.mjs` (after `supabase link`) must exit 0. |
| 6 | Confirm secrets | `supabase secrets list` — expect `RESEND_API_KEY`, `FROM_EMAIL`, `APP_URL`, `REMINDER_CRON_SECRET`, `UNSUBSCRIBE_TOKEN_SECRET`, plus auto `SUPABASE_*`. |
| 7 | (optional) Enable daily reminder + wrap-up cron | `npm run sql:fill-reminder-cron` → edit `supabase/sql/enable_reminder_cron.generated.sql` (gitignored) → replace the remaining `REPLACE_ME_with_a_64_char_hex_secret` → paste into SQL Editor → run. Confirm with `supabase/sql/check_reminder_cron.sql`. |
| 8 | (optional) CI E2E user | `gh secret set E2E_EMAIL --body "…"` ; `gh secret set E2E_PASSWORD --body "…"` ; `gh secret set E2E_DISPLAY_NAME --body "…"` |
| 9 | (optional) Smoke-test RSVP recovery | Event → public RSVP with email → **Email me a recovery link** → open link in a private window → form pre-fills as an update |

After **step 7** (optional cron), guests on dated events receive T-7 / T-3 / T-1 digests. Unsubscribe links hit `notify-unsubscribe`, which responds with **302** to `/email/unsubscribe?...` on `APP_URL` so browsers always render a real page.

If you'd rather hold off on the cron, skip step 7 — manual share and RSVP recovery still work.

---

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
   - `supabase/migrations/0005_notification_settings_fallback.sql` (optional notification settings fallback for hosted projects where custom `app.*` GUCs cannot be updated from the CLI),
   - `supabase/migrations/0006_feature_expansion_mvp.sql` (notifications, budgets, vendors, templates, public share links, and wrap-ups),
   - `supabase/migrations/0007_production_hardening.sql` (server-generated public links and activity notifications),
   - `supabase/migrations/0008_public_share_details.sql` (guest-facing schedule, menu, drink, and music details),
   - …`0009`–`0019` as documented in this file,
   - `supabase/migrations/0020_rate_limit_email_and_reports.sql` (signed-in `bug_reports` 30/hour/user cap + 60s cool-down inside `request_rsvp_recovery` so `notify-rsvp-recovery` cannot burn Resend quota),
   - `supabase/migrations/0021_event_share_email_cooldown.sql` (60s cool-down on `event_share_links.last_emailed_at` so a JWT-gated caller cannot hammer `notify-share`; ships a tightly-scoped UPDATE policy + row trigger that lets editors touch only the cool-down column).
   - `supabase/migrations/0023_event_cover_photos.sql` (`events.cover_image_url`, public **`event-covers`** Storage bucket, editor-only writes, optional guest-page / OG hero photo).

After either approach, run **`supabase/verify_remote.sql`** in the SQL Editor for a quick read-only checklist (policies, `pg_net`, GUCs, feature tables, public share RPCs, and notification triggers).

If you use **assignment notifications** (`0002`):

- Enable the **pg_net** extension under **Database → Extensions**.
- Configure `app.functions_url` and `app.service_role_key` and deploy the `notify-assignment` Edge Function (see main **README**). If hosted Postgres rejects custom `app.*` overrides, use `0005_notification_settings_fallback.sql` and populate `private.app_settings`; `supabase/verify_remote.sql` accepts either path.

If you also want the **"Email me this link"** affordance for public share links:

- Deploy the second Edge Function with **`npm run functions:deploy:share`** (alias for `supabase functions deploy notify-share`). It reuses the existing `RESEND_API_KEY`, `FROM_EMAIL`, and `APP_URL` secrets — no extra secrets, GUCs, or migrations are required. The function is invoked directly from the client with the user's JWT and is RLS-gated against `events` + `event_share_links`.

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
   Production builds set **`VITE_APP_RELEASE`** via Vite (`party-planner@` + package version locally; on Vercel/GitHub Actions the git commit SHA is used when exposed as `VERCEL_GIT_COMMIT_SHA` or `GITHUB_SHA`, unless you override with `VITE_APP_RELEASE`).
3. Redeploy. Errors caught by the root `ErrorBoundary`, global `error` / `unhandledrejection` listeners, and manual bug reports will appear in Sentry (when DSN is set).
4. **Alerts & releases** — In Sentry, enable **issue alerts** (new issues, regressions, or volume spikes) for your production environment. Use **Releases** with the same `VITE_APP_RELEASE` / git SHA you deploy so you can compare errors across versions. Client events include the tag **`app:party-planner`** for filtering.
5. **CSP** — Production uses a strict **Content-Security-Policy** on Vercel (`vercel.json`). If you add a new third-party script or API host, update the policy. Self-hosted Plausible needs its script and API origin in `script-src` and `connect-src`.
6. **Bug reports (database)** — After `0014_bug_reports.sql` and `0015_bug_reports_public_and_notify.sql`, rows land in `public.bug_reports`. Signed-in users submit through RLS and only see their own rows; guests submit via `submit_public_bug_report` using a valid share token (same link gates as public RSVP). Apply `0017_public_bug_report_rate_limit.sql` so anonymous share pages cannot flood more than **20 reports per event per hour**. Optional **maintainer email:** when `app.functions_url` + `app.service_role_key` are configured (or `private.app_settings` fallback), each insert triggers pg_net → **`notify-bug-report`**. Set Supabase secret **`BUG_REPORT_NOTIFY_EMAIL`** for the inbox to receive alerts; if unset, the function derives a recipient from `FROM_EMAIL` (fine for solo operators, poor for `no-reply@`).
7. **Per-event reminder muting** — `0016_event_notification_mutes.sql` adds `event_notification_mutes` and updates `list_event_reminders_due` so collaborators can suppress scheduled reminder emails for one event without changing global opt-outs (`notification_opt_outs`). Members manage mutes in the app under **Event → Settings & Team → Reminder emails for this event**.
8. **Triage** — In Supabase → Table Editor → `bug_reports`, filter `status = open`, sort by `created_at`. The `context` jsonb is intentionally coarse: `source`, `route`, `user_agent`, `language`, `viewport` `{width,height,device_pixel_ratio}`, `timezone`, `online`, `sentry_event_id`, `app_mode`, `captured_at`, and for public-share paths `share_token_prefix` (first 8 characters of the token only). There are no passwords or full session tokens. Status changes and spam deletion are **service-role** or SQL today (the app does not expose an operator UI). Example **SQL** (SQL editor or `psql`): `select id, title, severity, status, created_at, context->>'source' as source from public.bug_reports where status = 'open' order by created_at desc limit 100;` — update with `update public.bug_reports set status = 'triaging' where id = '…';` when using the service role.

## 4. PWA (install and offline shell)

- Production builds include a service worker (via `vite-plugin-pwa`) and `manifest.webmanifest`. Users on supported browsers can **Install** the app; assets are precached for offline *shell* access. API calls (Supabase) still require the network.
- Regenerate install icons after changing `public/party.svg`: `npm run pwa:icons` (writes `public/icon-192.png` and `public/icon-512.png`; `sharp` is a devDependency).
- Regenerate the **social-share card** after a brand refresh (gradient / wordmark / accent): `npm run og:image` writes `public/og-image.png` (1200×630). The Edge middleware (`middleware.ts`) serves this as the `og:image` for every `/s/<token>` link preview, so iMessage / Slack / Twitter / Facebook all render `summary_large_image`. Without re-running the script after a brand change, link previews keep showing the previous palette.

## 5. Web push (browser notifications)

1. Generate VAPID keys: `npx web-push generate-vapid-keys` (or your preferred tool).
2. **Client:** set `VITE_VAPID_PUBLIC_KEY` in Vercel to the **public** key.
3. **Server:** in Supabase secrets for the Edge function, set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to the same pair. Optional: `VAPID_SUBJECT` as a `mailto:` contact URL for the Web Push protocol (the function has a default if unset).
4. Run `0003_web_push.sql` so `web_push_subscriptions` exists.
5. After deploy, use the in-app **Enable** banner; subscriptions are stored per user.

## 6. Backups and exports

- **Supabase Pro** and team plans include automated backups and **point-in-time recovery (PITR)** on supported tiers; confirm under **Project Settings → Database** what retention and restore windows your plan allows.
- On the **Free** tier, rely on **manual exports** and your own copy of critical data — do not assume the provider will restore a deleted project or row.
- For a **manual export**, use **Table Editor** → select tables → **Export** as CSV, or use `pg_dump` with the database connection string from the dashboard.
- For **full account portability**, plan periodic exports of `events` / `event_items` (and any other tables you care about) for critical parties.
- **Recovery drill (recommended):** once a year (or after major schema changes), document how you would restore from backup or re-seed staging, and how long that takes (**RTO**) vs how much data you could lose (**RPO**). For production incidents, define who can access the Supabase dashboard and service role keys.
- **Drill template (fill in for your org):**
  - **RTO target:** e.g. "App read-only ≤ 4h; full restore ≤ 24h."
  - **RPO target:** e.g. "≤ 1h of writes" (depends on backup/PITR tier).
  - **Restore path:** Supabase backup / PITR vs. redeploy app + `db:push` to empty project.
  - **Owner + backup:** who runs the restore and who has the service role key.
  - **Last exercised:** date of last test restore or table export.

## 7. E2E tests in CI

- GitHub Actions (`.github/workflows/ci.yml`) runs **`npm run verify`** (lint, build, Playwright on port 4291 by default) after installing browsers.
- Add repository secrets `E2E_EMAIL` and `E2E_PASSWORD` for a dedicated test user in your
  Supabase project so the signed-in tests (dashboard, new event, settings) are not skipped.
- **Local:** add the same two variables to `.env.local` (read by [playwright.config.ts](playwright.config.ts), not by Vite) and run `npm run verify` or `npm run ci` for a full pre-push check.
- Before promoting a release, also run `supabase/verify_remote.sql` against the target Supabase project and confirm every required row reports `OK`. Optional rows for email/web push may remain `MISSING` only when those features are intentionally disabled.
- **Post-deploy smoke (automatic + manual):** the **Smoke** workflow runs automatically on `deployment_status` for the **Production** environment (Vercel's GitHub integration fires this for every prod deploy). It also accepts `workflow_dispatch` for ad-hoc runs. Set the repository **variable** **`SMOKE_URL`** (origin or full URL, e.g. `https://your-app.vercel.app` — trailing slash is stripped); the workflow falls back to `deployment_status.target_url` when the variable is unset. By default it requests `/`, `/privacy`, and `/terms` (all must return 2xx/3xx). Override paths with repository **variable** **`SMOKE_PATHS`** (space-separated, e.g. `/ /privacy /terms /s/test-token`).

## 7a. Secret rotation runbook (annual)

Rotate the long-lived secrets below at least once a year, immediately after any suspected leak, and any time a person with access leaves the project. **Run `npm run ops:secrets-audit`** for an at-a-glance view of what is set in your shell vs what production needs.

| Secret | Where it lives | How to rotate | Blast radius |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → **Project Settings → API** + Edge function secrets + `app.service_role_key` GUC (or `private.app_settings` fallback) | Supabase dashboard → **Reset service role key**, then `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=…` for every project that uses it; re-run the GUC `alter database postgres set "app.service_role_key" = '…';` and redeploy any function that caches the value (`functions:deploy:*`). | All trigger emails, every Edge function, and pg_net cron jobs stop authenticating until updated. **Outage window during rotation is normal — do this in a maintenance slot.** |
| `REMINDER_CRON_SECRET` | `supabase secrets set` + pg_cron headers (`enable_reminder_cron.sql`) | `supabase secrets set REMINDER_CRON_SECRET="$(openssl rand -hex 32)"`, then re-run `supabase/sql/enable_reminder_cron.sql` with the new value. Old tokens stop working immediately. | Reminder + wrap-up cron stops sending until cron headers updated. No data loss; missed digests can be back-filled by clearing `event_reminder_log` rows for the relevant kinds. |
| `UNSUBSCRIBE_TOKEN_SECRET` | `supabase secrets set` only | `supabase secrets set UNSUBSCRIBE_TOKEN_SECRET="$(openssl rand -hex 32)"`. **All previously-emailed unsubscribe links stop working** — recipients must click a fresh email or use the in-app `/settings#notifications` toggles. | One-click unsubscribe links in older emails return an error page; users can still mute via the SPA. |
| `RESEND_API_KEY` | Resend dashboard + `supabase secrets set` | Resend → **API keys → revoke + create**, then `supabase secrets set RESEND_API_KEY="re_…"`. Until updated, every `notify-*` Edge function logs `resend.send_failed` (status 401). | All transactional emails stop until updated. No queue exists — missed emails are not retried. |
| Vercel project secrets (`VITE_*`) | Vercel → **Settings → Environment Variables** + GitHub Actions secrets (for CI parity) | Update both, then trigger a fresh deploy / CI run. `VITE_*` values are baked into the bundle — old deploys keep working until the next push. | Old bundles stay functional with old keys. New deploys pick up new keys. |

After every rotation:

1. Run `node scripts/check-resend-secret.mjs` (must exit 0).
2. Run `supabase/verify_remote.sql` (every row should still be `OK`).
3. Trigger the **Smoke** workflow (`gh workflow run smoke.yml`) and confirm all paths return 2xx/3xx.
4. Tail Edge function logs for ~30 minutes and grep for `"event":"resend.send_failed"` and `"event":"config.missing_env"` to catch any function that was missed.
5. Update §6 "Last exercised" date in this file (the dashboard never lies — write it down).

If you've not rotated in over a year, treat this as the first item on the next operations day.

## 8. Local development on OneDrive (Windows)

- If you clone this repo into a OneDrive-synced folder (e.g. `OneDrive\Desktop\Party Planner`), OneDrive may create transient sync artifacts that show up as untracked files in `git status` (`*.tmp`, `~$*`, `desktop.ini`, `Thumbs.db`, `Icon?`).
- The repo's `.gitignore` includes a "OneDrive / Windows sync markers" section that ignores these patterns so they don't pollute `git status` or accidentally land in commits.
- If a sync conflict file (e.g. `<name>-Kyle's PC.ts`) does appear, treat it as transient: close the file, let OneDrive resolve the conflict, then delete the duplicate before committing.

## 9. Checklist: new environment

- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in Vercel
- [ ] Migrations 0001–0008 applied as needed (`npm run db:push` after `supabase link`, or SQL Editor)
- [ ] Run `supabase/verify_remote.sql` in the SQL Editor once migrations and GUCs are in place
- [ ] `VITE_SENTRY_DSN` (optional)
- [ ] Migrations through `0017_public_bug_report_rate_limit.sql` applied if you want bug reports (`0014`–`0015`), rate-limited public share reports (`0017`), and per-event reminder muting (`0016`)
- [ ] `0020_rate_limit_email_and_reports.sql` applied (signed-in `bug_reports` capped at 30/hour/user; `request_rsvp_recovery` enforces a 60s cool-down on `last_sent_at` so `notify-rsvp-recovery` cannot be hammered to burn Resend quota)
- [ ] `0021_event_share_email_cooldown.sql` applied + `notify-share` re-deployed (`event_share_links.last_emailed_at` enforces a 60s cool-down so a compromised session cannot loop-call **Email me this link**)
- [ ] `0023_event_cover_photos.sql` applied (optional cover photo uploads: `events.cover_image_url` + **`event-covers`** Storage bucket; **Edit event** uploads a hero image for `/events/:id`, the public guest page, dashboard cards, and `/api/og` when the share token is valid)
- [ ] `VITE_VAPID_PUBLIC_KEY` (optional, for push)
- [ ] Resend + Edge `notify-assignment` + GUCs (optional, for email)
- [ ] Edge `notify-share` deployed (optional, enables **Email me this link** in Settings & Team)
- [ ] Migration `0013_notification_opt_outs.sql` applied + Edge `notify-unsubscribe` deployed + `UNSUBSCRIBE_TOKEN_SECRET` set (required if `notify-event-reminder` / `notify-wrap-up` are scheduled — see §10)
- [ ] `APP_URL` in Edge matches production URL
- [ ] `VITE_PUBLIC_SITE_URL` in Vercel / GitHub Actions (recommended — OG URLs and middleware)
- [ ] `VITE_PLAUSIBLE_DOMAIN` / script URL (optional)
- [ ] Custom domain and Resend domain alignment (if using custom email domain)
- [ ] GitHub Actions secrets `E2E_EMAIL` and `E2E_PASSWORD` (optional, so CI runs signed-in E2E)
- [ ] `VITE_SECURITY_CONTACT` in Vercel / CI (optional — RFC 9116 address baked into `security.txt` on build)
- [ ] `SMOKE_URL` + manual **Smoke** workflow after deploy (optional)

## 10. Reminder digests (T-7/T-3/T-1) and wrap-up nudges

> **TL;DR — flipping the cron on / off**
>
> The reminder + wrap-up emails are **off by default**. Three small SQL files
> under [`supabase/sql/`](./supabase/sql/) make it a one-paste toggle:
>
> | File | When to run | Effect |
> | --- | --- | --- |
> | [`enable_reminder_cron.sql`](./supabase/sql/enable_reminder_cron.sql) | Once you're confident you want production guests pinging Resend | Schedules both `pg_cron` jobs daily at 09:00 UTC. Replace the two `REPLACE_ME` placeholders first (functions URL + cron secret). |
> | [`disable_reminder_cron.sql`](./supabase/sql/disable_reminder_cron.sql) | If something looks off, or you're rotating secrets | Unschedules both jobs. Idempotent. Doesn't drop the dedup log so re-enabling later won't double-send. |
> | [`check_reminder_cron.sql`](./supabase/sql/check_reminder_cron.sql) | Anytime, read-only | Shows whether the jobs exist, the GUC values, the last 10 invocations, and how many emails the dedup log has recorded. |
>
> Paste any of them into **Supabase → SQL Editor**. They're **idempotent** —
> safe to re-run. The rest of this section walks through the underlying
> migration, function deploys, and secrets they assume.

Two service-role Edge Functions automate scheduled host emails. Both run on a
shared schedule (recommended: daily at **09:00 UTC**) and are **idempotent**:
they query the `public.list_event_reminders_due()` RPC, which already excludes
anything previously logged into `public.event_reminder_log`, and call
`public.mark_event_reminder_sent(...)` after each successful send.

- **`notify-event-reminder`** — sends every due reminder kind:
  - `pre_7d`, `pre_3d`, `pre_1d` to the **owner and every collaborator**
    (digest mentions unassigned tasks and guests who haven't RSVP'd)
  - `wrap_up_1d` to the **owner only** for events that ended ~24–48h ago
    and still have no `event_wrap_ups` row.
- **`notify-wrap-up`** — standalone variant that processes only the
  `wrap_up_1d` rows (useful for QA, or if you want to schedule wrap-up
  nudges separately from pre-event reminders).

The dedup table `public.event_reminder_log` is keyed by
`(event_id, user_id, reminder_kind)` so each user receives each reminder kind
exactly once per event.

### Deploy

1. Apply the migration (creates `event_reminder_log`,
   `list_event_reminders_due()`, and `mark_event_reminder_sent()`):
   ```bash
   npm run db:push
   ```
2. Deploy the two functions:
   ```bash
   npm run functions:deploy:reminders
   npm run functions:deploy:wrap-up
   ```
   Both functions perform their own auth (see "Secrets" below) so deploy with
   `--no-verify-jwt` if you want to invoke them without a Supabase JWT:
   ```bash
   npx supabase functions deploy notify-event-reminder --no-verify-jwt
   npx supabase functions deploy notify-wrap-up --no-verify-jwt
   ```

### Secrets

Set these via `supabase secrets set ...` (only `REMINDER_CRON_SECRET` is new;
the rest are already used by `notify-assignment` / `notify-share`):

| Secret | Notes |
| --- | --- |
| `RESEND_API_KEY` | Existing — Resend API key for transactional email. |
| `FROM_EMAIL` | Existing — e.g. `Party Planner <hi@yourdomain.com>`. |
| `APP_URL` | Existing — base URL for `/events/{id}` and `/events/{id}/wrap-up` deep links. |
| `SUPABASE_URL` | Provided automatically. |
| `SUPABASE_SERVICE_ROLE_KEY` | Provided automatically. Used to call the SECURITY DEFINER RPCs. |
| `REMINDER_CRON_SECRET` | **New.** Shared secret expected in the `X-Reminder-Secret` header. Generate with `openssl rand -hex 32`. |

```bash
supabase secrets set REMINDER_CRON_SECRET="$(openssl rand -hex 32)"
```

Each function accepts **either** of the following:

- `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` — used by the pg_cron
  example below.
- `X-Reminder-Secret: <REMINDER_CRON_SECRET>` — used by Supabase's hosted
  scheduled-function feature or any external scheduler (GitHub Actions, Cron
  Hub, etc.).

Anything else returns `401 Unauthorized`.

### Cron — option A: Supabase scheduled functions (CLI)

If your project has Supabase scheduled functions available:

```bash
supabase functions schedule create notify-event-reminder \
  --schedule "0 9 * * *" \
  --headers "X-Reminder-Secret=$REMINDER_CRON_SECRET"

supabase functions schedule create notify-wrap-up \
  --schedule "0 9 * * *" \
  --headers "X-Reminder-Secret=$REMINDER_CRON_SECRET"
```

(Replace `$REMINDER_CRON_SECRET` with the same value you set as a function
secret.)

### Cron — option B: pg_cron + pg_net (SQL Editor)

Requires the `pg_cron` and `pg_net` extensions (Supabase: **Database →
Extensions**).

The full schedule + GUC setup is canned in
[`supabase/sql/enable_reminder_cron.sql`](./supabase/sql/enable_reminder_cron.sql) —
open it, replace the two `REPLACE_ME` placeholders (functions URL + cron
secret), then paste into **Supabase → SQL Editor** and run. Both GUCs survive
restarts because they're stored on the database role.

To stop the schedule (rotating secrets, paused project, etc.) run
[`supabase/sql/disable_reminder_cron.sql`](./supabase/sql/disable_reminder_cron.sql) —
it `unschedule`s both jobs without dropping the dedup log so re-enabling
later won't re-send historical reminders.

To verify the jobs landed, the GUCs are set, and the last few invocations
succeeded, run [`supabase/sql/check_reminder_cron.sql`](./supabase/sql/check_reminder_cron.sql).

(If you'd rather use the existing `app.service_role_key` GUC instead of
`X-Reminder-Secret`, swap the `headers` block in `enable_reminder_cron.sql`
for `jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))`.)

### Verify

After the first scheduled run, check **Edge Functions → Logs** for a JSON
response like `{ "ok": true, "sent": N, "failed": M, "skipped": K }`. You can
also smoke-test from your shell:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/notify-event-reminder" \
  -H "X-Reminder-Secret: $REMINDER_CRON_SECRET"
```

### Local testing

```bash
npx supabase functions serve notify-event-reminder --no-verify-jwt
# in another shell:
curl -X POST http://localhost:54321/functions/v1/notify-event-reminder \
  -H "X-Reminder-Secret: $REMINDER_CRON_SECRET"
```

Set `RESEND_API_KEY`, `FROM_EMAIL`, `APP_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `REMINDER_CRON_SECRET` in `supabase/.env`
first. The functions accept `GET` for quick browser smoke tests too.

### Edge function structured logs

Every Edge Function under `supabase/functions/*` emits a single
`console.log` / `console.error` line per event in a stable JSON schema (see
[supabase/functions/_shared/log.ts](supabase/functions/_shared/log.ts)).
The intent is to make Resend / RPC / config failures *greppable* in the
**Supabase → Edge Functions → Logs** explorer (and forwardable to Logflare,
Datadog, BetterStack, etc.) without re-deriving the shape every time. The
schema is small on purpose:

```json
{
  "level": "info" | "warn" | "error",
  "fn": "notify-event-reminder",
  "event": "resend.send_failed",
  "ts": "2026-04-30T16:42:01.123Z",
  "status": 422,
  "error": "...",
  "recipientHash": "9f2b...",
  "context": { "event_id": "...", "kind": "pre_3d" }
}
```

Raw email addresses are **never** logged — recipients are sha256-hashed and
truncated to 12 hex chars (`recipientHash`), which is enough to correlate
related failures without leaking PII.

#### Useful queries

The Supabase log explorer accepts a SQL-ish `where` clause against
`event_message`. The functions emit one JSON object per line, so a JSON
extraction works directly.

**(a) All Resend failures in the last hour, across every function:**

```sql
select
  timestamp,
  event_message
from function_logs
where event_message like '%"event":"resend.send_failed"%'
  and timestamp > now() - interval '1 hour'
order by timestamp desc;
```

**(b) Success rate of `notify-event-reminder` over the last 24 hours
(counts of completed runs vs. failed rows):**

```sql
select
  count(*) filter (where event_message like '%"event":"run.complete"%') as runs_complete,
  count(*) filter (where event_message like '%"event":"row.failed"%')  as rows_failed,
  count(*) filter (where event_message like '%"event":"resend.send_failed"%') as resend_failed
from function_logs
where event_message like '%"fn":"notify-event-reminder"%'
  and timestamp > now() - interval '24 hours';
```

**(c) All uncaught exceptions across functions (last 7 days):**

```sql
select
  timestamp,
  event_message
from function_logs
where event_message like '%"event":"uncaught"%'
  and timestamp > now() - interval '7 days'
order by timestamp desc;
```

The schema is intentionally stable and Logflare-friendly — the same fields
(`level`, `fn`, `event`, `recipientHash`, `context`, `ts`) appear on every
line, so you can pipe Edge Function logs into Logflare / Datadog / a
warehouse later without back-filling. New events should follow the
`<surface>.<verb>` convention (e.g. `rpc.events_select_failed`,
`webpush.send_failed`) so dashboards stay grep-able.

### Unsubscribe (one-click + Settings UI)

Every `notify-event-reminder` and `notify-wrap-up` email now ships with a
signed one-click unsubscribe footer link, plus a "Manage all your email
preferences" deep link to `/settings#notifications`. The full plumbing is:

- **Migration `0013_notification_opt_outs.sql`** — adds
  `public.notification_opt_outs`, three RPCs (`is_user_opted_out`,
  `upsert_notification_opt_out`, `remove_notification_opt_out`), and
  re-issues `list_event_reminders_due()` so opted-out recipients silently
  drop out of the cron RPC's result set. Apply with:

  ```bash
  npm run db:push
  ```

  The existing pg_cron jobs continue to work unchanged — the patched RPC
  is what does the filtering, so you do **not** need to re-run
  `enable_reminder_cron.sql`.

- **Edge function `notify-unsubscribe`** — anonymous `GET /?token=...`
  endpoint that validates an HMAC-signed token, calls
  `upsert_notification_opt_out`, and returns a small inline-styled HTML
  confirmation page. Deploy with:

  ```bash
  npm run functions:deploy:unsubscribe
  ```

  (alias for `npx supabase functions deploy notify-unsubscribe --no-verify-jwt`)

- **Secret `UNSUBSCRIBE_TOKEN_SECRET`** — 32+ byte HMAC key used to sign
  the per-recipient tokens. Set it once in Supabase, then rotate at any
  time (existing tokens older than the rotation will start failing the
  verify step):

  ```bash
  supabase secrets set UNSUBSCRIBE_TOKEN_SECRET="$(openssl rand -hex 32)"
  ```

  If the secret isn't set, the reminder + wrap-up functions still send
  email but **omit** the unsubscribe footer (logged as a warning) so the
  feature degrades gracefully during rollout.

- **Settings UI** — `/settings#notifications` lists the four reminder
  kinds (T-7 / T-3 / T-1 / Post-party wrap-up) as checkboxes. Toggling a
  box inserts/deletes a row in `notification_opt_outs` directly via RLS
  (the table's policies scope every read/write to `auth.uid()`). A
  one-click `kind = 'all'` mute (set when a guest clicks the email
  unsubscribe link without specifying a kind) shows a banner with a
  "Lift global mute" button.

| Secret | Notes |
| --- | --- |
| `UNSUBSCRIBE_TOKEN_SECRET` | **New.** HMAC-SHA-256 key for one-click unsubscribe tokens. ≥ 32 bytes; rotate any time. |
