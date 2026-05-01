-- Party Planner — per-user, per-kind email opt-outs (CAN-SPAM compliance).
--
-- Backs the `notify-unsubscribe` Edge Function and the in-app
-- "Email reminder preferences" section of /settings. Stores one row per
-- (user_id, kind) the user has unsubscribed from. A row with kind = 'all'
-- silences every reminder kind for that user.
--
-- The MOST IMPORTANT change in this migration is the bottom block: we patch
-- `public.list_event_reminders_due()` (originally introduced in migration
-- 0011) so it filters out anyone with a matching opt-out row. The dedup log
-- (`event_reminder_log`) keeps track of *what was already sent*; this table
-- keeps track of *what should never be sent*. They compose cleanly: opted-out
-- recipients silently drop out of the RPC's result set, and `notify-event-
-- reminder` / `notify-wrap-up` need no code change to honour them.
--
-- See OPERATIONS.md §10 ("Unsubscribe") for secret + deploy steps.

-- =============================================================
-- 1. notification_opt_outs — one row per (user, kind) the user muted
-- =============================================================
create table if not exists public.notification_opt_outs (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('pre_7d', 'pre_3d', 'pre_1d', 'wrap_up_1d', 'all')),
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);

create index if not exists notification_opt_outs_user_idx
  on public.notification_opt_outs(user_id);

alter table public.notification_opt_outs enable row level security;

-- Lock anon out completely; let authenticated users manage their own rows
-- (so the Settings UI can insert/delete directly without an extra RPC).
revoke all on public.notification_opt_outs from anon;
grant select, insert, delete on public.notification_opt_outs to authenticated;

drop policy if exists "Users see own opt-outs" on public.notification_opt_outs;
create policy "Users see own opt-outs"
  on public.notification_opt_outs
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users insert own opt-outs" on public.notification_opt_outs;
create policy "Users insert own opt-outs"
  on public.notification_opt_outs
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users delete own opt-outs" on public.notification_opt_outs;
create policy "Users delete own opt-outs"
  on public.notification_opt_outs
  for delete
  to authenticated
  using (user_id = auth.uid());

-- service_role bypasses RLS, so it can read/write on behalf of the
-- one-click unsubscribe endpoint without needing an explicit policy.

-- =============================================================
-- 2. is_user_opted_out(_user_id, _kind) — convenience boolean
-- =============================================================
-- Returns true when an opt-out exists for the exact kind, OR a global
-- opt-out (kind = 'all') exists. Used by application code that wants to
-- short-circuit before composing an email; the cron RPC below filters
-- automatically.
create or replace function public.is_user_opted_out(
  _user_id uuid,
  _kind text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.notification_opt_outs o
    where o.user_id = _user_id
      and o.kind in (_kind, 'all')
  );
$$;

revoke all on function public.is_user_opted_out(uuid, text)
  from public, anon;
grant execute on function public.is_user_opted_out(uuid, text)
  to authenticated, service_role;

-- =============================================================
-- 3. upsert_notification_opt_out — service-role one-click handler
-- =============================================================
-- Called by `notify-unsubscribe` after verifying the HMAC token. The token
-- already proves intent for a specific (user, kind) pair, so we run as
-- SECURITY DEFINER and accept the user_id directly. ON CONFLICT DO NOTHING
-- makes repeated clicks (bots, "preview" link prefetchers) idempotent.
create or replace function public.upsert_notification_opt_out(
  _user_id uuid,
  _kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _user_id is null then
    raise exception 'user_id is required';
  end if;
  if _kind is null
     or _kind not in ('pre_7d', 'pre_3d', 'pre_1d', 'wrap_up_1d', 'all') then
    raise exception 'invalid kind: %', _kind;
  end if;

  insert into public.notification_opt_outs (user_id, kind)
  values (_user_id, _kind)
  on conflict (user_id, kind) do nothing;
end;
$$;

revoke all on function public.upsert_notification_opt_out(uuid, text)
  from public, anon, authenticated;
grant execute on function public.upsert_notification_opt_out(uuid, text)
  to service_role;

-- =============================================================
-- 4. remove_notification_opt_out — invoker-side re-enable
-- =============================================================
-- Called by the Settings UI when a user unchecks an opt-out. Runs as the
-- caller (not SECURITY DEFINER) so RLS naturally restricts deletion to the
-- caller's own rows. (The Settings UI may also delete directly via the
-- authenticated client; this RPC is provided for parity / readability.)
create or replace function public.remove_notification_opt_out(_kind text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  delete from public.notification_opt_outs
  where user_id = auth.uid()
    and kind = _kind;
end;
$$;

revoke all on function public.remove_notification_opt_out(text)
  from public, anon;
grant execute on function public.remove_notification_opt_out(text)
  to authenticated;

-- =============================================================
-- 5. PATCH list_event_reminders_due — exclude opted-out recipients
-- =============================================================
-- This SHADOWS the version from migration 0011. The body is identical
-- except for the trailing NOT EXISTS subquery against notification_opt_outs.
-- Using `create or replace` with the exact same signature means cron jobs
-- and Edge Functions that already call this RPC pick up the new behaviour
-- automatically — no redeploy required.
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
  )
  -- NEW (0013): drop anyone who opted out of this kind (or all kinds).
  and not exists (
    select 1
    from public.notification_opt_outs o
    where o.user_id = d.user_id
      and o.kind in (d.reminder_kind, 'all')
  );
$$;

-- Re-affirm the original 0011 grant — `create or replace` preserves grants,
-- but being explicit keeps this migration self-documenting if it ever runs
-- against a project where 0011 was applied out-of-band.
revoke all on function public.list_event_reminders_due(timestamptz)
  from public, anon, authenticated;
grant execute on function public.list_event_reminders_due(timestamptz)
  to service_role;
