-- =============================================================
-- Party Planner — check reminder + wrap-up cron status
-- =============================================================
--
-- Read-only diagnostics. Paste into Supabase → SQL Editor.

-- 1. Are the two jobs scheduled?
--    Expect zero rows when disabled, two rows when enabled
--    (notify-event-reminder-daily + notify-wrap-up-daily).
select jobid, jobname, schedule, active
from cron.job
where jobname in ('notify-event-reminder-daily', 'notify-wrap-up-daily')
order by jobname;

-- 2. The two GUCs the schedules read at runtime. Either being NULL means
--    the cron job will fail with a clear error in cron.job_run_details.
select
  current_setting('app.functions_url', true)        as app_functions_url,
  case
    when current_setting('app.reminder_cron_secret', true) is null then null
    else 'set (' || length(current_setting('app.reminder_cron_secret', true)) || ' chars)'
  end as app_reminder_cron_secret;

-- 3. Last 10 cron invocations (success or failure). Useful when a job is
--    scheduled but you suspect emails aren't going out.
select
  rd.jobid,
  j.jobname,
  rd.start_time,
  rd.status,
  rd.return_message
from cron.job_run_details rd
join cron.job j on j.jobid = rd.jobid
where j.jobname in ('notify-event-reminder-daily', 'notify-wrap-up-daily')
order by rd.start_time desc
limit 10;

-- 4. Sanity-check the dedup log: how many emails have been sent and when?
--    If this stays at zero after a successful run, check the Edge Function
--    logs for an upstream error (Resend, missing FROM_EMAIL, etc.).
select
  reminder_kind,
  count(*) as sent_count,
  max(sent_at) as most_recent
from public.event_reminder_log
group by reminder_kind
order by reminder_kind;
