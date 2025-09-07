## Offline Sync Audit and Upgrade Plan

This document audits the current local database and synchronization coverage and lays out a precise plan to achieve a fully synced, offline‑first POS app.

### Current State (as of this commit)
- **Local DB technology**: IndexedDB via Dexie (`src/lib/localDatabase.ts`).
- **Entities stored offline**:
  - **Employees**: full offline-first CRUD with queue and bi‑directional sync (RPCs `get_employees_delta`, `upsert_employees`).
  - **Categories**: offline-first CRUD with queue and bi‑directional sync (RPCs `get_categories_delta`, `upsert_categories`).
  - **Products**: offline-first CRUD with queue and bi‑directional sync (RPCs `get_products_delta`, `upsert_products`).
- **Entities NOT stored offline (server-direct only)**:
  - **Transactions** and **Transaction Items**: created and queried directly on Supabase in `src/services/transactionService.ts`.
  - **Customers**: server-direct CRUD in `transactionService.customerService`.
  - **Daily Sales Summary** and reporting: computed via server queries only.
- **Local DB schema (Dexie)**:
  - Tables: `employees`, `categories`, `products`, `employeeSyncQueue`, `categorySyncQueue`, `productSyncQueue`, `syncMetadata` (per-entity keys like `employees`, `products`, `categories`).
  - No local tables for `customers`, `transactions`, `transaction_items`, `daily_sales_summary`.
- **Sync orchestration**:
  - Employees: `EmployeeService` performs push/pull.
  - Products/Categories: `ProductSyncService` performs push/pull.
  - No orchestrator coordinating all entities; transactions/customers lack offline sync.

### Gaps and Impact
- **Checkout offline**: Transactions cannot be created or listed offline; cart flow is local state only. Risk of outages blocking sales.
- **Customer offline**: Customer lookup/creation fails offline (no local cache, no queue).
- **Reporting offline**: No cached dataset for recent reporting windows.
- **Single source of sync metadata**: `syncMetadata` exists but is not initialized for all entities.
- **RPC coverage**: Delta RPCs exist for transactions/items in types, but client code does not use them; upsert RPCs for transactions/items not defined.

### Target Architecture (Offline‑First for All Core Entities)
- **Dexie schema expansion**
  - Add local tables: `customers`, `transactions`, `transactionItems`, `dailySalesSummaries`.
  - Add queues: `customerSyncQueue`, `transactionSyncQueue` (append-only event style), optionally `transactionItemSyncQueue` (but items typically pushed with their transaction).
  - Extend `syncMetadata` with ids: `customers`, `transactions`, `transaction_items`, `daily_sales_summary`.
- **Entity patterns**
  - Employees/Categories/Products: keep current last‑write‑wins strategy.
  - Customers: last‑write‑wins; email/phone dedupe handled during push (server‑side upsert by `id`, optional unique constraints on email/phone).
  - Transactions: treat as append‑mostly immutable; allow status changes (refund/cancel) as separate operations. Conflicts unlikely; server is source of truth for computed totals but accept client totals.
  - Transaction Items: created with their parent transaction; never updated independently.
- **Sync manager**
  - Central `SyncManager` that:
    - Observes `connectionStatus`.
    - Runs push/pull for all entities with backoff and per‑entity cursors.
    - Exposes unified sync status for UI.
- **Bootstrapping**
  - On first run or after schema bump: pull deltas for employees/categories/products; optionally a bounded recent window for transactions (e.g., last 30–90 days) to keep storage reasonable.

### Schema Changes (Dexie)
- Bump Dexie version to `3` and `4` for staged migrations.
- New tables (keys illustrative):
  - `customers: 'id, name, email, phone, is_active, updated_at, needs_push, deleted_at'`
  - `transactions: 'id, transaction_number, employee_id, customer_id, status, transaction_date, updated_at, needs_push, deleted_at'`
  - `transactionItems: 'id, transaction_id, product_id, quantity, updated_at, deleted_at'`
  - `dailySalesSummaries: '[summary_date+employee_id], updated_at'`
  - Queues: `customerSyncQueue`, `transactionSyncQueue`
- Hooks: creating/updating/deleting set timestamps and `needs_push` (soft delete semantics maintained).

### Type Additions (`src/types/supabase.ts`)
- Add local interfaces mirroring existing patterns:
  - `LocalCustomer`, `LocalTransaction`, `LocalTransactionItem`, `LocalDailySalesSummary`.
  - Pending ops: `PendingCustomerOperation`, `PendingTransactionOperation`.
- Ensure no `any` (Development Guide: TypeScript conventions).

### Client Services
- `customerLocalService` and `transactionLocalService`
  - CRUD on Dexie with queueing and search/filter helpers.
- `CustomerSyncService` and `TransactionSyncService`
  - Push: bulk upsert via RPCs; for transactions push parent + items atomically (single RPC or two within transaction server‑side).
  - Pull: use `get_customers_delta`, `get_transactions_delta`, `get_transaction_items_delta` if available; otherwise add them.
- Refactor `transactionService` and `customerService`
  - Route via local services when offline; when online, prefer local read but backfill from server on demand, then cache locally.

### Supabase (DB + RPC) Requirements
- RPCs needed (server):
  - `upsert_customers(customers_data jsonb)` → number or result array
  - `upsert_transactions(transactions_data jsonb)` → returns inserted/updated ids
  - `upsert_transaction_items(items_data jsonb)` (or include items inside `upsert_transactions`)
  - Ensure existing delta RPCs for transactions/items are deployed and indexed.
- Constraints and indexes:
  - Unique or partial unique constraints as applicable (e.g., `transaction_number` unique; optional unique on customer email/phone).
  - Indexes on `updated_at`, `deleted_at`, and foreign keys.
- RLS
  - Mirror existing secure RLS patterns used for other entities to allow upserts via RPC and selects for delta functions.

### POS Flow Changes (Critical)
- `POSContext`
  - On checkout: create local `transaction` + `transactionItems`, update product stock locally, enqueue push. Generate client‑side `transaction_number` (existing fallback) safely.
  - Expose receipt data from local objects; printing can use local until server confirms.
- Sync confirmation
  - When online, background push confirms server assignment; reconcile any server adjustments (e.g., transaction_number collisions) back to local.

### Reporting
- Add background import of a recent time window of transactions/items into local storage for offline reporting (window configurable; default 30–90 days).
- For large histories, page deltas and prune old local data beyond window.

### Error Handling and Conflict Strategy
- Follow Development Guide Error Handling Standards:
  - Try/catch around async sync steps; user‑friendly messages; structured logging.
- Conflicts:
  - Employees/Products/Categories/Customers: last‑write‑wins using `updated_at` timestamps; server timestamp takes precedence if drift detected.
  - Transactions: if duplicate `transaction_number`, server generates replacement; client stores server‑approved number and marks local as reconciled.

### Performance and Reliability
- Use `useMemo`/`useCallback` in contexts; `React.memo` where lists render often.
- Backoff and jitter for sync retries; cap queue sizes; sync in small batches (e.g., 100 rows).
- Avoid blocking UI; all syncs in background; explicit `forceSync` in UI where needed.

### Migration Plan (Implementation Steps)
1. Dexie schema upgrade
   - Add new tables/queues and hooks; bump versions; robust recovery (existing error recovery pattern).
   - Initialize `syncMetadata` entries for all entities (`employees`, `categories`, `products`, `customers`, `transactions`, `transaction_items`, `daily_sales_summary`).
2. Types
   - Add Local* and Pending* interfaces; extend enums/constants as needed.
3. Services
   - Implement `customerLocalService`, `transactionLocalService` with queues.
   - Implement `CustomerSyncService`, `TransactionSyncService` with push/pull and metadata updates.
4. Orchestrator
   - Create `SyncManager` to coordinate all entity syncs off a single connection observer.
5. POS flow
   - Update `POSContext` to create local transactions/items and stock updates; adapt `processTransaction` accordingly.
6. Supabase backend
   - Add/verify delta functions for customers/transactions/items; create upsert RPCs; ensure RLS and indexes.
7. Reporting
   - Implement background import for recent window; adjust reporting to use local when offline.
8. Testing
   - Unit tests for services and sync; integration tests for offline → online flows; TypeScript compile clean.
9. Docs
   - Update `EMPLOYEE_SETUP.md`-style docs for customers/transactions; update guides.

### Acceptance Criteria
- App supports full POS checkout and customer workflows offline; transactions sync when online.
- Products, categories, employees remain consistent and synced.
- Customers can be created/edited offline with reconciliation.
- Reporting works offline for the recent window.
- No TypeScript `any`; follows component and state patterns.
- Error handling per Development Guide; no unhandled promise rejections.

### References and Compliance
- Development Guide: TypeScript conventions; Component structure; State management; Performance; Error handling; Testing.
- Style Guide: When UI changes are made (new sync indicators, badges), follow typography, spacing, touch targets, and color standards.
- Any deviations must be justified and documented alongside code changes.

### Suggested Work Breakdown (High‑Level)
- Extend Dexie schema + types (Local*, Pending*)
- Customer offline CRUD + sync
- Transaction offline create + push + pull recent window
- SyncManager integration
- POSContext checkout refactor (+ stock updates)
- Reporting offline cache window
- Supabase RPCs and RLS for new entities
- Tests + documentation updates

---
This plan aligns with an incremental rollout: start with customers (low risk), then transactions (highest impact), then orchestrator/reporting.
