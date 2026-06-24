import type { AccessLevel, Employee } from '../types/supabase';
import { isSystemAdministrator } from './systemAdmin';

export const RestrictedAccessLevels = [
  'reports',
  'dashboard',
  'profit_costs',
  'orders',
  'clear_data',
] as const satisfies readonly AccessLevel[];

const restrictedAccessLevelSet = new Set<AccessLevel>(RestrictedAccessLevels);

export function isRestrictedAccessLevel(level: AccessLevel): boolean {
  return restrictedAccessLevelSet.has(level);
}

export function hasEmployeePermission(
  employee: Pick<Employee, 'employee_number' | 'access_levels'> | null | undefined,
  permission: string
): boolean {
  if (!employee) return false;
  if (isSystemAdministrator(employee)) return true;

  const accessLevels = employee.access_levels as string[];
  if (accessLevels.includes(permission)) return true;

  return accessLevels.includes('all') && !restrictedAccessLevelSet.has(permission as AccessLevel);
}
