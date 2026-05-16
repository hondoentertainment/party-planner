import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, PartyPopper } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { PublicRsvpPayload } from "../../lib/database.types";
import type { PublicRsvpRecoveryArgs } from "../../lib/types.rsvpRecovery";
import {
  friendlyRsvpError,
  RSVP_ACCENT,
  RSVP_ICON,
  RSVP_LABEL,
  type RsvpChoice,
  type StoredRsvp,
} from "./rsvpShared";

export interface RsvpFormProps {
  token: string;
  eventName: string;
  initial: StoredRsvp | null;
  /**
   * Pre-selection from the lightweight placeholder rendered in the main public
   * chunk. When set on first mount, the form expands its detail fields and
   * focuses the name input — preserving the original "tap a choice → focus
   * name" interaction even though the form now arrives via a lazy chunk.
   */
  initialChoice: RsvpChoice | null;
  partifulUrl: string | null;
  isUpdate: boolean;
  recoveryToken: string | null;
  recoveryLoading: boolean;
  onCancel?: () => void;
  onClearRecovery: () => void;
  onSubmitted: (saved: StoredRsvp) => void;
}

export default function RsvpForm({
  token,
  eventName,
  initial,
  initialChoice,
  partifulUrl,
  isUpdate,
  recoveryToken,
  recoveryLoading,
  onCancel,
  onClearRecovery,
  onSubmitted,
}: RsvpFormProps) {
  const baseId = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [rsvp, setRsvp] = useState<RsvpChoice | null>(
    initial?.rsvp ?? initialChoice ?? null,
  );
  const [plusOnes, setPlusOnes] = useState<number>(initial?.plus_ones ?? 0);
  const [dietary, setDietary] = useState(initial?.dietary ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const wasCollapsedRef = useRef<boolean>(rsvp === null);
  // Auto-focus on first mount when the placeholder pre-selected a choice and
  // the user hasn't provided a name yet — recreates the original UX where
  // picking Yes/Maybe/No moves focus to the name field.
  const shouldAutoFocusOnMountRef = useRef<boolean>(
    rsvp !== null && !(initial?.name ?? "").trim(),
  );

  useEffect(() => {
    if (rsvp !== null && wasCollapsedRef.current) {
      wasCollapsedRef.current = false;
      window.requestAnimationFrame(() => {
        nameInputRef.current?.focus({ preventScroll: false });
      });
    }
  }, [rsvp]);

  useEffect(() => {
    if (!shouldAutoFocusOnMountRef.current) return;
    shouldAutoFocusOnMountRef.current = false;
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus({ preventScroll: false });
    });
  }, []);

  useEffect(() => {
    if (!initial) return;
    setName(initial.name);
    setEmail(initial.email);
    setRsvp(initial.rsvp);
    setPlusOnes(initial.plus_ones);
    setDietary(initial.dietary);
    setNotes(initial.notes);
    wasCollapsedRef.current = false;
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (rsvp === null) {
      setError("Pick Yes, Maybe, or Can't make it before submitting.");
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please tell us your name so the host knows who's coming.");
      return;
    }
    setSubmitting(true);
    const payload: PublicRsvpPayload = {
      name: trimmedName,
      email: email.trim() || undefined,
      rsvp,
      plus_ones: Math.max(0, Math.floor(plusOnes || 0)),
      dietary: dietary.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    const args: PublicRsvpRecoveryArgs = {
      _token: token,
      _payload: payload,
    };
    if (recoveryToken) args._recovery_token = recoveryToken;

    const { data, error: rpcError } = await supabase.rpc("submit_public_rsvp", args);
    setSubmitting(false);
    if (rpcError) {
      setError(friendlyRsvpError(rpcError.message));
      return;
    }
    const result = (data ?? null) as { ok?: boolean } | null;
    if (!result?.ok) {
      setError("We couldn't save your RSVP. Please try again.");
      return;
    }
    onSubmitted({
      name: trimmedName,
      email: payload.email ?? "",
      rsvp,
      plus_ones: payload.plus_ones,
      dietary: payload.dietary ?? "",
      notes: payload.notes ?? "",
      submitted_at: new Date().toISOString(),
    });
  };

  const detailsVisible = rsvp !== null;

  return (
    <section className="card p-5 space-y-4" aria-label="RSVP to this event">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold flex items-center gap-2">
            <PartyPopper size={18} className="text-brand-600" aria-hidden />
            {isUpdate ? "You're updating your RSVP" : `RSVP to ${eventName}`}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {isUpdate
              ? "Make any changes below, then save."
              : "Tap one to start — we'll ask for the rest after."}
          </p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost text-xs">
            Cancel
          </button>
        )}
      </div>

      {recoveryLoading && (
        <p className="text-xs text-slate-500" role="status" aria-live="polite">
          Loading your saved RSVP…
        </p>
      )}
      {isUpdate && recoveryToken && (
        <div className="text-xs text-slate-500 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <span>You're editing via your recovery link.</span>
          <button
            type="button"
            onClick={onClearRecovery}
            className="text-slate-600 hover:text-slate-800 underline"
          >
            Start a new RSVP instead
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <fieldset>
          <legend className="label">Are you coming?</legend>
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-2"
            role="radiogroup"
            aria-label="RSVP response"
          >
            {(["yes", "maybe", "no"] as const).map((choice) => {
              const id = `${baseId}-rsvp-${choice}`;
              const active = rsvp === choice;
              const Icon = RSVP_ICON[choice];
              const accent = RSVP_ACCENT[choice];
              return (
                <label
                  key={choice}
                  htmlFor={id}
                  className={[
                    "cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border-2 transition-colors min-h-[48px]",
                    "focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-1",
                    accent.ring,
                    active ? accent.active : accent.idle,
                  ].join(" ")}
                >
                  <input
                    id={id}
                    type="radio"
                    name={`${baseId}-rsvp`}
                    value={choice}
                    checked={active}
                    onChange={() => setRsvp(choice)}
                    className="sr-only"
                  />
                  <Icon size={18} aria-hidden />
                  <span>{RSVP_LABEL[choice]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div
          ref={detailsRef}
          className={`space-y-3 transition-opacity ${
            detailsVisible
              ? "opacity-100"
              : "opacity-0 pointer-events-none h-0 overflow-hidden"
          }`}
          aria-hidden={!detailsVisible}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor={`${baseId}-name`}>
                Your name <span className="text-rose-600" aria-hidden>*</span>
              </label>
              <input
                ref={nameInputRef}
                id={`${baseId}-name`}
                className="input"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
                aria-required="true"
              />
            </div>
            <div>
              <label className="label" htmlFor={`${baseId}-email`}>Email (optional)</label>
              <input
                id={`${baseId}-email`}
                type="email"
                autoComplete="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@example.com"
              />
              <p className="text-xs text-slate-400 mt-1">
                Adding email lets you edit this RSVP from any device later.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor={`${baseId}-plus-ones`}>Plus-ones</label>
              <input
                id={`${baseId}-plus-ones`}
                type="number"
                inputMode="numeric"
                min={0}
                max={50}
                className="input"
                value={plusOnes}
                onChange={(e) =>
                  setPlusOnes(Math.max(0, Math.min(50, Number(e.target.value) || 0)))
                }
              />
            </div>
            <div>
              <label className="label" htmlFor={`${baseId}-dietary`}>Dietary needs</label>
              <input
                id={`${baseId}-dietary`}
                className="input"
                value={dietary}
                onChange={(e) => setDietary(e.target.value)}
                placeholder="e.g. vegetarian, nut allergy"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor={`${baseId}-notes`}>
              Anything else for the host?
            </label>
            <textarea
              id={`${baseId}-notes`}
              className="input min-h-[80px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bringing a dish? Need a ride?"
            />
          </div>
        </div>

        {error && (
          <div
            className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          {partifulUrl ? (
            <a
              className="text-xs text-slate-500 hover:text-slate-700 underline decoration-slate-300 inline-flex items-center gap-1"
              href={partifulUrl}
              target="_blank"
              rel="noreferrer"
            >
              Or RSVP on Partiful <ExternalLink size={11} aria-hidden />
            </a>
          ) : (
            <span aria-hidden />
          )}
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || rsvp === null}
          >
            {submitting
              ? "Sending…"
              : isUpdate
                ? "Save changes"
                : initial
                  ? "Update RSVP"
                  : "Send RSVP"}
          </button>
        </div>
      </form>
    </section>
  );
}
