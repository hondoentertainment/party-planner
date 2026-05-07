-- Party Planner — production-safety rate limits.
--
-- Builds on the public-share rate limit shipped in 0017 by:
--   1. Rate-limiting **signed-in** bug reports (the public path is already
--      capped at 20 per event per hour; this caps signed-in users at 30
--      reports per hour to stop runaway clients / accidental autoreport
--      loops, while leaving plenty of headroom for legitimate triage runs).
--   2. Enforcing a **send-cool-down** on RSVP recovery emails. Today the
--      `notify-rsvp-recovery` Edge Function is anon-callable: anyone with a
--      `share_token` + `recovery_token` (which the recipient already has)
--      can hammer the function and burn Resend quota. The cool-down is
--      enforced via `last_sent_at` on `public.public_rsvp_tokens`; the Edge
--      Function reads the timestamp before sending and returns 429 if it
--      sent too recently. This SQL also stops `request_rsvp_recovery` from
--      *refreshing* `last_sent_at` while inside the cool-down window so
--      reissuing tokens does not paper over the cap.
--
-- Both changes are idempotent and safe to re-run.

-- =============================================================
-- 1. signed-in bug_reports rate limit (30 / reporter / hour)
-- =============================================================
create or replace function public.bug_reports_rate_limit_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _recent int;
begin
  if new.reporter_id is null then
    -- Public/anon path is gated by submit_public_bug_report's own
    -- per-event-hour count (migration 0017). Skip here.
    return new;
  end if;

  select count(*)::int
    into _recent
  from public.bug_reports
  where reporter_id = new.reporter_id
    and created_at > now() - interval '1 hour';

  if _recent >= 30 then
    raise exception 'Too many bug reports from this account in the last hour. Please wait a few minutes and try again.'
      using errcode = '53400';
  end if;

  return new;
end;
$$;

drop trigger if exists bug_reports_rate_limit on public.bug_reports;
create trigger bug_reports_rate_limit
  before insert on public.bug_reports
  for each row execute function public.bug_reports_rate_limit_check();

-- =============================================================
-- 2. RSVP recovery cool-down inside request_rsvp_recovery
-- =============================================================
-- Re-issue the function with the same anti-enumeration contract, but
-- preserve `last_sent_at` when the previous send was inside the cool-down
-- window. The Edge Function keeps the second half of the gate.
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
  _last_sent timestamptz;
  _cooldown interval := interval '60 seconds';
begin
  _email_norm := lower(nullif(btrim(coalesce(_email, '')), ''));
  if _email_norm is null or _share_token is null or btrim(_share_token) = '' then
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

  select token, last_sent_at
    into _token, _last_sent
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
    -- Always extend the expiry so the link remains valid, but only refresh
    -- last_sent_at when we are *outside* the cool-down. This way repeated
    -- requests within 60s do not look like fresh sends to the Edge Function.
    update public.public_rsvp_tokens
      set last_sent_at = case
            when _last_sent is null or now() - _last_sent > _cooldown then now()
            else last_sent_at
          end,
          expires_at = greatest(expires_at, now() + interval '90 days')
    where token = _token;
  end if;

  return jsonb_build_object('ok', true, 'token', _token);
end;
$$;

revoke all on function public.request_rsvp_recovery(text, text) from public;
grant execute on function public.request_rsvp_recovery(text, text) to anon, authenticated;

-- =============================================================
-- 3. Sentinel for verify_remote.sql
-- =============================================================
-- A no-op comment that verify_remote.sql can grep for to confirm 0020 ran.
comment on function public.bug_reports_rate_limit_check() is
  'Party Planner 0020: signed-in bug_reports rate limit (30/hour/user).';
