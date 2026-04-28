-- Party Planner — assignment notification settings fallback
--
-- Supabase hosted projects do not allow arbitrary app.* Postgres overrides
-- through the CLI Management API. Keep supporting those GUCs when configured
-- manually, but also allow the trigger to read locked-down settings from a
-- private table populated by deploy tooling.

create schema if not exists private;

create table if not exists private.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

create or replace function public.notify_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _functions_url text;
  _service_key text;
  _payload jsonb;
  _actor uuid;
begin
  -- Only fire when assignee actually changed (or was just set on insert).
  if tg_op = 'UPDATE' and (old.assignee_id is not distinct from new.assignee_id) then
    return new;
  end if;
  if new.assignee_id is null then
    return new;
  end if;
  -- Don't notify if user assigned themselves.
  if new.assignee_id = coalesce(auth.uid(), new.created_by) then
    return new;
  end if;

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

  if _functions_url is null or _service_key is null then
    -- Settings not configured; silently skip so user changes still succeed.
    return new;
  end if;

  _actor := coalesce(auth.uid(), new.created_by);

  _payload := jsonb_build_object(
    'item_id', new.id,
    'event_id', new.event_id,
    'assignee_id', new.assignee_id,
    'assigner_id', _actor,
    'title', new.title,
    'kind', new.kind,
    'due_at', new.due_at
  );

  perform extensions.http_post(
    url := _functions_url || '/notify-assignment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := _payload
  );

  return new;
exception when others then
  -- Never let notification failures block the user's edit.
  raise warning 'notify_assignment_change failed: %', sqlerrm;
  return new;
end;
$$;
