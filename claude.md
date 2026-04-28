# Party Planner — context for AI assistants

## Purpose

Vite + React (TypeScript) app for collaborative party planning: events, per-category modules (food, music, shopping, etc.), real-time Supabase, Partiful links, activity feed, optional email and web push. User-facing details and setup: [README.md](./README.md). Production and migrations: [OPERATIONS.md](./OPERATIONS.md).

## Stack

- **Vite 8**, **React 19**, **TypeScript**, **Tailwind 3**
- **react-router-dom** — routing in [src/App.tsx](src/App.tsx)
- **@supabase/supabase-js** — client in [src/lib/supabase.ts](src/lib/supabase.ts); auth + profile in [src/lib/auth.tsx](src/lib/auth.tsx)
- **@dnd-kit** — sortable rows/lists
- Optional: **Sentry** (`VITE_SENTRY_DSN`), **PWA** (`vite-plugin-pwa` in [vite.config.ts](vite.config.ts))
- E2E: **Playwright** — `npm run test:e2e`, **`npm run verify`**, or **`npm run ci`** (lint + build + e2e; [e2e/](e2e/)). [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the same. Preview defaults to port **4291**; [playwright.config.ts](playwright.config.ts) loads `E2E_*` from `.env.local`. Set `VITE_SUPABASE_*` and `E2E_*` in GitHub secrets for full CI.
- **ESLint** — `npm run lint`; `react-hooks/set-state-in-effect` and `react-hooks/refs` are off for this codebase; `react-refresh/only-export-components` is off under `src/lib/`.

## Local dev

```bash
cp .env.example .env.local  # set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm install
npm run dev                 # default http://localhost:5173
```

```bash
npm run build
npm run lint
npm run verify      # lint + build + playwright (optional E2E_* in .env or env)
npm run db:types   # optional; writes src/lib/database.types.gen.ts
```

## Supabase and schema

- SQL lives under `supabase/migrations/` — apply in order via **`npm run db:push`** after `supabase link`, or paste into the SQL editor. Post-deploy checks: `supabase/verify_remote.sql`. See [OPERATIONS.md](OPERATIONS.md) for 0001, 0004 (collaborators may **leave** an event), 0002–0003, 0005 notification settings fallback, pg_net, Edge functions, and secrets.
- Types: hand-maintained [src/lib/database.types.ts](src/lib/database.types.ts). Run `npm run db:types` (needs `SUPABASE_PROJECT_ID` + `npx supabase login`) to write `database.types.gen.ts` for diffing.

## Auth

- Sign up / sign in (email+password) and optional magic link paths live in [src/pages/AuthPage.tsx](src/pages/AuthPage.tsx).
- **Password reset:** `resetPasswordForEmail` redirects to `${origin}/update-password`. In **Supabase → Authentication → URL configuration**, set **Site URL** and add **Redirect URLs** including your production `https://<host>/update-password` and `http://localhost:5173/update-password`. Without these, reset links fail or redirect incorrectly.
- Recovery mode (`PASSWORD_RECOVERY` / hash `type=recovery`) shows [src/pages/UpdatePasswordPage.tsx](src/pages/UpdatePasswordPage.tsx) only, wired in [src/App.tsx](src/App.tsx).

## Code layout (high level)

- `src/pages/` — `Dashboard`, `EventPage` (nested routes for modules; tab config in [eventPageTabs.ts](src/pages/eventPageTabs.ts)), `CalendarPage`, `AuthPage`, `UpdatePasswordPage`
- `src/modules/` — event-scoped feature UI (e.g. `FoodModule`, `GuestModule`, `ChecklistModule`)
- `src/components/` — `AppShell`, shared dialogs, `ActivityFeed`, etc.
- `src/lib/` — `auth`, `supabase`, `database.types`, `exportIcs` (calendar download), helpers (`format`, `activity`, `templates`, `duplicateEvent`, …)
- **Team:** [src/modules/EventSettings.tsx](src/modules/EventSettings.tsx) — owner invites; collaborators can **Leave event** (after migration `0004`) and **Download .ics**.
- **A11y:** prefer associated labels (`htmlFor` / `id`), `aria-live` / `role="alert"` for errors, dialog patterns in [src/components/Modal.tsx](src/components/Modal.tsx), skip link + `#main-content` in [src/components/AppShell.tsx](src/components/AppShell.tsx).

## Conventions

- Prefer matching existing component patterns, Tailwind styling, and optimistic/realtime patterns already used in event modules.
- Schema and RLS changes belong in new migration files, not ad-hoc dashboard edits, when possible.
- Do not add new root-level user docs unless asked; [README.md](README.md) and [OPERATIONS.md](OPERATIONS.md) are the canonical setup references.

## Deploy

- [vercel.json](vercel.json) is configured for the Vite SPA. Set the same `VITE_*` env vars on Vercel as locally.
