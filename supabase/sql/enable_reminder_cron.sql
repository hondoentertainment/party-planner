-- =============================================================
-- Party Planner — enable scheduled reminder + wrap-up emails
-- =============================================================
--
-- ONE-TIME SETUP for the `notify-event-reminder` and `notify-wrap-up` Edge
-- Functions added in migration 0011. This file is intentionally NOT a
-- migration so that scheduling is an explicit, opt-in step (we don't want
-- new branches / preview projects to start spamming production emails).
--
-- BEFORE YOU RUN THIS:
--   1. Apply migration 0011 (`npm run db:push`).
--   2. Deploy the two functions
--      (`npm run functions:deploy:reminders` and
--      `npm run functions:deploy:wrap-up`).
--   3. Set `REMINDER_CRON_SECRET`, `RESEND_API_KEY`, `FROM_EMAIL`,
--      and `APP_URL` via `supabase secrets set ...`. See OPERATIONS.md
--      §10 for the full list.
--   4. Replace the two placeholders below with real values.
--   5. Paste the entire file into Supabase → SQL Editor and run.
--
-- See `disable_reminder_cron.sql` to roll this back, and
-- `check_reminder_cron.sql` to confirm the jobs are scheduled.
--
-- TIMEZONE NOTE: pg_cron interprets schedules in UTC. The default
-- "0 9 * * *" fires daily at 09:00 UTC (~02:00 US/Pacific, ~05:00
-- US/Eastern). Adjust the cron strings if you'd rather batch later in the
-- guest's morning.

-- ====== STEP 1 — REPLACE THESE TWO PLACEHOLDERS ======
-- (a) The base URL for your project's Edge Functions.
--     Find it under Project Settings → API → Functions.
--     Format: https://<project-ref>.supabase.co/functions/v1
alter database postgres set "app.functions_url"
  = 'https://REPLACE_ME.supabase.co/functions/v1';

-- (b) The same secret you supplied to `supabase secrets set REMINDER_CRON_SECRET`.
--     Generate with `openssl rand -hex 32` if you haven't already.
alter database postgres set "app.reminder_cron_secret"
  = 'REPLACE_ME_with_a_64_char_hex_secret';

-- ====== STEP 2 — schedule the jobs ======
-- Idempotent: re-running this file is safe; pg_cron will refuse to insert a
-- duplicate jobname. To change the schedule, run `disable_reminder_cron.sql`
-- first, then re-run this with the updated cron string.

select cron.schedule(
  'notify-event-reminder-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := current_setting('app.functions_url') || '/notify-event-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Reminder-Secret', current_setting('app.reminder_cron_secret')
    )
  );
  $$
);

select cron.schedule(
  'notify-wrap-up-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := current_setting('app.functions_url') || '/notify-wrap-up',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Reminder-Secret', current_setting('app.reminder_cron_secret')
    )
  );
  $$
);

-- ====== STEP 3 — confirm both jobs landed ======
-- Either run `check_reminder_cron.sql` separately, or scroll to the result of
-- this final query.
select jobid, jobname, schedule, active
from cron.job
where jobname in ('notify-event-reminder-daily', 'notify-wrap-up-daily')
order by jobname;
