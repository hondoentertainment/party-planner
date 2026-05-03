import type { NotificationOptOutKind } from "./database.types";

/** Scheduled reminder kinds (migration 0013) excluding the meta `all` row. */
export type ReminderEmailKind = Exclude<NotificationOptOutKind, "all">;

/** User-facing labels — order matches cadence. Shared by Settings and per-event mute UI. */
export const REMINDER_EMAIL_KIND_META: Array<{
  kind: ReminderEmailKind;
  label: string;
  hint: string;
}> = [
  {
    kind: "pre_7d",
    label: "T-7 days reminder",
    hint: "Quick checklist a week out — unassigned tasks, missing RSVPs.",
  },
  {
    kind: "pre_3d",
    label: "T-3 days reminder",
    hint: "Lock-it-in nudge with what still needs attention.",
  },
  {
    kind: "pre_1d",
    label: "T-1 day reminder",
    hint: "Final day-before pulse with the run-of-show link.",
  },
  {
    kind: "wrap_up_1d",
    label: "Post-party wrap-up",
    hint: "One day after the event: capture lessons learned and final spend.",
  },
];
