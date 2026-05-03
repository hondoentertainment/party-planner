-- Party Planner — first-party bug reports.
--
-- Stores user-submitted bug reports with lightweight diagnostics so support
-- and engineering can triage issues without exposing reports to other users.

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  title text not null check (char_length(trim(title)) between 3 and 160),
  description text not null check (char_length(trim(description)) between 10 and 5000),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'triaging', 'resolved', 'wontfix')),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bug_reports_reporter_idx
  on public.bug_reports(reporter_id, created_at desc);

create index if not exists bug_reports_event_idx
  on public.bug_reports(event_id, created_at desc)
  where event_id is not null;

create index if not exists bug_reports_status_idx
  on public.bug_reports(status, created_at desc);

alter table public.bug_reports enable row level security;

revoke all on public.bug_reports from anon;
grant select, insert on public.bug_reports to authenticated;

drop policy if exists "Users see own bug reports" on public.bug_reports;
create policy "Users see own bug reports"
  on public.bug_reports
  for select
  to authenticated
  using (reporter_id = auth.uid());

drop policy if exists "Users submit own bug reports" on public.bug_reports;
create policy "Users submit own bug reports"
  on public.bug_reports
  for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and (
      event_id is null
      or public.is_event_member(event_id)
    )
  );

-- service_role bypasses RLS for internal triage, status updates, exports, and
-- future GitHub/Slack automation.
