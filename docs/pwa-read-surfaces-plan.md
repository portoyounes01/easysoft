## Host-aware READ SOURCE for the PWA (revised)

**Goal:** on the PWA (browser) host, every list/report page shows the tenant's real data via direct, RLS-scoped PostgREST `.from(table).select()`; the Electron till host keeps its Dexie/delta path byte-for-byte unchanged.

**Principle (small touch surface):** branch inside each **service read function** with the existing precedent `if (isPwaHost) { return <postgrest read + shape map>; }` (mirrors `employeeService.performSync`'s `isPwaHost` early-return at `employeeService.ts:345`). Pages don't change — except `ProductsContext.loadData`, which inlines Dexie and must be redirected to the (now host-aware) services.

### What the critique changed vs. the original plan (do NOT ship the naive version)
The original plan's "just delegate `offlineReportingService` → `transactionService.<sameMethod>`" is **wrong on four counts** and would ship silently-incorrect reports or a hard crash:

1. **Hour-of-day filter would be silently dropped → wrong totals.** `transactionService`'s four reporting methods never read `filters.hourRange`; Reports.tsx binds an hour-range UI (`Reports.tsx:328-357`) that feeds `getReportData`/`generateCSVReport`. Delegating blind = revenue/metrics computed over ALL hours with no error. Fix: on PWA fetch **row-level** data once and apply hour filtering + aggregation in JS.
2. **PostgREST 1000-row cap → silent undercount.** The four `transactionService` reporting methods (and the products/customers/employees selects) have no pagination. Any range with >1000 completed transactions, or >1000 line items, silently undercounts. Fix: a shared `fetchAllPages()` range-loop.
3. **`.in('transaction_id', [~1000 uuids])` → oversized URL → 414/400 hard break.** With "throw on error", a few hundred transactions makes /reports throw. Fix: chunk ids (100/request) and merge.
4. **These `transactionService` reporting methods were dead code until now** (on PWA `shouldUseOfflineData()`→false→server branch→`reportingService.getTransactionsForReporting` is a `TypeError`→caught→empty Dexie→€0.00). So "already works / RLS-scoped" was never actually exercised. The revised PWA path routes through a NEW paginated+chunked `transactionService.getReportRows()` — it does **not** call the four capped methods.

Two additional gaps the revision closes:
5. **Ungated Dexie sync on PWA.** `ProductsContext.syncData()`→`productSyncService.fullSync()` has no host guard and is auto-invoked on `online`. On PWA it writes IndexedDB and fires `upsert_*` RPCs — violating the read-only principle and re-introducing the D6/D12 RPC spam. Fix: gate `syncData()` (and `fullSync()`) to till.
6. **Silent write data-loss on PWA.** Catalog/customer/staff mutations still hit empty Dexie on the browser and vanish on reload. Fix: guard the mutating service methods with an `isPwaHost` throw + hide the action buttons; PWA management is **view-only** in v1.

### The two facts that still make the read path mostly free
1. The Dexie→Local shape mapping (ISO-string→`Date`, add `needs_push:false`/`is_conflicted:false`) already exists per table in the `*FromServer` helpers; the PWA read branches reuse the same transform verbatim.
2. `reportingService.generateCSVReport(rows)` (`transactionService.ts:823`) is a pure function of `ReportTransaction[]` — the PWA CSV path reuses it directly.

### Priority order
0. **Shared pagination helper** (`src/lib/supabasePaging.ts`) — prerequisite for every unbounded read.
1. **Reports** (`transactionService.getReportRows` + host-aware `offlineReportingService`) — fixes the crash, €0.00, hour-range correctness, row cap, URL length. Highest leverage; also fixes `ProfitCosts.tsx` (same `getReportData` caller).
2. **Products + Categories** — host-aware `getAllProducts`/`getAllCategories` + redirect `ProductsContext.loadData` + gate Dexie init/sync to till.
3. **Customers** — branch the two Dexie reads the page calls (paginated, ordered).
4. **Employees** — host-aware `getAllEmployees`/`getEmployeeById`/`getEmployeeByNumber` (PostgREST + map); `searchEmployees`/`filterEmployees`/`getEmployeesByRole` reuse the host-aware `getAllEmployees()` + existing in-memory JS filters (no PostgREST-predicate re-derivation).
5. **Write trap** — guard mutating methods with `isPwaHost` + hide action buttons (view-only PWA).
6. **Transactions list** — already loads via direct PostgREST; document the 1000-row ceiling; optional Dexie-guard cleanup.

### Read-source map (PWA branch → query)
| Area | Branch point | PWA query | Shape map |
|---|---|---|---|
| Reports (all tabs + CSV) | `offlineReportingService.getReportData` + 4 methods + `generateCSVReport` | fetch `transactionService.getReportRows(filters)` (paginated tx + id-chunked items), apply `filterRowsByHour`, derive all 4 VMs in JS | returns page's camelCase `ReportTransaction`/`*Performance`/`OverviewMetrics` |
| Products | `productService.getAllProducts` | `fetchAllPages(from,to => .from('products').select('*').is('deleted_at',null).order('display_order').order('id').range(from,to))` | reuse `bulkInsertProductsFromServer` map (ISO→Date, sync flags) |
| Categories | `categoryService.getAllCategories` | same on `categories` | reuse `bulkInsertCategoriesFromServer` map |
| Products/Categories page | `ProductsContext.loadData` | call the two services; gate `initializeLocalDatabase()`/`ensureDefaultGeneralCategory()` to `isTillHost` | — |
| Customers list | `CustomerLocalService.getAllCustomers` | `fetchAllPages(.from('customers').select('*').is('deleted_at',null).order('name').order('id'))` | reuse `bulkInsertFromServer` map (Date coercion mandatory — `Customers.tsx:323` calls `formatDate(created_at)` expecting a Date) |
| Customers last-purchase | `getLatestPurchaseDatesByCustomer` | `fetchAllPages(.from('transactions').select('customer_id,transaction_date,transaction_time').eq('status','completed').is('deleted_at',null).not('customer_id','is',null).order('transaction_date',{ascending:false}).order('id'))` | client-reduce to `Record<id,Date>` via `new Date(\`${date}T${time||'00:00:00'}\`)`, keep max |
| Employees roster | `employeeService.getAllEmployees` (+ById/ByNumber) | `fetchAllPages(.from('employees').select(<19 cols, no password_hash/pin>).is('deleted_at',null).order('name').order('id'))` | map to `Employee[]` (ISO-string dates kept as-is; add `performance` from flat fields). `searchEmployees`/`filterEmployees`/`getEmployeesByRole` reuse `getAllEmployees()` + existing JS filters |
| Transactions list | `transactionService.getTransactions` | already direct PostgREST, RLS-scoped | none (1000-row ceiling documented) |

**Do NOT reuse `customerService.getCustomers()`/`getCustomerById()`** — they filter `.eq('deleted_at', null)` (`transactionService.ts:698/733`), which PostgREST renders as `deleted_at=eq.null` and matches **zero** rows. Always use `.is('deleted_at', null)`.

### Verification milestone
RLS isolation is proven only via simulated-JWT SQL probes (REGISTER A8); the live browser `.from().select()` path is unexercised. Every PWA branch must **throw on error** (never silently `return []`) so an auth/tenant failure surfaces as an error instead of masquerading as empty data. First real PWA login is the go/no-go check. `fetchAllPages` page size assumes the server's PostgREST `max-rows >= 1000`; if it is set lower, align `PG_PAGE_SIZE` to it or reports will still undercount.
