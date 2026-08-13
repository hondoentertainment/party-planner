import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LayoutTemplate,
  Link2,
  PartyPopper,
  Users,
  type LucideIcon,
} from "lucide-react";
import { markOnboardingCompleted } from "../lib/onboarding";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
  );
}

type Step = {
  Icon: LucideIcon;
  title: string;
  body: string;
  cta: string;
};

const STEPS: Step[] = [
  {
    Icon: PartyPopper,
    title: "Welcome to Party Planner",
    body: "Plan your next party with friends — in one place. We'll show you around in 30 seconds.",
    cta: "Show me around",
  },
  {
    Icon: LayoutTemplate,
    title: "Start from a template",
    body: "Pick BBQ, birthday, cocktail party, or holiday dinner — we pre-fill the menu, shopping list, and timeline.",
    cta: "Next",
  },
  {
    Icon: Users,
    title: "Invite friends to plan with you",
    body: "Add collaborators by email. Even if they don't have an account yet, they'll get an invite. Edits sync instantly.",
    cta: "Next",
  },
  {
    Icon: Link2,
    title: "Share one link with your guests",
    body: "Generate a public guest page. Guests RSVP, see the menu and schedule, and add the event to their calendar — no login required.",
    cta: "Got it — let's plan! 🎉",
  },
];

const TOTAL = STEPS.length;

export function OnboardingTour({
  onClose,
}: {
  onClose: () => void;
}): React.JSX.Element {
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [visible, setVisible] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Fade in shortly after mount so the backdrop animates in.
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 10);
    return () => window.clearTimeout(t);
  }, []);

  // Lock body scroll while the tour is open and restore focus on unmount.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      previouslyFocused.current?.focus?.();
    };
  }, []);

  const skip = useCallback(() => {
    markOnboardingCompleted();
    onClose();
  }, [onClose]);

  const handleCta = useCallback(() => {
    if (step === TOTAL - 1) {
      markOnboardingCompleted();
      onClose();
      return;
    }
    const target = step + 1;
    setStep(target);
    setMaxReached((m) => Math.max(m, target));
  }, [step, onClose]);

  const back = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  // Forward-only after viewing: jumping to a previously-seen step is allowed.
  const goTo = useCallback(
    (target: number) => {
      if (target < 0 || target >= TOTAL) return;
      if (target > maxReached) return;
      setStep(target);
    },
    [maxReached]
  );

  // Re-focus the primary CTA whenever the active step changes.
  useEffect(() => {
    const t = window.setTimeout(() => {
      ctaRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [step]);

  // Esc closes WITHOUT marking complete; Tab cycles within the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const list = getFocusable(panelRef.current);
      if (list.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panelRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const current = STEPS[step];
  const Icon = current.Icon;
  const isLast = step === TOTAL - 1;
  const isFirst = step === 0;

  return (
    <>
      <style>{`
        @keyframes pp-onboarding-card-in {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        className={[
          "fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60]",
          "flex items-center justify-center p-4",
          "transition-opacity duration-200 ease-out",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        role="presentation"
        aria-hidden={false}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 outline-none"
          style={{ animation: "pp-onboarding-card-in 240ms ease-out both" }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key !== "Escape") e.stopPropagation();
          }}
        >
          <ol
            className="flex items-center justify-center gap-2 mb-6"
            aria-label="Tour progress"
          >
            {STEPS.map((_, i) => {
              const isActive = i === step;
              const reachable = i <= maxReached;
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    disabled={!reachable}
                    aria-label={`Go to step ${i + 1} of ${TOTAL}`}
                    aria-current={isActive ? "step" : undefined}
                    className={[
                      "block rounded-full transition-all duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
                      isActive
                        ? "w-6 h-2 bg-brand-600"
                        : reachable
                          ? "w-2 h-2 bg-slate-300 hover:bg-slate-400"
                          : "w-2 h-2 bg-slate-300 cursor-not-allowed",
                    ].join(" ")}
                  />
                </li>
              );
            })}
          </ol>

          <div className="flex justify-center mb-5">
            <span
              className="w-16 h-16 rounded-full bg-brand-50 text-brand-600 grid place-items-center shadow-pop"
              aria-hidden
            >
              <Icon size={32} />
            </span>
          </div>

          <h2
            id={titleId}
            className="font-display text-xl font-bold text-center text-slate-900"
          >
            {current.title}
          </h2>
          <p className="mt-2 text-sm text-slate-600 text-center leading-relaxed">
            {current.body}
          </p>

          <div className="mt-6 flex items-center justify-between gap-3">
            {isFirst ? (
              <span aria-hidden />
            ) : (
              <button type="button" onClick={back} className="btn-ghost">
                <ArrowLeft size={16} aria-hidden />
                Back
              </button>
            )}
            <button
              ref={ctaRef}
              type="button"
              onClick={handleCta}
              className="btn-primary ml-auto"
            >
              {current.cta}
              {!isLast && <ArrowRight size={16} aria-hidden />}
            </button>
          </div>

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={skip}
              className="text-xs text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline rounded px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              Skip tour
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
