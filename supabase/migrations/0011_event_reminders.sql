-- Party Planner — scheduled event reminders + wrap-up nudges
--
-- Backs the `notify-event-reminder` and `notify-wrap-up` Edge Functions.
-- Provides:
--   * public.event_reminder_log    — per-(event, user, reminder_kind) dedupe row
--   * public.list_event_reminders_due(_now)  — RPC the Edge Function reads
--   * public.mark_event_reminder_sent(...)   — RPC the Edge Function writes
--
-- Both RPCs are SECURITY DEFINER and grantable to service_role only. The
-- log table is RLS-locked; service_role bypasses RLS to read/write it.
--
-- See OPERATIONS.md "Reminder digests (T-7/T-3/T-1) and wrap-up nudges"
-- for the cron / pg_net / secret setup.

-- =============================================================
-- 1. event_reminder_log — one row per (event, user, kind) sent
-- =============================================================
create table if not exists public.event_reminder_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_kind text not null,
  sent_at timestamptz not null default now(),
  unique (event_id, user_id, reminder_kind)
);

create index if not exists event_reminder_log_event_idx
  on public.event_reminder_log(event_id);

alter table public.event_reminder_log enable row level security;

-- Service-role only: no policies for anon/authenticated. Service role bypasses RLS.
revoke all on public.event_reminder_log from anon, authenticated;

-- =============================================================
-- 2. list_event_reminders_due(_now) — rows the Edge Function should send
-- =============================================================
-- Returns one row per (event, user, reminder_kind) that:
--   - matches one of the pre-event windows (T-7d, T-3d, T-1d) for the owner
--     AND every collaborator on that event, OR
--   - matches the wrap-up window (event ended 24-48h ago, no event_wrap_ups
--     row yet) for the owner only,
--   - and has NOT already been logged into event_reminder_log.
--
-- The windows are intentionally ~24h wide so an hourly cron picks each
-- event up at least once. The unique log row guarantees only one send.

create or replace function public.list_event_reminders_due(_now timestamptz default now())
returns table (
  event_id uuid,
  user_id uuid,
  email text,
  display_name text,
  event_name text,
  starts_at timestamptz,
  reminder_kind text
)
language sql
security definer
stable
set search_path = public
as $$
  with windows as (
    -- Each pre-event window is a 24h slice centered on the target day.
    select 'pre_7d'::text as kind,
           _now + interval '6 days 12 hours' as win_start,
           _now + interval '7 days 12 hours' as win_end
    union all
    select 'pre_3d',
           _now + interval '2 days 12 hours',
           _now + interval '3 days 12 hours'
    union all
    select 'pre_1d',
           _now + interval '12 hours',
           _now + interval '1 day 12 hours'
  ),
  pre_owner as (
    select e.id as event_id,
           e.owner_id as user_id,
           e.name as event_name,
           e.starts_at,
           w.kind as reminder_kind
    from public.events e
    cross join windows w
    where e.archived = false
      and e.starts_at is not null
      and e.starts_at >= w.win_start
      and e.starts_at < w.win_end
  ),
  pre_collab as (
    select e.id as event_id,
           c.user_id,
           e.name as event_name,
           e.starts_at,
           w.kind as reminder_kind
    from public.events e
    join public.event_collaborators c on c.event_id = e.id
    cross join windows w
    where e.archived = false
      and e.starts_at is not null
      and e.starts_at >= w.win_start
      and e.starts_at < w.win_end
      and c.user_id is not null
      and c.user_id <> e.owner_id
  ),
  wrap as (
    select e.id as event_id,
           e.owner_id as user_id,
           e.name as event_name,
           e.starts_at,
           'wrap_up_1d'::text as reminder_kind
    from public.events e
    where e.archived = false
      and e.starts_at is not null
      and e.starts_at >= _now - interval '48 hours'
      and e.starts_at < _now - interval '24 hours'
      and not exists (
        select 1 from public.event_wrap_ups w where w.event_id = e.id
      )
  ),
  due as (
    -- UNION (not UNION ALL) collapses any duplicate (event, user, kind)
    -- rows that could come from a user being both owner and collaborator.
    select * from pre_owner
    union
    select * from pre_collab
    union
    select * from wrap
  )
  select
    d.event_id,
    d.user_id,
    coalesce(au.email, p.email) as email,
    p.display_name,
    d.event_name,
    d.starts_at,
    d.reminder_kind
  from due d
  left join public.profiles p on p.id = d.user_id
  left join auth.users au on au.id = d.user_id
  where not exists (
    select 1
    from public.event_reminder_log l
    where l.event_id = d.event_id
      and l.user_id = d.user_id
      and l.reminder_kind = d.reminder_kind
  );
$$;

-- =============================================================
-- 3. mark_event_reminder_sent — idempotent insert into the log
-- =============================================================
create or replace function public.mark_event_reminder_sent(
  _event_id uuid,
  _user_id uuid,
  _reminder_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.event_reminder_log (event_id, user_id, reminder_kind)
  values (_event_id, _user_id, _reminder_kind)
  on conflict (event_id, user_id, reminder_kind) do nothing;
end;
$$;

-- =============================================================
-- 4. Permissions: service_role only
-- =============================================================
revoke all on function public.list_event_reminders_due(timestamptz)
  from public, anon, authenticated;
grant execute on function public.list_event_reminders_due(timestamptz)
  to service_role;

revoke all on function public.mark_event_reminder_sent(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_event_reminder_sent(uuid, uuid, text)
  to service_role;
