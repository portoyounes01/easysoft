# Notifications P3 — activation checklist (manual provisioning)

Everything in P3a–P3d is **coded, committed, and schema-deployed to EasySoft** (`kmojrkkjuehmpordueoe`):
migrations pushed, edge functions `notify-push` / `revoke-human` / `manage-devices` deployed, the
`device-presence-sweep` + `notif-push-backstop` cron jobs scheduled (the backstop is null-safe, a
no-op until the Vault secrets below exist).

The steps below are the **secret / dashboard / Vercel** provisioning the automation could not do
(secret-store + Vault writes + the auth-hook toggle are gated). Do them to light up Web Push (P3b)
and the revocation hook (P3d). The in-app feed (P3a) and offline detection (P3c) need **none** of this.

VAPID keypair already generated (public key is browser-safe and already in the gitignored `.env`):

- **VAPID public** `BNDLLAO46WaLmLXUSTW2RhGFZENMmF35r81W4r6Bb3Ys4d5veCROtUR7Qh2w860u5-DRQZJhuvwQmYoxIXck40Y`
- **VAPID private** — not in git; in `.env`-adjacent handoff (job tmp `p3b-secrets.txt`). Regenerate with
  `npx web-push generate-vapid-keys` if you prefer (then update all three places: edge secret, Vercel, `.env`).

## 1. Edge secrets (for `notify-push`)
Pick ONE shared secret and use the SAME value here and in the Vault seed (step 2).
```bash
# generate a shared secret once:  openssl rand -base64url 24   (or node -e "…randomBytes(24).toString('base64url')")
supabase secrets set \
  VAPID_PUBLIC_KEY=BNDLLAO46WaLmLXUSTW2RhGFZENMmF35r81W4r6Bb3Ys4d5veCROtUR7Qh2w860u5-DRQZJhuvwQmYoxIXck40Y \
  VAPID_PRIVATE_KEY=<private key> \
  VAPID_SUBJECT=mailto:alerts@yourdomain \
  NOTIFY_PUSH_SHARED_SECRET=<shared secret>
```

## 2. Vault secrets (for the delivery trigger + cron backstop)
Run in the SQL editor (or any admin SQL path). `notify_push_shared_secret` MUST equal the edge
`NOTIFY_PUSH_SHARED_SECRET` above.
```sql
select vault.create_secret('https://kmojrkkjuehmpordueoe.supabase.co/functions/v1/notify-push', 'notify_push_fn_url');
select vault.create_secret('<shared secret>', 'notify_push_shared_secret');
```

## 3. Enable the Custom Access Token hook (P3d)
Dashboard → Authentication → Hooks → **Custom Access Token** → enable → function
`public.custom_access_token`. (The function is deployed and already skips device sessions, so it
will not touch till logins.) This bounds a removed member's stale-token access to ≤ `jwt_expiry`.

## 4. Vercel build env (for the client to subscribe)
Project → Settings → Environment Variables (Production):
`VITE_VAPID_PUBLIC_KEY = BNDLLAO46WaLmLXUSTW2RhGFZENMmF35r81W4r6Bb3Ys4d5veCROtUR7Qh2w860u5-DRQZJhuvwQmYoxIXck40Y`

## 5. Deploy the client
Push `pwa` → `main` (Vercel auto-deploys). The bell/feed (P3a) works immediately; the **Alerts**
settings tab shows the "Background alerts" toggle once step 4's env var is in the build.

## Verify (after 1–5)
- Install the PWA, open **Settings → Alerts**, toggle **Background alerts** on (grants permission + writes `push_subscriptions`).
- Trigger a `FISCAL_CANCELLATION` (or `FISCAL_ISSUE_FAILED`) → device buzzes with the app closed; the bell shows it live with the app open.
- Enroll a till, let it heartbeat, then kill it > `grace_seconds` → one `DEVICE_OFFLINE`; restart → one `DEVICE_ONLINE`; Devices page pill flips.
- Remove a member via `revoke-human` → their `push_subscriptions` row is gone and a tenant-A critical event does not buzz their device.
