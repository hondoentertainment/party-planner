-- Party Planner — rate limit public (share-page) bug reports per event per hour.
-- Prevents noisy abuse when a guest link is widely shared.

create or replace function public.submit_public_bug_report(_token text, _payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _link public.event_share_links%rowtype;
  _title text;
  _description text;
  _severity text;
  _context jsonb;
  _new_id uuid;
  _reporter uuid;
  _recent int;
begin
  if _payload is null or jsonb_typeof(_payload) <> 'object' then
    raise exception 'Bug report payload is required';
  end if;

  _title := nullif(btrim(coalesce(_payload->>'title', '')), '');
  if _title is null or char_length(_title) < 3 then
    raise exception 'Add a short title so we can identify the issue';
  end if;
  if char_length(_title) > 160 then
    _title := left(_title, 160);
  end if;

  _description := nullif(btrim(coalesce(_payload->>'description', '')), '');
  if _description is null or char_length(_description) < 10 then
    raise exception 'Add a little more detail about what happened';
  end if;
  if char_length(_description) > 5000 then
    _description := left(_description, 5000);
  end if;

  _severity := lower(coalesce(nullif(btrim(_payload->>'severity'), ''), 'medium'));
  if _severity not in ('low', 'medium', 'high', 'critical') then
    _severity := 'medium';
  end if;

  _context := coalesce(_payload->'context', '{}'::jsonb);
  if jsonb_typeof(_context) <> 'object' then
    _context := '{}'::jsonb;
  end if;

  _context := _context || jsonb_build_object(
    'source', 'public_share',
    'share_token_prefix', left(coalesce(_token, ''), 8)
  );

  select *
    into _link
  from public.event_share_links
  where token = _token
    and enabled = true
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if _link.id is null then
    raise exception 'This share link is no longer valid';
  end if;

  select count(*)::int
    into _recent
  from public.bug_reports br
  where br.event_id = _link.event_id
    and coalesce(br.context->>'source', '') = 'public_share'
    and br.created_at > now() - interval '1 hour';

  if _recent >= 20 then
    raise exception 'Too many reports from this event right now. Please try again in a little while.';
  end if;

  _reporter := auth.uid();

  insert into public.bug_reports (
    reporter_id,
    event_id,
    title,
    description,
    severity,
    context
  )
  values (
    _reporter,
    _link.event_id,
    _title,
    _description,
    _severity,
    _context
  )
  returning id into _new_id;

  return jsonb_build_object('ok', true, 'id', _new_id);
end;
$$;

revoke all on function public.submit_public_bug_report(text, jsonb) from public;
grant execute on function public.submit_public_bug_report(text, jsonb) to anon, authenticated;
