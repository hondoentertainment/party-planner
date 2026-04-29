-- Party Planner — MVP feature expansion
-- Additive schema for in-app notifications, budgets, vendors, saved templates,
-- public share links, and post-event wrap-ups.

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications(user_id, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "Users can view own notifications" on public.user_notifications;
create policy "Users can view own notifications"
  on public.user_notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can update own notifications" on public.user_notifications;
create policy "Users can update own notifications"
  on public.user_notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own notifications" on public.user_notifications;
create policy "Users can delete own notifications"
  on public.user_notifications for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.event_budget_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  category text default 'general',
  estimated_cents int not null default 0,
  actual_cents int not null default 0,
  paid_by uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_budget_items_event_idx on public.event_budget_items(event_id);
alter table public.event_budget_items enable row level security;

drop policy if exists "Members can view budget items" on public.event_budget_items;
create policy "Members can view budget items"
  on public.event_budget_items for select to authenticated
  using (public.is_event_member(event_id));

drop policy if exists "Editors can insert budget items" on public.event_budget_items;
create policy "Editors can insert budget items"
  on public.event_budget_items for insert to authenticated
  with check (public.can_edit_event(event_id));

drop policy if exists "Editors can update budget items" on public.event_budget_items;
create policy "Editors can update budget items"
  on public.event_budget_items for update to authenticated
  using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

drop policy if exists "Editors can delete budget items" on public.event_budget_items;
create policy "Editors can delete budget items"
  on public.event_budget_items for delete to authenticated
  using (public.can_edit_event(event_id));

create table if not exists public.event_vendors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  category text default 'vendor',
  contact_name text,
  email text,
  phone text,
  website text,
  deposit_cents int not null default 0,
  balance_cents int not null default 0,
  due_at timestamptz,
  status text not null default 'researching',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_vendors_event_idx on public.event_vendors(event_id);
alter table public.event_vendors enable row level security;

drop policy if exists "Members can view vendors" on public.event_vendors;
create policy "Members can view vendors"
  on public.event_vendors for select to authenticated
  using (public.is_event_member(event_id));

drop policy if exists "Editors can insert vendors" on public.event_vendors;
create policy "Editors can insert vendors"
  on public.event_vendors for insert to authenticated
  with check (public.can_edit_event(event_id));

drop policy if exists "Editors can update vendors" on public.event_vendors;
create policy "Editors can update vendors"
  on public.event_vendors for update to authenticated
  using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

drop policy if exists "Editors can delete vendors" on public.event_vendors;
create policy "Editors can delete vendors"
  on public.event_vendors for delete to authenticated
  using (public.can_edit_event(event_id));

create table if not exists public.user_event_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source_event_id uuid references public.events(id) on delete set null,
  name text not null,
  description text,
  emoji text default '🎉',
  color text default '#cc38f5',
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_event_templates_owner_idx on public.user_event_templates(owner_id);
alter table public.user_event_templates enable row level security;

drop policy if exists "Users can manage own event templates" on public.user_event_templates;
create policy "Users can manage own event templates"
  on public.user_event_templates for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create table if not exists public.event_share_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  token text not null unique,
  label text default 'Public share link',
  enabled boolean not null default true,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists event_share_links_event_idx on public.event_share_links(event_id);
alter table public.event_share_links enable row level security;

drop policy if exists "Members can view share links" on public.event_share_links;
create policy "Members can view share links"
  on public.event_share_links for select to authenticated
  using (public.is_event_member(event_id));

drop policy if exists "Editors can insert share links" on public.event_share_links;
create policy "Editors can insert share links"
  on public.event_share_links for insert to authenticated
  with check (public.can_edit_event(event_id));

drop policy if exists "Editors can update share links" on public.event_share_links;
create policy "Editors can update share links"
  on public.event_share_links for update to authenticated
  using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

drop policy if exists "Editors can delete share links" on public.event_share_links;
create policy "Editors can delete share links"
  on public.event_share_links for delete to authenticated
  using (public.can_edit_event(event_id));

create table if not exists public.event_wrap_ups (
  event_id uuid primary key references public.events(id) on delete cascade,
  summary text,
  lessons text,
  final_cost_cents int not null default 0,
  guest_count int not null default 0,
  vendor_rating int,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_wrap_ups enable row level security;

drop policy if exists "Members can view wrap ups" on public.event_wrap_ups;
create policy "Members can view wrap ups"
  on public.event_wrap_ups for select to authenticated
  using (public.is_event_member(event_id));

drop policy if exists "Editors can insert wrap ups" on public.event_wrap_ups;
create policy "Editors can insert wrap ups"
  on public.event_wrap_ups for insert to authenticated
  with check (public.can_edit_event(event_id));

drop policy if exists "Editors can update wrap ups" on public.event_wrap_ups;
create policy "Editors can update wrap ups"
  on public.event_wrap_ups for update to authenticated
  using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

-- Limited public payload for unguessable share links. This avoids broad anon table policies.
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
begin
  select *
    into _link
  from public.event_share_links
  where token = _token
    and enabled = true
    and (expires_at is null or expires_at > now())
  limit 1;

  if _link.id is null then
    return null;
  end if;

  select * into _event from public.events where id = _link.event_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'kind', kind,
      'phase', phase,
      'title', title,
      'description', description,
      'due_at', due_at,
      'position', position,
      'meta', meta
    )
    order by position asc, created_at asc
  ), '[]'::jsonb)
  into _items
  from public.event_items
  where event_id = _event.id
    and kind in ('task', 'guest', 'food', 'beverage', 'music');

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
      'cover_color', _event.cover_color
    ),
    'items', _items
  );
end;
$$;

grant execute on function public.get_public_event_share(text) to anon, authenticated;

create or replace function public.create_activity_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_notifications(user_id, event_id, actor_id, title, body, url)
  select user_id, new.event_id, new.actor_id, 'Event update', new.message, '/events/' || new.event_id
  from (
    select e.owner_id as user_id
    from public.events e
    where e.id = new.event_id
    union
    select c.user_id
    from public.event_collaborators c
    where c.event_id = new.event_id
  ) members
  where user_id is not null
    and user_id is distinct from new.actor_id;
  return new;
end;
$$;

drop trigger if exists create_activity_notifications on public.event_activity;
create trigger create_activity_notifications
  after insert on public.event_activity
  for each row execute procedure public.create_activity_notifications();

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
  if tg_op = 'UPDATE' and (old.assignee_id is not distinct from new.assignee_id) then
    return new;
  end if;
  if new.assignee_id is null then
    return new;
  end if;
  if new.assignee_id = coalesce(auth.uid(), new.created_by) then
    return new;
  end if;

  _actor := coalesce(auth.uid(), new.created_by);

  insert into public.user_notifications(user_id, event_id, actor_id, title, body, url)
  values (
    new.assignee_id,
    new.event_id,
    _actor,
    'New assignment',
    'You were assigned "' || new.title || '".',
    '/events/' || new.event_id || case when new.kind = 'task' then '/timeline' else '/' || new.kind end
  );

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
    return new;
  end if;

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
  raise warning 'notify_assignment_change failed: %', sqlerrm;
  return new;
end;
$$;

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.user_notifications';
  exception when duplicate_object then null; end;
  begin
    execute 'alter publication supabase_realtime add table public.event_budget_items';
  exception when duplicate_object then null; end;
  begin
    execute 'alter publication supabase_realtime add table public.event_vendors';
  exception when duplicate_object then null; end;
  begin
    execute 'alter publication supabase_realtime add table public.event_wrap_ups';
  exception when duplicate_object then null; end;
end $$;
