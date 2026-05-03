-- Party Planner — per-event scheduled-reminder muting.
--
-- Lets a collaborator mute T-7 / T-3 / T-1 / wrap-up emails for one event
-- without changing global notification_opt_outs. Patches
-- list_event_reminders_due() the same way migration 0013 layers opt-outs.

-- ------------------------------------------------------------
-- event_notification_mutes — one row per (user, event, kind) muted
-- ------------------------------------------------------------
create table if not exists public.event_notification_mutes (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('pre_7d', 'pre_3d', 'pre_1d', 'wrap_up_1d', 'all')),
  created_at timestamptz not null default now(),
  primary key (user_id, event_id, kind)
);

create index if not exists event_notification_mutes_event_idx
  on public.event_notification_mutes(event_id);

create index if not exists event_notification_mutes_user_idx
  on public.event_notification_mutes(user_id);

alter table public.event_notification_mutes enable row level security;

revoke all on public.event_notification_mutes from anon;
grant select, insert, delete on public.event_notification_mutes to authenticated;

drop policy if exists "Members see own event mutes" on public.event_notification_mutes;
create policy "Members see own event mutes"
  on public.event_notification_mutes
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_event_member(event_id)
  );

drop policy if exists "Members insert own event mutes" on public.event_notification_mutes;
create policy "Members insert own event mutes"
  on public.event_notification_mutes
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_event_member(event_id)
  );

drop policy if exists "Members delete own event mutes" on public.event_notification_mutes;
create policy "Members delete own event mutes"
  on public.event_notification_mutes
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_event_member(event_id)
  );

-- ------------------------------------------------------------
-- PATCH list_event_reminders_due — exclude per-event mutes
-- ------------------------------------------------------------
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
  and not exists (
    select 1
    from public.notification_opt_outs o
    where o.user_id = d.user_id
      and o.kind in (d.reminder_kind, 'all')
  )
  and not exists (
    select 1
    from public.event_notification_mutes m
    where m.user_id = d.user_id
      and m.event_id = d.event_id
      and m.kind in (d.reminder_kind, 'all')
  );
$$;

revoke all on function public.list_event_reminders_due(timestamptz)
  from public, anon, authenticated;
grant execute on function public.list_event_reminders_due(timestamptz)
  to service_role;
