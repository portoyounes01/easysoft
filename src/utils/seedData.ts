import { YamlLoader } from './yamlLoader';
import { generateUUID } from './uuid';
import { hashPassword } from './hashUtils';
import { CategoryService, ProductService } from '../services/productService';
import { EmployeeService } from '../services/employeeService';
import { syncManager } from '../services/syncManager';
import { supabase } from '../lib/supabase';
import { localDb } from '../lib/localDatabase';
import { LocalEmployee, LocalCategory, LocalProduct } from '../types/supabase';

// Utility to convert string ID to deterministic UUID
function coerceToUuidOrDeterministic(value: any): string {
  if (!value) return generateUUID();
  const str = String(value);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(str)) return str;
  
  // Generate deterministic UUID from string
  const crypto = window.crypto;
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

export class SeedDataService {
  private categoryService = new CategoryService();
  private productService = new ProductService();
  private employeeService = new EmployeeService();

  // Main seeding function
  async seedFromYaml(): Promise<SeedResult> {
    try {
      console.log('🌱 Starting YAML-based seeding...');

      // Load all YAML files
      const yamlFiles = await YamlLoader.loadMultipleYamlFiles([
        'employees.yml',
        'categories.yml',
        'products.yml',
        'customers.yml',
        'transactions.yml',
        'cashier-tests.yml',
        'cash-drawer-logs.yml'
      ]);

      let employeesCount = 0;
      let categoriesCount = 0;
      let productsCount = 0;
      let customersCount = 0;
      let transactionsCount = 0;
      let cashierTestsCount = 0;
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
        await this.seedEmployees(employees);
        employeesCount = employees.length;
      }

      // 4. Seed Customers (direct to Supabase)
      if (yamlFiles.customers?.customers) {
        console.log('👤 Seeding customers...');
        const customers = this.normalizeCustomers(yamlFiles.customers.customers);
        await this.seedCustomers(customers);
        customersCount = customers.length;
      }

      // 5. Seed Transactions (direct to Supabase)
      if (yamlFiles.transactions?.transactions) {
        console.log('💳 Seeding transactions...');
        const transactions = this.normalizeTransactions(yamlFiles.transactions.transactions);
        await this.seedTransactions(transactions);
        transactionsCount = transactions.length;
      }

      // 6. Seed Cashier Tests (direct to Supabase)
      if (yamlFiles['cashier-tests']?.cashier_tests) {
        console.log('📝 Seeding cashier tests...');
        const cashierTests = this.normalizeCashierTests(yamlFiles['cashier-tests'].cashier_tests);
        await this.seedCashierTests(cashierTests);
        cashierTestsCount = cashierTests.length;
      }

      // 7. Seed Cash Drawer Logs (direct to Supabase)
      if (yamlFiles['cash-drawer-logs']?.cash_drawer_logs) {
        console.log('🗃️ Seeding cash drawer logs...');
        const cashDrawerLogs = this.normalizeCashDrawerLogs(yamlFiles['cash-drawer-logs'].cash_drawer_logs);
        await this.seedCashDrawerLogs(cashDrawerLogs);
        cashDrawerLogsCount = cashDrawerLogs.length;
      }

      // 8. Trigger sync to push local changes to Supabase
      console.log('🔄 Triggering sync to Supabase...');
      await syncManager.fullSync();

      console.log('✅ Seeding completed successfully!');

      return {
        success: true,
        message: 'YAML seeding completed successfully!',
        details: {
          employeesCount,
          categoriesCount,
          productsCount,
          customersCount,
          transactionsCount,
          cashierTestsCount,
          cashDrawerLogsCount
        }
      };

    } catch (error) {
      console.error('❌ Seeding failed:', error);
      return {
        success: false,
        message: `Seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

  // Normalize employees data
  private async normalizeEmployees(employees: any[]): Promise<LocalEmployee[]> {
    const normalizedEmployees: LocalEmployee[] = [];

    for (const emp of employees) {
      // Hash passwords/pins
      let passwordHash: string | null = null;
      let pinHash: string | null = null;

      if (emp.password_hash && !emp.password_hash.startsWith('$2')) {
        // If it's not already hashed, hash it
        passwordHash = await hashPassword(emp.password_hash);
      } else {
        passwordHash = emp.password_hash || null;
      }

      if (emp.pin) {
        pinHash = await hashPassword(emp.pin);
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
    return customers.map((cust) => ({
      id: coerceToUuidOrDeterministic(cust.id || cust.email || cust.name),
      name: cust.name,
      email: cust.email || null,
      phone: cust.phone || null,
      address: cust.address || null,
      total_spent: cust.total_spent ?? 0,
      transaction_count: cust.transaction_count ?? 0,
      loyalty_points: cust.loyalty_points ?? 0,
      is_active: cust.is_active !== false,
      preferred_payment_method: cust.preferred_payment_method || null,
      created_at: cust.created_at || new Date().toISOString(),
      updated_at: cust.updated_at || new Date().toISOString(),
      deleted_at: cust.deleted_at || null
    }));
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

  // Seed employees into local database
  private async seedEmployees(employees: LocalEmployee[]): Promise<void> {
    for (const employee of employees) {
      try {
        // Check if employee already exists
        const existing = await this.employeeService.getEmployeeByNumber(employee.employee_number);
        if (!existing) {
          // Convert LocalEmployee to EmployeeFormData format
          await this.employeeService.createEmployee({
            employee_number: employee.employee_number,
            name: employee.name,
            phone: employee.phone || '',
            role: employee.role as any,
            access_levels: employee.access_levels as any[],
            is_active: employee.is_active,
            hire_date: employee.hire_date,
            password: null, // Don't re-hash if already hashed
            pin: employee.pin || '1234' // Default PIN if not provided
          });
        }
      } catch (error) {
        console.error(`Failed to seed employee ${employee.name}:`, error);
      }
    }
  }

  // Seed customers directly to Supabase
  private async seedCustomers(customers: any[]): Promise<void> {
    if (customers.length === 0) return;

    try {
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

  // Seed cashier tests directly to Supabase
  private async seedCashierTests(tests: any[]): Promise<void> {
    if (tests.length === 0) return;

    try {
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
