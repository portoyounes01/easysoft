# Till Update Runbook — Stage 4 operations

**Type:** Ops runbook for `docs/update-policy.md` §10 (Stage 4 = rolling the fleet using the Stage 0–3 machinery, implemented 2026-07-24 — see §15 there). Every step here is a config flip or a web deploy; **no step reinstalls a till** except a native/hardware shell change.

## A. Till config file

`config.json` lives in the app's `userData` directory:
- Windows: `%APPDATA%/Comprehensive POS System/config.json`
- macOS: `~/Library/Application Support/Comprehensive POS System/config.json`
- Linux: `~/.config/Comprehensive POS System/config.json`

```json
{
  "environment": "production",
  "supabase_url": "https://<project-ref>.supabase.co",
  "supabase_anon_key": "<anon key>",
  "ui_origin": "https://<the-locked-vercel-domain>",
  "renderer_source": "bundled",
  "update_feed_url": "https://<static-host>/pos-updates"
}
```

Rules the shell enforces (invalid → blocking red on the boot gate, with the reason):
- `supabase_url` and `supabase_anon_key` must be set **together** or not at all.
- `ui_origin` must be `https://` (plain `http://` only for localhost/LAN pilot hosts).
- `renderer_source: "network"` requires a valid `ui_origin`.
- A **missing** file is fine — the till behaves exactly as a pre-Stage-0 install (bundled UI, Vite-baked backend env, backend gate check skipped).

## B. Pilot repoint (one till → network UI)

**Origin-flip storage (D-U4 — largely FIXED 2026-07-24):** the flip changes the web origin (`app://pos` → `https://…`) and browser storage is per-origin, but the shell now owns the identity state: **device pairing scope + Supabase session live in the shell's safeStorage device store** (`electron/deviceStore.js`) and are hydrated into whatever origin the renderer boots on — no re-pairing, no re-login after a flip. What still does NOT follow is IndexedDB/Dexie — the catalog cache re-syncs by itself, but an **unsynced offline sale queue stays parked under the old origin** (intact; flip back and it's there).

**Pre-flip checklist (per till):**
- [ ] Sync outbox empty — no pending/unsynced transactions on the till (Dexie stays per-origin).
- [ ] Day closed (no open shift/drawer session state you can't recreate).
- [ ] Boot the till once on the upgraded shell BEFORE flipping (first boot adopts the existing pairing/session into the device store).

1. Deploy the web build to the locked origin (Vercel). Confirm `https://<origin>/shell-requirements.json` is served (the Vite build emits it).
2. On **one** till: set `ui_origin` and `renderer_source: "network"` in `config.json`; restart the app.
3. Watch the boot gate: all blocking items green → it hands off to the network UI automatically.
4. Re-pair the till (new origin = fresh storage), then soak (sell normally; watch for bounces back to the gate).
5. **Rollback at any point:** set `renderer_source` back to `"bundled"`, restart, and the old origin's storage (pairing, queue) is exactly where it was. A till flipped back after selling on the network origin has data under BOTH origins — sync both sides before flipping again.

## C. Fleet roll

Repeat B per till (it's a file edit + restart). After the roll:
- UI updates ship by Vercel deploy only — a reload/restart picks them up; no installer, no till visit.
- The installer changes **only** for hardware/native/shell reasons; every such change bumps the shell version, and a breaking preload change bumps `HARDWARE_API_VERSION` (`electron/shellContract.js`).

## D. Raising the minimum shell (forced update)

1. Edit `src/shell-requirements.json` (`min_shell_version`, and `min_hardware_api_version` only for breaking preload changes).
2. Deploy the web build. From then on: gates on too-old shells go red with "update the installer" and won't hand off; old installers without a gate hit the in-UI block (`src/lib/shellContract.ts`).
3. Use sparingly — this is the compliance/fiskaly-forced-change lever (§8), not routine cadence.
4. Raising the floor now pairs with the auto-update channel (§G): ship the new installer to the feed FIRST, let tills download it, then raise the floor — the gate blocks any till that hasn't restarted into the new shell yet, and the fix is "restart", not a till visit.

## E. Backend deploys

Unchanged by the stages — §9 rules stand: staging soak, PITR restore point before fiscal-touching deploys, additive-only fiscal migrations, RPC signatures stable.

## F. Fiscal-relevant rendering (§9.4)

⚠️ **Change-control mechanism still undesigned (O4).** Until it exists, treat receipt/invoice template files as frozen: any PR touching them needs explicit owner approval before deploy, because with network UI they reach every till instantly.

## G. Auto-update channel (shell installer updates — D-U5)

**Enabled 2026-07-24 (user decision), UNSIGNED for now** — integrity rests on the HTTPS feed + latest.yml's sha512; there is no publisher-signature check. Windows NSIS installs only (the `portable` target cannot self-update; no macOS tills).

**How it works:** if `update_feed_url` is set in `config.json` (**https only** — executables travel over it), the shell checks the feed at boot and every 4h and downloads in the background. It installs at two moments, never mid-selling (§7.2): **at the boot gate** (a kiosk powered off at night never fires Electron's quit event, so the boot-time check re-surfaces the download while the till is still at the gate and installs before selling starts — this is the normal path), and on a real app quit (Alt+F4 / gate Restart, which routes through the updater so the installer and the relaunch never race). No `update_feed_url` → completely inert.

⚠️ **Install per-user** (the build pins `perMachine: false`): install the app as the till user in the default location. A per-machine/Program Files install would make the silent update hit a UAC prompt on an unattended kiosk — declined or unanswered, the update is silently dropped.

**Publishing a shell release — AUTOMATED via Cloudflare R2 (decided 2026-07-24):**
1. Bump `version` in `package.json` (this is the shellVersion the gate/handshake sees).
2. Push to `main`. CI (`build.yml`) builds AND publishes the feed set (`.exe` + `.blockmap` + `latest.yml`) to the R2 bucket under `/pos/` — installers first, `latest.yml` last (a till polling mid-publish never sees a manifest pointing at a missing installer), `latest.yml` served no-cache. PR builds are never published.
3. Tills pick it up within 4h (or next boot) and install at the gate / on quit.

**One-time R2 setup (repo secrets — CI warns loudly and skips publish until set):**
1. Cloudflare dashboard → R2 → create a bucket (e.g. `pos-updates`).
2. Enable public read for the bucket: either the managed `r2.dev` public URL or (better) a custom domain — the resulting HTTPS origin is the till-facing feed host. Only public READ; never public write.
3. Create an R2 API token scoped to that bucket, **Object Read & Write**.
4. GitHub repo → Settings → Secrets and variables → Actions, add: `R2_ACCOUNT_ID` (Cloudflare account id — the 32-hex value, WITHOUT any `.eu`), `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` (from the token), `R2_BUCKET` (bucket name), and — for a jurisdiction-pinned bucket (endpoint contains `.eu.`) — `R2_S3_ENDPOINT` set to the full endpoint (e.g. `https://<account-id>.eu.r2.cloudflarestorage.com`); such buckets are NOT reachable on the default endpoint.
5. Till `config.json`: `"update_feed_url": "https://<public-r2-domain>/pos/"` (the `/pos/` prefix must match the CI upload path).
   **Live values (2026-07-24):** bucket `pos-updates` (EU jurisdiction), public feed host `https://pub-a07e0f67d1dd4aa2b9ef49ce82014a2a.r2.dev` → tills use `"update_feed_url": "https://pub-a07e0f67d1dd4aa2b9ef49ce82014a2a.r2.dev/pos/"`. ⚠️ r2.dev is Cloudflare-rate-limited — fine at current fleet size; move the bucket behind a custom domain before fleet scale-out (config flip on the tills, no reinstall).
6. Old versions accumulate in the bucket — deliberate (manual rollback = re-upload an older `latest.yml`); prune occasionally if size ever matters.

**Renderer surface:** `electronAPI.shell.getUpdateStatus()` / `onUpdateStatus(cb)` — status `disabled|idle|checking|available|downloaded|up-to-date|error`. The POS-UI nudge SHIPPED in 0.1.2 (this line previously said it was unwired — it was stale): an amber "Update ready" chip in the POS status bar (`UpdateStatusIndicator`, mounted in `POS.tsx`) plus Settings → Hardware → Updates with a working "Restart and install now" (`UpdateSettingsPanel`). ⚠️ No download percentage reaches either surface — progress is drawn only on the boot-gate splash below (D-U5 deferral 1).

**Update splash (shell 0.1.11+):** a small frameless panel (`electron/updater-window/`, served at `app://updater/`) appears at the BOTTOM of the boot gate while an update is downloading or installing, and once after the relaunch to confirm the new version. Informational only: clicking it dismisses it and never cancels the update, every phase self-destroys on a timer, and it is shown only while the window is at `app://gate` — never mid-sale. The gate-moment install delay is now 4s (was 2s) so the "A instalar atualização…" message is readable from across a counter, and `gate:proceed` refuses handoff for at most 6s while that install fires. ⚠️ **The splash cannot cover the ~1 min NSIS actually runs** — `quitAndInstall` spawns the installer and quits one tick later, so no window this app owns exists during the install; that minute stays covered only by the Windows toast. Repeated install failures that are invisible in-process (silent NSIS failure, power cut) are remembered across restarts in `userData/update-state.json`; after 3 attempts the automatic gate-moment install is suppressed for that version, a non-blocking yellow `update-install` row appears on the gate (support code `GATE-UPDATE`), and the gate's own **Reiniciar / Restart** button stays the manual retry — it is never suppressed. Suppression lifts by itself 24h after the first attempt. Preview the phases on a dev box (nothing else in §G runs on macOS): `electron . --dev --pos-updater-splash=installing|downloading|failed|updated`.

**Local two-version e2e test (Windows box required — any Windows machine, not necessarily a till; macOS cannot run this: Squirrel.Mac refuses unsigned updates, and macOS uses a different updater/feed than the NSIS tills anyway):**
1. Install the CI `Setup 0.1.0.exe` per-user on the Windows box.
2. Bump `package.json` version to `0.1.1`, let CI build, download the new `Setup .exe` + `.blockmap` + `latest.yml`.
3. Serve that folder over loopback: `npx http-server -p 8080` → `config.json`: `"update_feed_url": "http://127.0.0.1:8080/"` (loopback http is the one allowed http exception — it cannot be intercepted).
4. Launch the 0.1.0 install: expect updater logs `checking → available 0.1.1 → downloaded`, and if still at the gate, an immediate silent install + relaunch as 0.1.1. Also verify the Alt+F4 path installs on quit.
5. Splash checks on the same run (⚠️ unverifiable on macOS — none of this has been exercised on a real till yet): the "A instalar atualização" panel is visible for the full 4s **and sits on top of the kiosk fullscreen window** (it asks for the `screen-saver` always-on-top level and falls back to plain always-on-top if Windows refuses); the relaunched 0.1.1 shows "Atualizado para 0.1.1" for 5s and `userData/update-state.json` is gone; clicking the panel mid-install closes it and the install still completes; deleting the cached installer between download and install forces the `failed` panel, after which the till still sells and Continue works within one 5s gate tick.
