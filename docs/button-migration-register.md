# Button migration — untouched-site register

Every site the 2026-07-23 consolidation migration **deliberately did not touch**, with the
migration agent's stated reason. Produced by the wave 1 + wave 2 migration runs (each agent was
required to disposition every work-order entry: migrate it or register it here — silent skips
were not allowed) and cross-checked by the per-file adversarial diff reviews.

How to act on each category:
- **legacy-frozen** — inside the legacy fallback branch of an `applied ? shell : legacy` dialog.
  Byte-identical by policy (dialog rebuild expectation). These disappear wholesale when the
  legacy dialog paths are decommissioned; do NOT migrate them piecemeal.
- **structural** — the assigned winner's API genuinely cannot express the site (fixed sizes,
  required props, framed grids, tri-state controls). Each needs a small design/API decision:
  extend the winner, bless a new shape, or re-assign.
- **already-SSOT** — the site already renders the winner (usually `dialogButtonClasses(applied)`).
  Nothing to do.
- **preview-mock** — Appearances-page preview widgets that intentionally imitate styles; not
  real app buttons.

## Legacy-frozen dialog branches — 31

- `src/components/CashDrawerDialog.tsx:216`
  legacy-frozen: site is in the non-applied fallback return (else path of `if (applied) return <ConfiguredDialogShell...>`); prime directive 4 requires this branch to stay byte-identical behind the dialog-style toggle
- `src/components/CashDrawerDialog.tsx:230`
  legacy-frozen: non-applied fallback branch stays byte-identical (prime directive 4); migrating would alter the legacy default path
- `src/components/CashDrawerDialog.tsx:238`
  legacy-frozen: non-applied fallback branch stays byte-identical (prime directive 4); migrating would alter the legacy default path
- `src/components/HR/MyProfileDialog.tsx:216`
  Inside frozenRange 208-276 (legacy no-applied-style branch); read-only per prime directive 4 — legacy branch stays byte-identical.
- `src/components/HR/MyProfileDialog.tsx:254`
  Inside frozenRange 208-276 (legacy PIN dialog); read-only per prime directive 4 — legacy branch stays byte-identical.
- `src/components/HR/MyProfileDialog.tsx:261`
  Inside frozenRange 208-276 (legacy PIN dialog); read-only per prime directive 4 — legacy branch stays byte-identical.
- `src/components/ProductOptionsDialog.tsx:232`
  Frozen legacy branch — the X lives exclusively in the non-applied else-return (the shell branch uses ConfiguredDialogShell's built-in close); directive 4 keeps the legacy branch byte-identical.
- `src/components/ProductOptionsDialog.tsx:242`
  Frozen legacy branch — else-return footer that renders only when applied is null; the assigned winner requires a DialogStyleConfig and the cookbook forbids inventing a default config; per the cookbook's own plumbing rule the non-applied fallback keeps its existing classes.
- `src/components/ProductWizard.tsx:672`
  Legacy dual-render else-branch: the site sits exclusively inside the non-applied fallback return (after `if (applied) return <ConfiguredDialogShell...>`), which is the frozen legacy dialog path that must stay byte-identical behind the pref toggle (prime directive 4). It has no counterpart in the shell branch - the applied shell uses ConfiguredDialogShell's own close control.
- `src/components/PurchaseReceiptImportDialog.tsx:389`
  Close button lives only in the legacy non-applied dialog panel (the return after `if (applied) return <ConfiguredDialogShell>`); applied mode gets its close from ConfiguredDialogShell. Frozen per prime directive 4 — identical buttons in MyProfileDialog:221 and CashDrawerDialog:216 were likewise left byte-identical by sibling migrations.
- `src/components/QuickNumpad.tsx:108`
  Legacy (else) branch of the shell/legacy dual render; frozen byte-identical per prime directive 4 and the pref-toggle contract. The shell branch renders the clear key with the winner-following palette recipe already. NumpadButton (numpad-action) would replace a frame-integrated hairline cell with a discrete rounded key — a structural rebuild, not a minimal diff.
- `src/components/QuickNumpad.tsx:137`
  Legacy (else) branch of the shell/legacy dual render; frozen byte-identical per prime directive 4 and the pref-toggle contract. The shell branch already carries the winner SSOT quick-value recipe (inline-quicknumpad-keys-quick-value) with palette tinting.
- `src/components/QuickNumpad.tsx:95`
  Legacy (else) branch of the shell/legacy dual render (shellStyle.numpad === 'keys' early return); frozen byte-identical per prime directive 4 and the pref-toggle contract. The shell branch already carries the winner SSOT recipe (inline-quicknumpad-keys-white-key). Also a structural misfit: rounded-xl discrete keys cannot drop into the continuous ring-2/overflow-hidden framed grid with computed hairline dividers without a rebuild.
- `src/components/SimpleNumpad.tsx:77-86`
  Same legacy-frozen branch: the gray-tint clear key is part of the original framed grid rendered when numpad='legacy' or no dialog shell context exists. Swapping it to numpad-action (NumpadButton variant="action") would break the byte-identical legacy contract (prime directive 4) that the dialog-style pref toggle depends on; the shell 'keys' branch already provides the blessed styling for styled dialogs.
- `src/components/SimpleNumpad.tsx:89-98, src/components/SimpleNumpad.tsx:65-74`
  Sites live exclusively in the legacy branch of the file's shell/legacy dual render (early-return equivalent of the applied ? shell : legacy ternary). The shell branch above already contains the assigned winner recipe verbatim (inline-quicknumpad-keys-white-key with palette tokens), and the framed grid below is the numpad='legacy' axis expression from dialogStyle.ts that prime directive 4 requires to stay byte-identical. The same JSX path also serves shell-less page surfaces (e.g. ReceiptHistorySelector), so migrating only non-legacy uses would require inventing a third render branch.
- `src/components/VirtualKeyboard.tsx:96`
  NumpadButton component does not drop in: keys are flex-weighted (flex-1/flex-[1.5]/flex-[5.5]) cells of a contiguous h-full framed grid with conditional border-r-0 dividers and vh-based inline font sizing; the component's min-h-touch/w-full/rounded-2xl solid-fill expression would break the h-full fill inside CustomerDialog and the divider geometry. The cookbook lists no class recipe for the numpad-default winner, so the recipe path is not open; hand-rolling gray-200 keys inside the frame would be drift. QuickNumpad's legacy branch shows this exact white framed grid IS the sanctioned non-shell expression, so the site is left byte-identical.
- `src/pages/Employees.tsx:1327`
  legacy else-branch of appliedDialogStyle ? ConfiguredDialogShell : fallback dual-render — frozen byte-identical per prime directive 4
- `src/pages/Employees.tsx:1334`
  legacy else-branch of applied-style dual-render (discard confirm fallback modal) — frozen byte-identical
- `src/pages/Employees.tsx:1404`
  legacy else-branch of applied-style dual-render (delete confirm fallback modal) — frozen byte-identical
- `src/pages/Employees.tsx:1410`
  legacy else-branch of applied-style dual-render (delete confirm fallback modal) — frozen byte-identical
- `src/pages/HR.tsx:889 (now ~906, fallback close button)`
  legacy fallback dialog chrome (non-applied branch of the shell/legacy dual render) — frozen per prime directive 4; left byte-identical
- `src/pages/HR.tsx:902 (now ~918, fallback Save profile)`
  legacy fallback dialog branch (non-applied else branch) — frozen per prime directive 4; left byte-identical
- `src/pages/Inventory.tsx:746, 800 (audit refs 743-745, 797-799)`
  Both X close buttons sit in the legacy else-branches of the applied ? ConfiguredDialogShell : legacy dual-render ternaries — frozen per prime directive 4; the shell branch uses ConfiguredDialogShell's own close affordance
- `src/pages/Inventory.tsx:752, 806 (audit refs 749, 803)`
  Legacy dual-render else-branch, frozen per directive 4; shell-branch footer already uses shellButtons.secondary (SSOT), and shellButtons is null whenever the legacy branch renders
- `src/pages/Inventory.tsx:753 (audit ref 750-752)`
  Legacy dual-render else-branch, frozen per directive 4; shell-branch Save already uses shellButtons.primary
- `src/pages/Inventory.tsx:808 (audit ref 805-807)`
  Legacy dual-render else-branch, frozen per directive 4; shell-branch Reset stock already uses shellButtons.dangerOutline
- `src/pages/Inventory.tsx:813 (audit ref 810-812)`
  Legacy dual-render else-branch, frozen per directive 4; shell-branch Stock in already uses shellButtons.primary
- `src/pages/Inventory.tsx:817 (audit ref 814-816)`
  Legacy dual-render else-branch, frozen per directive 4; shell-branch Stock out already uses shellButtons.danger
- `src/pages/Products.tsx:941`
  Legacy fallback branch of the dual-render viewingProduct dialog (appliedDialogStyle falsy path) — frozen per prime directive 4; shell branch already uses ConfiguredDialogShell SSOT.
- `src/pages/Products.tsx:957`
  Legacy fallback branch of the dual-render viewingProduct dialog — frozen per prime directive 4; the shell branch's Close already uses dialogButtonClasses(applied).secondary.
- `src/pages/Tables.tsx:264 (legacy Dialog close X)`
  legacy dialog branch — the X lives only in the non-applied fallback render of the dual-render Dialog (shell branch uses ConfiguredDialogShell's own close affordance); legacy path stays byte-identical per prime directive 4

## Structural misfits — RESOLVED 2026-07-23 (14 migrated, 6 blessed as widget internals)

**Migrated** (component-API extensions made this possible: TableActionButton gained `dark` +
disabled styling, TabToggle gained `description` sublabels, ListRow gained `divider={false}`):

- `src/components/CategoryForm.tsx` keyboard pill → selectable-pill recipe + aria-pressed
- `src/components/Auth/LoginForm2.tsx` re-pair CTA → danger solid var(--ds2-danger-*) recipe
- `src/pages/Assistant.tsx` get-pairing-code → primary gradient recipe; example prompt cards →
  outline expression (off-language extras dropped)
- `src/pages/OrderQueue.tsx` Collected → AdminActionButton · success
- `src/pages/Employees.tsx` 2 disabled icon placeholders → TableActionButton disabled
- `src/pages/Tables.tsx` floating toolbar (rotate/edit/delete) → TableActionButton dark
- `src/pages/Transactions.tsx` toast dismiss → TableActionButton icon dark
- `src/pages/Settings.tsx` SegmentedControl (7 usages) → TabToggle with descriptions
- `src/pages/{Customers,Employees,Products}.tsx` partial-row tap targets +
  `src/pages/Reports.tsx` date-range summary → sanctioned ghost hover recipe

**Blessed widget internals** (deliberate exemptions — these are self-contained widgets whose
internals leave the button language; recorded in the drift baseline):

- `src/components/LanguageSwitcher.tsx:38` — bespoke sidebar language control (flyout, collapsed
  tooltip, trailing code pill); one-of-a-kind chrome
- `src/components/ProductAssignmentManager.tsx:218,248` — tri-state assignment tree rows
  (none/partial/all checkboxes); a tree control, not buttons
- `src/components/VirtualKeyboard.tsx:96-98` — framed keyboard grid keys (flex-weighted,
  divider-bordered, two-state caps/symbols toggles); the keyboard IS the widget
- `src/pages/Employees.tsx:1127` — password-reveal eye inside an input well; an input adornment
  (InputField internals family), not a standalone button

## Already the SSOT winner (no-ops) — 7

- `src/components/DesignSystem2/ProductsPageReference2.tsx:501`
  admin-action-icon's tokens (text-gray-700 hover:bg-gray-100) are illegible on the blue-gradient dialog header (~2:1 contrast at rest); the blessed ConfiguredDialogShell (src/components/ui/ConfiguredDialogShell.tsx:75) itself uses text-white hover:bg-white/20 for colored headers, which this site already matches by inheriting the header's text-white — forcing the winner recipe would be a visual regression, and overriding via className would create conflicting Tailwind utilities with undefined precedence. Left byte-identical per prime directive 3.
- `src/components/HR/MyProfileDialog.tsx:183`
  Already expresses the winner: the source uses dialogButtonClasses(applied).secondary — the inline SSOT itself (prior sweep, commit da7a05e). The audit captured the rendered DOM class string, which exactly matches dialogButtonClasses output. No change needed.
- `src/components/HR/MyProfileDialog.tsx:190`
  Already expresses the winner: the source uses dialogButtonClasses(applied).primary plus the site's disabled: utilities — the inline SSOT itself. Audit captured the rendered class string. No change needed.
- `src/components/ProductOptionsDialog.tsx:212`
  Already the SSOT winner — the site renders className={buttons.secondary} from dialogButtonClasses(applied); the audit captured the resolved class string. No change needed.
- `src/components/ProductOptionsDialog.tsx:213`
  Already the SSOT winner — className={buttons.primary} from dialogButtonClasses(applied). No change needed.
- `src/pages/DeliveryOrders.tsx:398`
  Base already expresses the winner: the site's resting classes (`w-full min-h-10 px-4 py-2.5 text-left text-sm hover:bg-gray-50` + `text-gray-700`) are token-identical to the Customers sort-menu-item SSOT. The audit captured the flattened selected-state string; the `bg-sky-50 font-semibold text-sky-800` layer is the site's active-sort indicator, which the winner does not define — kept per prime directive 5 (state stays wired/visible). No change needed.
- `src/pages/Settings.tsx:2344-2368`
  TabButton sidebar variant renders only icon+label; this nav pill has an h-11 w-11 icon chip, a two-line label+description block, and a trailing ChevronRight it cannot reproduce, and the winner's inactive classes (text-neutral-300 hover:bg-slate-800) are dark-rail-specific — illegible on this light glass sidebar. Active state already uses bg-gradient-primary, which the ds2 visual scope remaps to var(--ds2-brand-*) tokens, so it is already token-following. Left byte-identical.

## Preview mocks — 2

- `src/pages/Appearances.tsx:323 (OrderPreview footer)`
  preview mock
- `src/pages/Appearances.tsx:358 (MenuPreview item cards)`
  preview mock

