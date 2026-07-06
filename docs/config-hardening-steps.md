# Config hardening — apply steps (B9–B11)

The last security-hardening items from the multi-tenant plan. These live in the Supabase
dashboard / Vercel / edge-function config — the CLI management token is in your macOS
keychain (not scriptable from here), so you apply the dashboard/Vercel ones; I wire the
code one. Do them on **both** EasySoft (prod `kmojrkkjuehmpordueoe`) and EasySoft-staging
(`mubdnwmbvdutqzzprjdp`) where noted. Check the box when done.

## B9a — Disable public signup  ☐ prod  ☐ staging
- Supabase Dashboard → **Authentication → Sign In / Providers → Email** (or **Auth → Settings**)
  → turn **OFF** "Allow new users to sign up" (`disable_signup = true`).
- **Why:** our model is admin-provisioned (devices via `pair-device`, employees via admin).
  Nobody should self-register. Leaving signup on is an open door to creating auth users.
- **Verify:** a `POST /auth/v1/signup` should return `422 signup_disabled`.
- **Safe:** does NOT affect existing device/employee login or `pair-device` (that mints
  users via the service role, which bypasses this flag).

## B9b — JWT (access token) expiry → 15 min  ☐ prod  ☐ staging
- Dashboard → **Authentication → Settings → Access Token (JWT) Expiry** → set **900**
  seconds (from the default 3600).
- **Why:** device claims (`tenant_id`, ban/enrollment status) only re-check on token
  refresh. 900s caps how long a revoked/changed device keeps selling to ≤15 min.
- **Safe:** the client auto-refreshes via the refresh token; users won't be logged out.
  Slightly more refresh traffic (negligible). Don't go below ~5 min (refresh churn).
- **Verify:** decode a fresh token — `exp - iat` should be 900.

## B10 — Drop unused fiscal key from Vercel  ☐
- Vercel → Project → **Settings → Environment Variables** → delete
  **`VITE_FISCAL_RSA_PRIVATE_KEY_PEM`** (all environments) → redeploy.
- **Why:** never used in prod (we're on fiskaly, not local AT signing). A private key in a
  `VITE_`-prefixed var is **shipped to the browser bundle** — remove it. Hygiene/leak.
- **Verify:** `grep` the deployed bundle / `import.meta.env` — the var should be gone.

## B11 — Lock edge-function CORS off `*`  ☐ (needs your input, then I wire it)
- Today every edge function sends `Access-Control-Allow-Origin: *`. That's fine for a
  device with no browser cookies, but we should allowlist the real callers.
- **What I need from you:** the exact origins that call the functions:
  - The Electron till renderer origin (e.g. `app://pos`, `app://.`, or the `file://`/custom
    scheme in `main` — tell me what `window.location.origin` prints in the till).
  - The web/PWA origin (the real Vercel domain, e.g. `https://pos.yourdomain.com`).
- **Then I:** switch the shared CORS header to read an `ALLOWED_ORIGINS` env var, echo back
  the request's `Origin` only if it's in the list (else omit the header), and keep `*` as a
  dev fallback when the var is unset. You'd set `ALLOWED_ORIGINS` per project; no redeploy of
  logic needed to change origins later.

## Not doing now (decided)
- **Deploy `pos-checkout` + `20260716…` migration:** HOLD. Nothing to verify it against until
  a fiscal product (SIGN PT/ES) is live; it isn't wired to the client. Deploy when fiscal
  resumes. Tracked as B2/B3 in `docs/REGISTER.md`.
