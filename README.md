# Party Planner

A collaborative party planning app. Plan multiple events, track every detail
from menu to music, and work together in real-time. Integrates with
[Partiful](https://partiful.com/) by linking events and tracking RSVPs.

## Features

- **Multiple events** — keep all your parties in one workspace
- **Calendar view** — see every event at a glance
- **Real-time collaboration** — invite friends to plan together via Supabase
- **Three planning phases** — pre-party, day-of, and post-party tasks
- **Partiful integration** — link your Partiful event URL and track RSVP count
- **Rich category tooling**:
  - 🍽️ Food (menu builder by course with dietary tags & servings)
  - 🥂 Beverages (cocktails, beer, wine, non-alc, with quantities/units)
  - 🛒 Food purchasing (shopping list grouped by store, est vs actual cost)
  - 🚚 Logistics (vendors, parking, transport)
  - 🪧 Signs (text + location)
  - 🎲 Games (supplies + station)
  - 🎵 Music (playlists + per-set tracks)
  - 🚻 Restrooms (supplies + signage)
  - 🎨 Decorations (areas + quantities)
  - 🛋️ Setup & teardown (with timing)
- **Guest list** — paste from Partiful, track RSVP, dietary needs, plus-ones, auto-flags menu under-capacity
- **Assignments** — assign any item to any team member
- **Activity feed** — see who did what, in real-time
- **Email notifications** — Resend-powered emails when you're assigned a task
- **Web push (optional)** — browser notifications for assignments; uses the same VAPID key pair as the Edge function (see [OPERATIONS.md](./OPERATIONS.md))
- **Templates & duplicate** — start from BBQ / Birthday / Cocktail / Holiday Dinner, or clone an existing event
- **Drag-and-drop ordering** — reorder timeline tasks, music tracks, shopping items
- **Per-category progress** — see how each area is going on the overview
- **Budgets** — set a budget; track shopping spend vs estimate
- **Mobile-first** — bottom-tab navigation on phones, optimistic UI, swipe-to-delete on checklist rows, large touch targets
- **PWA** — installable, precached shell for faster loads (see `vite.config.ts`)
- **Sentry (optional)** — set `VITE_SENTRY_DSN` for client error monitoring
- **CI** — GitHub Actions runs build + Playwright smoke test (`e2e/smoke.spec.ts`)

**Production / ops:** migrations order, custom domain, backups, and secrets are documented in [OPERATIONS.md](./OPERATIONS.md).

## Stack

- **Vite + React + TypeScript + Tailwind CSS**
- **Supabase** (Postgres, Auth, Realtime, Row Level Security)
- **react-router-dom** for routing, **date-fns** for dates, **lucide-react** for icons

## Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. In the SQL editor, paste and run the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   This sets up tables, row-level-security policies, the auto-profile trigger,
   and the `invite_collaborator` RPC.
3. (Optional but recommended) In **Authentication → Providers**, leave the
   default email/password provider on. If you'd like magic links to work
   reliably for testing, also disable "Confirm email" in
   **Authentication → Email Templates → Settings**.
4. In **Project Settings → API**, copy the **Project URL** and the
   **anon public** key.
5. **Password reset (recommended):** in **Authentication → URL Configuration**,
   set the **Site URL** to your deployed app (e.g. `https://yourapp.vercel.app`) and
   add these **Redirect URLs** so the reset link from email can return to the app:
   - `https://yourapp.vercel.app/update-password`
   - `http://localhost:5173/update-password` (local dev)  
   Users can request a reset from **Sign in** → *Forgot password?* or `/forgot`.

### 2. Local development

```bash
cp .env.example .env.local
# then edit .env.local and paste your Supabase URL + anon key

npm install
npm run dev
```

Open http://localhost:5173. Sign up with any email/password, then click
**New event** to start planning.

### 3. Inviting collaborators

1. Open an event → **Settings & Team**.
2. Type your friend's email and pick a role (editor / viewer).
3. The invitee must already have a Party Planner account. Once added, they'll
   see the event on their dashboard and can edit it in real time.

## Deploy to Vercel

The repo includes [`vercel.json`](./vercel.json) configured for Vite.

```bash
# install the CLI once
npm i -g vercel

# from the project root
vercel
# (follow prompts; choose "other" framework preset if asked, vercel.json wins)
```

Set these environment variables in Vercel **Project Settings → Environment Variables**:

| Name                    | Value                                |
| ----------------------- | ------------------------------------ |
| `VITE_SUPABASE_URL`     | your Supabase project URL            |
| `VITE_SUPABASE_ANON_KEY`| your Supabase anon public key        |

Then `vercel --prod`.

## Partiful integration

Partiful does not currently expose a public API, so this app integrates by
**linking out**:

- Each event can store a Partiful event URL (e.g. `https://partiful.com/e/…`).
- The Overview tab shows a one-click link to your Partiful page.
- Update the **RSVP count** field manually after checking Partiful — the
  number is shown on the dashboard and overview.

If Partiful publishes an API in the future, the integration can be extended
to auto-sync guests and RSVPs.

The **Guest list** module lets you paste names from Partiful (one per line)
and tracks RSVP status, dietary needs, plus-ones, and notes per guest.

## Email notifications (optional)

The app can email a collaborator when they're assigned to a task. This uses a
Supabase Edge Function + the `pg_net` extension + [Resend](https://resend.com).

If you skip this section, the app still works — assignments just won't trigger
emails.

### Setup

1. **Sign up at [resend.com](https://resend.com)** and verify a sender domain
   (or use the sandbox `onboarding@resend.dev` for testing). Get an API key.
2. **Install the Supabase CLI** if you haven't:
   `npm i -g supabase` and `supabase login`.
3. **Link your project**: `supabase link --project-ref <your-ref>`.
4. **Deploy the function**:
   ```bash
   supabase functions deploy notify-assignment
   ```
5. **Set its secrets** (add VAPID lines only if you use **web push**; generate keys
   with `npx web-push generate-vapid-keys` and put the **public** key in
   `VITE_VAPID_PUBLIC_KEY` on Vercel):
   ```bash
   supabase secrets set \
     RESEND_API_KEY=re_xxxxx \
     FROM_EMAIL='Party Planner <hi@yourdomain.com>' \
     APP_URL=https://your-app.vercel.app \
     VAPID_PUBLIC_KEY=xxxxx \
     VAPID_PRIVATE_KEY=xxxxx
   ```
6. **Run migrations** `0002_notifications.sql` and, for web push subscriptions,
   `0003_web_push.sql`, in the SQL editor (see [OPERATIONS.md](./OPERATIONS.md)).
7. **Set the two custom GUCs** in the SQL editor (one-time, replace placeholders):
   ```sql
   alter database postgres set "app.functions_url" = 'https://<project-ref>.supabase.co/functions/v1';
   alter database postgres set "app.service_role_key" = '<your-service-role-key>';
   ```
   (`Project Settings → API → service_role` key. Never expose this to the
   browser — it's only used by the trigger to authenticate to the function.)

### Test it

Assign yourself to a task as user A; check user B's inbox. (Self-assignments
do not trigger emails.) Logs are visible in the Supabase dashboard under
**Edge Functions → notify-assignment → Logs**.

## Database schema

A single `event_items` table powers all category modules, distinguished by a
`kind` column (`task`, `food`, `beverage`, `shopping`, …). Category-specific
fields live in a `meta jsonb` column. This lets the schema stay tiny and
makes adding new categories trivial.

See [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
for the full schema, RLS policies, and helper functions.

## Project layout

```
src/
  components/      Reusable UI (modals, app shell, dialogs)
  lib/             Supabase client, auth context, hooks, formatters
  modules/         One file per event category (Food, Beverages, …)
  pages/           Top-level routes (Dashboard, Calendar, EventPage, AuthPage)
supabase/
  migrations/      SQL migration(s) — run in the Supabase SQL editor
```

## License

MIT
