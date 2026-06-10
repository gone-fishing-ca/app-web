# Gone Fishing — Web

Next.js 16 admin app for the **Gone Fishing** trip-planning system. Pair it with the
Python API in `../api`. Authentication runs through **Supabase Auth**; data goes
through the API. The web app holds no secrets.

## Stack
- **Next.js 16** (App Router, Turbopack, React 19)
- **Tailwind CSS v4** + the Gone Fishing design tokens (`app/design-tokens.css`)
- **next/font** for Bricolage Grotesque · Figtree · JetBrains Mono
- **lucide-react** icons
- **@supabase/supabase-js** for auth (session persisted in localStorage, tokens
  auto-refreshed); the access token is forwarded to the API as a bearer.

The Lake Light theme is the locked direction and is applied at the root
(`data-theme="lake"`). Dark mode toggles via `data-mode` on `<html>`.

## Run it

The API must be running at `http://localhost:8787` (see `../api/README.md`).

```bash
pnpm install
cp .env.example .env.local
# then fill in NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
pnpm dev                   # → http://localhost:3000
```

Sign up once (creates the user in Supabase `auth.users`), then sign in. The
seeded `organizer@gonefishing.app` credentials only work when the API is in
`AUTH_MODE=local`.

## What's wired vs. stubbed

| Module | Status |
|---|---|
| Sign in / sign up (email + Google + Apple via Supabase Auth) | ✅ wired — [see AUTH-PROVIDERS.md](./AUTH-PROVIDERS.md) for provider setup |
| Trip list + create / clone | ✅ fully functional |
| Dashboard (countdown, KPIs, crew, pack-list summary) | ✅ fully functional |
| Participants | ✅ full CRUD + edit row |
| Pack list (master list + per-participant statuses) | ✅ full CRUD + toggle |
| Lakes & cabins (reusable catalog + outfitters, linked per-trip) | ✅ wired — edited via the lake modal on the Overview week cards (no separate page) |
| Contacts (group + relatives, outfitter edit, trip resources) | ✅ wired — address-book contacts & reusable resources |
| Schedule (calendar: weeks, fly in/out, itinerary items) | ✅ wired |
| Flight tracker (flight milestones + per-person legs) | ✅ wired |
| Itinerary / Shared gear / Food / Beverages / Budget | stub page (API endpoints exist) |

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
      participants/page.tsx  Group roster (+ add-from-address-book picker)
      contacts/page.tsx    group & relatives · outfitters · trip resources
      pack-list/page.tsx
      segments/page.tsx    Schedule calendar (weeks, fly in/out, itinerary items)
      flights/page.tsx     Flight tracker (flight milestones + per-person legs)
      {itinerary,shared-gear,food,beverages,budget}/page.tsx  stubs
components/
  ui.tsx                 Btn · Badge · Card · Field · Wordmark · StatCard · EmptyState · …
  stub.tsx               ModuleStub
lib/
  config.ts              API_BASE
  supabase.ts            browser Supabase client
  auth.tsx               AuthProvider / useAuth (Supabase-backed)
  api.ts                 typed fetch client; pulls bearer from supabase session
  format.ts              dates, ranges, days-until
public/walleye/          brand assets copied from the design system
```

## How auth flows through

```
User → Supabase Auth (signInWithPassword)
     → access_token (ES256 JWT, ~1h, auto-refreshed by supabase-js)
     → forwarded as `Authorization: Bearer …` to FastAPI
     → API verifies via Supabase's public JWKS, scopes data by JWT `sub` (UUID)
```

`lib/api.ts` reads the current token from `supabase.auth.getSession()` before
every request, so token refreshes are transparent — never touch
`localStorage["gf-token"]` directly.
