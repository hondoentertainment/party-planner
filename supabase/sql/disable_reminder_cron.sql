-- =============================================================
-- Party Planner — disable scheduled reminder + wrap-up emails
-- =============================================================
--
-- Cleanly unschedules the two pg_cron jobs created by
-- `enable_reminder_cron.sql`. Safe to re-run; missing jobs are ignored.
--
-- This does NOT:
--   * delete the `event_reminder_log` table (so re-enabling later won't
--     re-send historical reminders);
--   * remove the `app.functions_url` / `app.reminder_cron_secret` GUCs
--     (they're harmless when no job references them);
--   * undeploy the Edge Functions or rotate `REMINDER_CRON_SECRET`.
--
-- After running this, no more scheduled emails will go out. Verify with
-- `check_reminder_cron.sql`.

do $$
begin
  perform cron.unschedule('notify-event-reminder-daily');
exception when undefined_object or invalid_parameter_value or others then
  raise notice 'notify-event-reminder-daily was not scheduled — skipping.';
end$$;

do $$
begin
  perform cron.unschedule('notify-wrap-up-daily');
exception when undefined_object or invalid_parameter_value or others then
  raise notice 'notify-wrap-up-daily was not scheduled — skipping.';
end$$;

select jobid, jobname, schedule, active
from cron.job
where jobname in ('notify-event-reminder-daily', 'notify-wrap-up-daily');
-- Expected: zero rows.
