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


## Multi-Tenant Database Migration (Planning)
- Status: ACTIVE (planning and documentation)
- Description: Designing and documenting the shift to a single Supabase project with tenant isolation via RLS and tenant-scoped constraints.
- Artifacts:
  - `MULTI_TENANT_MIGRATION_PLAN.md` added with end-to-end phases, schema changes, RLS patterns, RPC updates, tests, and rollback.
- Next Steps:
  - Review plan with stakeholders
  - Prepare staged SQL migration bundle
  - Create seed organization and membership mapping approach

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
