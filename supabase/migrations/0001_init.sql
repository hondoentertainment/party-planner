-- Party Planner — initial schema
-- Run this in the Supabase SQL editor (Project → SQL → New query → Paste → Run).
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS guards.

-- =============================================================
-- 1. PROFILES (mirrors auth.users)
-- =============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================================
-- 2. EVENTS
-- =============================================================
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  theme text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  partiful_url text,
  rsvp_count int default 0,
  budget_cents int default 0,
  cover_emoji text default '🎉',
  cover_color text default '#cc38f5',
  archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.events enable row level security;

-- =============================================================
-- 3. COLLABORATORS (many-to-many)
-- =============================================================
create table if not exists public.event_collaborators (
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'editor', -- 'owner' | 'editor' | 'viewer'
  invited_email text,
  created_at timestamptz default now(),
  primary key (event_id, user_id)
);

alter table public.event_collaborators enable row level security;

-- Helper function: is the calling user a member of an event?
create or replace function public.is_event_member(_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.events e where e.id = _event_id and e.owner_id = auth.uid()
  ) or exists (
    select 1 from public.event_collaborators c
    where c.event_id = _event_id and c.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_event(_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.events e where e.id = _event_id and e.owner_id = auth.uid()
  ) or exists (
    select 1 from public.event_collaborators c
    where c.event_id = _event_id and c.user_id = auth.uid() and c.role in ('owner','editor')
  );
$$;

-- Events policies
drop policy if exists "Members can view events" on public.events;
create policy "Members can view events"
  on public.events for select to authenticated
  using (owner_id = auth.uid() or public.is_event_member(id));

drop policy if exists "Authenticated users can create events" on public.events;
create policy "Authenticated users can create events"
  on public.events for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Editors can update events" on public.events;
create policy "Editors can update events"
  on public.events for update to authenticated
  using (public.can_edit_event(id));

drop policy if exists "Owners can delete events" on public.events;
create policy "Owners can delete events"
  on public.events for delete to authenticated
  using (owner_id = auth.uid());

-- Collaborators policies
drop policy if exists "Members can view collaborators" on public.event_collaborators;
create policy "Members can view collaborators"
  on public.event_collaborators for select to authenticated
  using (public.is_event_member(event_id));

drop policy if exists "Owners can manage collaborators" on public.event_collaborators;
create policy "Owners can manage collaborators"
  on public.event_collaborators for all to authenticated
  using (
    exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid())
  );

-- =============================================================
-- 4. UNIVERSAL ITEMS TABLE
-- One table powers many category modules. Differentiated by `kind`.
-- =============================================================
-- kind values:
--   task        (timeline phases via `phase`)
--   food        (menu item)
--   beverage
--   shopping
--   logistics
--   sign
--   game
--   music       (playlist track)
--   restroom
--   decoration
--   setup
create table if not exists public.event_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null,
  phase text,                    -- 'pre' | 'day_of' | 'post' (for tasks)
  title text not null,
  description text,
  status text default 'todo',    -- 'todo' | 'in_progress' | 'done'
  assignee_id uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  position int default 0,
  -- category-specific fields packed in jsonb
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists event_items_event_id_kind_idx on public.event_items(event_id, kind);
create index if not exists event_items_event_id_phase_idx on public.event_items(event_id, phase);

alter table public.event_items enable row level security;

drop policy if exists "Members can view items" on public.event_items;
create policy "Members can view items"
  on public.event_items for select to authenticated
  using (public.is_event_member(event_id));

drop policy if exists "Editors can insert items" on public.event_items;
create policy "Editors can insert items"
  on public.event_items for insert to authenticated
  with check (public.can_edit_event(event_id));

drop policy if exists "Editors can update items" on public.event_items;
create policy "Editors can update items"
  on public.event_items for update to authenticated
  using (public.can_edit_event(event_id));

drop policy if exists "Editors can delete items" on public.event_items;
create policy "Editors can delete items"
  on public.event_items for delete to authenticated
  using (public.can_edit_event(event_id));

-- =============================================================
-- 5. ACTIVITY LOG (lightweight)
-- =============================================================
create table if not exists public.event_activity (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  message text not null,
  created_at timestamptz default now()
);

alter table public.event_activity enable row level security;

drop policy if exists "Members can view activity" on public.event_activity;
create policy "Members can view activity"
  on public.event_activity for select to authenticated
  using (public.is_event_member(event_id));

drop policy if exists "Editors can write activity" on public.event_activity;
create policy "Editors can write activity"
  on public.event_activity for insert to authenticated
  with check (public.can_edit_event(event_id));

-- =============================================================
-- 6. REALTIME
-- =============================================================
-- Enable realtime for tables (Supabase managed publication)
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.events';
  exception when duplicate_object then null; end;
  begin
    execute 'alter publication supabase_realtime add table public.event_items';
  exception when duplicate_object then null; end;
  begin
    execute 'alter publication supabase_realtime add table public.event_collaborators';
  exception when duplicate_object then null; end;
  begin
    execute 'alter publication supabase_realtime add table public.event_activity';
  exception when duplicate_object then null; end;
end $$;

-- =============================================================
-- 7. RPC: invite collaborator by email
-- =============================================================
create or replace function public.invite_collaborator(_event_id uuid, _email text, _role text default 'editor')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  _profile public.profiles%rowtype;
begin
  -- only owner can invite
  if not exists (select 1 from public.events e where e.id = _event_id and e.owner_id = auth.uid()) then
    raise exception 'Only the event owner can invite collaborators';
  end if;

  select * into _profile from public.profiles where lower(email) = lower(_email) limit 1;

  if _profile.id is null then
    -- store as pending invite (email-only row not possible with PK on user_id; return info)
    return json_build_object('status', 'pending', 'message', 'No user with that email yet. Ask them to sign up; you can then invite them.');
  end if;

  insert into public.event_collaborators(event_id, user_id, role, invited_email)
  values (_event_id, _profile.id, coalesce(_role, 'editor'), _email)
  on conflict (event_id, user_id) do update set role = excluded.role;

  return json_build_object('status', 'added', 'user_id', _profile.id, 'display_name', _profile.display_name);
end;
$$;

grant execute on function public.invite_collaborator(uuid, text, text) to authenticated;
