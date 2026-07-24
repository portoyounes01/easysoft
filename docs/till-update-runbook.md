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

**Publishing a shell release:**
1. Bump `version` in `package.json` (this is the shellVersion the gate/handshake sees).
2. CI (`build.yml`) produces `dist-electron/`: the `.exe` installers, `.blockmap`, and **`latest.yml`** — the feed manifest.
3. Upload the NSIS `.exe` + `.blockmap` + `latest.yml` together to the static HTTPS host at the `update_feed_url` path. Any static host works (must serve exact filenames; ⚠️ Vercel's 100 MB static limit likely rules it out for the installer — a bucket/CDN is the expected host; **feed host choice still open**).
4. Tills pick it up within 4h (or next boot) and install on their next restart.

**Renderer surface:** `electronAPI.shell.getUpdateStatus()` / `onUpdateStatus(cb)` — status `disabled|checking|available|downloaded|up-to-date|error`. ⚠️ No UI nudge is wired yet (D-U5): "update downloaded — restart when convenient" surfacing in the POS UI is open work.
