-- Party Planner — production hardening for MVP expansion
-- Keep public sharing token-gated, server-generated, and deliberately scoped.

alter table public.event_share_links
  add column if not exists revoked_at timestamptz;

drop policy if exists "Editors can insert share links" on public.event_share_links;
drop policy if exists "Members can view share links" on public.event_share_links;

create policy "Editors can view share links"
  on public.event_share_links for select to authenticated
  using (public.can_edit_event(event_id));

create or replace function public.create_event_share_link(_event_id uuid, _label text default 'Public guest page')
returns public.event_share_links
language plpgsql
security definer
set search_path = public
as $$
declare
  _row public.event_share_links%rowtype;
  _token text;
begin
  if not public.can_edit_event(_event_id) then
    raise exception 'You do not have permission to share this event';
  end if;

  update public.event_share_links
  set enabled = false,
      revoked_at = coalesce(revoked_at, now())
  where event_id = _event_id
    and enabled = true
    and revoked_at is null;

  loop
    begin
      _token := left(
        replace(gen_random_uuid()::text, '-', '') ||
        replace(gen_random_uuid()::text, '-', ''),
        48
      );

      insert into public.event_share_links(event_id, token, label, created_by)
      values (_event_id, _token, coalesce(nullif(_label, ''), 'Public guest page'), auth.uid())
      returning * into _row;

      return _row;
    exception when unique_violation then
      -- Practically impossible, but retry to keep the function deterministic.
    end;
  end loop;
end;
$$;

revoke all on function public.create_event_share_link(uuid, text) from public;
grant execute on function public.create_event_share_link(uuid, text) to authenticated;

create or replace function public.get_public_event_share(_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  _link public.event_share_links%rowtype;
  _event public.events%rowtype;
  _items jsonb;
  _rsvp_summary jsonb;
begin
  select *
    into _link
  from public.event_share_links
  where token = _token
    and enabled = true
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if _link.id is null then
    return null;
  end if;

  select * into _event from public.events where id = _link.event_id;

  select jsonb_build_object(
    'yes', count(*) filter (where coalesce(meta->>'rsvp', 'pending') = 'yes'),
    'maybe', count(*) filter (where coalesce(meta->>'rsvp', 'pending') = 'maybe'),
    'no', count(*) filter (where coalesce(meta->>'rsvp', 'pending') = 'no'),
    'pending', count(*) filter (where coalesce(meta->>'rsvp', 'pending') = 'pending')
  )
  into _rsvp_summary
  from public.event_items
  where event_id = _event.id
    and kind = 'guest';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'kind', kind,
      'phase', phase,
      'title', title,
      'description', description,
      'due_at', due_at,
      'position', position,
      'meta', '{}'::jsonb
    )
    order by position asc, created_at asc
  ), '[]'::jsonb)
  into _items
  from public.event_items
  where event_id = _event.id
    and kind in ('task', 'food', 'beverage', 'music');

  return jsonb_build_object(
    'event', jsonb_build_object(
      'id', _event.id,
      'name', _event.name,
      'description', _event.description,
      'theme', _event.theme,
      'starts_at', _event.starts_at,
      'ends_at', _event.ends_at,
      'location', _event.location,
      'partiful_url', _event.partiful_url,
      'rsvp_count', _event.rsvp_count,
      'cover_emoji', _event.cover_emoji,
      'cover_color', _event.cover_color
    ),
    'items', _items,
    'rsvp_summary', coalesce(_rsvp_summary, jsonb_build_object('yes', 0, 'maybe', 0, 'no', 0, 'pending', 0))
  );
end;
$$;

grant execute on function public.get_public_event_share(text) to anon, authenticated;

create or replace function public.create_activity_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_notifications(user_id, event_id, actor_id, title, body, url)
  select user_id, new.event_id, new.actor_id, 'Event update', new.message, '/events/' || new.event_id
  from (
    select e.owner_id as user_id
    from public.events e
    where e.id = new.event_id
    union
    select c.user_id
    from public.event_collaborators c
    where c.event_id = new.event_id
  ) members
  where user_id is not null
    and user_id is distinct from new.actor_id;
  return new;
exception when others then
  raise warning 'create_activity_notifications failed: %', sqlerrm;
  return new;
end;
$$;
