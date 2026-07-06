// Capability map for PWA human roles (owner/admin/manager), over the existing
// AccessLevels vocabulary (src/types/supabase.ts). Used by hasPermission ONLY for
// principals whose source is 'membership'; the till (source:'employee') path is
// unchanged and still goes through hasEmployeePermission.
//
// owner is the EXPLICIT superset of all 11 real permissions — it replaces the
// isSystemAdministrator "return true" for humans. It is NOT modelled as ['all'],
// because access_levels:['all'] deliberately EXCLUDES the Restricted set
// (reports/dashboard/profit_costs/orders/clear_data) at accessPermissions.ts.
import type { MembershipRole } from '../types/principal';

const OWNER = [
  'sales', 'inventory', 'customers', 'reports', 'dashboard',
  'employees', 'settings', 'transactions', 'profit_costs', 'orders', 'clear_data',
];

export const ROLE_CAPABILITIES: Record<MembershipRole, ReadonlySet<string>> = {
  // owner: everything.
  owner: new Set(OWNER),
  // admin: everything except clear_data (destructive). AT-cert sub-panel stays owner-only
  // via the Settings gate, not here.
  admin: new Set([
    'dashboard', 'reports', 'profit_costs', 'transactions', 'inventory',
    'customers', 'employees', 'orders', 'settings', 'sales',
  ]),
  // manager: reporting + day-to-day, no employee/settings/profit_costs/clear_data.
  manager: new Set(['dashboard', 'reports', 'transactions', 'inventory', 'customers', 'orders', 'sales']),
};

export function humanHasCapability(role: string, permission: string): boolean {
  const caps = ROLE_CAPABILITIES[role as MembershipRole];
  return caps ? caps.has(permission) : false;
}
