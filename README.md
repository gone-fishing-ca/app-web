# Gone Fishing — Web

Next.js 16 admin app for the **Gone Fishing** trip-planning system. Pair it with the
Python API in `../api`. Authentication and data go through the API — the web app holds
no secrets and stores no business data.

## Stack
- **Next.js 16** (App Router, Turbopack, React 19)
- **Tailwind CSS v4** + the Gone Fishing design tokens (`app/design-tokens.css`)
- **next/font** for Bricolage Grotesque · Figtree · JetBrains Mono
- **lucide-react** icons
- JWT bearer auth stored in `localStorage` (`gf-token`)

The Lake Light theme is the locked direction and is applied at the root
(`data-theme="lake"`). Dark mode toggles via `data-mode` on `<html>`.

## Run it

The API must be running at `http://localhost:8787` (see `../api/README.md`).

```bash
pnpm install
cp .env.example .env.local
pnpm dev                   # → http://localhost:3000
```

Sign in with the seeded organizer:
- email: `organizer@gonefishing.app`
- password: `Northern2026!`

## What's wired vs. stubbed

| Module | Status |
|---|---|
| Sign in / sign up | ✅ fully functional |
| Trip list + create / clone | ✅ fully functional |
| Dashboard (countdown, KPIs, crew, pack-list summary) | ✅ fully functional |
| Participants | ✅ full CRUD + edit row |
| Pack list (master list + per-participant statuses) | ✅ full CRUD + toggle |
| Contacts / Itinerary / Flights / Shared gear / Food / Beverages / Budget | stub page (API endpoints exist) |

## File map

```
app/
  globals.css            tailwind + tokens + font bindings
  design-tokens.css      copied from ../design/system (semantic CSS vars)
  layout.tsx             root: theme attrs, next/font, AuthProvider
  page.tsx               redirects to /login or /trips
  login/page.tsx         split-hero sign-in
  signup/page.tsx        centred-card sign-up
  trips/
    page.tsx             trip list / "new trip" CTA
    new/page.tsx         create-trip form with clone-from selector
    [id]/
      layout.tsx         sidebar + header + dark-mode toggle
      page.tsx           dashboard
      participants/page.tsx
      pack-list/page.tsx
      {contacts,itinerary,flights,shared-gear,food,beverages,budget}/page.tsx  stubs
components/
  ui.tsx                 Btn · Badge · Card · Field · Wordmark · StatCard · EmptyState · …
  stub.tsx               ModuleStub
lib/
  config.ts              API_BASE
  api.ts                 typed fetch client + JWT + entity types
  auth.tsx               AuthProvider / useAuth
  format.ts              dates, ranges, days-until
public/walleye/          brand assets copied from the design system
```

## Switching auth to Supabase

The web app talks to whichever API is at `NEXT_PUBLIC_API_BASE`. To use Supabase Auth
instead of the API's local users:

1. Flip the API: set `AUTH_MODE=supabase`, `SUPABASE_JWT_SECRET=…` in `../api/.env`.
2. Replace `lib/auth.tsx` so that `signIn`/`signUp` go through `@supabase/supabase-js`
   instead of `/auth/login`. The token the web app stashes in `localStorage` then
   becomes the Supabase JWT; everything else (`api.ts` setting
   `Authorization: Bearer …`) stays the same.
