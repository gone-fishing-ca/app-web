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
| Master inventory (`/inventory` — reusable catalog: taxonomy, qty hints or member prefs with shared pref rules, kinded sources (storage / buyer / outfitter) with a responsible person, archive) | ✅ wired |
| Packing (trip list from inventory: copy-from-previous-trip, add/search, suggested quantities, prefs lines summing member answers, personal-vs-shared + packed-by + belongs-to (person/cabin/group) + cost/paid-by capture, status; itemize lines into labeled units/splits with per-unit qty + cabin, per-week assignment + boxes) | ✅ wired |
| Menu (per-day breakfast/dinner picks of menu-flagged Food items; per-week attendance; totals auto-sync the packing list) | ✅ wired |
| My prefs (per-person pre-trip answers: typed inputs — steppers by increment, Yes/No bools — defaults, rule targets) | ✅ wired |
| My pack list (per-person view: you-bring / stored-for-you / assigned group gear / yours-on-the-trip, packed checkoffs) | ✅ wired |
| Lakes & cabins (reusable catalog + outfitters, linked per-trip) | ✅ wired — edited via the lake modal on the Overview week cards (no separate page) |
| Contacts (group + relatives, outfitter edit, trip resources) | ✅ wired — address-book contacts & reusable resources |
| Schedule (calendar + day-by-day itinerary: weeks, fly in/out, itinerary items) | ✅ wired |
| Flights (per-person legs grouped by person, optional Schedule link, AeroDataBox schedule lookup) | ✅ wired |
| Budget | stub page (API endpoints exist) |

## File map

```
app/
  globals.css            tailwind + tokens + font bindings
  design-tokens.css      copied from ../design/system (semantic CSS vars)
  layout.tsx             root: theme attrs, next/font, AuthProvider
  page.tsx               redirects to /login or /trips
  login/page.tsx         split-hero sign-in
  signup/page.tsx        centred-card sign-up
  inventory/page.tsx     master inventory catalog (search, taxonomy, archive)
  trips/
    page.tsx             trip list / "new trip" CTA / inventory link
    new/page.tsx         create-trip form with clone-from selector
    [id]/
      layout.tsx         sidebar + header + dark-mode toggle
      page.tsx           dashboard
      participants/page.tsx  Group roster (+ add-from-address-book picker)
      contacts/page.tsx    group & relatives · outfitters · trip resources
      packing/page.tsx     trip packing list (copy-from, add/search inventory, suggestions)
      menu/page.tsx        day-by-day breakfast/dinner menu (totals sync the packing list)
      my-prefs/page.tsx    per-person pre-trip prefs (typed answers, defaults, rule targets)
      my-list/page.tsx     per-person pack list (you-bring / stored-for-you / group gear)
      segments/page.tsx    Schedule (calendar + day-by-day itinerary list)
      flights/page.tsx     Flights (per-person legs grouped by person)
      budget/page.tsx      stub
components/
  ui.tsx                 Btn · Badge · Card · Field · Wordmark · StatCard · EmptyState · …
  inventory-form.tsx     shared inventory-item editor: fields + the master-item edit modal
  prefs-card.tsx         the My-prefs card (typed inputs, rule targets, serialized saves)
  collapsible.tsx        GroupHeader + useCollapsedSet (persisted fold state for grouped lists)
  stub.tsx               ModuleStub
lib/
  config.ts              API_BASE
  supabase.ts            browser Supabase client
  auth.tsx               AuthProvider / useAuth (Supabase-backed)
  api.ts                 typed fetch client; pulls bearer from supabase session
  packing.ts             trip facts + suggested-quantity math, hint labels
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
