import { YamlLoader } from './yamlLoader';
import { generateUUID } from './uuid';
import { hashPassword } from './hashUtils';
import { initializeLocalDatabase, localDb } from '../lib/localDatabase';
import { LocalEmployee, LocalCategory, LocalProduct } from '../types/supabase';
import { setStartupSeedDisabled } from './startupSeedPreference';

// Utility to convert string ID to deterministic UUID
function coerceToUuidOrDeterministic(value: any): string {
  if (!value) return generateUUID();
  const str = String(value);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(str)) return str;
  
  // Generate deterministic UUID from string
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  
  // Simple deterministic approach - in production you might want to use a proper hash
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data[i]) & 0xffffffff;
  }
  
  // Convert to UUID format
  const hashStr = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hashStr.substring(0, 8)}-${hashStr.substring(0, 4)}-4${hashStr.substring(1, 4)}-8${hashStr.substring(0, 3)}-${hashStr.substring(0, 12).padEnd(12, '0')}`;
}

/** Supabase/network failures are often plain objects with `message`, not Error instances. */
function seedErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === 'string' && m.length > 0) return m;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isStartupSystemAdmin(emp: { employee_number?: unknown; name?: unknown }): boolean {
  const employeeNumber = String(emp.employee_number ?? '').toUpperCase();
  const name = String(emp.name ?? '').toLowerCase();
  return employeeNumber === 'ADMIN001' || name === 'system administrator';
}

function startupCredentialDefaults(emp: { employee_number?: unknown; name?: unknown; role?: unknown }): {
  password: string | null;
  pin: string | null;
} {
  if (isStartupSystemAdmin(emp)) {
    return { password: 'password', pin: null };
  }

  switch (emp.role) {
    case 'admin':
      return { password: '0099', pin: null };
    case 'manager':
      return { password: null, pin: '2222' };
    case 'cashier':
    case 'trainee':
      return { password: null, pin: '1111' };
    default:
      return { password: null, pin: '1111' };
  }
}

export interface SeedResult {
  success: boolean;
  message: string;
  details: {
    employeesCount: number;
    categoriesCount: number;
    productsCount: number;
    customersCount: number;
    transactionsCount: number;
    cashierTestsCount: number;
    cashDrawerLogsCount: number;
  };
}

export interface ClearSeedDataResult {
  success: boolean;
  message: string;
  preservedSystemAdmins: number;
  preservedFiscalIssueAttempts: number;
  preservedFiscalDocuments: number;
  preservedFiscalTransactions: number;
}

export interface LocalYamlSeedOptions {
  useStartupJson?: boolean;
}

interface StartupSeedJson {
  employees?: unknown[];
  categories?: unknown[];
  products?: unknown[];
}

async function loadStartupSeedJson(): Promise<StartupSeedJson | null> {
  try {
    const response = await fetch('/startup-seed.json');
    if (!response.ok) return null;
    const data = (await response.json()) as StartupSeedJson;
    if (
      Array.isArray(data.employees) ||
      Array.isArray(data.categories) ||
      Array.isArray(data.products)
    ) {
      return data;
    }
    return null;
  } catch (error) {
    console.warn('Startup JSON seed unavailable; falling back to YAML seed files:', error);
    return null;
  }
}

export class SeedDataService {
  // Fast local-only seed for app startup. No Supabase health checks, cloud writes, or sync.
  async seedLocalFromYaml(options: LocalYamlSeedOptions = {}): Promise<SeedResult> {
    try {
      console.log('🌱 Starting local YAML seeding...');

      await initializeLocalDatabase();

      const useStartupJson = options.useStartupJson !== false;
      const startupSeed = useStartupJson ? await loadStartupSeedJson() : null;
      let seedEmployees = startupSeed?.employees;

      if (!startupSeed) {
        try {
          YamlLoader.clearCache();
        } catch {
          // Cache clearing is best-effort; loading fresh files below can still proceed.
        }
        const yamlFiles = await YamlLoader.loadMultipleYamlFiles(['employees.yml']);
        seedEmployees = yamlFiles.employees?.employees;
      }

      let employeesCount = 0;
      // Startup intentionally stops at the employee roster.
      // Categories, products, and the rest of the demo dataset stay out of the boot path.

      if (Array.isArray(seedEmployees)) {
        const employees = await this.normalizeEmployees(seedEmployees, {
          applyStartupCredentialDefaults: true,
        });
        await this.seedEmployees(employees, { updateExistingCredentials: true });
        employeesCount = employees.length;
      }

      return {
        success: true,
        message: 'Local YAML seeding completed successfully!',
        details: {
          employeesCount,
          categoriesCount: 0,
          productsCount: 0,
          customersCount: 0,
          transactionsCount: 0,
          cashierTestsCount: 0,
          cashDrawerLogsCount: 0
        }
      };
    } catch (error) {
      console.error('❌ Local YAML seeding failed:', seedErrorMessage(error), error);
      return {
        success: false,
        message: `Local YAML seeding failed: ${seedErrorMessage(error)}`,
        details: {
          employeesCount: 0,
          categoriesCount: 0,
          productsCount: 0,
          customersCount: 0,
          transactionsCount: 0,
          cashierTestsCount: 0,
          cashDrawerLogsCount: 0
        }
      };
    }
  }

  // Main seeding function
  async seedFromYaml(): Promise<SeedResult> {
    try {
      console.log('🌱 Starting YAML-based seeding...');

      // Load all YAML files
      // Ensure we don't use stale cached YAML during development
      try {
        YamlLoader.clearCache();
      } catch {
        // Cache clearing is best-effort; loading fresh files below can still proceed.
      }
      const yamlFiles = await YamlLoader.loadMultipleYamlFiles([
        'employees.yml',
        'categories.yml',
        'products.yml',
        'customers.yml',
        'transactions.yml',
        'transaction-items.yml',
        'cashier-tests.yml',
        'cash-drawer-logs.yml'
      ]);

      const supabaseApi = await import('../lib/supabase');
      const supabaseOnline =
        supabaseApi.isSupabaseConfigured() && (await supabaseApi.checkSupabaseConnection());

      let employeesCount = 0;
      let categoriesCount = 0;
      let productsCount = 0;
      let customersCount = 0;
      let transactionsCount = 0;
      let cashierTestsCount = 0;
      let transactionItemsCount = 0;
      let cashDrawerLogsCount = 0;

      // 1. Seed Categories first (products depend on them)
      if (yamlFiles.categories?.categories) {
        console.log('📂 Seeding categories...');
        const categories = this.normalizeCategories(yamlFiles.categories.categories);
        await this.seedCategories(categories);
        categoriesCount = categories.length;
      }

      // 2. Seed Products (depend on categories)
      if (yamlFiles.products?.products) {
        console.log('📦 Seeding products...');
        const products = this.normalizeProducts(yamlFiles.products.products);
        await this.seedProducts(products);
        productsCount = products.length;
      }

      // 3. Seed Employees
      if (yamlFiles.employees?.employees) {
        console.log('👥 Seeding employees...');
        const employees = await this.normalizeEmployees(yamlFiles.employees.employees);
        // Seed locally (for offline-first) and to Supabase when reachable (FKs / demo data)
        await this.seedEmployees(employees);
        if (supabaseOnline) {
          await this.seedEmployeesServer(employees);
        } else {
          console.warn(
            '⚠️ Skipping Supabase employee upsert — offline, unreachable, or env not configured. Local employees updated; sync when online.'
          );
        }
        employeesCount = employees.length;
      }

      // 4. Seed Customers (direct to Supabase)
      if (supabaseOnline && yamlFiles.customers?.customers) {
        console.log('👤 Seeding customers...');
        const customers = this.normalizeCustomers(yamlFiles.customers.customers);
        await this.seedCustomers(customers);
        customersCount = customers.length;
      }

      // 5. Seed Transactions (direct to Supabase)
      if (supabaseOnline && yamlFiles.transactions?.transactions) {
        console.log('💳 Seeding transactions...');
        const rawTxns: any[] = yamlFiles.transactions.transactions;

        // Build YAML employee id → employee_number map (if employees YAML is available)
        const yamlIdToNumber = new Map<string, string>();
        if (yamlFiles.employees?.employees) {
          for (const emp of yamlFiles.employees.employees as any[]) {
            if (emp?.id && emp?.employee_number) {
              yamlIdToNumber.set(String(emp.id), String(emp.employee_number));
            }
          }
        }

        // Collect employee_numbers from transactions (resolving YAML ids when needed)
        const employeeNumbers = Array.from(new Set(rawTxns
          .map((t: any) => {
            const v = t.employee_id;
            if (typeof v !== 'string') return null;
            // If it's a UUID, we won't resolve by number
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
            if (isUuid) return null;
            // If matches a YAML employee id, map to employee_number
            if (yamlIdToNumber.has(v)) return yamlIdToNumber.get(v)!;
            // Otherwise assume it's already an employee_number
            return v;
          })
          .filter(Boolean)));

        // Fetch canonical UUIDs for those employee_numbers
        const employeeNumberToId = new Map<string, string>();
        if (employeeNumbers.length > 0) {
          const { data: rows, error: mapErr } = await supabaseApi.supabase
            .from('employees')
            .select('id, employee_number')
            .in('employee_number', employeeNumbers as string[]);
          if (mapErr) {
            console.error('Failed to load employees for transaction mapping:', mapErr);
            throw mapErr;
          }
          for (const row of rows || []) {
            employeeNumberToId.set(row.employee_number, row.id);
          }
        }

        // Transform YAML transactions: replace employee_id with canonical UUID (by number or pass-through UUID)
        const transformed = rawTxns.map((t: any) => {
          const v = t.employee_id;
          if (typeof v === 'string') {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
            if (!isUuid) {
              const number = yamlIdToNumber.get(v) || v; // resolve YAML id → number
              const canonicalId = number ? employeeNumberToId.get(String(number)) : undefined;
              if (canonicalId) {
                return { ...t, employee_id: canonicalId };
              }
            }
          }
          return t; // keep as-is (UUID already or unresolved)
        });

        const transactions = this.normalizeTransactions(transformed);
        await this.seedTransactions(transactions);
        transactionsCount = transactions.length;
      }

      // 6. Seed Cashier Tests (direct to Supabase)
      if (supabaseOnline && yamlFiles['cashier-tests']?.cashier_tests) {
        console.log('📝 Seeding cashier tests...');
        const cashierTests = this.normalizeCashierTests(yamlFiles['cashier-tests'].cashier_tests);
        await this.seedCashierTests(cashierTests);
        cashierTestsCount = cashierTests.length;
      }

      // 7. Seed Cash Drawer Logs (direct to Supabase)
      if (supabaseOnline && yamlFiles['cash-drawer-logs']?.cash_drawer_logs) {
        console.log('🗃️ Seeding cash drawer logs...');
        const cashDrawerLogs = this.normalizeCashDrawerLogs(yamlFiles['cash-drawer-logs'].cash_drawer_logs);
        await this.seedCashDrawerLogs(cashDrawerLogs);
        cashDrawerLogsCount = cashDrawerLogs.length;
      }

      // 8. Trigger sync to push local changes to Supabase
      if (supabaseOnline) {
        console.log('🔄 Triggering sync to Supabase...');
        const { syncManager } = await import('../services/syncManager');
        await syncManager.fullSync();
      } else {
        console.warn('⚠️ Skipping full sync — Supabase not reachable.');
      }

      // 9. Seed Transaction Items AFTER products and transactions exist server-side
      if (supabaseOnline && yamlFiles['transaction-items']?.transaction_items) {
        console.log('🧾 Seeding transaction items...');
        const items = this.normalizeTransactionItems(yamlFiles['transaction-items'].transaction_items);
        await this.seedTransactionItems(items);
        transactionItemsCount = items.length;
      }

      console.log('✅ Seeding completed successfully!');

      const successMessage = supabaseOnline
        ? 'YAML seeding completed successfully!'
        : !supabaseApi.isSupabaseConfigured()
          ? 'YAML seeding completed locally. Supabase env vars are missing (VITE_SUPABASE_URL / VITE_SUPABASE_ANON); cloud seed and sync were skipped.'
          : 'YAML seeding completed locally. Cannot reach Supabase (network/DNS/offline); skipped cloud upserts and sync. Fix connectivity and run again or wait for background sync.';

      setStartupSeedDisabled(false);

      return {
        success: true,
        message: successMessage,
        details: {
          employeesCount,
          categoriesCount,
          productsCount,
          customersCount,
          transactionsCount,
          cashierTestsCount,
          // Not returned previously, but keep internal tracking
          cashDrawerLogsCount
        }
      };

    } catch (error) {
      console.error('❌ Seeding failed:', seedErrorMessage(error), error);
      return {
        success: false,
        message: `Seeding failed: ${seedErrorMessage(error)}`,
        details: {
          employeesCount: 0,
          categoriesCount: 0,
          productsCount: 0,
          customersCount: 0,
          transactionsCount: 0,
          cashierTestsCount: 0,
          cashDrawerLogsCount: 0
        }
      };
    }
  }

  async clearLocalData(): Promise<ClearSeedDataResult> {
    const { clearLocalDatabasePreservingRecovery } = await import('./clearLocalDatabase');

    const preserved = await clearLocalDatabasePreservingRecovery();
    setStartupSeedDisabled(true);
    YamlLoader.clearCache();

    return {
      success: true,
      message: 'The active local IndexedDB database was cleared.',
      ...preserved,
    };
  }

  // Normalize employees data
  private async normalizeEmployees(
    employees: any[],
    options?: { applyStartupCredentialDefaults?: boolean }
  ): Promise<LocalEmployee[]> {
    const normalizedEmployees: LocalEmployee[] = [];

    for (const emp of employees) {
      // Hash passwords/pins
      let passwordHash: string | null = null;
      let pinHash: string | null = null;

      if (options?.applyStartupCredentialDefaults) {
        const credentials = startupCredentialDefaults(emp);
        passwordHash = credentials.password ? await hashPassword(credentials.password) : null;
        pinHash = credentials.pin ? await hashPassword(credentials.pin) : null;
      } else {
        if (emp.password_hash && !emp.password_hash.startsWith('$2')) {
          // If it's not already hashed, hash it
          passwordHash = await hashPassword(emp.password_hash);
        } else {
          passwordHash = emp.password_hash || null;
        }

        if (emp.pin) {
          pinHash = await hashPassword(emp.pin);
        }
      }

      const normalized: LocalEmployee = {
        id: coerceToUuidOrDeterministic(emp.id || emp.employee_number),
        employee_number: emp.employee_number,
        name: emp.name,
        email: emp.email || null,
        phone: emp.phone || null,
        password_hash: passwordHash,
        pin: pinHash,
        role: emp.role,
        access_levels: Array.isArray(emp.access_levels) ? emp.access_levels : [],
        is_active: emp.is_active !== false,
        hire_date: emp.hire_date,
        total_sales: emp.total_sales ?? 0,
        transaction_count: emp.transaction_count ?? 0,
        average_transaction: emp.average_transaction ?? 0,
        hours_worked: emp.hours_worked ?? 0,
        created_at: emp.created_at ? new Date(emp.created_at) : new Date(),
        updated_at: emp.updated_at ? new Date(emp.updated_at) : new Date(),
        last_synced_at: emp.last_synced_at ? new Date(emp.last_synced_at) : null,
        deleted_at: emp.deleted_at ? new Date(emp.deleted_at) : null,
        needs_push: true, // Mark for sync
        is_conflicted: false
      };

      normalizedEmployees.push(normalized);
    }

    return normalizedEmployees;
  }

  // Normalize categories data
  private normalizeCategories(categories: any[]): LocalCategory[] {
    return categories.map((cat) => ({
      id: coerceToUuidOrDeterministic(cat.id || cat.name),
      name: cat.name,
      description: cat.description || null,
      color: cat.color || 'from-gray-500 to-gray-600',
      icon: cat.icon || 'package',
      display_order: cat.display_order ?? 0,
      is_active: cat.is_active !== false,
      created_at: cat.created_at ? new Date(cat.created_at) : new Date(),
      updated_at: cat.updated_at ? new Date(cat.updated_at) : new Date(),
      last_synced_at: cat.last_synced_at ? new Date(cat.last_synced_at) : null,
      deleted_at: cat.deleted_at ? new Date(cat.deleted_at) : null,
      needs_push: true, // Mark for sync
      is_conflicted: false
    }));
  }

  // Normalize products data
  private normalizeProducts(products: any[]): LocalProduct[] {
    return products.map((prod) => ({
      id: coerceToUuidOrDeterministic(prod.id || prod.sku),
      name: prod.name,
      description: prod.description || null,
      sku: prod.sku,
      barcode: prod.barcode || null,
      category_id: coerceToUuidOrDeterministic(prod.category_id),
      category_name: prod.category_name || null,
      price: prod.price,
      cost: prod.cost ?? 0,
      iva_rate: prod.iva_rate ?? 0.23,
      stock: prod.stock ?? 0,
      min_stock: prod.min_stock ?? 0,
      track_stock: prod.track_stock !== false,
      image_url: prod.image_url || null,
      supplier: prod.supplier || null,
      location: prod.location || null,
      is_active: prod.is_active !== false,
      display_order: prod.display_order ?? 0,
      created_at: prod.created_at ? new Date(prod.created_at) : new Date(),
      updated_at: prod.updated_at ? new Date(prod.updated_at) : new Date(),
      last_synced_at: prod.last_synced_at ? new Date(prod.last_synced_at) : null,
      deleted_at: prod.deleted_at ? new Date(prod.deleted_at) : null,
      needs_push: true, // Mark for sync
      is_conflicted: false
    }));
  }

  // Normalize customers data (for direct Supabase insert)
  private normalizeCustomers(customers: any[]): any[] {
    return customers.map((cust) => {
      // Support multiple YAML schemas by mapping common aliases → DB columns
      const totalSpent =
        cust.total_spent ?? cust.totalSpent ?? cust.totalPurchases ?? 0;
      const transactionCount =
        cust.transaction_count ?? cust.transactionCount ?? cust.totalOrders ?? 0;
      const loyaltyPoints =
        cust.loyalty_points ?? cust.loyaltyPoints ?? 0;
      const preferredPayment =
        cust.preferred_payment_method ?? cust.preferredPayment ?? null;
      const createdAt = cust.created_at ?? cust.registrationDate ?? null;
      const updatedAt = cust.updated_at ?? null;

      return {
        id: coerceToUuidOrDeterministic(cust.id || cust.email || cust.name),
        name: cust.name,
        email: cust.email || null,
        phone: cust.phone || null,
        address: cust.address || null,
        total_spent: Number(totalSpent) || 0,
        transaction_count: Number(transactionCount) || 0,
        loyalty_points: Number(loyaltyPoints) || 0,
        is_active: cust.is_active !== false,
        preferred_payment_method: preferredPayment,
        created_at: createdAt || new Date().toISOString(),
        updated_at: updatedAt || new Date().toISOString(),
        deleted_at: cust.deleted_at || null,
      };
    });
  }

  // Normalize transactions data (for direct Supabase insert)
  private normalizeTransactions(transactions: any[]): any[] {
    return transactions.map((txn) => ({
      id: coerceToUuidOrDeterministic(txn.id || txn.transaction_number),
      transaction_number: txn.transaction_number,
      employee_id: coerceToUuidOrDeterministic(txn.employee_id),
      employee_name: txn.employee_name,
      customer_id: txn.customer_id ? coerceToUuidOrDeterministic(txn.customer_id) : null,
      customer_name: txn.customer_name || null,
      transaction_date: txn.transaction_date,
      transaction_time: txn.transaction_time,
      subtotal: txn.subtotal,
      discount: txn.discount ?? 0,
      tax: txn.tax,
      total: txn.total,
      payment_method: txn.payment_method,
      amount_paid: txn.amount_paid || null,
      change_given: txn.change_given ?? 0,
      status: txn.status || 'completed',
      notes: txn.notes || null,
      receipt_number: txn.receipt_number || null,
      created_at: txn.created_at || new Date().toISOString(),
      updated_at: txn.updated_at || new Date().toISOString(),
      deleted_at: txn.deleted_at || null
    }));
  }

  // Normalize transaction items data
  private normalizeTransactionItems(items: any[]): any[] {
    return items.map((it) => ({
      id: coerceToUuidOrDeterministic(it.id || `${it.transaction_id}-${it.product_id}-${it.product_sku || ''}-${it.product_name}`),
      transaction_id: coerceToUuidOrDeterministic(it.transaction_id),
      product_id: coerceToUuidOrDeterministic(it.product_id),
      product_name: it.product_name,
      product_sku: it.product_sku,
      category_id: it.category_id ? coerceToUuidOrDeterministic(it.category_id) : null,
      category_name: it.category_name || null,
      quantity: it.quantity,
      unit_price: it.unit_price,
      unit_cost: it.unit_cost ?? 0,
      iva_rate: it.iva_rate ?? 0.23,
      line_total: it.line_total,
      tax_amount: it.tax_amount,
      profit_amount: it.profit_amount ?? 0,
      discount_amount: it.discount_amount ?? 0,
      discount_percentage: it.discount_percentage ?? 0,
      created_at: it.created_at || new Date().toISOString(),
      updated_at: it.updated_at || new Date().toISOString(),
      deleted_at: it.deleted_at || null
    }));
  }

  // Normalize cashier tests data (for direct Supabase insert)
  private normalizeCashierTests(tests: any[]): any[] {
    return tests.map((test) => ({
      id: coerceToUuidOrDeterministic(test.id || `${test.employee_id}-${test.timestamp}-${test.test_type}`),
      employee_id: coerceToUuidOrDeterministic(test.employee_id),
      test_type: test.test_type,
      test_details: test.test_details || {},
      timestamp: test.timestamp || new Date().toISOString(),
      success: test.success !== false,
      error_message: test.error_message || null,
      notes: test.notes || null,
      created_at: test.created_at || new Date().toISOString(),
      updated_at: test.updated_at || new Date().toISOString()
    }));
  }

  // Normalize cash drawer logs data (for direct Supabase insert)
  private normalizeCashDrawerLogs(logs: any[]): any[] {
    return logs.map((log) => ({
      id: coerceToUuidOrDeterministic(log.id || `${log.employee_id}-${log.timestamp}-${log.action}`),
      employee_id: coerceToUuidOrDeterministic(log.employee_id),
      transaction_id: log.transaction_id ? coerceToUuidOrDeterministic(log.transaction_id) : null,
      action: log.action,
      reason: log.reason || null,
      timestamp: log.timestamp || new Date().toISOString(),
      success: log.success !== false,
      error_message: log.error_message || null,
      created_at: log.created_at || new Date().toISOString(),
      updated_at: log.updated_at || new Date().toISOString()
    }));
  }

  // Seed categories into local database (preserving IDs)
  private async seedCategories(categories: LocalCategory[]): Promise<void> {
    await localDb.transaction('rw', [localDb.categories, localDb.categorySyncQueue], async () => {
      for (const category of categories) {
        try {
          const existingCategory = await localDb.categories.get(category.id);
          if (!existingCategory) {
            // Use put() to preserve the deterministic UUID
            await localDb.categories.put(category);
            
            // Queue for sync
            await localDb.categorySyncQueue.add({
              id: generateUUID(),
              type: 'CREATE',
              categoryId: category.id,
              data: category,
              timestamp: new Date(),
              retryCount: 0
            });
            
            console.log(`   ✅ Seeded category: ${category.name} (ID: ${category.id})`);
          } else {
            console.log(`   ⏭️  Category already exists: ${category.name}`);
          }
        } catch (error) {
          console.error(`Failed to seed category ${category.name}:`, error);
        }
      }
    });
  }

  // Seed products into local database (preserving IDs and category relationships)
  private async seedProducts(products: LocalProduct[]): Promise<void> {
    await localDb.transaction('rw', [localDb.products, localDb.productSyncQueue], async () => {
      for (const product of products) {
        try {
          const existingProduct = await localDb.products.get(product.id);
          if (!existingProduct) {
            // Use put() to preserve the deterministic UUID and category_id
            await localDb.products.put(product);
            
            // Queue for sync
            await localDb.productSyncQueue.add({
              id: generateUUID(),
              type: 'CREATE',
              productId: product.id,
              data: product,
              timestamp: new Date(),
              retryCount: 0
            });
            
            console.log(`   ✅ Seeded product: ${product.name} (ID: ${product.id}, Category: ${product.category_id})`);
          } else {
            console.log(`   ⏭️  Product already exists: ${product.name}`);
          }
        } catch (error) {
          console.error(`Failed to seed product ${product.name}:`, error);
        }
      }
    });
  }

  // Seed employees into local database while preserving deterministic IDs and already-normalized credential hashes.
  private async seedEmployees(
    employees: LocalEmployee[],
    options?: { updateExistingCredentials?: boolean }
  ): Promise<void> {
    await localDb.transaction('rw', [localDb.employees], async () => {
      for (const employee of employees) {
        try {
          // Include soft-deleted rows in the lookup so startup seeding does not resurrect a user delete.
          const existing = await localDb.employees
            .where('employee_number')
            .equals(employee.employee_number)
            .first();

          if (!existing) {
            await localDb.employees.put(employee);
            console.log(`   ✅ Seeded employee: ${employee.name} (${employee.employee_number})`);
          } else {
            if (
              options?.updateExistingCredentials &&
              (existing.password_hash !== employee.password_hash || existing.pin !== employee.pin)
            ) {
              await localDb.employees.update(existing.id, {
                password_hash: employee.password_hash,
                pin: employee.pin,
                updated_at: new Date(),
              });
            }
            console.log(`   ⏭️  Employee already exists: ${employee.name}`);
          }
        } catch (error) {
          console.error(`Failed to seed employee ${employee.name}:`, error);
        }
      }
    });
  }

  // Seed customers directly to Supabase
  private async seedCustomers(customers: any[]): Promise<void> {
    if (customers.length === 0) return;

    try {
      const { supabase } = await import('../lib/supabase');
      const { error } = await supabase
        .from('customers')
        .upsert(customers, { onConflict: 'id' });

      if (error) {
        console.error('Failed to seed customers:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error seeding customers:', error);
      throw error;
    }
  }

  // Seed transactions directly to Supabase
  private async seedTransactions(transactions: any[]): Promise<void> {
    if (transactions.length === 0) return;

    try {
      const { supabase } = await import('../lib/supabase');
      const { error } = await supabase
        .from('transactions')
        .upsert(transactions, { onConflict: 'id' });

      if (error) {
        console.error('Failed to seed transactions:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error seeding transactions:', error);
      throw error;
    }
  }

  // Seed transaction items directly to Supabase
  private async seedTransactionItems(items: any[]): Promise<void> {
    if (items.length === 0) return;
    try {
      const { supabase } = await import('../lib/supabase');
      // Fetch product and transaction mappings to ensure FK integrity
      const [productsRes, transactionsRes] = await Promise.all([
        supabase.from('products').select('id, sku, name').limit(5000),
        supabase.from('transactions').select('id, transaction_number').limit(5000)
      ]);

      if (productsRes.error) {
        console.error('Failed to load products for item mapping:', productsRes.error);
        throw productsRes.error;
      }
      if (transactionsRes.error) {
        console.error('Failed to load transactions for item mapping:', transactionsRes.error);
        throw transactionsRes.error;
      }

      const skuToProductId = new Map<string, string>();
      const nameToProductId = new Map<string, string>();
      const existingProductIds = new Set<string>();
      for (const p of productsRes.data || []) {
        existingProductIds.add(p.id);
        if (p.sku) skuToProductId.set(String(p.sku), p.id);
        if (p.name) nameToProductId.set(String(p.name), p.id);
      }

      const txnIdSet = new Set<string>((transactionsRes.data || []).map((t: any) => t.id));
      const txnNumberToId = new Map<string, string>();
      for (const t of transactionsRes.data || []) txnNumberToId.set(String(t.transaction_number), t.id);

      // Create placeholder products for missing SKUs if needed
      const missingSkuSet = new Set<string>();
      for (const raw of items) {
        const hasValidUuidId = typeof raw.product_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.product_id) && existingProductIds.has(raw.product_id);
        if (!hasValidUuidId) {
          if (raw.product_sku && !skuToProductId.has(String(raw.product_sku))) {
            missingSkuSet.add(String(raw.product_sku));
          }
        }
      }

      if (missingSkuSet.size > 0) {
        const placeholders = Array.from(missingSkuSet).map((sku) => {
          // Find first item with this SKU to derive sensible defaults
          const sample = items.find((it) => String(it.product_sku) === sku) || {} as any;
          const id = coerceToUuidOrDeterministic(sku);
          return {
            id,
            name: sample.product_name || sku,
            description: sample.product_name || null,
            sku,
            barcode: null,
            category_id: null,
            category_name: sample.category_name || null,
            price: sample.unit_price || 0,
            cost: sample.unit_cost || 0,
            iva_rate: sample.iva_rate ?? 0.23,
            stock: 100,
            min_stock: 0,
            track_stock: false,
            image_url: null,
            supplier: null,
            location: null,
            is_active: true,
            display_order: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_synced_at: null,
            deleted_at: null
          };
        });

        const { data: createdProducts, error: createProdsErr } = await supabase
          .from('products')
          .upsert(placeholders, { onConflict: 'sku' })
          .select('id, sku');
        if (createProdsErr) {
          console.error('Failed to create placeholder products:', createProdsErr);
          throw createProdsErr;
        }
        for (const p of createdProducts || []) {
          skuToProductId.set(String(p.sku), p.id);
          existingProductIds.add(p.id);
        }
      }

      // Resolve FKs for each item
      const resolvedItems = items.map((raw) => {
        let productId = raw.product_id;
        const idIsUuid = typeof productId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId);
        if (!(idIsUuid && existingProductIds.has(productId))) {
          if (raw.product_sku && skuToProductId.has(String(raw.product_sku))) {
            productId = skuToProductId.get(String(raw.product_sku));
          } else if (raw.product_name && nameToProductId.has(String(raw.product_name))) {
            productId = nameToProductId.get(String(raw.product_name));
          } else {
            // Fallback to deterministic ID from SKU to keep FK valid (should exist after placeholders)
            if (raw.product_sku) productId = skuToProductId.get(String(raw.product_sku)) || coerceToUuidOrDeterministic(raw.product_sku);
          }
        }

        let transactionId = raw.transaction_id;
        const txnIsUuid = typeof transactionId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transactionId);
        if (!(txnIsUuid && txnIdSet.has(transactionId))) {
          if (raw.transaction_number && txnNumberToId.has(String(raw.transaction_number))) {
            transactionId = txnNumberToId.get(String(raw.transaction_number));
          }
        }

        return {
          ...raw,
          product_id: productId,
          transaction_id: transactionId,
        };
      });

      const { error } = await supabase
        .from('transaction_items')
        .upsert(resolvedItems, { onConflict: 'id' });
      if (error) {
        console.error('Failed to seed transaction items:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error seeding transaction items:', error);
      throw error;
    }
  }

  // Seed employees directly to Supabase (preserve deterministic IDs)
  private async seedEmployeesServer(employees: LocalEmployee[]): Promise<void> {
    if (!employees || employees.length === 0) return;
    try {
      const { supabase } = await import('../lib/supabase');
      // Fetch existing employees by employee_number to preserve canonical ids
      const employeeNumbers = employees.map((e) => e.employee_number);
      const { data: existingRows, error: fetchErr } = await supabase
        .from('employees')
        .select('id, employee_number')
        .in('employee_number', employeeNumbers);
      if (fetchErr) {
        console.error('Failed to load existing employees:', fetchErr);
        throw fetchErr;
      }
      const numberToId = new Map<string, string>();
      for (const row of existingRows || []) {
        numberToId.set(row.employee_number, row.id);
      }

      // Build payload ensuring existing rows reuse canonical id
      const payload = employees.map((e) => ({
        id: numberToId.get(e.employee_number) || e.id,
        employee_number: e.employee_number,
        name: e.name,
        email: e.email,
        phone: e.phone,
        password_hash: e.password_hash,
        pin: e.pin,
        role: e.role,
        access_levels: e.access_levels as any,
        is_active: e.is_active,
        hire_date: e.hire_date,
        total_sales: e.total_sales,
        transaction_count: e.transaction_count,
        average_transaction: e.average_transaction,
        hours_worked: e.hours_worked,
        created_at: e.created_at.toISOString(),
        updated_at: e.updated_at.toISOString(),
        last_synced_at: e.last_synced_at ? e.last_synced_at.toISOString() : null,
        needs_push: false,
        is_conflicted: false,
        deleted_at: e.deleted_at ? e.deleted_at.toISOString() : null,
      }));

      const { error } = await supabase
        .from('employees')
        .upsert(payload, { onConflict: 'employee_number' });

      if (error) {
        console.error('Failed to seed employees to Supabase:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error seeding employees to Supabase:', error);
      throw error;
    }
  }

  // Seed cashier tests directly to Supabase
  private async seedCashierTests(tests: any[]): Promise<void> {
    if (tests.length === 0) return;

    try {
      const { supabase } = await import('../lib/supabase');
      const { error } = await supabase
        .from('cashier_tests')
        .upsert(tests, { onConflict: 'id' });

      if (error) {
        console.error('Failed to seed cashier tests:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error seeding cashier tests:', error);
      throw error;
    }
  }

  // Seed cash drawer logs directly to Supabase
  private async seedCashDrawerLogs(logs: any[]): Promise<void> {
    if (logs.length === 0) return;

    try {
      const { supabase } = await import('../lib/supabase');
      const { error } = await supabase
        .from('cash_drawer_logs')
        .upsert(logs, { onConflict: 'id' });

      if (error) {
        console.error('Failed to seed cash drawer logs:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error seeding cash drawer logs:', error);
      throw error;
    }
  }

  // Check if YAML files are available
  async checkYamlFilesAvailable(): Promise<{
    available: string[];
    missing: string[];
  }> {
    const requiredFiles = ['employees.yml', 'categories.yml'];
    const optionalFiles = ['products.yml', 'customers.yml', 'transactions.yml', 'cashier-tests.yml', 'cash-drawer-logs.yml'];
    const allFiles = [...requiredFiles, ...optionalFiles];

    const available: string[] = [];
    const missing: string[] = [];

    for (const filename of allFiles) {
      try {
        const response = await fetch(`/seed/${filename}`);
        if (response.ok) {
          available.push(filename);
        } else {
          missing.push(filename);
        }
      } catch {
        missing.push(filename);
      }
    }

    return { available, missing };
  }
}

// Export singleton instance
export const seedDataService = new SeedDataService();
