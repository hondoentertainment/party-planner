-- Party Planner — brand color backfill.
--
-- One-shot UPDATE that migrates rows still holding the legacy magenta
-- default (#cc38f5) to the new indigo brand (#6366f1). This catches
-- events/templates created before the brand refresh that the user never
-- explicitly recolored.
--
-- Rows with any other color value are intentionally left alone — the
-- user explicitly picked those from the swatch grid.
--
-- We deliberately do NOT bump updated_at: this is a brand migration,
-- not a content edit, and bumping it would mis-trigger any "recently
-- modified" UI / activity-feed surface.

update public.events
  set cover_color = '#6366f1'
  where cover_color = '#cc38f5';

update public.user_event_templates
  set color = '#6366f1'
  where color = '#cc38f5';
