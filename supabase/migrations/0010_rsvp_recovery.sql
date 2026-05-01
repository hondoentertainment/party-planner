-- Party Planner — magic-link RSVP recovery (cross-device editing).
--
-- Guests RSVP from a public share link without auth. Today their submission
-- is only remembered via localStorage on the device they used. This migration
-- introduces a server-side recovery token so guests can email themselves a
-- link that lets them re-edit their RSVP from any device.
--
-- Design notes:
--   * `public_rsvp_tokens` is locked down with RLS — only SECURITY DEFINER
--     functions and the service role (which bypasses RLS) ever touch it.
--   * `request_rsvp_recovery` is anti-enumeration: it always returns
--     `{ ok: true }` regardless of whether the email matched. The token is
--     emailed out-of-band by the `notify-rsvp-recovery` Edge Function, which
--     looks up the row server-side using the share token.
--   * `submit_public_rsvp` is replaced with a `(text, jsonb, uuid default null)`
--     signature so existing callers that send only `_token + _payload` keep
--     working. When `_recovery_token` is provided, the existing guest item is
--     updated in-place rather than inserting a new row.

-- =============================================================
-- 1. public_rsvp_tokens table
-- =============================================================
create table if not exists public.public_rsvp_tokens (
  token uuid primary key default gen_random_uuid(),
  share_token text not null references public.event_share_links(token) on delete cascade,
  item_id uuid not null references public.event_items(id) on delete cascade,
  email text not null,
  last_sent_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '90 days'),
  created_at timestamptz default now()
);

create index if not exists public_rsvp_tokens_share_email_idx
  on public.public_rsvp_tokens(share_token, lower(email));

create index if not exists public_rsvp_tokens_item_idx
  on public.public_rsvp_tokens(item_id);

alter table public.public_rsvp_tokens enable row level security;

-- Default-deny. Only SECURITY DEFINER functions and the service role
-- (which bypasses RLS) read/write this table.
drop policy if exists "Deny all on public_rsvp_tokens" on public.public_rsvp_tokens;
create policy "Deny all on public_rsvp_tokens"
  on public.public_rsvp_tokens
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- =============================================================
-- 2. request_rsvp_recovery — anti-enumeration token issuance
-- =============================================================
create or replace function public.request_rsvp_recovery(_share_token text, _email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _link public.event_share_links%rowtype;
  _email_norm text;
  _item_id uuid;
  _token uuid;
begin
  _email_norm := lower(nullif(btrim(coalesce(_email, '')), ''));
  if _email_norm is null or _share_token is null or btrim(_share_token) = '' then
    -- Always succeed silently: never tell the caller whether their input was
    -- well-formed enough to match anything.
    return jsonb_build_object('ok', true);
  end if;

  select *
    into _link
  from public.event_share_links
  where token = _share_token
    and enabled = true
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if _link.id is null then
    return jsonb_build_object('ok', true);
  end if;

  -- Locate the most recent guest RSVP whose stored email matches.
  select id
    into _item_id
  from public.event_items
  where event_id = _link.event_id
    and kind = 'guest'
    and lower(coalesce(meta->>'email', '')) = _email_norm
  order by created_at desc
  limit 1;

  if _item_id is null then
    return jsonb_build_object('ok', true);
  end if;

  -- Reuse an existing token row when one already exists for this
  -- share+item+email triple so the magic link stays stable across re-requests.
  select token
    into _token
  from public.public_rsvp_tokens
  where share_token = _share_token
    and item_id = _item_id
    and lower(email) = _email_norm
    and expires_at > now()
  order by last_sent_at desc nulls last
  limit 1;

  if _token is null then
    insert into public.public_rsvp_tokens(share_token, item_id, email, last_sent_at, expires_at)
    values (_share_token, _item_id, _email_norm, now(), now() + interval '90 days')
    returning token into _token;
  else
    update public.public_rsvp_tokens
      set last_sent_at = now(),
          expires_at = greatest(expires_at, now() + interval '90 days')
    where token = _token;
  end if;

  return jsonb_build_object('ok', true, 'token', _token);
end;
$$;

revoke all on function public.request_rsvp_recovery(text, text) from public;
grant execute on function public.request_rsvp_recovery(text, text) to anon, authenticated;

-- =============================================================
-- 3. lookup_rsvp_by_token — magic-link rehydration
-- =============================================================
create or replace function public.lookup_rsvp_by_token(_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  _row public.public_rsvp_tokens%rowtype;
  _item public.event_items%rowtype;
  _meta jsonb;
begin
  if _token is null then
    return null;
  end if;

  select *
    into _row
  from public.public_rsvp_tokens
  where token = _token
    and expires_at > now()
  limit 1;

  if _row.token is null then
    return null;
  end if;

  select * into _item from public.event_items where id = _row.item_id;
  if _item.id is null then
    return null;
  end if;

  _meta := coalesce(_item.meta, '{}'::jsonb);

  return jsonb_build_object(
    'item_id', _item.id,
    'share_token', _row.share_token,
    'email', _row.email,
    'meta', jsonb_build_object(
      'name', coalesce(_item.title, ''),
      'email', coalesce(_meta->>'email', _row.email),
      'rsvp', coalesce(_meta->>'rsvp', 'yes'),
      'plus_ones', coalesce((_meta->>'plus_ones')::int, 0),
      'dietary', coalesce(_meta->>'dietary', ''),
      'notes', coalesce(_meta->>'notes', _item.description, ''),
      'submitted_at', coalesce(_meta->>'submitted_at', _item.created_at::text)
    )
  );
end;
$$;

revoke all on function public.lookup_rsvp_by_token(uuid) from public;
grant execute on function public.lookup_rsvp_by_token(uuid) to anon, authenticated;

-- =============================================================
-- 4. submit_public_rsvp — accept an optional recovery token to UPDATE
-- =============================================================
-- Drop the original 2-arg overload from migration 0009 so PostgREST resolves
-- this single canonical definition (avoids ambiguous-overload errors when
-- callers omit the optional 3rd arg).
drop function if exists public.submit_public_rsvp(text, jsonb);

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

  -- Recovery-token path: edit an existing guest item rather than insert a new one.
  if _recovery_token is not null then
    select *
      into _recovery
    from public.public_rsvp_tokens
    where token = _recovery_token
      and expires_at > now()
    limit 1;

    -- Defensive: token must belong to THIS share link (prevents using a token
    -- issued for one event to mutate guests on another).
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

  -- Default insert path. Same anti-double-submit guard as migration 0009.
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
