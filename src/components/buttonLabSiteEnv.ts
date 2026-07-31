/**
 * Button lab — real-app site environments.
 *
 * GENERATED from the site-environment mapping workflow (2026-07-22): for every
 * source file referenced by lab specimens, which DS2 environment its buttons
 * actually render in inside the real app:
 *
 * - 'scoped'      inside a `.ds2-visual-scope` element carrying visualStyle —
 *                 full token remap (colors + radius + neutrals) applies.
 * - 'dialog-vars' inside a ConfiguredDialogShell panel on an UNSCOPED page —
 *                 the --ds2-* vars are defined, so styles referencing var(--ds2-*)
 *                 react, but literal Tailwind classes stay frozen.
 * - 'unscoped'    nothing applies — buttons are frozen at their literal styles.
 * - 'mixed'       component mounted in several environments (see mounts).
 *
 * `exceptions` are line ranges inside a file whose environment differs from the
 * file default (e.g. shell vs legacy dialog branches). Regenerate via the
 * mapping workflow rather than editing by hand.
 */

export type SiteEnv = 'scoped' | 'dialog-vars' | 'unscoped';

export interface FileEnvException {
    from: number;
    to: number;
    env: SiteEnv;
    why?: string;
}

export interface FileEnvEntry {
    env: SiteEnv | 'mixed';
    note?: string;
    /** For mixed components: page-level mounts as "file (env)" strings. */
    mounts?: string[];
    exceptions?: FileEnvException[];
}

export const FILE_ENV: Record<string, FileEnvEntry> = {
    "src/components/Auth/LoginForm2.tsx": {
        env: "scoped",
        note: "Self-scoped: imports design-system-2-scope.css and wraps ALL Inner return paths (lines 341, 351, 377) via scopeRoot() which applies ds2-visual-scope + style={visualStyle} + data-ds2-neutral, inside its own DesignSystem2CustomizationProvider. The DesignSystem2Customizer sibling (~line 672) sits outsi",
        mounts: ["src/App.tsx (/login and /login2 routes, non-PWA host) (scoped)"],
    },
    "src/components/Auth/LoginFormPwa.tsx": {
        env: "unscoped",
        note: "No ds2 markers at all (no ds2-visual-scope, visualStyle, var(--ds2-*), or DesignSystem2 imports); mounted at route top level with no scoped ancestor.",
        mounts: ["src/App.tsx (/login on PWA host) (unscoped)"],
    },
    "src/components/CashDrawerDialog.tsx": {
        env: "scoped",
        note: "Mounted at POS.tsx:1253, inside POS wrapper (682-1338). Shell/legacy dual branches (applied at line 164); both scoped.",
        mounts: ["src/pages/POS.tsx"],
    },
    "src/components/CategoryForm.tsx": {
        env: "scoped",
        note: "Sole mount renders inline inside Categories' ds2-visual-scope wrapper (opens L106, closes at end of return). Uses WithDialogTokens internally (L274-448) but on a scoped mount page full token remap applies regardless. No createPortal.",
        mounts: ["src/pages/Categories.tsx:379 (scoped)"],
    },
    "src/components/CustomInvoiceDialog.tsx": {
        env: "scoped",
        note: "Mounted at Transactions.tsx:1011, inside Transactions ds2-visual-scope wrapper (opens line 630, closes at end of return). Shell/legacy dual branches; both scoped.",
        mounts: ["src/pages/Transactions.tsx"],
    },
    "src/components/CustomerDialog.tsx": {
        env: "scoped",
        note: "Mounted only at POS.tsx:1005 inside POS wrapper (682-1338); not mounted from Customers page. backup_CustomerDialog is a separate unused component.",
        mounts: ["src/pages/POS.tsx"],
    },
    "src/components/CustomerForm.tsx": {
        env: "scoped",
        note: "Sole mount renders inline inside Customers' ds2-visual-scope wrapper (opens L200, closes at end of return). Uses ds2-control-radius-lg utility classes which resolve under the page scope. No createPortal.",
        mounts: ["src/pages/Customers.tsx:457 (scoped)"],
    },
    "src/components/DataSetup.tsx": {
        env: "unscoped",
        note: "Mounted directly as a dev-tools route element with no ds2-visual-scope wrapper anywhere in the chain; component applies no ds2 vars/classes itself. Layout provides no scope (empirical fact: layout header buttons do not react). Plain Tailwind styling, fully frozen.",
        mounts: ["src/App.tsx:346 (route /setup, DEV_TOOLS only, unscoped)"],
    },
    "src/components/DatabaseReset.tsx": {
        env: "scoped",
        note: "Sole mount is inside Employees' scopeShell() helper (L100-108) which applies ds2-visual-scope + visualStyle to the early-return showDatabaseReset branch. No createPortal, no ds2 vars of its own.",
        mounts: ["src/pages/Employees.tsx:670 (scoped)"],
    },
    "src/components/DesignSystem2/Buttons2.tsx": {
        env: "scoped",
        note: "Renders only inside the DesignSystem2 content pane scope.",
        mounts: ["src/pages/DesignSystem2.tsx content pane (scoped)"],
    },
    "src/components/DesignSystem2/DesignSystem2Customizer.tsx": {
        env: "unscoped",
        note: "Sole mount is LoginForm2's customizer shell, a sibling OUTSIDE the login2 scope wrapper; the component applies no scope class or visualStyle itself.",
        mounts: ["src/components/Auth/LoginForm2.tsx:673 (login2-customizer-shell, unscoped)"],
    },
    "src/components/DesignSystem2/Premade2.tsx": {
        env: "scoped",
        note: "Renders only inside the DesignSystem2 content pane scope.",
        mounts: ["src/pages/DesignSystem2.tsx content pane (scoped)"],
    },
    "src/components/DesignSystem2/ProductsPageReference2.tsx": {
        env: "scoped",
        note: "No self-scope; env inherited. Only real mount chain is Premade2 -> DesignSystem2 content pane (lines 141-160), which applies ds2-visual-scope + visualStyle for the 'premade' section (the color-style scope opt-out never applies to this branch). View-modal overlay (line 485) is fixed inset-0 but not p",
        mounts: ["src/components/DesignSystem2/Premade2.tsx (scoped)", "src/pages/DesignSystem2.tsx renderSection 'premade' branch, line 96/157 (scoped)"],
    },
    "src/components/DesignSystem2/Table2.tsx": {
        env: "scoped",
        note: "Renders only inside the DesignSystem2 content pane scope.",
        mounts: ["src/pages/DesignSystem2.tsx content pane (scoped)"],
    },
    "src/components/DiscountDialog.tsx": {
        env: "scoped",
        note: "Mounted at POS.tsx:978, inside POS wrapper (682-1338). Inline render, no portal.",
        mounts: ["src/pages/POS.tsx"],
    },
    "src/components/HR/MyProfileDialog.tsx": {
        env: "scoped",
        note: "Scoped in the 2026-07-23 scope sweep (page root / Layout ChromeScope carries ds2-visual-scope + visualStyle).",
    },
    "src/components/ImageUploader.tsx": {
        env: "scoped",
        note: "Only live mount chain lands scoped (ProductWizard on Products). The ProductForm reference never renders, so not mixed. No createPortal in file.",
        mounts: ["src/components/ProductWizard.tsx:299 -> src/pages/Products.tsx:713 (scoped)", "src/components/ProductForm.tsx:719 (dead path \u2014 ProductForm is unmounted)"],
    },
    "src/components/LanguageSwitcher.tsx": {
        env: "scoped",
        note: "Both live mounts are inside self-applied ds2-visual-scope wrappers: Sidebar's root div (222-226, 'sidebar' variant) and LoginForm2's scopeRoot (306-314, applies ds2-visual-scope + visualStyle; the return at 377 wraps line 429 \u2014 'default' variant). Third mount Header.tsx:90 is dead code (Header unmou",
        mounts: ["src/components/Layout/Sidebar.tsx:327 (scoped)", "src/components/Auth/LoginForm2.tsx:429 (scoped)"],
    },
    "src/components/Layout/Layout.tsx": {
        env: "scoped",
        note: "Scoped in the 2026-07-23 scope sweep (page root / Layout ChromeScope carries ds2-visual-scope + visualStyle).",
    },
    "src/components/Layout/Sidebar.tsx": {
        env: "scoped",
        note: "Self-wraps: root div (lines 222-226) has ds2-visual-scope + style={visualStyle} + data-ds2-neutral, and imports design-system-2-scope.css (line 38). Scoped regardless of the unscoped Layout mount location.",
        mounts: ["src/components/Layout/Layout.tsx:137 (self-scoped)"],
        exceptions: [
            { from: 349, to: 384, env: "unscoped", why: "Logout confirm dialog is createPortal'd to document.body, escaping the self-applied scope wrapper; the portal content carries no ds2-visual-scope class and no ds2 vars \u2014 fully frozen." },
        ],
    },
    "src/components/OrderSummaryPanel.tsx": {
        env: "scoped",
        note: "Single mount inside POS's ds2-visual-scope wrapper (682-1338). Dev POS entry (src/dev/PosDevApp.tsx via /pos-dev.html) mounts the real POS page, which carries its own wrapper \u2014 still scoped. Codebase comments (ActionButton.tsx:21, dialogStyle.ts:208) explicitly treat it as a page surface, matching t",
        mounts: ["src/pages/POS.tsx:916 (scoped)"],
    },
    "src/components/PaymentDialog.tsx": {
        env: "scoped",
        note: "Mounted at POS.tsx:1031, inside POS ds2-visual-scope wrapper (lines 682-1338). Inline render, no portal.",
        mounts: ["src/pages/POS.tsx"],
    },
    "src/components/PrinterManager.tsx": {
        env: "scoped",
        note: "No portal, no self-scoping. Renders inside PrinterSettingsPanel's ds2-visual-scope root (PrinterTestPage.tsx:85) in both mounts; its ds2-control-radius-lg classes and plain Tailwind both remap there.",
        mounts: ["src/pages/PrinterTestPage.tsx:110 (scoped)", "src/pages/Settings.tsx via PrinterSettingsPanel embedded (scoped)"],
    },
    "src/components/PrinterSetup.tsx": {
        env: "scoped",
        note: "Self-scoping: panel div (lines 282-286) carries ds2-visual-scope + style={visualStyle} + data-ds2-neutral and imports design-system-2-scope.css, so full token remap regardless of mount site. Both real mounts are inside PrinterSettingsPanel's own ds2-visual-scope root anyway.",
        mounts: ["src/pages/PrinterTestPage.tsx (scoped)", "src/pages/Settings.tsx via PrinterSettingsPanel embedded (scoped)"],
        exceptions: [
            { from: 281, to: 281, env: "unscoped", why: "fixed overlay backdrop div sits outside the self-applied ds2-visual-scope wrapper; bg-black/50 backdrop only, no ds2-reactive styling" },
        ],
    },
    "src/components/PrinterWorkflowManager.tsx": {
        env: "scoped",
        note: "Renders inline inside PrinterSettingsPanel's ds2-visual-scope root; no portal, no shell usage.",
        mounts: ["src/pages/PrinterTestPage.tsx:257 (scoped)", "src/pages/Settings.tsx via PrinterSettingsPanel embedded (scoped)"],
    },
    "src/components/ProductAssignmentManager.tsx": {
        env: "scoped",
        note: "Both mount chains scoped: PrinterSettingsPanel applies its own ds2-visual-scope + visualStyle wrapper (PrinterTestPage.tsx L81-85) covering the whole return, and its Settings embed also sits on a scoped page. No createPortal in ProductAssignmentManager or intermediate PrinterWorkflowManager.",
        mounts: ["src/components/PrinterWorkflowManager.tsx:400 -> PrinterSettingsPanel (self-wraps in ds2-visual-scope, src/pages/Printer", "src/components/PrinterWorkflowManager.tsx:400 -> PrinterSettingsPanel embedded in src/pages/Settings.tsx:1495 (scoped)"],
    },
    "src/components/ProductOptionsDialog.tsx": {
        env: "scoped",
        note: "Mounted at POS.tsx:963, inside POS wrapper. Shell/legacy dual branches (applied at line 198); both scoped on this mount.",
        mounts: ["src/pages/POS.tsx"],
    },
    "src/components/ProductWizard.tsx": {
        env: "scoped",
        note: "Sole mount renders inline inside Products' ds2-visual-scope wrapper (opens L270, closes at end of return). Has both paths \u2014 ConfiguredDialogShell branch (L644-659) and legacy fixed-overlay branch (L661-682) \u2014 but per rule 2 both are scoped on this scoped mount page, so no line-range exceptions. No c",
        mounts: ["src/pages/Products.tsx:713 (scoped)"],
    },
    "src/components/PurchaseReceiptImportDialog.tsx": {
        env: "scoped",
        note: "Single mount at Products.tsx:695, inside the Products ds2-visual-scope wrapper (opens line 269). No PurchaseReceipts-page mount exists anywhere in src. Shell/legacy dual branches (applied at line 358); both scoped.",
        mounts: ["src/pages/Products.tsx"],
    },
    "src/components/QuickNumpad.tsx": {
        env: "scoped",
        note: "Batch note stale: WeighDialog does NOT use QuickNumpad (no numpad reference in that file). Both real mounts sit inside POS's ds2-visual-scope wrapper (POS.tsx:682-1338). File has two internal render branches (shell 'keys' grid lines 52-76 via DialogShellStyleContext vs legacy framed grid lines 78-15",
        mounts: ["src/components/DiscountDialog.tsx:380 -> src/pages/POS.tsx:978 (scoped)", "src/components/PaymentDialog.tsx:104 -> src/pages/POS.tsx:1031 (scoped)"],
    },
    "src/components/ReceiptDialog.tsx": {
        env: "scoped",
        note: "Both mounts sit inside their page's ds2-visual-scope wrapper.",
        mounts: ["src/pages/POS.tsx:1268 (scoped)", "src/pages/Transactions.tsx:998 (scoped)"],
    },
    "src/components/ReceiptHistorySelector.tsx": {
        env: "scoped",
        note: "Sole mount POS.tsx:1287 is COMMENTED OUT (JSX comment lines 1285-1298, deliberately kept: '2.a via receipt history picker (commented until implemented)'). Does not render live today. The commented mount sits unambiguously inside POS's ds2-visual-scope wrapper, so it will be scoped when enabled. Uses",
    },
    "src/components/RecipeEditor.tsx": {
        env: "unscoped",
        note: "UNREACHABLE / dead code \u2014 its only mount is inside ProductForm, which itself has no live mounts; env is a fallback label, not measured. Never renders in the app.",
        mounts: ["src/components/ProductForm.tsx:643 (dead path \u2014 ProductForm is unmounted)"],
    },
    "src/components/RoutingRuleManager.tsx": {
        env: "unscoped",
        note: "Dead code: not imported by any file (grep across src finds only its own definition plus a name mention in buttonLabInlineSpecimens.tsx). Never renders.",
    },
    "src/components/ScaleSettingsPanel.tsx": {
        env: "scoped",
        note: "Rendered via renderHardware() -> renderContent() (Settings.tsx:2402) inside Settings' main-return ds2-visual-scope wrapper (Settings.tsx:2316); the loading early-return is also wrapped (2302). Only mount in the app (Electron-only availability gate at runtime is orthogonal to env). Uses plain Tailwin",
        mounts: ["src/pages/Settings.tsx:1496 (scoped, embedded in Hardware tab)"],
    },
    "src/components/SimpleNumpad.tsx": {
        env: "scoped",
        note: "Only live mount is CustomerDialog inside the POS wrapper. Second mount (ReceiptHistorySelector.tsx:85) is dead: ReceiptHistorySelector's sole mount in POS.tsx is commented out (JSX comment lines 1285-1298). Shell-vs-legacy branches (lines 38-51 vs 53-102) both render scoped on POS.",
        mounts: ["src/components/CustomerDialog.tsx:328 -> src/pages/POS.tsx:1005 (scoped)"],
    },
    "src/components/VirtualKeyboard.tsx": {
        env: "scoped",
        note: "Both live mounts land inside ds2-visual-scope wrappers (POS.tsx:682, Categories.tsx:106; CategoryForm renders inside the Categories wrapper div). Two further mounts are dead code: ProductForm.tsx:800 (ProductForm unimported) and Auth/LoginForm.tsx:341 (LoginForm unimported \u2014 App.tsx uses LoginForm2/",
        mounts: ["src/components/CustomerDialog.tsx:477 -> src/pages/POS.tsx:1005 (scoped)", "src/components/CategoryForm.tsx:455 -> src/pages/Categories.tsx:379 (scoped)"],
    },
    "src/components/WeighDialog.tsx": {
        env: "scoped",
        note: "Mounted at POS.tsx:970, inside POS wrapper. Has shell/legacy dual branches (applied at line 336) but both branches are scoped since the mount page is scoped.",
        mounts: ["src/pages/POS.tsx"],
    },
    "src/components/notifications/NotificationBell.tsx": {
        env: "scoped",
        note: "Scoped in the 2026-07-23 scope sweep (page root / Layout ChromeScope carries ds2-visual-scope + visualStyle).",
    },
    "src/components/notifications/NotificationPanel.tsx": {
        env: "scoped",
        note: "Scoped in the 2026-07-23 scope sweep (page root / Layout ChromeScope carries ds2-visual-scope + visualStyle).",
    },
    "src/components/notifications/NotificationSettings.tsx": {
        env: "scoped",
        note: "Only live mount: Settings 'alerts' tab via renderContent() invoked at Settings.tsx:2402, which sits inside Settings' ds2-visual-scope + visualStyle wrapper (line 2315-2319). Full token remap applies.",
        mounts: ["src/pages/Settings.tsx:2295 (scoped)"],
    },
    "src/components/pwa/InstallBanner.tsx": {
        env: "scoped",
        note: "Scoped in the 2026-07-23 scope sweep (page root / Layout ChromeScope carries ds2-visual-scope + visualStyle).",
    },
    "src/components/ui/ActionButton.tsx": {
        env: "scoped",
        note: "Also restyles via DialogShellStyleContext inside an applied ConfiguredDialogShell (dialog-style axis; its var(--ds2-*) CTA classes resolve from the shell panel vars), but the ds2 env at every production mount is scoped. ProductForm mount chain is dead (ProductForm unmounted).",
        mounts: ["src/pages/POS.tsx via CustomerDialog/DiscountDialog/PaymentDialog/OrderSummaryPanel/ReceiptDialog (scoped \u2014 all render i", "src/pages/Transactions.tsx via ReceiptDialog (scoped \u2014 inside wrapper at Transactions.tsx:631)", "src/pages/Categories.tsx via CategoryForm (scoped)", "src/pages/Customers.tsx via CustomerForm (scoped)", "src/pages/Employees.tsx (scoped)"],
    },
    "src/components/ui/AdminActionButton.tsx": {
        env: "scoped",
        note: "All 10 production mounts land inside ds2-visual-scope wrappers \u2014 uniform scoped, not mixed. Lab mounts (buttonLabSpecimens, DesignSystem2 previews) excluded per instructions.",
        mounts: ["src/components/Auth/LoginForm2.tsx (scoped \u2014 self-wraps via scopeRoot ds2-visual-scope+visualStyle at line 308)", "src/pages/Appearances.tsx (scoped)", "src/pages/Categories.tsx (scoped)", "src/pages/Customers.tsx (scoped)", "src/pages/DeliveryOrders.tsx (scoped)", "src/pages/Employees.tsx (scoped)", "src/pages/Products.tsx (scoped)", "src/pages/ProfitCosts.tsx (scoped)", "src/pages/Reports.tsx (scoped)", "src/pages/Transactions.tsx (scoped)"],
    },
    "src/components/ui/CategoryFilterButton.tsx": {
        env: "scoped",
        mounts: ["src/pages/POS.tsx:720,731 (scoped)", "src/components/DesignSystem2/Premade2.tsx (scoped)"],
    },
    "src/components/ui/ConfiguredDialogShell.tsx": {
        env: "dialog-vars",
        note: "Applies ds2 vars via style={{...ds2Vars,...panelSizing}} on the panel (line 201) but never adds the ds2-visual-scope class, so inside the panel only literal var(--ds2-*) styles react while plain Tailwind stays frozen. Renders inline (fixed overlay, no portal), so when mounted on a scoped page the pa",
    },
    "src/components/ui/DashedCardButton.tsx": {
        env: "scoped",
        mounts: ["src/pages/Categories.tsx:253,357 (scoped)", "src/components/DesignSystem2/Buttons2.tsx (scoped)"],
    },
    "src/components/ui/NumpadButton.tsx": {
        env: "scoped",
        note: "Only live render sites are DesignSystem2 preview surfaces (scoped page). Production chain VirtualNumpad\u2192ProductForm is dead: no <ProductForm mount exists anywhere (only ProductFormData type refs); ProductWizard.tsx:30 comment 'Editing existing products still uses ProductForm' is stale. QuickNumpad d",
        mounts: ["src/pages/DesignSystem2.tsx via Buttons2/Table2 (scoped)", "(dead) VirtualNumpad -> ProductForm \u2014 ProductForm has no mount"],
    },
    "src/components/ui/OutlineButton.tsx": {
        env: "scoped",
        mounts: ["src/components/OrderSummaryPanel.tsx:319 -> src/pages/POS.tsx:916 (scoped)", "src/components/DesignSystem2/Buttons2.tsx (scoped)"],
    },
    "src/components/ui/POSActionButton.tsx": {
        env: "scoped",
        note: "Single production mount chain; plain Tailwind classes fully remap in the POS scope.",
        mounts: ["src/pages/POS.tsx via OrderSummaryPanel (scoped \u2014 OrderSummaryPanel at POS.tsx:916, inside wrapper at 682)"],
    },
    "src/components/ui/PairingButton.tsx": {
        env: "unscoped",
        note: "DevicePairing has no ds2-visual-scope wrapper, no visualStyle, no scope-css import \u2014 the only production mount. The lone unscoped primitive in this batch; nothing reacts.",
        mounts: ["src/pages/DevicePairing.tsx (unscoped)"],
    },
    "src/components/ui/PaymentMethodButton.tsx": {
        env: "scoped",
        note: "Reads useDialogTokens (DialogShellStyleContext) so border/tint/subText classes follow the applied dialog style inside a shell; ds2 env at its only production mount is scoped.",
        mounts: ["src/pages/POS.tsx via PaymentDialog (scoped \u2014 PaymentDialog at POS.tsx:1031, inside wrapper at 682)"],
    },
    "src/components/ui/ProductCard.tsx": {
        env: "scoped",
        mounts: ["src/pages/POS.tsx:841 (scoped)", "src/components/DesignSystem2/Premade2.tsx (scoped)"],
    },
    "src/components/ui/TabButton.tsx": {
        env: "scoped",
        note: "The 'sidebar' variant (lines 19-31) has no production mount \u2014 the app Sidebar does not use TabButton; only the reports variant ships. Uniform scoped.",
        mounts: ["src/pages/Reports.tsx (scoped)", "src/pages/DesignSystem2.tsx (scoped)"],
    },
    "src/components/ui/TabToggle.tsx": {
        env: "mixed",
        note: "Mostly scoped; the login2 customizer mount is frozen.",
        mounts: ["src/components/CustomerDialog.tsx:300 -> src/pages/POS.tsx (scoped)", "src/components/DesignSystem2/Buttons2.tsx (scoped)", "src/components/DesignSystem2/DesignSystem2Customizer.tsx (unscoped)"],
    },
    "src/components/ui/TableActionButton.tsx": {
        env: "scoped",
        note: "NO production feature mounts \u2014 renders only on lab/preview surfaces, which all sit inside ds2-visual-scope wrappers; whenever it renders at all it is scoped. Low confidence reflects the no-production-mount status, not the env.",
        mounts: ["src/pages/DesignSystem2.tsx via Buttons2/Premade2/Table2 (scoped)", "src/pages/Appearances.tsx via ButtonLab/buttonLabSpecimens (scoped)"],
    },
    "src/components/ui/dialogParts.tsx": {
        env: "dialog-vars",
        note: "Helpers consume DialogShellStyleContext and always render inside ConfiguredDialogShell panels whose style attr carries the ds2 vars. Verified: WithDialogTokens/useDialogTokens do NOT apply ds2 vars themselves \u2014 they emit Tailwind token classes; the var(--ds2-*) refs (control focus, DIALOG_TOGGLE_ON_",
    },
    "src/pages/Appearances.tsx": {
        env: "scoped",
        note: "Single return; root div (lines 517-521) has ds2-visual-scope + style={visualStyle} + data-ds2-neutral, closing at line 760. No early returns, no portals. DialogLab and ButtonLab sections render inside the wrapper.",
    },
    "src/pages/Assistant.tsx": {
        env: "scoped",
        note: "Scoped in the 2026-07-23 scope sweep (page root / Layout ChromeScope carries ds2-visual-scope + visualStyle).",
    },
    "src/pages/CashDrawerAudit.tsx": {
        env: "scoped",
        note: "Scoped in the 2026-07-23 scope sweep (page root / Layout ChromeScope carries ds2-visual-scope + visualStyle).",
    },
    "src/pages/CashierTesting.tsx": {
        env: "scoped",
        note: "Panel self-scopes: return root (lines 251-255) carries ds2-visual-scope + visualStyle in both embedded and standalone variants. Loading overlay (573-580) is fixed-position but DOM-inside the wrapper, so covered.",
        mounts: ["standalone route via CashierTestingPage (scoped, self-wrapped)", "src/pages/Settings.tsx:1498 CashierTestingPanel embedded (scoped)"],
    },
    "src/pages/Categories.tsx": {
        env: "scoped",
        note: "scopeShell (72) wraps loading/error early returns; main wrapper 105-386 covers ConfirmDialog (367) and CategoryForm (379).",
    },
    "src/pages/Customers.tsx": {
        env: "scoped",
        note: "Loading (181) and error (190) early returns each carry their own ds2-visual-scope wrapper; main wrapper 200-539 covers ConfirmDialog, CustomerForm, and both shell and legacy branches of the view modal \u2014 both remap since the page is scoped.",
    },
    "src/pages/DeliveryOrders.tsx": {
        env: "scoped",
        note: "Single return (331); root div (332-335) has ds2-visual-scope + visualStyle. Order-details dialog and action menus are fixed-position but DOM-inside the wrapper, closing just before the wrapper close (~917). No early returns, no portals.",
    },
    "src/pages/DesignSystem2.tsx": {
        env: "scoped",
        note: "Content pane self-applies ds2-visual-scope + visualStyle (lines ~141-150) except when colorDocsOutsidePreviewScope opts the color-docs section out.",
    },
    "src/pages/DevicePairing.tsx": {
        env: "scoped",
        note: "Scoped 2026-07-23 via useDesignSystem2VisualStyleSafe: pre-auth route without provider \u2014 scope class applied, vars fall back to defaults until a provider mounts.",
    },
    "src/pages/Devices.tsx": {
        env: "scoped",
        note: "Scoped in the 2026-07-23 scope sweep (page root / Layout ChromeScope carries ds2-visual-scope + visualStyle).",
    },
    "src/pages/ElectronCashierTesting.tsx": {
        env: "scoped",
        note: "Single return; root div (406-410) carries ds2-visual-scope + visualStyle in both variants. renderConnectionControls/renderQuickTests/renderSettings are invoked inside the wrapper (421-423).",
        mounts: ["standalone route via ElectronCashierTesting (scoped, self-wrapped)", "src/pages/Settings.tsx:1499 ElectronTestingPanel embedded (scoped)"],
    },
    "src/pages/Employees.tsx": {
        env: "scoped",
        note: "scopeShell (100) wraps db-reset (664), loading (676) and loadError (684) early returns; main wrapper 708-1422 covers the employee form (BaseDialog/mobile-sheet/shell branches), discard-confirm, and delete-confirm \u2014 both shell and legacy dialog branches sit inside the wrapper and remap.",
    },
    "src/pages/HR.tsx": {
        env: "scoped",
        note: "Scoped in the 2026-07-23 scope sweep (page root / Layout ChromeScope carries ds2-visual-scope + visualStyle).",
    },
    "src/pages/Inventory.tsx": {
        env: "scoped",
        note: "Scoped in the 2026-07-23 scope sweep (page root / Layout ChromeScope carries ds2-visual-scope + visualStyle).",
    },
    "src/pages/OrderQueue.tsx": {
        env: "scoped",
        note: "Scoped in the 2026-07-23 scope sweep (page root / Layout ChromeScope carries ds2-visual-scope + visualStyle).",
    },
    "src/pages/POS.tsx": {
        env: "scoped",
        note: "Single root wrapper (lines 681-1338) covers entire UI incl. PaymentDialog, CashDrawerDialog, ReceiptDialog and the auto-logout modal; no JSX early returns before it; POS at line 1342 just renders POSInner.",
    },
    "src/pages/PrinterTestPage.tsx": {
        env: "scoped",
        note: "Single return; root div (85) carries ds2-visual-scope + visualStyle in both variants. PrinterSetup dialog renders inside the wrapper (262-267); PrinterSetup/PrinterManager/PrinterWorkflowManager contain no createPortal.",
        mounts: ["standalone route via PrinterTestPage (scoped, self-wrapped)", "src/pages/Settings.tsx:1495 PrinterSettingsPanel embedded (scoped)"],
    },
    "src/pages/Products.tsx": {
        env: "scoped",
        note: "scopeShell (235) wraps loading/error early returns; main wrapper 269-970 covers PurchaseReceiptImportDialog (695), delete ConfirmDialog (701), ProductWizard (713), and BOTH shell and legacy branches of the view modal (720-969) \u2014 both remap since the page is scoped.",
    },
    "src/pages/ProfitCosts.tsx": {
        env: "scoped",
        note: "All three returns carry the full wrapper: loading (380-395), error (399-423), main (426-836) each root with ds2-visual-scope + visualStyle + data-ds2-neutral. Mobile bottom-sheet editors (e.g. line 509) are fixed-position but DOM-inside the wrapper.",
    },
    "src/pages/PurchaseReceipts.tsx": {
        env: "scoped",
        note: "Scoped in the 2026-07-23 scope sweep (page root / Layout ChromeScope carries ds2-visual-scope + visualStyle).",
    },
    "src/pages/Reports.tsx": {
        env: "scoped",
        note: "scopeShell (73) wraps loading (261) and error (281) early returns; main wrapper 308-809 covers everything. Matches empirical fact that Reports buttons remap.",
    },
    "src/pages/SeedManagement.tsx": {
        env: "scoped",
        note: "Single return; root div (209-212) carries ds2-visual-scope + visualStyle in both variants, closing at return end. No early returns, no portals.",
        mounts: ["standalone route via SeedManagement (scoped, self-wrapped)", "src/pages/Settings.tsx:1497 SeedManagementPanel embedded (scoped)"],
    },
    "src/pages/Settings.tsx": {
        env: "scoped",
        note: "Loading early return has its own wrapper (2301-2310); main wrapper 2315-2451 covers all tab content via renderContent() and the training-mode ConfirmDialog (2440). Module-level subcomponents (SegmentedControl, StatusPill, ReadinessList) render only inside the wrapper.",
    },
    "src/pages/Tables.tsx": {
        env: "scoped",
        note: "Scoped in the 2026-07-23 scope sweep (page root / Layout ChromeScope carries ds2-visual-scope + visualStyle).",
    },
    "src/pages/Transactions.tsx": {
        env: "scoped",
        note: "No JSX early returns at component level (line 354 return null is a data helper); single wrapper 630-1068 covers ReceiptDialog, ReceiptPdfRenderer, CustomInvoiceDialog, credit-note modal and success toast.",
    },
    "src/theme/dialogStyle.ts": {
        env: "dialog-vars",
        note: "Non-rendering theme/config module (no JSX). Its class-string constants (DIALOG_CTA_CLASSES, DIALOG_CONTROL_CLASSES, DIALOG_TOGGLE_ON_CLASS, dialogButtonClasses) embed var(--ds2-*) references that resolve wherever ConfiguredDialogShell's panel vars (or any ds2 var context) are present; the plain Tail",
    },
};
