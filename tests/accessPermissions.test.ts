import { describe, expect, it } from 'vitest';
import { hasEmployeePermission } from '../src/utils/accessPermissions';

describe('hasEmployeePermission', () => {
  it('gives the configured system administrator unconditional access', () => {
    expect(
      hasEmployeePermission(
        { employee_number: 'SYS001', access_levels: [] },
        'clear_data'
      )
    ).toBe(true);
  });

  it('does not let legacy all-access grant restricted permissions', () => {
    const employee = {
      employee_number: 'ADM001',
      access_levels: ['all'],
    };

    expect(hasEmployeePermission(employee, 'customers')).toBe(true);
    expect(hasEmployeePermission(employee, 'reports')).toBe(false);
    expect(hasEmployeePermission(employee, 'dashboard')).toBe(false);
    expect(hasEmployeePermission(employee, 'profit_costs')).toBe(false);
    expect(hasEmployeePermission(employee, 'orders')).toBe(false);
    expect(hasEmployeePermission(employee, 'clear_data')).toBe(false);
  });

  it('grants restricted permissions only when explicitly assigned', () => {
    const employee = {
      employee_number: 'ADM001',
      access_levels: ['all', 'reports', 'orders', 'clear_data'],
    };

    expect(hasEmployeePermission(employee, 'reports')).toBe(true);
    expect(hasEmployeePermission(employee, 'orders')).toBe(true);
    expect(hasEmployeePermission(employee, 'clear_data')).toBe(true);
    expect(hasEmployeePermission(employee, 'profit_costs')).toBe(false);
  });
});
