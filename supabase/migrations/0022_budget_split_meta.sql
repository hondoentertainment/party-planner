-- 0022_budget_split_meta.sql
--
-- Adds a meta jsonb column to event_budget_items so the BudgetModule can
-- record:
--   - paid_by_name : optional free-text fronter (when the payer isn't a
--                    registered collaborator and `paid_by uuid` cannot be
--                    used).
--   - split_with   : optional array of guest names (or emails) the host
--                    plans to bill back. Free text — the app does not
--                    join these to profiles.
--   - payment_app  : 'venmo' | 'cashapp' | 'zelle' | null
--   - payment_handle : matching handle, e.g. '@alex', '$alex',
--                      'alex@example.com'. Used to render a one-tap
--                      "Request" deep link in the budget row.
--
-- Storing this in jsonb keeps the schema flat (mirrors the event_items
-- meta convention) and avoids breaking existing rows.

alter table public.event_budget_items
  add column if not exists meta jsonb not null default '{}'::jsonb;

-- Pre-existing rows may have NULL even though the default is non-null
-- when the column was added by a previous failed migration; normalise.
update public.event_budget_items set meta = '{}'::jsonb where meta is null;
