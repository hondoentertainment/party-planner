-- Large-event RSVP limits (~1000 guests): rate limiting, hard guest cap,
-- email upsert for public RSVP, and lookup index for guest email.

-- ---------------------------------------------------------------------------
-- Rate limit: submissions per share token per rolling minute (anti-abuse).
-- Written only from SECURITY DEFINER submit_public_rsvp; not exposed to clients.
-- ---------------------------------------------------------------------------
create table if not exists public.public_rsvp_submit_log (
  id uuid primary key default gen_random_uuid(),
  share_token text not null,
  created_at timestamptz not null default now()
);

create index if not exists public_rsvp_submit_log_token_created_idx
  on public.public_rsvp_submit_log (share_token, created_at desc);

alter table public.public_rsvp_submit_log enable row level security;

revoke all on table public.public_rsvp_submit_log from public;
grant select, insert, delete on table public.public_rsvp_submit_log to postgres;

-- ---------------------------------------------------------------------------
-- Guest email lookups (public RSVP upsert + recovery paths).
-- ---------------------------------------------------------------------------
create index if not exists event_items_guest_event_email_lower_idx
  on public.event_items (event_id, ((lower(trim(coalesce(meta ->> 'email', ''))))))
  where kind = 'guest';

-- ---------------------------------------------------------------------------
-- Hard cap: max guest rows per event (manual import + public RSVP).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_max_guests_per_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _n int;
begin
  if new.kind is distinct from 'guest' then
    return new;
  end if;
  select count(*)::int
    into _n
  from public.event_items
  where event_id = new.event_id
    and kind = 'guest';

  if tg_op = 'INSERT' and _n >= 1000 then
    raise exception 'This event already has the maximum number of guest RSVPs (1000).';
  end if;

  return new;
end;
$$;

drop trigger if exists event_items_max_guests_ins on public.event_items;
create trigger event_items_max_guests_ins
  before insert on public.event_items
  for each row execute function public.enforce_max_guests_per_event();

-- ---------------------------------------------------------------------------
-- submit_public_rsvp — rate limit, cap (insert path), email upsert.
-- ---------------------------------------------------------------------------
create or replace function public.submit_public_rsvp(
  _token text,
  _payload jsonb,
  _recovery_token uuid default null
)
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
  _recovery public.public_rsvp_tokens%rowtype;
  _guest_count int;
  _rate_count int;
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

  -- Rolling cleanup + rate limit (per share token).
  delete from public.public_rsvp_submit_log
  where created_at < now() - interval '2 hours';

  select count(*)::int
    into _rate_count
  from public.public_rsvp_submit_log
  where share_token = _token
    and created_at > now() - interval '1 minute';

  if _rate_count >= 120 then
    raise exception 'Too many RSVP attempts from this link. Please wait a minute and try again.';
  end if;

  insert into public.public_rsvp_submit_log (share_token) values (_token);

  -- Recovery-token path: edit an existing guest item.
  if _recovery_token is not null then
    select *
      into _recovery
    from public.public_rsvp_tokens
    where token = _recovery_token
      and expires_at > now()
    limit 1;

    if _recovery.token is null or _recovery.share_token <> _token then
      raise exception 'This recovery link is no longer valid. Please request a new one.';
    end if;

    update public.event_items
      set title = _name,
          description = _notes,
          meta = jsonb_build_object(
            'rsvp', _rsvp,
            'email', _email,
            'plus_ones', _plus_ones,
            'dietary', _dietary,
            'notes', _notes,
            'source', 'public_share',
            'submitted_at', now(),
            'updated_via_recovery', true
          ),
          updated_at = now()
      where id = _recovery.item_id
      returning id into _new_id;

    if _new_id is null then
      raise exception 'We could not find your previous RSVP. Please submit it again.';
    end if;

    begin
      insert into public.event_activity(event_id, actor_id, message)
      values (
        _link.event_id,
        null,
        'Public RSVP updated by ' || _name || ' (' || _rsvp || ')'
      );
    exception when others then
      null;
    end;

    return jsonb_build_object('ok', true, 'item_id', _new_id, 'updated', true);
  end if;

  -- Same-email upsert for returning guests (no recovery token).
  if _email_norm is not null then
    select id
      into _existing_id
    from public.event_items
    where event_id = _link.event_id
      and kind = 'guest'
      and lower(trim(coalesce(meta->>'email', ''))) = _email_norm
    order by created_at desc
    limit 1;

    if _existing_id is not null then
      update public.event_items
        set title = _name,
            description = _notes,
            meta = jsonb_build_object(
              'rsvp', _rsvp,
              'email', _email,
              'plus_ones', _plus_ones,
              'dietary', _dietary,
              'notes', _notes,
              'source', 'public_share',
              'submitted_at', now(),
              'updated_via_email_match', true
            ),
            updated_at = now()
        where id = _existing_id
        returning id into _new_id;

      begin
        insert into public.event_activity(event_id, actor_id, message)
        values (
          _link.event_id,
          null,
          'Public RSVP updated by ' || _name || ' (' || _rsvp || ')'
        );
      exception when others then
        null;
      end;

      return jsonb_build_object('ok', true, 'item_id', _new_id, 'updated', true);
    end if;
  end if;

  select count(*)::int
    into _guest_count
  from public.event_items
  where event_id = _link.event_id
    and kind = 'guest';

  if _guest_count >= 1000 then
    raise exception 'This party has reached the guest list limit (1000 RSVPs). Contact the host.';
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

revoke all on function public.submit_public_rsvp(text, jsonb, uuid) from public;
grant execute on function public.submit_public_rsvp(text, jsonb, uuid) to anon, authenticated;
