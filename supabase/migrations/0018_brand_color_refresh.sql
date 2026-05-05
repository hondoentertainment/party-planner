-- Party Planner — brand color refresh (magenta -> indigo).
--
-- Update the DEFAULT for event/template cover colors so newly created
-- rows pick up the new brand color (#6366f1) instead of the legacy
-- magenta (#cc38f5). Existing rows are intentionally left untouched:
--   * Some users explicitly chose a different color from the picker;
--     stomping those values would be a regression.
--   * Rows that still hold the old default will migrate lazily as
--     users edit them. We can run a one-shot UPDATE later if desired.

alter table public.events
  alter column cover_color set default '#6366f1';

alter table public.user_event_templates
  alter column color set default '#6366f1';
