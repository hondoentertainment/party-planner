-- Party Planner — per-share-link cool-down for `notify-share`.
--
-- The notify-share Edge Function lets any signed-in editor of an event email
-- themselves (or, after this migration, the share row) a copy of the public
-- share URL. It is JWT-gated and RLS-scoped, but a compromised session or a
-- runaway client could still call it in a tight loop and burn Resend quota.
--
-- This migration introduces the storage half of a 60-second cool-down on
-- `event_share_links.last_emailed_at`. The Edge Function reads the column
-- before sending, returns 429 if the previous send was inside the window,
-- and writes `now()` after a successful send.
--
-- Sibling rate limits already shipped:
--   * 0017 — public bug-report cap (20/event/hour)
--   * 0020 — signed-in bug-report cap (30/user/hour) + 60s cool-down on
--            request_rsvp_recovery (anon-callable email path)
--
-- Idempotent and safe to re-run.

-- =============================================================
-- 1. last_emailed_at column on event_share_links
-- =============================================================
alter table public.event_share_links
  add column if not exists last_emailed_at timestamptz;

comment on column public.event_share_links.last_emailed_at is
  'Party Planner 0021: timestamp of last notify-share send. Read by the '
  'notify-share Edge Function as a 60s cool-down to stop signed-in callers '
  'from burning Resend quota.';

-- Index keeps the cool-down read fast even with thousands of share links.
-- Partial index (WHERE last_emailed_at IS NOT NULL) so the index only stores
-- rows that have ever been emailed — most rows never will be.
create index if not exists event_share_links_last_emailed_at_idx
  on public.event_share_links(last_emailed_at)
  where last_emailed_at is not null;

-- =============================================================
-- 2. Editors can update last_emailed_at on their share links
-- =============================================================
-- 0007 added a SELECT policy ("Editors can view share links") but no UPDATE
-- policy because share links are server-generated. We add a tightly scoped
-- UPDATE policy that lets editors touch ONLY the cool-down column. Other
-- columns (token, enabled, revoked_at, expires_at) are still mutated only by
-- SECURITY DEFINER functions or the service role.
--
-- Postgres RLS doesn't have per-column USING clauses, so the policy gate is
-- "you can edit the event"; column-level lockdown comes from a CHECK in the
-- companion trigger below — every UPDATE that changes anything except
-- `last_emailed_at` (and `updated_at`, if/when added) is rejected.
drop policy if exists "Editors can touch share-link cooldown" on public.event_share_links;
create policy "Editors can touch share-link cooldown"
  on public.event_share_links
  for update
  to authenticated
  using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

create or replace function public.event_share_links_guard_update()
returns trigger
language plpgsql
as $$
begin
  -- Service role / SECURITY DEFINER callers (auth.uid() is null) bypass this
  -- guard so notify-share, create_event_share_link, and direct admin SQL all
  -- continue to work. End-user UPDATEs are restricted to last_emailed_at.
  if auth.uid() is null then
    return new;
  end if;

  if new.id            is distinct from old.id            or
     new.event_id      is distinct from old.event_id      or
     new.token         is distinct from old.token         or
     new.label         is distinct from old.label         or
     new.enabled       is distinct from old.enabled       or
     new.expires_at    is distinct from old.expires_at    or
     new.created_by    is distinct from old.created_by    or
     new.created_at    is distinct from old.created_at    or
     new.revoked_at    is distinct from old.revoked_at then
    raise exception 'event_share_links: only last_emailed_at is user-mutable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists event_share_links_guard_update on public.event_share_links;
create trigger event_share_links_guard_update
  before update on public.event_share_links
  for each row execute function public.event_share_links_guard_update();

-- =============================================================
-- 3. Sentinel for verify_remote.sql
-- =============================================================
comment on function public.event_share_links_guard_update() is
  'Party Planner 0021: row-level guard so end-user UPDATEs to event_share_links '
  'can only touch last_emailed_at (cool-down column for notify-share).';
