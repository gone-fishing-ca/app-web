# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@README.md

The repo-root `../CLAUDE.md` covers the cross-cutting picture (the auth split, the API
data model, deploy). `README.md` (included above) is the canonical reference for the
**wired-vs-stubbed** table and the file map. This file adds the web-app conventions that
only become clear after reading several files — read it before writing UI code.

## Commands

Uses **pnpm**, not npm. The API must be running at `http://localhost:8787` first.

```bash
pnpm install
pnpm dev      # → http://localhost:3000 (Turbopack)
pnpm build
```

There is **no lint or test script** — `package.json` has only `dev`/`build`/`start`, and
there's no eslint/jest config. Verify changes by running `pnpm dev` (or `pnpm build` to
catch type errors). Don't invent test commands.

## Styling: inline CSS variables, not Tailwind colors

This is the convention most likely to trip you up. **All color, typography, and theming
goes through inline `style={{ }}` with the semantic CSS variables** defined in
`app/design-tokens.css` — e.g. `style={{ background: "var(--primary)", color: "var(--text-2)",
fontFamily: "var(--font-display)" }}`. There are **zero** Tailwind color utilities
(`bg-blue-500`, `text-slate-600`, …) anywhere in the codebase, by design.

- Tailwind is used **only for layout/spacing/flex** (`flex`, `gap-2`, `px-4`, `text-[14px]`).
- Reach for the shared primitives in `components/ui.tsx` (`Btn`, `Badge`, `Card`, `Field`,
  `StatCard`, `Avatar`, `EmptyState`, `Wordmark`, …) before hand-rolling — they already
  encode the token usage. `components/stub.tsx` (`ModuleStub`) is the placeholder for
  not-yet-built modules.
- Theme is locked to "Lake Light" (`data-theme="lake"` at root); **dark mode toggles
  `data-mode` on `<html>`** (see the toggle in `app/trips/[id]/layout.tsx`). Never
  hardcode hex colors — they won't flip with the mode.

## Client-side everything + the auth guard

Every page is a **client component** (`"use client"`); there is no server-side data
fetching or RSC data layer. Consequences:

- Data flows through `lib/api.ts` (`api.get/post/patch/put/del`), which reads the freshest
  Supabase access token per request and sends it as a bearer. Never read the token from
  `localStorage` directly.
- **Auth is guarded per-route in the layout**: protected layouts call `useAuth()`, wait
  for `loading`, and `router.replace("/login")` when there's no user (see
  `app/trips/[id]/layout.tsx`). Mirror this pattern in any new protected route.
- OAuth currently ships **Google only** — `OAuthProvider` in `lib/auth.tsx` is narrowed to
  `"google"`. Apple is documented in `AUTH-PROVIDERS.md`; widen the union to re-add it.

## Things to keep in sync

- **`lib/api.ts` types are hand-mirrored from the FastAPI Pydantic schemas** (`../api/src/schemas.py`).
  They are not generated. Change an API schema → update these types too.
- The **`NAV` array in `app/trips/[id]/layout.tsx` is the canonical module list** for the
  trip workspace sidebar. Adding a module means a new `app/trips/[id]/<module>/page.tsx`
  **and** a `NAV` entry (mirrors the API routers in `../api/src/routes/`).

## Next.js 16 specifics

- Route `params` are **Promises** — unwrap with `use(params)` in client components
  (e.g. `const { id } = use(params)`), not by destructuring directly.
- Path alias `@/*` maps to the project root (`@/components/ui`, `@/lib/api`).
- This Next.js version predates your training data — per `AGENTS.md`, check
  `node_modules/next/dist/docs/` before using an API you're unsure about.
