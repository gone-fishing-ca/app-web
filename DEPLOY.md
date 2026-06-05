# Deploy — Gone Fishing Web

Vercel auto-detects Next.js — zero `vercel.json`, zero `vercel.ts` needed. Push to
`main` triggers production; every other branch gets a preview URL.

Expected steady-state cost: **$0/mo** on the Hobby tier (well within free-tier
bandwidth and build minutes for personal use).

## One-time setup

1. **Connect the repo.**
   - vercel.com → *Add New… → Project* → import `gone-fishing-ca/app-web`.
   - Framework preset: **Next.js** (auto-detected).
   - Root directory: `.`
   - Build command / output directory / install command: leave defaults.

2. **Add the env vars.** *Project → Settings → Environment Variables.* Apply each
   to **Production + Preview + Development** unless noted.

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_BASE` | `https://gonefishing-api-<hash>-uc.a.run.app` (Cloud Run URL — see `../api/DEPLOY.md`) |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://dboplxccdnogksputezc.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` (Supabase → Settings → API Keys) |

   Everything the web app needs is `NEXT_PUBLIC_*` — there are no secrets to keep
   server-side. The Supabase publishable key is safe to ship to the browser.

3. **(Optional) Custom domain.** *Settings → Domains* → add `gonefishing.app`
   (or whichever) → follow the DNS instructions.

## Tying back to the API

The web app calls the API directly from the browser, so two things have to line
up:

1. **`NEXT_PUBLIC_API_BASE`** points at the Cloud Run URL.
2. **`CORS_ORIGINS`** on the Cloud Run service includes the Vercel domain (both
   prod *and* any custom domain). For preview branches, Vercel issues
   `https://gonefishing-web-<hash>-<team>.vercel.app` URLs — add a wildcard or
   list the specific previews you actually use.

If you add a custom domain to either side, bump the matching env var on the other
side and redeploy.

## Smoke test after deploy

```bash
# Visit the prod URL — should land on /login
open https://gonefishing-web.vercel.app

# Sign up (real email — Supabase emails a confirm link by default)
# Then sign in and check Network tab: requests to NEXT_PUBLIC_API_BASE
# should come back 200 with `Authorization: Bearer eyJ…`.
```

## When things go wrong

- **"Missing Supabase env vars" in the browser console.** The env vars weren't
  set for the environment you deployed to. Set them and redeploy.
- **`CORS` errors on every API call.** The Vercel URL isn't in `CORS_ORIGINS`
  on Cloud Run. Add it to the `_CORS_ORIGINS` substitution and redeploy the API.
- **`401` from the API.** The Cloud Run service can't reach
  `${SUPABASE_URL}/auth/v1/jwks` (network egress is open by default, so this is
  almost always a typo in `SUPABASE_URL`) — or the token is expired and
  `supabase-js` hasn't refreshed yet (refresh the page).
- **Slow first request after idle.** Cloud Run cold-starts when scaled to zero;
  bump `_MIN_INSTANCES=1` in the API's `cloudbuild.yaml` if you want sub-second
  responses always.
