-- Party Planner — public RSVP submissions
-- Token-gated insert path so anonymous guests can RSVP from the public share
-- page. Validation mirrors get_public_event_share so a disabled, revoked, or
-- expired link cannot accept submissions.

create or replace function public.submit_public_rsvp(_token text, _payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _link public.event_share_links%rowtype;
  _name text;
  _email text;
  _email_norm text;
  _rsvp text;
  _plus_ones int;
  _dietary text;
  _notes text;
  _existing_id uuid;
  _new_id uuid;
  _next_pos int;
begin
  if _payload is null or jsonb_typeof(_payload) <> 'object' then
    raise exception 'RSVP payload is required';
  end if;

  _name := nullif(btrim(coalesce(_payload->>'name', '')), '');
  if _name is null then
    raise exception 'Please tell us your name so the host knows who is coming';
  end if;
  if char_length(_name) > 120 then
    _name := left(_name, 120);
  end if;

  _email := nullif(btrim(coalesce(_payload->>'email', '')), '');
  if _email is not null and char_length(_email) > 254 then
    raise exception 'That email address is too long';
  end if;
  _email_norm := lower(_email);

  _rsvp := lower(coalesce(_payload->>'rsvp', 'yes'));
  if _rsvp not in ('yes', 'maybe', 'no') then
    raise exception 'RSVP must be yes, maybe, or no';
  end if;

  begin
    _plus_ones := coalesce((_payload->>'plus_ones')::int, 0);
  exception when others then
    raise exception 'Plus-ones must be a whole number';
  end;
  if _plus_ones < 0 then
    raise exception 'Plus-ones cannot be negative';
  end if;
  if _plus_ones > 50 then
    _plus_ones := 50;
  end if;

  _dietary := nullif(btrim(coalesce(_payload->>'dietary', '')), '');
  if _dietary is not null and char_length(_dietary) > 500 then
    _dietary := left(_dietary, 500);
  end if;

  _notes := nullif(btrim(coalesce(_payload->>'notes', '')), '');
  if _notes is not null and char_length(_notes) > 2000 then
    _notes := left(_notes, 2000);
  end if;

  select *
    into _link
  from public.event_share_links
  where token = _token
    and enabled = true
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if _link.id is null then
    raise exception 'This share link is no longer accepting RSVPs';
  end if;

  if _email_norm is not null then
    select id
      into _existing_id
    from public.event_items
    where event_id = _link.event_id
      and kind = 'guest'
      and lower(coalesce(meta->>'email', '')) = _email_norm
      and coalesce(meta->>'source', '') = 'public_share'
      and coalesce((meta->>'submitted_at')::timestamptz, created_at) > now() - interval '5 minutes'
    order by created_at desc
    limit 1;

    if _existing_id is not null then
      raise exception 'We already received an RSVP from that email a moment ago. Try again in a few minutes if you need to make changes.';
    end if;
  end if;

  select coalesce(max(position), -1) + 1
    into _next_pos
  from public.event_items
  where event_id = _link.event_id
    and kind = 'guest';

  insert into public.event_items(
    event_id,
    kind,
    phase,
    title,
    description,
    status,
    position,
    meta,
    created_by
  )
  values (
    _link.event_id,
    'guest',
    'pre',
    _name,
    _notes,
    'todo',
    _next_pos,
    jsonb_build_object(
      'rsvp', _rsvp,
      'email', _email,
      'plus_ones', _plus_ones,
      'dietary', _dietary,
      'notes', _notes,
      'source', 'public_share',
      'submitted_at', now()
    ),
    _link.created_by
  )
  returning id into _new_id;

  -- actor_id is intentionally null so the host receives the activity notification
  begin
    insert into public.event_activity(event_id, actor_id, message)
    values (
      _link.event_id,
      null,
      'Public RSVP from ' || _name || ' (' || _rsvp || ')'
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true, 'item_id', _new_id);
end;
$$;

revoke all on function public.submit_public_rsvp(text, jsonb) from public;
grant execute on function public.submit_public_rsvp(text, jsonb) to anon, authenticated;
