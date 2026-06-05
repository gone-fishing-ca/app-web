# Auth providers — Supabase setup

The web app uses `supabase.auth.signInWithOAuth({ provider })`. Once a provider
is enabled in the Supabase dashboard and credentials are pasted in, the
"Continue with Google" / "Continue with Apple" buttons on the login + signup
pages start working. No code changes required when adding more providers later.

This document covers the **one-time provider configuration** in three parts:

1. [Supabase auth URLs](#1-supabase-auth-urls) — applies to every provider
2. [Google](#2-google) — ~10 min, free
3. [Apple](#3-apple) — ~30 min, requires Apple Developer Program ($99/yr)

> **Status (2026-06):** Only Google is currently exposed in the UI. The Apple
> section below is preserved for when an Apple Developer account is justified
> — most likely once an iOS app ships and Apple's "Sign in with Apple"
> requirement kicks in. To re-add the button: widen `OAuthProvider` in
> `lib/auth.tsx` to include `"apple"` and add an Apple button in
> `components/sso.tsx` (the original implementation is in git history).

---

## Why not Firebase?

Supabase covers both Google and Apple SSO with the same API, the same JWT, and
the same `auth.users` table our schema already references. Switching to Firebase
would mean:

- replacing `@supabase/supabase-js` with `firebase` on the web,
- replacing our JWKS verifier on the API with Firebase Admin SDK token
  verification,
- moving user UUIDs to a different store,
- re-doing all the work in `AUTH-PROVIDERS.md`-equivalent for Firebase.

No upside for our use case. Stay on Supabase.

---

## 1. Supabase auth URLs

Both providers need these set first.

**Dashboard → Authentication → URL Configuration.**

| Field | Value |
|---|---|
| **Site URL** | `https://gonefishingcanada.com` |
| **Redirect URLs** (allow list) | `https://gonefishingcanada.com/**`<br>`https://www.gonefishingcanada.com/**`<br>`https://gonefishing-zeta.vercel.app/**`<br>`http://localhost:3000/**` |

The wildcard `/**` matters — Supabase rejects any post-OAuth redirect that
doesn't match the allow list. The web app currently uses `/login` as the
return path; future routes (`/auth/callback`, etc.) will be covered by `/**`.

For **Vercel preview deployments** (per-branch URLs), add them as needed —
e.g. `https://gonefishing-zeta-git-<branch>-<team>.vercel.app/**`.

---

## 2. Google

### 2a. Create the OAuth Client in Google Cloud Console

1. https://console.cloud.google.com → pick / create a project (anything is fine
   — even just "Gone Fishing").
2. **APIs & Services → OAuth consent screen.**
   - User type: **External**.
   - App name: `Gone Fishing`.
   - User support email: yours.
   - Developer contact: yours.
   - Save. (You can leave it in "Testing" mode — for a personal trip planner
     you'll never hit the 100-user cap. Publishing is optional.)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID.**
   - Application type: **Web application**.
   - Name: `Gone Fishing — Supabase`.
   - **Authorized JavaScript origins:** add
     `https://<your-supabase-ref>.supabase.co`.
   - **Authorized redirect URIs:** add
     `https://<your-supabase-ref>.supabase.co/auth/v1/callback`.
     (Get the exact value from Supabase → Authentication → Providers → Google;
     it's shown there too.)
4. Copy the **Client ID** and **Client Secret**.

### 2b. Wire it into Supabase

**Dashboard → Authentication → Providers → Google.**

- Toggle **Enable Sign in with Google** on.
- Paste the **Client ID** and **Client Secret**.
- Save.

That's it. The "Continue with Google" button should work end-to-end now.

### 2c. Smoke test

```
1. Visit https://gonefishingcanada.com/login
2. Click "Continue with Google"
3. → Google consent screen → pick the account
4. → bounced back to /login → instantly forwarded to /trips
```

If the bounce-back fails with a redirect error, the most common cause is the
Site URL / Redirect URLs allow list (§1) — Supabase logs the rejected URL in
**Authentication → Logs**.

---

## 3. Apple

Apple is fiddlier than Google. Skip this section if you don't want to spend the
$99 — the Google button alone covers most use cases, and email/password is the
fallback.

### 3a. Prerequisites

- An **Apple Developer Program** membership ($99 USD / year, [apply here](https://developer.apple.com/programs/)).
- The team needs an **App ID** to attach Sign in with Apple to a **Services ID**.

### 3b. Create the App ID

1. https://developer.apple.com/account → **Certificates, IDs & Profiles →
   Identifiers → +**.
2. **App IDs → App.**
   - Description: `Gone Fishing`.
   - Bundle ID: `com.gonefishingcanada.app` (or whatever you'll use on iOS).
   - **Capabilities:** check **Sign In with Apple**.
   - Continue → Register.

### 3c. Create the Services ID (the web client)

1. **Identifiers → + → Services IDs.**
2. Description: `Gone Fishing — Web`.
3. Identifier: `com.gonefishingcanada.web` (anything reverse-DNS works — this
   becomes the **Client ID** in Supabase).
4. Register, then **edit it again:**
   - Check **Sign In with Apple** → **Configure**.
   - **Primary App ID:** pick the one from §3b.
   - **Domains and Subdomains:**
     ```
     gonefishingcanada.com
     <your-supabase-ref>.supabase.co
     ```
   - **Return URLs:**
     ```
     https://<your-supabase-ref>.supabase.co/auth/v1/callback
     ```
   - Save → Continue → Register.

### 3d. Create the Sign in with Apple Key

1. **Keys → +**.
2. Name: `Gone Fishing Sign In`.
3. Check **Sign in with Apple** → **Configure** → pick the App ID from §3b.
4. Continue → Register.
5. **Download the `.p8` file.** Apple shows it once; lose it and you regenerate.
6. Note the **Key ID** (10 chars).
7. Note your **Team ID** — top-right of the developer portal.

### 3e. Wire it into Supabase

**Dashboard → Authentication → Providers → Apple.**

- Toggle **Enable Sign in with Apple** on.
- **Client ID:** the Services ID identifier from §3c
  (e.g. `com.gonefishingcanada.web`).
- **Secret Key (for OAuth):** Supabase auto-generates this from your `.p8`.
  In the *secret key generator* fields, paste:
  - **Team ID:** §3d.
  - **Key ID:** §3d.
  - **Private key:** the entire contents of the `.p8` file (including the
    `-----BEGIN PRIVATE KEY-----` lines).
  - Click **Generate Secret Key** — Supabase produces the JWT and stores it for
    six months. (Apple rotates this every 6 months; set a calendar reminder.)
- Save.

### 3f. Smoke test

Same flow as Google. Note that **Apple intentionally returns the user's name
only on the first sign-in** — subsequent sign-ins omit it. If you care about
display names, capture and persist whatever you get from the first session.

---

## Notes on user metadata

When a user signs in via Google, Supabase populates:

```jsonc
auth.users.raw_user_meta_data = {
  "name": "Marcus Townsend",
  "full_name": "Marcus Townsend",
  "email": "marcus@gmail.com",
  "avatar_url": "https://lh3.googleusercontent.com/...",
  "picture": "https://...",
  "iss": "https://accounts.google.com",
  "sub": "1234567...",
  "provider_id": "1234567...",
  "email_verified": true
}
```

Our `lib/auth.tsx` reads `name` / `full_name` from this object. To surface
avatars in the trip header, just pull `avatar_url` the same way and pass it
into the `Avatar` component.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| "Provider not enabled" | Provider not toggled on | Dashboard → Auth → Providers → enable |
| Redirect-loop or "redirect not allowed" | Site URL / Redirect URLs misconfigured | §1 |
| Apple "invalid_client" | Services ID, Team ID, or Key ID wrong | §3c / §3d |
| Apple stops working ~6 months in | Apple JWT secret expired | Re-generate in §3e |
| Google "redirect_uri_mismatch" | Cloud Console redirect URI doesn't match `<ref>.supabase.co/auth/v1/callback` exactly | §2a, copy/paste |
