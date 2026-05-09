-- 0023_event_cover_photos.sql
--
-- Cover-photo uploads for events.
--
-- Schema:
--   * `events.cover_image_url text` — public URL of the uploaded cover.
--     Falls back to the existing `cover_emoji` / `cover_color` gradient
--     when null. The column is included in `get_public_event_share` so
--     the public guest page and the dynamic OG image both honour it.
--
-- Storage:
--   * Bucket `event-covers` (public read) under
--     `<event_id>/<filename>` so RLS can join the leading path segment
--     against `public.can_edit_event`.
--   * INSERT / UPDATE / DELETE gated by `public.can_edit_event` so only
--     event owners + editors can write. Anyone with the public bucket
--     URL can read (matches the existing public guest-page model).
--
-- Idempotent: every step uses `if not exists` / `drop ... if exists`
-- patterns so re-running is safe.

-- 1. New column on events.
alter table public.events
  add column if not exists cover_image_url text;

-- 2. Bucket. The Supabase storage extension exposes
--    `storage.create_bucket(...)` but since we're idempotent we just
--    upsert into storage.buckets directly when the function is missing.
insert into storage.buckets (id, name, public)
values ('event-covers', 'event-covers', true)
on conflict (id) do update set public = excluded.public;

-- 3. Storage RLS policies (row-level on storage.objects).
drop policy if exists "Anyone can read event covers" on storage.objects;
create policy "Anyone can read event covers"
  on storage.objects for select
  using (bucket_id = 'event-covers');

drop policy if exists "Editors can upload event covers" on storage.objects;
create policy "Editors can upload event covers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-covers'
    and public.can_edit_event(
      (regexp_match(name, '^([0-9a-fA-F-]{36})/'))[1]::uuid
    )
  );

drop policy if exists "Editors can update event covers" on storage.objects;
create policy "Editors can update event covers"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'event-covers'
    and public.can_edit_event(
      (regexp_match(name, '^([0-9a-fA-F-]{36})/'))[1]::uuid
    )
  )
  with check (
    bucket_id = 'event-covers'
    and public.can_edit_event(
      (regexp_match(name, '^([0-9a-fA-F-]{36})/'))[1]::uuid
    )
  );

drop policy if exists "Editors can delete event covers" on storage.objects;
create policy "Editors can delete event covers"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-covers'
    and public.can_edit_event(
      (regexp_match(name, '^([0-9a-fA-F-]{36})/'))[1]::uuid
    )
  );

-- 4. Surface cover_image_url on the public share payload so the public
--    RSVP page and `/api/og` can render it without an extra round-trip.
--    We rebuild the function preserving its existing behaviour and only
--    add the new column to the JSON projection. If the function shape
--    drifts in a future migration, re-emit it there.
create or replace function public.get_public_event_share(_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _event_id uuid;
  _result jsonb;
begin
  select esl.event_id into _event_id
  from public.event_share_links esl
  where esl.token = _token
    and esl.enabled = true
    and esl.revoked_at is null
  limit 1;

  if _event_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', e.id,
      'name', e.name,
      'description', e.description,
      'theme', e.theme,
      'starts_at', e.starts_at,
      'ends_at', e.ends_at,
      'location', e.location,
      'partiful_url', e.partiful_url,
      'rsvp_count', e.rsvp_count,
      'cover_emoji', e.cover_emoji,
      'cover_color', e.cover_color,
      'cover_image_url', e.cover_image_url
    ),
    'host', (
      select jsonb_build_object(
        'display_name', p.display_name,
        'avatar_url', p.avatar_url
      )
      from public.profiles p
      where p.id = e.owner_id
    ),
    'items', coalesce(
      (select jsonb_agg(to_jsonb(i.*) order by i.position, i.created_at)
       from public.event_items i where i.event_id = e.id),
      '[]'::jsonb
    ),
    'rsvp_summary', (
      select jsonb_build_object(
        'yes', count(*) filter (where status = 'yes'),
        'maybe', count(*) filter (where status = 'maybe'),
        'no', count(*) filter (where status = 'no'),
        'pending', count(*) filter (where status is null)
      )
      from public.event_guests where event_id = e.id
    )
  ) into _result
  from public.events e
  where e.id = _event_id;

  return _result;
end;
$$;

grant execute on function public.get_public_event_share(text) to anon, authenticated;
