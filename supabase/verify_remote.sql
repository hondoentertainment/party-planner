-- Run after migrations / setup (read-only checks).
-- Safe for production. Also works with: npx supabase db query --linked --file supabase/verify_remote.sql

with checks as (
  select
    1 as sort_order,
    '0004 leave-event policy' as check_name,
    exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'event_collaborators'
        and policyname = 'Collaborators can remove own membership'
    ) as ok,
    'run 0004_collaborator_self_delete.sql' as fix

  union all
  select
    2,
    '0002 assignment trigger',
    exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'event_items'
        and t.tgname = 'notify_item_assignment'
        and not t.tgisinternal
    ),
    'run 0002_notifications.sql'

  union all
  select
    3,
    'pg_net extension',
    exists (select 1 from pg_extension where extname = 'pg_net'),
    'enable pg_net or re-run 0002_notifications.sql'

  union all
  select
    4,
    'notification functions URL',
    coalesce(current_setting('app.functions_url', true), '') <> ''
      or exists (
        select 1 from information_schema.tables
        where table_schema = 'private' and table_name = 'app_settings'
      ) and exists (
        select 1 from private.app_settings
        where key = 'app.functions_url' and value <> ''
      ),
    'set app.functions_url GUC or insert private.app_settings row'

  union all
  select
    5,
    'notification service role key',
    coalesce(current_setting('app.service_role_key', true), '') <> ''
      or exists (
        select 1 from information_schema.tables
        where table_schema = 'private' and table_name = 'app_settings'
      ) and exists (
        select 1 from private.app_settings
        where key = 'app.service_role_key' and value <> ''
      ),
    'set app.service_role_key GUC or insert private.app_settings row'

  union all
  select
    6,
    '0003 web push table',
    exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'web_push_subscriptions'
    ),
    'run 0003_web_push.sql'

  union all
  select
    7,
    '0006 feature expansion tables',
    exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'user_notifications'
    ) and exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'event_budget_items'
    ) and exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'event_vendors'
    ) and exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'user_event_templates'
    ) and exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'event_share_links'
    ) and exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'event_wrap_ups'
    ),
    'run 0006_feature_expansion_mvp.sql'

  union all
  select
    8,
    'public share RPC',
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'get_public_event_share'
    ),
    'run 0006_feature_expansion_mvp.sql'

  union all
  select
    9,
    '0007 server-generated share links',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'event_share_links'
        and column_name = 'revoked_at'
    ) and exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'create_event_share_link'
    ) and not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'event_share_links'
        and policyname = 'Editors can insert share links'
    ) and exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'event_share_links'
        and policyname = 'Editors can view share links'
    ) and not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'event_share_links'
        and policyname = 'Members can view share links'
    ),
    'run 0007_production_hardening.sql'

  union all
  select
    10,
    '0008 public share details',
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'get_public_event_share'
        and pg_get_functiondef(p.oid) like '%dietary%'
        and pg_get_functiondef(p.oid) like '%assignee_id'', null%'
    ),
    'run 0008_public_share_details.sql'

  union all
  select
    11,
    'activity notification trigger',
    exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'event_activity'
        and t.tgname = 'notify_activity_members'
        and not t.tgisinternal
    ) and not exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'event_activity'
        and t.tgname = 'create_activity_notifications'
        and not t.tgisinternal
    ),
    'run 0008_public_share_details.sql'
)
select
  check_name,
  case when ok then 'OK' else 'MISSING' end as status,
  case when ok then null else fix end as next_step
from checks
order by sort_order;
