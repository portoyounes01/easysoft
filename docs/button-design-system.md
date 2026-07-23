# Button design language — consolidation brief

**Status (2026-07-23): MIGRATION EXECUTED.** All four phases landed (commits `df25388` MenuRow/ListRow,
`51bddef` scope sweep, `efc4314` wave 1, `4154461` wave 2):

- **278 button sites migrated** onto the blessed winners (102 component files + 176 pages),
  each wave gated by a per-file adversarial diff review (48/55 clean; every finding fixed).
- **All screens now render inside the appearance scope** — the 13 unscoped pages plus Layout
  chrome follow the Appearances tokens (verified live: 2px-radius/orange test tokens reached
  every page).
- **14 dead files deleted** (LoginForm v1, Layout/Header, PrinterManager-complex, RoutingDebugger,
  ProductForm + VirtualNumpad, OrderPrintButton/Manager, and the earlier POS2/DS v1 removal).
- **Drift gate live:** `npm run check:buttons` (scripts/check-button-drift.mjs) fails on any new
  hand-written styled button vs the checked-in baseline (106 signatures pre-migration → **64**,
  all accounted for: frozen legacy branches, sanctioned token recipes, registered misfits).
- Typecheck: 137 pre-existing errors → **124** (deleted files carried 13); zero new errors.

**⚠️ Deliberately-untouched register (60 sites):** 31 legacy-frozen dialog branches (byte-identical
per the dialog-rebuild policy — they migrate when the legacy paths are decommissioned), 20 structural
misfits (e.g. VirtualKeyboard's framed key grid, tri-state assignment checkboxes, kiosk-scale
PairingButton contexts — each needs a component-API decision), 7 already-SSOT no-ops, 2 Appearances
preview mocks. Full per-site list with reasons: **docs/button-migration-register.md**.

**⚠️ Known stale:** the Button lab's specimen data (class strings + file:line refs) predates the
migration — re-run the extraction workflow to see the collapsed style count and fresh refs.

## The problem being solved

The app has ~15 button *roles* but **381 distinct button *styles*** — 346 of them hand-written
inline Tailwind, 253 used at exactly one call site. Worse, only ~193 styles follow the Appearances
tokens; 117 live on screens the tokens never reach, so customizing appearance makes the app *less*
consistent. Full evidence: the Button lab (deduped clusters view, env chips, uses lists).

## The unified language (41 blessed styles)

Every button in the app maps to one of these. Anything else is a bug.

| Purpose | Winner | Source |
|---|---|---|
| Page/admin primary CTA | `AdminActionButton · primary` | `ui/AdminActionButton` |
| Page/admin secondary | `AdminActionButton · outline` / `ghost` / `success` | `ui/AdminActionButton` |
| Ghost icon utility | `AdminActionButton · icon` | `ui/AdminActionButton` |
| Dialog/form primary CTA | `ActionButton · primary` (gradient) or dialog-system footer primary (SSOT) | `ui/ActionButton`, `theme/dialogStyle.ts` |
| Dialog secondary / cancel | `ActionButton · secondary/outline`, dialog footer secondary (SSOT) | same |
| Destructive | dialog-system danger solid / danger outline (SSOT) | `theme/dialogStyle.ts` |
| POS tile actions | `POSActionButton`, `OutlineButton`, `ProductCard`, `CategoryFilterButton` | `ui/` |
| Table row actions | `TableActionButton · edit/delete/sort/icon` | `ui/TableActionButton` |
| Tabs / nav | `TabButton` (reports + sidebar variants), `TabToggle` | `ui/TabButton`, `ui/TabToggle` |
| Numpads | `NumpadButton · default/action/confirm`; dialog-shell numpad keys (SSOT) | `ui/NumpadButton`, `QuickNumpad` |
| Toggles | `DialogSwitch on/off`, `DialogToggleRow` | `ui/dialogParts` |
| Selectable option cards | `PaymentMethodButton selected/unselected` | `ui/PaymentMethodButton` |
| Pairing | `PairingButton primary/secondary` | `ui/PairingButton` |
| Add/upload cards | `DashedCardButton` | `ui/DashedCardButton` |
| Menu/dropdown rows | ⚠️ blessed inline representative — **needs a `MenuRow` component** | Customers toolbar dropdown item |
| Mobile list rows | ⚠️ blessed inline representative — **needs a `ListRow` component** | mobile list-row nav button |

Plus: **336 decisions** covering every non-blessed style — 299 migrate, 37 retire, 4 held
undecided on purpose (Assistant mic toggle's 3-state recording indicator, DeliveryOrders status
filter card, Categories desktop card, PWA login mode toggle — each needs a real design call).
Retire = dead code (`LoginForm` v1, `Layout/Header`, `PrinterManager-complex`, `VirtualNumpad`,
`RoutingDebugger`), **legacy-frozen dialog branches** (stay byte-identical per the dialog-rebuild
policy — excluded from migration), or bespoke widget internals that leave the button language
(calendar day cells → DatePicker, floor-plan shapes → Tables canvas, Appearances preview mocks).

Every assignment went through a 9-agent adversarial review (evidence-based, reading the actual
call sites); it raised 114 corrections — secondary→primary inversions, selected-state chips
mapped to unselected winners, list rows mapped to icon chips — all applied.

## Rules going forward (prevention)

1. **Never hand-write button classes.** Import from `src/components/ui/` or use the dialog-system
   footer classes from `theme/dialogStyle.ts`. If no component fits, that's a design-system gap —
   extend a component or add a blessed style in the lab first.
2. **New screens must render inside the appearance scope** (`.ds2-visual-scope` + `visualStyle`) —
   see `buttonLabSiteEnv.ts` for the current coverage map.
3. The lab is the register: any new distinct style that shows up in a future extraction run is a
   regression.

## Remaining follow-ups

- ~~Re-extract the lab data~~ **DONE 2026-07-23**: the lab re-extracted post-migration and rebuilt
  as the living register — 284 styles: ♛ 37 design language · 138 recipes · 70 legacy-frozen ·
  26 widget internals · **13 drift** (the honest tail: Devices' 3 blue-purple pairing CTAs +
  issue-code outline, MyProfileDialog clock-out red, 2 lightbox/panel close-X's, RoutingRuleManager
  edit icon, 2 dialog-configured composites, and the 3 deliberately-undecided cards). Drift-gate
  scanner regex fixed (was blind to buttons whose onClick preceded className): baseline 63 → 137
  signatures, gate green.
- ~~Structural-misfit tail~~ **RESOLVED 2026-07-23**: 14 migrated (via component-API extensions:
  TableActionButton `dark`+disabled, TabToggle `description`+wrap, ListRow `divider`), 6 blessed
  as widget internals — see the register.
- **Legacy dialog branches (31 sites)** migrate automatically when the legacy dialog paths are
  formally decommissioned (dialog-rebuild policy decision).
- The 4 still-undecided styles from the plan (Assistant mic 3-state toggle, DeliveryOrders status
  filter card, Categories desktop card, PWA login mode toggle).
