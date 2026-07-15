# Weighing Scale Integration (CAS PR-II, RS-232)

**Status:** Phase A (hardware layer) shipped 2026-07-13. Phase B (sold-by-weight
sale flow) is deferred — see `docs/REGISTER.md` D-SC1..D-SC3.

## Hardware & protocol

| Property | Value |
|---|---|
| Device | CAS PR-II price-computing scale (protocol-compatible CAS siblings should work) |
| Connection | RS-232 (DB9) to the till PC; USB-serial adapter on machines without DB9 (standardize on FTDI — Prolific counterfeits are a known field failure) |
| Line settings | 9600 baud, 8-N-1 (CAS factory default; other bauds probed too) |
| Flow control | **DTR and RTS must be raised** or the scale stays silent |
| Protocol | Poll/response: host sends `ENQ` (0x05) → scale `ACK`s; host sends `DC1` (0x11) → scale answers one frame |
| Frame | `SOH STX <S\|U> <weight> <unit> <fmt> ETX EOT`, e.g. `01 02 "S  0.625kgp" 03 04` → stable, 0.625 kg |

Windows field gotcha (seen on the reference machine): a motherboard can declare
**two serial devices both named COM1** (`ACPI\PNP0501\0` + `\1`), making every
open fail with "port does not exist". Fix: rename the duplicate's `PortName` in
the registry and restart both PnP devices. Full commands in the original
detection notes (`/tmp/balancingscript/README.md` on the reference machine).

## Architecture (mirrors printer/fiscal conventions)

```
renderer                          preload               main process
ScaleSettingsPanel.tsx ─┐
POS weigh dialog (P.B) ─┼─ scaleService.ts ── electronAPI.scale ── scaleIpc.js ── scaleController.js ── casScale.js
                        │   (feature-detect,     (contextBridge)     ('scale:*'      (port owner, detect,   (pure frame
                        └── fails soft)                              handlers)       poll loop, config)      parser)
```

- `electron/hardware/casScale.js` — pure protocol module (constants, frame
  parser, probe validation). Unit-tested in `tests/hardware/casScale.test.ts`.
- `electron/hardware/scaleController.js` — owns the serial port. Lazy
  `require('serialport')` in try/catch: a broken native binding degrades to a
  reported error, never a startup crash. Config persists to
  `<userData>/scale-config.json`.
- `electron/scaleIpc.js` — `registerScaleIpc(ipcMain, app)` (called from
  `main.js`, controller cleaned up on window `closed`).
- `src/services/scaleService.ts` — renderer wrapper; feature-detects
  `window.electronAPI?.scale` so the PWA host and older packaged shells fall
  back to manual weight entry (update-policy §6.3: additive shell contract).
- `src/components/ScaleSettingsPanel.tsx` — diagnostics in Settings → Hardware
  → Scale (deep link `/settings?hw=scale`): status, live weight, detect with
  per-port probe results (answered / silent / busy / error), port/baud/enabled
  config.

## Port detection

The scale is electrically invisible to Windows (native RS-232 has no VID/PID),
so detection is **probe-based**: the scale proves itself by answering
`ENQ`+`DC1` with a frame containing a number and a known unit. Order:

1. Last-known-good port from config (instant in the common case).
2. Every listed port at the configured baud (9600 default), then remaining
   bauds (4800, 2400, 19200, 1200) — likely-baud-across-all-ports first, so a
   normally-configured scale is found in one sweep (~1–3 s).
3. Ports that fail to open (`busy`/`error`) are skipped for later bauds and
   reported per-port in the diagnostics table.

The probe writes two harmless control bytes to non-scale ports; the
remembered-port fast path keeps that rare. While polling, 6 consecutive silent
cycles (~4 s) → port dropped, state `disconnected`, re-detect every 5 s.

## IPC surface

Channels (all return `{ success, error?, ... }`): `scale:get-status`,
`scale:get-config`, `scale:set-config`, `scale:list-ports`, `scale:detect`,
`scale:read-once`, `scale:start`, `scale:stop`. Push events to the renderer
that called `scale:start`: `scale-reading` (`{weight, unit, stable, status,
raw, timestamp}`), `scale-status-change`. Types in `src/types/electron.d.ts`
(`scale?:` is optional — feature-detect).

## Development without hardware

`SCALE_MOCK=1 npm run electron:dev` — the controller swaps in a mock serial
class that behaves like a CAS PR-II on port `MOCK-SCALE` (drifting weight,
stable/unstable transitions), exercising the full detect/poll/IPC/UI path.
Verified end-to-end with a Playwright-driven Electron run.

## Packaging

`serialport` ^13 was already a dependency; its native bindings
(`@serialport/bindings-cpp`, win32-x64 prebuild included) are unpacked to
`app.asar.unpacked` by electron-builder smartUnpack — verified locally with
`electron-builder --dir` (same mechanism as the working `usb` module). No
build-config change was needed. ⚠️ First packaged Windows run is the real
proof — see REGISTER D-SC2.

## Phase B (sell-by-weight) — CODE COMPLETE 2026-07-13, deploy-gated

Decisions (user): 3dp end-to-end · stock tracked in kg · `items_sold` sums kg ·
one cart line per weighing · **manual weight entry BUILT (2026-07-15)** —
scale offline ⇒ the weigh dialog offers a weight field gated by a
manager/admin employee number + PIN (`employee_pin_login` RPC, lockout
included) and logs every entry to the local `manualWeightAudits` Dexie table
(v16). Audit is local-only for now (no server sync).

**Session model (redesigned 2026-07-15 after user testing):** the scale
session is **till-scoped** — POS starts it on mount and nothing but an
explicit Settings-panel stop ends it. The weigh dialog is a pure consumer:
instant live weight when the scale is present, and ONE stable offline panel
(retry hint + "Try again" + manual entry) instead of flapping with the
controller's scan/retry cycle. A scale status chip (green connected / blue
searching / red offline) sits in the POS bottom status bar.

- **Migration `20260730000000_weight_based_products.sql`** (⛔ must be
  `db push`ed to staging+prod BEFORE any till runs the Phase B client):
  `products.sold_by_weight` + stock/min_stock → NUMERIC(12,3);
  `transaction_items.quantity` → NUMERIC(12,3) + `unit` ('un'|'kg' — the sold
  line remembers its unit forever); `daily_sales_summary.items_sold` →
  NUMERIC(14,3); three dependent views dropped/recreated (unit added to
  `transaction_details` items JSON); sync RPCs recreated with the 20260717
  grant hygiene; `upsert_transaction_with_items` quantity cast ::NUMERIC(12,3)
  (the line that would have stranded fractional sales in the sync outbox);
  4 assistant RPCs' `SUM(quantity)::bigint` → numeric (kg would round).
- **Client**: product editor "sold by weight" toggle (price = €/kg, stock in
  kg); tapping a weighed product opens `WeighDialog` (live scale reading,
  Add gated on *stable* + capacity; only kg/g readings priced); cart lines
  carry `lineId` (weighed lines never merge, no steppers, − removes the
  weighing); receipt prints `0,625 kg × €/kg` (reprints too — unit is stored
  per line); SAF-T emits Quantity 3dp + `UnitOfMeasure KG`; SIGN ES sends
  quantity at 3dp; money is quantized per line at draft time so charged =
  printed = synced = AEAT-registered totals by construction.
- Adversarially reviewed (24 agents, 17 confirmed findings — all fixed,
  including the outbox sync path dropping `unit` and per-line cent
  quantization).

⚠ Before first LIVE weighed sale: one fiskaly SIGN ES TEST sale with a
fractional quantity (their quantity×unit_amount tolerance is unverified).
