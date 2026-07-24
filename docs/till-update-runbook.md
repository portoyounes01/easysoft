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
  "renderer_source": "bundled"
}
```

Rules the shell enforces (invalid → blocking red on the boot gate, with the reason):
- `supabase_url` and `supabase_anon_key` must be set **together** or not at all.
- `ui_origin` must be `https://` (plain `http://` only for localhost/LAN pilot hosts).
- `renderer_source: "network"` requires a valid `ui_origin`.
- A **missing** file is fine — the till behaves exactly as a pre-Stage-0 install (bundled UI, Vite-baked backend env, backend gate check skipped).

## B. Pilot repoint (one till → network UI)

⚠️ **THE FLIP CHANGES THE WEB ORIGIN (`app://pos` → `https://…`), AND BROWSER STORAGE IS PER-ORIGIN.** The till's localStorage (device-pairing scope), IndexedDB/Dexie (including any **unsynced offline sale queue**) and web session do NOT follow — they stay parked under the old origin (not destroyed; flipping back finds them intact). Until sessions move into the shell's safeStorage (plan §6.2, not built), treat the flip as a re-enrollment (register D-U4):

**Pre-flip checklist (per till):**
- [ ] Sync outbox empty — no pending/unsynced transactions on the till.
- [ ] Day closed (no open shift/drawer session state you can't recreate).
- [ ] Pairing code ready — the till WILL ask to pair again after the flip.

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
4. ⚠️ Raising the floor while the fleet has no remote-update channel (electron-updater still deferred, U2/O2) means a **till visit per machine** — schedule accordingly.

## E. Backend deploys

Unchanged by the stages — §9 rules stand: staging soak, PITR restore point before fiscal-touching deploys, additive-only fiscal migrations, RPC signatures stable.

## F. Fiscal-relevant rendering (§9.4)

⚠️ **Change-control mechanism still undesigned (O4).** Until it exists, treat receipt/invoice template files as frozen: any PR touching them needs explicit owner approval before deploy, because with network UI they reach every till instantly.
