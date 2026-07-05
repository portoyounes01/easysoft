## Login2 route — DS2 login redesign (2026-05-26)

- **`/login2`** in **`App.tsx`**; **`/login`** + **`LoginForm.tsx`** unchanged.
- **`LoginForm2.tsx`:** No sidebar. Logo (no card) with language switcher top-aligned to logo top; welcome centered below. Left-aligned carousel + PIN card. Round avatars. **Other Employee** card → ID + PIN fields + Sign in (numpad fills PIN). Listed staff exclude system admin. DS2 scope + provider.

### Login2 viewport + zoom (2026-05-27)

- **Removed** fixed **1280×800** scale canvas (`Login2ScaleToFit` / `useLogin2ViewportScale`) — scale-to-fill was cropping header/footer.
- **`LoginForm2`:** `100dvh` flex shell (POS-style); header **3-column grid** (connectivity | logo | language) so corners are never clipped.
- **`useLogin2BrowserZoomCompensate`:** CSS `zoom: 1/visualViewport.scale` on route host for **Cmd/Ctrl +/-** stability (Chromium/Electron).

## Track inventory — global POS setting (2026-05-14)

- **`SettingsContext` / Definições → POS:** novo **`pos.trackInventory`** (predefinição `true`); persistido em **`localStorage`** com o resto das definições.
- **`ProductForm`:** removido o toggle por produto; ao gravar, **`track_stock`** vem de **`settings.pos.trackInventory`**.
- **Comportamento:** `readPosTrackInventoryFromStorage()` + **`product.track_stock`** em stock no checkout, low-stock e `calculateStockStatus`; **`POS.tsx`** ignora limites de stock quando o catálogo não controla inventário ou o produto tem **`track_stock`** falso.
- **`src/utils/posSettingsStorage.ts`**, **`Products.tsx`** (lista e modal leem o storage porque **`ProductsProvider`** está acima de **`SettingsProvider`**).
- **Testes fiscais:** objetos **`SystemSettings`** com **`trackInventory: true`**.

## Settings — fiscal env info panels + duplicado na emissão (2026-05-14)

- Removidos os avisos na página Definições sobre certificação AT / chave RSA / HashControl (variáveis `VITE_*`); essa informação mantém-se apenas em `.env.example` / documentação de deploy.
- Removido o toggle «Imprimir duplicado na emissão»; **`printDuplicateOnIssue`** fica sempre **`false`** (merge + migração + defeito). No POS já não se agenda segundo recibo «Duplicado» após pagamento (continua disponível a 2.ª via pelo histórico).

## Transactions expanded row — i18n + DS2 actions (2026-05-06)

- **`src/pages/Transactions.tsx`:** Second-copy control uses **`t('transactions.receipt.secondCopy')`** (replaces hardcoded Portuguese). All four actions (**view receipt**, second copy, **NC**, **download**) use **`AdminActionButton`** with shared **`rowActionBtn`** (`ds2-control-radius-lg`, **`min-h-touch`**, touch-sized icons). NC keeps **orange/amber** functional gradient via class override; **`isLoading`** on issue. **Download** implements **`handleDownloadTransaction`** (JSON export + anchor download); previously had no **`onClick`**.

## Settings séries — nome = segmento antes de `/`; número atual editável (2026-05-14)

- **Removido** `seriesPrefix` do modelo; o texto antes de `/` no recibo é **`series`** (nome da série) em cada perfil **FS / FT / NC**. Migração legada em `normalizeStoredSeriesProfile` / `SettingsContext`.
- **Definições → séries:** **`currentNumber`** editável (rótulo `currentSequentialNumber` / ajuda i18n). Defeito **`currentNumber: 0`** → primeira emissão na cadeia usa sequencial **1** (antes 999 → primeira **1000**).
- **Testes fiscais** atualizados: `seriesProfiles` + `series` em `checkoutNegativeGuards`, `atomicSequential`, `creditNoteCheckout`, `saftExport`; expectativa SAF-T **`<PaymentType>RE</PaymentType>`** quando o documento persistido é `invoice_type: 'RE'` (export usa o tipo tal como gravado).

## Transactions — no payment receipt RG/RE issuance (2026-05-14)

- **Removed** “recibo de pagamento” / RG issuance from **`Transactions.tsx`** (button, handler, `canIssueRecibo`, `runFiscalReciboForTransaction` import).
- **Credit note (NC)** eligibility restricted to fiscal types **FT** and **FS** only (dropped FR from that gate).
- **Deleted** **`src/fiscal/reciboCheckout.ts`** (unused entry point). **`hasReciboForOriginalTransaction`** kept for NC guards / legacy rows.
- **i18n:** removed `transactions.recibo.*` and `transactions.list.issueRecibo` (EN/PT).

## Fiscal AT secrets via env only (2026-05-14)

- **Removed from Settings UI:** certification number, software certification number (AT), HashControl display/editing, PEM textarea, key rotation control, Electron “paste PEM then store” flow.
- **`src/utils/fiscalEnvDefaults.ts`:** `applyFiscalSecretsFromEnv`, `settingsWithoutPersistedFiscalSecrets`; env vars `VITE_FISCAL_CERTIFICATION_NUMBER`, `VITE_FISCAL_SOFTWARE_CERT_NUMBER`, `VITE_FISCAL_HASH_CONTROL_VERSION`, existing `VITE_FISCAL_RSA_PRIVATE_KEY_PEM`.
- **`SettingsContext`:** strips secrets before `localStorage`; sanitizes update patches so secrets cannot be set via `updateSettings`; load path applies env overlay.
- **`createSignerFromSettings`:** error text points to env PEM; Electron secure key still preferred when present.
- **`.env.example`**, **`vite-env.d.ts`**, **`tests/fiscal-env-defaults.test.ts`**, **`Layout.tsx`** dev banner removed; **i18n** notices on Company & Fiscal tab.

## Customers admin page — list / edit / soft-delete (2026-05-12)

- **`src/pages/Customers.tsx`:** DS2-scoped table + toolbar (search, sort, status filter, pagination) aligned with **`Products.tsx`**; row actions View / Edit / Delete ( **`customerLocalService.deleteCustomer`** ); **`initializeLocalDatabase`** before **`getAllCustomers`**.
- **`src/components/CustomerForm.tsx`:** Create/update via **`customerLocalService`**, NIF + PT postal validation consistent with **`CustomerDialog`**; duplicate NIF blocked.
- **Routing / nav:** **`App.tsx`** `/customers` under **`inventory`** permission; **`Sidebar`** link **`sidebar.menu.customers`** ( **`Contact`** icon).
- **i18n:** **`customers.*`** strings (EN + PT).
- **Tests:** **`tests/customersPage.test.tsx`**.

## Produtos — categoria "Geral" por defeito (2026-05-11)

- **`CategoryService.ensureDefaultGeneralCategory`:** se não existir nenhuma categoria (não apagada), cria ou reativa **"Geral"** com id UUID fixo (`DEFAULT_GENERAL_CATEGORY_ID`) para sync Supabase. Inserção usa **`put`** em vez de **`add`** para evitar `ConstraintError` em chamadas paralelas (ex.: Strict Mode / duplo mount).
- **`POS.tsx`:** `handleDecrementCartLine` ligado ao **`OrderSummaryPanel`** via **`updateQuantity`** (remove linha quando qty passa a 0).
- **`ProductsContext.loadData`:** chama ensure antes de ler o catálogo.
- **`ProductForm`:** pré-seleciona essa categoria (ou a primeira ativa) ao criar produto, sem reescrever o formulário quando o catálogo carrega tarde.

## Settings — system admin gates + séries FS / FT / NC (2026-05-11)

- **Empresa:** `Número de Certificação` e certificação de software (AT) só com `isSystemAdministrator` (nº de funcionário em `VITE_SYSTEM_ADMIN_EMPLOYEE_NUMBERS`, defeito `ADMIN001`).
- **Fiscal AT:** HashControl, rotação de chave, PEM e campo dev só para administrador de sistema; modo formação + export SAF-T mantidos para quem tem permissão `settings`.
- **Numeração:** `receipt.seriesProfiles` (`FS`, `FT`, `NC`) com migração a partir de `pos_system_settings` antigo; checkout usa perfil da venda; NC/recibo usam prefixo/largura extraídos do documento original.
- **UI numeração (follow-up):** Um selector FS/FT/NC mostra um único formulário por tipo; FS/FT atualizam `defaultDocumentType`. Campos **início/fim de vigência** (`seriesStartDate` / `seriesEndDate`) por série; `resetPolicy` e data antiga do código AT removidos da UI; migração de `atValidationCodeIssuedAt` → `seriesStartDate`. Validação de emissão e banners POS/Layout usam a janela de datas.

## POS Default Landing + Admin Dialog Refresh (2026-05-11)

- **Status:** ACTIVE
- **Scope:** Make `/pos` the post-login landing page, comment dashboard navigation entries out, align product/category/employee edit dialogs with the POS `BaseDialog` modal chrome, and localize category dialog text in Portuguese.
- **Progress:** Updated route redirect logic, sidebar/POS nav dashboard entries, product/category form modal shells, product form currency symbol binding from settings, and category form i18n keys. **CustomerDialog (fatura NIF):** prefill NIF from search when adding; new-client tab: phone removed, save enabled on valid NIF only; optional address fields; duplicate NIF blocked (UI + `CustomerLocalService.createCustomer`).
- **Validation:** Pending lint/type check after dialog refactor.

## Settings — Design System 2 scope (2026-05-06)

- **`Settings.tsx`:** **`useDesignSystem2Customization`** + **`design-system-2-scope.css`**. Loading and main shells use **`.ds2-visual-scope`** with **`visualStyle`** + **`data-ds2-neutral`**. Content uses **`layoutClasses.contentInsetX`** (density-aligned horizontal padding). Left tab rail width uses **`layoutClasses.sidebarW`** (same sm/md/lg as app sidebar). **Save** / **Reset** header actions use **`ds2-control-radius-lg`** + **`min-h-touch-sm`**; tab **`rounded-xl`** and main card **`rounded-xl`** stay scoped so **radius preset** applies. Blues / toggles / gradients follow **secondary** + scope mappings like other admin pages.

## POS — Design System 2 scope (2026-05-06)

- **`POS.tsx`:** Wrapped in **`DesignSystem2CustomizationProvider`** (route is outside **`Layout`**, so POS brings its own provider). **`POSInner`** root is **`.ds2-visual-scope`** with **`visualStyle`** + **`data-ds2-neutral`**; imports **`design-system-2-scope.css`**. Existing Tailwind (`from-blue-600 to-blue-500`, `bg-green-500`, **`rounded-lg` / `rounded-2xl`**, pairing gradient, etc.) is remapped by scope to **primary / secondary / radius** prefs — default palette matches prior look. **`PaymentDialog`**, **`DiscountDialog`**, **`CustomerDialog`**, **`ReceiptDialog`**, **`ReceiptHistorySelector`**, and modals stay as children of that root, so **fixed overlays still inherit** `--ds2-*` variables. POS flyout nav width uses **`layoutClasses.sidebarW`** (same **sm / md / lg** as app sidebar + Design System 2 page).

## Layout — global Design System 2 provider + app sidebar (2026-05-06)

- **`Layout.tsx`:** Wraps the authenticated shell (`Sidebar` + main) in **`DesignSystem2CustomizationProvider`** so prefs (primary/secondary, radius, sidebar width, density, etc.) are **one shared source** with `/design-system-2` and all DS2-scoped pages.
- **`Sidebar.tsx`:** Root is **`.ds2-visual-scope`** with **`visualStyle`** + **`data-ds2-neutral`**; imports **`design-system-2-scope.css`**. Expanded width uses **`layoutClasses.sidebarW`** (`sm`/`md`/`lg` → `w-64`/`w-72`/`w-80`); collapsed stays **`w-20`**. Active **`NavLink`** uses the same chrome as **`TabButton` `variant="sidebar"`** (`bg-gradient-to-r from-blue-600 to-blue-500` + `text-neutral-100` + `ds2-control-radius-lg` + `min-h-touch-sm`) so **secondary** tokens and **radius preset** apply. Home route uses **`end`** for exact `/` matching.
- **Pages:** Removed per-route **`DesignSystem2CustomizationProvider`** wrappers from **`Products`**, **`Categories`**, **`Employees`**, **`Reports`**, **`Transactions`**, **`SeedManagement`**, **`CashierTesting`**, **`ElectronCashierTesting`**, **`PrinterTestPage`**, **`DesignSystem2`** — they default-export their `*Inner` component and consume context from **Layout**.

## Printer test + cashier testing — DS2 chrome (2026-05-06)

- **`design-system-2-scope.css`:** `rounded-md`, `text-blue-500` / `700` / `800`, `bg-blue-100`, `bg-indigo-100`, `text-indigo-600` map to `--ds2-ui-*` / tint tokens so Reports KPIs and scoped blues follow **secondary** prefs.
- **`PrinterTestPage.tsx`:** Exports `PrinterTestPageInner`; uses **`Layout`** provider; `.ds2-visual-scope` + `visualStyle` + `data-ds2-neutral` + `layoutClasses.contentInsetX`; tab + action rows use `min-h-touch-sm`, `ds2-control-radius-lg/md`, and **gradient primary** / gray secondary; test print uses same primary chrome as setup (not fixed green).
- **`PrinterSetup.tsx`:** exports `PrinterConnectedPayload` / details; modal root is `.ds2-visual-scope` with tokens; tabs + actions use `DS2_PRIMARY_BTN` / `DS2_SECONDARY_BTN` + touch height; `useDesignSystem2Customization` (requires provider from printer test page).
- **`PrinterManager.tsx`:** Refresh + Check Status use gradient primary + DS2 radius + `min-h-touch-sm` (Check Status no longer fixed green).
- **`CashierTesting.tsx`:** Shared DS2 button class constants; hardware row + hardware test grid + result actions use gradient / gray / danger with `ds2-control-radius-lg` + `min-h-touch-sm`.
- **`ElectronCashierTesting.tsx`:** Same primary/gradient + danger pattern for connection controls; quick test tiles use gradient DS2 primary chrome.
- **`Products.tsx`:** Add Product already `AdminActionButton` **`variant="primary"`** (secondary / UI gradient under DS2 scope — not `success`).

## Fiscal PEM default from `.env` (2026-05-06)

- **`VITE_FISCAL_RSA_PRIVATE_KEY_PEM`:** Optional dev default for Settings → Fiscal AT → PEM; merged when stored `fiscal.privateKeyPem` is empty (`src/utils/fiscalEnvDefaults.ts`, `SettingsContext` load / initial state / reset). Documented in `.env.example`. Dev-only: Vite inlines `VITE_*` into the client bundle.
- **Local `.env`:** Generated PKCS#8 RSA via `openssl` + Node append (gitignored); rotate or remove for anything beyond local signing smoke tests.
- **Tests:** `tests/fiscal-env-defaults.test.ts`.

## Categories page — DS2 parity (2026-05-06)

- **`Categories.tsx`:** Exports `CategoriesInner`; uses **`Layout`** provider; `design-system-2-scope.css`; `.ds2-visual-scope` + `visualStyle` + `data-ds2-neutral` on main content and loading/error shells. `layoutClasses.contentInsetX` on header row, stats grid wrapper, grid card header, and grid body. **Add Category** uses same toolbar-style classes as Products (`ds2-control-radius-lg` + `ds2-toolbar-control-h`). Stat cards and main list card use `rounded-xl` / `rounded-lg` / `shadow-sm` + border (radius follows DS2 scope tokens). Category delete control uses `ds2-control-radius-lg`. `DashedCardButton` stays `rounded-lg` (scoped). Minor a11y: category tiles `role="button"` + Enter/Space to open edit.

## Admin pages — DS2 scope (2026-05-06)

- **`Employees.tsx`**, **`Reports.tsx`**, **`Transactions.tsx`**, **`SeedManagement.tsx`**, **`CashierTesting.tsx`**, **`ElectronCashierTesting.tsx`:** Each exports `*Inner` and relies on **`Layout`**’s **`DesignSystem2CustomizationProvider`**; imports `design-system-2-scope.css`; root shell `.ds2-visual-scope` with `visualStyle` + `data-ds2-neutral`; `layoutClasses.contentInsetX` on main content columns (or full-width inner wrapper). Toolbar-style actions use `ds2-control-radius-lg` + `ds2-toolbar-control-h` + shared `toolbarBtn` / `headerPrimaryBtn` where `AdminActionButton` is used. Form controls (search, selects, dates, seed run button) use `ds2-control-radius-lg` / `box-border` where applicable. **Employees** loading / DB reset / `loadError` use `scopeShell`. **Reports** loading and error use `scopeShell`; removed invalid `AdminActionButton` children on filter (chevron via `showChevron` only). **Transactions** filter row matches Products toolbar pattern; removed invalid chevron children on filter button.

## Products UI — reference layout (2026-05-06)

- **DS2 toolbar + table gutter (2026-05-06):** `layoutClasses.contentInsetX` (density: compact `px-4` / normal `px-6` / spacious `px-10`) on toolbar, table `overflow-x-auto` wrapper, and pagination footer. Shared `ds2-control-radius-lg` / `ds2-control-radius-md` + `ds2-toolbar-control-h` in `design-system-2-scope.css` so search, Sort/Filter/Add, and filter select use `--ds2-radius-*` from prefs; row height locked to `2.5rem` for alignment.
- **`Products.tsx`:** Single white card (`rounded-xl`), `h1` + compact toolbar (`h-10`, `rounded-lg`); **Add Product** uses `AdminActionButton` **`variant="primary"`** (DS2 secondary / UI gradient in scope); removed stat cards; table header `bg-gray-50` + column `border-r`; rows match mock (SKU-style ID, thumb + 2-line description, plain category, stock `—` when not tracked, single-line price, pill statuses); footer **Rows per page** + pagination (green active page).
- **`AdminActionButton`:** `success` variant remains for other green actions; Products Add uses **`primary`** for DS2 secondary chrome.
- **`i18n`:** `products.pageTitle`, `products.table.productNameColumn`, pagination strings EN/PT.
- **`tests/products-categories-i18n.test.tsx`:** Assert `h1` via `getByRole('heading', { level: 1 })`.

## Touch sizing — rem tokens (2026-05-06)

- **`tailwind.config.js`:** `extend.minHeight` / `minWidth` — `touch` (3.75rem), `touch-sm` (3.25rem), `touch-xs` (2.75rem), `popover` (17.5rem).
- **Replaced** arbitrary `min-h-[60px]` etc. across `src/**/*.tsx` with `min-h-touch` / `min-h-touch-sm` / `min-h-touch-xs`, `min-w-touch-sm`, `min-w-popover`, `min-h-60` (15rem loading block), `min-w-40` (10rem).
- **Docs:** `STYLE_GUIDE.md`, `AGENTS.md`, `.cursor/rules/style-guide-compliance.mdc`, `DEVELOPMENT_GUIDE.md` examples aligned.

## Products + DS2 polish (2026-05-05)

- **Toolbar radius:** `AdminActionButton` base uses `rounded-2xl`; `Products.tsx` `toolbarButtonClass` no longer fights with redundant `!rounded-2xl`.
- **View product modal:** Outer shell `flex flex-col overflow-hidden` + scrollable body; footer `shrink-0`; Edit uses `ds2-modal-primary-action` so `--ds2-radius-xl` wins after `.rounded-2xl` in `design-system-2-scope.css`.
- **ProductForm:** Panel `rounded-l-2xl overflow-hidden`; inputs use `focus:ring-green-500` / `focus:border-green-500` (same tokens as scope); toggles use `ds2-toggle-on` / `ds2-toggle-off` / `ds2-product-status-on` / `ds2-product-status-off` + `rounded-[10px]`; footer Save uses `ds2-modal-primary-action`.

## Design System 2 — secondary hue on chrome (2026-05-05)

- **Issue:** With secondary set to **green**, admin/tab chrome stayed **blue** because `PALETTE.green` still defined `--ds2-ui-*` as blue, and `TabButton` “reports” used literal `bg-blue-50` / `text-blue-900` outside token overrides.
- **Changes:** `designSystem2VisualTokens.ts` — green row `--ds2-ui-*` now green; added `--ds2-ui-tint-bg` / `--ds2-ui-tint-text` to every palette row and `SECONDARY_KEYS`. `design-system-2-scope.css` — map `bg-blue-50` / `text-blue-900` to those vars inside preview. `DesignSystem2.tsx` — sidebar wrapped in `ds2-visual-scope` + `visualStyle` so nav tabs follow the same tokens.
- **Follow-up:** `PALETTE.blue` `--ds2-ui-*` gradient restored to blue-500→blue-600 (`#3b82f6`→`#2563eb`, hovers `#2563eb`→`#1d4ed8`) — matches the older “green primary + blue chrome” look when Secondary is Blue.
- **Products DS2 swap:** `/products` uses **`Layout`** provider + `.ds2-visual-scope` (prefs from localStorage via shared context), toolbar uses `AdminActionButton`, i18n for sort + table count (`products.header.nameAsc`/`nameDesc`, `products.table.productCount_*`); `design-system-2-scope.css` imported on route. Premade reference: `ProductsPageReference2.tsx`.

## Seeding Functionality (2025-09-08)

- Introduced a new YAML-driven seeding workflow under `seed/` keeping existing `/setup` intact.
- Installed `js-yaml` and `dotenv` for parsing and env handling.
- Added npm script `npm run seed` to execute `seed/run-seed.cjs`.
- Implementing utilities in `seed/lib/` for YAML loading and deterministic UUIDs.

### POS Right Panel Redesign (Order Summary Panel)

 - Implementing a new `OrderSummaryPanel` in `src/components/OrderSummaryPanel.tsx` following STYLE_GUIDE.md and DEVELOPMENT_GUIDE.md
  - Added `totalsOverride` prop and integrated discount/tax/total display from POS
  - Added `discountInfo` prop with proper formatting: percentage with amount in parens, or fixed amount
  - Updated clear cart to reset discount state
- Integrated into `src/pages/POS.tsx`, replacing legacy cart sidebar UI
- Cart lines: tap row decrements quantity by 1 (removes line at qty 1); removed per-line X button (`onDecrementCartLine` + `pos.decrementCartLine`)
- Added i18n keys for: orderDetails, dineIn, takeAway, saveBill, tables, clearAllOrder
- Pending: refine styles to match touch target/typography specs; add tests; update DONE.md after verification

## POS Receipt Preview Modal

- Implemented receipt preview modal on `src/pages/POS.tsx` following DEVELOPMENT_GUIDE and STYLE_GUIDE
- Replaced navigation to `'/receipt-demo'` with in-place modal preview using `ThermalReceipt`
- Added actions: Print and Cancel with 60px+ touch targets and gradient per style guide
- Persist transaction when possible; preview still shows even if offline

## Transactions page — View Receipt wiring

- Hooked up "View Receipt" button to navigate to `'/receipt-demo/:id'`
- Added aria-label for expand/collapse button for accessibility
- Verified `ReceiptDemoPage` builds `ReceiptProps` from `transactionService.getTransactionById`

- Implemented guarded Supabase auth to prevent unwanted 400 password grant calls
  - Updated `src/types/supabase.ts` to reflect schema: added `auth_id` (optional) and included `'trainee'` in roles
  - Updated `src/contexts/SupabaseAuthContext.tsx` to:
    - Gate `signInWithEmailAndPassword` behind `isSupabaseConfigured()`
    - Attempt Supabase sign-in for inventory/all only if: configured, online, and `auth_id` exists on employee
  - No hacks added; follows `DEVELOPMENT_GUIDE.md` conventions

- Provisioning improvements
  - `setup-supabase-auth-users.js` now:
    - Loads env from root `.env` (app) and `supabase/.env` (service role)
    - Auto-detects employees with `inventory` or `all` access (any role)
    - Creates auth users and links `auth_id`
    - Supports password strategy via `PROVISION_PASSWORD_SOURCE` and `DEFAULT_SUPABASE_PASSWORD`
  - `SUPABASE_AUTH_SETUP.md` updated with dual .env locations and password provisioning options
# Currently In Progress 🚧

## Offline-first error UX (2026-05-04)

- Implemented plan: split `loadError` / `syncError` / `operationError` in `EmployeesContext`; `syncError` + `clearSyncError` in `ProductsContext`; `await initializeLocalDatabase()` before Dexie reads in `loadData`.
- UI: `LoginForm` blocks only on `loadError`; orange sync strip with dismiss. `POS` full-screen only on catalog `error`; sync degraded banner with retry/dismiss. `Employees` admin: `loadError` full-screen; `syncError` / `operationError` as banners.
- i18n EN/PT (`login.syncDegraded*`, `pos.syncDegraded*`); `AGENTS.md` edge-case bullet; `tests/employees-offline-errors.test.tsx`.
- `tsc --noEmit` clean; Vitest `auth.test` + `employees-offline-errors.test` pass.

## ⚡️ CRITICAL SECURITY FIXES (IMMEDIATE PRIORITY) ⚡️
- **Status**: 🚧 ACTIVE (2024-12-19)
- **Description**: Addressing critical security vulnerabilities identified in `SECURITY_ISSUES.md`.
- **Priority**: URGENT
- **Key Actions**:
  - [ ] **Fix Hard-Coded Passwords** - Replace mock passwords with a secure hashing and authentication mechanism.
  - [ ] **Secure `localStorage` Usage** - Remove sensitive data from `localStorage` and implement a secure session management strategy.
  - [ ] **Remove Exposed Credentials** - Eliminate any hard-coded or visible credentials from the UI.

**Files**: `SECURITY_ISSUES.md`, `src/contexts/AuthContext.tsx`, `src/components/Auth/LoginForm.tsx`

---

## Backend & API Development
- **Status**: 📝 PLANNING
- **Description**: Planning the migration from mock data to a fully backend-driven application.
- **Priority**: HIGH
- **Next Steps**:
  - [ ] Define API endpoints for products, transactions, and customers.
  - [ ] Integrate API calls into the respective contexts and UI components.
  - [ ] Phase out mock data files and logic.

---

## Planned Development Activities

### Route-Level Permission Enforcement ✅
- **Status**: ✅ COMPLETED (2024-12-19)
- **Description**: Successfully implemented comprehensive route protection
- **Result**: Cashiers and other roles now properly restricted from unauthorized pages

### Authentication System Enhancements ✅  
- **Status**: ✅ COMPLETED (2024-12-19)
- **Description**: Touch-optimized login interface with role-based redirects
- **Result**: Professional POS authentication system ready for production use

---

## 📋 Priority Queue

1. **Security Critical Fixes** (This Week)
2. **Backend API Development** (Planning Phase)
3. **Receipt Integration Phase 1 (Active)**
   - Company & receipt settings UI
   - POS → build `receiptData` and navigate to `/receipt-demo`
   - Counter increments via settings persistence
4. **Advanced POS Features** (Future Development)
4. **Performance Optimization** (Ongoing)

---

**Last Updated**: 2024-12-19  
**Next Review**: 2024-12-20 (Daily security progress check)

---

## Connectivity & Sync Reliability
- Status: ACTIVE (2025-08-20)
- Description: Replace ad-hoc table probes with a lightweight heartbeat and centralize connectivity state to stop request storms.
- Changes in progress:
  - Switched `checkSupabaseConnection` to RPC `ping` instead of `from('employees').select('id')`
  - Deduplicated concurrent connectivity checks in `ConnectionStatus` and added in-flight guard
  - Standardized `isOnline()` in `employeeService` and `productService` to use centralized status/heartbeat
  - Added heartbeat RPC to `supabase/migrations/20250803_cashier_functions_tables.sql`
- Next steps:
  - Audit other services/hooks for direct table probes and migrate to centralized heartbeat
  - Monitor logs on receipt navigation to confirm no repeated PostgREST 429/ERR_INSUFFICIENT_RESOURCES

---
## Dashboard Localization
- Status: ACTIVE (2025-08-25)
- Description: Internationalizing Dashboard page strings and date based on `LanguageContext` using i18next.
- Changes in progress/completed:
  - Added `dashboard` keys to `src/i18n.ts` (EN/PT)
  - Refactored `src/pages/Dashboard.tsx` to use `useTranslation` and localized date
  - Added `tests/dashboard.test.tsx` to verify both languages render correctly
  - Ensured component structure follows `DEVELOPMENT_GUIDE.md`

## Products & Categories Localization
- Status: ACTIVE (2025-08-25)
- Description: i18n coverage for Products and Categories admin pages.
- Changes in progress/completed:
  - Added `products` and `categories` keys to `src/i18n.ts` (EN/PT)
  - Refactored `src/pages/Products.tsx` and `src/pages/Categories.tsx` to use `useTranslation`
  - Localized sort/filter/search placeholders, table headers, status chips, and modals
  - Added `tests/products-categories-i18n.test.tsx` for basic assertions


## Multi-Tenant Migration — Phase 2 Identity
- Status: ACTIVE (implementation; 2026-07-05)
- Canonical plan: `docs/multi-tenant-plan.md`
- Execution log: `docs/phase2-identity.md`
- Completed/deployed: Phase 0 core hardening, Phase 1 tenant backbone/claim helpers, device provisioning, `pair-device`, pairing UI/session bootstrap, and `employee_pin_login` foundation.
- Current slice: employee credential cutover implemented and locally verified; JWT-only `upload-image` deployed to EasySoft-staging.
- Blocker: staging SQL apply requires a valid EasySoft-staging Postgres password. Production is unchanged and the credential-delta exposure remains open until the coordinated cutover.
- Next: validate/apply the cutover on staging, then finish Dexie scoping, post-pair bootstrap, authenticated sync enforcement, and `ConnectivityGate`.

---

## Offline Sync Coverage & Upgrade
- Status: ACTIVE (2025-09-07)
- Description: Audit of local DB + sync coverage and creation of a comprehensive offline-first upgrade plan to include customers and transactions.
- Artifacts:
  - `OFFLINE_SYNC_AUDIT_AND_PLAN.md` (audit + step-by-step upgrade plan)
- Key Findings:
  - Employees, Products, Categories: already offline-first with queues and delta RPCs
  - Customers, Transactions, Transaction Items: server-direct only; no local storage or queues
- Next Steps:
  - Extend Dexie schema with customers/transactions tables + queues
  - Implement Customer/Transaction Local + Sync services and orchestrator
  - Update POS checkout to write local transactions and queue sync
  - Add delta/upsert RPCs for customers/transactions on Supabase

## Seeding Fixes (2025-09-11)

- Replaced date placeholders in `public/seed/transactions.yml` with concrete ISO dates matching `transaction_number` to resolve Supabase error 22007 (invalid date syntax).
- Verified YAML structure and relationships align with `src/utils/populateTransactionData.ts` mock data.

## Dashboard Responsive Design Fix (2025-11-04)

- **Status**: ✅ COMPLETED
- **Description**: Complete overhaul of dashboard responsiveness across all screen sizes
- **Changes Made**:
  - **Header Component** (`src/components/Layout/Header.tsx`):
    - Implemented progressive disclosure: full date on desktop (lg+), short date on tablet (md-lg), hidden on mobile
    - Till status hidden on smallest mobile devices (shown from sm+)
    - Search bar hidden on mobile/tablet (shown on lg+)
    - Notifications hidden on mobile (shown on md+)
    - User profile responsive: full info on desktop (md+), avatar only on mobile
    - Language switcher hidden on small mobile (shown from sm+)
    - Replaced fixed `space-x-*` with responsive `gap-*` utilities
    - All elements use `flex-shrink-0` or `whitespace-nowrap` to prevent layout breaks
  
  - **Layout Component** (`src/components/Layout/Layout.tsx`):
    - Implemented mobile drawer pattern for sidebar (overlay on mobile, fixed on desktop)
    - Added mobile state detection and separate sidebar open state for mobile
    - Sidebar hidden by default on mobile (<768px), toggled via hamburger menu
    - Added backdrop for mobile sidebar with proper z-index layering
    - Sidebar slides in/out with smooth transition on mobile
    - Desktop behavior unchanged (collapse/expand in place)
    - Main content always takes full width on mobile
  
  - **Sidebar Component** (`src/components/Layout/Sidebar.tsx`):
    - No visual changes needed, works correctly with Layout overlay pattern
  
- **Testing Results**:
  - ✅ **Mobile (375px)**: Clean layout with hamburger menu, user avatar, full-width content
  - ✅ **Tablet (768px)**: Collapsed sidebar icons, shortened date, full functionality
  - ✅ **Desktop (1920px)**: Full layout with expanded sidebar, complete date/time, search bar, all elements visible
  - ✅ **Sidebar Drawer**: Works perfectly on mobile with backdrop and smooth animation
  
- **Breakpoints Used**:
  - Mobile: `<768px` (md)
  - Tablet: `768px - 1024px` (md - lg)
  - Desktop: `>1024px` (lg+)
  
- **Benefits**:
  - No more horizontal overflow on any screen size
  - Professional mobile UX with proper navigation drawer
  - All content properly readable at every breakpoint
  - Maintains full functionality across all devices
  - Follows modern responsive design patterns

## Products Page Responsive Design Fix (2025-11-04)

- **Status**: ✅ COMPLETED
- **Description**: Fixed responsive layout issues on the Products page across all screen sizes
- **Changes Made**:
  - **Header Layout** (`src/pages/Products.tsx`):
    - Changed header flex direction from `lg:flex-row` to `md:flex-row`
    - Ensures search bar and action buttons share the same row on tablet and above
    - Better horizontal space utilization on tablet devices
  
  - **Statistics Cards Grid** (`src/pages/Products.tsx`):
    - Modified grid layout from `md:grid-cols-5` to `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5`
    - Prevents severe cramping on tablet view
    - Proper grid breakdowns:
      - Mobile (<640px): 1 column (stacked)
      - Small tablet (640px-1024px): 2 columns
      - Large tablet/laptop (1024px-1280px): 3 columns
      - Desktop (1280px+): 5 columns
  
- **Testing Results**:
  - ✅ **Mobile (375px)**: Clean stacked layout, full-width search, properly sized buttons
  - ✅ **Tablet (768px)**: Two-column stat cards, search/buttons on same row
  - ✅ **Desktop (1280px+)**: Five-column stat cards, optimal space usage
  
- **Benefits**:
  - No more cramped stat cards on tablet
  - Improved header utilization on tablet and up
  - Professional layout at all breakpoints

## Reports Page Responsive Design Fix (2025-11-04)

- **Status**: ✅ COMPLETED
- **Description**: Fixed responsive tab navigation on the Reports page to prevent wasted space
- **Changes Made**:
  - **Tab Navigation** (`src/pages/Reports.tsx`):
    - Changed text label visibility from `lg:` (1024px) to `md:` (768px)
    - Progressive padding: `px-3` (mobile) → `px-4` (tablet) → `px-6` (desktop)
    - Ensures tabs show full labels from tablet size onwards
    - Icon-only tabs reserved for smallest mobile screens (<768px)
  
  - **Responsive Breakpoints**:
    - Mobile (<768px): Icon-only tabs with compact padding (px-3)
    - Tablet+ (≥768px): Icons + full text labels with progressive padding
    - Desktop (≥1024px): Icons + text with generous padding (px-6)
  
- **Testing Results**:
  - ✅ **Mobile (400px)**: Icon-only tabs, compact padding, space-efficient
  - ✅ **Large phone/small tablet (700px)**: Icon-only tabs, no wasted space
  - ✅ **Tablet+ (850px)**: Icons + full text labels, proper space utilization
  
- **Benefits**:
  - No more wasted horizontal space on tablet sizes
  - Better UX with full text labels appearing earlier
  - Consistent visual hierarchy across breakpoints
  - Optimal space usage at all screen sizes
