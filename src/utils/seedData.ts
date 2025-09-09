import { YamlLoader } from './yamlLoader';
import { generateUUID } from './uuid';
import { hashPassword } from './hashUtils';
import { CategoryService, ProductService } from '../services/productService';
import { EmployeeService } from '../services/employeeService';
import { syncManager } from '../services/syncManager';
import { LocalEmployee, LocalCategory } from '../types/supabase';

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
    cashierTestsCount: number;
    cashDrawerLogsCount: number;
  };
}

export class SeedDataService {
  private categoryService = new CategoryService();
  private employeeService = new EmployeeService();

  // Main seeding function
  async seedFromYaml(): Promise<SeedResult> {
    try {
      console.log('🌱 Starting YAML-based seeding...');

      // Load all YAML files
      const yamlFiles = await YamlLoader.loadMultipleYamlFiles([
        'employees.yml',
        'categories.yml',
        'cashier-tests.yml',
        'cash-drawer-logs.yml'
      ]);

      let employeesCount = 0;
      let categoriesCount = 0;
      let cashierTestsCount = 0;
      let cashDrawerLogsCount = 0;

      // 1. Seed Categories first (products depend on them)
      if (yamlFiles.categories?.categories) {
        console.log('📂 Seeding categories...');
        const categories = this.normalizeCategories(yamlFiles.categories.categories);
        await this.seedCategories(categories);
        categoriesCount = categories.length;
      }

      // 2. Seed Employees
      if (yamlFiles.employees?.employees) {
        console.log('👥 Seeding employees...');
        const employees = await this.normalizeEmployees(yamlFiles.employees.employees);
        await this.seedEmployees(employees);
        employeesCount = employees.length;
      }

      // 3. Handle optional test data (for now, we'll just count them)
      if (yamlFiles['cashier-tests']?.cashier_tests) {
        cashierTestsCount = yamlFiles['cashier-tests'].cashier_tests.length;
        console.log(`📝 Found ${cashierTestsCount} cashier tests (not implemented yet)`);
      }

      if (yamlFiles['cash-drawer-logs']?.cash_drawer_logs) {
        cashDrawerLogsCount = yamlFiles['cash-drawer-logs'].cash_drawer_logs.length;
        console.log(`🗃️ Found ${cashDrawerLogsCount} cash drawer logs (not implemented yet)`);
      }

      // 4. Trigger sync to push to Supabase
      console.log('🔄 Triggering sync to Supabase...');
      await syncManager.fullSync();

      console.log('✅ Seeding completed successfully!');

      return {
        success: true,
        message: 'YAML seeding completed successfully!',
        details: {
          employeesCount,
          categoriesCount,
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

  // Seed categories into local database
  private async seedCategories(categories: LocalCategory[]): Promise<void> {
    for (const category of categories) {
      try {
        // Use the category service's bulk insert method if available,
        // or create each category individually
        const existingCategory = await this.categoryService.getCategoryById(category.id);
        if (!existingCategory) {
          await this.categoryService.createCategory({
            name: category.name,
            description: category.description,
            color: category.color,
            icon: category.icon,
            display_order: category.display_order,
            is_active: category.is_active,
            deleted_at: category.deleted_at
          });
        }
      } catch (error) {
        console.error(`Failed to seed category ${category.name}:`, error);
      }
    }
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

  // Check if YAML files are available
  async checkYamlFilesAvailable(): Promise<{
    available: string[];
    missing: string[];
  }> {
    const requiredFiles = ['employees.yml', 'categories.yml'];
    const optionalFiles = ['cashier-tests.yml', 'cash-drawer-logs.yml'];
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
