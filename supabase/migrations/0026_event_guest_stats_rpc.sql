-- Server-side guest list aggregates (one round-trip vs scanning all meta client-side).

create or replace function public.get_event_guest_stats(_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _total int;
  _yes int;
  _no int;
  _maybe int;
  _pending int;
  _attendees int := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_event_member(_event_id) then
    raise exception 'Not authorized';
  end if;

  select
    count(*)::int,
    count(*) filter (where coalesce(meta->>'rsvp', 'pending') = 'yes')::int,
    count(*) filter (where coalesce(meta->>'rsvp', 'pending') = 'no')::int,
    count(*) filter (where coalesce(meta->>'rsvp', 'pending') = 'maybe')::int,
    count(*) filter (
      where coalesce(meta->>'rsvp', 'pending') not in ('yes', 'no', 'maybe')
    )::int
  into _total, _yes, _no, _maybe, _pending
  from public.event_items
  where event_id = _event_id
    and kind = 'guest';

  select coalesce(sum(
    1 + case
      when nullif(btrim(coalesce(meta->>'plus_ones', '')), '') is not null
        and (meta->>'plus_ones') ~ '^-?\d+$'
      then least(50, greatest(0, (meta->>'plus_ones')::int))
      when coalesce(meta->>'plus_one', 'false') in ('true', 't', '1')
      then greatest(
        0,
        coalesce(
          case
            when (meta->>'plus_one_count') ~ '^-?\d+$'
            then (meta->>'plus_one_count')::int
            else 1
          end,
          1
        )
      )
      else 0
    end
  ), 0)::int
  into _attendees
  from public.event_items
  where event_id = _event_id
    and kind = 'guest'
    and coalesce(meta->>'rsvp', '') = 'yes';

  return jsonb_build_object(
    'total', _total,
    'yes', _yes,
    'no', _no,
    'maybe', _maybe,
    'pending', _pending,
    'total_attendees', _attendees
  );
end;
$$;

revoke all on function public.get_event_guest_stats(uuid) from public;
grant execute on function public.get_event_guest_stats(uuid) to authenticated;
