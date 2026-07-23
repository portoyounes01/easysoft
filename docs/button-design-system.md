# Button design language — consolidation brief

**Status (2026-07-23):** plan curated and loaded into the Button lab (Appearances → Button lab).
Migration NOT started — every assignment is reviewable/editable in the lab before any code changes.

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

## ⚠️ Deliberately NOT done yet (needs sign-off)

- **The actual code migration** of 317 styles across ~75 files — big, breaking-risk change;
  execute in waves (suggested: dialogs → tables/icons → misc pages) after plan sign-off in the lab.
- **Bringing the 13 unscoped screens into the appearance scope** (Tables, HR, Inventory, Devices,
  OrderQueue, layout chrome, …) — prerequisite for "everything follows Appearances".
- **`MenuRow` / `ListRow` components** — two real gaps; 16 styles wait on them.
- **Lint enforcement** (e.g. flag inline `className` buttons outside `ui/`) — worth doing after
  migration so it doesn't fire on legacy code.
