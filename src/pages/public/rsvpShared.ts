import { Check, HelpCircle, X } from "lucide-react";

export type RsvpChoice = "yes" | "maybe" | "no";

export interface StoredRsvp {
  name: string;
  email: string;
  rsvp: RsvpChoice;
  plus_ones: number;
  dietary: string;
  notes: string;
  submitted_at: string;
}

export const RSVP_LABEL: Record<RsvpChoice, string> = {
  yes: "I'm in",
  maybe: "Maybe",
  no: "Can't make it",
};

export const RSVP_ICON: Record<RsvpChoice, typeof Check> = {
  yes: Check,
  maybe: HelpCircle,
  no: X,
};

export const RSVP_ACCENT: Record<
  RsvpChoice,
  { active: string; idle: string; ring: string }
> = {
  yes: {
    active: "bg-emerald-600 text-white border-emerald-600",
    idle: "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50",
    ring: "focus-visible:ring-emerald-300",
  },
  maybe: {
    active: "bg-amber-500 text-white border-amber-500",
    idle: "bg-white text-amber-700 border-amber-200 hover:bg-amber-50",
    ring: "focus-visible:ring-amber-300",
  },
  no: {
    active: "bg-rose-600 text-white border-rose-600",
    idle: "bg-white text-rose-700 border-rose-200 hover:bg-rose-50",
    ring: "focus-visible:ring-rose-300",
  },
};

export function friendlyRsvpError(message: string): string {
  if (!message) return "We couldn't save your RSVP. Please try again.";
  if (/already received an RSVP/i.test(message)) return message;
  if (/share link is no longer/i.test(message)) return message;
  if (/RSVP must be/i.test(message)) return message;
  if (/your name/i.test(message)) return message;
  if (/recovery link is no longer/i.test(message)) return message;
  return "We couldn't save your RSVP. Please try again.";
}
