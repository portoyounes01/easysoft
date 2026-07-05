# Update Policy — Till Fleet & Backend

**Type:** Policy / handoff brief. **Status:** decisions captured 2026-07-05; ready to expand into an implementation plan.

> **How to use this document (downstream planning agent, read first).**
> This is the **policy and the decisions already made** — not the implementation plan. Your job is to turn it into a thorough, phased, file-level plan that **integrates with `docs/multi-tenant-plan.md`** (do not fork or contradict it; reference its §-numbers and Deferral Register D-numbers). Every grounded fact below has a `file:line` — verify it still holds before you build on it (the repo drifts). Honor the project rule: **no silent deferrals** — anything you push to "later" goes in a register with a landing point and a risk-if-forgotten (mirror the style of `multi-tenant-plan.md` §Deferral Register).
>
> **Decision-provenance tags — respect these:**
> - **[USER-DECIDED]** — the user set this (this conversation or the parent plan). Plan *around* it; do not re-open.
> - **[RECOMMENDED]** — the author's proposal, derived from the constraints but **not yet user-ratified**. Plan for it, but **surface it for user sign-off** in your plan rather than treating it as settled.
> - **[OPEN]** — undecided. Design a proposal *and* flag it for the user.

---

## 1. Scope

This policy governs **how software and configuration updates reach a multi-tenant fleet of POS tills and the shared backend** — safely, without fleet-wide selling outages, and without violating fiscal immutability. It covers five update surfaces (§4), the target till architecture that makes updates cheap (§6), the fail-closed boot/readiness model (§7), the version contracts that survive a mixed-version fleet (§8), backend deploy safety (§9), and the migration to get there (§10).

Out of scope: the multi-tenant data model, RLS/isolation, and fiskaly integration themselves — those live in `docs/multi-tenant-plan.md`. This doc only touches them where update mechanics intersect them.

---

## 2. TL;DR — the policy in one screen

1. **Rollout is never atomic.** A distributed till fleet runs mixed versions against one shared backend. Therefore every cross-component contract (till↔server RPCs, UI↔native-shell hardware API) is **versioned and backward-tolerant**, and every change is **expand → migrate → contract**, never a breaking change in one shot. [RECOMMENDED — constraint-derived]
2. **Shrink the distributed surface.** Electron exists *only* to drive hardware. The UI is loaded from the network (like the future PWA), not shipped in the installer. This moves the fast-moving code (UI + business logic) back to a **centralized** deploy (Vercel) and leaves only a thin, rarely-changing **hardware shell** on each till. Updates to the UI then ship at web speed with no fleet visit. [USER-DECIDED — direction; §6]
3. **Keep the native hardware layer as-is.** Do **not** rewrite it in Tauri/Rust or replace it with WebUSB/WebSerial. It works and it's the finicky part. [RECOMMENDED; §6.4]
4. **Fail-closed on selling; loud on diagnosis.** After a power-cut or any unhealthy state, the till **must not sell** until all preconditions are green **[USER-DECIDED]** — and it must **boot to a visible red/green readiness screen**, never a blank/frozen one, because a blank screen is the worst outcome for incident-minimization (undiagnosable) **[RECOMMENDED — mechanism]**. [§7]
5. **The installed shell only changes for hardware/native reasons** — which is rare — and every such change is gated by a **minimum-shell-version handshake** so a newer UI can never silently drive an incompatible shell. [RECOMMENDED; §8]
6. **The backend is shared: a bad deploy is an all-tenant selling outage** (v1 is online-required) and **fiscal writes cannot be rolled back**. Backend deploys therefore require staging soak, restore points, tenant-scoped feature flags, and additive-only fiscal migrations. [RECOMMENDED; §9]
7. **The whole till migration rides one reversible config flag** (`renderer_source`), so every step is a flip, not a reinstall, and rollback is instant. [RECOMMENDED; §10]

---

## 3. Grounded current state (verified — confirm before building)

- **Electron already loads the renderer by URL, not by file.** `electron/main.js:124,138` call `loadURL`. Production resolves to `app://pos/index.html` (`electron/rendererConfig.js:4`), a **custom protocol** that serves the **bundled local `dist/`** and **injects a CSP** (`electron/main.js:100-115`). → The shell is *already* a URL-loading host; the only coupling to fix is that the URL points at a bundled build.
- **Security posture is already remote-safe:** `nodeIntegration:false`, `contextIsolation:true`, `enableRemoteModule:false`, everything via a preload allowlist (`electron/main.js:152-156`).
- **The hardware boundary is already clean and finite:** `contextBridge.exposeInMainWorld('electronAPI', …)` in `electron/preload.js`, backed by `ipcMain.handle('hardware:*')` (`electron/main.js:228-492`: init, print-receipt, open-cash-drawer, get-drawer-status, test-printer, get-hardware-status, discover/connect printers, monitoring, **check-all-connections**) and `fiscal:*` safeStorage signing (`electron/fiscalSigning.js`). **This surface becomes the versioned UI↔shell contract (§8).**
- **Native hardware deps** (keep): `escpos`, `escpos-usb`, `serialport`, `usb` (`package.json:38-51`).
- **Runtime-config layer is planned, not yet built.** `rendererConfig.js` today resolves dev-vs-prod URL from argv/env only. `multi-tenant-plan.md` §9.2 / §11 Phase 0 introduces `userData/config.json` (Supabase URL + anon key + environment) read at startup and preferred over Vite-baked values. **This policy extends that same file** (§10 Stage 0).
- **Relevant existing plan hooks:** online-required v1 (D1 / constraint 1); `ConnectivityGate` v1 (Phase 2) and checkout gate (§7.3); offline E2E test (§12); fiskaly **layout-approval gate + tenant-layout indemnity**, receipt templates centrally locked (§3); `electron-updater` + code-signing deferred (D10 → Phase 6); builds currently **unsigned** (`CSC_IDENTITY_AUTO_DISCOVERY=false`, Phase 1∥).

---

## 4. The five update surfaces (policy per surface)

| Surface | Blast radius | Rollout shape | Policy |
|---|---|---|---|
| **Config / keys / env** (anon key, Supabase URL, environment, `ui_origin`, `renderer_source`) | Per-till | Push `config.json`; no reinstall | Handled by the runtime-config layer (plan §9.2). All future key/project/UI-origin changes are config flips. |
| **Backend** (DB schema, RLS, RPCs, edge functions) | **All tenants at once** | One global deploy, instant | Staging soak + restore point + additive-only fiscal migrations + tenant-scoped feature flags for behavior changes (§9). Contract-preserving by default. |
| **UI + business logic** (the web app) | Per-session | Vercel redeploy + reload; always latest | Centralized. Ships continuously **except** fiscal-relevant rendering, which is behind change-control (§9.4). Must stay backward-tolerant of the oldest in-field shell (§8). |
| **Till native shell** (Electron main/preload/native modules) | Per-till, **heterogeneous versions** | Installer / electron-updater | Changes only for hardware-API/native reasons. Every change gated by min-shell-version handshake (§8). electron-updater timing = [OPEN §11]. |
| **fiskaly API** | All tenants | External, version-pinned (`X-Api-Version`) | Their breaking changes can force a coordinated backend+shell update we don't schedule — the strongest reason the min-version block and a remote update path must exist before the fleet grows (§9, §11). |

**Ordering rule across surfaces (fleet-level expand→contract):** backend rolls forward first (additive) → clients/UI catch up → backend removes the old contract last, only after telemetry shows nobody uses it.

---

## 5. Governing principles (invariants any plan must satisfy)

- **P1 — No atomic rollout.** Assume, at any instant, tills on ≥2 UI versions and ≥2 shell versions hitting one backend. Every contract is versioned and tolerant of one version of skew in each direction, minimum.
- **P2 — Expand/migrate/contract, at both DB and fleet level.** Never a breaking rename/removal in one deploy. (The plan already applies this to the initial migration, §9.4; here it becomes the *standing* rule.)
- **P3 — Fail-closed on selling, fail-loud on state.** Unhealthy → cannot sell, but always shows *why* (§7).
- **P4 — Reversibility.** Every fleet-affecting change is revertible without a reinstall (config flag) or without a client redeploy (server-side deploy, RPC signatures unchanged — the plan already relies on this, §9 rollback story).
- **P5 — Fiscal writes are irreversible.** No update may risk mis-issuing; a botched fiscal deploy is corrected only by credit note, never rollback. Fiscal-table migrations are append-only + `session_replication_role=replica` to avoid `updated_at` drift on sealed rows (plan §9.4).
- **P6 — Least distributed surface.** Prefer centralizing code (Vercel/backend) over distributing it (installers). The only thing that *must* live on the till is hardware control + the boot/gate shell.

---

## 6. Target till architecture: thin hardware shell + network UI

**Decision [USER-DECIDED — direction; mechanics RECOMMENDED]:** the till = **(a)** a thin native Electron shell (hardware + safeStorage session + boot/gate) that changes rarely, **+ (b)** the UI/business logic loaded from the network (the same web build the future manager PWA uses), **+ (c)** a minimal cached gate shell for offline *diagnosis* (§7).

Rationale: Electron is used **only** for hardware; the UI has no native dependency. Because v1 is already online-required (D1), loading the UI over the network adds **no new availability dependency** — the usual "offline" objection to remote UI does not apply here. Result: the fast-moving code stops being distributed, and the fleet-skew problem shrinks to the small hardware-API surface.

**6.1 Where the UI comes from.** In production, repoint the renderer from `app://pos/index.html` (bundled `dist/`) to a **locked-origin network URL** (`ui_origin` in config). Enforce origin allowlist + CSP in the Electron session (the `app://` handler already injects CSP — extend, don't remove). Never render third-party content in that window.

**6.2 Session & pairing** stay in the native shell via `safeStorage` (plan A5/§6.2), exposed to the network UI through the preload — the *device* is the native install; the UI is just a view. This is cleaner than a browser session and aligns with "the device is the RLS principal."

**6.3 One web build, two hosts.** The till UI becomes "the web app hosted in a hardware shell"; the future manager PWA is "the same web app in a browser." This collapses two codebases toward one and directly serves the plan's PWA-readiness goal (§8) and "one identity across POS and PWA." **Implication for the plan:** the shared build must **feature-detect the hardware bridge** — hardware/print/drawer paths guard on `window.electronAPI` being present and degrade cleanly in the browser host (a manager PWA session has no shell). The hardware API is a *capability*, not an assumption.

**6.4 Do NOT rewrite the hardware layer. [RECOMMENDED]**
- **Tauri/Rust:** smaller binary + built-in updater, but forces a rewrite of the working `serialport`/`usb`/`escpos` layer and adds system-webview skew across OSes. Update win is obtainable from electron-updater instead. Not worth it.
- **WebUSB/WebSerial/WebHID:** Chromium-only, per-device permission gestures (bad for unattended tills), secure-context limits, many network/USB-class printers unreachable, drawer usually kicked *through* the printer. Too flaky for production POS.
- Keep Electron + the Node hardware modules; only repoint the UI.

---

## 7. Fail-closed boot & readiness gate

**Decision:** the till **must not sell** until healthy **[USER-DECIDED]**; but it **must boot to a loud diagnostic readiness gate**, not a blank screen **[RECOMMENDED — mechanism]**.

**7.1 Why a cached gate shell is mandatory.** If the renderer loads purely from the network and the network is down at boot, Electron shows its default blank error page — the exact undiagnosable state to avoid. So ship a **minimal local gate bundle** (in the installer, served via `app://`) whose only jobs are: boot offline → run preflight → render the red/green checklist → hand off to the network UI once all-green. The cached shell is for **diagnosis, not operation**. (This is why we do **not** need a full offline PWA — see §12.)

**7.2 Preconditions taxonomy [OPEN — classification needs user/compliance sign-off].** "Everything perfect" must be classified so the gate blocks on correctness, not on every yellow light (over-blocking creates outages):

| Class | Effect | Candidate members (confirm) |
|---|---|---|
| **Blocking** | No sale until green | **UI origin (`ui_origin`) reachable** (else the gate cannot hand off — distinct from backend reachability); device enrolled + valid session; backend reachable; fiskaly reachable; checkout function healthy; **receipt printer online?** |
| **Tender-specific** | Blocks only the affected tender | cash drawer offline → block cash, allow card |
| **Degraded** | Warn, keep selling | kitchen/secondary printer offline |
| **Informational** | Nudge, never block | "update available" (unless it trips the min-version rule, §8) |

Open questions the plan must resolve: is a working **receipt printer legally blocking** (must you be able to deliver the fiscal document to complete the sale)? Is the **cash drawer** truly tender-specific? These are compliance/product calls, not engineering defaults.

**7.3 Two gate moments (both required):**
- **Boot gate** — the power-cut case: don't enter the selling UI until healthy.
- **Checkout gate** — health can drop mid-shift; re-verify at issuance. The plan already has this (`ConnectivityGate`, "Pay disabled with typed banner", §7.3).

**7.4 Debounce/hysteresis.** A 2-second fiskaly blip must not hard-lock a till with customers queued. Prefer a short retry/grace at checkout over a global freeze on any momentary red.

**7.5 Recovery UX is the real incident-minimizer.** Each red item states the cause and the fix ("check the router", "printer USB unplugged", "call support with code X"), turning a support call into a self-heal.

**7.6 Reuse existing signals.** The preflight is assemblable from the current hardware IPC (`hardware:check-all-connections`, `get-hardware-status`, `get-drawer-status`, `electron/main.js:478,273,255`) plus new network/backend/fiskaly/session pings.

---

## 8. Version contracts (survive a mixed-version fleet)

- **UI↔shell hardware API [RECOMMENDED].** The `electronAPI.hardware.*` / `fiscal:*` preload surface (§3) is a **versioned public API**. The preload exposes `shellVersion` + a hardware-API version; the network UI declares the **minimum shell version** it requires; the **gate blocks** with "update the installer" if the installed shell is too old (a *blocking* precondition, §7.2). This is the single mechanism that lets the UI deploy continuously without silently driving an incompatible shell.
- **Till↔server RPC/edge-function signatures [RECOMMENDED].** Treat as a versioned API permanently. The plan already leans on "RPC signatures unchanged" for zero-client-redeploy cutovers (§9 rollback) — protect that property for all future changes (P1/P2).
- **Forced vs lazy updates.** Routine updates roll out lazily; compliance-critical ones **raise the minimum version floor**, which the gate enforces as a hard block. This is the lever for a fiskaly-forced breaking change (§4).

---

## 9. Backend deploy safety (shared instance + fiscal amplifiers)

- **9.1 Online-required amplifier.** A bad backend deploy stops **all selling for every tenant** (no offline fallback except manual pre-printed AT docs). → staging soak (plan Phase 1∥ substrate), a **PITR restore point before every fiscal-touching deploy** (plan §9 already does this for the migration — make it standing), health checks, and preferably **out-of-business-hours deploy windows**.
- **9.2 Fiscal-immutability amplifier.** A mis-issuing `pos-checkout` deploy is not recoverable by redeploy (P5). Fiscal-table migrations stay additive + replica-mode. The idempotency ledger (`fiscal_issue_attempts`, plan §4.5) must stay stable across versions so a retry from an *old* client after a new deploy reconciles on the same `checkout_id`.
- **9.3 Canary by tenant, not by instance.** True canary is impossible on one shared backend — but behavior changes can hide behind a `tenant_fiscal_config`/feature flag and enable tenant-by-tenant. Design new behavior flag-gated.
- **9.4 Fiscal-layout change-control [OPEN].** Receipt/invoice rendering is client code; with continuous UI deploys, an approved layout (fiskaly approval gate + indemnity, §3) could change without re-approval. The plan must define a change-control path so fiscal-relevant rendering is version-frozen/approved even while the rest of the UI ships continuously.

---

## 10. Migration approach (constraints for the plan; expand into detail)

**Spine [DECIDED]:** one reversible config field, `renderer_source: 'bundled' | 'network'` (+ `ui_origin`), added to the Phase-0 `config.json`. Every stage is a per-till flip; rollback is instant, no reinstall.

**Stage sequence (invariants — keep this order):**
0. **Extend runtime-config** (rides plan Phase 0): add `ui_origin` + `renderer_source`, default `bundled`. Zero behavior change. *This is the reversibility substrate.*
1. **Gate before repoint:** ship the readiness gate (§7) in front of the **still-bundled** UI. Proves the gate against a known-good UI without changing where the UI comes from. Preload begins exposing `shellVersion`.
2. **Pilot repoint:** deploy the web build to a locked origin; flip **one** till to `network`; enforce origin allowlist + CSP; soak. Rollback = flip to `bundled`.
3. **Enforce min-shell-version handshake** (§8) once ≥1 network till is proven.
4. **Roll the fleet + set cadence:** flip remaining tills; UI now ships via Vercel; installer changes only for hardware/native, version-gated; apply §9.4 change-control.

**Invariants that make it "solid":** reversible at every step (Stage 0); **gate before repoint** (1 before 2); **pilot before fleet** (2 before 4); **version handshake before fleet-wide network UI** (3 before 4).

**Slotting into `multi-tenant-plan.md`:** Stage 0 = Phase 0. Stages 1–2 can land anytime after (they gate the bundled UI regardless of tenancy). Stages 3–4 want the real backend/fiskaly health signals from **Phase 4** (`pos-checkout`) and **must complete before Phase 5 (tenant #2)** — the point where "drive to the till to update it" stops scaling.

---

## 11. Open decisions the plan must resolve (with owner)

| # | Decision | Owner | Recommendation |
|---|---|---|---|
| O1 | **Preconditions classification** (is receipt printer blocking? cash drawer tender-specific?) — §7.2 | User / compliance | Draft the table, get sign-off before coding the gate |
| O2 | **electron-updater timing** (plan D10 says Phase 6) | User | **Pull earlier** — decision + minimal channel before Phase 5; a fiskaly-forced change with no remote update path is a fleet outage |
| O3 | **Code-signing** (builds unsigned today) | User / procurement | Start the cert decision now — multi-week lead time; blocks a *smooth* updater channel, not this roadmap |
| O4 | **Fiscal-layout change-control mechanism** — §9.4 | Agent → user | Propose a version-freeze/approval path for receipt rendering |
| O5 | **Min-version bump governance** — who declares a forced floor and how it's published to the gate | Agent | Define the mechanism + a `tenant_fiscal_config`/server-published min-version |

---

## 12. Non-goals & deferrals ⚠️ (no silent deferrals)

| # | Deferred / excluded | Why | Lands / revisit | Risk if forgotten |
|---|---|---|---|---|
| U1 | **Full offline PWA / service-worker caching of the whole app** | User's fail-closed stance: till must not operate unless healthy → only the *gate* needs to render offline | Not planned | None — by design; revisit only if offline-sell (plan D1) is ever un-deferred |
| U2 | **electron-updater automation** | Fleet is tiny; manual reinstall tolerable short-term | Before fleet grows (O2); recommend pre-Phase-5 | Manual till visits; can't remotely fix a native/shell bug |
| U3 | **Code-signing** | Procurement decision, real lead time | O3 | OS security warnings; updater handshake broken on Win/mac |
| U4 | **Tauri / WebUSB migration** | Rejected — rewrites the working hardware layer for no net update win (§6.4) | Not planned | None |

---

## 13. Acceptance criteria the resulting plan must meet

1. A UI change reaches the whole fleet via a Vercel redeploy with **no installer and no till visit**.
2. A till that loses power and reboots with the network down shows a **diagnostic red screen naming the failed precondition**, never a blank one, and **cannot start a sale** until green.
3. A network UI requiring a newer shell than is installed is **provably blocked** (red precondition), not silently misbehaving.
4. Any till can be reverted from `network` to `bundled` UI (or retargeted to another environment) **by editing `config.json`, with no reinstall**.
5. A backend deploy that misbehaves can be rolled back with **zero client redeploy** (RPC signatures unchanged), and no fiscal-touching deploy ships without a restore point.
6. No update path can cause fiskaly⇄Postgres divergence or mis-issuance (idempotency ledger stable across versions).
7. Fiscal-relevant rendering cannot change in production without passing change-control (§9.4).

---

## 14. Source pointers (read these)

- `docs/multi-tenant-plan.md` — the parent plan; especially §2 (rings), §3 (fiskaly/layout gate), §7.3 (connectivity/checkout gate), §9 (migration + rollback), §9.2 & §11 Phase 0 (runtime-config layer), §11 Phase 1∥ (deploy/CI substrate, unsigned builds), §11 Phase 4–6, Deferral Register (D1, D10).
- `electron/main.js` (`loadURL`, `webPreferences`, `app://` handler + CSP, `hardware:*` handlers), `electron/rendererConfig.js`, `electron/preload.js`, `electron/fiscalSigning.js`.
- `package.json` (native hardware deps; the unsigned-build / `electron:dist` scripts).
