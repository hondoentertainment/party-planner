# Mobile Visual QA — iPhone 14 Pro

**Date:** Apr 30, 2026
**Spec:** [`mobile-snapshots.spec.ts`](./mobile-snapshots.spec.ts)
**Viewport:** `devices["iPhone 14 Pro"]` — 393×852 logical, DPR 3
**Build:** `npm run build` against `vite preview` on port `4291`

## Summary

Captured **2 of 5** redesigned mobile surfaces. The other three require an
authenticated session and a real Supabase project, neither of which is
available in this environment (`.env.local` has empty `VITE_SUPABASE_URL`
/ `VITE_SUPABASE_ANON_KEY`, and no `E2E_EMAIL` / `E2E_PASSWORD`). Build
was performed with placeholder Supabase env vars (passed via shell, not
written to disk) so the app would render past the `SetupNotice` gate
and let us QA the auth + public-share surfaces.

Both captured surfaces look ready to ship. The auth page collapses to a
single-column form on mobile with a clear hierarchy and an oversized,
high-contrast "Start planning — it's free" CTA. The public share-link
empty state renders the centered card variant with a usable "Go to
Party Planner" fallback link.

---

## 1. Auth page (sign-up default state) — `/`

**Screenshot:** [`screenshots/01-auth-page-mobile.png`](./screenshots/01-auth-page-mobile.png)

Observations:

- **Mobile collapse works as designed** — the desktop 2-column hero
  (FEATURES list + form) collapses cleanly to a single-column card. Brand
  mark + product name sit at the top of the card; no overflow, no
  horizontal scroll.
- **Touch targets pass ≥44 px** — primary CTA reads ~56 px tall, the
  Sign up / Sign in tab pills are ~48 px tall, and the form inputs
  (Name / Email / Password) are ~52 px tall. All comfortably tappable.
- **CTA has strong visual weight** — the brand-purple "Start planning —
  it's free" button is full-width with a soft shadow halo, paired with
  reassurance microcopy ("No credit card. Takes about 30 seconds.")
  immediately below — good conversion stack.
- **Hierarchy is clear** — H1 "Create your account", subhead "Start
  planning your next party in seconds.", then segmented mode toggle,
  then form. Eye flows top-to-bottom without competing with the
  background gradient.
- **Minor nit** — the inactive "Sign in" tab has slightly lower text
  contrast against its grey background; still readable but on the edge
  for WCAG AA on small text. The card sits inside an outer page padding
  so the safe-area at the bottom is implicitly respected — worth
  re-checking on a real device with the home indicator visible.

**Verdict:** Ship.

---

## 2. Public share-link unavailable hero — `/s/-`

**Screenshot:** [`screenshots/02-public-share-unavailable-mobile.png`](./screenshots/02-public-share-unavailable-mobile.png)

Note: This run captured the **error** variant ("Could not load share
link") because the placeholder Supabase URL fails the RPC. With a real
project the **not-found** variant ("Share link unavailable") renders
inside the same card layout — copy differs, structure is identical.

Observations:

- **Card is centered both axes** on the iPhone 14 Pro viewport with
  generous slate-50 negative space — mobile users won't have to thumb-
  scroll to find the action.
- **Primary CTA is well-sized** — "Go to Party Planner" pill is ~48 px
  tall with brand-purple fill and a soft drop-shadow; clear primary
  action, comfortable tap target.
- **Copy is concise and on-brand** — heading + 2-line body explains the
  failure without finger-pointing, then offers a recovery path. No
  technical error codes leaking through.
- **Icon could carry more weight** — the confetti-popper glyph at 36 px
  in `text-slate-300` is quite muted; consider a slightly bigger glyph
  (48 px) and/or a brand-tinted color so the empty state feels less
  flat.
- **Missing a secondary recovery affordance** — no "ask the host for a
  new link" hint, no "try a different link" affordance. Not blocking,
  but a small hint text below the CTA would soften the dead-end.

**Verdict:** Ship with tweaks (icon weight + optional secondary hint —
both nice-to-have, not blocking).

---

## Skipped surfaces

The following were intentionally skipped because their preconditions
are not met in this environment. Each test calls `test.skip()` with a
clear reason so re-running with credentials will pick them up
automatically.

| # | Surface | Reason skipped |
|---|---------|----------------|
| 3 | Onboarding tour modal (`/`, auto-opens after ~400 ms) | Needs `E2E_EMAIL` + `E2E_PASSWORD` and a real `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Neither is set in `.env.local` (both Supabase keys are empty strings; no E2E credentials at all). |
| 4 | Mobile bottom-sheet account menu (top-right gradient avatar) | Same as #3 — must be signed in. |
| 5 | Two-row event nav, mobile "More" sheet (`/events/:id`, tap **More**) | Same as #3 plus requires at least one event in the signed-in account. |

Additional surface **not captured** that the prompt called out as a
fallback: the full `SetupNotice` "Almost ready to party" screen. The
build used here was produced with placeholder Supabase env vars
specifically to bypass that gate so we could reach the auth + public
routes. With the workspace's real `.env.local` (empty
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`), `SetupNotice` is what
renders on every route — to capture it, rerun `npm run build` with
those env vars **unset** before re-invoking the spec, then point any
test at `/`.

## How to re-run

From the repo root:

```bash
# 1. Build (placeholder env bypasses SetupNotice for auth + public capture)
$env:VITE_SUPABASE_URL="https://placeholder.supabase.co"
$env:VITE_SUPABASE_ANON_KEY="placeholder-anon-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
npm run build

# 2. Run the spec (vite preview on :4291 is auto-started by playwright.config.ts)
npx playwright test e2e/visual-qa/mobile-snapshots.spec.ts --reporter=list
```

To unlock surfaces 3–5, also export `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `E2E_EMAIL`, and `E2E_PASSWORD` for a real
Supabase project before the build + run.
