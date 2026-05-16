-- Public share security hardening.
--
-- Repairs the 0023 public-share RPC regression by restoring the guest-safe
-- item projection and share-link expiry check while preserving cover photos
-- and host display metadata.

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
  if _event.id is null then
    return null;
  end if;

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
      'event_id', event_id,
      'kind', kind,
      'phase', phase,
      'title', title,
      'description', description,
      'status', status,
      'assignee_id', null,
      'due_at', due_at,
      'position', position,
      'created_at', created_at,
      'updated_at', updated_at,
      'created_by', null,
      'meta',
        case kind
          when 'food' then jsonb_strip_nulls(jsonb_build_object(
            'course', meta->>'course',
            'dietary', coalesce(meta->'dietary', '[]'::jsonb),
            'servings', meta->'servings'
          ))
          when 'beverage' then jsonb_strip_nulls(jsonb_build_object(
            'type', meta->>'type',
            'qty', meta->'qty',
            'unit', meta->>'unit',
            'alcoholic', meta->'alcoholic'
          ))
          when 'music' then jsonb_strip_nulls(jsonb_build_object(
            'artist', meta->>'artist',
            'url', meta->>'url',
            'set', meta->>'set',
            'is_playlist', meta->'is_playlist'
          ))
          else '{}'::jsonb
        end
    )
    order by
      case when due_at is null then 1 else 0 end,
      due_at asc,
      position asc,
      created_at asc
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
      'cover_color', _event.cover_color,
      'cover_image_url', _event.cover_image_url
    ),
    'host', (
      select jsonb_build_object(
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'initial', upper(left(coalesce(nullif(p.display_name, ''), p.email, '?'), 1))
      )
      from public.profiles p
      where p.id = _event.owner_id
    ),
    'items', _items,
    'rsvp_summary', coalesce(
      _rsvp_summary,
      jsonb_build_object('yes', 0, 'maybe', 0, 'no', 0, 'pending', 0)
    )
  );
end;
$$;

grant execute on function public.get_public_event_share(text) to anon, authenticated;

create or replace function public.request_rsvp_recovery(_share_token text, _email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Token issuance moved to the notify-rsvp-recovery Edge Function so the
  -- magic UUID never crosses the browser boundary.
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.request_rsvp_recovery(text, text) from public;
grant execute on function public.request_rsvp_recovery(text, text) to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.event_share_links;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.event_notification_mutes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
