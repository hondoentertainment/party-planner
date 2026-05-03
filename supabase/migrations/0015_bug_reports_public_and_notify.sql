-- Party Planner — public share bug reports + maintainer email hook.
--
-- 1. Allows guest submissions via token-gated RPC (same link guards as RSVP).
-- 2. Fires pg_net http_post to Edge Function `notify-bug-report` when
--    `app.functions_url` + `app.service_role_key` (or private.app_settings
--    fallback) are configured — mirrors notify-assignment wiring.

-- ------------------------------------------------------------
-- Schema: nullable reporter for guest-submitted rows
-- ------------------------------------------------------------
alter table public.bug_reports
  alter column reporter_id drop not null;

alter table public.bug_reports drop constraint if exists bug_reports_reporter_or_public;
alter table public.bug_reports add constraint bug_reports_reporter_or_public check (
  reporter_id is not null
  or coalesce(context->>'source', '') = 'public_share'
);

-- ------------------------------------------------------------
-- RPC: guests (and optional signed-in viewers) report via share token
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Trigger → notify-bug-report Edge Function (optional)
-- ------------------------------------------------------------
create or replace function public.notify_bug_report_insert()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _functions_url text;
  _service_key text;
  _payload jsonb;
begin
  begin
    _functions_url := nullif(current_setting('app.functions_url', true), '');
    _service_key := nullif(current_setting('app.service_role_key', true), '');
  exception when others then
    _functions_url := null;
    _service_key := null;
  end;

  if _functions_url is null then
    select value into _functions_url
    from private.app_settings
    where key = 'app.functions_url';
  end if;

  if _service_key is null then
    select value into _service_key
    from private.app_settings
    where key = 'app.service_role_key';
  end if;

  if _functions_url is null or _service_key is null or length(trim(_functions_url)) = 0
     or length(trim(_service_key)) = 0 then
    return new;
  end if;

  _payload := jsonb_build_object(
    'bug_report_id', new.id,
    'event_id', new.event_id,
    'reporter_id', new.reporter_id,
    'title', new.title,
    'severity', new.severity,
    'status', new.status
  );

  perform extensions.http_post(
    url := rtrim(_functions_url, '/') || '/notify-bug-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := _payload
  );

  return new;
exception when others then
  raise warning 'notify_bug_report_insert failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists bug_report_notify on public.bug_reports;
create trigger bug_report_notify
  after insert on public.bug_reports
  for each row execute procedure public.notify_bug_report_insert();
