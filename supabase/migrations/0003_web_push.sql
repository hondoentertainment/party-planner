-- Web Push subscriptions (browser push for assignment notifications)
-- The Edge Function `notify-assignment` reads these with the service role.

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz default now(),
  unique (user_id, endpoint)
);

create index if not exists web_push_subscriptions_user_id_idx
  on public.web_push_subscriptions (user_id);

alter table public.web_push_subscriptions enable row level security;

drop policy if exists "Users manage own push subscriptions" on public.web_push_subscriptions;
create policy "Users manage own push subscriptions"
  on public.web_push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Realtime (optional; client refetches on save)
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.web_push_subscriptions';
  exception when duplicate_object then null; end;
end $$;
