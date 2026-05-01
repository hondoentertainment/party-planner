-- Party Planner — pending invitations for unsigned-up users
--
-- Today, `invite_collaborator` only succeeds when the invitee already has a
-- profile. This migration adds a holding table so owners can invite by email
-- before the recipient signs up, and the invite is auto-claimed at first
-- sign-in based on email match. Idempotent / safe to re-run.

-- citext for case-insensitive email comparisons.
create extension if not exists citext;

-- =============================================================
-- 1. PENDING INVITATIONS TABLE
-- =============================================================
create table if not exists public.pending_event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  email citext not null,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  claimed_at timestamptz null,
  unique (event_id, email)
);

create index if not exists pending_event_invitations_email_idx
  on public.pending_event_invitations (email);

create index if not exists pending_event_invitations_event_id_idx
  on public.pending_event_invitations (event_id);

alter table public.pending_event_invitations enable row level security;

-- Owners can see / manage their event's pending invites.
drop policy if exists "Owners can view pending invitations" on public.pending_event_invitations;
create policy "Owners can view pending invitations"
  on public.pending_event_invitations for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = pending_event_invitations.event_id
        and e.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners can insert pending invitations" on public.pending_event_invitations;
create policy "Owners can insert pending invitations"
  on public.pending_event_invitations for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners can delete pending invitations" on public.pending_event_invitations;
create policy "Owners can delete pending invitations"
  on public.pending_event_invitations for delete to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = pending_event_invitations.event_id
        and e.owner_id = auth.uid()
    )
  );

-- Authenticated users can see invites awaiting their own email.
drop policy if exists "Invitees can view their pending invitations" on public.pending_event_invitations;
create policy "Invitees can view their pending invitations"
  on public.pending_event_invitations for select to authenticated
  using (
    pending_event_invitations.email = (auth.jwt() ->> 'email')::citext
  );

-- =============================================================
-- 2. invite_collaborator — extended to write to pending table
-- =============================================================
create or replace function public.invite_collaborator(_event_id uuid, _email text, _role text default 'editor')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  _profile public.profiles%rowtype;
  _email_norm citext;
  _role_norm text;
  _pending public.pending_event_invitations%rowtype;
begin
  -- Only the event owner can invite.
  if not exists (
    select 1 from public.events e
    where e.id = _event_id and e.owner_id = auth.uid()
  ) then
    raise exception 'Only the event owner can invite collaborators';
  end if;

  _email := btrim(coalesce(_email, ''));
  if _email = '' then
    raise exception 'An email address is required';
  end if;
  _email_norm := _email::citext;

  _role_norm := coalesce(_role, 'editor');
  if _role_norm not in ('editor', 'viewer') then
    raise exception 'Role must be editor or viewer';
  end if;

  select * into _profile
  from public.profiles
  where lower(email) = lower(_email)
  limit 1;

  if _profile.id is not null then
    insert into public.event_collaborators(event_id, user_id, role, invited_email)
    values (_event_id, _profile.id, _role_norm, _email)
    on conflict (event_id, user_id) do update set role = excluded.role;

    -- Tidy up any pending row for the same email/event.
    delete from public.pending_event_invitations
    where event_id = _event_id and email = _email_norm;

    return json_build_object(
      'status', 'added',
      'user_id', _profile.id,
      'display_name', _profile.display_name,
      'email', _profile.email
    );
  end if;

  -- No profile yet — store as a pending invite. Idempotent on (event_id, email).
  insert into public.pending_event_invitations(event_id, email, role, invited_by)
  values (_event_id, _email_norm, _role_norm, auth.uid())
  on conflict (event_id, email) do update
    set role = excluded.role,
        expires_at = now() + interval '30 days',
        claimed_at = null,
        invited_by = excluded.invited_by
  returning * into _pending;

  return json_build_object(
    'status', 'pending',
    'email', _email,
    'message', 'Invitation sent. They''ll get access when they sign up.',
    'invite_token', _pending.token
  );
end;
$$;

revoke all on function public.invite_collaborator(uuid, text, text) from public;
grant execute on function public.invite_collaborator(uuid, text, text) to authenticated;

-- =============================================================
-- 3. claim_pending_invitations — called after sign-in / sign-up
-- =============================================================
create or replace function public.claim_pending_invitations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _email citext;
  _claimed_event_ids uuid[] := array[]::uuid[];
  _row record;
begin
  if _user_id is null then
    return jsonb_build_object('claimed', 0, 'event_ids', '[]'::jsonb);
  end if;

  _email := nullif((auth.jwt() ->> 'email'), '')::citext;
  if _email is null then
    return jsonb_build_object('claimed', 0, 'event_ids', '[]'::jsonb);
  end if;

  for _row in
    select id, event_id, role, email
    from public.pending_event_invitations
    where email = _email
      and claimed_at is null
      and expires_at > now()
    for update
  loop
    insert into public.event_collaborators(event_id, user_id, role, invited_email)
    values (_row.event_id, _user_id, _row.role, _row.email::text)
    on conflict (event_id, user_id) do nothing;

    update public.pending_event_invitations
    set claimed_at = now()
    where id = _row.id;

    _claimed_event_ids := _claimed_event_ids || _row.event_id;
  end loop;

  return jsonb_build_object(
    'claimed', coalesce(array_length(_claimed_event_ids, 1), 0),
    'event_ids', to_jsonb(_claimed_event_ids)
  );
end;
$$;

revoke all on function public.claim_pending_invitations() from public;
grant execute on function public.claim_pending_invitations() to authenticated;

-- =============================================================
-- 4. revoke_pending_invitation — owner-only delete
-- =============================================================
create or replace function public.revoke_pending_invitation(_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _row public.pending_event_invitations%rowtype;
begin
  select * into _row from public.pending_event_invitations where id = _id;
  if _row.id is null then
    return jsonb_build_object('ok', true, 'deleted', 0);
  end if;

  if not exists (
    select 1 from public.events e
    where e.id = _row.event_id and e.owner_id = auth.uid()
  ) then
    raise exception 'Only the event owner can revoke this invitation';
  end if;

  delete from public.pending_event_invitations where id = _id;
  return jsonb_build_object('ok', true, 'deleted', 1, 'event_id', _row.event_id);
end;
$$;

revoke all on function public.revoke_pending_invitation(uuid) from public;
grant execute on function public.revoke_pending_invitation(uuid) to authenticated;

-- =============================================================
-- 5. REALTIME (optional but consistent with sibling tables)
-- =============================================================
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.pending_event_invitations';
  exception when duplicate_object then null; end;
end $$;
