-- Party Planner — assignment notifications
-- Calls the `notify-assignment` Edge Function whenever an item gets a new
-- assignee (insert with assignee or update changing assignee_id).
--
-- Setup steps (one-time, run AFTER deploying the edge function):
--   1. Enable the pg_net extension (Supabase: Database → Extensions → pg_net).
--   2. Set the two app settings below to point at your project:
--        select set_config('app.functions_url',  'https://<project-ref>.supabase.co/functions/v1', false);
--        select set_config('app.service_role_key','YOUR-SERVICE-ROLE-KEY', false);
--      (Add these as Database "Settings" → custom GUCs so they survive restarts:
--       https://supabase.com/docs/guides/database/extensions/pg_net#authentication )
--   3. Deploy the edge function:
--        supabase functions deploy notify-assignment
--   4. Set its secrets:
--        supabase secrets set RESEND_API_KEY=re_xxx FROM_EMAIL='Party Planner <hi@yourdomain.com>' APP_URL=https://your-app.vercel.app

-- Make sure pg_net is available (no-op if extension already enabled).
create extension if not exists pg_net with schema extensions;

-- Trigger function: posts to the edge function when an assignee changes.
create or replace function public.notify_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public
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
    _functions_url := current_setting('app.functions_url', true);
    _service_key := current_setting('app.service_role_key', true);
  exception when others then
    _functions_url := null;
  end;

  if _functions_url is null or _functions_url = '' then
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
      'Authorization', 'Bearer ' || coalesce(_service_key, '')
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

drop trigger if exists notify_item_assignment on public.event_items;
create trigger notify_item_assignment
  after insert or update of assignee_id on public.event_items
  for each row execute procedure public.notify_assignment_change();
